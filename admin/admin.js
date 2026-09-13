/* === VEELYN ADMIN === */

const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
const eur = (n) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + ' €';
// Escapovanie pre innerHTML — všetko, čo pochádza od zákazníka alebo z verejného
// trackingu (mená, e-maily, názvy, labely klikov, hľadané výrazy), inak stored XSS.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const dateFmt = (d) => {
  const dt = new Date(d);
  return dt.toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const dateTimeFmt = (d) => {
  const dt = new Date(d);
  return dt.toLocaleString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// === BACKEND API ===
// Na localhoste sa dá backend prepnúť cez ?api=… (číslo portu alebo celá URL) —
// keď default port 3001 obsadí iná appka. V produkcii sa ?api ignoruje.
function resolveApiBase() {
  if (typeof window !== 'undefined' && window.VEELYN_API) return window.VEELYN_API;
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (isLocal) {
    const p = new URLSearchParams(location.search).get('api');
    if (p) return /^https?:/.test(p) ? p : 'http://localhost:' + p;
    return 'http://localhost:3001';
  }
  return 'https://veelyn-production-8876.up.railway.app';
}
const VEELYN_API = resolveApiBase();

function authToken() { return localStorage.getItem('veelyn_admin_token') || ''; }
function authHeaders() {
  const t = authToken();
  return t ? { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}
async function apiGet(path) {
  const r = await fetch(VEELYN_API + path, { headers: authHeaders() });
  if (r.status === 401) { logout(); throw new Error('unauthorized'); }
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}
async function apiPatch(path, body) {
  const r = await fetch(VEELYN_API + path, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) });
  if (r.status === 401) { logout(); throw new Error('unauthorized'); }
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}
async function apiLogin(username, password) {
  const r = await fetch(VEELYN_API + '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || 'login failed');
  }
  return r.json();
}
async function apiPost(path, body) {
  const r = await fetch(VEELYN_API + path, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  if (r.status === 401) { logout(); throw new Error('unauthorized'); }
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || `API ${r.status}`); }
  return r.json();
}
async function apiPut(path, body) {
  const r = await fetch(VEELYN_API + path, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
  if (r.status === 401) { logout(); throw new Error('unauthorized'); }
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || `API ${r.status}`); }
  return r.json();
}
async function apiDelete(path) {
  const r = await fetch(VEELYN_API + path, { method: 'DELETE', headers: authHeaders() });
  if (r.status === 401) { logout(); throw new Error('unauthorized'); }
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

// Current user (set after login)
let CURRENT_USER = null;
try { CURRENT_USER = JSON.parse(localStorage.getItem('veelyn_admin_user') || 'null'); } catch {}

// === STORAGE (legacy localStorage fallback when backend is offline) ===
const STORE = {
  password: 'veelyn_admin_password',
  session: 'veelyn_admin_session',
  orders: 'veelyn_admin_orders',
  customers: 'veelyn_admin_customers',
  discounts: 'veelyn_admin_discounts',
};

const STATUS_LABEL = {
  pending: 'Nezaplatené',
  paid: 'Zaplatené',
  shipped: 'Odoslané',
  delivered: 'Doručené',
  cancelled: 'Zrušené',
};

// Live cache — naplnené z backendu cez loadOrders()
let ORDERS_CACHE = [];
function loadOrders() { return ORDERS_CACHE; }
function saveOrders(orders) { ORDERS_CACHE = orders; localStorage.setItem(STORE.orders, JSON.stringify(orders)); }
async function fetchOrders() {
  try {
    ORDERS_CACHE = await apiGet('/api/admin/orders');
    localStorage.setItem(STORE.orders, JSON.stringify(ORDERS_CACHE));
    return ORDERS_CACHE;
  } catch (err) {
    console.warn('Backend nedostupný, čítam z localStorage:', err.message);
    try { ORDERS_CACHE = JSON.parse(localStorage.getItem(STORE.orders) || '[]'); } catch { ORDERS_CACHE = []; }
    return ORDERS_CACHE;
  }
}
async function updateOrderStatus(orderId, status) {
  try {
    await apiPatch('/api/admin/orders/' + orderId, { status });
  } catch (e) {
    console.warn('PATCH zlyhalo, aktualizujem len lokálne:', e.message);
  }
  const orders = ORDERS_CACHE.map(o => o.id === orderId ? { ...o, status } : o);
  saveOrders(orders);
}
function loadDiscounts() {
  try { return JSON.parse(localStorage.getItem(STORE.discounts) || '[]'); } catch { return []; }
}
function saveDiscounts(d) { localStorage.setItem(STORE.discounts, JSON.stringify(d)); }

// === LOGIN (cez backend) ===
function isLoggedIn() {
  const session = localStorage.getItem(STORE.session);
  if (!session || !authToken()) return false;
  return Date.now() < parseInt(session, 10);
}
function setSession() {
  localStorage.setItem(STORE.session, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
}
function logout() {
  localStorage.removeItem(STORE.session);
  localStorage.removeItem('veelyn_admin_token');
  localStorage.removeItem('veelyn_admin_user');
  location.reload();
}
function setupLogin() {
  if (isLoggedIn()) {
    showApp();
    return;
  }
  // DEV: na localhoste bez hesla — skúsi dev login na lokálny backend,
  // a keď backend nebeží, pustí ťa do offline režimu (localStorage dáta).
  const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (IS_LOCAL) {
    (async () => {
      try {
        const r = await fetch(VEELYN_API + '/api/admin/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dev: true }),
        });
        if (r.ok) {
          const { token, user } = await r.json();
          localStorage.setItem('veelyn_admin_token', token);
          localStorage.setItem('veelyn_admin_user', JSON.stringify(user));
          CURRENT_USER = user;
          setSession();
          showApp();
          return;
        }
      } catch {}
      CURRENT_USER = { username: 'admin', role: 'admin', name: 'Dev (offline)' };
      localStorage.setItem('veelyn_admin_user', JSON.stringify(CURRENT_USER));
      setSession();
      showApp();
    })();
    return;
  }
  $('#loginGate').hidden = false;
  $('#adminApp').hidden = true;
  const form = $('#loginForm');
  const errEl = document.createElement('p');
  errEl.className = 'login__error';
  errEl.style.cssText = 'color:#ff6b6b;font-size:.85rem;margin:.5rem 0 0;display:none';
  form.appendChild(errEl);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const username = $('#loginUsername').value.trim();
    const pw = $('#loginPassword').value;
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Prihlasujem…';
    errEl.style.display = 'none';
    try {
      const { token, user } = await apiLogin(username, pw);
      localStorage.setItem('veelyn_admin_token', token);
      localStorage.setItem('veelyn_admin_user', JSON.stringify(user));
      CURRENT_USER = user;
      setSession();
      showApp();
    } catch (err) {
      errEl.textContent = 'Nesprávne prihlásenie alebo backend nedostupný.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  });
}
async function showApp() {
  $('#loginGate').hidden = true;
  $('#adminApp').hidden = false;
  // Role-based UI: warehouse sees only Dashboard + Objednávky
  if (CURRENT_USER?.role === 'warehouse') {
    document.body.classList.add('role-warehouse');
    ['products','customers','discounts','finance','analytics','settings','users'].forEach(t => {
      const link = document.querySelector(`.sidebar__link[data-tab="${t}"]`);
      if (link) link.style.display = 'none';
    });
  } else {
    document.body.classList.add('role-admin');
  }
  // Show user identity in top bar
  const topUser = document.querySelector('.topbar__user span:last-child') || document.querySelector('.topbar__user');
  if (topUser && CURRENT_USER) topUser.textContent = `${CURRENT_USER.name || CURRENT_USER.username} · ${CURRENT_USER.role === 'admin' ? 'Admin' : 'Sklad'}`;
  await fetchOrders();
  initApp();
}

// === DEMO DATA SEEDING ===
function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const DEMO_FIRST = ['Lucia', 'Tomáš', 'Veronika', 'Martin', 'Petra', 'Andrej', 'Simona', 'Jakub', 'Natália', 'Filip', 'Zuzana', 'Michal', 'Katarína', 'Dávid', 'Monika'];
const DEMO_LAST = ['Mihálová', 'Kovács', 'Horváthová', 'Šimko', 'Balážová', 'Varga', 'Demková', 'Šalat', 'Pospíšilová', 'Rusnák', 'Tóthová', 'Hríb'];
const DEMO_CITIES = ['Bratislava', 'Košice', 'Žilina', 'Nitra', 'Trnava', 'Prešov', 'Banská Bystrica', 'Trenčín'];

function seedDemoOrders(count = 24) {
  const existing = loadOrders();
  const orders = [];
  const now = Date.now();
  const day = 86400000;

  for (let i = 0; i < count; i++) {
    const items = [];
    const itemCount = randomBetween(1, 4);
    for (let j = 0; j < itemCount; j++) {
      const f = randomChoice(FRAGRANCES);
      const qty = randomBetween(1, 2);
      items.push({ id: f.id, name: f.veelyn_name, originalName: f.original_name, qty, price: f.veelyn_price });
    }
    const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
    const shipping = subtotal >= 40 ? 0 : 3.9;
    const total = subtotal + shipping;
    const status = randomChoice(['pending', 'paid', 'paid', 'paid', 'shipped', 'shipped', 'delivered', 'delivered', 'delivered', 'cancelled']);
    const first = randomChoice(DEMO_FIRST);
    const last = randomChoice(DEMO_LAST);
    const ts = now - randomBetween(0, 35) * day - randomBetween(0, 86400) * 1000;

    orders.push({
      id: 'V' + (1000 + existing.length + i),
      ts,
      customer: {
        firstName: first,
        lastName: last,
        email: (first + '.' + last + '@example.sk').toLowerCase().replace(/š/g, 's').replace(/č/g, 'c').replace(/ž/g, 'z').replace(/ť/g, 't').replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ý/g, 'y').replace(/ô/g, 'o'),
        phone: '+421 9' + String(randomBetween(10000000, 99999999)).slice(0, 8),
        city: randomChoice(DEMO_CITIES),
        zip: String(randomBetween(80101, 99999)),
        street: randomChoice(['Hlavná', 'Mierová', 'Štúrova', 'SNP', 'Prešovská', 'Hviezdoslavova']) + ' ' + randomBetween(1, 200),
      },
      items,
      subtotal,
      shipping,
      total,
      status,
      shippingMethod: randomChoice(['Z-Box', 'Packeta pobočka', 'DPD kuriér']),
      paymentMethod: randomChoice(['Karta', 'Apple Pay', 'Prevod', 'Dobierka']),
    });
  }
  saveOrders([...existing, ...orders].sort((a, b) => b.ts - a.ts));
  return orders.length;
}

function resetAllData() {
  if (!confirm('Naozaj vymazať všetky objednávky, zákazníkov a zľavové kódy?')) return;
  localStorage.removeItem(STORE.orders);
  localStorage.removeItem(STORE.customers);
  localStorage.removeItem(STORE.discounts);
  refreshAll();
  alert('Vymazané.');
}

// === TABS ===
function setupTabs() {
  $$('[data-tab]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = link.dataset.tab;
      switchTab(tab);
    });
  });
  $('#invoicesRefresh')?.addEventListener('click', renderInvoices);
  $('#behDays')?.addEventListener('change', renderBehavior);

  // hash routing
  const hash = location.hash.slice(1);
  if (hash) switchTab(hash);
}
function switchTab(tab) {
  $$('.tab').forEach(t => t.hidden = true);
  const target = $('#tab-' + tab);
  if (target) target.hidden = false;
  $$('.sidebar__link').forEach(l => l.classList.remove('is-active'));
  const link = document.querySelector(`.sidebar__link[data-tab="${tab}"]`);
  if (link) link.classList.add('is-active');
  $('#pageTitle').textContent = (link?.textContent.trim().split('\n')[0]) || 'Dashboard';
  history.replaceState(null, '', '#' + tab);
  if (tab === 'invoices') renderInvoices();
  if (tab === 'finance') renderFinance();
  if (tab === 'analytics') renderBehavior();
}

