# Render nodes: music + video (v1.19.0)

A node is a LAN machine (Windows NVIDIA PC, Apple Silicon Mac, …) running the `soundtube-node` agent. Since **v1.16.0** it also renders **music** (same engine as the CT, bit-identical). **v1.17.0** adds official **macOS arm64** (VideoToolbox). Zips shipped with CT 1.19.0 are named `soundtube-node-agent-1.19.0-*.zip` (engine fingerprint still `696de0f4125a`).

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
cd ~/Downloads/soundtube-node-agent-1.19.0
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
