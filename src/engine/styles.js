// Définition des styles : tempo, gammes, progressions (degrés 0-based), patchs, grooves, mixage.
// Motifs de batterie : 16 pas par mesure. 'x' = accent, 'o' = normal, '-' = ghost, '.' = silence.

export const INSTRUMENTS = {
  drums: 'Batterie',
  bass: 'Basse',
  chords: 'Accords / nappes',
  lead: 'Mélodie',
  arp: 'Arpèges',
  texture: 'Textures & ambiance',
};

export const MOODS = {
  auto:        { label: 'Auto (selon le style)' },
  calme:       { label: 'Calme', scales: ['major', 'lydian', 'dorian'], bpm: -8, density: 0.75, bright: 0.85, reverb: 1.25 },
  joyeux:      { label: 'Joyeux', scales: ['major', 'mixolydian', 'lydian'], bpm: 6, density: 1.1, bright: 1.15, reverb: 0.9 },
  melancolique:{ label: 'Mélancolique', scales: ['minor', 'dorian'], bpm: -6, density: 0.85, bright: 0.85, reverb: 1.2 },
  sombre:      { label: 'Sombre', scales: ['phrygian', 'harmonic_minor', 'minor'], bpm: 0, density: 0.9, bright: 0.7, reverb: 1.15 },
  epique:      { label: 'Épique', scales: ['minor', 'harmonic_minor', 'dorian'], bpm: 4, density: 1.15, bright: 1.05, reverb: 1.3 },
  reveur:      { label: 'Rêveur', scales: ['lydian', 'major', 'dorian'], bpm: -4, density: 0.8, bright: 0.95, reverb: 1.4 },
  energique:   { label: 'Énergique', scales: ['minor', 'dorian', 'mixolydian'], bpm: 10, density: 1.25, bright: 1.2, reverb: 0.8 },
  // v1.5 : ambiances supplémentaires (tous styles). Champs optionnels : swing (+), vintage (min), sidechain (×), delay (×),
  // ambience (fond sonore par défaut), drift (pleurage ×)
  chill:       { label: 'Chill', scales: ['dorian', 'major', 'mixolydian'], bpm: -5, density: 0.8, bright: 0.88, reverb: 1.15, swing: 0.04, vintage: 0.25, sidechain: 0.8 },
  nocturne:    { label: 'Nocturne', scales: ['minor', 'dorian', 'lydian'], bpm: -3, density: 0.8, bright: 0.78, reverb: 1.35, delay: 1.3, ambience: 'nuit' },
  cinematique: { label: 'Cinématique', scales: ['minor', 'harmonic_minor', 'lydian'], bpm: -2, density: 0.95, bright: 0.95, reverb: 1.5, delay: 0.8 },
  mysterieux:  { label: 'Mystérieux', scales: ['phrygian', 'harmonic_minor', 'dorian'], bpm: -4, density: 0.75, bright: 0.75, reverb: 1.4, delay: 1.35 },
  nostalgique: { label: 'Nostalgique', scales: ['major', 'mixolydian', 'dorian'], bpm: -4, density: 0.85, bright: 0.82, reverb: 1.2, vintage: 0.55, ambience: 'vinyle' },
  pluvieux:    { label: 'Pluvieux', scales: ['minor', 'dorian'], bpm: -6, density: 0.78, bright: 0.8, reverb: 1.3, vintage: 0.3, ambience: 'pluie' },
  hypnotique:  { label: 'Hypnotique', scales: ['minor', 'phrygian', 'dorian'], bpm: 2, density: 0.85, bright: 0.92, reverb: 1.1, delay: 1.4, sidechain: 1.2 },
  solaire:     { label: 'Solaire', scales: ['major', 'lydian', 'mixolydian'], bpm: 3, density: 1.05, bright: 1.15, reverb: 1.0, ambience: 'vagues' },
  urbain:      { label: 'Urbain', scales: ['minor', 'dorian', 'phrygian'], bpm: 0, density: 1.0, bright: 0.95, reverb: 0.9, swing: 0.03, ambience: 'ville' },
  aerien:      { label: 'Aérien', scales: ['lydian', 'major'], bpm: -6, density: 0.7, bright: 1.05, reverb: 1.6, delay: 1.25, ambience: 'vent' },
};
/** Fonds sonores synthétisés (aucun enregistrement) : réglage « Fond sonore ». */
export const AMBIENCES = { none: 'Aucun', vinyle: 'Vinyle (craquements)', pluie: 'Pluie', vagues: 'Vagues', vent: 'Vent', nuit: 'Nuit d’été (grillons)', feu: 'Feu de cheminée', ville: 'Ville lointaine',
  cafe: 'Café (murmure, tasses)', nuitville: 'Nuit en ville (grillons + ville au loin)', etude: 'Salle d’étude (pages, horloge)' };

