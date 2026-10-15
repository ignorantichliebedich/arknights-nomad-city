"""Local OCR assists transcription; archived original pixels remain the evidence."""
from pathlib import Path
import json
import sys

sys.path.insert(0, str(Path(".data/research-python").resolve()))
from rapidocr_onnxruntime import RapidOCR

engine = RapidOCR()
source_root = Path(".data/sources").resolve()
line_only = sys.argv[1:2] == ["--line"]
for filename in sys.argv[2:] if line_only else sys.argv[1:]:
    image = Path(filename).resolve()
    if not image.is_relative_to(source_root):
        raise ValueError("Expected a project source-reference image")
    result, timings = engine(str(image), use_det=not line_only)
    lines = ([{"text": text, "confidence": round(confidence, 4)} for text, confidence in (result or [])] if line_only else [{"text": text, "confidence": round(confidence, 4), "box": box} for box, text, confidence in (result or [])])
    image.with_suffix(image.suffix + ".ocr.json").write_text(json.dumps({"file": str(image), "lines": lines}, ensure_ascii=False, indent=2), encoding="utf8")
    print(json.dumps({"file": image.name, "lines": [{"text": line["text"], "confidence": line["confidence"]} for line in lines]}, ensure_ascii=False))
