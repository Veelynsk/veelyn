// SuperFaktura API client — https://moja.superfaktura.sk
//
// Authenticates with SFAPI header: `SFAPI email=<email>&apikey=<key>`
// Request bodies for create/update endpoints go as `data=<json>` form-encoded.
//
// Env vars (set in Railway → Variables):
//   SF_EMAIL          — your SuperFaktura account email
//   SF_APIKEY         — API token from Nastavenia → Nástroje → API
//   SF_COMPANY_ID     — optional; only if your account has multiple companies
//   SF_VAT_RATE       — 20 if VAT-registered, 0 otherwise (default 0)
//   SF_PAYMENT_TYPE   — 'transfer' | 'cash' | 'card' (default 'transfer')
//
// Pricing note: SF expects unit_price WITHOUT VAT. If SF_VAT_RATE > 0 we
// back-calculate the net price from the customer-facing gross price.

const SF_BASE = 'https://moja.superfaktura.sk';

function getConfig() {
  return {
    email: process.env.SF_EMAIL || '',
    apikey: process.env.SF_APIKEY || '',
    companyId: process.env.SF_COMPANY_ID || '',
    vatRate: Number(process.env.SF_VAT_RATE || 0),
    paymentType: process.env.SF_PAYMENT_TYPE || 'transfer',
  };
}

export function isEnabled() {
  const c = getConfig();
  return !!(c.email && c.apikey);
}

function authHeader() {
  const c = getConfig();
  let value = `SFAPI email=${c.email}&apikey=${c.apikey}`;
  if (c.companyId) value += `&company_id=${c.companyId}`;
  return value;
}

async function sfFetch(path, { method = 'GET', body = null } = {}) {
  const headers = {
    'Authorization': authHeader(),
    'Accept': 'application/json',
  };
  let fetchBody = undefined;
  if (body !== null) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    fetchBody = 'data=' + encodeURIComponent(JSON.stringify(body));
  }
  const res = await fetch(SF_BASE + path, { method, headers, body: fetchBody });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json?.error_message || json?.error || `SF API ${res.status}`;
    const err = new Error(`SuperFaktura: ${msg}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// ---- Helpers ----

// SF expects net unit price. Given a gross price (what the customer pays)
// and a VAT rate (20 = 20 %), derive the net price.
function netFromGross(gross, vatRate) {
  if (!vatRate) return gross;
  return Math.round((gross / (1 + vatRate / 100)) * 10000) / 10000;
}

// Map our cart item to SF InvoiceItem.
function toInvoiceItem(item, vatRate) {
  const qty = Number(item.qty || item.quantity || 1);
  const gross = Number(item.price || item.veelyn_price || 0);
  return {
    name: item.veelyn_name || item.name || `Veelyn ${item.id || ''}`.trim(),
    description: item.inspired_by ? `Inšpirované ${item.inspired_by}` : '',
    quantity: qty,
    unit: 'ks',
    unit_price: netFromGross(gross, vatRate),
    tax: vatRate,
    sku: item.id || item.sku || '',
    discount: 0,
  };
}

// ---- Public API ----

// Create a new invoice for an order. Returns the SF response with the new
// invoice's id, token, public PDF/HTML URLs, and invoice_no_formatted.
export async function createInvoice(order) {
  const c = getConfig();
  const customer = order.customer || {};
  const items = (order.items || []).map(i => toInvoiceItem(i, c.vatRate));

  // Shipping shows as a separate line item so the invoice total matches the
  // order total exactly (some clients prefer this over the SF delivery_amount
  // field which is treated separately on the printable invoice).
  if (Number(order.shipping) > 0) {
    items.push({
      name: order.shippingMethod ? `Doprava — ${order.shippingMethod}` : 'Doprava',
      quantity: 1,
      unit: 'ks',
      unit_price: netFromGross(Number(order.shipping), c.vatRate),
      tax: c.vatRate,
      sku: 'shipping',
    });
  }
  if (Number(order.fee) > 0) {
    items.push({
      name: order.paymentMethod ? `Poplatok — ${order.paymentMethod}` : 'Poplatok',
      quantity: 1,
      unit: 'ks',
      unit_price: netFromGross(Number(order.fee), c.vatRate),
      tax: c.vatRate,
      sku: 'fee',
    });
  }

  const issuedAt = new Date(order.ts || Date.now()).toISOString().slice(0, 10);
  // 14-day default due date for bank transfer; gateways/cash get same-day
  const dueDate = new Date((order.ts || Date.now()) + 14 * 86400 * 1000)
    .toISOString().slice(0, 10);

  const body = {
    Invoice: {
      name: `Objednávka ${order.id}`,
      variable: String(order.id).replace(/\D/g, '') || String(Date.now()),
      issued: issuedAt,
      delivery: issuedAt,
      due: dueDate,
      payment_type: c.paymentType,
      invoice_currency: 'EUR',
      lang: 'slo',
      type: 'regular',
      header_comment: 'Ďakujeme za nákup vo Veelyn ❤️',
      comment: order.pickupPoint?.name
        ? `Doručenie na výdajné miesto: ${order.pickupPoint.name}`
        : '',
      rounding: 'math',
    },
    InvoiceItem: items,
    Client: {
      name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.email,
      email: customer.email,
      phone: customer.phone || '',
      address: customer.address || '',
      city: customer.city || '',
      zip: customer.zip || customer.postalCode || '',
      country_id: 191, // Slovakia
      ico: customer.ico || '',
      dic: customer.dic || '',
      ic_dph: customer.icDph || '',
    },
    settings: {
      signature: true,
      bysquare: true, // PAY by square QR for SK bank transfer
      online_payment: false,
      show_prices: true,
      language: 'slo',
    },
  };

  return sfFetch('/invoices/create', { method: 'POST', body });
}

// Mark an invoice as paid. `payment.amount` defaults to invoice total.
export async function markInvoicePaid(invoiceId, payment = {}) {
  const body = {
    InvoicePayment: {
      invoice_id: invoiceId,
      payment_type: payment.payment_type || 'transfer',
      amount: payment.amount, // omit to pay full remaining balance
      currency: 'EUR',
      created: payment.date || new Date().toISOString().slice(0, 10),
      cash_register_id: payment.cashRegisterId || undefined,
      document_number: payment.documentNumber || '',
    },
  };
  // Remove undefined keys SF doesn't like them
  Object.keys(body.InvoicePayment).forEach(k => {
    if (body.InvoicePayment[k] === undefined) delete body.InvoicePayment[k];
  });
  return sfFetch('/invoice_payments/add', { method: 'POST', body });
}

// Fetch a single invoice by ID (for status polling, PDF link, etc.)
export async function getInvoice(invoiceId) {
  return sfFetch(`/invoices/view/${encodeURIComponent(invoiceId)}.json`);
}

// Public PDF URL for the customer to download (no auth needed — token-based).
export function publicPdfUrl(invoice) {
  if (!invoice?.token) return null;
  return `${SF_BASE}/invoices/pdf/${invoice.id}/token:${invoice.token}`;
}

// Public HTML URL (used inside the customer-facing email).
export function publicHtmlUrl(invoice) {
  if (!invoice?.token) return null;
  return `${SF_BASE}/invoices/view_public/${invoice.token}`;
}
