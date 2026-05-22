#!/usr/bin/env node
// Generate sitemap.xml from fragrances.json — run before deploy.
//
//   node scripts/build-sitemap.js
//
// Output: ../sitemap.xml (overwritten)
//
// Adds one URL per fragrance (`?vona=<id>`) plus image entries so Google
// Image / Shopping pick up the bottle photos. Anchors for major sections
// kept for in-page jumping. Lastmod uses today's date.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SITE = 'https://veelyn.sk';

const fragrances = JSON.parse(readFileSync(resolve(ROOT, 'fragrances.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

const xmlEscape = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const url = ({ loc, lastmod, changefreq, priority, images = [] }) => {
  const lines = [
    '  <url>',
    `    <loc>${xmlEscape(loc)}</loc>`,
  ];
  if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority !== undefined) lines.push(`    <priority>${priority}</priority>`);
  for (const img of images) {
    lines.push('    <image:image>');
    lines.push(`      <image:loc>${xmlEscape(img.loc)}</image:loc>`);
    if (img.title) lines.push(`      <image:title>${xmlEscape(img.title)}</image:title>`);
    if (img.caption) lines.push(`      <image:caption>${xmlEscape(img.caption)}</image:caption>`);
    lines.push('    </image:image>');
  }
  lines.push('  </url>');
  return lines.join('\n');
};

const urls = [
  url({
    loc: `${SITE}/`,
    lastmod: today,
    changefreq: 'daily',
    priority: '1.0',
    images: [{ loc: `${SITE}/og-image.jpg`, title: 'Veelyn — Luxusné inšpirované vône' }],
  }),
  url({ loc: `${SITE}/#vsetky-vonavky`, lastmod: today, changefreq: 'weekly', priority: '0.9' }),
  url({ loc: `${SITE}/#bestsellers`, lastmod: today, changefreq: 'weekly', priority: '0.8' }),
  url({ loc: `${SITE}/#porovnanie`, lastmod: today, changefreq: 'monthly', priority: '0.6' }),
  url({ loc: `${SITE}/#kontakt`, lastmod: today, changefreq: 'monthly', priority: '0.5' }),
];

for (const f of fragrances) {
  urls.push(url({
    loc: `${SITE}/?vona=${encodeURIComponent(f.id)}`,
    lastmod: today,
    changefreq: 'weekly',
    priority: '0.7',
    images: [{
      loc: `${SITE}/images/veelyn/${f.id}.png`,
      title: `VEELYN ${f.veelyn_name}`,
      caption: `Inšpirované ${f.brand} ${f.original_name}`,
    }],
  }));
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/0.9">
${urls.join('\n')}
</urlset>
`;

const outPath = resolve(ROOT, 'sitemap.xml');
writeFileSync(outPath, xml);
console.log(`✓ sitemap.xml written: ${urls.length} URLs (5 sections + ${fragrances.length} fragrances)`);
