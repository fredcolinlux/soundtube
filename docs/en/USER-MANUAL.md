# User manual — soundtube

The web UI is available in **French** and **English** (header **FR | EN** switch). Choice is stored in the browser (`localStorage` + cookie). YouTube title / description / tag generation keeps its existing FR+EN behaviour and is independent of the UI language.

## 1. Studio (Generate)

Pick a **style**, set **duration**, **tempo**, **key** / mode, **mood**, optional **Advanced** tweaks, then generate. Follow jobs in the queue; listen and download WAV/MP3/MIDI from the **Library**.

## 2. Styles

Each style has its own BPM ranges, harmony and instrumentation. See `docs/STYLES.md`. French Touch and lo-fi expose sub-variants (`ftStyle`, `lofiStyle`).

## 3. Pack ZIP

From a finished job, build a pack (audio, MIDI, metadata, optional video). See `docs/PACK.md`.

## 4. YouTube

Per-track panel: thumbnail / animated background, title, description, tags (FR/EN from the art director when enabled), loudness, OAuth publish. Test transport: `SOUNDTUBE_YT_TRANSPORT=mock`.

## 5. Art director (AI)

Generate → *Art director*: describe the mood → **Suggest**. Needs an Ollama PC in Admin, otherwise a **local** keyword fallback. Server validates and clamps the response. Optional taste profile / trends context (Admin) — off by default.

## 6. Admin

Nodes, routing, AI PC, YouTube channels, trend watch, director context, brand name. See the installation and operations manuals.

## 7. Pages

`/` studio · `/demarrer` getting started · `/admin` · `/docs` OpenAPI · `/styles` catalogue
