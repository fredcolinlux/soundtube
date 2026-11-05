// Serveur HTTP soundtube : API REST + interface web statique.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { openStore } from './db.js';
import { JobQueue } from './jobs.js';
import { openapi } from './openapi.js';
import { makeTitle, makeTitleEn, translateTitle, titleEnOf } from './titles.js';
import { syncFiles } from './naming.js';
import { retagTrack, VERSION } from './tracktags.js';
import { signature, findSimilar } from './duplicates.js';
import os from 'node:os';
import { youtubeInfo, textData, themeOf, makeThumbnail, makeVideo, makeBase, VideoQueue, RESOLUTIONS, DEFAULT_RESOLUTION, resolutionOf } from './youtube.js';
import { getStyleAnimation, getStyleAnimations, setStyleAnimation, getDesign, setDesign, designOf, defaultDesign, normalizeDesign, thumbKey, videoKey, getLang, setLang } from './design.js';
import { listMedia, getMedia, removeMedia, saveUpload, ACCEPT } from './media.js';
import { fileNames, slugify } from './naming.js';
import { splitPlan, splitAvailability, zipEntries, zipStream, SPLIT_MODES, SPLIT_MIN_SECONDS, pieceBase, crc32 } from './split.js';
import { SplitQueue, readManifest, splitDir, splitOptions } from './splitqueue.js';
import { RenderNodes } from './nodes.js';
import { ensureSamples, ensureVerified } from './nodeaudio.js';
import { getBrand, setBrand, brandText, DEFAULT_BRAND, BRAND_MAX } from './brand.js';
import { resolveParams, LIMITS, ADVANCED } from './engine/composer.js';
import { samplesAvailable } from './engine/sampler.js';
import { STYLES, MOODS, INSTRUMENTS, VARIANT_KEY, styleDef } from './engine/styles.js';
import { styleDefaults18 } from './engine/flavor.js';
import { resolveAdvancedDefaults } from './engine/advdefaults.js';
import { suggest as aiSuggest, cleanText, cleanTags, buildPrompt, ollamaJson, validateSuggestion } from './ai.js';
import * as trends from './trends.js';
import * as director from './director.js';
import { stylesDoc } from './stylesdoc.js';
import { SCALES, NOTE_NAMES, NOTE_NAMES_FR } from './engine/theory.js';
import { Channels, PublishQueue, mockTransport, liveTransport, DEFAULT_PROFILE, VISIBILITIES, VIS_LABEL, CONFIRM_WORD } from './publish.js';
import { buildPack, packOptions, readPack, packSplit } from './pack.js';
import { fmtTime } from './youtube.js';

const store = openStore(config.dataDir);
const tracksDir = path.join(config.dataDir, 'tracks');
const renderNodes = new RenderNodes({ dataDir: config.dataDir, localSlots: config.localVideoSlots });
const jobs = new JobQueue(store, tracksDir, renderNodes); // v1.16.0 : la musique peut aussi partir sur un PC de rendu
const videos = new VideoQueue(store, tracksDir, renderNodes);
renderNodes.onChange(() => jobs.pump());
/** (Re)crée la miniature d'un morceau terminé. */
async function refreshThumb(t, resolution) {
  if (!jobs.hasFfmpeg || t.status !== 'done') return t;
  const name = fileNames(t).thumb, dir = path.join(tracksDir, t.id);
  if (t.files?.thumb && t.files.thumb !== name) fs.rmSync(path.join(dir, t.files.thumb), { force: true });
  const thumbResolution = resolutionOf(resolution) || t.meta?.youtube?.thumbResolution || '720p';
  const brand = brandText(), design = designOf(t), lang = getLang();
  await makeThumbnail(t, path.join(dir, name), thumbResolution, { brand, design, lang });
  const now = store.get(t.id) || t;
  store.update(t.id, { files: { ...(now.files || {}), thumb: name }, meta: { ...(now.meta || {}), youtube: { ...(now.meta?.youtube || {}), thumbTitle: t.title, thumbResolution, thumbBrand: brand, thumbKey: thumbKey(design, brand, lang), thumbLang: lang } } });
  return store.get(t.id);
}
const splits = new SplitQueue({ store, tracksDir, hasFfmpeg: jobs.hasFfmpeg, brand: () => brandText(), onAdded: (t) => (jobs.hasFfmpeg ? refreshThumb(t) : null), onDone: (t, M, st) => (t && st.video ? enqueuePieceVideos(t, { resolution: st.video, lang: st.lang }) : null) });

/* ---------- vidéos par morceau (découpage → une vidéo YouTube par morceau) ---------- */
const pieceIds = (t) => (readManifest(tracksDir, t.id)?.library || []).filter((id) => store.get(id)?.status === 'done');
function saveManifest(id, patch) {
  const file = path.join(splitDir(tracksDir, id), 'manifest.json'), M = readManifest(tracksDir, id); if (!M) return null;
  Object.assign(M, patch); fs.writeFileSync(file, JSON.stringify(M)); return M;
}
/** v1.14.0 : un morceau découpé reprend le visuel du mix (réglage propre au mix, sinon l'animation choisie à la génération). */
function inheritLook(t, id) {
  let p = store.get(id); const own = t.meta?.youtube?.design || null, anim = t.meta?.animation || null;
  if (own && JSON.stringify(p.meta?.youtube?.design || null) !== JSON.stringify(own)) { store.update(id, { meta: { ...p.meta, youtube: { ...(p.meta?.youtube || {}), design: own } } }); p = store.get(id); }
  else if (!own && anim && !p.meta?.youtube?.design && JSON.stringify(p.meta?.animation || null) !== JSON.stringify(anim)) { store.update(id, { meta: { ...p.meta, animation: anim } }); p = store.get(id); }
  return p;
}
/** Met en file une vidéo par morceau (animation, mise en page et langue du mix repris par chaque morceau) ; ne refait pas une vidéo déjà à jour. */
function enqueuePieceVideos(t, { resolution, lang }) {
  const ids = pieceIds(t); if (!ids.length) { const e = new Error('Aucun morceau dans la bibliothèque : découpez d’abord avec « Ajouter à la bibliothèque ».'); e.status = 409; throw e; }
  const L = lang === 'en' ? 'en' : 'fr', brand = brandText(), own = t.meta?.youtube?.design || null;
  for (const id of ids) {
    const p = inheritLook(t, id);
    const D = designOf(p), key = videoKey(D, brand, L), y = p.meta?.youtube || {};
    if (p.files?.mp4 && y.videoKey === key && y.videoLang === L && y.videoResolution === resolution && y.videoTitle === p.title && y.videoBrand === brand) continue;
    videos.enqueue(id, { resolution, brand, design: D, key, lang: L });
  }
  saveManifest(t.id, { videos: { resolution, lang: L, at: new Date().toISOString() } });
  // miniatures des morceaux dans la même langue / mise en page (en tâche de fond, une à la fois)
  (async () => { for (const id of ids) { const p = store.get(id); if (p && jobs.hasFfmpeg && (!p.files?.thumb || p.meta?.youtube?.thumbKey !== thumbKey(designOf(p), brand, L))) { try { await refreshThumb(p); } catch (e) { console.error('[miniature morceau]', id, e.message); } } } })();
}
function splitVideosPayload(t) {
  const M = readManifest(tracksDir, t.id), ids = pieceIds(t); if (!M || !ids.length) return null;
  const items = ids.map((id) => {
    const p = store.get(id), v = videos.status(id), y = p.meta?.youtube || {}, has = !!p.files?.mp4;
    const status = v && v.status !== 'done' ? v.status : has ? 'done' : 'none';
    return { id, n: p.meta?.splitFrom?.n ?? null, title: p.title, title_en: titleEnOf(p), duration: p.duration, status, progress: status === 'done' ? 1 : v?.progress || 0, eta: v?.eta ?? null, error: v?.error || null,
      resolution: has ? y.videoResolution || null : null, lang: has ? y.videoLang || 'fr' : null,
      video: has ? `/api/tracks/${id}/video.mp4` : null, thumb: p.files?.thumb ? `/api/tracks/${id}/thumb.jpg?v=${encodeURIComponent(y.thumbKey || y.thumbTitle || '')}` : null };
  }).sort((a, b) => (a.n || 0) - (b.n || 0));
  const ready = items.filter((x) => x.status === 'done').length;
  return { request: M.videos || null, items, ready, total: items.length, running: items.some((x) => x.status === 'queued' || x.status === 'running'), zip: ready ? `/api/tracks/${t.id}/split/videos.zip` : null };
}
const crcCache = new Map();
async function crcFile(file) {
  const st = fs.statSync(file), k = `${file}|${st.size}|${st.mtimeMs}`; if (crcCache.has(k)) return { crc: crcCache.get(k), size: st.size };
  let c = 0; for await (const b of fs.createReadStream(file, { highWaterMark: 1 << 20 })) c = crc32(b, c);
  crcCache.set(k, c); return { crc: c, size: st.size };
}
/** Entrées du ZIP des vidéos : « NN - Titre.mp4 », sa miniature et un texte FR + EN (titre, description, tags) à coller dans YouTube. */
async function videoZipEntries(t, lang) {
  const P = splitVideosPayload(t); if (!P?.ready) return null;
  const brand = brandText(), out = [], of = P.total;
  for (const x of P.items) {
    if (x.status !== 'done') continue; const p = store.get(x.id), base = pieceBase(x.n || 0, of, lang === 'en' ? x.title_en : x.title), dir = path.join(tracksDir, p.id);
    for (const [kind, ext] of [['mp4', 'mp4'], ['thumb', 'jpg']]) if (p.files?.[kind]) { const file = path.join(dir, p.files[kind]); if (fs.existsSync(file)) out.push({ name: `${base}.${ext}`, path: file, ...(await crcFile(file)) }); }
    const txt = ['fr', 'en'].map((L) => { const I = youtubeInfo(p, brand, L); return `=== ${L === 'en' ? 'English' : 'Français'} ===\n\n${L === 'en' ? 'Title' : 'Titre'} :\n${I.title}\n\nDescription :\n${I.description}\n\nTags :\n${I.tags.join(', ')}\n`; }).join('\n');
    const data = Buffer.from(txt, 'utf8'); out.push({ name: `${base} - YouTube.txt`, data, size: data.length, crc: crc32(data) });
  }
  return out;
}
jobs.onDone = async (t) => {
  await refreshThumb(t).catch((e) => console.error('[miniature]', t.id, e.message));
  try { publisher.onTrackDone(store.get(t.id)); } catch (e) { console.error('[auto-publication]', t.id, channels.scrub(e.message)); } // v1.13.0 : uniquement si le style a l'auto-publication activée
  // option « Découper en morceaux individuels » choisie à la génération
  const A = t.meta?.autoSplit; if (A && splitAvailability(t).ok) { try { splits.enqueue(t.id, splitOptions(A, { hasFfmpeg: jobs.hasFfmpeg, lang: getLang() })); } catch (e) { console.error('[découpe auto]', t.id, e.message); } }
  // v1.14.0 : paquet ZIP coché dans le formulaire → construit automatiquement à la fin du rendu
  const K = t.meta?.autoPack; if (K) { try { startPack(store.get(t.id), packOptions({ ...K, lang: K.lang || getLang() })); } catch (e) { console.error('[paquet auto]', t.id, e.message); } }
};
/** v1.16.0 : attend la fin du rendu musical d'un morceau (statut « done »). */
async function waitTrackDone(id) {
  for (;;) { const t = store.get(id); if (!t) throw new Error('Morceau introuvable'); if (t.status === 'done') return t; if (t.status === 'error') throw new Error('rendu musical en erreur'); await new Promise((r) => setTimeout(r, 300)); }
}
// v1.16.0 : option combinée — dès que la musique existe sur le PC, la vidéo longue y part (même nœud, sans attendre le CT)
jobs.onAudioReady = async (t, info) => {
  if (!t?.meta?.pcCombo || !jobs.hasFfmpeg || !info.files?.wav) return false;
  const D = designOf(t), brand = brandText(), lang = getLang(), key = videoKey(D, brand, lang), resolution = t.meta.autoPack?.videoRes || t.meta?.youtube?.videoResolution || DEFAULT_RESOLUTION;
  return videos.chain(t.id, { resolution, brand, design: D, key, lang }, { node: info.node, audioJobId: info.jobId, result: info.result, audioSize: info.files.wav.size, waitTrack: () => waitTrackDone(t.id) });
};
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

