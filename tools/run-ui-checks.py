"""Run the manifest-owned UI checks in parallel, each with its own temp and user data.

`tools/ui-checks.json` is the single list of UI checks. Every check runs in its own
process with private TEMP/TMP and Godot `user://` roots, so independent checks can
share the machine without sharing demo projects, settings or fixed temp names.
Exclusive checks (such as the editor import that writes `.godot/`) run alone first;
solo checks, whose frame-timed waits are unreliable under load, run alone last.
A check passes on exit code 0, an absent `forbid` pattern and a present `marker`
(both case-insensitive, matching the PowerShell checks they replace). A check that
passes only on retry is reported as flaky and does not fail the run.
"""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "tools" / "ui-checks.json"
DURATIONS = ROOT / "artifacts" / "ui-checks" / "durations.json"
ROUTE_DENOMINATOR = 46


def load_manifest(path=MANIFEST):
    manifest = json.loads(path.read_text(encoding="utf-8"))
    for index, check in enumerate(manifest["checks"]):
        check["index"] = index
    ids = [check["id"] for check in manifest["checks"]]
    duplicates = sorted({identity for identity in ids if ids.count(identity) > 1})
    if duplicates:
        raise SystemExit(f"duplicate UI check ids: {', '.join(duplicates)}")
    return manifest


def script_file(name):
    for folder in (ROOT / "tools", ROOT / "godot" / "tools"):
        if (folder / name).is_file():
            return folder / name
    return None


def scheduled_validators(manifest):
    """Validators reachable from the manifest, the lanes and CI, following the scripts they run.

    A script that builds names such as `validate_map_paint_$Check` schedules each
    existing validator whose suffix appears as a quoted word in that script.
    """
    validators = {path.stem for path in ROOT.glob("godot/tools/validate_*.gd")}
    entry_points = [ROOT / "tools" / "verify.ps1", *ROOT.glob(".github/workflows/*.yml")]
    pending = [json.dumps(manifest["checks"]), *(path.read_text(encoding="utf-8") for path in entry_points)]
    seen, found = {"verify.ps1"}, set()
    while pending:
        text = pending.pop()
        found.update(name for name in re.findall(r"\bvalidate_\w+", text) if name in validators)
        words = set(re.findall(r"['\"]([A-Za-z0-9_]+)['\"]", text))
        for prefix in re.findall(r"\bvalidate_(\w*?)(?:\$|\{|%s)", text):
            found.update(f"validate_{prefix}{word}" for word in words if f"validate_{prefix}{word}" in validators)
        for name in set(re.findall(r"[\w.-]+\.(?:ps1|py|gd)\b", text)) - seen:
            seen.add(name)
            path = script_file(name)
            if path is not None:
                pending.append(path.read_text(encoding="utf-8", errors="replace"))
    return found


def check_manifest(manifest):
    """Every validator must be scheduled by a check or explicitly listed as unscheduled."""
    scheduled = scheduled_validators(manifest)
    unscheduled = manifest.get("unscheduled", {})
    problems = []
    for validator in sorted(ROOT.glob("godot/tools/validate_*.gd")):
        name = validator.stem
        if name in unscheduled:
            if name in scheduled:
                problems.append(f"{name} is listed as unscheduled but a check now runs it")
        elif name not in scheduled:
            problems.append(f"{name} is not run by any UI check; schedule it or list it under 'unscheduled' with a reason")
    for name in unscheduled:
        if not (ROOT / "godot" / "tools" / f"{name}.gd").exists():
            problems.append(f"unscheduled validator {name} no longer exists")
    return problems


def command_for(check, context):
    if "godot" in check:
        argv = ["{godot}", "--headless", "--path", "{project}", "--script", check["godot"], *check.get("godotArgs", [])]
        if "userArgs" in check:
            argv += ["--", *check["userArgs"]]
    else:
        argv = list(check["command"])
    return [part.format(**context) for part in argv]


def isolated_environment(work):
    environment = dict(os.environ)
    # Short names: checks build deep fixture paths and Windows still enforces MAX_PATH.
    temp = work / "t"
    user_data = work / "u"
    temp.mkdir(parents=True)
    user_data.mkdir()
    for name in ("TEMP", "TMP", "TMPDIR"):
        environment[name] = str(temp)
    # Godot resolves user:// under APPDATA on Windows and XDG_DATA_HOME elsewhere.
    environment["APPDATA"] = str(user_data)
    environment["XDG_DATA_HOME"] = str(user_data)
    environment["XDG_CONFIG_HOME"] = str(user_data / "config")
    return environment, temp


