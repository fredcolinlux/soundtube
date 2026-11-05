# Nœuds de rendu : musique + vidéo (v1.16.0, Mac en v1.17.0)

Un nœud est une machine du réseau local (PC Windows NVIDIA, Mac mini Apple Silicon, …) sur laquelle tourne
l’agent `soundtube-node`. Depuis la **v1.16.0**, il rend aussi la **musique** (même moteur que le CT, identique au
bit près). La **v1.17.0** ajoute le support officiel de **macOS arm64** (VideoToolbox).

## 1. Capacité musicale

L’agent 1.16.0 embarque une copie exacte du moteur audio du CT : `core/engine/*.js` + `core/titles.js` + `core/ENGINE.json`.
Il annonce dans `/health` :

```json
"audio": { "ok": true, "protocol": 1, "engine": { "version": "1.16.0", "hash": "696de0f4125a", "files": 25 },
           "samples": { "hash": "0013948721dbfbcb", "files": 894 }, "slots": 1, "running": 0, "queued": 0, "node": "v24.22.1" }
```

- **Empreinte du moteur** (`hash`) : SHA-256 des 24 fichiers `engine/*.js` et de `titles.js`, dans un ordre fixe.
  Le CT calcule la même chose sur `src/`.
- **Samples** : le CT envoie les 894 échantillons (147 Mo, FLAC 44,1 kHz) au premier rendu musical. L’envoi est
  vérifié par SHA-1, n’a lieu qu’une fois et reprend sur les fichiers manquants. Ils sont stockés dans `work/samples` sous le dossier d’installation
  (`C:\ProgramData\soundtube-node\…` ou `~/Library/Application Support/soundtube-node/…`).
- **Ce que rend le PC** : WAV, MIDI et ZIP MIDI. Le CT encode le MP3 à partir du WAV reçu, avec les mêmes réglages
  qu’en local, et calcule la forme d’onde et les métadonnées comme d’habitude. Chaque fichier téléchargé est vérifié
  par SHA-256.

## 2. Contrôle du moteur (refus en cas de différence)

Trois contrôles, du plus simple au plus fin :

1. **Protocole** : un agent ancien (spec vidéo 1, sans `audio`) est refusé avec le message
   « version d’agent incompatible ». Il faut réinstaller l’agent 1.16.0.
2. **Empreinte du moteur** : si le hash du PC diffère de celui du CT, le PC refuse le job (HTTP 409) :
   « Moteur différent : agent 1.16.0 (…), CT … (…). Réinstaller l’agent fourni avec cette version de soundtube. »
   Le CT ne lui envoie alors plus rien. Admin affiche la raison et le morceau est rendu sur le CT.
3. **Empreinte de rendu** : avant le premier morceau, le PC rend un morceau de référence (cinématique, 20 s,
   graine 1160). Le CT compare son WAV au sien, au bit près. Ce contrôle est refait si le moteur, les samples ou la
   version de Node du PC changent. Il couvre le cas où Windows ferait tourner un autre Node/V8. En cas d’écart, la
   musique est refusée sur ce nœud (« empreinte de rendu différente »). Le bouton **Vérifier** d’Admin relance ce
   contrôle à la main.

## 3. Règles de routage (musique)

| Cas | Où | Raison affichée |
|---|---|---|
| Option combinée cochée | PC capable, quelle que soit la durée | `combo` |
| Durée ≥ seuil (15 min par défaut) | PC capable en priorité | `long` |
| Durée < seuil | CT | `court` |
| Durée < seuil mais CT saturé (tous ses rendus occupés) | PC capable **libre** | `sature` |
| CT saturé et PC occupé | attente | — |
| Aucun PC capable | CT | `long-sans-pc` / `combo-sans-pc` |
| PC en panne pendant le rendu | CT, en tête de file | `fallback` |

- Un **PC capable** est : en ligne, activé, avec la musique autorisée dans Admin, agent 1.16.0, même moteur que le
  CT et empreinte de rendu identique.
- **Seuil global** : Admin › Répartition › « Musique sur le PC à partir de … min » (1 à 360 min, 15 par défaut).
  API : `PUT /api/admin/render {"audioMinSec": 900}`.
- **Interrupteur par nœud** : case « Musique » dans la ligne du nœud. Décochée, le PC fait seulement la vidéo.
  API : `PATCH /api/admin/nodes/{id} {"audio": false}`.
- **Panne** : si le PC ne répond plus (3 essais) ou renvoie une erreur, le CT reprend le morceau depuis le début, en
  tête de file. Le statut du job affiche « Nœud en panne : rendu repris sur le CT (…) », puis
  « Repris sur le CT (PC en panne) — … ». `meta.render.fallback` garde la raison. Rien n’est perdu : les fichiers
  partiels sont supprimés.
- Chaque morceau garde `meta.render = { where: 'node'|'ct', node, reason, combo, fallback, ms }`. Le `manifest.json`
  du ZIP le recopie dans `render`.

