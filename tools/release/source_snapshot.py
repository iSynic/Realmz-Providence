"""Export an allowlisted public source snapshot without private Git history."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

DIRECTORIES = ["crates", "contracts", "vendor", "godot/src", "godot/theme", "godot/branding",
               "godot/data", "godot/bundled", "godot/tools", "support/rebuilt", "docs/screenshots", "docs/public",
               "tools/release", "support/mcp", "LICENSES"]
FILES = [".gitattributes", "Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "README.md", "LICENSE", "LICENSE-REALMZ.txt",
         "NOTICE", "SOURCE-LICENSE.md", "THIRD_PARTY_NOTICES.md", "REUSE.toml", "CHANGELOG.md", "ROADMAP.md",
         ".github/ISSUE_TEMPLATE/bug_report.yml", ".github/ISSUE_TEMPLATE/feature_request.yml", ".github/ISSUE_TEMPLATE/config.yml",
         "godot/project.godot", "godot/export_presets.cfg", "artwork/application-icon/Theldrow-REALMZ-NONCOMMERCIAL.txt",
         "tools/music-preview-runtime.json", ".github/workflows/native-release.yml", "deny.toml",
         # The CI smoke tier: its runner, manifest and the scripts its checks call.
         "tools/run-ui-checks.py", "tools/ui-checks.json", "tools/verification-process.ps1",
         "tools/verify-display-scaling.ps1", "tools/verify-map-paint.ps1", "tools/verify-mcp.ps1",
         "tools/run-item-native-check.py", "tools/run-spell-native-check.py",
         "tools/verify-mcp-action-queries.py", "tools/verify-mcp-authority.py",
         "tools/verify-mcp-fixture-receipts.py", "tools/verify-monster-authoring-compat.py",
         "tools/verify-discovery-flow.py", "tools/adapter_test_client.py",
         "tools/discovery_flow_v2_fixture.py",
         "tools/run-record-browsing-check.py", "tools/run-map-context-check.py",
         "tools/run-ap-activation-check.py", "tools/build-offline-help.py",
         "tools/verify_discovery_adapter.py", "tools/verify_discovery_flow.py", "tools/run-godot-workflow.py",
         "docs/mcp/README.md", "docs/mcp/worked-milestone.md", "docs/mcp/capabilities.md",
         "tools/mcp_test_client.py", "tools/mcp_rule_journey.py", "tools/prepare-mcp-application-library.py",
         "tools/generate-mcp-reference.py", "tools/verify-mcp-authoring-contracts.py",
         "tools/verify-mcp-exports.py", "tools/verify-mcp-reference-media.py", "tools/verify-mcp-replacement.py", "tools/verify-mcp-export-jobs.py", "tools/verify-mcp-classic-import.py", "tools/verify-mcp-world.py", "tools/verify-mcp-media.py",
         "tools/verify-mcp-repairs.py", "tools/verify-mcp-local-paint.py", "tools/verify-mcp-collaboration.py",
         "tools/verify-terrain-generation.py"]
PRIVATE_TOOLS = {"capture_special_paint.gd", "validate_character_navigation_native.gd", "validate_rule_source_native.gd",
                 "validate_treasure_player_beta.gd", "validate_treasure_pool_native.gd",
                 "capture_diagnostics_gate.gd", "validate_diagnostics_workflow.gd"}
IGNORE_PARTS = {".git", ".godot", "__pycache__", "target", "artifacts"}


def paths(root):
    for name in FILES:
        yield root / name
    for name in DIRECTORIES:
        for path in sorted((root / name).rglob("*")):
            if not path.is_file() or IGNORE_PARTS.intersection(path.relative_to(root).parts): continue
            if path.is_relative_to(root / "godot/data/providence-help"): continue
            if path.name == "AGENTS.md" or path.name in PRIVATE_TOOLS: continue
            if path.suffix in {".pyc", ".log", ".tmp"}: continue
            yield path


def export(root, destination):
    root = root.resolve()
    destination = destination.resolve()
    if destination == root or root in destination.parents:
        raise ValueError("Public snapshot must be outside the implementation repository")
    from verify_source_inputs import verify
    verify(root)
    destination.mkdir(exist_ok=False, parents=True)
    inventory = []
    for source in sorted(set(paths(root))):
        relative = source.relative_to(root)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        inventory.append({"path": relative.as_posix(), "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
    # Checks write under artifacts/ and packaging generates offline Help; release packaging requires a clean tree.
    (destination / ".gitignore").write_text(
        "/target/\n/artifacts/\n/godot/.godot/\n/godot/data/providence-help/\n/godot/override.cfg\n/godot/bin/\n"
        "__pycache__/\n*.log\n.DS_Store\n",
        newline="\n")
    (destination.parent / "source-inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")
    print(f"Public source snapshot: {len(inventory)} files")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    export(args.source, args.output)
