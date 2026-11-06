// v1.21.1 — libellés EN des réglages avancés (API /api/options).
export const ADV_LABEL_EN = {
  energy: 'Energy', complexity: 'Complexity', swing: 'Swing', brightness: 'Brightness',
  space: 'Space (reverb)', width: 'Stereo width', ambience: 'Background sound',
  ambienceLevel: 'Background volume', vintage: 'Lo-fi / vintage', crackle: 'Vinyl crackle',
  wow: 'Wow / flutter', tapeSat: 'Tape saturation', dust: 'Digital dust',
  warmth: 'Warmth (low-pass)', humanize: 'Humanize', melody: 'Melody presence',
  leadPatch: 'Lead instrument', chordPatch: 'Chord sound', bassType: 'Bass playing',
  bassPatch: 'Bass sound', synthStyle: 'Synthwave style', hiphopStyle: 'Hip-hop style',
  dnbStyle: 'Drum & bass style', ftStyle: 'French Touch variant', lofiStyle: 'Lo-fi sub-genre',
  technoStyle: 'Techno style', drumKit: 'Drum kit', pianoSound: 'Piano sound',
  rhodesSound: 'Rhodes sound', kickTune: 'Kick tune', kickDecay: 'Kick length',
  drumPattern: 'Groove variant', progression: 'Chord progression', meter: 'Time signature',
  structure: 'Structure', evolution: 'Evolution speed (long tracks)', fadeIn: 'Fade in',
  fadeOut: 'Fade out', variety: 'Variation', mixStyles: 'Mix styles (long tracks)',
  mix: 'DJ mix mode (long tracks)',
};

/** Per-field option id → EN label. Unlisted ids keep the FR string. */
export const ADV_OPTS_EN = {
  ambience: {
    none: 'None', vinyle: 'Vinyl (crackle)', pluie: 'Rain', vagues: 'Waves', vent: 'Wind',
    nuit: 'Summer night (crickets)', feu: 'Fireplace', ville: 'Distant city',
    cafe: 'Café (murmur, cups)', nuitville: 'City night (crickets + distant city)', etude: 'Study room (pages, clock)',
  },
  melody: { off: 'Off', discrete: 'Subtle', normal: 'Normal', forward: 'Forward' },
  leadPatch: {
    hornsect: 'brass section (stabs)', orchstab: 'orchestra hit', dx7epiano: 'FM electric piano (DX7)',
    dx7bell: 'FM bells (DX7)', mooglead: 'Minimoog lead', junopad: 'Juno pad', supersaw: 'Supersaw',
    arplead: 'ARP sync lead', talkbox: 'Talkbox / vocoder', piano: 'Piano', rhodes: 'Rhodes',
  },
  chordPatch: {
    hornsect: 'brass section (stabs)', orchstab: 'orchestra hit', dx7epiano: 'FM electric piano (DX7)',
    dx7bell: 'FM bells (DX7)', mooglead: 'Minimoog lead', junopad: 'Juno pad', supersaw: 'Supersaw',
    piano: 'Piano', rhodes: 'Rhodes', strings: 'Strings',
  },
  bassType: { '808': 'Sliding 808', walking: 'Walking bass', default: 'Round notes', offbeat: 'Off-beat', drone: 'Drone', off: 'Off' },
  bassPatch: {
    '808': 'TR-808 — 808 bass', '909': 'TR-909 — 909 bass', subbass: 'round sub-bass (boom-bap)',
    dnbsub: 'DnB sub', reese: 'Reese', moogbass: 'Minimoog bass', acid: 'Acid 303',
  },
  synthStyle: { outrun: 'Outrun (energetic, 100-118 BPM)', dreamwave: 'Dreamwave (slow, 80-100 BPM)' },
  hiphopStyle: {
    boombap: 'Boom-bap (85-95 BPM, MPC swing)', lofi: 'Lo-fi (72-88 BPM, vinyl, saturated)',
    trap: 'Instrumental trap (130-150 BPM, half-time, sliding 808s)',
  },
  dnbStyle: {
    liquid: 'Liquid (170-174 BPM, pads, round sub)', neuro: 'Neurofunk (172-176 BPM, reese, dark)',
    jungle: 'Jungle (166-172 BPM, chopped breaks)',
  },
  ftStyle: {
    classic: 'Classic filter (Cassius, Daft Punk Homework / Discovery)',
    edbanger: 'Ed Banger electro (Justice: saturated stabs and bass)',
    myd: 'Modern French house (Myd: bouncing bass, chopped hooks)',
  },
  lofiStyle: {
    jazzy: 'Jazzy (Rhodes, rich chords, swung drums)', chillhop: 'Chillhop (guitar, soft groove)',
    lofihouse: 'Lo-fi house (filtered 4/4)', ambient: 'Ambient lo-fi', sad: 'Sad / rainy',
  },
  technoStyle: { detroit: 'Detroit (stabs, live 909)', minimal: 'Minimal (dry loops)', industriel: 'Industrial (hard, saturated)' },
  drumKit: { tr808: 'TR-808 (analogue synthesis)', tr909: 'TR-909 (analogue synthesis)', lofi: 'Lo-fi', soft: 'Soft acoustic', retro: 'Retro' },
  pianoSound: {
    steinway: 'Steinway B (concert piano, CC0)', salamander: 'Salamander Grand V3 (Yamaha C5, CC-BY 3.0)',
    upright: 'Upright piano (VCSL)',
  },
  rhodesSound: { sampled: 'Sampled Rhodes (jRhodes3d, 5 velocities)', synth: 'Synthesised Rhodes (physical model)' },
  meter: { '4/4': '4/4', '3/4': '3/4 (waltz)', '6/8': '6/8 (swing)' },
  structure: {
    classique: 'Classic (verse/chorus/bridge)', edm: 'Build → drop → breakdown',
    progressive: 'Progressive (slow evolution)', chanson: 'Song form', boucle: 'Loop',
  },
  evolution: { lente: 'Slow', normale: 'Normal', rapide: 'Fast' },
  variety: { low: 'Low', medium: 'Medium', high: 'High', max: 'Max', auto: 'Auto' },
  mixStyles: { same: 'Stay in the same style', related: 'Allow related styles' },
  mix: { on: 'On', off: 'Off (one long track)' },
};

