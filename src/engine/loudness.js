// Loudness (ITU-R BS.1770-4 / EBU R128) et limiteur « true peak », en flux, pour la conformité YouTube
// (cible par défaut : -14 LUFS intégrés, plafond -1 dBTP). Mémoire : 1 flottant / 100 ms (4 h ≈ 1,2 Mo).

/** Coefficients K-weighting (pré-filtre « tête » + passe-haut RLB) pour une fréquence d'échantillonnage donnée. */
function kCoefs(fs) {
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan(Math.PI * f0 / fs); const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const s1 = { b0: (Vh + Vb * K / Q + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q + K * K) / a0, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
  f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan(Math.PI * f0 / fs); a0 = 1 + K / Q + K * K;
  const s2 = { b0: 1, b1: -2, b2: 1, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
  return [s1, s2];
}

export class LoudnessMeter {
  constructor(fs = 44100) {
    this.fs = fs; [this.s1, this.s2] = kCoefs(fs);
    this.z = new Float64Array(16); // états biquad (2 étages × 2 canaux × 4)
    this.sub = Math.round(fs * 0.1); this.cnt = 0; this.acc = 0; this.subs = [];
    this.tpMax = 0;
  }
  /** Ajoute des échantillons entrelacés stéréo (Float32Array/Array), n trames. */
  push(buf, n) {
    const { s1, s2, z, sub } = this; let { cnt, acc } = this;
    let a1 = z[0], a2 = z[1], a3 = z[2], a4 = z[3], b1 = z[4], b2 = z[5], b3 = z[6], b4 = z[7];
    let c1 = z[8], c2 = z[9], c3 = z[10], c4 = z[11], d1 = z[12], d2 = z[13], d3 = z[14], d4 = z[15];
    for (let i = 0; i < n; i++) {
      const x = buf[2 * i], xr = buf[2 * i + 1];
      const y = s1.b0 * x + s1.b1 * a1 + s1.b2 * a2 - s1.a1 * a3 - s1.a2 * a4; a2 = a1; a1 = x; a4 = a3; a3 = y;
      const w = y + s2.b1 * b1 + s2.b2 * b2 - s2.a1 * b3 - s2.a2 * b4; b2 = b1; b1 = y; b4 = b3; b3 = w;
      const yr = s1.b0 * xr + s1.b1 * c1 + s1.b2 * c2 - s1.a1 * c3 - s1.a2 * c4; c2 = c1; c1 = xr; c4 = c3; c3 = yr;
      const wr = yr + s2.b1 * d1 + s2.b2 * d2 - s2.a1 * d3 - s2.a2 * d4; d2 = d1; d1 = yr; d4 = d3; d3 = wr;
      acc += w * w + wr * wr;
      if (++cnt === sub) { this.subs.push(acc); acc = 0; cnt = 0; }
    }
    z[0] = a1; z[1] = a2; z[2] = a3; z[3] = a4; z[4] = b1; z[5] = b2; z[6] = b3; z[7] = b4;
    z[8] = c1; z[9] = c2; z[10] = c3; z[11] = c4; z[12] = d1; z[13] = d2; z[14] = d3; z[15] = d4;
    this.cnt = cnt; this.acc = acc;
  }
  /** Blocs de 400 ms (recouvrement 75 %) → loudness intégrée avec portes absolue (-70) et relative (-10). */
  blocks() {
    const s = this.subs, out = [], norm = 1 / (4 * this.sub);
    for (let i = 3; i < s.length; i++) out.push((s[i] + s[i - 1] + s[i - 2] + s[i - 3]) * norm);
    return out;
  }
  integrated() {
    const L = (z) => -0.691 + 10 * Math.log10(z);
    const b = this.blocks().filter((z) => z > 0 && L(z) > -70);
    if (!b.length) return -Infinity;
    const m1 = b.reduce((a, x) => a + x, 0) / b.length, rel = L(m1) - 10;
    const g = b.filter((z) => L(z) > rel);
    return L(g.reduce((a, x) => a + x, 0) / g.length);
  }
  /** Plage de loudness (LRA, EBU Tech 3342) sur blocs de 3 s. */
  range() {
    const s = this.subs, st = [], norm = 1 / (30 * this.sub);
    for (let i = 29; i < s.length; i += 10) { let a = 0; for (let j = 0; j < 30; j++) a += s[i - j]; st.push(-0.691 + 10 * Math.log10(a * norm + 1e-20)); }
    const g1 = st.filter((x) => x > -70); if (g1.length < 2) return 0;
    const m = -0.691 + 10 * Math.log10(g1.reduce((a, x) => a + Math.pow(10, (x + 0.691) / 10), 0) / g1.length);
    const g2 = g1.filter((x) => x > m - 20).sort((a, b) => a - b);
    const q = (p) => g2[Math.min(g2.length - 1, Math.max(0, Math.round(p * (g2.length - 1))))];
    return q(0.95) - q(0.10);
  }
}

// --- Interpolation ×4 (FIR fenêtré, 12 points par phase) pour estimer les crêtes inter-échantillons
const HALF = 6, PH = [0.25, 0.5, 0.75];
const FIR = PH.map((fr) => { const h = new Float64Array(2 * HALF); let s = 0;
  for (let j = -HALF + 1; j <= HALF; j++) { const t = j - fr; const sinc = Math.abs(t) < 1e-9 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t); const w = 0.5 + 0.5 * Math.cos(Math.PI * t / (HALF + 0.5)); h[j + HALF - 1] = sinc * w; s += sinc * w; }
  for (let i = 0; i < h.length; i++) h[i] /= s; return h; });
const RING = 512, MASK = RING - 1;
/** Crête vraie de l'intervalle [m, m+1] lue dans un anneau entrelacé (canal ch). */
function ringPeak(x, m, ch) {
  let mx = 0;
  for (const h of FIR) { let y = 0; for (let j = 0; j < 2 * HALF; j++) y += h[j] * x[2 * ((m + j - HALF + 1) & MASK) + ch]; const a = y < 0 ? -y : y; if (a > mx) mx = a; }
  return mx;
}

/**
 * Gain + limiteur true-peak à anticipation (1,5 ms) en flux. Latence fixe = latency trames :
 * process(in, n, out) écrit n trames retardées ; flush(out) écrit les « latency » dernières.
 * La crête de chaque intervalle est estimée par interpolation ×4 avant décision → |y| ≤ plafond (inter-échantillons inclus, ≈).
 */
export class TruePeakLimiter {
  constructor({ fs = 44100, gain = 1, ceilingDb = -1.0, releaseMs = 120 } = {}) {
    this.gain = gain; this.ceil = Math.pow(10, ceilingDb / 20); this.la = Math.round(fs * 0.0015);
    this.relc = Math.exp(-1 / (fs * releaseMs / 1000));
    this.L = this.la + 1; this.latency = HALF + this.la;
    this.x = new Float32Array(2 * RING); this.t = 0;            // anneau des entrées (gain appliqué)
    this.req = new Float64Array(this.L).fill(1); this.rp = 0; this.nLow = 0; this.mn = 1;
    this.box = new Float64Array(this.L).fill(1); this.bp = 0; this.bsum = this.L;
    this.gr = 1; this.minGain = 1;
  }
  _step(l, r) {
    const { x, ceil, L } = this; const t = this.t;
    x[2 * (t & MASK)] = l; x[2 * (t & MASK) + 1] = r; this.t = t + 1;
    const m = t - HALF; // trame évaluée : tout son voisinage d'interpolation est connu
    let rq = 1;
    if (m >= 0) {
      const i = 2 * (m & MASK), j = 2 * ((m + 1) & MASK);
      let pk = Math.max(Math.abs(x[i]), Math.abs(x[i + 1]));
      if (pk > ceil * 0.55 || Math.abs(x[j]) > ceil * 0.55 || Math.abs(x[j + 1]) > ceil * 0.55) pk = Math.max(pk, ringPeak(x, m, 0), ringPeak(x, m, 1));
      if (pk > ceil) rq = ceil / pk;
    }
    // minimum glissant sur L trames (recalcul seulement si des valeurs < 1 sont présentes)
    const old = this.req[this.rp]; if (old < 1) this.nLow--; if (rq < 1) this.nLow++;
    this.req[this.rp] = rq; this.rp = (this.rp + 1) % L;
    let mn = 1; if (this.nLow > 0) { if (rq <= this.mn && old >= this.mn) mn = rq; else { for (let k = 0; k < L; k++) if (this.req[k] < mn) mn = this.req[k]; } } this.mn = mn;
    let g = this.gr + (1 - this.gr) * (1 - this.relc); if (mn < g) g = mn; this.gr = g;
    this.bsum += g - this.box[this.bp]; this.box[this.bp] = g; this.bp = (this.bp + 1) % L;
    const gs = Math.min(1, this.bsum / L); if (gs < this.minGain) this.minGain = gs;
    const o = m - this.la; // trame de sortie
    if (o < 0) return null;
    const k = 2 * (o & MASK); this._l = x[k] * gs; this._r = x[k + 1] * gs; return true;
  }
  process(inp, n, out) {
    const g = this.gain; let o = 0;
    for (let i = 0; i < n; i++) if (this._step(inp[2 * i] * g, inp[2 * i + 1] * g)) { out[2 * o] = this._l; out[2 * o + 1] = this._r; o++; }
    return o;
  }
  flush(out) { let o = 0; for (let i = 0; i < this.latency; i++) if (this._step(0, 0)) { out[2 * o] = this._l; out[2 * o + 1] = this._r; o++; } return o; }
}

/** Mesure de crête vraie (×4) en flux. */
export class TruePeakMeter {
  constructor() { this.x = new Float32Array(2 * RING); this.t = 0; this.max = 0; }
  push(buf, n) {
    const x = this.x; let m = this.max;
    for (let i = 0; i < n; i++) {
      const t = this.t++; x[2 * (t & MASK)] = buf[2 * i]; x[2 * (t & MASK) + 1] = buf[2 * i + 1];
      const e = t - HALF; if (e < 0) continue;
      const a = 2 * (e & MASK), b = 2 * ((e + 1) & MASK);
      const s = Math.max(Math.abs(x[a]), Math.abs(x[a + 1])); if (s > m) m = s;
      if (s > m * 0.6 || Math.abs(x[b]) > m * 0.6 || Math.abs(x[b + 1]) > m * 0.6) { const p = Math.max(ringPeak(x, e, 0), ringPeak(x, e, 1)); if (p > m) m = p; }
    }
    this.max = m;
  }
  get db() { return 20 * Math.log10(this.max + 1e-12); }
}
export const dB = (x) => 20 * Math.log10(x);
