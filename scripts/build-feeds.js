#!/usr/bin/env node
// Generate product feeds for Heureka.sk + Google Merchant Center.
//
//   node scripts/build-feeds.js
//
// Outputs (both to repo root, served as /heureka.xml and /merchant.xml):
//   - heureka.xml   → Heureka.sk product feed (SHOPITEM schema)
//   - merchant.xml  → Google Merchant Center RSS 2.0 feed (Shopping)
//
// After CF Pages deploys these, register each URL in the respective
// dashboards:
//   - Heureka: https://sluzby.heureka.sk → Spravovať obchody → XML feed
//   - Google Merchant: https://merchants.google.com → Products → Feeds
//
// Both pull from fragrances.json so adding new fragrances regenerates
// everything via `npm run build-feeds`.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SITE = 'https://veelyn.sk';

const fragrances = JSON.parse(readFileSync(resolve(ROOT, 'fragrances.json'), 'utf8'));

const xmlEscape = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
           .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const genderText = (g) => g === 'M' ? 'Pánska' : g === 'Z' ? 'Dámska' : 'Unisex';
const genderEN   = (g) => g === 'M' ? 'male'   : g === 'Z' ? 'female'  : 'unisex';

// Heureka category path — sub-tree under "Krása | Parfumy"
const heurekaCategory = (g) =>
  g === 'M' ? 'Heureka.sk | Krása | Parfumy | Pánske parfumy'
            : g === 'Z' ? 'Heureka.sk | Krása | Parfumy | Dámske parfumy'
            : 'Heureka.sk | Krása | Parfumy | Unisex parfumy';

// Google product category 469 = "Health & Beauty > Personal Care > Cosmetics > Perfume"
const GOOGLE_PERFUME_CATEGORY = '469';

function description(f) {
  const allNotes = [...(f.top_notes||[]), ...(f.heart_notes||[]), ...(f.base_notes||[])]
    .filter(Boolean).join(', ');
  return `Dupé parfum inšpirovaný značkou ${f.brand} ${f.original_name}. ` +
         `Eau de parfum 50 ml, ${genderText(f.gender).toLowerCase()} vôňa. ` +
         `Tóny: ${allNotes}. Slovenská značka Veelyn — luxusná vôňa za zlomok ceny originálu (${Number(f.original_price).toFixed(0)} €).`;
}

