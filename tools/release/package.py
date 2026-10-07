"""Create a complete native bundle from committed source on the current host."""
import argparse
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tarfile
import zipfile
from common import ROOT, digest, executable, external_directory, git_identity, output, run, write_json
from music import install_music

BINARIES = ["providence-cli", "providence-native-adapter", "providence-rebuilt-preview",
            "providence-application-library"]


def build_native(target_root, runtime):
    environment = os.environ.copy()
    environment["CARGO_TARGET_DIR"] = str(target_root)
    if platform.system() == "Darwin":
        for target in ["aarch64-apple-darwin", "x86_64-apple-darwin"]:
            run(["cargo", "build", "--locked", "--release", "--workspace", "--target", target], env=environment)
        for name in BINARIES:
            run(["lipo", "-create", *[target_root / t / "release" / name for t in
                ["aarch64-apple-darwin", "x86_64-apple-darwin"]], "-output", runtime / name])
    else:
        run(["cargo", "build", "--locked", "--release", "--workspace"], env=environment)
        for name in BINARIES:
            shutil.copy2(target_root / "release" / executable(name), runtime / executable(name))


def verify_sources():
    source = ROOT / "godot/bundled/realmz-reference"
    for entry in json.loads((source / "manifest.json").read_text())["files"]:
        path = source / entry["name"]
        if path.stat().st_size != entry["bytes"] or digest(path) != entry["sha256"]:
            raise ValueError(f"Reference source differs: {entry['name']}")
    source = ROOT / "godot/bundled/monster-library"
    manifest = json.loads((source / "manifest.json").read_text())
    if digest(source / "Monster Scrap Book") != manifest["sha256"]:
        raise ValueError("Monster Scrapbook source differs")
    source = ROOT / "support/rebuilt"
    for name, expected in json.loads((source / "manifest.json").read_text())["files"].items():
        if digest(source / name) != expected: raise ValueError(f"Application support differs: {name}")


def derive_library(runtime):
    request = {"id": 1, "method": "application-media.import-classic-library", "params": {
        "sourceDirectory": str(runtime / "Realmz Data"),
        "libraryRoot": str(runtime / "reference-libraries/realmz-classic")}}
    result = subprocess.run([str(runtime / executable("providence-native-adapter")), "serve-demo"],
        input=json.dumps(request) + "\n", capture_output=True, text=True, encoding="utf-8", timeout=180)
    result.check_returncode()
    response = json.loads(result.stdout)
    if not response.get("ok") or not response["result"].get("appearanceComplete"):
        raise ValueError(f"Application library derivation failed: {response}")
    context = json.loads((ROOT / "support/rebuilt/context.json").read_text())
    context.update(applicationPackage="../../rebuilt-support/application.realmz2",
                   applicationMediaCatalogPath="../../rebuilt-support/media.json",
                   classicApplicationDataDirectory="../../Realmz Data")
    write_json(runtime / "reference-libraries/realmz-classic/rebuilt-package-context.json", context)
    inspection = json.loads(output([runtime / executable("providence-cli"), "inspect-rebuilt-package-file",
                                    runtime / "rebuilt-support/application.realmz2"]))
    if inspection["packageHash"] != context["applicationPackageHash"]:
        raise ValueError("Application package inspection differs from finalization context")


def support(runtime, cache):
    verify_sources()
    shutil.copytree(ROOT / "godot/bundled/realmz-reference", runtime / "Realmz Data")
    shutil.copytree(ROOT / "godot/bundled/monster-library", runtime / "monster-library")
    shutil.copytree(ROOT / "support/rebuilt", runtime / "rebuilt-support")
    for name in ["LICENSE", "LICENSE-REALMZ.txt", "NOTICE", "THIRD_PARTY_NOTICES.md"]:
        shutil.copy2(ROOT / name, runtime / name)
    shutil.copytree(ROOT / "vendor", runtime / "third-party", ignore=shutil.ignore_patterns("src", "Cargo.toml", "Cargo.lock"))
    shutil.copy2(ROOT / "artwork/application-icon/Theldrow-REALMZ-NONCOMMERCIAL.txt", runtime / "FONT-NOTICE.txt")
    install_music(runtime / "music-preview", cache)
    derive_library(runtime)


def identity_manifest(runtime, identity, godot):
    identities = {}
    for name in ["providence-cli", "providence-native-adapter", "providence-application-library"]:
        build = json.loads(output([runtime / executable(name), "build-identity"]))
        if build["commit"] != identity["commit"] or build["sourceTree"] != identity["sourceTree"] or build["sourceDirty"]:
            raise ValueError(f"Embedded source identity mismatch: {name}: {build}")
        identities[name] = build
    files = {p.relative_to(runtime).as_posix(): digest(p) for p in sorted(runtime.rglob("*")) if p.is_file()}
    write_json(runtime / "bundle-manifest.json", {"kind": "providence.native-release", "formatVersion": 1,
        "version": "0.6.0-beta.1", "source": identity, "platform": platform.system(),
        "godotVersion": output([godot, "--version"]), "buildIdentities": identities, "files": files})


def export(godot, bundle):
    system = platform.system()
    presets = {"Windows": "Windows Desktop", "Linux": "Linux", "Darwin": "macOS"}
    filename = {"Windows": "Providence.exe", "Linux": "Providence", "Darwin": "Providence.app"}[system]
    run([godot, "--headless", "--path", ROOT / "godot", "--editor", "--import"], timeout=300)
    run([godot, "--headless", "--path", ROOT / "godot", "--export-release", presets[system], bundle / filename], timeout=300)
    if system == "Darwin":
        return bundle / "Providence.app/Contents/MacOS"
    return bundle


def archive_bundle(bundle, destination):
    system = platform.system()
    suffix = {"Windows": "windows-x64.zip", "Linux": "linux-x64.tar.gz", "Darwin": "macos-universal.zip"}[system]
    archive = destination / ("Providence-v0.6.0-beta.1-" + suffix)
    if system == "Linux":
        with tarfile.open(archive, "w:gz") as target: target.add(bundle, arcname="Providence")
    elif system == "Darwin":
        run(["ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", bundle / "Providence.app", archive])
    else:
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=7) as target:
            for path in sorted(bundle.rglob("*")):
                if path.is_file(): target.write(path, "Providence/" + path.relative_to(bundle).as_posix())
    (destination / (archive.name + ".sha256")).write_text(f"{digest(archive)}  {archive.name}\n")
    print(f"RELEASE_ARCHIVE {archive}", flush=True)


def main(args):
    destination = external_directory(args.output)
    cache = external_directory(args.cache)
    target = external_directory(args.target)
    identity = git_identity()
    bundle = destination / "bundle"
    bundle.mkdir(exist_ok=False)
    runtime = export(args.godot, bundle)
    build_native(target, runtime)
    support(runtime, cache)
    identity_manifest(runtime, identity, args.godot)
    if platform.system() == "Darwin":
        run(["codesign", "--force", "--deep", "--sign", "-", bundle / "Providence.app"])
        run(["codesign", "--verify", "--deep", "--strict", bundle / "Providence.app"])
    run([args.godot, "--headless", "--main-pack", next(bundle.rglob("*.pck")), "--quit-after", "120"], timeout=90)
    if git_identity() != identity: raise ValueError("Source changed during release packaging")
    archive_bundle(bundle, destination)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["output", "cache", "target", "godot"]: parser.add_argument("--" + name, type=Path, required=True)
    main(parser.parse_args())
