"""Inspect chosen public archives as data, including nested alternate states."""
import concurrent.futures
import hashlib
import json
import re
import runpy
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.data' / 'sources' / 'workshop-candidates'
metadata = json.loads((CACHE / 'public-file-metadata.json').read_text(encoding='utf-8'))
items = {v['publishedfileid']: v for v in metadata}
document = runpy.run_path(str(ROOT / 'tools' / 'extract-tabletop.py'))['document']
base = json.loads((ROOT / '.data/sources/tabletop-decoded.json').read_text(encoding='utf-8'))

def textures(value):
    found = set()
    def walk(v):
        if isinstance(v, dict):
            for key in ['FaceURL', 'BackURL', 'ImageURL', 'ImageSecondaryURL']:
                if v.get(key): found.add(v[key])
            for key, child in v.items():
                if key not in ['LuaScript', 'LuaScriptState']: walk(child)
        elif isinstance(v, list):
            for child in v: walk(child)
    walk(value)
    return found

base_textures = textures(base)

def inspect(item_id):
    if not re.fullmatch(r'\d+', item_id): raise ValueError('Public file ID required')
    item = items[item_id]
    folder = CACHE / item_id
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / 'archive.bin'
    if not path.exists():
        req = urllib.request.Request(item['file_url'], headers={
            'User-Agent': 'Mozilla/5.0', 'Referer': 'https://steamcommunity.com/'})
        with urllib.request.urlopen(req, timeout=35) as response:
            raw = response.read()
        path.write_bytes(raw)
    raw = path.read_bytes()
    try: obj = json.loads(raw.decode('utf-8-sig'))
    except (UnicodeError, ValueError): obj = document(raw)[0]
    (folder / 'decoded.json').write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf-8')
    references = []
    def walk(value, parent=''):
        if isinstance(value, dict):
            name = value.get('Nickname', '')
            label = name or parent
            if any(k in name.lower() for k in ['科室', '工程科', '结构科', '防卫科', '莱茵', 'rhine', 'department', 'lab']):
                references.append({
                    'name': name, 'parent': parent, 'kind': value.get('Name'),
                    'description': value.get('Description', '')[:300],
                    'image': value.get('CustomImage'), 'deck': value.get('CustomDeck'),
                    'children': [{ 'name': c.get('Nickname'), 'cardId':c.get('CardID'),
                        'image':c.get('CustomImage'), 'deck':c.get('CustomDeck') }
                        for c in value.get('ContainedObjects', [])]})
            if value.get('CustomPDF'): references.append({'pdf':value['CustomPDF']})
            for key, child in value.items():
                if key not in ['LuaScript', 'LuaScriptState']: walk(child, label)
        elif isinstance(value, list):
            for child in value: walk(child, parent)
    walk(obj)
    new_textures = sorted(textures(obj) - base_textures)
    evidence = {'id':item_id, 'title':item['title'], 'sourceUrl':item['file_url'],
        'sha256':hashlib.sha256(raw).hexdigest(), 'bytes':len(raw),
        'references': references, 'newTextures':new_textures}
    (folder / 'references.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return {'id':item_id,'title':item['title'],'bytes':len(raw),'newTextures':len(new_textures),'references':references}

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for item_id, future in zip(sys.argv[1:], [pool.submit(inspect, v) for v in sys.argv[1:]]):
        try: print(json.dumps(future.result(), ensure_ascii=False), flush=True)
        except Exception as error: print(json.dumps({'id':item_id,'error':str(error)},ensure_ascii=False),flush=True)
