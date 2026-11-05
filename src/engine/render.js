// Moteur de rendu en flux : partition (mouvement par mouvement) -> bus -> effets -> master -> WAV / MP3 (ffmpeg) / MIDI.
// La mémoire reste bornée quelle que soit la durée (morceaux de 4 h) : seuls les sons en cours sont gardés.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { SR, softClip, OnePoleHPStream, SVFStream, FreeverbStream, PingPongStream, ChorusStream } from './dsp.js';
import { renderNote, renderDrum, renderTexture, GM_DRUMS, isAcousticKit, acousticDrum, acousticHas } from './instruments.js';
import { planSong, composeChapter, compose, meterInfo, resolveParams } from './composer.js';
import { mixEnabled, planMix, deckPlan, TRANSITIONS } from './mix.js';
import { STYLES, profileKey } from './styles.js';
import { MOODS } from './styles.js';
import { SCALES } from './theory.js';
import { makeRng, hashSeed } from './rng.js';
import { MidiCollector, makeZip } from './midi.js';
import { LoudnessMeter, TruePeakMeter, TruePeakLimiter } from './loudness.js';
import { wavInfoRegion, id3Args } from './tags.js';
import { LofiTexture, renderScratch } from './lofidsp.js';
export { compose };

export const CHUNK = 32768;
export const TAIL = 3.5;
const BUS = {
  drums:   { gain: 0.72, pan: 0,    rev: 0.07, del: 0,    sc: false },
  bass:    { gain: 0.62, pan: 0,    rev: 0.02, del: 0,    sc: true },
  chords:  { gain: 0.85, pan: 0,    rev: 0.45, del: 0.08, sc: true, hp: 150 },
  lead:    { gain: 0.95, pan: 0.05, rev: 0.32, del: 0.4,  sc: false, hp: 120 },
  arp:     { gain: 0.7,  pan: 0,    rev: 0.32, del: 0.45, sc: true, hp: 200 },
  texture: { gain: 0.55, pan: 0,    rev: 0.45, del: 0,    sc: true, hp: 180 },
  amb:     { gain: 0.6,  pan: 0,    rev: 0.12, del: 0,    sc: false, hp: 70 }, // fond sonore : ni sidechain ni grosse réverbe
};
const BUS_KEYS = Object.keys(BUS);
BUS.scr = { gain: 0.7, pan: 0, rev: 0.12, del: 0.05, sc: false, hp: 150 }; // v1.11.0 : scratchs (lo-fi moteur 20 seulement ; hors BUS_KEYS)
const PUNCH = { frenchtouch: 0.32, hiphop: 0.4, hiphop_lofi: 0.3, dnb: 0.4, techno: 0.35, house: 0.3, lofi: 0.25, synthwave: 0.3, trap: 0.3, cinematic: 0.15 };
const DRUM_PAN = { cowbell: 0.15, clave: -0.25, congah: 0.4, congam: 0.1, congal: -0.3, maracas: 0.35, ride: -0.3, hat: 0.25, ohat: 0.3, shaker: -0.35, rim: -0.2, tom: -0.15, crash: 0.2, tomh: -0.35, tomm: 0, toml: 0.35 };
const DRUM_GAIN = { cowbell: 0.3, clave: 0.3, congah: 0.4, congam: 0.42, congal: 0.45, maracas: 0.26, ride: 0.24, kick: 1, snare: 0.75, clap: 0.6, hat: 0.32, ohat: 0.28, rim: 0.35, shaker: 0.3, tom: 0.7, boom: 1, crash: 0.35, tomh: 0.6, tomm: 0.62, toml: 0.65 };
const DRUM_REV = { cowbell: 1.5, clave: 2, congah: 1.5, congam: 1.5, congal: 1.5, ride: 1.2, snare: 3, clap: 3, rim: 2, tom: 3, boom: 2, crash: 2, tomh: 2.5, tomm: 2.5, toml: 2.5 };
const DRUM_SAT = { tr606: 1.3, tr707: 1.45, dr110: 1.35, tr808: 1.35, tr909: 1.7, lofi: 2.0, soft: 1.1, retro: 1.5, house: 1.5, techno: 1.9, chip: 1, trap: 1.7, cinema: 1.25, boombap: 1.3, dnb: 1.3, break: 1.4, hhlofi: 1.6 }; // v1.6 : kits acoustiques, saturation allégée (break 1.9 -> 1.4)
// passe-haut 2 pôles (Chamberlin/TPT), état conservé de bloc en bloc
class HP2Stream {
  constructor(fc, q = 0.707) { const g = Math.tan(Math.PI * fc / SR); this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2; this.ic1 = 0; this.ic2 = 0; }
  process(buf, n = buf.length) {
    const { a1, a2, a3, k } = this; let { ic1, ic2 } = this;
    for (let i = 0; i < n; i++) { const x = buf[i], v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3; ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2; buf[i] = x - k * v1 - v2; }
    this.ic1 = ic1; this.ic2 = ic2;
  }
}
// passe-bas 2 pôles (même structure)
class LP2Stream extends HP2Stream {
  process(buf, n = buf.length, out = buf) {
    const { a1, a2, a3 } = this; let { ic1, ic2 } = this;
    for (let i = 0; i < n; i++) { const v3 = buf[i] - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3; ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2; out[i] = v2; }
    this.ic1 = ic1; this.ic2 = ic2;
  }
}
const BASS_SAT = { frenchtouch: 1.55, lofi: 1.6, ambient: 1.05, synthwave: 1.5, house: 1.5, techno: 1.8, cinematic: 1.2, chiptune: 1, trap: 1.4, hiphop: 1.25, hiphop_trap: 1.4, dnb: 1.3, dnb_neuro: 1.15 };
// Équilibre de mixage visé (part du RMS total par bus) : corrige l'écart de niveau entre sons échantillonnés et synthétiques.
const MIX_TARGET = {
  lofi:      { drums: 0.32, bass: 0.2,  chords: 0.22, lead: 0.16, arp: 0.1 },
  ambient:   { drums: 0.05, bass: 0.2,  chords: 0.35, lead: 0.25, arp: 0.15 },
  synthwave: { drums: 0.3,  bass: 0.18, chords: 0.22, lead: 0.2,  arp: 0.1 },
  house:     { drums: 0.36, bass: 0.2,  chords: 0.2,  lead: 0.14, arp: 0.1 },
  frenchtouch: { drums: 0.36, bass: 0.22, chords: 0.22, lead: 0.13, arp: 0.08 },
  techno:    { drums: 0.42, bass: 0.22, chords: 0.12, lead: 0.1,  arp: 0.14 },
  cinematic: { drums: 0.18, bass: 0.2,  chords: 0.3,  lead: 0.2,  arp: 0.12 },
  chiptune:  { drums: 0.25, bass: 0.2,  chords: 0.15, lead: 0.25, arp: 0.15 },
  trap:      { drums: 0.32, bass: 0.28, chords: 0.15, lead: 0.17, arp: 0.08 },
  hiphop:    { drums: 0.36, bass: 0.22, chords: 0.22, lead: 0.12, arp: 0.08 },
  hiphop_trap: { drums: 0.32, bass: 0.28, chords: 0.15, lead: 0.17, arp: 0.08 },
  dnb:       { drums: 0.38, bass: 0.24, chords: 0.18, lead: 0.12, arp: 0.08 },
  dnb_neuro: { drums: 0.38, bass: 0.3,  chords: 0.12, lead: 0.1,  arp: 0.1 },
  // v1.11.0 : lo-fi moteur 20, par sous-genre
  lofi_jazzy:     { drums: 0.28, bass: 0.2,  chords: 0.26, lead: 0.16, arp: 0.1 },
  lofi_chillhop:  { drums: 0.32, bass: 0.2,  chords: 0.22, lead: 0.16, arp: 0.1 },
  lofi_lofihouse: { drums: 0.36, bass: 0.22, chords: 0.2,  lead: 0.12, arp: 0.1 },
  lofi_ambient:   { drums: 0.1,  bass: 0.18, chords: 0.36, lead: 0.22, arp: 0.14 },
  lofi_sad:       { drums: 0.26, bass: 0.18, chords: 0.28, lead: 0.18, arp: 0.1 },
  lofi_beatmaker: { drums: 0.36, bass: 0.22, chords: 0.22, lead: 0.14, arp: 0.06 },
};
const panG = (p) => [Math.cos((p + 1) * Math.PI / 4) * Math.SQRT2, Math.sin((p + 1) * Math.PI / 4) * Math.SQRT2];

/** Itère les événements du morceau, mouvement par mouvement (jamais toute la partition en mémoire). */
function* eventStream(plan, spbSamples, fromSample = 0, toSample = Infinity, onEvent) {
  const state = {};
  for (let ci = 0; ci < plan.chapters.length; ci++) {
    const evs = composeChapter(plan, ci, state);
    for (const e of evs) {
      if (onEvent) onEvent(e);
      const st = Math.round(e.t * spbSamples);
      if (st < fromSample || st >= toSample) continue;
      yield [st, e];
    }
    const nextStart = (plan.chapters[ci + 1]?.startBar ?? Infinity) * plan.bpb * spbSamples;
    if (nextStart - 30 * SR > toSample) return;
  }
}

