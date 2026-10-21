"""Exercise exact stock/scenario artwork and Player Map resource selection through MCP."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from mcp_test_client import Author, Client

SPEC = importlib.util.spec_from_file_location('media_fixture', Path(__file__).with_name('verify-mcp-media.py'))
MEDIA = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MEDIA)


def unconfigured(args, projects, receipt):
    client = Client(args.mcp, args.adapter, projects, args.output / 'unconfigured.log')
    author = Author(client)
    try:
        author.call('providence_project_create', {'path': 'no-support'}, guarded=False)
        assert author.call('providence_application_media_describe')['configured'] is False
        assert author.call('providence_application_media_list', {'limit': 1})['total'] == 0
        author.call('providence_application_media_open', {'identity': 'unavailable'}, expect_error=True)
    finally:
        receipt['unconfigured'] = author.calls
        client.close()


def stock(author):
    before = author.call('providence_session_describe', guarded=False)
    support = author.call('providence_application_media_describe')
    assert support['configured'] and support['assets'] > 1
    first = author.call('providence_application_media_list', {'limit': 1})
    second = author.call('providence_application_media_list', {'offset': 1, 'limit': 1})
    assert first['truncated'] and first['total'] == support['assets']
    assert first['items'][0]['identity'] != second['items'][0]['identity']
    icons = author.call('providence_application_media_list', {'kind': 'icon', 'limit': 128})['items']
    selected = next(row for row in icons if row['previewAvailable'] and 0 < row['classicResource']['resourceId'] < 32768)
    opened = author.call('providence_application_media_open', {'identity': selected['identity']})
    assert opened['asset']['identity'] == selected['identity'] and not opened['projectOwnership']
    preview = author.call('providence_application_media_preview', {'identity': selected['identity']})
    assert preview['imageIncluded'] and 'base64' not in preview and not preview['projectOwnership']
    assert sum(block['type'] == 'image' for block in author.calls[-1]['response']['content']) == 1
    after = author.call('providence_session_describe', guarded=False)
    assert before['revision'] == after['revision'] and before['undoEntry'] == after['undoEntry']
    return selected


def marker(author):
    portrait = author.call('providence_application_media_list', {'kind': 'portrait', 'limit': 1})['items'][0]
    number = portrait['classicResource']['resourceId']
    query = {'field': 'marker', 'currentValue': number, 'search': str(number), 'ownership': 'stock', 'limit': 1}
    page = author.call('providence_player_map_resources_list', {'query': query})['page']
    assert len(page['items']) == 1 and page['items'][0]['available']
    assert page['items'][0]['targetIdentity'] == portrait['identity']
    preview = author.call('providence_player_map_resource_preview', {'field': 'marker', 'value': number})
    assert preview['identity'] == portrait['identity'] and preview['imageIncluded']
    assert sum(block['type'] == 'image' for block in author.calls[-1]['response']['content']) == 1
    author.call('providence_player_map_resources_list', {'query': dict(query, limit=129)}, expect_error=True)
    return {'number': number, 'identity': preview['identity']}


def assign(author, inputs, selected):
    allocation = author.call('providence_media_import_allocate', {'kind': 'icon'})
    imported = author.group(MEDIA.import_steps('icon', {
        'kind': 'icon', 'name': 'Beacon signet', 'path': str(inputs / 'picture.png'),
        'resourceId': allocation['resourceId']}), 'reference-icon')
    identity = imported['icon_review']['media']['primary']['identity']
    draft = author.call('providence_item_allocation_review')['allocation']['draft']
    draft['definition']['name'] = 'Beacon signet'
    author.group([{'name': 'item', 'tool': 'providence_item_draft_apply', 'arguments': {'draft': draft}}], 'reference-item')
    item_id, index = draft['definition']['id'], draft['recordIndex']
    before = author.call('providence_item_open', {'identity': item_id})['item']['iconId']
    prepared = author.call('providence_scenario_item_use_stock_artwork', {'identity': selected['identity'], 'recordIndex': index})
    assert author.call('providence_item_open', {'identity': item_id})['item']['iconId'] == before
    author.commit(prepared, 'reference-stock-artwork')
    number = selected['classicResource']['resourceId']
    assert author.call('providence_item_open', {'identity': item_id})['item']['iconId'] == number
    assert author.call('providence_item_artwork_resolve', {'iconId': number})['choice']['available']
    author.group([{'name': 'art', 'tool': 'providence_scenario_item_use_scenario_artwork',
                   'arguments': {'identity': identity, 'recordIndex': index}}], 'reference-scenario-artwork')
    assert author.call('providence_item_open', {'identity': item_id})['item']['iconId'] == allocation['resourceId']
    assert author.call('providence_project_asset_list')['total'] == 1
    author.call('providence_scenario_item_use_stock_artwork', {'identity': identity, 'recordIndex': index}, expect_error=True)
    author.call('providence_history_undo', {'operationId': 'reference-undo'})
    assert author.call('providence_item_open', {'identity': item_id})['item']['iconId'] == number
    author.call('providence_history_redo', {'operationId': 'reference-redo'})
    author.call('providence_project_save', {'operationId': 'reference-checkpoint'})
    author.call('providence_project_close', guarded=False)
    author.call('providence_project_open', {'path': 'scenario'}, guarded=False)
    assert author.call('providence_item_open', {'identity': item_id})['item']['iconId'] == allocation['resourceId']
    assert author.call('providence_project_asset_list')['total'] == 1
    return {'itemIdentity': item_id, 'stockIdentity': selected['identity'], 'scenarioIdentity': identity}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['mcp', 'adapter', 'output', 'application-library']:
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    projects, inputs = args.output / 'projects', args.output / 'inputs'
    projects.mkdir()
    MEDIA.sources(inputs)
    receipt = {'status': 'failed', 'scope': 'Actual SDK exact-resource selection and item assignment; not gameplay or complete media certification',
               'retention': 'Retain cited receipts, failures and bounded inputs under the declared output root'}
    client, author = None, None
    try:
        unconfigured(args, projects, receipt)
        client = Client(args.mcp, args.adapter, projects, args.output / 'mcp.log', input_roots=[inputs],
                        support_options=['--application-library-root', args.application_library])
        author = Author(client)
        author.call('providence_project_create', {'path': 'scenario'}, guarded=False)
        selected = stock(author)
        receipt['marker'] = marker(author)
        receipt['assignment'] = assign(author, inputs, selected)
        receipt['status'] = 'passed'
    finally:
        if client is not None:
            client.close()
        receipt['calls'] = author.calls if author is not None else []
        receipt['binaries'] = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in [args.mcp, args.adapter]}
        (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print('PROVIDENCE_MCP_REFERENCE_MEDIA_OK stock-page exact-preview portrait-marker scenario-stock assignments history reopen')


if __name__ == '__main__':
    main()
