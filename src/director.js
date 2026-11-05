// v1.15.0 : contexte facultatif du directeur artistique IA — profil de goût (distillé de l'export music library, livré dans
// contexte/gout.json, artistes de référence par style modifiables dans Admin) et résumé de la dernière veille tendances.
// Chaque source a son interrupteur (Admin › Contexte du directeur), un budget fixe en caractères, et n'est jamais citée
// dans les textes publics : les noms d'artistes du profil sont retirés des titres / descriptions / tags proposés.
// Les deux interrupteurs coupés : prompt identique octet pour octet à v1.14.0.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { STYLES, MOODS } from './engine/styles.js';

export const BUDGET = { taste: 1000, trends: 800, user: 6000 }; // caractères ; ~3,5 caractères par jeton en français
export const estTokens = (s) => Math.ceil(String(s || '').length / 3.5);
const SHIPPED = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'contexte', 'gout.json');
const SET = () => path.join(config.dataDir, 'directeur.json');
const DEF = { taste: false, trends: false, refs: null }; // refs : { style: [artistes] } modifiés à la main (null = profil livré)

export function loadShipped(file = SHIPPED) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
export function settings() { try { return { ...DEF, ...JSON.parse(fs.readFileSync(SET(), 'utf8')) }; } catch { return { ...DEF }; } }
function save(s) { fs.mkdirSync(config.dataDir, { recursive: true }); fs.writeFileSync(SET() + '.tmp', JSON.stringify(s, null, 1)); fs.renameSync(SET() + '.tmp', SET()); }

/** Profil effectif : profil livré + artistes de référence modifiés dans Admin. */
export function profile(s = settings(), shipped = loadShipped()) {
  if (!shipped) return null;
  const styles = {};
  for (const [id, v] of Object.entries(shipped.styles || {})) styles[id] = { ...v, refs: s.refs ? (Array.isArray(s.refs[id]) ? s.refs[id] : []) : v.refs }; // références modifiées : une ligne retirée = aucune référence
  if (s.refs) for (const [id, refs] of Object.entries(s.refs)) if (!styles[id] && STYLES[id]) styles[id] = { refs, sound: '' };
  return { ...shipped, styles };
}

// ---------- texte « style: artiste, artiste » (une ligne par style), éditable dans Admin
const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f\u007f"<>{}`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
export function formatRefs(p) { return Object.entries(p?.styles || {}).filter(([, v]) => v.refs?.length).map(([id, v]) => `${id}: ${v.refs.join(', ')}`).join('\n'); }
export function parseRefs(txt) {
  const out = {}, bad = [];
  for (const raw of String(txt || '').split(/\r?\n/).slice(0, 40)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([a-z]+)\s*:\s*(.*)$/i);
    if (!m || !STYLES[m[1].toLowerCase()]) { bad.push(line.slice(0, 40)); continue; }
    out[m[1].toLowerCase()] = [...new Set(m[2].split(/[,;]/).map(cleanName).filter((x) => x.length >= 2))].slice(0, 8);
  }
  if (bad.length) throw Object.assign(new Error(`Ligne(s) non reconnue(s) : ${bad.slice(0, 3).map((b) => `« ${b} »`).join(', ')} (format : « lofi: Chinese Man, Scratch Bandits Crew », style parmi ${Object.keys(STYLES).join(', ')})`), { status: 400 });
  return out;
}
export function update(b = {}) {
  const s = settings();
  if (b.taste !== undefined) s.taste = !!b.taste;
  if (b.trends !== undefined) s.trends = !!b.trends;
  if (b.refsText !== undefined) s.refs = b.refsText === null ? null : parseRefs(b.refsText); // une ligne retirée = style sans référence
  if (b.reset) s.refs = null;
  save(s); return s;
}

/** Tous les noms à ne jamais laisser passer dans un texte public (profil livré + modifications). */
export function forbiddenNames(p = profile()) {
  if (!p) return [];
  const n = new Set([...(p.topArtists || []).map((a) => a.name), ...(p.favourites || []).map((a) => a.name), ...Object.values(p.styles || {}).flatMap((v) => v.refs || [])]);
  return [...n].filter((x) => x && x.length >= 2);
}

