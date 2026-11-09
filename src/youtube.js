// Outils YouTube : titre / description (chapitres) / tags en français, miniature et vidéo MP4 avec visualiseur (720p, 1080p ou 4K).
// Tout passe par ffmpeg (drawtext + polices embarquées, showcqt, libx264) : aucune dépendance supplémentaire.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildArgs, runFfmpeg, SPEC_VERSION } from '../node-agent/render-core.mjs';
import { RenderNodes } from './nodes.js';
import { config } from './config.js';
import { STYLES, MOODS, AMBIENCES } from './engine/styles.js';
import { SCALES, NOTE_NAMES_FR } from './engine/theory.js';
import { meterInfo } from './engine/composer.js';
import { fileNames, syncFiles } from './naming.js';
import { brandText, DEFAULT_BRAND } from './brand.js';
import { computeItems, waveBars, normalizeDesign } from '../public/js/layout.js';
import { getMedia, frameTime } from './media.js';
import { translateTitle, titleEnOf } from './titles.js';
import { STYLE_EN, USAGE_EN, USAGE_SUB_EN, MOOD_EN, AMB_EN, AMB_TAGS_EN, SECTION_EN, PROFILE_EN, SCALE_EN, durWordsEn } from './youtube-en.js';

export const LANGS = ['fr', 'en'];
export const langOf = (l) => (l === 'en' ? 'en' : 'fr');

const FONT = path.join(config.publicDir, 'fonts', 'space-grotesk-latin-wght-normal.woff2');
const MONO = path.join(config.publicDir, 'fonts', 'jetbrains-mono-latin-600-normal.woff2');
export const THEME = {
  lofi: { accent: 'f3c97a', c0: '120c1c', c1: '3a2416' }, ambient: { accent: '7fd0ff', c0: '060d1c', c1: '10324a' },
  synthwave: { accent: 'c792ff', c0: '0d0624', c1: '3d0b4a' }, house: { accent: '5ef2c9', c0: '061416', c1: '0b3330' },
  frenchtouch: { accent: 'ffd23f', c0: '140f03', c1: '3d1f45' },
  techno: { accent: 'a9b4d8', c0: '07080d', c1: '1b2133' }, cinematic: { accent: 'e8dcb0', c0: '0c0b08', c1: '2e2616' },
  chiptune: { accent: 'b6f36a', c0: '0a1206', c1: '1d3a12' }, trap: { accent: 'ff8fc7', c0: '12060d', c1: '3a0d26' },
  hiphop: { accent: 'ffb36b', c0: '140b05', c1: '3a2210' }, dnb: { accent: '6be3ff', c0: '040d14', c1: '0c2a3d' },
};
const USAGE = {
  lofi: { titre: 'Lo-fi Hip-Hop pour étudier et se détendre', usages: 'étudier, travailler, lire, se détendre', tags: ['lofi', 'lo-fi hip hop', 'chill beats', 'musique pour étudier', 'beats to study'] },
  ambient: { titre: 'Musique ambient pour méditer et dormir', usages: 'méditer, dormir, se concentrer, respirer', tags: ['ambient', 'musique de méditation', 'musique pour dormir', 'relaxation', 'musique zen'] },
  synthwave: { titre: 'Synthwave rétro pour rouler de nuit', usages: 'conduire de nuit, coder, jouer, rêver aux années 80', tags: ['synthwave', 'retrowave', 'outrun', 'musique années 80', 'synthpop instrumental'] },
  house: { titre: 'Deep House pour travailler et bouger', usages: 'travailler, faire du sport, une soirée entre amis', tags: ['deep house', 'house music', 'musique club', 'groove', 'house instrumentale'] },
  frenchtouch: { titre: 'French Touch — house filtrée et disco', usages: 'faire la fête, cuisiner, rouler, se motiver', tags: ['french touch', 'filter house', 'french house', 'disco house', 'talkbox'] },
  techno: { titre: 'Techno hypnotique pour se concentrer', usages: 'se concentrer, courir, coder, danser', tags: ['techno', 'techno hypnotique', 'warehouse techno', 'tr-909', 'musique électronique'] },
  cinematic: { titre: 'Musique épique et cinématique', usages: 'vidéos, jeux de rôle, écriture, motivation', tags: ['musique épique', 'musique de film', 'bande originale', 'orchestral', 'cinématique'] },
  chiptune: { titre: 'Chiptune 8-bit pour jouer et coder', usages: 'jouer, coder, retro gaming', tags: ['chiptune', '8-bit', 'musique jeu vidéo', 'retro gaming', 'bitpop'] },
  trap: { titre: 'Trap instrumental sombre', usages: 'faire du sport, écrire, freestyle, rouler', tags: ['trap', 'instrumental trap', 'beat trap', '808', 'type beat'] },
  hiphop: { titre: 'Instrumental Hip-Hop (boom-bap, lo-fi, trap)', usages: 'écrire, freestyle, travailler, rouler', tags: ['hip hop instrumental', 'boom bap', 'beat hip hop', 'instrumental rap', 'jazzy hip hop'] },
  dnb: { titre: 'Drum and Bass instrumentale', usages: 'courir, coder, se concentrer, danser', tags: ['drum and bass', 'dnb', 'liquid drum and bass', 'jungle', 'neurofunk'] },
};
// variantes hip-hop / drum & bass : titre et mots-clés propres
const USAGE_SUB = {
  hiphop_boombap: { titre: 'Boom-Bap Hip-Hop instrumental jazzy', tags: ['boom bap', 'boom bap instrumental', 'jazzy hip hop', '90s hip hop beat'] },
  hiphop_lofi: { titre: 'Lo-fi Hip-Hop instrumental (vinyle)', tags: ['lofi hip hop', 'lo-fi beat', 'chill hip hop', 'vinyl beat'] },
  hiphop_trap: { titre: 'Trap instrumental (808, demi-temps)', tags: ['trap beat', 'instrumental trap', '808', 'type beat'] },
  dnb_liquid: { titre: 'Liquid Drum and Bass pour se concentrer', tags: ['liquid drum and bass', 'liquid dnb', 'drum and bass', 'dnb mix'] },
  dnb_neuro: { titre: 'Neurofunk Drum and Bass sombre', tags: ['neurofunk', 'neuro dnb', 'drum and bass', 'reese bass'] },
  dnb_jungle: { titre: 'Jungle Drum and Bass (breaks)', tags: ['jungle', 'jungle dnb', 'breakbeat', 'drum and bass'] },
  // v1.11.0 : sous-genres lo-fi (moteur 20)
  lofi_jazzy: { titre: 'Lo-fi jazzy (Rhodes, accords jazz) pour étudier', tags: ['lofi jazz', 'jazzy lofi', 'rhodes', 'jazz hop'] },
  lofi_chillhop: { titre: 'Chillhop instrumental pour se détendre', tags: ['chillhop', 'chill hop', 'chill beats', 'lofi'] },
  lofi_lofihouse: { titre: 'Lo-fi House filtrée', tags: ['lofi house', 'lo-fi house', 'deep house chill', 'filtered house'] },
  lofi_ambient: { titre: 'Lo-fi ambient (nappes, presque sans rythme)', tags: ['ambient lofi', 'lofi ambient', 'nappes', 'musique pour dormir'] },
  lofi_sad: { titre: 'Sad lo-fi mélancolique', tags: ['sad lofi', 'lofi triste', 'musique mélancolique', 'lofi'] },
  lofi_beatmaker: { titre: 'Beat boom-bap poussiéreux (scratchs, cuivres)', tags: ['boom bap', 'beatmaker', 'scratch', 'abstract hip hop', 'instrumental hip hop'] },
};
const MINORISH = new Set(['minor', 'dorian', 'phrygian', 'harmonic_minor', 'locrian']);

