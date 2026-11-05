## 1.19.0 — 2026-11-05

### Added
- Dedicated Ollama settings for trend watch (URL optional, model from `/api/tags`, Test button, fall back to director with notice)
- Autonomous public crawl: default RSS sources, optional DuckDuckGo HTML discovery (off by default), YouTube HTML complement
- SSRF protections (block private/loopback/link-local unless explicitly listed + Admin override), robots.txt, rate limit, cache, size/timeout caps
- Watch history in Admin; watch LLM prompt fenced as untrusted data; temperature 0.4 (director unchanged at 0.7)
- `test/v1190.js`

### Unchanged
- Art-director prompt and behaviour (byte-identical path)
- Audio engine fingerprint `696de0f4125a`

# Changelog — soundtube

All notable releases. Personal hostnames, private IPs, library exports and tokens are omitted.


## 1.18.0 (docs / samples follow-up)

### Added
- Public redistributable `assets/samples/` (CC0 + Salamander CC BY 3.0); `SAMPLES-LICENSES.md`
- `jrhodes/` (CC BY-NC) **not** shipped in the public tree

## 1.18.0 — 2026-11-05

### Added
- Lightweight UI i18n (French / English): `public/i18n/{fr,en}.json`, `public/js/i18n.js`
- Header language switcher **FR | EN** (studio, admin, site pages); fits 1440 and 390 layouts
- Persistence: `localStorage` + cookie `soundtube_ui_lang`; default from `Accept-Language`; French fallback; `html[lang]` updated
- API `GET` / `PUT` `/api/ui/lang` (does not change YouTube content language)
- English README + manuals under `docs/en/`; French manuals kept
- `test/v1180.js` (identical key sets, referenced keys, engine fingerprint unchanged)

### Unchanged
- Audio engine byte-identical — fingerprint `696de0f4125a`
- YouTube title / description / tag generation (existing FR+EN behaviour)

## 1.17.0 — 2026-11-05

- Official **macOS Apple Silicon** render agent (VideoToolbox after NVENC in encoder order)
- `install-macos.sh` / `uninstall-macos.sh` (LaunchAgent by default without elevated privileges; LaunchDaemon with `--system`)
- Admin shows platform `darwin` + arch; audio load balancing by measured speed
- `test/v1170.js`

## 1.16.0 — 2026-11-05

- Windows agent renders **music** with the same engine as the CT (protocol + fingerprint + reference render)
- Job routing: combined music+video on PC, threshold for long audio, CT fallback
- Admin: capacity, engine hash, Verify, render history
- `test/v1160.js`

## 1.15.0 — 2026-11-05

- Art director context: optional taste profile + latest trend summary (off by default)
- Distill tool for a music-library CSV → `contexte/gout.json` (example profile shipped)
- `docs/DIRECTEUR.md`, `test/v1150.js`

## 1.14.0 — 2026-11-05

- Animation picker before generate; per-style remembered animation
- Automatic complete ZIP pack at end of render (`pack` / `meta.autoPack`)
- Admin media library; `docs/PACK.md`, `test/v1140.js`

## 1.13.0 — 2026-11-04

- Multiple YouTube channels, style→channel bindings, publish profiles, publish queue
- Complete ZIP with video + mix + stems; `SOUNDTUBE_YT_TRANSPORT=mock` for tests
- `docs/YOUTUBE.md`, `test/v1130.js`

## 1.12.0 — 2026-11-04

- Engine **21** — harmony fixes (`docs/THEORIE.md`)
- `POST /api/tracks/:id/regenerate`; engines ≤ 20 unchanged (fingerprints)

## 1.11.0 — 2026-11-03

- Engine **20** — lo-fi redesign (six sub-genres, textures, new beds)
- Engines ≤ 19 identical outside lo-fi path

## 1.10.0 — 2026-11-02

- Site pages: Accueil, Démarrer, Styles catalogue + per-style page
- Shared top bar; `GET /api/styles`, `GET /api/styles/:id`

## 1.9.0 — 2026-11-02

- Advanced panel prefilled with real style/seed values
- Art director (`/api/ai/suggest`) + trend watch
- Engine **19** — French Touch variants (classic / Ed Banger / Myd)

## 1.8.0 — 2026-11-02

- Engine **18** — vintage drum machines & synths; French Touch style
- Windows installer `-AllowFrom`; force flags for advanced options

## 1.7.0 — 2026-11-02

- Distributed **video** render (Windows NVENC agent), Admin nodes page
- 15-minute duration preset; long mixes remain contrasted

## 1.6.x — 2026-10-31

- Sample pack (pianos, Rhodes, drums), realism, variation selector, split videos
- UI spirit retained as the reference look through later versions

## 1.5.0 — 2026-10-30

- Hip-Hop + Drum & Bass styles, moods / beds, groove realism across 4/4 styles

## 1.4.0 — 2026-10-29

- DJ mix mode 1–4 h, Camelot / energy curve, video 720p/1080p/4K

## Earlier

- 1.0–1.3: core studio, library, MP3/MIDI, YouTube panel foundations, config migration (`deploy/migrate-env.sh`)
