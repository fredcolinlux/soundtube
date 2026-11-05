// Tests v1.16.0 : rendu de la musique sur un nœud (PC Windows), routage par durée et seuil, refus d'un moteur différent,
// repli sur le CT, option combinée musique + vidéo sur le PC, ZIP unique.
// Nœud SIMULÉ : un proxy HTTP local devant un agent en mémoire, qui injecte les pannes (rendu musical, vidéo en cours).
// Aucun appel réseau externe ; YouTube en transport mock.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v1160-'));
process.env.SOUNDTUBE_DATA_DIR = path.join(tmp, 'unit-data');
const { JobQueue } = await import('../src/jobs.js');
const { RenderNodes, CT_ENGINE } = await import('../src/nodes.js');
const { config } = await import('../src/config.js');
const { startAgent } = await import('../node-agent/agent.mjs');
const RC = await import('../node-agent/render-core.mjs');
const { engineId } = await import('../node-agent/engine-id.mjs');

let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

// ---------- 1. versions : agent 1.16.0, SPEC_VERSION 2, empreinte du moteur
{
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'node-agent/package.json'), 'utf8'));
  check(+pkg.version.split('.')[1] >= 16 && RC.SPEC_VERSION === 2, `agent ≥ 1.16.0, SPEC_VERSION 2 (${pkg.version}, ${RC.SPEC_VERSION})`);
  check(CT_ENGINE.hash === engineId(path.join(ROOT, 'src')).hash && /^[0-9a-f]{12}$/.test(CT_ENGINE.hash), `empreinte du moteur du CT : ${CT_ENGINE.version} · ${CT_ENGINE.hash}`);
}

// ---------- 2. routage (unitaire) : durée, seuil, saturation, option combinée, repli
{
  const node = { id: 'pc', name: 'PC' };
  let avail = true, freeSlot = true;
  const N = { s: { audioMinSec: 900 }, audioNode: (o = {}) => (avail && (!o.free || freeSlot) ? node : null), st: () => ({}) };
  const q = new JobQueue({ get: () => null }, path.join(tmp, 'unit-tracks'), N);
  const T = (duration, meta = {}, id = 't' + duration) => ({ id, params: { duration }, meta });
  const R = (t) => { const r = q.route(t); return r ? (r.local ? 'ct:' + r.reason : 'pc:' + r.reason) : 'attente'; };
  check(R(T(900)) === 'pc:long' && R(T(3600)) === 'pc:long', '15 min ou plus → PC en priorité');
  check(R(T(899)) === 'ct:court' && R(T(120)) === 'ct:court', 'moins de 15 min → reste sur le CT');
  N.s.audioMinSec = 300;
  check(R(T(600)) === 'pc:long' && R(T(299)) === 'ct:court', 'seuil global réglé à 5 min : 10 min → PC, 4 min 59 → CT');
  N.s.audioMinSec = 900;
  check(R(T(60, { pcCombo: true })) === 'pc:combo', 'option combinée : PC quelle que soit la durée');
  q.localRunning = config.maxConcurrentJobs;
  check(R(T(120)) === 'pc:sature', 'CT saturé : un morceau court part sur un PC libre');
  freeSlot = false; check(R(T(120)) === 'attente', 'CT saturé et PC occupé : attente');
  q.localRunning = 0; freeSlot = true;
  avail = false; check(R(T(3600)) === 'ct:long-sans-pc' && R(T(60, { pcCombo: true })) === 'ct:combo-sans-pc', 'aucun PC capable : tout reste sur le CT');
  avail = true; q.forceLocal.set('t3600', 'PC : panne');
  check(R(T(3600)) === 'ct:fallback', 'après une panne du nœud : rendu forcé sur le CT');
  const q0 = new JobQueue({ get: () => null }, path.join(tmp, 'unit-tracks'), null);
  check(q0.route(T(3600)).local === true, 'sans gestionnaire de nœuds : CT');
}

