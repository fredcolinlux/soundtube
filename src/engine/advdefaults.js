// v1.9.0 : valeurs RÉELLES des réglages avancés pour un style, une graine et des réglages donnés.
// Le formulaire affiche exactement ces valeurs ; le client n'envoie que celles que l'utilisateur a changées
// (un champ égal à la valeur résolue = défaut du style, donc morceau identique).
import { resolveParams, planSong, ADVANCED } from './composer.js';
import { PROGRESSION_LIBRARY, progressionLabel } from './flavor.js';
import { MOODS, VARIANT_KEY } from './styles.js';
import { isLofi20 } from './lofi20.js';

const clamp = (d, x) => Math.max(d.min, Math.min(d.max, Math.round(x)));
const sameProg = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * @returns {{ seed:number, engine:number, values:Object, exact:Object, notes:Object, set:Object }}
 *  values : valeur à afficher par réglage ; exact=false : valeur indicative (le style tire au sort / dépend de la section) ;
 *  set : réglages déjà fixés par l'utilisateur (renvoyés tels quels).
 */
export function resolveAdvancedDefaults(input = {}) {
  const seed = Number.isFinite(+input.seed) && input.seed !== '' && input.seed != null ? Math.floor(Math.abs(+input.seed)) % 2 ** 31 : Math.floor(Math.random() * 2 ** 31);
  const duration = Math.min(+input.duration || 180, 600); // la forme d'un long morceau n'influence pas ces valeurs
  const P = resolveParams({ ...input, seed, duration, fullDuration: +input.duration || 180, engine: input.engine ?? 21 }); // v1.12.0 : moteur 21 par défaut (harmonie juste)
  const pl = planSong(P);
  const F = pl.F, S = pl.S, A = P.adv || {}, out = {}, exact = {}, notes = {};
  const put = (k, v, ex = true, note) => { if (!(k in ADVANCED)) return; out[k] = v; exact[k] = ex; if (note) notes[k] = note; };
  const R = (k, x, ex = true, note) => put(k, clamp(ADVANCED[k], x), ex, note);
  R('energy', 50, true, '50 = énergie naturelle du style');
  R('complexity', 50, false, 'le style décide section par section');
  R('swing', (F.swing / 0.33) * 60);
  R('brightness', ((F.mix.bright - 0.55) / 0.9) * 100);
  R('space', ((F.mix.reverb / Math.max(0.02, S.mix.reverb || 0.2) - 0.15) / 1.85) * 100);
  R('width', (F.mix.width ?? 1) * 100);
  const L20 = isLofi20(P);
  if (L20) {
    // v1.11.0 : lo-fi moteur 20 — « Lo-fi / vintage » = macro des cinq textures (50 = valeurs du sous-genre)
    R('vintage', A.vintage ?? 50, true, 'macro des textures (50 = valeurs du sous-genre)');
    for (const k of ['crackle', 'wow', 'tapeSat', 'dust', 'warmth']) R(k, F.mix.texUi?.[k] ?? 0);
  } else {
    R('vintage', (F.mix.vintage || 0) * 100);
    if (P.style === 'lofi') for (const k of ['crackle', 'wow', 'tapeSat', 'dust', 'warmth']) put(k, null, false, 'nouveaux morceaux lo-fi (1.11) seulement');
  }
  R('humanize', 50);
  if (F.drumTune) { const T = F.drumTune; R('kickTune', ((T.kickTune ?? T.kick ?? 1) - 0.75) / 0.5 * 100); R('kickDecay', ((T.kickDecay ?? T.decay ?? 1) - 0.45) / 1.3 * 100); }
  R('drumPattern', A.drumPattern || 1, !!A.drumPattern, A.drumPattern ? null : 'groove tiré par la graine');
  R('fadeIn', 0); R('fadeOut', 3);
  const amb = MOODS[P.mood]?.ambience;
  put('ambience', A.ambience || amb || 'none');
  R('ambienceLevel', A.ambienceLevel ?? 50, true, '50 = niveau habituel');
  put('melody', A.melody || (P.instruments?.lead === false ? 'off' : 'normal'));
  for (const [k, f] of [['leadPatch', 'lead'], ['chordPatch', 'chords'], ['bassPatch', 'bass']]) { const v = F.patches?.[f]; if (v && v in ADVANCED[k].options) put(k, v); else put(k, null, false, 'son du style'); }
  put('bassType', F.bassStyle && F.bassStyle in ADVANCED.bassType.options ? F.bassStyle : null, !!F.bassStyle);
  put('drumKit', F.drums?.kit && F.drums.kit in ADVANCED.drumKit.options ? F.drums.kit : null);
  put('pianoSound', F.pianoSound || 'steinway'); put('rhodesSound', F.rhodesSound || 'sampled');
  const VK = VARIANT_KEY[P.style]; if (VK && P[VK]) put(VK, P[VK]);
  const progA = pl.chapters[0]?.progA, pi = PROGRESSION_LIBRARY.findIndex((p) => sameProg(p, progA));
  if (A.progression != null) put('progression', String(A.progression));
  else if (pi >= 0) put('progression', String(pi));
  else put('progression', null, false, progA ? 'progression du style : ' + progressionLabel(progA) : 'progression du style');
  put('meter', A.meter || '4/4');
  put('structure', A.structure || null, !!A.structure, 'forme du style');
  put('evolution', A.evolution || 'normale');
  put('variety', A.variety || (L20 ? 'high' : 'medium'), true, L20 ? 'lo-fi 1.11 : forte par défaut' : null);
  put('mixStyles', A.mixStyles || 'same');
  put('mix', A.mix || ((+input.duration || 0) >= 3600 ? 'on' : 'off'), !!A.mix || true);
  const set = {}; for (const [k, v] of Object.entries(A)) if (v != null) set[k] = v;
  return { seed, engine: P.engine || 17, style: P.style, bpm: P.bpm, key: P.key, scale: P.scale, values: out, exact, notes, set };
}
