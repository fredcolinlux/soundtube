// v1.13.0 / v1.14.0 : paquet ZIP « tout-en-un » d'une génération.
//   <nom>/LISEZMOI.txt, manifest.json, video/ (vidéo longue), mix/ (MP3 + WAV + MIDI du mix entier),
//   morceaux/ (par morceau : MP4, MP3, WAV, TXT ; MIDI/ ; samples/ = stems par groupe d'instruments).
// Ne touche pas aux fichiers du morceau : tout est écrit dans <morceau>/pack/ puis servi en ZIP (stockage, sans recompression).
// Règle : un fichier demandé n'est jamais omis en silence. S'il manque, le paquet passe en erreur avec la raison.
import fs from 'node:fs';
import path from 'node:path';
import { splitTrack, splitAvailability, fileCrc, zipStream, crc32, readWavHeader, cutWav, SPLIT_MODES } from './split.js';
import { slugify } from './naming.js';
import { resolutionOf, youtubeInfo } from './youtube.js';
import { titleEnOf } from './titles.js';
import { STYLES } from './engine/styles.js';
import { STEM_GROUPS, renderStems } from './stems.js';

export const PACK_VERSION = 2;
export const packDir = (tracksDir, id) => path.join(tracksDir, id, 'pack');
export function packOptions(b = {}) {
  return {
    video: b.video !== false, videoRes: resolutionOf(b.videoRes) || null,
    pieces: b.pieces !== false, pieceVideo: !!b.pieceVideo, pieceRes: resolutionOf(b.pieceRes) || '720p',
    wav: !!b.wav, midi: b.midi !== false, txt: b.txt !== false, stems: !!b.stems,
    mode: ['mid', 'full', 'clean'].includes(b.mode) ? b.mode : 'mid', lang: b.lang === 'en' ? 'en' : 'fr',
  };
}
/** Découpe possible pour le paquet : mix DJ (≥ 2 titres, quelle que soit la durée) ou long morceau à chapitres (> 30 min). */
export function packSplit(t) { return t?.meta?.mix?.decks?.length >= 2 ? splitAvailability(t, 0) : splitAvailability(t); }

