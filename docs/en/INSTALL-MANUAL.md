# Installation manual — soundtube 1.18.0

## 1. CT — Debian 13 (bare metal or LXC)

Run **as root** (the script does not call `sudo`):

```bash
./install.sh --port 8080
```

Installs Node 24 if needed, user `soundtube`, app under `/opt/soundtube/app`, data `/var/lib/soundtube`, unit `soundtube.service`.

Sample pack is not in the light archive — place files under `assets/samples/` then restart.

## 2. Windows node

Extract `dist/soundtube-node-agent-*-windows.zip`, admin PowerShell:

```powershell
.\install-windows.ps1 -AllowFrom 192.168.1.0/24
```

Admin → Nodes: `http://<PC-IP>:8765`.

## 3. macOS node (Apple Silicon)

```bash
./install-macos.sh          # user LaunchAgent (default)
./install-macos.sh --system # LaunchDaemon
```

Admin → Nodes: `http://<Mac-IP>:8765`. Encoder: VideoToolbox.

## 4. Ollama (optional)

Admin → AI PC: e.g. `http://192.168.1.50:11434`, model `qwen3:14b`, Test.

## 5. YouTube OAuth

See `docs/YOUTUBE.md`. Never commit secrets.

## 6. Multi-subnet networking

UDP discovery may fail across VLANs — add node URLs manually. Open TCP 8080 / 8765 / 11434 as needed. Windows `-AllowFrom` must cover the CT subnet.

## 7. Updates / backup / troubleshooting

Re-run `./install.sh` (env file preserved). Backup `/var/lib/soundtube` and `/etc/soundtube/soundtube.env`. Check `journalctl -u soundtube`, node `/health`, sample pack presence.
