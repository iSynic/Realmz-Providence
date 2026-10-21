"""Run one Items native check with a path-owned disposable project."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import runpy
import re


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("godot")
    parser.add_argument("--script", default="res://tools/item_authoring_journey.gd")
    parser.add_argument("--receipt", default="journey-latest.json")
    parser.add_argument("--source", type=Path)
    args = parser.parse_args()
    workspace = Path(__file__).resolve().parent.parent
    evidence = workspace / "artifacts/item-authoring-native-development"
    temporary_root = evidence / "tmp"
    temporary_root.mkdir(parents=True, exist_ok=True)
    environment = os.environ.copy()
    environment.pop("PROVIDENCE_PROJECT_PATH", None)
    environment["PROVIDENCE_CLASSIC_APPLICATION_DATA_ROOT"] = str(workspace / "godot/bundled/realmz-reference")
    with tempfile.TemporaryDirectory(prefix="item-check-", dir=temporary_root) as temporary:
        assert Path(temporary).resolve().is_relative_to(temporary_root.resolve())
        destination = temporary
        if args.source:
            if not (args.source / "assets-corpus-disposable.marker").is_file():
                raise ValueError("Expected a marked disposable import")
            adapter_class = runpy.run_path(str(workspace / "tools/verify-monster-authoring-compat.py"))["Adapter"]
            adapter = adapter_class(Path(environment["PROVIDENCE_ADAPTER_PATH"]), args.source,
                                    Path(environment["PROVIDENCE_APPLICATION_LIBRARY_ROOT"]))
            try:
                destination = adapter.request("project.save-as", {"path": str(Path(temporary) / "project")})["projectPath"]
                (Path(destination) / "assets-corpus-disposable.marker").write_text("Owned temporary native check\n", encoding="utf-8")
            finally:
                adapter.close()
        command = [args.godot, "--headless", "--path", str(workspace / "godot"),
                   "--script", args.script, "--", destination]
        result = subprocess.run(command, env=environment, capture_output=True,
                                text=True, encoding="utf-8", timeout=90)
        output = result.stdout + result.stderr
        print(output[-12000:])
        print("Exit code:", result.returncode)
        code = result.returncode or int(bool(re.search(r"SCRIPT ERROR:|(?:^|\n)ERROR:|WARNING:", output)))
        receipt = {"exitCode": code, "processExitCode": result.returncode, "output": output, "script": args.script,
                   "temporaryRoot": temporary, "retention": "Disposable project removed on completion."}
        (evidence / args.receipt).write_text(json.dumps(receipt, indent=2), encoding="utf-8")
        return code


if __name__ == "__main__":
    raise SystemExit(main())
