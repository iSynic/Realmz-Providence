"""Exercise AP activation in an isolated native editor; retain bounded receipts."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser()
    for name in ["godot", "adapter", "cli", "output", "source-project"]:
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--native", action="store_true")
    args = parser.parse_args()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    source = Path(args.source_project).resolve()
    manifest = source / "project.providence.json"
    before = hashlib.sha256(manifest.read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory(prefix="activation-project-", dir=output) as work:
        initial = Path(work) / "initial"
        initial.mkdir()
        shutil.copyfile(manifest, initial / manifest.name)
        shutil.copytree(source / "blobs", initial / "blobs")
        env = os.environ.copy()
        env.update(PROVIDENCE_ADAPTER_PATH=str(Path(args.adapter).resolve()),
                   PROVIDENCE_CLI_PATH=str(Path(args.cli).resolve()),
                   PROVIDENCE_PROJECT_PATH=str(initial),
                   PROVIDENCE_ACTIVATION_SAVE=str(Path(work) / "saved"))
        command = [args.godot]
        if args.native:
            captures = output / "review-frames"
            captures.mkdir(exist_ok=True)
            env["PROVIDENCE_CONTEXT_CAPTURE_ROOT"] = str(captures)
            command += ["--rendering-method", "gl_compatibility"]
        else:
            command += ["--headless"]
        command += ["--path", "godot", "--script", "res://tools/validate_ap_activation.gd"]
        result = subprocess.run(command, env=env, capture_output=True, text=True, timeout=180)
        log = result.stdout + result.stderr
        (output / "activation-tests.log").write_text(log, encoding="utf-8")
        unchanged = hashlib.sha256(manifest.read_bytes()).hexdigest() == before
        (output / "source-receipt.json").write_text(json.dumps({
            "source": str(source), "manifestSha256": before,
            "sourceManifestUnchanged": unchanged,
            "disposableCopy": True, "exitCode": result.returncode,
        }, indent=2) + "\n", encoding="utf-8")
        if result.returncode or "ERROR:" in log or "PROVIDENCE_AP_ACTIVATION_OK" not in log or not unchanged:
            print(log[-9000:])
            raise SystemExit(1)
        print(log.strip())


if __name__ == "__main__":
    main()
