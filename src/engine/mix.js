// Mode « mix DJ » des morceaux longs (1 h à 4 h) : au lieu d'un seul morceau étiré, un set continu de sous-morceaux
// distincts (graine, tonalité, progression, motifs, sons, batterie et arrangement propres) enchaînés comme un DJ :
// calage sur une grille de tempo commune (beatmatching), fondus de 16 à 32 mesures avec échange des basses (EQ),
// filtres, tonalités compatibles (roue Camelot), dérive lente du tempo et courbe d'énergie sur tout le set.
// Ce module ne fait que planifier (déterministe à partir de la graine) ; le rendu en flux est dans render.js.
import { resolveParams, planSong, meterInfo, RENDER_TAIL, LIMITS, SYNTH_BPM, ADVANCED, varietyOf } from './composer.js';
import { SCALES, NOTE_NAMES, NOTE_NAMES_FR } from './theory.js';
import { STYLES, VARIANT_KEY, styleDef, variantOf } from './styles.js';
import { TECHNO_BPM } from './techno.js';
import { makeRng, hashSeed } from './rng.js';
import { makeTitle } from '../titles.js';
import { MIX_POOLS, MIX_POOLS18, POOLS20 } from './flavor.js';
import { SR } from './dsp.js';
import { planAt } from './aiplan.js';

/** Mode mix automatique à partir de cette durée (s) ; forçable (« Activé ») dès MIX_FORCED_MIN. */
export const MIX_AUTO_SECONDS = 3600;
export const MIX_FORCED_MIN = 900;
export function mixEnabled(P) {
  const m = P.adv && P.adv.mix, d = +P.duration || 0;
  if (m === 'off') return false;
  if (m === 'on') return d >= MIX_FORCED_MIN;
  return d >= MIX_AUTO_SECONDS;
}

const MINOR = new Set(['minor', 'dorian', 'phrygian', 'harmonic_minor']);
const familyOf = (scale) => (MINOR.has(scale) ? 'minor' : 'major');
// Roue Camelot : numéro (1-12) d'une tonique ; A = mineur, B = majeur. Do majeur = 8B, La mineur = 8A.
export function camelot(pc, scale) {
  const minor = familyOf(scale) === 'minor';
  const ref = minor ? 9 : 0; // La mineur / Do majeur = 8
  const fifths = ((((pc - ref) * 7) % 12) + 12) % 12;
  return `${((8 - 1 + fifths) % 12) + 1}${minor ? 'A' : 'B'}`;
}
const TRANSITION_LABELS = { bassSwap: 'Échange des basses', filter: 'Filtre passe-bas sur la sortie', hpIn: 'Entrée filtrée (passe-haut)', blend: 'Fondu long' };
const BEATLESS = new Set(['ambient', 'cinematic']);
// voisins de sous-style : tableau (n'importe lequel) ou dictionnaire par sous-style courant (tempos compatibles uniquement)
const SUB_NEIGHBOURS = {
  techno: ['detroit', 'minimal', 'industriel'], synthwave: ['outrun', 'dreamwave'],
  hiphop: { boombap: ['boombap', 'lofi'], lofi: ['lofi', 'boombap'], trap: ['trap'] }, // la trap (130-150) ne se mélange pas au boom-bap (85-95)
  dnb: ['liquid', 'neuro', 'jungle'], frenchtouch: ['classic', 'edbanger', 'myd'],
  // v1.11.0 : lo-fi moteur 20 (la lo-fi house, 112-122 BPM, reste seule)
  lofi: { jazzy: ['jazzy', 'chillhop', 'sad'], chillhop: ['chillhop', 'jazzy', 'beatmaker'], sad: ['sad', 'jazzy', 'ambient'], ambient: ['ambient', 'sad'], beatmaker: ['beatmaker', 'chillhop'], lofihouse: ['lofihouse'] },
};
/** Variantes actives dans un mix : French Touch en moteur 19+, lo-fi en moteur 20+ (les anciens mix restent identiques). */
const subKeyOf = (P) => (P.style === 'frenchtouch' ? P.engine >= 19 : P.style === 'lofi' ? P.engine >= 20 : true) && VARIANT_KEY[P.style] || null;
const neighbours = (style, cur) => { const n = SUB_NEIGHBOURS[style]; return Array.isArray(n) ? n : (n && n[cur]) || [cur]; };

/** Courbe d'énergie du set (0..1) : montée, pics, respirations, fin. */
function energyAt(u, peaks, ph) {
  const mid = 0.6 + 0.36 * Math.sin(Math.PI * peaks * Math.min(1, Math.max(0, (u - 0.1) / 0.8)) + ph) ** 2;
  if (u < 0.12) return 0.35 + (mid - 0.35) * (u / 0.12);
  if (u > 0.88) return mid + (0.42 - mid) * ((u - 0.88) / 0.12);
  return mid;
}

