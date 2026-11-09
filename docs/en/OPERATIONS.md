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

- Shipped pack: `assets/samples/` (see [SAMPLES-LICENSES.md](../../SAMPLES-LICENSES.md)).
- Personal samples (v1.21.4): read-only external folder (default `/mnt/samples`, NAS mounted on the Proxmox host, see
  [INSTALL-MANUAL.md](./INSTALL-MANUAL.md#nas-samples-synology-smb-share--proxmox-host--ct--v1214)). Data files:
  `/var/lib/soundtube/external-samples.json` (folder, enabled) and `external-samples-index.json` (last scan index). Automatic
  scan at startup when the folder is readable and not indexed yet; otherwise Admin › 06c › **Rescan**. Deleting the index
  disables the “My samples” kit until the next scan.
- Demo tracks (v1.21.4): `/var/lib/soundtube/demo-tracks.json` (`ids`, `updatedAt`).

## Trend watch (v1.19)

Admin → **PC IA**: separate **Watch** Ollama URL (optional) + model (from `/api/tags`). Empty model → fall back to the director model with a visible notice. Separate **Test watch** button. Watch calls use a generic summariser prompt and `temperature: 0.4`; the art-director path stays unchanged (`temperature: 0.7`).

Admin → **Trend watch**:
- Default RSS list (Reddit music subs, Bandcamp Daily, …) + per-style keywords; **Reset defaults**
- Toggles: scheduled run, crawl listed sources, optional YouTube HTML search, optional DuckDuckGo discovery (**off** by default), allow private IPs **only** for explicitly listed feed URLs
- Manual **Run watch** + interval (1–60 days); history of runs, sources, errors
- Results feed the director only when **Director context → Latest trends** is on

Crawler: http(s) only, DNS SSRF block (loopback/private/link-local), robots.txt, polite UA + rate gap, timeout, size cap, disk cache. HTML stripped to text; fenced as untrusted in the LLM prompt. No audio download, no logins.


Presence: `assets/samples/manifest.json` and `samples: true` on `/api/health`. Memory cache: `SOUNDTUBE_SAMPLE_CACHE_MB`. Licences: [SAMPLES-LICENSES.md](../../SAMPLES-LICENSES.md).

### AI models (v1.19.1)

Section **03 AI models**: two visible cards **Art director** and **Trend watch**. Version pill in the Admin header. CSS/JS use `?v=1.19.1`; Admin HTML is `Cache-Control: no-store`.

### Patch update (v1.19.2)

Extract **flat** into `/opt/soundtube/app`. Check `grep aiWatchCard public/admin.html` and the Admin version pill.

## v1.20.0 — Security & public exposure

See [SECURITY.md](./SECURITY.md) and [EXPOSURE.md](./EXPOSURE.md).

## v1.21.2 — updating, access recovery, diagnostics

### Updating
```bash
/opt/soundtube/app/scripts/update.sh /root/soundtube-1.21.2-patch.tar.gz
```
The script checks the archive (flat, no `data/`, `secret.key` or `users.json`) **before** stopping the service, backs up `/opt/soundtube/app`, extracts, syntax-checks and **always** restarts the service, then waits for `/healthz`.
Data (`/var/lib/soundtube`: accounts, `secret.key`, listening profile `gout.json`, tracks) is never touched by a patch.

### Lost admin access (password / OTP)
```bash
cd /opt/soundtube/app
node scripts/admin-reset.js <user> --disable-2fa --password   # as root
```
- `--password`: new password asked twice, hidden input (TTY required, ≥ 10 characters).
- `--disable-2fa`: removes TOTP, recovery codes and passkeys.
- Always: account re-enabled, its sessions closed, an `admin.cli_reset` line in `audit.jsonl`, files kept owned by the `soundtube` user (mode 0600).
- Works with the service **running** (atomic write + `SIGHUP`: the service reloads accounts and clears lockouts) or **stopped**. `--restart` restarts the service instead.
- Do not edit `users.json` / `sessions.json` by hand. If you do, the service now reloads the changed file instead of overwriting it from memory, and an empty or `{}` `sessions.json` is accepted.

### TOTP
±1 step window (30 s). A code rejected but valid with a larger offset is logged as `totp.skew`: check the server clock (`timedatectl`). `secret.key` is never regenerated when present; without it TOTP secrets cannot be read → `admin-reset.js --disable-2fa`.

### Per-track videos / complete ZIP
`[paquet] … ffmpeg code 254 : Error opening input file audio.wav` should no longer appear: the audio is pinned when the video is queued and the real file is found again after a rename. End-to-end test: `npm run test:e2e` (~10 min).
