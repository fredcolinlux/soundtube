// « Recette » d'un morceau : tous les choix de variété dérivés de la graine (déterministes).
// Sons (patchs + timbre), progressions, grooves de batterie générés, styles de basse/accords/arpèges,
// swing, mélodie (contour, densité, sauts), effets. Même graine => même recette.
import { makeRng, hashSeed } from './rng.js';
import { NOTE_NAMES } from './theory.js';
import { profileKey, MOODS } from './styles.js';
import { hasInstrument } from './sampler.js';
import { isLofi20, POOLS20, lofiTexture } from './lofi20.js';
export { POOLS20 };

// Progressions génériques (degrés de la gamme, valables dans tous les modes), en plus de celles du style.
export const GENERIC_PROGRESSIONS = [
  [0, 5, 3, 4], [0, 3, 4, 4], [0, 4, 5, 3], [5, 3, 0, 4], [0, 2, 3, 4], [0, 5, 1, 4], [1, 4, 0, 0], [0, 3, 0, 4],
  [0, 6, 5, 4], [0, 6, 5, 6], [0, 5, 2, 6], [0, 3, 6, 2], [0, 2, 5, 4], [3, 4, 0, 0], [0, 4, 3, 0], [0, 1, 2, 1],
  [0, 3], [0, 5], [0, 6, 3], [0, 4, 1, 5], [3, 4, 5, 5], [0, 0, 3, 3], [5, 4, 3, 4], [0, 2, 3, 1], [1, 4, 0, 5],
  [0, 5, 3, 6], [3, 0, 4, 5], [0, 4, 5, 2, 3, 0, 3, 4], [0, 6, 5, 6, 0, 6, 3, 4], [5, 3, 0, 4, 5, 3, 1, 4],
  [0, 2, 1, 4], [3, 2, 1, 4], [0, 1, 3, 4], [5, 6, 0, 0], [0, 3, 5, 4], [2, 5, 1, 4],
];

const POOLS = {
  lofi:      { chords: ['rhodes', 'rhodes', 'piano', 'piano', 'epiano', 'guitar', 'warmpad'], bass: ['uprightbass', 'uprightbass', 'softbass', 'softbass', 'housebass', 'cellobass'], lead: ['vibes', 'vibes', 'rhodes', 'flute', 'mellow', 'guitar', 'piano', 'bell'], arp: ['guitar', 'mutedguitar', 'vibes', 'harp', 'rhodes', 'pluck'],
               bassStyle: ['walking', 'walking', 'default', 'offbeat'], chordStyle: ['strum', 'strum', 'sustain'], chordBars: [1, 1, 2], drumFam: 'boombap', swing: [0.1, 0.3] },
  ambient:   { chords: ['ensemble', 'ensemble', 'warmpad', 'warmpad', 'junopad', 'darkpad'], bass: ['subdrone', 'subdrone', 'softbass'], lead: ['vibes', 'flute', 'bell', 'harp', 'piano', 'mellow'], arp: ['harp', 'harp', 'vibes', 'pizz', 'bell', 'piano', 'pluck'],
               bassStyle: ['drone', 'drone', 'default'], chordStyle: ['sustain'], chordBars: [2, 2, 4, 1], drumFam: 'soft', swing: [0, 0] },
  synthwave: { chords: ['jupiterpad', 'jupiterpad', 'supersaw', 'junopad', 'junopad'], bass: ['bass80', 'bass80', 'analogbass'], lead: ['synthlead', 'synthlead', 'brass80', 'sawlead'], arp: ['arp80', 'arp80', 'epiano', 'bell', 'pluck'],
               bassStyle: ['octave', 'octave', 'eighths'], chordStyle: ['sustain'], chordBars: [1, 2, 2], drumFam: 'drive', swing: [0, 0.03] },
  house:     { chords: ['piano', 'piano', 'stab', 'stab', 'rhodes', 'epiano', 'polysynth'], bass: ['housebass', 'housebass', 'softbass', 'sawbass', '909'], lead: ['pluck', 'piano', 'vibes', 'rhodes', 'bell', 'mellow'], arp: ['pluck', 'mutedguitar', 'arpsaw', 'piano', 'bell'],
               bassStyle: ['offbeat', 'offbeat', 'octave', 'walking'], chordStyle: ['stabs', 'stabs', 'sustain', 'strum'], chordBars: [1, 2], drumFam: 'four', swing: [0, 0.16] },
  techno:    { chords: ['darkpad', 'darkpad', 'stab', 'polysynth'], bass: ['acid', 'acid', 'sawbass', 'housebass', '909'], lead: ['arpsaw', 'acidarp', 'pluck', 'bell'], arp: ['acidarp', 'acidarp', 'arpsaw', 'pluck'],
               bassStyle: ['acid', 'acid', 'offbeat', 'eighths'], chordStyle: ['sustain', 'sustain', 'stabs'], chordBars: [2, 4, 1], drumFam: 'four', swing: [0, 0.06] },
  cinematic: { chords: ['ensemble', 'ensemble', 'ensemble', 'strings', 'warmpad', 'darkpad'], bass: ['spiccato', 'spiccato', 'cellobass', 'subdrone'], lead: ['frenchhorn', 'frenchhorn', 'ensemble', 'flute', 'piano', 'horn'], arp: ['spiccato', 'spiccato', 'pizz', 'pizz', 'harp', 'piano', 'staccato'],
               bassStyle: ['cinema', 'cinema', 'drone', 'eighths'], chordStyle: ['sustain', 'sustain', 'strum'], chordBars: [1, 2], drumFam: 'cinema', swing: [0, 0] },
  chiptune:  { chords: ['chiparp', 'chiparp', 'pulse', 'square'], bass: ['tribass', 'tribass', 'pulse'], lead: ['square', 'square', 'pulse', 'chiparp'], arp: ['pulse', 'pulse', 'square', 'chiparp'],
               bassStyle: ['octave', 'octave', 'eighths', 'walking'], chordStyle: ['chiparp', 'chiparp', 'stabs'], chordBars: [1, 2], drumFam: 'chip', swing: [0, 0.1] },
  trap:      { chords: ['darkpad', 'piano', 'ensemble', 'warmpad', 'rhodes', 'bell'], bass: ['808'], lead: ['bell', 'flute', 'vibes', 'pluck', 'harp', 'piano', 'sawlead'], arp: ['harp', 'pizz', 'pluck', 'bell', 'piano', 'vibes'],
               bassStyle: ['808'], chordStyle: ['sustain', 'sustain', 'strum'], chordBars: [2, 1, 4], drumFam: 'trap', swing: [0, 0.1] },
  // hip-hop (variantes)
  hiphop_boombap: { chords: ['rhodes', 'rhodes', 'piano', 'piano', 'epiano', 'ensemble', 'vibes'], bass: ['subbass', 'subbass', 'uprightbass', 'softbass'], lead: ['vibes', 'flute', 'frenchhorn', 'piano', 'rhodes', 'harp'], arp: ['guitar', 'pizz', 'vibes', 'harp', 'piano'],
               bassStyle: ['boom', 'boom', 'boom', 'walking'], chordStyle: ['chop', 'chop', 'strum', 'sustain'], chordBars: [1, 1, 2], drumFam: 'hhboombap', swing: [0.12, 0.2] },
  hiphop_lofi: { chords: ['rhodes', 'rhodes', 'piano', 'epiano', 'guitar'], bass: ['uprightbass', 'uprightbass', 'subbass', 'softbass'], lead: ['vibes', 'flute', 'rhodes', 'mellow', 'guitar', 'piano'], arp: ['guitar', 'mutedguitar', 'vibes', 'harp'],
               bassStyle: ['walking', 'boom', 'boom'], chordStyle: ['strum', 'strum', 'chop', 'sustain'], chordBars: [1, 1, 2], drumFam: 'hhlofi', swing: [0.18, 0.28] },
  hiphop_trap: { chords: ['piano', 'piano', 'darkpad', 'ensemble', 'bell', 'rhodes'], bass: ['808'], lead: ['bell', 'flute', 'pluck', 'piano', 'harp', 'vibes'], arp: ['pluck', 'bell', 'harp', 'pizz'],
               bassStyle: ['808'], chordStyle: ['sustain', 'sustain', 'strum'], chordBars: [2, 1, 4], drumFam: 'trap', swing: [0, 0.04] },
  // drum & bass (variantes)
  dnb_liquid: { chords: ['liquidpad', 'liquidpad', 'rhodes', 'warmpad', 'ensemble', 'junopad'], bass: ['dnbsub', 'dnbsub', 'reese'], lead: ['vibes', 'flute', 'bell', 'piano', 'rhodes', 'harp'], arp: ['pluck', 'harp', 'vibes', 'piano', 'bell'],
               bassStyle: ['roller', 'roller', 'jungle'], chordStyle: ['sustain', 'sustain', 'strum'], chordBars: [2, 2, 1], drumFam: 'dnbtwo', swing: [0, 0.05] },
  dnb_neuro:  { chords: ['darkpad', 'darkpad', 'stab', 'polysynth'], bass: ['reese', 'reese', 'neuro'], lead: ['acidarp', 'arpsaw', 'pluck', 'bell'], arp: ['arpsaw', 'acidarp', 'pluck'],
               bassStyle: ['neuro', 'neuro', 'roller'], chordStyle: ['sustain', 'sustain', 'stabs'], chordBars: [2, 4], drumFam: 'dnbneuro', swing: [0, 0.02] },
  dnb_jungle: { chords: ['warmpad', 'ensemble', 'liquidpad', 'rhodes', 'junopad'], bass: ['dnbsub', 'dnbsub', 'subbass'], lead: ['flute', 'vibes', 'bell', 'piano', 'rhodes'], arp: ['vibes', 'harp', 'pluck', 'pizz'],
               bassStyle: ['jungle', 'jungle', 'roller'], chordStyle: ['sustain', 'sustain', 'strum'], chordBars: [2, 1, 4], drumFam: 'jungle', swing: [0.03, 0.09] },
};