const NOTE_FR = { C: 'Do', 'C#': 'Do♯', D: 'Ré', 'D#': 'Ré♯', E: 'Mi', F: 'Fa', 'F#': 'Fa♯', G: 'Sol', 'G#': 'Sol♯', A: 'La', 'A#': 'La♯', B: 'Si' };
const SCALE_FR = { major: 'majeur', minor: 'mineur', dorian: 'dorien', phrygian: 'phrygien', lydian: 'lydien', mixolydian: 'mixolydien', harmonicMinor: 'mineur harmonique', harmonic_minor: 'mineur harmonique', locrian: 'locrien', pentatonic: 'pentatonique' };
const musicOf = (P = {}, fallback = {}) => {
  const key = P.key ?? fallback.key ?? null, scale = P.scale ?? fallback.scale ?? null;
  return { style: P.style ?? fallback.style ?? null, seed: P.seed ?? fallback.seed ?? null, variation: P.variation ?? fallback.variation ?? 0, bpm: P.bpm != null ? Math.round(P.bpm * 10) / 10 : fallback.bpm ?? null, key, scale, keyLabel: key ? `${NOTE_FR[key] || key} ${SCALE_FR[scale] || scale || ''}`.trim() : null, engine: P.engine ?? fallback.engine ?? null };
};
const hms = (s) => { s = Math.floor(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(x).padStart(2, '0')}`; };
const PROG_LABEL = { A: 'Couplet', B: 'Refrain', bridge: 'Pont' };
/** Progression d'accords d'un morceau : « Couplet : Dm7 – G7 – … ». */
export function chordLines(meta) {
  const P = meta?.progressions; if (P && typeof P === 'object') return Object.entries(P).filter(([, v]) => Array.isArray(v) && v.length).map(([k, v]) => `${PROG_LABEL[k] || k} : ${v.join(' – ')}`);
  const c = meta?.chapters?.[0]; if (c?.progressionA) return [`Couplet : ${c.progressionA.join(' – ')}`, ...(c.progressionB ? [`Refrain : ${c.progressionB.join(' – ')}`] : [])];
  return [];
}
/** Morceau « virtuel » d'une pièce découpée (mêmes champs qu'un morceau de la bibliothèque) : sert aux textes YouTube. */
function pieceTrack(t, p, total, mode) {
  const P = { ...(p.params || t.params), duration: Math.round(p.duration) }, meta = { ...(p.meta || {}) };
  if (!p.meta && t.meta?.chapters) { const c = t.meta.chapters[p.n - 1]; if (c) { meta.progressions = { A: c.progressionA, B: c.progressionB }; meta.chapters = [{ ...c, startSec: 0 }]; } }
  meta.splitFrom = { id: t.id, title: t.title, titleEn: titleEnOf(t), n: p.n, of: total, mode, start: p.start, end: p.end };
  meta.titleEn = p.title_en; meta.seconds = p.duration;
  return { id: `${t.id}-${p.n}`, title: p.title, style: P.style || t.style, params: P, meta, duration: p.duration, seed: P.seed, bpm: P.bpm, key: P.key, scale: P.scale, mood: P.mood, files: {} };
}
const SCALE_EN = { major: 'major', minor: 'minor', dorian: 'Dorian', phrygian: 'Phrygian', lydian: 'Lydian', mixolydian: 'Mixolydian', harmonicMinor: 'harmonic minor', harmonic_minor: 'harmonic minor', locrian: 'Locrian', pentatonic: 'pentatonic' };
const PROG_LABEL_EN = { A: 'Verse', B: 'Chorus', bridge: 'Bridge' };
const chordLinesEn = (meta) => chordLines(meta).map((l) => l.replace(/^(Couplet|Refrain|Pont) :/, (_, k) => `${PROG_LABEL_EN[{ Couplet: 'A', Refrain: 'B', Pont: 'bridge' }[k]]}:`));
/** v1.21.2 : fiche texte anglaise d'un morceau (même contenu que la fiche FR, description YouTube EN). */
export function pieceTextEn(pt, info, piece) {
  const S = pt.style || '', M = musicOf(pt.params, pt), key = M.key ? `${M.key} ${SCALE_EN[M.scale] || M.scale || ''}`.trim() : '?';
  return [`Title: ${pt.meta?.titleEn || titleEnOf(pt) || pt.title}`, ...(pt.title && pt.title !== pt.meta?.titleEn ? [`Title (French): ${pt.title}`] : []),
    `Style: ${S}`, `Tempo: ${M.bpm ?? '?'} BPM`, `Key: ${key}`, `Seed: ${M.seed ?? '?'}${M.variation ? ` (variation ${M.variation})` : ''}`, `Engine: ${M.engine ?? '?'}`,
    `Position in the mix: ${hms(piece.start)} – ${hms(piece.end)} (length ${hms(piece.duration)})`, '',
    'Chord progression:', ...(chordLinesEn(pt.meta).map((l) => '  ' + l)), '', '--- YouTube description ---', '', `YouTube title: ${info.title}`, '', info.description, '', `Tags: ${info.tags.join(', ')}`, ''].join('\n');
}
/** v1.21.2 : titre / description / tags YouTube du mix entier, dans une langue. */
function youtubeText(info, lang) {
  return lang === 'en'
    ? [`YouTube title: ${info.title}`, '', info.description, '', `Tags: ${info.tags.join(', ')}`, ''].join('\n')
    : [`Titre YouTube : ${info.title}`, '', info.description, '', `Tags : ${info.tags.join(', ')}`, ''].join('\n');
}
/** Fiche texte d'un morceau : titre, style, tempo, tonalité, graine, progression d'accords, description YouTube. */
export function pieceText(pt, info, piece) {
  const S = STYLES[pt.style]?.label || pt.style, M = musicOf(pt.params, pt);
  return [`Titre : ${pt.title}`, ...(pt.meta?.titleEn && pt.meta.titleEn !== pt.title ? [`Titre (anglais) : ${pt.meta.titleEn}`] : []),
    `Style : ${S}`, `Tempo : ${M.bpm ?? '?'} BPM`, `Tonalité : ${M.keyLabel || '?'}`, `Graine : ${M.seed ?? '?'}${M.variation ? ` (variation ${M.variation})` : ''}`, `Moteur : ${M.engine ?? '?'}`,
    `Position dans le mix : ${hms(piece.start)} – ${hms(piece.end)} (durée ${hms(piece.duration)})`, '',
    'Progression d\'accords :', ...(chordLines(pt.meta).map((l) => '  ' + l)), '', '--- Description YouTube ---', '', `Titre YouTube : ${info.title}`, '', info.description, '', `Tags : ${info.tags.join(', ')}`, ''].join('\n');
}

/**
 * Construit le paquet. deps = { tracksDir, ensureVideo(t, onP, res) → t, pieceVideos(t, M, dir, res, onP) → [{ n, path }],
 *   hasFfmpeg, brand, cpus, onProgress(f, stage) }. Retourne le manifeste (écrit dans pack/manifest.json) ; manifest.entries = entrées du ZIP.
 */
export async function buildPack(t, opts, deps) {
  const O = packOptions(opts), onP0 = deps.onProgress || (() => {}), trackDir = path.join(deps.tracksDir, t.id), out = packDir(deps.tracksDir, t.id);
  let lastF = 0; const onP = (f, s) => { lastF = Math.max(lastF, f); onP0(lastF, s); };
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const root = (slugify(t.title) || 'soundtube') + '/', entries = [], missing = [];
  const add = async (name, file) => { if (file && fs.existsSync(file)) { entries.push({ name: root + name, path: file, ...(await fileCrc(file)) }); return name; } missing.push(name); return null; };
  const addData = (name, text) => { const data = Buffer.from(text, 'utf8'), file = path.join(out, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); entries.push({ name: root + name, path: file, size: data.length, crc: crc32(data) }); return name; };
  const src = musicOf(t.params, t), av = packSplit(t), split = av.ok && O.pieces, mdir = path.join(out, 'morceaux'), notes = [];
  // 1. découpe (rapide : coupe du WAV en flux) ; WAV gardés si les vidéos ou les samples en ont besoin
  let M = null;
  if (split) {
    onP(0.02, 'Découpe des morceaux…');
    M = await splitTrack(t, trackDir, mdir, { mode: O.mode, lang: O.lang, formats: { wav: O.wav, mp3: deps.hasFfmpeg !== false, midi: O.midi }, keepWav: O.pieceVideo, keepMidi: O.pieceVideo, hasFfmpeg: deps.hasFfmpeg, brand: deps.brand, cpus: deps.cpus, minSeconds: 0, onProgress: (f, s) => onP(0.02 + 0.13 * f, s) });
    fs.rmSync(path.join(mdir, M.list.name), { force: true });
  } else if (O.pieceVideo || O.stems) notes.push(av.ok ? 'Morceaux non demandés : pas de vidéo ni de samples par morceau.' : 'Morceau unique (ni mix DJ ni chapitres de plus de 30 min) : pas de morceaux, donc pas de vidéo ni de samples par morceau.');
  // 2. vidéos par morceau : file vidéo habituelle (en parallèle du reste, le navigateur n'attend rien)
  const pv = { done: 0, total: M?.pieces.length || 0, progress: 0 };
  const pieceVid = split && O.pieceVideo ? deps.pieceVideos(t, M, mdir, O.pieceRes, (d, f) => { pv.done = d; pv.progress = f; }) : null;
  pieceVid?.catch(() => {}); // l'erreur est relevée plus bas (await)
  // 3. vidéo longue
  let video = null;
  if (O.video) {
    onP(0.16, 'Vidéo longue…');
    t = await deps.ensureVideo(t, (p) => onP(0.16 + 0.3 * p, `Rendu de la vidéo longue ${Math.round(100 * p)} %`), O.videoRes);
    video = await add(`video/${t.files.mp4}`, path.join(trackDir, t.files.mp4));
  }
  // 4. mix complet
  const F = t.files || {}, mix = {};
  if (F.mp3) mix.mp3 = await add(`mix/${F.mp3}`, path.join(trackDir, F.mp3)); else if (deps.hasFfmpeg !== false) missing.push('mix/ MP3');
  if (O.wav) { if (F.wav) mix.wav = await add(`mix/${F.wav}`, path.join(trackDir, F.wav)); else notes.push('WAV du mix : le morceau a été généré sans WAV (case « WAV » décochée à la génération).'); }
  if (O.midi && F.mid) mix.mid = await add(`mix/${F.mid}`, path.join(trackDir, F.mid));
  if (O.midi && F.midzip) mix.midiTracks = await add(`mix/${F.midzip}`, path.join(trackDir, F.midzip));
  // 5. samples (stems) : 5 rendus du morceau entier par le moteur d'origine, recoupés aux bornes exactes de chaque morceau
  let stems = null;
  if (split && O.stems) {
    onP(0.47, 'Samples : rendu des groupes d\'instruments…');
    const sdir = path.join(out, '.stems'); fs.mkdirSync(sdir, { recursive: true });
    const R = await renderStems(t, sdir, { cpus: deps.cpus, onProgress: (f) => onP(0.47 + 0.25 * f, `Samples : rendu des groupes d'instruments ${Math.round(100 * f)} %`) });
    stems = { groups: [], skipped: [] };
    const sd = path.join(mdir, 'samples'); fs.mkdirSync(sd, { recursive: true });
    for (const g of STEM_GROUPS) {
      const r = R[g.id]; if (!r || !(r.peak > 1e-4)) { stems.skipped.push({ group: g.label, reason: 'aucun son de ce groupe dans le morceau' }); fs.rmSync(r?.path || '', { force: true }); continue; }
      stems.groups.push(g.label);
      const fd = fs.openSync(r.path, 'r');
      try {
        const H = readWavHeader(fd, fs.fstatSync(fd).size), total = H.dataBytes / H.align;
        for (const p of M.pieces) {
          const f1 = p.end >= (t.duration || 0) - 0.01 ? total : Math.min(total, p.endFrame);
          const name = `${p.base} - ${g.label}.wav`, w = cutWav(fd, H, Math.min(total, p.startFrame), f1, path.join(sd, name), { fadeIn: p.n > 1 ? 0.015 : 0, fadeOut: p.n < M.pieces.length ? 0.015 : 0, tags: { INAM: `${p.name} (${g.label})`, IART: deps.brand || 'soundtube' } });
          if (Math.max(0, ...w.peaks) < 1e-4) { fs.rmSync(path.join(sd, name), { force: true }); (p.silent ||= []).push(g.label); }
        }
      } finally { fs.closeSync(fd); fs.rmSync(r.path, { force: true }); }
    }
    fs.rmSync(sdir, { recursive: true, force: true });
  }
  // 6. attente des vidéos par morceau (le paquet le dit ; jamais d'omission silencieuse)
  let vids = [];
  if (pieceVid) {
    for (;;) {
      const r = await Promise.race([pieceVid.then((v) => ({ v })), new Promise((ok) => setTimeout(() => ok(null), 500))]);
      if (r) { vids = r.v; break; }
      onP(0.72 + 0.23 * pv.progress, `Vidéos des morceaux : ${pv.done}/${pv.total} prêtes — rendu en cours, le ZIP attend`);
    }
  }
  // 7. entrées par morceau
  let pieces = [];
  if (split) {
    onP(0.96, 'Fiches et vérification…');
    for (const p of M.pieces) {
      const files = {}, pt = pieceTrack(t, p, M.pieces.length, O.mode), base = p.base;
      if (O.pieceVideo) { const v = vids.find((x) => x.n === p.n); files.mp4 = v ? await add(`morceaux/${base}.mp4`, v.path) : (missing.push(`morceaux/${base}.mp4`), null); }
      if (deps.hasFfmpeg !== false) files.mp3 = await add(`morceaux/${base}.mp3`, path.join(mdir, base + '.mp3'));
      if (O.wav) files.wav = await add(`morceaux/${base}.wav`, path.join(mdir, base + '.wav'));
      else fs.rmSync(path.join(mdir, base + '.wav'), { force: true });
      if (O.txt) {
        files.txt = addData(`morceaux/${base}.txt`, pieceText(pt, youtubeInfo(pt, deps.brand, 'fr'), p));
        files.txtEn = addData(`morceaux/${base}.en.txt`, pieceTextEn(pt, youtubeInfo(pt, deps.brand, 'en'), p)); // v1.21.2 : fiche anglaise
      }
      if (O.midi && p.files.midi) { files.midi = []; for (const m of p.files.midi) files.midi.push(await add(`morceaux/${m.name}`, path.join(mdir, m.name))); }
      if (stems) { files.samples = []; for (const g of stems.groups) if (!(p.silent || []).includes(g)) files.samples.push(await add(`morceaux/samples/${base} - ${g}.wav`, path.join(mdir, 'samples', `${base} - ${g}.wav`))); }
      pieces.push({ n: p.n, title: p.title, title_en: p.title_en || titleEnOf(pt), base, start: +p.start.toFixed(2), end: +p.end.toFixed(2), duration: +p.duration.toFixed(2), ...musicOf(pt.params, src), chords: chordLines(pt.meta), files, ...(p.silent?.length ? { silentSamples: p.silent } : {}) });
    }
    if (!O.midi) fs.rmSync(path.join(mdir, 'MIDI'), { recursive: true, force: true });
    if (O.midi && av.kind === 'chapters') notes.push('MIDI par morceau : seulement pour un mix DJ (le MIDI complet est dans mix/).');
  } else {
    pieces = [{ n: 1, title: t.title, title_en: t.meta?.titleEn || null, start: 0, end: +(+t.duration).toFixed(2), duration: +(+t.duration).toFixed(2), ...src, chords: chordLines(t.meta), files: { ...mix }, note: 'Morceau unique : les fichiers sont ceux du dossier mix/.' }];
  }
  if (missing.length) { const e = new Error(`Fichier(s) demandé(s) absent(s) : ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''}`); e.missing = missing; throw e; }
  // 8. manifeste + lisez-moi
  const manifest = { version: PACK_VERSION, generator: 'soundtube', created: new Date().toISOString(), options: O,
    source: { id: t.id, title: t.title, title_en: titleEnOf(t) || null, duration: +(+t.duration).toFixed(2), ...src, mix: t.meta?.mix?.decks?.length >= 2, split: split ? av.kind : null, splitMode: split ? O.mode : null },
    video, videoResolution: video ? t.meta?.youtube?.videoResolution || null : null, mix, ...(stems ? { samples: stems } : {}), ...renderInfo(t), notes, pieces };
  addData('manifest.json', JSON.stringify(manifest, null, 2));
  addData('LISEZMOI.txt', readme(t, manifest));
  addData('README.txt', readmeEn(t, manifest)); // v1.21.2 : lisez-moi anglais
  if (O.txt) { addData('youtube-fr.txt', youtubeText(youtubeInfo(t, deps.brand, 'fr'), 'fr')); addData('youtube-en.txt', youtubeText(youtubeInfo(t, deps.brand, 'en'), 'en')); }
  fs.writeFileSync(path.join(out, '.entries.json'), JSON.stringify({ options: O, pieces: pieces.length, entries }));
  manifest.entries = entries; onP(1, 'Terminé');
  return manifest;
}

