"""Fail closed on private payloads, configuration, machine paths or credentials."""
import argparse
import json
from pathlib import Path
import re
import zipfile

FORBIDDEN = {"AGENTS.md", ".mcp.json", "override.cfg", "automation.toml", "project.providence.json"}
# One path separator as it appears in prose, source strings or escaped JSON.
SEPARATOR = r"(?:\\\\|[\\/])"
PATTERNS = {
    "owner profile": re.compile(r"Users(?:[/\\]|\\\\)+Eric", re.I),
    "Windows user profile": re.compile(
        r"\b[A-Za-z]:" + SEPARATOR + r"+(?:Users|Documents and Settings)" + SEPARATOR
        + r"+(?!(?:Public|Default|All Users)\b)[\w.-][\w. -]*", re.I),
    "macOS home": re.compile(r"(?<![\w.~-])/Users/(?!Shared\b)[\w.-]+"),
    # GitHub-hosted runners build under /home/runner; that path names no person.
    "Linux home": re.compile(r"(?<![\w.~-])/home/(?!runner\b)[\w.-]+"),
    # A single backslash followed by n, r, t, u or a quote is a string escape
    # ("Required X:\nThe ..."), not a drive path.
    "non-system drive path": re.compile(
        r"(?<![\w$%\\])[D-Zd-z]:(?:/|\\\\|\\(?![nrtu\"]))[^\\/\r\n\"'<>]*"),
    "GitHub token": re.compile(r"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})"),
    "AWS access key": re.compile(r"\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b"),
    "Slack token": re.compile(
        r"\bxox[abposr]-[A-Za-z0-9-]{10,}|hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[A-Za-z0-9]+"),
    "private key": re.compile(r"-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----"),
    "credential assignment": re.compile(
        r"(?i)\b(?:api[_-]?key|access[_-]?key|secret[_-]?key|client[_-]?secret|auth[_-]?token|access[_-]?token"
        r"|token|secret|password)[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9_+/=-]{24,}"),
}
# Exact matches that name no private machine state, each with its reason.
ALLOWED = {
    # Synthetic paths that tests pass as opaque strings; nothing resolves them.
    ("crates/providence-native-adapter/src/scenario_conversion.rs", "non-system drive path"):
        {"D:/City of Bywater", "D:/job", "D:/support", "D:/application.realmz2"},
    ("godot/tools/validate_monster_browser_state.gd", "non-system drive path"): {"F:/fixture"},
    # Capture provenance beside each source SHA-256 in corpus-derived fixtures.
    ("crates/providence-core/src/terrain_joining/fixtures/trouble-custom2.json", "non-system drive path"):
        {"D:\\\\Scenarios"},
    ("crates/providence-core/src/smart_terrain/fixtures/authored-water-joins.json", "non-system drive path"):
        {"D:\\\\Scenarios"},
}
# This file must spell the allowed drive paths above.
SELF = ("tools/release/check_public_source.py", "non-system drive path")


def private_content(relative, text):
    for name, pattern in PATTERNS.items():
        if (relative, name) == SELF: continue
        allowed = ALLOWED.get((relative, name), set())
        for match in pattern.finditer(text):
            if match.group(0) not in allowed:
                line = text.count("\n", 0, match.start()) + 1
                yield f"{relative}:{line}: private content ({name})"


def inspect(root):
    failures = []
    total = 0
    for path in root.rglob("*"):
        if not path.is_file() or any(part in {".git", ".godot", "__pycache__"}
                                     for part in path.relative_to(root).parts): continue
        total += 1
        relative = path.relative_to(root).as_posix()
        if path.name in FORBIDDEN or relative.startswith(("artifacts/", "design/")):
            failures.append(relative + ": private file")
        if path.suffix in {".exe", ".dll", ".sqlite", ".db", ".sit", ".pen"}:
            failures.append(relative + ": unexpected binary or scenario payload")
        try: text = path.read_text(encoding="utf-8")
        except (UnicodeError, OSError): continue
        failures.extend(private_content(relative, text))
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