/** v1.7.0 : réservoirs de sons par style / variante (lecture seule, pour le contraste entre titres d'un mix). */
export const MIX_POOLS = POOLS;

// v1.8.0 : réservoirs du moteur 1.8 — synthés « vintage » (DX7, Minimoog, Juno, ARP, talkbox) et boîtes à rythmes
// (TR-606/707/808/909, DR-110) par style. `kits` : boîtes tirées au sort quand le kit n'est pas forcé.
const plus = (base, add) => {
  const o = { ...base };
  for (const [k, v] of Object.entries(add)) o[k] = Array.isArray(base[k]) && k !== 'swing' && k !== 'kits' ? base[k].concat(v) : v;
  return o;
};
const POOLS18 = {
  lofi:      plus(POOLS.lofi, { chords: ['dx7epiano'], kits: ['lofi', 'lofi', 'hhlofi', 'dr110'], swing: [0.14, 0.3] }),
  ambient:   plus(POOLS.ambient, { chords: ['junopoly'], lead: ['dx7bell'], arp: ['dx7bell'], kits: ['soft'] }),
  synthwave: plus(POOLS.synthwave, { chords: ['junopoly', 'dx7epiano'], bass: ['moogbass'], lead: ['mooglead', 'arplead'], arp: ['dx7bell'], kits: ['retro', 'retro', 'tr707', 'tr808'] }),
  house:     plus(POOLS.house, { chords: ['dx7epiano', 'junopoly'], bass: ['moogbass', 'dx7bass'], lead: ['dx7bell'], kits: ['house', 'tr909', 'tr909', 'tr707', 'tr808'], swing: [0.04, 0.2] }),
  techno:    plus(POOLS.techno, { chords: ['junopoly'], bass: ['moogbass'], lead: ['dx7bell'], kits: ['tr909', 'tr909', 'techno', 'tr808', 'tr606'] }),
  cinematic: plus(POOLS.cinematic, { chords: ['junopoly'], kits: ['cinema'] }),
  chiptune:  plus(POOLS.chiptune, { kits: ['chip'] }),
  trap:      plus(POOLS.trap, { lead: ['dx7bell'], kits: ['trap', 'trap', 'tr808'] }),
  hiphop_boombap: plus(POOLS.hiphop_boombap, { bass: ['moogbass'], kits: ['boombap', 'boombap', 'tr808', 'hhlofi'] }),
  hiphop_lofi: plus(POOLS.hiphop_lofi, { chords: ['dx7epiano'], kits: ['hhlofi', 'hhlofi', 'lofi', 'dr110'] }),
  hiphop_trap: plus(POOLS.hiphop_trap, { lead: ['dx7bell'], kits: ['trap', 'tr808', 'tr808'] }),
  dnb_liquid: plus(POOLS.dnb_liquid, { chords: ['junopoly', 'dx7epiano'], kits: ['dnb'] }),
  dnb_neuro:  plus(POOLS.dnb_neuro, { kits: ['dnb'] }),
  dnb_jungle: plus(POOLS.dnb_jungle, { kits: ['break'] }),
  frenchtouch: { chords: ['junopoly', 'junopoly', 'dx7epiano', 'stab', 'strings', 'rhodes'], bass: ['moogbass', 'moogbass', 'housebass', 'dx7bass'], lead: ['talkbox', 'talkbox', 'vocoder', 'mooglead'], arp: ['arplead', 'pluck', 'dx7bell', 'arpsaw'],
                 bassStyle: ['disco', 'disco', 'octave', 'offbeat'], chordStyle: ['disco', 'disco', 'stabs'], chordBars: [1, 1, 2], drumFam: 'four', swing: [0, 0.1], kits: ['tr909', 'tr909', 'tr707'] },
};
export const MIX_POOLS18 = POOLS18;
/** Moteur 1.9 : French Touch refaite (stabs disco découpés, guitare étouffée, 909 seule). */
export const POOLS19 = {
  frenchtouch: { chords: ['stab', 'stab', 'rhodes', 'junopoly', 'dx7epiano', 'brass80'], bass: ['moogbass', 'moogbass', 'housebass', 'dx7bass'], lead: ['talkbox', 'talkbox', 'vocoder', 'mooglead'], arp: ['mutedguitar', 'mutedguitar', 'guitar', 'pluck'],
    bassStyle: ['disco'], chordStyle: ['disco'], chordBars: [1], drumFam: 'four', swing: [0.08, 0.16], kits: ['tr909'] },
  frenchtouch_edbanger: { chords: ['sawlead', 'sawlead', 'supersaw', 'brass80', 'polysynth'], bass: ['sawbass', 'sawbass', 'analogbass', 'reese'], lead: ['arpsaw', 'sawlead', 'arplead', 'mooglead'], arp: ['stab', 'acidarp', 'sawlead'],
    bassStyle: ['disco'], chordStyle: ['disco'], chordBars: [1], drumFam: 'four', swing: [0, 0.05], kits: ['tr909'] },
  frenchtouch_myd: { chords: ['junopoly', 'junopoly', 'rhodes', 'dx7epiano', 'stab'], bass: ['moogbass', 'moogbass', 'dx7bass', 'housebass'], lead: ['pluck', 'dx7bell', 'mooglead', 'talkbox', 'arplead'], arp: ['mutedguitar', 'guitar', 'pluck'],
    bassStyle: ['disco'], chordStyle: ['disco'], chordBars: [1], drumFam: 'four', swing: [0.1, 0.18], kits: ['tr909'] },
};
/** Moteur 1.8 actif pour ces paramètres (French Touch : toujours). */
export const isEngine18 = (P) => P.engine >= 18 || P.style === 'frenchtouch';
/** v1.8.0 : sons et boîtes par défaut de chaque style (affichés quand une option avancée n'est pas forcée). */
export function styleDefaults18() {
  const out = {};
  for (const [k, p] of Object.entries(POOLS18)) out[k] = { kits: [...new Set(p.kits)], chords: [...new Set(p.chords)], bass: [...new Set(p.bass)], lead: [...new Set(p.lead)], arp: [...new Set(p.arp)], bassStyle: [...new Set(p.bassStyle)], chordStyle: [...new Set(p.chordStyle)], swing: p.swing };
  return out;
}