const AMB_TAGS = { pluie: ['bruit de pluie', 'pluie relaxante'], vagues: ['bruit des vagues', 'sons de la mer'], vent: ['bruit du vent'], nuit: ['sons de la nuit', 'grillons'], feu: ['feu de cheminée', 'crépitement du feu'], ville: ['ambiance ville', 'city ambience'], vinyle: ['craquement vinyle', 'vinyl crackle'], cafe: ['ambiance café', 'coffee shop ambience'], nuitville: ['nuit en ville', 'grillons et ville'], etude: ['ambiance bibliothèque', 'study ambience'] };
export function fmtTime(s) {
  s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
}
export function durWords(s) {
  if (s < 59.5) return `${Math.round(s)} s`;
  const m = Math.round(s / 60); if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.floor(m / 60), r = m % 60; return r >= 5 ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}
const keyFr = (P) => `${NOTE_NAMES_FR[['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(P.key)] ?? P.key} ${(SCALES[P.scale]?.label || P.scale || '').split(' (')[0].toLowerCase()}`;

/** Chapitres YouTube (1er à 0:00, ≥ 3, ≥ 10 s chacun) : mouvements pour les longs morceaux, sections sinon. */
export function chaptersOf(t, lang = 'fr') {
  const en = lang === 'en', tr = (x) => (en ? translateTitle(x) || x : x);
  const M = t.meta || {}, P = t.params || {}, total = t.duration || M.seconds || 0;
  let list = [];
  if ((M.mix?.decks || []).length > 1) { // mix DJ : un chapitre par titre (au milieu de la transition)
    list = M.mix.decks.map((d) => ({ start: d.start || 0, label: `${tr(d.name)} — ${d.camelot} · ${d.bpm} BPM`, short: tr(d.name) }));
  } else if ((M.chapters || []).length > 1) {
    list = M.chapters.map((c, i) => { const p = String(c.profile || '').replace(/\s*\(.*\)/, '') || 'Plein'; return { start: c.startSec || 0, label: en ? `Movement ${i + 1} — ${PROFILE_EN[p] || p}` : `Mouvement ${i + 1} — ${p}` }; });
  } else if ((M.sections || []).length) {
    const barS = meterInfo(P).bpb * 60 / (P.bpm || 120); const count = {};
    for (const s of M.sections) {
      const start = s.startBar * barS, prev = list[list.length - 1];
      if (prev && prev.base === s.label) continue; // fusionne les sections identiques consécutives
      count[s.label] = (count[s.label] || 0) + 1;
      const lb = en ? SECTION_EN[s.label] || s.label : s.label;
      list.push({ start, base: s.label, label: count[s.label] > 1 ? `${lb} ${count[s.label]}` : lb });
    }
  }
  // durée minimale 10 s : un chapitre trop court fusionne avec le suivant (« Intro / Couplet »)
  const out = [];
  for (const c of list) {
    const last = out[out.length - 1];
    if (last && c.start - last.start < 10) { last.label = last.merged ? last.label : `${last.label} / ${c.label}`; last.merged = true; continue; }
    out.push({ start: out.length ? c.start : 0, label: c.label, ...(c.short ? { short: c.short } : {}) });
  }
  while (out.length > 1 && total - out[out.length - 1].start < 10) { const z = out.pop(); out[out.length - 1].label += ` / ${z.label}`; }
  out.forEach((c) => delete c.merged);
  return out.length >= 3 ? out.map((c) => ({ ...c, time: fmtTime(c.start) })) : [];
}

/** Crédits requis par les licences des échantillons utilisés (Salamander : CC-BY 3.0 ; jRhodes3d : crédit de l'auteur). */
export function sampleCredits(t, lang = 'fr') {
  const sons = [t.meta?.recipe?.sons, ...((t.meta?.mix?.decks || []).map((x) => x.sons))].filter(Boolean);
  const txt = sons.map((o) => Object.values(o).join(' ')).join(' ');
  const out = [];
  if (lang === 'en') {
    if (/Salamander/.test(txt)) out.push('🎹 Piano: Salamander Grand Piano V3 by Alexander Holm — CC-BY 3.0 (https://creativecommons.org/licenses/by/3.0/).');
    if (/jRhodes3d/.test(txt)) out.push('🎹 Rhodes: jRhodes3d samples by Jeff Learman (CC BY-NC 4.0; the music produced is free to use).');
    return out;
  }
  if (/Salamander/.test(txt)) out.push('🎹 Piano : Salamander Grand Piano V3 par Alexander Holm — CC-BY 3.0 (https://creativecommons.org/licenses/by/3.0/).');
  if (/jRhodes3d/.test(txt)) out.push('🎹 Rhodes : échantillons jRhodes3d par Jeff Learman (CC BY-NC 4.0 ; musique produite libre).');
  return out;
}

