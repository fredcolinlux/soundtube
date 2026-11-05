// Durée réelle des fichiers produits (ffprobe sur le WAV et le MP3) comparée à la durée demandée : écart toléré 5 %.
// node test/duration.js           → jeu complet (1, 3, 7, 10 min et 1 h ; plusieurs styles, tempos et mesures)
// node test/duration.js --quick   → sous-ensemble rapide (utilisé par npm test)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderTrack } from '../src/engine/render.js';

const quick = process.argv.includes('--quick');
const ffprobe = process.env.SOUNDTUBE_FFPROBE || 'ffprobe';
const hasProbe = spawnSync(ffprobe, ['-version']).status === 0;
const CASES = [
  { style: 'lofi', duration: 60 },
  { style: 'techno', duration: 60, bpm: 180 },
  { style: 'ambient', duration: 180, bpm: 50, adv: { meter: '3/4' } },
  { style: 'trap', duration: 180 },
  { style: 'synthwave', duration: 420 },
  { style: 'cinematic', duration: 420, adv: { meter: '6/8' } },
  { style: 'house', duration: 420, bpm: 60, adv: { meter: '3/4' } },
  { style: 'chiptune', duration: 600 },
  { style: 'lofi', duration: 600, bpm: 52, adv: { meter: '6/8' } },
  { style: 'techno', duration: 3600, adv: { meter: '3/4' } },
  { style: 'hiphop', duration: 300, adv: { hiphopStyle: 'boombap' } },
  { style: 'dnb', duration: 300, adv: { dnbStyle: 'jungle' } },
  { style: 'dnb', duration: 3600, adv: { dnbStyle: 'liquid' } },
];
const list = quick ? CASES.filter((c, i) => [0, 4].includes(i)) : CASES;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-dur-'));
const probe = (f) => +spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();
const fmt = (s) => { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
let fail = 0;
if (!hasProbe) console.log('ffprobe absent : durée mesurée sur le nombre d\'échantillons uniquement');
for (const [i, c] of list.entries()) {
  const wav = path.join(tmp, `t${i}.wav`), mp3 = path.join(tmp, `t${i}.mp3`);
  const r = await renderTrack({ seed: 777 + i, ...c }, { wavPath: wav, mp3Path: hasProbe ? mp3 : null });
  const dW = hasProbe ? probe(wav) : r.seconds, dM = hasProbe ? probe(mp3) : r.seconds;
  const worst = Math.max(Math.abs(dW / c.duration - 1), Math.abs(dM / c.duration - 1));
  const ok = worst <= 0.05;
  if (!ok) fail++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${c.style.padEnd(9)} ${String(r.params.bpm).padStart(3)} BPM ${(r.params.adv.meter || '4/4').padEnd(3)} demandé ${fmt(c.duration).padStart(5)} → WAV ${fmt(dW)} · MP3 ${fmt(dM)} (écart ${(worst * 100).toFixed(1)} %)`);
  fs.rmSync(wav, { force: true }); fs.rmSync(mp3, { force: true });
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `${fail} durée(s) hors tolérance` : 'Durées conformes (±5 %).');
process.exit(fail ? 1 : 0);
