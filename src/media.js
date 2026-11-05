// Bibliothèque d'animations de fond (vidéos MP4/WebM/MOV en boucle, GIF animés, images PNG/JPG) dans <data>/media/.
// Envoi en flux brut (pas de multipart, aucune dépendance) avec limite de taille, puis validation ffprobe + affiche.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { config } from './config.js';

const dir = () => path.join(config.dataDir, 'media');
const indexFile = () => path.join(dir(), 'index.json');
const KIND = { mp4: 'video', webm: 'video', mov: 'video', gif: 'gif', png: 'image', jpg: 'image' };
export const ACCEPT = '.mp4,.webm,.mov,.gif,.png,.jpg,.jpeg,video/mp4,video/webm,video/quicktime,image/gif,image/png,image/jpeg';

function readIndex() { try { const a = JSON.parse(fs.readFileSync(indexFile(), 'utf8')); return Array.isArray(a) ? a : []; } catch { return []; } }
function writeIndex(list) { fs.mkdirSync(dir(), { recursive: true }); const tmp = indexFile() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(list, null, 2)); fs.renameSync(tmp, indexFile()); }
const pub = (m) => ({ ...m, poster: `/api/media/${m.id}/poster.jpg`, url: `/api/media/${m.id}/file` });

export const listMedia = () => readIndex().filter((m) => fs.existsSync(path.join(dir(), m.file))).map(pub);
export function getMedia(id) { const m = readIndex().find((x) => x.id === id); return m && fs.existsSync(path.join(dir(), m.file)) ? { ...pub(m), path: path.join(dir(), m.file), posterPath: path.join(dir(), m.id + '.poster.jpg') } : null; }
export function removeMedia(id) {
  const list = readIndex(), m = list.find((x) => x.id === id); if (!m) return false;
  for (const f of [m.file, m.id + '.poster.jpg']) fs.rmSync(path.join(dir(), f), { force: true });
  writeIndex(list.filter((x) => x.id !== id)); return true;
}
export const cleanName = (s) => String(s || '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>"\\/]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'animation';

function exec(bin, args) {
  return new Promise((res, rej) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; if (err.length > 4000) err = err.slice(-2000); });
    p.on('error', rej); p.on('close', (c) => (c === 0 ? res(out) : rej(new Error(err.trim().slice(-300) || `code ${c}`))));
  });
}
const bad = (msg, status = 415) => Object.assign(new Error(msg), { status });

/** Analyse ffprobe : type (video / gif / image), dimensions, durée. Rejette tout ce qui n'a pas de piste image décodable. */
export async function probeMedia(file) {
  let j; try { j = JSON.parse(await exec(config.ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file])); } catch (e) { throw bad('Fichier illisible ou format inconnu (ffprobe : ' + e.message.split(': ').pop().slice(0, 120) + ')'); }
  const fmt = String(j.format?.format_name || ''), v = (j.streams || []).find((s) => s.codec_type === 'video');
  if (!v || !v.width || !v.height) throw bad('Aucune image ou piste vidéo dans ce fichier');
  let ext = null;
  if (/gif/.test(fmt)) ext = 'gif';
  else if (/png_pipe/.test(fmt) || (fmt === 'image2' && v.codec_name === 'png')) ext = 'png';
  else if (/jpeg_pipe/.test(fmt) || (fmt === 'image2' && /mjpeg/.test(v.codec_name))) ext = 'jpg';
  else if (/matroska|webm/.test(fmt)) ext = 'webm';
  else if (/mov|mp4/.test(fmt)) ext = /qt/.test(j.format?.tags?.major_brand || '') ? 'mov' : 'mp4';
  if (!ext) throw bad(`Format non pris en charge (${fmt.split(',')[0]}) : MP4, WebM, MOV, GIF, PNG ou JPG`);
  if (v.width > 8192 || v.height > 8192) throw bad('Image trop grande (8192 px max)');
  const [n, d] = String(v.avg_frame_rate || v.r_frame_rate || '0/1').split('/').map(Number);
  const duration = +(+j.format?.duration || +v.duration || 0).toFixed(3);
  if (KIND[ext] === 'video' && !(duration > 0.04)) throw bad('Vidéo sans durée exploitable');
  const rot = Math.abs(+(v.side_data_list || []).find((s) => s.rotation != null)?.rotation || +v.tags?.rotate || 0) % 180 === 90;
  return { ext, kind: KIND[ext], codec: v.codec_name, width: rot ? v.height : v.width, height: rot ? v.width : v.height, duration: KIND[ext] === 'image' ? 0 : duration, fps: d ? +(n / d).toFixed(3) : 0 };
}

/** Instant représentatif (affiche, miniature « image de l'animation »). */
export const frameTime = (m) => (m.kind === 'image' ? 0 : Math.min(1, (m.duration || 0) * 0.3));

/** Jette le reste du corps (sans l'écrire) pour que le client reçoive bien la réponse d'erreur ; au-delà de `cap` octets, on coupe. */
function drain(req, cap = 64 * 1048576) {
  return new Promise((res) => {
    if (req.readableEnded || req.destroyed) return res();
    let n = 0; const end = () => { req.off('data', on); res(); };
    const on = (c) => { n += c.length; if (n > cap) end(); };
    req.on('data', on); req.once('end', end); req.once('aborted', end); req.once('close', end); req.resume();
  });
}
/** Enregistre le corps brut d'une requête (flux) : limite de taille, validation, affiche JPEG. */
export async function saveUpload(req, { name } = {}) {
  const max = config.mediaMaxBytes, len = +req.headers['content-length'];
  if (len > max) { await drain(req); throw bad(`Fichier trop volumineux (max ${Math.round(max / 1048576)} Mo)`, 413); }
  fs.mkdirSync(dir(), { recursive: true });
  const id = crypto.randomBytes(6).toString('hex'), tmp = path.join(dir(), `.${id}.upload`);
  try {
    await new Promise((res, rej) => {
      const ws = fs.createWriteStream(tmp); let n = 0, done = false;
      const fail = (e) => { if (done) return; done = true; req.unpipe(ws); ws.destroy(); drain(req).then(() => rej(e)); };
      req.on('data', (c) => { n += c.length; if (n > max) fail(bad(`Fichier trop volumineux (max ${Math.round(max / 1048576)} Mo)`, 413)); });
      req.on('aborted', () => fail(bad('Envoi interrompu', 400)));
      req.on('error', fail); ws.on('error', fail);
      ws.on('finish', () => { if (done) return; done = true; n ? res() : rej(bad('Fichier vide', 400)); });
      req.pipe(ws);
    });
    const info = await probeMedia(tmp);
    const file = `${id}.${info.ext}`, dest = path.join(dir(), file);
    fs.renameSync(tmp, dest);
    try { // l'affiche prouve aussi que la première image se décode
      await exec(config.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...(info.kind === 'image' ? [] : ['-ss', String(frameTime(info))]), '-i', dest, '-frames:v', '1', '-vf', 'scale=480:270:force_original_aspect_ratio=increase,crop=480:270', '-q:v', '4', path.join(dir(), id + '.poster.jpg')]);
    } catch (e) { fs.rmSync(dest, { force: true }); throw bad('Impossible de décoder ce fichier : ' + e.message.slice(0, 160)); }
    const m = { id, name: cleanName(name), file, ...info, size: fs.statSync(dest).size, created: new Date().toISOString() };
    writeIndex([...readIndex(), m]);
    return pub(m);
  } finally { fs.rmSync(tmp, { force: true }); }
}
