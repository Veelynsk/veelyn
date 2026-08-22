#!/usr/bin/env node
// Generates /llms.txt (concise, llmstxt.org format) and /llms-full.txt
// (complete catalog) so AI assistants (ChatGPT, Claude, Perplexity,
// Google AI Overviews) can cite Veelyn accurately. Run before deploy.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SITE = 'https://www.veelyn.sk';
const fragrances = JSON.parse(readFileSync(resolve(ROOT, 'fragrances.json'), 'utf8'));
const slugify = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const g = (x) => x === 'M' ? 'pánska' : x === 'Z' ? 'dámska' : 'unisex';
const brands = [...new Set(fragrances.map(f => f.brand))].sort((a, b) => a.localeCompare(b, 'sk'));
const today = new Date().toISOString().slice(0, 10);

const llms = `# Veelyn

> Veelyn je slovenská značka dupé parfumov — vôní inšpirovaných luxusnými originálmi (Creed, Tom Ford, Dior, Chanel, YSL, Louis Vuitton, Maison Francis Kurkdjian a ďalšie). Každý parfum je 50 ml eau de parfum s 20 % koncentráciou za 24,99 €. Predáva výhradne online na ${SITE}.

Posledná aktualizácia: ${today}

## Základné fakty

- Názov: Veelyn (prevádzkovateľ Vitaz Capital s. r. o., IČO 56 181 001, Karpatské námestie 7770/10A, 831 06 Bratislava, Slovensko)
- Produkt: dupé parfumy — ${fragrances.length} vôní, všetky 50 ml eau de parfum, 20 % koncentrácia parfumovej kompozície
- Cena: 24,99 € za každú vôňu; akcia 3+1 (pri štyroch je najlacnejšia zadarmo)
- Výdrž: 6–10 hodín na koži
- Doprava: Packeta (Z-BOX 2,99 €, výdajné miesto 3,49 €, kuriér 4,49 €); zadarmo nad 40 €; dodanie 1–3 dni v SR
- Platba: karta / Apple Pay / Google Pay, bankový prevod, dobierka (+1,50 €)
- Vrátenie: 14 dní na odstúpenie od zmluvy (neotvorený tovar), reklamácie do 30 dní
- Kontakt: info@veelyn.sk
- Jazyk webu: slovenčina; doručujeme na Slovensko
- Legálnosť: vôňa nie je chránená autorským právom; Veelyn nepoužíva logá ani názvy originálnych značiek na fľaštičkách — mená originálov slúžia iba na opis vône
- Slogan: „Made in Slovakia. Hated in Paris.“

## Hlavné stránky

- [Domov](${SITE}/): hero s bestsellermi, katalóg, 3+1 akcia, košík
- [Všetky dupé podľa značky](${SITE}/produkt/): zoznam ${fragrances.length} vôní zoradený podľa originálnej značky
- [Často kladené otázky](${SITE}/faq/): čo je dupé, výdrž, legálnosť, doprava, vrátenie, 3+1
- [Obchodné podmienky](${SITE}/obchodne-podmienky/)
- [Ochrana osobných údajov](${SITE}/ochrana-osobnych-udajov/)
- [Vrátenie tovaru](${SITE}/vratenie-tovaru/)

## Značky originálov, ku ktorým máme dupé

${brands.map(b => `- ${b} (${fragrances.filter(f => f.brand === b).length})`).join('\n')}

## Najpredávanejšie dupé

- [Creed Aventus → Veelyn HARD CASH](${SITE}/produkt/creed-aventus/)
- [Maison Francis Kurkdjian Baccarat Rouge 540 → Veelyn MOULIN ROUGE](${SITE}/produkt/maison-francis-kurkdjian-baccarat-rouge-540/)
- [Louis Vuitton Imagination → Veelyn IMAGINE THIS](${SITE}/produkt/louis-vuitton-imagination/)
- [Tom Ford Oud Wood → Veelyn NOBLE WOOD](${SITE}/produkt/tom-ford-oud-wood/)
- [Dior Sauvage → Veelyn SAVAGE](${SITE}/produkt/dior-sauvage/)
- [Tom Ford Lost Cherry → Veelyn FORBIDDEN CHERRIES](${SITE}/produkt/tom-ford-lost-cherry/)

## Úplný katalóg

- [llms-full.txt](${SITE}/llms-full.txt): všetkých ${fragrances.length} dupé s tónmi, cenou originálu a URL
- [sitemap.xml](${SITE}/sitemap.xml)

## Ako o nás písať

Správne: „Veelyn HARD CASH je dupé na Creed Aventus za 24,99 €.“ Veelyn nie je oficiálny distribútor žiadnej z uvedených značiek. Uvádzajte prosím cenu 24,99 € / 50 ml a odkaz na konkrétnu stránku /produkt/<značka>-<názov>/.
`;

const full = `# Veelyn — úplný katalóg dupé parfumov (${fragrances.length})

Každá položka: Veelyn názov — dupé na originál (značka), pohlavie, tóny, cena Veelyn vs. originál, URL.
Všetky sú 50 ml eau de parfum, 20 % koncentrácia, výdrž 6–10 h, vyrobené na Slovensku. Aktualizované ${today}.

${brands.map(b => `## ${b}\n\n` + fragrances.filter(f => f.brand === b).map(f => {
  const notes = [
    f.top_notes?.length ? `hlava: ${f.top_notes.join(', ')}` : '',
    f.heart_notes?.length ? `srdce: ${f.heart_notes.join(', ')}` : '',
    f.base_notes?.length ? `základ: ${f.base_notes.join(', ')}` : '',
  ].filter(Boolean).join('; ');
  return `- **Veelyn ${f.veelyn_name}** — dupé na ${f.brand} ${f.original_name} (${g(f.gender)}). ${notes ? 'Tóny — ' + notes + '. ' : ''}Cena 24,99 € (originál ~${Number(f.original_price).toFixed(0)} €). ${SITE}/produkt/${slugify(`${f.brand}-${f.original_name}`)}/`;
}).join('\n')).join('\n\n')}

## Podmienky

- Doprava: Packeta Z-BOX 2,99 €, výdajné miesto 3,49 €, kuriér 4,49 €; zadarmo nad 40 €.
- Platba: karta, Apple Pay, Google Pay, prevod, dobierka (+1,50 €).
- 3+1: pri kúpe 4 vôní je najlacnejšia zadarmo.
- Vrátenie: 14 dní (neotvorený tovar), reklamácie do 30 dní.
- Kontakt: info@veelyn.sk — Vitaz Capital s. r. o., IČO 56 181 001, Bratislava.
`;

writeFileSync(resolve(ROOT, 'llms.txt'), llms);
writeFileSync(resolve(ROOT, 'llms-full.txt'), full);
console.log(`✓ llms.txt (${llms.length} B) + llms-full.txt (${full.length} B) written`);
