// Tests v1.6.3 : sélecteur « Variation » (Faible / Moyenne / Forte / Maximale) et styles proches dans les mix.
// node test/v163.js   (--no-api : sans serveur)
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v163-'));
process.env.SOUNDTUBE_DATA_DIR = path.join(tmp, 'unit-data');
const C = await import('../src/engine/composer.js');
const M = await import('../src/engine/mix.js');

let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const h = (o) => crypto.createHash('md5').update(JSON.stringify(o, (k, v) => (typeof v === 'function' ? undefined : v))).digest('hex');
const events = (plan) => { const st = {}, a = []; for (let ci = 0; ci < plan.chapters.length; ci++) a.push(h(C.composeChapter(plan, ci, st))); return a; };
const uniq = (a) => new Set(a).size;

// ---------- paramètres : alias, normalisation, signature inchangée pour Moyenne
{
  const r = (x) => C.resolveParams({ style: 'lofi', seed: 1, duration: 90, ...x }).adv;
  check(r({}).variety == null && r({ variety: 'medium' }).variety == null && r({ variety: 'moyenne' }).variety == null && r({ adv: { variety: 'auto' } }).variety == null, 'Moyenne / auto / absent => adv.variety null (comportement historique)');
  check(r({ variety: 'faible' }).variety === 'low' && r({ variety: 'Forte' }).variety === 'high' && r({ variety: 'maximale' }).variety === 'max' && r({ variety: 3 }).variety === 'max' && r({ adv: { variety: 'high' } }).variety === 'high', 'alias FR / numériques / adv.variety acceptés');
  check(r({ variety: 'nimporte' }).variety == null, 'valeur inconnue ignorée');
  check(r({ mixStyles: 'related' }).mixStyles === 'related' && r({ mixStyles: 'same' }).mixStyles == null && r({ adv: { mixStyles: 'related' } }).mixStyles === 'related', 'mixStyles : related conservé, same => null');
  check(C.varietyOf({ adv: {} }) === 1 && C.varietyOf({ adv: { variety: 'low' } }) === 0 && C.varietyOf({ adv: { variety: 'max' } }) === 3, 'varietyOf : 0 / 1 / 2 / 3');
  check(C.ADVANCED.variety?.options?.medium === 'Moyenne' && C.ADVANCED.mixStyles?.options?.related, 'réglages avancés exposés (variety, mixStyles)');
}

// ---------- Moyenne = sortie v1.6.2 à l'identique (empreintes enregistrées avec la v1.6.2)
{
  const GOLD = {
    'lofi/42/600': 'a01cf72dbd4e095be98e493ced68abd7', 'hiphop/777/1800': '9f3a18b1c959097395e1c9c0b41aedc9', 'dnb/1/90': '81b51610e76435a46804347ab8e3410d',
    'techno/42/1800': 'b94b1f2beb0062bbbec122d4503f235a', 'ambient/777/600': 'b4ae8920f1e210bd8e7c1eeaa8052209',
  };
  // v1.7.0 : les mix d'1 h et plus sont désormais contrastés (titres bien distincts, même en Moyenne) ; l'identité est garantie
  // pour les mix plus courts (mix forcé 30 min), empreintes v1.6.3.
  const MIXGOLD = { 'mix/hiphop/3': '37659c246a49febe723bfa97bac96034', 'mix/dnb/99': '04ac12ae07c8d8d43ad906e12cf8feea', 'mixdeck/techno/3': '25e59902c0c11f3c3404eaefcd1b0701', 'mixdeck/hiphop/99': 'baa8fed5ff619257cce208bc8e8f9fa1' };
  for (const extra of [{}, { variety: 'medium' }]) {
    let ok = true;
    for (const [k, g] of Object.entries(GOLD)) { const [style, seed, duration] = k.split('/'); const p = C.planSong({ style, seed: +seed, duration: +duration, ...extra }); if (h([events(p), p.meta]) !== g) { ok = false; console.log('  diff', k); } }
    for (const [k, g] of Object.entries(MIXGOLD)) {
      const [kind, style, seed] = k.split('/'); const m = M.planMix({ style, seed: +seed, duration: 1800, ...extra, adv: { mix: 'on', ...(extra.adv || {}) } });
      if ((kind === 'mix' ? h(m.tracklist) : h(events(M.deckPlan(m.decks[1])))) !== g) { ok = false; console.log('  diff', k); }
    }
    check(ok, `Moyenne ${JSON.stringify(extra)} : morceaux (v1.6.2) et mix < 1 h (v1.6.3) identiques (mêmes graines)`);
  }
}