/** Titre (≤ 100), description (≤ 5000) et tags (≤ 500 caractères) en français. */
export function youtubeInfo(t, brand = brandText(), lang = 'fr') {
  if (lang === 'en') return youtubeInfoEn(t, brand);
  const P = t.params || {}, S = STYLES[t.style] || {}, U0 = USAGE[t.style] || { titre: S.label, usages: 'écouter', tags: [] };
  const US = USAGE_SUB[`${t.style}_${P.hiphopStyle || P.dnbStyle || P.lofiStyle || ''}`];
  const U = US ? { ...U0, ...US, tags: [...US.tags, ...U0.tags.filter((x) => !US.tags.includes(x))].slice(0, 8) } : U0;
  const L = t.meta?.loudness, dur = t.duration || P.duration || 0, chapters = chaptersOf(t);
  // La durée n'est mise en avant dans le titre que pour les formats longs (≥ 10 min), très recherchés.
  const dw = dur >= 600 ? ` (${durWords(dur)})` : '';
  let title = `${t.title} · ${U.titre}${dw}`;
  if (title.length > 100) title = `${t.title} · ${S.label}${dw}`.slice(0, 100);
  const lines = [
    `${t.title} — ${S.label} instrumental, ${durWords(dur)}${dur >= 600 ? ' sans interruption' : ''}.`,
    (t.meta?.ai?.description_fr || `${S.tagline || ''}`).trim(), // v1.9.0 : texte du directeur artistique (si proposé)
    '',
    `🎧 Idéal pour : ${U.usages}.`,
    '',
  ];
  // ambiance + fond sonore (pluie, vagues…) : une ligne et des tags dédiés
  const mood = MOODS[P.mood], ambId = P.adv?.ambience === 'none' ? null : (P.adv?.ambience || mood?.ambience || null);
  if ((mood && P.mood !== 'auto') || ambId) {
    lines.splice(lines.length - 1, 0, `🌙 Ambiance : ${mood && P.mood !== 'auto' ? mood.label.toLowerCase() : 'selon le style'}${ambId ? ` · fond sonore : ${(AMBIENCES[ambId] || ambId).toLowerCase()} (synthétisé)` : ''}.`);
  }
  if (chapters.length) { lines.push('⏱️ Chapitres'); for (const c of chapters) lines.push(`${c.time} ${c.label}`); lines.push(''); }
  const SF = t.meta?.splitFrom; if (SF) lines.push(`🔗 Extrait du mix « ${SF.title} » : morceau ${SF.n}/${SF.of} (${fmtTime(SF.start)} – ${fmtTime(SF.end)} dans le mix complet).`, '');
  const MX = t.meta?.mix;
  if (MX?.count > 1) lines.push(`🎚️ Mix DJ continu de ${MX.count} titres originaux enchaînés (transitions calées sur le tempo, harmonie Camelot) · Tempo ${MX.bpmMin}–${MX.bpmMax} BPM · Mesure ${t.meta?.meter || '4/4'} · Durée ${fmtTime(dur)}`);
  else lines.push(`🎼 Tempo ${Math.round(P.bpm)} BPM · Tonalité ${keyFr(P)} · Mesure ${t.meta?.meter || '4/4'} · Durée ${fmtTime(dur)}`);
  if (L) lines.push(`🔊 Mastering aux normes YouTube : ${String(L.integrated).replace('.', ',')} LUFS intégrés, crête ${String(L.truePeak).replace('.', ',')} dBTP.`);
  lines.push('', `ℹ️ Musique instrumentale originale (sans paroles), composée, arrangée et mixée par algorithme${brand === DEFAULT_BRAND ? ` avec soundtube${config.artist && config.artist !== 'soundtube' ? ` pour ${config.artist}` : ''}` : brand ? ` pour ${brand}` : ''}. Sons de synthèse et échantillons libres.`);
  for (const c of sampleCredits(t)) lines.push(c);
  const hashtags = ['#' + (S.label || t.style).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ''), '#musiqueinstrumentale', '#sansparoles'];
  lines.push('', hashtags.join(' '));
  let description = lines.join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 5000);
  const tagList = [...(t.meta?.ai?.tags || []), ...U.tags, ...(AMB_TAGS[ambId] || []), S.label, (S.genre || '').split(' & ')[0], 'musique instrumentale', 'musique sans paroles', ...(dur >= 600 ? [`${durWords(dur)} de musique`] : []), `${Math.round(P.bpm)} bpm`, 'musique originale', brand]
    .filter(Boolean).map((x) => x.toLowerCase().replace(/[<>,]/g, ''));
  const tags = []; let len = 0;
  for (const x of [...new Set(tagList)]) { if (len + x.length + 1 > 480) break; tags.push(x); len += x.length + 1; }
  return { title, description, tags, chapters, hashtags };
}

// ---------- rendu ffmpeg
function run(args, { onProgress, total, cwd } = {}) {
  return new Promise((res, rej) => {
    if (process.env.ST_DEBUG_FFMPEG) console.error(args.join(' '));
    const p = spawn(config.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...(onProgress ? ['-progress', 'pipe:1', '-nostats'] : []), ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err += d; if (err.length > 8000) err = err.slice(-4000); });
    if (onProgress) p.stdout.on('data', (d) => { const m = /out_time_us=(\d+)/.exec(String(d)); if (m && total) onProgress(Math.min(1, +m[1] / 1e6 / total)); });
    else p.stdout.resume();
    p.on('error', rej); p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg : ' + err.trim().slice(-600)))));
    run.last = p;
  });
}
const esc = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
function textFile(dir, name, s, rel = false) { const f = path.join(dir, name); fs.writeFileSync(f, s); return rel ? name : esc(f); }
/** Résolutions proposées pour la vidéo (et la miniature). 4K : moins d'images/s et CRF plus élevé pour rester rapide. */
export const RESOLUTIONS = {
  '720p': { w: 1280, h: 720, label: '720p (1280×720)', crf: 27, fps: [24, 15], preset: 'veryfast', cqtW: 1280 },
  '1080p': { w: 1920, h: 1080, label: '1080p (1920×1080)', crf: 26, fps: [24, 15], preset: 'veryfast', cqtW: 1280 },
  '2160p': { w: 3840, h: 2160, label: '4K (3840×2160)', crf: 28, fps: [15, 12], preset: 'veryfast', cqtW: 1920 },
};
export const DEFAULT_RESOLUTION = '1080p';
export function resolutionOf(r) {
  const k = String(r || '').toLowerCase().replace(/\s/g, '');
  const id = { '720': '720p', '720p': '720p', hd: '720p', '1080': '1080p', '1080p': '1080p', fullhd: '1080p', fhd: '1080p', '2160': '2160p', '2160p': '2160p', '4k': '2160p', uhd: '2160p' }[k];
  return id || null;
}

