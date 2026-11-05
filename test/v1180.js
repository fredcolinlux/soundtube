// v1.18.0 — i18n FR/EN : mêmes clés, clés référencées présentes, empreinte moteur inchangée vs v1.17.0
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { engineId } from '../node-agent/engine-id.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = (ok, msg) => { console.log(ok ? '  ✓' : '  ✗', msg); if (!ok) process.exitCode = 1; };

const fr = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/i18n/fr.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/i18n/en.json'), 'utf8'));
const frK = Object.keys(fr).sort(), enK = Object.keys(en).sort();
check(JSON.stringify(frK) === JSON.stringify(enK), `mêmes clés fr/en (${frK.length})`);
check(frK.length >= 180, `au moins 180 clés (${frK.length})`);

const used = new Set();
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name); const st = fs.statSync(p);
    if (st.isDirectory()) { if (name !== 'fonts') walk(p); continue; }
    if (!/\.(js|html)$/.test(name)) continue;
    const t = fs.readFileSync(p, 'utf8');
    for (const m of t.matchAll(/(?<![.\w])t\(\s*['"]([a-z][a-z0-9_.]*)['"]/g)) used.add(m[1]);
    for (const m of t.matchAll(/data-i18n(?:-placeholder|-title|-aria)?=["']([a-z][a-z0-9_.]+)["']/g)) used.add(m[1]);
  }
};
walk(path.join(ROOT, 'public'));
const missing = [...used].filter((k) => !fr[k]).sort();
check(missing.length === 0, `aucune clé manquante (${missing.length}${missing.length ? ': ' + missing.slice(0, 8).join(', ') : ''})`);

const fingerprint = engineId(path.join(ROOT, 'src')).hash;
check(fingerprint === '696de0f4125a', `empreinte moteur inchangée (${fingerprint})`);

check(fs.existsSync(path.join(ROOT, 'public/js/i18n.js')), 'public/js/i18n.js');
check(/lang-switch/.test(fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8')), 'CSS .lang-switch');
check(/\/api\/ui\/lang/.test(fs.readFileSync(path.join(ROOT, 'src/server.js'), 'utf8')), 'API /api/ui/lang');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v1180-'));
const port = 18000 + Math.floor(Math.random() * 1000);
const srv = spawn(process.execPath, ['src/server.js'], { cwd: ROOT, env: { ...process.env, SOUNDTUBE_DATA_DIR: dataDir, SOUNDTUBE_PORT: String(port), SOUNDTUBE_YT_TRANSPORT: 'mock', SOUNDTUBE_OLLAMA_URL: 'http://127.0.0.1:9' }, stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (p, headers = {}) => new Promise((resolve, reject) => {
  http.get({ hostname: '127.0.0.1', port, path: p, headers }, (res) => {
    let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ s: res.statusCode, h: res.headers, b }));
  }).on('error', reject);
});
try {
  for (let i = 0; i < 50; i++) { try { const r = await get('/api/options'); if (r.s === 200) break; } catch {} await sleep(100); }
  const L = await get('/api/ui/lang', { 'accept-language': 'en-US,en;q=0.9' });
  const j = JSON.parse(L.b);
  check(L.s === 200 && j.supported?.includes('en') && (j.lang === 'en' || j.lang === 'fr'), `GET /api/ui/lang (${j.lang})`);
  const frJ = await get('/i18n/fr.json'); const enJ = await get('/i18n/en.json');
  check(frJ.s === 200 && enJ.s === 200, 'locales servies en statique');
} finally {
  try { const { execSync } = await import('node:child_process'); const out = execSync(`ss -ltnp | grep ':${port}' || true`, { encoding: 'utf8' }); const m = out.match(/pid=(\d+)/); if (m) process.kill(+m[1]); } catch {}
  srv.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(process.exitCode ? 'ÉCHEC v1.18.0' : 'OK v1.18.0');
