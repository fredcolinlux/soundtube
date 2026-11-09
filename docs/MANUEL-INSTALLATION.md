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
See update script below.

## Mise à jour (patch plat)

Utilise le script inclus (en **root**, sans `sudo` dans la commande) :

```bash
# depuis n’importe où, avec le script déjà déployé :
/opt/soundtube/app/scripts/update.sh /chemin/soundtube-1.21.1-patch.tar.gz

# ou plusieurs patches dans l’ordre :
/opt/soundtube/app/scripts/update.sh /chemin/patch-a.tar.gz /chemin/patch-b.tar.gz
```

Le script **vérifie** chaque archive (gzip, tar, layout **plat** sans préfixe `soundtube/`) **avant** d’arrêter le service, crée une sauvegarde dans `/var/backups/soundtube/`, applique, contrôle la syntaxe Node, redémarre **toujours** (reprise de la sauvegarde si l’extraction a échoué), puis attend `http://127.0.0.1:8080/healthz`.

> Ne plus enchaîner à la main `systemctl stop && tar … && systemctl start` : si le `tar` échoue, le service reste arrêté (502).
curl -s localhost:8080/api/health
```

Puis **Ctrl+F5** sur Admin : pastille **v1.19.2**, section **03 Modèles IA** (Directeur | Veille).

> Si une ancienne archive (préfixe `soundtube/`) a créé `/opt/soundtube/app/soundtube/`, ce dossier est **ignoré** par le serveur. Supprimez-le après avoir appliqué un patch plat, ou : `tar xzf …-patch.tar.gz -C /opt/soundtube/app --strip-components=1 --no-same-owner`.

## v1.20.0 — sécurité / exposition

- [SECURITY.md](./SECURITY.md)
- [EXPOSITION.md](./EXPOSITION.md)

## v1.21.2

```bash
/opt/soundtube/app/scripts/update.sh /root/soundtube-1.21.2-patch.tar.gz
curl -s http://127.0.0.1:8080/healthz   # {"ok":true,"version":"1.21.2"}
```
- Unité systemd : `ExecReload=/bin/kill -HUP $MAINPID` (facultatif ; `systemctl reload soundtube` relit alors les comptes). `admin-reset.js` envoie lui-même le signal.
- Profil d'écoute : `/var/lib/soundtube/gout.json` (créé au premier affichage de la carte 07 à partir de `contexte/gout.json` s'il existe, sinon de `contexte/gout.example.json`). Pour installer un profil personnel : copier le fichier dans `/var/lib/soundtube/gout.json` (propriétaire `soundtube`) ou le coller dans la carte 07.
- Récupération d'accès : `node /opt/soundtube/app/scripts/admin-reset.js <utilisateur> --disable-2fa --password` (root).
