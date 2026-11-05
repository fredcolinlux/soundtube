// v1.11.0 (moteur 20) : traitements et sons du lo-fi refait, 100 % synthèse (aucun échantillon).
//  - LofiTexture : chaîne de texture « authentique » appliquée à la musique (pas au fond sonore) :
//    poussière numérique (bits / fréquence d'échantillonnage), saturation de bande asymétrique, pleurage / scintillement,
//    passe-bas chaud, puis craquements / pops / souffle de vinyle ajoutés par-dessus ;
//  - renderScratch : scratchs de platine synthétisés (baby, chirp, transformer, scribble, tear) sur une source synthétique ;
//  - hornSection / orchStab : section de cuivres et coup d'orchestre synthétiques (beatmaker) ;
//  - ambiences « café », « étude » (murmure sans parole intelligible, pages, horloge).
import { SR, svf, onePoleLP, onePoleHP, noise } from './dsp.js';
import { makeRng } from './rng.js';

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** Chaîne de texture lo-fi (flux stéréo, état conservé d'un bloc à l'autre). T = { crackle, wow, sat, dust, warmth } dans [0, 1]. */
export class LofiTexture {
  constructor(T, seed) {
    this.T = { crackle: clamp01(T.crackle || 0), wow: clamp01(T.wow || 0), sat: clamp01(T.sat || 0), dust: clamp01(T.dust || 0), warmth: clamp01(T.warmth || 0) };
    const r = makeRng(seed >>> 0); this.r = r;
    const W = this.T.wow, D = this.T.dust, S = this.T.sat, H = this.T.warmth;
    // pleurage (~0,5 Hz) + dérive lente aléatoire, scintillement (~7 Hz)
    this.wowF = 0.42 + 0.16 * r(); this.wowPh = r() * TAU; this.flF = 6.2 + 1.4 * r();
    this.wowD = W * 0.0032 * SR; this.flD = W * 0.000045 * SR; this.base = this.wowD * 1.6 + this.flD + 4;
    this.ring = [new Float32Array(16384), new Float32Array(16384)]; this.w = 0; this.drift = 0; this.driftT = 0; this.driftV = 0;
    // poussière : échantillonneur-bloqueur + quantification
    this.srRatio = 1 / (1 + 3 * D); this.q = D > 0.02 ? 2 ** (16 - 9 * D ** 0.85) / 2 : 0; this.ph = 0; this.hold = [0, 0];
    // bande : saturation asymétrique
    this.drive = 1 + 2.5 * S; this.bias = 0.12 * S; this.tb = Math.tanh(this.bias);
    // chaleur : passe-bas 2 pôles (TPT), contourné à 0
    this.lp = H > 0.01 ? (() => { const fc = 16000 * 0.135 ** H, g = Math.tan(Math.PI * fc / SR), k = 1 / 0.62, a1 = 1 / (1 + g * (g + k)); return { a1, a2: g * a1, a3: g * g * a1, s: [0, 0, 0, 0] }; })() : null;
    // craquements
    const C = this.T.crackle;
    this.clickP = C > 0.01 ? (20 + 180 * C) / SR : 0; this.popP = C > 0.01 ? (0.2 + 1.5 * C) / SR : 0;
    this.clickA = 0.125 * Math.sqrt(C); this.popA = 0.4 * C ** 0.7; this.hissA = 0.011 * C; // niveaux calés sur une musique à ≈ -8 LUFS avant master
    this.revN = Math.round(1.8 * SR); this.revOff = Math.floor(r() * this.revN); this.revTick = C > 0.35 && r() < 0.7 ? 0.12 * C : 0; // un « tic » par tour de disque (33 tours)
    this.ck = [0, 0]; this.ckLP = [0, 0]; this.ckHP = [0, 0]; this.pops = []; this.hs = [0, 0, 0, 0];
  }
  process(L, R, n, c0) {
    const T = this.T, r = this.r;
    // 1) poussière (avant tout : le « sampler » 12 bits de l'époque)
    if (this.q) {
      const q = this.q, sr = this.srRatio;
      for (let i = 0; i < n; i++) {
        this.ph += sr; if (this.ph >= 1) { this.ph -= 1; this.hold[0] = Math.round(L[i] * q) / q; this.hold[1] = Math.round(R[i] * q) / q; }
        L[i] = this.hold[0]; R[i] = this.hold[1];
      }
    }
    // 2) bande : saturation asymétrique (harmoniques paires), gain unitaire à bas niveau
    if (T.sat > 0.01) {
      const d = this.drive, b = this.bias, tb = this.tb, inv = 1 / (d * (1 - tb * tb));
      for (let i = 0; i < n; i++) { L[i] = (Math.tanh(d * L[i] + b) - tb) * inv; R[i] = (Math.tanh(d * R[i] + b) - tb) * inv; }
    }
    // 3) pleurage / scintillement (ligne à retard modulée)
    if (T.wow > 0.01) {
      const [hl, hr] = this.ring, M = 16383;
      for (let i = 0; i < n; i++) {
        const t = (c0 + i) / SR;
        if (--this.driftT <= 0) { this.driftT = 2048; this.driftV = (r() * 2 - 1) * 0.5; }
        this.drift += (this.driftV - this.drift) * 0.00004;
        const d = this.base + this.wowD * (0.6 * Math.sin(TAU * this.wowF * t + this.wowPh) + 0.4 * this.drift * 2) + this.flD * Math.sin(TAU * this.flF * t);
        const w = this.w; hl[w] = L[i]; hr[w] = R[i];
        const pos = w - d + 16384, i0 = Math.floor(pos), fr = pos - i0, a = i0 & M, b2 = (i0 + 1) & M;
        L[i] = hl[a] * (1 - fr) + hl[b2] * fr; R[i] = hr[a] * (1 - fr) + hr[b2] * fr;
        this.w = (w + 1) & M;
      }
    }
    // 4) chaleur
    if (this.lp) {
      const { a1, a2, a3, s } = this.lp;
      for (let i = 0; i < n; i++) {
        let v3 = L[i] - s[1], v1 = a1 * s[0] + a2 * v3, v2 = s[1] + a2 * s[0] + a3 * v3; s[0] = 2 * v1 - s[0]; s[1] = 2 * v2 - s[1]; L[i] = v2;
        v3 = R[i] - s[3]; v1 = a1 * s[2] + a2 * v3; v2 = s[3] + a2 * s[2] + a3 * v3; s[2] = 2 * v1 - s[2]; s[3] = 2 * v2 - s[3]; R[i] = v2;
      }
    }
    // 5) vinyle : craquements fins, pops, souffle, tic de rotation (ajoutés, non filtrés par la chaleur)
    if (this.clickP) {
      const cl = 1 - Math.exp(-TAU * 6500 / SR), ch = Math.exp(-TAU * 900 / SR), hp = this.hs;
      for (let i = 0; i < n; i++) {
        let xl = 0, xr = 0;
        if (r() < this.clickP) { const a = this.clickA * (r() ** 3) * (r() < 0.5 ? -1 : 1), p = r(); xl += a * (1 - p * 0.7); xr += a * (0.3 + p * 0.7); }
        if (r() < this.popP) this.pops.push({ k: 0, len: Math.floor((0.0015 + 0.004 * r()) * SR), a: this.popA * (0.35 + 0.65 * r() ** 2) * (r() < 0.5 ? -1 : 1), f: 140 + 260 * r(), p: r() });
        if (this.revTick && (c0 + i + this.revOff) % this.revN === 0) { const a = this.revTick; xl += a; xr += a * 0.8; }
        // souffle : bruit passe-bande doux
        const nl = (r() * 2 - 1) * this.hissA, nr = (r() * 2 - 1) * this.hissA;
        // filtre des clics (HP 900 / LP 6,5 k : « tic » sec de la poussière)
        this.ckLP[0] += cl * (xl + nl - this.ckLP[0]); this.ckLP[1] += cl * (xr + nr - this.ckLP[1]);
        const yl = this.ckLP[0] - hp[0], yr = this.ckLP[1] - hp[1]; hp[0] = this.ckLP[0] - ch * yl; hp[1] = this.ckLP[1] - ch * yr;
        let pl = 0, pr = 0;
        for (let j = this.pops.length - 1; j >= 0; j--) {
          const p = this.pops[j], u = p.k / p.len, env = Math.exp(-4 * u);
          const s = p.a * env * (0.6 * Math.sin(TAU * p.f * p.k / SR) + 0.4 * (r() * 2 - 1));
          pl += s * (1 - p.p * 0.6); pr += s * (0.4 + p.p * 0.6);
          if (++p.k >= p.len) this.pops.splice(j, 1);
        }
        L[i] += yl + pl; R[i] += yr + pr;
      }
    }
  }
}

