#!/usr/bin/env node
// Mesures objectives d'un rendu : node tools/measure.mjs <sortie.mp3> '<params JSON>'
// Rend en WAV + MP3, puis mesure (ffmpeg) : LUFS intégré, crête vraie, LRA, énergie > 9 kHz et < 60 Hz
// relative au total (dB), facteur de crête ; affiche temps de rendu et RAM de pointe. Écrit <sortie>.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderTrack } from '../src/engine/render.js';

const [out, json] = process.argv.slice(2);
const P = JSON.parse(json || '{}');
const wav = path.join(os.tmpdir(), `measure-${process.pid}.wav`);
const t0 = Date.now();
const r = await renderTrack({ seed: 2026, duration: 50, ...P }, { wavPath: wav, mp3Path: out });
const renderS = (Date.now() - t0) / 1000;
const rms = (filter) => {
  const a = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-af', `${filter ? filter + ',' : ''}astats=measure_perchannel=none:measure_overall=RMS_level+Peak_level`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const g = (k) => +((a.match(new RegExp(k + ':\\s*(-?[\\d.]+|-inf)', 'g')) || []).pop()?.split(':')[1] ?? NaN);
  return { rms: g('RMS level dB'), peak: g('Peak level dB') };
};
const all = rms(''), hi = rms('highpass=f=9000:poles=2,highpass=f=9000:poles=2'), lo = rms('lowpass=f=60:poles=2,lowpass=f=60:poles=2');
const res = {
  file: out, style: r.params.style, variant: r.params.hiphopStyle || r.params.dnbStyle || null, bpm: r.params.bpm, seconds: +r.seconds.toFixed(1),
  kit: r.meta?.recipe?.groove?.kit, sons: r.meta?.recipe?.sons,
  lufs: r.loudness?.integrated ?? r.loudness?.lufs, truePeak: r.loudness?.truePeak ?? r.loudness?.tp, loudness: r.loudness,
  hf9k_dB: +(hi.rms - all.rms).toFixed(1), sub60_dB: +(lo.rms - all.rms).toFixed(1), crest_dB: +(all.peak - all.rms).toFixed(1),
  renderS: +renderS.toFixed(1), maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024),
};
fs.rmSync(wav, { force: true });
fs.writeFileSync(out.replace(/\.mp3$/, '') + '.json', JSON.stringify(res, null, 1));
console.log(JSON.stringify(res));