// Rattrapage des dates de création manquantes (anciens morceaux) : date de modification des fichiers
for (const r of store.missingDates?.() || []) {
  let d = r.finished_at || null;
  try { const dir = path.join(tracksDir, r.id); const m = fs.readdirSync(dir).map((f) => fs.statSync(path.join(dir, f)).mtimeMs); if (m.length) d = new Date(Math.min(...m)).toISOString(); } catch {}
  store.update(r.id, { created_at: d || new Date().toISOString() });
}

// Migration des noms de fichiers (track.wav… → <titre>_<style>_<date>.wav) et alignement sur le titre
{ let n = 0; for (const t of store.list({ status: 'done', limit: 1e6 }).items) { try { const f = syncFiles(tracksDir, t); if (f) { store.update(t.id, { files: f }); n++; } } catch (e) { console.error('[noms]', t.id, e.message); } }
  if (n) console.log(`[soundtube] ${n} morceau(x) : fichiers renommés`); }

// Reprise des tâches interrompues (redémarrage du service)
for (const st of ['running', 'queued']) {
  for (const t of store.list({ status: st, limit: 1000 }).items.reverse()) { store.update(t.id, { status: 'queued', progress: 0, stage: 'En attente' }); jobs.enqueue(t.id); }
}

const URLNAME = { mid: 'track.mid', midzip: 'midi.zip', mp4: 'video.mp4', thumb: 'thumb.jpg', wav: 'audio.wav', mp3: 'audio.mp3' };
const fileUrl = (t, f) => `/api/tracks/${t.id}/${URLNAME[f] || f}`;
/** Réglages réutilisables (POST /api/generate les accepte tels quels : même graine = même morceau). */
export function settingsOf(p = {}) {
  return { style: p.style, seed: p.seed, variation: p.variation || 0, mood: p.mood, key: p.key, scale: p.scale, bpm: p.bpm, duration: p.duration,
    instruments: p.instruments, wav: p.wav !== false, adv: p.adv || {}, engine: p.engine || 17, ...(p.harmonyFix ? { harmonyFix: true } : {}), ...(p.aiPlan ? { aiPlan: p.aiPlan.map(({ from, to, ...x }) => ({ share: +(to - from).toFixed(4), ...x })) } : {}) };
}
function libraryIndex() { return store.list({ limit: 1e6 }).items.filter((x) => x.status !== 'error'); }
function present(t, lib = null) {
  if (!t) return null;
  const urls = {};
  for (const f of Object.keys(t.files || {})) urls[f] = fileUrl(t, f);
  const duplicates = t.params ? findSimilar(signature(t.params, t.meta), lib || libraryIndex(), t.id, 3) : [];
  // v1.12.0 : lien entre un ancien morceau et sa version régénérée (harmonie juste)
  const L = lib || libraryIndex();
  const rg = t.meta?.regenOf ? L.find((x) => x.id === t.meta.regenOf) || store.get(t.meta.regenOf) : null;
  const regen_of = t.meta?.regenOf ? { id: t.meta.regenOf, title: rg?.title || null, version: t.meta.regenVersion || '1.12.0' } : null;
  const regenerations = L.filter((x) => x.meta?.regenOf === t.id).map((x) => ({ id: x.id, title: x.title, status: x.status }));
  const pair = new Set([t.meta?.regenOf, ...regenerations.map((x) => x.id)].filter(Boolean)); // une version régénérée n'est pas un doublon
  return { ...t, title_en: titleEnOf(t), urls, settings: settingsOf(t.params), duplicates: duplicates.filter((d) => !pair.has(d.id ?? d)), regen_of, regenerations, regen_ok: regenCheck(t).ok, queue_position: t.status === 'queued' ? jobs.queue.indexOf(t.id) + 1 : 0 };
}

