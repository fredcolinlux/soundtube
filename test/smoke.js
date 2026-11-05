// Test rapide du moteur (rendu en flux) : un court morceau par style + MIDI, déterminisme, réglages réutilisables, échantillons.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { renderTrack } from '../src/engine/render.js';
import { resolveParams } from '../src/engine/composer.js';
import { STYLES } from '../src/engine/styles.js';
import { samplesAvailable, playSampled } from '../src/engine/sampler.js';
import { slugify, stamp, fileNames, syncFiles } from '../src/naming.js';

const require = createRequire(import.meta.url);
const { Midi } = require('@tonejs/midi');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-test-'));
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex').slice(0, 12);

check(samplesAvailable(), `banque d'échantillons CC0 présente (${samplesAvailable() ? 'oui' : 'non : repli sur la synthèse'})`);

for (const style of Object.keys(STYLES)) {
  const midPath = path.join(tmp, style + '.mid');
  const r = await renderTrack({ style, seed: 1234, duration: 25 }, { memory: true, midPath });
  const pcm = r.pcm; const n = pcm.length / 2; let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(pcm.readInt16LE(2 * i)) / 32768);
  const midi = new Midi(fs.readFileSync(midPath));
  const drums = midi.tracks.filter((t) => t.channel === 9 && t.notes.length);
  const ok = r.rms > 0.03 && peak <= 1 && r.seconds > 15 && midi.tracks.length >= 2 && (!r.params.instruments.drums || drums.length >= 1);
  check(ok, `${style.padEnd(10)} ${r.seconds.toFixed(1)} s rms=${r.rms.toFixed(3)} crête=${peak.toFixed(2)} ${r.renderMs} ms · MIDI ${midi.tracks.length} pistes (${drums.length} batterie canal 10)`);
}

// Déterminisme : même graine + mêmes réglages = PCM identique ; graine différente = autre morceau
const A = { style: 'lofi', seed: 4242, duration: 20, adv: { chordPatch: 'rhodes', bassPatch: 'uprightbass', swing: 30 } };
const r1 = await renderTrack(A, { memory: true }), r2 = await renderTrack(A, { memory: true });
const r3 = await renderTrack({ ...A, seed: 4243 }, { memory: true });
check(md5(r1.pcm) === md5(r2.pcm), `déterminisme (graine 4242) ${md5(r1.pcm)} = ${md5(r2.pcm)}`);
check(md5(r1.pcm) !== md5(r3.pcm), 'graine différente => morceau différent');

// Réglages réutilisables : les paramètres résolus redonnent les mêmes paramètres
const P = r1.params; const P2 = resolveParams(JSON.parse(JSON.stringify(P)));
check(JSON.stringify(P) === JSON.stringify(P2), 'réglages réutilisables (aller-retour JSON des paramètres)');
const bad = resolveParams({ style: 'lofi', adv: { leadPatch: 'inconnu', meter: '7/8', energy: 999 } }).adv;
check(bad.leadPatch === null && bad.meter === null && bad.energy === 100, 'valeurs avancées invalides ramenées à auto / bornées');

if (samplesAvailable()) {
  const s = playSampled('piano', 60, 0.5, 0.8, { rnd: Math.random });
  check(!!s && s.L.length > 1000, 'échantillonneur : note de piano');
}
// Noms de fichiers : titre nettoyé + style + date, renommage
check(slugify('Été à l’Œil — n°2 !') === 'ete-a-l-oeil-n-2', 'slug : accents et caractères spéciaux');
const nm = fileNames({ title: 'Rêverie boréale', style: 'house', created_at: '2026-10-28T20:08:00Z' });
check(nm.mp3 === 'reverie-boreale_house_2026-10-28_21h08.mp3' && nm.midzip.endsWith('-midi.zip'), 'nom de fichier : ' + nm.mp3);
{ const d = path.join(tmp, 'tr', 'x1'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'track.mp3'), 'a');
  const t = { id: 'x1', title: 'Ancien', style: 'lofi', created_at: '2026-01-01T10:00:00Z', files: { mp3: 'track.mp3' } };
  const f1 = syncFiles(path.join(tmp, 'tr'), t); const f2 = syncFiles(path.join(tmp, 'tr'), { ...t, files: f1, title: 'Nouveau titre' });
  check(f1?.mp3 === 'ancien_lofi_2026-01-01_11h00.mp3' && f2?.mp3 === 'nouveau-titre_lofi_2026-01-01_11h00.mp3' && fs.existsSync(path.join(d, f2.mp3)), 'migration track.mp3 puis renommage au changement de titre'); }
