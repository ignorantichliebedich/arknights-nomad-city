"""Read public source material; never execute downloaded code."""
import concurrent.futures, json, re, urllib.request, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.data' / 'sources'
CACHE.mkdir(parents=True, exist_ok=True)

def fetch(url, data=None):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://ak.hypergryph.com/'})
    return urllib.request.urlopen(req, timeout=25).read()

def official():
    html = fetch('https://ak.hypergryph.com/boardgame_nomadcity/').decode()
    (CACHE / 'official.html').write_text(html, encoding='utf-8')
    urls = set(re.findall(r'https://[^\s"<>\\]+\.js', html))
    for path in re.findall(r'static/chunks/[^"<>\\\s]+\.js', html):
        urls.add('https://web.hycdn.cn/arknights/boardgame_nomadcity/_next/'+path)
    for url in urls:
        try:
            raw = fetch(url).decode('utf-8', 'replace')
            (CACHE / url.split('/')[-1]).write_text(raw, encoding='utf-8')
            refs = re.findall(r'[^"\s<>]+(?:\.mp4|\.pdf|\.png|BV[\w]+)[^"\s<>]*', raw)
            print('SOURCE', url, 'REFS', refs[:35])
        except Exception as err: print(url, str(err))
    print('NEXT CHUNKS', re.findall(r'[^"\\\s]*\.js',html))

def steam():
    params = urllib.parse.urlencode({'itemcount': 1, 'publishedfileids[0]': '3064722448'}).encode()
    obj = json.loads(fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', params))
    (CACHE/'steam-details.json').write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8')
    item=obj['response']['publishedfiledetails'][0]
    print('STEAM', {key:item.get(key) for key in ['result','file_url','filename','title','preview_url']})
    if item.get('file_url'):
        raw=fetch(item['file_url'])
        (CACHE/'tabletop.json').write_bytes(raw)
        print('TABLETOP',len(raw))

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor() as pool:
        tasks = [pool.submit(official), pool.submit(steam)]
        for task in tasks:
            try: task.result()
            except Exception as err: print(type(err).__name__,str(err))