// ---------- mise en page (module partagé avec l'éditeur du navigateur : mêmes polices, mêmes calculs)
const FONTS = { sans: FONT, mono: MONO };
const FONT_REL = { sans: 'font-sans.woff2', mono: 'font-mono.woff2' }; // rendu portable : polices copiées dans le dossier du job
export const themeOf = (style) => { const th = THEME[style] || THEME.house; return { accent: th.accent, ink: th.c0, c0: th.c0, c1: th.c1 }; };
/** Textes dessinés (jamais le tempo ni la tonalité). */
export function textData(t, brand = brandText(), lang = 'fr') {
  const en = lang === 'en', S = (en ? STYLE_EN[t.style] : null) || STYLES[t.style] || {}, d = t.duration || t.params?.duration || 0, mix = t.meta?.mix?.count > 1;
  return {
    title: (en ? titleEnOf(t) : t.title) || '', brand,
    chip: `${(S.label || t.style || '').toUpperCase()}${mix ? (en ? '  ·  DJ MIX' : '  ·  MIX DJ') : ''}`,
    sub: `${en ? durWordsEn(d) : durWords(d)}${mix ? (en ? `  ·  ${t.meta.mix.count} tracks mixed` : `  ·  ${t.meta.mix.count} titres enchaînés`) : ''}`,
    chapter: (() => { const c = chaptersOf(t, lang)[0]; return c ? (c.short || c.label) : ''; })(),
  };
}
let nTxt = 0;
/** drawtext d'un élément calculé par computeItems (y = ligne de base ; expansion=none : « % » et « { » restent du texte). */
function drawtext(it, tmp, enable, rel = false) {
  const x = it.align === 'center' ? `${it.x}-tw/2` : it.align === 'right' ? `${it.x}-tw` : `${it.x}`;
  const o = [`fontfile='${rel ? FONT_REL[it.font] || FONT_REL.sans : esc(FONTS[it.font])}'`, `textfile='${textFile(tmp, `tx${nTxt++}.txt`, it.text, rel)}'`, 'expansion=none', `fontsize=${it.size}`, `fontcolor=0x${it.color}@${it.alpha}`, `x=${x}`, `y=${it.baseline}`, 'y_align=baseline'];
  if (it.border) o.push(`borderw=${it.border}`, `bordercolor=0x${it.color}@${it.alpha}`);
  if (it.shadow) o.push(`shadowcolor=0x${it.shadow.color}@${it.shadow.alpha}`, 'shadowx=0', `shadowy=${it.shadow.dy}`);
  if (it.box) o.push('box=1', `boxcolor=0x${it.box.color}`, `boxborderw=${it.box.pad}`);
  if (enable) o.push(`enable='${enable}'`);
  return 'drawtext=' + o.join(':');
}
const waveGraph = (t, wave, W, H) => waveBars(t.waveform, { W, H, cy: wave.cy, h: wave.h }).map((b) => `drawbox=x=${b.x}:y=${b.y}:w=${b.w}:h=${b.h}:color=0x${wave.color}@${b.a}:t=fill`);
const gradient = (th, W, H) => `gradients=s=${W}x${H}:c0=0x${th.c0}:c1=0x${th.c1}:x0=0:y0=0:x1=${W}:y1=${H}:d=1:speed=0,format=rgba,vignette=PI/4.2`;
/** Mise à l'échelle d'une animation : « remplir » (recadrée, sans bandes) ou « ajuster » (entière, bandes couleur du thème). */
export const fitChain = (W, H, fit, padColor, dim = 0) => (fit === 'contain'
  ? `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=bicubic,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x${padColor},setsar=1`
  : `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=bicubic,crop=${W}:${H},setsar=1`) + (dim > 0 ? `,drawbox=c=black@${dim}:t=fill` : ''); // voile sombre : textes lisibles sur une animation claire
/** Entrée ffmpeg d'une animation : vidéo / GIF bouclés à l'infini (-stream_loop, aucun pré-rendu), image fixe répétée. */
const mediaInput = (m, fps, { at } = {}) => (m.kind === 'image' ? ['-loop', '1', '-framerate', String(fps || 1), '-i', m.path]
  : at != null ? ['-ss', String(at), '-i', m.path] : ['-stream_loop', '-1', '-i', m.path]);
const resolveMedia = (d) => (d.background.media ? getMedia(d.background.media) : null);

