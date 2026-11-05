// v1.16.0 : rendu musical sur un agent du réseau local (PC Windows) — synchronisation des échantillons, job /audio,
// suivi, récupération WAV + MIDI + ZIP MIDI (contrôle SHA-256), puis MP3 encodé SUR LE CT à partir du WAV reçu
// (mêmes arguments ffmpeg que le flux du moteur : MP3 identique au bit près à un rendu fait sur le CT).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { request } from './nodes.js';
import { readWavHeader } from './split.js';
import { id3Args } from './engine/tags.js';
import { SR } from './engine/dsp.js';
import { sampleIndex } from './samplepack.js';
import { AUDIO_PROTOCOL } from '../node-agent/engine-id.mjs';

const sha256 = (f) => new Promise((ok, ko) => { const h = crypto.createHash('sha256'); fs.createReadStream(f).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', ko); });

/** MP3 à partir du PCM d'un WAV : mêmes arguments et mêmes octets d'entrée que Mp3Sink (moteur) → même MP3. */
export function encodeMp3FromWav(wavPath, mp3Path, { bitrate = '320k', tags = {}, ffmpeg = 'ffmpeg' } = {}) {
  return new Promise((resolve, reject) => {
    const fd = fs.openSync(wavPath, 'r'); let H;
    try { H = readWavHeader(fd, fs.fstatSync(fd).size); } catch (e) { fs.closeSync(fd); return reject(e); }
    const p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 's16le', '-ar', String(SR), '-ac', '2', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', bitrate, ...id3Args(tags), mp3Path], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err += d; }); p.stdin.on('error', () => {});
    p.on('error', (e) => { fs.closeSync(fd); reject(e); });
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error('ffmpeg MP3 : ' + (err.trim() || c)))));
    const rs = fs.createReadStream(null, { fd, start: H.dataOffset, end: H.dataOffset + H.dataBytes - 1, highWaterMark: 1 << 20 });
    rs.pipe(p.stdin); rs.on('error', (e) => p.kill() && reject(e));
  });
}

const syncing = new Map();
/** Pack d'échantillons du CT → agent (seuls les fichiers absents ou différents partent). */
export async function ensureSamples(nodes, n, { onStage } = {}) {
  const idx = sampleIndex(nodes.dataDir); const h = nodes.st(n.id).health?.audio;
  if (!idx) throw new Error('pack d\'échantillons absent sur le CT');
  if (h?.samples?.hash === idx.hash) return idx.hash;
  if (syncing.has(n.id)) return syncing.get(n.id);
  const tk = nodes.tokenOf(n), call = (m, p, o = {}) => request(n.url, m, p, { token: tk, ...o });
  const job = (async () => {
    const r = await call('POST', '/samples/plan', { json: { hash: idx.hash, files: idx.files }, timeout: 120000 });
    if (r.status !== 200) throw new Error(r.data?.error || `synchronisation refusée (HTTP ${r.status})`);
    const need = r.data.need || []; let i = 0;
    for (const rel of need) {
      onStage?.(`Envoi des échantillons au PC (${++i}/${need.length})`);
      const u = await call('PUT', '/samples/files/' + encodeURIComponent(rel), { file: path.join(idx.dir, rel), timeout: 120000 });
      if (u.status !== 200) throw new Error(u.data?.error || `envoi de ${rel} refusé`);
    }
    const c = await call('POST', '/samples/commit', { timeout: 30000 });
    if (c.status !== 200) throw new Error(c.data?.error || 'validation des échantillons refusée');
    const st = nodes.st(n.id); if (st.health?.audio) st.health.audio.samples = { hash: c.data.hash, files: c.data.files };
    return idx.hash;
  })().finally(() => syncing.delete(n.id));
  syncing.set(n.id, job); return job;
}

/** Morceau de référence (20 s, cinématique : piano, cordes, harpe échantillonnés + synthèse) pour l'empreinte de rendu. */
export const REF_PARAMS = { style: 'cinematic', seed: 1160, duration: 20, engine: 21, wav: true };
/** Rendu local (worker du CT) vers des chemins donnés ; résultat du worker. */
export function localRender(params, paths, extra = {}) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./worker.js', import.meta.url), { workerData: { params, ...paths, ...extra }, resourceLimits: { maxOldGenerationSizeMb: 768 } });
    w.on('message', (m) => { if (m.type === 'done') resolve(m.result); else if (m.type === 'error') reject(new Error(m.error)); else extra.onProgress?.(m); });
    w.on('error', reject); w.on('exit', (c) => { if (c !== 0) reject(new Error('worker exit ' + c)); });
  });
}
const refCache = new Map();
async function refHash(engineHash) {
  if (!refCache.has(engineHash)) refCache.set(engineHash, (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-ref-')), wav = path.join(dir, 'ref.wav');
    try { await localRender(REF_PARAMS, { wavPath: wav, mp3Path: null, midPath: null, midZipPath: null }, { title: 'ref', tags: {} }); return await sha256(wav); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  })().catch((e) => { refCache.delete(engineHash); throw e; }));
  return refCache.get(engineHash);
}
/**
 * Empreinte de rendu : le nœud rend le morceau de référence, son WAV doit être identique au bit près à celui du CT.
 * Faite une fois par combinaison (moteur, échantillons, version de Node du PC). En cas d'écart : musique refusée sur ce nœud.
 */
