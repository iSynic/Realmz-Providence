"""Exercise advertised MCP inputs against real native authoring in an isolated project."""
import argparse
import hashlib
import json
from pathlib import Path
from mcp_test_client import Client, Author
from mcp_rule_journey import run as rule_journey


def strings(author):
    allocation = author.call('providence_text_allocate', {'family': 'message'})
    number = allocation['nativeId']
    preview = author.call('providence_text_apply_draft', {'draft': {
        'family': 'message', 'nativeId': number, 'expectedText': None, 'text': 'A Café crossroads'}})
    author.commit(preview, 'allocated-message')
    opened = author.call('providence_message_open', {'nativeId': number})['message']
    assert opened['text'] == 'A Café crossroads'
    identity = opened['identity']
    for field, value in [('expectedRevision', 0), ('projectId', 'other-project'),
                         ('sessionGeneration', 'other-session'), ('operationId', 'misplaced-operation')]:
        rejected = author.call('providence_changes_prepare', {'steps': [{
            'name': 'contradiction', 'tool': 'providence_message_update',
            'arguments': {'identity': identity, 'text': 'Conflicting intent', field: value}}]}, expect_error=True)
        assert rejected['code'] == 'step-context-conflict', rejected
    assert author.call('providence_message_open', {'nativeId': number})['message']['text'] == opened['text']
    assert author.call('providence_discovery_preview', {'identity': identity})['record']['identity'] == identity
    author.call('providence_discovery_links', {'direction': 'outgoing', 'identity': identity})
    flow = author.call('providence_discovery_flow', {'root': {'identity': identity}, 'direction': 'both', 'depth': 2})
    assert len(flow['graph']['nodes']) == 1
    assert author.call('providence_message_list', {'query': 'not present'})['total'] == 0


def world(author):
    created = author.group([
        {'name': 'map', 'tool': 'providence_map_create', 'arguments': {'levelType': 'land'}},
        {'name': 'point', 'tool': 'providence_action_point_create', 'arguments': {
            'mapIdentity': {'$result': 'map', 'pointer': '/changedEntities/0'}, 'x': 1, 'y': 2}},
        {'name': 'start', 'tool': 'providence_start_location_set', 'arguments': {'location': {
            'map': {'$result': 'map', 'pointer': '/changedEntities/0'}, 'coordinate': {'x': 1, 'y': 1}}}},
    ], 'map-ap-and-start')
    map_identity = created['map']['changedEntities'][0]
    point = created['point']['changedEntities'][0]
    row = author.call('providence_action_point_open', {'identity': point})['actionPoint']
    marker = row['activation']['entryMarker']
    header = {field: row[field] for field in ['coordinate', 'postActionLevel', 'postActionX', 'postActionY']}
    header['chancePercent'] = 0
    author.group([{'name': 'dormant', 'tool': 'providence_action_point_apply_draft', 'arguments': {
        'draft': {'source': point, 'header': header, 'steps': []}}}], 'dormant-ap')
    for chance, total in [('nonpositive', 1), ('positive', 0)]:
        assert author.call('providence_action_point_list', {
            'mapIdentity': map_identity, 'activationFilters': {'chance': chance}})['total'] == total
    assert author.call('providence_action_point_open', {'identity': point})['actionPoint']['activation']['entryMarker'] == marker
    author.call('providence_map_region', {'identity': map_identity, 'x': 0, 'y': 0, 'width': 3, 'height': 3})
    author.call('providence_history_undo', {'operationId': 'undo-dormant'})
    assert author.call('providence_action_point_list', {
        'mapIdentity': map_identity, 'activationFilters': {'chance': 'positive'}})['total'] == 1
    author.call('providence_history_redo', {'operationId': 'redo-dormant'})