def post_check(name, output):
    if name != "route-destinations":
        return f"unknown post-check {name}"
    match = re.search(r"(?m)^PROVIDENCE_ROUTE_DESTINATIONS (\{[^\r\n]+\})", output)
    if not match:
        return "UI smoke omitted actual destination coverage"
    destinations = json.loads(match.group(1))
    unavailable = len(destinations.get("unavailableRoutes", []))
    if destinations.get("invalidDestinations") or destinations.get("mappedRoutes", 0) + unavailable != ROUTE_DENOMINATOR:
        return f"route destinations are invalid or changed the {ROUTE_DENOMINATOR}-route denominator"
    return None


def stop_tree(process):
    if os.name == "nt":
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(process.pid)], capture_output=True)
    else:
        os.killpg(process.pid, signal.SIGKILL)


def attempt(check, context, work, timeout):
    environment, temp = isolated_environment(work)
    argv = command_for(check, {**context, "temp": str(temp)})
    log = work / "output.log"
    started = time.monotonic()
    with log.open("wb") as handle:
        process = subprocess.Popen(
            argv, cwd=ROOT, env=environment, stdout=handle, stderr=subprocess.STDOUT,
            start_new_session=os.name != "nt",
        )
        try:
            code = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            stop_tree(process)
            process.wait()
            return f"timed out after {timeout}s", time.monotonic() - started
    output = log.read_text(encoding="utf-8", errors="replace")
    elapsed = time.monotonic() - started
    if code != 0:
        return f"exit code {code}", elapsed
    if check.get("forbid") and re.search(check["forbid"], output, re.IGNORECASE):
        return f"output matched forbidden pattern {check['forbid']!r}", elapsed
    if check.get("marker") and not re.search(check["marker"], output, re.IGNORECASE):
        return f"output lacked marker {check['marker']!r}", elapsed
    if check.get("postCheck"):
        return post_check(check["postCheck"], output), elapsed
    return None, elapsed


def run_check(check, context, run_root, retries, timeout_default):
    attempts = []
    folder = run_root / str(check["index"])
    for number in range(1, retries + 2):
        work = folder / str(number)
        failure, elapsed = attempt(check, context, work, check.get("timeoutSeconds", timeout_default))
        attempts.append({"failure": failure, "seconds": round(elapsed, 1), "log": str(work / "output.log")})
        if failure is None:
            break
    passed = attempts[-1]["failure"] is None
    status = ("flaky" if len(attempts) > 1 else "passed") if passed else "failed"
    if passed:
        shutil.rmtree(folder, ignore_errors=True)
    return {"id": check["id"], "status": status, "attempts": attempts}


def select(manifest, tier, groups, only):
    checks = [check for check in manifest["checks"] if tier in check.get("tiers", ["full"])]
    if groups:
        checks = [check for check in checks if check["group"] in groups]
    if only:
        unknown = set(only) - {check["id"] for check in manifest["checks"]}
        if unknown:
            raise SystemExit(f"unknown UI check ids: {', '.join(sorted(unknown))}")
        checks = [check for check in manifest["checks"] if check["id"] in only]
    return checks


