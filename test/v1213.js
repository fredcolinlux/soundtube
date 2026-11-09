// v1.21.3 — prompt système du directeur (intégré / personnalisé / Modelfile), température, num_ctx ; installateur macOS.
// `node --import ./test/helpers/autologin.mjs test/v1213.js`
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v1213-'));
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---------- installateur macOS ----------
{
  const sh = rd('node-agent/install-macos.sh');
  check(/AUDIO_JSON="True"/.test(sh) && /DISCOVERY_JSON="True"/.test(sh) && !/_JSON="(true|false)"/.test(sh), 'install-macos.sh : booléens Python True/False (plus de NameError)');
  check(/PYRUN=\(sudo python3\)/.test(sh) && /"\$\{PYRUN\[@\]\}" - "\$CFG" <<PY/.test(sh), 'install-macos.sh : config.json écrit avec sudo en --system');
  check(/JETON\*/.test(sh) && /Jeton enregistré dans : \$CFG/.test(sh), 'install-macos.sh : alerte jeton d’exemple + chemin de config.json affiché');
  check(spawnSync('bash', ['-n', path.join(ROOT, 'node-agent/install-macos.sh')]).status === 0, 'install-macos.sh : syntaxe bash valide');
  // le heredoc Python produit un JSON valide avec des booléens
  const py = sh.slice(sh.indexOf('import json, sys'), sh.indexOf('\nPY\n', sh.indexOf('import json, sys')));
  const env = { PORT: '8765', NAME: 'Mac', TOKEN: 'abc', FF: '/usr/bin/ffmpeg', INSTALL_DIR: tmp, ENCODER: '', SLOTS: '0', DISCOVERY_JSON: 'True', DISCOVERY_PORT: '47811', AUDIO_JSON: 'False', ASLOTS: '0' };
  const code = py.replace(/\$([A-Z_]+)/g, (_, k) => env[k] ?? '');
  const out = path.join(tmp, 'cfg.json');
  const r = spawnSync('python3', ['-', out], { input: code });
  let cfg = null; try { cfg = JSON.parse(fs.readFileSync(out, 'utf8')); } catch {}
  check(r.status === 0 && cfg && cfg.discovery === true && cfg.audio === false && cfg.token === 'abc', `heredoc Python → config.json valide (${r.status}${r.stderr?.length ? ' ' + String(r.stderr).slice(0, 80) : ''})`);
}

