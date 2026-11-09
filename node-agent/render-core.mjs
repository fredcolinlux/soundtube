// soundtube — cœur de rendu vidéo partagé entre le serveur (CT) et l'agent de rendu (PC Windows / Mac Apple Silicon).
// Le CT prépare un « spec » portable : entrées ffmpeg + filtergraph qui ne citent que des noms de fichiers RELATIFS
// (audio, fond, polices, textes) ; le rendu se fait avec cwd = dossier du job. Seuls les réglages d'encodeur diffèrent
// d'une machine à l'autre : le filtergraph (textes, positions, polices, spectre, barre) est strictement le même.
// Aucune dépendance : node:child_process uniquement.
import { spawn, spawnSync } from 'node:child_process';

export const SPEC_VERSION = 2; // v1.16.0 : 2 = agent musique + vidéo (jobs /audio, audioFrom) ; un agent 1.x antérieur est refusé
/** Ordre de préférence (le premier qui marche gagne).
 *  H.264 d'abord (YouTube / compatibilité) : NVENC (Windows NVIDIA) → VideoToolbox (macOS Apple Silicon) → QSV/AMF → libx264.
 *  HEVC est listé juste après le H.264 du même fabricant ; YouTube accepte HEVC, mais H.264 reste le défaut choisi.
 *  Rang (ENCODER_RANK) : plus petit = préféré pour le choix de nœud vidéo (score dans nodes.js). */
export const ENCODER_ORDER = ['h264_nvenc', 'h264_videotoolbox', 'hevc_nvenc', 'hevc_videotoolbox', 'h264_qsv', 'h264_amf', 'libx264'];
export const ENCODER_RANK = { h264_nvenc: 0, hevc_nvenc: 0, h264_videotoolbox: 1, hevc_videotoolbox: 1, h264_qsv: 2, h264_amf: 2, libx264: 3 };
export const ENCODER_LABEL = { h264_nvenc: 'NVIDIA NVENC (H.264)', hevc_nvenc: 'NVIDIA NVENC (HEVC)', h264_videotoolbox: 'Apple VideoToolbox (H.264)', hevc_videotoolbox: 'Apple VideoToolbox (HEVC)', h264_qsv: 'Intel Quick Sync (H.264)', h264_amf: 'AMD AMF (H.264)', libx264: 'libx264 (processeur)' };
/** Emplacements de travail parallèles par défaut selon l'encodeur. */
export const DEFAULT_SLOTS = { h264_nvenc: 2, hevc_nvenc: 2, h264_videotoolbox: 2, hevc_videotoolbox: 2, h264_qsv: 2, h264_amf: 2, libx264: 1 };
const BITRATE = { '720p': [4, 6], '1080p': [8, 12], '2160p': [25, 35] }; // Mb/s cible / max (encodeurs matériels)

/** Arguments vidéo de l'encodeur. libx264 : exactement ceux du CT (images identiques au bit près). */
export function encoderArgs(enc, s) {
  const g = String(s.fps * 10), [br, mx] = BITRATE[s.res] || BITRATE['1080p'];
  switch (enc) {
    case 'h264_nvenc': case 'hevc_nvenc':
      return ['-c:v', enc, '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', String(Math.max(18, s.crf - 2)), '-b:v', '0', '-maxrate', `${mx}M`, '-bufsize', `${mx * 2}M`, '-g', g, '-bf', '2', '-pix_fmt', 'yuv420p', ...(enc === 'h264_nvenc' ? ['-profile:v', 'high'] : ['-tag:v', 'hvc1'])];
    case 'h264_videotoolbox': case 'hevc_videotoolbox':
      // mode débit (pas -q:v) : cibles YouTube stables ; allow_sw=0 pour un vrai HW ; realtime=0 = hors ligne
      return ['-c:v', enc, '-b:v', `${br}M`, '-maxrate', `${mx}M`, '-bufsize', `${mx * 2}M`, '-g', g,
        '-qmin', '-1', '-qmax', '-1', '-allow_sw', '0', '-realtime', '0', '-prio_speed', '0',
        '-pix_fmt', 'yuv420p', ...(enc === 'h264_videotoolbox' ? ['-profile:v', 'high'] : ['-tag:v', 'hvc1', '-alpha_quality', '0'])];
    case 'h264_qsv': return ['-c:v', enc, '-preset', 'medium', '-global_quality', String(s.crf), '-g', g, '-pix_fmt', 'nv12'];
    case 'h264_amf': return ['-c:v', enc, '-quality', 'quality', '-rc', 'vbr_peak', '-b:v', `${br}M`, '-maxrate', `${mx}M`, '-g', g, '-pix_fmt', 'yuv420p'];
    default: return ['-c:v', 'libx264', '-preset', s.preset || 'veryfast', '-crf', String(s.crf), '-g', g, '-pix_fmt', 'yuv420p', ...(s.x264Params ? ['-x264-params', s.x264Params] : [])];
  }
}