// === FAKTÚRY ===
const INVOICE_KIND_LABEL = { proforma: 'Zálohová', regular: 'Faktúra', credit: 'Dobropis' };
async function renderInvoices() {
  const tbody = $('#invoicesTable tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-mute);padding:1.5rem">Načítavam…</td></tr>`;
  try {
    const data = await apiGet('/api/admin/invoices');
    const rows = (data.invoices || []).filter(i => !i.error);
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-mute);padding:1.5rem">Zatiaľ žiadne doklady.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(i => `
      <tr>
        <td><strong>${i.number}</strong></td>
        <td><span class="badge badge--${i.kind === 'credit' ? 'cancelled' : i.kind === 'proforma' ? 'pending' : 'paid'}">${INVOICE_KIND_LABEL[i.kind] || i.kind}</span></td>
        <td><span class="order-id" data-order="${i.order_id}">${i.order_id}</span></td>
        <td>${dateFmt(i.created_at)}</td>
        <td>${i.paid_at ? dateFmt(i.paid_at) : '—'}</td>
        <td>${i.emailed_at ? '✓ odoslaný' : '—'}</td>
        <td style="white-space:nowrap"><button class="btn btn--ghost btn--small" data-inv-pdf="${i.number}" data-inv-kind="${i.kind}">⬇ PDF</button></td>
      </tr>`).join('');
    tbody.querySelectorAll('[data-inv-pdf]').forEach(btn => btn.addEventListener('click', () => downloadInvoicePdf(btn.dataset.invPdf, btn.dataset.invKind, btn)));
    tbody.querySelectorAll('.order-id').forEach(el => el.addEventListener('click', () => { switchTab('orders'); }));
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#ef4444;padding:1.5rem">Chyba: ${e.message}</td></tr>`;
  }
}
// Download cez fetch s auth hlavičkou (obyčajný <a href> Bearer neprenesie).
async function downloadInvoicePdf(number, kind, btn) {
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '…';
  try {
    const r = await fetch(`${VEELYN_API}/api/admin/invoices/${encodeURIComponent(number)}/${encodeURIComponent(kind)}/pdf`, { headers: authHeaders() });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${kind === 'proforma' ? 'Zalohova-faktura' : kind === 'credit' ? 'Dobropis' : 'Faktura'}-${number}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) {
    alert('Stiahnutie PDF zlyhalo: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

// === FINANCIE ===
// Nákupné ceny + prepočet nákladov, obratu, zisku a marže.
// Vstupy sa ukladajú na backend (finance_settings), fallback localStorage.
const FIN_STORE_KEY = 'veelyn_finance_settings';
const FIN_DEFAULTS = {
  oilMl: 10,          // ml parfumového oleja na 50 ml fľašu (20 %)
  oilDefault: 120,    // €/l — default nákupná cena oleja
  alcohol: 6,         // €/l — lieh/báza
  bottle: 1.10,       // €/ks — fľaša 50 ml
  sprayer: 0.35,      // €/ks — rozprašovač + viečko
  label: 0.18,        // €/ks — etiketa
  box: 0.55,          // €/ks — krabička
  otherPerBottle: 0.10, // €/fľaša — réžia, straty, testery
  packOrder: 0.40,    // €/objednávka — kartón + výplň
  shipPacketa: 2.60,  // €/objednávka — náš náklad Packeta/Z-Box
  shipCourier: 4.20,  // €/objednávka — náš náklad kuriér
  codFee: 1.20,       // €/objednávka — poplatok za dobierku
  feePct: 1.5,        // % z objednávky — platobná brána (karta/Apple/Google Pay)
  feeFix: 0.25,       // €/objednávka — fixný poplatok brány
  oils: {},           // per-vôňa override ceny oleja €/l: { fragranceId: cena }
};
const FIN_FIELDS = [
  ['oilDefault', 'Parfumový olej — default', '€/l'],
  ['oilMl', 'Olej na fľašu', 'ml'],
  ['alcohol', 'Lieh / báza', '€/l'],
  ['bottle', 'Fľaša 50 ml', '€/ks'],
  ['sprayer', 'Rozprašovač + viečko', '€/ks'],
  ['label', 'Etiketa', '€/ks'],
  ['box', 'Krabička', '€/ks'],
  ['otherPerBottle', 'Iné / réžia', '€/fľaša'],
  ['packOrder', 'Kartón + výplň', '€/obj.'],
  ['shipPacketa', 'Packeta / Z-Box — náš náklad', '€/obj.'],
  ['shipCourier', 'Kuriér — náš náklad', '€/obj.'],
  ['codFee', 'Dobierka — poplatok', '€/obj.'],
  ['feePct', 'Platobná brána', '% z obj.'],
  ['feeFix', 'Platobná brána — fix', '€/obj.'],
];
let FIN = null;          // aktuálne nastavenia (merge defaults + uložené)
let finLoaded = false;

async function loadFinanceSettings() {
  let saved = null;
  try {
    const r = await apiGet('/api/admin/finance-settings');
    saved = r.data;
  } catch (e) {
    console.warn('Finance settings API nedostupné, čítam localStorage:', e.message);
    try { saved = JSON.parse(localStorage.getItem(FIN_STORE_KEY) || 'null'); } catch {}
  }
  FIN = { ...FIN_DEFAULTS, ...(saved || {}), oils: { ...(saved?.oils || {}) } };
  finLoaded = true;
}
async function saveFinanceSettings() {
  localStorage.setItem(FIN_STORE_KEY, JSON.stringify(FIN));
  const status = $('#finSaveStatus');
  try {
    await apiPut('/api/admin/finance-settings', FIN);
    if (status) { status.textContent = '✓ uložené'; status.style.color = '#22c55e'; }
  } catch (e) {
    if (status) { status.textContent = 'uložené len lokálne (backend nedostupný)'; status.style.color = '#facc15'; }
  }
  setTimeout(() => { if (status) status.textContent = ''; }, 4000);
}

function finOilPrice(fragId) {
  const o = Number(FIN.oils?.[fragId]);
  return o > 0 ? o : Number(FIN.oilDefault) || 0;
}
// Výrobný náklad jednej 50 ml fľaše danej vône
function finCostPerBottle(fragId) {
  const oil = (Number(FIN.oilMl) || 0) / 1000 * finOilPrice(fragId);
  const alc = Math.max(0, 50 - (Number(FIN.oilMl) || 0)) / 1000 * (Number(FIN.alcohol) || 0);
  return oil + alc + (Number(FIN.bottle) || 0) + (Number(FIN.sprayer) || 0)
    + (Number(FIN.label) || 0) + (Number(FIN.box) || 0) + (Number(FIN.otherPerBottle) || 0);
}
function finAvgCostPerBottle() {
  if (!FRAGRANCES.length) return 0;
  return FRAGRANCES.reduce((s, f) => s + finCostPerBottle(f.id), 0) / FRAGRANCES.length;
}
// Náklady jednej objednávky: tovar + balenie + doprava (náš náklad) + poplatky
function finOrderCosts(order) {
  let cogs = 0;
  for (const it of (order.items || [])) {
    const qty = Number(it.qty) || 0;
    const known = FRAGRANCES.some(f => f.id === it.id);
    cogs += qty * (known ? finCostPerBottle(it.id) : finAvgCostPerBottle());
  }
  const shipStr = String(order.shippingMethod || '').toLowerCase();
  const ship = /kuri|dpd|gls|sps/.test(shipStr) ? (Number(FIN.shipCourier) || 0) : (Number(FIN.shipPacketa) || 0);
  const payStr = String(order.paymentMethod || '').toLowerCase();
  const total = Number(order.total) || 0;
  let fees = 0;
  if (/dobierka/.test(payStr)) fees = Number(FIN.codFee) || 0;
  else if (/prevod/.test(payStr)) fees = 0;
  else fees = total * (Number(FIN.feePct) || 0) / 100 + (Number(FIN.feeFix) || 0);
  return { cogs, ship, fees, pack: Number(FIN.packOrder) || 0 };
}

function finFilterOrders() {
  const period = $('#finPeriod')?.value || 'all';
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const cut30 = Date.now() - 30 * 86400000;
  return loadOrders().filter(o => o.status !== 'cancelled').filter(o => {
    if (period === 'month') return o.ts >= monthStart;
    if (period === 'prevmonth') return o.ts >= prevStart && o.ts < monthStart;
    if (period === '30d') return o.ts >= cut30;
    return true;
  });
}

const finPct = (n) => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',') + ' %';

function renderFinanceInputs() {
  const wrap = $('#finInputs');
  if (!wrap || wrap.dataset.built) return;
  wrap.dataset.built = '1';
  wrap.innerHTML = FIN_FIELDS.map(([key, label, unit]) => `
    <label class="fin-field">
      <span class="fin-field__label">${label}</span>
      <span class="fin-field__row">
        <input type="number" step="0.01" min="0" class="input fin-field__input" data-fin="${key}" value="${FIN[key]}">
        <span class="fin-field__unit">${unit}</span>
      </span>
    </label>`).join('');
  wrap.querySelectorAll('[data-fin]').forEach(inp => {
    inp.addEventListener('input', () => {
      FIN[inp.dataset.fin] = parseFloat(inp.value) || 0;
      renderFinanceComputed();
    });
  });
  $('#finSaveBtn')?.addEventListener('click', saveFinanceSettings);
  $('#finPeriod')?.addEventListener('change', renderFinanceComputed);
}

function renderFinanceComputed() {
  const orders = finFilterOrders();
  // Predané kusy podľa vône (bez zrušených, zvolené obdobie)
  const sold = {};
  let revenue = 0, goods = 0, shipCharged = 0, cogs = 0, shipCost = 0, fees = 0, pack = 0;
  for (const o of orders) {
    revenue += Number(o.total) || 0;
    goods += Number(o.subtotal) || 0;
    shipCharged += Number(o.shipping) || 0;
    const c = finOrderCosts(o);
    cogs += c.cogs; shipCost += c.ship; fees += c.fees; pack += c.pack;
    for (const it of (o.items || [])) sold[it.id] = (sold[it.id] || 0) + (Number(it.qty) || 0);
  }
  const costs = cogs + shipCost + fees + pack;
  const profit = revenue - costs;
  const margin = revenue > 0 ? profit / revenue * 100 : 0;

  $('#finOrdersCount').textContent = `${orders.length} objednávok (bez zrušených)`;
  $('#finRevenue').textContent = eur(revenue);
  $('#finCosts').textContent = eur(costs);
  $('#finProfit').textContent = eur(profit);
  $('#finProfit').style.color = profit < 0 ? '#ef4444' : '';
  $('#finMargin').textContent = finPct(margin);

  // Rozpad
  const row = (label, val, cls) => `<tr class="${cls || ''}"><td>${label}</td><td style="text-align:right;white-space:nowrap"><strong>${val}</strong></td></tr>`;
  $('#finBreakdownTable tbody').innerHTML = [
    row('Tovar (predajné ceny)', eur(goods)),
    row('Doprava účtovaná zákazníkom', eur(shipCharged)),
    row('= Obrat', eur(revenue), 'fin-row--strong'),
    row('Výroba tovaru (COGS)', '−' + eur(cogs)),
    row('Doprava — náš náklad', '−' + eur(shipCost)),
    row('Balenie (kartón, výplň)', '−' + eur(pack)),
    row('Poplatky (brána, dobierka)', '−' + eur(fees)),
    row('= Zisk', eur(profit), 'fin-row--strong'),
    row('Marža', finPct(margin)),
    row('Ø zisk na objednávku', orders.length ? eur(profit / orders.length) : '—'),
  ].join('');

  // Ekonomika jednej fľaše (priemer cez všetky vône)
  const oilAvg = FRAGRANCES.length ? FRAGRANCES.reduce((s, f) => s + (Number(FIN.oilMl) || 0) / 1000 * finOilPrice(f.id), 0) / FRAGRANCES.length : 0;
  const alcCost = Math.max(0, 50 - (Number(FIN.oilMl) || 0)) / 1000 * (Number(FIN.alcohol) || 0);
  const unitCost = finAvgCostPerBottle();
  const price = 24.99;
  const bundlePrice = price * 3 / 4; // 3+1 → Ø cena za fľašu
  $('#finUnitTable tbody').innerHTML = [
    row(`Olej (${FIN.oilMl} ml, Ø)`, eur(oilAvg)),
    row('Lieh / báza', eur(alcCost)),
    row('Fľaša + rozprašovač', eur((Number(FIN.bottle) || 0) + (Number(FIN.sprayer) || 0))),
    row('Etiketa + krabička', eur((Number(FIN.label) || 0) + (Number(FIN.box) || 0))),
    row('Iné / réžia', eur(Number(FIN.otherPerBottle) || 0)),
    row('= Náklad na fľašu (Ø)', eur(unitCost), 'fin-row--strong'),
    row('Predaj za 24,99 € → zisk', `${eur(price - unitCost)} (${finPct((price - unitCost) / price * 100)})`),
    row('V akcii 3+1 (Ø 18,74 €/fľaša) → zisk', `${eur(bundlePrice - unitCost)} (${finPct((bundlePrice - unitCost) / bundlePrice * 100)})`, ''),
  ].join('');

  // Tabuľka podľa vône
  const tbody = $('#finFragTable tbody');
  const list = [...FRAGRANCES].sort((a, b) => (sold[b.id] || 0) - (sold[a.id] || 0) || a.veelyn_name.localeCompare(b.veelyn_name));
  $('#finFragCount').textContent = `${list.length} vôní`;
  tbody.innerHTML = list.map(f => {
    const cost = finCostPerBottle(f.id);
    const profit1 = price - cost;
    const override = FIN.oils?.[f.id];
    return `<tr>
      <td><strong>${f.veelyn_name}</strong></td>
      <td style="color:var(--text-mute)">${f.brand} ${f.original_name}</td>
      <td><input type="number" step="1" min="0" class="inline-edit fin-oil" data-fid="${f.id}" value="${override ?? ''}" placeholder="${FIN.oilDefault}"></td>
      <td>${eur((Number(FIN.oilMl) || 0) / 1000 * finOilPrice(f.id))}</td>
      <td><strong>${eur(cost)}</strong></td>
      <td>${eur(price)}</td>
      <td style="color:${profit1 < 0 ? '#ef4444' : '#22c55e'}">${eur(profit1)}</td>
      <td>${finPct(profit1 / price * 100)}</td>
      <td>${sold[f.id] || 0}</td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('.fin-oil').forEach(inp => {
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (v > 0) FIN.oils[inp.dataset.fid] = v; else delete FIN.oils[inp.dataset.fid];
      renderFinanceComputed();
    });
  });
}

async function renderFinance() {
  if (!finLoaded) await loadFinanceSettings();
  renderFinanceInputs();
  renderFinanceComputed();
}

// === DASHBOARD ===
const _charts = { daily30: null, statusPie: null };
const STATUS_COLOR = {
  pending: '#facc15', paid: '#3b82f6', shipped: '#a78bfa',
  delivered: '#22c55e', cancelled: '#ef4444'
};

async function renderDashboard() {
  const orders = loadOrders();

  // Stat cards — z lokálnej cache aby nemuselo čakať na backend stats endpoint
  const now = Date.now(), day = 86400000;
  const today = orders.filter(o => o.ts > now - day && o.status !== 'cancelled');
  const week = orders.filter(o => o.ts > now - 7 * day && o.status !== 'cancelled');
  const month = orders.filter(o => o.ts > now - 30 * day && o.status !== 'cancelled');
  const all = orders.filter(o => o.status !== 'cancelled');
  $('#statTodayRevenue').textContent = eur(today.reduce((s, o) => s + o.total, 0));
  $('#statTodayOrders').textContent = today.length + ' ' + (today.length === 1 ? 'objednávka' : 'objednávok');
  $('#statWeekRevenue').textContent = eur(week.reduce((s, o) => s + o.total, 0));
  $('#statWeekOrders').textContent = week.length + ' objednávok';
  $('#statMonthRevenue').textContent = eur(month.reduce((s, o) => s + o.total, 0));
  $('#statMonthOrders').textContent = month.length + ' objednávok';
  $('#statTotalRevenue').textContent = eur(all.reduce((s, o) => s + o.total, 0));
  $('#statTotalOrders').textContent = all.length + ' objednávok';

  // Recent orders
  const recent = orders.slice(0, 5);
  $('#recentOrdersTable tbody').innerHTML = recent.map(o => `
    <tr>
      <td><span class="order-id" data-order="${o.id}">${o.id}</span></td>
      <td>${esc(o.customer.firstName || '')} ${esc(o.customer.lastName || '')}</td>
      <td><span class="badge badge--${o.status}">${STATUS_LABEL[o.status]}</span></td>
      <td><strong>${eur(o.total)}</strong></td>
    </tr>
  `).join('') || `<tr><td colspan="4" style="text-align:center; color:var(--text-mute);">Žiadne objednávky.</td></tr>`;

  // Top products (len pre admin)
  if (CURRENT_USER?.role !== 'warehouse') {
    const counts = {};
    all.forEach(o => o.items.forEach(it => counts[it.id] = (counts[it.id] || 0) + it.qty));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const list = $('#topProductsList');
    if (list) list.innerHTML = top.map(([id, count], i) => {
      const f = FRAGRANCES.find(x => x.id === id);
      if (!f) return '';
      return `<li><span class="rank">${i + 1}.</span><span class="name">${f.veelyn_name}</span><span class="count">${count}×</span></li>`;
    }).join('') || '<li style="color:var(--text-mute);">Zatiaľ žiadne predaje.</li>';
  }

  // Charts — len pre admin
  if (CURRENT_USER?.role === 'warehouse') return;
  try {
    const stats = await apiGet('/api/admin/stats');
    drawCharts(stats);
  } catch (e) {
    console.warn('Stats nedostupné:', e.message);
  }
}

function drawCharts(stats) {
  if (typeof Chart === 'undefined') return;
  // 1) Bar chart — predaje 30 dní
  const c1 = document.getElementById('chartDaily30');
  if (c1) {
    if (_charts.daily30) _charts.daily30.destroy();
    _charts.daily30 = new Chart(c1, {
      type: 'bar',
      data: {
        labels: stats.daily30.map(d => d.label),
        datasets: [{
          label: 'Predaj (€)',
          data: stats.daily30.map(d => Math.round(d.revenue * 100) / 100),
          backgroundColor: 'rgba(124, 58, 237, 0.6)',
          borderColor: 'rgba(124, 58, 237, 1)',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.y.toFixed(2)} €` } } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => v + ' €' } },
          x: { ticks: { maxRotation: 0, autoSkipPadding: 8 } }
        }
      }
    });
  }
  // 2) Doughnut — stav objednávok 3M
  const c2 = document.getElementById('chartStatusPie');
  if (c2) {
    if (_charts.statusPie) _charts.statusPie.destroy();
    const entries = Object.entries(stats.statusPie || {});
    _charts.statusPie = new Chart(c2, {
      type: 'doughnut',
      data: {
        labels: entries.map(([k]) => STATUS_LABEL[k] || k),
        datasets: [{
          data: entries.map(([_, v]) => v),
          backgroundColor: entries.map(([k]) => STATUS_COLOR[k] || '#999'),
          borderWidth: 0,
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }

  // Sidebar pending count
  const pending = orders.filter(o => o.status === 'pending').length;
  $('#ordersBadge').textContent = pending > 0 ? String(pending) : '';
}

// === ORDERS ===
let orderFilters = { status: '', search: '' };
function renderOrders() {
  const orders = loadOrders();
  const list = orders.filter(o => {
    if (orderFilters.status && o.status !== orderFilters.status) return false;
    if (orderFilters.search) {
      const q = orderFilters.search.toLowerCase();
      const hay = `${o.id} ${o.customer.firstName} ${o.customer.lastName} ${o.customer.email}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const tbody = $('#ordersTable tbody');
  tbody.innerHTML = list.map(o => `
    <tr>
      <td><span class="order-id" data-order="${o.id}">${o.id}</span></td>
      <td>${dateFmt(o.ts)}</td>
      <td>
        <div><strong>${esc(o.customer.firstName)} ${esc(o.customer.lastName)}</strong></div>
        <div style="font-size:0.78rem; color:var(--text-mute);">${esc(o.customer.email)}</div>
      </td>
      <td>${o.items.length} položiek<br><span style="font-size:0.78rem; color:var(--text-mute);">${o.items.reduce((s, it) => s + it.qty, 0)} ks</span></td>
      <td><strong>${eur(o.total)}</strong></td>
      <td><span class="badge badge--${o.status}">${STATUS_LABEL[o.status]}</span></td>
      <td><button class="btn btn--ghost btn--small" data-order="${o.id}">Detail</button></td>
    </tr>
  `).join('');

  $('#ordersEmpty').hidden = list.length > 0;
  $('#ordersTable').hidden = list.length === 0;
}

function openOrderDetail(orderId) {
  const orders = loadOrders();
  const o = orders.find(x => x.id === orderId);
  if (!o) return;
  $('#orderDialogContent').innerHTML = `
    <div class="order-detail">
      <div class="order-detail__header">
        <div>
          <h2 class="order-detail__id">${o.id}</h2>
          <p class="order-detail__date">${dateTimeFmt(o.ts)} · <span class="badge badge--${o.status}">${STATUS_LABEL[o.status]}</span></p>
        </div>
        <button class="order-detail__close" data-close>×</button>
      </div>

      <div class="order-detail__grid">
        <div class="order-detail__section">
          <h3>Zákazník</h3>
          <p><strong>${esc(o.customer.firstName)} ${esc(o.customer.lastName)}</strong></p>
          <p>${esc(o.customer.email)}</p>
          <p>${esc(o.customer.phone)}</p>
        </div>
        <div class="order-detail__section">
          <h3>Doručenie</h3>
          <p>${esc(o.shippingMethod)}</p>
          <p>${esc(o.customer.street)}</p>
          <p>${esc(o.customer.zip)} ${esc(o.customer.city)}</p>
        </div>
      </div>

      <h3 style="margin: 0 0 0.5rem; font-size:0.78rem; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--text-dim);">Položky</h3>
      <div class="order-items">
        ${o.items.map(it => `
          <div class="order-items__row">
            <div>
              <strong>${esc(it.name)}</strong>
              <div style="font-size:0.78rem; color:var(--text-mute);">${esc(it.originalName)}</div>
            </div>
            <div>${it.qty}×</div>
            <div>${eur(it.price)}</div>
            <div><strong>${eur(it.price * it.qty)}</strong></div>
          </div>
        `).join('')}
        <div class="order-items__row">
          <div>Medzisúčet</div><div></div><div></div><div>${eur(o.subtotal)}</div>
        </div>
        <div class="order-items__row">
          <div>Doprava (${o.shippingMethod})</div><div></div><div></div><div>${o.shipping === 0 ? 'Zdarma' : eur(o.shipping)}</div>
        </div>
        <div class="order-items__row">
          <div><strong>SPOLU</strong></div><div></div><div></div><div><strong>${eur(o.total)}</strong></div>
        </div>
      </div>

      <!-- Packeta section: fetch the sidecar row on open; if no shipment
           yet show "Vytvoriť zásielku", otherwise show tracking + PDF link. -->
      <div class="order-detail__section order-detail__packeta" id="orderPacketaSection" style="margin-top:1rem;">
        <h3>Packeta zásielka</h3>
        <div id="orderPacketaBody"><em style="color:var(--text-mute);">Načítava sa…</em></div>
      </div>

      <div class="order-detail__actions">
        <select class="select" id="orderStatusUpdate">
          ${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <button class="btn btn--primary" id="updateOrderStatus">Uložiť stav</button>
        <button class="btn btn--ghost" id="copyShippingAddress">Kopíruj adresu</button>
        <button class="btn btn--danger" id="deleteOrder">Vymazať</button>
      </div>
    </div>
  `;
  $('#orderDialog').hidden = false;
  refreshPacketaSection(o.id);

  $('#updateOrderStatus').addEventListener('click', async () => {
    const newStatus = $('#orderStatusUpdate').value;
    await updateOrderStatus(o.id, newStatus);
    closeDialog();
    refreshAll();
  });
  $('#copyShippingAddress').addEventListener('click', () => {
    const text = `${o.customer.firstName} ${o.customer.lastName}\n${o.customer.street}\n${o.customer.zip} ${o.customer.city}\n${o.customer.phone}`;
    navigator.clipboard.writeText(text);
    alert('Adresa skopírovaná.');
  });
  $('#deleteOrder').addEventListener('click', () => {
    if (!confirm(`Vymazať objednávku ${o.id}?`)) return;
    const orders = loadOrders();
    saveOrders(orders.filter(x => x.id !== o.id));
    closeDialog();
    refreshAll();
  });
}
function closeDialog() {
  $('#orderDialog').hidden = true;
  $('#orderDialogContent').innerHTML = '';
}

// Packeta shipment section inside order detail. Pulls the sidecar row
// from the backend, then renders either "Vytvoriť zásielku" (create
// button) or the existing shipment info (tracking + PDF download).
async function refreshPacketaSection(orderId) {
  const body = document.getElementById('orderPacketaBody');
  if (!body) return;
  let shipment = null;
  try {
    const data = await apiGet('/api/admin/orders/' + encodeURIComponent(orderId) + '/shipment');
    shipment = data?.shipment || null;
  } catch (e) {
    body.innerHTML = `<em style="color:#ff9090;">Chyba: ${e.message}</em>`;
    return;
  }

  if (!shipment || (!shipment.packet_id && !shipment.error)) {
    body.innerHTML = `
      <p style="margin:0 0 0.7rem;color:var(--text-dim);font-size:0.88rem;">
        Pre túto objednávku zatiaľ neexistuje zásielka v Packete.
      </p>
      <button class="btn btn--primary btn--small" id="packetaCreate" data-order="${orderId}">📦 Vytvoriť zásielku</button>
    `;
    document.getElementById('packetaCreate')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Vytváram…';
      try {
        await apiPost('/api/admin/orders/' + encodeURIComponent(orderId) + '/shipment', {});
        await refreshPacketaSection(orderId);
      } catch (err) {
        alert('Nepodarilo sa vytvoriť zásielku: ' + err.message);
        btn.disabled = false;
        btn.textContent = '📦 Vytvoriť zásielku';
      }
    });
    return;
  }

  if (shipment.error && !shipment.packet_id) {
    body.innerHTML = `
      <p style="margin:0 0 0.6rem;color:#ff9090;font-size:0.88rem;">
        Predchádzajúci pokus zlyhal: ${shipment.error}
      </p>
      <button class="btn btn--primary btn--small" id="packetaRetry">↻ Skúsiť znova</button>
    `;
    document.getElementById('packetaRetry')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try {
        await apiPost('/api/admin/orders/' + encodeURIComponent(orderId) + '/shipment', {});
        await refreshPacketaSection(orderId);
      } catch (err) {
        alert('Stále zlyháva: ' + err.message);
        e.currentTarget.disabled = false;
      }
    });
    return;
  }

  // Shipment exists — show tracking + label download
  const tracking = shipment.tracking_url || ('https://tracking.packeta.com/sk/?id=' + encodeURIComponent(shipment.barcode || ''));
  const labelUrl = VEELYN_API + '/api/admin/orders/' + encodeURIComponent(orderId) + '/shipment/label';
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:0.45rem;font-size:0.9rem;">
      <div><strong>Packet ID:</strong> <code>${shipment.packet_id || '—'}</code></div>
      <div><strong>Barcode:</strong> <code>${shipment.barcode_text || shipment.barcode || '—'}</code></div>
      <div>
        <a href="${tracking}" target="_blank" rel="noopener" style="color:var(--accent-2);">🔎 Sleduj zásielku ↗</a>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.4rem;">
        <button class="btn btn--primary btn--small" id="packetaLabel">📄 Stiahnuť štítok PDF</button>
      </div>
    </div>
  `;
  document.getElementById('packetaLabel')?.addEventListener('click', async () => {
    // Authenticated download — fetch as blob so we send the Bearer
    // token, then open in a new tab via a transient object URL.
    try {
      const r = await fetch(labelUrl, { headers: authHeaders() });
      if (!r.ok) throw new Error('Server vrátil ' + r.status);
      const blob = await r.blob();
      const obj = URL.createObjectURL(blob);
      window.open(obj, '_blank');
      setTimeout(() => URL.revokeObjectURL(obj), 30000);
    } catch (err) {
      alert('Nepodarilo sa stiahnuť štítok: ' + err.message);
    }
  });
}

function exportOrdersCSV() {
  const orders = loadOrders();
  const rows = [['ID', 'Dátum', 'Zákazník', 'Email', 'Telefón', 'Adresa', 'Položky', 'Suma', 'Stav', 'Doprava', 'Platba']];
  orders.forEach(o => {
    rows.push([
      o.id,
      dateFmt(o.ts),
      `${o.customer.firstName} ${o.customer.lastName}`,
      o.customer.email,
      o.customer.phone,
      `${o.customer.street}, ${o.customer.zip} ${o.customer.city}`,
      o.items.map(it => `${it.qty}× ${it.name}`).join('; '),
      o.total.toFixed(2).replace('.', ','),
      STATUS_LABEL[o.status],
      o.shippingMethod,
      o.paymentMethod,
    ]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'veelyn-orders-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// === PRODUCTS ===
// Slug produktovej stránky — MUSÍ sedieť s build-product-pages.js / build-sitemap.js
function fragSlug(f) {
  return `${f.brand}-${f.original_name}`.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const fragUrl = (f) => `https://www.veelyn.sk/produkt/${fragSlug(f)}/`;

let productFilters = { search: '', brand: '' };
let PRODUCTS_CACHE = []; // backend overrides: [{id, stock, price_override, hidden}]
async function fetchProducts() {
  try { PRODUCTS_CACHE = await apiGet('/api/admin/products'); }
  catch (e) { console.warn('Products API:', e.message); PRODUCTS_CACHE = []; }
}
function getProductOverride(id) {
  return PRODUCTS_CACHE.find(p => p.id === id) || { id, stock: 999, price_override: null, hidden: 0 };
}
async function renderProducts() {
  await fetchProducts();
  const list = FRAGRANCES.filter(f => {
    if (productFilters.brand && f.brand !== productFilters.brand) return false;
    if (productFilters.search) {
      const q = productFilters.search.toLowerCase();
      if (!`${f.veelyn_name} ${f.original_name} ${f.brand}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const orders = loadOrders().filter(o => o.status !== 'cancelled');
  const sold = {};
  orders.forEach(o => o.items.forEach(it => sold[it.id] = (sold[it.id] || 0) + it.qty));

  const tbody = $('#productsTable tbody');
  tbody.innerHTML = list.map(f => {
    const ov = getProductOverride(f.id);
    const effectivePrice = ov.price_override != null ? ov.price_override : f.veelyn_price;
    return `
    <tr data-product-id="${f.id}">
      <td><code>${f.id}</code></td>
      <td><a class="prod-link" href="${fragUrl(f)}" target="_blank" rel="noopener" title="Otvoriť na webe ↗">${f.veelyn_name}</a></td>
      <td>${f.original_name}</td>
      <td>${f.brand}</td>
      <td>${sold[f.id] ? `<strong>${sold[f.id]}×</strong>` : '<span style="color:var(--text-mute)">0×</span>'}</td>
      <td><input type="number" class="inline-edit" data-field="price_override" min="0" step="0.01" value="${effectivePrice.toFixed(2)}" style="width:80px"></td>
      <td><input type="number" class="inline-edit" data-field="stock" min="0" value="${ov.stock ?? 999}" style="width:70px"></td>
      <td><input type="checkbox" class="inline-edit" data-field="hidden" ${ov.hidden ? 'checked' : ''}></td>
      <td><a class="btn btn--ghost btn--small" style="white-space:nowrap" href="${fragUrl(f)}" target="_blank" rel="noopener">↗ Zobraziť</a></td>
    </tr>`;
  }).join('');
  $('#productCount').textContent = list.length + ' produktov';

  // Inline edit handler — change → PATCH backend
  $$('#productsTable .inline-edit').forEach(inp => {
    inp.addEventListener('change', async (e) => {
      const tr = e.target.closest('tr');
      const id = tr.dataset.productId;
      const field = e.target.dataset.field;
      const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      e.target.disabled = true;
      try {
        await apiPatch('/api/admin/products/' + id, { [field]: val });
        e.target.classList.add('save-ok');
        setTimeout(() => e.target.classList.remove('save-ok'), 800);
        await fetchProducts();
      } catch (err) {
        alert('Nepodarilo sa uložiť: ' + err.message);
      } finally {
        e.target.disabled = false;
      }
    });
  });
}
function setupProductFilters() {
  const brandSel = $('#productBrandFilter');
  [...new Set(FRAGRANCES.map(f => f.brand))].sort().forEach(b => {
    const opt = document.createElement('option');
    opt.value = b; opt.textContent = b;
    brandSel.appendChild(opt);
  });
  $('#productSearch').addEventListener('input', e => { productFilters.search = e.target.value; renderProducts(); });
  brandSel.addEventListener('change', e => { productFilters.brand = e.target.value; renderProducts(); });
}

// === CUSTOMERS ===
async function renderCustomers() {
  let list = [];
  try { list = await apiGet('/api/admin/customers'); } catch (e) { console.warn(e.message); }
  const tbody = $('#customersTable tbody');
  tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong>${esc(c.email || '—')}</strong></td>
      <td>${esc(c.name || '—')}</td>
      <td>${esc(c.phone || '—')}</td>
      <td>${c.orderCount}</td>
      <td><strong>${eur(c.spent)}</strong></td>
      <td>${dateFmt(c.last)}</td>
    </tr>
  `).join('');
  $('#customersEmpty').hidden = list.length > 0;
  $('#customersTable').hidden = list.length === 0;
}

// === DISCOUNTS (backend) ===
async function renderDiscounts() {
  let list = [];
  try { list = await apiGet('/api/admin/discounts'); } catch (e) { console.warn(e.message); }
  const tbody = $('#discountsTable tbody');
  const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '∞';
  tbody.innerHTML = list.map(d => `
    <tr>
      <td><code>${esc(d.code)}</code></td>
      <td>${d.type === 'percent' ? 'Percento' : 'Pevná suma'}</td>
      <td><strong>${d.type === 'percent' ? d.value + ' %' : eur(d.value)}</strong></td>
      <td>${fmtDate(d.valid_to)}</td>
      <td>${d.used_count || 0} / ${d.max_uses || '∞'}</td>
      <td>${d.min_subtotal ? eur(d.min_subtotal) : '—'}</td>
      <td><span class="badge badge--${d.active ? 'on' : 'off'}">${d.active ? 'Aktívne' : 'Vypnuté'}</span></td>
      <td>
        <button class="btn btn--ghost btn--small" data-toggle-discount="${esc(d.code)}" data-current="${d.active ? 1 : 0}">${d.active ? 'Vypnúť' : 'Zapnúť'}</button>
        <button class="btn btn--danger btn--small" data-delete-discount="${esc(d.code)}">Vymazať</button>
      </td>
    </tr>
  `).join('');
  $('#discountsEmpty').hidden = list.length > 0;
  $('#discountsTable').hidden = list.length === 0;
}
function setupDiscountForm() {
  const form = $('#discountForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
      await apiPost('/api/admin/discounts', {
        code: data.code,
        type: data.type,
        value: parseFloat(data.value),
        validDays: data.validDays ? parseInt(data.validDays, 10) : null,
        max_uses: parseInt(data.max_uses || '0', 10),
        min_subtotal: parseFloat(data.min_subtotal || '0'),
      });
      form.reset();
      await renderDiscounts();
    } catch (err) { alert('Chyba: ' + err.message); }
  });
}

// === USERS (admin only) ===
async function renderUsers() {
  let list = [];
  try { list = await apiGet('/api/admin/users'); } catch (e) { console.warn(e.message); }
  const tbody = $('#usersTable tbody');
  tbody.innerHTML = list.map(u => `
    <tr>
      <td><code>${esc(u.username)}</code></td>
      <td>${esc(u.name || '—')}</td>
      <td><span class="badge badge--${u.role === 'admin' ? 'paid' : 'on'}">${u.role === 'admin' ? 'Admin' : 'Sklad'}</span></td>
      <td>${dateFmt(u.created_at)}</td>
      <td>
        ${u.username !== 'admin' ? `<button class="btn btn--danger btn--small" data-delete-user="${esc(u.username)}">Vymazať</button>` : '<span style="color:var(--text-mute);">—</span>'}
      </td>
    </tr>
  `).join('');
}
function setupUserForm() {
  const form = $('#userForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
      await apiPost('/api/admin/users', data);
      form.reset();
      await renderUsers();
    } catch (err) { alert('Chyba: ' + err.message); }
  });
}

// === ANALYTICS ===
function renderAnalytics() {
  const allOrders = loadOrders();
  const orders = allOrders.filter(o => o.status !== 'cancelled');
  const total = orders.reduce((s, o) => s + o.total, 0);
  const avg = orders.length ? total / orders.length : 0;
  $('#statAvgOrder').textContent = eur(avg);

  const customers = {};
  orders.forEach(o => customers[o.customer.email] = (customers[o.customer.email] || 0) + 1);
  const returning = Object.values(customers).filter(c => c > 1).length;
  $('#statReturning').textContent = returning;

  // 1) Sales bar chart — last 30 days (now with tooltip + day labels)
  const now = Date.now();
  const day = 86400000;
  const buckets = Array(30).fill(0);
  orders.forEach(o => {
    const d = Math.floor((now - o.ts) / day);
    if (d >= 0 && d < 30) buckets[29 - d] += o.total;
  });
  const max = Math.max(...buckets, 1);
  const chartEl = $('#salesChart');
  chartEl.innerHTML = '';
  buckets.forEach((v, i) => {
    const date = new Date(now - (29 - i) * day);
    const bar = document.createElement('div');
    bar.className = 'chart-bars__bar';
    bar.style.height = `${Math.max((v / max) * 100, 1)}%`;
    bar.dataset.tooltip = `${date.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' })}: ${eur(v)}`;
    chartEl.appendChild(bar);
  });
  $('#salesChartTotal').textContent = 'Spolu: ' + eur(buckets.reduce((s, v) => s + v, 0));

  // 2) Donut chart — order status breakdown
  const statusCounts = {};
  allOrders.forEach(o => statusCounts[o.status] = (statusCounts[o.status] || 0) + 1);
  const statusColors = {
    pending:   '#dba617',
    paid:      '#2271b1',
    shipped:   '#4ba3df',
    delivered: '#00a32a',
    cancelled: '#d63638',
  };
  renderDonut(statusCounts, statusColors, STATUS_LABEL);

  // 3) Top 10 products horizontal bars
  const counts = {};
  orders.forEach(o => o.items.forEach(it => counts[it.id] = (counts[it.id] || 0) + it.qty));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topMax = top.length ? top[0][1] : 1;
  $('#topProductsBars').innerHTML = top.map(([id, count]) => {
    const f = FRAGRANCES.find(x => x.id === id);
    return `
      <li>
        <span class="chart-hbars__label">${f ? f.veelyn_name : id}</span>
        <div class="chart-hbars__bar"><div class="chart-hbars__bar-fill" style="width:${(count / topMax) * 100}%"></div></div>
        <span class="chart-hbars__value">${count}×</span>
      </li>
    `;
  }).join('') || '<li style="color:var(--text-mute);">Žiadne predaje.</li>';

  // 4) Payment methods bars
  const payCounts = {};
  orders.forEach(o => payCounts[o.paymentMethod] = (payCounts[o.paymentMethod] || 0) + 1);
  renderHBars('#paymentBars', payCounts, 'Spôsob platby');

  // 5) Shipping methods bars
  const shipCounts = {};
  orders.forEach(o => shipCounts[o.shippingMethod] = (shipCounts[o.shippingMethod] || 0) + 1);
  renderHBars('#shippingBars', shipCounts, 'Spôsob doručenia');
}

function renderDonut(data, colors, labels) {
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (total === 0) {
    $('#statusDonut').innerHTML = '<text x="100" y="105" text-anchor="middle" fill="#a7aaad" font-size="14">Žiadne dáta</text>';
    $('#statusLegend').innerHTML = '';
    return;
  }

  const cx = 100, cy = 100, r = 70;
  const C = 2 * Math.PI * r;
  let offset = 0;
  let svg = `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="#f0f0f1" stroke-width="24" fill="none"/>`;
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  entries.forEach(([key, count]) => {
    const portion = count / total;
    const dash = portion * C;
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${colors[key] || '#787c82'}" stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})">
      <title>${labels[key] || key}: ${count}</title>
    </circle>`;
    offset += dash;
  });
  svg += `<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="22" font-weight="800" fill="#1d2327">${total}</text>`;
  svg += `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="11" fill="#787c82">objednávok</text>`;
  $('#statusDonut').innerHTML = svg;

  $('#statusLegend').innerHTML = entries.map(([key, count]) => `
    <li>
      <span class="chart-legend__dot" style="background:${colors[key]}"></span>
      <span class="chart-legend__label">${labels[key] || key}</span>
      <span class="chart-legend__value">${count} (${Math.round(count / total * 100)} %)</span>
    </li>
  `).join('');
}

function renderHBars(selector, data, fallbackLabel) {
  const el = $(selector);
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    el.innerHTML = `<li style="color:var(--text-mute);">Bez dát.</li>`;
    return;
  }
  const max = entries[0][1];
  el.innerHTML = entries.map(([key, count]) => `
    <li>
      <span class="chart-hbars__label">${esc(key)}</span>
      <div class="chart-hbars__bar"><div class="chart-hbars__bar-fill" style="width:${(count / max) * 100}%"></div></div>
      <span class="chart-hbars__value">${count}</span>
    </li>
  `).join('');
}

// === SPRÁVANIE NÁVŠTEVNÍKOV (dáta z track.js cez /api/admin/analytics) ===
async function renderBehavior() {
  const days = $('#behDays')?.value || '30';
  const set = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };
  const toObj = (arr) => Object.fromEntries((arr || []).map(x => [x.label, x.count]));
  try {
    const a = await apiGet('/api/admin/analytics?days=' + days);
    set('#behSince', a.sessions ? '' : 'Zatiaľ žiadne dáta — meranie beží od nasadenia track.js');
    set('#behSessions', a.sessions);
    set('#behVisitors', `${a.visitors} unikátnych · ${a.pageViews} zobrazení stránok`);
    set('#behBounce', a.bounceRate + ' %');
    set('#behConv', a.conversion + ' %');
    set('#behTime', `Ø čas na stránke ${a.avgTime} s`);
    set('#behErrors', a.errors);
    set('#behErrSub', a.errors ? '⚠️ niečo na webe padá — pozri zoznam dole' : 'nič nehlási');
    const errCard = $('#behErrCard'); if (errCard) errCard.style.outline = a.errors ? '2px solid #d63638' : '';

    // Funnel: % z návštev + pokles oproti predchádzajúcemu kroku
    const f = a.funnel || []; const base = f[0]?.count || 0; const fmax = base || 1;
    $('#behFunnel').innerHTML = f.map((s, i) => {
      const prev = i ? f[i - 1].count : s.count;
      const drop = prev ? Math.round((1 - s.count / prev) * 100) : 0;
      return `<li>
        <span class="chart-hbars__label">${s.step}</span>
        <div class="chart-hbars__bar"><div class="chart-hbars__bar-fill" style="width:${s.count / fmax * 100}%"></div></div>
        <span class="chart-hbars__value">${s.count} (${base ? Math.round(s.count / base * 100) : 0} %)${i && drop > 0 ? ` <span style="color:#d63638">−${drop} %</span>` : ''}</span>
      </li>`;
    }).join('') || '<li style="color:var(--text-mute)">Bez dát.</li>';

    renderHBars('#behClicks', toObj(a.topClicks));
    renderHBars('#behExits', toObj(a.exitsBySection));
    renderHBars('#behScroll', a.scrollBuckets || {});
    renderHBars('#behCats', toObj(a.categories));
    const srch = toObj(a.searches);
    (a.zeroSearches || []).forEach(z => { delete srch[z.label]; srch[z.label + ' — 0 výsledkov ⚠️'] = z.count; });
    renderHBars('#behSearch', srch);
    renderHBars('#behSources', toObj(a.sources));
    renderHBars('#behDevices', toObj(a.devices));
    renderHBars('#behExitPages', toObj(a.exitsByPage));
    renderHBars('#behErrList', toObj(a.topErrors));
    $('#behProducts tbody').innerHTML = (a.products || []).map(p => {
      const fr = FRAGRANCES.find(x => x.id === p.id);
      return `<tr><td><strong>${fr ? fr.veelyn_name : esc(p.id)}</strong></td><td>${p.views}</td><td>${p.carts}</td><td style="color:${p.rate < 10 ? '#d63638' : '#00a32a'}">${p.rate} %</td></tr>`;
    }).join('') || '<tr><td colspan="4" style="color:var(--text-mute)">Bez dát.</td></tr>';
  } catch (e) {
    set('#behSince', 'Tracking API nedostupné: ' + e.message);
  }
}

// === SETTINGS ===
function setupSettings() {
  $('#changePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#newPassword').value.trim();
    if (pw.length < 8) { alert('Heslo aspoň 8 znakov.'); return; }
    if (!CURRENT_USER?.username) { alert('Nepodarilo sa zistiť používateľa — odhlás sa a prihlás znova.'); return; }
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    const orig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Mením…'; }
    try {
      // Persist to the backend so the change actually takes effect on the
      // server. Previously this only wrote to localStorage, which gave a
      // false sense of security — the password on the server stayed the
      // same and the user could still log in with the old one anywhere else.
      await apiPatch('/api/admin/users/' + encodeURIComponent(CURRENT_USER.username), { password: pw });
      $('#newPassword').value = '';
      alert('Heslo zmenené. Na všetkých zariadeniach sa prihlás znova.');
      // Force re-login so the new password gets a fresh token.
      logout();
    } catch (err) {
      console.error('change password failed', err);
      alert('Zmena hesla zlyhala: ' + (err?.message || 'unknown'));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = orig; }
    }
  });
  $('#resetDataBtn').addEventListener('click', resetAllData);
}

// === REFRESH ALL ===
function refreshAll() {
  renderDashboard();
  renderOrders();
  if (CURRENT_USER?.role !== 'warehouse') {
    renderProducts();
    renderCustomers();
    renderDiscounts();
    renderAnalytics();
    renderUsers();
  }
}

// === INIT ===
function initApp() {
  setupTabs();
  setupProductFilters();
  setupSettings();

  $('#topbarDate').textContent = new Date().toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });

  // Order filters
  $('#orderStatusFilter').addEventListener('change', e => { orderFilters.status = e.target.value; renderOrders(); });
  $('#orderSearch').addEventListener('input', e => { orderFilters.search = e.target.value; renderOrders(); });

  // Buttons (seed/empty môžu chýbať — guard)
  $('#seedOrdersBtn')?.addEventListener('click', () => {});
  $('#seedOrdersBtnEmpty')?.addEventListener('click', () => {});
  $('#newOrderBtn')?.addEventListener('click', () => alert('Manuálne vytváranie objednávky príde neskôr.'));
  $('#exportOrdersBtn')?.addEventListener('click', exportOrdersCSV);
  $('#newDiscountBtn')?.addEventListener('click', () => switchTab('discounts'));

  $('#logoutBtn').addEventListener('click', logout);

  // Discount + user form submit handlers (admin only)
  setupDiscountForm();
  setupUserForm();

  // Order detail open + dialog close
  document.addEventListener('click', async (e) => {
    const orderTrigger = e.target.closest('[data-order]');
    if (orderTrigger) { openOrderDetail(orderTrigger.dataset.order); return; }
    if (e.target.matches('[data-close], .dialog__backdrop')) { closeDialog(); return; }

    const toggleD = e.target.closest('[data-toggle-discount]');
    if (toggleD) {
      const code = toggleD.dataset.toggleDiscount;
      const currentlyActive = toggleD.dataset.current === '1';
      try { await apiPatch('/api/admin/discounts/' + code, { active: !currentlyActive }); }
      catch (err) { alert('Chyba: ' + err.message); }
      renderDiscounts();
      return;
    }
    const delD = e.target.closest('[data-delete-discount]');
    if (delD) {
      if (!confirm('Vymazať kód ' + delD.dataset.deleteDiscount + '?')) return;
      try { await apiDelete('/api/admin/discounts/' + delD.dataset.deleteDiscount); }
      catch (err) { alert('Chyba: ' + err.message); }
      renderDiscounts();
      return;
    }
    const delU = e.target.closest('[data-delete-user]');
    if (delU) {
      if (!confirm('Vymazať používateľa ' + delU.dataset.deleteUser + '?')) return;
      try { await apiDelete('/api/admin/users/' + delU.dataset.deleteUser); }
      catch (err) { alert('Chyba: ' + err.message); }
      renderUsers();
      return;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDialog();
  });

  // Auto-refresh objednávok zo servera každých 30s
  setInterval(async () => {
    try { await fetchOrders(); renderDashboard(); renderOrders(); } catch {}
  }, 30000);

  refreshAll();
}

// Boot
setupLogin();