export const PATCH_LABELS = {
  hornsect: 'section de cuivres (stabs)', orchstab: 'coup d’orchestre',
  dx7epiano: 'piano électrique FM 6 opérateurs (DX7)', dx7bass: 'basse FM slap (DX7)', dx7bell: 'cloches FM (DX7)', moogbass: 'basse Minimoog (filtre en échelle)', mooglead: 'lead Minimoog (glide)', junopoly: 'polysynth Juno (chorus stéréo)', arplead: 'lead ARP Odyssey (oscillateurs synchronisés)', talkbox: 'talkbox (formants « wa »)', vocoder: 'vocodeur 10 bandes',
  supersaw: 'supersaw désaccordée', junopad: 'nappe Juno (chorus)', synthlead: 'lead analogique (portamento)', analogbass: 'basse analogique', jupiterpad: 'nappe Jupiter (saws désaccordées)', brass80: 'cuivres synthé (Oberheim)', bass80: 'basse 80s liée (glide)', arp80: 'arpège 80s',
  epiano: 'piano électrique FM (DX)', rhodes: 'piano Rhodes', guitar: 'guitare', mutedguitar: 'guitare étouffée',
  piano: 'piano (échantillons — voir « Son de piano »)', ensemble: 'ensemble de cordes (échantillons)', spiccato: 'cordes spiccato (échantillons)', frenchhorn: 'cor (échantillons)',
  harp: 'harpe (échantillons)', vibes: 'vibraphone (échantillons)', uprightbass: 'contrebasse pizzicato (échantillons)', pizz: 'cordes pizzicato (échantillons)', flute: 'flûte (échantillons)', warmpad: 'nappe chaude', pluck: 'corde pincée', mellow: 'synthé doux', softbass: 'basse ronde', housebass: 'basse house',
  cellobass: 'basse violoncelle', bell: 'cloche FM', square: 'onde carrée', subdrone: 'sub-bourdon', strings: 'cordes', darkpad: 'nappe sombre',
  polysynth: 'polysynth', stab: 'stab', sawbass: 'basse saw', acid: 'acid 303', sawlead: 'lead saw', horn: 'cuivres', arpsaw: 'saw arpégée', pulse: 'onde pulse',
  acidarp: 'acid aigu', reese: 'basse reese (saws désaccordées)', neuro: 'basse neuro (reese saturée, filtre rythmique)', dnbsub: 'sub drum & bass', subbass: 'sub-basse ronde (boom-bap)', liquidpad: 'nappe liquide', staccato: 'cordes staccato', chiparp: 'arpège 8-bit', tribass: 'basse triangle', '808': 'basse 808', '909': 'basse 909 (kick accordé)',
};
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
/** Bibliothèque de progressions sélectionnables (degrés). */
export const PROGRESSION_LIBRARY = GENERIC_PROGRESSIONS;
export const progressionLabel = (p) => p.map((d) => ROMAN[d]).join('–');
export const BASS_PATCHES = ['subbass', 'dnbsub', 'reese', 'neuro', 'uprightbass', 'softbass', 'housebass', 'analogbass', 'bass80', 'cellobass', 'spiccato', 'pizz', 'subdrone', 'sawbass', 'acid', '808', '909', 'moogbass', 'dx7bass'];
/** v1.8.0 : libellés « modèle » des sons dans les options avancées (les libellés PATCH_LABELS restent inchangés). */
export const MODEL_LABELS = { acid: 'TB-303 — basse acid (filtre résonant)', acidarp: 'TB-303 aigu (acid)', epiano: 'piano électrique FM (DX, léger)', junopad: 'nappe Juno-106 (chorus)', jupiterpad: 'nappe Jupiter-8 (saws désaccordées)', '808': 'TR-808 — basse 808', '909': 'TR-909 — basse 909' };
export const BASS_LABELS = { walking: 'basse marchante', default: 'rondes', offbeat: 'contretemps', drone: 'bourdon', eighths: 'croches', octave: 'octaves', acid: 'séquence acid', cinema: 'ostinato', '808': '808 glissée', boom: 'calée sur la grosse caisse (boom-bap)', roller: 'rouleau drum & bass', neuro: 'reese rythmique (neuro)', jungle: 'sub jungle (glissés)', disco: 'disco (octaves, notes de passage)' };
export const CHORD_LABELS = { strum: 'arpégés/grattés', sustain: 'tenus', stabs: 'stabs rythmiques', dstab: 'stabs Detroit (boucle mutante)', chiparp: 'arpèges rapides', chop: 'découpés façon MPC', disco: 'boucle disco syncopée' };
const CONTOURS = { libre: 0, montant: 0.5, descendant: -0.5, arche: 'arch', vague: 'wave' };

// ---------- générateur de grooves de batterie
function grid() { return Array(16).fill('.'); }
function put(a, steps, ch = 'o') { for (const s of steps) a[s] = ch; return a; }
const str = (a) => a.join('');
function hats(r, mode) {
  const a = grid();
  if (mode === '8') for (let s = 0; s < 16; s += 2) a[s] = s % 4 === 0 ? 'o' : (r.chance(0.3) ? '-' : 'o');
  else if (mode === '16') for (let s = 0; s < 16; s++) a[s] = s % 4 === 0 ? 'x' : s % 2 === 0 ? 'o' : (r.chance(0.75) ? '-' : '.');
  else if (mode === 'off') for (let s = 2; s < 16; s += 4) a[s] = 'o';
  else if (mode === 'sparse') for (let s = 0; s < 16; s += 2) if (r.chance(0.55)) a[s] = r.chance(0.5) ? 'o' : '-';
  else if (mode === 'swing') for (let s = 0; s < 16; s++) a[s] = s % 2 === 0 ? 'o' : (r.chance(0.35) ? '-' : '.');
  return str(a);
}
function sample(r, pool, n) { const p = pool.slice(), out = []; while (out.length < n && p.length) out.push(p.splice(Math.floor(r() * p.length), 1)[0]); return out; }

