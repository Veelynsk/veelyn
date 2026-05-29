
// --- Config ---
// Web3Forms access key (zdarma na https://web3forms.com).
// Po registrácii sem vlož svoj kľúč — kým je prázdny, formulár beží v "dev" móde a iba zobrazí alert.
const WEB3FORMS_ACCESS_KEY = '';

// --- App state ---
const state = {
  cart: [],
  carouselIdx: 0,
  carouselInterval: null,
  bundleSlots: [null, null, null, null],
  ratings: {}, // id -> { avg, count }
  reviews: {}  // id -> [reviews]
};

// --- ANALYTICS / GTM dataLayer ---------------------------------------
// All e-commerce events flow through dataLayer pushes so the GTM tags
// (GA4, Meta Pixel, Google Ads conversion, TikTok Pixel, …) can be
// added/removed in the GTM UI without code changes.
//
// Event names mirror GA4 e-commerce spec so GA4 "Enhanced E-commerce"
// works out of the box. Meta/TikTok mappings are documented in
// /GTM_SETUP.md.
const dataLayer = (window.dataLayer = window.dataLayer || []);

function trackEvent(name, payload = {}) {
  try {
    dataLayer.push({ event: name, ecommerce: null }); // reset prior
    dataLayer.push({ event: name, ...payload });
  } catch (e) {}
}

function gaItem(frag, qty = 1, variant = 'veelyn') {
  if (!frag) return null;
  const price = variant === 'original' ? frag.original_price : frag.veelyn_price;
  return {
    item_id: frag.id,
    item_name: `VEELYN ${frag.veelyn_name}`,
    item_brand: 'Veelyn',
    item_variant: variant,
    item_category: frag.gender === 'M' ? 'Pánska' : frag.gender === 'Z' ? 'Dámska' : 'Unisex',
    item_category2: `Dupé ${frag.brand}`,
    price: Number(price),
    quantity: qty,
  };
}

function trackViewItem(frag) {
  if (!frag) return;
  trackEvent('view_item', {
    ecommerce: { currency: 'EUR', value: Number(frag.veelyn_price), items: [gaItem(frag)] },
  });
}
function trackAddToCart(frag, qty = 1, variant = 'veelyn') {
  if (!frag) return;
  const price = variant === 'original' ? frag.original_price : frag.veelyn_price;
  trackEvent('add_to_cart', {
    ecommerce: { currency: 'EUR', value: Number(price) * qty, items: [gaItem(frag, qty, variant)] },
  });
}
function trackRemoveFromCart(frag, qty = 1, variant = 'veelyn') {
  if (!frag) return;
  trackEvent('remove_from_cart', {
    ecommerce: { currency: 'EUR', items: [gaItem(frag, qty, variant)] },
  });
}
function trackViewCart(items, total) {
  trackEvent('view_cart', {
    ecommerce: {
      currency: 'EUR',
      value: Number(total) || 0,
      items: (items || []).map(i => {
        const f = FRAGRANCES.find(x => x.id === i.id);
        return gaItem(f, i.qty || 1, i.variant);
      }).filter(Boolean),
    },
  });
}
function trackBeginCheckout(items, total) {
  trackEvent('begin_checkout', {
    ecommerce: {
      currency: 'EUR',
      value: Number(total) || 0,
      items: (items || []).map(i => {
        const f = FRAGRANCES.find(x => x.id === i.id);
        return gaItem(f, i.qty || 1, i.variant);
      }).filter(Boolean),
    },
  });
}
function trackPurchase(order) {
  if (!order) return;
  trackEvent('purchase', {
    ecommerce: {
      transaction_id: order.id,
      value: Number(order.total) || 0,
      currency: 'EUR',
      tax: 0,
      shipping: Number(order.shipping) || 0,
      coupon: order.couponCode || undefined,
      items: (order.items || []).map(i => {
        const f = FRAGRANCES.find(x => x.id === i.id);
        return gaItem(f, i.qty || 1, i.variant);
      }).filter(Boolean),
    },
  });
}
function trackSearch(query) {
  if (!query) return;
  trackEvent('search', { search_term: String(query) });
}

// --- Backend API ---
// Dev: localhost:3001. Production: Railway.
const VEELYN_API = (typeof window !== 'undefined' && window.VEELYN_API) ||
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:3001'
    : 'https://veelyn-production.up.railway.app');

// --- Helpers ---
const $ = (s, p=document) => p.querySelector(s);
const $$ = (s, p=document) => Array.from(p.querySelectorAll(s));
const eur = (v) => v.toFixed(2).replace('.', ',') + ' €';
const genderLabel = { M: 'Pánska', Z: 'Dámska', U: 'Unisex' };
// Strips diacritics + apostrophes, returns kebab-case slug. Matches scripts/process-originals.py
const slugifyOriginal = (s) => (s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/['’]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

// Generate stable ratings + reviews based on id hash
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
function seedRatings() {
  FRAGRANCES.forEach(f => {
    const h = hashStr(f.id);
    const avg = (4.30 + (h % 68) / 100); // 4.30 - 4.97
    const count = 40 + (h % 136); // 40 - 175
    state.ratings[f.id] = { avg: parseFloat(avg.toFixed(2)), count };

    // 3-6 reviews per product
    const reviewCount = 3 + (h % 4);
    state.reviews[f.id] = [];
    for (let i = 0; i < reviewCount; i++) {
      const seed = h + i * 17;
      const name = REVIEW_NAMES[seed % REVIEW_NAMES.length];
      const tpl = REVIEW_TEMPLATES[seed % REVIEW_TEMPLATES.length];
      const stars = (seed % 10 === 0) ? 4 : 5;
      const dayOffset = (seed % 90) + 1;
      const date = new Date(Date.now() - dayOffset * 86400000);
      state.reviews[f.id].push({
        name,
        text: tpl.t.replace('%ORIG%', f.original_name).replace('%VEEL%', f.veelyn_name),
        highlight: tpl.h,
        stars,
        date: date.toLocaleDateString('sk-SK', { day:'numeric', month:'long', year:'numeric' })
      });
    }
  });
}

function renderStars(rating) {
  const full = Math.floor(rating);
  const partial = (rating - full) >= 0.25 && (rating - full) < 0.75;
  const fullExtra = (rating - full) >= 0.75 ? 1 : 0;
  const total = full + fullExtra + (partial ? 1 : 0);
  let html = '';
  for (let i = 0; i < full + fullExtra; i++) html += '<span>★</span>';
  if (partial) html += '<span class="partial">★</span>';
  for (let i = total; i < 5; i++) html += '<span class="empty">★</span>';
  return html;
}

// --- MARQUEE ---
function setupMarquees() {
  const top = $('#marqueeTop');
  const mid = $('#marqueeMid');
  const skFlag = '<svg class="sk-flag" viewBox="0 0 30 20" aria-hidden="true" focusable="false" shape-rendering="geometricPrecision">'
    + '<rect width="30" height="6.67" fill="#fff"/>'
    + '<rect y="6.67" width="30" height="6.66" fill="#0b4ea2"/>'
    + '<rect y="13.33" width="30" height="6.67" fill="#ee1c25"/>'
    + '<g transform="translate(3,3.8)">'
      + '<path d="M-0.6 -0.6 H8.6 V7.4 C8.6 10.4 6.2 12.1 4 12.9 C1.8 12.1 -0.6 10.4 -0.6 7.4 Z" fill="#fff"/>'
      + '<path d="M0 0 H8 V7.1 C8 9.5 6 11 4 11.8 C2 11 0 9.5 0 7.1 Z" fill="#ee1c25"/>'
      + '<rect x="3.55" y="1.8" width="0.9" height="6.6" fill="#fff"/>'
      + '<rect x="2.3" y="3.3" width="3.4" height="0.8" fill="#fff"/>'
      + '<rect x="1.7" y="5" width="4.6" height="0.8" fill="#fff"/>'
      + '<path d="M0.6 8.6 C1.4 7.3 2.4 7.9 3 8.6 C3.4 7.6 4 7.6 4.4 8.6 C5 7.9 6 7.3 6.8 8.6 V9.5 H0.6 Z" fill="#0b4ea2"/>'
    + '</g>'
    + '</svg>';
  const frFlag = '<span class="fr-flag" aria-hidden="true"></span>';
  const topItems = [`MADE IN SLOVAKIA ${skFlag}`, `HATED IN PARIS ${frFlag}`];
  const midItems = ['VOŇAJ AKO MILIÓN EUR'];

  // Build ONE set of content, then duplicate it exactly for seamless loop with translateX(-50%).
  function buildSet(items, itemClass) {
    return items.map(t => `<span class="marquee__item ${itemClass||''}">${t}</span><span class="marquee__sep">✦</span>`).join('');
  }

  // Repeat the base set enough times that the track is wider than the viewport.
  // Then we duplicate the ENTIRE block once so translateX(-50%) loops perfectly.
  const topBase = '';
  let topOne = '';
  for (let i = 0; i < 8; i++) topOne += buildSet(topItems, '');
  const topHTML = topOne + topOne;

  let midOne = '';
  for (let i = 0; i < 6; i++) midOne += buildSet(midItems, 'marquee__item--big');
  const midHTML = midOne + midOne;

  // iOS Safari intermittently skips the CSS animation start when the track
  // content is set via JS (especially when the tab was backgrounded during
  // page load or restored from bfcache). We force-restart the animation after
  // setting innerHTML by toggling animation:none + forcing a reflow.
  function kickAnimation(el) {
    if (!el) return;
    el.style.animation = 'none';
    // Force layout — required for the animation restart to take effect.
    // eslint-disable-next-line no-unused-expressions
    el.offsetWidth;
    el.style.animation = '';
  }

  if (top) {
    top.innerHTML = topHTML;
    top.style.willChange = 'transform';
    requestAnimationFrame(() => kickAnimation(top));
  }
  if (mid) {
    mid.innerHTML = midHTML;
    mid.style.willChange = 'transform';
    requestAnimationFrame(() => kickAnimation(mid));
  }

  // Handle bfcache restore (back/forward navigation on mobile Safari):
  // the page comes back paused, so we re-kick the marquees on pageshow.
  // We only register the listener once.
  if (!setupMarquees._pageshowBound) {
    setupMarquees._pageshowBound = true;
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        const t = document.getElementById('marqueeTop');
        const m = document.getElementById('marqueeMid');
        kickAnimation(t);
        kickAnimation(m);
      }
    });
    // Also re-kick when the tab becomes visible again (mobile Safari can
    // pause CSS animations in background tabs without resuming cleanly).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const t = document.getElementById('marqueeTop');
        const m = document.getElementById('marqueeMid');
        kickAnimation(t);
        kickAnimation(m);
      }
    });
  }
}

