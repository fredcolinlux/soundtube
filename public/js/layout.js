// Mise en page des textes YouTube (miniature et vidéo) : module partagé par le navigateur (éditeur, aperçu canvas)
// et le serveur (rendu ffmpeg). Positions relatives (0–1) → identiques en 720p, 1080p et 4K.
// Convention : x = point d'ancrage (bord gauche, centre ou bord droit selon l'alignement) ; y = haut de la boîte
// de police (ligne de base − ascendante) ; taille = hauteur de police / hauteur de l'image.
export const REF_W = 1280, REF_H = 720;
export const FONT_FILES = { sans: 'space-grotesk-latin-wght-normal.woff2', mono: 'jetbrains-mono-latin-600-normal.woff2' };
// Space Grotesk variable : ffmpeg (FreeType) dessine l'instance par défaut (300) → le navigateur doit utiliser la même graisse
export const FONT_CSS = { sans: { family: 'StLayoutSans', weight: 300 }, mono: { family: 'StLayoutMono', weight: 600 } };
export const ASC = { sans: 0.98, mono: 1.02 };
export const TARGETS = { thumb: ['chip', 'title', 'sub', 'brand', 'wave'], video: ['chip', 'title', 'sub', 'brand', 'chapter', 'spectrum'] };
export const TEXT_IDS = ['chip', 'title', 'sub', 'brand', 'chapter'];
export const LABELS = { chip: 'Étiquette du style', title: 'Titre', sub: 'Durée', brand: 'Nom de la chaîne', chapter: 'Chapitre en cours', wave: "Forme d'onde", spectrum: 'Spectre animé' };
export const ALIGNS = ['left', 'center', 'right'];
export const FITS = ['cover', 'contain'];

const X = (px) => +(px / REF_W).toFixed(4), Y = (px) => +(px / REF_H).toFixed(4);
const T = (o) => ({ align: 'left', visible: true, color: null, shadow: false, ...o });
/** Disposition d'origine (v1.6) convertie dans la nouvelle convention. */
export const DEFAULT_LAYOUT = {
  thumb: {
    chip: T({ x: X(72), y: Y(61.6), size: Y(30) }),
    title: T({ x: X(72), y: Y(112), size: Y(100), shadow: true, lines: 2, width: X(1120) }),
    sub: T({ x: X(72), y: Y(258), size: Y(36), follow: true }),
    brand: T({ x: X(1216), y: Y(656.5), size: Y(26), align: 'right' }),
    wave: { y: Y(486), size: Y(150), visible: true, color: null },
  },
  video: {
    chip: T({ x: X(56), y: Y(41.3), size: Y(24) }),
    title: T({ x: X(56), y: Y(88.9), size: Y(54), shadow: true, lines: 1, width: X(1168) }),
    sub: T({ x: X(56), y: Y(166.7), size: Y(26), follow: false }),
    brand: T({ x: X(1232), y: Y(46.2), size: Y(20), align: 'right' }),
    chapter: T({ x: X(56), y: Y(583.6), size: Y(30) }),
    spectrum: { y: Y(282), visible: true, color: null },
  },
};
export const DEFAULT_BACKGROUND = { media: null, fit: 'cover', overlay: true, thumb: 'media', dim: 0.2 };

const clamp = (v, a, b, d) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.min(b, Math.max(a, +v)) : d);
const color = (c) => (typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c) ? '#' + c.replace('#', '').toLowerCase() : null); // « #ffe08a » ou « ffe08a »
const r4 = (v) => +(+v).toFixed(4);

/** Complète / borne une disposition (champs inconnus ignorés, valeurs manquantes = défaut). */
export function normalizeLayout(src, target) {
  const def = DEFAULT_LAYOUT[target], out = {};
  for (const id of TARGETS[target]) {
    const d = def[id], s = (src && typeof src === 'object' && src[id] && typeof src[id] === 'object') ? src[id] : {};
    const e = { y: r4(clamp(s.y, 0, 1, d.y)), visible: s.visible === undefined ? d.visible : !!s.visible, color: s.color === undefined ? d.color : color(s.color) };
    if (id === 'wave') e.size = r4(clamp(s.size, 0.05, 0.5, d.size));
    if (TEXT_IDS.includes(id)) {
      Object.assign(e, { x: r4(clamp(s.x, 0, 1, d.x)), size: r4(clamp(s.size, 0.015, 0.3, d.size)), align: ALIGNS.includes(s.align) ? s.align : d.align, shadow: s.shadow === undefined ? d.shadow : !!s.shadow });
      if (id === 'title') Object.assign(e, { lines: Math.round(clamp(s.lines, 1, 3, d.lines)), width: r4(clamp(s.width, 0.1, 1, d.width)) });
      if (id === 'sub') e.follow = s.follow === undefined ? d.follow : !!s.follow;
    }
    out[id] = e;
  }
  return out;
}
export function normalizeBackground(b) {
  b = b && typeof b === 'object' ? b : {};
  return { media: typeof b.media === 'string' && /^[a-z0-9]{6,32}$/.test(b.media) ? b.media : null, fit: FITS.includes(b.fit) ? b.fit : 'cover', overlay: b.overlay === undefined ? true : !!b.overlay, thumb: b.thumb === 'generated' ? 'generated' : 'media', dim: r4(Math.round(clamp(b.dim, 0, 0.8, 0.2) * 20) / 20) };
}
/** Réglage complet { background, layout: { thumb, video } }. */
export function normalizeDesign(d) {
  d = d && typeof d === 'object' ? d : {};
  return { background: normalizeBackground(d.background), layout: { thumb: normalizeLayout(d.layout?.thumb, 'thumb'), video: normalizeLayout(d.layout?.video, 'video') } };
}
export const defaultDesign = () => normalizeDesign({});