/** Fond seul (sans textes ni forme d'onde) en W×H : dégradé du style ou image de l'animation — base de l'aperçu de l'éditeur. */
export async function makeBase({ style, media = null, fit = 'cover', dim = 0, W = 1280, H = 720 }, outFile) {
  const th = themeOf(style), m = media ? getMedia(media) : null;
  if (m) await run([...mediaInput(m, 1, { at: frameTime(m) }), '-frames:v', '1', '-vf', `${fitChain(W, H, fit, th.c0, dim)},format=yuvj420p`, '-q:v', '3', outFile]);
  else await run(['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:d=1`, '-filter_complex', `${gradient(th, W, H)},format=yuvj420p`, '-frames:v', '1', '-q:v', '3', outFile]);
}

/** Miniature JPEG à la résolution choisie (720p par défaut ; ≤ 2 Mo, limite YouTube). */
export async function makeThumbnail(t, outFile, resolution = '720p', { brand = brandText(), design, lang = 'fr' } = {}) {
  const R = RESOLUTIONS[resolutionOf(resolution) || '720p'], W = R.w, H = R.h, D = normalizeDesign(design), th = themeOf(t.style);
  const m = D.background.thumb === 'media' ? resolveMedia(D) : null;
  const items = computeItems(D.layout.thumb, 'thumb', textData(t, brand, lang), { W, H, theme: th });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'st-thumb-'));
  try {
    const g = [m ? `[0:v]${fitChain(W, H, D.background.fit, th.c0, D.background.dim)},format=rgba` : gradient(th, W, H)];
    if (items.wave && (!m || D.background.overlay)) g.push(...waveGraph(t, items.wave, W, H));
    g.push(...items.texts.map((it) => drawtext(it, tmp)));
    const input = m ? mediaInput(m, 1, { at: frameTime(m) }) : ['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:d=1`];
    const part = outFile + '.part.jpg';
    for (const q of [2, 4, 6, 9]) {
      await run([...input, '-filter_complex', `${g.join(',')},format=yuvj420p`, '-frames:v', '1', '-q:v', String(q), part]);
      if (fs.statSync(part).size <= 1.95e6) break;
    }
    fs.renameSync(part, outFile);
    return { width: W, height: H, brand, media: m?.id || null };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/**
 * Vidéo MP4 (720p, 1080p ou 4K) : fond (visuel généré fixe, ou animation importée bouclée par ffmpeg) + textes placés selon
 * la mise en page + spectre CQT animé avec reflet (facultatif sur une animation) + chapitre courant + barre de progression.
 * Efficace pour 4 h : textes fixes calculés une fois (PNG) ; animation lue en boucle (-stream_loop) et réduite à l'image/s de
 * sortie avant la mise à l'échelle ; spectre calculé en ≤ 1920 px puis agrandi ; 24 i/s jusqu'à 1 h puis 15 (4K : 15 puis 12).
 * frameAt (s) : n'écrit qu'une image PNG à cet instant (aperçu exact du rendu, pour l'éditeur).
 */
export async function makeVideo(t, audioFile, outFile, onProgress, { resolution = DEFAULT_RESOLUTION, brand = brandText(), design, lang = 'fr', frameAt = null, exec = null } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'st-video-'));
  let pinned = null;
  try {
    if (!fs.existsSync(audioFile)) { const e = new Error(`Audio introuvable : ${path.basename(audioFile)}`); e.code = 'AUDIO_MISSING'; throw e; }
    const job = await prepareVideo(t, audioFile, tmp, { resolution, brand, design, lang, frameAt });
    // v1.21.2 : l'audio est « épinglé » tout de suite dans le dossier du job (lien physique, sinon copie). Avant, il n'était lié
    // qu'au moment où un emplacement de rendu se libérait (parfois des minutes plus tard, file de 10+ vidéos de morceaux) ;
    // si le morceau avait été renommé entre-temps (titre FR/EN, migration des noms), le lien pointait dans le vide →
    // « ffmpeg code 254 : Error opening input file audio.wav: No such file or directory ».
    // Lien physique à côté de l'audio (même volume : pas de copie de plusieurs Go dans /tmp), supprimé à la fin.
    { const a = job.info.audioName, pin = path.join(path.dirname(audioFile), `.pin-${process.pid}-${Date.now().toString(36)}${path.extname(audioFile)}`);
      try { fs.linkSync(audioFile, pin); pinned = pin; job.files[a] = pin; } catch { /* volume sans liens physiques : chemin d'origine */ } }
    if (frameAt != null) { // aperçu : une image, toujours sur le CT
      materialize(tmp, job.files);
      await run([...job.spec.inputs, '-filter_complex', job.spec.graph, '-map', '[v]', '-ss', job.frameSs, '-frames:v', '1', path.resolve(outFile)], { cwd: tmp });
      return job.info;
    }
    const r = await (exec || localExec)({ ...job, dir: tmp, outFile, onProgress });
    return { ...job.info, encoder: r?.encoder || 'libx264', node: r?.node || null };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); if (pinned) fs.rmSync(pinned, { force: true }); }
}

/** Copie / lie les fichiers du job dans son dossier (noms relatifs du spec). */
export function materialize(dir, files) {
  for (const [name, src] of Object.entries(files)) {
    const dst = path.join(dir, name); if (path.resolve(src) === path.resolve(dst) || fs.existsSync(dst)) continue;
    if (!fs.existsSync(src)) throw new Error(`Fichier du rendu introuvable : ${name} (${path.basename(src)})`); // jamais de lien symbolique cassé
    try { fs.symlinkSync(path.resolve(src), dst); } catch { fs.copyFileSync(src, dst); }
  }
}
/** Exécution locale (CT, libx264) : même spec et même filtergraph que sur un nœud de rendu. */
export async function localExec({ spec, files, dir, outFile, onProgress }) {
  materialize(dir, files);
  const part = path.resolve(outFile + '.part.mp4');
  const R = runFfmpeg(config.ffmpegPath, buildArgs({ ...spec, preset: process.env.SOUNDTUBE_X264_PRESET || spec.preset }, 'libx264', part), { cwd: dir, total: spec.dur, onProgress: onProgress || null });
  run.last = R.proc; await R.done;
  fs.renameSync(part, outFile);
  return { encoder: 'libx264', node: null };
}

/**
 * Prépare un rendu portable dans tmp : fond / textes fixes (PNG), polices et fichiers texte des chapitres, et un spec
 * { inputs, graph, … } qui ne cite que des noms relatifs. files : nom → chemin source (audio, animation, PNG, polices, textes).
 */
