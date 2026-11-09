// v1.15.0 : distille l'export Apple Music (CSV, en-têtes français) en un profil de goût court et borné : contexte/gout.json.
// Usage : node tools/gout-distill.mjs chemin/vers/bibliotheque.csv [contexte/gout.json]
// Le CSV n'est jamais copié : seuls des totaux d'écoutes par artiste / genre et des artistes de référence par style sont gardés.
import fs from 'node:fs';
import path from 'node:path';

export function* csvRows(s) {
  let f = [], v = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { v += '"'; i++; } else q = false; } else v += c; }
    else if (c === '"') q = true; else if (c === ',') { f.push(v); v = ''; }
    else if (c === '\n') { f.push(v.replace(/\r$/, '')); yield f; f = []; v = ''; } else v += c;
  }
  if (v || f.length) { f.push(v); yield f; }
}
// genres proches regroupés (Apple Music mélange anglais / français et variantes)
const GENRE_ALIAS = [[/^(hip[- ]?hop(\/rap)?|rap|alternative rap|hip-hop\/rap|rap français|french rap)$/i, 'Hip-Hop/Rap'], [/^(electronic|électronique|electronica|idm)$/i, 'Électronique'],
  [/^(alternative|alternatif|alternative rock|indie rock)$/i, 'Alternative'], [/^(hard ?rock)$/i, 'Hard rock'], [/^(dance)$/i, 'Dance'], [/^(r&b\/soul|soul|r&b)$/i, 'R&B/Soul']];
const normGenre = (g) => { g = (g || '').trim(); for (const [rx, n] of GENRE_ALIAS) if (rx.test(g)) return n; return g; };
const ALIAS = { biggie: 'notorious b.i.g.', 'the notorious b.i.g.': 'notorious b.i.g.' };
const artistKey = (a) => { const k = a.toLowerCase().trim(); return ALIAS[k] || baseKey(a); };
const baseKey = (a) => a.toLowerCase().replace(/^the\s+/, '').replace(/\s+(feat\.?|ft\.?|&|et|x|vs\.?)\s+.*$/i, '').replace(/^suprême\s+/, '').trim();

/** Totaux à partir du texte CSV. */
export function distill(text, { top = 15, topGenres = 10 } = {}) {
  const it = csvRows(text), H = it.next().value || [], ix = (n) => H.indexOf(n);
  const A = ix('Artiste'), G = ix('Genre'), P = ix("Nombre d'écoutes"), T = ix('Type');
  if (A < 0 || P < 0) throw new Error('CSV inattendu : colonnes « Artiste » et « Nombre d\'écoutes » requises');
  const ar = new Map(), ge = new Map(), byGenre = new Map(); let tracks = 0, audio = 0, plays = 0;
  for (const r of it) {
    if (r.length < 2) continue; tracks++;
    if (T >= 0 && !/audio/i.test(r[T] || '')) continue; audio++;
    const p = Math.max(0, +r[P] || 0); plays += p;
    const a = (r[A] || '').trim(), g = normGenre(r[G]);
    if (a) { const k = artistKey(a), o = ar.get(k) || { names: new Map(), plays: 0, tracks: 0 }; o.plays += p; o.tracks++; o.names.set(a, (o.names.get(a) || 0) + p + 0.001); ar.set(k, o);
      if (g) { const m = byGenre.get(g) || new Map(); m.set(k, (m.get(k) || 0) + p); byGenre.set(g, m); } }
    if (g) ge.set(g, (ge.get(g) || 0) + p);
  }
  // nom affiché : la graphie la plus écoutée parmi celles sans invité (« X & Y », « feat. »)
  for (const o of ar.values()) { const n = [...o.names].sort((a, b) => (/\s(&|feat\.?|ft\.?|x)\s/i.test(a[0]) - /\s(&|feat\.?|ft\.?|x)\s/i.test(b[0])) || b[1] - a[1]); o.name = n[0][0]; }
  const artists = [...ar.values()].sort((a, b) => b.plays - a.plays);
  return { tracks, audio, plays, artists: artists.slice(0, top).map(({ name, plays: n, tracks: t }) => ({ name, plays: n, tracks: t })),
    genres: [...ge].sort((a, b) => b[1] - a[1]).slice(0, topGenres).map(([name, n]) => ({ name, plays: n, share: Math.round((1000 * n) / Math.max(1, plays)) / 10 })),
    playsOf: (name) => ar.get(artistKey(name))?.plays || 0, topIn: (genre, n, skip) => [...(byGenre.get(genre) || [])].sort((a, b) => b[1] - a[1]).filter(([k, v]) => !skip.has(k) && v >= 50).slice(0, n).map(([k]) => ar.get(k).name) };
}

