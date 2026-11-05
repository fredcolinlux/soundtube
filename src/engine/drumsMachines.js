// Boîtes à rythmes « TR-606 », « TR-707 » et « DR-110 » : synthèse maison en JavaScript (aucun échantillon).
// Les noms de modèles décrivent le caractère visé, d'après le principe de leurs circuits :
//  - TR-606 (analogique, 1981) : grosse caisse courte et sèche, caisse claire 2 corps + bruit, charleston
//    métallique très aigu (banque de carrés), toms ronds — le compagnon « acid / électro minimal » de la 303 ;
//  - TR-707 (hybride numérique, 1985) : frappes « PCM 6 bits » imitées (résolution et fréquence réduites,
//    repliement), kick punchy, caisse claire nette, clap large, cowbell et tambourin — house de Chicago, synthwave ;
//  - DR-110 « Dr. Rhythm » (analogique bon marché, 1983) : kick « toc » mat, snare tout en bruit, charleston
//    ticking, clap filtré — boîte de chambre lo-fi / dream-pop.
import { SR, svf, noise } from './dsp.js';

const TAU = Math.PI * 2;
const sat = (b, d) => { const k = Math.tanh(d); for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * d) / k; return b; };
const env = (b, fn) => { for (let i = 0; i < b.length; i++) b[i] *= fn(i / SR); return b; };
const atk = (t, a = 0.0005) => Math.min(1, t / a);

/** Banque de carrés inharmoniques (charleston analogique). */
function metal(n, rnd, freqs) {
  const m = new Float32Array(n), ph = freqs.map(() => rnd());
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < freqs.length; k++) { ph[k] += freqs[k] / SR; if (ph[k] >= 1) ph[k] -= 1; s += ph[k] < 0.5 ? 1 : -1; } m[i] = s / freqs.length; }
  return m;
}
/** Grosse caisse générique : sinus à chute de hauteur, clic d'attaque. */
function kickCore(rnd, { f0, fHi, tauP, tau, click, len, drive }) {
  const n = Math.ceil(len * SR), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = f0 + (fHi - f0) * Math.exp(-t / tauP);
    ph += f / SR;
    out[i] = Math.sin(TAU * ph) * Math.exp(-t / tau) * atk(t, 0.0006);
  }
  const cN = Math.floor(0.003 * SR);
  for (let i = 0; i < cN; i++) out[i] += (1 - i / cN) ** 2 * click * (i < 6 ? 1 : rnd() - 0.5);
  sat(out, drive);
  const f = Math.floor(0.02 * SR); for (let i = 0; i < f; i++) out[n - 1 - i] *= i / f;
  return out;
}
/** Réduction « PCM » : bloqueur d'échantillons (fréquence réduite) + quantification (bits). */
function pcm(b, rate, bits) {
  const step = SR / rate, q = 2 ** (bits - 1); let acc = 0, hold = 0;
  for (let i = 0; i < b.length; i++) { if (acc <= 0) { hold = Math.round(b[i] * q) / q; acc += step; } acc -= 1; b[i] = hold; }
  return svf(b, Math.min(rate * 0.45, 16000), 0.6, 'lp');
}

