#!/usr/bin/env node
// Generate sitemap.xml from fragrances.json — run before deploy.
//   node scripts/build-sitemap.js
// Output: ../sitemap.xml (overwritten)
//
// Only REAL, canonical, indexable URLs go in here:
//   /                       (home)
//   /produkt/               (hub — all dupés by brand)
//   /produkt/<slug>/  ×74   (original-fragrance landing pages)
//   /faq/                   (FAQ)
//   legal pages             (×3)
// Deliberately EXCLUDED: `?vona=<id>` deep links (they canonicalize to the
// matching /produkt/ page) and `#fragment` anchors (not separate URLs).

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SITE = 'https://www.veelyn.sk';

const fragrances = JSON.parse(readFileSync(resolve(ROOT, 'fragrances.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const mtime = (p) => { try { return statSync(resolve(ROOT, p)).mtime.toISOString().slice(0, 10); } catch { return today; } };

const xmlEscape = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slugify = (s) => String(s).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const url = ({ loc, lastmod, changefreq, priority, images = [] }) => {
  const lines = ['  <url>', `    <loc>${xmlEscape(loc)}</loc>`];
  if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority !== undefined) lines.push(`    <priority>${priority}</priority>`);
  for (const img of images) {
    lines.push('    <image:image>');
    lines.push(`      <image:loc>${xmlEscape(img.loc)}</image:loc>`);
    lines.push('    </image:image>');
  }
  lines.push('  </url>');
  return lines.join('\n');
};

const urls = [
  url({ loc: `${SITE}/`, lastmod: mtime('index.html'), changefreq: 'daily', priority: '1.0',
        images: [{ loc: `${SITE}/og-image.jpg` }] }),
  url({ loc: `${SITE}/produkt/`, lastmod: today, changefreq: 'weekly', priority: '0.9' }),
  url({ loc: `${SITE}/faq/`, lastmod: mtime('faq/index.html'), changefreq: 'monthly', priority: '0.7' }),
];

for (const f of fragrances) {
  const slug = slugify(`${f.brand}-${f.original_name}`);
  urls.push(url({
    loc: `${SITE}/produkt/${slug}/`,
    lastmod: today,
    changefreq: 'weekly',
    priority: '0.85',
    images: [
      { loc: `${SITE}/images/veelyn/${f.id}.png` },
      { loc: `${SITE}/images/originals/${slugify(f.original_name)}.png` },
    ],
  }));
}

for (const p of ['obchodne-podmienky', 'ochrana-osobnych-udajov', 'vratenie-tovaru']) {
  urls.push(url({ loc: `${SITE}/${p}/`, lastmod: mtime(`${p}/index.html`), changefreq: 'yearly', priority: '0.3' }));
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>
`;
writeFileSync(resolve(ROOT, 'sitemap.xml'), xml);
console.log(`✓ sitemap.xml written: ${urls.length} URLs (home + hub + faq + ${fragrances.length} products + 3 legal)`);
