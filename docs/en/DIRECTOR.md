# Art director — context (v1.18.0) and system prompt (v1.21.3)

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

## Art director system prompt (v1.21.3)

Admin → **07 Art director context** → **Art director system prompt**. Stored in `/var/lib/soundtube/director-prompt.json`
(data dir, mode 600, **never** in `/opt/soundtube/app`, so it survives `update.sh`). Local-only API, admin session + CSRF token:
`GET/PUT /api/admin/director/prompt`.

| Prompt source | System message sent to Ollama | Temperature |
|---|---|---|
| **soundtube built-in prompt** (default) | soundtube's prompt, unchanged | Admin setting |
| **Custom prompt (Admin)** | Your text (≤ 20,000 characters) **+ JSON contract + catalogue** of styles/settings appended by the code | Admin setting |
| **Modelfile prompt** | **None**: Ollama applies the `SYSTEM` of the Modelfile of the model chosen in Admin › AI PC. The JSON contract + catalogue go at the top of the user message | **never forced** (Modelfile's) |

- **JSON contract + catalogue** are always added; the answer is still strictly validated (unknown keys ignored).
- **Temperature**: default **0.7** (historic behaviour); empty = model default.
- **`num_ctx`**: default **8192**; empty = model default. With a long prompt (~10,000 characters ≈ 3,000 tokens, plus the
  catalogue ≈ 1,500 tokens) use **16384**; Admin shows a hint above ~2,000 tokens.
- **Restore built-in prompt** clears the custom text and switches back to built-in mode.
- The model is never hardcoded: it is the one set in Admin › AI PC. "Test with Ollama" and Create → "Describe the mood" use the same mode.
- The "Test the director" field (1,200 characters) is a test mood description, not the system prompt.

Modelfile mode example: `FROM <base model>` / `SYSTEM """…"""` / `PARAMETER num_ctx 16384`, then `ollama create <name> -f Modelfile` and pick `<name>` in Admin › AI PC.
