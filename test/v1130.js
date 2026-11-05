// Tests v1.13.0 : chaînes YouTube par style (secrets jamais renvoyés ni journalisés, fichier 0600), profils de publication,
// auto-publication (opt-in + confirmation), file, ZIP complet, moteurs inchangés.
// AUCUN envoi réel : transport « mock » (SOUNDTUBE_YT_TRANSPORT=mock) ou fetch factice. node test/v1130.js
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v1130-'));
process.env.SOUNDTUBE_DATA_DIR = path.join(tmp, 'unit-data');
const { Channels, normalizeProfile, fillTemplate, publishAtOf, mask, liveTransport, mockTransport, CONFIRM_WORD } = await import('../src/publish.js');
const { compose, renderTrack } = await import('../src/engine/render.js');

let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const h = (x) => crypto.createHash('md5').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SECRETS = { clientId: '987654321-testclient.apps.googleusercontent.com', clientSecret: 'GOCSPX-TESTSECRET-ne-doit-jamais-sortir', refreshToken: '1//0TESTREFRESH-ne-doit-jamais-sortir' };
const leaks = (s) => [SECRETS.clientSecret, SECRETS.refreshToken, SECRETS.clientId].filter((x) => String(s).includes(x));

// ---------- 1. moteurs : aucun changement audio (empreintes v1.12.0 du moteur 21 ; le moteur 20 est vérifié par test/v1120.js)
const GOLD21 = [
[{"style":"lofi","seed":1301,"duration":30,"engine":21},"93ad158cedb63f408af08eb80b695790","2494bcfe9015d9bb9af6ed4110564b8b"],
[{"style":"house","seed":1302,"duration":30,"engine":21},"0b621f5adbb08b0a3de9a6bf2d523037","4e217fdcb99f98b9179e596eeb09f81c"],
[{"style":"frenchtouch","seed":1303,"duration":30,"engine":21,"adv":{"ftStyle":"myd"}},"1f171ced3224cf1ff5053a1a120da42b","1b405406c27d9a5d17de6919e9cf8554"],
];
for (const [i, [c, ev, pcm]] of GOLD21.entries()) {
  const e = h(compose(c).events);
  if (i) { check(e === ev, `moteur 21 identique à v1.12.0 (événements) : ${c.style}`); continue; }
  const r = await renderTrack(c, { memory: true }); check(e === ev && h(r.pcm) === pcm, `moteur 21 identique à v1.12.0 (événements + audio) : ${c.style}`);
}

