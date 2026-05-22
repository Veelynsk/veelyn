# Veelyn — Packeta integrácia

Dva nezávislé kúsky integrácie:

## 1. Frontend widget (zákazník vyberá výdajné miesto)

**Stav:** ✓ Live. Widget API key `3486767127ceef1f` je nasadený v `script.js`.

Ako to funguje:
1. Zákazník v checkout step 1 vyberie spôsob doručenia `Packeta Z-BOX` alebo `Packeta výdajné miesto`
2. Klikne **"📍 Vybrať Packeta miesto"** tlačidlo
3. Otvorí sa **Packeta widget V6** modal s mapou SK
4. Vyberie miesto → widget vráti `point.id` + adresu
5. Uloží sa do `checkoutState.pickupPoint`
6. Pri submit objednávky sa pošle do `/api/order` v `pickupPoint` poli

## 2. Backend REST (automatická tvorba zásielok + štítkov)

**Stav:** ⏳ Vyžaduje `PACKETA_API_PASSWORD` v Railway env vars.

### Aktivácia

V Railway → projekt `veelyn-production` → tab **Variables** → **+ New Variable**:

```
PACKETA_API_PASSWORD=3486767127ceef1fc34cbf7458fafe09
```

(Toto je tvoj API password z client.packeta.com → Zákaznícka podpora → Heslo API)

Po reštarte v logoch:
```
Packeta REST: ✓ aktívna
```

### Endpointy

```
GET  /api/admin/orders/:id/shipment
     → metadáta zásielky (packet_id, barcode, tracking_url, paid_at)

POST /api/admin/orders/:id/shipment   (admin/warehouse)
     → vytvorí zásielku v Packete, vráti packet_id + barcode
     → idempotent: ak už existuje, vráti existujúcu

GET  /api/admin/orders/:id/shipment/label   (admin/warehouse)
     → stream PDF štítku (A6 na A4) priamo do prehliadača
```

### Workflow

1. Zákazník objedná → `/api/order` → SQLite uloží objednávku
2. Status objednávky `pending` → ty v admin paneli prepneš na `paid`
3. (Voliteľne) klikni **"Vytvoriť zásielku"** → POST na `/api/admin/orders/:id/shipment`
4. Packeta vráti `packet_id` + `barcode`
5. (Voliteľne) klikni **"Stiahnuť štítok"** → GET label PDF → vytlač → nalep na balík
6. Prepneš objednávku na `shipped`
7. Customer dostane tracking link automaticky (cez Resend email pri status change — TODO)

### Mapovanie shippingId → Packeta

| shippingId v Veelyn | Packeta `addressId` |
|---|---|
| `packeta-zbox` | point.id z widgetu (Z-BOX) |
| `packeta-pobocka` | point.id z widgetu (pobočka) |
| `packeta-kurier` | `106` (Packeta SK HD) — domáce doručenie |
| `sps-kurier` | nepoužíva Packetu (SPS direct) |

### Bezpečnosť

- **Widget API key** (`3486767127ceef1f`) je verejný — v gite, v `script.js`, vidí ho každý kto otvorí page source. Slúži len na identifikáciu merchanta widgetu.
- **REST API password** (`3486767127ceef1fc34cbf7458fafe09`) je TAJNÝ — NIKDY nie v gite. Drží sa v Railway env vars. Dáva backendu právo vytvoriť zásielky v tvojom mene.

Ak omylom commitneš REST password do gitu:
1. V client.packeta.com → vygeneruj nový password (starý sa zruší)
2. Aktualizuj Railway env var
3. `git rebase` alebo `git filter-branch` na vyčistenie histórie
