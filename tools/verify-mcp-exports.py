"""Check real MCP publication receipts, no-clobber behavior and captured v6 tiles."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import zipfile
from mcp_test_client import Author, Client, meta


def setup(author, map_kinds=('land', 'dungeon')):
    author.call('providence_project_create', {'path': 'scenario'}, guarded=False)
    created = author.group([{'name': kind, 'tool': 'providence_map_create', 'arguments': {'levelType': kind}}
                            for kind in map_kinds], 'export-maps')
    identity = created['land']['changedEntities'][0]
    author.group([{'name': 'startup', 'tool': 'providence_scenario_startup_update', 'arguments': {'startup': {
        'name': 'MCP export fixture', 'markerFilename': 'Crossroads', 'recommendedPartyLevels': 6,
        'maximumPartyLevels': 36, 'creatorUserCheck': '',
        'startLocation': {'map': identity, 'coordinate': {'x': 1, 'y': 1}}}}}], 'export-startup')
    findings = author.call('providence_validation_list', {'showAll': True, 'limit': 128})['items']
    assert {row['entity'] for row in findings if row['severity'] == 'error'} == {'classic.item.662', 'classic.spell.4112'}
    for tool, arguments in [
        ('providence_project_compile_classic_slice', {'directory': 'Crossroads'}),
        ('providence_project_compile_rebuilt_package', {'path': 'Crossroads.realmz2', 'minimumEngineVersion': '0.1.0'}),
    ]:
        author.call(tool, dict(arguments, operationId='missing-dependencies-' + tool), expect_error=True)
    stock_dependencies(author)
    author.call('providence_project_save', {'operationId': 'checkpoint-before-exports'})


def stock_dependencies(author):
    # These identities come from pinned stock records, not arbitrary allocations.
    item = author.call('providence_item_open', {'identity': 'classic.item.662'})['item']
    spell = author.call('providence_spell_open_authoring', {'identity': 'classic.spell.4112'})['definition']
    macro_id, monster_id = item['special'][4], spell['spellClass']
    assert macro_id == 69 and spell['special'] == 58 and monster_id == 9
    created = author.group([{'name': 'macro', 'tool': 'providence_extra_action_point_create',
                            'arguments': {'nativeId': macro_id}}], 'stock-item-program')
    source = next(identity for identity in created['macro']['changedEntities']
                  if identity == 'extra-action-point:' + str(macro_id))
    message_id = author.call('providence_text_allocate', {'family': 'message'})['nativeId']
    author.group([{'name': 'message', 'tool': 'providence_text_apply_draft', 'arguments': {'draft': {
        'family': 'message', 'nativeId': message_id, 'expectedText': None,
        'text': 'The inherited charm shimmers.'}}}], 'stock-item-message')
    definitions = author.call('providence_action_definition_list', {'limit': 128})['items']
    message_action = next(row['identity'] for row in definitions if row['opcode'] == 1)
    author.group([{'name': 'step', 'tool': 'providence_extra_action_point_step_apply', 'arguments': {'edit': {
        'source': source, 'slot': 0, 'actionIdentity': message_action, 'targetNativeId': message_id,
        'settings': None}}}], 'stock-item-message-step')
    pairs = author.call('providence_monster_appearance_list', {'limit': 128})['items']
    artwork = next(row for row in pairs if row['complete'])
    assert author.call('providence_monster_appearance_open', {'iconId': artwork['iconId']})['payloadComplete']
    images = [block for block in author.calls[-1]['response']['content'] if block['type'] == 'image']
    assert len(images) == 2
    operation = {'action': {'kind': 'create', 'setId': 0, 'nativeId': monster_id}, 'retargetUses': []}
    review = author.call('providence_monster_operation_prepare', {'operation': operation})
    author.group([{'name': 'monster', 'tool': 'providence_monster_operation_commit', 'arguments': {
        'operation': operation, 'reviewHash': review['reviewHash']}}], 'stock-summoning-monster')
    author.group([{'name': 'monster', 'tool': 'providence_monster_draft_apply', 'arguments': {'draft': {
        'setId': 0, 'nativeId': monster_id, 'fields': {'displayName': 'Summoned guardian',
        'iconId': artwork['iconId'], 'canSummon': 1}}}}], 'stock-summoning-appearance')
    assert not any(row['severity'] == 'error' for row in author.call('providence_validation_list', {
        'showAll': True, 'limit': 128})['items'])


def publish(author, tool, arguments, output, operation):
    session = author.call('providence_session_describe', guarded=False)
    pinned = {**arguments, **meta(session),
              'operationId': operation}
    first = author.call(tool, pinned, guarded=False)
    before = hashes(output)
    author.call('providence_project_close', guarded=False)
    reopened = author.call('providence_project_open', {'path': 'scenario'}, guarded=False)
    assert reopened['sessionGeneration'] != session['sessionGeneration']
    # The exact original request reconciles before any revision or filesystem retry.
    repeated = author.call(tool, pinned, guarded=False)
    assert repeated == first and hashes(output) == before
    collision = {**arguments, **meta(reopened), 'operationId': operation + '-collision'}
    author.call(tool, collision, guarded=False, expect_error=True)
    assert hashes(output) == before
    current = author.call('providence_session_describe', guarded=False)
    assert current['revision'] == session['revision'] and current['undoEntry'] == session['undoEntry']
    return {'result': first, 'artifactHashes': before, 'receiptReplayAfterReopen': True,
            'collisionPreservedOutput': True, 'projectHistoryUnchanged': True}


def hashes(path):
    if path.is_file():
        return {path.name: hashlib.sha256(path.read_bytes()).hexdigest()}
    return {str(file.relative_to(path)): hashlib.sha256(file.read_bytes()).hexdigest()
            for file in sorted(path.rglob('*')) if file.is_file()}


def verify_archive(path, classic, expected_kinds=('land', 'dungeon')):
    with zipfile.ZipFile(path) as archive:
        manifest = json.loads(archive.read('manifest.json'))
        assert manifest['schemaVersion'] == 6
        for name, entry in manifest['files'].items():
            payload = archive.read(name)
            assert len(payload) == entry['bytes']
            assert hashlib.sha256(payload).hexdigest() == entry['sha256']
        for name in ['content.json', 'world.json', 'scenario.json', 'assets/index.json']:
            assert json.loads(archive.read(name))['schemaVersion'] == 6
        world = json.loads(archive.read('world.json'))
        by_type = {row['levelType']: row for row in world['maps']}
        assert set(by_type) == set(expected_kinds)
        for kind, name in [('land', 'Data LD'), ('dungeon', 'Data DL')]:
            if kind not in expected_kinds:
                assert (classic / name).read_bytes() == b''
                continue
            words = by_type[kind]['classicTileValues']
            assert len(words) == 8100
            assert words == list(struct.unpack('>8100h', (classic / name).read_bytes()[:16200]))
        return {'schemaVersion': 6, 'packageHash': manifest['packageHash'],
                'verifiedFiles': len(manifest['files']), 'classicNativeTileArraysMatch': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['mcp', 'adapter', 'output', 'rules-root', 'application-library']:
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--land-only', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    projects, outputs = args.output / 'projects', args.output / 'outputs'
    projects.mkdir()
    outputs.mkdir()
    receipt = {'status': 'failed', 'captureFormatVersion': 2,
               'scope': 'MCP-authored Land/Dungeon publication, receipt replay, no-clobber and exact Classic/v6 native tile arrays; not a playable route',
               'retention': 'retain cited receipts, outputs and failures under the caller-declared evidence root'}
    client = Client(args.mcp, args.adapter, projects, args.output / 'mcp.log', output_root=outputs,
                    support_options=['--application-rules-root', args.rules_root,
                                     '--application-library-root', args.application_library])
    author = Author(client)
    try:
        kinds = ('land',) if args.land_only else ('land', 'dungeon')
        setup(author, kinds)
        receipt['mapKinds'] = kinds
        receipt['classic'] = publish(author, 'providence_project_compile_classic_slice',
                                     {'directory': 'Crossroads'}, outputs / 'Crossroads', 'classic-export')
        receipt['rebuilt'] = publish(author, 'providence_project_compile_rebuilt_package',
                                     {'path': 'Crossroads.realmz2', 'minimumEngineVersion': '0.1.0'},
                                     outputs / 'Crossroads.realmz2', 'rebuilt-export')
        receipt['archive'] = verify_archive(outputs / 'Crossroads.realmz2', outputs / 'Crossroads', kinds)
        author.call('providence_project_compile_rebuilt_package', {
            'operationId': 'outside-output-root', 'path': '../escape.realmz2', 'minimumEngineVersion': '0.1.0'},
            expect_error=True)
        assert not (args.output / 'escape.realmz2').exists()
        receipt['status'] = 'passed'
    finally:
        client.close()
        receipt['calls'] = author.calls
        receipt['binaries'] = {str(path): hashlib.sha256(path.read_bytes()).hexdigest()
                               for path in [args.mcp, args.adapter]}
        (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print('PROVIDENCE_MCP_EXPORTS_OK captured-revision receipts no-clobber root-bound Classic v6 exact-native-tiles')


if __name__ == '__main__':
    main()
