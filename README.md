# soundtube

Self-hosted platform for **algorithmic instrumental music** (no vocals).
Each track is composed (music theory: scales, chord progressions, Markov melodies,
bass, drums, intro / verse / chorus / bridge / outro) then **synthesised in real time**.

**Version:** 1.18.0  
**UI languages:** French and English (header language switcher).  
**Licence:** see `LICENSE` (all rights reserved in the public anonymised repo).

French documentation: [README.fr.md](README.fr.md) · [docs/MANUEL-UTILISATEUR.md](docs/MANUEL-UTILISATEUR.md) · [docs/MANUEL-INSTALLATION.md](docs/MANUEL-INSTALLATION.md) · [docs/EXPLOITATION.md](docs/EXPLOITATION.md)

English manuals: [docs/en/USER-MANUAL.md](docs/en/USER-MANUAL.md) · [docs/en/INSTALL-MANUAL.md](docs/en/INSTALL-MANUAL.md) · [docs/en/OPERATIONS.md](docs/en/OPERATIONS.md)

## Quick start (Debian 13)

```bash
# as root
./install.sh --port 8080
# or: ./deploy/install.sh --port 8080
```

Open `http://<host>:8080/`. Use the **FR | EN** control in the top bar to switch the interface language (stored in `localStorage` + cookie `soundtube_ui_lang`; default from `Accept-Language`).

Standalone package also ships Windows and macOS render agents under `dist/`.

## Features (summary)

- 11 instrumental styles, generative engine, WAV / MP3 / MIDI exports
- Art director (optional Ollama), trend watch, YouTube pack (titles/descriptions FR+EN unchanged)
- Distributed render nodes (Windows NVENC, macOS VideoToolbox, CT fallback)
- Admin: nodes, routing, AI PC, YouTube channels, media, director context

## i18n (v1.18.0)

- Locale files: `public/i18n/fr.json`, `public/i18n/en.json` (same key set; French fallback)
- Client module: `public/js/i18n.js` — no heavy dependency
- API: `GET/PUT /api/ui/lang` (does **not** change YouTube content language / `getLang`)
- Audio engine fingerprint unchanged vs v1.17.0

## Tests

```bash
npm test   # includes test/v1180.js
```

## Further reading

- `docs/STYLES.md`, `docs/THEORIE.md`, `docs/NODES.md`, `docs/YOUTUBE.md`, `docs/PACK.md`, `docs/DIRECTEUR.md`
- OpenAPI: `/docs` when the server is running
