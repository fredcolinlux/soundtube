// Instruments synthétisés : patchs soustractifs, FM, Karplus-Strong, 808, batterie et textures.
import { SR, oscSample, adsr, svf, onePoleLP, onePoleHP, noise } from './dsp.js';
import { midiToFreq } from './theory.js';
import { playSampled, isSampledPatch, sampledFallback, drumSample, drumHit, drumZone, drumLevels, extZone, PIANO_SOUNDS } from './sampler.js';
import { makeRng, hashSeed } from './rng.js';
import { drum909, ride909 } from './drums909.js';
import { drum808 } from './drums808.js';
import { drumMachine, MACHINE_KITS } from './drumsMachines.js';
import { renderVintage, VINTAGE_PATCHES } from './synthsVintage.js';
import { hornSection, orchStab, ambCafe, ambEtude } from './lofidsp.js';
export { VINTAGE_PATCHES };

const TAU = Math.PI * 2;

// ---------- patchs soustractifs génériques
const SUB = {
  polysynth: { osc: [['saw', -8, 0.5], ['saw', 8, 0.5]], cut: 1700, env: 1600, q: 0.8, fa: 0.01, fd: 0.5, amp: [0.02, 0.3, 0.7, 0.45], gain: 0.5, drift: 3 },
  sawlead:   { osc: [['saw', -6, 0.45], ['saw', 6, 0.45], ['square', -1200, 0.25]], cut: 2200, env: 2200, q: 1.2, fa: 0.005, fd: 0.35, amp: [0.01, 0.2, 0.8, 0.25], vib: [5.2, 14, 0.25], gain: 0.5, drift: 3 },
  sawbass:   { osc: [['saw', 0, 0.6], ['square', -1200, 0.4]], cut: 500, env: 1100, q: 1.4, fa: 0.002, fd: 0.16, amp: [0.004, 0.15, 0.7, 0.07], gain: 0.75, drift: 3 },
  housebass: { osc: [['sine', 0, 0.8], ['saw', 0, 0.25]], cut: 420, env: 500, q: 1, fa: 0.002, fd: 0.12, amp: [0.004, 0.2, 0.6, 0.06], gain: 0.9 },
  softbass:  { osc: [['tri', 0, 0.6], ['sine', 0, 0.6]], cut: 650, env: 300, q: 0.7, fa: 0.01, fd: 0.2, amp: [0.01, 0.3, 0.65, 0.1], gain: 0.9 },
  subdrone:  { osc: [['sine', 0, 0.9], ['tri', 1200, 0.15]], cut: 500, env: 0, q: 0.7, amp: [1.5, 1, 0.8, 2.0], gain: 0.7 },
  cellobass: { osc: [['saw', -5, 0.5], ['saw', 5, 0.5]], cut: 800, env: 400, q: 0.9, fa: 0.08, fd: 0.4, amp: [0.07, 0.3, 0.8, 0.3], vib: [5, 8, 0.3], gain: 0.6, drift: 3 },
  tribass:   { osc: [['tri', 0, 1]], cut: 8000, env: 0, q: 0.7, amp: [0.002, 0.05, 0.9, 0.02], gain: 0.9, quant: 16 },
  square:    { osc: [['square', 0, 0.6]], cut: 9000, env: 0, q: 0.7, amp: [0.002, 0.1, 0.7, 0.04], vib: [6, 18, 0.15], gain: 0.45 },
  pulse:     { osc: [['pulse', 0, 0.6, 0.25]], cut: 9000, env: 0, q: 0.7, amp: [0.002, 0.08, 0.5, 0.03], gain: 0.4 },
  chiparp:   { osc: [['pulse', 0, 0.6, 0.125]], cut: 9000, env: 0, q: 0.7, amp: [0.001, 0.06, 0.6, 0.02], gain: 0.35 },
  warmpad:   { osc: [['saw', -12, 0.3], ['saw', 11, 0.3], ['saw', 3, 0.2], ['sine', 0, 0.5]], cut: 1100, env: 300, q: 0.6, fa: 1.2, fd: 2, amp: [1.4, 1, 0.85, 2.5], gain: 0.4, drift: 3 },
  darkpad:   { osc: [['saw', -10, 0.35], ['saw', 10, 0.35], ['square', -1200, 0.2]], cut: 650, env: 250, q: 0.9, fa: 0.6, fd: 1.5, amp: [0.7, 0.8, 0.8, 1.4], gain: 0.42, drift: 3 },
  strings:   { osc: [['saw', -14, 0.22], ['saw', -5, 0.22], ['saw', 4, 0.22], ['saw', 13, 0.22], ['saw', 0, 0.2]], cut: 2000, env: 500, q: 0.6, fa: 0.4, fd: 0.8, amp: [0.35, 0.5, 0.85, 0.8], vib: [5.5, 9, 0.3], gain: 0.42, drift: 3 },
  horn:      { osc: [['saw', -4, 0.5], ['saw', 4, 0.5]], cut: 700, env: 1600, q: 0.9, fa: 0.09, fd: 0.5, amp: [0.06, 0.3, 0.9, 0.3], vib: [5, 10, 0.35], gain: 0.5, drift: 3 },
  staccato:  { osc: [['saw', -6, 0.5], ['saw', 6, 0.5]], cut: 1500, env: 900, q: 0.8, fa: 0.003, fd: 0.1, amp: [0.004, 0.12, 0.3, 0.07], gain: 0.45 },
  stab:      { osc: [['saw', -10, 0.45], ['saw', 10, 0.45], ['square', 0, 0.2]], cut: 1200, env: 2600, q: 1.1, fa: 0.002, fd: 0.13, amp: [0.003, 0.22, 0.3, 0.1], gain: 0.45, drift: 3 },
  arpsaw:    { osc: [['saw', 0, 0.7], ['saw', 7, 0.3]], cut: 1300, env: 2600, q: 2, fa: 0.002, fd: 0.11, amp: [0.002, 0.14, 0.25, 0.08], gain: 0.45, drift: 3 },
  // --- synthwave « produite » : supersaw désaccordée, pad Juno, lead avec portamento, basse analogique
  supersaw:  { osc: [['saw', -21, 0.2], ['saw', -13, 0.2], ['saw', -6, 0.2], ['saw', 0, 0.22], ['saw', 6, 0.2], ['saw', 13, 0.2], ['saw', 21, 0.2], ['sine', -1200, 0.12]], cut: 2300, env: 2200, q: 0.7, fa: 0.02, fd: 0.9, amp: [0.04, 0.6, 0.78, 1.1], gain: 0.33, drift: 5 },
  junopad:   { osc: [['saw', -4, 0.4], ['pulse', 4, 0.4, 0.38], ['saw', 1195, 0.08]], cut: 1500, env: 900, q: 0.8, fa: 0.35, fd: 1.6, amp: [0.35, 0.8, 0.85, 1.5], gain: 0.42, drift: 6 },
  synthlead: { osc: [['saw', -7, 0.42], ['saw', 7, 0.42], ['square', -1200, 0.18]], cut: 1700, env: 2600, q: 1.3, fa: 0.012, fd: 0.45, amp: [0.012, 0.25, 0.82, 0.5], vib: [5.4, 16, 0.32], gain: 0.5, drift: 4, glide: 0.075 },
  analogbass:{ osc: [['saw', -3, 0.55], ['square', -1197, 0.45]], cut: 380, env: 1500, q: 1.6, fa: 0.002, fd: 0.13, amp: [0.003, 0.14, 0.72, 0.1], gain: 0.8, drift: 3, glide: 0.04 },
  // --- synthwave 80s v2 : patches liés (longues relâches, glide)
  jupiterpad:{ osc: [['saw', -16, 0.18], ['saw', -9, 0.18], ['saw', -3, 0.18], ['saw', 3, 0.18], ['saw', 9, 0.18], ['saw', 16, 0.18], ['saw', -1200, 0.14]], cut: 1700, env: 800, q: 0.6, fa: 0.55, fd: 2.4, amp: [0.38, 1.0, 0.9, 1.7], gain: 0.33, drift: 6 },
  brass80:   { osc: [['saw', -8, 0.45], ['saw', 8, 0.45], ['saw', -1200, 0.15]], cut: 650, env: 2300, q: 0.7, fa: 0.07, fd: 0.4, amp: [0.025, 0.3, 0.8, 0.45], vib: [5, 7, 0.45], gain: 0.45, drift: 4, glide: 0.06 },
  bass80:    { osc: [['saw', -4, 0.5], ['pulse', -1195, 0.5, 0.4]], cut: 430, env: 1100, q: 1.2, fa: 0.003, fd: 0.22, amp: [0.004, 0.25, 0.82, 0.16], gain: 0.8, drift: 3, glide: 0.045 },
  arp80:     { osc: [['saw', -5, 0.5], ['pulse', 5, 0.42, 0.3]], cut: 1500, env: 2400, q: 1.5, fa: 0.002, fd: 0.16, amp: [0.002, 0.2, 0.4, 0.24], gain: 0.42, drift: 3 },
  // --- hip-hop / drum & bass
  subbass:   { osc: [['sine', 0, 0.95], ['tri', 0, 0.18]], cut: 900, env: 250, q: 0.7, fa: 0.003, fd: 0.15, amp: [0.004, 0.4, 0.75, 0.08], gain: 0.95 },
  dnbsub:    { osc: [['sine', 0, 1], ['sine', 1200, 0.06]], cut: 600, env: 0, q: 0.7, amp: [0.003, 0.2, 0.92, 0.05], gain: 0.95, glide: 0.09 },
  liquidpad: { osc: [['saw', -9, 0.26], ['saw', 9, 0.26], ['pulse', 2, 0.22, 0.42], ['sine', 1200, 0.1]], cut: 1500, env: 700, q: 0.65, fa: 0.5, fd: 2.2, amp: [0.45, 1, 0.82, 1.9], vib: [4.6, 5, 0.6], gain: 0.38, drift: 5 },
  mellow:    { osc: [['tri', 0, 0.7], ['sine', 1200, 0.15], ['sine', 0, 0.4]], cut: 2200, env: 400, q: 0.7, fa: 0.03, fd: 0.3, amp: [0.03, 0.3, 0.75, 0.3], vib: [4.5, 10, 0.3], gain: 0.5 },
};

