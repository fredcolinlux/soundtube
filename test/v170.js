// Tests v1.7.0 : nœuds de rendu (agent, répartition, panne, santé), API Admin, préréglage 15 min, mix ≥ 1 h contrastés.
// node test/v170.js   (--no-api : sans serveur ; --quick : sans les rendus vidéo parallèles)
// Simulation locale : l'agent tourne sur cette machine en libx264 ; les nœuds « NVENC », « lents » et « morts » sont simulés.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v170-'));
process.env.SOUNDTUBE_DATA_DIR = path.join(tmp, 'unit-data');
const M = await import('../src/engine/mix.js');
const C = await import('../src/engine/composer.js');
const RC = await import('../node-agent/render-core.mjs');
const { startAgent } = await import('../node-agent/agent.mjs');
const { RenderNodes, normUrl } = await import('../src/nodes.js');
const Y = await import('../src/youtube.js');

let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const md5v = (f) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-map', '0:v', '-f', 'md5', '-']).toString().trim();
const quiet = { error() {}, log() {} };

// ---------- préréglage 15 min
{
  const app = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
  check(/\[900, '15 min'\]/.test(app) && app.indexOf("[600, '10 min']") < app.indexOf("[900, '15 min']") && app.indexOf("[900, '15 min']") < app.indexOf("[3600, '1 h']"), 'préréglage de durée « 15 min » (entre 10 min et 1 h)');
  const P = C.resolveParams({ style: 'lofi', seed: 9, duration: 900 });
  check(P.duration === 900, 'durée 900 s acceptée telle quelle');
  const m = M.planMix({ style: 'house', seed: 9, duration: 900, adv: { mix: 'on' } });
  const sec = m.tempo.sec(m.totalBeats);
  check(Math.abs(sec - 900) < 12, `mix forcé de 15 min : ${sec.toFixed(0)} s, ${m.decks.length} titres`);
}

// ---------- mix ≥ 1 h : titres nettement distincts (Moyenne comprise)
{
  const ATTR = ['bpm', 'key', 'chords', 'lead', 'bass', 'kit', 'groove', 'prog', 'struct'];
  const feats = (m) => m.decks.map((d) => { const p = M.deckPlan(d); return { bpm: d.bpm, key: d.camelot, chords: p.S.patches.chords, lead: p.S.patches.lead, bass: p.S.patches.bass, kit: p.S.drums.kit, groove: JSON.stringify(p.S.drums.A?.[0] ?? p.S.drums.kind), prog: p.meta.progressions.A.join(' '), struct: p.params.adv.structure || 'auto', energy: d.energy, aligned: p.totalBars === d.bars * (d.ratio || 1) }; });
  const diff = (a, b) => ATTR.filter((k) => (k === 'bpm' ? Math.abs(a.bpm / b.bpm - 1) >= 0.025 : a[k] !== b[k])).length;
  const t0 = Date.now(); let worst = 99, sum = 0, n = 0, sameKey = 0, smallE = 0, mis = 0, keyRep = 0;
  for (const style of ['hiphop', 'lofi', 'house', 'techno', 'dnb', 'synthwave']) for (const seed of [3, 42]) {
    const F = feats(M.planMix({ style, seed, duration: 3600 }));
    for (let i = 1; i < F.length; i++) { const d = diff(F[i - 1], F[i]); worst = Math.min(worst, d); sum += d; n++; if (F[i].key === F[i - 1].key) sameKey++; if (Math.abs(F[i].energy - F[i - 1].energy) < 0.09) smallE++; }
    mis += F.filter((f) => !f.aligned).length;
  }
  const ms = Date.now() - t0;
  check(sum / n >= 7.5 && worst >= 5, `Moyenne, 1 h : attributs changés entre titres consécutifs ${(sum / n).toFixed(1)}/9 en moyenne (min ${worst}) — v1.6.3 : ~4,5/9 (min 2)`);
  check(sameKey === 0, `Moyenne, 1 h : jamais deux titres consécutifs dans la même tonalité (${sameKey})`);
  check(smallE === 0, `Moyenne, 1 h : écart d'énergie ≥ 0,09 entre titres consécutifs (${smallE} exceptions)`);
  check(mis === 0, 'mesures de chaque titre = mesures prévues (transitions calées)');
  check(ms < 15000, `planification de 12 mix d'1 h + plans de titres : ${ms} ms`);
  const H = M.planMix({ style: 'hiphop', seed: 3, duration: 3600 });
  const subs = H.decks.map((d) => d.style); check(subs.every((s) => s === 'hiphop' || s === 'lofi' || s === 'trap'), 'mix hip-hop : reste dans le style (ou styles proches autorisés)');
  const bp = H.decks.map((d) => d.bpm), span = Math.max(...bp) / Math.min(...bp);
  check(span > 1.05 && H.decks.every((d, i) => !i || Math.abs(d.bpm / H.decks[i - 1].bpm - 1) <= 0.08), `tempos variés mais mixables : ${bp.join(' → ')} BPM (écart consécutif ≤ 8 %, plage de pitch d’une platine)`);
  const L = feats(M.planMix({ style: 'hiphop', seed: 3, duration: 3600, variety: 'low' })), X = feats(M.planMix({ style: 'hiphop', seed: 3, duration: 3600, variety: 'max' }));
  const avg = (F) => F.slice(1).reduce((a, f, i) => a + diff(F[i], f), 0) / (F.length - 1);
  check(avg(L) < sum / n && avg(X) >= 7.5, `Variation respectée : Faible ${avg(L).toFixed(1)} < Moyenne ${(sum / n).toFixed(1)} ≤ Maximale ${avg(X).toFixed(1)}`);
  const P1 = M.planMix({ style: 'lofi', seed: 77, duration: 3600, adv: { chordPatch: 'rhodes' } });
  check(P1.decks.every((d) => d.params.adv.chordPatch === 'rhodes'), 'un réglage choisi par l’utilisateur (son d’accords) n’est jamais remplacé');
  const S1 = JSON.stringify(M.planMix({ style: 'techno', seed: 5, duration: 3600 }).tracklist), S2 = JSON.stringify(M.planMix({ style: 'techno', seed: 5, duration: 3600 }).tracklist);
  check(S1 === S2, 'même graine => même mix (déterministe)');
}

