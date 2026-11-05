// soundtube v1.16.0 — identité du moteur audio (partagée entre le CT et l'agent).
// Empreinte = SHA-256 des sources du moteur (engine/*.js + titles.js), dans un ordre fixe. Deux machines qui ont la même
// empreinte exécutent exactement le même code de synthèse : c'est la condition (nécessaire) d'un rendu identique au bit près.
// Le CT refuse d'envoyer un rendu audio à un agent dont l'empreinte diffère (message clair, rendu repris sur le CT).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Version du protocole audio CT ↔ agent (indépendante du SPEC_VERSION vidéo). */
export const AUDIO_PROTOCOL = 1;

/** Fichiers du moteur sous root (root = src/ du CT, ou core/ de l'agent). */
export function engineFiles(root) {
  const dir = path.join(root, 'engine');
  const list = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort().map((f) => 'engine/' + f);
  return [...list, 'titles.js'];
}

const cache = new Map();
/** { hash (12 hex), full, version, files } — version = version de soundtube qui a fourni ce moteur. */
export function engineId(root) {
  if (cache.has(root)) return cache.get(root);
  const h = crypto.createHash('sha256'), files = engineFiles(root);
  for (const f of files) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(root, f))); h.update('\0'); }
  const full = h.digest('hex');
  let version = null;
  try { version = JSON.parse(fs.readFileSync(path.join(root, 'ENGINE.json'), 'utf8')).version || null; } catch {}
  if (!version) try { version = JSON.parse(fs.readFileSync(path.join(root, '..', 'package.json'), 'utf8')).version || null; } catch {}
  const r = { hash: full.slice(0, 12), full, version, files: files.length };
  cache.set(root, r); return r;
}
export const engineLabel = (e) => (e ? `${e.version || '?'} · ${e.hash}` : '—');
