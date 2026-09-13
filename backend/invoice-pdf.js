// Vlastný generátor faktúr Veelyn — žiadna externá služba.
// PDF cez pdfkit (DejaVu fonty kvôli slovenskej diakritike), platobný
// QR kód podľa slovenského štandardu PAY by square (bysquare + qrcode).
// Vždy PRESNE JEDNA strana A4: všetko sa kreslí na absolútne súradnice,
// päta je pripnutá k spodnému okraju (žiadny automatický prechod na
// ďalšiu stranu).
//
// generateInvoicePdf(order, meta) → Promise<Buffer>
//   meta: {
//     number        'RRRRMMCCCC'
//     kind          'proforma' | 'regular' | 'credit'
//     issuedDate    'YYYY-MM-DD'
//     deliveryDate  'YYYY-MM-DD'
//     dueDate       'YYYY-MM-DD'
//     paymentLabel  'Bankový prevod' | 'Dobierka' | …
//     iban          IBAN dodávateľa (env BANK_IBAN) — bez neho sa QR vynechá
//     paidAt        timestamp | null — ostrá faktúra po úhrade dostane pečiatku
//     refProforma   číslo zálohovej faktúry (na ostrej po úhrade)
//     refInvoice    číslo faktúry (na dobropise)
//     reason        dôvod dobropisu
//   }
// paymentQrPng(meta, amount) → Promise<Buffer|null>  (PNG PAY by square)

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { encode as bysquareEncode, PaymentOptions } from 'bysquare/pay';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SUPPLIER = {
  name: 'Vitaz Capital s. r. o.',
  brand: 'VEELYN',
  tagline: 'Dizajnérske vône, bez dizajnérskej ceny',
  address: 'Karpatské námestie 7770/10A',
  city: '831 06 Bratislava — mestská časť Rača',
  country: 'Slovenská republika',
  ico: '56 181 001',
  dic: '2122243706',
  register: 'OR Mestského súdu Bratislava III, odd. Sro, vl. č. 192114/B',
  email: 'info@veelyn.sk',
  web: 'www.veelyn.sk',
  vatNote: 'Dodávateľ nie je platiteľom DPH.',
};

const FONT = resolve(__dirname, 'fonts/DejaVuSans.ttf');
const FONT_BOLD = resolve(__dirname, 'fonts/DejaVuSans-Bold.ttf');

const PURPLE = '#6d28d9';
const PURPLE_DARK = '#4c1d95';
const LAVENDER = '#f5f1ff';
const LAVENDER_LINE = '#e4dbff';
const INK = '#16121f';
const DIM = '#6b6478';
const LINE = '#e6e3ec';
const GREEN = '#15803d';
const RED = '#dc2626';

