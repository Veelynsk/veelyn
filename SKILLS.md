# SKILLS — Pravidlá a preferencie pre tvorbu e-shopov

> Tento súbor sa priebežne aktualizuje na základe feedbacku z reálnych projektov.
> Používa sa ako "DNA" / štýl-guide pre všetky budúce e-shop projekty.

---

## 🏗️ Architektúra a kód

### Mobile-first prístup
- **Vždy** designovať a kódiť najprv pre mobil (320px–480px)
- Až potom škálovať pre tablet (768px) a desktop (1024px+)
- CSS media queries: `@media (min-width: ...)`, nikdy `max-width` ako default

### Technológie (default ak nie je špecifikované)
- HTML + CSS + JS (vanilla, bez frameworkov)
- Jeden HTML súbor pre stránku, oddelené CSS a JS súbory
- Bez build toolov (ide otvoriť priamo v prehliadači)

---

## 🎨 Dizajn

### *(zatiaľ prázdne — bude sa dopĺňať z feedbacku)*

---

## 🔤 Typografia

### *(zatiaľ prázdne)*

---

## 🎬 Animácie

### *(zatiaľ prázdne)*

---

## 🛒 E-shop špecifické vzory

### Karusel produktov
- Auto-rotácia každých niekoľko sekúnd
- Možnosť ručného listovania
- Pauza pri hover

### Pop-up modaly (namiesto navigácie na nové stránky)
- Otvárajú sa cez 75% plochy
- Okraje mierne blurred (backdrop-filter: blur)
- Zatváranie cez X-ko v pravom hornom rohu
- Zatváranie aj cez ESC kláves a klik mimo modalu

### Pohyblivé pásy (marquee)
- Bežiaci text v hornom paneli
- Niekoľko opakovaní textu pre plynulosť
- Konštantná rýchlosť, bez prerušení

### Cart
- Slide-out z pravej strany (Shopify-like)
- Live update bez reloadu

### Search
- Live / instant search (od prvého písmena)
- Otvára sa v podlhovastom modal okne
- Zahŕňa "TOP SELLERS" sekciu pod search inputom

---

## 🌍 Lokalizácia

### Slovenský trh
- Texty v slovenčine
- Diakritika (á, é, í, ó, ú, ä, ô, č, š, ž, ť, ň...)
- Cena formát: `24,99 €` (čiarka ako desatinný oddeľovač, € za číslom)

---

## 🔁 Pracovný postup

### Pri novom projekte
1. Najprv si vyžiadať obsah (produkty, logo, štýl)
2. Až potom začať kódiť
3. Postupne ukazovať pokrok a iterovať

### Vždy posielať preview po zmene
- **POSLEDNÁ akcia každej odpovede o stránke = preview screenshot**. Nie v strede odpovede, nie "vyššie odkaz na obrázok" — čerstvý screenshot ako úplne posledný tool call pred záverom textu
- Vždy v texte uviesť aj **link na preview server** (napr. `http://localhost:8765`) ako záložný spôsob — ak používateľov klient screenshot nerendruje, otvorí si stránku sám
- Platí pre KAŽDÚ odpoveď o UI/stránke — aj malé zmeny, aj otázky, aj keď si myslíš že to nie je relevantné
- Sekvencia: edit → save → screenshot → text response s linkom. Nie: edit → screenshot → ďalší edit → text response (vtedy je screenshot zastaralý)
- Použiť `mcp__Claude_Preview__preview_screenshot` po uložení zmien
- Ak je sekcia pod foldom a screenshot vyjde čierny (bug pri hlbokom scrolle), dočasne ju "vytiahnuť" cez `position: fixed; top: 0; left: 0; right: 0; z-index: 9999;` + `body.style.overflow = 'hidden'`, screenshot, potom vrátiť `style.cssText = ''`
- Bez čerstvého screenshotu **a linku** na konci nevracať turn — užívateľ to bude vyžadovať znova

### Feedback loop
- Užívateľov feedback **vždy** zaznamenať do tohto SKILLS.md
- Format: konkrétne pravidlo + krátky príklad / vysvetlenie
- Nezapisovať one-off rozhodnutia (tie patria k projektu, nie do skills)

---

## 📝 Špecifické pravidlá od užívateľa

### Logo
- Logo brandu vždy v **strede headera** (nikdy nie vľavo/vpravo)
- Logo musí byť **veľké a dominantné** — je hlavný brand element

### Navigácia
- Hlavné menu položky majú byť **veľké a výrazné** (nie drobné textové linky)
- **Vertikálny sidebar vľavo** — položky pod sebou, veľké tap targety
- NIE horizontálny pásik pod headerom — to vyzerá ako bežná nav, používateľ chce odlíšenú VERTIKÁLNU bočnú navigáciu (à la Duppé sidebar)
- Premium/akčné položky (3+1, výpredaj) vizuálne odlíšiť (★ ikona, gradient pozadie)

### Karusel / hero produkt
- Centrálne fľašky musia byť **dominantné a veľké** — to je hlavný predajný prvok
- Defaultná veľkosť je často malá, treba dať +30% alebo viac
- Originál fľaška za našou nesmie byť stratená — pekne čitateľná

### Farby cien
- ❌ **Cena NIKDY fialovou** — vyzerá lacno, nečitateľne
- ✅ Cena musí byť v neutrálnej farbe (biela / krémová / čierna), prípadne zlatá
- Fialová len pre akcenty (CTA, badge, hover)

### Pohyblivé pásy (marquee)
- Tmavý/čierny pás je nudný — treba zaujať
- Inšpirácia Duppé: kontrastné, výrazné, niekedy s farebným pozadím
- Veľká typografia, výrazný pohyb

### Porovnávacia tabuľka
- ❌ Klasická HTML tabuľka vyzerá nudne
- ✅ Moderný card-based / column-based design (à la Duppé)
- Veľké checkmarky / X-ká, jasný kontrast medzi "my" a "oni"
- Loga / branding v hlavičke stĺpcov

### Hero / above-the-fold
- Hero/landing **NIKDY nesmie zaberať celú obrazovku sám** — používateľ musí pri prvom načítaní vidieť aj časť ďalšej sekcie (alebo aspoň tušenie že tam niečo je)
- Tento "peek under the fold" je signál že treba scrollnúť → drží retenciu na stránke
- Konkrétne: kombinácia hero CTA + kus marquee/ďalšej sekcie musí byť viditeľná naraz
- Voliteľne: scroll indicator (↓ animácia) ako jemný kék

### Hlavná inšpirácia
- **Duppé Scents** (duppescents.com) — sebavedomý, dostupný luxus, hravé pásy, kurátorske sety, transparentné porovnania
- Veelyn nemá byť kópia Duppé, ale má rovnakú energiu

---

*Posledná aktualizácia: feedback po MVP Veelyn — 5. mája 2026*
