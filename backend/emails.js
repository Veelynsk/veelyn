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

const eur = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace('.', ',') + ' €';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const skDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; };
const fmtIban = (iban) => String(iban || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// ---------- spoločný obal ----------
function shell({ title, preheader = '', body, footerExtra = '' }) {
  return `<!doctype html>
<html lang="sk"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(title)}</title>
<style>
  :root{color-scheme:light dark;supported-color-schemes:light dark}
  body{margin:0;padding:0}
  a{color:${PURPLE}}
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
  <tr><td class="dim" style="padding:20px 10px 0;text-align:center;font-size:11px;line-height:1.7;color:#8a8399">
    ${footerExtra}
    ${esc(SUPPLIER.name)} · ${esc(SUPPLIER.address)}, ${esc(SUPPLIER.city)}<br>
    IČO ${esc(SUPPLIER.ico)} · DIČ ${esc(SUPPLIER.dic)} · ${esc(SUPPLIER.vatNote)}<br>
    <a href="${SITE}/" style="color:${PURPLE};text-decoration:none">www.veelyn.sk</a> · <a href="mailto:${SUPPLIER.email}" style="color:${PURPLE};text-decoration:none">${SUPPLIER.email}</a>
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
        <div class="dim" style="font-size:12px;color:#8a8399">${i.originalName ? `dupé ${esc(i.originalName)} · ` : ''}50 ml EDP · ${i.qty}×</div>
      </td>
      <td class="rule ink" style="padding:10px 0;border-bottom:1px solid #eeebf3;text-align:right;font-size:14px;font-weight:700;white-space:nowrap;color:#16121f">${eur(i.price * i.qty)}</td>
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
    ${Number(order.fee) > 0 ? line(`Poplatok — ${order.paymentMethod || ''}`, eur(order.fee)) : ''}
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
        ${kv('Správa pre prijímateľa', esc('Veelyn ' + order.id))}
        ${inv.meta?.dueDate ? kv('Splatnosť', esc(skDate(inv.meta.dueDate))) : ''}
      </td>${qr}</tr></table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="warn" style="margin:16px 0 0;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;color:#7c2d12"><tr><td style="padding:12px 14px;font-size:13.5px;line-height:1.5">
        <strong style="color:#9a3412">Dôležité: uveď variabilný symbol ${esc(inv.number)}</strong><br>
        Bez neho platbu nevieme priradiť k tvojej objednávke a odoslanie sa zdrží. Ak zaplatíš cez QR kód, vyplní sa sám.
      </td></tr></table>
      <p class="dim" style="margin:14px 0 0;font-size:13px;line-height:1.5;color:#6b6478">Zálohová faktúra č. ${esc(inv.number)} s QR kódom je aj v prílohe. Objednávku odošleme hneď po pripísaní platby — zvyčajne do 1 pracovného dňa.</p>`);
  }
  if (order.paymentId === 'cod') {
    return box(`${label('Platba pri prevzatí')}
      <div class="ink" style="font-size:26px;font-weight:800;color:#16121f">${eur(order.total)}</div>
      <p class="dim" style="margin:10px 0 0;font-size:13px;line-height:1.5;color:#6b6478">Zaplatíš kuriérovi alebo vo výdajnom mieste pri prevzatí. ${inv ? `Faktúra č. ${esc(inv.number)} je v prílohe — je to daňový doklad, odlož si ju.` : 'Faktúru ti pošleme v samostatnom e-maile.'}</p>`);
  }
  return inv ? box(`${label('Doklad')}<p class="dim" style="margin:0;font-size:13px;line-height:1.5;color:#6b6478">Faktúra č. ${esc(inv.number)} je v prílohe — je to daňový doklad, odlož si ju.</p>`) : '';
}

