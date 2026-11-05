// v1.9.0 : veille tendances. Une tâche planifiée (hebdomadaire par défaut, réglable dans Admin, ou « Lancer maintenant »)
// lit des MÉTADONNÉES PUBLIQUES (titres, tags, durées, vues) de vidéos récentes par style, puis l'IA (ou une analyse locale)
// en tire un résumé et des retouches de réglages. Rien n'est appliqué automatiquement : un bouton « Appliquer » par proposition.
// Sources : clé YouTube Data API (facultative), sinon flux RSS/Atom ou pages HTML listés par l'utilisateur, sinon
// la page publique de recherche YouTube (option). Sans source : le rapport le dit.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { STYLES } from './engine/styles.js';
import { normAiUrl } from './nodes.js';
import { ollamaJson, validateSuggestion, localSuggestion, cleanText, catalogue } from './ai.js';

const err = (msg, status = 400) => Object.assign(new Error(msg), { status });
const DIR = path.join(config.dataDir, 'trends'), FILE = path.join(config.dataDir, 'trends.json');
const YT_API = process.env.SOUNDTUBE_YT_API_BASE || 'https://www.googleapis.com/youtube/v3';
const YT_WEB = process.env.SOUNDTUBE_YT_WEB_BASE || 'https://www.youtube.com';
/** Requêtes de recherche par style (vocabulaire du public, pas de nom d'artiste). */
export const STYLE_QUERY = { lofi: 'lofi hip hop beats', ambient: 'ambient music', synthwave: 'synthwave', house: 'deep house mix', frenchtouch: 'french touch house', techno: 'techno mix',
  cinematic: 'cinematic music', chiptune: 'chiptune music', trap: 'trap instrumental', hiphop: 'boom bap instrumental', dnb: 'drum and bass mix' };
const DEFAULTS = { enabled: true, intervalDays: 7, ytKey: '', feeds: '', html: false, perStyle: 20, styles: Object.keys(STYLES), lastRun: null, nextRun: null };
const STOP = new Set('the a an and or of to in on for with by at from is are be this that it its your you my me we our mix music musique instrumental instrumentale beats beat video official hour hours heure heures minutes min hd 4k new nouveau de la le les des du et en un une pour avec sans sur dans au aux par ft feat vs live no lyrics |'.split(' '));

