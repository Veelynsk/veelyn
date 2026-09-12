/* Veelyn — anonymné meranie správania návštevníkov.
   Meria: zobrazenia stránok, kliky (kam ľudia klikajú), hĺbku scrollu,
   odchody (z ktorej sekcie a pri akom scrolle), e-commerce funnel zrkadlený
   z dataLayer (view_item → add_to_cart → begin_checkout → purchase),
   vyhľadávanie a JS chyby.
   Bez cookies a bez osobných údajov: náhodné ID v sessionStorage/localStorage,
   žiadna IP ani user-agent. Ak návštevník v Cookiebote odmietol štatistiky,
   nič sa neposiela. Dáta číta admin → Štatistiky → Správanie návštevníkov. */
(function () {
  'use strict';
  var IS_LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var API = window.VEELYN_API || (IS_LOCAL ? 'http://localhost:3001' : 'https://veelyn-production-8876.up.railway.app');
  var rnd = function () { return Math.random().toString(36).slice(2, 12) + Date.now().toString(36); };
  var sid, uid;
  try { sid = sessionStorage.getItem('vt_sid'); if (!sid) { sid = rnd(); sessionStorage.setItem('vt_sid', sid); } } catch (e) { sid = rnd(); }
  try { uid = localStorage.getItem('vt_uid'); if (!uid) { uid = rnd(); localStorage.setItem('vt_uid', uid); } } catch (e) { uid = null; }
  var device = matchMedia('(max-width: 699px)').matches ? 'mobile' : matchMedia('(max-width: 1024px)').matches ? 'tablet' : 'desktop';
  var page = location.pathname + (location.search.indexOf('vona=') !== -1 ? location.search : '');
  var ref = '';
  try {
    if (document.referrer) ref = new URL(document.referrer).hostname.replace(/^www\./, '');
    if (ref === location.hostname.replace(/^www\./, '')) ref = '';
  } catch (e) {}
  var q = new URLSearchParams(location.search);
  var utm = {};
  ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) { if (q.get(k)) utm[k] = q.get(k).slice(0, 60); });

  // Rešpektuje VÝSLOVNÉ odmietnutie štatistík v Cookiebote. Kým návštevník
  // nerozhodol (lišta sa nezobrazila), anonymné meranie bez cookies beží.
  function consentOk() {
    try {
      var cb = window.Cookiebot;
      if (!cb) return true;
      if (cb.declined === true) return false;
      if (cb.consented === true && cb.consent && cb.consent.statistics === false) return false;
      return true;
    } catch (e) { return true; }
  }

  var queue = [], timer = null;
  function send(useBeacon) {
    if (!queue.length) return;
    if (!consentOk()) { queue.length = 0; return; }
    var body = JSON.stringify({ events: queue.splice(0, 50) });
    if (useBeacon && navigator.sendBeacon) {
      try { navigator.sendBeacon(API + '/api/track', new Blob([body], { type: 'text/plain' })); return; } catch (e) {}
    }
    try { fetch(API + '/api/track', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, keepalive: true }).catch(function () {}); } catch (e) {}
  }
  function track(type, label, meta) {
    queue.push({ ts: Date.now(), sid: sid, uid: uid, type: type, page: page,
      label: label == null ? null : String(label).slice(0, 120), meta: meta || null, device: device, ref: ref });
    if (queue.length >= 20) send(false);
    else if (!timer) timer = setTimeout(function () { timer = null; send(false); }, 4000);
  }
  window.veelynTrack = track;

  // --- zobrazenie stránky ---
  track('page_view', document.title.slice(0, 120), Object.keys(utm).length ? utm : null);

  // --- sekcie (na "odkiaľ odchádzajú") ---
  function nameOf(s) { return s.getAttribute('data-section') || s.id || (typeof s.className === 'string' && s.className.split(/\s+/)[0]) || s.tagName.toLowerCase(); }
  function sectionOf(el) { var s = el.closest('section, header, footer, [data-section]'); return s ? nameOf(s) : ''; }
  var maxScroll = 0, lastSection = '';
  function onScroll() {
    var h = document.documentElement, total = h.scrollHeight - innerHeight;
    var p = total > 0 ? Math.round((scrollY / total) * 100) : 100;
    if (p > maxScroll) maxScroll = Math.min(100, p);
    var mid = scrollY + innerHeight / 2, best = '', bd = Infinity;
    var secs = document.querySelectorAll('section, [data-section]');
    for (var i = 0; i < secs.length; i++) {
      var r = secs[i].getBoundingClientRect(), d = Math.abs(r.top + scrollY + r.height / 2 - mid);
      if (d < bd) { bd = d; best = nameOf(secs[i]); }
    }
    if (best) lastSection = best;
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  var milestones = {};
  addEventListener('scroll', function () {
    [25, 50, 75, 100].forEach(function (m) { if (maxScroll >= m && !milestones[m]) { milestones[m] = 1; track('scroll', String(m), { section: lastSection }); } });
  }, { passive: true });

  // --- kliky: tlačidlá, odkazy, prvky s data-track ---
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-track], button, a, [role="button"]') : null;
    if (!el) return;
    var txt = (el.getAttribute('data-track') || el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!txt) txt = el.id || (typeof el.className === 'string' && el.className.split(/\s+/)[0]) || el.tagName.toLowerCase();
    var cls = typeof el.className === 'string' ? el.className.split(/\s+/)[0] : '';
    var ctx = cls + ' ' + (el.parentElement && typeof el.parentElement.className === 'string' ? el.parentElement.className : '');
    var isCat = /(filter|gender|brand|kateg|categor|chip|tab)/i.test(ctx);
    track('click', txt, { cls: cls || undefined, sec: sectionOf(el) || undefined, cat: isCat ? 1 : undefined });
  }, true);

  // --- odchod zo stránky ---
  var t0 = Date.now(), exited = false;
  function exit() {
    if (exited) return; exited = true;
    track('exit', lastSection || page, { scroll: maxScroll, section: lastSection, time: Math.round((Date.now() - t0) / 1000) });
    send(true);
  }
  addEventListener('pagehide', exit);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') exit(); });

  // --- JS chyby (odhalia, keď niečo na webe nefunguje) ---
  addEventListener('error', function (e) {
    track('error', String(e.message || 'error').slice(0, 120), { src: String(e.filename || '').split('/').pop(), line: e.lineno });
  });
  addEventListener('unhandledrejection', function (e) {
    var r = e.reason; track('error', ('Promise: ' + (r && (r.message || r))).slice(0, 120));
  });

  // --- e-commerce funnel zrkadlený z dataLayer (GA4 spec eventy) ---
  var dl = (window.dataLayer = window.dataLayer || []);
  var MIRROR = { view_item: 1, add_to_cart: 1, remove_from_cart: 1, view_cart: 1, begin_checkout: 1, purchase: 1, search: 1, sign_up: 1 };
  function seen(ev) {
    if (!ev || !MIRROR[ev.event] || ev.ecommerce === null) return;
    var items = (ev.ecommerce && ev.ecommerce.items) || [];
    var label = ev.event === 'search' ? (ev.search_term || '') : ((items[0] && (items[0].item_id || items[0].item_name)) || '');
    var meta = {};
    if (ev.ecommerce && ev.ecommerce.value != null) meta.value = ev.ecommerce.value;
    if (items.length > 1) meta.n = items.length;
    if (ev.event === 'search' && ev.results != null) meta.results = ev.results;
    track(ev.event, label, Object.keys(meta).length ? meta : null);
  }
  for (var i = 0; i < dl.length; i++) seen(dl[i]);
  var origPush = dl.push.bind(dl);
  dl.push = function () { for (var j = 0; j < arguments.length; j++) seen(arguments[j]); return origPush.apply(null, arguments); };
})();
