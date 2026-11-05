# Art director — context (v1.18.0)

Ollama (or local keyword fallback) suggests style, mood, advanced params, FR+EN titles/descriptions/tags, and a track-by-track plan for mixes ≥ 1 h (`POST /api/ai/suggest`).

## Admin toggles (off by default)

1. **Taste profile** — from `contexte/gout.json` (public tree ships a generic example; replace via `node tools/gout-distill.mjs library.csv`).
2. **Latest trends** — bounded summary, labelled as public data not instructions.

Editable per-style refs: `data/directeur.json` (on a live install). Preview/test: `/api/admin/director`, `…/preview`, `/api/admin/ai/test`, trends endpoints.

Studio: **Art director** → describe mood → **Suggest**. UI language does not force YouTube text language.
