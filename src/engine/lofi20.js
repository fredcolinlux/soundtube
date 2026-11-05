// v1.11.0 — moteur 20 : lo-fi refait (sous-genres, textures, arrangement vivant, scratchs).
// Utilisé seulement par les nouveaux morceaux lo-fi (engine ≥ 20) : les morceaux plus anciens restent identiques.
import { makeRng, hashSeed } from './rng.js';
import { degreeToMidi } from './theory.js';

export const LOFI_SUBS = ['jazzy', 'chillhop', 'lofihouse', 'ambient', 'sad', 'beatmaker'];
export const isLofi20 = (P) => !!P && P.style === 'lofi' && P.engine >= 20 && !!P.lofiStyle;

/** Sous-genre tiré par la graine (lo-fi house exclue des mix longs : son tempo ne s'enchaîne pas avec les autres). */
export function pickLofiStyle(seed, long = false) {
  const r = makeRng(hashSeed(seed, 'lofiSub'));
  const subs = ['jazzy', 'chillhop', 'sad', 'beatmaker', 'ambient', 'lofihouse'], w = [3, 3, 2, 2, 1.5, long ? 0 : 1.5];
  return r.weighted(subs, w);
}

// ---------- textures (0-100) par sous-genre ; « Lo-fi / vintage » agit comme un macro (50 = valeurs du style)
export const TEX_KEYS = { crackle: 'crackle', wow: 'wow', tapeSat: 'sat', dust: 'dust', warmth: 'warmth' };
export const LOFI_TEX = {
  jazzy:     { crackle: 45, wow: 30, tapeSat: 35, dust: 20, warmth: 55 },
  chillhop:  { crackle: 35, wow: 25, tapeSat: 30, dust: 15, warmth: 40 },
  lofihouse: { crackle: 25, wow: 15, tapeSat: 40, dust: 30, warmth: 50 },
  ambient:   { crackle: 30, wow: 45, tapeSat: 20, dust: 10, warmth: 60 },
  sad:       { crackle: 50, wow: 40, tapeSat: 30, dust: 20, warmth: 60 },
  beatmaker: { crackle: 55, wow: 20, tapeSat: 55, dust: 45, warmth: 45 },
};
/** Valeurs de texture (0-100, entiers) : réglage avancé s'il est fixé, sinon défaut du sous-genre ±10 (graine) × macro vintage. */
export function lofiTexture(P, ADV = {}) {
  const d = LOFI_TEX[P.lofiStyle] || LOFI_TEX.chillhop, r = makeRng(hashSeed(P.seed, 'lofiTexDef'));
  const macro = ADV.vintage != null ? ADV.vintage / 50 : 1, out = {};
  for (const k of Object.keys(TEX_KEYS)) {
    const j = Math.round((r() * 2 - 1) * 10);
    out[k] = ADV[k] != null ? Math.round(ADV[k]) : Math.max(0, Math.min(100, Math.round((d[k] + j) * macro)));
  }
  if (P.instruments && P.instruments.texture === false && ADV.crackle == null) out.crackle = 0; // « Textures » coupé : pas de craquements
  return out;
}

