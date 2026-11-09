# Render nodes: music + video (v1.19.0)

A node is a LAN machine (Windows NVIDIA PC, Apple Silicon Mac, …) running the `soundtube-node` agent. Since **v1.16.0** it also renders **music** (same engine as the CT, bit-identical). **v1.17.0** adds official **macOS arm64** (VideoToolbox). Zips shipped with CT 1.19.0 are named `soundtube-node-agent-1.21.3-*.zip` (engine fingerprint still `696de0f4125a`).

## 1. Audio capability

The agent embeds `core/engine/*.js` + `core/titles.js` + `core/ENGINE.json` and advertises them on `/health`. Samples are pushed once by the CT (SHA-1 verified). The node returns WAV + MIDI; the CT builds MP3 and metadata.

## 2. Guards

1. Protocol mismatch → incompatible agent version.  
2. Engine hash mismatch → HTTP 409, reinstall the agent from **this** CT release.  
3. Reference 20 s render must match bit-for-bit — Admin **Verify**.

## 3. CT routing

- Combined music+video option → capable node at any duration.  
- Audio ≥ Admin threshold (**Music on PC from**, default 15 min) → node.  
- Short jobs → CT; CT busy → free node; failure → CT (surfaced in UI).  

Video encoder preference: **NVENC → VideoToolbox → other → libx264 → CT**.

## 4. Windows 11 (NVIDIA)

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\install-windows.ps1
# .\install-windows.ps1 -GenerateToken -AudioSlots 2
```

Install root: `C:\ProgramData\soundtube-node`. Options: `-NoAudio`, `-AudioSlots`, `-AllowFrom 10.0.0.0/24`, `-CtAddress`, `-GenerateToken`. Uninstall: `.\uninstall-windows.ps1`.

## 6bis. macOS Apple Silicon (v1.17.0)

### Install

```bash
cd ~/Downloads/soundtube-node-agent-1.21.3
chmod +x install-macos.sh uninstall-macos.sh
./install-macos.sh
./install-macos.sh --generate-token
./install-macos.sh --no-audio
./install-macos.sh --audio-slots 2
./install-macos.sh --system   # LaunchDaemon (requires elevation)
```

- **Default**: `~/Library/Application Support/soundtube-node` + **LaunchAgent** (no elevation).
- **`--system`**: `/usr/local/soundtube-node` + **LaunchDaemon**.
- Homebrew: Node 24 + ffmpeg (**VideoToolbox**).
- Logs: `agent.log`, launchd out/err.

### Firewall

macOS Application Firewall is per-app. On first listen, allow `node`. To force:

```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "$(which node)"
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp "$(which node)"
```

Access control remains the shared **token**. UDP discovery (47811) often stays on-subnet — add the Mac URL manually in Admin when routed across subnets.

### Uninstall

```bash
./uninstall-macos.sh
./uninstall-macos.sh --keep-files
./uninstall-macos.sh --system
```


### Mac node "Offline": quick diagnosis (v1.21.3)

| Message in Admin | Meaning | What to do |
|---|---|---|
| `connect ECONNREFUSED <IP>:8765` | The Mac answers but **nothing listens** on 8765: the agent is not running (never installed, uninstalled or crashed). | `launchctl print gui/$(id -u)/com.soundtube.node` (or `sudo launchctl print system/com.soundtube.node` for `--system`); if "Could not find service", (re)install with `install-macos.sh`. Otherwise `launchctl kickstart -k …` and read `agent.launchd.err.log`. |
| `jeton refusé (401)` (token refused) | The agent runs but its token **differs** from the one entered in Admin. | Read the agent token (below) and paste it into the node's "token" field, or reinstall with `--token "<Admin token>"`. |
| `ETIMEDOUT` / `EHOSTUNREACH` | The Mac is unreachable (IP changed, routing, firewall). | `ipconfig getifaddr en0` on the Mac; `curl http://<Mac-IP>:8765/health` from the CT; allow `node` in the firewall. |

**Read the agent token on the Mac (no sudo needed, the file is mode 644)** — the file is named `config.json`:

```bash
# --system install
python3 -c "import json;print(json.load(open('/usr/local/soundtube-node/config.json'))['token'])"
# user install (default)
python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/Library/Application Support/soundtube-node/config.json')))['token'])"
```

Do not paste example placeholders literally (`LE_JETON_DE_L_ADMIN`, `TON_VRAI_JETON`, …): since 1.21.3 the installer warns about
them. Easiest: `./install-macos.sh --system --generate-token --name "Mac-mini"`, then copy the printed token (shown again with the
`config.json` path at the end of the install) into Admin.

**1.21.3 fix in `install-macos.sh`**: the "Configuration" step failed with `NameError: name 'true' is not defined`
(JSON booleans written inside Python code); with `--system`, `config.json` in `/usr/local/soundtube-node` is now written with
`sudo`. If you have an older zip, use `soundtube-node-agent-1.21.3-macos.zip`.

### Video fails with "No such filter: drawtext" / music refused (v1.21.3)

**drawtext**: Homebrew's `ffmpeg` may be built without freetype, hence without the `drawtext` filter (video chapter titles).
Before 1.21.3 the render failed with `ffmpeg code 8: No such filter: 'drawtext'`. Since 1.21.3:

- the agent detects filters at start-up (`agent.mjs --detect` prints `"drawtext": true/false`, also in `/health`);
- without drawtext the video is **still rendered, without chapter titles** (background, static texts pre-rendered as PNG by
  the CT, spectrum and progress bar are unchanged); the node history says so;
- the node card in Admin shows **"drawtext missing"**;
- `install-macos.sh` checks drawtext, **automatically prefers `ffmpeg-full`** when installed, otherwise recommends:

```bash
brew install ffmpeg-full
./install-macos.sh --system --ffmpeg "$(brew --prefix ffmpeg-full)/bin/ffmpeg"
```

**Audio engine**: music is only sent to an agent whose engine fingerprint is **identical** to the CT's (Admin → Distribution).
The engine changed in 1.20.5 (`7afdf699074e`): an agent installed from a 1.19.x zip (`696de0f4125a`) shows "Music: no" /
engine mismatch. Reinstall with `soundtube-node-agent-1.21.3-macos.zip` (or `-windows.zip`), whose `core/ENGINE.json` is
`{ "version": "1.21.3", "hash": "7afdf699074e" }`.

## 5. macOS Apple Silicon (summary)

```bash
./install-macos.sh
# ./install-macos.sh --generate-token --audio-slots 2
# headless boot: ./install-macos.sh --system
```

Default LaunchAgent (no elevation); `--system` → LaunchDaemon. Homebrew may install Node 24 + ffmpeg.

## 6. Admin

**Admin → Render nodes** → `http://10.0.0.20:8765` → optional token → **Add node**. LAN discover (UDP 47811), **Test all**, **Verify**.

## 7. Security

LAN only. Optional shared token. Never commit tokens or OAuth secrets.