/** Applique les paramètres de timbre de la recette (coupure, enveloppes, désaccord, vibrato, forme d'onde). */
const toneCache = new WeakMap();
function toned(p, T) {
  if (!T) return p;
  let m = toneCache.get(T); if (!m) { m = new Map(); toneCache.set(T, m); }
  if (m.has(p)) return m.get(p);
  const swap = (type) => (T.wave && type !== 'sine' && type !== 'pulse' ? T.wave : type);
  const q = {
    ...p,
    cut: p.cut < 8000 ? Math.min(7800, p.cut * T.cut) : p.cut, env: p.env * T.env,
    fa: (p.fa || 0.01) * T.att, fd: (p.fd || 0.3) * T.env,
    amp: [p.amp[0] * T.att, p.amp[1], p.amp[2], p.amp[3] * T.rel],
    osc: p.osc.map(([type, c, g, pw]) => [swap(type), Math.abs(c) >= 1200 ? c : c * T.det, g * (swap(type) === 'square' && type !== 'square' ? 0.75 : 1), pw]),
    vib: p.vib ? [p.vib[0], p.vib[1] * T.vib, p.vib[2]] : (T.vib > 1.2 ? [5, 8 * (T.vib - 1.2) * 3, 0.3] : undefined),
  };
  m.set(p, q); return q;
}

function subtractive(p, f, gateS, vel, o) {
  const tail = p.amp[3] + 0.02;
  const n = Math.ceil((gateS + tail) * SR);
  const gate = Math.floor(gateS * SR);
  const env = adsr(n, p.amp[0], p.amp[1], p.amp[2], p.amp[3], gate);
  const buf = new Float32Array(n);
  const bright = o.bright || 1;
  const glideN = o.port ? Math.round((p.glide || 0.07) * SR) : 0;
  const portR = o.port ? Math.pow(2, (o.port - 12 * Math.log2(f / 8.175798915643707)) / 12) : 1; // rapport fréquence départ/arrivée
  for (const [type, cents, g, pw] of p.osc) {
    const drift = p.drift && o.rnd ? (o.rnd() * 2 - 1) * p.drift : 0;
    const fr = f * Math.pow(2, (cents + drift) / 1200);
    let ph = o.rnd ? o.rnd() : 0;
    const lfoF = 0.15 + (o.rnd ? o.rnd() : 0.5) * 0.4, lfoP = o.rnd ? o.rnd() * TAU : 0, lfoD = p.drift ? p.drift * 0.6 / 1200 : 0;
    let dt = fr / SR;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) { // modulations calculées au taux de contrôle (1/16)
        let ff = fr;
        if (lfoD) ff *= 1 + lfoD * 0.693 * Math.sin(lfoP + TAU * lfoF * i / SR);
        if (i < glideN) ff *= Math.pow(portR, 1 - i / glideN);
        if (p.vib) { const t = i / SR; if (t > p.vib[2]) ff *= Math.pow(2, (p.vib[1] / 1200) * Math.sin(TAU * p.vib[0] * t) * Math.min(1, (t - p.vib[2]) * 3)); }
        dt = ff / SR;
      }
      buf[i] += g * oscSample(type, ph, dt, pw ?? 0.5);
      ph += dt; if (ph >= 1) ph -= 1;
    }
  }
  if (p.quant) for (let i = 0; i < n; i++) buf[i] = Math.round(buf[i] * p.quant) / p.quant;
  let out = buf;
  if (p.cut < 8000) {
    const fa = (p.fa || 0.01) * SR, fd = (p.fd || 0.3) * SR;
    const base = p.cut * bright * (0.7 + 0.5 * vel), envAmt = p.env * bright * vel;
    out = svf(buf, (i) => {
      const fe = i < fa ? i / fa : Math.exp(-(i - fa) / fd);
      return base + envAmt * fe;
    }, p.q);
  }
  for (let i = 0; i < n; i++) out[i] *= env[i] * p.gain * vel;
  return out;
}

// ---------- FM
function fmEpiano(f, gateS, vel, T = {}) {
  const im = T.index || 1, dm = T.rel || 1;
  const rel = 0.35, n = Math.ceil((gateS + rel) * SR), gate = Math.floor(gateS * SR);
  const out = new Float32Array(n);
  let pc = 0, pm = 0, pt = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const idx = ((1.6 * vel + 0.4) * Math.exp(-t * 2.5) + 0.25) * im;
    const m = Math.sin(TAU * pm) * idx;
    const tine = Math.sin(TAU * pt) * 0.25 * Math.exp(-t * 18) * vel;
    let a = Math.min(1, i / 60) * Math.exp(-t * 0.9 / dm);
    if (i >= gate) { const k = (i - gate) / (rel * SR); a *= Math.max(0, 1 - k) ** 2; }
    out[i] = (Math.sin(TAU * pc + m) + tine) * a * 0.45 * vel * (1 + 0.06 * Math.sin(TAU * 4.5 * t));
    pc += f / SR; pm += f / SR; pt += (f * 14) / SR;
    if (pc > 1) pc -= 1; if (pm > 1) pm -= 1; if (pt > 1) pt -= 1;
  }
  return out;
}

function fmBell(f, gateS, vel, T = {}) {
  const ratio = T.ratio || 3.5, im = T.index || 1;
  const len = Math.min(6, gateS + 2.5), n = Math.ceil(len * SR);
  const out = new Float32Array(n);
  let pc = 0, pm = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const m = Math.sin(TAU * pm) * 2.6 * im * Math.exp(-t * 1.8);
    out[i] = Math.sin(TAU * pc + m) * Math.min(1, i / 40) * Math.exp(-t * 1.1) * 0.35 * vel;
    pc += f / SR; pm += (f * ratio) / SR; if (pc > 1) pc -= 1; if (pm > 1) pm -= 1;
  }
  return out;
}

function pluck(f, gateS, vel, rnd, T = {}) {
  const n = Math.ceil((gateS + 0.6) * SR);
  const N = Math.max(2, Math.round(SR / f));
  const line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = rnd() * 2 - 1;
  onePoleLP(line, (4000 + 4000 * vel) * (T.cut || 1));
  const out = new Float32Array(n); let idx = 0, prev = 0;
  const decay = T.decay || 0.996, gate = Math.floor(gateS * SR);
  for (let i = 0; i < n; i++) {
    const cur = line[idx];
    const y = (cur + prev) * 0.5 * decay;
    prev = cur; line[idx] = y;
    let a = 1; if (i > gate) a = Math.max(0, 1 - (i - gate) / (0.6 * SR));
    out[i] = cur * 0.9 * vel * a;
    if (++idx >= N) idx = 0;
  }
  return out;
}

function acid(f, gateS, vel, accent, high = false, T = {}, bright = 1) {
  const n = Math.ceil((gateS + 0.05) * SR), gate = Math.floor(gateS * SR);
  const buf = new Float32Array(n); let ph = 0; const dt = f / SR;
  for (let i = 0; i < n; i++) { buf[i] = oscSample('saw', ph, dt); ph += dt; if (ph >= 1) ph -= 1; }
  // bright (automatisation « knob » cutoff/env-mod) : 0,25 = fermé, 1,8 = grand ouvert
  const kb = Math.max(0.25, Math.min(1.8, bright));
  const peak = (accent ? 2600 : 1400) * (high ? 1.4 : 1) * (T.cut || 1) * kb ** 1.3, dec = (accent ? 0.18 : 0.11) * SR * (T.env || 1) * (0.7 + 0.3 * kb);
  const base = 150 + 110 * kb;
  const out = svf(buf, (i) => base + peak * Math.exp(-i / dec), 5 + 3 * ((T.index || 1) - 0.6));
  for (let i = 0; i < n; i++) {
    const a = i < gate ? Math.min(1, i / 40) : Math.max(0, 1 - (i - gate) / (0.05 * SR));
    out[i] = Math.tanh(out[i] * 1.8) * a * 0.42 * vel;
  }
  return out;
}

function bass808(f, gateS, vel, glideTo, T = {}) {
  const drv = 2.2 * (T.cut || 1), dk = 0.9 / (T.rel || 1);
  const len = Math.max(0.5, gateS) + 0.08, n = Math.ceil(len * SR), gate = Math.floor(Math.max(0.5, gateS) * SR);
  const out = new Float32Array(n); let ph = 0;
  const fg = glideTo ? midiToFreq(glideTo) : f;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let ff = f * (1 + 1.5 * Math.exp(-t * 60));
    if (glideTo && t > len * 0.55) ff = f * Math.pow(fg / f, Math.min(1, (t - len * 0.55) / 0.09));
    ph += ff / SR; if (ph >= 1) ph -= 1;
    let a = Math.exp(-t * dk) * Math.min(1, i / 30);
    if (i > gate) a *= Math.max(0, 1 - (i - gate) / (0.08 * SR));
    out[i] = Math.tanh(Math.sin(TAU * ph) * drv) * 0.62 * a * vel * (2.2 / Math.max(2.2, drv)) ** 0.3;
  }
  return out;
}

