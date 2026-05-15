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

## Bezpečnosť

- Admin endpointy chránené Bearer tokenom (`ADMIN_PASSWORD`)
- CORS otvorený — pre produkciu obmedz na `https://veelyn.sk` v `server.js`
- HTTPS vyriešený hostingom (Railway/Render majú HTTPS zdarma)
