// Batterie façon TR-808 : synthèse « analogique » maison (aucun échantillon), d'après le principe des circuits 808.
//  - grosse caisse : oscillateur en anneau (sinus amorti) à légère chute de hauteur, « boom » long et accordable
//  - caisse claire : deux corps accordés (238 / 476 Hz) + bruit passe-haut (snappy)
//  - clap : 3 impulsions de bruit passe-bande + réverbe filtrée
//  - rim / clave / cowbell : résonateurs ou paires de carrés (540 + 800 Hz) passe-bande
//  - charleston fermé/ouvert et cymbale : banque de 6 carrés inharmoniques → passe-bandes → passe-haut
//  - toms / congas : sinus à faible glissement, maracas : rafale de bruit passe-haut
import { SR, svf, onePoleLP, noise } from './dsp.js';

const TAU = Math.PI * 2;
const METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
const sat = (b, d) => { const k = Math.tanh(d); for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * d) / k; return b; };
const sq = (ph) => (ph - Math.floor(ph) < 0.5 ? 1 : -1);

/** Grosse caisse 808 : sinus amorti, boom long (decay 0.3..3), accord (tune ≈ 1 → ~49 Hz). */
export function kick808(rnd, o = {}) {
  const tune = o.tune || 1, dec = o.decay || 1, acc = o.accent ?? 1;
  const tauA = 0.32 * dec, len = Math.min(3.5, 0.25 + tauA * 5.5), n = Math.ceil(len * SR), out = new Float32Array(n);
  const f0 = 49 * tune, fHi = f0 * (1.9 + 0.3 * acc);
  let ph = 0, hp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f0 + (fHi - f0) * Math.exp(-t / 0.011) + f0 * 0.06 * Math.exp(-t / 0.12);
    ph += f / SR;
    const a = Math.exp(-t / tauA) * (1 - Math.exp(-t / 0.0008));
    out[i] = Math.sin(TAU * ph) * a;
  }
  // « tic » d'attaque très court (la 808 n'a presque pas de clic)
  const cN = Math.floor(0.0025 * SR);
  for (let i = 0; i < cN; i++) { const x = (1 - i / cN) ** 2 * (0.25 + 0.2 * acc); out[i] += x * (i < 8 ? 1 : (rnd() - 0.5)); }
  for (let i = 0; i < n; i++) { const y = out[i] - hp; hp += y * 0.0009; out[i] = y; } // anti-continu
  sat(out, 1.05 + 0.5 * acc * (o.drive || 1));
  const f = Math.floor(0.04 * SR); for (let i = 0; i < f; i++) out[n - 1 - i] *= i / f;
  return out;
}

/** Caisse claire 808. */
export function snare808(rnd, o = {}) {
  const tune = o.tune || 1, dec = o.decay || 1, acc = o.accent ?? 1;
  const n = Math.ceil(0.35 * SR), out = new Float32Array(n);
  const snappy = svf(noise(n, rnd), 1800, 0.7, 'hp');
  let p1 = rnd(), p2 = rnd();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p1 += 238 * tune / SR; p2 += 476 * tune / SR;
    const body = (0.8 * Math.sin(TAU * p1) * Math.exp(-t / 0.045) + 0.5 * Math.sin(TAU * p2) * Math.exp(-t / 0.025));
    const nz = snappy[i] * Math.exp(-t / (0.075 * dec)) * (0.55 + 0.35 * acc);
    out[i] = (body * (0.75 + 0.15 * acc) + nz) * Math.min(1, t / 0.0005);
  }
  return sat(out, 1.2 + 0.2 * acc);
}

