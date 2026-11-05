// Tests v1.9.0 : réglages avancés pré-remplis (valeurs réelles du style), directeur artistique IA (serveur Ollama SIMULÉ),
// plan par titre des mix, méta YouTube IA, veille tendances (sources simulées), French Touch moteur 19 (3 variantes).
// Aucun appel réseau extérieur : Ollama, l'API YouTube et les flux RSS sont des serveurs locaux de test.
// node test/v190.js   (--no-api : sans serveur)
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundtube-v190-'));
process.env.SOUNDTUBE_DATA_DIR = path.join(tmp, 'unit-data');
const C = await import('../src/engine/composer.js');
const M = await import('../src/engine/mix.js');
const AP = await import('../src/engine/aiplan.js');
const AI = await import('../src/ai.js');
const TR = await import('../src/trends.js');
const { resolveAdvancedDefaults } = await import('../src/engine/advdefaults.js');
const { renderTrack } = await import('../src/engine/render.js');

let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const h = (o) => crypto.createHash('md5').update(JSON.stringify(o, (k, v) => (typeof v === 'function' ? undefined : v))).digest('hex');
const events = (plan) => { const st = {}, a = []; for (let ci = 0; ci < plan.chapters.length; ci++) a.push(h(C.composeChapter(plan, ci, st))); return a; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const NO_TEMPO = /\d{2,3}\s*bpm|\b(?:mineur|majeur|minor|major)\b/i;

// ---------- textes IA : nettoyage
check(AI.cleanText('Un groove à 124 BPM en ré mineur, tempo de 120 bpm, in A minor.', 200) === 'Un groove.' && AI.cleanText('Filtered disco at 124 bpm in C# minor, great.', 200) === 'Filtered disco, great.'
  && AI.cleanText('<b>Nuit</b> (122 BPM) : <script>x</script>calme', 200) === 'Nuit : xcalme', 'cleanText : sans tempo, sans tonalité, sans HTML, ponctuation propre');
check(JSON.stringify(AI.cleanTags(['#French Touch', '124 bpm', 'A minor', 'french touch', 'x', 'house filtrée'])) === '["french touch","house filtrée"]', 'cleanTags : doublons, tempo, tonalité et mots trop courts écartés');
check(AI.parseJsonReply('<think>bla { faux</think>\n```json\n{"a":1}\n```').a === 1, 'réponse qwen3 : bloc <think> et clôtures ignorés');

// ---------- validation stricte d'une proposition
{
  const v = AI.validateSuggestion({ style: 'frenchtouch', mood: 'nocturne', key: 'A', scale: 'aeolian', bpm: 300, adv: { energy: 500, swing: -40, ftStyle: 'edbanger', rm: 'rf', fadeOut: 99, leadPatch: 'zzz', technoStyle: 'minimal' }, explanation: 'Sombre à 128 BPM.' }, { style: 'lofi' });
  const P = v.params;
  check(P.style === 'frenchtouch' && P.bpm <= 135 && P.bpm >= 110 && P.adv.energy === 100 && P.adv.swing === 0 && P.adv.ftStyle === 'edbanger' && !('rm' in P.adv) && !('fadeOut' in P.adv) && !('leadPatch' in P.adv) && !('technoStyle' in P.adv),
    `validation : tempo borné (${P.bpm}), énergie 500→100, swing →0, clés inconnues / hors style / non autorisées écartées`);
  check(v.warnings.some((w) => /rm/.test(w)) && v.warnings.some((w) => /tempo/.test(w)) && !NO_TEMPO.test(v.explanation), `avertissements listés (${v.warnings.length}), explication sans tempo`);
  const u = AI.validateSuggestion({ style: 'opera', mood: 'xx', scale: 'blues-hexa' }, { style: 'techno' });
  check(u.params.style === 'techno' && u.params.mood === 'auto' && u.params.scale === 'auto', 'style / ambiance / gamme inconnus : style actuel, auto');
  const m = AI.validateSuggestion({ style: 'house', title_fr: 'Lumière 122 BPM', title_en: 'Light', description_fr: 'Douce, en la mineur.', tags: ['deep house', '122 bpm'] }, { meta: true });
  check(m.meta && m.meta.title_fr === 'Lumière' && m.meta.description_fr === 'Douce.' && m.meta.tags.join() === 'deep house', 'méta FR + EN : nettoyées (ni tempo ni tonalité)');
}
// ---------- plan par titre (mix ≥ 1 h)
{
  const p = AP.cleanPlan([{ minutes: 10, energy: 20, sub: 'classic', mood: 'nocturne' }, { minutes: 30, energy: 0.8, sub: 'polka' }, { share: 'x' }], 'frenchtouch');
  check(p && p.length === 2 && p[0].to === 0.25 && p[1].energy === 80 && !p[1].sub && p[0].sub === 'classic' && JSON.stringify(AP.cleanPlan(p, 'frenchtouch')) === JSON.stringify(p), 'cleanPlan : parts normalisées, entrées invalides et sous-styles inconnus écartés, idempotent (réglages enregistrés)');
  check(AP.cleanPlan('x', 'house') === null && AP.cleanPlan(Array(80).fill({ energy: 50 }), 'house').length === 32 && AP.planAt(p, 0.5) === p[1], 'cleanPlan : bornes (32 parties), planAt');
  const plan = [{ minutes: 30, energy: 10, sub: 'classic' }, { minutes: 30, energy: 95, sub: 'edbanger' }];
  const a = M.planMix({ style: 'frenchtouch', seed: 5, duration: 3600, engine: 19 }), b = M.planMix({ style: 'frenchtouch', seed: 5, duration: 3600, engine: 19, aiPlan: plan });
  const half = (m, f) => m.tracklist.filter((t) => f(t.start < 1800));
  const eLo = Math.max(...half(b, (x) => x).map((t) => t.energy)), eHi = Math.min(...half(b, (x) => !x).map((t) => t.energy));
  check(eLo < eHi && half(b, (x) => !x).every((t) => t.sub === 'edbanger') && h(a.tracklist) !== h(b.tracklist), `mix 1 h : le plan IA guide énergie (1re moitié ≤ ${Math.round(eLo * 100)}, 2de ≥ ${Math.round(eHi * 100)}) et variantes`);
  check(h(M.planMix({ style: 'frenchtouch', seed: 5, duration: 3600, engine: 19 }).tracklist) === h(a.tracklist) && C.resolveParams({ style: 'house', seed: 1 }).aiPlan === undefined, 'sans plan : mix identique, réglages inchangés');
}

// ---------- A : valeurs réelles du style (ce qui est affiché = ce qui est utilisé)
{
  const bad = [];
  for (const style of ['lofi', 'house', 'frenchtouch', 'techno', 'synthwave', 'hiphop', 'dnb', 'ambient', 'cinematic', 'chiptune', 'trap']) {
    const R = resolveAdvancedDefaults({ style, seed: 21, duration: 180, engine: 19 });
    for (const [k, v] of Object.entries(R.values)) {
      const d = C.ADVANCED[k]; if (!d) { bad.push(`${style}.${k}?`); continue; }
      if (v === null || v === undefined) { if (R.exact[k] !== false) bad.push(`${style}.${k} vide`); continue; }
      if (d.type === 'range' ? !(v >= d.min && v <= d.max) : !(String(v) in d.options)) bad.push(`${style}.${k}=${v}`);
    }
    const P = C.resolveParams({ style, seed: 21, duration: 180, engine: 19 });
    if (R.seed !== 21 || R.bpm !== P.bpm || R.key !== P.key) bad.push(style + ' seed/bpm/key');
  }
  check(!bad.length, `11 styles : chaque champ a une valeur valide du style, même tempo / tonalité que le rendu${bad.length ? ' — ' + bad.slice(0, 6) : ''}`);
  const R0 = resolveAdvancedDefaults({ style: 'frenchtouch', seed: 21, duration: 180, engine: 19 }), R1 = resolveAdvancedDefaults({ style: 'frenchtouch', seed: 21, duration: 180, engine: 19, adv: { ftStyle: 'myd', drumKit: 'tr707' } });
  check(R1.values.ftStyle === 'myd' && R1.values.drumKit === 'tr707' && C.resolveParams({ style: 'frenchtouch', seed: 21, duration: 180, engine: 19, adv: { ftStyle: 'myd' } }).ftStyle === 'myd', 'retouche : reflétée dans les valeurs affichées et dans le rendu');
  const r = resolveAdvancedDefaults({ style: 'house', duration: 60 });
  check(Number.isInteger(r.seed) && r.engine >= 19, `sans graine : graine tirée et renvoyée (${r.seed}), moteur ${r.engine}`);
  // compatibilité : anciens réglages (moteur 18, « Forcer ») toujours acceptés
  const old = C.resolveParams({ style: 'frenchtouch', seed: 7, duration: 60, engine: 18, adv: { energy: 70, drumKit: 'tr909' } });
  check(old.engine === 18 && !old.ftStyle && old.adv.energy === 70, 'ancien morceau French Touch (moteur 18) : relu à l’identique, sans variante');
}

// ---------- French Touch moteur 19 : trois variantes
{
  const seen = new Set();
  for (let s = 1; s <= 40; s++) seen.add(C.resolveParams({ style: 'frenchtouch', seed: s, engine: 19 }).ftStyle);
  check(['classic', 'edbanger', 'myd'].every((v) => seen.has(v)), `variantes tirées selon la graine (${[...seen]})`);
  const out = [];
  for (const v of ['classic', 'edbanger', 'myd']) {
    const r = await renderTrack({ style: 'frenchtouch', seed: 11, duration: 12, engine: 19, wav: false, adv: { ftStyle: v } }, { memory: true }).catch((e) => ({ err: e.message }));
    const ok = !r.err && r.params?.ftStyle === v && Number.isFinite(r.rms) && r.rms > 1e-3 && r.peak <= 1.01;
    out.push(`${v}:${r.err ? r.err.slice(0, 40) : ok ? 'ok' : 'rms ' + r.rms}`); if (!ok) fail++;
  }
  console.log(`${out.every((x) => /:ok$/.test(x)) ? 'OK   ' : 'ÉCHEC'} rendu court des 3 variantes (${out.join(', ')})`);
}

// ---------- retouches légères par style (moteur 19 seulement)
{
  const ST = await import('../src/engine/styles.js');
  const d = (s, sub, e) => ST.styleDef(s, sub, e);
  check(d('house', null, 19).patches.chords === 'rhodes' && d('house', null, 19).bpm[0] === 116 && d('hiphop', 'boombap', 19).mix.tape >= 0.8 && d('dnb', 'neuro', 19).patches.chords === 'supersaw'
    && d('synthwave', null, 19).patches.chords === 'darkpad' && d('synthwave', null, 19).scales.phrygian, 'moteur 19 : deep house chaloupée, boom-bap poussiéreux, neurofunk supersaw, synthwave sombre');
  check(JSON.stringify(d('house', null, 18)) === JSON.stringify(ST.styleDef('house', null, 18)) && d('house', null, 18).patches.chords === 'stab' && d('dnb', 'liquid', 19).patches.chords === d('dnb', 'liquid', 18).patches.chords && d('dnb', 'neuro', 18).patches.chords === 'darkpad',
    'moteur 18 et variantes non concernées : inchangés');
  const out = [];
  for (const [style, adv] of [['house', {}], ['hiphop', { hiphopStyle: 'boombap' }], ['dnb', { dnbStyle: 'neuro' }], ['synthwave', {}]]) {
    const r = await renderTrack({ style, seed: 4, duration: 8, engine: 19, wav: false, adv }, { memory: true }).catch((e) => ({ err: e.message }));
    const ok = !r.err && Number.isFinite(r.rms) && r.rms > 1e-3 && r.peak <= 1.01; if (!ok) fail++; out.push(`${style}:${ok ? 'ok' : r.err || r.rms}`);
  }
  console.log(`${out.every((x) => /:ok$/.test(x)) ? 'OK   ' : 'ÉCHEC'} rendu court des styles retouchés (${out.join(', ')})`);
}

// ---------- veille : analyse locale
{
  const items = TR.parseFeedText(`<?xml version="1.0"?><feed><entry><title>Filtered disco house mix 2026</title><media:statistics views="5000"/><published>2026-10-01</published></entry><entry><title><![CDATA[Disco house &amp; funky filter 124 BPM]]></title><category term="french touch"/></entry></feed>`);
  check(items.length === 2 && items[1].title === 'Disco house & funky filter 124 BPM' && items[1].tags[0] === 'french touch' && items[0].views === 5000, 'flux Atom : titres, catégories, vues');
  const d = TR.digest(items);
  check(d.topWords.includes('disco') && d.topWords.includes('house') && d.bpmMedian === 124 && d.count === 2, `digest : mots fréquents (${d.topWords.slice(0, 4)}), tempo cité`);
  check(JSON.stringify(TR.parseFeeds('frenchtouch https://a.example/x.rss\n# note\nopera https://b.example\n* http://c.example/feed\nnimporte quoi')) === '[{"style":"frenchtouch","url":"https://a.example/x.rss"},{"style":"*","url":"http://c.example/feed"}]', 'flux Admin : « style URL », style inconnu ignoré');
  const html = '"videoRenderer":{"videoId":"abc","thumbnail":{},"title":{"runs":[{"text":"Deep \\"house\\" 2h"}]},"lengthText":{"accessibility":{},"simpleText":"2:01:05"},"viewCountText":{"simpleText":"1 234 vues"}';
  const y = TR.parseYtHtml(html);
  check(y.length === 1 && y[0].title === 'Deep "house" 2h' && y[0].duration === 7265 && y[0].views === 1234, 'page de recherche YouTube : titre, durée, vues');
}

// ---------- API + serveurs simulés
if (!process.argv.includes('--no-api')) {
  // Ollama simulé, servi sous un chemin de base (comme un proxy : http://hôte:port/olla/ollama)
  const calls = []; let mode = 'ok';
  const reply = (body) => {
    const sys = body.messages?.[0]?.content || body.system || '';
    if (/analyste musical/.test(sys)) return { summary: 'Les mix longs à 124 BPM en la mineur dominent ; basses filtrées et grain disco.', suggestions: [{ mood: 'nocturne', adv: { energy: 999, vintage: 70, nope: 1 }, why: 'Grain disco très présent.' }, { adv: { leadPatch: 'zz' } }] };
    return { style: 'frenchtouch', mood: 'nocturne', key: 'F#', scale: 'dorian', bpm: 400, adv: { energy: 85, ftStyle: 'edbanger', vintage: 140, bogus: 3 }, explanation: 'Basse saturée, filtre ouvert, 126 BPM.',
      title_fr: 'Néons sur la Seine', title_en: 'Neon on the Seine', description_fr: 'Une nuit électrique, basse sale et filtres qui s’ouvrent, à 126 BPM.', description_en: 'An electric night of gritty bass and opening filters.', tags: ['french touch', 'electro', '126 bpm', 'nuit'],
      plan: [{ minutes: 20, energy: 30, sub: 'classic' }, { minutes: 40, energy: 90, sub: 'edbanger', note: 'montée' }] };
  };
  const ollama = http.createServer((req, res) => {
    let s = ''; req.on('data', (d) => (s += d)); req.on('end', () => {
      let body = {}; try { body = JSON.parse(s || '{}'); } catch {}
      calls.push({ url: req.url, method: req.method, body });
      const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (!req.url.startsWith('/olla/ollama/')) return send(404, { error: 'chemin de base perdu' });
      const p = req.url.slice('/olla/ollama'.length);
      if (p === '/api/version') return send(200, { version: '0.12.0' });
      if (p === '/api/tags') return send(200, { models: [{ name: 'qwen3:14b' }] });
      if (mode === 'slow') return setTimeout(() => send(200, { message: { content: '{}' } }), 15000);
      if (mode === 'garbage') return send(200, { message: { content: 'désolé, je ne sais pas' } });
      if (p === '/api/chat') { if (mode === 'nochat') return send(404, { error: 'not found' }); return send(200, { message: { role: 'assistant', content: '<think>…</think>' + JSON.stringify(reply(body)) } }); }
      if (p === '/api/generate') return send(200, { response: JSON.stringify(reply(body)) });
      send(404, { error: 'inconnu' });
    });
  });
  // API YouTube Data + flux RSS simulés
  const ytCalls = [];
  const yt = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); ytCalls.push(u.pathname + '?' + u.searchParams.get('q'));
    const send = (code, o, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(typeof o === 'string' ? o : JSON.stringify(o)); };
    if (u.pathname === '/yt/search') return u.searchParams.get('key') === 'AIzaTESTKEY_0123456789abcdef' ? send(200, { items: [{ id: { videoId: 'v1' } }, { id: { videoId: 'v2' } }] }) : send(403, { error: 'clé' });
    if (u.pathname === '/yt/videos') return send(200, { items: [
      { snippet: { title: 'Filtered French house mix — 2 hours', tags: ['french house', 'disco', 'filter house'], publishedAt: '2026-10-20T10:00:00Z' }, contentDetails: { duration: 'PT2H3M' }, statistics: { viewCount: '120000' } },
      { snippet: { title: 'Disco house 124 BPM groove', tags: ['disco house'] }, contentDetails: { duration: 'PT4M10S' }, statistics: { viewCount: '9000' } }] });
    if (u.pathname === '/feed.rss') return send(200, '<rss><channel><item><title>Lo-fi rainy night beats</title><category>chill</category></item><item><title>Rainy jazz lofi to study</title></item></channel></rss>', 'application/rss+xml');
    send(404, { error: 'x' });
  });
  const [op, yp, port] = [await freePort(), await freePort(), await freePort()];
  await new Promise((r) => ollama.listen(op, '127.0.0.1', r)); await new Promise((r) => yt.listen(yp, '127.0.0.1', r));
  const B = `http://127.0.0.1:${port}`;
  const srv = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], { env: { ...process.env, SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA_DIR: path.join(tmp, 'api-data'), SOUNDTUBE_YT_API_BASE: `http://127.0.0.1:${yp}/yt`, SOUNDTUBE_YT_WEB_BASE: `http://127.0.0.1:${yp}` }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  const api = async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json' } }); return { s: r.status, j: await r.json().catch(() => null) }; };
  const wait = async (fn, ms = 120000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('délai dépassé'); await sleep(300); } };
  const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b) }), put = (p, b) => api(p, { method: 'PUT', body: JSON.stringify(b) });
  try {
    await wait(async () => (await fetch(B + '/api/options').catch(() => null))?.ok, 20000);
    const o = (await api('/api/options')).j;
    check(o.engine >= 19, `/api/options : moteur ${o.engine}`);
    // A : valeurs du style
    const d = await post('/api/advanced/defaults', { style: 'frenchtouch', seed: 42, duration: 180 });
    check(d.s === 200 && d.j.seed === 42 && d.j.values.ftStyle && d.j.values.drumKit && typeof d.j.values.swing === 'number' && d.j.exact && d.j.engine >= 19, `/api/advanced/defaults : valeurs réelles (variante ${d.j?.values?.ftStyle}, boîte ${d.j?.values?.drumKit})`);
    // B : sans IA configurée → proposition locale
    let s = await post('/api/ai/suggest', { prompt: 'une nuit à Paris, très énergique, façon Justice', style: 'lofi', duration: 180 });
    check(s.s === 200 && s.j.source === 'local' && s.j.fallback && /Aucun PC IA/.test(s.j.error) && s.j.params.style === 'frenchtouch' && s.j.params.adv.ftStyle === 'edbanger', `sans PC IA : repli local (${s.j?.params?.style}/${s.j?.params?.adv?.ftStyle})`);
    check((await post('/api/ai/suggest', { prompt: '' })).s === 400, 'description vide : 400');
    const a = await put('/api/admin/ai', { url: `http://127.0.0.1:${op}/olla/ollama`, model: 'qwen3:14b', timeout: 10 });
    check(a.s === 200 && a.j.timeout === 10 && (await put('/api/admin/ai', { timeout: 5 })).s === 400, 'Admin : délai IA réglable (10–600 s)');
    s = await post('/api/ai/suggest', { prompt: 'néons, basse sale', style: 'house', duration: 3600, meta: true, plan: true });
    const chat = calls.filter((c) => c.url === '/olla/ollama/api/chat').pop();
    check(s.j?.source === 'ai' && chat && chat.body.format === 'json' && chat.body.stream === false && chat.body.model === 'qwen3:14b', 'IA simulée : POST <base>/api/chat (chemin relatif), format json, sans flux');
    const P = s.j.params;
    check(P.style === 'frenchtouch' && P.bpm <= 135 && P.adv.energy === 85 && P.adv.vintage === 100 && !('bogus' in P.adv) && P.key === 'F#' && s.j.warnings.length >= 2, `proposition validée et bornée (tempo ${P.bpm}, vintage 140→${P.adv.vintage}, clé inconnue écartée)`);
    check(s.j.meta?.title_fr === 'Néons sur la Seine' && s.j.meta.title_en && !NO_TEMPO.test(s.j.meta.description_fr) && !s.j.meta.tags.some((t) => NO_TEMPO.test(t)) && s.j.plan?.length === 2 && s.j.plan[1].sub === 'edbanger', 'titres / description / tags FR + EN sans tempo ni tonalité, plan par titre');
    mode = 'nochat'; s = await post('/api/ai/suggest', { prompt: 'calme', style: 'lofi' });
    check(s.j?.source === 'ai' && calls.some((c) => c.url === '/olla/ollama/api/generate'), 'Ollama sans /api/chat : repli /api/generate');
    mode = 'garbage'; s = await post('/api/ai/suggest', { prompt: 'pluie douce, vinyle', style: 'lofi', meta: true });
    check(s.j?.source === 'local' && /illisible/.test(s.j.error) && s.j.params.style === 'lofi' && s.j.warnings.some((w) => /IA nécessaire/.test(w)), 'réponse illisible : repli local, l’interface le dit');
    mode = 'slow'; const t0 = Date.now(); s = await post('/api/ai/suggest', { prompt: 'calme', style: 'ambient' });
    check(s.j?.source === 'local' && /délai/.test(s.j.error) && Date.now() - t0 < 14000, `IA trop lente : délai respecté (${((Date.now() - t0) / 1000).toFixed(1)} s), repli local`);
    mode = 'ok';
    // génération avec méta IA
    const g = await post('/api/generate', { style: 'frenchtouch', seed: 190, duration: 20, wav: false, engine: 19, title: 'Néons sur la Seine', title_en: 'Neon on the Seine',
      aiMeta: { description_fr: 'Nuit électrique à 126 BPM, basse sale.', description_en: 'Electric night, gritty bass.', tags: ['electro', 'nuit', '126 bpm'] } });
    const t = await wait(async () => { const x = await api('/api/jobs/' + g.j.id); return ['done', 'error'].includes(x.j?.status) && x.j; });
    const yt0 = (await api(`/api/tracks/${t.id}/youtube`)).j, yfr = yt0?.langs?.fr, yen = yt0?.langs?.en;
    if (!yfr?.description?.includes('Nuit électrique')) console.log('  meta', JSON.stringify((await api('/api/tracks/' + t.id)).j?.meta?.ai), (yfr?.description || '').slice(0, 300));
    check(t.status === 'done' && t.title_en === 'Neon on the Seine' && yfr?.description?.includes('Nuit électrique, basse sale.') && yfr.tags[0] === 'electro' && !yfr.tags.includes('126 bpm') && yen?.description?.includes('Electric night, gritty bass.'),
      `morceau : titres FR + EN, description et tags IA dans les infos YouTube (${t.status})`);
    // C : veille tendances
    let v = (await api('/api/admin/trends')).j;
    check(v.settings.source === 'none' && v.settings.enabled && v.settings.intervalDays === 7 && v.report === null && (await post('/api/admin/trends/run', {})).s === 409, 'veille : hebdomadaire par défaut, « aucune source » signalée, lancement refusé sans source');
    check((await put('/api/admin/trends', { ytKey: 'pas une clé' })).s === 400 && (await put('/api/admin/trends', { intervalDays: 0 })).s === 400, 'veille : réglages invalides refusés');
    v = (await put('/api/admin/trends', { ytKey: 'AIzaTESTKEY_0123456789abcdef', styles: ['frenchtouch', 'house'], intervalDays: 3 })).j;
    check(v.source === 'youtube-api' && v.hasKey && v.keyTail === 'cdef' && !JSON.stringify(v).includes('AIzaTEST') && v.nextRun, 'clé YouTube : enregistrée, jamais renvoyée en clair');
    check((await post('/api/admin/trends/run', {})).s === 202, 'Lancer maintenant : 202');
    v = await wait(async () => { const x = (await api('/api/admin/trends')).j; return !x.settings.running && x.report && x; });
    const ft = v.report.styles.frenchtouch;
    check(v.report.source === 'youtube-api' && /IA/.test(v.report.analysis) && ft.digest.count === 2 && ft.digest.longShare === 50 && ft.digest.topWords.includes('disco') && ytCalls.some((c) => c === '/yt/search?french touch house'), `rapport : métadonnées publiques (${ft.digest.count} vidéos, mots ${ft.digest.topWords.slice(0, 3)})`);
    check(ft.summary && !NO_TEMPO.test(ft.summary) && ft.suggestions.length === 1 && ft.suggestions[0].adv.energy === 100 && ft.suggestions[0].adv.vintage === 70 && !('nope' in ft.suggestions[0].adv) && ft.suggestions[0].mood === 'nocturne',
      'résumé IA par style, propositions validées / bornées (rien n’est appliqué)');
    check(v.settings.lastRun && Date.parse(v.settings.nextRun) - Date.parse(v.settings.lastRun) > 2.9 * 86400e3, 'prochaine veille planifiée selon la fréquence');
    await put('/api/admin/trends', { ytKey: '', feeds: `lofi http://127.0.0.1:${yp}/feed.rss`, styles: ['lofi'] }); await put('/api/admin/ai', { url: '' });
    await post('/api/admin/trends/run', {});
    v = await wait(async () => { const x = (await api('/api/admin/trends')).j; return !x.settings.running && x.report?.source === 'rss' && x; });
    check(v.report.analysis.includes('locale') && v.report.styles.lofi.digest.count === 2 && /rainy/.test(v.report.styles.lofi.summary), 'sans clé : flux RSS, analyse locale sans IA');
    // UI
    const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8'), app = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8'), adm = fs.readFileSync(path.join(ROOT, 'public/admin.html'), 'utf8') + fs.readFileSync(path.join(ROOT, 'public/js/admin.js'), 'utf8');
    check(html.includes('Décris l’ambiance') && html.includes('id="aiGo"') && html.includes('Réinitialiser ce style') && !html.includes('adv-force') && app.includes('/api/ai/suggest') && app.includes('aiPlan') && app.includes('aiMeta'), 'interface : « Décris l’ambiance » + « Proposer », sans cases « Forcer »');
    check(adm.includes('Lancer maintenant') && adm.includes('aiTimeout') && adm.includes('data-apply') && adm.includes('st.advTweaks'), 'Admin : veille (fréquence, sources, lancer, appliquer) et délai IA');
    const spec = (await api('/api/openapi.json')).j, js = JSON.stringify(spec);
    check(String(spec.info.version).split('.').map(Number).reduce((a, x) => a * 1000 + x, 0) >= 1009000 && js.includes('/api/ai/suggest') && js.includes('/api/admin/trends') && js.includes('/api/advanced/defaults') && js.includes('aiPlan'), `openapi ${spec.info.version} : nouvelles routes documentées`);
  } catch (e) { check(false, 'API : ' + e.message); console.log(log.slice(-1500)); }
  finally { srv.kill(); ollama.close(); yt.close(); ollama.closeAllConnections?.(); yt.closeAllConnections?.(); }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} échec(s)` : '\nv1.9.0 : tout est OK');
process.exit(fail ? 1 : 0);
