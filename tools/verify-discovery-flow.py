"""Exercise the native flow window with a real adapter in a disposable project."""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import tempfile

from adapter_test_client import Adapter
from verify_discovery_adapter import populate, populate_paging, step

ROOT = Path(__file__).resolve().parents[1]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--godot", required=True)
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--capture-root", type=Path)
    parser.add_argument("--size", default="1600x900")
    parser.add_argument("--dense", action="store_true")
    args = parser.parse_args()
    adapter = args.runtime / "providence-native-adapter.exe"
    with tempfile.TemporaryDirectory(prefix="providence-native-flow-") as temporary:
        project = Path(temporary) / "project"
        print(f"Disposable native flow job: {temporary}; removed on success and failure.", flush=True)
        subprocess.run([str(args.runtime / "providence-cli.exe"), "project-new", "native-flow", str(project)],
                       check=True, capture_output=True, timeout=60)
        client = Adapter(adapter, project)
        try:
            populate(client)
            client.request("encounter.create-simple")
            step(client, "extra-action-point:12", 2, 4, 0)
            step(client, "extra-action-point:40", 1, 1, 349)
            step(client, "extra-action-point:40", 2, 39, 995)
            if args.dense: populate_paging(client)
            client.request("project.save")
        finally:
            client.close()
        environment = os.environ.copy()
        environment["PROVIDENCE_ADAPTER_PATH"] = str(adapter)
        environment["PROVIDENCE_DISCOVERY_PROJECT"] = str(project)
        environment["PROVIDENCE_FLOW_CAPTURE_ROOT"] = ""
        environment["PROVIDENCE_FLOW_DENSE"] = "1" if args.dense else ""
        if args.capture_root:
            args.capture_root.mkdir(parents=True, exist_ok=True)
            environment["PROVIDENCE_FLOW_CAPTURE_ROOT"] = str(args.capture_root.resolve())
        command = [args.godot, "--path", str(ROOT / "godot"), "--resolution", args.size,
                   "--script", "res://tools/validate_discovery_flow.gd", "--quit-after", "3600"]
        if not args.capture_root: command.append("--headless")
        result = subprocess.run([sys.executable, str(ROOT / "tools/run-godot-workflow.py"),
                                 "--timeout", "120", *command], env=environment,
                                text=True, encoding="utf-8", capture_output=True, timeout=150)
        combined = result.stdout + result.stderr
        print(combined, flush=True)
        if args.capture_root:
            (args.capture_root / f"workflow-{args.size}.log").write_text(combined, encoding="utf-8")
        if result.returncode or "SCRIPT ERROR" in combined or "Unicode parsing error" in combined or "PROVIDENCE_FLOW_NATIVE_OK" not in combined:
            raise RuntimeError("Native flow verification failed")


if __name__ == "__main__":
    main()
