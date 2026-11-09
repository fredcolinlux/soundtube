// v1.21.2 — carte 07 (profil d'écoute) + récupération d'accès admin / 2FA.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v1212-'));
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { totp } = await import('../src/security/totp.js');
const { ensureMasterKey } = await import('../src/security/crypto.js');

// ---------- statique ----------
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
check(/import\s*\{\s*apiFetch\s*\}\s*from\s*['"]\.\/csrf\.js['"]/.test(rd('public/js/admindirector.js')), 'admindirector.js importe apiFetch (carte 07)');
check(/import\s*\{\s*apiFetch\s*\}\s*from\s*['"]\.\/csrf\.js['"]/.test(rd('public/js/ytadmin.js')), 'ytadmin.js importe apiFetch');
check(/setCsrf\(j\.csrf\)/.test(rd('public/js/login.js')), 'login.js reprend le jeton CSRF de la session 2FA');
check(fs.existsSync(path.join(ROOT, 'contexte/gout.example.json')), 'gout.example.json présent');
check(/^contexte\/gout\.json$/m.test(rd('.gitignore')), 'contexte/gout.json ignoré par git (profil perso jamais publié)');

// ---------- clé maître ----------
{
  const d = path.join(tmp, 'mk'); fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'secret.key'), 'abc');
  let threw = false; try { ensureMasterKey(d, { log: { warn() {}, error() {} } }); } catch { threw = true; }
  check(threw && fs.readFileSync(path.join(d, 'secret.key'), 'utf8') === 'abc', 'clé maître invalide → erreur, jamais écrasée');
  const legacy = path.join(tmp, 'legacy'); fs.mkdirSync(legacy);
  const k0 = ensureMasterKey(legacy);
  const d2 = path.join(tmp, 'mk2');
  const k1 = ensureMasterKey(d2, { legacyDirs: [legacy], log: { warn() {}, error() {} } });
  check(k0.equals(k1), 'clé maître migrée depuis l’ancien dossier <app>/data (copie identique)');
  check(ensureMasterKey(d2).equals(k1), 'clé maître stable entre deux démarrages');
}

// ---------- normalisation des fichiers d'auth ----------
{
  const { normalizeAuthData } = await import('../src/auth/store.js');
  for (const shape of [undefined, null, {}, [], '', 42]) {
    const n = normalizeAuthData({ users: shape, sessions: shape, tokens: shape, security: shape });
    check(Array.isArray(n.users.users) && n.sessions.sessions && typeof n.sessions.sessions === 'object' && Array.isArray(n.tokens.tokens)
      && Array.isArray(n.security.trustedProxies) && n.security.sessionTtlHours === 12, `normalizeAuthData(${JSON.stringify(shape)}) → schéma complet`);
  }
  const n = normalizeAuthData({
    users: { users: [{ id: 'u', username: 'a', totpSecret: '', recoveryHashes: null }, null, 'x'] },
    sessions: { sessions: { s1: { userId: 'u' }, s2: null, s3: 'x' } },
    tokens: { tokens: [null, { id: 't' }] },
    security: { trustedProxies: '10.0.0.1, 10.0.0.2', sessionTtlHours: 'abc', legal: null, openRegistration: 'yes' },
  });
  check(n.users.users.length === 1 && n.users.users[0].totpSecret === null && Array.isArray(n.users.users[0].passkeys), 'users : entrées invalides ignorées, champs 2FA normalisés');
  check(Object.keys(n.sessions.sessions).join() === 's1' && n.tokens.tokens.length === 1, 'sessions/tokens : entrées invalides ignorées');
  check(n.security.trustedProxies.length === 2 && n.security.sessionTtlHours === 12 && n.security.legal.fr === '' && n.security.openRegistration === false, 'security : types corrigés');
}

// ---------- serveur ----------
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
async function boot(app, data) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(app, 'src/server.js')], {
    cwd: app, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SOUNDTUBE_DATA_DIR: data, SOUNDTUBE_PORT: String(port), SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_YT_TRANSPORT: 'mock', SOUNDTUBE_SOCIAL_TRANSPORT: 'mock' },
  });
  let log = ''; child.stdout.on('data', (b) => { log += b; }); child.stderr.on('data', (b) => { log += b; });
  const B = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${B}/healthz`)).ok) break; } catch {} await sleep(100); }
  return { B, child, log: () => log, stop: async () => { child.kill('SIGTERM'); await sleep(250); try { child.kill('SIGKILL'); } catch {} } };
}
const cookiesOf = (r) => (r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).filter((c) => !/=$/.test(c)).join('; ');
const J = { 'content-type': 'application/json' };
const PW = 'test-password-12345';

// Copie de l'app SANS profil personnel = installation autonome
const app = path.join(tmp, 'app');
fs.cpSync(ROOT, app, { recursive: true, filter: (s) => !/node_modules|\.git(\/|$)|[\\/]data([\\/]|$)|samples/.test(path.relative(ROOT, s)) && !s.endsWith(path.join('contexte', 'gout.json')) });
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(app, 'node_modules'));
check(!fs.existsSync(path.join(app, 'contexte/gout.json')), 'copie autonome sans gout.json personnel');

const data = path.join(tmp, 'srv'); fs.mkdirSync(data);
let s = await boot(app, data);
let secret;
try {
  let r = await fetch(`${s.B}/api/auth/setup`, { method: 'POST', headers: J, body: JSON.stringify({ username: 'admin', password: PW }) });
  let j = await r.json(); let cookie = cookiesOf(r); let csrf = j.csrf;
  check(r.ok, `setup admin (${r.status})`);
  const H = () => ({ ...J, cookie, 'x-csrf-token': csrf });

  // carte 07 : profil générique + restauration
  let g = await fetch(`${s.B}/api/admin/director`, { headers: H() }); j = await g.json();
  check(g.ok && j.profile && j.generic === true, `GET /api/admin/director autonome → exemple générique (${g.status})`);
  check((j.taste || '').length > 20, 'texte de goût non vide');
  let p = await fetch(`${s.B}/api/admin/director`, { method: 'PUT', headers: H(), body: JSON.stringify({ reset: true }) }); j = await p.json();
  check(p.ok && j.restore?.generic === true && /exemple|example|générique|generic/i.test(j.message || j.restore?.message || ''), `PUT reset → exemple générique + message (${p.status})`);
  check(fs.existsSync(path.join(data, 'gout.json')), 'profil actif persisté dans dataDir (survit aux patchs)');
  const fake = { name: 'Profil test', topArtists: ['Artiste Test A', 'Artiste Test B'], sound: 'test', genres: ['test'] };
  fs.writeFileSync(path.join(data, 'gout.shipped.json'), JSON.stringify(fake));
  p = await fetch(`${s.B}/api/admin/director`, { method: 'PUT', headers: H(), body: JSON.stringify({ reset: true }) }); j = await p.json();
  check(p.ok && j.restore?.generic !== true && /Artiste Test A/.test(JSON.stringify(j.profile || {})), 'reset avec profil livré privé (dataDir) → profil perso restauré');
  p = await fetch(`${s.B}/api/admin/director`, { method: 'PUT', headers: { ...J, cookie }, body: JSON.stringify({ reset: true }) });
  check(p.status === 403, `PUT sans CSRF → 403 lisible (${p.status})`);

  // 2FA : activation puis connexion telle que la fait login.js
  r = await fetch(`${s.B}/api/auth/totp/begin`, { method: 'POST', headers: H(), body: '{}' }); j = await r.json();
  secret = String(j.secret || '').replace(/\s/g, '');
  r = await fetch(`${s.B}/api/auth/totp/confirm`, { method: 'POST', headers: H(), body: JSON.stringify({ code: totp(secret) }) });
  check(r.ok && secret.length >= 16, `TOTP activé (${r.status})`);
  r = await fetch(`${s.B}/api/auth/login`, { method: 'POST', headers: J, body: JSON.stringify({ username: 'admin', password: PW }) }); j = await r.json();
  const c2 = cookiesOf(r);
  check(j.needs2fa && j.csrf && r.headers.get('x-csrf-token') === j.csrf, 'login → needs2fa + jeton CSRF (corps et en-tête)');
  r = await fetch(`${s.B}/api/auth/2fa`, { method: 'POST', headers: { ...J, cookie: c2, 'x-csrf-token': j.csrf }, body: JSON.stringify({ code: totp(secret), recovery: 'champ-autorempli' }) });
  check(r.ok, `2FA : code valide accepté même si le champ récupération est prérempli (${r.status})`);
  r = await fetch(`${s.B}/api/auth/login`, { method: 'POST', headers: J, body: JSON.stringify({ username: 'admin', password: PW }) }); j = await r.json();
  const c3 = cookiesOf(r);
  const prev = totp(secret, 30, 6, Date.now() - 30_000);
  r = await fetch(`${s.B}/api/auth/2fa`, { method: 'POST', headers: { ...J, cookie: c3, 'x-csrf-token': j.csrf }, body: JSON.stringify({ code: prev }) });
  check(r.ok, `2FA : code du pas précédent accepté (fenêtre ±1) (${r.status})`);
} finally { await s.stop(); }

// ---------- secret TOTP indéchiffrable → message clair, pas d'erreur opaque ----------
{
  const key = fs.readFileSync(path.join(data, 'secret.key'));
  fs.writeFileSync(path.join(data, 'secret.key'), Buffer.alloc(32, 7).toString('base64'));
  s = await boot(app, data);
  try {
    let r = await fetch(`${s.B}/api/auth/login`, { method: 'POST', headers: J, body: JSON.stringify({ username: 'admin', password: PW }) }); let j = await r.json();
    r = await fetch(`${s.B}/api/auth/2fa`, { method: 'POST', headers: { ...J, cookie: cookiesOf(r), 'x-csrf-token': j.csrf }, body: JSON.stringify({ code: '123456' }) }); j = await r.json();
    check(r.status === 500 && /admin-reset/.test(j.error || ''), 'clé maître différente → erreur explicite renvoyant vers admin-reset');
  } finally { await s.stop(); }
  fs.writeFileSync(path.join(data, 'secret.key'), key);
}

// ---------- admin-reset.js ----------
const reset = (args, extra = {}) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/admin-reset.js'), ...args], { encoding: 'utf8', env: { ...process.env, SOUNDTUBE_DATA_DIR: data, ...extra }, input: '' });
{
  const asUser = reset(['admin', '--disable-2fa'], { SOUNDTUBE_ALLOW_NONROOT: '' });
  if (process.getuid?.() !== 0) check(asUser.status !== 0 && /root/.test(asUser.stderr), 'admin-reset refusé hors root');
  const remote = reset(['admin', '--disable-2fa'], { SOUNDTUBE_ALLOW_NONROOT: '1', SSH_CONNECTION: '203.0.113.9 5555 10.0.0.2 22' });
  check(remote.status !== 0 && /LAN/.test(remote.stderr), 'admin-reset refusé depuis une session SSH hors LAN');
  const noTty = reset(['admin', '--password', '--no-restart'], { SOUNDTUBE_ALLOW_NONROOT: '1' });
  check(noTty.status !== 0 && /TTY|terminal/.test(noTty.stderr + noTty.stdout), '--password exige un TTY (pas de mot de passe en argument)');
  const unknown = reset(['nobody', '--disable-2fa', '--no-restart'], { SOUNDTUBE_ALLOW_NONROOT: '1' });
  check(unknown.status !== 0, 'utilisateur inconnu → erreur');
  const ok = reset(['admin', '--disable-2fa', '--no-restart'], { SOUNDTUBE_ALLOW_NONROOT: '1' });
  check(ok.status === 0, `admin-reset --disable-2fa (${ok.status}) ${ok.stderr.trim()}`);
  const users = JSON.parse(fs.readFileSync(path.join(data, 'users.json'), 'utf8')).users;
  const a = users.find((u) => u.username === 'admin');
  check(a.totpSecret === null && a.recoveryHashes.length === 0 && !a.disabled, '2FA supprimée, compte réactivé');
  const sess = JSON.parse(fs.readFileSync(path.join(data, 'sessions.json'), 'utf8')).sessions;
  check(!Object.values(sess).some((x) => x.userId === a.id), 'sessions de l’utilisateur révoquées');
  const audit = fs.readFileSync(path.join(data, 'audit.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  check(audit.some((e) => e.action === 'admin.cli_reset' && e.changes.includes('2fa_disabled')), 'entrée audit admin.cli_reset');
  check((fs.statSync(path.join(data, 'users.json')).mode & 0o777) === 0o600, 'users.json en 0600');
}

// ---------- tolérance aux éditions manuelles (totpSecret null, sessions.json vide) ----------
for (const content of ['', '{}', 'null', '[]', '{"sessions":null}']) {
  fs.writeFileSync(path.join(data, 'sessions.json'), content);
  fs.writeFileSync(path.join(data, 'api-tokens.json'), content);
  fs.writeFileSync(path.join(data, 'security.json'), content === '' ? '{"trustedProxies":"","sessionTtlHours":null}' : content);
  const users = JSON.parse(fs.readFileSync(path.join(data, 'users.json'), 'utf8'));
  for (const u of users.users) { u.totpSecret = null; delete u.recoveryHashes; delete u.passkeys; }
  fs.writeFileSync(path.join(data, 'users.json'), JSON.stringify(users));
  s = await boot(app, data);
  try {
    const r = await fetch(`${s.B}/api/auth/login`, { method: 'POST', headers: J, body: JSON.stringify({ username: 'admin', password: PW }) }); const j = await r.json();
    check(r.ok && !j.needs2fa, `sessions.json=${JSON.stringify(content)} + totpSecret null → connexion sans 2FA (${r.status})`);
    const me = await fetch(`${s.B}/api/me`, { headers: { cookie: cookiesOf(r) } }).then((x) => x.json());
    check(me.authenticated === true, '  … session valide');
  } finally { await s.stop(); }
}

// ---------- service EN MARCHE : admin-reset / édition manuelle jamais écrasées ----------
{
  s = await boot(app, data);
  try {
    const login = async () => { const r = await fetch(`${s.B}/api/auth/login`, { method: 'POST', headers: J, body: JSON.stringify({ username: 'admin', password: PW }) }); return { r, j: await r.json(), cookie: cookiesOf(r) }; };
    const enable = async () => {
      const { j, cookie } = await login(); const H = { ...J, cookie, 'x-csrf-token': j.csrf };
      const b = await (await fetch(`${s.B}/api/auth/totp/begin`, { method: 'POST', headers: H, body: '{}' })).json();
      const sec = String(b.secret || '').replace(/\s/g, '');
      return (await fetch(`${s.B}/api/auth/totp/confirm`, { method: 'POST', headers: H, body: JSON.stringify({ code: totp(sec) }) })).ok;
    };
    check(await enable(), 'live : TOTP réactivé');
    check((await login()).j.needs2fa === true, 'live : la connexion demande la 2FA');
    await sleep(20);
    const rr = reset(['admin', '--disable-2fa', '--no-reload'], { SOUNDTUBE_ALLOW_NONROOT: '1' });
    check(rr.status === 0, 'live : admin-reset pendant que le service tourne');
    let l = await login();
    check(l.r.ok && !l.j.needs2fa, 'live : connexion sans 2FA immédiatement, sans redémarrage');
    const after = JSON.parse(fs.readFileSync(path.join(data, 'users.json'), 'utf8')).users.find((u) => u.username === 'admin');
    check(after.totpSecret === null, 'live : users.json non réécrit depuis la mémoire périmée');
    check(await enable(), 'live : TOTP réactivé (2)');
    await sleep(20);
    const uj = JSON.parse(fs.readFileSync(path.join(data, 'users.json'), 'utf8')); uj.users.forEach((u) => { u.totpSecret = null; });
    fs.writeFileSync(path.join(data, 'users.json'), JSON.stringify(uj, null, 2)); fs.writeFileSync(path.join(data, 'sessions.json'), '{}');
    l = await login();
    check(l.r.ok && !l.j.needs2fa, `live : édition manuelle (totpSecret null + sessions {}) prise en compte à chaud (${l.r.status})`);
    const me = await fetch(`${s.B}/api/me`, { headers: { cookie: l.cookie } }).then((x) => x.json());
    check(me.authenticated === true && JSON.parse(fs.readFileSync(path.join(data, 'users.json'), 'utf8')).users[0].totpSecret === null, 'live : session OK et édition manuelle conservée');
  } finally { await s.stop(); }
}

// ---------- propriétaire conservé quand root écrit (service = utilisateur soundtube) ----------
if (process.getuid?.() === 0) {
  const d = path.join(tmp, 'own'); fs.mkdirSync(d); fs.chownSync(d, 4242, 4242);
  const { AuthStore } = await import('../src/auth/store.js');
  const st = new AuthStore(d);
  await st.createUser?.({ username: 'admin', password: PW, role: 'admin' });
  st.saveSessions(); st.audit('test', {});
  const files = fs.readdirSync(d).filter((f) => !f.includes('.tmp'));
  check(files.length >= 3 && files.every((f) => fs.statSync(path.join(d, f)).uid === 4242), `root → fichiers d'auth gardent le propriétaire du dossier (${files.join(', ')})`);
  const rr = spawnSync(process.execPath, [path.join(ROOT, 'scripts/admin-reset.js'), 'admin', '--disable-2fa', '--no-restart'], { encoding: 'utf8', env: { ...process.env, SOUNDTUBE_DATA_DIR: d } });
  check(rr.status === 0 && ['users.json', 'sessions.json', 'audit.jsonl'].every((f) => fs.statSync(path.join(d, f)).uid === 4242), `admin-reset (root) → propriétaire conservé ${rr.stderr.trim()}`);
} else console.log('(info) test propriétaire root ignoré : relancer avec sudo pour le couvrir');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests v1.21.2 OK');
process.exit(fail ? 1 : 0);
