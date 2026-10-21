"""Exercise native, context-bound Extra Code repairs through the actual MCP server."""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
from mcp_test_client import Author, Client


def repair(author, method, view=None, **arguments):
    if view is not None:
        arguments['draft'] = view['draft']
    return author.call('providence_action_settings_' + method, arguments)


def commit(author, view, operation):
    preview = repair(author, 'commit_repair', view)
    assert preview['changePreviews']['edit']['canApply']
    author.commit(preview, operation)


def script(author, operation):
    result = author.group([dict(name='script', tool='providence_extra_action_point_create', arguments={})], operation)
    return result['script']['changedEntities'][0]


def instruction(author, source, opcode, values, operation, secondary=None):
    settings = dict(values=values)
    if secondary is not None:
        settings['secondaryValues'] = secondary
    author.group([dict(name='instruction', tool='providence_extra_action_point_step_apply',
                      arguments=dict(edit=dict(source=source, slot=0, actionIdentity='realmz.action.' + str(opcode),
                                               targetNativeId=0, settings=settings)))], operation)


def setup(author):
    author.call('providence_project_create', dict(path='scenario'), guarded=False)
    messages = []
    for label in ['Gate opens', 'Gate waits', 'Gate closes']:
        number = author.call('providence_text_allocate', dict(family='message'))['nativeId']
        preview = author.call('providence_text_apply_draft', dict(draft=dict(
            family='message', nativeId=number, expectedText=None, text=label)))
        author.commit(preview, 'message-' + str(number))
        messages.append(number)
    source = script(author, 'original-script')
    instruction(author, source, 19, dict(messageLow=messages[0], messageHigh=messages[-1]), 'message-action')
    copied = author.group([dict(name='copy', tool='providence_extra_action_point_duplicate',
                               arguments=dict(source=source))], 'shared-script-copy')
    other = copied['copy']['changedEntities'][0]
    return source, other, messages


def current(author, source):
    return repair(author, 'prepare_repair', source=source, slot=0)


def message_draft(author, source, number, shared=False):
    view = current(author, source)
    view = repair(author, 'change_repair', view, field='firstMessage', value=str(number))
    if shared:
        view = repair(author, 'change_repair', view, field='scope', value='confirmed-actions')
    return view


def message_queries_and_isolation(author, source, other, messages):
    view = current(author, source)
    assert view['family'] == 'random-message' and view['sharedCount'] >= 1
    uses = repair(author, 'repair_uses', view, limit=1)
    assert len(uses['items']) == 1 and uses['total'] >= 1
    choices = repair(author, 'repair_choices', view, field='firstMessage', query='Gate', limit=1)
    assert choices['total'] == 3 and len(choices['items']) == 1
    peek = repair(author, 'peek_repair_message', view, identity='message:' + str(messages[1]))
    assert peek['text'] == 'Gate waits'
    changed = repair(author, 'choose_repair_message', view, field='firstMessage',
                     identity='message:' + str(messages[1]), waitsForClick=True)
    assert changed['draft']['input']['firstMessage'] == str(messages[1])
    assert repair(author, 'preview_repair', changed, offset=1)['range']['offset'] == 1
    assert repair(author, 'choose_repair_message', view, field='firstMessage', identity=None)['draft']['input']['firstMessage'] == '0'
    before_other = current(author, other)['draft']
    commit(author, changed, 'isolated-message-repair')
    assert current(author, source)['draft']['input']['firstMessage'] == str(messages[1])
    assert current(author, other)['draft']['input'] == before_other['input']
    author.call('providence_history_undo', dict(operationId='undo-isolated-message'))
    assert current(author, source)['draft']['input']['firstMessage'] == str(messages[0])
    author.call('providence_history_redo', dict(operationId='redo-isolated-message'))
    assert current(author, source)['draft']['input']['firstMessage'] == str(messages[1])
    author.call('providence_history_undo', dict(operationId='restore-shared-message'))


def shared_message_and_stale(author, source, other, messages):
    view = message_draft(author, source, messages[1], shared=True)
    assert view['draft']['confirmedCallers']
    forged = deepcopy(view['draft'])
    forged['confirmedCallers'] = []
    author.call('providence_action_settings_commit_repair', dict(draft=forged), expect_error=True)
    changed = repair(author, 'change_repair', view, field='lastMessage', value=str(messages[1]))
    assert changed['draft']['scope'] == 'only-this-action' and not changed['draft']['confirmedCallers']
    commit(author, view, 'confirmed-shared-message')
    for identity in [source, other]:
        assert current(author, identity)['draft']['input']['firstMessage'] == str(messages[1])
    retained = message_draft(author, source, messages[0])
    preview = repair(author, 'commit_repair', retained)
    author.group([dict(name='message', tool='providence_message_update', arguments=dict(
        identity='message:' + str(messages[2]), text='Gate closes at dusk'))], 'intervening-human-content')
    author.call('providence_changes_commit', dict(previewToken=preview['previewToken'], operationId='stale-repair'), expect_error=True)
    author.call('providence_action_settings_commit_repair', dict(draft=retained['draft']), expect_error=True)
    repair(author, 'compare_repair', retained)
    rebased = repair(author, 'rebase_repair', retained)
    assert rebased['draft']['input'] == retained['draft']['input']
    assert rebased['draft']['scope'] == 'only-this-action'
    commit(author, rebased, 'explicitly-rebased-repair')