export async function prepareVideo(t, audioFile, tmp, { resolution = DEFAULT_RESOLUTION, brand = brandText(), design, lang = 'fr', frameAt = null, audioSize = null } = {}) {
  const res = resolutionOf(resolution) || DEFAULT_RESOLUTION, R = RESOLUTIONS[res], W = R.w, H = R.h;
  const files = {}, add = (name, src) => { files[name] = src; return name; };
  const D = normalizeDesign(design), th = themeOf(t.style), dur = t.duration || 60, m = resolveMedia(D);
  const fps = dur > 3600 ? R.fps[1] : R.fps[0];
  const data = textData(t, brand, lang), items = computeItems(D.layout.video, 'video', { ...data, chapter: '' }, { W, H, theme: th });
  const spectrum = items.spectrum && (!m || D.background.overlay) ? items.spectrum : null;
  const off = frameAt != null ? Math.max(0, Math.min(dur - 1, frameAt) - 0.5) : 0; // aperçu : 0,5 s d'élan pour le spectre
  {
    const inputs = [], graph = [];
    const audio = add('audio' + (path.extname(audioFile).toLowerCase() || '.wav'), audioFile);
    if (m) {
      const med = add('media' + (path.extname(m.path).toLowerCase() || '.bin'), m.path);
      inputs.push(...mediaInput({ ...m, path: med }, fps), '-i', audio);
      // aperçu : l'animation reprend à la même phase de boucle qu'à l'instant off de la vidéo (t mod durée)
      const lead = off && m.kind !== 'image' && m.duration > 0 ? `trim=start=${(off % m.duration).toFixed(3)},setpts=PTS-STARTPTS,` : '';
      graph.push(`[0:v]${lead}fps=${fps},${fitChain(W, H, D.background.fit, th.c0, D.background.dim)},format=yuv420p[m0]`);
      if (items.texts.length) { // textes fixes : un PNG transparent calculé une fois, superposé à l'animation
        const tx = path.join(tmp, 'texts.png');
        await run(['-f', 'lavfi', '-i', `color=c=black@0.0:s=${W}x${H}:d=1,format=rgba`, '-vf', items.texts.map((it) => drawtext(it, tmp)).join(','), '-frames:v', '1', tx]);
        inputs.push('-i', add('texts.png', tx));
        graph.push(`[2:v]format=rgba,loop=loop=-1:size=1:start=0,fps=${fps}[tx]`, `[m0][tx]overlay=0:0:format=yuv420:shortest=0[bg]`);
      } else graph.push('[m0]null[bg]');
    } else {
      const bg = path.join(tmp, 'bg.png');
      await run(['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:d=1`, '-filter_complex', [gradient(th, W, H), ...items.texts.map((it) => drawtext(it, tmp))].join(','), '-frames:v', '1', bg]);
      inputs.push('-i', add('bg.png', bg), '-i', audio);
      graph.push(`[0:v]format=yuv420p,loop=loop=-1:size=1:start=0,fps=${fps}[bg]`);
    }
    if (frameAt != null) inputs.splice(inputs.indexOf(audio) - 1, 0, '-ss', off.toFixed(2));
    if (spectrum) {
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(spectrum.color.slice(i, i + 2), 16) / 255);
      const cw = Math.min(W, +process.env.SOUNDTUBE_CQT_MAXW || R.cqtW || 1280), cqH = 2 * Math.round(105 * cw / 1280), up = cw < W ? `,scale=${W}:-2:flags=bilinear` : ''; // showcqt : hauteur paire ; spectre calculé en 1280 px (1080p) ou 1920 px (4K) puis agrandi
      graph.push(`[1:a]aformat=channel_layouts=stereo,showcqt=s=${cw}x${cqH}:r=${fps}:bar_h=${cqH}:sono_h=0:axis=0:bar_g=2:bar_v=10:count=2:cscheme=1|1|1|1|1|1,format=rgba,colorkey=black:0.06:0.25,colorchannelmixer=rr=${r.toFixed(3)}:gg=${g.toFixed(3)}:bb=${b.toFixed(3)},split[a][b]`,
        `[b]vflip,colorchannelmixer=aa=0.3,crop=${cw}:${2 * Math.round(45 * cw / 1280)}:0:0[r]`, `[a][r]vstack${up}[w]`,
        `[bg][w]overlay=0:${spectrum.top}:shortest=1:format=yuv420[v1]`);
    } else graph.push('[bg]null[v1]');
    // chapitre courant : même élément de mise en page, un drawtext par chapitre
    const ch = chaptersOf(t, lang).slice(0, 80), T = off ? `(t+${off.toFixed(2)})` : 't';
    const chText = ch.map((c, i) => {
      const it = computeItems(D.layout.video, 'video', { chapter: c.short || c.label }, { W, H, theme: th }).texts.find((x) => x.id === 'chapter');
      if (it) add(FONT_REL[it.font] || FONT_REL.sans, FONTS[it.font] || FONT);
      return it ? drawtext(it, tmp, `between(${T},${c.start.toFixed(2)},${(ch[i + 1]?.start ?? dur + 10).toFixed(2)})`, true) : null;
    }).filter(Boolean).join(',');
    for (const f of fs.readdirSync(tmp)) if (/^tx\d+\.txt$/.test(f) && chText.includes(`'${f}'`)) add(f, path.join(tmp, f));
    const pbH = Math.max(2, Math.round(6 * H / 720));
    graph.push(`color=c=0x${th.accent}:s=${W}x${pbH}:r=${fps}[pb]`, `[v1][pb]overlay=x='-W+W*${T}/${dur.toFixed(2)}':y=${H - pbH}:eval=frame${chText ? ',' + chText : ''},format=yuv420p[v]`);
    const info = { fps, resolution: res, width: W, height: H, brand, media: m?.id || null };
    const spec = { v: SPEC_VERSION, dur, fps, res, crf: R.crf, preset: R.preset, x264Params: res === '2160p' ? 'rc-lookahead=10' : null, inputs, graph: graph.join(';'), audioIndex: 1,
      metadata: { title: data.title || t.title, artist: brand && brand !== DEFAULT_BRAND ? brand : config.artist } };
    spec.files = Object.entries(files).map(([name, src]) => ({ name, size: name === audio && audioSize != null ? audioSize : fs.statSync(src).size })); // v1.16.0 : audio encore sur le PC (enchaînement)
    info.audioName = audio;
    return { spec, files, info, frameSs: frameAt != null ? (frameAt - off).toFixed(2) : null };
  }
}



/** v1.21.2 : fichier audio réellement présent d'un morceau (WAV puis MP3) ; répare `files` si un renommage l'a désynchronisé. */
export function audioOf(store, tracksDir, id) {
  const t = store.get(id); if (!t) return null;
  const dir = path.join(tracksDir, id), ok = (f) => f && fs.existsSync(path.join(dir, f));
  if (ok(t.files?.wav)) return t.files.wav;
  try { const f = syncFiles(tracksDir, t); if (f) { store.update(id, { files: f }); if (ok(f.wav)) return f.wav; if (ok(f.mp3)) return f.mp3; } } catch {}
  if (ok(t.files?.mp3)) return t.files.mp3;
  try { const any = fs.readdirSync(dir).filter((f) => /\.(wav|mp3)$/i.test(f) && !/\.part|^\./.test(f)).sort((a, b) => (/\.wav$/i.test(b) ? 1 : 0) - (/\.wav$/i.test(a) ? 1 : 0)); return any[0] || null; } catch { return null; }
}

/**
 * File d'attente des vidéos ; état en mémoire. Les vidéos partent en parallèle sur les nœuds de rendu du réseau local
 * (RenderNodes : PC NVENC d'abord), le CT servant de secours. Sans nœud configuré : une vidéo à la fois sur le CT, comme avant.
 */
export class VideoQueue {
  constructor(store, tracksDir, nodes = null) { this.store = store; this.tracksDir = tracksDir; this.nodes = nodes || new RenderNodes({ autostart: false }); this.state = new Map(); this.q = []; }
  status(id) { return this.state.get(id) || null; }
  enqueue(id, { resolution = DEFAULT_RESOLUTION, brand = brandText(), design = null, key = null, lang = 'fr' } = {}) {
    const s = this.state.get(id); if (s && (s.status === 'queued' || s.status === 'running')) return s;
    const st = { status: 'queued', progress: 0, error: null, resolution: resolutionOf(resolution) || DEFAULT_RESOLUTION, brand, design, key, lang }; this.state.set(id, st); this.q.push(id); this.pump(); return st;
  }
  get running() { return [...this.state.values()].filter((s) => s.status === 'running').length; }
  pump() { while (this.q.length) this.runOne(this.q.shift()); } // chaque vidéo attend son emplacement (nœud ou CT) dans l'ordre d'arrivée
  async runOne(id) {
    const st = this.state.get(id);
    try {
      const t = this.store.get(id); if (!t) throw new Error('Morceau introuvable');
      const dir = path.join(this.tracksDir, id), N = fileNames(t);
      const src = audioOf(this.store, this.tracksDir, id); if (!src) throw new Error('Aucun fichier audio');
      let t0 = Date.now(), where = null;
      const exec = (job) => this.nodes.run({ ...job, title: t.title, trackId: id }, localExec, { onSlot: (w) => { where = w; t0 = Date.now(); Object.assign(st, { status: 'running', progress: 0, node: w.name, nodeUrl: w.node, encoder: w.encoder, retry: w.retry ? w.lastError : (st.fallback || null) }); } });
      const r = await makeVideo(this.store.get(id) || t, path.join(dir, src), path.join(dir, N.mp4), (p) => { st.progress = p; st.eta = p > 0.01 ? (Date.now() - t0) / 1000 * (1 - p) / p : null; }, { resolution: st.resolution, brand: st.brand, design: st.design, lang: st.lang, exec });
      this.finish(id, st, t, r, t0, where);
    } catch (e) { console.error('[vidéo]', id, e.message); Object.assign(st, { status: 'error', error: String(e.message).slice(0, 500) }); }
  }
  finish(id, st, t, r, t0, where) {
    const dir = path.join(this.tracksDir, id), N = fileNames(t);
    const { fps, resolution } = r;
    const now = this.store.get(id) || t;
    if (!fs.existsSync(path.join(dir, N.mp4))) throw new Error('Vidéo absente');
    let mp4 = N.mp4; const want = fileNames(now).mp4; if (want !== mp4) { fs.renameSync(path.join(dir, mp4), path.join(dir, want)); mp4 = want; }
    this.store.update(id, { files: { ...(now.files || {}), mp4 }, meta: { ...(now.meta || {}), youtube: { ...(now.meta?.youtube || {}), videoTitle: t.title, videoTitleEn: titleEnOf(t), videoBrand: st.brand, videoKey: st.key, videoLang: st.lang, videoMedia: st.design?.background?.media || null, videoAt: new Date().toISOString(), videoFps: fps, videoResolution: resolution, videoMs: Date.now() - t0, videoEncoder: r.encoder || 'libx264', videoNode: r.nodeName || where?.name || 'CT (local)' } } });
    Object.assign(st, { status: 'done', progress: 1, eta: 0, encoder: r.encoder || st.encoder, node: r.nodeName || st.node });
  }
  /**
   * v1.16.0 — option « musique + vidéo sur le PC Windows » : la musique vient d'être rendue sur le nœud ; la vidéo part tout
   * de suite sur le même nœud, à partir du WAV resté sur le PC (aucun envoi depuis le CT). Retourne une promesse résolue dès
   * que le job vidéo est lancé (ou a échoué). En cas de panne : reprise par la file vidéo habituelle (autre nœud ou CT)
   * quand le WAV est arrivé sur le CT ; la vidéo est écrite en .part puis renommée (jamais de fichier à moitié écrit).
   */
  chain(id, opts, { node, audioJobId, result, audioSize, waitTrack }) {
    const cur = this.state.get(id); if (cur && (cur.status === 'queued' || cur.status === 'running')) return Promise.resolve(false);
    const st = { status: 'running', progress: 0, error: null, resolution: resolutionOf(opts.resolution) || DEFAULT_RESOLUTION, brand: opts.brand, design: opts.design, key: opts.key, lang: opts.lang || 'fr', node: this.nodes.nameOf(node), nodeUrl: node.url, encoder: this.nodes.st(node.id).health?.best || null, chained: true };
    this.state.set(id, st);
    let created; const ready = new Promise((r) => { created = r; });
    (async () => {
      const t = this.store.get(id); if (!t) throw new Error('Morceau introuvable');
      const pseudo = { ...t, params: result.params, duration: result.seconds, meta: { ...(t.meta || {}), ...result.meta } };
      const dir = path.join(this.tracksDir, id), N = fileNames(t), t0 = Date.now(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'st-video-'));
      try {
        const job = await prepareVideo(pseudo, path.join(dir, 'audio.wav'), tmp, { resolution: st.resolution, brand: st.brand, design: st.design, lang: st.lang, audioSize });
        const outFile = path.join(dir, N.mp4);
        const r = await this.nodes.remoteExec(node, { ...job, dir: tmp, outFile, audioFrom: { job: audioJobId, as: job.info.audioName },
          onStage: (s) => { if (s === 'encode') created(true); }, onProgress: (p) => { st.progress = p; st.eta = p > 0.01 ? (Date.now() - t0) / 1000 * (1 - p) / p : null; } });
        this.nodes.record({ kind: 'video', node: node.id, nodeName: this.nodes.nameOf(node), title: t.title, trackId: id, status: 'done', ms: Date.now() - t0, encoder: r.encoder || null, note: 'enchaînée après la musique (option combinée)' });
        const st2 = this.nodes.st(node.id); st2.jobs++; st2.lastJob = Date.now();
        await waitTrack(); // le morceau doit être « terminé » avant d'y rattacher la vidéo
        this.finish(id, st, t, { ...job.info, ...r }, t0, { name: r.nodeName });
      } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    })().catch(async (e) => {
      created(false);
      console.error('[vidéo enchaînée]', id, e.message);
      this.nodes.record({ kind: 'video', node: node.id, nodeName: this.nodes.nameOf(node), title: this.store.get(id)?.title || '', trackId: id, status: 'error', note: String(e.message).slice(0, 160) });
      if (!/introuvable/.test(e.message)) this.nodes.markFailed(node, e);
      // reprise : file vidéo habituelle dès que le WAV / MP3 est sur le CT
      Object.assign(st, { progress: 0, fallback: `vidéo reprise après panne du PC « ${this.nodes.nameOf(node)} » : ${String(e.message).slice(0, 120)}` });
      try { await waitTrack(); await this.runOne(id); } catch (e2) { Object.assign(st, { status: 'error', error: String(e2.message).slice(0, 500) }); }
    });
    return ready;
  }
}

