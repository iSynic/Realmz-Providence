"""Derive the packaged offline manual from public documentation and images."""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'docs/public'
OUTPUT = ROOT / 'godot/data/providence-help'


def slug(text):
    return re.sub(r'[^\w -]', '', text.lower()).replace(' ', '-')


def escape(text):
    return text.replace('[', '[lb]')


def inline(text, links):
    tokens = []
    def link(match):
        target = match[2]
        name, _, anchor = target.partition('#')
        if name and name not in links and not name.startswith(('https://', 'http://', 'mailto:')):
            raise ValueError('Unresolved offline Help link: ' + target)
        destination = ('chapter:' + links[name] + ('#' + anchor if anchor else '')) if name in links else ('#' + anchor if not name else target)
        tokens.append('[url=' + destination + ']' + escape(match[1]) + '[/url]')
        return '\x01' + str(len(tokens) - 1) + '\x02'
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', link, text)
    text = escape(text)
    text = re.sub(r'\*\*(.+?)\*\*', r'[b]\1[/b]', text)
    text = re.sub(r'`([^`]+)`', r'[code]\1[/code]', text)
    text = re.sub(r'^- ', '• ', text)
    for index, token in enumerate(tokens):
        text = text.replace('\x01' + str(index) + '\x02', token)
    return text


def sections(markdown, links):
    result, lines, title = [], [], 'Overview'
    table_headers = []
    def flush():
        if lines:
            result.append({'title': title, 'anchor': slug(title), 'body': '\n'.join(lines).strip()})
            lines.clear()
    for line in markdown.splitlines():
        if not line.startswith('|'): table_headers = []
        if line.startswith('# '): continue
        if re.fullmatch(r'!\[[^\]]*\]\([^)]+\)', line.strip()): continue
        if line.startswith('## '):
            flush()
            title = line[3:]
        elif line.startswith('### '): lines.append('\n[b]' + escape(line[4:]) + '[/b]')
        elif line.startswith('|'):
            cells = [cell.strip() for cell in line.strip('|').split('|')]
            if all(re.fullmatch(r'[-: ]+', cell) for cell in cells): continue
            if not table_headers:
                table_headers = cells
                continue
            values = [('[b]' + inline(table_headers[index], links) + ':[/b] ' if len(cells) > 2 else '') + inline(cell, links)
                      for index, cell in enumerate(cells) if index > 0]
            lines.append('\n[b]' + inline(cells[0], links) + '[/b]\n' + '\n'.join(values))
        else: lines.append(inline(line, links))
    flush()
    return result


def build():
    catalog = json.loads((PUBLIC / 'help-catalog.json').read_text(encoding='utf-8'))
    rows = [(group, row) for group, records in catalog.items() for row in records]
    links = {row[3]: row[0] for _, row in rows if row[3]}
    links['authoring-manual.md'] = 'getting-started'
    OUTPUT.mkdir(parents=True, exist_ok=True)
    images = OUTPUT / 'images'
    images.mkdir(exist_ok=True)
    entries, sources, retained_images = [], {}, set()
    sources['docs/public/help-catalog.json'] = hashlib.sha256((PUBLIC / 'help-catalog.json').read_bytes()).hexdigest()
    for group, row in rows:
        identity, title, summary, article, *route = row
        text = (PUBLIC / article).read_text(encoding='utf-8') if article else ''
        gallery = []
        for caption, relative in re.findall(r'!\[([^\]]+)\]\(([^)]+)\)', text):
            source = (PUBLIC / relative).resolve()
            if not source.is_relative_to(ROOT / 'docs') or not source.is_file():
                raise ValueError('Missing or unsafe Help image: ' + relative)
            payload = source.read_bytes()
            digest = hashlib.sha256(payload).hexdigest()
            name = digest + source.suffix
            (images / name).write_bytes(payload)
            retained_images.add(name)
            gallery.append({'caption': caption, 'path': 'res://data/providence-help/images/' + name})
            sources[source.relative_to(ROOT).as_posix()] = digest
        if article: sources['docs/public/' + article] = hashlib.sha256((PUBLIC / article).read_bytes()).hexdigest()
        entries.append({'id': identity, 'title': title, 'summary': summary, 'group': group,
                        'article': article, 'route': route[0] if route else '',
                        'searchText': (title + '\n' + summary + '\n' + text).lower(),
                        'sections': sections(text, links), 'images': gallery})
    licenses = next(row for row in entries if row['id'] == 'licenses')
    for name in ['SOURCE-LICENSE.md', 'LICENSE', 'LICENSE-REALMZ.txt', 'NOTICE', 'THIRD_PARTY_NOTICES.md']:
        text = (ROOT / name).read_text(encoding='utf-8')
        licenses['sections'].append({'title': name, 'anchor': slug(name), 'body': escape(text)})
        sources[name] = hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
    licenses['searchText'] += '\n' + '\n'.join(section['body'].lower() for section in licenses['sections'])
    result = {'formatVersion': 1, 'entries': entries, 'sourceHashes': sources}
    (OUTPUT / 'manual.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for stale in images.iterdir():
        if stale.name not in retained_images and re.fullmatch(r'[a-f0-9]{64}\.png', stale.name):
            if stale.resolve().parent != images.resolve(): raise ValueError('Unsafe generated Help image')
            stale.unlink()
    print(f'OFFLINE_HELP_BUNDLE_OK chapters={len(catalog["chapters"])} entries={len(entries)} images={len(list(images.glob("*.png")))}')
    return result


if __name__ == '__main__':
    build()