// ---------- recettes (instruments, jeux, kits) par sous-genre
export const POOLS20 = {
  lofi_jazzy:     { chords: ['rhodes', 'rhodes', 'rhodes', 'epiano', 'dx7epiano', 'piano'], bass: ['uprightbass', 'uprightbass', 'softbass'], lead: ['vibes', 'vibes', 'flute', 'rhodes', 'mellow', 'guitar'], arp: ['guitar', 'vibes', 'harp', 'rhodes'],
    bassStyle: ['walking', 'walking', 'walking', 'default'], chordStyle: ['strum', 'strum', 'sustain'], chordBars: [1, 1, 2], drumFam: 'lofijazz', swing: [0.26, 0.33], kits: ['hhlofi', 'hhlofi', 'lofi', 'boombap'] },
  lofi_chillhop:  { chords: ['guitar', 'rhodes', 'piano', 'guitar', 'epiano'], bass: ['uprightbass', 'softbass', 'subbass', 'housebass'], lead: ['guitar', 'flute', 'vibes', 'mellow', 'bell'], arp: ['mutedguitar', 'guitar', 'harp', 'pluck'],
    bassStyle: ['boom', 'walking', 'offbeat', 'boom'], chordStyle: ['strum', 'chop', 'strum'], chordBars: [1, 1, 2], drumFam: 'hhboombap', swing: [0.14, 0.22], kits: ['boombap', 'hhlofi', 'boombap', 'lofi'] },
  lofi_lofihouse: { chords: ['rhodes', 'junopoly', 'piano', 'epiano', 'stab'], bass: ['housebass', 'moogbass', 'softbass', 'dx7bass'], lead: ['pluck', 'vibes', 'rhodes', 'bell', 'dx7bell'], arp: ['pluck', 'mutedguitar', 'dx7bell'],
    bassStyle: ['offbeat', 'offbeat', 'octave'], chordStyle: ['stabs', 'sustain', 'chop'], chordBars: [1, 2], drumFam: 'four', swing: [0.08, 0.18], kits: ['house', 'tr909', 'tr707', 'dr110'] },
  lofi_ambient:   { chords: ['warmpad', 'junopad', 'ensemble', 'junopoly', 'rhodes'], bass: ['subdrone', 'softbass', 'subdrone'], lead: ['vibes', 'flute', 'bell', 'harp', 'rhodes', 'dx7bell'], arp: ['harp', 'vibes', 'bell', 'pluck'],
    bassStyle: ['drone', 'default', 'drone'], chordStyle: ['sustain', 'sustain', 'strum'], chordBars: [2, 2, 4], drumFam: 'lofisparse', swing: [0.1, 0.2], kits: ['lofi', 'hhlofi', 'soft'] },
  lofi_sad:       { chords: ['piano', 'piano', 'rhodes', 'warmpad', 'ensemble'], bass: ['softbass', 'uprightbass', 'cellobass'], lead: ['piano', 'vibes', 'flute', 'mellow', 'guitar'], arp: ['harp', 'guitar', 'piano', 'vibes'],
    bassStyle: ['default', 'walking', 'drone'], chordStyle: ['strum', 'sustain', 'strum'], chordBars: [1, 2, 2], drumFam: 'hhlofi', swing: [0.12, 0.24], kits: ['hhlofi', 'lofi', 'hhlofi'] },
  lofi_beatmaker: { chords: ['piano', 'rhodes', 'strings', 'ensemble', 'guitar', 'vibes'], bass: ['subbass', 'uprightbass', 'moogbass', 'subbass'], lead: ['hornsect', 'hornsect', 'flute', 'frenchhorn', 'vibes', 'strings'], arp: ['pizz', 'harp', 'guitar', 'vibes'],
    bassStyle: ['boom', 'boom', 'walking'], chordStyle: ['chop', 'chop', 'chop', 'strum'], chordBars: [1, 1, 2], drumFam: 'hhboombap', swing: [0.27, 0.33], kits: ['boombap', 'boombap', 'hhlofi'] },
};
export const IDIOMS20 = {
  lofi_jazzy:     { dropout: 'break', layBack: 0.03, fixedArp: true, barVar: true },
  lofi_chillhop:  { dropout: 'beat', layBack: 0.02, fixedArp: true, barVar: true, introHook: true },
  lofi_lofihouse: { introGroove: true, layers: [['kick', 'hat'], ['kick', 'hat', 'ohat', 'shaker', 'rim']], dropout: 'beat', chordSweep: true, filterSweep: true, fixedArp: true },
  lofi_ambient:   { breathe: true, fixedArp: true },
  lofi_sad:       { dropout: 'break', layBack: 0.035, fixedArp: true },
  lofi_beatmaker: { form: 'beat', dropout: 'beat', layBack: 0.015, fixedArp: true, introHook: true, barVar: true },
};

/** Voicing jazz (Rhodes) : quinte parfois omise, 9e / 11e / 13e ajoutées selon la couleur de l'accord (tirage stable par mesure). */
export function jazzVoice(chord, steps, root, deg, rnd) {
  const out = chord.slice();
  const third = out[1] - out[0];
  if (out.length >= 5 && rnd() < 0.55) out.splice(2, 1); // sans quinte : 1-3-7-9
  const c = rnd();
  if (third === 3 && c < 0.35) out.push(degreeToMidi(steps, root, deg + 10)); // m11
  else if (third === 4 && c < 0.3) out.push(degreeToMidi(steps, root, deg + 12)); // 13
  return out;
}

