#!/usr/bin/env python3
"""Manual mapping for the 4 unmatched files."""
from pathlib import Path
import io
from rembg import remove
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = Path.home() / "Downloads" / "veelyn-originals-raw"
OUT = ROOT / "images" / "originals"

# Manual mappings — filename → output slug
MAPPINGS = {
    "Dior J’adore .webp": "jadore",
    "Louis Vuitton L’Immensité .webp": "limmensite",
    "Yves Saint Laurent Y .avif": "y-eau-de-parfum",
    "burberry goddness.avif": "goddess",
}

for fname, out_slug in MAPPINGS.items():
    src = RAW / fname
    if not src.exists():
        print(f"  ✗ Nenájdený: {fname}")
        continue
    out_file = OUT / f"{out_slug}.png"
    try:
        with open(src, "rb") as fh:
            data = fh.read()
        out = remove(data)
        img = Image.open(io.BytesIO(out)).convert("RGBA")
        bbox = img.getbbox()
        if bbox: img = img.crop(bbox)
        w, h = img.size
        target_h = 1400
        new_w = int(w * target_h / h)
        img = img.resize((new_w, target_h), Image.LANCZOS)
        img.save(out_file, "PNG", optimize=True)
        print(f"  ✓ {fname}  →  {out_slug}.png  ({img.size})")
    except Exception as e:
        print(f"  ✗ ERR  {fname}: {e}")
