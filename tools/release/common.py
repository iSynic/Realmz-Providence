"""Pinned downloads and bounded subprocesses shared by release tooling."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
PINS = json.loads((Path(__file__).with_name("pins.json")).read_text())


def run(arguments, *, cwd=ROOT, env=None, timeout=1800):
    return subprocess.run([str(a) for a in arguments], cwd=cwd, env=env,
                          check=True, timeout=timeout)


def output(arguments, *, cwd=ROOT, timeout=120):
    return subprocess.check_output([str(a) for a in arguments], cwd=cwd,
                                   text=True, encoding="utf-8", timeout=timeout).strip()


def digest(path, algorithm="sha256"):
    with Path(path).open("rb") as source:
        return hashlib.file_digest(source, algorithm).hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def download(cache, name, url, expected, algorithm="sha256"):
    cache.mkdir(parents=True, exist_ok=True)
    destination = cache / name
    if not destination.exists():
        pending = destination.with_suffix(destination.suffix + ".pending")
        try:
            with urllib.request.urlopen(url, timeout=120) as source, pending.open("wb") as target:
                while block := source.read(1024 * 1024):
                    target.write(block)
            if digest(pending, algorithm) != expected:
                raise ValueError(f"Download checksum mismatch: {name}")
            pending.replace(destination)
        finally:
            pending.unlink(missing_ok=True)
    if digest(destination, algorithm) != expected:
        raise ValueError(f"Cached checksum mismatch: {name}")
    return destination


def external_directory(path):
    path = Path(path).resolve()
    if path == ROOT or ROOT in path.parents:
        raise ValueError(f"Build output must be outside the source tree: {path}")
    path.mkdir(parents=True, exist_ok=True)
    return path


def git_identity():
    if output(["git", "status", "--porcelain", "--untracked-files=all"]):
        raise ValueError("Release source must be committed and clean")
    return {"commit": output(["git", "rev-parse", "HEAD"]),
            "sourceTree": output(["git", "rev-parse", "HEAD^{tree}"])}


def executable(name):
    return name + (".exe" if os.name == "nt" else "")
