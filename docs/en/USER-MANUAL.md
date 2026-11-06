# User manual — soundtube 1.18.0

The web UI is **French** and **English** (**FR | EN** in the top bar). Choice is stored in the browser (`localStorage` + cookie `soundtube_ui_lang`). YouTube title / description / tag generation keeps its existing FR+EN behaviour and is **independent** of the UI language (`/api/youtube/lang`).

## Pages

| Path | Label (EN / FR) | Role |
|---|---|---|
| `/accueil` | Home / Accueil | Landing |
| `/demarrer` | Get started / Démarrer | Guided tour + first settings |
| `/styles` | Styles | Catalogue |
| `/styles/<id>` | Style sheet | Facts from `docs/STYLES.md`, preset → generate |
| `/` | Studio | Create, library, YouTube panel |
| `/admin` | Admin | Nodes, routing, AI, YouTube, media, director, trends, brand |
| `/docs` | API | OpenAPI UI |

## 1. Studio — Create

Labels match the UI (English when EN is selected):

1. **Style** — one of 11 styles (see Styles manual / `docs/STYLES.md`).
2. **Duration** — seconds; presets include 15 min (= 900 s); hard max from `SOUNDTUBE_MAX_DURATION` (default 14400 = 4 h).
3. **Tempo**, **Key**, **Scale / mode**, **Mood** — Auto available.
4. **Variant** — when the style has sub-styles (lo-fi, French Touch, hip-hop, DnB, …).
5. **Bed / ambience** — synthesised bed + level (no copyrighted recordings).
6. **Variation** — Low / Medium / High / Max (Medium = historical byte-identical behaviour). For long mixes, optional **Allow related styles in the mix**.
7. **Advanced** — real values for the displayed seed (`POST /api/advanced/defaults`); changed fields turn green and are remembered per style.
8. **Art director** — describe a mood → **Suggest**; optional **Title, description and tags FR + EN**; optional **Track-by-track plan** for mixes ≥ 1 h.
9. **Formats** — MP3 + MIDI always; optional **WAV (lossless)**.
10. **Split** (jobs > 30 min) — mid / full / clean cuts; optional library + per-piece YouTube videos.
11. **Pack** — prepare the complete ZIP when render finishes.
12. Optional **Make music and video together on the PC/Mac** (combined node job, v1.16+).
13. **Generate track**.

Queue / status appear in the Studio; finished items land in the **Library**.

## 2. Library

Per track: play, download WAV / MP3 / MIDI / MIDI ZIP, details (seed, engine, render node), rename FR/EN titles, **Variation**, **Regenerate in v1.12+ harmony** (`POST …/regenerate`), split, pack, YouTube panel, publish.

## 3. YouTube panel

Thumbnail / animated background, design layout, loudness, FR+EN texts, OAuth publish when channels are configured. See [YOUTUBE.md](YOUTUBE.md).

## 4. Admin

- **Render nodes (music + video)** — add URL (`http://host:8765`), optional token, discover on LAN, test all, history.
- **Routing** — force a node; CT local = fallback only / parallel; **Music on PC from** N minutes.
- **AI PC (Ollama)** — base URL + model + timeout; used by art director and trends.
- **YouTube channels** — multi-channel, default, style bindings (secrets never returned).
- **Video animations** — import media used as backgrounds.
- **Art director context** — taste profile / trends toggles (off by default).
- **Trend watch** — schedule + run.
- **Brand / display name**.

## 5. Keyboard / mobile

Top bar collapses under ~390 px width; the language switch stays visible (`margin-left: auto` on narrow layouts).

## Sample bank

Pianos, strings, acoustic drums, etc. from `assets/samples/` (see [SAMPLES-LICENSES.md](../../SAMPLES-LICENSES.md)). Sampled Rhodes (jRhodes, CC BY-NC) is not in the public tree — synth fallback. Salamander piano auto-adds the CC BY credit in YouTube descriptions.

## Trend watch

In **Admin**, configure public RSS sources (defaults provided) and optionally a **dedicated watch model**. Run manually or on a schedule. Proposals appear with an **Apply** button (they never apply themselves). Artist names are scrubbed from generated text.

## v1.20.0 — Security & public exposure

See [SECURITY.md](./SECURITY.md) and [EXPOSURE.md](./EXPOSURE.md).

## Profile & two-factor (v1.20.2)

Under **My profile** you can enable optional TOTP: a **QR code** (SVG from `/api/me/totp/qr.svg`, no external service) plus the base32 secret, then confirm with a code. Recovery codes are shown **once** (download available). Passkeys stay optional.

