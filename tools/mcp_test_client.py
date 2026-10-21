"""Bounded stdio client for process-level Providence certification fixtures."""
import json
from copy import deepcopy
import os
from pathlib import Path
import queue
import subprocess
import threading


class Client:
    def __init__(self, executable, adapter, root, log, *, support_options=(), output_root=None, input_roots=()):
        self.log = Path(log).open('a', encoding='utf-8')
        arguments = [str(executable), '--adapter', str(adapter), '--project-root', str(root), *map(str, support_options)]
        if output_root is not None:
            arguments.extend(['--output-root', str(output_root)])
        for directory in input_roots:
            arguments.extend(['--input-root', str(directory)])
        self.process = subprocess.Popen(
            arguments,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log,
            text=True, encoding='utf-8', creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        self.responses = queue.Queue()
        self.next_id = 0
        threading.Thread(target=self._read, daemon=True).start()
        self.rpc('initialize', {'protocolVersion': '2025-11-25', 'capabilities': {},
                                'clientInfo': {'name': 'Providence integration fixture', 'version': '1'}})
        self.send({'jsonrpc': '2.0', 'method': 'notifications/initialized'})

    def _read(self):
        for line in self.process.stdout:
            self.responses.put(json.loads(line))

    def send(self, value):
        self.process.stdin.write(json.dumps(value) + '\n')
        self.process.stdin.flush()

    def rpc(self, method, params):
        self.next_id += 1
        self.send({'jsonrpc': '2.0', 'id': self.next_id, 'method': method, 'params': params})
        while True:
            response = self.responses.get(timeout=25)
            if response.get('id') == self.next_id:
                if 'error' in response:
                    raise ValueError(response)
                return response['result']

    def tool(self, name, params=None):
        return self.rpc('tools/call', {'name': name, 'arguments': params or {}})

    def value(self, name, params=None):
        response = self.tool(name, params)
        if response.get('isError'):
            raise ValueError(response)
        return response['structuredContent']

    def close(self):
        try:
            self.process.stdin.close()
            self.process.wait(timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            self.process.kill()
            self.process.wait()
        self.log.close()


def meta(session):
    return {'projectId': session['projectId'], 'sessionGeneration': session['sessionGeneration'],
            'expectedRevision': session['revision']}


class Author:
    """Retain immutable parsed requests/replies while callers edit returned drafts."""
    def __init__(self, client):
        self.client, self.calls = client, []

    def call(self, name, arguments=None, *, guarded=True, expect_error=False):
        arguments = dict(arguments or {})
        if guarded:
            arguments.update(meta(self.client.value('providence_session_describe')))
        response = self.client.tool(name, arguments)
        self.calls.append(deepcopy({'tool': name, 'arguments': arguments, 'response': response}))
        assert bool(response.get('isError')) == expect_error, self.calls[-1]
        return response['structuredContent']

    def group(self, steps, operation):
        preview = self.call('providence_changes_prepare', {'steps': steps})
        self.commit(preview, operation)
        return preview['results']

    def commit(self, preview, operation):
        return self.call('providence_changes_commit', {'previewToken': preview['previewToken'], 'operationId': operation})


def edit(client, text):
    session = client.value('providence_session_describe')
    preview = client.value('providence_changes_prepare', {**meta(session), 'steps': [
        {'name': 'message', 'tool': 'providence_message_update',
         'arguments': {'identity': 'message:1', 'text': text}}]})
    return {**meta(session), 'previewToken': preview['previewToken']}