// ---------- sources synthétiques des scratchs
/** « Aah » vocal synthétique (impulsions glottiques + 3 formants), 1 s. */
function srcAah(rnd) {
  const n = Math.floor(1.0 * SR), g = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f0 = 175 - 40 * t + 3 * Math.sin(TAU * 5 * t);
    ph += f0 / SR; if (ph >= 1) ph -= 1;
    g[i] = (ph < 0.08 ? Math.sin(Math.PI * ph / 0.08) : 0) + (rnd() * 2 - 1) * 0.05;
  }
  const f1 = svf(g, 780, 6, 'bp'), f2 = svf(g, 1180, 7, 'bp'), f3 = svf(g, 2600, 9, 'bp'), h = svf(noise(n, rnd), 3000, 1, 'bp');
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR, env = Math.min(1, t / 0.012) * (t < 0.06 ? 1 : Math.exp(-(t - 0.06) / 0.7)), hx = t < 0.05 ? 1 - t / 0.05 : 0; out[i] = (f1[i] + f2[i] * 0.7 + f3[i] * 0.35) * env * 2.2 + h[i] * hx * 0.6; }
  return normalize(out, 0.9);
}
function normalize(b, p) { let m = 1e-9; for (const x of b) m = Math.max(m, Math.abs(x)); const g = p / m; for (let i = 0; i < b.length; i++) b[i] *= g; return b; }

