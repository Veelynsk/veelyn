#!/usr/bin/env python3
"""
batch-compose.py — process a folder of label images and composite each onto the bottle template.

Usage:
  python3 scripts/batch-compose.py /path/to/labels-folder

Each label file should be named exactly with the fragrance id (e.g. savage-queen.png).
Result: images/veelyn/<id>.png for each.
"""

import sys
import json
import re
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit('pip3 install Pillow')

PROJECT = Path(__file__).resolve().parents[1]
TEMPLATE = PROJECT / 'images' / 'veelyn' / 'i-am-blue.png'
DATA = json.load(open(PROJECT / 'fragrances.json'))
VALID_IDS = {f['id'] for f in DATA}

# Label area on I AM BLUE photo (1024 × 1536)
LABEL_X1, LABEL_Y1 = 286, 698
LABEL_X2, LABEL_Y2 = 744, 1085
LABEL_W = LABEL_X2 - LABEL_X1
LABEL_H = LABEL_Y2 - LABEL_Y1


def main():
    if len(sys.argv) < 2:
        sys.exit(f'usage: {sys.argv[0]} /path/to/labels-folder')

    src_dir = Path(sys.argv[1]).expanduser()
    if not src_dir.is_dir():
        sys.exit(f'not a directory: {src_dir}')

    if not TEMPLATE.is_file():
        sys.exit(f'bottle template missing: {TEMPLATE}')

    template = Image.open(TEMPLATE).convert('RGBA')
    out_dir = PROJECT / 'images' / 'veelyn'
    out_dir.mkdir(parents=True, exist_ok=True)

    processed = []
    skipped = []

    for entry in sorted(src_dir.iterdir()):
        if not entry.is_file(): continue
        if entry.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.webp'}: continue
        frag_id = entry.stem.lower().replace('_', '-')

        if frag_id not in VALID_IDS:
            skipped.append((entry.name, f'unknown id "{frag_id}"'))
            continue
        if frag_id == 'i-am-blue':
            # Don't overwrite the canonical template; user wants new labels for OTHER fragrances
            skipped.append((entry.name, 'i-am-blue is the template — skipping to preserve it'))
            continue

        label = Image.open(entry).convert('RGBA')
        label = label.resize((LABEL_W, LABEL_H), Image.LANCZOS)

        composite = template.copy()
        composite.paste(label, (LABEL_X1, LABEL_Y1), label)

        out_path = out_dir / f'{frag_id}.png'
        composite.save(out_path)
        processed.append(frag_id)
        print(f'✓ {entry.name} → images/veelyn/{frag_id}.png')

    print()
    print(f'--- Summary ---')
    print(f'Processed: {len(processed)}')
    if skipped:
        print(f'Skipped ({len(skipped)}):')
        for f, why in skipped:
            print(f'  {f} — {why}')


if __name__ == '__main__':
    main()
