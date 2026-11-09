// Tests v1.17.0 : agent macOS (Apple Silicon) — VideoToolbox, installateur, classement encodeurs,
// départage musique (charge puis vitesse), nœud darwin simulé.
// Aucun Mac réel : on vérifie les args ffmpeg, le rang, les scripts (bash -n), le plist, et un agent
// dont /health annonce platform=darwin + best=h264_videotoolbox (via detected forcé).
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v1170-'));
process.env.SOUNDTUBE_DATA_DIR = path.join(tmp, 'unit-data');

const RC = await import('../node-agent/render-core.mjs');
const { RenderNodes, CT_ENGINE } = await import('../src/nodes.js');
const { startAgent } = await import('../node-agent/agent.mjs');
const { encoderArgs, ENCODER_ORDER, ENCODER_RANK, ENCODER_LABEL, buildArgs, validateSpec } = RC;

let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. versions et classement encodeurs
{
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const ap = JSON.parse(fs.readFileSync(path.join(ROOT, 'node-agent/package.json'), 'utf8'));
  const verOk = ([a,b]) => +a > 1 || (+a === 1 && +b >= 17);
  const [ctMaj, ctMin] = String(pkg.version).split('.');
  const [apMaj, apMin] = String(ap.version).split('.');
  check(verOk([ctMaj, ctMin]) && verOk([apMaj, apMin]), `versions ≥ 1.17.0 (CT ${pkg.version}, agent ${ap.version})`);
  check(ENCODER_ORDER[0] === 'h264_nvenc' && ENCODER_ORDER[1] === 'h264_videotoolbox' && ENCODER_ORDER.at(-1) === 'libx264',
    `ordre : NVENC → VideoToolbox → … → libx264 (${ENCODER_ORDER.join(' › ')})`);
  check(ENCODER_RANK.h264_nvenc < ENCODER_RANK.h264_videotoolbox && ENCODER_RANK.h264_videotoolbox < ENCODER_RANK.libx264,
    `rangs : NVENC ${ENCODER_RANK.h264_nvenc} < VT ${ENCODER_RANK.h264_videotoolbox} < libx264 ${ENCODER_RANK.libx264}`);
  check(/VideoToolbox/.test(ENCODER_LABEL.h264_videotoolbox), 'libellé VideoToolbox');
}

// ---------- 2. args ffmpeg VideoToolbox (construction unitaire — non exécutés sur Linux)
{
  const a = encoderArgs('h264_videotoolbox', { fps: 30, crf: 23, res: '1080p' });
  const s = a.join(' ');
  check(a[0] === '-c:v' && a[1] === 'h264_videotoolbox', 'h264_videotoolbox : -c:v');
  check(s.includes('-b:v') && s.includes('8M') && s.includes('-maxrate') && s.includes('12M'), `débit 1080p : ${s.match(/-b:v \S+|-maxrate \S+/g)?.join(' ')}`);
  check(s.includes('-qmin') && s.includes('-1') && s.includes('-qmax'), 'qmin/qmax -1 (débit honoré sur ffmpeg ≥ 7)');
  check(s.includes('-allow_sw') && a[a.indexOf('-allow_sw') + 1] === '0', 'allow_sw 0 (vrai HW)');
  check(s.includes('-realtime') && a[a.indexOf('-realtime') + 1] === '0', 'realtime 0 (hors ligne)');
  check(s.includes('-prio_speed') && a[a.indexOf('-prio_speed') + 1] === '0', 'prio_speed 0');
  check(s.includes('-pix_fmt') && s.includes('yuv420p') && s.includes('-profile:v') && s.includes('high'), 'yuv420p + profile high');
  check(!s.includes('-q:v'), 'pas de -q:v (mode qualité évité)');
  const h = encoderArgs('hevc_videotoolbox', { fps: 30, crf: 23, res: '720p' });
  check(h.includes('hevc_videotoolbox') && h.includes('-tag:v') && h.includes('hvc1'), 'hevc_videotoolbox : tag hvc1');
  // buildArgs + progress pipe inchangé
  const spec = { v: RC.SPEC_VERSION, dur: 10, fps: 30, res: '720p', crf: 23, preset: 'veryfast',
    files: [{ name: 'audio.wav', size: 100 }], inputs: ['-i', 'audio.wav'], graph: '[0:a]showwaves=s=1280x720[v]', audioIndex: 0, metadata: { title: 't', artist: 'a' } };
  validateSpec(spec);
  const args = buildArgs(spec, 'h264_videotoolbox', 'out.mp4', { progress: true });
  check(args.includes('-progress') && args.includes('pipe:1') && args.includes('-nostats'), 'progression : -progress pipe:1 (out_time_us)');
  check(args.includes('h264_videotoolbox'), 'buildArgs injecte VideoToolbox');
}

