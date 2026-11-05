// Compositeur procédural : structure, harmonie, basse, mélodie (Markov + règles), arpèges, batterie.
import { makeFlavor, applyFlavor, describeFlavor, PATCH_LABELS, BASS_LABELS, BASS_PATCHES, PROGRESSION_LIBRARY, progressionLabel } from './flavor.js';
import { makeRng, hashSeed } from './rng.js';
import { grooveFor, grooveShift, grooveAccent, barDynamics } from './groove.js';
import { SCALES, PENTA_DEGREES, NOTE_NAMES, NOTE_NAMES_FR, degreeToMidi, chordMidis, voiceLead } from './theory.js';
import { MODEL_LABELS } from './flavor.js';
import { STYLES, MOODS, INSTRUMENTS, HIPHOP_STYLES, DNB_STYLES, AMBIENCES, LOFI_STYLES, styleDef, profileKey, variantOf } from './styles.js';
import { isLofi20, pickLofiStyle, lofiArrange, jazzVoice, IDIOMS20 } from './lofi20.js';
export { profileKey, variantOf };
import { isFT19, ftForm, composeFrenchTouch, FT_LABELS, FT_STYLES, FT_BPM } from './frenchtouch.js';
export { FT_STYLES };
import { TECHNO_STYLES, TECHNO_BPM, makeTechnoJam, technoDrums, technoStabs } from './techno.js';
export const SYNTH_STYLES = { outrun: 'Outrun (énergique, 100-118 BPM)', dreamwave: 'Dreamwave (lent, 80-100 BPM)' };
export const SYNTH_BPM = { outrun: [100, 118], dreamwave: [80, 100] };

export const LIMITS = { minDuration: 20, maxDuration: 14400, minBpm: 50, maxBpm: 180 };
// Au-delà de cette durée, le morceau est découpé en « mouvements » (chapitres) qui évoluent.
export const LONG_FORM_SECONDS = 420;
/** Queue de réverbération ajoutée après la dernière mesure (doit valoir TAIL de render.js). */
export const RENDER_TAIL = 3.5;

/** Complète les paramètres « auto » de façon déterministe à partir de la graine. */
import { cleanPlan } from './aiplan.js';
export function resolveParams(input = {}) {
  const style = STYLES[input.style] ? input.style : 'lofi';
  const adv = resolveAdvanced({ ...(input.adv || input.advanced || {}), ...(input.variety != null && input.variety !== '' ? { variety: input.variety } : {}), ...(input.mixStyles != null && input.mixStyles !== '' ? { mixStyles: input.mixStyles } : {}) });
  let seed = Number.isFinite(+input.seed) && input.seed !== '' && input.seed !== null ? (Math.abs(Math.floor(+input.seed)) % 4294967296) : Math.floor(Math.random() * 2 ** 31);
  const variation = Math.max(0, Math.floor(+input.variation || 0));
  const mood = MOODS[input.mood] ? input.mood : 'auto';
  const M = MOODS[mood];
  const rh = makeRng(hashSeed(seed, 'harmony', style));
  // hip-hop : boom-bap / lo-fi / trap ; drum & bass : liquid / neuro / jungle (tirés de la graine si « auto »)
  const hiphopStyle = style === 'hiphop' ? (adv.hiphopStyle || makeRng(hashSeed(seed, 'hiphopSub')).weighted(['boombap', 'lofi', 'trap'], [3, 2, 2])) : undefined;
  const dnbStyle = style === 'dnb' ? (adv.dnbStyle || makeRng(hashSeed(seed, 'dnbSub')).weighted(['liquid', 'neuro', 'jungle'], [3, 2, 2])) : undefined;
  // v1.8.0 : révision du moteur (réglages par défaut revus, docs/STYLES.md). Absente = moteur historique : les anciens
  // morceaux et réglages enregistrés se recalculent à l'identique. La French Touch n'existe qu'en moteur 1.8.
  const engine = +input.engine >= 21 ? 21 : +input.engine >= 20 ? 20 : +input.engine >= 19 ? 19 : style === 'frenchtouch' || +input.engine >= 18 ? 18 : 0; // v1.9.0 : moteur 19 (French Touch refaite) ; v1.11.0 : moteur 20 (lo-fi refait)
  // v1.9.0 : French Touch en trois variantes (moteur 19 uniquement : les morceaux 1.8 ne changent pas)
  const ftStyle = style === 'frenchtouch' && engine >= 19 ? (FT_STYLES[adv.ftStyle] ? adv.ftStyle : makeRng(hashSeed(seed, 'ftSub')).weighted(['classic', 'edbanger', 'myd'], [3, 2, 2])) : undefined;
  // v1.11.0 : lo-fi en six sous-genres (moteur 20 uniquement : les morceaux lo-fi plus anciens ne changent pas)
  const lofiStyle = style === 'lofi' && engine >= 20 ? (LOFI_STYLES[adv.lofiStyle] ? adv.lofiStyle : pickLofiStyle(seed, (+(input.fullDuration ?? input.duration) || 0) >= 3600 && adv.mix !== 'off')) : undefined;
  if (lofiStyle && adv.variety == null) { const raw = input.variety ?? (input.adv || input.advanced || {}).variety; if (VARIETY_ALIASES[String(raw ?? '').toLowerCase()] === 'medium') adv.variety = 'medium'; } // lo-fi 1.11 : « Moyenne » explicite (auto = forte)
  const S = styleDef(style, hiphopStyle || dnbStyle || ftStyle || lofiStyle, engine);

  let scale = SCALES[input.scale] ? input.scale : null;
  if (!scale) {
    const names = Object.keys(S.scales);
    let weights = names.map((n) => S.scales[n]);
    if (M.scales) {
      const inter = M.scales.filter((s) => s in SCALES);
      scale = rh.weighted(inter, inter.map((s) => (S.scales[s] || 0.6) + 0.4));
    } else scale = rh.weighted(names, weights);
  } else rh();

  let keyPc = NOTE_NAMES.indexOf(input.key);
  if (keyPc < 0) keyPc = rh.int(0, 11); else rh();

  // techno : sous-style (Detroit / minimale / industrielle), tiré de la graine si « auto »
  const technoStyle = style === 'techno' ? (adv.technoStyle || makeRng(hashSeed(seed, 'technoSub')).weighted(['detroit', 'minimal', 'industriel'], [3, 1.5, 1.5])) : undefined;
  // synthwave : outrun (énergique) ou dreamwave (lent, 80-100 BPM)
  const synthStyle = style === 'synthwave' ? (adv.synthStyle || makeRng(hashSeed(seed, 'synthSub')).weighted(['outrun', 'dreamwave'], [2, 1])) : undefined;
  const subBpm = hiphopStyle ? S.subs[hiphopStyle].bpm : dnbStyle ? S.subs[dnbStyle].bpm : lofiStyle ? STYLES.lofi.subs[lofiStyle].bpm : null;
  const bpmRange = ftStyle ? FT_BPM[ftStyle] : technoStyle ? TECHNO_BPM[technoStyle] : synthStyle ? SYNTH_BPM[synthStyle] : subBpm || S.bpm;
  let bpm = +input.bpm;
  if (!Number.isFinite(bpm) || bpm <= 0) bpm = rh.int(bpmRange[0], bpmRange[1]) + (M.bpm || 0);
  else rh();
  if (subBpm && !(+input.bpm > 0)) bpm = Math.min(subBpm[1] + 2, Math.max(subBpm[0] - 2, bpm)); // variantes à tempo idiomatique (DnB, trap…)
  bpm = Math.round(Math.min(LIMITS.maxBpm, Math.max(LIMITS.minBpm, bpm)));

  let duration = +input.duration;
  if (!Number.isFinite(duration) || duration <= 0) duration = 90;
  duration = Math.min(LIMITS.maxDuration, Math.max(LIMITS.minDuration, duration));

  const instruments = {};
  for (const k of Object.keys(INSTRUMENTS)) {
    const v = input.instruments && k in input.instruments ? input.instruments[k] : undefined;
    instruments[k] = v === undefined || v === null ? !!S.defaults[k] : !!v;
  }
  if (!Object.values(instruments).some(Boolean)) instruments.chords = true;

  const wav = input.wav === false || input.wav === 'false' ? false : true;
  const aiPlan = input.aiPlan ? cleanPlan(input.aiPlan, style) : null; // v1.9.0 : plan par titre du directeur artistique (mix ≥ 1 h)
  return { style, seed, variation, mood, scale, key: NOTE_NAMES[keyPc], bpm, duration, instruments, wav, adv, ...(engine ? { engine } : {}), ...((engine || 0) < 21 && input.harmonyFix ? { harmonyFix: true } : {}), ...(aiPlan ? { aiPlan } : {}), ...(technoStyle ? { technoStyle } : {}), ...(ftStyle ? { ftStyle } : {}), ...(synthStyle ? { synthStyle } : {}), ...(hiphopStyle ? { hiphopStyle } : {}), ...(dnbStyle ? { dnbStyle } : {}), ...(lofiStyle ? { lofiStyle } : {}) };
}

