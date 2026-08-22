#!/usr/bin/env node
// Generates 74 static product landing pages at /produkt/<slug>/index.html
// plus a hub page at /produkt/index.html from fragrances.json.
//
// Each product page targets the ORIGINAL fragrance search query (e.g.
// "Baccarat Rouge 540 dupé") and converts the visitor to the Veelyn dupé.
//
// SEO / GEO surface per page:
//   - <title> "<Brand> <Original> dupé — Veelyn <NAME> za 24,99 € | 50 ml EDP"
//   - meta description, canonical (www host), hreflang sk + x-default
//   - OG/Twitter with og:image:alt
//   - JSON-LD @graph: Product (offers + shipping + return policy + audience
//     + additionalProperty notes + isSimilarTo original), BreadcrumbList,
//     FAQPage (mirrors the VISIBLE FAQ block), WebPage
//   - Visible: breadcrumbs, unique description paragraph, notes, FAQ,
//     related dupés (same brand / same gender) → internal link graph
//
// Output gets copied into public/ by build.sh.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SITE = 'https://www.veelyn.sk';
const OUT_DIR = resolve(ROOT, 'produkt');
const TODAY = new Date().toISOString().slice(0, 10);
const PRICE_VALID_UNTIL = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);

const fragrances = JSON.parse(readFileSync(resolve(ROOT, 'fragrances.json'), 'utf8'));

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