// ---------- 2. chaînes et profils (unitaire)
{
  const dir = path.join(tmp, 'ch'); fs.mkdirSync(dir);
  const C = new Channels(dir);
  check(C.missing(C.forStyle('lofi')).includes('Aucune chaîne'), 'sans chaîne : message clair « Aucune chaîne YouTube configurée »');
  const a = C.upsert({ name: 'Lofi FR', channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', ...SECRETS });
  const b = C.upsert({ name: 'Club', clientId: 'x-client-id-1234' });
  const file = path.join(dir, 'youtube-channels.json');
  check((fs.statSync(file).mode & 0o777) === 0o600, `fichier des secrets en 0600 (${(fs.statSync(file).mode & 0o777).toString(8)})`);
  check(leaks(JSON.stringify(C.view())).length === 0 && C.view().channels[0].hasClientSecret && C.view().channels[0].hasRefreshToken, 'vue publique : aucun secret, seulement « présent »');
  check(mask(SECRETS.clientId) === '9876….com' && mask('abc') === '••••' && mask('') === '', 'masque du client ID');
  check(C.forStyle('house').id === a.id, 'style sans liaison → chaîne par défaut (la première)');
  C.bind('house', b.id); C.bind('techno', b.id);
  check(C.forStyle('house').id === b.id && C.forStyle('techno').id === b.id && C.forStyle('lofi').id === a.id, 'une chaîne sert plusieurs styles ; les autres gardent la chaîne par défaut');
  check(/client secret, jeton d'actualisation manquants/.test(C.missing(C.forStyle('house'))), `chaîne incomplète : « ${C.missing(C.forStyle('house'))} »`);
  C.upsert({ name: 'Lofi FR (renommée)', clientSecret: '', refreshToken: undefined }, a.id);
  check(C.ready(C.get(a.id)) && C.get(a.id).clientSecret === SECRETS.clientSecret, 'modifier sans retaper les secrets : secrets conservés');
  C.upsert({ refreshToken: null }, a.id); check(!C.ready(C.get(a.id)) && /jeton d'actualisation manquant/.test(C.missing(C.get(a.id))), 'effacer le jeton : chaîne plus prête');
  C.upsert({ refreshToken: SECRETS.refreshToken }, a.id);
  let e428 = null; try { C.setProfile('lofi', { autoPublish: true }); } catch (e) { e428 = e; }
  check(e428?.status === 428 && !C.profile('lofi').autoPublish, 'auto-publication sans confirmation : refusée (428), reste désactivée');
  C.setProfile('lofi', { autoPublish: true, visibility: 'unlisted', title: '{titre} · {style}' }, { confirm: CONFIRM_WORD });
  check(C.profile('lofi').autoPublish && C.profile('lofi').visibility === 'unlisted', 'auto-publication avec « PUBLIER » : activée');
  const C2 = new Channels(dir); check(C2.profile('lofi').autoPublish && C2.forStyle('house').id === b.id && C2.get(a.id).refreshToken === SECRETS.refreshToken, 'réglages relus après redémarrage');
  check(C.scrub(`erreur ${SECRETS.refreshToken} / ${SECRETS.clientSecret}`) === 'erreur ••• / •••', 'scrub() masque les secrets dans les messages');
  C.remove(a.id); check(C.s.defaultId === b.id && !C.get(a.id), 'retirer la chaîne par défaut : la suivante devient défaut');
  const P = normalizeProfile({ visibility: 'nope', tags: 'a, b,, c', schedule: { mode: 'delay', delayHours: 5 }, thumbnail: 'none' });
  check(P.visibility === 'private' && P.tags.join() === 'a,b,c' && P.thumbnail === 'none' && P.autoPublish === false, 'profil normalisé : privée par défaut, auto-publication désactivée par défaut');
  check(normalizeProfile({ description: 'L1\r\n\nL3\u0007' }).description === 'L1\n\nL3', 'description : sauts de ligne conservés, caractères de contrôle retirés');
  check(fillTemplate('{titre} — {bpm} BPM {inconnu}', { titre: 'X', bpm: 97 }) === 'X — 97 BPM {inconnu}', 'gabarit {titre} {bpm}');
  const now = Date.parse('2026-11-04T10:00:00Z');
  check(publishAtOf({ mode: 'delay', delayHours: 2 }, now) === '2026-11-04T12:00:00.000Z' && publishAtOf({ mode: 'at', at: '2026-11-03T00:00:00Z' }, now) === null && publishAtOf({ mode: 'none' }, now) === null, 'programmation : délai, date passée ignorée');
}

// ---------- 3. transport réel avec fetch factice (aucune requête réseau)
{
  const calls = [], vid = path.join(tmp, 'v.mp4'); fs.writeFileSync(vid, Buffer.alloc(1000, 1));
  const fake = async (url, o = {}) => {
    calls.push({ url, method: o.method, body: typeof o.body === 'string' ? o.body : o.body instanceof URLSearchParams ? o.body.toString() : '[flux]' });
    if (o.body && typeof o.body.on === 'function') { for await (const _ of o.body); } // eslint-disable-line no-unused-vars
    const J = (s, j, hd = {}) => ({ ok: s < 300, status: s, json: async () => j, headers: { get: (k) => hd[k] } });
    if (url.includes('oauth2')) return J(200, { access_token: 'ya29.acces' });
    if (url.includes('uploadType=resumable')) return J(200, {}, { location: 'https://upload.example/session' });
    if (url.startsWith('https://upload.example')) return J(200, { id: 'VID123' });
    return J(200, {});
  };
  const ch = { id: 'c1', name: 'T', ...SECRETS };
  const r = await liveTransport(fake).upload({ channel: ch, video: vid, thumb: null, snippet: { title: 't' }, status: { privacyStatus: 'private' }, playlistId: 'PL1' });
  check(r.videoId === 'VID123' && calls[0].url.includes('oauth2.googleapis.com') && calls[0].body.includes('grant_type=refresh_token') && calls.some((c) => c.url.includes('playlistItems')), 'transport réel (fetch factice) : jeton → envoi resumable → playlist');
  const bad = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant', error_description: SECRETS.refreshToken }) });
  let e = null; try { await liveTransport(bad).upload({ channel: ch, video: vid, snippet: {}, status: {} }); } catch (x) { e = x; }
  check(e && /Jeton refusé/.test(e.message) && leaks(e.message).length === 0, `jeton refusé : « ${e?.message} » (sans secret)`);
  let e2 = null; try { await mockTransport(null).upload({ channel: { ...ch, refreshToken: '' }, video: vid }); } catch (x) { e2 = x; }
  check(e2?.status === 412, 'mock : refuse aussi sans jeton');
}

// ---------- 4. serveur réel en mode simulation
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
{
  const port = await freePort(), B = `http://127.0.0.1:${port}`, data = path.join(tmp, 'api-data');
  const srv = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], { env: { ...process.env, SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA_DIR: data, SOUNDTUBE_YT_TRANSPORT: 'mock' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  const req = async (p, m = 'GET', b) => { const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, j, t }; };
  const done = async (id) => { for (let i = 0; i < 400; i++) { const j = (await req('/api/jobs/' + id)).j; if (j?.status === 'done' || j?.status === 'error') return j; await sleep(300); } return null; };
  const until = async (fn, n = 300) => { for (let i = 0; i < n; i++) { const v = await fn(); if (v) return v; await sleep(400); } return null; };
  const all = [];
  try {
    for (let i = 0; i < 100; i++) { if ((await fetch(B + '/api/options').catch(() => null))?.ok) break; await sleep(200); }
    const ad0 = await req('/api/admin/youtube'); check(ad0.j.transport === 'mock', 'serveur de test en transport « mock » (aucun envoi réel)');
    const spec = (await req('/api/openapi.json')).j; check(String(spec.info.version).split('.').map(Number).reduce((a, x) => a * 1000 + x, 0) >= 1013000 && spec.paths['/api/admin/youtube/channels'] && spec.paths['/api/tracks/{id}/pack'] && spec.paths['/api/styles/{id}/publish'], 'openapi 1.13.0 : chaînes, profils, file et ZIP documentés');
    const t = await done((await req('/api/generate', 'POST', { style: 'lofi', seed: 1313, duration: 20, wav: true })).j.id);
    check(t?.status === 'done', 'morceau court généré');
    const d0 = await req(`/api/tracks/${t.id}/publish`);
    check(d0.j.ready === false && /Aucune chaîne/.test(d0.j.reason), `sans chaîne : publish.ready = false, « ${d0.j.reason} »`);
    const p0 = await req(`/api/tracks/${t.id}/publish`, 'POST', { confirm: 'PUBLIER' }); check(p0.s === 412 && /Aucune chaîne/.test(p0.j.error), 'envoi sans chaîne : 412 explicite');
    const c1 = await req('/api/admin/youtube/channels', 'POST', { name: 'Lofi FR', channelId: 'UCbbbbbbbbbbbbbbbbbbbbbb', clientId: SECRETS.clientId, clientSecret: SECRETS.clientSecret }); all.push(c1.t);
    const cid = c1.j.channels[0].id;
    const d1 = await req(`/api/tracks/${t.id}/publish`); all.push(d1.t);
    check(d1.j.ready === false && /jeton d'actualisation manquant/.test(d1.j.reason), `jeton manquant : « ${d1.j.reason} »`);
    all.push((await req(`/api/admin/youtube/channels/${cid}`, 'PUT', { refreshToken: SECRETS.refreshToken })).t);
    const ad = await req('/api/admin/youtube'); all.push(ad.t);
    check(ad.j.channels[0].ready && ad.j.channels[0].hasRefreshToken && leaks(ad.t).length === 0, 'Admin : chaîne prête, secrets absents de la réponse');
    check((fs.statSync(path.join(data, 'youtube-channels.json')).mode & 0o777) === 0o600, 'youtube-channels.json en 0600');
    const d2 = await req(`/api/tracks/${t.id}/publish`); all.push(d2.t);
    check(d2.j.ready && d2.j.channel.id === cid && d2.j.title === t.title && /BPM/.test(d2.j.description) && d2.j.visibility === 'private', 'formulaire prérempli : chaîne du style (défaut), titre, description avec BPM, privée');
    const n0 = await req(`/api/tracks/${t.id}/publish`, 'POST', { title: 'X' }); check(n0.s === 428, 'envoi sans confirmation : 428');
    const n1 = await req(`/api/tracks/${t.id}/publish`, 'POST', { confirm: 'oui' }); check(n1.s === 428, 'mauvaise confirmation : 428');
    const p1 = await req(`/api/tracks/${t.id}/publish`, 'POST', { confirm: 'PUBLIER', title: '{titre} — test', visibility: 'unlisted', playlistId: 'PLtest', tags: 'lofi, test' }); all.push(p1.t);
    check(p1.s === 202 && p1.j.title === `${t.title} — test` && p1.j.transport === 'mock', 'envoi confirmé : 202, en file (mock)');
    const fin = await until(async () => { const q = (await req('/api/publish/queue')).j.items.find((x) => x.id === p1.j.id); return q && ['done', 'error'].includes(q.status) ? q : null; });
    check(fin?.status === 'done' && /^mock-/.test(fin.videoId), `envoi : ${fin?.status} ${fin?.url || fin?.error || ''}`);
    const mock = fs.readFileSync(path.join(data, 'youtube-mock.jsonl'), 'utf8'); const rec = JSON.parse(mock.trim().split('\n')[0]);
    check(rec.status.privacyStatus === 'unlisted' && rec.playlistId === 'PLtest' && rec.snippet.tags.includes('test') && rec.thumb && rec.videoBytes > 1000, 'mock : vidéo rendue, miniature, visibilité, playlist, tags transmis');
    check((await req(`/api/tracks/${t.id}/publish`, 'POST', { confirm: 'PUBLIER' })).s === 409, 'double publication sur la même chaîne : 409');
    check((await req(`/api/tracks/${t.id}`)).j.meta?.published?.[0]?.videoId === fin.videoId, 'meta.published renseigné sur le morceau');
    // profils par style + auto-publication
    const sp = await req('/api/styles/house/publish'); check(sp.j.profile.autoPublish === false && sp.j.channel?.id === cid, 'profil house : auto-publication désactivée par défaut, chaîne par défaut');
    const c2 = await req('/api/admin/youtube/channels', 'POST', { name: 'Club', ...SECRETS }); const cid2 = c2.j.channels.find((c) => c.name === 'Club').id;
    const a0 = await req('/api/styles/house/publish', 'PUT', { channelId: cid2, profile: { autoPublish: true, title: '{titre} [{style}]', visibility: 'public' } });
    check(a0.s === 428 && (await req('/api/styles/house/publish')).j.profile.autoPublish === false, 'auto-publication sans « PUBLIER » : 428');
    const a1 = await req('/api/styles/house/publish', 'PUT', { channelId: cid2, profile: { autoPublish: true, title: '{titre} [{style}]', visibility: 'public', schedule: { mode: 'delay', delayHours: 3 } }, confirm: 'PUBLIER' });
    check(a1.s === 200 && a1.j.profile.autoPublish && a1.j.channel.id === cid2, 'auto-publication house activée, liée à « Club »');
    const lof = await done((await req('/api/generate', 'POST', { style: 'lofi', seed: 1314, duration: 20 })).j.id);
    const hs = await done((await req('/api/generate', 'POST', { style: 'house', seed: 1315, duration: 20 })).j.id);
    const auto = await until(async () => { const q = (await req('/api/publish/queue?style=house')).j.items.find((x) => x.trackId === hs.id); return q && ['done', 'error'].includes(q.status) ? q : null; });
    check(auto?.status === 'done' && auto.mode === 'auto' && auto.channelId === cid2 && auto.title === `${hs.title} [Deep House]` && auto.visibility === 'public' && !!auto.publishAt, `auto-publication : ${auto?.status} sur « Club », programmée ${auto?.publishAt}`);
    await sleep(800);
    check(!(await req('/api/publish/queue')).j.items.some((x) => x.trackId === lof.id), 'style sans opt-in (lofi) : rien publié automatiquement');
    const mrec = fs.readFileSync(path.join(data, 'youtube-mock.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).find((x) => x.channel === cid2);
    check(mrec?.status.privacyStatus === 'private' && mrec.status.publishAt, 'programmation : privée + publishAt (YouTube la rend publique à l\'heure dite)');
    all.push((await req('/api/publish/queue')).t, (await req('/api/styles/house/publish')).t);
    // ZIP complet
    const z0 = await req(`/api/tracks/${t.id}/pack`, 'POST', { video: true, wav: true, midi: true }); check(z0.s === 202, 'ZIP complet : lancé');
    const zs = await until(async () => { const j = (await req(`/api/tracks/${t.id}/pack`)).j; return ['done', 'error'].includes(j.state?.status) ? j : null; });
    check(zs?.state.status === 'done' && zs.state.url, `ZIP complet : ${zs?.state.status} ${zs?.state.error || ''}`);
    const zr = await fetch(B + zs.state.url), zb = Buffer.from(await zr.arrayBuffer()), zf = path.join(tmp, 'p.zip'); fs.writeFileSync(zf, zb);
    check(zr.ok && +zr.headers.get('content-length') === zb.length && zb.readUInt32LE(0) === 0x04034b50, `ZIP : ${zb.length} octets, en-tête PK`);
    const un = spawnSync('unzip', ['-Z1', zf], { encoding: 'utf8' });
    if (un.status === 0) {
      const L = un.stdout.trim().split('\n'), has = (re) => L.some((x) => re.test(x));
      check(has(/\/video\/.*\.mp4$/) && has(/\/mix\/.*\.mp3$/) && has(/\/mix\/.*\.wav$/) && has(/\/mix\/.*\.mid$/) && has(/\/manifest\.json$/) && has(/\/LISEZMOI\.txt$/), `ZIP : ${L.length} fichiers (vidéo, mix MP3/WAV/MIDI, manifeste)`);
      const t2 = spawnSync('unzip', ['-tq', zf], { encoding: 'utf8' }); check(t2.status === 0, 'unzip -t : archive valide (CRC)');
      const M = JSON.parse(spawnSync('unzip', ['-p', zf, L.find((x) => x.endsWith('manifest.json'))], { encoding: 'utf8' }).stdout);
      check(M.pieces.length === 1 && M.pieces[0].bpm === t.params.bpm && M.pieces[0].key === t.params.key && M.pieces[0].seed === 1313 && M.pieces[0].style === 'lofi', 'manifeste : tempo, tonalité, graine, style du morceau');
    } else check(true, 'unzip absent : contenu du ZIP non listé');
    // ZIP d'un mix DJ (titres découpés à la volée, sans vidéo) — à partir d'un plan de mix court forcé
    const mx = process.argv.includes('--mix') ? await done((await req('/api/generate', 'POST', { style: 'techno', seed: 1316, duration: 900, adv: { mix: 'on' } })).j.id) : null; // rendu de 15 min : seulement avec --mix
    if (mx?.meta?.mix?.decks?.length >= 2) {
      await req(`/api/tracks/${mx.id}/pack`, 'POST', { video: false, midi: true });
      const ms = await until(async () => { const j = (await req(`/api/tracks/${mx.id}/pack`)).j; return ['done', 'error'].includes(j.state?.status) ? j : null; });
      const M = JSON.parse(fs.readFileSync(path.join(data, 'tracks', mx.id, 'pack', 'manifest.json'), 'utf8'));
      check(ms?.state.status === 'done' && M.pieces.length === mx.meta.mix.decks.length && M.pieces.every((p) => p.bpm && p.key && p.seed != null && p.style && p.files.mp3 && p.files.midi?.length), `mix DJ ${Math.round(mx.duration / 60)} min : ${M.pieces.length} morceaux, tempo / tonalité / graine / style chacun`);
    } else check(true, 'mix DJ : contrôle avec --mix (rendu de 15 min)');
    // aucun secret dans les réponses ni le journal
    check(leaks(all.join('\n')).length === 0, 'aucune réponse de l\'API ne contient un secret');
    check(leaks(log).length === 0 && leaks(fs.readFileSync(path.join(data, 'youtube-mock.jsonl'), 'utf8')).length === 0 && leaks(fs.readFileSync(path.join(data, 'publish-queue.json'), 'utf8')).length === 0, 'journal, file et consignation mock : aucun secret');
  } catch (e) { check(false, 'API : ' + e.message); console.log(log.slice(-1500)); }
  finally { srv.kill(); }
}
// ---------- 5. serveur sans mode simulation : rien ne part sans chaîne complète (aucune requête vers Google)
{
  const port = await freePort(), B = `http://127.0.0.1:${port}`, env = { ...process.env, SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA_DIR: path.join(tmp, 'live-data') }; delete env.SOUNDTUBE_YT_TRANSPORT;
  const srv = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], { env, stdio: 'ignore' });
  try {
    for (let i = 0; i < 100; i++) { if ((await fetch(B + '/api/options').catch(() => null))?.ok) break; await sleep(200); }
    const ad = await (await fetch(B + '/api/admin/youtube')).json(); check(ad.transport === 'live' && ad.channels.length === 0, 'mode normal : transport réel, aucune chaîne');
    await fetch(B + '/api/admin/youtube/channels', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Sans jeton', clientId: 'id-1234567', clientSecret: 'secret-1234567' }) });
    const g = await (await fetch(B + '/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ style: 'ambient', seed: 5, duration: 20 }) })).json();
    for (let i = 0; i < 300; i++) { const j = await (await fetch(B + '/api/jobs/' + g.id)).json(); if (j.status === 'done') break; await sleep(300); }
    const d = await (await fetch(`${B}/api/tracks/${g.id}/publish`)).json();
    const r = await fetch(`${B}/api/tracks/${g.id}/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'PUBLIER' }) });
    check(d.ready === false && /jeton d'actualisation manquant/.test(d.reason) && r.status === 412, `mode normal sans jeton : bouton bloqué (« ${d.reason} »), POST 412`);
  } catch (e) { check(false, 'mode normal : ' + e.message); } finally { srv.kill(); }
}
// ---------- 6. interface
{
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const adm = read('public/admin.html'), ya = read('public/js/ytadmin.js'), st = read('public/style.html'), sp = read('public/js/stylepublish.js'), pp = read('public/js/pubpanel.js'), app = read('public/js/app.js');
  check(adm.includes('id="youtube"') && adm.includes('type="password" id="ytSecret"') && adm.includes('type="password" id="ytToken"') && ya.includes('/api/admin/youtube/bindings'), 'Admin : section « Chaînes YouTube », secrets en champs masqués, liaisons style → chaîne');
  check(st.includes('id="publish"') && st.includes('id="pubAuto"') && sp.includes('confirm:') && st.includes('id="pubQueue"'), 'page Style : profil de publication, auto-publication avec confirmation, file');
  check(pp.includes('Publication impossible') && pp.includes('data-act="pubgo"') && pp.includes('data-act="packgo"') && app.includes('publishHTML(t)') && app.includes('packHTML(t)'), 'panneau YouTube : formulaire de publication (bouton explicite sans jeton) et ZIP complet');
  check(!/\?v=1\.12\.0/.test(read('public/index.html') + st + adm + app), 'cache des pages : ?v=1.13.0');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} échec(s)` : '\nv1.13.0 : tout est OK');
process.exit(fail ? 1 : 0);