// v1.8.0 (French Touch) : passe-bas résonant automatisé (TPT/SVF, coefficients recalculés toutes les 32 échantillons)
class SweepLP {
  constructor(floor = 0) { this.s = [0, 0, 0, 0]; this.floor = floor; }
  /** x : position normalisée du filtre par échantillon (0 fermé … 1 ouvert). */
  process(L, R, n, X) {
    const s = this.s, fl = this.floor;
    let a1 = 1, a2 = 0, a3 = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 31) === 0) {
        const x = fl + (1 - fl) * X[i], fc = Math.min(0.45 * SR, 180 * 110 ** x), g = Math.tan(Math.PI * fc / SR), k = 1 / (0.707 + 2.6 * (1 - x) ** 1.5);
        a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
      }
      let v3 = L[i] - s[1], v1 = a1 * s[0] + a2 * v3, v2 = s[1] + a2 * s[0] + a3 * v3; s[0] = 2 * v1 - s[0]; s[1] = 2 * v2 - s[1]; L[i] = v2;
      v3 = R[i] - s[3]; v1 = a1 * s[2] + a2 * v3; v2 = s[3] + a2 * s[2] + a3 * v3; s[2] = 2 * v1 - s[2]; s[3] = 2 * v2 - s[3]; R[i] = v2;
    }
  }
}
// v1.9.0 (French Touch) : passe-bas 24 dB/oct (deux SVF en cascade), résonance modérée réglable (Q du 2e étage)
class SweepLP24 {
  constructor(floor = 0) { this.s = new Float64Array(8); this.floor = floor; }
  process(L, R, n, X, Qa) {
    const s = this.s, fl = this.floor;
    let a1 = 1, a2 = 0, a3 = 0, b1 = 1, b2 = 0, b3 = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 31) === 0) {
        const x = fl + (1 - fl) * X[i], fc = Math.min(0.45 * SR, 160 * 120 ** x), g = Math.tan(Math.PI * fc / SR);
        const k1 = 1 / 0.54, k2 = 1 / (0.6 + (Qa ? Qa[i] : 0.5) * 3.2 * (1 - x) ** 1.3);
        a1 = 1 / (1 + g * (g + k1)); a2 = g * a1; a3 = g * a2; b1 = 1 / (1 + g * (g + k2)); b2 = g * b1; b3 = g * b2;
      }
      for (let c = 0; c < 2; c++) {
        const B = c ? R : L, o = c * 4;
        let v3 = B[i] - s[o + 1], v1 = a1 * s[o] + a2 * v3, v2 = s[o + 1] + a2 * s[o] + a3 * v3; s[o] = 2 * v1 - s[o]; s[o + 1] = 2 * v2 - s[o + 1];
        const y = v2; v3 = y - s[o + 3]; v1 = b1 * s[o + 2] + b2 * v3; v2 = s[o + 3] + b2 * s[o + 2] + b3 * v3; s[o + 2] = 2 * v1 - s[o + 2]; s[o + 3] = 2 * v2 - s[o + 3];
        B[i] = v2;
      }
    }
  }
}
// phaser stéréo 4 étages (allpass 1er ordre, LFO lent, réinjection) — nappes « disco » qui tournent
class PhaserStream {
  constructor(depth, rate = 0.25) { this.d = depth; this.rate = rate; this.ph = 0; this.z = [new Float64Array(4), new Float64Array(4)]; this.fb = [0, 0]; }
  process(L, R, n) {
    const w = (2 * Math.PI * this.rate) / SR, mix = 0.5 * Math.min(1, this.d);
    let aL = 0, aR = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) {
        const fl = 320 * 8 ** (0.5 + 0.5 * Math.sin(this.ph)), fr = 320 * 8 ** (0.5 + 0.5 * Math.sin(this.ph + Math.PI / 2));
        const tl = Math.tan(Math.PI * fl / SR), tr = Math.tan(Math.PI * fr / SR); aL = (1 - tl) / (1 + tl); aR = (1 - tr) / (1 + tr);
      }
      this.ph += w; if (this.ph > 2 * Math.PI) this.ph -= 2 * Math.PI;
      for (let c = 0; c < 2; c++) {
        const B = c ? R : L, z = this.z[c], a = c ? aR : aL;
        let y = B[i] + 0.45 * this.fb[c];
        for (let k = 0; k < 4; k++) { const o = -a * y + z[k]; z[k] = y + a * o; y = o; }
        this.fb[c] = y; B[i] = B[i] * (1 - mix) + y * mix;
      }
    }
  }
}
// flanger léger (1-5 ms, réinjection 0,5) sur le bus batterie
class FlangerStream {
  constructor(depth, rate = 0.12) { this.d = depth; this.rate = rate; this.ph = 0; this.N = 1024; this.buf = [new Float32Array(1024), new Float32Array(1024)]; this.w = 0; }
  process(L, R, n) {
    const N = this.N, inc = (2 * Math.PI * this.rate) / SR, mix = 0.5 * Math.min(1, this.d);
    for (let i = 0; i < n; i++) {
      this.ph += inc; if (this.ph > 2 * Math.PI) this.ph -= 2 * Math.PI;
      for (let c = 0; c < 2; c++) {
        const B = c ? R : L, bf = this.buf[c];
        const dly = (0.001 + 0.002 * (1 + Math.sin(this.ph + c * 0.6))) * SR, rp = this.w - dly, i0 = Math.floor(rp), fr = rp - i0;
        const a = bf[(i0 + N) & (N - 1)], b = bf[(i0 + 1 + N) & (N - 1)], d = a + (b - a) * fr;
        bf[this.w] = B[i] + 0.5 * d; B[i] = B[i] * (1 - mix * 0.5) + d * mix;
      }
      this.w = (this.w + 1) & (N - 1);
    }
  }
}

