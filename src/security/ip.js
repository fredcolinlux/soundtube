// IP client réelle derrière Nginx Proxy Manager + détection « local » (RFC1918 / loopback / CIDR Admin).
import net from 'node:net';

const PRIV = [
  ['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16],
  ['127.0.0.0', 8], ['::1', 128], ['fc00::', 7], ['fe80::', 10],
];

function ipToBuf(ip) {
  const v = net.isIP(ip);
  if (v === 4) return Buffer.from(ip.split('.').map((x) => +x));
  if (v === 6) {
    let s = ip.toLowerCase();
    if (s.startsWith('::ffff:')) {
      const m = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
      if (m) return ipToBuf(m[1]);
    }
    const parts = s.split('::');
    let head = parts[0] ? parts[0].split(':') : [];
    let tail = parts[1] ? parts[1].split(':') : [];
    const fill = 8 - head.length - tail.length;
    const full = [...head, ...Array(Math.max(0, fill)).fill('0'), ...tail].map((h) => parseInt(h || '0', 16));
    const b = Buffer.alloc(16);
    for (let i = 0; i < 8; i++) b.writeUInt16BE(full[i] || 0, i * 2);
    return b;
  }
  return null;
}

export function parseCidr(cidr) {
  const s = String(cidr || '').trim();
  if (!s) return null;
  const [ip, bitsStr] = s.includes('/') ? s.split('/') : [s, null];
  const buf = ipToBuf(ip);
  if (!buf) return null;
  const bits = bitsStr != null ? parseInt(bitsStr, 10) : buf.length * 8;
  if (!Number.isFinite(bits) || bits < 0 || bits > buf.length * 8) return null;
  return { buf, bits };
}

export function ipInCidr(ip, cidr) {
  const c = typeof cidr === 'string' ? parseCidr(cidr) : cidr;
  const b = ipToBuf(ip);
  if (!c || !b || b.length !== c.buf.length) return false;
  const full = Math.floor(c.bits / 8), rem = c.bits % 8;
  for (let i = 0; i < full; i++) if (b[i] !== c.buf[i]) return false;
  if (rem) {
    const mask = 0xff << (8 - rem) & 0xff;
    if ((b[full] & mask) !== (c.buf[full] & mask)) return false;
  }
  return true;
}

export function isPrivateIp(ip) {
  return PRIV.some(([base, bits]) => ipInCidr(ip, { buf: ipToBuf(base), bits }));
}

/** Liste CIDR (chaînes) → objets parsés. */
export function compileCidrs(list = []) {
  return (Array.isArray(list) ? list : String(list).split(/[\s,]+/)).map(parseCidr).filter(Boolean);
}

/**
 * @param {import('express').Request} req
 * @param {{ trustedProxies?: string[], localCidrs?: string[] }} settings
 */
export function clientMeta(req, settings = {}) {
  const raw = String(req.socket?.remoteAddress || req.connection?.remoteAddress || '').replace(/^::ffff:/, '');
  const trusted = compileCidrs(settings.trustedProxies || []);
  const fromProxy = trusted.length && trusted.some((c) => ipInCidr(raw, c));
  let ip = raw;
  let proto = req.protocol || 'http';
  if (fromProxy) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (xff.length) ip = xff[0].replace(/^::ffff:/, '');
    const xp = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    if (xp === 'https' || xp === 'http') proto = xp;
  }
  const extra = compileCidrs(settings.localCidrs || []);
  const local = isPrivateIp(ip) || extra.some((c) => ipInCidr(ip, c)) || ip === '127.0.0.1' || ip === '::1';
  return { ip, proto, local, fromProxy, socketIp: raw };
}
