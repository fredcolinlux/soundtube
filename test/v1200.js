// v1.20.1 — auth, headers, local-only admin, signed links, CSP sans inline
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { spawn } from 'child_process';
import { AuthStore } from '../src/auth/store.js';
import { clientMeta, ipInCidr, isPrivateIp } from '../src/security/ip.js';
import { hashPassword, verifyPassword, signPayload, verifySigned, ensureMasterKey } from '../src/security/crypto.js';
import { generateSecret, verifyTotp, totp } from '../src/security/totp.js';
import { CSP } from '../src/security/headers.js';
import os from 'os';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };

const ver = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
check(ver === '1.20.1', `VERSION ${ver}`);
check(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version === '1.20.1', 'package.json version');

// Files exist
for (const f of [
  'src/security/ip.js', 'src/security/crypto.js', 'src/security/totp.js', 'src/security/webauthn.js', 'src/security/headers.js',
  'src/auth/store.js', 'src/auth/middleware.js', 'src/auth/routes.js', 'src/auth/backup.js',
  'public/login.html', 'public/setup.html', 'public/legal.html', 'public/js/login.js', 'public/js/adminauth.js', 'public/js/csrf.js',
  'public/js/stylespage.js', 'deploy/npm-admin-block.conf', 'deploy/fail2ban/soundtube-auth.conf', 'docs/SECURITY.md', 'docs/EXPOSITION.md',
]) {
  check(fs.existsSync(path.join(ROOT, f)), f);
}

// No inline scripts in HTML (except none)
for (const f of fs.readdirSync(path.join(ROOT, 'public')).filter((x) => x.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(ROOT, 'public', f), 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/gi)];
  check(inline.length === 0, `${f}: pas de script inline (${inline.length})`);
  check(html.includes('?v=1.20.1') || f === 'favicon.svg', `${f} cache-bust`);
}

check(CSP.includes("script-src 'self'") && CSP.includes("frame-ancestors 'none'"), 'CSP strict');

// IP helpers
check(isPrivateIp('192.168.1.1') && isPrivateIp('10.0.0.5') && isPrivateIp('127.0.0.1'), 'RFC1918');
check(!isPrivateIp('8.8.8.8'), 'public IP');
check(ipInCidr('192.168.0.42', '192.168.0.0/24'), 'CIDR match');

// Crypto
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'st-auth-'));
const key = ensureMasterKey(tmp);
const h = await hashPassword('correct-horse-battery');
check(await verifyPassword('correct-horse-battery', h), 'scrypt verify');
check(!(await verifyPassword('wrong', h)), 'scrypt reject');
const tok = signPayload(key, { trackId: 'abc', kind: 'mp3' }, 60);
check(verifySigned(key, tok)?.trackId === 'abc', 'signed link');
check(!verifySigned(key, tok + 'x'), 'signed reject');

// TOTP
const secret = generateSecret();
check(verifyTotp(secret, totp(secret)), 'TOTP');

// Auth store
const auth = new AuthStore(tmp);
check(auth.needsSetup(), 'setup required');
const u = await auth.createUser({ username: 'admin', password: 'tenchars!!', role: 'admin' });
check(u.role === 'admin' && !auth.needsSetup(), 'admin created');
const u2 = await auth.authenticatePassword('admin', 'tenchars!!', '127.0.0.1');
check(u2.id === u.id, 'login ok');
try { await auth.authenticatePassword('admin', 'nope', '1.2.3.4'); check(false, 'bad login'); } catch (e) { check(e.status === 401, 'bad login 401'); }

const { session, csrf } = auth.createSession(u2, { ip: '127.0.0.1' });
check(session.id && csrf, 'session+csrf');
const { raw } = await auth.createApiToken(u.id, { name: 'test' });
check(raw.startsWith('st_') && auth.findApiToken(raw), 'api token');

auth.updateSecurity({ trustedProxies: ['10.0.0.1'], publicDomain: 'example.com', legal: { fr: 'Mentions FR', en: 'Legal EN' } });
check(auth.security.publicDomain === 'example.com', 'publicDomain setting');

// clientMeta with trusted proxy
const fakeReq = {
  socket: { remoteAddress: '10.0.0.1' },
  headers: { 'x-forwarded-for': '203.0.113.9', 'x-forwarded-proto': 'https' },
  protocol: 'http',
};
const meta = clientMeta(fakeReq, auth.security);
check(meta.ip === '203.0.113.9' && meta.proto === 'https' && !meta.local, 'trusted XFF');

const localReq = { socket: { remoteAddress: '192.168.0.42' }, headers: {}, protocol: 'http' };
check(clientMeta(localReq, auth.security).local, 'LAN local');

// Anonymisation patterns must not be in public docs as real domain hardcoded permanently —
// (example may appear in EXPOSITION as example placeholder — check deploy snippets use example.com)
const npm = fs.readFileSync(path.join(ROOT, 'deploy/npm-admin-block.conf'), 'utf8');
check(!/personal-domain\.invalid/.test(npm), 'NPM snippet sans domaine perso');
check(/location \^~ \/admin/.test(npm), 'NPM bloque /admin');

console.log(fail ? fail + ' échec(s)' : 'v1.20.1 : OK');
process.exit(fail ? 1 : 0);
