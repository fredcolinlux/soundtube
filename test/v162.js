// Tests v1.6.2 : mise en page, titres FR/EN, textes YouTube EN, animations de fond (API), découpage des générations longues, vidéos par morceau, chapitres.
// node test/v162.js   (--no-api : sans serveur ni rendu ffmpeg)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v162-'));
process.env.SOUNDTUBE_DATA_DIR = path.join(tmp, 'unit-data'); // réglages isolés pour les imports ci-dessous
const L = await import('../public/js/layout.js');
const { makeTitles, translateTitle, titleEnOf } = await import('../src/titles.js');
const { youtubeInfo, textData, chaptersOf } = await import('../src/youtube.js');
const S = await import('../src/split.js');
const { splitOptions } = await import('../src/splitqueue.js');

let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const throws = (fn, status) => { try { fn(); return false; } catch (e) { return status == null || e.status === status; } };
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

// ---------- mise en page
{
  const d = L.normalizeDesign({ layout: { thumb: { title: { x: 5, y: -1, size: 9, align: 'nope', color: 'zz' } } }, background: { fit: 'bad', dim: 3 } });
  const ti = d.layout.thumb.title;
  check(ti.x <= 1 && ti.x >= 0 && ti.y >= 0 && ti.y <= 1, `positions bornées à 0–1 (x=${ti.x}, y=${ti.y})`);
  check(L.ALIGNS.includes(ti.align) && ti.color === null && ti.size < 1, 'alignement / couleur / taille invalides => valeurs sûres');
  check(d.background.fit === 'cover' && d.background.dim <= 0.8, 'fond : ajustement et voile bornés');
  check(JSON.stringify(L.normalizeDesign(d)) === JSON.stringify(d), 'normalizeDesign idempotent');
  const def = L.defaultDesign();
  check(!!def.layout.thumb && !!def.layout.video && JSON.stringify(def.layout.thumb) !== JSON.stringify(def.layout.video), 'mises en page distinctes miniature / vidéo');
  const data = { title: 'Lagune suspendue', brand: 'Ma chaîne', chip: 'LOFI', sub: '1 h', chapter: 'Partie 2' };
  const items = L.computeItems(def.layout.video, 'video', data, { W: 1280, H: 720 }).texts;
  const txt = items.filter((i) => i.text).map((i) => i.text).join(' | ');
  check(/Lagune/.test(txt) && /Ma chaîne/.test(txt) && !/BPM/i.test(txt), `éléments de texte vidéo : ${txt}`);
  const big = L.computeItems(def.layout.video, 'video', data, { W: 3840, H: 2160 }).texts, t1 = items.find((i) => i.id === 'title'), t4 = big.find((i) => i.id === 'title');
  check(t1 && t4 && Math.abs(t4.size / t1.size - 3) < 0.05 && Math.abs(t4.x / t1.x - 3) < 0.05, 'positions relatives : 4K = 3 × 720p');
  const hidden = L.normalizeDesign({ layout: { video: { brand: { visible: false } } } });
  check(!L.computeItems(hidden.layout.video, 'video', data).texts.some((i) => i.id === 'brand' && i.text), 'élément masqué non dessiné');
}

// ---------- titres FR/EN
{
  const a = makeTitles(42, 0, 'lofi'), b = makeTitles(42, 0, 'lofi');
  check(a.fr && a.en && a.fr !== a.en && JSON.stringify(a) === JSON.stringify(b), `titres déterministes FR « ${a.fr} » / EN « ${a.en} »`);
  check(translateTitle('Lagune suspendue') === 'Suspended Lagoon', `traduction d'un titre FR : ${translateTitle('Lagune suspendue')}`);
  check(titleEnOf({ title: 'X', meta: { titleEn: 'Manual EN' } }) === 'Manual EN', 'meta.titleEn prioritaire');
  check(typeof titleEnOf({ title: 'Lagune suspendue', meta: {} }) === 'string', 'titre EN calculé pour les anciens morceaux');
}

