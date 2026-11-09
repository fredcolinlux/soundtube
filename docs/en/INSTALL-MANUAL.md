# Installation manual — soundtube 1.18.0

## Requirements

- **CT:** Debian 13 (trixie) recommended; **run as root** (LXC). Node.js ≥ 20 (installer defaults to NodeSource 22; agents pin Node 24).
- **ffmpeg** (MP3 + video).
- Optional: Windows 11 + NVIDIA GPU, or macOS Apple Silicon, for render nodes.
- Optional: Ollama host on the LAN for the art director.

## Install / upgrade the CT

From the extracted standalone tree, **as root** (the root `install.sh` refuses non-root and does not call `sudo`):

```bash
./install.sh --port 8080
# or: ./deploy/install.sh --port 8080
```

| Flag | Meaning |
|---|---|
| `--port N` | Set `SOUNDTUBE_PORT` |
| `--nodesource` | Force NodeSource Node |
| `--debian-node` | Use Debian nodejs/npm |
| `--no-start` | Install without restarting the unit |
| `--skip-apt` | Assume ffmpeg + node already present |

Paths:

| Path | Role |
|---|---|
| `/opt/soundtube/app` | Application |
| `/var/lib/soundtube` | Data (SQLite/JSON + audio files) |
| `/etc/soundtube/soundtube.env` | Environment |
| `/etc/systemd/system/soundtube.service` | Unit |

On upgrade, existing env is backed up and merged via `deploy/migrate-env.sh` (missing keys added, values preserved).

Uninstall: `./deploy/uninstall.sh` (see script help).

## Configuration keys (selection)

See `deploy/soundtube.env` for the full commented list:

- `SOUNDTUBE_HOST` / `SOUNDTUBE_PORT` (default `0.0.0.0` / `8080`)
- `SOUNDTUBE_DATA_DIR`, `SOUNDTUBE_MAX_JOBS`, `SOUNDTUBE_MAX_QUEUE`, `SOUNDTUBE_MAX_DURATION`
- `SOUNDTUBE_MP3`, `SOUNDTUBE_MP3_BITRATE`, `SOUNDTUBE_LUFS`, `SOUNDTUBE_TRUE_PEAK`
- `SOUNDTUBE_ARTIST`, `SOUNDTUBE_KEEP_WAV`, `SOUNDTUBE_SAMPLE_CACHE_MB`, `SOUNDTUBE_MEDIA_MAX_MB`
- Optional bootstrap: `SOUNDTUBE_RENDER_NODES`, `SOUNDTUBE_NODE_TOKEN`, `SOUNDTUBE_LOCAL_VIDEO_SLOTS`
- Tests: `SOUNDTUBE_YT_TRANSPORT=mock`

## Windows node

1. Unpack `dist/soundtube-node-agent-1.21.3-windows.zip`.
2. PowerShell **as Administrator**:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\install-windows.ps1
# .\install-windows.ps1 -GenerateToken -AudioSlots 2
```

Installs under `C:\ProgramData\soundtube-node`, scheduled task `soundtube-node`, Private firewall profile.  
Uninstall: `.\uninstall-windows.ps1`.  
Details: [NODES.md](NODES.md).

## macOS node (Apple Silicon)

```bash
chmod +x install-macos.sh uninstall-macos.sh
./install-macos.sh
# headless at boot: ./install-macos.sh --system   # requires elevated privileges
```

Default: user LaunchAgent (no elevation). `--system`: LaunchDaemon.  
Details: [NODES.md](NODES.md).


## Sample bank

The public tree ships `assets/samples/` (~120 MB of FLAC). Licences: [SAMPLES-LICENSES.md](../../SAMPLES-LICENSES.md) (CC0 Versilian / Karoryfer / Virtuosity; Salamander **CC BY 3.0** — Alexander Holm, attribution required; **jRhodes3d excluded** as CC BY-NC).

After `./install.sh`, files live in `/opt/soundtube/app/assets/samples`. Optional override: `SOUNDTUBE_SAMPLES`. Check: `curl -s localhost:8080/api/health` → `samples: true`.

## Verify

```bash
systemctl status soundtube
curl -s http://127.0.0.1:8080/api/health
npm test   # from the app directory if you keep sources/tests
```

## Trend watch & AI

No API key is required for the default RSS crawl. Optional: YouTube Data API key, DuckDuckGo discovery toggle, separate Ollama model for watch under Admin → AI. See `SAMPLES-LICENSES.md` for the sample bank; see Operations for crawler security.

## Updating (patch on an existing CT)

**Patch** / **complete** archives from v1.19.2+ are **flat** (no `soundtube/` prefix).

```bash
See update script below.

## Update (flat patch)

Use the bundled script (**root**, no `sudo` inside the command):

```bash
/opt/soundtube/app/scripts/update.sh /path/soundtube-1.21.1-patch.tar.gz
# or several patches in order:
/opt/soundtube/app/scripts/update.sh /path/patch-a.tar.gz /path/patch-b.tar.gz
```

It **verifies** every archive (gzip, tar, **flat** layout — no `soundtube/` prefix) **before** stopping the service, backs up to `/var/backups/soundtube/`, extracts, runs `node --check`, **always** restarts (restores the backup if extraction failed), then waits for `http://127.0.0.1:8080/healthz`.

> Do not hand-roll `systemctl stop && tar … && systemctl start`: if `tar` fails, the service stays down (502).
curl -s localhost:8080/api/health
```

Hard-refresh Admin: pill **v1.19.2**, section **03 AI models** (Director | Watch).

> If an older archive created `/opt/soundtube/app/soundtube/`, the server ignores it. Remove that nested folder after applying a flat patch, or extract with `--strip-components=1`.

## v1.20.0 — Security & public exposure

See [SECURITY.md](./SECURITY.md) and [EXPOSURE.md](./EXPOSURE.md).

## v1.21.3

```bash
/opt/soundtube/app/scripts/update.sh /root/soundtube-1.21.3-patch.tar.gz
curl -s http://127.0.0.1:8080/healthz   # {"ok":true,"version":"1.21.3"}
```
- New: art director system prompt configurable in Admin › 07 (`/var/lib/soundtube/director-prompt.json`, created on first save; see [DIRECTOR.md](./DIRECTOR.md)). Audio engine unchanged.
- macOS agent: installer fixed. On the Mac, unzip
  `dist/soundtube-node-agent-1.21.3-macos.zip`, run `./install-macos.sh --system --generate-token --name "Mac-mini"` and
  paste the printed token into Admin → Render nodes. `ECONNREFUSED` / `401` diagnosis: [NODES.md](./NODES.md).

## v1.21.2

```bash
/opt/soundtube/app/scripts/update.sh /root/soundtube-1.21.2-patch.tar.gz
curl -s http://127.0.0.1:8080/healthz   # {"ok":true,"version":"1.21.2"}
```
- systemd unit: `ExecReload=/bin/kill -HUP $MAINPID` (optional; `systemctl reload soundtube` then reloads accounts). `admin-reset.js` sends the signal itself.
- Listening profile: `/var/lib/soundtube/gout.json` (created the first time card 07 is shown, from `contexte/gout.json` if present, otherwise `contexte/gout.example.json`). To install a personal profile, copy it to `/var/lib/soundtube/gout.json` (owner `soundtube`) or paste it into card 07.
- Access recovery: `node /opt/soundtube/app/scripts/admin-reset.js <user> --disable-2fa --password` (root).
