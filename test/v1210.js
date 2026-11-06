// Tests v1.21.0 : Facebook Page + X (secrets chiffrés, jamais renvoyés), confirmation PUBLISH,
// auto-publication par style (défaut off), transport mock. node test/v1210.js
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v1210-'));
process.env.SOUNDTUBE_DATA_DIR = path.join(tmp, 'data');
process.env.SOUNDTUBE_SOCIAL_TRANSPORT = 'mock';
fs.mkdirSync(process.env.SOUNDTUBE_DATA_DIR, { recursive: true });

const { SocialStore, setSocialSecretCodec } = await import('../src/social.js');

let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const SECRETS = {
  fbToken: 'EAABsbCS1iHgTEST_FACEBOOK_TOKEN_NEVER_LEAK',
  xApiSecret: 'xApiSecretTEST_NEVER',
  xAccessToken: 'xAccessTokenTEST_NEVER',
  xAccessSecret: 'xAccessSecretTEST_NEVER',
};
const leaks = (s) => Object.values(SECRETS).filter((x) => String(s).includes(x));

// Codec factice (comme AuthStore.seal)
const seal = (v) => 'v1:' + Buffer.from(String(v)).toString('base64');
const open = (v) => String(v).startsWith('v1:') ? Buffer.from(String(v).slice(3), 'base64').toString() : String(v);
setSocialSecretCodec({ seal, open });

{
  const S = new SocialStore(process.env.SOUNDTUBE_DATA_DIR);
  check(S.transport === 'mock', 'transport mock');
  check(!S.view().facebook.ready && !S.view().x.ready, 'sans config : pas prêt');
  S.update({
    facebook: { enabled: true, pageId: '111222333', pageAccessToken: SECRETS.fbToken },
    x: { enabled: true, authMode: 'oauth1', apiKey: 'apiKeyTest', apiSecret: SECRETS.xApiSecret, accessToken: SECRETS.xAccessToken, accessSecret: SECRETS.xAccessSecret },
  });
  const v = S.view();
  check(v.facebook.ready && v.facebook.hasToken && !leaks(JSON.stringify(v)).length, 'vue Admin : ready, token masqué, aucun secret en clair');
  check(v.x.ready && v.x.hasApiSecret && v.x.hasAccessToken && v.x.hasAccessSecret, 'X oauth1 ready');
  const file = path.join(process.env.SOUNDTUBE_DATA_DIR, 'social.json');
  check((fs.statSync(file).mode & 0o777) === 0o600, `social.json 0600 (${(fs.statSync(file).mode & 0o777).toString(8)})`);
  const raw = fs.readFileSync(file, 'utf8');
  check(!leaks(raw).length && raw.includes('v1:'), 'secrets scellés sur disque');
  S.update({ facebook: { pageAccessToken: '' } }); // empty = keep
  check(open(S.unlocked().facebook.pageAccessToken) === SECRETS.fbToken || S.unlocked().facebook.pageAccessToken === SECRETS.fbToken, 'token conservé si champ vide');
  // actually empty string in update: `if (typeof f.pageAccessToken === 'string' && f.pageAccessToken.trim())` — empty keeps. Good.
  S.update({ facebook: { pageAccessToken: null } });
  check(!S.unlocked().facebook.pageAccessToken, 'null efface le token');
  S.update({ facebook: { pageAccessToken: SECRETS.fbToken } });
}

{
  const S = new SocialStore(process.env.SOUNDTUBE_DATA_DIR);
  let e428 = null;
  try { S.update({ autoPublish: { lofi: { facebook: true } } }); } catch (e) { e428 = e; }
  check(e428?.status === 428 && !(S.view().autoPublish.lofi?.facebook), 'auto FB sans confirm : 428');
  S.update({ autoPublish: { lofi: { facebook: true, x: false } }, confirm: 'PUBLISH' });
  check(S.view().autoPublish.lofi?.facebook === true && S.view().autoPublish.lofi?.x === false, 'auto FB avec PUBLISH');
  S.update({ autoPublish: { lofi: { facebook: false, x: false } } });
  check(!S.view().autoPublish.lofi?.facebook, 'désactivation sans confirm OK');
}