// MUST stay identical to productSlug() in script.js and slugify() in
// build-sitemap.js / build-feeds.js.
function slugify(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const genderLabel = (g) => g === 'M' ? 'Pánska' : g === 'Z' ? 'Dámska' : 'Unisex';
const genderAdj   = (g) => g === 'M' ? 'pánska' : g === 'Z' ? 'dámska' : 'unisex';
const genderFor   = (g) => g === 'M' ? 'pre mužov' : g === 'Z' ? 'pre ženy' : 'pre mužov aj ženy (unisex)';
const schemaGender = (g) => g === 'M' ? 'male' : g === 'Z' ? 'female' : 'unisex';
const eur = (n) => Number(n).toFixed(2).replace('.', ',') + ' €';
const joinSk = (arr) => {
  const a = (arr || []).filter(Boolean);
  if (!a.length) return '';
  if (a.length === 1) return a[0];
  return a.slice(0, -1).join(', ') + ' a ' + a[a.length - 1];
};

const slugOf = (f) => slugify(`${f.brand}-${f.original_name}`);
const urlOf  = (f) => `${SITE}/produkt/${slugOf(f)}/`;

// ---------- content generators ----------
function descriptionParagraph(f) {
  const top = joinSk(f.top_notes), heart = joinSk(f.heart_notes), base = joinSk(f.base_notes);
  const parts = [];
  parts.push(`Veelyn ${f.veelyn_name} je slovenské dupé inšpirované vôňou ${f.brand} ${f.original_name} — ${genderAdj(f.gender)} eau de parfum s 20 % koncentráciou parfumovej kompozície, rovnakou, akú používajú originály.`);
  if (top || heart || base) {
    const seq = [];
    if (top) seq.push(`sa otvára tónmi ${top}`);
    if (heart) seq.push(`v srdci nesie ${heart}`);
    if (base) seq.push(`na koži doznieva do ${base}`);
    parts.push(`Vôňa ${seq.join(', ')}.`);
  }
  parts.push(`50 ml za 24,99 € namiesto ${Number(f.original_price).toFixed(0)} € za originál — tá istá vôňa, zlomok ceny. Doprava zadarmo nad 40 €, 14 dní na vrátenie, výdrž na koži 6–10 hodín.`);
  return parts.join(' ');
}

function faqFor(f) {
  const savings = (Number(f.original_price) - Number(f.veelyn_price)).toFixed(2).replace('.', ',');
  const savingsPct = Math.round(((Number(f.original_price) - Number(f.veelyn_price)) / Number(f.original_price)) * 100);
  const notes = [...(f.top_notes || []), ...(f.heart_notes || []), ...(f.base_notes || [])];
  const notesTxt = notes.length ? ` Dominujú tóny ${joinSk(notes.slice(0, 5))}.` : '';
  return [
    {
      q: `Ako vonia dupé na ${f.brand} ${f.original_name} od Veelyn?`,
      a: `Veelyn ${f.veelyn_name} kopíruje vôňový profil originálu ${f.brand} ${f.original_name} — rovnaké hlavné, srdcové aj základné tóny.${notesTxt} Ide o ${genderAdj(f.gender)} eau de parfum s 20 % koncentráciou.`,
    },
    {
      q: `Koľko stojí Veelyn ${f.veelyn_name} a koľko ušetrím oproti ${f.brand} ${f.original_name}?`,
      a: `Veelyn ${f.veelyn_name} (50 ml) stojí 24,99 €. Originál ${f.brand} ${f.original_name} stojí približne ${Number(f.original_price).toFixed(0)} €, takže ušetríš ${savings} € (${savingsPct} %). Pri kúpe 4 vôní je najlacnejšia zadarmo (3+1).`,
    },
    {
      q: `Ako dlho vydrží Veelyn ${f.veelyn_name} na koži?`,
      a: `Veelyn ${f.veelyn_name} je eau de parfum s 20 % parfumovej kompozície, čo zodpovedá koncentrácii originálu. Výdrž na koži je bežne 6–10 hodín podľa typu pokožky, miesta aplikácie a počasia.`,
    },
    {
      q: `Pre koho je dupé na ${f.brand} ${f.original_name} vhodné?`,
      a: `${f.brand} ${f.original_name} je ${genderAdj(f.gender)} vôňa ${genderFor(f.gender)}. Veelyn ${f.veelyn_name} sa hodí každému, kto má rád tento typ vône a nechce platiť cenu luxusnej značky.`,
    },
    {
      q: `Je dupé na ${f.brand} ${f.original_name} legálne a kde sa vyrába?`,
      a: `Áno. Vôňa (kompozícia) nie je chránená autorským právom — chránené sú len ochranné známky, názvy a obaly. Veelyn nepoužíva logá ani názvy ${f.brand} na fľaštičke; meno originálu uvádzame iba na opis vône. Veelyn parfumy sa plnia na Slovensku.`,
    },
  ];
}

function relatedFor(f) {
  const sameBrand = fragrances.filter(x => x.id !== f.id && x.brand === f.brand);
  const sameGender = fragrances.filter(x => x.id !== f.id && x.brand !== f.brand && x.gender === f.gender);
  // deterministic rotation so different pages link to different siblings
  const seed = [...f.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rot = (arr) => arr.length ? [...arr.slice(seed % arr.length), ...arr.slice(0, seed % arr.length)] : arr;
  const picks = [...sameBrand.slice(0, 4), ...rot(sameGender)];
  const seen = new Set(); const out = [];
  for (const x of picks) { if (!seen.has(x.id)) { seen.add(x.id); out.push(x); } if (out.length >= 6) break; }
  return out;
}

// ---------- product page ----------
function pageHtml(f) {
  const slug = slugOf(f);
  const url = urlOf(f);
  const veelynImg = `${SITE}/images/veelyn/${f.id}.png`;
  const originalImg = `${SITE}/images/originals/${slugify(f.original_name)}.png`;
  const savings = (Number(f.original_price) - Number(f.veelyn_price)).toFixed(2);
  const savingsPct = Math.round(((Number(f.original_price) - Number(f.veelyn_price)) / Number(f.original_price)) * 100);
  const allNotes = [...(f.top_notes || []), ...(f.heart_notes || []), ...(f.base_notes || [])];
  const faq = faqFor(f);
  const related = relatedFor(f);
  const descPara = descriptionParagraph(f);

  const title = `${f.brand} ${f.original_name} dupé — Veelyn ${f.veelyn_name} za 24,99 € | 50 ml EDP`;
  const description = `Dupé na ${f.brand} ${f.original_name}: Veelyn ${f.veelyn_name} je ${genderAdj(f.gender)} eau de parfum 50 ml s rovnakými tónmi za 24,99 € namiesto ${Number(f.original_price).toFixed(0)} €. Slovenská značka, doprava zdarma nad 40 €, 14 dní na vrátenie.`;

  const graph = [
    {
      '@type': 'Product',
      '@id': `${url}#product`,
      name: `Veelyn ${f.veelyn_name} — dupé ${f.brand} ${f.original_name}`,
      alternateName: [
        `VEELYN ${f.veelyn_name}`,
        `${f.brand} ${f.original_name} dupé`,
        `${f.brand} ${f.original_name} alternatíva`,
        `vôňa ako ${f.brand} ${f.original_name}`,
      ],
      description: descPara,
      sku: `veelyn-${f.id}`,
      mpn: `VEELYN-${String(f.veelyn_name || '').replace(/\s+/g, '-')}`,
      brand: { '@type': 'Brand', name: 'Veelyn' },
      manufacturer: { '@id': `${SITE}/#organization` },
      category: 'Krása a zdravie > Parfumy > Eau de parfum',
      image: [veelynImg],
      url,
      audience: { '@type': 'PeopleAudience', suggestedGender: schemaGender(f.gender) },
      size: '50 ml',
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'Typ', value: 'Eau de parfum (20 % koncentrácia)' },
        { '@type': 'PropertyValue', name: 'Objem', value: '50 ml' },
        { '@type': 'PropertyValue', name: 'Krajina pôvodu', value: 'Slovensko' },
        ...(f.top_notes?.length ? [{ '@type': 'PropertyValue', name: 'Hlavové tóny', value: f.top_notes.join(', ') }] : []),
        ...(f.heart_notes?.length ? [{ '@type': 'PropertyValue', name: 'Srdcové tóny', value: f.heart_notes.join(', ') }] : []),
        ...(f.base_notes?.length ? [{ '@type': 'PropertyValue', name: 'Základné tóny', value: f.base_notes.join(', ') }] : []),
      ],
      isSimilarTo: {
        '@type': 'Product',
        name: `${f.brand} ${f.original_name}`,
        brand: { '@type': 'Brand', name: f.brand },
        offers: { '@type': 'Offer', priceCurrency: 'EUR', price: Number(f.original_price).toFixed(2), availability: 'https://schema.org/InStock' },
      },
      offers: {
        '@type': 'Offer',
        url,
        priceCurrency: 'EUR',
        price: Number(f.veelyn_price).toFixed(2),
        priceValidUntil: PRICE_VALID_UNTIL,
        availability: 'https://schema.org/InStock',
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@id': `${SITE}/#organization` },
        shippingDetails: {
          '@type': 'OfferShippingDetails',
          shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'SK' },
          shippingRate: { '@type': 'MonetaryAmount', value: '2.99', currency: 'EUR' },
          deliveryTime: {
            '@type': 'ShippingDeliveryTime',
            handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
            transitTime:  { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' },
          },
        },
        hasMerchantReturnPolicy: {
          '@type': 'MerchantReturnPolicy',
          applicableCountry: 'SK',
          returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
          merchantReturnDays: 14,
          returnMethod: 'https://schema.org/ReturnByMail',
          returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility',
        },
      },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Domov', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Dupé parfumy', item: `${SITE}/produkt/` },
        { '@type': 'ListItem', position: 3, name: `${f.brand} ${f.original_name}`, item: url },
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: faq.map(x => ({
        '@type': 'Question', name: x.q,
        acceptedAnswer: { '@type': 'Answer', text: x.a },
      })),
    },
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: title,
      description,
      inLanguage: 'sk-SK',
      isPartOf: { '@id': `${SITE}/#website` },
      about: { '@id': `${url}#product` },
      breadcrumb: { '@id': `${url}#breadcrumb` },
      primaryImageOfPage: { '@type': 'ImageObject', url: veelynImg },
      dateModified: TODAY,
    },
  ];

  const noteLine = (label, arr) =>
    Array.isArray(arr) && arr.length ? `<li><strong>${label}:</strong> ${esc(arr.join(', '))}</li>` : '';

  return `<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">

<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="keywords" content="${esc(f.brand)} ${esc(f.original_name)} dupé, dupé ${esc(f.original_name)}, alternatíva ${esc(f.original_name)}, vôňa ako ${esc(f.brand)} ${esc(f.original_name)}, ${esc(f.original_name)} lacnejšia alternatíva, dupé parfumy, Veelyn ${esc(f.veelyn_name)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#7c3aed">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="sk" href="${url}">
<link rel="alternate" hreflang="x-default" href="${url}">
<link rel="sitemap" type="application/xml" href="/sitemap.xml">

<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">

<meta property="og:type" content="product">
<meta property="og:site_name" content="Veelyn">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${veelynImg}">
<meta property="og:image:width" content="645">
<meta property="og:image:height" content="1536">
<meta property="og:image:alt" content="Veelyn ${esc(f.veelyn_name)} — dupé ${esc(f.brand)} ${esc(f.original_name)}, 50 ml eau de parfum">
<meta property="og:locale" content="sk_SK">
<meta property="product:brand" content="Veelyn">
<meta property="product:retailer_item_id" content="veelyn-${esc(f.id)}">
<meta property="product:price:amount" content="${Number(f.veelyn_price).toFixed(2)}">
<meta property="product:price:currency" content="EUR">
<meta property="product:availability" content="in stock">
<meta property="product:condition" content="new">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${veelynImg}">
<meta name="twitter:image:alt" content="Veelyn ${esc(f.veelyn_name)} — dupé ${esc(f.brand)} ${esc(f.original_name)}">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="image" href="${originalImg}" fetchpriority="high">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400..900&family=Manrope:wght@300..800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles/product.css">

<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}</script>
</head>
<body class="product-page">

<header class="prod-header">
  <a class="prod-brand" href="/" aria-label="VEELYN — domov">
    <span class="logo__vee">VEE</span><span class="logo__lyn">LYN</span>
  </a>
  <a class="prod-back" href="/">← Späť na veelyn.sk</a>
</header>

<main class="prod-main">
  <nav class="prod-crumbs" aria-label="Navigácia">
    <a href="/">Domov</a>
    <span aria-hidden="true">›</span>
    <a href="/produkt/">Dupé parfumy</a>
    <span aria-hidden="true">›</span>
    <span aria-current="page">${esc(f.brand)} ${esc(f.original_name)}</span>
  </nav>

  <article class="prod-card">

    <div class="prod-card__visual">
      <img src="${originalImg}" alt="${esc(f.brand)} ${esc(f.original_name)} — originálny parfum, ku ktorému je Veelyn ${esc(f.veelyn_name)} dupé" onerror="this.style.display='none'" decoding="async" fetchpriority="high" width="849" height="1400">
    </div>

    <div class="prod-card__info">
      <p class="prod-card__brand">${esc(f.brand)}</p>
      <h1 class="prod-card__title">${esc(f.original_name)}</h1>
      <p class="prod-card__gender">${esc(genderLabel(f.gender))} · Eau de parfum · 50 ml</p>

      <div class="prod-card__price-orig">
        <span class="prod-card__price-label">Originál ${esc(f.brand)}</span>
        <span class="prod-card__price-amount">${Number(f.original_price).toFixed(2)} €</span>
      </div>

      <div class="match-card">
        <div class="match-card__header">
          <span class="match-card__badge">✓ Perfektná zhoda vôňových nôt</span>
        </div>
        <div class="match-card__body">
          <img class="match-card__thumb" src="${veelynImg}" alt="VEELYN ${esc(f.veelyn_name)} — 50 ml eau de parfum" loading="lazy" decoding="async" width="72" height="72">
          <div class="match-card__meta">
            <p class="match-card__brand">VEELYN</p>
            <h2 class="match-card__name">${esc(f.veelyn_name)}</h2>
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
          Pozri Veelyn ${esc(f.veelyn_name)} →
        </a>
      </div>

      <section class="prod-card__desc">
        <h3>Dupé na ${esc(f.brand)} ${esc(f.original_name)} — čo čakať</h3>
        <p>${esc(descPara)}</p>
      </section>

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
        Veelyn ${esc(f.veelyn_name)} je inšpirovaný vôňou ${esc(f.brand)} ${esc(f.original_name)}.
        Nie sme oficiálnym distribútorom značky ${esc(f.brand)} ani s ňou nemáme obchodné prepojenie.
        Mená pôvodných parfumov používame výlučne na popis vône, na ktorú sa náš produkt vône podobá.
      </p>
    </div>

  </article>

  <section class="prod-faq" aria-labelledby="faq-title">
    <h2 id="faq-title">Často kladené otázky — ${esc(f.brand)} ${esc(f.original_name)} dupé</h2>
    <dl>
      ${faq.map(x => `<div class="prod-faq__item"><dt>${esc(x.q)}</dt><dd>${esc(x.a)}</dd></div>`).join('\n      ')}
    </dl>
  </section>

  ${related.length ? `
  <section class="prod-related" aria-labelledby="related-title">
    <h2 id="related-title">Ďalšie dupé, ktoré ťa môžu zaujímať</h2>
    <ul class="prod-related__list">
      ${related.map(r => `<li><a href="/produkt/${slugOf(r)}/"><span class="prod-related__orig">${esc(r.brand)} ${esc(r.original_name)}</span><span class="prod-related__veelyn">Veelyn ${esc(r.veelyn_name)} · 24,99 €</span></a></li>`).join('\n      ')}
    </ul>
    <p class="prod-related__all"><a href="/produkt/">Pozri všetkých ${fragrances.length} dupé parfumov →</a></p>
  </section>` : ''}
</main>

<footer class="prod-footer">
  <div class="prod-footer__inner">
    <div class="prod-footer__brand">
      <span class="logo">
        <span class="logo__vee">VEE</span><span class="logo__lyn">LYN</span>
      </span>
      <p>Slovenské dupé parfumy. Made in Slovakia. Hated in Paris.</p>
    </div>
    <nav class="prod-footer__nav" aria-label="Päta">
      <a href="/">Domov</a>
      <a href="/produkt/">Všetky dupé</a>
      <a href="/faq/">Časté otázky</a>
      <a href="/obchodne-podmienky/">Obchodné podmienky</a>
      <a href="/ochrana-osobnych-udajov/">Ochrana osobných údajov</a>
      <a href="/vratenie-tovaru/">Vrátenie tovaru</a>
      <a href="mailto:info@veelyn.sk">info@veelyn.sk</a>
    </nav>
    <p class="prod-footer__copy">© Veelyn / Vitaz Capital s. r. o. · IČO 56 181 001 · Bratislava</p>
  </div>
</footer>

</body>
</html>
`;
}