/** v1.6.3 : niveau de variation (0 faible, 1 moyenne = historique, 2 forte, 3 maximale). */
export const VARIETY_LABELS = { low: 'Faible', medium: 'Moyenne', high: 'Forte', max: 'Maximale' };
export const VARIETY_LEVEL = { low: 0, medium: 1, high: 2, max: 3 };
const VARIETY_ALIASES = { low: 'low', faible: 'low', medium: 'medium', moyenne: 'medium', high: 'high', forte: 'high', max: 'max', maximale: 'max', '0': 'low', '1': 'medium', '2': 'high', '3': 'max' };
export const varietyOf = (P) => VARIETY_LEVEL[P?.adv?.variety] ?? (isLofi20(P) ? 2 : 1); // v1.11.0 : lo-fi moteur 20 = « forte » par défaut
/** Paramètres avancés : null = « auto » (la recette de la graine décide). */
// niveau relatif des fonds sonores (équilibrés à l'oreille / au RMS de bus)
const AMB_GAIN = { pluie: 1.6, vagues: 1.5, vent: 1.1, nuit: 4.5, feu: 1.25, ville: 0.9, vinyle: 4, cafe: 0.65, etude: 1, nuitville: 4 };
export const ADVANCED = {
  energy:     { label: 'Énergie', type: 'range', min: 0, max: 100, help: 'Intensité générale, densité de la batterie, compression.' },
  complexity: { label: 'Complexité', type: 'range', min: 0, max: 100, help: 'Densité de la mélodie, notes par accord, arpèges, coups de batterie.' },
  swing:      { label: 'Swing', type: 'range', min: 0, max: 60, unit: '%', help: 'Décalage des doubles-croches paires (groove).' },
  brightness: { label: 'Brillance', type: 'range', min: 0, max: 100, help: 'Ouverture des filtres.' },
  space:      { label: 'Espace (réverbération)', type: 'range', min: 0, max: 100 },
  width:      { label: 'Largeur stéréo', type: 'range', min: 0, max: 150, unit: '%' },
  ambience:   { label: 'Fond sonore', type: 'select', options: AMBIENCES, help: 'Ambiance synthétisée sous la musique (pluie, vagues, vent, grillons, feu, ville, café, salle d’étude, vinyle). Auto : selon l’ambiance choisie.' },
  ambienceLevel: { label: 'Volume du fond sonore', type: 'range', min: 0, max: 100, help: '50 = niveau habituel ; 0 = inaudible, 100 = très présent.' },
  vintage:    { label: 'Lo-fi / vintage', type: 'range', min: 0, max: 100, help: 'Pleurage, filtre, saturation, craquements. Lo-fi 1.11 : agit comme un réglage global des cinq textures ci-dessous (50 = valeurs du sous-genre).' },
  crackle:    { label: 'Craquements de vinyle', type: 'range', min: 0, max: 100, styles: ['lofi'], help: 'Poussière, pops et souffle du disque (lo-fi 1.11).' },
  wow:        { label: 'Pleurage / scintillement', type: 'range', min: 0, max: 100, styles: ['lofi'], help: 'Instabilité de vitesse de la bande ou du disque : hauteur qui ondule doucement (lo-fi 1.11).' },
  tapeSat:    { label: 'Saturation de bande', type: 'range', min: 0, max: 100, styles: ['lofi'], help: 'Compression et harmoniques chaudes d’une cassette poussée (lo-fi 1.11).' },
  dust:       { label: 'Poussière numérique', type: 'range', min: 0, max: 100, styles: ['lofi'], help: 'Réduction de résolution et de fréquence d’échantillonnage, façon sampler 12 bits (lo-fi 1.11).' },
  warmth:     { label: 'Chaleur (passe-bas)', type: 'range', min: 0, max: 100, styles: ['lofi'], help: 'Filtre passe-bas doux : aigus arrondis (lo-fi 1.11).' },
  humanize:   { label: 'Humanisation', type: 'range', min: 0, max: 100, help: 'Micro-décalages et nuances de vélocité.' },
  melody:     { label: 'Présence de la mélodie', type: 'select', options: { off: 'Absente', discrete: 'Discrète', normal: 'Normale', forward: 'En avant' } },
  leadPatch:  { label: 'Instrument mélodique', type: 'select', options: {} },
  chordPatch: { label: 'Son des accords', type: 'select', options: {} },
  bassType:   { label: 'Jeu de basse', type: 'select', options: {} },
  bassPatch:  { label: 'Son de basse', type: 'select', options: {} },
  synthStyle: { label: 'Style synthwave', type: 'select', styles: ['synthwave'], options: SYNTH_STYLES, help: 'Outrun : 100-118 BPM, arpèges et batterie qui poussent ; dreamwave : 80-100 BPM, nappes longues et réverbes amples.' },
  hiphopStyle:{ label: 'Style hip-hop', type: 'select', styles: ['hiphop'], options: HIPHOP_STYLES, help: 'Boom-bap : swing MPC, caisse claire sèche, Rhodes jazzy ; lo-fi : vinyle, saturation, jeu « paresseux » ; trap : demi-temps, 808 glissantes et rafales de charleston.' },
  dnbStyle:   { label: 'Style drum & bass', type: 'select', styles: ['dnb'], options: DNB_STYLES, help: 'Liquid : nappes et sub rond ; neurofunk : basse reese sombre et mouvante ; jungle : breaks découpés, sub profond.' },
  ftStyle:    { label: 'Variante French Touch', type: 'select', styles: ['frenchtouch'], options: FT_STYLES, help: 'Filtrée classique (Cassius, Daft Punk Homework / Discovery), électro Ed Banger (stabs et basse saturés, Justice) ou house française moderne (Myd : basse rebondissante, hooks découpés).' },
  lofiStyle:  { label: 'Sous-genre lo-fi', type: 'select', styles: ['lofi'], options: LOFI_STYLES, help: 'Nouveaux morceaux lo-fi (1.11) : jazzy (Rhodes, accords enrichis, batterie swinguée), chillhop, lo-fi house (4/4 filtré), ambient (nappes, peu ou pas de batterie), sad (mineur, lent), beatmaker (boom-bap poussiéreux, cuivres, scratchs).' },
  technoStyle:{ label: 'Style techno', type: 'select', styles: ['techno'], options: TECHNO_STYLES, help: 'Detroit : stabs mineurs et 909 jouée en live ; minimale : boucles sèches ; industrielle : dure et saturée.' },
  drumKit:    { label: 'Kit de batterie', type: 'select', options: { tr808: 'TR-808 (synthèse analogique)', tr909: 'TR-909 (synthèse analogique)', lofi: 'Lo-fi', soft: 'Doux', retro: 'Rétro 80s', house: 'House', techno: 'Techno', chip: '8-bit', trap: 'Trap', cinema: 'Cinéma', boombap: 'Boom-bap acoustique (Virtuosity)', hhlofi: 'Hip-hop lo-fi acoustique (micro lo-fi)', dnb: 'Drum & bass acoustique (Frankensnare)', break: 'Break jungle acoustique (coup par coup)' } },
  pianoSound: { label: 'Son de piano', type: 'select', options: { steinway: 'Steinway B (piano à queue, CC0)', salamander: 'Salamander Grand V3 (Yamaha C5, CC-BY 3.0)', upright: 'Piano droit (VCSL)' }, help: 'Échantillons utilisés quand le morceau joue du piano. Auto : Steinway B ou Salamander selon la graine. Le Salamander demande un crédit (ajouté automatiquement dans la description).' },
  rhodesSound:{ label: 'Son du Rhodes', type: 'select', options: { sampled: 'Rhodes échantillonné (jRhodes3d, 5 vélocités)', synth: 'Rhodes synthétisé (modèle physique)' }, help: 'Auto : Rhodes Mark I échantillonné (Jeff Learman). La synthèse reste disponible.' },
  kickTune:   { label: 'Accord de la grosse caisse', type: 'range', min: 0, max: 100, unit: '', help: 'Hauteur de la grosse caisse (50 = neutre).' },
  kickDecay:  { label: 'Longueur de la grosse caisse', type: 'range', min: 0, max: 100, unit: '', help: 'Décroissance de la grosse caisse : courte et sèche → longue et grondante.' },
  drumPattern:{ label: 'Variante de rythme', type: 'range', min: 1, max: 12, help: 'Choisit un autre groove généré (1-12).' },
  progression:{ label: 'Progression d\'accords', type: 'select', options: {} },
  meter:      { label: 'Mesure', type: 'select', options: { '4/4': '4/4', '3/4': '3/4 (valse)', '6/8': '6/8 (balancé)' } },
  structure:  { label: 'Structure', type: 'select', options: { classique: 'Classique (couplet/refrain/pont)', edm: 'Montée → drop → breakdown', progressive: 'Progressive (évolution lente)', chanson: 'Couplet/refrain alternés', boucle: 'Boucle hypnotique' } },
  evolution:  { label: 'Vitesse d\'évolution (morceaux longs)', type: 'select', options: { lente: 'Lente', normale: 'Normale', rapide: 'Rapide' } },
  fadeIn:     { label: 'Fondu d\'entrée', type: 'range', min: 0, max: 30, unit: 's' },
  fadeOut:    { label: 'Fondu de sortie', type: 'range', min: 0, max: 60, unit: 's' },
  variety:    { label: 'Variation', type: 'select', options: VARIETY_LABELS, help: 'Faible : morceau stable, mix homogène (même sous-style, tempo et tonalité proches, mêmes sons) pour la concentration ou le sommeil. Moyenne (auto) : comportement habituel. Forte / maximale : sections, mélodies, accords, batterie et sons qui évoluent davantage, modulations ; dans les mix, sous-styles, tonalités, tempos, instruments et ambiances qui changent d\'un titre à l\'autre.' },
  mixStyles:  { label: 'Styles du mix (morceaux longs)', type: 'select', options: { same: 'Rester dans le même style', related: 'Autoriser d\'autres styles proches' }, help: 'Mix DJ en variation forte ou maximale : « styles proches » autorise quelques titres d\'un style voisin (lo-fi ↔ hip-hop, house ↔ techno, ambient ↔ cinématique, trap ↔ hip-hop trap).' },
  mix:        { label: 'Mode mix DJ (morceaux longs)', type: 'select', options: { on: 'Activé', off: 'Désactivé (un seul long morceau)' }, help: 'Auto = activé dès 1 h : le morceau devient un set continu de sous-morceaux distincts (4 à 8 min, tonalité/tempo/sons/batterie propres) enchaînés comme un DJ (calage sur le tempo, échange des basses, filtres, tonalités compatibles, dérive de tempo, courbe d\'énergie). « Activé » le force dès 15 min.' },
};
for (const [k, v] of Object.entries(PATCH_LABELS)) if (!['808', '909', 'reese', 'neuro', 'dnbsub', 'subbass', 'dx7bass', 'moogbass'].includes(k)) { ADVANCED.leadPatch.options[k] = MODEL_LABELS[k] || v; ADVANCED.chordPatch.options[k] = MODEL_LABELS[k] || v; }
Object.assign(ADVANCED.bassType.options, BASS_LABELS);
for (const k of BASS_PATCHES) ADVANCED.bassPatch.options[k] = MODEL_LABELS[k] || PATCH_LABELS[k] || k;
// v1.8.0 : boîtes à rythmes supplémentaires (synthèse JS, noms de modèles = caractère visé)
Object.assign(ADVANCED.drumKit.options, { tr606: 'TR-606 (synthèse analogique)', tr707: 'TR-707 (numérique 6 bits imité)', dr110: 'DR-110 Dr. Rhythm (synthèse analogique)' });
ADVANCED.drumKit.help = 'Auto : la boîte du style (voir « Défaut du style »). TR-606/707/808/909 et DR-110 sont synthétisées en JavaScript, sans échantillon.';
PROGRESSION_LIBRARY.forEach((p, i) => { ADVANCED.progression.options[String(i)] = progressionLabel(p); });
function resolveAdvanced(a) {
  const out = {};
  for (const [k, d] of Object.entries(ADVANCED)) {
    const v = a[k];
    if (v === undefined || v === null || v === '' || v === 'auto') { out[k] = null; continue; }
    if (d.type === 'range') { const n = +v; out[k] = Number.isFinite(n) ? Math.min(d.max, Math.max(d.min, n)) : null; }
    else { const sv = String(v).slice(0, 40); out[k] = sv in d.options ? sv : null; }
  }
  if (out.meter && !['4/4', '3/4', '6/8'].includes(out.meter)) out.meter = null;
  if (out.structure && !(out.structure in ADVANCED.structure.options)) out.structure = null;
  if (out.evolution && !(out.evolution in ADVANCED.evolution.options)) out.evolution = null;
  if (out.melody && !(out.melody in ADVANCED.melody.options)) out.melody = null;
  if (out.drumKit && !(out.drumKit in ADVANCED.drumKit.options)) out.drumKit = null;
  // v1.6.3 : « Moyenne » = comportement historique (null) ; « même style » = défaut
  { const v = VARIETY_ALIASES[String(a.variety ?? '').toLowerCase()]; out.variety = v && v !== 'medium' ? v : null; }
  if (out.mixStyles === 'same') out.mixStyles = null;
  return out;
}
export const meterInfo = (P) => { const m = (P.adv && P.adv.meter) || '4/4'; return { meter: m, bpb: m === '4/4' ? 4 : 3, spb: m === '4/4' ? 16 : 12, compound: m === '6/8' }; };

function chordName(scaleSteps, rootMidi, deg, size) {
  const notes = chordMidis(scaleSteps, rootMidi, deg, Math.max(3, size));
  const r = notes[0];
  const third = notes[1] - r, fifth = notes[2] - r, sev = notes[3] !== undefined ? notes[3] - r : null;
  let q = third === 3 ? 'm' : '';
  if (fifth === 6) q = third === 3 ? 'dim' : 'b5';
  if (fifth === 8) q = 'aug';
  if (sev !== null) {
    if (sev === 11) q += third === 4 ? 'maj7' : '(maj7)';
    else if (sev === 10) q = fifth === 6 ? 'm7b5' : q + '7';
    else if (sev === 9) q = 'dim7';
  }
  return NOTE_NAMES[((r % 12) + 12) % 12] + q;
}

const DEFAULT_CYCLE = [["A", 8], ["B", 8], ["A", 8], ["bridge", 4], ["B", 8], ["B", 8]];
const CHAPTER_CYCLES = [
  DEFAULT_CYCLE,
  [["A", 8], ["A", 8], ["B", 8], ["bridge", 4], ["B", 8]],
  [["A", 8], ["B", 8], ["B", 8], ["bridge", 8], ["A", 8], ["B", 8]],
  [["A", 16], ["B", 8], ["bridge", 4], ["B", 8], ["B", 8]],
  [["B", 8], ["A", 8], ["B", 8], ["bridge", 4], ["A", 8], ["B", 8]],
];

// Structures sélectionnables (troisième champ = rôle : build = montée, drop = refrain explosif, breakdown = pause)
export const STRUCTURES = {
  classique: DEFAULT_CYCLE,
  edm: [["A", 8], ["A", 4, "build"], ["B", 8, "drop"], ["bridge", 8, "breakdown"], ["A", 4, "build"], ["B", 8, "drop"], ["B", 8, "drop"]],
  progressive: [["A", 8], ["A", 8], ["B", 8], ["A", 8], ["bridge", 4], ["B", 8], ["B", 8]],
  chanson: [["A", 8], ["B", 8], ["A", 8], ["B", 8], ["bridge", 8], ["B", 8], ["B", 8]],
  boucle: [["A", 16], ["B", 16], ["A", 16], ["B", 16]],
};

function buildArrangement(totalWanted, opt = {}) {
  // Structure en blocs de 4 mesures : intro, couplets (A), refrains (B), pont, outro.
  // blocs de 4 mesures, sauf si l'arrondi éloigne trop de la durée demandée (opt.exact : tolérance en mesures)
  const r4 = Math.max(8, Math.round(totalWanted / 4) * 4);
  const total = opt.exact != null && Math.abs(r4 - totalWanted) > opt.exact ? Math.max(8, Math.round(totalWanted)) : r4;
  const intro = opt.intro ?? (total >= 32 ? 4 : 2);
  const outro = opt.outro ?? (total >= 32 ? 4 : 2);
  let body = total - intro - outro;
  const cycle = opt.cycle || DEFAULT_CYCLE;
  const secs = [{ type: "intro", bars: intro }];
  let i = 0;
  while (body > 0) {
    let [type, len, role] = cycle[i % cycle.length];
    if (body < len) {
      if (body < 4 && secs.length > 1) { secs[secs.length - 1].bars += body; body = 0; break; }
      len = body;
    }
    secs.push(role ? { type, bars: len, role } : { type, bars: len });
    body -= len; i++;
  }
  // toujours finir le corps du morceau sur un refrain
  const last = secs[secs.length - 1];
  if (last.type !== "B" && (secs.length > 2 || last.bars <= 4)) last.type = "B";
  for (let k = secs.length - 1; k > 1; k--) if (secs[k].type === secs[k - 1].type && secs[k].role === secs[k - 1].role && secs[k].bars + secs[k - 1].bars <= 12) { secs[k - 1].bars += secs[k].bars; secs.splice(k, 1); }
  if (secs.length === 2 && last.bars >= 8) { const half = Math.floor(last.bars / 8) * 4; secs.splice(1, 1, { type: "A", bars: half }, { type: "B", bars: last.bars - half }); }
  if (outro > 0) secs.push({ type: "outro", bars: outro });
  let bar = 0;
  for (const s of secs) { s.startBar = bar; bar += s.bars; }
  return { sections: secs, totalBars: bar };
}