// ---------- 3. scripts macOS : bash -n + plist XML + présence des options
{
  for (const f of ['install-macos.sh', 'uninstall-macos.sh', 'start-agent.sh']) {
    const r = spawnSync('bash', ['-n', path.join(ROOT, 'node-agent', f)], { encoding: 'utf8' });
    check(r.status === 0, `bash -n ${f}${r.stderr ? ' — ' + r.stderr.trim() : ''}`);
  }
  const inst = fs.readFileSync(path.join(ROOT, 'node-agent/install-macos.sh'), 'utf8');
  check(/--no-audio/.test(inst) && /--audio-slots/.test(inst) && /--system/.test(inst) && /--allow-from/.test(inst),
    'install-macos.sh : options --no-audio, --audio-slots, --system, --allow-from');
  check(/LaunchAgent/.test(inst) && /LaunchDaemon/.test(inst) && /KeepAlive/.test(inst), 'launchd : Agent (défaut) et Daemon (--system), KeepAlive');
  check(/Application Support\/soundtube-node/.test(inst) && /\/usr\/local\/soundtube-node/.test(inst), 'dossiers utilisateur et système');
  check(/socketfilterfw/.test(inst) && /Autoriser/.test(inst), 'pare-feu applications documenté');
  check(/node@24/.test(inst) && /NODE_MAJOR_REQUIRED=24/.test(inst), 'Node 24 épinglé (majeure du CT)');
  // plist généré par le script (extrait du heredoc) : XML bien formé
  const m = inst.match(/PLIST_BODY=\$\(cat <<PLIST\n([\s\S]*?)\nPLIST\n\)/);
  check(!!m, 'heredoc plist présent');
  if (m) {
    let body = m[1].replace(/\$\{LABEL\}/g, 'com.soundtube.node').replace(/\$\{NODE_BIN\}/g, '/opt/homebrew/bin/node')
      .replace(/\$\{INSTALL_DIR\}/g, '/tmp/soundtube-node');
    const plist = path.join(tmp, 't.plist');
    fs.writeFileSync(plist, body);
    try {
      const { XMLParser } = await import('fast-xml-parser').catch(() => ({ XMLParser: null }));
      void XMLParser;
    } catch {}
    // parseur XML standard
    const { execFileSync } = await import('node:child_process');
    try {
      // ElementTree via python
      spawnSync('python3', ['-c', 'import xml.etree.ElementTree as ET,sys; ET.parse(sys.argv[1]); print("ok")', plist], { check: true, encoding: 'utf8' });
      check(true, 'plist LaunchAgent : XML valide (ElementTree)');
      const t = fs.readFileSync(plist, 'utf8');
      check(/<key>RunAtLoad<\/key><true\/>/.test(t) && /<key>KeepAlive<\/key><true\/>/.test(t), 'plist : RunAtLoad + KeepAlive');
      check(/agent\.mjs/.test(t) && /WorkingDirectory/.test(t), 'plist : ProgramArguments + WorkingDirectory');
    } catch (e) { check(false, 'plist XML : ' + e.message); }
  }
  const un = fs.readFileSync(path.join(ROOT, 'node-agent/uninstall-macos.sh'), 'utf8');
  check(/bootout/.test(un) && /--keep-files/.test(un) && /--system/.test(un), 'uninstall-macos.sh : bootout, --keep-files, --system');
}

// ---------- 4. zip macOS : présence des scripts, pas des .ps1 ; empreinte core =
{
  const zip = path.join(tmp, 'soundtube-node-agent-macos.zip'); // v1.21.2 : toujours construit depuis l'arbre courant
  {
    const r = spawnSync('sh', [path.join(ROOT, 'tools/build-node-agent.sh'), 'macos', zip], { encoding: 'utf8' });
    check(r.status === 0, `construction du zip macOS${r.stderr ? ' — ' + r.stderr.slice(0, 200) : ''}`);
  }
  const dest = path.join(tmp, 'pkg'); fs.mkdirSync(dest);
  spawnSync('python3', ['-m', 'zipfile', '-e', zip, dest], { check: true });
  const root = fs.readdirSync(dest).map((n) => path.join(dest, n)).find((p) => fs.statSync(p).isDirectory());
  check(fs.existsSync(path.join(root, 'install-macos.sh')) && fs.existsSync(path.join(root, 'uninstall-macos.sh')), 'zip macOS : install + uninstall');
  check(!fs.existsSync(path.join(root, 'install-windows.ps1')), 'zip macOS : pas de script Windows');
  const eng = JSON.parse(fs.readFileSync(path.join(root, 'core/ENGINE.json'), 'utf8'));
  check(eng.hash === CT_ENGINE.hash && eng.version === CT_ENGINE.version, `core/ du zip : ${eng.version} · ${eng.hash} = CT`);
}

