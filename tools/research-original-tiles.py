"""Archive candidate department scans from the independent 2024 public archive."""
import concurrent.futures
import hashlib
import io
import json
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / '.data/sources/workshop-candidates/3110530272'
obj = json.loads((FOLDER / 'decoded.json').read_text(encoding='utf-8'))
# The three-card pile follows the eight company boards in this archive.
# It is kept separate from the twelve player resource-counter tiles.
if obj['ObjectStates'][49]['DeckIDs'] != [10400, 10200, 10300]:
    raise ValueError('Independent archive layout changed; inspect before sourcing.')
urls = [deck['FaceURL'] for deck in obj['ObjectStates'][49]['CustomDeck'].values()]

def archive(entry):
    i, original_url = entry
    # HTTPS transport for the same publicly referenced Steam asset.
    parsed = urllib.parse.urlsplit(original_url)
    addresses = [original_url] + [urllib.parse.urlunsplit(('https', host, parsed.path, '', ''))
        for host in ['images.steamusercontent.com', 'steamuserimages-a.akamaihd.net']]
    last_error = None
    for url in addresses:
        req = urllib.request.Request(url, headers={
            'User-Agent':'Mozilla/5.0', 'Referer':'https://steamcommunity.com/'})
        try:
            with urllib.request.urlopen(req, timeout=30) as response: raw=response.read()
            break
        except urllib.error.URLError as error:
            last_error = error
    else: return {'originalUrl':original_url, 'error':str(last_error)}
    (FOLDER / f'tile-{i}.bin').write_bytes(raw)
    image=Image.open(io.BytesIO(raw))
    image.save(FOLDER / f'tile-{i}.png')
    return {'originalUrl':original_url,'fetchUrl':url,'file':f'tile-{i}.png',
        'dimensions':image.size,'sha256':hashlib.sha256(raw).hexdigest()}

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    entries = list(pool.map(archive, enumerate(urls)))
(FOLDER / 'tiles.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(entries,ensure_ascii=False,indent=2))
