// Titres poétiques déterministes (à partir de la graine), en français et en anglais (même tirage, traduction cohérente).
import { makeRng, hashSeed } from './engine/rng.js';
const NOUNS = [['Brume', 'f'], ['Néon', 'm'], ['Orbite', 'f'], ['Marée', 'f'], ['Aurore', 'f'], ['Écho', 'm'], ['Comète', 'f'], ['Lagune', 'f'],
  ['Nébuleuse', 'f'], ['Spirale', 'f'], ['Horizon', 'm'], ['Rivage', 'm'], ['Pulsar', 'm'], ['Mirage', 'm'], ['Lueur', 'f'], ['Cascade', 'f'],
  ['Pixel', 'm'], ['Signal', 'm'], ['Prisme', 'm'], ['Halo', 'm'], ['Onde', 'f'], ['Givre', 'm'], ['Ressac', 'm'], ['Satellite', 'm'],
  ['Rêverie', 'f'], ['Particule', 'f'], ['Éclipse', 'f'], ['Boulevard', 'm'], ['Archipel', 'm'], ['Constellation', 'f']];
const ADJ = [['lointain', 'lointaine'], ['électrique', 'électrique'], ['nocturne', 'nocturne'], ['suspendu', 'suspendue'], ['magnétique', 'magnétique'],
  ['doré', 'dorée'], ['infini', 'infinie'], ['fragile', 'fragile'], ['cosmique', 'cosmique'], ['lent', 'lente'], ['pourpre', 'pourpre'],
  ['silencieux', 'silencieuse'], ['liquide', 'liquide'], ['boréal', 'boréale'], ['secret', 'secrète'], ['vibrant', 'vibrante'],
  ['hypnotique', 'hypnotique'], ['perdu', 'perdue'], ['oublié', 'oubliée'], ['céleste', 'céleste']];
// anglais : même ordre que les listes ci-dessus (adjectif avant le nom)
const NOUNS_EN = ['Mist', 'Neon', 'Orbit', 'Tide', 'Aurora', 'Echo', 'Comet', 'Lagoon', 'Nebula', 'Spiral', 'Horizon', 'Shore', 'Pulsar', 'Mirage', 'Glow', 'Cascade',
  'Pixel', 'Signal', 'Prism', 'Halo', 'Wave', 'Frost', 'Undertow', 'Satellite', 'Reverie', 'Particle', 'Eclipse', 'Boulevard', 'Archipelago', 'Constellation'];
const ADJ_EN = ['Distant', 'Electric', 'Nocturnal', 'Suspended', 'Magnetic', 'Golden', 'Infinite', 'Fragile', 'Cosmic', 'Slow', 'Purple',
  'Silent', 'Liquid', 'Northern', 'Secret', 'Vibrant', 'Hypnotic', 'Lost', 'Forgotten', 'Celestial'];

const pickPair = (seed, style) => { const r = makeRng(hashSeed(seed, 'title', style)); const n = r.pick(NOUNS); const a = r.pick(ADJ); return { n: NOUNS.indexOf(n), a: ADJ.indexOf(a) }; };
const varSuffix = (variation) => (variation ? ` · var. ${variation}` : '');
export function makeTitle(seed, variation = 0, style = '') {
  const { n, a } = pickPair(seed, style), [noun, g] = NOUNS[n];
  return `${noun} ${g === 'f' ? ADJ[a][1] : ADJ[a][0]}` + varSuffix(variation);
}
/** Titre anglais du même tirage (« Brume lointaine » → « Distant Mist »). */
export function makeTitleEn(seed, variation = 0, style = '') {
  const { n, a } = pickPair(seed, style);
  return `${ADJ_EN[a]} ${NOUNS_EN[n]}` + varSuffix(variation);
}
/** Les deux titres d'un même tirage. */
export const makeTitles = (seed, variation = 0, style = '') => ({ fr: makeTitle(seed, variation, style), en: makeTitleEn(seed, variation, style) });

const low = (s) => s.normalize('NFC').toLowerCase();
const NOUN_IX = new Map(NOUNS.map(([w], i) => [low(w), i]));
const ADJ_IX = new Map(ADJ.flatMap(([m, f], i) => [[low(m), i], [low(f), i]]));
/**
 * Traduction d'un titre français : les titres générés (« Nom adjectif », éventuellement « · var. N ») sont traduits
 * exactement ; un titre libre saisi à la main n'est pas traduit (renvoie null : à saisir dans le panneau YouTube).
 */
export function translateTitle(fr) {
  const m = /^(\S+)\s+(\S+?)(\s*·\s*var\.\s*\d+)?$/u.exec(String(fr || '').trim());
  if (!m) return null;
  const n = NOUN_IX.get(low(m[1])), a = ADJ_IX.get(low(m[2]));
  if (n === undefined || a === undefined) return null;
  return `${ADJ_EN[a]} ${NOUNS_EN[n]}` + (m[3] ? ` · var. ${m[3].replace(/\D+/g, '')}` : '');
}
/** Titre anglais effectif d'un morceau : saisi / enregistré à la création, sinon traduit, sinon le titre français. */
export function titleEnOf(t) {
  if (t?.meta?.titleEn) return t.meta.titleEn;
  return translateTitle(t?.title) || t?.title || '';
}
