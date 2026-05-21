# Veelyn — Heureka.sk + Google Merchant Center setup

Po každom buildi (Cloudflare Pages) sa automaticky regenerujú dva produktové feedy z `fragrances.json`. Stačí URL feedu zaregistrovať v príslušnom dashboarde a katalógy už nikdy nemusíš ručne aktualizovať.

## Feed URLs

| Feed | URL na produkčnej doméne |
|------|--------------------------|
| Heureka.sk | `https://veelyn.sk/heureka.xml` |
| Google Merchant Center | `https://veelyn.sk/merchant.xml` |

Oba sa generujú deterministicky z `fragrances.json`. Pridanie novej vône → push → CF Pages spustí `bash build.sh` → oba XML sú aktualizované.

Manuálne lokálne:
```bash
npm run build-feeds
```

---

## 1. Heureka.sk

### Prečo
Heureka generuje pre slovenský e-commerce typicky **20–40 % obratu**. Vyhľadávanie na "parfum dupé Creed", "lacný Tom Ford parfum" často vedie ľudí cez Heureka SERP (porovnávacie tabuľky) priamo k tebe. Zákazník vidí Veelyn cenu vedľa konkurencie, prečíta si recenzie a klikne.

### Náklady
- **Registrácia + zaradenie**: zadarmo
- **Štandardné preklikávanie** (Heureka košík nákupu): **0,10–0,30 €** za preklik na detail produktu
- **Overené zákazníkmi** (badge): zadarmo po prvých 10 hodnoteniach
- Žiadne fixné mesačné poplatky

### Registrácia (15 min admin + 7–10 dní schvaľovacia doba)

1. Choď na **[sluzby.heureka.sk](https://sluzby.heureka.sk)** → Registrácia
2. Zadaj:
   - Názov obchodu: `Veelyn`
   - Web: `https://veelyn.sk`
   - Kategória: Krása a zdravie → Parfumy
   - Sídlo + IČO firmy
3. V kroku **XML feed** vlož: `https://veelyn.sk/heureka.xml`
4. **Heureka tím zvyčajne 5–7 dní validuje feed + obchod.** Môžu poslať otázky cez email — odpovedaj rýchlo.
5. Po schválení: feed sa stiahne každú noc, produkty ti vyskočia v Heureka katalógu.

### Po spustení

- **"Overené zákazníkmi"** badge — Heureka pošle zákazníkovi 7 dní po nákupe emailovú anketu. Po 10 pozitívnych hodnoteniach dostaneš badge na web aj v Heureke.
- **Heureka.košík** (priamy nákup cez Heureku) — odporúčam **NEzapínať na začiatku**. Konverzná miera je nižšia ako keď ide preklik na tvoj web.
- **Heureka API pre objednávky** — neskôr môžeme prepojiť, aby Heureka vedela stav objednávky.

---

## 2. Google Merchant Center (Google Shopping)

### Prečo
Free Shopping placement od 2020 — produkty s ratingom, fotkou, cenou ti vyskakujú v Google Search **bez 1 € reklamy**. Platené Google Shopping kampane potom rozšíria zásah cez **Smart Shopping** alebo **Performance Max**.

### Náklady
- **Free product listings**: zadarmo navždy
- **Shopping kampane**: voliteľné, CPC ~0,05–0,30 € (parfumy v SK)

### Registrácia (10 min admin + 2–3 dni validácia)

1. Choď na **[merchants.google.com](https://merchants.google.com)** → Sign up
2. Verify website ownership — najjednoduchšie **cez Google Search Console** (ak ešte nemáš, treba to spraviť tiež, je to free a posiela ti aj indexing reports)
3. **Products → Feeds → Add primary feed**:
   - Country: Slovakia
   - Language: Slovak
   - Method: **Scheduled fetch** (Google si feed stiahne sám raz denne)
   - File URL: `https://veelyn.sk/merchant.xml`
   - Schedule: Daily, 04:00 GMT
4. Po prvom fetchi: Google v ~2 hodinách spracuje, pošle ti email s prípadnými chybami.
5. **Skontroluj "Diagnostics"** tab — najčastejšie warningy:
   - "Missing GTIN/MPN" — máme `<g:identifier_exists>no</g:identifier_exists>`, takže OK
   - "Image too small" — naše PNG sú dostatočne veľké
6. Po validácii: produkty sa zobrazia v **Google Shopping tab** + môžu sa zobrazovať v **Search results** ako rich product results.

### Performance Max kampaň (voliteľne)

Keď máš základ produktov v Merchant Center:
- V Google Ads → Campaigns → New → Performance Max
- Cieľ: Sales
- Linked Merchant: tvoj veelyn účet
- Rozpočet: začni s **15 €/deň** (porazil by si CPA do 8 €)
- Google sa naučí cieľovku za ~2 týždne, potom môžeš škálovať

---

## 3. Čo robiť teraz (poradie)

1. **Dnes** (10 min): Submit `merchant.xml` do Google Merchant Center → spracuje sa do 24 h
2. **Dnes** (15 min): Vyplň žiadosť na Heureka → čakacia doba ~7 dní
3. **Tento týždeň**: Pridaj Heureka **"Overené zákazníkmi"** widget (kód dostaneš v Heureka dashboarde) — budem ho integrovať do footera webu
4. **2 týždne po spustení**: Spusti **Performance Max kampaň** v Google Ads na bestsellery (15 €/deň)

---

## 4. Monitoring

**Heureka Manager** dashboard ukazuje:
- Počet preklikov / deň
- Top produkty
- Hodnotenia zákazníkov

**Google Merchant Center → Performance**:
- Free vs paid clicks
- Click-through rate (CTR)
- Impressions

V GA4 (cez GTM) máš `Source/Medium` kde **Heureka.sk** a **Google Shopping** vyskočia samy ako kanály — môžeš porovnávať konverzie z každého.
