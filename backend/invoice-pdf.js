// Vlastný generátor faktúr Veelyn — žiadna externá služba.
// PDF cez pdfkit (DejaVu fonty kvôli slovenskej diakritike), platobný
// QR kód podľa slovenského štandardu PAY by square (bysquare + qrcode).
//
// generateInvoicePdf(order, meta) → Promise<Buffer>
//   meta: {
//     number        'RRRRMMCCCC'
//     kind          'proforma' | 'regular'
//     issuedDate    'YYYY-MM-DD'
//     deliveryDate  'YYYY-MM-DD'
//     dueDate       'YYYY-MM-DD'
//     paymentLabel  'Bankový prevod' | 'Dobierka' | …
//     iban          IBAN dodávateľa (env BANK_IBAN) — bez neho sa QR vynechá
//     paidAt        timestamp | null — ostrá faktúra po úhrade dostane pečiatku
//     refProforma   číslo zálohovej faktúry (na ostrej po úhrade)
//   }

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { encode as bysquareEncode, PaymentOptions } from 'bysquare/pay';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SUPPLIER = {
  name: 'Vitaz Capital s. r. o.',
  brand: 'VEELYN',
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

const PURPLE = '#7c3aed';
const INK = '#111111';
const DIM = '#666666';
const LINE = '#dddddd';

const eur = (n) => Number(n || 0).toFixed(2).replace('.', ',') + ' €';
const skDate = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}.${m}.${y}`; };

async function paymentQrPng(meta, amount) {
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
        bankAccounts: [{ iban: meta.iban.replace(/\s+/g, '') }],
      }],
    });
    return await QRCode.toBuffer(qrstring, { type: 'png', width: 320, margin: 1 });
  } catch (e) {
    console.warn('[INVOICE-PDF] QR generation failed:', e.message);
    return null;
  }
}

export async function generateInvoicePdf(order, meta) {
  const proforma = meta.kind === 'proforma';
  const credit = meta.kind === 'credit';
  const sign = credit ? -1 : 1; // dobropis zobrazuje sumy so znamienkom mínus
  const c = order.customer || {};
  const title = credit ? 'DOBROPIS' : proforma ? 'ZÁLOHOVÁ FAKTÚRA' : 'FAKTÚRA';
  const showQr = meta.iban && !credit && (proforma || !meta.paidAt);
  const qrPng = showQr ? await paymentQrPng({ ...meta, orderId: order.id }, order.total) : null;

  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `${title} ${meta.number}`, Author: SUPPLIER.name } });
  doc.registerFont('R', FONT);
  doc.registerFont('B', FONT_BOLD);

  const chunks = [];
  doc.on('data', (d) => chunks.push(d));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  const L = 50, W = 495; // left margin, content width

  // ---------- hlavička ----------
  doc.font('B').fontSize(24).fillColor(PURPLE).text('VEELYN', L, 50);
  doc.font('R').fontSize(8.5).fillColor(DIM).text('Dizajnérske vône, bez dizajnérskej ceny · www.veelyn.sk', L, 79);
  doc.font('B').fontSize(15).fillColor(INK).text(title, L, 52, { width: W, align: 'right' });
  doc.font('B').fontSize(12).fillColor(PURPLE).text(`č. ${meta.number}`, L, 72, { width: W, align: 'right' });
  doc.moveTo(L, 96).lineTo(L + W, 96).strokeColor(PURPLE).lineWidth(1.5).stroke();

  // ---------- dodávateľ / odberateľ ----------
  const colY = 110;
  doc.font('B').fontSize(8).fillColor(DIM).text('DODÁVATEĽ', L, colY, { characterSpacing: 1 });
  doc.font('B').fontSize(10).fillColor(INK).text(SUPPLIER.name, L, colY + 13);
  doc.font('R').fontSize(9).fillColor(INK)
    .text(SUPPLIER.address, L, colY + 27)
    .text(SUPPLIER.city)
    .text(`IČO: ${SUPPLIER.ico}   DIČ: ${SUPPLIER.dic}`)
    .text(SUPPLIER.register, { width: 240 })
    .text(SUPPLIER.email);

  const R = L + 270;
  doc.font('B').fontSize(8).fillColor(DIM).text('ODBERATEĽ', R, colY, { characterSpacing: 1 });
  doc.font('B').fontSize(10).fillColor(INK).text([c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || '', R, colY + 13);
  doc.font('R').fontSize(9).fillColor(INK);
  if (c.address) doc.text(c.address, R, colY + 27);
  const zipCity = [c.zip || c.postalCode, c.city].filter(Boolean).join(' ');
  if (zipCity) doc.text(zipCity, c.address ? undefined : R, c.address ? undefined : colY + 27);
  if (!c.address && !zipCity && order.pickupPoint?.name) doc.text(`Výdajné miesto: ${order.pickupPoint.name}`, R, colY + 27);
  if (c.email) doc.text(c.email);
  if (c.phone) doc.text(c.phone);

  // ---------- dátumy a platba ----------
  let y = 215;
  doc.moveTo(L, y - 8).lineTo(L + W, y - 8).strokeColor(LINE).lineWidth(0.7).stroke();
  const metaCols = [
    ['Dátum vystavenia', skDate(meta.issuedDate)],
    ['Dátum dodania', skDate(meta.deliveryDate)],
    ['Splatnosť', skDate(meta.dueDate)],
    ['Spôsob úhrady', meta.paymentLabel || ''],
    ['Variabilný symbol', String(meta.number)],
  ];
  if (meta.iban) metaCols.push(['IBAN', meta.iban]);
  const colW = W / 3;
  metaCols.forEach(([k, v], i) => {
    const cx = L + (i % 3) * colW;
    const cy = y + Math.floor(i / 3) * 30;
    doc.font('R').fontSize(7.5).fillColor(DIM).text(k.toUpperCase(), cx, cy, { characterSpacing: 0.5 });
    doc.font('B').fontSize(9.5).fillColor(INK).text(v, cx, cy + 10);
  });
  y += Math.ceil(metaCols.length / 3) * 30 + 8;

  // ---------- položky ----------
  doc.rect(L, y, W, 20).fill('#f4f0ff');
  doc.font('B').fontSize(8.5).fillColor(INK)
    .text('POLOŽKA', L + 8, y + 6)
    .text('MNOŽ.', L + 305, y + 6, { width: 45, align: 'right' })
    .text('JEDN. CENA', L + 355, y + 6, { width: 65, align: 'right' })
    .text('SPOLU', L + 425, y + 6, { width: 62, align: 'right' });
  y += 20;

  const rows = (order.items || []).map(i => ({
    name: `${i.name || i.veelyn_name}${i.originalName ? ` — dupé ${i.originalName}` : ''} (50 ml EDP)`,
    qty: i.qty, unit: sign * i.price, total: sign * i.price * i.qty,
  }));
  if (Number(order.bundleDiscount) > 0) rows.push({ name: `Zľava 3+1 ZADARMO${order.freeQty ? ` (${order.freeQty}× vôňa zdarma)` : ''}`, qty: 1, unit: -sign * order.bundleDiscount, total: -sign * order.bundleDiscount, green: true });
  if (Number(order.couponDiscount) > 0) rows.push({ name: `Zľavový kód ${order.couponCode || ''}`.trim(), qty: 1, unit: -sign * order.couponDiscount, total: -sign * order.couponDiscount, green: true });
  rows.push({ name: `Doprava — ${order.shippingMethod || ''}`, qty: 1, unit: sign * order.shipping, total: sign * order.shipping });
  if (Number(order.fee) > 0) rows.push({ name: `Poplatok — ${order.paymentMethod || ''}`, qty: 1, unit: sign * order.fee, total: sign * order.fee });

  doc.font('R').fontSize(9);
  for (const r of rows) {
    const h = doc.heightOfString(r.name, { width: 290 }) + 10;
    doc.fillColor(r.green ? '#16a34a' : INK)
      .text(r.name, L + 8, y + 5, { width: 290 })
      .text(String(r.qty), L + 305, y + 5, { width: 45, align: 'right' })
      .text(eur(r.unit), L + 355, y + 5, { width: 65, align: 'right' })
      .text(eur(r.total), L + 425, y + 5, { width: 62, align: 'right' });
    y += h;
    doc.moveTo(L, y).lineTo(L + W, y).strokeColor(LINE).lineWidth(0.5).stroke();
  }

  // ---------- súčet ----------
  y += 12;
  doc.font('B').fontSize(13).fillColor(INK)
    .text(credit ? 'SPOLU NA VRÁTENIE' : (meta.paidAt && !proforma ? 'SPOLU (UHRADENÉ)' : 'SPOLU NA ÚHRADU'), L + 8, y)
    .fontSize(16).fillColor(credit ? '#dc2626' : PURPLE)
    .text(eur(sign * order.total), L + 305, y - 2, { width: 182, align: 'right' });
  y += 30;

  if (meta.paidAt && !proforma) {
    doc.roundedRect(L + 8, y, 170, 24, 5).lineWidth(1.5).strokeColor('#16a34a').stroke();
    doc.font('B').fontSize(10).fillColor('#16a34a').text(`UHRADENÉ ${skDate(new Date(meta.paidAt).toISOString())}`, L + 8, y + 7, { width: 170, align: 'center' });
    y += 36;
  }
  if (meta.refProforma) {
    doc.font('R').fontSize(8.5).fillColor(DIM).text(`Vystavená k zálohovej faktúre č. ${meta.refProforma}. Záloha bola uhradená v plnej výške — na úhradu ostáva 0,00 €.`, L + 8, y, { width: W - 16 });
    y += 24;
  }
  if (credit && meta.refInvoice) {
    doc.font('R').fontSize(9).fillColor(INK).text(`Dobropis k faktúre č. ${meta.refInvoice}.${meta.reason ? ` Dôvod: ${meta.reason}.` : ''}`, L + 8, y, { width: W - 16 });
    y += 14;
    doc.font('R').fontSize(8.5).fillColor(DIM).text('Sumu vrátime rovnakým spôsobom, akým bola uhradená, najneskôr do 14 dní.', L + 8, y, { width: W - 16 });
    y += 24;
  }

  // ---------- QR platba ----------
  if (qrPng) {
    const qy = y + 4;
    doc.image(qrPng, L + 8, qy, { width: 110, height: 110 });
    doc.font('B').fontSize(9.5).fillColor(INK).text('PAY by square', L + 130, qy + 18);
    doc.font('R').fontSize(8.5).fillColor(DIM).text('Naskenuj QR kód v aplikácii svojej banky —\nsuma, IBAN aj variabilný symbol sa vyplnia samy.', L + 130, qy + 33);
    y = qy + 118;
  }

  // ---------- päta ----------
  const fy = 770;
  doc.moveTo(L, fy - 10).lineTo(L + W, fy - 10).strokeColor(LINE).lineWidth(0.7).stroke();
  const footerLines = [SUPPLIER.vatNote];
  if (proforma) footerLines.push('Zálohová faktúra nie je daňovým dokladom. Riadna faktúra bude vystavená po pripísaní úhrady.');
  else if (credit) footerLines.push('Dobropis (opravný doklad) k pôvodnej faktúre — znižuje jej hodnotu v plnej výške.');
  else footerLines.push('Faktúra slúži zároveň ako dodací list.');
  footerLines.push(`${SUPPLIER.name} · ${SUPPLIER.register}`);
  doc.font('R').fontSize(7.5).fillColor(DIM).text(footerLines.join('\n'), L, fy, { width: W, align: 'center', lineGap: 2 });

  doc.end();
  return done;
}