// --- BOTTLE renderer (Veelyn brand cylindrical bottle, ribbed cap, paper label) ---
const BOTTLE_COLORS = {
  'i-am-blue':          '#8fc8e0',
  'savage-queen':       '#6ea4c4',
  'five':               '#e6c773',
  'moulin-rouge':       '#c45670',
  'old-money':          '#c8a070',
  'hard-cash':          '#b07654',
  'forbidden-cherries': '#a83b50',
  'go-girl':            '#d99a8a',
  'liquid-gold':        '#e0b25a',
  'adore-me':           '#e9c19a',
  'cherry-pulse':       '#c84860',
  'savage-spell':       '#7faecf',
  'noble-wood':         '#8b6a4c',
  'sweet-cig':          '#9c7048',
  'dark-flower':        '#5a3a4c',
  'dark-tobacco':       '#9c6a40',
  'pink-desire':        '#e4a8c0',
  'velvet-rush':        '#8e5a8a',
  'ocean-wave':         '#7fb0d4',
  'marine':             '#6fa8c8',
  'satin':              '#a08080',
  'spice':              '#b8704c',
  'apple-bliss-01':     '#c4d690',
  'candy-whip-81':      '#f0d4dc',
  'vanilla-supreme-64': '#dec59c',
  'coco-dream-21':      '#e8dac6',
  'tropical-island':    '#f0d28a',
  'sunset-elixir':      '#dca070',
  'imagine-this':       '#9c8acc',
  'desert-storm':       '#a86650',
  'cosmic-flame':       '#c87060',
  'midnight-wish':      '#5e3a6e',
  'limitless':          '#8ec7d4',
  'holy-water':         '#a8d4d0',
  'everest-gold':       '#9cbcd0',
  'suited-irish':       '#a4c8a0',
  'silk-road':          '#d8a0b0',
  'og-river':           '#7ea890',
  'weak-king':          '#8094b0',
  'important':          '#cad0c4',
  'trojan-horse':       '#d4b890',
  'blaze':              '#ce9c70',
  'pure-green':         '#9cc090',
  'blue-motion':        '#84b0d0',
  'mystery':            '#dac0d4',
  'just-leather':       '#a07050',
  'absolute':           '#dac890',
  'oud-fire':           '#7c4830',
  'saint-rome':         '#e0b4c4',
  'roman-man':          '#a4b4c8',
  'star':               '#d8b8d4',
  'the-one':            '#7ca0b8',
  'she-is':             '#e4a8b8',
  'go-boy':             '#9c7460',
  'go-go-girl':         '#dc94a4',
  'doria':              '#e8c0c8',
  'you-and-me':         '#bc8a78',
  'purple-flower':      '#bc94c8',
  'illa-van-28':        '#dec0a0',
  'dubai-dream-33':     '#c4d4a0',
  'burning-desire-48':  '#b04050',
  'evening-elixir':     '#b08864',
  'harmony':            '#c4b4d4',
  'the-horizon':        '#a8c8d8',
  'deep-dive':          '#7ca8c8',
  'sun-coast':          '#e4c89c',
  'dream-big':          '#dec48c',
  'el-paso':            '#9ca0b4'
};
function fragColor(frag) {
  if (BOTTLE_COLORS[frag.id]) return BOTTLE_COLORS[frag.id];
  let h = 0;
  for (let i = 0; i < frag.id.length; i++) h = (h * 31 + frag.id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 35%, 60%)`;
}
// Explicit numbers tied to printed photo labels; falls back to position in catalog
const FRAG_NUMBERS = {
  'i-am-blue': 9,
};
function fragNumber(frag) {
  if (FRAG_NUMBERS[frag.id]) return FRAG_NUMBERS[frag.id];
  const idx = FRAGRANCES.findIndex(f => f.id === frag.id);
  return idx >= 0 ? (idx + 1) : 0;
}

function bottleHTML(frag, kind = 'veelyn') {
  const color = fragColor(frag);
  const num = fragNumber(frag);
  if (kind === 'veelyn') {
    // Photo is canonical; HTML fallback only used when image is missing
    return `
      <div class="bottle-veelyn" style="--liquid:${color}">
        <img class="bottle-photo" src="images/veelyn/${frag.id}.png?v=2"
             alt="VEELYN ${frag.veelyn_name}"
             onerror="this.classList.add('bottle-photo--missing'); this.parentElement.classList.add('bottle--no-photo')">
        <div class="bottle-fallback">
          <div class="bottle-cap"></div>
          <div class="bottle-collar"></div>
          <div class="bottle-glass">
            <div class="bottle-liquid"></div>
            <div class="bottle-shine"></div>
            <div class="bottle-label">
              <div class="bottle-label__vertical">VEELYN</div>
              <div class="bottle-label__name">№${num} / ${frag.veelyn_name}</div>
              <div class="bottle-label__rule"></div>
              <div class="bottle-label__type">eau de parfum</div>
              <div class="bottle-label__size">50 ml / 1.7 fl. oz.</div>
              <div class="bottle-label__tagline">Smells familiar?</div>
            </div>
          </div>
          <div class="bottle-base"></div>
        </div>
      </div>`;
  }
  // Original (competitor) bottle
  const slug = slugifyOriginal(frag.original_name);
  return `
    <div class="bottle-original" style="--liquid:${color}">
      <img class="bottle-photo" src="images/originals/${slug}.png"
           alt="${frag.brand} ${frag.original_name}"
           onerror="this.classList.add('bottle-photo--missing'); this.parentElement.classList.add('bottle--no-photo')">
      <div class="bottle-fallback">
        <div class="bottle-cap bottle-cap--alt"></div>
        <div class="bottle-glass bottle-glass--alt">
          <div class="bottle-liquid"></div>
          <div class="bottle-shine"></div>
          <div class="bottle-label bottle-label--alt">
            <div class="bottle-label__brand-alt">${frag.brand.split(' ')[0].toUpperCase()}</div>
            <div class="bottle-label__name-alt">${frag.original_name}</div>
          </div>
        </div>
      </div>
    </div>`;
}

// --- CAROUSEL — mirrors TOP_SELLERS (defined below) so carousel & bestsellers grid stay in sync ---
const HERO_PICKS = ['moulin-rouge', 'imagine-this', 'hard-cash', 'noble-wood', 'harmony', 'the-horizon', 'savage-queen', 'forbidden-cherries'];

function renderCarousel() {
  const stage = $('#carouselStage');
  const dots = $('#carouselDots');
  const heroFrags = HERO_PICKS.map(id => FRAGRANCES.find(f => f.id === id)).filter(Boolean);

  stage.innerHTML = heroFrags.map((f, i) => {
    const origSlug = slugifyOriginal(f.original_name);
    return `
    <div class="carousel__slide" data-idx="${i}" data-id="${f.id}">
      <div class="carousel__bottles carousel__bottles--solo">
        ${bottleHTML(f, 'veelyn')}
      </div>
      <h3 class="carousel__name">N°${fragNumber(f)}<span class="carousel__name-sep">·</span>${f.veelyn_name}</h3>
      <div class="carousel__inspired" aria-label="Inšpirované ${f.brand} ${f.original_name}">
        <span class="carousel__inspired-quote">„Inšpirované <em>${f.brand}</em> <strong>${f.original_name}</strong>"</span>
      </div>
      <div class="carousel__price-box">
        <div class="carousel__price-row carousel__price-row--orig">
          <span>Originál</span>
          <span class="price">${eur(f.original_price)}</span>
        </div>
        <div class="carousel__price-divider"></div>
        <div class="carousel__price-row carousel__price-row--ours">
          <span>Veelyn</span>
          <span class="price">${eur(f.veelyn_price)}</span>
        </div>
        <div class="carousel__price-divider"></div>
        <div class="carousel__price-row carousel__price-row--saving">
          <span>Ušetríš</span>
          <span class="price">${eur(f.original_price - f.veelyn_price)}</span>
        </div>
      </div>
      <article class="match-card prod-card__match carousel__match" data-orig="${f.id}" data-orig-id="${f.id}">
        <p class="match-card__title">
          <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
            <path d="M7 12l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="match-card__title-text match-card__title-short">Perfektná zhoda</span>
          <span class="match-card__title-text match-card__title-long">Perfektná zhoda vôňových nôt</span>
        </p>
        <div class="match-card__row">
          <div class="match-card__thumb">
            <img src="images/originals/${origSlug}.png"
                 alt="${f.brand} ${f.original_name}"
                 loading="lazy"
                 decoding="async"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="match-card__thumb-fallback" style="display:none;">
              <span>${(f.brand||'').slice(0,2).toUpperCase()}</span>
            </div>
          </div>
          <div class="match-card__body">
            <p class="match-card__brand"><span>${f.brand}</span> | ${f.original_name}</p>
            <p class="match-card__price">
              <strong>${eur(f.original_price)}</strong>
            </p>
          </div>
        </div>
        <a class="match-card__link carousel__match-link" href="#" data-orig-link="${f.id}">Zobraziť produkt <span aria-hidden="true">→</span></a>
      </article>
      <p class="carousel__cheaper-line">
        Lacnejšia o <strong>${eur(f.original_price - f.veelyn_price)}</strong> ako <strong>${f.original_name}</strong>
      </p>
    </div>
  `;
  }).join('');

  dots.innerHTML = heroFrags.map((_, i) =>
    `<button class="carousel__dot ${i === 0 ? 'is-active' : ''}" data-idx="${i}" aria-label="Slide ${i+1}"></button>`
  ).join('');

  $$('.carousel__dot').forEach(d => d.addEventListener('click', () => goToSlide(parseInt(d.dataset.idx))));
  $$('.carousel__slide').forEach(s => {
    s.addEventListener('click', (e) => {
      // "Zobraziť produkt →" link inside the Perfektná zhoda match-card
      // opens the ORIGINAL perfume preview (openMatchOrigin), not the
      // Veelyn product modal.
      const origLink = e.target.closest('[data-orig-link]');
      if (origLink) {
        e.preventDefault();
        e.stopPropagation();
        openMatchOrigin(origLink.dataset.origLink);
        return;
      }
      // CTA button click — handle separately
      if (e.target.closest('.carousel__cta')) {
        e.stopPropagation();
        openProduct(s.dataset.id);
        return;
      }
      const idx = parseInt(s.dataset.idx);
      // If active card -> open product. If neighbour -> jump to it
      if (s.classList.contains('is-active')) {
        openProduct(s.dataset.id);
      } else {
        goToSlide(idx);
      }
    });
  });

  goToSlide(0);
  startCarousel();
}

function goToSlide(idx) {
  const slides = $$('.carousel__slide');
  const total = slides.length;
  if (total === 0) return;

  const newIdx = ((idx % total) + total) % total;
  const prevIdx = state.carouselIdx;
  // direction of intended motion: +1 = forward, -1 = back, 0 = first render / same
  let direction = 0;
  if (newIdx !== prevIdx) {
    const fwd = (newIdx - prevIdx + total) % total;
    const back = (prevIdx - newIdx + total) % total;
    direction = fwd <= back ? 1 : -1;
  }

  slides.forEach((s) => {
    const i = parseInt(s.dataset.idx);
    const prevSide = s.dataset.side || ''; // 'left' | 'right' | ''
    // signed offset from new active using shortest path
    let offset = i - newIdx;
    if (offset > total / 2) offset -= total;
    else if (offset < -total / 2) offset += total;
    // tie-break (offset == ±total/2): keep side consistent with motion direction
    if (Math.abs(offset) === total / 2) {
      offset = direction >= 0 ? -total / 2 : total / 2;
    }

    let cls = '';
    let side = '';
    if (offset === 0) cls = 'is-active';
    else if (offset === -1) { cls = 'is-prev'; side = 'left'; }
    else if (offset === 1) { cls = 'is-next'; side = 'right'; }
    else if (offset < 0) { cls = 'is-out-left'; side = 'left'; }
    else { cls = 'is-out-right'; side = 'right'; }

    // If a slide flips sides while invisible (out-left ↔ out-right), snap without transition
    const flipping = prevSide && side && prevSide !== side
      && (cls === 'is-out-left' || cls === 'is-out-right')
      && (s.classList.contains('is-out-left') || s.classList.contains('is-out-right'));

    s.classList.remove('is-active', 'is-prev', 'is-next', 'is-out-left', 'is-out-right');
    if (flipping) {
      s.classList.add('is-snap');
      s.classList.add(cls);
      // force reflow then drop is-snap so future transitions resume
      void s.offsetWidth;
      s.classList.remove('is-snap');
    } else {
      s.classList.add(cls);
    }
    s.dataset.side = side;
  });

  state.carouselIdx = newIdx;

  $$('.carousel__dot').forEach(d =>
    d.classList.toggle('is-active', parseInt(d.dataset.idx) === state.carouselIdx)
  );
}

function startCarousel() {
  stopCarousel();
  state.carouselInterval = setInterval(() => goToSlide(state.carouselIdx + 1), 5000);
}
function stopCarousel() {
  if (state.carouselInterval) clearInterval(state.carouselInterval);
}

// --- MODALS ---
// Saved scroll position so we can restore it after closing the modal.
// body.lock + html.lock use position:fixed which is the only reliable
// way to stop iOS Safari from scrolling the page behind the modal.
let __savedScrollY = 0;
function openModal(id) {
  const el = document.getElementById('modal-' + id);
  if (!el) return;
  el.hidden = false;
  if (!document.body.classList.contains('lock')) {
    __savedScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    document.documentElement.style.top = `-${__savedScrollY}px`;
    document.body.style.top = `-${__savedScrollY}px`;
  }
  document.documentElement.classList.add('lock');
  document.body.classList.add('lock');
  // GA4 view_cart fires when the cart drawer is opened by any path
  // (header button, "added to cart" toast, bundle complete, …).
  if (id === 'cart') {
    try {
      const t = calcCheckoutTotals();
      trackViewCart(state.cart, t.total);
    } catch (e) {}
  }
}
function closeAllModals() {
  $$('.modal, .cart-drawer').forEach(m => m.hidden = true);
  const wasLocked = document.body.classList.contains('lock');
  document.documentElement.classList.remove('lock');
  document.body.classList.remove('lock');
  if (wasLocked) {
    document.documentElement.style.top = '';
    document.body.style.top = '';
    // Restore scroll position synchronously (jumping back to the place
    // the user was before they opened the modal).
    window.scrollTo(0, __savedScrollY);
  }
  // Clean up bundle-picking state — if user closes catalog mid-pick, the
  // is-bundle-picking class would otherwise persist and hide every "Pridaj
  // do kosika" CTA the next time catalog is opened normally.
  const catalogModal = document.getElementById('modal-catalog');
  if (catalogModal) {
    catalogModal.classList.remove('is-bundle-picking');
    delete catalogModal.dataset.bundleSlot;
    const hint = catalogModal.querySelector('.bundle-pick-hint');
    if (hint) hint.hidden = true;
  }
  // Notify deep-link manager so it can clear ?vona= from the URL + reset
  // <title> / canonical when the product modal was closed.
  document.dispatchEvent(new CustomEvent('modal:close'));
}

// --- HOME-PAGE BESTSELLERS GRID ---
function renderBestsellers() {
  const grid = $('#bestsellersGrid');
  if (!grid) return;
  // 15 top sellers — fills 3 rows of 5 on desktop (≥5-col grid), 5 rows of
  // 3 on mobile (3-col grid). Pass showMatch=true so each card renders the
  // "Perfektná zhoda" original-fragrance reference.
  const topIds = TOP_SELLERS.slice();
  // TOP_SELLERS may have fewer than 15 — pad from the rest of FRAGRANCES
  for (const f of FRAGRANCES) {
    if (topIds.length >= 15) break;
    if (!topIds.includes(f.id)) topIds.push(f.id);
  }
  const sellers = topIds.map(id => FRAGRANCES.find(f => f.id === id)).filter(Boolean).slice(0, 15);
  grid.innerHTML = sellers.map(f => productCardHTML(f, true, true)).join('');
  wireProductCards(grid);
}

// --- HOME-PAGE FULL CATALOG ---
const homeState = { brand: '', gender: '', sort: 'bestsellers' };

function renderAllFragrances() {
  const grid = $('#allFragrancesGrid');
  if (!grid) return;

  let list = [...FRAGRANCES];
  if (homeState.brand) list = list.filter(f => f.brand === homeState.brand);
  if (homeState.gender) list = list.filter(f => f.gender === homeState.gender);
  if (homeState.sort === 'rating') {
    list.sort((a, b) => (state.ratings[b.id]?.avg || 0) - (state.ratings[a.id]?.avg || 0));
  } else if (homeState.sort === 'newest') {
    list.reverse();
  } else {
    list.sort((a, b) => {
      const ai = TOP_SELLERS.indexOf(a.id);
      const bi = TOP_SELLERS.indexOf(b.id);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return 0;
    });
  }
  grid.innerHTML = list.map(f => productCardHTML(f, false, true)).join('');
  wireProductCards(grid);

  // On the home page, scroll the window to the top of the catalog
  // grid whenever a filter changes so the user lands at the start
  // of the new brand/gender/sort, not mid-scroll in a different one.
  const section = grid.closest('section') || grid;
  if (section && typeof section.getBoundingClientRect === 'function') {
    // Use a small offset (~80px) so the filters row is still visible.
    const top = section.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: 'instant' });
  }
}

function productCardHTML(f, isBest, showMatch) {
  const r = state.ratings[f.id];
  const num = fragNumber(f);
  const cheaper = eur(f.original_price - f.veelyn_price);
  const origSlug = slugifyOriginal(f.original_name);
  const matchHTML = showMatch ? `
        <article class="match-card prod-card__match" data-orig="${f.id}" data-orig-id="${f.id}">
          <p class="match-card__title">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
              <path d="M7 12l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="match-card__title-text">Perfektná zhoda</span>
          </p>
          <div class="match-card__row">
            <div class="match-card__thumb">
              <img src="images/originals/${origSlug}.png"
                   alt="${f.brand} ${f.original_name}"
                   loading="lazy"
                   decoding="async"
                   onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
              <div class="match-card__thumb-fallback" style="display:none;">
                <span>${(f.brand||'').slice(0,2).toUpperCase()}</span>
              </div>
            </div>
            <div class="match-card__body">
              <p class="match-card__brand"><span>${f.brand}</span> | ${f.original_name}</p>
              <p class="match-card__price">
                <strong>${eur(f.original_price)}</strong>
                <small>${eur(f.original_price / 50)} / 1 ml</small>
              </p>
            </div>
          </div>
          <a class="match-card__link" href="#" data-orig-link="${f.id}">Zobraziť produkt <span aria-hidden="true">→</span></a>
        </article>` : '';
  return `
    <article class="prod-card${isBest ? ' prod-card--best' : ''}" data-id="${f.id}">
      ${isBest ? '<span class="prod-card__badge">★ BEST</span>' : ''}
      <div class="prod-card__image">
        <img src="images/veelyn/${f.id}.png?v=2" alt="${f.veelyn_name}" loading="lazy" decoding="async"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
        <div class="prod-card__placeholder" style="display:none;">
          <span>№${num}</span>
        </div>
      </div>
      <div class="prod-card__info">
        <p class="prod-card__inspired" aria-label="Inšpirované ${f.brand} ${f.original_name}">
          <span class="prod-card__inspired-quote">„Inšpirované <em>${f.brand}</em> <strong>${f.original_name}</strong>"</span>
        </p>
        <h3 class="prod-card__name">${f.veelyn_name}</h3>
        <button class="prod-card__rating" data-reviews="${f.id}" aria-label="Zobraziť ${r.count} recenzií, hodnotenie ${r.avg} z 5">
          <span class="prod-card__stars" aria-hidden="true">${renderStars(r.avg)}</span>
          <span class="prod-card__count">${r.avg.toString().replace('.', ',')}/5 (${r.count})</span>
        </button>
        <div class="prod-card__cheaper">Lacnejšia o <strong>${cheaper}</strong></div>
        ${matchHTML}
        <div class="prod-card__price-row">
          <span class="prod-card__price-orig">${eur(f.original_price)}</span>
          <span class="prod-card__price">${eur(f.veelyn_price)}</span>
        </div>
        <button class="prod-card__cta" data-add="${f.id}" aria-label="Pridaj ${f.veelyn_name} do košíka"><span class="prod-card__cta-long">Pridaj do košíka</span><span class="prod-card__cta-short" aria-hidden="true">Do košíka</span></button>
      </div>
    </article>
  `;
}

function wireProductCards(scope) {
  $$('.prod-card', scope).forEach(card => {
    card.addEventListener('click', (e) => {
      // The "Pridaj do košíka" button has <span> children — if the user
      // clicks the span text, e.target is the span (not the button), so
      // e.target.dataset.add was undefined → addToCart received undefined
      // and silently failed while still opening the cart drawer.
      // Read data-add from the closest <button> instead.
      const addBtn = e.target.closest('[data-add]');
      if (addBtn) {
        e.stopPropagation();
        addToCart(addBtn.dataset.add, 1, true);
        return;
      }
      const reviewsBtn = e.target.closest('[data-reviews]');
      if (reviewsBtn) {
        e.stopPropagation();
        openReviews(reviewsBtn.dataset.reviews);
        return;
      }
      // "Zobraziť produkt →" inside the prod-card Perfektná zhoda match-card
      // opens the ORIGINAL perfume preview, not the Veelyn product.
      const origLink = e.target.closest('[data-orig-link]');
      if (origLink) {
        e.preventDefault();
        e.stopPropagation();
        openMatchOrigin(origLink.dataset.origLink);
        return;
      }
      // The whole prod-card (including the "Perfektná zhoda" block) opens
      // the Veelyn product detail. From there the user can tap the match-card
      // inside the modal to see the original fragrance. This keeps the card
      // surface one big tap target instead of two competing handlers.
      openProduct(card.dataset.id);
    });
  });
}

function setupHomeCatalog() {
  const brandSel = $('#homeFilterBrand');
  if (brandSel && brandSel.options.length === 1) {
    [...new Set(FRAGRANCES.map(f => f.brand))].sort().forEach(b => {
      const opt = document.createElement('option');
      opt.value = b; opt.textContent = b;
      brandSel.appendChild(opt);
    });
  }
  brandSel?.addEventListener('change', e => { homeState.brand = e.target.value; renderAllFragrances(); });
  $('#homeFilterGender')?.addEventListener('change', e => { homeState.gender = e.target.value; renderAllFragrances(); });
  $('#homeSortBy')?.addEventListener('change', e => { homeState.sort = e.target.value; renderAllFragrances(); });
}

// --- TOP SELLERS in search ---
const TOP_SELLERS = ['moulin-rouge', 'imagine-this', 'hard-cash', 'noble-wood', 'harmony', 'the-horizon', 'savage-queen', 'forbidden-cherries', 'sweet-cig', 'i-am-blue'];

function renderTopSellers() {
  const grid = $('#topSellersGrid');
  if (!grid) return;
  const sellers = TOP_SELLERS.map(id => FRAGRANCES.find(f => f.id === id)).filter(Boolean);
  // Pass showMatch=true so each top-seller card in the search modal
  // renders the "Perfektná zhoda vôňových nôt" original-fragrance
  // reference (matches catalog + bestsellers).
  grid.innerHTML = sellers.map(f => productCardHTML(f, true, true)).join('');
  wireProductCards(grid);
}

// --- SEARCH ---
function setupSearch() {
  const input = $('#searchInput');
  const results = $('#searchResults');

  // Debounced GA4 'search' event so the dataLayer isn't spammed on every keystroke
  let searchTimer = null;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 1) {
      results.innerHTML = '';
      return;
    }
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => trackSearch(q), 700);
    const tokens = q.split(/\s+/).filter(Boolean);
    const matches = FRAGRANCES.filter(f => {
      const haystack = (
        f.veelyn_name + ' ' +
        f.original_name + ' ' +
        f.brand
      ).toLowerCase();
      return tokens.every(t => haystack.includes(t));
    }).slice(0, 8);

    if (matches.length === 0) {
      results.innerHTML = `<p style="color:var(--text-mute); padding:1rem; text-align:center;">Nič sa nenašlo. Skús inú značku alebo originál.</p>`;
      return;
    }

    results.innerHTML = matches.map(f => `
      <button class="search__result" data-id="${f.id}">
        <div class="search__result-thumb">
          <img src="images/veelyn/${f.id}.png?v=2" alt="${f.veelyn_name}" loading="lazy" decoding="async"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="search__result-thumb-fallback" style="display:none;">
            <span>${(f.veelyn_name||'').slice(0,2).toUpperCase()}</span>
          </div>
        </div>
        <div class="search__result-info">
          <div class="search__result-name">${f.veelyn_name}</div>
          <div class="search__result-inspired">„Inšpirované <strong>${f.brand}</strong> ${f.original_name}"</div>
        </div>
        <div class="search__result-price">${eur(f.veelyn_price)}</div>
      </button>
    `).join('');

    $$('.search__result').forEach(r => r.addEventListener('click', () => openProduct(r.dataset.id)));
  });
}

// --- CATALOG ---
function setupCatalog() {
  const brandSel = $('#filterBrand');
  const brands = [...new Set(FRAGRANCES.map(f => f.brand))].sort();
  brands.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    brandSel.appendChild(opt);
  });

  brandSel.addEventListener('change', renderCatalog);
  $('#filterGender').addEventListener('change', renderCatalog);
  $('#sortBy').addEventListener('change', renderCatalog);
  renderCatalog();
}

function renderCatalog() {
  const brand = $('#filterBrand').value;
  const gender = $('#filterGender').value;
  const sortBy = $('#sortBy').value;

  let list = [...FRAGRANCES];
  if (brand) list = list.filter(f => f.brand === brand);
  if (gender) list = list.filter(f => f.gender === gender);

  if (sortBy === 'rating') {
    list.sort((a, b) => state.ratings[b.id].avg - state.ratings[a.id].avg);
  } else if (sortBy === 'newest') {
    list.reverse();
  } else {
    // bestsellers — by review count
    list.sort((a, b) => state.ratings[b.id].count - state.ratings[a.id].count);
  }

  const grid = $('#catalogGrid');
  grid.innerHTML = list.map(f => productCardHTML(f, false, true)).join('');
  wireProductCards(grid);

  // Scroll the catalog modal back to the top whenever the filter
  // changes — user shouldn't end up mid-list of a new brand. Works
  // on both mobile and desktop (the modal panel is the scroll host).
  const panel = document.querySelector('#modal-catalog .modal__panel');
  if (panel) panel.scrollTo({ top: 0, behavior: 'instant' });
}

// --- PRODUCT MODAL ---
function openProduct(id) {
  const f = FRAGRANCES.find(x => x.id === id);
  if (!f) return;
  const r = state.ratings[id];

  $('#productContent').innerHTML = `
    <div class="product__col-left">
      <div class="product__bottles-wrap product__bottles-wrap--solo">
        ${bottleHTML(f, 'veelyn')}
      </div>
      <div class="product__inspired" aria-label="Inšpirované ${f.brand} ${f.original_name}">
        <span class="product__inspired-quote">„Inšpirované <em>${f.brand}</em> <strong>${f.original_name}</strong>"</span>
      </div>
      <div class="product__price-box">
        <div class="product__price-row product__price-row--orig">
          <span>Originál</span>
          <span class="price">${eur(f.original_price)}</span>
        </div>
        <div class="product__price-divider"></div>
        <div class="product__price-row product__price-row--ours">
          <span>Veelyn</span>
          <span class="price">${eur(f.veelyn_price)}</span>
        </div>
        <div class="product__price-divider"></div>
        <div class="product__price-row product__price-row--saving">
          <span>Ušetríš</span>
          <span class="price">${eur(f.original_price - f.veelyn_price)}</span>
        </div>
      </div>
      <p class="product__cheaper-line">
        Vyjde ťa <strong>${eur(f.original_price - f.veelyn_price)}</strong> lacnejšia ako <strong>${f.brand} ${f.original_name}</strong>.
      </p>

      <!-- Perfektná zhoda vôňových nôt — info o origináli (Parížske-style) -->
      <article class="match-card" data-orig="${f.id}">
        <p class="match-card__title">
          <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
            <path d="M7 12l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="match-card__title-long">Perfektná zhoda vôňových nôt</span>
          <span class="match-card__title-short" aria-hidden="true">Perfektná zhoda</span>
        </p>
        <div class="match-card__row">
          <div class="match-card__thumb">
            <img src="images/originals/${slugifyOriginal(f.original_name)}.png"
                 alt="${f.brand} ${f.original_name}"
                 loading="lazy"
                 decoding="async"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="match-card__thumb-fallback" style="display:none;">
              <span>${(f.brand||'').slice(0,2).toUpperCase()}</span>
            </div>
          </div>
          <div class="match-card__body">
            <p class="match-card__brand"><span>${f.brand}</span> | ${f.original_name}</p>
            <p class="match-card__price">
              <strong>${eur(f.original_price)}</strong>
              <small>${eur(f.original_price / 50)} / 1 ml</small>
            </p>
            <a class="match-card__link" href="#" onclick="event.preventDefault(); openMatchOrigin('${f.id}');">
              Zobraziť produkt <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </article>
    </div>

    <div class="product__col-right">
      <div class="product__header">
        <p class="product__inspired-label" aria-label="Inšpirované ${f.brand} ${f.original_name}">
          <span class="product__inspired-quote">„Inšpirované <em>${f.brand}</em> <strong>${f.original_name}</strong>"</span>
        </p>
        <h1 class="product__name-veelyn">${f.veelyn_name}</h1>
        <button class="product__rating" onclick="openReviews('${f.id}')" aria-label="Zobraziť ${r.count} recenzií, hodnotenie ${r.avg} z 5">
          <span class="product__stars" aria-hidden="true">${renderStars(r.avg)}</span>
          <span class="product__rating-text">${r.avg.toString().replace('.', ',')}/5 (${r.count} recenzií)</span>
          <span class="product__rating-arrow" aria-hidden="true">→</span>
        </button>
        <div class="product__icons">
          <div class="product__icon">
            <span class="product__icon-symbol">€</span>
            <span class="product__icon-text">Voňaj rovnako<br>zaplať zlomok</span>
          </div>
          <div class="product__icon">
            <span class="product__icon-symbol">⏳</span>
            <span class="product__icon-text">Silná a<br>dlhotrvácna vôňa</span>
          </div>
          <div class="product__icon">
            <span class="product__icon-symbol">🇸🇰</span>
            <span class="product__icon-text">Made in SK<br>Hated in Paris</span>
          </div>
        </div>
      </div>

      <div class="product__compare">
        <h3 class="product__compare-title">Veelyn vs iné značky</h3>
        <table>
          <thead>
            <tr><th></th><th class="we">Veelyn</th><th class="them-head">Iné</th></tr>
          </thead>
          <tbody>
            <tr><td>Vonia rovnako ako originál</td><td class="we">✓</td><td class="them">✗</td></tr>
            <tr><td>Silná a dlhotrvácna vôňa</td><td class="we">✓</td><td class="them">✗</td></tr>
            <tr><td>Nedráždi pokožku</td><td class="we">✓</td><td class="them">✗</td></tr>
          </tbody>
        </table>
      </div>

      <div class="product__buttons">
        <button class="btn btn--primary btn--block" onclick="addToCart('${f.id}', 1, true)">PRIDAŤ DO KOŠÍKA — ${eur(f.veelyn_price)}</button>
        <button class="btn product__upsell btn--block" data-open="bundle">★ 3+1 VONAVKY ZADARMO →</button>
      </div>

      <div class="product__notes">
        <h3 class="product__notes-title">Vôňová pyramída</h3>
        <p class="product__notes-desc">Vôňová pyramída zobrazuje, ako sa parfum postupne odhaľuje. Od prvého dojmu <strong>(top)</strong> cez srdce vône <strong>(heart)</strong> až po stopu, ktorá zostáva na pokožke <strong>(base)</strong>.</p>
        <div class="product__pyramid">
          <div class="product__pyramid-row product__pyramid-row--top">
            <span class="product__pyramid-label">TOP</span>
            <span class="product__pyramid-notes">${f.top_notes.join(' · ')}</span>
          </div>
          <div class="product__pyramid-row product__pyramid-row--heart">
            <span class="product__pyramid-label">HEART</span>
            <span class="product__pyramid-notes">${f.heart_notes.join(' · ')}</span>
          </div>
          <div class="product__pyramid-row product__pyramid-row--base">
            <span class="product__pyramid-label">BASE</span>
            <span class="product__pyramid-notes">${f.base_notes.join(' · ')}</span>
          </div>
        </div>
      </div>
    </div>
  `;
  // close any other modal first
  closeAllModals();
  openModal('product');
}

// --- MATCH ORIGIN PREVIEW — looks identical to Veelyn product page, only photo + name swapped ---
function openMatchOrigin(fragId) {
  const f = FRAGRANCES.find(x => x.id === fragId);
  if (!f) return;
  const slug = slugifyOriginal(f.original_name);
  const r = state.ratings[fragId];
  const m = document.getElementById('modal-origin');
  if (!m) return;
  m.querySelector('#originContent').innerHTML = `
    <div class="product">
      <div class="product__col-left">
        <div class="product__bottles-wrap product__bottles-wrap--solo">
          <div class="bottle-veelyn">
            <img class="bottle-photo" src="images/originals/${slug}.png"
                 alt="${f.brand} ${f.original_name}"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="bottle-fallback" style="display:none; align-items:center; justify-content:center; font-family:var(--font-display); font-style:italic; font-weight:800; font-size:4rem; color:rgba(255,255,255,0.4); width:100%; height:100%;">
              ${(f.brand||'').slice(0,2).toUpperCase()}
            </div>
          </div>
        </div>
        <div class="product__price-box">
          <div class="product__price-row product__price-row--orig">
            <span>${f.brand}</span>
            <span class="price">${eur(f.original_price)}</span>
          </div>
          <div class="product__price-divider"></div>
          <div class="product__price-row product__price-row--ours">
            <span>Veelyn ekvivalent</span>
            <span class="price">${eur(f.veelyn_price)}</span>
          </div>
          <div class="product__price-divider"></div>
          <div class="product__price-row product__price-row--loss">
            <span>Zaplatíš viac o</span>
            <span class="price">${eur(f.original_price - f.veelyn_price)}</span>
          </div>
        </div>
        <p class="product__cheaper-line product__cheaper-line--loss">
          Vyjde ťa <strong>${eur(f.original_price - f.veelyn_price)}</strong> drahšie ako <strong>Veelyn ${f.veelyn_name}</strong>.
        </p>

        <!-- Perfektná zhoda vôňových nôt — Veelyn version (reversed) -->
        <article class="match-card" data-veelyn="${f.id}">
          <p class="match-card__title">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
              <path d="M7 12l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="match-card__title-long">Perfektná zhoda vôňových nôt</span>
            <span class="match-card__title-short" aria-hidden="true">Perfektná zhoda</span>
          </p>
          <div class="match-card__row">
            <div class="match-card__thumb">
              <img src="images/veelyn/${f.id}.png?v=2"
                   alt="Veelyn ${f.veelyn_name}"
                   loading="lazy"
                   decoding="async"
                   onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
              <div class="match-card__thumb-fallback" style="display:none;">
                <span>V</span>
              </div>
            </div>
            <div class="match-card__body">
              <p class="match-card__brand"><span>Veelyn</span> | ${f.veelyn_name}</p>
              <p class="match-card__price">
                <strong>${eur(f.veelyn_price)}</strong>
                <small>${eur(f.veelyn_price / 50)} / 1 ml</small>
              </p>
              <a class="match-card__link" href="#" onclick="event.preventDefault(); closeAllModals(); openProduct('${f.id}');">
                Zobraziť produkt <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </article>
      </div>

      <div class="product__col-right">
        <div class="product__header">
          <h1 class="product__name-veelyn">${f.brand} ${f.original_name}</h1>
          <div class="product__icons">
            <div class="product__icon">
              <span class="product__icon-symbol">€</span>
              <span class="product__icon-text">Voňaj rovnako<br>zaplať <em class="product__icon-bad">VIAC</em></span>
            </div>
            <div class="product__icon">
              <span class="product__icon-symbol">⏳</span>
              <span class="product__icon-text">Silná a<br>dlhotrvácna vôňa</span>
            </div>
            <div class="product__icon">
              <span class="product__icon-symbol">🤷</span>
              <span class="product__icon-text">Made in<br>bohviekde</span>
            </div>
          </div>
        </div>

        <div class="product__compare">
          <h3 class="product__compare-title">Veelyn vs iné značky</h3>
          <table>
            <thead>
              <tr><th></th><th class="we">Veelyn</th><th class="them-head">Iné</th></tr>
            </thead>
            <tbody>
              <tr><td>Vonia rovnako ako originál</td><td class="we">✓</td><td class="them">✗</td></tr>
              <tr><td>Silná a dlhotrvácna vôňa</td><td class="we">✓</td><td class="them">✗</td></tr>
              <tr><td>Nedráždi pokožku</td><td class="we">✓</td><td class="them">✗</td></tr>
            </tbody>
          </table>
        </div>

        <div class="product__buttons">
          <button class="btn btn--primary btn--block" onclick="addToCart('${f.id}', 1, true, 'original'); closeAllModals();">PRIDAŤ DO KOŠÍKA — ${eur(f.original_price)}</button>
        </div>

        <div class="product__notes">
          <h3 class="product__notes-title">Vôňová pyramída</h3>
          <p class="product__notes-desc">Vôňová pyramída zobrazuje, ako sa parfum postupne odhaľuje. Od prvého dojmu <strong>(top)</strong> cez srdce vône <strong>(heart)</strong> až po stopu, ktorá zostáva na pokožke <strong>(base)</strong>.</p>
          <div class="product__pyramid">
            <div class="product__pyramid-row product__pyramid-row--top">
              <span class="product__pyramid-label">TOP</span>
              <span class="product__pyramid-notes">${f.top_notes.join(' · ')}</span>
            </div>
            <div class="product__pyramid-row product__pyramid-row--heart">
              <span class="product__pyramid-label">HEART</span>
              <span class="product__pyramid-notes">${f.heart_notes.join(' · ')}</span>
            </div>
            <div class="product__pyramid-row product__pyramid-row--base">
              <span class="product__pyramid-label">BASE</span>
              <span class="product__pyramid-notes">${f.base_notes.join(' · ')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  closeAllModals();
  openModal('origin');
}

// --- REVIEWS MODAL ---
function openReviews(productId) {
  const f = FRAGRANCES.find(x => x.id === productId);
  const r = state.ratings[productId];
  const reviews = state.reviews[productId] || [];

  $('#reviewsContent').innerHTML = `
    <div class="reviews__header">
      <h2 class="reviews__title">${f.veelyn_name}</h2>
      <p class="reviews__subtitle">Čo o nej hovoria zákazníci</p>
      <div class="reviews__overall">
        <span class="product__stars">${renderStars(r.avg)}</span>
        <span>${r.avg.toString().replace('.', ',')}/5 z ${r.count} hodnotení</span>
      </div>
    </div>
    <div class="reviews__list">
      ${reviews.map(rv => {
        const text = rv.text.replace(rv.highlight, `<mark>${rv.highlight}</mark>`);
        return `
          <article class="review">
            <header class="review__head">
              <span class="review__name">${rv.name}</span>
              <span class="review__date">${rv.date}</span>
            </header>
            <div class="review__stars">${renderStars(rv.stars)}</div>
            <div class="review__product">${f.veelyn_name} · ✓ Overený nákup</div>
            <p class="review__text">${text}</p>
          </article>
        `;
      }).join('')}
    </div>
  `;
  closeAllModals();
  openModal('reviews');
}

// --- CART ---
function addToCart(id, qty = 1, openDrawer = false, variant = 'veelyn') {
  const existing = state.cart.find(i => i.id === id && (i.variant || 'veelyn') === variant);
  if (existing) {
    existing.qty += qty;
  } else {
    state.cart.push({ id, qty, variant });
  }
  // GTM dataLayer push — GA4 add_to_cart, Meta AddToCart, etc.
  trackAddToCart(FRAGRANCES.find(f => f.id === id), qty, variant);
  renderCart();
  if (openDrawer) {
    closeAllModals();
    openModal('cart');
  }
}
function removeFromCart(id, variant = 'veelyn') {
  const f = FRAGRANCES.find(x => x.id === id);
  const it = state.cart.find(i => i.id === id && (i.variant || 'veelyn') === variant);
  trackRemoveFromCart(f, it?.qty || 1, variant);
  state.cart = state.cart.filter(i => !(i.id === id && (i.variant || 'veelyn') === variant));
  renderCart();
}
function updateQty(id, delta, variant = 'veelyn') {
  const item = state.cart.find(i => i.id === id && (i.variant || 'veelyn') === variant);
  if (!item) return;
  const newQty = item.qty + delta;
  if (newQty <= 0) {
    // Remove item from cart when qty would drop to 0 or below
    state.cart = state.cart.filter(i => !(i.id === id && (i.variant || 'veelyn') === variant));
  } else {
    item.qty = newQty;
  }
  renderCart();
}

// 3+1 ZADARMO — for every 4 items in cart, the cheapest one is free.
// Returns { subtotal, discount, total, freeQty, totalQty }
function calcBundleDiscount(cart) {
  const items = cart.map(it => {
    const f = FRAGRANCES.find(x => x.id === it.id);
    if (!f) return null;
    const variant = it.variant || 'veelyn';
    const price = variant === 'original' ? f.original_price : f.veelyn_price;
    return { id: f.id, variant, qty: it.qty, price };
  }).filter(Boolean);
  // Build flat list of unit prices (BUT only Veelyn items count toward 3+1 deal)
  const veelynFlat = [];
  let subtotal = 0;
  items.forEach(it => {
    for (let i = 0; i < it.qty; i++) {
      subtotal += it.price;
      if (it.variant === 'veelyn') veelynFlat.push(it.price);
    }
  });
  const totalQty = items.reduce((s, it) => s + it.qty, 0);
  // Each 4-pack of Veelyn items: cheapest unit free
  const freeQty = Math.floor(veelynFlat.length / 4);
  const sorted = veelynFlat.slice().sort((a, b) => a - b);
  let discount = 0;
  for (let i = 0; i < freeQty; i++) discount += sorted[i] || 0;
  return { subtotal, discount, total: subtotal - discount, freeQty, totalQty };
}

function renderCart() {
  const itemsEl = $('#cartItems');
  const totalEl = $('#cartTotal');
  const badge = $('#cartBadge');
  const drawer = document.getElementById('modal-cart');

  if (state.cart.length === 0) {
    if (drawer) drawer.dataset.empty = 'true';
    itemsEl.innerHTML = `
      <div class="cart-empty">
        <svg class="cart-empty__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 6h18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <path d="M16 10a4 4 0 0 1-8 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h3 class="cart-empty__title">Tvoj košík je prázdny</h3>
        <p class="cart-empty__sub">Pridaj si nejakú vôňu a začni nakupovať.</p>
        <button class="btn btn--primary cart-empty__cta" data-open="catalog" data-close>Pozri si všetky vône →</button>
      </div>`;
    totalEl.textContent = '0,00 €';
    badge.dataset.empty = 'true';
    badge.textContent = '0';
    renderCartUpsell(0);
    renderFreeShipping(0);
    // Remove discount row if present
    const discRow = document.getElementById('cartDiscountRow');
    if (discRow) discRow.remove();
    return;
  }

  if (drawer) drawer.dataset.empty = 'false';

  itemsEl.innerHTML = state.cart.map(item => {
    const f = FRAGRANCES.find(x => x.id === item.id);
    if (!f) return '';
    const variant = item.variant || 'veelyn';
    const isOriginal = variant === 'original';
    const unitPrice = isOriginal ? f.original_price : f.veelyn_price;
    const sub = unitPrice * item.qty;
    const displayName = isOriginal ? `${f.brand} ${f.original_name}` : f.veelyn_name;
    const displaySubtitle = isOriginal ? 'Originál' : f.original_name;
    const origSlugCart = slugifyOriginal(f.original_name);
    const thumbSrc = isOriginal
      ? `images/originals/${origSlugCart}.png`
      : `images/veelyn/${f.id}.png?v=2`;
    const thumbAlt = isOriginal ? `${f.brand} ${f.original_name}` : f.veelyn_name;
    const thumbFallback = isOriginal
      ? (f.brand || '').slice(0, 2).toUpperCase()
      : (f.veelyn_name || '').slice(0, 2).toUpperCase();
    return `
      <div class="cart-item${isOriginal ? ' cart-item--original' : ''}">
        <div class="cart-item__thumb">
          <img src="${thumbSrc}" alt="${thumbAlt}" loading="lazy" decoding="async"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="cart-item__thumb-fallback" style="display:none;">
            <span>${thumbFallback}</span>
          </div>
        </div>
        <div class="cart-item__info">
          <div class="cart-item__name">${displayName}</div>
          <div class="cart-item__inspired">${displaySubtitle}</div>
          <div class="cart-item__qty">
            <button onclick="updateQty('${f.id}', -1, '${variant}')" aria-label="Menej">−</button>
            <span>${item.qty}</span>
            <button onclick="updateQty('${f.id}', 1, '${variant}')" aria-label="Viac">+</button>
          </div>
        </div>
        <div>
          <div class="cart-item__price">${eur(sub)}</div>
          <button class="cart-item__remove" onclick="removeFromCart('${f.id}', '${variant}')">Odstrániť</button>
        </div>
      </div>
    `;
  }).join('');

  const { subtotal, discount, total, freeQty, totalQty } = calcBundleDiscount(state.cart);

  // Inject discount line if applicable
  const cartFooter = totalEl.closest('.cart-drawer__total');
  let discRow = document.getElementById('cartDiscountRow');
  if (discount > 0) {
    if (!discRow) {
      discRow = document.createElement('div');
      discRow.id = 'cartDiscountRow';
      discRow.className = 'cart-drawer__discount';
      cartFooter.parentNode.insertBefore(discRow, cartFooter);
    }
    discRow.innerHTML = `<span>★ 3+1 ZADARMO <em>(${freeQty}× zadarmo)</em></span><strong>−${eur(discount)}</strong>`;
  } else if (discRow) {
    discRow.remove();
  }

  totalEl.textContent = eur(total);
  badge.textContent = totalQty;
  badge.dataset.empty = totalQty === 0 ? 'true' : 'false';
  renderCartUpsell(totalQty);
  renderFreeShipping(total);
}

// Free shipping progress: zdarma nad 40 €
const FREE_SHIPPING_THRESHOLD = 40;
function renderFreeShipping(total) {
  const wrap = document.getElementById('cartShipping');
  const msg = document.getElementById('cartShippingMsg');
  const fill = document.getElementById('cartShippingFill');
  if (!wrap) return;
  if (total <= 0) { wrap.hidden = true; return; }
  wrap.hidden = false;
  if (total >= FREE_SHIPPING_THRESHOLD) {
    wrap.classList.add('is-met');
    msg.innerHTML = `🎉 <strong>Dopravu máš ZADARMO!</strong> Doručíme ti to do 1–2 prac. dní.`;
    fill.style.width = '100%';
  } else {
    wrap.classList.remove('is-met');
    const remain = FREE_SHIPPING_THRESHOLD - total;
    const pct = Math.min(100, (total / FREE_SHIPPING_THRESHOLD) * 100);
    msg.innerHTML = `Pridaj ešte <strong>${eur(remain)}</strong> a doprava ti vyjde <strong>ZADARMO</strong>.`;
    fill.style.width = pct.toFixed(1) + '%';
  }
}

// Slovak plural for "vôňa": 1 → vôňu (acc), 2–4 → vône, 0/5+ → vôní
function vonaPlural(n) {
  if (n === 1) return 'vôňu';
  if (n >= 2 && n <= 4) return 'vône';
  return 'vôní';
}

function renderCartUpsell(qty) {
  const wrap = $('#cartUpsell');
  const msg = $('#cartUpsellMsg');
  const fill = $('#cartUpsellFill');
  if (!wrap) return;

  // Hide upsell when cart is empty (use bundle modal instead)
  if (qty === 0) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const target = 4;
  const filled = Math.min(qty, target);
  const pct = (filled / target) * 100;
  const remaining = Math.max(0, 3 - qty); // need 3 paid to unlock the 4th free

  if (qty < 3) {
    msg.innerHTML = `Pridaj ešte <strong>${remaining} ${vonaPlural(remaining)}</strong> a <strong>4. dostaneš ZADARMO</strong>.`;
    wrap.classList.remove('cart-upsell--unlocked');
  } else if (qty === 3) {
    msg.innerHTML = `Si <strong>1 krok</strong> od bonusu — pridaj <strong>4. vôňu</strong> a získaš ju <strong>ZADARMO</strong>.`;
    wrap.classList.remove('cart-upsell--unlocked');
  } else {
    msg.innerHTML = `★ <strong>3+1 deal aktívny</strong> — máš ${qty} ${vonaPlural(qty)}, každá 4. ide zadarmo.`;
    wrap.classList.add('cart-upsell--unlocked');
  }
  fill.style.width = pct + '%';
}

// --- BUNDLE ---
function setupBundle() {
  $$('.bundle__slot').forEach(slot => {
    slot.addEventListener('click', () => {
      // open catalog in "pick mode"
      const idx = parseInt(slot.dataset.slot);
      // for MVP — just open catalog and pick first; real version: pick mode
      pickForBundle(idx);
    });
  });

  $('#bundleAddToCart').addEventListener('click', () => {
    const filled = state.bundleSlots.filter(Boolean);
    if (filled.length < 4) {
      alert(`Vyber si všetky 4 vonavky (vybral si ${filled.length}).`);
      return;
    }
    filled.forEach(id => addToCart(id, 1));
    state.bundleSlots = [null, null, null, null];
    renderBundleSlots();
    closeAllModals();
    openModal('cart');
  });
}

function pickForBundle(slotIdx) {
  // open catalog in "bundle pick mode"
  closeAllModals();
  const catalogModal = document.getElementById('modal-catalog');
  catalogModal.classList.add('is-bundle-picking');
  catalogModal.dataset.bundleSlot = slotIdx;
  // Add a hint banner on top of catalog
  let hint = document.getElementById('bundlePickHint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'bundlePickHint';
    hint.className = 'bundle-pick-hint';
    catalogModal.querySelector('.modal__panel').prepend(hint);
  }
  const slotLabel = slotIdx === 3 ? '4. (ZADARMO)' : `${slotIdx + 1}. vôňu`;
  hint.innerHTML = `
    <span class="bundle-pick-hint__text">Vyber si <strong>${slotLabel}</strong> do 3+1 deal-u</span>
    <button type="button" class="bundle-pick-hint__cancel" id="cancelBundlePick">Zrušiť výber</button>
  `;
  hint.hidden = false;

  openModal('catalog');

  // Attach capture-phase click handler — wins over card's own listener
  const grid = document.getElementById('catalogGrid');
  if (!grid) return;
  const handler = (e) => {
    const card = e.target.closest('.prod-card');
    if (!card) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    state.bundleSlots[slotIdx] = card.dataset.id;
    renderBundleSlots();
    cleanupBundlePick();
    closeAllModals();
    openModal('bundle');
  };
  grid.addEventListener('click', handler, true);

  function cleanupBundlePick() {
    grid.removeEventListener('click', handler, true);
    catalogModal.classList.remove('is-bundle-picking');
    delete catalogModal.dataset.bundleSlot;
    if (hint) hint.hidden = true;
  }

  // Cancel button — go back to bundle without picking
  const cancelBtn = document.getElementById('cancelBundlePick');
  if (cancelBtn) {
    cancelBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      cleanupBundlePick();
      closeAllModals();
      openModal('bundle');
    };
  }
}

