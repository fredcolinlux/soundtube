// Sauvegarde / restauration utilisateurs + réglages sécurité (+ secret.key).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FILES = ['users.json', 'sessions.json', 'api-tokens.json', 'security.json', 'secret.key', 'audit.jsonl'];

export function backupAuth(dataDir, outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const args = ['czf', outFile, '-C', dataDir, ...FILES.filter((f) => fs.existsSync(path.join(dataDir, f)))];
  const r = spawnSync('tar', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || 'tar backup failed');
  try { fs.chmodSync(outFile, 0o600); } catch {}
  return outFile;
}

export function restoreAuth(dataDir, tarFile) {
  if (!fs.existsSync(tarFile)) throw new Error('Archive introuvable');
  const r = spawnSync('tar', ['xzf', tarFile, '-C', dataDir], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || 'tar restore failed');
  for (const f of FILES) {
    const p = path.join(dataDir, f);
    if (fs.existsSync(p)) try { fs.chmodSync(p, 0o600); } catch {}
  }
}
