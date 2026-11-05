// Techno « jouée » sur la 909 (esthétique Detroit / minimale / industrielle — aucun morceau ni motif repris) :
// boucles courtes et hypnotiques, batterie qui mute en permanence comme un jeu live sur la machine
// (mutes / unmutes toutes les 4-8-16 mesures, accents et ouverture de charley automatisés, roulements de 16es,
// fills de toms, variations clap / rim, coupures de grosse caisse), stabs d'accords mineurs façon Detroit.
import { makeRng, hashSeed } from './rng.js';

export const TECHNO_STYLES = { detroit: 'Detroit (stabs, 909 live)', minimal: 'Minimale (boucles sèches)', industriel: 'Industrielle (dure, saturée)' };
export const TECHNO_BPM = { detroit: [130, 140], minimal: [126, 133], industriel: [136, 146] };

const VOICES = ['kick', 'hat', 'ohat', 'ride', 'clap', 'rim', 'snare', 'perc'];

function initState(r, sub) {
  const st = { hatMode: r.pick(sub === 'minimal' ? ['8', 'off16', 'roll'] : ['roll', 'roll', 'off16', '8']), mute: {}, rim: [], snare: [], perc: [], kickVar: 0, hatPhase: r() * 6.28, clapOn: sub !== 'minimal' };
  for (const v of VOICES) st.mute[v] = !['kick', 'hat'].includes(v);
  st.mute.ohat = r.chance(0.4);
  st.rim = Array.from({ length: 16 }, (_, i) => (i % 4 !== 0 && r.chance(sub === 'minimal' ? 0.28 : 0.18) ? 1 : 0));
  st.snare = Array.from({ length: 16 }, (_, i) => (i % 4 === 3 || i % 4 === 1) && r.chance(0.2) ? 1 : 0);
  st.perc = Array.from({ length: 16 }, (_, i) => (i % 2 === 1 && r.chance(0.3) ? 1 : 0));
  return st;
}
/** Mutation d'un bloc de 4 mesures au suivant (léger) ; plus forte aux frontières de 8 et 16 mesures. */
function mutate(prev, r, j, sub) {
  const st = { ...prev, mute: { ...prev.mute }, rim: prev.rim.slice(), snare: prev.snare.slice(), perc: prev.perc.slice() };
  const flip = (arr, n) => { for (let q = 0; q < n; q++) { const i = r.int(1, 15); if (i % 4) arr[i] = arr[i] ? 0 : 1; } };
  flip(st.rim, r.int(0, 2)); if (r.chance(0.4)) flip(st.snare, 1);
  if (j % 2 === 0) { // 8 mesures : un élément entre ou sort
    const cand = ['ohat', 'ride', 'clap', 'rim', 'snare', 'perc'].filter((v) => !(v === 'clap' && !st.clapOn));
    const v = r.pick(cand); st.mute[v] = !st.mute[v];
    if (r.chance(0.35)) st.kickVar = r.pick([0, 0, 1, 2]);
  }
  if (j % 4 === 0) { // 16 mesures : changement de jeu de charleys, rotation des motifs
    st.hatMode = r.pick(['roll', 'off16', '8', 'roll', sub === 'industriel' ? 'roll' : 'off16']);
    if (r.chance(0.5)) { const k = r.pick([1, 2, 3]); st.rim = st.rim.slice(k).concat(st.rim.slice(0, k)); }
    if (sub === 'minimal' && r.chance(0.3)) st.clapOn = !st.clapOn;
  }
  // jamais trop vide ni trop plein
  const active = ['ohat', 'ride', 'clap', 'rim', 'snare', 'perc'].filter((v) => !st.mute[v]).length;
  if (active < 2) st.mute[r.pick(['ohat', 'rim', 'clap'])] = false;
  if (active > 4) st.mute[r.pick(['ride', 'snare', 'perc'])] = true;
  return st;
}

