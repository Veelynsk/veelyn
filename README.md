# VEELYN — Dizajnérske vône bez dizajnérskej ceny

E-shop na predaj duplikátov luxusných vôní. Made in Slovakia, Hated in Paris.

## Štruktúra projektu

```
veelyn/
├── index.html          # HTML kostra (sekcie + modaly)
├── styles.css          # Všetky štýly (mobile-first)
├── data.js             # Databáza 74 vôní + recenzné šablóny (runtime source of truth)
├── script.js           # Všetka logika (carousel, cart, modaly, search, kontakt…)
├── fragrances.json     # Mirror data.js (auto-generovaný export, drž v sync)
├── SKILLS.md           # Designové pravidlá a poznámky pre tento + budúce projekty
└── README.md           # Tento súbor
```

## Ako spustiť

Otvor `index.html` v prehliadači. Žiadny build, žiadny server. Funguje aj cez `file://`.

Pre lepší development server:
```bash
# Python 3
python3 -m http.server 8000
# alebo Node
npx serve
```

Potom otvor http://localhost:8000

## Aktuálny stav

✅ Hotové:
- Hlavička s vertikálnou navigáciou vľavo (3+1 ZADARMO, Všetky vonavky, Kontakt)
- Veľké VEELYN logo v strede
- Krémový marquee pás "Made in Slovakia · Hated in Paris"
- Coverflow karusel s 8 hero vôňami (vidno aj susedné karty)
- Fialový marquee "Voňaj ako milión eur"
- Scenéria sekcia (svetlá, biela)
- Card-based porovnávacia tabuľka (Veelyn vs Iné)
- Footer s VOP/GDPR linkmi

✅ Modaly:
- Search (live search od prvého písmena, Top Sellers grid)
- Cart (slide-out, Shopify-style)
- Catalog (74 vôní, filtre značka + pohlavie, sort)
- Bundle 3+1 ZADARMO (4 sloty, 4. ZADARMO badge)
- Product detail (podľa náčrtu — fľašky, ceny, ikony, porovnanie, nóty)
- Reviews (vygenerované pre každú vôňu)
- Contact form

⚠️ TODO:
- [ ] Reálne fotky fľašiek (zatiaľ CSS-rendered)
- [ ] Foto do Scenéria sekcie
- [ ] Foto do 3+1 modalu
- [x] Splitnúť do separátnych súborov: index.html + styles.css + script.js + data.js
- [x] Napojenie kontaktného formulára cez Web3Forms (chýba už len access key — pozri nižšie)
- [ ] Napojenie checkout-u (Stripe / GoPay)
- [ ] Doladiť mobile responsivitu na rôznych viewportoch
- [ ] Lazy loading obrázkov
- [ ] OG meta tagy + favicon
- [ ] Cookie banner

## Kontaktný formulár — Web3Forms

Formulár v `Kontakt` modal posiela cez [web3forms.com](https://web3forms.com) (zdarma, bez backendu). Posielanie sa zapne, keď v `script.js` doplníš svoj access key:

```js
const WEB3FORMS_ACCESS_KEY = 'tvoj-access-key-tu';
```

Postup:
1. Choď na https://web3forms.com → vlož `info@veelyn.sk` ako cieľový email
2. Skopíruj access key z mailu
3. Vlož ho do `script.js` (riadok ~17)

Kým je `WEB3FORMS_ACCESS_KEY` prázdny, formulár beží v dev móde a iba zobrazí alert.

## Designové pravidlá

Pozri `SKILLS.md` — obsahuje všetky designové rozhodnutia, vrátane farieb, typografie, layout pravidiel.

## Kontakt

Email: info@veelyn.sk
Doména: veelyn.sk (cez Websupport)
