# Veelyn — Google Tag Manager Setup

Frontend posiela všetky analytics udalosti cez `window.dataLayer` do GTM. V kóde nie sú zapečené žiadne pixely ani GA4 ID — všetko sa nastavuje v GTM UI cez Tags + Triggers, takže môžeme pridať/odobrať trackingy bez ďalšieho deploymentu.

---

## 1. Inštalácia kontajnera

V `index.html` je placeholder `GTM-XXXXXXX` na dvoch miestach:
- `<head>` blok — main loader
- `<body>` `<noscript>` blok — fallback

Po vytvorení kontajnera na [tagmanager.google.com](https://tagmanager.google.com):
1. Skopíruj Container ID (`GTM-XXXXXXX`).
2. V repu sprav `git grep "GTM-XXXXXXX"` → nahraď oba výskyty reálnym ID.
3. Push → CF Pages redeployne do 2 min.

---

## 2. Google Consent Mode v2

Defaults sú nastavené v `<head>` PRED načítaním GTM:

| Kategória            | Default |
|----------------------|---------|
| `ad_storage`         | denied  |
| `ad_user_data`       | denied  |
| `ad_personalization` | denied  |
| `analytics_storage`  | denied  |
| `functionality_storage` | granted |
| `security_storage`   | granted |

Pri kliknutí na cookie banner sa volá `gtag('consent', 'update', …)` s mapovaním:
- `prijať všetko` → všetko `granted`
- `iba nevyhnutné` → marketing + analytics `denied`
- granulárna voľba v modale → podľa togglov

**Dôležité v GTM UI:**
- GA4 Configuration tag: nastav "Wait for consent: analytics_storage"
- Meta / Google Ads / TikTok tagy: "Wait for consent: ad_storage" + "ad_user_data" + "ad_personalization"
- Tým GTM tagy automaticky čakajú na user consent a v EU funguje **cookieless tracking** (modelled conversions) keď user odmietne.

---

## 3. dataLayer eventy

Všetky e-commerce eventy idú v GA4 Enhanced E-commerce formáte. Pre Meta/TikTok stačí v GTM UI namapovať tieto eventy na ich pixel eventy (tabuľka nižšie).

### `view_item` — otvorenie produktu (modal alebo `?vona=` URL)
```json
{
  "event": "view_item",
  "ecommerce": {
    "currency": "EUR",
    "value": 24.99,
    "items": [{
      "item_id": "moulin-rouge",
      "item_name": "VEELYN MOULIN ROUGE",
      "item_brand": "Veelyn",
      "item_variant": "veelyn",
      "item_category": "Unisex",
      "item_category2": "Dupé Maison Francis Kurkdjian",
      "price": 24.99,
      "quantity": 1
    }]
  }
}
```

### `add_to_cart` — pridanie do košíka
Rovnaký formát, `event: "add_to_cart"`, `value` = price × qty.

### `remove_from_cart` — odobratie z košíka
Rovnaké, `event: "remove_from_cart"`.

### `view_cart` — otvorenie cart drawera
Pole `items` obsahuje celý košík.

### `begin_checkout` — kliknutie na "Pokladňa"
Pole `items` = košík, `value` = total.

### `purchase` — úspešná objednávka
```json
{
  "event": "purchase",
  "ecommerce": {
    "transaction_id": "V1234",
    "value": 79.97,
    "currency": "EUR",
    "shipping": 4.99,
    "tax": 0,
    "items": [ /* … */ ]
  }
}
```

### `search` — vyhľadávanie (debounced 700 ms)
```json
{ "event": "search", "search_term": "creed aventus" }
```

### `consent_update` — user zmenil cookie preferences
```json
{ "event": "consent_update", "analytics_granted": true, "marketing_granted": false }
```

---

## 4. Mapovanie eventov pre Meta / TikTok / Google Ads

V GTM Tags UI vytvor po jednom tagu pre každý event (alebo použi GA4 GTM Recipe).

| dataLayer event | Meta Pixel | TikTok Pixel | Google Ads |
|---|---|---|---|
| `view_item` | `ViewContent` | `ViewContent` | (Remarketing) |
| `add_to_cart` | `AddToCart` | `AddToCart` | — |
| `view_cart` | (vlastný) | — | — |
| `begin_checkout` | `InitiateCheckout` | `InitiateCheckout` | — |
| `purchase` | `Purchase` | `CompletePayment` | **Conversion** (AW-XXX/label) |
| `search` | `Search` | `Search` | — |

### Meta Pixel — Custom Data mapping
- `Meta currency` → `{{DLV - ecommerce.currency}}`
- `Meta value` → `{{DLV - ecommerce.value}}`
- `Meta content_ids` → custom JS variable: `{{DLV - ecommerce.items}}.map(i => i.item_id)`
- `Meta content_type` → `product`
- `Meta num_items` → `{{DLV - ecommerce.items}}.length`

### Google Ads Conversion (purchase)
- Conversion ID: `AW-XXXXXXXXX`
- Conversion Label: vygenerovaný v Google Ads pri vytváraní konverzie
- Conversion Value: `{{DLV - ecommerce.value}}`
- Currency: EUR
- Transaction ID: `{{DLV - ecommerce.transaction_id}}` (deduplikácia)

---

## 5. Meta Conversion API (server-side)

Pre presné meranie po iOS 14.5 odporúčam pridať Meta CAPI cez backend.
Aktuálne **nie je nasadené** — chce to:
1. `META_PIXEL_ID` + `META_CAPI_TOKEN` env vars na Railway
2. Backend handler ktorý pri POST /api/order pošle Meta Purchase eventu cez Server-to-Server.

Daj vedieť keď chceš pridať — pol-hodina práce.

---

## 6. Testovanie

Pred zapnutím live tagov:

1. **GTM Preview Mode** — klikni "Preview" v GTM, otvor veelyn.sk → klikni na produkt → mal by sa zobraziť `view_item` event s ecommerce payloadom.
2. **GA4 DebugView** — v GA4 Admin → DebugView vidíš realtime eventy.
3. **Meta Events Manager → Test Events** — v Meta dashboarde Test Events tab, zadaj URL veelyn.sk a klikni na produkt — eventy by sa mali zobraziť.
4. **Google Tag Assistant** — Chrome extension, vidíš všetky GTM tagy ktoré sa spustili.

---

## 7. Checklist na deploy

- [ ] Vytvor GTM kontajner → získaj `GTM-XXXXXXX`
- [ ] Nahraď placeholder v `index.html` (2 miesta)
- [ ] V GTM UI pridaj **GA4 Configuration tag** s `G-XXXXXXX`
- [ ] Pridaj **GA4 Event tagy** pre každý event z tabuľky vyššie (alebo použi Enhanced E-commerce recipe)
- [ ] Pridaj **Meta Pixel Base Code tag** s `Pixel ID`
- [ ] Pridaj **Meta Pixel Event tagy** mapované na dataLayer eventy
- [ ] Pridaj **Google Ads Remarketing tag** + **Purchase Conversion tag**
- [ ] (Voliteľne) **TikTok Pixel + eventy**
- [ ] **Consent Mode v2 settings** v každom tagu — wait_for_update
- [ ] Test cez GTM Preview Mode
- [ ] Publish kontajner

Tým je všetko hotové. Zmeny tagov sa pridávajú/menia priamo v GTM UI bez nutnosti deploy frontendu.
