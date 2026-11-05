// Briques DSP : oscillateurs anti-repliement (polyBLEP), enveloppes, filtres SVF, réverbération, délai.
export const SR = 44100;
const TAU = Math.PI * 2;

function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

/** Échantillon d'oscillateur pour une phase [0,1) et incrément dt. */
export function oscSample(type, ph, dt, pw = 0.5) {
  switch (type) {
    case 'sine': return Math.sin(TAU * ph);
    case 'saw': return 2 * ph - 1 - blep(ph, dt);
    case 'square':
    case 'pulse': {
      let v = ph < pw ? 1 : -1;
      v += blep(ph, dt);
      v -= blep((ph + 1 - pw) % 1, dt);
      return v;
    }
    case 'tri': return 1 - 4 * Math.abs(ph - 0.5);
    default: return 0;
  }
}

/** Enveloppe ADSR (secondes) sur n échantillons, gate en échantillons. */
export function adsr(n, a, d, s, r, gate) {
  const e = new Float32Array(n);
  const A = Math.max(1, a * SR), D = Math.max(1, d * SR), R = Math.max(1, r * SR);
  let lvl = 0;
  for (let i = 0; i < n; i++) {
    if (i < gate) {
      if (i < A) lvl = i / A;
      else if (i < A + D) lvl = 1 - (1 - s) * ((i - A) / D);
      else lvl = s;
      e[i] = lvl;
    } else {
      const k = (i - gate) / R;
      e[i] = k >= 1 ? 0 : lvl * (1 - k) * (1 - k);
    }
  }
  return e;
}

/** Filtre à variables d'état (TPT) ; cutoff peut être un nombre ou une fonction(i)->Hz. */
export function svf(buf, cutoff, q = 0.707, mode = 'lp') {
  const out = new Float32Array(buf.length);
  const k = 1 / Math.max(0.1, q);
  let ic1 = 0, ic2 = 0, a1 = 0, a2 = 0, a3 = 0;
  const fn = typeof cutoff === 'function';
  const setC = (fc) => {
    fc = Math.min(SR * 0.45, Math.max(20, fc));
    const g = Math.tan(Math.PI * fc / SR);
    a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
  };
  if (!fn) setC(cutoff);
  for (let i = 0; i < buf.length; i++) {
    if (fn && (i & 15) === 0) setC(cutoff(i));
    const x = buf[i];
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    out[i] = mode === 'lp' ? v2 : mode === 'bp' ? v1 : mode === 'hp' ? x - k * v1 - v2 : v2;
  }
  return out;
}

export function onePoleLP(buf, fc) {
  const a = Math.exp(-TAU * fc / SR); let z = 0;
  for (let i = 0; i < buf.length; i++) { z = buf[i] * (1 - a) + z * a; buf[i] = z; }
  return buf;
}
export function onePoleHP(buf, fc) {
  const a = Math.exp(-TAU * fc / SR); let z = 0;
  for (let i = 0; i < buf.length; i++) { z = buf[i] * (1 - a) + z * a; buf[i] = buf[i] - z; }
  return buf;
}

export function noise(n, rnd) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = rnd() * 2 - 1;
  return b;
}

/** Réverbération type Freeverb (8 filtres en peigne + 4 passe-tout par canal). */
export function freeverb(inL, inR, { room = 0.84, damp = 0.3, wet = 1 } = {}) {
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const apT = [556, 441, 341, 225];
  const n = inL.length;
  const outL = new Float32Array(n), outR = new Float32Array(n);
  const run = (input, out, spread) => {
    for (const t of combT) {
      const len = t + spread; const buf = new Float32Array(len); let idx = 0, store = 0;
      for (let i = 0; i < n; i++) {
        const y = buf[idx];
        store = y * (1 - damp) + store * damp;
        buf[idx] = input[i] * 0.015 + store * room;
        out[i] += y;
        if (++idx >= len) idx = 0;
      }
    }
    for (const t of apT) {
      const len = t + spread; const buf = new Float32Array(len); let idx = 0;
      for (let i = 0; i < n; i++) {
        const b = buf[idx]; const x = out[i];
        out[i] = -x + b;
        buf[idx] = x + b * 0.5;
        if (++idx >= len) idx = 0;
      }
    }
    for (let i = 0; i < n; i++) out[i] *= wet;
  };
  run(inL, outL, 0); run(inR, outR, 23);
  return [outL, outR];
}

/** Délai ping-pong stéréo filtré. */
export function pingPong(inL, inR, delaySec, feedback = 0.35, lpHz = 3500) {
  const n = inL.length, D = Math.max(1, Math.round(delaySec * SR));
  const outL = new Float32Array(n), outR = new Float32Array(n);
  const bL = new Float32Array(D), bR = new Float32Array(D);
  const a = Math.exp(-TAU * lpHz / SR); let zL = 0, zR = 0, idx = 0;
  for (let i = 0; i < n; i++) {
    const yL = bL[idx], yR = bR[idx];
    zL = yL * (1 - a) + zL * a; zR = yR * (1 - a) + zR * a;
    outL[i] = yL; outR[i] = yR;
    bL[idx] = (inL[i] + inR[i]) * 0.5 + zR * feedback;
    bR[idx] = zL * feedback;
    if (++idx >= D) idx = 0;
  }
  return [outL, outR];
}

export const softClip = (x) => (x > 1.5 ? 1 : x < -1.5 ? -1 : x - (4 / 27) * x * x * x);