// Mastering YouTube (-14 LUFS / -1 dBTP) + balises WAV INFO, mesurés indépendamment
{ const { LoudnessMeter, TruePeakMeter } = await import('../src/engine/loudness.js');
  const { retagWav } = await import('../src/engine/tags.js');
  const wp = path.join(tmp, 'm.wav');
  const r = await renderTrack({ style: 'techno', seed: 99, duration: 25 }, { wavPath: wp, tags: { title: 'Essai é', artist: 'soundtube' } });
  const buf = fs.readFileSync(wp), off = buf.indexOf('data', 36) + 8, n = (buf.length - off) / 4, x = new Float32Array(2 * n);
  for (let i = 0; i < 2 * n; i++) x[i] = buf.readInt16LE(off + 2 * i) / 32768;
  const m = new LoudnessMeter(), tp = new TruePeakMeter(); m.push(x, n); tp.push(x, n);
  check(Math.abs(m.integrated() + 14) < 0.3 && tp.db <= -1, `loudness ${m.integrated().toFixed(2)} LUFS, crête ${tp.db.toFixed(2)} dBTP (rapport moteur ${r.loudness?.integrated} / ${r.loudness?.truePeak})`);
  check(buf.toString('ascii', 36, 40) === 'LIST' && buf.includes(Buffer.from('Essai é', 'utf8')), 'balises WAV LIST/INFO');
  retagWav(wp, { title: 'Renommé' }); check(fs.readFileSync(wp).includes(Buffer.from('Renommé')) && fs.statSync(wp).size === buf.length, 'réécriture des balises WAV sur place');
}
// Anti-doublon
{ const { signature, compare } = await import('../src/duplicates.js');
  const { resolveParams } = await import('../src/engine/composer.js');
  const a = resolveParams({ style: 'lofi', seed: 5, duration: 60 }), b = resolveParams({ style: 'lofi', seed: 5, duration: 60 }), c = resolveParams({ style: 'lofi', seed: 6, duration: 60 });
  check(compare(signature(a), signature(b))?.level === 'identique' && !compare(signature(a), signature(c)), 'anti-doublon : même graine détectée, graine différente libre'); }