let S = load(), running = null, timer = null, lastError = null;
function load() { try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { return { ...DEFAULTS }; } }
function save() { fs.mkdirSync(config.dataDir, { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(S, null, 2)); fs.renameSync(FILE + '.tmp', FILE); }

/** Flux listés par l'utilisateur : une ligne « style URL » (style facultatif : « * » ou absent = tous). */
export function parseFeeds(txt) {
  const out = [];
  for (const line of String(txt || '').split(/\r?\n/)) {
    const l = line.trim(); if (!l || l.startsWith('#')) continue;
    const m = l.match(/^(?:([\w*]+)\s+)?(https?:\/\/\S+)$/); if (!m) continue;
    const style = !m[1] || m[1] === '*' ? '*' : m[1];
    if (style !== '*' && !STYLES[style]) continue;
    try { const u = new URL(m[2]); out.push({ style, url: u.href }); } catch { /* ligne ignorée */ }
  }
  return out.slice(0, 60);
}
/** Source disponible, dans l'ordre : API YouTube, flux/pages, recherche YouTube publique. */
export function sourceOf(s = S) { return s.ytKey ? 'youtube-api' : parseFeeds(s.feeds).length ? 'rss' : s.html ? 'youtube-html' : 'none'; }
export const SOURCE_LABEL = { 'youtube-api': 'YouTube Data API', rss: 'Flux RSS / pages', 'youtube-html': 'Recherche YouTube publique (HTML)', none: 'aucune source' };

export function view() {
  const { ytKey, ...rest } = S;
  return { ...rest, hasKey: !!ytKey, keyTail: ytKey ? ytKey.slice(-4) : '', source: sourceOf(), sourceLabel: SOURCE_LABEL[sourceOf()], running: !!running, lastError, styleIds: Object.keys(STYLES) };
}
export function update(b = {}) {
  if (b.enabled !== undefined) S.enabled = !!b.enabled;
  if (b.intervalDays !== undefined) { const d = Math.round(+b.intervalDays); if (!(d >= 1 && d <= 60)) throw err('Fréquence : entre 1 et 60 jours'); S.intervalDays = d; }
  if (b.ytKey !== undefined) { const k = String(b.ytKey || '').trim(); if (k && !/^[\w-]{20,60}$/.test(k)) throw err('Clé YouTube Data API invalide'); S.ytKey = k; }
  if (b.feeds !== undefined) { const f = String(b.feeds || '').slice(0, 8000); S.feeds = f; }
  if (b.html !== undefined) S.html = !!b.html;
  if (b.perStyle !== undefined) { const n = Math.round(+b.perStyle); if (!(n >= 5 && n <= 50)) throw err('Vidéos par style : entre 5 et 50'); S.perStyle = n; }
  if (b.styles !== undefined) { const l = (Array.isArray(b.styles) ? b.styles : []).filter((x) => STYLES[x]); if (!l.length) throw err('Choisis au moins un style'); S.styles = [...new Set(l)]; }
  S.nextRun = S.enabled ? new Date((S.lastRun ? Date.parse(S.lastRun) : Date.now()) + S.intervalDays * 86400e3).toISOString() : null;
  if (S.enabled && Date.parse(S.nextRun) < Date.now()) S.nextRun = new Date(Date.now() + 3600e3).toISOString();
  save(); return view();
}

// ---------- collecte (métadonnées publiques uniquement)
async function getText(url, timeout = 15000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'soundtube-trends/1.9 (+LAN)', 'accept-language': 'fr,en;q=0.8' } });
  if (!r.ok) throw err(`HTTP ${r.status} — ${new URL(url).host}`, 502);
  return (await r.text()).slice(0, 3e6);
}
const isoDur = (s) => { const m = String(s || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : null; };
const decode = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
async function fromApi(style, n) {
  const after = new Date(Date.now() - 45 * 86400e3).toISOString();
  const q = new URLSearchParams({ part: 'snippet', type: 'video', order: 'viewCount', maxResults: String(Math.min(50, n)), publishedAfter: after, q: STYLE_QUERY[style] || STYLES[style].label, key: S.ytKey });
  const r = JSON.parse(await getText(`${YT_API}/search?${q}`));
  const ids = (r.items || []).map((x) => x.id?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const v = JSON.parse(await getText(`${YT_API}/videos?${new URLSearchParams({ part: 'snippet,contentDetails,statistics', id: ids.join(','), key: S.ytKey })}`));
  return (v.items || []).map((x) => ({ title: x.snippet?.title || '', tags: (x.snippet?.tags || []).slice(0, 20), duration: isoDur(x.contentDetails?.duration), views: +x.statistics?.viewCount || 0, published: x.snippet?.publishedAt || null }));
}
/** Flux RSS/Atom (titres, catégories, vues YouTube) ou page HTML (titre, titres de section, liens). */
export function parseFeedText(txt) {
  const items = [], blocks = txt.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi);
  if (blocks) {
    for (const b of blocks.slice(0, 60)) {
      const title = decode(b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]); if (!title) continue;
      const tags = [...b.matchAll(/<category[^>]*?(?:term="([^"]*)"[^>]*\/?>|>([\s\S]*?)<\/category>)/gi)].map((m) => decode(m[1] || m[2])).filter(Boolean).slice(0, 15);
      const views = +(b.match(/<media:statistics[^>]*views="(\d+)"/i)?.[1] || 0);
      items.push({ title, tags, duration: null, views, published: decode(b.match(/<(?:pubDate|published|updated)>([\s\S]*?)</i)?.[1]) || null });
    }
    return items;
  }
  const hs = [...txt.matchAll(/<(h[1-3]|a)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => decode(m[2])).filter((t) => t.length >= 8 && t.length <= 140);
  for (const t of [...new Set(hs)].slice(0, 40)) items.push({ title: t, tags: [], duration: null, views: 0, published: null });
  return items;
}
/** Page publique de recherche YouTube : titres, vues et durées présents dans les données de la page. */
export function parseYtHtml(txt) {
  const items = [], parts = String(txt).split('"videoRenderer":{"videoId":').slice(1);
  for (const c0 of parts.slice(0, 40)) {
    const c = c0.slice(0, 20000), t = c.match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/); if (!t) continue;
    let title; try { title = JSON.parse(`"${t[1]}"`); } catch { title = t[1]; }
    const L = c.match(/"lengthText":\{[\s\S]{0,400}?"simpleText":"([\d:]+)"/), V = c.match(/"viewCountText":\{"simpleText":"([^"]*)"/);
    items.push({ title, tags: [], duration: L ? L[1].split(':').reduce((a, x) => a * 60 + +x, 0) : null, views: V ? +V[1].replace(/\D/g, '') || 0 : 0, published: null });
  }
  return items;
}
async function collect(style) {
  const src = sourceOf(), n = S.perStyle;
  if (src === 'youtube-api') return fromApi(style, n);
  if (src === 'rss') {
    const out = [];
    for (const f of parseFeeds(S.feeds).filter((f) => f.style === style || f.style === '*')) { try { out.push(...parseFeedText(await getText(f.url))); } catch (e) { out.errors = [...(out.errors || []), `${new URL(f.url).host} : ${e.message}`]; } }
    return out.slice(0, n * 3);
  }
  if (src === 'youtube-html') return parseYtHtml(await getText(`${YT_WEB}/results?${new URLSearchParams({ search_query: STYLE_QUERY[style] || STYLES[style].label, sp: 'CAI=' })}`)).slice(0, n);
  return [];
}

// ---------- analyse
export function digest(items) {
  const words = new Map(), bpms = [], durs = items.map((x) => x.duration).filter((d) => d > 0).sort((a, b) => a - b);
  for (const it of items) {
    const w = Math.log10(10 + (it.views || 0));
    for (const m of `${it.title} ${(it.tags || []).join(' ')}`.matchAll(/(\d{2,3})\s*bpm/gi)) bpms.push(+m[1]);
    const seen = new Set();
    for (const t of `${it.title} ${(it.tags || []).join(' ')}`.toLowerCase().replace(/\d{2,3}\s*bpm/g, ' ').split(/[^\p{L}\p{N}'-]+/u)) {
      const k = t.replace(/^'+|'+$/g, ''); if (k.length < 3 || STOP.has(k) || /^\d+$/.test(k) || seen.has(k)) continue;
      seen.add(k); words.set(k, (words.get(k) || 0) + w);
    }
  }
  const top = [...words].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k]) => k);
  const med = (a) => (a.length ? a[Math.floor(a.length / 2)] : null);
  return { count: items.length, topWords: top, medianDuration: med(durs), longShare: durs.length ? Math.round((100 * durs.filter((d) => d >= 3600).length) / durs.length) : null,
    bpmMedian: med([...bpms].sort((a, b) => a - b)), sample: items.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 12).map((x) => x.title.slice(0, 90)) };
}
const fmtMin = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1).replace('.', ',')} h` : `${Math.round(s / 60)} min`);
function localReport(style, d) {
  const sug = validateSuggestion(localSuggestion(d.topWords.join(' '), { style }), { style });
  const parts = [`${d.count} vidéos récentes analysées.`];
  if (d.topWords.length) parts.push(`Mots les plus présents : ${d.topWords.slice(0, 8).join(', ')}.`);
  if (d.medianDuration) parts.push(`Durée médiane : ${fmtMin(d.medianDuration)}${d.longShare != null ? ` (${d.longShare} % de mix d’1 h ou plus)` : ''}.`);
  if (d.bpmMedian) parts.push(`Tempo cité le plus courant : ~${d.bpmMedian} BPM.`);
  const adv = sug.params.style === style ? sug.params.adv : {};
  return { summary: parts.join(' '), suggestions: Object.keys(adv).length ? [{ adv, mood: sug.params.mood !== 'auto' ? sug.params.mood : null, why: 'Mots-clés fréquents (analyse locale, sans IA).' }] : [] };
}
async function aiReport(ai, style, d) {
  const sys = `Tu es analyste musical pour un générateur de musique instrumentale algorithmique. On te donne des MÉTADONNÉES PUBLIQUES de vidéos récentes (titres, mots-clés, durées) pour un style.
