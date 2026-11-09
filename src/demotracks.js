// v1.21.4 — morceaux de la démo publique : choisis par l'admin (Admin › Morceaux de la démo), au plus 10, chacun < 5 min.
// Visiteur non connecté : la page Styles (et l'accueil) ne montrent que ces morceaux, en écoute seule (aucun téléchargement,
// publication YouTube ni action de bibliothèque). Stocké dans le dossier de données (/var/lib/soundtube/demo-tracks.json).
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export const DEMO_TRACKS_MAX = 10;
export const DEMO_TRACK_MAX_SEC = 300; // strictement moins de 5 min
const file = () => path.join(config.dataDir, 'demo-tracks.json');

export function readIds() {
  try { const j = JSON.parse(fs.readFileSync(file(), 'utf8')); return Array.isArray(j.ids) ? j.ids.filter((x) => typeof x === 'string').slice(0, DEMO_TRACKS_MAX) : []; } catch { return []; }
}
/** Morceau éligible : terminé, avec un audio écoutable, durée connue < 5 min. */
export function eligible(t) {
  return !!t && t.status === 'done' && Number.isFinite(+t.duration) && +t.duration > 0 && +t.duration < DEMO_TRACK_MAX_SEC && !!(t.files?.mp3 || t.files?.wav);
}
/** Ids retenus encore valides (un morceau supprimé ou devenu inéligible disparaît de la démo). */
export function selected(getTrack) { return readIds().filter((id) => eligible(getTrack(id))); }
export function isSelected(id, getTrack) { return !!id && readIds().includes(id) && eligible(getTrack(id)); }

/** Enregistre la sélection ; refuse > 10, doublons, inconnus, ≥ 5 min. */
export function save(ids, getTrack) {
  if (!Array.isArray(ids)) { const e = new Error('demoTracksInvalid'); e.status = 400; throw e; }
  const uniq = [...new Set(ids.map((x) => String(x)))];
  if (uniq.length > DEMO_TRACKS_MAX) { const e = new Error('demoTracksMax'); e.status = 400; throw e; }
  for (const id of uniq) if (!eligible(getTrack(id))) { const e = new Error('demoTracksIneligible'); e.status = 400; e.id = id; throw e; }
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ ids: uniq, updatedAt: new Date().toISOString() }, null, 2)); fs.renameSync(tmp, file());
  return uniq;
}