/**
 * Idiomes d'arrangement par style (jalon 6) :
 *  edm        : forme courte intro → couplet → montée → drop ; silence avant le drop
 *  introGroove: intro « DJ » (grosse caisse dès la 1re mesure, puis charleys)
 *  layers     : entrée progressive des éléments de batterie dans le 1er couplet
 *  preRoll    : roulement avant chaque refrain (clap / caisse claire / toms / charleys)
 *  dropout    : coupure grosse caisse + basse avant le refrain ('beat' = dernier temps, 'half' = demi-mesure, 'break' = toute la batterie 2 temps)
 *  finalLift  : dernier refrain renforcé ('lead8va' = mélodie doublée à l'octave, 'ride' = ride 909, 'boom' = impacts)
 *  keyLift    : probabilité d'une modulation d'un ton (ou demi-ton) au dernier refrain (années 80 / jeux vidéo)
 *  acidAuto   : balayage lent du filtre de la 303 (32 mesures) + motif acid persistant qui mute toutes les 8 mesures
 *  chordSweep : balayage du filtre des accords (house filtrée, 16 mesures)
 *  breathe    : respiration lente des nappes (ambient)
 *  arpOpen    : arpège filtré qui s'ouvre pendant l'intro (synthwave)
 *  layBack    : caisse claire en retard (jeu « paresseux » lo-fi, en temps)
 *  loopMelody : mélodie en boucle de 2 mesures sans transposition (trap)
 *  echoLead   : écho de mélodie à la croche pointée (canal 8-bit)
 *  crescendo  : crescendo à l'intérieur des couplets / montées (cinéma)
 *  introHook  : l'intro annonce le motif du refrain (filtré, plus doux)
 *  fixedArp   : arpèges et motifs « aléatoires » figés en boucle (hypnotique, mémorisable)
 */
export const IDIOMS = {
  techno:    { edm: true, introGroove: true, layers: [['kick', 'hat'], ['kick', 'hat', 'ohat', 'rim']], preRoll: 'clap', dropout: 'half', finalLift: 'ride', acidAuto: true, fixedArp: true },
  house:     { edm: true, introGroove: true, layers: [['kick', 'hat', 'shaker'], ['kick', 'hat', 'ohat', 'shaker', 'rim']], preRoll: 'clap', dropout: 'beat', finalLift: 'lead8va', chordSweep: true, fixedArp: true },
  synthwave: { layers: [['kick', 'hat']], preRoll: 'snare', dropout: 'beat', finalLift: 'lead8va', keyLift: 0.45, arpOpen: true, fixedArp: true },
  chiptune:  { preRoll: 'snare', finalLift: 'lead8va', keyLift: 0.4, echoLead: true, fixedArp: true, introHook: true },
  trap:      { preRoll: 'hat', dropout: 'half', loopMelody: true, fixedArp: true, introHook: true },
  lofi:      { dropout: 'break', layBack: 0.03, fixedArp: true },
  cinematic: { preRoll: 'tom', finalLift: 'boom', crescendo: true, fixedArp: true },
  ambient:   { breathe: true },
  // hip-hop : forme « beat » (couplets 16 / hooks 8), coupure avant le hook, variations de grosse caisse en fin de phrase
  hiphop_boombap: { form: 'beat', dropout: 'beat', layBack: 0.012, fixedArp: true, introHook: true, barVar: true, scratchFill: true },
  hiphop_lofi:    { form: 'beat', dropout: 'break', layBack: 0.03, fixedArp: true, barVar: true },
  hiphop_trap:    { form: 'beat', preRoll: 'hat', dropout: 'half', loopMelody: true, fixedArp: true, introHook: true },
  // drum & bass : intro mixable, montée (roulement de caisse), drop, breakdown ; jungle = breaks redécoupés à chaque mesure
  dnb_liquid: { edm: true, form: 'dnb', preRoll: 'snare', dropout: 'half', finalLift: 'ride', fixedArp: true, barVar: true, dnbIntro: true },
  dnb_neuro:  { edm: true, form: 'dnb', preRoll: 'snare', dropout: 'half', fixedArp: true, barVar: true, dnbIntro: true, wobble: true },
  dnb_jungle: { edm: true, form: 'dnb', preRoll: 'snare', dropout: 'break', fixedArp: true, barPick: 0.65, rush: true, dnbIntro: true },
  // v1.8.0 : French Touch — montées par balayage de filtre (événements « fx »), coupure d'un temps avant le drop
  frenchtouch: { edm: true, introGroove: true, layers: [['kick', 'hat'], ['kick', 'hat', 'ohat', 'shaker']], preRoll: 'clap', dropout: 'beat', finalLift: 'lead8va', fixedArp: true, filterSweep: true },
};

// v1.8.0 : boucles d'accords disco (French Touch) : [pas, durée en temps, accent]
const DISCO_CHORDS = [
  [[0, 0.45, 1], [3, 0.4, 0.85], [6, 0.45, 0.95], [10, 0.4, 0.85], [14, 0.45, 0.9]],
  [[2, 0.4, 0.95], [6, 0.4, 0.9], [10, 0.4, 0.95], [14, 0.4, 0.9]],
  [[0, 1.4, 1], [6, 0.4, 0.85], [8, 1.0, 0.95], [14, 0.45, 0.85]],
  [[0, 0.3, 1], [3, 0.3, 0.8], [7, 0.3, 0.85], [10, 0.6, 0.95], [13, 0.3, 0.8]],
];
// accords découpés (boom-bap) : [pas, durée en temps, accent]
const CHOP_PATTERNS = [
  [[0, 1.4, 1], [6, 0.45, 0.8], [10, 1.2, 0.9]],
  [[0, 0.7, 1], [3, 0.4, 0.75], [8, 1.5, 0.95]],
  [[0, 2.2, 1], [10, 0.4, 0.8], [14, 0.45, 0.75]],
  [[0, 0.45, 1], [2, 0.45, 0.7], [7, 1.1, 0.9], [12, 0.9, 0.8]],
];
// reese neuro : [pas, durée, intervalle, accent]
const NEURO_PATTERNS = [
  [[0, 0.7, 0, 1], [3, 0.4, 0, 0], [6, 0.3, 12, 1], [10, 0.9, 0, 1], [14, 0.4, -2, 0]],
  [[0, 1.4, 0, 1], [7, 0.3, 0, 0], [10, 0.5, 0, 1], [13, 0.6, 3, 0]],
  [[0, 0.4, 0, 1], [2, 0.4, 0, 0], [4, 0.9, 7, 1], [10, 0.4, 0, 1], [12, 0.9, -5, 0]],
];
/** Gabarits de groove actifs (hip-hop, drum & bass ; étendu aux autres styles avec le « réalisme »). */
// v1.5 « réalisme » : gabarit de groove (micro-timing par instrument, accents, dynamique par mesure) sur tous les styles
// joués en 4/4 à la double-croche ; la chiptune reste quantifiée (idiome des consoles 8-bit).
export const grooveOn = (P) => {
  if (P.style === 'hiphop' || P.style === 'dnb') return true;
  if (P.style === 'chiptune') return false;
  const MI = meterInfo(P); return MI.bpb === 4 && MI.spb === 16;
};
// notes fantômes de caisse claire : idiomatiques en hip-hop, DnB, lo-fi ; discrètes en synthwave
const GHOST = { hiphop: 1, dnb: 1, lofi: 1, synthwave: 0.45 };

/** Idiomes du profil (style ou style_variante). */
Object.assign(IDIOMS, IDIOMS20); // v1.11.0 : clés lofi_<sous-genre>, atteintes seulement en moteur 20
export const idiomsOf = (P) => IDIOMS[profileKey(P)] || IDIOMS[P.style] || {};
// Formes propres à un genre (utilisées quand la structure est en « auto »)
const FORMS = {
  // instrumental rap : couplets de 16 mesures, refrains (hooks) de 8, pont court
  beat: [["A", 16], ["B", 8], ["A", 16], ["B", 8], ["bridge", 4], ["B", 8]],
  // drum & bass : longue intro mixable, montée, drop de 16-32 mesures, breakdown, second drop
  dnb: [["A", 16], ["A", 8, "build"], ["B", 16, "drop"], ["B", 16, "drop"], ["bridge", 16, "breakdown"], ["A", 8, "build"], ["B", 16, "drop"], ["B", 8, "drop"]],
};

/** Forme des morceaux courts (< 40 mesures) : toujours un vrai refrain (≥ 8 mesures si possible), précédé d'une montée en EDM. */
function shortForm(total, I) {
  const intro = total >= 22 ? 4 : 2, outro = total >= 12 ? 2 : 1;
  const body = total - intro - outro;
  let B = body >= 14 ? 8 : Math.max(4, Math.round(body * 0.5));
  if (body >= 26) B = Math.max(8, Math.round(body * 0.45 / 2) * 2);
  if (B > body) B = body;
  const build = I.edm && body - B >= 6 ? 2 : 0;
  const A = body - B - build;
  const secs = [{ type: 'intro', bars: intro }];
  if (A > 0) secs.push({ type: 'A', bars: A });
  if (build) secs.push({ type: 'A', bars: build, role: 'build' });
  secs.push(I.edm ? { type: 'B', bars: B, role: 'drop' } : { type: 'B', bars: B });
  secs.push({ type: 'outro', bars: outro });
  let bar = 0; for (const x of secs) { x.startBar = bar; bar += x.bars; }
  return { sections: secs, totalBars: bar };
}

const GLIDE_PATCHES = new Set(['brass80', 'bass80', 'analogbass', 'synthlead', 'sawlead', 'square', 'mellow', 'horn', 'strings', 'mooglead', 'arplead', 'talkbox', 'vocoder']);
const SECTION_LABELS = { intro: 'Intro', A: 'Couplet', B: 'Refrain', bridge: 'Pont', outro: 'Outro', build: 'Montée', drop: 'Drop', breakdown: 'Breakdown' };
const INTENSITY = { intro: 0.7, A: 0.85, B: 1, bridge: 0.8, outro: 0.72 };

function parsePattern(str, spb = 16) {
  const out = [];
  for (let i = 0; i < spb; i++) {
    const c = str[i] || '.';
    out.push(c === 'x' ? 1 : c === 'o' ? 0.7 : c === '-' ? 0.35 : 0);
  }
  return out;
}

/** Motif mélodique : rythme sur grille de doubles-croches + marche de Markov sur les degrés. */
function makeMotif(r, cfg, steps, density, startDeg) {
  // motif « cellule » : une idée d'une mesure, répétée puis développée (plus mémorable que des notes au hasard)
  if (cfg.cell && steps >= 24 && !cfg._inner) {
    const half = steps / 2;
    const a = makeMotif(r, { ...cfg, _inner: true, rest: Math.min(0.25, cfg.rest ?? 0.3) }, half, density, startDeg);
    const dev = r.pick(['repeat', 'sequence', 'answer', 'invert']);
    const shift = r.pick([1, -1, 2]);
    const b = a.map((n, i) => {
      let deg = n.deg;
      if (dev === 'sequence') deg += shift;
      else if (dev === 'answer' && i >= a.length - 2) deg = startDeg + r.pick([0, 2, -1]);
      else if (dev === 'invert' && i > 0) deg = a[0].deg - (n.deg - a[0].deg);
      return { ...n, step: n.step + half, deg, acc: n.acc * 0.95 };
    });
    return a.concat(b);
  }
  const notes = [];
  const durOpts = cfg.long ? [2, 4, 6, 8, 12] : [1, 2, 3, 4, 6, 8];
  const baseW = cfg.long ? [1, 3, 2, 3, 1.5] : [0.6, 3, 1.2, 2.2, 0.8, 0.8];
  const dw = baseW.map((w, i) => w * (durOpts[i] <= 2 ? density * 1.6 : 1 / Math.max(0.4, density)));
  const ivals = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
  const leap = cfg.leap ?? 0.25;
  const iw = [0.4 * leap, 0.6 * leap, 1.4 * leap + 0.3, 2.6, 1.1, 2.6, 1.4 * leap + 0.3, 0.6 * leap, 0.4 * leap];
  let pos = 0, deg = startDeg, lastIv = 0;
  while (pos < steps) {
    let len = r.weighted(durOpts, dw);
    if (pos + len > steps) len = steps - pos;
    const restP = (cfg.rest ?? 0.3) * (pos === 0 ? 0.3 : 1);
    if (r() < restP) { pos += len; continue; }
    let w = iw;
    const c = cfg.contour;
    if (c) {
      const b = c === 'arch' ? (pos < steps / 2 ? 0.55 : -0.55) : c === 'wave' ? 0.55 * Math.sin((2 * Math.PI * pos) / 16) : c;
      w = iw.map((x, k) => x * (ivals[k] > 0 ? 1 + b : ivals[k] < 0 ? 1 - b : 1));
    }
    let iv = r.weighted(ivals, w);
    // tendance : après un grand saut, revenir par mouvement conjoint en sens inverse
    if (Math.abs(lastIv) >= 3) iv = -Math.sign(lastIv) * r.pick([1, 1, 2]);
    deg += iv;
    if (deg > 9) deg -= r.pick([2, 3]);
    if (deg < -2) deg += r.pick([2, 3]);
    lastIv = iv;
    notes.push({ step: pos, len, deg, acc: pos % 8 === 0 ? 1 : pos % 4 === 0 ? 0.85 : 0.72 });
    pos += len;
  }
  if (!notes.length) notes.push({ step: 0, len: Math.min(8, steps), deg: startDeg, acc: 1 });
  return notes;
}

