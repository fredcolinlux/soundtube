// Nœuds de rendu vidéo (réseau local) : liste, contrôles de santé, répartition des vidéos, reprise sur panne.
// Ordre : nœuds NVENC (PC RTX) → autres encodeurs matériels → libx264 distant → CT local (secours, ou en parallèle).
// Réglages enregistrés dans <données>/render-nodes.json (nœuds, URL forcée, mode du CT, PC IA Ollama).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import dgram from 'node:dgram';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ENCODER_RANK, ENCODER_LABEL, SPEC_VERSION } from '../node-agent/render-core.mjs';
import { engineId, AUDIO_PROTOCOL } from '../node-agent/engine-id.mjs';

/** v1.16.0 : moteur audio du CT (référence pour les agents). */
export const CT_ENGINE = engineId(path.resolve(path.dirname(fileURLToPath(import.meta.url))));
/** Seuil par défaut : une génération de 15 min ou plus part en priorité sur un PC capable de rendre la musique. */
export const DEFAULT_AUDIO_MIN_SEC = 900;

export const DISCOVERY_PORT = 47811;
export const DEFAULT_AI = { url: '', model: 'qwen3:14b', timeout: 120 };
/** Veille : URL/modèle vides = repli sur le PC IA directeur (jamais de nom de modèle imposé ici). */
export const DEFAULT_WATCH_AI = { url: '', model: '' };
const LOCAL_MODES = ['fallback', 'parallel'];

export function normUrl(u) {
  let s = String(u || '').trim(); if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  let x; try { x = new URL(s); } catch { return null; }
  if (!x.hostname || x.username || x.password || x.pathname.length > 1 || x.search || !/^([a-z0-9-]+\.)*[a-z0-9-]+$|^\[[0-9a-f:.]+\]$/i.test(x.hostname)) return null;
  return `${x.protocol}//${x.host}`.toLowerCase();
}
// URL du PC IA : comme normUrl, mais accepte un chemin (proxy inverse, ex. http://192.168.0.150:40114/olla/ollama)
export function normAiUrl(u) {
  let s = String(u || '').trim(); if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  let x; try { x = new URL(s); } catch { return null; }
  if (!x.hostname || x.username || x.password || x.search || x.hash || !/^([a-z0-9-]+\.)*[a-z0-9-]+$|^\[[0-9a-f:.]+\]$/i.test(x.hostname)) return null;
  const path = x.pathname.replace(/\/+$/, '');
  if (path && !/^(\/[\w.~-]+)+$/.test(path)) return null;
  return `${x.protocol}//${x.host.toLowerCase()}${path}`;
}
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });

/** Requête HTTP simple (JSON, envoi d'un fichier en flux, ou téléchargement vers un fichier). */
export function request(base, method, p, { token, json, file, out, timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(p, base + '/'), lib = u.protocol === 'https:' ? https : http;
    const headers = { accept: 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    let body = null;
    if (json !== undefined) { body = Buffer.from(JSON.stringify(json)); headers['content-type'] = 'application/json'; headers['content-length'] = body.length; }
    if (file) { headers['content-type'] = 'application/octet-stream'; headers['content-length'] = fs.statSync(file).size; }
    const t0 = Date.now();
    const rq = lib.request(u, { method, headers, timeout }, (res) => {
      if (out && res.statusCode === 200) {
        const ws = fs.createWriteStream(out); res.pipe(ws);
        ws.on('finish', () => resolve({ status: 200, ms: Date.now() - t0, headers: res.headers })); ws.on('error', reject); res.on('error', reject);
        res.on('aborted', () => reject(new Error('Téléchargement interrompu')));
        return;
      }
      let s = ''; res.setEncoding('utf8'); res.on('data', (d) => { if (s.length < 2e6) s += d; });
      res.on('end', () => { let data = null; try { data = JSON.parse(s); } catch { data = { raw: s.slice(0, 300) }; } resolve({ status: res.statusCode, data, ms: Date.now() - t0 }); });
      res.on('error', reject);
    });
    rq.on('timeout', () => rq.destroy(new Error(`délai dépassé (${Math.round(timeout / 1000)} s)`)));
    rq.on('error', reject);
    if (file) { const rs = fs.createReadStream(file); rs.on('error', (e) => rq.destroy(e)); rs.pipe(rq); } else rq.end(body);
  });
}