Tu résumes les tendances (sons, ambiances, usages, durées) en français et proposes des retouches de réglages pour ce style. Ne cite aucun artiste ni titre, ne copie rien. Réponds UNIQUEMENT en JSON.
${catalogue(style)}`;
  const user = `Style : ${style} (${STYLES[style].label}).
Vidéos analysées : ${d.count}. Durée médiane : ${d.medianDuration ? fmtMin(d.medianDuration) : 'inconnue'}. Part de mix ≥ 1 h : ${d.longShare ?? '?'} %. Tempo cité médian : ${d.bpmMedian || '?'}.
Mots fréquents : ${d.topWords.join(', ')}.
Titres les plus vus : ${d.sample.map((t) => `« ${t} »`).join(' ; ')}.
Renvoie {"summary": "3 à 5 phrases", "suggestions": [ jusqu'à 3 objets { "mood": une AMBIANCE ou "auto", "adv": RÉGLAGES AVANCÉS de ce style, "why": une phrase } ]}
/no_think`;
  const r = await ollamaJson(ai, sys, user);
  const o = r.data || {}, warnings = [];
  const suggestions = (Array.isArray(o.suggestions) ? o.suggestions : []).slice(0, 3).map((s) => {
    const v = validateSuggestion({ style, mood: s?.mood, adv: s?.adv }, { style }); warnings.push(...v.warnings);
    return { adv: v.params.adv, mood: v.params.mood !== 'auto' ? v.params.mood : null, why: cleanText(s?.why, 300) };
  }).filter((s) => Object.keys(s.adv).length || s.mood);
  return { summary: cleanText(o.summary, 1200) || '(résumé vide)', suggestions, warnings: [...new Set(warnings)].slice(0, 8), model: r.model };
}

/** Lance la veille (une à la fois). getAi() renvoie les réglages IA d'Admin. */
export async function run(getAi, { reason = 'manuel' } = {}) {
  if (running) return running;
  running = (async () => {
    const at = new Date().toISOString(), source = sourceOf(), ai = getAi?.() || {}, useAi = !!normAiUrl(ai.url);
    const report = { at, reason, source, sourceLabel: SOURCE_LABEL[source], analysis: useAi ? `IA · ${ai.model || 'qwen3:14b'}` : 'locale (sans IA)', styles: {} };
    if (source !== 'none') {
      for (const style of S.styles) {
        const R = (report.styles[style] = { label: STYLES[style].label });
        try {
          const items = await collect(style); if (items.errors) R.errors = items.errors;
          const d = digest(items); R.digest = d;
          if (!d.count) { R.summary = 'Aucune vidéo trouvée pour ce style.'; R.suggestions = []; continue; }
          if (useAi) { try { Object.assign(R, await aiReport(ai, style, d)); } catch (e) { Object.assign(R, localReport(style, d), { aiError: 'IA indisponible : ' + e.message }); } }
          else Object.assign(R, localReport(style, d));
        } catch (e) { R.error = e.message; R.suggestions = []; }
      }
    }
    S.lastRun = at; S.nextRun = S.enabled ? new Date(Date.now() + S.intervalDays * 86400e3).toISOString() : null; save();
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, 'latest.json'), JSON.stringify(report, null, 1));
    fs.writeFileSync(path.join(DIR, `report-${at.slice(0, 10)}.json`), JSON.stringify(report));
    const old = fs.readdirSync(DIR).filter((f) => /^report-/.test(f)).sort(); for (const f of old.slice(0, -12)) fs.rmSync(path.join(DIR, f), { force: true });
    lastError = null; return report;
  })().catch((e) => { lastError = e.message; throw e; }).finally(() => { running = null; });
  return running;
}
export function latest() { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'latest.json'), 'utf8')); } catch { return null; } }
export const isRunning = () => !!running;
/** Planificateur : vérifie toutes les 10 min si la veille est due (1re exécution 1 h après la première mise en route). */
export function start(getAi) {
  if (timer) return;
  if (S.enabled && !S.nextRun) { S.nextRun = new Date(Date.now() + 3600e3).toISOString(); save(); }
  timer = setInterval(() => { if (S.enabled && S.nextRun && Date.now() >= Date.parse(S.nextRun) && !running) run(getAi, { reason: 'planifié' }).catch((e) => console.error('[veille]', e.message)); }, 600e3);
  timer.unref?.();
}
