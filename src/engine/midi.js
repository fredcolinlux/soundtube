// Export MIDI : une piste nommée par instrument (canal dédié), batterie séparée par élément sur le canal 10,
// programmes General MIDI, méta tempo / mesure. Écriture « maison » (aucune dépendance), compatible très longs morceaux.
import zlib from 'node:zlib';

const PPQ = 480;
export const GM_PROGRAM = {
  epiano: 5, rhodes: 4, piano: 0, guitar: 25, mutedguitar: 28, ensemble: 48, spiccato: 48, frenchhorn: 60, harp: 46, vibes: 11, flute: 73, uprightbass: 32, pizz: 45,
  dx7epiano: 5, dx7bass: 37, dx7bell: 14, moogbass: 39, mooglead: 81, junopoly: 90, arplead: 81, talkbox: 85, vocoder: 54, warmpad: 89, pluck: 25, mellow: 73, softbass: 32, housebass: 38, cellobass: 42, bell: 14, square: 80, subdrone: 38,
  strings: 48, darkpad: 95, polysynth: 90, stab: 62, sawbass: 39, acid: 38, sawlead: 81, horn: 60, arpsaw: 81, pulse: 80,
  '909': 38, acidarp: 81, staccato: 45, chiparp: 80, tribass: 38, '808': 38, supersaw: 90, junopad: 89, synthlead: 81, analogbass: 38, jupiterpad: 90, brass80: 62, bass80: 38, arp80: 81,
  reese: 39, neuro: 39, dnbsub: 38, subbass: 38, liquidpad: 89,
  hornsect: 61, orchstab: 55, // v1.11.0 : section de cuivres, coup d'orchestre (lo-fi beatmaker)
};
const INST_TRACKS = [
  ['lead', 'Mélodie', 0], ['chords', 'Accords', 1], ['bass', 'Basse', 2], ['arp', 'Arpèges', 3],
];
const DRUM_TRACKS = [
  ['kick', 'Batterie - Grosse caisse', ['kick', 'boom']],
  ['snare', 'Batterie - Caisse claire', ['snare', 'clap']],
  ['hats', 'Batterie - Charleston', ['hat', 'ohat']],
  ['toms', 'Batterie - Toms', ['tom', 'tomh', 'tomm', 'toml']],
  ['perc', 'Batterie - Percussions', ['rim', 'shaker', 'crash', 'ride', 'cowbell', 'clave', 'congah', 'congam', 'congal', 'maracas']],
];
const DRUM_OF = {}; for (const [id, , kinds] of DRUM_TRACKS) for (const k of kinds) DRUM_OF[k] = id;

const vlq = (n, out) => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); out.push(...b); };
const text = (s) => Array.from(Buffer.from(s, 'utf8'));

export class MidiCollector {
  constructor({ bpm, meter = '4/4', name = 'soundtube', patches = {}, gmDrums, tempos = null }) {
    this.tempos = tempos; // tempos : [[temps, bpm], ...] (mix DJ : dérive de tempo)
    this.bpm = bpm; this.meter = meter; this.name = name; this.patches = patches; this.gm = gmDrums;
    this.notes = {}; // id -> [tickOn, tickOff, note, vel, ...]
  }
  add(e) {
    if (e.inst === 'texture' || e.inst === 'fx' || e.inst === 'scr') return; // v1.11.0 : scratchs = audio seulement
    const on = Math.max(0, Math.round(e.t * PPQ));
    if (e.inst === 'drums') {
      const id = DRUM_OF[e.kind] || 'perc';
      (this.notes[id] ||= []).push(on, on + Math.round(0.2 * PPQ), this.gm[e.kind] || 38, Math.max(1, Math.min(127, Math.round(e.v * 110))));
    } else {
      const off = on + Math.max(10, Math.round(e.d * PPQ));
      (this.notes[e.inst] ||= []).push(on, off, Math.max(0, Math.min(127, e.m)), Math.max(1, Math.min(127, Math.round(e.v * 100))));
    }
  }
  _conductor() {
    const d = []; const [nn, den] = this.meter.split('/').map(Number);
    d.push(0, 0xff, 0x03); const nm = text(this.name); vlq(nm.length, d); d.push(...nm);
    d.push(0, 0xff, 0x58, 4, nn, Math.log2(den), den === 8 ? 12 : 24, 8);
    const T = this.tempos && this.tempos.length ? this.tempos : [[0, this.bpm]]; let last = 0;
    for (const [beat, bpm] of T) {
      const tk = Math.max(last, Math.round(beat * PPQ)); vlq(tk - last, d); last = tk;
      d.push(0xff, 0x51, 3); const us = Math.round(60000000 / bpm); d.push((us >> 16) & 255, (us >> 8) & 255, us & 255);
    }
    d.push(0, 0xff, 0x2f, 0); return d;
  }
  _track(name, ch, program, arr) {
    const d = []; const nm = text(name);
    d.push(0, 0xff, 0x03); vlq(nm.length, d); d.push(...nm);
    if (program != null) d.push(0, 0xc0 | ch, program & 127);
    const evs = [];
    for (let i = 0; i < arr.length; i += 4) { evs.push([arr[i], 1, arr[i + 2], arr[i + 3]]); evs.push([arr[i + 1], 0, arr[i + 2], 0]); }
    evs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let last = 0;
    for (const [t, on, note, vel] of evs) { vlq(t - last, d); last = t; d.push((on ? 0x90 : 0x80) | ch, note, on ? vel : 0); }
    d.push(0, 0xff, 0x2f, 0); return d;
  }
  /** Liste des pistes {id, name, channel, program, data} (seulement celles qui contiennent des notes). */
  tracks() {
    const out = [];
    for (const [id, label, ch] of INST_TRACKS) if (this.notes[id]?.length) {
      const patch = this.patches[id]; const prog = GM_PROGRAM[patch] ?? 0;
      out.push({ id, name: label, channel: ch + 1, program: prog, data: this._track(`${label}${patch ? ' (' + patch + ')' : ''}`, ch, prog, this.notes[id]) });
    }
    for (const [id, label] of DRUM_TRACKS) if (this.notes[id]?.length) out.push({ id, name: label, channel: 10, program: null, data: this._track(label, 9, null, this.notes[id]) });
    return out;
  }
  static file(trackDatas) {
    const chunks = [];
    const hdr = Buffer.alloc(14); hdr.write('MThd', 0); hdr.writeUInt32BE(6, 4); hdr.writeUInt16BE(1, 8); hdr.writeUInt16BE(trackDatas.length, 10); hdr.writeUInt16BE(PPQ, 12);
    chunks.push(hdr);
    for (const d of trackDatas) { const h = Buffer.alloc(8); h.write('MTrk', 0); h.writeUInt32BE(d.length, 4); chunks.push(h, Buffer.from(d)); }
    return Buffer.concat(chunks);
  }
  /** Fichier multipiste complet. */
  full() { return MidiCollector.file([this._conductor(), ...this.tracks().map((t) => t.data)]); }
  /** Un fichier .mid par instrument (avec la piste tempo/mesure). */
  perInstrument() { return this.tracks().map((t) => ({ id: t.id, name: t.name, channel: t.channel, program: t.program, buf: MidiCollector.file([this._conductor(), t.data]) })); }
}

// ---------- ZIP minimal (deflate) sans dépendance
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function makeZip(files) {
  const parts = [], central = []; let off = 0;
  const now = new Date(); const dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), data = f.data, comp = zlib.deflateRawSync(data), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(dt, 10); lh.writeUInt16LE(dd, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    parts.push(lh, name, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(dt, 12); ch.writeUInt16LE(dd, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
