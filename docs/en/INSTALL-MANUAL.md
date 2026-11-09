# Installation manual — soundtube 1.21.4

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
- `SOUNDTUBE_EXT_SAMPLES_DIR` (v1.21.4, default `/mnt/samples`; NAS samples, see below)
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

## NAS samples (Synology SMB share → Proxmox host → CT) — v1.21.4

The soundtube CT is an **unprivileged** LXC: it cannot mount an SMB share itself. Mount the share **on the Proxmox host**, then
pass it to the CT **read-only** with a mount point (`mp0`). soundtube only **reads** this folder (never writes, never copies it:
not into the app, not into the public repository) and keeps an index in `/var/lib/soundtube/external-samples-index.json`.

Replace the example values: `192.0.2.10` (NAS IP), `samples` (share name), `105` (CT ID), `nas-user`.
Tip: a dedicated Synology account with **read-only** access to this share.

**1. On the Proxmox host (root)** — CIFS client and credentials:

```bash
apt update && apt install -y cifs-utils
install -m 600 /dev/null /root/.smb-samples
cat > /root/.smb-samples <<'CRED'
username=nas-user
password=nas-password
CRED
chmod 600 /root/.smb-samples
mkdir -p /mnt/nas-samples
```

**2. `soundtube` UID / GID as seen from the host** (unprivileged CT: host = 100000 + CT uid):

```bash
pct exec 105 -- id -u soundtube    # e.g. 999 → host 100999
pct exec 105 -- id -g soundtube    # e.g. 996 → host 100996
```

**3. Host `/etc/fstab` line** (one line; uid/gid = 100000 + the values above):

```
//192.0.2.10/samples /mnt/nas-samples cifs credentials=/root/.smb-samples,uid=100999,gid=100996,file_mode=0444,dir_mode=0555,vers=3.0,_netdev,nofail 0 0
```

```bash
systemctl daemon-reload
mount /mnt/nas-samples
ls /mnt/nas-samples | head          # the NAS folders must show up
```

(Optional: add `ro` to the cifs options for a read-only mount on the host too. `file_mode=0444,dir_mode=0555` already make
files world-readable and not writable.)

**4. Pass the folder to the CT, read-only:**

```bash
pct set 105 -mp0 /mnt/nas-samples,mp=/mnt/samples,ro=1
pct reboot 105                       # the mount point is applied when the CT starts
```

**5. Check from the host:**

```bash
pct exec 105 -- ls -la /mnt/samples | head
pct exec 105 -- runuser -u soundtube -- ls /mnt/samples | head     # readable by the service
pct exec 105 -- runuser -u soundtube -- touch /mnt/samples/test    # must fail: "Read-only file system"
```

**6. In soundtube**: Admin › **06c External samples folder** → folder `/mnt/samples` (default) → **Save** → **Rescan**.
The card shows the number of files per category (kick, snare, clap, rim, closed / open hats, ride, crash), skipped files and
examples. After adding samples on the NAS, click **Rescan** again (no automatic watching on an SMB share).

Notes:
- `nofail`: if the NAS is off when the host boots, the CT still starts with an empty `/mnt/samples`. Once the NAS is back:
  `mount /mnt/nas-samples` on the host, `pct reboot 105`, then **Rescan**.
- The systemd service (`ProtectSystem=full`, `ProtectHome=true`) reads `/mnt/samples` as is; a folder under `/home` or
  `/root` would **not** be visible to the service.
- Other location: `SOUNDTUBE_EXT_SAMPLES_DIR=/mnt/other` in `/etc/soundtube/soundtube.env` (the card’s default), or directly
  in the Admin card.

### How the engine uses these samples

- **Where**: Create › Advanced › **Drum kit** › “**My samples (external folder)**” (`adv.drumKit = "user"` in
  `POST /api/generate`). Works in **every style that has drums** (house, French Touch, techno, hip-hop, lo-fi, trap,
  drum & bass, synthwave, chiptune, cinematic…); the groove stays the style’s, only the drum sounds change. Styles without
  drums (ambient) are unaffected.
- **What**: **drum one-shots only**, sorted from the file name, then the parent folders: `kick`/`bd`, `snare`/`sd`/`snr`,
  `clap`, `rim`/`sidestick`, `hat`/`hh`/`ch` (closed), `open hat`/`oh`/`ohh` (open), `ride`, `crash`/`cymbal`. Ghost notes use
  the same snare, played softer. No snare but claps → claps are used as the snare.
- **Formats**: WAV, AIFF (`.aif`/`.aiff`), FLAC; decoded by ffmpeg (any sample rate / bit depth / mono-stereo, rendered as mono
  44.1 kHz). Skipped: files of 6 s or more and paths (file or folder) containing `loop`, `break`, `fill`, `groove`, `bpm` (loops), unsorted
  files (pads, basses, vocals, misc. percussion), > 50 MB, silent, `._*`, `@eaDir`, `#recycle`.
- **Rendering**: for each track, **one file per category** is drawn from the **seed** (a coherent kit; same seed + same index =
  bit-identical track). Each hit is peak-normalised like the synthesised drums; velocity sets the volume. Missing category →
  the synthesised element of the “house” kit. At least one **kick** and one **snare** (or clap) are required, otherwise the
  whole kit is synthesised.
- **Where it runs**: these tracks are always rendered **on the CT** (Windows / macOS agents do not have the NAS files).
  Anonymous 15 s previews never use these samples.
- **No melodic instruments**: external samples do not replace the piano, Rhodes, strings or synths (those stay from the
  `assets/samples/` pack or synthesis).
- Each track records the index it used (`meta.extSamples`: folder, fingerprint, counts). If the folder content changes, a new
  render of the same seed may pick other files.

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

## v1.21.4

```bash
/opt/soundtube/app/scripts/update.sh /root/soundtube-1.21.4-patch.tar.gz
curl -s http://127.0.0.1:8080/healthz   # {"ok":true,"version":"1.21.4"}
```
- New: Admin › **06b Demo tracks** (up to 10 tracks under 5 min shown without an account on the Styles page, listen-only;
  selection stored in `/var/lib/soundtube/demo-tracks.json`). With no selection, visitors see **no** library track (only the
  15 s preview).
- New: Admin › **06c External samples folder** (default `/mnt/samples`, read-only; setting
  `/var/lib/soundtube/external-samples.json`, index `external-samples-index.json`). NAS mount: see
  [NAS samples](#nas-samples-synology-smb-share--proxmox-host--ct--v1214) below.
- Scoped library: a creator / viewer account only sees its own tracks; the admin sees everything.
- Audio engine changed (new “My samples” kit): fingerprint `22573aa0f775`. Existing renders are bit-identical, but node agents
  must be updated with `dist/soundtube-node-agent-1.21.4-{windows,macos}.zip` (see [NODES.md](./NODES.md)).

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
