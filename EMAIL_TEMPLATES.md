# Veelyn — MailerLite Email Templates

Hotové drafty pre všetkých **7 emailov** v 3 automatizáciách (Welcome flow, Abandoned cart, Post-purchase). Skopíruj do MailerLite Editora pri vytváraní každej Automation.

## Globálne nastavenia pre všetky emaily

| Nastavenie | Hodnota |
|---|---|
| **From name** | `Veelyn` |
| **From email** | `objednavky@veelyn.sk` (alebo `newsletter@veelyn.sk` — podľa toho čo si nastavil v Sender Identity) |
| **Reply-to** | `info@veelyn.sk` |
| **Brand farby** | Hlavná `#7c3aed` (fialová), accent `#d4a247` / `#f4cc6c` (zlatá), pozadie `#0a0510` (tmavá), text `#f4f1ee` |
| **Logo** | Použí `https://veelyn.sk/og-image.jpg` alebo upload klean logo do MailerLite (max 600 × 200 px) |
| **Footer každého emailu** | `Veelyn — slovenské dupé parfumy` + unsubscribe link (MailerLite vloží automaticky), info@veelyn.sk |

## Merge tags v MailerLite v2

Použivaj v subject + body:

- `{$name}` — krstné meno (ak je vyplnené)
- `{$email}` — email subscribera
- `{$fields.cart_value}` — hodnota košíka (€) zo `/api/cart-abandoned`
- `{$fields.cart_items}` — položky košíka, napr. `MOULIN ROUGE×1, HARD CASH×2`
- `{$fields.last_order_id}` — napr. `V1234`
- `{$fields.last_order_value}` — celkom € poslednej objednávky

