"""Exercise catalog navigation with real bounded adapter reads and disposable authored data."""
import argparse
import os
from pathlib import Path
import re
import subprocess
import tempfile

from adapter_test_client import Adapter


def populate(adapter):
    adapter.request("map.create", {"levelType": "land"})
    for index in range(60):
        adapter.request("action-point.create", {"mapIdentity": "land:0", "x": index, "y": 5})
    for index in range(150):
        adapter.request("extra-action-point.create", {"nativeId": index})
        allocation = adapter.request("battle.allocate")["allocation"]
        adapter.request("battle.draft.apply", {"battle": allocation["battle"], "creation": True})
    for index in range(60):
        adapter.request("monster.create", {"setId": 0, "nativeId": index + 1})
    adapter.request("treasure.create", {"nativeId": 0})
    adapter.request("shop.create", {"nativeId": 0})
    adapter.request("project.save")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--godot", required=True)
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--capture", action="store_true")
    args = parser.parse_args()
    workspace = Path(__file__).resolve().parent.parent
    args.output_root.mkdir(parents=True, exist_ok=True)
    environment = {key: value for key, value in os.environ.items() if not key.startswith("PROVIDENCE_")}
    environment.update(PROVIDENCE_ADAPTER_PATH=str(args.bundle / "providence-native-adapter.exe"),
                       PROVIDENCE_CLI_PATH=str(args.bundle / "providence-cli.exe"),
                       PROVIDENCE_APPLICATION_LIBRARY_ROOT=str(args.bundle / "reference-libraries/realmz-classic"),
                       PROVIDENCE_CLASSIC_APPLICATION_DATA_ROOT=str(args.bundle / "Realmz Data"))
    with tempfile.TemporaryDirectory(prefix="record-browsing-", dir=args.output_root) as temporary:
        project = Path(temporary) / "project"
        subprocess.run([environment["PROVIDENCE_CLI_PATH"], "project-new", "record-browsing", str(project)],
                       check=True, capture_output=True, timeout=60)
        adapter = Adapter(environment["PROVIDENCE_ADAPTER_PATH"], project, environment["PROVIDENCE_APPLICATION_LIBRARY_ROOT"])
        try:
            populate(adapter)
        finally:
            adapter.close()
        environment["PROVIDENCE_BROWSING_PROJECT"] = str(project)
        if args.capture:
            environment["PROVIDENCE_BROWSING_CAPTURES"] = str(args.output_root / "captures")
        command = [args.godot, "--path", str(workspace / "godot"), "--script", "res://tools/validate_catalog_navigation.gd"]
        if not args.capture: command.insert(1, "--headless")
        result = subprocess.run(command, env=environment, capture_output=True, text=True, encoding="utf-8", timeout=180)
        output = result.stdout + result.stderr
        (args.output_root / "catalog-navigation.log").write_text(output, encoding="utf-8")
        print(output[-12000:])
        assert result.returncode == 0 and "PROVIDENCE_CATALOG_NAVIGATION_OK" in output, result.returncode
        assert not re.search(r"SCRIPT ERROR:|(?:^|\n)ERROR:", output)


if __name__ == "__main__":
    main()
