// Tests v1.15.0 : contexte facultatif du directeur artistique (profil de goût distillé + dernière veille).
// Ollama SIMULÉ uniquement (serveur HTTP local) : aucun appel au vrai PC IA.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v1150-'));
process.env.SOUNDTUBE_DATA_DIR = path.join(tmp, 'unit-data');
const ai = await import('../src/ai.js');
const D = await import('../src/director.js');
const { buildProfile, distill } = await import('../tools/gout-distill.mjs');
const { STYLES } = await import('../src/engine/styles.js');

let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const md5 = (p) => crypto.createHash('md5').update(p.system + '\u0000' + p.user).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. distillation : chiffres exacts sur un CSV de synthèse (guillemets, virgules, invités, vidéos exclues, genres regroupés)
{
  const H = "Titre,Artiste,Artiste de l'album,Album,Genre,Compositeur,Année,Numéro de piste,Nombre de pistes,Numéro de disque,Nombre de disques,Durée,Nombre d'écoutes,Dernière écoute,Nombre de sauts,Dernier saut,Date d'ajout,Date de sortie,Note (étoiles),Favori,Compilation,Contenu explicite,Type,Débit (kb/s),ID persistant";
  const row = (t, a, g, n, type = 'Fichier audio AAC') => [t, a, '', 'Album', g, '', '', '', '', '', '', '3:00', n, '', '', '', '', '', '', '', '', '', type, '', 'X'].map((v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',');
  const csv = [H, row('Un, deux "trois"', 'Daft Punk', 'Electronic', '10'), row('B', 'Daft Punk', 'Électronique', '5'), row('C', 'Justice feat. Uffie', 'Dance', '7'), row('D', 'Justice', 'Dance', '1'),
    row('E', 'IAM', 'Hip-Hop', '9'), row('F', 'IAM', 'Rap', '2'), row('Clip', 'IAM', 'Hip-Hop', '50', 'Fichier vidéo MPEG-4'), row('G', 'The Chemical Brothers', 'Electronica', '4'), row('H', 'Chemical Brothers', 'IDM', '3')].join('\n') + '\n';
  const d = distill(csv);
  check(d.tracks === 9 && d.audio === 8 && d.plays === 41, `distillation : 9 pistes, 8 audio (vidéo exclue), 41 écoutes (${d.tracks}/${d.audio}/${d.plays})`);
  check(JSON.stringify(d.artists.map((a) => [a.name, a.plays])) === JSON.stringify([['Daft Punk', 15], ['IAM', 11], ['Justice', 8], ['The Chemical Brothers', 7]]), 'artistes : invités regroupés (« feat. »), « The » ignoré, vidéo exclue, tri par écoutes');
  check(JSON.stringify(d.genres.map((g) => [g.name, g.plays])) === JSON.stringify([['Électronique', 22], ['Hip-Hop/Rap', 11], ['Dance', 8]]), 'genres regroupés (Electronic / Électronique / Electronica / IDM ; Hip-Hop / Rap)');
  const p = buildProfile(csv);
  check(!JSON.stringify(p).includes('Un, deux') && p.styles.frenchtouch.refs.includes('Daft Punk') && p.sound.length < 200, 'profil : aucun titre de morceau, références French Touch, son décrit en une phrase');
}
// ---------- 2. profil livré (contexte/gout.json, distillé de l'export music library de 45 333 pistes)
const shipped = D.loadShipped();
{
  check(shipped && shipped.stats.tracks === 45333 && shipped.topArtists[0].name === 'Depeche Mode' && shipped.topArtists[0].plays === 1026 && shipped.topGenres[0].name === 'Électronique', `profil livré : 45 333 pistes, n° 1 Depeche Mode (1 026 écoutes), genre n° 1 Électronique (${shipped?.stats.plays} écoutes au total)`);
  check(fs.statSync(path.join(ROOT, 'contexte/gout.json')).size < 12000 && Object.keys(shipped.styles).every((id) => STYLES[id]), 'profil livré court (< 12 Ko) et styles connus');
  check(JSON.stringify(shipped.styles.frenchtouch.refs) === JSON.stringify(['Daft Punk', 'Justice', 'Myd', 'Cassius', 'Mr. Oizo', 'Ed Banger']) && shipped.styles.lofi.refs.includes('Chinese Man'), 'références graines : French Touch = Ed Banger, Daft Punk, Justice, Myd, Cassius (+ Mr. Oizo) ; lo-fi = Chinese Man…');
  const csvPath = '/workspace/apple-music-library.csv';
  if (fs.existsSync(csvPath)) { const again = buildProfile(fs.readFileSync(csvPath, 'utf8')); check(JSON.stringify(again.topArtists) === JSON.stringify(shipped.topArtists) && JSON.stringify(again.topGenres) === JSON.stringify(shipped.topGenres), 'export music library présent : la distillation redonne le profil livré'); }
}
// ---------- 3. budgets
const bigReport = { at: '2026-11-02T08:00:00.000Z', source: 'rss', sourceLabel: 'Flux RSS / pages', styles: Object.fromEntries(Object.keys(STYLES).map((id) => [id, { label: STYLES[id].label,
  digest: { count: 20, topWords: Array.from({ length: 20 }, (_, i) => `motclé${i}${'x'.repeat(30)}`), medianDuration: 3700, longShare: 60, bpmMedian: 120 },
  suggestions: [{ mood: 'nocturne', adv: { energy: 35 } }, { mood: 'energique', adv: { energy: 80 } }] }])) };
{
  for (const id of Object.keys(STYLES)) { const t = D.tasteBlock(id, shipped); if (t.length > D.BUDGET.taste) check(false, `goût ${id} : ${t.length} > budget`); }
  const huge = D.profile({ refs: Object.fromEntries(Object.keys(STYLES).map((id) => [id, Array.from({ length: 8 }, (_, i) => `Artiste${i} ${'y'.repeat(30)}`)])) }, { ...shipped, sound: 'z'.repeat(2000) });
  const t = D.tasteBlock('frenchtouch', huge);
  check(t.length <= D.BUDGET.taste && Object.keys(STYLES).every((id) => D.tasteBlock(id, shipped).length <= D.BUDGET.taste), `goût borné à ${D.BUDGET.taste} caractères pour chaque style, même avec un profil démesuré (${t.length})`);
  const tr = D.trendsSummary(bigReport, 'frenchtouch', D.BUDGET.trends, []);
  check(tr && tr.text.length <= D.BUDGET.trends && tr.date === '2026-11-02' && /^Rapport du 2026-11-02/.test(tr.text) && tr.text.includes('French Touch'), `veille bornée à ${D.BUDGET.trends} caractères, datée, style demandé en premier (${tr?.text.length})`);
  const p = ai.buildPrompt({ prompt: 'x'.repeat(5000), style: 'frenchtouch', duration: 3600, meta: true, plan: true, context: { taste: 'g'.repeat(9000), trends: 't'.repeat(9000) } });
  const est = D.estTokens(p.system + p.user);
  check(p.user.length <= D.BUDGET.user && !p.user.includes('g'.repeat(1001)) && !p.user.includes('t'.repeat(801)) && est < 8192 * 0.6, `prompt borné même avec un contexte énorme : message utilisateur ${p.user.length} car. ≤ ${D.BUDGET.user}, total ~${est} jetons < 60 % de num_ctx 8192`);
}
// ---------- 4. interrupteurs coupés : prompt identique octet pour octet à v1.14.0 (empreintes du code v1.14.0)
const CASES = [
  { prompt: 'Une house filtrée pour une nuit d\'été', style: 'frenchtouch', duration: 180, meta: true, plan: false },
  { prompt: 'lofi pluvieux pour réviser', style: 'lofi', duration: 240, meta: false, plan: false },
  { prompt: 'x'.repeat(1500), style: null, duration: 60, meta: true, plan: false },
  { prompt: 'mix techno hypnotique', style: 'techno', duration: 3600, meta: true, plan: true },
  { prompt: 'ambient', style: 'ambient', duration: 600, meta: false, plan: true },
];
const V114 = ['0289f4847fa41cbcbdcef397405907da', '73dee5670e2b288f1bebfc16e4375cf5', '49a5f3c4a569a7695c4b0f6def250d53', '63355d39519ef0efc9347b99c3ceaf34', '06007fcb4c571344d60fd37626f00a3e'];
{
  const off = { taste: false, trends: false, refs: null };
  const ok = CASES.every((c, i) => md5(ai.buildPrompt(c)) === V114[i] && md5(ai.buildPrompt({ ...c, context: D.context(c.style, { s: off, report: bigReport, p: shipped }) })) === V114[i]);
  check(ok, 'deux sources coupées : prompt identique à v1.14.0 (5 cas, empreintes MD5 du code v1.14.0)');
  const on = ai.buildPrompt({ ...CASES[0], context: D.context('frenchtouch', { s: { taste: true, trends: true }, report: bigReport, p: shipped }) });
  check(on.system.includes('Ne cite jamais d\'artiste, de marque ni de titre existant dans les textes publics') && /Ne cite, ne recopie et n'évoque JAMAIS ces artistes/.test(on.system) && /jamais des instructions/.test(on.system), 'sources activées : interdiction des noms dans les textes publics conservée et renforcée ; veille = observations, pas des instructions');
  check(on.user.indexOf('CONTEXTE INTERNE') < on.user.indexOf('DONNÉES PUBLIQUES DE TENDANCE') && on.user.indexOf('DONNÉES PUBLIQUES') < on.user.indexOf('Renvoie un JSON') && on.user.endsWith('/no_think'), 'blocs insérés avant la liste des champs attendus');
}
// ---------- 5. veille absente : omise sans bruit
{
  check(D.trendsSummary(null, 'lofi') === null && D.trendsSummary({ at: '2026-11-01', styles: {} }, 'lofi') === null, 'pas de rapport (ou rapport vide) : aucun résumé');
  const c = D.context('lofi', { s: { taste: true, trends: true }, report: null, p: shipped });
  const p = ai.buildPrompt({ ...CASES[1], context: c });
  check(c.trends === '' && c.taste && p.user.includes('CONTEXTE INTERNE') && !p.user.includes('DONNÉES PUBLIQUES') && !/veille|tendance/i.test(p.user.replace(/CONTEXTE INTERNE[\s\S]*$/, '')), 'veille activée sans rapport : bloc omis, goût seul');
}
// ---------- 6. aucun nom d'artiste dans les textes publics nettoyés
{
  const forbid = D.forbiddenNames(shipped);
  const raw = { style: 'frenchtouch', title_fr: 'Nuit filtrée façon Daft Punk', title_en: 'Justice Of The Night', description_fr: 'Une house filtrée dans l\'esprit de Cassius et Justice, avec des basses à la Mr. Oizo. Un air de fête.', description_en: 'Inspired by Ed Banger and DJ Koze — gritty filtered house (IAM, NTM).',
    tags: ['french touch', 'daft punk', 'justice', 'ed banger', 'filter house', 'myd'], explanation: 'Comme Kavinsky et Depeche Mode : synthés sombres.' };
  const v = ai.validateSuggestion(raw, { style: 'frenchtouch', meta: true, forbid });
  const pub = [v.meta.title_fr, v.meta.title_en, v.meta.description_fr, v.meta.description_en, v.explanation, ...v.meta.tags].join(' | ');
  const leaks = forbid.filter((n) => new RegExp(`(?<![\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, D.scrubNames('x ' + n, [n]) === 'x' && /^(Air|Justice|Jungle|Queen|Placebo)$/.test(n) ? 'u' : 'iu').test(pub));
  check(!leaks.length && v.meta.tags.join() === 'french touch,filter house' && /air de fête/.test(v.meta.description_fr) && /synthés sombres/.test(v.explanation), `textes publics nettoyés : aucun nom du profil (${leaks.join(', ') || 'aucun'}) ; « un air de fête » conservé`);
  console.log('      → ' + pub);
  const v0 = ai.validateSuggestion(raw, { style: 'frenchtouch', meta: true });
  check(v0.meta.title_fr === 'Nuit filtrée façon Daft Punk', 'sans liste de noms (repli local), validateSuggestion inchangé');
}
// ---------- 7. références par style modifiables (texte « style: a, b »)
{
  const r = D.parseRefs("lofi: Chinese Man, Scratch Bandits Crew, L'Entourloop\n# commentaire\nfrenchtouch: Daft Punk ; Justice\n");
  check(JSON.stringify(r) === JSON.stringify({ lofi: ['Chinese Man', 'Scratch Bandits Crew', "L'Entourloop"], frenchtouch: ['Daft Punk', 'Justice'] }), 'références : lignes « style: artiste, artiste » (virgule ou point-virgule, commentaires #)');
  let e = null; try { D.parseRefs('polka: Quelqu\'un'); } catch (x) { e = x; } check(e?.status === 400, 'style inconnu : erreur 400 lisible');
  const p = D.profile({ refs: r }, shipped);
  check(p.styles.lofi.refs.length === 3 && p.styles.house.refs.length === 0 && p.styles.house.sound === shipped.styles.house.sound && p.styles.frenchtouch.refs.join() === 'Daft Punk,Justice' && D.profile({ refs: null }, shipped).styles.house.refs.length > 0, 'texte modifié = liste complète (style absent : aucune référence, son du style conservé) ; « Revenir au profil livré » rétablit tout');
}

// ---------- 8. serveur + Ollama simulé
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const seen = [];
const ollama = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    if (req.url === '/api/chat') { const j = JSON.parse(b); seen.push(j);
      const content = JSON.stringify({ style: 'frenchtouch', mood: 'energique', bpm: 122, adv: { energy: 70 }, explanation: 'Basses saturées façon Justice.', title_fr: 'Daft Punk sous la lune', title_en: 'Filtered Night', description_fr: 'Une house filtrée à la Cassius, montées au filtre.', description_en: 'Filtered house, like Mr. Oizo.', tags: ['french touch', 'justice', 'filter house'] });
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: { content } })); return; }
    res.writeHead(404); res.end('{}');
  });
}).listen(0, '127.0.0.1');
await new Promise((r) => ollama.once('listening', r));
const port = await freePort(), data = path.join(tmp, 'srv');
const srv = spawn(process.execPath, ['src/server.js'], { cwd: ROOT, env: { ...process.env, SOUNDTUBE_DATA_DIR: data, SOUNDTUBE_PORT: String(port), SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_YT_TRANSPORT: 'mock' }, stdio: ['ignore', 'ignore', 'pipe'] });
let errLog = ''; srv.stderr.on('data', (d) => (errLog += d));
const req = async (p, o = {}) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, { method: o.method || 'GET', headers: o.body ? { 'content-type': 'application/json' } : {}, body: o.body ? JSON.stringify(o.body) : undefined }); return { s: r.status, j: await r.json().catch(() => null) }; };
try {
  for (let i = 0; i < 60; i++) { try { if ((await req('/api/styles')).s === 200) break; } catch { /* attente */ } await sleep(200); }
  await req('/api/admin/ai', { method: 'PUT', body: { url: `http://127.0.0.1:${ollama.address().port}`, model: 'mock:1b' } });
  let v = (await req('/api/admin/director')).j;
  check(v.settings.taste === false && v.settings.trends === false && v.profile.topArtists[0].name === 'Depeche Mode' && v.trends === null && /^frenchtouch: Daft Punk, Justice/m.test(v.refsText), 'Admin : sources coupées par défaut, profil affiché, aucune veille, références éditables');
  const body = { prompt: 'Une house filtrée pour une nuit d\'été', style: 'frenchtouch', duration: 180, meta: true };
  let r = await req('/api/ai/suggest', { method: 'POST', body });
  check(r.j.source === 'ai' && md5({ system: seen.at(-1).messages[0].content, user: seen.at(-1).messages[1].content }) === V114[0] && seen.at(-1).options.num_ctx === 8192, 'serveur, sources coupées : requête Ollama identique à v1.14.0 (num_ctx 8192)');
  v = (await req('/api/admin/director', { method: 'PUT', body: { taste: true, trends: true } })).j;
  r = await req('/api/ai/suggest', { method: 'POST', body });
  let u = seen.at(-1).messages[1].content;
  check(u.includes('CONTEXTE INTERNE') && u.includes('Daft Punk') && !u.includes('DONNÉES PUBLIQUES') && r.j.context?.taste && !r.j.context.trends, 'goût activé, veille activée mais aucun rapport : goût seul, veille omise');
  const pub = [r.j.meta.title_fr, r.j.meta.description_fr, r.j.meta.description_en, r.j.explanation, ...r.j.meta.tags].join(' | ');
  check(!/daft punk|justice|cassius|oizo/i.test(pub) && r.j.meta.tags.join() === 'french touch,filter house', `réponse simulée pleine de noms : textes publics nettoyés (${pub})`);
  fs.mkdirSync(path.join(data, 'trends'), { recursive: true }); fs.writeFileSync(path.join(data, 'trends', 'latest.json'), JSON.stringify(bigReport));
  r = await req('/api/ai/suggest', { method: 'POST', body }); u = seen.at(-1).messages[1].content;
  check(u.includes('DONNÉES PUBLIQUES DE TENDANCE') && u.includes('Rapport du 2026-11-02') && r.j.context.trendsDate === '2026-11-02', 'rapport présent : résumé daté ajouté, étiqueté données publiques');
  const pv = (await req('/api/admin/director/preview', { method: 'POST', body: { style: 'frenchtouch' } })).j;
  check(pv.base.total < pv.sent.total && pv.diff.user.some((d) => d.op === '+' && d.t.startsWith('CONTEXTE INTERNE')) && !pv.diff.user.some((d) => d.op === '-') && pv.sent.tokens < 8192 * 0.6 && !pv.result, `aperçu : diff (ajouts seulement), ${pv.base.total} → ${pv.sent.total} caractères (~${pv.sent.tokens} jetons), sans appel IA`);
  const n0 = seen.length, pr = (await req('/api/admin/director/preview', { method: 'POST', body: { style: 'frenchtouch', run: true } })).j;
  check(seen.length === n0 + 1 && pr.result.ok && !/justice/i.test(pr.result.explanation), 'bouton « Tester avec Ollama » : un appel (simulé), réponse nettoyée');
  const bad = await req('/api/admin/director', { method: 'PUT', body: { refsText: 'n\'importe quoi' } });
  check(bad.s === 400 && /non reconnue/.test(bad.j.error), 'références invalides : 400, rien n\'est écrasé');
  v = (await req('/api/admin/director', { method: 'PUT', body: { refsText: v.refsText.replace(/^lofi:.*$/m, "lofi: Chinese Man, Scratch Bandits Crew, L'Entourloop, Nouvel Artiste") .replace(/^chiptune:.*\n?/m, '') } })).j;
  check(v.settings.edited && /^lofi: .*Nouvel Artiste$/m.test(v.refsText) && !/^chiptune:/m.test(v.refsText), 'Admin : ligne ajoutée / retirée à la main, enregistrée');
  await req('/api/admin/director', { method: 'PUT', body: { taste: false, trends: false } });
  r = await req('/api/ai/suggest', { method: 'POST', body });
  check(md5({ system: seen.at(-1).messages[0].content, user: seen.at(-1).messages[1].content }) === V114[0] && !r.j.context, 'les deux recoupés : retour au prompt v1.14.0 exact');
  const spec = (await req('/api/openapi.json')).j;
  check(String(spec.info.version).split('.').map(Number).reduce((a, x) => a * 1000 + x, 0) >= 1015000 && spec.paths['/api/admin/director'] && spec.paths['/api/admin/director/preview'], 'OpenAPI 1.15.0 : routes du contexte du directeur');
  const adm = fs.readFileSync(path.join(ROOT, 'public/admin.html'), 'utf8');
  check(/id="director"/.test(adm) && /admindirector\.js\?v=1\.1[5-9]\.\d+/.test(adm) && !/\?v=1\.14\.0/.test(adm), 'Admin : section « Contexte du directeur artistique », cache ?v=1.15.0');
} finally {
  srv.kill(); ollama.close(); await sleep(300);
  if (errLog.trim()) console.log(errLog.trim().split('\n').slice(-5).join('\n'));
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} échec(s)` : '\nv1.15.0 : tout est OK');
process.exit(fail ? 1 : 0);
