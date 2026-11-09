// v1.21.4 — samples externes de l'utilisateur (ex. partage SMB d'un NAS, monté en lecture seule sur l'hôte Proxmox puis
// passé au CT : /mnt/samples). Réglage + scan depuis Admin › Samples externes. Le dossier n'est JAMAIS modifié ni copié :
// soundtube le lit (ffmpeg) et écrit seulement un index dans le dossier de données (external-samples-index.json).
// Le moteur (src/engine/sampler.js) lit cet index via SOUNDTUBE_EXT_SAMPLES_INDEX : kit de batterie « Mes samples ».
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { config } from './config.js';

export const DEFAULT_DIR = process.env.SOUNDTUBE_EXT_SAMPLES_DIR || '/mnt/samples';
export const FORMATS = ['.wav', '.aif', '.aiff', '.flac'];
export const CATEGORIES = ['kick', 'snare', 'clap', 'rim', 'hat', 'ohat', 'ride', 'crash'];
export const LIMITS = { depth: 12, listed: 50000, perCategory: 2000, maxBytes: 50 * 1024 * 1024, maxSeconds: 6, concurrency: 4 };
const SKIP_DIRS = new Set(['@eadir', '#recycle', '#snapshot', '.snapshot', '.trash', '.trashes', '$recycle.bin', 'system volume information', 'node_modules', '.git']);

const settingsFile = () => path.join(config.dataDir, 'external-samples.json');
export const indexFile = () => path.join(config.dataDir, 'external-samples-index.json');

/** Mots-clés → catégorie (nom de fichier d'abord, puis dossier parent, puis grand-parent). L'ordre compte. */
const RULES = [
  ['ohat', /\b(open ?hi ?hats?|open ?hh|open ?hats?|ohh?|openhats?|(hi ?hats?|hh|hats?) ?open)\b/],
  ['rim', /\b(rims?|rimshots?|rim ?shots?|side ?sticks?|sidesticks?|x ?sticks?|cross ?sticks?)\b/],
  ['clap', /\b(claps?|clp|handclaps?|hand ?claps?)\b/],
  ['snare', /\b(snares?|snr|sd|sn)\b/],
  ['kick', /\b(kicks?|kik|kck|bd|bass ?drums?|bassdrums?)\b/],
  ['ride', /\b(rides?)\b/],
  ['crash', /\b(crash(es)?|cymbals?|cym|splash|china)\b/],
  ['hat', /\b(hi ?hats?|hihats?|hh|chh|closed ?hats?|closed ?hh|hats?|ch)\b/],
];
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2').replace(/[^a-z0-9]+/g, ' ').trim();
/** Catégorie d'un chemin relatif (ou null). */
export function classify(rel) {
  if (/\b(loops?|breaks?|fills?|grooves?|bpm)\b/.test(norm(rel))) return null; // one-shots seulement (boucles ignorées)
  const parts = rel.split(/[\\/]/), base = parts.pop().replace(/\.[^.]+$/, '');
  for (const name of [base, parts[parts.length - 1], parts[parts.length - 2]]) {
    if (!name) continue; const n = norm(name);
    for (const [cat, re] of RULES) if (re.test(n)) return cat;
  }
  return null;
}

export function getSettings() {
  let s = {}; try { s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {}; } catch {}
  return { dir: typeof s.dir === 'string' && s.dir ? s.dir : DEFAULT_DIR, enabled: s.enabled !== false };
}
/** Chemin absolu, sans « .. », hors des dossiers de soundtube (lecture seule de toute façon). */
export function checkDir(dir) {
  const d = String(dir || '').trim();
  if (!d || d.length > 400 || !path.isAbsolute(d) || /\0/.test(d)) return { ok: false, error: 'extDirAbsolute' };
  if (d.split(/[\\/]/).includes('..')) return { ok: false, error: 'extDirAbsolute' };
  const r = path.resolve(d);
  for (const own of [config.dataDir, config.root]) { const o = path.resolve(own); if (r === o || r.startsWith(o + path.sep)) return { ok: false, error: 'extDirOwn' }; }
  if (r === '/' || ['/etc', '/proc', '/sys', '/dev', '/root', '/boot', '/run', '/var/lib'].some((x) => r === x || r.startsWith(x + '/'))) return { ok: false, error: 'extDirSystem' };
  return { ok: true, dir: r };
}
export function updateSettings(b = {}) {
  const cur = getSettings(), next = { ...cur };
  if (b.dir !== undefined) { const c = checkDir(b.dir); if (!c.ok) { const e = new Error(c.error); e.status = 400; e.i18n = c.error; throw e; } next.dir = c.dir; }
  if (b.enabled !== undefined) next.enabled = !!b.enabled;
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = settingsFile() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(next, null, 2)); fs.renameSync(tmp, settingsFile());
  // désactivé → l'index reste mais le moteur l'ignore (enabled: false)
  const idx = readIndex(); if (idx) writeIndex({ ...idx, enabled: next.enabled && idx.dir === next.dir });
  return next;
}
export function readIndex() { try { return JSON.parse(fs.readFileSync(indexFile(), 'utf8')); } catch { return null; } }
function writeIndex(o) { const f = indexFile(), tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(o)); fs.renameSync(tmp, f); }