function renderBundleSlots() {
  $$('.bundle__slot').forEach((slot, i) => {
    const id = state.bundleSlots[i];
    if (id) {
      const f = FRAGRANCES.find(x => x.id === id);
      slot.classList.add('is-filled');
      slot.querySelector('.bundle__slot-num').textContent = (i + 1);
      slot.querySelector('.bundle__slot-label').textContent = f.veelyn_name;
    } else {
      slot.classList.remove('is-filled');
      slot.querySelector('.bundle__slot-num').textContent = (i + 1);
      slot.querySelector('.bundle__slot-label').textContent = i === 3 ? '+ Vyber si vonavku' : '+ Vyber si vonavku';
    }
  });
}

// --- CONTACT FORM ---
function setupContactForm() {
  const form = $('#contactForm');
  const submitBtn = form.querySelector('button[type="submit"]');
  const origLabel = submitBtn.textContent;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = (data.get('name') || '').toString().trim();

    // Dev mód — kým nie je nastavený access key, zachovaj pôvodné správanie
    if (!WEB3FORMS_ACCESS_KEY) {
      alert(`Ďakujeme, ${name}! Tvoja správa bola odoslaná na info@veelyn.sk.\n\n(DEV: nastav WEB3FORMS_ACCESS_KEY v script.js, aby sa naozaj odoslala.)`);
      form.reset();
      closeAllModals();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Odosielam…';

    data.append('access_key', WEB3FORMS_ACCESS_KEY);
    data.append('subject', `Veelyn — správa od ${name || 'návštevníka'}`);
    data.append('from_name', 'Veelyn web');
    // Honeypot — Web3Forms automaticky filtruje, ak sa vyplní
    if (!data.has('botcheck')) data.append('botcheck', '');

    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: data
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Nepodarilo sa odoslať');

      alert(`Ďakujeme, ${name}! Tvoja správa bola odoslaná. Ozveme sa do 24 hodín.`);
      form.reset();
      closeAllModals();
    } catch (err) {
      console.error('Web3Forms error:', err);
      alert('Ups, správu sa nepodarilo odoslať. Skús to prosím znova alebo nám napíš priamo na info@veelyn.sk.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = origLabel;
    }
  });
}

