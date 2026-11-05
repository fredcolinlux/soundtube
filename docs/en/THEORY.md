# Music theory & engine audit — soundtube (engine 21)

Full French audit with examples: [`../THEORIE.md`](../THEORIE.md). This page summarises what **engine 21** (default since v1.12.0, still default in **v1.18.0**) enforces.

## Goals

- Chords stay inside the declared key / mode.
- Fewer parallel fifths / harsh voice-leading artefacts.
- Bass and melody align with the sounding chord.
- Lo-fi jazzy strum & swing timing corrected where the audit required it.
- Older engines **17–20** remain byte-identical when `engine` is set accordingly (regression fingerprints in `npm test`).

## Regenerating old tracks

`POST /api/tracks/{id}/regenerate` creates a **new** library item with engine 21; the original is untouched (`meta.regenOf`). UI exposes a regenerate action in the library details.

## Compatibility matrix (generate)

| `engine` | Meaning |
|---|---|
| `21` | Default for new jobs — harmony-aware |
| `20` | Lo-fi redesign era (v1.11) |
| `19` | French Touch variants era (v1.9) |
| `18` | Vintage machines / French Touch introduction (v1.8) |
| `17` | Historical engine |

Fingerprint of current `src/engine` + titles (agent/CT): **`696de0f4125a`** (unchanged in v1.18.0).

## Related

- Style reservoirs & defaults: `docs/STYLES.md`
- Advanced keys: `GET /api/options` → `advanced`
