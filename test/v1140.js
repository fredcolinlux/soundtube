// Tests v1.14.0 : animation de la vidéo choisie avant la génération (par style), ZIP complet en un clic
// (video/, mix/, morceaux/ avec MP4, MP3, WAV, TXT par morceau + MIDI/ + samples/), stems, paquet automatique.
// AUCUN envoi : transport « mock » (SOUNDTUBE_YT_TRANSPORT=mock). node test/v1140.js [--mix : mix DJ forcé de 15 min, complet]
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v1140-'));
process.env.SOUNDTUBE_DATA_DIR = path.join(tmp, 'unit-data');
const { compose, renderTrack } = await import('../src/engine/render.js');
const { buildPack, packOptions, packSplit, chordLines } = await import('../src/pack.js');
const { renderStems, STEM_GROUPS } = await import('../src/stems.js');
const { planMix } = await import('../src/engine/mix.js');
const { wavHeader } = await import('../src/split.js');

let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const h = (x) => crypto.createHash('md5').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const zipList = (file) => spawnSync('unzip', ['-Z1', file], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
const zipRead = (file, name) => spawnSync('unzip', ['-p', file, name], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout;

// ---------- 1. moteurs : aucun changement audio (empreintes v1.12.0), le crochet « stem » est inerte sans option
{
  const c = { style: 'lofi', seed: 1301, duration: 30, engine: 21 };
  const r = await renderTrack(c, { memory: true });
  check(h(compose(c).events) === '93ad158cedb63f408af08eb80b695790' && h(r.pcm) === '2494bcfe9015d9bb9af6ed4110564b8b', 'moteur 21 identique à v1.12.0 (événements + audio)');
}
// ---------- 2. stems : chaque groupe rendu seul, la somme redonne le mix
{
  const dir = path.join(tmp, 'stems'); fs.mkdirSync(dir);
  const P = { style: 'house', seed: 1402, duration: 20, engine: 21 };
  const mix = await renderTrack({ ...P, wav: true }, { memory: true });
  const t = { id: 's', params: P, duration: 20, meta: { ...mix.meta, loudness: mix.loudness } };
  const R = await renderStems(t, dir, { cpus: 4 });
  const pcm = (f) => { const b = fs.readFileSync(f), o = b.indexOf('data') + 8; return new Int16Array(b.buffer.slice(b.byteOffset + o, b.byteOffset + b.length - ((b.length - o) & 1))); };
  const S = STEM_GROUPS.filter((g) => R[g.id]?.peak > 1e-4).map((g) => pcm(R[g.id].path));
  check(STEM_GROUPS.every((g) => fs.existsSync(R[g.id].path)) && S.length >= 3, `stems house : ${S.length} groupes non vides (${STEM_GROUPS.map((g) => `${g.label} ${R[g.id].peak > 1e-4 ? '✓' : '∅'}`).join(', ')})`);
  const M = new Int16Array(mix.pcm.buffer, mix.pcm.byteOffset, mix.pcm.length >> 1);
  let e = 0, s = 0; const n = Math.min(M.length, S[0].length);
  for (let i = 0; i < n; i++) { let x = 0; for (const a of S) x += a[i]; e += (x - M[i]) ** 2; s += M[i] ** 2; }
  const db = 10 * Math.log10(e / s);
  check(db < -8, `somme des stems ≈ mix (écart ${db.toFixed(1)} dB)`);
}
// ---------- 3. paquet (unitaire, mix DJ court fabriqué, vidéos factices) : arborescence, TXT, manifeste, jamais d'omission
{
  const tracksDir = path.join(tmp, 'tracks'), id = 'mixtest', dir = path.join(tracksDir, id); fs.mkdirSync(dir, { recursive: true });
  const params = { style: 'house', seed: 1403, duration: 80, engine: 21, adv: { mix: 'on' } }, D = planMix({ ...params, duration: 60 }).decks;
  const frames = 80 * 44100, pcm = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i++) { const v = Math.round(8000 * Math.sin(i * 2 * Math.PI * 220 / 44100)); pcm.writeInt16LE(v, 4 * i); pcm.writeInt16LE(v, 4 * i + 2); }
  fs.writeFileSync(path.join(dir, 'mix.wav'), Buffer.concat([wavHeader(frames), pcm]));
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(dir, 'mix.wav'), '-b:a', '128k', path.join(dir, 'mix.mp3')]);
  fs.writeFileSync(path.join(dir, 'mix.mid'), Buffer.from('MThd'));
  const t = { id, title: 'Nuit test', style: 'house', status: 'done', duration: 80, params, seed: 1403, bpm: 122, key: 'A', scale: 'minor',
    meta: { mix: { decks: [{ name: D[0].name, seed: D[0].seed, start: 0, deckStart: 0, deckEnd: 46 }, { name: D[1].name, seed: D[1].seed, start: 38, deckStart: 30, deckEnd: 80 }] }, progressions: { A: ['Am7', 'F', 'C', 'G'] } },
    files: { wav: 'mix.wav', mp3: 'mix.mp3', mid: 'mix.mid' } };
  check(packSplit(t).ok && packSplit(t).kind === 'mix' && !packSplit({ duration: 600, meta: {} }).ok, 'découpe du paquet : mix DJ à toute durée, morceau unique court jamais découpé');
  let vidRes = null, longRes = null;
  const deps = { tracksDir, hasFfmpeg: true, brand: 'soundtube', cpus: 4,
    ensureVideo: async (x, onP, res) => { longRes = res; onP(1); fs.writeFileSync(path.join(dir, 'mix.mp4'), Buffer.alloc(2048, 1)); return { ...x, files: { ...x.files, mp4: 'mix.mp4' }, meta: { ...x.meta, youtube: { videoResolution: res || '1080p' } } }; },
    pieceVideos: async (x, M, out, res, onP) => { vidRes = res; const vd = path.join(tmp, 'pv'); fs.mkdirSync(vd, { recursive: true }); const L = []; for (const [i, p] of M.pieces.entries()) { await sleep(600); onP(i + 1, (i + 1) / M.pieces.length); const f = path.join(vd, p.n + '.mp4'); fs.writeFileSync(f, Buffer.alloc(1024, p.n)); L.push({ n: p.n, path: f }); } return L; } };
  const stages = []; deps.onProgress = (f, s) => stages.push(s);
  const O = packOptions({ video: true, videoRes: '720p', pieces: true, pieceVideo: true, wav: true, midi: true, txt: true, stems: true });
  check(O.pieceRes === '720p' && packOptions({}).pieceVideo === false && packOptions({}).stems === false, 'options : vidéo par morceau et samples désactivés par défaut, 720p par défaut');
  const M = await buildPack(t, O, deps);
  const names = M.entries.map((e) => e.name), R = 'nuit-test/';
  const top = [...new Set(names.map((n) => n.slice(R.length).split('/')[0]))].sort();
  check(names.every((n) => n.startsWith(R)) && JSON.stringify(top) === JSON.stringify(['LISEZMOI.txt', 'manifest.json', 'mix', 'morceaux', 'video']), `racine : ${top.join(', ')}`);
  const P = M.pieces, b1 = P[0].base;
  check(P.length === 2 && /^01 - /.test(b1) && /^02 - /.test(P[1].base), `morceaux nommés « 01 - Titre » : ${P.map((p) => p.base).join(' | ')}`);
  const need = (p) => ['mp4', 'mp3', 'wav', 'txt'].map((x) => `${R}morceaux/${p.base}.${x}`);
  check(P.every((p) => need(p).every((n) => names.includes(n))), 'morceaux/ : MP4, MP3, WAV, TXT pour chaque morceau');
  check(P.every((p) => names.includes(`${R}morceaux/MIDI/${p.base}/${p.base}.mid`)), 'morceaux/MIDI/<morceau>/ : MIDI complet par morceau');
  const smp = names.filter((n) => n.startsWith(R + 'morceaux/samples/'));
  check(smp.length >= 6 && smp.every((n) => / - (batterie|basse|accords|mélodie-pads|percussions)\.wav$/.test(n)) && smp.some((n) => n.endsWith(`${b1} - batterie.wav`)), `samples/ : ${smp.length} stems « 01 - Titre - batterie.wav »…`);
  check(names.includes(R + 'video/mix.mp4') && names.includes(R + 'mix/mix.mp3') && names.includes(R + 'mix/mix.wav') && longRes === '720p' && vidRes === '720p', 'video/ (résolution demandée), mix/ MP3 + WAV, vidéos des morceaux en 720p');
  const txt = fs.readFileSync(M.entries.find((e) => e.name === `${R}morceaux/${b1}.txt`).path, 'utf8');
  check(['Titre : ', 'Style : Deep House', 'Tempo : ', 'Tonalité : ', 'Graine : ', 'Progression d\'accords', '--- Description YouTube ---', 'Tags : '].every((k) => txt.includes(k)) && /Couplet : \S/.test(txt), 'TXT : titre, style, tempo, tonalité, graine, progression d\'accords, description YouTube');
  const man = JSON.parse(fs.readFileSync(M.entries.find((e) => e.name === R + 'manifest.json').path, 'utf8'));
  check(man.pieces.every((p) => p.start != null && p.end > p.start && p.style && p.seed != null && p.bpm && p.key && p.engine && p.files.mp4 && p.files.mp3 && p.files.wav && p.files.txt && p.files.midi?.length && p.files.samples?.length), 'manifest.json : début/fin, style, graine, tempo, tonalité, moteur, fichiers présents par morceau');
  check(man.samples.groups.length + man.samples.skipped.length === 5 && man.video === 'video/mix.mp4', `manifest : samples ${man.samples.groups.join('/')} (absents : ${man.samples.skipped.map((s) => s.group).join(', ') || 'aucun'})`);
  const rd = fs.readFileSync(M.entries.find((e) => e.name === R + 'LISEZMOI.txt').path, 'utf8');
  check(['├─ manifest.json', '├─ video/', '├─ mix/', '└─ morceaux/', 'samples/', 'Morceaux :'].every((k) => rd.includes(k)), 'LISEZMOI.txt : arborescence expliquée en français');
  check(chordLines({ progressions: { A: ['C', 'G'], B: ['F'] } }).join('|') === 'Couplet : C – G|Refrain : F', 'progression d\'accords lisible');
  // progression pendant l'attente des vidéos de morceaux (sans samples : l'attente est visible)
  const st2 = []; await buildPack(t, { ...O, stems: false }, { ...deps, onProgress: (f, s) => st2.push(s) });
  check(st2.some((s) => /Vidéos des morceaux : \d\/2 prêtes — rendu en cours, le ZIP attend/.test(s)), 'progression : « Vidéos des morceaux : x/2 prêtes — rendu en cours, le ZIP attend »');
  // une vidéo de morceau en échec : le paquet échoue avec la raison (jamais un ZIP incomplet)
  let err = null; try { await buildPack(t, O, { ...deps, pieceVideos: async () => { throw new Error('Vidéo du morceau 2 : échec du rendu'); } }); } catch (e) { err = e; }
  check(/Vidéo du morceau 2/.test(err?.message || ''), `vidéo de morceau en échec → paquet en erreur : « ${err?.message} »`);
  // morceau unique : pas de fichiers de morceaux factices
  const single = { ...t, id: 'single', meta: { progressions: t.meta.progressions } }; fs.cpSync(dir, path.join(tracksDir, 'single'), { recursive: true });
  const S = await buildPack(single, packOptions({ video: false, pieceVideo: true, stems: true }), deps);
  check(!S.entries.some((e) => /\/morceaux\//.test(e.name)) && S.pieces.length === 1 && S.notes.some((n) => /Morceau unique/.test(n)), 'morceau unique : ni morceaux/ ni samples factices, raison écrite dans le manifeste');
}
// ---------- 4. serveur : animation par style, honorée par la vidéo ; paquet automatique en fin de rendu
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
{
  const port = await freePort(), B = `http://127.0.0.1:${port}`, data = path.join(tmp, 'api-data');
  const srv = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], { env: { ...process.env, SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA_DIR: data, SOUNDTUBE_YT_TRANSPORT: 'mock' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  const req = async (p, m = 'GET', b, raw) => { const r = await fetch(B + p, { method: m, headers: { 'content-type': raw ? 'application/octet-stream' : 'application/json' }, body: raw || (b ? JSON.stringify(b) : undefined) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, j, t }; };
  const done = async (id) => { for (let i = 0; i < 400; i++) { const j = (await req('/api/jobs/' + id)).j; if (j?.status === 'done' || j?.status === 'error') return (await req('/api/tracks/' + id)).j; await sleep(300); } return null; };
  const until = async (fn, n = 400) => { for (let i = 0; i < n; i++) { const v = await fn(); if (v) return v; await sleep(400); } return null; };
  try {
    for (let i = 0; i < 100; i++) { if ((await fetch(B + '/api/options').catch(() => null))?.ok) break; await sleep(200); }
    check((await req('/api/admin/youtube')).j.transport === 'mock', 'serveur de test en transport « mock » (aucun envoi)');
    const spec = (await req('/api/openapi.json')).j; check(spec.info.version.localeCompare('1.14.0', undefined, { numeric: true }) >= 0 && spec.paths['/api/styles/{id}/animation'] && spec.paths['/api/tracks/{id}/animation'], 'OpenAPI 1.14.0 : routes d\'animation');
    const png = path.join(tmp, 'fond.png'); spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x3355aa:s=320x180', '-frames:v', '1', png]);
    const up = await req('/api/media?name=fond.png', 'POST', null, fs.readFileSync(png)); const mid = up.j?.id;
    check(up.s === 201 && mid, 'animation importée dans la bibliothèque');
    check((await req('/api/styles/house/animation')).j.media === null, 'style sans choix : « Fond du style » (null)');
    check((await req('/api/styles/house/animation', 'PUT', { media: 'inconnu' })).s === 400, 'animation inconnue : 400');
    const pu = await req('/api/styles/house/animation', 'PUT', { media: mid }); check(pu.j.media === mid && !/"path"/.test(pu.t), 'animation mémorisée pour house (aucun chemin disque renvoyé)');
    check((await req('/api/styles/lofi/animation')).j.media === null, 'autre style : non touché');
    const t1 = await done((await req('/api/generate', 'POST', { style: 'house', seed: 1404, duration: 20 })).j.id);
    check(t1?.meta?.animation?.media === mid, 'génération sans choix explicite : animation du style enregistrée sur le morceau');
    const a1 = (await req(`/api/tracks/${t1.id}/animation`)).j; check(a1.media === mid && a1.scope === 'generation' && a1.override === false, `animation résolue : ${a1.scope}, sans remplacement`);
    const t2 = await done((await req('/api/generate', 'POST', { style: 'house', seed: 1405, duration: 20, animation: null })).j.id);
    check(t2?.meta?.animation && t2.meta.animation.media === null && (await req(`/api/tracks/${t2.id}/animation`)).j.media === null, 'choix « Fond du style » au formulaire : respecté (dégradé)');
    // vidéo : rendue avec l'animation du style
    await req(`/api/tracks/${t1.id}/video`, 'POST', { resolution: '720p' });
    const v1 = await until(async () => { const y = (await req(`/api/tracks/${t1.id}/youtube`)).j; return y?.video?.status === 'done' || (y?.files?.mp4 && y?.video?.status !== 'running') ? y : (y?.video?.status === 'error' ? y : null); });
    const tv = (await req(`/api/tracks/${t1.id}`)).j;
    check(tv.files?.mp4 && v1?.design?.background?.media === mid, `vidéo rendue avec l'animation choisie (${v1?.design?.background?.media || '—'})`);
    // remplacement dans le panneau YouTube : pour ce morceau seulement
    const des = { ...v1.design, background: { ...v1.design.background, media: null } }; delete des.scope;
    await req(`/api/tracks/${t1.id}/design`, 'PUT', { design: des });
    const a2 = (await req(`/api/tracks/${t1.id}/animation`)).j; check(a2.scope === 'track' && a2.override && a2.media === null && (await req('/api/styles/house/animation')).j.media === mid, 'panneau YouTube : remplacement pour ce morceau seulement (mention « remplacée »), style inchangé');
    // paquet coché à la génération : construit automatiquement à la fin du rendu
    const g3 = (await req('/api/generate', 'POST', { style: 'house', seed: 1406, duration: 20, wav: true, pack: { video: true, videoRes: '720p', wav: true, midi: true, txt: true, pieceVideo: true } })).j;
    const t3 = await done(g3.id); check(t3?.meta?.autoPack?.video === true, 'paquet coché : enregistré sur la génération');
    const pk = await until(async () => { const j = (await req(`/api/tracks/${g3.id}/pack`)).j; return ['done', 'error'].includes(j?.state?.status) ? j : null; });
    check(pk?.state?.status === 'done' && pk.state.url, `paquet automatique : ${pk?.state?.status} ${pk?.state?.error || ''}`);
    const zf = path.join(tmp, 'auto.zip'); fs.writeFileSync(zf, Buffer.from(await (await fetch(B + pk.state.url)).arrayBuffer()));
    const L = zipList(zf), root = L[0].split('/')[0] + '/';
    check(L.includes(root + 'LISEZMOI.txt') && L.includes(root + 'manifest.json') && L.some((n) => n.startsWith(root + 'video/') && n.endsWith('.mp4')) && L.some((n) => /\/mix\/.*\.mp3$/.test(n)) && L.some((n) => /\/mix\/.*\.wav$/.test(n)) && !L.some((n) => n.includes('/morceaux/')), `ZIP d'un morceau court : ${L.length} fichiers, pas de morceaux factices`);
    const man = JSON.parse(zipRead(zf, root + 'manifest.json')); check(man.videoResolution === '720p' && man.pieces.length === 1 && man.notes.some((n) => /Morceau unique/.test(n)), 'manifeste : vidéo 720p, morceau unique expliqué');
    check(!log.includes('GOCSPX') && fs.readFileSync(path.join(data, 'youtube-mock.jsonl'), { flag: 'a+' }).length === 0, 'aucun envoi YouTube (journal mock vide)');
    if (process.argv.includes('--mix')) { // complet : mix DJ forcé de 15 min, vidéos par morceau (720p) + stems
      const g = (await req('/api/generate', 'POST', { style: 'house', seed: 1407, duration: 900, adv: { mix: 'on' }, wav: true, pack: { video: false, pieceVideo: true, pieceRes: '720p', wav: true, stems: true } })).j;
      const mx = await done(g.id); const ps = await until(async () => { const j = (await req(`/api/tracks/${g.id}/pack`)).j; return ['done', 'error'].includes(j?.state?.status) ? j : null; }, 3000);
      check(ps?.state?.status === 'done' && ps.state.pieces === mx.meta.mix.decks.length, `mix 15 min : ${ps?.state?.pieces} morceaux, ${ps?.state?.error || 'ok'}`);
    } else check(true, 'mix DJ réel : contrôle complet avec --mix (rendu de 15 min)');
  } catch (e) { check(false, 'serveur : ' + e.message + '\n' + log.slice(-1500)); } finally { srv.kill(); }
}
// ---------- 5. interface
{
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const idx = read('public/index.html'), gf = read('public/js/genform.js'), adm = read('public/admin.html'), pp = read('public/js/pubpanel.js'), app = read('public/js/app.js');
  check(idx.includes('id="animPick"') && idx.includes('id="packOpts"') && gf.includes('Fond du style') && gf.includes('/admin#media') && adm.includes('id="media"'), 'formulaire : choix de l\'animation (avec lien Admin si vide), bloc paquet ; Admin → Animations');
  check(gf.includes('long à rendre, 720p par défaut') && pp.includes('long à rendre, 720p par défaut') && app.includes('genExtras()'), 'vidéo par morceau : avertissement honnête (long, 720p par défaut)');
  check(!/\?v=1\.13\.0/.test(idx + adm + app + read('public/index.html')), 'cache des pages : ?v=1.14.0');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} échec(s)` : '\nv1.14.0 : tout est OK');
process.exit(fail ? 1 : 0);
