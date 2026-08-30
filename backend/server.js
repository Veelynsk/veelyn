import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { Resend } from 'resend';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { generateInvoicePdf } from './invoice-pdf.js';
import * as ml from './mailerlite.js';
import * as pk from './packeta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- CONFIG ----
const PORT = process.env.PORT || 3001;
const SELLER_EMAIL = process.env.SELLER_EMAIL || 'info@veelyn.sk';
// Hard-coded default the FROM_EMAIL falls back to if the env var is
// missing, empty, or in a format Resend rejects. We've had recurring
// "Invalid `from` field" failures because Railway env var values get
// wrapped in quotes / contain stray chars.
const FROM_EMAIL_DEFAULT = 'Veelyn <objednavky@veelyn.sk>';
function sanitizeFromEmail(raw) {
  if (!raw) return FROM_EMAIL_DEFAULT;
  // Strip wrapping quotes (single + double) and whitespace
  let v = String(raw).trim();
  v = v.replace(/^['"]+|['"]+$/g, '').trim();
  // Resend accepts either `user@domain` or `Display Name <user@domain>`
  const plain = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
  const named = /^[^<>]+<\s*[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+\s*>$/;
  if (plain.test(v) || named.test(v)) return v;
  console.warn(`[CONFIG] FROM_EMAIL invalid format ("${raw}"), falling back to default`);
  return FROM_EMAIL_DEFAULT;
}
const FROM_EMAIL = sanitizeFromEmail(process.env.FROM_EMAIL);
console.log(`[CONFIG] FROM_EMAIL resolved to: ${FROM_EMAIL}`);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

// Refuse to start in production with the default placeholder password.
// Without this, anyone who has read the source on GitHub could log in.
if (IS_PROD && (ADMIN_PASSWORD === 'change-me' || ADMIN_PASSWORD.length < 12)) {
  console.error('[FATAL] ADMIN_PASSWORD is unset / too weak (<12 chars). Refusing to boot in production.');
  process.exit(1);
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// ---- PASSWORD HASHING (scrypt — built into Node, no extra deps) ----
// Stored format: "scrypt$<saltHex>$<keyHex>". Legacy plaintext rows from
// before this change still verify via direct constant-time compare and
// get transparently upgraded to a scrypt hash on next successful login.
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function hashPassword(plain) {
  return new Promise((res, rej) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(String(plain), salt, SCRYPT_KEYLEN, SCRYPT_OPTS, (err, key) => {
      if (err) return rej(err);
      res(`scrypt$${salt.toString('hex')}$${key.toString('hex')}`);
    });
  });
}
function verifyPassword(plain, stored) {
  if (!stored) return Promise.resolve(false);
  if (!stored.startsWith('scrypt$')) {
    // Legacy plaintext fallback (constant-time compare). Only ever fires
    // for accounts that existed before scrypt was added.
    const a = Buffer.from(String(plain));
    const b = Buffer.from(String(stored));
    if (a.length !== b.length) return Promise.resolve(false);
    try { return Promise.resolve(crypto.timingSafeEqual(a, b)); }
    catch { return Promise.resolve(false); }
  }
  const [, saltHex, keyHex] = stored.split('$');
  if (!saltHex || !keyHex) return Promise.resolve(false);
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(keyHex, 'hex');
  return new Promise((res, rej) => {
    crypto.scrypt(String(plain), salt, expected.length, SCRYPT_OPTS, (err, key) => {
      if (err) return rej(err);
      try { res(crypto.timingSafeEqual(key, expected)); }
      catch { res(false); }
    });
  });
}
function isLegacyHash(stored) {
  return stored && !stored.startsWith('scrypt$');
}

// ---- CANONICAL PRICE TABLE ----
// Source of truth for prices the server uses to recompute every order
// (so a client can't tamper the cart in DevTools and pay €0.01). Loaded
// from the live frontend's data.js so prices stay in sync; refreshed
// every 5 min. We refuse to accept orders if the table is empty.
const PRODUCTS_URL = process.env.PRODUCTS_URL || 'https://www.veelyn.sk/data.js';
let PRODUCTS = new Map();
async function refreshProducts() {
  try {
    const r = await fetch(PRODUCTS_URL, { headers: { 'cache-control': 'no-cache' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    const m = text.match(/const\s+FRAGRANCES\s*=\s*(\[[\s\S]*?\])\s*;/);
    if (!m) throw new Error('FRAGRANCES array not found in data.js');
    const arr = JSON.parse(m[1]);
    const map = new Map();
    for (const p of arr) {
      if (!p || typeof p.id !== 'string') continue;
      map.set(p.id, {
        id: p.id,
        veelyn_name: p.veelyn_name || '',
        original_name: p.original_name || '',
        brand: p.brand || '',
        veelyn_price: Number(p.veelyn_price) || 0,
        original_price: Number(p.original_price) || 0,
      });
    }
    if (map.size > 0) PRODUCTS = map;
    console.log(`[PRODUCTS] Loaded ${PRODUCTS.size} products from ${PRODUCTS_URL}`);
  } catch (e) {
    console.error(`[PRODUCTS] refresh failed (${e.message}). Keeping last known table of size ${PRODUCTS.size}.`);
  }
}
await refreshProducts();
setInterval(refreshProducts, 5 * 60_000).unref();

// ---- SHIPPING / PAYMENT (mirrors frontend SHIPPING_METHODS + PAYMENT_METHODS) ----
const SHIPPING_METHODS = {
  'packeta-kurier':  { label: 'Packeta na adresu',      price: 4.49 },
  'packeta-zbox':    { label: 'Packeta Z-BOX',          price: 2.99 },
  'packeta-pobocka': { label: 'Packeta výdajné miesto', price: 3.49 },
};
const PAYMENT_METHODS = {
  'card':     { label: 'Karta · Apple Pay · Google Pay', fee: 0 },
  'transfer': { label: 'Bankový prevod',                 fee: 0 },
  'cod':      { label: 'Dobierka',                       fee: 1.50 },
};
const FREE_SHIPPING_THRESHOLD = 40;

// ---- DB ----
const DB_PATH = resolve(__dirname, 'orders.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    customer_json TEXT NOT NULL,
    items_json TEXT NOT NULL,
    subtotal REAL NOT NULL,
    bundle_discount REAL DEFAULT 0,
    free_qty INTEGER DEFAULT 0,
    shipping REAL NOT NULL,
    fee REAL DEFAULT 0,
    total REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    shipping_method TEXT,
    shipping_id TEXT,
    payment_method TEXT,
    payment_id TEXT,
    pickup_point_json TEXT,
    newsletter_opt_in INTEGER DEFAULT 0,
    raw_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_orders_ts ON orders(ts DESC);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

  -- SuperFaktura: invoice metadata kept in sidecar table so a SF outage
  -- never breaks the core orders flow. Linked 1:1 to orders.id.
  CREATE TABLE IF NOT EXISTS sf_invoices (
    order_id     TEXT PRIMARY KEY,
    invoice_id   INTEGER,
    token        TEXT,
    invoice_no   TEXT,
    pdf_url      TEXT,
    public_url   TEXT,
    paid_at      INTEGER,
    created_at   INTEGER NOT NULL,
    error        TEXT,
    raw_json     TEXT
  );

  -- Fakturačné doklady (v2): objednávka môže mať VIAC dokladov
  -- (zálohová faktúra pri prevode + ostrá faktúra po úhrade), preto
  -- samostatná tabuľka namiesto 1:1 sf_invoices (tá ostáva kvôli
  -- spätnej kompatibilite admin UI a drží posledný ostrý doklad).
  CREATE TABLE IF NOT EXISTS invoices (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id      TEXT NOT NULL,
    kind          TEXT NOT NULL,             -- 'proforma' | 'regular'
    number        TEXT NOT NULL,             -- RRRRMMCCCC (náš číselník)
    sf_invoice_id INTEGER,
    token         TEXT,
    pdf_url       TEXT,
    public_url    TEXT,
    paid_at       INTEGER,
    emailed_at    INTEGER,
    created_at    INTEGER NOT NULL,
    error         TEXT,
    raw_json      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);

  -- Mesačný číselník faktúr: RRRRMMCCCC, reset každý mesiac, samostatný
  -- rad pre zálohové (proforma) a ostré (regular) doklady.
  CREATE TABLE IF NOT EXISTS invoice_counters (
    kind   TEXT NOT NULL,
    period TEXT NOT NULL,                    -- 'RRRRMM'
    last   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (kind, period)
  );

  -- Packeta shipments: same sidecar pattern. Created automatically when
  -- an order transitions to "paid" (or admin manually marks "shipped")
  -- and PACKETA_API_PASSWORD is configured. Holds tracking number +
  -- barcode so admin UI can show "Vytlačiť štítok" + "Sleduj zásielku".
  CREATE TABLE IF NOT EXISTS packeta_shipments (
    order_id     TEXT PRIMARY KEY,
    packet_id    TEXT,
    barcode      TEXT,
    barcode_text TEXT,
    label_pdf_path TEXT,
    created_at   INTEGER NOT NULL,
    error        TEXT,
    raw_xml      TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    name TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    stock INTEGER DEFAULT 999,
    price_override REAL,
    hidden INTEGER DEFAULT 0,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS discount_codes (
    code TEXT PRIMARY KEY,
    type TEXT DEFAULT 'percent',
    value REAL NOT NULL,
    valid_from INTEGER,
    valid_to INTEGER,
    max_uses INTEGER DEFAULT 0,
    used_count INTEGER DEFAULT 0,
    min_subtotal REAL DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
  );
`);

// Seed default users (admin + warehouse) if none exist.
// Passwords are stored as scrypt hashes from day one.
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (userCount === 0) {
  const seedDefaultWarehousePw = process.env.WAREHOUSE_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const adminHash = await hashPassword(ADMIN_PASSWORD);
  const warehouseHash = await hashPassword(seedDefaultWarehousePw);
  db.prepare(`INSERT INTO users (username, password, role, name, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    'admin', adminHash, 'admin', 'Administrátor', Date.now()
  );
  db.prepare(`INSERT INTO users (username, password, role, name, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    'sklad', warehouseHash, 'warehouse', 'Skladník', Date.now()
  );
  console.log('[INIT] Vytvorení defaultní useri: admin + sklad (passwords stored as scrypt hashes).');
  if (!process.env.WAREHOUSE_PASSWORD) {
    console.log(`[INIT] Warehouse temporary password: ${seedDefaultWarehousePw} — change it from the admin UI ASAP.`);
  }
}

// fallback log dir (when Resend isn't configured)
const LOG_DIR = resolve(__dirname, 'logs');
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// ---- FAKTURÁCIA (vlastný systém, bez externej služby) ----
const INVOICES_DIR = resolve(__dirname, 'invoices');
if (!existsSync(INVOICES_DIR)) mkdirSync(INVOICES_DIR, { recursive: true });
const INVOICING_ENABLED = process.env.INVOICING !== 'off';
const BANK_IBAN = (process.env.BANK_IBAN || '').trim();
if (INVOICING_ENABLED && !BANK_IBAN) {
  console.warn('[INVOICE] BANK_IBAN nie je nastavený — zálohové faktúry pôjdu bez IBAN a QR kódu!');
}

// ---- ČÍSELNÍK FAKTÚR (RRRRMMCCCC, mesačný reset) ----
// Obdobie sa berie podľa Europe/Bratislava, nie UTC — faktúra vystavená
// 1. v mesiaci o 00:30 SK času musí patriť do nového mesiaca.
function skPeriod(ts = Date.now()) {
  const parts = new Intl.DateTimeFormat('sk-SK', {
    timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date(ts));
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  return `${y}${m}`;
}
const _bumpCounter = db.transaction((kind, period) => {
  db.prepare(`INSERT INTO invoice_counters (kind, period, last) VALUES (?, ?, 0)
              ON CONFLICT(kind, period) DO NOTHING`).run(kind, period);
  db.prepare(`UPDATE invoice_counters SET last = last + 1 WHERE kind = ? AND period = ?`).run(kind, period);
  return db.prepare(`SELECT last FROM invoice_counters WHERE kind = ? AND period = ?`).get(kind, period).last;
});
function nextInvoiceNumber(kind) {
  const period = skPeriod();
  const n = _bumpCounter(kind, period);
  return `${period}${String(n).padStart(4, '0')}`;
}
// Ak SF vytvorenie zlyhá, číslo vrátime (len ak je stále posledné) —
// číselník tak nemá diery po chybách.
function releaseInvoiceNumber(kind, number) {
  try {
    const period = String(number).slice(0, 6);
    const n = parseInt(String(number).slice(6), 10);
    db.prepare(`UPDATE invoice_counters SET last = last - 1 WHERE kind = ? AND period = ? AND last = ?`)
      .run(kind, period, n);
  } catch (e) { console.warn('[INVOICE] release failed:', e.message); }
}

// ---- APP ----
const app = express();
// Express sits behind Railway's edge proxy + Cloudflare. `trust proxy`
// tells Express to read the client's real IP from X-Forwarded-For so
// the rate limiter actually buckets per real user instead of bucketing
// every visitor under the same upstream proxy IP.
app.set('trust proxy', 1);

// CORS allowlist. Anonymous origins (file://, curl) still hit public
// endpoints — they don't send an Origin header so the CORS check is
// skipped. But scripts running on other sites can't read responses
// from /api/admin/* anymore.
const ALLOWED_ORIGINS = new Set([
  'https://veelyn.sk',
  'https://www.veelyn.sk',
  'http://localhost:8765',
  'http://localhost:3001',
  'http://127.0.0.1:8765',
  'http://127.0.0.1:3001',
]);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // server-to-server or curl
    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error('CORS: origin not allowed'));
  },
  credentials: false,
  maxAge: 86400,
}));
app.use(express.json({ limit: '32kb' }));

// Security headers — minimal hardened set without pulling helmet as a
// dependency. Applied to every response.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  // HSTS only kicks in over HTTPS (Railway terminates HTTPS upstream
  // so the connection is HTTPS from the client's POV).
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  // CSP for API responses — admin frontend has its own CSP via the
  // Cloudflare Pages headers file. This one only ensures responses
  // can't be embedded / framed / scripted from a hostile origin.
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.removeHeader('X-Powered-By');
  next();
});

// Per-IP, in-memory rate limiter for the public POST endpoints. Not a
// distributed solution — fine for a single Railway instance. Limits are
// generous enough that real users never hit them; bots that hammer the
// form get 429ed.
const rateBuckets = new Map(); // key -> { count, resetAt }
function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const key = (req.ip || req.connection?.remoteAddress || 'anon') + ':' + req.path;
    const now = Date.now();
    let b = rateBuckets.get(key);
    if (!b || now > b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      rateBuckets.set(key, b);
    }
    b.count++;
    if (b.count > max) {
      const retry = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: 'Too many requests', retryAfter: retry });
    }
    next();
  };
}
// Periodic cleanup of expired buckets so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of rateBuckets) {
    if (now > b.resetAt) rateBuckets.delete(k);
  }
}, 60_000).unref();

// Helper: format EUR
const eur = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2).replace('.', ',') + ' €';

// Helper: generate next order ID
function nextOrderId() {
  const row = db.prepare(`SELECT id FROM orders ORDER BY ts DESC LIMIT 1`).get();
  const last = row?.id || 'V1000';
  const n = parseInt(String(last).replace(/\D/g, ''), 10) || 1000;
  return 'V' + (n + 1);
}

// Helper: build admin email HTML
function adminEmailHTML(order) {
  const itemRows = order.items.map(i =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${i.qty}× ${escape(i.name)}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-variant:tabular-nums">${eur(i.price * i.qty)}</td></tr>`
  ).join('');
  const c = order.customer || {};
  const pp = order.pickupPoint;
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f7f7f9;padding:24px;color:#111">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <div style="background:#1a0c2e;color:#fff;padding:24px 28px">
      <h1 style="margin:0;font-size:22px;letter-spacing:.04em">NOVÁ OBJEDNÁVKA · ${order.id}</h1>
      <p style="margin:8px 0 0;color:#a78bfa;font-size:14px">${new Date(order.ts).toLocaleString('sk-SK')}</p>
    </div>
    <div style="padding:24px 28px">
      <h2 style="margin:0 0 12px;font-size:16px">Zákazník</h2>
      <p style="margin:0 0 16px;line-height:1.6;font-size:14px">
        <strong>${escape(c.firstName)} ${escape(c.lastName)}</strong><br>
        ${escape(c.email)}<br>
        ${escape(c.phone)}
      </p>
      <h2 style="margin:0 0 12px;font-size:16px">Doručenie</h2>
      <p style="margin:0 0 16px;line-height:1.6;font-size:14px">
        ${escape(order.shippingMethod || '')}<br>
        ${pp ? escape(pp.name) + '<br>' + escape(pp.street || '') + ', ' + escape(pp.zip || '') + ' ' + escape(pp.city || '') : ''}
      </p>
      <h2 style="margin:0 0 12px;font-size:16px">Platba</h2>
      <p style="margin:0 0 16px;font-size:14px">${escape(order.paymentMethod || '')}</p>
      <h2 style="margin:0 0 12px;font-size:16px">Položky</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">${itemRows}</table>
      <div style="border-top:2px solid #111;padding-top:12px;text-align:right;font-size:14px">
        <div>Medzisúčet: <strong>${eur(order.subtotal)}</strong></div>
        ${order.bundleDiscount > 0 ? `<div style="color:#16a34a">3+1 ZADARMO: −${eur(order.bundleDiscount)}</div>` : ''}
        <div>Doprava: <strong>${eur(order.shipping)}</strong></div>
        ${order.fee ? `<div>Poplatok: <strong>${eur(order.fee)}</strong></div>` : ''}
        <div style="font-size:18px;margin-top:8px"><strong>SPOLU: ${eur(order.total)}</strong></div>
      </div>
    </div>
  </div></body></html>`;
}

function customerEmailHTML(order) {
  const itemRows = order.items.map(i =>
    `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${i.qty}× ${escape(i.name)}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;font-variant:tabular-nums">${eur(i.price * i.qty)}</td></tr>`
  ).join('');
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f7f7f9;padding:24px;color:#111">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <div style="background:#1a0c2e;color:#fff;padding:24px 28px;text-align:center">
      <div style="font-family:Georgia,serif;font-style:italic;font-size:28px;letter-spacing:.06em">VEELYN</div>
      <h1 style="margin:14px 0 0;font-size:18px;letter-spacing:.08em;font-weight:800">ĎAKUJEME ZA OBJEDNÁVKU</h1>
    </div>
    <div style="padding:24px 28px">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Ahoj ${escape(order.customer?.firstName || '')}, tvoja objednávka <strong>${order.id}</strong> bola prijatá. Pripravíme ti ju a odošleme do 1 pracovného dňa.</p>
      <h2 style="margin:24px 0 12px;font-size:15px;letter-spacing:.08em">POLOŽKY</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${itemRows}</table>
      <div style="margin-top:12px;text-align:right;font-size:14px">
        ${order.bundleDiscount > 0 ? `<div style="color:#16a34a">3+1 ZADARMO: −${eur(order.bundleDiscount)}</div>` : ''}
        <div>Doprava: ${eur(order.shipping)}</div>
        <div style="font-size:18px;margin-top:6px"><strong>SPOLU: ${eur(order.total)}</strong></div>
      </div>
      <p style="margin:24px 0 0;font-size:13px;color:#666;line-height:1.5">Otázky? Napíš nám na <a href="mailto:info@veelyn.sk" style="color:#7c3aed">info@veelyn.sk</a>.</p>
    </div>
  </div></body></html>`;
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

// ---- FAKTURAČNÉ EMAILY (s PDF prílohou) ----

function invoiceEmailHTML(order, number, kind) {
  const proforma = kind === 'proforma';
  const title = proforma ? 'ZÁLOHOVÁ FAKTÚRA' : 'FAKTÚRA';
  const bank = process.env.BANK_IBAN || '';
  const payBlock = proforma ? `
      <div style="margin:20px 0;padding:16px 20px;background:#f4f0ff;border:1px solid #ddd0ff;border-radius:10px;font-size:14px;line-height:1.7">
        <strong style="letter-spacing:.06em">ÚDAJE NA PLATBU PREVODOM</strong><br>
        Suma: <strong>${eur(order.total)}</strong><br>
        Variabilný symbol: <strong>${escape(number)}</strong><br>
        ${bank ? `IBAN: <strong>${escape(bank)}</strong><br>` : ''}
        Splatnosť: 7 dní<br>
        <span style="color:#666">Všetky údaje vrátane QR kódu na platbu (PAY by square) nájdeš v priloženom PDF. Objednávku odošleme hneď po pripísaní platby.</span>
      </div>` : `
      <p style="margin:16px 0;font-size:14px;line-height:1.6;color:#333">V prílohe posielame faktúru <strong>č. ${escape(number)}</strong> k tvojej objednávke <strong>${escape(order.id)}</strong>. Odlož si ju — je to daňový doklad.</p>`;
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f7f7f9;padding:24px;color:#111">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <div style="background:#1a0c2e;color:#fff;padding:24px 28px;text-align:center">
      <div style="font-family:Georgia,serif;font-style:italic;font-size:28px;letter-spacing:.06em">VEELYN</div>
      <h1 style="margin:14px 0 0;font-size:18px;letter-spacing:.08em;font-weight:800">${title} ${escape(number)}</h1>
    </div>
    <div style="padding:24px 28px">
      <p style="margin:0;font-size:15px;line-height:1.5">Ahoj ${escape(order.customer?.firstName || '')},</p>
      ${payBlock}
      <div style="text-align:right;font-size:16px;margin-top:8px"><strong>Spolu: ${eur(order.total)}</strong></div>
      <p style="margin:24px 0 0;font-size:13px;color:#666;line-height:1.5">Otázky? Napíš nám na <a href="mailto:info@veelyn.sk" style="color:#7c3aed">info@veelyn.sk</a>.</p>
    </div>
  </div></body></html>`;
}

// Pošle zákazníkovi doklad s PDF prílohou (buffer priamo z generátora).
async function sendInvoiceEmail(order, inv, pdfBuffer) {
  const proforma = inv.kind === 'proforma';
  const subject = proforma
    ? `Veelyn — zálohová faktúra ${inv.number} + údaje na platbu (${order.id})`
    : `Veelyn — faktúra ${inv.number} k objednávke ${order.id}`;
  const filename = proforma ? `Zalohova-faktura-${inv.number}.pdf` : `Faktura-${inv.number}.pdf`;
  if (!resend) {
    console.log(`[INVOICE] Resend off — ${subject} (not sent)`);
    return 'logged';
  }
  const attachments = pdfBuffer
    ? [{ filename, content: pdfBuffer.toString('base64') }]
    : undefined;
  try {
    const r = await resend.emails.send({
      from: FROM_EMAIL,
      to: order.customer.email,
      subject,
      html: invoiceEmailHTML(order, inv.number, inv.kind),
      ...(attachments ? { attachments } : {}),
    });
    return r?.data?.id || 'ok';
  } catch (e) {
    console.error(`[INVOICE] email failed for ${inv.number}:`, e.message);
    return 'error: ' + e.message;
  }
}

// Vystaví doklad (vlastné PDF), uloží ho na disk + do DB a pošle email
// s prílohou. kind: 'proforma' | 'regular'. extra: { dueDays, paidAt,
// refProforma }. Vracia uložený riadok alebo { error }.
async function issueInvoice(order, kind, extra = {}) {
  const number = nextInvoiceNumber(kind);
  try {
    const today = new Date().toISOString().slice(0, 10);
    const dueDays = Number(extra.dueDays ?? (kind === 'proforma' ? 7 : 14));
    const meta = {
      number,
      kind,
      issuedDate: today,
      deliveryDate: today,
      dueDate: new Date(Date.now() + dueDays * 86400 * 1000).toISOString().slice(0, 10),
      paymentLabel: order.paymentMethod || '',
      iban: BANK_IBAN || null,
      paidAt: extra.paidAt || null,
      refProforma: extra.refProforma || null,
    };
    const pdf = await generateInvoicePdf(order, meta);
    const filename = `${number}-${kind}.pdf`;
    writeFileSync(resolve(INVOICES_DIR, filename), pdf);
    const row = {
      order_id: order.id,
      kind,
      number,
      sf_invoice_id: null,
      token: null,
      pdf_url: `/api/admin/invoices/${number}/${kind}/pdf`,
      public_url: null,
    };
    db.prepare(`INSERT INTO invoices (order_id, kind, number, sf_invoice_id, token, pdf_url, public_url, paid_at, created_at, raw_json)
                VALUES (@order_id, @kind, @number, @sf_invoice_id, @token, @pdf_url, @public_url, @paid_at, @created_at, @raw_json)`)
      .run({ ...row, paid_at: extra.paidAt || null, created_at: Date.now(), raw_json: JSON.stringify(meta) });
    // Spätná kompatibilita: sf_invoices drží najnovší doklad (admin UI).
    db.prepare(`INSERT OR REPLACE INTO sf_invoices (order_id, invoice_id, token, invoice_no, pdf_url, public_url, created_at, raw_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(order.id, null, null, number, row.pdf_url, null, Date.now(), '');
    const mail = await sendInvoiceEmail(order, row, pdf);
    db.prepare(`UPDATE invoices SET emailed_at = ? WHERE order_id = ? AND number = ?`).run(Date.now(), order.id, number);
    console.log(`[INVOICE] ${kind} ${number} pre ${order.id} — mail: ${mail}`);
    return { ...row, mail };
  } catch (e) {
    releaseInvoiceNumber(kind, number);
    console.error(`[INVOICE] ${kind} pre ${order.id} zlyhala:`, e.message);
    db.prepare(`INSERT INTO invoices (order_id, kind, number, created_at, error)
                VALUES (?, ?, ?, ?, ?)`).run(order.id, kind, `FAILED-${number}`, Date.now(), e.message.slice(0, 500));
    return { error: e.message };
  }
}

async function sendEmails(order) {
  if (!resend) {
    // Fallback: log to file
    const logFile = resolve(LOG_DIR, `${order.id}.json`);
    writeFileSync(logFile, JSON.stringify(order, null, 2));
    console.log(`[ORDER] ${order.id} — RESEND_API_KEY not set, saved to ${logFile}`);
    return { admin: 'logged', customer: 'logged' };
  }
  const results = { admin: null, customer: null };
  try {
    const r1 = await resend.emails.send({
      from: FROM_EMAIL,
      to: SELLER_EMAIL,
      subject: `🔔 Veelyn — nová objednávka ${order.id} (${eur(order.total)})`,
      html: adminEmailHTML(order),
    });
    results.admin = r1?.data?.id || r1?.error?.message || 'ok';
  } catch (e) { results.admin = 'error: ' + e.message; }
  try {
    const r2 = await resend.emails.send({
      from: FROM_EMAIL,
      to: order.customer.email,
      subject: `Veelyn — potvrdenie objednávky ${order.id}`,
      html: customerEmailHTML(order),
    });
    results.customer = r2?.data?.id || r2?.error?.message || 'ok';
  } catch (e) { results.customer = 'error: ' + e.message; }
  return results;
}

// ---- ROUTES ----
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    resendConfigured: !!resend,
    mailerliteConfigured: ml.isEnabled(),
    invoicing: INVOICING_ENABLED ? 'internal' : 'off',
    invoicingIban: !!BANK_IBAN,
  });
});

// ---- NEWSLETTER ----
// Public endpoint that the footer newsletter form posts to. Adds the
// subscriber to the "Newsletter" group in MailerLite, which then triggers
// the welcome flow automation configured in the MailerLite UI.
app.post('/api/newsletter', rateLimit({ windowMs: 60_000, max: 5 }), async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const source = String((req.body || {}).source || 'footer');
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  if (!ml.isEnabled()) {
    // Soft-fail: log and pretend it worked so users still see "thanks".
    // Backend can be configured later without breaking the form.
    console.warn(`[NEWSLETTER] MailerLite not configured, email ${email} not stored`);
    return res.json({ ok: true, queued: false });
  }
  try {
    const result = await ml.addToGroup(email, 'Newsletter', { source });
    console.log(`[NEWSLETTER] ${email} → Newsletter group (source=${source})`);
    res.json({ ok: true, subscriberId: result?.data?.id || null });
  } catch (e) {
    console.error('[NEWSLETTER] failed:', e.message);
    res.status(502).json({ error: e.message });
  }
});

// ---- ABANDONED CART ----
// Frontend pings this when the user lands on checkout step 1 and fills
// in their email but doesn't complete the order within ~30 min. The
// /api/order success handler later removes them from this group so the
// win-back email doesn't fire on customers who DID convert.
app.post('/api/cart-abandoned', rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  if (!ml.isEnabled()) return res.json({ ok: true, queued: false });
  try {
    await ml.addToGroup(email, 'Abandoned cart', {
      cart_value: Number(body.cartValue) || 0,
      cart_items: String(body.cartItems || '').slice(0, 250), // safety cap
      cart_link: 'https://veelyn.sk/',
    });
    console.log(`[ABANDONED] ${email} → Abandoned cart (€${body.cartValue})`);
    res.json({ ok: true });
  } catch (e) {
    console.error('[ABANDONED] failed:', e.message);
    res.status(502).json({ error: e.message });
  }
});

// ---- AUTH ----
const sessions = new Map(); // token -> { username, role, expiresAt }
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
}
function getSession(req) {
  const auth = req.header('authorization') || '';
  const token = auth.replace(/^Bearer\s+/, '');
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { sessions.delete(token); return null; }
  return s;
}
function requireAuth(roles = null) {
  return (req, res, next) => {
    const s = getSession(req);
    if (!s) return res.status(401).json({ error: 'unauthorized' });
    if (roles && !roles.includes(s.role)) return res.status(403).json({ error: 'forbidden' });
    req.user = s;
    next();
  };
}

app.post('/api/admin/login', rateLimit({ windowMs: 5 * 60_000, max: 10 }), async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username + password required' });
  const u = db.prepare(`SELECT * FROM users WHERE username = ?`).get(String(username).toLowerCase());
  // Always do a verify against SOMETHING so the response time is
  // identical for "user not found" vs "wrong password" — kills
  // username-enumeration via timing.
  const stored = u ? u.password : 'scrypt$00$00';
  const ok = await verifyPassword(password, stored).catch(() => false);
  if (!u || !ok) return res.status(401).json({ error: 'wrong credentials' });
  // Transparent migration: upgrade legacy plaintext passwords to scrypt
  // on the first successful login so the DB stops holding plaintext.
  if (isLegacyHash(u.password)) {
    try {
      const upgraded = await hashPassword(password);
      db.prepare(`UPDATE users SET password = ? WHERE username = ?`).run(upgraded, u.username);
      console.log(`[AUTH] Upgraded legacy plaintext password for "${u.username}" → scrypt`);
    } catch (e) {
      console.warn(`[AUTH] Failed to upgrade password for "${u.username}":`, e.message);
    }
  }
  const token = randomToken();
  sessions.set(token, { username: u.username, role: u.role, name: u.name, expiresAt: Date.now() + SESSION_TTL_MS });
  res.json({ ok: true, token, expiresIn: SESSION_TTL_MS / 1000, user: { username: u.username, role: u.role, name: u.name } });
});

app.post('/api/admin/logout', requireAuth(), (req, res) => {
  const auth = req.header('authorization') || '';
  const token = auth.replace(/^Bearer\s+/, '');
  sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAuth(), (req, res) => {
  res.json({ user: req.user });
});

// ---- AFFILIATE FORM ----
// Public endpoint that the /affiliate/ landing page submits to. Sends
// the application as an email to affiliate@veelyn.sk (falls back to
// SELLER_EMAIL if not configured) via Resend. Always returns ok:true
// to the frontend so the UX never breaks if Resend is down — the
// payload is also logged to backend/logs/ as a fallback record.
app.post('/api/affiliate', rateLimit({ windowMs: 60_000, max: 3 }), async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const name = String(b.name || '').trim();
  if (!email.includes('@') || !name || !b.message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const payload = {
    type: 'affiliate-application',
    ts: new Date().toISOString(),
    name,
    email,
    phone: String(b.phone || '').trim(),
    followers: String(b.followers || '').trim(),
    platform: String(b.platform || '').trim(),
    handle: String(b.handle || '').trim(),
    message: String(b.message || '').trim().slice(0, 4000),
  };

  // Local fallback log so we always have a record even if Resend is
  // down or unconfigured. One JSON file per application.
  const fname = `affiliate-${Date.now()}-${email.replace(/[^a-z0-9]/g, '_')}.json`;
  try { writeFileSync(resolve(LOG_DIR, fname), JSON.stringify(payload, null, 2)); } catch {}

  if (resend) {
    const platformLabel = {
      instagram: 'Instagram',
      tiktok: 'TikTok',
      youtube: 'YouTube',
      ine: 'Iné',
    }[payload.platform] || payload.platform || '—';
    const html = `
      <h2>Nová affiliate prihláška</h2>
      <p><strong>${escapeHtml(payload.name)}</strong> &lt;${escapeHtml(payload.email)}&gt;</p>
      <ul>
        <li><strong>Telefón:</strong> ${escapeHtml(payload.phone) || '—'}</li>
        <li><strong>Followers:</strong> ${escapeHtml(payload.followers) || '—'}</li>
        <li><strong>Platforma:</strong> ${escapeHtml(platformLabel)}</li>
        <li><strong>Handle / URL:</strong> ${escapeHtml(payload.handle) || '—'}</li>
      </ul>
      <p><strong>Štýl obsahu / správa:</strong></p>
      <pre style="white-space:pre-wrap;font-family:inherit;background:#f6f5f0;padding:1rem;border-radius:8px">${escapeHtml(payload.message)}</pre>
    `;
    try {
      const r = await resend.emails.send({
        from: FROM_EMAIL,
        to: [SELLER_EMAIL || 'info@veelyn.sk'],
        replyTo: email,
        subject: `[Affiliate] Prihláška – ${name}`,
        html,
      });
      console.log(`[AFFILIATE] application from ${email} → resend ${r?.data?.id || 'queued'}`);
    } catch (e) {
      console.warn('[AFFILIATE] resend failed (kept in logs):', e.message);
    }
  } else {
    console.log(`[AFFILIATE] application from ${email} — logged to ${fname} (Resend not configured)`);
  }

  res.json({ ok: true });
});

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

app.post('/api/order', rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
  try {
    const body = req.body || {};
    // Minimal validation
    if (!body.customer?.email || !body.items?.length) {
      return res.status(400).json({ error: 'Missing customer.email or items' });
    }
    if (!Array.isArray(body.items) || body.items.length > 50) {
      return res.status(400).json({ error: 'Invalid items' });
    }
    if (PRODUCTS.size === 0) {
      return res.status(503).json({ error: 'Price table not loaded yet — try again in a few seconds.' });
    }

    // ---- SERVER-SIDE RECOMPUTE OF EVERY TOTAL ----
    // The client's `price`, `subtotal`, `bundleDiscount`, `couponDiscount`,
    // `shipping`, `fee` and `total` are completely IGNORED for storage.
    // They're only used (much later, after we compute our own numbers)
    // to detect tampering attempts for logging.
    const validatedItems = [];
    let subtotal = 0;
    const veelynUnitPrices = []; // for 3+1 bundle discount

    for (const it of body.items) {
      if (!it || typeof it.id !== 'string') return res.status(400).json({ error: 'Invalid item' });
      const p = PRODUCTS.get(it.id);
      if (!p) return res.status(400).json({ error: `Unknown product: ${it.id}` });
      const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 0));
      const variant = it.variant === 'original' ? 'original' : 'veelyn';
      const unitPrice = variant === 'original' ? p.original_price : p.veelyn_price;
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return res.status(400).json({ error: `Invalid price for product: ${it.id}` });
      }
      subtotal += unitPrice * qty;
      if (variant === 'veelyn') for (let i = 0; i < qty; i++) veelynUnitPrices.push(unitPrice);
      validatedItems.push({
        id: p.id,
        variant,
        name: variant === 'original' ? `${p.brand} ${p.original_name}` : p.veelyn_name,
        originalName: p.original_name,
        qty,
        price: unitPrice,
      });
    }
    subtotal = Math.round(subtotal * 100) / 100;

    // 3+1 ZADARMO: every 4th Veelyn item free (cheapest in each pack).
    const freeQty = Math.floor(veelynUnitPrices.length / 4);
    const sortedAsc = veelynUnitPrices.slice().sort((a, b) => a - b);
    let bundleDiscount = 0;
    for (let i = 0; i < freeQty; i++) bundleDiscount += sortedAsc[i] || 0;
    bundleDiscount = Math.round(bundleDiscount * 100) / 100;

    // ---- COUPON: atomic validate + increment in a single transaction.
    // Server is the only source of truth; client-supplied couponDiscount
    // is ignored entirely.
    let couponCode = null;
    let couponDiscount = 0;
    if (body.couponCode) {
      const code = String(body.couponCode).toUpperCase().trim().slice(0, 32);
      const applied = db.transaction((codeKey, afterBundle) => {
        const d = db.prepare(`SELECT * FROM discount_codes WHERE code = ?`).get(codeKey);
        if (!d) return null;
        const now = Date.now();
        if (!d.active) return null;
        if (d.valid_from && now < d.valid_from) return null;
        if (d.valid_to && now > d.valid_to) return null;
        if (d.max_uses > 0 && d.used_count >= d.max_uses) return null;
        if (d.min_subtotal > 0 && afterBundle < d.min_subtotal) return null;
        const r = db.prepare(`
          UPDATE discount_codes
          SET used_count = used_count + 1
          WHERE code = ?
            AND active = 1
            AND (max_uses = 0 OR used_count < max_uses)
        `).run(codeKey);
        if (r.changes !== 1) return null; // lost the race
        return d;
      })(code, subtotal - bundleDiscount);
      if (applied) {
        couponCode = applied.code;
        const base = subtotal - bundleDiscount;
        if (applied.type === 'percent') couponDiscount = Math.round(base * (applied.value / 100) * 100) / 100;
        else couponDiscount = Math.min(applied.value, base);
        couponDiscount = Math.round(couponDiscount * 100) / 100;
      }
    }

    // ---- SHIPPING + PAYMENT FEE (from server-side canonical maps).
    const ship = SHIPPING_METHODS[String(body.shippingId || '')] || null;
    const pay = PAYMENT_METHODS[String(body.paymentId || '')] || null;
    if (!ship) return res.status(400).json({ error: 'Invalid shipping method' });
    if (!pay)  return res.status(400).json({ error: 'Invalid payment method' });
    const productsTotal = Math.max(0, subtotal - bundleDiscount - couponDiscount);
    const freeShipping = productsTotal >= FREE_SHIPPING_THRESHOLD;
    const shipping = freeShipping ? 0 : ship.price;
    const fee = pay.fee;
    const total = Math.round((productsTotal + shipping + fee) * 100) / 100;

    // ---- TAMPERING SIGNAL: log loudly if client total ≠ server total.
    const clientTotal = Number(body.total) || 0;
    if (Math.abs(clientTotal - total) > 0.02) {
      console.warn(`[ORDER] price tampering attempt — client_total=${clientTotal} server_total=${total} email=${body.customer?.email}`);
    }

    const order = {
      id: nextOrderId(),
      ts: Date.now(),
      customer: body.customer,
      items: validatedItems,
      subtotal,
      bundleDiscount,
      freeQty,
      couponCode,
      couponDiscount,
      shipping,
      fee,
      total,
      status: 'pending',
      shippingMethod: ship.label,
      shippingId: String(body.shippingId || ''),
      paymentMethod: pay.label,
      paymentId: String(body.paymentId || ''),
      pickupPoint: body.pickupPoint || null,
      newsletterOptIn: !!body.newsletterOptIn,
    };

    db.prepare(`
      INSERT INTO orders (id, ts, customer_json, items_json, subtotal, bundle_discount, free_qty, shipping, fee, total, status, shipping_method, shipping_id, payment_method, payment_id, pickup_point_json, newsletter_opt_in, raw_json)
      VALUES (@id, @ts, @customer_json, @items_json, @subtotal, @bundle_discount, @free_qty, @shipping, @fee, @total, @status, @shipping_method, @shipping_id, @payment_method, @payment_id, @pickup_point_json, @newsletter_opt_in, @raw_json)
    `).run({
      id: order.id,
      ts: order.ts,
      customer_json: JSON.stringify(order.customer),
      items_json: JSON.stringify(order.items),
      subtotal: order.subtotal,
      bundle_discount: order.bundleDiscount,
      free_qty: order.freeQty,
      shipping: order.shipping,
      fee: order.fee,
      total: order.total,
      status: order.status,
      shipping_method: order.shippingMethod,
      shipping_id: order.shippingId,
      payment_method: order.paymentMethod,
      payment_id: order.paymentId,
      pickup_point_json: JSON.stringify(order.pickupPoint),
      newsletter_opt_in: order.newsletterOptIn ? 1 : 0,
      raw_json: JSON.stringify(order),
    });

    const mail = await sendEmails(order).catch(e => ({ error: e.message }));
    console.log(`[ORDER] ${order.id} created — total ${eur(order.total)} — mail:`, mail);

    // MailerLite: move customer from "Abandoned cart" → "Customers" so
    // the win-back automation stops and the post-purchase + review flow
    // starts. Non-blocking — order success is independent of this.
    if (ml.isEnabled() && order.customer?.email) {
      ml.addToGroup(order.customer.email, 'Customers', {
        name: order.customer.firstName || '',
        last_name: order.customer.lastName || '',
        last_order_id: order.id,
        last_order_value: Number(order.total) || 0,
        last_order_at: new Date(order.ts).toISOString().slice(0, 10),
      }).catch(e => console.warn('[ML] addToGroup Customers failed:', e.message));
      ml.removeFromGroup(order.customer.email, 'Abandoned cart')
        .catch(e => console.warn('[ML] removeFromGroup Abandoned cart failed:', e.message));
    }

    // ---- AUTOFAKTURÁCIA podľa spôsobu platby ----
    // transfer  → ZÁLOHOVÁ faktúra (splatnosť 7 dní, VS + QR) hneď;
    //             ostrá faktúra sa vystaví až keď admin označí "paid".
    // cod/card  → OSTRÁ faktúra hneď (dobierka sa uhrádza pri prevzatí;
    //             karta zatiaľ bez brány — admin označí paid po pripísaní).
    // Číselník RRRRMMCCCC s mesačným resetom rieši issueInvoice().
    // Ak je SF vypnutá/mŕtva, objednávka aj potvrdzovací mail fungujú
    // ďalej — doklad sa dá vystaviť dodatočne.
    let sfResult = null;
    if (INVOICING_ENABLED) {
      if (order.paymentId === 'transfer') {
        sfResult = await issueInvoice(order, 'proforma', { dueDays: 7 });
      } else {
        sfResult = await issueInvoice(order, 'regular', {
          dueDays: order.paymentId === 'cod' ? 14 : 7,
        });
      }
    }

    res.json({ ok: true, orderId: order.id, mail, invoice: sfResult });
  } catch (e) {
    console.error('Order error:', e);
    // Don't leak internal error details (SQLite constraints, file paths,
    // stack traces). Generic message to the client.
    res.status(500).json({ error: 'Server error — please retry. If it persists contact support.' });
  }
});

// === ORDERS (admin + warehouse) ===
app.get('/api/admin/orders', requireAuth(['admin', 'warehouse']), (req, res) => {
  const rows = db.prepare(`SELECT * FROM orders ORDER BY ts DESC LIMIT 1000`).all();
  let orders = rows.map(r => JSON.parse(r.raw_json));
  // Warehouse vidí len objednávky pripravené na balenie + odoslané
  if (req.user.role === 'warehouse') {
    orders = orders.filter(o => ['paid','shipped'].includes(o.status));
  }
  res.json(orders);
});

app.patch('/api/admin/orders/:id', requireAuth(['admin','warehouse']), async (req, res) => {
  const { status } = req.body || {};
  if (!['pending','paid','shipped','delivered','cancelled'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  // Warehouse môže meniť len paid → shipped a shipped → delivered
  if (req.user.role === 'warehouse' && !['shipped','delivered'].includes(status)) {
    return res.status(403).json({ error: 'warehouse cannot set this status' });
  }
  const row = db.prepare(`SELECT raw_json FROM orders WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const order = { ...JSON.parse(row.raw_json), status };
  db.prepare(`UPDATE orders SET status = ?, raw_json = ? WHERE id = ?`).run(status, JSON.stringify(order), req.params.id);

  // SuperFaktura sync pri označení "paid":
  //  - prevod: k zálohovej faktúre sa vystaví OSTRÁ faktúra (nové číslo
  //    z ostrého číselníka), označí sa ako uhradená a zákazník dostane
  //    email s PDF. Zálohovka sa už znova nefakturuje (idempotentné).
  //  - karta/dobierka: existujúca ostrá faktúra sa označí ako uhradená.
  let sfSync = null;
  if (status === 'paid' && INVOICING_ENABLED) {
    try {
      const docs = db.prepare(`SELECT * FROM invoices WHERE order_id = ? AND error IS NULL ORDER BY id`).all(req.params.id);
      const hasRegular = docs.find(d => d.kind === 'regular');
      const proforma = docs.find(d => d.kind === 'proforma');
      if (!hasRegular && proforma) {
        // prevod → ostrá faktúra po úhrade (v PDF rovno pečiatka UHRADENÉ
        // + odkaz na zálohovku) + email zákazníkovi
        db.prepare(`UPDATE invoices SET paid_at = ? WHERE id = ?`).run(Date.now(), proforma.id);
        const issued = await issueInvoice(order, 'regular', {
          dueDays: 0,
          paidAt: Date.now(),
          refProforma: proforma.number,
        });
        sfSync = issued.error ? { ok: false, error: issued.error } : { ok: true, regular: issued.number };
      } else if (hasRegular && !hasRegular.paid_at) {
        db.prepare(`UPDATE invoices SET paid_at = ? WHERE id = ?`).run(Date.now(), hasRegular.id);
        db.prepare(`UPDATE sf_invoices SET paid_at = ? WHERE order_id = ?`).run(Date.now(), req.params.id);
        sfSync = { ok: true, invoice: hasRegular.number };
        console.log(`[INVOICE] Order ${req.params.id} — faktúra ${hasRegular.number} označená ako uhradená`);
      } else {
        sfSync = { ok: true, note: docs.length ? 'already handled' : 'no invoice' };
      }
    } catch (e) {
      console.error(`[INVOICE] paid-sync failed for ${req.params.id}:`, e.message);
      sfSync = { ok: false, error: e.message };
    }
  }
  res.json({ ok: true, sfSync });
});

// === SUPERFAKTURA endpoints (admin) ===

// GET /api/admin/orders/:id/invoice — return the SF invoice metadata
// (id, number, public URLs) for an order, or null if none yet.
app.get('/api/admin/orders/:id/invoice', requireAuth(['admin','warehouse']), (req, res) => {
  const row = db.prepare(`SELECT * FROM sf_invoices WHERE order_id = ?`).get(req.params.id);
  if (!row) return res.json({ invoice: null });
  res.json({
    invoice: {
      order_id: row.order_id,
      invoice_id: row.invoice_id,
      invoice_no: row.invoice_no,
      pdf_url: row.pdf_url,
      public_url: row.public_url,
      paid_at: row.paid_at,
      error: row.error,
    },
  });
});

// POST /api/admin/orders/:id/invoice/retry — znovu vystaví doklad pre
// objednávku, ktorej fakturácia predtým zlyhala (napr. chyba PDF/QR).
app.post('/api/admin/orders/:id/invoice/retry', requireAuth(['admin']), async (req, res) => {
  if (!INVOICING_ENABLED) return res.status(400).json({ error: 'invoicing disabled' });
  const row = db.prepare(`SELECT raw_json FROM orders WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'order not found' });
  const order = JSON.parse(row.raw_json);
  const ok = db.prepare(`SELECT COUNT(*) c FROM invoices WHERE order_id = ? AND error IS NULL`).get(order.id).c;
  if (ok > 0) return res.status(409).json({ error: 'invoice already exists' });
  const kind = order.paymentId === 'transfer' ? 'proforma' : 'regular';
  const issued = await issueInvoice(order, kind, { dueDays: kind === 'proforma' ? 7 : 14 });
  if (issued.error) return res.status(502).json({ error: issued.error });
  res.json({ ok: true, invoice: issued });
});

// GET /api/admin/orders/:id/invoices — všetky doklady objednávky (v2)
app.get('/api/admin/orders/:id/invoices', requireAuth(['admin','warehouse']), (req, res) => {
  const rows = db.prepare(`SELECT id, kind, number, pdf_url, paid_at, emailed_at, created_at, error FROM invoices WHERE order_id = ? ORDER BY id`).all(req.params.id);
  res.json({ invoices: rows });
});

// GET /api/admin/invoices/:number/:kind/pdf — stiahnutie PDF dokladu
app.get('/api/admin/invoices/:number/:kind/pdf', requireAuth(['admin','warehouse']), (req, res) => {
  const number = String(req.params.number).replace(/[^0-9]/g, '');
  const kind = req.params.kind === 'proforma' ? 'proforma' : 'regular';
  const inv = db.prepare(`SELECT * FROM invoices WHERE number = ? AND kind = ? AND error IS NULL`).get(number, kind);
  if (!inv) return res.status(404).json({ error: 'invoice not found' });
  const path = resolve(INVOICES_DIR, `${number}-${kind}.pdf`);
  if (!existsSync(path)) return res.status(404).json({ error: 'pdf file missing' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${kind === 'proforma' ? 'Zalohova-faktura' : 'Faktura'}-${number}.pdf"`);
  res.sendFile(path);
});

// GET /api/admin/invoices — zoznam všetkých dokladov (novšie prvé)
app.get('/api/admin/invoices', requireAuth(['admin','warehouse']), (req, res) => {
  const rows = db.prepare(`SELECT id, order_id, kind, number, pdf_url, paid_at, emailed_at, created_at, error FROM invoices ORDER BY id DESC LIMIT 500`).all();
  res.json({ invoices: rows });
});

// === PACKETA endpoints (admin) ===

// GET /api/admin/orders/:id/shipment — read sidecar row for an order
app.get('/api/admin/orders/:id/shipment', requireAuth(['admin','warehouse']), (req, res) => {
  const row = db.prepare(`SELECT * FROM packeta_shipments WHERE order_id = ?`).get(req.params.id);
  if (!row) return res.json({ shipment: null });
  res.json({
    shipment: {
      order_id: row.order_id,
      packet_id: row.packet_id,
      barcode: row.barcode,
      barcode_text: row.barcode_text,
      tracking_url: row.barcode ? `https://tracking.packeta.com/sk/?id=${encodeURIComponent(row.barcode)}` : null,
      created_at: row.created_at,
      error: row.error,
    },
  });
});

// POST /api/admin/orders/:id/shipment — create a Packeta packet for an
// order. Idempotent: if a shipment already exists for the order, returns
// the existing record.
app.post('/api/admin/orders/:id/shipment', requireAuth(['admin','warehouse']), async (req, res) => {
  if (!pk.isEnabled()) {
    return res.status(400).json({ error: 'Packeta REST API not configured (set PACKETA_API_PASSWORD)' });
  }
  const existing = db.prepare(`SELECT * FROM packeta_shipments WHERE order_id = ?`).get(req.params.id);
  if (existing && existing.packet_id) {
    return res.json({ ok: true, shipment: { packet_id: existing.packet_id, barcode: existing.barcode } });
  }

  const row = db.prepare(`SELECT raw_json FROM orders WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'order not found' });
  const order = JSON.parse(row.raw_json);

  try {
    const r = await pk.createPacket(order);
    db.prepare(`
      INSERT INTO packeta_shipments (order_id, packet_id, barcode, barcode_text, created_at, raw_xml)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_id) DO UPDATE SET
        packet_id=excluded.packet_id, barcode=excluded.barcode,
        barcode_text=excluded.barcode_text, error=NULL, raw_xml=excluded.raw_xml
    `).run(order.id, r.id, r.barcode, r.barcodeText, Date.now(), r.raw);
    console.log(`[PACKETA] Shipment ${r.id} (barcode ${r.barcode}) created for order ${order.id}`);
    res.json({
      ok: true,
      shipment: {
        packet_id: r.id,
        barcode: r.barcode,
        barcode_text: r.barcodeText,
        tracking_url: `https://tracking.packeta.com/sk/?id=${encodeURIComponent(r.barcode)}`,
      },
    });
  } catch (e) {
    console.error('[PACKETA] createPacket failed:', e.message);
    db.prepare(`
      INSERT INTO packeta_shipments (order_id, created_at, error)
      VALUES (?, ?, ?)
      ON CONFLICT(order_id) DO UPDATE SET error=excluded.error
    `).run(req.params.id, Date.now(), e.message);
    res.status(502).json({ error: e.message });
  }
});

// GET /api/admin/orders/:id/shipment/label — stream the Packeta label PDF
// directly so admin UI can download it with one click.
app.get('/api/admin/orders/:id/shipment/label', requireAuth(['admin','warehouse']), async (req, res) => {
  const row = db.prepare(`SELECT packet_id FROM packeta_shipments WHERE order_id = ?`).get(req.params.id);
  if (!row?.packet_id) return res.status(404).json({ error: 'shipment not created yet' });
  try {
    const pdf = await pk.getLabelPdf(row.packet_id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="packeta-${req.params.id}.pdf"`);
    res.end(pdf);
  } catch (e) {
    console.error('[PACKETA] label PDF failed:', e.message);
    res.status(502).json({ error: e.message });
  }
});

// === STATS (admin only) ===
app.get('/api/admin/stats', requireAuth(['admin']), (req, res) => {
  const rows = db.prepare(`SELECT ts, status, total, items_json FROM orders`).all();
  const active = rows.filter(r => r.status !== 'cancelled');
  const now = Date.now(), day = 86400000;
  const today = active.filter(r => r.ts > now - day);
  const week = active.filter(r => r.ts > now - 7 * day);
  const month = active.filter(r => r.ts > now - 30 * day);
  const sum = arr => arr.reduce((s, r) => s + r.total, 0);

  // Last 30 days bucket
  const daily = Array(30).fill(0).map((_, i) => ({
    ts: now - (29 - i) * day,
    label: new Date(now - (29 - i) * day).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric' }),
    orders: 0,
    revenue: 0,
  }));
  active.forEach(r => {
    const idx = 29 - Math.floor((now - r.ts) / day);
    if (idx >= 0 && idx < 30) { daily[idx].orders++; daily[idx].revenue += r.total; }
  });

  // Status pie (last 3 months)
  const threeMonths = rows.filter(r => r.ts > now - 90 * day);
  const statusPie = {};
  threeMonths.forEach(r => { statusPie[r.status] = (statusPie[r.status] || 0) + 1; });

  // Top products (all time, non-cancelled)
  const productCount = {};
  active.forEach(r => {
    JSON.parse(r.items_json).forEach(it => {
      productCount[it.name] = (productCount[it.name] || 0) + it.qty;
    });
  });
  const topProducts = Object.entries(productCount)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  res.json({
    today: { orders: today.length, revenue: sum(today) },
    week:  { orders: week.length,  revenue: sum(week) },
    month: { orders: month.length, revenue: sum(month) },
    total: { orders: active.length, revenue: sum(active) },
    daily30: daily,
    statusPie,
    topProducts,
  });
});

// === PRODUCTS (admin only) ===
app.get('/api/admin/products', requireAuth(['admin']), (req, res) => {
  const rows = db.prepare(`SELECT * FROM products`).all();
  res.json(rows);
});

app.patch('/api/admin/products/:id', requireAuth(['admin']), (req, res) => {
  const { stock, price_override, hidden } = req.body || {};
  const updates = [];
  const values = [];
  if (stock != null)         { updates.push('stock = ?');         values.push(parseInt(stock, 10)); }
  if (price_override != null){ updates.push('price_override = ?');values.push(price_override === '' ? null : parseFloat(price_override)); }
  if (hidden != null)        { updates.push('hidden = ?');        values.push(hidden ? 1 : 0); }
  if (!updates.length) return res.status(400).json({ error: 'nothing to update' });
  updates.push('updated_at = ?'); values.push(Date.now());

  // Upsert: if not exists, insert with defaults
  const existing = db.prepare(`SELECT id FROM products WHERE id = ?`).get(req.params.id);
  if (!existing) {
    db.prepare(`INSERT INTO products (id, stock, price_override, hidden, updated_at) VALUES (?, ?, ?, ?, ?)`).run(
      req.params.id,
      stock != null ? parseInt(stock, 10) : 999,
      price_override != null && price_override !== '' ? parseFloat(price_override) : null,
      hidden ? 1 : 0,
      Date.now()
    );
  } else {
    values.push(req.params.id);
    db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  res.json({ ok: true });
});

// === DISCOUNT CODES ===
app.get('/api/admin/discounts', requireAuth(['admin']), (req, res) => {
  const rows = db.prepare(`SELECT * FROM discount_codes ORDER BY created_at DESC`).all();
  res.json(rows);
});

app.post('/api/admin/discounts', requireAuth(['admin']), (req, res) => {
  const { code, type = 'percent', value, validDays, max_uses = 0, min_subtotal = 0 } = req.body || {};
  if (!code || value == null) return res.status(400).json({ error: 'code + value required' });
  const codeUp = String(code).toUpperCase().trim();
  const validFrom = Date.now();
  const validTo = validDays ? Date.now() + parseInt(validDays, 10) * 86400000 : null;
  try {
    db.prepare(`INSERT INTO discount_codes (code, type, value, valid_from, valid_to, max_uses, used_count, min_subtotal, active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1, ?)`).run(
      codeUp, type, parseFloat(value), validFrom, validTo, parseInt(max_uses, 10) || 0, parseFloat(min_subtotal) || 0, Date.now()
    );
    res.json({ ok: true, code: codeUp });
  } catch (e) {
    if (/UNIQUE/.test(e.message)) return res.status(409).json({ error: 'code already exists' });
    console.error('[DISCOUNT] insert failed:', e.message);
    res.status(400).json({ error: 'invalid input' });
  }
});

app.patch('/api/admin/discounts/:code', requireAuth(['admin']), (req, res) => {
  const { active, valid_to, max_uses, value } = req.body || {};
  const updates = [], values = [];
  if (active != null)     { updates.push('active = ?');     values.push(active ? 1 : 0); }
  if (valid_to != null)   { updates.push('valid_to = ?');   values.push(valid_to ? parseInt(valid_to, 10) : null); }
  if (max_uses != null)   { updates.push('max_uses = ?');   values.push(parseInt(max_uses, 10) || 0); }
  if (value != null)      { updates.push('value = ?');      values.push(parseFloat(value)); }
  if (!updates.length) return res.status(400).json({ error: 'nothing to update' });
  values.push(req.params.code);
  const r = db.prepare(`UPDATE discount_codes SET ${updates.join(', ')} WHERE code = ?`).run(...values);
  if (!r.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

app.delete('/api/admin/discounts/:code', requireAuth(['admin']), (req, res) => {
  db.prepare(`DELETE FROM discount_codes WHERE code = ?`).run(req.params.code);
  res.json({ ok: true });
});

// Public: validate code (called from checkout)
app.get('/api/discount/validate', (req, res) => {
  const code = String(req.query.code || '').toUpperCase().trim();
  const subtotal = parseFloat(req.query.subtotal || '0');
  if (!code) return res.json({ valid: false, error: 'empty code' });
  const d = db.prepare(`SELECT * FROM discount_codes WHERE code = ?`).get(code);
  if (!d) return res.json({ valid: false, error: 'Neznámy kód' });
  if (!d.active) return res.json({ valid: false, error: 'Kód je deaktivovaný' });
  const now = Date.now();
  if (d.valid_from && now < d.valid_from) return res.json({ valid: false, error: 'Kód ešte nie je platný' });
  if (d.valid_to && now > d.valid_to) return res.json({ valid: false, error: 'Platnosť kódu vypršala' });
  if (d.max_uses > 0 && d.used_count >= d.max_uses) return res.json({ valid: false, error: 'Vyčerpaný počet použití' });
  if (d.min_subtotal > 0 && subtotal < d.min_subtotal) return res.json({ valid: false, error: `Min. nákup ${d.min_subtotal.toFixed(2)} €` });
  res.json({ valid: true, code: d.code, type: d.type, value: d.value });
});

// === CUSTOMERS (admin only) ===
app.get('/api/admin/customers', requireAuth(['admin']), (req, res) => {
  const rows = db.prepare(`SELECT customer_json, ts, total, status FROM orders`).all();
  const map = {};
  rows.forEach(r => {
    const c = JSON.parse(r.customer_json);
    const k = c.email || 'unknown';
    if (!map[k]) {
      map[k] = { email: c.email, name: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
                 phone: c.phone, orderCount: 0, spent: 0, last: 0, first: r.ts };
    }
    map[k].orderCount++;
    if (r.status !== 'cancelled') map[k].spent += r.total;
    if (r.ts > map[k].last) map[k].last = r.ts;
    if (r.ts < map[k].first) map[k].first = r.ts;
  });
  res.json(Object.values(map).sort((a, b) => b.spent - a.spent));
});

// === USERS MGMT (admin only) ===
app.get('/api/admin/users', requireAuth(['admin']), (req, res) => {
  const rows = db.prepare(`SELECT username, role, name, created_at FROM users ORDER BY created_at`).all();
  res.json(rows);
});

app.post('/api/admin/users', requireAuth(['admin']), async (req, res) => {
  const { username, password, role, name } = req.body || {};
  if (!username || !password || !['admin','warehouse'].includes(role)) {
    return res.status(400).json({ error: 'username + password + role(admin|warehouse) required' });
  }
  if (String(password).length < 8) return res.status(400).json({ error: 'password must be at least 8 chars' });
  try {
    const hash = await hashPassword(password);
    db.prepare(`INSERT INTO users (username, password, role, name, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      String(username).toLowerCase(), hash, role, name || username, Date.now()
    );
    res.json({ ok: true });
  } catch (e) {
    if (/UNIQUE/.test(e.message)) return res.status(409).json({ error: 'username already exists' });
    console.error('[USERS] insert failed:', e.message);
    res.status(400).json({ error: 'invalid input' });
  }
});

app.patch('/api/admin/users/:username', requireAuth(['admin']), async (req, res) => {
  const { password, role, name } = req.body || {};
  const updates = [], values = [];
  if (password) {
    if (String(password).length < 8) return res.status(400).json({ error: 'password must be at least 8 chars' });
    try { updates.push('password = ?'); values.push(await hashPassword(password)); }
    catch { return res.status(500).json({ error: 'hash failed' }); }
  }
  if (role && ['admin','warehouse'].includes(role)) { updates.push('role = ?'); values.push(role); }
  if (name != null) { updates.push('name = ?'); values.push(name); }
  if (!updates.length) return res.status(400).json({ error: 'nothing to update' });
  values.push(req.params.username);
  const r = db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE username = ?`).run(...values);
  if (!r.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

app.delete('/api/admin/users/:username', requireAuth(['admin']), (req, res) => {
  if (req.params.username === 'admin') return res.status(400).json({ error: 'cannot delete admin' });
  db.prepare(`DELETE FROM users WHERE username = ?`).run(req.params.username);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\nVeelyn backend running on http://localhost:${PORT}`);
  console.log(`  POST /api/order              — create order`);
  console.log(`  GET  /api/admin/orders       — list (auth: Bearer ${ADMIN_PASSWORD === 'change-me' ? 'CHANGE-ME!' : '***'})`);
  console.log(`  Resend emaily: ${resend ? '✓ aktívne' : '✗ vypnuté (set RESEND_API_KEY)'}`);
  console.log(`  Fakturácia: ${INVOICING_ENABLED ? `✓ interná (číselník RRRRMMCCCC${BANK_IBAN ? ', IBAN + QR' : ', BEZ IBAN — set BANK_IBAN!'})` : '✗ vypnutá (INVOICING=off)'}`);
  console.log(`  MailerLite: ${ml.isEnabled() ? '✓ aktívna' : '✗ vypnutá (set MAILERLITE_TOKEN)'}`);
  console.log(`  Packeta REST: ${pk.isEnabled() ? '✓ aktívna' : '✗ vypnutá (set PACKETA_API_PASSWORD)'}`);
  console.log(`  DB: ${DB_PATH}\n`);
});
