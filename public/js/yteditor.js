import { t } from './i18n.js';
// Éditeur « Animation et mise en page » du panneau YouTube : fond (animation importée ou visuel généré) et position des textes.
// L'aperçu canvas utilise le même module de mise en page et les mêmes polices que le rendu ffmpeg du serveur (WYSIWYG) ;
// « Comparer au rendu » affiche l'image réellement produite par le serveur avec le réglage en cours.
import { REF_W, REF_H, ASC, TARGETS, TEXT_IDS, LABELS, normalizeDesign, defaultDesign, computeItems, drawItems, textBox, spectrumHeight, FONT_CSS } from './layout.js?v=1.6.2';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const fontsReady = Promise.all([`${FONT_CSS.sans.weight} 40px ${FONT_CSS.sans.family}`, `${FONT_CSS.mono.weight} 40px ${FONT_CSS.mono.family}`].map((f) => document.fonts.load(f))).catch(() => {});
const SNAP = 8; // px (référence 1280×720)
const editors = new Map(); // id du morceau → { el, st }
// v1.14.0 : animation choisie à la génération = réglage propre au morceau dans l'éditeur (le changer ici ne touche que ce morceau)
const edScope = (s) => (s === 'track' || s === 'generation' ? 'track' : 'global');
let media = null; // bibliothèque partagée { items, maxBytes, accept }
let deps = null;

/** deps = { api, toast, getTrack(id), getYt(id), onSaved(id) } */
export function initEditors(d) { deps = d; }
export const editorSlot = (id) => `<div class="yd-slot" data-ydslot="${esc(id)}"></div>`;
export function isEditorOpen(id) { return editors.get(id)?.st.open || false; }
/** Après chaque rendu de la bibliothèque : rattache les éditeurs existants (canvas, état, focus conservés). */
export function mountEditors(root) {
  for (const slot of root.querySelectorAll('[data-ydslot]')) {
    const id = slot.dataset.ydslot; let ed = editors.get(id);
    if (!ed) { ed = create(id); editors.set(id, ed); }
    const had = document.activeElement && ed.el.contains(document.activeElement) ? document.activeElement : null;
    slot.replaceWith(ed.el);
    if (had && document.activeElement !== had) had.focus({ preventScroll: true });
    refreshFromYt(ed);
  }
}

async function loadMedia(force) { if (!media || force) media = await deps.api('/api/media'); return media; }

function create(id) {
  const el = document.createElement('section'); el.className = 'yt-design'; el.dataset.id = id;
  const st = { id, open: false, target: 'thumb', sel: 'title', draft: null, saved: null, scope: 'global', server: null, serverBusy: false, base: null, baseUrl: '', drag: null, guides: [], upload: null };
  const ed = { el, st };
  el.innerHTML = `<button class="btn btn-mini yd-toggle" type="button" aria-expanded="false">${t('yd.toggle')}</button><div class="yd-body" hidden></div>`;
  el.querySelector('.yd-toggle').addEventListener('click', async () => {
    st.open = !st.open; el.querySelector('.yd-toggle').setAttribute('aria-expanded', st.open); el.querySelector('.yd-toggle').classList.toggle('on', st.open);
    el.querySelector('.yd-body').hidden = !st.open;
    if (st.open) { if (!st.draft) await initDraft(ed); render(ed); }
  });
  return ed;
}
async function initDraft(ed) {
  const st = ed.st, d = deps.getYt(st.id);
  try { await loadMedia(); } catch (e) { deps.toast(e.message); media = { items: [], maxBytes: 0, accept: '' }; }
  const cur = d?.design || defaultDesign();
  st.scope = edScope(cur.scope);
  st.draft = normalizeDesign(cur); st.saved = JSON.stringify(st.draft);
}
function refreshFromYt(ed) {
  const st = ed.st; if (!st.open || !st.draft) return;
  const d = deps.getYt(st.id); if (!d || d.error) return;
  if (!dirty(st)) { const cur = normalizeDesign(d.design || {}); const j = JSON.stringify(cur); if (j !== st.saved) { st.draft = cur; st.saved = j; st.scope = edScope(d.design?.scope); render(ed); return; } }
  draw(ed);
}
const dirty = (st) => st.draft && JSON.stringify(normalizeDesign(st.draft)) !== st.saved;

