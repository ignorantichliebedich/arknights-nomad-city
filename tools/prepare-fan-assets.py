"""Normalize sourced/generated artwork. Preserve board gameplay art in a separate layer."""
from pathlib import Path
from PIL import Image
import hashlib
import json
import shutil

root = Path(__file__).resolve().parent.parent
out = root / 'apps/web/public/assets'
source = root / '.data/sources/table-feel'
generated = root / '.data/sources/generated'
generated.mkdir(parents=True, exist_ok=True)
terrain = generated / 'terrain-margin-v1.png'
if not terrain.exists():
    shutil.copyfile(Path('D:/CodexData/home/generated_images/01a1365e-e5d1-78a2-8ae3-186fadbafbbd/exec-e04f6d70-dd70-4491-ab1e-d8db2ed10b64.png'), terrain)
manifest = json.loads((root / 'assets/manifest.json').read_text(encoding='utf-8'))
def record(path, original, url, processing, kind):
    rel = path.relative_to(root).as_posix()
    manifest[:] = [m for m in manifest if m['path'] != rel]
    manifest.append(dict(id=path.name, path=rel, sourceUrl=url,
        sourceFile=original.relative_to(root).as_posix(), sourceSha256=hashlib.sha256(original.read_bytes()).hexdigest(),
        sourceKind=kind, processing=processing, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), bytes=path.stat().st_size,
        rights='Hypergryph original artwork and private friend-play adaptation. Generated terrain is a decorative margin only; no generated rules or map topology.'))
for original, name, url, processing, kind in [
    (terrain, 'terrain-margin-v1.webp', 'imagegen://exec-e04f6d70-dd70-4491-ab1e-d8db2ed10b64', 'Built-in imagegen terrain reconstruction using board-3 reference; unchanged dimensions, WebP quality 95. Prompt: assets/fan-table-art.md.', 'AI-generated decorative terrain'),
    (source / 'pv-bg.8156ad94.jpg', 'nomad-table-backdrop.webp', 'https://web.hycdn.cn/arknights/boardgame_nomadcity/_next/static/media/pv-bg.8156ad94.jpg', 'Official Founders PV key visual, unchanged framing; WebP quality 95; subdued and animated in CSS.', 'official website artwork'),
    (source / 'role-back.png', 'role-back.webp', 'https://steamusercontent-a.akamaihd.net/ugc/2490002538882613072/D28A381BADD5629CBA56EA18366B3E34F3D3EE75/', 'Original role card back, unchanged framing; WebP quality 95.', 'public tabletop digitization'),
]:
    path = out / name
    Image.open(original).save(path, 'WEBP', quality=95)
    record(path, original, url, processing, kind)

# Masks remove only printed frame/reference slips. Every site/road uses original pixels.
for players in [3, 4]:
    cut = '<path d="M0 0H540V141H280V171H0Z"/>' if players == 3 else '<path d="M0 835H270V884H530V1000H0Z"/>'
    top = '<path d="M0 0H1000V128L959 128L918 86H737L693 46H0Z"/>'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><defs><filter id="soft"><feGaussianBlur stdDeviation="1.3"/></filter><mask id="map"><rect width="1000" height="1000" fill="white"/><g fill="black" filter="url(#soft)">{cut}{top}<rect x="0" y="0" width="45" height="1000"/><rect x="960" y="0" width="40" height="1000"/><rect x="0" y="959" width="1000" height="41"/><rect x="515" y="939" width="137" height="18"/></g></mask></defs><rect width="1000" height="1000" fill="white" mask="url(#map)"/></svg>'''
    path = out / f'board-mask-{players}.svg'
    path.write_text(svg, encoding='utf-8')
    record(path, root / f'.data/sources/art/board-{players}.png', 'local://tools/prepare-fan-assets.py', 'Code-native alpha mask over original board: metal frame, printed reference slips and footer title only. 1.3-unit edge feather.', 'native SVG mask')
(root / 'assets/manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Prepared terrain underlay, official background, card back, and two map masks.')
