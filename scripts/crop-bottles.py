#!/usr/bin/env python3
"""
Crop bottle PNGs to bbox + small padding so they fill the frame.
Run: python3 scripts/crop-bottles.py [folder]
Default folder: images/veelyn
"""
import sys
from pathlib import Path
from PIL import Image

PADDING_PCT = 0.04  # 4% padding around bbox

def crop_bottle(path):
    img = Image.open(path).convert('RGBA')
    bbox = img.getbbox()  # bbox of non-zero alpha pixels (works for transparent PNGs)
    if not bbox:
        print(f"  ! no bbox: {path.name}")
        return
    w, h = img.size
    left, top, right, bottom = bbox
    bw, bh = right - left, bottom - top
    if bw == w and bh == h:
        print(f"  - already tight: {path.name}")
        return
    # Add small padding (4%)
    pad_x = int(bw * PADDING_PCT)
    pad_y = int(bh * PADDING_PCT)
    new_left = max(0, left - pad_x)
    new_top = max(0, top - pad_y)
    new_right = min(w, right + pad_x)
    new_bottom = min(h, bottom + pad_y)
    cropped = img.crop((new_left, new_top, new_right, new_bottom))
    cropped.save(path, 'PNG', optimize=True)
    print(f"  ✓ cropped {path.name}: {w}x{h} -> {cropped.size[0]}x{cropped.size[1]} (saved {(w*h - cropped.size[0]*cropped.size[1])*100//(w*h)}%)")

def main():
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('images/veelyn')
    folder = folder if folder.is_absolute() else (Path(__file__).parent.parent / folder)
    pngs = sorted(folder.glob('*.png'))
    if not pngs:
        print(f"No PNGs in {folder}")
        return
    print(f"Cropping {len(pngs)} files in {folder}/")
    for p in pngs:
        try:
            crop_bottle(p)
        except Exception as e:
            print(f"  ! {p.name}: {e}")

if __name__ == '__main__':
    main()