/** v1.6.3 : poids des profils de mouvement selon la variation (faible : surtout « plein » ; forte/max : rotation). */
function profileWeight(p, prev, VL) {
  if (VL === 0) return prev.id === p.id && p.id !== 'plein' ? 0.05 : p.w * ({ plein: 2.5, dense: 0.3, epure: 0.6 }[p.id] ?? 0.8);
  if (prev.id === p.id) return VL === 3 ? 0 : 0.05;
  return p.w * (p.id === 'plein' ? (VL === 3 ? 0.4 : 0.65) : VL === 3 ? 1.3 : 1.1);
}
const CHAPTER_PROFILES = [
  // nom, poids, instruments retirés, multiplicateurs densité / intensité
  { id: 'plein', label: 'Plein', w: 4, drop: [], dens: 1, int: 1 },
  { id: 'respiration', label: 'Respiration (sans batterie)', w: 1.4, drop: ['drums'], dens: 0.75, int: 0.85 },
  { id: 'groove', label: 'Groove (sans mélodie)', w: 1.4, drop: ['lead'], dens: 1, int: 0.95 },
  { id: 'epure', label: 'Épuré', w: 1.1, drop: ['arp', 'texture'], dens: 0.8, int: 0.9 },
  { id: 'dense', label: 'Dense', w: 1.2, drop: [], dens: 1.25, int: 1.04 },
  { id: 'nappes', label: 'Nappes (sans basse)', w: 0.8, drop: ['bass', 'drums'], dens: 0.7, int: 0.8 },
];

/**
 * Plan du morceau : paramètres résolus, découpage en mouvements (chapitres) et sections.
 * Un morceau court = un seul mouvement (comportement historique). Au-delà de LONG_FORM_SECONDS,
 * le morceau est découpé en mouvements de 2 min 30 à 4 min : tonalité et tempo stables, mais
 * progressions, motifs, instrumentation, densité et grooves changent ; le thème principal revient régulièrement.
 */
export function planSong(params, opt = {}) {
  const P = resolveParams(params);
  const MX = opt.mix || null; // sous-morceau d'un mix DJ : intro/outro mixables, pas de modulation finale
  const SD = styleDef(P.style, variantOf(P), P.engine);
  const F = makeFlavor(P, SD);
  const S = applyFlavor(SD, F);
  const IDP = idiomsOf(P);
  const steps = SCALES[P.scale].steps;
  const keyPc = NOTE_NAMES.indexOf(P.key);
  const rh = makeRng(hashSeed(P.seed, 'struct', P.style, P.scale, P.key));
  const MI = meterInfo(P);
  const barSec = (60 / P.bpm) * MI.bpb;
  // durée demandée = musique + queue de réverbération finale
  const totalBarsWanted = Math.max(8, Math.round((P.duration - RENDER_TAIL) / barSec));
  const tolBars = (0.015 * P.duration) / barSec; // au-delà de 1,5 % d'écart, on abandonne l'arrondi à 4 mesures
  const chordRoot = 48 + keyPc;
  // grand réservoir de progressions : celles du style (pondérées) + progressions génériques
  const progs = { pick: (r) => r.weighted(F.progPool, F.progW), length: F.progPool.length };
  const cycle = P.adv.structure ? STRUCTURES[P.adv.structure] : IDP.form ? FORMS[IDP.form] : [DEFAULT_CYCLE, ...CHAPTER_CYCLES, STRUCTURES.edm, STRUCTURES.chanson][F.cycleIndex % (CHAPTER_CYCLES.length + 3)];
  let evo = { lente: [240, 360], normale: [150, 240], rapide: [75, 120] }[P.adv.evolution || 'normale'];
  // v1.6.3 : niveau de variation (1 = moyenne = comportement historique, aucun tirage déplacé)
  const VL = varietyOf(P), VX = VL !== 1;
  if (VX && !P.adv.evolution) { const k = [1.4, 1, 0.72, 0.55][VL]; evo = [evo[0] * k, evo[1] * k]; }
  const rmod = VX && VL >= 2 && !MX ? makeRng(hashSeed(P.seed, 'modulation', P.style, P.variation, VL)) : null;
  let tr = 0; // transposition courante des mouvements (demi-tons, ±7 max) — variation forte / maximale

  // Harmonie du premier mouvement
  const progA = progs.pick(rh);
  let progB = progs.pick(rh); let guard = 0;
  while (progB === progA && guard++ < 10) progB = progs.pick(rh);
  const progBridge = rh.chance(0.5) ? progs.pick(rh) : progA.slice().reverse();

  const chapters = [];
  const long = totalBarsWanted * barSec > LONG_FORM_SECONDS;
  const FT19 = isFT19(P);
  if (!long) {
    const { sections, totalBars } = FT19 ? ftForm(totalBarsWanted, MX ? { intro: MX.intro, outro: MX.outro } : {}) : !P.adv.structure && totalBarsWanted < 40 ? shortForm(totalBarsWanted, IDP) : buildArrangement(totalBarsWanted, { cycle, exact: tolBars, ...(MX ? { intro: MX.intro, outro: MX.outro } : {}) });
    chapters.push({ index: 0, startBar: 0, bars: totalBars, sections, progA, progB, progBridge, profile: CHAPTER_PROFILES[0], theme: true, intensity: 1, density: 1 });
  } else {
    const rc = makeRng(hashSeed(P.seed, 'chapters', P.style, P.scale, P.key));
    let remaining = totalBarsWanted, start = 0, i = 0, prev = null;
    while (remaining > 0) {
      let len = Math.max(16, Math.round(rc.range(evo[0], evo[1]) / barSec / 4) * 4);
      if (remaining - len < (VX ? Math.max(24, (MX ? MX.outro : 4) + 16) : 16)) len = remaining;
      const first = i === 0, last = remaining - len <= 0;
      const arr = FT19 ? ftForm(len, { first, last, ...(MX && first ? { intro: MX.intro } : {}), ...(MX && last ? { outro: MX.outro } : {}) }) : buildArrangement(len, {
        intro: first ? (MX ? MX.intro : 4) : (len >= 64 && rc.chance(0.5) ? 8 : 4), outro: last ? (MX ? MX.outro : 4) : 0, exact: last ? 0 : undefined,
        cycle: first || P.adv.structure || (IDP.form && rc.chance(0.6)) ? cycle : rc.pick(CHAPTER_CYCLES),
      });
      let ch;
      if (first) ch = { progA, progB, progBridge, profile: CHAPTER_PROFILES[0], theme: true, intensity: 1, density: 1 };
      else {
        // continuité : le refrain du mouvement précédent devient parfois le couplet du suivant
        const pA = rc.chance(VX ? [0.75, 0.45, 0.25, 0.1][VL] : 0.45) ? prev.progB : progs.pick(rc);
        let pB = progs.pick(rc); let g = 0; while (pB === pA && g++ < 10) pB = progs.pick(rc);
        const pBr = rc.chance(0.5) ? progs.pick(rc) : pA.slice().reverse();
        const profile = last ? CHAPTER_PROFILES[0] : rc.weighted(CHAPTER_PROFILES, CHAPTER_PROFILES.map((p) => (VX ? profileWeight(p, prev.profile, VL) : prev.profile.id === p.id && p.id !== 'plein' ? 0.1 : p.w)));
        const theme = !VX ? last || (i % 3 === 0 && rc.chance(0.8)) || rc.chance(0.15)
          : VL === 0 ? last || (i % 2 === 0 && rc.chance(0.9)) || rc.chance(0.3) : VL === 2 ? last || (i % 4 === 0 && rc.chance(0.6)) || rc.chance(0.08) : last || rc.chance(0.05);
        ch = { progA: pA, progB: pB, progBridge: pBr, profile, theme, intensity: profile.int * rc.range(0.94, 1.03), density: profile.dens * rc.range(0.85, 1.15) };
        // modulations entre mouvements (retour à la tonalité d'origine au dernier mouvement)
        if (rmod) {
          if (last) tr = 0;
          else if (rmod.chance(VL === 3 ? 0.55 : 0.3)) { const mv = rmod.pick((VL === 3 ? [2, -2, 5, -5, 7, -7, 3, -3] : [2, -2, 5, -5, 7, -7]).filter((m) => Math.abs(tr + m) <= 7 && tr + m !== 0)); tr += mv || 0; }
          if (tr) ch.transpose = tr;
        }
      }
      const sections = arr.sections.map((s) => ({ ...s, startBar: s.startBar }));
      if (!first) sections[0].transition = true;
      chapters.push({ index: i, startBar: start, bars: arr.totalBars, sections, ...ch });
      prev = chapters[chapters.length - 1];
      // v1.6.3 (hors Moyenne) : l'arrondi d'un mouvement est rattrapé par les suivants => durée exacte (mesures d'un titre de mix alignées)
      start += arr.totalBars; remaining -= VX ? arr.totalBars : len; i++;
    }
  }
  const totalBars = chapters.reduce((a, c) => a + c.bars, 0);
  const progressionNames = (prog) => prog.map((d) => chordName(steps, chordRoot, d, S.chordSize));
  const allSections = [];
  for (const c of chapters) for (const s of c.sections) allSections.push({ type: s.type, label: s.transition ? 'Transition' : (s.ft && FT_LABELS[s.ft]) || SECTION_LABELS[s.role || s.type], startBar: c.startBar + s.startBar, bars: s.bars, chapter: c.index });
  return {
    params: P, chapters, totalBars, long, S, F, mix: MX,
    meta: {
      styleLabel: S.label,
      keyLabel: `${NOTE_NAMES_FR[keyPc]} ${SCALES[P.scale].label.toLowerCase()}`,
      scaleLabel: SCALES[P.scale].label,
      moodLabel: MOODS[P.mood].label,
      bars: totalBars,
      seconds: totalBars * MI.bpb * 60 / P.bpm,
      meter: MI.meter,
      sections: allSections,
      chapters: chapters.map((c) => ({ index: c.index, label: `Mouvement ${c.index + 1}`, profile: c.profile.label, startBar: c.startBar, bars: c.bars, startSec: c.startBar * barSec, structure: c.sections.map((x) => (x.ft && FT_LABELS[x.ft]) || SECTION_LABELS[x.role || x.type]).join(' · '), progressionA: progressionNames(c.progA), theme: !!c.theme, ...(c.transpose ? { transpose: c.transpose, keyLabel: `${NOTE_NAMES_FR[(keyPc + c.transpose + 12) % 12]} ${SCALES[P.scale].label.toLowerCase()}` } : {}) })),
      progressions: { A: progressionNames(progA), B: progressionNames(progB), bridge: progressionNames(progBridge) },
      recipe: describeFlavor(F),
    },
  };
}

/**
 * Génère les événements d'un mouvement (temps absolus en temps, triés).
 * `state` est partagé entre mouvements successifs (conduite des voix des accords).
 */