// --- WHOLESALE / WHITELABEL FORM ---
// Affiliate modal form — submits to our backend /api/affiliate (Resend
// then forwards to info@veelyn.sk). Same UX pattern as the newsletter
// form: inline feedback bar instead of alert(), submit-button disabled
// state while flying.
function setupAffiliateForm() {
  const form = $('#affiliateForm');
  if (!form) return;
  const submitBtn = form.querySelector('button[type="submit"]');
  const origLabel = submitBtn ? submitBtn.textContent : 'Odoslať prihlášku';

  function showFeedback(msg, kind) {
    let fb = form.querySelector('.wholesale__form-feedback');
    if (!fb) {
      fb = document.createElement('div');
      fb.className = 'wholesale__form-feedback';
      form.appendChild(fb);
    }
    fb.textContent = msg;
    fb.dataset.kind = kind;
    setTimeout(() => { fb.textContent = ''; fb.dataset.kind = ''; }, 8000);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    if (data.get('botcheck')) return; // honeypot
    const payload = {
      name: (data.get('name') || '').toString().trim(),
      email: (data.get('email') || '').toString().trim().toLowerCase(),
      phone: (data.get('phone') || '').toString().trim(),
      followers: (data.get('followers') || '').toString(),
      platform: (data.get('platform') || '').toString(),
      handle: (data.get('handle') || '').toString().trim(),
      message: (data.get('message') || '').toString().trim(),
    };
    if (!payload.name || !payload.email.includes('@') || !payload.message) {
      showFeedback('Vyplň meno, e-mail a krátku správu.', 'error');
      return;
    }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Odosielam…'; }
    try {
      const res = await fetch(VEELYN_API + '/api/affiliate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Server vrátil ${res.status}`);
      showFeedback('Hotovo ✦ Ozveme sa do 48 hodín.', 'success');
      form.reset();
      // GA4 sign_up event (affiliate variant) — for measuring conversion
      try { trackEvent('sign_up', { method: 'affiliate' }); } catch {}
    } catch (err) {
      showFeedback('Niečo sa pokazilo, skús to prosím o chvíľu znova.', 'error');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origLabel; }
    }
  });
}

