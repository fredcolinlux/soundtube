// Nom affiché sur les miniatures et vidéos YouTube (par défaut « soundtube ») : réglage global mémorisé côté serveur
// dans <dataDir>/settings.json, pour que le nom de la chaîne remplace la marque sans être retapé.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export const DEFAULT_BRAND = 'soundtube';
export const BRAND_MAX = 40;
// Caractères présents dans les polices embarquées (JetBrains Mono / Space Grotesk, sous-ensemble « latin »)
const OK = (c) => (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || [0x131, 0x152, 0x153, 0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2022, 0x2026, 0x20ac, 0x2122].includes(c);
const FOLD = { 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ħ': 'h', 'Ħ': 'H', 'ŀ': 'l', 'Ŀ': 'L', 'ẞ': 'SS' };

/** Nettoie un nom saisi : accents latins gardés, autres lettres latines translittérées, emoji / caractères non affichables retirés, ≤ 40 caractères. */
export function cleanBrand(s) {
  let out = '';
  for (const ch of String(s ?? '').normalize('NFC').replace(/[\s\u200b-\u200d\u2060\ufeff]+/gu, ' ')) {
    const c = ch.codePointAt(0);
    if (OK(c) && c !== 0xad) { out += ch; continue; }
    if (FOLD[ch]) { out += FOLD[ch]; continue; }
    const base = ch.normalize('NFD').replace(/\p{M}+/gu, ''); // ă → a, ő → o…
    if (base && [...base].every((x) => OK(x.codePointAt(0)))) out += base;
  }
  return [...out.replace(/ {2,}/g, ' ').trim()].slice(0, BRAND_MAX).join('').trim();
}

const file = () => path.join(config.dataDir, 'settings.json');
function readAll() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')) || {}; } catch { return {}; } }

/** Réglage courant : { name, hidden } — name vide = « soundtube ». */
export function getBrand() {
  const b = readAll().youtube || {};
  return { name: cleanBrand(b.brand || ''), hidden: !!b.hideBrand };
}
export function setBrand({ name, hidden } = {}) {
  const all = readAll(), cur = getBrand();
  const next = { name: name === undefined ? cur.name : cleanBrand(name), hidden: hidden === undefined ? cur.hidden : !!hidden };
  all.youtube = { ...(all.youtube || {}), brand: next.name, hideBrand: next.hidden };
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(all, null, 2)); fs.renameSync(tmp, file());
  return next;
}
/** Texte réellement dessiné : '' si masqué, sinon le nom ou « soundtube ». */
export const brandText = (b = getBrand()) => (b.hidden ? '' : (b.name || DEFAULT_BRAND));

/** URL GitHub publique du projet (pied de page). Vide = défaut soundtube upstream. */
export const DEFAULT_GITHUB = 'https://github.com/fredcolinlux/soundtube';
export function getGithubUrl() {
  const s = readAll().site || {};
  const u = String(s.githubUrl || '').trim();
  if (!u) return DEFAULT_GITHUB;
  try {
    const x = new URL(u);
    if (x.protocol !== 'http:' && x.protocol !== 'https:') return DEFAULT_GITHUB;
    return x.toString().replace(/\/$/, '');
  } catch { return DEFAULT_GITHUB; }
}
export function setGithubUrl(url) {
  const all = readAll();
  let next = '';
  if (url !== undefined && url !== null && String(url).trim()) {
    try {
      const x = new URL(String(url).trim());
      if (x.protocol === 'http:' || x.protocol === 'https:') next = x.toString().replace(/\/$/, '');
    } catch { next = ''; }
  }
  all.site = { ...(all.site || {}), githubUrl: next };
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(all, null, 2)); fs.renameSync(tmp, file());
  return getGithubUrl();
}
