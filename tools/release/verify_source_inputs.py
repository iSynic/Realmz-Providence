"""Check that sanitized source retains compiled resources, MCP runtime support and the CI smoke tier."""
import argparse
import json
from pathlib import Path
import re
from source_snapshot import paths


def smoke_tier_inputs(root):
    """The UI runner, its manifest and every script the smoke-tier checks call, transitively."""
    manifest = json.loads((root / 'tools/ui-checks.json').read_text(encoding='utf-8'))
    checks = [check for check in manifest['checks'] if 'smoke' in check.get('tiers', [])]
    pending, seen = [json.dumps(checks)], set()
    found = {'tools/run-ui-checks.py', 'tools/ui-checks.json'}
    while pending:
        for name in set(re.findall(r'[\w.-]+\.(?:ps1|py|gd)\b', pending.pop())) - seen:
            seen.add(name)
            for folder in ('tools', 'godot/tools'):
                if (root / folder / name).is_file():
                    found.add(f'{folder}/{name}')
                    pending.append((root / folder / name).read_text(encoding='utf-8', errors='replace'))
    return sorted(found)


def verify(root):
    root = root.resolve()
    retained = {path.resolve() for path in paths(root)}
    failures, compiled = [], 0
    for source in sorted((root / 'crates').rglob('*.rs')):
        if 'target' in source.relative_to(root).parts:
            continue
        for relative in re.findall(r'include_(?:str|bytes)!\(\s*"([^"]+)"\s*\)', source.read_text(encoding='utf-8')):
            target = (source.parent / relative).resolve()
            compiled += 1
            if not target.is_file() or target not in retained:
                failures.append(str(target.relative_to(root)) + ': missing compile-time input')
    contract = (root / 'crates/providence-session-client/src/capabilities/contract.rs').read_text(encoding='utf-8')
    references = set(re.findall(r'"(tools/[^"\n]+\.(?:py|ps1))"', contract))
    references.update(['support/mcp/README.md', 'support/mcp/client-config.example.json',
                       'support/mcp/sdk/LICENSE-APACHE', 'support/mcp/sdk/provenance.json',
                       'tools/mcp_test_client.py', 'tools/mcp_rule_journey.py',
                       'tools/verify-mcp-collaboration.py', 'tools/prepare-mcp-application-library.py'])
    for relative in sorted(references):
        if (root / relative).resolve() not in retained:
            failures.append(relative + ': missing MCP support or defined check')
    smoke = smoke_tier_inputs(root)
    for relative in smoke:
        if (root / relative).resolve() not in retained:
            failures.append(relative + ': missing input of the CI smoke tier')
    if failures:
        raise ValueError('\n'.join(failures))
    print(f'PUBLIC_SOURCE_INPUTS_OK compiled-resources={compiled} MCP-support-and-checks={len(references)} smoke-tier-inputs={len(smoke)}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[2])
    verify(parser.parse_args().source)