// ---------- textes YouTube EN
const fakeTrack = (over = {}) => ({ id: 'abc', title: 'Lagune suspendue', style: 'lofi', status: 'done', duration: 3700, bpm: 80, key: 'C', created_at: new Date().toISOString(),
  params: { style: 'lofi', seed: 1, bpm: 80, key: 'C', scale: 'minor', duration: 3700 }, files: { wav: 'x.wav' }, meta: { titleEn: 'Suspended Lagoon', chapters: [{ startSec: 0, name: 'Intro' }, { startSec: 1200, name: 'Thème' }, { startSec: 2400, name: 'Fin' }] }, ...over });
{
  const t = fakeTrack(), fr = youtubeInfo(t, 'soundtube', 'fr'), en = youtubeInfo(t, 'soundtube', 'en');
  check(en.lang === 'en' && /Suspended Lagoon/.test(en.title) && /Original instrumental/i.test(en.description), `titre / description EN : ${en.title}`);
  check((fr.lang || 'fr') === 'fr' && /Lagune suspendue/.test(fr.title), `titre FR inchangé : ${fr.title}`);
  check(Array.isArray(en.tags) && en.tags.length > 3 && en.tags.join(',').length <= 500, `tags EN (${en.tags.length})`);
  check(textData(t, 'b', 'en').title === 'Suspended Lagoon' && textData(t, 'b', 'fr').title === 'Lagune suspendue', 'texte dessiné selon la langue');
}

