"""Import original printed accessories and project the public city reference mesh.

All image operations are deterministic crops/format conversion. No game data is
read or changed. Source downloads are cached under .data/sources/table-feel.
"""
from pathlib import Path
import hashlib
import json
import math
import urllib.request
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '.data/sources/table-feel'
OUT = ROOT / 'apps/web/public/assets'
URLS = json.loads((ROOT / 'assets/table-motion-sources.json').read_text(encoding='utf-8'))
MANIFEST = ROOT / 'assets/manifest.json'
entries = json.loads(MANIFEST.read_text(encoding='utf-8'))
SOURCE.mkdir(parents=True, exist_ok=True)
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
needed = ['city-model.obj', 'token-21.png', 'token-47.png'] + [f'token-{n}.png' for n in range(55, 59)] + [f'item-{r}.png' for r in ['rock', 'ore', 'iron', 'prime']]
for name in needed:
    if not (SOURCE / name).exists():
        with opener.open(URLS[name], timeout=40) as response:
            (SOURCE / name).write_bytes(response.read())

def record(path, source, processing, size=None):
    global entries
    entry = dict(id=path.name, path=path.relative_to(ROOT).as_posix(),
                 sourceFile=source.relative_to(ROOT).as_posix(),
                 sourceUrl=URLS.get(source.name) or next((e['sourceUrl'] for e in entries if e.get('sourceFile') == source.relative_to(ROOT).as_posix()), 'https://steamcommunity.com/sharedfiles/filedetails/?id=3064722448'),
                 sourceContainer=('https://prts.wiki/w/文件:' + URLS[source.name].split('/')[-1]) if source.name.startswith('item-') else 'https://steamcommunity.com/sharedfiles/filedetails/?id=3064722448',
                 sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                 sourceKind='Original Arknights item artwork via PRTS' if source.name.startswith('item-') else 'Community reference mesh' if source.suffix == '.obj' else 'Original printed board game artwork via public tabletop reference',
                 processing=processing,
                 rights='Printed art: Hypergryph. Mesh: public community reference. Private friend play; rights remain with their respective authors.',
                 sha256=hashlib.sha256(path.read_bytes()).hexdigest(), bytes=path.stat().st_size)
    if size: entry['size'] = list(size)
    entries = [e for e in entries if e['path'] != entry['path']] + [entry]

def crop(name, source, box=None):
    im = Image.open(source).convert('RGBA')
    if box: im = im.crop(box)
    path = OUT / name
    im.save(path, 'WEBP', lossless=True)
    record(path, source, f'Lossless WebP; source pixel crop {box or "full image"}; no upscaling', im.size)

for seat, token in enumerate(range(55, 59)):
    source = SOURCE / f'token-{token}.png'
    crop(f'entrepreneur-{seat}.webp', source)
    crop(f'entrepreneur-bust-{seat}.webp', source, (75, 25, 810, 835))
    boxes = [(225, 35, 590, 400), (290, 45, 615, 370), (240, 40, 610, 410), (265, 55, 620, 410)]
    crop(f'avatar-{seat}.webp', source, boxes[seat])
crop('president.webp', SOURCE / 'token-47.png', (240, 30, 760, 1000))
for type_ in ['rock', 'ore', 'iron', 'prime']:
    crop(f'resource-{type_}.webp', SOURCE / f'item-{type_}.png')
crop('resource-cash.webp', SOURCE / 'token-21.png')

board = ROOT / '.data/sources/art/board-4.png'
# Printed scoring legend, including the original prime and victory-point symbols.
crop('resource-score.webp', board, (135, 4856, 209, 4912))
crop('board-hint-4.webp', board, (105, 4180, 2635, 4840))
crop('board-hint-3.webp', ROOT / '.data/sources/art/board-3.png', (115, 160, 2660, 855))

# Orthographic, shaded render of the reference mesh. Keep vector faces for sharp
# silhouettes at every map scale. Seat variants share exactly the same geometry.
mesh = SOURCE / 'city-model.obj'
vertices, faces = [], []
for line in mesh.read_text(encoding='utf-8').splitlines():
    if line.startswith('v '): vertices.append(tuple(map(float, line.split()[1:])))
    if line.startswith('f '): faces.append([int(t.split('/')[0])-1 for t in line.split()[1:]])
def dot(a, b): return sum(x*y for x,y in zip(a,b))
def sub(a, b): return tuple(x-y for x,y in zip(a,b))
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def norm(a):
    d=math.sqrt(dot(a,a)) or 1
    return tuple(x/d for x in a)
camera=norm((5, 5.5, 7)); right=norm((camera[2],0,-camera[0])); up=cross(camera,right)
projected=[(dot(v,right),-dot(v,up)) for v in vertices]
x0=min(v[0] for v in projected);x1=max(v[0] for v in projected)
y0=min(v[1] for v in projected);y1=max(v[1] for v in projected)
scale=96/(x1-x0)
polygons=[]
for face in faces:
    vs=[vertices[i] for i in face]
    n=norm(cross(sub(vs[1],vs[0]),sub(vs[2],vs[0])))
    if dot(n,camera) < -0.02: continue
    pts=[((projected[i][0]-(x0+x1)/2)*scale,(projected[i][1]-y1)*scale) for i in face]
    light=max(0.23, min(1.15,0.57+0.5*dot(n,norm((-3,8,4)))))
    polygons.append((sum(dot(v,camera) for v in vs)/len(vs),pts,light))
polygons.sort(key=lambda p:p[0])
colors=['#db674d','#66a89d','#6e9fcd','#d4b65b']
for seat,color in enumerate(colors):
    rgb=[int(color[i:i+2],16) for i in (1,3,5)]
    height=math.ceil((y1-y0)*scale)+6
    lines=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 {-height} 100 {height+4}">']
    preview=Image.new('RGBA',(600,(height+4)*6)); draw=ImageDraw.Draw(preview)
    for _,pts,light in polygons:
        fill=tuple(min(255,round(v*light+14)) for v in rgb)
        points=' '.join(f'{x:.2f},{y:.2f}' for x,y in pts)
        lines.append(f'<polygon points="{points}" fill="rgb{fill}" stroke="rgb{fill}" stroke-width=".12"/>')
        draw.polygon([((x+50)*6,(y+height)*6) for x,y in pts],fill=fill)
    lines.append('</svg>')
    path=OUT/f'city-model-{seat}.svg';path.write_text('\n'.join(lines),encoding='utf-8')
    record(path,mesh,'Shared OBJ orthographic projection; front faces, painter depth order, diffuse lighting; seat material '+color)
    if seat==0: preview.save(SOURCE/'city-preview.png')
MANIFEST.write_text(json.dumps(entries,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Imported four entrepreneurs, president, six resource symbols, board hints and four mesh projections.')
