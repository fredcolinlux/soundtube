# Manuel d’installation — soundtube 1.21.4

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

Voir `deploy/soundtube.env` : `SOUNDTUBE_HOST/PORT`, `DATA_DIR`, `MAX_JOBS`, `MAX_QUEUE`, `MAX_DURATION`, `MP3`, `LUFS`, `TRUE_PEAK`, `ARTIST`, `KEEP_WAV`, `SAMPLE_CACHE_MB`, `MEDIA_MAX_MB`, `RENDER_NODES`, `NODE_TOKEN`, `LOCAL_VIDEO_SLOTS`, `YT_TRANSPORT=mock`, `EXT_SAMPLES_DIR` (v1.21.4, défaut `/mnt/samples`).

## Nœud Windows

Décompresser `dist/soundtube-node-agent-1.21.3-windows.zip`, PowerShell **administrateur** : `.\install-windows.ps1`.  
Détails : [NODES.md](NODES.md).

## Nœud macOS (Apple Silicon)

`./install-macos.sh` (LaunchAgent sans élévation par défaut ; `--system` pour LaunchDaemon).  
Détails : [NODES.md](NODES.md).


## Banque d'échantillons

Le paquet / dépôt public fournit `assets/samples/` (environ 120 Mo de FLAC). Licences : [SAMPLES-LICENSES.md](../SAMPLES-LICENSES.md) (CC0 Versilian / Karoryfer / Virtuosity ; Salamander **CC BY 3.0** — Alexander Holm, attribution requise ; **jRhodes3d exclu** car CC BY-NC).

Après `./install.sh`, les fichiers sont dans `/opt/soundtube/app/assets/samples`. Variable optionnelle : `SOUNDTUBE_SAMPLES`. Vérification : `curl -s localhost:8080/api/health | grep samples`.

## Samples du NAS (partage SMB Synology → hôte Proxmox → CT) — v1.21.4

Le CT soundtube est un LXC **non privilégié** : il ne peut pas monter un partage SMB lui-même. On monte le partage **sur l’hôte
Proxmox**, puis on le passe au CT en **lecture seule** avec un point de montage (`mp0`). soundtube ne fait que **lire** ce dossier
(jamais d’écriture, jamais de copie : ni dans l’application, ni dans le dépôt public) et range un index dans
`/var/lib/soundtube/external-samples-index.json`.

Remplace les valeurs d’exemple : `192.0.2.10` (IP du NAS), `samples` (nom du partage), `105` (ID du CT), `utilisateur-nas`.
Conseil : un compte Synology dédié, **lecture seule** sur ce partage.

**1. Sur l’hôte Proxmox (root)** — client CIFS et identifiants :

```bash
apt update && apt install -y cifs-utils
install -m 600 /dev/null /root/.smb-samples
cat > /root/.smb-samples <<'CRED'
username=utilisateur-nas
password=mot-de-passe-du-nas
CRED
chmod 600 /root/.smb-samples
mkdir -p /mnt/nas-samples
```

**2. UID / GID de `soundtube` vus depuis l’hôte** (CT non privilégié : hôte = 100000 + uid du CT) :

```bash
pct exec 105 -- id -u soundtube    # ex. 999 → côté hôte 100999
pct exec 105 -- id -g soundtube    # ex. 996 → côté hôte 100996
```

**3. Ligne `/etc/fstab` de l’hôte** (une seule ligne ; uid/gid = 100000 + valeurs ci-dessus) :

```
//192.0.2.10/samples /mnt/nas-samples cifs credentials=/root/.smb-samples,uid=100999,gid=100996,file_mode=0444,dir_mode=0555,vers=3.0,_netdev,nofail 0 0
```

```bash
systemctl daemon-reload
mount /mnt/nas-samples
ls /mnt/nas-samples | head          # les dossiers du NAS doivent apparaître
```

(Facultatif : ajouter `ro` aux options cifs pour un montage en lecture seule dès l’hôte. `file_mode=0444,dir_mode=0555`
rendent déjà les fichiers lisibles par tous et non modifiables.)

