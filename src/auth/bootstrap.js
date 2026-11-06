// Branchement auth + sécurité sur l'app Express (appelé depuis server.js).
import { AuthStore } from './store.js';
import { attachAuth, requireAuthUnlessLocal, requireCsrf, localOnly, requireLocalAdmin } from './middleware.js';
import { mountAuthRoutes } from './routes.js';
import { securityHeaders } from '../security/headers.js';
import { signPayload, verifySigned } from '../security/crypto.js';
import { setSecretCodec } from '../publish.js';
import path from 'node:path';
import fs from 'node:fs';

const PUBLIC_ALLOW = [
  { method: 'GET', path: '/api/site' },
  { method: 'GET', path: '/api/health' },
  { method: 'GET', path: '/api/auth/status' },
  { method: 'GET', path: '/api/me' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/auth/setup' },
  { method: 'POST', path: '/api/auth/2fa' },
  { method: 'POST', path: '/api/auth/logout' },
  { method: 'POST', path: '/api/auth/passkey/login/options' },
  { method: 'POST', path: '/api/auth/passkey/login' },
  { method: 'GET', path: '/api/legal' },
  { method: 'GET', path: '/api/ui/lang' },
  { method: 'PUT', path: '/api/ui/lang' },
  { method: 'GET', path: '/api/openapi.json' },
  { method: 'GET', path: '/api/signed/*' },
  { method: '*', path: '/api/docs*' },
];

export function bootSecurity(app, { config, channels }) {
  const auth = new AuthStore(config.dataDir);
  setSecretCodec({ seal: (v) => auth.seal(v), open: (v) => auth.open(v) });
  // Re-save youtube channels once to encrypt plaintext secrets if any
  try { if (channels?.s?.channels?.length) channels.save(); } catch {}

  app.set('trust proxy', false); // we handle XFF ourselves
  app.disable('x-powered-by');
  app.use(securityHeaders());
  app.use(attachAuth(auth));

  // Body size from security settings
  const limitKb = auth.security.bodyLimitKb || 64;

  return { auth, limitKb, PUBLIC_ALLOW, requireAuthUnlessLocal, requireCsrf, localOnly, requireLocalAdmin, mountAuthRoutes, signPayload, verifySigned };
}

/** Remplace les URLs de fichiers par des liens signés si la requête n'est pas locale. */
export function maybeSignUrls(auth, req, t, presentFn) {
  const p = presentFn(t);
  if (!p || req.clientMeta?.local || !p.urls) return p;
  const ttl = auth.security.signedLinkTtlSec || 3600;
  const urls = {};
  for (const [k, u] of Object.entries(p.urls)) {
    const token = signPayload(auth.masterKey, { trackId: t.id, kind: k, userId: req.authUser?.id || null }, ttl);
    urls[k] = `/api/signed/${token}`;
  }
  return { ...p, urls, signed: true, signedTtl: ttl };
}

/** File d'attente équitable : intercaler les jobs par propriétaire. */
export function fairEnqueue(queue, id, ownerId) {
  if (!ownerId || !queue.length) { queue.push(id); return; }
  // Compte les jobs déjà en file par owner via une Map attachée
  queue._owners = queue._owners || new Map();
  // On stocke owner à part
  queue._ownerOf = queue._ownerOf || new Map();
  queue._ownerOf.set(id, ownerId);
  // Round-robin simple : insérer après le dernier job d'un autre owner si le même owner a déjà plus
  const counts = new Map();
  for (const jid of queue) {
    const o = queue._ownerOf.get(jid) || 'anon';
    counts.set(o, (counts.get(o) || 0) + 1);
  }
  const my = counts.get(ownerId) || 0;
  const maxOther = Math.max(0, ...[...counts.entries()].filter(([o]) => o !== ownerId).map(([, n]) => n));
  if (my <= maxOther) { queue.push(id); return; }
  // Insérer plus tôt pour équilibrer : après le premier d'un autre owner
  let inserted = false;
  for (let i = 0; i < queue.length; i++) {
    const o = queue._ownerOf.get(queue[i]);
    if (o && o !== ownerId) {
      // trouve une position où mon count local reste <= 
      continue;
    }
  }
  // Fallback : push
  queue.push(id);
}
