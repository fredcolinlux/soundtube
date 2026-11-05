// v1.8.0 — familles de synthés « vintage » en JavaScript pur (aucun échantillon ni code d'origine) :
//  - DX7 (FM 6 opérateurs, ici les piles utiles) : piano électrique « E.PIANO », basse FM « BASS », cloches « TUB BELLS » ;
//  - Minimoog : 3 oscillateurs → filtre en échelle 4 pôles (24 dB, saturation tanh), glide ;
//  - Juno : scie + pulse à largeur modulée (PWM) + sub-oscillateur, filtre 24 dB, chorus stéréo intégré (I/II) ;
//  - ARP Odyssey : deux oscillateurs dont un synchronisé (sync sweep), filtre 12 dB résonant, glide ;
//  - talkbox / vocodeur : porteuse riche (scie + pulse) passée dans des formants de voyelles qui se déforment.
// Les noms de modèles décrivent le caractère sonore visé.
import { SR, oscSample, adsr, svf } from './dsp.js';

const TAU = Math.PI * 2;
const sin = Math.sin;

/** Enveloppe ADSR simple (porte en échantillons). */
function envAt(i, gate, a, d, s, r) {
  const t = i / SR;
  if (i < gate) return t < a ? t / a : s + (1 - s) * Math.exp(-(t - a) / d);
  const tg = gate / SR, lv = tg < a ? tg / a : s + (1 - s) * Math.exp(-(tg - a) / d);
  return lv * Math.exp(-(t - tg) / r);
}
const fadeEnd = (b, ms = 6) => { const f = Math.min(b.length, Math.floor(ms * SR / 1000)); for (let i = 0; i < f; i++) b[b.length - 1 - i] *= i / f; return b; };

// ------------------------------------------------------------------ DX7
/** Piano électrique FM : deux piles (corps 1:1 à indice décroissant + « tine » 14:1 très bref), légèrement désaccordées. */
export function dx7epiano(f, gateS, vel, T = {}) {
  const rel = 0.4 * (T.rel || 1), n = Math.ceil((gateS + rel) * SR), gate = Math.floor(gateS * SR);
  const L = new Float32Array(n), R = new Float32Array(n), im = T.index || 1;
  let c1 = 0, m1 = 0, c2 = 0, m2 = 0, t1 = 0;
  const ks = Math.max(0.4, Math.min(1.3, 1.4 - (Math.log2(f / 261.6)) * 0.25)); // échelle de clavier : aigus plus brefs
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const idx = (0.35 + 2.1 * vel * vel) * Math.exp(-t * 3.2 / ks) * im + 0.18;
    const tine = sin(TAU * t1) * (0.9 * vel) * Math.exp(-t * 28);
    let a = Math.min(1, i / 30) * Math.exp(-t * 0.75 / ks);
    if (i >= gate) a *= Math.exp(-(i - gate) / (rel * SR) * 4);
    const s1 = sin(TAU * c1 + sin(TAU * m1) * idx + tine * 0.6);
    const s2 = sin(TAU * c2 + sin(TAU * m2) * idx * 0.8);
    L[i] = (s1 * 0.62 + s2 * 0.38) * a * 0.42 * vel; R[i] = (s1 * 0.38 + s2 * 0.62) * a * 0.42 * vel;
    c1 += f / SR; m1 += f / SR; c2 += f * 1.0035 / SR; m2 += f * 1.0035 / SR; t1 += f * 14 / SR;
    c1 %= 1; m1 %= 1; c2 %= 1; m2 %= 1; t1 %= 1;
  }
  return { L: fadeEnd(L), R: fadeEnd(R) };
}
/** Basse FM : porteuse 1:1 + modulateur à rétroaction (attaque claquante) + sub sinus. */
export function dx7bass(f, gateS, vel, T = {}) {
  const rel = 0.08, n = Math.ceil((gateS + rel) * SR), gate = Math.floor(gateS * SR), out = new Float32Array(n);
  let pc = 0, pm = 0, pm2 = 0, fb = 0;
  const im = T.index || 1;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const idx = (1.2 + 3.2 * vel) * Math.exp(-t * 14) * im + 0.45;
    const mod = sin(TAU * pm + fb * 0.6); fb = mod;
    const pop = sin(TAU * pm2) * 2.2 * Math.exp(-t * 60);
    let a = Math.min(1, i / 20) * (0.55 + 0.45 * Math.exp(-t * 4));
    if (i >= gate) a *= Math.max(0, 1 - (i - gate) / (rel * SR));
    out[i] = (sin(TAU * pc + mod * idx + pop) * 0.75 + sin(TAU * pc) * 0.45) * a * 0.62 * vel;
    pc = (pc + f / SR) % 1; pm = (pm + f / SR) % 1; pm2 = (pm2 + f * 3 / SR) % 1;
  }
  return fadeEnd(out);
}
/** Cloches FM (tubulaires) : deux piles inharmoniques 1:3,5 et 1:1,41, longue décroissance. */
export function dx7bell(f, gateS, vel, T = {}) {
  const len = Math.min(7, gateS + 3), n = Math.ceil(len * SR), out = new Float32Array(n), im = T.index || 1;
  let c1 = 0, m1 = 0, c2 = 0, m2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const i1 = 3.2 * im * Math.exp(-t * 1.4) + 0.3, i2 = 1.6 * Math.exp(-t * 3);
    const s = sin(TAU * c1 + sin(TAU * m1) * i1) * 0.6 + sin(TAU * c2 + sin(TAU * m2) * i2) * 0.4 * Math.exp(-t * 2);
    out[i] = s * Math.min(1, i / 25) * Math.exp(-t * 0.85) * 0.36 * vel;
    c1 = (c1 + f / SR) % 1; m1 = (m1 + f * 3.5 / SR) % 1; c2 = (c2 + f * 2 / SR) % 1; m2 = (m2 + f * 2.82 / SR) % 1;
  }
  return fadeEnd(out, 20);
}

