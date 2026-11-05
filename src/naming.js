// Noms de fichiers lisibles : <titre-slug>_<style>_<AAAA-MM-JJ_HHhMM>.<ext> (heure de Paris par défaut, ASCII uniquement).
import fs from 'node:fs';
import path from 'node:path';

const TZ = process.env.SOUNDTUBE_TZ || process.env.TZ || 'Europe/Paris';
const LIG = { 'œ': 'oe', 'Œ': 'OE', 'æ': 'ae', 'Æ': 'AE', 'ß': 'ss', 'ø': 'o', 'Ø': 'O', 'đ': 'd', 'ł': 'l', 'Ł': 'L', '&': ' et ' };

/** « Prisme boréal — n°2 ! » → « prisme-boreal-n-2 » */
export function slugify(s, max = 60) {
  const out = String(s || '').replace(/[œŒæÆßøØđłŁ&]/g, (c) => LIG[c]).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (out.slice(0, max).replace(/-+$/, '')) || 'morceau';
}

/** Date ISO → « 2026-10-28_21h55 » dans le fuseau configuré. */
export function stamp(iso) {
  const d = new Date(iso || Date.now()); const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(isNaN(d) ? new Date() : d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}_${p.hour}h${p.minute}`;
}

export const baseName = (t) => `${slugify(t.title)}_${slugify(t.style, 20)}_${stamp(t.created_at)}`;
const SUFFIX = { wav: '.wav', mp3: '.mp3', mid: '.mid', midzip: '-midi.zip', mp4: '.mp4', thumb: '.jpg' };
export const KINDS = Object.keys(SUFFIX);
export const fileNames = (t) => Object.fromEntries(KINDS.map((k) => [k, baseName(t) + SUFFIX[k]]));

// anciens noms (avant la v1.2)
const LEGACY = { wav: 'track.wav', mp3: 'track.mp3', mid: 'track.mid', midzip: 'midi.zip' };

/**
 * Renomme les fichiers d'un morceau selon son titre actuel. Retourne le nouvel objet `files` (ou null si rien à faire).
 * Les fichiers absents sont ignorés ; un fichier hérité (track.wav…) est repris s'il n'est pas référencé.
 */
export function syncFiles(tracksDir, t) {
  const dir = path.join(tracksDir, t.id); if (!fs.existsSync(dir)) return null;
  const want = fileNames(t); const cur = { ...(t.files || {}) }; const next = {}; let changed = false;
  for (const k of KINDS) {
    let from = cur[k];
    if ((!from || !fs.existsSync(path.join(dir, from))) && LEGACY[k] && fs.existsSync(path.join(dir, LEGACY[k]))) from = LEGACY[k];
    if (!from || !fs.existsSync(path.join(dir, from))) { if (cur[k]) changed = true; continue; }
    if (from !== want[k]) { fs.renameSync(path.join(dir, from), path.join(dir, want[k])); changed = true; }
    next[k] = want[k];
  }
  return changed || JSON.stringify(next) !== JSON.stringify(cur) ? next : null;
}