/** Ligne de commande ffmpeg complète (sans le binaire) d'un spec, pour un encodeur et un fichier de sortie (relatif). */
export function buildArgs(spec, enc, out = 'out.mp4', { progress = true, threads = 4 } = {}) {
  return ['-hide_banner', '-loglevel', 'error', '-y', ...(progress ? ['-progress', 'pipe:1', '-nostats'] : []), ...spec.inputs,
    '-filter_complex_threads', String(threads), '-filter_complex', spec.graph, '-map', '[v]', '-map', `${spec.audioIndex ?? 1}:a`,
    ...encoderArgs(enc, spec), '-c:a', 'aac', '-b:a', '384k', '-ar', '48000',
    '-shortest', '-t', Number(spec.dur).toFixed(3), '-r', String(spec.fps), '-movflags', '+faststart',
    '-metadata', `title=${spec.metadata?.title || ''}`, '-metadata', `artist=${spec.metadata?.artist || ''}`, out];
}

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
export const safeName = (n) => typeof n === 'string' && SAFE_NAME.test(n) && !n.includes('..');
/** Contrôle d'un spec reçu (l'agent n'exécute que des entrées connues et des noms de fichiers du job). */
export function validateSpec(spec) {
  if (!spec || spec.v !== SPEC_VERSION) throw new Error('spec : version inconnue');
  if (!(spec.dur > 0 && spec.dur < 6 * 3600)) throw new Error('spec : durée invalide');
  if (![12, 15, 24, 25, 30, 60].includes(spec.fps)) throw new Error('spec : fps invalide');
  if (!['720p', '1080p', '2160p'].includes(spec.res)) throw new Error('spec : résolution invalide');
  if (!(spec.crf >= 10 && spec.crf <= 40)) throw new Error('spec : crf invalide');
  if (spec.preset && !/^[a-z]+$/.test(spec.preset)) throw new Error('spec : preset invalide');
  if (spec.x264Params && !/^[a-z0-9=:_-]+$/i.test(spec.x264Params)) throw new Error('spec : x264Params invalide');
  const names = new Set((spec.files || []).map((f) => f.name));
  for (const f of spec.files || []) if (!safeName(f.name) || !(f.size >= 0)) throw new Error('spec : nom de fichier invalide');
  const FLAGS = new Set(['-loop', '-framerate', '-stream_loop', '-ss', '-i']);
  for (let i = 0; i < spec.inputs.length; i++) {
    const a = spec.inputs[i];
    if (!FLAGS.has(a)) throw new Error(`spec : option refusée ${a}`);
    const v = spec.inputs[++i];
    if (a === '-i' ? !names.has(v) : !/^-?\d+(\.\d+)?$/.test(String(v))) throw new Error(`spec : valeur refusée ${a} ${v}`);
  }
  const g = String(spec.graph || '');
  if (!g || g.length > 400000) throw new Error('spec : filtergraph vide');
  if (/\b(a?movie|sendcmd|zmq|azmq|lv2|ladspa|frei0r|ocr|subtitles|ass)\s*=/.test(g)) throw new Error('spec : filtre refusé');
  for (const m of g.matchAll(/\b(fontfile|textfile)='([^']*)'/g)) if (!names.has(m[2])) throw new Error(`spec : fichier non fourni ${m[2]}`);
  if (spec.metadata) for (const k of ['title', 'artist']) if (String(spec.metadata[k] || '').length > 300) throw new Error('spec : métadonnée trop longue');
  return true;
}

