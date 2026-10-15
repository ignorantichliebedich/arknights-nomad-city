"""Read public official-site asset references; never execute downloaded JavaScript."""
from pathlib import Path
import gzip
import hashlib
import json
import re
import urllib.request

root = Path(".data/sources/official-assets")
root.mkdir(parents=True, exist_ok=True)
html = Path(".data/sources/official.html").read_text(encoding="utf8")
scripts = sorted(set(re.findall(r'src="([^"]+\.js)"', html)))
scripts = sorted(set(scripts) | {
    "https://web.hycdn.cn/arknights/boardgame_nomadcity/_next/" + path
    for path in re.findall(r"static/chunks/[A-Za-z0-9_./-]+\.js", html)
})
media = set(re.findall(r"static/media/[^\"<> ]+", html))
records = []
for source in scripts:
    if not source.startswith("https://web.hycdn.cn/arknights/boardgame_nomadcity/"):
        continue
    target = root / source.rsplit("/", 1)[-1]
    try:
        request = urllib.request.Request(source, headers={
            "User-Agent": "Mozilla/5.0", "Accept-Encoding": "identity",
            "Referer": "https://ak.hypergryph.com/boardgame_nomadcity/",
        })
        with urllib.request.urlopen(request, timeout=25) as response:
            raw = response.read()
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        text = raw.decode("utf8")
        target.write_text(text, encoding="utf8")
        media.update(re.findall(r"static/media/[A-Za-z0-9_.-]+", text))
        records.append({"source": source, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)})
    except (OSError, UnicodeError) as error:
        records.append({"source": source, "error": type(error).__name__})
        print("Public script unavailable:", target.name)
manifest = {"scripts": records, "media": sorted(media)}
(root / "references.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf8")
print(json.dumps({"scripts": len(records), "media": sorted(media)}, ensure_ascii=False))
