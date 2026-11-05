// Balises des fichiers audio (ID3 / WAV INFO) construites à partir d'un morceau de la bibliothèque.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { STYLES } from './engine/styles.js';
import { SCALES, NOTE_NAMES_FR } from './engine/theory.js';
import { retagWav, retagMp3 } from './engine/tags.js';

export const VERSION = JSON.parse(fs.readFileSync(path.join(config.root, 'package.json'), 'utf8')).version;
const MINORISH = new Set(['minor', 'dorian', 'phrygian', 'harmonic_minor', 'locrian', 'minor_pentatonic', 'blues']);
const parisDate = (iso) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso || Date.now()));

/** Balises communes (ID3 & WAV). Les valeurs musicales viennent des paramètres résolus (P). */
export function trackTags(t, P = t.params || {}) {
  const S = STYLES[t.style] || {}, label = S.label || t.style;
  const date = parisDate(t.created_at), year = date.slice(0, 4);
  const keyFr = P.key != null ? `${NOTE_NAMES_FR[['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(P.key)] ?? P.key} ${(SCALES[P.scale]?.label || P.scale || '').toLowerCase()}`.trim() : '';
  const artist = config.artist;
  return {
    title: t.title, artist, album_artist: artist, album: `${artist} — ${label}`, genre: label, date,
    bpm: P.bpm ? Math.round(P.bpm) : '', key: P.key ? P.key + (MINORISH.has(P.scale) ? 'm' : '') : '',
    comment: `Musique instrumentale originale générée par algorithme (soundtube ${VERSION}) — ${label}${P.bpm ? `, ${Math.round(P.bpm)} BPM` : ''}${keyFr ? `, ${keyFr}` : ''}${P.seed != null ? `, graine ${P.seed}${P.variation ? '/' + P.variation : ''}` : ''}. Sans paroles ; synthèse et échantillons CC0.`,
    copyright: `℗ ${year} ${artist} — composition originale`,
    software: `soundtube ${VERSION}`,
    keywords: ['instrumental', label, S.genre, 'musique algorithmique'].filter(Boolean).join('; '),
  };
}

/** Réécrit les balises des fichiers d'un morceau terminé (après renommage). Erreurs journalisées, jamais bloquantes. */
export async function retagTrack(tracksDir, t) {
  const tags = trackTags(t), dir = path.join(tracksDir, t.id);
  try { if (t.files?.wav) retagWav(path.join(dir, t.files.wav), tags); } catch (e) { console.error('[balises wav]', t.id, e.message); }
  try { if (t.files?.mp3) await retagMp3(path.join(dir, t.files.mp3), tags, config.ffmpegPath); } catch (e) { console.error('[balises mp3]', t.id, e.message); }
}
