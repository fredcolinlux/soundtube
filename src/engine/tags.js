// Métadonnées des fichiers : WAV (chunk LIST/INFO dans une zone réservée, réécrivable sur place) et MP3 (ID3v2.3 via ffmpeg).
import fs from 'node:fs';
import { spawn } from 'node:child_process';

export const WAV_TAG_BYTES = 2048; // zone réservée LIST + JUNK juste après « fmt »
const INFO = [['INAM', 'title'], ['IART', 'artist'], ['IPRD', 'album'], ['IGNR', 'genre'], ['ICRD', 'date'], ['ICMT', 'comment'], ['ICOP', 'copyright'], ['ISFT', 'software'], ['IKEY', 'keywords']];

/** Zone LIST/INFO + JUNK de taille fixe WAV_TAG_BYTES (les lecteurs ignorent JUNK). */
export function wavInfoRegion(tags = {}) {
  const parts = []; let size = 4; // 'INFO'
  for (const [id, k] of INFO) {
    if (tags[k] == null || tags[k] === '') continue;
    let b = Buffer.from(String(tags[k]) + '\0', 'utf8');
    if (b.length > 600) b = Buffer.concat([b.subarray(0, 599), Buffer.from([0])]);
    const pad = b.length & 1, h = Buffer.alloc(8); h.write(id, 0, 'ascii'); h.writeUInt32LE(b.length, 4);
    if (size + 8 + b.length + pad > WAV_TAG_BYTES - 8 - 8) break;
    parts.push(h, b, Buffer.alloc(pad)); size += 8 + b.length + pad;
  }
  const out = Buffer.alloc(WAV_TAG_BYTES);
  out.write('LIST', 0, 'ascii'); out.writeUInt32LE(size, 4); out.write('INFO', 8, 'ascii');
  Buffer.concat(parts).copy(out, 12);
  const j = 8 + size; out.write('JUNK', j, 'ascii'); out.writeUInt32LE(WAV_TAG_BYTES - j - 8, j + 4);
  return out;
}
/** Réécrit les métadonnées d'un WAV produit par soundtube (zone LIST à l'octet 36) ; false si format ancien. */
export function retagWav(file, tags) {
  const fd = fs.openSync(file, 'r+');
  try {
    const h = Buffer.alloc(48); fs.readSync(fd, h, 0, 48, 0);
    if (h.toString('ascii', 36, 40) !== 'LIST' || h.toString('ascii', 44, 48) !== 'INFO') return false;
    fs.writeSync(fd, wavInfoRegion(tags), 0, WAV_TAG_BYTES, 36); return true;
  } finally { fs.closeSync(fd); }
}
/** Arguments ffmpeg pour écrire les balises ID3v2.3 (+ ID3v1). */
export function id3Args(tags = {}) {
  const map = { title: 'title', artist: 'artist', album: 'album', album_artist: 'album_artist', genre: 'genre', date: 'date', comment: 'comment', copyright: 'copyright', bpm: 'TBPM', key: 'TKEY', publisher: 'publisher' };
  const a = ['-id3v2_version', '3', '-write_id3v1', '1'];
  for (const [k, id] of Object.entries(map)) if (tags[k] != null && tags[k] !== '') a.push('-metadata', `${id}=${String(tags[k]).replace(/\0/g, '')}`);
  return a;
}
/** Réécrit les balises d'un MP3 (copie du flux, sans réencodage). */
export function retagMp3(file, tags, ffmpeg = 'ffmpeg') {
  const tmp = file + '.tag.tmp.mp3';
  return new Promise((res, rej) => {
    const p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-map', '0:a', '-c', 'copy', '-map_metadata', '-1', ...id3Args(tags), tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err += d; });
    p.on('error', rej);
    p.on('close', (c) => { if (c === 0) { fs.renameSync(tmp, file); res(true); } else { try { fs.rmSync(tmp, { force: true }); } catch {} rej(new Error('ffmpeg tags : ' + err)); } });
  });
}