const { execFileSync } = await import('node:child_process');
let ffmpegOk = false; try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); ffmpegOk = true; } catch {}
// Outils YouTube : titre / description / tags / chapitres (+ miniature si ffmpeg)
{ const { youtubeInfo, chaptersOf, makeThumbnail } = await import('../src/youtube.js');
  const P = { style: 'synthwave', seed: 1, bpm: 111, key: 'A', scale: 'minor', duration: 75 };
  const short = { id: 'y1', title: 'Éclipse magnétique', style: 'synthwave', duration: 75, params: P, waveform: Array.from({ length: 200 }, (_, i) => Math.abs(Math.sin(i / 9))),
    meta: { sections: [['Intro', 0], ['Couplet', 4], ['Couplet', 12], ['Refrain', 20], ['Outro', 29]].map(([label, startBar]) => ({ label, startBar })), loudness: { integrated: -14, truePeak: -6.2 } } };
  const ch = chaptersOf(short), y = youtubeInfo(short);
  check(ch.length === 3 && ch[0].start === 0 && ch[0].label === 'Intro / Couplet' && ch.every((c, i) => !i || c.start - ch[i - 1].start >= 10), 'chapitres (sections) : ' + ch.map((c) => c.time + ' ' + c.label).join(', '));
  const long = { ...short, duration: 14400, params: { ...P, duration: 14400 }, meta: { ...short.meta, chapters: Array.from({ length: 12 }, (_, i) => ({ startSec: i * 1200, profile: 'Calme (pads)' })) } };
  const yl = youtubeInfo(long);
  check(yl.chapters.length === 12 && yl.description.includes('3:40:00 Mouvement 12 — Calme') && yl.title.includes('(4 h)'), 'chapitres (mouvements) d\'un morceau de 4 h');
  check([y, yl].every((v) => v.title.length <= 100 && v.description.length <= 5000 && v.tags.join(', ').length <= 500 && /^0:00 /m.test(v.description)), 'limites YouTube : titre ≤ 100, description ≤ 5000, tags ≤ 500');
  if (ffmpegOk) { const jp = path.join(tmp, 'm.jpg'); await makeThumbnail(short, jp);
    const wh = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', jp]).toString().trim();
    check(wh === '1280,720', 'miniature 1280×720 (' + wh + ')'); } }
// Mode mix DJ (≥ 1 h) : sous-morceaux distincts, transitions, Camelot, tempo, chapitres, MIDI à carte de tempo
{ const { planMix, mixEnabled, deckPlan, TempoMap } = await import('../src/engine/mix.js');
  const { resolveParams } = await import('../src/engine/composer.js');
  const { MidiCollector } = await import('../src/engine/midi.js');
  const P = resolveParams({ style: 'techno', seed: 42, duration: 3600 });
  const A = planMix(P), B = planMix(resolveParams({ style: 'techno', seed: 42, duration: 3600 }));
  check(mixEnabled(P) && !mixEnabled(resolveParams({ style: 'techno', seed: 42, duration: 3600, adv: { mix: 'off' } })) && !mixEnabled(resolveParams({ style: 'lofi', seed: 1, duration: 600 })), 'mix : auto dès 1 h, désactivable, absent des morceaux courts');
  check(JSON.stringify(A.tracklist) === JSON.stringify(B.tracklist), 'mix : même graine = même tracklist');
  const tl = A.tracklist, end = A.tempo.sec(A.totalBeats);
  check(tl.length >= 7 && tl.length <= 16 && Math.abs(end - 3600) < 36 && new Set(tl.map((d) => d.seed)).size === tl.length && new Set(tl.map((d) => d.name)).size >= tl.length - 1, `mix 1 h : ${tl.length} titres distincts, ${end.toFixed(0)} s`);
  const okDur = tl.slice(0, -1).every((d) => d.deckEnd - d.deckStart >= 200 && d.deckEnd - d.deckStart <= 560);
  const cam = (c) => [parseInt(c), c.slice(-1)], camOk = tl.slice(1).every((d, i) => { const [n1, l1] = cam(tl[i].camelot), [n2, l2] = cam(d.camelot), dn = Math.min((n1 - n2 + 12) % 12, (n2 - n1 + 12) % 12); return (l1 === l2 && dn <= 2) || (l1 !== l2 && dn === 0); });
  check(okDur && camOk && tl.slice(0, -1).every((d) => [16, 24, 32].includes(d.transitionOut.bars)), 'mix : titres de 4 à 9 min, enchaînements Camelot compatibles, transitions de 16 à 32 mesures');
  const bp = tl.map((d) => d.bpm); check(Math.max(...bp) - Math.min(...bp) >= 2 && (() => { let j = 0; for (let b = 4; b < A.totalBeats; b += 4) j = Math.max(j, Math.abs(A.tempo.bpmAt(b) / A.tempo.bpmAt(b - 4) - 1)); return j < 0.005; })(), `mix : dérive de tempo progressive ${Math.min(...bp)}–${Math.max(...bp)} BPM, grille commune sans saut (v1.7.0 : le tempo glisse pendant les transitions)`);
  check(A.decks.every((d) => deckPlan(d).totalBars === d.bars), 'mix : longueur de chaque sous-morceau = plan');
  const tm = new TempoMap([[0, 120], [64, 128]], 128); check(Math.abs(tm.sec(64) - 480 * Math.log(128 / 120)) < 0.01 && Math.abs(tm.beatAt(tm.sample(30)) - 30) < 1e-6, 'carte de tempo : intégration et inverse');
  const mc = new MidiCollector({ bpm: 120, meter: '4/4', name: 'x', patches: {}, gmDrums: {}, tempos: [[0, 120], [32, 126]] });
  mc.add({ inst: 'bass', t: 0, d: 1, m: 40, v: 0.8 }); const f = mc.full ? mc.full() : null;
  check(!f || Buffer.from(f).includes(Buffer.from([0xff, 0x51, 0x03])), 'MIDI : carte de tempo écrite');
  const { chaptersOf, youtubeInfo } = await import('../src/youtube.js');
  const t = { id: 'm1', title: 'Set', style: 'techno', duration: 3600, params: P, meta: { mix: { decks: tl, count: tl.length, bpmMin: Math.min(...bp), bpmMax: Math.max(...bp) } } };
  const ch = chaptersOf(t), y = youtubeInfo(t);
  check(ch.length === tl.length && ch[0].start === 0 && ch[1].label.startsWith(tl[1].name) && ch[1].short === tl[1].name && y.description.includes(`${ch[1].time} ${tl[1].name}`) && y.description.includes('Mix DJ'), 'chapitres YouTube = tracklist du mix'); }