// ---------- doručenie ----------
function deliveryCard(order) {
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
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0 0"><tr><td class="rule" style="padding:16px 0 0;border-top:1px solid #eeebf3">
    ${label('Doručenie')}
    <div class="ink" style="font-size:14px;line-height:1.55;color:#16121f">${esc(order.shippingMethod || '')}${lines.length ? '<br>' + lines.join('<br>') : ''}</div>
  </td></tr></table>`;
}

// ---------- 1) potvrdenie objednávky + platobné údaje ----------
export function customerEmailHTML(order, inv = null, ctx = {}) {
  const first = order.customer?.firstName || '';
  const transfer = order.paymentId === 'transfer';
  const intro = transfer
    ? `Ahoj${first ? ' ' + esc(first) : ''}, ďakujeme za objednávku <strong>${esc(order.id)}</strong>. <strong>Už stačí len zaplatiť</strong> — pošli <strong>${eur(order.total)}</strong> na účet nižšie${inv ? ` a nezabudni uviesť variabilný symbol <strong>${esc(inv.number)}</strong>` : ''}, najlepšie ešte dnes. Hneď po pripísaní platby ju zabalíme a odošleme do 1 pracovného dňa.`
    : `Ahoj${first ? ' ' + esc(first) : ''}, objednávku <strong>${esc(order.id)}</strong> sme prijali. Zabalíme ju a odošleme do 1 pracovného dňa.`;
  const body = `
    ${h1('Ďakujeme za objednávku')}
    ${p(intro)}
    ${itemsTable(order)}
    ${paymentCard(order, inv, ctx)}
    ${deliveryCard(order)}
    ${p(`Otázky? Stačí odpovedať na tento e-mail alebo napísať na <a href="mailto:${SUPPLIER.email}" style="color:${PURPLE}">${SUPPLIER.email}</a>.`, 'margin:22px 0 0;font-size:13px;color:#6b6478')}`;
  return shell({
    title: `Objednávka ${order.id} prijatá`,
    // Náhľad v zozname schránky (mobil ukáže ~90 znakov) — pokračuje tam,
    // kde končí predmet: koľko, kam a dokedy. Žiadne opakovanie predmetu.
    preheader: transfer
      ? `Pošli ${eur(order.total)}, variabilný symbol ${inv ? inv.number : order.id}${inv?.meta?.dueDate ? `, splatnosť ${skDate(inv.meta.dueDate)}` : ''}. Balík odosielame hneď po pripísaní platby.`
      : order.paymentId === 'cod'
        ? `Zaplatíš ${eur(order.total)} pri prevzatí. Balík pripravujeme a odošleme do 1 pracovného dňa.`
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
      ${p(`${hi} objednávku <strong>${esc(order.id)}</strong> sme zrušili a peniaze ti vraciame.`)}
      ${p(cod
        ? `Ide o <strong>${eur(order.total)}</strong>. Keďže si platil pri prevzatí, napíš nám prosím číslo účtu (IBAN) odpoveďou na tento e-mail — peniaze odošleme do 3 pracovných dní.`
        : `Sumu <strong>${eur(order.total)}</strong> posielame späť tou istou cestou, akou si platil${order.paymentMethod ? ` (${esc(String(order.paymentMethod).toLowerCase())})` : ''}. Na účte ju uvidíš zvyčajne do 3 pracovných dní, najneskôr do 14.`)}
      ${p('V prílohe je doklad o vrátení peňazí — potrebuje ho len účtovníctvo, ty s ním nemusíš robiť nič.', 'font-size:13px;color:#6b6478')}
      ${p('Mrzí nás, že to nevyšlo. Ak sa niečo pokazilo alebo si chceš vybrať inú vôňu, napíš nám — radi pomôžeme.', 'font-size:13px;color:#6b6478')}`;
  } else if (kind === 'proforma') {
    const inv = { number, kind, meta: { dueDate: ctx.dueDate } };
    title = `Zálohová faktúra č. ${number}`;
    body = `${h1('Platobné údaje k objednávke')}
      ${p(`${hi} posielame zálohovú faktúru <strong>č. ${esc(number)}</strong> k objednávke <strong>${esc(order.id)}</strong>.`)}
      ${paymentCard(order, inv, ctx)}`;
  } else {
    title = ctx.paid ? `Platba prijatá — faktúra č. ${number}` : `Faktúra č. ${number}`;
    body = `${h1(ctx.paid ? 'Platbu sme prijali, ďakujeme' : 'Faktúra k objednávke')}
      ${p(`${hi} ${ctx.paid ? `platbu za objednávku <strong>${esc(order.id)}</strong> sme prijali — balíme a posielame. ` : ''}V prílohe je faktúra <strong>č. ${esc(number)}</strong>${ctx.paid ? ' (daňový doklad, odlož si ju)' : ' — je to daňový doklad, odlož si ju'}.`)}
      ${itemsTable(order)}`;
  }
  body += p(`Otázky? Stačí odpovedať na tento e-mail alebo napísať na <a href="mailto:${SUPPLIER.email}" style="color:${PURPLE}">${SUPPLIER.email}</a>.`, 'margin:22px 0 0;font-size:13px;color:#6b6478');
  return shell({ title, preheader: pre || `${title} · objednávka ${order.id}`, body });
}

// ---------- 3) notifikácia pre majiteľa ----------
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
