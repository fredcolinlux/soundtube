// Lecteur d'échantillons multi-zones (pack : VCSL + VSCO 2 CE, Virtuosity Drums, Frankensnare, Salamander, jRhodes3d —
// licences : assets/samples/CREDITS.md).
// Chargement paresseux (ffmpeg -> float32), choix de zone par hauteur la plus proche + couche de vélocité,
// alternance « round-robin », rééchantillonnage cubique, boucle de maintien en fondu enchaîné et relâchement.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SR, onePoleLP } from './dsp.js';

const HERE = path.dirname(new URL(import.meta.url).pathname);
export const SAMPLE_DIR = process.env.SOUNDTUBE_SAMPLES || path.resolve(HERE, '../../assets/samples');
const FFMPEG = process.env.SOUNDTUBE_FFMPEG || 'ffmpeg';

let manifest;
function man() {
  if (manifest === undefined) {
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(SAMPLE_DIR, 'manifest.json'), 'utf8'));
      const t = spawnSync(FFMPEG, ['-version'], { stdio: 'ignore' });
      if (t.status !== 0) manifest = null;
    } catch { manifest = null; }
  }
  return manifest;
}
export function samplesAvailable() { return !!man(); }

// v1.21.4 : samples externes de l'utilisateur (ex. partage SMB du NAS monté en lecture seule sur /mnt/samples).
// Index construit par src/extsamples.js (scan Admin) : { instruments: { ext_kick: { zones: [{ file: <chemin absolu>, … }] } } }.
// Lu par chemin (SOUNDTUBE_EXT_SAMPLES_INDEX, posé par le serveur et hérité par les workers) ; relu si le fichier change.
let extMan = null, extSig = null;
function ext() {
  const f = process.env.SOUNDTUBE_EXT_SAMPLES_INDEX; if (!f) return null;
  let sig = null; try { const st = fs.statSync(f); sig = st.size + ':' + st.mtimeMs; } catch { extMan = null; extSig = null; return null; }
  if (sig !== extSig) {
    extSig = sig;
    try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); extMan = j && j.enabled !== false && j.instruments ? j.instruments : null; } catch { extMan = null; }
    levelCache.forEach((_, k) => { if (k.startsWith('ext_')) levelCache.delete(k); }); present.forEach((_, k) => { if (k.startsWith('ext_')) present.delete(k); });
  }
  return extMan;
}
/** Instrument du pack (manifeste) ou externe (préfixe ext_). */
function inst(id) {
  if (typeof id === 'string' && id.startsWith('ext_')) { const e = ext(); return e && e[id] && e[id].zones?.length ? e[id] : null; }
  const m = man(); return m && m.instruments[id] ? m.instruments[id] : null;
}
const fileOf = (file) => (path.isAbsolute(file) ? file : path.join(SAMPLE_DIR, file));
/** v1.21.4 : samples externes disponibles (catégorie → nombre de fichiers). */
export function extSamplesInfo() { const e = ext(); if (!e) return null; const o = {}; for (const [k, v] of Object.entries(e)) o[k.slice(4)] = v.zones.length; return o; }
export function sampleCacheStats() { return { files: bufCache.size, mb: +(cacheBytes / 1e6).toFixed(1), capMb: CACHE_CAP / 1e6 }; }
// Un instrument dont le dossier a été retiré du pack (ex. jrhodes/ ou salamander/ pour un pack 100 % libre) est ignoré : repli sur la synthèse.
const present = new Map();
export function hasInstrument(id) {
  const I = inst(id); if (!(I && I.zones.length)) return false;
  if (!present.has(id)) present.set(id, fs.existsSync(fileOf(I.zones[0].file)));
  return present.get(id);
}

