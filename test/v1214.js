// v1.21.4 — morceaux de la démo (Admin, ≤ 10, < 5 min, écoute seule) + portée de la bibliothèque + samples externes (NAS).
// `node --import ./test/helpers/autologin.mjs test/v1214.js`
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v1214-'));
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');

// ---------- fixture : dossier de samples « NAS » (lecture seule) ----------
const S = path.join(tmp, 'nas-samples');
const ff = (args) => spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]).status === 0;
const mk = (rel, src, extra = []) => { const f = path.join(S, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); return ff(['-f', 'lavfi', '-i', src, ...extra, f]); };
check(mk('Drums/Kicks/BD_01.wav', "aevalsrc='0.9*sin(2*PI*(50+120*exp(-30*t))*t)*exp(-6*t)':d=0.5:s=44100")
  && mk('Drums/Snares/snr 2.aiff', "anoisesrc=d=0.3:a=0.8,afade=t=out:st=0:d=0.3")
  && mk('Drums/hh_closed_04.flac', "anoisesrc=d=0.08:a=0.5:c=white,highpass=f=7000")
  && mk('Drums/Open Hat 1.wav', "anoisesrc=d=0.6:a=0.5,highpass=f=6000,afade=t=out:st=0:d=0.6")
  && mk('Drums/Claps/clap-big.wav', "anoisesrc=d=0.25:a=0.7,bandpass=f=1200,afade=t=out:st=0:d=0.25")
  && mk('Loops/drum loop 120.wav', "sine=f=100:d=8")
  && mk('Pads/pad_Am.wav', "sine=f=220:d=2")
  && mk('@eaDir/BD_thumb.wav', "sine=f=60:d=0.2"), 'fixture : one-shots WAV / AIFF / FLAC + boucle + pad + @eaDir');
fs.writeFileSync(path.join(S, 'Drums/Kicks/._BD_01.wav'), 'AppleDouble'); fs.writeFileSync(path.join(S, 'notes.txt'), 'x');
const before = spawnSync('sh', ['-c', `find '${S}' -type f -exec md5sum {} + | sort`]).stdout.toString();

// ---------- unitaires ----------
const { classify, CATEGORIES } = await import('../src/extsamples.js');
{
  const T = { 'Kicks/BD_01.wav': 'kick', '808 Kick.wav': 'kick', 'Drums/Snares/snr 3.flac': 'snare', 'Hats/Open/OH_02.aif': 'ohat', 'HiHat Open 1.wav': 'ohat', 'hh_closed_04.wav': 'hat',
    'Claps/clap-big.wav': 'clap', 'Rim Shot.wav': 'rim', 'Ride 01.wav': 'ride', 'Crash_C1.aiff': 'crash', 'pad_Am.wav': null, 'Loops/kick loop 120.wav': null, 'SD_10.wav': 'snare' };
  const bad = Object.entries(T).filter(([f, c]) => classify(f) !== c);
  check(!bad.length, `classement par nom de fichier / dossier (${Object.keys(T).length} cas)${bad.length ? ' : ' + bad.map(([f]) => f + '→' + classify(f)).join(', ') : ''}`);
  check(CATEGORIES.join() === 'kick,snare,clap,rim,hat,ohat,ride,crash', 'catégories : kick, snare, clap, rim, hat, ohat, ride, crash');
}
{
  const { eligible, DEMO_TRACKS_MAX, DEMO_TRACK_MAX_SEC } = await import('../src/demotracks.js');
  const t0 = { status: 'done', duration: 299.9, files: { mp3: 'a.mp3' } };
  check(DEMO_TRACKS_MAX === 10 && DEMO_TRACK_MAX_SEC === 300 && eligible(t0) && !eligible({ ...t0, duration: 300 }) && !eligible({ ...t0, status: 'queued' }) && !eligible({ ...t0, files: {} }),
    'éligibilité démo : terminé, < 5 min (299,9 s oui, 300 s non), avec audio ; max 10');
}

