// Découpage des générations longues (> 30 min) en morceaux individuels : un fichier par sous-morceau du mix DJ
// (ou par chapitre d'un long morceau), WAV + MP3 + MIDI, livrés en ZIP et, au choix, ajoutés à la bibliothèque.
// Tout est en flux : le WAV source est lu par blocs (jamais chargé en mémoire), les coupes sont exactes à l'échantillon,
// un fondu très court (15 ms) évite les clics, le MP3 de chaque morceau est encodé par ffmpeg pendant la coupe du suivant.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { config } from './config.js';
import { makeTitleEn, translateTitle, titleEnOf } from './titles.js';
import { planMix, deckPlan } from './engine/mix.js';
import { composeChapter, meterInfo } from './engine/composer.js';
import { MidiCollector } from './engine/midi.js';
import { GM_DRUMS } from './engine/instruments.js';

export const SPLIT_MIN_SECONDS = 1800;
export const SPLIT_MODES = {
  mid: { label: 'Coupe au milieu des transitions', help: 'Morceaux bout à bout : mis à la suite, ils redonnent le mix exact. Chaque début et fin contient la moitié du fondu enchaîné.' },
  full: { label: 'Transitions complètes', help: 'Chaque morceau garde tout son fondu d\'entrée et de sortie (on entend le morceau voisin pendant la transition).' },
  clean: { label: 'Sans transitions', help: 'Seulement la partie où le morceau joue seul : début et fin nets avec un fondu court, sans le morceau voisin.' },
};
const FADE_SEC = 0.015;
const CLEAN_FADE_SEC = 0.25;
const MAX_NAME = 90;

/** Nom de fichier sûr (accents conservés, caractères interdits retirés). */
export const safeName = (s) => String(s || '').normalize('NFC').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, MAX_NAME).trim() || 'morceau';
export const pieceBase = (n, total, title) => `${String(n).padStart(Math.max(2, String(total).length), '0')} - ${safeName(title)}`;

/** Le morceau peut-il être découpé ? → { ok, reason, kind: 'mix' | 'chapters' } */
export function splitAvailability(t, minSeconds = SPLIT_MIN_SECONDS) { // v1.13.0 : minSeconds = 0 pour le paquet ZIP (mix courts)
  if (!t || t.status !== 'done') return { ok: false, reason: 'Morceau pas encore prêt.' };
  if (!(t.duration > minSeconds)) return { ok: false, reason: 'Réservé aux générations de plus de 30 min.' };
  if (!t.files?.wav && !t.files?.mp3) return { ok: false, reason: 'Aucun fichier audio.' };
  const decks = t.meta?.mix?.decks;
  if (decks?.length >= 2) return { ok: true, kind: 'mix' };
  if ((t.meta?.chapters || []).filter((c) => Number.isFinite(c.startSec)).length >= 2) return { ok: true, kind: 'chapters' };
  return { ok: false, reason: 'Pas de sous-morceaux ni de chapitres à découper.' };
}

/**
 * Plan de découpe (secondes) : [{ n, start, end, fadeIn, fadeOut, title, title_en, deck }].
 * mid : coupe au milieu de chaque fondu enchaîné (= début de chapitre YouTube) ; full : transitions entières ;
 * clean : de la fin du fondu d'entrée au début du fondu de sortie.
 */