// Cache LRU des échantillons décodés, stockés en Int16 (moitié moins de mémoire que Float32).
const CACHE_CAP = (+process.env.SOUNDTUBE_SAMPLE_CACHE_MB || 160) * 1e6;
const bufCache = new Map(); let cacheBytes = 0;
const I16 = 1 / 32767;
/** Décode un fichier du pack -> { L, R } (Int16Array, échelle 1/32767). */
function load(file, mono = false) {
  const key = file + (mono ? '#m' : '');
  let b = bufCache.get(key);
  if (b) { bufCache.delete(key); bufCache.set(key, b); return b; }
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', fileOf(file), '-f', 's16le', '-ac', mono ? '1' : '2', '-ar', String(SR), 'pipe:1'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error('échantillon illisible : ' + file);
  const d = new Int16Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length));
  if (mono) b = { L: d, R: d, bytes: d.byteLength };
  else {
    const n = d.length / 2, L = new Int16Array(n), R = new Int16Array(n);
    for (let i = 0; i < n; i++) { L[i] = d[2 * i]; R[i] = d[2 * i + 1]; }
    b = { L, R, bytes: L.byteLength * 2 };
  }
  bufCache.set(key, b); cacheBytes += b.bytes;
  while (cacheBytes > CACHE_CAP && bufCache.size > 1) { const [k0, v0] = bufCache.entries().next().value; bufCache.delete(k0); cacheBytes -= v0.bytes; }
  return b;
}

// Instruments échantillonnés exposés comme « patchs » (repli synthétique si le pack est absent).
export const SAMPLED = {
  piano:      { src: [['piano', 0, 127]], rel: 0.32, gain: 0.62, fallback: 'epiano', layers: [0.62] },
  ensemble:   { src: [['celli', 0, 59], ['violins', 60, 127]], rel: 0.55, gain: 0.5, loop: true, fallback: 'strings', layers: [0.7], attack: 0.06 },
  spiccato:   { src: [['celli_spic', 0, 57], ['violins_spic', 58, 127]], rel: 0.1, gain: 0.55, fallback: 'staccato', rr: true },
  frenchhorn: { src: [['horn', 0, 127]], rel: 0.3, gain: 0.55, loop: true, fallback: 'horn', layers: [0.6], attack: 0.03 },
  harp:       { src: [['harp', 0, 127]], rel: 0.4, gain: 0.6, fallback: 'pluck' },
  vibes:      { src: [['vibes', 0, 127]], rel: 0.3, gain: 0.5, fallback: 'bell', layers: [0.6] },
  flute:      { src: [['flute', 0, 127]], rel: 0.16, gain: 0.45, loop: true, fallback: 'mellow', attack: 0.02 },
  uprightbass:{ src: [['upbass', 0, 127]], rel: 0.09, gain: 0.85, fallback: 'softbass', layers: [0.68] },
  pizz:       { src: [['celli_pizz', 0, 54], ['violins_pizz', 55, 127]], rel: 0.12, gain: 0.6, fallback: 'pluck' },
  // v1.6 : pianos à queue et Rhodes en couches de vélocité « naturelles » (niveau d'origine conservé entre couches,
  // normalisation par instrument) ; choix de zone : note la plus proche, puis couche demandée (ou la plus forte disponible en dessous)
  piano_steinway:   { src: [['steinwayb', 0, 127]], rel: 0.34, gain: 0.72, fallback: 'piano', layers: [0.55], natural: true, velMin: 0.3 },
  piano_salamander: { src: [['salamander', 0, 127]], rel: 0.34, gain: 1.12, fallback: 'piano', layers: [0.35, 0.6, 0.82], natural: true },
  rhodes_s:         { src: [['jrhodes', 0, 127]], rel: 0.2, gain: 0.48, fallback: 'rhodes_synth', layers: [0.3, 0.5, 0.7, 0.88], natural: true },
};
/** Sons de piano (réglage « Son de piano ») -> patch échantillonné. */
export const PIANO_SOUNDS = { steinway: 'piano_steinway', salamander: 'piano_salamander', upright: 'piano' };
export function isSampledPatch(p) { return !!SAMPLED[p]; }
export function sampledFallback(p) { return SAMPLED[p]?.fallback; }
export function patchUsable(p) { const d = SAMPLED[p]; return !!d && d.src.every(([id]) => hasInstrument(id)); }

function zonesFor(def, midi) {
  const m = man();
  let src = def.src.find(([, lo, hi]) => midi >= lo && midi <= hi) || def.src[0];
  let zs = m.instruments[src[0]].zones;
  // si la note sort largement de la tessiture de la source, essayer les autres sources
  const span = (z) => Math.abs(z.midi - midi);
  const best = Math.min(...zs.map(span));
  if (best > 5) for (const [id] of def.src) { const o = m.instruments[id].zones; if (Math.min(...o.map(span)) < best) zs = o; }
  return zs;
}