function setupWholesaleForm() {
  const form = $('#wholesaleForm');
  if (!form) return;
  const submitBtn = form.querySelector('button[type="submit"]');
  const origLabel = submitBtn.textContent;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = (data.get('name') || '').toString().trim();
    const email = (data.get('email') || '').toString().trim();
    const type = (data.get('type') || '').toString();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('Zadaj platný e-mail.');
      return;
    }

    if (!WEB3FORMS_ACCESS_KEY) {
      alert(`Ďakujeme, ${name}! Tvoj dopyt bol odoslaný na b2b@veelyn.sk. Ozveme sa do 24 hodín.\n\n(DEV: nastav WEB3FORMS_ACCESS_KEY v script.js, aby sa naozaj odoslala.)`);
      form.reset();
      closeAllModals();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Odosielam…';

    data.append('access_key', WEB3FORMS_ACCESS_KEY);
    data.append('subject', `Veelyn B2B — dopyt (${type || 'nezadané'}) od ${name || 'návštevníka'}`);
    data.append('from_name', 'Veelyn B2B');
    data.append('to', 'b2b@veelyn.sk');
    if (!data.has('botcheck')) data.append('botcheck', '');

    try {
      const res = await fetch('https://api.web3forms.com/submit', { method: 'POST', body: data });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Nepodarilo sa odoslať');
      alert(`Ďakujeme, ${name}! Dopyt bol odoslaný. Ozveme sa do 24 hodín na ${email}.`);
      form.reset();
      closeAllModals();
    } catch (err) {
      console.error('Web3Forms error:', err);
      alert('Ups, dopyt sa nepodarilo odoslať. Skús to prosím znova alebo nám napíš priamo na b2b@veelyn.sk.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = origLabel;
    }
  });
}

// --- HERO ADD TO CART ---
function setupHeroCart() {
  const btn = $('#heroAddToCart');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const slide = $('.carousel__slide.is-active');
    if (!slide) return;
    addToCart(slide.dataset.id, 1, true);
  });
}

// --- EVENT WIRING ---
function setupEvents() {
  // open data-open
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open]');
    if (trigger) {
      const id = trigger.dataset.open;
      closeAllModals();
      openModal(id);
    }
  });

  // close — use .closest() so taps that land on a child element (e.g.
  // the <svg> or <path> inside the X button) still resolve to the
  // button itself. Plain .matches() failed when the user tapped the
  // exact pixel of the SVG path → the cart's X felt unresponsive.
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close], .modal__backdrop')) {
      closeAllModals();
    }
  });

  // ESC closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });

  // (no burger anymore — bottom nav is always visible on mobile)

  // arrows
  $('#prevBtn').addEventListener('click', () => goToSlide(state.carouselIdx - 1));
  $('#nextBtn').addEventListener('click', () => goToSlide(state.carouselIdx + 1));

  // pause carousel on hover
  const carousel = $('.carousel');
  carousel.addEventListener('mouseenter', stopCarousel);
  carousel.addEventListener('mouseleave', startCarousel);

  // Touch swipe — horizontal drag on the stage moves between slides.
  // We deliberately lock the gesture to *horizontal* as soon as we see
  // x-dominant motion: touchmove with passive:false + preventDefault()
  // stops the browser from also pan-y'ing the page (which on iOS
  // looked like the whole page jumping up while swiping, plus a
  // rubber-band bounce when the user was already at the top).
  const stage = $('#carouselStage');
  if (stage) {
    let startX = 0, startY = 0, dragging = false;
    let lockedAxis = null; // null | 'x' | 'y'
    const AXIS_LOCK_PX = 6;
    stage.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length === 0) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dragging = true;
      lockedAxis = null;
      stopCarousel();
    }, { passive: true });
    // Needs passive:false so preventDefault() actually blocks the
    // browser's scroll once we've decided the gesture is horizontal.
    stage.addEventListener('touchmove', (e) => {
      if (!dragging || !e.touches || e.touches.length === 0) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (lockedAxis === null) {
        const ax = Math.abs(dx), ay = Math.abs(dy);
        // Decide axis once we've moved at least a few px. Horizontal
        // wins when x dominates clearly — otherwise let the browser
        // pan-y normally.
        if (ax > AXIS_LOCK_PX || ay > AXIS_LOCK_PX) {
          lockedAxis = ax > ay ? 'x' : 'y';
        }
      }
      if (lockedAxis === 'x') {
        // Cancel the browser's would-be vertical scroll so the page
        // doesn't jump while the user is swiping the carousel.
        e.preventDefault();
      }
    }, { passive: false });
    stage.addEventListener('touchend', (e) => {
      if (!dragging) return;
      dragging = false;
      const wasHorizontal = lockedAxis === 'x';
      lockedAxis = null;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) { startCarousel(); return; }
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Only treat as a swipe if predominantly horizontal and far enough.
      // wasHorizontal short-circuits the y-ratio check for gestures we
      // already locked.
      if (Math.abs(dx) > 40 && (wasHorizontal || Math.abs(dx) > Math.abs(dy) * 1.2)) {
        goToSlide(state.carouselIdx + (dx < 0 ? 1 : -1));
      }
      startCarousel();
    });
    stage.addEventListener('touchcancel', () => { dragging = false; lockedAxis = null; startCarousel(); });
  }

  // checkout button
  $('#checkoutBtn').addEventListener('click', () => {
    if (state.cart.length === 0) {
      alert('Košík je prázdny.');
      return;
    }
    openCheckout();
  });
}

// --- CHECKOUT — multi-step: 1) Doručenie 2) Údaje 3) Platba ---
// Packeta Widget V6 API key (PUBLIC — embedded in widget.packeta.com calls
// for identifying the merchant). The matching REST API password lives in
// Railway env var PACKETA_API_PASSWORD and is used by the backend for
// creating shipments + generating labels.
const PACKETA_API_KEY = '3486767127ceef1f';
const SHIPPING_METHODS = {
  'packeta-kurier': { label: 'Packeta na adresu',     note: 'Doručenie domov · 1–2 dni',     price: 4.49, packeta: false },
  'packeta-zbox':   { label: 'Packeta Z-BOX',         note: 'Vyzdvihnutie 24/7 · 1–2 dni',   price: 2.99, packeta: true,  vendors: 'czzpoint,zbox' },
  'packeta-pobocka':{ label: 'Packeta výdajné miesto',note: 'Pobočka · 2–3 dni',             price: 3.49, packeta: true,  vendors: 'czzpoint,packeta' },
};
const PAYMENT_METHODS = {
  'card':    { label: 'Karta · Apple Pay · Google Pay', note: 'Visa, Mastercard, Maestro',     fee: 0 },
  'transfer':{ label: 'Bankový prevod',                  note: 'Pošleme ti údaje na e-mail',   fee: 0 },
  'cod':     { label: 'Dobierka',                        note: 'Zaplatíš pri prevzatí',        fee: 1.50 },
};

const checkoutState = {
  step: 1,
  shippingId: 'packeta-kurier',
  paymentId: 'card',
  pickupPoint: null, // { id, name, street, city, zip }
  customer: {},
  // Discount code: { code, type ('percent'|'fixed'), value (Number) } | null
  // Applied via /api/discount/validate. Calculated on top of bundle
  // discount + before shipping/payment fees.
  discount: null,
};

function calcCheckoutTotals() {
  const items = state.cart.map(it => {
    const f = FRAGRANCES.find(x => x.id === it.id);
    if (!f) return null;
    const variant = it.variant || 'veelyn';
    const unitPrice = variant === 'original' ? f.original_price : f.veelyn_price;
    return { ...it, variant, frag: f, sub: unitPrice * it.qty, unitPrice };
  }).filter(Boolean);
  const subtotal = items.reduce((s, it) => s + it.sub, 0);
  // 3+1 ZADARMO discount (cheapest of every 4 items free)
  const bundle = calcBundleDiscount(state.cart);
  const bundleDiscount = bundle.discount;
  const freeQty = bundle.freeQty;
  // Discount code on top of bundle (applied to productsTotal AFTER bundle)
  const afterBundle = subtotal - bundleDiscount;
  let codeDiscount = 0;
  if (checkoutState.discount) {
    if (checkoutState.discount.type === 'percent') {
      codeDiscount = Math.round(afterBundle * (checkoutState.discount.value / 100) * 100) / 100;
    } else {
      // fixed € amount, never below 0
      codeDiscount = Math.min(checkoutState.discount.value, afterBundle);
    }
  }
  const productsTotal = afterBundle - codeDiscount;
  const ship = SHIPPING_METHODS[checkoutState.shippingId];
  const pay = PAYMENT_METHODS[checkoutState.paymentId];
  const freeShipping = productsTotal >= FREE_SHIPPING_THRESHOLD;
  const shipPrice = freeShipping ? 0 : (ship?.price || 0);
  const fee = pay?.fee || 0;
  return {
    items, subtotal, bundleDiscount, freeQty, codeDiscount,
    discountCode: checkoutState.discount?.code || null,
    productsTotal,
    freeShipping, shipPrice, fee,
    total: productsTotal + shipPrice + fee
  };
}

function openCheckout() {
  checkoutState.step = 1;
  checkoutState.customer = {};
  checkoutState.pickupPoint = null;
  // GA4 begin_checkout / Meta InitiateCheckout
  const tot = calcCheckoutTotals();
  trackBeginCheckout(state.cart, tot.total);
  renderCheckout();
  closeAllModals();
  openModal('checkout');
}

function renderCheckout() {
  const t = calcCheckoutTotals();
  if (t.items.length === 0) {
    $('#checkoutContent').innerHTML = `<div style="padding:3rem 1rem;text-align:center;"><p>Košík je prázdny.</p><button class="btn btn--primary" data-close>Zatvoriť</button></div>`;
    return;
  }
  $('#checkoutContent').innerHTML = `
    <div class="checkout__layout">
      <div class="checkout__form-col">
        <button type="button" class="checkout__back" id="checkoutBack" ${checkoutState.step === 1 ? 'hidden' : ''}>← Späť</button>
        <ol class="checkout__steps" aria-label="Postup objednávky">
          <li class="${checkoutState.step >= 1 ? 'is-active' : ''} ${checkoutState.step > 1 ? 'is-done' : ''}"><span>1</span> Doručenie</li>
          <li class="${checkoutState.step >= 2 ? 'is-active' : ''} ${checkoutState.step > 2 ? 'is-done' : ''}"><span>2</span> Údaje</li>
          <li class="${checkoutState.step >= 3 ? 'is-active' : ''}"><span>3</span> Platba</li>
        </ol>
        ${renderCheckoutStep(t)}
      </div>
      <aside class="checkout__summary-col">
        ${renderCheckoutSummary(t)}
      </aside>
    </div>
  `;
  wireCheckoutStep(t);
}

function renderCheckoutSummary(t) {
  return `
    <h3 class="checkout__section-title">Tvoja objednávka</h3>
    <ul class="checkout__items">
      ${t.items.map(it => {
        const isOrig = it.variant === 'original';
        const name = isOrig ? `${it.frag.brand} ${it.frag.original_name}` : it.frag.veelyn_name;
        const sub = isOrig ? 'Originál' : it.frag.original_name;
        const slugOrig = slugifyOriginal(it.frag.original_name);
        const thumbSrc = isOrig
          ? `images/originals/${slugOrig}.png`
          : `images/veelyn/${it.frag.id}.png?v=2`;
        const thumbFallback = isOrig
          ? (it.frag.brand || '').slice(0, 2).toUpperCase()
          : (it.frag.veelyn_name || '').slice(0, 2).toUpperCase();
        const openCall = isOrig
          ? `openMatchOrigin('${it.frag.id}')`
          : `closeAllModals(); openProduct('${it.frag.id}')`;
        return `
        <li class="checkout__item${isOrig ? ' checkout__item--original' : ''}"
            role="button" tabindex="0"
            onclick="${openCall}"
            onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${openCall};}">
          <span class="checkout__item-qty">${it.qty}×</span>
          <div class="checkout__item-thumb">
            <img src="${thumbSrc}" alt="${name}" loading="lazy" decoding="async"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="checkout__item-thumb-fallback" style="display:none;">
              <span>${thumbFallback}</span>
            </div>
          </div>
          <div class="checkout__item-info">
            <strong>${name}</strong>
            <span>${sub}</span>
          </div>
          <span class="checkout__item-price">${eur(it.sub)}</span>
        </li>
        `;
      }).join('')}
    </ul>
    <div class="checkout__totals">
      <div><span>Medzisúčet</span><strong>${eur(t.subtotal)}</strong></div>
      ${t.bundleDiscount > 0 ? `<div class="checkout__totals-bundle"><span>★ 3+1 ZADARMO <em>(${t.freeQty}× zadarmo)</em></span><strong>−${eur(t.bundleDiscount)}</strong></div>` : ''}
      ${t.codeDiscount > 0 ? `<div class="checkout__totals-bundle"><span>✦ Zľavový kód <em>(${t.discountCode})</em></span><strong>−${eur(t.codeDiscount)}</strong></div>` : ''}
      <div><span>Doprava</span><strong>${t.freeShipping ? 'ZDARMA' : eur(t.shipPrice)}</strong></div>
      ${t.fee > 0 ? `<div><span>Poplatok</span><strong>${eur(t.fee)}</strong></div>` : ''}
      ${!t.freeShipping ? `<aside class="checkout__free-hint" role="status"><span class="checkout__free-hint-icon" aria-hidden="true">🚚</span><span class="checkout__free-hint-text">Pridaj ešte <strong class="checkout__free-hint-price">${eur(FREE_SHIPPING_THRESHOLD - t.productsTotal)}</strong> a <strong>dopravu máš zadarmo</strong></span></aside>` : ''}
      <div class="checkout__totals-final"><span>Spolu</span><strong>${eur(t.total)}</strong></div>
    </div>

    <!-- Discount code input — collapsible to keep the sidebar clean. Submits
         the code to /api/discount/validate; success applies the discount
         to checkoutState.discount and re-renders. -->
    <details class="checkout__coupon" ${checkoutState.discount ? 'open' : ''}>
      <summary>✦ Mám zľavový kód</summary>
      <form id="couponForm" class="checkout__coupon-form" autocomplete="off">
        <input type="text" name="code" placeholder="napr. VEELYN5" autocomplete="off"
               value="${checkoutState.discount?.code || ''}" ${checkoutState.discount ? 'readonly' : ''}>
        ${checkoutState.discount
          ? `<button type="button" class="btn btn--ghost" id="couponRemoveBtn">Odobrať</button>`
          : `<button type="submit" class="btn btn--primary">Použiť</button>`}
      </form>
      <div class="checkout__coupon-msg" id="couponMsg" aria-live="polite"></div>
    </details>
    <ul class="checkout__trust">
      <li>🔒 SSL šifrovaná platba</li>
      <li>↩ 14 dní na vrátenie</li>
      <li>🚚 Doručenie do 1–2 prac. dní</li>
    </ul>
  `;
}

function renderCheckoutStep(t) {
  if (checkoutState.step === 1) return renderStepDelivery(t);
  if (checkoutState.step === 2) return renderStepCustomer(t);
  return renderStepPayment(t);
}

