// Packeta REST API client — https://docs.packetery.com/03-creating-shipments/
//
// Authentication: every request includes the merchant's API password
// (PACKETA_API_PASSWORD env var). The Widget API key used by the
// frontend is public and DIFFERENT from this password.
//
// What this module does:
//  - createPacket(order, pickupPointId) → submits a new shipment to
//    Packeta, returns the Packeta shipment ID + tracking number
//  - getLabelPdf(packetId) → returns the PDF buffer for the shipment
//    label (can be streamed back to the admin to print)
//  - trackPacket(packetId) → returns current shipment status
//
// API uses XML over HTTP POST to https://www.zasilkovna.cz/api/rest

const PACKETA_BASE = 'https://www.zasilkovna.cz/api/rest';

function getPassword() {
  return process.env.PACKETA_API_PASSWORD || '';
}

export function isEnabled() {
  return !!getPassword();
}

const xmlEscape = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Very small XML to JS extractor (avoids pulling a parser dependency).
// Returns the text content of the first match of <tag>...</tag>.
function xmlTag(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

async function packetaFetch(xml, { acceptPdf = false } = {}) {
  const res = await fetch(PACKETA_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=UTF-8',
      'Accept': acceptPdf ? 'application/pdf' : 'application/xml',
    },
    body: xml,
  });
  if (acceptPdf) {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Packeta label PDF ${res.status}: ${text.slice(0, 200)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  const body = await res.text();
  const status = xmlTag(body, 'status');
  if (status !== 'ok') {
    const fault = xmlTag(body, 'fault') || xmlTag(body, 'string') || body.slice(0, 300);
    const err = new Error(`Packeta: ${fault}`);
    err.body = body;
    throw err;
  }
  return body;
}

// Create a new packet for an order. `order` is the same shape we use
// elsewhere (id, customer, items, total, pickupPoint). The pickupPointId
// is the Packeta point chosen by the customer in the widget — passed in
// from order.pickupPoint.id.
export async function createPacket(order) {
  const c = order.customer || {};
  const point = order.pickupPoint || {};
  const isPacketaPickup = String(order.shippingId || '').startsWith('packeta-') &&
                          order.shippingId !== 'packeta-kurier';
  const addressId = isPacketaPickup ? point.id : null;

  // For home-delivery shipments (HD/PP) addressId is the carrier ID
  // (e.g. 106 = Slovenská pošta-like Packeta HD). Customer's home address
  // is then provided in <street>, <city>, <zip>.
  const isHomeDelivery = !isPacketaPickup;
  const carrierId = isHomeDelivery ? '106' : addressId; // 106 = Packeta SK HD

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<createPacket>
  <apiPassword>${xmlEscape(getPassword())}</apiPassword>
  <packetAttributes>
    <number>${xmlEscape(order.id)}</number>
    <name>${xmlEscape(c.firstName || '')}</name>
    <surname>${xmlEscape(c.lastName || '')}</surname>
    <email>${xmlEscape(c.email || '')}</email>
    <phone>${xmlEscape(c.phone || '')}</phone>
    <addressId>${xmlEscape(carrierId)}</addressId>
    ${isHomeDelivery ? `
    <street>${xmlEscape(c.street || '')}</street>
    <city>${xmlEscape(c.city || '')}</city>
    <zip>${xmlEscape(String(c.zip || '').replace(/\s/g, ''))}</zip>
    ` : ''}
    <value>${Number(order.total || 0).toFixed(2)}</value>
    <cod>${order.paymentId === 'cod' ? Number(order.total || 0).toFixed(2) : '0'}</cod>
    <currency>EUR</currency>
    <eshop>veelyn.sk</eshop>
    <weight>0.3</weight>
  </packetAttributes>
</createPacket>`;

  const body = await packetaFetch(xml);
  return {
    id: xmlTag(body, 'id'),
    barcode: xmlTag(body, 'barcode'),
    barcodeText: xmlTag(body, 'barcodeText'),
    raw: body,
  };
}

// Generate a PDF label for an existing packet. Returns a Buffer.
export async function getLabelPdf(packetId, format = 'A6 on A4') {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<packetLabelPdf>
  <apiPassword>${xmlEscape(getPassword())}</apiPassword>
  <packetId>${xmlEscape(packetId)}</packetId>
  <format>${xmlEscape(format)}</format>
  <offset>0</offset>
</packetLabelPdf>`;
  return packetaFetch(xml, { acceptPdf: true });
}

// Fetch current shipment status from Packeta.
export async function trackPacket(packetId) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<packetTracking>
  <apiPassword>${xmlEscape(getPassword())}</apiPassword>
  <packetId>${xmlEscape(packetId)}</packetId>
</packetTracking>`;
  const body = await packetaFetch(xml);
  return {
    statusCode: xmlTag(body, 'statusCode'),
    statusText: xmlTag(body, 'statusText'),
    raw: body,
  };
}
