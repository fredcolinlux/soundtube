# Quick start — soundtube 1.18.0

## 1. Install the control tower (CT)

On Debian 13, **as root** (no `sudo` if already root):

```bash
tar -xzf soundtube-1.18.0-standalone.tar.gz
cd soundtube-1.18.0
./install.sh --port 8080
```

Options: `--nodesource` | `--debian-node` | `--no-start` | `--skip-apt`.

Service: `systemctl status soundtube` · config: `/etc/soundtube/soundtube.env` · app: `/opt/soundtube/app` · data: `/var/lib/soundtube`.

Open `http://<host>:8080/` → **Studio**. Use **FR | EN** in the top bar.

## 2. First track

1. **Studio** (`/`) → pick a **Style** (e.g. Lo-fi).
2. Set **Duration** (e.g. 90 s), leave tempo / key on Auto if you want.
3. Optional: **Art director** → describe a mood → **Suggest**.
4. **Generate track**.
5. When done, open **Library**, play, download WAV / MP3 / MIDI.

## 3. Optional: Windows or Mac render node

Unpack `dist/soundtube-node-agent-1.18.0-windows.zip` or `…-macos.zip`, run the platform installer, then in **Admin → Render nodes** add `http://<node>:8765` (token if you set one). See [docs/en/NODES.md](docs/en/NODES.md).

## 4. Optional: Ollama art director

**Admin → AI PC (Ollama)** → URL like `http://192.168.1.50:11434` + model name → **Test connection**.

## Next

- [docs/en/USER-MANUAL.md](docs/en/USER-MANUAL.md)
- [docs/en/INSTALL-MANUAL.md](docs/en/INSTALL-MANUAL.md)
- [docs/README.md](docs/README.md)