export const VIS_LABEL_EN = { private: 'Private', unlisted: 'Unlisted', public: 'Public' };
export const AMBIENCES_EN = ADV_OPTS_EN.ambience;

const OPT_FALLBACK_EN = {
  "808": "TR-808 — 808 bass",
  "909": "TR-909 — 909 bass",
  "junopoly": "Juno polysynth (stereo chorus)",
  "jupiterpad": "Jupiter-8 pad (detuned saws)",
  "brass80": "synth brass (Oberheim)",
  "bass80": "linked 80s bass (glide)",
  "arp80": "80s arpeggio",
  "epiano": "FM electric piano (DX, light)",
  "mutedguitar": "muted guitar",
  "ensemble": "string ensemble (samples)",
  "spiccato": "spiccato strings (samples)",
  "frenchhorn": "horn (samples)",
  "harp": "harp (samples)",
  "vibes": "vibraphone (samples)",
  "uprightbass": "pizzicato upright bass (samples)",
  "pizz": "pizzicato strings (samples)",
  "flute": "flute (samples)",
  "pluck": "plucked string",
  "mellow": "mellow synth",
  "square": "square wave",
  "acid": "TB-303 — acid bass (resonant filter)",
  "arpsaw": "arpeggiated saw",
  "chiparp": "8-bit arpeggio",
  "arplead": "ARP Odyssey lead (synced oscillators)",
  "hornsect": "brass section (stabs)",
  "orchstab": "orchestra hit",
  "dx7epiano": "FM electric piano (DX7)",
  "dx7bell": "FM bells (DX7)",
  "mooglead": "Minimoog lead",
  "junopad": "Juno pad",
  "supersaw": "Supersaw",
  "talkbox": "Talkbox / vocoder",
  "piano": "Piano",
  "rhodes": "Rhodes",
  "strings": "Strings",
  "boom": "locked to the kick (boom-bap)",
  "jungle": "jungle sub (slides)",
  "neuro": "neuro bass (saturated reese, rhythmic filter)",
  "moogbass": "Minimoog bass",
  "subbass": "round sub-bass (boom-bap)",
  "dnbsub": "DnB sub",
  "reese": "Reese",
  "walking": "Walking bass",
  "default": "Round notes",
  "offbeat": "Off-beat",
  "drone": "Drone",
  "off": "Off",
  "beatmaker": "Beatmaker (dusty boom-bap, brass, scratches)",
  "cinema": "Cinematic",
  "tr606": "TR-606 (analogue synthesis)",
  "tr707": "TR-707 (imitated 6-bit digital)",
  "dr110": "DR-110 Dr. Rhythm (analogue synthesis)",
  "tr808": "TR-808 (analogue synthesis)",
  "tr909": "TR-909 (analogue synthesis)",
  "lofi": "Lo-fi",
  "soft": "Soft acoustic",
  "retro": "Retro"
};
const OPT_FIELD_EN = {
  "bassType": {
    "acid": "acid sequence",
    "boom": "locked to the kick (boom-bap)",
    "jungle": "jungle sub (slides)"
  },
  "bassPatch": {
    "acid": "Acid 303",
    "neuro": "neuro bass (saturated reese, rhythmic filter)"
  },
  "ambience": {
    "cafe": "Café (murmur, cups)"
  }
};

export function localizeAdvanced(ADVANCED, lang = 'fr') {
  if (lang !== 'en') return ADVANCED;
  const out = {};
  for (const [k, def] of Object.entries(ADVANCED)) {
    const d = { ...def };
    if (ADV_LABEL_EN[k]) d.label = ADV_LABEL_EN[k];
    if (k === 'ambience') d.help = 'Synthesised ambience under the music. Auto: follows the selected mood.';
    if (d.options && typeof d.options === 'object') {
      const map = { ...(ADV_OPTS_EN[k] || {}), ...(OPT_FIELD_EN[k] || {}) };
      const o = {};
      for (const [id, lab] of Object.entries(d.options)) o[id] = map[id] || OPT_FALLBACK_EN[id] || lab;
      d.options = o;
    }
    out[k] = d;
  }
  return out;
}
