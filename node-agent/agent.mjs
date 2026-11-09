#!/usr/bin/env node
// soundtube — agent de rendu vidéo (nœud du réseau local). Aucune dépendance : Node.js ≥ 20 + ffmpeg.
// Le CT envoie un job (spec + fichiers : audio, fond, polices, textes) ; l'agent encode avec le meilleur encodeur
// disponible (NVENC sur la carte NVIDIA, sinon libx264) et renvoie le MP4.
// v1.17.0 : l'agent rend aussi la MUSIQUE (même moteur que le CT, vérifié par empreinte — voir audio.mjs), et peut
// enchaîner la vidéo sur le WAV qu'il vient de rendre (job vidéo « audioFrom ») sans aller-retour par le CT.
// Réglages : config.json à côté de ce fichier, ou variables d'environnement (voir README.md).
import http from 'node:http';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createAudio, safeRel } from './audio.mjs';
import { SPEC_VERSION, ENCODER_LABEL, DEFAULT_SLOTS, buildArgs, validateSpec, runFfmpeg, detectEncoders, safeName, stripFilter } from './render-core.mjs';

export const AGENT_VERSION = '1.21.3';
const here = path.dirname(fileURLToPath(import.meta.url));

export function loadConfig(over = {}) {
  let file = {};
  const cf = over.configFile || process.env.SOUNDTUBE_NODE_CONFIG || path.join(here, 'config.json');
  try { file = JSON.parse(fs.readFileSync(cf, 'utf8').replace(/^\uFEFF/, '')); } catch {}
  const e = process.env, pick = (k, ek, d) => over[k] ?? (e[ek] !== undefined && e[ek] !== '' ? e[ek] : undefined) ?? file[k] ?? d;
  return {
    port: +pick('port', 'SOUNDTUBE_NODE_PORT', 8765),
    host: pick('host', 'SOUNDTUBE_NODE_HOST', '0.0.0.0'),
    token: String(pick('token', 'SOUNDTUBE_NODE_TOKEN', '') || ''),
    name: pick('name', 'SOUNDTUBE_NODE_NAME', os.hostname()),
    ffmpeg: pick('ffmpeg', 'SOUNDTUBE_FFMPEG', 'ffmpeg'),
    workDir: path.resolve(pick('workDir', 'SOUNDTUBE_NODE_WORKDIR', path.join(os.tmpdir(), 'soundtube-node'))),
    slots: +pick('slots', 'SOUNDTUBE_NODE_SLOTS', 0) || 0, // 0 = selon l'encodeur
    encoder: pick('encoder', 'SOUNDTUBE_NODE_ENCODER', '') || '', // forcer un encodeur (ex. libx264)
    discovery: String(pick('discovery', 'SOUNDTUBE_NODE_DISCOVERY', 'true')) !== 'false',
    discoveryPort: +pick('discoveryPort', 'SOUNDTUBE_NODE_DISCOVERY_PORT', 47811),
    maxUploadGB: +pick('maxUploadGB', 'SOUNDTUBE_NODE_MAX_UPLOAD_GB', 8),
    logFile: pick('logFile', 'SOUNDTUBE_NODE_LOG', '') || '', // journal (service Windows : pas de console)
    // simulation (tests) : délai par requête (ms), facteur de lenteur de l'encodage
    delayMs: +pick('delayMs', 'SOUNDTUBE_NODE_DELAY_MS', 0),
    // v1.17.0 : rendu musical
    audio: String(pick('audio', 'SOUNDTUBE_NODE_AUDIO', 'true')) !== 'false',
    audioSlots: +pick('audioSlots', 'SOUNDTUBE_NODE_AUDIO_SLOTS', 1) || 1,
    samplesDir: pick('samplesDir', 'SOUNDTUBE_NODE_SAMPLES', '') || '',
    engineRoot: pick('engineRoot', 'SOUNDTUBE_NODE_ENGINE', '') || '',
  };
}

