// v1.20.3 — prévisualisations anonymes (styles) : audio seul ≤ 15 s, hors bibliothèque, purge 5 min.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { resolveParams } from './engine/composer.js';
import { STYLES } from './engine/styles.js';
import { makeTitle } from './titles.js';
import { detectFfmpeg } from './jobs.js';
import { config } from './config.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
export const DEMO_MAX_SEC = 15;
export const DEMO_TTL_MS = 5 * 60_000;
export const DEMO_RATE = { max: 3, windowMs: 10 * 60_000 };
export const DEMO_MAX_RUNNING = 1;

function rmQuiet(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }

export class DemoQueue {
  /**
   * @param {{ dir: string, isMainBusy: () => boolean }} opts
   * isMainBusy: true when logged-in jobs occupy the CT (demo yields).
   */
  constructor({ dir, isMainBusy }) {
    this.dir = dir;
    this.isMainBusy = isMainBusy || (() => false);
    this.jobs = new Map(); // id -> job
    this.tokens = new Map(); // token -> { id, exp }
    this.rate = new Map(); // ip -> number[]
    this.queue = [];
    this.running = 0;
    this.hasFfmpeg = detectFfmpeg();
    fs.mkdirSync(dir, { recursive: true });
    this.purge(); // startup
    this._timer = setInterval(() => this.purge(), 60_000);
    if (this._timer.unref) this._timer.unref();
  }

  stop() { clearInterval(this._timer); }

  /** @returns {string|null} error message or null */
  checkRate(ip) {
    const now = Date.now();
    const key = String(ip || '0.0.0.0');
    let arr = (this.rate.get(key) || []).filter((t) => now - t < DEMO_RATE.windowMs);
    if (arr.length >= DEMO_RATE.max) {
      this.rate.set(key, arr);
      return 'rate';
    }
    arr.push(now);
    this.rate.set(key, arr);
    return null;
  }

  enqueue({ style, mood, adv, seed, ip }) {
    if (!STYLES[style]) { const e = new Error('unknownStyle'); e.status = 400; throw e; }
    const rateErr = this.checkRate(ip);
    if (rateErr) { const e = new Error('demoRate'); e.status = 429; throw e; }
    if (this.queue.length + this.running >= 8) { const e = new Error('demoBusy'); e.status = 429; throw e; }

    // Cheap path: force ≤ 15 s audio-only (ignore client duration / video / pack)
    const P0 = resolveParams({
      style, mood: mood || 'auto', seed, duration: 20, wav: true,
      engine: 21, adv: (adv && typeof adv === 'object' && !Array.isArray(adv)) ? adv : {},
    });
    P0.duration = DEMO_MAX_SEC;
    P0.wav = true;

    const id = crypto.randomBytes(6).toString('hex');
    const title = makeTitle(P0.seed, P0.variation, P0.style);
    const job = {
      id, title, style: P0.style, status: 'queued', progress: 0, stage: 'demo',
      error: null, params: P0, demo: true, ip: String(ip || ''),
      created_at: Date.now(), finished_at: null, expire_at: null,
      files: {}, audioToken: null, urls: {},
    };
    this.jobs.set(id, job);
    this.queue.push(id);
    this.pump();
    return this.publicJob(job);
  }

  get(id) { return this.jobs.get(id) || null; }

  publicJob(j) {
    if (!j) return null;
    const urls = {};
    if (j.audioToken) {
      const u = `/api/demo/audio/${j.audioToken}`;
      urls.audio = u;
      if (j.files?.mp3) urls.mp3 = u; else urls.wav = u;
    }
    return {
      id: j.id, title: j.title, style: j.style, status: j.status,
      progress: j.progress, stage: j.stage, error: j.error,
      duration: DEMO_MAX_SEC, demo: true, urls,
      queue_position: j.status === 'queued' ? Math.max(1, this.queue.indexOf(j.id) + 1) : 0,
      expire_at: j.expire_at || null,
    };
  }

