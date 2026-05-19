# Veelyn Backend

Minimalistický backend pre prijímanie objednávok z `veelyn.sk`. Node.js + Express + SQLite.

## Čo robí

- **POST /api/order** — prijme objednávku, uloží do SQLite, pošle e-mail tebe (predávajúcemu) + zákazníkovi
- **GET /api/admin/orders** — zoznam objednávok (chránené Bearer tokenom)
- **PATCH /api/admin/orders/:id** — zmena stavu objednávky (pending → paid → shipped → delivered)
- **GET /api/health** — ping

## Spustenie (lokálne)

```bash
cd backend
npm install
cp .env.example .env
# Vyplň .env (najmä RESEND_API_KEY, SELLER_EMAIL, ADMIN_PASSWORD)
npm start
```

Server beží na `http://localhost:3001`.

## E-maily (Resend)

Bez `RESEND_API_KEY` server beží, ale e-maily sa **iba logujú** do `backend/logs/V1234.json`.

Po nastavení:
1. Zaregistruj sa na [resend.com](https://resend.com) (zadarmo 100 emailov/deň)
2. Pridaj doménu `veelyn.sk` a over ju DNS záznamami
3. Skopíruj API kľúč do `.env` → `RESEND_API_KEY=re_...`
4. Reštartuj server

E-maily idú na:
- **Predávajúci** (env `SELLER_EMAIL`) — full detail objednávky s položkami
- **Zákazník** (z objednávky) — pekné potvrdenie s číslom objednávky

## Nasadenie do produkcie

### Railway / Render / Fly.io (najjednoduchšie)
1. Pushni `backend/` do GitHub repa
2. Vytvor nový projekt, prepojí sa s repom
3. Set env vars: `RESEND_API_KEY`, `SELLER_EMAIL`, `ADMIN_PASSWORD`
4. Deploy ti dá URL napr. `https://veelyn-api.up.railway.app`
5. Vo frontende v `script.js` zmeň `VEELYN_API` na túto URL pre produkciu

### Vercel
Funguje, ale SQLite súbor sa pri redeployi vynuluje. Pre produkciu lepšie použiť Postgres (Supabase) alebo Railway.

## Databáza

SQLite súbor: `backend/orders.sqlite`. **Zálohuj ho** — všetky objednávky sú tam.

Schéma — pozri `server.js` CREATE TABLE.

## SuperFaktura

Po vyplnení `SF_EMAIL` + `SF_APIKEY` v `.env` (alebo v Railway → Variables) sa pri každej novej objednávke automaticky vytvorí faktúra v SuperFaktura a uloží sa odkaz na PDF + verejný link.

### Nastavenie

1. Zaregistruj sa na [moja.superfaktura.sk](https://moja.superfaktura.sk).
2. V `Nastavenia → Nástroje → API` vytvor nový token.
3. Vyplň `.env`:
   ```
   SF_EMAIL=tvoj@email.sk
   SF_APIKEY=ten-32-znakovy-token
   SF_VAT_RATE=20      # 0 ak nie si platiteľ DPH
   ```
4. Reštartuj server. Po naštartovaní by si mal vidieť `SuperFaktura: ✓ aktívna`.

### Ako to funguje

| Krok | Akcia |
|------|-------|
| 1. Zákazník objedná | `POST /api/order` → uložené v DB → faktúra v SF vytvorená → email s linkom na PDF |
| 2. Zákazník zaplatí | Bankový prevod / hotovosť (manuálne) — SF má bysquare QR na faktúre |
| 3. Ty označíš ako zaplatené | V admin UI: `PATCH /api/admin/orders/:id { status: 'paid' }` → SF označí faktúru zaplatenú automaticky |
| 4. Notifikácia | V admin UI vidíš `paid` stav — pripravíš zásielku |

### Admin endpointy pre SF

```
GET  /api/admin/orders/:id/invoice          → metadáta faktúry (PDF link, public link, paid_at)
POST /api/admin/orders/:id/invoice/retry    → ak vytvorenie zlyhalo, skús znova
```

Faktúry sú uložené v SQLite tabuľke `sf_invoices` (1:1 k orders). Ak SF API zlyhá, objednávka sa stále uloží a `sf_invoices.error` obsahuje dôvod — môžeš retry-nuť cez admin UI.

## Bezpečnosť

- Admin endpointy chránené Bearer tokenom (`ADMIN_PASSWORD`)
- CORS otvorený — pre produkciu obmedz na `https://veelyn.sk` v `server.js`
- HTTPS vyriešený hostingom (Railway/Render majú HTTPS zdarma)
