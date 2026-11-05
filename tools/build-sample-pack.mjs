#!/usr/bin/env node
// Construit le pack d'échantillons CC0 de soundtube (assets/samples) à partir de
// VCSL (Versilian Community Sample Library) et VSCO 2 CE — tous deux sous licence CC0 1.0 (domaine public).
// + v1.6 (tools/pack-extra.mjs) : Virtuosity Drums, Frankensnare (CC0), Steinway B (VCSL, CC0), Salamander (CC-BY 3.0), jRhodes3d (CC BY-NC 4.0).
// Usage : node tools/build-sample-pack.mjs [--extra-only]   (nécessite ffmpeg + accès à raw.githubusercontent.com ;
//         PACK_SRC=/dossier/des/banques pour réutiliser des fichiers déjà téléchargés)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildExtra } from './pack-extra.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'assets', 'samples');
const CACHE = process.env.PACK_CACHE || '/tmp/soundtube-pack-cache';
const REPOS = { VCSL: 'sgossner/VCSL', VSCO: 'sgossner/VSCO-2-CE' };
const SR = 44100;
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

// id, dépôt, dossier, filtre (regex sur le nom), canaux, durée max (s), tonal ?, couche (fonction nom -> numéro de couche)
const SPECS = [
  { id: 'piano', repo: 'VCSL', dir: 'Chordophones/Zithers/Upright Piano, Yamaha/Sustains', re: /_Sus_[CG][1-6]_vl[13]_rr1\.wav$/, ch: 2, max: 5, tonal: true, layer: (n) => (/vl1/.test(n) ? 0 : 1), title: 'Piano droit Yamaha (VCSL)' },
  { id: 'violins', repo: 'VSCO', dir: 'Strings/Violin Section/susVib', re: /_v[12]\.wav$/, ch: 2, max: 6, tonal: true, layer: (n) => (/_v1/.test(n) ? 0 : 1), title: 'Section de violons, tenu vibrato (VSCO 2 CE)' },
  { id: 'celli', repo: 'VSCO', dir: 'Strings/Cello Section/susvib', re: /_v[13]_1\.wav$/, ch: 2, max: 6, tonal: true, layer: (n) => (/_v1/.test(n) ? 0 : 1), title: 'Section de violoncelles, tenu vibrato (VSCO 2 CE)' },
  { id: 'violins_spic', repo: 'VSCO', dir: 'Strings/Violin Section/Spic', re: /_v2_rr[12]\.wav$/, ch: 2, max: 1.2, tonal: true, layer: () => 0, title: 'Violons spiccato (VSCO 2 CE)' },
  { id: 'celli_spic', repo: 'VSCO', dir: 'Strings/Cello Section/spic', re: /_v2_RR1\.wav$/, ch: 2, max: 1.2, tonal: true, layer: () => 0, title: 'Violoncelles spiccato (VSCO 2 CE)' },
  { id: 'horn', repo: 'VSCO', dir: 'Brass/F Horn/sus', re: /_v[12]_1\.wav$/, ch: 2, max: 5, tonal: true, layer: (n) => (/_v1_/.test(n) ? 0 : 1), title: 'Cor en fa, tenu (VSCO 2 CE)' },
  { id: 'harp', repo: 'VSCO', dir: 'Strings/Harp', re: /KSHarp_[A-G]#?[1-6]_m?f\.wav$/, ch: 2, max: 4, tonal: true, layer: () => 0, title: 'Harpe (VSCO 2 CE)' },
  { id: 'vibes', repo: 'VCSL', dir: 'Idiophones/Struck Idiophones/Vibraphone', re: /Vibes_(soft_.*_v1|hard_.*_v2)_rr1_Main\.wav$/, ch: 2, max: 4, tonal: true, octave: 12, layer: (n) => (/soft/.test(n) ? 0 : 1), title: 'Vibraphone (VCSL)' },
  { id: 'upbass', repo: 'VSCO', dir: 'Strings/Solo Contrabass/Pizz', re: /_v[13]_rr1\.wav$/, ch: 2, max: 2.5, tonal: true, layer: (n) => (/_v1_/.test(n) ? 0 : 1), title: 'Contrebasse pizzicato (VSCO 2 CE)' },
  { id: 'violins_pizz', repo: 'VSCO', dir: 'Strings/Violin Section/Pizz', re: /_v2_rr1\.wav$/, ch: 2, max: 1.5, tonal: true, layer: () => 0, title: 'Violons pizzicato (VSCO 2 CE)' },
  { id: 'celli_pizz', repo: 'VSCO', dir: 'Strings/Cello Section/pizzT', re: /_v2_RR1\.wav$/, ch: 2, max: 1.8, tonal: true, layer: () => 0, title: 'Violoncelles pizzicato (VSCO 2 CE)' },
  { id: 'flute', repo: 'VSCO', dir: 'Woodwinds/Flute/susvib', re: /_v1_1\.wav$/, ch: 2, max: 4, tonal: true, layer: () => 0, title: 'Flûte, tenu vibrato (VSCO 2 CE)' },
  // percussions (non tonales) : kind = élément de batterie
  { id: 'snare', repo: 'VCSL', dir: 'Membranophones/Struck Membranophones/Snare Drum, Modern 1', re: /HitSN_v(5|7|9)_rr[12]_Mid\.wav$/, ch: 2, max: 0.9, layer: (n) => ({ 5: 0, 7: 1, 9: 2 })[n.match(/_v(\d)/)[1]], title: 'Caisse claire moderne (VCSL)' },
  { id: 'snare_ghost', repo: 'VCSL', dir: 'Membranophones/Struck Membranophones/Snare Drum, Modern 1', re: /taps_v4_rr[12]_Mid\.wav$/, ch: 2, max: 0.5, layer: () => 0, title: 'Caisse claire, notes fantômes (VCSL)' },
  { id: 'rim', repo: 'VCSL', dir: 'Membranophones/Struck Membranophones/Snare Drum, Modern 1', re: /stick_v1_rr[12]_Mid\.wav$/, ch: 2, max: 0.4, layer: () => 0, title: 'Cross-stick (VCSL)' },
  { id: 'hat', repo: 'VCSL', dir: 'Idiophones/Struck Idiophones/Hi-Hat Cymbal', re: /HitC_v[1-4]_rr[12]_Mid\.wav$/, ch: 2, max: 0.5, layer: (n) => +n.match(/_v(\d)/)[1] - 1, title: 'Charleston fermé (VCSL)' },
  { id: 'ohat', repo: 'VCSL', dir: 'Idiophones/Struck Idiophones/Hi-Hat Cymbal', re: /(HitO_rr1|HitLoose_rr1)_Mid\.wav$/, ch: 2, max: 1.4, layer: () => 0, title: 'Charleston ouvert (VCSL)' },
  { id: 'clap', repo: 'VCSL', dir: 'Idiophones/Struck Idiophones/Claps', re: /^Clap_rr[1-6]\.wav$/, ch: 2, max: 0.6, layer: () => 0, title: 'Claps (VCSL)' },
  { id: 'shaker', repo: 'VCSL', dir: 'Idiophones/Struck Idiophones/Shaker, Small', re: /ShakerDouble_(Up|Down)_rr[12]\.wav$/, ch: 2, max: 0.4, layer: () => 0, title: 'Shaker (VCSL)' },
  { id: 'tamb', repo: 'VCSL', dir: 'Idiophones/Struck Idiophones/Tambourine 1', re: /(Hit_v[12]|Shake_rr[12])_rr1?_?Mid\.wav$|Shake_rr[12]_Mid\.wav$/, ch: 2, max: 0.8, layer: () => 0, title: 'Tambourin (VCSL)' },
  { id: 'tomh', repo: 'VCSL', dir: 'Membranophones/Struck Membranophones/Tom 1', re: /TomH_HitS_v3_rr[12]_Mid\.wav$/, ch: 2, max: 1.2, layer: () => 0, title: 'Tom aigu (VCSL)' },
  { id: 'toml', repo: 'VCSL', dir: 'Membranophones/Struck Membranophones/Tom 2', re: /TomL_HitS_v3_rr[12]_Mid\.wav$/, ch: 2, max: 1.4, layer: () => 0, title: 'Tom grave (VCSL)' },
  { id: 'bassdrum', repo: 'VCSL', dir: 'Membranophones/Struck Membranophones/Bass Drum 1', re: /hit_v(5|7)_rr1_Sum\.wav$/, ch: 2, max: 2.5, layer: (n) => (/v5/.test(n) ? 0 : 1), title: 'Grosse caisse de concert (VCSL)' },
  { id: 'timpani', repo: 'VCSL', dir: 'Membranophones/Struck Membranophones/Timpani 1', re: /Timpani[24]_Hit_v4_rr1_Sum\.wav$|Timpani2_Roll_v5_rr1_Sum\.wav$/, ch: 2, max: 4, layer: () => 0, title: 'Timbales (VCSL)' },
  { id: 'crash', repo: 'VCSL', dir: 'Idiophones/Struck Idiophones/Suspended Cymbal 1', re: /susCymb1_hit_(f1|mp1)\.wav$/, ch: 2, max: 3.5, layer: () => 0, title: 'Cymbale suspendue (VCSL)' },
  { id: 'swell', repo: 'VCSL', dir: 'Idiophones/Struck Idiophones/Suspended Cymbal 1', re: /susCymb1_cresc_(2s|4s)\.wav$/, ch: 2, max: 5, layer: () => 0, title: 'Montée de cymbale (VCSL)' },
];

async function tree(repo) {
  const f = path.join(CACHE, repo.replace('/', '_') + '.json');
  if (!fs.existsSync(f)) { const r = await fetch(`https://api.github.com/repos/${repo}/git/trees/master?recursive=1`); fs.writeFileSync(f, await r.text()); }
  return JSON.parse(fs.readFileSync(f, 'utf8')).tree;
}
async function download(repo, p) {
  const f = path.join(CACHE, 'raw', repo.replace('/', '_'), p);
  if (fs.existsSync(f) && fs.statSync(f).size > 0) return f;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const url = `https://raw.githubusercontent.com/${repo}/master/${p.split('/').map(encodeURIComponent).join('/')}`;
  for (let k = 0; k < 3; k++) {
    const r = await fetch(url); if (r.ok) { fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); return f; }
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error('téléchargement impossible : ' + url);
}
function decode(file, ch) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', String(ch), '-ar', String(SR), 'pipe:1'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(String(r.stderr));
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
}
function encode(data, ch, out) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ac', String(ch), '-ar', String(SR), '-i', 'pipe:0', '-sample_fmt', 's16', '-compression_level', '8', out], { input: Buffer.from(data.buffer, data.byteOffset, data.byteLength) });
  if (r.status !== 0) throw new Error(String(r.stderr));
}
/** Hauteur estimée (MIDI, fractionnaire) par autocorrélation normalisée. */
function detectMidi(mono) {
  const s = Math.floor(0.15 * SR), n = Math.min(8192, mono.length - s); if (n < 2048) return null;
  const x = mono.subarray(s, s + n); let best = 0, lag = 0;
  for (let L = Math.floor(SR / 2000); L < Math.min(n / 2, SR / 30); L++) {
    let a = 0, b = 0, c = 0; for (let i = 0; i < n - L; i += 2) { a += x[i] * x[i + L]; b += x[i] * x[i]; c += x[i + L] * x[i + L]; }
    const r = a / Math.sqrt(b * c + 1e-12); if (r > best) { best = r; lag = L; }
  }
  if (best < 0.6) return null;
  return 69 + 12 * Math.log2(SR / lag / 440);
}