/** Chaîne pré-master (synthèse + bus + effets), état conservé de bloc en bloc. */
class PreMaster {
  constructor(plan, rnd, events, levelMul = null) {
    const P = plan.params, S = plan.S, F = plan.F, M = MOODS[P.mood];
    this.P = P; this.S = S; this.F = F; this.rnd = rnd; this.events = events; this.pending = null;
    this.spb = 60 / P.bpm;
    this.keys = S.mix.lofi20 ? [...BUS_KEYS, 'scr'] : BUS_KEYS;
    if (S.mix.tex) this.tex = new LofiTexture(S.mix.tex, hashSeed(P.seed, 'lofiTex', P.variation)); // v1.11.0 : vinyle, bande, poussière, chaleur
    this.bright = (M.bright || 1) * (0.85 + 0.3 * SCALES[P.scale].bright) * (S.mix.bright || 1);
    this.revMul = (S.mix.reverb / 0.3) * (M.reverb || 1);
    this.delMul = S.mix.delay / 0.2;
    this.width = S.mix.width ?? 1;
    this.active = [];
    this.kicks = [];
    this.drumCache = {};
    this.acc = {}; for (const k of this.keys) this.acc[k] = [new Float32Array(CHUNK), new Float32Array(CHUNK)];
    this.revL = new Float32Array(CHUNK); this.revR = new Float32Array(CHUNK); this.delL = new Float32Array(CHUNK); this.delR = new Float32Array(CHUNK);
    this.dl = new Float32Array(CHUNK); this.dr = new Float32Array(CHUNK); this.rl = new Float32Array(CHUNK); this.rr = new Float32Array(CHUNK);
    this.L = new Float32Array(CHUNK); this.R = new Float32Array(CHUNK); this.duck = new Float32Array(CHUNK);
    this.busHP = {}; for (const k of this.keys) if (BUS[k].hp) this.busHP[k] = [new OnePoleHPStream(BUS[k].hp), new OnePoleHPStream(BUS[k].hp)];
    this.chorus = S.mix.chorus ? { chords: new ChorusStream(0.5, 2.1, 7, S.mix.chorus), arp: new ChorusStream(0.83, 1.6, 6, S.mix.chorus * 0.8) } : {};
    if (S.mix.chorusLead) this.chorus.lead = new ChorusStream(0.62, 1.3, 6.5, S.mix.chorusLead); // ensemble façon Juno sur le lead (synthwave)
    this.ping = new PingPongStream(this.spb * (S.mix.delayBeats || 0.75), 0.38, 3200);
    this.revHP = [new OnePoleHPStream(180), new OnePoleHPStream(180)];
    this.verb = new FreeverbStream({ room: Math.min(0.92, 0.78 + 0.1 * S.mix.reverb * (M.reverb || 1)), damp: 0.35 });
    const v = S.mix.vintage || 0; this.vintage = v;
    if (v > 0.02) {
      this.lofiLP = [new SVFStream(3000 + 15000 * (1 - v) ** 2, 0.6), new SVFStream(3000 + 15000 * (1 - v) ** 2, 0.6)];
      this.hist = [new Float32Array(CHUNK + 512), new Float32Array(CHUNK + 512)];
      this.maxD = Math.round(0.004 * SR * Math.min(1.6, v / 0.6) * (S.mix.wow || 1));
    }
    this.hp28 = [new OnePoleHPStream(28), new OnePoleHPStream(28)];
    this.levels = {}; for (const k of this.keys) this.levels[k] = BUS[k].gain * ((S.mix.levels || {})[k] ?? 1) * (k === 'lead' ? (S.mix.leadGain || 1) : 1) * (levelMul?.[k] ?? 1);
    this.busSq = {}; for (const k of this.keys) this.busSq[k] = 0; this.busSq.reverb = 0; this.busN = 0;
    const kit = S.drums.kit;
    this.busSat = [['drums', S.mix.drumSat ?? DRUM_SAT[kit] ?? 1.2], ['bass', S.mix.bassSat ?? BASS_SAT[profileKey(P)] ?? BASS_SAT[P.style] ?? 1.2]].filter(([, d]) => d > 1.01);
    // compression parallèle du bus batterie (réalisme v1.5) : quantité selon le style
    const pm = S.mix.punch ?? PUNCH[profileKey(P)] ?? PUNCH[P.style] ?? 0;
    this.punch = pm > 0 ? { env: 0, at: 1 - Math.exp(-1 / (0.004 * SR)), rl: 1 - Math.exp(-1 / (0.12 * SR)), thr: 0.12, ratio: 4, mk: 2.2, mix: pm } : null;
    this.drumRng = (kind) => makeRng(hashSeed(P.seed, 'drum', kind, S.drums.kit));
    // v1.6 : kits acoustiques (échantillons partagés entre decks), passe-haut 30 Hz sur le bus batterie
    this.acoustic = isAcousticKit(kit);
    this.hasHalf = this.acoustic && acousticHas(kit, 'hhalf');
    if (this.acoustic) this.drumHP = [new HP2Stream(30), new HP2Stream(30)];
    // basse : sub mono sous ~120 Hz, passe-haut ~32 Hz, sidechain court dédié, largeur du haut du spectre (neuro)
    this.monoSub = !!S.mix.monoSub;
    if (this.monoSub) { this.bassHP = [new HP2Stream(32), new HP2Stream(32)]; this.sideLP = new LP2Stream(120); this.sideTmp = new Float32Array(CHUNK); }
    this.bassWidth = S.mix.bassWidth || 1;
    this.scBass = S.mix.scBass || 0;
    this.pianoSound = F.pianoSound || null; this.rhodesSound = F.rhodesSound || null;
    // v1.8.0 : balayage de filtre (événements « fx »), phaser des accords, flanger de la batterie
    this.fx = []; this.sweep = null;
    this.ft = S.mix.ft19 ? { pump: S.mix.pump || null, glue: S.mix.drumGlue ? { env: 0, at: 1 - Math.exp(-1 / (0.008 * SR)), rl: 1 - Math.exp(-1 / (0.09 * SR)), thr: 0.28, ratio: 3, mk: 1.3 } : null } : null;
    if (S.mix.ft19 && S.mix.filterSweep) { this.fxX = new Float32Array(CHUNK); this.fxD = new Float32Array(CHUNK); this.fxQ = new Float32Array(CHUNK); this.sweep = { chords: new SweepLP24(0), arp: new SweepLP24(0), bass: new SweepLP24(0.3), drums: new SweepLP24(0), rev: new SweepLP24(0.3), del: new SweepLP24(0.2), ft: true }; }
    else if (S.mix.filterSweep) { this.fxX = new Float32Array(CHUNK); this.sweep = { chords: new SweepLP(0), arp: new SweepLP(0), texture: new SweepLP(0), bass: new SweepLP(0.42), rev: new SweepLP(0.3), del: new SweepLP(0.2) }; }
    this.phaser = S.mix.phaser ? new PhaserStream(S.mix.phaser) : null;
    this.phaserArp = S.mix.phaserArp ? new PhaserStream(S.mix.phaserArp, 0.17) : null;
    for (const k of ['chords', 'arp']) if (S.mix[k + 'Sat'] > 1.01) this.busSat.push([k, S.mix[k + 'Sat']]);
    this.flanger = S.mix.flanger ? new FlangerStream(S.mix.flanger) : null;
  }

  _addEvent(start, e) {
    if (e.inst === 'fx') { if (e.kind === 'lpf' && this.sweep) this.fx.push({ s: start, e: start + Math.round(e.d * this.spb * SR), a: e.a, b: e.b, da: e.da ?? 1, db: e.db ?? 1, q: e.q ?? 0.5 }); return; }
    const S = this.S, F = this.F, cfg = BUS[e.inst];
    if (e.inst === 'drums') {
      if (this.acoustic) {
        // kit acoustique : frappe choisie par vélocité (4 couches) ; notes fantômes = caisse claire étouffée ;
        // charleston mi-ouvert sur certains accents ; aucune normalisation par frappe
        const h = Math.imul(start | 0, 2654435761) >>> 0, rr = h >>> 29;
        let kind = e.kind;
        if (kind === 'snare' && (e.g || e.v < 0.3) && acousticHas(S.drums.kit, 'ghost')) kind = 'ghost';
        else if (kind === 'hat' && this.hasHalf && e.v > 0.95 && ((h >>> 24) & 7) === 0) kind = 'hhalf';
        const smp = acousticDrum(S.drums.kit, kind, e.v, rr, F.drumTune);
        if (smp) {
          const gk = kind === 'ghost' ? 'snare' : kind === 'hhalf' ? 'hat' : kind;
          const g = DRUM_GAIN[gk] * Math.max(0, e.v) * (kind === 'ghost' ? 1.15 : 1);
          const [pl, pr] = panG((DRUM_PAN[gk] || 0) * this.width);
          const ck = kind === 'hhalf' ? 'ohat' : gk; // le mi-ouvert est étouffé par le fermé suivant
          if (ck === 'hat') this._choke(start);
          this.active.push({ L: smp, R: null, start, bus: 'drums', kind: ck, gl: g * pl, gr: g * pr, rev: cfg.rev * (DRUM_REV[gk] || 0.5) * this.revMul, del: 0 });
          if (kind === 'kick') this.kicks.push(start);
          return;
        }
      }
      // couche de vélocité + variante « round-robin » (hachage sans état -> rendu déterministe)
      const layer = e.v > 0.92 ? 2 : e.v > 0.62 ? 1 : 0, rr = (Math.imul(start | 0, 2654435761) >>> 29) % 3;
      const key = e.kind + layer + rr;
      if (!this.drumCache[key]) this.drumCache[key] = renderDrum(S.drums.kit, e.kind, this.drumRng(e.kind + ':' + layer + ':' + rr), F.drumTune, { layer, rr });
      const smp = this.drumCache[key];
      const g = DRUM_GAIN[e.kind] * Math.max(0, e.v);
      const [pl, pr] = panG((DRUM_PAN[e.kind] || 0) * this.width);
      // le charleston fermé coupe le charleston ouvert en cours (groupe d'étouffement, comme sur les boîtes à rythmes)
      if (e.kind === 'hat') this._choke(start);
      this.active.push({ L: smp, R: null, start, bus: 'drums', kind: e.kind, gl: g * pl, gr: g * pr, rev: cfg.rev * (DRUM_REV[e.kind] || 0.5) * this.revMul * ((S.mix.drumRev || {})[e.kind] || 1), del: 0 });
      if (e.kind === 'kick' || e.kind === 'boom') this.kicks.push(start);
    } else if (e.inst === 'texture') {
      const [tl, tr] = renderTexture(e.kind, e.d * this.spb, e.v, this.rnd, this.P.bpm, { t0: start / SR, xf: e.xf ? e.xf * this.spb : 0 });
      const bus = e.amb ? 'amb' : 'texture';
      this.active.push({ L: tl, R: tr, start, bus, gl: 1, gr: 1, rev: BUS[bus].rev * this.revMul, del: 0 });
    } else if (e.inst === 'scr') {
      const [sl, sr] = renderScratch(e, this.spb, hashSeed(this.P.seed, 'scr'));
      const bus = this.acc.scr ? 'scr' : 'lead';
      this.active.push({ L: sl, R: sr, start, bus, gl: 1, gr: 1, rev: BUS.scr.rev * this.revMul, del: BUS.scr.del * this.delMul });
    } else {
      const patch = e.patch || S.patches[e.inst];
      const smp = renderNote(patch, e.m, Math.max(0.03, e.d * this.spb), Math.min(1.2, e.v), { bright: this.bright * (e.f || 1), rnd: this.rnd, acc: e.acc, glide: e.glide, port: e.port, wob: e.wob, bpm: this.P.bpm, tone: F.tone[e.inst], pianoSound: this.pianoSound, rhodesSound: this.rhodesSound });
      let pan = cfg.pan;
      if (e.inst === 'chords') pan = ((e.m % 5) - 2) * 0.18;
      if (e.inst === 'arp') pan = (Math.round(e.t * 4) % 2) ? 0.4 : -0.4;
      const [pl, pr] = panG(Math.max(-1, Math.min(1, pan * this.width)));
      this.active.push({ L: smp.L || smp, R: smp.R || null, start, bus: e.inst, gl: pl, gr: pr, rev: cfg.rev * this.revMul * (e.rv || 1), del: cfg.del * this.delMul * (e.dt || 1) });
    }
  }

  _choke(start) {
    for (const a of this.active) if (a.kind === 'ohat' && a.start < start) {
      const cut = start - a.start, F = 160; if (cut + F < a.L.length) { const c = a.L.slice(0, cut + F); for (let i = 0; i < F; i++) c[cut + i] *= 1 - i / F; a.L = c; }
    }
  }