export async function ensureVerified(nodes, n, samples) {
  const st = nodes.st(n.id), a = st.health?.audio || {}, key = `${nodes.engine.hash}|${samples}|${a.node || '?'}`;
  if (st.verify?.key === key) { if (st.verify.ok) return st.verify; throw Object.assign(new Error(st.verify.error), { code: 'engine-mismatch', refused: true }); }
  const tk = nodes.tokenOf(n), call = (m, p, o = {}) => request(n.url, m, p, { token: tk, ...o });
  const [mine, theirs] = await Promise.all([refHash(nodes.engine.hash), (async () => {
    const c = await call('POST', '/audio', { json: { protocol: AUDIO_PROTOCOL, engine: nodes.engine.hash, engineVersion: nodes.engine.version, samples, params: REF_PARAMS, opts: { title: 'ref', tags: {} } }, timeout: 15000 });
    if (c.status !== 201) throw Object.assign(new Error(c.data?.error || `référence refusée (HTTP ${c.status})`), { code: /moteur différent/i.test(c.data?.error || '') ? 'engine-mismatch' : null, refused: true });
    try {
      for (let i = 0; i < 600; i++) {
        await new Promise((r) => setTimeout(r, nodes.pollMs));
        const r = await call('GET', `/audio/${c.data.id}`, { timeout: 5000 });
        if (r.data?.status === 'done') return r.data.files.wav.sha256;
        if (r.data?.status === 'error' || r.status !== 200) throw new Error('référence : ' + String(r.data?.error || r.status).split('\n')[0]);
      }
      throw new Error('référence : délai dépassé');
    } finally { call('DELETE', `/audio/${c.data.id}`, { timeout: 5000 }).catch(() => {}); }
  })()]);
  const ok = mine === theirs;
  st.verify = { key, ok, at: new Date().toISOString(), ct: mine.slice(0, 16), node: theirs.slice(0, 16), error: ok ? null : `empreinte de rendu différente (Node ${a.node || '?'} sur le PC, ${process.version} sur le CT) : la musique ne serait pas identique au bit près` };
  if (!ok) throw Object.assign(new Error(st.verify.error), { code: 'engine-mismatch', refused: true });
  return st.verify;
}

/**
 * Rend un morceau sur le nœud n. job = { params, opts: { title, zipBase, tags, loudness }, out: { wav, mid, midzip } (chemins CT),
 *   onProgress(p, stage, eta), onAudioReady({ jobId, result, files, node }) → Promise (enchaînement vidéo, attendu avant le ménage) }.
 * Retourne le résultat (même forme que le worker du CT). Erreur avec code 'engine-mismatch' si le moteur diffère.
 */
export async function remoteAudio(nodes, n, job) {
  const tk = nodes.tokenOf(n), call = (m, p, o = {}) => request(n.url, m, p, { token: tk, ...o });
  const eng = nodes.engine, onP = job.onProgress || (() => {});
  onP(0.01, 'Préparation du PC de rendu', null);
  const samples = await ensureSamples(nodes, n, { onStage: (s) => onP(0.01, s, null) });
  if (nodes.verifyAudio !== false) { onP(0.01, 'Contrôle d\'empreinte du moteur sur le PC', null); await ensureVerified(nodes, n, samples); }
  const c = await call('POST', '/audio', { json: { protocol: AUDIO_PROTOCOL, engine: eng.hash, engineVersion: eng.version, samples, params: job.params, opts: job.opts }, timeout: 15000 });
  if (c.status !== 201) throw Object.assign(new Error(c.data?.error || `rendu musical refusé (HTTP ${c.status})`), { code: /moteur différent/i.test(c.data?.error || '') ? 'engine-mismatch' : null, refused: true });
  const id = c.data.id; let chained = null;
  try {
    let fails = 0, last = -1, lastAt = Date.now(), j;
    for (;;) {
      await new Promise((r) => setTimeout(r, nodes.pollMs));
      let r; try { r = await call('GET', `/audio/${id}`, { timeout: 5000 }); } catch (e) { if (++fails >= 3) throw new Error('nœud injoignable pendant le rendu musical : ' + e.message); continue; }
      if (r.status !== 200) throw new Error(r.data?.error || `suivi impossible (HTTP ${r.status})`);
      fails = 0; j = r.data;
      if (j.status === 'error' || j.status === 'cancelled') throw new Error('erreur du moteur sur le nœud : ' + String(j.error || j.status).split('\n')[0]);
      if (j.progress !== last) { last = j.progress; lastAt = Date.now(); onP(Math.min(0.97, j.progress * 0.97), j.stage || 'Rendu sur le PC', j.eta); }
      else if (j.status === 'running' && Date.now() - lastAt > nodes.stallMs) throw new Error('rendu musical bloqué sur le nœud');
      if (j.status === 'done') break;
    }
    // musique prête sur le PC : la vidéo peut partir tout de suite sur le même nœud (option combinée)
    if (job.onAudioReady) chained = Promise.resolve().then(() => job.onAudioReady({ jobId: id, result: j.result, files: j.files, node: n })).catch((e) => ({ error: e }));
    onP(0.975, 'Récupération des fichiers', null);
    for (const [k, dst] of Object.entries(job.out)) {
      if (!dst || !j.files[k]) continue;
      const part = dst + '.part';
      const d = await call('GET', `/audio/${id}/files/${k}`, { out: part, timeout: 120000 });
      if (d.status !== 200) throw new Error(`récupération ${k} impossible`);
      if (fs.statSync(part).size !== j.files[k].size || (await sha256(part)) !== j.files[k].sha256) { fs.rmSync(part, { force: true }); throw new Error(`fichier ${k} corrompu pendant le transfert`); }
      fs.renameSync(part, dst);
    }
    if (chained) await chained; // le job vidéo a lié le WAV : on peut libérer le job musical
    return { ...j.result, files: j.files, remoteId: id };
  } finally {
    if (chained) await chained;
    for (const dst of Object.values(job.out)) if (dst) fs.rmSync(dst + '.part', { force: true });
    call('DELETE', `/audio/${id}`, { timeout: 5000 }).catch(() => {});
  }
}