## 4. Option combinée « Faire la musique et la vidéo en même temps sur le PC Windows »

Elle se trouve dans le formulaire Générer, juste sous « Préparer le ZIP complet ». Elle est décochée par défaut et
mémorisée dans le navigateur.

Quand elle est cochée :

1. la musique part sur le PC, même pour un morceau court ;
2. **dès que le mix existe sur le PC**, la vidéo longue y démarre. Elle réutilise le WAV déjà présent sur le PC (lien
   dur, sans renvoi des Go de WAV), pendant que le CT récupère les fichiers et encode le MP3 ;
3. le ZIP complet (vidéo, mix MP3 + WAV, morceaux, MIDI, samples, manifest.json, LISEZMOI.txt) est construit
   automatiquement. Un lien « Télécharger le ZIP » apparaît sous le formulaire, sans clic de plus. L’option force
   le ZIP même si « Préparer le ZIP complet » n’est pas coché.

Conséquences (rappelées dans Admin › Répartition) :

- le PC est occupé par ce morceau (musique puis vidéo) ;
- s’il n’y a pas de PC capable, tout se passe sur le CT comme sans l’option ;
- **panne pendant la musique** : repli sur le CT (voir plus haut), puis vidéo par la file habituelle ;
- **panne pendant la vidéo** : la vidéo est écrite en `.part` puis renommée, donc aucune vidéo tronquée n’est
  jamais prise. Elle repart par la file vidéo habituelle (autre nœud ou CT) dès que le morceau est terminé. Le ZIP
  n’est construit qu’après, et un ZIP déjà construit n’est jamais modifié.

## 5. Admin

Par nœud :

- ligne « Musique : oui / non » avec la raison, le moteur (version · hash), l’état des samples, la version de Node,
  l’empreinte vérifiée et les rendus en cours ;
- cases **Actif** et **Musique**, et boutons **Détail** (historique des 12 derniers rendus de ce nœud : quand, type,
  morceau, résultat, durée) et **Vérifier** ;
- en bas de Répartition : « Où ont tourné les derniers rendus » (CT et nœuds, 30 derniers). L’historique est gardé
  dans `data/render-history.json` (300 entrées).

## 6. Réinstallation de l’agent Windows (1.16.0+, zip 1.19.0 recommandé)

Le protocole vidéo passe en version 2 et la musique demande `core/`. **Un agent 1.15 ou plus ancien reste utilisable
pour la vidéo seulement** : Admin affiche « agent 1.15.0 : rend la vidéo seulement (réinstaller l’agent 1.16.0) ».

Sur le PC Windows, dans PowerShell **en administrateur** :

```powershell
Expand-Archive "$env:USERPROFILE\Downloads\soundtube-node-agent-1.19.0-windows.zip" -DestinationPath "$env:USERPROFILE\Downloads\st-agent" -Force
cd "$env:USERPROFILE\Downloads\st-agent\soundtube-node-agent-1.19.0"
Set-ExecutionPolicy -Scope Process Bypass -Force
.\install-windows.ps1
```

- Le script arrête l’ancienne tâche, remplace les fichiers et `core\`, conserve `config.json` (jeton, slots), ajoute
  `audio`, `audioSlots` et `samplesDir`, puis redémarre.
- À la fin, il affiche « musique : oui — moteur 1.19.0 · <hash affiché> ». Ce hash doit être identique à celui affiché
  dans Admin › Répartition (« Moteur du CT »).
- Options : `-NoAudio` (vidéo seulement), `-AudioSlots 2` (deux morceaux en parallèle, 1 par défaut ; chaque rendu
  utilise environ 1 cœur et 0,5 à 1,5 Go de RAM).
- Dans Admin, cliquer sur **Tester tout**, puis sur **Vérifier** sur la ligne du PC. Le premier rendu envoie les
  samples (147 Mo, environ 15 s en gigabit).

Construire le zip depuis le CT : `sh tools/build-node-agent.sh` (vérifie que l’empreinte de `core/` est égale à
celle du CT).


## 6bis. macOS Apple Silicon (v1.17.0)

### Installation

```bash
cd ~/Downloads/soundtube-node-agent-1.19.0
chmod +x install-macos.sh uninstall-macos.sh
./install-macos.sh                         # utilisateur, pas de sudo
./install-macos.sh --generate-token        # avec jeton
./install-macos.sh --no-audio              # vidéo seulement
./install-macos.sh --audio-slots 2
./install-macos.sh --system                # LaunchDaemon : sudo obligatoire
```

- **Dossier** : `~/Library/Application Support/soundtube-node` (défaut) ou `/usr/local/soundtube-node` (`--system`).
- **Node** : majeure **24** (alignée sur le CT). Homebrew : `brew install node@24`. Sans Homebrew :
  pkg arm64 sur https://nodejs.org, puis `./install-macos.sh --skip-brew`.
- **ffmpeg** : `brew install ffmpeg` (VideoToolbox est compilé dedans sur macOS).
- **launchd** :
  - **LaunchAgent** (défaut) : démarre à l’ouverture de session, `KeepAlive`, **pas de sudo**. Adapté à un
    Mac mini avec ouverture de session automatique.
  - **LaunchDaemon** (`--system`) : démarre au boot **sans session** ; sudo pour `/Library/LaunchDaemons` et
    `/usr/local`. VideoToolbox fonctionne hors session sur Apple Silicon récent.
- **Journaux** : `agent.log` (rotation à 5 Mo), `agent.launchd.out.log`, `agent.launchd.err.log`.

### Pare-feu

Le pare-feu « Pare-feu » des Réglages Système est **par application**. Au premier `listen` sur 8765, macOS demande
d’autoriser `node` : choisissez **Autoriser**. Pour forcer :

```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "$(which node)"
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp "$(which node)"
```

Il n’y a **pas** d’équivalent simple à `-AllowFrom` (CIDR). Le **jeton** reste le contrôle d’accès. Option avancée
`pf` (sudo, risque de couper le réseau si mal écrit) : voir le message affiché par `install-macos.sh --allow-from …`.

### Réseau multi-sous-réseaux

Exemple : CT en `192.168.0.x`, PC Windows en `192.168.11.x` (routé), Mac sur un troisième sous-réseau.

1. La **découverte UDP** (port 47811) reste en général **dans le sous-réseau** : le bouton « Rechercher sur le
   réseau » peut ne rien trouver.
2. Dans Admin → Nœuds → **Ajouter** : `http://<IP-du-Mac>:8765` (+ jeton si défini). Même chose pour le PC.
3. Vérifier le routage : depuis le CT, `curl http://<IP-du-Mac>:8765/health` doit répondre.

