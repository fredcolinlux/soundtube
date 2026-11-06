import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const CACHE = new Map();

function readPage(code) {
  const file = path.join(PUBLIC, `${code}.html`);
  if (!CACHE.has(file)) {
    try { CACHE.set(file, fs.readFileSync(file, 'utf8')); }
    catch { CACHE.set(file, null); }
  }
  return CACHE.get(file);
}

/** Send branded HTML error page (404/403/500). Falls back to minimal HTML. */
export function sendErrorPage(res, code = 404) {
  const status = [404, 403, 500].includes(+code) ? +code : 404;
  const html = readPage(status);
  res.status(status).type('html').set('Cache-Control', 'no-store');
  if (html) return res.send(html);
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${status}</title></head><body><h1>${status}</h1><p><a href="/accueil">Home</a></p></body></html>`);
}

export function wantsHtml(req) {
  if (req.path?.startsWith('/api/')) return false;
  const a = String(req.headers.accept || '');
  return a.includes('text/html') || !a.includes('application/json');
}