// ──────────────────────────────────────────────────────────────────
// HEUREKA.SK feed
// ──────────────────────────────────────────────────────────────────
function buildHeureka() {
  const items = fragrances.map(f => `
  <SHOPITEM>
    <ITEM_ID>${xmlEscape(f.id)}</ITEM_ID>
    <PRODUCTNAME>VEELYN ${xmlEscape(f.veelyn_name)} — dupé ${xmlEscape(f.brand)} ${xmlEscape(f.original_name)}</PRODUCTNAME>
    <PRODUCT>VEELYN ${xmlEscape(f.veelyn_name)}</PRODUCT>
    <DESCRIPTION>${xmlEscape(description(f))}</DESCRIPTION>
    <URL>${SITE}/?vona=${encodeURIComponent(f.id)}</URL>
    <IMGURL>${SITE}/images/veelyn/${encodeURIComponent(f.id)}.png</IMGURL>
    <PRICE_VAT>${Number(f.veelyn_price).toFixed(2)}</PRICE_VAT>
    <VAT>20</VAT>
    <MANUFACTURER>Veelyn</MANUFACTURER>
    <CATEGORYTEXT>${xmlEscape(heurekaCategory(f.gender))}</CATEGORYTEXT>
    <DELIVERY_DATE>0</DELIVERY_DATE>
    <DELIVERY>
      <DELIVERY_ID>PACKETA</DELIVERY_ID>
      <DELIVERY_PRICE>2.99</DELIVERY_PRICE>
      <DELIVERY_PRICE_COD>3.99</DELIVERY_PRICE_COD>
    </DELIVERY>
    <DELIVERY>
      <DELIVERY_ID>COURIER</DELIVERY_ID>
      <DELIVERY_PRICE>4.99</DELIVERY_PRICE>
      <DELIVERY_PRICE_COD>5.99</DELIVERY_PRICE_COD>
    </DELIVERY>
    <PARAM>
      <PARAM_NAME>Objem</PARAM_NAME>
      <VAL>50 ml</VAL>
    </PARAM>
    <PARAM>
      <PARAM_NAME>Koncentrácia</PARAM_NAME>
      <VAL>Eau de parfum</VAL>
    </PARAM>
    <PARAM>
      <PARAM_NAME>Vhodné pre</PARAM_NAME>
      <VAL>${xmlEscape(genderText(f.gender))}</VAL>
    </PARAM>
    <PARAM>
      <PARAM_NAME>Inšpirované značkou</PARAM_NAME>
      <VAL>${xmlEscape(f.brand)}</VAL>
    </PARAM>
    <PARAM>
      <PARAM_NAME>Inšpirované vôňou</PARAM_NAME>
      <VAL>${xmlEscape(f.original_name)}</VAL>
    </PARAM>
  </SHOPITEM>`).join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<SHOP>${items}
</SHOP>
`;
}

// ──────────────────────────────────────────────────────────────────
// GOOGLE MERCHANT CENTER feed (RSS 2.0 with g: namespace)
// ──────────────────────────────────────────────────────────────────
function buildMerchant() {
  const items = fragrances.map(f => `
    <item>
      <g:id>${xmlEscape(f.id)}</g:id>
      <g:title>VEELYN ${xmlEscape(f.veelyn_name)} — dupé ${xmlEscape(f.brand)} ${xmlEscape(f.original_name)}</g:title>
      <g:description>${xmlEscape(description(f))}</g:description>
      <g:link>${SITE}/?vona=${encodeURIComponent(f.id)}</g:link>
      <g:image_link>${SITE}/images/veelyn/${encodeURIComponent(f.id)}.png</g:image_link>
      <g:availability>in_stock</g:availability>
      <g:price>${Number(f.veelyn_price).toFixed(2)} EUR</g:price>
      <g:condition>new</g:condition>
      <g:brand>Veelyn</g:brand>
      <g:google_product_category>${GOOGLE_PERFUME_CATEGORY}</g:google_product_category>
      <g:identifier_exists>no</g:identifier_exists>
      <g:gender>${genderEN(f.gender)}</g:gender>
      <g:age_group>adult</g:age_group>
      <g:shipping>
        <g:country>SK</g:country>
        <g:service>Packeta</g:service>
        <g:price>2.99 EUR</g:price>
      </g:shipping>
      <g:shipping>
        <g:country>SK</g:country>
        <g:service>Kurier</g:service>
        <g:price>4.99 EUR</g:price>
      </g:shipping>
      <g:custom_label_0>${xmlEscape(f.brand)}</g:custom_label_0>
      <g:custom_label_1>dupé</g:custom_label_1>
    </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Veelyn — dupé parfumy</title>
    <link>${SITE}/</link>
    <description>Slovenské dupé parfumy: vône ako Creed, Tom Ford, Dior, YSL za 24,99 € namiesto 100–400 €.</description>${items}
  </channel>
</rss>
`;
}

const heurekaPath = resolve(ROOT, 'heureka.xml');
const merchantPath = resolve(ROOT, 'merchant.xml');
writeFileSync(heurekaPath, buildHeureka());
writeFileSync(merchantPath, buildMerchant());

console.log(`✓ heureka.xml   — ${fragrances.length} SHOPITEM entries`);
console.log(`✓ merchant.xml  — ${fragrances.length} <item> entries`);
console.log(`\nRegister these URLs:`);
console.log(`  Heureka:  ${SITE}/heureka.xml`);
console.log(`  Merchant: ${SITE}/merchant.xml`);