  /** Calcule le bloc [c0, c0+n) ; renvoie {L, R} (vues sur des tampons réutilisés). */
  process(c0, n) {
    const c1 = c0 + n;
    for (const k of this.keys) { this.acc[k][0].fill(0, 0, n); this.acc[k][1].fill(0, 0, n); }
    this.revL.fill(0, 0, n); this.revR.fill(0, 0, n); this.delL.fill(0, 0, n); this.delR.fill(0, 0, n);
    // nouveaux événements
    for (;;) {
      if (!this.pending) { const it = this.events.next(); if (it.done) break; this.pending = it.value; }
      if (this.pending[0] >= c1) break;
      this._addEvent(this.pending[0], this.pending[1]); this.pending = null;
    }
    // mixage des sons actifs
    const keep = [];
    for (const a of this.active) {
      const len = a.L.length, i0 = Math.max(0, c0 - a.start), i1 = Math.min(len, c1 - a.start);
      if (i1 > i0 && (!this.stem || this.stem(a))) { // v1.14.0 : stem = groupe d'instruments isolé (null = rendu normal, inchangé)
        const [bl, br] = this.acc[a.bus], o = a.start - c0;
        const src = a.L, srcR = a.R || a.L, gl = a.gl, gr = a.gr, rv = a.rev, dv = a.del;
        const revL = this.revL, revR = this.revR, delL = this.delL, delR = this.delR;
        for (let i = i0; i < i1; i++) {
          const j = i + o, xl = src[i] * gl, xr = srcR[i] * gr;
          bl[j] += xl; br[j] += xr;
          if (rv) { revL[j] += xl * rv; revR[j] += xr * rv; }
          if (dv) { delL[j] += xl * dv; delR[j] += xr * dv; }
        }
      }
      if (a.start + len > c1) keep.push(a);
    }
    this.active = keep;
    // sidechain (pompe) depuis la grosse caisse
    const S = this.S, sc = S.mix.sidechain;
    if (sc > 0 && this.kicks.length) {
      const duck = this.duck; duck.fill(1, 0, n);
      const len = Math.round(Math.min(0.32, this.spb * 0.9) * SR);
      this.kicks = this.kicks.filter((s) => s + len > c0);
      for (const s of this.kicks) {
        const a = Math.max(0, c0 - s), b = Math.min(len, c1 - s);
        for (let i = a; i < b; i++) { const g = 1 - sc * (1 - i / len) ** 2; const j = s + i - c0; if (g < duck[j]) duck[j] = g; }
      }
      for (const k of this.keys) if (BUS[k].sc) { const [bl, br] = this.acc[k]; for (let i = 0; i < n; i++) { bl[i] *= duck[i]; br[i] *= duck[i]; } }
      if (S.mix.scLead) { const [bl, br] = this.acc.lead, a = S.mix.scLead; for (let i = 0; i < n; i++) { const g = 1 - a * (1 - duck[i]); bl[i] *= g; br[i] *= g; } } // colle : le lead respire aussi avec le kick
    }
    // v1.9.0 French Touch : pompe profonde sur chaque grosse caisse (attaque ~2 ms, retour en ~1 croche), par bus
    if (this.ft && this.ft.pump && this.kicks.length) {
      const pp = this.ft.pump, duck = this.duck, att = Math.round(0.002 * SR), rel = Math.round(this.spb * (pp.rel || 0.5) * SR), len = att + rel;
      duck.fill(0, 0, n);
      this.kicks = this.kicks.filter((s) => s + len > c0);
      for (const s of this.kicks) {
        const a = Math.max(0, c0 - s), b = Math.min(len, c1 - s);
        for (let i = a; i < b; i++) { const x = i < att ? i / att : (1 - (i - att) / rel) ** (pp.curve || 1.7); const j = s + i - c0; if (x > duck[j]) duck[j] = x; }
      }
      for (const k of ['chords', 'arp', 'bass', 'texture', 'lead']) { const d = pp[k]; if (!d) continue; const [bl, br] = this.acc[k]; for (let i = 0; i < n; i++) { const g = 1 - d * duck[i]; bl[i] *= g; br[i] *= g; } }
    }
    // sidechain dédié de la basse (DnB : le sub s'efface sous chaque grosse caisse, ~90 ms)
    if (this.scBass > 0 && this.kicks.length) {
      const [bl, br] = this.acc.bass, len = Math.round(0.09 * SR), d = this.scBass;
      for (const s of this.kicks) {
        const a = Math.max(0, c0 - s), b = Math.min(len, c1 - s);
        for (let i = a; i < b; i++) { const x = i / len, g = 1 - d * (x < 0.08 ? x / 0.08 : (1 - x) ** 1.5); const j = s + i - c0; bl[j] *= g; br[j] *= g; }
      }
      if (!(sc > 0)) { const keepLen = len; this.kicks = this.kicks.filter((s) => s + keepLen > c0); }
    }
    // sub mono + largeur du haut (M/S sur le bus basse)
    if (this.monoSub) {
      const [bl, br] = this.acc.bass, st = this.sideTmp, w = this.bassWidth;
      this.bassHP[0].process(bl, n); this.bassHP[1].process(br, n);
      for (let i = 0; i < n; i++) st[i] = (bl[i] - br[i]) * 0.5;
      const lo = this.sideLo || (this.sideLo = new Float32Array(CHUNK));
      this.sideLP.process(st, n, lo);
      for (let i = 0; i < n; i++) { const m = (bl[i] + br[i]) * 0.5, sd = (st[i] - lo[i]) * w; bl[i] = m + sd; br[i] = m - sd; }
    }
    if (this.drumHP) { this.drumHP[0].process(this.acc.drums[0], n); this.drumHP[1].process(this.acc.drums[1], n); }
    if (this.ft && this.ft.glue) {
      const [bl, br] = this.acc.drums, c = this.ft.glue;
      for (let i = 0; i < n; i++) {
        const x = Math.max(Math.abs(bl[i]), Math.abs(br[i]));
        c.env = x > c.env ? c.env + (x - c.env) * c.at : c.env + (x - c.env) * c.rl;
        const g = (c.env > c.thr ? Math.pow(c.thr / c.env, 1 - 1 / c.ratio) : 1) * c.mk; bl[i] *= g; br[i] *= g;
      }
    }
    // saturation douce des bus batterie et basse (colle, densité)
    for (const [k, d0] of this.busSat) { const [bl, br] = this.acc[k], d = d0 * 0.5, inv = 1 / d; for (let i = 0; i < n; i++) { bl[i] = Math.tanh(bl[i] * d) * inv; br[i] = Math.tanh(br[i] * d) * inv; } }
    // compression parallèle du bus batterie (« New York ») : colle et punch, dosée par style
    if (this.punch) {
      const [bl, br] = this.acc.drums, c = this.punch;
      for (let i = 0; i < n; i++) {
        const x = Math.max(Math.abs(bl[i]), Math.abs(br[i]));
        c.env = x > c.env ? c.env + (x - c.env) * c.at : c.env + (x - c.env) * c.rl;
        const g = c.env > c.thr ? Math.pow(c.thr / c.env, 1 - 1 / c.ratio) : 1, w = 1 + c.mix * (g * c.mk - 1);
        bl[i] *= w; br[i] *= w;
      }
    }
    if (S.mix.crush) { const q = 2 ** S.mix.crush; for (const k of ['chords', 'lead', 'arp', 'bass']) for (const ch of this.acc[k]) for (let i = 0; i < n; i++) ch[i] = Math.round(ch[i] * q) / q; }
    // v1.8.0 : passe-bas automatisé (French Touch), puis phaser / flanger
    if (this.sweep && this.sweep.ft) {
      const X = this.fxX, XD = this.fxD, Q = this.fxQ; X.fill(1, 0, n); XD.fill(1, 0, n); Q.fill(0.5, 0, n);
      this.fx = this.fx.filter((g) => g.e > c0);
      for (const g of this.fx) {
        const a = Math.max(0, g.s - c0), b = Math.min(n, g.e - c0), len = g.e - g.s;
        for (let i = a; i < b; i++) { const p = (c0 + i - g.s) / len; X[i] = g.a + (g.b - g.a) * p; XD[i] = g.da + (g.db - g.da) * p; Q[i] = g.q; }
      }
      for (const k of ['chords', 'arp', 'bass']) this.sweep[k].process(this.acc[k][0], this.acc[k][1], n, X, Q);
      let dOn = false; for (let i = 0; i < n; i += 64) if (XD[i] < 0.999) { dOn = true; break; }
      if (dOn || this.sweep.dWas) { for (let i = 0; i < n; i++) XD[i] = Math.max(0.3, XD[i]); this.sweep.drums.process(this.acc.drums[0], this.acc.drums[1], n, XD, null); }
      this.sweep.dWas = dOn;
      this.sweep.rev.process(this.revL, this.revR, n, X, null); this.sweep.del.process(this.delL, this.delR, n, X, null);
    } else if (this.sweep) {
      const X = this.fxX; X.fill(1, 0, n);
      this.fx = this.fx.filter((g) => g.e > c0);
      for (const g of this.fx) {
        const a = Math.max(0, g.s - c0), b = Math.min(n, g.e - c0), len = g.e - g.s;
        for (let i = a; i < b; i++) X[i] = g.a + (g.b - g.a) * ((c0 + i - g.s) / len);
      }
      for (const k of ['chords', 'arp', 'texture', 'bass']) this.sweep[k].process(this.acc[k][0], this.acc[k][1], n, X);
      this.sweep.rev.process(this.revL, this.revR, n, X); this.sweep.del.process(this.delL, this.delR, n, X);
    }
    if (this.phaser) this.phaser.process(this.acc.chords[0], this.acc.chords[1], n);
    if (this.phaserArp) this.phaserArp.process(this.acc.arp[0], this.acc.arp[1], n);
    if (this.flanger) this.flanger.process(this.acc.drums[0], this.acc.drums[1], n);
    // égalisation (séparation) et chorus
    for (const k in this.busHP) { this.busHP[k][0].process(this.acc[k][0], n); this.busHP[k][1].process(this.acc[k][1], n); }
    for (const k in this.chorus) this.chorus[k].process(this.acc[k][0], this.acc[k][1], n);
    // délai + réverbération
    this.ping.process(this.delL, this.delR, this.dl, this.dr, n);
    const { dl, dr, rl, rr, revL, revR } = this;
    for (let i = 0; i < n; i++) { revL[i] += dl[i] * 0.3; revR[i] += dr[i] * 0.3; }
    this.revHP[0].process(revL, n); this.revHP[1].process(revR, n);
    this.verb.process(revL, revR, rl, rr, n);
    if (this.ft && this.ft.pump && this.ft.pump.rev && this.kicks.length) { const d = this.ft.pump.rev, duck = this.duck; for (let i = 0; i < n; i++) { const g = 1 - d * duck[i]; rl[i] *= g; rr[i] *= g; } } // la queue de réverbe pompe aussi (French Touch)
    // somme
    const L = this.L, R = this.R; L.fill(0, 0, n); R.fill(0, 0, n);
    for (const k of this.keys) {
      const [bl, br] = this.acc[k], g = this.levels[k];
      if (!(this.tex && k === 'amb')) for (let i = 0; i < n; i++) { L[i] += bl[i] * g; R[i] += br[i] * g; }
      let q = 0; for (let i = 0; i < n; i += 7) q += bl[i] * bl[i]; this.busSq[k] += q * g * g;
    }
    { let q = 0; for (let i = 0; i < n; i += 7) q += rl[i] * rl[i]; this.busSq.reverb += q * 0.81; this.busN += Math.ceil(n / 7); }
    for (let i = 0; i < n; i++) { L[i] += dl[i] * 0.55 + rl[i] * 0.9; R[i] += dr[i] * 0.55 + rr[i] * 0.9; }
    // largeur stéréo (M/S)
    if (this.width !== 1) { const w = this.width; for (let i = 0; i < n; i++) { const m = (L[i] + R[i]) * 0.5, s = (L[i] - R[i]) * 0.5 * w; L[i] = m + s; R[i] = m - s; } }
    // v1.11.0 : textures lo-fi sur la musique, puis le fond sonore (non filtré, non pleuré)
    if (this.tex && !this.stem) { this.tex.process(L, R, n, c0); const [bl, br] = this.acc.amb, g = this.levels.amb; for (let i = 0; i < n; i++) { L[i] += bl[i] * g; R[i] += br[i] * g; } }
    // vintage : pleurage, filtre, saturation
    if (this.lofiLP) {
      const H = 512, maxD = this.maxD, v = this.vintage, k = 1 + 0.35 * v / 0.6;
      for (const [ci, X] of [[0, L], [1, R]]) {
        const h = this.hist[ci];
        h.set(X.subarray(0, n), H);
        for (let i = 0; i < n; i++) {
          const t = (c0 + i) / SR;
          const d = maxD * 0.5 * (1 + 0.6 * Math.sin(2 * Math.PI * 0.45 * t) + 0.15 * Math.sin(2 * Math.PI * 5.8 * t));
          const pos = H + i - d; const i0 = Math.floor(pos), fr = pos - i0;
          if (c0 + i - d >= 1) X[i] = h[i0] * (1 - fr) + h[i0 + 1] * fr;
        }
        h.copyWithin(0, n, n + H); // garde les H derniers échantillons d'entrée
        this.lofiLP[ci].process(X, n);
        for (let i = 0; i < n; i++) X[i] = Math.tanh(X[i] * k) / k;
      }
    }
    this.hp28[0].process(L, n); this.hp28[1].process(R, n);
    return { L, R };
  }
  busLevels() {
    const o = {}; const N = Math.max(1, this.busN);
    for (const k of [...this.keys, 'reverb']) o[k] = +Math.sqrt(this.busSq[k] / N).toFixed(4);
    return o;
  }
}