function createJob(input, parentId = null, extraMeta = null) {
  if (jobs.pending >= config.maxQueue) { const e = new Error('File d\'attente pleine, réessayez plus tard.'); e.status = 429; throw e; }
  if (input.style && !STYLES[input.style]) { const e = new Error(`Style inconnu : ${input.style}`); e.status = 400; throw e; }
  const maxD = Math.min(LIMITS.maxDuration, config.maxDuration);
  let duration = input.duration === undefined || input.duration === null || input.duration === '' ? 90 : +input.duration;
  if (!Number.isFinite(duration) || duration < LIMITS.minDuration || duration > maxD) { const e = new Error(`Durée invalide : entre ${LIMITS.minDuration} et ${maxD} secondes.`); e.status = 400; throw e; }
  if (input.adv !== undefined && (typeof input.adv !== 'object' || Array.isArray(input.adv))) { const e = new Error('adv doit être un objet'); e.status = 400; throw e; }
  // v1.8.0 : nouvelles générations en moteur 1.8 ; « engine » < 18 (réglages d'un ancien morceau) = moteur historique
  const P = resolveParams({ ...input, engine: input.engine ?? 21, duration, wav: input.wav === undefined ? config.keepWav : input.wav });
  const id = crypto.randomBytes(6).toString('hex');
  const custom = typeof input.title === 'string' && input.title.trim();
  const title = custom ? input.title.trim().slice(0, 120) : makeTitle(P.seed, P.variation, P.style);
  // titre anglais : même tirage (titre généré), saisi (title_en) ou traduit si possible
  const enIn = typeof input.title_en === 'string' && input.title_en.trim() ? input.title_en.trim().slice(0, 120) : null;
  const titleEn = enIn || (custom ? translateTitle(title) : makeTitleEn(P.seed, P.variation, P.style));
  let autoSplit = null, animation = null, autoPack = null;
  // v1.14.0 : animation de la vidéo choisie avant la génération (null = fond du style) ; sinon celle enregistrée pour le style
  if (input.animation !== undefined && input.animation !== 'style') {
    if (input.animation !== null && (typeof input.animation !== 'string' || !getMedia(input.animation))) { const e = new Error('Animation introuvable dans la bibliothèque'); e.status = 400; throw e; }
    animation = { media: input.animation || null };
  } else { const m = getStyleAnimation(P.style); if (m || input.animation === 'style') animation = { media: m }; }
  if (input.pack) autoPack = packOptions(input.pack === true ? {} : input.pack);
  // v1.16.0 : « Faire la musique et la vidéo en même temps sur le PC Windows » → paquet ZIP unique avec la vidéo longue
  const pcCombo = input.pcCombo === true;
  if (pcCombo) autoPack = { ...(autoPack || packOptions({})), video: true };
  if (input.split) { // découpage automatique à la fin du rendu (générations > 30 min)
    if (duration <= SPLIT_MIN_SECONDS) { const e = new Error('Découpage réservé aux générations de plus de 30 min.'); e.status = 400; throw e; }
    autoSplit = splitOptions(input.split === true ? {} : input.split, { hasFfmpeg: jobs.hasFfmpeg, lang: getLang() });
  }
  // v1.9.0 : textes proposés par le directeur artistique (validés à nouveau ici : sans tempo ni tonalité)
  const A = input.aiMeta && typeof input.aiMeta === 'object' ? { description_fr: cleanText(input.aiMeta.description_fr, 1500), description_en: cleanText(input.aiMeta.description_en, 1500), tags: cleanTags(input.aiMeta.tags) } : null;
  const aiMeta = A && (A.description_fr || A.description_en || A.tags.length) ? A : null;
  const t = {
    id, title, style: P.style, status: 'queued', progress: 0, stage: 'En attente', error: null, params: P, meta: titleEn || autoSplit || aiMeta || animation || autoPack || pcCombo ? { ...(titleEn ? { titleEn, titleEnManual: !!enIn } : {}), ...(autoSplit ? { autoSplit } : {}), ...(animation ? { animation } : {}), ...(autoPack ? { autoPack } : {}), ...(pcCombo ? { pcCombo: true } : {}), ...(aiMeta ? { ai: aiMeta } : {}), ...(extraMeta || {}) } : extraMeta, waveform: null,
    files: {}, seed: P.seed, variation: P.variation, bpm: P.bpm, key: P.key, scale: P.scale, mood: P.mood, duration: null,
    parent_id: parentId, render_ms: null, created_at: new Date().toISOString(), finished_at: null,
  };
  store.insert(t);
  jobs.enqueue(id);
  return store.get(id);
}

const awrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const wrap = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { next(e); } };

app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION, storage: store.kind, mp3: jobs.hasFfmpeg, samples: samplesAvailable(), running: jobs.running, queued: jobs.pending }));

// v1.8.0 : ordre d'affichage (la French Touch à côté de la house) et sons / boîtes par défaut de chaque style
const STYLE_ORDER = (() => { const k = Object.keys(STYLES).filter((x) => x !== 'frenchtouch'); k.splice(k.indexOf('house') + 1, 0, 'frenchtouch'); return k.filter((x) => STYLES[x]); })();
const STYLE_DEFAULTS = (() => {
  const D = styleDefaults18(), out = {};
  for (const id of Object.keys(STYLES)) {
    const keys = Object.keys(D).filter((k) => k === id || k.startsWith(id + '_'));
    const u = (f) => [...new Set(keys.flatMap((k) => D[k][f] || []))];
    const S = styleDef(id, null, 18);
    out[id] = { kits: u('kits'), chords: u('chords'), bass: u('bass'), lead: u('lead'), arp: u('arp'), bassStyle: u('bassStyle'), chordStyle: u('chordStyle'), bpm: S.bpm, swing: Math.round((S.swing || 0) * 180) };
  }
  return out;
})();
app.get('/api/options', (req, res) => res.json({
  engine: 21, styleDefaults: STYLE_DEFAULTS,
  styles: STYLE_ORDER.map((id) => [id, STYLES[id]]).map(([id, s]) => ({ id, label: s.label, tagline: s.tagline, genre: s.genre, bpm: s.bpm, defaults: s.defaults, scales: Object.keys(s.scales),
    variants: VARIANT_KEY[id] && ADVANCED[VARIANT_KEY[id]] ? { key: VARIANT_KEY[id], options: ADVANCED[VARIANT_KEY[id]].options } : null })),
  moods: Object.entries(MOODS).map(([id, m]) => ({ id, label: m.label, ambience: m.ambience || null })),
  keys: NOTE_NAMES.map((k, i) => ({ id: k, label: NOTE_NAMES_FR[i] })),
  scales: Object.entries(SCALES).map(([id, s]) => ({ id, label: s.label })),
  instruments: Object.entries(INSTRUMENTS).map(([id, label]) => ({ id, label })),
  limits: { ...LIMITS, maxDuration: Math.min(LIMITS.maxDuration, config.maxDuration) },
  advanced: ADVANCED,
  mp3: jobs.hasFfmpeg, samples: samplesAvailable(), wavDefault: config.keepWav,
}));

/** Vérifie, avant génération, si les réglages produiraient un doublon (même graine…) ou un morceau très proche. */
// v1.9.0 : valeurs réelles des réglages avancés pour ce style / cette graine (formulaire pré-rempli)
app.post('/api/advanced/defaults', wrap((req, res) => {
  const b = req.body || {};
  if (b.style && !STYLES[b.style]) return res.status(400).json({ error: 'Style inconnu' });
  res.json(resolveAdvancedDefaults({ style: b.style || 'lofi', seed: b.seed, mood: b.mood, key: b.key, scale: b.scale, bpm: b.bpm, duration: b.duration, instruments: b.instruments, adv: b.adv || {}, engine: b.engine, variation: b.variation }));
}));
app.post('/api/check-duplicates', wrap((req, res) => {
  const input = req.body || {};
  if (input.style && !STYLES[input.style]) return res.status(400).json({ error: `Style inconnu : ${input.style}` });
  if (input.seed === undefined || input.seed === null || input.seed === '') return res.json({ duplicates: [], note: 'Graine aléatoire : pas de doublon possible.' });
  const P = resolveParams({ ...input, duration: +input.duration || 90 });
  res.json({ duplicates: findSimilar(signature(P), libraryIndex(), null, 5) });
}));

app.post('/api/generate', wrap((req, res) => res.status(202).json(present(createJob(req.body || {})))));

app.get('/api/jobs/:id', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Tâche introuvable' });
  const { waveform, ...rest } = present(t); res.json(t.status === 'done' ? present(t) : rest);
}));

app.get('/api/tracks', wrap((req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit || '100', 10)));
  const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
  const { items, total } = store.list({ style: req.query.style, status: req.query.status, limit, offset });
  const lib = libraryIndex(); res.json({ items: items.map((t) => present(t, lib)), total });
}));

app.get('/api/tracks/:id', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  res.json(present(t));
}));

app.patch('/api/tracks/:id', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  const b = req.body || {}, hasFr = b.title !== undefined, hasEn = b.title_en !== undefined;
  if (!hasFr && !hasEn) return res.status(400).json({ error: 'Titre vide' });
  const title = hasFr ? String(b.title || '').trim().slice(0, 120) : t.title;
  if (!title) return res.status(400).json({ error: 'Titre vide' });
  if (hasEn && b.title_en !== null && typeof b.title_en !== 'string') return res.status(400).json({ error: 'title_en doit être une chaîne' });
  // titre anglais : saisi (manuel) ; vide = traduction automatique du titre français ; sinon suit le titre français s'il n'a jamais été saisi
  const M = { ...(t.meta || {}) }, en = hasEn ? String(b.title_en || '').trim().slice(0, 120) : null;
  if (hasEn && en) Object.assign(M, { titleEn: en, titleEnManual: true });
  else if ((hasEn && !en) || (hasFr && !M.titleEnManual)) { const tr = translateTitle(title); delete M.titleEnManual; if (tr) M.titleEn = tr; else delete M.titleEn; }
  const frChanged = title !== t.title, enChanged = (M.titleEn || null) !== (t.meta?.titleEn || null);
  store.update(t.id, { title, meta: Object.keys(M).length ? M : null });
  if (t.status === 'done' && frChanged) {
    try { const f = syncFiles(tracksDir, { ...t, title }); if (f) store.update(t.id, { files: f }); } catch (e) { console.error('[renommage]', e.message); }
    retagTrack(tracksDir, store.get(t.id)); // balises ID3 / WAV INFO (asynchrone)
  }
  if (t.status === 'done' && (frChanged || enChanged) && t.files?.thumb) refreshThumb(store.get(t.id)).catch((e) => console.error('[miniature]', e.message));
  res.json(present(store.get(t.id)));
}));

app.delete('/api/tracks/:id', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  if (t.status === 'running') return res.status(409).json({ error: 'Génération en cours, réessayez à la fin.' });
  if (['queued', 'running'].includes(splits.status(t.id)?.status)) return res.status(409).json({ error: 'Découpage en cours, réessayez à la fin.' });
  const qi = jobs.queue.indexOf(t.id); if (qi >= 0) jobs.queue.splice(qi, 1);
  fs.rmSync(path.join(tracksDir, t.id), { recursive: true, force: true });
  store.delete(t.id); res.status(204).end();
}));

