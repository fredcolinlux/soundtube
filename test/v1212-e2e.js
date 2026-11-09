// v1.21.2 — bout en bout (lent, ~10 min, ffmpeg requis) : `node test/v1212-e2e.js`
//  1. mix DJ long → ZIP complet : vidéo longue + une vidéo PAR MORCEAU + textes FR et EN (fiches, README, YouTube).
//  2. course « renommage pendant la file vidéo » (cause du « ffmpeg code 254 : Error opening input file audio.wav »).
//  3. Studio (Chrome headless si présent) : la carte du mix et son bouton « Morceaux » apparaissent sans recharger.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-e2e-'));
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.log('ffmpeg absent : test ignoré'); process.exit(0); }

const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const data = path.join(tmp, 'data');
const env = { ...process.env, SOUNDTUBE_DATA_DIR: data, SOUNDTUBE_PORT: String(port), SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_YT_TRANSPORT: 'mock', SOUNDTUBE_SOCIAL_TRANSPORT: 'mock' };
delete env.SOUNDTUBE_MP3;
const child = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; child.stdout.on('data', (b) => { log += b; }); child.stderr.on('data', (b) => { log += b; });
const B = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${B}/healthz`)).ok) break; } catch {} await sleep(100); }
let r = await fetch(`${B}/api/auth/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test-password-12345' }) });
const j0 = await r.json();
const H = { cookie: r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '), 'x-csrf-token': j0.csrf, 'content-type': 'application/json' };
const req = async (u, m = 'GET', b) => { const x = await fetch(B + u, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await x.json(); } catch {} return { s: x.status, j }; };
const until = async (fn, ms = 1_800_000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(1000); } return null; };
const gen = async (body) => { const g = await req('/api/generate', 'POST', body); return until(async () => { const t = (await req(`/api/tracks/${g.j.id}`)).j; return ['done', 'error'].includes(t?.status) ? t : null; }); };