/** État du dossier : existe, lisible, monté en lecture seule (meilleur effort). */
export function dirState(dir) {
  const o = { exists: false, readable: false, isDir: false };
  try { const st = fs.statSync(dir); o.exists = true; o.isDir = st.isDirectory(); } catch (e) { o.error = e.code || e.message; return o; }
  try { fs.accessSync(dir, fs.constants.R_OK | fs.constants.X_OK); o.readable = o.isDir; } catch (e) { o.error = e.code || e.message; }
  try { fs.accessSync(dir, fs.constants.W_OK); o.writable = true; } catch { o.writable = false; }
  return o;
}

function walk(root, onFile, stats) {
  const stack = [['', 0]];
  while (stack.length) {
    const [rel, depth] = stack.pop();
    let list; try { list = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { stats.unreadableDirs++; continue; }
    list.sort((a, b) => (a.name < b.name ? 1 : -1)); // pile → ordre alphabétique
    for (const d of list) {
      if (d.name.startsWith('.') || d.name.startsWith('._')) continue;
      const r = rel ? rel + '/' + d.name : d.name;
      if (d.isDirectory()) { if (!SKIP_DIRS.has(d.name.toLowerCase()) && depth < LIMITS.depth) stack.push([r, depth + 1]); continue; } // liens symboliques de dossiers non suivis (pas de boucle)
      if (!d.isFile() && !d.isSymbolicLink()) continue;
      if (!FORMATS.includes(path.extname(d.name).toLowerCase())) { stats.otherFiles++; continue; }
      if (++stats.audio > LIMITS.listed) { stats.truncated = true; return; }
      onFile(r);
    }
  }
}

/** Décode (mono, 44,1 kHz, ≤ maxSeconds + 0,5 s) → { peak, rms d'attaque, seconds } ou { error }. */
function analyse(file, ffmpeg) {
  return new Promise((resolve) => {
    const p = spawn(ffmpeg, ['-v', 'error', '-nostdin', '-t', String(LIMITS.maxSeconds + 0.5), '-i', file, '-f', 's16le', '-ac', '1', '-ar', '44100', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; let n = 0, err = '';
    p.stdout.on('data', (d) => { chunks.push(d); n += d.length; });
    p.stderr.on('data', (d) => { err += d; });
    const to = setTimeout(() => p.kill('SIGKILL'), 20000);
    p.on('error', (e) => { clearTimeout(to); resolve({ error: e.message }); });
    p.on('close', (code) => {
      clearTimeout(to);
      if (code !== 0 || n < 64) return resolve({ error: (err.trim().split('\n')[0] || 'illisible').slice(0, 160) });
      const b = Buffer.concat(chunks, n), s = new Int16Array(b.buffer, b.byteOffset, Math.floor(n / 2));
      let peak = 0; for (let i = 0; i < s.length; i++) { const a = Math.abs(s[i]); if (a > peak) peak = a; }
      if (peak < 33) return resolve({ error: 'silence' });
      let on = 0; while (on < s.length && Math.abs(s[on]) < peak * 0.1) on++;
      const end = Math.min(s.length, on + Math.round(0.05 * 44100)); let sq = 0; for (let i = on; i < end; i++) sq += s[i] * s[i];
      resolve({ peak: +(peak / 32767).toFixed(4), rms: +(Math.sqrt(sq / Math.max(1, end - on)) / 32767).toFixed(5), seconds: +(s.length / 44100).toFixed(3) });
    });
  });
}

let running = null, progress = null;
export function scanStatus() { return running ? { running: true, ...progress } : { running: false }; }

/** Scan complet (asynchrone). Résolu avec le résumé ; un seul scan à la fois. */
export function scan({ ffmpeg = config.ffmpegPath } = {}) {
  if (running) return running;
  running = (async () => {
    const t0 = Date.now(), S = getSettings(), dir = S.dir, st = dirState(dir);
    progress = { dir, phase: 'list', done: 0, total: 0 };
    const stats = { audio: 0, otherFiles: 0, unreadableDirs: 0, truncated: false };
    const byCat = Object.fromEntries(CATEGORIES.map((c) => [c, []])); let unclassified = 0;
    if (st.readable) walk(dir, (rel) => { const c = classify(rel); if (!c) { unclassified++; return; } if (byCat[c].length < LIMITS.perCategory) byCat[c].push(rel); }, stats);
    const todo = CATEGORIES.flatMap((c) => byCat[c].map((rel) => [c, rel]));
    progress = { dir, phase: 'analyse', done: 0, total: todo.length };
    const skipped = { tooLong: 0, tooBig: 0, unreadable: 0, silent: 0, unclassified }, zones = Object.fromEntries(CATEGORIES.map((c) => [c, []])), errors = [];
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const [c, rel] = todo[i++], abs = path.join(dir, rel);
        let size = 0; try { size = fs.statSync(abs).size; } catch { skipped.unreadable++; progress.done++; continue; }
        if (size > LIMITS.maxBytes) { skipped.tooBig++; progress.done++; continue; }
        const a = await analyse(abs, ffmpeg); progress.done++;
        if (a.error) { if (a.error === 'silence') skipped.silent++; else { skipped.unreadable++; if (errors.length < 5) errors.push(`${rel} : ${a.error}`); } continue; }
        if (a.seconds >= LIMITS.maxSeconds) { skipped.tooLong++; continue; }
        zones[c].push({ file: abs, rel, layer: 0, rr: 0, peak: a.peak, rms: a.rms, seconds: a.seconds });
      }
    };
    await Promise.all(Array.from({ length: LIMITS.concurrency }, worker));
    for (const c of CATEGORIES) { zones[c].sort((a, b) => (a.rel < b.rel ? -1 : 1)); zones[c].forEach((z, k) => (z.rr = k)); }
    // pas de caisse claire mais des claps : la caisse claire du kit = les claps (signalé)
    const aliases = {}; if (!zones.snare.length && zones.clap.length) { aliases.snare = 'clap'; }
    const instruments = {};
    for (const c of CATEGORIES) { const zs = zones[c].length ? zones[c] : aliases[c] ? zones[aliases[c]] : []; if (zs.length) instruments['ext_' + c] = { title: 'external ' + c, tonal: false, zones: zs.map(({ rel, ...z }) => z) }; }
    const counts = Object.fromEntries(CATEGORIES.map((c) => [c, zones[c].length]));
    const hash = crypto.createHash('sha256').update(JSON.stringify(CATEGORIES.map((c) => zones[c].map((z) => `${z.rel}\t${z.peak}\t${z.seconds}`)))).digest('hex').slice(0, 12);
    const usable = !!(instruments.ext_kick && instruments.ext_snare);
    const out = { version: 1, enabled: S.enabled, dir, scannedAt: new Date().toISOString(), ms: Date.now() - t0, hash, counts, aliases, usable,
      found: stats.audio, used: Object.values(counts).reduce((a, b) => a + b, 0), skipped, errors, truncated: stats.truncated, unreadableDirs: stats.unreadableDirs,
      state: st, instruments };
    fs.mkdirSync(config.dataDir, { recursive: true }); writeIndex(out);
    return summary(out);
  })().finally(() => { running = null; progress = null; });
  return running;
}

/** Vue Admin / API (sans la liste des fichiers). */
export function summary(idx = readIndex()) {
  if (!idx) return null;
  const { instruments, ...rest } = idx;
  const examples = {}; for (const [k, v] of Object.entries(instruments || {})) examples[k.slice(4)] = v.zones.slice(0, 3).map((z) => path.relative(idx.dir, z.file));
  return { ...rest, examples };
}
export function view() {
  const S = getSettings(), idx = readIndex();
  const sum = summary(idx);
  return { settings: S, defaultDir: DEFAULT_DIR, formats: FORMATS, categories: CATEGORIES, limits: LIMITS, state: dirState(S.dir), index: sum && sum.dir === S.dir ? sum : null, staleIndex: !!(sum && sum.dir !== S.dir), scan: scanStatus(),
    active: !!(S.enabled && sum && sum.dir === S.dir && sum.usable) };
}
/** Le morceau utilise-t-il les samples externes ? (rendu forcé sur le CT : les agents n'ont pas ces fichiers) */
export function usesExternal(P) { return P?.adv?.drumKit === 'user'; }
/** Prépare l'environnement (workers) : chemin de l'index. */
export function initExternalSamples() {
  process.env.SOUNDTUBE_EXT_SAMPLES_INDEX = indexFile();
  const S = getSettings(); const idx = readIndex();
  // premier démarrage avec un dossier présent et pas encore indexé : scan en arrière-plan
  if (S.enabled && (!idx || idx.dir !== S.dir) && dirState(S.dir).readable) scan().then((r) => console.log(`[samples externes] ${r.used} fichier(s) indexé(s) dans ${r.dir}`)).catch((e) => console.error('[samples externes]', e.message));
}