function renderStepDelivery(t) {
  return `
    <h2 class="checkout__title">Spôsob doručenia</h2>
    <div class="checkout__options" id="shippingOptions">
      ${Object.entries(SHIPPING_METHODS).map(([id, m]) => `
        <label class="checkout__opt ${checkoutState.shippingId === id ? 'is-selected' : ''}">
          <input type="radio" name="shipping" value="${id}" ${checkoutState.shippingId === id ? 'checked' : ''}>
          <span class="checkout__opt-body">
            <strong>${m.label}</strong>
            <small>${m.note}</small>
          </span>
          <span class="checkout__opt-price">${t.freeShipping ? 'ZDARMA' : eur(m.price)}</span>
        </label>
      `).join('')}
    </div>
    ${SHIPPING_METHODS[checkoutState.shippingId].packeta ? `
      <div class="checkout__pickup">
        <p class="checkout__pickup-title">Vyber si miesto vyzdvihnutia</p>
        ${checkoutState.pickupPoint ? `
          <div class="checkout__pickup-selected">
            <strong>${checkoutState.pickupPoint.name}</strong>
            <span>${checkoutState.pickupPoint.street || ''}, ${checkoutState.pickupPoint.zip || ''} ${checkoutState.pickupPoint.city || ''}</span>
            <button type="button" class="checkout__pickup-change" id="changePickupBtn">Zmeniť</button>
          </div>
        ` : `
          <button type="button" class="btn btn--ghost btn--block" id="openPacketaBtn">📍 Vybrať Packeta miesto</button>
          <small class="checkout__pickup-hint">Otvorí sa mapa Packety. Vyber Z-Box alebo pobočku v okolí.</small>
        `}
      </div>
    ` : ''}
    <button type="button" class="btn btn--primary btn--block checkout__next" id="toStep2">Pokračovať →</button>
  `;
}

function renderStepCustomer(t) {
  const c = checkoutState.customer;
  const needsAddr = !SHIPPING_METHODS[checkoutState.shippingId].packeta || checkoutState.shippingId === 'packeta-kurier';
  return `
    <h2 class="checkout__title">Tvoje údaje</h2>
    <form class="checkout__form" id="customerForm" novalidate>
      <h3 class="checkout__section-title">★ Kontakt</h3>
      <div class="checkout__row">
        <label class="field">
          <span>Meno *</span>
          <input type="text" name="firstName" value="${c.firstName || ''}" autocomplete="given-name" required>
        </label>
        <label class="field">
          <span>Priezvisko *</span>
          <input type="text" name="lastName" value="${c.lastName || ''}" autocomplete="family-name" required>
        </label>
      </div>
      <label class="field">
        <span>E-mail *</span>
        <input type="email" name="email" value="${c.email || ''}" autocomplete="email" required>
      </label>
      <label class="field">
        <span>Telefón *</span>
        <input type="tel" name="phone" value="${c.phone || ''}" autocomplete="tel" placeholder="+421 9XX XXX XXX" required>
      </label>
      ${needsAddr ? `
        <h3 class="checkout__section-title">★ Doručovacia adresa</h3>
        <label class="field">
          <span>Ulica a číslo *</span>
          <input type="text" name="street" value="${c.street || ''}" autocomplete="street-address" required>
        </label>
        <div class="checkout__row">
          <label class="field">
            <span>Mesto *</span>
            <input type="text" name="city" value="${c.city || ''}" autocomplete="address-level2" required>
          </label>
          <label class="field" style="max-width:140px;">
            <span>PSČ *</span>
            <input type="text" name="zip" value="${c.zip || ''}" autocomplete="postal-code" placeholder="000 00" required>
          </label>
        </div>
      ` : `
        <div class="checkout__pickup-summary">
          <strong>📍 Doručujeme na:</strong>
          <p>${checkoutState.pickupPoint?.name || ''}<br>${checkoutState.pickupPoint?.street || ''}, ${checkoutState.pickupPoint?.zip || ''} ${checkoutState.pickupPoint?.city || ''}</p>
        </div>
      `}
      <label class="field">
        <span>Poznámka (voliteľné)</span>
        <input type="text" name="note" value="${c.note || ''}" placeholder="napr. iné meno na zvončeku">
      </label>
      <div class="checkout__row">
        <label class="checkout__check">
          <input type="checkbox" name="invoice" ${c.invoice ? 'checked' : ''}>
          <span>Chcem firemnú faktúru (IČO/DIČ)</span>
        </label>
      </div>
      <div class="checkout__company" id="companyFields" ${c.invoice ? '' : 'hidden'}>
        <label class="field">
          <span>Firma</span>
          <input type="text" name="company" value="${c.company || ''}">
        </label>
        <div class="checkout__row">
          <label class="field"><span>IČO</span><input type="text" name="ico" value="${c.ico || ''}"></label>
          <label class="field"><span>DIČ</span><input type="text" name="dic" value="${c.dic || ''}"></label>
        </div>
        <label class="field"><span>IČ DPH</span><input type="text" name="icdph" value="${c.icdph || ''}"></label>
      </div>
      <button type="submit" class="btn btn--primary btn--block checkout__next">Pokračovať na platbu →</button>
    </form>
  `;
}

function renderStepPayment(t) {
  // Originál perfumes ship from external supplier — order is created
  // only after the card payment clears (no cash-on-delivery / no bank
  // transfer wait). Force card-only payment if the cart has any
  // original-variant items.
  const hasOriginal = t.items.some(it => it.variant === 'original');
  if (hasOriginal && checkoutState.paymentId !== 'card') {
    checkoutState.paymentId = 'card';
  }
  const visiblePayments = hasOriginal
    ? Object.entries(PAYMENT_METHODS).filter(([id]) => id === 'card')
    : Object.entries(PAYMENT_METHODS);
  return `
    <h2 class="checkout__title">Spôsob platby</h2>
    ${hasOriginal ? `
      <p class="checkout__payment-note">
        Pri origináloch je platba <strong>iba kartou vopred</strong> —
        objednávame ich až po pripísaní platby.
      </p>
    ` : ''}
    <div class="checkout__options" id="paymentOptions">
      ${visiblePayments.map(([id, m]) => `
        <label class="checkout__opt ${checkoutState.paymentId === id ? 'is-selected' : ''}">
          <input type="radio" name="payment" value="${id}" ${checkoutState.paymentId === id ? 'checked' : ''}>
          <span class="checkout__opt-body">
            <strong>${m.label}</strong>
            <small>${m.note}</small>
          </span>
          <span class="checkout__opt-price">${m.fee > 0 ? '+ ' + eur(m.fee) : 'ZDARMA'}</span>
        </label>
      `).join('')}
    </div>

    <div class="checkout__final-summary">
      <h3 class="checkout__section-title">Skontroluj objednávku</h3>
      <div class="checkout__final-row"><span>Doručenie</span><strong>${SHIPPING_METHODS[checkoutState.shippingId].label}</strong></div>
      ${checkoutState.pickupPoint ? `<div class="checkout__final-row"><span>Miesto</span><strong>${checkoutState.pickupPoint.name}</strong></div>` : ''}
      <div class="checkout__final-row"><span>Príjemca</span><strong>${checkoutState.customer.firstName || ''} ${checkoutState.customer.lastName || ''}</strong></div>
      <div class="checkout__final-row"><span>E-mail</span><strong>${checkoutState.customer.email || ''}</strong></div>
      <div class="checkout__final-row"><span>Telefón</span><strong>${checkoutState.customer.phone || ''}</strong></div>
    </div>

    <label class="checkout__consent">
      <input type="checkbox" id="termsAgree" required>
      <span>Súhlasím s <button type="button" class="checkout__consent-link" data-open="vop">obchodnými podmienkami</button>, <button type="button" class="checkout__consent-link" data-open="gdpr">spracovaním osobných údajov</button> a beriem na vedomie, že objednávka je s povinnosťou platby.</span>
    </label>
    <label class="checkout__consent">
      <input type="checkbox" id="newsletterOptIn">
      <span>Hoď mi občas zľavu na e-mail — bez spamu, sľubujeme. 💌 (odhlásiť sa môžeš kedykoľvek)</span>
    </label>

    <button type="button" class="btn btn--primary btn--block checkout__submit" id="finishOrderBtn">
      🔒 ZAPLATIŤ ${eur(t.total)}
    </button>
    <p class="checkout__secure">🔒 Zabezpečené 256-bit SSL · Tvoje údaje sú v bezpečí</p>
  `;
}

function wireCheckoutStep(t) {
  const back = document.getElementById('checkoutBack');
  if (back) back.onclick = () => { checkoutState.step--; renderCheckout(); };

  // Coupon form is on every step (in the sidebar). Bind submit handler
  // that hits /api/discount/validate; on success, apply to state and
  // re-render so totals update everywhere consistently.
  const couponForm = document.getElementById('couponForm');
  const couponMsg = document.getElementById('couponMsg');
  const couponRemoveBtn = document.getElementById('couponRemoveBtn');
  if (couponForm) {
    couponForm.onsubmit = async (e) => {
      e.preventDefault();
      const code = (new FormData(couponForm).get('code') || '').toString().trim().toUpperCase();
      if (!code) { if (couponMsg) couponMsg.textContent = 'Zadaj kód.'; return; }
      if (couponMsg) couponMsg.textContent = 'Overujem…';
      try {
        const subtotal = (t.subtotal - t.bundleDiscount).toFixed(2);
        const res = await fetch(VEELYN_API + '/api/discount/validate?code=' +
          encodeURIComponent(code) + '&subtotal=' + subtotal);
        const json = await res.json();
        if (!json.valid) {
          if (couponMsg) {
            couponMsg.textContent = '❌ ' + (json.error || 'Neplatný kód');
            couponMsg.style.color = '#ff8c8c';
          }
          return;
        }
        checkoutState.discount = { code: json.code, type: json.type, value: Number(json.value) };
        if (couponMsg) {
          couponMsg.textContent = '✓ Kód aplikovaný';
          couponMsg.style.color = '#7be88a';
        }
        renderCheckout();
      } catch (err) {
        if (couponMsg) {
          couponMsg.textContent = '❌ Chyba pripojenia, skús znova';
          couponMsg.style.color = '#ff8c8c';
        }
      }
    };
  }
  if (couponRemoveBtn) {
    couponRemoveBtn.onclick = () => {
      checkoutState.discount = null;
      renderCheckout();
    };
  }

  if (checkoutState.step === 1) {
    document.querySelectorAll('#shippingOptions input[name="shipping"]').forEach(r => {
      r.onchange = () => {
        checkoutState.shippingId = r.value;
        // reset packeta point if switching method type
        if (!SHIPPING_METHODS[r.value].packeta) checkoutState.pickupPoint = null;
        renderCheckout();
      };
    });
    const openPck = document.getElementById('openPacketaBtn');
    const changePck = document.getElementById('changePickupBtn');
    if (openPck) openPck.onclick = openPacketaWidget;
    if (changePck) changePck.onclick = openPacketaWidget;
    document.getElementById('toStep2').onclick = () => {
      const m = SHIPPING_METHODS[checkoutState.shippingId];
      if (m.packeta && !checkoutState.pickupPoint) {
        alert('Najprv si vyber Packeta miesto.');
        return;
      }
      checkoutState.step = 2;
      renderCheckout();
    };
  }
  if (checkoutState.step === 2) {
    const form = document.getElementById('customerForm');
    const invoice = form.querySelector('input[name="invoice"]');
    invoice.onchange = () => {
      document.getElementById('companyFields').hidden = !invoice.checked;
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const email = (data.get('email') || '').toString().trim();
      const phoneRaw = (data.get('phone') || '').toString().trim();
      const phoneDigits = phoneRaw.replace(/\s+/g, '');

      // Email: must contain @ and a domain with dot
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      // Phone: 0XXXXXXXXX (10 digits) OR +421XXXXXXXXX (12 chars)
      const phoneOk = /^(0\d{9}|\+421\d{9})$/.test(phoneDigits);

      // Clear previous errors
      form.querySelectorAll('.checkout__field-error').forEach(el => el.remove());
      form.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));

      const showError = (name, msg) => {
        const input = form.querySelector(`input[name="${name}"]`);
        if (!input) return;
        input.classList.add('has-error');
        const err = document.createElement('div');
        err.className = 'checkout__field-error';
        err.textContent = msg;
        input.insertAdjacentElement('afterend', err);
      };

      if (!emailOk) {
        showError('email', 'Zadaj platný e-mail (musí obsahovať @ a doménu).');
      }
      if (!phoneOk) {
        showError('phone', 'Telefón vo formáte 0950 890 908 alebo +421950890098.');
      }
      if (!emailOk || !phoneOk) {
        form.querySelector('.has-error')?.focus();
        return;
      }

      // Format phone for display: 0950 890 908 OR +421 950 890 098
      const formatPhone = (p) => {
        if (/^0\d{9}$/.test(p)) return p.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');
        if (/^\+421\d{9}$/.test(p)) return p.replace(/^(\+421)(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4');
        return p;
      };

      checkoutState.customer = {
        firstName: data.get('firstName')?.trim(),
        lastName:  data.get('lastName')?.trim(),
        email:     email,
        phone:     formatPhone(phoneDigits),
        street:    data.get('street')?.trim(),
        city:      data.get('city')?.trim(),
        zip:       data.get('zip')?.trim(),
        note:      data.get('note')?.trim(),
        invoice:   !!data.get('invoice'),
        company:   data.get('company')?.trim(),
        ico:       data.get('ico')?.trim(),
        dic:       data.get('dic')?.trim(),
        icdph:     data.get('icdph')?.trim(),
      };
      // Abandoned cart: fire-and-forget — once we have a valid email,
      // tag this person in MailerLite. If they don't complete the order,
      // the win-back automation fires. If they DO complete, /api/order
      // removes them from the Abandoned cart group automatically.
      try {
        const t = calcCheckoutTotals();
        const items = (t.items || []).map(i => {
          const f = FRAGRANCES.find(x => x.id === i.id);
          return f ? `${f.veelyn_name}×${i.qty}` : '';
        }).filter(Boolean).join(', ');
        fetch(VEELYN_API + '/api/cart-abandoned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            cartValue: t.total,
            cartItems: items,
          }),
          keepalive: true, // request survives even if the user navigates away
        }).catch(() => {});
      } catch (e) {}
      checkoutState.step = 3;
      renderCheckout();
    };
  }
  if (checkoutState.step === 3) {
    document.querySelectorAll('#paymentOptions input[name="payment"]').forEach(r => {
      r.onchange = () => { checkoutState.paymentId = r.value; renderCheckout(); };
    });
    document.getElementById('finishOrderBtn').onclick = finishOrder;
  }
}

function openPacketaWidget() {
  // The widget library is loaded async in <head> — if the user clicked
  // very early, retry once after a short delay before falling back.
  if (typeof Packeta === 'undefined' || !Packeta.Widget) {
    setTimeout(() => {
      if (typeof Packeta !== 'undefined' && Packeta.Widget) {
        openPacketaWidget();
      } else {
        alert('Packeta widget sa nepodarilo načítať. Skontroluj internetové pripojenie a skús znova.');
      }
    }, 1200);
    return;
  }
  const m = SHIPPING_METHODS[checkoutState.shippingId];
  Packeta.Widget.pick(PACKETA_API_KEY, (point) => {
    if (!point) return;
    checkoutState.pickupPoint = {
      id: point.id,
      name: point.name,
      street: point.street,
      city: point.city,
      zip: point.zip,
    };
    renderCheckout();
  }, { country: 'sk', language: 'sk', vendors: m.vendors });
}

