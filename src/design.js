// Réglages de présentation YouTube : animation de fond + mise en page des textes (miniature / vidéo).
// Réglage global dans <dataDir>/settings.json (clé youtube.design) ; réglage propre à un morceau dans meta.youtube.design.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { normalizeDesign, defaultDesign } from '../public/js/layout.js';
import { getMedia } from './media.js';

export { normalizeDesign, defaultDesign };
const file = () => path.join(config.dataDir, 'settings.json');
function readAll() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')) || {}; } catch { return {}; } }

export const getDesign = () => normalizeDesign(readAll().youtube?.design);
export function setDesign(d) {
  const all = readAll(), next = d == null ? defaultDesign() : normalizeDesign(d);
  all.youtube = { ...(all.youtube || {}), design: next };
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(all, null, 2)); fs.renameSync(tmp, file());
  return next;
}
/** Réglage effectif d'un morceau : le sien s'il existe, sinon le réglage global. Animation supprimée → visuel généré. */
export function designOf(t) {
  const own = t?.meta?.youtube?.design, gen = !own && t?.meta?.animation && typeof t.meta.animation === 'object' ? t.meta.animation : null, d = normalizeDesign(own || getDesign());
  if (gen) d.background.media = gen.media || null; // v1.14.0 : animation choisie dans le studio avant la génération (null = fond du style)
  if (d.background.media && !getMedia(d.background.media)) d.background.media = null;
  return { ...d, scope: own ? 'track' : gen ? 'generation' : 'global' };
}

/* v1.14.0 : animation de fond par style (choisie dans le formulaire de génération) : null = « Fond du style » (dégradé généré). */
export function getStyleAnimations() { const m = readAll().youtube?.styleAnim; return m && typeof m === 'object' ? m : {}; }
export function getStyleAnimation(style) { const id = getStyleAnimations()[style] || null; return id && getMedia(id) ? id : null; }
export function setStyleAnimation(style, media) {
  if (media != null && !getMedia(media)) { const e = new Error('Animation introuvable dans la bibliothèque'); e.status = 400; throw e; }
  const all = readAll(), y = { ...(all.youtube || {}) }, m = { ...(y.styleAnim || {}) };
  if (media) m[style] = media; else delete m[style];
  y.styleAnim = m; all.youtube = y;
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(all, null, 2)); fs.renameSync(tmp, file());
  return media || null;
}
const h = (o) => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 10);
/** Empreintes : ce qui change la miniature / la vidéo (pour l'URL ?v= et les avertissements « à recréer »). */
export const thumbKey = (d, brand, lang = 'fr') => h({ ...(lang === 'en' ? { lang } : {}), b: d.background.media && d.background.thumb === 'media' ? { ...d.background, thumb: 'media' } : null, l: d.layout.thumb, brand });
export const videoKey = (d, brand, lang = 'fr') => h({ ...(lang === 'en' ? { lang } : {}), b: d.background.media ? { media: d.background.media, fit: d.background.fit, overlay: d.background.overlay, dim: d.background.dim } : null, l: d.layout.video, brand });

/** Langue des textes YouTube (titre, description, tags, textes dessinés) : dernier choix mémorisé. */
export const getLang = () => (readAll().youtube?.lang === 'en' ? 'en' : 'fr');
export function setLang(l) {
  const all = readAll(); all.youtube = { ...(all.youtube || {}), lang: l === 'en' ? 'en' : 'fr' };
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(all, null, 2)); fs.renameSync(tmp, file());
  return all.youtube.lang;
}
