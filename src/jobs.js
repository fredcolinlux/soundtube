// File d'attente de génération (worker_threads). Le rendu écrit directement WAV / MP3 (ffmpeg en flux) / MIDI.
// v1.16.0 : routage vers les PC de rendu (agents) — une génération de 15 min ou plus (seuil réglable dans Admin) ou avec
// l'option « musique + vidéo sur le PC Windows » part en priorité sur un nœud capable de rendre la musique ; les plus
// courtes restent sur le CT sauf s'il est saturé. Panne du nœud : rendu repris sur le CT (dit dans le statut).
import { Worker } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { fileNames, slugify, stamp, syncFiles, KINDS } from './naming.js';
import { trackTags, retagTrack } from './tracktags.js';
import { remoteAudio, encodeMp3FromWav } from './nodeaudio.js';

export function detectFfmpeg() {
  if (config.mp3 === 'off') return false;
  try { return spawnSync(config.ffmpegPath, ['-version'], { stdio: 'ignore' }).status === 0; } catch { return false; }
}

/** Octets libres sur le volume du dossier (null si inconnu). */
export function freeBytes(dir) {
  try { const s = fs.statfsSync(dir); return s.bavail * s.bsize; } catch { return null; }
}
/** Estimation de la place disque nécessaire (WAV 16 bits stéréo 44,1 kHz + MP3). */
export function estimateBytes(P, hasMp3) {
  const sec = P.duration + 4;
  // sans WAV conservé, la passe de mastering utilise un WAV temporaire de même taille
  return sec * 176400 + (hasMp3 ? sec * (parseInt(config.mp3Bitrate, 10) || 192) * 125 : 0) + 2e6;
}

