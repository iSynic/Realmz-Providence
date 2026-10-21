"""Exercise native map planners through real MCP; no runtime access is inferred."""
import argparse
import hashlib
import json
from pathlib import Path
from mcp_test_client import Author, Client


def stage(author, name, tool, arguments, *, commit=True):
    preview = author.call('providence_changes_prepare', {'steps': [
        {'name': name, 'tool': 'providence_' + tool, 'arguments': arguments}]})
    if commit:
        author.commit(preview, 'world-' + name)
    return preview['changePreviews'][name]


def cells(author, identity, x, y, width=1, height=1):
    return author.call('providence_map_region', dict(identity=identity, x=x, y=y,
                                                   width=width, height=height))['cells']


def secrets(author, land):
    edit = dict(x=4, y=5, secret='hidden', solid=None, removePlacement=False)
    before = cells(author, land, 4, 5)
    plan = stage(author, 'secret', 'land_cell_apply', dict(identity=land, edit=edit), commit=False)
    assert cells(author, land, 4, 5) == before
    stage(author, 'secret-applied', 'land_cell_apply', dict(identity=land, edit=edit))
    assert cells(author, land, 4, 5)[0]['nativeWord'] == plan['cell']['after']
    assert author.call('providence_land_cell_open', dict(identity=land, x=4, y=5))['cell']['secret'] == 'hidden'
    author.group([{'name': 'ap', 'tool': 'providence_action_point_create',
                   'arguments': dict(mapIdentity=land, x=7, y=8)}], 'world-placed-ap')
    catalog = author.call('providence_map_tile_catalog', dict(identity=land))
    intent = dict(tilesetId=catalog['tilesetId'], cells=[dict(x=4, y=5), dict(x=7, y=8)],
                  operation='paint', selectedTile=2, replaceTile=None, variation='single',
                  variationTiles=[], fillPercent=100, seed=0)
    stage(author, 'paint-over-markers', 'map_apply_intent', dict(identity=land, intent=intent))
    assert author.call('providence_land_cell_open', dict(identity=land, x=4, y=5))['cell']['secret'] == 'hidden'
    marked = author.call('providence_map_region', dict(identity=land, x=7, y=8, width=1, height=1))
    assert marked['actionPoints'][0]['activation']['entryMarker'] is True
    return catalog


def terrain(author, land, catalog):
    availability = author.call('providence_smart_terrain_open', dict(identity=land))
    assert availability['available'], availability
    family = next(row['identity'] for row in availability['presets'] if row['available'])
    mask = [dict(x=x, y=y) for y in range(20, 24) for x in range(20, 24)]
    grown = author.call('providence_smart_terrain_reshape', dict(identity=land, mask=mask, operation='grow'))['mask']
    assert len(grown) > len(mask)
    intent = dict(tilesetId=catalog['tilesetId'], preset=family, mask=mask,
                  atlasBlob=catalog['atlasBlob'], mappingRevision=catalog['mappingRevision'], tolerance='literal')
    plan = stage(author, 'smart-terrain', 'smart_terrain_apply', dict(identity=land, intent=intent))
    assert plan['paintedCells'], plan
    for cell in plan['paintedCells']:
        assert cells(author, land, cell['x'], cell['y'])[0]['nativeWord'] == cell['tile']
    invalid = dict(intent, mappingRevision=intent['mappingRevision'] + 1)
    author.call('providence_smart_terrain_preview', dict(identity=land, intent=invalid), expect_error=True)



def mappings(author, land):
    request = dict(identity=land)
    original = author.call('providence_terrain_mapping_open', request)
    chosen = author.call('providence_terrain_mapping_review', dict(request, layoutIdentity=original['layoutIdentity']))
    layout = next(row for row in chosen['layouts'] if row['identity'] == chosen['layoutIdentity'])
    before = cells(author, land, 4, 5, 4, 4)
    edit = dict(expectedMappingRevision=original['mappingRevision'], layoutIdentity=layout['identity'],
                layoutRevision=layout['revision'], reviewedFamilies=[], excludedTiles=[5],
                tileLabels={'5': {'name': 'Beacon coast', 'material': 'Water'}}, categoryLabels={})
    arguments = dict(request, atlasBlob=chosen['atlasBlob'], edit=edit)
    author.call('providence_terrain_mapping_accept', dict(arguments, atlasBlob='sha256:' + '0' * 64), expect_error=True)
    author.group([{'name': 'mapping', 'tool': 'providence_terrain_mapping_accept',
                   'arguments': arguments}], 'world-mapping')
    accepted = author.call('providence_terrain_mapping_open', request)
    assert accepted['mappingRevision'] == original['mappingRevision'] + 1
    assert accepted['current']['excludedTiles'] == [5]
    assert accepted['tileCatalog']['items'][4]['name'] == 'Beacon coast'
    assert cells(author, land, 4, 5, 4, 4) == before
    author.call('providence_terrain_mapping_accept', arguments, expect_error=True)
    author.call('providence_history_undo', dict(operationId='mapping-undo'))
    assert author.call('providence_terrain_mapping_open', request)['mappingRevision'] == original['mappingRevision']
    author.call('providence_history_redo', dict(operationId='mapping-redo'))
    assert author.call('providence_terrain_mapping_open', request)['mappingRevision'] == accepted['mappingRevision']


