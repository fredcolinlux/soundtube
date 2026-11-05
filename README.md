# soundtube

Self-hosted platform for **algorithmic instrumental music** (no vocals).
Each track is composed with music theory (scales, chord progressions, Markov melodies,
bass, drums, intro / verse / chorus / bridge / outro) then **synthesised in real time**.

| | |
|---|---|
| **Version** | **1.18.0** |
| **UI languages** | French and English (header **FR \| EN** switch) |
| **Licence** | See `LICENSE` (all rights reserved) |
| **Engine default** | 21 (harmony-aware); fingerprint `696de0f4125a` |

**French:** [README.fr.md](README.fr.md) · [docs/MANUEL-UTILISATEUR.md](docs/MANUEL-UTILISATEUR.md) · [docs/MANUEL-INSTALLATION.md](docs/MANUEL-INSTALLATION.md) · [docs/EXPLOITATION.md](docs/EXPLOITATION.md)

**English manuals:** [docs/en/USER-MANUAL.md](docs/en/USER-MANUAL.md) · [docs/en/INSTALL-MANUAL.md](docs/en/INSTALL-MANUAL.md) · [docs/en/OPERATIONS.md](docs/en/OPERATIONS.md)

**Doc index:** [docs/README.md](docs/README.md) · [QUICKSTART.md](QUICKSTART.md) · [CHANGELOG.md](CHANGELOG.md)

## Quick start (Debian 13 LXC / bare metal)

The control tower (**CT**) is meant to run **as root** (typical Proxmox LXC). Do **not** wrap the installer in `sudo` when you are already root:

```bash
tar -xzf soundtube-1.18.0-standalone.tar.gz
cd soundtube-1.18.0
./install.sh --port 8080
# equivalent: ./deploy/install.sh --port 8080
```

Open `http://<host>:8080/`. Switch the interface with **FR | EN** in the top bar
(`localStorage` + cookie `soundtube_ui_lang`; default from `Accept-Language`; fallback French).
UI language is independent of YouTube title / description / tag language.

Standalone packages also ship render agents under `dist/`:

- `dist/soundtube-node-agent-1.18.0-windows.zip`
- `dist/soundtube-node-agent-1.18.0-macos.zip`

## Features

- **11 instrumental styles:** Lo-fi, Ambient, Synthwave, Deep House, French Touch, Techno, Cinematic, Chiptune, Trap, Hip-Hop, Drum & Bass
- Generative engine (WAV / MP3 / MIDI + per-instrument MIDI ZIP)
- Long DJ mixes (15 min–4 h), track split, YouTube video (720p / 1080p / 4K)
- Complete ZIP pack (video, mix, stems, MIDI, manifest)
- Optional art director (Ollama) + trend watch + taste profile context
- Distributed render nodes (Windows NVENC, macOS VideoToolbox, CT fallback)
- Admin: nodes, routing, AI PC, YouTube channels, media library, director context
- Lightweight i18n (JSON locales, no heavy framework)

## i18n (v1.18.0)

| Piece | Path / API |
|---|---|
| Locales | `public/i18n/fr.json`, `public/i18n/en.json` (identical key sets) |
| Client | `public/js/i18n.js` |
| API | `GET` / `PUT` `/api/ui/lang` |
| YouTube content lang | `GET` / `PUT` `/api/youtube/lang` — **unchanged**, separate from UI lang |

## Tests

```bash
npm test          # includes test/v1180.js (i18n + engine fingerprint)
```

## Further reading

Styles · Theory · Nodes · YouTube · Pack · Director · API — see [docs/README.md](docs/README.md).  
Interactive OpenAPI UI: `/docs` when the server is running (`/api/openapi.json`).
