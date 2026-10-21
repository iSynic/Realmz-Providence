"""Verify exact-artifact replacement and retained backups through an actual MCP client."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from mcp_test_client import Author, Client, meta

SPEC = importlib.util.spec_from_file_location('export_jobs', Path(__file__).with_name('verify-mcp-export-jobs.py'))
JOBS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(JOBS)


def inspect(author, kind, path):
    return author.call('providence_export_inspect_artifact', {'format': kind, 'path': path})


def replace(author, kind, path, original, operation):
    request = {**meta(author.call('providence_session_describe', guarded=False)),
               'format': kind, 'path': path, 'operationId': operation,
               'replacement': {'expectedSha256': original['artifactSha256']}}
    job = author.call('providence_export_begin', request, guarded=False)
    result = JOBS.settled(author, job)
    assert result['state'] == 'completed' and result['committed'] is True, result
    replacement = result['replacement']
    assert replacement['state'] == 'retained', replacement
    backup = Path(replacement['backupPath'])
    digest = JOBS.directory_hash(backup) if kind == 'classic' else hashlib.sha256(backup.read_bytes()).hexdigest()
    assert digest == original['artifactSha256']
    assert inspect(author, kind, path)['artifactSha256'] == result['artifactSha256']
    assert result['artifactSha256'] != original['artifactSha256']
    late = author.call('providence_export_cancel', {'jobId': job['jobId']})
    assert late['committed'] is True and backup.exists()
    return request, job, result


def journey(author):
    JOBS.EXPORT.setup(author)
    paths = {'classic': 'Crossroads', 'rebuilt': 'Replace.realmz2'}
    originals = {}
    for kind, path in paths.items():
        job = author.call('providence_export_begin', {'format': kind, 'path': path, 'operationId': 'original-' + kind})
        assert JOBS.settled(author, job)['committed'] is True
        originals[kind] = inspect(author, kind, path)
        author.call('providence_export_begin', {'format': kind, 'path': path, 'operationId': 'wrong-' + kind,
                    'replacement': {'expectedSha256': '0' * 64}}, expect_error=True)
        assert inspect(author, kind, path) == originals[kind]
    message = author.call('providence_text_allocate', {'family': 'message'})['nativeId']
    author.group([{'name': 'text', 'tool': 'providence_text_apply_draft', 'arguments': {'draft': {
        'family': 'message', 'nativeId': message, 'expectedText': None, 'text': 'Replacement artifact'}}}], 'replacement-message')
    session = author.call('providence_session_describe', guarded=False)
    replacements = {kind: replace(author, kind, path, originals[kind], 'replace-' + kind) for kind, path in paths.items()}
    current = author.call('providence_session_describe', guarded=False)
    assert current['revision'] == session['revision'] and current['undoEntry'] == session['undoEntry']
    for kind, path in paths.items():
        author.call('providence_export_begin', {'format': kind, 'path': path, 'operationId': 'stale-' + kind,
                    'replacement': {'expectedSha256': originals[kind]['artifactSha256']}}, expect_error=True)
    author.call('providence_export_inspect_artifact', {'format': 'rebuilt', 'path': '../outside.realmz2'}, expect_error=True)
    author.call('providence_project_save', {'operationId': 'replacement-checkpoint'})
    author.call('providence_project_close', guarded=False)
    author.call('providence_project_open', {'path': 'scenario'}, guarded=False)
    for request, job, result in replacements.values():
        assert author.call('providence_export_begin', request, guarded=False) == job
        reopened = JOBS.poll(author, job)
        assert reopened['replacement'] == result['replacement'] and reopened['committed'] is True
    return {'originals': originals, 'replacements': replacements,
            'unchangedProjectHistory': True, 'exactSubmissionReplayAfterReopen': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['mcp', 'adapter', 'output', 'rules-root', 'application-library']:
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    projects, outputs = args.output / 'projects', args.output / 'outputs'
    projects.mkdir()
    outputs.mkdir()
    client = Client(args.mcp, args.adapter, projects, args.output / 'mcp.log', output_root=outputs,
                    support_options=['--application-rules-root', args.rules_root,
                                     '--application-library-root', args.application_library])
    author = Author(client)
    receipt = {'status': 'failed', 'scope': 'Actual SDK artifact guards, backup retention and durable replay; not runtime proof',
               'retention': 'Retain cited receipts, failures and old/new artifacts under the declared output root'}
    try:
        receipt.update(journey(author), status='passed')
    finally:
        client.close()
        receipt['calls'] = author.calls
        receipt['binaries'] = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in [args.mcp, args.adapter]}
        (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print('PROVIDENCE_MCP_REPLACEMENT_OK exact-artifact retained-backups stale root-bound shared-history reopen')


if __name__ == '__main__':
    main()
