"""Create a complete native bundle from committed source on the current host."""
import argparse
import json
import os
from pathlib import Path
import platform
import plistlib
import shutil
import subprocess
import tarfile
import zipfile
from common import ROOT, digest, executable, external_directory, git_identity, output, run, write_json
from music import install_music
from notices import install_notices
from windows_runtime import verify_static_crt

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
        arguments = ["cargo", "build", "--locked", "--release", "--workspace"]
        binary_root = target_root / "release"
        if platform.system() == "Windows":
            environment["RUSTFLAGS"] = environment.get("RUSTFLAGS", "") + " -C target-feature=+crt-static"
            arguments.extend(["--target", "x86_64-pc-windows-msvc"])
            binary_root = target_root / "x86_64-pc-windows-msvc/release"
        run(arguments, env=environment)
        for name in BINARIES:
            shutil.copy2(binary_root / executable(name), runtime / executable(name))
        if platform.system() == "Windows": verify_static_crt(runtime, BINARIES)


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
    editor_name = macos_executable(runtime.parent.parent) if platform.system() == "Darwin" else ""
    files = {p.relative_to(runtime).as_posix(): digest(p) for p in sorted(runtime.rglob("*"))
             if p.is_file() and p.name != editor_name}
    write_json(runtime / "bundle-manifest.json", {"kind": "providence.native-release", "formatVersion": 1,
        "version": "0.6.0-beta.1", "source": identity, "platform": platform.system(),
        "godotVersion": output([godot, "--version"]), "buildIdentities": identities, "files": files,
        "macOSSeal": "The signed editor binary is covered by the application seal and release archive checksum." if editor_name else None})


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


def macos_executable(application):
    metadata = plistlib.loads((application / "Contents/Info.plist").read_bytes())
    name = metadata["CFBundleExecutable"]
    if Path(name).name != name: raise ValueError("Invalid macOS bundle executable")
    return name


def sign_runtime(runtime):
    for name in [*BINARIES, "music-preview/openmpt123"]:
        run(["lipo", runtime / name, "-verify_arch", "arm64", "x86_64"])
        run(["codesign", "--force", "--sign", "-", runtime / name])
    manifest_path = runtime / "music-preview/runtime-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["files"]["openmpt123"] = digest(runtime / "music-preview/openmpt123")
    write_json(manifest_path, manifest)


def smoke_editor(bundle, runtime):
    name = "Providence.exe" if os.name == "nt" else "Providence"
    if platform.system() == "Darwin":
        name = macos_executable(bundle / "Providence.app")
    environment = {key: value for key, value in os.environ.items()
                   if not key.startswith("PROVIDENCE_") and key != "CARGO_TARGET_DIR"}
    result = subprocess.run([str(runtime / name), "--headless", "--quit-after", "120"],
        cwd=runtime, env=environment, capture_output=True, text=True, encoding="utf-8", timeout=90)
    result.check_returncode()
    (bundle.parent / "startup-smoke.log").write_text(result.stdout + result.stderr, encoding="utf-8")
    if any(marker in result.stdout + result.stderr for marker in ["SCRIPT ERROR:", "Parse Error:", "ERROR:"]):
        raise ValueError("Exported editor reported an error; see startup-smoke.log")


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
    install_notices(runtime, args.godot)
    if platform.system() == "Darwin": sign_runtime(runtime)
    identity_manifest(runtime, identity, args.godot)
    if platform.system() == "Darwin":
        run(["codesign", "--force", "--sign", "-", bundle / "Providence.app"])
        run(["codesign", "--verify", "--deep", "--strict", bundle / "Providence.app"])
    smoke_editor(bundle, runtime)
    if git_identity() != identity: raise ValueError("Source changed during release packaging")
    archive_bundle(bundle, destination)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["output", "cache", "target", "godot"]: parser.add_argument("--" + name, type=Path, required=True)
    main(parser.parse_args())