// ---------------------------------------------------------------- TR-606
const M606 = [245, 306, 365, 415, 437, 619];
function drum606(kind, rnd, T, acc, det) {
  switch (kind) {
    case 'kick': case 'boom':
      return kickCore(rnd, { f0: 58 * (T.kick || 1) * det, fHi: 150, tauP: 0.006, tau: (kind === 'boom' ? 0.16 : 0.075) * (T.kickDecay ?? T.decay ?? 1), click: 0.35 + 0.15 * acc, len: kind === 'boom' ? 0.8 : 0.4, drive: 1.6 + 0.3 * acc });
    case 'snare': {
      const n = Math.ceil(0.25 * SR), out = new Float32Array(n), nz = svf(noise(n, rnd), 2500, 0.8, 'hp');
      let p1 = rnd(), p2 = rnd();
      for (let i = 0; i < n; i++) {
        const t = i / SR; p1 += 220 * (T.snare || 1) * det / SR; p2 += 340 * (T.snare || 1) * det / SR;
        const tri = (p) => 4 * Math.abs((p % 1) - 0.5) - 1;
        out[i] = (0.6 * tri(p1) * Math.exp(-t / 0.03) + 0.35 * tri(p2) * Math.exp(-t / 0.02) + nz[i] * 0.8 * Math.exp(-t / (0.055 * (T.decay || 1)))) * atk(t);
      }
      return sat(out, 1.4);
    }
    case 'clap': { // la 606 n'a pas de clap : snare bruitée doublée
      const n = Math.ceil(0.3 * SR), nz = svf(noise(n, rnd), 1300, 1.1, 'bp');
      return sat(env(nz, (t) => (t < 0.008 || (t > 0.012 && t < 0.02) ? 1 : Math.exp(-(t - 0.02) / 0.09)) * atk(t)), 1.5);
    }
    case 'hat': case 'ohat': {
      const open = kind === 'ohat', n = Math.ceil((open ? 0.45 : 0.08) * SR);
      const b = svf(svf(metal(n, rnd, M606.map((f) => f * (T.hat || 1) ** 0.5 * det)), 9500, 1.8, 'bp'), 7500, 0.7, 'hp');
      const d = open ? 0.12 * (T.decay || 1) ** 0.7 : 0.014 * (0.9 + 0.1 * acc);
      return env(b, (t) => atk(t, 0.0002) * Math.exp(-t / d));
    }
    case 'crash': case 'ride': {
      const ride = kind === 'ride', n = Math.ceil((ride ? 1 : 1.6) * SR);
      const m = metal(n, rnd, M606.map((f) => f * (ride ? 1.3 : 1)));
      const b = svf(svf(m, 7000, 1.2, 'bp'), 4000, 0.7, 'hp');
      return env(b, (t) => atk(t) * Math.exp(-t / (ride ? 0.3 : 0.6)));
    }
    case 'tomh': case 'tomm': case 'toml': case 'tom': case 'congah': case 'congam': case 'congal': {
      const F = { tomh: 220, tomm: 165, toml: 120, tom: 120, congah: 330, congam: 262, congal: 196 }[kind] * (T.kick || 1) ** 0.5 * det;
      const n = Math.ceil(0.5 * SR), out = new Float32Array(n); let ph = 0;
      for (let i = 0; i < n; i++) { const t = i / SR; ph += F * (1 + 0.25 * Math.exp(-t / 0.02)) / SR; out[i] = Math.sin(TAU * ph) * Math.exp(-t / 0.14) * atk(t); }
      return sat(out, 1.3);
    }
    case 'shaker': case 'maracas': {
      const n = Math.ceil(0.06 * SR); return env(svf(noise(n, rnd), 8000, 0.7, 'hp'), (t) => Math.min(1, t / 0.003) * Math.exp(-t / 0.015));
    }
    case 'rim': case 'clave': case 'cowbell': return pingTone(rnd, kind === 'cowbell' ? [587, 845] : kind === 'clave' ? [2450] : [1750, 480], kind === 'cowbell' ? 0.08 : 0.015);
    default: return null;
  }
}
function pingTone(rnd, freqs, tau) {
  const n = Math.ceil(Math.min(0.5, tau * 7 + 0.03) * SR), out = new Float32Array(n), ph = freqs.map(() => rnd());
  for (let i = 0; i < n; i++) {
    const t = i / SR; let s = 0;
    for (let k = 0; k < freqs.length; k++) { ph[k] += freqs[k] / SR; s += ph[k] % 1 < 0.5 ? 1 : -1; }
    out[i] = s / freqs.length * Math.exp(-t / tau) * atk(t, 0.0003);
  }
  return sat(svf(out, freqs[0] * 1.6, 1.4, 'bp'), 1.8);
}