/** Étage master (pré-gain, bande, compresseur, saturation douce, fondus, normalisation). */
class Master {
  constructor(cal, S, N, fadeInS, fadeOutS) {
    this.pre = cal.pre; this.drive = cal.drive; this.norm = cal.norm; this.tape = S.mix.tape || 0;
    this.env = 0; this.att = Math.exp(-1 / (0.005 * SR)); this.rel = Math.exp(-1 / (0.15 * SR));
    this.N = N; this.fadeIn = Math.max(1, Math.round(fadeInS * SR)); this.fadeOutStart = N - Math.round(fadeOutS * SR);
  }
  static tapeSat(x, t) { return t ? (1 - t) * x + t * Math.tanh(1.6 * x) / 0.9217 : x; }
  process(L, R, c0, n, out) {
    const { pre, drive, norm, tape, att, rel } = this; let env = this.env; const thr = 0.35, ratio = 3;
    for (let i = 0; i < n; i++) {
      let l = Master.tapeSat(L[i] * pre, tape), r = Master.tapeSat(R[i] * pre, tape);
      const x = Math.max(Math.abs(l), Math.abs(r));
      env = x > env ? att * env + (1 - att) * x : rel * env + (1 - rel) * x;
      const g = env > thr ? (thr + (env - thr) / ratio) / env : 1;
      const gi = c0 + i;
      let f = 1;
      if (gi < this.fadeIn) f = gi / this.fadeIn;
      if (gi > this.fadeOutStart) f *= Math.max(0, 1 - (gi - this.fadeOutStart) / (this.N - this.fadeOutStart));
      out[2 * i] = softClip(l * g * drive) * f * norm; out[2 * i + 1] = softClip(r * g * drive) * f * norm;
    }
    this.env = env;
  }
}

/** Calibrage du master sur des « sondes » (refrains répartis dans le morceau) : 1 passe au lieu de 2. */
function calibrate(plan, spbS, N, songN, maxProbes = 3) {
  const P = plan.params, S = plan.S;
  const secs = plan.meta.sections;
  const barS = plan.bpb * spbS;
  let windows;
  if (songN <= 150 * SR) windows = [[0, N]];
  else {
    const Bs = secs.filter((s) => s.label === 'Refrain' || s.label === 'Drop');
    const pick = Bs.length ? [Bs[0], Bs[Math.floor(Bs.length / 2)], Bs[Bs.length - 1]] : [secs[Math.floor(secs.length / 2)]];
    const uniq = [...new Set(pick)].slice(0, maxProbes);
    windows = uniq.map((s) => { const a = Math.round(s.startBar * barS); return [a, Math.min(N, a + Math.round(Math.min(s.bars * barS, 20 * SR)))]; });
  }
  // 1) pré-passe courte : mesure des bus -> correction d'équilibre
  const levelMul = {};
  {
    const T = MIX_TARGET[profileKey(P)] || MIX_TARGET[P.style];
    const sec = secs.find((s) => s.label === 'Refrain' || s.label === 'Drop') || secs[Math.floor(secs.length / 2)];
    const a = Math.min(Math.max(0, N - 15 * SR), Math.round(sec.startBar * barS)), b = Math.min(N, a + 15 * SR);
    if (T && b - a > SR) {
      const pm0 = new PreMaster(plan, makeRng(hashSeed(P.seed, 'probe', -1)), eventStream(plan, spbS, Math.max(0, a - 12 * SR), b));
      for (let c = Math.max(0, a - 2 * SR); c < b; c += CHUNK) pm0.process(c, Math.min(CHUNK, b - c));
      const lv = pm0.busLevels(), ks = Object.keys(T).filter((k) => lv[k] > 1e-4);
      const sm = ks.reduce((x, k) => x + lv[k], 0), st = ks.reduce((x, k) => x + T[k], 0);
      for (const k of ks) levelMul[k] = Math.min(3, Math.max(0.35, Math.pow((T[k] / st) / (lv[k] / sm), 0.75)));
    }
  }
  const parts = []; let peak0 = 1e-9, sq0 = 0, n0 = 0;
  for (const [w0, w1] of windows) {
    const warm = Math.min(w0, 3 * SR);
    const s0 = w0 - warm;
    const ev = eventStream(plan, spbS, Math.max(0, s0 - 12 * SR), w1);
    const pm = new PreMaster(plan, makeRng(hashSeed(P.seed, 'probe', w0)), ev, levelMul);
    const L = new Float32Array(w1 - w0), R = new Float32Array(w1 - w0);
    for (let c = s0; c < w1; c += CHUNK) {
      const n = Math.min(CHUNK, w1 - c), r = pm.process(c, n);
      for (let i = 0; i < n; i++) { const g = c + i; if (g >= w0) { L[g - w0] = r.L[i]; R[g - w0] = r.R[i]; peak0 = Math.max(peak0, Math.abs(r.L[i]), Math.abs(r.R[i])); sq0 += r.L[i] * r.L[i] + r.R[i] * r.R[i]; n0 += 2; } }
    }
    parts.push([L, R]);
  }
  const pre = 1 / peak0, tape = S.mix.tape || 0;
  let pk = 1e-9;
  { const att = Math.exp(-1 / (0.005 * SR)), rel = Math.exp(-1 / (0.15 * SR));
    for (const [L, R] of parts) { let env = 0; for (let i = 0; i < L.length; i++) {
      const l = Master.tapeSat(L[i] * pre, tape), r = Master.tapeSat(R[i] * pre, tape), x = Math.max(Math.abs(l), Math.abs(r));
      env = x > env ? att * env + (1 - att) * x : rel * env + (1 - rel) * x;
      const g = env > 0.35 ? (0.35 + (env - 0.35) / 3) / env : 1; pk = Math.max(pk, Math.abs(l * g), Math.abs(r * g));
    } } }
  const drive = 1.35 / pk;
  const pk2 = Math.abs(softClip(1.35));
  return { levelMul, pre, drive, rmsN: Math.sqrt(sq0 / Math.max(1, n0)) * pre, norm: (0.93 / pk2) * (S.mix.master || 1), probes: windows.length, probeSec: windows.reduce((a, [x, y]) => a + (y - x), 0) / SR };
}

