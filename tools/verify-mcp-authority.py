"""Reject an adapter with the same public build identity and a stale authoring contract."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from mcp_test_client import Client


def main():
    parser = argparse.ArgumentParser()
    for name in ['mcp', 'adapter', 'output']:
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    projects = args.output / 'projects'
    projects.mkdir()
    public = subprocess.check_output([args.adapter, 'build-identity'], text=True, encoding='utf-8')
    (args.output / 'native-build.json').write_text(public, encoding='utf-8')
    source = args.output / 'mismatched-authority.rs'
    source.write_text('''fn main() {
    match std::env::args().nth(1).as_deref() {
        Some("build-identity") => print!("{}", include_str!("native-build.json")),
        Some("session-contract-identity") => println!(r#"{{"hostProtocol":2,"authoritySha256":"older-uncommitted-authority"}}"#),
        _ => std::process::exit(2),
    }
}
''', encoding='utf-8')
    subprocess.run(['rustc', '--crate-name', 'mismatched_authority', str(source), '--out-dir', str(args.output)], check=True, timeout=30)
    fake = args.output / ('mismatched_authority.exe' if args.mcp.suffix == '.exe' else 'mismatched_authority')
    receipt = {'status': 'failed', 'scope': 'prepared identity provider; actual MCP preflight; no scenario authoring or runtime parity claim'}
    client = Client(args.mcp, fake, projects, args.output / 'mcp.log')
    try:
        response = client.tool('providence_project_create', {'path': 'must-not-exist'})
        receipt['response'] = response
        assert response.get('isError'), response
        assert response['structuredContent']['code'] == 'adapter-incompatible', response
        assert 'fingerprint' in response['structuredContent']['message'], response
        assert not list(projects.iterdir()), 'Incompatible authority created project data'
        receipt['status'] = 'passed'
    finally:
        client.close()
        receipt['binaries'] = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in [args.mcp, args.adapter, fake]}
        (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print('PROVIDENCE_MCP_AUTHORITY_OK same-public-build stale-authority rejected-before-project-creation')


if __name__ == '__main__':
    main()
