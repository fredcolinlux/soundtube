// Utilisateurs, sessions, jetons API, journal d'audit, réglages d'exposition — fichiers JSON 0600.
import fs from 'node:fs';
import path from 'node:path';
import {
  ensureMasterKey, hashPassword, verifyPassword, hashToken, randomId, randomToken,
  encrypt, decrypt,
} from '../security/crypto.js';
import { generateSecret, verifyTotp, otpauthUrl, makeRecoveryCodes, consumeRecovery } from '../security/totp.js';

const ROLES = ['admin', 'creator', 'viewer'];
const DEFAULT_QUOTA = { generationsPerDay: 50, maxDuration: 3600 };
const DEFAULT_SEC = {
  trustedProxies: [],
  localCidrs: [],
  publicDomain: '',
  sessionTtlHours: 12,
  loginMaxAttempts: 5,
  loginLockMinutes: 15,
  signedLinkTtlSec: 3600,
  legal: { fr: '', en: '' },
  bodyLimitKb: 64,
};

function writePrivate(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data, null, 2), { mode: 0o600 });
  try { fs.chmodSync(tmp, 0o600); } catch {}
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch {}
}
function readJson(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return fallback;
}

export class AuthStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
    this.masterKey = ensureMasterKey(dataDir);
    this.usersFile = path.join(dataDir, 'users.json');
    this.sessionsFile = path.join(dataDir, 'sessions.json');
    this.tokensFile = path.join(dataDir, 'api-tokens.json');
    this.secFile = path.join(dataDir, 'security.json');
    this.auditFile = path.join(dataDir, 'audit.jsonl');
    this.users = readJson(this.usersFile, { users: [] });
    this.sessions = readJson(this.sessionsFile, { sessions: {} });
    this.tokens = readJson(this.tokensFile, { tokens: [] });
    this.security = { ...DEFAULT_SEC, ...readJson(this.secFile, {}) };
    this.challenges = new Map(); // webauthn / login pending 2fa
    this.loginFails = new Map(); // ip|user -> { n, until }
    this.csrf = new Map(); // sessionId -> token
    // migrate encrypted fields lazily
  }

  saveUsers() { writePrivate(this.usersFile, this.users); }
  saveSessions() { writePrivate(this.sessionsFile, this.sessions); }
  saveTokens() { writePrivate(this.tokensFile, this.tokens); }
  saveSecurity() { writePrivate(this.secFile, this.security); }

  needsSetup() { return !this.users.users.some((u) => u.role === 'admin' && !u.disabled); }

  publicUser(u) {
    if (!u) return null;
    return {
      id: u.id, username: u.username, role: u.role, disabled: !!u.disabled,
      totpEnabled: !!u.totpSecret, passkeys: (u.passkeys || []).length,
      quota: { ...DEFAULT_QUOTA, ...(u.quota || {}) },
      createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null,
    };
  }

  getUser(id) { return this.users.users.find((u) => u.id === id) || null; }
  byUsername(name) {
    const n = String(name || '').trim().toLowerCase();
    return this.users.users.find((u) => u.username.toLowerCase() === n) || null;
  }

  async createUser({ username, password, role = 'creator', quota }, actor = null) {
    const name = String(username || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(name)) { const e = new Error('Nom d’utilisateur invalide (3–32, a-z 0-9 ._-).'); e.status = 400; throw e; }
    if (this.byUsername(name)) { const e = new Error('Nom déjà pris'); e.status = 409; throw e; }
    if (!ROLES.includes(role)) { const e = new Error('Rôle inconnu'); e.status = 400; throw e; }
    if (!password || String(password).length < 10) { const e = new Error('Mot de passe trop court (min. 10)'); e.status = 400; throw e; }
    const u = {
      id: randomId(8), username: name, role, disabled: false,
      passwordHash: await hashPassword(password),
      totpSecret: null, recoveryHashes: [], passkeys: [],
      quota: { ...DEFAULT_QUOTA, ...(quota || {}) },
      createdAt: new Date().toISOString(), lastLoginAt: null, genDay: { day: '', count: 0 },
    };
    this.users.users.push(u); this.saveUsers();
    this.audit('user.create', { actorId: actor?.id, userId: u.id, username: u.username, role });
    return this.publicUser(u);
  }

  async updateUser(id, patch, actor = null) {
    const u = this.getUser(id); if (!u) { const e = new Error('Utilisateur introuvable'); e.status = 404; throw e; }
    if (patch.role && ROLES.includes(patch.role)) u.role = patch.role;
    if (patch.disabled !== undefined) u.disabled = !!patch.disabled;
    if (patch.quota && typeof patch.quota === 'object') u.quota = { ...DEFAULT_QUOTA, ...u.quota, ...patch.quota };
    if (patch.password) {
      if (String(patch.password).length < 10) { const e = new Error('Mot de passe trop court (min. 10)'); e.status = 400; throw e; }
      u.passwordHash = await hashPassword(patch.password);
      // invalidate sessions
      for (const [sid, s] of Object.entries(this.sessions.sessions)) if (s.userId === id) delete this.sessions.sessions[sid];
      this.saveSessions();
    }
    this.saveUsers();
    this.audit('user.update', { actorId: actor?.id, userId: id, keys: Object.keys(patch) });
    return this.publicUser(u);
  }

  deleteUser(id, actor = null) {
    const i = this.users.users.findIndex((u) => u.id === id);
    if (i < 0) { const e = new Error('Utilisateur introuvable'); e.status = 404; throw e; }
    const admins = this.users.users.filter((u) => u.role === 'admin' && !u.disabled && u.id !== id);
    if (this.users.users[i].role === 'admin' && !admins.length) { const e = new Error('Impossible de supprimer le dernier admin'); e.status = 409; throw e; }
    const [u] = this.users.users.splice(i, 1); this.saveUsers();
    for (const [sid, s] of Object.entries(this.sessions.sessions)) if (s.userId === id) delete this.sessions.sessions[sid];
    this.saveSessions();
    this.tokens.tokens = this.tokens.tokens.filter((t) => t.userId !== id); this.saveTokens();
    this.audit('user.delete', { actorId: actor?.id, userId: id, username: u.username });
  }

  listUsers() { return this.users.users.map((u) => this.publicUser(u)); }

  /* ---- login lockout ---- */
  lockKey(ip, username) { return `${ip}|${String(username || '').toLowerCase()}`; }
  isLocked(ip, username) {
    const k = this.lockKey(ip, username), e = this.loginFails.get(k);
    if (!e) return false;
    if (e.until && e.until > Date.now()) return true;
    if (e.until && e.until <= Date.now()) { this.loginFails.delete(k); return false; }
    return false;
  }
  noteFail(ip, username) {
    const k = this.lockKey(ip, username), e = this.loginFails.get(k) || { n: 0, until: 0 };
    e.n++;
    if (e.n >= (this.security.loginMaxAttempts || 5)) {
      e.until = Date.now() + (this.security.loginLockMinutes || 15) * 60_000;
      this.audit('login.lock', { ip, username });
      console.warn(`[soundtube-auth] Failed password for ${username} from ${ip} — locked`);
    } else {
      console.warn(`[soundtube-auth] Failed password for ${username} from ${ip}`);
    }
    this.loginFails.set(k, e);
    this.audit('login.fail', { ip, username, n: e.n });
  }
  clearFails(ip, username) { this.loginFails.delete(this.lockKey(ip, username)); }

  async authenticatePassword(username, password, ip) {
    if (this.isLocked(ip, username)) { const e = new Error('Compte temporairement verrouillé. Réessayez plus tard.'); e.status = 429; throw e; }
    const u = this.byUsername(username);
    if (!u || u.disabled || !(await verifyPassword(password, u.passwordHash))) {
      this.noteFail(ip, username);
      const e = new Error('Identifiants incorrects'); e.status = 401; throw e;
    }
    this.clearFails(ip, username);
    return u;
  }

  /* ---- sessions ---- */
  createSession(user, { ip, ua, pending2fa = false } = {}) {
    const id = randomToken(32);
    const ttl = (this.security.sessionTtlHours || 12) * 3600_000;
    const s = {
      id, userId: user.id, createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttl).toISOString(),
      ip, ua: String(ua || '').slice(0, 200), pending2fa: !!pending2fa,
    };
    this.sessions.sessions[id] = s; this.saveSessions();
    const csrf = randomToken(24); this.csrf.set(id, csrf);
    return { session: s, csrf };
  }

  getSession(id) {
    const s = this.sessions.sessions[id];
    if (!s) return null;
    if (new Date(s.expiresAt).getTime() < Date.now()) { delete this.sessions.sessions[id]; this.saveSessions(); return null; }
    return s;
  }

  destroySession(id) {
    delete this.sessions.sessions[id]; this.csrf.delete(id); this.saveSessions();
  }

  touchLogin(user) {
    user.lastLoginAt = new Date().toISOString(); this.saveUsers();
  }

  /* ---- CSRF ---- */
  csrfOf(sessionId) { return this.csrf.get(sessionId) || null; }
  ensureCsrf(sessionId) {
    if (!this.csrf.has(sessionId)) this.csrf.set(sessionId, randomToken(24));
    return this.csrf.get(sessionId);
  }

  /* ---- API tokens ---- */
  async createApiToken(userId, { name, scopes = ['api'], ttlDays = 365 } = {}) {
    const raw = 'st_' + randomToken(32);
    const t = {
      id: randomId(8), userId, name: String(name || 'api').slice(0, 60),
      hash: hashToken(raw), scopes, createdAt: new Date().toISOString(),
      expiresAt: ttlDays ? new Date(Date.now() + ttlDays * 86400e3).toISOString() : null,
      lastUsedAt: null,
    };
    this.tokens.tokens.push(t); this.saveTokens();
    this.audit('token.create', { userId, tokenId: t.id, name: t.name });
    return { token: { id: t.id, name: t.name, scopes: t.scopes, createdAt: t.createdAt, expiresAt: t.expiresAt }, raw };
  }

  findApiToken(raw) {
    const h = hashToken(raw);
    const t = this.tokens.tokens.find((x) => x.hash === h);
    if (!t) return null;
    if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now()) return null;
    t.lastUsedAt = new Date().toISOString(); this.saveTokens();
    return t;
  }

  revokeApiToken(id, actor = null) {
    const i = this.tokens.tokens.findIndex((t) => t.id === id);
    if (i < 0) { const e = new Error('Jeton introuvable'); e.status = 404; throw e; }
    const [t] = this.tokens.tokens.splice(i, 1); this.saveTokens();
    this.audit('token.revoke', { actorId: actor?.id, tokenId: id, userId: t.userId });
  }

  listApiTokens(userId = null) {
    return this.tokens.tokens
      .filter((t) => !userId || t.userId === userId)
      .map(({ hash, ...t }) => t);
  }

  /* ---- TOTP ---- */
  async beginTotp(user) {
    const secret = generateSecret();
    this.challenges.set('totp:' + user.id, { secret, at: Date.now() });
    return { secret, url: otpauthUrl(secret, user.username) };
  }
  async confirmTotp(user, code) {
    const ch = this.challenges.get('totp:' + user.id);
    if (!ch || Date.now() - ch.at > 600_000) { const e = new Error('Défi TOTP expiré'); e.status = 400; throw e; }
    if (!verifyTotp(ch.secret, code)) { const e = new Error('Code invalide'); e.status = 401; throw e; }
    user.totpSecret = encrypt(this.masterKey, ch.secret);
    const { codes, hashes } = await makeRecoveryCodes();
    user.recoveryHashes = hashes;
    this.challenges.delete('totp:' + user.id);
    this.saveUsers();
    this.audit('totp.enable', { userId: user.id });
    return { recoveryCodes: codes };
  }
  disableTotp(user) {
    user.totpSecret = null; user.recoveryHashes = []; this.saveUsers();
    this.audit('totp.disable', { userId: user.id });
  }
  totpSecretOf(user) {
    if (!user.totpSecret) return null;
    return decrypt(this.masterKey, user.totpSecret);
  }
  async verifyUser2fa(user, { code, recovery } = {}) {
    if (recovery) {
      const r = await consumeRecovery(recovery, user.recoveryHashes || []);
      if (!r.ok) return false;
      user.recoveryHashes = r.hashes; this.saveUsers(); return true;
    }
    const secret = this.totpSecretOf(user);
    return secret ? verifyTotp(secret, code) : false;
  }

  /* ---- quotas ---- */
  checkQuota(user, durationSec) {
    if (!user) return null;
    const q = { ...DEFAULT_QUOTA, ...(user.quota || {}) };
    if (durationSec != null && durationSec > q.maxDuration) {
      return `Durée max pour ton compte : ${q.maxDuration} s`;
    }
    const day = new Date().toISOString().slice(0, 10);
    if (user.genDay?.day !== day) user.genDay = { day, count: 0 };
    if (user.genDay.count >= q.generationsPerDay) {
      return `Quota journalier atteint (${q.generationsPerDay} générations)`;
    }
    return null;
  }
  bumpQuota(user) {
    if (!user) return;
    const day = new Date().toISOString().slice(0, 10);
    if (user.genDay?.day !== day) user.genDay = { day, count: 0 };
    user.genDay.count++; this.saveUsers();
  }

  /* ---- security settings ---- */
  securityView() {
    return { ...this.security, legal: { ...(this.security.legal || {}) } };
  }
  updateSecurity(patch) {
    const s = this.security;
    if (Array.isArray(patch.trustedProxies)) s.trustedProxies = patch.trustedProxies.map(String).map((x) => x.trim()).filter(Boolean);
    if (Array.isArray(patch.localCidrs)) s.localCidrs = patch.localCidrs.map(String).map((x) => x.trim()).filter(Boolean);
    if (patch.publicDomain !== undefined) s.publicDomain = String(patch.publicDomain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    for (const k of ['sessionTtlHours', 'loginMaxAttempts', 'loginLockMinutes', 'signedLinkTtlSec', 'bodyLimitKb']) {
      if (patch[k] != null && Number.isFinite(+patch[k])) s[k] = +patch[k];
    }
    if (patch.legal && typeof patch.legal === 'object') {
      s.legal = s.legal || {};
      if (patch.legal.fr !== undefined) s.legal.fr = String(patch.legal.fr).slice(0, 20000);
      if (patch.legal.en !== undefined) s.legal.en = String(patch.legal.en).slice(0, 20000);
    }
    this.saveSecurity();
    this.audit('security.update', { keys: Object.keys(patch) });
    return this.securityView();
  }

  /* ---- audit ---- */
  audit(action, detail = {}) {
    const line = JSON.stringify({ at: new Date().toISOString(), action, ...detail }) + '\n';
    try { fs.appendFileSync(this.auditFile, line, { mode: 0o600 }); } catch {}
  }
  readAudit({ limit = 100 } = {}) {
    try {
      if (!fs.existsSync(this.auditFile)) return [];
      const lines = fs.readFileSync(this.auditFile, 'utf8').trim().split('\n').filter(Boolean);
      return lines.slice(-limit).reverse().map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } });
    } catch { return []; }
  }

  /* ---- encrypt helper for other modules ---- */
  seal(v) { return encrypt(this.masterKey, v); }
  open(v) { return decrypt(this.masterKey, v); }
}

export { ROLES, DEFAULT_QUOTA, DEFAULT_SEC };