function genFamily(fam, r, dense) {
  const p = {};
  switch (fam) {
    case 'boombap': {
      p.kick = str(put(put(grid(), [0], 'x'), sample(r, [3, 6, 7, 8, 10, 11, 13, 14], r.int(1, 3) + (dense ? 1 : 0))));
      p.snare = str(put(put(grid(), [4, 12], 'x'), r.chance(0.5) ? [r.pick([7, 9, 15])] : [], '-'));
      p.hat = hats(r, r.pick(['8', 'swing', '16', 'sparse']));
      if (dense || r.chance(0.3)) p[r.pick(['rim', 'shaker'])] = str(put(grid(), sample(r, [2, 6, 10, 14, 11, 15], r.int(1, 3))));
      break;
    }
    case 'four': {
      p.kick = str(put(grid(), [0, 4, 8, 12], 'x'));
      if (r.chance(0.2)) p.kick = str(put(p.kick.split(''), [r.pick([14, 15, 3, 11])], '-'));
      if (r.chance(dense ? 0.9 : 0.6)) p.clap = str(put(grid(), [4, 12], r.chance(0.5) ? 'x' : 'o'));
      if (r.chance(dense ? 0.9 : 0.5)) p.ohat = str(put(grid(), [2, 6, 10, 14], dense ? 'x' : 'o'));
      p.hat = hats(r, dense ? r.pick(['16', '16', '8']) : r.pick(['16', '8', 'off', 'sparse']));
      if (r.chance(0.45)) p.rim = str(put(grid(), sample(r, [3, 6, 7, 9, 11, 13, 14, 15], r.int(2, 4))));
      if (dense && r.chance(0.5)) p.shaker = str(put(grid(), [1, 3, 5, 7, 9, 11, 13, 15]));
      break;
    }
    case 'tr909': {
      // grosse caisse 4/4 accentuée, parfois une double-croche fantôme avant le temps
      const k = put(grid(), [0, 4, 8, 12], 'x'); if (r.chance(dense ? 0.45 : 0.25)) put(k, [r.pick([15, 7, 14, 11])], '-'); p.kick = str(k);
      // charleston ouvert sur les contretemps, fermé autour (accents sur les temps), étouffé par le fermé
      const openOff = r.chance(dense ? 0.95 : 0.75);
      if (openOff) p.ohat = str(put(grid(), [2, 6, 10, 14], dense ? 'x' : 'o'));
      const h = grid(), mode = r.pick(dense ? ['16', '16', '8'] : ['16', '8', 'sparse']);
      for (let s = 0; s < 16; s++) {
        if (openOff && s % 4 === 2) continue;
        if (mode === '8' && s % 2) continue;
        if (mode === 'sparse' && s % 2 && !r.chance(0.4)) continue;
        h[s] = s % 4 === 0 ? 'o' : s % 4 === 3 && r.chance(0.5) ? 'o' : '-';
      }
      p.hat = str(h);
      if (dense || r.chance(0.55)) p.clap = str(put(grid(), [4, 12], dense ? 'x' : 'o'));
      if (r.chance(dense ? 0.5 : 0.25)) p.snare = str(put(grid(), sample(r, [3, 7, 11, 13, 14, 15], r.int(1, 3)), '-'));
      if (dense && r.chance(0.55)) p.ride = str(put(grid(), r.chance(0.5) ? [2, 6, 10, 14] : [0, 2, 4, 6, 8, 10, 12, 14], 'o'));
      if (r.chance(0.4)) p.rim = str(put(grid(), sample(r, [3, 6, 9, 11, 13, 14], r.int(2, 3))));
      if (dense && r.chance(0.3)) p[r.pick(['toml', 'tomm'])] = str(put(grid(), sample(r, [3, 7, 10, 11, 14], 2), 'o'));
      break;
    }
    case 'drive': {
      p.kick = r.chance(0.55) ? str(put(grid(), [0, 4, 8, 12], 'x')) : str(put(put(grid(), [0, 8], 'x'), sample(r, [6, 10, 11, 14], r.int(0, 2))));
      p.snare = str(put(grid(), [4, 12], 'x'));
      p.hat = hats(r, dense ? r.pick(['8', '16']) : r.pick(['off', '8', '16']));
      if (dense) p.clap = str(put(grid(), [4, 12], 'o'));
      if (r.chance(0.3)) p.tom = str(put(grid(), [14, 15]));
      break;
    }
    case 'chip': {
      p.kick = str(put(put(grid(), [0, 8], 'x'), sample(r, [6, 10, 11, 14, 3], r.int(0, 2) + (dense ? 1 : 0))));
      p.snare = str(put(put(grid(), [4, 12], 'x'), r.chance(0.4) ? [15] : [], 'o'));
      p.hat = hats(r, dense ? '16' : r.pick(['8', '16', 'off']));
      break;
    }
    case 'trap': {
      p.kick = str(put(put(grid(), [0], 'x'), sample(r, [3, 6, 7, 10, 11, 13, 14], r.int(1, 3) + (dense ? 1 : 0))));
      p.snare = str(put(grid(), [8], 'x'));
      if (dense) p.clap = str(put(grid(), [8], 'o'));
      p.hat = hats(r, r.pick(['8', '8', '16']));
      if (r.chance(dense ? 0.6 : 0.25)) p.ohat = str(put(grid(), [r.pick([6, 14, 10])]));
      break;
    }
    case 'hhboombap': case 'hhlofi': {
      // boom-bap : grosses caisses « classiques » (MPC / SP-1200), caisse claire 2 et 4 + notes fantômes, charleys en croches accentuées
      const lofi = fam === 'hhlofi';
      p.kick = r.pick(['x......x..x.....', 'x.........x..x..', 'x......x.xx.....', 'x.x.......x.....', 'x......x..x..x..', 'x.....x...x.....', 'x..x......x.....', 'x......xx.......', 'x.....x..x.x....']);
      if (dense && r.chance(0.5)) { const k = p.kick.split(''); const s = r.pick([13, 14, 15, 3]); if (k[s] === '.') k[s] = '-'; p.kick = k.join(''); }
      const sn = put(grid(), [4, 12], 'x');
      for (const s of sample(r, [7, 9, 10, 15, 14, 2], r.int(lofi ? 0 : 1, dense ? 3 : 2))) sn[s] = '-';
      p.snare = str(sn);
      const h = grid(), sixteen = r.chance(lofi ? 0.25 : 0.4) || dense;
      for (let s = 0; s < 16; s++) {
        if (s % 2 === 0) h[s] = s % 4 === 0 ? 'x' : 'o';
        else if (sixteen && r.chance(lofi ? 0.35 : 0.55)) h[s] = '-';
      }
      if (lofi && r.chance(0.35)) for (let s = 0; s < 16; s += 2) if (r.chance(0.3)) h[s] = '.';
      p.hat = str(h);
      if (dense || r.chance(0.35)) p.ohat = str(put(grid(), [r.pick([14, 6, 10])], 'o'));
      if (r.chance(lofi ? 0.45 : 0.3)) p[r.pick(['rim', 'shaker', 'rim'])] = str(put(grid(), sample(r, [2, 6, 10, 14, 11, 15, 3], r.int(1, 3)), '-'));
      break;
    }
    case 'dnbtwo': case 'dnbneuro': {
      // two-step : grosse caisse 1 et « 3 et », caisse claire 2 et 4 (à 170+ BPM), fantômes, charleys/ride
      const neuro = fam === 'dnbneuro';
      p.kick = r.pick(neuro ? ['x.........x.....', 'x.........x.....', 'x.......x.x.....', 'x.........x..x..'] : ['x.........x.....', 'x.........x.....', 'x.........x..-..', 'x.......-.x.....', 'x.x.......x.....']);
      const sn = put(grid(), [4, 12], 'x');
      for (const s of sample(r, neuro ? [7, 15, 14] : [7, 9, 14, 15, 2, 10], r.int(neuro ? 0 : 1, dense ? 3 : 2))) if (sn[s] === '.') sn[s] = '-';
      p.snare = str(sn);
      const h = grid(), mode = dense ? r.pick(['16', '8', '16']) : r.pick(['off', '8', '16']);
      for (let s = 0; s < 16; s++) {
        if (mode === 'off') { if (s % 4 === 2) h[s] = 'o'; else if (s % 2 === 1 && r.chance(0.2)) h[s] = '-'; }
        else if (mode === '8') { if (s % 2 === 0) h[s] = s % 4 === 2 ? 'x' : 'o'; }
        else h[s] = s % 4 === 2 ? 'x' : s % 2 === 0 ? 'o' : '-';
      }
      p.hat = str(h);
      if (dense && r.chance(neuro ? 0.4 : 0.7)) p.ride = str(put(grid(), r.chance(0.5) ? [2, 6, 10, 14] : [0, 2, 4, 6, 8, 10, 12, 14], 'o'));
      if (!neuro && r.chance(0.55)) p.shaker = str(Array.from({ length: 16 }, (_, s) => (s % 2 ? '-' : 'o')));
      if (neuro && r.chance(0.5)) p.rim = str(put(grid(), sample(r, [3, 6, 11, 13, 14], r.int(1, 2)), 'o'));
      break;
    }
    case 'jungle': {
      // breaks « amen-like » reconstruits par synthèse / CC0 (aucun échantillon de disque) : notes fortes 'x', fantômes '-'
      const breaks = [
        { kick: 'x.x.......xx....', snare: '....x..-.-..x..-' },
        { kick: 'x.x.......x.....', snare: '....x..-.-....x.' },
        { kick: 'x.x.......xx....', snare: '.-..x..-.-..x..x' },
        { kick: 'x...x.x...x.....', snare: '..-.x....-.x..xx' },
        { kick: 'x.........x.x...', snare: '....x..-.x..x.-.' },
        { kick: 'x.x...x...x.....', snare: '....x.-..-..x-.-' },
      ];
      const b = r.pick(breaks);
      p.kick = b.kick; p.snare = b.snare;
      p.ride = r.chance(0.6) ? 'o.o.o.o.o.o.o.o.' : 'o.-.o.-.o.-.o.-.';
      if (dense || r.chance(0.4)) p.hat = str(Array.from({ length: 16 }, (_, s) => (s % 2 ? (r.chance(0.6) ? '-' : '.') : '.')));
      if (r.chance(0.3)) p.ohat = str(put(grid(), [r.pick([6, 14])], 'o'));
      break;
    }
    case 'cinema': {
      p.tom = str(put(put(grid(), [0], 'x'), sample(r, [3, 6, 8, 10, 11, 13, 14], r.int(2, 4) + (dense ? 2 : 0))));
      if (dense) { p.boom = str(put(grid(), [0], 'x')); if (r.chance(0.7)) p.snare = str(put(grid(), r.chance(0.5) ? [4, 12] : [8], 'o')); }
      break;
    }
    case 'lofijazz': {
      // v1.11.0 : batterie jazz feutrée (ride swinguée, caisse claire en rimshot, grosse caisse discrète)
      p.kick = r.pick(['x.........x.....', 'x......x..x.....', 'x.........x..x..', 'x.....x...x.....']);
      const sn = put(grid(), [4, 12], r.chance(0.5) ? 'x' : 'o');
      for (const s of sample(r, [7, 10, 15, 2, 14], r.int(1, dense ? 3 : 2))) sn[s] = '-';
      p.snare = str(sn);
      p.ride = r.pick(['x...o.-.x...o.-.', 'x...x.-.x...x.-.', 'x.-.o.-.x.-.o...']);
      p.hat = str(put(grid(), [4, 12], '-'));
      if (r.chance(0.4)) p.rim = str(put(grid(), sample(r, [6, 11, 14, 3], r.int(1, 2)), '-'));
      break;
    }
    case 'lofisparse': {
      // v1.11.0 : ambient lo-fi — pulsation clairsemée (grosse caisse ronde, rim, shaker doux)
      p.kick = str(put(grid(), r.chance(0.5) ? [0] : [0, 10], 'o'));
      p.rim = str(put(grid(), r.chance(0.6) ? [12] : [4, 12], '-'));
      p.shaker = str(put(grid(), sample(r, [2, 6, 10, 14], r.int(1, dense ? 4 : 2)), '-'));
      if (dense || r.chance(0.4)) p.hat = str(put(grid(), [0, 4, 8, 12].filter(() => r.chance(0.6)), '-'));
      break;
    }
    case 'soft': default: {
      p.shaker = str(put(grid(), sample(r, [2, 6, 10, 14, 4, 12, 3, 11], r.int(2, 4))));
      if (dense) { p.kick = str(put(grid(), r.chance(0.5) ? [0] : [0, 10], 'o')); if (r.chance(0.5)) p.rim = str(put(grid(), [r.pick([4, 12, 7])])); }
    }
  }
  return p;
}