export class RenderNodes {
  constructor({ dataDir, localSlots = 1, interval = 15000, token = process.env.SOUNDTUBE_NODE_TOKEN || '', autostart = true, pollMs = 1000, stallMs = 300000, log = console } = {}) {
    Object.assign(this, { dataDir, engine: CT_ENGINE, file: dataDir ? path.join(dataDir, 'render-nodes.json') : null, hfile: dataDir ? path.join(dataDir, 'render-history.json') : null, localSlots: Math.max(0, localSlots), interval, token, pollMs, stallMs, log });
    this.s = this.load(); this.state = new Map(); this.localRunning = 0; this.waiters = []; this.active = new Map(); this.timer = null; this.listeners = new Set();
    this.history = []; try { if (this.hfile) this.history = JSON.parse(fs.readFileSync(this.hfile, 'utf8')).slice(-300); } catch {}
    if (autostart) this.start();
  }
  load() {
    let s = {}; try { if (this.file) s = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch {}
    const nodes = Array.isArray(s.nodes) ? s.nodes.filter((n) => n && normUrl(n.url)).map((n) => ({ id: n.id || crypto.randomBytes(4).toString('hex'), url: normUrl(n.url), name: String(n.name || '').slice(0, 60), enabled: n.enabled !== false, token: String(n.token || ''), audio: n.audio !== false })) : [];
    // première installation : nœuds donnés par SOUNDTUBE_RENDER_NODES (URL séparées par des virgules)
    if (!s.nodes && process.env.SOUNDTUBE_RENDER_NODES) for (const u of process.env.SOUNDTUBE_RENDER_NODES.split(',')) { const url = normUrl(u); if (url && !nodes.some((n) => n.url === url)) nodes.push({ id: crypto.randomBytes(4).toString('hex'), url, name: '', enabled: true, token: '' }); }
    return { nodes, forceUrl: normUrl(s.forceUrl) || null, localMode: LOCAL_MODES.includes(s.localMode) ? s.localMode : 'fallback', ai: { ...DEFAULT_AI, ...(s.ai || {}) }, watchAi: { ...DEFAULT_WATCH_AI, ...(s.watchAi || {}) },
      audioMinSec: Number.isFinite(+s.audioMinSec) && +s.audioMinSec >= 60 ? Math.round(+s.audioMinSec) : DEFAULT_AUDIO_MIN_SEC };
  }
  save() { if (!this.file) return; const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.s, null, 1)); fs.renameSync(tmp, this.file); }
  start() { if (this.timer) return; this.checkAll(); this.timer = setInterval(() => this.checkAll(), this.interval); this.timer.unref?.(); }
  stop() { clearInterval(this.timer); this.timer = null; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { for (const f of this.listeners) try { f(); } catch {} this.dispatch(); }

  // ---------- liste des nœuds
  st(id) { if (!this.state.has(id)) this.state.set(id, { up: null, latency: null, health: null, error: null, checkedAt: null, running: 0, failures: 0, jobs: 0, lastJob: null }); return this.state.get(id); }
  add({ url, name = '', enabled = true, token = '' }) {
    const u = normUrl(url); if (!u) throw err('URL invalide (ex. http://192.168.1.50:8765)');
    if (this.s.nodes.some((n) => n.url === u)) throw err('Ce nœud est déjà dans la liste', 409);
    const n = { id: crypto.randomBytes(4).toString('hex'), url: u, name: String(name).slice(0, 60), enabled: !!enabled, token: String(token || ''), audio: true };
    this.s.nodes.push(n); this.save(); this.check(n).then(() => this.changed()); return n;
  }
  update(id, patch = {}) {
    const n = this.s.nodes.find((x) => x.id === id); if (!n) throw err('Nœud introuvable', 404);
    if (patch.url !== undefined) { const u = normUrl(patch.url); if (!u) throw err('URL invalide'); if (this.s.nodes.some((x) => x !== n && x.url === u)) throw err('URL déjà utilisée', 409); if (this.s.forceUrl === n.url) this.s.forceUrl = u; n.url = u; this.state.delete(id); }
    if (patch.name !== undefined) n.name = String(patch.name).slice(0, 60);
    if (patch.enabled !== undefined) n.enabled = !!patch.enabled;
    if (patch.token !== undefined) n.token = String(patch.token || '');
    if (patch.audio !== undefined) n.audio = !!patch.audio; // v1.16.0 : rendu musical autorisé sur ce nœud
    this.save(); this.check(n).then(() => this.changed()); return n;
  }
  remove(id) { const i = this.s.nodes.findIndex((x) => x.id === id); if (i < 0) throw err('Nœud introuvable', 404); const [n] = this.s.nodes.splice(i, 1); if (this.s.forceUrl === n.url) this.s.forceUrl = null; this.state.delete(id); this.save(); this.changed(); }
  setRender({ forceUrl, localMode, audioMinSec } = {}) {
    if (audioMinSec !== undefined) { const v = Math.round(+audioMinSec); if (!Number.isFinite(v) || v < 60 || v > 6 * 3600) throw err('Seuil musique : entre 1 et 360 min'); this.s.audioMinSec = v; }
    if (forceUrl !== undefined) {
      if (!forceUrl) this.s.forceUrl = null;
      else { const u = normUrl(forceUrl); if (!u) throw err('URL forcée invalide'); if (!this.s.nodes.some((n) => n.url === u)) this.add({ url: u }); this.s.forceUrl = u; const n = this.s.nodes.find((x) => x.url === u); n.enabled = true; }
    }
    if (localMode !== undefined) { if (!LOCAL_MODES.includes(localMode)) throw err('localMode : fallback ou parallel'); this.s.localMode = localMode; }
    this.save(); this.changed();
  }
  tokenOf(n) { return n.token || this.token; }

  // ---------- santé
  async check(n) {
    const st = this.st(n.id);
    try {
      const r = await request(n.url, 'GET', '/health', { token: this.tokenOf(n), timeout: 4000 });
      if (r.status === 401) throw new Error('jeton refusé (401)');
      if (r.status !== 200 || r.data?.app !== 'soundtube-node') throw new Error(r.data?.error || `réponse inattendue (HTTP ${r.status})`);
      if (r.data.spec !== SPEC_VERSION) throw new Error(`version d'agent incompatible (${r.data.version})`);
      if (!r.data.best && !r.data.audio?.ok) throw new Error('aucun encodeur vidéo utilisable sur ce nœud');
      Object.assign(st, { up: true, latency: r.ms, health: r.data, error: null, checkedAt: Date.now(), failures: 0 });
    } catch (e) { Object.assign(st, { up: false, latency: null, error: String(e.message).slice(0, 200), checkedAt: Date.now(), failures: st.failures + 1 }); }
    return st;
  }
  async checkAll() { await Promise.all(this.s.nodes.map((n) => this.check(n))); this.changed(); }
  markFailed(n, e) { const st = this.st(n.id); Object.assign(st, { up: false, error: 'Échec en cours de rendu : ' + String(e.message).slice(0, 160), failures: st.failures + 1, checkedAt: Date.now() }); this.log.error?.(`[nœuds] ${n.name || n.url} en panne : ${e.message}`); }

  // ---------- choix d'un nœud
  slotsOf(n) { return Math.max(1, this.st(n.id).health?.slots || 1); }
  score(n) { const st = this.st(n.id), h = st.health || {}; return [ENCODER_RANK[h.best] ?? 3, st.running / this.slotsOf(n), st.latency ?? 999]; }
  candidates(tried = new Set()) {
    let list = this.s.nodes.filter((n) => n.enabled && this.st(n.id).up && this.st(n.id).health?.best && !tried.has(n.id));
    if (this.s.forceUrl) list = list.filter((n) => n.url === this.s.forceUrl);
    return list;
  }
  /** Prend un emplacement libre tout de suite : { node } (distant) ou { local: true }, sinon null. */
  tryAcquire(tried = new Set(), { allowLocal = true } = {}) {
    const cands = this.candidates(tried);
    const free = cands.filter((n) => this.st(n.id).running < this.slotsOf(n))
      .sort((a, b) => { const x = this.score(a), y = this.score(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
    if (free.length) { const n = free[0]; this.st(n.id).running++; return { node: n, release: () => { this.st(n.id).running--; this.dispatch(); } }; }
    // CT local : secours quand aucun nœud n'est disponible (tous hors ligne, désactivés ou déjà essayés), ou en parallèle
    const mode = this.s.localMode, noRemote = !cands.length;
    const localOk = allowLocal && this.localSlots > 0 && this.localRunning < this.localSlots && (mode === 'parallel' || noRemote);
    if (localOk) { this.localRunning++; return { local: true, release: () => { this.localRunning--; this.dispatch(); } }; }
    return null;
  }
  acquire(tried = new Set()) {
    const s = this.tryAcquire(tried); if (s) return Promise.resolve(s);
    return new Promise((resolve) => this.waiters.push({ tried, resolve }));
  }
  dispatch() {
    for (let i = 0; i < this.waiters.length; i++) { const w = this.waiters[i], s = this.tryAcquire(w.tried); if (s) { this.waiters.splice(i--, 1); w.resolve(s); } }
  }

  /**
   * Rend une vidéo préparée (job = { spec, files, dir, outFile, onProgress }) sur le meilleur nœud libre ;
   * en cas de panne d'un nœud (hors ligne, erreur, blocage), recommence sur un autre nœud puis sur le CT.
   * localExec : exécution libx264 sur le CT. onSlot(info) : appelé quand un emplacement est attribué.
   */
  async run(job, localExec, { onSlot } = {}) {
    const tried = new Set(); let lastErr = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const slot = await this.acquire(tried);
      const where = slot.local ? { node: null, name: 'CT (local)', encoder: 'libx264' } : { node: slot.node.url, name: slot.node.name || this.st(slot.node.id).health?.name || slot.node.url, encoder: this.st(slot.node.id).health?.best };
      onSlot?.({ ...where, attempt, retry: !!lastErr, lastError: lastErr?.message || null });
      const key = crypto.randomBytes(4).toString('hex'); this.active.set(key, { ...where, startedAt: Date.now(), progress: 0, title: job.title || '' });
      try {
        const onProgress = (p) => { const a = this.active.get(key); if (a) a.progress = p; job.onProgress?.(p); };
        const t0 = Date.now();
        if (slot.local) { const r = await localExec({ ...job, onProgress }); this.record({ kind: 'video', node: null, nodeName: 'CT (local)', title: job.title || '', trackId: job.trackId || null, status: lastErr ? 'fallback' : 'done', ms: Date.now() - t0, note: lastErr ? 'repris sur le CT : ' + lastErr.message.slice(0, 120) : null }); return { ...r, node: null, nodeName: 'CT (local)', retries: attempt }; }
        const r = await this.remoteExec(slot.node, { ...job, onProgress });
        const st = this.st(slot.node.id); st.jobs++; st.lastJob = Date.now();
        this.record({ kind: 'video', node: slot.node.id, nodeName: this.nameOf(slot.node), title: job.title || '', trackId: job.trackId || null, status: 'done', ms: Date.now() - t0, encoder: r.encoder || null });
        return { ...r, retries: attempt };
      } catch (e) {
        if (slot.local) throw e;
        this.record({ kind: 'video', node: slot.node.id, nodeName: this.nameOf(slot.node), title: job.title || '', trackId: job.trackId || null, status: 'error', note: String(e.message).slice(0, 160) });
        lastErr = e; tried.add(slot.node.id); this.markFailed(slot.node, e); job.onProgress?.(0);
      } finally { this.active.delete(key); slot.release(); }
    }
    throw lastErr || new Error('Aucun nœud de rendu disponible');
  }

  async remoteExec(n, { spec, files, outFile, onProgress, onStage, audioFrom = null }) {
    const tk = this.tokenOf(n), call = (m, p, o = {}) => request(n.url, m, p, { token: tk, ...o });
    const c = await call('POST', '/jobs', { json: { spec, ...(audioFrom ? { audioFrom } : {}) }, timeout: 15000 });
    if (c.status !== 201) throw new Error(c.data?.error || `création refusée (HTTP ${c.status})`);
    const id = c.data.id;
    try {
      onStage?.('upload');
      for (const name of c.data.need) { const r = await call('PUT', `/jobs/${id}/files/${encodeURIComponent(name)}`, { file: files[name], timeout: 120000 }); if (r.status !== 200) throw new Error(r.data?.error || `envoi ${name} refusé`); }
      const s = await call('POST', `/jobs/${id}/start`); if (s.status !== 202) throw new Error(s.data?.error || 'démarrage refusé');
      onStage?.('encode');
      let fails = 0, last = -1, lastAt = Date.now();
      for (;;) {
        await new Promise((r) => setTimeout(r, this.pollMs));
        let r; try { r = await call('GET', `/jobs/${id}`, { timeout: 5000 }); } catch (e) { if (++fails >= 3) throw new Error('nœud injoignable pendant le rendu : ' + e.message); continue; }
        if (r.status !== 200) throw new Error(r.data?.error || `suivi impossible (HTTP ${r.status})`);
        fails = 0; const j = r.data;
        if (j.status === 'error' || j.status === 'cancelled') throw new Error('erreur ffmpeg sur le nœud : ' + (j.error || j.status));
        if (j.progress !== last) { last = j.progress; lastAt = Date.now(); onProgress?.(Math.min(0.99, j.progress)); }
        else if (j.status === 'running' && Date.now() - lastAt > this.stallMs) throw new Error('rendu bloqué sur le nœud');
        if (j.status === 'done') break;
      }
      onStage?.('download');
      const part = outFile + '.part.mp4';
      const d = await call('GET', `/jobs/${id}/output`, { out: part, timeout: 120000 });
      if (d.status !== 200) throw new Error('récupération de la vidéo impossible');
      if (!fs.existsSync(part) || fs.statSync(part).size < 1000) throw new Error('vidéo reçue vide');
      fs.renameSync(part, outFile);
      return { encoder: d.headers['x-encoder'] || this.st(n.id).health?.best || null, node: n.url, nodeName: n.name || this.st(n.id).health?.name || n.url };
    } finally { call('DELETE', `/jobs/${id}`, { timeout: 5000 }).catch(() => {}); try { fs.rmSync(outFile + '.part.mp4', { force: true }); } catch {} }
  }

  // ---------- v1.16.0 : rendu musical sur les nœuds
  /** Capacité musicale d'un nœud : { capable, reason, engine, … } (raison en français si non). */
  audioState(n) {
    const st = this.st(n.id), a = st.health?.audio;
    const base = { engine: a?.engine || null, samples: a?.samples || null, slots: a?.slots ?? null, running: a?.running ?? null, queued: a?.queued ?? null, node: a?.node || null, enabled: n.audio !== false, verified: st.verify ? { ok: st.verify.ok, at: st.verify.at, wav: st.verify.ct } : null };
    const no = (reason) => ({ capable: false, reason, ...base });
    if (!st.health) return no(st.error ? 'nœud injoignable' : 'pas encore contrôlé');
    if (!a) return no(`agent ${st.health.version || 'ancien'} : rend la vidéo seulement (réinstaller l'agent 1.17.0)`);
    if (!a.ok) return no(a.reason || 'rendu musical indisponible');
    if (a.protocol !== AUDIO_PROTOCOL) return no('protocole audio différent : réinstaller l\'agent');
    if (a.engine?.hash !== this.engine.hash) return no(`moteur différent (PC ${a.engine?.version || '?'} · ${a.engine?.hash || '?'}, CT ${this.engine.version} · ${this.engine.hash}) : réinstaller l'agent fourni avec cette version`);
    if (!n.enabled) return no('nœud désactivé');
    if (n.audio === false) return no('rendu musical désactivé dans Admin');
    if (!st.up) return no('nœud hors ligne');
    if (st.verify?.ok === false) return no(st.verify.error);
    return { capable: true, reason: null, ...base };
  }
  /** Nœud capable le moins chargé (forcé : seulement l'URL forcée), ou null. free = seulement s'il a un emplacement libre. */
  /** Vitesse moyenne des derniers rendus musicaux réussis (ms par seconde de musique). Plus petit = plus rapide. */
  audioSpeed(n) {
    const rows = this.history.filter((h) => h.node === n.id && h.kind === 'audio' && h.status === 'done' && h.ms > 0).slice(-8);
    if (!rows.length) return this.st(n.id).latency ?? 999; // pas encore de mesure : départager par latence réseau
    return rows.reduce((a, h) => a + h.ms, 0) / rows.length;
  }
  audioNode({ free = false, tried = new Set() } = {}) {
    let list = this.s.nodes.filter((n) => !tried.has(n.id) && this.audioState(n).capable);
    if (this.s.forceUrl) list = list.filter((n) => n.url === this.s.forceUrl);
    const load = (n) => { const st = this.st(n.id), a = st.health.audio; return ((st.audioRunning || 0) + Math.max(0, (a.running || 0) + (a.queued || 0) - (st.audioRunning || 0))) / Math.max(1, a.slots || 1); };
    if (free) list = list.filter((n) => load(n) < 1);
    // v1.17.0 : moins chargé, puis rendu musical le plus rapide mesuré (sinon latence)
    return list.sort((a, b) => load(a) - load(b) || this.audioSpeed(a) - this.audioSpeed(b) || (this.st(a.id).latency ?? 999) - (this.st(b.id).latency ?? 999))[0] || null;
  }
  nameOf(n) { return n ? n.name || this.st(n.id).health?.name || n.url : 'CT (local)'; }
  /** Journal des rendus (musique et vidéo) : où chaque job a tourné. */
  record(e) {
    this.history.push({ at: new Date().toISOString(), ...e }); if (this.history.length > 300) this.history.splice(0, this.history.length - 300);
    if (this.hfile) try { fs.writeFileSync(this.hfile + '.tmp', JSON.stringify(this.history)); fs.renameSync(this.hfile + '.tmp', this.hfile); } catch {}
  }

  // ---------- état pour la page Admin
  view() {
    const nodes = this.s.nodes.map((n) => {
      const st = this.st(n.id), h = st.health || {};
      return { id: n.id, url: n.url, name: n.name || h.name || '', enabled: n.enabled, forced: this.s.forceUrl === n.url, hasToken: !!n.token,
        status: !n.enabled ? 'disabled' : st.up == null ? 'unknown' : st.up ? 'up' : 'down', latency: st.latency, error: st.error, checkedAt: st.checkedAt ? new Date(st.checkedAt).toISOString() : null,
        encoder: h.best || null, encoderLabel: h.best ? ENCODER_LABEL[h.best] || h.best : null, encoders: h.encoders || [], slots: h.slots || null, running: st.running, nodeRunning: h.running ?? null, queued: h.queued ?? null,
        load: h.slots ? +((st.running) / h.slots).toFixed(2) : null, platform: h.platform || null, arch: h.arch || null, hostname: h.hostname || null, cpu: h.cpuModel || null, version: h.version || null, ffmpeg: h.ffmpeg || null, jobs: st.jobs, auth: h.auth ?? null,
        audio: { ...this.audioState(n), audioJobs: st.audioJobs || 0 }, history: this.history.filter((x) => x.node === n.id).slice(-12).reverse() };
    });
    const order = this.candidates().slice().sort((a, b) => { const x = this.score(a), y = this.score(b); return x[0] - y[0] || x[2] - y[2]; }).map((n) => n.name || this.st(n.id).health?.name || n.url);
    return { nodes, forceUrl: this.s.forceUrl, localMode: this.s.localMode, local: { slots: this.localSlots, running: this.localRunning, cpus: os.cpus().length }, waiting: this.waiters.length,
      active: [...this.active.values()].map((a) => ({ ...a, startedAt: new Date(a.startedAt).toISOString(), progress: +a.progress.toFixed(3) })), order, interval: this.interval, tokenEnv: !!this.token,
      audioMinSec: this.s.audioMinSec, engine: { hash: this.engine.hash, version: this.engine.version }, history: this.history.slice(-30).reverse(), ctHistory: this.history.filter((x) => !x.node).slice(-12).reverse() };
  }

  // ---------- PC IA (Ollama) : réglage enregistré + test de connexion
  setAI({ url, model, timeout } = {}) {
    if (timeout !== undefined) { const t = Math.round(+timeout); if (!Number.isFinite(t) || t < 10 || t > 600) throw err('Délai IA : entre 10 et 600 s'); this.s.ai.timeout = t; }
    if (url !== undefined) { if (url && !normAiUrl(url)) throw err('URL Ollama invalide (ex. http://192.168.1.60:11434 ou http://proxy:port/chemin)'); this.s.ai.url = url ? normAiUrl(url) : ''; }
    if (model !== undefined) { const m = String(model || '').trim(); if (m && !/^[\w.:/-]{1,80}$/.test(m)) throw err('Nom de modèle invalide'); this.s.ai.model = m || DEFAULT_AI.model; }
    this.save(); return this.s.ai;
  }

  setWatchAI({ url, model } = {}) {
    if (!this.s.watchAi) this.s.watchAi = { ...DEFAULT_WATCH_AI };
    if (url !== undefined) { if (url && !normAiUrl(url)) throw err('URL Ollama veille invalide'); this.s.watchAi.url = url ? normAiUrl(url) : ''; }
    if (model !== undefined) { const m = String(model || '').trim(); if (m && !/^[\w.:/-]{1,80}$/.test(m)) throw err('Nom de modèle veille invalide'); this.s.watchAi.model = m; }
    this.save(); return this.watchAiView();
  }
  /** Résolution effective pour la veille : URL/modèle propres, sinon repli directeur + notice. */
  resolveWatchAi() {
    const d = this.s.ai || DEFAULT_AI, w = this.s.watchAi || DEFAULT_WATCH_AI;
    const url = normAiUrl(w.url) || normAiUrl(d.url) || '';
    const model = (w.model && String(w.model).trim()) || d.model || DEFAULT_AI.model;
    const fallbackModel = !(w.model && String(w.model).trim()) && !!(d.model || DEFAULT_AI.model);
    const fallbackUrl = !normAiUrl(w.url) && !!normAiUrl(d.url);
    return {
      url, model, timeout: d.timeout || DEFAULT_AI.timeout,
      usingDirectorUrl: fallbackUrl, usingDirectorModel: fallbackModel,
      notice: (fallbackUrl || fallbackModel)
        ? ('Repli sur le PC IA directeur' + (fallbackModel ? ` (modèle « ${model} »)` : '') + (fallbackUrl ? ' (même URL)' : '') + '.')
        : null,
      configured: { url: w.url || '', model: w.model || '' },
    };
  }
  watchAiView() {
    const r = this.resolveWatchAi();
    return { url: this.s.watchAi?.url || '', model: this.s.watchAi?.model || '', effective: { url: r.url, model: r.model }, notice: r.notice, usingDirectorUrl: r.usingDirectorUrl, usingDirectorModel: r.usingDirectorModel };
  }

  async testAI({ url, model } = {}) {
    const u = normAiUrl(url || this.s.ai.url), m = model || this.s.ai.model;
    if (!u) return { ok: false, error: 'Aucune URL renseignée' };
    try {
      const r = await request(u, 'GET', 'api/tags', { timeout: 5000 });
      if (r.status !== 200 || !Array.isArray(r.data?.models)) return { ok: false, latency: r.ms, error: `Pas une API Ollama (HTTP ${r.status})` };
      const models = r.data.models.map((x) => x.name || x.model).filter(Boolean);
      const has = models.some((x) => x === m || x === m + ':latest' || x.split(':')[0] === m && !m.includes(':'));
      let version = null; try { const v = await request(u, 'GET', 'api/version', { timeout: 3000 }); version = v.data?.version || null; } catch {}
      return { ok: true, url: u, latency: r.ms, version, models, model: m, hasModel: has, message: has ? `Connecté — modèle ${m} présent` : `Connecté, mais le modèle ${m} n'est pas installé (ollama pull ${m})` };
    } catch (e) { return { ok: false, url: u, error: 'Connexion impossible : ' + e.message }; }
  }

  // ---------- découverte (diffusion UDP sur le réseau local)
  discover({ timeout = 1500, port = DISCOVERY_PORT, targets = null } = {}) {
    return new Promise((resolve) => {
      const found = new Map(), sock = dgram.createSocket('udp4');
      sock.on('message', (msg, r) => { try { const d = JSON.parse(String(msg)); if (d.app !== 'soundtube-node') return; const url = `http://${r.address}:${d.port}`; found.set(url, { url, name: d.name, version: d.version, encoder: d.best, encoderLabel: ENCODER_LABEL[d.best] || d.best, auth: !!d.auth, known: this.s.nodes.some((n) => n.url === url) }); } catch {} });
      sock.on('error', () => { try { sock.close(); } catch {} resolve([...found.values()]); });
      sock.bind(0, () => {
        sock.setBroadcast(true);
        const addrs = new Set(targets || ['255.255.255.255']);
        if (!targets) for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal && a.netmask) { const ip = a.address.split('.').map(Number), nm = a.netmask.split('.').map(Number); addrs.add(ip.map((x, i) => (x & nm[i]) | (~nm[i] & 255)).join('.')); }
        for (const ad of addrs) sock.send('SOUNDTUBE_DISCOVER', port, ad, () => {});
        setTimeout(() => { try { sock.close(); } catch {} resolve([...found.values()]); }, timeout);
      });
    });
  }
}
