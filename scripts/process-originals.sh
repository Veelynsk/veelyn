#!/bin/bash
# Spracuje raw fotky originálov z ~/Downloads/veelyn-originals-raw/
#   - rembg odstráni pozadie
#   - resize na výšku 1400px (zachová pomer)
#   - uloží do images/originals/ ako <slug>.png
set -e
RAW="$HOME/Downloads/veelyn-originals-raw"
OUT="$(cd "$(dirname "$0")/.." && pwd)/images/originals"
mkdir -p "$OUT"

if [ -z "$(ls -A "$RAW" 2>/dev/null)" ]; then
  echo "Priečinok $RAW je prázdny. Hod tam fotky a spusti znova."
  exit 0
fi

count=0
for f in "$RAW"/*; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  # slug: lowercase, replace non-alphanumeric with -, strip extension
  stem="${base%.*}"
  slug=$(echo "$stem" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\+/-/g' | sed 's/^-//;s/-$//')
  out="$OUT/${slug}.png"
  echo "→ $base  ⇒  ${slug}.png"
  # rembg + resize cez Python (Pillow)
  python3 - <<PYEOF
from rembg import remove
from PIL import Image
import io
with open("$f","rb") as fh: data = fh.read()
out = remove(data)
img = Image.open(io.BytesIO(out)).convert("RGBA")
w,h = img.size
target_h = 1400
new_w = int(w * target_h / h)
img = img.resize((new_w, target_h), Image.LANCZOS)
img.save("$out", "PNG", optimize=True)
print(f"   {img.size} OK")
PYEOF
  count=$((count+1))
done
echo "✅ Spracovaných: $count súborov v $OUT"
