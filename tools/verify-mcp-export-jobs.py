"""Exercise captured Classic/v6 jobs, durable submission receipts and cancellation via MCP."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import shutil
import zipfile
import time
from mcp_test_client import Author, Client, meta

SPEC = importlib.util.spec_from_file_location('export_fixture', Path(__file__).with_name('verify-mcp-exports.py'))
EXPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORT)


def poll(author, job, **paging):
    return author.call('providence_export_poll', {'jobId': job['jobId'], **paging})


def settled(author, job):
    deadline = time.monotonic() + 25
    while True:
        result = poll(author, job, limit=1)
        if result['state'] in {'completed', 'failed', 'cancelled', 'interrupted', 'uncertain'}:
            return result
        assert time.monotonic() < deadline, result
        time.sleep(0.02)


def directory_hash(root):
    files = sorted(path for path in root.rglob('*') if path.is_file())
    digest = hashlib.sha256(b'providence.directory-sha256.v1\0')
    digest.update(struct.pack('>Q', len(files)))
    for path in files:
        name = path.relative_to(root).as_posix().encode()
        data = path.read_bytes()
        digest.update(struct.pack('>Q', len(name)))
        digest.update(name)
        digest.update(struct.pack('>Q', len(data)))
        digest.update(data)
    return digest.hexdigest()



def finalized_jobs(author, args, outputs):
    session = author.call('providence_session_describe', guarded=False)
    context = json.loads((args.finalization_root / 'context.json').read_text())
    inputs = args.output / 'inputs'
    inputs.mkdir()
    for field in ['applicationPackage', 'applicationMediaCatalogPath']:
        source = (args.finalization_root / context[field]).resolve()
        target = inputs / source.name
        shutil.copyfile(source, target)
        context[field] = str(target.resolve())
    shutil.copyfile(args.rules_root / 'Data Caste', inputs / 'Data Caste')
    context['classicApplicationDataDirectory'] = str(inputs.resolve())
    before = EXPORT.hashes(inputs)
    author.call('providence_export_begin', {'format': 'classic', 'path': 'Unexpected',
                'packageFinalization': context, 'operationId': 'classic-finalization'}, expect_error=True)
    wrong = dict(context, applicationPackageHash='0' * 64)
    job = author.call('providence_export_begin', {'format': 'rebuilt', 'path': 'Wrong.realmz2',
                      'packageFinalization': wrong, 'operationId': 'wrong-finalization'})
    rejected = settled(author, job)
    assert rejected['state'] == 'failed' and rejected['committed'] is False, rejected
    assert 'identity does not match' in rejected['error'], rejected
    assert not (outputs / 'Wrong.realmz2').exists()
    inspection = author.call('providence_project_inspect_rebuilt_package', {
        'minimumEngineVersion': '0.1.0', 'packageFinalization': context, 'limit': 1})
    job = author.call('providence_export_begin', {'format': 'rebuilt', 'path': 'Finalized.realmz2',
                      'packageFinalization': context, 'operationId': 'correct-finalization'})
    result = settled(author, job)
    assert result['state'] == 'completed' and result['committed'] is True, result
    assert result['result']['finalization'] is not None, result
    with zipfile.ZipFile(outputs / 'Finalized.realmz2') as archive:
        manifest = json.loads(archive.read('manifest.json'))
        assert manifest['schemaVersion'] == 6
        for name, entry in manifest['files'].items():
            data = archive.read(name)
            assert len(data) == entry['bytes'] and hashlib.sha256(data).hexdigest() == entry['sha256']
    assert EXPORT.hashes(inputs) == before
    assert len(result['sourceProvenance']['packageFinalization']['files']) == 3
    current = author.call('providence_session_describe', guarded=False)
    assert current['revision'] == session['revision'] and current['undoEntry'] == session['undoEntry']
    return {'inspection': inspection, 'correct': result, 'wrongIdentity': rejected,
            'inputsUnchanged': before, 'archiveFilesVerified': len(manifest['files'])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['mcp', 'adapter', 'output', 'rules-root', 'application-library']:
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--finalization-root', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    projects, outputs = args.output / 'projects', args.output / 'outputs'
    projects.mkdir()
    outputs.mkdir()
    receipt = {'status': 'failed', 'captureFormatVersion': 2,
               'scope': 'Actual SDK captured export jobs and recovery; not runtime or campaign proof',
               'retention': 'Retain receipts, failures and outputs under the declared evidence root'}
    client = Client(args.mcp, args.adapter, projects, args.output / 'mcp.log', output_root=outputs, input_roots=[args.output],
                    support_options=['--application-rules-root', args.rules_root,
                                     '--application-library-root', args.application_library])
    author = Author(client)
    try:
        EXPORT.setup(author)
        message = author.call('providence_text_allocate', {'family': 'message'})['nativeId']
        author.group([{'name': 'text', 'tool': 'providence_text_apply_draft', 'arguments': {'draft': {
            'family': 'message', 'nativeId': message, 'expectedText': None,
            'text': 'Captured export revision'}}}], 'capture-message')
        session = author.call('providence_session_describe', guarded=False)
        requests, jobs = {}, {}
        for kind, path in [('classic', 'Crossroads'), ('rebuilt', 'Captured.realmz2')]:
            requests[kind] = {**meta(session), 'format': kind, 'path': path, 'operationId': kind + '-job'}
            jobs[kind] = author.call('providence_export_begin', requests[kind], guarded=False)
            assert jobs[kind]['sourceRevision'] == session['revision']
            assert jobs[kind]['historyScope'] == 'export job; filesystem publication outside project Undo/Redo'
            status = author.call('providence_operation_status', {'operationId': kind + '-job'})
            assert status['exportJobId'] == jobs[kind]['jobId']
        author.group([{'name': 'text', 'tool': 'providence_text_apply_draft', 'arguments': {'draft': {
            'family': 'message', 'nativeId': message, 'expectedText': 'Captured export revision',
            'text': 'Later project revision'}}}], 'edit-after-job-capture')
        results = {kind: settled(author, job) for kind, job in jobs.items()}
        assert all(row['state'] == 'completed' and row['committed'] is True for row in results.values()), results
        assert author.call('providence_session_describe', guarded=False)['revision'] == session['revision'] + 1
        classic = outputs / 'Crossroads'
        text = (classic / 'Data SD2').read_bytes()
        assert b'Captured export revision' in text and b'Later project revision' not in text
        assert directory_hash(classic) == results['classic']['artifactSha256']
        assert hashlib.sha256((outputs / 'Captured.realmz2').read_bytes()).hexdigest() == results['rebuilt']['artifactSha256']
        receipt['archive'] = EXPORT.verify_archive(outputs / 'Captured.realmz2', classic)
        files = results['classic']['result']
        assert files['filesTotal'] > 1 and files['filesTruncated'] and len(files['files']) == 1
        pages = [poll(author, jobs['classic'], fileOffset=index, limit=1)['result']['files'][0]
                 for index in range(files['filesTotal'])]
        assert len(pages) == files['filesTotal']
        late = author.call('providence_export_cancel', {'jobId': jobs['classic']['jobId']})
        assert late['state'] == 'completed' and late['committed'] is True
        for kind in jobs:
            replay = author.call('providence_export_begin', requests[kind], guarded=False)
            assert replay == jobs[kind]
        # A new request cannot overwrite either artifact or escape the configured output root.
        for path in ['Captured.realmz2', '../escape.realmz2']:
            author.call('providence_export_begin', {'format': 'rebuilt', 'path': path,
                        'operationId': 'deny-' + path}, expect_error=True)
        cancellable = author.call('providence_export_begin', {
            'format': 'rebuilt', 'path': 'Cancel.realmz2', 'operationId': 'cancel-job'})
        author.call('providence_export_cancel', {'jobId': cancellable['jobId']})
        outcome = settled(author, cancellable)
        assert outcome['state'] in {'completed', 'cancelled'}, outcome
        assert (outputs / 'Cancel.realmz2').exists() == bool(outcome['committed'])
        assert not any(path.name.startswith('.providence-export-') for path in outputs.iterdir())
        if args.finalization_root:
            receipt['finalization'] = finalized_jobs(author, args, outputs)
        author.call('providence_project_save', {'operationId': 'checkpoint-after-export-jobs'})
        author.call('providence_project_close', guarded=False)
        reopened = author.call('providence_project_open', {'path': 'scenario'}, guarded=False)
        assert reopened['sessionGeneration'] != session['sessionGeneration']
        for kind, job in jobs.items():
            recovered = poll(author, job, limit=1)
            assert recovered['state'] == 'completed' and recovered['artifactSha256'] == results[kind]['artifactSha256']
            assert author.call('providence_export_begin', requests[kind], guarded=False) == job
        receipt.update(status='passed', capturedRevision=session['revision'], jobs=results,
                       cancellationOutcome=outcome, boundedFilePages=pages,
                       exactSubmissionReplayAfterReopen=True, laterEditExcluded=True)
    finally:
        client.close()
        receipt['calls'] = author.calls
        receipt['binaries'] = {str(path): hashlib.sha256(path.read_bytes()).hexdigest()
                               for path in [args.mcp, args.adapter]}
        (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print('PROVIDENCE_MCP_EXPORT_JOBS_OK captured-revision durable-receipts bounded-pages cancellation reopen')


if __name__ == '__main__':
    main()
