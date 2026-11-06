// TOTP (RFC 6238) + codes de récupération — zéro dépendance.
import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from './crypto.js';

const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret(bytes = 20) {
  const b = crypto.randomBytes(bytes);
  let bits = '', out = '';
  for (const x of b) bits += x.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) out += ALPH[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function decodeBase32(s) {
  const clean = String(s || '').toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of clean) bits += ALPH.indexOf(c).toString(2).padStart(5, '0');
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

export function totp(secret, step = 30, digits = 6, t = Date.now()) {
  const counter = Math.floor(t / 1000 / step);
  const buf = Buffer.alloc(8); buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0); buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', decodeBase32(secret)).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[off] & 0x7f) << 24 | hmac[off + 1] << 16 | hmac[off + 2] << 8 | hmac[off + 3]) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

export function verifyTotp(secret, code, window = 1) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  const now = Date.now();
  for (let w = -window; w <= window; w++) {
    if (totp(secret, 30, 6, now + w * 30_000) === c) return true;
  }
  return false;
}

export function otpauthUrl(secret, account, issuer = 'soundtube') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export async function makeRecoveryCodes(n = 10) {
  const codes = [], hashes = [];
  for (let i = 0; i < n; i++) {
    const c = crypto.randomBytes(5).toString('hex');
    codes.push(c);
    hashes.push(await hashPassword(c));
  }
  return { codes, hashes };
}

export async function consumeRecovery(code, hashes) {
  const list = Array.isArray(hashes) ? [...hashes] : [];
  for (let i = 0; i < list.length; i++) {
    if (await verifyPassword(String(code || '').trim(), list[i])) {
      list.splice(i, 1);
      return { ok: true, hashes: list };
    }
  }
  return { ok: false, hashes: list };
}
