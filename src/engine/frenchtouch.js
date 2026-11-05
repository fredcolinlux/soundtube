// v1.9.0 — French Touch refaite (moteur 19). Composition dédiée, inspirée des techniques (jamais des mélodies) de la house
// filtrée française fin 90 : Cassius « 1999 », Daft Punk Homework / Discovery, Alan Braxe, Modjo.
//  - batterie 909 : grosse caisse courte accordée, clap (+ caisse claire) sur 2 et 4 avec pièce, charleston ouvert sur les
//    contretemps, doubles-croches fermées shufflées ; fills, coupures (drop-outs), roulements de montée
//  - boucle « samplée » : stabs d'accords 7e/9e découpés (contretemps à la double, anticipations, gate court), boucle de
//    1-2 mesures qui se répète à l'identique ; découpe qui change toutes les 8-16 mesures ; guitare étouffée funk
//  - forme : intro batterie seule → boucle filtrée qui entre → montée → drop → breakdown filtre fermé → drop 2 varié → outro
//  - automatisation du passe-bas 24 dB sur toute la boucle (accords + basse + guitare, parfois la batterie), longues
//    montées de 8-16 mesures ; la pompe (sidechain à la croche) et le phaser sont dans render.js (S.mix.ft19)
import { makeRng, hashSeed } from './rng.js';
import { SCALES, NOTE_NAMES, PENTA_DEGREES, degreeToMidi, chordMidis, voiceLead } from './theory.js';

/** Le moteur French Touch 1.9 s'applique (4/4 uniquement ; autres mesures : moteur 1.8). */
export const isFT19 = (P) => P.style === 'frenchtouch' && P.engine >= 19 && (!P.adv || !P.adv.meter || P.adv.meter === '4/4');

const T_FULL = [['intro', 16], ['loop', 16], ['build', 8], ['drop', 16], ['breakdown', 8], ['build', 4], ['drop2', 16], ['outro', 16]];
const T_MED = [['intro', 8], ['loop', 8], ['build', 4], ['drop', 16], ['breakdown', 8], ['build', 4], ['drop2', 16], ['outro', 8]];
const T_SHORT = [['intro', 4], ['build', 4], ['drop', 8], ['breakdown', 4], ['drop2', 8], ['outro', 4]];
const T_TINY = [['intro', 2], ['build', 2], ['drop', 8], ['outro', 2]];
const EXTRA = [['loop', 16], ['breakdown', 8], ['build', 4], ['drop2', 16]];
const MIN = { intro: 2, loop: 4, build: 2, drop: 4, drop2: 4, breakdown: 2, outro: 2 };
const MAXADD = { drop2: 32, drop: 32, loop: 24, outro: 24, intro: 24, breakdown: 16 };
export const FT_LABELS = { loop: 'Boucle filtrée', drop2: 'Drop 2' };
export const FT_STYLES = { classic: 'Filtrée classique (Cassius, Daft Punk Homework / Discovery)', edbanger: 'Électro Ed Banger (Justice : stabs et basse saturés)', myd: 'House française moderne (Myd : basse rebondissante, hooks découpés)' };
export const FT_BPM = { classic: [120, 126], edbanger: [116, 126], myd: [118, 124] };

/** Forme French Touch sur exactement N mesures. o : { first, last, intro, outro } */
export function ftForm(N, o = {}) {
  const first = o.first !== false, last = o.last !== false;
  let tpl = (N >= 92 ? T_FULL : N >= 60 ? T_MED : N >= 26 ? T_SHORT : T_TINY).map((x) => x.slice());
  let sum = tpl.reduce((a, x) => a + x[1], 0);
  while (N - sum >= 44) { tpl.splice(tpl.length - 1, 0, ...EXTRA.map((x) => x.slice())); sum += 44; }
  if (!first) tpl[0] = ['loop', Math.min(8, tpl[0][1]), true];
  if (!last) tpl.pop();
  if (first && o.intro != null) tpl[0][1] = o.intro;
  if (last && o.outro != null) tpl[tpl.length - 1][1] = o.outro;
  sum = tpl.reduce((a, x) => a + x[1], 0);
  let diff = N - sum, guard = 0;
  const fixed = (i) => (first && i === 0 && o.intro != null) || (last && i === tpl.length - 1 && o.outro != null);
  // ajouts / retraits par blocs de 4 mesures (phrases), le reste (< 4) va à l'outro (ou à l'intro / la 1re section)
  while (diff >= 4 && guard++ < 200) {
    let moved = false;
    for (const k of ['drop2', 'drop', 'loop', 'outro', 'intro', 'breakdown']) {
      if (diff < 4) break;
      const i = tpl.findIndex((x, j) => x[0] === k && !fixed(j) && (x.add || 0) < MAXADD[k]);
      if (i < 0) continue;
      tpl[i][1] += 4; tpl[i].add = (tpl[i].add || 0) + 4; diff -= 4; moved = true;
    }
    if (!moved) break;
  }
  guard = 0;
  const small = sum < 40, stp = small ? 2 : 4;
  while (diff <= -stp && guard++ < 200) {
    let moved = false;
    for (const k of small ? ['outro', 'intro', 'build', 'breakdown', 'drop2', 'drop'] : ['loop', 'outro', 'intro', 'drop2', 'drop', 'breakdown']) {
      if (diff > -stp) break;
      const i = tpl.findIndex((x, j) => x[0] === k && !fixed(j) && x[1] - stp >= MIN[k]);
      if (i < 0) continue;
      tpl[i][1] -= stp; diff += stp; moved = true;
    }
    if (!moved) break;
  }
  // petit reste négatif : pris sur une section qui garde au moins 2 mesures (outro, intro, breakdown…)
  for (const k of ['outro', 'intro', 'breakdown', 'loop', 'drop2', 'drop']) {
    if (diff >= 0) break;
    const i = tpl.findIndex((x, j) => x[0] === k && !fixed(j) && x[1] + diff >= 2);
    if (i >= 0) { tpl[i][1] += diff; diff = 0; }
  }
  // reste : outro (ou dernière section), puis intro / 1re section, puis n'importe où
  const order = [tpl.length - 1, 0, ...tpl.map((x, i) => i)];
  for (const i of order) {
    if (!diff) break;
    if (diff > 0) { tpl[i][1] += diff; diff = 0; }
    else { const a = Math.min(-diff, tpl[i][1] - 1); tpl[i][1] -= a; diff += a; }
  }
  tpl = tpl.filter((x) => x[1] > 0);
  let bar = 0;
  const sections = tpl.map(([k, bars, tr]) => {
    const s = k === 'intro' ? { type: 'intro' } : k === 'outro' ? { type: 'outro' } : k === 'loop' ? { type: 'A', role: 'loop' } : k === 'build' ? { type: 'A', role: 'build' }
      : k === 'breakdown' ? { type: 'bridge', role: 'breakdown' } : k === 'drop2' ? { type: 'B', role: 'drop', ft: 'drop2' } : { type: 'B', role: 'drop' };
    s.ft = s.ft || k; s.bars = bars; s.startBar = bar; if (tr) s.transition = true; bar += bars; return s;
  });
  return { sections, totalBars: bar };
}

