#!/usr/bin/env node
/**
 * Mesure objective de la répétition sur tout un fichier WAV (PCM 16 bits), en JavaScript pur.
 *   node tools/repetition.mjs fichier.wav [--win 300] [--json]
 * Caractéristiques par trame (1 s, FFT 8192 sur mono) : chroma 12 classes (55 Hz–5 kHz) + enveloppe spectrale 24 bandes log (dB).
 * Normalisation z-score par dimension sur tout le fichier, puis :
 *  1. auto-similarité entre fenêtres de 5 min : cosinus entre vecteurs moyens (chroma+timbre), et chroma seule (harmonie brute) ;
 *  2. taux de « déjà-entendu » : pour chaque motif de 4 s (4 trames empilées), meilleure correspondance (cosinus) dans une
 *     AUTRE fenêtre de 5 min (écart ≥ 5 min) ; part des motifs avec une correspondance > 0,90 / > 0,95 et médiane.
 * Plus c'est bas, moins le contenu se répète (YouTube : contenus répétitifs).
 */
import fs from 'node:fs';

const args = process.argv.slice(2), file = args.find((a) => !a.startsWith('--'));
const WIN = +(args[args.indexOf('--win') + 1] || 300) || 300, asJson = args.includes('--json');
if (!file) { console.error('usage : node tools/repetition.mjs fichier.wav [--win 300] [--json]'); process.exit(1); }

// ---------- lecture WAV en flux (borné en mémoire)
const fd = fs.openSync(file, 'r'), head = Buffer.alloc(4096); fs.readSync(fd, head, 0, 4096, 0);
let pos = 12, ch = 2, sr = 44100, bits = 16, dataOff = 0, dataLen = 0;
while (pos < 4088) {
  const id = head.toString('ascii', pos, pos + 4), len = head.readUInt32LE(pos + 4);
  if (id === 'fmt ') { ch = head.readUInt16LE(pos + 10); sr = head.readUInt32LE(pos + 12); bits = head.readUInt16LE(pos + 22); }
  if (id === 'data') { dataOff = pos + 8; dataLen = len; break; }
  pos += 8 + len + (len & 1);
}
if (bits !== 16 || !dataOff) throw new Error('WAV PCM 16 bits attendu');
const total = Math.min(dataLen || Infinity, fs.fstatSync(fd).size - dataOff), frames = Math.floor(total / (2 * ch));

// ---------- FFT radix-2
const NFFT = 8192, HOP = sr; // 1 trame / seconde
const rev = new Uint32Array(NFFT); for (let i = 0, b = Math.log2(NFFT); i < NFFT; i++) { let r = 0; for (let k = 0; k < b; k++) r |= ((i >> k) & 1) << (b - 1 - k); rev[i] = r; }
const cosT = new Float64Array(NFFT / 2), sinT = new Float64Array(NFFT / 2); for (let i = 0; i < NFFT / 2; i++) { cosT[i] = Math.cos(2 * Math.PI * i / NFFT); sinT[i] = -Math.sin(2 * Math.PI * i / NFFT); }
const hann = new Float64Array(NFFT); for (let i = 0; i < NFFT; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / NFFT);
const re = new Float64Array(NFFT), im = new Float64Array(NFFT);
function fft() {
  for (let i = 0; i < NFFT; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= NFFT; size <<= 1) {
    const half = size >> 1, step = NFFT / size;
    for (let i = 0; i < NFFT; i += size) for (let j = 0, k = 0; j < half; j++, k += step) {
      const a = i + j, b = a + half, tr = re[b] * cosT[k] - im[b] * sinT[k], ti = re[b] * sinT[k] + im[b] * cosT[k];
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
}
// correspondances bin -> classe de hauteur / bande log
const NB = 24, pcOf = new Int8Array(NFFT / 2).fill(-1), bandOf = new Int8Array(NFFT / 2).fill(-1);
for (let k = 1; k < NFFT / 2; k++) {
  const f = k * sr / NFFT;
  if (f >= 55 && f <= 5000) pcOf[k] = ((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12; // 0 = do
  if (f >= 40 && f <= 16000) bandOf[k] = Math.min(NB - 1, Math.floor(NB * Math.log(f / 40) / Math.log(16000 / 40)));
}
const D = 12 + NB, nF = Math.floor((frames - NFFT) / HOP) + 1;
const F = new Float32Array(nF * D), C = new Float32Array(nF * 12);
const buf = Buffer.alloc(NFFT * 2 * ch);
for (let n = 0; n < nF; n++) {
  fs.readSync(fd, buf, 0, buf.length, dataOff + n * HOP * 2 * ch);
  for (let i = 0; i < NFFT; i++) { let s = 0; for (let c = 0; c < ch; c++) s += buf.readInt16LE((i * ch + c) * 2); re[i] = s / (32768 * ch) * hann[i]; im[i] = 0; }
  fft();
  const chroma = new Float64Array(12), band = new Float64Array(NB);
  for (let k = 1; k < NFFT / 2; k++) {
    const m2 = re[k] * re[k] + im[k] * im[k];
    if (pcOf[k] >= 0) chroma[pcOf[k]] += Math.sqrt(m2);
    if (bandOf[k] >= 0) band[bandOf[k]] += m2;
  }
  const cs = chroma.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < 12; i++) { C[n * 12 + i] = chroma[i] / cs; F[n * D + i] = chroma[i] / cs; }
  for (let i = 0; i < NB; i++) F[n * D + 12 + i] = 10 * Math.log10(band[i] + 1e-10);
}
fs.closeSync(fd);
// trames silencieuses exclues (fondus) ; z-score par dimension
const live = []; for (let n = 0; n < nF; n++) { let e = 0; for (let i = 0; i < NB; i++) e = Math.max(e, F[n * D + 12 + i]); if (e > -60) live.push(n); }
const mu = new Float64Array(D), sd = new Float64Array(D);
for (const n of live) for (let i = 0; i < D; i++) mu[i] += F[n * D + i] / live.length;
for (const n of live) for (let i = 0; i < D; i++) sd[i] += (F[n * D + i] - mu[i]) ** 2 / live.length;
for (let i = 0; i < D; i++) sd[i] = Math.sqrt(sd[i]) || 1;
const Z = new Float32Array(nF * D); for (let n = 0; n < nF; n++) for (let i = 0; i < D; i++) Z[n * D + i] = (F[n * D + i] - mu[i]) / sd[i];
const isLive = new Uint8Array(nF); for (const n of live) isLive[n] = 1;

const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / (Math.sqrt(x * y) || 1); };
// ---------- 1. fenêtres de 5 min
const nW = Math.floor(nF / WIN), Wm = [], Wc = [];
for (let w = 0; w < nW; w++) {
  const m = new Float64Array(D), c = new Float64Array(12); let k = 0;
  for (let n = w * WIN; n < (w + 1) * WIN; n++) if (isLive[n]) { k++; for (let i = 0; i < D; i++) m[i] += Z[n * D + i]; for (let i = 0; i < 12; i++) c[i] += C[n * 12 + i]; }
  Wm.push(m.map((v) => v / (k || 1))); Wc.push(c.map((v) => v / (k || 1)));
}
const pair = (V) => { const s = []; for (let a = 0; a < V.length; a++) for (let b = a + 1; b < V.length; b++) s.push(cos(V[a], V[b])); return s; };
const stats = (s) => { const v = [...s].sort((a, b) => a - b); const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))] ?? null;
  return { mean: +(v.reduce((a, b) => a + b, 0) / (v.length || 1)).toFixed(3), median: q(0.5) != null ? +q(0.5).toFixed(3) : null, p90: q(0.9) != null ? +q(0.9).toFixed(3) : null, max: v.length ? +v[v.length - 1].toFixed(3) : null }; };
