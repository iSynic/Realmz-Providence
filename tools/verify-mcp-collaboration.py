"""Run alternating real native/MCP edits without changing a donor or user profile."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
from mcp_test_client import Client, edit, meta

ROOT = Path(__file__).resolve().parents[1]


def await_value(read, predicate, seconds=15):
    deadline = time.monotonic() + seconds
    last = None
    while time.monotonic() < deadline:
        try:
            last = read()
            if predicate(last):
                return last
        except (FileNotFoundError, json.JSONDecodeError):
            pass
        time.sleep(.05)
    raise TimeoutError(f'Bounded collaboration wait expired: {last}')


class Native:
    def __init__(self, godot, adapter, project, output, *, visible=False, application_library=None):
        self.output, self.sequence = output, 0
        self.log = (output / 'native.log').open('w', encoding='utf-8')
        environment = {**os.environ, 'PROVIDENCE_ADAPTER_PATH': str(adapter),
                       'PROVIDENCE_SHARED_SESSION': '1'}
        environment['PROVIDENCE_TEST_APPLICATION_LIBRARY'] = str(application_library) if application_library else ''
        # Godot's Windows console wrapper waits for its entire child-process
        # job. The real editor may exit while MCP correctly retains the host.
        self.engine = gui_engine(godot)
        self.process = subprocess.Popen([str(self.engine), *([] if visible else ['--headless']), '--path', str(ROOT / 'godot'),
            '--script', 'res://tools/validate_live_collaboration.gd', '--', str(project), str(output)],
            stdout=self.log, stderr=subprocess.STDOUT, env=environment,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        try:
            await_value(self.read, lambda row: row.get('action') == 'ready', 30)
        except Exception:
            self.close()
            raise

    def read(self):
        filename = 'native-state-ready.json' if self.sequence == 0 else f'native-state-{self.sequence:06}.json'
        try:
            value = json.loads((self.output / filename).read_text(encoding='utf-8'))
        except FileNotFoundError:
            if self.process.poll() is not None:
                raise RuntimeError('Native fixture stopped: ' + (self.output / 'native.log').read_text(encoding='utf-8'))
            raise
        if self.process.poll() is not None and value.get('action') != 'stopped':
            raise RuntimeError('Native fixture stopped: ' + (self.output / 'native.log').read_text(encoding='utf-8'))
        return value

    def command(self, action, **fields):
        self.sequence += 1
        destination = self.output / f'command-{self.sequence:06}.json'
        pending = destination.with_suffix('.pending')
        pending.write_text(json.dumps({'sequence': self.sequence, 'action': action, **fields}), encoding='utf-8')
        pending.replace(destination)
        return await_value(self.read, lambda row: row.get('sequence') == self.sequence)

    def close(self):
        if self.process.poll() is None:
            self.process.kill()
        self.process.wait(timeout=5)
        self.log.close()


def clean(client):
    return await_value(lambda: client.value('providence_session_describe'),
                       lambda row: not row.get('nativeDraftActive', True))


def gui_engine(godot):
    if os.name == 'nt' and godot.name.endswith('_console.exe'):
        engine = godot.with_name(godot.name.replace('_console.exe', '.exe'))
        if not engine.is_file():
            raise FileNotFoundError('The matching Godot GUI executable is required for host-lifetime verification')
        return engine
    return godot


def alternate_edits(client, native):
    permission = native.command('allow')
    assert permission['response'].get('ok'), permission
    clean(client)
    commit = {**edit(client, 'Assistant edit'), 'operationId': 'assistant-edit'}
    assert client.value('providence_changes_commit', commit)['revision'] == 2
    observed = native.command('inspect')
    assert observed['revision'] == 2 and observed['text'] == 'Assistant edit', observed
    blocked = {**edit(client, 'Must not replace human text'), 'operationId': 'draft-blocked'}
    native.command('draft', text='Human Café draft')
    failure = client.tool('providence_changes_commit', blocked)
    assert failure.get('isError') and failure['structuredContent']['code'] == 'draft-active', failure
    native.command('hide-draft')
    assert client.tool('providence_history_undo', {**meta(client.value('providence_session_describe')),
                                                'operationId': 'hidden-draft-undo'}).get('isError')
    shown = native.command('show-draft')
    assert shown['text'] == 'Human Café draft' and shown['draft'], shown
    applied = native.command('apply')
    assert applied['response']['ok'] and applied['revision'] == 3, applied
    current = clean(client)
    assert current['undoEntry']['clientKind'] == 'native', current
    client.value('providence_history_undo', {**meta(current), 'operationId': 'undo-human'})
    observed = native.command('inspect')
    assert observed['revision'] == 4 and observed['text'] == 'Assistant edit', observed
    redone = native.command('redo')
    assert redone['revision'] == 5 and redone['text'] == 'Human Café draft', redone
    return redone


def initialize(client, *, second_message=False):
    session = client.value('providence_project_create', {'path': 'scenario'})
    steps = [
        {'name': 'opening', 'tool': 'providence_message_create',
         'arguments': {'nativeId': 1, 'text': 'Opening message'}}]
    if second_message:
        steps.append({'name':'second','tool':'providence_message_create',
                      'arguments':{'nativeId':2,'text':'A second message for the collaboration review fixture.'}})
    preview = client.value('providence_changes_prepare', {**meta(session), 'steps': steps})
    client.value('providence_changes_commit', {**meta(session), 'previewToken': preview['previewToken'],
                                             'operationId': 'opening-message'})
    client.value('providence_project_close')
    time.sleep(.3)


def run(args, output):
    client = Client(args.mcp, args.adapter, output, output / 'mcp.log')
    native = None
    try:
        initialize(client)
        native = Native(args.godot, args.adapter, output / 'scenario', output)
        client.value('providence_project_open', {'path': 'scenario'})
        final = alternate_edits(client, native)
        current = clean(client)
        client.value('providence_project_save', {**meta(current), 'operationId': 'checkpoint'})
        native.command('stop')
        native.process.wait(timeout=10)
        log = (output / 'native.log').read_text(encoding='utf-8')
        assert 'SCRIPT ERROR' not in log and 'ERROR:' not in log, log
        assert 'PROVIDENCE_LIVE_COLLABORATION_OK' in log, log
        client.value('providence_project_close')
        time.sleep(.3)
        restored = client.value('providence_project_open', {'path': 'scenario'})
        assert restored['revision'] == 5 and restored['canUndo'], restored
        return {'status': 'passed', 'scope': 'real Messages editor and local host; not complete scenario authoring',
                'revision': final['revision'], 'checks': ['alternating native/MCP edits', 'late draft blocks commit',
                'hidden draft blocks shared history', 'native draft retained', 'cross-client Undo/Redo',
                'external refresh', 'history attribution', 'checkpoint/reopen', 'clean native detach']}
    finally:
        client.close()
        if native:
            native.close()


def capture_ui(args, output):
    client = Client(args.mcp, args.adapter, output, output / 'mcp.log')
    native = None
    try:
        initialize(client, second_message=True)
        native = Native(args.godot, args.adapter, output / 'scenario', output, visible=True)
        client.value('providence_project_open', {'path': 'scenario'})
        native.command('allow')
        proposed = edit(client, 'Opening message (assistant edit)')
        client.value('providence_changes_commit', {**proposed, 'operationId':'review-shared-change'})
        assert native.command('inspect')['revision'] == 2
        for width, height in [(1600, 900), (1920, 1080)]:
            for mode in ['connected', 'draft', 'hold', 'setup']:
                native.command('capture-ui', width=width, height=height, mode=mode)
        native.command('stop')
        native.process.wait(timeout=10)
        log = (output / 'native.log').read_text(encoding='utf-8')
        assert 'SCRIPT ERROR' not in log and 'ERROR:' not in log, log
        images = {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                  for path in output.glob('*.png')}
        assert len(images) == 8, images
        source_paths = ['mcp_connections_controller.gd', 'mcp_connections_controller.tscn',
                        'editor_shell.gd', 'editor_shell.tscn', 'collaboration_session.gd']
        return {'status':'captured', 'scope':'actual native shell; two authored messages; local draft and disconnected hold are prepared UI states',
                'images':images, 'sources':{name:hashlib.sha256((ROOT / 'godot/src' / name).read_bytes()).hexdigest()
                                          for name in source_paths}}
    finally:
        client.close()
        if native:
            native.close()


def main():
    parser = argparse.ArgumentParser()
    for name in ('godot', 'adapter', 'mcp', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--capture-ui', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    receipt = {'status': 'failed', 'retention': 'retain receipts and failures under caller-declared evidence root'}
    try:
        receipt.update(capture_ui(args, args.output) if args.capture_ui else run(args, args.output))
    finally:
        receipt['binaries'] = {str(path): hashlib.sha256(path.read_bytes()).hexdigest()
                               for path in {args.adapter, args.mcp, args.godot, gui_engine(args.godot)}}
        (args.output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print('PROVIDENCE_MCP_UI_CAPTURED prepared-states both-viewports' if args.capture_ui else
          'PROVIDENCE_MCP_LIVE_OK revision=5 real-native-strings shared-history draft-safety')


if __name__ == '__main__':
    main()
