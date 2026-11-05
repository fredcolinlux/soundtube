#!/usr/bin/env node
// Pré-mixage des micros des batteries CC0 (Virtuosity Drums, Karoryfer Frankensnare) en one-shots mono 44,1 kHz,
// FLAC 16 bits. Remplace l'ancien script Python de la recherche : tout reste en Node.js (+ ffmpeg).
// Les micros d'une même frappe sont alignés (enregistrés ensemble) : on les additionne avec un gain par micro,
// puis on rogne le silence initial sur la somme. Les niveaux relatifs entre nuances sont conservés
// (normalisation par instrument, pas par frappe) et la RMS d'attaque de chaque fichier est notée dans le manifeste.
// Usage seul : PACK_SRC=/chemin/banques node tools/premix-drums.mjs   (sinon appelé par build-sample-pack.mjs)
import path from 'node:path';
import { SR, OUT, sourceList, fetchSource, decode, encode, onset, trim, peakOf, attackRms } from './pack-common.mjs';

const VD = 'https://github.com/sfzinstruments/virtuosity_drums';
const FS = 'https://github.com/sfzinstruments/karoryfer.frankensnare';
// id : { art (articulation Virtuosity), mics [[micro, gain]], max (s), layer(vl,rr) -> couche 0..3 }
const L4 = (vl) => vl - 1;                       // 4 nuances
const L3 = (vl) => [0, 2, 3][vl - 1];            // 3 nuances -> couches 0, 2, 3
const per = (k) => (vl) => Math.min(3, Math.floor((vl - 1) / k)); // n nuances sans round-robin -> 4 couches
const KITS = {
  vd: { title: 'Virtuosity Drums (kit acoustique, micros close + OH + room)', mics: null, items: {
    kick: { art: 'kick_snoff', mics: [['kickmic', 1], ['oh', 0.45], ['room', 0.35]], max: 0.9, layer: L4, title: 'grosse caisse' },
    snare: { art: 'snare_center', mics: [['snaremic', 1], ['oh', 0.6], ['room', 0.45]], max: 1.0, layer: per(9), title: 'caisse claire (36 frappes -> 4 nuances x 9)' },
    ghost: { art: 'snare_muted', mics: [['snaremic', 1], ['oh', 0.5]], max: 0.5, layer: per(4), title: 'caisse claire étouffée (notes fantômes)' },
    rimshot: { art: 'snare_rimshot', mics: [['snaremic', 1], ['oh', 0.6], ['room', 0.45]], max: 1.0, layer: per(3), title: 'rimshot' },
    xstick: { art: 'snare_crossstick', mics: [['snaremic', 1], ['oh', 0.5]], max: 0.5, layer: per(4), title: 'cross-stick' },
    hat: { art: 'hh_closed', mics: [['oh', 1], ['mid', 0.4]], max: 0.45, layer: L4, title: 'charleston fermé' },
    hhalf: { art: 'hh_half', mics: [['oh', 1], ['mid', 0.4]], max: 0.8, layer: L4, title: 'charleston demi-ouvert' },
    ohat: { art: 'hh_open', mics: [['oh', 1], ['mid', 0.4]], max: 1.6, layer: L4, title: 'charleston ouvert' },
    pedal: { art: 'hh_pedal', mics: [['oh', 1], ['mid', 0.4]], max: 0.5, layer: L4, title: 'charleston au pied' },
    ride: { art: 'ride_ride', mics: [['oh', 1], ['room', 0.4]], max: 2.5, layer: L3, title: 'ride' },
    crash: { art: 'crash_crash', mics: [['oh', 1], ['room', 0.5]], max: 3.5, layer: L3, title: 'crash' },
  } },
  vl: { title: 'Virtuosity Drums, micro « lofi »', items: {
    kick: { art: 'kick_snoff', mics: [['lofi', 1]], max: 0.9, layer: L4, title: 'grosse caisse (micro lofi)' },
    snare: { art: 'snare_center', mics: [['lofi', 1]], max: 1.0, layer: per(9), title: 'caisse claire (micro lofi)' },
    ghost: { art: 'snare_muted', mics: [['lofi', 1]], max: 0.5, layer: per(4), title: 'notes fantômes (micro lofi)' },
    xstick: { art: 'snare_crossstick', mics: [['lofi', 1]], max: 0.5, layer: per(4), title: 'cross-stick (micro lofi)' },
    hat: { art: 'hh_closed', mics: [['lofi', 1]], max: 0.45, layer: L4, title: 'charleston fermé (micro lofi)' },
    ohat: { art: 'hh_open', mics: [['lofi', 1]], max: 1.6, layer: L4, title: 'charleston ouvert (micro lofi)' },
  } },
};
// Frankensnare : 6 nuances x 4 round-robin, micros top + btm + oh
const FRANK = {
  tight: { dir: '20m_tight', title: 'Frankensnare 20m « tight »' },
  rimshot: { dir: '13b_rimshot', title: 'Frankensnare 13b rimshot' },
};
const FMICS = [['top', 1], ['btm', 0.45], ['oh', 0.6]];