export function splitPlan(t, mode = 'mid', minSeconds = SPLIT_MIN_SECONDS) {
  const av = splitAvailability(t, minSeconds); if (!av.ok) { const e = new Error(av.reason); e.status = 409; throw e; }
  if (!SPLIT_MODES[mode]) { const e = new Error('mode : mid, full ou clean'); e.status = 400; throw e; }
  const total = t.duration, out = [];
  if (av.kind === 'mix') {
    const D = t.meta.mix.decks, n = D.length, has = D.every((d) => Number.isFinite(d.deckStart) && Number.isFinite(d.deckEnd));
    const m = has ? mode : 'mid';
    D.forEach((d, i) => {
      let s, e;
      if (m === 'full') { s = i ? d.deckStart : 0; e = i < n - 1 ? d.deckEnd : total; }
      else if (m === 'clean') { s = i ? D[i - 1].deckEnd : 0; e = i < n - 1 ? D[i + 1].deckStart : total; }
      else { s = i ? d.start : 0; e = i < n - 1 ? D[i + 1].start : total; }
      const f = m === 'clean' ? CLEAN_FADE_SEC : FADE_SEC;
      const en = d.seed != null ? makeTitleEn(d.seed, 0, `${t.style}:deck`) : null;
      out.push({ n: i + 1, start: s, end: Math.min(total, e), fadeIn: i ? f : 0, fadeOut: i < n - 1 ? f : 0, title: d.name, title_en: translateTitle(d.name) || en || d.name, deck: i }); // même titre EN que le chapitre YouTube du mix
    });
  } else {
    const C = t.meta.chapters.filter((c) => Number.isFinite(c.startSec)), n = C.length, en = titleEnOf(t);
    C.forEach((c, i) => out.push({ n: i + 1, start: i ? c.startSec : 0, end: i < n - 1 ? C[i + 1].startSec : total, fadeIn: i ? FADE_SEC : 0, fadeOut: i < n - 1 ? FADE_SEC : 0,
      title: `${t.title} — partie ${i + 1}`, title_en: `${en} — Part ${i + 1}`, deck: null }));
  }
  return out.filter((p) => p.end - p.start > 1).map((p) => ({ ...p, start: +p.start.toFixed(3), end: +p.end.toFixed(3) }));
}

