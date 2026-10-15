"""Find public tabletop archives for original-component cross-checking.

Only public search and file metadata are read. Downloaded scripts are never run.
"""
import concurrent.futures
import hashlib
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.data' / 'sources' / 'workshop-candidates'
CACHE.mkdir(parents=True, exist_ok=True)

def fetch(url, data=None):
    request = urllib.request.Request(url, data=data, headers={
        'User-Agent': 'Mozilla/5.0', 'Referer': 'https://steamcommunity.com/'})
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.read()

def search(text):
    url = 'https://steamcommunity.com/workshop/browse/?' + urllib.parse.urlencode({
        'appid': 286160, 'searchtext': text, 'browsesort': 'textsearch'})
    raw = fetch(url)
    (CACHE / (hashlib.sha256(text.encode()).hexdigest()[:12] + '.html')).write_bytes(raw)
    html = raw.decode('utf-8')
    ids = sorted(set(re.findall(r'(?:filedetails/\?id=|publishedfileid["\s:=]+)(\d{8,})', html)))
    print(json.dumps({'query': text, 'candidates': ids}, ensure_ascii=False), flush=True)
    return ids

ids = set()
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    for future in [pool.submit(search, text) for text in ['Nomad City', '游城拓荒']]:
        try:
            ids.update(future.result())
        except Exception as error:
            print(f'Public workshop search: {type(error).__name__}: {error}', flush=True)

if ids:
    params = {'itemcount': len(ids)}
    params.update({f'publishedfileids[{i}]': item for i, item in enumerate(sorted(ids))})
    response = json.loads(fetch(
        'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',
        urllib.parse.urlencode(params).encode()))
    items = response['response']['publishedfiledetails']
    (CACHE / 'public-file-metadata.json').write_text(
        json.dumps(items, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    relevant = [item for item in items if any(name in item.get('title', '').lower()
        for name in ['nomad city', '游城', '明日方舟'])]
    print(json.dumps([{k: item.get(k) for k in [
        'publishedfileid', 'result', 'consumer_app_id', 'title', 'file_url', 'description']}
        for item in relevant], ensure_ascii=False, indent=2))
