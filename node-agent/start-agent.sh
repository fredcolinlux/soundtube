#!/usr/bin/env bash
# Démarre l'agent au premier plan (debug). Pour le service : install-macos.sh.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
exec node "$DIR/agent.mjs"