// ---------- découpage : plan, options
const mixTrack = () => {
  const decks = [0, 1, 2, 3].map((i) => ({ name: ['Particule silencieuse', 'Lagune suspendue', 'Givre nocturne', 'Pulsar nocturne'][i], seed: 100 + i,
    deckStart: i ? i * 480 - 30 : 0, deckEnd: i < 3 ? (i + 1) * 480 + 30 : 1950, start: i ? i * 480 : 0 }));
  return fakeTrack({ duration: 1950, style: 'house', meta: { titleEn: 'Golden Constellation', mix: { decks } } });
};
{
  const t = mixTrack();
  check(S.splitAvailability(t).ok && S.splitAvailability(t).kind === 'mix', 'mix > 30 min découpable');
  check(!S.splitAvailability({ ...t, duration: 1700 }).ok, 'refusé sous 30 min');
  check(S.splitAvailability(fakeTrack()).kind === 'chapters', 'long morceau simple : découpe aux chapitres');
  const mid = S.splitPlan(t, 'mid'), full = S.splitPlan(t, 'full'), clean = S.splitPlan(t, 'clean');
  check(mid.length === 4 && mid.every((p, i) => !i || p.start === mid[i - 1].end) && mid[0].start === 0 && mid[3].end === 1950, 'mode mid : morceaux contigus, du début à la fin');
  check(full[1].start === 450 && full[1].end === 990 && full[1].fadeIn === 0.015, 'mode full : transitions entières');
  check(clean[1].start === 510 && clean[1].end === 930 && clean[1].fadeIn === 0.25 && clean[0].fadeIn === 0 && clean[3].fadeOut === 0, 'mode clean : sans voisin, fondu 0,25 s, pas de fondu aux bords du fichier');
  check(mid.every((p) => p.title && p.title_en && p.title !== p.title_en), `titres FR/EN par morceau : ${mid.map((p) => p.title_en).join(', ')}`);
  check(throws(() => S.splitPlan(t, 'xx'), 400), 'mode inconnu => 400');
  check(S.pieceBase(3, 12, 'A/B: c?') === '03 - A B c' || /^03 - /.test(S.pieceBase(3, 12, 'A/B: c?')), `nom de fichier sûr : « ${S.pieceBase(3, 12, 'A/B: c?')} »`);
  check(S.pieceBase(7, 120, 'X').startsWith('007 - '), 'numérotation sur 3 chiffres au-delà de 99 morceaux');
  const o = splitOptions({ mode: 'clean', lang: 'en', formats: { midi: false }, library: 1 }, { hasFfmpeg: false });
  check(o.mode === 'clean' && o.lang === 'en' && o.formats.mp3 === false && o.formats.midi === false && o.formats.wav && o.library === true, 'options : validées (MP3 désactivé sans ffmpeg)');
  check(throws(() => splitOptions({ formats: { wav: false, mp3: false, midi: false } }), 400) && throws(() => splitOptions({ mode: 'x' }), 400), 'options invalides => 400');
  // vidéos par morceau
  const ov = splitOptions({ mode: 'mid', video: { resolution: '720p' } }, { hasFfmpeg: true });
  check(ov.video === '720p' && ov.library === true, 'option vidéo par morceau : résolution validée, ajout à la bibliothèque forcé');
  check(splitOptions({ video: true }, { hasFfmpeg: true }).video === '1080p' && splitOptions({}, { hasFfmpeg: true }).video === null, 'option vidéo : 1080p par défaut, absente sinon');
  check(throws(() => splitOptions({ video: { resolution: '480p' } }, { hasFfmpeg: true }), 400) && throws(() => splitOptions({ video: '720p' }, { hasFfmpeg: false }), 501), 'option vidéo : résolution inconnue => 400, sans ffmpeg => 501');
  // chapitres de la vidéo complète = coupes du mode mid, mêmes titres FR/EN
  const chFr = chaptersOf(t, 'fr'), chEn = chaptersOf(t, 'en');
  check(chFr.length === mid.length && chFr.every((c, i) => Math.abs(c.start - mid[i].start) < 1e-6), `chapitres YouTube du mix = points de coupe « mid » (${chFr.map((c) => c.time).join(', ')})`);
  check(chFr.every((c, i) => c.label.startsWith(mid[i].title)) && chEn.every((c, i) => c.label.startsWith(mid[i].title_en)), 'chapitres et morceaux : mêmes titres FR et EN');
  // description d'un morceau extrait
  const piece = fakeTrack({ title: mid[1].title, duration: mid[1].duration, meta: { titleEn: mid[1].title_en, splitFrom: { id: 'p', title: 'Constellation dorée', titleEn: 'Golden Constellation', n: 2, of: 4, mode: 'mid', start: mid[1].start, end: mid[1].end } } });
  const dFr = youtubeInfo(piece, 'b', 'fr').description, dEn = youtubeInfo(piece, 'b', 'en').description;
  check(/Extrait du mix « Constellation dorée » : morceau 2\/4 \(8:00 – 16:00/.test(dFr) && /From the mix “Golden Constellation”: track 2\/4/.test(dEn), 'description FR/EN d\'un morceau : « extrait du mix … morceau n/N »');
}

// ---------- découpage : WAV synthétique de 31 min (mono 8 kHz, en flux), précision à l'échantillon, fondus, ZIP
{
  const sr = 8000, dur = 1860, frames = sr * dur, dir = path.join(tmp, 'trk'); fs.mkdirSync(dir, { recursive: true });
  const wav = path.join(dir, 'src.wav'), fd = fs.openSync(wav, 'w'); fs.writeSync(fd, S.wavHeader(frames, { sr, ch: 1 }));
  const blk = Buffer.alloc(sr * 2 * 60);
  for (let m = 0; m < dur / 60; m++) { for (let i = 0; i < sr * 60; i++) blk.writeInt16LE(Math.round(12000 * Math.sin(2 * Math.PI * 220 * (m * sr * 60 + i) / sr)) || 7, 2 * i); fs.writeSync(fd, blk); }
  fs.closeSync(fd);
  const t = fakeTrack({ duration: dur, files: { wav: 'src.wav' }, meta: { titleEn: 'Suspended Lagoon', chapters: [{ startSec: 0 }, { startSec: 600.0001 }, { startSec: 1234.5678 }] } });
  const out = path.join(tmp, 'split'), t0 = Date.now(), rss0 = process.memoryUsage().rss;
  const M = await S.splitTrack(t, dir, out, { mode: 'mid', lang: 'en', formats: { wav: true, mp3: false, midi: false } });
  const ms = Date.now() - t0, drss = (process.memoryUsage().rss - rss0) / 1048576;
  check(M.pieces.length === 3 && fs.existsSync(path.join(out, '01 - Suspended Lagoon — Part 1.wav')), `3 morceaux EN en ${ms} ms (mémoire +${drss.toFixed(0)} Mo) : ${M.pieces.map((p) => p.base).join(' / ')}`);
  const src = fs.readFileSync(wav), sH = S.readWavHeader(fs.openSync(wav, 'r'), src.length);
  let off = 0, exact = true, fadeOk = true, total = 0;
  for (const p of M.pieces) {
    const f = path.join(out, p.files.wav.name), b = fs.readFileSync(f), H = S.readWavHeader(fs.openSync(f, 'r'), b.length), n = H.dataBytes / 2;
    const A = new Int16Array(b.buffer.slice(b.byteOffset + H.dataOffset, b.byteOffset + H.dataOffset + n * 2)), B = new Int16Array(src.buffer.slice(src.byteOffset + sH.dataOffset + off * 2, src.byteOffset + sH.dataOffset + (off + n) * 2));
    const fz = Math.round(0.015 * sr);
    for (let i = 0; i < n; i++) {
      const inFade = (p.n > 1 && i < fz) || (p.n < M.pieces.length && i >= n - fz);
      if (!inFade && A[i] !== B[i]) { exact = false; break; }
      if (inFade && Math.abs(A[i]) > Math.abs(B[i]) + 1) fadeOk = false;
    }
    if (p.n > 1 && Math.abs(A[0]) > 0.15 * 12000) fadeOk = false; // début quasi silencieux : pas de clic
    if (p.n < M.pieces.length && Math.abs(A[n - 1]) > 0.15 * 12000) fadeOk = false;
    check(p.files.wav.crc === (zlib.crc32 ? zlib.crc32(b) : p.files.wav.crc) && p.files.wav.size === b.length, `${p.base} : CRC32 et taille du manifeste`);
    off += n; total += n;
  }
  check(exact, 'coupes exactes à l\'échantillon (hors fondus de 15 ms)');
  check(fadeOk, 'fondus courts aux points de coupe (pas de clic)');
  check(total === frames, `mode mid : la concaténation redonne toutes les trames (${total}/${frames})`);
  check(M.pieces[1].startFrame === 600 * sr && M.pieces[2].startFrame === Math.round(1234.568 * sr), 'points de coupe à l\'échantillon près (plan à la milliseconde)');
  // ZIP en flux : taille annoncée exacte, archive valide
  const E = S.zipEntries(out, M), Z = S.zipStream(E), zf = path.join(tmp, 'a.zip');
  await Z.pipe(fs.createWriteStream(zf)); await new Promise((r) => setTimeout(r, 200));
  const zb = fs.readFileSync(zf);
  check(zb.length === Z.size, `ZIP : Content-Length exact (${Z.size} o)`);
  const eocd = zb.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  check(eocd > 0 && zb.readUInt16LE(eocd + 10) === E.length, `ZIP : répertoire central (${E.length} entrées, dont la liste des morceaux)`);
  const ut = spawnSync('unzip', ['-tq', zf], { encoding: 'utf8' });
  if (!ut.error) check(ut.status === 0, 'ZIP : unzip -t sans erreur');
  // ZIP64 : au-delà de 4 Go, en-têtes ZIP64 (taille calculée sans lire les fichiers)
  // entrées en mémoire (textes du ZIP des vidéos)
  const txt = Buffer.from('Titre : Lagune suspendue\nTitle: Suspended Lagoon\n'), zt = path.join(tmp, 't.zip');
  const ZT = S.zipStream([{ name: '01 - Lagune suspendue - YouTube.txt', data: txt, size: txt.length, crc: S.crc32(txt) }, E[0]]);
  await ZT.pipe(fs.createWriteStream(zt)); await new Promise((r) => setTimeout(r, 200));
  const ut2 = spawnSync('unzip', ['-tq', zt], { encoding: 'utf8' });
  check(fs.statSync(zt).size === ZT.size && (ut2.error || ut2.status === 0), 'ZIP : entrées texte en mémoire + fichiers, archive valide');
  const big = S.zipStream([{ name: 'a.wav', path: '/dev/null', size: 5e9, crc: 0 }, { name: 'b.wav', path: '/dev/null', size: 1e3, crc: 0 }]);
  check(big.size > 5e9 + 20 + 76 + 56, `ZIP64 : taille ${big.size} avec enregistrements ZIP64`);
}

// ---------- API (serveur temporaire) : animations de fond, mise en page, langue, rendu 720p, découpage
if (!process.argv.includes('--no-api') && hasFfmpeg) {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const data = path.join(tmp, 'api-data'), B = `http://127.0.0.1:${port}`;
  const srv = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], { env: { ...process.env, SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA_DIR: data, SOUNDTUBE_MEDIA_MAX_MB: '2' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  const api = async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', ...(o.headers || {}) } }); const j = await r.json().catch(() => null); return { s: r.status, j }; };
  const wait = async (fn, ms = 180000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('délai dépassé'); await new Promise((r) => setTimeout(r, 500)); } };
  try {
    await wait(async () => (await fetch(B + '/api/health').catch(() => null))?.ok || (await fetch(B + '/api/styles').catch(() => null))?.ok, 20000);
    const g = await api('/api/generate', { method: 'POST', body: JSON.stringify({ style: 'lofi', seed: 777, duration: 25 }) });
    check(g.s === 202, 'génération courte lancée');
    const t = await wait(async () => { const r = await api('/api/jobs/' + g.j.id); return r.j?.status === 'done' && r.j; });
    check(!!t.title_en || !!t.meta?.titleEn, `titre EN à la génération : « ${t.title} » / « ${t.title_en || t.meta?.titleEn} »`);
    const sp = await api('/api/generate', { method: 'POST', body: JSON.stringify({ style: 'lofi', duration: 600, split: true }) });
    check(sp.s === 400, 'option « découper » refusée pour ≤ 30 min');
    const s0 = await api(`/api/tracks/${t.id}/split`);
    check(s0.s === 200 && s0.j.available === false, 'découpage indisponible pour un morceau court');
    check((await api(`/api/tracks/${t.id}/split`, { method: 'POST', body: '{}' })).s === 409, 'POST découpage refusé (409) pour un morceau court');
    // animations : validation
    const up = (body, name) => fetch(`${B}/api/media?name=${encodeURIComponent(name)}`, { method: 'POST', body, headers: { 'content-type': 'application/octet-stream' } }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) }));
    check((await up(Buffer.from('ceci n\'est pas une vidéo'), 'faux.mp4')).s === 415, 'fichier non vidéo refusé (415, vérifié par ffprobe)');
    check((await up(Buffer.alloc(3 * 1048576, 1), 'gros.mp4')).s === 413, 'taille max (SOUNDTUBE_MEDIA_MAX_MB) => 413');
    const mk = (args, f) => { const p = path.join(tmp, f); spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args, p]); return fs.readFileSync(p); };
    const mp4 = mk(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=2', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast'], 'loop.mp4');
    const gif = mk(['-f', 'lavfi', '-i', 'testsrc=size=200x200:rate=10:duration=1'], 'anim.gif');
    const png = mk(['-f', 'lavfi', '-i', 'color=c=0x334455:size=320x240', '-frames:v', '1'], 'still.png');
    const m1 = await up(mp4, 'boucle.mp4'), m2 = await up(gif, 'anim.gif'), m3 = await up(png, 'fond.png');
    check(m1.s === 201 && m1.j.kind === 'video' && m2.s === 201 && m3.s === 201 && m3.j.kind === 'image', `MP4 / GIF / PNG importés (${m1.j?.kind}, ${m2.j?.kind}, ${m3.j?.kind})`);
    check((await api('/api/media')).j.items.length === 3, 'bibliothèque d\'animations : 3 éléments');
    // réglage par morceau : GIF + mise en page perso ; global : MP4
    const lay = { layout: { video: { title: { x: 0.5, y: 0.45, align: 'center', size: 0.09 }, brand: { visible: false } }, thumb: { title: { x: 0.1, y: 0.6 } } } };
    check((await api('/api/youtube/design', { method: 'PUT', body: JSON.stringify({ design: { background: { media: m1.j.id, fit: 'contain' } } }) })).j.design.background.media === m1.j.id, 'fond global (MP4, ajuster)');
    const pd = await api(`/api/tracks/${t.id}/design`, { method: 'PUT', body: JSON.stringify({ design: { ...lay, background: { media: m2.j.id, fit: 'cover', overlay: true } } }) });
    check(pd.j.design.background.media === m2.j.id && pd.j.design.layout.video.title.align === 'center', 'réglage propre au morceau (GIF + mise en page)');
    check((await api('/api/youtube/lang', { method: 'PUT', body: JSON.stringify({ lang: 'en' }) })).j.lang === 'en', 'langue YouTube : en');
    const y = await api(`/api/tracks/${t.id}/youtube`);
    check(y.j.lang === 'en' && y.j.langs?.en?.title && y.j.langs?.fr?.title && y.j.title === y.j.langs.en.title, `infos YouTube EN : ${y.j.title}`);
    const th = await api(`/api/tracks/${t.id}/thumbnail`, { method: 'POST', body: JSON.stringify({ resolution: '720p' }) });
    check(th.s === 200 && !!th.j.urls.thumb, 'miniature 720p (cadre du GIF + mise en page)');
    const v = await api(`/api/tracks/${t.id}/video`, { method: 'POST', body: JSON.stringify({ resolution: '720p' }) });
    check(v.s === 202, 'vidéo 720p lancée');
    const vd = await wait(async () => { const r = await api(`/api/tracks/${t.id}/youtube`); if (r.j?.job?.status === 'error') throw new Error(r.j.job.error); return r.j?.urls?.video && r.j; }, 240000);
    const vf = path.join(tmp, 'v.mp4'); fs.writeFileSync(vf, Buffer.from(await (await fetch(B + vd.urls.video)).arrayBuffer()));
    const pr = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', vf], { encoding: 'utf8' });
    const P = JSON.parse(pr.stdout || '{}'), vs = P.streams?.find((s) => s.codec_type === 'video');
    check(vs?.width === 1280 && vs?.height === 720 && Math.abs(+P.format.duration - t.duration) < 1.5, `vidéo 1280×720, ${(+P.format?.duration || 0).toFixed(1)} s (GIF en boucle sur ${t.duration.toFixed(1)} s)`);
    // une vidéo par morceau : parent (réglage propre GIF + mise en page) dont la bibliothèque contient 2 morceaux
    const g2 = await api('/api/generate', { method: 'POST', body: JSON.stringify({ style: 'ambient', seed: 778, duration: 20 }) });
    const g3 = await api('/api/generate', { method: 'POST', body: JSON.stringify({ style: 'lofi', seed: 779, duration: 20 }) });
    const t2 = await wait(async () => { const r = await api('/api/jobs/' + g2.j.id); return r.j?.status === 'done' && r.j; });
    const par = await wait(async () => { const r = await api('/api/jobs/' + g3.j.id); return r.j?.status === 'done' && r.j; });
    check((await api(`/api/tracks/${par.id}/split/videos`, { method: 'POST', body: JSON.stringify({ resolution: '720p' }) })).s === 409, 'vidéos des morceaux : 409 sans morceaux dans la bibliothèque');
    await api(`/api/tracks/${par.id}/design`, { method: 'PUT', body: JSON.stringify({ design: { layout: { video: { title: { x: 0.5, y: 0.7, align: 'center', color: '#ffe08a' } } }, background: { media: m2.j.id, fit: 'cover' } } }) });
    const sd = path.join(data, 'tracks', par.id, 'split'); fs.mkdirSync(sd, { recursive: true });
    fs.writeFileSync(path.join(sd, 'manifest.json'), JSON.stringify({ mode: 'mid', lang: 'fr', formats: { wav: true }, pieces: [], library: [t.id, t2.id] }));
    check((await api(`/api/tracks/${par.id}/split/videos`, { method: 'POST', body: JSON.stringify({ resolution: '480p' }) })).s === 400, 'vidéos des morceaux : résolution inconnue => 400');
    const pv = await api(`/api/tracks/${par.id}/split/videos`, { method: 'POST', body: JSON.stringify({ resolution: '720p', lang: 'en' }) });
    check(pv.s === 202 && pv.j.total === 2 && pv.j.running && pv.j.request?.resolution === '720p', `vidéos des morceaux en file (${pv.j?.items?.map((x) => x.status).join(', ')})`);
    const ss = await api(`/api/tracks/${par.id}/split`);
    check(ss.j.videos?.total === 2, 'GET découpage : progression des vidéos par morceau incluse');
    const VV = await wait(async () => { const r = await api(`/api/tracks/${par.id}/split/videos`); if (r.j.items.some((x) => x.status === 'error')) throw new Error('rendu en erreur'); return !r.j.running && r.j.ready === 2 && r.j; }, 300000);
    check(VV.items.every((x) => x.video && x.thumb && x.lang === 'en' && x.resolution === '720p'), 'chaque morceau : MP4 720p EN + miniature téléchargeables');
    const y2 = await api(`/api/tracks/${t2.id}/youtube`);
    check(y2.j.design.background.media === m2.j.id && y2.j.design.layout.video.title.color === '#ffe08a', 'le morceau reprend l\'animation et la mise en page du mix');
    const zr = await fetch(`${B}/api/tracks/${par.id}/split/videos.zip?lang=en`), zbuf = Buffer.from(await zr.arrayBuffer()), zfile = path.join(tmp, 'v.zip'); fs.writeFileSync(zfile, zbuf);
    check(zr.status === 200 && +zr.headers.get('content-length') === zbuf.length, `ZIP des vidéos : Content-Length exact (${zbuf.length} o)`);
    const ul = spawnSync('unzip', ['-l', zfile], { encoding: 'utf8' }), names = ul.stdout || '';
    if (!ul.error) check(spawnSync('unzip', ['-tq', zfile]).status === 0 && (names.match(/\.mp4/g) || []).length === 2 && (names.match(/\.jpg/g) || []).length === 2 && (names.match(/YouTube\.txt/g) || []).length === 2, 'ZIP des vidéos : 2 MP4 + 2 miniatures + 2 textes FR/EN, archive valide');
    if (!ul.error) { const tx = spawnSync('unzip', ['-p', zfile, '*YouTube.txt'], { encoding: 'utf8' }).stdout; check(/=== Français ===/.test(tx) && /=== English ===/.test(tx) && /Tags/.test(tx), 'textes du ZIP : titre, description et tags en FR et EN'); }
    const del = await api(`/api/media/${m1.j.id}`, { method: 'DELETE' });
    check(del.s === 200 && del.j.items.length === 2 && (await api('/api/youtube/design')).j.design.background.media === null, 'suppression d\'une animation (le réglage global revient au dégradé)');
    await api('/api/youtube/lang', { method: 'PUT', body: JSON.stringify({ lang: 'fr' }) });
  } catch (e) { check(false, 'API : ' + e.message + '\n' + log.slice(-1500)); }
  finally { srv.kill(); }
} else console.log('—    tests API ignorés' + (hasFfmpeg ? '' : ' (ffmpeg absent)'));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} échec(s)` : '\nTests v1.6.2 : tout est OK');
process.exit(fail ? 1 : 0);
