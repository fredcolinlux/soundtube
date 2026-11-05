// soundtube v1.16.0 — rendu MUSICAL sur l'agent (en plus de l'encodage vidéo).
// Le CT envoie les mêmes paramètres sérialisés que son propre worker ; l'agent exécute le même code moteur (vérifié par
// empreinte) avec le même pack d'échantillons (synchronisé depuis le CT, vérifié par SHA-1) et renvoie WAV + MIDI + ZIP MIDI
// + les métadonnées (loudness, rms, crête, niveaux de bus, pistes MIDI, forme d'onde, durée, temps de rendu, paramètres).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { engineId, AUDIO_PROTOCOL } from './engine-id.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Racine du moteur : core/ (zip de l'agent) sinon ../src (dépôt soundtube). */
export function engineRoot(over) {
  for (const r of [over, process.env.SOUNDTUBE_NODE_ENGINE, path.join(here, 'core'), path.join(here, '..', 'src')]) if (r && fs.existsSync(path.join(r, 'engine', 'render.js'))) return path.resolve(r);
  return null;
}
const SAFE_REL = /^[A-Za-z0-9_][A-Za-z0-9_.\- ]{0,80}(\/[A-Za-z0-9_][A-Za-z0-9_.\- ]{0,80}){0,3}$/;
export const safeRel = (p) => typeof p === 'string' && SAFE_REL.test(p) && !p.split('/').some((s) => s === '..' || s === '.');
const sha1File = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');

