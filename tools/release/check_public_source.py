"""Fail closed on private payloads, configuration, machine paths or credentials."""
import argparse
import json
from pathlib import Path
import re
import zipfile

FORBIDDEN = {"AGENTS.md", ".mcp.json", "override.cfg", "automation.toml", "project.providence.json"}
PATTERNS = [re.compile(r"Users(?:[/\\]|\\\\)+Eric", re.I),
            re.compile(r"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})"),
            re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")]


def inspect(root):
    failures = []
    total = 0
    for path in root.rglob("*"):
        if not path.is_file() or ".git" in path.relative_to(root).parts: continue
        total += 1
        relative = path.relative_to(root).as_posix()
        if path.name in FORBIDDEN or relative.startswith(("artifacts/", "design/")):
            failures.append(relative + ": private file")
        if path.suffix in {".exe", ".dll", ".sqlite", ".db", ".sit", ".pen"}:
            failures.append(relative + ": unexpected binary or scenario payload")
        try: text = path.read_text(encoding="utf-8")
        except (UnicodeError, OSError): continue
        if any(pattern.search(text) for pattern in PATTERNS): failures.append(relative + ": private content")
    application = root / "support/rebuilt/application.realmz2"
    with zipfile.ZipFile(application) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("campaignId") != "realmz-classic-application-library":
            failures.append("support archive is not the stock application library")
    if failures: raise ValueError("\n".join(failures))
    print(f"PUBLIC_SOURCE_OK files={total}; stock support archive only; no private configuration or credentials")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    inspect(parser.parse_args().root)
