"""Exercise terrain generation through real MCP with caller-owned disposable output."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import time
from mcp_test_client import Author, Client


def stage(author, name, tool, arguments):
    prepared = author.call('providence_changes_prepare', {'steps': [
        {'name': name, 'tool': 'providence_' + tool, 'arguments': arguments}]})
    author.commit(prepared, 'terrain-' + name)
    return prepared['changePreviews'][name]


def region(author):
    return author.call('providence_map_region', dict(identity='land:0', x=10, y=10, width=32, height=32))['cells']


def capture(author, output, name):
    result = author.call('providence_map_region_preview', dict(identity='land:0', x=10, y=10, width=32, height=32))
    response = author.calls[-1]['response']
    images = [block for block in response.get('content', []) if block.get('type') == 'image']
    encoded = result.get('base64') or (images[0]['data'] if images else None)
    assert encoded and result['available'], 'Native map preview unavailable'
    image = base64.b64decode(encoded)
    path = output / (name + '.png')
    path.write_bytes(image)
    return dict(path=path.as_posix(), sha256=hashlib.sha256(image).hexdigest(),
                origin=[10, 10], cells=[32, 32], pixels=[result['pixelWidth'], result['pixelHeight']])


def wait_for_job(author, job):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        polled = author.call('providence_terrain_generation_poll', dict(jobId=job['jobId']))
        if polled['status'] != 'pending':
            return polled
        time.sleep(0.025)
    raise TimeoutError('Terrain generation worker did not finish within 30 seconds')


def run(author, output):
    author.call('providence_project_create', dict(path='scenario'), guarded=False)
    author.group([dict(name='land', tool='providence_map_create', arguments=dict(levelType='land'))], 'terrain-map')
    availability = author.call('providence_terrain_generation_open', dict(identity='land:0'))
    assert availability['available'], availability
    paint = dict(tilesetId=availability['tilesetId'], cells=[dict(x=18, y=18)],
                 operation='paint', selectedTile=94, replaceTile=None, variation='single',
                 variationTiles=[], fillPercent=100, seed=0)
    stage(author, 'landmark', 'map_apply_intent', dict(identity='land:0', intent=paint))
    mask = [dict(x=x, y=y) for y in range(12, 36) for x in range(12, 36)]
    connections = [dict(from_=dict(x=10, y=10), to=dict(x=37, y=37))]
    connections[0]['from'] = connections[0].pop('from_')
    intent = dict(tilesetId=availability['tilesetId'], atlasBlob=availability['atlasBlob'],
                  mappingRevision=availability['mappingRevision'], family='forest', density='dense',
                  seed=47, mask=mask, locks=[dict(x=20, y=20)], connections=connections)
    before = region(author)
    before_image = capture(author, output, 'native-before')
    started = time.monotonic()
    plan = author.call('providence_terrain_generation_preview', dict(identity='land:0', intent=intent))
    elapsed = time.monotonic() - started
    assert plan['outcome'] == 'success' and plan['canApply'], plan['reason']
    assert all(row['status'] == 'connected' for row in plan['routes']), plan['routes']
    assert region(author) == before, 'Preview modified the map'
    repeated = author.call('providence_terrain_generation_preview', dict(identity='land:0', intent=intent))
    assert repeated == plan, 'Identical inputs changed the reviewed result'
    job = author.call('providence_terrain_generation_begin', dict(identity='land:0', intent=intent))
    completed = wait_for_job(author, job)
    assert completed['status'] == 'complete', completed['status']
    for key in ['paintedCells', 'protectedCells', 'routes', 'outcome', 'reviewHash', 'algorithmVersion']:
        assert completed['preview'][key] == plan[key], 'Worker differs from direct preview: ' + key
    full = dict(intent, mask=[dict(x=x, y=y) for y in range(90) for x in range(90)])
    canceled = author.call('providence_terrain_generation_begin', dict(identity='land:0', intent=full))
    author.call('providence_terrain_generation_cancel', dict(jobId=canceled['jobId']))
    assert wait_for_job(author, canceled)['status'] == 'canceled'
    assert region(author) == before
    applied = stage(author, 'apply', 'terrain_generation_apply',
                    dict(identity='land:0', intent=intent, reviewHash=plan['reviewHash']))
    assert applied['paintedCells'] == plan['paintedCells']
    after = region(author)
    assert after != before
    after_image = capture(author, output, 'native-after')
    author.call('providence_history_undo', dict(operationId='terrain-undo'))
    assert region(author) == before
    author.call('providence_history_redo', dict(operationId='terrain-redo'))
    assert region(author) == after
    author.call('providence_changes_prepare', {'steps': [dict(name='stale', tool='providence_terrain_generation_apply',
        arguments=dict(identity='land:0', intent=intent, reviewHash=plan['reviewHash']))]}, expect_error=True)
    author.call('providence_project_save', dict(operationId='terrain-save'))
    author.call('providence_project_close', guarded=False)
    author.call('providence_project_open', dict(path='scenario'), guarded=False)
    assert region(author) == after, 'Applied cells did not survive Save/reopen'
    author.group([dict(name='scripted-endpoint', tool='providence_action_point_create',
                       arguments=dict(mapIdentity='land:0', x=10, y=10))], 'terrain-scripted-endpoint')
    unknown = author.call('providence_map_connectivity_preview', dict(identity='land:0', connections=connections))
    assert unknown['routes'][0]['status'] == 'unknown'
    unknown_image = capture(author, output, 'native-unknown-route')
    (output / 'unknown-route.json').write_text(json.dumps(unknown, indent=2) + '\n', encoding='utf-8')
    author.call('providence_history_undo', dict(operationId='terrain-remove-script-fixture'))
    assert region(author) == after
    author.call('providence_project_save', dict(operationId='terrain-final-save'))
    (output / 'reviewed-plan.json').write_text(json.dumps(plan, indent=2) + '\n', encoding='utf-8')
    return dict(status='passed', smallPreviewSeconds=elapsed, selectedCells=len(mask),
                changedCells=len(plan['paintedCells']), protectedCells=plan['protectedCells'],
                beforeImage=before_image, afterImage=after_image, unknownImage=unknown_image, routes=plan['routes'],
                project='scenario', scope='native MCP authoring, history, cancellation and persistence; runtime/export proof is separate')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['mcp', 'adapter', 'application-library', 'application-rules', 'output']:
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    client = Client(args.mcp, args.adapter, args.output, args.output / 'mcp.log',
                    support_options=['--application-library-root', args.application_library,
                                     '--application-rules-root', args.application_rules])
    author = Author(client)
    receipt = dict(status='failed', retention='Caller retains this bounded fixture until native and export review finish, then removes its validated temporary root')
    try:
        receipt.update(run(author, args.output))
        receipt['build'] = client.value('providence_capabilities')['build']
    finally:
        client.close()
        receipt['binaries'] = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in [args.mcp, args.adapter]}
        receipt['calls'] = [dict(tool=row['tool'], error=bool(row['response'].get('isError'))) for row in author.calls]
        (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print('PROVIDENCE_TERRAIN_GENERATION_OK preview worker cancellation history reopen')


if __name__ == '__main__':
    main()