/** Cuivre synthétique (une voix) : dent de scie, attaque « blat » du filtre, petite remontée de hauteur, souffle. */
function brassVoice(f, gateS, vel, rnd, det = 0, bright = 1) {
  const rel = 0.09, n = Math.ceil((gateS + rel) * SR), out = new Float32Array(n), raw = new Float32Array(n);
  let ph = rnd(), ph2 = rnd();
  for (let i = 0; i < n; i++) {
    const t = i / SR, scoop = 1 - 0.035 * Math.exp(-t / 0.035), vib = t > 0.22 ? 1 + 0.004 * Math.sin(TAU * 5.4 * t) * Math.min(1, (t - 0.22) / 0.2) : 1;
    const fi = f * scoop * vib * (1 + det / 1200 * 0.6931);
    ph += fi / SR; ph -= Math.floor(ph); ph2 += (fi * 1.003) / SR; ph2 -= Math.floor(ph2);
    raw[i] = (2 * ph - 1) * 0.6 + (2 * ph2 - 1) * 0.4 + (rnd() * 2 - 1) * 0.04;
  }
  const cut = (i) => { const t = i / SR; return f * (1.5 + (3.5 + 5 * vel) * bright * (t < 0.03 ? t / 0.03 : 0.55 + 0.45 * Math.exp(-(t - 0.03) / 0.12))); };
  const y = svf(raw, cut, 1.1, 'lp');
  for (let i = 0; i < n; i++) { const t = i / SR, a = Math.min(1, t / 0.022), r2 = t > gateS ? Math.max(0, 1 - (t - gateS) / rel) : 1; out[i] = Math.tanh(y[i] * 1.6) * a * r2 * (0.85 + 0.15 * Math.exp(-t / 0.2)); }
  return out;
}
/** Section de cuivres (trompette + sax + trombone à l'unisson / octave), une note. */
export function hornSection(f, gateS, vel, rnd) {
  const a = brassVoice(f, gateS, vel, rnd, -7, 1.1), b = brassVoice(f, gateS, vel, rnd, 6, 0.9), c = brassVoice(f / 2, gateS, vel, rnd, 3, 0.8);
  const n = Math.max(a.length, b.length, c.length), L = new Float32Array(n), R = new Float32Array(n), g = 0.32 * vel;
  for (let i = 0; i < n; i++) { L[i] = (a[i] * 0.9 + b[i] * 0.45 + c[i] * 0.55) * g; R[i] = (a[i] * 0.45 + b[i] * 0.9 + c[i] * 0.55) * g; }
  return { L, R };
}
/** Coup d'orchestre (« orchestra hit ») : cordes + cuivres + timbale + transitoire, une note. */
export function orchStab(f, gateS, vel, rnd) {
  const len = Math.max(0.35, Math.min(0.9, gateS)), n = Math.ceil((len + 0.25) * SR), raw = new Float32Array(n), L = new Float32Array(n), R = new Float32Array(n);
  const ratios = [[1, 0.5], [2, 0.35], [1.5, 0.22], [0.5, 0.4], [3, 0.12]], dets = ratios.map(() => [1 - 0.004 * rnd(), 1 + 0.004 * rnd()]), ph = ratios.map(() => [rnd(), rnd()]);
  for (let i = 0; i < n; i++) {
    const t = i / SR; let s = 0;
    for (let k = 0; k < ratios.length; k++) for (let j = 0; j < 2; j++) { const p = (ph[k][j] += f * ratios[k][0] * dets[k][j] / SR); s += (2 * (p - Math.floor(p)) - 1) * ratios[k][1] * 0.5; }
    raw[i] = s;
  }
  const y = svf(raw, (i) => f * (2 + 10 * Math.exp(-i / SR / 0.08)), 0.9, 'lp'), nz = svf(noise(n, rnd), 2500, 0.8, 'bp');
  let tph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, env = Math.min(1, t / 0.004) * Math.exp(-t / (len * 0.45)), tf = f / 4 * (1 + 0.3 * Math.exp(-t / 0.03));
    tph += tf / SR; const timp = Math.sin(TAU * tph) * Math.exp(-t / 0.25) * 0.5;
    const x = Math.tanh((y[i] * env + timp + nz[i] * Math.exp(-t / 0.012) * 0.8) * 1.4) * 0.3 * vel;
    L[i] = x; R[i] = x * 0.94;
  }
  // élargissement : petit retard sur la droite
  const dd = Math.floor(0.0007 * SR); for (let i = n - 1; i >= dd; i--) R[i] = R[i - dd];
  return { L, R };
}

