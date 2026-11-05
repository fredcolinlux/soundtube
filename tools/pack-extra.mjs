// Extension v1.6 du pack : batteries acoustiques (pré-mixées, voir premix-drums.mjs), pianos Steinway B (VCSL, CC0)
// et Salamander Grand V3 (CC-BY 3.0, Alexander Holm), Rhodes jRhodes3d (CC BY-NC 4.0 pour les échantillons,
// musique produite CC0 ; Jeff Learman). FLAC 16 bits 44,1 kHz, attaque recalée, ~8 s max (moins dans l'aigu), fondu de fin.
import fs from 'node:fs';
import path from 'node:path';
import { SR, ROOT, OUT, sourceList, fetchSource, decodedName, decode, encode, detectMidi, onset, trim, peakOf } from './pack-common.mjs';
import { premixDrums } from './premix-drums.mjs';

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const toMidi = (n, acc, oct) => 12 * (+oct + 1) + NOTE[n] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0);
// longueur gardée selon le registre (les aigus s'éteignent vite)
const maxLen = (m) => (m < 48 ? 8 : m < 60 ? 7.5 : m < 72 ? 6.5 : m < 84 ? 5 : 3.5);

const TONAL = [
  { id: 'steinwayb', list: 'steinwayb', local: ['vcsl-steinway'], title: 'Piano à queue Steinway B (VCSL, micro close)', license: 'CC0-1.0', credit: 'VCSL — Versilian Studios (Sam Gossner) ; piano JH',
    source: 'https://github.com/sgossner/VCSL/tree/master/Chordophones/Zithers/Grand%20Piano%2C%20Steinway%20B/Sus', detect: true,
    parse: (f) => { const m = f.match(/_Close_([A-G])(#?)(\d)_vl(\d)_/); return m && { named: toMidi(m[1], m[2], m[3]), layer: m[4] === '2' ? 0 : 1 }; } },
  { id: 'salamander', list: 'salamander', local: ['salamander'], title: 'Salamander Grand Piano V3 (Yamaha C5)', license: 'CC-BY-3.0', credit: 'Alexander Holm — Salamander Grand Piano V3',
    source: 'https://github.com/sfzinstruments/SalamanderGrandPiano', detect: false,
    parse: (f) => { const m = f.match(/^([A-G])(#?)(\d)v(\d+)\.flac$/); return m && { named: toMidi(m[1], m[2], m[3]), layer: { 4: 0, 8: 1, 12: 2, 15: 3 }[m[4]] }; } },
  { id: 'jrhodes', list: 'jrhodes3d', local: ['jrhodes3d'], title: 'Rhodes Mark I Stage 73 (1977) — jRhodes3d, stéréo, non bouclé', license: 'CC-BY-NC-4.0 (échantillons) / CC0 (musique produite)', credit: 'Jeff Learman — jRhodes3d',
    source: 'https://github.com/sfzinstruments/jlearman.jRhodes3d', detect: false,
    parse: (f) => { const m = f.match(/^\w+_(\d{3})__.*_(\d)-ST\.flac$/); return m && { named: +m[1], layer: +m[2] - 1 }; } },
];

async function buildTonal(sp, manifest, log) {
  const urls = sourceList(sp.list).filter((u) => sp.parse(decodedName(u)));
  const items = [];
  for (const u of urls) {
    const name = decodedName(u), z = sp.parse(name);
    const x = decode(await fetchSource(u, sp.local), 2);
    const st = onset(x, 2);
    items.push({ ...z, name, x, st });
  }
  // correction d'octave (noms VCSL parfois décalés) par vote des hauteurs détectées
  const offs = {};
  for (const it of items) {
    const len = Math.min(it.x.length / 2 - it.st, SR);
    const mono = new Float32Array(len); for (let i = 0; i < len; i++) mono[i] = (it.x[(it.st + i) * 2] + it.x[(it.st + i) * 2 + 1]) / 2;
    const det = detectMidi(mono);
    if (det != null) { it.detected = +det.toFixed(2); const o = Math.round((det - it.named) / 12) * 12; offs[o] = (offs[o] || 0) + 1; }
  }
  const off = sp.detect ? +(Object.entries(offs).sort((a, b) => b[1] - a[1])[0]?.[0] || 0) : 0;
  let pk = 1e-9; const trimmed = items.map((it) => { const o = trim(it.x, 2, it.st, maxLen(it.named + off), 0.8); pk = Math.max(pk, peakOf(o)); return o; });
  const g = 0.89 / pk, zones = [];
  fs.rmSync(path.join(OUT, sp.id), { recursive: true, force: true });
  items.forEach((it, k) => {
    const o = trimmed[k]; for (let i = 0; i < o.length; i++) o[i] *= g;
    const file = `${sp.id}/${it.name.replace(/\.(wav|flac)$/i, '').replace(/#/g, 's').replace(/[^\w\-]+/g, '_')}.flac`;
    encode(o, 2, path.join(OUT, file));
    const z = { file, layer: it.layer, named: it.named, midi: it.named + off, peak: +peakOf(o).toFixed(4), seconds: +(o.length / 2 / SR).toFixed(3) };
    if (it.detected != null) z.detected = it.detected;
    zones.push(z);
  });
  zones.sort((a, b) => a.midi - b.midi || a.layer - b.layer);
  manifest.instruments[sp.id] = { title: sp.title, tonal: true, octaveFix: off, license: sp.license, credit: sp.credit, zones };
  manifest.sources[sp.id] = sp.source;
  log(`${sp.id}: ${zones.length} échantillons, octave ${off >= 0 ? '+' : ''}${off} (votes ${JSON.stringify(offs)})`);
}

export async function buildExtra(manifest, log = console.log) {
  manifest.sources ||= {}; manifest.instruments ||= {};
  for (const id of Object.keys(manifest.instruments)) if (/^(vd|vl|fs)_/.test(id)) { delete manifest.instruments[id]; fs.rmSync(path.join(OUT, id), { recursive: true, force: true }); }
  await premixDrums(manifest, log);
  for (const sp of TONAL) await buildTonal(sp, manifest, log);
  manifest.license = 'mixte — voir CREDITS.md (CC0 sauf Salamander CC-BY 3.0 et jRhodes3d CC BY-NC 4.0)';
  // licences
  const L = path.join(OUT, 'licenses'); fs.mkdirSync(L, { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'tools', 'pack-sources', 'licenses'))) fs.copyFileSync(path.join(ROOT, 'tools', 'pack-sources', 'licenses', f), path.join(L, f));
}
