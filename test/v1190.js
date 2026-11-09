// Tests v1.19.0 : modèle Ollama dédié à la veille + crawl autonome (RSS) + SSRF.
// Réseau : uniquement serveurs locaux mock (Ollama + flux RSS). Empreinte moteur inchangée.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { engineId } from '../node-agent/engine-id.mjs';
import * as crawl from '../src/crawl.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v1190-'));
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('— v1.19.0 —');

check(engineId(path.join(ROOT, 'src')).hash === '7afdf699074e', 'empreinte moteur 7afdf699074e (moteur inchangé depuis v1.19)');
check(crawl.isPrivateHost('127.0.0.1') && crawl.isPrivateHost('10.1.2.3') && crawl.isPrivateHost('192.168.0.5') && crawl.isPrivateHost('169.254.9.1'), 'SSRF : IPs privées / link-local');
check(!crawl.isPrivateHost('8.8.8.8'), 'SSRF : IP publique');
let denied = false; try { await crawl.resolveSafe('127.0.0.1'); } catch { denied = true; }
check(denied, 'resolveSafe refuse loopback');
check(crawl.stripHtml('<script>x</script><p>Hi</p>').trim() === 'Hi', 'stripHtml');
check(crawl.fenceUntrusted('src', 'do stuff').includes('untrusted_source'), 'fence untrusted');
check(/reddit\.com/.test(crawl.DEFAULT_FEEDS) && crawl.DEFAULT_KEYWORDS.techno, 'sources / keywords défaut');

const feedXml = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
<item><title>Deep house night drive 122 bpm</title><category>house</category></item>
<item><title>Lo-fi study session chill</title><category>lofi</category></item>
</channel></rss>`;

const calls = [];
const feedPort = await freePort(), olPort = await freePort(), port = await freePort();
const feed = http.createServer((req, res) => {
  calls.push(['feed', req.url]);
  if (req.url === '/feed.rss') { res.writeHead(200, { 'content-type': 'application/rss+xml' }); return res.end(feedXml); }
  res.writeHead(404); res.end();
});
const ollama = http.createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString();
    let j = {}; try { j = JSON.parse(body || '{}'); } catch {}
    calls.push(['ollama', req.url, j.model, j.options?.temperature, j.format]);
    const send = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/api/tags') return send(200, { models: [{ name: 'director-custom:latest' }, { name: 'watch-summarizer:latest' }] });
    if (req.url === '/api/version') return send(200, { version: '0-test' });
    if (req.url === '/api/chat' || req.url === '/api/generate') {
      const content = JSON.stringify({ summary: 'House filtrée, énergie moyenne.', suggestions: [{ mood: 'nocturne', adv: { energy: 55 }, why: 'night drive' }] });
      return send(200, req.url === '/api/chat' ? { message: { content }, model: j.model } : { response: content, model: j.model });
    }
    send(404, {});
  });
});
await new Promise((r) => feed.listen(feedPort, '127.0.0.1', r));
await new Promise((r) => ollama.listen(olPort, '127.0.0.1', r));

const srv = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], {
  env: { ...process.env, SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA_DIR: path.join(tmp, 'data') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await sleep(800);
const base = `http://127.0.0.1:${port}`;
const api = async (p, { method = 'GET', body } = {}) => {
  const r = await fetch(base + p, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, j: await r.json().catch(() => ({})) };
};
const wait = async (fn) => { for (let i = 0; i < 100; i++) { const v = await fn(); if (v) return v; await sleep(150); } throw new Error('timeout'); };

try {
  check(String((await api('/api/health')).j.version || '') === JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version, 'health = version du package');

  let a = (await api('/api/admin/ai')).j;
  check(!!a.watch, 'GET ai.watch');
  a = (await api('/api/admin/ai', { method: 'PUT', body: { url: `http://127.0.0.1:${olPort}`, model: 'director-custom:latest', timeout: 20, watchUrl: '', watchModel: '' } })).j;
  check(a.watch?.usingDirectorModel && a.watch?.notice, 'repli modèle directeur + notice');
  const tw = (await api('/api/admin/ai/test', { method: 'POST', body: { role: 'watch' } })).j;
  check(tw.ok && tw.role === 'watch' && (tw.models || []).includes('watch-summarizer:latest'), 'test veille → /api/tags');
  await api('/api/admin/ai/watch', { method: 'PUT', body: { model: 'watch-summarizer:latest', url: `http://127.0.0.1:${olPort}` } });

  calls.length = 0;
  await api('/api/ai/suggest', { method: 'POST', body: { prompt: 'french touch filtrée nuit été', style: 'frenchtouch' } });
  const dir = calls.find((c) => c[0] === 'ollama' && c[1] === '/api/chat');
  check(dir && dir[2] === 'director-custom:latest' && dir[3] === 0.7, 'directeur : modèle custom + temp 0.7');

  await api('/api/admin/trends', { method: 'PUT', body: { crawl: true, discover: false, html: false, ytKey: '', allowPrivateSources: false, feeds: `house http://127.0.0.1:${feedPort}/feed.rss`, styles: ['house'] } });
  check((await api('/api/admin/trends/run', { method: 'POST' })).s === 202, 'run 202');
  let rep = await wait(async () => { const x = (await api('/api/admin/trends')).j; return !x.settings.running && x.report && x; });
  const blocked = (rep.report.styles.house?.errors || []).some((e) => /privé|bloqué|403|refusé/i.test(e));
  check(blocked || (rep.report.styles.house?.digest?.count || 0) === 0, 'SSRF sans override');

  calls.length = 0;
  await api('/api/admin/trends', { method: 'PUT', body: { allowPrivateSources: true } });
  await api('/api/admin/trends/run', { method: 'POST' });
  rep = await wait(async () => { const x = (await api('/api/admin/trends')).j; return !x.settings.running && x.report?.styles?.house?.digest?.count > 0 && x; });
  check(rep.report.styles.house.digest.count >= 1, 'RSS local avec override');
  const w = [...calls].reverse().find((c) => c[0] === 'ollama' && (c[1] === '/api/chat' || c[1] === '/api/generate'));
  check(w && w[2] === 'watch-summarizer:latest' && w[3] === 0.4 && w[4] === 'json', 'veille : modèle dédié + temp 0.4 + format json');
  check((rep.history || []).length >= 1 || ((await api('/api/admin/trends')).j.history || []).length >= 1, 'historique');

  const none = (await api('/api/admin/trends', { method: 'PUT', body: { crawl: false, discover: false, html: false, feeds: '', ytKey: '' } })).j;
  check(none.settings?.source === 'none' || none.source === 'none', 'aucune source');
  // PUT returns view() directly
  check((none.source || none.settings?.source) === 'none', 'source none');
  check((await api('/api/admin/trends/run', { method: 'POST' })).s === 409, 'run 409 sans source');
} finally {
  srv.kill('SIGTERM'); feed.close(); ollama.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
if (fail) { console.error(`\n${fail} échec(s)`); process.exit(1); }
console.log('\nTous les tests v1.19.0 OK');
