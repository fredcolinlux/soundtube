// Batterie façon TR-909 : synthèse « analogique » maison (aucun échantillon), inspirée des circuits 808/909.
//  - grosse caisse : sinus à balayage de hauteur + clic d'attaque + saturation (accord / longueur réglables)
//  - caisse claire : deux corps accordés (triangles) + bruit « snappy » filtré
//  - clap : rafale de 4 impulsions de bruit + queue de réverbération filtrée
//  - charleston fermé/ouvert, ride, crash : banque de 6 oscillateurs carrés inharmoniques → passe-bande → passe-haut
//  - toms (grave/médium/aigu) : sinus à chute de hauteur + bruit, rimshot : résonateurs excités par une impulsion
import { SR, svf, onePoleLP, noise } from './dsp.js';

const TAU = Math.PI * 2;
// fréquences de la banque métallique (circuit cymbale 808, reprises sur la 909)
const METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];

const sat = (b, d) => { const k = Math.tanh(d); for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * d) / k; return b; };
const tri = (ph) => 4 * Math.abs(ph - Math.floor(ph + 0.5)) - 1; // triangle -1..1

/** Grosse caisse 909. o : { tune (≈1), decay (≈1), accent 0..2 } */
export function kick909(rnd, o = {}) {
  const tune = o.tune || 1, dec = o.decay || 1, acc = o.accent ?? 1;
  const len = 0.25 + 0.55 * dec, n = Math.ceil(len * SR), out = new Float32Array(n);
  const fEnd = 49 * tune, fStart = (250 + 40 * acc) * tune;
  const tauP = 0.018 * (0.8 + 0.4 / tune);          // vitesse du balayage
  const tauA = 0.13 * dec;                           // décroissance du corps
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = fEnd + (fStart - fEnd) * Math.exp(-t / tauP) + 12 * tune * Math.exp(-t / 0.09);
    ph += f / SR;
    // forme « triangle arrondi » de la 909 : mélange sinus + triangle
    const w = 0.82 * Math.sin(TAU * ph) + 0.18 * tri(ph + 0.25);
    const hold = t < 0.012 ? 1 : Math.exp(-(t - 0.012) / tauA);
    out[i] = w * hold * (1 - Math.exp(-t / 0.0006));
  }
  // clic d'attaque : impulsion + bruit passe-haut très court
  const cN = Math.floor(0.004 * SR), nz = svf(noise(cN, rnd), 3500, 0.7, 'hp');
  const clickAmt = 0.35 + 0.25 * acc;
  for (let i = 0; i < cN; i++) out[i] += (nz[i] * 0.7 + (i < 22 ? 1 - i / 22 : 0)) * clickAmt * (1 - i / cN) ** 1.5;
  sat(out, 1.25 + 0.55 * acc);
  const f = Math.floor(0.03 * SR); for (let i = 0; i < f; i++) out[n - 1 - i] *= i / f;
  return out;
}

/** Caisse claire 909 : deux corps accordés + bruit (snappy). */
export function snare909(rnd, o = {}) {
  const tune = o.tune || 1, dec = o.decay || 1, acc = o.accent ?? 1;
  const n = Math.ceil(0.42 * SR), out = new Float32Array(n);
  const f1 = 182 * tune, f2 = 334 * tune;
  const nzRaw = noise(n, rnd);
  const snappy = svf(svf(nzRaw, 7800, 0.6, 'lp'), 520, 0.7, 'hp');
  let p1 = rnd(), p2 = rnd();
  const tn = 0.13 * dec * (0.85 + 0.15 * acc);
  for (let i = 0; i < n; i++) {
    const t = i / SR, drop = 1 + 0.18 * Math.exp(-t / 0.008);
    p1 += f1 * drop / SR; p2 += f2 * drop / SR;
    const body = 0.75 * tri(p1) * Math.exp(-t / 0.055) + 0.45 * tri(p2) * Math.exp(-t / 0.032);
    const nz = snappy[i] * Math.exp(-t / tn) * (0.9 + 0.25 * acc) * Math.min(1, t / 0.0007);
    out[i] = body * (0.7 + 0.2 * acc) + nz;
  }
  return sat(out, 1.4 + 0.3 * acc);
}

