"""Build isolated application media with the existing native import command."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


parser = argparse.ArgumentParser(description=__doc__)
for name in ['adapter', 'source', 'output']:
    parser.add_argument('--' + name, type=Path, required=True)
args = parser.parse_args()
assert args.source.is_dir() and not args.output.exists()
request = {'id': 1, 'method': 'application-media.import-classic-library',
           'params': {'sourceDirectory': str(args.source.resolve()), 'libraryRoot': str(args.output.resolve())}}
process = subprocess.run([str(args.adapter), 'serve-demo'], input=json.dumps(request) + '\n',
                         capture_output=True, text=True, encoding='utf-8', timeout=90)
assert process.returncode == 0, process.stderr
response = json.loads(process.stdout)
assert response['id'] == 1 and response['ok'], response
assert response['result']['appearanceComplete'], response
catalog = args.output / 'classic-application-media.json'
receipt = {'scope': 'reference support preparation, not scenario authoring',
           'adapterSha256': hashlib.sha256(args.adapter.read_bytes()).hexdigest(),
           'request': request, 'response': response,
           'catalogSha256': hashlib.sha256(catalog.read_bytes()).hexdigest()}
(args.output.parent / (args.output.name + '-setup.json')).write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
print('PROVIDENCE_MCP_APPLICATION_SUPPORT_OK existing-native-import exact-catalog isolated-output')