// v1.5 : hip-hop / drum & bass en mix DJ forcé (15 min), programmes MIDI des nouveaux sons, infos YouTube des variantes
{ const { planMix, mixEnabled } = await import('../src/engine/mix.js');
  const { resolveParams } = await import('../src/engine/composer.js');
  const { GM_PROGRAM } = await import('../src/engine/midi.js');
  const { PATCH_LABELS, BASS_PATCHES } = await import('../src/engine/flavor.js');
  const { youtubeInfo, chaptersOf } = await import('../src/youtube.js');
  for (const style of ['hiphop', 'dnb']) {
    const P = resolveParams({ style, seed: 1515, duration: 900, adv: { mix: 'on' } }); const A = planMix(P), tl = A.tracklist, end = A.tempo.sec(A.totalBeats);
    const bp = tl.map((d) => d.bpm);
    check(mixEnabled(P) && tl.length >= 2 && Math.abs(end - 900) < 20, `mix forcé 15 min ${style} : ${tl.length} titres (${tl.map((d) => d.sub || '-').join(', ')}), ${Math.min(...bp)}–${Math.max(...bp)} BPM, ${end.toFixed(0)} s`);
    const t = { id: 'v' + style, title: 'Set ' + style, style, duration: 900, params: P, meta: { mix: { decks: tl, count: tl.length, bpmMin: Math.min(...bp), bpmMax: Math.max(...bp) } } };
    const y = youtubeInfo(t), ch = chaptersOf(t);
    check(ch.length === tl.length && ch.every((c) => !/BPM|\d[AB]\b/.test(c.short || '')) && y.title.length <= 100 && y.tags.join(', ').length <= 500, `YouTube ${style} (mix) : chapitres vidéo sans BPM ni tonalité, limites respectées`);
  }
  const all = [...new Set([...BASS_PATCHES, ...Object.keys(PATCH_LABELS)])].filter((n) => GM_PROGRAM[n] == null);
  check(!all.length, 'MIDI : programme General MIDI pour chaque son (' + (all.join(' ') || 'aucun manquant') + ')');
  for (const [style, k, v] of [['hiphop', 'hiphopStyle', 'boombap'], ['hiphop', 'hiphopStyle', 'trap'], ['dnb', 'dnbStyle', 'liquid'], ['dnb', 'dnbStyle', 'neuro']]) {
    const y = youtubeInfo({ id: 'y', title: 'Essai', style, duration: 180, params: { style, bpm: 90, key: 'C', scale: 'minor', [k]: v }, meta: {} });
    check(y.title.length <= 100 && y.tags.length >= 5 && y.description.includes('#'), `YouTube ${style}/${v} : « ${y.title} » · ${y.hashtags.join(' ')}`);
  } }
