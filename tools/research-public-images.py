"""Archive cited public component photographs for rule verification."""
from pathlib import Path
import hashlib
import json
import sys
import urllib.parse
import urllib.request
from PIL import Image

root = Path(".data/sources/public-images")
root.mkdir(parents=True, exist_ok=True)
allowed = {"assets.st-note.com", "web.hycdn.cn", "gcs.rimg.com.tw"}
for source in sys.argv[1:]:
    url = urllib.parse.urlsplit(source)
    if url.scheme != "https" or url.hostname not in allowed:
        raise ValueError("Expected a cited public-image host")
    target = root / Path(url.path).name
    request = urllib.request.Request(source, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://ak.hypergryph.com/" if url.hostname == "web.hycdn.cn" else "https://note.com/"})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            data = response.read()
        target.write_bytes(data)
        with Image.open(target) as image:
            dimensions = image.size
        record = {"source": source, "file": str(target), "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "dimensions": dimensions}
        target.with_suffix(target.suffix + ".json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf8")
        print(json.dumps(record, ensure_ascii=False))
    except OSError as error:
        print(json.dumps({"source": source, "error": str(error)}, ensure_ascii=False))