// découpes de la boucle (2 mesures = 32 doubles-croches) : [pas, longueur en doubles, vélocité]
const CHOPS = [
  // contretemps à la croche + anticipation (filtré disco classique)
  [[2, 2, 1], [6, 2, 0.88], [10, 2, 1], [13, 1, 0.7], [14, 2, 0.95], [18, 2, 1], [22, 2, 0.88], [26, 2, 1], [29, 1, 0.7], [30, 2, 1]],
  // poussée syncopée (« push » à la double)
  [[0, 3, 1], [3, 3, 0.85], [6, 2, 0.9], [10, 3, 0.95], [14, 2, 0.85], [16, 3, 1], [19, 3, 0.85], [22, 2, 0.9], [26, 1, 0.75], [27, 3, 0.9], [30, 2, 1]],
  // doubles hachées, échantillon redéclenché
  [[0, 1, 1], [2, 1, 0.75], [3, 1, 0.9], [6, 1, 0.85], [8, 1, 0.7], [10, 1, 0.95], [11, 1, 0.7], [14, 2, 1], [16, 1, 1], [18, 1, 0.75], [19, 1, 0.9], [22, 1, 0.85], [24, 1, 0.7], [26, 1, 0.95], [27, 1, 0.7], [29, 1, 0.8], [30, 2, 1]],
  // accord long puis découpes (filtre qui « respire »)
  [[0, 5, 1], [6, 1, 0.7], [7, 2, 0.85], [10, 2, 0.9], [14, 2, 0.9], [16, 2, 0.95], [19, 1, 0.75], [20, 3, 0.9], [24, 1, 0.7], [26, 2, 0.9], [29, 1, 0.75], [30, 2, 1]],
  // Homework : stabs secs sur la double après le temps
  [[1, 1, 0.9], [3, 1, 0.8], [6, 2, 1], [9, 1, 0.85], [11, 1, 0.8], [14, 2, 1], [17, 1, 0.9], [19, 1, 0.8], [22, 2, 1], [25, 1, 0.85], [27, 1, 0.8], [30, 2, 1]],
  // contretemps longs + double fantôme
  [[2, 3, 1], [5, 1, 0.6], [6, 2, 0.9], [10, 3, 1], [13, 1, 0.6], [14, 2, 0.9], [18, 3, 1], [21, 1, 0.6], [22, 2, 0.9], [26, 3, 1], [29, 1, 0.65], [30, 2, 0.95]],
];
// Ed Banger : rafales de doubles sur une note, accents décalés, découpe « gate » mécanique
const CHOPS_EB = [
  [[0, 1, 1], [1, 1, 0.7], [2, 1, 0.85], [3, 1, 0.7], [6, 2, 1], [8, 1, 0.8], [9, 1, 0.7], [10, 2, 1], [14, 1, 0.8], [15, 1, 0.9], [16, 1, 1], [17, 1, 0.7], [18, 1, 0.85], [19, 1, 0.7], [22, 2, 1], [24, 1, 0.8], [26, 1, 0.9], [27, 1, 0.8], [28, 1, 0.9], [29, 1, 0.9], [30, 1, 1], [31, 1, 1]],
  [[0, 2, 1], [3, 1, 0.9], [6, 1, 0.95], [8, 2, 0.8], [11, 1, 0.9], [14, 2, 1], [16, 2, 1], [19, 1, 0.9], [22, 1, 0.95], [24, 2, 0.8], [27, 1, 0.9], [29, 1, 0.9], [30, 2, 1]],
  [[0, 3, 1], [3, 3, 1], [6, 2, 1], [10, 1, 0.8], [11, 1, 0.8], [12, 4, 0.9], [16, 3, 1], [19, 3, 1], [22, 2, 1], [26, 1, 0.8], [27, 1, 0.85], [28, 1, 0.9], [29, 1, 0.95], [30, 2, 1]],
];
// Myd : stabs joueurs, réponses courtes, silences (le hook et la basse respirent)
const CHOPS_MYD = [
  [[0, 2, 1], [3, 1, 0.8], [6, 1, 0.9], [10, 2, 1], [14, 1, 0.8], [16, 2, 1], [19, 1, 0.8], [22, 1, 0.9], [24, 1, 0.7], [27, 2, 0.95], [30, 1, 0.8]],
  [[2, 1, 1], [4, 1, 0.7], [6, 2, 0.95], [11, 1, 0.85], [14, 2, 1], [18, 1, 1], [20, 1, 0.7], [22, 2, 0.95], [26, 1, 0.85], [27, 1, 0.8], [30, 2, 1]],
];
const BREAK_CHOP = [[0, 12, 0.85], [14, 2, 0.6], [16, 12, 0.85], [30, 2, 0.6]];
// guitare étouffée (1 mesure, doubles) : [pas, vélocité]
const GTR = [
  [[1, 0.55], [2, 0.9], [3, 0.5], [6, 0.85], [7, 0.45], [9, 0.5], [10, 0.9], [11, 0.5], [14, 0.85], [15, 0.45]],
  [[0, 0.45], [2, 0.9], [5, 0.55], [6, 0.8], [8, 0.45], [10, 0.9], [13, 0.55], [14, 0.8]],
  [[1, 0.5], [3, 0.8], [5, 0.5], [7, 0.8], [9, 0.5], [11, 0.8], [13, 0.5], [15, 0.85]],
];
// rythmes du riff (talkbox / vocodeur), 2 mesures : [pas, longueur]
const RIFF = [
  [[0, 3], [3, 3], [6, 2], [10, 2], [12, 4], [19, 3], [22, 2], [26, 6]],
  [[2, 2], [4, 2], [7, 3], [10, 4], [16, 2], [18, 2], [20, 2], [23, 5]],
  [[0, 6], [6, 2], [8, 2], [11, 5], [16, 3], [19, 3], [22, 4], [28, 4]],
  [[3, 3], [6, 3], [9, 3], [12, 4], [18, 2], [20, 4], [26, 2], [28, 4]],
];
// hook découpé (Myd) : notes courtes rebondissantes, 2 mesures
const HOOK = [
  [[0, 1], [2, 1], [3, 2], [6, 1], [8, 2], [11, 1], [14, 2], [16, 1], [18, 1], [19, 2], [22, 1], [24, 1], [26, 2], [29, 1], [30, 2]],
  [[0, 2], [3, 1], [4, 1], [7, 2], [10, 1], [12, 2], [16, 2], [19, 1], [20, 1], [23, 2], [26, 1], [27, 1], [28, 2]],
];
// riff Ed Banger : saw en doubles, notes répétées et sauts d'octave
const RIFF_EB = [
  [[0, 1], [1, 1], [2, 2], [4, 1], [6, 2], [8, 1], [9, 1], [10, 2], [12, 1], [14, 2], [16, 1], [17, 1], [18, 2], [20, 1], [22, 2], [24, 4], [28, 4]],
  [[0, 2], [2, 2], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4], [16, 2], [18, 2], [20, 2], [22, 2], [24, 3], [27, 1], [28, 4]],
];
const INT = { intro: 0.8, loop: 0.9, build: 0.92, drop: 1, breakdown: 0.82, drop2: 1.04, outro: 0.86 };