export function startAgent(over = {}) {
  const cfg = loadConfig(over);
  fs.mkdirSync(cfg.workDir, { recursive: true });
  for (const d of fs.readdirSync(cfg.workDir)) if (d.startsWith('job-')) fs.rmSync(path.join(cfg.workDir, d), { recursive: true, force: true }); // restes d'un arrêt brutal
  const det = over.detected || detectEncoders(cfg.ffmpeg, cfg.encoder ? { only: [cfg.encoder, 'libx264'] } : {});
  const best = cfg.encoder && det.working.includes(cfg.encoder) ? cfg.encoder : det.best;
  const slots = cfg.slots || DEFAULT_SLOTS[best] || 1;
  const hasDrawtext = det.drawtext !== false; // v1.21.3 : inconnu = supposé présent
  const jobs = new Map(); let running = 0; const waiting = [];
  const started = Date.now();
  const log = (...a) => {
    if (over.quiet) return;
    const line = [new Date().toISOString(), ...a].join(' ');
    console.log(line);
    if (cfg.logFile) try {
      if ((fs.statSync(cfg.logFile, { throwIfNoEntry: false })?.size || 0) > 5e6) fs.renameSync(cfg.logFile, cfg.logFile + '.old');
      fs.appendFileSync(cfg.logFile, line + '\n');
    } catch {}
  };
  const audio = createAudio(cfg, log);
  log(`[agent] ${cfg.name} — ffmpeg : ${det.ffmpeg || det.error} — encodeurs : ${det.working.join(', ') || 'aucun'} — choisi : ${best || 'aucun'} (${slots} en parallèle)${hasDrawtext ? '' : ' — ATTENTION drawtext absent (titres de chapitre omis ; brew install ffmpeg-full)'} — musique : ${audio.health().ok ? `moteur ${audio.engine.version} (${audio.engine.hash})` : audio.health().reason}`);

  const health = () => ({
    ok: !!best, app: 'soundtube-node', version: AGENT_VERSION, spec: SPEC_VERSION, name: cfg.name, hostname: os.hostname(), platform: process.platform, arch: process.arch,
    cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model || '', memGB: +(os.totalmem() / 1e9).toFixed(1), loadavg: os.loadavg()[0],
    encoders: det.working, listed: det.listed, failed: det.failed, best, bestLabel: ENCODER_LABEL[best] || best, ffmpeg: det.ffmpeg || null,
    drawtext: hasDrawtext, filters: det.filters || null, ffmpegPath: cfg.ffmpeg,
    slots, running, queued: waiting.length, load: +((running + waiting.length) / slots).toFixed(2), uptime: Math.round((Date.now() - started) / 1000), auth: !!cfg.token,
    audio: audio.health(),
  });
  const authOk = (req) => !cfg.token || (() => { const a = Buffer.from(String(req.headers.authorization || '')), b = Buffer.from('Bearer ' + cfg.token); return a.length === b.length && crypto.timingSafeEqual(a, b); })();
  const send = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(b) }); res.end(b); };
  const readJson = (req, max = 2e6) => new Promise((ok, ko) => { let s = ''; req.setEncoding('utf8'); req.on('data', (d) => { s += d; if (s.length > max) { ko(Object.assign(new Error('trop gros'), { status: 413 })); req.destroy(); } }); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { ko(Object.assign(new Error('JSON invalide'), { status: 400 })); } }); req.on('error', ko); });

  function pump() {
    while (running < slots && waiting.length) {
      const j = waiting.shift(); if (j.status !== 'queued') continue;
      running++; j.status = 'running'; j.startedAt = Date.now();
      const enc = j.encoder;
      // v1.21.3 : ffmpeg sans drawtext (Homebrew « ffmpeg » sans freetype) → rendu sans les titres de chapitre au lieu d'échouer
      let spec = j.spec;
      if (!hasDrawtext && /drawtext=/.test(spec.graph)) { const s = stripFilter(spec.graph, 'drawtext'); spec = { ...spec, graph: s.graph }; j.warning = `drawtext absent de ffmpeg : ${s.removed} texte(s) de chapitre omis (brew install ffmpeg-full)`; log(`[job ${j.id}] ${j.warning}`); }
      const R = runFfmpeg(cfg.ffmpeg, buildArgs(spec, enc, 'out.mp4'), { cwd: j.dir, total: j.spec.dur, onProgress: (p) => { j.progress = p; } });
      j.proc = R.proc;
      R.done.then(() => { j.status = 'done'; j.progress = 1; j.size = fs.statSync(path.join(j.dir, 'out.mp4')).size; log(`[job ${j.id}] terminé en ${((Date.now() - j.startedAt) / 1000).toFixed(1)} s (${enc})`); },
        (e) => { if (j.status !== 'cancelled') { j.status = 'error'; j.error = String(e.message).slice(0, 800); log(`[job ${j.id}] erreur : ${j.error}`); } })
        .finally(() => { running--; j.proc = null; j.endedAt = Date.now(); pump(); });
    }
  }
  const drop = (j) => { if (j.proc) { j.status = 'cancelled'; try { j.proc.kill('SIGKILL'); } catch {} } j.status = j.status === 'running' ? 'cancelled' : j.status; jobs.delete(j.id); setTimeout(() => fs.rmSync(j.dir, { recursive: true, force: true }), 500); };
  // ménage : jobs oubliés (sortie non récupérée) supprimés après 2 h
  const gc = setInterval(() => {
    for (const j of jobs.values()) if (Date.now() - (j.endedAt || j.createdAt) > 2 * 3600e3 && j.status !== 'running') drop(j);
    for (const j of audio.jobs.values()) if (Date.now() - (j.endedAt || j.createdAt) > 3 * 3600e3 && j.status !== 'running' && j.status !== 'queued') audio.drop(j);
  }, 60e3); gc.unref();

  const server = http.createServer(async (req, res) => {
    try {
      if (cfg.delayMs) await new Promise((r) => setTimeout(r, cfg.delayMs));
      const u = new URL(req.url, 'http://x'), p = u.pathname.replace(/\/+$/, '') || '/';
      if (req.method === 'GET' && p === '/') return send(res, 200, { app: 'soundtube-node', version: AGENT_VERSION, name: cfg.name });
      if (!authOk(req)) return send(res, 401, { error: 'Jeton invalide (Authorization: Bearer …)' });
      if (req.method === 'GET' && p === '/health') return send(res, 200, health());
      if (req.method === 'POST' && p === '/jobs') {
        if (!best) return send(res, 503, { error: 'Aucun encodeur vidéo utilisable' });
        const b = await readJson(req); validateSpec(b.spec);
        const total = b.spec.files.reduce((a, f) => a + f.size, 0); if (total > cfg.maxUploadGB * 1e9) return send(res, 413, { error: 'Fichiers trop gros' });
        const id = crypto.randomBytes(8).toString('hex'), dir = path.join(cfg.workDir, 'job-' + id); fs.mkdirSync(dir);
        const enc = b.encoder && det.working.includes(b.encoder) ? b.encoder : best;
        const received = new Set();
        if (b.audioFrom) { // v1.17.0 : audio = WAV rendu ici par un job musical (pas d'envoi depuis le CT)
          const a = audio.jobs.get(String(b.audioFrom.job || '')), name = String(b.audioFrom.as || ''), f = b.spec.files.find((x) => x.name === name);
          if (!a || a.status !== 'done' || !f || !safeName(name)) { fs.rmSync(dir, { recursive: true, force: true }); return send(res, 409, { error: 'Job musical introuvable ou pas terminé' }); }
          const src = path.join(a.dir, 'out.wav'); if (fs.statSync(src).size !== f.size) { fs.rmSync(dir, { recursive: true, force: true }); return send(res, 409, { error: 'Taille du WAV différente du spec' }); }
          try { fs.linkSync(src, path.join(dir, name)); } catch { fs.copyFileSync(src, path.join(dir, name)); }
          received.add(name); a.chained = id;
        }
        jobs.set(id, { id, dir, spec: b.spec, status: 'upload', progress: 0, error: null, encoder: enc, createdAt: Date.now(), received });
        log(`[job ${id}] créé (${b.spec.res}, ${Math.round(b.spec.dur)} s, ${(total / 1e6).toFixed(1)} Mo, ${enc})`);
        return send(res, 201, { id, encoder: enc, need: b.spec.files.map((f) => f.name).filter((n) => !received.has(n)) });
      }
      // ---- v1.17.0 : rendu musical
      if (req.method === 'POST' && p === '/audio') { const j = audio.create(await readJson(req)); return send(res, 201, audio.view(j)); }
      if (req.method === 'POST' && p === '/samples/plan') return send(res, 200, audio.samplesPlan(await readJson(req, 4e6)));
      if (req.method === 'POST' && p === '/samples/commit') return send(res, 200, audio.samplesCommit());
      if (req.method === 'PUT' && p.startsWith('/samples/files/')) { const rel = decodeURIComponent(p.slice('/samples/files/'.length)); if (!safeRel(rel)) return send(res, 400, { error: 'chemin refusé' }); return send(res, 200, await audio.samplesPut(rel, req)); }
      const am = /^\/audio\/([0-9a-f]{16})(?:\/files\/(wav|mid|midzip))?$/.exec(p);
      if (am) {
        const j = audio.jobs.get(am[1]); if (!j) return send(res, 404, { error: 'Job musical inconnu' });
        if (req.method === 'GET' && !am[2]) return send(res, 200, audio.view(j));
        if (req.method === 'GET') {
          if (j.status !== 'done') return send(res, 409, { error: 'Musique pas prête' });
          const f = path.join(j.dir, { wav: 'out.wav', mid: 'out.mid', midzip: 'out-midi.zip' }[am[2]]);
          if (!fs.existsSync(f)) return send(res, 404, { error: 'Fichier absent' });
          res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': fs.statSync(f).size }); return fs.createReadStream(f).pipe(res);
        }
        if (req.method === 'DELETE') { audio.drop(j); return send(res, 200, { ok: true }); }
        return send(res, 405, { error: 'Méthode non permise' });
      }
      const m = /^\/jobs\/([0-9a-f]{16})(?:\/(files\/[^/]+|start|output))?$/.exec(p);
      if (!m) return send(res, 404, { error: 'Introuvable' });
      const j = jobs.get(m[1]); if (!j) return send(res, 404, { error: 'Job inconnu' });
      const sub = m[2] || '';
      if (req.method === 'PUT' && sub.startsWith('files/')) {
        const name = decodeURIComponent(sub.slice(6)), f = j.spec.files.find((x) => x.name === name);
        if (!safeName(name) || !f) return send(res, 400, { error: 'Fichier non prévu par le spec' });
        if (j.status !== 'upload') return send(res, 409, { error: 'Job déjà lancé' });
        const dst = path.join(j.dir, name), out = fs.createWriteStream(dst); let n = 0;
        await new Promise((ok, ko) => { req.on('data', (d) => { n += d.length; if (n > f.size) { req.destroy(); ko(Object.assign(new Error('Taille dépassée'), { status: 400 })); } }); req.pipe(out); out.on('finish', ok); out.on('error', ko); req.on('error', ko); });
        if (n !== f.size) { fs.rmSync(dst, { force: true }); return send(res, 400, { error: `Taille reçue ${n} ≠ ${f.size}` }); }
        j.received.add(name); return send(res, 200, { ok: true, name, size: n });
      }
      if (req.method === 'POST' && sub === 'start') {
        const missing = j.spec.files.filter((f) => !j.received.has(f.name)).map((f) => f.name);
        if (missing.length) return send(res, 400, { error: 'Fichiers manquants : ' + missing.join(', ') });
        if (j.status === 'upload') { j.status = 'queued'; waiting.push(j); pump(); }
        return send(res, 202, { status: j.status });
      }
      if (req.method === 'GET' && !sub) return send(res, 200, { id: j.id, status: j.status, progress: +j.progress.toFixed(4), error: j.error, warning: j.warning || null, encoder: j.encoder, size: j.size || null, position: waiting.indexOf(j) });
      if (req.method === 'GET' && sub === 'output') {
        if (j.status !== 'done') return send(res, 409, { error: 'Vidéo pas prête' });
        const f = path.join(j.dir, 'out.mp4');
        res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': fs.statSync(f).size, 'x-encoder': j.encoder });
        return fs.createReadStream(f).pipe(res);
      }
      if (req.method === 'DELETE' && !sub) { drop(j); return send(res, 200, { ok: true }); }
      return send(res, 405, { error: 'Méthode non permise' });
    } catch (e) { if (!res.headersSent) send(res, e.status || 400, { error: String(e.message).slice(0, 500) }); else res.destroy(); }
  });
  server.requestTimeout = 0; server.headersTimeout = 60000;

  // découverte sur le réseau local : réponse à « SOUNDTUBE_DISCOVER » (UDP, diffusion)
  let udp = null;
  if (cfg.discovery) {
    udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    udp.on('message', (msg, rinfo) => { if (String(msg).trim() === 'SOUNDTUBE_DISCOVER') { const b = Buffer.from(JSON.stringify({ app: 'soundtube-node', name: cfg.name, port: server.address()?.port || cfg.port, version: AGENT_VERSION, best, auth: !!cfg.token })); udp.send(b, rinfo.port, rinfo.address); } });
    udp.on('error', (e) => { log('[découverte] désactivée :', e.message); try { udp.close(); } catch {} udp = null; });
    udp.bind(cfg.discoveryPort);
  }
  const ready = new Promise((ok, ko) => { server.once('error', ko); server.listen(cfg.port, cfg.host, () => { log(`[agent] à l'écoute sur http://${cfg.host}:${server.address().port}${cfg.token ? ' (jeton requis)' : ''}`); ok(server.address().port); }); });
  const close = () => { clearInterval(gc); audio.close(); for (const j of [...jobs.values()]) drop(j); try { udp?.close(); } catch {} return new Promise((r) => server.close(() => r())); };
  return { server, ready, close, health, cfg, audio };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--detect')) {
  // node agent.mjs --detect : encodeurs utilisables (utilisé par l'installateur)
  const cfg = loadConfig(), det = detectEncoders(cfg.ffmpeg);
  console.log(JSON.stringify({ ffmpeg: cfg.ffmpeg, version: det.ffmpeg || null, best: det.best, working: det.working, failed: det.failed || {}, drawtext: det.drawtext, filters: det.filters || {} }, null, 2));
  process.exit(det.best ? 0 : 1);
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = startAgent();
  a.ready.catch((e) => { console.error('[agent] démarrage impossible :', e.message); process.exit(1); });
  const stop = () => a.close().then(() => process.exit(0)); process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