/** v1.6.3 : mutation déterministe d'un motif de batterie analysé (charleston / grosse caisse hors temps forts). */
function mutateDrums(parsed, r, n) {
  const o = {}; for (const k of Object.keys(parsed)) o[k] = parsed[k].slice();
  for (let q = 0; q < n; q++) {
    const kind = r.pick(['hat', 'hat', 'kick', 'shaker', 'hat']);
    const arr = o[kind]; if (!arr) continue;
    if (kind === 'kick') { const st = r.pick([3, 6, 7, 10, 11, 13, 14]); if (o.snare?.[st] || o.clap?.[st]) continue; arr[st] = arr[st] ? 0 : 0.62; }
    else { const st = r.int(0, 7) * 2 + 1; arr[st] = arr[st] ? 0 : 0.42; }
  }
  return o;
}
export function composeChapter(plan, ci, state = {}) {
  if (isFT19(plan.params)) return composeFrenchTouch(plan, ci, state);
  const P = plan.params;
  const S = plan.S;
  const M = MOODS[P.mood];
  const MI = meterInfo(P), BPB = MI.bpb, SPB = MI.spb;
  const ADV = P.adv || {};
  const HUM = (ADV.humanize ?? 50) / 50;
  const E = ADV.energy == null ? 1 : 0.75 + ADV.energy / 200;
  const steps = SCALES[P.scale].steps;
  const keyPc = NOTE_NAMES.indexOf(P.key);
  const C = plan.chapters[ci];
  const isFinalChapter = ci === plan.chapters.length - 1;
  const rd = ci === 0 ? makeRng(hashSeed(P.seed, 'detail', P.variation, P.style)) : makeRng(hashSeed(P.seed, 'detail', P.variation, P.style, 'ch', ci));
  const density = (M.density || 1) * C.density;
  const sections = C.sections;
  const totalBars = C.bars;
  const progFor = { intro: C.progA, A: C.progA, B: C.progB, bridge: C.progBridge, outro: C.progA };

  const ID = idiomsOf(P);
  const L20 = isLofi20(P);
  const RET = S.retro || null, LEG = !!(RET && RET.legato); // synthwave 80s : jeu lié
  // techno « jouée » : batterie 909 qui mute en continu + stabs Detroit (4/4 uniquement)
  const JAM = P.style === 'techno' && BPB === 4 && SPB === 16 ? makeTechnoJam(P, ci, P.technoStyle || 'detroit') : null;
  const ra = makeRng(hashSeed(P.seed, 'arrange', P.variation, P.style, ci)); // décisions d'arrangement (n'altère pas le flux « detail »)
  // gabarit de groove (swing + micro-timing par instrument + accents) : flux aléatoire séparé
  const GV = grooveOn(P) ? grooveFor(profileKey(P), P.style) : null;
  const rgv = makeRng(hashSeed(P.seed, 'grooveTiming', P.variation, profileKey(P), ci));
  const nextSec = (si) => sections[si + 1] || null;
  const lastBIdx = sections.map((x) => x.type).lastIndexOf('B');
  const gaps = []; // silences avant refrain : [début, fin, 'kb' (grosse caisse + basse) | 'drums']
  // motif acid persistant : une mesure de 303, qui mute de 1-2 pas toutes les 8 mesures
  const acidBase = []; for (let st = 0; st < SPB; st++) acidBase.push({ g: st % 4 === 0 || ra.chance(0.45), iv: ra.weighted([0, 12, 7, 3, 10, -12], [5, 2, 1.5, 1, 1, 0.7]), acc: ra.chance(0.3), slide: ra.chance(0.2) });
  const acidCache = [acidBase];
  const acidAt = (bar) => {
    const k = Math.floor(bar / 8);
    for (let j = acidCache.length; j <= k; j++) {
      const p = acidCache[j - 1].map((x) => ({ ...x })), rm = makeRng(hashSeed(P.seed, 'acid', P.variation, ci, j));
      for (let q = rm.int(1, 2); q > 0; q--) { const st = rm.int(1, SPB - 1); if (st % 4) p[st].g = !p[st].g; else p[st].acc = !p[st].acc; if (rm.chance(0.3)) p[st].iv = rm.pick([0, 12, 7, 3]); }
      acidCache[j] = p;
    }
    return acidCache[k];
  };
  // arpège « aléatoire » figé : suite d'indices dans les notes de l'accord (suit l'harmonie, se répète)
  const arpIdx = Array.from({ length: 16 }, () => ra.int(0, 5));
  const arpMask = Array.from({ length: 16 }, () => ra());
  // modulation du dernier refrain
  const finalB = isFinalChapter && lastBIdx >= 0 && sections[lastBIdx].bars >= 8 && plan.chapters.length === 1 && P.adv.structure !== 'boucle' ? sections[lastBIdx] : null;
  const MX = plan.mix || null;
  // v1.6.3 : variation (VL 1 = moyenne = historique ; flux « rv » séparé, créé seulement hors moyenne)
  const VL = varietyOf(P), VX = VL !== 1;
  const rv = VX ? makeRng(hashSeed(P.seed, 'variety', P.variation, P.style, VL, ci)) : null;
  const klP = !VX ? ID.keyLift : VL === 0 ? 0 : Math.max(ID.keyLift || 0, VL === 3 ? 0.65 : 0.4);
  const keyLift = !MX && klP && finalB && ra.chance(klP) ? ra.pick([2, 2, 1]) : 0;

  const chordRoot = 48 + keyPc;
  const barChord = [];
  for (const s of sections) {
    const prog = progFor[s.type];
    // variation forte / maximale : la seconde moitié des longues sections reprend la progression décalée (autre enchaînement)
    const rot = VX && VL >= 2 && (s.type === 'A' || s.type === 'B') && s.bars >= (VL === 3 ? 8 : 16) && prog.length > 1 && rv.chance(VL === 3 ? 0.8 : 0.5) ? rv.int(1, prog.length - 1) : 0;
    for (let b = 0; b < s.bars; b++) barChord.push(prog[(Math.floor(b / S.chordBars) + (rot && b >= s.bars / 2 ? rot : 0)) % prog.length]);
  }
  if (isFinalChapter) {
    barChord[totalBars - 1] = 0;
    if (totalBars > 1 && sections[sections.length - 1].bars >= 2) barChord[totalBars - 2] = C.progA[C.progA.length - 1] === 0 ? 4 : C.progA[C.progA.length - 1];
  }

  const ev = [];
  const swing = S.swing || 0;
  // v1.12.0 (moteur 21) : harmonie juste (docs/THEORIE.md) ; les moteurs ≤ 20 restent identiques à l'octet près
  const E21 = P.engine >= 21 || !!P.harmonyFix; // v1.12.0 : harmonie juste (moteur 21, ou ancien moteur régénéré)
  // lo-fi jazzy (moteur 21) : swing de croches (ternaire) au lieu du swing de doubles-croches
  const SW8 = E21 && P.style === 'lofi' && P.lofiStyle === 'jazzy' && !MI.compound && SPB === BPB * 4;
  const stepT = SW8
    ? (bar, step) => { const q = Math.floor(step / 4), p = (step % 4) / 4, d = swing * 0.5; return bar * BPB + q + (p < 0.5 ? p * (0.5 + d) / 0.5 : 0.5 + d + (p - 0.5) * (0.5 - d) / 0.5); }
    : (bar, step) => bar * BPB + step / 4 + (step % 2 === 1 && !MI.compound ? swing * 0.25 : 0);
  // harmonique mineure (moteur 21) : la sensible seulement sur V et vii° ; les autres degrés en mineur naturel (plus de III+)
  const NAT = SCALES.minor.steps;
  const chSteps = (deg) => (E21 && P.scale === 'harmonic_minor' && ![4, 6].includes(((deg % 7) + 7) % 7) ? NAT : steps);
  const barPcs = []; // classes de hauteur de l'accord réellement joué (moteur 21 : mélodie calée dessus)
  const on = { ...P.instruments };
  for (const k of C.profile.drop) on[k] = false;
  if (ADV.melody === 'off') on.lead = false;
  const leadVel = ADV.melody === 'discrete' ? 0.62 : ADV.melody === 'forward' ? 1.15 : 1;
  // garder au moins un instrument mélodique/harmonique actif
  if (!['chords', 'lead', 'arp', 'bass'].some((k) => on[k])) for (const k of ['chords', 'lead', 'bass', 'arp']) if (P.instruments[k]) { on[k] = true; break; }
  if (!Object.values(on).some(Boolean)) Object.assign(on, P.instruments);

  // --- motifs : le premier mouvement fixe le « thème » ; les suivants en créent de nouveaux ou le reprennent
  const mcfg = S.melody;
  const mk = (r, dens, start) => makeMotif(r, mcfg, 2 * SPB, dens, start);
  let motifA, motifB, answerA, answerB;
  const fresh = () => [
    mk(rd, mcfg.density * density, rd.pick([0, 2, 4])),
    mk(rd, Math.min(1, mcfg.density * density * 1.2), rd.pick([2, 4, 7])),
    mk(rd, mcfg.density * density, 2),
    mk(rd, mcfg.density * density, 4),
  ];
  if (ci === 0) { [motifA, motifB, answerA, answerB] = fresh(); }
  else {
    const own = fresh();
    if (C.theme) {
      const r0 = makeRng(hashSeed(P.seed, 'detail', P.variation, P.style));
      const d0 = (M.density || 1);
      const theme = [mk(r0, mcfg.density * d0, r0.pick([0, 2, 4])), mk(r0, Math.min(1, mcfg.density * d0 * 1.2), r0.pick([2, 4, 7]))];
      [motifA, motifB, answerA, answerB] = [own[0], theme[1], own[2], own[3]];
      if (rd.chance(0.5)) motifA = theme[0];
    } else [motifA, motifB, answerA, answerB] = own;
  }
  const penta = mcfg.penta ? PENTA_DEGREES[P.scale] : null;
  const leadBase = 12 * (S.leadOct + 1) + keyPc;

  function snapDeg(deg, chordDeg, strong) {
    const ct = [chordDeg, chordDeg + 2, chordDeg + 4];
    if (strong) {
      let best = deg, bd = 99;
      for (const c of ct) for (let o = -14; o <= 14; o += 7) { const d = c + o; if (Math.abs(d - deg) < bd) { bd = Math.abs(d - deg); best = d; } }
      return best;
    }
    if (penta) {
      const pc = ((deg % 7) + 7) % 7;
      if (!penta.includes(pc)) {
        const isCt = ct.some((c) => (((c % 7) + 7) % 7) === pc);
        if (!isCt) return deg + (rd.chance(0.5) ? 1 : -1);
      }
    }
    return deg;
  }

  const lastNote = {};
  const chordPcs = (bar) => { const dg = barChord[bar] ?? 0, ch = chordMidis(chSteps(dg), 48 + keyPc, dg, 3); if (RET?.majIV && ((dg % 7) + 7) % 7 === 3 && /minor/.test(P.scale)) ch[1] += 1; return ch.map((x) => x % 12); };
  function placeMelody(notes, bar0, shiftDeg, velMul, inst = 'lead', octShift = 0, ending = false) {
    notes.forEach((n, i) => {
      const bar = bar0 + Math.floor(n.step / SPB);
      if (bar >= totalBars) return;
      const st = n.step % SPB;
      const cd = barChord[bar];
      const strong = st % 8 === 0 || n.len >= 6;
      let deg = snapDeg(n.deg + shiftDeg, cd, strong);
      let len = n.len;
      if (ending && i === notes.length - 1) { deg = Math.round(deg / 7) * 7 + (cd % 7 === 0 ? 0 : cd); len = Math.max(len, 8); }
      let m = degreeToMidi(steps, leadBase + 12 * octShift, deg);
      // moteur 21 : une note faible d'une croche ou plus, à un demi-ton d'une note de l'accord joué, se pose sur l'accord
      if (E21 && !strong && len >= 2) {
        const pcs = barPcs[bar] || chordPcs(bar), pc = ((m % 12) + 12) % 12;
        if (!pcs.includes(pc) && pcs.some((q) => (pc - q + 12) % 12 === 1 || (q - pc + 12) % 12 === 1)) { deg = snapDeg(deg, cd, true); m = degreeToMidi(steps, leadBase + 12 * octShift, deg); }
        const pc2 = ((m % 12) + 12) % 12;
        if (pcs.length && !pcs.includes(pc2) && pcs.some((q) => (pc2 - q + 12) % 12 === 1 || (q - pc2 + 12) % 12 === 1)) { // accord altéré (IV majeur emprunté…) : note de l'accord la plus proche
          let best = m, bd = 99; for (const q of pcs) for (const o of [-12, 0, 12]) { const c = m - pc2 + q + o; if (Math.abs(c - m) < bd) { bd = Math.abs(c - m); best = c; } } m = best;
        }
      }
      const e = { inst, t: stepT(bar, st), d: (len / 4) * (LEG ? 1.06 : 0.92) + (LEG ? 0.03 : 0), m, v: n.acc * velMul * (0.92 + rd() * 0.12) };
      // portamento (legato) sur les leads de synthé
      const pl = lastNote[inst];
      if (GLIDE_PATCHES.has(S.patches[inst]) && pl && e.t - pl.end < (LEG ? 0.6 : 0.3) && e.t > pl.t && Math.abs(m - pl.m) <= (LEG ? 9 : 7) && m !== pl.m && rd.chance(LEG ? 0.6 : 0.55)) e.port = pl.m;
      lastNote[inst] = { t: e.t, end: e.t + e.d, m };
      ev.push(e);
    });
  }

  let prevVoicing = state.prevVoicing || null;
  for (let si = 0; si < sections.length; si++) {
    const s = sections[si];
    const role = s.role || null;
    const I = INTENSITY[role === 'drop' ? 'B' : role === 'build' ? 'A' : s.type] * C.intensity * E * (role === 'drop' ? 1.06 : role === 'breakdown' ? 0.85 : 1);
    const isLast = si === sections.length - 1 && isFinalChapter;
    const nextType = sections[si + 1]?.type ?? (isFinalChapter ? undefined : 'intro');
    const preB = nextType === 'B' && s.bars >= 2; // section qui précède un refrain : tension
    const isFinalB = isFinalChapter && si === lastBIdx;
    const firstA = s.type === 'A' && !role && !sections.slice(0, si).some((x) => x.type === 'A');
    const secEnd = (s.startBar + s.bars) * BPB;
    if (preB && ID.dropout) {
      const len = ID.dropout === 'half' ? BPB / 2 : ID.dropout === 'break' ? 2 : 1;
      gaps.push([secEnd - len, secEnd, ID.dropout === 'break' ? 'drums' : 'kb']);
    }

    // ----- ACCORDS
    const stabPat = rd.pick([[[2, 0.45], [6, 0.45], [10, 0.5]], [[3, 0.4], [6, 0.5], [10, 0.4], [13, 0.4]], [[3, 0.35], [10, 0.4]]]);
    const chopPat = S.chordStyle === 'chop' ? ra.pick(CHOP_PATTERNS) : null;
    const discoPat = S.chordStyle === 'disco' ? ra.pick(DISCO_CHORDS) : null;
    const neuroPat = S.bassStyle === 'neuro' ? ra.pick(NEURO_PATTERNS) : null;
    if (on.chords) {
      for (let b = 0; b < s.bars; b++) {
        const bar = s.startBar + b;
        const deg = barChord[bar];
        const newChord = b % S.chordBars === 0 || barChord[bar] !== barChord[bar - 1];
        let chord = chordMidis(chSteps(deg), chordRoot, deg, S.chordSize);
        if (RET) { // vocabulaire 80s : IV majeur en mineur, sus2/sus4, add9 (tirage stable par accord)
          const dg = ((deg % 7) + 7) % 7, cr = makeRng(hashSeed(P.seed, 'retroChord', C.startBar + bar, deg))();
          if (RET.majIV && dg === 3 && /minor/.test(P.scale)) chord[1] += 1;
          else if (cr < RET.color * 0.35) chord[1] = degreeToMidi(steps, chordRoot, deg + 1);
          else if (cr < RET.color * 0.55 && dg !== 6) chord[1] = degreeToMidi(steps, chordRoot, deg + 3);
          else if (cr < RET.color && chord.length >= 4) chord[3] = degreeToMidi(steps, chordRoot, deg + 8);
        }
        if (S.jazz) chord = jazzVoice(chord, steps, chordRoot, deg, makeRng(hashSeed(P.seed, 'lofiJazz', C.startBar + bar, deg)));
        const voicing = E21 ? voiceLead(chord, prevVoicing, S.chordRange[0], S.chordRange[1], { aligned: true, parallels: P.style === 'ambient' ? 0 : 3 }) : voiceLead(chord, prevVoicing, S.chordRange[0], S.chordRange[1]);
        prevVoicing = voicing;
        if (E21) barPcs[bar] = [...new Set(voicing.map((m) => ((m % 12) + 12) % 12))];
        const vel = 0.55 * I;
        if (JAM && S.chordStyle === 'dstab') { if (s.type !== 'outro' || b < s.bars / 2) technoStabs(JAM, { s, I, stepT, ev, SPB }, voicing, bar, C.startBar + bar); continue; }
        if (S.chordStyle === 'sustain') {
          if (!newChord) continue;
          let len = 0; while (b + len < s.bars && (len === 0 || (len < S.chordBars && barChord[bar + len] === deg))) len++;
          const d = len * BPB + (isLast && b + len >= s.bars ? BPB : 0);
          voicing.forEach((m, k) => ev.push({ inst: 'chords', t: bar * BPB + k * 0.006 * HUM, d: LEG ? d + 0.35 : d - 0.05, m, v: vel * (k === voicing.length - 1 ? 1.05 : 0.95) }));
        } else if (S.chordStyle === 'strum') {
          const hits = (s.type === 'B' && rd.chance(0.6) ? [[0, 2.4], [2.5, 1.4]] : [[0, 3.8]]).map(([o, d]) => [o * BPB / 4, d * BPB / 4]);
          for (const [o, d] of hits) voicing.forEach((m, k) => ev.push({ inst: 'chords', t: bar * BPB + o + k * 0.03 * (0.6 + 0.4 * HUM) + (E21 ? 0 : swing * 0.1), d: (isLast && b === s.bars - 1) ? d + BPB : d, m, v: vel * (o ? 0.8 : 1) }));
        } else if (S.chordStyle === 'stabs') {
          const pat = s.type === 'B' ? [[2, 0.45], [6, 0.45], [10, 0.45], [14, 0.4]] : stabPat;
          if (s.type === 'intro' || s.type === 'outro' || s.type === 'bridge') {
            voicing.forEach((m) => ev.push({ inst: 'chords', t: bar * BPB, d: BPB - 0.2, m, v: vel * 0.7, soft: true }));
          } else for (const [st, d] of pat.filter(([x]) => x < SPB)) voicing.forEach((m) => ev.push({ inst: 'chords', t: stepT(bar, st), d, m, v: vel }));
        } else if (S.chordStyle === 'chop') {
          // accords « samplés » et redécoupés à la MPC : coups courts sur un motif fixé par section
          if (s.type === 'intro' || s.type === 'outro') { if (newChord) voicing.forEach((m, k) => ev.push({ inst: 'chords', t: bar * BPB + k * 0.01, d: BPB * Math.min(S.chordBars, 2) - 0.1, m, v: vel * 0.8 })); continue; }
          for (const [st, d, a] of chopPat.filter(([x]) => x < SPB)) voicing.forEach((m, k) => ev.push({ inst: 'chords', t: stepT(bar, st) + k * 0.004, d, m, v: vel * a * (k === voicing.length - 1 ? 1.05 : 0.95) }));
        } else if (S.chordStyle === 'disco') {
          // boucle disco « samplée » : accords syncopés rejoués à l'identique (c'est le filtre qui fait évoluer la boucle)
          for (const [st, d, a] of discoPat.filter(([x]) => x < SPB)) voicing.forEach((m, k) => ev.push({ inst: 'chords', t: stepT(bar, st) + k * 0.003, d, m, v: vel * a * (s.type === 'intro' || s.type === 'outro' ? 0.85 : 1) }));
        } else if (S.chordStyle === 'chiparp') {
          const tones = voicing.concat([voicing[0] + 12]);
          for (let st = 0; st < SPB; st++) {
            if (s.type === 'intro' && st % 2) continue;
            ev.push({ inst: 'chords', t: stepT(bar, st), d: 0.22, m: tones[st % tones.length], v: vel * 0.8 });
          }
        }
      }
    }

    // ----- BASSE
    const bassActive = on.bass && (s.type !== 'intro') && role !== 'breakdown';
    if (bassActive) {
      const bassBase = 12 * (S.bassOct + 1) + keyPc;
      const kickPat = parsePattern((S.drums[s.type === 'B' ? 'B' : 'A'][0].kick) || 'x.......x.......', SPB);
      const barsHere = s.type === 'outro' ? Math.ceil(s.bars / 2) : s.bars;
      for (let b = 0; b < barsHere; b++) {
        const bar = s.startBar + b;
        const deg = barChord[bar];
        const root = degreeToMidi(steps, bassBase, deg) - (degreeToMidi(steps, bassBase, deg) - bassBase >= 9 ? 12 : 0);
        const bs = chSteps(deg), fold = degreeToMidi(steps, bassBase, deg) - bassBase >= 9 ? 12 : 0;
        const fifth = degreeToMidi(bs, bassBase, deg + 4) - fold;
        const third = degreeToMidi(bs, bassBase, deg + 2) - fold;
        const nDeg = barChord[bar + 1] ?? 0;
        // moteur 21 : fondamentale suivante repliée comme la fondamentale (plus de saut d'octave avant l'approche)
        const nextRoot = E21 ? degreeToMidi(steps, bassBase, nDeg) - (degreeToMidi(steps, bassBase, nDeg) - bassBase >= 9 ? 12 : 0) : degreeToMidi(steps, bassBase, nDeg);
        const nextBelow = degreeToMidi(steps, bassBase, nDeg - 1) - (nextRoot - degreeToMidi(steps, bassBase, nDeg)), nextAbove = degreeToMidi(steps, bassBase, nDeg + 1) - (nextRoot - degreeToMidi(steps, bassBase, nDeg));
        const v = 0.85 * I;
        const add = (t, d, m, vv = v, extra = {}) => {
          if (LEG) { d = Math.max(d, 0.5) + 0.02; const pb = lastNote.bass; if (pb && pb.m !== m && Math.abs(pb.m - m) <= 12 && t - pb.end < 0.1 && ((m - pb.m) % 12 !== 0 ? rd.chance(0.45) : rd.chance(0.12))) extra = { ...extra, port: pb.m }; lastNote.bass = { m, end: t + d }; }
          ev.push({ inst: 'bass', t, d, m, v: vv, ...extra });
        };
        switch (S.bassStyle) {
          case 'walking':
            if (E21) { // approche : demi-ton sous la fondamentale suivante, ou degré de la gamme au-dessus ; swing de la grille (pas sur le 3e temps)
              add(bar * BPB, 1.6, root);
              add(bar * BPB + 2, 0.9, rd.chance(0.5) ? fifth : third, v * 0.85);
              if (rd.chance(0.7)) add(stepT(bar, SPB - 2), 0.45, rd.chance(0.5) ? nextRoot - 1 : nextAbove, v * 0.7);
              break;
            }
            add(bar * BPB, 1.6, root);
            add(bar * BPB + 2 + swing * 0.25, 0.9, rd.chance(0.5) ? fifth : third, v * 0.85);
            if (rd.chance(0.7)) add(bar * BPB + BPB - 0.5 + swing * 0.25, 0.45, nextRoot + (rd.chance(0.5) ? -1 : 2), v * 0.7);
            break;
          case 'drone':
            if (b % 2 === 0) add(bar * BPB, 2 * BPB - 0.1, root, v * 0.8);
            break;
          case 'eighths':
            for (let e = 0; e < 2 * BPB; e++) add(bar * BPB + e * 0.5, 0.42, (s.type === 'B' && e % 2 === 1) ? root + 12 : root, v * (e % 2 ? 0.75 : 1));
            break;
          case 'offbeat':
            for (let st = 2; st < SPB; st += 4) add(stepT(bar, st), 0.4, root);
            if (rd.chance(0.35)) add(stepT(bar, SPB - 1), 0.2, fifth, v * 0.7);
            break;
          case 'acid':
            for (let st = 0; st < SPB; st++) {
              const a = acidAt(bar)[st]; if (!a.g) continue;
              add(stepT(bar, st), a.slide ? 0.3 : 0.18, root + a.iv, v * (a.acc ? 1 : 0.7), { acc: a.acc });
            }
            break;
          case 'cinema':
            if (s.type === 'B') for (let q = 0; q < 2 * BPB; q++) add(bar * BPB + q * 0.5, 0.45, q % 4 === 3 ? fifth : root, v * (q % 2 ? 0.7 : 0.95));
            else { add(bar * BPB, 1.9, root); add(bar * BPB + 2, 1.9, rd.chance(0.5) ? fifth : root, v * 0.85); }
            break;
          case 'octave':
            for (let e = 0; e < 2 * BPB; e++) add(bar * BPB + e * 0.5, 0.4, e % 2 ? root + 12 : root, v * 0.9);
            break;
          case '808': {
            const hits = []; kickPat.forEach((k, st) => { if (k > 0) hits.push(st); });
            if (s.type === 'bridge') { add(bar * BPB, BPB - 0.2, root, v); break; }
            hits.forEach((st, i) => {
              const endSt = i + 1 < hits.length ? hits[i + 1] : 16;
              const glide = i === hits.length - 1 && rd.chance(0.35) ? root + rd.pick([12, 7, -5]) : undefined;
              add(stepT(bar, st), Math.max(0.5, (endSt - st) / 4 - 0.05), root, v, glide !== undefined ? { glide } : {});
            });
            break;
          }
          case 'boom': {
            // boom-bap : la basse double la grosse caisse et tient jusqu'au coup suivant
            const hits = []; kickPat.forEach((k, st) => { if (k > 0) hits.push(st); });
            if (s.type === 'bridge' || !hits.length) { add(bar * BPB, BPB - 0.2, root, v * 0.9); break; }
            hits.forEach((st, i) => {
              const endSt = i + 1 < hits.length ? hits[i + 1] : 16;
              const m = i === hits.length - 1 && hits.length > 2 && rd.chance(0.3) ? rd.pick([fifth, root + 12, third]) : root;
              add(stepT(bar, st), Math.max(0.3, (endSt - st) / 4 - 0.12), m, v * (i === 0 ? 1 : 0.86));
            });
            break;
          }
          case 'roller': {
            // drum & bass « rolling » : sub tenu sur 1 et « 3 et », relance en fin de mesure dans les drops
            const hits = [0, 10].filter((x) => x < SPB);
            hits.forEach((st, i) => add(stepT(bar, st), Math.max(0.4, ((hits[i + 1] ?? SPB) - st) / 4 - 0.06), i === 1 && b % 4 === 3 ? fifth : root, v * (i ? 0.88 : 1)));
            if ((s.type === 'B' || role === 'drop') && rd.chance(0.45)) add(stepT(bar, 14), 0.4, rd.chance(0.5) ? root + 12 : third, v * 0.7);
            break;
          }
          case 'neuro': {
            // reese rythmique : motif de gates fixé par section, accents qui ouvrent le filtre
            for (const [st, d, iv, acc] of neuroPat.filter(([x]) => x < SPB)) add(stepT(bar, st), d, root + iv, v * (acc ? 1 : 0.78), { acc: !!acc, wob: s.type === 'B' || role === 'drop' ? 0.5 : 1 });
            break;
          }
          case 'jungle': {
            // sub jungle : notes longues, glissés vers l'octave ou la quinte
            add(bar * BPB, 2.4, root, v, b % 2 === 1 && rd.chance(0.5) ? { glide: rd.pick([root + 12, fifth]) } : {});
            add(bar * BPB + 2.5, 1.4, rd.chance(0.6) ? root : fifth, v * 0.85);
            break;
          }
          case 'disco': {
            // basse disco : octaves en croches, notes de passage chromatiques vers l'accord suivant en fin de mesure
            for (let st = 0; st < SPB; st += 2) {
              const up = st % 4 === 2;
              if (st === 14 && b % 2 === 1 && nextRoot !== root) { const dir = nextRoot > root ? -1 : 1; add(stepT(bar, 14), 0.22, E21 ? (dir < 0 ? nextBelow : nextAbove) : nextRoot + 2 * dir, v * 0.8); add(stepT(bar, 15), 0.2, nextRoot + dir, v * 0.65); continue; }
              add(stepT(bar, st), up ? 0.22 : 0.36, up ? root + 12 : st === 8 && rd.chance(0.3) ? fifth : root, v * (up ? 0.78 : 1));
            }
            break;
          }
          default: add(bar * BPB, BPB - 0.1, root);
        }
      }
    }

    // ----- MÉLODIE
    const hookIntro = ID.introHook && s.type === 'intro' && ci === 0 && s.bars >= 2;
    if (on.lead && (((s.type === 'A' || s.type === 'B' || s.type === 'bridge') && role !== 'build') || hookIntro)) {
      const motif = s.type === 'B' || hookIntro ? motifB : motifA;
      const answer = s.type === 'B' || hookIntro ? answerB : answerA;
      const shiftSeq = ID.loopMelody ? (rd(), 0) : rd.pick([0, 1, 2, -1, 3]);
      for (let ph = 0; ph < s.bars; ph += 2) {
        const rep = ph / 2;
        if (s.type === 'bridge' && rep % 2 === 1) continue;
        if (s.type === 'A' && rep === 0 && rd.chance(0.35)) continue; // laisser respirer
        const isEnd = ph + 2 >= s.bars;
        const notes = rep % 4 === 3 || (isEnd && rep > 0) ? answer : motif;
        const shift = rep % 4 === 1 ? shiftSeq : VX && VL >= 2 && rep % 4 === 2 && !ID.loopMelody && rv.chance(VL === 3 ? 0.85 : 0.5) ? rv.pick([2, -2, 4, 1, -3]) : 0;
        // appel / réponse : la réponse est parfois confiée aux arpèges (octave au-dessus)
        if (on.arp && notes === answer && !isEnd && rd.chance(VX ? [0.25, 0.5, 0.65, 0.75][VL] : 0.5)) placeMelody(notes, s.startBar + ph, shift, 0.62 * I, 'arp', 1, false);
        else placeMelody(notes, s.startBar + ph, shift, 0.8 * I * leadVel * (hookIntro ? 0.75 : 1), 'lead', s.type === 'bridge' ? 1 : 0, isEnd);
      }
      // dernier refrain : mélodie doublée à l'octave supérieure (plus d'éclat, sans nouvelle idée)
      if (isFinalB && ID.finalLift === 'lead8va') {
        const t0 = s.startBar * BPB, dbl = ev.filter((e) => e.inst === 'lead' && e.t >= t0 && e.t < secEnd && !e.dbl);
        for (const e of dbl) ev.push({ ...e, m: e.m + 12, v: e.v * 0.42, port: e.port != null ? e.port + 12 : undefined, dbl: true });
      }
    }

    // ----- ARPÈGES
    const arpActive = on.arp && (s.type === 'B' || s.type === 'bridge' || (s.type === 'A' && S.defaults.arp) || (s.type === 'intro' && S.defaults.arp));
    if (arpActive) {
      const A = S.arp;
      const per = (A.rate === 16 ? 4 : 2) * BPB;
      for (let b = 0; b < s.bars; b++) {
        const bar = s.startBar + b;
        const chord = chordMidis(chSteps(barChord[bar]), chordRoot + 12, barChord[bar], 3);
        if (E21 && RET?.majIV && ((barChord[bar] % 7) + 7) % 7 === 3 && /minor/.test(P.scale)) chord[1] += 1; // arpège = accord joué (IV majeur)
        const tones = chord.concat(chord.map((m) => m + 12));
        const seq = A.mode === 'up' ? tones : A.mode === 'updown' ? tones.concat(tones.slice(1, -1).reverse()) : A.mode === 'ostinato' ? [chord[0], chord[2], chord[0] + 12, chord[2]] : null;
        for (let i = 0; i < per; i++) {
          if (A.sparse && (ID.fixedArp ? arpMask[i % 16] : rd()) < A.sparse) continue;
          if (s.type === 'intro' && i % 2) continue;
          const st = i * (SPB / per);
          const m = seq ? seq[i % seq.length] : ID.fixedArp ? tones[arpIdx[i % 16] % tones.length] : rd.pick(tones);
          ev.push({ inst: 'arp', t: stepT(bar, st), d: (SPB / per) / 4 * (LEG ? 0.95 : 0.7), m, v: 0.55 * I * (i % 4 === 0 ? 1 : 0.8) });
        }
      }
    }

    // ----- BATTERIE
    if (on.drums && JAM) technoDrums(JAM, { s, role, I, SPB, BPB, stepT, rd, HUM, ev, preB, nextType, isFinalB, gbar0: C.startBar });
    else if (on.drums) {
      const useB = s.type === 'B' || (ADV.energy != null && ADV.energy >= 75 && s.type === 'A' && rd.chance(0.5));
      const variants = S.drums[useB ? 'B' : 'A'];
      let pat = rd.pick(variants);
      if (VX && VL === 0) pat = variants[hashSeed(P.seed, 'steadyKit', useB ? 1 : 0) % variants.length]; // faible : même rythme d'une section à l'autre
      const parseP = (pt) => { const o = {}; for (const k of Object.keys(pt)) o[k] = parsePattern(pt[k], SPB); if (role === 'build') { for (const k of Object.keys(o)) if (k !== 'kick' && k !== 'hat') delete o[k]; } return o; };
      let parsed0 = parseP(pat);
      // forte / maximale : autre variante ou motif muté toutes les 8 (forte) / 4 (maximale) mesures
      const phraseLen = VL === 3 ? 4 : 8, phrases = VX && VL >= 2 && SPB === 16 && role !== 'build' ? [] : null;
      if (phrases) for (let ph = 0; ph * phraseLen < s.bars; ph++) phrases.push(ph === 0 ? parsed0 : mutateDrums(rv.chance(VL === 3 ? 0.5 : 0.35) ? parseP(rv.pick(variants)) : parsed0, rv, VL === 3 ? 3 : 2));
      const parsedAll = ID.barPick ? variants.map(parseP) : null;
      const trapRolls = [[ra.pick([1, 3])], [BPB - 1], [ra.pick([1, 2])], [BPB - 2, BPB - 1]], trapRollN = [ra.pick([3, 6]), ra.pick([4, 6]), 3, 8];
      for (let b = 0; b < s.bars; b++) {
        const bar = s.startBar + b;
        const lastBar = b === s.bars - 1;
        if (role === 'breakdown' && b < s.bars - 1) continue;
        // roulement de tension avant le refrain (dernière mesure)
        if (lastBar && preB && role !== 'build' && ID.preRoll) {
          const k = ID.preRoll, from = k === 'hat' ? BPB - 1 : BPB - 2, n = k === 'hat' ? 8 : k === 'tom' ? 6 : 8;
          for (let q = 0; q < n; q++) ev.push({ inst: 'drums', kind: k === 'tom' ? (q < 2 ? 'tomh' : q < 4 ? 'tomm' : 'toml') : k, t: bar * BPB + from + q * ((BPB - from) / n), v: 0.35 + 0.6 * (q / n) });
        }
        if (isFinalB && ID.finalLift === 'ride') for (const st of [2, 6, 10, 14]) if (st < SPB) ev.push({ inst: 'drums', kind: 'ride', t: stepT(bar, st), v: 0.55 * I * (st % 8 === 2 ? 1 : 0.85) });
        if (isFinalB && ID.finalLift === 'boom' && b % 2 === 0) ev.push({ inst: 'drums', kind: 'boom', t: bar * BPB, v: 0.75 * I });
        let light = s.type === 'intro' || s.type === 'bridge' || (s.type === 'outro' && b >= s.bars / 2);
        let allow = null;
        if (MX && MX.djIn && s.type === 'intro' && ci === 0) { light = false; allow = b < s.bars / 4 ? ['kick'] : b < s.bars / 2 ? ['kick', 'hat'] : ['kick', 'hat', 'ohat', 'shaker', 'rim', 'maracas']; } // intro DJ : rythme seul pour le calage
        else if (MX && MX.djOut && s.type === 'outro' && isFinalChapter) { light = false; allow = b < s.bars / 2 ? ['kick', 'hat', 'ohat', 'shaker', 'rim', 'clap', 'snare', 'maracas'] : ['kick', 'hat', 'ohat', 'shaker', 'rim']; } // outro DJ : la batterie tient jusqu'au bout
        else if (ID.introGroove && s.type === 'intro' && ci === 0) { light = false; allow = b < s.bars / 2 ? ['kick'] : ['kick', 'hat']; }
        else if (ID.dnbIntro && s.type === 'intro') { light = false; allow = b < s.bars / 2 ? ['hat', 'ride', 'shaker'] : ['kick', 'hat', 'ride', 'shaker', 'rim']; } // intro DnB mixable : rythme sans caisse claire
        else if (ID.layers && firstA) { const stg = Math.floor((b / s.bars) * (ID.layers.length + 1)); if (stg < ID.layers.length) allow = ID.layers[stg]; }
        if (s.type === 'intro' && b < s.bars / 2 && !allow) continue;
        if (s.type === 'outro' && b >= Math.ceil(s.bars * 0.75) && !(MX && MX.djOut)) continue;
        // jungle : le break est redécoupé à chaque mesure (sauf la 1re de chaque phrase, qui pose le motif)
        const base = phrases ? phrases[Math.floor(b / phraseLen)] : parsed0;
        const parsed = parsedAll && b % 4 !== 0 && rgv.chance(ID.barPick) ? rgv.pick(parsedAll) : base;
        const dyn = GV ? barDynamics(b, s.bars, C.startBar + bar) : 1;
        for (const [kind, arr] of Object.entries(parsed)) {
          if (light && !['hat', 'shaker', 'rim', 'tom', 'maracas', 'clave', 'congah', 'congam', 'congal'].includes(kind)) continue;
          if (allow && !allow.includes(kind)) continue;
          for (let st = 0; st < SPB; st++) {
            if (!arr[st]) continue;
            if (lastBar && nextType && st >= SPB - 4 && (kind === 'snare' || kind === 'clap') && !light) continue;
            const gh = kind === 'snare' && arr[st] < 0.5 ? 1 : undefined; // « - » : note fantôme (caisse claire étouffée sur les kits acoustiques)
            if (GV) { ev.push({ inst: 'drums', kind, t: stepT(bar, st), v: arr[st] * I * (light ? 0.6 : 1) * dyn * grooveAccent(GV, kind, st) * (1 + rgv.gauss() * 0.05 * HUM), ...(gh ? { g: 1 } : {}) }); continue; }
            ev.push({ inst: 'drums', kind, t: stepT(bar, st) + rd.gauss() * (S.mix.lofi ? 0.012 : 0.004) * HUM + (ID.layBack && (kind === 'snare' || kind === 'clap' || kind === 'rim') ? ID.layBack : 0), v: arr[st] * I * (light ? 0.6 : 1) * (1 + rd.gauss() * 0.07 * HUM) * (kind === 'hat' && st % 4 === 2 ? 1.08 : 1), ...(gh ? { g: 1 } : {}) });
          }
        }
        if (GV && !light && !allow && SPB === 16) {
          // notes fantômes de caisse claire et variations de grosse caisse en fin de phrase (pas de hasard pur : positions idiomatiques)
          const sn = parsed.snare, kk = parsed.kick;
          const gh = (GHOST[P.style] || 0) * (VX ? [0.6, 1, 1.3, 1.5][VL] : 1);
          if (sn && gh && role !== 'build') for (const st of [7, 9, 15, 2]) if (!sn[st] && rgv.chance((st === 15 ? 0.12 : 0.16) * gh)) ev.push({ inst: 'drums', kind: 'snare', t: stepT(bar, st), v: (0.16 + rgv() * 0.1) * I, g: 1 });
          if (ID.barVar && kk && b % 4 === 3 && !(lastBar && preB)) { const st = rgv.pick([13, 14, 15, 7, 11]); if (!kk[st]) ev.push({ inst: 'drums', kind: 'kick', t: stepT(bar, st), v: 0.62 * I * dyn }); }
          // mini-fill toutes les 8 mesures (hors fin de section) : reprise de caisse claire, ou charley ouvert + clap en house/techno
          if (b % 8 === 7 && !lastBar && !ID.rush && rgv.chance(VX ? [0.3, 0.55, 0.8, 0.95][VL] : 0.55)) {
            const kit = S.drums.kit;
            if (kit === 'house' || kit === 'techno' || kit === 'tr909') { if (parsed.hat || parsed.ohat) ev.push({ inst: 'drums', kind: 'ohat', t: stepT(bar, 14), v: 0.55 * I }); if (rgv.chance(0.5)) ev.push({ inst: 'drums', kind: 'clap', t: stepT(bar, 15), v: 0.35 * I }); }
            else if (sn && kit !== 'cinema') for (const st of rgv.pick([[14, 15], [13, 15], [11, 14, 15]])) if (!sn[st]) ev.push({ inst: 'drums', kind: 'snare', t: stepT(bar, st), v: (0.34 + 0.14 * (st - 11) / 4) * I });
          }
          if (ID.rush && b % 4 === 3 && !lastBar && rgv.chance(0.45)) for (let q = 12; q < 16; q++) ev.push({ inst: 'drums', kind: 'snare', t: stepT(bar, q), v: (0.28 + 0.12 * (q - 12)) * I });
        }
        // rafales de charleston (trap)
        if ((S.drums.kit === 'trap' || (S.drums.kit === 'tr808' && S.drums.halftime)) && !light) {
          for (let beat = 0; beat < BPB; beat++) {
            if (ID.loopMelody ? !(trapRolls[b % 4] || []).includes(beat) : !rd.chance(VX ? [0.18, 0.28, 0.36, 0.44][VL] : 0.28)) continue;
            const n = ID.loopMelody ? trapRollN[(b + beat) % trapRollN.length] : rd.pick([3, 4, 6]);
            const span = n === 3 ? 0.5 : n === 6 ? 0.5 : 0.25 * (n / 2);
            for (let k = 0; k < n; k++) ev.push({ inst: 'drums', kind: 'hat', t: bar * BPB + beat + k * (span / n), v: 0.5 + 0.4 * (k / n) });
          }
        }
        // fill de fin de section
        if (role === 'build' && b >= s.bars - 2) {
          // roulement de caisse claire en crescendo avant le drop
          const n = b === s.bars - 1 ? 4 * BPB * 2 : 4 * BPB;
          for (let k = 0; k < n; k++) { const p = ((b - (s.bars - 2)) * n + k) / (2 * n); ev.push({ inst: 'drums', kind: S.drums.kit === 'house' || S.drums.kit === 'techno' ? 'clap' : 'snare', t: bar * BPB + k * (BPB / n), v: (ID.edm ? 0.16 + 0.5 * p * p : 0.3 + 0.55 * p) }); }
        } else if (lastBar && nextType && !light && nextType !== 'outro' && !(preB && (ID.preRoll || ID.dropout === 'break'))) {
          if (S.drums.kit === 'retro' || (S.drums.kit !== 'trap' && S.drums.kit !== 'cinema' && rd.chance(VX ? [0.15, 0.3, 0.45, 0.6][VL] : 0.3))) {
            // fill de toms descendant (années 80)
            const kinds = ['tomh', 'tomh', 'tomm', 'tomm', 'toml', 'toml'];
            const startBeat = BPB - 1.5;
            kinds.forEach((kd, k) => ev.push({ inst: 'drums', kind: kd, t: bar * BPB + startBeat + k * 0.25 + rd.gauss() * 0.006 * HUM, v: 0.6 + 0.35 * (k / kinds.length) }));
          } else {
            const fk = S.drums.kit === 'cinema' ? 'tom' : 'snare';
            const n = S.drums.kit === 'trap' ? 8 : 4;
            for (let k = 0; k < n; k++) ev.push({ inst: 'drums', kind: fk, t: bar * BPB + BPB - 1 + k / n, v: 0.45 + 0.5 * (k / n) });
          }
        }
      }
      // crash à l'entrée des refrains
      if (s.type === 'B') ev.push({ inst: 'drums', kind: 'crash', t: s.startBar * BPB, v: role === 'drop' ? 0.85 : 0.7 });
    }

    // ----- TEXTURES
    if (on.texture) {
      const tp = S.patches.texture;
      if (tp === 'wind' || tp === 'noisewash') ev.push({ inst: 'texture', kind: 'wash', t: s.startBar * BPB, d: s.bars * BPB, v: 0.5 * I });
      if ((tp === 'riser' || tp === 'noisewash' || role === 'build') && nextType === 'B' && s.bars >= 2) {
        const rb = role === 'build' ? Math.min(s.bars, 4) : 2;
        ev.push({ inst: 'texture', kind: 'riser', t: (s.startBar + s.bars - rb) * BPB, d: rb * BPB, v: 0.55 });
      }
      if ((tp === 'riser' && s.type === 'B') || role === 'drop') ev.push({ inst: 'texture', kind: 'impact', t: s.startBar * BPB, d: BPB, v: 0.7 });
      if (!L20 && (tp === 'vinyl' || (ADV.vintage != null && ADV.vintage >= 40))) ev.push({ inst: 'texture', kind: 'vinyl', t: s.startBar * BPB, d: s.bars * BPB + (isLast ? BPB : 0), v: tp === 'vinyl' ? 1 : ADV.vintage / 100 });
    }
  }


  // fond sonore (pluie, vagues, vent, grillons, feu, ville, vinyle) : morceaux de 8 mesures au plus, fondus enchaînés
  // (mémoire bornée quelle que soit la durée) ; indépendant de l'instrument « Textures »
  const amb = ADV.ambience === 'none' ? null : ADV.ambience || M.ambience || null;
  const lv = ADV.ambienceLevel != null ? (ADV.ambienceLevel / 50) ** 1.6 : 1; // v1.11.0 : volume du fond sonore (50 = habituel)
  if (amb && lv > 0 && !(amb === 'vinyle' && on.texture && S.patches.texture === 'vinyl')) {
    const kind = amb === 'vinyle' ? 'vinyl' : 'amb_' + amb, endB = totalBars * BPB + (isFinalChapter ? BPB : 0), piece = 8 * BPB, ov = Math.min(1, BPB / 2);
    for (let t = 0; t < endB - 0.01; t += piece) ev.push({ inst: 'texture', kind, t, d: Math.min(piece, endB - t) + ov, v: (AMB_GAIN[amb] || 1) * lv, xf: ov, amb: true });
  }
  // v1.11.0 : lo-fi moteur 20 — arrangement vivant (scènes, coupures, breaks, fills, cuivres, scratchs)
  const fx20 = L20 ? lofiArrange({ P, ci, sections, BPB, totalBars, ev, barChord, steps, keyPc, MX }) : null;

  // techno jouée : la séquence aiguë mute / démute par blocs de 16 mesures
  // synthwave 80s : phrasé lié, chaque note du lead tient jusqu'à la suivante (silences courts comblés, glide si proche)
  if (LEG) for (const inst of ['lead', 'lead2']) {
    const L = ev.filter((e) => e.inst === inst).sort((a, b) => a.t - b.t);
    for (let i = 0; i + 1 < L.length; i++) {
      const a = L[i], b = L[i + 1], gap = b.t - (a.t + a.d);
      if (b.t - a.t > 0.05 && gap > 0 && gap <= 1.01) { a.d = b.t - a.t + 0.04; if (!b.port && b.m !== a.m && Math.abs(b.m - a.m) <= 7 && rd.chance(0.2)) b.port = a.m; }
    }
  }
  if (JAM) for (let i = ev.length - 1; i >= 0; i--) { const e = ev[i]; if (e.inst === 'arp' && !JAM.arpOn(C.startBar + Math.floor(e.t / BPB))) ev.splice(i, 1); }
  // écho de la mélodie à la croche pointée (technique des musiques de jeux 8-bit)
  if (ID.echoLead) for (const e of ev.filter((x) => x.inst === 'lead' && !x.dbl)) ev.push({ ...e, t: e.t + 0.75, d: Math.min(e.d, 0.7), v: e.v * 0.3, port: undefined, dbl: true });
  // silences avant les refrains (grosse caisse + basse, ou toute la batterie)
  const inGap = (e) => gaps.some(([a, b, k]) => e.t >= a - 0.01 && e.t < b - 0.01 && (k === 'drums' ? e.inst === 'drums' : e.inst === 'bass' || (e.inst === 'drums' && (e.kind === 'kick' || e.kind === 'boom'))));
  if (gaps.length) for (let i = ev.length - 1; i >= 0; i--) if (inGap(ev[i])) ev.splice(i, 1);
  // la basse ne déborde pas dans le silence
  if (gaps.length) for (const e of ev) if (e.inst === 'bass') for (const [a, , k] of gaps) if (k === 'kb' && e.t < a && e.t + e.d > a) e.d = Math.max(0.1, a - e.t - 0.02);
  // modulation du dernier refrain (+1 ou +2 demi-tons sur tout ce qui est accordé)
  // modulation du mouvement (variation forte / maximale, morceaux longs hors mix)
  if (C.transpose) for (const e of ev) if (e.inst !== 'drums' && e.inst !== 'texture') { e.m += C.transpose; if (e.port != null) e.port += C.transpose; if (e.glide != null) e.glide += C.transpose; }
  if (keyLift) { const t0 = finalB.startBar * BPB - 0.01; for (const e of ev) if (e.inst !== 'drums' && e.inst !== 'texture' && e.t >= t0) { e.m += keyLift; if (e.port != null) e.port += keyLift; if (e.glide != null) e.glide += keyLift; } }

  // automatisation : ouverture de filtre selon la section (intro qui s'ouvre, refrain/drop brillant, pont/breakdown filtré)
  // + idiomes : balayage acid, filtre house, respiration ambient, montée de filtre avant chaque refrain, crescendo cinéma
  const secAt = new Array(totalBars);
  sections.forEach((x, i) => { for (let k = 0; k < x.bars; k++) secAt[x.startBar + k] = [x, k / Math.max(1, x.bars), i]; });
  const cosw = (bar, per) => 0.5 - 0.5 * Math.cos((2 * Math.PI * bar) / per);
  for (const e of ev) {
    if (e.inst === 'texture') continue;
    const barF = Math.max(0, e.t / BPB), bi = Math.min(totalBars - 1, Math.floor(barF));
    const [x, pos, xi] = secAt[bi] || [sections[0], 0, 0];
    const r = x.role || x.type;
    let f = r === 'intro' ? 0.45 + 0.45 * pos : r === 'build' ? 0.55 + 0.6 * pos : r === 'B' || r === 'drop' ? 1.1 : r === 'bridge' || r === 'breakdown' ? 0.6 : r === 'outro' ? 0.9 - 0.4 * pos : 0.85 + 0.1 * pos;
    const nx = sections[xi + 1];
    if (nx && nx.type === 'B' && x.bars >= 2 && r !== 'build') { const p = (barF - (x.startBar + x.bars - 2)) / 2; if (p > 0) f *= 0.85 + 0.45 * Math.min(1, p); }
    if (ID.acidAuto && (e.inst === 'bass' || e.inst === 'arp')) f *= 0.45 + 1.0 * cosw(barF + C.startBar * 0, 32) + (r === 'drop' ? 0.2 : 0);
    if (ID.chordSweep && e.inst === 'chords') f *= 0.5 + 0.75 * cosw(barF, 16);
    if (ID.breathe && e.inst !== 'drums') f *= 0.78 + 0.32 * cosw(barF, 8);
    if (ID.arpOpen && e.inst === 'arp' && r === 'intro') f *= 0.4 + 0.6 * pos;
    if (ID.crescendo && (r === 'A' || r === 'build') && nx && nx.type === 'B') e.v *= 0.8 + 0.32 * pos;
    if (ID.wobble && e.inst === 'bass') f *= 0.7 + 0.5 * cosw(barF, 4);
    if (GV) {
      // automatisations lentes : filtre des nappes / arpèges / mélodie (LFO de 32 mesures, déphasé par instrument),
      // envoi de réverbe plus large dans les ponts / breakdowns / intro, plus sec sur les refrains / drops
      const gb = C.startBar + barF, ph = { chords: 0, arp: 2.1, lead: 4.2, lead2: 1.3 }[e.inst];
      if (ph != null) f *= 1 + 0.12 * Math.sin((2 * Math.PI * gb) / 32 + ph);
      if (e.inst === 'lead' && nx && nx.type === 'B' && barF >= x.startBar + x.bars - 1) e.dt = 2.2; // « delay throw » sur la dernière phrase avant le refrain
      if (e.inst !== 'drums') e.rv = r === 'bridge' || r === 'breakdown' ? 1.35 : r === 'intro' || r === 'outro' ? 1.15 : r === 'B' || r === 'drop' ? 0.85 : 1;
    }
    // dérive lente du timbre (filtre + espace) en variation forte / maximale : cycles de 48 mesures, phase propre au mouvement
    if (VX && VL >= 2 && e.inst !== 'drums') { const gb = C.startBar + barF, a = VL === 3 ? 0.2 : 0.11, ph = (ci * 2.39) % 6.28; f *= 1 + a * Math.sin((2 * Math.PI * gb) / 48 + ph); e.rv = (e.rv || 1) * (1 + a * 0.8 * Math.sin((2 * Math.PI * gb) / 72 + ph * 1.7)); }
    if (e.inst !== 'drums') {
      f = Math.min(1.8, Math.max(0.25, f));
      e.f = +(e.inst === 'bass' && !ID.acidAuto ? 0.7 + 0.3 * f : f).toFixed(3);
      if (GV) { e.t += grooveShift(GV, e, P.bpm, rgv, HUM); e.v *= 1 + rgv.gauss() * 0.04 * HUM; }
      else { e.t += rd.gauss() * 0.007 * HUM; e.v *= 1 + rd.gauss() * 0.05 * HUM; }
    } else if (GV) e.t += grooveShift(GV, e, P.bpm, rgv, HUM);
    if (e.t < 0) e.t = 0;
  }
  // v1.8.0 : automatisation du passe-bas résonant (French Touch) — un segment par section, 0 = fermé, 1 = ouvert.
  // Montées : le filtre s'ouvre sur toute la section ; breakdown : fermé et résonant ; outro : se referme.
  if (ID.filterSweep) {
    const rf = makeRng(hashSeed(P.seed, 'ftFilter', C.startBar));
    sections.forEach((x, i) => {
      const r = x.role || x.type, nx = sections[i + 1], intoDrop = nx && nx.type === 'B';
      let a = 0.9, b = 0.95;
      if (r === 'intro') { a = 0.12 + 0.08 * rf(); b = 0.5 + 0.15 * rf(); }
      else if (r === 'build') { a = 0.3; b = 1; }
      else if (r === 'B' || r === 'drop') { a = 1; b = 1; }
      else if (r === 'bridge' || r === 'breakdown') { a = 0.22 + 0.1 * rf(); b = intoDrop ? 0.85 : 0.4; }
      else if (r === 'outro') { a = 0.85; b = 0.08; }
      else { a = 0.55 + 0.15 * rf(); b = intoDrop ? 1 : 0.8 + 0.15 * rf(); }
      ev.push({ inst: 'fx', kind: 'lpf', t: x.startBar * BPB, d: x.bars * BPB, a: +a.toFixed(3), b: +b.toFixed(3), v: 1 });
    });
  }
  if (fx20) for (const e of fx20) ev.push(e);
  for (const e of ev) if (e.dbl) delete e.dbl;
  state.prevVoicing = prevVoicing;
  const off = C.startBar * BPB;
  if (off) for (const e of ev) e.t += off;
  ev.sort((a, b) => a.t - b.t);
  return ev;
}

/** Compose tout le morceau d'un coup (morceaux courts, tests). Pour les longs formats, utiliser planSong + composeChapter. */
export function compose(params) {
  const plan = planSong(params);
  const state = {}; const events = [];
  for (let ci = 0; ci < plan.chapters.length; ci++) for (const e of composeChapter(plan, ci, state)) events.push(e);
  return { params: plan.params, plan, meta: { ...plan.meta, noteCount: events.length }, events };
}
