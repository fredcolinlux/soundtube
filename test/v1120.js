// Tests v1.12.0 : moteur 21 (harmonie juste, docs/THEORIE.md) — accords 100 % dans la tonalité, moteur 20 inchangé
// à l'octet près, et route POST /api/tracks/:id/regenerate (l'original n'est jamais modifié).
// node test/v1120.js
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v1120-'));
process.env.SOUNDTUBE_DATA_DIR = path.join(tmp, 'unit-data');
const { compose, renderTrack } = await import('../src/engine/render.js');
const { SCALES, NOTE_NAMES, voiceLead, parallels } = await import('../src/engine/theory.js');
const { resolveAdvancedDefaults } = await import('../src/engine/advdefaults.js');

let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const h = (x) => crypto.createHash('md5').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. moteur 20 : identique à v1.11.0 (empreintes calculées sur l'étiquette v1.11.0)
const GOLD = [
[{"style":"lofi","seed":2101,"duration":30,"engine":20,"adv":{"lofiStyle":"jazzy"}},"66a860eee70d8fae1b4f6d3e06d1f7a1","f4be4b2c3efa2fa6e940c5fe0a9baf75"],
[{"style":"lofi","seed":2102,"duration":30,"engine":20,"adv":{"lofiStyle":"beatmaker"}},"33091a53b549b60264d4cf5e77e49224","bb76bb172d2bcfadd561e6b3e86ae5b1"],
[{"style":"frenchtouch","seed":2103,"duration":30,"engine":20,"adv":{"ftStyle":"classic"}},"c43b93276e7af6947f8622ecb7e23abe","8c7202a14cc551ade764f561887e28ac"],
[{"style":"frenchtouch","seed":2104,"duration":30,"engine":20,"adv":{"ftStyle":"edbanger"}},"02c7304c4b90cb9df1154d6e91c46b1c","cb456d337044995bc898b75835ce5faa"],
[{"style":"frenchtouch","seed":2105,"duration":30,"engine":20,"adv":{"ftStyle":"myd"}},"458da5f55858cf12b3ec638d8f7bcbd8","7f5c453899b8ce55d0c94ae3a216da72"],
[{"style":"house","seed":2106,"duration":30,"engine":20},"64ffa0e2ff1b3a107f9fa1ce08703379","c7c8a177d79d43628f266536be7a1fb0"],
[{"style":"trap","seed":2107,"duration":30,"engine":20},"5cfdd27149074a83c9b25b2c84b0ce2b","ab7e0e21f856cc5998b8a598ea1d672b"],
[{"style":"synthwave","seed":2108,"duration":30,"engine":20},"5df2047f93978ef4ab275e1e5428cedf","8ecde33a8b3643190b6ad27b6f18406e"],
[{"style":"ambient","seed":2109,"duration":30,"engine":20},"62799e337e987efb3e3bf251afa424b6","f8a1315b2b41e6dd8d7a5d78ecf180f9"]
];
for (const [i, [c, ev, pcm]] of GOLD.entries()) {
  const e = h(compose(c).events);
  if (i % 3) { check(e === ev, `moteur 20 identique à v1.11.0 (événements) : ${c.style} ${c.adv ? Object.values(c.adv).join() : ''}`); continue; }
  const r = await renderTrack(c, { memory: true });
  check(e === ev && h(r.pcm) === pcm, `moteur 20 identique à v1.11.0 (événements + audio) : ${c.style} ${c.adv ? Object.values(c.adv).join() : ''}`);
}

// ---------- 2. moteur 21 : notes des accords 100 % dans la tonalité
// « dans la tonalité » = gamme ; mineur harmonique : + mineur naturel (♭7 des accords autres que V / vii, voulu) ;
// synthwave : IV majeur emprunté (déclaré). Le dernier refrain peut monter d'un ou deux demi-tons (détecté).
const NAT = [0, 2, 3, 5, 7, 8, 10];
const VARIANTS = [
  ['lofi', { lofiStyle: 'jazzy' }], ['lofi', { lofiStyle: 'chillhop' }], ['lofi', { lofiStyle: 'lofihouse' }], ['lofi', { lofiStyle: 'ambient' }], ['lofi', { lofiStyle: 'sad' }], ['lofi', { lofiStyle: 'beatmaker' }],
  ['hiphop', { hiphopStyle: 'boombap' }], ['hiphop', { hiphopStyle: 'lofi' }], ['hiphop', { hiphopStyle: 'trap' }], ['trap', {}], ['house', {}],
  ['frenchtouch', { ftStyle: 'classic' }], ['frenchtouch', { ftStyle: 'edbanger' }], ['frenchtouch', { ftStyle: 'myd' }],
  ['techno', { technoStyle: 'detroit' }], ['techno', { technoStyle: 'minimal' }], ['techno', { technoStyle: 'industriel' }],
  ['synthwave', { synthStyle: 'outrun' }], ['synthwave', { synthStyle: 'dreamwave' }],
  ['dnb', { dnbStyle: 'liquid' }], ['dnb', { dnbStyle: 'neuro' }], ['dnb', { dnbStyle: 'jungle' }], ['ambient', {}], ['cinematic', {}], ['chiptune', {}],
];
function chordStats(c) {
  const P = c.params, keyPc = NOTE_NAMES.indexOf(P.key), steps = SCALES[P.scale].steps;
  const ok = new Set(steps); if (P.scale === 'harmonic_minor') NAT.forEach((x) => ok.add(x));
  if (P.style === 'synthwave' && steps.includes(3)) ok.add(9);
  const secs = c.meta.sections || c.plan.chapters[0].sections; const lastB = [...secs].reverse().find((s) => s.type === 'B');
  const ev = c.events.filter((e) => e.m != null && !['drums', 'texture', 'scr', 'fx'].includes(e.inst));
  const inSc = (m, sh) => ok.has(((m - keyPc - sh) % 12 + 12) % 12);
  let lift = 0;
  // montée de tonalité du dernier refrain (0, 1 ou 2 demi-tons) : le décalage qui explique le mieux les accords de la fin
  if (lastB) { const t0 = lastB.startBar * 4 - 0.05, tail = ev.filter((e) => e.t >= t0 && e.inst === 'chords' && !e.patch); let best = 1e9; for (const sh of [0, 1, 2]) { const k = tail.filter((e) => !inSc(e.m, sh)).length; if (k < best) { best = k; lift = sh; } } }
  const sh = (t) => (lift && t >= lastB.startBar * 4 - 0.05 ? lift : 0);
  const ch = ev.filter((e) => e.inst === 'chords' && !e.patch);
  return { n: ch.length, out: ch.filter((e) => !inSc(e.m, sh(e.t))).length };
}
{
  let n = 0, out = 0, par20 = 0, par21 = 0; const bad = [];
  for (const [style, adv] of VARIANTS) for (let seed = 1; seed <= 6; seed++) {
    const s = chordStats(compose({ style, seed, duration: 60, engine: 21, adv })); n += s.n; out += s.out; if (s.out) bad.push(`${style}/${Object.values(adv).join()}#${seed}`);
  }
  check(n > 5000 && out === 0, `moteur 21 : ${n} notes d'accords, ${out} hors tonalité (100 % dans la tonalité)${bad.length ? ' — ' + bad.slice(0, 6).join(', ') : ''}`);
  // le même contrôle échoue en moteur 20 (le défaut corrigé existait bien)
  let o20 = 0; for (const [style, adv] of VARIANTS) for (let seed = 1; seed <= 6; seed++) o20 += chordStats(compose({ style, seed, duration: 60, engine: 20, adv })).out;
  check(o20 > 0, `moteur 20 : ${o20} notes d'accords hors tonalité (le défaut corrigé par le moteur 21 est bien mesuré)`);
}
{ // voiceLead aligné : un accord de do majeur posé sous la tessiture reste do majeur
  const v = voiceLead([60, 64, 67], null, 50, 74, { aligned: true }).map((m) => m % 12).sort((a, b) => a - b);
  check(v.join() === '0,4,7', `voiceLead aligné : do majeur conservé (${v.join()})`);
  check(parallels([48, 55], [50, 57]) === 1 && parallels([48, 55], [50, 59]) === 0, 'parallels() : quintes parallèles détectées');
}
{ // swing croches lo-fi jazzy + défaut moteur 21
  const c = compose({ style: 'lofi', seed: 77, duration: 40, engine: 21, adv: { lofiStyle: 'jazzy' } });
  check(c.params.engine === 21, 'compose({ engine: 21 }) : moteur 21');
  check(resolveAdvancedDefaults({ style: 'house', seed: 5 }).engine === 21 || resolveAdvancedDefaults({ style: 'house', seed: 5 }).engine == null, 'réglages avancés : moteur 21 par défaut');
  const r19 = compose({ style: 'house', seed: 9, duration: 40, engine: 19 }), f19 = compose({ style: 'house', seed: 9, duration: 40, engine: 19, harmonyFix: true });
  check(f19.params.harmonyFix === true && f19.params.bpm === r19.params.bpm && f19.params.key === r19.params.key && f19.params.scale === r19.params.scale, 'ancien moteur + harmonyFix : même tempo, tonalité et gamme');
  check(chordStats(f19).out === 0, 'ancien moteur + harmonyFix : accords dans la tonalité');
  check(!('harmonyFix' in compose({ style: 'house', seed: 9, duration: 40, engine: 21, harmonyFix: true }).params), 'harmonyFix ignoré en moteur 21');
}

// ---------- 3. route de régénération (serveur réel, données temporaires)
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
{
  const port = await freePort(), B = `http://127.0.0.1:${port}`;
  const srv = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], { env: { ...process.env, SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA_DIR: path.join(tmp, 'api-data'), SOUNDTUBE_MP3: 'off' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  const req = async (p, m = 'GET', b) => { const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, j }; };
  const done = async (id) => { for (let i = 0; i < 300; i++) { const j = (await req('/api/jobs/' + id)).j; if (j?.status === 'done' || j?.status === 'error') return j; await sleep(300); } return null; };
  try {
    for (let i = 0; i < 100; i++) { if ((await fetch(B + '/api/options').catch(() => null))?.ok) break; await sleep(200); }
    check((await req('/api/options')).j.engine === 21, '/api/options : moteur 21 par défaut');
    const spec = (await req('/api/openapi.json')).j; check(String(spec.info.version).split('.').map(Number).reduce((a, x) => a * 1000 + x, 0) >= 1012000 && !!spec.paths['/api/tracks/{id}/regenerate'], `openapi ${spec.info.version} (≥ 1.12.0) : /api/tracks/{id}/regenerate documentée`);
    const old = await done((await req('/api/generate', 'POST', { style: 'house', seed: 4242, duration: 20, engine: 20, wav: true })).j.id);
    check(old?.status === 'done' && old.params.engine === 20 && old.regen_ok === true, 'ancien morceau (moteur 20) généré, régénérable');
    const before = fs.readFileSync(path.join(tmp, 'api-data', 'tracks', old.id, old.files.wav)), oldJson = JSON.stringify({ ...old, regenerations: [], regen_ok: true });
    const r = await req(`/api/tracks/${old.id}/regenerate`, 'POST', {});
    check(r.s === 202 && r.j.parent_id === old.id && r.j.regen_of?.id === old.id && /\(régénéré en v1\.12\.0\)$/.test(r.j.title), `régénération : 202, lien vers l'original, titre « ${r.j?.title} »`);
    const nw = await done(r.j.id);
    check(nw?.status === 'done' && nw.params.engine === 21 && nw.seed === old.seed && nw.params.bpm === old.params.bpm && nw.params.key === old.params.key && nw.params.scale === old.params.scale, 'nouveau morceau : moteur 21, même graine, tempo, tonalité et gamme');
    check(nw.meta?.regenOf === old.id && nw.regen_of?.title === old.title, 'meta.regenOf conservé après le rendu');
    const o2 = (await req('/api/tracks/' + old.id)).j;
    check(o2.regenerations?.length === 1 && o2.regenerations[0].id === nw.id && o2.files.wav === old.files.wav && o2.params.engine === 20 && o2.title === old.title, "original intact, avec le lien vers sa version régénérée");
    check(fs.readFileSync(path.join(tmp, 'api-data', 'tracks', old.id, old.files.wav)).equals(before), 'fichier audio de l\'original inchangé (octet par octet)');
    check((await req(`/api/tracks/${nw.id}/regenerate`, 'POST', {})).s === 409, 'régénérer un morceau moteur 21 : 409');
    check((await req('/api/tracks/inconnu/regenerate', 'POST', {})).s === 404, 'morceau inconnu : 404');
    const o19 = await done((await req('/api/generate', 'POST', { style: 'trap', seed: 99, duration: 20, engine: 19 })).j.id);
    const r19 = await req(`/api/tracks/${o19.id}/regenerate`, 'POST', {}); const n19 = await done(r19.j.id);
    check(n19?.status === 'done' && n19.params.engine === 19 && n19.params.harmonyFix === true && n19.settings.harmonyFix === true, 'moteur 19 : même moteur + corrections harmoniques (harmonyFix)');
    // style ou réglage inconnu : erreur, rien n'est deviné (base modifiée à la main)
    const { default: Database } = await import('better-sqlite3').catch(() => ({ default: null }));
    const dbf = fs.readdirSync(path.join(tmp, 'api-data')).find((f) => /\.(db|sqlite)$/.test(f));
    if (Database && dbf) {
      const db = new Database(path.join(tmp, 'api-data', dbf)); const row = db.prepare('select * from tracks where id = ?').get(o19.id);
      const col = Object.keys(row).find((k) => typeof row[k] === 'string' && row[k].includes('"seed"'));
      const P = JSON.parse(row[col]); db.prepare(`update tracks set ${col} = ? where id = ?`).run(JSON.stringify({ ...P, adv: { ...P.adv, zorglub: 3 } }), o19.id); db.close();
      const e1 = await req(`/api/tracks/${o19.id}/regenerate`, 'POST', {});
      check(e1.s === 400 && /inconnu/.test(e1.j.error), `réglage inconnu : 400 « ${e1.j?.error} »`);
    } else check(true, 'réglage inconnu : (base non SQLite, contrôle ignoré)');
  } catch (e) { check(false, 'API : ' + e.message); console.log(log.slice(-1500)); }
  finally { srv.kill(); }
}
// ---------- 4. interface
{
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const app = read('public/js/app.js'), site = read('public/js/site.js'), st = read('public/js/style.js');
  check(app.includes('data-act="regen"') && app.includes('/regenerate') && app.includes('régénéré en v'), 'studio : bouton « Régénérer en v1.12.0 » et lien « régénéré en v1.12.0 »');
  check(site.includes('data-regen') && site.includes('régénéré en v') && st.includes('/regenerate'), 'pages de style : bouton et lien de régénération');
  check(!/\?v=1\.11\.0/.test(read('public/index.html') + read('public/style.html') + st + app), 'cache des pages : ?v=1.12.0');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} échec(s)` : '\nv1.12.0 : tout est OK');
process.exit(fail ? 1 : 0);