// ---------- rendu du panneau
function render(ed) {
  const { el, st } = ed, body = el.querySelector('.yd-body'), D = st.draft, B = D.background, L = D.layout[st.target];
  const items = media?.items || [], maxMb = media?.maxBytes ? Math.round(media.maxBytes / 1048576) : 500;
  const e = L[st.sel] || L.title, isText = TEXT_IDS.includes(st.sel);
  const d = deps.getYt(st.id), noChapters = st.target === 'video' && !(d?.chapters?.length);
  const tile = (mid, label, img, kind) => `<div class="yd-tile ${B.media === mid ? 'on' : ''}" role="radio" aria-checked="${B.media === mid}" tabindex="0" data-ydmedia="${mid || ''}" title="${esc(label)}">
      ${img ? `<img src="${img}" alt="" loading="lazy">` : '<span class="yd-gen" aria-hidden="true"></span>'}<span class="yd-tname">${esc(label)}</span>${kind ? `<span class="yd-kind">${kind}</span>` : ''}
      ${mid ? `<button class="yd-del" type="button" data-yddel="${mid}" title="Supprimer de la bibliothèque" aria-label="Supprimer ${esc(label)}">✕</button>` : ''}</div>`;
  body.innerHTML = `
    <div class="yd-head">
      <div class="seg" role="radiogroup" aria-label="Mise en page à modifier">
        <button type="button" role="radio" aria-checked="${st.target === 'thumb'}" class="${st.target === 'thumb' ? 'on' : ''}" data-ydtarget="thumb">Miniature</button>
        <button type="button" role="radio" aria-checked="${st.target === 'video'}" class="${st.target === 'video' ? 'on' : ''}" data-ydtarget="video">Vidéo</button>
      </div>
      <label class="yd-scope">Enregistrer pour
        <select data-ydscope><option value="global" ${st.scope === 'global' ? 'selected' : ''}>tous les morceaux</option><option value="track" ${st.scope === 'track' ? 'selected' : ''}>ce morceau uniquement</option></select>
      </label>
    </div>
    <div class="yd-grid">
      <div class="yd-stage">
        <div class="yd-canvas-wrap">
          <canvas width="${REF_W}" height="${REF_H}" tabindex="0" role="application" aria-label="Aperçu ${st.target === 'thumb' ? 'de la miniature' : 'de la vidéo'} : glisse un texte pour le déplacer ; flèches pour l'ajuster"></canvas>
          ${st.server ? `<img class="yd-server" src="${st.server}" alt="Rendu du serveur">` : ''}
        </div>
        <div class="row">
          <button class="btn btn-mini ${st.server ? 'on' : ''}" type="button" data-ydcompare ${st.serverBusy ? 'disabled' : ''}>${st.serverBusy ? 'Rendu en cours…' : st.server ? 'Revenir à l\'éditeur' : 'Comparer au rendu'}</button>
          <span class="hint">Glisse les textes · flèches : 1 px, Maj + flèches : 10 px · repères de centre et d'alignement automatiques</span>
        </div>
        ${noChapters ? '<p class="hint">Ce morceau n\'a pas de chapitres : « Chapitre » est un exemple, rien ne s\'affichera dans sa vidéo.</p>' : ''}
      </div>
      <div class="yd-side">
        <h5>Textes</h5>
        <ul class="yd-els" role="listbox" aria-label="Éléments">
          ${TARGETS[st.target].map((k) => `<li class="${st.sel === k ? 'on' : ''}"><label class="yd-vis" title="Afficher / masquer"><input type="checkbox" data-ydvis="${k}" ${L[k].visible ? 'checked' : ''} aria-label="Afficher ${esc(LABELS[k])}"></label><button type="button" role="option" aria-selected="${st.sel === k}" data-ydsel="${k}">${esc(LABELS[k])}</button></li>`).join('')}
        </ul>
        <div class="yd-props">
          ${isText || st.sel === 'wave' ? `<label>Taille <input type="range" min="${st.sel === 'wave' ? 5 : 1.5}" max="${st.sel === 'wave' ? 50 : st.sel === 'title' ? 30 : 15}" step="0.1" value="${(e.size * 100).toFixed(1)}" data-ydprop="size"><output>${(e.size * REF_H).toFixed(0)} px</output></label>` : ''}
          ${isText ? `<div class="yd-row"><span>Alignement</span><div class="seg seg-sm" role="radiogroup" aria-label="Alignement">${[['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']].map(([v, l]) => `<button type="button" role="radio" aria-checked="${e.align === v}" class="${e.align === v ? 'on' : ''}" data-ydalign="${v}">${l}</button>`).join('')}</div></div>` : ''}
          <div class="yd-row"><span>Couleur</span><input type="color" value="${e.color || '#ffffff'}" data-ydprop="color" aria-label="Couleur" ${e.color ? '' : 'class="auto"'}><label class="yt-check"><input type="checkbox" data-ydauto ${e.color ? '' : 'checked'}> Auto</label>
          ${isText ? `<label class="yt-check"><input type="checkbox" data-ydprop="shadow" ${e.shadow ? 'checked' : ''}> Ombre</label>` : ''}</div>
          ${st.sel === 'title' ? `<div class="yd-row"><span>Lignes max.</span><select data-ydprop="lines">${[1, 2, 3].map((n) => `<option ${e.lines === n ? 'selected' : ''}>${n}</option>`).join('')}</select><span>Largeur</span><input type="range" min="20" max="100" step="1" value="${Math.round(e.width * 100)}" data-ydprop="width" aria-label="Largeur max. du titre"></div>` : ''}
          ${st.sel === 'sub' ? `<label class="yt-check"><input type="checkbox" data-ydprop="follow" ${e.follow ? 'checked' : ''}> Toujours sous le titre</label>` : ''}
          ${st.sel === 'spectrum' || st.sel === 'wave' ? '<p class="hint">Se déplace verticalement.</p>' : ''}
        </div>
        <h5>Fond</h5>
        <div class="yd-lib" role="radiogroup" aria-label="Fond">
          ${tile(null, 'Visuel généré', null, '')}
          ${items.map((m) => tile(m.id, m.name, m.poster, m.kind === 'video' ? `${(m.duration || 0).toFixed(1)} s` : m.kind === 'gif' ? 'GIF' : 'image')).join('')}
        </div>
        <div class="row">
          <label class="btn btn-mini yd-up">${t('yd.import')}<input type="file" accept="${esc(media?.accept || '')}" data-ydfile hidden></label>
          ${st.upload ? `<span class="hint">${esc(st.upload)}</span>` : ''}
        </div>
        <p class="hint">MP4, WebM, MOV, GIF animé (bouclés sur toute la durée) ou image PNG/JPG · ${maxMb} Mo max.<br><b>Utilise uniquement des animations dont tu as les droits</b> (création perso, licence libre ou achetée) : YouTube peut bloquer ou démonétiser une vidéo qui reprend l'œuvre d'un autre.</p>
        ${B.media ? `
        <div class="yd-row"><span>${t('yd.fit')}</span><div class="seg seg-sm" role="radiogroup" aria-label="${t('yd.fit')}"><button type="button" role="radio" aria-checked="${B.fit === 'cover'}" class="${B.fit === 'cover' ? 'on' : ''}" data-ydfit="cover" title="Remplit l'image, quitte à recadrer">${t('yd.cover')}</button><button type="button" role="radio" aria-checked="${B.fit === 'contain'}" class="${B.fit === 'contain' ? 'on' : ''}" data-ydfit="contain" title="Animation entière, bandes sur les côtés">${t('yd.contain')}</button></div></div>
        <label>Voile sombre <input type="range" min="0" max="80" step="5" value="${Math.round(B.dim * 100)}" data-ydbg="dim"><output>${Math.round(B.dim * 100)} %</output></label>
        <label class="yt-check"><input type="checkbox" data-ydbg="overlay" ${B.overlay ? 'checked' : ''}> Garder le spectre (vidéo) et la forme d'onde (miniature) par-dessus</label>
        <div class="yd-row"><span>Miniature</span><div class="seg seg-sm" role="radiogroup" aria-label="Fond de la miniature"><button type="button" role="radio" aria-checked="${B.thumb === 'media'}" class="${B.thumb === 'media' ? 'on' : ''}" data-ydthumb="media">Image de l'animation</button><button type="button" role="radio" aria-checked="${B.thumb === 'generated'}" class="${B.thumb === 'generated' ? 'on' : ''}" data-ydthumb="generated">Visuel généré</button></div></div>` : ''}
      </div>
    </div>
    <div class="row yd-actions">
      <button class="btn btn-mini btn-primary" type="button" data-ydsave ${dirty(st) || st.scopeChanged ? '' : 'disabled'}>${t('yd.save')}</button>
      <button class="btn btn-mini" type="button" data-ydundo ${dirty(st) ? '' : 'disabled'}>Annuler les modifications</button>
      <button class="btn btn-mini" type="button" data-ydreset title="Disposition et fond d'origine">Réinitialiser</button>
      <span class="hint" data-ydstatus>${dirty(st) ? 'Modifications non enregistrées' : st.scope === 'track' ? 'Réglage propre à ce morceau' : 'Réglage commun à tous les morceaux'}</span>
    </div>`;
  bind(ed);
  draw(ed);
}

// ---------- aperçu canvas
function previewData(ed) {
  const d = deps.getYt(ed.st.id) || {}, lang = d.lang === 'en' ? 'en' : 'fr', tx = { ...(d.drawTexts?.[lang] || {}) };
  if (ed.st.target === 'video' && !tx.chapter) tx.chapter = lang === 'en' ? 'Chapter' : 'Chapitre';
  return { texts: tx, theme: d.theme || { accent: '5ef2c9', ink: '061416' }, style: deps.getTrack(ed.st.id)?.style || 'house' };
}
function baseUrl(ed) {
  const B = ed.st.draft.background, { style } = previewData(ed);
  const useMedia = B.media && (ed.st.target === 'video' || B.thumb === 'media');
  return `/api/youtube/base.jpg?style=${encodeURIComponent(style)}${useMedia ? `&media=${B.media}&fit=${B.fit}&dim=${B.dim}` : ''}`;
}
function itemsOf(ed) {
  const { st } = ed, D = st.draft, B = D.background, { texts, theme } = previewData(ed);
  const it = computeItems(D.layout[st.target], st.target, texts, { W: REF_W, H: REF_H, theme });
  const usesMedia = B.media && (st.target === 'video' || B.thumb === 'media');
  if (usesMedia && !B.overlay) { it.wave = null; it.spectrum = null; }
  return it;
}
async function draw(ed) {
  const { el, st } = ed, cv = el.querySelector('canvas'); if (!cv || !st.open) return;
  const url = baseUrl(ed);
  if (st.baseUrl !== url) { st.baseUrl = url; st.base = null; const img = new Image(); img.onload = () => { if (st.baseUrl === url) { st.base = img; draw(ed); } }; img.src = url; }
  await fontsReady;
  const ctx = cv.getContext('2d'), it = itemsOf(ed), { theme } = previewData(ed);
  ctx.clearRect(0, 0, REF_W, REF_H);
  if (st.base) ctx.drawImage(st.base, 0, 0, REF_W, REF_H); else { ctx.fillStyle = '#0b0f1a'; ctx.fillRect(0, 0, REF_W, REF_H); }
  if (it.spectrum) drawSpectrum(ctx, it.spectrum);
  drawItems(ctx, it, { W: REF_W, H: REF_H, waveform: deps.getTrack(st.id)?.waveform || [] });
  if (st.target === 'video') { ctx.fillStyle = '#' + theme.accent; ctx.fillRect(0, REF_H - 6, REF_W * 0.3, 6); }
  // sélection + repères
  const box = boxOf(ed, st.sel, it);
  if (box) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.strokeRect(box.left - 4, box.top - 4, box.right - box.left + 8, box.bottom - box.top + 8); ctx.restore(); }
  if (st.guides.length) { ctx.save(); ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 1; for (const g of st.guides) { ctx.beginPath(); if (g.x != null) { ctx.moveTo(g.x + 0.5, 0); ctx.lineTo(g.x + 0.5, REF_H); } else { ctx.moveTo(0, g.y + 0.5); ctx.lineTo(REF_W, g.y + 0.5); } ctx.stroke(); } ctx.restore(); }
}
// spectre indicatif (le vrai est calculé depuis l'audio au rendu)
function drawSpectrum(ctx, sp) {
  const n = 160, bw = REF_W / n; ctx.save();
  for (let i = 0; i < n; i++) {
    const f = i / n, v = Math.max(0.03, Math.pow(Math.sin(f * 9.3) * 0.5 + 0.5, 3) * (1 - f * 0.6) * (0.55 + 0.45 * Math.sin(i * 1.7) ** 2));
    const h = Math.round(v * 210); ctx.fillStyle = `#${sp.color}`; ctx.globalAlpha = 0.85; ctx.fillRect(i * bw + 1, sp.top + 210 - h, bw - 2, h);
    ctx.globalAlpha = 0.25; ctx.fillRect(i * bw + 1, sp.top + 210, bw - 2, Math.min(90, Math.round(h * 0.43)));
  }
  ctx.restore();
}
/** Boîte occupée par un élément (px de référence). */
function boxOf(ed, id, it = itemsOf(ed)) {
  const ctx = ed.el.querySelector('canvas')?.getContext('2d'); if (!ctx) return null;
  if (id === 'wave') return it.wave ? { left: 0, right: REF_W, top: it.wave.cy - it.wave.h, bottom: it.wave.cy + Math.round(it.wave.h * 0.45) + 4 } : null;
  if (id === 'spectrum') return it.spectrum ? { left: 0, right: REF_W, top: it.spectrum.top, bottom: it.spectrum.top + spectrumHeight(REF_H) } : null;
  const parts = it.texts.filter((x) => x.id === id).map((x) => textBox(ctx, x)); if (!parts.length) return null;
  return { left: Math.min(...parts.map((b) => b.left)), right: Math.max(...parts.map((b) => b.right)), top: Math.min(...parts.map((b) => b.top)), bottom: Math.max(...parts.map((b) => b.bottom)) };
}
function hit(ed, x, y) {
  const it = itemsOf(ed), order = [...TARGETS[ed.st.target]].reverse(); // textes au-dessus des visuels
  const texts = order.filter((k) => TEXT_IDS.includes(k)), vis = order.filter((k) => !TEXT_IDS.includes(k));
  for (const k of [...texts, ...vis]) { const b = boxOf(ed, k, it); if (b && x >= b.left - 6 && x <= b.right + 6 && y >= b.top - 6 && y <= b.bottom + 6) return k; }
  return null;
}

