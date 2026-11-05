#!/usr/bin/env bash
# Installeur racine du package standalone soundtube.
# À lancer EN ROOT depuis la racine de l'archive décompressée.
# Exemple : tar -xzf soundtube-1.17.0-standalone.tar.gz && cd soundtube-1.17.0 && ./install.sh --port 8080
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Lancer en root (pas d'appel à sudo depuis ce script)." >&2; exit 1; }
cd "$(dirname "$0")"
exec ./deploy/install.sh "$@"
