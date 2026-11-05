// Tests v1.6 : banque d'échantillons étendue (batteries acoustiques, pianos à queue, Rhodes), absence de
// normalisation par frappe, notes fantômes, réglages « Son de piano » / « Son du Rhodes », cache partagé borné.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compose, ADVANCED } from '../src/engine/composer.js';
import { renderTrack } from '../src/engine/render.js';
import { renderNote, acousticDrum, acousticLayer, isAcousticKit, drumCacheStats } from '../src/engine/instruments.js';
import { samplesAvailable, hasInstrument, SAMPLE_DIR } from '../src/engine/sampler.js';
import { sampleCredits } from '../src/youtube.js';

let n = 0; const ok = (m) => { n++; console.log('OK  ', m); };
const rms = (o) => { const L = o.L || o, R = o.R || o; let q = 0; for (let i = 0; i < L.length; i++) q += L[i] * L[i] + R[i] * R[i]; return Math.sqrt(q / L.length / 2); };
const peak = (o) => { let p = 0; for (const v of o) p = Math.max(p, Math.abs(v)); return p; };

if (!samplesAvailable()) { console.log('SKIP banque absente (' + SAMPLE_DIR + ')'); process.exit(0); }

// ---------- pack : instruments présents, licences et crédits
const man = JSON.parse(fs.readFileSync(path.join(SAMPLE_DIR, 'manifest.json'), 'utf8'));
const NEED = { vd_kick: 16, vd_snare: 36, vd_ghost: 16, vd_rimshot: 12, vd_xstick: 16, vd_hat: 16, vd_hhalf: 16, vd_ohat: 12, vd_pedal: 12, vd_ride: 12, vd_crash: 12,
  vl_kick: 16, vl_snare: 36, fs_tight: 24, fs_rimshot: 24, fs_clap: 10, steinwayb: 80, salamander: 120, jrhodes: 60 };
for (const [id, min] of Object.entries(NEED)) {
  assert.ok(hasInstrument(id) && man.instruments[id].zones.length >= min, `${id} : ${man.instruments[id]?.zones.length} zones`);
  assert.ok(man.instruments[id].license && man.instruments[id].credit, `${id} : licence + crédit`);
}
assert.deepEqual([...new Set(man.instruments.salamander.zones.map((z) => z.layer))].sort(), [0, 1, 2, 3]);
assert.deepEqual([...new Set(man.instruments.jrhodes.zones.map((z) => z.layer))].sort(), [0, 1, 2, 3, 4]);
for (const f of ['CREDITS.md', 'LICENSE.txt', 'licenses/salamander-grand-CC-BY-3.0.txt', 'licenses/jrhodes3d-LICENSE.txt', 'licenses/virtuosity-drums-CC0.txt', 'licenses/karoryfer-frankensnare-CC0.txt'])
  assert.ok(fs.existsSync(path.join(SAMPLE_DIR, f)), f);
const credits = fs.readFileSync(path.join(SAMPLE_DIR, 'CREDITS.md'), 'utf8');
assert.ok(/Alexander Holm/.test(credits) && /Jeff Learman/.test(credits) && /CC BY-NC 4\.0/.test(credits), 'CREDITS.md');
ok(`pack : ${Object.keys(NEED).length} nouveaux instruments, couches Salamander 4 / jRhodes 5, licences + CREDITS.md`);