def known_durations():
    try:
        return json.loads(DURATIONS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def record_durations(results):
    durations = known_durations()
    for result in results:
        if result["status"] == "passed":
            durations[result["id"]] = result["attempts"][-1]["seconds"]
    DURATIONS.parent.mkdir(parents=True, exist_ok=True)
    DURATIONS.write_text(json.dumps(durations, indent=1, sort_keys=True) + "\n", encoding="utf-8")


def report(result, lock):
    last = result["attempts"][-1]
    line = f"{result['status'].upper():7} {result['id']} ({last['seconds']}s)"
    if result["status"] != "passed":
        line += "".join(f"\n        attempt {n}: {a['failure'] or 'passed'}; log {a['log']}" for n, a in enumerate(result["attempts"], 1))
    with lock:
        print(line, flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--tier", default="full", help="smoke, full or native")
    parser.add_argument("--group", action="append", default=[], help="limit to a manifest group; repeatable")
    parser.add_argument("--only", nargs="+", default=[], help="run these check ids regardless of tier")
    parser.add_argument("--repeat", type=int, default=1, help="run each selected check this many times, to expose flakiness")
    parser.add_argument("--godot")
    parser.add_argument("--adapter", default=os.environ.get("PROVIDENCE_ADAPTER_PATH"))
    parser.add_argument("--cli", default=os.environ.get("PROVIDENCE_CLI_PATH"))
    parser.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) // 2))
    parser.add_argument("--retries", type=int, default=1)
    parser.add_argument("--timeout", type=int, default=900, help="default per-check seconds")
    parser.add_argument("--check-manifest", action="store_true", help="only verify every validator is scheduled")
    arguments = parser.parse_args()

    manifest = load_manifest()
    # The fast lane enforces the manifest. A run only executes checks, so it also works
    # in the public source snapshot, which omits the private scripts the guard follows.
    if arguments.check_manifest:
        problems = check_manifest(manifest)
        for problem in problems:
            print(f"UI check manifest: {problem}", file=sys.stderr)
        if not problems:
            print(f"UI check manifest: {len(manifest['checks'])} checks; {len(manifest.get('unscheduled', {}))} validators explicitly unscheduled")
        return 1 if problems else 0
    if not (arguments.godot and arguments.adapter and arguments.cli):
        parser.error("--godot, --adapter and --cli (or PROVIDENCE_ADAPTER_PATH/PROVIDENCE_CLI_PATH) are required")

    adapter = Path(arguments.adapter).resolve()
    context = {
        "godot": arguments.godot, "adapter": str(adapter), "cli": str(Path(arguments.cli).resolve()),
        "adapter_dir": str(adapter.parent), "mcp": str(adapter.with_name("providence-mcp" + adapter.suffix)),
        "project": str(ROOT / "godot"), "repo": str(ROOT), "tools": str(ROOT / "tools"), "python": sys.executable,
        "powershell": "powershell" if os.name == "nt" else "pwsh",
        "library": os.environ.get("PROVIDENCE_APPLICATION_LIBRARY_ROOT", ""),
    }
    # Nested scripts that resolve Godot themselves use the same executable.
    os.environ["PROVIDENCE_GODOT_PATH"] = arguments.godot
    os.environ["PROVIDENCE_ADAPTER_PATH"] = context["adapter"]
    os.environ["PROVIDENCE_CLI_PATH"] = context["cli"]

    checks = select(manifest, arguments.tier, arguments.group, arguments.only)
    if arguments.repeat > 1:
        checks = [{**check, "id": f"{check['id']}#{n}", "index": f"{check['index']}-{n}"}
                  for check in checks for n in range(1, arguments.repeat + 1)]
    durations = known_durations()
    exclusive = [check for check in checks if check.get("exclusive")]
    solo = [check for check in checks if check.get("solo") and not check.get("exclusive")]
    parallel = sorted((check for check in checks if not check.get("exclusive") and not check.get("solo")),
                      key=lambda c: -durations.get(c["id"], 60))
    run_root = Path(tempfile.mkdtemp(prefix="pu"))
    print(f"UI checks: {len(checks)} ({arguments.tier}) with {arguments.jobs} workers; run root {run_root}", flush=True)
    started = time.monotonic()
    lock = threading.Lock()
    results = []
    for check in exclusive:
        results.append(run_check(check, context, run_root, arguments.retries, arguments.timeout))
        report(results[-1], lock)
    # Exclusive checks prepare shared state such as the import cache; when one fails,
    # the remaining checks would only wait out their timeouts.
    if any(result["status"] == "failed" for result in results):
        print(f"UI checks: stopped after a failed exclusive check; logs retained under {run_root}", flush=True)
        return 1
    with concurrent.futures.ThreadPoolExecutor(max_workers=arguments.jobs) as pool:
        futures = [pool.submit(run_check, check, context, run_root, arguments.retries, arguments.timeout) for check in parallel]
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
            report(results[-1], lock)
    for check in solo:
        results.append(run_check(check, context, run_root, arguments.retries, arguments.timeout))
        report(results[-1], lock)
    if arguments.repeat == 1:
        record_durations(results)
    failed = [result["id"] for result in results if result["status"] == "failed"]
    flaky = [result["id"] for result in results if result["status"] == "flaky"]
    (run_root / "results.json").write_text(json.dumps(results, indent=1) + "\n", encoding="utf-8")
    print(f"UI checks: {len(results) - len(failed)}/{len(results)} passed in {time.monotonic() - started:.0f}s"
          + (f"; flaky: {', '.join(sorted(flaky))}" if flaky else "")
          + (f"; FAILED: {', '.join(sorted(failed))}" if failed else ""), flush=True)
    if failed:
        print(f"Failure logs and results.json retained under {run_root}", flush=True)
        return 1
    shutil.rmtree(run_root, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
