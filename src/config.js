// Configuration via variables d'environnement (voir deploy/soundtube.env).
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;

export const config = {
  root,
  host: env.SOUNDTUBE_HOST || '0.0.0.0',
  port: parseInt(env.SOUNDTUBE_PORT || '8080', 10),
  dataDir: path.resolve(env.SOUNDTUBE_DATA_DIR || path.join(root, 'data')),
  maxConcurrentJobs: Math.max(1, parseInt(env.SOUNDTUBE_MAX_JOBS || String(Math.min(2, os.cpus().length)), 10)),
  maxQueue: parseInt(env.SOUNDTUBE_MAX_QUEUE || '50', 10),
  maxDuration: parseInt(env.SOUNDTUBE_MAX_DURATION || '14400', 10),
  mp3: (env.SOUNDTUBE_MP3 || 'auto').toLowerCase(), // auto | on | off
  mp3Bitrate: env.SOUNDTUBE_MP3_BITRATE || '320k',
  ffmpegPath: env.SOUNDTUBE_FFMPEG || 'ffmpeg',
  ffprobePath: env.SOUNDTUBE_FFPROBE || path.join(path.dirname(env.SOUNDTUBE_FFMPEG || 'ffmpeg'), path.basename(env.SOUNDTUBE_FFMPEG || 'ffmpeg').replace(/ffmpeg/i, 'ffprobe')).replace(/^\.\//, ''),
  mediaMaxBytes: Math.max(1, parseFloat(env.SOUNDTUBE_MEDIA_MAX_MB || '500')) * 1024 * 1024, // taille max d'une animation importée
  artist: env.SOUNDTUBE_ARTIST || 'soundtube',
  lufs: parseFloat(env.SOUNDTUBE_LUFS || '-14'),
  truePeak: parseFloat(env.SOUNDTUBE_TRUE_PEAK || '-1'),
  keepWav: (env.SOUNDTUBE_KEEP_WAV || 'true') !== 'false',
  publicDir: path.join(root, 'public'),
  localVideoSlots: Math.max(1, parseInt(env.SOUNDTUBE_LOCAL_VIDEO_SLOTS || '1', 10)), // vidéos rendues en même temps sur le CT (secours)
};