const simAll = pair(Wm), simChroma = pair(Wc);
const frac = (s, t) => +(s.filter((x) => x > t).length / (s.length || 1)).toFixed(3);
// ---------- 2. motifs de 4 s déjà entendus ailleurs (≥ 1 fenêtre d'écart)
const L = 4, DD = D * L, P = [];
for (let n = 0; n + L <= nF; n += 2) { let ok = true; for (let j = 0; j < L; j++) if (!isLive[n + j]) ok = false; if (ok) P.push(n); }
const M = new Float32Array(P.length * DD);
P.forEach((n, p) => { let s = 0; for (let j = 0; j < DD; j++) { const v = Z[n * D + j]; M[p * DD + j] = v; s += v * v; } s = Math.sqrt(s) || 1; for (let j = 0; j < DD; j++) M[p * DD + j] /= s; });
const best = new Float32Array(P.length).fill(-1);
for (let a = 0; a < P.length; a++) {
  const oa = a * DD;
  for (let b = a + 1; b < P.length; b++) {
    if (P[b] - P[a] < WIN) continue;
    const ob = b * DD; let d = 0; for (let j = 0; j < DD; j++) d += M[oa + j] * M[ob + j];
    if (d > best[a]) best[a] = d; if (d > best[b]) best[b] = d;
  }
}
const bs = [...best].filter((x) => x > -1);
const res = {
  file, seconds: +(frames / sr).toFixed(1), windows: nW, windowSec: WIN,
  windowSimilarity: { ...stats(simAll), over095: frac(simAll, 0.95), over090: frac(simAll, 0.9) },
  windowChromaSimilarity: { ...stats(simChroma), over099: frac(simChroma, 0.99) },
  motifMatch4s: { patterns: bs.length, median: stats(bs).median, over090: frac(bs, 0.9), over095: frac(bs, 0.95) },
};
if (asJson) console.log(JSON.stringify(res));
else {
  console.log(`${file} — ${res.seconds} s, ${nW} fenêtres de ${WIN} s`);
  console.log(`  Similarité fenêtres (chroma+timbre, z) : moyenne ${res.windowSimilarity.mean}, médiane ${res.windowSimilarity.median}, max ${res.windowSimilarity.max}, part > 0,90 : ${res.windowSimilarity.over090}`);
  console.log(`  Similarité fenêtres (chroma brute)      : moyenne ${res.windowChromaSimilarity.mean}, part > 0,99 : ${res.windowChromaSimilarity.over099}`);
  console.log(`  Motifs 4 s déjà entendus ailleurs        : médiane ${res.motifMatch4s.median}, part > 0,90 : ${res.motifMatch4s.over090}, > 0,95 : ${res.motifMatch4s.over095}`);
}