// ---------- sorties
class WavSink {
  constructor(path, frames, tags = {}) {
    this.path = path; this.frames = frames; this.fd = fs.openSync(path, 'w+'); this.bytes = 0;
    this.info = wavInfoRegion(tags); this.dataOffset = 36 + this.info.length + 8;
    fs.writeSync(this.fd, this.header(frames));
  }
  header(frames) {
    const h = Buffer.alloc(this.dataOffset), dataBytes = frames * 4, riff = this.dataOffset - 8 + dataBytes;
    h.write('RIFF', 0); h.writeUInt32LE(Math.min(riff, 0xffffffff), 4); h.write('WAVE', 8);
    h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
    h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
    this.info.copy(h, 36);
    h.write('data', this.dataOffset - 8); h.writeUInt32LE(Math.min(dataBytes, 0xffffffff), this.dataOffset - 4);
    return h;
  }
  write(buf) { fs.writeSync(this.fd, buf); this.bytes += buf.length; }
  /** Accès aléatoire (passe 2 du mastering, sur place). */
  read(frame, n, into) { return fs.readSync(this.fd, into, 0, n * 4, this.dataOffset + frame * 4); }
  writeAt(frame, buf) { fs.writeSync(this.fd, buf, 0, buf.length, this.dataOffset + frame * 4); }
  close() {
    const frames = this.bytes / 4;
    if (frames !== this.frames) fs.writeSync(this.fd, this.header(frames), 0, this.dataOffset, 0); // corrige l'en-tête si besoin
    fs.closeSync(this.fd);
  }
}
class Mp3Sink {
  constructor(path, { bitrate = '320k', tags = {}, ffmpeg = 'ffmpeg' } = {}) {
    this.p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 's16le', '-ar', String(SR), '-ac', '2', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', bitrate, ...id3Args(tags), path], { stdio: ['pipe', 'ignore', 'pipe'] });
    this.err = ''; this.p.stderr.on('data', (d) => { this.err += d; });
    this.done = new Promise((res, rej) => { this.p.on('error', rej); this.p.on('close', (code) => (code === 0 ? res() : rej(new Error('ffmpeg : ' + (this.err || code))))); });
    this.p.stdin.on('error', () => {});
  }
  write(buf) { return this.p.stdin.write(buf) ? null : new Promise((r) => this.p.stdin.once('drain', r)); }
  async close() { this.p.stdin.end(); await this.done; }
}
class MemSink {
  constructor() { this.parts = []; }
  write(b) { this.parts.push(Buffer.from(b)); }
  close() { if (this.parts) { this.buffer = Buffer.concat(this.parts); this.parts = null; } }
  read(frame, n, into) { this.close(); return this.buffer.copy(into, 0, frame * 4, Math.min(this.buffer.length, (frame + n) * 4)); }
  writeAt(frame, buf) { this.close(); buf.copy(this.buffer, frame * 4); }
}

/** Cible de loudness (YouTube : -14 LUFS intégrés, -1 dBTP). Plafond interne 0,5 dB plus bas (marge encodeur MP3 / interpolation). */
export const LOUDNESS = { target: -14, truePeak: -1, margin: 0.5 };

/**
 * Passe 2 : lit le PCM 16 bits de la passe 1, applique gain + limiteur true-peak, mesure (LUFS, dBTP),
 * réécrit sur place (writeBack) et alimente les sorties. simulate = mesure seule.
 */
async function masterPass(src, N, gain, ceilDb, { simulate = false, writeBack = null, sinks = [], ditherSeed = 1, onChunk = null, points = 600 } = {}) {
  const lim = new TruePeakLimiter({ gain, ceilingDb: ceilDb });
  const meter = new LoudnessMeter(SR), tpm = new TruePeakMeter();
  const raw = Buffer.alloc(CHUNK * 4), inF = new Float32Array(CHUNK * 2), outF = new Float32Array(CHUNK * 2 + 2 * lim.latency + 16), pcm = Buffer.alloc(outF.length * 2);
  let wpos = 0, sumSq = 0, peakAbs = 0; let st = ditherSeed >>> 0 || 1;
  const step = Math.max(1, Math.floor(N / points)), peaks = new Float32Array(points);
  const rnd = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 4294967296; };
  const emit = async (o) => {
    if (!o) return;
    meter.push(outF, o); tpm.push(outF, o);
    if (simulate) { wpos += o; return; }
    for (let i = 0; i < o; i++) {
      const l = outF[2 * i], r = outF[2 * i + 1];
      sumSq += l * l + r * r; const a = Math.max(Math.abs(l), Math.abs(r)); if (a > peakAbs) peakAbs = a;
      if ((i & 3) === 0) { const p = Math.min(points - 1, Math.floor((wpos + i) / step)); if (a > peaks[p]) peaks[p] = a; }
      pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(l * 32767 + rnd() - rnd()))), 4 * i);
      pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(r * 32767 + rnd() - rnd()))), 4 * i + 2);
    }
    const chunk = pcm.subarray(0, o * 4);
    if (writeBack) writeBack.writeAt(wpos, chunk);
    for (const s of sinks) { const w = s.write(chunk); if (w) await w; }
    wpos += o;
  };
  for (let c0 = 0; c0 < N; c0 += CHUNK) {
    const n = Math.min(CHUNK, N - c0);
    src.read(c0, n, raw);
    for (let i = 0; i < 2 * n; i++) inF[i] = raw.readInt16LE(2 * i) / 32768;
    await emit(lim.process(inF, n, outF));
    if (onChunk) onChunk((c0 + n) / N);
  }
  await emit(lim.flush(outF));
  return { integrated: meter.integrated(), lra: meter.range(), truePeak: tpm.db, limiterDb: 20 * Math.log10(lim.minGain), frames: wpos,
    rms: Math.sqrt(sumSq / (2 * Math.max(1, wpos))), peak: peakAbs, peaks };
}

/**
 * Rendu complet en flux.
 * opts : { wavPath, mp3Path, midPath, midZipPath, memory, bitrate, tags, onProgress(frac, label, info), peaksPoints,
 *          loudness: { target, truePeak } | false }
 */