/** Clap 909 : 4 impulsions espacées + queue réverbérée. */
export function clap909(rnd, o = {}) {
  const dec = o.decay || 1, acc = o.accent ?? 1;
  const n = Math.ceil(0.55 * SR), env = new Float32Array(n);
  const hits = [0, 0.0095, 0.0195, 0.0305].map((x) => x * (1 + (rnd() - 0.5) * 0.12));
  for (let i = 0; i < n; i++) {
    const t = i / SR; let a = 0;
    for (const h of hits) if (t >= h && t < h + 0.012) a = Math.max(a, (1 - (t - h) / 0.012) ** 1.6);
    env[i] = a;
  }
  const nz = noise(n, rnd);
  const burst = svf(nz, 1150, 1.6, 'bp'), tailN = svf(nz, 1000, 0.9, 'bp');
  const out = new Float32Array(n), tStart = hits[3];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const tail = t > tStart ? Math.exp(-(t - tStart) / (0.13 * dec)) * Math.min(1, (t - tStart) / 0.004) : 0;
    out[i] = burst[i] * env[i] * (1.1 + 0.3 * acc) + tailN[i] * tail * 0.75;
  }
  const hp = svf(out, 450, 0.7, 'hp');
  return sat(hp, 1.2 + 0.3 * acc);
}

/** Banque de 6 carrés inharmoniques (circuit cymbale). */
function metalBank(n, rnd, scale = 1) {
  const m = new Float32Array(n), ph = METAL.map(() => rnd()), fr = METAL.map((f) => f * scale);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < 6; k++) { ph[k] += fr[k] / SR; if (ph[k] >= 1) ph[k] -= 1; s += ph[k] < 0.5 ? 1 : -1; } m[i] = s / 6; }
  return m;
}

/** Charleston 909 (fermé / ouvert). */
export function hat909(rnd, open, o = {}) {
  const tune = o.tune || 1, dec = o.decay || 1, acc = o.accent ?? 1;
  const len = open ? 0.75 : 0.16, n = Math.ceil(len * SR);
  const m = metalBank(n, rnd, 1.0 * tune);
  // deux passe-bandes en parallèle (3,4 kHz et 7,1 kHz) puis passe-haut, comme le circuit
  const b1 = svf(m, 3440 * tune, 3, 'bp'), b2 = svf(m, 7100 * tune, 3, 'bp'), nz = noise(n, rnd);
  const sum = new Float32Array(n); for (let i = 0; i < n; i++) sum[i] = b1[i] * 0.55 + b2[i] + nz[i] * 0.12;
  const o2 = svf(svf(sum, 7200 * Math.sqrt(tune), 0.8, 'hp'), 6800, 0.6, 'hp');
  const d = open ? 0.21 * dec ** 0.7 : 0.032 * (0.75 + 0.25 * dec) * (0.9 + 0.12 * acc);
  for (let i = 0; i < n; i++) { const t = i / SR; o2[i] *= Math.min(1, t / 0.0004) * (open ? (t < 0.004 ? 1.15 : 1) : 1) * Math.exp(-t / d); }
  return o2;
}

/** Ride 909 : banque métallique transposée, cloche + longue traîne. */
export function ride909(rnd, o = {}) {
  const tune = o.tune || 1, dec = o.decay || 1;
  const n = Math.ceil(1.9 * SR), m = metalBank(n, rnd, 1.46 * tune), m2 = metalBank(n, rnd, 2.13 * tune);
  const bell = svf(m, 3900 * tune, 6, 'bp'), wash = svf(m2, 9500 * tune, 1.2, 'bp'), nz = svf(noise(n, rnd), 8000, 0.7, 'hp');
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = (bell[i] * 0.5 * Math.exp(-t / (0.35 * dec)) + wash[i] * Math.exp(-t / (0.62 * dec)) + nz[i] * 0.18 * Math.exp(-t / 0.25)) * Math.min(1, t / 0.0006);
  }
  return svf(out, 2800, 0.7, 'hp');
}