// ---------- arrangement vivant : scènes d'orchestration par phrase, coupures, breaks, fills variés, stabs, scratchs
const SCENES = {
  full: {}, nolead: { mute: ['lead', 'lead2'] }, noarp: { mute: ['arp'] },
  nokick: { kinds: ['kick', 'boom'], lpf: [0.5, 0.78], thin: true },
  hats: { kinds: ['kick', 'boom', 'snare', 'clap', 'rim', 'tomh', 'tomm', 'toml', 'tom'], lpf: [0.6, 0.85], thin: true },
  nodrums: { drums: true, lpf: [0.36, 0.62] },
  strip: { mute: ['lead', 'lead2', 'arp'], kinds: ['hat', 'ohat', 'shaker', 'ride'] },
  bare: { mute: ['chords'] },
  nobass: { mute: ['bass'], lpf: [0.55, 0.82] },
};
const SCENE_W = {
  jazzy:     { full: 3, nolead: 2, nokick: 1, hats: 1, nodrums: 0.7, strip: 1, bare: 0.4, nobass: 0.5 },
  chillhop:  { full: 3, nolead: 2, nokick: 1.2, hats: 1, nodrums: 0.8, strip: 1, bare: 0.6, nobass: 0.5 },
  lofihouse: { full: 2, nolead: 2, nokick: 2, hats: 1.5, nodrums: 0.5, strip: 1, bare: 0.5, nobass: 1 },
  ambient:   { full: 1, nolead: 1.2, nokick: 0.8, hats: 1.5, nodrums: 3, strip: 0.5, bare: 0.3, nobass: 0.6 },
  sad:       { full: 3, nolead: 1.5, nokick: 1, hats: 1, nodrums: 1, strip: 1, bare: 0.4, nobass: 0.5 },
  beatmaker: { full: 3, nolead: 2, nokick: 1, hats: 1, nodrums: 1, strip: 1.5, bare: 1, nobass: 0.4 },
};
const FILLS = {
  jazzy:     { snareroll: 2, kickdouble: 1, stop: 1, toms: 1.5, openhat: 1 },
  chillhop:  { snareroll: 2, kickdouble: 1.5, stop: 1.5, toms: 1, openhat: 1.5 },
  lofihouse: { snareroll: 2.5, kickdouble: 0.5, stop: 1.5, toms: 1, openhat: 2 },
  ambient:   { snareroll: 0.5, kickdouble: 0.5, stop: 1, toms: 0.5, openhat: 1 },
  sad:       { snareroll: 1.5, kickdouble: 1, stop: 1.5, toms: 1, openhat: 1 },
  beatmaker: { snareroll: 1, kickdouble: 1.5, stop: 1.5, toms: 0.5, openhat: 0.5, scratch: 4 },
};
const SCR_KINDS = ['baby', 'chirp', 'transformer', 'scribble', 'tear'];
const SCR_W = [3, 3, 2, 1, 1.5];

/**
 * Post-traitement d'un mouvement (temps locaux du chapitre, avant automatisations) ; modifie `ev` sur place.
 * @returns {Array} événements « fx » (passe-bas) à ajouter après les automatisations.
 */
