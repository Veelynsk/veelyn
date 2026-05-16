#!/usr/bin/env bash
set -euo pipefail

rm -rf public
mkdir -p public/images

cp index.html script.js styles.css data.js 404.html public/
cp favicon-16.png favicon-32.png favicon.svg apple-touch-icon.png og-image.jpg public/
cp robots.txt sitemap.xml site.webmanifest public/

cp -r admin public/

cp -r images/veelyn public/images/
cp -r images/originals public/images/
cp images/bundle-3plus1.png public/images/

echo "Build done. Files in public/:"
find public -type f | wc -l
du -sh public