// ---------- déterminisme : même graine + mêmes réglages = même résultat
for (const variety of ['low', 'high', 'max']) {
  const a = M.planMix({ style: 'hiphop', seed: 11, duration: 3600, variety, mixStyles: 'related' });
  const b = M.planMix({ style: 'hiphop', seed: 11, duration: 3600, variety, mixStyles: 'related' });
  const p1 = C.planSong({ style: 'lofi', seed: 5, duration: 600, variety }), p2 = C.planSong({ style: 'lofi', seed: 5, duration: 600, variety });
  check(h(a.tracklist) === h(b.tracklist) && h(events(M.deckPlan(a.decks[2]))) === h(events(M.deckPlan(b.decks[2]))) && h(events(p1)) === h(events(p2)), `${variety} : déterministe (mix, titre du mix, morceau)`);
}
check(h(M.planMix({ style: 'hiphop', seed: 11, duration: 3600, variety: 'low' }).tracklist) !== h(M.planMix({ style: 'hiphop', seed: 11, duration: 3600, variety: 'max' }).tracklist), 'le niveau change bien le mix');

// ---------- mix longs : Faible vs Maximale
const SEEDS = [3, 11, 99, 123, 2024];
const stats = (style, variety, duration = 3600, extra = {}) => SEEDS.map((seed) => {
  const m = M.planMix({ style, seed, duration, variety, ...extra }), tl = m.tracklist;
  return { m, n: tl.length, subs: uniq(tl.map((t) => (t.style || '') + ':' + t.sub)), keys: uniq(tl.map((t) => t.camelot)), bpm: Math.max(...tl.map((t) => t.bpm)) - Math.min(...tl.map((t) => t.bpm)), sec: m.tempo.sec(m.totalBeats), tl };
});
const avg = (a, k) => a.reduce((s, x) => s + x[k], 0) / a.length;
for (const style of ['hiphop', 'dnb', 'techno']) {
  const lo = stats(style, 'low'), md = stats(style, 'medium'), mx = stats(style, 'max');
  check(lo.every((x) => x.subs === 1), `${style} Faible : un seul sous-style par mix`);
  check(lo.every((x) => x.bpm <= 2), `${style} Faible : tempo constant (écart max ${Math.max(...lo.map((x) => x.bpm))} BPM)`);
  check(avg(lo, 'keys') < avg(md, 'keys') && avg(mx, 'keys') > avg(md, 'keys'), `${style} tonalités distinctes : Faible ${avg(lo, 'keys').toFixed(1)} < Moyenne ${avg(md, 'keys').toFixed(1)} < Maximale ${avg(mx, 'keys').toFixed(1)}`);
  check(mx.every((x) => x.subs >= 2) && avg(mx, 'subs') >= 2.6, `${style} Maximale : sous-styles en rotation (moy. ${avg(mx, 'subs').toFixed(1)}, min ${Math.min(...mx.map((x) => x.subs))})`);
  check(avg(mx, 'bpm') > avg(lo, 'bpm') + 4, `${style} Maximale : voyage de tempo (écart moyen ${avg(mx, 'bpm').toFixed(1)} BPM vs ${avg(lo, 'bpm').toFixed(1)})`);
  for (const [lv, s] of [['low', lo], ['max', mx]]) check(s.every((x) => Math.abs(x.sec - 3600) < 30), `${style} ${lv} : durée respectée (${s.map((x) => x.sec.toFixed(0)).join(', ')} s)`);
}
{ // limites connues : un mix hip-hop qui commence en trap ne reste pas trap ; DnB : les 3 variantes quelle que soit la graine
  const startsTrap = [...Array(60).keys()].map((i) => i + 1).filter((seed) => C.resolveParams({ style: 'hiphop', seed, duration: 3600 }).hiphopStyle === 'trap').slice(0, 3);
  for (const seed of startsTrap) {
    const tl = M.planMix({ style: 'hiphop', seed, duration: 3600, variety: 'max' }).tracklist;
    check(tl[0].sub === 'trap' && uniq(tl.map((t) => t.sub)) >= 2, `hip-hop graine ${seed} (départ trap) : ${[...new Set(tl.map((t) => t.sub))].join(' / ')}`);
  }
  const dnb = stats('dnb', 'max', 7200);
  check(dnb.every((x) => uniq(x.tl.map((t) => t.sub)) === 3), `DnB 2 h Maximale : liquid / neuro / jungle pour chaque graine`);
  const ht = stats('hiphop', 'max').flatMap((x) => x.tl.filter((t) => t.sub === 'trap'));
  check(ht.length > 0 && ht.every((t) => t.halftime && Math.abs(t.gridBpm * 2 - t.bpm) <= 1), `trap en demi-temps dans un mix hip-hop (${ht.length} titres, ex. ${ht[0]?.bpm} BPM sur grille ${ht[0]?.gridBpm})`);
}
{ // anti-répétition + alignement des mesures (demi-temps compris)
  let rep = 0, misaligned = 0, n = 0;
  for (const variety of ['high', 'max']) for (const style of ['hiphop', 'lofi', 'house']) {
    const m = M.planMix({ style, seed: 7, duration: 7200, variety, mixStyles: 'related' });
    const plans = m.decks.map((d) => M.deckPlan(d));
    plans.forEach((p, i) => { n++; if (p.totalBars !== m.decks[i].bars * (m.decks[i].ratio || 1)) misaligned++; if (i && p.meta.progressions.A.join() === plans[i - 1].meta.progressions.A.join() && p.S.patches.chords === plans[i - 1].S.patches.chords) rep++; });
  }
  check(misaligned === 0, `mesures de chaque titre = mesures prévues × ratio (${n} titres)`);
  check(rep === 0, `pas deux titres consécutifs avec même progression et même son d'accords (${rep})`);
}
{ // styles proches : seulement si autorisé, ~30 % au plus, retour au style de départ
  const same = stats('lofi', 'max', 7200), rel = stats('lofi', 'max', 7200, { mixStyles: 'related' });
  check(same.every((x) => x.tl.every((t) => !t.style)), 'lofi Maximale « même style » : aucun autre style');
  const share = rel.map((x) => x.tl.filter((t) => t.style).length / x.n);
  check(share.some((s) => s > 0) && share.every((s) => s <= 0.4), `lofi « styles proches » : part d'autres styles ${share.map((s) => Math.round(s * 100) + '%').join(' ')}`);
  check(rel.every((x) => !x.tl[0].style && !x.tl.at(-1).style), 'départ et fin dans le style choisi');
  const lowRel = stats('lofi', 'low', 3600, { mixStyles: 'related' });
  check(lowRel.every((x) => x.tl.every((t) => !t.style)), 'styles proches ignorés en Faible');
  const forced = M.planMix({ style: 'hiphop', seed: 3, duration: 3600, variety: 'max', adv: { hiphopStyle: 'lofi' } }).tracklist;
  check(uniq(forced.map((t) => t.sub)) === 1, 'un sous-style choisi par l\'utilisateur est respecté (pas de rotation)');
}