// ------------------------------------------------------------------ filtre en échelle (Moog / Juno)
/** Échelle 4 pôles avec saturation tanh ; cutoff(i) en Hz, res 0..1. */
function ladder(buf, cutoff, res, drive = 1) {
  const out = new Float32Array(buf.length); let s1 = 0, s2 = 0, s3 = 0, s4 = 0, g = 0;
  const k = 4 * Math.max(0, Math.min(0.95, res));
  for (let i = 0; i < buf.length; i++) {
    if ((i & 7) === 0) { const fc = Math.max(20, Math.min(SR * 0.42, cutoff(i))); g = 1 - Math.exp(-TAU * fc / SR); }
    const x = Math.tanh((buf[i] - k * s4) * drive);
    s1 += g * (x - s1); s2 += g * (Math.tanh(s1) - s2); s3 += g * (Math.tanh(s2) - s3); s4 += g * (Math.tanh(s3) - s4);
    out[i] = s4 * (1 + k * 0.35);
  }
  return out;
}
function oscBank(f, n, oscs, o, glideS = 0.06) {
  const buf = new Float32Array(n), rnd = o.rnd || Math.random;
  const glideN = o.port ? Math.round(glideS * SR) : 0, portR = o.port ? Math.pow(2, (o.port - 12 * Math.log2(f / 8.175798915643707)) / 12) : 1;
  for (const [type, cents, g, pw] of oscs) {
    const fr = f * Math.pow(2, (cents + (rnd() * 2 - 1) * 2) / 1200); let ph = rnd(), dt = fr / SR;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) dt = (i < glideN ? fr * Math.pow(portR, 1 - i / glideN) : fr) / SR;
      buf[i] += g * oscSample(type, ph, dt, typeof pw === 'function' ? pw(i) : pw ?? 0.5); ph += dt; if (ph >= 1) ph -= 1;
    }
  }
  return buf;
}
/** Minimoog : basse (3 osc, 24 dB, enveloppe de filtre marquée) ou lead (vibrato, glide). */
export function moog(f, gateS, vel, o = {}, lead = false) {
  const T = o.tone || {}, bright = o.bright || 1;
  const rel = lead ? 0.25 : 0.09, n = Math.ceil((gateS + rel + 0.02) * SR), gate = Math.floor(gateS * SR);
  const oscs = lead ? [['saw', -6, 0.45], ['saw', 7, 0.45], ['square', 1200, 0.18]] : [['saw', 0, 0.5], ['saw', -8, 0.4], ['square', -1200, 0.45]];
  const buf = oscBank(f, n, oscs, o, lead ? 0.09 : 0.05);
  const base = (lead ? 900 : 180) * (T.cut || 1) * bright, envA = (lead ? 2600 : 1500) * (T.env || 1) * vel * bright, fd = (lead ? 0.35 : 0.14) * SR;
  const out = ladder(buf, (i) => base + envA * Math.exp(-i / fd) + (lead ? 300 * sin(TAU * 5.2 * i / SR) * Math.min(1, i / SR / 0.4) : 0), lead ? 0.45 : 0.55, 1.6);
  for (let i = 0; i < n; i++) out[i] *= envAt(i, gate, lead ? 0.01 : 0.003, lead ? 0.4 : 0.18, lead ? 0.8 : 0.7, rel / 4) * (lead ? 0.55 : 0.85) * vel;
  return fadeEnd(out);
}
/** Juno : scie + PWM + sub, filtre 24 dB doux, chorus stéréo (deux lignes modulées en opposition). */
export function juno(f, gateS, vel, o = {}) {
  const T = o.tone || {}, bright = o.bright || 1, rnd = o.rnd || Math.random;
  const rel = 0.9 * (T.rel || 1), att = 0.06 * (T.att || 1), n = Math.ceil((gateS + rel * 1.5) * SR), gate = Math.floor(gateS * SR);
  const lp = rnd() * TAU;
  const buf = oscBank(f, n, [['saw', 0, 0.42], ['pulse', 0, 0.38, (i) => 0.5 - 0.36 * (0.5 + 0.5 * sin(lp + TAU * 0.7 * i / SR))], ['square', -1200, 0.22]], o);
  const base = 1300 * (T.cut || 1) * bright, envA = 900 * (T.env || 1) * vel;
  const dry = ladder(buf, (i) => base + envA * Math.exp(-i / (0.6 * SR)), 0.2, 1.1);
  for (let i = 0; i < n; i++) dry[i] *= envAt(i, gate, att, 0.8, 0.85, rel / 4) * 0.4 * vel;
  // chorus Juno (mode I ≈ 0,5 Hz) : retard 3,5 ms ± 1,8 ms, voies gauche/droite en opposition de phase
  const L = new Float32Array(n), R = new Float32Array(n), base0 = 0.0035 * SR, dep = 0.0018 * SR;
  for (let i = 0; i < n; i++) {
    const m = sin(TAU * 0.52 * i / SR + lp);
    const rd = (d) => { const p = i - d, a = Math.floor(p), fr = p - a; return a < 0 ? 0 : (dry[a] || 0) * (1 - fr) + (dry[a + 1] || 0) * fr; };
    L[i] = dry[i] * 0.7 + rd(base0 + dep * m) * 0.55; R[i] = dry[i] * 0.7 + rd(base0 - dep * m) * 0.55;
  }
  return { L: fadeEnd(L, 15), R: fadeEnd(R, 15) };
}
/** ARP Odyssey : osc 1 scie, osc 2 carré synchronisé balayé par l'enveloppe, filtre 12 dB résonant, glide. */
export function arpLead(f, gateS, vel, o = {}) {
  const T = o.tone || {}, bright = o.bright || 1;
  const rel = 0.18, n = Math.ceil((gateS + rel + 0.02) * SR), gate = Math.floor(gateS * SR), out = new Float32Array(n);
  const glideN = o.port ? Math.round(0.07 * SR) : 0, portR = o.port ? Math.pow(2, (o.port - 12 * Math.log2(f / 8.175798915643707)) / 12) : 1;
  let p1 = 0, p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, ff = (i < glideN ? f * Math.pow(portR, 1 - i / glideN) : f) * (1 + 0.004 * sin(TAU * 5.6 * t) * Math.min(1, t * 2));
    const sweep = 1.25 + 1.6 * Math.exp(-t / 0.22);
    const d1 = ff / SR; p1 += d1; let reset = false; if (p1 >= 1) { p1 -= 1; reset = true; }
    p2 += d1 * sweep; if (reset) p2 = p1 * sweep; if (p2 >= 1) p2 -= Math.floor(p2);
    out[i] = oscSample('saw', p1, d1) * 0.5 + (p2 < 0.5 ? 0.4 : -0.4);
  }
  const fo = svf(out, (i) => (1400 + 3000 * vel * Math.exp(-i / (0.3 * SR))) * (T.cut || 1) * bright, 2.2);
  for (let i = 0; i < n; i++) fo[i] = Math.tanh(fo[i] * 1.3 * envAt(i, gate, 0.006, 0.3, 0.8, rel / 4)) * 0.45 * vel;
  return fadeEnd(fo);
}