/** Clap 808 : 3 impulsions + queue. */
export function clap808(rnd, o = {}) {
  const dec = o.decay || 1, acc = o.accent ?? 1;
  const n = Math.ceil(0.5 * SR), nz = noise(n, rnd), bp = svf(nz, 1000, 1.3, 'bp'), out = new Float32Array(n);
  const hits = [0, 0.011, 0.022].map((x) => x * (1 + (rnd() - 0.5) * 0.15));
  for (let i = 0; i < n; i++) {
    const t = i / SR; let a = 0;
    for (const h of hits) if (t >= h && t < h + 0.01) a = Math.max(a, 1 - (t - h) / 0.01);
    const tail = t > hits[2] ? Math.exp(-(t - hits[2]) / (0.16 * dec)) * Math.min(1, (t - hits[2]) / 0.003) : 0;
    out[i] = bp[i] * (a * (1 + 0.3 * acc) + tail * 0.7);
  }
  return sat(svf(out, 600, 0.7, 'hp'), 1.3);
}

/** Banque de 6 carrés inharmoniques. */
function metalBank(n, rnd, scale = 1) {
  const m = new Float32Array(n), ph = METAL.map(() => rnd()), fr = METAL.map((f) => f * scale);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < 6; k++) { ph[k] += fr[k] / SR; if (ph[k] >= 1) ph[k] -= 1; s += ph[k] < 0.5 ? 1 : -1; } m[i] = s / 6; }
  return m;
}

/** Charleston 808 : métal passe-bande 7-10 kHz, plus doux et « grésillant » que la 909. */
export function hat808(rnd, open, o = {}) {
  const tune = o.tune || 1, dec = o.decay || 1, acc = o.accent ?? 1;
  const n = Math.ceil((open ? 0.6 : 0.12) * SR), m = metalBank(n, rnd, tune);
  const b = svf(svf(m, 8200 * tune, 2.2, 'bp'), 6500, 0.7, 'hp');
  const d = open ? 0.17 * dec ** 0.7 : 0.022 * (0.8 + 0.2 * dec) * (0.9 + 0.1 * acc);
  for (let i = 0; i < n; i++) { const t = i / SR; b[i] *= Math.min(1, t / 0.0003) * Math.exp(-t / d); }
  return b;
}

/** Cymbale 808 : métal sur deux bandes, longue queue (sert de crash et de ride). */
export function cymbal808(rnd, o = {}) {
  const dec = o.decay || 1, ride = !!o.ride;
  const n = Math.ceil((ride ? 1.4 : 2.2) * SR), m = metalBank(n, rnd, ride ? 1.25 : 1);
  const lo = svf(m, 3600, 3, 'bp'), hi = svf(m, 8400, 1.5, 'bp'), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = (lo[i] * 0.55 * Math.exp(-t / 0.18) + hi[i] * Math.exp(-t / ((ride ? 0.4 : 0.8) * dec))) * Math.min(1, t / 0.0006);
  }
  return svf(out, ride ? 3200 : 2600, 0.7, 'hp');
}

/** Cowbell 808 : deux carrés 540 + 800 Hz, passe-bande, double décroissance. */
export function cowbell808(rnd, o = {}) {
  const tune = o.tune || 1, n = Math.ceil(0.45 * SR), raw = new Float32Array(n);
  let a = rnd(), b = rnd();
  for (let i = 0; i < n; i++) { a += 540 * tune / SR; b += 800 * tune / SR; raw[i] = (sq(a) + sq(b)) * 0.5; }
  const out = svf(raw, 2640 * tune, 1.6, 'bp');
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] *= (0.85 * Math.exp(-t / 0.018) + 0.35 * Math.exp(-t / 0.11)) * Math.min(1, t / 0.0004); }
  return sat(out, 1.6);
}

/** Rimshot / clave : impulsion dans un résonateur très sélectif. */
function ping(rnd, f, tau, q, n0 = 0.08) {
  const n = Math.ceil(n0 * SR), imp = new Float32Array(n);
  for (let i = 0; i < 12; i++) imp[i] = (1 - i / 12) * (i % 2 ? -1 : 1) + (rnd() - 0.5) * 0.2;
  const r = svf(imp, f, q, 'bp');
  for (let i = 0; i < n; i++) r[i] *= Math.exp(-i / SR / tau) * 6;
  return r;
}
export function rim808(rnd) { const a = ping(rnd, 1667, 0.009, 18), b = ping(rnd, 455, 0.012, 10); for (let i = 0; i < a.length; i++) a[i] = a[i] + b[i] * 0.6; return sat(svf(a, 350, 0.7, 'hp'), 2); }
export function clave808(rnd, o = {}) { return sat(ping(rnd, 2500 * (o.tune || 1), 0.022, 30, 0.12), 1.4); }

