// Rend un extrait de démonstration : node tools/demo.mjs <sortie.mp3> '<params JSON>'
// ex. node tools/demo.mjs samples/kit-808.mp3 '{"style":"trap","seed":808,"duration":45,"adv":{"drumKit":"tr808"}}'
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { renderTrack } from '../src/engine/render.js';
const [out, json] = process.argv.slice(2);
const P = JSON.parse(json || '{}');
const tmp = path.join(os.tmpdir(), `demo-${process.pid}.wav`);
const t0 = Date.now();
const r = await renderTrack({ seed: 2026, duration: 45, ...P }, { wavPath: tmp, mp3Path: out });
fs.rmSync(tmp, { force: true });
console.log(`${out} : ${r.params.style} ${r.params.bpm} BPM, ${r.seconds.toFixed(1)} s, kit ${r.params.flavor?.groove?.kit ?? '?'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`, r.loudness ? JSON.stringify(r.loudness) : '');
