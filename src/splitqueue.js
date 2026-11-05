// File de découpe (une à la fois : lecture disque + encodages MP3 parallèles) et ajout des morceaux à la bibliothèque.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { splitTrack, splitPlan, splitAvailability, SPLIT_MODES } from './split.js';
import { fileNames } from './naming.js';
import { makeZip } from './engine/midi.js';
import { resolveParams } from './engine/composer.js';
import { freeBytes } from './jobs.js';
import { resolutionOf } from './youtube.js';
import { titleEnOf } from './titles.js';

export const splitDir = (tracksDir, id) => path.join(tracksDir, id, 'split');
export function readManifest(tracksDir, id) {
  try { return JSON.parse(fs.readFileSync(path.join(splitDir(tracksDir, id), 'manifest.json'), 'utf8')); } catch { return null; }
}
/** Options de découpe validées (mode, langue des noms, formats, ajout à la bibliothèque). */
export function splitOptions(b = {}, { hasFfmpeg = true, lang = 'fr' } = {}) {
  const mode = b.mode || 'mid';
  if (!SPLIT_MODES[mode]) { const e = new Error('mode : mid, full ou clean'); e.status = 400; throw e; }
  const f = b.formats || {}, formats = { wav: f.wav !== false, mp3: hasFfmpeg && f.mp3 !== false, midi: f.midi !== false };
  if (!formats.wav && !formats.mp3 && !formats.midi) { const e = new Error('Choisis au moins un format (wav, mp3, midi).'); e.status = 400; throw e; }
  // une vidéo YouTube par morceau (résolution) : les morceaux passent par la bibliothèque (miniature, textes FR/EN, file vidéo)
  let video = null;
  if (b.video) { video = b.video === true ? '1080p' : resolutionOf(typeof b.video === 'object' ? b.video.resolution : b.video); if (!video) { const e = new Error('video : 720p, 1080p ou 4k'); e.status = 400; throw e; } if (!hasFfmpeg) { const e = new Error('ffmpeg absent : pas de vidéo'); e.status = 501; throw e; } }
  return { mode, lang: b.lang === 'en' || b.lang === 'fr' ? b.lang : lang, formats, library: !!b.library || !!video, video };
}
const link = (a, b) => { try { fs.linkSync(a, b); } catch { fs.copyFileSync(a, b); } }; // lien physique : pas de place disque en double