/** 4 points, interpolation d'Hermite. */
function hermite(x, i, f) {
  const xm1 = x[i - 1] ?? x[i], x0 = x[i] ?? 0, x1 = x[i + 1] ?? 0, x2 = x[i + 2] ?? 0;
  const c1 = 0.5 * (x1 - xm1), c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2, c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);
  return ((c3 * f + c2) * f + c1) * f + x0;
}

/**
 * Joue une note échantillonnée. Renvoie { L, R } ou null (pack indisponible).
 * o : { rnd, bright, att } — rnd sert au choix round-robin et au micro-désaccord (humanisation).
 */
export function playSampled(patch, midi, gateS, vel, o = {}) {
  const def = SAMPLED[patch];
  if (!def || !patchUsable(patch)) return null;
  const rnd = o.rnd || Math.random;
  const zs = zonesFor(def, midi);
  // couche de vélocité
  const th = def.layers || [0.6];
  let z;
  if (def.natural) {
    let li = 0; for (let k = 0; k < th.length; k++) if (vel > th[k]) li = k + 1;
    const dist = Math.min(...zs.map((q) => Math.abs(q.midi - midi)));
    const near = zs.filter((q) => Math.abs(q.midi - midi) === dist);
    const below = near.filter((q) => q.layer <= li);
    const pickL = below.length ? Math.max(...below.map((q) => q.layer)) : Math.min(...near.map((q) => q.layer));
    const pool = near.filter((q) => q.layer === pickL);
    z = pool[Math.floor(rnd() * pool.length)];
  } else {
    const layers = [...new Set(zs.map((q) => q.layer))].sort((a, b) => a - b);
    let li = 0;
    for (let k = 0; k < th.length && k < layers.length - 1; k++) if (vel > th[k]) li = k + 1;
    const want = layers[Math.min(li, layers.length - 1)];
    const pool = zs.filter((q) => q.layer === want);
    const dist = Math.min(...pool.map((q) => Math.abs(q.midi - midi)));
    const near = pool.filter((q) => Math.abs(q.midi - midi) === dist);
    z = near[Math.floor(rnd() * near.length)];
  }
  const b = load(z.file);
  const cents = (rnd() * 2 - 1) * 3; // micro-désaccord humain
  // correction fine de justesse mesurée à la construction du pack (si fiable : |écart| <= 35 cents)
  let fix = 0; if (z.detected != null) { let d = z.detected - z.midi; d -= Math.round(d / 12) * 12; if (Math.abs(d) <= 0.35) fix = -d; }
  const ratio = Math.pow(2, (midi - z.midi + fix + cents / 100) / 12);
  const srcLen = b.L.length;
  const rel = def.rel * (o.relMul || 1);
  const gate = Math.max(0.02, gateS);
  let outLen = Math.ceil((gate + rel) * SR);
  if (!def.loop) outLen = Math.min(outLen, Math.floor((srcLen - 3) / ratio));
  const L = new Float32Array(outLen), R = new Float32Array(outLen);
  // boucle de maintien : [ls, le) avec fondu enchaîné de xf échantillons
  const ls = Math.floor(srcLen * 0.4), le = Math.floor(srcLen * 0.9), xf = Math.min(Math.floor(0.12 * SR), Math.floor((le - ls) / 3));
  const loopLen = le - ls;
  const gateN = Math.floor(gate * SR), relN = Math.max(1, Math.floor(rel * SR));
  const attN = Math.floor((def.attack || 0) * (o.att || 1) * SR * (1.2 - vel));
  // couches naturelles : le niveau vient surtout de l'échantillon ; la vélocité module plus doucement à l'intérieur d'une couche
  const g = def.gain * (def.natural ? (def.velMin ?? 0.5) + (1 - (def.velMin ?? 0.5)) * Math.min(1.2, vel) : 0.18 + 0.82 * Math.pow(Math.min(1.2, vel), 1.5)) * I16;
  let pos = 0;
  for (let i = 0; i < outLen; i++) {
    let p = pos;
    if (def.loop) while (p >= le) p -= loopLen;
    const ip = Math.floor(p), fr = p - ip;
    let l = hermite(b.L, ip, fr), r = hermite(b.R, ip, fr);
    if (def.loop && p >= le - xf && pos >= le - xf) {
      // fondu vers le début de boucle
      const q = p - loopLen, iq = Math.floor(q), fq = q - iq, w = (p - (le - xf)) / xf;
      l = l * (1 - w) + hermite(b.L, iq, fq) * w; r = r * (1 - w) + hermite(b.R, iq, fq) * w;
    }
    let a = g;
    if (attN && i < attN) a *= i / attN;
    if (i >= gateN) { const k = (i - gateN) / relN; a *= k >= 1 ? 0 : (1 - k) * (1 - k); }
    L[i] = l * a; R[i] = r * a;
    pos += ratio;
  }
  // brillance (automation de filtre / vélocité) : passe-bas doux
  const cut = 20000 * Math.min(1, (o.bright || 1)) * (0.55 + 0.45 * Math.min(1, vel));
  if (cut < 15000) { onePoleLP(L, cut); onePoleLP(R, cut); }
  return { L, R };
}

