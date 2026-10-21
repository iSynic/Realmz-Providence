"""Import supported fixture media through granted paths and native MCP change sets."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import wave
import zlib
from mcp_test_client import Author, Client


def sources(root):
    root.mkdir()
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    pixels = b''.join(b'\x00' + bytes([240, 30, 70, 255]) * 32 for _ in range(32))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 32, 32, 8, 6, 0, 0, 0))
    (root / 'picture.png').write_bytes(png + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b''))
    (root / 'story.txt').write_text('  Café crossroads\nReturn with the key.  ', encoding='utf-8')
    with wave.open(str(root / 'sound.wav'), 'wb') as sound:
        sound.setparams((1, 1, 22050, 256, 'NONE', 'not compressed'))
        sound.writeframes(bytes(range(256)))
    module = bytearray(1084 + 1024)
    module[:10] = b'Crossroads'
    module[950] = 1
    module[1080:1084] = b'M.K.'
    (root / 'music.mod').write_bytes(module)


def import_steps(name, arguments):
    return [dict(name=name + '_review', tool='providence_media_import_prepare', arguments=arguments),
            dict(name=name, tool='providence_media_import_commit', arguments=dict(arguments,
                 reviewHash={'$result': name + '_review', 'pointer': '/reviewHash'}))]


def picture_and_text(author, inputs, allocations):
    arguments = dict(kind='picture', name='Crossroads', path=str(inputs / 'picture.png'),
                     resourceId=allocations['picture']['resourceId'], settings={'dither': False})
    author.call('providence_media_import_prepare', arguments)
    assert len([block for block in author.calls[-1]['response']['content'] if block['type'] == 'image']) == 2
    assert author.call('providence_project_asset_list')['total'] == 0
    text = dict(kind='text-resource', name='Arrival', path=str(inputs / 'story.txt'),
                resourceId=allocations['text-resource']['resourceId'])
    grouped = author.call('providence_changes_prepare', {'steps': import_steps('picture', arguments) + import_steps('text', text)})
    assert author.call('providence_project_asset_list')['total'] == 0
    author.commit(grouped, 'media-picture-and-text')
    assert author.call('providence_session_describe', guarded=False)['revision'] == 1
    assert author.call('providence_project_asset_list')['total'] == 2
    author.call('providence_history_undo', {'operationId': 'undo-media-pair'})
    assert author.call('providence_project_asset_list')['total'] == 0
    author.call('providence_history_redo', {'operationId': 'redo-media-pair'})
    picture = grouped['results']['picture_review']['media']['primary']['identity']
    opened = author.call('providence_media_open', {'identity': picture})
    assert opened['media']['primary']['classicPayloadByteLength'] > 0
    return picture, arguments


def rejected_reviews(author, arguments, outside):
    denied = author.call('providence_media_import_prepare', dict(arguments, path=str(outside)), expect_error=True)
    assert denied['code'] == 'file-access'
    # The native review excludes routing metadata but retains exact bytes/settings.
    next_slot = author.call('providence_media_import_allocate', {'kind': 'picture'})['resourceId']
    assert next_slot != arguments['resourceId']
    second = dict(arguments, resourceId=next_slot)
    reviewed = author.call('providence_media_import_prepare', second)
    bad = dict(second, reviewHash=reviewed['reviewHash'], name='Changed after review')
    author.call('providence_media_import_commit', dict(bad, operationId='bad-media-review'), expect_error=True)
    # A path obtained from earlier content is checked after result resolution.
    first = dict(second, name=str(outside))
    escaped = dict(second, path={'$result': 'source', 'pointer': '/media/primary/label'})
    denied = author.call('providence_changes_prepare', {'steps': [
        dict(name='source', tool='providence_media_import_prepare', arguments=first),
        dict(name='escape', tool='providence_media_import_prepare', arguments=escaped)]}, expect_error=True)
    assert denied['code'] == 'file-access'

    # Staged content followed by a bad codec leaves revision and assets unchanged.
    before = author.call('providence_session_describe', guarded=False)['revision']
    count = author.call('providence_project_asset_list')['total']
    invalid = dict(second, kind='music')
    author.call('providence_changes_prepare', {'steps': import_steps('valid', second) +
                import_steps('invalid', invalid)}, expect_error=True)
    assert author.call('providence_session_describe', guarded=False)['revision'] == before
    assert author.call('providence_project_asset_list')['total'] == count


def additional_media(author, inputs, allocations):
    for kind, filename in [('sound', 'sound.wav'), ('music', 'music.mod')]:
        payload = dict(kind=kind, name='Crossroads ' + kind, path=str(inputs / filename),
                       resourceId=allocations[kind]['resourceId'])
        author.group(import_steps(kind, payload), 'import-' + kind)
    pair = dict(kind='combat-icon', name='Gatekeeper', path=str(inputs / 'picture.png'),
                reversePath=str(inputs / 'picture.png'),
                resourceId=allocations['combat-icon']['resourceId'])
    result = author.group(import_steps('pair', pair), 'import-combat-pair')['pair_review']['media']
    assert result['companion']['classicResource']['resourceId'] == pair['resourceId'] + 308
    for asset in [result['primary'], result['companion']]:
        assert author.call('providence_media_open', {'identity': asset['identity']})['media']['primary']
    assert author.call('providence_media_import_allocate', {'kind':'combat-icon'})['resourceId'] != pair['resourceId']


def changed_source_rejected(author, inputs):
    number = author.call('providence_media_import_allocate', {'kind':'text-resource'})['resourceId']
    path = inputs / 'story.txt'
    original = path.read_bytes()
    arguments = dict(kind='text-resource', name='Return', path=str(path), resourceId=number)
    review = author.call('providence_media_import_prepare', arguments)
    before = author.call('providence_session_describe', guarded=False)['revision']
    try:
        path.write_text('Changed source after review', encoding='utf-8')
        author.call('providence_media_import_commit', dict(arguments,
                    reviewHash=review['reviewHash'], operationId='changed-source'), expect_error=True)
        assert author.call('providence_session_describe', guarded=False)['revision'] == before
    finally:
        path.write_bytes(original)


def labels_removal_and_reopen(author, picture):
    author.group([dict(name='label', tool='providence_media_metadata_apply',
                       arguments=dict(identity=picture, name='Arrival scene'))], 'media-label')
    assert author.call('providence_media_open', {'identity': picture})['media']['primary']['label'] == 'Arrival scene'
    removal = author.call('providence_media_remove_prepare', {'identity': picture})
    assert removal['allowed']
    author.group([dict(name='review', tool='providence_media_remove_prepare', arguments=dict(identity=picture)),
                  dict(name='remove', tool='providence_media_remove_commit', arguments=dict(identity=picture,
                       reviewHash={'$result':'review', 'pointer':'/reviewHash'}))], 'media-remove')
    assert author.call('providence_project_asset_list')['total'] == 5
    author.call('providence_history_undo', {'operationId': 'undo-media-remove'})
    author.call('providence_project_save', {'operationId': 'media-save'})
    author.call('providence_project_close', guarded=False)
    author.call('providence_project_open', {'path': 'scenario'}, guarded=False)
    assert author.call('providence_project_asset_list')['total'] == 6
    assert author.call('providence_media_open', {'identity': picture})['media']['primary']['label'] == 'Arrival scene'


def run(author, inputs, outside):
    author.call('providence_project_create', {'path': 'scenario'}, guarded=False)
    allocations = {kind: author.call('providence_media_import_allocate', {'kind': kind})
                   for kind in ['picture', 'text-resource', 'sound', 'music', 'combat-icon']}
    assert len(allocations['combat-icon']['resourceKeys']) == 2
    picture, arguments = picture_and_text(author, inputs, allocations)
    rejected_reviews(author, arguments, outside)
    additional_media(author, inputs, allocations)
    changed_source_rejected(author, inputs)
    labels_removal_and_reopen(author, picture)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['mcp', 'adapter', 'output']:
        parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args()
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=False)
    inputs = args.output / 'inputs'
    sources(inputs)
    outside = args.output / 'outside.txt'
    outside.write_text('Outside the configured input grant', encoding='utf-8')
    before = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in inputs.iterdir()}
    receipt = dict(status='failed', captureFormatVersion=2,
                   retention='retain fixtures, receipts and failures under the caller-declared evidence root',
                   scope='MCP native media codecs, granted paths, grouped history and reopen; not runtime media playback or export/reimport')
    client = Client(args.mcp, args.adapter, args.output, args.output / 'mcp.log', input_roots=[inputs])
    author = Author(client)
    try:
        run(author, inputs, outside)
        assert before == {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in inputs.iterdir()}
        receipt['status'] = 'passed'
    finally:
        client.close()
        receipt.update(calls=author.calls, sourceHashes=before,
                       binaries={str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in [args.mcp, args.adapter]})
        (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print('PROVIDENCE_MCP_MEDIA_OK native-allocation codecs previews granted-paths grouped-history labels removal reopen')


if __name__ == '__main__':
    main()
