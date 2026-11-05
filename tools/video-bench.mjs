#!/usr/bin/env node
// Banc d'essai vidéo : node tools/video-bench.mjs <style> <graine> <durée s> <dossier> [720p,1080p,4k]
// Rend un morceau court (WAV), puis la miniature et la vidéo à chaque résolution ; affiche temps, vitesse (× temps réel) et taille.
import fs from 'node:fs';
import path from 'node:path';
import { renderTrack } from '../src/engine/render.js';
import { makeVideo, makeThumbnail, resolutionOf, RESOLUTIONS } from '../src/youtube.js';
const [style = 'synthwave', seed = '2026', dur = '75', dir = '/tmp/vbench', list = '720p,1080p,4k'] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
const wav = path.join(dir, 'track.wav');
const r = await renderTrack({ style, seed: +seed, duration: +dur }, { wavPath: wav });
const t = { id: 'bench', title: r.title || 'Aube de néon', style, params: r.params || { style, duration: +dur }, meta: r.meta, duration: r.seconds };
const out = [];
for (const res of list.split(',')) {
  const id = resolutionOf(res), R = RESOLUTIONS[id];
  let t0 = Date.now(); await makeThumbnail(t, path.join(dir, `thumb-${id}.jpg`), id); const thumbMs = Date.now() - t0;
  t0 = Date.now(); const v = await makeVideo(t, wav, path.join(dir, `video-${id}.mp4`), null, { resolution: id }); const s = (Date.now() - t0) / 1000;
  const size = fs.statSync(path.join(dir, `video-${id}.mp4`)).size;
  out.push({ resolution: id, size: `${R.w}x${R.h}`, fps: v.fps, encodeS: +s.toFixed(1), xRealtime: +(t.duration / s).toFixed(1), MB: +(size / 1e6).toFixed(1), thumbMs });
}
console.log(JSON.stringify({ seconds: t.duration, out }, null, 1));
