#!/usr/bin/env node
// v1.20.4 — demo = preview only: no download / publish / library for demo jobs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ok = (m) => console.log('OK   ', m);

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'st-1204-'));
const port = 18204;
const srv = spawn(process.execPath, ['src/server.js'], {
  cwd: ROOT,
  env: { ...process.env, SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA_DIR: data, SOUNDTUBE_MP3: 'off' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const req = (method, url, { headers = {}, body } = {}) => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port, path: url, method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers } }, (x) => {
    let b = Buffer.alloc(0); x.on('data', (c) => { b = Buffer.concat([b, c]); }); x.on('end', () => res({ status: x.statusCode, body: b, headers: x.headers, text: b.toString('utf8') }));
  });
  r.on('error', rej); if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body)); r.end();
});

try {
  for (let i = 0; i < 80; i++) {
    try { if ((await req('GET', '/api/health')).status === 200) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }

  const r0 = await req('POST', '/api/demo/generate', { body: { style: 'lofi', duration: 999 } });
  assert.equal(r0.status, 202, r0.text);
  const job = JSON.parse(r0.text);
  assert.equal(job.duration, 15);
  const id = job.id;

  // Wait until done
  let done = null;
  for (let i = 0; i < 90; i++) {
    const p = await req('GET', '/api/demo/jobs/' + id);
    const j = JSON.parse(p.text);
    if (j.status === 'done' || j.status === 'error') { done = j; break; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(done && done.status === 'done', 'demo done: ' + JSON.stringify(done));
  const audio = done.urls.audio || done.urls.mp3 || done.urls.wav;
  assert.ok(audio, 'audio url');

  // Preview stream OK
  const stream = await req('GET', audio);
  assert.equal(stream.status, 200);
  assert.match(String(stream.headers['content-disposition'] || 'inline'), /inline/i);
  ok('demo audio streams inline');

  // download query rejected
  const dl = await req('GET', audio + (audio.includes('?') ? '&' : '?') + 'download=1');
  assert.equal(dl.status, 401, dl.text);
  ok('demo audio ?download=1 → 401');

  // Not in library
  const lib = await req('GET', '/api/tracks?status=done&limit=500');
  assert.equal(lib.status, 200);
  const items = JSON.parse(lib.text).items || [];
  assert.ok(!items.some((t) => t.id === id), 'demo id must not appear in library');
  ok('demo not in library');

  // Track / job / publish / pack / zip endpoints → 401 for demo id
  const paths = [
    ['GET', `/api/tracks/${id}`],
    ['GET', `/api/tracks/${id}/audio.mp3`],
    ['GET', `/api/tracks/${id}/audio.mp3?download=1`],
    ['GET', `/api/tracks/${id}/audio.wav?download=1`],
    ['GET', `/api/tracks/${id}/midi.zip`],
    ['GET', `/api/tracks/${id}/pack.zip`],
    ['GET', `/api/tracks/${id}/publish`],
    ['POST', `/api/tracks/${id}/publish`, {}],
    ['POST', `/api/tracks/${id}/pack`, {}],
    ['GET', `/api/jobs/${id}`],
    ['POST', `/api/tracks/${id}/regenerate`, {}],
  ];
  for (const [method, url, body] of paths) {
    const r = await req(method, url, body !== undefined ? { body } : {});
    assert.equal(r.status, 401, `${method} ${url} → ${r.status} ${r.text.slice(0, 80)}`);
  }
  ok('demo id blocked on download/publish/library routes (401)');

  console.log('v1.20.4 : OK');
} finally {
  srv.kill('SIGTERM');
  try { fs.rmSync(data, { recursive: true, force: true }); } catch {}
}
