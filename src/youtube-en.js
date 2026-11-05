// Textes YouTube en anglais (titre, description, tags, textes dessinés) : tables de traduction des données françaises.
export const STYLE_EN = {
  lofi: { label: 'Lo-fi Hip-Hop', tagline: 'Mellow Rhodes, lazy boom-bap, vinyl crackle.', genre: 'Chill beats & study' },
  ambient: { label: 'Ambient', tagline: 'Floating pads, celestial bells, no beat.', genre: 'Meditation & space' },
  synthwave: { label: 'Synthwave', tagline: 'Detuned supersaws, Juno pads, gated 80s drums, singing lead.', genre: 'Retrowave & outrun' },
  house: { label: 'Deep House', tagline: 'Four-on-the-floor, chord stabs and offbeat bass.', genre: 'Club & groove' },
  frenchtouch: { label: 'French Touch', tagline: 'Filtered disco loop, sidechain pump, talkbox and filter sweeps.', genre: 'Club & filtered disco' },
  techno: { label: 'Techno', tagline: 'Pounding kick, resonant acid bass, minimal hypnosis.', genre: 'Warehouse & hypnotic' },
  cinematic: { label: 'Cinematic', tagline: 'Sweeping strings, ostinatos, epic percussion and rises.', genre: 'Soundtrack & epic' },
  chiptune: { label: 'Chiptune', tagline: '8-bit square waves, lightning arpeggios, console nostalgia.', genre: 'Video game & retro' },
  trap: { label: 'Instrumental Trap', tagline: 'Gliding 808s, rolling hi-hats, dark mood.', genre: 'Trap & dark' },
  hiphop: { label: 'Hip-Hop', tagline: 'Swung boom-bap, dusty lo-fi or trap with gliding 808s: jazzy Rhodes, 7ths and 9ths.', genre: 'Hip-hop & beats' },
  dnb: { label: 'Drum & Bass', tagline: 'Rebuilt breakbeats, reese, deep sub and liquid pads.', genre: 'Drum & bass & jungle' },
};
export const USAGE_EN = {
  lofi: { titre: 'Lo-fi Hip-Hop to Study and Relax', usages: 'studying, working, reading, relaxing', tags: ['lofi', 'lo-fi hip hop', 'chill beats', 'study music', 'beats to study'] },
  ambient: { titre: 'Ambient Music for Meditation and Sleep', usages: 'meditation, sleep, focus, breathing', tags: ['ambient', 'meditation music', 'sleep music', 'relaxing music', 'zen music'] },
  synthwave: { titre: 'Retro Synthwave for Night Driving', usages: 'night driving, coding, gaming, dreaming of the 80s', tags: ['synthwave', 'retrowave', 'outrun', '80s music', 'instrumental synthpop'] },
  house: { titre: 'Deep House to Work and Move', usages: 'working, workouts, a night with friends', tags: ['deep house', 'house music', 'club music', 'groove', 'instrumental house'] },
  frenchtouch: { titre: 'French Touch — Filtered Disco House', usages: 'partying, cooking, driving, getting motivated', tags: ['french touch', 'filter house', 'french house', 'disco house', 'talkbox'] },
  techno: { titre: 'Hypnotic Techno for Focus', usages: 'focus, running, coding, dancing', tags: ['techno', 'hypnotic techno', 'warehouse techno', 'tr-909', 'electronic music'] },
  cinematic: { titre: 'Epic Cinematic Music', usages: 'videos, role-playing games, writing, motivation', tags: ['epic music', 'film music', 'soundtrack', 'orchestral', 'cinematic'] },
  chiptune: { titre: '8-bit Chiptune for Gaming and Coding', usages: 'gaming, coding, retro gaming', tags: ['chiptune', '8-bit', 'video game music', 'retro gaming', 'bitpop'] },
  trap: { titre: 'Dark Instrumental Trap', usages: 'workouts, writing, freestyle, driving', tags: ['trap', 'instrumental trap', 'trap beat', '808', 'type beat'] },
  hiphop: { titre: 'Instrumental Hip-Hop (boom-bap, lo-fi, trap)', usages: 'writing, freestyle, working, driving', tags: ['hip hop instrumental', 'boom bap', 'hip hop beat', 'rap instrumental', 'jazzy hip hop'] },
  dnb: { titre: 'Instrumental Drum and Bass', usages: 'running, coding, focus, dancing', tags: ['drum and bass', 'dnb', 'liquid drum and bass', 'jungle', 'neurofunk'] },
};
export const USAGE_SUB_EN = {
  hiphop_boombap: { titre: 'Jazzy Boom-Bap Hip-Hop Instrumental', tags: ['boom bap', 'boom bap instrumental', 'jazzy hip hop', '90s hip hop beat'] },
  hiphop_lofi: { titre: 'Lo-fi Hip-Hop Instrumental (vinyl)', tags: ['lofi hip hop', 'lo-fi beat', 'chill hip hop', 'vinyl beat'] },
  hiphop_trap: { titre: 'Trap Instrumental (808s, half-time)', tags: ['trap beat', 'instrumental trap', '808', 'type beat'] },
  dnb_liquid: { titre: 'Liquid Drum and Bass for Focus', tags: ['liquid drum and bass', 'liquid dnb', 'drum and bass', 'dnb mix'] },
  dnb_neuro: { titre: 'Dark Neurofunk Drum and Bass', tags: ['neurofunk', 'neuro dnb', 'drum and bass', 'reese bass'] },
  dnb_jungle: { titre: 'Jungle Drum and Bass (breaks)', tags: ['jungle', 'jungle dnb', 'breakbeat', 'drum and bass'] },
  // v1.11.0: lo-fi sub-genres (engine 20)
  lofi_jazzy: { titre: 'Jazzy Lo-fi (Rhodes, jazz chords) to Study', tags: ['lofi jazz', 'jazzy lofi', 'rhodes', 'jazz hop'] },
  lofi_chillhop: { titre: 'Chillhop Instrumental to Relax', tags: ['chillhop', 'chill hop', 'chill beats', 'lofi'] },
  lofi_lofihouse: { titre: 'Filtered Lo-fi House', tags: ['lofi house', 'lo-fi house', 'chill deep house', 'filtered house'] },
  lofi_ambient: { titre: 'Ambient Lo-fi (pads, almost beatless)', tags: ['ambient lofi', 'lofi ambient', 'pads', 'sleep music'] },
  lofi_sad: { titre: 'Sad Lo-fi', tags: ['sad lofi', 'melancholic lofi', 'lofi'] },
  lofi_beatmaker: { titre: 'Dusty Boom-Bap Beat (scratches, horns)', tags: ['boom bap', 'beatmaker', 'scratch', 'abstract hip hop', 'instrumental hip hop'] },
};
export const MOOD_EN = { calme: 'calm', joyeux: 'joyful', melancolique: 'melancholic', sombre: 'dark', epique: 'epic', reveur: 'dreamy', energique: 'energetic', chill: 'chill', nocturne: 'nocturnal', cinematique: 'cinematic', mysterieux: 'mysterious', nostalgique: 'nostalgic', pluvieux: 'rainy', hypnotique: 'hypnotic', solaire: 'sunny', urbain: 'urban', aerien: 'airy' };
export const AMB_EN = { vinyle: 'vinyl crackle', pluie: 'rain', vagues: 'waves', vent: 'wind', nuit: 'summer night (crickets)', feu: 'fireplace', ville: 'distant city' };
export const AMB_TAGS_EN = { pluie: ['rain sounds', 'relaxing rain'], vagues: ['ocean waves', 'sea sounds'], vent: ['wind sounds'], nuit: ['night sounds', 'crickets'], feu: ['fireplace', 'crackling fire'], ville: ['city ambience', 'city sounds'], vinyle: ['vinyl crackle', 'vinyl'], cafe: ['coffee shop ambience', 'cafe sounds'], nuitville: ['city night ambience', 'crickets'], etude: ['library ambience', 'study ambience'] };
export const SECTION_EN = { Intro: 'Intro', Couplet: 'Verse', Refrain: 'Chorus', Pont: 'Bridge', Outro: 'Outro', 'Montée': 'Build-up', Drop: 'Drop', Breakdown: 'Breakdown' };
export const PROFILE_EN = { Plein: 'Full', Respiration: 'Breather', Groove: 'Groove', 'Épuré': 'Stripped back', Dense: 'Dense', Nappes: 'Pads' };
export const SCALE_EN = { major: 'major', minor: 'minor', dorian: 'Dorian', phrygian: 'Phrygian', lydian: 'Lydian', mixolydian: 'Mixolydian', harmonic_minor: 'harmonic minor', locrian: 'Locrian' };
export function durWordsEn(s) {
  if (s < 59.5) return `${Math.round(s)} sec`;
  const m = Math.round(s / 60); if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.floor(m / 60), r = m % 60; return r >= 5 ? `${h} hr ${r} min` : `${h} hour${h > 1 ? 's' : ''}`;
}
