# Démarrage rapide — soundtube 1.17.0

## Machine CT (Debian 13)

```bash
# en root
tar -xzf soundtube-1.17.0-standalone.tar.gz
cd soundtube-1.17.0   # ou le dossier extrait
./install.sh --port 8080
```

Ouvrir `http://<IP-du-CT>:8080/`. Première visite : page **/demarrer**.

Sans pack d’échantillons (`assets/samples/`), seuls les kits synthétiques sont disponibles.
Placez le pack d’échantillons dans `assets/samples/` puis `systemctl restart soundtube`.

## Nœud Windows (rendu vidéo / audio)

1. Copier `dist/soundtube-node-agent-1.17.0-windows.zip` sur le PC.
2. Extraire, ouvrir PowerShell **en administrateur** :
   ```powershell
   .\install-windows.ps1 -AllowFrom 192.168.1.0/24
   ```
3. Dans Admin › Nœuds du CT : ajouter `http://<IP-du-PC>:8765`.

## Nœud macOS (Apple Silicon)

1. Copier `dist/soundtube-node-agent-1.17.0-macos.zip` sur le Mac.
2. Extraire, dans Terminal :
   ```bash
   ./install-macos.sh
   ```
   (LaunchAgent utilisateur par défaut — pas besoin de root.)
3. Admin › Nœuds : `http://<IP-du-Mac>:8765`.

## PC IA (Ollama, facultatif)

Admin › PC IA : `http://<IP-Ollama>:11434`, modèle `qwen3:14b` (ou autre), Tester.

## Suite

- Manuel utilisateur : `docs/MANUEL-UTILISATEUR.md`
- Installation détaillée : `docs/MANUEL-INSTALLATION.md`
- Exploitation : `docs/EXPLOITATION.md`