// ---------- 3. capacité audio et refus d'un moteur différent
const agentWork = path.join(tmp, 'agent');
const agent = startAgent({ port: 0, host: '127.0.0.1', workDir: agentWork, discovery: false, quiet: true, slots: 1, detected: { working: ['libx264'], best: 'libx264', listed: ['libx264'], failed: {}, ffmpeg: 'ffmpeg' } });
const agentPort = await agent.ready;
{
  const h = await fetch(`http://127.0.0.1:${agentPort}/health`).then((r) => r.json());
  check(+h.version.split('.')[1] >= 16 && h.audio?.ok && h.audio.engine.hash === CT_ENGINE.hash && h.audio.protocol === 1, `agent : capacité audio annoncée, moteur ${h.audio?.engine?.version} · ${h.audio?.engine?.hash}`);
  const r = await fetch(`http://127.0.0.1:${agentPort}/audio`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ protocol: 1, engine: 'deadbeef0000', engineVersion: '1.15.0', params: { style: 'lofi', duration: 20 } }) });
  const b = await r.json();
  check(r.status === 409 && /Moteur différent/.test(b.error) && /Réinstaller/i.test(b.error), `moteur différent refusé par l'agent (HTTP ${r.status}) : « ${String(b.error).slice(0, 90)}… »`);
  fs.mkdirSync(path.join(tmp, 'n1'), { recursive: true }); const N = new RenderNodes({ dataDir: path.join(tmp, 'n1'), autostart: false });
  const n = N.add({ url: `http://127.0.0.1:${agentPort}` }); await N.check(n);
  check(N.audioState(n).capable === true, 'CT : agent au même moteur → capable');
  N.st(n.id).health.audio.engine = { hash: 'deadbeef0000', version: '1.15.0' };
  const s = N.audioState(n);
  check(!s.capable && /moteur différent/.test(s.reason) && !N.audioNode(), `CT : moteur différent → musique refusée (${s.reason.slice(0, 60)}…)`);
  N.st(n.id).health.audio = undefined; N.st(n.id).health.version = '1.15.0';
  check(/réinstaller l'agent 1\.[0-9]+/.test(N.audioState(n).reason), 'agent 1.15 : vidéo seulement, réinstallation demandée');
  await N.check(n); N.update(n.id, { audio: false });
  check(!N.audioState(n).capable && /désactivé dans Admin/.test(N.audioState(n).reason), 'interrupteur Admin : musique désactivée sur ce nœud');
  N.setRender({ audioMinSec: 1200 }); check(N.view().audioMinSec === 1200, 'seuil global enregistré (20 min)');
  N.close?.();
}

