# Complete ZIP pack (v1.18.0)

Since **v1.14.0** a finished track can yield a **complete ZIP** (manual or automatic at end of render).

Layout v2: `LISEZMOI.txt`, `manifest.json`, `video/`, `mix/`, `morceaux/`, `MIDI/`, `samples/`.  
`manifest.json` includes settings and (v1.16+) `render` metadata.

Trigger via Studio auto-pack, `POST /api/tracks/{id}/pack` + `GET …/pack.zip`, or the combined PC music+video flow.

Split API remains available for per-title exports from long DJ mixes.
