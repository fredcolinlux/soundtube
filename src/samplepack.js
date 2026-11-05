// v1.16.0 : index du pack d'échantillons du CT (chemin, taille, SHA-1) pour le synchroniser vers les agents de rendu.
// Calculé une fois (≈ 1 s pour ~150 Mo), mis en cache dans <données>/sample-index.json (revalidé par taille + date).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SAMPLE_DIR } from './engine/sampler.js';

function walk(dir, rel = '', out = []) {
  let list = []; try { list = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { return out; }
  for (const d of list.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) walk(dir, r, out); else if (d.isFile() && !d.name.startsWith('.')) out.push(r);
  }
  return out;
}
let mem = null;
/** { dir, hash, files: [{ path, size, sha1 }], bytes } ou null si aucun pack. */
export function sampleIndex(dataDir = null, dir = SAMPLE_DIR) {
  const list = walk(dir); if (!list.length) return null;
  const stats = list.map((p) => { const s = fs.statSync(path.join(dir, p)); return { path: p, size: s.size, mtime: Math.round(s.mtimeMs) }; });
  const sig = crypto.createHash('sha1').update(JSON.stringify(stats)).digest('hex');
  if (mem?.sig === sig && mem.dir === dir) return mem.idx;
  const cf = dataDir ? path.join(dataDir, 'sample-index.json') : null;
  try { const c = JSON.parse(fs.readFileSync(cf, 'utf8')); if (c.sig === sig && c.dir === dir) { mem = { sig, dir, idx: c.idx }; return c.idx; } } catch {}
  const files = stats.map((s) => ({ path: s.path, size: s.size, sha1: crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, s.path))).digest('hex') }));
  const hash = crypto.createHash('sha256').update(files.map((f) => `${f.path}\t${f.size}\t${f.sha1}`).join('\n')).digest('hex').slice(0, 16);
  const idx = { dir, hash, files, bytes: files.reduce((a, f) => a + f.size, 0) };
  mem = { sig, dir, idx };
  if (cf) try { fs.writeFileSync(cf, JSON.stringify({ sig, dir, idx })); } catch {}
  return idx;
}