// ---------- versions « streaming » (état conservé d'un bloc à l'autre) pour les morceaux longs
export class OnePoleHPStream {
  constructor(fc) { this.a = Math.exp(-TAU * fc / SR); this.z = 0; }
  process(buf, n = buf.length) { const a = this.a; let z = this.z; for (let i = 0; i < n; i++) { z = buf[i] * (1 - a) + z * a; buf[i] -= z; } this.z = z; }
}
export class SVFStream {
  constructor(fc, q = 0.707) {
    const k = 1 / Math.max(0.1, q); fc = Math.min(SR * 0.45, Math.max(20, fc));
    const g = Math.tan(Math.PI * fc / SR); this.a1 = 1 / (1 + g * (g + k)); this.a2 = g * this.a1; this.a3 = g * this.a2; this.ic1 = 0; this.ic2 = 0;
  }
  /** passe-bas en place */
  process(buf, n = buf.length) {
    const { a1, a2, a3 } = this; let { ic1, ic2 } = this;
    for (let i = 0; i < n; i++) { const v3 = buf[i] - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3; ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2; buf[i] = v2; }
    this.ic1 = ic1; this.ic2 = ic2;
  }
}
export class FreeverbStream {
  constructor({ room = 0.84, damp = 0.3 } = {}) {
    this.room = room; this.damp = damp;
    const mk = (spread) => ({
      combs: [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((t) => ({ buf: new Float32Array(t + spread), idx: 0, store: 0 })),
      aps: [556, 441, 341, 225].map((t) => ({ buf: new Float32Array(t + spread), idx: 0 })),
    });
    this.ch = [mk(0), mk(23)];
  }
  _run(c, input, out, n) {
    const { room, damp } = this;
    out.fill(0, 0, n);
    for (const cb of c.combs) {
      const buf = cb.buf, len = buf.length; let idx = cb.idx, store = cb.store;
      for (let i = 0; i < n; i++) { const y = buf[idx]; store = y * (1 - damp) + store * damp; buf[idx] = input[i] * 0.015 + store * room; out[i] += y; if (++idx >= len) idx = 0; }
      cb.idx = idx; cb.store = store;
    }
    for (const ap of c.aps) {
      const buf = ap.buf, len = buf.length; let idx = ap.idx;
      for (let i = 0; i < n; i++) { const b = buf[idx], x = out[i]; out[i] = -x + b; buf[idx] = x + b * 0.5; if (++idx >= len) idx = 0; }
      ap.idx = idx;
    }
  }
  process(inL, inR, outL, outR, n) { this._run(this.ch[0], inL, outL, n); this._run(this.ch[1], inR, outR, n); }
}
export class PingPongStream {
  constructor(delaySec, feedback = 0.35, lpHz = 3500) {
    this.D = Math.max(1, Math.round(delaySec * SR)); this.bL = new Float32Array(this.D); this.bR = new Float32Array(this.D);
    this.a = Math.exp(-TAU * lpHz / SR); this.fb = feedback; this.zL = 0; this.zR = 0; this.idx = 0;
  }
  process(inL, inR, outL, outR, n) {
    const { bL, bR, a, fb, D } = this; let { zL, zR, idx } = this;
    for (let i = 0; i < n; i++) {
      const yL = bL[idx], yR = bR[idx];
      zL = yL * (1 - a) + zL * a; zR = yR * (1 - a) + zR * a;
      outL[i] = yL; outR[i] = yR;
      bL[idx] = (inL[i] + inR[i]) * 0.5 + zR * fb; bR[idx] = zL * fb;
      if (++idx >= D) idx = 0;
    }
    this.zL = zL; this.zR = zR; this.idx = idx;
  }
}
/** Chorus stéréo type Juno (deux lignes modulées en opposition de phase). */
export class ChorusStream {
  constructor(rate = 0.55, depthMs = 1.9, baseMs = 7, mix = 0.5) {
    this.size = 4096; this.bL = new Float32Array(this.size); this.bR = new Float32Array(this.size); this.w = 0; this.ph = 0;
    this.inc = rate / SR; this.depth = depthMs * SR / 1000; this.base = baseMs * SR / 1000; this.mix = mix;
  }
  process(L, R, n) {
    const { bL, bR, size, depth, base, mix } = this; let w = this.w, ph = this.ph;
    for (let i = 0; i < n; i++) {
      const xl = L[i], xr = R[i], xm = (xl + xr) * 0.5;
      bL[w] = xm; bR[w] = xm;
      const lfo = Math.sin(TAU * ph);
      const dl = base + depth * lfo, dr = base - depth * lfo;
      const rl = w - dl, rr = w - dr;
      const il = Math.floor(rl), fl = rl - il, ir = Math.floor(rr), fr = rr - ir;
      const yl = bL[(il + size) & (size - 1)] * (1 - fl) + bL[(il + 1 + size) & (size - 1)] * fl;
      const yr = bR[(ir + size) & (size - 1)] * (1 - fr) + bR[(ir + 1 + size) & (size - 1)] * fr;
      L[i] = xl * (1 - mix * 0.5) + yl * mix; R[i] = xr * (1 - mix * 0.5) + yr * mix;
      w = (w + 1) & (size - 1); ph += this.inc; if (ph >= 1) ph -= 1;
    }
    this.w = w; this.ph = ph;
  }
}