/** Grille de tempo globale (temps -> échantillons), interpolée linéairement entre points de contrôle (temps, BPM). */
export class TempoMap {
  constructor(points, totalBeats) {
    this.points = points; this.totalBeats = totalBeats;
    const nb = Math.ceil(totalBeats) + 64;
    this.cum = new Float64Array(nb + 1); this.spbAt = new Float64Array(nb);
    for (let b = 0; b < nb; b++) { this.spbAt[b] = 60 / this.bpmAt(b + 0.5); this.cum[b + 1] = this.cum[b] + this.spbAt[b]; }
  }
  bpmAt(beat) {
    const P = this.points; if (beat <= P[0][0]) return P[0][1];
    for (let i = 1; i < P.length; i++) if (beat <= P[i][0]) { const [b0, v0] = P[i - 1], [b1, v1] = P[i]; return v0 + (v1 - v0) * (beat - b0) / Math.max(1e-9, b1 - b0); }
    return P[P.length - 1][1];
  }
  sec(beat) { const b = Math.max(0, beat), i = Math.min(this.spbAt.length - 1, Math.floor(b)); return this.cum[i] + (b - i) * this.spbAt[i]; }
  sample(beat) { return this.sec(beat) * SR; }
  /** temps (fractionnaire) à l'échantillon s */
  beatAt(s) {
    const t = s / SR, c = this.cum; let lo = 0, hi = c.length - 1;
    if (t <= 0) return 0;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= t) lo = m; else hi = m; }
    return lo + (t - c[lo]) / this.spbAt[Math.min(lo, this.spbAt.length - 1)];
  }
  /** changements de tempo par mesure (export MIDI) : [[temps, bpm], ...] */
  midiTempos(bpb) {
    const out = []; let last = -1;
    for (let b = 0; b < this.totalBeats; b += bpb) { const v = Math.round(this.bpmAt(b + bpb / 2) * 100) / 100; if (Math.abs(v - last) >= 0.05) { out.push([b, v]); last = v; } }
    return out;
  }
}

/**
 * Plan du set : sous-morceaux (decks) + grille de tempo + transitions. Déterministe (graine + réglages).
 * Chaque deck a son propre plan de morceau (planSong) en temps locaux ; il commence au temps global deck.startBeat.
 */