const NOTE_EN = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const keyEn = (P) => `${NOTE_EN[['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(P.key)] ?? P.key} ${SCALE_EN[P.scale] || P.scale || ''}`.trim();
/** Title (≤ 100), description (≤ 5000) and tags (≤ 500 chars) in English — same structure as the French version. */
export function youtubeInfoEn(t, brand = brandText()) {
  const P = t.params || {}, S = STYLES[t.style] || {}, SE = STYLE_EN[t.style] || { label: S.label, tagline: '', genre: '' };
  const U0 = USAGE_EN[t.style] || { titre: SE.label, usages: 'listening', tags: [] }, US = USAGE_SUB_EN[`${t.style}_${P.hiphopStyle || P.dnbStyle || P.lofiStyle || ''}`];
  const U = US ? { ...U0, ...US, tags: [...US.tags, ...U0.tags.filter((x) => !US.tags.includes(x))].slice(0, 8) } : U0;
  const L = t.meta?.loudness, dur = t.duration || P.duration || 0, chapters = chaptersOf(t, 'en'), name = titleEnOf(t);
  const dw = dur >= 600 ? ` (${durWordsEn(dur)})` : '';
  let title = `${name} · ${U.titre}${dw}`;
  if (title.length > 100) title = `${name} · ${SE.label}${dw}`.slice(0, 100);
  const lines = [`${name} — ${SE.label} instrumental, ${durWordsEn(dur)}${dur >= 600 ? ' non-stop' : ''}.`, t.meta?.ai?.description_en || SE.tagline, '', `🎧 Perfect for: ${U.usages}.`, ''];
  const mood = MOODS[P.mood], ambId = P.adv?.ambience === 'none' ? null : (P.adv?.ambience || mood?.ambience || null);
  if ((mood && P.mood !== 'auto') || ambId) {
    lines.splice(lines.length - 1, 0, `🌙 Mood: ${mood && P.mood !== 'auto' ? MOOD_EN[P.mood] || mood.label.toLowerCase() : 'style default'}${ambId ? ` · background sound: ${AMB_EN[ambId] || ambId} (synthesized)` : ''}.`);
  }
  if (chapters.length) { lines.push('⏱️ Chapters'); for (const c of chapters) lines.push(`${c.time} ${c.label}`); lines.push(''); }
  const SF = t.meta?.splitFrom; if (SF) lines.push(`🔗 From the mix “${SF.titleEn || translateTitle(SF.title) || SF.title}”: track ${SF.n}/${SF.of} (${fmtTime(SF.start)} – ${fmtTime(SF.end)} in the full mix).`, '');
  const MX = t.meta?.mix;
  if (MX?.count > 1) lines.push(`🎚️ Continuous DJ mix of ${MX.count} original tracks (tempo-synced transitions, Camelot harmonic mixing) · Tempo ${MX.bpmMin}–${MX.bpmMax} BPM · Time signature ${t.meta?.meter || '4/4'} · Length ${fmtTime(dur)}`);
  else lines.push(`🎼 Tempo ${Math.round(P.bpm)} BPM · Key ${keyEn(P)} · Time signature ${t.meta?.meter || '4/4'} · Length ${fmtTime(dur)}`);
  if (L) lines.push(`🔊 Mastered to YouTube standards: ${L.integrated} LUFS integrated, ${L.truePeak} dBTP true peak.`);
  lines.push('', `ℹ️ Original instrumental music (no vocals), composed, arranged and mixed by algorithm${brand === DEFAULT_BRAND ? ` with soundtube${config.artist && config.artist !== 'soundtube' ? ` for ${config.artist}` : ''}` : brand ? ` for ${brand}` : ''}. Synthesized sounds and free samples.`);
  for (const c of sampleCredits(t, 'en')) lines.push(c);
  const hashtags = ['#' + (SE.label || t.style).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ''), '#instrumentalmusic', '#nolyrics'];
  lines.push('', hashtags.join(' '));
  const description = lines.join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 5000);
  const tagList = [...(t.meta?.ai?.tags || []), ...U.tags, ...(AMB_TAGS_EN[ambId] || []), SE.label, (SE.genre || '').split(' & ')[0], 'instrumental music', 'no lyrics', ...(dur >= 600 ? [`${durWordsEn(dur)} of music`] : []), `${Math.round(P.bpm)} bpm`, 'original music', brand]
    .filter(Boolean).map((x) => x.toLowerCase().replace(/[<>,]/g, ''));
  const tags = []; let len = 0;
  for (const x of [...new Set(tagList)]) { if (len + x.length + 1 > 480) break; tags.push(x); len += x.length + 1; }
  return { title, description, tags, chapters, hashtags, lang: 'en' };
}
