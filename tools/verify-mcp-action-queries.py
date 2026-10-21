"""Verify typed instruction queries and signed behavior through the stdio MCP server."""
import argparse
import hashlib
import json
from pathlib import Path
from mcp_test_client import Author, Client, meta


def describe(author, opcode, value=0, words=None, **extra):
    query = {'actionIdentity': f'realmz.action.{opcode}', 'targetNativeId': value, **extra}
    if words is not None:
        initial = author.call('providence_action_form_describe', {'query': query})
        query['values'] = {field['key']: words[field['index']] for field in initial['fields']
                           if field['row'] == 'primary' and field['index'] is not None}
    return author.call('providence_action_form_describe', {'query': query})


def primary(form, index):
    return next(field for field in form['fields'] if field['row'] == 'primary' and field['index'] == index)


def queries(author):
    before = author.call('providence_session_describe', guarded=False)
    for opcode, kind in [(1, 'message'), (6, 'shop'), (9, 'sound'), (29, 'player-map'), (47, 'quest')]:
        for value in [-1101, 1101]:
            form = describe(author, opcode, value)
            field = next(field for field in form['fields'] if field['row'] == 'action')
            behavior = field['referenceBehavior']
            assert field['value'] == value and behavior['targetKind'] == kind
            assert behavior['checked'] == (value < 0) and behavior['toggleValue'] == -value
            assert behavior['selectionMultiplier'] == (-1 if value < 0 else 1)
    for opcode, value in [(9, -32768), (47, 0)]:
        field = describe(author, opcode, value)['fields'][0]
        assert field['value'] == value and field['referenceBehavior']['toggleValue'] is None
        assert field['referenceBehavior']['unavailableReason']

    battle = describe(author, 2, 1, [0, 4, -1101, -1, 0], context={
        'scriptKind': 'extra-action-point', 'targetContext': {'mapIdentity': 'land:0', 'levelType': 'land'},
        'authoring': {'modes': {'battleSelection': 0}, 'selections': {'battleHigh': 4}}})
    assert primary(battle, 1)['value'] == 0
    assert primary(battle, 2)['referenceBehavior']['checked']
    assert primary(battle, 3)['referenceBehavior']['checked']
    coupled = describe(author, 2, 1, [0, 0, 1101, -1, 10])
    assert primary(coupled, 2)['referenceBehavior']['toggleValue'] is None
    assert 'revive-loss' in primary(coupled, 2)['referenceBehavior']['note']
    for mode, enabled in [(0, False), (2, True)]:
        form = describe(author, 21, 0, [0, 0, mode, 0, -1])
        assert ('referenceBehavior' in primary(form, 4)) == enabled
    assert 'referenceBehavior' not in primary(describe(author, 15, 0, [0, 0, 0, -1101, -1]), 4)
    shop = primary(describe(author, 73, 0, [-1, 0, 0, 0, 0]), 0)
    assert shop['referenceBehavior']['checked'] and shop['referenceBehavior']['targetKind'] == 'shop'
    minimum = primary(describe(author, 74, 0, [0, 1101, 0, 1, 0]), 1)
    assert minimum['referenceBehavior']['toggleValue'] is None and minimum['referenceBehavior']['note']
    describe(author, 92, 0, secondaryValues={'companion': -32768}, context={
        'scriptKind': 'simple-encounter', 'encounterResultIndex': 0, 'encounterStepIndex': 0})

    query = {'kind': 'sound', 'search': 'Talk', 'limit': 1}
    first = author.call('providence_action_target_list', {'query': query})
    assert len(first['items']) == 1 and first['nextCursor']
    second = author.call('providence_action_target_list', {'query': dict(query, cursor=first['nextCursor'])})
    assert len(second['items']) == 1 and first['items'][0]['identity'] != second['items'][0]['identity']
    targets = author.call('providence_action_target_list', {'query': dict(query, limit=40)})
    talk = next(row for row in targets['items'] if row['value'] == 1101)
    field = describe(author, 9, -1100)['fields'][0]
    selected = talk['value'] * field['referenceBehavior']['selectionMultiplier']
    assert selected == -1101 and describe(author, 9, selected)['fields'][0]['referenceBehavior']['checked']
    points = author.call('providence_action_target_list', {'query': {'kind': 'same-map-action-point',
        'limit': 1, 'context': {'mapIdentity': 'land:0', 'levelType': 'land'}}})
    assert len(points['items']) == 1
    author.call('providence_action_form_shared_impact', {'query': {
        'expectedRevision': before['revision'], 'source': 'extra-action-point:0', 'steps': [], 'limit': 1}})

    for tool, query in [
        ('providence_action_form_describe', 'serialized query'),
        ('providence_action_form_describe', {'actionIdentity': 'realmz.action.9', 'targetNativeId': -32769}),
        ('providence_action_form_describe', {'actionIdentity': 'realmz.action.9', 'context': {'apply': True}}),
        ('providence_action_target_list', {'kind': 'sound', 'limit': 129}),
        ('providence_action_target_list', {'kind': 'unknown', 'limit': 1}),
    ]:
        error = author.call(tool, {'query': query}, expect_error=True)
        assert 'invalid-input' in json.dumps(error), error
    after = author.call('providence_session_describe', guarded=False)
    assert before == after, 'Queries must not change revision, history or dirty state'
    return before, selected