// favoris déclarés (graine) et son recherché par style — décrit le son, jamais des titres.
// v1.21.2 : graine neutre par défaut ; une graine personnelle facultative se place dans contexte/gout.seed.json
// (même forme que SEED, jamais versionnée — voir .gitignore).
const GENERIC_SEED = {
  overall: [],
  styles: {
    frenchtouch: { refs: ['Daft Punk', 'Justice', 'Cassius'], sound: 'house filtrée et compressée, basses saturées, boucles disco hachées, montées au filtre' },
    lofi: { refs: [], sound: 'boom bap poussiéreux, vinyle, accords jazz, groove chaloupé' },
    hiphop: { refs: [], sound: 'boom bap 90 chaud, caisse claire sèche, basse ronde, boucles soul et funk' },
    trap: { refs: [], sound: 'instrumental rap moderne mais musical, 808 tenues, mélodies sombres' },
    house: { refs: [], sound: 'house profonde et organique, groove hypnotique, accords chauds' },
    techno: { refs: [], sound: 'techno et electro puissantes, synthés analogiques, montées de rave' },
    dnb: { refs: [], sound: 'drum & bass énergique, basses lourdes, montées épiques' },
    synthwave: { refs: [], sound: 'synthés 80 mélodiques, arpèges, ambiance nocturne de film' },
    ambient: { refs: [], sound: 'ambient chaleureux, nappes vintage, mélancolie douce' },
    cinematic: { refs: [], sound: 'cinématique texturée, tension lente' },
    chiptune: { refs: [], sound: 'chiptune ludique et nerveux' },
  },
  overallSound: 'instrumental électronique polyvalent : house, lo-fi, techno, synthwave, hip-hop instrumental',
};
function loadSeed() {
  try {
    const f = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'contexte', 'gout.seed.json');
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    return { ...GENERIC_SEED, ...j, styles: { ...GENERIC_SEED.styles, ...(j.styles || {}) } };
  } catch { return GENERIC_SEED; }
}
export const SEED = loadSeed();

export function buildProfile(text, source = 'Apple Music') {
  const d = distill(text), extras = { house: 'House', techno: 'Techno', dnb: 'Drum & Bass' };
  const styles = {};
  for (const [id, s] of Object.entries(SEED.styles)) {
    const refs = [...s.refs], skip = new Set(refs.map(artistKey));
    if (extras[id]) for (const a of d.topIn(extras[id], 2, skip)) if (refs.length < 7) refs.push(a);
    styles[id] = { refs, sound: s.sound };
  }
  return { version: 1, source, builtAt: new Date().toISOString().slice(0, 10),
    stats: { tracks: d.tracks, audioTracks: d.audio, plays: d.plays },
    topArtists: d.artists, topGenres: d.genres, favourites: SEED.overall.map((n) => ({ name: n, plays: d.playsOf(n) })), sound: SEED.overallSound, styles };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const src = process.argv[2], out = process.argv[3] || 'contexte/gout.json';
  if (!src) { console.error('Usage : node tools/gout-distill.mjs bibliotheque.csv [contexte/gout.json]'); process.exit(1); }
  const p = buildProfile(fs.readFileSync(src, 'utf8'));
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(p, null, 1) + '\n');
  console.log(`${out} : ${p.stats.tracks} pistes, ${p.stats.plays} écoutes ; ${p.topArtists.slice(0, 5).map((a) => `${a.name} ${a.plays}`).join(', ')}`);
}
