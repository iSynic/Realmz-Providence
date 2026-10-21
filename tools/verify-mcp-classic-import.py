"""Check bounded Classic import, preservation and baseline safety through the actual MCP SDK."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time
from mcp_test_client import Author, Client, meta


def hashes(directory):
    return {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(directory.iterdir()) if path.is_file()}


def begin(author, args, operation):
    return author.call('providence_project_import_classic_scenario_begin', {
        'directory': str(args.scenario.resolve()),
        'applicationDataDirectory': str(args.application_data.resolve()),
        'operationId': operation})


def ready(author, job):
    deadline = time.monotonic() + 120
    phases = []
    while True:
        result = author.call('providence_project_import_classic_scenario_poll', {'jobId': job['jobId']})
        phase = (result.get('phase'), result.get('completedItems'), result.get('totalItems'))
        if not phases or phases[-1] != phase:
            phases.append(phase)
        if result['status'] != 'running':
            assert result['status'] == 'ready', result
            return phases
        assert time.monotonic() < deadline, result
        time.sleep(0.05)


def cleanup(author, job, project):
    root = project / '.providence' / 'import-jobs'
    deadline = time.monotonic() + 15
    while True:
        status = author.call('providence_project_import_classic_scenario_poll', {'jobId': job['jobId']})
        if status.get('settled'):
            assert not root.exists() or not any(root.iterdir()), 'Settled import retained staging'
            return
        assert time.monotonic() < deadline, 'Owned import staging was not cleaned'
        time.sleep(0.025)


def stale_import(author, args, projects):
    author.call('providence_project_create', {'path': 'stale'}, guarded=False)
    preflight = author.call('providence_project_inspect_classic_scenario_import', {
        'directory': str(args.scenario.resolve()), 'applicationDataDirectory': str(args.application_data.resolve())})
    job = begin(author, args, 'stale-import')
    author.group([{'name': 'text', 'tool': 'providence_message_create', 'arguments': {
        'nativeId': 1, 'text': 'Preserve a newer authored edit'}}], 'edit-during-import')
    author.call('providence_project_import_classic_scenario_commit', {
        'jobId': job['jobId'], 'operationId': 'stale-commit'}, expect_error=True)
    author.call('providence_project_import_classic_scenario_cancel', {'jobId': job['jobId']})
    cleanup(author, job, projects / 'stale')
    assert author.call('providence_message_open', {'nativeId': 1})['message']['text'] == 'Preserve a newer authored edit'
    rejected = author.call('providence_project_import_classic_scenario_begin', {
        'directory': str(args.scenario.resolve()), 'applicationDataDirectory': str(args.application_data.resolve()),
        'operationId': 'cannot-replace-authored'}, expect_error=True)
    assert rejected['code'] == 'import-baseline-required', rejected
    author.call('providence_project_close', guarded=False)
    return preflight


def import_baseline(author, args, projects):
    created = author.call('providence_project_create', {'path': 'imported'}, guarded=False)
    assert created['revision'] == 0 and not created['canUndo']
    cancelled = begin(author, args, 'cancel-preparation')
    author.call('providence_project_import_classic_scenario_cancel', {'jobId': cancelled['jobId']})
    cleanup(author, cancelled, projects / 'imported')
    assert author.call('providence_session_describe', guarded=False)['revision'] == 0
    job = begin(author, args, 'import-native-source')
    phases = ready(author, job)
    session = author.call('providence_session_describe', guarded=False)
    request = {**meta(session), 'jobId': job['jobId'], 'operationId': 'commit-native-source'}
    committed = author.call('providence_project_import_classic_scenario_commit', request, guarded=False)
    assert committed['historyScope'] == 'initial imported baseline; no Undo entry'
    current = author.call('providence_session_describe', guarded=False)
    assert current['revision'] == 1 and not current['canUndo']
    return phases, request, committed


def export_baseline(author, outputs, preflight, before, source_revision):
    baseline_export = author.call('providence_project_compile_classic_slice', {
        'directory': preflight['scenarioName'], 'operationId': 'export-imported-baseline'})
    exported = hashes(outputs / preflight['scenarioName'])
    expected = {row['nativePath']: before['scenario'][row['nativePath']] for row in preflight['files']
                if row['role'] == 'scenario' and row['present'] and row['nativePath'] in before['scenario']}
    assert expected and all(exported.get(path) == digest for path, digest in expected.items()), {
        path: {'expected': digest, 'actual': exported.get(path)} for path, digest in expected.items()
        if exported.get(path) != digest}
    if source_revision is None:
        assert exported == before['scenario'], 'Generated source must round-trip as an exact complete file set'
    return {'result': baseline_export, 'hashes': exported,
                                 'sourceFilesCompared': len(expected)}


def edit_imported(author, args):
    context = author.call('providence_classic_rule_selection_open')
    assert context['imported'] and context['context'] is None
    arguments = dict(expectedProjectId=context['projectId'], expectedPreviousIdentity=context['contextIdentity'],
                     expectedSourceSetSha256=context['sourceSetSha256'], nativeMenuSelection=args.native_menu_selection)
    author.group([{'name': 'selection', 'tool': 'providence_classic_rule_selection_set',
                   'arguments': arguments}], 'explicit-fixture-rule-selection')
    selection = author.call('providence_classic_rule_selection_open')
    assert selection['context']['nativeMenuSelection'] == args.native_menu_selection
    author.call('providence_history_undo', {'operationId': 'undo-rule-selection'})
    assert author.call('providence_classic_rule_selection_open')['context'] is None
    author.call('providence_history_redo', {'operationId': 'redo-rule-selection'})
    clear = dict(expectedProjectId=selection['projectId'], expectedPreviousIdentity=selection['contextIdentity'],
                 expectedSourceSetSha256=selection['sourceSetSha256'])
    author.group([{'name': 'clear', 'tool': 'providence_classic_rule_selection_clear',
                   'arguments': clear}], 'clear-fixture-rule-selection')
    assert author.call('providence_classic_rule_selection_open')['context'] is None
    author.call('providence_history_undo', {'operationId': 'undo-clear-rule-selection'})
    assert author.call('providence_classic_rule_selection_open')['context']['nativeMenuSelection'] == args.native_menu_selection
    author.call('providence_history_redo', {'operationId': 'redo-clear-rule-selection'})
    assert author.call('providence_classic_rule_selection_open')['context'] is None
    author.call('providence_history_undo', {'operationId': 'restore-rule-selection'})
    row = author.call('providence_message_list', {'limit': 1})['items'][0]
    opened = author.call('providence_message_open', {'nativeId': row['nativeId']})['message']
    author.group([{'name': 'text', 'tool': 'providence_message_update', 'arguments': {
        'identity': opened['identity'], 'text': 'Reviewed imported Café text'}}], 'edit-imported-text')
    author.call('providence_history_undo', {'operationId': 'undo-imported-text'})
    assert author.call('providence_message_open', {'nativeId': row['nativeId']})['message']['text'] == opened['text']
    return selection, row, opened


def reopen_imported(author, request, committed, row, opened):
    author.call('providence_project_save', {'operationId': 'save-imported'})
    author.call('providence_project_close', guarded=False)
    author.call('providence_project_open', {'path': 'imported'}, guarded=False)
    assert author.call('providence_project_import_classic_scenario_commit', request, guarded=False) == committed
    assert author.call('providence_message_open', {'nativeId': row['nativeId']})['message']['text'] == opened['text']
    author.call('providence_history_redo', {'operationId': 'redo-imported-text-after-reopen'})
    assert author.call('providence_message_open', {'nativeId': row['nativeId']})['message']['text'] == 'Reviewed imported Café text'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['mcp', 'adapter', 'output', 'scenario', 'application-data', 'application-library']:
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--native-menu-selection', type=int, required=True,
                        help='Explicit fixture assumption, not evidence of intended Classic mechanics')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    projects = args.output / 'projects'
    projects.mkdir()
    outputs = args.output / 'outputs'
    outputs.mkdir()
    before = {'scenario': hashes(args.scenario), 'application': hashes(args.application_data)}
    source_git = subprocess.run(['git', '-C', str(args.scenario), 'rev-parse', 'HEAD'],
                               check=False, capture_output=True, text=True, timeout=15)
    source_revision = source_git.stdout.strip() if source_git.returncode == 0 else None
    receipt = {'status': 'failed', 'captureFormatVersion': 2, 'sourceRevision': source_revision,
               'retention': 'Retain cited receipts, failures and owned projects; donor inputs remain read-only',
               'scope': 'Classic import baseline, guarded author choice and shared text history; no runtime parity claim',
               'ruleSelection': {'nativeMenuSelection': args.native_menu_selection,
                                 'status': 'explicit fixture assumption; intended scenario selection unverified'},
               'sourceBefore': before}
    client = Client(args.mcp, args.adapter, projects, args.output / 'mcp.log',
                    output_root=outputs,
                    input_roots=[args.scenario, args.application_data],
                    support_options=['--application-library-root', args.application_library])
    author = Author(client)
    try:
        preflight = stale_import(author, args, projects)
        receipt['preflight'] = preflight
        phases, request, committed = import_baseline(author, args, projects)
        receipt['phases'] = phases
        receipt['baselineExport'] = export_baseline(author, outputs, preflight, before, source_revision)
        selection, row, opened = edit_imported(author, args)
        reopen_imported(author, request, committed, row, opened)
        assert before == {'scenario': hashes(args.scenario), 'application': hashes(args.application_data)}
        receipt.update(status='passed', committed=committed, ruleContext=selection,
                       sourceUnchanged=True, authoredHistoryPreserved=True, reopenedReceiptReplay=True)
    finally:
        client.close()
        receipt['calls'] = author.calls
        receipt['binaries'] = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in [args.mcp, args.adapter]}
        receipt['sourceAfter'] = {'scenario': hashes(args.scenario), 'application': hashes(args.application_data)}
        (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print('PROVIDENCE_MCP_CLASSIC_IMPORT_OK preflight granted-inputs captured-job baseline-only stale-cancel rules history reopen unchanged-source')


if __name__ == '__main__':
    main()