**4. Passer le dossier au CT, en lecture seule :**

```bash
pct set 105 -mp0 /mnt/nas-samples,mp=/mnt/samples,ro=1
pct reboot 105                       # le point de montage est appliqué au démarrage du CT
```

**5. Vérifier depuis l’hôte :**

```bash
pct exec 105 -- ls -la /mnt/samples | head
pct exec 105 -- runuser -u soundtube -- ls /mnt/samples | head     # lisible par le service
pct exec 105 -- runuser -u soundtube -- touch /mnt/samples/test    # doit échouer : « Read-only file system »
```

**6. Dans soundtube** : Admin › **06c Dossier de samples externes** → dossier `/mnt/samples` (défaut) → **Enregistrer** →
**Re-scanner**. La carte affiche le nombre de fichiers par catégorie (kick, caisse claire, clap, rim, charleys fermés / ouverts,
ride, crash), les fichiers ignorés et des exemples. Ajout de samples sur le NAS : cliquer de nouveau sur **Re-scanner**
(pas de surveillance automatique sur un partage SMB).

Notes :
- `nofail` : si le NAS est éteint au démarrage de l’hôte, le CT démarre quand même avec un `/mnt/samples` vide. Une fois le
  NAS revenu : `mount /mnt/nas-samples` sur l’hôte, `pct reboot 105`, puis **Re-scanner**.
- Le service systemd (`ProtectSystem=full`, `ProtectHome=true`) lit `/mnt/samples` sans réglage ; un dossier sous `/home`
  ou `/root` ne serait **pas** visible du service.
- Autre emplacement : `SOUNDTUBE_EXT_SAMPLES_DIR=/mnt/autre` dans `/etc/soundtube/soundtube.env` (valeur par défaut de la carte),
  ou directement dans la carte Admin.

### Comment le moteur utilise ces samples

- **Où** : Créer › Avancé › **Kit de batterie** › « **Mes samples (dossier externe)** » (option `adv.drumKit = "user"` de
  `POST /api/generate`). Utilisable dans **tous les styles** qui ont une batterie (house, French Touch, techno, hip-hop, lo-fi,
  trap, drum & bass, synthwave, chiptune, cinématique…) ; le groove reste celui du style, seuls les sons de batterie changent.
  Les styles sans batterie (ambient) ne changent pas.
- **Quoi** : uniquement des **one-shots de batterie**, classés d’après le nom du fichier puis des dossiers parents :
  `kick`/`bd`, `snare`/`sd`/`snr`, `clap`, `rim`/`sidestick`, `hat`/`hh`/`ch` (fermé), `open hat`/`oh`/`ohh` (ouvert),
  `ride`, `crash`/`cymbal`. Les notes fantômes de caisse claire utilisent la même caisse claire, plus doucement.
  Pas de caisse claire mais des claps → les claps servent de caisse claire.
- **Formats** : WAV, AIFF (`.aif`/`.aiff`), FLAC ; décodés par ffmpeg (toute fréquence / profondeur / mono-stéréo, rendus en
  mono 44,1 kHz). Ignorés : fichiers de 6 s ou plus et chemins (fichier ou dossier) contenant `loop`, `break`, `fill`, `groove`, `bpm` (boucles),
  fichiers non classés (pads, basses, voix, percussions diverses), > 50 Mo, silencieux, `._*`, `@eaDir`, `#recycle`.
- **Rendu** : pour chaque morceau, **un fichier par catégorie** est tiré de la **graine** (kit cohérent, même graine + même index
  = même morceau au bit près). Chaque frappe est normalisée en crête comme la batterie de synthèse ; la vélocité règle le
  volume. Catégorie absente → élément synthétisé du kit « house ». Il faut au moins un **kick** et une **caisse claire**
  (ou un clap), sinon tout le kit est synthétisé.
