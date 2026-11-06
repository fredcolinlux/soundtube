// Hachage scrypt (Node natif, zéro dépendance native) + chiffrement AES-256-GCM au repos + liens signés.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024, keyLen: 32 };
const ALG = 'scrypt';

export function ensureMasterKey(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'secret.key');
  if (!fs.existsSync(file)) {
    const key = crypto.randomBytes(32);
    fs.writeFileSync(file, key.toString('base64'), { mode: 0o600 });
    try { fs.chmodSync(file, 0o600); } catch {}
  } else {
    try { fs.chmodSync(file, 0o600); } catch {}
  }
  return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await new Promise((res, rej) => {
    crypto.scrypt(String(password), salt, SCRYPT.keyLen, SCRYPT, (e, b) => (e ? rej(e) : res(b)));
  });
  return `${ALG}$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB64, hashB64] = String(stored || '').split('$');
    if (alg !== ALG) return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expect = Buffer.from(hashB64, 'base64');
    const got = await new Promise((res, rej) => {
      crypto.scrypt(String(password), salt, expect.length, { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem }, (e, b) => (e ? rej(e) : res(b)));
    });
    return crypto.timingSafeEqual(got, expect);
  } catch { return false; }
}

export function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

export function encrypt(masterKey, plaintext) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const enc = Buffer.concat([c.update(String(plaintext), 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decrypt(masterKey, blob) {
  const s = String(blob || '');
  if (!s.startsWith('v1:')) return s; // plaintext legacy
  const [, ivB64, tagB64, encB64] = s.split(':');
  const d = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(ivB64, 'base64'));
  d.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([d.update(Buffer.from(encB64, 'base64')), d.final()]).toString('utf8');
}

/** Lien signé HMAC-SHA256 : /api/signed/<payload>.<sig> */
export function signPayload(masterKey, obj, ttlSec = 3600) {
  const body = Buffer.from(JSON.stringify({ ...obj, exp: Math.floor(Date.now() / 1000) + ttlSec })).toString('base64url');
  const sig = crypto.createHmac('sha256', masterKey).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySigned(masterKey, token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', masterKey).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const o = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!o.exp || o.exp < Math.floor(Date.now() / 1000)) return null;
    return o;
  } catch { return null; }
}

export function randomId(bytes = 16) { return crypto.randomBytes(bytes).toString('hex'); }
export function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
