"""Retain the engine and locked Rust dependencies' distribution notices."""
import json
import hashlib
from pathlib import Path
from common import ROOT, output, write_json

RULE = "=" * 78
HEADER = ("Licenses and notices of the locked Rust dependencies distributed with Providence.\n"
          "Each section reproduces one crate's notice file in full; rust-dependencies.json\n"
          "lists every crate with its license expression and source.\n\n")


def install_notices(runtime, godot):
    destination = runtime / "third-party"
    engine = output([godot, "--headless", "--script", ROOT / "tools/release/notices.gd"])
    details = next(json.loads(line) for line in engine.splitlines() if line.startswith('{"'))
    write_json(destination / "godot-notices.json", details)
    install_rust_notices(runtime)


def install_rust_notices(runtime):
    """Reproduce every locked crate's notice files in full in one text file."""
    destination = runtime / "third-party"
    destination.mkdir(parents=True, exist_ok=True)
    metadata = json.loads(output(["cargo", "metadata", "--locked", "--format-version", "1"]))
    dependencies = []
    sections = []
    for package in sorted(metadata["packages"], key=lambda package: (package["name"], package["version"])):
        if not package["source"]: continue
        root = Path(package["manifest_path"]).parent
        notices = sorted((path for path in root.iterdir() if path.is_file()
                          and path.name.upper().startswith(("LICENSE", "COPYING", "NOTICE", "AUTHORS"))),
                         key=lambda path: path.name)
        if not notices and package["name"] == "rmcp":
            notices = sdk_notices(package)
        if not notices: continue
        source = f"https://crates.io/crates/{package['name']}/{package['version']}"
        for path in notices:
            text = path.read_bytes().decode("utf-8").replace("\r\n", "\n").rstrip("\n")
            title = f"{package['name']} {package['version']}: {path.name}"
            sections.append(f"{RULE}\n{title}\n{source}\n{RULE}\n\n{text}\n")
        dependencies.append({"name": package["name"], "version": package["version"],
            "license": package["license"], "repository": package["repository"],
            "source": source, "notices": [path.name for path in notices]})
    (destination / "rust-licenses.txt").write_text(HEADER + "\n".join(sections), encoding="utf-8", newline="\n")
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
