import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { Resend } from 'resend';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- CONFIG ----
const PORT = process.env.PORT || 3001;
const SELLER_EMAIL = process.env.SELLER_EMAIL || 'info@veelyn.sk';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Veelyn <objednavky@veelyn.sk>';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

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

// Seed default users (admin + warehouse) if none exist
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (userCount === 0) {
  db.prepare(`INSERT INTO users (username, password, role, name, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    'admin', ADMIN_PASSWORD, 'admin', 'Administrátor', Date.now()
  );
  db.prepare(`INSERT INTO users (username, password, role, name, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    'sklad', 'sklad123', 'warehouse', 'Skladník', Date.now()
  );
  console.log('[INIT] Vytvorení defaultní useri: admin / sklad');
}

// fallback log dir (when Resend isn't configured)
const LOG_DIR = resolve(__dirname, 'logs');
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// ---- APP ----
const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

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
  res.json({ ok: true, time: new Date().toISOString(), resendConfigured: !!resend });
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

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username + password required' });
  const u = db.prepare(`SELECT * FROM users WHERE username = ?`).get(String(username).toLowerCase());
  if (!u || u.password !== password) return res.status(401).json({ error: 'wrong credentials' });
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

app.post('/api/order', async (req, res) => {
  try {
    const body = req.body || {};
    // Minimal validation
    if (!body.customer?.email || !body.items?.length) {
      return res.status(400).json({ error: 'Missing customer.email or items' });
    }

    const order = {
      id: nextOrderId(),
      ts: Date.now(),
      customer: body.customer,
      items: body.items,
      subtotal: Number(body.subtotal) || 0,
      bundleDiscount: Number(body.bundleDiscount) || 0,
      freeQty: Number(body.freeQty) || 0,
      shipping: Number(body.shipping) || 0,
      fee: Number(body.fee) || 0,
      total: Number(body.total) || 0,
      status: 'pending',
      shippingMethod: body.shippingMethod || '',
      shippingId: body.shippingId || '',
      paymentMethod: body.paymentMethod || '',
      paymentId: body.paymentId || '',
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

    res.json({ ok: true, orderId: order.id, mail });
  } catch (e) {
    console.error('Order error:', e);
    res.status(500).json({ error: e.message });
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

app.patch('/api/admin/orders/:id', requireAuth(['admin','warehouse']), (req, res) => {
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
  res.json({ ok: true });
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
    res.status(400).json({ error: e.message });
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

app.post('/api/admin/users', requireAuth(['admin']), (req, res) => {
  const { username, password, role, name } = req.body || {};
  if (!username || !password || !['admin','warehouse'].includes(role)) {
    return res.status(400).json({ error: 'username + password + role(admin|warehouse) required' });
  }
  try {
    db.prepare(`INSERT INTO users (username, password, role, name, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      String(username).toLowerCase(), password, role, name || username, Date.now()
    );
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.patch('/api/admin/users/:username', requireAuth(['admin']), (req, res) => {
  const { password, role, name } = req.body || {};
  const updates = [], values = [];
  if (password) { updates.push('password = ?'); values.push(password); }
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
  console.log(`  DB: ${DB_PATH}\n`);
});
