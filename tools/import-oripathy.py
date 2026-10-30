"""Deterministically prepare private runtime art from hash-verified source scans."""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
catalog = json.loads((ROOT / "assets/oripathy-evidence.json").read_text(encoding="utf8"))
manifest_path = ROOT / "assets/manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf8"))
target = ROOT / "apps/web/public/assets/oripathy"
target.mkdir(parents=True, exist_ok=True)
entries = []
for ref in catalog["faces"]:
    source = ROOT / ref["cacheFile"]
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != ref["sha256"]:
        raise ValueError("Source scan changed: " + ref["id"])
    image = Image.open(source).convert("RGB")
    image.thumbnail((1200, 2200), Image.Resampling.LANCZOS)
    names = [ref["id"]]
    if ref["id"] in ["1072", "1191", "1192"]:
        names.append(ref["id"] + "-hd")
    for name in names:
        output = target / (name + ".webp")
        image.save(output, "WEBP", quality=92, method=6)
        entries.append({
            "id": "oripathy/" + name + ".webp",
            "path": output.relative_to(ROOT).as_posix(),
            "bytes": output.stat().st_size,
            "size": list(image.size),
            "sourceUrl": ref["sourceUrl"],
            "sourceSha256": ref["sha256"],
            "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
            "processing": "完整牌面；不放大原图，最大 1200×2200；Pillow WebP quality=92 method=6；保留原件。",
            "usage": "明日方舟相关美术权利归原权利人；沿用本项目非商业使用边界，运行素材不提交公开 Git。",
        })
paths = {entry["path"] for entry in entries}
manifest = [entry for entry in manifest if entry["path"].replace("\\", "/") not in paths] + entries
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
print(f"Prepared {len(entries)} runtime images; originals preserved outside public Git.")