// ---------- basse reese (drum & bass) : 3 dents de scie désaccordées, filtre passe-bas modulé (LFO synchronisable), sub sinus propre, saturation
function reese(f, gateS, vel, o = {}, neuro = false) {
  const T = o.tone || {}, rnd = o.rnd || Math.random;
  const rel = 0.07, n = Math.ceil((gateS + rel) * SR), gate = Math.floor(gateS * SR);
  const raw = new Float32Array(n), sub = new Float32Array(n);
  const det = (neuro ? 22 : 13) * (T.det || 1);
  const glideN = o.port ? Math.round(0.08 * SR) : 0;
  const portR = o.port ? Math.pow(2, (o.port - 12 * Math.log2(f / 8.175798915643707)) / 12) : 1;
  const ph = [rnd(), rnd(), rnd()], cents = [-det, 0.3 * det, det];
  let sp = 0;
  for (let i = 0; i < n; i++) {
    const gl = i < glideN ? Math.pow(portR, 1 - i / glideN) : 1;
    let s = 0;
    for (let k = 0; k < 3; k++) { const dt = f * gl * Math.pow(2, cents[k] / 1200) / SR; ph[k] += dt; if (ph[k] >= 1) ph[k] -= 1; s += oscSample('saw', ph[k], dt); }
    raw[i] = s / 3;
    sp += f * gl / SR; if (sp >= 1) sp -= 1; sub[i] = Math.sin(TAU * sp);
  }
  // LFO : lent (liquid), synchronisé au tempo et plus profond (neuro)
  const bpm = o.bpm || 172, wob = o.wob || 1;
  const lfoHz = neuro ? (bpm / 60) / wob : 0.35 + rnd() * 0.3, depth = neuro ? 0.75 : 0.35;
  const base = (neuro ? 520 : 380) * (T.cut || 1) * (o.bright || 1) * (o.acc ? 1.5 : 1), lp0 = rnd() * TAU;
  const out = svf(raw, (i) => base * (1 + depth * (0.5 + 0.5 * Math.sin(lp0 + TAU * lfoHz * i / SR))) + (o.acc ? 1400 * Math.exp(-i / (0.07 * SR)) : 0), neuro ? 2.2 : 1.2);
  const drv = neuro ? 3.2 : 1.8;
  for (let i = 0; i < n; i++) {
    let a = Math.min(1, i / (0.004 * SR)); if (i > gate) a *= Math.max(0, 1 - (i - gate) / (rel * SR));
    // le sub reste propre (mono, sans saturation) sous le grain de la reese
    out[i] = (Math.tanh(out[i] * drv) * (neuro ? 0.42 : 0.34) + sub[i] * 0.55) * a * vel * 0.9;
  }
  return out;
}

// ---------- basse « 909 » : grosse caisse 909 accordée sur la note (balayage + clic + saturation), tenue pendant la note
function bass909(f, gateS, vel, T = {}) {
  const g = Math.max(0.12, gateS), rel = 0.06 * (T.rel || 1), len = g + rel + 0.02, n = Math.ceil(len * SR), gate = Math.floor(g * SR);
  const out = new Float32Array(n), drv = 1.6 + 1.2 * (T.cut || 1) * vel;
  const fHi = f * (4.2 + 1.5 * vel), tauP = 0.014, tauA = 0.28 * (T.env || 1), floor = 0.32;
  let ph = 0, nzs = (0x9e3779b9 ^ Math.floor(f * 1000)) >>> 0;
  const rnd = () => ((nzs = (nzs * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (f + (fHi - f) * Math.exp(-t / tauP)) / SR;
    const p = ph - Math.floor(ph);
    const w = 0.8 * Math.sin(TAU * ph) + 0.2 * (4 * Math.abs(p - Math.floor(p + 0.5)) - 1);
    let a = (floor + (1 - floor) * Math.exp(-t / tauA)) * Math.min(1, t / 0.0005);
    if (i > gate) a *= Math.max(0, 1 - (i - gate) / (rel * SR));
    let s = w * a;
    if (t < 0.003) s += (rnd() * 2 - 1) * 0.45 * vel * (1 - t / 0.003); // clic d'attaque
    out[i] = Math.tanh(s * drv) / Math.tanh(drv) * 0.7 * vel;
  }
  return out;
}

// ---------- piano électrique « Rhodes » (modèle physique simplifié : lame + diapason, micro asymétrique)
function rhodes(f, gateS, vel, rnd, T = {}) {
  const rel = 0.16 * (T.rel || 1), n = Math.ceil((gateS + rel) * SR), gate = Math.floor(gateS * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const midi = 12 * Math.log2(f / 8.1758);
  const t60 = Math.max(1.2, 6.5 - (midi - 36) * 0.09) * (T.rel || 1); // les graves tiennent plus longtemps
  const dk = 6.9 / t60;
  const bark = 0.15 + 0.85 * vel * vel;                 // « grognement » du micro aux attaques fortes
  const tineF = f * (6.8 + (rnd() - 0.5) * 0.5), tineD = 30 + midi * 0.4;
  const trF = 4.2 + rnd() * 1.2, trP = rnd() * TAU, trD = 0.28 * (T.vib != null ? Math.min(1.5, T.vib) : 1);
  const det = 1 + (rnd() * 2 - 1) * 0.0007;
  let p1 = 0, p2 = 0, p3 = 0, hp = 0, hz = 0;
  const hamN = Math.floor(0.004 * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let a = Math.exp(-t * dk) * Math.min(1, i / 25);
    if (i >= gate) a *= Math.exp(-(i - gate) / (0.045 * SR)); // étouffoir
    const x = Math.sin(TAU * p1) + 0.12 * Math.sin(TAU * p2) * Math.exp(-t * 3)
      + 0.5 * vel * Math.sin(TAU * p3) * Math.exp(-t * tineD);
    // micro électromagnétique : non-linéarité asymétrique -> harmoniques paires
    let y = (x + bark * 0.45 * x * x - 0.08 * x * x * x) * a;
    if (i < hamN) { const nz = (rnd() * 2 - 1) * (1 - i / hamN) * 0.35 * vel; hz += (nz - hz) * 0.3; y += hz; }
    const out = y - hp; hp += out * 0.0045; // anti-continu
    const tr = 1 + trD * Math.sin(trP + TAU * trF * t);
    const s = out * 0.42 * vel;
    L[i] = s * tr; R[i] = s * (2 - tr);
    p1 += f * det / SR; p2 += f * 2.0 / SR; p3 += tineF / SR;
    if (p1 > 1) p1 -= 1; if (p2 > 1) p2 -= 1; if (p3 > 1) p3 -= 1;
  }
  onePoleLP(L, 5200 + 5000 * vel); onePoleLP(R, 5200 + 5000 * vel);
  return { L, R };
}

// ---------- corde pincée Karplus-Strong étendue (accord fractionnaire, position du médiator, caisse)
function ksString(f, gateS, vel, rnd, { bright = 1, decay = 1, pick = 0.18, body = 0.35, mute = false, rel = 0.12 } = {}) {
  const ring = mute ? Math.min(gateS, 0.25) : gateS;
  const n = Math.ceil((ring + rel + (mute ? 0.05 : 0.4)) * SR), gate = Math.floor(ring * SR);
  const midi = 12 * Math.log2(f / 8.1758);
  const damp = mute ? 0.45 : Math.min(0.5, 0.5 * (0.55 + 0.4 * bright)); // retard du filtre de boucle = damp
  const period = SR / f, N = Math.max(2, Math.floor(period - damp - 0.1)), frac = period - damp - N; // + passe-tout fractionnaire
  const ap = (1 - frac) / (1 + frac);
  const line = new Float32Array(N);
  // excitation : bruit filtré + peigne de position du médiator
  let lp = 0; const ec = Math.min(0.95, (0.25 + 0.6 * vel) * bright);
  const ex = new Float32Array(N); for (let i = 0; i < N; i++) { lp += ((rnd() * 2 - 1) - lp) * ec; ex[i] = lp; }
  const pd = Math.max(1, Math.floor(N * pick));
  for (let i = 0; i < N; i++) line[i] = ex[i] - (i >= pd ? ex[i - pd] : 0) * 0.9;
  const out = new Float32Array(n);
  const loss = mute ? 0.93 : Math.min(0.9995, (0.9965 + (60 - midi) * 0.00004) * (0.9985 + 0.0015 * decay));
  let w = 0, prev = 0, apz = 0, apx = 0;
  for (let i = 0; i < n; i++) {
    const cur = line[w];
    let y = ((1 - damp) * cur + damp * prev) * (i >= gate ? loss * 0.985 : loss);
    prev = cur;
    const z = ap * (y - apz) + apx; apx = y; apz = z; y = z;
    line[w] = y;
    out[i] = cur * (i >= gate ? Math.max(0, 1 - (i - gate) / (rel * SR)) : 1);
    if (++w >= N) w = 0;
  }
  // caisse de résonance : quelques modes larges
  if (body > 0) {
    const b1 = svf(out, 105, 2.2, 'bp'), b2 = svf(out, 230, 1.8, 'bp'), b3 = svf(out, 480, 1.4, 'bp');
    for (let i = 0; i < n; i++) out[i] = out[i] * (1 - body * 0.4) + (b1[i] * 1.2 + b2[i] * 0.9 + b3[i] * 0.6) * body;
  }
  onePoleLP(out, mute ? 2500 : 9000 * Math.min(1.3, bright));
  for (let i = 0; i < n; i++) out[i] *= 0.75 * vel;
  return out;
}

/** Rendu d'une note mélodique pour un patch donné (mono : Float32Array, stéréo : { L, R }). */
export function renderNote(patch, midi, gateS, vel, o = {}) {
  const f = midiToFreq(midi);
  // v1.6 : « Son de piano » (Steinway B / Salamander / piano droit) et Rhodes échantillonné (jRhodes3d) ou synthétisé
  if (patch === 'piano' && o.pianoSound && PIANO_SOUNDS[o.pianoSound]) patch = PIANO_SOUNDS[o.pianoSound];
  if (patch === 'rhodes') patch = o.rhodesSound === 'synth' ? 'rhodes_synth' : 'rhodes_s';
  if (isSampledPatch(patch)) {
    const r = playSampled(patch, midi, gateS, vel, { rnd: o.rnd, bright: o.bright, relMul: o.tone?.rel, att: o.tone?.att });
    if (r) return r;
    patch = sampledFallback(patch);
    if (isSampledPatch(patch)) { const r2 = playSampled(patch, midi, gateS, vel, { rnd: o.rnd, bright: o.bright, relMul: o.tone?.rel, att: o.tone?.att }); if (r2) return r2; patch = sampledFallback(patch); }
  }
  switch (patch) {
    case 'rhodes': case 'rhodes_synth': return rhodes(f, gateS, vel, o.rnd || Math.random, o.tone);
    case 'guitar': return ksString(f, gateS, vel, o.rnd || Math.random, { bright: (o.bright || 1) * (o.tone?.cut || 1), decay: 1, pick: 0.13 + 0.1 * ((o.tone?.ratio || 3) / 4.2), body: 0.4 });
    case 'mutedguitar': return ksString(f, gateS, vel, o.rnd || Math.random, { bright: 0.7 * (o.bright || 1), mute: true, pick: 0.2, body: 0.3 });
    case 'epiano': return fmEpiano(f, gateS, vel, o.tone);
    case 'bell': return fmBell(f, gateS, vel, o.tone);
    case 'pluck': return pluck(f, gateS, vel, o.rnd || Math.random, o.tone);
    case 'acid': return acid(f, gateS, vel, o.acc, false, o.tone, o.bright || 1);
    case 'acidarp': return acid(f, gateS, vel * 0.8, false, true, o.tone, o.bright || 1);
    case '808': return bass808(f, gateS, vel, o.glide, o.tone);
    case '909': return bass909(f, gateS, vel, o.tone);
    case 'reese': return reese(f, gateS, vel, o, false);
    case 'neuro': return reese(f, gateS, vel, o, true);
    case 'hornsect': return hornSection(f, gateS, vel, o.rnd || Math.random); // v1.11.0 : cuivres en stabs (beatmaker)
    case 'orchstab': return orchStab(f, gateS, vel, o.rnd || Math.random);
    case 'dx7epiano': case 'dx7bass': case 'dx7bell': case 'moogbass': case 'mooglead': case 'junopoly': case 'arplead': case 'talkbox': case 'vocoder': return renderVintage(patch, f, gateS, vel, o);
    default: return subtractive(toned(SUB[patch] || SUB.polysynth, o.tone), f, gateS, vel, o);
  }
}

// ---------- batterie
function sweepKick({ f0, f1, pd, ad, click = 0.3, drive = 1, lp = 0, square = false, dur = 0.6 }, rnd) {
  const n = Math.ceil(dur * SR), out = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t / pd);
    ph += f / SR; if (ph >= 1) ph -= 1;
    let s = square ? (ph < 0.5 ? 1 : -1) * 0.6 : Math.sin(TAU * ph);
    s = Math.tanh(s * drive) * Math.exp(-t / ad);
    if (t < 0.004) s += (rnd() * 2 - 1) * click * (1 - t / 0.004);
    out[i] = s;
  }
  if (lp) onePoleLP(out, lp);
  return out;
}

function noiseHit({ dur, decay, hp = 0, lp = 0, bp = 0, q = 1, tone = 0, toneDecay = 0.05, toneGain = 0, attack = 0.001, quant = 0 }, rnd) {
  const n = Math.ceil(dur * SR);
  let nz = noise(n, rnd);
  if (quant) { let held = 0; for (let i = 0; i < n; i++) { if (i % quant === 0) held = nz[i] > 0 ? 1 : -1; nz[i] = held; } }
  if (hp) nz = svf(nz, hp, 0.7, 'hp');
  if (bp) nz = svf(nz, bp, q, 'bp');
  if (lp) nz = svf(nz, lp, 0.7, 'lp');
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const a = Math.min(1, t / attack) * Math.exp(-t / decay);
    let s = nz[i] * a;
    if (toneGain) { ph += tone / SR; s += Math.sin(TAU * ph) * toneGain * Math.exp(-t / toneDecay); }
    out(i, s);
  }
  function out(i, s) { nz[i] = s; }
  return nz;
}

