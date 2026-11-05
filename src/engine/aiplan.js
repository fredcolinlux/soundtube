// v1.9.0 : plan « par titre » d'un mix ≥ 1 h proposé par le directeur artistique IA (validé, borné).
// Format accepté : [{ minutes|share, energy 0-100, mood, sub }] → segments { from, to, energy 0.2-1, mood, sub } sur [0, 1].
import { MOODS } from './styles.js';
export const PLAN_SUBS = { techno: ['detroit', 'minimal', 'industriel'], synthwave: ['outrun', 'dreamwave'], hiphop: ['boombap', 'lofi', 'trap'], dnb: ['liquid', 'neuro', 'jungle'], frenchtouch: ['classic', 'edbanger', 'myd'], lofi: ['jazzy', 'chillhop', 'sad', 'ambient', 'beatmaker', 'lofihouse'] };
export function cleanPlan(plan, style) {
  if (!Array.isArray(plan) || !plan.length) return null;
  const items = [];
  for (const x of plan.slice(0, 32)) {
    if (!x || typeof x !== 'object') continue;
    const w = Number.isFinite(+x.from) && Number.isFinite(+x.to) && x.share == null && x.minutes == null ? +x.to - +x.from : +(x.share ?? x.minutes ?? x.weight ?? 1); // plan déjà normalisé : idempotent
    if (!Number.isFinite(w) || w <= 0) continue;
    const it = { w: Math.min(120, w) };
    const e = +x.energy; if (Number.isFinite(e)) it.energy = Math.round(Math.min(100, Math.max(0, e > 0 && e <= 1 && !Number.isInteger(e) ? e * 100 : e)));
    if (typeof x.mood === 'string' && MOODS[x.mood]) it.mood = x.mood;
    if (typeof x.sub === 'string' && (PLAN_SUBS[style] || []).includes(x.sub)) it.sub = x.sub;
    if (typeof x.note === 'string' && x.note.trim()) it.note = x.note.trim().replace(/[\u0000-\u001f<>]/g, '').slice(0, 80);
    items.push(it);
  }
  if (!items.length) return null;
  const tot = items.reduce((a, b) => a + b.w, 0); let acc = 0;
  return items.map((it) => { const from = acc / tot; acc += it.w; const { w, ...rest } = it; return { from: +from.toFixed(4), to: +(acc / tot).toFixed(4), ...rest }; });
}
export const planAt = (plan, u) => (plan ? plan.find((s) => u >= s.from && u < s.to) || plan[plan.length - 1] : null);