/** Percussions typiques de la 808 ajoutées au groove du style (en complément, jamais toutes à la fois). */
function add808Perc(p, r, N, style) {
  const G = () => Array(N).fill('.');
  const soft = style === 'ambient' || style === 'cinematic';
  if (r.chance(soft ? 0.15 : 0.45)) p.cowbell = str(put(G(), sample(r, N === 16 ? [3, 6, 10, 11, 14] : [2, 5, 8, 11], r.int(1, 3)), r.chance(0.5) ? 'o' : '-'));
  if (r.chance(0.35)) p.clave = str(put(G(), N === 16 ? r.pick([[0, 3, 6, 10, 12], [0, 3, 6, 12, 14], [2, 6, 10, 14]]) : [0, 4, 8], '-'));
  if (r.chance(soft ? 0.5 : 0.4)) { const c = G(); for (let s = 0; s < N; s++) if (s % 2 === 1 && r.chance(0.4)) c[s] = '-'; p[r.pick(['congah', 'congam', 'congal'])] = str(c); }
  if (!p.shaker && r.chance(0.4)) p.maracas = str(put(G(), Array.from({ length: N / 2 }, (_, i) => i * 2 + 1), '-'));
  return p;
}

function genMeter(meter, fam, r, dense) {
  const p = {}, G = () => Array(12).fill('.');
  const back = fam === 'four' ? 'clap' : fam === 'soft' ? 'rim' : fam === 'cinema' ? 'tom' : 'snare';
  if (meter === '3/4') {
    p.kick = str(put(put(G(), [0], 'x'), r.chance(0.5) ? [r.pick([6, 10, 11])] : [], 'o'));
    p[back] = str(put(G(), r.chance(0.6) ? [4, 8] : [8], 'o'));
  } else {
    p.kick = str(put(put(G(), [0], 'x'), r.chance(0.6) ? [r.pick([6, 10, 4])] : [], 'o'));
    p[back] = str(put(G(), [6], 'x'));
  }
  const hh = G(); for (let s = 0; s < 12; s += 2) hh[s] = s % 6 === 0 ? 'o' : (r.chance(0.3) ? '-' : 'o');
  if (dense) for (let s = 1; s < 12; s += 2) if (r.chance(0.5)) hh[s] = '-';
  p[fam === 'soft' ? 'shaker' : 'hat'] = str(hh);
  if (fam === 'soft' && !dense) delete p.kick;
  return p;
}

