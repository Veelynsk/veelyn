#!/usr/bin/env python3
"""
import-photos.py — pre-process and import bottle photos.

Usage:
  Drop your raw photos into a folder. Each filename should be either:
    - the fragrance id (e.g. "savage-queen.png" → veelyn bottle)
    - or "original-<slug>.png" / live in originals/ subfolder for designer bottles
  Then run:
    python3 scripts/import-photos.py /path/to/raw-folder

For each Veelyn bottle photo, the script:
  1. Removes background via rembg
  2. Saves to images/veelyn/<id>.png

For original bottles (filenames starting with `original-` or in `original/` subfolder):
  1. Removes background
  2. Saves to images/originals/<slug>.png (slug derived from original_name in fragrances.json)
"""

import sys
import os
import json
import re
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
DATA = json.load(open(PROJECT / 'fragrances.json'))
VEELYN_IDS = {f['id'] for f in DATA}
ORIG_SLUGS = {re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-', f['original_name'].lower())): f for f in DATA}


def remove_bg(src_path, dst_path):
    from rembg import remove
    from PIL import Image
    img = Image.open(src_path)
    out = remove(img)
    out.save(dst_path)


def main():
    if len(sys.argv) < 2:
        print(f'usage: {sys.argv[0]} /path/to/raw-folder')
        sys.exit(1)
    src_dir = Path(sys.argv[1])
    if not src_dir.is_dir():
        print(f'not a directory: {src_dir}')
        sys.exit(1)

    veelyn_dir = PROJECT / 'images' / 'veelyn'
    orig_dir = PROJECT / 'images' / 'originals'
    veelyn_dir.mkdir(parents=True, exist_ok=True)
    orig_dir.mkdir(parents=True, exist_ok=True)

    processed_v = 0
    processed_o = 0
    skipped = []

    for entry in src_dir.rglob('*'):
        if not entry.is_file(): continue
        ext = entry.suffix.lower()
        if ext not in {'.png', '.jpg', '.jpeg', '.webp'}: continue
        stem = entry.stem.lower()
        is_original = 'original' in str(entry.parent).lower() or stem.startswith('original-') or stem.startswith('orig-')
        if is_original:
            key = stem.replace('original-', '').replace('orig-', '')
            if key in ORIG_SLUGS:
                dst = orig_dir / f'{key}.png'
                print(f'[orig] {entry.name} → {dst.relative_to(PROJECT)}')
                remove_bg(entry, dst)
                processed_o += 1
            else:
                skipped.append((entry.name, f'no fragrance with original_name slug "{key}"'))
        else:
            if stem in VEELYN_IDS:
                dst = veelyn_dir / f'{stem}.png'
                print(f'[veelyn] {entry.name} → {dst.relative_to(PROJECT)}')
                remove_bg(entry, dst)
                processed_v += 1
            else:
                skipped.append((entry.name, f'no fragrance with id "{stem}"'))

    print(f'\n--- Summary ---')
    print(f'Veelyn photos: {processed_v}')
    print(f'Original photos: {processed_o}')
    if skipped:
        print(f'Skipped ({len(skipped)}):')
        for f, why in skipped:
            print(f'  {f} — {why}')


if __name__ == '__main__':
    main()