export function planMix(params) {
  const P = resolveParams(params);
  const VL = varietyOf(P);
  // v1.6.3 : variation faible / forte / maximale ; v1.7.0 : mix d'1 h et plus => toujours le planificateur contrasté (titres bien distincts)
  if (VL !== 1 || P.duration >= MIX_CONTRAST_MIN) return planMixVaried(P, params, VL);
  const S = styleDef(P.style, variantOf(P), P.engine);
  const MI = meterInfo(P), bpb = MI.bpb;
  const r = makeRng(hashSeed(P.seed, 'mix', P.style, P.variation));
  const userBpm = Number.isFinite(+params.bpm) && +params.bpm > 0;
  const base = P.bpm;
  const beatless = BEATLESS.has(P.style) || !P.instruments.drums;
  // dérive de tempo : quelques BPM qui suivent l'énergie + une légère tendance à accélérer
  const amp = P.style === 'techno' || P.style === 'house' ? 4 : beatless || P.style === 'dnb' ? 2 : 3;
  const peaks = Math.max(1, Math.min(4, Math.round(P.duration / 3600 * 1.2))), ph = r.range(-0.25, 0.25);
  const trend = r.range(0.5, 2) * (userBpm ? 0.5 : 1);
  const bpmOfU = (u) => {
    const e = energyAt(u, peaks, ph);
    const v = base + amp * (e - 0.7) / 0.35 + trend * (u - 0.5);
    return Math.min(LIMITS.maxBpm, Math.max(LIMITS.minBpm, Math.min(base + amp + 1, Math.max(base - amp - 1, v))));
  };
  const music = P.duration - RENDER_TAIL;
  let meanSpb = 0; for (let k = 0; k < 400; k++) meanSpb += 60 / bpmOfU((k + 0.5) / 400) / 400;
  const totalBars = Math.max(16, Math.round(music / meanSpb / bpb / 4) * 4); // multiple de 4 : chaque deck garde des blocs de 4 mesures
  const totalBeats = totalBars * bpb;
  const ctrl = []; for (let k = 0; k <= 48; k++) ctrl.push([totalBeats * k / 48, bpmOfU(k / 48)]);
  const tempo = new TempoMap(ctrl, totalBeats);
  const barsAt = (sec, atBeat) => sec / (bpb * 60 / tempo.bpmAt(atBeat));

  // --- découpage en sous-morceaux (4 à 8 min) et chevauchements (16 à 32 mesures)
  const avgMin = r.range(5, 6.5);
  let n = Math.max(2, Math.round(music / 60 / (avgMin - 0.35)));
  const decks = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    decks.length = 0;
    const w = Array.from({ length: n }, () => r.range(4.3, 7.6));
    const X = Array.from({ length: n - 1 }, () => (beatless ? r.pick([24, 32]) : r.pick([16, 16, 24, 32])));
    const sumW = w.reduce((a, b) => a + b, 0);
    // longueur visible (hors chevauchement) répartie au prorata, en mesures (multiples de 8)
    let bar = 0;
    for (let i = 0; i < n; i++) {
      const xin = i ? X[i - 1] : 0, xout = i < n - 1 ? X[i] : 0;
      const share = (w[i] / sumW) * totalBars;
      let len = Math.max(48, Math.round((share + xout) / 8) * 8);
      if (i === n - 1) len = totalBars - bar;
      decks.push({ index: i, startBar: bar, bars: len, xin, xout });
      bar += len - xout;
    }
    const last = decks[n - 1];
    if (last.bars >= 40 && last.bars <= Math.max(96, barsAt(9 * 60, last.startBar * bpb))) break;
    if (last.bars < 40) n = Math.max(2, n - 1);
  }
  // --- tonalités compatibles (Camelot), sous-styles voisins, énergie, sons
  const fixedScale = SCALES[params.scale] ? params.scale : null;
  const scaleNames = Object.keys(S.scales), scaleW = scaleNames.map((k) => S.scales[k]);
  let pc = NOTE_NAMES.indexOf(P.key), scale = P.scale, keyDir = 7;
  const subKey = subKeyOf(P); // French Touch : variantes en moteur 19 seulement ; lo-fi : moteur 20
  const userSub = subKey ? P.adv[subKey] : null;
  const baseSub = subKey ? variantOf(P) : null;
  const ttypes = beatless ? ['blend'] : ['bassSwap', 'bassSwap', 'filter', 'hpIn'];
  for (const d of decks) {
    const i = d.index, rd = makeRng(hashSeed(P.seed, 'mixdeck', P.style, P.variation, i));
    d.seed = hashSeed(P.seed, 'deck', i) % 2147483647;
    const mid = (d.startBar + d.bars / 2) * bpb, u = mid / totalBeats;
    d.energy = Math.min(1, Math.max(0.2, energyAt(u, peaks, ph) + rd.range(-0.05, 0.05)));
    if (i === 0) keyDir = rd.chance(0.5) ? 7 : 5;
    if (i > 0) {
      const prevFam = familyOf(scale);
      let next = fixedScale || rd.weighted(scaleNames, scaleW);
      if (!fixedScale && rd.chance(0.35)) next = scale; // parfois le même mode
      if (familyOf(next) !== prevFam) pc = (pc + (prevFam === 'minor' ? 3 : 9)) % 12; // relatif (même numéro Camelot)
      else {
        const rising = d.energy > decks[i - 1].energy + 0.08;
        // même clé, ±1 Camelot (sens de rotation persistant : le set voyage sur la roue au lieu d'osciller), +2 (montée d'énergie)
        const mv = rd.weighted([0, 7, 5, 2], [0.45, keyDir === 7 ? 3 : 0.9, keyDir === 5 ? 3 : 0.9, rising ? 0.9 : 0.15]);
        if (mv === 7 || mv === 5) keyDir = mv;
        pc = (pc + mv) % 12;
      }
      scale = next;
    }
    d.key = NOTE_NAMES[pc]; d.scale = scale; d.camelot = camelot(pc, scale);
    d.keyLabel = `${NOTE_NAMES_FR[pc]} ${SCALES[scale].label.split(' (')[0].toLowerCase()}`;
    d.sub = subKey ? (userSub || (i === 0 || rd.chance(0.6) ? baseSub : rd.pick(neighbours(P.style, baseSub)))) : null;
    d.startBeat = d.startBar * bpb; d.endBeat = d.startBeat + d.bars * bpb;
    d.bpm = Math.round(tempo.bpmAt(mid));
    d.bpmIn = +tempo.bpmAt(d.startBeat).toFixed(1); d.bpmOut = +tempo.bpmAt(d.endBeat).toFixed(1);
    d.transition = d.xout ? rd.pick(ttypes) : null;
    const adv = { ...P.adv, mix: null };
    const U = P.adv.energy;
    adv.energy = Math.round(U == null ? 15 + 80 * d.energy : Math.min(100, Math.max(0, U + (d.energy - 0.7) * 40)));
    if (subKey) adv[subKey] = d.sub;
    const barSec = bpb * 60 / d.bpm;
    d.params = { style: P.style, seed: d.seed, variation: P.variation, mood: P.mood, key: d.key, scale: d.scale, bpm: d.bpm, duration: d.bars * barSec + RENDER_TAIL, instruments: P.instruments, wav: P.wav, adv, ...(P.engine ? { engine: P.engine } : {}) };
    d.opts = { intro: i === 0 ? 8 : 16, outro: i === decks.length - 1 ? 8 : 16, djIn: i > 0 && !beatless, djOut: i < decks.length - 1 && !beatless };
    d.name = makeTitle(d.seed, 0, P.style + ':deck');
    d.startSec = tempo.sec(d.startBeat); d.endSec = tempo.sec(d.endBeat);
  }
  // début de chapitre = moment où le deck entrant prend la main (échange des basses, milieu du fondu)
  for (const d of decks) d.chapterSec = d.index === 0 ? 0 : tempo.sec(d.startBeat + (d.xin * bpb) / 2);
  const fmt = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
  const tracklist = decks.map((d) => ({
    index: d.index, name: d.name, start: +d.chapterSec.toFixed(2), time: fmt(d.chapterSec), deckStart: +d.startSec.toFixed(2), deckEnd: +d.endSec.toFixed(2),
    key: d.key, scale: d.scale, keyLabel: d.keyLabel, camelot: d.camelot, bpm: d.bpm, bpmIn: d.bpmIn, bpmOut: d.bpmOut, bars: d.bars,
    energy: +d.energy.toFixed(2), sub: d.sub, seed: d.seed, transitionOut: d.transition ? { type: d.transition, label: TRANSITION_LABELS[d.transition], bars: d.xout } : null,
  }));
  return { params: P, decks, tempo, totalBars, totalBeats, bpb, MI, tracklist, peaks };
}