// ---------- hub page /produkt/ ----------
function hubHtml() {
  const url = `${SITE}/produkt/`;
  const byBrand = new Map();
  for (const f of fragrances) {
    if (!byBrand.has(f.brand)) byBrand.set(f.brand, []);
    byBrand.get(f.brand).push(f);
  }
  const brands = [...byBrand.keys()].sort((a, b) => a.localeCompare(b, 'sk'));
  const title = `Všetky dupé parfumy Veelyn — ${fragrances.length} vôní podľa značky za 24,99 €`;
  const description = `Kompletný zoznam ${fragrances.length} dupé parfumov Veelyn zoradený podľa originálnej značky: Creed, Tom Ford, Dior, Chanel, YSL, Louis Vuitton, Maison Francis Kurkdjian a ďalšie. 50 ml eau de parfum za 24,99 €.`;
  const graph = [
    {
      '@type': 'CollectionPage',
      '@id': `${url}#webpage`,
      url, name: title, description, inLanguage: 'sk-SK',
      isPartOf: { '@id': `${SITE}/#website` },
      breadcrumb: { '@id': `${url}#breadcrumb` },
      dateModified: TODAY,
      mainEntity: { '@id': `${url}#list` },
    },
    {
      '@type': 'ItemList',
      '@id': `${url}#list`,
      name: 'Všetky dupé parfumy Veelyn',
      numberOfItems: fragrances.length,
      itemListOrder: 'https://schema.org/ItemListUnordered',
      itemListElement: fragrances.map((f, i) => ({
        '@type': 'ListItem', position: i + 1,
        name: `Veelyn ${f.veelyn_name} — dupé ${f.brand} ${f.original_name}`,
        url: urlOf(f),
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Domov', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Dupé parfumy', item: url },
      ],
    },
  ];

  return `<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#7c3aed">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="sk" href="${url}">
<link rel="alternate" hreflang="x-default" href="${url}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Veelyn">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Veelyn — dupé parfumy za 24,99 €">
<meta property="og:locale" content="sk_SK">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}/og-image.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400..900&family=Manrope:wght@300..800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles/product.css">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}</script>
</head>
<body class="product-page">

<header class="prod-header">
  <a class="prod-brand" href="/" aria-label="VEELYN — domov">
    <span class="logo__vee">VEE</span><span class="logo__lyn">LYN</span>
  </a>
  <a class="prod-back" href="/">← Späť na veelyn.sk</a>
</header>

<main class="prod-main hub">
  <nav class="prod-crumbs" aria-label="Navigácia">
    <a href="/">Domov</a>
    <span aria-hidden="true">›</span>
    <span aria-current="page">Dupé parfumy</span>
  </nav>

  <header class="hub__head">
    <p class="prod-card__brand">Zoznam vôní</p>
    <h1 class="hub__title">Všetky dupé parfumy Veelyn</h1>
    <p class="hub__lead">${fragrances.length} vôní inšpirovaných originálmi od ${brands.length} značiek. Každá je 50 ml eau de parfum s 20 % koncentráciou za 24,99 € — pri kúpe štyroch je najlacnejšia zadarmo. Klikni na originál a pozri jeho Veelyn dupé, tóny vône a odpovede na časté otázky.</p>
  </header>

  <nav class="hub__brands" aria-label="Značky">
    ${brands.map(b => `<a href="#${slugify(b)}">${esc(b)} <small>${byBrand.get(b).length}</small></a>`).join('\n    ')}
  </nav>

  ${brands.map(b => `
  <section class="hub__brand" id="${slugify(b)}">
    <h2>${esc(b)} <small>${byBrand.get(b).length} ${byBrand.get(b).length === 1 ? 'dupé' : 'dupé'}</small></h2>
    <ul class="hub__list">
      ${byBrand.get(b).map(f => `<li><a href="/produkt/${slugOf(f)}/"><span class="hub__orig">${esc(f.original_name)}</span><span class="hub__veelyn">Veelyn ${esc(f.veelyn_name)} · ${esc(genderLabel(f.gender))} · 24,99 €</span></a></li>`).join('\n      ')}
    </ul>
  </section>`).join('\n')}

  <section class="prod-faq" aria-labelledby="hub-faq-title">
    <h2 id="hub-faq-title">Ako vyberať dupé parfum</h2>
    <dl>
      <div class="prod-faq__item"><dt>Čo znamená „dupé“?</dt><dd>Dupé je parfum, ktorý vôňou kopíruje známy originál, ale nenesie jeho značku ani obal. Veelyn dupé majú rovnaké hlavné, srdcové a základné tóny ako originál, 20 % koncentráciu a 50 ml objem za 24,99 €.</dd></div>
      <div class="prod-faq__item"><dt>Ako nájdem dupé na konkrétny parfum?</dt><dd>Vyber značku v zozname vyššie (napr. Tom Ford, Dior, Creed) a klikni na názov originálu. Na stránke uvidíš Veelyn alternatívu, tóny vône, cenu a úsporu.</dd></div>
      <div class="prod-faq__item"><dt>Je kvalita porovnateľná s originálom?</dt><dd>Používame rovnakú koncentráciu parfumovej kompozície (20 %) ako eau de parfum originálov, výdrž je 6–10 hodín. Rozdiel je v cene, nie v koncentrácii.</dd></div>
    </dl>
    <p class="prod-related__all"><a href="/faq/">Všetky časté otázky →</a></p>
  </section>
</main>

<footer class="prod-footer">
  <div class="prod-footer__inner">
    <div class="prod-footer__brand">
      <span class="logo"><span class="logo__vee">VEE</span><span class="logo__lyn">LYN</span></span>
      <p>Slovenské dupé parfumy. Made in Slovakia. Hated in Paris.</p>
    </div>
    <nav class="prod-footer__nav" aria-label="Päta">
      <a href="/">Domov</a>
      <a href="/faq/">Časté otázky</a>
      <a href="/obchodne-podmienky/">Obchodné podmienky</a>
      <a href="/ochrana-osobnych-udajov/">Ochrana osobných údajov</a>
      <a href="/vratenie-tovaru/">Vrátenie tovaru</a>
      <a href="mailto:info@veelyn.sk">info@veelyn.sk</a>
    </nav>
    <p class="prod-footer__copy">© Veelyn / Vitaz Capital s. r. o. · IČO 56 181 001 · Bratislava</p>
  </div>
</footer>

</body>
</html>
`;
}

let count = 0;
const indexLines = [];
for (const f of fragrances) {
  const slug = slugOf(f);
  const dir = resolve(OUT_DIR, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), pageHtml(f));
  indexLines.push(`${slug}\t${f.id}\t${f.brand} ${f.original_name}`);
  count++;
}
writeFileSync(resolve(OUT_DIR, 'index.html'), hubHtml());
writeFileSync(resolve(OUT_DIR, '_index.tsv'), indexLines.join('\n') + '\n');
console.log(`✓ ${count} product pages + hub generated in ${OUT_DIR}/`);
console.log(`  URL pattern: ${SITE}/produkt/<slug>/  ·  hub: ${SITE}/produkt/`);