/** Accord de cuivres / d'orchestre servant de source aux scratchs (0,8 s). */
function srcStab(kind, m, rnd) {
  const f = 440 * 2 ** ((m - 69) / 12), parts = [0, 4, 7].map((iv) => kind === 'orch' ? orchStab(f * 2 ** (iv / 12), 0.6, 0.9, rnd) : hornSection(f * 2 ** (iv / 12), 0.55, 0.9, rnd));
  const n = Math.floor(0.8 * SR), out = new Float32Array(n);
  for (const p of parts) for (let i = 0; i < Math.min(n, p.L.length); i++) out[i] += p.L[i];
  return normalize(out, 0.9);
}
const SRC_CACHE = new Map();
export function scratchSource(src, m, seed) {
  const key = `${src}:${src === 'aah' ? 0 : m}:${seed % 7}`;
  if (!SRC_CACHE.has(key)) { if (SRC_CACHE.size > 24) SRC_CACHE.clear(); const rnd = makeRng(seed); SRC_CACHE.set(key, src === 'aah' ? srcAah(rnd) : srcStab(src, m, rnd)); }
  return SRC_CACHE.get(key);
}

/**
 * Mouvements de main d'un motif de scratch sur `beats` temps : [début, fin (temps), p0, p1 (secondes de source), volet du fader (fractions ouvertes)].
 * baby : va-et-vient, fader ouvert ; chirp : fader coupé au milieu de chaque aller / retour ; transformer : mouvement lent, fader haché ;
 * scribble : vibration rapide de la main ; tear : aller en deux temps.
 */
