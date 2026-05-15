#!/usr/bin/env python3
"""Process raw fragrance photos: fuzzy-match to fragrances.json, rembg, resize, save as kebab-case PNG."""
import json, os, re, sys, io, unicodedata
from pathlib import Path
from rembg import remove
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = Path.home() / "Downloads" / "veelyn-originals-raw"
OUT = ROOT / "images" / "originals"
OUT.mkdir(parents=True, exist_ok=True)

def normalize(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("'", "").replace("'", "")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s

def slug(s: str) -> str:
    s = normalize(s)
    return re.sub(r"\s+", "-", s)

fragrances = json.loads((ROOT / "fragrances.json").read_text())

# Build lookup: normalized "brand + original_name" -> slug
targets = []
seen = set()
for f in fragrances:
    key = (f["brand"], f["original_name"])
    if key in seen: continue
    seen.add(key)
    targets.append({
        "brand": f["brand"],
        "original": f["original_name"],
        "brand_norm": normalize(f["brand"]),
        "orig_norm": normalize(f["original_name"]),
        "slug": slug(f["original_name"]),
    })

def best_match(filename_stem: str):
    """Return target with highest token overlap to filename."""
    fn = normalize(filename_stem)
    fn_tokens = set(fn.split())
    best, best_score = None, -1
    for t in targets:
        brand_toks = set(t["brand_norm"].split())
        orig_toks = set(t["orig_norm"].split())
        # require ALL original tokens present in filename
        if not orig_toks.issubset(fn_tokens):
            continue
        # score = brand match bonus + len(orig)
        score = len(orig_toks) * 10 + (1 if brand_toks & fn_tokens else 0)
        # prefer longer original names (so "Donna Born In Roma Coral Fantasy" beats "Donna Born In Roma")
        if score > best_score:
            best_score = score
            best = t
    return best

def process(path: Path):
    stem = path.stem.strip()
    match = best_match(stem)
    if not match:
        print(f"  ✗ NEMATCHED: {path.name}")
        return False
    out_file = OUT / f"{match['slug']}.png"
    try:
        with open(path, "rb") as fh:
            data = fh.read()
        out = remove(data)
        img = Image.open(io.BytesIO(out)).convert("RGBA")
        # crop transparent borders
        bbox = img.getbbox()
        if bbox: img = img.crop(bbox)
        w, h = img.size
        target_h = 1400
        new_w = int(w * target_h / h)
        img = img.resize((new_w, target_h), Image.LANCZOS)
        img.save(out_file, "PNG", optimize=True)
        print(f"  ✓ {path.name}  →  {match['slug']}.png  ({img.size})")
        return True
    except Exception as e:
        print(f"  ✗ ERR  {path.name}: {e}")
        return False

if not RAW.exists() or not any(RAW.iterdir()):
    print(f"Priečinok {RAW} je prázdny.")
    sys.exit(0)

files = sorted(p for p in RAW.iterdir() if p.is_file() and not p.name.startswith("."))
print(f"Spracovávam {len(files)} fotiek z {RAW}\n")

ok = 0
nematch = []
for f in files:
    if process(f):
        ok += 1
    else:
        nematch.append(f.name)

print(f"\n✅ Hotových: {ok}/{len(files)}")
if nematch:
    print(f"\n⚠️  Nezmatchované ({len(nematch)}):")
    for n in nematch:
        print(f"   - {n}")
