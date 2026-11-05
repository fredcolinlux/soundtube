# Manuel d’installation — soundtube 1.17.0

Public cible : administrateur système. Environnement neuf **sans** dépendre d’une machine particulière.

## 1. CT — Debian 13 (bare metal ou LXC)

Prérequis : Debian 13 (trixie), accès **root**, réseau, ~2 Go disque (+ échantillons).

```bash
# en root, depuis l’archive standalone
tar -xzf soundtube-1.17.0-standalone.tar.gz
cd soundtube-1.17.0
./install.sh --port 8080
```

Le script (`deploy/install.sh`) :

- n’appelle **pas** `sudo` (il exige déjà d’être root) ;
- installe ffmpeg + Node.js 24 (NodeSource) si besoin ;
- crée l’utilisateur système `soundtube`, copie sous `/opt/soundtube/app`, données `/var/lib/soundtube`, conf `/etc/soundtube/soundtube.env` ;
- active `soundtube.service`.

Options : `--port`, `--nodesource`, `--debian-node`, `--no-start`, `--skip-apt`.

### Conteneur LXC (Proxmox)

- Debian 13, nesting inutile pour soundtube seul.
- Bridged networking pour joindre les nœuds Windows/Mac et Ollama.
- Allouer CPU/RAM selon `SOUNDTUBE_MAX_JOBS` et les rendus vidéo locaux.

### Échantillons

Non inclus dans l’archive légère. Copier le pack dans `/opt/soundtube/app/assets/samples/` (ou le chemin `SOUNDTUBE_SAMPLES`) puis redémarrer le service.

## 2. Nœud Windows

1. Node.js LTS + FFmpeg (l’installeur PowerShell peut les poser via winget).
2. Extraire `dist/soundtube-node-agent-1.17.0-windows.zip`.
3. PowerShell **administrateur** :
   ```powershell
   .\install-windows.ps1 -AllowFrom 192.168.1.0/24
   ```
   `-AllowFrom` = CIDR autorisés à joindre le port agent (défaut : plages privées).  
   `-CtAddress` optionnel pour la découverte.
4. Pare-feu : règle Privé créée par l’installeur.
5. Sur le CT, Admin › Nœuds : `http://<IP-Windows>:8765` (+ jeton si configuré).

Désinstallation : `uninstall-windows.ps1`.

## 3. Nœud macOS (Apple Silicon)

1. Homebrew + `ffmpeg` ; Node 24 recommandé (l’installeur peut guider).
2. Extraire `dist/soundtube-node-agent-1.17.0-macos.zip`.
3. ```bash
   ./install-macos.sh          # LaunchAgent utilisateur (défaut)
   ./install-macos.sh --system # LaunchDaemon (root)
   ```
4. Données : `~/Library/Application Support/soundtube-node` (Agent) ou chemin système.
5. Autoriser `node` au pare-feu à la première invite.
6. Admin › Nœuds : `http://<IP-Mac>:8765`.

Désinstallation : `./uninstall-macos.sh`.

Encodeur : **VideoToolbox** (hardware) prioritaire sur libx264.

## 4. Ollama (PC IA)

1. Installer Ollama sur une machine du LAN, tirer un modèle (ex. `qwen3:14b`).
2. Écouter sur `0.0.0.0:11434` si besoin hors localhost.
3. CT → Admin › PC IA : `http://192.168.1.50:11434` (exemple), Tester.
4. Proxy inverse : indiquer l’URL complète avec chemin de base ; l’API utilise des chemins relatifs (`api/chat`, repli `api/generate`).

## 5. YouTube OAuth

Voir aussi `docs/YOUTUBE.md`.

1. Projet Google Cloud, OAuth « application de bureau », URI de redirection `http://127.0.0.1`.
2. Obtenir `client_id`, `client_secret`, puis un `refresh_token`.
3. Enregistrer la chaîne dans Admin (les secrets ne sont jamais renvoyés en clair par l’API).
4. Ne pas committer de secrets ; garder `/etc/soundtube/` et `data/` hors dépôt.

## 6. Réseau multi-sous-réseaux

- Découverte UDP (47811) : souvent bloquée entre VLANs → **ajouter l’URL manuellement** dans Admin.
- Pare-feu : autoriser TCP 8080 (CT), 8765 (agents), 11434 (Ollama) selon les flux.
- Windows : `-AllowFrom` doit couvrir le sous-réseau du CT (ex. `192.168.1.0/24`).
- Exemple pédagogique : CT `192.168.1.10`, PC `192.168.2.20`, Mac `192.168.3.30` — routage L3 requis.

## 7. Mises à jour

```bash
# en root, depuis la nouvelle archive / sources
./install.sh --port 8080
```

La conf `/etc/soundtube/soundtube.env` est conservée (sauvegarde horodatée + `migrate-env.sh`).  
Réinstaller les agents Windows/macOS si le zip d’agent change (hash moteur / protocole).

## 8. Sauvegarde

À inclure :

- `/var/lib/soundtube/` (base, médias, réglages runtime) ;
- `/etc/soundtube/soundtube.env` ;
- exports OAuth / notes hors machine si besoin.

Exclure : `node_modules/`, caches temporaires de jobs.

## 9. Dépannage

| Symptôme | Piste |
|----------|--------|
| Service down | `journalctl -u soundtube -n 100` ; Node ≥ 20 ; port libre |
| Nœud offline | ping/curl `:8765/health` ; pare-feu ; jeton ; `POST /nodes/check` |
| Vidéo lente sur CT | ajouter nœud NVENC / VideoToolbox ; baisser slots locaux |
| IA en repli local | URL Ollama, modèle tiré, délai Admin |
| Pas d’instruments acoustiques | pack `assets/samples` manquant |
| YouTube échoue | refresh_token, quotas API, `SOUNDTUBE_YT_TRANSPORT` |

Arrêt d’urgence d’un serveur de test local : identifier le PID avec `ss -ltnp` puis `kill` — ne pas tuer à l’aveugle.
