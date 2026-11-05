# Sample bank licences — soundtube

Instrument samples live in `assets/samples/` (FLAC 16-bit 44.1 kHz).  
They are **third-party packs** (processed: trim, length limit, fades, per-instrument normalisation, drum mic premix). They are **not** from a private music library.

French summary: `assets/samples/CREDITS.md` · legal texts: `assets/samples/licenses/` · `assets/samples/CC0-1.0-legalcode.txt` · per-file map: `assets/samples/manifest.json`.

## Included in this public repository

| Folders | Upstream | Author | Licence | Redistribution |
|---|---|---|---|---|
| Orchestra, upright piano, original drums (`piano`, `violins*`, `celli*`, `harp`, `flute`, `horn`, `vibes`, `upbass`, `timpani`, `bassdrum`, `snare`, `hat`, `ohat`, `clap`, `rim`, `crash`, `shaker`, `tamb`, `tom*`, `swell`, …) | [VCSL](https://github.com/sgossner/VCSL), [VSCO 2 CE](https://github.com/sgossner/VSCO-2-CE) | Versilian Studios — Sam Gossner | **CC0 1.0** | Yes |
| Acoustic kit v1.6 (`vd_*`, `vl_*`) | [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums) | Versilian Studios / sfzinstruments | **CC0 1.0** | Yes |
| Snares & claps (`fs_tight`, `fs_rimshot`, `fs_clap`) | [Frankensnare](https://github.com/sfzinstruments/karoryfer.frankensnare) | Karoryfer Samples | **CC0 1.0** | Yes |
| Steinway B grand (`steinwayb`) | [VCSL — Grand Piano, Steinway B](https://github.com/sgossner/VCSL) | Versilian Studios — Sam Gossner | **CC0 1.0** | Yes |
| Salamander Grand V3 / Yamaha C5 (`salamander`) | [Salamander Grand Piano](https://github.com/sfzinstruments/SalamanderGrandPiano) | **Alexander Holm** | **CC BY 3.0** | Yes, **with attribution** |

### Required CC BY credit (Salamander)

When a track uses the Salamander piano, credit:

> Piano: Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0

soundtube inserts this automatically in generated YouTube descriptions when that piano is selected.

## Excluded from this public repository

| Folder | Upstream | Licence | Why excluded |
|---|---|---|---|
| `jrhodes/` (jRhodes3d, Rhodes Mark I) | [jRhodes3d](https://github.com/sfzinstruments/jlearman.jRhodes3d) — Jeff Learman | **CC BY-NC 4.0** (samples) | Licence allows **non-commercial** redistribution of the sample files only. The public tree ships without them so the redistributable pack stays clearly free of NC restrictions. Without the folder, soundtube falls back to **synthesised Rhodes** (`hasInstrument('jrhodes')` → synth). Music made *with* jRhodes is CC0 per the author; that does not lift NC on redistributing the FLAC files themselves. |

Private / operator-only installs may still keep a local `jrhodes/` copy under `SOUNDTUBE_SAMPLES` if they comply with CC BY-NC.

## What is *not* in `assets/samples/`

- No files from a personal NAS or commercial music library.
- Demo MP3/PNG under a top-level `samples/` folder (if present in a private workspace) are **generated outputs**, not this instrument bank, and are not part of the public pack.
- Algorithmic drum machines / synths (TR-808/909/606/707, DX7, etc.) are **pure JS synthesis**, not sample files.

## Metadata

All shipped FLACs were remuxed with ffmpeg (Vorbis comment `ENCODER=Lavf…` only). No personal INFO/LIST/bext-style tags from a private library.

## Install path

`./install.sh` copies `assets/samples/` into `/opt/soundtube/app/assets/samples`.  
Runtime default: `SOUNDTUBE_SAMPLES` unset → `…/assets/samples` next to the app.  
`GET /api/health` → `samples: true` when `manifest.json` is readable.