/** Coupe le titre en ≤ n lignes (estimation par nombre de caractères, identique côté serveur et navigateur). */
export function wrapTitle(s, maxW = 1120, sizeMax = 100, maxLines = 2) {
  s = String(s || '').trim();
  const sizes = [1, 0.88, 0.76, 0.66, 0.58, 0.5].map((f) => Math.max(8, Math.round(sizeMax * f)));
  for (const size of sizes) {
    const perLine = Math.max(4, Math.floor(maxW / (size * 0.52))); const lines = ['']; let ok = true;
    for (const w of s.split(/\s+/)) { const cur = lines[lines.length - 1]; if ((cur + ' ' + w).trim().length <= perLine) lines[lines.length - 1] = (cur + ' ' + w).trim(); else { if (lines.length >= maxLines) { ok = false; break; } lines.push(w); } }
    if (ok && lines.every((l) => l.length <= perLine)) return { lines, size };
  }
  const size = sizes[sizes.length - 1], perLine = Math.max(4, Math.floor(maxW / (size * 0.52)));
  return { lines: [s.length > perLine ? s.slice(0, perLine - 1).trimEnd() + '…' : s], size };
}

const hex = (c) => (c || '').replace(/^#|^0x/, '').toLowerCase();
/**
 * Éléments à dessiner, en pixels de sortie (W×H). data = { title, chip, sub, brand, chapter, waveform? } ;
 * theme = { accent, ink } (hex sans #). Retourne { texts: [...], wave, spectrum }.
 */
export function computeItems(layout, target, data, { W = REF_W, H = REF_H, theme = { accent: 'ffffff', ink: '000000' } } = {}) {
  const L = normalizeLayout(layout, target), k = H / REF_H, px = (v) => Math.round(v * k), texts = [];
  const add = (id, el, text, font, sizeRef, baseRef, extra) => texts.push({ id, text, font, size: Math.max(1, px(sizeRef)), x: Math.round(el.x * W), baseline: px(baseRef), align: el.align, alpha: 1, shadow: el.shadow ? { color: '000000', alpha: 0.55, dy: Math.max(1, px(4)) } : null, border: 0, box: null, ...extra });
  let titleInfo = null;
  if (L.title.visible && data.title) {
    const el = L.title, { lines, size } = wrapTitle(data.title, el.width * REF_W, el.size * REF_H, el.lines), step = Math.round(size * 1.1), top = el.y * REF_H;
    lines.forEach((l, i) => add('title', el, l, 'sans', size, top + i * step + ASC.sans * size, { color: hex(el.color) || 'ffffff', border: Math.max(1, Math.round(px(size) / 50)), line: i }));
    titleInfo = { size, lastBase: top + (lines.length - 1) * step + ASC.sans * size, x: el.x, align: el.align };
  }
  if (L.chip.visible && data.chip) { const el = L.chip, s = el.size * REF_H; add('chip', el, data.chip, 'sans', s, el.y * REF_H + ASC.sans * s, { color: theme.ink, box: { color: hex(el.color) || theme.accent, pad: Math.max(2, px(s * 0.42)) } }); }
  if (L.sub.visible && data.sub) {
    const el = L.sub, s = el.size * REF_H;
    if (el.follow && titleInfo) add('sub', { ...el, x: titleInfo.x, align: titleInfo.align }, data.sub, 'sans', s, titleInfo.lastBase + 0.4 * titleInfo.size + 18 + 0.7 * s, { color: hex(el.color) || 'ffffff', alpha: el.color ? 1 : 0.82, follow: true });
    else add('sub', el, data.sub, 'sans', s, el.y * REF_H + ASC.sans * s, { color: hex(el.color) || 'ffffff', alpha: el.color ? 1 : 0.82 });
  }
  if (L.brand.visible && data.brand) { const el = L.brand, s = el.size * REF_H; add('brand', el, data.brand, 'mono', s, el.y * REF_H + ASC.mono * s, { color: hex(el.color) || theme.accent, alpha: el.color ? 1 : 0.9 }); }
  if (target === 'video' && L.chapter.visible && data.chapter) { const el = L.chapter, s = el.size * REF_H; add('chapter', el, data.chapter, 'sans', s, el.y * REF_H + ASC.sans * s, { color: hex(el.color) || 'ffffff', alpha: el.color ? 1 : 0.78 }); }
  const out = { texts, wave: null, spectrum: null };
  if (target === 'thumb' && L.wave.visible) out.wave = { cy: px(L.wave.y * REF_H), h: px(L.wave.size * REF_H), color: hex(L.wave.color) || theme.accent };
  if (target === 'video' && L.spectrum.visible) out.spectrum = { top: px(L.spectrum.y * REF_H), color: hex(L.spectrum.color) || theme.accent };
  return out;
}

/** Barres de la forme d'onde miroir (miniature) : mêmes rectangles côté ffmpeg (drawbox) et canvas. */
export function waveBars(peaks, { W, H, cy, h }) {
  const pk = peaks || [], n = 128, bw = W / n, k = H / REF_H, out = [];
  for (let i = 0; i < n && pk.length; i++) {
    const a = pk.slice(Math.floor(i * pk.length / n), Math.floor((i + 1) * pk.length / n) || undefined);
    const v = Math.max(0.04, Math.min(1, (a.length ? Math.max(...a) : 0) * 1.08)), hh = Math.round(v * h);
    const x = Math.round(i * bw + bw * 0.18), w = Math.max(2, Math.round(bw * 0.64));
    out.push({ x, y: cy - hh, w, h: hh, a: 0.85 }, { x, y: cy + Math.round(4 * k), w, h: Math.round(hh * 0.45), a: 0.25 });
  }
  return out;
}
/** Hauteur (px de sortie) du spectre + reflet, pour les guides de l'éditeur. */
export const spectrumHeight = (H) => Math.round(300 * H / REF_H); // 210 px de barres + 90 px de reflet (réf. 720p)

// ---------- rendu canvas (navigateur uniquement)
const rgba = (h, a) => `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
export const canvasFont = (it) => `${FONT_CSS[it.font].weight} ${it.size}px ${FONT_CSS[it.font].family}`;
/** Boîte occupée par un texte (pour la sélection / le glisser) et position x de départ. */
export function textBox(ctx, it) {
  ctx.font = canvasFont(it); const m = ctx.measureText(it.text), w = m.width;
  const x0 = it.align === 'center' ? it.x - w / 2 : it.align === 'right' ? it.x - w : it.x;
  const pad = it.box ? it.box.pad : 0;
  return { x0, w, left: x0 - pad, top: it.baseline - ASC[it.font] * it.size - (it.box ? pad : 0), right: x0 + w + pad, bottom: it.baseline + (it.box ? m.actualBoundingBoxDescent + pad : 0.26 * it.size), m };
}
export function drawItems(ctx, items, { W, H, waveform } = {}) {
  if (items.wave) { ctx.save(); for (const b of waveBars(waveform, { W, H, cy: items.wave.cy, h: items.wave.h })) { ctx.fillStyle = rgba(items.wave.color, b.a); ctx.fillRect(b.x, b.y, b.w, b.h); } ctx.restore(); }
  for (const it of items.texts) {
    ctx.save(); ctx.font = canvasFont(it); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const { x0, w, m } = textBox(ctx, it);
    if (it.box) { ctx.fillStyle = rgba(it.box.color, 1); const top = Math.round(it.baseline - m.actualBoundingBoxAscent - it.box.pad), bot = Math.round(it.baseline + m.actualBoundingBoxDescent + it.box.pad); ctx.fillRect(Math.round(x0 - it.box.pad), top, Math.round(w + 2 * it.box.pad), bot - top); }
    if (it.shadow) { ctx.fillStyle = rgba(it.shadow.color, it.shadow.alpha); ctx.fillText(it.text, x0, it.baseline + it.shadow.dy); }
    ctx.globalAlpha = it.alpha;
    if (it.border) { ctx.lineWidth = it.border * 2; ctx.lineJoin = 'round'; ctx.strokeStyle = rgba(it.color, 1); ctx.strokeText(it.text, x0, it.baseline); }
    ctx.fillStyle = rgba(it.color, 1); ctx.fillText(it.text, x0, it.baseline);
    ctx.restore();
  }
}