def regions(author, land):
    slots = author.call('providence_random_region_open', dict(mapIdentity=land, slot=3))
    assert len(slots['slots']) == 20 and slots['region'] is None
    row = dict(identity=next(slot['identity'] for slot in slots['slots'] if slot['slot'] == 3),
               top=1, left=1, bottom=5, right=6, chanceTenThousand=0, battleRange=[0, 0],
               randomDoors=[0, 0, 0], randomDoorPercent=[-100, 0, 100], only=False,
               option=0, soundId=0, textId=0)
    plan = stage(author, 'random-region', 'random_region_apply', dict(mapIdentity=land, region=row))
    assert plan['preview']['coveredCells'] == 20
    assert author.call('providence_random_region_open', dict(mapIdentity=land, slot=3))['region'] == row
    invalid = dict(row, right=91)
    author.call('providence_random_region_preview', dict(mapIdentity=land, region=invalid), expect_error=True)
    author.group([{'name': 'clear', 'tool': 'providence_random_region_clear',
                   'arguments': dict(mapIdentity=land, slot=3)}], 'world-clear-region')
    assert author.call('providence_random_region_open', dict(mapIdentity=land, slot=3))['region'] is None
    author.call('providence_history_undo', dict(operationId='world-undo-region'))
    assert author.call('providence_random_region_open', dict(mapIdentity=land, slot=3))['region'] == row


def stamps(author, land):
    catalog = author.call('providence_paint_resources_list', dict(identity=land, kind='stamp', scope='built-in'))
    available = next(row for row in catalog['items'] if row['availabilityReason'] is None and row['width'] > 1)
    author.call('providence_paint_resources_open', dict(identity=land, resourceIdentity=available['identity']))
    arguments = dict(identity=land, resourceIdentity=available['identity'], origin=dict(x=50, y=50))
    plan = stage(author, 'stamp', 'map_stamp_apply', arguments)
    assert plan['paintedCells'] and not plan['protectedCells']
    for cell in plan['paintedCells']:
        assert cells(author, land, cell['x'], cell['y'])[0]['nativeWord'] == cell['tile']
    author.call('providence_map_stamp_preview', dict(arguments, origin=dict(x=89, y=89)), expect_error=True)


def run(author):
    author.call('providence_project_create', dict(path='scenario'), guarded=False)
    created = author.group([
        {'name': kind, 'tool': 'providence_map_create', 'arguments': dict(levelType=kind)}
        for kind in ['land', 'dungeon']], 'world-maps')
    land, dungeon = [created[kind]['changedEntities'][0] for kind in ['land', 'dungeon']]
    catalog = secrets(author, land)
    terrain(author, land, catalog)
    mappings(author, land)
    regions(author, land)
    stamps(author, land)
    edit = dict(cells=[dict(x=3, y=4)], changes=[dict(primitive='wall', enabled=True),
                dict(primitive='allow-move-north', enabled=True)])
    stage(author, 'directional', 'dungeon_cell_apply_features', dict(identity=dungeon, edit=edit))
    before = cells(author, dungeon, 3, 4)
    author.call('providence_history_undo', dict(operationId='world-undo-directional'))
    assert cells(author, dungeon, 3, 4) != before
    author.call('providence_history_redo', dict(operationId='world-redo-directional'))
    author.call('providence_project_save', dict(operationId='world-checkpoint'))
    author.call('providence_project_close', guarded=False)
    author.call('providence_project_open', dict(path='scenario'), guarded=False)
    assert cells(author, dungeon, 3, 4) == before
    mapping = author.call('providence_terrain_mapping_open', dict(identity=land))
    assert mapping['current']['excludedTiles'] == [5] and mapping['current']['tileLabels']['5']['name'] == 'Beacon coast'
    assert author.call('providence_land_cell_open', dict(identity=land, x=4, y=5))['cell']['secret'] == 'hidden'
    preview = author.call('providence_map_region_preview', dict(identity=land, x=4, y=5, width=4, height=4))
    assert preview['available'] and len(author.calls[-1]['response']['content']) >= 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['mcp', 'adapter', 'application-library', 'output']:
        parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    receipt = dict(status='failed', captureFormatVersion=2,
                   retention='retain receipts and failures under the caller-declared evidence root',
                   scope='native MCP map planners and shared history; not export/reimport or runtime route proof')
    client = Client(args.mcp, args.adapter, args.output, args.output / 'mcp.log',
                    support_options=['--application-library-root', args.application_library])
    author = Author(client)
    try:
        run(author)
        receipt['status'] = 'passed'
    finally:
        client.close()
        receipt['calls'] = author.calls
        receipt['binaries'] = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in [args.mcp, args.adapter]}
        (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print('PROVIDENCE_MCP_WORLD_OK native-secrets markers Smart-Terrain regions stamps directional history reopen')


if __name__ == '__main__':
    main()
