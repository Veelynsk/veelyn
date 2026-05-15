#!/usr/bin/env python3
"""Crop bundle-3plus1.png by detecting where bright content (bottles) starts."""
from PIL import Image
import numpy as np
from pathlib import Path

src = Path(__file__).parent.parent / 'images' / 'bundle-3plus1.png'
img = Image.open(src).convert('RGBA')
arr = np.array(img)
# Luminance (skip alpha) — anything brighter than threshold is "content"
lum = arr[:,:,:3].mean(axis=2)
THRESHOLD = 30  # pixels darker than this are considered "background"

# Find rows / cols that contain content
rows = np.where(lum.max(axis=1) > THRESHOLD)[0]
cols = np.where(lum.max(axis=0) > THRESHOLD)[0]
if len(rows) == 0 or len(cols) == 0:
    print("No content detected")
    raise SystemExit

top, bottom = rows[0], rows[-1]
left, right = cols[0], cols[-1]

print(f"Original: {img.size}")
print(f"Content bbox: ({left}, {top}, {right}, {bottom})")

# Add small padding (3% of bbox dimensions) so we don't crop too tight
bw = right - left
bh = bottom - top
pad_x = int(bw * 0.02)
pad_y = int(bh * 0.02)
new_left = max(0, left - pad_x)
new_top = max(0, top - pad_y)
new_right = min(img.size[0], right + pad_x)
new_bottom = min(img.size[1], bottom + pad_y)

cropped = img.crop((new_left, new_top, new_right, new_bottom))
print(f"Cropped to: {cropped.size}")
cropped.save(src, 'PNG', optimize=True)
print(f"Saved: {src}")
