#!/bin/sh
# v1.17.0 : construit le zip de l'agent (Windows et/ou macOS).
# core/ = copie exacte du moteur audio du CT + ENGINE.json { version, hash }.
# Usage :
#   sh tools/build-node-agent.sh                  # les deux zips dans /workspace
#   sh tools/build-node-agent.sh windows [out.zip]
#   sh tools/build-node-agent.sh macos [out.zip]
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VER="$(node -p "require('$ROOT/package.json').version")"
TARGET="${1:-all}"
OUT_ARG="${2:-}"

build_one() {
  platform="$1"
  OUT="${2:-$ROOT/../soundtube-node-agent-$VER-$platform.zip}"
  TMP="$(mktemp -d)"; D="$TMP/soundtube-node-agent-$VER"
  mkdir -p "$D/core/engine"
  COMMON="agent.mjs render-core.mjs audio.mjs audio-worker.mjs engine-id.mjs package.json config.example.json README.md"
  for f in $COMMON; do cp "$ROOT/node-agent/$f" "$D/"; done
  if [ "$platform" = windows ]; then
    for f in install-windows.ps1 uninstall-windows.ps1 start-agent.cmd; do cp "$ROOT/node-agent/$f" "$D/"; done
  else
    for f in install-macos.sh uninstall-macos.sh start-agent.sh; do cp "$ROOT/node-agent/$f" "$D/"; done
    chmod +x "$D/install-macos.sh" "$D/uninstall-macos.sh" "$D/start-agent.sh"
  fi
  cp "$ROOT"/src/engine/*.js "$D/core/engine/"; cp "$ROOT/src/titles.js" "$D/core/"
  HASH="$(node --input-type=module -e "import { engineId } from '$ROOT/node-agent/engine-id.mjs'; process.stdout.write(engineId('$ROOT/src').hash)")"
  printf '{ "version": "%s", "hash": "%s" }\n' "$VER" "$HASH" > "$D/core/ENGINE.json"
  CHK="$(node --input-type=module -e "import { engineId } from '$ROOT/node-agent/engine-id.mjs'; process.stdout.write(engineId('$D/core').hash)")"
  [ "$HASH" = "$CHK" ] || { echo "empreinte core/ ($CHK) différente du CT ($HASH)"; exit 1; }
  rm -f "$OUT"; (cd "$TMP" && python3 -c "import shutil,sys; shutil.make_archive(sys.argv[1][:-4], 'zip', '.', sys.argv[2])" "$OUT" "soundtube-node-agent-$VER")
  rm -rf "$TMP"
  echo "$OUT : moteur $VER · $HASH ($platform)"; ls -l "$OUT"
}

case "$TARGET" in
  windows) build_one windows "$OUT_ARG" ;;
  macos) build_one macos "$OUT_ARG" ;;
  all)
    build_one windows "${OUT_ARG:-$ROOT/../soundtube-node-agent-$VER-windows.zip}"
    build_one macos "$ROOT/../soundtube-node-agent-$VER-macos.zip"
    ;;
  *) echo "usage: $0 [all|windows|macos] [out.zip]"; exit 1 ;;
esac