export function lofiArrange(X) {
  const { P, ci, sections, BPB, totalBars, ev, barChord, steps, keyPc, MX } = X;
  const sub = P.lofiStyle, r = makeRng(hashSeed(P.seed, 'lofi20', P.variation, sub, ci));
  const fx = [], cuts = [], W = SCENE_W[sub] || SCENE_W.chillhop;
  const end = totalBars * BPB + BPB;
  const isBM = sub === 'beatmaker';
  const scrSrc = isBM ? r.pick(['aah', 'aah', 'horn', 'orch']) : null;
  const root = 60 + keyPc;
  const scr = (t, d, kind, v = 0.62) => ev.push({ inst: 'scr', kind: kind || r.weighted(SCR_KINDS, SCR_W), t, d, v: v * (0.85 + 0.3 * r()), src: scrSrc === 'aah' || r() < 0.3 ? 'aah' : scrSrc, m: root });
  // ambient lo-fi : parfois sans aucune batterie
  const beatless = sub === 'ambient' && makeRng(hashSeed(P.seed, 'lofiBeatless', P.variation))() < 0.4;
  if (beatless) cuts.push([0, end, (e) => e.inst === 'drums']);
  const scenes = []; // [a, z, nom]
  let prev = 'full', firstA = true;
  for (const s of sections) {
    const typ = s.role || s.type;
    // intro : le plus souvent accords + texture seuls, la mélodie arrive avec le premier couplet
    if (typ === 'intro') { if (r() < (IDIOMS20['lofi_' + sub]?.introHook ? 0.4 : 0.75)) cuts.push([s.startBar * BPB, (s.startBar + s.bars) * BPB, (e) => e.inst === 'lead' || e.inst === 'lead2' || e.inst === 'arp']); continue; }
    if (typ === 'outro') continue;
    let b = 0;
    while (b < s.bars) {
      const rem = s.bars - b, len = rem <= 8 ? rem : rem - 8 >= 4 ? 8 : 4;
      const t0 = (s.startBar + b) * BPB, t1 = t0 + len * BPB;
      let sc;
      if (s.type === 'B') sc = r.weighted(['full', 'noarp', 'nolead', 'strip'], [5, 1, 1, 0.6]);
      else if (s.type === 'bridge') sc = r.weighted(['nodrums', 'hats', 'nokick', 'nobass', 'bare'], [3, 2, 2, 1, 0.5]);
      else { const ks = Object.keys(W).filter((k) => k === 'full' || k !== prev); sc = r.weighted(ks, ks.map((k) => W[k])); }
      let a = t0, z = t1;
      if (len >= 8 && ['nodrums', 'hats', 'nobass', 'bare', 'nokick'].includes(sc)) { const u = r(); if (u < 0.4) z = t0 + 4 * BPB; else if (u < 0.8) a = t0 + 4 * BPB; }
      const D = SCENES[sc];
      if (D.mute) cuts.push([a, z, (e) => D.mute.includes(e.inst)]);
      if (D.kinds) cuts.push([a, z, (e) => e.inst === 'drums' && D.kinds.includes(e.kind)]);
      if (D.drums) cuts.push([a, z, (e) => e.inst === 'drums']);
      if (D.thin) cuts.push([a, z, (e) => e.inst === 'bass' && (e.t % BPB) > 0.05]);
      if (D.lpf) fx.push({ inst: 'fx', kind: 'lpf', t: a, d: z - a, a: +(D.lpf[0] + 0.08 * r()).toFixed(3), b: +(D.lpf[1] + 0.1 * r()).toFixed(3), v: 1 });
      scenes.push([a, z, sc]);
      // entrées échelonnées : au premier couplet du mouvement, la mélodie (et l'arpège) arrivent plus tard
      if (s.type === 'A' && firstA && b === 0) {
        firstA = false;
        if (r() < 0.6) cuts.push([t0, t0 + Math.min(len, 4) * BPB, (e) => e.inst === 'lead' || e.inst === 'lead2']);
        if (r() < 0.5) cuts.push([t0, t1, (e) => e.inst === 'arp']);
      }
      prev = sc; b += len;
    }
  }
  // coupures appliquées avant d'ajouter fills / stabs / scratchs
  if (cuts.length) for (let i = ev.length - 1; i >= 0; i--) { const e = ev[i]; if (cuts.some(([a, z, f]) => e.t >= a - 0.01 && e.t < z - 0.01 && f(e))) ev.splice(i, 1); }
  // ----- fills : à chaque fin de phrase (et parfois à mi-phrase), des fills variés qui remplacent la fin de mesure
  const drumsIn = (a, z) => ev.some((e) => e.inst === 'drums' && e.t >= a && e.t < z);
  const clear = (a, z, f) => { for (let i = ev.length - 1; i >= 0; i--) { const e = ev[i]; if (e.t >= a - 0.01 && e.t < z - 0.01 && f(e)) ev.splice(i, 1); } };
  const FW = FILLS[sub] || FILLS.chillhop, fk = Object.keys(FW);
  const ends = new Set();
  for (const [, z] of scenes) ends.add(z);
  for (const s of sections) if (s.type !== 'intro') for (let b = 4; b <= s.bars; b += 4) ends.add((s.startBar + b) * BPB);
  for (const z of [...ends].sort((a, b) => a - b)) {
    const major = scenes.some(([, zz]) => Math.abs(zz - z) < 0.01);
    if (z <= BPB || z > totalBars * BPB || !drumsIn(z - BPB, z) || r() > (major ? 0.8 : 0.3)) continue;
    const kind = major ? r.weighted(fk, fk.map((k) => FW[k])) : r.pick(['kickdouble', 'openhat', 'snareroll']);
    const v = 0.55 + 0.25 * r();
    if (kind === 'snareroll') {
      const n = r.pick([3, 4, 6]), st = z - (n <= 4 ? 1 : 1.5);
      clear(st, z, (e) => e.inst === 'drums' && e.kind !== 'kick');
      for (let k = 0; k < n; k++) ev.push({ inst: 'drums', kind: 'snare', t: st + k * (z - st) / n, v: v * (0.45 + 0.55 * k / n), g: k < n - 1 ? 1 : undefined });
    } else if (kind === 'kickdouble') {
      ev.push({ inst: 'drums', kind: 'kick', t: z - 0.5, v: v * 0.8 }, { inst: 'drums', kind: 'kick', t: z - 0.25, v: v * 0.9 });
    } else if (kind === 'stop') {
      const len = r.pick([1, 1, 2]);
      clear(z - len, z, (e) => e.inst === 'drums' || e.inst === 'bass');
      if (z + 0.01 < totalBars * BPB && r() < 0.5) ev.push({ inst: 'drums', kind: 'crash', t: z, v: 0.5 });
    } else if (kind === 'toms') {
      clear(z - 1, z, (e) => e.inst === 'drums' && e.kind !== 'kick');
      const seq = r.pick([['tomh', 'tomm', 'toml'], ['tomh', 'tomh', 'tomm', 'toml'], ['snare', 'tomm', 'toml']]);
      seq.forEach((k, j) => ev.push({ inst: 'drums', kind: k, t: z - 1 + j / seq.length, v: v * (0.7 + 0.1 * j) }));
    } else if (kind === 'openhat') {
      clear(z - 0.5, z, (e) => e.inst === 'drums' && (e.kind === 'hat' || e.kind === 'ohat'));
      ev.push({ inst: 'drums', kind: 'ohat', t: z - 0.5, v: v * 0.8 });
    } else if (kind === 'scratch') {
      const len = r.pick([1, 2, 2, 4]);
      clear(z - len, z, (e) => e.inst === 'drums' && (e.kind === 'hat' || e.kind === 'ohat') || e.inst === 'lead');
      if (len >= 2) { scr(z - len, len / 2); scr(z - len / 2, len / 2); } else scr(z - len, len);
    }
  }
  // ----- beatmaker : cuivres en stabs, coups d'orchestre à l'entrée des refrains et après les breaks, scratchs « réponse »
  if (isBM) {
    const triad = (bar, oct) => { const d = barChord[Math.min(totalBars - 1, Math.max(0, bar))] || 0; return [d, d + 2, d + 4].map((x) => degreeToMidi(steps, 12 * oct + keyPc, x)); };
    const STABS = [[[0, 0.4], [1.75, 0.25], [2.5, 0.4]], [[0, 0.75]], [[0.5, 0.25], [1.5, 0.25], [3, 0.5]], [[0, 0.3], [0.75, 0.3], [3.5, 0.4]]];
    for (const s of sections) {
      const typ = s.role || s.type;
      if (typ === 'intro' || typ === 'outro') continue;
      const want = s.type === 'B' ? 0.85 : s.type === 'A' ? 0.35 : 0;
      if (r() < want) {
        const pat = r.pick(STABS), every = r.pick([1, 2, 2, 4]);
        for (let b = 0; b < s.bars; b++) {
          if (b % every) continue;
          const bar = s.startBar + b; if (bar >= totalBars) break;
          for (const [o, d] of pat) for (const m of triad(bar, 5)) ev.push({ inst: 'chords', patch: 'hornsect', t: bar * BPB + o, d, m, v: 0.5 + 0.15 * r(), stab: 1 });
        }
      }
      if (s.type === 'B' && r() < 0.6) for (const m of [...triad(s.startBar, 4), triad(s.startBar, 3)[0]]) ev.push({ inst: 'chords', patch: 'orchstab', t: s.startBar * BPB, d: 0.7, m, v: 0.6 });
    }
    for (const [a, z, sc] of scenes) {
      if ((sc === 'nodrums' || sc === 'bare') && z < totalBars * BPB && r() < 0.6) for (const m of triad(Math.round(z / BPB), 4)) ev.push({ inst: 'chords', patch: 'orchstab', t: z, d: 0.6, m, v: 0.55 });
      if ((sc === 'strip' || sc === 'bare' || sc === 'nodrums') && z - a >= 4 * BPB && r() < 0.75) {
        // phrase de scratch (2 mesures) en fin de phrase, motif alterné
        const t0 = z - 2 * BPB, k1 = r.weighted(SCR_KINDS, SCR_W), k2 = r.weighted(SCR_KINDS, SCR_W);
        clear(t0, z, (e) => e.inst === 'lead' || e.inst === 'lead2');
        for (let j = 0; j < 2 * BPB; j += 2) scr(t0 + j, 2, j % 4 ? k2 : k1);
      }
    }
    // intro : un scratch sur la dernière mesure (premier mouvement)
    const intro = sections[0];
    if (ci === 0 && intro && intro.type === 'intro' && intro.bars >= 2 && !MX && r() < 0.7) scr((intro.bars - 1) * BPB, BPB, r.pick(['baby', 'chirp', 'tear']));
  }
  return fx;
}
