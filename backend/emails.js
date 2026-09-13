// E-mailové šablóny Veelyn (HTML). Jeden vizuálny systém pre všetky maily:
// fialová hlavička, biela karta, platobná karta s QR kódom. Navrhnuté tak,
// aby prežili aj Gmail dark mode (Gmail na iOS farby invertuje sám —
// preto svetlé pozadia + sýta fialová, žiadne veľmi tmavé pozadia).
//
// customerEmailHTML(order, inv, ctx)   potvrdenie objednávky + platobné údaje
// invoiceEmailHTML(order, number, kind, ctx)  udalostné maily (platba prijatá,
//                                             dobropis, dopos. zálohová faktúra)
// adminEmailHTML(order, ctx)          notifikácia pre majiteľa
//   ctx: { iban, qrUrl, adminUrl, paid }

import { SUPPLIER } from './invoice-pdf.js';

const SITE = 'https://www.veelyn.sk';
const PURPLE = '#6d28d9';
const PURPLE_DARK = '#4c1d95';

// Pevná medzera pred € — Gmail na mobile inak zalomí sumu medzi číslo a menu
// („74,97“ / „€“ na dvoch riadkoch) a žiadne CSS white-space to nezachráni.
const eur = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace('.', ',') + ' €';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const skDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; };
const fmtIban = (iban) => String(iban || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
// Skrátenie dlhých názvov originálov, aby sa podnadpis položky zmestil na
// jeden riadok aj na úzkom mobile (napr. „Vanilla Royale Sugared Patchouli 64“).
const short = (s, n = 22) => { const t = String(s || ''); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// ---------- spoločný obal ----------
function shell({ title, preheader = '', body, footerExtra = '' }) {
  return `<!doctype html>
<html lang="sk"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(title)}</title>
<style>
  :root{color-scheme:light dark;supported-color-schemes:light dark}
  body{margin:0;padding:0}
  a{color:${PURPLE}}
  /* Gmail/iOS si samé prelinkujú adresu a IČO — necháme ich vyzerať ako text */
  .foot a[href^="http"],.foot a[href^="mailto"]{color:${PURPLE}!important;text-decoration:none!important}
  /* Gmail/iOS si samé prelinkujú adresu na mapy — nech to vyzerá ako text */
  a[href*="google.com/maps"]:not(.maplink),a[href*="maps.apple"]:not(.maplink),a[x-apple-data-detectors],.foot a:not([href^="http"]):not([href^="mailto"]){color:inherit!important;text-decoration:none!important;font-weight:inherit!important;pointer-events:none}
  @media (prefers-color-scheme: dark){
    .bg{background:#15121c!important}
    .card{background:#1f1a2a!important}
    .ink{color:#f4f0fb!important}
    .dim{color:#b9b1c9!important}
    .soft{background:#2a2140!important;border-color:#4a3a78!important}
    .rule{border-color:#352d45!important}
    .warn{background:#3b2a10!important;border-color:#f59e0b!important;color:#fde68a!important}
    .warn strong{color:#fef3c7!important}
  }
</style></head>
<body class="bg" style="margin:0;padding:0;background:#f4f2f9;${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="bg" style="background:#f4f2f9"><tr><td align="center" style="padding:24px 12px 32px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px">
  <tr><td style="background:${PURPLE_DARK};border-radius:18px 18px 0 0;padding:0;text-align:center;line-height:0">
    <!-- hlavička ako obrázok: Gmail v dark mode obrázky neinvertuje, takže ostane fialová -->
    <img src="${SITE}/email-header-v2.png" width="580" height="128" alt="Veelyn.sk — ${esc(SUPPLIER.tagline)}" style="display:block;width:100%;max-width:580px;height:auto;border:0;border-radius:18px 18px 0 0;font-family:Georgia,serif;font-style:italic;font-size:28px;line-height:128px;color:#ffffff">
  </td></tr>
  <tr><td class="card ink" style="background:#ffffff;color:#16121f;padding:28px 28px 24px;border-radius:0 0 18px 18px">
    ${body}
  </td></tr>
  <tr><td class="dim foot" style="padding:24px 10px 0;text-align:center;font-size:11.5px;line-height:1.9;color:#8a8399">
    ${footerExtra}
    <span style="font-weight:700">${esc(SUPPLIER.name)}</span><br>
    ${esc(SUPPLIER.address)}<br>
    ${esc(String(SUPPLIER.city).split('—')[0].trim())}<br>
    IČO ${esc(SUPPLIER.ico)} &nbsp;·&nbsp; DIČ ${esc(SUPPLIER.dic)}<br>
    ${esc(SUPPLIER.vatNote)}<br>
    <a href="${SITE}/" style="color:${PURPLE};text-decoration:none">www.veelyn.sk</a> &nbsp;·&nbsp; <a href="mailto:${SUPPLIER.email}" style="color:${PURPLE};text-decoration:none">${SUPPLIER.email}</a>
    <div style="margin-top:14px;font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:${PURPLE}">Made in Slovakia &nbsp;✦&nbsp; Hated in Paris</div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const h1 = (t) => `<h1 class="ink" style="margin:0 0 10px;font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-.01em;color:#16121f">${esc(t)}</h1>`;
const p = (html, extra = '') => `<p class="ink" style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#16121f;${extra}">${html}</p>`;
const label = (t) => `<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:${PURPLE};margin:0 0 8px">${esc(t)}</div>`;

// ---------- položky objednávky ----------
function itemsTable(order) {
  const rows = (order.items || []).map(i => {
    const img = i.id ? `<img src="${SITE}/images/veelyn/${esc(i.id)}.png" width="52" height="52" alt="" style="display:block;width:52px;height:52px;border-radius:10px;object-fit:cover;background:#f1edf8">` : '';
    return `<tr>
      <td class="rule" style="padding:10px 0;border-bottom:1px solid #eeebf3;width:52px">${img}</td>
      <td class="rule ink" style="padding:10px 12px;border-bottom:1px solid #eeebf3;font-size:14px;line-height:1.4;color:#16121f">
        <strong>${esc(i.name)}</strong>
        <div class="dim" style="font-size:12px;color:#8a8399;white-space:nowrap">${i.originalName ? `dupé ${esc(short(i.originalName))} · ` : ''}50 ml</div>
      </td>
      <td class="rule ink" style="padding:10px 0;border-bottom:1px solid #eeebf3;text-align:right;font-size:14px;font-weight:700;white-space:nowrap;color:#16121f">${i.qty > 1 ? `<span class="dim" style="font-weight:400;color:#8a8399">${i.qty}× </span>` : ''}${eur(i.price * i.qty)}</td>
    </tr>`;
  }).join('');
  const line = (k, v, opts = {}) => `<tr><td colspan="2" class="${opts.cls || 'dim'}" style="padding:5px 12px 0 0;text-align:right;font-size:${opts.big ? 16 : 13}px;${opts.big ? 'font-weight:800;padding-top:10px;' : ''}color:${opts.color || '#8a8399'}">${esc(k)}</td><td class="${opts.cls || 'dim'}" style="padding:5px 0 0;text-align:right;font-size:${opts.big ? 20 : 13}px;white-space:nowrap;${opts.big ? 'font-weight:800;padding-top:10px;' : ''}color:${opts.color || '#8a8399'}">${v}</td></tr>`;
  const subtotal = Number(order.subtotal) || (order.items || []).reduce((s, i) => s + i.price * i.qty, 0);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
    ${rows}
    ${line('Medzisúčet', eur(subtotal))}
    ${Number(order.bundleDiscount) > 0 ? line('Akcia 3+1 zadarmo', '−' + eur(order.bundleDiscount), { color: '#15803d', cls: '' }) : ''}
    ${Number(order.couponDiscount) > 0 ? line(`Zľavový kód ${order.couponCode || ''}`, '−' + eur(order.couponDiscount), { color: '#15803d', cls: '' }) : ''}
    ${line('Doprava', Number(order.shipping) > 0 ? eur(order.shipping) : 'zadarmo')}
    ${Number(order.fee) > 0 ? line(String(order.paymentMethod || 'Dobierka'), eur(order.fee)) : ''}
    ${line('Spolu', eur(order.total), { big: true, color: '#16121f', cls: 'ink' })}
  </table>`;
}

// ---------- platobná karta ----------
function paymentCard(order, inv, ctx = {}) {
  const box = (inner) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="soft" style="margin:22px 0 0;background:#f5f1ff;border:1px solid #e4dbff;border-radius:14px"><tr><td style="padding:18px 20px">${inner}</td></tr></table>`;
  const kv = (k, v) => `<div style="margin-top:8px"><div class="dim" style="font-size:11px;color:#8a8399">${esc(k)}</div><div class="ink" style="font-size:15px;font-weight:700;color:#16121f;letter-spacing:.02em">${v}</div></div>`;

  if (order.paymentId === 'transfer') {
    if (!inv) {
      return box(`${label('Platba prevodom')}
        <div class="ink" style="font-size:26px;font-weight:800;color:#16121f">${eur(order.total)}</div>
        ${ctx.iban ? kv('IBAN', esc(fmtIban(ctx.iban))) : ''}
        <p class="dim" style="margin:12px 0 0;font-size:13px;line-height:1.5;color:#6b6478">Zálohovú faktúru s variabilným symbolom a QR kódom na platbu ti pošleme v samostatnom e-maile o chvíľu.</p>`);
    }
    const qr = ctx.qrUrl
      ? `<td width="140" valign="top" style="padding-left:16px"><img src="${esc(ctx.qrUrl)}" width="132" height="132" alt="QR kód na platbu" style="display:block;width:132px;height:132px;border-radius:10px;background:#fff;padding:4px;box-sizing:border-box"><div class="dim" style="margin-top:6px;text-align:center;font-size:10.5px;line-height:1.35;color:#8a8399">PAY by square — naskenuj v bankovej appke</div></td>`
      : '';
    return box(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      <td valign="top">
        ${label('Platba prevodom')}
        <div class="ink" style="font-size:28px;font-weight:800;line-height:1;color:#16121f">${eur(order.total)}</div>
        ${ctx.iban ? kv('IBAN', `<span style="font-size:13.5px;letter-spacing:0">${esc(fmtIban(ctx.iban))}</span>`) + kv('Banka', 'Fio banka') : ''}
        ${kv('Variabilný symbol', esc(inv.number))}
      </td>${qr}</tr></table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="warn" style="margin:16px 0 0;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;color:#7c2d12"><tr><td style="padding:12px 14px;font-size:13.5px;line-height:1.5">
        <strong style="color:#9a3412">Nezabudni na variabilný symbol ${esc(inv.number)}</strong><br>
        Bez neho platbu nespárujeme s tvojou objednávkou a odoslanie sa zdrží. Cez QR kód sa vyplní sám.
      </td></tr></table>
      <p class="dim" style="margin:14px 0 0;font-size:13px;line-height:1.5;color:#6b6478">Zálohovú faktúru s QR kódom nájdeš aj v prílohe. Len čo platba dorazí, vôňa vyráža — zvyčajne do 1 pracovného dňa.</p>`);
  }
  if (order.paymentId === 'cod') {
    return box(`${label('Platba pri prevzatí')}
      <div class="ink" style="font-size:26px;font-weight:800;color:#16121f">${eur(order.total)}</div>
      <p class="dim" style="margin:10px 0 0;font-size:13px;line-height:1.5;color:#6b6478">Peniaze si nachystaj až k prevzatiu — kuriérovi alebo vo výdajni. ${inv ? `V prílohe nájdeš faktúru č. ${esc(inv.number)}.` : 'Faktúru ti pošleme v samostatnom e-maile.'}</p>`);
  }
  // Platba kartou: zákazník už nič nerieši. Žiadna dlaždica o doklade —
  // faktúru vidí ako prílohu a „daňový doklad“ súkromného človeka nezaujíma.
  return '';
}

// ---------- doručenie ----------
function deliveryCard(order, opts = {}) {
  const c = order.customer || {};
  const lines = [];
  if (order.pickupPoint?.name) {
    lines.push(`<strong>${esc(order.pickupPoint.name)}</strong>`);
    if (order.pickupPoint.address) lines.push(esc(order.pickupPoint.address));
  } else {
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
    if (name) lines.push(`<strong>${esc(name)}</strong>`);
    if (c.street || c.address) lines.push(esc(c.street || c.address));
    const zc = [c.zip || c.postalCode, c.city].filter(Boolean).join(' ');
    if (zc) lines.push(esc(zc));
  }
  if (c.phone) lines.push(esc(c.phone));
  // Spôsob platby musí byť vidieť v KAŽDOM potvrdení. Pri prevode a dobierke to
  // už povie platobná karta vyššie — tam by tento riadok tú istú vec opakoval
  // druhýkrát, takže ho pridávame len keď karta nie je (platba kartou).
  const pay = opts.showPayment
    ? { how: String(order.paymentMethod || 'Karta'), state: `Zaplatené — ${eur(order.total)}` }
    : null;
  const cell = (l, inner) => `<tr><td class="rule" style="padding:16px 0 0;border-top:1px solid #eeebf3">
    ${label(l)}
    <div class="ink" style="font-size:14px;line-height:1.55;color:#16121f">${inner}</div>
  </td></tr>`;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0 0">
    ${cell('Doručenie', `${esc(order.shippingMethod || '')}${lines.length ? '<br>' + lines.join('<br>') : ''}`)}
    ${pay ? cell('Platba', `${esc(pay.how)}<br><span class="dim" style="color:#8a8399">${pay.state}</span>`) : ''}
  </table>`;
}

// ---------- 1) potvrdenie objednávky + platobné údaje ----------
export function customerEmailHTML(order, inv = null, ctx = {}) {
  const first = order.customer?.firstName || '';
  const transfer = order.paymentId === 'transfer';
  const intro = transfer
    ? `Ahoj${first ? ' ' + esc(first) : ''}, ďakujeme za objednávku <strong>${esc(order.id)}</strong>. <strong>Už stačí len zaplatiť</strong> — pošli <strong>${eur(order.total)}</strong> na účet nižšie${inv ? ` a nezabudni na variabilný symbol <strong>${esc(inv.number)}</strong>` : ''}. Hneď po pripísaní platby ju zabalíme a odošleme do 1 pracovného dňa.`
    : order.paymentId === 'cod'
      ? `Ahoj${first ? ' ' + esc(first) : ''}, ďakujeme za objednávku <strong>${esc(order.id)}</strong>. Od teba teraz netreba nič — <strong>zaplatíš až pri prevzatí</strong>. My medzitým balíme a do 1 pracovného dňa posielame.`
      : `Ahoj${first ? ' ' + esc(first) : ''}, ďakujeme za objednávku <strong>${esc(order.id)}</strong>. Zaplatené, vybavené — <strong>balíme a posielame do 1 pracovného dňa</strong>.`;
  const payCard = paymentCard(order, inv, ctx);
  const body = `
    ${h1('Ďakujeme za objednávku')}
    ${p(intro)}
    ${itemsTable(order)}
    ${payCard}
    ${deliveryCard(order, { showPayment: !payCard })}
    ${p(`Otázky? Napíš nám na <a href="mailto:${SUPPLIER.email}" style="color:${PURPLE}">${SUPPLIER.email}</a>.`, 'margin:22px 0 0;font-size:13px;color:#6b6478')}`;
  return shell({
    title: `Objednávka ${order.id} prijatá`,
    // Náhľad v zozname schránky (mobil ukáže ~90 znakov) — pokračuje tam,
    // kde končí predmet: koľko, kam a dokedy. Žiadne opakovanie predmetu.
    preheader: transfer
      ? `Pošli ${eur(order.total)}, variabilný symbol ${inv ? inv.number : order.id}${inv?.meta?.dueDate ? `, splatnosť ${skDate(inv.meta.dueDate)}` : ''}. Balík odosielame hneď po pripísaní platby.`
      : order.paymentId === 'cod'
        ? `Objednávku ${order.id} za ${eur(order.total)} sme prijali. Balík odosielame do 1 pracovného dňa, platíš pri prevzatí.`
        : `Objednávku ${order.id} za ${eur(order.total)} sme prijali. Balík pripravujeme a odošleme do 1 pracovného dňa.`,
    body,
    footerExtra: `14 dní na vrátenie · doprava zadarmo nad 40 €<br>`,
  });
}

// ---------- 2) udalostné maily: platba prijatá / dobropis / zálohová faktúra ----------
export function invoiceEmailHTML(order, number, kind, ctx = {}) {
  const first = order.customer?.firstName || '';
  const hi = `Ahoj${first ? ' ' + esc(first) : ''},`;
  let title, body, pre;
  if (kind === 'credit') {
    // Píšeme človeku, nie firme: žiadny „dobropis“ v nadpise ani v prvej vete.
    const cod = order.paymentId === 'cod';
    title = `Objednávka ${order.id} zrušená`;
    pre = cod
      ? `Peniaze ti vrátime — pošli nám číslo účtu a ${eur(order.total)} odošleme do 3 pracovných dní.`
      : `Peniaze ti vraciame — ${eur(order.total)} sa vráti na pôvodný spôsob platby, zvyčajne do 3 pracovných dní.`;
    body = `${h1('Objednávka zrušená')}
      ${p(`${hi} objednávka <strong>${esc(order.id)}</strong> je zrušená — peniaze ti vraciame.`)}
      ${p(cod
        ? `Ide o <strong>${eur(order.total)}</strong>. Keďže si platil pri prevzatí, napíš nám prosím číslo účtu (IBAN) odpoveďou na tento e-mail — peniaze odošleme do 3 pracovných dní.`
        : `Sumu <strong>${eur(order.total)}</strong> posielame späť tou istou cestou, akou si platil${order.paymentMethod ? ` (${esc(String(order.paymentMethod).toLowerCase())})` : ''}. Na účte ju uvidíš zvyčajne do 3 pracovných dní, najneskôr do 14.`)}
      ${p('V prílohe nájdeš doklad o vrátení peňazí — potrebuje ho len účtovníctvo, ty s ním nemusíš robiť nič.', 'font-size:13px;color:#6b6478')}
      ${p('Mrzí nás, že to nevyšlo. Ak si to len rozmyslel alebo ťa láka iná vôňa, napíš — vyberieme spolu.', 'font-size:13px;color:#6b6478')}`;
  } else if (kind === 'proforma') {
    // Aj keď je v prílohe zálohová faktúra, pre zákazníka je to stále
    // potvrdenie objednávky — nie „posielame vám doklad“.
    const inv = { number, kind, meta: { dueDate: ctx.dueDate } };
    title = `Objednávka ${order.id} — platobné údaje`;
    pre = `Pošli ${eur(order.total)}, variabilný symbol ${number}. Balík odosielame hneď po pripísaní platby.`;
    body = `${h1('Ďakujeme za objednávku')}
      ${p(`${hi} objednávku <strong>${esc(order.id)}</strong> máme. <strong>Už stačí len zaplatiť</strong> — údaje sú nižšie a nezabudni na variabilný symbol <strong>${esc(number)}</strong>. Hneď po pripísaní platby ju zabalíme a odošleme do 1 pracovného dňa.`)}
      ${paymentCard(order, inv, ctx)}`;
  } else {
    title = ctx.paid ? `Platba prijatá — faktúra č. ${number}` : `Faktúra č. ${number}`;
    body = `${h1(ctx.paid ? 'Peniaze dorazili' : 'Faktúra k objednávke')}
      ${p(ctx.paid
        ? `${hi} platbu vidíme na účte — ďakujeme. <strong>Voňavky práve balíme</strong> a posielame na cestu. V prílohe nájdeš faktúru <strong>č. ${esc(number)}</strong>.`
        : `${hi} v prílohe nájdeš faktúru <strong>č. ${esc(number)}</strong> k objednávke <strong>${esc(order.id)}</strong> — posielame ti ju dodatočne, aby si mal doklady kompletné.`)}
      ${itemsTable(order)}`;
  }
  body += p(`Otázky? Napíš nám na <a href="mailto:${SUPPLIER.email}" style="color:${PURPLE}">${SUPPLIER.email}</a>.`, 'margin:22px 0 0;font-size:13px;color:#6b6478');
  return shell({ title, preheader: pre || `${title} · objednávka ${order.id}`, body });
}

// ---------- 3) zásielka odoslaná + sledovanie ----------
// ctx: { trackingUrl, barcode }  — bez trackingu sa blok so sledovaním vynechá
export function shippedEmailHTML(order, ctx = {}) {
  const first = order.customer?.firstName || '';
  const c = order.customer || {};
  // Výdajné miesto dostane vlastný blok s odkazom do máp — zámerne bez mena
  // dopravcu, nech text sedí aj keď pribudne iný kuriér.
  const pp = order.pickupPoint || null;
  const pickup = pp?.name;
  const ppAddr = pp ? [pp.street, [pp.zip, pp.city].filter(Boolean).join(' ').trim()].filter(Boolean).join(', ') : '';
  const mapQ = pp ? encodeURIComponent([pp.name, pp.street, pp.zip, pp.city].filter(Boolean).join(', ')) : '';
  const where = pickup
    ? ''
    : `Kuriér ti ju bude doručovať na tvoju adresu — ozve sa ti vopred, zvyčajne SMS-kou.`;
  const pickupBlock = pp ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="soft" style="margin:22px 0 0;background:#f5f1ff;border:1px solid #e4dbff;border-radius:14px"><tr><td style="padding:18px 20px">
      ${label('Vyzdvihneš si ju na')}
      <a class="maplink" href="https://www.google.com/maps/search/?api=1&amp;query=${mapQ}" style="display:block;font-size:16px;font-weight:800;line-height:1.35;color:${PURPLE};text-decoration:none">${esc(pp.name)} →</a>
      ${ppAddr ? `<div class="dim" style="margin-top:5px;font-size:13px;color:#6b6478">${esc(ppAddr)}</div>` : ''}
      <p class="dim" style="margin:12px 0 0;font-size:13px;line-height:1.5;color:#6b6478">Keď tam balík dorazí, príde ti kód na vyzdvihnutie. Odkaz vyššie ti miesto ukáže na mape.</p>
    </td></tr></table>` : '';
  const track = ctx.trackingUrl ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="soft" style="margin:22px 0 0;background:#f5f1ff;border:1px solid #e4dbff;border-radius:14px"><tr><td style="padding:18px 20px">
      ${label('Kde je práve teraz')}
      ${ctx.barcode ? `<div class="ink" style="font-size:17px;font-weight:800;letter-spacing:.04em;color:#16121f">${esc(ctx.barcode)}</div>` : ''}
      <div style="margin-top:14px">
        <a href="${esc(ctx.trackingUrl)}" style="display:inline-block;background:${PURPLE};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:10px">Pozri, kde je →</a>
      </div>
      <p class="dim" style="margin:12px 0 0;font-size:12.5px;line-height:1.5;color:#6b6478">Prvé záznamy sa v sledovaní objavia zvyčajne do pár hodín od odoslania.</p>
    </td></tr></table>` : '';
  const body = `
    ${h1('Vôňa je na ceste')}
    ${p(`Ahoj${first ? ' ' + esc(first) : ''}, objednávku <strong>${esc(order.id)}</strong> sme práve poslali na cestu.${where ? ' ' + where : ''}`)}
    ${pickupBlock}
    ${track}
    ${order.paymentId === 'cod' ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="warn" style="margin:22px 0 0;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;color:#7c2d12"><tr><td style="padding:12px 14px;font-size:13.5px;line-height:1.5">
      <strong style="color:#9a3412">Priprav si ${eur(order.total)} na dobierku</strong><br>
      Platíš až pri prevzatí — ${pickup ? 'vo výdajni' : 'kuriérovi'}, kartou aj v hotovosti.
    </td></tr></table>` : ''}
    ${p('Čo je v balíku', 'margin:24px 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:#6b6478')}
    ${itemsTable(order)}
    ${p('Do 1–2 pracovných dní ti zavonia doma.', 'margin:22px 0 0;font-size:13px;color:#6b6478')}
    ${p(`Otázky? Napíš nám na <a href="mailto:${SUPPLIER.email}" style="color:${PURPLE}">${SUPPLIER.email}</a>.`, 'margin:4px 0 0;font-size:13px;color:#6b6478')}`;
  return shell({
    title: `Objednávka ${order.id} je na ceste`,
    preheader: ctx.barcode
      ? `Sledovacie číslo ${ctx.barcode} · ${pickup ? 'vyzdvihnutie na výdajnom mieste' : 'doručenie kuriérom'} do 1–2 pracovných dní.`
      : `${pickup ? 'Vyzdvihneš si ju na výdajnom mieste' : 'Kuriér ti ju doručí'} do 1–2 pracovných dní.`,
    body,
  });
}

// ---------- 4) notifikácia pre majiteľa ----------
export function adminEmailHTML(order, ctx = {}) {
  const c = order.customer || {};
  const row = (k, v) => `<tr><td class="dim" style="padding:4px 12px 4px 0;font-size:13px;color:#8a8399;white-space:nowrap;vertical-align:top">${esc(k)}</td><td class="ink" style="padding:4px 0;font-size:13px;color:#16121f">${v}</td></tr>`;
  const body = `${h1(`Nová objednávka ${order.id}`)}
    ${p(`<strong style="font-size:22px">${eur(order.total)}</strong> · ${esc(order.paymentMethod || '')} · ${esc(order.shippingMethod || '')}`)}
    ${itemsTable(order)}
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:18px 0 0">
      ${row('Zákazník', `<strong>${esc([c.firstName, c.lastName].filter(Boolean).join(' '))}</strong>`)}
      ${row('E-mail', `<a href="mailto:${esc(c.email || '')}" style="color:${PURPLE}">${esc(c.email || '')}</a>`)}
      ${c.phone ? row('Telefón', esc(c.phone)) : ''}
      ${row('Adresa', esc([c.street || c.address, [c.zip || c.postalCode, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')))}
      ${order.pickupPoint?.name ? row('Výdajné miesto', esc(order.pickupPoint.name)) : ''}
      ${order.note ? row('Poznámka', esc(order.note)) : ''}
    </table>
    ${ctx.adminUrl ? `<p style="margin:24px 0 0"><a href="${esc(ctx.adminUrl)}" style="display:inline-block;background:${PURPLE};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px">Otvoriť v admine →</a></p>` : ''}`;
  return shell({ title: `Nová objednávka ${order.id} (${eur(order.total)})`, preheader: `${[c.firstName, c.lastName].filter(Boolean).join(' ')} · ${eur(order.total)} · ${order.paymentMethod || ''}`, body });
}
