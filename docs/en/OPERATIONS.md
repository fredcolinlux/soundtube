# Operations plan — soundtube

## Roles

Studio operator (generate, packs, publish) · Platform admin (nodes, Ollama, YouTube, backups) · Network admin (VLANs, firewall).

## Daily

Check Admin → Nodes and AI PC. Prefer audio nodes for long jobs. Archive packs off the data volume when needed.

## Weekly

Review trend digest if enabled. Disk space on `/var/lib/soundtube` and agent caches. `journalctl -u soundtube --since "7 days ago"`.

## Capacity

Tune `SOUNDTUBE_MAX_JOBS` / queue. Routing: short → CT; long / combo → audio node; saturation → free node; failure → force local. Encoders: NVENC > VideoToolbox > QSV/AMF > libx264.

## Security

Trusted LAN; optional node tokens; YouTube secrets only in runtime config. Keep OS / Node / ffmpeg updated.

## Incidents

Failed node → CT resumes. Corrupt data → restore backup. Secret leak → rotate OAuth/tokens. Regressions → note `/api/options` version vs git tag.

## UI language

Operators may switch FR/EN anytime; it does not alter rendered audio or YouTube bilingual metadata generation.
