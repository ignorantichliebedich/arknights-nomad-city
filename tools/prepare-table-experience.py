"""Rebuild the v0.3 original-art derivatives without touching source originals.

Uses the exact source URL/hash in assets/manifest.json. Requires Pillow/requests.
The board-layout.json coordinates are native scan measurements, not rule state.
"""
from pathlib import Path
import hashlib
import json
import requests
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
names = {f'role-back-{seat}.webp' for seat in range(4)} | {
    'role-back-rhodes.webp', 'official-arknights-logo.webp',
    'official-nomad-logo.webp', 'table-resource-rock.webp',
    'table-resource-ore.webp', 'table-resource-iron.webp',
}
manifest_path = ROOT / 'assets/manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf8'))
for entry in manifest:
    if entry['id'] not in names:
        continue
    source = ROOT / entry['sourceFile']
    if not source.exists():
        response = requests.get(entry['sourceUrl'], timeout=90)
        response.raise_for_status()
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(response.content)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == entry['sourceSha256'], entry['id']
    image = Image.open(source).convert('RGBA')
    if entry['id'].startswith('table-resource-'):
        image = image.crop((53, 96, 200, 243))
        mask = Image.new('L', image.size)
        ImageDraw.Draw(mask).ellipse((1, 1, image.width-2, image.height-2), fill=255)
        image.putalpha(mask)
    target = ROOT / entry['path']
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, lossless=True)
    entry.update(sha256=hashlib.sha256(target.read_bytes()).hexdigest(), bytes=target.stat().st_size, size=list(image.size))
    print(entry['id'], image.size)
original = next(entry for entry in manifest if entry['id'] == 'resource-prime.webp')
target = next(entry for entry in manifest if entry['id'] == 'table-resource-prime.webp')
if not (ROOT / original['path']).exists():
    source = ROOT / original['sourceFile']
    if not source.exists():
        response = requests.get(original['sourceUrl'], timeout=90)
        response.raise_for_status()
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(response.content)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == original['sourceSha256']
    Image.open(source).convert('RGBA').save(ROOT / original['path'], lossless=True)
    assert hashlib.sha256((ROOT / original['path']).read_bytes()).hexdigest() == original['sha256']
(ROOT / target['path']).write_bytes((ROOT / original['path']).read_bytes())
target.update(sha256=original['sha256'], bytes=original['bytes'])
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
