"""Restore and verify inert Oripathy scans outside production assets."""
import argparse
import concurrent.futures
import hashlib
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.data/sources/oripathy'
catalog = json.loads((ROOT / 'assets/oripathy-evidence.json').read_text(encoding='utf-8'))
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true', help='Verify cached sources without network access')
parser.add_argument('ids', nargs='*', help='Optional face IDs from the evidence catalog')
args = parser.parse_args()
known = {ref['id']: ref for ref in catalog['faces']}
unknown = set(args.ids) - known.keys()
if unknown:
    parser.error('Unknown face IDs: ' + ', '.join(sorted(unknown)))
selected = [known[key] for key in args.ids] if args.ids else list(known.values())

def validate(raw, ref):
    if len(raw) != ref['bytes'] or hashlib.sha256(raw).hexdigest() != ref['sha256']:
        raise ValueError(f"Changed source or corrupted cache: {ref['id']}; evidence requires review")
    if not (raw.startswith(b'\x89PNG\r\n\x1a\n') or raw.startswith(b'\xff\xd8\xff')):
        raise ValueError(f"Expected an inert PNG/JPEG scan: {ref['id']}")

def acquire(ref):
    path = ROOT / ref['cacheFile']
    if path.parent.resolve() != CACHE.resolve():
        raise ValueError('Source-cache path outside the intended folder')
    if path.exists():
        validate(path.read_bytes(), ref)
    else:
        if args.check:
            raise FileNotFoundError(f"Missing source: {ref['id']}")
        request = urllib.request.Request(ref['sourceUrl'], headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = response.read()
        validate(raw, ref)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
    return ref['id']

if catalog['printedCardCount'] != 71 or sum(g['printedCopies'] for g in catalog['componentGroups']) != 71:
    raise ValueError('Printed component inventory must contain exactly 71 cards')
if len(known) != len(catalog['faces']):
    raise ValueError('Duplicate evidence IDs')
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for face_id in pool.map(acquire, selected):
        print('VERIFIED', face_id)
print(f"Verified {len(selected)} image candidates; production rules use their own verified pack.")