export function scratchStrokes(kind, beats, spb, rnd) {
  const out = [], L = 0.12 + 0.1 * rnd(), p0 = 0.02 + 0.03 * rnd();
  const cells = kind === 'chirp' ? [0.5] : kind === 'baby' ? [0.5, 0.25, 0.25, 0.5, 0.5, 0.25, 0.25, 0.5] : kind === 'tear' ? [0.75, 0.25, 0.5, 0.5] : [1];
  let t = 0, k = 0, fwd = true;
  while (t < beats - 0.01) {
    const c = Math.min(cells[k++ % cells.length], beats - t);
    if (kind === 'transformer' || kind === 'scribble') {
      // mouvement lent d'une noire : aller puis retour ; fader haché à la double-croche (transformer) ou ouvert (scribble)
      const half = c / 2, Lx = Math.min(0.5, half * spb * 0.55);
      const ng = Math.max(2, Math.round(half / 0.125)), gates = kind === 'transformer' ? Array.from({ length: ng }, (_, j) => [j / ng, (j + 0.5) / ng]) : [[0, 1]];
      out.push({ a: t, b: t + half, p0, p1: p0 + Lx, gates, wig: kind === 'scribble' ? 0.006 : 0 });
      out.push({ a: t + half, b: t + c, p0: p0 + Lx, p1: p0, gates, wig: kind === 'scribble' ? 0.006 : 0 });
    } else if (kind === 'tear') {
      const h = c / 2;
      out.push({ a: t, b: t + h * 0.45, p0, p1: p0 + L * 0.5, gates: [[0, 1]] });
      out.push({ a: t + h * 0.6, b: t + h, p0: p0 + L * 0.5, p1: p0 + L, gates: [[0, 1]] });
      out.push({ a: t + h, b: t + c, p0: p0 + L, p1: p0, gates: [[0, 1]] });
    } else {
      const h = c / 2;
      const g = kind === 'chirp' ? [[0, 0.55]] : [[0, 1]], gb = kind === 'chirp' ? [[0.5, 1]] : [[0, 1]];
      if (kind === 'baby' && c <= 0.25) { out.push({ a: t, b: t + c, p0: fwd ? p0 : p0 + L, p1: fwd ? p0 + L : p0, gates: [[0, 1]] }); fwd = !fwd; }
      else { out.push({ a: t, b: t + h, p0, p1: p0 + L, gates: g }); out.push({ a: t + h, b: t + c, p0: p0 + L, p1: p0, gates: gb }); fwd = true; }
    }
    t += c;
  }
  return out;
}

/** Rend un événement scratch { kind, d (temps), v, src, m } → [L, R]. */
export function renderScratch(e, spb, seed) {
  const rnd = makeRng((seed ^ Math.imul(Math.round(e.t * 96) | 0, 2654435761)) >>> 0);
  const src = scratchSource(e.src || 'aah', e.m || 60, seed), NS = src.length;
  const n = Math.ceil((e.d * spb + 0.03) * SR), L = new Float32Array(n), R = new Float32Array(n);
  const strokes = scratchStrokes(e.kind || 'baby', e.d, spb, rnd);
  const fadeK = 1 - Math.exp(-1 / (0.0015 * SR));
  let fader = 0, si = 0, lastP = strokes[0] ? strokes[0].p0 : 0, nl = 0, lp = 0;
  const pan = (rnd() * 2 - 1) * 0.25;
  for (let i = 0; i < n; i++) {
    const tb = i / SR / spb;
    while (si < strokes.length && tb >= strokes[si].b) si++;
    const s = strokes[si];
    let p = lastP, open = 0, speed = 0;
    if (s && tb >= s.a) {
      const u = (tb - s.a) / (s.b - s.a), e2 = 0.5 - 0.5 * Math.cos(Math.PI * u);
      p = s.p0 + (s.p1 - s.p0) * e2 + (s.wig ? s.wig * Math.sin(TAU * 17 * i / SR) : 0);
      for (const [ga, gb] of s.gates) if (u >= ga && u < gb) open = 1;
    }
    speed = (p - lastP) * SR; lastP = p;
    fader += fadeK * (open - fader);
    const pos = Math.max(0, Math.min(NS - 2, p * SR)), i0 = Math.floor(pos), fr = pos - i0;
    const x = (src[i0] * (1 - fr) + src[i0 + 1] * fr), sp = Math.min(1.6, Math.abs(speed));
    nl = 0.7 * nl + 0.3 * (rnd() * 2 - 1);
    let y = (x * Math.min(1, sp * 1.4) + nl * 0.035 * sp) * fader;
    lp += 0.55 * (y - lp); y = Math.tanh(lp * 1.5) / 1.5 * e.v;
    L[i] = y * (1 - pan); R[i] = y * (1 + pan);
  }
  onePoleHP(L, 140); onePoleHP(R, 140);
  return [L, R];
}

