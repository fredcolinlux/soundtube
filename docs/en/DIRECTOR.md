# Art director — context (v1.18.0)

Ollama (or local keyword fallback) suggests style, mood, advanced params, FR+EN titles/descriptions/tags, and a track-by-track plan for mixes ≥ 1 h (`POST /api/ai/suggest`).

## Admin toggles (off by default)

1. **Taste profile** — active profile `/var/lib/soundtube/gout.json` (data dir, **never overwritten by a patch**). Seeded on first start from `contexte/gout.json` if present (personal, **not published**), else `contexte/gout.example.json` (neutral generic example). Build yours with `node tools/gout-distill.mjs library.csv /var/lib/soundtube/gout.json`.
2. **Latest trends** — bounded summary, labelled as public data not instructions.

Editable per-style refs: `data/directeur.json` (on a live install). Preview/test: `/api/admin/director`, `…/preview`, `/api/admin/ai/test`, trends endpoints.

Studio: **Art director** → describe mood → **Suggest**. UI language does not force YouTube text language.

## Card 07 — "Restore shipped profile" (v1.21.2)

- Empty card fixed (missing `apiFetch` import in `admindirector.js`); API errors are shown in the card.
- The button reinstalls `/var/lib/soundtube/gout.shipped.json` (frozen personal copy) or `contexte/gout.json`, else the **generic example**.
- Standalone installs (public repo) ship only the generic example.
- Private profile: copy `gout.json` + `gout.shipped.json` into `/var/lib/soundtube/` (owner `soundtube`, mode 600), then `systemctl restart soundtube`.
