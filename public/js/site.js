// v1.10.0 : socle commun des pages Accueil, Démarrer, Styles et pages de style
// (navigation, fond animé teinté, couleurs par style, mini-lecteur, petites aides).
import { AuroraField } from './aurora.js';
import { initI18n, t, mountLangSwitcher, onLangChange, applyDom, getUiLang } from './i18n.js';
import { apiFetch, refreshAuth, getAuthUser } from './csrf.js';
import { mountAuthMenu } from './authmenu.js';
export { t, getUiLang, refreshAuth, getAuthUser };

export const $ = (q, el = document) => el.querySelector(q);
export const $$ = (q, el = document) => [...el.querySelectorAll(q)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export async function api(url, opts = {}) {
  const r = await apiFetch(url, { headers: { 'content-type': 'application/json' }, ...opts });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `${t('err.generic', { status: r.status })}`);
  return j;
}
export const fmt = (s) => { s = Math.max(0, Math.round(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
export const dateFr = (d) => { try { return new Date(d).toLocaleDateString(document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };

/** Couleur principale (identique au studio) + couleur d'accompagnement pour les dégradés. */
export const STYLE_COLOR = { lofi: '#f3c97a', ambient: '#7fd0ff', synthwave: '#c792ff', house: '#5ef2c9', frenchtouch: '#ffd23f', techno: '#a9b4d8', cinematic: '#e8dcb0', chiptune: '#b6f36a', trap: '#ff8fc7', hiphop: '#ffb36b', dnb: '#6be3ff' };
export const STYLE_COLOR_2 = { lofi: '#ff8a65', ambient: '#9b8cff', synthwave: '#ff4f9a', house: '#3aa8ff', frenchtouch: '#ff5a36', techno: '#6c7cff', cinematic: '#c07a4a', chiptune: '#33d6ff', trap: '#8b5cff', hiphop: '#ff5e5e', dnb: '#2ef0a0' };
/** Trois mots d'ambiance par style (cartes et en-têtes ; pas de texte promotionnel). */
export const STYLE_WORDS = {
  lofi: ['vinyle', 'Rhodes', 'swing'], ambient: ['nappes', 'espace', 'lenteur'], synthwave: ['néons', 'supersaw', 'nuit'],
  house: ['groove', 'contretemps', 'chaleur'], frenchtouch: ['filtre', 'pompe', 'disco'], techno: ['hypnose', '909', 'acid'],
  cinematic: ['cordes', 'tension', 'ampleur'], chiptune: ['8-bit', 'arpèges', 'console'], trap: ['808', 'rafales', 'ombre'],
  hiphop: ['boom-bap', 'MPC', 'poussière'], dnb: ['breaks', 'reese', 'vitesse'],
};
export const colorOf = (id) => STYLE_COLOR[id] || '#5ef2c9';
export const color2Of = (id) => STYLE_COLOR_2[id] || '#9b8cff';
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const NAV_ITEMS = () => [['/accueil', t('nav.home')], ['/demarrer', t('nav.start')], ['/styles', t('nav.styles')], ['/', t('nav.studio')]];
/** Barre du haut commune ; `current` = chemin de la page (aria-current). */
export function mountTopbar(current) {
  const h = document.createElement('header'); h.className = 'topbar site-top';
  const paint = () => {
    h.innerHTML = `<a class="brand" href="/accueil" aria-label="${t('nav.brandAria')}">
      <svg class="brand-mark" viewBox="0 0 28 20" width="28" height="20" aria-hidden="true"><rect x="0" y="7" width="4" height="6" rx="2"/><rect x="6" y="2" width="4" height="16" rx="2"/><rect x="12" y="5" width="4" height="10" rx="2"/><rect x="18" y="0" width="4" height="20" rx="2"/><rect x="24" y="7" width="4" height="6" rx="2"/></svg>
      <span>sound<em>tube</em></span></a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="siteNav"><span></span><span></span><span></span><b class="sr">${t('nav.menu')}</b></button>
    <nav id="siteNav">${NAV_ITEMS().map(([href, l]) => `<a href="${href}"${href === current || (href === '/styles' && current.startsWith('/styles')) ? ' aria-current="page"' : ''}>${l}</a>`).join('')}
      <a href="/docs" target="_blank" rel="noopener">${t('nav.api')}</a></nav>
    <span class="top-auth" id="topAuth"></span>
    <a class="btn btn-primary btn-mini nav-cta" href="/">${t('nav.openStudio')}</a>`;
    const tog = $('.nav-toggle', h); tog.addEventListener('click', () => { const o = h.classList.toggle('open'); tog.setAttribute('aria-expanded', String(o)); });
    mountLangSwitcher(h);
    mountAuthMenu($('#topAuth', h)).catch(() => {});
  };
  paint();
  document.body.prepend(h);
  onLangChange(() => { paint(); applyDom(document); });
  return h;
}
export async function bootI18n() { await initI18n(); applyDom(document); }
/** Initialise i18n puis la barre du haut (pages Accueil / Démarrer / Styles). */
export async function bootSite(current) {
  await initI18n();
  const h = mountTopbar(current);
  applyDom(document);
  return h;
}

/** Fond animé (aurore + oscilloscope du studio), teinté par style si `style` est donné. */
export function mountBackground(style) {
  const cv = document.createElement('canvas'); cv.className = 'bg-canvas'; cv.setAttribute('aria-hidden', 'true'); document.body.prepend(cv);
  const colors = style ? [rgb(colorOf(style)), rgb(color2Of(style)), rgb('#6cc6ff')] : undefined;
  const f = new AuroraField(cv, { colors }); f.start(); return f;
}

/** Apparition douce des blocs au défilement (désactivée si « réduire les animations »). */
export function reveal(root = document) {
  const els = $$('[data-reveal]', root);
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  els.forEach((e) => io.observe(e));
}

/** Carte de style colorée (Accueil, Styles) : lien vers la page du style. */
export function styleCardHtml(s, i) {
  const words = STYLE_WORDS[s.id] || [];
  const bars = Array.from({ length: 14 }, (_, k) => `<i style="--k:${k}"></i>`).join('');
  return `<a class="sc" href="/styles/${s.id}" style="--c:${colorOf(s.id)};--c2:${color2Of(s.id)};--beat:${(60 / ((s.bpm[0] + s.bpm[1]) / 2)).toFixed(3)}s" data-reveal>
    <span class="sc-idx">${String(i + 1).padStart(2, '0')}</span>
    <span class="sc-bars" aria-hidden="true">${bars}</span>
    <b class="sc-name">${esc(s.label)}</b>
    <span class="sc-genre">${esc(s.genre)}</span>
    <span class="sc-words">${words.map((w) => `<em>${esc(w)}</em>`).join('')}</span>
    <span class="sc-foot"><span>${s.bpm[0]}–${s.bpm[1]} BPM</span><span>${s.tracks ? (s.tracks > 1 ? t('style.tracksCount_plural', { n: s.tracks }) : t('style.tracksCount', { n: s.tracks })) : t('style.tracksNone')}</span></span>
  </a>`;
}

/** Mini-lecteur commun (une piste à la fois) ; anime le fond avec le signal réel. */
export class MiniPlayer {
  constructor(field) {
    this.field = field; this.audio = new Audio(); this.audio.preload = 'none'; this.cur = null;
    const el = document.createElement('div'); el.className = 'mini-player'; el.hidden = true;
    el.innerHTML = `<button type="button" class="mp-btn" aria-label="Lecture / pause"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path class="mp-play" d="M7 4.5v15l13-7.5z"/><g class="mp-pause" hidden><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></g></svg></button>
      <div class="mp-info"><b class="mp-title"></b><span class="mp-sub"></span></div>
      <div class="mp-bar" role="slider" aria-label="Position" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
      <span class="mp-time">0:00</span>`;
    document.body.append(el); this.el = el;
    $('.mp-btn', el).addEventListener('click', () => this.toggle());
    $('.mp-bar', el).addEventListener('click', (e) => { if (!this.audio.duration) return; const r = e.currentTarget.getBoundingClientRect(); this.audio.currentTime = ((e.clientX - r.left) / r.width) * this.audio.duration; });
    $('.mp-bar', el).addEventListener('keydown', (e) => { if (!this.audio.duration) return; if (e.key === 'ArrowRight') this.audio.currentTime += 10; if (e.key === 'ArrowLeft') this.audio.currentTime -= 10; });
    this.audio.addEventListener('timeupdate', () => this.tick());
    for (const ev of ['play', 'pause', 'ended']) this.audio.addEventListener(ev, () => { this.sync(); this.onChange?.(); });
  }
  graph() {
    if (this.an || !window.AudioContext) return;
    try { const ctx = new AudioContext(); const src = ctx.createMediaElementSource(this.audio); this.an = ctx.createAnalyser(); this.an.fftSize = 1024; src.connect(this.an); this.an.connect(ctx.destination); this.ctx = ctx; this.buf = new Uint8Array(this.an.fftSize);
      this.field.onTick = () => { if (!this.an || this.audio.paused) { this.field.energy *= 0.95; this.field.bass *= 0.95; this.field.setWave(null); return; } this.an.getByteTimeDomainData(this.buf); let e = 0; for (let i = 0; i < this.buf.length; i += 4) { const v = (this.buf[i] - 128) / 128; e += v * v; } e = Math.sqrt(e / (this.buf.length / 4)); this.field.energy += (Math.min(1, e * 2.4) - this.field.energy) * 0.15; this.field.bass = this.field.energy * 0.8; this.field.setWave(this.buf); };
    } catch { this.an = null; }
  }
  play(t) {
    if (!t?.urls?.mp3 && !t?.urls?.wav) return;
    if (this.cur?.id === t.id) return this.toggle();
    this.cur = t; this.audio.src = t.urls.mp3 || t.urls.wav; this.el.hidden = false; this.el.style.setProperty('--c', colorOf(t.style));
    $('.mp-title', this.el).textContent = t.title; $('.mp-sub', this.el).textContent = [fmt(t.duration), t.bpm ? `${t.bpm} BPM` : ''].filter(Boolean).join(' · ');
    this.graph(); this.ctx?.resume?.(); this.audio.play().catch(() => {});
  }
  toggle() { if (!this.cur) return; this.graph(); this.ctx?.resume?.(); this.audio.paused ? this.audio.play().catch(() => {}) : this.audio.pause(); }
  playing(id) { return this.cur?.id === id && !this.audio.paused; }
  sync() { const p = !this.audio.paused; $('.mp-play', this.el).toggleAttribute('hidden', p); $('.mp-pause', this.el).toggleAttribute('hidden', !p); }
  tick() { const d = this.audio.duration || 0, p = d ? this.audio.currentTime / d : 0; $('.mp-bar span', this.el).style.width = (p * 100).toFixed(2) + '%'; $('.mp-bar', this.el).setAttribute('aria-valuenow', String(Math.round(p * 100))); $('.mp-time', this.el).textContent = `${fmt(this.audio.currentTime)} / ${fmt(d)}`; }
}

/** v1.12.0 : lien entre un ancien morceau et sa version régénérée (harmonie juste). */
export function regenLine(t) {
  const lk = (x) => `<a href="/?track=${encodeURIComponent(x.id)}#library">« ${esc(x.title || 'morceau supprimé')} »</a>`;
  if (t.regen_of) return `<span class="tr-regen">régénéré en v${esc(t.regen_of.version || '1.12.0')} · depuis ${lk(t.regen_of)}</span>`;
  if (t.regenerations?.length) return `<span class="tr-regen">version régénérée (v1.12.0) : ${t.regenerations.map(lk).join(', ')}</span>`;
  return '';
}

/** Ligne de bibliothèque (pages de style, accueil). */
export function trackRowHtml(t, player, labels = {}, { listenOnly = false } = {}) {
  const on = player?.playing(t.id);
  const tags = [fmt(t.duration), t.bpm ? `${t.bpm} BPM` : '', labels.key?.[t.key] ? labels.key[t.key] : t.key, labels.mood?.[t.mood] || ''].filter(Boolean);
  const links = listenOnly ? '' : `<span class="tr-date">${dateFr(t.created_at)}</span>
    <span class="tr-links">${t.urls?.mp3 ? `<a href="${esc(t.urls.mp3)}?download=1">MP3</a>` : ''}${t.urls?.wav ? `<a href="${esc(t.urls.wav)}?download=1">WAV</a>` : ''}${t.urls?.mid ? `<a href="${esc(t.urls.mid)}?download=1">MIDI</a>` : ''}<a href="/?track=${encodeURIComponent(t.id)}#library" title="Retrouver ce morceau dans le studio (variation, vidéo…)">Studio</a>${t.regen_ok && !t.regenerations?.length ? `<button type="button" class="tr-regen-btn" data-regen="${esc(t.id)}" title="Même graine, mêmes réglages, harmonie corrigée (moteur 21). L’original est conservé.">Régénérer en v1.12.0</button>` : ''}</span>`;
  return `<li class="tr-row${on ? ' on' : ''}${listenOnly ? ' tr-listen' : ''}" data-id="${esc(t.id)}" style="--c:${colorOf(t.style)}">
    <button type="button" class="tr-play" data-play="${esc(t.id)}" aria-label="${on ? 'Pause' : 'Écouter'} « ${esc(t.title)} »">${on ? '❚❚' : '▶'}</button>
    <span class="tr-main"><b>${esc(t.title)}</b><span>${tags.map(esc).join(' · ')}</span>${listenOnly ? '' : regenLine(t)}</span>
    ${links}
  </li>`;
}
