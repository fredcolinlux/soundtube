# Complete ZIP pack (v1.18.0)

Since **v1.14.0** a finished track can yield a **complete ZIP** (manual or automatic at end of render).

Layout v2: `LISEZMOI.txt`, `manifest.json`, `video/`, `mix/`, `morceaux/`, `MIDI/`, `samples/`.  
`manifest.json` includes settings and (v1.16+) `render` metadata.

Trigger via Studio auto-pack, `POST /api/tracks/{id}/pack` + `GET …/pack.zip`, or the combined PC music+video flow.

Split API remains available for per-title exports from long DJ mixes.

## v1.21.2

- English texts are always produced (with the TXT option): `README.txt` (EN, next to `LISEZMOI.txt`), `youtube-en.txt` / `youtube-fr.txt` (title, description, tags of the full mix) and `morceaux/<track>.en.txt` next to the French sheet; `manifest.json` gets `title_en` and `files.txtEn`.
- Per-track videos (option "one video per track", `morceaux/<track>.mp4`): each render pins its audio as soon as it is queued, so renaming a track while it waits no longer fails the ZIP (`ffmpeg code 254: Error opening input file audio.wav`).
- End-to-end test: `npm run test:e2e`.
