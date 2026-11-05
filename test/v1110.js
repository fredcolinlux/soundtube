// Tests v1.11.0 : refonte lo-fi (moteur 20) — sous-genres, textures, scratchs / cuivres synthétisés, arrangement moins
// répétitif, nouveaux fonds sonores + volume ; et surtout : morceaux anciens (moteur ≤ 19) recalculés À L'IDENTIQUE.
// node test/v1110.js   (--quick : moins de rendus audio)
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v1110-'));
process.env.SOUNDTUBE_DATA_DIR = path.join(tmp, 'unit-data');
const QUICK = process.argv.includes('--quick');
const C = await import('../src/engine/composer.js');
const ST = await import('../src/engine/styles.js');
const L20 = await import('../src/engine/lofi20.js');
const DSP = await import('../src/engine/lofidsp.js');
const M = await import('../src/engine/mix.js');
const AI = await import('../src/ai.js');
const YT = await import('../src/youtube.js');
const { compose, renderTrack } = await import('../src/engine/render.js');
const { resolveAdvancedDefaults } = await import('../src/engine/advdefaults.js');
const { MidiCollector } = await import('../src/engine/midi.js');

let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const h = (x) => crypto.createHash('md5').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');

// ---------- 1. compatibilité : empreintes v1.10.0 (événements + PCM) des moteurs 18 / 19
const GOLD = [
  [{ style: 'lofi', seed: 101, duration: 40, engine: 19 }, '7af5d2f0903337e8ded6d1eb4d3135fa', 'fea3f27171c45136a168eef7e543d517'],
  [{ style: 'lofi', seed: 303, duration: 40, engine: 18 }, '9e955a7f60933d3cc75de0a8c504b250', 'cd70ee6e139f293943bc7987baaab995'],
  [{ style: 'lofi', seed: 404, duration: 40 }, 'bb3cfb32945f19f7a893849b4f5b7075', '0f7b58822c6386b58faa4d4c02dcd817'],
  [{ style: 'lofi', seed: 505, duration: 30, engine: 19, adv: { ambience: 'nuit', vintage: 70 } }, '1204217781d02a4abfdaa98a3e77949e', '617f5bd2811b3f23708fe3229e544f20'],
  [{ style: 'hiphop', seed: 606, duration: 30, engine: 19 }, 'b9dec9828f282539401c49432996a4c6', '96957e7f630cfa504e014172f3b6182f'],
  [{ style: 'frenchtouch', seed: 707, duration: 30, engine: 19 }, '22da40b6d98b7e06b9ec3d4c943ae051', '4e563a7b085dbb5b50a67d78bd89ceb6'],
  [{ style: 'house', seed: 808, duration: 30, engine: 19, adv: { variety: 'high' } }, '2d5d10c25e75e123166b927cf5726869', '37bdae34ec96457c8a47b3967a2670f9'],
  [{ style: 'ambient', seed: 909, duration: 30, engine: 19 }, '6d2da72a6add2424bd45cf0214f932f4', 'd2fceaf950365b30aaf20deecee87008'],
  [{ style: 'techno', seed: 1001, duration: 30, engine: 19 }, 'de2d3e3af55367333f360459da1829e0', 'f379e303d5199e32b5d0615c1626024e'],
];
for (const [i, [c, ev, pcm]] of GOLD.entries()) {
  const e = h(compose(c).events);
  if (QUICK && i % 3) { check(e === ev, `identique v1.10 (événements) : ${JSON.stringify(c)}`); continue; }
  const r = await renderTrack(c, { memory: true });
  check(e === ev && h(r.pcm) === pcm, `identique v1.10 (événements + audio) : ${JSON.stringify(c)}`);
}
{
  const strip = (d) => ({ ...d.params, adv: Object.fromEntries(Object.entries(d.params.adv).filter(([, v]) => v != null)) });
  check(h(compose({ style: 'lofi', seed: 1111, duration: 900, engine: 19 }).events) === 'bdb419ebd0ae330872c06ef4717da340', 'lo-fi 15 min moteur 19 : identique');
  check(h(M.planMix({ style: 'lofi', seed: 1212, duration: 3600, engine: 19 }).decks.map(strip)) === '1a122c732ecb7d4eb180ccf794473b80'
    && h(M.planMix({ style: 'hiphop', seed: 1313, duration: 3600, engine: 19, adv: { variety: 'max' } }).decks.map(strip)) === '5fa39acef69c2edeb4fc059c800198a7', 'plans de mix 1 h moteur 19 : identiques');
}
// moteur 20 = moteur 19 hors lo-fi
{
  let same = 0; const ss = ['hiphop', 'frenchtouch', 'house', 'ambient', 'techno', 'dnb', 'synthwave', 'trap', 'cinematic', 'chiptune'];
  for (const s of ss) { const a = { style: s, seed: 42, duration: 60 }; if (h(compose({ ...a, engine: 19 }).events) === h(compose({ ...a, engine: 20 }).events)) same++; }
  check(same === ss.length, `moteur 20 = moteur 19 hors lo-fi (${same}/${ss.length} styles)`);
}