{
  const S = new SocialStore(process.env.SOUNDTUBE_DATA_DIR);
  S.update({
    facebook: { enabled: true, pageId: '999', pageAccessToken: SECRETS.fbToken },
    x: { enabled: true, authMode: 'oauth1', apiKey: 'k', apiSecret: SECRETS.xApiSecret, accessToken: SECRETS.xAccessToken, accessSecret: SECRETS.xAccessSecret },
  });
  const track = { id: 'trk_test', title: 'Test Track', style: 'lofi', status: 'done', files: {}, meta: { ai: { description_fr: 'Un morceau lo-fi doux.', description_en: 'A soft lo-fi track.' } } };
  let e428 = null;
  try { await S.publishTrack({ track, network: 'facebook', confirm: 'nope' }); } catch (e) { e428 = e; }
  check(e428?.status === 428, 'publish sans confirm : 428');
  const fb = await S.publishTrack({ track, network: 'facebook', lang: 'fr', confirm: 'PUBLIER', tracksDir: tmp });
  check(fb.status === 'done' && fb.mock && fb.url && fb.network === 'facebook', `FB mock ok (${fb.id})`);
  const x = await S.publishTrack({ track, network: 'x', lang: 'en', text: 'Hello X #soundtube', confirm: 'PUBLISH', tracksDir: tmp });
  check(x.status === 'done' && x.mock && x.url, `X mock ok (${x.id})`);
  check(S.view().history.length >= 2, 'historique rempli');
  check(!leaks(S.scrub(`boom ${SECRETS.fbToken} ${SECRETS.xApiSecret}`)).length, 'scrub masque les secrets');
  const drafts = S.draftTexts(track, { url: 'https://youtu.be/abc' });
  check(drafts.fr.text && drafts.xEn.text.length <= 280 && drafts.youtubeUrl.includes('youtu'), 'brouillons FR/EN + lien YT');
}

// Serveur HTTP mock transport
{
  const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const dataDir = path.join(tmp, 'srv'); fs.mkdirSync(dataDir, { recursive: true });
  const env = {
    ...process.env,
    SOUNDTUBE_DATA_DIR: dataDir,
    SOUNDTUBE_PORT: String(port),
    SOUNDTUBE_SOCIAL_TRANSPORT: 'mock',
    SOUNDTUBE_YT_TRANSPORT: 'mock',
    SOUNDTUBE_BIND: '127.0.0.1',
  };
  const child = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let boot = '';
  const ready = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 12000);
    const on = (buf) => { boot += buf.toString(); if (/écoute|listening|ready|http/i.test(boot) || boot.includes(String(port))) { clearTimeout(t); resolve(true); } };
    child.stdout.on('data', on); child.stderr.on('data', on);
  });
  // Even if banner differs, try HTTP
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(800);
  try {
    // setup admin if needed
    let r = await fetch(`http://127.0.0.1:${port}/api/auth/status`);
    let st = await r.json();
    if (st.setupRequired) {
      r = await fetch(`http://127.0.0.1:${port}/api/auth/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test-password-12345' }) });
      check(r.ok || r.status === 201 || r.status === 200, `setup admin (${r.status})`);
    }
    r = await fetch(`http://127.0.0.1:${port}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test-password-12345' }) });
    const login = await r.json().catch(() => ({}));
    const setCookies = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
    const cookie = setCookies.map((c) => c.split(';')[0]).join('; ')
      || String(r.headers.get('set-cookie') || '').split(/,(?=[^;]+?=)/).map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
    const csrf = login.csrf || '';
    check(r.ok && cookie && csrf && login.user?.role === 'admin', `login admin + csrf (${r.status}, role=${login.user?.role})`);
    const hdr = { cookie, 'content-type': 'application/json', 'x-csrf-token': csrf };

    let put = await fetch(`http://127.0.0.1:${port}/api/admin/social`, { method: 'PUT', headers: hdr, body: JSON.stringify({
      facebook: { enabled: true, pageId: '555', pageAccessToken: SECRETS.fbToken },
      x: { enabled: true, authMode: 'oauth1', apiKey: 'k', apiSecret: SECRETS.xApiSecret, accessToken: SECRETS.xAccessToken, accessSecret: SECRETS.xAccessSecret },
    }) });
    const putJ = await put.json().catch(() => ({}));
    check(put.ok && putJ.facebook?.ready && !leaks(JSON.stringify(putJ)).length, `PUT /api/admin/social (${put.status} ${putJ.error || ''})`);

    const get = await fetch(`http://127.0.0.1:${port}/api/admin/social`, { headers: hdr });
    const getJ = await get.json().catch(() => ({}));
    check(get.ok && getJ.facebook?.tokenMask && !leaks(JSON.stringify(getJ)).length, `GET admin social (${get.status} ${getJ.error || ''})`);

    // Create a fake done track via store file is hard; unit publish already covered.
    // Auth pages layout smoke
    for (const path of ['/login', '/register', '/404']) {
      const hr = await fetch(`http://127.0.0.1:${port}${path}`);
      const html = await hr.text();
      check(hr.ok || hr.status === 404, `${path} HTTP ${hr.status}`);
      check(html.includes('site.css') || html.includes('bootSite') || html.includes('/js/login.js') || html.includes('/js/error.js') || html.includes('/js/register.js'), `${path} charge site/auth JS`);
    }
  } catch (e) {
    check(false, `HTTP social: ${e.message}`);
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
    try { child.kill('SIGKILL'); } catch {}
  }
}

console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests v1.21.0 OK');
process.exit(fail ? 1 : 0);
