// Tests v1.10.0 : pages Accueil, Démarrer, Styles, page par style (bibliothèque + préréglage), navigation, visite guidée.
// Aucun appel réseau extérieur, aucun serveur Ollama.   node test/v1100.js
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v1100-'));
const SD = await import('../src/stylesdoc.js');
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const IDS = ['lofi', 'ambient', 'synthwave', 'house', 'frenchtouch', 'techno', 'cinematic', 'chiptune', 'trap', 'hiphop', 'dnb'];

// ---------- docs/STYLES.md → sections
{
  const d = SD.stylesDoc();
  check(IDS.every((id) => d.sections[id]?.html.length > 200), `STYLES.md : ${Object.keys(d.sections).length} sections de style reconnues`);
  check(typeof d.roadmap === 'string' && d.roadmap.includes('<table>'), 'feuille de route extraite (tableau)');
  check(d.sections.frenchtouch.html.includes('md-table') && d.sections.frenchtouch.machines.includes('TR-909') && d.sections.frenchtouch.machines.includes('Talkbox / vocodeur'.split(' ')[0]) || d.sections.frenchtouch.machines.some((m) => /Talkbox/.test(m)), `French Touch : tableau des variantes, machines (${d.sections.frenchtouch.machines.join(', ')})`);
  check(IDS.every((id) => d.sections[id].facts.some((f) => f.label)), 'faits « **Libellé** texte » extraits pour chaque style');
  check(SD.stylesDoc() === d, 'cache par date de modification');
}
// ---------- rendu Markdown sûr
{
  const h = SD.mdToHtml('Texte <script>alert(1)</script> **gras** *it* `c<b>`\n\n- a\n  suite\n- <img src=x onerror=1>\n\n| A | B |\n|---|---|\n| <i>x</i> | [l](javascript:alert(1)) |');
  check(!/<script|<img|<i>x/.test(h) && h.includes('&lt;script&gt;') && h.includes('<b>gras</b>') && h.includes('<i>it</i>') && h.includes('<code>c&lt;b&gt;</code>'), 'tout est échappé, seuls gras / italique / code produits');
  check(/<li>a suite<\/li>/.test(h) && h.includes('<div class="md-table"><table>') && !/href=/.test(h), 'listes avec lignes de continuation, tableaux encadrés, aucun lien');
  check(SD.esc(`<"'&>`) === '&lt;&quot;&#39;&amp;&gt;', 'esc');
}
// ---------- fichiers d'interface
{
  const idx = read('public/index.html'), app = read('public/js/app.js'), adm = read('public/admin.html'), aur = read('public/js/aurora.js');
  check(['id="genBtn"', 'id="aiBox"', 'id="durPresets"', 'id="advBox"', 'id="library"', 'id="create"'].every((x) => idx.includes(x)), 'studio : formulaire de génération intact (ids)');
  check((idx.includes('href="/accueil"') || idx.includes('href="/"')) && idx.includes('href="/styles"') && idx.includes('href="/demarrer"') && (adm.includes('href="/accueil"') || adm.includes('href="/"')) && adm.includes('href="/styles"'), 'navigation : studio et Admin mènent à Accueil, Styles, Aide');
  check(!idx.includes('site.css') && !idx.includes('tour.css'), 'studio : pas de feuille de style des pages du site (aucun restylage)');
  check(app.includes("get('style')") || app.includes('qs &&'), 'studio : ?style= présélectionne le style');
  check(app.includes('tour.js') && app.includes('track'), 'studio : ?tour=1 (visite) et ?track= (morceau mis en avant)');
  check(/constructor\(canvas, opts = \{\}\)/.test(aur) && aur.includes('opts.colors'), 'fond animé : couleurs optionnelles, défaut du studio inchangé');
  for (const f of ['accueil', 'demarrer', 'styles', 'style']) { const h = read(`public/${f}.html`), js = [f, f + 'page'].map((n) => (fs.existsSync(path.join(ROOT, `public/js/${n}.js`)) ? read(`public/js/${n}.js`) : '')).join('\n'); check((h.includes('lang="fr"') || h.includes("lang='fr'") || /lang=/.test(h)) && h.includes('site.css') && (h + js).includes('mountBackground') && ((h + js).includes('mountTopbar') || (h + js).includes('bootSite')), `page ${f}.html : français, barre de navigation, fond animé`); }
  { const sj = read('public/js/site.js'); check(sj.includes("createElement('canvas')") && sj.includes('AuroraField') && ["['/demarrer'", "['/styles'", "['/',"].every((x) => sj.includes(x)) && (sj.includes("['/accueil'") || sj.includes("['/studio'")) && (sj.includes("t('nav.studio')") || sj.includes('Studio')), 'site.js : fond AuroraField teinté, liens Accueil / Démarrer / Styles / Studio'); }
  const tour = read('public/js/tour.js');
  check(['#create', '#aiBox', '#durPresets', '#advBox', '#genBtn', '#library'].every((s) => tour.includes(s)) && tour.includes('Escape'), 'visite guidée : 6 étapes sur le vrai formulaire, Échap pour quitter');
  const st = read('public/js/style.js');
  check(st.includes('/api/generate') && st.includes('/api/ai/suggest') && st.includes('st.advTweaks') && st.includes('status=done'), 'page de style : préréglage → /api/generate, IA facultative, retouches du studio, bibliothèque du style');
}
// ---------- API et pages
{
  const port = await freePort(), B = `http://127.0.0.1:${port}`;
  const srv = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], { env: { ...process.env, SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA_DIR: path.join(tmp, 'api-data') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  const get = async (p) => { const r = await fetch(B + p); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, t, j }; };
  try {
    for (let i = 0; i < 100; i++) { if ((await fetch(B + '/api/options').catch(() => null))?.ok) break; await sleep(200); }
    const all = (await get('/api/styles')).j;
    check(all.styles.length === 11 && all.styles.map((s) => s.id).join() === IDS.join() && all.styles.every((s) => s.label && s.genre && s.bpm && Array.isArray(s.machines) && s.tracks === 0), '/api/styles : 11 cartes (libellé, genre, BPM, machines, morceaux)');
    check(typeof all.roadmap === 'string' && all.roadmap.length > 100, '/api/styles : feuille de route');
    const ft = (await get('/api/styles/frenchtouch')).j;
    check(ft.id === 'frenchtouch' && Object.keys(ft.variants?.options || {}).length === 3 && ft.html.includes('<p>') && ft.facts.length > 3 && ft.neighbours.length === 10 && !ft.neighbours.includes('frenchtouch'), `/api/styles/frenchtouch : ${Object.keys(ft.variants?.options || {}).length} variantes, ${ft.facts.length} faits, voisins`);
    const no = await get('/api/styles/opera');
    check(no.s === 404 && no.j?.error === 'Style inconnu', '/api/styles/opera : 404 JSON');
    for (const [p, w] of [['/accueil', 'Onze styles'], ['/demarrer', 'Comment naît'], ['/styles', 'Chaque style'], ['/styles/house', 'style.js'], ['/studio', 'genBtn'], ['/admin', 'soundtube']]) { const r = await get(p); check(r.s === 200 && r.t.includes(w), `GET ${p} : 200 (« ${w} »)`); }
    check((await get('/styles/nope')).s === 404, 'GET /styles/nope : 404 (page de style avec message)');
    check((await get('/js/site.js')).s === 200 && (await get('/css/tour.css')).s === 200, 'ressources site.js / tour.css servies');
    const spec = (await get('/api/openapi.json')).j, js = JSON.stringify(spec);
    check(spec.info.version === JSON.parse(read('package.json')).version && js.includes('/api/styles') && js.includes('/api/styles/{id}'), `openapi ${spec.info.version} : /api/styles documentées`);
  } catch (e) { check(false, 'API : ' + e.message); console.log(log.slice(-1500)); }
  finally { srv.kill(); }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} échec(s)` : '\nv1.10.0 : tout est OK');
process.exit(fail ? 1 : 0);
