#!/usr/bin/env bash
set -euo pipefail

# Regenerate sitemap.xml + heureka.xml + merchant.xml + per-product
# landing pages from fragrances.json so everything stays in sync.
# Outputs are deterministic — safe to run on every build.
node scripts/build-product-pages.js
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
# 74 generated original-fragrance landing pages (the "parizske.sk
# strategy") — each captures organic search for an original perfume name
# and converts to the matching Veelyn dupé.
cp -r produkt public/
# Shared stylesheets
mkdir -p public/styles
cp styles/legal.css public/styles/
cp styles/product.css public/styles/

cp -r images/veelyn public/images/
cp -r images/originals public/images/
cp images/bundle-3plus1.png public/images/

echo "Build done. Files in public/:"
find public -type f | wc -l
du -sh public