try {
  // ---------- 2. course renommage / file vidéo ----------
  const A = await gen({ style: 'lofi', seed: 81, duration: 180 }), Bt = await gen({ style: 'lofi', seed: 82, duration: 20 });
  await req(`/api/tracks/${A.id}/video`, 'POST', { resolution: '720p' });
  await req(`/api/tracks/${Bt.id}/video`, 'POST', { resolution: '720p' });
  await sleep(1500);
  await req(`/api/tracks/${Bt.id}`, 'PATCH', { title: 'Renommé pendant la file' });
  const vb = await until(async () => { const t = (await req(`/api/tracks/${Bt.id}`)).j; return t?.files?.mp4 ? t : null; }, 300_000);
  check(!!vb && !/Error opening input/.test(log), 'vidéo d’un morceau renommé pendant qu’il attend son tour : rendue (pas de « Error opening input »)');
  check(fs.readdirSync(path.join(data, 'tracks', Bt.id)).every((f) => !f.startsWith('.pin-')), 'lien d’épinglage de l’audio supprimé après le rendu');

  // ---------- 1. mix → ZIP complet ----------
  const mix = await gen({ style: 'techno', seed: 1316, duration: +(process.env.E2E_DUR || 1860), adv: { mix: 'on' } });
  const n = mix?.meta?.mix?.decks?.length || 0;
  check(mix?.status === 'done' && n >= 2, `mix DJ ${Math.round((mix?.duration || 0) / 60)} min : ${n} titres`);
  const z = await req(`/api/tracks/${mix.id}/pack`, 'POST', { video: true, videoRes: '720p', pieces: true, pieceVideo: true, pieceRes: '720p', wav: false, midi: false, txt: true });
  check(z.s === 202, `ZIP complet lancé (${z.s})`);
  const zs = await until(async () => { const x = (await req(`/api/tracks/${mix.id}/pack`)).j; return ['done', 'error'].includes(x?.state?.status) ? x : null; });
  check(zs?.state?.status === 'done', `ZIP complet : ${zs?.state?.status} ${zs?.state?.error || ''}`);
  if (zs?.state?.url) {
    const zf = path.join(tmp, 'pack.zip'); fs.writeFileSync(zf, Buffer.from(await (await fetch(B + zs.state.url, { headers: H })).arrayBuffer()));
    const L = spawnSync('unzip', ['-Z1', zf], { encoding: 'utf8' }).stdout.trim().split('\n');
    const cat = (re) => spawnSync('unzip', ['-p', zf, L.find((x) => re.test(x))], { encoding: 'utf8', maxBuffer: 1e8 }).stdout;
    const pieces = (re) => L.filter((x) => /\/morceaux\/[^/]+$/.test(x) && re.test(x));
    check(L.some((x) => /\/video\/.+\.mp4$/.test(x)), 'vidéo longue dans video/');
    check(pieces(/\.mp4$/).length === n, `une vidéo par morceau : ${pieces(/\.mp4$/).length}/${n}`);
    check(pieces(/\.en\.txt$/).length === n && pieces(/(?<!\.en)\.txt$/).length === n, `fiches TXT FR et EN par morceau : ${pieces(/(?<!\.en)\.txt$/).length} FR / ${pieces(/\.en\.txt$/).length} EN`);
    check(['README.txt', 'LISEZMOI.txt', 'youtube-en.txt', 'youtube-fr.txt'].every((f) => L.some((x) => x.endsWith('/' + f))), 'README.txt (EN), LISEZMOI.txt (FR), youtube-en.txt, youtube-fr.txt');
    const en = cat(/\.en\.txt$/), yen = cat(/youtube-en\.txt$/), readme = cat(/README\.txt$/);
    check(/^Title: /m.test(en) && /YouTube title: /.test(en) && /Tags: /.test(en) && !/Tonalité|Titre YouTube/.test(en), 'fiche EN : libellés et description YouTube en anglais');
    check(/YouTube title: /.test(yen) && /Tags: /.test(yen), 'youtube-en.txt : titre, description, tags EN');
    check(/package/.test(readme) && /Layout:/.test(readme), 'README.txt en anglais');
    const M = JSON.parse(cat(/manifest\.json$/));
    check(M.pieces.every((p) => p.title_en && p.files.mp4 && p.files.txt && p.files.txtEn), 'manifeste : titre EN, MP4, TXT FR/EN par morceau');
  }
  check(!/Error opening input|ffmpeg code 254/.test(log), 'journal : aucune erreur ffmpeg d’entrée audio');

  // ---------- 3. Studio ----------
  let pptr = null; try { pptr = await import('puppeteer-core'); } catch {}
  const chrome = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((f) => fs.existsSync(f));
  if (pptr && chrome && mix?.duration > 1800) {
    const br = await pptr.default.launch({ executablePath: chrome, args: ['--no-sandbox', '--headless=new'] });
    try {
      const pg = await br.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
      await pg.setCookie(...H.cookie.split('; ').map((c) => { const [name, ...v] = c.split('='); return { name, value: v.join('='), url: B }; }));
      await pg.goto(`${B}/studio`, { waitUntil: 'domcontentloaded' }); await sleep(5000);
      const s = await pg.evaluate((id) => ({ card: !!document.querySelector(`#libraryList .track[data-id="${id}"]`), btn: !!document.querySelector(`#libraryList .track[data-id="${id}"] [data-act="split"]`) }), mix.id);
      check(s.card && s.btn, 'Studio : carte du mix + bouton « Morceaux »');
      await pg.click(`#libraryList .track[data-id="${mix.id}"] [data-act="split"]`); await sleep(2500);
      const txt = await pg.evaluate((id) => document.querySelector(`#libraryList .track[data-id="${id}"]`)?.innerText || '', mix.id);
      check(new RegExp(`(Morceaux|MORCEAUX) \\(${n}\\)`).test(txt), `Studio : liste « Morceaux (${n}) » affichée`);
      check(!errs.length, `Studio : aucune erreur JS ${errs.join(' | ')}`);
    } finally { await br.close(); }
  } else console.log('(info) Studio : Chrome/puppeteer absent ou mix ≤ 30 min — contrôle navigateur ignoré');
} catch (e) { check(false, 'e2e : ' + e.message); console.log(log.slice(-2000)); }
finally { child.kill('SIGTERM'); }
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests e2e v1.21.2 OK');
process.exit(fail ? 1 : 0);