/** Crash 909 : métal + bruit, attaque explosive, longue décroissance. */
export function crash909(rnd, o = {}) {
  const dec = o.decay || 1, n = Math.ceil(2.4 * SR), m = metalBank(n, rnd, 1.9), nz = noise(n, rnd);
  const a = svf(m, 6200, 1.1, 'bp'), b = svf(nz, 5200, 0.7, 'hp');
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] = (a[i] * 0.6 + b[i] * 0.7) * (Math.exp(-t / (0.75 * dec)) * 0.8 + 0.6 * Math.exp(-t / 0.05)) * Math.min(1, t / 0.0008); }
  return svf(out, 3500, 0.7, 'hp');
}

/** Toms 909. which : 'tomh' | 'tomm' | 'toml' */
export function tom909(rnd, which, o = {}) {
  const tune = o.tune || 1, dec = o.decay || 1, acc = o.accent ?? 1;
  const f0 = { tomh: 205, tomm: 150, toml: 108 }[which] * tune;
  const n = Math.ceil(0.7 * SR), out = new Float32Array(n), nz = svf(noise(n, rnd), f0 * 6, 0.8, 'lp');
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = f0 * (1 + 0.35 * Math.exp(-t / 0.045));
    ph += f / SR;
    out[i] = (0.85 * Math.sin(TAU * ph) + 0.15 * tri(ph)) * Math.exp(-t / (0.2 * dec)) + nz[i] * 0.35 * Math.exp(-t / 0.02);
  }
  return sat(out, 1.3 + 0.3 * acc);
}

/** Rimshot 909 : impulsion dans deux résonateurs, très bref. */
export function rim909(rnd) {
  const n = Math.ceil(0.08 * SR), imp = new Float32Array(n);
  for (let i = 0; i < 24; i++) imp[i] = (1 - i / 24) * (i % 2 ? -1 : 1) * 0.5 + (rnd() - 0.5) * 0.3;
  const r1 = svf(imp, 480, 14, 'bp'), r2 = svf(imp, 1720, 10, 'bp');
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] = (r1[i] * 0.8 + r2[i]) * Math.exp(-t / 0.012); }
  return sat(svf(out, 300, 0.7, 'hp'), 2.2);
}

/** Point d'entrée : un élément de la 909 (mono). tune = drumTune de la recette, layer = 0..2 (2 = accent). */
export function drum909(kind, rnd, tune, layer = 1, rr = 0) {
  const T = tune || {}, acc = layer, det = 1 + (rr - 1) * 0.006;
  const kd = T.kickDecay ?? T.decay ?? 1;
  switch (kind) {
    case 'kick': case 'boom': return kick909(rnd, { tune: (T.kickTune ?? T.kick ?? 1) * det, decay: kind === 'boom' ? kd * 1.8 : kd, accent: acc });
    case 'snare': return snare909(rnd, { tune: (T.snare || 1) * det, decay: T.decay || 1, accent: acc });
    case 'clap': return clap909(rnd, { decay: T.decay || 1, accent: acc });
    case 'hat': case 'shaker': return hat909(rnd, false, { tune: (T.hat || 1) * det, decay: T.decay || 1, accent: acc });
    case 'ohat': return hat909(rnd, true, { tune: (T.hat || 1) * det, decay: T.decay || 1, accent: acc });
    case 'ride': return ride909(rnd, { tune: (T.hat || 1) ** 0.5 * det, decay: T.decay || 1 });
    case 'crash': return crash909(rnd, { decay: T.decay || 1 });
    case 'tomh': case 'tomm': case 'toml': return tom909(rnd, kind, { tune: (T.kick || 1) * det, decay: T.decay || 1, accent: acc });
    case 'tom': return tom909(rnd, 'toml', { tune: (T.kick || 1) * det, decay: T.decay || 1, accent: acc });
    case 'rim': return rim909(rnd);
    default: return null;
  }
}
