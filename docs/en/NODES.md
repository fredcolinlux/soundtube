# Render nodes: music + video (v1.18.0)

A node is a LAN machine (Windows NVIDIA PC, Apple Silicon Mac, …) running the `soundtube-node` agent. Since **v1.16.0** it also renders **music** (same engine as the CT, bit-identical). **v1.17.0** adds official **macOS arm64** (VideoToolbox). Zips shipped with CT 1.18.0 are named `soundtube-node-agent-1.18.0-*.zip` (engine fingerprint still `696de0f4125a`).

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

Install root: `C:\ProgramData\soundtube-node`. Options: `-NoAudio`, `-AudioSlots`, `-AllowFrom 192.168.0.0/24`, `-CtAddress`, `-GenerateToken`. Uninstall: `.\uninstall-windows.ps1`.

## 5. macOS Apple Silicon

```bash
./install-macos.sh
# ./install-macos.sh --generate-token --audio-slots 2
# headless boot: ./install-macos.sh --system
```

Default LaunchAgent (no elevation); `--system` → LaunchDaemon. Homebrew may install Node 24 + ffmpeg.

## 6. Admin

**Admin → Render nodes** → `http://192.168.1.20:8765` → optional token → **Add node**. LAN discover (UDP 47811), **Test all**, **Verify**.

## 7. Security

LAN only. Optional shared token. Never commit tokens or OAuth secrets.