Ak `{$name}` nie je vyplnené, MailerLite default je prázdny string — fallback v texte: `Ahoj {$name|default:"krásavico"}` alebo skús bez mena („Ahoj!").

---

# AUTOMATION 1 — Welcome flow

**Trigger:** Subscriber joins group `Newsletter`
**Exit condition:** žiadny (nech sa flow dokončí celý)

---

## ✉ Email 1 — Welcome (instant)

**Delay:** Hneď (0 minutes)

### Subject (A/B test 2 varianty)
- A: `Vitaj v Veelyn ✦ Tvoj 5 % kód je tu`
- B: `Pst, máme pre teba kód: VEELYN5`

### Preheader (display text pod subjectom v inboxe)
`5 % zľava na prvý nákup. Bez výhovoriek.`

### Body

```
Ahoj,

ďakujeme že si sa pridal do Veelyn rodiny ❤️

Aby sme uvítanie nedávali len tak na sucho — tu je tvoj
osobný kód na 5 % zľavu na celý prvý nákup:

   ╔══════════════════╗
   ║   VEELYN5        ║
   ╚══════════════════╝

Použí ho v košíku. Platí 14 dní.

──────────────────

✦ Čo robíme

Vyrábame dupé parfumy na Slovensku — vône inšpirované
Creed Aventus, Tom Ford, Dior, Maison Francis Kurkdjian,
YSL a desiatkami ďalších značiek. 50 ml eau de parfum
za 24,99 € namiesto 100–400 € za originál.

Žiadny háčik. Žiadne predplatné. Len silná vôňa
s 6–10 hodinovou výdržou.

[ZAČAŤ NAKUPOVAŤ →]   ← CTA tlačidlo, link: https://veelyn.sk/

──────────────────

P.S.: Sľubujeme, nebudeme ti vyhadzovať schránku.
Maximálne 2–3 maily mesačne — vždy len keď máme
niečo skutočne zajímavé alebo zľavu pre teba 😹

— Tristan + Veelyn tím
info@veelyn.sk
```

### CTA tlačidlo (button block)
- Text: `Začať nakupovať →`
- Link: `https://veelyn.sk/`
- Farba: fialová (#7c3aed)

---

## ✉ Email 2 — Guide (2 dni neskôr)

**Delay:** 2 dni po Welcome 1

### Subject
- A: `Aký dupé parfum si vybrať? Tu je cheat sheet`
- B: `30 sekúnd: ako nájdeš svoju ideálnu Veelyn vôňu`

### Preheader
`Pánsky, dámsky alebo unisex — vieme presne čo ti sadne.`

### Body

```
Ahoj,

vyberanie parfumu online je trochu hazard — neviete čo
ako vonia, kým si to nepostriekate. Tak sme spravili
mini cheat sheet aby si si vybral ten správny Veelyn
hneď na prvý raz.

──────────────────

🎯 Krok 1 — Vyber svoju kategóriu

[👨 PÁNSKE]   [👩 DÁMSKE]   [🤝 UNISEX]
veelyn.sk/#  veelyn.sk/#   veelyn.sk/#

──────────────────

🎯 Krok 2 — Inšpiruj sa originálom ktorý poznáš

Ak máš rád Creed Aventus → skús HARD CASH
Ak miluješ Tom Ford → vyber LOST CHERRIES alebo FORBIDDEN
Ak ti vonia YSL Libre → STAR
Ak je tvoj original Dior Sauvage → SAVAGE

──────────────────

🎯 Krok 3 — Pozri si tóny vône

Každá Veelyn vôňa má rozpísané top, srdcové a základné
tóny — môžeš si vybrať podľa toho čo máš rád
(citrusové, drevité, sladké, kvetinové…).

[OTVORIŤ KATALÓG VÔNÍ →]

──────────────────

Pamätáš si na kód VEELYN5? Ešte ti platí 12 dní.

— Veelyn tím
```

### CTA tlačidlo
- Text: `Otvoriť katalóg vôní →`
- Link: `https://veelyn.sk/#vsetky-vonavky`

---

## ✉ Email 3 — Bestsellers (5 dní)

**Delay:** 5 dní po Welcome 1 (= 3 dni po Welcome 2)

### Subject
- A: `Top 5 Veelyn vôní ktoré ľudia milujú 🔥`
- B: `1 247 zákazníkov si vybralo TIETO 5 vôní`

### Preheader
`Toto si zákazníci kupujú najviac. Možno ťa zaujme aj jedna.`

### Body

```
Ahoj,

zhrnuli sme čo si zákazníci najviac kupujú u nás.
Ak ešte neviete s ktorou vôňou začať, je to dobrý
štart:

──────────────────

🥇  HARD CASH  ·  24,99 €
    Dupé Creed Aventus — ovocno-drevitá pánska klasika.
    Ananás, breza, mošus. Pôsobí ako úspech.
    [POZRIEŤ →]   veelyn.sk/?vona=hard-cash

🥈  MOULIN ROUGE  ·  24,99 €
    Dupé Maison Francis Kurkdjian Baccarat Rouge 540.
    Sladko-šafránová, vanilka, céder. Unisex magnet.
    [POZRIEŤ →]   veelyn.sk/?vona=moulin-rouge

🥉  STAR  ·  24,99 €
    Dupé YSL Libre. Levanduľa + sladká vanilka.
    Dámsky bestseller — sviežo aj sexy.
    [POZRIEŤ →]   veelyn.sk/?vona=star

4️⃣  SAVAGE  ·  24,99 €
    Dupé Dior Sauvage. Ambroxan, bergamot, korenie.
    Pánsky parfum ktorý nikdy nesklame.
    [POZRIEŤ →]   veelyn.sk/?vona=savage

5️⃣  IMAGINE THIS  ·  24,99 €
    Dupé Louis Vuitton Imagination. Mandarinka,
    ginger, ambra. Sviežo, čisto, prémiovo.
    [POZRIEŤ →]   veelyn.sk/?vona=imagine-this

──────────────────

⭐ 4.8/5 — viac ako 1 247 recenzií
✦ 3+1 ZADARMO pri 4 vonách
✦ Doprava ZADARMO nad 40 €
✦ 14 dní na vrátenie

[POZRIEŤ VŠETKY VÔNE →]

— Veelyn tím
```

### CTA tlačidlo
- Text: `Pozrieť všetky vône →`
- Link: `https://veelyn.sk/#vsetky-vonavky`

---

# AUTOMATION 2 — Abandoned cart

**Trigger:** Subscriber joins group `Abandoned cart`
**Exit condition:** Subscriber joins group `Customers` (= nakúpil → stop)

---

## ✉ Email 4 — Abandoned cart 1 (1h)

**Delay:** 1 hodina po pridaní do `Abandoned cart`

### Subject
- A: `Ostalo ti v košíku ❤️`
- B: `Tvoja vôňa ťa čaká…`
- C: `{$name|default:""}, zabudol si na košík?`

### Preheader
`Tvoj výber ešte žije. Stačí kliknúť a dokončíme to za teba.`

### Body

```
Ahoj{$name|default:""},

vidíme že si si vybral pekné veci, ale niečo ťa
vyrušilo a košík ostal otvorený. Bez stresu — vrátime
ťa späť presne tam, kde si skončil.

──────────────────

🛒 V tvojom košíku:

    {$fields.cart_items}

    Spolu: {$fields.cart_value} €

──────────────────

[DOKONČIŤ OBJEDNÁVKU →]
veelyn.sk/

──────────────────

Prečo to dokončiť teraz?

✦ Cena 24,99 € je trvalá — to nie je akcia,
   to je naša normálna cena. Originály toho stoja
   100–400 €.

✦ Doprava zdarma nad 40 € (čo asi máš v košíku)

✦ 14 dní na vrátenie ak by ti vôňa nesedela

✦ Vyrábané na Slovensku, posielané do 24h

──────────────────

Ak si si predstavu o objednávke rozmyslel — pohoda,
nič ti neposielame proti vôli. Stačí ignorovať tento
email.

— Veelyn tím
info@veelyn.sk
```

### CTA tlačidlo
- Text: `Dokončiť objednávku →`
- Link: `https://veelyn.sk/` (alebo presný link na cart ak budem mať deep-link na cart neskôr)

---

## ✉ Email 5 — Abandoned cart 2 (24h)

**Delay:** 24 hodín po pridaní do `Abandoned cart` (= 23h po Email 4)

### Subject
- A: `Posledná šanca — extra 5 % na košík čo máš odložený`
- B: `Tvoj košík + bonus 5 % (platí 24 h)`

### Preheader
`Kód CART5 — zľava nad rámec ceny 24,99 €. Len pre teba.`

### Body

```
Ahoj{$name|default:""},

stále nič, len košík čo nás obaja vidíme. Tak ti
ho zoľavníme ešte viac — ber to ako poďakovanie
že si dal Veelyn šancu.

──────────────────

   ╔══════════════════════════════╗
   ║   CART5 — extra 5 % zľava    ║
   ║   platí len 24 hodín         ║
   ╚══════════════════════════════╝

──────────────────

🛒 V tvojom košíku ešte stále čaká:

    {$fields.cart_items}
    Spolu: {$fields.cart_value} €

S kódom CART5 ušetríš dodatočných 5 % — pripočítava
sa k všetkým existujúcim cenám (vrátane 3+1 ZADARMO
ak máš v košíku 4+ vône).

──────────────────

[DOKONČIŤ OBJEDNÁVKU S 5 % →]
veelyn.sk/

──────────────────

Ak to po 24 hodinách nestihneš — košík ostane v plnej
sume, ale kód CART5 ti vyprší.

— Veelyn tím
```

### CTA tlačidlo
- Text: `Dokončiť so zľavou 5 % →`
- Link: `https://veelyn.sk/`

### ⚙ Poznámka k zľavovému kódu

Treba si vytvoriť v admin paneli (alebo manuálne v `data.js`) zľavový kód `CART5` ktorý dáva 5 %. Daj mi vedieť keď budeš chcieť, ja pridám discount validation endpoint do backendu.

---

# AUTOMATION 3 — Post-purchase

**Trigger:** Subscriber joins group `Customers`
**Exit condition:** žiadny (môže ostať v Customers natrvalo)

---

## ✉ Email 6 — Order confirmation (instant)

**Delay:** Hneď (0 minutes)

### Subject
`Tvoja objednávka {$fields.last_order_id} je u nás 🛵`

### Preheader
`Pripravujeme balík. ETA doručenia 1–3 pracovné dni.`

### Body

```
Ahoj{$name|default:""},

ďakujeme za objednávku! ❤️

──────────────────

✦ Číslo objednávky: {$fields.last_order_id}
✦ Suma:             {$fields.last_order_value} €
✦ Status:           Pripravujeme balík

──────────────────

Čo bude nasledovať:

1️⃣  Do 24 hodín ti zabalíme objednávku
2️⃣  Kuriér / Packeta zásielku vyzdvihne
3️⃣  Pošleme ti sledovacie číslo (e-mailom)
4️⃣  Doručenie 1–3 pracovné dni od expedície

──────────────────

Tip: ak je tvoj balík zaplatený bankovým prevodom,
využi QR kód na faktúre (Pay by Square) v aplikácii
tvojej banky — platba sa spáruje automaticky.

──────────────────

Otázky? Napíš na info@veelyn.sk, odpovedáme do 24 h.

— Veelyn tím
```

### Dôležité

V `last_order_value` z backendu posielame čisté číslo (`79.97`). V emaili pridaj manuálne `€` symbol — alebo nech môj backend posiela formátovaný string. Daj vedieť ak chceš zmeniť.

---

## ✉ Email 7 — Review request (7 dní)

**Delay:** 7 dní po pridaní do `Customers`

### Subject
- A: `Páčil sa ti parfum? Tu je 5 € za 30 sekúnd`
- B: `{$name|default:""}, ako sa ti páči? (+ kód za review)`

### Preheader
`Dáš nám 30 sekúnd na review? Dostaneš REVIEW5 — 5 € z ďalšej objednávky.`

### Body

```
Ahoj{$name|default:""},

pred týždňom ti dorazila objednávka {$fields.last_order_id}.
Predpokladáme že máš parfum už pár dní na sebe a vieš
povedať či ti voní alebo nie.

Bola by veľká pomoc keby si nám dal feedback — pár viet
o tom, ako ti vôňa sadla. Pomáha nám to aj ostatným
zákazníkom čo váhajú.

──────────────────

⭐ NAPÍSAŤ REVIEW (30 sekúnd):

   → Google Reviews:
     https://g.page/r/Veelyn-recenzie/review

   → Heureka.sk:
     https://obchody.heureka.sk/veelyn-sk/recenzie/

──────────────────

A ako poďakovanie ti dáme 5 € z ďalšej objednávky:

   ╔══════════════════╗
   ║   REVIEW5        ║
   ╚══════════════════╝

Platí 30 dní. Stačí ho použiť v košíku.

──────────────────

Ak ti niečo nesedelo — povedz nám to RAVNO mailom
na info@veelyn.sk. Vyriešime to. Nedávaj nám 3
hviezdy, daj nám šancu opraviť to ❤️

[NAPÍSAŤ REVIEW →]

— Veelyn tím
```

### CTA tlačidlo
- Text: `Napísať review →`
- Link: tvoj Google Reviews link (Heureka pridáš keď budeš schválený)

### ⚙ Poznámka k zľavovému kódu

REVIEW5 = 5 € fixná zľava. Treba vytvoriť v admin paneli alebo nech to bežia ručne za týmto kódom v škatuli.

---

# Setup checklist v MailerLite

Po skopírovaní každého emailu:

- [ ] **Subject** vyplň (prípadne A/B variant B do "test subject")
- [ ] **Preheader** vyplň (cca 60 znakov)
- [ ] **From name / from email** = Veelyn / objednavky@veelyn.sk
- [ ] **Body** vlož do MailerLite editora — môžeš použiť ich blokový editor (Text block + Button block) alebo prepnúť na "Simple editor" pre čistý layout
- [ ] **CTA Button block**: zaraď za hlavný text body, link na správnu URL
- [ ] **Footer**: nech tam je unsubscribe link (auto pridá MailerLite) + email info@veelyn.sk
- [ ] **Save & Done** v editori
- [ ] V Automation **klikni Activate** keď je celá sekvencia hotová

Pre **A/B testovanie subject lines**:
- V MailerLite Automation editor → klikni email → vidíš "Subject" pole
- Pod ním "A/B test split" → zapni → zadaj druhý subject
- Nastav split 50/50, optimalizovať pre Open rate
- Po 24 h MailerLite automaticky pošle všetkým víťazný subject

---

# Ako otestovať

Pred aktiváciou:

1. V MailerLite **Subscribers** → vytvor testovací subscriber so svojím emailom
2. Pridaj ho do skupiny `Newsletter` (alebo `Abandoned cart` / `Customers` podľa toho čo testuješ)
3. **Automation** musí byť **Activated**
4. Email 1 by mal prísť do ~minúty
5. Pre testovanie ďalších emailov v sekvencii musíš počkať skutočný delay, ALEBO v Automation editori môžeš dočasne nastaviť delay na "0 minutes" pre test, potom vrátiť na pôvodný

---

# Odporúčania na neskôr

Keď budeš mať aspoň ~200 subscriberov:

1. **A/B test subject lines** — MailerLite to robí natívne
2. **Re-engagement campaign** — pre subscriberov ktorí 60 dní neotvorili nič → posledná snaha → ak nereagujú, odhlásiť (čistá databáza)
3. **Birthday emails** — pridať custom field `birthday`, spustiť email v deň narodenín so zľavou
4. **Win-back na neaktívnych customers** — ľudia ktorí nakúpili pred 6+ mesiacmi a od vtedy nič

Tieto všetky vieme pridať bez kódu — len v MailerLite UI.
