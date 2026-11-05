# Operations — soundtube 1.18.0

## Service

```bash
systemctl status soundtube
systemctl restart soundtube
journalctl -u soundtube -f
```

Config reload = restart after editing `/etc/soundtube/soundtube.env`.

## Health

`GET /api/health` → `{ ok, version, storage, mp3, samples, running, queued }`.

## Storage

- Default: SQLite via `better-sqlite3` when the native module builds; otherwise JSON under the data dir.
- Audio / video files live under `SOUNDTUBE_DATA_DIR`.
- Back up: stop or quiesce writes, copy the data directory + `soundtube.env`.

## Logs & capacity

- Tune `SOUNDTUBE_MAX_JOBS` / `SOUNDTUBE_MAX_QUEUE` to CPU and RAM.
- Long mixes (1–4 h) use significant RSS; prefer a render node for video and for audio above the Admin threshold.
- Sample cache: `SOUNDTUBE_SAMPLE_CACHE_MB`.

## Nodes

- Prefer NVENC (Windows NVIDIA) → VideoToolbox (macOS) → libx264 → CT.
- If engine hash differs, the node refuses audio (HTTP 409); reinstall the agent shipped with this CT version.
- **Verify** in Admin re-runs the 20 s reference render check.
- Combined music+video: one node encodes audio then video; on failure the CT resumes and the UI shows the fallback.

## YouTube

- Channel secrets are stored mode `0600` and never returned by the API.
- Use `SOUNDTUBE_YT_TRANSPORT=mock` in non-production to exercise the queue without uploading.
- Publish queue: list / cancel / retry under `/api/publish/queue`.

## UI language vs content language

| Concern | Mechanism |
|---|---|
| Interface | `/api/ui/lang`, cookie `soundtube_ui_lang` |
| YouTube texts language preference | `/api/youtube/lang` (`fr` / `en`) |

Do not confuse the two when debugging “wrong language” reports.

## Upgrades

1. Extract new standalone (or sync app tree).
2. `./install.sh` as root (keeps env, migrates keys).
3. Reinstall node agents when `ENGINE` / agent zip version changes.
4. `curl /api/health` and spot-check Studio + Admin.

## Samples

## Trend watch (v1.19)

Admin → **PC IA**: separate **Watch** Ollama URL (optional) + model (from `/api/tags`). Empty model → fall back to the director model with a visible notice. Separate **Test watch** button. Watch calls use a generic summariser prompt and `temperature: 0.4`; the art-director path stays unchanged (`temperature: 0.7`).

Admin → **Trend watch**:
- Default RSS list (Reddit music subs, Bandcamp Daily, …) + per-style keywords; **Reset defaults**
- Toggles: scheduled run, crawl listed sources, optional YouTube HTML search, optional DuckDuckGo discovery (**off** by default), allow private IPs **only** for explicitly listed feed URLs
- Manual **Run watch** + interval (1–60 days); history of runs, sources, errors
- Results feed the director only when **Director context → Latest trends** is on

Crawler: http(s) only, DNS SSRF block (loopback/private/link-local), robots.txt, polite UA + rate gap, timeout, size cap, disk cache. HTML stripped to text; fenced as untrusted in the LLM prompt. No audio download, no logins.


Presence: `assets/samples/manifest.json` and `samples: true` on `/api/health`. Memory cache: `SOUNDTUBE_SAMPLE_CACHE_MB`. Licences: [SAMPLES-LICENSES.md](../../SAMPLES-LICENSES.md).