app.post('/api/tracks/:id/variation', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  const mode = req.body?.mode || 'variation';
  const p = { ...t.params, engine: t.params?.engine || 17 }; // v1.8.0 : une variation garde le moteur du morceau d'origine
  if (mode === 'variation') {
    const siblings = store.list({ limit: 1000 }).items.filter((x) => x.seed === t.seed && x.style === t.style);
    p.variation = Math.max(p.variation || 0, ...siblings.map((x) => x.variation || 0)) + 1;
  } else if (mode === 'remix') { p.seed = Math.floor(Math.random() * 2 ** 31); p.variation = 0; }
  else if (mode !== 'same') return res.status(400).json({ error: 'mode doit valoir variation, remix ou same' });
  res.status(202).json(present(createJob(p, t.id)));
}));

/** v1.12.0 : un morceau peut-il être régénéré avec l'harmonie du moteur 21 ? (aucun réglage deviné) */
const SUB_KEYS = ['synthStyle', 'hiphopStyle', 'dnbStyle', 'ftStyle', 'lofiStyle', 'technoStyle'];
function regenCheck(t) {
  const p = t?.params;
  if (!p || t.status !== 'done') return { ok: false, status: 409, error: 'Seuls les morceaux terminés peuvent être régénérés.' };
  if ((p.engine || 17) >= 21 || p.harmonyFix) return { ok: false, status: 409, error: 'Ce morceau a déjà l\'harmonie corrigée (moteur 21).' };
  if (!STYLES[p.style]) return { ok: false, status: 400, error: `Style « ${p.style} » inconnu dans cette version : régénération impossible.` };
  if (p.mood && !MOODS[p.mood]) return { ok: false, status: 400, error: `Humeur « ${p.mood} » inconnue : régénération impossible.` };
  if (p.scale && !SCALES[p.scale]) return { ok: false, status: 400, error: `Gamme « ${p.scale} » inconnue : régénération impossible.` };
  if (p.key && !NOTE_NAMES.includes(p.key)) return { ok: false, status: 400, error: `Tonalité « ${p.key} » inconnue : régénération impossible.` };
  if (!Number.isFinite(+p.seed)) return { ok: false, status: 400, error: 'Graine absente : régénération impossible.' };
  for (const [k, v] of Object.entries(p.adv || {})) {
    if (v === null || v === undefined) continue;
    const d = ADVANCED[k];
    if (!d) return { ok: false, status: 400, error: `Paramètre avancé « ${k} » inconnu : régénération impossible.` };
    if (d.type === 'select' && SUB_KEYS.includes(k) && !(v in (d.options || {}))) return { ok: false, status: 400, error: `Valeur « ${v} » inconnue pour « ${d.label} » : régénération impossible.` };
  }
  for (const k of SUB_KEYS) if (p[k] && ADVANCED[k] && !(p[k] in (ADVANCED[k].options || {}))) return { ok: false, status: 400, error: `Sous-style « ${p[k]} » inconnu : régénération impossible.` };
  return { ok: true };
}

/** v1.12.0 : régénère un ancien morceau (même graine, mêmes réglages) avec l'harmonie corrigée du moteur 21.
 *  Moteur 20 → moteur 21 ; moteurs plus anciens : même arrangement, corrections harmoniques activées (harmonyFix).
 *  Le morceau d'origine et ses fichiers ne sont jamais modifiés : un nouveau morceau est créé à côté. */
app.post('/api/tracks/:id/regenerate', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  const c = regenCheck(t); if (!c.ok) return res.status(c.status).json({ error: c.error });
  const eng = t.params.engine || 17;
  const p = { ...settingsOf(t.params), title: `${t.title} (régénéré en v1.12.0)`.slice(0, 120) };
  if (eng >= 20) p.engine = 21; else { p.engine = eng; p.harmonyFix = true; }
  if (t.meta?.titleEn) p.title_en = `${t.meta.titleEn} (regenerated in v1.12.0)`.slice(0, 120);
  res.status(202).json(present(createJob(p, t.id, { regenOf: t.id, regenVersion: '1.12.0' })));
}));

const MIME = { wav: 'audio/wav', mp3: 'audio/mpeg', mid: 'audio/midi', midzip: 'application/zip', mp4: 'video/mp4', thumb: 'image/jpeg' };
function sendTrackFile(kind) {
  return wrap((req, res) => {
    const t = store.get(req.params.id);
    if (!t || !t.files?.[kind]) return res.status(404).json({ error: 'Fichier indisponible' });
    const file = path.join(tracksDir, t.id, t.files[kind]);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Fichier manquant' });
    res.type(MIME[kind]);
    if (req.query.download) res.attachment(t.files[kind]);
    res.sendFile(file, { acceptRanges: true, cacheControl: true, maxAge: '7d' });
  });
}
app.get('/api/tracks/:id/audio.wav', sendTrackFile('wav'));
app.get('/api/tracks/:id/audio.mp3', sendTrackFile('mp3'));
app.get('/api/tracks/:id/track.mid', sendTrackFile('mid'));
app.get('/api/tracks/:id/midi.zip', sendTrackFile('midzip'));

