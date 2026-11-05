# Démarrage rapide — soundtube 1.18.0

## 1. Installer le serveur central (CT)

Sur Debian 13, **en root** (pas de `sudo` si vous l’êtes déjà) :

```bash
tar -xzf soundtube-1.18.0-standalone.tar.gz
cd soundtube-1.18.0
./install.sh --port 8080
```

Options : `--nodesource` | `--debian-node` | `--no-start` | `--skip-apt`.

Service : `systemctl status soundtube` · config : `/etc/soundtube/soundtube.env` · app : `/opt/soundtube/app` · données : `/var/lib/soundtube`.

Ouvrez `http://<hôte>:8080/` → **Studio**. Langue : **FR | EN** dans la barre du haut.

## 2. Premier morceau

1. **Studio** (`/`) → choisissez un **Style** (ex. Lo-fi).
2. Réglez la **Durée** (ex. 90 s), laissez tempo / tonalité en Auto si vous voulez.
3. Optionnel : **Directeur artistique** → décrivez l’ambiance → **Proposer**.
4. **Générer le morceau**.
5. Dans la **Bibliothèque**, écoutez et téléchargez WAV / MP3 / MIDI.

## 3. Optionnel : nœud Windows ou Mac

Décompressez `dist/soundtube-node-agent-1.18.0-windows.zip` ou `…-macos.zip`, lancez l’installeur, puis dans **Admin → Nœuds de rendu** ajoutez `http://<nœud>:8765` (jeton si défini). Voir [docs/NODES.md](docs/NODES.md).

## 4. Optionnel : directeur Ollama

**Admin → PC IA (Ollama)** → URL du type `http://192.168.1.50:11434` + modèle → **Tester la connexion**.

## Suite

- [docs/MANUEL-UTILISATEUR.md](docs/MANUEL-UTILISATEUR.md)
- [docs/MANUEL-INSTALLATION.md](docs/MANUEL-INSTALLATION.md)
- [docs/README.md](docs/README.md)