/** Niveaux d'un instrument de percussion par couche (manifeste : rms d'attaque, crête) — sans décodage. */
const levelCache = new Map();
export function drumLevels(id) {
  if (typeof id === 'string' && id.startsWith('ext_') && !inst(id)) return null; // v1.21.4 : index externe absent / désactivé
  if (levelCache.has(id)) return levelCache.get(id);
  const I = inst(id); if (!I) return null;
  const byL = {};
  for (const z of I.zones) (byL[z.layer] ||= []).push(z);
  const layers = Object.keys(byL).map(Number).sort((a, b) => a - b);
  const rms = {}, peak = {};
  for (const l of layers) { rms[l] = byL[l].reduce((a, z) => a + (z.rms || z.peak), 0) / byL[l].length; peak[l] = Math.max(...byL[l].map((z) => z.peak)); }
  const o = { layers, rms, peak, count: Object.fromEntries(layers.map((l) => [l, byL[l].length])) };
  levelCache.set(id, o); return o;
}
/**
 * Choix d'une frappe : couche disponible la plus proche en dessous ; dans la couche, si les fichiers sont une échelle
 * de vélocités (caisse claire 36 niveaux…), position `sub` (0..1) ± 1 cran selon rr, sinon variante round-robin.
 */
export function drumZone(id, layer, rr, sub = 0.5) {
  const lv = drumLevels(id); if (!lv) return null;
  const below = lv.layers.filter((l) => l <= layer);
  const L = below.length ? below[below.length - 1] : lv.layers[0];
  const pool = inst(id).zones.filter((z) => z.layer === L).sort((a, b) => (a.vl || 0) - (b.vl || 0) || a.rr - b.rr);
  const ladder = new Set(pool.map((z) => z.vl)).size === pool.length && pool.length > 2;
  if (!ladder) return pool[rr % pool.length];
  const i = Math.max(0, Math.min(pool.length - 1, Math.round(sub * (pool.length - 1)) + (rr % 3) - 1));
  return pool[i];
}
/** v1.21.4 : samples externes — un fichier par catégorie et par morceau, tiré de la graine (extSeed) : kit cohérent. */
export function extZone(id, extSeed, kind) {
  const I = inst(id); if (!I) return null;
  const zs = I.zones; let h = (extSeed >>> 0) ^ 0x9e3779b9;
  for (const c of String(kind)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return zs[h % zs.length];
}
/** Décode une frappe (zone du manifeste) -> Float32Array mono transposée. */
export function drumHit(z, pitch = 1) {
  const b = load(z.file, true).L;
  let out;
  if (Math.abs(pitch - 1) < 1e-3) out = Float32Array.from(b, (v) => v * I16);
  else { const n = Math.floor((b.length - 3) / pitch); out = new Float32Array(n); for (let i = 0; i < n; i++) { const p = i * pitch, ip = Math.floor(p); out[i] = hermite(b, ip, p - ip) * I16; } }
  return out;
}

/** Échantillon de percussion mono (couche + round-robin), transposable. */
export function drumSample(id, layer = 0, rr = 0, pitch = 1) {
  const I = inst(id); if (!I) return null;
  const zs = I.zones;
  const layers = [...new Set(zs.map((z) => z.layer))].sort((a, b) => a - b);
  const want = layers[Math.min(layer, layers.length - 1)];
  const pool = zs.filter((z) => z.layer === want);
  const z = pool[rr % pool.length];
  const b = load(z.file, true).L;
  if (Math.abs(pitch - 1) < 1e-3) return Float32Array.from(b, (v) => v * I16);
  const n = Math.floor((b.length - 3) / pitch), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * pitch, ip = Math.floor(p); out[i] = hermite(b, ip, p - ip) * I16; }
  return out;
}