// ---------- dans un morceau : chapitres, modulations, batterie
{
  let ch = [0, 0, 0, 0], mods = [0, 0, 0, 0], drums = [0, 0, 0, 0];
  const lv = ['low', 'medium', 'high', 'max'];
  for (const seed of [1, 2, 3, 4, 5, 6]) lv.forEach((variety, i) => {
    const p = C.planSong({ style: 'lofi', seed, duration: 1200, variety });
    ch[i] += uniq(p.meta.sections.map((s) => s.name || s.label || s));
    mods[i] += p.meta.chapters.filter((c) => c.transpose).length;
    const st = {}; const pats = new Set();
    for (let ci = 0; ci < p.chapters.length; ci++) {
      const evs = C.composeChapter(p, ci, st); const ds = (Array.isArray(evs) ? evs : evs.events || []).filter((e) => e.ch === 'drums' || e.inst === 'drums' || e.track === 'drums');
      const byBar = {}; for (const e of ds) { const b = Math.floor(e.t / p.bpb); (byBar[b] ||= []).push(`${e.n ?? e.p ?? e.note}@${(e.t - b * p.bpb).toFixed(2)}`); }
      for (const b in byBar) pats.add(byBar[b].sort().join(','));
    }
    drums[i] += pats.size;
  });
  check(mods[0] === 0 && mods[1] === 0 && mods[3] > 0, `modulations de chapitre : seulement en Forte / Maximale (${mods.join(' / ')})`);
  check(drums[0] < drums[1] && drums[1] < drums[3], `variantes de batterie (mesures distinctes) : Faible ${drums[0]} < Moyenne ${drums[1]} < Maximale ${drums[3]}`);
}

