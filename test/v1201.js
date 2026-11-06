// v1.20.1 — auth obligatoire studio, détection proxy/domaine, inscriptions
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import os from 'os';
import http from 'http';
import { clientMeta, observeProxyHints, isPrivateIp } from '../src/security/ip.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };

// --- unit: untrusted XFF never local
{
  const req = {
    socket: { remoteAddress: '192.168.0.1' },
    headers: { 'x-forwarded-for': '203.0.113.10', host: 'soundtube.example.com' },
    protocol: 'http',
  };
  const m = clientMeta(req, { trustedProxies: [] });
  check(m.untrustedForward === true, 'untrusted XFF flagged');
  check(m.local === false, 'untrusted XFF → not local (safe default)');
  check(m.ip === '192.168.0.1', 'ip stays socket until proxy confirmed');
}
{
  const req = {
    socket: { remoteAddress: '192.168.0.1' },
    headers: { 'x-forwarded-for': '203.0.113.10', host: 'soundtube.example.com', 'x-forwarded-proto': 'https' },
    protocol: 'http',
  };
  const m = clientMeta(req, { trustedProxies: ['192.168.0.1'] });
  check(m.fromProxy && m.local === false, 'trusted proxy uses public client IP');
  check(m.ip === '203.0.113.10', 'client IP from XFF when trusted');
  check(m.proto === 'https', 'proto from X-Forwarded-Proto');
}
{
  const req = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
    protocol: 'http',
  };
  check(clientMeta(req, {}).local === true, 'direct loopback still local');
}
{
  const req = {
    socket: { remoteAddress: '10.0.0.5' },
    headers: { 'x-forwarded-for': '8.8.8.8', host: 'music.example.org' },
  };
  const h = observeProxyHints(req, {});
  check(h.suggestedTrustedProxy === '10.0.0.5', 'suggest proxy from private+XFF');
  check(h.suggestedPublicDomain === 'music.example.org', 'suggest domain from Host');
}
{
  const h = observeProxyHints({
    socket: { remoteAddress: '10.0.0.5' },
    headers: { 'x-forwarded-for': '1.2.3.4', host: 'localhost:8080' },
  }, {});
  check(!h.suggestedPublicDomain, 'localhost not suggested as public domain');
}

check(isPrivateIp('192.168.1.1'), 'private detect');

// --- live server
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'st-1201-'));
const port = 18121;
const srv = spawn(process.execPath, ['src/server.js'], {
  cwd: ROOT, env: { ...process.env, SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA_DIR: data, SOUNDTUBE_MP3: 'off' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((r) => setTimeout(r, 1000));

const req = (method, url, { headers = {}, body } = {}) => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port, path: url, method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers } }, (x) => {
    let b = ''; x.on('data', (c) => b += c); x.on('end', () => res({ status: x.statusCode, body: b, headers: x.headers }));
  });
  r.on('error', rej); if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body)); r.end();
});

// Studio HTML requires login
{
  const r = await req('GET', '/');
  check(r.status === 302 && /login/.test(r.headers.location || ''), `studio redirects to login (${r.status})`);
}
// generate requires auth even from loopback
{
  const r = await req('POST', '/api/generate', { body: { style: 'lofi', duration: 20 } });
  check(r.status === 401, `generate without login → 401 (${r.status})`);
}
// public styles OK
{
  const r = await req('GET', '/api/styles');
  check(r.status === 200, `public GET /api/styles (${r.status})`);
}
// registration closed by default
{
  const r = await req('POST', '/api/auth/register', { body: { username: 'bob_user', password: 'tenchars!!' } });
  check(r.status === 403 || /closed|ferm/i.test(r.body), `register closed by default (${r.status} ${r.body.slice(0,60)})`);
}
// setup + login + generate
{
  const setup = await req('POST', '/api/auth/setup', { body: { username: 'admin', password: 'tenchars!!' } });
  check(setup.status === 200 || setup.status === 201, `setup ${setup.status}`);
  const login = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'tenchars!!' } });
  const setCookie = login.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie.map((c) => c.split(';')[0]).join('; ') : String(setCookie || '').split(';')[0];
  check(login.status === 200, `login ${login.status}`);
  const j = JSON.parse(login.body);
  check(!j.needs2fa, 'no 2FA forced after setup');
  const gen = await req('POST', '/api/generate', {
    headers: { cookie, 'x-csrf-token': j.csrf || '' },
    body: { style: 'lofi', duration: 20 },
  });
  check(gen.status === 200 || gen.status === 201 || gen.status === 202, `generate with login (${gen.status}) ${gen.body.slice(0,80)}`);
  // observe hints via forged XFF from “proxy”
  await req('GET', '/api/health', { headers: { 'x-forwarded-for': '203.0.113.9', host: 'demo.example.com', 'x-forwarded-host': 'demo.example.com' } });
  // status as admin
  const st = await req('GET', '/api/auth/status', { headers: { cookie } });
  const sj = JSON.parse(st.body);
  check(sj.openRegistration === false, 'openRegistration default false');
}
// openRegistration flag via security (need admin session from login cookie — re-login)
{
  const login = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'tenchars!!' } });
  const setCookie = login.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie.map((c) => c.split(';')[0]).join('; ') : String(setCookie || '').split(';')[0];
  const j = JSON.parse(login.body);
  const put = await req('PUT', '/api/admin/auth/security', {
    headers: { cookie, 'x-csrf-token': j.csrf || '', 'content-type': 'application/json' },
    body: { openRegistration: true },
  });
  check(put.status === 200, `enable openRegistration (${put.status}) ${put.body.slice(0,80)}`);
  const reg = await req('POST', '/api/auth/register', { body: { username: 'creator1', password: 'tenchars!!' } });
  check(reg.status === 201, `register when open (${reg.status})`);
}

srv.kill('SIGTERM');
try { fs.rmSync(data, { recursive: true, force: true }); } catch {}
console.log(fail ? fail + ' échec(s)' : 'v1.20.1 : OK');
process.exit(fail ? 1 : 0);