// ---------- spec portable : contrôles de sécurité de l'agent
{
  const base = { v: RC.SPEC_VERSION, dur: 5, fps: 24, res: '720p', crf: 27, preset: 'veryfast', inputs: ['-loop', '1', '-framerate', '24', '-i', 'bg.png', '-i', 'audio.wav'], graph: '[0:v]null[v]', files: [{ name: 'bg.png', size: 1 }, { name: 'audio.wav', size: 1 }] };
  const bad = (o) => { try { RC.validateSpec({ ...base, ...o }); return false; } catch { return true; } };
  check(!bad({}), 'spec valide accepté');
  check(bad({ inputs: ['-i', '/etc/passwd'] }) && bad({ inputs: ['-f', 'lavfi', '-i', 'bg.png'] }) && bad({ files: [{ name: '../x', size: 1 }] }), 'spec refusé : chemin absolu, option non prévue, nom de fichier hors dossier');
  check(bad({ graph: "movie='/etc/passwd'[v]" }) && bad({ graph: "[0:v]drawtext=fontfile='/etc/fonts/x.ttf':text=a[v]" }), 'spec refusé : filtre movie=, police hors job');
  const libx = RC.encoderArgs('libx264', { fps: 24, crf: 26, res: '1080p', preset: 'veryfast' }).join(' ');
  check(libx === '-c:v libx264 -preset veryfast -crf 26 -g 240 -pix_fmt yuv420p', 'libx264 : réglages identiques au CT');
  check(RC.encoderArgs('h264_nvenc', { fps: 24, crf: 26, res: '1080p' }).join(' ').includes('-c:v h264_nvenc -preset p5'), 'NVENC : preset p5, débit variable à qualité constante');
  check(normUrl('10.0.0.50:8765') === 'http://10.0.0.50:8765' && normUrl('http://a:b@x') === null && normUrl('') === null, 'normalisation des adresses de nœud');
}

