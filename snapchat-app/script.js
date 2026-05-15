// ===== elements =====
const loginScreen = document.getElementById('screen-login');
const homeScreen  = document.getElementById('screen-home');
const profileSheet = document.getElementById('profile-sheet');

const form     = document.getElementById('login-form');
const userIn   = document.getElementById('username');
const passIn   = document.getElementById('password');
const togglePw = document.getElementById('toggle-pw');
const loginBtn = document.getElementById('login-btn');
const orRow    = document.getElementById('or-row');
const googleBtn= document.getElementById('google-btn');
const appleBtn = document.getElementById('apple-btn');
const footnote = document.getElementById('footnote');

const bitmojiImg = document.getElementById('bitmoji-img');
const bitmojiFb  = document.getElementById('bitmoji-fallback');
const profileChip = document.getElementById('profile-chip');
const sheetClose = document.getElementById('sheet-close');
const bigImg    = document.getElementById('big-avatar-img');
const bigFb     = document.getElementById('big-avatar-fallback');
const nameEl    = document.getElementById('profile-name');
const handleEl  = document.getElementById('profile-handle');
const statSnaps = document.getElementById('stat-snaps');
const statFr    = document.getElementById('stat-friends');
const statSt    = document.getElementById('stat-streak');

// ===== login button enabled when both fields filled =====
function syncLoginBtn() {
  const ok = userIn.value.trim().length > 0 && passIn.value.length > 0;
  loginBtn.disabled = !ok;
  loginBtn.classList.toggle('active', ok);
}
userIn.addEventListener('input', syncLoginBtn);
passIn.addEventListener('input', syncLoginBtn);

togglePw.addEventListener('click', () => {
  passIn.type = passIn.type === 'password' ? 'text' : 'password';
});

// ===== avatar fetching =====
function previewImageUrl(username) {
  return `https://us-east1-aws.api.snapchat.com/web-capture/www.snapchat.com/@${encodeURIComponent(username)}/preview/square.jpeg?xp_id=1`;
}

function loadImg(url) {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (ok) => { if (done) return; done = true; resolve(ok ? url : null); };
    img.onload  = () => finish(img.naturalWidth > 0);
    img.onerror = () => finish(false);
    img.src = url;
    setTimeout(() => finish(false), 6000);
  });
}

const PROXIES = [
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

function unescapeJsonStr(s) {
  if (!s) return s;
  return s.replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\"/g, '"');
}

async function fetchProfileMeta(username) {
  const target = `https://www.snapchat.com/add/${encodeURIComponent(username)}`;
  for (const p of PROXIES) {
    try {
      const r = await fetch(p(target));
      if (!r.ok) continue;
      const html = await r.text();
      if (!html || html.length < 50_000) continue; // valid profiles are huge
      const pick = (re) => { const m = html.match(re); return m ? m[1] : null; };
      return {
        profilePictureUrl: unescapeJsonStr(pick(/"profilePictureUrl"\s*:\s*"([^"]+)"/)),
        ogImage: pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
              || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i),
        ogTitle: pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i),
        ogDesc:  pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i),
        displayName: pick(/"displayName"\s*:\s*"([^"]+)"/),
        subCount: (() => { const m = html.match(/"subscriberCount"\s*:\s*(\d+)/); return m ? Number(m[1]) : null; })(),
      };
    } catch (e) { /* try next */ }
  }
  return null;
}

// ===== camera live feed =====
async function startCamera() {
  const v = document.getElementById('cam-video');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' }, audio: false
    });
    v.srcObject = stream;
    v.dataset.active = 'true';
  } catch (e) {
    v.dataset.active = 'false';
  }
}

// ===== fill profile UI =====
function setAvatar(url, displayName) {
  const initial = (displayName || '?').trim().charAt(0).toUpperCase() || '?';
  bitmojiFb.textContent = initial;
  bigFb.textContent = initial;

  if (url) {
    bitmojiImg.src = url;
    bigImg.src = url;
    bitmojiImg.onerror = () => bitmojiImg.removeAttribute('src');
    bigImg.onerror = () => bigImg.removeAttribute('src');
  } else {
    bitmojiImg.removeAttribute('src');
    bigImg.removeAttribute('src');
  }
}

function fillProfile(image, meta, fallbackHandle) {
  const handle = fallbackHandle;
  const name = (meta && (meta.displayName ||
                (meta.ogTitle ? meta.ogTitle.replace(/\s*(on Snapchat|sur Snapchat|en Snapchat).*$/i,'').trim() : null)
              )) || fallbackHandle;
  setAvatar(image, name);
  nameEl.textContent = name;
  handleEl.textContent = '@' + handle;

  const subs = meta && meta.subCount;
  statSnaps.textContent = subs ? formatN(Math.floor(subs * 4.7)) : randNum(120, 9800);
  statFr.textContent    = subs ? formatN(subs)                  : randNum(40, 1200);
  statSt.textContent    = randNum(3, 220);
}

function formatN(n) {
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1).replace(/\.0$/,'') + 'M';
  if (n >= 1_000)     return (n/1_000).toFixed(1).replace(/\.0$/,'') + 'K';
  return String(n);
}
function randNum(a, b) { return formatN(Math.floor(a + Math.random()*(b-a))); }

// ===== flow =====
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loginBtn.disabled) return;

  const username = userIn.value.trim().replace(/^@+/, '');

  // step 1: shrink button + spinner (matches frame 3)
  loginBtn.classList.add('loading');
  loginBtn.style.width = '64px';
  loginBtn.style.background = '#d6d8dd';

  // step 2: reveal OR + social buttons after small delay
  setTimeout(() => {
    orRow.hidden = false;
    googleBtn.hidden = false;
    appleBtn.hidden = false;
    footnote.hidden = false;
  }, 350);

  // step 3: pull avatar + meta in parallel with at-least-2.0s visual delay.
  // Primary: profilePictureUrl from JSON (real bitmoji). Fallback: og:image preview.
  const fallbackImg = previewImageUrl(username);
  const [meta, fallbackOk] = await Promise.all([
    fetchProfileMeta(username).catch(() => null),
    loadImg(fallbackImg),
    new Promise(r => setTimeout(r, 2000)),
  ]);

  const primary = meta && meta.profilePictureUrl;
  const ogImg   = meta && meta.ogImage;
  const resolvedImg = (primary && await loadImg(primary)) || (ogImg && await loadImg(ogImg)) || fallbackOk;

  fillProfile(resolvedImg, meta, username);

  // randomize notification badge between 6-124 for each take
  const notif = document.getElementById('notif-badge');
  if (notif) notif.textContent = String(Math.floor(6 + Math.random() * 119));

  // step 4: switch to camera home
  loginScreen.classList.remove('visible');
  homeScreen.classList.add('visible');
  startCamera();
});

// open profile sheet on bitmoji tap
profileChip.addEventListener('click', () => {
  profileSheet.classList.add('visible');
});
sheetClose.addEventListener('click', () => {
  profileSheet.classList.remove('visible');
});

// back button on login screen — reset everything
document.getElementById('back-btn').addEventListener('click', () => {
  // reset to fresh state for re-shoot
  userIn.value = '';
  passIn.value = '';
  syncLoginBtn();
  loginBtn.classList.remove('loading');
  loginBtn.style.width = '';
  loginBtn.style.background = '';
  orRow.hidden = true;
  googleBtn.hidden = true;
  appleBtn.hidden = true;
  footnote.hidden = true;
});

// prevent zoom on double tap iOS
let lastTouch = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouch < 350) e.preventDefault();
  lastTouch = now;
}, { passive: false });