export function createAudio(cfg, log) {
  const root = engineRoot(cfg.engineRoot), engine = root ? engineId(root) : null;
  const sdir = path.resolve(cfg.samplesDir || path.join(cfg.workDir, 'samples'));
  fs.mkdirSync(sdir, { recursive: true });
  const idxFile = path.join(sdir, '.index.json');
  let index = null; try { index = JSON.parse(fs.readFileSync(idxFile, 'utf8')); } catch {}
  let plan = null; // synchronisation en cours : { hash, files: Map(path → { size, sha1 }) }
  const slots = Math.max(1, +cfg.audioSlots || 1), jobs = new Map(), waiting = []; let running = 0;
  const disabled = cfg.audio === false || String(cfg.audio) === 'false';
  const reason = disabled ? 'rendu musical désactivé dans config.json (audio=false)' : !root ? 'moteur absent (dossier core/ manquant : réinstaller l\'agent 1.16.0)' : null;

  const health = () => ({ ok: !reason, protocol: AUDIO_PROTOCOL, reason, engine: engine ? { hash: engine.hash, version: engine.version, files: engine.files } : null,
    samples: index ? { hash: index.hash, files: index.count } : null, slots, running, queued: waiting.length, node: process.version });

  function pump() {
    while (running < slots && waiting.length) {
      const j = waiting.shift(); if (j.status !== 'queued') continue;
      running++; j.status = 'running'; j.startedAt = Date.now();
      const w = new Worker(path.join(here, 'audio-worker.mjs'), {
        workerData: { root, params: j.params, wavPath: path.join(j.dir, 'out.wav'), midPath: path.join(j.dir, 'out.mid'), midZipPath: path.join(j.dir, 'out-midi.zip'), title: j.opts.title, zipBase: j.opts.zipBase, tags: j.opts.tags, loudness: j.opts.loudness },
        env: { ...process.env, SOUNDTUBE_SAMPLES: sdir, SOUNDTUBE_FFMPEG: cfg.ffmpeg }, resourceLimits: { maxOldGenerationSizeMb: 768 },
      });
      j.worker = w;
      const end = (status, extra = {}) => { if (j.status !== 'running') return; Object.assign(j, { status, endedAt: Date.now(), worker: null }, extra); running--; pump(); };
      w.on('message', (m) => {
        if (m.type === 'progress') Object.assign(j, { progress: Math.min(0.99, m.progress), stage: m.stage, eta: m.eta });
        else if (m.type === 'done') {
          const files = {}; for (const [k, f] of [['wav', 'out.wav'], ['mid', 'out.mid'], ['midzip', 'out-midi.zip']]) { const p = path.join(j.dir, f); if (fs.existsSync(p)) files[k] = { size: fs.statSync(p).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') }; }
          log(`[audio ${j.id}] terminé en ${((Date.now() - j.startedAt) / 1000).toFixed(1)} s (${Math.round(m.result.seconds)} s de musique)`);
          end('done', { progress: 1, stage: 'Terminé', result: m.result, files });
        } else if (m.type === 'error') { log(`[audio ${j.id}] erreur : ${String(m.error).split('\n')[0]}`); end('error', { error: String(m.error).slice(0, 1500) }); }
      });
      w.on('error', (e) => end('error', { error: String(e.message).slice(0, 800) }));
      w.on('exit', (c) => end(j.status === 'cancelled' ? 'cancelled' : 'error', { error: 'moteur arrêté (code ' + c + ')' }));
    }
  }
  function create(b) {
    if (reason) throw Object.assign(new Error('Rendu musical indisponible : ' + reason), { status: 503 });
    if (b.protocol !== AUDIO_PROTOCOL) throw Object.assign(new Error(`Protocole audio ${b.protocol} ≠ ${AUDIO_PROTOCOL} : mettre à jour l'agent`), { status: 409 });
    if (!b.engine || b.engine !== engine.hash) throw Object.assign(new Error(`Moteur différent : agent ${engine.version} (${engine.hash}), CT ${b.engineVersion || '?'} (${b.engine || '?'}). Réinstaller l'agent fourni avec cette version de soundtube : le morceau ne sonnerait pas pareil.`), { status: 409, code: 'engine-mismatch' });
    if (!index || b.samples !== index.hash) throw Object.assign(new Error('Échantillons pas synchronisés avec le CT'), { status: 409, code: 'samples' });
    if (!b.params || typeof b.params !== 'object') throw Object.assign(new Error('paramètres manquants'), { status: 400 });
    const id = crypto.randomBytes(8).toString('hex'), dir = path.join(cfg.workDir, 'job-' + id); fs.mkdirSync(dir);
    const o = b.opts || {};
    const j = { id, dir, kind: 'audio', params: b.params, opts: { title: String(o.title || '').slice(0, 200), zipBase: String(o.zipBase || 'soundtube').slice(0, 60), tags: o.tags && typeof o.tags === 'object' ? o.tags : {}, loudness: o.loudness === false ? false : o.loudness || undefined },
      status: 'queued', progress: 0, stage: 'En attente', eta: null, error: null, createdAt: Date.now() };
    jobs.set(id, j); waiting.push(j); pump();
    log(`[audio ${id}] créé (${j.params.style || '?'}, ${Math.round(+j.params.duration || 0)} s)`);
    return j;
  }
  const view = (j) => ({ id: j.id, status: j.status, progress: +(+j.progress).toFixed(4), stage: j.stage, eta: j.eta, error: j.error, position: waiting.indexOf(j), ...(j.status === 'done' ? { result: j.result, files: j.files } : {}) });
  const drop = (j) => { // annulation : libère le créneau (sinon le nœud resterait « occupé » pour toujours)
    if (j.status === 'running') { const w = j.worker; Object.assign(j, { status: 'cancelled', endedAt: Date.now(), worker: null }); running--; w?.terminate().catch(() => {}); setImmediate(pump); }
    else if (j.status === 'queued') { const i = waiting.indexOf(j); if (i >= 0) waiting.splice(i, 1); j.status = 'cancelled'; }
    jobs.delete(j.id); setTimeout(() => fs.rmSync(j.dir, { recursive: true, force: true }), 500); };

  // ---- synchronisation du pack d'échantillons
  function samplesPlan(b) {
    if (!b || typeof b.hash !== 'string' || !Array.isArray(b.files)) throw Object.assign(new Error('plan invalide'), { status: 400 });
    const files = new Map(), need = [];
    for (const f of b.files) {
      if (!safeRel(f.path) || !(f.size >= 0) || !/^[0-9a-f]{40}$/.test(f.sha1 || '')) throw Object.assign(new Error('chemin refusé : ' + String(f.path).slice(0, 80)), { status: 400 });
      files.set(f.path, f); const p = path.join(sdir, f.path), st = fs.statSync(p, { throwIfNoEntry: false });
      const known = index?.files?.[f.path];
      if (!st || st.size !== f.size || !(known === f.sha1 || (!known && sha1File(p) === f.sha1))) need.push(f.path);
    }
    plan = { hash: b.hash, files }; return { need, have: files.size - need.length };
  }
  async function samplesPut(rel, req) {
    const f = plan?.files.get(rel); if (!f) throw Object.assign(new Error('fichier non prévu'), { status: 400 });
    const dst = path.join(sdir, rel), tmp = dst + '.part'; fs.mkdirSync(path.dirname(dst), { recursive: true });
    const h = crypto.createHash('sha1'), out = fs.createWriteStream(tmp); let n = 0;
    await new Promise((ok, ko) => { req.on('data', (d) => { n += d.length; h.update(d); if (n > f.size) { req.destroy(); ko(Object.assign(new Error('taille dépassée'), { status: 400 })); } }); req.pipe(out); out.on('finish', ok); out.on('error', ko); req.on('error', ko); });
    if (n !== f.size || h.digest('hex') !== f.sha1) { fs.rmSync(tmp, { force: true }); throw Object.assign(new Error('fichier corrompu pendant l\'envoi'), { status: 400 }); }
    fs.renameSync(tmp, dst); return { ok: true };
  }
  function samplesCommit() {
    if (!plan) throw Object.assign(new Error('aucune synchronisation en cours'), { status: 409 });
    const files = {};
    for (const [p, f] of plan.files) { const st = fs.statSync(path.join(sdir, p), { throwIfNoEntry: false }); if (!st || st.size !== f.size) throw Object.assign(new Error('fichier manquant : ' + p), { status: 409 }); files[p] = f.sha1; }
    index = { hash: plan.hash, count: plan.files.size, files, at: new Date().toISOString() };
    fs.writeFileSync(idxFile, JSON.stringify(index)); plan = null;
    log(`[audio] échantillons synchronisés (${index.count} fichiers, ${index.hash.slice(0, 12)})`);
    return { ok: true, hash: index.hash, files: index.count };
  }
  const close = () => { for (const j of [...jobs.values()]) drop(j); };
  return { health, create, view, drop, jobs, samplesPlan, samplesPut, samplesCommit, close, engine, root };
}
