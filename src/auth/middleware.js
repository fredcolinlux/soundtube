import { msg } from '../i18n-server.js';
import { sendErrorPage, wantsHtml } from '../http-errors.js';
// Middleware : IP client, auth locale vs internet, Admin local-only, CSRF.
import { clientMeta, observeProxyHints } from '../security/ip.js';

const COOKIE = '__Host-soundtube_sess';
const COOKIE_FALLBACK = 'soundtube_sess'; // LAN HTTP (pas de Secure / __Host-)

export function parseCookies(req) {
  const out = {};
  for (const p of String(req.headers.cookie || '').split(';')) {
    const i = p.indexOf('='); if (i < 0) continue;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookieName(https) { return https ? COOKIE : COOKIE_FALLBACK; }

export function setSessionCookie(res, id, { https, maxAgeSec }) {
  const name = sessionCookieName(https);
  const parts = [
    `${name}=${encodeURIComponent(id)}`,
    'Path=/', 'HttpOnly', 'SameSite=Strict',
    `Max-Age=${Math.max(60, maxAgeSec | 0)}`,
  ];
  if (https) parts.push('Secure');
  // __Host- exige Secure + Path=/ + pas de Domain
  if (https) {
    // retire l'ancien cookie non-Host s'il existe
    res.append('Set-Cookie', `${COOKIE_FALLBACK}=; Path=/; Max-Age=0; SameSite=Strict`);
  }
  res.append('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res, https) {
  res.append('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`);
  res.append('Set-Cookie', `${COOKIE_FALLBACK}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`);
}

/**
 * Attache req.clientMeta, req.authUser, req.session, req.apiToken.
 * @param {import('./store.js').AuthStore} auth
 */
export function attachAuth(auth) {
  return async (req, res, next) => {
    try {
      try { auth.syncFromDisk(); } catch {} // v1.21.2 : éditions manuelles / admin-reset prises en compte à chaud
      req.clientMeta = clientMeta(req, auth.security);
      try {
        const hints = observeProxyHints(req, auth.security);
        if (hints.suggestedTrustedProxy || hints.suggestedPublicDomain) auth.observeHints(hints);
      } catch {}
      req.authUser = null; req.session = null; req.apiToken = null; req.csrfToken = null;

      const cookies = parseCookies(req);
      const sid = cookies[COOKIE] || cookies[COOKIE_FALLBACK];
      if (sid) {
        const s = auth.getSession(sid);
        if (s && !s.pending2fa) {
          const u = auth.getUser(s.userId);
          if (u && !u.disabled) {
            req.session = s; req.authUser = u;
            req.csrfToken = auth.ensureCsrf(s.id);
          }
        } else if (s && s.pending2fa) {
          req.session = s; // partial
          req.csrfToken = auth.ensureCsrf(s.id);
        }
      }

      const authz = String(req.headers.authorization || '');
      if (authz.toLowerCase().startsWith('bearer ')) {
        const raw = authz.slice(7).trim();
        const tok = auth.findApiToken(raw);
        if (tok) {
          const u = auth.getUser(tok.userId);
          if (u && !u.disabled) { req.apiToken = tok; req.authUser = u; }
        }
      }
      next();
    } catch (e) { next(e); }
  };
}

/** Admin HTML + /api/admin/* : local uniquement → 404 depuis internet. */
export function requireLocalAdmin(req, res, next) {
  if (!req.clientMeta?.local) {
    if (req.path.startsWith('/api/') || !wantsHtml(req)) {
      return res.status(404).json({ error: msg(req, 'notFound') });
    }
    return sendErrorPage(res, 404);
  }
  next();
}

/**
 * v1.20.1 — session ou Bearer obligatoires pour toute l’API (LAN inclus), sauf allowlist publique.
 * Plus de contournement « IP locale = admin ».
 */
export function requireAuth(allowlist = []) {
  const allow = allowlist.map((r) => (typeof r === 'string' ? { method: '*', path: r } : r));
  return (req, res, next) => {
    const p = req.path;
    for (const a of allow) {
      const methodOk = a.method === '*' || a.method === req.method;
      let pathOk = false;
      if (typeof a.path === 'string') {
        if (a.path.endsWith('*')) pathOk = p.startsWith(a.path.slice(0, -1));
        else pathOk = p === a.path;
      } else if (a.path?.test) pathOk = a.path.test(p);
      if (methodOk && pathOk) return next();
    }
    if (req.authUser) return next();
    return res.status(401).json({ error: msg(req, 'authRequired') });
  };
}
/** @deprecated alias — même comportement que requireAuth (plus de bypass LAN). */
export function requireAuthUnlessLocal(allowlist = []) { return requireAuth(allowlist); }

/** Rôle minimum. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.authUser) return res.status(401).json({ error: msg(req, 'authRequired') });
    if (!roles.includes(req.authUser.role)) return res.status(403).json({ error: msg(req, 'forbidden') });
    next();
  };
}

/** Admin HTML/API : LAN + compte admin connecté. */
export function requireAdminSession(req, res, next) {
  if (!req.clientMeta?.local) {
    if (req.path?.startsWith('/api/') || !wantsHtml(req)) {
      return res.status(404).json({ error: msg(req, 'notFound') });
    }
    return sendErrorPage(res, 404);
  }
  if (!req.authUser) {
    if (req.path?.startsWith('/api/') || !wantsHtml(req)) {
      return res.status(401).json({ error: msg(req, 'authRequired') });
    }
    const nextUrl = encodeURIComponent(req.originalUrl || '/admin');
    return res.redirect('/login?next=' + nextUrl);
  }
  if (req.authUser.role !== 'admin') {
    if (wantsHtml(req) && !req.path?.startsWith('/api/')) return sendErrorPage(res, 403);
    return res.status(403).json({ error: msg(req, 'forbidden') });
  }
  next();
}

/** CSRF pour mutations cookie-session (pas pour Bearer). */
export function requireCsrf(req, res, next) {
  if (req.apiToken) return next(); // Bearer
  if (!req.session) return next(); // auth middleware will 401 on protected routes
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = req.headers['x-csrf-token'] || req.body?.csrf;
  if (!sent || sent !== req.csrfToken) return res.status(403).json({ error: msg(req, 'csrf') });
  next();
}

/** Endpoints dangereux (veille, Ollama, nodes) : local only. */
export function localOnly(req, res, next) {
  if (!req.clientMeta?.local) return res.status(404).json({ error: msg(req, 'notFound') });
  next();
}