// ---------- modifications
function changed(ed, rerender = false) {
  const { el, st } = ed; st.server = null;
  if (rerender) return render(ed);
  const s = el.querySelector('[data-ydstatus]'); if (s) s.textContent = dirty(st) ? t('yd.dirty') : st.scope === 'track' ? t('yd.scopeTrack') : t('yd.scopeAll');
  el.querySelector('[data-ydsave]')?.toggleAttribute('disabled', !dirty(st) && !st.scopeChanged);
  el.querySelector('[data-ydundo]')?.toggleAttribute('disabled', !dirty(st));
  el.querySelector('.yd-server')?.remove(); const c = el.querySelector('[data-ydcompare]'); if (c && !st.serverBusy) { c.textContent = t('yd.compare'); c.classList.remove('on'); }
  draw(ed);
}
/** Déplace un élément (dx, dy en px de référence) avec aimantation sur le centre et les autres éléments. */
function move(ed, id, start, dx, dy, snap) {
  const { st } = ed, L = st.draft.layout[st.target], e = L[id]; st.guides = [];
  if (id === 'sub' && e.follow) { // le détacher du titre à sa position actuelle
    const it = itemsOf(ed).texts.find((x) => x.id === 'sub'); if (it) { e.follow = false; e.x = it.x / REF_W; e.align = it.align; e.y = (it.baseline - ASC.sans * it.size) / REF_H; start.x = e.x; start.y = e.y; }
  }
  let y = start.y + dy / REF_H, x = TEXT_IDS.includes(id) ? start.x + dx / REF_W : null;
  if (snap) {
    const others = TARGETS[st.target].filter((k) => k !== id && TEXT_IDS.includes(k) && L[k].visible);
    if (x != null) {
      const cands = [0.5, ...others.map((k) => L[k].x)]; let best = null;
      for (const c of cands) { const dpx = Math.abs((x - c) * REF_W); if (dpx <= SNAP && (!best || dpx < best.d)) best = { c, d: dpx }; }
      if (best) { x = best.c; st.guides.push({ x: Math.round(x * REF_W) }); }
    }
    const tmp = { ...e, y, ...(x != null ? { x } : {}) }; L[id] = tmp; const b = boxOf(ed, id); L[id] = e;
    if (b) { // centre vertical de l'image, ou haut aligné sur un autre élément
      const mid = (b.top + b.bottom) / 2;
      if (Math.abs(mid - REF_H / 2) <= SNAP) { y += (REF_H / 2 - mid) / REF_H; st.guides.push({ y: REF_H / 2 }); }
      else for (const k of others) { if (Math.abs((y - L[k].y) * REF_H) <= SNAP) { y = L[k].y; st.guides.push({ y: Math.round(b.top - (tmp.y - y) * REF_H) }); break; } }
    }
  }
  e.y = Math.min(1, Math.max(0, +y.toFixed(4))); if (x != null) e.x = Math.min(1, Math.max(0, +x.toFixed(4)));
}
function bind(ed) {
  const { el, st } = ed, body = el.querySelector('.yd-body'), cv = body.querySelector('canvas');
  const L = () => st.draft.layout[st.target], cur = () => L()[st.sel];
  const toRef = (ev) => { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) * REF_W / r.width, y: (ev.clientY - r.top) * REF_H / r.height }; };
  cv.addEventListener('pointerdown', (ev) => {
    const p = toRef(ev), k = hit(ed, p.x, p.y); cv.focus({ preventScroll: true });
    if (!k) return; ev.preventDefault();
    if (k !== st.sel) { st.sel = k; render(ed); }
    const cv2 = el.querySelector('canvas'); cv2.setPointerCapture?.(ev.pointerId);
    st.drag = { id: k, p, start: { x: L()[k].x, y: L()[k].y }, cv: cv2 };
  });
  const onMove = (ev) => {
    const cvs = el.querySelector('canvas');
    if (!st.drag) { const k = hit(ed, ...Object.values(toRefOn(cvs, ev))); cvs.style.cursor = k ? (TEXT_IDS.includes(k) ? 'move' : 'ns-resize') : 'default'; return; }
    const p = toRefOn(cvs, ev); move(ed, st.drag.id, st.drag.start, p.x - st.drag.p.x, p.y - st.drag.p.y, !ev.altKey); changed(ed);
  };
  const toRefOn = (c, ev) => { const r = c.getBoundingClientRect(); return { x: (ev.clientX - r.left) * REF_W / r.width, y: (ev.clientY - r.top) * REF_H / r.height }; };
  cv.addEventListener('pointermove', onMove);
  const end = () => { if (!st.drag) return; st.drag = null; st.guides = []; changed(ed, true); el.querySelector('canvas')?.focus({ preventScroll: true }); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('keydown', (ev) => {
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key]; if (!k) return;
    ev.preventDefault(); const n = ev.shiftKey ? 10 : 1, e = cur(); if (!TEXT_IDS.includes(st.sel) && k[0]) return;
    move(ed, st.sel, { x: e.x, y: e.y }, k[0] * n, k[1] * n, false); changed(ed);
    clearTimeout(st._kt); st._kt = setTimeout(() => changed(ed, true), 600); // panneau (boutons) mis à jour après la rafale
  });
  body.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button, [data-ydmedia]'); if (!b || !body.contains(b)) return;
    const ds = b.dataset;
    if (ds.ydtarget) { st.target = ds.ydtarget; if (!TARGETS[st.target].includes(st.sel)) st.sel = 'title'; st.server = null; render(ed); }
    else if (ds.ydsel) { st.sel = ds.ydsel; render(ed); el.querySelector('canvas').focus({ preventScroll: true }); }
    else if (ds.ydalign) { const e = cur(), it = itemsOf(ed), bx = boxOf(ed, st.sel, it); if (bx) e.x = +((ds.ydalign === 'left' ? bx.left + (it.texts.find((x) => x.id === st.sel)?.box?.pad || 0) : ds.ydalign === 'center' ? (bx.left + bx.right) / 2 : bx.right - (it.texts.find((x) => x.id === st.sel)?.box?.pad || 0)) / REF_W).toFixed(4); e.align = ds.ydalign; changed(ed, true); }
    else if (ds.ydfit) { st.draft.background.fit = ds.ydfit; changed(ed, true); }
    else if (ds.ydthumb) { st.draft.background.thumb = ds.ydthumb; changed(ed, true); }
    else if (ds.yddel) { ev.stopPropagation(); await del(ed, ds.yddel); }
    else if (b.matches('[data-ydmedia]')) { st.draft.background.media = ds.ydmedia || null; changed(ed, true); }
    else if (b.matches('[data-ydcompare]')) await compare(ed);
    else if (b.matches('[data-ydsave]')) await save(ed);
    else if (b.matches('[data-ydundo]')) { st.draft = normalizeDesign(JSON.parse(st.saved)); st.scopeChanged = false; changed(ed, true); }
    else if (b.matches('[data-ydreset]')) { const def = defaultDesign(); if (st.target) { st.draft.layout[st.target] = def.layout[st.target]; } if (confirm(t('confirm.ydResetBg'))) st.draft.background = def.background; changed(ed, true); }
  });
  body.addEventListener('keydown', (ev) => { const t = ev.target.closest('[data-ydmedia]'); if (t && (ev.key === 'Enter' || ev.key === ' ') && !ev.target.closest('button')) { ev.preventDefault(); t.click(); } });
  body.addEventListener('input', (ev) => {
    const i = ev.target, e = cur();
    if (i.dataset.ydprop === 'size') { e.size = +(+i.value / 100).toFixed(4); i.nextElementSibling.textContent = `${Math.round(e.size * REF_H)} px`; changed(ed); }
    else if (i.dataset.ydprop === 'width') { e.width = +(+i.value / 100).toFixed(4); changed(ed); }
    else if (i.dataset.ydprop === 'color') { e.color = i.value; const a = body.querySelector('[data-ydauto]'); if (a) a.checked = false; changed(ed); }
    else if (i.dataset.ydbg === 'dim') { st.draft.background.dim = +i.value / 100; i.nextElementSibling.textContent = `${i.value} %`; changed(ed); }
  });
  body.addEventListener('change', async (ev) => {
    const i = ev.target, e = cur();
    if (i.dataset.ydvis) { L()[i.dataset.ydvis].visible = i.checked; changed(ed, true); }
    else if (i.dataset.ydprop === 'shadow') { e.shadow = i.checked; changed(ed); }
    else if (i.dataset.ydprop === 'follow') { e.follow = i.checked; changed(ed, true); }
    else if (i.dataset.ydprop === 'lines') { e.lines = +i.value; changed(ed); }
    else if (i.matches('[data-ydauto]')) { e.color = i.checked ? null : (body.querySelector('[data-ydprop="color"]').value || '#ffffff'); changed(ed, true); }
    else if (i.dataset.ydbg === 'overlay') { st.draft.background.overlay = i.checked; changed(ed); }
    else if (i.dataset.ydbg === 'dim') { changed(ed, true); }
    else if (i.matches('[data-ydscope]')) { st.scopeChanged = i.value !== edScope(deps.getYt(st.id)?.design?.scope); st.scope = i.value; changed(ed, true); }
    else if (i.matches('[data-ydfile]') && i.files?.[0]) await upload(ed, i.files[0]);
  });
}

