# soundtube — styles (engine 21, v1.18.0)

This document describes, style by style, what soundtube plays **by default**: tempo, groove, drums,
harmony, arrangement, instruments and mix. All values are *starting points*: the seed draws from
these pools (same seed = same track). Since v1.9.0, *Advanced* is **pre-filled with the real values**
the style will use for the shown seed. A changed value turns green and is remembered for that style.

Everything is synthesised in JavaScript (or played from the free CC0 / CC-BY sample banks already
shipped). Model names (TR-606, DX7, Minimoog…) describe the **target character**: no device samples
or protected recordings are used.

## Drum machines and synths (JS synthesis)

| Name in the UI | What is modelled |
|---|---|
| TR-808 / TR-909 | sine kick with pitch envelope, noisy snare/claps, metallic hats |
| **TR-606** | short dry kick, thin snare, very bright “tss” hat, filtered toms |
| **TR-707** | imitated “6-bit PCM” hits; punchy kick, wide clap, cowbell, tambourine |
| **DR-110** | cheap analogue box: muted “toc” kick, noise snare, “tic” hat |
| **DX7 e-piano / bass / bells** | FM, decaying modulation index, “tine” attack |
| **Minimoog bass / lead** | 3 detuned oscillators, saturated 4-pole ladder, glide |
| **Juno polysynth** | saw + PWM + sub, 24 dB filter, stereo chorus |
| **ARP lead** | two oscillators with sync sweep, resonant 12 dB filter |
| **Talkbox / vocoder** | rich buzz through vowel formants or a 10-band bank |
| TB-303 (“acid 303”) | saw/square, resonant filter with accent and slide |

## Lo-fi Hip-Hop
* **Tempo** 70-88 BPM; **groove** 14-30 % swing (lazy shuffle), micro-late snare.
* **Drums** lo-fi kit (default), acoustic lo-fi hip-hop, **DR-110**.
* **Harmony** dorian / minor / major, 7ths and 9ths, ii–V progressions.
* **Instruments** Rhodes, pianos, **DX7 e-piano**, guitar; round bass; vibraphone, flute.
* **Mix** tape 0.65, saturation, lo-fi filter, light sidechain (0.12), vinyl crackle.

Engine 20 (v1.11.0): a **sub-genre** is drawn by the seed (or chosen in *Advanced → Lo-fi sub-genre*):

| Sub-genre | Tempo | Character |
|---|---|---|
| Classic dusty | 72-82 | Boom-bap, vinyl, lazy swing |
| Jazzy night | 70-78 | Soft Rhodes, walking bass |
| Dream pop | 74-84 | Pads, DR-110, wide reverb |
| Tape beat | 76-88 | Heavy tape, muted drums |
| Study focus | 70-80 | Soft, sparse, long tails |
| Dusty brass | 74-86 | Brass stabs (synthesised), scratch FX |

## Ambient
* **Tempo** 50-70 BPM; little or no pulse.
* **Harmony** lydian / major / dorian, slow pads, celestial bells.
* **Instruments** evolving pads, soft DX7 bells, distant piano.
* **Mix** long reverb, gentle high cut, optional night / wind ambience.

## Synthwave
* **Tempo** 95-118 BPM; gated 80s drums (**TR-707**).
* **Harmony** minor / dorian, nostalgic progressions.
* **Instruments** detuned supersaws, **Juno** pads, singing lead, **ARP** sync lead.
* **Mix** chorus, gated reverb on snare, neon-bright top end.

## Deep House
* **Tempo** 118-124 BPM; four-on-the-floor, off-beat bass.
* **Harmony** minor / dorian, chord stabs.
* **Instruments** warm chords, deep bass, light percussion (**TR-909** / **TR-707**).
* **Mix** sidechain pump, wide but clean club bus.

## French Touch
* **Tempo** 118-126 BPM; filtered disco loop feel, sidechain pump.
* **Harmony** major / mixolydian / minor; talkbox / vocoder hooks.
* **Instruments** filtered loops (synth), **Talkbox / vocoder**, punchy **TR-909**.
* **Mix** strong sidechain, filter sweeps, club loudness.

Three engine-19 variants: classic filter, talkbox lead, disco edit.

## Techno
* **Tempo** 125-140 BPM; pounding kick, minimal hypnosis.
* **Harmony** phrygian / minor; sparse stabs.
* **Instruments** **TR-909** / **TR-606**, resonant acid bass (**TB-303**), industrial noise.
* **Mix** dry, focused low end, controlled reverb.

## Cinematic
* **Tempo** 70-110 BPM; ostinatos and builds.
* **Harmony** minor / harmonic minor / lydian.
* **Instruments** wide strings, epic percussion, low drones.
* **Mix** large hall, dramatic dynamics, film-style bus.

## Chiptune
* **Tempo** 100-160 BPM; 8-bit square waves, lightning arpeggios.
* **Harmony** major / minor game-like progressions.
* **Instruments** pulse / triangle / noise channels, arps.
* **Mix** bright, slightly aliased character, short rooms.

## Trap
* **Tempo** 130-160 BPM (or half-time 65-80); sliding **808**s, rapid hats.
* **Harmony** minor / phrygian, dark atmospheres.
* **Instruments** 808 bass, sparse melodic bells, hard claps.
* **Mix** sub-heavy, dark air, modern loudness.

## Hip-Hop
* **Tempo** 80-98 BPM boom-bap, or trap lane.
* **Harmony** jazzy 7ths/9ths or darker trap colours.
* **Instruments** Rhodes, MPC-style drums, sliding 808s when trap-leaning.
* **Mix** dusty or clean depending on sub-lane.

## Drum & Bass
* **Tempo** 160-178 BPM; rebuilt breakbeats, reese, deep sub.
* **Harmony** minor / dorian; liquid pads or neuro aggression.
* **Instruments** break chops, reese bass, liquid pads / neuro leads.
* **Mix** huge sub, crisp tops, club-ready bus.

## Roadmap
* Techniques only: never a melody or sample taken from an existing track.
* Future colours stay synthesised in JavaScript with the same seed model.

## Art director and trends (v1.9.0)
* Optional Ollama PC turns a short mood phrase into validated settings.
* Weekly trends watch can suggest style leanings; nothing is published without you.
