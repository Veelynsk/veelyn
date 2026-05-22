#!/usr/bin/env node
// Generates 74 static product landing pages at /produkt/<slug>/index.html
// from fragrances.json. Each page targets the ORIGINAL fragrance search
// query (e.g. "Baccarat Rouge 540") and converts the visitor to the
// Veelyn dupé alternative — same strategy as parizske.sk.
//
// SEO surface:
//   - Title: "<Original Name> | dupé alternatíva Veelyn za 24,99 €"
//   - Meta description mentions both the original brand+name AND the
//     Veelyn alternative price.
//   - Schema.org Product with two offers (original + Veelyn) so Google
//     Shopping can index both — Veelyn is the in-stock offer.
//   - Canonical URL: https://veelyn.sk/produkt/<slug>/
//
// Output gets copied into public/ by build.sh.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SITE = 'https://veelyn.sk';
const OUT_DIR = resolve(ROOT, 'produkt');

const fragrances = JSON.parse(readFileSync(resolve(ROOT, 'fragrances.json'), 'utf8'));

// Wipe & recreate output dir on every run so deleted fragrances don't
// leave orphan pages in the deploy.
if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

function slugify(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const xmlEscape = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;');

const genderLabel = (g) =>
  g === 'M' ? 'Pánska' : g === 'Z' ? 'Dámska' : 'Unisex';

function pageHtml(f) {
  const slug = slugify(`${f.brand}-${f.original_name}`);
  const url = `${SITE}/produkt/${slug}/`;
  const veelynImg = `${SITE}/images/veelyn/${f.id}.png`;
  const originalImg = `${SITE}/images/originals/${slugify(f.original_name)}.png`;
  const savings = (Number(f.original_price) - Number(f.veelyn_price)).toFixed(2);
  const savingsPct = Math.round(((Number(f.original_price) - Number(f.veelyn_price)) / Number(f.original_price)) * 100);
  const allNotes = [
    ...(f.top_notes || []),
    ...(f.heart_notes || []),
    ...(f.base_notes || []),
  ];

  const title = `${f.original_name} (${f.brand}) — dupé alternatíva Veelyn za 24,99 €`;
  const description = `Hľadáš ${f.brand} ${f.original_name}? Veelyn ${f.veelyn_name} je dupé tej istej vône — eau de parfum 50 ml za 24,99 € namiesto ${Number(f.original_price).toFixed(0)} €. Slovenská značka, doprava zdarma nad 40 €.`;

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: `Veelyn ${f.veelyn_name} — dupé ${f.brand} ${f.original_name}`,
    description,
    sku: `veelyn-${f.id}`,
    brand: { '@type': 'Brand', name: 'Veelyn' },
    image: veelynImg,
    url,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'EUR',
      price: Number(f.veelyn_price).toFixed(2),
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'Veelyn' },
    },
  };

  const noteLine = (label, arr) =>
    Array.isArray(arr) && arr.length
      ? `<li><strong>${label}:</strong> ${arr.join(', ')}</li>`
      : '';

  return `<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">

<title>${xmlEscape(title)}</title>
<meta name="description" content="${xmlEscape(description)}">
<meta name="keywords" content="${xmlEscape(f.brand)} ${xmlEscape(f.original_name)}, dupé ${xmlEscape(f.original_name)}, alternatíva ${xmlEscape(f.original_name)}, voňa ako ${xmlEscape(f.brand)} ${xmlEscape(f.original_name)}, dupé parfumy">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#7c3aed">
<link rel="canonical" href="${url}">

<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">

<meta property="og:type" content="product">
<meta property="og:site_name" content="Veelyn">
<meta property="og:title" content="${xmlEscape(title)}">
<meta property="og:description" content="${xmlEscape(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${veelynImg}">
<meta property="og:image:width" content="600">
<meta property="og:image:height" content="600">
<meta property="og:locale" content="sk_SK">
<meta property="product:price:amount" content="${Number(f.veelyn_price).toFixed(2)}">
<meta property="product:price:currency" content="EUR">
<meta property="product:availability" content="in stock">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${xmlEscape(title)}">
<meta name="twitter:description" content="${xmlEscape(description)}">
<meta name="twitter:image" content="${veelynImg}">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400..900&family=Manrope:wght@300..800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles/product.css">

<script type="application/ld+json">${JSON.stringify(productSchema)}</script>
</head>
<body class="product-page">

<header class="prod-header">
  <a class="prod-brand" href="/" aria-label="VEELYN — domov">
    <span class="logo__vee">VEE</span><span class="logo__lyn">LYN</span>
  </a>
  <a class="prod-back" href="/">← Späť na veelyn.sk</a>
</header>

<main class="prod-main">
  <article class="prod-card">

    <div class="prod-card__visual">
      <img src="${originalImg}" alt="${xmlEscape(f.brand)} ${xmlEscape(f.original_name)}" onerror="this.style.display='none'" loading="lazy" decoding="async">
    </div>

    <div class="prod-card__info">
      <p class="prod-card__brand">${xmlEscape(f.brand)}</p>
      <h1 class="prod-card__title">${xmlEscape(f.original_name)}</h1>
      <p class="prod-card__gender">${xmlEscape(genderLabel(f.gender))} · Eau de parfum · 50 ml</p>

      <div class="prod-card__price-orig">
        <span class="prod-card__price-label">Originál ${xmlEscape(f.brand)}</span>
        <span class="prod-card__price-amount">${Number(f.original_price).toFixed(2)} €</span>
      </div>

      <!-- The whole conversion play: prominent "Perfektná zhoda" with
           the Veelyn alternative at 24,99 € → CTA jumps to the homepage
           cart flow with the right product pre-loaded. -->
      <div class="match-card">
        <div class="match-card__header">
          <span class="match-card__badge">✓ Perfektná zhoda vôňových nôt</span>
        </div>
        <div class="match-card__body">
          <img class="match-card__thumb" src="${veelynImg}" alt="VEELYN ${xmlEscape(f.veelyn_name)}" loading="lazy" decoding="async">
          <div class="match-card__meta">
            <p class="match-card__brand">VEELYN</p>
            <h2 class="match-card__name">${xmlEscape(f.veelyn_name)}</h2>
            <p class="match-card__pitch">Tá istá vôňa, 50 ml eau de parfum, slovenská značka.</p>
          </div>
          <div class="match-card__pricing">
            <div class="match-card__price-row">
              <span>Veelyn</span>
              <strong>24,99 €</strong>
            </div>
            <div class="match-card__savings">Ušetríš ${savings} € (${savingsPct} %)</div>
          </div>
        </div>
        <a class="match-card__cta" href="/?vona=${encodeURIComponent(f.id)}">
          Pozri Veelyn ${xmlEscape(f.veelyn_name)} →
        </a>
      </div>

      ${allNotes.length ? `
      <section class="prod-card__notes">
        <h3>Tóny vône</h3>
        <ul>
          ${noteLine('Hlava', f.top_notes)}
          ${noteLine('Srdce', f.heart_notes)}
          ${noteLine('Základ', f.base_notes)}
        </ul>
      </section>` : ''}

      <p class="prod-card__disclaimer">
        Veelyn ${xmlEscape(f.veelyn_name)} je inšpirovaný vôňou ${xmlEscape(f.brand)} ${xmlEscape(f.original_name)}.
        Nie sme oficiálnym distribútorom značky ${xmlEscape(f.brand)} ani s ňou nemáme obchodné prepojenie.
        Mená pôvodných parfumov používame výlučne na popis vône, na ktorú sa náš produkt vône podobá.
      </p>
    </div>

  </article>
</main>

<footer class="prod-footer">
  <div class="prod-footer__inner">
    <div class="prod-footer__brand">
      <span class="logo">
        <span class="logo__vee">VEE</span><span class="logo__lyn">LYN</span>
      </span>
      <p>Slovenské dupé parfumy.</p>
    </div>
    <nav class="prod-footer__nav" aria-label="Päta">
      <a href="/">Domov</a>
      <a href="/obchodne-podmienky/">Obchodné podmienky</a>
      <a href="/ochrana-osobnych-udajov/">Ochrana osobných údajov</a>
      <a href="/vratenie-tovaru/">Vrátenie tovaru</a>
      <a href="mailto:info@veelyn.sk">info@veelyn.sk</a>
    </nav>
    <p class="prod-footer__copy">© Veelyn / VitazCapital s.r.o.</p>
  </div>
</footer>

</body>
</html>
`;
}

let count = 0;
const indexLines = [];
for (const f of fragrances) {
  const slug = slugify(`${f.brand}-${f.original_name}`);
  const dir = resolve(OUT_DIR, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), pageHtml(f));
  indexLines.push(`${slug}\t${f.id}\t${f.brand} ${f.original_name}`);
  count++;
}

writeFileSync(resolve(OUT_DIR, '_index.tsv'), indexLines.join('\n') + '\n');
console.log(`✓ ${count} product pages generated in ${OUT_DIR}/`);
console.log(`  Each page: SEO meta + JSON-LD Product schema + Veelyn dupé CTA`);
console.log(`  URL pattern: ${SITE}/produkt/<slug>/`);
