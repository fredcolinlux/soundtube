// Gabarits de groove : swing, micro-décalages par famille d'instruments (en millisecondes, donc indépendants du tempo)
// et accents par double-croche. Remplace le « hasard pur » par le placement d'un batteur / d'une MPC :
// la caisse claire traîne en boom-bap, la grosse caisse pousse en lo-fi, les charleys restent serrés en trap, etc.

// classes : k = grosse caisse, s = caisse claire / clap / rim, h = charleys / ride / shaker, p = percussions, b = basse, c = accords / nappes, l = mélodie / arpèges
const T = (o) => ({ swing: null, ms: {}, jit: 3, acc: null, ...o });
const HAT_ACC = [1, 0.62, 0.82, 0.6, 1, 0.64, 0.85, 0.58, 1, 0.62, 0.82, 0.6, 1, 0.66, 0.88, 0.62];
export const GROOVES = {
  straight:  T({ ms: { h: 0, s: 1 }, jit: 2.5 }),
  mpc:       T({ swing: 0.16, ms: { k: 0, s: 7, h: 2, p: 4, b: 3, c: 8, l: 5 }, jit: 3.5, acc: HAT_ACC }),
  dilla:     T({ swing: 0.21, ms: { k: -6, s: 20, h: 9, p: 12, b: 10, c: 18, l: 12 }, jit: 6, acc: [1, 0.55, 0.8, 0.62, 0.95, 0.58, 0.84, 0.64, 1, 0.55, 0.8, 0.6, 0.95, 0.6, 0.86, 0.66] }),
  trap:      T({ swing: 0.02, ms: { k: 0, s: 0, h: -1, p: 0, b: 0, c: 4, l: 2 }, jit: 1.5, acc: [1, 0.7, 0.85, 0.7, 1, 0.7, 0.85, 0.7, 1, 0.7, 0.85, 0.7, 1, 0.7, 0.85, 0.7] }),
  dnb:       T({ swing: 0.03, ms: { k: 0, s: -3, h: 1, p: 2, b: 0, c: 6, l: 3 }, jit: 2, acc: [1, 0.6, 0.9, 0.62, 1, 0.6, 0.92, 0.64, 1, 0.6, 0.9, 0.62, 1, 0.62, 0.94, 0.66] }),
  jungle:    T({ swing: 0.07, ms: { k: 0, s: 3, h: 4, p: 5, b: 0, c: 6, l: 4 }, jit: 4, acc: [1, 0.55, 0.9, 0.6, 1, 0.58, 0.9, 0.62, 1, 0.55, 0.92, 0.6, 1, 0.6, 0.92, 0.65] }),
  house:     T({ ms: { k: 0, s: 2, h: 6, p: 5, b: 2, c: 4, l: 3 }, jit: 2.5, acc: [0.75, 0.55, 1, 0.55, 0.75, 0.55, 1, 0.58, 0.75, 0.55, 1, 0.55, 0.78, 0.58, 1, 0.6] }),
  techno:    T({ ms: { k: 0, s: 1, h: -3, p: -1, b: 1, c: 2, l: 1 }, jit: 1.5, acc: [0.8, 0.6, 1, 0.6, 0.82, 0.62, 1, 0.62, 0.8, 0.6, 1, 0.6, 0.84, 0.64, 1, 0.64] }),
  synthwave: T({ ms: { k: 0, s: 3, h: 1, p: 2, b: 0, c: 5, l: 4 }, jit: 2, acc: HAT_ACC }),
  lofi:      T({ swing: 0.2, ms: { k: -4, s: 16, h: 8, p: 10, b: 8, c: 15, l: 10 }, jit: 5.5, acc: [1, 0.58, 0.8, 0.62, 0.95, 0.6, 0.84, 0.64, 1, 0.58, 0.8, 0.6, 0.95, 0.62, 0.86, 0.66] }),
  cinematic: T({ ms: { k: 0, s: 6, h: 4, p: 9, b: 4, c: 10, l: 8 }, jit: 7 }),
  soft:      T({ ms: { k: 0, s: 8, h: 5, p: 6, b: 6, c: 10, l: 8 }, jit: 5, acc: HAT_ACC }),
};

const PROFILE_GROOVE = {
  hiphop_boombap: 'mpc', hiphop_lofi: 'dilla', hiphop_trap: 'trap', lofi: 'lofi', trap: 'trap',
  dnb_liquid: 'dnb', dnb_neuro: 'dnb', dnb_jungle: 'jungle', house: 'house', techno: 'techno', synthwave: 'synthwave',
  cinematic: 'cinematic', ambient: 'soft', chiptune: 'straight', frenchtouch: 'house',
};
export const grooveFor = (profile, style) => GROOVES[PROFILE_GROOVE[profile] || PROFILE_GROOVE[style] || 'straight'];

const CLS = { kick: 'k', boom: 'k', snare: 's', clap: 's', rim: 's', hat: 'h', ohat: 'h', ride: 'h', shaker: 'h', maracas: 'h', tamb: 'h', crash: 'h' };
export const grooveClass = (e) => (e.inst === 'drums' ? CLS[e.kind] || 'p' : e.inst === 'bass' ? 'b' : e.inst === 'chords' ? 'c' : 'l');

/** Décalage (en temps) d'un événement : micro-timing de la classe + jitter gaussien borné. */
export function grooveShift(G, e, bpm, rd, hum = 1) {
  const cls = grooveClass(e);
  const ms = (G.ms[cls] || 0) + Math.max(-2, Math.min(2, rd.gauss())) * G.jit * hum * (cls === 'k' ? 0.5 : 1);
  return (ms / 1000) * (bpm / 60);
}

/** Accent de vélocité d'une double-croche (charleys / ride surtout, un peu sur la caisse claire). */
export function grooveAccent(G, kind, step) {
  if (!G.acc) return 1;
  const a = G.acc[step % 16];
  if (kind === 'hat' || kind === 'ride' || kind === 'shaker' || kind === 'maracas' || kind === 'tamb') return a;
  if (kind === 'snare' || kind === 'rim') return 0.85 + 0.15 * a;
  return 1;
}

/** Dynamique par mesure : accent de début de phrase (4 mesures), poussée vers la 8e mesure, respiration lente. */
export function barDynamics(barInSection, sectionBars, globalBar) {
  const ph = barInSection % 4;
  let d = ph === 0 ? 1.04 : ph === 3 ? 0.97 : 1;
  const p8 = barInSection % 8;
  if (sectionBars >= 8) d *= 0.96 + 0.06 * (p8 / 7);
  d *= 1 + 0.025 * Math.sin((2 * Math.PI * globalBar) / 32);
  return d;
}