const clamp = (s, max) => (s.length <= max ? s : s.slice(0, max - 1).replace(/[^\n]*$/, '').replace(/\n$/, '') + '\n…');
/** Bloc « goût » pour un style (borné à BUDGET.taste caractères). Décrit le son ; aucune liste de titres. */
export function tasteBlock(style, p = profile(), max = BUDGET.taste) {
  if (!p) return '';
  const st = style && p.styles?.[style];
  const lines = [`Son global : ${p.sound}.`,
    `Genres les plus écoutés : ${(p.topGenres || []).slice(0, 6).map((g) => `${g.name} ${String(g.share).replace('.', ',')} %`).join(', ')}.`,
    `Artistes les plus écoutés : ${(p.topArtists || []).slice(0, 10).map((a) => a.name).join(', ')}.`];
  if (st) { if (st.refs?.length) lines.push(`Références pour ${STYLES[style]?.label || style} : ${st.refs.join(', ')}.`); if (st.sound) lines.push(`Son recherché pour ce style : ${st.sound}.`); }
  else lines.push(`Favoris : ${(p.favourites || []).slice(0, 12).map((a) => a.name).join(', ')}.`);
  return clamp(lines.join('\n'), max);
}

// ---------- résumé borné de la dernière veille
const MOOD_WORDS = Object.fromEntries(Object.entries(MOODS).map(([k, m]) => [k, String(m.label || k).toLowerCase()]));
const band = (e) => (e < 40 ? 'basse' : e <= 65 ? 'moyenne' : 'haute');
const fmtMin = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1).replace('.', ',')} h` : `${Math.round(s / 60)} min`);
const safe = (s, forbid) => scrubNames(String(s || '').replace(/[\u0000-\u001f\u007f"`<>{}]/g, ' ').replace(/\s+/g, ' ').trim(), forbid);
function styleTrend(id, R, forbid) {
  const d = R?.digest; if (!d || !d.count) return null;
  const moods = new Map(), en = [];
  for (const s of R.suggestions || []) { if (s.mood && MOODS[s.mood]) moods.set(s.mood, (moods.get(s.mood) || 0) + 2); if (Number.isFinite(s.adv?.energy)) en.push(s.adv.energy); }
  for (const w of d.topWords || []) for (const [k, l] of Object.entries(MOOD_WORDS)) if (w.length >= 4 && (l.startsWith(w) || w.startsWith(k.slice(0, 5)))) moods.set(k, (moods.get(k) || 0) + 1);
  const parts0 = new Set(forbid.flatMap((n) => fold(n).toLowerCase().split(/[^a-z0-9]+/)).filter((x) => x.length >= 4 && !COMMON.has(x))); // « daft », « punk »…
  const words = (d.topWords || []).map((w) => safe(w, forbid)).filter((w) => w.length >= 3 && !parts0.has(fold(w).toLowerCase())).slice(0, 8);
  const parts = [`${STYLES[id]?.label || id} (${d.count} vidéos)`];
  if (d.medianDuration) parts.push(`format : durée médiane ${fmtMin(d.medianDuration)}${d.longShare != null ? `, ${d.longShare} % de mix ≥ 1 h` : ''}`);
  if (moods.size) parts.push(`ambiances : ${[...moods].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k).join(', ')}`);
  if (d.bpmMedian) parts.push(`tempo cité médian : ~${d.bpmMedian} BPM`);
  if (en.length) parts.push(`énergie proposée : ${[...new Set(en.map(band))].join(' / ')} (${Math.min(...en)}-${Math.max(...en)})`);
  if (words.length) parts.push(`mots fréquents : ${words.join(', ')}`);
  return parts.join(' ; ');
}
/** Résumé de la veille (borné) ou null sans rapport. Le style demandé d'abord, puis les autres tant que le budget le permet. */
export function trendsSummary(report, style, max = BUDGET.trends, forbid = forbiddenNames()) {
  if (!report || !report.at || !report.styles || !Object.keys(report.styles).length) return null;
  const ids = Object.keys(report.styles).sort((a, b) => (b === style) - (a === style));
  const lines = []; let len = 0;
  for (const id of ids) { const l = styleTrend(id, report.styles[id], forbid); if (!l) continue; const t = '- ' + l; if (len + t.length + 1 > max - 60) { if (!lines.length) lines.push(t.slice(0, max - 62) + '…'); break; } lines.push(t); len += t.length + 1; if (style && lines.length >= 3) break; }
  if (!lines.length) return null;
  return { date: report.at.slice(0, 10), text: clamp(`Rapport du ${report.at.slice(0, 10)} (${safe(report.sourceLabel || report.source || '', forbid) || 'source publique'}) :\n${lines.join('\n')}`, max) };
}

