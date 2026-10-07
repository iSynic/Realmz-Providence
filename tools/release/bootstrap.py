"""Install the pinned Godot editor and templates in a caller-owned cache."""
import argparse
import os
from pathlib import Path
import platform
import zipfile
from common import PINS, download, external_directory


def install(cache):
    system = platform.system()
    suffix = {"Windows": "win64.exe", "Linux": "linux.x86_64",
              "Darwin": "macos.universal"}[system]
    name = f"Godot_v{PINS['godotVersion']}_{suffix}.zip"
    editor_root = cache / "godot"
    editor_root.mkdir(exist_ok=True)
    for archive_name in [name, f"Godot_v{PINS['godotVersion']}_export_templates.tpz"]:
        archive = download(cache, archive_name,
            f"https://github.com/godotengine/godot-builds/releases/download/{PINS['godotVersion']}/{archive_name}",
            PINS["godotArchives"][archive_name], "sha512")
        if archive_name == name:
            with zipfile.ZipFile(archive) as source:
                source.extractall(editor_root)
        else:
            install_templates(archive, system)
    paths = {"Windows": editor_root / "Godot_v4.7.1-stable_win64_console.exe",
             "Linux": editor_root / "Godot_v4.7.1-stable_linux.x86_64",
             "Darwin": editor_root / "Godot.app/Contents/MacOS/Godot"}
    executable = paths[system]
    executable.chmod(0o755)
    return executable


def install_templates(archive, system):
    roots = {"Windows": Path(os.environ.get("APPDATA", Path.home())) / "Godot",
             "Darwin": Path.home() / "Library/Application Support/Godot",
             "Linux": Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "godot"}
    target = roots[system] / "export_templates/4.7.1.stable"
    target.mkdir(parents=True, exist_ok=True)
    needed = {"Windows": {"windows_release_x86_64.exe", "windows_release_x86_64_console.exe"},
              "Linux": {"linux_release.x86_64"}, "Darwin": {"macos.zip"}}[system]
    with zipfile.ZipFile(archive) as source:
        for entry in source.infolist():
            if entry.filename.startswith("templates/") and Path(entry.filename).name in needed:
                destination = target / Path(entry.filename).name
                destination.write_bytes(source.read(entry))
                if system != "Windows": destination.chmod(0o755)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    args = parser.parse_args()
    executable = install(external_directory(args.cache))
    print(executable)
    if os.environ.get("GITHUB_ENV"):
        with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as target:
            target.write(f"PROVIDENCE_GODOT_PATH={executable}\n")
