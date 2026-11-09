# soundtube-node 1.21.3 — agent de rendu musique + vidéo

Petit serveur Node.js (**aucune dépendance npm**) qui reçoit les rendus de soundtube depuis le CT :

- **musique** : même moteur que le CT (`core/`), résultat **identique au bit près** (empreinte SHA-256 + morceau de référence) ;
- **vidéo** : encodeur matériel selon la machine —
  - Windows + NVIDIA → **NVENC** (`h264_nvenc`) ;
  - macOS Apple Silicon → **VideoToolbox** (`h264_videotoolbox`) ;
  - sinon → **libx264** (processeur).

> Réseau local uniquement. Internet seulement pour l’installation (winget / Homebrew).

## Windows 11 (NVIDIA)

1. Décompressez `soundtube-node-agent-1.21.3-windows.zip`.
2. PowerShell **en administrateur** :

```powershell
cd $env:USERPROFILE\Downloads\soundtube-node-agent-1.21.3
Set-ExecutionPolicy -Scope Process Bypass -Force
.\install-windows.ps1
# ou : .\install-windows.ps1 -GenerateToken -AudioSlots 2
```

Installation dans `C:\ProgramData\soundtube-node`, tâche planifiée `soundtube-node`, pare-feu profil Privé.
Options : `-NoAudio`, `-AudioSlots N`, `-AllowFrom 10.0.0.0/24`, `-CtAddress …`.
Désinstallation : `.\uninstall-windows.ps1`.

## macOS Apple Silicon (Mac mini M4…)

1. Décompressez `soundtube-node-agent-1.21.3-macos.zip`.
2. Terminal :

```bash
cd ~/Downloads/soundtube-node-agent-1.21.3
chmod +x install-macos.sh uninstall-macos.sh
./install-macos.sh
# ou : ./install-macos.sh --generate-token --audio-slots 2
# headless sans session : ./install-macos.sh --system   # demande sudo
```

- **Par défaut (sans sudo)** : `~/Library/Application Support/soundtube-node` + **LaunchAgent** (démarrage à l’ouverture de session, KeepAlive).
- **`--system` (sudo)** : `/usr/local/soundtube-node` + **LaunchDaemon** (démarrage au boot, sans session ouverte).
- Homebrew installe **Node 24** (même majeure que le CT) et **ffmpeg** (VideoToolbox inclus) s’ils manquent.
- Journal : `…/soundtube-node/agent.log` (+ `agent.launchd.*.log`).
- Désinstallation : `./uninstall-macos.sh` (ou `--system`).
- ffmpeg : `ffmpeg-full` (avec drawtext = titres de chapitre) est préféré s’il est installé ; sinon `brew install ffmpeg-full`. Sans drawtext, les vidéos sont rendues sans titres de chapitre (Admin : « drawtext absent »).
- Jeton : enregistré dans `config.json` du dossier d’installation (lisible sans sudo) :
  `python3 -c "import json;print(json.load(open('/usr/local/soundtube-node/config.json'))['token'])"` (`--system`).
  Admin « ECONNREFUSED » = agent non lancé ; « jeton refusé (401) » = jetons différents. v1.21.3 : correctif `NameError: name 'true'` + écriture de `config.json` avec sudo en `--system`.

### Pare-feu macOS

Le pare-feu applications est **par app** (pas de filtre CIDR). Au premier démarrage, acceptez
« Autoriser les connexions entrantes » pour `node`. Forcer (sudo) :

```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "$(which node)"
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp "$(which node)"
```

Le contrôle d’accès principal reste le **jeton** (`--token` / `-Token`). Un ancrage `pf` optionnel
est documenté dans `docs/NODES.md` si vous voulez restreindre aux sous-réseaux du CT.

### Sous-réseaux différents (CT / PC Windows / Mac)

La découverte UDP **ne traverse en général pas** les sous-réseaux routés. Si le CT est en
`10.0.0.x`, le PC en `10.0.1.x` et le Mac ailleurs : dans Admin, **Ajouter** l’URL
`http://<IP-du-Mac>:8765` (et le jeton). Même chose pour le PC Windows.

## Ordre des encodeurs (vidéo)

`NVENC (0) → VideoToolbox (1) → QSV/AMF (2) → libx264 (3)`.

Args VideoToolbox (débit, pas `-q:v`) : `-b:v` / `-maxrate` / `-bufsize`, `-qmin -1 -qmax -1`
(pour que le débit soit honoré sur ffmpeg ≥ 7), `-allow_sw 0`, `-realtime 0`, `-prio_speed 0`,
`-pix_fmt yuv420p`, profil `high` (H.264) ou `-tag:v hvc1` (HEVC).

## API

Identique sur Windows et macOS : `/health`, `/jobs`, `/audio`, `/samples/*`. Voir `docs/NODES.md`.
