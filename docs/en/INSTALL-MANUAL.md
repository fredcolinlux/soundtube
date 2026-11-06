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

1. Unpack `dist/soundtube-node-agent-1.18.0-windows.zip`.
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
systemctl stop soundtube
cd /opt/soundtube/app
tar xzf /path/soundtube-1.19.2-patch.tar.gz --no-same-owner
test -f public/admin.html && grep -q aiWatchCard public/admin.html && echo OK || echo WRONG_PATH
systemctl start soundtube
curl -s localhost:8080/api/health
```

Hard-refresh Admin: pill **v1.19.2**, section **03 AI models** (Director | Watch).

> If an older archive created `/opt/soundtube/app/soundtube/`, the server ignores it. Remove that nested folder after applying a flat patch, or extract with `--strip-components=1`.

## v1.20.0 — Security & public exposure

See [SECURITY.md](./SECURITY.md) and [EXPOSURE.md](./EXPOSURE.md).
