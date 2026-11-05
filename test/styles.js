// Nouveaux styles (hip-hop, drum & bass) et leurs variantes : composition, tempos, rendu court sans NaN,
// mastering -14 LUFS / -1 dBTP, plans de mix DJ (voisins de tempo compatible), déterminisme.
// node test/styles.js [--quick]
import assert from 'node:assert/strict';
import { resolveParams, compose } from '../src/engine/composer.js';
import { renderTrack } from '../src/engine/render.js';
import { planMix } from '../src/engine/mix.js';
import { STYLES, MOODS, AMBIENCES, profileKey } from '../src/engine/styles.js';
import { renderTexture } from '../src/engine/instruments.js';
import { makeRng } from '../src/engine/rng.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const quick = process.argv.includes('--quick');
let n = 0;
const ok = (m) => { n++; console.log('OK  ', m); };
const VAR = { hiphop: ['hiphopStyle', ['boombap', 'lofi', 'trap']], dnb: ['dnbStyle', ['liquid', 'neuro', 'jungle']] };
const BPM = { boombap: [85, 95], lofi: [72, 88], trap: [130, 150], liquid: [170, 174], neuro: [172, 176], jungle: [166, 172] };

for (const [style, [key, subs]] of Object.entries(VAR)) {
  assert.ok(STYLES[style], style);
  // tirage automatique : toutes les variantes apparaissent sur quelques graines
  const seen = new Set(); for (let s = 1; s <= 40; s++) seen.add(resolveParams({ style, seed: s })[key]);
  assert.deepEqual([...seen].sort(), [...subs].sort(), `${style} : variantes tirées`);
  for (const v of subs) {
    for (const seed of [3, 1505]) {
      const P = resolveParams({ style, seed, mood: 'auto', adv: { [key]: v } });
      assert.equal(P[key], v); assert.equal(profileKey(P), `${style}_${v}`);
      assert.ok(P.bpm >= BPM[v][0] && P.bpm <= BPM[v][1], `${v} ${P.bpm} BPM`);
      const r = compose({ style, seed, duration: 120, adv: { [key]: v } });
      const a = JSON.stringify(compose({ style, seed, duration: 120, adv: { [key]: v } }).events);
      assert.equal(JSON.stringify(r.events), a, 'déterminisme');
      const drums = r.events.filter((e) => e.inst === 'drums');
      assert.ok(drums.length > 50, `${v} : batterie`);
      assert.ok(r.events.every((e) => Number.isFinite(e.t) && e.t >= 0 && Number.isFinite(e.v) && (e.m == null || Number.isFinite(e.m))), `${v} : événements valides`);
      if (v === 'trap') assert.ok(r.plan.S.drums.halftime, 'trap : demi-temps');
      if (v === 'jungle') assert.ok(drums.filter((e) => e.kind === 'snare').length > 60, 'jungle : break chargé');
      if (v === 'boombap') assert.ok(drums.some((e) => e.kind === 'snare' && e.v < 0.3), 'boom-bap : notes fantômes');
    }
    ok(`${style}/${v} : tempo, déterminisme, motifs`);
  }
}

// rendu audio court (mastering) pour chaque variante
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-styles-'));
const R = quick ? [['hiphop', 'boombap'], ['dnb', 'neuro']] : Object.entries(VAR).flatMap(([s, [, v]]) => v.map((x) => [s, x]));
for (const [style, v] of R) {
  const wav = path.join(tmp, `${v}.wav`);
  const r = await renderTrack({ style, seed: 99, duration: 30, adv: { [VAR[style][0]]: v } }, { wavPath: wav });
  assert.ok(Number.isFinite(r.rms) && r.rms > 0.01, `${v} : rms`);
  assert.ok(Math.abs(r.loudness.integrated + 14) < 0.6, `${v} : ${r.loudness.integrated} LUFS`);
  assert.ok(r.loudness.truePeak <= -0.9, `${v} : crête ${r.loudness.truePeak}`);
  assert.ok(Math.abs(r.seconds - 30) < 2, `${v} : durée ${r.seconds}`);
  fs.rmSync(wav, { force: true });
  ok(`${style}/${v} : rendu ${r.seconds.toFixed(1)} s, ${r.loudness.integrated} LUFS, ${r.loudness.truePeak} dBTP`);
}
fs.rmSync(tmp, { recursive: true, force: true });