def settings(author):
    identity = 'land:0'
    original = author.call('providence_level_settings_open', {'identity': identity})['settings']
    region = {'identity': identity, 'x': 0, 'y': 0, 'width': 3, 'height': 3}
    cells = author.call('providence_map_region', region)['cells']
    edited = dict(original, name='Café crossroads', dark=True, usesLos=True)
    assert author.call('providence_level_settings_preview', {'identity': identity, 'edit': edited})['canApply']
    preview = author.call('providence_level_settings_apply', {'identity': identity, 'edit': edited})
    assert preview['changePreviews']['edit']['affectedMaps'][0]['identity'] == identity
    assert author.call('providence_level_settings_open', {'identity': identity})['settings'] == original
    author.commit(preview, 'named-level-settings')
    assert author.call('providence_level_settings_open', {'identity': identity})['settings'] == edited
    assert author.call('providence_map_region', region)['cells'] == cells
    author.call('providence_history_undo', {'operationId': 'undo-level-settings'})
    assert author.call('providence_level_settings_open', {'identity': identity})['settings'] == original
    author.call('providence_history_redo', {'operationId': 'redo-level-settings'})

    startup = {'name': 'Café crossroads', 'markerFilename': 'Crossroads',
               'recommendedPartyLevels': 6, 'maximumPartyLevels': 36, 'creatorUserCheck': 'Author',
               'startLocation': {'map': identity, 'coordinate': {'x': 1, 'y': 1}}}
    contact = {'title': 'Café crossroads', 'version': '1', 'date': '', 'author': 'Author',
               'email': '', 'web': '', 'fee': '', 'description': '  Two ways through the gate  '}
    restrictions = {'description': 'Bring a small party.', 'maxPartySize': 4, 'maxLevel': 20,
                    'bannedRaces': [], 'bannedCastes': []}
    for family, field, draft in [('startup', 'startup', startup), ('contact', 'contact', contact),
                                 ('restrictions', 'restrictions', restrictions)]:
        assert author.call('providence_scenario_' + family + '_validate', {field: draft})['valid']
    assert not author.call('providence_scenario_startup_validate', {
        'startup': dict(startup, markerFilename='Data LD')})['valid']
    assert not author.call('providence_scenario_contact_validate', {
        'contact': dict(contact, description='Unrepresentable 🗺')})['valid']
    author.group([{'name': family, 'tool': 'providence_scenario_' + family + '_update',
                   'arguments': {field: draft}}
                  for family, field, draft in [('startup', 'startup', startup), ('contact', 'contact', contact),
                                                ('restrictions', 'restrictions', restrictions)]], 'scenario-sections')
    campaign = author.call('providence_session_describe', guarded=False)['campaign']
    assert campaign['name'] == startup['name'] and campaign['description'] == contact['description']
    assert campaign['restrictions'] == restrictions and campaign['contactProvenance'] == 'authored'
    author.call('providence_project_save', {'operationId': 'checkpoint-settings'})
    author.call('providence_project_close', guarded=False)
    author.call('providence_project_open', {'path': 'scenario'}, guarded=False)
    assert author.call('providence_level_settings_open', {'identity': identity})['settings'] == edited
    assert author.call('providence_session_describe', guarded=False)['campaign'] == campaign
    author.call('providence_history_undo', {'operationId': 'undo-reopened-scenario-sections'})
    assert author.call('providence_session_describe', guarded=False)['campaign'] != campaign
    assert author.call('providence_level_settings_open', {'identity': identity})['settings'] == edited
    author.call('providence_history_redo', {'operationId': 'redo-reopened-scenario-sections'})


def encounters(author):
    for kind in ['rogue', 'timed']:
        reviewed = author.call('providence_encounter_prepare_create', {'kind': kind})
        author.group([{'name': kind, 'tool': 'providence_encounter_create_' + kind, 'arguments': {}}], 'create-' + kind)
        opened = author.call('providence_encounter_open_' + kind, {'identity': reviewed['identity']})
        row = opened['encounter']
        if kind == 'rogue':
            row.update(lowDamage=1, highDamage=2)
        else:
            row['day'] = 3
        author.group([{'name': kind, 'tool': 'providence_encounter_apply_' + kind + '_draft',
                       'arguments': {'draft': row}}], 'edit-' + kind)
        assert author.call('providence_encounter_list_' + kind, {'query': 'not present'})['total'] == 0


def spells(author):
    allocation = author.call('providence_spell_allocation_review')['allocation']
    draft = allocation['draft']
    number = draft['definition']['classicId']
    assert draft['recordIndex'] == 0 and number == 5101
    draft['definition'].update(name='  Éclat  ', cost=255, saveAdjust=-128)
    assert author.call('providence_spell_draft_prepare', {'draft': draft})['valid']
    preview = author.call('providence_spell_draft_apply', {'draft': draft})
    author.commit(preview, 'allocated-custom-spell')
    identity = draft['definition']['id']
    opened = author.call('providence_spell_open_authoring', {'identity': identity})
    assert opened['definition']['name'] == '  Éclat  '
    assert opened['definition']['cost'] == 255
    copy = author.call('providence_spell_allocation_review', {'copySource': opened['copySource']})['allocation']['draft']
    assert copy['recordIndex'] == 1 and copy['definition']['name'] == '  Éclat  '
    author.group([{'name': 'copy', 'tool': 'providence_spell_draft_apply',
                   'arguments': {'draft': copy}}], 'copy-custom-spell')
    reset = author.call('providence_spell_clear_review', {'recordIndex': 0})
    assert reset['identityRetained'] and reset['incomingUses'] == 0
    author.group([{'name': 'reset', 'tool': 'providence_spell_draft_apply',
                   'arguments': {'draft': reset['draft']}}], 'reset-custom-spell')
    author.call('providence_history_undo', {'operationId': 'undo-spell-reset'})
    assert author.call('providence_spell_open_authoring', {'identity': identity})['definition']['name'] == '  Éclat  '
    author.call('providence_history_redo', {'operationId': 'redo-spell-reset'})
    assert author.call('providence_spell_open_authoring', {'identity': identity})['empty']


