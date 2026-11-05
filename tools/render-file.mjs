#!/usr/bin/env node
// Rendu en ligne de commande (sans serveur) : node tools/render-file.mjs <style> <graine> <durée s> <mix on|off|auto> <sortie.wav> [sortie.mp3]
// Affiche le temps de rendu, la RAM de pointe (maxRSS) et le JSON des métadonnées utiles (tracklist du mix).
import fs from 'node:fs';
import { renderTrack } from '../src/engine/render.js';
const [style = 'techno', seed = '42', dur = '3600', mix = 'auto', wav = '/tmp/out.wav', mp3 = null] = process.argv.slice(2);
const t0 = Date.now(); let peakHeap = 0;
const r = await renderTrack({ style, seed: +seed, duration: +dur, adv: mix === 'auto' ? {} : { mix } }, {
  wavPath: wav, mp3Path: mp3 || null,
  onProgress: () => { const h = process.memoryUsage().rss; if (h > peakHeap) peakHeap = h; },
});
const out = {
  style, seed: +seed, duration: +dur, mix, seconds: +r.seconds.toFixed(2), renderS: +((Date.now() - t0) / 1000).toFixed(1),
  speed: +(r.seconds / ((Date.now() - t0) / 1000)).toFixed(1), maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024),
  loudness: r.loudness, mixStats: r.mixStats || null,
  tracklist: r.meta?.mix?.decks?.map((d) => ({ time: d.time, name: d.name, camelot: d.camelot, bpm: d.bpm, sub: d.sub, energy: d.energy, tr: d.transitionOut?.type })) || null,
};
fs.writeFileSync(wav.replace(/\.wav$/, '') + '.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, tracklist: out.tracklist?.length }));