  resolveAudio(token) {
    const ent = this.tokens.get(token);
    if (!ent || ent.exp < Date.now()) return null;
    const j = this.jobs.get(ent.id);
    if (!j || j.status !== 'done') return null;
    const kind = j.files.mp3 ? 'mp3' : (j.files.wav ? 'wav' : null);
    if (!kind) return null;
    const file = path.join(this.dir, j.id, j.files[kind]);
    if (!fs.existsSync(file)) return null;
    return { file, mime: kind === 'mp3' ? 'audio/mpeg' : 'audio/wav', job: j };
  }

  pump() {
    while (this.running < DEMO_MAX_RUNNING && this.queue.length) {
      if (this.isMainBusy()) break; // logged-in work has priority
      const id = this.queue.shift();
      this.running++;
      this.run(id).catch((e) => console.error('[demo]', id, e.message)).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  async run(id) {
    const j = this.jobs.get(id); if (!j) return;
    const dir = path.join(this.dir, id);
    fs.mkdirSync(dir, { recursive: true });
    const wavPath = path.join(dir, 'demo.wav');
    const mp3Path = this.hasFfmpeg ? path.join(dir, 'demo.mp3') : null;
    j.status = 'running'; j.progress = 0.02; j.stage = 'demo';
    try {
      const result = await this._worker(j.params, {
        wavPath, mp3Path,
        onProgress: (p, stage) => { j.progress = Math.min(0.97, p); j.stage = stage || 'demo'; },
      });
      const files = {};
      if (mp3Path && fs.existsSync(mp3Path)) files.mp3 = 'demo.mp3';
      else if (fs.existsSync(wavPath)) files.wav = 'demo.wav';
      else throw new Error('demoNoAudio');
      // drop wav if mp3 exists (cheap disk)
      if (files.mp3 && fs.existsSync(wavPath)) rmQuiet(wavPath);
      const token = crypto.randomBytes(16).toString('hex');
      const exp = Date.now() + DEMO_TTL_MS;
      this.tokens.set(token, { id, exp });
      j.files = files; j.audioToken = token; j.expire_at = exp;
      j.status = 'done'; j.progress = 1; j.stage = 'done'; j.finished_at = Date.now();
      j.duration = result?.seconds || DEMO_MAX_SEC;
      void result;
    } catch (e) {
      j.status = 'error'; j.error = String(e.message || e).slice(0, 200); j.finished_at = Date.now();
      rmQuiet(dir);
    }
  }

  _worker(params, { wavPath, mp3Path, onProgress }) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dir, 'worker.js'), {
        workerData: {
          params, wavPath, mp3Path: mp3Path || null, midPath: null, midZipPath: null,
          bitrate: config.mp3Bitrate || '192k', ffmpeg: config.ffmpegPath || 'ffmpeg',
          title: 'demo', zipBase: 'demo', tags: {}, loudness: { target: config.lufs, truePeak: config.truePeak },
        },
      });
      worker.on('message', (m) => {
        if (m.type === 'progress') onProgress?.(m.progress, m.stage);
        else if (m.type === 'done') resolve(m.result);
        else if (m.type === 'error') reject(new Error(m.error || 'demoFail'));
      });
      worker.on('error', reject);
      worker.on('exit', (code) => { if (code) reject(new Error('demoWorkerExit ' + code)); });
    });
  }

  /** Delete finished demos older than TTL and orphan dirs. */
  purge(now = Date.now()) {
    let n = 0;
    for (const [tok, ent] of [...this.tokens.entries()]) {
      if (ent.exp < now) { this.tokens.delete(tok); }
    }
    for (const [id, j] of [...this.jobs.entries()]) {
      const age = now - (j.finished_at || j.created_at || 0);
      const done = j.status === 'done' || j.status === 'error';
      if (done && age >= DEMO_TTL_MS) {
        if (j.audioToken) this.tokens.delete(j.audioToken);
        this.jobs.delete(id);
        rmQuiet(path.join(this.dir, id));
        n++;
      }
    }
    // orphan directories
    try {
      for (const name of fs.readdirSync(this.dir)) {
        if (!this.jobs.has(name)) {
          const p = path.join(this.dir, name);
          try {
            const st = fs.statSync(p);
            if (st.isDirectory() && now - st.mtimeMs >= DEMO_TTL_MS) { rmQuiet(p); n++; }
          } catch {}
        }
      }
    } catch {}
    return n;
  }
}