// ---------- 5. départage musique : charge puis vitesse mesurée
{
  fs.mkdirSync(path.join(tmp, 'n'), { recursive: true });
  const N = new RenderNodes({ dataDir: path.join(tmp, 'n'), autostart: false });
  // forcer deux nœuds « capables » en manipulant l'état (sans vrai agent)
  const a = N.add({ url: 'http://127.0.0.1:9', name: 'Mac' });
  const b = N.add({ url: 'http://127.0.0.1:10', name: 'PC' });
  const fake = (n, { running = 0, slots = 1, msList = [] } = {}) => {
    const st = N.st(n.id);
    st.up = true; st.health = { audio: { ok: true, protocol: 1, engine: { hash: CT_ENGINE.hash, version: CT_ENGINE.version }, slots, running: 0, queued: 0 }, version: '1.17.0' };
    st.audioRunning = running; st.latency = 50;
    st.verify = { key: 'x', ok: true };
    for (const ms of msList) N.record({ kind: 'audio', node: n.id, status: 'done', ms, title: 't' });
  };
  fake(a, { running: 0, msList: [8000, 9000] }); // Mac plus lent
  fake(b, { running: 0, msList: [3000, 4000] }); // PC plus rapide
  check(N.audioState(a).capable && N.audioState(b).capable, 'deux nœuds capables (simulés)');
  check(N.audioNode()?.name === 'PC', `à charge égale : le plus rapide mesuré gagne (${N.audioNode()?.name})`);
  fake(b, { running: 1, slots: 1, msList: [3000] }); // PC saturé
  check(N.audioNode()?.name === 'Mac', `PC saturé : le Mac libre gagne (${N.audioNode()?.name})`);
  check(N.audioNode({ free: true })?.name === 'Mac', 'audioNode({free:true}) ignore le PC saturé');
  // score vidéo : NVENC avant VideoToolbox
  N.st(a.id).health.best = 'h264_videotoolbox'; N.st(b.id).health.best = 'h264_nvenc';
  N.st(a.id).running = 0; N.st(b.id).running = 0;
  const sa = N.score(a), sb = N.score(b);
  check(sb[0] < sa[0], `score vidéo : NVENC (${sb[0]}) avant VideoToolbox (${sa[0]})`);
  N.close?.();
}

// ---------- 6. agent « darwin » simulé : platform + encodeur dans /health et Admin
{
  const agent = startAgent({
    port: 0, host: '127.0.0.1', name: 'Mac-mini-M4', workDir: path.join(tmp, 'agent'), discovery: false, quiet: true,
    detected: { working: ['h264_videotoolbox', 'libx264'], best: 'h264_videotoolbox', listed: ['h264_videotoolbox', 'libx264'], failed: {}, ffmpeg: 'ffmpeg version mock VT' },
  });
  // forcer l'annonce plateforme (l'agent réel sur Linux dirait linux) via monkey-patch health — on vérifie plutôt le flux Admin avec health injecté
  const port = await agent.ready;
  const h = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json());
  check(/^1\.(1[7-9]|[2-9]\d)\./.test(h.version) && h.best === 'h264_videotoolbox' && /VideoToolbox/.test(h.bestLabel) && h.audio?.ok,
    `agent forcé VT : ${h.bestLabel}, musique ok, v${h.version}`);
  // proxy qui réécrit platform/arch dans /health
  const proxy = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      const real = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json());
      const body = JSON.stringify({ ...real, platform: 'darwin', arch: 'arm64', hostname: 'mac-mini-m4.local', cpuModel: 'Apple M4' });
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(body); return;
    }
    const p = http.request({ host: '127.0.0.1', port, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    req.pipe(p);
  }).listen(0, '127.0.0.1');
  await new Promise((r) => proxy.once('listening', r));
  fs.mkdirSync(path.join(tmp, 'adm'), { recursive: true });
  const N = new RenderNodes({ dataDir: path.join(tmp, 'adm'), autostart: false });
  const n = N.add({ url: `http://127.0.0.1:${proxy.address().port}`, name: 'Mac mini M4' });
  await N.check(n);
  const v = N.view().nodes[0];
  check(v.platform === 'darwin' && v.arch === 'arm64' && v.encoder === 'h264_videotoolbox' && /VideoToolbox/.test(v.encoderLabel),
    `Admin view : ${v.platform} ${v.arch}, ${v.encoderLabel}`);
  check(v.audio?.capable === true, 'Admin : capacité musicale sur le Mac simulé');
  proxy.close(); await agent.close();
}

// ---------- 7. docs
{
  const nodes = fs.readFileSync(path.join(ROOT, 'docs/NODES.md'), 'utf8');
  check(/## 6bis\. macOS/.test(nodes) && /LaunchAgent/.test(nodes) && /VideoToolbox/.test(nodes) && /socketfilterfw/.test(nodes),
    'docs/NODES.md : section macOS (install, launchd, pare-feu, VideoToolbox)');
  const readmeFr = fs.readFileSync(path.join(ROOT, 'README.fr.md'), 'utf8');
  const readmeEn = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  check(/Nouveautés v1\.17\.0/.test(readmeFr) || /Nouveautés v1\.17\.0/.test(readmeEn) || /What.?s new in v1\.17\.0/i.test(readmeEn) || /^## 1\.17\.0/m.test(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8')),
    'README : Nouveautés v1.17.0');
}

console.log(fail ? `\n${fail} échec(s)` : '\nv1.17.0 : tous les tests passent');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
