"""Archive official guide images linked by PRTS for original-enterprise verification.

This is a read-only source collector. It never imports unverified effects into
the playable rules pack or executes downloaded scripts.
"""
import concurrent.futures
import hashlib
import http.client
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.data' / 'sources' / 'official-guides'
CACHE.mkdir(parents=True, exist_ok=True)
PAGE = 'https://prts.wiki/w/%E6%B8%B8%E5%9F%8E%E6%8B%93%E8%8D%92%EF%BC%9A%E9%93%B8%E5%9F%BA%E8%80%85'

def fetch(url):
    referer = 'https://www.bilibili.com/' if 'hdslb.com/' in url else 'https://ak.hypergryph.com/' if 'web.hycdn.cn/' in url else 'https://prts.wiki/'
    headers = {'User-Agent': 'Mozilla/5.0', 'Referer': referer}
    content = bytearray()
    expected = None
    for attempt in range(3):
        request_headers = dict(headers)
        if content:
            request_headers['Range'] = f'bytes={len(content)}-'
        req = urllib.request.Request(url, headers=request_headers)
        with urllib.request.urlopen(req, timeout=35) as response:
            if response.status == 200:
                content.clear()
                expected = int(response.headers['Content-Length']) if response.headers.get('Content-Length') else None
            elif response.status == 206:
                content_range = response.headers.get('Content-Range', '')
                match = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)', content_range)
                if not match or int(match[1]) != len(content):
                    raise ValueError(f'Unexpected source range: {content_range}')
                expected = int(match[3])
            try:
                while chunk := response.read(128 * 1024):
                    content.extend(chunk)
            except http.client.IncompleteRead as error:
                content.extend(error.partial)
            if expected is None or len(content) == expected:
                return bytes(content)
    raise ValueError(f'Incomplete source image: {len(content)} of {expected} bytes')

try:
    html = fetch(PAGE).decode('utf-8')
    (CACHE / 'prts-page.html').write_text(html, encoding='utf-8')
    urls = sorted(set(re.findall(r'https://i0\.hdslb\.com/bfs/new_dyn/[a-zA-Z0-9]+\.(?:jpg|png)', html)))
except Exception as error:
    print(f'Index fetch failed: {type(error).__name__}; use exact guide links verified through the public wiki.')
    urls = [
        'https://i0.hdslb.com/bfs/new_dyn/1bc093d321af6e525aa29fab5b48412d161775300.jpg',
        'https://i0.hdslb.com/bfs/new_dyn/e9010ea5ceec26a09ffcda2b04459fa8161775300.jpg',
        'https://i0.hdslb.com/bfs/new_dyn/ab1a50628f5e159a06afb6f7e1942d83161775300.jpg',
        'https://i0.hdslb.com/bfs/new_dyn/761356fbf53a0a92ca6c3b9906b83430161775300.jpg',
        'https://i0.hdslb.com/bfs/new_dyn/ee21dd8439d275ac1786410e1912007a161775300.jpg',
        'https://i0.hdslb.com/bfs/new_dyn/dd9e24b9e77849418d11d2529f03c364161775300.jpg',
        'https://i0.hdslb.com/bfs/new_dyn/d064f50a0af75ec1b17280939f8b50a1161775300.jpg',
        'https://i0.hdslb.com/bfs/new_dyn/25647499a17c66956ecf6db4e729b413161775300.jpg',
        'https://i0.hdslb.com/bfs/new_dyn/aef1916ef7b391f949113e4f3dbf3e5d161775300.jpg',
        'https://i0.hdslb.com/bfs/new_dyn/59e6dbf4987dae8a97decab6b965deca161775300.jpg',
        'https://web.hycdn.cn/upload/image/20231215/351894313b07d05b367b0b8a3b90f308.jpg',
        'https://i0.hdslb.com/bfs/new_dyn/a0a0b35292ee3388e75673e5e8560155161775300.jpg',
    ]

def archive(url):
    path = CACHE / url.rsplit('/', 1)[-1]
    if not path.exists():
        path.write_bytes(fetch(url))
    content = path.read_bytes()
    return {'file': path.name, 'sourceUrl': url, 'indexPage': PAGE,
            'sourceKind': 'official Arknights strategy guide linked by PRTS; verify individual diagrams before rule use',
            'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)}

entries = []
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for url, future in zip(urls, [pool.submit(archive, url) for url in urls]):
        try:
            entries.append(future.result())
        except Exception as error:
            entries.append({'sourceUrl': url, 'error': str(error)})
(CACHE / 'manifest.json').write_text(json.dumps(entries, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(entries, ensure_ascii=False, indent=2))