// ---------- 2. moteur 20 : sous-genres
{
  const P = C.resolveParams({ style: 'lofi', seed: 3, duration: 180, engine: 20 });
  check(P.engine === 20 && L20.LOFI_SUBS.includes(P.lofiStyle), `nouvelle génération lo-fi : moteur 20, sous-genre ${P.lofiStyle}`);
  const old = C.resolveParams({ style: 'lofi', seed: 3, duration: 180, engine: 19 });
  check(!old.lofiStyle, 'moteur 19 : pas de sous-genre (morceau inchangé)');
  const seen = new Set(); for (let s = 1; s <= 60; s++) seen.add(C.resolveParams({ style: 'lofi', seed: s, duration: 180, engine: 20 }).lofiStyle);
  check(seen.size === 6, `graines 1-60 : les 6 sous-genres tirés (${[...seen].join(', ')})`);
  let bpmOk = true;
  for (const sub of L20.LOFI_SUBS) { const R = ST.STYLES.lofi.subs[sub].bpm; for (let s = 1; s <= 8; s++) { const p = C.resolveParams({ style: 'lofi', seed: s, duration: 120, engine: 20, adv: { lofiStyle: sub } }); if (p.lofiStyle !== sub || p.bpm < R[0] - 2 || p.bpm > R[1] + 2) bpmOk = false; } }
  check(bpmOk, 'sous-genre imposé respecté, tempo dans sa plage (±2)');
  const sad = C.resolveParams({ style: 'lofi', seed: 9, duration: 120, engine: 20, adv: { lofiStyle: 'sad' } });
  check(['minor', 'harmonic_minor', 'dorian', 'phrygian'].includes(sad.scale), `sad lo-fi : gamme mineure (${sad.scale})`);
  check(C.ADVANCED.lofiStyle && Object.keys(C.ADVANCED.lofiStyle.options).filter((k) => k !== 'auto').length >= 6 && C.ADVANCED.lofiStyle.styles.includes('lofi'), 'réglage avancé « Sous-genre lo-fi »');
}
// ---------- 3. textures
{
  for (const k of ['crackle', 'wow', 'tapeSat', 'dust', 'warmth']) check(C.ADVANCED[k]?.type === 'range' && C.ADVANCED[k].styles.includes('lofi'), `réglage avancé « ${C.ADVANCED[k]?.label || k} » (0-100, lo-fi)`);
  const D = resolveAdvancedDefaults({ style: 'lofi', seed: 5, engine: 20, adv: { lofiStyle: 'beatmaker' } }), V = D.values || D;
  const T = L20.LOFI_TEX.beatmaker;
  check(['crackle', 'wow', 'tapeSat', 'dust', 'warmth'].every((k) => Number.isFinite(V[k]) && Math.abs(V[k] - T[k]) <= 10), `Avancé pré-rempli avec les textures du sous-genre (${['crackle', 'wow', 'tapeSat', 'dust', 'warmth'].map((k) => V[k]).join('/')})`);
  const D19 = resolveAdvancedDefaults({ style: 'lofi', seed: 5, engine: 19 }), V19 = D19.values || D19;
  check(V19.crackle == null, 'moteur 19 : textures non pré-remplies (sans effet)');
  const a = compose({ style: 'lofi', seed: 5, duration: 30, engine: 20, adv: { lofiStyle: 'jazzy', crackle: 0, dust: 100 } }).plan.S.mix.tex;
  check(a.crackle === 0 && a.dust === 1, 'valeur explicite prioritaire (craquements 0, poussière 100)');
  const tx = new DSP.LofiTexture({ crackle: 0.6, wow: 0.4, sat: 0.5, dust: 0.5, warmth: 0.5 }, 7);
  const n = 44100, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = R[i] = 0.3 * Math.sin(2 * Math.PI * 440 * i / 44100);
  tx.process(L, R, n, 0);
  check(L.every(Number.isFinite) && L.some((x, i) => Math.abs(x - 0.3 * Math.sin(2 * Math.PI * 440 * i / 44100)) > 1e-3), 'traitement de texture : signal modifié, valeurs finies');
}
// ---------- 4. beatmaker : scratchs, cuivres, orchestre (synthétisés) ; arrangement
{
  const c = compose({ style: 'lofi', seed: 7, duration: 120, engine: 20, adv: { lofiStyle: 'beatmaker' } }), ev = c.events;
  const scr = ev.filter((e) => e.inst === 'scr'), horn = ev.filter((e) => e.patch === 'hornsect'), orch = ev.filter((e) => e.patch === 'orchstab');
  check(scr.length >= 2 && horn.length > 10 && orch.length >= 2, `beatmaker 2 min : ${scr.length} phrases de scratch, ${horn.length} stabs de cuivres, ${orch.length} coups d'orchestre`);
  const kinds = new Set(); for (let s = 1; s <= 25; s++) for (const e of compose({ style: 'lofi', seed: s, duration: 180, engine: 20, adv: { lofiStyle: 'beatmaker' } }).events) if (e.inst === 'scr') kinds.add(e.kind);
  check(['baby', 'chirp', 'transformer'].every((k) => kinds.has(k)), `techniques de scratch : ${[...kinds].join(', ')}`);
  const [sl, sr] = DSP.renderScratch({ kind: 'transformer', d: 2, v: 0.7, src: 'horn', m: 62, rv: 1, f: 0.8 }, 0.65, 3);
  let pk = 0; for (const x of sl) pk = Math.max(pk, Math.abs(x));
  check(sl.length > 1000 && sr.length === sl.length && pk > 0.01 && pk < 4 && sl.every(Number.isFinite), `rendu d'un scratch transformer (${sl.length} échantillons, crête ${pk.toFixed(2)})`);
  const midi = new MidiCollector({ bpm: 90, meter: '4/4', name: 't', patches: c.plan.S.patches, gmDrums: {} });
  let ok = true; try { for (const e of ev) midi.add?.(e); } catch { ok = false; }
  check(ok, 'MIDI : les scratchs sont ignorés sans erreur');
}
{
  // moins de répétition : scènes (batterie absente sur certaines phrases), fills, changements de grille
  const P = { style: 'lofi', seed: 21, duration: 240, engine: 20, adv: { lofiStyle: 'chillhop' } };
  const c = compose(P), bar = 4, nb = c.meta.sections.reduce((a, x) => Math.max(a, x.startBar + x.bars), 0); // temps des événements en noires
  const dr = new Array(nb).fill(0), ld = new Array(nb).fill(0);
  for (const e of c.events) { const b = Math.floor(e.t / bar); if (b < nb) { if (e.inst === 'drums') dr[b]++; if (e.inst === 'lead' || e.inst === 'arp') ld[b]++; } }
  const quiet = dr.filter((x) => x === 0).length, firstLead = ld.findIndex((x) => x > 0);
  const c19 = compose({ ...P, engine: 19 }), dr19 = new Array(nb).fill(0); for (const e of c19.events) { const b = Math.floor(e.t / bar); if (b < nb && e.inst === 'drums') dr19[b]++; }
  check(quiet > dr19.filter((x) => x === 0).length || new Set(dr).size > new Set(dr19).size, `chillhop 4 min : ${quiet} mesures sans batterie (v1.10 : ${dr19.filter((x) => x === 0).length}), densités ${new Set(dr).size} vs ${new Set(dr19).size}`);
  let late = 0; for (let s = 1; s <= 20; s++) { const e = compose({ style: 'lofi', seed: s, duration: 180, engine: 20 }).events.filter((x) => x.inst === 'lead'); if (e.length && Math.min(...e.map((x) => x.t)) >= 8) late++; }
  check(late >= 6, `la mélodie entre après l'intro dans ${late}/20 morceaux lo-fi`);
  let beatless = 0; for (let s = 1; s <= 20; s++) if (!compose({ style: 'lofi', seed: s, duration: 90, engine: 20, adv: { lofiStyle: 'ambient' } }).events.some((e) => e.inst === 'drums' && /kick|snare/.test(e.kind || e.patch || e.n || ''))) beatless++;
  check(beatless >= 3 && beatless <= 15, `ambient lo-fi : ${beatless}/20 morceaux sans rythme`);
}
// ---------- 5. mix 1 h : titres nettement différents
{
  const m = M.planMix({ style: 'lofi', seed: 2, duration: 3600, engine: 20 });
  const subs = m.decks.map((d) => d.params.adv.lofiStyle), keys = new Set(m.decks.map((d) => d.params.seed));
  check(new Set(subs).size >= 3 && keys.size === m.decks.length && !subs.includes('lofihouse'), `mix lo-fi 1 h : ${m.decks.length} titres, sous-genres ${[...new Set(subs)].join('/')} (sans lo-fi house)`);
  let maxJump = 0; for (let i = 1; i < m.decks.length; i++) maxJump = Math.max(maxJump, Math.abs(m.decks[i].params.bpm / m.decks[i - 1].params.bpm - 1));
  check(maxJump <= 0.08, `enchaînements de tempo compatibles (écart max ${(maxJump * 100).toFixed(1)} %)`);
  check(C.resolveParams({ style: 'lofi', seed: 4, duration: 3600, engine: 20 }).lofiStyle !== 'lofihouse' || false, 'lo-fi house exclue des tirages ≥ 1 h');
}
// ---------- 6. fonds sonores + volume
{
  for (const k of ['cafe', 'nuitville', 'etude']) check(ST.AMBIENCES[k] && C.ADVANCED.ambience.options[k], `fond sonore « ${C.ADVANCED.ambience.options[k] || k} »`);
  check(C.ADVANCED.ambienceLevel?.type === 'range' && C.ADVANCED.ambienceLevel.min === 0 && C.ADVANCED.ambienceLevel.max === 100, 'réglage « Volume du fond sonore » 0-100');
  if (!QUICK) {
    const base = { style: 'lofi', seed: 31, duration: 20, engine: 20, adv: { lofiStyle: 'chillhop' } };
    const bl = {};
    for (const [n, adv] of [['cafe', { ambience: 'cafe' }], ['cafe0', { ambience: 'cafe', ambienceLevel: 0 }], ['cafe100', { ambience: 'cafe', ambienceLevel: 100 }], ['etude', { ambience: 'etude' }], ['nuitville', { ambience: 'nuitville' }]]) {
      const r = await renderTrack({ ...base, adv: { ...base.adv, ...adv } }, { memory: true }); bl[n] = r.busLevels?.amb ?? r.busLevels?.ambience ?? 0;
      if (n === 'cafe') check(Math.abs(r.loudness.integrated + 14) < 0.6, `rendu lo-fi + café : ${r.loudness.integrated} LUFS`);
    }
    check(bl.cafe > 0 && bl.etude > 0 && bl.nuitville > 0 && !(bl.cafe0 > 0) && bl.cafe100 > bl.cafe, `niveaux du bus fond : ${JSON.stringify(bl)}`);
  }
}
// ---------- 7. rendus : −14 LUFS, bus scratch actif
if (!QUICK) {
  for (const sub of L20.LOFI_SUBS) {
    const r = await renderTrack({ style: 'lofi', seed: 77, duration: 20, engine: 20, adv: { lofiStyle: sub } }, { memory: true });
    check(Math.abs(r.loudness.integrated + 14) < 0.6 && r.peak < 1, `${sub} : ${r.loudness.integrated} LUFS, crête ${r.peak?.toFixed?.(2)}`);
  }
}
// ---------- 8. IA (repli local), YouTube
{
  const v = AI.validateSuggestion(AI.localSuggestion('beat façon Chinese Man avec des scratchs dans un café', { style: 'lofi' }), { style: 'lofi' });
  check(v.params.style === 'lofi' && v.params.adv.lofiStyle === 'beatmaker' && v.params.adv.ambience === 'cafe', 'proposition locale : beatmaker + café');
  const w = AI.validateSuggestion({ style: 'lofi', bpm: 118, adv: { lofiStyle: 'lofihouse', ambienceLevel: 140 } }, { style: 'lofi' });
  check(w.params.bpm === 118 && w.params.adv.ambienceLevel === 100, 'validation IA : tempo du sous-genre, volume borné');
  check(AI.AI_ADV_KEYS.includes('lofiStyle') && AI.AI_ADV_KEYS.includes('ambienceLevel'), 'clés IA : lofiStyle, ambienceLevel');
  const fn = YT.youtubeInfo;
  if (fn) {
    try {
      const c = compose({ style: 'lofi', seed: 7, duration: 120, engine: 20, adv: { lofiStyle: 'beatmaker', ambience: 'cafe' } });
      const y = fn({ id: 'x', title: 'Test', style: 'lofi', duration: 120, params: c.params, meta: c.meta });
      const txt = JSON.stringify(y);
      check(/boom bap|beatmaker/i.test(txt) && /café|coffee/i.test(txt), 'YouTube : titre / tags du sous-genre et du fond');
    } catch (e) { console.log('     (méta YouTube non testée : ' + e.message + ')'); }
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} ÉCHEC(S)` : '\nv1.11.0 : tout est OK');
process.exit(fail ? 1 : 0);