function clap(rnd, lp = 0) {
  const n = Math.ceil(0.4 * SR); let nz = svf(noise(n, rnd), 1300, 1.4, 'bp');
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let a = 0;
    for (const o of [0, 0.011, 0.022]) if (t >= o) a = Math.max(a, Math.exp(-(t - o) / 0.008));
    if (t > 0.022) a = Math.max(a, 0.6 * Math.exp(-(t - 0.022) / 0.12));
    nz[i] *= a * 1.6;
  }
  if (lp) onePoleLP(nz, lp);
  return nz;
}

function crash(rnd) {
  const n = Math.ceil(2.2 * SR); let nz = svf(noise(n, rnd), 5000, 0.7, 'hp');
  const parts = [427, 563, 811, 1031, 1393, 1677];
  const ph = parts.map(() => 0);
  for (let i = 0; i < n; i++) {
    const t = i / SR; let m = 0;
    for (let k = 0; k < parts.length; k++) { ph[k] += parts[k] / SR; m += (ph[k] % 1 < 0.5 ? 1 : -1); }
    nz[i] = (nz[i] * 0.8 + m * 0.03) * Math.exp(-t / 0.7) * 0.6;
  }
  return nz;
}

const KITS = {
  lofi:   { kick: { f0: 140, f1: 50, pd: 0.03, ad: 0.25, click: 0.1, lp: 3000 }, snare: { dur: 0.3, decay: 0.09, bp: 1800, q: 0.6, lp: 5000, tone: 185, toneGain: 0.5, toneDecay: 0.05 }, hat: { dur: 0.08, decay: 0.022, hp: 6500, lp: 9000 } },
  soft:   { kick: { f0: 90, f1: 42, pd: 0.05, ad: 0.4, click: 0, lp: 1500 } },
  retro:  { kick: { f0: 170, f1: 48, pd: 0.03, ad: 0.32, click: 0.4, drive: 1.3 }, snare: { dur: 0.45, decay: 0.16, hp: 900, tone: 200, toneGain: 0.6, toneDecay: 0.06 }, hat: { dur: 0.06, decay: 0.018, hp: 8000 } },
  house:  { kick: { f0: 160, f1: 50, pd: 0.025, ad: 0.3, click: 0.35, drive: 1.4 }, snare: { dur: 0.3, decay: 0.1, hp: 1200, tone: 210, toneGain: 0.4 }, hat: { dur: 0.05, decay: 0.014, hp: 9000 } },
  techno: { kick: { f0: 190, f1: 44, pd: 0.022, ad: 0.36, click: 0.4, drive: 2.4 }, snare: { dur: 0.25, decay: 0.08, hp: 1500, tone: 220, toneGain: 0.3 }, hat: { dur: 0.05, decay: 0.012, hp: 9500 } },
  chip:   { kick: { f0: 220, f1: 50, pd: 0.02, ad: 0.12, square: true, click: 0, dur: 0.25 }, snare: { dur: 0.18, decay: 0.06, quant: 4, tone: 180, toneGain: 0.3 }, hat: { dur: 0.04, decay: 0.012, quant: 2, hp: 6000 } },
  trap:   { kick: { f0: 170, f1: 52, pd: 0.03, ad: 0.22, click: 0.3, drive: 1.6 }, snare: { dur: 0.3, decay: 0.11, hp: 1000, bp: 0, tone: 195, toneGain: 0.45 }, hat: { dur: 0.04, decay: 0.012, hp: 9000 } },
  // boom-bap : grosse caisse ronde et sourde, caisse claire « claquante », charleys sombres (son SP-1200 / MPC 60)
  boombap:{ kick: { f0: 120, f1: 48, pd: 0.035, ad: 0.3, click: 0.25, drive: 1.6, lp: 2600, sub: 0.6, sat: 1.8 }, snare: { dur: 0.32, decay: 0.11, hp: 900, lp: 7000, tone: 180, toneGain: 0.6, toneDecay: 0.05 }, hat: { dur: 0.07, decay: 0.02, hp: 6800, lp: 9500 } },
  // drum & bass : grosse caisse courte et sèche, caisse claire haute et brillante
  dnb:    { kick: { f0: 180, f1: 55, pd: 0.018, ad: 0.17, click: 0.45, drive: 1.5, sub: 0.35 }, snare: { dur: 0.28, decay: 0.09, hp: 1300, tone: 240, toneGain: 0.55, toneDecay: 0.035, bright: 1.2 }, hat: { dur: 0.04, decay: 0.011, hp: 9500 } },
  // break jungle reconstruit : timbres « échantillonnés » (filtrés, saturés), aucun extrait de disque
  break:  { kick: { f0: 140, f1: 52, pd: 0.025, ad: 0.2, click: 0.35, drive: 1.8, lp: 4500, sat: 2 }, snare: { dur: 0.26, decay: 0.085, hp: 1000, lp: 8500, tone: 215, toneGain: 0.65, toneDecay: 0.03 }, hat: { dur: 0.05, decay: 0.014, hp: 7500, lp: 11000 } },
  cinema: { kick: { f0: 110, f1: 40, pd: 0.05, ad: 0.6, click: 0.2, dur: 1 }, snare: { dur: 0.6, decay: 0.2, hp: 600, tone: 160, toneGain: 0.5, toneDecay: 0.1 }, hat: { dur: 0.06, decay: 0.02, hp: 7000 } },
};