/** Contexte persistant d'un chapitre : états de jeu par bloc de 4 mesures (déterministes, calculables à la demande). */
export function makeTechnoJam(P, ci, sub) {
  const cache = [];
  const at = (bar) => {
    const j = Math.max(0, Math.floor(bar / 4));
    if (!cache.length) cache.push(initState(makeRng(hashSeed(P.seed, 'jam', P.variation, ci)), sub));
    for (let k = cache.length; k <= j; k++) cache.push(mutate(cache[k - 1], makeRng(hashSeed(P.seed, 'jam', P.variation, ci, k)), k, sub));
    return cache[j];
  };
  // stabs : un rythme d'une mesure (syncopé), muté toutes les 16 mesures ; présence par blocs de 8 mesures
  const stabRhythms = [[0, 3, 6, 10], [3, 6, 11, 14], [2, 7, 10], [0, 6, 11], [3, 10], [1, 4, 7, 10, 13], [2, 5, 8, 14]];
  const rs = makeRng(hashSeed(P.seed, 'stab', P.variation, ci));
  const base = rs.int(0, stabRhythms.length - 1);
  const stabAt = (bar) => {
    const k = Math.floor(bar / 16), r = makeRng(hashSeed(P.seed, 'stab', ci, k));
    const rh = stabRhythms[(base + (r.chance(0.35) ? r.int(1, 3) : 0)) % stabRhythms.length];
    const on8 = makeRng(hashSeed(P.seed, 'stabOn', ci, Math.floor(bar / 8))).chance(sub === 'minimal' ? 0.45 : sub === 'industriel' ? 0.3 : 0.7);
    return { rh, on: on8, gate: sub === 'industriel' ? 0.12 : 0.2 + 0.12 * r() };
  };
  // séquence aiguë (arp) : entre et sort par blocs de 16 mesures (peu de mélodie, boucles qui alternent)
  const arpOn = (bar) => makeRng(hashSeed(P.seed, 'jamArp', ci, Math.floor(bar / 16))).chance(sub === 'minimal' ? 0.35 : 0.5);
  return { sub, at, stabAt, arpOn };
}

/**
 * Batterie d'une section. ctx = { s, role, I, SPB, BPB, stepT, rd, HUM, ev, preB, nextType, isFinalB, gbar0 }
 * gbar0 = mesure globale de début de chapitre (continuité des états entre chapitres).
 */
