# Veelyn — MailerLite integration

Backend posiela subscriberov do 3 skupín. **Email obsahy + sekvencie sa robia v MailerLite UI** (Automations) — kód len pushuje udalosti, nikdy nepíše content emailov.

## 1. Aktivácia

V Railway → projekt `veelyn-production` → tab **Variables** → **+ New Variable**:

```
MAILERLITE_TOKEN = eyJ0eXAi...   (token z https://dashboard.mailerlite.com/integrations/api)
```

Railway sa po pridaní premennej automaticky reštartuje. V logoch by si mal vidieť:

```
MailerLite: ✓ aktívna
```

## 2. Aké skupiny musia v MailerLite existovať

| Group name (presný case) | Účel |
|---|---|
| `Newsletter` | Footer newsletter form |
| `Customers` | Auto-pridaný pri úspešnej objednávke |
| `Abandoned cart` | Auto-pridaný keď user vyplní checkout step 1 ale nedokončí |

Ak skupina neexistuje, backend hodí 502 error so správou `MailerLite group "X" not found` — vytvor ju v dashboarde a hotovo.

## 3. Aké custom polia subscribers dostávajú

### Newsletter
- `source` — odkiaľ prišli (default: `footer`)

### Customers
- `name`, `last_name`
- `last_order_id` — napr. `V1234`
- `last_order_value` — total v EUR
- `last_order_at` — ISO date

### Abandoned cart
- `cart_value` — v EUR
- `cart_items` — comma-separated názvy (napr. `MOULIN ROUGE×1, HARD CASH×2`)
- `cart_link` — link späť na košík

## 4. Automatizácie ktoré nastavíš v MailerLite UI

Choď do **Automations → + Create new** a vytvor tieto 3 sekvencie. (Ja ti môžem dať aj hotové JSON exporty, ak ich budeš chcieť importovať — len mi povedz.)

### Welcome flow

**Trigger:** Subscriber joins group `Newsletter`

| Email | Delay | Predmet | Obsah TL;DR |
|---|---|---|---|
| 1 | Hneď | `Vitaj v Veelyn — tu je tvoj 5 % kód` | Welcome, kód `VEELYN5`, CTA "kúpiť vône" |
| 2 | Po 2 dňoch | `Ako si vyberieš správnu vôňu` | Guide pre dámske/pánske/unisex, odkaz na katalóg |
| 3 | Po 5 dňoch | `Top 5 dupé parfumov tento mesiac` | Bestseller pick, social proof, CTA |

### Abandoned cart win-back

**Trigger:** Subscriber joins group `Abandoned cart`  
**Exit condition:** Subscriber joins group `Customers` (= nakúpil → stop sekvenciu)

| Email | Delay | Predmet |
|---|---|---|
| 1 | Po 1 hodine | `Zabudol si na košík ❤️` |
| 2 | Po 24 hodinách | `Posledná šanca — extra 5 % zľava pre teba` |

V emaili môžeš použiť polia `{$cart_items}`, `{$cart_value}` na personalizáciu.

### Post-purchase

**Trigger:** Subscriber joins group `Customers`

| Email | Delay | Predmet |
|---|---|---|
| 1 | Hneď | `Tvoja objednávka {$last_order_id} je na ceste` |
| 2 | Po 7 dňoch | `Ako sa ti páči? Recenzia za 5 € zľavu` |

## 5. Endpointy ktoré backend ponúka

```
POST /api/newsletter       { email, source? }    → pridá do Newsletter
POST /api/cart-abandoned   { email, cartValue, cartItems } → pridá do Abandoned cart
POST /api/order            (existujúci)          → pri success pridá do Customers
                                                  + odstráni z Abandoned cart
```

Všetky 3 endpointy sú soft-fail — ak je MailerLite token nesprávny alebo MailerLite je dole, frontend stále dostane `{ok:true}` a UX nepukne.

## 6. Domain verification (na odoslanie emailov)

Aby emaily neskončili v spame, MailerLite vyžaduje:
- SPF TXT záznam na koreni `veelyn.sk`
- DKIM CNAME × 2

Tieto sa pridávajú v **Cloudflare DNS** s **Proxy status: DNS only (šedý mrak)** — nie proxied.

Po pridaní záznamov klikni v MailerLite **Verify domain**. Bez verifikácie môžeš posielať len 100 emailov/deň z `@mlsend.com` adresy (nie z `@veelyn.sk`).

## 7. Test po nasadení

1. Otvor https://veelyn.sk
2. V päte zadaj svoj email do newsletter formu → klikni "Prihlásiť"
3. V MailerLite **Subscribers → Newsletter** by si sa mal pridať
4. Pridaj produkt do košíka → klikni "K pokladni" → vyplň email + meno + adresu → klikni "Pokračovať" (= step 1 submit)
5. ZATVOR tab BEZ dokončenia objednávky
6. V MailerLite **Subscribers → Abandoned cart** by si sa mal pridať
7. Ak by si checkout DOKONČIL, presunieš sa do `Customers` a z `Abandoned cart` zmizneš