KITS.hhlofi = KITS.lofi; // repli synthétique du kit hip-hop lo-fi acoustique

/** Grosse caisse en couches : corps (balayage), sub (sinus tenu), clic (batteur), saturation. */
function layeredKick(k, rnd) {
  const body = sweepKick({ ...k, click: 0 }, rnd);
  const n = body.length, out = new Float32Array(n);
  const subF = k.f1 * 1.0, subD = k.ad * 1.5 * (k.subDecay || 1), subA = k.sub ?? 0.5;
  const clickA = k.click ?? 0.3, cN = Math.floor(0.006 * SR);
  let ph = 0, hp = 0, prevN = 0, cph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += subF / SR; if (ph >= 1) ph -= 1;
    let s = body[i] + Math.sin(TAU * ph) * subA * Math.exp(-t / subD) * Math.min(1, i / 120);
    if (i < cN) {
      const nz = rnd() * 2 - 1; hp = 0.6 * (hp + nz - prevN); prevN = nz; // bruit passe-haut
      cph += 1700 / SR;
      s += (hp * 0.6 + Math.sin(TAU * cph) * 0.5) * clickA * (1 - i / cN) ** 2;
    }
    out[i] = s;
  }
  const d = k.sat || 1.4; for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * d) / Math.tanh(d);
  if (k.lp) onePoleLP(out, k.lp);
  return out;
}

/** Caisse claire synthétique : deux modes de peau (avec chute de hauteur) + timbre (bruit), saturée. */
function synthSnare(K, rnd) {
  const dur = Math.max(0.2, K.dur || 0.3), n = Math.ceil(dur * SR), out = new Float32Array(n);
  const f1 = K.tone || 190, f2 = f1 * 1.62, td = K.toneDecay || 0.05, tg = K.toneGain ?? 0.45;
  let nz = noise(n, rnd);
  const wires = svf(nz, 4200 * (K.bright || 1), 0.7, 'bp'), hiss = svf(nz, K.hp || 1000, 0.7, 'hp');
  let p1 = 0, p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, drop = 1 + 0.08 * Math.exp(-t / 0.012);
    p1 += f1 * drop / SR; p2 += f2 * drop / SR; if (p1 > 1) p1 -= 1; if (p2 > 1) p2 -= 1;
    const head = (Math.sin(TAU * p1) * Math.exp(-t / td) + 0.55 * Math.sin(TAU * p2) * Math.exp(-t / (td * 0.6))) * tg;
    const sn = (wires[i] * 0.9 + hiss[i] * 0.55) * Math.min(1, t / 0.0008) * Math.exp(-t / (K.decay || 0.1));
    out[i] = Math.tanh((head + sn) * 1.6);
  }
  if (K.lp) onePoleLP(out, K.lp);
  return out;
}

/** Charleston métallique façon 808/909 : 6 carrés inharmoniques + bruit, filtrés passe-bande/passe-haut. */
function metalHat(K, rnd, open = false) {
  const dur = open ? 0.55 : Math.max(0.06, (K.dur || 0.05) * 1.4), n = Math.ceil(dur * SR);
  const sc = Math.sqrt((K.hp || 8000) / 8000) * (1 + (rnd() - 0.5) * 0.01);
  const fr = [205.3, 304.4, 369.6, 522.7, 540, 800].map((x) => x * sc * 1.7);
  const ph = fr.map(() => rnd()), m = new Float32Array(n), nz = noise(n, rnd);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < 6; k++) { ph[k] += fr[k] / SR; if (ph[k] >= 1) ph[k] -= 1; s += ph[k] < 0.5 ? 1 : -1; } m[i] = s / 6 * 0.8 + nz[i] * 0.35; }
  let o = svf(m, 10500 * sc, 1.3, 'bp'); o = svf(o, (K.hp || 8000) * 0.9, 0.7, 'hp');
  const dec = open ? 0.16 * (K.decay ? K.decay / 0.014 : 1) ** 0.5 : (K.decay || 0.014) * 1.15;
  for (let i = 0; i < n; i++) { const t = i / SR; o[i] *= Math.min(1, t / 0.0005) * Math.exp(-t / dec) * 2.2; }
  if (K.lp) onePoleLP(o, K.lp);
  return o;
}

// Couches d'échantillons CC0 par kit : id (pack), lp (Hz), pitch, synth (part du son synthétique mélangé)
const KIT_SAMPLES = {
  lofi:   { snare: { id: 'snare', lp: 6500, pitch: 0.92, synth: 0.25, sat: 1.8 }, hat: { id: 'hat', lp: 8500, pitch: 0.97 }, ohat: { id: 'ohat', lp: 8000 }, rim: { id: 'rim', lp: 7000 }, shaker: { id: 'shaker', lp: 9000 }, clap: { id: 'clap', lp: 6500, synth: 0.2 }, crash: { id: 'crash', lp: 7000 }, tomh: { id: 'tomh', lp: 6000 }, tomm: { id: 'toml', pitch: 1.12, lp: 6000 }, toml: { id: 'toml', lp: 6000 } },
  soft:   { snare: { id: 'snare_ghost', lp: 6000 }, hat: { id: 'hat', lp: 7000, pitch: 0.95 }, ohat: { id: 'ohat', lp: 7000 }, rim: { id: 'rim', lp: 6000 }, shaker: { id: 'shaker', lp: 8000 }, crash: { id: 'swell' }, clap: { id: 'clap', lp: 5000 } },
  retro:  { snare: { id: 'snare', synth: 0.7, pitch: 0.96 }, clap: { id: 'clap', synth: 0.5 }, shaker: { id: 'tamb' }, crash: { id: 'crash' } },
  house:  { clap: { id: 'clap', synth: 0.45 }, shaker: { id: 'shaker' }, crash: { id: 'crash' }, rim: { id: 'rim', synth: 0.4 } },
  techno: { clap: { id: 'clap', synth: 0.6, hp: 400 }, shaker: { id: 'shaker' }, crash: { id: 'crash', lp: 9000 } },
  trap:   { clap: { id: 'clap', synth: 0.5 }, snare: { id: 'clap', synth: 1, amt: 0.45 }, shaker: { id: 'shaker' }, crash: { id: 'crash' } },
  cinema: { snare: { id: 'snare', synth: 0.15 }, hat: { id: 'hat' }, ohat: { id: 'ohat' }, boom: { id: 'bassdrum', layerMin: 1, synth: 0.6 }, tom: { id: 'timpani' }, crash: { id: 'crash' }, shaker: { id: 'tamb' }, tomh: { id: 'tomh' }, tomm: { id: 'toml', pitch: 1.12 }, toml: { id: 'toml' }, rim: { id: 'rim' }, clap: { id: 'clap' } },
  boombap:{ snare: { id: 'snare', lp: 8000, pitch: 0.95, synth: 0.4, sat: 1.5 }, hat: { id: 'hat', lp: 8000, pitch: 0.94 }, ohat: { id: 'ohat', lp: 7500 }, rim: { id: 'rim', lp: 7500 }, shaker: { id: 'shaker', lp: 8500 }, clap: { id: 'clap', lp: 7000, synth: 0.3 }, crash: { id: 'crash', lp: 7000 }, tamb: { id: 'tamb', lp: 8000 }, tomh: { id: 'tomh', lp: 6500 }, tomm: { id: 'toml', pitch: 1.12, lp: 6500 }, toml: { id: 'toml', lp: 6500 } },
  dnb:    { snare: { id: 'snare', pitch: 1.1, synth: 0.55, hp: 180 }, hat: { id: 'hat', pitch: 1.05 }, ohat: { id: 'ohat' }, rim: { id: 'rim', synth: 0.3 }, shaker: { id: 'shaker' }, crash: { id: 'crash' }, tamb: { id: 'tamb' } },
  break:  { snare: { id: 'snare', pitch: 1.06, synth: 0.45, lp: 9000, sat: 2.4 }, hat: { id: 'hat', lp: 9000 }, ohat: { id: 'ohat', lp: 8500 }, rim: { id: 'rim', lp: 8000 }, shaker: { id: 'shaker', lp: 9000 }, crash: { id: 'crash', lp: 8000 }, tamb: { id: 'tamb', lp: 8500 }, tomh: { id: 'tomh', lp: 7000 }, tomm: { id: 'toml', pitch: 1.12, lp: 7000 }, toml: { id: 'toml', lp: 7000 } },
  chip:   {},
};
KIT_SAMPLES.hhlofi = KIT_SAMPLES.lofi;
const DRUM_PEAK = { cowbell: 0.7, clave: 0.7, congah: 0.85, congam: 0.85, congal: 0.85, maracas: 0.5, ride: 0.6, kick: 1, boom: 1, snare: 0.92, clap: 0.9, hat: 0.6, ohat: 0.6, rim: 0.75, shaker: 0.5, crash: 0.7, tom: 0.95, tomh: 0.9, tomm: 0.9, toml: 0.9 };