// ---------- nœuds simulés
function fakeNode({ best = 'h264_nvenc', slots = 2, delayMs = 0, token = '', mode = 'ok' } = {}) {
  const srv = http.createServer(async (req, res) => {
    if (delayMs) await sleep(delayMs);
    if (token && req.headers.authorization !== 'Bearer ' + token) { res.writeHead(401); return res.end('{"error":"jeton"}'); }
    if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ app: 'soundtube-node', spec: RC.SPEC_VERSION, version: '1.16.0', name: 'fake-' + best, best, encoders: [best], slots, running: 0 })); }
    if (mode === 'dies' && req.method === 'POST' && req.url === '/jobs') { res.writeHead(201, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ id: '0123456789abcdef', encoder: best, need: [] })); }
    if (mode === 'dies' && req.url.endsWith('/start')) { res.writeHead(202, { 'content-type': 'application/json' }); res.end('{"status":"queued"}'); setTimeout(() => { srv.closeAllConnections?.(); srv.close(); }, 50); return; } // « meurt » en plein rendu
    if (mode === 'dies' && req.method === 'GET' && /^\/jobs\/[0-9a-f]+$/.test(req.url)) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"status":"running","progress":0.1}'); }
    if (mode === 'ffmpegerror' && req.method === 'POST' && req.url === '/jobs') { res.writeHead(201, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ id: 'fedcba9876543210', encoder: best, need: [] })); }
    if (mode === 'ffmpegerror' && req.url.endsWith('/start')) { res.writeHead(202, { 'content-type': 'application/json' }); return res.end('{"status":"queued"}'); }
    if (mode === 'ffmpegerror' && /^\/jobs\/[0-9a-f]+$/.test(req.url) && req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"status":"error","error":"No NVENC capable devices found"}'); }
    res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"?"}');
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, url: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((ok) => { srv.closeAllConnections?.(); srv.close(() => ok()); }) })));
}

// petit morceau de test (6 s, sinus) : le rendu vidéo ne dépend que de l'audio et des métadonnées
const wav = path.join(tmp, 'a.wav');
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=6:sample_rate=48000', '-ac', '2', wav]);
const T = { id: 'test', title: 'Essai de rendu', style: 'lofi', duration: 6, params: { style: 'lofi', duration: 6, bpm: 80, key: 'C', scale: 'minor' }, meta: { sections: [{ startBar: 0, label: 'Intro' }] }, waveform: Array.from({ length: 64 }, (_, i) => (i % 8) / 8) };