/** v1.16.0 : où ont tourné la musique et la vidéo (absent pour les morceaux rendus avant la v1.16). */
function renderInfo(t) {
  const r = t.meta?.render; if (!r) return {};
  return { render: { music: { where: r.where === 'node' ? 'pc' : 'ct', node: r.node || null, reason: r.reason || null, fallback: r.fallback || null, combo: !!r.combo }, video: t.meta?.youtube?.videoNode || null } };
}
function readme(t, m) {
  const O = m.options, split = !!m.source.split, P = m.pieces;
  const kinds = split ? [O.pieceVideo && 'vidéo MP4', 'MP3', O.wav && 'WAV', O.txt && 'TXT'].filter(Boolean).join(', ') : '';
  return [`${t.title} — paquet soundtube`, '', 'Musique originale générée par soundtube (aucun échantillon protégé).', '',
    'Arborescence :', `${slugify(t.title) || 'soundtube'}/`,
    '├─ LISEZMOI.txt        ce fichier',
    '├─ manifest.json       tempo, tonalité, graine, style, moteur et fichiers de chaque morceau',
    m.video ? `├─ video/              la vidéo longue (${path.basename(m.video)}${m.videoResolution ? ', ' + m.videoResolution : ''})` : '├─ video/              (vidéo non demandée)',
    `${split ? '├' : '└'}─ mix/                le mix entier : MP3${m.mix.wav ? ' + WAV' : ''}${m.mix.mid ? ' + MIDI' : ''}`,
    ...(split ? [`└─ morceaux/           ${P.length} morceaux « 01 - Titre » : ${kinds}`,
      ...(O.midi && P.some((p) => p.files.midi) ? ['   ├─ MIDI/            un dossier par morceau : .mid complet + une piste par instrument'] : []),
      ...(m.samples ? [`   └─ samples/         stems par morceau : « 01 - Titre - ${m.samples.groups.join(' / ')}.wav »`] : [])] : []),
    '', split ? `Découpage : ${SPLIT_MODES[O.mode]?.label.toLowerCase() || O.mode}.` : 'Morceau unique : pas de dossier morceaux/ (les fichiers sont dans mix/).',
    ...(m.samples ? ['', 'Samples (stems) : chaque groupe d\'instruments rendu seul par le moteur d\'origine (même graine, même partition, même gain de mastering que le mix).',
      'Additionnés, ils redonnent le mix à peu près (le compresseur du master, les textures vinyle/bande et le fond sonore lo-fi ne sont pas dans les stems).',
      ...(m.samples.skipped.length ? [`Groupes absents : ${m.samples.skipped.map((s) => s.group).join(', ')} (aucun son de ce groupe dans le morceau).`] : []),
      ...P.filter((p) => p.silentSamples?.length).map((p) => `Morceau ${p.base} : pas de sample « ${p.silentSamples.join(' », « ')} » (groupe silencieux dans ce morceau).`)] : []),
    ...(m.notes.length ? ['', 'Remarques :', ...m.notes.map((n) => '  - ' + n)] : []),
    '', 'Morceaux :', ...P.map((p) => `${String(p.n).padStart(2, '0')}. ${p.title}  [${hms(p.start)} – ${hms(p.end)}]  ${STYLES[p.style]?.label || p.style || ''} · ${p.bpm ?? '?'} BPM · ${p.keyLabel || '?'} · graine ${p.seed ?? '?'}`), ''].join('\n');
}
function readmeEn(t, m) {
  const O = m.options, split = !!m.source.split, P = m.pieces;
  const kinds = split ? [O.pieceVideo && 'MP4 video', 'MP3', O.wav && 'WAV', O.txt && 'TXT (FR + EN)'].filter(Boolean).join(', ') : '';
  return [`${titleEnOf(t) || t.title} — soundtube package`, '', 'Original music generated by soundtube (no protected samples).', '',
    'Layout:', `${slugify(t.title) || 'soundtube'}/`,
    '├─ README.txt / LISEZMOI.txt   this file (EN / FR)',
    '├─ manifest.json       tempo, key, seed, style, engine and files of every track',
    ...(O.txt ? ['├─ youtube-en.txt / youtube-fr.txt   YouTube title, description and tags of the full mix'] : []),
    m.video ? `├─ video/              the long video (${path.basename(m.video)}${m.videoResolution ? ', ' + m.videoResolution : ''})` : '├─ video/              (video not requested)',
    `${split ? '├' : '└'}─ mix/                the full mix: MP3${m.mix.wav ? ' + WAV' : ''}${m.mix.mid ? ' + MIDI' : ''}`,
    ...(split ? [`└─ morceaux/           ${P.length} tracks "01 - Title": ${kinds}`, ...(O.txt ? ['   ├─ <track>.txt / <track>.en.txt   track sheet + YouTube description (FR / EN)'] : []),
      ...(m.samples ? [`   └─ samples/         stems per track: "01 - Title - ${m.samples.groups.join(' / ')}.wav"`] : [])] : []),
    '', split ? `Split mode: ${O.mode}.` : 'Single track: no morceaux/ folder (files are in mix/).',
    '', 'Tracks:', ...P.map((p) => `${String(p.n).padStart(2, '0')}. ${p.title_en || p.title}  [${hms(p.start)} – ${hms(p.end)}]  ${p.style || ''} · ${p.bpm ?? '?'} BPM · seed ${p.seed ?? '?'}`), ''].join('\n');
}
/** Paquet déjà prêt sur le disque (après un redémarrage) : { options, pieces, entries } ou null. */
export function readPack(tracksDir, id) { try { return JSON.parse(fs.readFileSync(path.join(packDir(tracksDir, id), '.entries.json'), 'utf8')); } catch { return null; } }
export { zipStream };