// ---------- batterie acoustique : 4 couches, pas de normalisation crête par frappe, fantômes étouffés
for (const kit of ['boombap', 'hhlofi', 'dnb', 'break']) assert.ok(isAcousticKit(kit), kit);
assert.deepEqual([0.3, 0.6, 0.8, 1].map((v) => acousticLayer(v)[0]), [0, 1, 2, 3]);
{
  const T = { kick: 1, snare: 1, hat: 1, decay: 1 };
  const pk = [0, 1, 2, 3].map((rr) => peak(acousticDrum('boombap', 'snare', 1, rr, T)));
  assert.ok(Math.max(...pk) / Math.min(...pk) > 1.03, `crêtes différentes entre frappes (pas de normalisation) : ${pk.map((x) => x.toFixed(2))}`);
  const soft = acousticDrum('boombap', 'snare', 0.35, 0, T), hard = acousticDrum('boombap', 'snare', 1, 0, T);
  assert.notEqual(soft.length === hard.length && soft[200] === hard[200], true, 'couches différentes');
  const ghost = acousticDrum('boombap', 'ghost', 0.25, 0, T);
  assert.ok(ghost && ghost.length < hard.length, 'note fantôme = caisse claire étouffée (plus courte)');
  // même frappe demandée deux fois : même objet (cache partagé entre decks)
  assert.equal(acousticDrum('dnb', 'kick', 1, 2, T), acousticDrum('dnb', 'kick', 1, 2, T));
  assert.ok(drumCacheStats().mb < 64.5, 'cache batterie borné');
}
{
  const r = compose({ style: 'hiphop', seed: 31, duration: 120, adv: { hiphopStyle: 'boombap' } });
  assert.equal(r.plan.S.drums.kit === 'boombap' || r.plan.S.drums.kit === 'tr808', true);
  assert.ok(r.events.some((e) => e.inst === 'drums' && e.kind === 'snare' && e.g), 'boom-bap : notes fantômes marquées');
  const l = compose({ style: 'hiphop', seed: 32, duration: 60, adv: { hiphopStyle: 'lofi' } });
  assert.equal(l.plan.S.drums.kit, 'hhlofi');
  const j = compose({ style: 'dnb', seed: 33, duration: 60, adv: { dnbStyle: 'jungle' } });
  assert.equal(j.plan.S.drums.kit, 'break');
  assert.ok(j.plan.S.mix.monoSub && j.plan.S.mix.scBass > 0, 'jungle : sub mono + sidechain basse');
  const t = compose({ style: 'hiphop', seed: 34, duration: 60, adv: { hiphopStyle: 'trap' } });
  assert.ok(['trap', 'tr808'].includes(t.plan.S.drums.kit), 'trap : kit synthétisé conservé');
  const tc = compose({ style: 'techno', seed: 35, duration: 60 });
  assert.ok(!isAcousticKit(tc.plan.S.drums.kit), 'techno : 909/synthèse conservée');
}
ok('batterie acoustique : 4 couches, crêtes naturelles, fantômes étouffés, cache partagé ; kits par variante (trap/techno en synthèse)');

// ---------- pianos et Rhodes
{
  const lv = (patch, o, v) => rms(renderNote(patch, 60, 1, v, { ...o, rnd: () => 0.5 }));
  for (const s of ['steinway', 'salamander', 'upright']) {
    const a = lv('piano', { pianoSound: s }, 0.3), b = lv('piano', { pianoSound: s }, 1);
    assert.ok(b > a * 1.5, `${s} : dynamique (${a.toFixed(4)} → ${b.toFixed(4)})`);
  }
  const st = renderNote('piano', 60, 1, 0.8, { pianoSound: 'steinway', rnd: () => 0.5 }), sa = renderNote('piano', 60, 1, 0.8, { pianoSound: 'salamander', rnd: () => 0.5 });
  assert.ok(st.L[5000] !== sa.L[5000], 'Steinway ≠ Salamander');
  let d = 0; for (let i = 0; i < st.L.length; i++) d += Math.abs(st.L[i] - st.R[i]);
  assert.ok(d > 1, 'piano à queue stéréo');
  const rs = renderNote('rhodes', 57, 1, 0.7, { rnd: () => 0.5 }), ry = renderNote('rhodes', 57, 1, 0.7, { rhodesSound: 'synth', rnd: () => 0.5 });
  assert.ok(rs.L.length !== ry.L.length || rs.L[3000] !== ry.L[3000], 'Rhodes échantillonné ≠ synthèse');
  const r5 = [0.2, 0.4, 0.6, 0.8, 0.95].map((v) => lv('rhodes', {}, v));
  assert.ok(r5[4] > r5[0] * 2, 'Rhodes : 5 couches dynamiques');
  // aigus sans toutes les couches : repli sur la couche disponible
  assert.ok(rms(renderNote('rhodes', 96, 0.5, 1, { rnd: () => 0.5 })) > 0.001, 'Rhodes aigu');
}
assert.ok(ADVANCED.pianoSound.options.steinway && ADVANCED.pianoSound.options.salamander && ADVANCED.pianoSound.options.upright, 'réglage Son de piano');
assert.ok(ADVANCED.rhodesSound.options.synth && ADVANCED.drumKit.options.boombap && ADVANCED.drumKit.options.break, 'réglages Rhodes / kits');
{
  const a = compose({ style: 'lofi', seed: 41, duration: 60, adv: { chordPatch: 'piano', pianoSound: 'salamander' } });
  assert.equal(a.plan.F.pianoSound, 'salamander');
  assert.match(a.meta.recipe.sons.piano, /Salamander/);
  assert.ok(sampleCredits({ meta: a.meta }).some((c) => /Alexander Holm/.test(c)), 'crédit Salamander dans la description');
  const b = compose({ style: 'lofi', seed: 41, duration: 60, adv: { chordPatch: 'rhodes' } });
  assert.match(b.meta.recipe.sons.rhodes, /jRhodes3d/);
  const c = compose({ style: 'lofi', seed: 42, duration: 60, adv: { chordPatch: 'piano' } });
  assert.ok(['steinway', 'salamander'].includes(c.plan.F.pianoSound), 'auto : piano à queue');
  assert.deepEqual(compose({ style: 'lofi', seed: 42, duration: 60 }).events.slice(0, 50), compose({ style: 'lofi', seed: 42, duration: 60 }).events.slice(0, 50));
}
ok('pianos Steinway B / Salamander / droit + Rhodes jRhodes3d (5 couches) / synthèse ; réglages, recette, crédits');

