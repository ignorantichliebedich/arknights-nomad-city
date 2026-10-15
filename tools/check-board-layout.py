"""Check measured hitboxes against the original printed white slot squares."""
import json
import hashlib
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
catalog = json.loads((root/'assets/board-layout.json').read_text(encoding='utf8'))
total = 0
for count, sites in catalog['boards'].items():
    source = root/catalog['sources'][count]['sourceFile']
    assert hashlib.sha256(source.read_bytes()).hexdigest() == catalog['sources'][count]['sourceSha256']
    image = Image.open(source).convert('RGB')
    assert image.size == (5000, 5000)
    for name, layout in sites.items():
        for point in layout['slots']:
            # The exact center contains a printed colored plus. Check the
            # interior white corner, at its actual native scan coordinates.
            pixel = image.getpixel((round((point['x']-5)*5), round((point['y']-5)*5)))
            assert min(pixel) > 245, (count, name, point, pixel)
            total += 1
print(f'Verified {total} printed slot centers against both original 5000 px boards.')