// ---------- kits acoustiques v1.6 : Virtuosity Drums + Frankensnare (CC0), micros pré-mixés (tools/premix-drums.mjs).
// Timbre = couche de vélocité (4), niveau = vélocité : aucune normalisation crête par frappe (seulement un réglage
// par couche, d'après le RMS d'attaque du manifeste). Notes fantômes jouées avec la caisse claire « étouffée ».
const ACOUSTIC = {
  boombap: { kick: { id: 'vd_kick', pitch: 0.97, synth: 0.34 }, snare: { id: 'vd_snare', pitch: 0.98 }, ghost: { id: 'vd_ghost' }, rim: { id: 'vd_xstick' }, clap: { id: 'fs_clap' },
    hat: { id: 'vd_hat' }, hhalf: { id: 'vd_hhalf' }, ohat: { id: 'vd_ohat' }, ride: { id: 'vd_ride' }, crash: { id: 'vd_crash' } },
  // hip-hop lo-fi : micro « lofi » de Virtuosity (son de pièce compressé, sans filtre ajouté)
  hhlofi:  { kick: { id: 'vl_kick', synth: 0.42, synthKit: 'lofi' }, snare: { id: 'vl_snare', pitch: 0.97 }, ghost: { id: 'vl_ghost', pitch: 0.97 }, rim: { id: 'vl_xstick' }, clap: { id: 'fs_clap' },
    hat: { id: 'vl_hat' }, ohat: { id: 'vl_ohat' }, ride: { id: 'vd_ride' }, crash: { id: 'vd_crash' } },
  dnb:     { kick: { id: 'vd_kick', pitch: 1.05, synth: 0.45 }, snare: { id: 'fs_tight' }, ghost: { id: 'vd_ghost', pitch: 1.05 }, rim: { id: 'vd_rimshot' }, clap: { id: 'fs_clap' },
    hat: { id: 'vd_hat', pitch: 1.03 }, hhalf: { id: 'vd_hhalf', pitch: 1.03 }, ohat: { id: 'vd_ohat' }, ride: { id: 'vd_ride' }, crash: { id: 'vd_crash' } },
  // jungle : break reconstruit coup par coup (aucun extrait de disque) — caisse claire rimshot accordée vers le haut
  break:   { kick: { id: 'vd_kick', pitch: 1.07, synth: 0.35 }, snare: { id: 'fs_rimshot', pitch: 1.07 }, ghost: { id: 'vd_ghost', pitch: 1.08 }, rim: { id: 'vd_xstick', pitch: 1.06 }, clap: { id: 'fs_clap' },
    hat: { id: 'vd_hat', pitch: 1.06 }, hhalf: { id: 'vd_hhalf', pitch: 1.06 }, ohat: { id: 'vd_ohat', pitch: 1.06 }, ride: { id: 'vd_ride', pitch: 1.04 }, crash: { id: 'vd_crash' } },
  // v1.21.4 : « Mes samples » — dossier externe (NAS) indexé dans Admin ; un fichier par catégorie et par morceau (graine).
  // Catégorie absente → élément de synthèse du style (kit « house ») ; ni kick ni caisse claire → kit entièrement synthétisé.
  user:    { kick: { id: 'ext_kick', ext: true }, snare: { id: 'ext_snare', ext: true }, ghost: { id: 'ext_snare', ext: true, as: 'snare' }, rim: { id: 'ext_rim', ext: true }, clap: { id: 'ext_clap', ext: true },
    hat: { id: 'ext_hat', ext: true }, ohat: { id: 'ext_ohat', ext: true }, ride: { id: 'ext_ride', ext: true }, crash: { id: 'ext_crash', ext: true } },
};
const LAYER_TILT = [0.8, 0.88, 0.94, 1];
// niveau par élément (les prises acoustiques ont plus de facteur de crête que la synthèse) : rééquilibre le kit
// sur la balance des bus réglée en v1.5 (kick -> charleys ≈ même écart RMS)
const ACOUSTIC_TRIM = { kick: 1.4, snare: 1.6, ghost: 1.6, hat: 2.0, hhalf: 1.8, ohat: 1.6, ride: 2.8, clap: 1.7, crash: 1.4, rim: 1.0 };
export function isAcousticKit(kit) { const a = ACOUSTIC[kit]; return !!a && !!drumLevels(a.snare.id) && !!drumLevels(a.kick.id); }
export function acousticHas(kit, kind) { const m = ACOUSTIC[kit]?.[kind]; return !!m && !!drumLevels(m.id); }
/** Vélocité -> [couche (4), position dans la couche 0..1] ; notes fantômes : 4 couches sur la plage basse. */
const LAYER_EDGES = [0, 0.5, 0.72, 0.9, 1.08], GHOST_EDGES = [0.1, 0.2, 0.26, 0.32, 0.4];
export function acousticLayer(v, ghost) {
  const E = ghost ? GHOST_EDGES : LAYER_EDGES;
  let l = 0; while (l < 3 && v >= E[l + 1]) l++;
  return [l, Math.max(0, Math.min(1, (v - E[l]) / (E[l + 1] - E[l])))];
}
// cache partagé (tous les decks d'un mix, tous les morceaux du processus), LRU borné
const AC_CAP = (+process.env.SOUNDTUBE_DRUM_CACHE_MB || 64) * 1e6;
const acCache = new Map(); let acBytes = 0;
export function drumCacheStats() { return { hits: acCache.size, mb: +(acBytes / 1e6).toFixed(1) }; }
/**
 * Frappe acoustique (mono). kind : kick, snare, ghost, rim, clap, hat, hhalf, ohat, ride, crash. Renvoie null si non couvert.
 * Le gain final (vélocité) est appliqué par le mélangeur ; ici seule la couche choisit le timbre.
 */
export function acousticDrum(kit, kind, v, rr, tune) {
  const map = ACOUSTIC[kit]?.[kind]; if (!map) return null;
  const lv = drumLevels(map.id); if (!lv) return null;
  const [layer, sub] = acousticLayer(v, kind === 'ghost');
  const z = map.ext ? extZone(map.id, tune?.extSeed ?? 0, map.as || kind) : drumZone(map.id, layer, rr, sub);
  if (!z) return null;
  const tk = kind === 'kick' ? (tune?.kickTune ?? tune?.kick) : kind === 'snare' || kind === 'ghost' || kind === 'rim' ? tune?.snare : tune?.hat;
  const tq = Math.round(Math.max(0.96, Math.min(1.04, Math.sqrt(tk || 1))) * 100) / 100; // accord quantifié (partage du cache)
  const pitch = (map.pitch || 1) * tq;
  const key = kit + '|' + kind + '|' + z.file + '|' + (map.synth ? layer + '|' + (rr % 3) : '') + '|' + tq;
  let o = acCache.get(key);
  if (o) { acCache.delete(key); acCache.set(key, o); return o; }
  const hit = { data: drumHit(z, pitch), layer: z.layer };
  // réglage par couche : RMS de couche ramené sur une pente douce ; échelle d'instrument : crête max -> DRUM_PEAK
  const top = lv.layers[lv.layers.length - 1];
  const lg = (l) => LAYER_TILT[Math.min(3, Math.round(l * 3 / Math.max(1, top)))] * lv.rms[top] / lv.rms[l];
  // échelle d'instrument : crête de la couche la plus forte -> DRUM_PEAK ; les couches douces ne dépassent jamais 1
  const target = DRUM_PEAK[kind === 'ghost' ? 'snare' : kind === 'hhalf' ? 'ohat' : kind] || 0.9;
  const base = target / (lv.peak[top] * lg(top));
  // dans une couche, l'écart naturel entre niveaux de frappe est gardé mais adouci (racine) pour rester continu d'une couche à l'autre
  const zg = z.rms ? Math.sqrt(lv.rms[hit.layer] / z.rms) : 1;
  // v1.21.4 : samples externes (sources hétérogènes) → crête de chaque fichier ramenée sur celle de l'élément de synthèse
  const scale = map.ext ? target / Math.max(1e-4, z.peak) : Math.min(base * lg(hit.layer) * zg, 1 / z.peak) * (ACOUSTIC_TRIM[kind] || 1);
  o = hit.data; for (let i = 0; i < o.length; i++) o[i] *= scale;
  if (map.synth && kind === 'kick') {
    // couche légère de la grosse caisse de synthèse du style (poids dans le sub, attaque)
    const sk = map.synthKit || kit;
    const sy = synthDrum(sk, 'kick', makeRng(hashSeed('ackick', kit, layer, rr, tq)), { snare: 1, hat: 1, decay: 1, ...(tune || {}), kick: tq * tq, kickTune: tq * tq }, rr % 3);
    norm(sy, (DRUM_PEAK.kick || 1) * map.synth * LAYER_TILT[Math.min(3, layer)]);
    o = mixInto(o, sy);
  }
  const f = Math.min(o.length, 256); for (let i = 0; i < f; i++) o[o.length - 1 - i] *= i / f;
  acCache.set(key, o); acBytes += o.byteLength;
  while (acBytes > AC_CAP && acCache.size > 1) { const [k0, v0] = acCache.entries().next().value; acCache.delete(k0); acBytes -= v0.byteLength; }
  return o;
}