### Désinstallation

```bash
./uninstall-macos.sh              # LaunchAgent + dossier utilisateur
./uninstall-macos.sh --keep-files # garde config et journaux
./uninstall-macos.sh --system     # LaunchDaemon (sudo)
```

Node et ffmpeg Homebrew ne sont pas retirés (`brew uninstall node@24 ffmpeg` si besoin).

### Dépannage Mac

| Symptôme | Piste |
|---|---|
| `VideoToolbox indisponible` | `brew reinstall ffmpeg` ; vérifier `ffmpeg -encoders \| grep videotoolbox` |
| Agent muet après reboot | LaunchAgent = session ouverte ? Sinon `--system` ou ouverture de session auto |
| « Moteur différent » | Réinstaller l’agent fourni avec **cette** version de soundtube (même `ENGINE.json`) |
| Empreinte de rendu différente | Aligner la version de Node sur le CT (`node -v`) |
| Connexion refusée depuis le CT | Autoriser node dans le pare-feu ; vérifier IP/route ; ajouter l’URL à la main |
| Samples jamais reçus | Premier rendu musical depuis le CT ; journal `agent.log` : lignes `[samples]` |

### Ordre vidéo et musique

- **Vidéo** : NVENC (Windows) avant VideoToolbox (Mac) avant libx264. Plusieurs nœuds : le moins chargé du meilleur
  rang gagne (`ENCODER_RANK` dans `render-core.mjs`).
- **Musique** : tout nœud **capable** (même seuil 15 min). En cas d’égalité : **moins chargé**, puis **rendu musical
  le plus rapide** mesuré (moyenne des 8 derniers succès), puis latence réseau.

## 7. API

- `GET /api/admin/nodes` : `nodes[].audio` (capable, reason, enabled, engine, samples, node, verified, audioJobs),
  `nodes[].history`, `audioMinSec`, `engine`, `history`, `ctHistory`.
- `PATCH /api/admin/nodes/{id}` : `{ audio: bool }`. `PUT /api/admin/render` : `{ audioMinSec }`.
- `POST /api/admin/nodes/{id}/verify` : empreinte de rendu, ou 409 avec la raison.
- `POST /api/generate` : `pcCombo: true`.
- Agent : `POST /audio`, `GET /audio/{id}`, `GET /audio/{id}/files/(wav|mid|midzip)`, `DELETE /audio/{id}`,
  `POST /samples/plan`, `PUT /samples/files/*`, `POST /samples/commit` ; `POST /jobs` accepte
  `audioFrom: { job, as }`.

## 8. Limites

- Le **ZIP MIDI** (`…-midi.zip`) n’est pas identique octet pour octet entre deux rendus, même deux rendus sur le CT,
  parce que chaque entrée porte l’heure DOS de création. Les fichiers `.mid` qu’il contient sont identiques. Tous
  les autres fichiers (WAV, MP3, MIDI, métadonnées, forme d’onde) sont identiques au bit près.
- Le PC doit avoir Node ≥ 20. Si sa version de Node donne un rendu différent, l’empreinte le détecte et la musique
  reste sur le CT : il faut alors installer la même version de Node que le CT (`node -v` sur le CT).
- Un morceau long rendu sur le PC renvoie son WAV au CT (≈ 635 Mo par heure). En gigabit, compter environ 6 s par
  heure de musique.
