"""Retain the engine and locked Rust dependencies' distribution notices."""
import json
import hashlib
from pathlib import Path
import shutil
from common import ROOT, output, write_json


def install_notices(runtime, godot):
    destination = runtime / "third-party"
    engine = output([godot, "--headless", "--script", ROOT / "tools/release/notices.gd"])
    details = next(json.loads(line) for line in engine.splitlines() if line.startswith('{"'))
    write_json(destination / "godot-notices.json", details)
    install_rust_notices(runtime)


def install_rust_notices(runtime):
    destination = runtime / "third-party"
    metadata = json.loads(output(["cargo", "metadata", "--locked", "--format-version", "1"]))
    dependencies = []
    for package in metadata["packages"]:
        if not package["source"]: continue
        root = Path(package["manifest_path"]).parent
        notices = [path for path in root.iterdir() if path.is_file()
                   and path.name.upper().startswith(("LICENSE", "COPYING", "NOTICE", "AUTHORS"))]
        if not notices and package["name"] == "rmcp":
            notices = sdk_notices(package)
        if not notices: continue
        folder = destination / "rust" / f"{package['name']}-{package['version']}"
        folder.mkdir(parents=True, exist_ok=True)
        for path in notices: shutil.copy2(path, folder / path.name)
        dependencies.append({"name": package["name"], "version": package["version"],
            "license": package["license"], "repository": package["repository"],
            "source": f"https://crates.io/crates/{package['name']}/{package['version']}",
            "notices": [path.name for path in notices]})
    write_json(destination / "rust-dependencies.json", dependencies)


def sdk_notices(package):
    root = ROOT / "support/mcp/sdk"
    provenance = json.loads((root / "provenance.json").read_text(encoding="utf-8"))
    license_file = root / "LICENSE-APACHE"
    if (provenance["version"] != package["version"] or
            provenance["sha256"] != hashlib.sha256(license_file.read_bytes()).hexdigest()):
        raise ValueError("The locked MCP SDK differs from its retained license provenance")
    return [license_file, root / "provenance.json"]


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--rust-only", type=Path, required=True)
    install_rust_notices(parser.parse_args().rust_only)