// ---------- drawtext absent (ffmpeg Homebrew sans freetype) ----------
{
  const { stripFilter, detectFilters } = await import('../node-agent/render-core.mjs');
  const g = "[bg]null[v1];color=c=0x112233:s=320x4:r=24[pb];[v1][pb]overlay=x='-W+W*t/2.00':y=176:eval=frame,drawtext=fontfile='font-sans.woff2':textfile='tx0.txt':expansion=none:fontsize=20:x=160-tw/2:y=100:enable='between(t,0.00,1.00)',drawtext=fontfile='font-sans.woff2':textfile='tx1.txt':expansion=none:fontsize=20:x=10:y=100:enable='between(t,1.00,12.00)',format=yuv420p[v]";
  const s = stripFilter(g);
  check(s.removed === 2 && !/drawtext/.test(s.graph) && s.graph.endsWith("eval=frame,format=yuv420p[v]"), 'stripFilter : drawtext retirés (virgules entre guillemets respectées)');
  const s2 = stripFilter("[a]drawtext=text='x,y'[b];[b]drawtext=x=1,format=rgba[c]");
  check(s2.graph === '[a]null[b];[b]format=rgba[c]', `stripFilter : filtre seul → null, en tête de chaîne → retiré (${s2.graph})`);
  check(stripFilter("[a]format=rgba,overlay=enable='gte(t,1)'[b]").removed === 0, 'stripFilter : graphe sans drawtext inchangé');
  const f = detectFilters('ffmpeg');
  check(f.drawtext === true || f.drawtext === false, `detectFilters : drawtext ${f.drawtext}`);
  // agent réel (libx264) annonçant drawtext absent : le job aboutit, avertissement renvoyé
  const { startAgent } = await import('../node-agent/agent.mjs');
  const job = path.join(tmp, 'mk'); fs.mkdirSync(job, { recursive: true });
  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x334455:s=320x180:d=1', '-frames:v', '1', '-y', path.join(job, 'bg.png')]);
  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=f=440:d=2', '-ac', '2', '-y', path.join(job, 'audio.wav')]);
  fs.copyFileSync(path.join(ROOT, 'public/fonts/space-grotesk-latin-wght-normal.woff2'), path.join(job, 'font-sans.woff2'));
  fs.writeFileSync(path.join(job, 'tx0.txt'), 'Chapitre 1'); fs.writeFileSync(path.join(job, 'tx1.txt'), 'Chapitre 2');
  const names = ['bg.png', 'audio.wav', 'font-sans.woff2', 'tx0.txt', 'tx1.txt'];
  const spec = { v: 2, dur: 2, fps: 24, res: '720p', crf: 30, preset: 'ultrafast', inputs: ['-loop', '1', '-framerate', '24', '-i', 'bg.png', '-i', 'audio.wav'],
    graph: '[0:v]format=yuv420p,loop=loop=-1:size=1:start=0,fps=24[bg];' + g, audioIndex: 1, metadata: { title: 't', artist: 'a' },
    files: names.map((name) => ({ name, size: fs.statSync(path.join(job, name)).size })) };
  const agent = startAgent({ port: 0, host: '127.0.0.1', name: 'Mac-test', workDir: path.join(tmp, 'agent'), discovery: false, quiet: true, audio: false,
    detected: { working: ['libx264'], best: 'libx264', listed: ['libx264'], failed: {}, ffmpeg: 'ffmpeg mock', filters: { drawtext: false }, drawtext: false } });
  const ap = await agent.ready, A = `http://127.0.0.1:${ap}`;
  try {
    const h = await fetch(A + '/health').then((r) => r.json());
    check(h.drawtext === false && h.version === JSON.parse(rd('node-agent/package.json')).version, `agent /health : drawtext false, version ${h.version}`);
    const c = await fetch(A + '/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec }) }).then((r) => r.json());
    for (const n of c.need) await fetch(`${A}/jobs/${c.id}/files/${n}`, { method: 'PUT', body: fs.readFileSync(path.join(job, n)) });
    await fetch(`${A}/jobs/${c.id}/start`, { method: 'POST' });
    let j = {}; for (let i = 0; i < 120; i++) { j = await fetch(`${A}/jobs/${c.id}`).then((r) => r.json()); if (j.status === 'done' || j.status === 'error') break; await sleep(250); }
    check(j.status === 'done' && /drawtext absent/.test(j.warning || ''), `job vidéo sans drawtext : ${j.status} — ${j.warning || j.error}`);
  } finally { agent.close(); }
}

// ---------- buildPrompt : modes ----------
const { buildPrompt, JSON_CONTRACT } = await import('../src/ai.js');
{
  const o = { prompt: 'nuit pluvieuse', style: 'lofi', duration: 180, meta: true, plan: false };
  const a = buildPrompt(o), b = buildPrompt({ ...o, promptCfg: { mode: 'builtin', prompt: 'ignoré' } });
  check(JSON.stringify(a) === JSON.stringify(b) && !a.mode, 'mode intégré : prompt identique à v1.21.2');
  const long = 'Tu es un directeur artistique exigeant. '.repeat(250);
  const c = buildPrompt({ ...o, promptCfg: { mode: 'custom', prompt: long } });
  check(c.system.startsWith('Tu es un directeur artistique exigeant.') && c.system.includes(JSON_CONTRACT) && c.system.includes('STYLES:') && c.user === a.user, 'mode personnalisé : texte Admin + contrat JSON + catalogue en système');
  const cc = buildPrompt({ ...o, context: { taste: 'goût', trends: '' }, promptCfg: { mode: 'custom', prompt: 'P' } });
  check(cc.system.includes('CONTEXTE :') && cc.user.includes('CONTEXTE INTERNE'), 'mode personnalisé + contexte : règle de non-citation conservée');
  const m = buildPrompt({ ...o, context: { taste: 'goût', trends: '' }, promptCfg: { mode: 'modelfile' } });
  check(m.system === '' && m.user.startsWith(JSON_CONTRACT) && m.user.includes('STYLES:') && m.user.includes('CONTEXTE :'), 'mode Modelfile : aucun système, contrat + catalogue dans le message utilisateur');
  const e = buildPrompt({ ...o, promptCfg: { mode: 'custom', prompt: '   ' } });
  check(JSON.stringify(e) === JSON.stringify(a), 'mode personnalisé vide → prompt intégré');
}

// ---------- serveur + Ollama simulé ----------
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const seen = [];
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    try { seen.push(JSON.parse(b)); } catch { seen.push(null); }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ message: { content: JSON.stringify({ style: 'lofi', mood: 'pluvieux', key: 'auto', scale: 'auto', bpm: 0, adv: {}, explanation: 'ok', title_fr: 'Pluie', title_en: 'Rain', description_fr: 'd', description_en: 'd', tags: ['lofi', 'pluie'] }) } }));
  });
});
const mport = await freePort(); await new Promise((r) => mock.listen(mport, '127.0.0.1', r));
const data = path.join(tmp, 'data'); fs.mkdirSync(data);
const port = await freePort();
const srv = spawn(process.execPath, ['src/server.js'], { cwd: ROOT, env: { ...process.env, SOUNDTUBE_DATA_DIR: data, SOUNDTUBE_PORT: String(port), SOUNDTUBE_YT_TRANSPORT: 'mock' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
const B = `http://127.0.0.1:${port}`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/healthz')).ok) break; } catch {} await sleep(250); }
const j = async (method, u, body) => { const r = await fetch(B + u, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, d: await r.json().catch(() => ({})) }; };
try {
  let r = await j('GET', '/api/admin/director/prompt');
  check(r.status === 200 && r.d.mode === 'builtin' && r.d.temperature === 0.7 && r.d.numCtx === 8192 && r.d.max === 20000, `GET prompt : défauts (builtin, 0.7, 8192, max 20000) ${r.status}`);
  const nocsrf = await fetch(B + '/api/admin/director/prompt', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: 'x=y' }, body: '{}' });
  check(nocsrf.status === 401 || nocsrf.status === 403 || nocsrf.status === 404, `PUT sans session/CSRF refusé (${nocsrf.status})`);
  const badCsrf = await fetch(B + '/api/admin/director/prompt', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-csrf-token': 'faux' }, body: JSON.stringify({ mode: 'builtin' }) });
  check(badCsrf.status === 403, `PUT avec session mais jeton CSRF faux → 403 (${badCsrf.status})`);
  r = await j('PUT', '/api/admin/director/prompt', { mode: 'custom', prompt: '€'.repeat(20000) });
  check(r.status === 200 && r.d.chars === 20000, `20 000 caractères multi-octets (~60 Ko) acceptés (${r.status} ${r.d.error || ''})`);
  r = await j('PUT', '/api/admin/director/prompt', { mode: 'custom', prompt: 'x'.repeat(20001) });
  check(r.status === 400, `prompt > 20 000 caractères refusé (${r.status})`);
  r = await j('PUT', '/api/admin/director/prompt', { mode: 'custom', prompt: '' });
  check(r.status === 400, 'mode personnalisé avec prompt vide refusé');
  r = await j('PUT', '/api/admin/director/prompt', { temperature: 3 });
  check(r.status === 400, 'température hors bornes refusée');
  const big = 'Directeur artistique soundtube — règles détaillées, éléments sonores, références de mixage. '.repeat(210).slice(0, 19990);
  r = await j('PUT', '/api/admin/director/prompt', { mode: 'custom', prompt: big, temperature: '0,5', numCtx: 16384 });
  check(r.status === 200 && r.d.mode === 'custom' && r.d.chars === big.length && r.d.temperature === 0.5 && r.d.numCtx === 16384, `prompt de ${big.length} caractères (UTF-8) enregistré, température 0.5, num_ctx 16384 (${r.status} ${r.d.error || ''})`);
  const file = path.join(data, 'director-prompt.json');
  check(fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).prompt === big && (fs.statSync(file).mode & 0o077) === 0, 'stocké dans le dossier de données (director-prompt.json, 0600)');
  check(!fs.existsSync(path.join(ROOT, 'data', 'director-prompt.json')), 'rien dans le dossier de l’application');
  await j('PUT', '/api/admin/ai', { url: `http://127.0.0.1:${mport}`, model: 'mon-modele:latest' });
  r = await j('POST', '/api/admin/director/preview', { style: 'lofi', prompt: 'pluie la nuit', run: true });
  let q = seen.at(-1);
  check(r.d.result?.ok && q?.model === 'mon-modele:latest' && q.messages[0].role === 'system' && q.messages[0].content.startsWith('Directeur artistique soundtube') && q.messages[0].content.includes('CONTRAT DE SORTIE'), 'personnalisé : message système = prompt Admin + contrat, modèle de l’Admin (jamais codé en dur)');
  check(q?.options?.temperature === 0.5 && q.options.num_ctx === 16384 && r.d.numCtx === 16384, 'personnalisé : température et num_ctx de l’Admin envoyés');
  r = await j('POST', '/api/ai/suggest', { prompt: 'pluie la nuit', style: 'lofi', duration: 180 });
  q = seen.at(-1);
  check(r.d.source === 'ai' && q.messages[0].content.startsWith('Directeur artistique soundtube'), 'Créer → « Décris l’ambiance » utilise aussi le prompt personnalisé');
  r = await j('PUT', '/api/admin/director/prompt', { mode: 'modelfile' });
  r = await j('POST', '/api/admin/director/preview', { style: 'lofi', prompt: 'pluie', run: true });
  q = seen.at(-1);
  check(r.d.result?.ok && q.messages.length === 1 && q.messages[0].role === 'user' && q.messages[0].content.startsWith('CONTRAT DE SORTIE'), 'Modelfile : aucun message système (SYSTEM du Modelfile), contrat dans le message utilisateur');
  check(!('temperature' in (q.options || {})) && q.options.num_ctx === 16384, 'Modelfile : température non imposée, num_ctx conservé');
  r = await j('PUT', '/api/admin/director/prompt', { mode: 'builtin', temperature: null, numCtx: null });
  await j('POST', '/api/admin/director/preview', { style: 'lofi', prompt: 'pluie', run: true });
  q = seen.at(-1);
  check(q.messages[0].role === 'system' && q.messages[0].content.startsWith('Tu es le directeur artistique') && !('temperature' in q.options) && !('num_ctx' in q.options), 'intégré + champs vides : défauts du modèle (rien d’imposé)');
  r = await j('PUT', '/api/admin/director/prompt', { restore: true, temperature: 0.7, numCtx: 8192 });
  check(r.d.mode === 'builtin' && r.d.prompt === '' && r.d.temperature === 0.7 && r.d.numCtx === 8192, 'restaurer le prompt intégré');
  await j('POST', '/api/admin/director/preview', { style: 'lofi', prompt: 'pluie', run: true });
  q = seen.at(-1);
  check(q.options.temperature === 0.7 && q.options.num_ctx === 8192, 'défaut : 0.7 / 8192 comme avant');
  // UI
  const html = rd('public/admin.html'), js = rd('public/js/adminprompt.js');
  check(/id="dirSysPrompt"[^>]*maxlength="20000"/.test(html) && /id="dirSysMode"/.test(html) && /id="dirSysTemp"/.test(html) && /id="dirSysCtx"/.test(html) && /adminprompt\.js/.test(html), 'Admin › 07 : zone de texte 20 000, mode, température, num_ctx');
  check(/import \{ apiFetch \} from '\.\/csrf\.js'/.test(js) && /dirSysCount/.test(js), 'adminprompt.js : CSRF (apiFetch) + compteur');
  const fr = JSON.parse(rd('public/i18n/fr.json')), en = JSON.parse(rd('public/i18n/en.json'));
  const keys = [...new Set([...html.matchAll(/data-i18n="(admin\.dirSys[^"]*)"/g)].map((x) => x[1]).concat([...js.matchAll(/t\('(dirsys\.[^']+)'/g)].map((x) => x[1])))];
  check(keys.length > 10 && keys.every((k) => fr[k] && en[k] && fr[k] !== en[k]), `i18n FR + EN complètes (${keys.length} clés)`);
  check(/drawtext: h\.drawtext \?\? null/.test(rd('src/nodes.js')) && /admin\.nodeNoDrawtextMac/.test(rd('public/js/admin.js')) && fr['admin.nodeNoDrawtextMac'] && en['admin.nodeNoDrawtextMac'] && /ffmpeg-full/.test(en['admin.nodeNoDrawtextMac']), 'Admin › nœud : avertissement « drawtext absent » (FR + EN)');
  check(/ffmpeg-full/.test(rd('node-agent/install-macos.sh')) && /has_drawtext "\$FF"/.test(rd('node-agent/install-macos.sh')), 'install-macos.sh : détecte drawtext, préfère / recommande ffmpeg-full');
  check(!/soundtube-pilot/.test(rd('src/directorprompt.js') + rd('src/ai.js') + js), 'aucun nom de modèle directeur codé en dur');
} catch (e) { check(false, 'exception : ' + e.stack); }
finally { srv.kill(); mock.close(); }
if (fail) console.log(log.slice(-2000));
console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests v1.21.3 OK');
process.exit(fail ? 1 : 0);