/** Toms et congas 808 : sinus à faible glissement (congas plus aiguës et courtes). */
export function tom808(rnd, which, o = {}) {
  const tune = o.tune || 1, dec = o.decay || 1;
  const F = { tomh: 196, tomm: 140, toml: 98, congah: 370, congam: 277, congal: 196 };
  const conga = which.startsWith('conga');
  const f0 = F[which] * tune, n = Math.ceil((conga ? 0.35 : 0.8) * SR), out = new Float32Array(n);
  const nz = conga ? null : svf(noise(n, rnd), 900, 0.7, 'lp');
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = f0 * (1 + (conga ? 0.06 : 0.12) * Math.exp(-t / 0.03));
    ph += f / SR;
    out[i] = Math.sin(TAU * ph) * Math.exp(-t / ((conga ? 0.07 : 0.22) * dec)) * Math.min(1, t / 0.0006) + (nz ? nz[i] * 0.08 * Math.exp(-t / 0.05) : 0);
  }
  return sat(out, 1.15);
}

/** Maracas 808 : rafale de bruit passe-haut très courte. */
export function maracas808(rnd, o = {}) {
  const n = Math.ceil(0.07 * SR), out = svf(noise(n, rnd), 7500, 0.7, 'hp');
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] *= Math.min(1, t / 0.004) * Math.exp(-t / (0.018 * (o.decay || 1))); }
  return out;
}

/** Point d'entrée : un élément de la 808 (mono). tune = drumTune de la recette, layer = 0..2 (accent). */
export function drum808(kind, rnd, tune, layer = 1, rr = 0) {
  const T = tune || {}, acc = layer, det = 1 + (rr - 1) * 0.005;
  const kd = (T.kickDecay ?? T.decay ?? 1) * 1.6;
  switch (kind) {
    case 'kick': return kick808(rnd, { tune: (T.kickTune ?? T.kick ?? 1) * det, decay: kd, accent: acc });
    case 'boom': return kick808(rnd, { tune: (T.kickTune ?? T.kick ?? 1) * 0.92, decay: kd * 1.8, accent: acc, drive: 1.6 });
    case 'snare': return snare808(rnd, { tune: (T.snare || 1) * det, decay: T.decay || 1, accent: acc });
    case 'clap': return clap808(rnd, { decay: T.decay || 1, accent: acc });
    case 'hat': return hat808(rnd, false, { tune: (T.hat || 1) ** 0.5 * det, decay: T.decay || 1, accent: acc });
    case 'ohat': return hat808(rnd, true, { tune: (T.hat || 1) ** 0.5 * det, decay: T.decay || 1, accent: acc });
    case 'shaker': case 'maracas': return maracas808(rnd, { decay: T.decay || 1 });
    case 'ride': return cymbal808(rnd, { ride: true, decay: T.decay || 1 });
    case 'crash': return cymbal808(rnd, { decay: T.decay || 1 });
    case 'cowbell': return cowbell808(rnd, { tune: det });
    case 'clave': return clave808(rnd, { tune: det });
    case 'rim': return rim808(rnd);
    case 'tomh': case 'tomm': case 'toml': case 'congah': case 'congam': case 'congal': return tom808(rnd, kind, { tune: (T.kick || 1) ** 0.5 * det, decay: T.decay || 1 });
    case 'tom': return tom808(rnd, 'toml', { tune: (T.kick || 1) ** 0.5 * det, decay: T.decay || 1 });
    default: return null;
  }
}