// ---------- 4. de bout en bout : serveur + nœud simulé (proxy à pannes devant l'agent)
let mode = 'ok', audioPolls = 0, videoPolls = 0;
const proxy = http.createServer((req, res) => {
  const u = req.url;
  if (mode === 'failAudio' && req.method === 'GET' && /^\/audio\/[^/]+$/.test(u) && ++audioPolls >= 2) { req.socket.destroy(); return; }
  if (mode === 'failVideo' && req.method === 'GET' && /^\/jobs\/[^/]+$/.test(u) && ++videoPolls >= 2) { req.socket.destroy(); return; }
  const p = http.request({ host: '127.0.0.1', port: agentPort, path: u, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  p.on('error', () => res.destroy()); req.pipe(p);
}).listen(0, '127.0.0.1');
await new Promise((r) => proxy.once('listening', r));
const nodeUrl = `http://127.0.0.1:${proxy.address().port}`;

const port = await freePort(), base = `http://127.0.0.1:${port}`, dataDir = path.join(tmp, 'data');
const srv = spawn(process.execPath, ['src/server.js'], { cwd: ROOT, env: { ...process.env, SOUNDTUBE_DATA_DIR: dataDir, SOUNDTUBE_PORT: String(port), SOUNDTUBE_YT_TRANSPORT: 'mock', SOUNDTUBE_OLLAMA_URL: 'http://127.0.0.1:9' }, stdio: ['ignore', 'pipe', 'pipe'] });
let srvLog = ''; srv.stdout.on('data', (d) => { srvLog += d; }); srv.stderr.on('data', (d) => { srvLog += d; });
const api = async (m, p, body) => { const r = await fetch(base + p, { method: m, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${j.error || ''}`); return j; };
const waitTrack = async (id, ms = 240000) => { const t0 = Date.now(); for (;;) { const t = await api('GET', `/api/jobs/${id}`); if (t.status === 'done' || t.status === 'error') return t; if (Date.now() - t0 > ms) throw new Error(`délai dépassé ${id} (${t.status}, ${t.stage})`); await sleep(500); } };
const waitPack = async (id, ms = 300000) => { const t0 = Date.now(); for (;;) { const p = await api('GET', `/api/tracks/${id}/pack`).catch(() => null); const s = p?.state; if (s?.status === 'done' || s?.status === 'error') return p; if (Date.now() - t0 > ms) throw new Error('paquet : délai dépassé'); await sleep(800); } };
const zipList = (f) => spawnSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print("\\n".join(z.namelist()))', f], { encoding: 'utf8' });
const getZip = async (url, name) => { const f = path.join(tmp, name); fs.writeFileSync(f, Buffer.from(await (await fetch(base + url)).arrayBuffer())); const r = zipList(f); return { ok: r.status === 0, names: r.stdout.trim().split('\n') }; };
const PACK = { video: true, videoRes: '720p', pieces: true, wav: true, midi: true, txt: true };

try {
  for (let i = 0; i < 80; i++) { try { await api('GET', '/api/admin/nodes'); break; } catch { await sleep(250); } }
  const v0 = await api('POST', '/api/admin/nodes', { url: nodeUrl, name: 'PC Test' });
  const nv = v0.nodes[0];
  check(nv.audio?.capable && nv.audio.engine.hash === CT_ENGINE.hash && v0.audioMinSec === 900, `Admin : nœud capable (moteur ${nv.audio?.engine?.version} · ${nv.audio?.engine?.hash}), seuil 15 min par défaut`);

  // 4a. morceau court : reste sur le CT
  const a = await api('POST', '/api/generate', { style: 'lofi', duration: 20, seed: 11, wav: true });
  const ta = await waitTrack(a.id);
  check(ta.status === 'done' && ta.meta?.render?.where === 'ct' && ta.meta.render.reason === 'court', `morceau de 20 s : rendu sur le CT (${ta.meta?.render?.where}/${ta.meta?.render?.reason})`);

  // 4b. option combinée : musique + vidéo sur le PC, ZIP unique
  const b = await api('POST', '/api/generate', { style: 'cinematic', duration: 20, seed: 12, wav: true, pcCombo: true, pack: PACK });
  const tb = await waitTrack(b.id);
  check(tb.status === 'done' && tb.meta?.render?.where === 'node' && tb.meta.render.reason === 'combo' && tb.meta.render.node === 'PC Test', `option combinée : musique rendue sur « ${tb.meta?.render?.node} » (${tb.meta?.render?.reason})`);
  const pb = await waitPack(b.id);
  check(pb.state.status === 'done' && pb.render?.where === 'node', `ZIP unique prêt sans clic (${pb.state.status}, ${pb.state.url})`);
  const zb = await getZip(pb.state.url, 'combo.zip');
  const has = (names, re) => names.some((n) => re.test(n));
  check(zb.ok && has(zb.names, /\/video\/.+\.mp4$/) && has(zb.names, /\/mix\/.+\.mp3$/) && has(zb.names, /\/mix\/.+\.wav$/) && has(zb.names, /\.mid$/) && has(zb.names, /manifest\.json$/) && has(zb.names, /LISEZMOI\.txt$/), `ZIP : vidéo longue, mix MP3 + WAV, MIDI, manifest.json, LISEZMOI.txt (${zb.names.length} fichiers)`);
  const man = JSON.parse(spawnSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.read([n for n in z.namelist() if n.endswith("manifest.json")][0]).decode())', path.join(tmp, 'combo.zip')], { encoding: 'utf8' }).stdout);
  check(man.render?.music?.where === 'pc' && man.render.music.combo && man.render.video === 'PC Test', `manifest.json : musique sur le PC, vidéo sur « ${man.render?.video} »`);
  const v1 = await api('GET', '/api/admin/nodes');
  const hist = v1.nodes[0].history || [];
  check(hist.some((h) => h.kind === 'audio' && h.trackId === b.id && h.status === 'done') && hist.some((h) => h.kind === 'video' && h.trackId === b.id && h.status === 'done'), 'historique du nœud : musique et vidéo du même morceau sur le PC');

  // 4c. seuil : 1 min → un morceau de 60 s part sur le PC
  await api('PUT', '/api/admin/render', { audioMinSec: 60 });
  const c = await api('POST', '/api/generate', { style: 'ambient', duration: 60, seed: 13, wav: true });
  const tc = await waitTrack(c.id);
  check(tc.status === 'done' && tc.meta?.render?.where === 'node' && tc.meta.render.reason === 'long', `seuil à 1 min : morceau de 60 s rendu sur le PC (${tc.meta?.render?.where}/${tc.meta?.render?.reason})`);
  await api('PUT', '/api/admin/render', { audioMinSec: 900 });

  // 4d. panne du nœud pendant le rendu musical : repli sur le CT, annoncé
  mode = 'failAudio'; audioPolls = 0;
  const d = await api('POST', '/api/generate', { style: 'lofi', duration: 20, seed: 14, wav: true, pcCombo: true, pack: PACK });
  let sawStage = false; for (let i = 0; i < 400; i++) { const t = await api('GET', `/api/jobs/${d.id}`); if (/rendu repris sur le CT|Repris sur le CT \(PC en panne\)/.test(t.stage || '')) sawStage = true; if (t.status === 'done' || t.status === 'error') break; await sleep(150); }
  const td = await waitTrack(d.id);
  check(td.status === 'done' && td.meta?.render?.where === 'ct' && !!td.meta.render.fallback, `panne pendant la musique : rendu repris sur le CT (${String(td.meta?.render?.fallback).slice(0, 60)})`);
  check(sawStage, 'statut du job : « Repris sur le CT (PC en panne) — … »');
  mode = 'ok';
  const pd = await waitPack(d.id);
  const zd = await getZip(pd.state.url, 'fallback-audio.zip');
  check(pd.state.status === 'done' && zd.ok && has(zd.names, /\.mp4$/), 'ZIP complet après repli (vidéo rendue normalement)');

  // 4e. panne du nœud pendant la vidéo combinée : la vidéo repart sur le CT, ZIP intact
  for (let i = 0; i < 60; i++) { const v = await api('GET', '/api/admin/nodes'); if (v.nodes[0].up) break; await api('POST', '/api/admin/nodes/check', {}).catch(() => {}); await sleep(500); }
  mode = 'failVideo'; videoPolls = 0;
  const e = await api('POST', '/api/generate', { style: 'synthwave', duration: 20, seed: 15, wav: true, pcCombo: true, pack: PACK });
  const te = await waitTrack(e.id);
  const pe = await waitPack(e.id); mode = 'ok';
  const ze = await getZip(pe.state.url, 'fallback-video.zip');
  check(te.meta?.render?.where === 'node' && pe.state.status === 'done' && ze.ok && has(ze.names, /\/video\/.+\.mp4$/) && has(ze.names, /\/mix\/.+\.wav$/), `panne pendant la vidéo : musique du PC, vidéo reprise ailleurs, ZIP valide (${ze.names.length} fichiers)`);
  const ve = (await api('GET', '/api/admin/nodes')).history || [];
  check(ve.some((h) => h.kind === 'video' && h.trackId === e.id && h.status === 'error') && ve.some((h) => h.kind === 'video' && h.trackId === e.id && (h.status === 'fallback' || (h.status === 'done' && !h.node))), 'historique : vidéo en échec sur le PC puis rendue sur le CT');
  // ZIP déjà construit (4b) jamais touché par la suite
  const zb2 = await getZip(pb.state.url, 'combo-again.zip');
  check(zb2.ok && zb2.names.join() === zb.names.join(), 'ZIP déjà construit inchangé après la panne');
} catch (err) {
  check(false, 'exception : ' + err.message); console.log(srvLog.split('\n').slice(-30).join('\n'));
} finally {
  if (fail) try { console.log(JSON.stringify((await api('GET', '/api/admin/nodes')).nodes.map((n) => ({ up: n.up, audio: n.audio, err: n.error })))); } catch {}
  srv.kill('SIGTERM'); proxy.close(); await agent.close();
  await sleep(300); fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} échec(s)` : '\nv1.16.0 : tous les tests passent');
process.exit(fail ? 1 : 0);