// ---------- banque allégée (jrhodes/ et salamander/ supprimés pour un pack 100 % libre) : repli propre
{
  const { execFileSync } = await import('node:child_process');
  const lite = fs.mkdtempSync(path.join(os.tmpdir(), 'st-lite-'));
  for (const e of fs.readdirSync(SAMPLE_DIR)) if (!['jrhodes', 'salamander'].includes(e)) fs.symlinkSync(path.join(SAMPLE_DIR, e), path.join(lite, e));
  const code = "const c=await import('./src/engine/composer.js'),i=await import('./src/engine/instruments.js');" +
    "const a=c.compose({style:'lofi',seed:41,duration:60,adv:{chordPatch:'rhodes',leadPatch:'piano',pianoSound:'salamander'}});" +
    "const r=i.renderNote('rhodes',60,0.5,0.8,{rnd:()=>0.5}),p=i.renderNote('piano',60,0.5,0.8,{pianoSound:'salamander',rnd:()=>0.5});" +
    "console.log(JSON.stringify([a.plan.F.pianoSound,a.plan.F.rhodesSound,r.L.length>0,p.L.length>0]))";
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, SOUNDTUBE_SAMPLES: lite }, cwd: path.resolve(SAMPLE_DIR, '../..') }).toString().trim().split('\n').pop();
  fs.rmSync(lite, { recursive: true, force: true });
  assert.deepEqual(JSON.parse(out), ['steinway', 'synth', true, true]);
}
ok('banque allégée sans jRhodes3d / Salamander : repli Steinway + Rhodes synthétisé, sans erreur');

// ---------- rendu : -14 LUFS, crête ≤ -1 dBTP, kit acoustique + piano à queue
{
  const wav = path.join(os.tmpdir(), `st-snd-${process.pid}.wav`);
  for (const [p, lab] of [[{ style: 'hiphop', seed: 51, duration: 20, adv: { hiphopStyle: 'lofi', chordPatch: 'piano', pianoSound: 'steinway' } }, 'lo-fi + Steinway'],
    [{ style: 'dnb', seed: 52, duration: 20, adv: { dnbStyle: 'jungle', chordPatch: 'rhodes' } }, 'jungle + Rhodes']]) {
    const r = await renderTrack(p, { wavPath: wav });
    assert.ok(Math.abs(r.loudness.integrated + 14) < 0.6 && r.loudness.truePeak <= -1, `${lab} : ${r.loudness.integrated} LUFS ${r.loudness.truePeak} dBTP`);
    ok(`rendu ${lab} : ${r.loudness.integrated} LUFS, ${r.loudness.truePeak} dBTP`);
  }
  fs.rmSync(wav, { force: true });
}
console.log(`${n} vérifications sons v1.6 réussies`);
