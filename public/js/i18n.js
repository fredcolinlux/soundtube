// v1.18.0 — i18n léger (FR/EN), sans dépendance. Repli français.
const STORAGE_KEY = 'soundtube_ui_lang';
const COOKIE = 'soundtube_ui_lang';
const SUPPORTED = ['fr', 'en'];
let catalog = {};
let current = 'fr';
const listeners = new Set();

function readCookie() {
  const m = document.cookie.match(/(?:^|;\s*)soundtube_ui_lang=(fr|en)(?:;|$)/);
  return m ? m[1] : null;
}
function writeCookie(lang) {
  document.cookie = `${COOKIE}=${lang};path=/;max-age=31536000;SameSite=Lax`;
}
function browserLang() {
  const list = [...(navigator.languages || []), navigator.language || ''].map((x) => String(x).toLowerCase());
  for (const l of list) {
    if (l.startsWith('fr')) return 'fr';
    if (l.startsWith('en')) return 'en';
  }
  return 'fr';
}
export function detectLang() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (SUPPORTED.includes(q)) return q;
  } catch {}
  try {
    const ls = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(ls)) return ls;
  } catch {}
  const c = readCookie();
  if (SUPPORTED.includes(c)) return c;
  return browserLang();
}
export function getUiLang() { return current; }
export function t(key, vars) {
  let s = catalog[key];
  if (s == null && current !== 'fr') s = catalog._fr?.[key];
  if (s == null) s = key;
  if (vars && typeof s === 'string') {
    s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : '{' + k + '}'));
  }
  return s;
}
export const tf = t;

async function loadCatalog(lang) {
  const r = await fetch(`/i18n/${lang}.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error('locale ' + lang);
  const j = await r.json();
  if (lang !== 'fr') {
    try {
      const fr = await fetch('/i18n/fr.json', { cache: 'no-cache' }).then((x) => x.json());
      j._fr = fr;
    } catch {}
  }
  return j;
}

export async function initI18n(forced) {
  current = SUPPORTED.includes(forced) ? forced : detectLang();
  catalog = await loadCatalog(current);
  document.documentElement.lang = current;
  try { localStorage.setItem(STORAGE_KEY, current); } catch {}
  writeCookie(current);
  applyDom();
  return current;
}

export async function setUiLang(lang) {
  if (!SUPPORTED.includes(lang) || lang === current) return current;
  current = lang;
  catalog = await loadCatalog(lang);
  document.documentElement.lang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
  writeCookie(lang);
  applyDom();
  listeners.forEach((fn) => { try { fn(lang); } catch {} });
  // miroir serveur (cookie déjà posé ; endpoint optionnel)
  try { await fetch('/api/ui/lang', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang }) }); } catch {}
  return lang;
}

export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function applyDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.getAttribute('data-i18n');
    if (!k) return;
    const v = t(k);
    if (el.dataset.i18nHtml === '1') el.innerHTML = v;
    else el.textContent = v;
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
  const titleEl = document.querySelector('title[data-i18n]');
  if (titleEl) document.title = t(titleEl.getAttribute('data-i18n'));
}

/** Sélecteur FR | EN pour la barre du haut (esprit v1.6). */
export function mountLangSwitcher(host) {
  if (!host) return null;
  let box = host.querySelector('.lang-switch');
  if (!box) {
    box = document.createElement('div');
    box.className = 'lang-switch';
    box.setAttribute('role', 'group');
    box.innerHTML = `<button type="button" data-lang="fr" class="lang-btn">FR</button><button type="button" data-lang="en" class="lang-btn">EN</button>`;
    host.appendChild(box);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lang]');
      if (b) setUiLang(b.dataset.lang);
    });
  }
  box.querySelectorAll('[data-lang]').forEach((b) => {
    const on = b.dataset.lang === current;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  box.setAttribute('aria-label', t('nav.lang'));
  return box;
}