/** Lance ffmpeg (cwd = dossier du job) ; onProgress(f) avec f ∈ [0, 1]. Renvoie { done: Promise, proc }. */
export function runFfmpeg(ffmpeg, args, { cwd, total, onProgress } = {}) {
  const proc = spawn(ffmpeg, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let err = '';
  proc.stderr.on('data', (d) => { err += d; if (err.length > 8000) err = err.slice(-4000); });
  proc.stdout.on('data', (d) => { const m = /out_time_us=(\d+)/.exec(String(d)); if (m && total && onProgress) onProgress(Math.min(1, +m[1] / 1e6 / total)); });
  const done = new Promise((res, rej) => { proc.on('error', rej); proc.on('close', (c, sig) => (c === 0 ? res() : rej(new Error(`ffmpeg ${sig ? 'interrompu (' + sig + ')' : 'code ' + c} : ` + err.trim().slice(-600))))); });
  return { done, proc };
}

/**
 * v1.21.3 : retire d'un filtergraph tous les filtres `name=…` (ex. drawtext absent d'un ffmpeg Homebrew sans freetype).
 * Respecte les guillemets simples et les échappements (`enable='between(t,1,2)'` contient des virgules).
 * Un filtre seul entre deux étiquettes devient `null`. Renvoie { graph, removed }.
 */
export function stripFilter(graph, name = 'drawtext') {
  const g = String(graph || ''); let out = '', i = 0, removed = 0;
  const atBoundary = (k) => k === 0 || /[,;\]\s]/.test(g[k - 1]);
  while (i < g.length) {
    if (g.startsWith(name + '=', i) && atBoundary(i)) {
      let j = i, q = false;
      for (; j < g.length; j++) { const c = g[j]; if (c === '\\') { j++; continue; } if (c === "'") q = !q; else if (!q && (c === ',' || c === ';' || c === '[')) break; }
      removed++;
      if (out.endsWith(',')) { out = out.slice(0, -1); i = j; continue; } // « …,drawtext=… » → « … »
      if (g[j] === ',') { i = j + 1; continue; } // « [a]drawtext=…,format » → « [a]format »
      out += 'null'; i = j; continue; // « [a]drawtext=…[b] » → « [a]null[b] »
    }
    const c = g[i]; out += c; i++;
    if (c === "'") { const k = g.indexOf("'", i); const e = k < 0 ? g.length : k + 1; out += g.slice(i, e); i = e; }
  }
  return { graph: out, removed };
}
/** v1.21.3 : filtres ffmpeg utiles au rendu (drawtext = textes de chapitre ; absent si ffmpeg est compilé sans freetype). */
export function detectFilters(ffmpeg, names = ['drawtext', 'showcqt', 'overlay']) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-filters'], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  if (r.error || r.status !== 0) return Object.fromEntries(names.map((n) => [n, null]));
  return Object.fromEntries(names.map((n) => [n, new RegExp(`^\\s*\\S+\\s+${n}\\s`, 'm').test(r.stdout)]));
}

/** Encodeurs H.264/HEVC réellement utilisables : listés par « ffmpeg -encoders » ET réussissant un mini-encodage (0,2 s). */
export function detectEncoders(ffmpeg, { only = null } = {}) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  if (r.error || r.status !== 0) return { ok: false, error: String(r.error?.message || r.stderr || 'ffmpeg introuvable').slice(0, 300), listed: [], working: [], best: null };
  const listed = ENCODER_ORDER.filter((e) => new RegExp(`\\s${e}\\s`).test(r.stdout));
  const working = [], failed = {};
  for (const enc of listed) {
    if (only && !only.includes(enc)) continue;
    const t = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x336699:s=640x360:r=24:d=0.2', ...encoderArgs(enc, { fps: 24, crf: 26, res: '720p', preset: 'veryfast' }), '-f', 'mp4', '-y', process.platform === 'win32' ? 'NUL' : '/dev/null'],
      { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    if (t.status === 0) working.push(enc); else { const L = String(t.stderr || t.error?.message || '').trim().split('\n'); failed[enc] = (L.find((l) => /error|cannot|fail|not (found|supported|available)|driver|minimum/i.test(l) && !/Nothing was written/.test(l)) || L.pop() || '').slice(0, 200); }
  }
  const v = spawnSync(ffmpeg, ['-hide_banner', '-version'], { encoding: 'utf8', windowsHide: true });
  const filters = detectFilters(ffmpeg);
  return { ok: working.length > 0, listed, working, failed, best: working[0] || null, ffmpeg: String(v.stdout || '').split('\n')[0], filters, drawtext: filters.drawtext !== false };
}