async function finishOrder() {
  const terms = document.getElementById('termsAgree');
  if (!terms || !terms.checked) {
    alert('Musíš súhlasiť s obchodnými podmienkami.');
    return;
  }
  const submitBtn = document.getElementById('finishOrderBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Odosielam objednávku…'; }

  const t = calcCheckoutTotals();
  const items = t.items.map(it => ({
    id: it.frag.id,
    variant: it.variant || 'veelyn',
    name: it.variant === 'original' ? `${it.frag.brand} ${it.frag.original_name}` : it.frag.veelyn_name,
    originalName: it.frag.original_name,
    qty: it.qty,
    price: it.unitPrice,
  }));

  const ship = SHIPPING_METHODS[checkoutState.shippingId];
  const pay = PAYMENT_METHODS[checkoutState.paymentId];
  const newsletterOptIn = document.getElementById('newsletterOptIn')?.checked;

  const orderPayload = {
    customer: checkoutState.customer,
    items,
    subtotal: t.subtotal,
    bundleDiscount: t.bundleDiscount || 0,
    freeQty: t.freeQty || 0,
    couponCode: t.discountCode || null,
    couponDiscount: t.codeDiscount || 0,
    shipping: t.shipPrice,
    fee: t.fee,
    total: t.total,
    shippingMethod: ship.label,
    shippingId: checkoutState.shippingId,
    paymentMethod: pay.label,
    paymentId: checkoutState.paymentId,
    pickupPoint: checkoutState.pickupPoint,
    newsletterOptIn: !!newsletterOptIn,
  };

  let orderId = null;
  try {
    const res = await fetch(VEELYN_API + '/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
    });
    if (!res.ok) throw new Error(`Server vrátil ${res.status}`);
    const json = await res.json();
    orderId = json.orderId;
  } catch (err) {
    console.warn('Backend nedostupný, fallback na localStorage:', err);
  }

  // Always save to localStorage too (admin page works offline + fallback)
  const existing = JSON.parse(localStorage.getItem('veelyn_admin_orders') || '[]');
  if (!orderId) {
    const lastNum = existing.length ? Math.max(...existing.map(o => parseInt(String(o.id).replace(/\D/g, ''), 10) || 0)) : 1000;
    orderId = 'V' + (lastNum + 1);
  }
  const order = { id: orderId, ts: Date.now(), status: 'pending', ...orderPayload };
  existing.unshift(order);
  localStorage.setItem('veelyn_admin_orders', JSON.stringify(existing));

  // GTM purchase event — GA4 purchase, Meta Purchase, Google Ads conversion,
  // TikTok CompletePayment all hang off this single push.
  trackPurchase(order);

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Záväzne objednať s povinnosťou platby'; }

  // Empty cart
  state.cart = [];
  saveCart && saveCart();
  renderCart();

  // Show thanks page
  const eta = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const etaStr = eta.toLocaleDateString('sk-SK', { day: 'numeric', month: 'long' });
  const isCard = checkoutState.paymentId === 'card';
  const isTransfer = checkoutState.paymentId === 'transfer';

  $('#thanksContent').innerHTML = `
    <div class="thanks__inner">
      <div class="thanks__icon">✓</div>
      <h2 class="thanks__title">Ďakujeme${order.customer.firstName ? ', ' + order.customer.firstName : ''}!</h2>
      <p class="thanks__id">Číslo objednávky: <strong>${orderId}</strong></p>
      <p class="thanks__lead">Potvrdenie sme poslali na <strong>${order.customer.email}</strong>.<br>Ak ti správa nedorazí do 5 minút, skontroluj <em>spam</em> alebo nás kontaktuj.</p>

      <div class="thanks__details">
        <div><span>Suma</span><strong>${eur(t.total)}</strong></div>
        <div><span>Doručenie</span><strong>${ship.label}</strong></div>
        ${order.pickupPoint ? `<div><span>Miesto</span><strong>${order.pickupPoint.name}</strong></div>` : ''}
        <div><span>Platba</span><strong>${pay.label}</strong></div>
        <div><span>Predpokladané doručenie</span><strong>${etaStr}</strong></div>
      </div>

      ${isTransfer ? `
        <div class="thanks__transfer">
          <h3>Údaje na platbu</h3>
          <div><span>Číslo účtu (IBAN)</span><strong>SK00 0000 0000 0000 0000 0000</strong></div>
          <div><span>Suma</span><strong>${eur(t.total)}</strong></div>
          <div><span>Variabilný symbol</span><strong>${orderId.replace(/\D/g,'')}</strong></div>
          <div><span>Správa pre prijímateľa</span><strong>${orderId}</strong></div>
        </div>
      ` : ''}
      ${isCard ? `
        <p class="thanks__card-note">💳 V reálnej prevádzke by ťa Stripe presmeroval na zabezpečenú platobnú bránu. (Demo mode)</p>
      ` : ''}

      <div class="thanks__next">
        <h3>Čo bude ďalej?</h3>
        <ol>
          <li>Potvrdíme objednávku e-mailom</li>
          <li>Tvoju objednávku starostlivo zabalíme a pošleme — sledovacie číslo dostaneš mailom</li>
          <li>Doručíme do 1–2 prac. dní</li>
        </ol>
      </div>

      <button class="btn btn--primary btn--block" data-close>Pokračovať v nákupe</button>
      <p class="thanks__support">Otázky? <a href="mailto:info@veelyn.sk">info@veelyn.sk</a></p>
    </div>
  `;
  closeAllModals();
  openModal('thanks');
}

// Stub for cart persistence (in case it's used elsewhere)
function saveCart() {
  try { localStorage.setItem('veelyn_cart', JSON.stringify(state.cart)); } catch(e){}
}

// --- COOKIE CONSENT ---
function setupCookieBanner() {
  const banner = $('#cookieBanner');
  const acceptBtn = $('#cookieAccept');
  const rejectBtn = $('#cookieReject');
  const reopenBtn = $('#cookieReopen');
  const saveBtn = $('#cookieSave');
  const analyticsToggle = $('#cookieAnalytics');
  const marketingToggle = $('#cookieMarketing');

  const STORE_KEY = 'veelyn_cookie_consent';
  const stored = localStorage.getItem(STORE_KEY);

  function save(prefs) {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...prefs, ts: Date.now() }));
    banner.hidden = true;
    // Sync toggles in modal
    if (analyticsToggle) analyticsToggle.checked = !!prefs.analytics;
    if (marketingToggle) marketingToggle.checked = !!prefs.marketing;

    // Google Consent Mode v2 update — flips GTM tags (GA4, Meta CAPI, Ads)
    // from queued/cookieless state to fully tracking based on user choice.
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        ad_storage:         prefs.marketing ? 'granted' : 'denied',
        ad_user_data:       prefs.marketing ? 'granted' : 'denied',
        ad_personalization: prefs.marketing ? 'granted' : 'denied',
        analytics_storage:  prefs.analytics ? 'granted' : 'denied',
      });
    }
    // Also push the user's choice as a dataLayer event so GTM tags can
    // fire any "consent_update" triggers configured in GTM UI.
    (window.dataLayer = window.dataLayer || []).push({
      event: 'consent_update',
      analytics_granted: !!prefs.analytics,
      marketing_granted: !!prefs.marketing,
    });

    // Notify other features (e.g. the scratch-ticket promo popup) that they
    // can now show themselves — it would be rude to overlay them on top of
    // a cookie banner that the user hadn't engaged with yet.
    document.dispatchEvent(new CustomEvent('veelyn:cookie-consent'));
  }

  if (!stored) {
    // Show banner after small delay so it doesn't slam in immediately
    setTimeout(() => { banner.hidden = false; }, 800);
  } else {
    try {
      const prefs = JSON.parse(stored);
      if (analyticsToggle) analyticsToggle.checked = !!prefs.analytics;
      if (marketingToggle) marketingToggle.checked = !!prefs.marketing;
    } catch {}
  }

  acceptBtn?.addEventListener('click', () => save({ necessary: true, analytics: true, marketing: true }));
  rejectBtn?.addEventListener('click', () => save({ necessary: true, analytics: false, marketing: false }));
  saveBtn?.addEventListener('click', () => {
    save({
      necessary: true,
      analytics: !!analyticsToggle?.checked,
      marketing: !!marketingToggle?.checked
    });
    closeAllModals();
  });
  reopenBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeAllModals();
    openModal('cookies');
  });
}

// --- NEWSLETTER ---
function setupNewsletter() {
  const form = $('#newsletterForm');
  if (!form) return;
  const feedback = $('#newsletterFeedback');

  // Inline feedback — replaces the old browser alert() popups which
  // looked terrible and broke immersion. The element lives below the
  // form (display:none until needed), shows for 7 s, then auto-hides.
  let hideTimer = null;
  function showFeedback(msg, kind = 'success') {
    if (!feedback) return;
    if (hideTimer) clearTimeout(hideTimer);
    feedback.hidden = false;
    feedback.textContent = msg;
    feedback.className = 'footer__newsletter-feedback footer__newsletter-feedback--' + kind;
    hideTimer = setTimeout(() => { feedback.hidden = true; }, 7000);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    if (!data.get('consent')) {
      showFeedback('Pre prihlásenie zaškrtni prosím súhlas so spracovaním údajov.', 'error');
      return;
    }
    const email = (data.get('email') || '').toString().trim();
    if (!email || !email.includes('@')) {
      showFeedback('Zadaj prosím platný e-mail.', 'error');
      return;
    }
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn?.textContent;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Prihlasujem…'; }
    try {
      const res = await fetch(VEELYN_API + '/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'footer' }),
      });
      if (!res.ok) throw new Error(`Server vrátil ${res.status}`);
      try { trackEvent('sign_up', { method: 'newsletter' }); } catch {}
      showFeedback('Hotovo! ✦ Pozri si schránku — čaká ťa zľavový kód.', 'success');
      form.reset();
    } catch (err) {
      console.warn('Newsletter signup failed:', err);
      showFeedback('Niečo sa pokazilo, skús to prosím o chvíľu znova.', 'error');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText || 'Prihlásiť'; }
    }
  });
}

// --- INIT ---
function init() {
  $('#year').textContent = new Date().getFullYear();
  seedRatings();
  setupMarquees();
  renderCarousel();
  renderTopSellers();
  setupSearch();
  setupCatalog();
  setupBundle();
  setupContactForm();
  setupWholesaleForm();
  setupAffiliateForm();
  // Scroll-to-form CTA inside affiliate modal — uses panel-relative
  // scroll instead of native anchor (which would mutate the URL).
  const scrollToForm = document.getElementById('affiliateScrollToForm');
  if (scrollToForm) {
    scrollToForm.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById('affiliateForm');
      const panel = scrollToForm.closest('.modal__panel');
      if (target && panel) {
        const rect = target.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        panel.scrollBy({ top: rect.top - panelRect.top - 16, behavior: 'smooth' });
      }
    });
  }
  setupHeroCart();
  setupCookieBanner();
  setupNewsletter();
  setupHomeCatalog();
  renderBestsellers();
  renderAllFragrances();
  setupEvents();
  // First-paint render of the cart so the empty-state UI is ready when the
  // user opens the drawer (without this, cartItems is just blank HTML).
  renderCart();
  setupSocialProofToast();
  setupPromoPopup();
  setupMobileMenu();
  injectProductSchemas();
  setupDeepLinks();
}

// --- SEO: dynamic Product / ItemList / Breadcrumb JSON-LD --------------
// Generates one Product schema per fragrance plus an ItemList wrapping them
// and a BreadcrumbList for the home page, all in a single @graph block.
// Googlebot renders JS so this is indexed alongside the static head schema.
function injectProductSchemas() {
  if (!Array.isArray(FRAGRANCES) || !FRAGRANCES.length) return;
  const SITE = 'https://veelyn.sk';
  const products = FRAGRANCES.map((f, i) => {
    const rating = (state?.ratings || {})[f.id];
    const slug = encodeURIComponent(f.id);
    const url = `${SITE}/?vona=${slug}`;
    const image = `${SITE}/images/veelyn/${f.id}.png`;
    const genderLabel = f.gender === 'M' ? 'pánska' : f.gender === 'Z' ? 'dámska' : 'unisex';
    const node = {
      '@type': 'Product',
      '@id': `${SITE}/#product-${f.id}`,
      name: `Dupé ${f.brand} ${f.original_name} — VEELYN ${f.veelyn_name}`,
      alternateName: [
        `VEELYN ${f.veelyn_name}`,
        `${f.brand} ${f.original_name} dupé`,
        `${f.brand} ${f.original_name} alternatíva`,
        `vôňa ako ${f.brand} ${f.original_name}`,
      ],
      description: `Dupé parfum inšpirovaný ${f.brand} ${f.original_name}. Eau de parfum 50 ml, ${genderLabel} vôňa s dlhou výdržou za 24,99 € namiesto ${Number(f.original_price).toFixed(0)} €. Lacnejšia alternatíva k originálu, made in Slovakia.`,
      sku: `veelyn-${f.id}`,
      mpn: `VEELYN-${(f.veelyn_name || '').replace(/\s+/g, '-')}`,
      brand: { '@type': 'Brand', name: 'Veelyn' },
      category: 'Beauty / Fragrance / Eau de Parfum',
      keywords: [
        `${f.brand} ${f.original_name} dupé`,
        `dupé na ${f.original_name}`,
        `vôňa ako ${f.brand} ${f.original_name}`,
        'dupé parfumy',
        'lacnejšia alternatíva parfumu',
      ].join(', '),
      image,
      url,
      offers: {
        '@type': 'Offer',
        url,
        priceCurrency: 'EUR',
        price: Number(f.veelyn_price || 0).toFixed(2),
        availability: 'https://schema.org/InStock',
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@id': `${SITE}/#organization` },
        shippingDetails: {
          '@type': 'OfferShippingDetails',
          shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'SK' },
          shippingRate: { '@type': 'MonetaryAmount', value: '4.99', currency: 'EUR' },
        },
        hasMerchantReturnPolicy: {
          '@type': 'MerchantReturnPolicy',
          applicableCountry: 'SK',
          returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
          merchantReturnDays: 14,
          returnMethod: 'https://schema.org/ReturnByMail',
          returnFees: 'https://schema.org/FreeReturn',
        },
      },
    };
    if (rating && rating.count > 0) {
      node.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: Number(rating.avg).toFixed(2),
        reviewCount: rating.count,
        bestRating: '5',
        worstRating: '1',
      };
    }
    return node;
  });

  const itemList = {
    '@type': 'ItemList',
    '@id': `${SITE}/#all-fragrances`,
    name: 'Všetky vône Veelyn',
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: p.url,
    })),
  };

  const breadcrumbs = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Domov', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Všetky vône', item: `${SITE}/#vsetky-vonavky` },
    ],
  };

  const payload = {
    '@context': 'https://schema.org',
    '@graph': [...products, itemList, breadcrumbs],
  };

  const tag = document.createElement('script');
  tag.type = 'application/ld+json';
  tag.id = 'veelyn-product-jsonld';
  tag.textContent = JSON.stringify(payload);
  // Replace if it already exists (hot-reload friendly)
  const existing = document.getElementById('veelyn-product-jsonld');
  if (existing) existing.remove();
  document.head.appendChild(tag);
}

// --- SEO: deep links so each fragrance has a shareable URL --------------
// `?vona=moulin-rouge` opens the product modal automatically and updates
// the page title + canonical so social shares show the right product.
function setupDeepLinks() {
  const params = new URLSearchParams(location.search);
  const id = params.get('vona');
  if (id && Array.isArray(FRAGRANCES) && FRAGRANCES.find(f => f.id === id)) {
    // Defer so the modal CSS + listeners are all wired before opening
    setTimeout(() => openProduct(id), 50);
  }

  // When a product is opened via UI, reflect that in the URL + <title> +
  // meta description so back/forward, social-sharing, and search engines
  // see a dupé-targeted page per fragrance.
  const ORIG_TITLE = document.title;
  const canonical = document.querySelector('link[rel="canonical"]');
  const ORIG_CANONICAL = canonical?.href || 'https://veelyn.sk/';
  const metaDesc = document.querySelector('meta[name="description"]');
  const ORIG_DESC = metaDesc?.content || '';
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  const ogUrl = document.querySelector('meta[property="og:url"]');
  const ogImg = document.querySelector('meta[property="og:image"]');
  const ORIG_OG_TITLE = ogTitle?.content || '';
  const ORIG_OG_DESC = ogDesc?.content || '';
  const ORIG_OG_URL = ogUrl?.content || 'https://veelyn.sk/';
  const ORIG_OG_IMG = ogImg?.content || 'https://veelyn.sk/og-image.jpg';

  const _open = openProduct;
  openProduct = function patchedOpenProduct(pid) {
    _open(pid);
    const f = FRAGRANCES.find(x => x.id === pid);
    if (!f) return;
    // GA4 view_item / Meta ViewContent
    trackViewItem(f);
    const url = new URL(location.href);
    url.searchParams.set('vona', pid);
    history.replaceState({ vona: pid }, '', url.toString());
    const newTitle = `Dupé ${f.brand} ${f.original_name} — VEELYN ${f.veelyn_name} | 24,99 €`;
    const newDesc = `Dupé na ${f.brand} ${f.original_name}. VEELYN ${f.veelyn_name} — eau de parfum 50 ml za 24,99 € namiesto ${Number(f.original_price).toFixed(0)} €. Slovenský parfumársky brand, doprava zdarma nad 40 €.`;
    const productUrl = `https://veelyn.sk/?vona=${encodeURIComponent(pid)}`;
    const productImg = `https://veelyn.sk/images/veelyn/${pid}.png`;
    document.title = newTitle;
    if (canonical) canonical.href = productUrl;
    if (metaDesc) metaDesc.content = newDesc;
    if (ogTitle) ogTitle.content = newTitle;
    if (ogDesc) ogDesc.content = newDesc;
    if (ogUrl) ogUrl.content = productUrl;
    if (ogImg) ogImg.content = productImg;
  };

  // Reset title / meta / OG when any modal closes
  document.addEventListener('modal:close', () => {
    const url = new URL(location.href);
    if (url.searchParams.has('vona')) {
      url.searchParams.delete('vona');
      history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
    }
    document.title = ORIG_TITLE;
    if (canonical) canonical.href = ORIG_CANONICAL;
    if (metaDesc) metaDesc.content = ORIG_DESC;
    if (ogTitle) ogTitle.content = ORIG_OG_TITLE;
    if (ogDesc) ogDesc.content = ORIG_OG_DESC;
    if (ogUrl) ogUrl.content = ORIG_OG_URL;
    if (ogImg) ogImg.content = ORIG_OG_IMG;
  });
}

