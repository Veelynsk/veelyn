#!/usr/bin/env bash
set -euo pipefail

# Regenerate sitemap.xml + heureka.xml + merchant.xml from fragrances.json
# so the feeds are always in sync with the catalog. Safe to run on every
# build — outputs are deterministic.
node scripts/build-sitemap.js
node scripts/build-feeds.js

rm -rf public
mkdir -p public/images

cp index.html script.js styles.css data.js 404.html public/
cp favicon-16.png favicon-32.png favicon.svg apple-touch-icon.png og-image.jpg public/
cp robots.txt sitemap.xml heureka.xml merchant.xml site.webmanifest public/
cp GTM_SETUP.md public/ 2>/dev/null || true

cp -r admin public/
# Legal / policy pages (kept un-linked from main nav — Google Merchant
# verification + Meta business verification just need the URLs to resolve.)
cp -r vratenie-tovaru public/
cp -r obchodne-podmienky public/
cp -r ochrana-osobnych-udajov public/
# Shared stylesheet for all legal pages
mkdir -p public/styles && cp styles/legal.css public/styles/

cp -r images/veelyn public/images/
cp -r images/originals public/images/
cp images/bundle-3plus1.png public/images/

echo "Build done. Files in public/:"
find public -type f | wc -l
du -sh public
