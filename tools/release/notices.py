"""Retain the engine and locked Rust dependencies' distribution notices."""
import json
from pathlib import Path
import shutil
from common import ROOT, output, write_json


def install_notices(runtime, godot):
    destination = runtime / "third-party"
    engine = output([godot, "--headless", "--script", ROOT / "tools/release/notices.gd"])
    details = next(json.loads(line) for line in engine.splitlines() if line.startswith('{"'))
    write_json(destination / "godot-notices.json", details)
    metadata = json.loads(output(["cargo", "metadata", "--locked", "--format-version", "1"]))
    dependencies = []
    for package in metadata["packages"]:
        if not package["source"]: continue
        root = Path(package["manifest_path"]).parent
        notices = [path for path in root.iterdir() if path.is_file()
                   and path.name.upper().startswith(("LICENSE", "COPYING", "NOTICE", "AUTHORS"))]
        if not notices: continue
        folder = destination / "rust" / f"{package['name']}-{package['version']}"
        folder.mkdir(parents=True)
        for path in notices: shutil.copy2(path, folder / path.name)
        dependencies.append({"name": package["name"], "version": package["version"],
            "license": package["license"], "repository": package["repository"],
            "source": f"https://crates.io/crates/{package['name']}/{package['version']}",
            "notices": [path.name for path in notices]})
    write_json(destination / "rust-dependencies.json", dependencies)