export async function renderTrack(params, opts = {}) {
  const t0 = Date.now();
  const onProgress = opts.onProgress || (() => {});
  const P0 = resolveParams(params);
  onProgress(0.01, 'Calibrage du mastering', { pos: 0, total: P0.duration });
  const src = mixEnabled(P0) ? prepareMix(P0, opts) : prepareSong(P0, opts);
  const { P, N, songSec, midi } = src;
  const tCal = Date.now() - t0;
  const LZ = opts.loudness === false ? null : { ...LOUDNESS, ...(opts.loudness || {}) };
  const p1Share = LZ ? 0.9 : 0.96;
  // Passe 1 : PCM 16 bits dans le WAV final (ou un fichier temporaire / la mémoire), mesure de loudness au passage.
  let store = null, tmpPath = null, mem = null; const finals = [];
  if (opts.wavPath) store = new WavSink(opts.wavPath, N, opts.tags);
  else if (LZ && opts.mp3Path && !opts.memory) { tmpPath = opts.mp3Path + '.pass1.wav'; store = new WavSink(tmpPath, N); }
  if (opts.memory) { mem = new MemSink(); if (!store) store = mem; else finals.push(mem); }
  const mp3 = opts.mp3Path ? new Mp3Sink(opts.mp3Path, { bitrate: opts.bitrate, tags: opts.tags, ffmpeg: opts.ffmpeg }) : null;
  if (mp3) finals.push(mp3);
  const sinks1 = LZ ? (store ? [store] : []) : [...(store ? [store] : []), ...finals];

  const meter1 = new LoudnessMeter(SR);
  const points = opts.peaksPoints || (songSec > 1800 ? 1200 : 600);
  const step = Math.max(1, Math.floor(N / points));
  const peaks = new Float32Array(points);
  const out = new Float32Array(CHUNK * 2), pcm = Buffer.alloc(CHUNK * 4);
  let sumSq = 0, peakAbs = 0, lastP = 0, loud = null;
  try {
    for (let c0 = 0; c0 < N; c0 += CHUNK) {
      const n = Math.min(CHUNK, N - c0);
      src.synth(c0, n, out);
      if (opts.fixedGain) { const g = opts.fixedGain; for (let i = 0; i < 2 * n; i++) out[i] *= g; }
      if (LZ) meter1.push(out, n);
      for (let i = 0; i < n; i++) {
        const l = out[2 * i], r = out[2 * i + 1];
        sumSq += l * l + r * r;
        const a = Math.max(Math.abs(l), Math.abs(r)); if (a > peakAbs) peakAbs = a;
        if ((i & 3) === 0) { const p = Math.min(points - 1, Math.floor((c0 + i) / step)); if (a > peaks[p]) peaks[p] = a; }
        pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(l * 32767))), 4 * i);
        pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(r * 32767))), 4 * i + 2);
      }
      const chunk = pcm.subarray(0, n * 4);
      for (const s of sinks1) { const w = s.write(chunk); if (w) await w; }
      const now = Date.now();
      if (now - lastP > 700 || c0 + n >= N) {
        lastP = now;
        const frac = (c0 + n) / N, el = (now - t0 - tCal) / 1000;
        onProgress(0.02 + p1Share * frac, 'Synthèse et mixage', { pos: (c0 + n) / SR, total: N / SR, eta: frac > 0.002 ? el * (1 - frac) / frac * (LZ ? 1.08 : 1) : null, speed: el > 0 ? ((c0 + n) / SR) / el : null });
      }
    }
    // Passe 2 : normalisation loudness + limiteur true-peak, réécriture sur place + MP3
    if (LZ) {
      if (store === mem) mem.close();
      const I1 = meter1.integrated(), ceilDb = LZ.truePeak - LZ.margin;
      let gainDb = Number.isFinite(I1) ? LZ.target - I1 : 0, sims = 0, simI = null;
      // si le gain pousse les crêtes au plafond, le limiteur retire un peu de loudness : on corrige par simulation (≤ 2 itérations)
      while (20 * Math.log10(peakAbs + 1e-9) + gainDb > ceilDb - 0.3 && sims < 2) {
        onProgress(0.02 + p1Share, 'Mastering : ajustement du limiteur', {});
        const r = await masterPass(store, N, Math.pow(10, gainDb / 20), ceilDb, { simulate: true });
        sims++; simI = r.integrated; const err = LZ.target - r.integrated;
        if (Math.abs(err) < 0.1) break;
        gainDb += Math.min(6, err);
      }
      let lastQ = 0;
      loud = await masterPass(store, N, Math.pow(10, gainDb / 20), ceilDb, {
        writeBack: store, sinks: finals, ditherSeed: hashSeed(P.seed, 'dither', P.variation), points,
        onChunk: (f) => { const now = Date.now(); if (now - lastQ > 700) { lastQ = now; onProgress(0.02 + p1Share + (0.98 - 0.02 - p1Share) * f, `Mastering YouTube (${LZ.target} LUFS)`, {}); } },
      });
      Object.assign(loud, { target: LZ.target, ceiling: LZ.truePeak, internalCeiling: ceilDb, gainDb, pass1: I1, simulations: sims });
      for (let i = 0; i < points; i++) peaks[i] = loud.peaks[i];
      sumSq = loud.rms * loud.rms * 2 * N; peakAbs = loud.peak;
    }
  } finally {
    if (store && store !== mem) store.close();
    for (const s of LZ ? finals : [...finals]) await s.close();
    if (mem && store === mem) mem.close();
    if (tmpPath) fs.rmSync(tmpPath, { force: true });
  }
  const files = {};
  if (opts.midPath || opts.midZipPath) {
    const full = midi.full();
    if (opts.midPath) fs.writeFileSync(opts.midPath, full);
    const per = midi.perInstrument();
    if (opts.midZipPath) {
      const base = (opts.zipBase || 'soundtube').replace(/[^\w\-]+/g, '_');
      fs.writeFileSync(opts.midZipPath, makeZip([{ name: `${base}-complet.mid`, data: full }, ...per.map((t, i) => ({ name: `${String(i + 1).padStart(2, '0')}-${t.id}.mid`, data: t.buf }))]));
    }
    files.midiTracks = per.map((t) => ({ id: t.id, name: t.name, channel: t.channel, program: t.program }));
  }
  const rms = Math.sqrt(sumSq / (2 * N));
  const loudness = loud ? { target: loud.target, integrated: +loud.integrated.toFixed(2), truePeak: +loud.truePeak.toFixed(2), lra: +loud.lra.toFixed(1),
    gainDb: +loud.gainDb.toFixed(2), limiterDb: +loud.limiterDb.toFixed(2), ceiling: loud.ceiling, before: +loud.pass1.toFixed(2), simulations: loud.simulations } : null;
  return {
    plan: src.plan, meta: src.meta, params: P, seconds: N / SR, frames: N, rms, peak: peakAbs, busLevels: src.busLevels(), loudness,
    peaks: Array.from(peaks, (v) => Math.round(v * 1000) / 1000), renderMs: Date.now() - t0, calibration: src.calibration, ...(src.mixStats ? { mixStats: src.mixStats() } : {}),
    pcm: mem ? mem.buffer : null, ...files,
  };
}

/** Morceau unique (comportement historique). */
function prepareSong(P0, opts) {
  const plan = planSong(P0);
  const P = plan.params, S = plan.S;
  const MI = meterInfo(P); plan.bpb = MI.bpb;
  const spbS = (60 / P.bpm) * SR;
  const songSec = plan.meta.seconds;
  const adv = P.adv || {};
  const fadeOut = adv.fadeOut != null ? Math.max(0.5, adv.fadeOut) : 3;
  const N = Math.ceil((songSec + TAIL) * SR);
  const cal = calibrate(plan, spbS, N, Math.round(songSec * SR));
  const midi = new MidiCollector({ bpm: P.bpm, meter: MI.meter, name: opts.title || `soundtube ${S.label} #${P.seed}`, patches: S.patches, gmDrums: GM_DRUMS });
  const pm = new PreMaster(plan, makeRng(hashSeed(P.seed, 'audio', P.variation)), eventStream(plan, spbS, 0, Infinity, (e) => midi.add(e)), cal.levelMul);
  if (opts.stem) pm.stem = opts.stem;
  const master = new Master(cal, S, N, adv.fadeIn != null ? Math.max(0.01, adv.fadeIn) : 0.01, Math.min(fadeOut + TAIL, songSec));
  return { P, N, songSec, midi, plan, meta: plan.meta, calibration: cal, busLevels: () => pm.busLevels(),
    synth: (c0, n, out) => { const { L, R } = pm.process(c0, n); master.process(L, R, c0, n, out); } };
}

// ---------- mix DJ : decks, crossover, filtres, fondus
/** Filtre d'état variable (TPT) : sorties passe-bas / passe-haut, coefficients modifiables. */
class SVF {
  constructor() { this.ic1 = 0; this.ic2 = 0; this.set(1000, 0.7071); }
  set(fc, q) { const g = Math.tan(Math.PI * Math.min(SR * 0.45, Math.max(10, fc)) / SR), k = 1 / q; this.k = k; this.a1 = 1 / (1 + g * (g + k)); this.a2 = g * this.a1; this.a3 = g * this.a2; }
  lp(x) { const v3 = x - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3; this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2; return v2; }
  hp(x) { const v3 = x - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3; this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2; return x - this.k * v1 - v2; }
}
const XOVER = 180; // Hz, séparation graves / reste (Linkwitz-Riley 24 dB/oct : somme plate)
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const fadeUp = (x) => Math.sin((Math.PI / 2) * clamp01(x)), fadeDown = (x) => Math.cos((Math.PI / 2) * clamp01(x));
/** Automation d'une transition (p = 0 → 1 sur le chevauchement) ; w = largeur de l'échange des basses (fraction). */
function autoIn(T, p, w) {
  if (T === 'blend') return { fader: fadeUp(p), low: clamp01((p - 0.3) / 0.4), sweep: null };
  if (T === 'hpIn') return { fader: fadeUp(p / 0.25), low: clamp01((p - 0.5) / w), sweep: p < 0.5 ? ['hp', 20 * Math.pow(1500 / 20, 1 - p / 0.5)] : null };
  return { fader: fadeUp(p / 0.35), low: clamp01((p - 0.5) / w), sweep: null }; // bassSwap, filter
}
function autoOut(T, p, w) {
  if (T === 'blend') return { fader: fadeDown(p), low: 1 - clamp01((p - 0.3) / 0.4), sweep: null };
  const o = { fader: p < 0.6 ? 1 : fadeDown((p - 0.6) / 0.4), low: 1 - clamp01((p - 0.5) / w), sweep: null };
  if (T === 'filter' && p > 0.45) o.sweep = ['lp', 18000 * Math.pow(320 / 18000, clamp01((p - 0.45) / 0.55))];
  return o;
}

