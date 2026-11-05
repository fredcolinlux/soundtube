// Théorie musicale : notes, gammes, accords, voicings.
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTE_NAMES_FR = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

export const SCALES = {
  major:          { label: 'Majeur (ionien)', steps: [0, 2, 4, 5, 7, 9, 11], bright: 0.8 },
  minor:          { label: 'Mineur naturel (éolien)', steps: [0, 2, 3, 5, 7, 8, 10], bright: 0.35 },
  dorian:         { label: 'Dorien', steps: [0, 2, 3, 5, 7, 9, 10], bright: 0.5 },
  phrygian:       { label: 'Phrygien', steps: [0, 1, 3, 5, 7, 8, 10], bright: 0.15 },
  lydian:         { label: 'Lydien', steps: [0, 2, 4, 6, 7, 9, 11], bright: 1.0 },
  mixolydian:     { label: 'Mixolydien', steps: [0, 2, 4, 5, 7, 9, 10], bright: 0.7 },
  harmonic_minor: { label: 'Mineur harmonique', steps: [0, 2, 3, 5, 7, 8, 11], bright: 0.25 },
};

export const PENTA_DEGREES = {
  // degrés (0-based) conservés pour une mélodie pentatonique
  major: [0, 1, 2, 4, 5], lydian: [0, 1, 2, 4, 5], mixolydian: [0, 1, 2, 4, 5],
  minor: [0, 2, 3, 4, 6], dorian: [0, 2, 3, 4, 6], phrygian: [0, 2, 3, 4, 6], harmonic_minor: [0, 2, 3, 4, 5],
};

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function noteName(midi, fr = false) {
  const n = (fr ? NOTE_NAMES_FR : NOTE_NAMES)[((midi % 12) + 12) % 12];
  return n + (Math.floor(midi / 12) - 1);
}

/** Degré de gamme (peut être négatif ou > 6) -> note MIDI. */
export function degreeToMidi(scaleSteps, rootMidi, deg) {
  const n = scaleSteps.length;
  const oct = Math.floor(deg / n);
  const idx = ((deg % n) + n) % n;
  return rootMidi + oct * 12 + scaleSteps[idx];
}

/** Accord diatonique empilé en tierces sur le degré `deg`. size=3 (triade), 4 (7e), 5 (9e). */
export function chordDegrees(deg, size = 3) {
  const out = [];
  for (let k = 0; k < size; k++) out.push(deg + 2 * k);
  return out;
}

export function chordMidis(scaleSteps, rootMidi, deg, size = 3) {
  return chordDegrees(deg, size).map((d) => degreeToMidi(scaleSteps, rootMidi, d));
}

/** Voicing proche du précédent (conduite des voix) dans une plage donnée. */
// v1.12.0 : opts = { aligned, parallels } (moteur ≥ 21). Avant : base = low - 12 transposait tout l'accord de
// (low % 12) demi-tons (docs/THEORIE.md, §1) ; gardé tel quel pour les moteurs ≤ 20 (morceaux identiques).
export function voiceLead(chord, prev, low = 52, high = 76, opts = null) {
  const aligned = opts === true || !!opts?.aligned, parPen = opts && opts !== true && opts.parallels ? opts.parallels : 0;
  const pcs = chord.map((m) => ((m % 12) + 12) % 12);
  const candidates = [];
  // génère des renversements dans la plage
  const base0 = aligned ? Math.floor(low / 12) * 12 - 12 : low - 12;
  for (let inv = 0; inv < pcs.length; inv++) {
    for (let base = base0; base <= high; base += 12) {
      const notes = [];
      let last = -Infinity;
      for (let i = 0; i < pcs.length; i++) {
        const pc = pcs[(i + inv) % pcs.length];
        let m = base + pc;
        while (m <= last) m += 12;
        notes.push(m); last = m;
      }
      if (notes[0] >= low && notes[notes.length - 1] <= high + 4) candidates.push(notes);
    }
  }
  if (!candidates.length) return chord.slice();
  if (!prev || !prev.length) {
    const mid = (low + high) / 2;
    candidates.sort((a, b) => Math.abs(avg(a) - mid) - Math.abs(avg(b) - mid));
    return candidates[0];
  }
  const pa = avg(prev);
  candidates.sort((a, b) => cost(a) - cost(b));
  return candidates[0];
  function cost(c) {
    let s = 0;
    for (const m of c) { let best = 99; for (const p of prev) best = Math.min(best, Math.abs(m - p)); s += best; }
    return s + Math.abs(avg(c) - pa) * 0.5 + (parPen ? parPen * parallels(prev, c) : 0);
  }
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
/** Nombre de paires de voix en quintes / octaves parallèles entre deux voicings de même taille (classés du grave à l'aigu). */
export function parallels(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
    const i0 = (a[j] - a[i]) % 12, i1 = (b[j] - b[i]) % 12, di = b[i] - a[i], dj = b[j] - a[j];
    if (di && dj && Math.sign(di) === Math.sign(dj) && (i0 === 7 || i0 === 0) && i1 === i0) n++;
  }
  return n;
}