function mixMics(arrs) {
  const n = Math.max(...arrs.map(([x]) => x.length)), o = new Float32Array(n);
  for (const [x, g] of arrs) for (let i = 0; i < x.length; i++) o[i] += x[i] * g;
  return o;
}
function writeZones(id, hits, max) {
  // normalisation par instrument (la frappe la plus forte à -1 dBFS) : nuances et variations conservées
  let pk = 1e-9; for (const h of hits) pk = Math.max(pk, peakOf(h.x));
  const g = 0.89 / pk, zones = [];
  for (const h of hits) {
    const st = onset(h.x, 1);
    const o = trim(h.x, 1, st, max, Math.min(0.05, max * 0.2));
    for (let i = 0; i < o.length; i++) o[i] *= g;
    const file = `${id}/${h.name}.flac`;
    encode(o, 1, path.join(OUT, file));
    zones.push({ file, layer: h.layer, rr: h.rr, vl: h.vl, peak: +peakOf(o).toFixed(4), rms: +attackRms(o, 1).toFixed(5), seconds: +(o.length / SR).toFixed(3) });
  }
  zones.sort((a, b) => a.layer - b.layer || a.rr - b.rr);
  return zones;
}

export async function premixDrums(manifest, log = console.log) {
  const vurls = sourceList('virtuosity');
  for (const [pre, kit] of Object.entries(KITS)) {
    for (const [el, it] of Object.entries(kit.items)) {
      const id = `${pre}_${el}`;
      const re = new RegExp(`/${it.mics[0][0]}_${it.art}_vl(\\d+)(?:_rr(\\d+))?\\.flac$`);
      const keys = vurls.map((u) => u.match(re)).filter(Boolean).map((m) => ({ vl: +m[1], rr: m[2] ? +m[2] : 0 }));
      const hits = [];
      for (const k of keys) {
        const suf = `${it.art}_vl${k.vl}${k.rr ? '_rr' + k.rr : ''}.flac`;
        const arrs = [];
        for (const [mic, gm] of it.mics) {
          const url = vurls.find((u) => u.endsWith(`/${mic}_${suf}`));
          arrs.push([decode(await fetchSource(url, ['virtuosity']), 1), gm]);
        }
        const layer = it.layer(k.vl);
        hits.push({ x: mixMics(arrs), name: `vl${k.vl}${k.rr ? '_rr' + k.rr : ''}`, vl: k.vl, layer, rr: k.rr || k.vl });
      }
      // round-robin = rang dans la couche
      const cnt = {}; for (const h of hits.sort((a, b) => a.vl - b.vl || a.rr - b.rr)) { h.rr = cnt[h.layer] = (cnt[h.layer] ?? -1) + 1; }
      manifest.instruments[id] = { title: `${kit.title} — ${it.title}`, tonal: false, license: 'CC0-1.0', credit: 'Virtuosity Drums (sfzinstruments)', zones: writeZones(id, hits, it.max) };
      manifest.sources[id] = `${VD} (${it.art} ; micros ${it.mics.map(([m, g]) => `${m}×${g}`).join(' + ')})`;
      log(`${id}: ${hits.length} frappes`);
    }
  }
  const furls = sourceList('frankensnare');
  for (const [el, F] of Object.entries(FRANK)) {
    const id = `fs_${el}`, hits = [];
    const tops = furls.filter((u) => u.includes(`/${F.dir}/top/`));
    for (const u of tops) {
      const name = u.split('/').pop(), m = name.match(/vl(\d+)_rr(\d+)/);
      const arrs = [];
      for (const [mic, gm] of FMICS) arrs.push([decode(await fetchSource(u.replace('/top/', `/${mic}/`), ['frankensnare']), 1), gm]);
      hits.push({ x: mixMics(arrs), name: name.replace('.flac', ''), vl: +m[1], rr: +m[2] - 1, layer: Math.min(3, Math.floor(((+m[1] - 1) * 4) / 6)) });
    }
    const cnt = {}; for (const h of hits.sort((a, b) => a.vl - b.vl || a.rr - b.rr)) h.rr = cnt[h.layer] = (cnt[h.layer] ?? -1) + 1;
    manifest.instruments[id] = { title: `${F.title} (micros top + bottom + OH)`, tonal: false, license: 'CC0-1.0', credit: 'Karoryfer Frankensnare (sfzinstruments)', zones: writeZones(id, hits, 1.0) };
    manifest.sources[id] = `${FS} (${F.dir} ; micros top×1 + btm×0.45 + oh×0.6)`;
    log(`${id}: ${hits.length} frappes`);
  }
  {
    const id = 'fs_clap', hits = [];
    for (const u of furls.filter((x) => x.includes('/xtra_claps/'))) {
      const name = u.split('/').pop().replace('.flac', '');
      hits.push({ x: decode(await fetchSource(u, ['frankensnare/xtra_claps', 'frankensnare']), 1), name, vl: 1, rr: 0, layer: name.includes('stack') ? 1 : 0 });
    }
    const cnt = {}; for (const h of hits) h.rr = cnt[h.layer] = (cnt[h.layer] ?? -1) + 1;
    manifest.instruments[id] = { title: 'Frankensnare — claps (1 à 3 personnes, empilés)', tonal: false, license: 'CC0-1.0', credit: 'Karoryfer Frankensnare (sfzinstruments)', zones: writeZones(id, hits, 0.7) };
    manifest.sources[id] = `${FS} (xtra_claps)`;
    log(`${id}: ${hits.length} frappes`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs');
  const mf = path.join(OUT, 'manifest.json');
  const man = JSON.parse(fs.readFileSync(mf, 'utf8'));
  await premixDrums(man);
  fs.writeFileSync(mf, JSON.stringify(man, null, 1));
}
