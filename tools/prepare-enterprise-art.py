"""Extract native-resolution enterprise boards from the archived original atlas.

Only crop the recorded grid cells; preserve all printed artwork and rule text.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
manifest_path = ROOT / "assets/manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
boards = [e for e in manifest if e["path"].startswith("apps/web/public/assets/cards-625/")
          and not e["id"].endswith("-hd.webp")]
assert len(boards) == 8
for entry in boards:
    source = ROOT / entry["sourceFile"]
    assert hashlib.sha256(source.read_bytes()).hexdigest() == entry["sourceSha256"]
    with Image.open(source) as atlas:
        board = atlas.crop(tuple(entry["cropPixels"])).convert("RGB")
    assert board.size == (650, 1850), f'Unexpected board size: {entry["id"]}'
    target = ROOT / entry["path"].replace(".webp", "-hd.webp")
    board.save(target, quality=96, method=6)
    data = target.read_bytes()
    result = {**entry, "id": entry["id"].replace(".webp", "-hd.webp"),
              "path": target.relative_to(ROOT).as_posix(),
              "processing": "recorded atlas grid crop at native 650x1850 resolution; no resizing or repainting; WebP quality 96",
              "size": list(board.size), "bytes": len(data),
              "sha256": hashlib.sha256(data).hexdigest()}
    manifest = [e for e in manifest if e["id"] != result["id"]]
    manifest.append(result)
    print(f'{result["id"]}: {board.width}x{board.height}, {len(data) // 1024} KiB')
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