/** Queue de réverbération « gated » (son de batterie années 80). */
function gatedTail(rnd, hold = 0.24, bp = 1400, amt = 0.6) {
  const n = Math.ceil((hold + 0.03) * SR), nz = svf(noise(n, rnd), bp, 0.45, 'bp');
  onePoleLP(nz, 7000);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let a = Math.min(1, t / 0.006) * (0.75 + 0.25 * Math.exp(-t / 0.08));
    if (t > hold) a *= Math.max(0, 1 - (t - hold) / 0.025);
    nz[i] *= a * amt;
  }
  return nz;
}
function mixInto(a, b) { const n = Math.max(a.length, b.length), o = new Float32Array(n); for (let i = 0; i < a.length; i++) o[i] += a[i]; for (let i = 0; i < b.length; i++) o[i] += b[i]; return o; }

/** Synthèse seule d'un élément de batterie (mono). */
function synthDrum(kitName, kind, rnd, tune, rr) {
  const det = 1 + (rr - 1) * 0.012; // micro-variations entre frappes (round-robin)
  const K0 = KITS[kitName] || KITS.house;
  let K = K0;
  if (tune) {
    const kk = K0.kick || KITS.house.kick, sn = K0.snare || KITS.house.snare, hh = K0.hat || KITS.house.hat;
    K = {
      kick: { ...kk, f0: kk.f0 * (tune.kickTune ?? tune.kick), f1: kk.f1 * (0.5 + (tune.kickTune ?? tune.kick) / 2), ad: kk.ad * (tune.kickDecay ?? tune.decay) },
      snare: { ...sn, tone: (sn.tone || 190) * tune.snare, decay: sn.decay * tune.decay, ...(sn.bp ? { bp: sn.bp * tune.snare } : {}) },
      hat: { ...hh, hp: (hh.hp || 7000) * tune.hat, decay: hh.decay * (0.6 + 0.4 * tune.decay) },
    };
  }
  switch (kind) {
    case 'kick': { const k = K.kick || KITS.house.kick; return kitName === 'chip' ? sweepKick(k, rnd) : layeredKick({ ...k, f0: k.f0 * det, ad: k.ad * (2 - det) }, rnd); }
    case 'snare': { const sn = { ...(K.snare || KITS.house.snare) }; sn.tone = (sn.tone || 190) * det; if (kitName === 'chip') return noiseHit(sn, rnd); const body = synthSnare(sn, rnd); return kitName === 'retro' ? mixInto(body, gatedTail(rnd, 0.22 * (tune ? tune.decay : 1), 1300 * (tune ? tune.snare : 1), 0.55)) : body; }
    case 'tomh': case 'tomm': case 'toml': {
      const f0 = { tomh: 210, tomm: 160, toml: 115 }[kind] * (tune ? tune.kick : 1);
      const body = sweepKick({ f0, f1: f0 * 0.62, pd: 0.05, ad: 0.32, click: 0.25, drive: 1.3, dur: 0.6 }, rnd);
      return kitName === 'retro' ? mixInto(body, gatedTail(rnd, 0.2, f0 * 4, 0.3)) : body;
    }
    case 'clap': return clap(rnd, kitName === 'lofi' ? 5000 : 0);
    case 'hat': return kitName === 'chip' ? noiseHit(K.hat, rnd) : metalHat({ ...(K.hat || KITS.house.hat), hp: (K.hat || KITS.house.hat).hp * det }, rnd, false);
    case 'ohat': return kitName === 'chip' ? noiseHit({ ...K.hat, dur: 0.4, decay: 0.12 }, rnd) : metalHat(K.hat || KITS.house.hat, rnd, true);
    case 'rim': return noiseHit({ dur: 0.05, decay: 0.008, bp: 1700, q: 2, tone: 1700, toneGain: 0.8, toneDecay: 0.01 }, rnd);
    case 'shaker': return noiseHit({ dur: 0.12, decay: 0.035, hp: 5000, attack: 0.015 }, rnd);
    case 'tom': return kitName === 'cinema'
      ? sweepKick({ f0: 95, f1: 62, pd: 0.06, ad: 0.45, click: 0.6, drive: 1.5, dur: 1.0, lp: 2500 }, rnd)
      : sweepKick({ f0: 160, f1: 100, pd: 0.05, ad: 0.18, click: 0.2, dur: 0.4 }, rnd);
    case 'boom': return sweepKick({ f0: 70, f1: 32, pd: 0.15, ad: 1.2, click: 0.5, drive: 1.8, dur: 2.5, lp: 900 }, rnd);
    case 'crash': return crash(rnd);
    case 'ride': return ride909(rnd, { tune: 1, decay: tune ? tune.decay : 1 });
    default: return new Float32Array(10);
  }
}

/**
 * Élément de batterie (mono) pour un kit : synthèse améliorée et/ou échantillons CC0 en couches.
 * v = { layer (0..2, vélocité), rr (variante round-robin) }.
 */
export function renderDrum(kitName, kind, rnd, tune, v = {}) {
  const layer = v.layer ?? 1, rr = v.rr ?? 0;
  const map = (KIT_SAMPLES[kitName] || {})[kind];
  let out = kitName === 'tr909' ? drum909(kind, rnd, tune, layer, rr) : kitName === 'tr808' ? drum808(kind, rnd, tune, layer, rr)
    : MACHINE_KITS.includes(kitName) ? drumMachine(kitName, kind, rnd, tune, layer, rr) : null;
  if (map && !out) {
    const pitch = (map.pitch || 1) * (tune ? Math.sqrt(kind === 'snare' || kind === 'clap' ? tune.snare : kind.startsWith('tom') ? tune.kick : tune.hat || 1) : 1) * (1 + (rr - 1) * 0.008);
    const smp = drumSample(map.id, Math.max(layer, map.layerMin || 0), rr, pitch);
    if (smp) {
      if (map.hp) { const h = svf(smp, map.hp, 0.7, 'hp'); smp.set(h); }
      if (map.lp && !ACOUSTIC[kitName]) onePoleLP(smp, map.lp); // v1.6 : plus de passe-bas 7-9 kHz sur les kits acoustiques
      if (map.sat) for (let i = 0; i < smp.length; i++) smp[i] = Math.tanh(smp[i] * map.sat) / Math.tanh(map.sat);
      out = smp;
      if (map.synth) {
        const sy = synthDrum(kitName, kind, rnd, tune, rr);
        norm(sy, 1); norm(out, 1);
        const amt = map.amt ?? 1;
        for (let i = 0; i < out.length; i++) out[i] *= amt;
        for (let i = 0; i < sy.length; i++) sy[i] *= map.synth;
        out = mixInto(out, sy);
      }
    }
  }
  if (!out) out = synthDrum(kitName, kind, rnd, tune, rr);
  // petit fondu de sortie (évite les clics de troncature)
  const f = Math.min(out.length, 256); for (let i = 0; i < f; i++) out[out.length - 1 - i] *= i / f;
  norm(out, DRUM_PEAK[kind] || 0.9);
  return out;
}
function norm(b, target) { let p = 1e-9; for (let i = 0; i < b.length; i++) p = Math.max(p, Math.abs(b[i])); const g = target / p; for (let i = 0; i < b.length; i++) b[i] *= g; return b; }

// ---------- textures
export function renderTexture(kind, durS, vel, rnd, bpm, o = {}) {
  const n = Math.ceil(durS * SR);
  if (kind.startsWith('amb_')) return ambience(kind.slice(4), n, vel, rnd, o.t0 || 0, o.xf || 0);
  if (kind === 'wash') {
    const L = noise(n, rnd), R = noise(n, rnd);
    const cutF = (i) => 500 + 900 * (0.5 + 0.5 * Math.sin(TAU * 0.05 * i / SR + 1));
    const fl = svf(L, cutF, 1.2, 'bp'), fr = svf(R, cutF, 1.2, 'bp');
    for (let i = 0; i < n; i++) {
      const x = i / n; const a = Math.min(1, x / 0.3, (1 - x) / 0.3) * 0.22 * vel;
      fl[i] *= a; fr[i] *= a;
    }
    return [fl, fr];
  }
  if (kind === 'riser') {
    const L = noise(n, rnd), R = noise(n, rnd);
    const cutF = (i) => 300 * Math.pow(30, i / n);
    const fl = svf(L, cutF, 2, 'bp'), fr = svf(R, cutF, 2, 'bp');
    for (let i = 0; i < n; i++) { const a = Math.pow(i / n, 2.2) * 0.5 * vel; fl[i] *= a; fr[i] *= a; }
    return [fl, fr];
  }
  if (kind === 'impact') {
    const b = sweepKick({ f0: 80, f1: 35, pd: 0.1, ad: 0.9, click: 0.8, drive: 1.5, dur: Math.min(durS, 3), lp: 1200 }, rnd);
    for (let i = 0; i < b.length; i++) b[i] *= 0.6 * vel;
    return [b, b];
  }
  if (kind === 'vinyl') {
    const L = new Float32Array(n), R = new Float32Array(n);
    const hiss = svf(noise(n, rnd), 3500, 0.7, 'bp');
    for (let i = 0; i < n; i++) { L[i] = hiss[i] * 0.012; R[i] = hiss[(i + 777) % n] * 0.012; }
    const pops = Math.floor(durS * 9);
    for (let p = 0; p < pops; p++) {
      const at = Math.floor(rnd() * n), amp = (rnd() ** 3) * 0.25, len = 30 + Math.floor(rnd() * 80);
      const side = rnd();
      for (let k = 0; k < len && at + k < n; k++) {
        const s = (rnd() * 2 - 1) * amp * Math.exp(-k / 12);
        if (side < 0.6) L[at + k] += s; if (side > 0.4) R[at + k] += s;
      }
    }
    onePoleLP(L, 6000); onePoleLP(R, 6000);
    if (o.xf) { xfade(L, R, o.xf); for (let i = 0; i < n; i++) { L[i] *= vel; R[i] *= vel; } } // fond sonore « vinyle »
    return [L, R];
  }
  return [new Float32Array(1), new Float32Array(1)];
}