function mutateChop(p, r) {
  const o = p.map((h) => h.slice());
  const cands = o.map((h, i) => i).filter((i) => o[i][0] % 16 !== 0 && o[i][0] % 16 < 14);
  if (cands.length > 3) o.splice(r.pick(cands), 1);
  const used = new Set(o.map((h) => h[0]));
  const free = []; for (let st = 1; st < 28; st += 2) if (!used.has(st)) free.push(st);
  if (free.length) o.push([r.pick(free), 1, 0.7]);
  if (r.chance(0.55)) { for (let i = o.length - 1; i >= 0; i--) if (o[i][0] >= 28) o.splice(i, 1); o.push([28, 1, 0.75], [29, 1, 0.8], [30, 1, 0.9], [31, 1, 1]); } // redéclenchement (« chop » de fin de boucle)
  return o.sort((a, b) => a[0] - b[0]);
}

export function composeFrenchTouch(plan, ci, state = {}) {
  const P = plan.params, S = plan.S, C = plan.chapters[ci], ADV = P.adv || {};
  const BPB = 4, SPB = 16, secs = C.sections, N = C.bars, MX = plan.mix || null;
  const isLastCh = ci === plan.chapters.length - 1;
  const steps = SCALES[P.scale].steps, keyPc = NOTE_NAMES.indexOf(P.key);
  const r = makeRng(hashSeed(P.seed, 'ft19', P.variation, ci));
  const rg = makeRng(hashSeed(P.seed, 'ft19groove', P.variation, ci));
  const rf = makeRng(hashSeed(P.seed, 'ft19filter', P.variation, ci));
  const HUM = (ADV.humanize ?? 50) / 50;
  const E = ADV.energy == null ? 1 : 0.8 + ADV.energy / 250;
  const swing = S.swing || 0;
  const stepT = (bar, st) => bar * BPB + st / 4 + (st % 2 === 1 ? swing * 0.25 : 0);
  const on = { ...P.instruments };
  for (const k of (C.profile && C.profile.drop) || []) on[k] = false;
  if (ADV.melody === 'off') on.lead = false;
  const leadVel = ADV.melody === 'discrete' ? 0.62 : ADV.melody === 'forward' ? 1.15 : 1;
  const ev = [], gaps = [];
  const V = P.ftStyle || 'classic', EB = V === 'edbanger', MYD = V === 'myd';
  const F21 = P.engine >= 21 || !!P.harmonyFix; // v1.12.0 : harmonie juste (docs/THEORIE.md)

  // --- harmonie : boucle par section (chaque section repart du 1er accord), voicings fixes = sensation d'échantillon
  const size = ADV.complexity != null ? (ADV.complexity < 30 ? (EB ? 3 : 4) : 5) : EB ? r.pick([3, 3, 4]) : r.pick([4, 4, 5]);
  const chordRoot = 48 + keyPc;
  const barChord = new Array(N), barSec = new Array(N);
  secs.forEach((s, si) => { const prog = s.ft === 'breakdown' ? C.progB : C.progA; for (let b = 0; b < s.bars; b++) { barChord[s.startBar + b] = prog[b % prog.length]; barSec[s.startBar + b] = [s, b, si]; } });
  const voicing = state.ftVoicing || (state.ftVoicing = {});
  let prev = state.prevVoicing || null;
  const voiceOf = (deg) => {
    if (!voicing[deg]) {
      let ch = chordMidis(steps, chordRoot, deg, size);
      if (size === 5) ch = [ch[0], ch[1], ch[3], ch[4]]; // 9e sans quinte : voicing compact « disco »
      const o21 = F21 ? { aligned: true, parallels: EB ? 0 : 3 } : null; // moteur 21 : accord dans la bonne tonalité (THEORIE.md §1)
      voicing[deg] = EB ? voiceLead(ch, prev, 50, 70, o21) : voiceLead(ch, prev, 55, 77, o21); prev = voicing[deg];
      if (EB) voicing[deg] = [...voicing[deg], voicing[deg][0] + 12]; // saws doublées à l'octave (stab massif)
    }
    return voicing[deg];
  };
  for (const d of C.progA.concat(C.progB)) voiceOf(d);
  const bassBase = 12 * ((S.bassOct ?? 2) + 1) + keyPc;
  const bassRoot = (deg) => { let m = degreeToMidi(steps, bassBase, deg); while (m > 47) m -= 12; while (m < 33) m += 12; return m; };

  // découpes : principale, alternative (mutations), drop 2 (nouvelle découpe)
  const CP = EB ? CHOPS_EB.concat([CHOPS[1], CHOPS[4]]) : MYD ? CHOPS_MYD.concat([CHOPS[0], CHOPS[3], CHOPS[5]]) : CHOPS;
  const ci0 = ADV.drumPattern ? (ADV.drumPattern - 1) % CP.length : r.int(0, CP.length - 1);
  let ci2 = r.int(0, CP.length - 1); if (ci2 === ci0) ci2 = (ci2 + 1 + r.int(0, CP.length - 2)) % CP.length;
  const chopMain = CP[ci0], chopD2 = CP[ci2];
  const chopMainV = mutateChop(chopMain, r), chopD2V = mutateChop(chopD2, r);
  const ant = r.chance(0.75);
  const gtr = GTR[r.int(0, GTR.length - 1)];
  const RR = EB ? RIFF_EB : MYD ? HOOK : RIFF, riffRh = RR[r.int(0, RR.length - 1)];
  const phraseLen = r.pick([8, 8, 16]);
  const chopFor = (s, b) => {
    if (s.ft === 'breakdown') return BREAK_CHOP;
    const ph = Math.floor(b / phraseLen) % 2 === 1;
    if (s.ft === 'drop2') return ph ? chopD2V : chopD2;
    if (s.ft === 'drop' || s.ft === 'loop') return ph ? chopMainV : chopMain;
    return chopMain;
  };

  // riff (degrés fixes, recalés sur l'accord de chaque mesure)
  const penta = PENTA_DEGREES[P.scale] || [0, 2, 4];
  const leadBase = 12 * (MYD ? 6 : EB ? 4 : 5) + keyPc;
  const riffDeg = []; { let d = r.pick([2, 4, 4, 7]); for (const [st, len] of riffRh) { riffDeg.push(d); d += r.weighted([-2, -1, 0, 1, 2, 3, -3], [2, 3, 1.2, 3, 2, 0.7, 0.7]); d = Math.max(-1, Math.min(9, d)); } }
  const snap = (deg, cd, strong) => {
    if (strong) { let best = deg, bd = 99; for (const c of [cd, cd + 2, cd + 4]) for (let o = -14; o <= 14; o += 7) if (Math.abs(c + o - deg) < bd) { bd = Math.abs(c + o - deg); best = c + o; } return best; }
    const pc = ((deg % 7) + 7) % 7; return penta.includes(pc) || [cd, cd + 2, cd + 4].some((c) => ((c % 7) + 7) % 7 === pc) ? deg : deg + 1;
  };

  const D = (kind, bar, st, v, extra) => ev.push({ inst: 'drums', kind, t: stepT(bar, st) + (kind === 'kick' ? 0 : rg.gauss() * 0.003 * HUM) + (kind === 'clap' ? 0.006 : 0), v: Math.min(1, v * (1 + rg.gauss() * 0.03 * HUM)), ...(extra || {}) });

  for (let si = 0; si < secs.length; si++) {
    const s = secs[si], k = s.ft, nx = secs[si + 1] || null, I = (INT[k] || 0.9) * E;
    const firstSec = si === 0, lastSec = si === secs.length - 1;
    const half = Math.max(1, Math.floor(s.bars / 2));
    for (let b = 0; b < s.bars; b++) {
      const bar = s.startBar + b, lastBar = b === s.bars - 1;
      const deg = barChord[bar], nextDeg = bar + 1 < N ? barChord[bar + 1] : deg;

      // ---------- BATTERIE
      if (on.drums) {
        let kick = true, clap = true, hats = 'B', ohat = true, snare = false, shaker = false, ride = false;
        if (k === 'intro') {
          const djIn = MX && MX.djIn && ci === 0;
          const q = b / s.bars;
          clap = djIn ? q >= 0.5 : q >= 0.5 || s.bars <= 2; hats = q >= (djIn ? 0.25 : 0.25) ? (q >= 0.5 ? 'B' : 'A') : (s.bars <= 2 ? 'A' : null); ohat = q >= 0.5 || s.bars <= 4;
          if (s.bars >= 8 && b === 0) hats = null;
        } else if (k === 'loop') { hats = 'A'; if (s.transition && b < 2) clap = false; }
        else if (k === 'build') { hats = 'B'; clap = false; }
        else if (k === 'drop') { snare = true; shaker = !EB && b >= half && s.bars >= 8; }
        else if (k === 'drop2') { snare = true; shaker = true; ride = b >= half; }
        else if (k === 'breakdown') { kick = false; clap = b >= half && s.bars >= 4; hats = b >= half ? 'A' : null; ohat = true; }
        else if (k === 'outro') {
          const q = b / s.bars, djOut = MX && MX.djOut && isLastCh;
          clap = q < (djOut ? 0.75 : 0.5); hats = q < 0.75 || djOut ? (q < 0.5 ? 'B' : 'A') : null; ohat = q < (djOut ? 1 : 0.75);
          if (isLastCh && !djOut && lastBar && s.bars >= 2) { D('kick', bar, 0, 0.95); D('crash', bar, 0, 0.5); continue; }
        }
        for (let st = 0; st < SPB; st++) {
          if (kick && st % 4 === 0) D('kick', bar, st, 1);
          if (clap && (st === 4 || st === 12)) { D('clap', bar, st, 0.95 * I); if (snare) D('snare', bar, st, 0.5 * I); }
          if (ohat && st % 4 === 2) D('ohat', bar, st, (k === 'breakdown' ? 0.55 : hats ? 0.8 : 0.7) * I);
          if (hats && st % 4 !== 2) {
            const m = st % 4;
            if (hats === 'A' && m === 3) continue; // A : le charley ouvert sonne jusqu'à la double suivante
            D('hat', bar, st, (m === 1 ? 0.6 : m === 3 ? 0.42 : 0.34) * (hats === 'B' ? 1.08 : 0.92) * I);
          }
          if (shaker && st % 2 === 1) D('shaker', bar, st, 0.28 * I);
          if (ride && st % 4 === 2) D(EB ? 'crash' : 'ride', bar, st, (EB ? 0.18 : 0.32) * I);
          if (MYD && (k === 'drop' || k === 'drop2') && (st === 3 || st === 10 || (b % 2 && st === 15))) D('rim', bar, st, 0.42 * I); // percussions joueuses
        }
        // fills : fin de phrase de 8 mesures (hors dernière mesure de section)
        if ((k === 'loop' || k === 'drop' || k === 'drop2') && b % 8 === 7 && !lastBar) {
          const f = rg.pick(['clap', 'snare', 'kickout', 'tom', 'clap']);
          if (f === 'clap') for (const [st, v] of [[13, 0.45], [14, 0.6], [15, 0.75]]) D('clap', bar, st, v * I);
          else if (f === 'snare') for (let q = 0; q < 6; q++) D('snare', bar, 12 + q * (4 / 6), (0.3 + 0.08 * q) * I);
          else if (f === 'kickout') { gaps.push([bar * 4 + 3, bar * 4 + 4, 'kick']); D('ohat', bar, 15, 0.7 * I); D('clap', bar, 15, 0.55 * I); }
          else for (const [st, kd] of [[12, 'tomh'], [13, 'tomh'], [14, 'tomm'], [15, 'toml']]) D(kd, bar, st, 0.62 * I);
        }
        // coupure (kick + basse) toutes les 16 mesures des drops
        if ((k === 'drop' || k === 'drop2') && b % 16 === 15 && !lastBar && rg.chance(0.6)) gaps.push([bar * 4 + 3, bar * 4 + 4, 'kb']);
        // montée : roulement clap / caisse claire en crescendo sur les 4 dernières mesures (noires → croches → doubles → triples)
        if (k === 'build') {
          const rb = Math.min(4, s.bars), q = b - (s.bars - rb);
          if (q >= 0) {
            const div = [1, 2, 4, 8][Math.min(3, q + (4 - rb))], kind = rb >= 4 && q < 2 ? 'snare' : 'clap';
            for (let x = 0; x < 4 * div; x++) { const p = (q + x / (4 * div)) / rb; ev.push({ inst: 'drums', kind, t: bar * 4 + x / div, v: (0.22 + 0.6 * p * p) * I }); }
          }
        }
        if ((k === 'drop' || k === 'drop2') && b === 0) D('crash', bar, 0, 0.75);
        if (k === 'loop' && b === 0 && !s.transition) D('crash', bar, 0, 0.45);
      }

      // ---------- BOUCLE : stabs d'accords
      const loopIn = k !== 'intro' || b >= Math.floor(s.bars / 2) || s.bars <= 2;
      const loopOut = k === 'outro' && b >= Math.ceil(s.bars * 0.75) && !(MX && MX.djOut);
      if (on.chords && loopIn && !loopOut) {
        const chop = chopFor(s, b), bi = b % 2, vIn = k === 'intro' ? 0.55 + 0.4 * ((b - s.bars / 2) / Math.max(1, s.bars / 2)) : 1;
        for (const [st0, len, vel] of chop) {
          if (Math.floor(st0 / 16) !== bi) continue;
          const st = st0 % 16, antic = ant && st >= 14 && nextDeg !== deg && k !== 'breakdown' ? nextDeg : deg;
          const notes = voiceOf(antic), t = stepT(bar, st) + rg.gauss() * 0.002 * HUM, d = Math.max(0.12, (len / 4) * (k === 'breakdown' ? 0.95 : 0.78));
          const v = vel * 0.72 * I * vIn;
          for (const m of notes) ev.push({ inst: 'chords', t, d, m, v, f: 1 });
          if (k === 'drop2' && len <= 2 && !EB) ev.push({ inst: 'chords', t, d, m: notes[notes.length - 1] + 12, v: v * 0.42, f: 1 }); // couche supplémentaire : note du haut à l'octave
          if (EB && (k === 'drop2' || (k === 'drop' && b >= half))) for (const m of notes.slice(0, 2)) ev.push({ inst: 'arp', t, d: d * 0.8, m: m + 12, v: v * 0.55, f: 1 }); // seconde couche saturée
        }
        // guitare étouffée (doubles) : seconde moitié du drop, tout le drop 2, début de l'outro (Ed Banger : pas de guitare)
        if (!EB && (k === 'drop' && b >= half) || k === 'drop2' || (k === 'outro' && b < half) || (k === 'loop' && s.bars >= 16 && b >= 12)) {
          const vc = voiceOf(deg), pair = [vc[1], vc[vc.length - 1]].map((m) => { let x = m; while (x < 64) x += 12; while (x > 79) x -= 12; return x; });
          for (const [st, vel] of gtr) for (const m of pair) ev.push({ inst: 'arp', t: stepT(bar, st), d: 0.11, m, v: vel * 0.6 * I, f: 1 });
        }
      }

      // ---------- BASSE disco (octaves en croches, approches chromatiques)
      const bassOn = on.bass && (k === 'loop' || k === 'drop' || k === 'drop2' || (k === 'build' && !(lastBar && s.bars >= 2)) || (k === 'intro' && b >= Math.floor(s.bars * 0.75) && s.bars >= 8) || (k === 'outro' && b < half) || (k === 'breakdown' && lastBar === false && b >= s.bars - 2 && s.bars >= 8));
      if (bassOn && EB) {
        // Ed Banger : basse saw saturée en doubles, accents et sauts d'octave (galop), le kick garde son espace
        const root = bassRoot(deg), nr = bassRoot(nextDeg);
        for (let st = 0; st < SPB; st++) {
          if (st % 4 === 0 && st !== 0 && b % 2 === 0) continue;
          const m = st % 8 === 6 || st === 15 ? root + 12 : st >= 14 && nr !== root && b % 2 === 1 ? nr : root;
          ev.push({ inst: 'bass', t: stepT(bar, st), d: 0.16, m, v: (st % 4 === 2 ? 0.95 : st % 2 ? 0.62 : 0.78) * I, f: 0.9 });
        }
      } else if (bassOn && MYD) {
        // Myd : basse rebondissante syncopée, octaves et glissés, notes de passage
        const root = bassRoot(deg), nr = bassRoot(nextDeg);
        // moteur 21 : tierce et quinte de l'accord (et non de la tonique), approche diatonique puis octave
        const five = F21 ? root + (degreeToMidi(steps, 0, deg + 4) - degreeToMidi(steps, 0, deg)) : root + 7, third = F21 ? root + (degreeToMidi(steps, 0, deg + 2) - degreeToMidi(steps, 0, deg)) : root + (steps[2] - steps[0]);
        const nb = nr + (degreeToMidi(steps, 0, nextDeg - 1) - degreeToMidi(steps, 0, nextDeg));
        const pat = F21 ? (b % 2 === 0 ? [[0, 0.5, root], [3, 0.2, root + 12], [6, 0.3, root], [8, 0.2, root + 12], [10, 0.35, five], [13, 0.2, root + 12], [14, 0.3, root]]
          : [[0, 0.5, root], [3, 0.2, root + 12], [6, 0.25, third], [7, 0.2, five], [10, 0.4, root + 12], [12, 0.2, root], [14, 0.2, nr === root ? five : nb], [15, 0.15, nr === root ? root + 12 : nr - 1]]) : b % 2 === 0 ? [[0, 0.5, root], [3, 0.2, root + 12], [6, 0.3, root], [8, 0.2, root + 12], [10, 0.35, five], [13, 0.2, root + 12], [14, 0.3, root]]
          : [[0, 0.5, root], [3, 0.2, root + 12], [6, 0.25, third], [7, 0.2, five], [10, 0.4, root + 12], [12, 0.2, root], [14, 0.2, nr === root ? five : nr - 1], [15, 0.15, nr === root ? root + 12 : nr + 11]];
        for (const [st, d, m] of pat) ev.push({ inst: 'bass', t: stepT(bar, st), d, m, v: (st % 4 === 0 ? 0.9 : 0.72) * I, f: 0.95, ...(st === 3 || st === 13 ? { port: root } : {}) });
      } else if (bassOn) {
        const root = bassRoot(deg), nr = bassRoot(nextDeg), five = F21 ? root + (degreeToMidi(steps, 0, deg + 4) - degreeToMidi(steps, 0, deg)) : root + 7;
        const nAb = nr + (degreeToMidi(steps, 0, nextDeg + 1) - degreeToMidi(steps, 0, nextDeg)), nBe = nr + (degreeToMidi(steps, 0, nextDeg - 1) - degreeToMidi(steps, 0, nextDeg));
        for (let st = 0; st < SPB; st += 2) {
          const up = st % 4 === 2;
          if (st === 14 && b % 2 === 1 && nr !== root) { const dir = nr > root ? -1 : 1; ev.push({ inst: 'bass', t: stepT(bar, 14), d: 0.2, m: F21 ? (dir < 0 ? nBe : nAb) : nr + 2 * dir, v: 0.68 * I, f: 0.9 }); ev.push({ inst: 'bass', t: stepT(bar, 15), d: 0.18, m: nr + dir, v: 0.58 * I, f: 0.9 }); continue; }
          ev.push({ inst: 'bass', t: stepT(bar, st), d: up ? 0.2 : 0.34, m: up ? root + 12 : st === 8 && b % 4 === 2 ? five : root, v: (up ? 0.66 : 0.86) * I, f: 0.9 });
        }
        if (k === 'drop2' && b % 2 === 0) ev.push({ inst: 'bass', t: stepT(bar, 7), d: 0.12, m: root + 12, v: 0.45 * I, f: 0.9 });
      }

      // ---------- RIFF (talkbox) : drop 2, et un aperçu en seconde moitié du breakdown
      const leadOn = on.lead && (k === 'drop2' || (k === 'breakdown' && b >= half && s.bars >= 4) || (MYD && k === 'drop' && b >= half));
      if (leadOn && b % 2 === 0) {
        const rep = Math.floor(b / 2), answer = rep % 4 === 3;
        let pl = null;
        riffRh.forEach(([st0, len], i) => {
          const bb = bar + Math.floor(st0 / 16); if (bb >= N || bb >= s.startBar + s.bars) return;
          const st = st0 % 16, cd = barChord[bb];
          let dg = riffDeg[i] + (answer && i >= riffRh.length - 3 ? [-1, -2, -3][i - (riffRh.length - 3)] : 0);
          dg = snap(dg, cd, st % 8 === 0 || len >= 4);
          if (F21 && len >= 2 && !(st % 8 === 0 || len >= 4)) { // moteur 21 : pas de frottement de demi-ton avec l'accord joué
            const pcs = voiceOf(cd).map((x) => x % 12), pc = degreeToMidi(steps, leadBase, dg) % 12;
            if (!pcs.includes(pc) && pcs.some((q) => (pc - q + 12) % 12 === 1 || (q - pc + 12) % 12 === 1)) dg = snap(dg, cd, true);
          }
          const m = degreeToMidi(steps, leadBase, dg), t = stepT(bb, st);
          const e = { inst: 'lead', t, d: (len / 4) * (MYD ? 0.6 : EB ? 0.8 : 0.9), m, v: 0.7 * leadVel * I * (k === 'breakdown' ? 0.7 : 1), f: 1, rv: k === 'breakdown' ? 1.4 : 1 };
          if (!MYD && pl && t - pl.end < 0.3 && Math.abs(m - pl.m) <= 7 && m !== pl.m) e.port = pl.m;
          if (EB && i % 4 === 3) e.m += 12; // sauts d'octave
          pl = { end: t + e.d, m }; ev.push(e);
        });
      }
    }

    // ---------- TEXTURES : montée (riser), impact sur les drops, souffle du breakdown
    if (on.texture) {
      if (k === 'build') ev.push({ inst: 'texture', kind: 'riser', t: s.startBar * 4, d: s.bars * 4, v: 0.6 });
      if (k === 'drop' || k === 'drop2') ev.push({ inst: 'texture', kind: 'impact', t: s.startBar * 4, d: 4, v: 0.65 });
      if (k === 'breakdown' && s.bars >= 4) ev.push({ inst: 'texture', kind: 'wash', t: s.startBar * 4, d: s.bars * 4, v: 0.35 });
      if (k === 'intro' && s.bars >= 8 && nx && nx.ft !== 'build') ev.push({ inst: 'texture', kind: 'riser', t: (s.startBar + s.bars - 2) * 4, d: 8, v: 0.4 });
    }
    // ---------- coupure avant les drops (dernier temps : tout se tait sauf la montée)
    if (nx && (nx.ft === 'drop' || nx.ft === 'drop2') && (k === 'build' || k === 'breakdown')) gaps.push([(s.startBar + s.bars) * 4 - 1, (s.startBar + s.bars) * 4, 'all']);

    // ---------- FILTRE 24 dB (a, b : boucle ; da, db : batterie ; q : résonance)
    const seg = (b0, nb, a, b1, o = {}) => ev.push({ inst: 'fx', kind: 'lpf', t: (s.startBar + b0) * 4, d: nb * 4, a: +a.toFixed(3), b: +b1.toFixed(3), v: 1, ...o });
    const prevEnd = state.ftX ?? 0.3;
    if (k === 'intro') {
      const h = s.bars <= 2 ? 0 : Math.floor(s.bars / 2), dr = rf.chance(0.5) && !(MX && MX.djIn);
      const x0 = MYD ? 0.18 : 0.06;
      if (h) seg(0, h, x0, x0, dr ? { da: 0.45, db: 0.8 } : {});
      seg(h, s.bars - h, x0, (MYD ? 0.55 : 0.38) + 0.12 * rf(), dr ? { da: 0.8, db: 1 } : {});
      state.ftX = 0.45;
    } else if (k === 'loop') {
      const a = s.transition ? 0.22 : Math.min(0.5, prevEnd), end = nx && nx.ft === 'build' ? 0.68 : 0.85;
      seg(0, s.bars, a, end, { q: 0.55 }); state.ftX = end;
    } else if (k === 'build') {
      seg(0, s.bars, Math.min(0.8, Math.max(0.35, prevEnd)), 1, { q: 0.6 }); state.ftX = 1;
    } else if (k === 'drop' || k === 'drop2') {
      for (let b0 = 0; b0 < s.bars; b0 += 8) {
        const nb = Math.min(8, s.bars - b0), dip = nb === 8 && b0 + 8 < s.bars && rf.chance(0.55);
        if (dip) { seg(b0, 7, 1, 1); seg(b0 + 7, 0.5, 1, 0.5 + 0.1 * rf(), { q: 0.6 }); seg(b0 + 7.5, 0.5, 0.55, 1, { q: 0.6 }); } else seg(b0, nb, 1, 1);
      }
      state.ftX = 1;
    } else if (k === 'breakdown') {
      const h = Math.max(1, Math.floor(s.bars / 2));
      seg(0, 1, 1, 0.15, { da: 1, db: 0.5, q: 0.75 });
      if (h > 1) seg(1, h - 1, 0.15, 0.24, { da: 0.5, db: 0.5, q: 0.75 });
      seg(h, s.bars - h, 0.24, nx && nx.ft === 'drop2' ? 0.95 : 0.6, { da: 0.5, db: 0.85, q: 0.7 });
      state.ftX = nx && nx.ft === 'drop2' ? 0.95 : 0.6;
    } else if (k === 'outro') {
      seg(0, s.bars, 1, 0.08, { q: 0.55 }); state.ftX = 0.1;
    }
  }

  // coupures
  const inGap = (e) => gaps.some(([a, b, w]) => e.t >= a - 0.01 && e.t < b - 0.01 && (w === 'all' ? e.inst !== 'texture' && e.inst !== 'fx' && !(e.inst === 'drums' && e.kind === 'crash') : w === 'kb' ? e.inst === 'bass' || (e.inst === 'drums' && e.kind === 'kick') : e.inst === 'drums' && e.kind === 'kick'));
  for (let i = ev.length - 1; i >= 0; i--) if (inGap(ev[i])) ev.splice(i, 1);
  for (const e of ev) if (e.inst === 'bass' || e.inst === 'chords' || e.inst === 'lead') for (const [a, , w] of gaps) if (w !== 'kick' && e.t < a && e.t + e.d > a && (w === 'all' || e.inst === 'bass')) e.d = Math.max(0.08, a - e.t - 0.02);

  // réverbe : plus large au breakdown, plus sèche aux drops ; micro-timing des notes
  for (const e of ev) {
    if (e.inst === 'fx' || e.inst === 'texture') continue;
    const x = barSec[Math.min(N - 1, Math.floor(e.t / 4))];
    if (x && e.inst !== 'drums' && e.rv == null) e.rv = x[0].ft === 'breakdown' ? 1.35 : x[0].ft === 'intro' || x[0].ft === 'outro' ? 1.1 : x[0].ft === 'drop' || x[0].ft === 'drop2' ? 0.85 : 1;
    if (e.inst === 'bass' || e.inst === 'lead') e.t += rg.gauss() * 0.004 * HUM;
    if (e.t < 0) e.t = 0;
  }
  if (C.transpose) for (const e of ev) if (e.inst !== 'drums' && e.inst !== 'texture' && e.inst !== 'fx') { e.m += C.transpose; if (e.port != null) e.port += C.transpose; }
  state.prevVoicing = prev;
  const off = C.startBar * BPB;
  if (off) for (const e of ev) e.t += off;
  ev.sort((a, b) => a.t - b.t);
  return ev;
}
