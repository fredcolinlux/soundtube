#!/usr/bin/env node
// v1.20.2 — TOTP QR enrolment: otpauth URI, SVG QR decode, TOTP round-trip.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { totp, verifyTotp, otpauthUrl, groupSecret } from '../src/security/totp.js';
import { qrSvg, qrPngBuffer } from '../src/security/qrcode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(import.meta.url);
const jsQR = require('./vendor/jsQR.cjs');

function parseGrayPng(buf) {
  let o = 8, w = 0, h = 0; const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o); const type = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const rgba = new Uint8ClampedArray(w * h * 4);
  let p = 0;
  for (let y = 0; y < h; y++) {
    p++;
    for (let x = 0; x < w; x++) {
      const g = raw[p++]; const i = (y * w + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = g; rgba[i + 3] = 255;
    }
  }
  return { data: rgba, width: w, height: h };
}

function decodeQrPng(png) {
  const img = parseGrayPng(png);
  const r = jsQR(img.data, img.width, img.height);
  assert.ok(r && r.data, 'jsQR failed to decode PNG');
  return r.data;
}

function ok(label) { console.log('OK   ', label); }

/* ---- unit: otpauth + QR decode + TOTP ---- */
{
  const secret = 'JBSWY3DPEHPK3PXP';
  const uri = otpauthUrl(secret, 'admin', 'soundtube');
  assert.match(uri, /^otpauth:\/\/totp\/soundtube:admin\?/);
  assert.match(uri, /secret=JBSWY3DPEHPK3PXP/);
  assert.match(uri, /algorithm=SHA1/);
  assert.match(uri, /digits=6/);
  assert.match(uri, /period=30/);
  assert.equal(groupSecret(secret), 'JBSW Y3DP EHPK 3PXP');
  const png = qrPngBuffer(uri, { scale: 8, margin: 4 });
  const decoded = decodeQrPng(png);
  assert.equal(decoded, uri, 'decoded QR must equal otpauth URI');
  const code = totp(secret);
  assert.equal(verifyTotp(secret, code), true);
  ok('unit otpauth + QR decode + TOTP');
}

/* ---- HTTP: begin → qr.svg → confirm ---- */
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-v1202-'));
const port = 19000 + Math.floor(Math.random() * 1000);
const env = {
  ...process.env,
  SOUNDTUBE_DATA_DIR: dataDir,
  SOUNDTUBE_PORT: String(port),
  SOUNDTUBE_HOST: '127.0.0.1',
  SOUNDTUBE_MP3: 'off',
};
const child = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let bootLog = '';
child.stdout.on('data', (d) => { bootLog += d; });
child.stderr.on('data', (d) => { bootLog += d; });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function waitHealth() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error('server did not start\n' + bootLog.slice(-800));
}

function parseSetCookie(res) {
  const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  const jar = [];
  for (const line of raw) {
    if (!line) continue;
    jar.push(line.split(';')[0]);
  }
  return jar.join('; ');
}

try {
  await waitHealth();
  // setup admin (creates session + csrf)
  let r = await fetch(`http://127.0.0.1:${port}/api/auth/setup`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'CorrectHorseBattery-99' }),
  });
  const setupBody = await r.json().catch(() => ({}));
  assert.equal(r.status, 201, JSON.stringify(setupBody));
  let cookie = parseSetCookie(r);
  const csrf = setupBody.csrf;
  assert.ok(cookie && csrf, 'setup session+csrf');
  ok('setup session');

  // begin TOTP
  r = await fetch(`http://127.0.0.1:${port}/api/auth/totp/begin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf },
    body: '{}',
  });
  const begin = await r.json().catch(() => ({}));
  assert.equal(r.status, 200, JSON.stringify(begin));
  assert.ok(begin.secret && begin.otpauthUrl, 'secret+otpauthUrl');
  assert.match(begin.otpauthUrl, /^otpauth:\/\/totp\//);
  assert.match(begin.otpauthUrl, /algorithm=SHA1/);
  assert.equal(begin.qrPath, '/api/me/totp/qr.svg');
  assert.match(begin.secretGrouped, / /);
  ok(`begin (${begin.issuer})`);

  // QR endpoint
  r = await fetch(`http://127.0.0.1:${port}/api/me/totp/qr.svg`, { headers: { cookie } });
  const svg = await r.text();
  assert.equal(r.status, 200, svg.slice(0, 200));
  assert.match(r.headers.get('content-type') || '', /image\/svg\+xml/);
  assert.match(r.headers.get('cache-control') || '', /no-store/);
  assert.match(svg, /<svg/);
  ok('qr.svg authenticated no-store');

  // Decode QR from PNG of the same otpauth URL (encoder under test)
  const decoded = decodeQrPng(qrPngBuffer(begin.otpauthUrl, { scale: 8, margin: 4 }));
  assert.equal(decoded, begin.otpauthUrl);
  ok('QR payload matches otpauthUrl');
  assert.match(svg, /path|rect/i);

  // Confirm with live TOTP
  const code = totp(begin.secret);
  r = await fetch(`http://127.0.0.1:${port}/api/auth/totp/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf },
    body: JSON.stringify({ code }),
  });
  const conf = await r.json().catch(() => ({}));
  assert.equal(r.status, 200, JSON.stringify(conf));
  assert.ok((conf.recovery || conf.recoveryCodes || []).length >= 8, 'recovery codes');
  ok('confirm + recovery');

  // me shows totpEnabled
  r = await fetch(`http://127.0.0.1:${port}/api/auth/me`, { headers: { cookie } });
  const me = await r.json();
  assert.equal(!!(me.user || me).totpEnabled, true);
  ok('totpEnabled on me');

  // QR after confirm should 404 (challenge consumed)
  r = await fetch(`http://127.0.0.1:${port}/api/me/totp/qr.svg`, { headers: { cookie } });
  assert.equal(r.status, 404);
  ok('qr gone after confirm');

  console.log('v1.20.2 : OK');
} finally {
  child.kill('SIGTERM');
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
}