// ---------------------------------------------------------------- TR-707 (numérique 6 bits imité)
function drum707(kind, rnd, T, acc, det) {
  const dec = T.decay || 1;
  switch (kind) {
    case 'kick': case 'boom': {
      const k = kickCore(rnd, { f0: 52 * (T.kick || 1) * det, fHi: 210, tauP: 0.012, tau: (kind === 'boom' ? 0.2 : 0.11) * (T.kickDecay ?? dec), click: 0.6 + 0.2 * acc, len: kind === 'boom' ? 0.9 : 0.45, drive: 2.1 });
      return pcm(k, 25000, 8);
    }
    case 'snare': {
      const n = Math.ceil(0.28 * SR), out = new Float32Array(n), nz = svf(noise(n, rnd), 1500, 0.6, 'hp');
      let p1 = rnd(), p2 = rnd();
      for (let i = 0; i < n; i++) {
        const t = i / SR; p1 += 185 * (T.snare || 1) * det * (1 + 0.3 * Math.exp(-t / 0.01)) / SR; p2 += 330 * (T.snare || 1) * det / SR;
        out[i] = (0.75 * Math.sin(TAU * p1) * Math.exp(-t / 0.04) + 0.3 * Math.sin(TAU * p2) * Math.exp(-t / 0.03) + nz[i] * Math.exp(-t / (0.09 * dec))) * atk(t);
      }
      return pcm(sat(out, 1.8), 25000, 6);
    }
    case 'clap': {
      const n = Math.ceil(0.45 * SR), bp = svf(noise(n, rnd), 1150, 1.0, 'bp'), out = new Float32Array(n);
      const hits = [0, 0.009, 0.018, 0.027].map((x) => x * (1 + (rnd() - 0.5) * 0.1));
      for (let i = 0; i < n; i++) {
        const t = i / SR; let a = 0;
        for (const h of hits) if (t >= h && t < h + 0.008) a = Math.max(a, 1 - (t - h) / 0.008);
        const tail = t > hits[3] ? Math.exp(-(t - hits[3]) / (0.13 * dec)) : 0;
        out[i] = bp[i] * (a + tail * 0.8);
      }
      return pcm(sat(out, 1.6), 25000, 6);
    }
    case 'hat': case 'ohat': {
      const open = kind === 'ohat', n = Math.ceil((open ? 0.5 : 0.09) * SR);
      const m = metal(n, rnd, [317, 428, 563, 691, 812, 1047].map((f) => f * (T.hat || 1) ** 0.5 * det)), nz = noise(n, rnd);
      for (let i = 0; i < n; i++) m[i] = m[i] * 0.6 + nz[i] * 0.4;
      const b = svf(m, 7800, 0.7, 'hp');
      env(b, (t) => atk(t, 0.0002) * Math.exp(-t / (open ? 0.16 * dec ** 0.7 : 0.022)));
      return pcm(b, 25000, 6);
    }
    case 'crash': case 'ride': {
      const ride = kind === 'ride', n = Math.ceil((ride ? 1.2 : 2) * SR);
      const m = metal(n, rnd, [347, 511, 689, 873, 1131, 1489].map((f) => f * (ride ? 1.5 : 1))), nz = noise(n, rnd);
      for (let i = 0; i < n; i++) m[i] = m[i] * 0.5 + nz[i] * (ride ? 0.2 : 0.5);
      const b = svf(m, ride ? 5000 : 3500, 0.7, 'hp');
      return pcm(env(b, (t) => atk(t) * Math.exp(-t / (ride ? 0.35 : 0.8))), 25000, 6);
    }
    case 'cowbell': return pcm(pingTone(rnd, [562, 845], 0.07), 25000, 6);
    case 'rim': return pcm(pingTone(rnd, [1650, 520], 0.012), 25000, 6);
    case 'clave': return pcm(pingTone(rnd, [2500], 0.02), 25000, 6);
    case 'shaker': case 'maracas': { // tambourin 707 : jingles métalliques + bruit
      const n = Math.ceil(0.22 * SR), m = metal(n, rnd, [2400, 3100, 4300, 5200]), nz = noise(n, rnd);
      for (let i = 0; i < n; i++) m[i] = m[i] * 0.4 + nz[i] * 0.6;
      return pcm(env(svf(m, 6000, 0.7, 'hp'), (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.05)), 25000, 6);
    }
    case 'tomh': case 'tomm': case 'toml': case 'tom': case 'congah': case 'congam': case 'congal': {
      const F = { tomh: 200, tomm: 150, toml: 105, tom: 105, congah: 340, congam: 270, congal: 200 }[kind] * (T.kick || 1) ** 0.5 * det;
      const n = Math.ceil(0.6 * SR), out = new Float32Array(n), nz = svf(noise(n, rnd), 1200, 0.7, 'lp'); let ph = 0;
      for (let i = 0; i < n; i++) { const t = i / SR; ph += F * (1 + 0.4 * Math.exp(-t / 0.03)) / SR; out[i] = (Math.sin(TAU * ph) + nz[i] * 0.15 * Math.exp(-t / 0.03)) * Math.exp(-t / 0.18) * atk(t); }
      return pcm(sat(out, 1.4), 25000, 6);
    }
    default: return null;
  }
}