def guards(author, before, selected):
    author.group([{'name': 'message', 'tool': 'providence_message_update',
                   'arguments': {'identity': 'message:1', 'text': 'Query revision boundary'}},
                  {'name': 'signed', 'tool': 'providence_extra_action_point_step_apply',
                   'arguments': {'edit': {'source': 'extra-action-point:0', 'slot': 0,
                                         'actionIdentity': 'realmz.action.9', 'targetNativeId': selected}}}], 'advance-revision')
    def current():
        row = author.call('providence_extra_action_point_open', {'identity': 'extra-action-point:0'})
        return row['steps'][0]['targetNativeId'] if row['steps'] else None
    assert current() == selected
    for tool, query in [
        ('providence_action_form_describe', {'actionIdentity': 'realmz.action.9', 'targetNativeId': -1101}),
        ('providence_action_target_list', {'kind': 'sound', 'limit': 1, 'cursor': '1'}),
    ]:
        error = author.call(tool, {**meta(before), 'query': query}, guarded=False, expect_error=True)
        assert error['code'] == 'revision-conflict', error
        wrong = dict(meta(author.call('providence_session_describe', guarded=False)), sessionGeneration='wrong')
        error = author.call(tool, {**wrong, 'query': query}, guarded=False, expect_error=True)
        assert error['code'] == 'session-stale', error
    author.call('providence_history_undo', {'operationId': 'undo-revision-boundary'})
    assert current() != selected
    author.call('providence_history_redo', {'operationId': 'redo-revision-boundary'})
    assert current() == selected
    author.call('providence_project_save', {'operationId': 'query-checkpoint'})
    author.call('providence_project_close', guarded=False)
    author.call('providence_project_open', {'path': 'scenario'}, guarded=False)
    assert current() == selected
    assert describe(author, 9, -1101)['fields'][0]['referenceBehavior']['checked']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['mcp', 'adapter', 'output', 'application-library']:
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    receipt = {'status': 'failed', 'scope': 'Typed MCP instruction queries, behavior metadata, bounds, contexts, pagination, revision/session guards and non-mutating reads; no runtime claim',
               'retention': 'retain receipts and failures under caller-declared evidence root'}
    client = Client(args.mcp, args.adapter, args.output, args.output / 'mcp.log',
                    support_options=['--application-library-root', args.application_library.resolve()])
    author = Author(client)
    try:
        tools = client.rpc('tools/list', {})['tools']
        receipt['advertisedSchemas'] = {row['name']: row['inputSchema'] for row in tools
                                      if row['name'] in ['providence_action_form_describe',
                                                        'providence_action_target_list', 'providence_action_form_shared_impact']}
        author.call('providence_project_create', {'path': 'scenario'}, guarded=False)
        author.group([
            {'name': 'map', 'tool': 'providence_map_create', 'arguments': {'levelType': 'land'}},
            {'name': 'ap', 'tool': 'providence_action_point_create', 'arguments': {'mapIdentity': 'land:0', 'x': 1, 'y': 1}},
            {'name': 'xap', 'tool': 'providence_extra_action_point_create', 'arguments': {'nativeId': 0}},
            {'name': 'message', 'tool': 'providence_message_create', 'arguments': {'nativeId': 1, 'text': 'Original query fixture'}},
        ], 'query-fixture')
        before, selected = queries(author)
        guards(author, before, selected)
        receipt['status'] = 'passed'
    finally:
        client.close()
        receipt['calls'] = author.calls
        receipt['binaries'] = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in [args.mcp, args.adapter]}
        (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print('PROVIDENCE_MCP_ACTION_QUERIES_OK forms targets shared-impact signed-behavior bounds contexts pagination revision history reopen')


if __name__ == '__main__':
    main()