// ---------- découpage en morceaux individuels (générations > 30 min)
function splitPayload(t, mode) {
  const av = splitAvailability(t), M = readManifest(tracksDir, t.id), st = splits.status(t.id);
  let plan = null; if (av.ok) { try { plan = splitPlan(t, mode || M?.mode || 'mid').map(({ n, start, end, title, title_en }) => ({ n, start, end, duration: +(end - start).toFixed(3), title, title_en })); } catch {} }
  let result = null;
  if (M) try { const E = zipEntries(splitDir(tracksDir, t.id), M), z = zipStream(E); result = { mode: M.mode, lang: M.lang, formats: M.formats, created: M.created, ms: M.ms || null, pieces: M.pieces.map((p) => ({ n: p.n, name: p.name, base: p.base, start: p.start, end: p.end, duration: +p.duration.toFixed(3) })), library: M.library || [], files: E.length, zipBytes: z.size, zipUrl: `/api/tracks/${t.id}/split.zip` }; } catch (e) { console.error('[découpage] manifeste illisible', t.id, e.message); }
  return { available: av.ok, reason: av.ok ? null : av.reason, kind: av.kind || null, minSeconds: SPLIT_MIN_SECONDS, modes: Object.entries(SPLIT_MODES).map(([id, m]) => ({ id, ...m })), mp3: jobs.hasFfmpeg,
    plan, job: st ? { status: st.status, progress: +st.progress.toFixed(3), stage: st.stage, eta: st.eta ?? null, error: st.error || null, mode: st.mode, lang: st.lang, library: st.library, video: st.video || null } : null, result, videos: splitVideosPayload(t) };
}
app.get('/api/tracks/:id/split/videos', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  res.json(splitVideosPayload(t) || { items: [], ready: 0, total: 0, running: false, request: null, zip: null });
}));
app.post('/api/tracks/:id/split/videos', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  if (!jobs.hasFfmpeg) return res.status(501).json({ error: 'ffmpeg absent' });
  const b = req.body || {}, resolution = resolutionOf(b.resolution || DEFAULT_RESOLUTION); if (!resolution) return res.status(400).json({ error: 'resolution : 720p, 1080p ou 4k' });
  const lang = b.lang === 'en' || b.lang === 'fr' ? b.lang : getLang(); if (lang !== getLang()) setLang(lang);
  if (['queued', 'running'].includes(splits.status(t.id)?.status)) return res.status(409).json({ error: 'Découpage en cours : les vidéos partiront à la fin.' });
  enqueuePieceVideos(t, { resolution, lang }); res.status(202).json(splitVideosPayload(t));
}));
app.get('/api/tracks/:id/split/videos.zip', awrap(async (req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  const lang = req.query.lang === 'en' || req.query.lang === 'fr' ? req.query.lang : readManifest(tracksDir, t.id)?.videos?.lang || getLang();
  const E = await videoZipEntries(t, lang); if (!E) return res.status(404).json({ error: 'Aucune vidéo de morceau prête' });
  const z = zipStream(E), title = lang === 'en' ? titleEnOf(t) : t.title, ascii = `${slugify(title)}_videos.zip`, nice = `${title} - ${lang === 'en' ? 'videos' : 'vidéos'}.zip`;
  res.set({ 'Content-Type': 'application/zip', 'Content-Length': String(z.size), 'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nice)}` });
  if (req.method === 'HEAD') return res.end();
  try { await z.pipe(res); } catch (e) { res.destroy(); }
}));
app.get('/api/tracks/:id/split', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  if (req.query.mode && !SPLIT_MODES[req.query.mode]) return res.status(400).json({ error: 'mode : mid, full ou clean' });
  res.json(splitPayload(t, req.query.mode));
}));
app.post('/api/tracks/:id/split', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  const o = splitOptions(req.body || {}, { hasFfmpeg: jobs.hasFfmpeg, lang: getLang() });
  splits.enqueue(t.id, o); res.status(202).json(splitPayload(t, o.mode));
}));
app.delete('/api/tracks/:id/split', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  if (['queued', 'running'].includes(splits.status(t.id)?.status)) return res.status(409).json({ error: 'Découpage en cours.' });
  fs.rmSync(splitDir(tracksDir, t.id), { recursive: true, force: true }); splits.state.delete(t.id); res.status(204).end();
}));
app.get('/api/tracks/:id/split.zip', awrap(async (req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  const M = readManifest(tracksDir, t.id); if (!M) return res.status(404).json({ error: 'Aucun découpage : lance d\'abord « Découper ».' });
  const z = zipStream(zipEntries(splitDir(tracksDir, t.id), M));
  const title = M.lang === 'en' ? titleEnOf(t) : t.title, ascii = `${slugify(title)}_morceaux.zip`, nice = `${title} - ${M.lang === 'en' ? 'tracks' : 'morceaux'}.zip`;
  res.set({ 'Content-Type': 'application/zip', 'Content-Length': String(z.size), 'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nice)}` });
  if (req.method === 'HEAD') return res.end();
  try { await z.pipe(res); } catch (e) { res.destroy(); }
}));
app.get('/api/tracks/:id/video.mp4', sendTrackFile('mp4'));
app.get('/api/tracks/:id/thumb.jpg', sendTrackFile('thumb'));

// ---------- outils YouTube
/** Nom affiché (miniature, vidéo, description) : réglage global + texte réellement dessiné. */
const brandInfo = () => { const b = getBrand(); return { ...b, text: brandText(b), default: DEFAULT_BRAND, max: BRAND_MAX }; };
const usedBrand = (v) => (v === undefined ? DEFAULT_BRAND : v); // morceaux antérieurs à la v1.6.1 : « soundtube »
/** Applique { brand: { name, hidden } } (ou brand: "nom") envoyé avec une requête miniature / vidéo. */
function brandFromBody(body) {
  const b = body?.brand; if (b == null) return;
  setBrand(typeof b === 'string' ? { name: b, hidden: false } : { name: b.name, hidden: b.hidden });
}
function ytPayload(t) {
  const y = t.meta?.youtube || {}, v = videos.status(t.id), brand = brandText(), D = designOf(t), lang = getLang();
  const pick = (x) => ({ title: x.title, description: x.description, tags: x.tags });
  return { ...youtubeInfo(t, brand, lang), lang, drawTexts: { fr: textData(t, brand, 'fr'), en: textData(t, brand, 'en') }, theme: themeOf(t.style), langs: { fr: pick(youtubeInfo(t, brand, 'fr')), en: pick(youtubeInfo(t, brand, 'en')) }, trackTitle: { fr: t.title, en: titleEnOf(t), enManual: !!t.meta?.titleEnManual }, brand: brandInfo(), urls: { thumb: t.files?.thumb ? fileUrl(t, 'thumb') + '?v=' + encodeURIComponent((y.thumbTitle || '') + (y.thumbResolution ? '-' + y.thumbResolution : '') + '-' + usedBrand(y.thumbBrand) + (y.thumbKey ? '-' + y.thumbKey : '')) : null, video: t.files?.mp4 ? fileUrl(t, 'mp4') : null },
    files: { thumb: t.files?.thumb || null, video: t.files?.mp4 || null }, design: D,
    videoStaleDesign: !!(t.files?.mp4 && (!v || v.status === 'done') && usedBrand(y.videoBrand) === brand && (y.videoKey || videoKey(defaultDesign(), usedBrand(y.videoBrand))) !== videoKey(D, brand, lang)),
    video: v || (t.files?.mp4 ? { status: 'done', progress: 1 } : null), videoStale: !!(t.files?.mp4 && y.videoTitle && (y.videoLang === 'en' ? (y.videoTitleEn || '') !== titleEnOf(t) : y.videoTitle !== t.title)), videoStaleBrand: !!(t.files?.mp4 && (!v || v.status === 'done') && usedBrand(y.videoBrand) !== brand),
    videoNode: v?.node || y.videoNode || null, videoEncoder: v?.encoder || y.videoEncoder || null,
    resolutions: Object.entries(RESOLUTIONS).map(([id, r]) => ({ id, label: r.label, width: r.w, height: r.h })), defaultResolution: DEFAULT_RESOLUTION,
    videoResolution: v?.resolution || y.videoResolution || (t.files?.mp4 ? '720p' : null), thumbResolution: y.thumbResolution || (t.files?.thumb ? '720p' : null),
    loudness: t.meta?.loudness || null, duplicates: findSimilar(signature(t.params, t.meta), libraryIndex(), t.id, 3), ffmpeg: jobs.hasFfmpeg };
}
app.get('/api/tracks/:id/youtube', awrap(async (req, res) => {
  let t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  if (t.status !== 'done') return res.status(409).json({ error: 'Morceau pas encore terminé' });
  if (jobs.hasFfmpeg && (!t.files?.thumb || t.meta?.youtube?.thumbKey !== thumbKey(designOf(t), brandText(), getLang()))) t = await refreshThumb(t); // miniature absente, nom affiché, fond ou mise en page changés
  res.json(ytPayload(t));
}));
app.post('/api/tracks/:id/thumbnail', awrap(async (req, res) => {
  const t = store.get(req.params.id); if (!t || t.status !== 'done') return res.status(404).json({ error: 'Morceau introuvable ou pas terminé' });
  if (!jobs.hasFfmpeg) return res.status(501).json({ error: 'ffmpeg absent' });
  const r = req.body?.resolution ?? req.query.resolution; if (r != null && !resolutionOf(r)) return res.status(400).json({ error: 'Résolution inconnue (720p, 1080p ou 4k)' });
  brandFromBody(req.body); if (req.body?.lang != null) setLang(req.body.lang);
  res.json(ytPayload(await refreshThumb(t, r)));
}));
app.post('/api/tracks/:id/video', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t || t.status !== 'done') return res.status(404).json({ error: 'Morceau introuvable ou pas terminé' });
  if (!jobs.hasFfmpeg) return res.status(501).json({ error: 'ffmpeg absent' });
  const r = req.body?.resolution ?? req.query.resolution; if (r != null && !resolutionOf(r)) return res.status(400).json({ error: 'Résolution inconnue (720p, 1080p ou 4k)' });
  brandFromBody(req.body);
  if (req.body?.lang != null) setLang(req.body.lang);
  const D = designOf(t), brand = brandText(), lang = getLang();
  videos.enqueue(t.id, { resolution: resolutionOf(r) || DEFAULT_RESOLUTION, brand, design: D, lang, key: videoKey(D, brand, lang) }); res.status(202).json(ytPayload(store.get(t.id)));
}));