// --- MOBILE DRAWER MENU (visible only via CSS under 700px) ---
function setupMobileMenu() {
  const burger = document.getElementById('navBurger');
  const menu = document.getElementById('mobileMenu');
  if (!burger || !menu) return;
  const open = () => {
    menu.hidden = false;
    void menu.offsetWidth;
    menu.classList.add('mobile-menu--open');
    burger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
  };
  const close = () => {
    menu.classList.remove('mobile-menu--open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
    setTimeout(() => { menu.hidden = true; }, 300);
  };
  burger.addEventListener('click', () => {
    if (menu.hidden) open(); else close();
  });
  menu.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-menu]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) close();
  });
}

// --- PROMO POPUP — scratch ticket (everything ON the ticket, 1× per day) ---
function setupPromoPopup() {
  const popup = document.getElementById('promoPopup');
  if (!popup) return;

  // Mobile + desktop both get the scratch popup now — the CSS at
  // @media (max-width: 699px) shrinks it to a 188px corner pill on
  // small screens. CTA text differs (prstom vs kurzorom) — see below.

  const closeBtn = document.getElementById('promoPopupClose');
  const copyBtn = document.getElementById('promoPopupCopy');
  const codeEl = document.getElementById('promoPopupCode');
  const canvas = document.getElementById('promoScratchCanvas');
  const scratchEl = document.getElementById('promoScratch');
  const CODE = 'VEELYN5';
  const KEY = 'veelyn_promo_dismissed_v4';
  const COOKIE_KEY = 'veelyn_cookie_consent';
  const today = new Date().toISOString().slice(0, 10);

  try { if (localStorage.getItem(KEY) === today) return; } catch (e) {}

  const persist = () => { try { localStorage.setItem(KEY, today); } catch (e) {} };

  let autoHideTimer = null;
  const cancelAutoHide = () => {
    if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; }
  };

  const hide = (saveDismiss) => {
    cancelAutoHide();
    popup.classList.remove('promo-popup--visible');
    document.body.classList.remove('has-promo-popup');
    setTimeout(() => { popup.hidden = true; }, 500);
    if (saveDismiss) persist();
  };

  const show = () => {
    popup.hidden = false;
    void popup.offsetWidth;
    popup.classList.add('promo-popup--visible');
    document.body.classList.add('has-promo-popup');
    // Trigger init both via rAF and a setTimeout fallback (preview iframe sometimes throttles rAF)
    requestAnimationFrame(() => requestAnimationFrame(initScratch));
    setTimeout(initScratch, 80);
    // Mobile: if the user doesn't tap the ticket within 4s, dismiss it for the day
    if (window.matchMedia('(max-width: 699px)').matches) {
      autoHideTimer = setTimeout(() => hide(true), 10000);
    }
  };

  // First interaction with the popup cancels the auto-hide
  popup.addEventListener('pointerdown', cancelAutoHide, true);
  popup.addEventListener('touchstart', cancelAutoHide, { capture: true, passive: true });

  // Don't show the scratch ticket until the user has answered the cookie
  // banner (accepted, rejected, or saved preferences). If consent isn't yet
  // stored, wait for the 'veelyn:cookie-consent' event before showing.
  let hasConsent = false;
  try { hasConsent = !!localStorage.getItem(COOKIE_KEY); } catch (e) {}
  if (hasConsent) {
    setTimeout(show, 3000);
  } else {
    document.addEventListener('veelyn:cookie-consent', () => {
      // Small delay so the popup doesn't slam in the instant the user
      // clicks the cookie button.
      setTimeout(show, 1500);
    }, { once: true });
  }
  closeBtn && closeBtn.addEventListener('click', () => hide(true));

  copyBtn && copyBtn.addEventListener('click', () => {
    const finish = () => {
      copyBtn.textContent = '✓ Skopírované — môžeš použiť';
      copyBtn.classList.add('is-copied');
      persist();
      setTimeout(() => hide(true), 1100);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(CODE).then(finish).catch(() => fallbackCopy(codeEl, finish));
    } else {
      fallbackCopy(codeEl, finish);
    }
  });

  function fallbackCopy(el, cb) {
    try {
      const r = document.createRange();
      r.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand('copy');
      sel.removeAllRanges();
      cb();
    } catch (e) {}
  }

  let scratchInited = false;
  function initScratch() {
    if (scratchInited || !canvas || !scratchEl) return;
    scratchInited = true;
    const ctx = canvas.getContext('2d');
    const rect = scratchEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      scratchInited = false;
      setTimeout(initScratch, 100);
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    drawScratchSurface(ctx, rect.width, rect.height);

    let drawing = false;
    let revealed = false;
    let lastX = 0, lastY = 0;

    const getPos = (e) => {
      const r2 = canvas.getBoundingClientRect();
      const p = e.touches && e.touches[0] ? e.touches[0] : e;
      return { x: p.clientX - r2.left, y: p.clientY - r2.top };
    };

    const scratchAt = (x, y) => {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 38;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.fill();
    };

    let lastCheck = 0;
    const checkProgress = () => {
      const now = Date.now();
      if (now - lastCheck < 120) return;
      lastCheck = now;
      try {
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let cleared = 0, total = 0;
        for (let i = 3; i < img.length; i += 4 * 80) {
          total++;
          if (img[i] < 20) cleared++;
        }
        if (cleared / total > 0.45) reveal();
      } catch (e) {}
    };

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      popup.classList.add('promo-popup--revealed');
    };

    const onDown = (e) => {
      if (revealed) return;
      e.preventDefault();
      drawing = true;
      const p = getPos(e);
      lastX = p.x; lastY = p.y;
      scratchAt(p.x + 0.01, p.y + 0.01);
    };
    const onMove = (e) => {
      if (!drawing || revealed) return;
      e.preventDefault();
      const p = getPos(e);
      scratchAt(p.x, p.y);
      lastX = p.x; lastY = p.y;
      checkProgress();
    };
    const onUp = () => { drawing = false; checkProgress(); };

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onUp);
    canvas.addEventListener('touchcancel', onUp);
  }

  function drawScratchSurface(ctx, w, h) {
    // Luxury foil — deep velvet purple with gold metallic highlights.
    // Matches Veelyn brand instead of generic silver lottery.
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0,    '#1a0b2e');
    base.addColorStop(0.35, '#2d1654');
    base.addColorStop(0.55, '#3d1f6b');
    base.addColorStop(0.8,  '#2a1547');
    base.addColorStop(1,    '#15082a');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // Gold metallic sheen sweep — diagonal
    const sheen = ctx.createLinearGradient(0, h, w, 0);
    sheen.addColorStop(0,    'rgba(212,162,71,0)');
    sheen.addColorStop(0.42, 'rgba(212,162,71,0)');
    sheen.addColorStop(0.5,  'rgba(244,200,100,0.32)');
    sheen.addColorStop(0.58, 'rgba(212,162,71,0)');
    sheen.addColorStop(1,    'rgba(212,162,71,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);

    // Soft inner vignette for depth
    const vignette = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.2, w/2, h/2, Math.max(w,h)*0.85);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    // Faint gold flecks — confetti dust feel
    for (let i = 0; i < 35; i++) {
      const sx = Math.random() * w;
      const sy = Math.random() * h;
      const sr = 0.35 + Math.random() * 0.9;
      ctx.fillStyle = `rgba(244,200,100,${0.12 + Math.random() * 0.18})`;
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }
    // Subtle purple sparkles for extra depth
    for (let i = 0; i < 22; i++) {
      const sx = Math.random() * w;
      const sy = Math.random() * h;
      const sr = 0.3 + Math.random() * 0.7;
      ctx.fillStyle = `rgba(196,170,255,${0.18 + Math.random() * 0.22})`;
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }

    // Scale headline + eyes to canvas width (mobile compact popup is much narrower)
    const isCompact = w < 220;
    let headFontPx = isCompact ? 13 : 22;
    let eyesSizePx = isCompact ? 22 : 40;
    const eyesGap = isCompact ? 4 : 8;
    const subFontPx = isCompact ? 10 : 14;
    const SIDE_PAD = isCompact ? 4 : 8;

    // Main headline + eyes — centered as one unit, gold gradient text.
    // If the text+eyes block would overflow the canvas width (which can
    // happen on the 174px-wide mobile compact ticket), scale both down
    // together so the leading "V" never gets clipped.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${headFontPx}px Manrope, system-ui, sans-serif`;
    const HEADLINE = 'VYBRALI SME TEBA';
    const headY = h * 0.38;
    let headWidth = ctx.measureText(HEADLINE).width;
    let totalWidth = headWidth + eyesGap + eyesSizePx;
    const maxWidth = w - SIDE_PAD * 2;
    if (totalWidth > maxWidth) {
      const scale = maxWidth / totalWidth;
      headFontPx = Math.max(10, Math.floor(headFontPx * scale));
      eyesSizePx = Math.max(18, Math.floor(eyesSizePx * scale));
      ctx.font = `800 ${headFontPx}px Manrope, system-ui, sans-serif`;
      headWidth = ctx.measureText(HEADLINE).width;
      totalWidth = headWidth + eyesGap + eyesSizePx;
    }
    let startX = (w - totalWidth) / 2;
    if (startX < SIDE_PAD) startX = SIDE_PAD;
    // Soft drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    const headGrad = ctx.createLinearGradient(0, headY - headFontPx * 0.6, 0, headY + headFontPx * 0.6);
    headGrad.addColorStop(0,    '#fff7d6');
    headGrad.addColorStop(0.45, '#f4cc6c');
    headGrad.addColorStop(0.55, '#e0a847');
    headGrad.addColorStop(1,    '#b9842c');
    ctx.fillStyle = headGrad;
    ctx.fillText(HEADLINE, startX, headY);
    ctx.restore();

    // Position HTML eyes overlay right after the headline
    const eyesEl = document.getElementById('promoPopupEyes');
    if (eyesEl) {
      eyesEl.style.fontSize = eyesSizePx + 'px';
      eyesEl.style.left = (startX + headWidth + eyesGap) + 'px';
      eyesEl.style.top = (headY - eyesSizePx * 0.55) + 'px';
      eyesEl.classList.add('is-positioned');
    }

    // Subline — short action CTA in clean gold, no harsh outline.
    // Touch devices: "ZOTRI PRSTOM" (finger). Pointer devices: "ZOTRI KURZOROM".
    // pointer: coarse → primary input is touch (phone, tablet, touch laptop).
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const subText = isTouch ? 'ZOTRI PRSTOM' : 'ZOTRI KURZOROM';
    const subY = h * 0.66;
    ctx.font = `900 ${subFontPx}px Manrope, system-ui, sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    const subGrad = ctx.createLinearGradient(0, subY - 6, 0, subY + 6);
    subGrad.addColorStop(0,    '#fff5cc');
    subGrad.addColorStop(0.5,  '#f4cc6c');
    subGrad.addColorStop(1,    '#d4a247');
    ctx.fillStyle = subGrad;
    ctx.letterSpacing = '0.3em';
    ctx.fillText(subText, w / 2, subY);
    ctx.restore();

    // Animated-looking dotted arrow trail underneath the CTA — invites scratch
    ctx.save();
    const arrowY = h * 0.82;
    const arrowMid = w / 2;
    const arrowSpread = isCompact ? 28 : 50;
    ctx.fillStyle = 'rgba(244,200,100,0.6)';
    for (let i = -3; i <= 3; i++) {
      const t = i / 3;
      const x = arrowMid + t * arrowSpread;
      const r = isCompact ? 1.4 : 2.1;
      ctx.beginPath(); ctx.arc(x, arrowY, r * (1 - Math.abs(t) * 0.3), 0, Math.PI * 2); ctx.fill();
    }
    // Pointing arrow on the right
    ctx.strokeStyle = 'rgba(244,200,100,0.6)';
    ctx.lineWidth = isCompact ? 1.4 : 1.8;
    ctx.lineCap = 'round';
    const ax = arrowMid + arrowSpread;
    const ay = arrowY;
    const asz = isCompact ? 4 : 6;
    ctx.beginPath();
    ctx.moveTo(ax - asz, ay - asz);
    ctx.lineTo(ax + asz * 0.4, ay);
    ctx.lineTo(ax - asz, ay + asz);
    ctx.stroke();
    ctx.restore();
  }
}

// In-stock check — by default all fragrances are in stock; admin can override
// via localStorage key 'veelyn_oos' = ['id1','id2'...]. Add `in_stock: false`
// in data.js if needed for static control.
function isInStock(frag) {
  if (!frag) return false;
  if (frag.in_stock === false) return false;
  try {
    const oos = JSON.parse(localStorage.getItem('veelyn_oos') || '[]');
    if (Array.isArray(oos) && oos.includes(frag.id)) return false;
  } catch(e){}
  return true;
}

// Social proof rotating toast — "X just bought Y" (no city, clickable, in-stock only)
function setupSocialProofToast() {
  const toast = document.getElementById('proofToast');
  const mainBtn = document.getElementById('proofToastMain');
  const thumbEl = document.getElementById('proofToastThumb');
  const closeBtn = document.getElementById('proofToastClose');
  const nameEl = document.getElementById('proofToastName');
  const timeEl = document.getElementById('proofToastTime');
  if (!toast || !nameEl) return;
  // Names — first letter ending in 'a' → female form "kúpila"; otherwise "kúpil"
  const firstNames = ['Lucia', 'Martina', 'Peter', 'Tomáš', 'Andrea', 'Katarína', 'Miroslav', 'Zuzana', 'Jakub', 'Veronika', 'Patrik', 'Simona', 'Filip', 'Natália', 'Daniel', 'Michal', 'Barbora', 'Marek', 'Petra', 'Adam'];

  // Respect a dismissal from the current session (close button)
  const DISMISS_KEY = 'veelyn_proof_dismissed_until';
  const isDismissed = () => {
    try { return parseInt(sessionStorage.getItem(DISMISS_KEY) || '0', 10) > Date.now(); } catch(e){ return false; }
  };

  toast.dataset.fragId = '';

  function openCurrent() {
    const id = toast.dataset.fragId;
    if (!id) return;
    if (typeof openProduct === 'function') openProduct(id);
  }
  mainBtn && mainBtn.addEventListener('click', openCurrent);

  function hide() {
    toast.classList.remove('proof-toast--in');
    setTimeout(() => { toast.hidden = true; }, 280);
  }

  closeBtn && closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    try { sessionStorage.setItem(DISMISS_KEY, String(Date.now() + 30 * 60 * 1000)); } catch(e){}
    hide();
    clearTimeout(autoHideTimer);
    clearTimeout(nextTimer);
  });

  function pickFragrance() {
    const all = (typeof FRAGRANCES !== 'undefined' && FRAGRANCES.length) ? FRAGRANCES : [];
    const inStock = all.filter(isInStock);
    if (!inStock.length) return null;
    return inStock[Math.floor(Math.random() * inStock.length)];
  }

  let autoHideTimer = null;
  let nextTimer = null;

  function show() {
    if (isDismissed()) return;
    const f = pickFragrance();
    if (!f) { toast.hidden = true; return; }
    const name = firstNames[Math.floor(Math.random() * firstNames.length)];
    const verb = name.endsWith('a') ? 'kúpila' : 'kúpil';
    const minutes = Math.floor(Math.random() * 18) + 2;
    toast.dataset.fragId = f.id;
    // Thumbnail of the product (uses the same /images/veelyn asset as the rest of the site)
    if (thumbEl) {
      const slug = f.id;
      thumbEl.style.backgroundImage = `url("images/veelyn/${slug}.png?v=2")`;
    }
    nameEl.innerHTML = `${name} ${verb} <em>${f.veelyn_name}</em>`;
    timeEl.textContent = `pred ${minutes} min · overený nákup ✓`;
    toast.hidden = false;
    void toast.offsetWidth;
    toast.classList.add('proof-toast--in');
    clearTimeout(autoHideTimer);
    autoHideTimer = setTimeout(() => {
      hide();
      // Next toast after 22-32 seconds — long enough not to feel spammy
      nextTimer = setTimeout(show, 22000 + Math.random() * 10000);
    }, 7000);
  }
  // First toast a few seconds after page load
  nextTimer = setTimeout(show, 4500);
}

init();
