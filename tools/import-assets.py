"""Import verified scans, normalize runtime art, and record provenance.

Run research.py and extract-tabletop.py first. Downloaded scripts are never run.
"""
import concurrent.futures
import hashlib
import json
import urllib.request
from pathlib import Path
import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '.data' / 'sources'
RAW = SOURCE / 'art'
OUT = ROOT / 'apps' / 'web' / 'public' / 'assets'
RAW.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
objects = json.loads((SOURCE / 'tabletop-decoded.json').read_text(encoding='utf-8'))['ObjectStates']
atlases = json.loads((SOURCE / 'atlases.json').read_text(encoding='utf-8'))
CONTAINER = 'https://steamcommunity.com/sharedfiles/filedetails/?id=3064722448'
RIGHTS = 'Original boardgame artwork: Hypergryph; public community digitization: Jakobs. Public access does not grant a redistribution license. Intended project use: private friend play; ownership retained by the respective authors.'
requests = {}
for index, name in [(65, 'rules-reference.pdf'), (68, 'newspaper.pdf')]:
    requests[name] = objects[index]['CustomPDF']['PDFUrl']
for index, name in [(114, 'board-4.png'), (115, 'board-3.png')]:
    requests[name] = objects[index]['CustomImage']['ImageURL']
indices = {
    '154': list(range(6)), '156': list(range(7)),
    '167': list(range(10)) + [11], '166': list(range(51)),
    '165': [0, 1, 2, 4, 5, 6, 7, 8],
    '640': list(range(4)), '625': list(range(8)),
}
for key in indices:
    requests[f'atlas-{key}.png'] = atlases[key]['FaceURL']
for key, deck in objects[44]['CustomDeck'].items():
    requests[f'role-{key}.png'] = deck['FaceURL']

def acquire(pair):
    name, url = pair
    path = (SOURCE if name.endswith('.pdf') else RAW) / name
    legacy = OUT / name
    if not path.exists() and legacy.exists():
        path.write_bytes(legacy.read_bytes())
    if name == 'newspaper.pdf' and not path.exists() and (SOURCE / 'rules-book.pdf').exists():
        path.write_bytes((SOURCE / 'rules-book.pdf').read_bytes())
    if not path.exists():
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=90) as response:
            path.write_bytes(response.read())
    return name, path

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    acquired = dict(pool.map(acquire, requests.items()))
manifest = []
source_hashes = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in acquired.items()}
def record(path, source_name, processing, **extra):
    raw = path.read_bytes()
    item = {
        'id': str(path.relative_to(OUT)).replace('\\', '/') if path.is_relative_to(OUT) else source_name,
        'path': str(path.relative_to(ROOT)).replace('\\', '/'),
        'sourceUrl': requests[source_name], 'sourceContainer': CONTAINER,
        'sourceFile': str(acquired[source_name].relative_to(ROOT)).replace('\\', '/'),
        'sourceSha256': source_hashes[source_name],
        'sourceKind': 'community-hosted original scan, verified against printed rulebook',
        'processing': processing, 'rights': RIGHTS,
        'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), **extra,
    }
    if path.suffix in ['.webp', '.png']:
        with Image.open(path) as image:
            item['size'] = list(image.size)
    manifest.append(item)

for name, path in acquired.items():
    record(path, name, 'unmodified archival source',
           sourceKind='reference newspaper; excluded from rule adjudication' if name == 'newspaper.pdf' else 'original scan reference')
for count in [3, 4]:
    name = f'board-{count}.png'
    image = Image.open(acquired[name]).convert('RGB')
    image.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
    path = OUT / f'board-{count}.webp'
    image.save(path, quality=91, method=6)
    record(path, name, 'proportional resize to maximum 2400px; WebP quality 91')
for key, selected in indices.items():
    name = f'atlas-{key}.png'
    image = Image.open(acquired[name])
    width, height = atlases[key]['NumWidth'], atlases[key]['NumHeight']
    folder = OUT / f'cards-{key}'
    folder.mkdir(exist_ok=True)
    for index in selected:
        x, y = index % width, index // width
        box = tuple(round(value) for value in (
            x*image.width/width, y*image.height/height,
            (x+1)*image.width/width, (y+1)*image.height/height))
        card = image.crop(box).convert('RGB')
        card.thumbnail((600, 850), Image.Resampling.LANCZOS)
        path = folder / f'{index}.webp'
        card.save(path, quality=92, method=6)
        record(path, name, 'grid crop; proportional maximum 600×850px; WebP quality 92', gridIndex=index, cropPixels=box)
for name, path in acquired.items():
    if not name.startswith('role-'):
        continue
    image = Image.open(path).convert('RGB')
    image.thumbnail((600, 850), Image.Resampling.LANCZOS)
    target = OUT / (Path(name).stem + '.webp')
    image.save(target, quality=92, method=6)
    record(target, name, 'proportional maximum 600×850px; WebP quality 92')

# Coordinates use the original PDF's documented 1.6× reference rendering.
clips = {
    'w': (21, (95, 925, 285, 1192)),
    'kaltsit': (21, (668, 925, 858, 1192)),
    'closure': (22, (103, 222, 296, 489)),
    'dorothy': (22, (351, 222, 543, 489)),
    'silverash': (22, (678, 222, 870, 489)),
    'mudrock': (22, (969, 222, 1161, 489)),
    'passenger': (22, (103, 819, 296, 1095)),
    'eunectes': (22, (679, 819, 872, 1096)),
}
folder = OUT / 'operatives'
folder.mkdir(exist_ok=True)
with fitz.open(acquired['rules-reference.pdf']) as manual:
    for role, (page, coords) in clips.items():
        clip = fitz.Rect(*(n/1.6 for n in coords))
        pixels = manual[page-1].get_pixmap(matrix=fitz.Matrix(4,4), clip=clip, alpha=False)
        image = Image.frombytes('RGB', (pixels.width, pixels.height), pixels.samples)
        image.thumbnail((600,850), Image.Resampling.LANCZOS)
        path = folder / f'{role}.webp'
        image.save(path, quality=94, method=6)
        record(path, 'rules-reference.pdf', 'native PDF region rendered at 4×; WebP quality 94', pdfPage=page, printedPage=page-2, pdfClip=list(clip))
(ROOT / 'assets').mkdir(exist_ok=True)
(ROOT / 'assets' / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
runtime = [item for item in manifest if item['path'].startswith('apps/web/public/')]
print(f'Normalized {len(runtime)} runtime assets, {sum(item["bytes"] for item in runtime)/1024/1024:.1f} MiB; provenance written to assets/manifest.json')