/** Recette complète. `S` = définition du style. */
export function makeFlavor(P, S) {
  const prof = profileKey(P);
  // hip-hop / drum & bass : la variante entre dans la graine (techno/synthwave inchangés pour la reproductibilité)
  const fk = P.style === 'hiphop' || P.style === 'dnb' || isLofi20(P) ? prof : P.style;
  const r = makeRng(hashSeed(P.seed, 'flavor', fk));
  const ADV = P.adv || {};
  const rg = makeRng(hashSeed(P.seed, 'groove', fk, P.variation, ADV.drumPattern || 0)); // la variation (ou la variante choisie) change le groove
  const E18 = isEngine18(P);
  const pool = (P.engine >= 20 && POOLS20[prof]) || (P.engine >= 19 ? POOLS19[P.ftStyle ? `${P.style}_${P.ftStyle}` : prof] || POOLS19[prof] : null) || (E18 ? POOLS18[prof] || POOLS18[P.style] : null) || POOLS[prof] || POOLS[P.style];
  const trapLike = P.style === 'trap' || prof === 'hiphop_trap';
  const pickW = (arr) => r.pick(arr);
  const patches = { ...S.patches };
  for (const k of ['chords', 'bass', 'lead', 'arp']) patches[k] = pickW(pool[k]);
  if (ADV.leadPatch && PATCH_LABELS[ADV.leadPatch] && ADV.leadPatch !== '808' && ADV.leadPatch !== '909') patches.lead = ADV.leadPatch;
  if (ADV.chordPatch && PATCH_LABELS[ADV.chordPatch] && ADV.chordPatch !== '808' && ADV.chordPatch !== '909') patches.chords = ADV.chordPatch;
  const tone = {};
  for (const k of ['chords', 'bass', 'lead', 'arp']) {
    tone[k] = {
      cut: r.range(0.65, 1.55), env: r.range(0.5, 1.5), att: r.range(0.6, 1.9), rel: r.range(0.6, 1.7),
      det: r.range(0.3, 2), vib: r.range(0, 1.5), wave: r.chance(0.22) ? r.pick(['square', 'tri', 'saw']) : null,
      ratio: r.pick([3.5, 2, 1.41, 3, 4.2]), index: r.range(0.6, 1.5), decay: r.range(0.9905, 0.998),
    };
  }
  let bassStyle = patches.bass === '808' ? '808' : pickW(pool.bassStyle);
  if (bassStyle === 'acid' && patches.bass !== 'acid') bassStyle = 'eighths';
  if (ADV.bassPatch && BASS_PATCHES.includes(ADV.bassPatch)) patches.bass = ADV.bassPatch;
  if (ADV.bassType && BASS_LABELS[ADV.bassType]) { bassStyle = ADV.bassType; if (bassStyle === '808') patches.bass = '808'; else if (bassStyle === 'acid') patches.bass = 'acid'; else if (patches.bass === '808') patches.bass = 'sawbass'; }
  let chordStyle = pickW(pool.chordStyle);
  const chordBars = pickW(pool.chordBars);
  // techno : sous-style (Detroit / minimale / industrielle)
  const TS = P.style === 'techno' ? (P.technoStyle || 'detroit') : null;
  if (TS) {
    if (!ADV.chordPatch) patches.chords = TS === 'industriel' ? 'darkpad' : TS === 'minimal' ? r.pick(['stab', 'stab', 'darkpad']) : r.pick(['stab', 'stab', 'polysynth']);
    chordStyle = patches.chords === 'darkpad' ? 'sustain' : 'dstab';
    if (!ADV.bassPatch && !ADV.bassType) {
      patches.bass = TS === 'industriel' ? r.pick(['909', 'sawbass', 'acid']) : TS === 'minimal' ? r.pick(['909', 'acid', 'housebass']) : r.pick(['acid', 'sawbass', 'housebass', '909']);
      bassStyle = patches.bass === 'acid' ? 'acid' : r.pick(TS === 'industriel' ? ['eighths', 'offbeat'] : ['offbeat', 'offbeat', 'eighths']);
    }
  }
  // synthwave 80s : sons liés, tons longs, glide (tirages séparés pour ne pas déplacer les autres)
  const SW = P.style === 'synthwave' ? (P.synthStyle || 'outrun') : null;
  let retro = null;
  if (SW) {
    const r8 = makeRng(hashSeed(P.seed, 'sw80', SW));
    for (const k of ['chords', 'bass', 'lead', 'arp']) {
      const t = tone[k]; t.wave = null; t.det = Math.max(0.8, t.det); t.rel = Math.max(1.2, t.rel) * (SW === 'dreamwave' ? 1.3 : 1);
      if (k === 'chords') t.att = Math.max(1, t.att);
      if (k === 'bass' || k === 'lead') t.cut = Math.max(0.85, t.cut);
    }
    if (!ADV.bassType) bassStyle = SW === 'dreamwave' ? r8.pick(['eighths', 'octave']) : r8.pick(['octave', 'octave', 'eighths']);
    retro = { majIV: r8.chance(0.5), color: SW === 'dreamwave' ? 0.65 : 0.5, legato: true };
  }
  const cx = ADV.complexity == null ? null : ADV.complexity / 100; // 0..1
  let chordSize = Math.max(3, Math.min(5, S.chordSize + (r.chance(0.35) ? r.pick([-1, 1]) : 0)));
  if (P.style === 'synthwave' || P.style === 'frenchtouch') chordSize = Math.max(4, chordSize); // septièmes / neuvièmes
  if (TS && TS !== 'industriel') chordSize = 4; // stabs mineurs 7e (Detroit)
  if (cx != null) chordSize = cx < 0.3 ? 3 : cx < 0.7 ? 4 : 5;
  const arp = { rate: r.pick([8, 16, S.arp.rate]), mode: r.pick(['up', 'updown', 'random', 'ostinato', S.arp.mode]), sparse: r.chance(0.4) ? r.range(0.1, 0.45) : (S.arp.sparse || 0) };
  let swing = Math.max(0, Math.min(0.33, r.range(pool.swing[0], pool.swing[1]) + (S.swing > 0.15 ? 0.05 : 0)));
  if (ADV.swing != null) swing = (ADV.swing / 60) * 0.33;
  if (cx != null) arp.sparse = Math.max(0, 0.5 - 0.5 * cx);

  // grooves : 2 variantes A, 1-2 variantes B ; parfois le groove « historique » du style est conservé
  const KIT_FAM = { tr808: null, tr909: 'tr909', lofi: 'boombap', soft: 'soft', retro: 'drive', house: 'four', techno: 'four', chip: 'chip', trap: 'trap', cinema: 'cinema', boombap: 'hhboombap', dnb: 'dnbtwo', break: 'jungle', hhlofi: 'hhlofi' };
  // house : la 909 est tirée au sort une fois sur trois ; techno : 909 par défaut
  const kit = ADV.drumKit || (E18 && pool.kits ? rg.pick(pool.kits) : null) || (P.style === 'house' && rg.chance(0.35) ? 'tr909' : trapLike && rg.chance(0.5) ? 'tr808' : prof === 'hiphop_boombap' && rg.chance(0.2) ? 'tr808' : S.drums.kit);
  // TR-808 : garde le groove du style (utilisable partout) et ajoute ses percussions (cowbell, clave, congas, maracas)
  const fam = (kit === 'tr909' || ADV.drumKit) && KIT_FAM[kit] ? KIT_FAM[kit] : pool.drumFam;
  // shuffle façon 909 (retard des doubles-croches paires) si le swing n'est pas imposé
  if (kit === 'tr909' && ADV.swing == null) swing = rg.pick([0, 0, 0.08, 0.12, 0.18, 0.25]);
  const meter = ADV.meter || '4/4';
  const gen = (dense) => (meter === '4/4' ? genFamily(fam, rg, dense || (cx != null && cx > 0.75 && rg.chance(0.5))) : genMeter(meter, fam, rg, dense));
  const A = [gen(false), gen(false)];
  const B = [gen(true)]; if (rg.chance(0.5)) B.push(gen(true));
  if (fam === 'jungle' && meter === '4/4') { A.push(gen(false), gen(false)); B.push(gen(true), gen(true)); } // breaks redécoupés : plus de variantes
  if (meter === '4/4' && !ADV.drumKit && !ADV.drumPattern && rg.chance(0.2)) { A[1] = S.drums.A[0]; }
  if (kit === 'tr808' || (E18 && kit === 'tr707')) for (const g of [...A, ...B]) add808Perc(g, rg, meter === '4/4' ? 16 : 12, P.style);
  // French Touch : clap sur les temps 2 et 4 dans tous les grooves (pilier du genre)
  if (P.style === 'frenchtouch' && meter === '4/4') for (const g of [...A, ...B]) {
    const c = (g.clap || '................').split('');
    for (const i of [4, 12]) if (c[i] !== 'x' && c[i] !== 'o') c[i] = 'x';
    g.clap = c.join('');
    const k = (g.kick || '................').split(''); for (const i of [0, 4, 8, 12]) k[i] = 'x'; g.kick = k.join('');
  }
  const drums = { ...S.drums, kit, halftime: kit === 'trap' || (kit === 'tr808' && trapLike), A, B };
  const drumTune = { kick: rg.range(0.85, 1.18), snare: rg.range(0.85, 1.2), hat: rg.range(0.8, 1.25), decay: rg.range(0.75, 1.35) };
  if (ADV.kickTune != null) drumTune.kickTune = 0.75 + 0.5 * ADV.kickTune / 100;
  if (ADV.kickDecay != null) drumTune.kickDecay = 0.45 + 1.3 * ADV.kickDecay / 100;
  // v1.9.0 French Touch : 909 accordée sur la tonique (45-60 Hz), grosse caisse courte et sèche, shuffle 909 modéré
  if (P.style === 'frenchtouch' && P.engine >= 19) {
    const rt = makeRng(hashSeed(P.seed, 'ft19kit')), pc = NOTE_NAMES.indexOf(P.key);
    let f = 440 * 2 ** ((24 + pc - 69) / 12); while (f < 42) f *= 2; while (f >= 84) f /= 2; if (f > 62) f /= 1.5; // tonique (ou sa quinte en dessous) entre 42 et 62 Hz
    Object.assign(drumTune, { kick: f / 49, snare: rt.range(0.98, 1.1), hat: rt.range(0.95, 1.08), decay: rt.range(0.85, 1.02), kickDecay: rt.range(0.6, 0.72) });
    if (ADV.kickTune != null) drumTune.kickTune = 0.75 + 0.5 * ADV.kickTune / 100;
    if (ADV.kickDecay != null) drumTune.kickDecay = 0.45 + 1.3 * ADV.kickDecay / 100;
    if (ADV.swing == null) swing = rt.range(pool.swing[0], pool.swing[1]);
  }
  // v1.21.4 : kit « Mes samples » (dossier externe) — tirage des fichiers par graine, sans toucher aux autres tirages
  if (kit === 'user') drumTune.extSeed = hashSeed(P.seed, 'extkit', P.variation || 0);

  const contour = r.pick(Object.keys(CONTOURS));
  const dm = cx == null ? r.range(0.75, 1.4) : (r(), 0.55 + 1.0 * cx);
  const melody = {
    ...S.melody,
    density: Math.min(0.95, S.melody.density * dm),
    rest: Math.max(0.05, Math.min(0.7, (S.melody.rest ?? 0.3) + r.range(-0.1, 0.12) + (ADV.melody === 'discrete' ? 0.15 : ADV.melody === 'forward' ? -0.1 : 0))),
    leap: (S.melody.leap ?? 0.25) * r.range(0.6, 1.8),
    contour: CONTOURS[contour], contourName: contour, cell: S.melody.cell || r.chance(0.45),
    penta: S.melody.penta ? r.chance(0.8) : r.chance(0.2),
  };
  const mix = {
    ...S.mix,
    reverb: S.mix.reverb * r.range(0.7, 1.4), delay: S.mix.delay * r.range(0.4, 1.6), delayBeats: r.pick([0.75, 0.75, 0.5, 1, 0.375]),
    sidechain: S.mix.sidechain * r.range(0.6, 1.3), bright: r.range(0.82, 1.2), wow: r.range(0.5, 1.6), width: r.range(0.85, 1.25),
  };
  if (ADV.space != null) mix.reverb = Math.max(0.02, (S.mix.reverb || 0.2) * (0.15 + 1.85 * ADV.space / 100) * 1.0);
  if (ADV.brightness != null) mix.bright = 0.55 + 0.9 * ADV.brightness / 100;
  if (ADV.width != null) mix.width = ADV.width / 100;
  if (ADV.energy != null) mix.sidechain = Math.max(mix.sidechain, 0) * (0.6 + 0.8 * ADV.energy / 100) + (ADV.energy > 60 && P.style !== 'ambient' ? 0.05 : 0);
  mix.vintage = ADV.vintage != null ? ADV.vintage / 100 : (S.mix.lofi ? 0.6 * mix.wow / 1.05 : 0);
  if (SW) {
    mix.delayBeats = 0.75; mix.delay = Math.max(0.3, mix.delay); mix.reverb = Math.max(0.55, mix.reverb) * (SW === 'dreamwave' ? 1.2 : 1);
    mix.chorus = 0.75; mix.chorusLead = 0.35; mix.tape = 0.75; mix.scLead = 0.5; mix.sidechain = Math.max(0.4, mix.sidechain);
    arp.rate = 16; arp.sparse = 0; if (arp.mode === 'random') arp.mode = 'up';
  }
  // ambiance (humeur) : swing, vintage, sidechain, délai
  const MO = MOODS[P.mood] || {};
  if (MO.swing && ADV.swing == null && !P.adv?.meter) swing = Math.min(0.33, swing + MO.swing);
  if (MO.vintage && ADV.vintage == null) mix.vintage = Math.max(mix.vintage, MO.vintage);
  if (MO.sidechain) mix.sidechain *= MO.sidechain;
  if (MO.delay) mix.delay *= MO.delay;
  // hip-hop / drum & bass : réglages idiomatiques
  if (prof === 'hiphop_lofi') mix.vintage = ADV.vintage != null ? mix.vintage : Math.max(0.55, mix.vintage);
  if (prof === 'hiphop_boombap' && ADV.vintage == null) mix.vintage = r.range(0.15, 0.4);
  if (P.style === 'dnb') { arp.rate = 16; if (prof !== 'dnb_liquid') mix.delay *= 0.7; }
  if (TS === 'industriel') { mix.drumSat = 2.5; mix.reverb *= 1.3; } else if (TS === 'minimal') { mix.reverb *= 0.7; mix.delay *= 1.3; }
  if (ADV.melody === 'forward') mix.leadGain = 1.25; else if (ADV.melody === 'discrete') mix.leadGain = 0.7;
  // v1.11.0 : lo-fi moteur 20 — textures dédiées (vinyle, bande, poussière, chaleur) à la place du « vintage » historique
  if (isLofi20(P)) {
    const T = lofiTexture(P, ADV);
    mix.vintage = 0; mix.filterSweep = true;
    mix.tex = { crackle: T.crackle / 100, wow: T.wow / 100, sat: T.tapeSat / 100, dust: T.dust / 100, warmth: T.warmth / 100 };
    mix.texUi = T;
  }
  let progPool = S.progressions.concat(GENERIC_PROGRESSIONS);
  let progW = progPool.map((_, i) => (i < S.progressions.length ? 3 : 1));
  if (TS) { progPool = S.progressions.slice(); progW = progPool.map(() => 1); } // boucles hypnotiques : un ou deux accords
  const forced = ADV.progression != null && ADV.progression !== '' ? PROGRESSION_LIBRARY[+ADV.progression] : null;
  if (forced) { progPool = [forced]; progW = [1]; }
  const cycleIndex = r.int(0, 4);
  // v1.6 : son de piano (Steinway B / Salamander / piano droit) et Rhodes (échantillonné jRhodes3d ou synthèse) —
  // tirages sur un flux séparé pour ne pas déplacer les autres choix de la graine
  const rp = makeRng(hashSeed(P.seed, 'piano', fk));
  let pianoSound = ADV.pianoSound && PIANO_SOUND_LABELS[ADV.pianoSound] ? ADV.pianoSound : rp.pick(['steinway', 'salamander']);
  // banque allégée (dossier retiré) : repli sans changer le tirage
  if (pianoSound === 'salamander' && !hasInstrument('salamander')) pianoSound = 'steinway';
  if (pianoSound === 'steinway' && !hasInstrument('steinwayb')) pianoSound = 'upright';
  const rhodesSound = ADV.rhodesSound === 'synth' || !hasInstrument('jrhodes') ? 'synth' : 'sampled';
  // ambiances chill / nocturne : le piano électrique FM laisse souvent la place au Rhodes (lo-fi, hip-hop, house, DnB liquid)
  const rhodesFriendly = ['lofi', 'house', 'hiphop_boombap', 'hiphop_lofi', 'dnb_liquid', 'dnb_jungle'].includes(prof) || P.style === 'lofi';
  if (rhodesFriendly && (P.mood === 'chill' || P.mood === 'nocturne')) for (const k of ['chords', 'lead']) {
    if ((k === 'chords' ? !ADV.chordPatch : !ADV.leadPatch) && (patches[k] === 'epiano' || patches[k] === 'warmpad' || patches[k] === 'mellow') && rp.chance(0.6)) patches[k] = 'rhodes';
  }
  return { pianoSound, rhodesSound, forcedProg: !!forced, patches, tone, bassStyle, chordStyle, chordBars, chordSize, arp, swing, drums, drumTune, melody, mix, progPool, progW, cycleIndex, retro, leadOct: S.leadOct + (r.chance(0.15) ? r.pick([-1, 1]) : 0) };
}

