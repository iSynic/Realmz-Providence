"""Build a minimal native MOD decoder; retain its exact corresponding source."""
import json
import os
from pathlib import Path
import platform
import shutil
import tarfile
import tempfile
import zipfile
from common import ROOT, PINS, digest, download, run, write_json


def install_music(destination, cache):
    destination.mkdir()
    if platform.system() == "Windows":
        install_windows(destination, cache)
    else:
        install_unix(destination, cache)
    verify_render(destination, cache)


def verify_render(destination, cache):
    with tempfile.TemporaryDirectory(prefix="music-probe-", dir=cache) as temporary:
        root = Path(temporary)
        module = bytearray(1084 + 1024 + 8)
        module[:20] = b"Providence MOD probe "
        module[42:44] = (4).to_bytes(2, "big")
        module[45] = 64
        module[48:50] = (4).to_bytes(2, "big")
        module[950] = 1
        module[1080:1084] = b"M.K."
        module[1084:1088] = bytes([1, 172, 16, 0])
        module[-8:] = bytes([0, 64, 127, 64, 0, 192, 128, 192])
        (root / "probe.mod").write_bytes(module)
        windows = platform.system() == "Windows"
        rendered = root / ("probe.wav" if windows else "probe.raw")
        run([destination / ("openmpt123.exe" if windows else "openmpt123"), "--batch", "--quiet",
             "--samplerate", "48000", "--channels", "2", "--no-float", "--repeat", "0",
             "--end-time", "1", "--output", rendered, "--", root / "probe.mod"], timeout=30)
        data = rendered.read_bytes()
        if len(data) < 4096 or (windows and data[:4] != b"RIFF") or (not windows and len(data) % 4):
            raise ValueError("Music decoder did not produce the required PCM output")
        print("MUSIC_DECODER_OK 31-sample MOD to bounded stereo PCM", flush=True)


def install_windows(destination, cache):
    pins = json.loads((ROOT / "tools/music-preview-runtime.json").read_text())
    archive = download(cache, "openmpt-windows.zip", pins["archiveUrl"], pins["archiveSha256"])
    sources = download(cache, "openmpt-windows-source.zip", pins["sourceUrl"], pins["sourceSha256"])
    with zipfile.ZipFile(archive) as source:
        for name, expected in pins["files"].items():
            target = destination / name
            target.write_bytes(source.read("openmpt123/amd64/" + name))
            if digest(target) != expected: raise ValueError(f"Music runtime mismatch: {name}")
        for entry in source.infolist():
            if not entry.is_dir() and (entry.filename == "LICENSE.txt" or entry.filename.startswith("Licenses/")):
                target = destination / entry.filename
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(source.read(entry))
    shutil.copy2(sources, destination / "corresponding-source.zip")
    write_json(destination / "runtime-manifest.json", pins)


def install_unix(destination, cache):
    pins = PINS["openmptSource"]
    archive = download(cache, "libopenmpt-0.8.9.tar.gz", pins["url"], pins["sha256"])
    targets = [None] if platform.system() == "Linux" else ["arm64", "x86_64"]
    binaries = []
    with tempfile.TemporaryDirectory(prefix="openmpt-build-", dir=cache) as temporary:
        work = Path(temporary)
        for index, architecture in enumerate(targets):
            unpack = work / str(index)
            unpack.mkdir()
            with tarfile.open(archive) as source: source.extractall(unpack, filter="data")
            root = next(unpack.iterdir())
            environment = os.environ.copy()
            if architecture:
                environment.update(CFLAGS=f"-arch {architecture} -mmacosx-version-min=11.0",
                    CXXFLAGS=f"-arch {architecture} -mmacosx-version-min=11.0",
                    LDFLAGS=f"-arch {architecture} -mmacosx-version-min=11.0")
            flags = ["--disable-shared", "--enable-static", "--disable-examples", "--disable-tests",
                     "--disable-doxygen-doc", "--without-zlib", "--without-mpg123", "--without-ogg",
                     "--without-vorbis", "--without-vorbisfile", "--without-portaudio",
                     "--without-portaudiocpp", "--without-pulseaudio", "--without-sndfile", "--without-flac"]
            run([root / "configure", *flags], cwd=root, env=environment)
            run(["make", f"-j{min(os.cpu_count() or 2, 4)}"], cwd=root, env=environment)
            binaries.append(root / "bin/openmpt123")
        target = destination / "openmpt123"
        if len(binaries) == 1: shutil.copy2(binaries[0], target)
        else: run(["lipo", "-create", *binaries, "-output", target])
        shutil.copy2(next((work / "0").iterdir()) / "LICENSE", destination / "LICENSE.txt")
    target.chmod(0o755)
    shutil.copy2(archive, destination / "corresponding-source.tar.gz")
    write_json(destination / "runtime-manifest.json", {"version": "0.8.9", "source": pins,
        "files": {"openmpt123": digest(target)}, "output": "signed-16-bit-stereo-48000Hz-raw-PCM"})