// fondus d'enchaînement (puissance constante : bruits non corrélés)
function xfade(L, R, xfS) {
  const n = L.length, xf = Math.min(Math.floor(xfS * SR), Math.floor(n / 2));
  for (let i = 0; i < xf; i++) { const g = Math.sin((Math.PI / 2) * (i / xf)); L[i] *= g; R[i] *= g; L[n - 1 - i] *= g; R[n - 1 - i] *= g; }
}
// ---------- fonds sonores synthétisés (aucun enregistrement) ; t0 = position absolue (s) pour des modulations continues d'un morceau à l'autre
function ambience(kind, n, vel, rnd, t0, xfS) {
  const L = new Float32Array(n), R = new Float32Array(n);
  const nzL = noise(n, rnd), nzR = noise(n, rnd);
  const brown = (src) => { const o = new Float32Array(src.length); let y = 0; for (let i = 0; i < src.length; i++) { y = 0.995 * y + 0.06 * src[i]; o[i] = y; } return o; };
  const T = (i) => t0 + i / SR;
  if (kind === 'pluie') {
    // nappe de pluie (bruit filtré) + gouttes (petits impacts résonants aléatoires)
    const a = svf(svf(nzL, 5200, 0.5, 'bp'), 9000, 0.7, 'lp'), b = svf(svf(nzR, 4800, 0.5, 'bp'), 9000, 0.7, 'lp');
    const lo = svf(brown(nzL), 600, 0.7, 'lp');
    for (let i = 0; i < n; i++) { const sw = 0.8 + 0.2 * Math.sin(T(i) * 0.21 + 1.3); L[i] = (a[i] * 0.05 + lo[i] * 0.03) * sw; R[i] = (b[i] * 0.05 + lo[i] * 0.03) * sw; }
    const drops = Math.floor(n / SR * 26);
    for (let d = 0; d < drops; d++) {
      const at = Math.floor(rnd() * n), f = 1800 + rnd() * 4200, amp = 0.012 + (rnd() ** 2) * 0.05, pan = rnd(), len = Math.floor(0.012 * SR);
      for (let k = 0; k < len && at + k < n; k++) { const s = Math.sin(TAU * f * k / SR) * Math.exp(-k / (0.0025 * SR)) * amp; L[at + k] += s * (1 - pan); R[at + k] += s * pan; }
    }
  } else if (kind === 'vagues') {
    // ressac : bruit passe-bas dont l'amplitude et la brillance suivent des vagues de 7 à 11 s
    const wave = (t) => { const a = 0.5 + 0.5 * Math.sin(TAU * t / 9.3), b = 0.5 + 0.5 * Math.sin(TAU * t / 7.1 + 2); return Math.pow(0.6 * a + 0.4 * b, 2.2); };
    const cutL = (i) => 350 + 2200 * wave(T(i)), cutR = (i) => 350 + 2200 * wave(T(i) + 0.6);
    const a = svf(nzL, cutL, 0.6, 'lp'), b = svf(nzR, cutR, 0.6, 'lp');
    for (let i = 0; i < n; i++) { L[i] = a[i] * (0.03 + 0.11 * wave(T(i))); R[i] = b[i] * (0.03 + 0.11 * wave(T(i) + 0.6)); }
  } else if (kind === 'vent') {
    // vent : bruit passe-bande résonant dont la fréquence et le souffle varient lentement
    const gust = (t) => 0.5 + 0.3 * Math.sin(TAU * t / 13) + 0.2 * Math.sin(TAU * t / 5.3 + 1);
    const a = svf(nzL, (i) => 280 + 900 * gust(T(i)), 3.2, 'bp'), b = svf(nzR, (i) => 300 + 950 * gust(T(i) + 1.7), 3.2, 'bp');
    for (let i = 0; i < n; i++) { L[i] = a[i] * 0.09 * gust(T(i)); R[i] = b[i] * 0.09 * gust(T(i) + 1.7); }
  } else if (kind === 'nuit') {
    // grillons (trains d'impulsions à 4,3-4,9 kHz) sur un fond d'air nocturne très doux
    const air = svf(nzL, 900, 0.6, 'lp'), air2 = svf(nzR, 900, 0.6, 'lp');
    for (let i = 0; i < n; i++) { L[i] = air[i] * 0.012; R[i] = air2[i] * 0.012; }
    for (let c = 0; c < 3; c++) {
      const f = 4300 + c * 280, rate = 1.4 + c * 0.45, pan = [0.2, 0.75, 0.5][c], off = c * 0.37;
      for (let i = 0; i < n; i++) {
        const t = T(i) + off, ph = (t * rate) % 1, on = ph < 0.22 ? Math.sin(Math.PI * ph / 0.22) : 0;
        if (!on) continue;
        const pulse = 0.5 + 0.5 * Math.sin(TAU * 32 * t), s = Math.sin(TAU * f * t) * on * pulse * 0.016 * (0.7 + 0.3 * Math.sin(TAU * t / 17 + c));
        L[i] += s * (1 - pan); R[i] += s * pan;
      }
    }
  } else if (kind === 'feu') {
    // feu : grondement grave + crépitements (impulsions courtes, plus ou moins sèches)
    const lo = svf(brown(nzL), 300, 0.7, 'lp'), lo2 = svf(brown(nzR), 300, 0.7, 'lp'), hiss = svf(nzL, 2500, 0.6, 'bp');
    for (let i = 0; i < n; i++) { const fl = 0.75 + 0.25 * Math.sin(T(i) * 1.7) * Math.sin(T(i) * 0.43); L[i] = (lo[i] * 0.09 + hiss[i] * 0.006) * fl; R[i] = (lo2[i] * 0.09 + hiss[i] * 0.006) * fl; }
    const pops = Math.floor(n / SR * 14);
    for (let p = 0; p < pops; p++) {
      const at = Math.floor(rnd() * n), amp = 0.03 + (rnd() ** 3) * 0.18, len = 40 + Math.floor(rnd() * 260), pan = rnd(), dec = 6 + rnd() * 40;
      for (let k = 0; k < len && at + k < n; k++) { const s = (rnd() * 2 - 1) * amp * Math.exp(-k / dec); L[at + k] += s * (1 - pan * 0.6); R[at + k] += s * (0.4 + pan * 0.6); }
    }
    onePoleLP(L, 7000); onePoleLP(R, 7000);
  } else if (kind === 'ville') {
    // ville lointaine : rumeur du trafic (bruit brun filtré, passages lents), souffle d'air, bourdon électrique discret
    const pass = (t) => 0.55 + 0.25 * Math.sin(TAU * t / 11) + 0.2 * Math.sin(TAU * t / 4.7 + 1);
    const a = svf(brown(nzL), (i) => 250 + 450 * pass(T(i)), 0.7, 'lp'), b = svf(brown(nzR), (i) => 250 + 450 * pass(T(i) + 2.3), 0.7, 'lp');
    const air = svf(nzL, 1500, 0.5, 'bp');
    for (let i = 0; i < n; i++) { const h = Math.sin(TAU * 100 * T(i)) * 0.002; L[i] = a[i] * 0.16 * pass(T(i)) + air[i] * 0.008 + h; R[i] = b[i] * 0.16 * pass(T(i) + 2.3) + air[i] * 0.008 + h; }
  } else if (kind === 'cafe') ambCafe(L, R, n, rnd, t0); // v1.11.0 : café (murmure sans paroles, tasses)
  else if (kind === 'etude') ambEtude(L, R, n, rnd, t0); // v1.11.0 : salle d'étude (pages, horloge)
  else if (kind === 'nuitville') {
    const [a, b] = ambience('nuit', n, 1, rnd, t0, 0), [c, d] = ambience('ville', n, 1, rnd, t0, 0);
    for (let i = 0; i < n; i++) { L[i] = a[i] + 0.07 * c[i]; R[i] = b[i] + 0.07 * d[i]; }
  }
  if (xfS) xfade(L, R, xfS);
  if (vel !== 1) for (let i = 0; i < n; i++) { L[i] *= vel; R[i] *= vel; }
  return [L, R];
}

/** Numéros GM pour l'export MIDI de la batterie. */
export const GM_DRUMS = { cowbell: 56, clave: 75, congah: 62, congam: 63, congal: 64, maracas: 70, ride: 51, tomh: 50, tomm: 47, toml: 43, kick: 36, snare: 38, clap: 39, hat: 42, ohat: 46, rim: 37, shaker: 70, tom: 45, boom: 35, crash: 49 };