// ---------- serveur ----------
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const data = path.join(tmp, 'data'); fs.mkdirSync(data);
const port = await freePort();
const srv = spawn(process.execPath, ['src/server.js'], { cwd: ROOT, env: { ...process.env, SOUNDTUBE_DATA_DIR: data, SOUNDTUBE_PORT: String(port), SOUNDTUBE_YT_TRANSPORT: 'mock', SOUNDTUBE_EXT_SAMPLES_DIR: S, SOUNDTUBE_MAX_JOBS: '2' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
const B = `http://127.0.0.1:${port}`;
for (let i = 0; i < 80; i++) { try { if ((await fetch(B + '/healthz')).ok) break; } catch {} await sleep(250); }
// admin : autologin (cookie + CSRF ajoutés) ; visiteur : en-tête cookie factice (autologin ne touche pas la requête)
const j = async (method, u, body, headers = {}) => { const r = await fetch(B + u, { method, redirect: 'manual', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }); const ct = r.headers.get('content-type') || ''; return { status: r.status, h: r.headers, d: ct.includes('json') ? await r.json().catch(() => ({})) : null }; };
const ANON = { cookie: 'visitor=1' };
const anon = (method, u, body) => j(method, u, body, ANON);
const waitDone = async (id, H = {}) => { for (let i = 0; i < 600; i++) { const r = await j('GET', '/api/jobs/' + id, undefined, H); if (r.d?.status === 'done' || r.d?.status === 'error') return r.d; await sleep(250); } return null; };
try {
  // ----- samples externes -----
  let v = (await j('GET', '/api/admin/samples')).d;
  check(v.settings?.dir === S && v.settings.enabled === true && v.defaultDir === S && v.state.readable, `GET /api/admin/samples : dossier par défaut (SOUNDTUBE_EXT_SAMPLES_DIR) lisible`);
  let r = await j('POST', '/api/admin/samples/scan?wait=1');
  v = (await j('GET', '/api/admin/samples')).d;
  const I = v.index || {};
  check(r.status === 202 && I.counts?.kick === 1 && I.counts.snare === 1 && I.counts.hat === 1 && I.counts.ohat === 1 && I.counts.clap === 1 && I.counts.rim === 0, `scan : kick 1, snare 1 (AIFF), hat 1 (FLAC), ohat 1, clap 1 (${JSON.stringify(I.counts)})`);
  check(I.found === 7 && I.used === 5 && I.skipped?.unclassified === 2 && v.active === true && I.usable === true, `scan : 7 fichiers audio (._ et @eaDir ignorés), 5 retenus, boucle + pad non classés, kit actif (${I.found}/${I.used}/${I.skipped?.unclassified})`);
  check(!JSON.stringify(v).includes('"instruments"') && Array.isArray(I.examples?.kick), 'vue Admin : comptes et exemples, pas la liste complète des fichiers');
  const idx = JSON.parse(fs.readFileSync(path.join(data, 'external-samples-index.json'), 'utf8'));
  check(idx.instruments.ext_kick.zones[0].file === path.join(S, 'Drums/Kicks/BD_01.wav') && idx.instruments.ext_kick.zones[0].peak > 0.5, 'index dans le dossier de données : chemins absolus + crête mesurée');
  for (const [dir, why] of [['../etc', 'relatif'], ['/etc/ssl', 'système'], [data, 'dossier de données'], [ROOT + '/assets', 'dossier de l’app'], ['/mnt/x/../../etc', '« .. »']]) {
    r = await j('PUT', '/api/admin/samples', { dir });
    check(r.status === 400, `PUT dossier refusé (${why}) : ${r.status} ${r.d?.error || ''}`);
  }
  r = await anon('PUT', '/api/admin/samples', { dir: '/tmp' });
  check([302, 401, 403].includes(r.status) && !r.d?.settings, `visiteur : PUT /api/admin/samples refusé (${r.status} → connexion)`);
  r = await anon('GET', '/api/admin/samples');
  check([302, 401, 403].includes(r.status) && !r.d?.settings, `visiteur : GET /api/admin/samples refusé (${r.status} → connexion)`);
  r = await j('GET', '/api/admin/samples', undefined, { cookie: 'x=1', 'x-forwarded-for': '203.0.113.9' });
  check(r.status === 404, `depuis Internet (X-Forwarded-For non approuvé) : /api/admin/samples → 404 (${r.status})`);
  r = await j('PUT', '/api/admin/samples', { dir: path.join(tmp, 'absent'), enabled: true });
  check(r.status === 200 && r.d.active === false && r.d.state.exists === false && r.d.staleIndex === true, 'dossier absent : enregistré, kit inactif, index signalé pour un autre dossier');
  r = await j('POST', '/api/admin/samples/scan');
  check(r.status === 409, `scan d’un dossier absent → 409 (${r.status})`);
  r = await j('PUT', '/api/admin/samples', { dir: S, enabled: true });
  for (let i = 0; i < 40 && (r.d.scan?.running || !r.d.active); i++) { await sleep(250); r = await j('GET', '/api/admin/samples'); }
  check(r.d.active === true, 'retour au dossier du NAS : re-scan automatique, kit actif');
  let o = (await j('GET', '/api/options')).d;
  check(o.extSamples?.active === true && o.advanced?.drumKit?.options?.user === 'Mes samples (dossier externe)', '/api/options : extSamples actif + option « Mes samples »');
  o = (await j('GET', '/api/options', undefined, { cookie: 'soundtube_ui_lang=en; x=1' })).d;
  check(o.advanced?.drumKit?.options?.user === 'My samples (external folder)' && /My samples/.test(o.advanced.drumKit.help), 'EN : « My samples (external folder) » + aide traduite');

  // ----- générations (admin) -----
  const gen = async (body, H) => (await j('POST', '/api/generate', body, H)).d;
  const A = await gen({ style: 'house', seed: 4242, duration: 20, adv: { drumKit: 'user' }, title: 'Démo samples' });
  const Bt = await gen({ style: 'lofi', seed: 77, duration: 20, title: 'Démo lofi' });
  const C = await gen({ style: 'techno', seed: 78, duration: 20, title: 'Privé techno' });
  const dA = await waitDone(A.id), dB = await waitDone(Bt.id), dC = await waitDone(C.id);
  check(dA?.status === 'done' && dB?.status === 'done' && dC?.status === 'done', `3 morceaux admin rendus (${dA?.status}/${dB?.status}/${dC?.status}${dA?.error ? ' ' + dA.error : ''})`);
  check(dA?.meta?.extSamples?.hash === r.d.index.hash && dA.meta.extSamples.counts.kick === 1 && dA.meta.render?.reason === 'samples-externes' && dA.meta.render.where === 'ct', `kit « Mes samples » : index ${dA?.meta?.extSamples?.hash} noté dans le morceau, rendu sur le CT (${dA?.meta?.render?.reason})`);
  const after = spawnSync('sh', ['-c', `find '${S}' -type f -exec md5sum {} + | sort`]).stdout.toString();
  check(before === after, 'dossier de samples jamais modifié (md5 de tous les fichiers identiques avant / après scan + rendu)');

  // ----- portée : visiteur -----
  r = await anon('GET', '/api/tracks?status=done');
  check(r.status === 200 && r.d.total === 0 && r.d.items.length === 0 && r.d.demo === true, `visiteur sans sélection : bibliothèque vide (${r.d?.total})`);
  r = await j('PUT', '/api/admin/demo-tracks', { ids: [A.id, Bt.id] });
  check(r.status === 200 && r.d.selected.length === 2 && r.d.candidates.length === 3 && r.d.candidates.filter((c) => c.selected).length === 2 && r.d.max === 10, `Admin : sélection enregistrée (2 / 10, ${r.d?.candidates?.length} candidats < 5 min)`);
  check(fs.existsSync(path.join(data, 'demo-tracks.json')), 'sélection stockée dans le dossier de données (demo-tracks.json)');
  r = await anon('GET', '/api/tracks?status=done');
  const it = r.d.items || [];
  check(r.d.total === 2 && it.every((x) => x.listenOnly && x.urls && Object.keys(x.urls).join() === 'mp3' && x.urls.mp3.startsWith('/api/demo/tracks/') && !x.params && !x.settings && !x.files && !x.meta),
    `visiteur : 2 morceaux de démo, écoute seule (une URL /api/demo/tracks/…/audio, ni fichiers, ni réglages, ni méta)`);
  r = await anon('GET', '/api/tracks?style=house&status=done');
  check(r.d.total === 1 && r.d.items[0].id === A.id, 'visiteur : filtre par style (page Styles)');
  r = await anon('GET', '/api/styles');
  const cnt = Object.fromEntries((r.d.styles || []).map((s) => [s.id, s.tracks]));
  check(cnt.house === 1 && cnt.lofi === 1 && cnt.techno === 0, `visiteur : compteurs des styles = morceaux de démo (${cnt.house}/${cnt.lofi}/${cnt.techno})`);
  r = await anon('GET', '/api/tracks/' + A.id);
  check(r.status === 200 && r.d.listenOnly === true && !r.d.params && !r.d.files, 'visiteur : fiche d’un morceau de démo (vue publique)');
  r = await anon('GET', '/api/tracks/' + C.id);
  check(r.status === 404, `visiteur : fiche d’un morceau hors démo → 404 comme un id inconnu (${r.status})`);
  r = await anon('GET', '/api/tracks/nexistepas');
  check(r.status === 404, `visiteur : id inconnu → 404 (${r.status})`);
  for (const sub of ['audio.mp3', 'audio.wav', 'track.mid', 'midi.zip', 'youtube', 'pack', 'settings', 'split', 'publish', 'social']) {
    r = await anon('GET', `/api/tracks/${A.id}/${sub}`);
    if (!check(r.status === 401, `visiteur : /api/tracks/<démo>/${sub} → 401 (${r.status})`)) break;
  }
  for (const [m, u] of [['POST', `/api/tracks/${A.id}/regenerate`], ['POST', `/api/tracks/${A.id}/variation`], ['DELETE', `/api/tracks/${A.id}`], ['PATCH', `/api/tracks/${A.id}`], ['POST', `/api/tracks/${A.id}/publish`], ['GET', `/api/jobs/${A.id}`]]) {
    r = await anon(m, u, m === 'GET' || m === 'DELETE' ? undefined : {});
    check(r.status === 401, `visiteur : ${m} ${u.replace(A.id, '<démo>')} → 401 (${r.status})`);
  }
  let ar = await fetch(`${B}/api/demo/tracks/${A.id}/audio`, { headers: ANON });
  const buf = Buffer.from(await ar.arrayBuffer());
  check(ar.status === 200 && /audio\/(mpeg|wav)/.test(ar.headers.get('content-type')) && ar.headers.get('content-disposition') === 'inline' && /no-store/.test(ar.headers.get('cache-control')) && buf.length > 10000, `visiteur : écoute /api/demo/tracks/<id>/audio (${ar.status}, ${ar.headers.get('content-type')}, inline, ${buf.length} o)`);
  ar = await fetch(`${B}/api/demo/tracks/${A.id}/audio`, { headers: { ...ANON, range: 'bytes=0-99' } });
  check(ar.status === 206, `visiteur : lecture par plages (Range → ${ar.status})`);
  ar = await fetch(`${B}/api/demo/tracks/${A.id}/audio?download=1`, { headers: ANON });
  check(ar.status === 401, `visiteur : ?download=1 refusé (${ar.status})`);
  ar = await fetch(`${B}/api/demo/tracks/${C.id}/audio`, { headers: ANON });
  check(ar.status === 404, `visiteur : audio d’un morceau hors démo → 404 (${ar.status})`);
  r = await anon('PUT', '/api/admin/demo-tracks', { ids: [C.id] });
  check([302, 401, 403].includes(r.status) && !r.d?.selected, `visiteur : PUT /api/admin/demo-tracks refusé (${r.status})`);
  r = await j('GET', '/api/admin/demo-tracks', undefined, { cookie: 'x=1', 'x-forwarded-for': '203.0.113.9' });
  check(r.status === 404, `depuis Internet : /api/admin/demo-tracks → 404 (${r.status})`);
  { // admin connecté mais sans jeton CSRF → 403
    const lr0 = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'x=1' }, body: JSON.stringify({ username: 'admin', password: 'test-password-12345' }) });
    const ck = lr0.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    r = await j('PUT', '/api/admin/demo-tracks', { ids: [] }, { cookie: ck });
    check(r.status === 403, `admin sans jeton CSRF : PUT /api/admin/demo-tracks → 403 (${r.status})`);
    r = await j('POST', '/api/admin/samples/scan', {}, { cookie: ck });
    check(r.status === 403, `admin sans jeton CSRF : POST /api/admin/samples/scan → 403 (${r.status})`);
  }
  r = await anon('POST', '/api/demo/generate', { style: 'house', adv: { drumKit: 'user' } });
  check(r.status === 202, `démo anonyme 15 s acceptée (${r.status}) — kit « Mes samples » retiré côté serveur`);
  check(/adv\.drumKit === 'user' \? \{ drumKit: null \}/.test(rd('src/demo.js')), 'demo.js : jamais les samples privés dans l’aperçu anonyme');

  // ----- limites de la sélection -----
  r = await j('PUT', '/api/admin/demo-tracks', { ids: Array.from({ length: 11 }, (_, k) => 'x' + k) });
  check(r.status === 400 && /10/.test(r.d.error), `11 morceaux → 400 (${r.d?.error})`);
  r = await j('PUT', '/api/admin/demo-tracks', { ids: ['inconnu'] });
  check(r.status === 400 && r.d.id === 'inconnu', `morceau inconnu → 400 (${r.d?.error})`);
  r = await j('PUT', '/api/admin/demo-tracks', { ids: 'abc' });
  check(r.status === 400, `ids invalide → 400 (${r.status})`);
  const Q = await gen({ style: 'ambient', seed: 5, duration: 400, title: 'Long' }); // 6 min 40 : en file / trop long
  r = await j('PUT', '/api/admin/demo-tracks', { ids: [A.id, Q.id] });
  check(r.status === 400 && r.d.id === Q.id, `morceau non terminé / ≥ 5 min → 400 (${r.d?.error})`);
  await j('DELETE', '/api/tracks/' + Q.id).catch(() => {});
  r = await j('GET', '/api/admin/demo-tracks');
  check(r.d.selected.join() === [A.id, Bt.id].join(), 'sélection inchangée après les refus');

  // ----- portée : utilisateur connecté (creator) -----
  r = await j('POST', '/api/admin/auth/users', { username: 'createur', password: 'createur-pass-12345', role: 'creator' });
  check(r.status === 201, `Admin : compte creator créé (${r.status})`);
  const lr = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'x=1' }, body: JSON.stringify({ username: 'createur', password: 'createur-pass-12345' }) });
  const lj = await lr.json().catch(() => ({}));
  const CR = { cookie: lr.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '), 'x-csrf-token': lj.csrf || lr.headers.get('x-csrf-token') || '' };
  const D = await gen({ style: 'ambient', seed: 99, duration: 20, title: 'Le mien' }, CR);
  const dD = await waitDone(D.id, CR);
  check(dD?.status === 'done' && dD.meta?.ownerId, `creator : morceau rendu (${dD?.status})`);
  r = await j('GET', '/api/tracks?limit=50', undefined, CR);
  check(r.status === 200 && r.d.total === 1 && r.d.items[0].id === D.id && r.d.items[0].urls?.mp3, `creator : voit tous ses morceaux et seulement les siens (${r.d?.total})`);
  r = await j('GET', '/api/tracks/' + A.id, undefined, CR);
  check(r.status === 404, `creator : morceau de l’admin → 404 (${r.status})`);
  r = await j('GET', `/api/tracks/${C.id}/audio.mp3`, undefined, CR);
  check(r.status === 404, `creator : audio d’un autre → 404 (${r.status})`);
  r = await j('POST', `/api/tracks/${D.id}/variation`, {}, CR);
  const dV = r.status === 202 ? await waitDone(r.d.id, CR) : null;
  check(r.status === 202 && dV?.meta?.ownerId === dD.meta.ownerId, `creator : sa variation lui appartient (${r.status})`);
  r = await j('GET', '/api/admin/demo-tracks', undefined, CR);
  check(r.status === 403, `creator : Admin › démo refusé (${r.status})`);
  r = await j('GET', '/api/tracks?limit=50');
  const allIds = (r.d.items || []).map((x) => x.id);
  check([A.id, Bt.id, C.id, D.id, dV?.id].every((x) => allIds.includes(x)), `admin : toute la bibliothèque, morceaux du creator compris (${r.d?.total})`);
  r = await j('GET', '/api/admin/demo-tracks');
  check(r.d.candidates.find((c) => c.id === D.id)?.owner === 'createur', 'Admin › démo : auteur affiché, morceaux de tous les comptes proposés');

  // ----- interface -----
  const html = rd('public/admin.html'), dj = rd('public/js/admindemo.js'), sj = rd('public/js/adminsamples.js');
  check(/id="demotracks"/.test(html) && /id="extsamples"/.test(html) && /admindemo\.js\?v=/.test(html) && /adminsamples\.js\?v=/.test(html), 'admin.html : cartes 06b (démo) + 06c (samples externes)');
  check(/sel\.size >= max/.test(dj) && /disabled/.test(dj) && /apiFetch/.test(dj) && /apiFetch/.test(sj), 'admin JS : maximum 10 côté client (cases désactivées) + CSRF (apiFetch)');
  const fr = JSON.parse(rd('public/i18n/fr.json')), en = JSON.parse(rd('public/i18n/en.json'));
  const keys = new Set([...(dj + sj + rd('public/js/style.js')).matchAll(/t\('((?:admin\.(?:demo|ext)|style\.demoLib)[\w.]*\w)'/g)].map((m) => m[1]));
  for (const c of CATEGORIES) keys.add('admin.extCat.' + c);
  for (const m of html.matchAll(/data-i18n(?:-placeholder)?="((?:admin\.(?:demo|ext))[\w.]*)"/g)) keys.add(m[1]);
  const miss = [...keys].filter((k) => !fr[k] || !en[k] || fr[k] === en[k] && !/^(Style|Clap|Kick|Ride|Rim \/ side-stick)$/.test(fr[k]));
  check(keys.size > 40 && !miss.length, `i18n FR + EN complet pour ${keys.size} clés${miss.length ? ' — manquantes : ' + miss.join(', ') : ''}`);
  check(/listenOnly: lo = false/.test(rd('public/js/site.js')) && /t\.listenOnly/.test(rd('public/js/site.js')), 'site.js : ligne de morceau en écoute seule pour les morceaux de démo (accueil + styles)');
} finally { srv.kill(); }

// ---------- moteur : kit « Mes samples » ----------
{
  process.env.SOUNDTUBE_EXT_SAMPLES_INDEX = path.join(data, 'external-samples-index.json');
  const { renderTrack } = await import('../src/engine/render.js');
  const w = (n) => path.join(tmp, n + '.wav');
  await renderTrack({ style: 'house', seed: 31, duration: 12, engine: 21, adv: { drumKit: 'user' } }, { wavPath: w('u1'), mp3Path: null });
  await renderTrack({ style: 'house', seed: 31, duration: 12, engine: 21, adv: { drumKit: 'user' } }, { wavPath: w('u2'), mp3Path: null });
  await renderTrack({ style: 'house', seed: 31, duration: 12, engine: 21, adv: { drumKit: 'house' } }, { wavPath: w('h'), mp3Path: null });
  check(md5(w('u1')) === md5(w('u2')) && md5(w('u1')) !== md5(w('h')), 'moteur : « Mes samples » déterministe (même graine + même index = même WAV) et différent du kit house');
  const { acousticDrum } = await import('../src/engine/instruments.js');
  const k = acousticDrum('user', 'kick', 1, 0, { extSeed: 1 }), rim = acousticDrum('user', 'rim', 1, 0, { extSeed: 1 });
  let pk = 0; for (const x of k) pk = Math.max(pk, Math.abs(x));
  check(k && Math.abs(pk - 1) < 0.02 && rim === null, `moteur : kick externe normalisé (crête ${pk.toFixed(3)}), catégorie absente (rim) → synthèse`);
  const idx = JSON.parse(fs.readFileSync(process.env.SOUNDTUBE_EXT_SAMPLES_INDEX, 'utf8'));
  fs.writeFileSync(process.env.SOUNDTUBE_EXT_SAMPLES_INDEX, JSON.stringify({ ...idx, enabled: false }));
  await renderTrack({ style: 'house', seed: 31, duration: 12, engine: 21, adv: { drumKit: 'user' } }, { wavPath: w('off'), mp3Path: null });
  check(md5(w('off')) !== md5(w('u1')), 'moteur : index désactivé → kit synthétisé (aucun accès au dossier)');
}

// ---------- textes rendus après fetch : attendre le catalogue i18n ; directeur IA : « Mes samples » jamais proposé ----------
{
  const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  check(/const i18nReady = new Promise/.test(rd('public/js/admindemo.js')) && /const i18nReady = new Promise/.test(rd('public/js/adminsamples.js')) && /i18nReady\.then/.test(rd('public/js/admindemo.js')) && /i18nReady\.then/.test(rd('public/js/adminsamples.js')),
    'cartes 06b / 06c : premier rendu après chargement du catalogue i18n (pas de clés brutes)');
  const ai = await import('../src/ai.js');
  const cat = ai.catalogue('house');
  check(/drumKit: [^\n]*house/.test(cat) && !/drumKit: [^\n]*\buser\b/.test(cat), 'directeur IA : catalogue sans le kit « user » (prompt v1.14 inchangé)');
}

fs.rmSync(tmp, { recursive: true, force: true });
if (fail) { console.log(log.split('\n').slice(-30).join('\n')); console.log(`\n${fail} échec(s)`); process.exit(1); }
console.log('\nv1.21.4 : tout est OK');