// --extra-only : ne reconstruit que les banques ajoutées en v1.6 (pack-extra.mjs), en gardant le reste du manifeste
const EXTRA_ONLY = process.argv.includes('--extra-only');
const manifest = EXTRA_ONLY ? JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')) : { license: 'CC0-1.0', sources: {}, instruments: {} };
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(CACHE, 'raw'), { recursive: true });
for (const sp of EXTRA_ONLY ? [] : SPECS) {
  const t = await tree(REPOS[sp.repo]);
  const files = t.filter((x) => x.type === 'blob' && x.path.startsWith(sp.dir + '/') && sp.re.test(x.path.split('/').pop()));
  const zones = []; const offs = [];
  fs.mkdirSync(path.join(OUT, sp.id), { recursive: true });
  for (const f of files) {
    const name = f.path.split('/').pop();
    const local = await download(REPOS[sp.repo], f.path);
    let d = decode(local, sp.ch);
    const ch = sp.ch, frames = d.length / ch;
    // début : premier échantillon > -54 dBFS (2 ms de marge)
    let st = 0; while (st < frames && Math.abs(d[st * ch]) < 0.002 && Math.abs(d[st * ch + ch - 1]) < 0.002) st++;
    st = Math.max(0, st - Math.round(0.002 * SR));
    const len = Math.min(frames - st, Math.round(sp.max * SR));
    const o = new Float32Array(len * ch);
    let pk = 1e-9; for (let i = 0; i < len * ch; i++) { o[i] = d[st * ch + i]; pk = Math.max(pk, Math.abs(o[i])); }
    const fade = Math.min(len, Math.round((sp.tonal ? 0.12 : 0.03) * SR));
    for (let i = 0; i < fade; i++) { const g = 1 - i / fade; for (let c = 0; c < ch; c++) o[(len - fade + i) * ch + c] *= g; }
    for (let i = 0; i < o.length; i++) o[i] *= 0.89 / pk;
    const base = name.replace(/\.wav$/i, '').replace(/[^\w#\-]+/g, '_');
    const outName = base.replace(/#/g, 's') + '.flac';
    encode(o, ch, path.join(OUT, sp.id, outName));
    const z = { file: `${sp.id}/${outName}`, layer: sp.layer(name), peak: +pk.toFixed(4), seconds: +(len / SR).toFixed(3) };
    if (sp.tonal) {
      const m = name.match(/_([A-G]#?)(-?\d)(?=_|\.|$)/);
      z.named = (+m[2] + 1) * 12 + NOTE[m[1]];
      const mono = new Float32Array(len); for (let i = 0; i < len; i++) mono[i] = (o[i * ch] + o[i * ch + ch - 1]) / 2;
      const det = detectMidi(mono);
      if (det != null) { offs.push(Math.round((det - z.named) / 12) * 12); z.detected = +det.toFixed(2); }
    }
    zones.push(z);
    process.stdout.write('.');
  }
  if (sp.tonal) {
    const cnt = {}; for (const o of offs) cnt[o] = (cnt[o] || 0) + 1;
    const off = sp.octave ?? (+Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || 0);
    for (const z of zones) z.midi = z.named + off;
    manifest.instruments[sp.id] = { title: sp.title, tonal: true, octaveFix: off, zones };
  } else manifest.instruments[sp.id] = { title: sp.title, tonal: false, zones };
  manifest.sources[sp.id] = `https://github.com/${REPOS[sp.repo]}/tree/master/${sp.dir}`;
  console.log(`\n${sp.id}: ${zones.length} échantillons`);
}
await buildExtra(manifest);
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
if (!EXTRA_ONLY) fs.writeFileSync(path.join(OUT, 'LICENSE.txt'), `Échantillons sonores de soundtube — licence CC0 1.0 Universel (domaine public)
https://creativecommons.org/publicdomain/zero/1.0/

Sources (toutes publiées sous CC0 1.0 par Versilian Studios / Sam Gossner) :
 - VCSL — Versilian Community Sample Library : https://github.com/sgossner/VCSL
 - VSCO 2 Community Edition : https://github.com/sgossner/VSCO-2-CE

Traitement : rognage du silence initial, longueur limitée, fondu de fin, normalisation, conversion FLAC 44,1 kHz.
Aucune attribution n'est requise (CC0) ; ces sons peuvent être utilisés dans des vidéos YouTube monétisées.
Détail des fichiers et de leur provenance : manifest.json
`);
if (!EXTRA_ONLY) { const legal = await (await fetch('https://raw.githubusercontent.com/sgossner/VCSL/master/LICENSE')).text();
fs.writeFileSync(path.join(OUT, 'CC0-1.0-legalcode.txt'), legal); }
console.log('OK');