// ---------------------------------------------------------------------------------------------------------------
// v1.6.3 : niveau de variation des mix (faible / forte / maximale ; « moyenne » = planMix historique ci-dessus).
// Faible : même sous-style, tempo et tonalité proches, mêmes sons, énergie stable (concentration, sommeil).
// Forte / maximale : rotation des sous-styles (boom-bap → lo-fi → trap, liquid → neuro → jungle…), voyages de
// tempo (rampes ≤ 7 % par titre) et de tonalité (Camelot), sons / kits / pianos / ambiances qui changent, arc
// d'énergie plus marqué, anti-répétition (aucun titre ne reprend la progression, les sons et le kit d'un voisin).
// La trap (130-150) se cale en demi-temps sur la grille du boom-bap / lo-fi (65-75) : rapport 2 (deck.ratio).
const SUBS = { techno: ['detroit', 'minimal', 'industriel'], synthwave: ['outrun', 'dreamwave'], hiphop: ['boombap', 'lofi', 'trap'], dnb: ['liquid', 'neuro', 'jungle'], frenchtouch: ['classic', 'edbanger', 'myd'], lofi: ['jazzy', 'chillhop', 'sad', 'ambient', 'beatmaker', 'lofihouse'] };
// styles voisins (option « Autoriser d'autres styles proches ») : style:sous-style
const RELATED = {
  'lofi:': ['hiphop:lofi', 'hiphop:boombap'], 'hiphop:lofi': ['lofi:'], 'hiphop:boombap': ['lofi:'], 'hiphop:trap': ['trap:'], 'trap:': ['hiphop:trap', 'hiphop:lofi'],
  'house:': ['techno:minimal', 'techno:detroit'], 'techno:minimal': ['house:'], 'techno:detroit': ['house:'],
  'ambient:': ['cinematic:'], 'cinematic:': ['ambient:'], 'synthwave:dreamwave': [], 'synthwave:outrun': [],
  'frenchtouch:': ['house:'],
};
// v1.8.0 : voisinages ajoutés en moteur 1.8 seulement (les mix existants restent identiques)
const RELATED18 = { 'house:': ['frenchtouch:'] };
// v1.7.0 : contraste entre titres d'un mix (dès 1 h, Moyenne comprise) — kits compatibles par style / variante
export const MIX_CONTRAST_MIN = 3600;
const KITS = {
  hiphop_boombap: ['boombap', 'tr808', 'hhlofi'], hiphop_lofi: ['hhlofi', 'lofi', 'boombap'], hiphop_trap: ['trap', 'tr808'], trap: ['trap', 'tr808'],
  lofi: ['lofi', 'hhlofi', 'soft', 'boombap'], house: ['house', 'tr909', 'tr808'], techno: ['tr909', 'techno', 'tr808'],
  dnb_liquid: ['dnb', 'break'], dnb_neuro: ['dnb', 'break'], dnb_jungle: ['break', 'dnb'], synthwave: ['retro', 'tr808'], ambient: ['soft', 'cinema'], cinematic: ['cinema', 'soft'], chiptune: ['chip'],
};
// v1.8.0 : moteur 1.8 — boîtes à rythmes supplémentaires (TR-606/707, DR-110) dans la rotation des titres
const KITS18 = {
  ...KITS, lofi: ['lofi', 'hhlofi', 'dr110', 'boombap'], hiphop_lofi: ['hhlofi', 'lofi', 'dr110'], house: ['house', 'tr909', 'tr707', 'tr808'],
  techno: ['tr909', 'techno', 'tr606', 'tr808'], synthwave: ['retro', 'tr707', 'tr808'], frenchtouch: ['tr909', 'tr707'],
};
// v1.11.0 : kits par sous-genre lo-fi (moteur 20)
const KITS20 = Object.fromEntries(Object.entries(POOLS20).map(([k, v]) => [k, [...new Set(v.kits)]]));
const STRUCTS = ['classique', 'edm', 'progressive', 'chanson'];
const profOf = (n) => (n.style === 'hiphop' || n.style === 'dnb' ? `${n.style}_${n.sub || (n.style === 'hiphop' ? 'boombap' : 'liquid')}` : n.style === 'lofi' && n.sub ? `lofi_${n.sub}` : n.style);
const uniqList = (a) => [...new Set(a)];
/** Choix différent des derniers titres (2 derniers si assez de choix, sinon le dernier). */
const pickNew = (r, opts, hist) => { const o = uniqList(opts); if (o.length < 2) return o[0]; const avoid = hist.slice(o.length >= 4 ? -2 : -1); const c = o.filter((x) => !avoid.includes(x)); return r.pick(c.length ? c : o); };
const MOOD_ROTATION = ['auto', 'chill', 'nocturne', 'reveur', 'urbain', 'hypnotique', 'solaire', 'melancolique', 'nostalgique', 'aerien', 'pluvieux'];
const PIANOS = ['steinway', 'salamander', 'upright'];
const nodeId = (n) => `${n.style}:${n.sub || ''}`;
const parseNode = (id) => { const [style, sub] = id.split(':'); return { style, sub: sub || null }; };
const isTrap = (n) => n.style === 'trap' || (n.style === 'hiphop' && n.sub === 'trap');
function nodeRange(n) {
  if (n.style === 'techno') return TECHNO_BPM[n.sub || 'detroit'];
  if (n.style === 'synthwave') return SYNTH_BPM[n.sub || 'outrun'];
  const S = STYLES[n.style]; return (n.sub && S.subs?.[n.sub]?.bpm) || S.bpm;
}