class Deck {
  constructor(mx, d, nextT) {
    const tempo = mx.tempo;
    this.d = d; this.plan = deckPlan(d);
    const P = this.plan.params, spbL = (60 / P.bpm) * SR, songL = this.plan.meta.seconds;
    this.cal = calibrate(this.plan, spbL, Math.ceil((songL + TAIL) * SR), Math.round(songL * SR), 2);
    this.startS = Math.round(tempo.sample(d.startBeat));
    this.endS = Math.round(tempo.sample(d.endBeat)) + Math.round(TAIL * SR);
    const startBeat = d.startBeat, midi = mx.midi, ratio = d.ratio || 1; // v1.6.3 : trap en demi-temps sur la grille (2 temps locaux = 1 temps)
    function* events(plan) {
      const state = {};
      for (let ci = 0; ci < plan.chapters.length; ci++) for (const e of composeChapter(plan, ci, state)) {
        if (midi) midi.add(ratio === 1 ? { ...e, t: e.t + startBeat } : { ...e, t: e.t / ratio + startBeat, ...(e.d != null ? { d: e.d / ratio } : {}) });
        yield [Math.round(tempo.sample(startBeat + e.t / ratio)), e];
      }
    }
    this.pm = new PreMaster(this.plan, makeRng(hashSeed(P.seed, 'audio', P.variation)), events(this.plan), this.cal.levelMul);
    this.inT = d.index ? mx.decks[d.index - 1].transition : null; this.outT = d.transition;
    this.inB = [d.startBeat, d.startBeat + d.xin * mx.bpb]; this.outB = [d.endBeat - d.xout * mx.bpb, d.endBeat];
    this.w = (x) => Math.max(0.03, mx.bpb / Math.max(1, x * mx.bpb)); // échange des basses sur 1 mesure
    this.xo = [0, 1].map(() => ({ l1: new SVF(), l2: new SVF(), h1: new SVF(), h2: new SVF(), sw: new SVF() }));
    for (const c of this.xo) for (const k of ['l1', 'l2', 'h1', 'h2']) c[k].set(XOVER, 0.7071);
    this.gain = 1; this.last = null; this.sweepOn = false;
  }
  /** état d'automation au temps global b */
  stateAt(b) {
    let fader = 1, low = 1, sweep = null;
    if (this.inT && b < this.inB[1]) { const p = (b - this.inB[0]) / (this.inB[1] - this.inB[0]); const a = autoIn(this.inT, p, this.w(this.d.xin)); fader *= a.fader; low *= a.low; sweep = a.sweep; }
    if (this.outT && b > this.outB[0]) { const p = (b - this.outB[0]) / (this.outB[1] - this.outB[0]); const a = autoOut(this.outT, p, this.w(this.d.xout)); fader *= a.fader; low *= a.low; sweep = a.sweep || sweep; }
    if (this.outT && b >= this.outB[1]) fader = 0;
    return { fader, low, sweep };
  }
  /** ajoute la sortie du deck dans (L, R) */
  mixInto(mx, c0, n, L, R) {
    const { L: dl, R: dr } = this.pm.process(c0, n);
    const SUB = 64, X = this.xo, g0 = this.gain;
    for (let i0 = 0; i0 < n; i0 += SUB) {
      const m = Math.min(SUB, n - i0);
      const st = this.stateAt(mx.tempo.beatAt(c0 + i0 + m / 2));
      const prev = this.last || st;
      if (st.sweep) { for (const c of X) c.sw.set(st.sweep[1], 0.9); }
      const sweepMode = st.sweep ? st.sweep[0] : null;
      if (sweepMode && !this.sweepOn) { for (const c of X) { c.sw.ic1 = 0; c.sw.ic2 = 0; } }
      this.sweepOn = !!sweepMode;
      for (let i = 0; i < m; i++) {
        const k = (i + 1) / m, fa = (prev.fader + (st.fader - prev.fader) * k) * g0, lo = prev.low + (st.low - prev.low) * k;
        const j = i0 + i;
        for (let ch = 0; ch < 2; ch++) {
          const c = X[ch]; let x = ch ? dr[j] : dl[j];
          const lowp = c.l2.lp(c.l1.lp(x)), highp = c.h2.hp(c.h1.hp(x));
          x = lowp * lo + highp;
          if (sweepMode === 'lp') x = c.sw.lp(x); else if (sweepMode === 'hp') x = c.sw.hp(x);
          if (ch) R[j] += x * fa; else L[j] += x * fa;
        }
      }
      this.last = st;
    }
  }
}

/** Set DJ continu (≥ 1 h par défaut) : decks rendus à la volée (au plus 2 en même temps → RAM bornée). */
function prepareMix(P0, opts) {
  const mx = planMix(P0);
  const P = mx.params, S0 = STYLES[P.style];
  const adv = P.adv || {};
  const songSec = mx.tempo.sec(mx.totalBeats);
  const N = Math.ceil((songSec + TAIL) * SR);
  const fadeOut = adv.fadeOut != null ? Math.max(0.5, adv.fadeOut) : 3;
  mx.midi = new MidiCollector({ bpm: P.bpm, meter: mx.MI.meter, name: opts.title || `soundtube ${S0.label} mix #${P.seed}`, patches: deckPlan(mx.decks[0]).S.patches, gmDrums: GM_DRUMS, tempos: mx.tempo.midiTempos(mx.bpb) });
  const L = new Float32Array(CHUNK), R = new Float32Array(CHUNK);
  let active = [], nextDeck = 0, master = null, ref = null; const busAcc = {}; let busN = 0, maxActive = 0, calMs = 0;
  const open = (d) => {
    const t = Date.now();
    const dk = new Deck(mx, d);
    if (opts.stem) dk.pm.stem = opts.stem;
    // égalisation de niveau entre decks (crête normalisée puis loudness relative), petite courbe d'énergie
    if (!ref) ref = dk.cal;
    const k = Math.min(1.8, Math.max(0.55, Math.pow(ref.rmsN / Math.max(1e-6, dk.cal.rmsN), 0.85)));
    dk.gain = dk.cal.pre * k * Math.pow(10, ((d.energy - 0.7) * 2) / 20);
    if (!master) master = new Master({ pre: 1, drive: dk.cal.drive, norm: dk.cal.norm }, dk.plan.S, N, adv.fadeIn != null ? Math.max(0.01, adv.fadeIn) : 0.01, Math.min(fadeOut + TAIL, songSec));
    calMs += Date.now() - t;
    return dk;
  };
  const retire = (dk) => { const b = dk.pm.busLevels(); for (const k in b) busAcc[k] = (busAcc[k] || 0) + b[k]; busN++; };
  // plan + méta (structure de chaque deck) : planSong est léger, la composition reste paresseuse
  const deckMeta = mx.decks.map((d) => { const p = deckPlan(d); return { structure: p.meta.chapters.map((c) => c.structure).join(' | '), progA: p.meta.progressions.A, recipe: p.meta.recipe, patches: p.S.patches, kit: p.S.drums.kit }; });
  const tl = mx.tracklist.map((t, i) => ({ ...t, structure: deckMeta[i].structure, progression: deckMeta[i].progA, sons: deckMeta[i].recipe?.sons || null, kit: deckMeta[i].kit }));
  const p0 = deckPlan(mx.decks[0]);
  const bpms = mx.tracklist.flatMap((t) => [t.bpmIn, t.bpmOut]);
  const meta = {
    ...p0.meta, bars: mx.totalBars, seconds: songSec, meter: mx.MI.meter,
    sections: mx.decks.map((d) => ({ type: 'deck', label: d.name, startBar: d.startBar, bars: d.bars, chapter: d.index })),
    chapters: tl.map((t) => ({ index: t.index, label: t.name, profile: `${t.camelot} · ${t.bpm} BPM`, startSec: t.start, bars: t.bars, structure: t.structure, progressionA: t.progression, theme: false })),
    mix: { decks: tl, count: tl.length, bpmMin: Math.floor(Math.min(...bpms)), bpmMax: Math.ceil(Math.max(...bpms)), transitions: TRANSITIONS, energyPeaks: mx.peaks, ...(mx.variety != null ? { variety: mx.variety, styles: [...new Set(tl.map((t) => (t.style || P.style) + (t.sub ? ':' + t.sub : '')))] } : {}) },
  };
  return {
    P, N, songSec, midi: mx.midi, plan: { params: P, mix: mx }, meta, calibration: { mix: true, decks: tl.length },
    busLevels: () => { for (const dk of active) retire(dk); active = []; const o = {}; for (const k in busAcc) o[k] = +(busAcc[k] / Math.max(1, busN)).toFixed(4); return o; },
    mixStats: () => ({ maxActiveDecks: maxActive, calibrationMs: calMs }),
    synth: (c0, n, out) => {
      while (nextDeck < mx.decks.length && Math.round(mx.tempo.sample(mx.decks[nextDeck].startBeat)) < c0 + n + CHUNK) active.push(open(mx.decks[nextDeck++]));
      L.fill(0, 0, n); R.fill(0, 0, n);
      for (const dk of active) if (dk.startS < c0 + n + CHUNK) dk.mixInto(mx, c0, n, L, R);
      maxActive = Math.max(maxActive, active.length);
      const keep = []; for (const dk of active) { if (dk.endS <= c0 + n && dk.d.index < mx.decks.length - 1) retire(dk); else keep.push(dk); } active = keep;
      master.process(L, R, c0, n, out);
    },
  };
}
