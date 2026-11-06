// v1.21.1 — update.sh safety + /healthz + API docs LAN-only (styled 404) + isLocal flag.
// node test/v1211.js
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v1211-'));
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. fichiers présents
check(fs.existsSync(path.join(ROOT, 'scripts/update.sh')), 'scripts/update.sh présent');
check(fs.readFileSync(path.join(ROOT, 'scripts/update.sh'), 'utf8').includes('verify_flat_tar'), 'update.sh vérifie le tar avant stop');
check(fs.readFileSync(path.join(ROOT, 'src/server.js'), 'utf8').includes("/healthz"), '/healthz dans server.js');
check(fs.readFileSync(path.join(ROOT, 'src/server.js'), 'utf8').includes('requireLocalDocs'), 'docs gated requireLocalDocs');

// ---------- 2. update.sh — missing / bad / good (simulated layout)
{
  const fakeRoot = path.join(tmp, 'root');
  const app = path.join(fakeRoot, 'opt/soundtube/app');
  const backup = path.join(fakeRoot, 'var/backups/soundtube');
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(app, { recursive: true });
  fs.mkdirSync(backup, { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(app, 'VERSION'), '1.21.0\n');
  fs.writeFileSync(path.join(app, 'package.json'), '{"name":"soundtube","type":"module"}\n');
  fs.mkdirSync(path.join(app, 'src'), { recursive: true });
  fs.writeFileSync(path.join(app, 'src/server.js'), 'console.log("old");\n');

  // mock systemctl / journalctl / curl / node
  const stateFile = path.join(tmp, 'svc-state');
  fs.writeFileSync(stateFile, 'stopped\n');
  fs.writeFileSync(path.join(bin, 'systemctl'), `#!/bin/sh
echo "systemctl $*" >> "${tmp}/systemctl.log"
cmd="$1"; shift
unit="$1"
case "$cmd" in
  stop) echo stopped > "${stateFile}"; exit 0 ;;
  start) echo started > "${stateFile}"; exit 0 ;;
  *) exit 0 ;;
esac
`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'journalctl'), `#!/bin/sh\necho "journal mock -n 40"; exit 0\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'curl'), `#!/bin/sh
# succeed after service "started"
if grep -q started "${stateFile}" 2>/dev/null; then
  echo '{"ok":true,"version":"1.21.1"}'
  exit 0
fi
exit 7
`, { mode: 0o755 });
  // use real node from PATH — put bin first but fall through: copy node wrapper
  const realNode = process.execPath;
  fs.writeFileSync(path.join(bin, 'node'), `#!/bin/sh\nexec "${realNode}" "$@"\n`, { mode: 0o755 });

  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    SOUNDTUBE_ALLOW_NONROOT: '1',
    SOUNDTUBE_APP: app,
    SOUNDTUBE_BACKUP_DIR: backup,
    SOUNDTUBE_HEALTH_URL: 'http://127.0.0.1:9/healthz', // curl mock ignores URL
    SOUNDTUBE_SYSTEMCTL: path.join(bin, 'systemctl'),
    SOUNDTUBE_JOURNALCTL: path.join(bin, 'journalctl'),
    SOUNDTUBE_NODE: path.join(bin, 'node'),
    SOUNDTUBE_HEALTH_TIMEOUT: '5',
    SOUNDTUBE_USER: 'nobody',
    SOUNDTUBE_GROUP: 'nogroup',
  };
  // Override curl in script via PATH
  const upd = path.join(ROOT, 'scripts/update.sh');

  // 2a missing patch — must NOT stop
  fs.writeFileSync(path.join(tmp, 'systemctl.log'), '');
  const miss = spawnSync('bash', [upd, path.join(tmp, 'no-such-patch.tar.gz')], { env, encoding: 'utf8' });
  check(miss.status !== 0, `missing patch exit≠0 (${miss.status})`);
  check(!fs.readFileSync(path.join(tmp, 'systemctl.log'), 'utf8').includes('stop'), 'missing patch: service NOT stopped');
  check(fs.readFileSync(path.join(app, 'VERSION'), 'utf8').includes('1.21.0'), 'missing patch: app untouched');

  // 2b nested (bad) patch — create soundtube/ prefixed tar
  const badDir = path.join(tmp, 'bad');
  fs.mkdirSync(path.join(badDir, 'soundtube'), { recursive: true });
  fs.writeFileSync(path.join(badDir, 'soundtube/package.json'), '{}');
  const badTar = path.join(tmp, 'bad-nested.tar.gz');
  spawnSync('tar', ['czf', badTar, '-C', badDir, 'soundtube'], { stdio: 'ignore' });
  fs.writeFileSync(path.join(tmp, 'systemctl.log'), '');
  const bad = spawnSync('bash', [upd, badTar], { env, encoding: 'utf8' });
  check(bad.status !== 0, `nested patch exit≠0 (${bad.status})`);
  check(/soundtube\//.test(bad.stderr + bad.stdout) || /nested|prefix|flat/i.test(bad.stderr + bad.stdout), 'nested patch: clear error');
  check(!fs.readFileSync(path.join(tmp, 'systemctl.log'), 'utf8').includes('stop'), 'nested patch: service NOT stopped');

  // 2c good flat patch
  const goodDir = path.join(tmp, 'good');
  fs.mkdirSync(path.join(goodDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(goodDir, 'VERSION'), '1.21.1\n');
  fs.writeFileSync(path.join(goodDir, 'package.json'), '{"name":"soundtube","type":"module"}\n');
  fs.writeFileSync(path.join(goodDir, 'src/server.js'), 'export const x = 1;\n');
  const goodTar = path.join(tmp, 'good-flat.tar.gz');
  spawnSync('tar', ['czf', goodTar, '-C', goodDir, 'VERSION', 'package.json', 'src'], { stdio: 'ignore' });
  // health URL: make curl mock work — script calls curl on HEALTH_URL; our curl is in PATH
  env.SOUNDTUBE_HEALTH_URL = 'http://127.0.0.1:8080/healthz';
  fs.writeFileSync(path.join(tmp, 'systemctl.log'), '');
  const good = spawnSync('bash', [upd, goodTar], { env, encoding: 'utf8', timeout: 15000 });
  check(good.status === 0, `good patch exit 0 (${good.status})\n${good.stdout}\n${good.stderr}`);
  check(fs.readFileSync(path.join(app, 'VERSION'), 'utf8').trim() === '1.21.1', 'good patch: VERSION 1.21.1');
  const slog = fs.readFileSync(path.join(tmp, 'systemctl.log'), 'utf8');
  check(/stop/.test(slog) && /start/.test(slog), 'good patch: stop then start');
  check(fs.readdirSync(backup).some((f) => f.startsWith('app-') && f.endsWith('.tar.gz')), 'good patch: backup created');
}

// ---------- 3. serveur : healthz + docs LAN vs internet
{
  const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const data = path.join(tmp, 'srv-data');
  fs.mkdirSync(data, { recursive: true });
  const child = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], {
    cwd: ROOT,
    env: { ...process.env, SOUNDTUBE_DATA_DIR: data, SOUNDTUBE_PORT: String(port), SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_YT_TRANSPORT: 'mock', SOUNDTUBE_SOCIAL_TRANSPORT: 'mock' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const B = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 80; i++) {
      try { const r = await fetch(`${B}/healthz`); if (r.ok) break; } catch {}
      await sleep(100);
    }
    const hz = await fetch(`${B}/healthz`);
    const hzj = await hz.json();
    check(hz.ok && hzj.ok && hzj.version, `GET /healthz → ${hz.status} version=${hzj.version}`);

    const me = await (await fetch(`${B}/api/me`)).json();
    check(me.isLocal === true && me.local === true, 'GET /api/me isLocal=true on loopback');
    const site = await (await fetch(`${B}/api/site`)).json();
    check(site.isLocal === true, 'GET /api/site isLocal=true');

    const docsLocal = await fetch(`${B}/docs`);
    check(docsLocal.ok || docsLocal.status === 200, `GET /docs local → ${docsLocal.status}`);
    const oaLocal = await fetch(`${B}/api/openapi.json`);
    check(oaLocal.ok, `GET /api/openapi.json local → ${oaLocal.status}`);

    // Simulate internet: untrusted X-Forwarded-For
    const docsWan = await fetch(`${B}/docs`, { headers: { 'X-Forwarded-For': '203.0.113.10' } });
    const docsBody = await docsWan.text();
    check(docsWan.status === 404, `GET /docs via XFF public → 404 (${docsWan.status})`);
    check(/404|introuvable|not found|silence|err404/i.test(docsBody) || docsBody.includes('err-'), 'docs non-local: styled HTML 404');

    const oaWan = await fetch(`${B}/api/openapi.json`, { headers: { 'X-Forwarded-For': '203.0.113.10' } });
    check(oaWan.status === 404, `GET /api/openapi.json via XFF → 404 (${oaWan.status})`);

    const meWan = await (await fetch(`${B}/api/me`, { headers: { 'X-Forwarded-For': '203.0.113.10' } })).json();
    check(meWan.isLocal === false, 'GET /api/me via XFF isLocal=false');

    // API still works with auth token from "internet" — create admin + bearer if supported
    // At minimum /api/health should work with XFF after login isn't required for health... /api/health needs auth?
    // AUTH_ALLOW has /health → /api/health allowed
    const apiHealth = await fetch(`${B}/api/health`, { headers: { 'X-Forwarded-For': '203.0.113.10' } });
    check(apiHealth.ok, `GET /api/health via XFF still OK (${apiHealth.status})`);
  } finally {
    child.kill('SIGTERM');
    await sleep(200);
    try { child.kill('SIGKILL'); } catch {}
  }
}

console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests v1.21.1 OK');
process.exit(fail ? 1 : 0);
