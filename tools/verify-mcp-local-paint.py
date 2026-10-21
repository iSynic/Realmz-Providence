"""Author local paint resources and verify their separate history and native refresh."""
import argparse
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
from mcp_test_client import Author, Client

SPEC = importlib.util.spec_from_file_location('collaboration_fixture', Path(__file__).with_name('verify-mcp-collaboration.py'))
LIVE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LIVE)


def save(author, resource_revision, change, operation, expect_error=False):
    return author.call('providence_paint_resources_apply', dict(resourceRevision=resource_revision,
                       change=change, operationId=hashlib.sha256(operation.encode()).hexdigest()), expect_error=expect_error)


def setup(author):
    author.call('providence_project_create', dict(path='scenario'), guarded=False)
    author.group([dict(name='opening', tool='providence_message_create', arguments=dict(nativeId=1, text='Opening message')),
                  dict(name='land', tool='providence_map_create', arguments=dict(levelType='land'))], 'paint-world')
    allocation = author.call('providence_paint_resources_allocate', dict(identity='land:0', kind='stamp'))
    resource = allocation['resource']
    resource.update(name='Crossroads', collection='Village')
    changed = author.call('providence_paint_resources_geometry', dict(resource=resource,
                          edit=dict(operation='resize', width=2, height=2, fill=0)))
    resource = changed['preview']['resource']
    assert len(resource['cells']) == 1
    resource = author.call('providence_paint_resources_geometry', dict(resource=resource,
                          edit=dict(operation='set-cell', x=1, y=1, tile=2)))['preview']['resource']
    author.call('providence_paint_resources_preview', dict(identity='land:0', resource=resource))
    before = author.call('providence_session_describe', guarded=False)
    saved = save(author, allocation['resourceRevision'], dict(operation='create', resource=resource), 'create-stamp')
    assert saved['historyScope'] == 'local paint resources; outside project Undo/Redo'
    after = author.call('providence_session_describe', guarded=False)
    assert after['revision'] == before['revision'] and after['undoEntry'] == before['undoEntry']
    feed = author.call('providence_session_changes', dict(cursor=before['changeCursor']))
    assert feed['changes'][-1]['refreshScopes'] == ['paint-resources']
    assert after['localResourceCursor'] > before['localResourceCursor']
    status = author.call('providence_paint_resources_operation_status', dict(resourceRevision=allocation['resourceRevision'],
                         change=dict(operation='create', resource=resource), operationId=hashlib.sha256(b'create-stamp').hexdigest()))
    assert status['outcome'] == 'committed'
    remembered = save(author, saved['resourceRevision'], dict(operation='remember', identity=resource['identity']), 'remember-stamp')
    replayed = save(author, allocation['resourceRevision'], dict(operation='create', resource=resource), 'create-stamp')
    assert replayed['resourceRevision'] == saved['resourceRevision']
    save(author, remembered['resourceRevision'], dict(operation='delete', identity=resource['identity']), 'create-stamp', expect_error=True)
    return resource, remembered['resourceRevision']


def placement_and_stale(author, resource, resource_revision):
    arguments = dict(identity='land:0', resourceIdentity=resource['identity'], resourceRevision=resource_revision,
                     origin=dict(x=4, y=5))
    preview = author.call('providence_map_stamp_apply', arguments)
    edited = deepcopy(resource)
    edited['name'] = 'Crossroads updated'
    result = save(author, resource_revision, dict(operation='replace', resource=edited), 'rename-stamp')
    author.call('providence_changes_commit', dict(previewToken=preview['previewToken'], operationId='stale-placement'), expect_error=True)
    preview = author.call('providence_map_stamp_apply', dict(arguments, resourceRevision=result['resourceRevision']))
    author.commit(preview, 'apply-stamp')
    cells = author.call('providence_map_region', dict(identity='land:0', x=4, y=5, width=2, height=2))['cells']
    assert cells[0]['nativeWord'] == 1 and cells[-1]['nativeWord'] == 2
    author.call('providence_history_undo', dict(operationId='undo-stamp'))
    opened = author.call('providence_paint_resources_open', dict(identity='land:0', resourceIdentity=resource['identity']))
    assert opened['resource']['name'] == edited['name']
    author.call('providence_history_redo', dict(operationId='redo-stamp'))
    allocation = author.call('providence_paint_resources_allocate', dict(identity='land:0', kind='stamp'))
    assert allocation['resource']['identity'] != resource['identity']
    captured = author.call('providence_paint_resources_capture', dict(identity='land:0',
                           cells=[dict(x=4, y=5), dict(x=5, y=6)], resource=allocation['resource']))
    assert [cell['tile'] for cell in captured['capture']['resource']['cells']] == [1, 2]
    features = author.call('providence_paint_resources_preview_features', dict(tile=0,
                           changes=[dict(primitive='wall', enabled=True)]))
    assert features['preview']['tile'] != 0
    return edited, result['resourceRevision']