- **Où ça tourne** : ces morceaux sont toujours rendus **sur le CT** (les agents Windows / macOS n’ont pas les fichiers du NAS).
  Les aperçus anonymes de 15 s n’utilisent jamais ces samples.
- **Pas d’instruments mélodiques** : les samples externes ne remplacent ni le piano, ni le Rhodes, ni les cordes, ni les synthés
  (ils restent ceux du pack `assets/samples/` ou de la synthèse).
- Le morceau garde la trace de l’index utilisé (`meta.extSamples` : dossier, empreinte, comptes). Si le contenu du dossier
  change, un nouveau rendu de la même graine peut choisir d’autres fichiers.

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

## v1.21.4

```bash
/opt/soundtube/app/scripts/update.sh /root/soundtube-1.21.4-patch.tar.gz
curl -s http://127.0.0.1:8080/healthz   # {"ok":true,"version":"1.21.4"}
```
- Nouveau : Admin › **06b Morceaux de la démo** (jusqu’à 10 morceaux de moins de 5 min visibles sans compte sur la page Styles,
  écoute seule ; choix enregistré dans `/var/lib/soundtube/demo-tracks.json`). Sans sélection, les visiteurs ne voient
  **aucun** morceau de la bibliothèque (seulement l’aperçu de 15 s).
- Nouveau : Admin › **06c Dossier de samples externes** (défaut `/mnt/samples`, lecture seule ; réglage
  `/var/lib/soundtube/external-samples.json`, index `external-samples-index.json`). Montage du NAS : section
  [Samples du NAS](#samples-du-nas-partage-smb-synology--hôte-proxmox--ct--v1214) ci-dessous.
- Bibliothèque cloisonnée : un compte créateur / lecteur ne voit que ses propres morceaux ; l’admin voit tout.
- Moteur audio modifié (nouveau kit « Mes samples ») : empreinte `22573aa0f775`. Les rendus existants sont identiques au bit
  près, mais les agents de nœud doivent être mis à jour avec `dist/soundtube-node-agent-1.21.4-{windows,macos}.zip`
  (voir [NODES.md](./NODES.md)).

## v1.21.3

```bash
/opt/soundtube/app/scripts/update.sh /root/soundtube-1.21.3-patch.tar.gz
curl -s http://127.0.0.1:8080/healthz   # {"ok":true,"version":"1.21.3"}
```
- Nouveau : prompt système du directeur réglable dans Admin › 07 (`/var/lib/soundtube/director-prompt.json`, créé au premier enregistrement ; voir [DIRECTEUR.md](./DIRECTEUR.md)). Moteur audio inchangé.
- Agent macOS : installateur corrigé. Sur le Mac, décompresser
  `dist/soundtube-node-agent-1.21.3-macos.zip` puis `./install-macos.sh --system --generate-token --name "Mac-mini"` et
  copier le jeton affiché dans Admin → Nœuds. Diagnostic `ECONNREFUSED` / `401` : [NODES.md](./NODES.md#nœud-mac-offline--diagnostic-rapide-v1213).

## v1.21.2

```bash
/opt/soundtube/app/scripts/update.sh /root/soundtube-1.21.2-patch.tar.gz
curl -s http://127.0.0.1:8080/healthz   # {"ok":true,"version":"1.21.2"}
```
- Unité systemd : `ExecReload=/bin/kill -HUP $MAINPID` (facultatif ; `systemctl reload soundtube` relit alors les comptes). `admin-reset.js` envoie lui-même le signal.
- Profil d'écoute : `/var/lib/soundtube/gout.json` (créé au premier affichage de la carte 07 à partir de `contexte/gout.json` s'il existe, sinon de `contexte/gout.example.json`). Pour installer un profil personnel : copier le fichier dans `/var/lib/soundtube/gout.json` (propriétaire `soundtube`) ou le coller dans la carte 07.
- Récupération d'accès : `node /opt/soundtube/app/scripts/admin-reset.js <utilisateur> --disable-2fa --password` (root).