/* ---------- v1.13.0 : chaînes YouTube, profils de publication par style, file d'auto-publication ---------- */
const ytTransport = process.env.SOUNDTUBE_YT_TRANSPORT === 'mock' ? mockTransport(path.join(config.dataDir, 'youtube-mock.jsonl')) : liveTransport();
const channels = new Channels(config.dataDir);
/** Vidéo du morceau : celle qui existe, sinon rendu (file vidéo habituelle) et attente. */
async function ensureVideo(t, onProgress, resolution = null, { fresh = false } = {}) {
  const D = designOf(t), brand = brandText(), lang = getLang(), key = videoKey(D, brand, lang), y = t.meta?.youtube || {};
  const upToDate = !fresh || (y.videoKey === key && (!resolution || y.videoResolution === resolution)); // v1.14.0 (paquet) : vidéo refaite si l'animation ou la résolution a changé
  if (upToDate && t.files?.mp4 && fs.existsSync(path.join(tracksDir, t.id, t.files.mp4)) && !['queued', 'running'].includes(videos.status(t.id)?.status)) return t;
  if (!jobs.hasFfmpeg) throw new Error('ffmpeg absent : impossible de rendre la vidéo');
  const st = videos.enqueue(t.id, { resolution: resolution || y.videoResolution || DEFAULT_RESOLUTION, brand, design: D, lang, key });
  while (st.status === 'queued' || st.status === 'running') { onProgress?.(st.progress || 0); await new Promise((r) => setTimeout(r, 400)); }
  if (st.status !== 'done') throw new Error('Vidéo : ' + (st.error || 'échec du rendu'));
  return store.get(t.id);
}
const ensureThumb = async (t) => (t.files?.thumb ? t : refreshThumb(t));
function publishInfo(t) {
  const lang = getLang(), I = youtubeInfo(t, brandText(), lang), P = t.params || {};
  const ton = `${NOTE_NAMES_FR?.[NOTE_NAMES.indexOf(P.key ?? t.key)] || P.key || t.key || ''} ${(SCALES[P.scale ?? t.scale]?.label) || (P.scale ?? t.scale ?? '')}`.trim();
  return { tags: I.tags, vars: { titre: t.title, titre_en: titleEnOf(t), style: STYLES[t.style]?.label || t.style, bpm: Math.round(P.bpm || t.bpm || 0), tonalite: ton, duree: fmtTime(t.duration || 0), description: I.description, titre_youtube: I.title } };
}
const publisher = new PublishQueue({ dataDir: config.dataDir, store, tracksDir, channels, transport: ytTransport, ensureVideo, ensureThumb, info: publishInfo });
const ytAdminView = () => ({ ...channels.view(), transport: ytTransport.kind, confirmWord: CONFIRM_WORD, styles: STYLE_IDS().map((id) => ({ id, label: STYLES[id].label, channelId: channels.s.bindings[id] || null, autoPublish: channels.profile(id).autoPublish })) });
app.get('/api/admin/youtube', (req, res) => res.json(ytAdminView()));
app.post('/api/admin/youtube/channels', wrap((req, res) => { channels.upsert(req.body || {}); res.status(201).json(ytAdminView()); }));
app.put('/api/admin/youtube/channels/:cid', wrap((req, res) => { channels.upsert(req.body || {}, req.params.cid); res.json(ytAdminView()); }));
app.delete('/api/admin/youtube/channels/:cid', wrap((req, res) => { channels.remove(req.params.cid); res.json(ytAdminView()); }));
app.put('/api/admin/youtube/default', wrap((req, res) => { channels.setDefault(req.body?.id); res.json(ytAdminView()); }));
app.put('/api/admin/youtube/bindings', wrap((req, res) => {
  const b = req.body || {}; if (!STYLE_IDS().includes(b.style)) return res.status(400).json({ error: 'Style inconnu' });
  channels.bind(b.style, b.channelId || null); res.json(ytAdminView());
}));
const stylePublishView = (id) => { const ch = channels.forStyle(id); return { style: id, label: STYLES[id].label, profile: channels.profile(id), defaults: DEFAULT_PROFILE, channelId: channels.s.bindings[id] || null, channel: ch ? channels.publicChannel(ch) : null, ready: channels.ready(ch), reason: channels.missing(ch), channels: channels.view().channels, transport: ytTransport.kind, confirmWord: CONFIRM_WORD, visibilities: VISIBILITIES.map((v) => ({ id: v, label: VIS_LABEL[v] })), queue: publisher.list({ style: id }).slice(0, 50) }; };
app.get('/api/styles/:id/publish', wrap((req, res) => { if (!STYLE_IDS().includes(req.params.id)) return res.status(404).json({ error: 'Style inconnu' }); res.json(stylePublishView(req.params.id)); }));
app.put('/api/styles/:id/publish', wrap((req, res) => {
  const id = req.params.id, b = req.body || {}; if (!STYLE_IDS().includes(id)) return res.status(404).json({ error: 'Style inconnu' });
  if ('channelId' in b) channels.bind(id, b.channelId || null);
  if (b.profile) channels.setProfile(id, b.profile, { confirm: b.confirm });
  res.json(stylePublishView(id));
}));
app.get('/api/tracks/:id/publish', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t || t.status !== 'done') return res.status(404).json({ error: 'Morceau introuvable ou pas terminé' });
  res.json({ ...publisher.draft(t, req.query.channelId ? { channelId: req.query.channelId } : {}), channels: channels.view().channels, visibilities: VISIBILITIES.map((v) => ({ id: v, label: VIS_LABEL[v] })), confirmWord: CONFIRM_WORD, published: t.meta?.published || [], queue: publisher.items.filter((x) => x.trackId === t.id).map((x) => publisher.view(x)) });
}));
app.post('/api/tracks/:id/publish', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  const b = req.body || {}, over = {}; for (const k of ['channelId', 'title', 'description', 'tags', 'thumbnail', 'visibility', 'playlistId', 'schedule', 'autoTags', 'again']) if (b[k] !== undefined) over[k] = b[k];
  res.status(202).json(publisher.enqueue(t, over, { mode: 'manual', confirm: b.confirm }));
}));
app.get('/api/publish/queue', (req, res) => res.json({ items: publisher.list({ style: req.query.style }), transport: ytTransport.kind }));
app.post('/api/publish/queue/:pid/cancel', wrap((req, res) => res.json(publisher.cancel(req.params.pid))));
app.post('/api/publish/queue/:pid/retry', wrap((req, res) => res.json(publisher.retry(req.params.pid))));

/* ---------- v1.14.0 : animation de la vidéo par style (formulaire de génération) ---------- */
const pubMedia = (m) => { if (!m) return null; const { path: _p, posterPath: _q, ...x } = m; return x; };
const styleAnimView = (id) => ({ style: id, media: getStyleAnimation(id), item: pubMedia(getStyleAnimation(id) ? getMedia(getStyleAnimation(id)) : null), all: getStyleAnimations() });
app.get('/api/styles/:id/animation', wrap((req, res) => { if (!STYLE_IDS().includes(req.params.id)) return res.status(404).json({ error: 'Style inconnu' }); res.json(styleAnimView(req.params.id)); }));
app.put('/api/styles/:id/animation', wrap((req, res) => {
  const id = req.params.id; if (!STYLE_IDS().includes(id)) return res.status(404).json({ error: 'Style inconnu' });
  const m = req.body?.media; if (m !== null && m !== undefined && typeof m !== 'string') return res.status(400).json({ error: 'media : identifiant ou null' });
  setStyleAnimation(id, m || null); res.json(styleAnimView(id));
}));
/** Animation réellement utilisée par la vidéo d'un morceau, et d'où elle vient (morceau / génération / réglage commun). */
app.get('/api/tracks/:id/animation', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  const D = designOf(t), gen = t.meta?.animation || null;
  res.json({ media: D.background.media || null, scope: D.scope, override: D.scope === 'track', generation: gen ? gen.media || null : undefined, item: pubMedia(D.background.media ? getMedia(D.background.media) : null) });
}));