def items(author):
    draft = author.call('providence_item_allocation_review')['allocation']['draft']
    assert draft['recordIndex'] == 100 and draft['definition']['classicId'] == 900
    draft['definition'].update(name='  Éclat signet  ', unidentifiedName='A signet', description='Proof of trust.')
    assert author.call('providence_item_draft_prepare', {'draft': draft})['valid']
    author.group([{'name': 'item', 'tool': 'providence_item_draft_apply',
                   'arguments': {'draft': draft}}], 'allocated-required-item')
    identity = draft['definition']['id']
    opened = author.call('providence_item_open', {'identity': identity})
    assert opened['item']['name'] == '  Éclat signet  '
    assert author.call('providence_item_list', {'scope': 'scenario', 'category': 'supply', 'query': 'signet'})['total'] == 1
    copy = author.call('providence_item_allocation_review', {'copySource': opened['copySource']})['allocation']['draft']
    assert copy['recordIndex'] == 101
    author.group([{'name': 'copy', 'tool': 'providence_item_draft_apply',
                   'arguments': {'draft': copy}}], 'copy-required-item')
    reset = author.call('providence_item_clear_review', {'recordIndex': 100})
    assert reset['identityRetained'] and reset['incomingUses'] == 0
    author.group([{'name': 'reset', 'tool': 'providence_item_draft_apply',
                   'arguments': {'draft': reset['draft']}}], 'reset-required-item')
    author.call('providence_history_undo', {'operationId': 'undo-item-reset'})
    assert author.call('providence_item_open', {'identity': identity})['item']['name'] == '  Éclat signet  '
    author.call('providence_history_redo', {'operationId': 'redo-item-reset'})
    assert author.call('providence_item_open', {'identity': identity})['item']['name'] != '  Éclat signet  '


def monsters(author):
    allocation = author.call('providence_monster_allocate', {'setId': 0})['allocation']
    assert allocation['nativeId'] == 1
    author.group([{'name': 'monster', 'tool': 'providence_monster_operation_commit', 'arguments': {
        'operation': allocation['operation'], 'reviewHash': allocation['reviewHash']}}], 'allocated-monster')
    assert author.call('providence_monster_open', {'setId': 0, 'nativeId': 1})['monster']['hitDice'] == 1
    draft = {'setId': 0, 'nativeId': 1, 'fields': {'displayName': 'Gatekeeper', 'stamina': 300, 'staminaMax': 300,
             'attacks.0.0': 1}, 'description': 'A vigilant guard.'}
    author.group([{'name': 'edit', 'tool': 'providence_monster_draft_apply', 'arguments': {'draft': draft}}], 'edit-monster')
    opened = author.call('providence_monster_open', {'setId': 0, 'nativeId': 1})
    assert opened['monster']['stamina'] == 300 and opened['monster']['displayName'] == 'Gatekeeper'
    assert author.call('providence_monster_allocate', {'setId': 1})['allocation']['nativeId'] == 2
    author.call('providence_history_undo', {'operationId': 'undo-monster-edit'})
    assert author.call('providence_monster_open', {'setId': 0, 'nativeId': 1})['monster']['stamina'] != 300
    author.call('providence_history_redo', {'operationId': 'redo-monster-edit'})


def gameplay(author):
    allocation = author.call('providence_battle_allocate')['allocation']
    battle = allocation['battle']
    assert len(battle['grid']) == 169
    battle['grid'][0] = 1
    assert author.call('providence_battle_draft_prepare', {'battle': battle})['valid']
    author.group([{'name': 'battle', 'tool': 'providence_battle_draft_apply', 'arguments': {
        'battle': battle, 'creation': True}}], 'battle-with-allocated-monster')
    assert author.call('providence_battle_open', {'nativeId': battle['nativeId']})['battle']['grid'][0] == 1
    copy = author.call('providence_battle_allocate', {'sourceId': battle['nativeId']})['allocation']
    author.group([{'name': 'battle', 'tool': 'providence_battle_draft_apply', 'arguments': {
        'battle': copy['battle'], 'copySource': copy['copySource'], 'creation': True}}], 'copy-battle')
    assert author.call('providence_battle_clear_prepare', {'nativeId': battle['nativeId']})['review']['incomingUses'] == 0
    for family, field, value in [('treasure', 'gold', 22), ('shop', 'inflation', 7)]:
        number = author.call('providence_' + family + '_list')['nextNativeId']
        author.group([{'name': family, 'tool': 'providence_' + family + '_create',
                       'arguments': {'nativeId': number}}], 'create-' + family)
        record = author.call('providence_' + family + '_open', {'nativeId': number})[family]
        record[field] = value
        author.group([{'name': family, 'tool': 'providence_' + family + '_update',
                       'arguments': {family: record}}], 'edit-' + family)
        assert author.call('providence_' + family + '_open', {'nativeId': number})[family][field] == value


