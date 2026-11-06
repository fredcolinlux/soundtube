// Routes auth : setup, login, logout, me, password, 2FA, passkeys, users admin, tokens, security, backup, legal.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import {
  setSessionCookie, clearSessionCookie, requireLocalAdmin, requireAdminSession, requireRole, requireCsrf, localOnly,
} from './middleware.js';
import { backupAuth, restoreAuth } from './backup.js';
import * as webauthn from '../security/webauthn.js';
import { legalBundle } from '../legal-content.js';
import { randomToken } from '../security/crypto.js';
import { msg } from '../i18n-server.js';
import { qrSvg } from '../security/qrcode.js';

export function mountAuthRoutes(app, { auth, config, awrap, wrap }) {
  const cookieOpts = (req) => ({
    https: req.clientMeta?.proto === 'https',
    maxAgeSec: (auth.security.sessionTtlHours || 12) * 3600,
  });

  // ---- setup (LAN only, first admin)
  app.get('/api/auth/status', (req, res) => {
    res.json({
      setupRequired: auth.needsSetup(),
      local: !!req.clientMeta?.local,
      authenticated: !!(req.authUser && !req.session?.pending2fa),
      user: auth.publicUser(req.authUser),
      csrf: req.csrfToken || null,
      publicDomain: auth.security.publicDomain || null,
      openRegistration: !!auth.security.openRegistration,
    });
  });

  // Inscription publique (désactivée par défaut)
  const regHits = new Map(); // ip -> { n, until }
  app.post('/api/auth/register', awrap(async (req, res) => {
    const ip = req.clientMeta?.ip || '0.0.0.0';
    const now = Date.now();
    let e = regHits.get(ip) || { n: 0, until: 0 };
    if (e.until > now) return res.status(429).json({ error: msg(req, 'rateLimited') });
    if (e.n >= 5) { e.until = now + 15 * 60_000; e.n = 0; regHits.set(ip, e); return res.status(429).json({ error: msg(req, 'rateLimited') }); }
    try {
      const { username, password } = req.body || {};
      const u = await auth.registerPublic({ username, password });
      e.n += 1; regHits.set(ip, e);
      if (u.pendingApproval) return res.status(201).json({ ok: true, pendingApproval: true });
      const { session, csrf } = auth.createSession(auth.getUser(u.id), { ip, ua: req.headers['user-agent'] });
      setSessionCookie(res, session.id, cookieOpts(req));
      res.status(201).json({ ok: true, pendingApproval: false, csrf, user: auth.publicUser(auth.getUser(u.id)) });
    } catch (err) {
      e.n += 1; regHits.set(ip, e);
      res.status(err.status || 400).json({ error: msg(req, err.message) || err.message || msg(req, 'generic') });
    }
  }));


  app.post('/api/auth/setup', requireLocalAdmin, awrap(async (req, res) => {
    if (!auth.needsSetup()) return res.status(409).json({ error: msg(req, 'alreadySetup') });
    const { username, password } = req.body || {};
    const u = await auth.createUser({ username, password, role: 'admin' });
    const { session, csrf } = auth.createSession(auth.getUser(u.id), { ip: req.clientMeta.ip, ua: req.headers['user-agent'] });
    auth.touchLogin(auth.getUser(u.id));
    setSessionCookie(res, session.id, cookieOpts(req));
    auth.audit('setup', { userId: u.id, ip: req.clientMeta.ip });
    res.status(201).json({ user: u, csrf });
  }));

  app.post('/api/auth/login', awrap(async (req, res) => {
    const { username, password } = req.body || {};
    const u = await auth.authenticatePassword(username, password, req.clientMeta.ip);
    const needs2fa = !!(u.totpSecret || (u.passkeys || []).length);
    const { session, csrf } = auth.createSession(u, { ip: req.clientMeta.ip, ua: req.headers['user-agent'], pending2fa: needs2fa });
    setSessionCookie(res, session.id, cookieOpts(req));
    if (!needs2fa) {
      auth.touchLogin(u);
      auth.audit('login.ok', { userId: u.id, ip: req.clientMeta.ip });
      return res.json({ user: auth.publicUser(u), csrf, ok: true });
    }
    res.json({ ok: true, needs2fa: true, totp: !!u.totpSecret, passkeys: (u.passkeys || []).length > 0, csrf });
  }));

  app.post('/api/auth/2fa', awrap(async (req, res) => {
    if (!req.session?.pending2fa) return res.status(400).json({ error: msg(req, 'no2fa') });
    const u = auth.getUser(req.session.userId);
    if (!u) return res.status(401).json({ error: msg(req, 'sessionInvalid') });
    const ok = await auth.verifyUser2fa(u, { code: req.body?.code, recovery: req.body?.recovery });
    if (!ok) {
      auth.audit('login.2fa_fail', { userId: u.id, ip: req.clientMeta.ip });
      console.warn(`[soundtube-auth] Failed password for ${u.username} from ${req.clientMeta.ip}`);
      return res.status(401).json({ error: msg(req, 'invalidCode') });
    }
    req.session.pending2fa = false; auth.saveSessions();
    auth.touchLogin(u);
    auth.audit('login.ok', { userId: u.id, ip: req.clientMeta.ip, via: '2fa' });
    res.json({ user: auth.publicUser(u), csrf: auth.ensureCsrf(req.session.id), ok: true });
  }));

  app.post('/api/auth/logout', (req, res) => {
    if (req.session) { auth.destroySession(req.session.id); auth.audit('logout', { userId: req.session.userId }); }
    clearSessionCookie(res, req.clientMeta?.proto === 'https');
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: msg(req, 'notConnected') });
    res.json({ user: auth.publicUser(req.authUser), csrf: req.csrfToken, local: !!req.clientMeta?.local });
  });

  app.post('/api/auth/password', requireCsrf, awrap(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: msg(req, 'notConnected') });
    const { current, next } = req.body || {};
    const u = await auth.authenticatePassword(req.authUser.username, current, req.clientMeta.ip).catch(() => null);
    if (!u) return res.status(401).json({ error: msg(req, 'badPassword') });
    await auth.updateUser(u.id, { password: next }, u);
    res.json({ ok: true });
  }));

  // TOTP enrolment (QR is served by authenticated SVG endpoint — no external service)
  app.post('/api/auth/totp/begin', requireCsrf, awrap(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: msg(req, 'notConnected') });
    res.json(await auth.beginTotp(req.authUser));
  }));
  function sendTotpQr(req, res) {
    if (!req.authUser) return res.status(401).json({ error: msg(req, 'notConnected') });
    const uri = auth.pendingTotpOtpauth(req.authUser);
    if (!uri) return res.status(404).type('text').send('no pending TOTP challenge');
    res.set({
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
    });
    res.send(qrSvg(uri, { size: 240, margin: 2, ecl: 'M' }));
  }
  app.get('/api/me/totp/qr.svg', sendTotpQr);
  app.get('/api/auth/totp/qr.svg', sendTotpQr);
  app.post('/api/auth/totp/confirm', requireCsrf, awrap(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: msg(req, 'notConnected') });
    res.json(await auth.confirmTotp(req.authUser, req.body?.code));
  }));
  app.delete('/api/auth/totp', requireCsrf, (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: msg(req, 'notConnected') });
    auth.disableTotp(req.authUser); res.json({ ok: true });
  });

  // Passkeys
  function originOf(req) {
    const host = auth.security.publicDomain || req.headers.host || 'localhost';
    const proto = req.clientMeta?.proto || 'http';
    return `${proto}://${host}`;
  }
  function rpIdOf(req) {
    return (auth.security.publicDomain || String(req.headers.host || 'localhost').split(':')[0]).split(':')[0];
  }

  app.post('/api/auth/passkey/register/options', requireCsrf, (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: msg(req, 'notConnected') });
    const opts = webauthn.createRegistrationOptions({
      rpID: rpIdOf(req), rpName: 'soundtube',
      userId: req.authUser.id, userName: req.authUser.username, userDisplayName: req.authUser.username,
      exclude: (req.authUser.passkeys || []).map((p) => p.credentialId),
    });
    auth.challenges.set('pkreg:' + req.authUser.id, { challenge: opts.challenge, at: Date.now() });
    const { _rawChallenge, ...pub } = opts;
    res.json(pub);
  });
  app.post('/api/auth/passkey/register', requireCsrf, wrap((req, res) => {
    if (!req.authUser) return res.status(401).json({ error: msg(req, 'notConnected') });
    const ch = auth.challenges.get('pkreg:' + req.authUser.id);
    if (!ch) return res.status(400).json({ error: msg(req, 'challengeExpired') });
    const verified = webauthn.verifyRegistration({
      response: req.body, expectedChallenge: ch.challenge,
      expectedOrigin: originOf(req), expectedRPID: rpIdOf(req),
    });
    req.authUser.passkeys = req.authUser.passkeys || [];
    req.authUser.passkeys.push({
      credentialId: verified.credentialId, publicKeyJwk: verified.publicKeyJwk,
      counter: verified.counter, name: String(req.body?.name || 'Passkey').slice(0, 40),
      createdAt: new Date().toISOString(),
    });
    auth.saveUsers(); auth.challenges.delete('pkreg:' + req.authUser.id);
    auth.audit('passkey.add', { userId: req.authUser.id });
    res.json({ ok: true, count: req.authUser.passkeys.length });
  }));
  app.post('/api/auth/passkey/login/options', (req, res) => {
    const u = auth.byUsername(req.body?.username);
    const allow = u ? (u.passkeys || []).map((p) => p.credentialId) : [];
    const opts = webauthn.createAuthenticationOptions({ rpID: rpIdOf(req), allow });
    auth.challenges.set('pklogin:' + (req.body?.username || '') + ':' + req.clientMeta.ip, { challenge: opts.challenge, userId: u?.id, at: Date.now() });
    const { _rawChallenge, ...pub } = opts;
    res.json(pub);
  });
  app.post('/api/auth/passkey/login', wrap((req, res) => {
    const key = 'pklogin:' + (req.body?.username || '') + ':' + req.clientMeta.ip;
    const ch = auth.challenges.get(key);
    if (!ch?.userId) return res.status(400).json({ error: msg(req, 'challengeExpired') });
    const u = auth.getUser(ch.userId);
    const cred = (u?.passkeys || []).find((p) => p.credentialId === req.body?.id);
    if (!cred) return res.status(401).json({ error: msg(req, 'passkeyUnknown') });
    const v = webauthn.verifyAuthentication({
      response: req.body?.response || req.body, expectedChallenge: ch.challenge,
      expectedOrigin: originOf(req), expectedRPID: rpIdOf(req), credential: cred,
    });
    cred.counter = v.counter; auth.saveUsers(); auth.challenges.delete(key);
    const { session, csrf } = auth.createSession(u, { ip: req.clientMeta.ip, ua: req.headers['user-agent'] });
    auth.touchLogin(u); setSessionCookie(res, session.id, cookieOpts(req));
    auth.audit('login.ok', { userId: u.id, ip: req.clientMeta.ip, via: 'passkey' });
    res.json({ user: auth.publicUser(u), csrf, ok: true });
  }));
  app.delete('/api/auth/passkey/:id', requireCsrf, (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: msg(req, 'notConnected') });
    req.authUser.passkeys = (req.authUser.passkeys || []).filter((p) => p.credentialId !== req.params.id);
    auth.saveUsers(); res.json({ ok: true });
  });

  // ---- Admin users / tokens / security / audit / backup (LOCAL ONLY)
  const admin = express.Router();
  admin.use(requireAdminSession);
  admin.use(requireCsrf);

  admin.get('/users', (req, res) => res.json({ users: auth.listUsers() }));
  admin.post('/users', awrap(async (req, res) => {
    const u = await auth.createUser(req.body || {}, req.authUser); res.status(201).json(u);
  }));
  admin.patch('/users/:id', awrap(async (req, res) => {
    res.json(await auth.updateUser(req.params.id, req.body || {}, req.authUser));
  }));
  admin.delete('/users/:id', (req, res) => { auth.deleteUser(req.params.id, req.authUser); res.status(204).end(); });

  admin.get('/tokens', (req, res) => res.json({ tokens: auth.listApiTokens() }));
  admin.post('/tokens', awrap(async (req, res) => {
    const userId = req.body?.userId || req.authUser?.id;
    if (!userId) return res.status(400).json({ error: 'userId requis' });
    const r = await auth.createApiToken(userId, req.body || {});
    res.status(201).json(r);
  }));
  admin.delete('/tokens/:id', (req, res) => { auth.revokeApiToken(req.params.id, req.authUser); res.status(204).end(); });

  admin.get('/security', (req, res) => res.json(auth.securityView()));
  admin.put('/security', (req, res) => res.json(auth.updateSecurity(req.body || {})));
  admin.post('/security/confirm', (req, res) => {
    const proxy = !!req.body?.proxy, domain = !!req.body?.domain;
    res.json(auth.confirmSuggestions({ proxy, domain }));
  });

  admin.get('/audit', (req, res) => res.json({ items: auth.readAudit({ limit: Math.min(500, +(req.query.limit || 100)) }) }));

  admin.post('/backup', (req, res) => {
    const out = path.join(config.dataDir, `backup-auth-${Date.now()}.tgz`);
    backupAuth(config.dataDir, out);
    auth.audit('backup', { actorId: req.authUser?.id, file: path.basename(out) });
    res.download(out, path.basename(out));
  });
  admin.post('/restore', (req, res) => {
    const b64 = req.body?.archive;
    if (!b64 || typeof b64 !== 'string') return res.status(400).json({ error: 'archive (base64) requis' });
    const tmp = path.join(config.dataDir, 'restore-upload.tgz');
    fs.writeFileSync(tmp, Buffer.from(b64, 'base64'), { mode: 0o600 });
    restoreAuth(config.dataDir, tmp);
    try { fs.unlinkSync(tmp); } catch {}
    auth.audit('restore', { actorId: req.authUser?.id });
    res.json({ ok: true, note: 'Redémarre le service soundtube pour recharger.' });
  });

  app.use('/api/admin/auth', admin);

  // Legal (public)
    app.get('/api/legal', (req, res) => {
    const lang = req.query.lang === 'en' ? 'en' : 'fr';
    const kind = ['notice', 'privacy', 'terms'].includes(req.query.kind) ? req.query.kind : 'notice';
    const bundle = legalBundle(auth.security, lang);
    res.json({ ...bundle, kind, text: bundle[kind] });
  });

  // security.txt
  app.get('/.well-known/security.txt', (req, res) => {
    const domain = auth.security.publicDomain || req.headers.host || 'localhost';
    const exp = new Date(Date.now() + 365 * 86400e3).toISOString().slice(0, 10);
    res.type('text/plain').send(`Contact: mailto:security@${domain}\nExpires: ${exp}T00:00:00.000Z\nPreferred-Languages: fr, en\nCanonical: https://${domain}/.well-known/security.txt\n`);
  });
}