const KIT_LABELS = { boombap: 'boom-bap acoustique (Virtuosity Drums, CC0)', hhlofi: 'hip-hop lo-fi acoustique (micro lo-fi Virtuosity, CC0)', dnb: 'drum & bass acoustique (Frankensnare + Virtuosity, CC0)', break: 'break jungle reconstruit coup par coup (Frankensnare rimshot + Virtuosity, CC0)', lofi: 'lo-fi (synthèse + CC0)', tr606: 'TR-606 (synthèse)', tr707: 'TR-707 (numérique 6 bits imité, synthèse)', dr110: 'DR-110 Dr. Rhythm (synthèse)' };
export const PIANO_SOUND_LABELS = { steinway: 'piano à queue Steinway B (VCSL, CC0)', salamander: 'piano à queue Salamander Grand V3 (Yamaha C5, CC-BY 3.0 — Alexander Holm)', upright: 'piano droit (VCSL, CC0)' };
export const RHODES_SOUND_LABELS = { sampled: 'Rhodes Mark I échantillonné (jRhodes3d — Jeff Learman)', synth: 'Rhodes synthétisé (modèle physique)' };
const usesPatch = (F, p) => ['chords', 'lead', 'arp'].some((k) => F.patches[k] === p);

/** Style « effectif » = style de base + recette. */
export function applyFlavor(S, F) {
  return { ...S, patches: F.patches, bassStyle: F.bassStyle, chordStyle: F.chordStyle, chordBars: F.chordBars, chordSize: F.chordSize, arp: F.arp, swing: F.swing, drums: F.drums, melody: F.melody, mix: F.mix, retro: F.retro, leadOct: Math.max(4, Math.min(6, F.leadOct)) };
}