const nodes = [];
try {
  // santé, jeton
  const A = startAgent({ port: 0, discovery: true, discoveryPort: await freePort(), quiet: true, workDir: path.join(tmp, 'agentA'), name: 'agent-A', configFile: '/nonexistent' }); nodes.push(A);
  const A2 = startAgent({ port: 0, discovery: false, quiet: true, workDir: path.join(tmp, 'agentB'), name: 'agent-lent', token: 'secret', delayMs: 120, configFile: '/nonexistent' }); nodes.push(A2);
  const pA = await A.ready, pB = await A2.ready, uA = `http://127.0.0.1:${pA}`, uB = `http://127.0.0.1:${pB}`;
  const h = A.health();
  check(h.ok && h.encoders.includes('libx264') && h.best && h.slots >= 1, `agent : encodeurs détectés (ffmpeg -encoders + mini-encodage) → ${h.encoders.join(', ')} ; choisi ${h.best}`);
  check(!h.encoders.includes('h264_nvenc') || process.env.ST_HAS_NVIDIA, 'agent : NVENC listé par ffmpeg mais sans carte => écarté (mini-encodage en échec)');

  const N = new RenderNodes({ autostart: false, pollMs: 200, log: quiet });
  const dead = 'http://127.0.0.1:' + (await freePort());
  N.add({ url: uA, name: 'A' }); N.add({ url: dead, name: 'mort' }); const nb = N.add({ url: uB, name: 'lent' });
  await N.checkAll();
  let v = N.view();
  check(v.nodes.find((n) => n.name === 'A').status === 'up' && v.nodes.find((n) => n.name === 'mort').status === 'down', 'santé : nœud en ligne / nœud mort détectés');
  check(v.nodes.find((n) => n.name === 'lent').status === 'down' && /jeton/.test(v.nodes.find((n) => n.name === 'lent').error), 'jeton : refusé sans jeton (401)');
  N.update(nb.id, { token: 'secret' }); await N.checkAll(); v = N.view();
  const lent = v.nodes.find((n) => n.name === 'lent'), fa = v.nodes.find((n) => n.name === 'A');
  check(lent.status === 'up' && lent.latency > fa.latency, `jeton accepté ; latence mesurée (A ${fa.latency} ms, lent ${lent.latency} ms)`);

  // découverte UDP
  const found = await N.discover({ port: A.cfg.discoveryPort, targets: ['127.0.0.1'], timeout: 800 });
  check(found.some((f) => f.name === 'agent-A' && f.url === `http://127.0.0.1:${pA}` && f.known), 'découverte UDP : agent trouvé sur le réseau local');

  // choix : NVENC > VideoToolbox > libx264 ; latence ; emplacements ; désactivé ; forcé ; CT en secours
  const fN = await fakeNode({ best: 'h264_nvenc', slots: 2 }), fV = await fakeNode({ best: 'h264_videotoolbox', slots: 1 }); nodes.push(fN, fV);
  const S = new RenderNodes({ autostart: false, log: quiet });
  const nA = S.add({ url: uA, name: 'x264' }), nV = S.add({ url: fV.url, name: 'vt' }), nN = S.add({ url: fN.url, name: 'nvenc' });
  await S.checkAll();
  const a1 = S.tryAcquire(), a2 = S.tryAcquire(), a3 = S.tryAcquire(), a4 = S.tryAcquire(), a5 = S.tryAcquire();
  check(a1?.node?.name === 'nvenc' && a2?.node?.name === 'nvenc' && a3?.node?.name === 'vt' && a4?.node?.name === 'x264' && a5 === null,
    `ordre : PC NVENC (2 emplacements) → VideoToolbox → libx264 → attente (${[a1, a2, a3, a4].map((x) => x?.node?.name).join(', ')}, puis ${a5 ? 'autre' : 'attente'})`);
  const waited = S.acquire(); a3.release(); const w = await Promise.race([waited, sleep(300).then(() => null)]);
  check(w?.node?.name === 'vt', 'un emplacement libéré est aussitôt attribué à la vidéo en attente');
  for (const s of [a1, a2, a4, w]) s.release();
  S.update(nN.id, { enabled: false }); await sleep(50);
  const b1 = S.tryAcquire(); check(b1?.node?.name === 'vt', 'nœud désactivé : ignoré'); b1.release();
  S.update(nN.id, { enabled: true }); S.setRender({ forceUrl: uA }); await S.checkAll();
  const b2 = S.tryAcquire(), b3 = S.tryAcquire(); check(b2?.node?.name === 'x264' && b3 === null, 'nœud forcé : seul ce nœud est utilisé'); b2.release();
  S.setRender({ forceUrl: dead }); await S.checkAll();
  const b4 = S.tryAcquire(); check(b4?.local === true, 'nœud forcé hors ligne : le CT prend le relais'); b4.release();
  S.setRender({ forceUrl: null, localMode: 'parallel' });
  const p1 = S.tryAcquire(), p2 = S.tryAcquire(), p3 = S.tryAcquire(), p4 = S.tryAcquire(), p5 = S.tryAcquire();
  check([p1, p2, p3, p4, p5].filter((x) => x?.local).length === 1, 'CT « en parallèle » : utilisé en plus des nœuds (en dernier)');
  for (const s of [p1, p2, p3, p4, p5]) s?.release();

  // rendu sur l'agent = rendu local (même spec, mêmes images)
  const dir = fs.mkdtempSync(path.join(tmp, 'job-'));
  const job = await Y.prepareVideo(T, wav, dir, { resolution: '720p' });
  // mix de 32 s à 3 chapitres : textes de chapitre dessinés avec les polices livrées
  const wav32 = path.join(tmp, 'b.wav'); execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=32:sample_rate=48000', '-ac', '2', wav32]);
  const T32 = { ...T, title: 'Mix d’essai', duration: 32, meta: { mix: { count: 3, decks: [{ start: 0, name: 'Premier titre', camelot: '8A', bpm: 90 }, { start: 11, name: 'Deuxième', camelot: '9A', bpm: 93 }, { start: 21.5, name: 'Troisième', camelot: '10A', bpm: 96 }] } } };
  const dir32 = fs.mkdtempSync(path.join(tmp, 'job32-')), job32 = await Y.prepareVideo(T32, wav32, dir32, { resolution: '720p' });
  const names = job32.spec.files.map((f) => f.name);
  check(names.includes('bg.png') && names.includes('font-sans.woff2') && names.filter((n) => /^tx\d+\.txt$/.test(n)).length === 3 && job32.spec.graph.includes("fontfile='font-sans.woff2'") && !job32.spec.graph.includes(ROOT) && !job32.spec.graph.includes(os.tmpdir()) && !job32.spec.inputs.some((x) => String(x).includes('/')),
    `spec portable : uniquement des noms relatifs ; fond, polices et textes des chapitres livrés (${names.join(', ')})`);
  RC.validateSpec(job32.spec);
  const L = path.join(tmp, 'local.mp4'), R = path.join(tmp, 'remote.mp4');
  await Y.localExec({ ...job32, dir: dir32, outFile: L });
  const N1 = new RenderNodes({ autostart: false, pollMs: 200, log: quiet }); N1.add({ url: uA }); await N1.checkAll();
  const rr = await N1.run({ ...job32, dir: dir32, outFile: R }, Y.localExec);
  check(rr.node === uA && fs.statSync(R).size > 10000, `rendu sur l'agent : MP4 rapatrié (${(fs.statSync(R).size / 1e3).toFixed(0)} ko, ${rr.encoder})`);
  check(md5v(L) === md5v(R), 'agent libx264 : images identiques au rendu du CT (textes, chapitres, positions, polices, spectre, barre)');
  const L6 = path.join(tmp, 'local6.mp4'); await Y.localExec({ ...job, dir, outFile: L6 });

  // panne en plein rendu, erreur ffmpeg, puis secours CT
  const fD = await fakeNode({ best: 'h264_nvenc', mode: 'dies' }), fE = await fakeNode({ best: 'h264_nvenc', mode: 'ffmpegerror' }); nodes.push(fD, fE);
  const F = new RenderNodes({ autostart: false, pollMs: 100, log: quiet }); F.add({ url: fD.url, name: 'meurt' }); F.add({ url: uA, name: 'A' }); await F.checkAll();
  const R2 = path.join(tmp, 'r2.mp4'); let slots = [];
  const r2 = await F.run({ ...job, dir, outFile: R2 }, Y.localExec, { onSlot: (s) => slots.push(s.name) });
  check(r2.node === uA && r2.retries === 1 && slots.join('>') === 'meurt>A' && F.view().nodes.find((n) => n.name === 'meurt').status === 'down', `nœud mort en plein rendu : reprise sur un autre nœud (${slots.join(' → ')})`);
  const E = new RenderNodes({ autostart: false, pollMs: 100, log: quiet }); E.add({ url: fE.url, name: 'erreur' }); await E.checkAll();
  const R3 = path.join(tmp, 'r3.mp4'); slots = [];
  const r3 = await E.run({ ...job, dir, outFile: R3 }, Y.localExec, { onSlot: (s) => slots.push(s.name) });
  check(r3.node === null && fs.existsSync(R3) && slots.join('>') === 'erreur>CT (local)', `erreur d'encodage sur le seul nœud : reprise sur le CT (${slots.join(' → ')})`);
  const Z = new RenderNodes({ autostart: false, log: quiet }); Z.add({ url: dead }); await Z.checkAll();
  const R4 = path.join(tmp, 'r4.mp4'); const r4 = await Z.run({ ...job, dir, outFile: R4 }, Y.localExec);
  check(r4.node === null && md5v(R4) === md5v(L6), 'aucun nœud en ligne : rendu sur le CT');

  // vidéos en parallèle (ex. découpe) : file VideoQueue + 2 agents + CT
  if (!process.argv.includes('--quick')) {
    const store = new Map(), tracksDir = path.join(tmp, 'tracks');
    const fakeStore = { get: (id) => store.get(id), update: (id, p) => store.set(id, { ...store.get(id), ...p }) };
    const ids = ['p1', 'p2', 'p3'];
    for (const id of ids) { fs.mkdirSync(path.join(tracksDir, id), { recursive: true }); fs.copyFileSync(wav, path.join(tracksDir, id, 'a.wav')); store.set(id, { ...T, id, title: 'Pièce ' + id, files: { wav: 'a.wav' } }); }
    const Pn = new RenderNodes({ autostart: false, pollMs: 150, log: quiet }); Pn.add({ url: uA, name: 'A' }); Pn.add({ url: uB, name: 'B', token: 'secret' }); Pn.setRender({ localMode: 'parallel' }); await Pn.checkAll();
    const VQ = new Y.VideoQueue(fakeStore, tracksDir, Pn); let maxRun = 0;
    for (const id of ids) VQ.enqueue(id, { resolution: '720p' });
    const t0 = Date.now();
    while (ids.some((id) => !['done', 'error'].includes(VQ.status(id).status)) && Date.now() - t0 < 120000) { maxRun = Math.max(maxRun, VQ.running); await sleep(100); }
    const used = new Set(ids.map((id) => store.get(id).meta?.youtube?.videoNode));
    check(ids.every((id) => VQ.status(id).status === 'done') && maxRun >= 2 && used.size >= 2, `3 vidéos en parallèle (max ${maxRun} simultanées) sur ${[...used].join(', ')}`);
  }
} catch (e) { check(false, 'nœuds : ' + (e.stack || e.message)); }
finally { for (const n of nodes) await n.close().catch(() => {}); }

