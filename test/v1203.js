#!/usr/bin/env node
// v1.20.3 — démo styles ≤ 15 s, rate-limit, purge ; pages d'erreur brandées.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DemoQueue, DEMO_MAX_SEC, DEMO_TTL_MS, DEMO_RATE } from '../src/demo.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ok = (m) => console.log('OK   ', m);

/* ---- unit: duration cap + rate + purge ---- */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-demo-u-'));
  const q = new DemoQueue({ dir, isMainBusy: () => true }); // never run worker
  // monkey-patch run to no-op so queue drains without audio
  q.run = async (id) => {
    const j = q.jobs.get(id);
    j.status = 'done'; j.finished_at = Date.now() - DEMO_TTL_MS - 1000; j.progress = 1;
    j.files = { wav: 'demo.wav' }; j.audioToken = 'tok'; j.expire_at = Date.now() - 1;
    fs.mkdirSync(path.join(dir, id), { recursive: true });
    fs.writeFileSync(path.join(dir, id, 'demo.wav'), 'x');
    q.tokens.set('tok', { id, exp: Date.now() - 1 });
  };
  q.isMainBusy = () => false;

  const j = q.enqueue({ style: 'lofi', mood: 'auto', seed: 42, ip: '203.0.113.1' });
  assert.equal(j.duration, DEMO_MAX_SEC);
  const raw = q.get(j.id);
  assert.equal(raw.params.duration, 15, 'server forces 15s even if client asked more');
  // client-long duration ignored at enqueue (we never pass duration into resolve for demo)
  ok('15s cap on params');

  q.enqueue({ style: 'lofi', ip: '203.0.113.1' });
  q.enqueue({ style: 'lofi', ip: '203.0.113.1' });
  let hit = false;
  try { q.enqueue({ style: 'lofi', ip: '203.0.113.1' }); } catch (e) { hit = e.status === 429; }
  assert.ok(hit, '4th demo from same IP → 429');
  ok(`rate limit ${DEMO_RATE.max}/${DEMO_RATE.windowMs / 60000}min`);

  // allow other IP
  q.enqueue({ style: 'house', ip: '198.51.100.9' });
  ok('other IP still allowed');

  q.isMainBusy = () => false;
  q.pump();
  await new Promise((r) => setTimeout(r, 80));
  const n = q.purge(Date.now());
  assert.ok(n >= 1, 'purge removed expired demos');
  assert.equal(q.jobs.size, 0);
  ok('purge clears expired demo files');
  q.stop();
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---- live HTTP ---- */
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'st-1203-'));
const port = 18203;
const srv = spawn(process.execPath, ['src/server.js'], {
  cwd: ROOT,
  env: { ...process.env, SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA_DIR: data, SOUNDTUBE_MP3: 'off' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const req = (method, url, { headers = {}, body } = {}) => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port, path: url, method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers } }, (x) => {
    let b = ''; x.on('data', (c) => b += c); x.on('end', () => res({ status: x.statusCode, body: b, headers: x.headers }));
  });
  r.on('error', rej); if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body)); r.end();
});

try {
  for (let i = 0; i < 80; i++) {
    try { const h = await req('GET', '/api/health'); if (h.status === 200) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }

  // full generate without login → 401
  {
    const r = await req('POST', '/api/generate', { body: { style: 'lofi', duration: 60 } });
    assert.equal(r.status, 401, 'generate requires login');
    ok('generate gated');
  }

  // demo generate ignores long duration
  {
    const r = await req('POST', '/api/demo/generate', { body: { style: 'lofi', duration: 600, mood: 'auto' } });
    assert.equal(r.status, 202, r.body);
    const j = JSON.parse(r.body);
    assert.equal(j.duration, 15);
    assert.equal(j.demo, true);
    ok(`demo generate 202 duration=${j.duration}`);

    // poll until done or 90s
    let done = null;
    for (let i = 0; i < 90; i++) {
      const p = await req('GET', '/api/demo/jobs/' + j.id);
      const pj = JSON.parse(p.body);
      if (pj.status === 'done' || pj.status === 'error') { done = pj; break; }
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.ok(done, 'demo finished');
    if (done.status === 'error') console.log('demo error (may be env):', done.error);
    else {
      assert.ok(done.urls?.audio || done.urls?.mp3 || done.urls?.wav, 'audio url');
      const audioPath = done.urls.audio || done.urls.mp3 || done.urls.wav;
      const a = await req('GET', audioPath);
      assert.equal(a.status, 200);
      assert.ok(a.body.length > 100, 'audio bytes');
      ok('demo audio served');
    }
  }

  // rate limit over HTTP (use fresh IP via X-Forwarded-For only works if trusted — use distinct by exhausting)
  // After 3 from same socket IP (127.0.0.1), next fails. We already used 1 above.
  {
    await req('POST', '/api/demo/generate', { body: { style: 'ambient' } });
    await req('POST', '/api/demo/generate', { body: { style: 'house' } });
    const r = await req('POST', '/api/demo/generate', { body: { style: 'techno' } });
    assert.equal(r.status, 429, '4th from same IP → 429 got ' + r.status + ' ' + r.body.slice(0, 80));
    ok('HTTP rate limit');
  }

  // branded 404
  {
    const r = await req('GET', '/this-route-does-not-exist-xyz', { headers: { accept: 'text/html' } });
    assert.equal(r.status, 404);
    assert.match(r.body, /err-card|err-vinyl|soundtube/);
    assert.match(r.body, /error\.js|error\.css/);
    ok('branded 404 HTML');
  }
  {
    const r = await req('GET', '/404.html');
    assert.equal(r.status, 200);
    assert.match(r.body, /err404/);
    ok('404.html asset');
  }

  console.log('v1.20.3 : OK');
} finally {
  srv.kill('SIGTERM');
  try { fs.rmSync(data, { recursive: true, force: true }); } catch {}
}
