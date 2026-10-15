"""Preserve native scan detail for the interactive table and card viewer.

Uses the archived originals and their existing provenance, never upscales a scan.
Run after import-assets.py if the complete asset library is regenerated.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'assets/manifest.json'
manifest = json.loads(path.read_text(encoding='utf-8-sig'))
sources = [entry for entry in manifest if entry['path'].startswith('apps/web/public/')
           and (entry['id'] in ['board-3.webp', 'board-4.webp'] or
                (entry['id'].startswith('role-') and not entry['id'].endswith('-hd.webp')))]
for entry in sources:
    source = ROOT / entry['sourceFile']
    assert hashlib.sha256(source.read_bytes()).hexdigest() == entry['sourceSha256']
    image = Image.open(source).convert('RGB')
    target = ROOT / entry['path'].replace('.webp', '-hd.webp')
    image.save(target, quality=96, method=6)
    raw = target.read_bytes()
    result = {**entry, 'id': entry['id'].replace('.webp', '-hd.webp'),
              'path': str(target.relative_to(ROOT)).replace('\\', '/'),
              'processing': 'native scan dimensions retained without resizing; WebP quality 96',
              'size': list(image.size), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    manifest = [old for old in manifest if old['id'] != result['id']]
    manifest.append(result)
    print(f"{result['id']}: {image.width}x{image.height}, {len(raw) // 1024} KiB")
path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
