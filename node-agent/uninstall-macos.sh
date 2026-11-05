#!/usr/bin/env bash
# soundtube — désinstallation de l'agent macOS.
#   ./uninstall-macos.sh              # retire le LaunchAgent et le dossier utilisateur
#   ./uninstall-macos.sh --keep-files # garde config.json et les journaux
#   ./uninstall-macos.sh --system     # retire le LaunchDaemon (sudo)
set -euo pipefail
KEEP=0
SYSTEM=0
LABEL="com.soundtube.node"
INSTALL_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep-files) KEEP=1; shift ;;
    --system) SYSTEM=1; shift ;;
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    *) echo "option inconnue : $1" >&2; exit 1 ;;
  esac
done
if [[ -z "$INSTALL_DIR" ]]; then
  if [[ "$SYSTEM" -eq 1 ]]; then INSTALL_DIR="/usr/local/soundtube-node"
  else INSTALL_DIR="${HOME}/Library/Application Support/soundtube-node"; fi
fi

if [[ "$SYSTEM" -eq 1 ]]; then
  sudo launchctl bootout system/"$LABEL" 2>/dev/null || true
  sudo rm -f "/Library/LaunchDaemons/${LABEL}.plist"
  echo "LaunchDaemon $LABEL retiré"
else
  launchctl bootout gui/"$(id -u)"/"$LABEL" 2>/dev/null || true
  rm -f "${HOME}/Library/LaunchAgents/${LABEL}.plist"
  echo "LaunchAgent $LABEL retiré"
fi

# processus restants
pkill -f "$INSTALL_DIR/agent.mjs" 2>/dev/null || true

if [[ "$KEEP" -eq 0 ]]; then
  if [[ "$SYSTEM" -eq 1 ]]; then sudo rm -rf "$INSTALL_DIR"
  else rm -rf "$INSTALL_DIR"; fi
  echo "$INSTALL_DIR supprimé"
else
  echo "fichiers conservés dans $INSTALL_DIR"
fi
echo "Pensez à retirer le nœud dans soundtube > Admin."
echo "Node.js et ffmpeg (Homebrew) ne sont pas retirés : brew uninstall node@24 ffmpeg"