/** Contexte prêt pour buildPrompt (chaînes vides = source coupée ou absente). */
export function context(style, { s = settings(), report = null, p } = {}) {
  const prof = p !== undefined ? p : profile(s);
  const taste = s.taste && prof ? tasteBlock(style, prof) : '';
  const tr = s.trends ? trendsSummary(report, style, BUDGET.trends, forbiddenNames(prof)) : null;
  return { taste, trends: tr?.text || '', trendsDate: tr?.date || null, forbid: forbiddenNames(prof) };
}

// ---------- noms retirés des textes publics
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const CUE = "(?:à la|a la|façon|facon|style|comme|like|inspired by|inspiré(?:e|s)? (?:par|de)|dans l'esprit d(?:e|')|in the style of|hommage à|tribute to|feat\\.?|ft\\.?|vs\\.?)";
const COMMON = new Set(['air', 'justice', 'jungle', 'queen', 'placebo', 'sting', 'id', 'moderat', 'chic', 'yes', 'genesis', 'muse', 'cream', 'kiss', 'europe', 'boston', 'texas', 'america']);
export function scrubNames(text, names = [], { strict = false } = {}) {
  let t = String(text || ''); if (!t || !names.length) return t;
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    const v = [n, fold(n), n.replace(/^the\s+/i, '')].filter((x, i, a) => x.length >= 2 && a.indexOf(x) === i);
    // noms qui sont aussi des mots courants (Air, Justice…) : retirés seulement après « façon », « à la », « like »… ou en mot-clé exact
    const common = COMMON.has(fold(n).toLowerCase());
    for (const x of v) t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:${CUE}\\s+)${common ? '' : '?'}${esc(x).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu'), '');
    if (common && t.trim().toLowerCase() === n.toLowerCase()) t = '';
    if (common) t = t.replace(new RegExp(`${strict ? '(?<![\\p{L}\\p{N}])' : '(?<=[\\p{L}\\p{N},;&]\\s+)'}${esc(n)}(?![\\p{L}\\p{N}])`, 'gu'), ''); // « … et Justice » (majuscule au milieu d'une phrase)
  }
  for (let k = 0; k < 3; k++) t = t.replace(/(?<![\p{L}])(?:et|and|&|ou|or|ni)\s*(?=[,.;:!?)—–-]|$)/giu, '').replace(/(^|[(,;—–]\s*)(?:et|and|&)\s+(?=[,.;:)—–-]|$)/giu, '$1').replace(/(^|[(—–]\s*)(?:and|et|&)\s+/giu, '$1');
  return t.replace(/\(\s*[,;&]?\s*\)/g, '').replace(/\s+([,.;:!?])/g, '$1').replace(/([,;&])\s*(?=[,;.&])/g, '').replace(/[ \t]{2,}/g, ' ').replace(/^[\s,;:&—–-]+|[\s,;&—–-]+$/g, '').trim();
}

// ---------- diff ligne à ligne (aperçu Admin)
export function lineDiff(a, b) {
  const A = a.split('\n'), B = b.split('\n'), n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n || j < m) { if (i < n && j < m && A[i] === B[j]) { out.push({ op: '=', t: A[i] }); i++; j++; } else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { out.push({ op: '+', t: B[j++] }); } else out.push({ op: '-', t: A[i++] }); }
  return out;
}