// ---------- actions serveur
async function compare(ed) {
  const { st } = ed;
  if (st.server) { st.server = null; return render(ed); }
  st.serverBusy = true; render(ed);
  try {
    const r = await fetch(`/api/tracks/${st.id}/youtube/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: st.target, design: st.draft }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erreur ${r.status}`);
    st.server = URL.createObjectURL(await r.blob());
  } catch (e) { deps.toast(e.message); } finally { st.serverBusy = false; render(ed); }
}
async function save(ed) {
  const { st } = ed, design = normalizeDesign(st.draft);
  try {
    if (st.scope === 'track') await deps.api(`/api/tracks/${st.id}/design`, { method: 'PUT', body: JSON.stringify({ design }) });
    else {
      await deps.api('/api/youtube/design', { method: 'PUT', body: JSON.stringify({ design }) });
      if (deps.getYt(st.id)?.design?.scope === 'track') await deps.api(`/api/tracks/${st.id}/design`, { method: 'PUT', body: JSON.stringify({ design: null }) });
    }
    st.saved = JSON.stringify(design); st.scopeChanged = false;
    deps.toast(st.scope === 'track' ? t('toast.ydSavedTrack') : t('toast.ydSavedAll'));
    for (const [id, o] of editors) if (id !== st.id && o.st.draft && !dirty(o.st) && st.scope === 'global') o.st.draft = null; // rechargés à la prochaine ouverture
    await deps.onSaved(st.id);
    render(ed);
  } catch (e) { deps.toast(e.message); }
}
function upload(ed, file) {
  const { st } = ed, max = media?.maxBytes || 0;
  if (max && file.size > max) { deps.toast(`Fichier trop volumineux (${Math.round(file.size / 1048576)} Mo, max ${Math.round(max / 1048576)} Mo).`); return; }
  return new Promise((resolve) => {
    const x = new XMLHttpRequest(); x.open('POST', `/api/media?name=${encodeURIComponent(file.name)}`);
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    const set = (s) => { st.upload = s; const h = ed.el.querySelector('.yd-up + .hint'); if (h) h.textContent = s || ''; else render(ed); };
    x.upload.onprogress = (e) => { if (e.lengthComputable) set(`Envoi ${Math.round(e.loaded / e.total * 100)} %…`); };
    x.upload.onload = () => set('Vérification (ffprobe)…');
    x.onload = async () => {
      let j = {}; try { j = JSON.parse(x.responseText); } catch {}
      st.upload = null;
      if (x.status === 201) { await loadMedia(true); st.draft.background.media = j.id; deps.toast(t('toast.ydMediaAdded', { name: j.name })); changed(ed, true); for (const [id, o] of editors) if (id !== st.id && o.st.open) render(o); }
      else { deps.toast(j.error || `Erreur ${x.status}`); render(ed); }
      resolve();
    };
    x.onerror = () => { st.upload = null; deps.toast('Envoi impossible (connexion interrompue).'); render(ed); resolve(); };
    set('Envoi 0 %…'); x.send(file);
  });
}
async function del(ed, mid) {
  const m = media?.items.find((x) => x.id === mid);
  if (!confirm(t('confirm.ydMediaDel', { name: m?.name || mid }))) return;
  try {
    media = await deps.api(`/api/media/${mid}`, { method: 'DELETE' });
    for (const [, o] of editors) if (o.st.draft?.background.media === mid) { o.st.draft.background.media = null; if (o.st.open) changed(o, true); }
    render(ed); await deps.onSaved(ed.st.id);
  } catch (e) { deps.toast(e.message); }
}