def random_area(author):
    land = author.group([dict(name='land', tool='providence_map_create', arguments=dict(levelType='land'))],
                        'repair-map')['land']['changedEntities'][0]
    slots = author.call('providence_random_region_open', dict(mapIdentity=land, slot=3))
    region = dict(identity=next(slot['identity'] for slot in slots['slots'] if slot['slot'] == 3),
                  left=2, top=2, right=8, bottom=8, chanceTenThousand=0,
                  battleRange=[0, 0], randomDoors=[0, 0, 0], randomDoorPercent=[0, 0, 0],
                  only=False, option=0, soundId=0, textId=0)
    author.group([dict(name='region', tool='providence_random_region_apply', arguments=dict(mapIdentity=land, region=region))], 'repair-region')
    source = script(author, 'area-script')
    instruction(author, source, 92, dict(level=0, rect=3, isDungeon=0, percentDelta=0, shapeMode=0),
                'area-action', dict(shapeX1=2, shapeY1=8, shapeX2=2, shapeY2=8))
    view = current(author, source)
    assert view['family'] == 'random-area'
    for field, value in [('chanceAdjustment', '+2.50'), ('bound0', '3')]:
        view = repair(author, 'change_repair', view, field=field, value=value)
    assert repair(author, 'repair_choices', view, field='map')['total'] == 1
    assert repair(author, 'repair_choices', view, field='area')['total'] == 1
    before = author.call('providence_session_describe', guarded=False)['revision']
    author.group([
        dict(name='review', tool='providence_action_settings_prepare_repair', arguments=dict(source=source, slot=0)),
        dict(name='chance', tool='providence_action_settings_change_repair', arguments=dict(
            draft={'$result':'review', 'pointer':'/draft'}, field='chanceAdjustment', value='+2.50')),
        dict(name='bounds', tool='providence_action_settings_change_repair', arguments=dict(
            draft={'$result':'chance', 'pointer':'/draft'}, field='bound0', value='3')),
        dict(name='apply', tool='providence_action_settings_commit_repair', arguments=dict(
            draft={'$result':'bounds', 'pointer':'/draft'})),
    ], 'area-repair')
    assert author.call('providence_session_describe', guarded=False)['revision'] == before + 1
    edited = current(author, source)['draft']['input']
    assert edited['chanceAdjustment'] == '+2.50' and edited['bounds'][0] == '3'
    author.call('providence_history_undo', dict(operationId='undo-area-repair'))
    assert current(author, source)['draft']['input']['bounds'][0] == '2'
    author.call('providence_history_redo', dict(operationId='redo-area-repair'))
    return source, edited


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['mcp', 'adapter', 'output']:
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=False)
    receipt = dict(status='failed', captureFormatVersion=2,
        retention='Retain bounded fixtures, failures and receipts under the declared evidence root',
        scope='Native Random Message/Area repair authoring and history; no runtime outcomes or unsupported shared two-row repair')
    client = Client(args.mcp, args.adapter, args.output, args.output / 'mcp.log')
    author = Author(client)
    try:
        source, other, messages = setup(author)
        message_queries_and_isolation(author, source, other, messages)
        shared_message_and_stale(author, source, other, messages)
        area, expected = random_area(author)
        author.call('providence_project_save', dict(operationId='repair-save'))
        author.call('providence_project_close', guarded=False)
        author.call('providence_project_open', dict(path='scenario'), guarded=False)
        assert current(author, area)['draft']['input'] == expected
        assert current(author, source)['draft']['input']['firstMessage'] == str(messages[0])
        assert current(author, other)['draft']['input']['firstMessage'] == str(messages[1])
        receipt['status'] = 'passed'
    finally:
        client.close()
        receipt.update(calls=author.calls, binaries={str(path):hashlib.sha256(path.read_bytes()).hexdigest()
                       for path in [args.adapter, args.mcp]})
        (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print('PROVIDENCE_MCP_REPAIRS_OK native-drafts queries isolated shared-confirmation stale explicit-rebase atomic-history reopen')


if __name__ == '__main__':
    main()
