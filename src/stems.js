// v1.14.0 : stems (« samples ») par groupe d'instruments, rendus par le moteur d'origine du morceau.
// Même partition, même graine, mêmes réglages : le moteur rejoue tout (y compris le sidechain déclenché par la grosse caisse)
// mais n'envoie au master que les sons du groupe choisi (et leurs envois de réverbe / délai). Le gain de mastering du mix
// est appliqué tel quel (pas de normalisation par stem) : les niveaux relatifs sont ceux du mix.
import path from 'node:path';
import { Worker } from 'node:worker_threads';

export const PERC_KINDS = new Set(['cowbell', 'clave', 'congah', 'congam', 'congal', 'maracas', 'shaker']);
export const STEM_GROUPS = [
  { id: 'batterie', label: 'batterie', test: (a) => a.bus === 'drums' && !PERC_KINDS.has(a.kind) },
  { id: 'basse', label: 'basse', test: (a) => a.bus === 'bass' },
  { id: 'accords', label: 'accords', test: (a) => a.bus === 'chords' },
  { id: 'melodie', label: 'mélodie-pads', test: (a) => a.bus === 'lead' || a.bus === 'arp' || a.bus === 'texture' },
  { id: 'percussions', label: 'percussions', test: (a) => (a.bus === 'drums' && PERC_KINDS.has(a.kind)) || a.bus === 'scr' },
];
export const stemFilter = (id) => STEM_GROUPS.find((g) => g.id === id)?.test || null;

/** Rend un stem complet (WAV 16 bits) dans un thread : ne bloque jamais le serveur. */
export function renderStem(params, group, wavPath, { gainDb = 0, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./worker.js', import.meta.url), { workerData: { params, wavPath, stem: group, fixedGain: Math.pow(10, (gainDb || 0) / 20), loudness: false }, resourceLimits: { maxOldGenerationSizeMb: 768 } });
    w.on('message', (m) => { if (m.type === 'progress') onProgress?.(m.progress); else if (m.type === 'done') resolve(m.result); else if (m.type === 'error') reject(new Error(m.error)); });
    w.on('error', reject); w.on('exit', (c) => { if (c !== 0) reject(new Error('stem : worker exit ' + c)); });
  });
}
/** Les 5 stems du morceau entier dans dir/<groupe>.wav ; retourne { groupe: chemin }. Un stem silencieux est retiré (groupe absent du style). */
export async function renderStems(t, dir, { onProgress, cpus = 2 } = {}) {
  const gainDb = t.meta?.loudness?.gainDb ?? 0, out = {}, par = Math.max(1, Math.min(STEM_GROUPS.length, Math.floor(cpus / 2) || 1)), prog = {};
  const q = [...STEM_GROUPS]; const tick = () => onProgress?.(Object.values(prog).reduce((a, b) => a + b, 0) / STEM_GROUPS.length);
  await Promise.all(Array.from({ length: par }, async () => {
    for (let g; (g = q.shift());) {
      const file = path.join(dir, g.id + '.wav');
      const r = await renderStem(t.params, g.id, file, { gainDb, onProgress: (p) => { prog[g.id] = p; tick(); } });
      prog[g.id] = 1; tick();
      out[g.id] = { path: file, peak: r.meta?.peak ?? null };
    }
  }));
  return out;
}