// mix DJ : variantes voisines de tempo compatible, dérive bornée
for (const [style, key, v, allowed] of [['hiphop', 'hiphopStyle', 'boombap', ['boombap', 'lofi']], ['hiphop', 'hiphopStyle', 'trap', ['trap']], ['dnb', 'dnbStyle', 'liquid', ['liquid', 'neuro', 'jungle']]]) {
  let seed = 1; while (resolveParams({ style, seed })[key] !== v) seed++; // graine dont la variante « auto » est v
  const mx = planMix({ style, seed, duration: 7200 });
  const P = mx.params; const base = P[key];
  for (const d of mx.decks) {
    assert.ok(d.sub, 'variante par titre');
    if (base === 'trap') assert.equal(d.sub, 'trap');
    if (base === 'boombap' || base === 'lofi') assert.ok(['boombap', 'lofi'].includes(d.sub));
    // v1.7.0 : les mix ≥ 1 h voyagent en tempo (titres distincts), dans la plage de leur variante (±2 BPM), paliers ≤ 8 %
    const R = STYLES[style].subs?.[d.sub]?.bpm || STYLES[style].bpm;
    assert.ok(d.bpm >= R[0] - 2 && d.bpm <= R[1] + 2, `dérive ${d.bpm} hors ${R} (${d.sub})`);
  }
  mx.decks.slice(1).forEach((d, i) => { const a = mx.decks[i].bpm / (mx.decks[i].ratio || 1), b = d.bpm / (d.ratio || 1); assert.ok(Math.abs(b / a - 1) <= 0.08, `palier ${mx.decks[i].bpm} → ${d.bpm}`); });
  // variante imposée : tous les titres la gardent
  const mx2 = planMix({ style, seed: seed + 1, duration: 3600, adv: { [key]: v } });
  assert.ok(mx2.decks.every((d) => d.sub === v), `${v} imposé`);
  assert.ok(allowed.includes(v));
  ok(`${style} : mix ${mx.decks.length} titres (${[...new Set(mx.decks.map((d) => d.sub))].join(', ')}), ${Math.min(...mx.decks.map((d) => d.bpm))}–${Math.max(...mx.decks.map((d) => d.bpm))} BPM`);
}

// ---------- ambiances (humeurs) et fonds sonores
for (const m of Object.keys(MOODS)) for (const style of Object.keys(STYLES)) {
  const P = resolveParams({ style, seed: 11, mood: m });
  assert.ok(Number.isFinite(P.bpm) && P.bpm >= 40 && P.bpm <= 200, `${m}/${style} bpm`);
}
ok(`${Object.keys(MOODS).length} ambiances × ${Object.keys(STYLES).length} styles : paramètres valides`);
for (const a of Object.keys(AMBIENCES)) {
  const r = compose({ style: 'ambient', seed: 4, duration: 300, adv: { ambience: a } });
  const ev = r.events.filter((e) => e.amb), spb = 60 / r.params.bpm;
  if (a === 'none') { assert.equal(ev.length, 0); continue; }
  assert.ok(ev.length >= 3, `${a} : morceaux`);
  assert.ok(ev.every((e) => e.d <= 8 * 4 + 2), `${a} : morceaux bornés (RAM)`);
  const last = Math.max(...ev.map((e) => e.t + e.d)); assert.ok(last * spb >= 280, `${a} : couvre le morceau`);
  if (a !== 'vinyle') {
    const [L, R] = renderTexture('amb_' + a, 6, 1, makeRng(5), 90, { t0: 12, xf: 0.5 });
    let pk = 0, sq = 0; for (let i = 0; i < L.length; i++) { pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); sq += L[i] * L[i]; }
    assert.ok(L.every(Number.isFinite) && pk < 1 && sq > 0, `${a} : signal`);
  }
}
// ambiance « nocturne » → grillons par défaut ; « none » force l'absence
assert.ok(compose({ style: 'techno', seed: 2, duration: 120, mood: 'nocturne' }).events.some((e) => e.kind === 'amb_nuit'));
assert.ok(!compose({ style: 'techno', seed: 2, duration: 120, mood: 'nocturne', adv: { ambience: 'none' } }).events.some((e) => e.amb));
ok(`fonds sonores (${Object.keys(AMBIENCES).length - 1}) : morceaux bornés, signal valide, défaut selon l’ambiance`);
{
  const wav = path.join(os.tmpdir(), `st-amb-${process.pid}.wav`);
  const r = await renderTrack({ style: 'dnb', seed: 8, duration: 25, mood: 'pluvieux', adv: { dnbStyle: 'liquid' } }, { wavPath: wav });
  fs.rmSync(wav, { force: true });
  assert.ok(Math.abs(r.loudness.integrated + 14) <= 0.6 && r.loudness.truePeak <= -0.9, `pluie : ${r.loudness.integrated} LUFS ${r.loudness.truePeak} dBTP`);
  assert.ok(r.busLevels.amb > 0.002, 'bus fond sonore audible');
  ok(`rendu dnb liquid + pluie : ${r.loudness.integrated} LUFS, ${r.loudness.truePeak} dBTP`);
}

// ---------- réalisme (tous styles) : micro-timing, accents, automatisations ; chiptune quantifiée
for (const style of ['techno', 'house', 'synthwave', 'lofi', 'trap', 'cinematic', 'chiptune']) {
  const r = compose({ style, seed: 21, duration: 150 });
  const d = r.events.filter((e) => e.inst === 'drums'), spb16 = 0.25;
  const off = d.filter((e) => Math.abs(e.t / spb16 - Math.round(e.t / spb16)) > 0.004).length / Math.max(1, d.length);
  if (style === 'chiptune') { assert.ok(!r.events.some((e) => e.rv), 'chiptune sans automatisation de groove'); continue; }
  assert.ok(off > 0.3, `${style} : micro-timing (${(off * 100).toFixed(0)} % hors grille)`);
  const hv = new Set(d.filter((e) => e.kind === 'hat').map((e) => e.v.toFixed(2)));
  if (d.some((e) => e.kind === 'hat')) assert.ok(hv.size > 8, `${style} : accents de charley`);
  assert.ok(r.events.some((e) => e.rv && e.rv !== 1), `${style} : automatisation de réverbe`);
}
ok('réalisme : micro-timing, accents, réverbe automatisée sur 6 styles ; chiptune quantifiée');
console.log(`${n} vérifications nouveaux styles réussies`);
