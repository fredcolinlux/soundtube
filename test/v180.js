// Tests v1.8.0 : moteur 1.8 (compatibilité des anciens morceaux), French Touch, boîtes TR-606/707/DR-110,
// synthés vintage (DX7, Minimoog, Juno, ARP, talkbox/vocodeur), options « Forcer », installeur Windows.
// node test/v180.js   (--no-api : sans serveur)
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v180-'));
process.env.SOUNDTUBE_DATA_DIR = path.join(tmp, 'unit-data');
const C = await import('../src/engine/composer.js');
const ST = await import('../src/engine/styles.js');
const FL = await import('../src/engine/flavor.js');
const I = await import('../src/engine/instruments.js');
const M = await import('../src/engine/mix.js');
const { renderTrack } = await import('../src/engine/render.js');
const { makeRng } = await import('../src/engine/rng.js');

let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const h = (o) => crypto.createHash('md5').update(JSON.stringify(o, (k, v) => (typeof v === 'function' ? undefined : v))).digest('hex');
const events = (plan) => { const st = {}, a = []; for (let ci = 0; ci < plan.chapters.length; ci++) a.push(h(C.composeChapter(plan, ci, st))); return a; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const finite = (b) => { if (!b || !b.length) return false; let pk = 0; for (let i = 0; i < b.length; i++) { if (!Number.isFinite(b[i])) return false; pk = Math.max(pk, Math.abs(b[i])); } return pk > 1e-4 && pk < 4; };

// ---------- moteur 1.8 : drapeau et compatibilité
{
  const r = (x) => C.resolveParams({ style: 'house', seed: 1, duration: 60, ...x });
  check(r({}).engine === undefined && r({ engine: 17 }).engine === undefined && r({ engine: 18 }).engine === 18 && C.resolveParams({ style: 'frenchtouch', seed: 1 }).engine === 18, 'engine : absent / 17 = historique, 18 = moteur 1.8, French Touch toujours 1.8');
  check(JSON.stringify(ST.styleDef('house').bpm) === '[118,126]' && JSON.stringify(ST.styleDef('house', null, 18).bpm) === '[118,125]' && ST.styleDef('lofi', null, 18).progressions.length > ST.styleDef('lofi').progressions.length, 'styleDef : défauts historiques intacts, révisions 1.8 fusionnées');
  let same = true, diff = 0;
  for (const [style, seed, dur] of [['lofi', 42, 600], ['house', 7, 240], ['techno', 42, 300], ['synthwave', 9, 180], ['hiphop', 777, 240]]) {
    const a = events(C.planSong({ style, seed, duration: dur })), b = events(C.planSong({ style, seed, duration: dur, engine: 17 })), c = events(C.planSong({ style, seed, duration: dur, engine: 18 }));
    if (h(a) !== h(b)) same = false; if (h(a) !== h(c)) diff++;
  }
  check(same, 'engine 17 = morceau identique à l’absence de engine (anciens réglages)');
  check(diff >= 3, `engine 18 : recettes revues (${diff}/5 morceaux différents)`);
}

// ---------- boîtes à rythmes et synthés
{
  const kinds = ['kick', 'snare', 'clap', 'hat', 'ohat', 'rim', 'tom', 'crash', 'cowbell', 'shaker'];
  for (const kit of ['tr606', 'tr707', 'dr110']) {
    const bad = kinds.filter((k) => { const b = I.renderDrum(kit, k, makeRng(5), { kick: 1, snare: 1, hat: 1, decay: 1 }); return b && !finite(b.L || b); });
    const ok = kinds.filter((k) => I.renderDrum(kit, k, makeRng(5), { kick: 1, snare: 1, hat: 1, decay: 1 }));
    check(!bad.length && ok.includes('kick') && ok.includes('hat') && (ok.includes('snare') || ok.includes('clap')), `${kit} : ${ok.length} frappes synthétisées, signal fini${bad.length ? ' — ' + bad : ''}`);
  }
  const bad = [];
  for (const p of I.VINTAGE_PATCHES) for (const m of [36, 60, 84]) { const s = I.renderNote(p, m, 0.5, 0.9, { bright: 1, rnd: makeRng(3) }); if (!finite(s.L || s) || (s.R && !finite(s.R))) bad.push(p + '@' + m); }
  check(!bad.length, `${I.VINTAGE_PATCHES.length} synthés vintage (${I.VINTAGE_PATCHES.join(', ')}) : 3 hauteurs, signal fini${bad.length ? ' — ' + bad : ''}`);
  const A = C.ADVANCED;
  check(['tr606', 'tr707', 'dr110', 'tr808', 'tr909'].every((k) => k in A.drumKit.options) && /TB-303/.test(A.bassPatch.options.acid) && 'moogbass' in A.bassPatch.options && 'talkbox' in A.leadPatch.options && 'junopoly' in A.chordPatch.options && !('moogbass' in A.leadPatch.options), 'options avancées : boîtes et synthés par nom de modèle');
  check(FL.PATCH_LABELS.acid === 'acid 303', 'libellés historiques inchangés (descriptions des anciens morceaux)');
}

// ---------- French Touch : composition
{
  let fx = 0, sweepsUp = 0, clap = true, fourKick = true, disco = 0, bpmOk = true, chord4 = true, kits = new Set();
  for (let seed = 1; seed <= 8; seed++) {
    const s = C.compose({ style: 'frenchtouch', seed, duration: 75 });
    const F = s.events.filter((e) => e.inst === 'fx');
    fx += F.length; if (F.some((e) => e.b - e.a > 0.5)) sweepsUp++;
    const r = s.meta.recipe; kits.add(r.groove.kit);
    if (!(s.params.bpm >= 118 && s.params.bpm <= 126)) bpmOk = false;
    const F0 = C.planSong({ style: 'frenchtouch', seed, duration: 75 }).F;
    for (const g of [...F0.drums.A, ...F0.drums.B]) { if (![0, 4, 8, 12].every((i) => g.kick?.[i] === 'x')) fourKick = false; if (![4, 12].every((i) => /[xo]/.test(g.clap?.[i] || ''))) clap = false; }
    if (/disco/.test(r.jeu.basse) || /disco/.test(r.jeu.accords)) disco++;
    if (r.jeu.notesParAccord < 4) chord4 = false;
  }
  check(bpmOk && fourKick && clap, 'French Touch : 118-126 BPM, quatre temps, clap 2 et 4');
  check(fx >= 8 * 4 && sweepsUp === 8, `French Touch : automatisation du passe-bas par section (${fx} segments, montées dans 8/8 morceaux)`);
  check(disco >= 5 && chord4, `French Touch : boucle d’accords / basse disco (${disco}/8), accords de 4 sons et plus`);
  check([...kits].some((k) => /909/.test(k)), `French Touch : boîtes ${[...kits].join(', ')}`);
  const midi = C.compose({ style: 'frenchtouch', seed: 3, duration: 30 });
  check(midi.events.every((e) => e.inst !== 'fx' || (e.kind === 'lpf' && e.a >= 0 && e.a <= 1 && e.b >= 0 && e.b <= 1 && e.d > 0)), 'événements fx valides (0…1, durée > 0)');
}

// ---------- rendus courts : niveau -14 LUFS, MIDI sans piste fx
{
  const cases = [
    [{ style: 'frenchtouch', seed: 4, duration: 30 }, 'French Touch'],
    [{ style: 'techno', seed: 12, duration: 20, engine: 18, adv: { drumKit: 'tr606' } }, 'techno TR-606'],
    [{ style: 'house', seed: 11, duration: 20, engine: 18, adv: { drumKit: 'tr707', leadPatch: 'talkbox' } }, 'house TR-707 + talkbox'],
    [{ style: 'lofi', seed: 13, duration: 20, engine: 18, adv: { drumKit: 'dr110', chordPatch: 'dx7epiano' } }, 'lo-fi DR-110 + DX7'],
  ];
  for (const [p, label] of cases) {
    const midPath = path.join(tmp, 'x.mid');
    const r = await renderTrack(p, { memory: true, midPath });
    const L = r.loudness?.integrated;
    check(Math.abs(L + 14) < 0.7 && r.loudness.truePeak <= -0.9 && fs.statSync(midPath).size > 100, `${label} : ${L} LUFS, crête ${r.loudness.truePeak} dBTP, MIDI ${fs.statSync(midPath).size} o`);
  }
}

// ---------- mix ≥ 1 h : moteur transmis aux titres, voisinage house ↔ French Touch (moteur 1.8 seulement)
{
  const mp = M.planMix({ style: 'frenchtouch', seed: 5, duration: 3700, adv: { mixStyles: 'related', variety: 'high' } });
  const decks = mp.decks || [];
  check(decks.length >= 6 && decks.every((d) => d.params?.engine === 18), `mix French Touch 1 h : ${decks.length} titres en moteur 1.8`);
  const kits = new Set(decks.map((d) => d.params?.adv?.drumKit).filter(Boolean));
  check(kits.size >= 2, `mix : boîtes qui tournent (${[...kits].join(', ')})`);
  const legacy = M.planMix({ style: 'house', seed: 5, duration: 3700, adv: { mixStyles: 'related', variety: 'high' } });
  check((legacy.decks || []).every((d) => d.params?.style !== 'frenchtouch' && d.params?.engine === undefined), 'mix house historique : ni French Touch ni moteur 1.8 (identique à avant)');
}

// ---------- installeur Windows : -AllowFrom, BOM + CRLF, analyse PowerShell
{
  const ps = fs.readFileSync(path.join(ROOT, 'node-agent/install-windows.ps1'));
  const txt = ps.toString('utf8');
  check(ps[0] === 0xef && ps[1] === 0xbb && ps[2] === 0xbf && !/[^\r]\n/.test(txt), 'install-windows.ps1 : UTF-8 avec BOM, fins de ligne CRLF');
  check(/\[string\[\]\]\$AllowFrom/.test(txt) && txt.includes("'192.168.0.0/16'") && txt.includes('LocalSubnet') && /CtAddress/.test(txt), 'installeur : -AllowFrom (plages privées par défaut), -CtAddress conservé');
  const pwsh = ['/tmp/pwsh/pwsh', 'pwsh'].find((p) => spawnSync(p, ['-v'], { encoding: 'utf8' }).status === 0);
  if (pwsh) {
    const r = spawnSync(pwsh, ['-NoProfile', '-Command', `$e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('${path.join(ROOT, 'node-agent/install-windows.ps1')}', [ref]$null, [ref]$e); $e.Count`], { encoding: 'utf8' });
    check(r.stdout.trim() === '0', `analyse PowerShell : ${r.stdout.trim()} erreur(s)`);
  } else console.log('—     pwsh absent : analyse PowerShell sautée');
  check(fs.readFileSync(path.join(ROOT, 'node-agent/README.md'), 'utf8').includes('-AllowFrom 10.0.0.0/24'), 'README de l’agent : exemple -AllowFrom 10.0.0.0/24');
}

// ---------- interface : interrupteurs « Forcer »
{
  const app = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
  check(app.includes('st.advTweaks') && app.includes('/api/advanced/defaults') && app.includes('Réinitialiser'.slice(0, 0) + 'adv-undo'), 'interface (v1.9.0 remplace « Forcer ») : valeurs réelles du style, retouches mémorisées par style');
  check(fs.existsSync(path.join(ROOT, 'docs/STYLES.md')) && fs.readFileSync(path.join(ROOT, 'docs/STYLES.md'), 'utf8').includes('## French Touch'), 'docs/STYLES.md présent');
}

// ---------- API
if (!process.argv.includes('--no-api')) {
  const port = await freePort(), B = `http://127.0.0.1:${port}`;
  const srv = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], { env: { ...process.env, SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA_DIR: path.join(tmp, 'api-data') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  const api = async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json' } }); return { s: r.status, j: await r.json().catch(() => null) }; };
  const wait = async (fn, ms = 180000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('délai dépassé'); await sleep(400); } };
  try {
    await wait(async () => (await fetch(B + '/api/options').catch(() => null))?.ok, 20000);
    const o = (await api('/api/options')).j;
    const ids = o.styles.map((s) => s.id);
    check(ids[ids.indexOf('house') + 1] === 'frenchtouch' && o.engine >= 18 && o.styleDefaults?.frenchtouch?.kits.includes('tr707') && o.styleDefaults.techno.kits.includes('tr606') && o.styleDefaults.lofi.kits.includes('dr110'), '/api/options : French Touch après la house, défauts par style (boîtes, sons)');
    const g = await api('/api/generate', { method: 'POST', body: JSON.stringify({ style: 'frenchtouch', seed: 180, duration: 20, wav: false }) });
    const t = await wait(async () => { const x = await api('/api/jobs/' + g.j.id); return ['done', 'error'].includes(x.j?.status) && x.j; });
    check(t.status === 'done' && t.settings.engine >= 18 && t.urls.mp3, `génération French Touch via l’API (${t.status}, moteur ${t.settings.engine})`);
    const g2 = await api('/api/generate', { method: 'POST', body: JSON.stringify({ style: 'lofi', seed: 181, duration: 20, wav: false, engine: 17 }) });
    check(g2.j.settings.engine === 17 && g2.j.params.engine === undefined, 'engine 17 accepté : morceau en moteur historique, réglages « engine: 17 »');
    const v = await api(`/api/tracks/${g2.j.id}/variation`, { method: 'POST', body: JSON.stringify({ mode: 'variation' }) });
    check(v.s === 202 && v.j.params.engine === undefined && v.j.settings.engine === 17, 'variation d’un ancien morceau : moteur d’origine conservé');
    const n = await api('/api/generate', { method: 'POST', body: JSON.stringify({ style: 'house', seed: 182, duration: 20, wav: false }) });
    check(n.j.params.engine >= 18, `nouvelle génération sans engine : moteur récent (${n.j.params.engine})`);
    const spec = await api('/api/openapi.json');
    check(String(spec.j?.info?.version).split('.').map(Number).reduce((a, x) => a * 1000 + x, 0) >= 1008000, `openapi ≥ 1.8.0 (${spec.j?.info?.version})`);
    check(JSON.stringify(spec.j).includes('frenchtouch') && JSON.stringify(spec.j).includes('engine'), 'openapi : style frenchtouch et champ engine documentés');
  } catch (e) { check(false, 'API : ' + e.message); console.log(log.slice(-1500)); }
  finally { srv.kill(); }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} échec(s)` : '\nv1.8.0 : tout est OK');
process.exit(fail ? 1 : 0);
