# Nœuds de rendu : musique + vidéo (v1.18.0)

Un nœud est une machine du réseau local (PC Windows NVIDIA, Mac Apple Silicon, …) qui exécute l’agent `soundtube-node`. Depuis la **v1.16.0** il rend aussi la **musique** (même moteur que le CT, identique au bit près). La **v1.17.0** officialise **macOS arm64** (VideoToolbox). Les zips livrés avec le CT 1.18.0 sont nommés `soundtube-node-agent-1.18.0-*.zip` (moteur inchangé : empreinte `696de0f4125a`).

## 1. Capacité musicale

L’agent embarque une copie du moteur : `core/engine/*.js` + `core/titles.js` + `core/ENGINE.json`. Annonce `/health` (exemple) :

```json
"audio": {
  "ok": true, "protocol": 1,
  "engine": { "version": "1.18.0", "hash": "696de0f4125a", "files": 25 },
  "samples": { "hash": "…", "files": 894 },
  "slots": 1, "running": 0, "queued": 0
}
```

- **Empreinte** : SHA-256 ordonnée des fichiers moteur (identique au calcul CT sur `src/`).
- **Samples** : poussés une fois par le CT (vérif SHA-1), stockés sous le dossier d’installation de l’agent.
- Le PC produit WAV + MIDI (+ ZIP MIDI) ; le CT encode le MP3 et calcule forme d’onde / métadonnées.

## 2. Contrôles

1. **Protocole** — agent trop vieux → « version d’agent incompatible ».
2. **Empreinte moteur** — divergence → HTTP 409 « Moteur différent… Réinstaller l’agent fourni avec cette version ».
3. **Empreinte de rendu** — morceau de référence 20 s comparé au bit près ; bouton **Vérifier** dans Admin.

## 3. Routage (CT)

- Combo « musique + vidéo sur le PC/Mac » → nœud capable, quelle que soit la durée.
- Audio ≥ seuil Admin (**Musique sur le PC à partir de**, défaut 15 min) → nœud.
- Court → CT ; CT saturé → nœud libre ; panne → CT en tête de file (annoncé).

Ordre vidéo : **NVENC → VideoToolbox → autres → libx264 → CT**.

## 4. Windows 11 (NVIDIA)

1. Décompresser `dist/soundtube-node-agent-1.18.0-windows.zip`.
2. PowerShell **administrateur** :

```powershell
cd $env:USERPROFILE\Downloads\soundtube-node-agent-1.18.0
Set-ExecutionPolicy -Scope Process Bypass -Force
.\install-windows.ps1
# .\install-windows.ps1 -GenerateToken -AudioSlots 2
```

- Install : `C:\ProgramData\soundtube-node`, tâche planifiée `soundtube-node`, pare-feu profil **Privé**.
- Options : `-NoAudio`, `-AudioSlots N`, `-AllowFrom 192.168.0.0/24`, `-CtAddress …`, `-GenerateToken`.
- Désinstall : `.\uninstall-windows.ps1`.

## 5. macOS Apple Silicon

```bash
cd ~/Downloads/soundtube-node-agent-1.18.0
chmod +x install-macos.sh uninstall-macos.sh
./install-macos.sh
# ./install-macos.sh --generate-token --audio-slots 2
# sans session graphique : ./install-macos.sh --system
```

- **Défaut** : `~/Library/Application Support/soundtube-node` + **LaunchAgent** (pas d’élévation).
- **`--system`** : `/usr/local/soundtube-node` + **LaunchDaemon** (élévation requise).
- Homebrew : Node 24 + ffmpeg (VideoToolbox) si besoin.
- Journal : `…/soundtube-node/agent.log`.
- Désinstall : `./uninstall-macos.sh` (ou `--system`).

Pare-feu apps macOS : autoriser `node` à la première connexion. Le contrôle d’accès principal reste le **jeton**.

## 6. Enregistrement dans Admin

**Admin → Nœuds de rendu** → Adresse `http://192.168.1.20:8765` → jeton si défini → **Ajouter le nœud**.  
**Rechercher sur le réseau** utilise la découverte UDP (port 47811). **Tester tout** / **Vérifier**.

## 7. Sécurité

- Réseau local uniquement ; pas d’exposition Internet de l’agent.
- Jeton optionnel partagé CT ↔ agent (`SOUNDTUBE_NODE_TOKEN` / config agent).
- Ne committez jamais de jetons ni de secrets OAuth dans le dépôt.
