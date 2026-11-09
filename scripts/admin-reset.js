#!/usr/bin/env node
/**
 * soundtube — récupération d'urgence d'un compte (admin bloqué, OTP perdu).
 * Emergency account recovery (locked-out admin, lost OTP).
 *
 *   node scripts/admin-reset.js   (en root / as root) <username> [--disable-2fa] [--password] [--restart|--no-reload]
 *
 *   --disable-2fa   supprime le secret TOTP, les codes de récupération et les passkeys
 *   --password      demande un nouveau mot de passe (saisie masquée sur le TTY, deux fois)
 *   --restart       redémarre le service au lieu de lui envoyer SIGHUP
 *   --no-reload     n'avertit pas le service (il relira quand même les fichiers à la requête suivante)
 *
 * Fonctionne service EN MARCHE : écriture atomique (rename) ; le serveur détecte le changement
 * (mtime/inode) et recharge avant toute lecture/écriture ; SIGHUP efface aussi les verrous en mémoire.
 *
 * Toujours : réactive le compte, ferme toutes ses sessions, écrit une ligne dans audit.jsonl.
 * Sécurité : réservé à root sur la machine (console/SSH locale) — aucun accès HTTP.
 * Données : $SOUNDTUBE_DATA_DIR, sinon /etc/soundtube/soundtube.env, sinon /var/lib/soundtube.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { hashPassword } from '../src/security/crypto.js';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const username = argv.find((a) => !a.startsWith('--'));
const die = (m, code = 1) => { console.error(`admin-reset: ${m}`); process.exit(code); };

if (!username || flags.has('--help') || flags.has('-h')) {
  console.log('Usage (root): node scripts/admin-reset.js <username> [--disable-2fa] [--password] [--restart|--no-reload]');
  process.exit(username ? 0 : 2);
}
const known = new Set(['--disable-2fa', '--password', '--no-restart', '--no-reload', '--restart', '--help']);
for (const f of flags) if (!known.has(f)) die(`option inconnue / unknown option ${f}`, 2);
if (!flags.has('--disable-2fa') && !flags.has('--password')) console.log('(ni --disable-2fa ni --password : réactivation + fermeture des sessions seulement)');

// --- LAN/root only -------------------------------------------------------------------------------
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
if (!isRoot && process.env.SOUNDTUBE_ALLOW_NONROOT !== '1') die('doit être lancé en root sur le serveur / must run as root on the server');
if (process.env.SSH_CONNECTION) {
  const ip = String(process.env.SSH_CONNECTION).split(' ')[0] || '';
  const lan = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fe80:|f[cd][0-9a-f]{2}:)/i.test(ip.replace(/^::ffff:/, ''));
  if (!lan && process.env.SOUNDTUBE_RESET_ALLOW_REMOTE !== '1') die(`session SSH depuis ${ip} (hors LAN) refusée — connectez-vous depuis le LAN ou la console`);
}

// --- data dir --------------------------------------------------------------------------------------
function envFileDataDir() {
  try {
    const m = fs.readFileSync(process.env.SOUNDTUBE_ENV_FILE || '/etc/soundtube/soundtube.env', 'utf8').match(/^\s*SOUNDTUBE_DATA_DIR\s*=\s*"?([^"\n]+)"?/m);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}
const dataDir = path.resolve(process.env.SOUNDTUBE_DATA_DIR || envFileDataDir() || '/var/lib/soundtube');
const usersFile = path.join(dataDir, 'users.json');
const sessionsFile = path.join(dataDir, 'sessions.json');
const auditFile = path.join(dataDir, 'audit.jsonl');
if (!fs.existsSync(usersFile)) die(`${usersFile} introuvable (SOUNDTUBE_DATA_DIR ?)`);

const readJson = (f, fb) => { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return j ?? fb; } catch { return fb; } };
function writeJson(file, obj) {
  const st = fs.statSync(dataDir); // propriétaire du dossier = utilisateur du service
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
  try { fs.chownSync(tmp, st.uid, st.gid); } catch {}
  fs.renameSync(tmp, file);
}

// --- TTY password prompt (no echo) ----------------------------------------------------------------
function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error('--password exige un terminal interactif (TTY)'));
    process.stdout.write(prompt);
    let buf = '';
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n' || c === '\u0004') { done(); return; }
        if (c === '\u0003') { stdin.setRawMode(false); process.stdout.write('\n'); process.exit(130); }
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1); else buf += c;
      }
    };
    const done = () => { stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData); process.stdout.write('\n'); resolve(buf); };
    stdin.on('data', onData);
  });
}

// --- main ----------------------------------------------------------------------------------------
const users = readJson(usersFile, { users: [] });
const list = Array.isArray(users.users) ? users.users : (Array.isArray(users) ? users : []);
const u = list.find((x) => String(x.username || '').toLowerCase() === username.toLowerCase());
if (!u) die(`utilisateur « ${username} » introuvable. Comptes : ${list.map((x) => x.username).join(', ') || '(aucun)'}`);

const changes = ['enabled', 'sessions_revoked'];
if (flags.has('--password')) {
  const p1 = await askHidden(`Nouveau mot de passe pour ${u.username} (min. 10) : `);
  if (p1.length < 10) die('mot de passe trop court (min. 10)');
  const p2 = await askHidden('Confirmer : ');
  if (p1 !== p2) die('les deux saisies diffèrent');
  u.passwordHash = await hashPassword(p1);
  changes.push('password');
}
if (flags.has('--disable-2fa')) {
  u.totpSecret = null; u.recoveryHashes = []; u.passkeys = [];
  changes.push('2fa_disabled');
}
u.disabled = false;
u.updatedAt = new Date().toISOString();
writeJson(usersFile, Array.isArray(users.users) ? users : { users: list });

const sess = readJson(sessionsFile, { sessions: {} });
const map = (sess && typeof sess.sessions === 'object' && !Array.isArray(sess.sessions)) ? sess.sessions : {};
let revoked = 0;
for (const [id, s] of Object.entries(map)) if (s?.userId === u.id) { delete map[id]; revoked++; }
writeJson(sessionsFile, { sessions: map });

const who = process.env.SUDO_USER || os.userInfo().username;
const line = JSON.stringify({ at: new Date().toISOString(), action: 'admin.cli_reset', userId: u.id, username: u.username, changes, revoked, by: who, tty: !!process.stdin.isTTY, ssh: process.env.SSH_CONNECTION ? String(process.env.SSH_CONNECTION).split(' ')[0] : null }) + '\n';
fs.appendFileSync(auditFile, line, { mode: 0o600 });
try { const d = fs.statSync(dataDir); fs.chownSync(auditFile, d.uid, d.gid); } catch {}

console.log(`OK : ${u.username} → ${changes.join(', ')} (${revoked} session(s) fermée(s)).`);

// Le serveur relit les fichiers modifiés (empreinte disque) ; SIGHUP force le rechargement + efface les verrous.
const quiet = flags.has('--no-reload') || flags.has('--no-restart');
if (!quiet && isRoot) {
  const sc = process.env.SOUNDTUBE_SYSTEMCTL || 'systemctl';
  try {
    execFileSync(sc, ['is-active', '--quiet', 'soundtube']);
    if (flags.has('--restart')) { execFileSync(sc, ['restart', 'soundtube'], { stdio: 'inherit' }); console.log('Service soundtube redémarré.'); }
    else { execFileSync(sc, ['kill', '-s', 'HUP', '--kill-who=main', 'soundtube'], { stdio: 'inherit' }); console.log('Service soundtube rechargé (SIGHUP) — aucun redémarrage nécessaire.'); }
  } catch { console.log('Service soundtube inactif ou systemctl absent : les fichiers seront lus au prochain démarrage.'); }
} else if (!quiet) {
  console.log('Le service relira les fichiers à la prochaine requête (ou, en root : systemctl kill -s HUP soundtube).');
}
