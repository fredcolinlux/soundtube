# Manuel d’installation — soundtube 1.18.0

## Prérequis

- **CT :** Debian 13 (trixie) conseillé ; **exécution en root** (LXC). Node.js ≥ 20 (NodeSource 22 par défaut ; agents en Node 24).
- **ffmpeg** (MP3 + vidéo).
- Optionnel : PC Windows 11 + NVIDIA, ou Mac Apple Silicon, pour les nœuds.
- Optionnel : hôte Ollama sur le LAN pour le directeur artistique.

## Installer / mettre à jour le CT

Depuis l’arbre standalone décompressé, **en root** (`install.sh` refuse le non-root et n’appelle pas `sudo`) :

```bash
./install.sh --port 8080
# ou : ./deploy/install.sh --port 8080
```

| Option | Effet |
|---|---|
| `--port N` | Définit `SOUNDTUBE_PORT` |
| `--nodesource` | Force NodeSource |
| `--debian-node` | Nodejs/npm Debian |
| `--no-start` | Sans redémarrage du service |
| `--skip-apt` | ffmpeg + node déjà présents |

Chemins : `/opt/soundtube/app`, `/var/lib/soundtube`, `/etc/soundtube/soundtube.env`, unité systemd `soundtube.service`.

Mise à jour : sauvegarde `.bak-<date>` + fusion `deploy/migrate-env.sh`.  
Désinstallation : `./deploy/uninstall.sh`.

## Clés de configuration (extrait)

Voir `deploy/soundtube.env` : `SOUNDTUBE_HOST/PORT`, `DATA_DIR`, `MAX_JOBS`, `MAX_QUEUE`, `MAX_DURATION`, `MP3`, `LUFS`, `TRUE_PEAK`, `ARTIST`, `KEEP_WAV`, `SAMPLE_CACHE_MB`, `MEDIA_MAX_MB`, `RENDER_NODES`, `NODE_TOKEN`, `LOCAL_VIDEO_SLOTS`, `YT_TRANSPORT=mock`.

## Nœud Windows

Décompresser `dist/soundtube-node-agent-1.18.0-windows.zip`, PowerShell **administrateur** : `.\install-windows.ps1`.  
Détails : [NODES.md](NODES.md).

## Nœud macOS (Apple Silicon)

`./install-macos.sh` (LaunchAgent sans élévation par défaut ; `--system` pour LaunchDaemon).  
Détails : [NODES.md](NODES.md).


## Banque d'échantillons

Le paquet / dépôt public fournit `assets/samples/` (environ 120 Mo de FLAC). Licences : [SAMPLES-LICENSES.md](../SAMPLES-LICENSES.md) (CC0 Versilian / Karoryfer / Virtuosity ; Salamander **CC BY 3.0** — Alexander Holm, attribution requise ; **jRhodes3d exclu** car CC BY-NC).

Après `./install.sh`, les fichiers sont dans `/opt/soundtube/app/assets/samples`. Variable optionnelle : `SOUNDTUBE_SAMPLES`. Vérification : `curl -s localhost:8080/api/health | grep samples`.

## Vérifier

```bash
systemctl status soundtube
curl -s http://127.0.0.1:8080/api/health
```

## Veille et IA

Aucune clé API n’est requise pour le crawl RSS par défaut. Optionnel : clé YouTube Data API, bascule DuckDuckGo, modèle Ollama dédié à la veille (Admin → PC IA). Voir `SAMPLES-LICENSES.md` et le manuel d’exploitation pour la sécurité du crawler.

## Mise à jour (patch sur CT déjà installé)

Les archives **patch** et **complet** v1.19.2+ sont à **plat** (pas de préfixe `soundtube/`).

```bash
systemctl stop soundtube
cd /opt/soundtube/app
tar xzf /chemin/soundtube-1.19.2-patch.tar.gz --no-same-owner
# vérifie que les fichiers sont bien ICI (pas dans app/soundtube/) :
test -f public/admin.html && grep -q aiWatchCard public/admin.html && echo OK || echo ÉCHEC_CHEMIN
systemctl start soundtube
curl -s localhost:8080/api/health
```

Puis **Ctrl+F5** sur Admin : pastille **v1.19.2**, section **03 Modèles IA** (Directeur | Veille).

> Si une ancienne archive (préfixe `soundtube/`) a créé `/opt/soundtube/app/soundtube/`, ce dossier est **ignoré** par le serveur. Supprimez-le après avoir appliqué un patch plat, ou : `tar xzf …-patch.tar.gz -C /opt/soundtube/app --strip-components=1 --no-same-owner`.