export class JobQueue {
  constructor(store, tracksDir, nodes = null) {
    this.store = store; this.tracksDir = tracksDir; this.nodes = nodes; this.queue = []; this.localRunning = 0; this.remoteRunning = 0; this.forceLocal = new Map();
    this.hasFfmpeg = detectFfmpeg();
    fs.mkdirSync(tracksDir, { recursive: true });
  }
  get pending() { return this.queue.length; }
  get running() { return this.localRunning + this.remoteRunning; }
  enqueue(id) {
    const t = this.store.get(id);
    const owner = t?.meta?.ownerId || 'anon';
    this._ownerOf = this._ownerOf || new Map();
    this._ownerOf.set(id, owner);
    // Équité : éviter qu'un même user monopolise la file
    const counts = new Map();
    for (const jid of this.queue) { const o = this._ownerOf.get(jid) || 'anon'; counts.set(o, (counts.get(o) || 0) + 1); }
    const my = counts.get(owner) || 0;
    let idx = this.queue.length;
    if (my > 0) {
      // placer après le premier job d'un autre propriétaire quand on est déjà sur-représenté
      let seenMine = 0;
      for (let i = 0; i < this.queue.length; i++) {
        const o = this._ownerOf.get(this.queue[i]) || 'anon';
        if (o === owner) seenMine++;
        else if (seenMine >= my) { idx = i + 1; break; }
      }
    }
    this.queue.splice(idx, 0, id);
    this.pump();
  }
  /** Où rendre ce morceau maintenant : { node } | { local: true } | null (attendre). */
  route(t) {
    const N = this.nodes, P = t?.params || {}, localFree = this.localRunning < config.maxConcurrentJobs;
    if (!N || this.forceLocal.has(t.id)) return localFree ? { local: true, reason: this.forceLocal.get(t.id) ? 'fallback' : 'ct' } : null;
    // v1.21.4 : kit « Mes samples » (dossier externe du CT) → toujours rendu sur le CT ; les agents n'ont pas ces fichiers
    if (P.adv?.drumKit === 'user') return localFree ? { local: true, reason: 'samples-externes' } : null;
    const combo = !!t.meta?.pcCombo, long = (+P.duration || 0) >= N.s.audioMinSec;
    if (combo || long) { const n = N.audioNode(); if (n) return { node: n, reason: combo ? 'combo' : 'long' }; }
    if (localFree) return { local: true, reason: combo ? 'combo-sans-pc' : long ? 'long-sans-pc' : 'court' };
    const n = N.audioNode({ free: true }); if (n) return { node: n, reason: 'sature' };
    return null;
  }
  pump() {
    for (let i = 0; i < this.queue.length; i++) {
      const id = this.queue[i], t = this.store.get(id);
      if (!t) { this.queue.splice(i--, 1); continue; }
      const r = this.route(t); if (!r) continue;
      this.queue.splice(i--, 1);
      if (r.local) this.localRunning++; else { this.remoteRunning++; const st = this.nodes.st(r.node.id); st.audioRunning = (st.audioRunning || 0) + 1; }
      this.run(id, r).catch((e) => console.error('[job]', id, e)).finally(() => {
        if (r.local) this.localRunning--; else { this.remoteRunning--; this.nodes.st(r.node.id).audioRunning--; }
        this.pump();
      });
    }
  }
  async run(id, route = { local: true, reason: 'ct' }) {
    const t = this.store.get(id); if (!t) return;
    const dir = path.join(this.tracksDir, id); fs.mkdirSync(dir, { recursive: true });
    const P = t.params;
    const wantWav = P.wav !== false || !this.hasFfmpeg;
    const N = fileNames(t);
    const paths = {
      wavPath: wantWav ? path.join(dir, N.wav) : null,
      mp3Path: this.hasFfmpeg ? path.join(dir, N.mp3) : null,
      midPath: path.join(dir, N.mid), midZipPath: path.join(dir, N.midzip),
    };
    const nodeName = route.node ? this.nodes.nameOf(route.node) : 'CT (local)';
    const fallback = this.forceLocal.get(id) || null; this.forceLocal.delete(id);
    const where = { where: route.node ? 'node' : 'ct', node: nodeName, nodeId: route.node?.id || null, reason: route.reason, combo: !!t.meta?.pcCombo, fallback };
    const prefix = route.node ? `PC « ${nodeName} » — ` : fallback ? 'Repris sur le CT (PC en panne) — ' : '';
    this.store.update(id, { status: 'running', progress: 0.01, stage: fallback ? `Nœud en panne : rendu repris sur le CT (${fallback.slice(0, 120)})` : prefix + 'Démarrage', eta: null, meta: { ...(t.meta || {}), render: where } });
    const tags = trackTags(t, P), loudness = { target: config.lufs, truePeak: config.truePeak }, zipBase = `${slugify(t.style, 20)}_${stamp(t.created_at)}`;
    const t0 = Date.now();
    try {
      const need = estimateBytes(P, this.hasFfmpeg), free = freeBytes(this.tracksDir);
      if (free != null && free < need * 1.1) throw new Error(`Espace disque insuffisant : ${(need / 1e9).toFixed(2)} Go nécessaires, ${(free / 1e9).toFixed(2)} Go libres.`);
      let result;
      if (route.node) {
        const wavOut = paths.wavPath || path.join(dir, '.node.wav');
        try {
          result = await remoteAudio(this.nodes, route.node, {
            params: P, opts: { title: t.title, zipBase, tags, loudness }, out: { wav: wavOut, mid: paths.midPath, midzip: paths.midZipPath },
            onProgress: (p, stage, eta) => this.store.update(id, { progress: Math.min(0.97, p), stage: prefix + stage, eta: eta != null ? Math.round(eta) : null }),
            onAudioReady: this.onAudioReady ? (info) => this.onAudioReady(this.store.get(id), { ...info, wavPath: wavOut }) : null,
          });
        } catch (e) {
          const st = this.nodes.st(route.node.id);
          if (!e.refused) this.nodes.markFailed(route.node, e);
          this.nodes.record({ kind: 'audio', node: route.node.id, nodeName, title: t.title, trackId: id, status: 'error', note: String(e.message).slice(0, 160) });
          void st;
          // repli : rendu sur le CT (en tête de file), annoncé dans le statut
          for (const f of [paths.wavPath, paths.midPath, paths.midZipPath, path.join(dir, '.node.wav')]) if (f) fs.rmSync(f, { force: true });
          this.forceLocal.set(id, `${nodeName} : ${String(e.message).split('\n')[0]}`);
          this.store.update(id, { status: 'queued', progress: 0, stage: `Nœud en panne : rendu repris sur le CT (${String(e.message).split('\n')[0].slice(0, 120)})`, eta: null });
          this.queue.unshift(id); return;
        }
        if (paths.mp3Path) { this.store.update(id, { progress: 0.985, stage: prefix + 'Encodage MP3 sur le CT' }); await encodeMp3FromWav(wavOut, paths.mp3Path, { bitrate: config.mp3Bitrate, tags, ffmpeg: config.ffmpegPath }); }
        if (!paths.wavPath) fs.rmSync(wavOut, { force: true });
        const st = this.nodes.st(route.node.id); st.audioJobs = (st.audioJobs || 0) + 1; st.lastJob = Date.now();
      } else {
        result = await new Promise((resolve, reject) => {
          const w = new Worker(new URL('./worker.js', import.meta.url), {
            workerData: { params: P, ...paths, bitrate: config.mp3Bitrate, ffmpeg: config.ffmpegPath, title: t.title, tags, loudness, zipBase },
            resourceLimits: { maxOldGenerationSizeMb: 768 },
          });
          w.on('message', (m) => {
            if (m.type === 'progress') this.store.update(id, { progress: Math.min(0.99, m.progress), stage: prefix + m.stage, eta: m.eta != null ? Math.round(m.eta) : null });
            else if (m.type === 'done') resolve(m.result);
            else if (m.type === 'error') reject(new Error(m.error));
          });
          w.on('error', reject);
          w.on('exit', (c) => { if (c !== 0) reject(new Error('worker exit ' + c)); });
        });
        // option combinée sans PC disponible : la vidéo suit le chemin habituel (file vidéo) après la fin du rendu
      }
      this.nodes?.record({ kind: 'audio', node: route.node?.id || null, nodeName, title: t.title, trackId: id, status: fallback ? 'fallback' : 'done', ms: Date.now() - t0, note: fallback ? 'repris sur le CT : ' + fallback.slice(0, 120) : route.reason === 'sature' ? 'CT saturé : envoyé au PC' : null });
      let files = {};
      for (const k of KINDS) if (fs.existsSync(path.join(dir, N[k]))) files[k] = N[k];
      // le titre a pu changer pendant le rendu : on aligne les noms
      const now = this.store.get(id); if (now) files = syncFiles(this.tracksDir, { ...now, files }) || files;
      if (now && now.title !== t.title) await retagTrack(this.tracksDir, { ...now, files });
      const R = result.params, keep = {};
      if (now?.meta?.titleEn) Object.assign(keep, { titleEn: now.meta.titleEn, titleEnManual: !!now.meta.titleEnManual });
      for (const k of ['autoSplit', 'animation', 'autoPack', 'ai', 'pcCombo', 'ownerId', 'extSamples']) if (now?.meta?.[k]) keep[k] = now.meta[k]; // v1.21.2 : ownerId conservé ; v1.21.4 : index des samples externes
      if (now?.meta?.regenOf) Object.assign(keep, { regenOf: now.meta.regenOf, regenVersion: now.meta.regenVersion });
      this.store.update(id, {
        status: 'done', progress: 1, stage: 'Terminé', eta: 0, params: R, meta: { ...result.meta, ...keep, render: { ...where, ms: Date.now() - t0 } }, waveform: result.waveform, files,
        bpm: R.bpm, key: R.key, scale: R.scale, mood: R.mood, seed: R.seed, variation: R.variation,
        duration: result.seconds, render_ms: result.renderMs, finished_at: new Date().toISOString(),
      });
      if (this.onDone) await this.onDone(this.store.get(id));
    } catch (e) {
      console.error('[job error]', id, e.message);
      this.store.update(id, { status: 'error', error: String(e.message).slice(0, 2000), stage: 'Erreur', finished_at: new Date().toISOString() });
    }
  }
}