// ------------------------------------------------------------------ talkbox / vocodeur
const VOWELS = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [300, 2200, 3000], o: [570, 840, 2410], u: [320, 800, 2240], w: [290, 610, 2150] };
const VSEQ = [['w', 'a', 'o'], ['u', 'a', 'e'], ['w', 'o', 'u'], ['u', 'e', 'i'], ['w', 'a', 'a'], ['o', 'a', 'u']];
/**
 * Talkbox (formants mobiles, attaque « wah ») ou vocodeur (banque de bandes, timbre plus robotique).
 * Le mouvement des voyelles est tiré par note (o.rnd) : « wa-ou », « ou-é »…
 */
export function talkbox(f, gateS, vel, o = {}, vocoder = false) {
  const rnd = o.rnd || Math.random, bright = o.bright || 1;
  const rel = 0.12, n = Math.ceil((gateS + rel + 0.02) * SR), gate = Math.floor(gateS * SR);
  const carrier = oscBank(f, n, [['saw', -4, 0.55], ['saw', 5, 0.45], ['pulse', 0, 0.35, 0.3]], o, 0.08);
  const seq = VSEQ[Math.floor(rnd() * VSEQ.length)];
  const glide = Math.min(0.12, gateS * 0.35), mid = Math.max(glide, gateS * 0.75);
  const fm = (k) => (i) => { // formant k au temps i : v0 → v1 (attaque), v1 → v2 (fin de note)
    const t = i / SR, [v0, v1, v2] = seq.map((v) => VOWELS[v][k]);
    const x = t < glide ? v0 + (v1 - v0) * (t / glide) : t < mid ? v1 : v1 + (v2 - v1) * Math.min(1, (t - mid) / Math.max(0.05, gateS - mid + 0.05));
    return x * (vocoder ? 1 : 1 + 0.02 * sin(TAU * 4.8 * t)) * (0.9 + 0.15 * bright);
  };
  const out = new Float32Array(n);
  if (!vocoder) {
    const G = [1, 0.7, 0.35];
    for (let k = 0; k < 3; k++) { const b = svf(carrier, fm(k), 7 + k * 2, 'bp'); for (let i = 0; i < n; i++) out[i] += b[i] * G[k]; }
  } else {
    // vocodeur 10 bandes : gain de chaque bande = proximité des formants de la « voix » synthétique
    const bands = [200, 300, 450, 650, 950, 1350, 1900, 2600, 3500, 4700];
    const f1 = fm(0), f2 = fm(1), f3 = fm(2);
    for (const bf of bands) {
      const b = svf(carrier, bf, 6, 'bp');
      for (let i = 0; i < n; i += 64) {
        const g = [f1(i), f2(i), f3(i)].reduce((s, F, k) => s + [1, 0.7, 0.4][k] * Math.exp(-((Math.log2(bf / F)) ** 2) / 0.08), 0);
        for (let j = i; j < Math.min(n, i + 64); j++) out[j] += b[j] * g * 1.3;
      }
    }
    // sifflante d'attaque (consonne) : bruit aigu très bref
    for (let i = 0; i < Math.min(n, 0.03 * SR); i++) out[i] += (rnd() * 2 - 1) * 0.12 * (1 - i / (0.03 * SR)) * vel;
  }
  for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * 1.2 * envAt(i, gate, 0.008, 0.5, 0.85, rel / 4)) * 0.42 * vel;
  return fadeEnd(out);
}

/** Patchs fournis par ce module. */
export const VINTAGE_PATCHES = ['dx7epiano', 'dx7bass', 'dx7bell', 'moogbass', 'mooglead', 'junopoly', 'arplead', 'talkbox', 'vocoder'];
export function renderVintage(patch, f, gateS, vel, o = {}) {
  switch (patch) {
    case 'dx7epiano': return dx7epiano(f, gateS, vel, o.tone);
    case 'dx7bass': return dx7bass(f, gateS, vel, o.tone);
    case 'dx7bell': return dx7bell(f, gateS, vel, o.tone);
    case 'moogbass': return moog(f, gateS, vel, o, false);
    case 'mooglead': return moog(f, gateS, vel, o, true);
    case 'junopoly': return juno(f, gateS, vel, o);
    case 'arplead': return arpLead(f, gateS, vel, o);
    case 'talkbox': return talkbox(f, gateS, vel, o, false);
    case 'vocoder': return talkbox(f, gateS, vel, o, true);
    default: return null;
  }
}