// ---------- WAV
/** En-tête WAV : { sr, ch, bits, fmt, dataOffset, dataBytes } (PCM 16 bits attendu). */
export function readWavHeader(fd, fileSize) {
  const h = Buffer.alloc(Math.min(65536, fileSize)); fs.readSync(fd, h, 0, h.length, 0);
  if (h.toString('ascii', 0, 4) !== 'RIFF' || h.toString('ascii', 8, 12) !== 'WAVE') throw new Error('WAV illisible');
  let p = 12, fmt = null;
  while (p + 8 <= h.length) {
    const id = h.toString('ascii', p, p + 4), size = h.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { fmt: h.readUInt16LE(p + 8), ch: h.readUInt16LE(p + 10), sr: h.readUInt32LE(p + 12), bits: h.readUInt16LE(p + 22) };
    else if (id === 'data') {
      if (!fmt) throw new Error('WAV sans bloc fmt');
      const dataOffset = p + 8, avail = fileSize - dataOffset, align = fmt.ch * fmt.bits / 8;
      const dataBytes = Math.floor((size === 0xffffffff || size > avail ? avail : size) / align) * align; // > 4 Go : taille déduite du fichier
      return { ...fmt, dataOffset, dataBytes, align };
    }
    p += 8 + size + (size & 1);
  }
  throw new Error('WAV sans données');
}
export function wavHeader(frames, { sr = 44100, ch = 2, tags = {} } = {}) {
  const info = [];
  for (const [k, v] of Object.entries(tags)) if (v) { const b = Buffer.from(String(v).normalize('NFC') + '\0', 'utf8'); const pad = b.length & 1; const c = Buffer.alloc(8 + b.length + pad); c.write(k, 0); c.writeUInt32LE(b.length, 4); b.copy(c, 8); info.push(c); }
  const list = info.length ? Buffer.concat([Buffer.from('LIST'), Buffer.alloc(4), Buffer.from('INFO'), ...info]) : Buffer.alloc(0);
  if (list.length) list.writeUInt32LE(list.length - 8, 4);
  const dataBytes = frames * ch * 2, h = Buffer.alloc(44 + list.length);
  h.write('RIFF', 0); h.writeUInt32LE(Math.min(0xffffffff, 36 + list.length + dataBytes), 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(ch, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * ch * 2, 28); h.writeUInt16LE(ch * 2, 32); h.writeUInt16LE(16, 34);
  list.copy(h, 36); h.write('data', 36 + list.length); h.writeUInt32LE(Math.min(0xffffffff, dataBytes), 40 + list.length);
  return h;
}

// ---------- CRC32 (zlib.crc32 si Node ≥ 22.2, sinon table)
const CRC_T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export const crc32 = typeof zlib.crc32 === 'function' ? (buf, prev = 0) => zlib.crc32(buf, prev) : (buf, prev = 0) => {
  let c = (prev ^ 0xffffffff) >>> 0; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
};
export async function fileCrc(file) { let c = 0, size = 0; for await (const b of fs.createReadStream(file, { highWaterMark: 1 << 20 })) { c = crc32(b, c); size += b.length; } return { crc: c, size }; }

/**
 * Copie [f0, f1) (trames) du WAV source vers `out`, fondus en entrée/sortie, CRC et crêtes calculés au passage.
 * Mémoire bornée (blocs de 1 Mo).
 */
export function cutWav(fd, H, f0, f1, out, { fadeIn = 0, fadeOut = 0, tags = {}, points = 600 } = {}) {
  const frames = f1 - f0, BLK = 262144, align = H.align, buf = Buffer.alloc(BLK * align);
  const hdr = wavHeader(frames, { sr: H.sr, ch: H.ch, tags }), fo = fs.openSync(out, 'w');
  let crc = crc32(hdr); fs.writeSync(fo, hdr);
  const fi = Math.round(fadeIn * H.sr), fOut = Math.round(fadeOut * H.sr), step = Math.max(1, Math.floor(frames / points)), peaks = new Float32Array(points);
  try {
    for (let done = 0; done < frames;) {
      const n = Math.min(BLK, frames - done), bytes = n * align;
      const got = fs.readSync(fd, buf, 0, bytes, H.dataOffset + (f0 + done) * align);
      if (got < bytes) buf.fill(0, got, bytes); // fichier tronqué : silence
      const v = new Int16Array(buf.buffer, buf.byteOffset, n * H.ch), C = H.ch;
      // fondus : seulement sur les trames concernées
      for (let k = Math.max(done, 0); k < Math.min(done + n, fi); k++) { const g = Math.sin((Math.PI / 2) * (k + 0.5) / fi), o = (k - done) * C; for (let c = 0; c < C; c++) v[o + c] = Math.round(v[o + c] * g); }
      for (let k = Math.max(done, frames - fOut); k < done + n; k++) { const g = Math.sin((Math.PI / 2) * (frames - 1 - k + 0.5) / fOut), o = (k - done) * C; for (let c = 0; c < C; c++) v[o + c] = Math.round(v[o + c] * g); }
      // crêtes pour la forme d'onde (1 trame sur 4, comme le rendu)
      for (let i = 0; i < n; i += 4) {
        let a = 0; for (let c = 0; c < C; c++) { const x = v[i * C + c], ax = x < 0 ? -x : x; if (ax > a) a = ax; }
        const p = Math.min(points - 1, Math.floor((done + i) / step)), q = a / 32768; if (q > peaks[p]) peaks[p] = q;
      }
      const chunk = buf.subarray(0, bytes); crc = crc32(chunk, crc); fs.writeSync(fo, chunk); done += n;
    }
  } finally { fs.closeSync(fo); }
  return { size: hdr.length + frames * align, crc, frames, peaks: Array.from(peaks, (v) => Math.round(v * 1000) / 1000) };
}

const run = (args) => new Promise((resolve, reject) => {
  const p = spawn(config.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] }); let err = '';
  p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  p.on('error', reject); p.on('close', (c) => (c === 0 ? resolve() : reject(new Error('ffmpeg : ' + (err.trim().split('\n').pop() || c)))));
});
/** MP3 d'un morceau découpé (CBR comme les morceaux de la bibliothèque, balises ID3). */
export async function encodeMp3(wav, mp3, { title, artist, album, track } = {}) {
  const md = [['title', title], ['artist', artist], ['album', album], ['track', track], ['comment', 'Musique originale générée par soundtube']].filter(([, v]) => v).flatMap(([k, v]) => ['-metadata', `${k}=${v}`]);
  await run(['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', config.mp3Bitrate || '192k', '-id3v2_version', '3', ...md, mp3]);
}
/** Décode une source non PCM 16 bits (MP3 seul, WAV d'un autre format) vers un WAV temporaire, en flux. */
const decodeToWav = (src, out) => run(['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-map', '0:a:0', '-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '2', out]);

/** MIDI d'un sous-morceau du mix (recomposé à l'identique, en temps local) : { full, per: [{id, buf}] }. */
export function deckMidi(plan, name) {
  const P = plan.params, midi = new MidiCollector({ bpm: P.bpm, meter: meterInfo(P).meter, name, patches: plan.S.patches, gmDrums: GM_DRUMS });
  const state = {}; for (let ci = 0; ci < plan.chapters.length; ci++) for (const e of composeChapter(plan, ci, state)) midi.add(e);
  return { full: midi.full(), per: midi.perInstrument() };
}
const deckParams = (d) => ({ ...d.params, duration: Math.round((d.endSec - d.startSec) * 10) / 10 });
/** Méta du sous-morceau (structure, harmonie, recette) avec ses chapitres recalés sur le début de la pièce. */
function pieceMeta(pm, shift, dur) {
  const { chapters, sections, ...rest } = pm;
  const ch = (chapters || []).map((c) => ({ ...c, startSec: Math.max(0, +((c.startSec || 0) + shift).toFixed(2)) })).filter((c, i, A) => c.startSec < dur - 10 && (i === 0 || c.startSec > A[i - 1].startSec));
  if (ch.length) ch[0].startSec = 0;
  return { ...rest, seconds: dur, chapters: ch };
}

// ---------- ZIP en flux (stockage sans compression, ZIP64 si > 4 Go), taille exacte connue d'avance
const DOS = (() => { const n = new Date(); return { t: ((n.getHours() << 11) | (n.getMinutes() << 5) | (n.getSeconds() >> 1)) & 0xffff, d: (((n.getFullYear() - 1980) << 9) | ((n.getMonth() + 1) << 5) | n.getDate()) & 0xffff }; })();
const U32 = 0xffffffff;
function localHeader(f) {
  const name = Buffer.from(f.name, 'utf8'), big = f.size >= U32;
  const ex = big ? Buffer.alloc(20) : Buffer.alloc(0); if (big) { ex.writeUInt16LE(1, 0); ex.writeUInt16LE(16, 2); ex.writeBigUInt64LE(BigInt(f.size), 4); ex.writeBigUInt64LE(BigInt(f.size), 12); }
  const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(big ? 45 : 20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8);
  h.writeUInt16LE(DOS.t, 10); h.writeUInt16LE(DOS.d, 12); h.writeUInt32LE(f.crc >>> 0, 14); h.writeUInt32LE(big ? U32 : f.size, 18); h.writeUInt32LE(big ? U32 : f.size, 22);
  h.writeUInt16LE(name.length, 26); h.writeUInt16LE(ex.length, 28);
  return Buffer.concat([h, name, ex]);
}
function centralHeader(f, off) {
  const name = Buffer.from(f.name, 'utf8'), bigS = f.size >= U32, bigO = off >= U32, ex = [];
  if (bigS) ex.push(BigInt(f.size), BigInt(f.size)); if (bigO) ex.push(BigInt(off));
  const e = ex.length ? Buffer.alloc(4 + 8 * ex.length) : Buffer.alloc(0); if (ex.length) { e.writeUInt16LE(1, 0); e.writeUInt16LE(8 * ex.length, 2); ex.forEach((v, i) => e.writeBigUInt64LE(v, 4 + 8 * i)); }
  const h = Buffer.alloc(46); h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(0x033f, 4); h.writeUInt16LE(ex.length ? 45 : 20, 6); h.writeUInt16LE(0x0800, 8); h.writeUInt16LE(0, 10);
  h.writeUInt16LE(DOS.t, 12); h.writeUInt16LE(DOS.d, 14); h.writeUInt32LE(f.crc >>> 0, 16); h.writeUInt32LE(bigS ? U32 : f.size, 20); h.writeUInt32LE(bigS ? U32 : f.size, 24);
  h.writeUInt16LE(name.length, 28); h.writeUInt16LE(e.length, 30); h.writeUInt32LE(0o100644 << 16 >>> 0, 38); h.writeUInt32LE(bigO ? U32 : off, 42);
  return Buffer.concat([h, name, e]);
}
function zipTrailer(entries, cdStart, cdSize) {
  const n = entries.length, z64 = cdStart + cdSize >= U32 || cdStart >= U32 || n >= 0xffff, parts = [];
  if (z64) {
    const r = Buffer.alloc(56); r.writeUInt32LE(0x06064b50, 0); r.writeBigUInt64LE(44n, 4); r.writeUInt16LE(45, 12); r.writeUInt16LE(45, 14);
    r.writeBigUInt64LE(BigInt(n), 24); r.writeBigUInt64LE(BigInt(n), 32); r.writeBigUInt64LE(BigInt(cdSize), 40); r.writeBigUInt64LE(BigInt(cdStart), 48);
    const l = Buffer.alloc(20); l.writeUInt32LE(0x07064b50, 0); l.writeBigUInt64LE(BigInt(cdStart + cdSize), 8); l.writeUInt32LE(1, 16);
    parts.push(r, l);
  }
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Math.min(n, 0xffff), 8); e.writeUInt16LE(Math.min(n, 0xffff), 10);
  e.writeUInt32LE(z64 ? U32 : cdSize, 12); e.writeUInt32LE(z64 ? U32 : cdStart, 16);
  parts.push(e); return Buffer.concat(parts);
}
/** Prépare un ZIP en flux : { size, pipe(res) } — entries = [{ name, path, size, crc }]. */
export function zipStream(entries) {
  let off = 0; const offs = [];
  for (const f of entries) { offs.push(off); off += localHeader(f).length + f.size; }
  const cd = Buffer.concat(entries.map((f, i) => centralHeader(f, offs[i])));
  const tail = zipTrailer(entries, off, cd.length), size = off + cd.length + tail.length;
  async function pipe(w) {
    const write = (b) => new Promise((res, rej) => { if (w.destroyed) return rej(new Error('fermé')); w.write(b) ? res() : w.once('drain', res); });
    for (const f of entries) {
      await write(localHeader(f));
      if (f.data) await write(f.data);
      else for await (const b of fs.createReadStream(f.path, { highWaterMark: 1 << 20 })) await write(b);
    }
    await write(cd); await write(tail); w.end();
  }
  return { size, pipe };
}

// ---------- tâche de découpe
/**
 * Découpe le morceau t (déjà fini) dans outDir. opts = { mode, lang: 'fr'|'en', formats: { wav, mp3, midi }, brand, onProgress(f, stage) }.
 * Retourne le manifeste (écrit dans outDir/manifest.json).
 */
export async function splitTrack(t, trackDir, outDir, opts = {}) {
  const mode = opts.mode || 'mid', lang = opts.lang === 'en' ? 'en' : 'fr';
  const F = { wav: opts.formats?.wav !== false, mp3: opts.formats?.mp3 !== false && opts.hasFfmpeg !== false, midi: opts.formats?.midi !== false };
  if (!F.wav && !F.mp3 && !F.midi) { const e = new Error('Choisis au moins un format.'); e.status = 400; throw e; }
  const plan = splitPlan(t, mode, opts.minSeconds ?? SPLIT_MIN_SECONDS), onP = opts.onProgress || (() => {});
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  // source PCM 16 bits : le WAV du morceau, sinon décodage temporaire (MP3 seul)
  let src = t.files?.wav ? path.join(trackDir, t.files.wav) : null, tmp = null, fd = null;
  try {
    let H = null;
    if (src && fs.existsSync(src)) { fd = fs.openSync(src, 'r'); H = readWavHeader(fd, fs.fstatSync(fd).size); if (H.fmt !== 1 || H.bits !== 16) { fs.closeSync(fd); fd = null; } }
    if (!fd) {
      const from = src && fs.existsSync(src) ? src : path.join(trackDir, t.files?.mp3 || '');
      if (!fs.existsSync(from)) throw new Error('Fichier audio introuvable.');
      onP(0.01, 'Décodage de l\'audio source…'); tmp = path.join(outDir, '.source.wav'); await decodeToWav(from, tmp);
      fd = fs.openSync(tmp, 'r'); H = readWavHeader(fd, fs.fstatSync(fd).size);
    }
    const totalFrames = H.dataBytes / H.align, N = plan.length, album = lang === 'en' ? titleEnOf(t) : t.title;
    let mx = null; const pieces = [], encodes = []; let active = 0; const maxEnc = Math.max(1, Math.min(4, Math.floor((opts.cpus || 4) / 2)));
    const weight = (p) => p.end - p.start, totalW = plan.reduce((a, p) => a + weight(p), 0); let doneW = 0;
    const waitSlot = async () => { while (active >= maxEnc) await Promise.race(encodes.filter((e) => !e.done).map((e) => e.p)); };
    for (const p of plan) {
      const title = lang === 'en' ? p.title_en : p.title, base = pieceBase(p.n, N, title);
      const f0 = Math.max(0, Math.min(totalFrames, Math.round(p.start * H.sr))), f1 = p.end >= (t.duration || 0) - 0.01 ? totalFrames : Math.max(f0, Math.min(totalFrames, Math.round(p.end * H.sr))); // le dernier morceau va jusqu'à la toute dernière trame
      onP(0.02 + 0.9 * doneW / totalW, `Morceau ${p.n}/${N} : ${title}`);
      const piece = { n: p.n, title: p.title, title_en: p.title_en, name: title, base, start: p.start, end: p.end, startFrame: f0, endFrame: f1, frames: f1 - f0, duration: (f1 - f0) / H.sr, deck: p.deck, files: {} };
      const wavPath = path.join(outDir, base + '.wav');
      const w = cutWav(fd, H, f0, f1, wavPath, { fadeIn: p.fadeIn, fadeOut: p.fadeOut, tags: { INAM: title, IART: opts.brand || 'soundtube', IPRD: album, ITRK: `${p.n}/${N}`, ICMT: 'Musique originale générée par soundtube' } });
      piece.waveform = w.peaks;
      if (F.wav || opts.keepWav) piece.files.wav = { name: base + '.wav', size: w.size, crc: w.crc };
      if (F.mp3) {
        await waitSlot(); active++;
        const job = { done: false }; job.p = (async () => {
          try {
            await encodeMp3(wavPath, path.join(outDir, base + '.mp3'), { title, artist: opts.brand || 'soundtube', album, track: `${p.n}/${N}` });
            piece.files.mp3 = { name: base + '.mp3', ...(await fileCrc(path.join(outDir, base + '.mp3'))) };
            if (!F.wav && !opts.keepWav) fs.rmSync(wavPath, { force: true });
          } finally { active--; job.done = true; }
        })(); encodes.push(job);
      } else if (!F.wav && !opts.keepWav) fs.rmSync(wavPath, { force: true });
      if (p.deck != null) {
        const d = (mx ||= planMix(t.params)).decks[p.deck], pl = d ? deckPlan(d) : null;
        if (pl) { piece.params = deckParams(d); piece.meta = pieceMeta(pl.meta, d.startSec - p.start, piece.duration); }
        const m = pl && (F.midi || opts.keepMidi) ? deckMidi(pl, title) : null;
        if (m) {
          const md = path.join(outDir, 'MIDI', base); fs.mkdirSync(md, { recursive: true });
          const files = [{ name: `${base}.mid`, buf: m.full }, ...m.per.map((x, i) => ({ name: `${String(i + 1).padStart(2, '0')}-${x.id}.mid`, buf: x.buf }))];
          piece.files.midi = files.map((x) => { fs.writeFileSync(path.join(md, x.name), x.buf); return { name: `MIDI/${base}/${x.name}`, size: x.buf.length, crc: crc32(x.buf) }; });
        }
      }
      pieces.push(piece); doneW += weight(p);
    }
    onP(0.93, 'Encodage MP3 des derniers morceaux…');
    await Promise.all(encodes.map((e) => e.p));
    // liste des morceaux (texte), utile pour la description ou un lecteur
    const hms = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(x).padStart(2, '0')}`; };
    const list = [`${album}`, `${lang === 'en' ? 'Split mode' : 'Découpage'} : ${lang === 'en' ? { mid: 'cut at the middle of transitions', full: 'full transitions', clean: 'without transitions' }[mode] : SPLIT_MODES[mode].label.toLowerCase()}`, '',
      ...pieces.map((p) => `${p.base}  [${hms(p.start)} – ${hms(p.end)}, ${hms(p.duration)}]`)].join('\n') + '\n';
    const listName = lang === 'en' ? '00 - Tracklist.txt' : '00 - Liste des morceaux.txt'; const lb = Buffer.from(list, 'utf8');
    fs.writeFileSync(path.join(outDir, listName), lb);
    const manifest = { version: 1, mode, lang, formats: F, created: new Date().toISOString(), source: { id: t.id, title: t.title, duration: t.duration, sr: H.sr },
      list: { name: listName, size: lb.length, crc: crc32(lb) }, pieces };
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest));
    onP(1, 'Terminé');
    return manifest;
  } finally {
    if (fd != null) fs.closeSync(fd);
    if (tmp) fs.rmSync(tmp, { force: true });
  }
}
/** Entrées du ZIP pour un manifeste (fichiers présents uniquement). */
export function zipEntries(outDir, M) {
  const e = [{ name: M.list.name, path: path.join(outDir, M.list.name), size: M.list.size, crc: M.list.crc }];
  for (const p of M.pieces) {
    if (M.formats.wav && p.files.wav) e.push({ ...p.files.wav, path: path.join(outDir, p.files.wav.name) });
    if (M.formats.mp3 && p.files.mp3) e.push({ ...p.files.mp3, path: path.join(outDir, p.files.mp3.name) });
    if (M.formats.midi) for (const m of p.files.midi || []) e.push({ ...m, path: path.join(outDir, m.name) });
  }
  return e.filter((x) => fs.existsSync(x.path) && fs.statSync(x.path).size === x.size);
}