function planMixVaried(P, params, VL) {
  const S = styleDef(P.style, variantOf(P), P.engine);
  const MI = meterInfo(P), bpb = MI.bpb;
  const r = makeRng(hashSeed(P.seed, 'mixv', P.style, P.variation, VL));
  const userBpm = Number.isFinite(+params.bpm) && +params.bpm > 0;
  const beatless = BEATLESS.has(P.style) || !P.instruments.drums;
  const related = VL >= 1 && P.adv.mixStyles === 'related' && P.instruments.drums !== false;
  const subKey = subKeyOf(P); // French Touch : variantes en moteur 19 seulement ; lo-fi : moteur 20
  const userSub = subKey ? P.adv[subKey] : null;
  const base = { style: P.style, sub: subKey ? variantOf(P) : null };
  const peaks = Math.max(1, Math.min(4, Math.round(P.duration / 3600 * (VL === 0 ? 0.6 : VL === 3 ? 1.8 : 1.5)))), ph = r.range(-0.25, 0.25);
  const eK = [0.35, 1, 1.25, 1.45][VL];
  const energyOf = (u) => Math.min(1, Math.max(0.2, 0.62 + (energyAt(u, peaks, ph) - 0.62) * eK));
  // --- graphe des enchaînements possibles (sous-styles du style + styles voisins si autorisés)
  const nexts = (n) => {
    const out = [];
    if (n.style === P.style && subKey && !userSub) for (const s of SUBS[P.style]) out.push({ style: P.style, sub: s });
    if (related) {
      // depuis un style voisin, on ne peut que revenir vers le style de départ (jamais de voisin de voisin)
      for (const id of [...(RELATED[nodeId(n)] || (n.style === 'lofi' && n.sub ? RELATED['lofi:'] : [])), ...(P.engine >= 18 ? RELATED18[nodeId(n)] || [] : [])]) { const x = parseNode(id); if (x.style === 'lofi' && subKey && !x.sub) x.sub = base.sub; if (n.style === P.style || x.style === P.style) out.push(x); }
      if (n.style !== P.style) out.push(base);
    }
    // v1.7.0 : en « Moyenne » (mix ≥ 1 h), mêmes voisinages qu'avant : la trap reste seule (pas de demi-temps)
    return out.filter((x) => nodeId(x) !== nodeId(n) && (VL >= 2 || related || isTrap(x) === isTrap(n)));
  };
  // demi-temps : la trap se cale sur la grille des tempos hip-hop / lo-fi quand le mix peut en contenir
  const canHalf = VL >= 1 && (isTrap(base) ? nexts(base).some((x) => !isTrap(x)) || (related && nexts(base).length > 0) : true);
  const ratioOf = (n) => (isTrap(n) && canHalf ? 2 : 1);
  const gridRange = (n) => { const R = nodeRange(n), k = ratioOf(n); return [R[0] / k, R[1] / k]; };
  const music = P.duration - RENDER_TAIL;
  const avgMin = VL === 0 ? r.range(5.5, 7) : VL === 3 ? r.range(4.5, 5.8) : r.range(4.8, 6.3);
  const n0 = Math.max(2, Math.round(music / 60 / (avgMin - 0.35)));
  const layoutSeed = hashSeed(P.seed, 'mixv-layout', P.style, P.variation, VL);
  const layout = (totalBars, barsAt) => {
    const rl = makeRng(layoutSeed); let n = n0; const decks = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      decks.length = 0;
      const w = Array.from({ length: n }, () => rl.range(4.3, 7.6));
      const X = Array.from({ length: n - 1 }, () => (beatless || VL === 0 ? rl.pick([24, 32]) : rl.pick([16, 16, 24, 32])));
      const sumW = w.reduce((a, b) => a + b, 0); let bar = 0;
      for (let i = 0; i < n; i++) {
        const xin = i ? X[i - 1] : 0, xout = i < n - 1 ? X[i] : 0;
        let len = Math.max(48, Math.round(((w[i] / sumW) * totalBars + xout) / 8) * 8);
        if (i === n - 1) len = totalBars - bar;
        decks.push({ index: i, startBar: bar, bars: len, xin, xout }); bar += len - xout;
      }
      const last = decks[n - 1];
      if (last.bars >= 40 && last.bars <= Math.max(96, barsAt(9 * 60, last.startBar * bpb))) break;
      if (last.bars < 40) n = Math.max(2, n - 1);
    }
    return decks;
  };
  // --- séquence des titres : nœud (style / sous-style), énergie, tempo cible sur la grille
  const sequence = (decks, totalBars) => {
    const rs = makeRng(hashSeed(P.seed, 'mixv-seq', P.style, P.variation, VL));
    const seq = []; const used = {};
    // nœuds atteignables (parcours du graphe) : la variation forte / maximale va chercher ceux qui n'ont pas encore joué
    const all = [base]; for (let k = 0; k < all.length; k++) for (const x of nexts(all[k])) if (!all.some((y) => nodeId(y) === nodeId(x))) all.push(x);
    const dist = (R, t) => (t < R[0] ? R[0] - t : t > R[1] ? t - R[1] : 0);
    for (const d of decks) {
      const i = d.index, u = (d.startBar + d.bars / 2) / totalBars; let e = energyOf(u) + rs.range(-0.04, 0.04);
      const AP = planAt(P.aiPlan, u); // v1.9.0 : plan du directeur artistique (énergie, sous-style, ambiance par titre)
      if (AP && AP.energy != null) e += 0.2 + 0.8 * AP.energy / 100 - energyOf(u);
      // v1.7.0 : deux titres voisins n'ont jamais la même énergie (écart ≥ 0,1 hors Faible)
      if (VL >= 1 && i > 0 && Math.abs(e - seq[i - 1].energy) < 0.1) { const pe = seq[i - 1].energy, up = e >= pe ? pe + 0.12 <= 1 : pe - 0.12 < 0.2; e = up ? pe + 0.12 : pe - 0.12; }
      let node = base, target;
      if (i === 0) target = P.bpm / ratioOf(base);
      else {
        const prev = seq[i - 1], lo = prev.target * 0.93, hi = prev.target * 1.07;
        const reach = (n) => { const R = gridRange(n); return R[0] <= hi && R[1] >= lo; };
        const foreignOk = i < decks.length - 2 && seq.filter((x) => x.node.style !== P.style).length < Math.max(1, i * 0.3); // styles voisins : ~30 % des titres au plus, jamais en fin de mix
        const cands = VL === 0 ? [] : nexts(prev.node).filter(reach).filter((x) => foreignOk || x.style === P.style).filter((x) => i < 2 || nodeId(x) !== nodeId(seq[i - 2].node) || rs.chance(0.25));
        const pSwitch = VL === 3 ? 0.9 : 0.55;
        // objectif : un nœud encore absent (ou le moins joué) ; s'il est hors de portée, on s'en rapproche par paliers
        const fresh = all.filter((x) => !used[nodeId(x)] && (foreignOk || x.style === P.style));
        // dans un style voisin, l'objectif est le retour au style de départ
        const home = prev.node.style !== P.style ? all.filter((x) => x.style === P.style).sort((a, b) => dist(gridRange(a), prev.target) - dist(gridRange(b), prev.target))[0] : null;
        const goal = home || (VL >= 2 && fresh.length && rs.chance(VL === 3 ? 0.85 : 0.5) ? rs.pick(fresh) : null);
        if (goal && reach(goal) && nexts(prev.node).some((x) => nodeId(x) === nodeId(goal))) node = goal;
        else if (cands.length && rs.chance(pSwitch)) {
          const w = cands.map((x) => 1 / (1 + (used[nodeId(x)] || 0)) * (x.style !== P.style ? 0.6 : 1) * (goal ? 1 / (1 + dist(gridRange(goal), (gridRange(x)[0] + gridRange(x)[1]) / 2) / 4) : 1));
          node = rs.weighted(cands, w);
        } else node = prev.node;
        // le mix doit retrouver son style de départ : un style voisin ne dure qu'un titre (rarement deux)
        if (node.style !== P.style && (!foreignOk || prev.node.style !== P.style && rs.chance(0.8))) { const back = nexts(prev.node).filter((x) => x.style === P.style && reach(x)); if (back.length) node = rs.pick(back); }
        if (AP && AP.sub && subKey && !userSub && node.style === P.style && nodeId(node) !== `${P.style}:${AP.sub}`) { const want = { style: P.style, sub: AP.sub }; if (reach(want)) node = want; }
        const R = gridRange(node);
        if (VL === 0) target = Math.min(R[1], Math.max(R[0], seq[0].target + 1.5 * (e - 0.62) / 0.35));
        else {
          const span = VL === 3 ? [0, 1] : [0.2, 0.8];
          const want = R[0] + (R[1] - R[0]) * (span[0] + (span[1] - span[0]) * Math.min(1, Math.max(0, (e - 0.3) / 0.65)));
          const G = goal && nodeId(goal) !== nodeId(node) ? gridRange(goal) : null;
          target = Math.min(hi, Math.max(lo, G ? (G[1] < R[0] + 0.5 ? R[0] : G[0] > R[1] - 0.5 ? R[1] : want) : want)); // palier vers l'objectif
          target = Math.min(R[1] + 1, Math.max(R[0] - 1, target));
          // v1.7.0 : tempo audible d'un titre à l'autre (≥ 3 %), toujours mixable (≤ 7 %, transitions calées)
          if (Math.abs(target / prev.target - 1) < 0.03) {
            const dir = target >= prev.target ? 1 : -1, k = rs.range(0.035, 0.055);
            const ok = (x) => x >= Math.max(R[0] - 1, lo) && x <= Math.min(R[1] + 1, hi);
            const a = prev.target * (1 + dir * k), b = prev.target * (1 - dir * k);
            if (ok(a)) target = a; else if (ok(b)) target = b;
          }
        }
      }
      if (userBpm && VL === 0) target = P.bpm / ratioOf(node);
      target = Math.min(LIMITS.maxBpm / ratioOf(node), Math.max(LIMITS.minBpm, target));
      used[nodeId(node)] = (used[nodeId(node)] || 0) + 1;
      seq.push({ node, target, energy: Math.min(1, Math.max(0.2, e)), ratio: ratioOf(node) });
    }
    // trap seule (aucune autre étape possible) : pas de demi-temps
    if (seq.every((x) => x.ratio === 2)) for (const x of seq) { x.ratio = 1; x.target *= 2; }
    return seq;
  };
  // --- itérations : découpage → séquence → grille de tempo → nombre de mesures (converge en 1-3 tours)
  let totalBars = Math.max(16, Math.round(music / (60 / (P.bpm / ratioOf(base))) / bpb / 4) * 4), decks, seq, tempo, totalBeats;
  for (let it = 0; it < 4; it++) {
    const flat = (sec) => sec / (bpb * 60 / (P.bpm / ratioOf(base)));
    decks = layout(totalBars, tempo ? (sec, atBeat) => sec / (bpb * 60 / tempo.bpmAt(atBeat)) : flat);
    seq = sequence(decks, totalBars);
    totalBeats = totalBars * bpb;
    const ctrl = decks.map((d, i) => [(d.startBar + d.bars / 2) * bpb, seq[i].target]);
    ctrl.unshift([0, seq[0].target]); ctrl.push([totalBeats, seq[seq.length - 1].target]);
    tempo = new TempoMap(ctrl, totalBeats);
    const nb = Math.max(16, Math.round(music / (tempo.sec(totalBeats) / totalBars) / 4) * 4);
    if (nb === totalBars) break;
    totalBars = nb;
  }
  if (totalBeats !== totalBars * bpb || decks.length !== seq.length) { totalBeats = totalBars * bpb; decks = layout(totalBars, (sec, atBeat) => sec / (bpb * 60 / tempo.bpmAt(atBeat))); seq = sequence(decks, totalBars); }
  // grille finale (recalée pour tomber exactement sur la durée demandée : ±quelques % de tempo au plus)
  { const mk = (f) => { const c = decks.map((d, i) => [(d.startBar + d.bars / 2) * bpb, seq[i].target * f]); c.unshift([0, seq[0].target * f]); c.push([totalBeats, seq[seq.length - 1].target * f]); return new TempoMap(c, totalBeats); };
    tempo = mk(1); const f = tempo.sec(totalBeats) / music; if (Math.abs(f - 1) > 0.001) { tempo = mk(f); for (const q of seq) q.target *= f; } }

  // --- tonalités (Camelot), sons, ambiances, transitions
  const fixedScale = SCALES[params.scale] ? params.scale : null;
  let pc = NOTE_NAMES.indexOf(P.key), scale = P.scale, keyDir = 7;
  const ttypes = beatless ? ['blend'] : VL === 0 ? ['blend', 'bassSwap', 'bassSwap'] : VL === 3 ? ['bassSwap', 'filter', 'hpIn', 'blend', 'bassSwap'] : ['bassSwap', 'bassSwap', 'filter', 'hpIn'];
  let palette = null; const recent = []; const contrast = [];
  let mood = P.mood;
  for (const d of decks) {
    const i = d.index, q = seq[i], node = q.node, rd = makeRng(hashSeed(P.seed, 'mixvdeck', P.style, P.variation, VL, i));
    const SN = styleDef(node.style, node.sub, P.engine);
    d.energy = q.energy; d.ratio = q.ratio; d.style = node.style; d.sub = node.sub;
    if (i === 0) keyDir = rd.chance(0.5) ? 7 : 5;
    if (i > 0) {
      const prevFam = familyOf(scale);
      const names = Object.keys(SN.scales), wts = names.map((k) => SN.scales[k]);
      let next = fixedScale || rd.weighted(names, wts);
      if (!fixedScale && rd.chance([0.85, 0, 0.3, 0.2][VL])) next = scale;
      if (familyOf(next) !== prevFam) pc = (pc + (prevFam === 'minor' ? 3 : 9)) % 12; // relatif (même numéro Camelot)
      else {
        const rising = d.energy > decks[i - 1].energy + 0.06;
        const W = VL === 0 ? [3, 0.35, 0.35, 0] : VL === 1 ? [0, keyDir === 7 ? 2 : 1.4, keyDir === 5 ? 2 : 1.4, rising ? 1.2 : 0.4] : VL === 2 ? [0.25, keyDir === 7 ? 2.5 : 1, keyDir === 5 ? 2.5 : 1, rising ? 1.2 : 0.35] : [0.05, keyDir === 7 ? 2 : 1.2, keyDir === 5 ? 2 : 1.2, rising ? 1.6 : 0.7];
        const mv = rd.weighted([0, 7, 5, 2], W);
        if (mv === 7 || mv === 5) keyDir = mv;
        pc = (pc + mv) % 12;
      }
      scale = next;
    }
    d.key = NOTE_NAMES[pc]; d.scale = scale; d.camelot = camelot(pc, scale);
    d.keyLabel = `${NOTE_NAMES_FR[pc]} ${SCALES[scale].label.split(' (')[0].toLowerCase()}`;
    d.startBeat = d.startBar * bpb; d.endBeat = d.startBeat + d.bars * bpb;
    const mid = (d.startBar + d.bars / 2) * bpb;
    d.bpm = Math.round(tempo.bpmAt(mid) * d.ratio);
    d.bpmIn = +(tempo.bpmAt(d.startBeat) * d.ratio).toFixed(1); d.bpmOut = +(tempo.bpmAt(d.endBeat) * d.ratio).toFixed(1);
    d.gridBpm = +tempo.bpmAt(mid).toFixed(1);
    d.transition = d.xout ? rd.pick(ttypes) : null;
    // ambiance : rotation (maximale : à chaque titre ; forte : de temps en temps) si l'ambiance est en « auto »
    if (i > 0 && P.mood === 'auto' && VL >= 2 && (VL === 3 || rd.chance(0.35))) mood = rd.pick(MOOD_ROTATION.filter((m) => m !== mood));
    d.mood = i === 0 ? P.mood : VL >= 2 ? mood : P.mood;
    { const AP = planAt(P.aiPlan, (d.startBar + d.bars / 2) / totalBars); if (AP?.mood && node.style === P.style) d.mood = AP.mood; }
    const adv = { ...P.adv, mix: null };
    for (const k of Object.values(VARIANT_KEY)) if (k !== VARIANT_KEY[node.style]) adv[k] = null;
    const U = P.adv.energy;
    adv.energy = Math.round(U == null ? 15 + 80 * d.energy : Math.min(100, Math.max(0, U + (d.energy - 0.7) * 40)));
    if (VARIANT_KEY[node.style]) adv[VARIANT_KEY[node.style]] = node.sub;
    if (VL === 3 && !P.adv.pianoSound) adv.pianoSound = PIANOS[(hashSeed(P.seed, 'mixpiano') + i) % PIANOS.length];
    if (VL === 0 && palette) { for (const [k, v] of Object.entries(palette)) if (P.adv[k] == null) adv[k] = v; }
    // instruments : ceux choisis pour le mix ; un style voisin garde ses instruments par défaut sauf réglage modifié
    let instruments = P.instruments;
    if (node.style !== P.style) { const D0 = STYLES[P.style].defaults, D1 = STYLES[node.style].defaults; instruments = {}; for (const k of Object.keys(P.instruments)) instruments[k] = P.instruments[k] !== !!D0[k] ? P.instruments[k] : !!D1[k]; }
    // v1.7.0 : contraste — sons, kit, groove, structure, timbre et arpège différents du titre précédent (réglages laissés en auto seulement)
    {
      const rc = makeRng(hashSeed(P.seed, 'mixc', P.style, P.variation, VL, i)), PL = P.engine >= 18 ? MIX_POOLS18 : MIX_POOLS, pool = (P.engine >= 20 && POOLS20[profOf(node)]) || PL[profOf(node)] || PL[node.style], KT = P.engine >= 18 ? { ...(P.engine >= 20 ? KITS20 : {}), ...KITS18 } : KITS;
      const H = (k) => contrast.map((c) => c[k]).filter((x) => x != null);
      const C = {};
      const set = (k, v) => { if (P.adv[k] == null && v != null) { adv[k] = v; C[k] = v; } };
      set('drumPattern', pickNew(rc, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((x) => !H('drumPattern').slice(-3).includes(x)), []));
      set('structure', VL === 0 ? STRUCTS[i % 2 ? 2 : 0] : pickNew(rc, STRUCTS, H('structure')));
      if (VL >= 1 && pool) {
        set('chordPatch', pickNew(rc, pool.chords, H('chordPatch')));
        set('leadPatch', pickNew(rc, pool.lead.filter((x) => x !== C.chordPatch), H('leadPatch')));
        set('bassPatch', pickNew(rc, pool.bass.filter((x) => x in ADVANCED.bassPatch.options), H('bassPatch')));
        if (!beatless && KT[profOf(node)]) set('drumKit', pickNew(rc, KT[profOf(node)], H('drumKit')));
        set('pianoSound', pickNew(rc, PIANOS, H('pianoSound')));
        set('brightness', pickNew(rc, [32, 52, 74], H('brightness')));
        set('space', pickNew(rc, [24, 46, 70], H('space')));
      }
      C.arp = instruments.arp;
      if (VL >= 1 && i > 0) {
        const D = STYLES[node.style].defaults, custom = Object.keys(D).some((k) => k in instruments && !!instruments[k] !== !!D[k]);
        const pa = contrast[i - 1].arp;
        if (!custom && pa === !!instruments.arp && rc.chance([0, 0.55, 0.65, 0.75][VL])) { instruments = { ...instruments, arp: !pa }; C.arp = !pa; }
      }
      contrast.push(C);
    }
    const barSec = bpb * 60 / d.bpm;
    const mk = (seed) => ({ style: node.style, seed, variation: P.variation, mood: d.mood, key: d.key, scale: d.scale, bpm: d.bpm, duration: d.bars * d.ratio * barSec + RENDER_TAIL, instruments, wav: P.wav, adv, ...(P.engine ? { engine: P.engine } : {}) });
    d.opts = { intro: (i === 0 ? 8 : 16) * d.ratio, outro: (i === decks.length - 1 ? 8 : 16) * d.ratio, djIn: i > 0 && !beatless, djOut: i < decks.length - 1 && !beatless };
    // anti-répétition (forte / maximale) : un titre ne reprend pas la progression, le son d'accords et le kit des titres récents
    let seed = hashSeed(P.seed, 'deck', i) % 2147483647, sig = null;
    for (let k = 0; k < 4; k++) {
      d.seed = seed; d.params = mk(seed);
      let pl = planSong(d.params, { mix: d.opts });
      // une structure imposée qui ne tombe pas pile sur la longueur du deck est abandonnée (calage des transitions)
      if (contrast[i] && contrast[i].structure && pl.totalBars !== d.bars * d.ratio) { delete adv.structure; delete contrast[i].structure; d.params = mk(seed); pl = planSong(d.params, { mix: d.opts }); }
      sig = { prog: pl.meta.progressions.A.join(' '), chords: pl.S.patches.chords, kit: pl.S.drums.kit, lead: pl.S.patches.lead };
      if (VL === 0 && i === 0) { palette = { chordPatch: pl.S.patches.chords, leadPatch: pl.S.patches.lead, pianoSound: pl.F.pianoSound, ...(pl.S.drums.kit in ADVANCED.drumKit.options ? { drumKit: pl.S.drums.kit } : {}), ...(pl.S.patches.bass in ADVANCED.bassPatch.options ? { bassPatch: pl.S.patches.bass } : {}) }; break; }
      const clash = VL < 2 ? recent.slice(-3).some((x) => x.prog === sig.prog) : recent.some((x) => x.prog === sig.prog) || (recent.length && (VL === 3 ? recent[recent.length - 1].chords === sig.chords || recent[recent.length - 1].kit === sig.kit && recent[recent.length - 1].lead === sig.lead : recent[recent.length - 1].chords === sig.chords && recent[recent.length - 1].kit === sig.kit));
      if (!clash && (pl.totalBars === d.bars * d.ratio || !contrast[i])) break;
      seed = hashSeed(P.seed, 'deck', i, 'alt', k) % 2147483647;
    }
    if (sig) { recent.push(sig); if (recent.length > (VL === 3 ? 6 : 3)) recent.shift(); }
    d.contrast = contrast[i];
    d.name = makeTitle(d.seed, 0, P.style + ':deck');
    d.startSec = tempo.sec(d.startBeat); d.endSec = tempo.sec(d.endBeat);
  }
  for (const d of decks) d.chapterSec = d.index === 0 ? 0 : tempo.sec(d.startBeat + (d.xin * bpb) / 2);
  const tracklist = decks.map((d) => ({
    index: d.index, name: d.name, start: +d.chapterSec.toFixed(2), time: fmtTime(d.chapterSec), deckStart: +d.startSec.toFixed(2), deckEnd: +d.endSec.toFixed(2),
    key: d.key, scale: d.scale, keyLabel: d.keyLabel, camelot: d.camelot, bpm: d.bpm, bpmIn: d.bpmIn, bpmOut: d.bpmOut, bars: d.bars,
    energy: +d.energy.toFixed(2), sub: d.sub, seed: d.seed, transitionOut: d.transition ? { type: d.transition, label: TRANSITION_LABELS[d.transition], bars: d.xout } : null,
    ...(d.style !== P.style ? { style: d.style } : {}), ...(d.ratio !== 1 ? { halftime: true, gridBpm: d.gridBpm } : {}), ...(d.mood !== P.mood ? { mood: d.mood } : {}),
  }));
  return { params: P, decks, tempo, totalBars, totalBeats, bpb, MI, tracklist, peaks, variety: VL };
}

const fmtTime = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };

/** Plan complet d'un deck (planSong avec intro/outro mixables). */
export function deckPlan(d) {
  const plan = planSong(d.params, { mix: d.opts });
  plan.bpb = meterInfo(plan.params).bpb;
  return plan;
}

export const TRANSITIONS = TRANSITION_LABELS;