export function technoDrums(jam, ctx) {
  const { s, role, I, SPB, BPB, stepT, rd, HUM, ev, preB, isFinalB } = ctx;
  const sub = jam.sub;
  const push = (kind, bar, st, v) => ev.push({ inst: 'drums', kind, t: stepT(bar, st) + rd.gauss() * 0.0035 * HUM, v: Math.max(0.05, Math.min(1.25, v * (1 + rd.gauss() * 0.06 * HUM))) });
  for (let b = 0; b < s.bars; b++) {
    const bar = s.startBar + b, gb = ctx.gbar0 + bar;
    const st = jam.at(gb);
    const pos = b / Math.max(1, s.bars);
    const lastBar = b === s.bars - 1;
    const phraseEnd = (gb + 1) % 8 === 0, bigEnd = (gb + 1) % 16 === 0;
    // couches selon la section : intro / outro « DJ » (mixables), breakdown sans grosse caisse
    let allow = null;
    if (s.type === 'intro') allow = pos < 0.5 ? ['kick'] : pos < 0.75 ? ['kick', 'hat'] : ['kick', 'hat', 'ohat', 'rim'];
    else if (s.type === 'outro') allow = pos < 0.5 ? null : pos < 0.75 ? ['kick', 'hat', 'rim'] : ['kick'];
    else if (role === 'breakdown' || s.type === 'bridge') allow = ['hat', 'ride', 'rim', 'perc', 'ohat'];
    else if (role === 'build') allow = ['kick', 'hat', 'ohat'];
    const ok = (v) => (!allow || allow.includes(v)) && (allow ? true : !st.mute[v]);
    // accent / « decay » automatisés : LFO lent sur les charleys (8 mesures) et les ouverts (16)
    const acc = 0.78 + 0.22 * Math.sin(st.hatPhase + (2 * Math.PI * gb) / 8);
    const ohv = 0.6 + 0.4 * (0.5 - 0.5 * Math.cos((2 * Math.PI * gb) / 16));
    const drop = s.type === 'B' || role === 'drop';
    // coupure de grosse caisse façon live : dernier temps (ou toute la mesure) en fin de phrase
    const kickCut = role !== 'build' && !preB && (bigEnd && rd.chance(0.45) ? 0 : phraseEnd && rd.chance(0.4) ? 12 : 99);
    if (ok('kick') || (allow && allow.includes('kick'))) {
      for (let q = 0; q < SPB; q += 4) if (q < kickCut) push('kick', bar, q, (q === 0 ? 1 : 0.94) * I);
      if (st.kickVar === 1 && kickCut > 14) push('kick', bar, 14, 0.5 * I);
      if (st.kickVar === 2 && kickCut > 15 && b % 2 === 1) push('kick', bar, 15, 0.42 * I);
    }
    if (ok('hat') || (allow && allow.includes('hat'))) {
      for (let q = 0; q < SPB; q++) {
        let v = 0;
        if (st.hatMode === 'roll') v = q % 4 === 2 ? 0.95 : q % 2 === 0 ? 0.55 : 0.38 + (q % 4 === 3 ? 0.14 : 0);
        else if (st.hatMode === 'off16') v = q % 4 === 2 ? 1 : q % 4 === 3 ? 0.45 : 0;
        else v = q % 2 === 0 ? (q % 4 === 2 ? 0.95 : 0.5) : 0;
        if (!v) continue;
        if (!st.mute.ohat && ok('ohat') && q % 4 === 2) continue; // le charley ouvert prend le contretemps
        push('hat', bar, q, v * acc * I * (sub === 'industriel' ? 1.1 : 1));
      }
    }
    if (!st.mute.ohat && ok('ohat')) for (let q = 2; q < SPB; q += 4) push('ohat', bar, q, ohv * 0.85 * I);
    if (ok('ride') && (drop || isFinalB)) for (let q = 0; q < SPB; q += 2) push('ride', bar, q, (q % 4 === 2 ? 0.8 : 0.55) * I);
    if (st.clapOn && ok('clap')) {
      for (const q of [4, 12]) if (q < SPB) push('clap', bar, q, (drop ? 0.95 : 0.8) * I);
      if (b % 4 === 3 && rd.chance(0.35)) push('clap', bar, 15, 0.45 * I); // variation de clap
    }
    if (ok('rim')) st.rim.forEach((x, q) => { if (x && q < SPB) push('rim', bar, q, (q % 2 ? 0.55 : 0.75) * I); });
    if (ok('snare')) st.snare.forEach((x, q) => { if (x && q < SPB) push('snare', bar, q, 0.32 * I); }); // notes fantômes
    if (ok('perc')) st.perc.forEach((x, q) => { if (x && q < SPB) push(sub === 'industriel' ? 'tomm' : 'rim', bar, q, 0.35 * I); });
    // fills de fin de phrase : toms 909, roulement de clap / caisse, crescendo de charley ouvert
    if (lastBar && role === 'build') {
      const n = 16; for (let k = 0; k < n; k++) push(sub === 'minimal' ? 'rim' : 'snare', bar, k, (0.25 + 0.7 * (k / n)) * I);
    } else if (phraseEnd && !allow && !(lastBar && preB)) {
      const f = rd.pick(bigEnd ? ['toms', 'toms', 'clap', 'snare'] : ['toms', 'clap', 'ohat', 'none', 'none']);
      if (f === 'toms') { const ks = ['tomh', 'tomh', 'tomm', 'tomm', 'toml', 'toml', 'toml', 'toml']; const from = rd.pick([8, 12]); for (let q = from; q < SPB; q++) push(ks[Math.min(7, Math.floor(((q - from) / (SPB - from)) * 8))], bar, q, (0.55 + 0.4 * ((q - from) / (SPB - from))) * I); }
      else if (f === 'clap') for (let q = 12; q < SPB; q++) push('clap', bar, q, (0.4 + 0.12 * (q - 12)) * I);
      else if (f === 'snare') for (let q = 8; q < SPB; q++) push('snare', bar, q, (0.3 + 0.05 * (q - 8)) * I);
      else if (f === 'ohat') for (let q = 10; q < SPB; q += 2) push('ohat', bar, q, (0.5 + 0.08 * (q - 10)) * I);
    }
  }
}

/** Stabs d'accords mineurs (Detroit) : boucle d'une mesure, mutée toutes les 16 mesures, présente par blocs de 8. */
export function technoStabs(jam, ctx, voicing, bar, gb) {
  const { s, I, stepT, ev, SPB } = ctx;
  if (jam.sub === 'industriel' && s.type !== 'B') return;
  const sa = jam.stabAt(gb);
  const on = s.type === 'B' ? sa.on || jam.sub === 'detroit' : sa.on && s.type !== 'intro';
  if (!on) return;
  for (const q of sa.rh) if (q < SPB) voicing.forEach((m, k) => ev.push({ inst: 'chords', t: stepT(bar, q) + k * 0.002, d: sa.gate, m, v: 0.5 * I * (q % 4 === 0 ? 1 : 0.88) }));
}