const eur = (n) => Number(n || 0).toFixed(2).replace('.', ',') + ' €';
const skDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; };
const fmtIban = (iban) => String(iban || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

export async function paymentQrPng(meta, amount) {
  if (!meta.iban) return null;
  try {
    const qrstring = await bysquareEncode({
      payments: [{
        type: PaymentOptions.PaymentOrder,
        amount: Math.round(amount * 100) / 100,
        variableSymbol: String(meta.number),
        currencyCode: 'EUR',
        paymentNote: `Veelyn ${meta.orderId || ''}`.trim(),
        beneficiary: { name: SUPPLIER.name },
        bankAccounts: [{ iban: String(meta.iban).replace(/\s+/g, '') }],
      }],
    });
    return await QRCode.toBuffer(qrstring, { type: 'png', width: 360, margin: 2 });
  } catch (e) {
    console.warn('[INVOICE-PDF] QR generation failed:', e.message);
    return null;
  }
}

export async function generateInvoicePdf(order, meta) {
  const proforma = meta.kind === 'proforma';
  const credit = meta.kind === 'credit';
  const paid = !!meta.paidAt && !proforma && !credit;
  const sign = credit ? -1 : 1;
  const c = order.customer || {};
  const title = credit ? 'DOBROPIS' : proforma ? 'ZÁLOHOVÁ FAKTÚRA' : 'FAKTÚRA';
  const showQr = !!meta.iban && !credit && !paid;
  const qrPng = showQr ? await paymentQrPng({ ...meta, orderId: order.id }, order.total) : null;

  const PAGE_W = 595.28, PAGE_H = 841.89;
  const L = 44, W = PAGE_W - 2 * L;
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 0, bottom: 0, left: L, right: L },
    autoFirstPage: true,
    info: { Title: `${title} ${meta.number}`, Author: SUPPLIER.name },
  });
  doc.registerFont('R', FONT);
  doc.registerFont('B', FONT_BOLD);

  const chunks = [];
  doc.on('data', (d) => chunks.push(d));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  const T = (str, x, y, o = {}) => doc.text(String(str ?? ''), x, y, { lineBreak: false, ...o });

  // ---------- hlavička (farebný pás) ----------
  const grad = doc.linearGradient(0, 0, PAGE_W, 0).stop(0, PURPLE_DARK).stop(1, PURPLE);
  doc.rect(0, 0, PAGE_W, 104).fill(grad);
  doc.font('B').fontSize(26).fillColor('#ffffff'); T('VEELYN', L, 30, { characterSpacing: 3 });
  doc.font('R').fontSize(8.5).fillColor('#e9ddff'); T(SUPPLIER.tagline + ' · ' + SUPPLIER.web, L, 64);
  doc.font('B').fontSize(13).fillColor('#ffffff'); T(title, L, 30, { width: W, align: 'right', characterSpacing: 1.5 });
  doc.font('B').fontSize(20).fillColor('#ffffff'); T(`č. ${meta.number}`, L, 50, { width: W, align: 'right' });
  doc.font('R').fontSize(8.5).fillColor('#e9ddff');
  T(credit ? 'Opravný doklad' : proforma ? 'Nie je daňovým dokladom' : 'Daňový doklad', L, 78, { width: W, align: 'right' });

  // ---------- dodávateľ / odberateľ ----------
  const cardY = 124, cardH = 108, gap = 14, cardW = (W - gap) / 2;
  const card = (x, label) => {
    doc.roundedRect(x, cardY, cardW, cardH, 8).lineWidth(0.8).strokeColor(LINE).stroke();
    doc.font('B').fontSize(7.5).fillColor(PURPLE); T(label, x + 14, cardY + 12, { characterSpacing: 1.2 });
  };
  card(L, 'DODÁVATEĽ');
  doc.font('B').fontSize(10.5).fillColor(INK); T(SUPPLIER.name, L + 14, cardY + 27);
  doc.font('R').fontSize(8.5).fillColor(INK);
  T(SUPPLIER.address, L + 14, cardY + 43);
  T(SUPPLIER.city, L + 14, cardY + 55);
  T(`IČO ${SUPPLIER.ico}   ·   DIČ ${SUPPLIER.dic}`, L + 14, cardY + 67);
  doc.fillColor(DIM).fontSize(7.5);
  T('OR MS Bratislava III, odd. Sro, vl. č. 192114/B', L + 14, cardY + 80);
  T(SUPPLIER.email + '  ·  ' + SUPPLIER.web, L + 14, cardY + 92);

  const R = L + cardW + gap;
  card(R, 'ODBERATEĽ');
  doc.font('B').fontSize(10.5).fillColor(INK);
  T([c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || '', R + 14, cardY + 27);
  doc.font('R').fontSize(8.5).fillColor(INK);
  let cy = cardY + 43;
  const street = c.street || c.address;
  const zipCity = [c.zip || c.postalCode, c.city].filter(Boolean).join(' ');
  if (street) { T(street, R + 14, cy); cy += 12; }
  if (zipCity) { T(zipCity, R + 14, cy); cy += 12; }
  if (!street && !zipCity && order.pickupPoint?.name) { T(`Výdajné miesto: ${order.pickupPoint.name}`, R + 14, cy, { width: cardW - 28 }); cy += 12; }
  doc.fillColor(DIM);
  if (c.email) { T(c.email, R + 14, cy); cy += 12; }
  if (c.phone) { T(c.phone, R + 14, cy); cy += 12; }
  T(`Objednávka ${order.id}`, R + 14, cardY + 92);

  // ---------- meta pás ----------
  let y = cardY + cardH + 14;
  const metaCols = [
    ['DÁTUM VYSTAVENIA', skDate(meta.issuedDate)],
    ['DÁTUM DODANIA', skDate(meta.deliveryDate)],
    [credit ? 'VRÁTIME DO' : 'SPLATNOSŤ', skDate(meta.dueDate)],
    ['SPÔSOB ÚHRADY', meta.paymentLabel || ''],
    ['VARIABILNÝ SYMBOL', String(meta.number)],
  ];
  doc.roundedRect(L, y, W, 44, 8).fill(LAVENDER);
  const mcW = W / metaCols.length;
  metaCols.forEach(([k, v], i) => {
    const cx = L + i * mcW + 12;
    doc.font('R').fontSize(6.8).fillColor(DIM); T(k, cx, y + 10, { characterSpacing: 0.6 });
    doc.font('B').fontSize(9).fillColor(INK); T(v, cx, y + 22);
  });
  y += 44 + 18;

  // ---------- položky ----------
  const colQty = L + W - 210, colUnit = L + W - 150, colTot = L + W - 76;
  doc.rect(L, y, W, 22).fill(PURPLE_DARK);
  doc.font('B').fontSize(7.8).fillColor('#ffffff');
  T('POLOŽKA', L + 12, y + 7, { characterSpacing: 1 });
  T('MNOŽ.', colQty, y + 7, { width: 50, align: 'right', characterSpacing: 1 });
  T('JEDN. CENA', colUnit, y + 7, { width: 66, align: 'right', characterSpacing: 1 });
  T('SPOLU', colTot, y + 7, { width: 76, align: 'right', characterSpacing: 1 });
  y += 22;

  const rows = (order.items || []).map(i => ({
    name: `${i.name || i.veelyn_name}${i.originalName ? ` — dupé ${i.originalName}` : ''}`,
    sub: '50 ml eau de parfum',
    qty: i.qty, unit: sign * i.price, total: sign * i.price * i.qty,
  }));
  if (Number(order.bundleDiscount) > 0) rows.push({ name: `Akcia 3+1 zadarmo${order.freeQty ? ` (${order.freeQty}× vôňa zdarma)` : ''}`, qty: 1, unit: -sign * order.bundleDiscount, total: -sign * order.bundleDiscount, green: true });
  if (Number(order.couponDiscount) > 0) rows.push({ name: `Zľavový kód ${order.couponCode || ''}`.trim(), qty: 1, unit: -sign * order.couponDiscount, total: -sign * order.couponDiscount, green: true });
  rows.push({ name: `Doprava — ${order.shippingMethod || ''}`, qty: 1, unit: sign * order.shipping, total: sign * order.shipping });
  if (Number(order.fee) > 0) rows.push({ name: `Poplatok — ${order.paymentMethod || ''}`, qty: 1, unit: sign * order.fee, total: sign * order.fee });

  const rowH = rows.length > 9 ? 20 : 26;
  for (const r of rows) {
    doc.font('B').fontSize(9).fillColor(r.green ? GREEN : INK); T(r.name, L + 12, y + (r.sub ? 5 : 9), { width: colQty - L - 20 });
    if (r.sub && rowH >= 26) { doc.font('R').fontSize(7.2).fillColor(DIM); T(r.sub, L + 12, y + 16); }
    doc.font('R').fontSize(9).fillColor(r.green ? GREEN : INK);
    T(String(r.qty), colQty, y + 9, { width: 50, align: 'right' });
    T(eur(r.unit), colUnit, y + 9, { width: 66, align: 'right' });
    doc.font('B'); T(eur(r.total), colTot, y + 9, { width: 76, align: 'right' });
    y += rowH;
    doc.moveTo(L, y).lineTo(L + W, y).strokeColor(LINE).lineWidth(0.5).stroke();
  }

  // ---------- súčet ----------
  y += 10;
  const totalLabel = credit ? 'SPOLU NA VRÁTENIE' : paid ? 'SPOLU (UHRADENÉ)' : 'SPOLU NA ÚHRADU';
  doc.font('B').fontSize(9).fillColor(DIM); T(totalLabel, colQty - 120, y + 6, { width: 170, align: 'right', characterSpacing: 1 });
  doc.font('B').fontSize(19).fillColor(credit ? RED : PURPLE); T(eur(sign * order.total), colUnit, y, { width: W - (colUnit - L), align: 'right' });
  y += 30;

  if (paid) {
    doc.roundedRect(L + W - 190, y, 190, 24, 6).lineWidth(1.2).strokeColor(GREEN).stroke();
    doc.font('B').fontSize(9.5).fillColor(GREEN); T(`UHRADENÉ ${skDate(new Date(meta.paidAt).toISOString())}`, L + W - 190, y + 7, { width: 190, align: 'center', characterSpacing: 1 });
    y += 34;
  }

  // ---------- platobná karta s QR ----------
  if (qrPng) {
    const ph = 132;
    doc.roundedRect(L, y, W, ph, 10).fill(LAVENDER);
    doc.roundedRect(L, y, W, ph, 10).lineWidth(0.8).strokeColor(LAVENDER_LINE).stroke();
    doc.image(qrPng, L + 14, y + 10, { width: 112, height: 112 });
    const tx = L + 142;
    doc.font('B').fontSize(7.5).fillColor(PURPLE); T('PLATBA PREVODOM · PAY BY SQUARE', tx, y + 14, { characterSpacing: 1.2 });
    doc.font('B').fontSize(16).fillColor(INK); T(eur(order.total), tx, y + 28);
    doc.font('R').fontSize(8.5).fillColor(DIM); T('IBAN', tx, y + 54); T('Variabilný symbol', tx + 200, y + 54); T('Splatnosť', tx + 320, y + 54);
    doc.font('B').fontSize(9.5).fillColor(INK); T(fmtIban(meta.iban), tx, y + 66); T(String(meta.number), tx + 200, y + 66); T(skDate(meta.dueDate), tx + 320, y + 66);
    doc.font('R').fontSize(8).fillColor(DIM);
    T('Naskenuj QR kód v bankovej aplikácii — suma, IBAN aj VS sa vyplnia samy.', tx, y + 92);
    T('Objednávku odošleme hneď po pripísaní platby.', tx, y + 106);
    y += ph + 14;
  }

  // ---------- poznámky ----------
  doc.font('R').fontSize(8).fillColor(DIM);
  if (meta.refProforma) { T(`Vystavená k zálohovej faktúre č. ${meta.refProforma}. Záloha bola uhradená v plnej výške — na úhradu ostáva 0,00 €.`, L, y, { width: W }); y += 13; }
  if (credit) {
    doc.fillColor(INK).fontSize(8.5); T(`Dobropis k faktúre č. ${meta.refInvoice || ''}.${meta.reason ? ` Dôvod: ${meta.reason}.` : ''}`, L, y, { width: W }); y += 13;
    doc.fillColor(DIM).fontSize(8); T('Sumu vrátime rovnakým spôsobom, akým bola uhradená, najneskôr do 14 dní.', L, y, { width: W }); y += 13;
  }
  if (proforma) { T('Zálohová faktúra nie je daňovým dokladom. Riadnu faktúru vystavíme automaticky po pripísaní úhrady.', L, y, { width: W }); y += 13; }
  else if (!credit) { T('Faktúra slúži zároveň ako dodací list. Tovar ostáva do úplného zaplatenia majetkom dodávateľa.', L, y, { width: W }); y += 13; }
  T(SUPPLIER.vatNote, L, y, { width: W });

  // ---------- päta (pripnutá k spodnému okraju, nikdy nepretečie) ----------
  const fy = PAGE_H - 46;
  doc.moveTo(L, fy - 10).lineTo(L + W, fy - 10).strokeColor(LINE).lineWidth(0.6).stroke();
  doc.font('R').fontSize(7).fillColor(DIM);
  T(`${SUPPLIER.name} · ${SUPPLIER.address}, ${SUPPLIER.city} · IČO ${SUPPLIER.ico} · DIČ ${SUPPLIER.dic}`, L, fy, { width: W, align: 'center' });
  T(`${SUPPLIER.register} · ${SUPPLIER.email} · ${SUPPLIER.web}`, L, fy + 11, { width: W, align: 'center' });
  doc.font('B').fontSize(7).fillColor(PURPLE); T('Ďakujeme, že voniate s Veelyn.', L, fy + 24, { width: W, align: 'center', characterSpacing: 1 });

  doc.end();
  return done;
}
