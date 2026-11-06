// Jeton CSRF (session cookie) — récupéré via /api/auth/status ou /api/auth/me
let csrf = null;
let authUser = null;
let authLocal = true;

export function getCsrf() { return csrf; }
export function getAuthUser() { return authUser; }
export function isLocal() { return authLocal; }

export async function refreshAuth() {
  try {
    const r = await fetch('/api/auth/status', { credentials: 'same-origin' });
    const j = await r.json();
    csrf = j.csrf || null;
    authUser = j.user || null;
    authLocal = !!j.local;
    if (j.setupRequired && j.local && !location.pathname.startsWith('/setup')) {
      // ne redirige pas automatiquement depuis login
    }
    return j;
  } catch { return null; }
}

export async function apiFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const method = (opts.method || 'GET').toUpperCase();
  if (opts.body && !headers['content-type'] && !headers['Content-Type']) headers['content-type'] = 'application/json';
  if (csrf && !['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['x-csrf-token'] = csrf;
  const r = await fetch(url, { credentials: 'same-origin', ...opts, headers });
  const fresh = r.headers.get('x-csrf-token');
  if (fresh) csrf = fresh;
  return r;
}