export const STYLES = {
  lofi: {
    label: 'Lo-fi Hip-Hop', tagline: 'Rhodes feutré, boom-bap paresseux, craquements de vinyle.',
    genre: 'Chill beats & étude', bpm: [70, 88], swing: 0.22,
    scales: { dorian: 3, minor: 2, major: 2, mixolydian: 1 },
    progressions: [[1, 4, 0, 5], [0, 5, 3, 4], [3, 2, 1, 0], [5, 3, 0, 4], [1, 4, 2, 5], [0, 3, 6, 2]],
    chordSize: 4, chordBars: 1,
    patches: { chords: 'rhodes', bass: 'softbass', lead: 'vibes', arp: 'guitar', texture: 'vinyl' },
    bassStyle: 'walking', chordStyle: 'strum', arp: { rate: 8, mode: 'updown' },
    drums: {
      kit: 'lofi',
      A: [{ kick: 'x......o..x.....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o-' }, { kick: 'x.....x...o.....', snare: '....x.......x..-', hat: 'o.ooo.o.o.o.oo.o' }],
      B: [{ kick: 'x......ox.x.....', snare: '....x.......x...', hat: 'o-o-o-o-o-o-o-o-', rim: '..........o.....' }],
    },
    leadOct: 5, bassOct: 2, chordRange: [55, 74],
    melody: { density: 0.45, penta: true, leap: 0.25, rest: 0.35 },
    mix: { chorus: 0.25, tape: 0.6, reverb: 0.22, delay: 0.12, sidechain: 0.15, lofi: true, crush: 0, master: 0.9 },
    defaults: { drums: true, bass: true, chords: true, lead: true, arp: false, texture: true },
    // v1.11.0 (moteur 20) : sous-genres lo-fi, utilisés seulement par les nouveaux morceaux (variante « lofiStyle ») ;
    // définitions complètes (aucune surcharge 1.8 / 1.9 appliquée par-dessus) — voir src/engine/lofi20.js
    subs: {
      jazzy: {
        bpm: [72, 86], swing: 0.3, scales: { dorian: 4, major: 2, mixolydian: 2, minor: 1 },
        progressions: [[1, 4, 0, 0], [1, 4, 0, 5], [2, 5, 1, 4], [0, 5, 1, 4], [3, 2, 1, 4], [1, 4, 2, 5], [3, 6, 2, 5]],
        chordSize: 5, chordBars: 1, jazz: true,
        patches: { chords: 'rhodes', bass: 'uprightbass', lead: 'vibes', arp: 'guitar', texture: 'none' },
        bassStyle: 'walking', chordStyle: 'strum', arp: { rate: 8, mode: 'updown' },
        drums: { kit: 'hhlofi',
          A: [{ kick: 'x.........x.....', snare: '....x.......x...', ride: 'x...x..xx...x..x', hat: '....o.......o...' }],
          B: [{ kick: 'x......-..x.....', snare: '....x.....-.x..-', ride: 'x...x..xx...x..x', hat: '....o.......o...' }] },
        leadOct: 5, bassOct: 2, chordRange: [52, 74],
        melody: { density: 0.42, penta: false, leap: 0.3, rest: 0.38 },
        mix: { chorus: 0.2, tape: 0.3, reverb: 0.24, delay: 0.1, sidechain: 0.1, lofi: true, crush: 0, master: 0.9, filterSweep: true, lofi20: true },
        defaults: { drums: true, bass: true, chords: true, lead: true, arp: false, texture: true },
      },
      chillhop: {
        bpm: [80, 92], swing: 0.18, scales: { dorian: 3, major: 3, mixolydian: 2, minor: 1 },
        progressions: [[0, 5, 3, 4], [1, 4, 0, 5], [3, 4, 2, 5], [0, 2, 3, 4], [5, 3, 0, 4], [0, 3, 1, 4]],
        chordSize: 4, chordBars: 1,
        patches: { chords: 'guitar', bass: 'softbass', lead: 'flute', arp: 'mutedguitar', texture: 'none' },
        bassStyle: 'boom', chordStyle: 'strum', arp: { rate: 8, mode: 'up' },
        drums: { kit: 'boombap',
          A: [{ kick: 'x......x..x.....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.' }],
          B: [{ kick: 'x......x.xx.....', snare: '....x.......x..-', hat: 'o.ooo.o.o.o.oo.o', shaker: '..o...o...o...o.' }] },
        leadOct: 5, bassOct: 2, chordRange: [55, 74],
        melody: { density: 0.5, penta: true, leap: 0.25, rest: 0.3 },
        mix: { chorus: 0.22, tape: 0.35, reverb: 0.2, delay: 0.14, sidechain: 0.14, lofi: true, crush: 0, master: 0.9, filterSweep: true, lofi20: true },
        defaults: { drums: true, bass: true, chords: true, lead: true, arp: true, texture: true },
      },
      lofihouse: {
        bpm: [112, 122], swing: 0.1, scales: { dorian: 3, minor: 2, mixolydian: 2, major: 1 },
        progressions: [[0, 3], [1, 4, 0, 0], [0, 5, 3, 4], [0, 6, 5, 6], [3, 4, 0, 0], [1, 2, 3, 4]],
        chordSize: 4, chordBars: 1,
        patches: { chords: 'rhodes', bass: 'housebass', lead: 'pluck', arp: 'pluck', texture: 'none' },
        bassStyle: 'offbeat', chordStyle: 'stabs', arp: { rate: 16, mode: 'up' },
        drums: { kit: 'house',
          A: [{ kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..o...o...o...o.' }],
          B: [{ kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..o...o...o...o.', ohat: '..o...o...o...o.', shaker: 'o.oo.oo.o.oo.oo.' }] },
        leadOct: 5, bassOct: 2, chordRange: [55, 76],
        melody: { density: 0.4, penta: true, leap: 0.2, rest: 0.4 },
        mix: { chorus: 0.2, tape: 0.35, reverb: 0.22, delay: 0.2, sidechain: 0.32, lofi: true, crush: 0, master: 0.92, filterSweep: true, lofi20: true },
        defaults: { drums: true, bass: true, chords: true, lead: true, arp: false, texture: true },
      },
      ambient: {
        bpm: [60, 75], swing: 0.12, scales: { major: 3, lydian: 2, dorian: 2, minor: 1 },
        progressions: [[0, 3], [0, 5, 3, 4], [3, 0], [0, 4, 5, 3], [5, 3, 0, 0], [0, 2, 3, 0]],
        chordSize: 4, chordBars: 2,
        patches: { chords: 'warmpad', bass: 'subdrone', lead: 'vibes', arp: 'harp', texture: 'none' },
        bassStyle: 'drone', chordStyle: 'sustain', arp: { rate: 8, mode: 'updown' },
        drums: { kit: 'lofi',
          A: [{ kick: 'x...............', rim: '..........o.....', shaker: '..o...o...o...o.' }],
          B: [{ kick: 'x.........x.....', snare: '............-...', shaker: '..o...o...o...o.' }] },
        leadOct: 5, bassOct: 2, chordRange: [52, 76],
        melody: { density: 0.3, penta: true, leap: 0.3, rest: 0.5 },
        mix: { chorus: 0.3, tape: 0.25, reverb: 0.42, delay: 0.24, sidechain: 0, lofi: true, crush: 0, master: 0.88, filterSweep: true, lofi20: true },
        defaults: { drums: true, bass: true, chords: true, lead: true, arp: true, texture: true },
      },
      sad: {
        bpm: [62, 76], swing: 0.18, scales: { minor: 4, harmonic_minor: 1, dorian: 2, phrygian: 1 },
        progressions: [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 4], [5, 3, 0, 4], [0, 3, 6, 2], [0, 5, 3, 3]],
        chordSize: 4, chordBars: 1,
        patches: { chords: 'piano', bass: 'softbass', lead: 'piano', arp: 'harp', texture: 'none' },
        bassStyle: 'default', chordStyle: 'strum', arp: { rate: 8, mode: 'up' },
        drums: { kit: 'hhlofi',
          A: [{ kick: 'x.........x.....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.' }],
          B: [{ kick: 'x......o..x.....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o-' }] },
        leadOct: 5, bassOct: 2, chordRange: [52, 72],
        melody: { density: 0.36, penta: false, leap: 0.22, rest: 0.42 },
        mix: { chorus: 0.18, tape: 0.3, reverb: 0.3, delay: 0.14, sidechain: 0.1, lofi: true, crush: 0, master: 0.88, filterSweep: true, lofi20: true },
        defaults: { drums: true, bass: true, chords: true, lead: true, arp: false, texture: true },
      },
      beatmaker: {
        bpm: [86, 98], swing: 0.3, scales: { minor: 3, dorian: 3, phrygian: 1, harmonic_minor: 1 },
        progressions: [[0, 0, 5, 6], [0, 3, 0, 4], [0, 5, 3, 4], [1, 4, 0, 0], [0, 6, 5, 6], [0, 3, 6, 5]],
        chordSize: 4, chordBars: 1,
        patches: { chords: 'piano', bass: 'subbass', lead: 'hornsect', arp: 'pizz', texture: 'none' },
        bassStyle: 'boom', chordStyle: 'chop', arp: { rate: 8, mode: 'up' },
        drums: { kit: 'boombap',
          A: [{ kick: 'x.x.......x..x..', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.' }],
          B: [{ kick: 'x.x....x..x..x..', snare: '....x..-....x...', hat: 'o.o.o.o.o.o.o.oo' }] },
        leadOct: 5, bassOct: 2, chordRange: [52, 74],
        melody: { density: 0.36, penta: true, leap: 0.3, rest: 0.42 },
        mix: { chorus: 0.12, tape: 0.45, reverb: 0.2, delay: 0.12, sidechain: 0.12, lofi: true, crush: 0, master: 0.92, filterSweep: true, lofi20: true },
        defaults: { drums: true, bass: true, chords: true, lead: true, arp: false, texture: true },
      },
    },
  },
  ambient: {
    label: 'Ambient', tagline: 'Nappes flottantes, cloches célestes, sans rythme.',
    genre: 'Méditation & espace', bpm: [60, 76], swing: 0,
    scales: { lydian: 3, major: 2, dorian: 2, minor: 1 },
    progressions: [[0, 3, 5, 4], [0, 4, 5, 3], [0, 5, 3, 0], [3, 0, 4, 5], [0, 1, 0, 3]],
    chordSize: 5, chordBars: 2,
    patches: { chords: 'warmpad', bass: 'subdrone', lead: 'bell', arp: 'bell', texture: 'wind' },
    bassStyle: 'drone', chordStyle: 'sustain', arp: { rate: 8, mode: 'random', sparse: 0.45 },
    drums: { kit: 'soft', A: [{ shaker: '..o...o...o...o.' }], B: [{ kick: 'o...............', shaker: '..o...o...o...o.' }] },
    leadOct: 5, bassOct: 2, chordRange: [50, 76],
    melody: { density: 0.22, penta: true, leap: 0.4, rest: 0.55, long: true },
    mix: { chorus: 0.45, tape: 0.15, reverb: 0.55, delay: 0.3, sidechain: 0, lofi: false, master: 0.85, levels: { bass: 0.45, chords: 1.1, lead: 1.3 } },
    defaults: { drums: false, bass: true, chords: true, lead: true, arp: true, texture: true },
  },
  synthwave: {
    label: 'Synthwave', tagline: 'Supersaws désaccordées, pads Juno, batterie 80s « gated », lead chantant.',
    genre: 'Retrowave & outrun', bpm: [96, 118], swing: 0,
    scales: { minor: 4, dorian: 2, harmonic_minor: 1 },
    progressions: [[0, 5, 2, 6], [0, 5, 3, 4], [5, 3, 0, 4], [0, 2, 5, 6], [0, 6, 5, 6], [0, 3, 6, 5], [0, 5, 6, 4], [3, 4, 0, 0], [0, 6, 3, 4]],
    chordSize: 4, chordBars: 2,
    patches: { chords: 'supersaw', bass: 'analogbass', lead: 'synthlead', arp: 'arpsaw', texture: 'riser' },
    bassStyle: 'octave', chordStyle: 'sustain', arp: { rate: 16, mode: 'up' },
    drums: {
      kit: 'retro',
      A: [{ kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..o...o...o...o.' }],
      B: [{ kick: 'x...x...x...x...', snare: '....x.......x...', clap: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.' }],
    },
    leadOct: 5, bassOct: 2, chordRange: [55, 76],
    melody: { density: 0.5, penta: false, leap: 0.22, rest: 0.28, cell: true },
    mix: { reverb: 0.48, delay: 0.26, sidechain: 0.42, lofi: false, master: 0.95, chorus: 0.6, tape: 0.7, levels: { chords: 2.0, lead: 1.15, arp: 1.5, drums: 1.0, bass: 0.9 } },
    defaults: { drums: true, bass: true, chords: true, lead: true, arp: true, texture: true },
  },
  house: {
    label: 'Deep House', tagline: 'Four-on-the-floor, stabs d\'accords et basse en contretemps.',
    genre: 'Club & groove', bpm: [118, 126], swing: 0.08,
    scales: { minor: 3, dorian: 3, mixolydian: 1 },
    progressions: [[0, 3, 4, 3], [1, 4, 0, 5], [0, 5, 3, 4], [0, 6, 5, 4], [0, 0, 3, 3]],
    chordSize: 4, chordBars: 1,
    patches: { chords: 'stab', bass: 'housebass', lead: 'pluck', arp: 'pluck', texture: 'riser' },
    bassStyle: 'offbeat', chordStyle: 'stabs', arp: { rate: 16, mode: 'updown' },
    drums: {
      kit: 'house',
      A: [{ kick: 'x...x...x...x...', clap: '....x.......x...', ohat: '..o...o...o...o.', hat: 'o-o-o-o-o-o-o-o-' }],
      B: [{ kick: 'x...x...x...x...', clap: '....x.......x...', ohat: '..x...x...x...x.', hat: 'oooooooooooooooo', shaker: '.o.o.o.o.o.o.o.o' }],
    },
    leadOct: 5, bassOct: 2, chordRange: [57, 76],
    melody: { density: 0.4, penta: true, leap: 0.25, rest: 0.4 },
    mix: { chorus: 0.2, tape: 0.35, reverb: 0.25, delay: 0.25, sidechain: 0.6, lofi: false, master: 1, levels: { lead: 1.5, chords: 1.3 } },
    defaults: { drums: true, bass: true, chords: true, lead: true, arp: false, texture: true },
  },
  // v1.8.0 : French Touch (house filtrée française, fin des années 1990) — boucle disco passée dans un passe-bas
  // résonant qu'on ouvre et ferme sur des montées de 8 à 16 mesures, pompe du sidechain, phaser, talkbox / vocodeur.
  frenchtouch: {
    label: 'French Touch', tagline: 'Boucle disco filtrée, pompe du sidechain, talkbox et balayages de filtre.',
    genre: 'Club & disco filtrée', bpm: [118, 126], swing: 0.04,
    scales: { dorian: 3, minor: 2, mixolydian: 2, major: 1 },
    // boucles d'accords disco (7e / 9e) : i7–IV7 dorien, ii–V, vi–ii–V–I, montée IV–V–vi…
    progressions: [[0, 3], [0, 3, 0, 3], [1, 4], [1, 4, 0, 0], [5, 1, 4, 0], [3, 4, 5, 5], [0, 6, 5, 6], [0, 5, 3, 4]],
    chordSize: 4, chordBars: 1,
    patches: { chords: 'junopoly', bass: 'moogbass', lead: 'talkbox', arp: 'arplead', texture: 'riser' },
    bassStyle: 'disco', chordStyle: 'disco', arp: { rate: 16, mode: 'updown' },
    filterSweep: true,
    drums: {
      kit: 'tr909',
      A: [{ kick: 'x...x...x...x...', clap: '....x.......x...', ohat: '..o...o...o...o.', hat: 'o-o-o-o-o-o-o-o-' }],
      B: [{ kick: 'x...x...x...x...', clap: '....x.......x...', ohat: '..x...x...x...x.', hat: 'oooooooooooooooo', shaker: '.o.o.o.o.o.o.o.o' }],
    },
    leadOct: 5, bassOct: 2, chordRange: [55, 76],
    melody: { density: 0.38, penta: true, leap: 0.25, rest: 0.42, cell: true },
    mix: { chorus: 0.15, tape: 0.45, reverb: 0.2, delay: 0.28, sidechain: 0.78, scBass: 0.3, lofi: false, master: 1, phaser: 0.55, flanger: 0.22, filterSweep: true, levels: { lead: 1.25, chords: 1.35 } },
    defaults: { drums: true, bass: true, chords: true, lead: true, arp: false, texture: true },
  },
  techno: {
    label: 'Techno', tagline: 'Kick martelé, acid bass résonante, hypnose minimaliste.',
    genre: 'Warehouse & hypnotique', bpm: [126, 136], swing: 0,
    scales: { phrygian: 3, minor: 3, dorian: 1 },
    progressions: [[0, 0, 0, 0], [0, 0, 5, 0], [0, 1, 0, 6], [0, 0, 6, 5]],
    chordSize: 3, chordBars: 2,
    patches: { chords: 'darkpad', bass: 'acid', lead: 'arpsaw', arp: 'acidarp', texture: 'noisewash' },
    bassStyle: 'acid', chordStyle: 'sustain', arp: { rate: 16, mode: 'random' },
    drums: {
      kit: 'tr909',
      A: [{ kick: 'x...x...x...x...', hat: 'o-.-o-.-o-.-o-.-', ohat: '..o...o...o...o.', rim: '...o.....o....o.' }],
      B: [{ kick: 'x...x...x...x..-', clap: '....x.......x...', hat: 'o-.oo-.-o-.oo-.-', ohat: '..x...x...x...x.', rim: '...o..o..o....o.', snare: '.......-.......-' }],
    },
    leadOct: 4, bassOct: 2, chordRange: [48, 67],
    melody: { density: 0.3, penta: false, leap: 0.15, rest: 0.45 },
    mix: { chorus: 0.15, tape: 0.4, reverb: 0.3, delay: 0.3, sidechain: 0.55, lofi: false, master: 1 },
    defaults: { drums: true, bass: true, chords: true, lead: false, arp: true, texture: true },
  },
  cinematic: {
    label: 'Cinématique', tagline: 'Cordes amples, ostinatos, percussions épiques et montées.',
    genre: 'Bande originale & épique', bpm: [80, 100], swing: 0,
    scales: { minor: 3, harmonic_minor: 2, dorian: 1, major: 1 },
    progressions: [[0, 5, 2, 6], [0, 3, 5, 4], [5, 3, 0, 4], [0, 6, 5, 4], [0, 4, 5, 3]],
    chordSize: 3, chordBars: 1,
    patches: { chords: 'ensemble', bass: 'spiccato', lead: 'frenchhorn', arp: 'spiccato', texture: 'riser' },
    bassStyle: 'cinema', chordStyle: 'sustain', arp: { rate: 16, mode: 'ostinato' },
    drums: {
      kit: 'cinema',
      A: [{ tom: 'x.....o.x.......' }],
      B: [{ boom: 'x...............', tom: 'x..o..o.x..o.oo.', snare: '....o.......o...' }],
    },
    leadOct: 5, bassOct: 2, chordRange: [50, 74],
    melody: { density: 0.35, penta: false, leap: 0.35, rest: 0.3, long: true },
    mix: { chorus: 0, tape: 0.2, reverb: 0.5, delay: 0.1, sidechain: 0, lofi: false, master: 0.95, levels: { drums: 0.75, chords: 1.4, arp: 1.3 } },
    defaults: { drums: true, bass: true, chords: true, lead: true, arp: true, texture: true },
  },
  chiptune: {
    label: 'Chiptune', tagline: 'Ondes carrées 8-bit, arpèges éclairs, nostalgie console.',
    genre: '8-bit & rétro gaming', bpm: [130, 156], swing: 0,
    scales: { major: 3, minor: 2, mixolydian: 1, dorian: 1 },
    progressions: [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 4, 4], [0, 6, 5, 4]],
    chordSize: 3, chordBars: 1,
    patches: { chords: 'chiparp', bass: 'tribass', lead: 'square', arp: 'pulse', texture: 'none' },
    bassStyle: 'octave', chordStyle: 'chiparp', arp: { rate: 16, mode: 'up' },
    drums: {
      kit: 'chip',
      A: [{ kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.' }],
      B: [{ kick: 'x...x...x.x.x...', snare: '....x.......x..o', hat: 'oooooooooooooooo' }],
    },
    leadOct: 5, bassOct: 2, chordRange: [60, 79],
    melody: { density: 0.7, penta: false, leap: 0.3, rest: 0.15 },
    mix: { reverb: 0.08, delay: 0.12, sidechain: 0, lofi: false, crush: 6, master: 0.9, levels: { chords: 1.6, bass: 0.7 } },
    defaults: { drums: true, bass: true, chords: true, lead: true, arp: false, texture: false },
  },
  trap: {
    label: 'Trap instrumental', tagline: '808 glissantes, charlestons en rafales, ambiance sombre.',
    genre: 'Hip-hop moderne', bpm: [130, 150], swing: 0,
    scales: { harmonic_minor: 3, minor: 3, phrygian: 2 },
    progressions: [[0, 5, 3, 4], [0, 0, 5, 6], [0, 3, 5, 4], [0, 1, 0, 5], [0, 5, 0, 6]],
    chordSize: 3, chordBars: 2,
    patches: { chords: 'darkpad', bass: '808', lead: 'bell', arp: 'pluck', texture: 'noisewash' },
    bassStyle: '808', chordStyle: 'sustain', arp: { rate: 8, mode: 'random', sparse: 0.3 },
    drums: {
      kit: 'trap', halftime: true,
      A: [{ kick: 'x......x..x.....', snare: '........x.......', hat: 'o.o.o.o.o.o.o.o.' }],
      B: [{ kick: 'x......x..x..x..', snare: '........x.......', clap: '........x.......', hat: 'o.o.o.o.o.o.o.o.', ohat: '..............o.' }],
    },
    leadOct: 5, bassOct: 1, chordRange: [55, 74],
    melody: { density: 0.35, penta: true, leap: 0.3, rest: 0.35 },
    mix: { chorus: 0.2, tape: 0.4, reverb: 0.3, delay: 0.25, sidechain: 0, lofi: false, master: 1 },
    defaults: { drums: true, bass: true, chords: true, lead: true, arp: false, texture: true },
  },
  hiphop: {
    label: 'Hip-Hop', tagline: 'Boom-bap swingué, lo-fi poussiéreux ou trap aux 808 glissantes : Rhodes jazzy, 7e et 9e.',
    genre: 'Beats & instrumentaux rap', bpm: [70, 150], swing: 0.16,
    scales: { dorian: 3, minor: 3, harmonic_minor: 1, mixolydian: 1, major: 1 },
    progressions: [[1, 4, 0, 0], [0, 5, 1, 4], [0, 3, 0, 4], [5, 4, 0, 0], [0, 6, 5, 4], [3, 2, 1, 0], [0, 2, 3, 4], [1, 4, 2, 5]],
    chordSize: 4, chordBars: 1,
    patches: { chords: 'rhodes', bass: 'softbass', lead: 'vibes', arp: 'guitar', texture: 'vinyl' },
    bassStyle: 'boom', chordStyle: 'chop', arp: { rate: 8, mode: 'updown', sparse: 0.3 },
    drums: {
      kit: 'boombap',
      A: [{ kick: 'x......x..x.....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.' }],
      B: [{ kick: 'x......x.xx.....', snare: '....x..-....x...', hat: 'o.o.o.o.o.o.o-o.', ohat: '..............o.' }],
    },
    leadOct: 5, bassOct: 2, chordRange: [55, 74],
    melody: { density: 0.38, penta: true, leap: 0.25, rest: 0.4, cell: true },
    mix: { chorus: 0.15, tape: 0.65, reverb: 0.2, delay: 0.14, sidechain: 0.12, lofi: false, monoSub: true, master: 0.95, levels: { drums: 1.1 } },
    defaults: { drums: true, bass: true, chords: true, lead: true, arp: false, texture: true },
    // variantes (sous-styles) : remplacent les champs ci-dessus
    subs: {
      boombap: {
        label: 'Hip-Hop boom-bap', bpm: [85, 95], swing: 0.16,
        drums: { kit: 'boombap', A: [{ kick: 'x......x..x.....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.' }], B: [{ kick: 'x......x.xx.....', snare: '....x..-....x...', hat: 'o.o.o.o.o.o.o-o.', ohat: '..............o.' }] },
      },
      lofi: {
        label: 'Hip-Hop lo-fi', bpm: [72, 88], swing: 0.22,
        patches: { chords: 'rhodes', bass: 'uprightbass', lead: 'vibes', arp: 'guitar', texture: 'vinyl' },
        bassStyle: 'walking', chordStyle: 'strum',
        drums: { kit: 'hhlofi', A: [{ kick: 'x......o..x.....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o-' }], B: [{ kick: 'x......ox.x.....', snare: '....x.......x...', hat: 'o-o-o-o-o-o-o-o-', rim: '..........o.....' }] },
        mix: { chorus: 0.25, tape: 0.7, reverb: 0.24, delay: 0.12, sidechain: 0.15, lofi: true, monoSub: true, master: 0.9 },
      },
      trap: {
        label: 'Hip-Hop trap', bpm: [130, 150], swing: 0,
        scales: { harmonic_minor: 3, minor: 3, phrygian: 2 },
        chordSize: 4, chordBars: 2,
        patches: { chords: 'piano', bass: '808', lead: 'bell', arp: 'pluck', texture: 'noisewash' },
        bassStyle: '808', chordStyle: 'sustain',
        drums: { kit: 'trap', halftime: true, A: [{ kick: 'x......x..x.....', snare: '........x.......', hat: 'o.o.o.o.o.o.o.o.' }], B: [{ kick: 'x......x..x..x..', snare: '........x.......', clap: '........x.......', hat: 'o.o.o.o.o.o.o.o.', ohat: '..............o.' }] },
        leadOct: 5, bassOct: 1,
        melody: { density: 0.35, penta: true, leap: 0.3, rest: 0.35 },
        mix: { chorus: 0.2, tape: 0.45, reverb: 0.3, delay: 0.25, sidechain: 0.1, lofi: false, master: 1 },
      },
    },
  },
  dnb: {
    label: 'Drum & Bass', tagline: 'Breakbeats reconstruits, reese, sub profond et nappes liquides.',
    genre: 'Jungle, liquid & neuro', bpm: [166, 176], swing: 0.03,
    scales: { minor: 4, dorian: 3, harmonic_minor: 1, phrygian: 1 },
    progressions: [[0, 5, 3, 4], [0, 3, 5, 4], [1, 4, 0, 0], [0, 6, 5, 6], [5, 3, 0, 4], [0, 2, 5, 4], [0, 5, 1, 4]],
    chordSize: 4, chordBars: 2,
    patches: { chords: 'liquidpad', bass: 'dnbsub', lead: 'vibes', arp: 'pluck', texture: 'wind' },
    bassStyle: 'roller', chordStyle: 'sustain', arp: { rate: 16, mode: 'updown', sparse: 0.35 },
    drums: {
      kit: 'dnb',
      A: [{ kick: 'x.........x.....', snare: '....x.......x...', hat: '..o...o...o...o.' }],
      B: [{ kick: 'x.........x.....', snare: '....x..-.-..x...', hat: 'o.o.o.o.o.o.o.o.', ride: '..o...o...o...o.' }],
    },
    leadOct: 5, bassOct: 1, chordRange: [55, 76],
    melody: { density: 0.3, penta: true, leap: 0.3, rest: 0.45, long: true },
    mix: { chorus: 0.35, tape: 0.45, reverb: 0.42, delay: 0.25, sidechain: 0.32, lofi: false, monoSub: true, scBass: 0.4, master: 1, levels: { drums: 1.1 } },
    defaults: { drums: true, bass: true, chords: true, lead: true, arp: false, texture: true },
    subs: {
      liquid: { label: 'Drum & Bass liquid', bpm: [170, 174] },
      neuro: {
        label: 'Drum & Bass neurofunk', bpm: [172, 176],
        scales: { phrygian: 3, minor: 3, harmonic_minor: 2 },
        progressions: [[0, 0, 0, 0], [0, 0, 5, 0], [0, 1, 0, 6], [0, 0, 6, 5]],
        chordSize: 3, chordBars: 2,
        patches: { chords: 'darkpad', bass: 'reese', lead: 'acidarp', arp: 'arpsaw', texture: 'noisewash' },
        bassStyle: 'neuro', chordStyle: 'sustain',
        melody: { density: 0.22, penta: false, leap: 0.2, rest: 0.55 },
        mix: { chorus: 0.1, tape: 0.55, reverb: 0.28, delay: 0.22, sidechain: 0.38, lofi: false, monoSub: true, scBass: 0.35, bassWidth: 1.5, master: 1, levels: { drums: 1.15, chords: 0.8 } },
        defaults: { drums: true, bass: true, chords: true, lead: false, arp: false, texture: true },
      },
      jungle: {
        label: 'Drum & Bass jungle', bpm: [166, 172], swing: 0.06,
        patches: { chords: 'warmpad', bass: 'dnbsub', lead: 'flute', arp: 'vibes', texture: 'wind' },
        bassStyle: 'jungle',
        drums: { kit: 'break', A: [{ kick: 'x.x.......xx....', snare: '....x..x.x..x..x', ride: 'o.o.o.o.o.o.o.o.' }], B: [{ kick: 'x.x.......x.....', snare: '....x..x.x....x.', ride: 'o.o.o.o.o.o.o.o.' }] },
        mix: { chorus: 0.25, tape: 0.6, reverb: 0.4, delay: 0.3, sidechain: 0.2, lofi: false, monoSub: true, scBass: 0.45, master: 1, levels: { drums: 1.2 } },
      },
    },
  },
};

// Variantes (sous-styles) : clé du paramètre résolu / avancé, libellés et tempos.
export const VARIANT_KEY = { frenchtouch: 'ftStyle', techno: 'technoStyle', synthwave: 'synthStyle', hiphop: 'hiphopStyle', dnb: 'dnbStyle', lofi: 'lofiStyle' };
/** v1.11.0 : sous-genres lo-fi (moteur 20 seulement ; les anciens morceaux lo-fi n'ont pas de variante). */
export const LOFI_STYLES = { jazzy: 'Jazzy (Rhodes, accords enrichis, batterie swinguée)', chillhop: 'Chillhop (guitare, groove souple)', lofihouse: 'Lo-fi house (4/4 filtré)', ambient: 'Ambient lo-fi (nappes, peu ou pas de batterie)', sad: 'Sad lo-fi (mineur, lent, mélancolique)', beatmaker: 'Beatmaker (boom-bap poussiéreux, cuivres, scratchs)' };
export const HIPHOP_STYLES = { boombap: 'Boom-bap (85-95 BPM, swing MPC)', lofi: 'Lo-fi (72-88 BPM, vinyle, saturé)', trap: 'Trap instrumental (130-150 BPM, demi-temps, 808 glissantes)' };
export const DNB_STYLES = { liquid: 'Liquid (170-174 BPM, nappes, sub rond)', neuro: 'Neurofunk (172-176 BPM, reese, sombre)', jungle: 'Jungle (166-172 BPM, breaks découpés)' };
/** Sous-style choisi (ou tiré) d'un jeu de paramètres résolus. */
export const variantOf = (P) => (P && VARIANT_KEY[P.style] ? P[VARIANT_KEY[P.style]] || null : null);
/** Clé « profil » des tables du moteur : style, ou style_variante pour hip-hop / drum & bass. */
export function profileKey(P) {
  const v = variantOf(P);
  return v && STYLES[P.style]?.subs?.[v] ? `${P.style}_${v}` : P.style;
}
/** Définition effective d'un style (style de base + surcharges de la variante). */
export function styleDef(style, sub, engine = 0) {
  const S = STYLES[style];
  const o = sub && S && S.subs ? S.subs[sub] : null;
  const base = o ? { ...S, ...o } : S;
  if (!(engine >= 18) || !S) return base;
  // moteur 1.8 : réglages par défaut revus (docs/STYLES.md) ; sans « engine » (anciens morceaux) rien ne change
  if (style === 'lofi' && o) return base; // v1.11.0 : sous-genres lo-fi complets (moteur 20)
  const R = STYLE18[style], RS = sub ? STYLE18[`${style}_${sub}`] : null;
  if (!R && !RS && !(engine >= 19 && (STYLE19[style] || (sub && STYLE19[`${style}_${sub}`])))) return base;
  const out = { ...base, ...(R || {}), ...(RS || {}) };
  out.mix = { ...base.mix, ...(R?.mix || {}), ...(RS?.mix || {}) };
  if (R?.extraProgressions || RS?.extraProgressions) out.progressions = base.progressions.concat(R?.extraProgressions || [], RS?.extraProgressions || []);
  delete out.extraProgressions;
  // moteur 1.9 : French Touch refaite (composition dédiée src/engine/frenchtouch.js) ; les morceaux 1.8 restent identiques
  for (const R19 of engine >= 19 ? [STYLE19[style], sub ? STYLE19[`${style}_${sub}`] : null] : []) {
    if (!R19) continue;
    const mix = { ...out.mix, ...(R19.mix || {}) }, drums = { ...out.drums, ...(R19.drums || {}) };
    Object.assign(out, R19, { mix, drums });
  }
  return out;
}

/** Moteur 1.9 : révisions par style. French Touch : boucle découpée, passe-bas 24 dB, pompe à la croche, bus batterie compressé. */
export const STYLE19 = {
  frenchtouch: {
    bpm: [120, 126], swing: 0.12, chordBars: 1,
    progressions: [[0, 3], [1, 4], [0, 3, 0, 3], [1, 4, 0, 0], [5, 1, 4, 0], [0, 6, 5, 6], [3, 4], [0, 5, 3, 4]],
    patches: { chords: 'stab', bass: 'moogbass', lead: 'talkbox', arp: 'mutedguitar', texture: 'riser' },
    defaults: { drums: true, bass: true, chords: true, lead: true, arp: true, texture: true },
    drums: { kit: 'tr909' },
    mix: { sidechain: 0, scBass: 0, flanger: 0, phaser: 0.5, phaserArp: 0.35, filterSweep: true, ft19: true, filter24: true,
      pump: { chords: 0.93, arp: 0.85, bass: 0.5, texture: 0.55, lead: 0.3, rev: 0.6, rel: 0.55, curve: 1.25 }, punch: 0.5, drumSat: 1.85, drumGlue: true,
      drumRev: { clap: 1.7, snare: 1.4 }, reverb: 0.2, delay: 0.22, chorus: 0.12, levels: { lead: 1.15, chords: 1.3, arp: 0.95, bass: 1.05 } },
  },
  // Ed Banger : stabs de saws distordus et compressés, basse saturée, batterie dure (techniques Justice / Vitalic)
  frenchtouch_edbanger: {
    bpm: [116, 126], swing: 0.03, scales: { minor: 3, phrygian: 2, dorian: 1 },
    progressions: [[0, 0, 5, 6], [0, 6], [0, 5, 6, 6], [0, 3, 6, 5], [0, 0, 3, 4], [0, 5]],
    patches: { chords: 'sawlead', bass: 'sawbass', lead: 'arpsaw', arp: 'stab', texture: 'riser' },
    mix: { chordSat: 3.2, arpSat: 2.4, bassSat: 2.8, drumSat: 2.4, punch: 0.68, phaser: 0.2, phaserArp: 0, chorus: 0.05, reverb: 0.14, delay: 0.16,
      pump: { chords: 0.9, arp: 0.85, bass: 0.55, texture: 0.5, lead: 0.3, rev: 0.6, rel: 0.6, curve: 1.3 }, drumRev: { clap: 1.2, snare: 1.1 }, levels: { lead: 1.35, chords: 1.15, arp: 0.8, bass: 1.1 } },
  },
  // Myd : house française moderne, lumineuse et joueuse — basse rebondissante, hooks de synthé découpés
  frenchtouch_myd: {
    bpm: [118, 124], swing: 0.14, scales: { major: 2, mixolydian: 3, dorian: 2 },
    progressions: [[0, 4, 5, 3], [0, 3], [3, 4, 0, 0], [0, 5, 3, 4], [1, 4], [0, 2, 3, 4]],
    patches: { chords: 'junopoly', bass: 'moogbass', lead: 'pluck', arp: 'mutedguitar', texture: 'riser' },
    mix: { chordSat: 1.3, phaser: 0.35, phaserArp: 0.25, chorus: 0.3, reverb: 0.24, delay: 0.3, punch: 0.45, drumSat: 1.6,
      pump: { chords: 0.75, arp: 0.65, bass: 0.4, texture: 0.4, lead: 0.15, rev: 0.45, rel: 0.5, curve: 1.5 }, levels: { lead: 1.25, chords: 1.15, arp: 0.9, bass: 1.12 } },
  },
  // v1.9.0 : retouches légères par style (docs/STYLES.md), moteur 19 seulement — les morceaux 1.8 restent identiques
  // deep house « à la DJ Koze » : plus lente, chaloupée, chaude et un peu bancale (Rhodes, vibraphone, guitare étouffée, bande)
  house: {
    bpm: [116, 122], swing: 0.13,
    patches: { chords: 'rhodes', bass: 'housebass', lead: 'vibes', arp: 'mutedguitar', texture: 'vinyl' },
    mix: { tape: 0.55, chorus: 0.35, reverb: 0.32, delay: 0.32, sidechain: 0.45 },
  },
  // boom-bap poussiéreux : bande saturée, batterie et basse plus granuleuses, swing plus marqué (scratchs de transition déjà en place)
  hiphop_boombap: { swing: 0.18, mix: { tape: 0.85, drumSat: 1.6, bassSat: 1.3 } },
  // neurofunk « à la Pendulum » : supersaw et lead analogique au premier plan, batterie saturée et frappante
  dnb_neuro: {
    patches: { chords: 'supersaw', bass: 'reese', lead: 'synthlead', arp: 'arpsaw', texture: 'noisewash' },
    mix: { drumSat: 1.6, punch: 0.45, sidechain: 0.5, levels: { drums: 1.25, chords: 1.0, lead: 1.1 } },
  },
  // synthwave plus sombre, côté synth-pop des années 80 (synth-pop 80s) : mineur / phrygien, nappes sombres, basse liée, batterie métallique
  synthwave: {
    bpm: [100, 116], scales: { minor: 4, phrygian: 2, harmonic_minor: 2 },
    patches: { chords: 'darkpad', bass: 'bass80', lead: 'synthlead', arp: 'arp80', texture: 'riser' },
    mix: { chorus: 0.45, reverb: 0.5, tape: 0.5, drumSat: 1.4 },
  },
};

/** Moteur 1.8 : révisions par style (voir docs/STYLES.md). Fusionnées par styleDef(…, engine ≥ 18). */
export const STYLE18 = {
  lofi:      { extraProgressions: [[3, 2, 1, 4], [1, 4, 0, 3]], mix: { tape: 0.65, sidechain: 0.12 } },
  ambient:   { bpm: [58, 74], extraProgressions: [[0, 3], [0, 4, 3, 0]], mix: { reverb: 0.62, chorus: 0.5 } },
  synthwave: { extraProgressions: [[0, 3, 4, 5], [5, 3, 0, 4]], mix: { sidechain: 0.45 } },
  house:     { bpm: [118, 125], extraProgressions: [[0, 3], [0, 6], [1, 4]], mix: { sidechain: 0.62, chorus: 0.25 } },
  techno:    { mix: { sidechain: 0.5 } },
  cinematic: { bpm: [72, 100], extraProgressions: [[5, 3, 0, 4], [0, 2, 3, 4]] },
  chiptune:  { extraProgressions: [[0, 4, 5, 3, 0, 4, 3, 4]] },
  trap:      { bpm: [130, 150] },
  hiphop_boombap: { extraProgressions: [[1, 4, 0, 5]] },
  hiphop_lofi: { extraProgressions: [[3, 2, 1, 4]] },
  dnb_liquid: { extraProgressions: [[3, 4, 2, 5]] },
};