/* ---------- v1.13.0 : paquet ZIP tout-en-un (vidéo + mix + morceaux + manifeste) ---------- */
const packs = new Map();
const packState = (id) => { let p = packs.get(id); if (!p) { const R = readPack(tracksDir, id); if (R) { p = { status: 'done', progress: 1, stage: 'Terminé', error: null, options: R.options, manifest: { entries: R.entries, pieces: { length: R.pieces } } }; p.size = zipStream(R.entries).size; packs.set(id, p); } } return p || null; };
const packView = (t) => { const p = packState(t.id), sp = packSplit(t); return { available: true, split: sp.ok ? sp.kind : null, splitReason: sp.ok ? null : sp.reason, ffmpeg: !!jobs.hasFfmpeg, wavSource: !!t.files?.wav, auto: t.meta?.autoPack || null, state: p ? { status: p.status, progress: p.progress, stage: p.stage, error: p.error, options: p.options, size: p.size || null, pieces: p.manifest?.pieces?.length || null, url: p.status === 'done' ? `/api/tracks/${t.id}/pack.zip` : null } : null }; };
app.get('/api/tracks/:id/pack', wrap((req, res) => { const t = store.get(req.params.id); if (!t || t.status !== 'done') return res.status(404).json({ error: 'Morceau introuvable ou pas terminé' }); res.json({ ...packView(t), render: t.meta?.render || null }); }));
app.post('/api/tracks/:id/pack', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t || t.status !== 'done') return res.status(404).json({ error: 'Morceau introuvable ou pas terminé' });
  const cur = packState(t.id); if (cur && cur.status === 'running') return res.status(409).json({ error: 'Paquet déjà en préparation.' });
  const options = packOptions({ ...(req.body || {}), lang: req.body?.lang || getLang() });
  if (options.video && !jobs.hasFfmpeg && !t.files?.mp4) return res.status(501).json({ error: 'ffmpeg absent : décoche la vidéo' });
  startPack(t, options); res.status(202).json(packView(t));
}));
/** v1.14.0 : vidéos par morceau pour le paquet : morceaux ajoutés à la bibliothèque, file vidéo habituelle, attente ; une erreur fait échouer le paquet. */
async function packPieceVideos(t, M, out, resolution, onP) {
  if (!jobs.hasFfmpeg) throw new Error('ffmpeg absent : impossible de rendre les vidéos des morceaux');
  const ids = await splits.addToLibrary(t, M, out), brand = brandText(), L = getLang();
  const S = ids.map((id) => {
    const p = inheritLook(t, id), D = designOf(p), key = videoKey(D, brand, L), y = p.meta?.youtube || {};
    if (p.files?.mp4 && fs.existsSync(path.join(tracksDir, id, p.files.mp4)) && y.videoKey === key && y.videoResolution === resolution && y.videoTitle === p.title && y.videoBrand === brand && !['queued', 'running'].includes(videos.status(id)?.status)) return { id, st: { status: 'done', progress: 1 } };
    return { id, st: videos.enqueue(id, { resolution, brand, design: D, key, lang: L }) };
  });
  for (;;) {
    const bad = S.findIndex((x) => x.st.status === 'error' || x.st.status === 'cancelled');
    if (bad >= 0) throw new Error(`Vidéo du morceau ${M.pieces[bad].n} : ${S[bad].st.error || 'échec du rendu'}`);
    const done = S.filter((x) => x.st.status === 'done').length; onP(done, S.reduce((a, x) => a + (x.st.status === 'done' ? 1 : x.st.progress || 0), 0) / S.length);
    if (done === S.length) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return S.map((x, i) => { const p = store.get(x.id); return { n: M.pieces[i].n, id: x.id, path: path.join(tracksDir, x.id, p.files.mp4) }; });
}
function startPack(t, options) {
  const cur = packState(t.id); if (cur && cur.status === 'running') return cur;
  const st = { status: 'running', progress: 0, stage: 'Préparation…', error: null, options, startedAt: new Date().toISOString() }; packs.set(t.id, st);
  fs.rmSync(path.join(tracksDir, t.id, 'pack', '.entries.json'), { force: true });
  buildPack(t, options, { tracksDir, ensureVideo: (x, onP, r) => ensureVideo(x, onP, r, { fresh: true }), pieceVideos: packPieceVideos, hasFfmpeg: jobs.hasFfmpeg, brand: brandText(), cpus: os.cpus().length, onProgress: (f, s) => Object.assign(st, { progress: f, stage: s }) })
    .then((M) => Object.assign(st, { status: 'done', progress: 1, stage: 'Terminé', manifest: M, size: zipStream(M.entries).size, finishedAt: new Date().toISOString() }))
    .catch((e) => { console.error('[paquet]', t.id, e.message); Object.assign(st, { status: 'error', error: String(e.message).slice(0, 400) }); });
  return st;
}
app.get('/api/tracks/:id/pack.zip', awrap(async (req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  const p = packState(t.id); if (p?.status !== 'done') return res.status(404).json({ error: 'Aucun paquet prêt : lance d\'abord « Créer le ZIP complet ».' });
  const E = p.manifest.entries.filter((x) => x.data || (fs.existsSync(x.path) && fs.statSync(x.path).size === x.size));
  if (E.length !== p.manifest.entries.length) { packs.delete(t.id); fs.rmSync(path.join(tracksDir, t.id, 'pack', '.entries.json'), { force: true }); return res.status(410).json({ error: 'Fichiers du paquet modifiés : recrée le ZIP.' }); }
  const z = zipStream(E), ascii = `${slugify(t.title)}_complet.zip`, nice = `${t.title} - complet.zip`;
  res.set({ 'Content-Type': 'application/zip', 'Content-Length': String(z.size), 'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nice)}` });
  if (req.method === 'HEAD') return res.end();
  try { await z.pipe(res); } catch (e) { res.destroy(); }
}));

// nom affiché sur les miniatures / vidéos (ex. le nom de la chaîne) ; vide = « soundtube », hidden = aucun nom
app.get('/api/youtube/brand', (req, res) => res.json(brandInfo()));
app.put('/api/youtube/brand', wrap((req, res) => {
  const b = req.body || {};
  if (b.name != null && typeof b.name !== 'string') return res.status(400).json({ error: 'name doit être une chaîne' });
  setBrand({ name: b.name, hidden: b.hidden }); res.json(brandInfo());
}));

// ---------- présentation YouTube : animation de fond + mise en page (v1.6.2)
const mediaInfo = () => ({ items: listMedia(), maxBytes: config.mediaMaxBytes, accept: ACCEPT });
app.get('/api/youtube/design', (req, res) => res.json({ design: getDesign(), defaults: defaultDesign(), media: mediaInfo() }));
app.put('/api/youtube/design', wrap((req, res) => {
  const d = req.body?.design ?? req.body; if (d != null && typeof d !== 'object') return res.status(400).json({ error: 'design doit être un objet' });
  res.json({ design: setDesign(d), defaults: defaultDesign() });
}));
// réglage propre à un morceau (design: null = revenir au réglage global)
app.put('/api/tracks/:id/design', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  const d = req.body?.design; if (d !== null && (typeof d !== 'object' || d === undefined)) return res.status(400).json({ error: 'design : objet ou null' });
  const y = { ...(t.meta?.youtube || {}) }; if (d === null) delete y.design; else y.design = normalizeDesign(d);
  store.update(t.id, { meta: { ...(t.meta || {}), youtube: y } });
  res.json({ design: designOf(store.get(t.id)) });
}));
app.get('/api/youtube/lang', (req, res) => res.json({ lang: getLang(), langs: ['fr', 'en'] }));
app.put('/api/youtube/lang', wrap((req, res) => {
  const l = req.body?.lang; if (l !== 'fr' && l !== 'en') return res.status(400).json({ error: 'lang : fr ou en' });
  res.json({ lang: setLang(l) });
}));
app.get('/api/media', (req, res) => res.json(mediaInfo()));
app.post('/api/media', awrap(async (req, res) => {
  if (!jobs.hasFfmpeg) return res.status(501).json({ error: 'ffmpeg absent' });
  try { res.status(201).json(await saveUpload(req, { name: req.query.name || req.headers['x-filename'] })); }
  catch (e) { if (e.status) { res.set('Connection', 'close'); return res.status(e.status).json({ error: e.message }); } throw e; }
}));
app.delete('/api/media/:id', wrap((req, res) => {
  if (!removeMedia(req.params.id)) return res.status(404).json({ error: 'Animation introuvable' });
  const g = getDesign(); if (g.background.media === req.params.id) setDesign({ ...g, background: { ...g.background, media: null } });
  res.json(mediaInfo());
}));
app.get('/api/media/:id/poster.jpg', wrap((req, res) => { const m = getMedia(req.params.id); if (!m || !fs.existsSync(m.posterPath)) return res.status(404).json({ error: 'Affiche indisponible' }); res.sendFile(m.posterPath, { maxAge: '7d' }); }));
app.get('/api/media/:id/file', wrap((req, res) => { const m = getMedia(req.params.id); if (!m) return res.status(404).json({ error: 'Animation introuvable' }); res.sendFile(m.path, { acceptRanges: true, maxAge: '7d' }); }));
// fond seul (dégradé du style ou image de l'animation) en 1280×720 : base de l'aperçu de l'éditeur
const baseDir = path.join(os.tmpdir(), 'soundtube-base');
app.get('/api/youtube/base.jpg', awrap(async (req, res) => {
  if (!jobs.hasFfmpeg) return res.status(501).json({ error: 'ffmpeg absent' });
  const style = STYLES[req.query.style] ? req.query.style : 'house', media = req.query.media && getMedia(String(req.query.media)) ? String(req.query.media) : null;
  const fit = req.query.fit === 'contain' ? 'contain' : 'cover', dim = Math.min(0.8, Math.max(0, +req.query.dim || 0));
  fs.mkdirSync(baseDir, { recursive: true });
  const out = path.join(baseDir, crypto.createHash('sha1').update(JSON.stringify([style, media, fit, dim])).digest('hex').slice(0, 16) + '.jpg');
  if (!fs.existsSync(out)) await makeBase({ style, media, fit, dim: media ? dim : 0 }, out);
  res.type('image/jpeg'); res.sendFile(out, { maxAge: '1h' });
}));
// aperçu exact du rendu serveur (miniature ou image de la vidéo, 720p) avec un réglage pas encore enregistré
let previewBusy = Promise.resolve();
app.post('/api/tracks/:id/youtube/preview', awrap(async (req, res) => {
  const t = store.get(req.params.id); if (!t || t.status !== 'done') return res.status(404).json({ error: 'Morceau introuvable ou pas terminé' });
  if (!jobs.hasFfmpeg) return res.status(501).json({ error: 'ffmpeg absent' });
  const target = req.body?.target === 'video' ? 'video' : 'thumb', design = req.body?.design ? normalizeDesign(req.body.design) : designOf(t);
  const tl = req.body?.lang === 'en' || req.body?.lang === 'fr' ? req.body.lang : undefined;
  const src = t.files?.wav || t.files?.mp3; if (target === 'video' && !src) return res.status(409).json({ error: 'Aucun fichier audio' });
  const out = path.join(os.tmpdir(), `st-preview-${t.id}-${crypto.randomBytes(4).toString('hex')}.${target === 'video' ? 'png' : 'jpg'}`);
  const job = previewBusy.then(() => (target === 'video'
    ? makeVideo(t, path.join(tracksDir, t.id, src), out, null, { resolution: '720p', brand: brandText(), design, lang: tl || getLang(), frameAt: +req.body?.at || Math.min(8, (t.duration || 30) / 3) })
    : makeThumbnail(t, out, '720p', { brand: brandText(), design, lang: tl || getLang() })));
  previewBusy = job.catch(() => {});
  try { await job; res.set('Cache-Control', 'no-store'); res.type(target === 'video' ? 'image/png' : 'image/jpeg'); res.send(fs.readFileSync(out)); }
  finally { fs.rmSync(out, { force: true }); }
}));

app.get('/api/tracks/:id/settings', wrap((req, res) => {
  const t = store.get(req.params.id); if (!t) return res.status(404).json({ error: 'Morceau introuvable' });
  res.json(settingsOf(t.params));
}));

// ---------- Admin : nœuds de rendu vidéo + PC IA (réseau local)
app.get('/api/admin/nodes', (req, res) => res.json(renderNodes.view()));
app.post('/api/admin/nodes', awrap(async (req, res) => { const b = req.body || {}; const n = renderNodes.add({ url: b.url, name: b.name, token: b.token, enabled: b.enabled !== false }); await renderNodes.check(n); res.status(201).json(renderNodes.view()); }));
app.patch('/api/admin/nodes/:id', awrap(async (req, res) => { const b = req.body || {}; const n = renderNodes.update(req.params.id, { url: b.url, name: b.name, token: b.token, enabled: b.enabled, audio: b.audio }); await renderNodes.check(n); res.json(renderNodes.view()); }));
app.delete('/api/admin/nodes/:id', (req, res) => { renderNodes.remove(req.params.id); res.json(renderNodes.view()); });
app.post('/api/admin/nodes/check', awrap(async (req, res) => { await renderNodes.checkAll(); res.json(renderNodes.view()); }));
app.put('/api/admin/render', (req, res) => { const b = req.body || {}; renderNodes.setRender({ forceUrl: b.forceUrl, localMode: b.localMode, audioMinSec: b.audioMinSec }); res.json(renderNodes.view()); });
// v1.16.0 : contrôle d'empreinte de rendu (morceau de référence de 20 s rendu sur le CT et sur le PC, WAV comparés)
app.post('/api/admin/nodes/:id/verify', awrap(async (req, res) => {
  const n = renderNodes.s.nodes.find((x) => x.id === req.params.id); if (!n) return res.status(404).json({ error: 'Nœud introuvable' });
  await renderNodes.check(n); const st = renderNodes.st(n.id), a = renderNodes.audioState(n);
  if (!st.health?.audio?.ok || st.health.audio.engine?.hash !== renderNodes.engine.hash) return res.status(409).json({ error: a.reason || 'rendu musical indisponible sur ce nœud' });
  st.verify = null;
  try { const samples = await ensureSamples(renderNodes, n); const v = await ensureVerified(renderNodes, n, samples); res.json({ ok: true, ...v, node: renderNodes.view().nodes.find((x) => x.id === n.id) }); }
  catch (e) { res.status(409).json({ ok: false, error: String(e.message).slice(0, 300), verify: st.verify || null }); }
}));
app.post('/api/admin/discover', awrap(async (req, res) => res.json({ found: await renderNodes.discover() })));
app.get('/api/admin/ai', (req, res) => res.json(renderNodes.s.ai));
// v1.9.0 : directeur artistique — « Décris l'ambiance » → réglages validés (IA Ollama, sinon proposition locale)
// v1.9.0 : veille tendances (métadonnées publiques ; propositions appliquées seulement par bouton)
app.get('/api/admin/trends', (req, res) => res.json({ settings: trends.view(), report: trends.latest() }));
app.put('/api/admin/trends', (req, res) => res.json(trends.update(req.body || {})));
app.post('/api/admin/trends/run', (req, res) => {
  if (trends.sourceOf() === 'none') return res.status(409).json({ error: 'Aucune source : renseigne une clé YouTube Data API, des flux RSS ou active la recherche YouTube publique.' });
  const was = trends.isRunning(); trends.run(() => renderNodes.s.ai).catch((e) => console.error('[veille]', e.message));
  res.status(202).json({ running: true, already: was });
});
trends.start(() => renderNodes.s.ai);
// v1.15.0 : contexte du directeur artistique (profil de goût + dernière veille), chacun activé dans Admin
const directorCtx = (style, s) => director.context(style, { s, report: trends.latest() });
app.post('/api/ai/suggest', awrap(async (req, res) => res.json(await aiSuggest(renderNodes.s.ai, req.body || {}, (style) => directorCtx(style)))));
function directorView(style = 'frenchtouch') {
  const s = director.settings(), p = director.profile(s), tr = director.trendsSummary(trends.latest(), style);
  return { settings: { taste: s.taste, trends: s.trends, edited: !!s.refs }, budget: director.BUDGET,
    profile: p ? { source: p.source, builtAt: p.builtAt, stats: p.stats, topArtists: p.topArtists, topGenres: p.topGenres, favourites: p.favourites, sound: p.sound } : null,
    refsText: director.formatRefs(p), taste: p ? director.tasteBlock(style, p) : '', trends: tr, style };
}
app.get('/api/admin/director', (req, res) => res.json(directorView(STYLES[req.query.style] ? req.query.style : undefined)));
app.put('/api/admin/director', (req, res) => { director.update(req.body || {}); res.json(directorView()); });
// aperçu : prompt v1.14 (sans contexte) et prompt envoyé (avec les sources demandées), diff ligne à ligne ; run = appel réel du PC IA
app.post('/api/admin/director/preview', awrap(async (req, res) => {
  const b = req.body || {}, s0 = director.settings(), s = { ...s0, taste: b.taste ?? s0.taste, trends: b.trends ?? s0.trends };
  const style = STYLES[b.style] ? b.style : 'frenchtouch', prompt = String(b.prompt || 'Une house filtrée pour une nuit d\'été, montées au filtre et basse ronde').slice(0, 1200);
  const opts = { prompt, style, duration: Math.min(7200, Math.max(60, +b.duration || 180)), meta: b.meta !== false, plan: false };
  const ctx = directorCtx(style, s), base = buildPrompt(opts), sent = buildPrompt({ ...opts, context: ctx });
  const size = (x) => ({ system: x.system.length, user: x.user.length, total: x.system.length + x.user.length, tokens: director.estTokens(x.system + x.user) });
  const out = { style, prompt, sources: { taste: ctx.taste.length, trends: ctx.trends.length, trendsDate: ctx.trendsDate, tasteTokens: director.estTokens(ctx.taste), trendsTokens: director.estTokens(ctx.trends) },
    base: size(base), sent: size(sent), numCtx: 8192, system: sent.system, user: sent.user,
    diff: { system: director.lineDiff(base.system, sent.system), user: director.lineDiff(base.user, sent.user) } };
  if (b.run) {
    try { const r = await ollamaJson(renderNodes.s.ai, sent.system, sent.user); out.result = { ok: true, model: r.model, ms: r.ms, ...validateSuggestion(r.data, { ...opts, forbid: ctx.forbid }) }; }
    catch (e) { out.result = { ok: false, error: e.message }; }
  }
  res.json(out);
}));
app.put('/api/admin/ai', (req, res) => res.json(renderNodes.setAI(req.body || {})));
app.post('/api/admin/ai/test', awrap(async (req, res) => res.json(await renderNodes.testAI(req.body || {}))));

// v1.10.0 : fiches de style (pages /styles et /styles/:id), texte tiré de docs/STYLES.md
const STYLE_IDS = () => STYLE_ORDER.filter((id) => STYLES[id]);
function styleCard(id) {
  const s = STYLES[id], d = stylesDoc().sections[id] || null;
  const vk = VARIANT_KEY[id], variants = vk && ADVANCED[vk] ? { key: vk, options: ADVANCED[vk].options } : null;
  let count = 0; try { count = store.list({ style: id, status: 'done', limit: 1, offset: 0 }).total || 0; } catch {}
  return { id, label: s.label, tagline: s.tagline, genre: s.genre, bpm: s.bpm, variants, machines: d?.machines || [], title: d?.title || s.label, tracks: count };
}
app.get('/api/styles', (req, res) => { const d = stylesDoc(); res.json({ styles: STYLE_IDS().map(styleCard), roadmap: d.roadmap || null, ai: d.ai || null }); });
app.get('/api/styles/:id', (req, res) => {
  const id = req.params.id; if (!STYLE_IDS().includes(id)) return res.status(404).json({ error: 'Style inconnu' });
  const d = stylesDoc().sections[id] || null;
  res.json({ ...styleCard(id), html: d?.html || '', facts: d?.facts || [], neighbours: STYLE_IDS().filter((x) => x !== id) });
});
// Pages de l'interface (v1.10.0) : /styles/<style> → page de style (le style est lu dans l'adresse par le navigateur)
app.get('/styles/:id', (req, res, next) => (STYLE_IDS().includes(req.params.id) ? res.sendFile(path.join(config.publicDir, 'style.html'), { headers: { 'Cache-Control': 'no-cache' } }) : res.status(404).sendFile(path.join(config.publicDir, 'style.html'), { headers: { 'Cache-Control': 'no-cache' } })));

app.get('/api/openapi.json', (req, res) => res.json(openapi));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'soundtube — API', customCss: '.topbar{display:none}' }));

