#!/usr/bin/env python3
"""
compose-bottle.py — composite a Canva label onto the Veelyn bottle template.

Usage:
  python3 scripts/compose-bottle.py <label.png> <fragrance-id>

Example:
  python3 scripts/compose-bottle.py ~/Downloads/savage-queen-label.png savage-queen

Result: images/veelyn/savage-queen.png with the label pasted onto the I AM BLUE bottle.

Notes:
  - Label is resized to fit the bottle's paper-label area (458×387 px on 1024×1536 photo).
  - Label image should ideally be the same aspect ratio (~1.18:1, slightly wider than tall).
  - If label has transparent background, only opaque pixels are pasted.
  - The base bottle photo (i-am-blue.png) provides the glass + cap; the new label replaces I AM BLUE label.
"""

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit('PIL/Pillow not installed. Run: pip3 install Pillow')

PROJECT = Path(__file__).resolve().parents[1]
TEMPLATE = PROJECT / 'images' / 'veelyn' / 'i-am-blue.png'

# Label area on I AM BLUE photo (1024 × 1536)
LABEL_X1, LABEL_Y1 = 286, 698
LABEL_X2, LABEL_Y2 = 744, 1085
LABEL_W = LABEL_X2 - LABEL_X1   # 458
LABEL_H = LABEL_Y2 - LABEL_Y1   # 387


def main():
    if len(sys.argv) != 3:
        sys.exit(f'usage: {sys.argv[0]} <label.png> <fragrance-id>')

    label_path = Path(sys.argv[1]).expanduser()
    frag_id = sys.argv[2].strip().lower()

    if not label_path.is_file():
        sys.exit(f'Label file not found: {label_path}')
    if not TEMPLATE.is_file():
        sys.exit(f'Bottle template missing: {TEMPLATE}')

    base = Image.open(TEMPLATE).convert('RGBA')
    label = Image.open(label_path).convert('RGBA')

    # Resize label to fit the bottle's label area
    label = label.resize((LABEL_W, LABEL_H), Image.LANCZOS)

    # Composite onto bottle
    composite = base.copy()
    composite.paste(label, (LABEL_X1, LABEL_Y1), label)

    out_path = PROJECT / 'images' / 'veelyn' / f'{frag_id}.png'
    composite.save(out_path)
    print(f'Saved {out_path.relative_to(PROJECT)} ({composite.size[0]}×{composite.size[1]})')


if __name__ == '__main__':
    main()