/** Résumé lisible (français) de la recette, stocké dans les métadonnées. */
export function describeFlavor(F) {
  return {
    sons: { accords: PATCH_LABELS[F.patches.chords], basse: PATCH_LABELS[F.patches.bass], melodie: PATCH_LABELS[F.patches.lead], arpeges: PATCH_LABELS[F.patches.arp],
      ...(usesPatch(F, 'piano') ? { piano: PIANO_SOUND_LABELS[F.pianoSound || 'upright'] } : {}), ...(usesPatch(F, 'rhodes') ? { rhodes: RHODES_SOUND_LABELS[F.rhodesSound || 'sampled'] } : {}) },
    jeu: { basse: BASS_LABELS[F.bassStyle] || F.bassStyle, accords: CHORD_LABELS[F.chordStyle] || F.chordStyle, mesuresParAccord: F.chordBars, notesParAccord: F.chordSize, arpeges: `${F.arp.mode} · ${F.arp.rate === 16 ? 'doubles' : 'croches'}` },
    groove: { kit: F.drums.kit === 'tr909' ? 'TR-909 (synthèse)' : F.drums.kit === 'tr808' ? 'TR-808 (synthèse)' : (KIT_LABELS[F.drums.kit] || F.drums.kit), swing: +F.swing.toFixed(2), kick: F.drums.A[0].kick || null, caisse: F.drums.A[0].snare || F.drums.A[0].clap || null, charley: F.drums.A[0].hat || null },
    melodie: { contour: F.melody.contourName, densite: +F.melody.density.toFixed(2), pentatonique: !!F.melody.penta },
    effets: { reverb: +F.mix.reverb.toFixed(2), delai: +F.mix.delay.toFixed(2), delaiTemps: F.mix.delayBeats, sidechain: +F.mix.sidechain.toFixed(2), brillance: +F.mix.bright.toFixed(2) },
  };
}