// ---------------------------------------------------------------- DR-110
function drumDR(kind, rnd, T, acc, det) {
  switch (kind) {
    case 'kick': case 'boom': { // « toc » : sinus court très amorti + bruit filtré
      const k = kickCore(rnd, { f0: 68 * (T.kick || 1) * det, fHi: 120, tauP: 0.01, tau: (kind === 'boom' ? 0.12 : 0.06) * (T.kickDecay ?? T.decay ?? 1), click: 0.25, len: 0.35, drive: 1.3 });
      const nz = svf(noise(k.length, rnd), 400, 0.8, 'lp');
      for (let i = 0; i < k.length; i++) k[i] += nz[i] * 0.4 * Math.exp(-i / SR / 0.012);
      return k;
    }
    case 'snare': { // presque tout en bruit, un peu de corps
      const n = Math.ceil(0.22 * SR), out = svf(noise(n, rnd), 3000 * (T.snare || 1), 0.9, 'bp');
      let p = rnd();
      for (let i = 0; i < n; i++) { const t = i / SR; p += 250 * det / SR; out[i] = (out[i] * Math.exp(-t / (0.06 * (T.decay || 1))) + 0.3 * Math.sin(TAU * p) * Math.exp(-t / 0.015)) * atk(t); }
      return sat(out, 1.5);
    }
    case 'clap': {
      const n = Math.ceil(0.35 * SR), bp = svf(noise(n, rnd), 1600, 1.6, 'bp'), out = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / SR; const a = (t % 0.01 < 0.006 && t < 0.03) ? 1 : t >= 0.03 ? Math.exp(-(t - 0.03) / 0.07) * 0.7 : 0.2; out[i] = bp[i] * a; }
      return sat(out, 1.4);
    }
    case 'hat': case 'ohat': {
      const open = kind === 'ohat', n = Math.ceil((open ? 0.35 : 0.06) * SR);
      const b = svf(svf(metal(n, rnd, [410, 520, 680, 830].map((f) => f * (T.hat || 1) ** 0.5 * det)), 10500, 2.5, 'bp'), 8000, 0.7, 'hp');
      return env(b, (t) => atk(t, 0.0002) * Math.exp(-t / (open ? 0.09 : 0.01)));
    }
    case 'crash': case 'ride': {
      const ride = kind === 'ride', n = Math.ceil((ride ? 0.9 : 1.3) * SR);
      const b = svf(svf(metal(n, rnd, [410, 520, 680, 830, 1130]), 8000, 1.4, 'bp'), 5000, 0.7, 'hp');
      return env(b, (t) => atk(t) * Math.exp(-t / (ride ? 0.25 : 0.45)));
    }
    case 'tomh': case 'tomm': case 'toml': case 'tom': case 'congah': case 'congam': case 'congal': return drum606(kind, rnd, T, acc, det);
    case 'shaker': case 'maracas': return drum606('shaker', rnd, T, acc, det);
    case 'rim': case 'clave': case 'cowbell': return pingTone(rnd, kind === 'cowbell' ? [600, 870] : kind === 'clave' ? [2300] : [1900, 500], kind === 'cowbell' ? 0.06 : 0.012);
    default: return null;
  }
}

export const MACHINE_KITS = ['tr606', 'tr707', 'dr110'];
/** Point d'entrée : un élément (mono) de la boîte choisie, ou null (non couvert). */
export function drumMachine(kit, kind, rnd, tune, layer = 1, rr = 0) {
  const T = tune || {}, det = 1 + (rr - 1) * 0.006;
  const fn = kit === 'tr606' ? drum606 : kit === 'tr707' ? drum707 : kit === 'dr110' ? drumDR : null;
  return fn ? fn(kind, rnd, T, layer, det) : null;
}