// Résolutions vidéo / miniature
{ const { resolutionOf, RESOLUTIONS, makeThumbnail } = await import('../src/youtube.js');
  check(resolutionOf('4K') === '2160p' && resolutionOf('1080') === '1080p' && resolutionOf('720p') === '720p' && resolutionOf('8k') === null && RESOLUTIONS['2160p'].w === 3840, 'résolutions 720p / 1080p / 4K');
  if (ffmpegOk) { const t = { id: 'r', title: 'Essai résolution', style: 'lofi', duration: 75, params: { bpm: 80, key: 'C', scale: 'minor' }, waveform: [0.5, 0.8, 0.3] };
    for (const r of ['1080p', '4k']) { const jp = path.join(tmp, r + '.jpg'); await makeThumbnail(t, jp, r);
      const wh = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', jp]).toString().trim();
      check(wh === (r === '4k' ? '3840,2160' : '1920,1080') && fs.statSync(jp).size < 2e6, `miniature ${r} (${wh}, ${Math.round(fs.statSync(jp).size / 1024)} Ko)`); } } }
// Nom affiché (v1.6.1) : nettoyage, description / tags, miniature avec un nom à accents et « % »
{ const { cleanBrand } = await import('../src/brand.js'); const { youtubeInfo, makeThumbnail } = await import('../src/youtube.js');
  check(cleanBrand('  Ma Chaîne 🎧 Test ✨ ') === 'Ma Chaîne Test' && cleanBrand('Łódź').length === 4 && cleanBrand('x'.repeat(60)).length === 40 && cleanBrand('日本') === '', 'nom affiché : accents gardés, emoji retirés, 40 caractères max.');
  const t = { id: 'b', title: 'Essai nom', style: 'house', duration: 90, params: { bpm: 122, key: 'C', scale: 'minor' }, meta: {}, waveform: [0.4, 0.9, 0.6] };
  const d = youtubeInfo(t, 'soundtube'), c = youtubeInfo(t, 'Ma Chaîne'), n = youtubeInfo(t, '');
  check(d.description.includes('avec soundtube') && d.tags.includes('soundtube') && c.description.includes('par algorithme pour Ma Chaîne.') && !c.description.includes('soundtube') && c.tags.includes('ma chaîne') && !c.tags.includes('soundtube') && !n.description.includes('soundtube') && !n.tags.includes('soundtube'), 'nom affiché : description et tags (défaut, nom de chaîne, aucun)');
  if (ffmpegOk) { const a = path.join(tmp, 'b1.jpg'), b = path.join(tmp, 'b2.jpg'), z = path.join(tmp, 'b3.jpg');
    await makeThumbnail(t, a, '720p', { brand: 'soundtube' }); await makeThumbnail(t, b, '720p', { brand: "100% L'ami : Chaîne\\" }); await makeThumbnail(t, z, '720p', { brand: '' });
    check(md5(fs.readFileSync(a)) !== md5(fs.readFileSync(b)) && md5(fs.readFileSync(a)) !== md5(fs.readFileSync(z)), 'miniature : le nom affiché change l\'image (caractères spéciaux acceptés)'); } }
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `${fail} échec(s)` : 'Tous les tests sont passés.');
process.exit(fail ? 1 : 0);