def native_refresh(author, native, resource, revision):
    native.command('allow')
    opened = native.command('resources')
    assert opened['response']['ok'], opened
    native.command('open-resource', identity=resource['identity'])
    resource = dict(resource, name='Native sees this stamp')
    before = author.call('providence_session_describe', guarded=False)
    result = save(author, revision, dict(operation='replace', resource=resource), 'live-rename-stamp')
    observed = LIVE.await_value(lambda:native.command('inspect-resources'),
                               lambda value:value['paintResource'].get('name') == resource['name'])
    assert observed['revision'] == before['revision'] and not observed['draft']
    native.command('resource-draft', text='Human stamp draft')
    LIVE.await_value(lambda:author.client.value('providence_session_describe'), lambda value:value['nativeDraftActive'])
    rejected = save(author, result['resourceRevision'], dict(operation='delete', identity=resource['identity']),
                    'blocked-resource-delete', expect_error=True)
    assert rejected['code'] == 'draft-active'
    assert native.command('inspect-resources')['paintResource']['name'] == 'Human stamp draft'
    native.command('discard-resource')
    LIVE.clean(author.client)
    result = save(author, result['resourceRevision'], dict(operation='delete', identity=resource['identity']), 'delete-stamp')
    LIVE.await_value(lambda:native.command('inspect-resources'), lambda value:not value['paintResource'])
    return result['resourceRevision']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['mcp', 'adapter', 'godot', 'application-library', 'output']:
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=False)
    client = Client(args.mcp, args.adapter, args.output, args.output / 'mcp.log',
                    support_options=['--application-library-root', args.application_library])
    author, native = Author(client), None
    receipt = dict(status='failed', captureFormatVersion=2,
                   retention='Retain bounded fixtures, failures and receipts under the declared evidence root',
                   scope='Local stamp authoring, revision/receipt isolation and live native refresh; not custom atlas or runtime traversal')
    try:
        resource, revision = setup(author)
        resource, revision = placement_and_stale(author, resource, revision)
        author.call('providence_project_close', guarded=False)
        native = LIVE.Native(args.godot, args.adapter, args.output / 'scenario', args.output,
                             application_library=args.application_library)
        author.call('providence_project_open', dict(path='scenario'), guarded=False)
        native_refresh(author, native, resource, revision)
        native.command('stop')
        native.process.wait(timeout=10)
        log = (args.output / 'native.log').read_text(encoding='utf-8')
        assert 'SCRIPT ERROR' not in log and 'ERROR:' not in log, log
        author.call('providence_project_save', dict(operationId='local-paint-checkpoint'))
        author.call('providence_project_close', guarded=False)
        author.call('providence_project_open', dict(path='scenario'), guarded=False)
        assert author.call('providence_paint_resources_list', dict(identity='land:0', scope='local'))['total'] == 0
        receipt['status'] = 'passed'
    finally:
        client.close()
        if native:
            native.close()
        receipt.update(calls=author.calls, binaries={str(path):hashlib.sha256(path.read_bytes()).hexdigest()
                       for path in [args.mcp, args.adapter]})
        (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print('PROVIDENCE_MCP_LOCAL_PAINT_OK local-allocation geometry capture receipt stale-placement separate-history live-native-refresh draft-guard reopen')


if __name__ == '__main__':
    main()
