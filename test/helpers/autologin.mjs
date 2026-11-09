// v1.21.2 — préchargement pour les anciens tests (écrits avant l'authentification v1.20) :
// `node --import ./test/helpers/autologin.mjs test/vXXX.js`. Le premier appel fetch() vers un serveur soundtube local
// crée le compte admin (/api/auth/setup, ou /api/auth/login s'il existe déjà) puis ajoute cookie de session + jeton CSRF
// à chaque requête. Les appels qui fournissent déjà cookie / Authorization et les routes /api/auth/* passent tels quels.
// Uniquement pour les tests : rien dans l'application ne contourne l'authentification.
const orig = globalThis.fetch;
const S = new Map();
const CRED = JSON.stringify({ username: 'admin', password: 'test-password-12345' });
async function session(origin) {
  if (S.has(origin)) return S.get(origin);
  const p = (async () => {
    const post = (u) => orig(origin + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: CRED });
    let r = await post('/api/auth/setup');
    if (!r.ok) r = await post('/api/auth/login');
    if (!r.ok) return null; // pas un serveur soundtube (nœud de rendu simulé…) : requêtes inchangées
    const j = await r.json().catch(() => ({}));
    return { cookie: r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '), csrf: j.csrf || r.headers.get('x-csrf-token') };
  })();
  S.set(origin, p);
  try { return await p; } catch (e) { S.delete(origin); throw e; }
}
globalThis.fetch = async (input, init = {}) => {
  let url; try { url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url); } catch { return orig(input, init); }
  if (!/^(127\.0\.0\.1|localhost|\[::1\])$/.test(url.hostname) || url.pathname.startsWith('/api/auth/')) return orig(input, init);
  const h = new Headers(init.headers || (typeof input === 'object' && input.headers) || undefined);
  if (h.has('cookie') || h.has('authorization')) return orig(input, init);
  let s = null; try { s = await session(url.origin); } catch { return orig(input, init); }
  if (!s) return orig(input, init);
  h.set('cookie', s.cookie); if (s.csrf && !h.has('x-csrf-token')) h.set('x-csrf-token', s.csrf);
  return orig(input, { ...init, headers: h });
};
