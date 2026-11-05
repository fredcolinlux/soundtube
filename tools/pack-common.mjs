// Outils communs de construction du pack : sources (miroir local ou téléchargement), décodage / encodage ffmpeg.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const SR = 44100;
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const OUT = process.env.PACK_OUT || path.join(ROOT, 'assets', 'samples');
export const CACHE = process.env.PACK_CACHE || '/tmp/soundtube-pack-cache';
// PACK_SRC : dossier où les banques ont déjà été téléchargées (même nom de fichier que l'URL), sinon téléchargement.
export const LOCAL = process.env.PACK_SRC || '';

/** Liste d'URL d'une banque (tools/pack-sources/<nom>.txt). */
export function sourceList(name) {
  return fs.readFileSync(path.join(ROOT, 'tools', 'pack-sources', name + '.txt'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
}
const base = (url) => url.split('/').pop();
export const decodedName = (url) => decodeURIComponent(base(url));

/** Fichier local d'une URL (miroir PACK_SRC, cache, ou téléchargement). */
export async function fetchSource(url, localDirs = []) {
  const b = base(url), d = decodeURIComponent(b);
  const parts = new URL(url).pathname.split('/').map(decodeURIComponent);
  if (LOCAL) {
    for (const dir of localDirs) {
      // ex. frankensnare/20m_tight/top/sn_vl1_rr1.flac : on essaie aussi les 2 derniers dossiers de l'URL
      for (const rel of [[b], [d], parts.slice(-3), parts.slice(-2)]) {
        const f = path.join(LOCAL, dir, ...rel);
        if (fs.existsSync(f) && fs.statSync(f).size > 0) return f;
      }
    }
  }
  const f = path.join(CACHE, 'extra', ...parts.slice(1));
  if (fs.existsSync(f) && fs.statSync(f).size > 0) return f;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  for (let k = 0; k < 4; k++) {
    try { const r = await fetch(url); if (r.ok) { fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); return f; } } catch {}
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error('téléchargement impossible : ' + url);
}

/** Décode en float32 entrelacé à 44,1 kHz. */
export function decode(file, ch) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', String(ch), '-ar', String(SR), '-af', 'aresample=resampler=soxr', 'pipe:1'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) {
    const r2 = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', String(ch), '-ar', String(SR), 'pipe:1'], { maxBuffer: 1 << 30 });
    if (r2.status !== 0) throw new Error(String(r2.stderr));
    return new Float32Array(r2.stdout.buffer, r2.stdout.byteOffset, r2.stdout.length / 4).slice();
  }
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4).slice();
}
/** Encode en FLAC 16 bits (tramage triangulaire). */
export function encode(data, ch, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ac', String(ch), '-ar', String(SR), '-i', 'pipe:0', '-af', 'aresample=osf=s16:dither_method=triangular', '-sample_fmt', 's16', '-compression_level', '8', out], { input: Buffer.from(data.buffer, data.byteOffset, data.byteLength), maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(String(r.stderr));
}
/** Hauteur estimée (MIDI fractionnaire) par autocorrélation normalisée. */
export function detectMidi(mono) {
  const s = Math.floor(0.15 * SR), n = Math.min(8192, mono.length - s); if (n < 2048) return null;
  const x = mono.subarray(s, s + n); let best = 0, lag = 0;
  for (let L = Math.floor(SR / 2000); L < Math.min(n / 2, SR / 30); L++) {
    let a = 0, b = 0, c = 0; for (let i = 0; i < n - L; i += 2) { a += x[i] * x[i + L]; b += x[i] * x[i]; c += x[i + L] * x[i + L]; }
    const r = a / Math.sqrt(b * c + 1e-12); if (r > best) { best = r; lag = L; }
  }
  if (best < 0.6) return null;
  return 69 + 12 * Math.log2(SR / lag / 440);
}
/** Début de l'attaque : premier échantillon au-dessus de max(-66 dBFS, crête - 40 dB), moins 1 ms. */
export function onset(x, ch) {
  const n = x.length / ch; let pk = 1e-9; for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
  const th = Math.max(0.0005, pk * 0.01);
  let st = 0; outer: for (; st < n; st++) for (let c = 0; c < ch; c++) if (Math.abs(x[st * ch + c]) > th) break outer;
  return Math.max(0, st - Math.round(0.001 * SR));
}
/** Rogne [st, st+len) avec fondu de fin (fadeS) et renvoie une copie. */
export function trim(x, ch, st, maxS, fadeS) {
  const n = x.length / ch, len = Math.max(1, Math.min(n - st, Math.round(maxS * SR)));
  const o = x.slice(st * ch, (st + len) * ch);
  const fade = Math.min(len, Math.round(fadeS * SR));
  for (let i = 0; i < fade; i++) { const g = Math.cos((i / fade) * Math.PI / 2) ** 2; for (let c = 0; c < ch; c++) o[(len - fade + i) * ch + c] *= g; }
  return o;
}
export const peakOf = (x) => { let p = 1e-9; for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i])); return p; };
/** RMS des 60 premières ms (niveau perçu d'une frappe). */
export function attackRms(x, ch) { const n = Math.min(x.length / ch, Math.round(0.06 * SR)); let s = 0; for (let i = 0; i < n * ch; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, n * ch)); }