export class SplitQueue {
  constructor({ store, tracksDir, hasFfmpeg, brand = () => 'soundtube', onAdded = () => {}, onDone = () => {} }) {
    Object.assign(this, { store, tracksDir, hasFfmpeg, brand, onAdded, onDone }); this.state = new Map(); this.queue = []; this.busy = false;
  }
  status(id) { return this.state.get(id) || null; }
  enqueue(id, opts) {
    const t = this.store.get(id), av = splitAvailability(t); if (!av.ok) { const e = new Error(av.reason); e.status = 409; throw e; }
    const cur = this.state.get(id); if (cur && (cur.status === 'queued' || cur.status === 'running')) { const e = new Error('Découpage déjà en cours.'); e.status = 409; throw e; }
    const plan = splitPlan(t, opts.mode);
    // place disque : WAV découpés (+ MP3) ; la source est lue en place
    const sec = plan.reduce((a, p) => a + p.end - p.start, 0), need = sec * 176400 * (opts.formats.wav || opts.library || opts.formats.mp3 ? 1 : 0) + (opts.formats.mp3 ? sec * 40000 : 0) + 5e6;
    const free = freeBytes(this.tracksDir); if (free != null && free < need * 1.05) { const e = new Error(`Espace disque insuffisant : ${(need / 1e9).toFixed(2)} Go nécessaires, ${(free / 1e9).toFixed(2)} Go libres.`); e.status = 507; throw e; }
    this.state.set(id, { status: 'queued', progress: 0, stage: 'En attente', ...opts, pieces: plan.length, started: null });
    this.queue.push(id); this.pump(); return this.state.get(id);
  }
  async pump() {
    if (this.busy) return; const id = this.queue.shift(); if (!id) return; this.busy = true;
    const st = this.state.get(id); const t0 = Date.now(); Object.assign(st, { status: 'running', stage: 'Démarrage', started: new Date().toISOString() });
    try {
      const t = this.store.get(id); if (!t) throw new Error('Morceau supprimé');
      const out = splitDir(this.tracksDir, id);
      const M = await splitTrack(t, path.join(this.tracksDir, id), out, {
        mode: st.mode, lang: st.lang, formats: st.formats, hasFfmpeg: this.hasFfmpeg, brand: this.brand(), cpus: os.cpus().length,
        keepWav: st.library && !st.formats.wav, keepMidi: st.library,
        onProgress: (f, stage) => { st.progress = f * (st.library ? 0.95 : 1); st.stage = stage; if (f > 0.03) st.eta = Math.round((Date.now() - t0) / 1000 * (1 - f) / f); },
      });
      if (st.library) { st.stage = 'Ajout à la bibliothèque…'; M.library = await this.addToLibrary(t, M, out); }
      // WAV gardés seulement pour la bibliothèque : retirés du dossier de découpe (les morceaux ajoutés ont leur lien)
      if (!st.formats.wav) for (const p of M.pieces) { if (p.files.wav) { fs.rmSync(path.join(out, p.files.wav.name), { force: true }); delete p.files.wav; } }
      if (!st.formats.midi) { fs.rmSync(path.join(out, 'MIDI'), { recursive: true, force: true }); for (const p of M.pieces) delete p.files.midi; }
      M.ms = Date.now() - t0; fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(M));
      Object.assign(st, { status: 'done', progress: 1, stage: 'Terminé', eta: 0, ms: M.ms });
      try { await this.onDone(this.store.get(id), M, st); } catch (e) { console.error('[découpe → vidéos]', id, e.message); }
    } catch (e) {
      console.error('[découpe]', id, e.message);
      Object.assign(st, { status: 'error', stage: 'Erreur', error: String(e.message).slice(0, 500) });
      fs.rmSync(splitDir(this.tracksDir, id), { recursive: true, force: true });
    } finally { this.busy = false; setImmediate(() => this.pump()); }
  }
  /** Crée un morceau « terminé » par pièce (fichiers liés, réglages du sous-morceau) ; ignore ceux déjà ajoutés. */
  async addToLibrary(t, M, out) {
    const all = this.store.list({ status: 'done', limit: 1e6 }).items, ids = [];
    for (const p of M.pieces) {
      const dup = all.find((x) => x.meta?.splitFrom?.id === t.id && x.meta.splitFrom.n === p.n && x.meta.splitFrom.mode === M.mode);
      if (dup) { ids.push(dup.id); continue; }
      const id = crypto.randomBytes(6).toString('hex');
      const P = resolveParams({ ...(p.params || t.params), duration: Math.max(20, Math.round(p.duration)), wav: !!p.files.wav });
      const nt = {
        id, title: p.title, style: P.style || t.style, status: 'done', progress: 1, stage: 'Terminé', error: null, params: P,
        meta: { ...(p.meta || {}), titleEn: p.title_en, titleEnManual: false, seconds: p.duration, splitFrom: { id: t.id, title: t.title, titleEn: titleEnOf(t), n: p.n, of: M.pieces.length, mode: M.mode, start: p.start, end: p.end } },
        waveform: p.waveform, files: {}, seed: P.seed, variation: P.variation, bpm: P.bpm, key: P.key, scale: P.scale, mood: P.mood,
        duration: p.duration, parent_id: t.id, render_ms: 0, created_at: new Date().toISOString(), finished_at: new Date().toISOString(),
      };
      const dir = path.join(this.tracksDir, id); fs.mkdirSync(dir, { recursive: true });
      const N = fileNames(nt), files = {};
      if (p.files.wav) { link(path.join(out, p.files.wav.name), path.join(dir, N.wav)); files.wav = N.wav; }
      if (p.files.mp3) { link(path.join(out, p.files.mp3.name), path.join(dir, N.mp3)); files.mp3 = N.mp3; }
      if (p.files.midi?.length) {
        const mids = p.files.midi.map((m) => ({ name: path.basename(m.name), data: fs.readFileSync(path.join(out, m.name)) }));
        fs.writeFileSync(path.join(dir, N.mid), mids[0].data); files.mid = N.mid;
        fs.writeFileSync(path.join(dir, N.midzip), makeZip(mids)); files.midzip = N.midzip;
      }
      nt.files = files; this.store.insert(nt); ids.push(id); all.push(nt);
      try { await this.onAdded(this.store.get(id)); } catch (e) { console.error('[découpe → bibliothèque]', id, e.message); }
    }
    return ids;
  }
}