// ---------- fonds sonores supplémentaires
const VOWELS = [[730, 1090], [270, 2290], [530, 1840], [570, 840], [440, 1020], [300, 870], [660, 1720], [490, 1350]];
/** Café : murmure de voix lointaines (formants aléatoires, sans consonnes, filtré : aucune parole intelligible), tasses, salle. */
export function ambCafe(L, R, n, rnd, t0) {
  const brownR = (src) => { const o = new Float32Array(src.length); let y = 0; for (let i = 0; i < src.length; i++) { y = 0.996 * y + 0.05 * src[i]; o[i] = y; } return o; };
  const bedL = svf(brownR(noise(n, rnd)), 650, 0.6, 'lp'), bedR = svf(brownR(noise(n, rnd)), 650, 0.6, 'lp');
  for (let i = 0; i < n; i++) { L[i] += bedL[i] * 0.05; R[i] += bedR[i] * 0.05; }
  const V = 7, mixL = new Float32Array(n), mixR = new Float32Array(n);
  for (let v = 0; v < V; v++) {
    const f0b = rnd() < 0.5 ? 95 + 40 * rnd() : 170 + 70 * rnd(), dist = 0.35 + 0.65 * rnd(), pan = rnd();
    const src = new Float32Array(n), F1 = new Float32Array(n), F2 = new Float32Array(n), amp = new Float32Array(n);
    // phrases : 1,5-4 s de syllabes (3,5-6 / s), silences de 0,5-3 s
    let i = Math.floor(rnd() * 1.5 * SR), f1 = 500, f2 = 1500, a = 0;
    const segs = [];
    while (i < n) {
      const ph = Math.floor((1.5 + 2.5 * rnd()) * SR), rate = 3.5 + 2.5 * rnd(), end = Math.min(n, i + ph);
      let j = i; while (j < end) { const d = Math.floor(SR / rate * (0.7 + 0.6 * rnd())); segs.push([j, Math.min(end, j + d), VOWELS[Math.floor(rnd() * VOWELS.length)], rnd() < 0.2 ? 0.25 : 0.6 + 0.4 * rnd(), f0b * (0.88 + 0.24 * rnd())]); j += d; }
      i = end + Math.floor((0.5 + 2.5 * rnd()) * SR);
    }
    let si = 0, ph = rnd(), f0 = f0b;
    for (let k = 0; k < n; k++) {
      while (si < segs.length && k >= segs[si][1]) si++;
      const s = segs[si], on = s && k >= s[0];
      const tf1 = on ? s[2][0] : f1, tf2 = on ? s[2][1] : f2, ta = on ? s[3] * Math.sin(Math.PI * Math.min(1, (k - s[0]) / (s[1] - s[0]))) ** 0.6 : 0;
      f1 += (tf1 - f1) * 0.0016; f2 += (tf2 - f2) * 0.0016; a += (ta - a) * 0.003; if (on) f0 += (s[4] - f0) * 0.0008;
      ph += f0 / SR; ph -= Math.floor(ph);
      src[k] = (2 * ph - 1) + (rnd() * 2 - 1) * 0.15; F1[k] = f1; F2[k] = f2; amp[k] = a;
    }
    const y1 = svf(src, (k) => F1[k], 5, 'bp'), y2 = svf(src, (k) => F2[k], 7, 'bp');
    const g = 0.035 * dist;
    for (let k = 0; k < n; k++) { const y = (y1[k] + y2[k] * 0.55) * amp[k] * g; mixL[k] += y * (1.1 - pan); mixR[k] += y * (0.1 + pan); }
  }
  // éloignement : passe-bas ~1,8 kHz (rien d'intelligible), petite salle (deux retards)
  onePoleLP(mixL, 1800); onePoleLP(mixL, 2400); onePoleLP(mixR, 1800); onePoleLP(mixR, 2400);
  const d1 = Math.floor(0.023 * SR), d2 = Math.floor(0.041 * SR);
  for (let k = 0; k < n; k++) { L[k] += mixL[k] + (k >= d1 ? mixR[k - d1] * 0.4 : 0) + (k >= d2 ? mixL[k - d2] * 0.25 : 0); R[k] += mixR[k] + (k >= d1 ? mixL[k - d1] * 0.4 : 0) + (k >= d2 ? mixR[k - d2] * 0.25 : 0); }
  // tasses / cuillères (partiels inharmoniques), parfois un double tintement ; tasse posée (choc sourd)
  const clinks = Math.floor(n / SR * 0.35 + rnd());
  for (let c = 0; c < clinks; c++) {
    const at = Math.floor(rnd() * n), sc = 0.8 + 0.4 * rnd(), amp = 0.006 + 0.016 * rnd() ** 2, pan = rnd(), rep = rnd() < 0.35 ? 2 : 1;
    for (let r2 = 0; r2 < rep; r2++) {
      const st = at + r2 * Math.floor((0.09 + 0.06 * rnd()) * SR), len = Math.floor(0.35 * SR);
      for (let k = 0; k < len && st + k < n; k++) { const t = k / SR, s = (Math.sin(TAU * 2400 * sc * t) * Math.exp(-t / 0.18) + 0.6 * Math.sin(TAU * 5900 * sc * t) * Math.exp(-t / 0.07) + 0.3 * Math.sin(TAU * 9100 * sc * t) * Math.exp(-t / 0.03)) * amp * (r2 ? 0.6 : 1); L[st + k] += s * (1 - pan * 0.7); R[st + k] += s * (0.3 + pan * 0.7); }
    }
  }
  const thuds = Math.floor(n / SR * 0.12 + rnd());
  for (let c = 0; c < thuds; c++) {
    const at = Math.floor(rnd() * n), len = Math.floor(0.06 * SR), amp = 0.02 + 0.02 * rnd(); let y = 0;
    for (let k = 0; k < len && at + k < n; k++) { y += 0.08 * ((rnd() * 2 - 1) - y); const s = y * amp * 6 * Math.exp(-k / (0.012 * SR)); L[at + k] += s; R[at + k] += s * 0.8; }
  }
}
/** Salle d'étude : air de la pièce, horloge (tic / tac sur les secondes absolues), pages tournées, crayon. */
export function ambEtude(L, R, n, rnd, t0) {
  const nz = noise(n, rnd), nz2 = noise(n, rnd);
  let y = 0, y2 = 0;
  for (let i = 0; i < n; i++) { y = 0.997 * y + 0.04 * nz[i]; y2 = 0.997 * y2 + 0.04 * nz2[i]; L[i] += y * 0.05 + nz[i] * 0.0012; R[i] += y2 * 0.05 + nz2[i] * 0.0012; }
  onePoleLP(L, 3000); onePoleLP(R, 3000);
  // horloge : tic / tac à chaque seconde absolue (continu d'un morceau de 8 mesures à l'autre)
  const first = Math.ceil(t0), last = t0 + n / SR;
  for (let s = first; s < last; s++) {
    const at = Math.round((s - t0) * SR), f = s % 2 ? 3200 : 2600, a = s % 2 ? 0.014 : 0.012, len = Math.floor(0.03 * SR);
    for (let k = 0; k < len && at + k < n; k++) { const t = k / SR, x = Math.sin(TAU * f * t) * Math.exp(-t / 0.004) + (k < 40 ? (rnd() * 2 - 1) * 0.5 : 0); L[at + k] += x * a * 0.7; R[at + k] += x * a; }
  }
  // pages : une toutes les 12-35 s (en moyenne), froissement passe-bande montant
  const pages = (n / SR) / 22 + rnd() - 0.4;
  for (let p = 0; p < Math.floor(pages + 0.5); p++) {
    const at = Math.floor(rnd() * n), len = Math.floor((0.45 + 0.4 * rnd()) * SR), seg = noise(len, rnd), pan = 0.3 + 0.4 * rnd();
    const bp = svf(seg, (k) => 1200 + 3800 * (k / len), 1.4, 'bp');
    for (let k = 0; k < len && at + k < n; k++) { const u = k / len, env = Math.sin(Math.PI * u) ** 1.5 * (0.7 + 0.3 * (rnd() < 0.02 ? 1 : 0)), s = bp[k] * env * 0.09; L[at + k] += s * (1 - pan); R[at + k] += s * pan; }
  }
  // crayon : courtes rafales de grattements aigus
  if (rnd() < 0.35) {
    const at = Math.floor(rnd() * n), len = Math.floor((1 + 2 * rnd()) * SR), seg = svf(noise(len, rnd), 4200, 2, 'bp');
    for (let k = 0; k < len && at + k < n; k++) { const t = k / SR, g = (Math.sin(TAU * 4.5 * t) > 0.2 ? 1 : 0.1) * 0.012; L[at + k] += seg[k] * g * 0.8; R[at + k] += seg[k] * g; }
  }
}