def player_maps(author):
    catalog = author.call('providence_player_map_list')
    number = catalog['nextFreeNativeId']
    created = author.group([{'name': 'map', 'tool': 'providence_player_map_create',
                            'arguments': {}}], 'allocate-player-map')
    identity = created['map']['changedEntities'][0]
    opened = author.call('providence_player_map_open', {'identity': identity})
    row = opened['playerMap']
    assert row['nativeId'] == number and len(row['markers']) == 10
    row['note'] = '  Café crossroads  '
    names = {'availableName': 'Éclat chart', 'unavailableName': 'Chart not found'}
    assert author.call('providence_player_map_validate', {'playerMap': row, 'names': names})['valid']
    invalid = dict(row, note='Unrepresentable 🗺')
    assert not author.call('providence_player_map_validate', {'playerMap': invalid, 'names': names})['valid']
    assert author.call('providence_player_map_open', {'identity': identity})['playerMap']['note'] != row['note']
    author.group([{'name': 'chart', 'tool': 'providence_player_map_apply_draft',
                   'arguments': {'playerMap': row, 'names': names}}], 'edit-player-map-and-names')
    edited = author.call('providence_player_map_open', {'identity': identity})
    assert edited['playerMap']['note'] == row['note']
    assert edited['names']['availableName'] == names['availableName']
    author.call('providence_history_undo', {'operationId': 'undo-player-map'})
    undone = author.call('providence_player_map_open', {'identity': identity})
    assert undone['playerMap']['note'] != row['note']
    assert undone['names']['availableName'] != names['availableName']
    author.call('providence_history_redo', {'operationId': 'redo-player-map'})
    assert author.call('providence_player_map_open', {'identity': identity})['names']['availableName'] == names['availableName']
    author.call('providence_project_save', {'operationId': 'checkpoint-player-map'})
    author.call('providence_project_close', guarded=False)
    author.call('providence_project_open', {'path': 'scenario'}, guarded=False)
    reopened = author.call('providence_player_map_open', {'identity': identity})
    assert reopened['playerMap']['note'] == row['note']
    assert reopened['names']['availableName'] == names['availableName']
    author.call('providence_history_undo', {'operationId': 'undo-reopened-player-map'})
    assert author.call('providence_player_map_open', {'identity': identity})['playerMap']['note'] != row['note']
    author.call('providence_history_redo', {'operationId': 'redo-reopened-player-map'})


def main():
    parser = argparse.ArgumentParser()
    for name in ['mcp', 'adapter', 'output']:
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--rules-root', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    receipt = {'status': 'failed', 'captureFormatVersion': 2,
               'toolCapture': 'immutable parsed requests and replies; returned drafts may be edited without changing retained calls',
               'retention': 'retain receipts and failures under caller-declared evidence root',
               'scope': 'allocated text, items, Custom spells and Monsters; battle/copy/rewards/shop; named level and scenario settings; Player Map record/names/history/reopen; configured Race/Caste authoring; Flow, linked map/AP/start, activation filters, Rogue/Timed drafts and shared history; not a playable scenario',
               'ruleAuthoringConfigured': bool(args.rules_root)}
    support = ['--application-rules-root', args.rules_root] if args.rules_root else []
    client = Client(args.mcp, args.adapter, args.output, args.output / 'mcp.log', support_options=support)
    author = Author(client)
    try:
        created = author.call('providence_project_create', {'path': 'scenario'}, guarded=False)
        assert created['creation']['stockInitialized'] == bool(args.rules_root)
        if args.rules_root:
            for family in ['race', 'caste']:
                assert author.call('providence_' + family + '_rule_list', {'limit': 30})['total'] == 30
        strings(author)
        world(author)
        settings(author)
        encounters(author)
        spells(author)
        items(author)
        monsters(author)
        gameplay(author)
        player_maps(author)
        if args.rules_root:
            rule_journey(author)
        receipt['revision'] = client.value('providence_session_describe')['revision']
        receipt['status'] = 'passed'
    finally:
        client.close()
        receipt['calls'] = author.calls
        receipt['binaries'] = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in [args.mcp, args.adapter]}
        (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print('PROVIDENCE_MCP_AUTHORING_CONTRACTS_OK allocated-text Flow linked-map AP filters settings Rogue Timed Custom-spells Monsters battle rewards shop Player-Maps configured-rules history reopen')


if __name__ == '__main__':
    main()