// HTML toujours revalidé (les CSS/JS sont versionnés par ?v=) : une mise à jour de l'interface est visible tout de suite.

/* ---------- v1.18.0 : langue d’interface (indépendante de la langue YouTube getLang/setLang) ---------- */
function uiLangFromReq(req) {
  const c = String(req.headers.cookie || '').match(/(?:^|;\s*)soundtube_ui_lang=(fr|en)(?:;|$)/);
  if (c) return c[1];
  const al = String(req.headers['accept-language'] || '').toLowerCase();
  if (/(^|,)en\b/.test(al) && !/(^|,)fr\b/.test(al.split(',')[0] || '')) return 'en';
  if (al.startsWith('en')) return 'en';
  return 'fr';
}
app.get('/api/ui/lang', (req, res) => res.json({ lang: uiLangFromReq(req), supported: ['fr', 'en'] }));
app.put('/api/ui/lang', (req, res) => {
  const lang = req.body?.lang === 'en' ? 'en' : 'fr';
  res.setHeader('Set-Cookie', `soundtube_ui_lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`);
  res.json({ lang });
});

app.use(express.static(config.publicDir, { extensions: ['html'], maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue' }));
app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Erreur interne' });
});

app.listen(config.port, config.host, () => {
  console.log(`[soundtube] http://${config.host}:${config.port}  (données: ${config.dataDir}, stockage: ${store.kind}, mp3: ${jobs.hasFfmpeg ? 'oui' : 'non'}, workers: ${config.maxConcurrentJobs})`);
});