// ---------- API : paramètre variety / mixStyles, Détails, Remix
if (!process.argv.includes('--no-api')) {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const B = `http://127.0.0.1:${port}`;
  const srv = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], { env: { ...process.env, SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA_DIR: path.join(tmp, 'api-data') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  const api = async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json' } }); return { s: r.status, j: await r.json().catch(() => null) }; };
  const wait = async (fn, ms = 180000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('délai dépassé'); await new Promise((r) => setTimeout(r, 400)); } };
  try {
    await wait(async () => (await fetch(B + '/api/options').catch(() => null))?.ok, 20000);
    const o = await api('/api/options');
    check(!!(o.j?.advanced || o.j?.adv)?.variety, '/api/options expose le réglage variety');
    const spec = await api('/api/openapi.json');
    check(String(spec.j?.info?.version).split('.').map(Number).reduce((a, x) => a * 1000 + x, 0) >= 1006003 && JSON.stringify(spec.j).includes('"variety"') && JSON.stringify(spec.j).includes('"mixStyles"'), 'openapi 1.6.3 documente variety et mixStyles');
    const g = await api('/api/generate', { method: 'POST', body: JSON.stringify({ style: 'lofi', seed: 4242, duration: 20, variety: 'maximale', mixStyles: 'related', wav: false }) });
    check(g.s === 202 && g.j?.params?.adv?.variety === 'max' && g.j.params.adv.mixStyles === 'related', `génération avec variety « maximale » => adv.variety ${g.j?.params?.adv?.variety}`);
    const t = await wait(async () => { const r = await api('/api/jobs/' + g.j.id); return r.j?.status === 'done' && r.j; });
    check(t.settings?.adv?.variety === 'max', 'réglages réutilisables (Réutiliser) : variety conservé');
    const rm = await api(`/api/tracks/${t.id}/variation`, { method: 'POST', body: JSON.stringify({ mode: 'remix' }) });
    check(rm.s === 202 && rm.j?.params?.adv?.variety === 'max' && rm.j.params.seed !== t.seed, 'Remix : variety conservé, nouvelle graine');
    const d0 = await api('/api/generate', { method: 'POST', body: JSON.stringify({ style: 'lofi', seed: 4243, duration: 20, wav: false }) });
    check(d0.j?.params?.adv?.variety == null, 'sans variety : adv.variety null (Moyenne)');
  } catch (e) { check(false, 'API : ' + e.message); console.log(log.slice(-1500)); }
  finally { srv.kill(); }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} échec(s)` : '\nv1.6.3 : tout est OK');
process.exit(fail ? 1 : 0);