// ---------- API Admin
if (!process.argv.includes('--no-api')) {
  const port = await freePort(), B = `http://127.0.0.1:${port}`;
  const ag = startAgent({ port: 0, discovery: false, quiet: true, workDir: path.join(tmp, 'agentApi'), name: 'pc-test', configFile: '/nonexistent' });
  const pAg = await ag.ready, uAg = `http://127.0.0.1:${pAg}`;
  const oll = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(req.url === '/api/tags' ? JSON.stringify({ models: [{ name: 'qwen3:14b' }, { name: 'llama3.2:3b' }] }) : req.url === '/api/version' ? '{"version":"0.12.0"}' : '{}'); });
  await new Promise((r) => oll.listen(0, '127.0.0.1', r)); const uOl = `http://127.0.0.1:${oll.address().port}`;
  const srv = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], { env: { ...process.env, SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA_DIR: path.join(tmp, 'api-data') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  const api = async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json' } }); return { s: r.status, j: await r.json().catch(() => null) }; };
  const wait = async (fn, ms = 180000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('délai dépassé'); await sleep(400); } };
  try {
    await wait(async () => (await fetch(B + '/api/options').catch(() => null))?.ok, 20000);
    const page = await fetch(B + '/admin').then((r) => r.text()), idx = await fetch(B + '/studio').then((r) => r.text()); // v1.20.5 : Studio sur /studio
    check(page.includes('Nœuds de rendu') && (page.includes('PC IA (Ollama)') || page.includes('Modèles IA')) && idx.includes('href="/admin"'), 'page Admin servie, lien « Admin » dans la barre du haut');
    let r = await api('/api/admin/nodes');
    check(r.s === 200 && r.j.nodes.length === 0 && r.j.localMode === 'fallback', 'GET /api/admin/nodes : aucun nœud, CT en secours');
    r = await api('/api/admin/nodes', { method: 'POST', body: JSON.stringify({ url: uAg.replace('http://', ''), name: 'PC test' }) });
    const id = r.j?.nodes?.[0]?.id;
    check(r.s === 201 && r.j.nodes[0].status === 'up' && r.j.nodes[0].encoder && r.j.nodes[0].url === uAg, `POST : nœud ajouté et testé (${r.j?.nodes?.[0]?.encoderLabel})`);
    check((await api('/api/admin/nodes', { method: 'POST', body: JSON.stringify({ url: uAg }) })).s === 409 && (await api('/api/admin/nodes', { method: 'POST', body: JSON.stringify({ url: 'ht!tp://' }) })).s === 400, 'POST : doublon 409, adresse invalide 400');
    r = await api('/api/admin/nodes/' + id, { method: 'PATCH', body: JSON.stringify({ enabled: false }) });
    check(r.j.nodes[0].status === 'disabled' && r.j.nodes[0].enabled === false, 'PATCH : nœud désactivé');
    r = await api('/api/admin/render', { method: 'PUT', body: JSON.stringify({ forceUrl: uAg }) });
    check(r.j.forceUrl === uAg && r.j.nodes[0].forced && r.j.nodes[0].enabled, 'PUT /render : nœud forcé (et réactivé)');
    check((await api('/api/admin/render', { method: 'PUT', body: JSON.stringify({ localMode: 'nimporte' }) })).s === 400, 'PUT /render : mode CT invalide refusé');
    const saved = JSON.parse(fs.readFileSync(path.join(tmp, 'api-data', 'render-nodes.json'), 'utf8'));
    check(saved.nodes.length === 1 && saved.forceUrl === uAg, 'réglages enregistrés (render-nodes.json)');
    // vidéo de bout en bout via le nœud
    const g = await api('/api/generate', { method: 'POST', body: JSON.stringify({ style: 'lofi', seed: 170, duration: 20, wav: true }) });
    const t = await wait(async () => { const x = await api('/api/jobs/' + g.j.id); return x.j?.status === 'done' && x.j; });
    const vq = await api(`/api/tracks/${t.id}/video`, { method: 'POST', body: JSON.stringify({ resolution: '720p' }) });
    const yt = await wait(async () => { const x = await api(`/api/tracks/${t.id}/youtube`); return x.j?.video?.status === 'done' && x.j; }, 120000);
    check(vq.s === 202 && yt.files.video && yt.videoNode && yt.videoNode !== 'CT (local)', `vidéo via l'API rendue sur le nœud « ${yt.videoNode} » (${yt.videoEncoder})`);
    r = await api('/api/admin/render', { method: 'PUT', body: JSON.stringify({ forceUrl: null }) });
    r = await api('/api/admin/nodes/' + id, { method: 'DELETE' });
    check(r.s === 200 && r.j.nodes.length === 0, 'DELETE : nœud retiré');
    // PC IA
    r = await api('/api/admin/ai', { method: 'PUT', body: JSON.stringify({ url: uOl, model: '' }) });
    check(r.j.url === uOl && r.j.model === 'qwen3:14b', 'IA : adresse enregistrée, modèle par défaut qwen3:14b');
    r = await api('/api/admin/ai/test', { method: 'POST', body: '{}' });
    check(r.j.ok && r.j.hasModel && r.j.models.length === 2 && r.j.version === '0.12.0', `IA : test de connexion OK (${r.j.message})`);
    r = await api('/api/admin/ai/test', { method: 'POST', body: JSON.stringify({ model: 'mistral' }) });
    check(r.j.ok && !r.j.hasModel, 'IA : modèle absent signalé');
    r = await api('/api/admin/ai/test', { method: 'POST', body: JSON.stringify({ url: 'http://127.0.0.1:' + (await freePort()) }) });
    check(!r.j.ok && /impossible/.test(r.j.error), 'IA : serveur injoignable signalé');
    const spec = await api('/api/openapi.json');
    check(String(spec.j?.info?.version).split('.').map(Number).reduce((a, x) => a * 1000 + x, 0) >= 1007000 && JSON.stringify(spec.j).includes('/api/admin/nodes'), 'openapi 1.7.0 documente l’API Admin');
  } catch (e) { check(false, 'API : ' + e.message); console.log(log.slice(-1500)); }
  finally { srv.kill(); oll.close(); await ag.close(); }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} échec(s)` : '\nv1.7.0 : tout est OK');
process.exit(fail ? 1 : 0);
