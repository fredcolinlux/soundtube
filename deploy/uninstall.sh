#!/usr/bin/env bash
# Désinstallation de soundtube. --purge supprime aussi les morceaux, la base et la configuration.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Lancer en root (sudo)." >&2; exit 1; }
PURGE=0; [[ "${1:-}" == "--purge" ]] && PURGE=1
if [[ -d /run/systemd/system ]]; then systemctl disable --now soundtube.service 2>/dev/null || true; fi
rm -f /etc/systemd/system/soundtube.service
[[ -d /run/systemd/system ]] && systemctl daemon-reload || true
rm -rf /opt/soundtube
if (( PURGE )); then
  rm -rf /var/lib/soundtube /etc/soundtube
  id -u soundtube >/dev/null 2>&1 && userdel soundtube || true
  echo "soundtube supprimé (données comprises)."
else
  echo "soundtube supprimé. Données conservées dans /var/lib/soundtube et /etc/soundtube (utiliser --purge pour tout effacer)."
fi
