// v1.19.1 — Modèles IA visibles + cache-bust ?v=
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { spawn } from 'child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };

const html = fs.readFileSync(path.join(ROOT, 'public/admin.html'), 'utf8');
check(/id="ai"/.test(html) && /ai-models/.test(html) && /aiWatchCard/.test(html) && /aiDirectorCard/.test(html),
  'Admin : bloc Modèles IA côte à côte (directeur + veille)');
check(/data-i18n="admin\.aiModels"/.test(html), 'titre admin.aiModels');
check(/\?v=1\.19\.1/.test(html) && !/\?v=1\.18\.0/.test(html) && !/\?v=1\.19\.0/.test(html),
  'admin.html asset URLs ?v=1.19.1');
check(/id="appVersion"/.test(html), 'pastille version');

const js = fs.readFileSync(path.join(ROOT, 'public/js/admin.js'), 'utf8');
check(/showVersion/.test(js) && /watchModel/.test(js), 'admin.js : showVersion + watchModel');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
check(pkg.version === '1.19.1', `package ${pkg.version}`);
check(fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim() === '1.19.1', 'VERSION');

// All HTML pages versioned
for (const f of fs.readdirSync(path.join(ROOT, 'public')).filter((n) => n.endsWith('.html'))) {
  const h = fs.readFileSync(path.join(ROOT, 'public', f), 'utf8');
  if (h.includes('?v=')) check(!h.includes('?v=1.18.0') && !h.includes('?v=1.19.0'), `${f} sans ancien ?v=`);
}

// Live headers if we can boot briefly
const port = 18791;
const env = { ...process.env, SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA: path.join(ROOT, 'data-test-1191') };
fs.rmSync(env.SOUNDTUBE_DATA, { recursive: true, force: true });
const child = spawn('node', ['src/server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((r) => setTimeout(r, 900));
try {
  const res = await fetch(`http://127.0.0.1:${port}/admin`);
  const cc = res.headers.get('cache-control') || '';
  check(/no-store|no-cache/i.test(cc), `GET /admin Cache-Control: ${cc}`);
  const body = await res.text();
  check(/aiWatchCard/.test(body) && /\?v=1\.19\.1/.test(body), 'GET /admin corps avec veille + ?v=1.19.1');
  const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json());
  check(health.version === '1.19.1', `health ${health.version}`);
} catch (e) {
  check(false, 'serveur test: ' + e.message);
} finally {
  child.kill('SIGTERM');
  fs.rmSync(env.SOUNDTUBE_DATA, { recursive: true, force: true });
}

console.log(fail ? `\n${fail} échec(s)` : '\nv1.19.1 : tous les tests passent');
process.exit(fail ? 1 : 0);
