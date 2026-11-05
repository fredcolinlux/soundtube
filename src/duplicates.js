// Détection de doublons : YouTube peut refuser la monétisation de contenus « répétitifs » ou réutilisés.
// Même style + graine + variation + réglages => audio identique (moteur déterministe) ; sinon score de proximité musicale.
import { planSong } from './engine/composer.js';

const norm = (o) => JSON.stringify(o ?? null, Object.keys(o || {}).sort());
/** Empreinte musicale d'un morceau (paramètres résolus + plan). */
export function signature(P = {}, meta = null) {
  // morceau en file : meta ne contient que le titre anglais → plan recalculé
  if (!meta || (!meta.recipe && !meta.progressions && 'titleEn' in meta)) { try { meta = planSong({ ...P, duration: Math.min(P.duration || 90, 600) }).meta; } catch { meta = {}; } }
  const g = meta?.recipe?.groove || {};
  const adv = Object.fromEntries(Object.entries(P.adv || {}).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  return {
    style: P.style, seed: P.seed, variation: P.variation || 0, duration: P.duration,
    settings: [P.mood, P.key, P.scale, P.bpm, norm(P.instruments), norm(adv)].join('|'),
    key: `${P.key}:${P.scale}`, bpm: P.bpm,
    progA: (meta?.progressions?.A || []).join(' '), progB: (meta?.progressions?.B || []).join(' '),
    groove: [g.kick, g.caisse, g.charley].join('|'), sons: norm(meta?.recipe?.sons),
  };
}
/** Compare deux empreintes → null ou { level, score, reasons }. */
export function compare(a, b) {
  if (!a || !b || a.style !== b.style) return null;
  if (a.seed === b.seed && a.variation === b.variation && a.settings === b.settings) {
    const same = Math.abs((a.duration || 0) - (b.duration || 0)) < 1;
    return { level: same ? 'identique' : 'meme-matiere', score: 1, reasons: same ? ['même graine, même variation et mêmes réglages : audio identique'] : ['même graine et mêmes réglages (seule la durée change) : même matière musicale'] };
  }
  const reasons = []; let s = 0;
  if (a.key === b.key) { s += 0.2; reasons.push('même tonalité et mode'); }
  if (Math.abs((a.bpm || 0) - (b.bpm || 0)) <= 2) { s += 0.15; reasons.push('tempo quasi identique'); }
  if (a.progA && a.progA === b.progA) { s += 0.2; reasons.push('même progression de couplet'); }
  if (a.progB && a.progB === b.progB) { s += 0.2; reasons.push('même progression de refrain'); }
  if (a.groove === b.groove) { s += 0.15; reasons.push('même groove de batterie'); }
  if (a.sons === b.sons) { s += 0.1; reasons.push('mêmes sons'); }
  if (a.seed === b.seed) { s = Math.max(s, 0.8); reasons.unshift('même graine (autre variation ou réglages)'); }
  return s >= 0.75 ? { level: 'tres-proche', score: +s.toFixed(2), reasons } : null;
}
export const LEVEL_FR = { identique: 'doublon exact', 'meme-matiere': 'même morceau (autre durée)', 'tres-proche': 'très proche' };
/** Morceaux de `tracks` proches de l'empreinte `sig` (hors `selfId`), du plus proche au moins proche. */
export function findSimilar(sig, tracks, selfId = null, max = 5) {
  const out = [];
  for (const t of tracks) {
    if (t.id === selfId || t.status === 'error' || !t.params) continue;
    const c = compare(sig, t._sig || (t._sig = signature(t.params, t.meta)));
    if (c) out.push({ id: t.id, title: t.title, status: t.status, created_at: t.created_at, ...c, label: LEVEL_FR[c.level] });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, max);
}
