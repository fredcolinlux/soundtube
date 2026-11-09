#!/usr/bin/env bash
# soundtube — installation de l'agent de rendu (musique + vidéo, v1.17.0 · correctifs v1.21.3) sur macOS Apple Silicon (Mac mini M4…).
#
# Usage (depuis le dossier décompressé) :
#   chmod +x install-macos.sh uninstall-macos.sh
#   ./install-macos.sh
#   ./install-macos.sh --generate-token
#   ./install-macos.sh --token "monjeton" --name "Mac-mini-M4"
#   ./install-macos.sh --no-audio --audio-slots 2
#   ./install-macos.sh --system          # LaunchDaemon (sudo) : démarre sans session ouverte
#   ./install-macos.sh --ffmpeg "$(brew --prefix ffmpeg-full)/bin/ffmpeg"   # ffmpeg avec drawtext
#
# Par défaut : installation utilisateur (pas de sudo) dans
#   ~/Library/Application Support/soundtube-node
# avec un LaunchAgent (démarrage à l'ouverture de session, relance en cas de crash).
# --system installe dans /usr/local/soundtube-node + LaunchDaemon (sudo obligatoire).
#
# Pare-feu : le pare-feu « applications » de macOS est par application (pas de CIDR).
# Au premier démarrage, macOS demande « Autoriser les connexions entrantes ? » pour node :
# répondre Autoriser. Les options --allow-from / --ct-address documentent le réseau multi-sous-réseaux
# (CT 10.0.0.x, PC 10.0.1.x, Mac ailleurs) et proposent un modèle pf optionnel (sudo).
#
# Node.js : même majeure que le CT (24). Homebrew : brew install node@24 (ou node si déjà 24).
# ffmpeg : brew install ffmpeg (VideoToolbox est inclus dans les builds Homebrew sur macOS).
set -euo pipefail

PORT=8765
TOKEN=""
GENERATE_TOKEN=0
NAME="$(scutil --get ComputerName 2>/dev/null || hostname -s)"
FFMPEG_PATH=""
CT_ADDRESS=""
ALLOW_FROM=()
ENCODER=""
NO_DISCOVERY=0
NO_AUDIO=0
AUDIO_SLOTS=0
SKIP_BREW=0
SYSTEM=0
INSTALL_DIR=""
DISCOVERY_PORT=47811
LABEL="com.soundtube.node"
NODE_MAJOR_REQUIRED=24

step() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '    ATTENTION : %s\n' "$*" >&2; }
fail() { printf '\nÉCHEC : %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --generate-token) GENERATE_TOKEN=1; shift ;;
    --name) NAME="$2"; shift 2 ;;
    --ffmpeg) FFMPEG_PATH="$2"; shift 2 ;;
    --ct-address) CT_ADDRESS="$2"; shift 2 ;;
    --allow-from) ALLOW_FROM+=("$2"); shift 2 ;;
    --encoder) ENCODER="$2"; shift 2 ;;
    --no-discovery) NO_DISCOVERY=1; shift ;;
    --no-audio) NO_AUDIO=1; shift ;;
    --audio-slots) AUDIO_SLOTS="$2"; shift 2 ;;
    --skip-brew) SKIP_BREW=1; shift ;;
    --system) SYSTEM=1; shift ;;
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) fail "option inconnue : $1 (voir --help)" ;;
  esac
done

SRC="$(cd "$(dirname "$0")" && pwd)"
for f in agent.mjs render-core.mjs audio.mjs audio-worker.mjs engine-id.mjs package.json core/ENGINE.json; do
  [[ -f "$SRC/$f" ]] || fail "fichier $f introuvable à côté du script (décompressez tout le zip)"
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  warn "ce script est prévu pour macOS ; uname=$(uname -s)"
fi
ARCH="$(uname -m)"
[[ "$ARCH" == "arm64" ]] || warn "architecture $ARCH : VideoToolbox marche aussi sur Intel, mais le Mac mini M4 est arm64"

if [[ -z "$INSTALL_DIR" ]]; then
  if [[ "$SYSTEM" -eq 1 ]]; then
    INSTALL_DIR="/usr/local/soundtube-node"
  else
    INSTALL_DIR="${HOME}/Library/Application Support/soundtube-node"
  fi
fi

# --- 1. Node.js (majeure = celle du CT) -----------------------------------------------------------
step "Node.js ≥ ${NODE_MAJOR_REQUIRED}"
find_node() {
  local c p v
  for p in \
    "$(command -v node 2>/dev/null || true)" \
    /opt/homebrew/opt/node@24/bin/node \
    /usr/local/opt/node@24/bin/node \
    /opt/homebrew/bin/node \
    /usr/local/bin/node; do
    [[ -n "$p" && -x "$p" ]] || continue
    v="$("$p" -v 2>/dev/null || true)"
    if [[ "$v" =~ ^v([0-9]+)\. ]] && [[ "${BASH_REMATCH[1]}" -ge "$NODE_MAJOR_REQUIRED" ]]; then
      echo "$p|$v"; return 0
    fi
  done
  return 1
}
NODE_INFO="$(find_node || true)"
if [[ -z "$NODE_INFO" ]]; then
  if [[ "$SKIP_BREW" -eq 1 ]]; then
    fail "Node.js ≥ ${NODE_MAJOR_REQUIRED} introuvable (--skip-brew). Installez-le (https://nodejs.org) puis relancez."
  fi
  command -v brew >/dev/null || fail "Homebrew absent. Installez-le : https://brew.sh  puis : brew install node@24
Sans Homebrew : téléchargez Node ${NODE_MAJOR_REQUIRED} LTS sur https://nodejs.org (pkg arm64), puis relancez avec --skip-brew."
  step "Installation de Node.js via Homebrew (node@24)"
  brew install node@24 || brew install node
  # s'assurer que node@24 est dans le PATH de cette session
  if [[ -d /opt/homebrew/opt/node@24/bin ]]; then export PATH="/opt/homebrew/opt/node@24/bin:$PATH"; fi
  if [[ -d /usr/local/opt/node@24/bin ]]; then export PATH="/usr/local/opt/node@24/bin:$PATH"; fi
  NODE_INFO="$(find_node || true)"
fi
[[ -n "$NODE_INFO" ]] || fail "Node.js ≥ ${NODE_MAJOR_REQUIRED} introuvable après installation"
NODE_BIN="${NODE_INFO%%|*}"
NODE_VER="${NODE_INFO##*|}"
info "$NODE_VER : $NODE_BIN"
NODE_MAJOR="${NODE_VER#v}"; NODE_MAJOR="${NODE_MAJOR%%.*}"
[[ "$NODE_MAJOR" -eq "$NODE_MAJOR_REQUIRED" ]] || warn "CT en Node ${NODE_MAJOR_REQUIRED}, Mac en ${NODE_MAJOR} : l'empreinte de rendu le détectera si le WAV diffère"

# --- 2. ffmpeg (VideoToolbox inclus dans Homebrew) -----------------------------------------------
step "ffmpeg"
find_ffmpeg() {
  if [[ -n "$FFMPEG_PATH" ]]; then
    [[ -x "$FFMPEG_PATH" ]] || fail "--ffmpeg $FFMPEG_PATH introuvable"
    echo "$FFMPEG_PATH"; return 0
  fi
  local p full=""
  # v1.21.3 : ffmpeg-full (keg-only, avec freetype → drawtext) préféré automatiquement s'il est installé
  command -v brew >/dev/null 2>&1 && full="$(brew --prefix ffmpeg-full 2>/dev/null || true)/bin/ffmpeg"
  for p in "$full" /opt/homebrew/opt/ffmpeg-full/bin/ffmpeg /usr/local/opt/ffmpeg-full/bin/ffmpeg; do
    [[ -n "$p" && -x "$p" ]] && has_drawtext "$p" && { echo "$p"; return 0; }
  done
  for p in "$(command -v ffmpeg 2>/dev/null || true)" /opt/homebrew/bin/ffmpeg /usr/local/bin/ffmpeg; do
    [[ -n "$p" && -x "$p" ]] && { echo "$p"; return 0; }
  done
  return 1
}
# v1.21.3 : drawtext (titres de chapitre des vidéos) absent du « ffmpeg » Homebrew compilé sans freetype
has_drawtext() { local f; f="$("$1" -hide_banner -filters 2>/dev/null || true)"; grep -qE '^[[:space:]]*[^[:space:]]+[[:space:]]+drawtext[[:space:]]' <<<"$f"; }
FF="$(find_ffmpeg || true)"
if [[ -z "$FF" ]]; then
  [[ "$SKIP_BREW" -eq 1 ]] && fail "ffmpeg introuvable (--skip-brew)"
  command -v brew >/dev/null || fail "Homebrew absent pour installer ffmpeg"
  step "Installation de ffmpeg via Homebrew"
  brew install ffmpeg
  FF="$(find_ffmpeg || true)"
fi
[[ -n "$FF" ]] || fail "ffmpeg introuvable"
info "source : $FF"
if has_drawtext "$FF"; then
  info "drawtext : oui (titres de chapitre des vidéos)"
else
  warn "ce ffmpeg n'a pas le filtre drawtext (compilé sans freetype) : les vidéos seront rendues SANS les titres de chapitre."
  info "Correctif recommandé :"
  info "  brew install ffmpeg-full"
  info "  ./install-macos.sh $([ "$SYSTEM" -eq 1 ] && echo '--system ')--ffmpeg \"\$(brew --prefix ffmpeg-full)/bin/ffmpeg\""
  info "(sans --ffmpeg, ffmpeg-full est de toute façon choisi automatiquement s'il est installé)"
fi

# --- 3. Copie de l'agent -------------------------------------------------------------------------
step "Copie dans $INSTALL_DIR"
# sudo inévitable seulement avec --system (écriture hors du home + LaunchDaemon).
COPY_FILES=(agent.mjs render-core.mjs audio.mjs audio-worker.mjs engine-id.mjs package.json config.example.json README.md install-macos.sh uninstall-macos.sh start-agent.sh)
if [[ "$SYSTEM" -eq 1 ]]; then
  sudo mkdir -p "$INSTALL_DIR" "$INSTALL_DIR/work"
  for f in "${COPY_FILES[@]}"; do sudo cp "$SRC/$f" "$INSTALL_DIR/$f"; done
  sudo rm -rf "$INSTALL_DIR/core"; sudo cp -R "$SRC/core" "$INSTALL_DIR/core"
  sudo chmod 755 "$INSTALL_DIR/start-agent.sh" "$INSTALL_DIR/install-macos.sh" "$INSTALL_DIR/uninstall-macos.sh"
else
  mkdir -p "$INSTALL_DIR" "$INSTALL_DIR/work"
  for f in "${COPY_FILES[@]}"; do cp "$SRC/$f" "$INSTALL_DIR/$f"; done
  rm -rf "$INSTALL_DIR/core"; cp -R "$SRC/core" "$INSTALL_DIR/core"
  chmod 755 "$INSTALL_DIR/start-agent.sh" "$INSTALL_DIR/install-macos.sh" "$INSTALL_DIR/uninstall-macos.sh"
fi
ENG_VER="$(python3 -c "import json;print(json.load(open('$INSTALL_DIR/core/ENGINE.json'))['version'])" 2>/dev/null || true)"
ENG_HASH="$(python3 -c "import json;print(json.load(open('$INSTALL_DIR/core/ENGINE.json'))['hash'])" 2>/dev/null || true)"
info "moteur audio : ${ENG_VER:-?} · ${ENG_HASH:-?}"

# --- 4. config.json ------------------------------------------------------------------------------
step "Configuration"
CFG="$INSTALL_DIR/config.json"
if [[ -f "$CFG" ]]; then
  OLD_TOKEN="$(python3 -c "import json;print(json.load(open('$CFG')).get('token') or '')" 2>/dev/null || true)"
  OLD_SLOTS="$(python3 -c "import json;print(json.load(open('$CFG')).get('slots') or 0)" 2>/dev/null || true)"
  OLD_ASLOTS="$(python3 -c "import json;print(json.load(open('$CFG')).get('audioSlots') or 0)" 2>/dev/null || true)"
else
  OLD_TOKEN=""; OLD_SLOTS=0; OLD_ASLOTS=0
fi
if [[ "$GENERATE_TOKEN" -eq 1 ]]; then
  TOKEN="$(openssl rand -hex 16)"
elif [[ -z "$TOKEN" && -n "$OLD_TOKEN" ]]; then
  TOKEN="$OLD_TOKEN"; info "jeton existant conservé"
fi
# v1.21.3 : jeton d'exemple recopié tel quel (LE_JETON_DE_L_ADMIN, TON_VRAI_JETON, monjeton…) ou jeton vide.
TOKEN_UPPER="$(printf '%s' "$TOKEN" | tr '[:lower:]' '[:upper:]')"
if [[ "$TOKEN_UPPER" == *JETON* || "$TOKEN_UPPER" == *TOKEN* || "$TOKEN" == *"<"* ]]; then
  warn "le jeton « $TOKEN » ressemble à un texte d'exemple : l'Admin refusera le nœud (401) tant que les deux jetons diffèrent."
  info "Relancez avec --generate-token (puis copiez le jeton affiché dans Admin > Nœuds), ou --token \"<jeton saisi dans l'Admin>\"."
elif [[ -z "$TOKEN" ]]; then
  warn "aucun jeton : l'agent accepte toute requête du réseau local. Recommandé : --generate-token."
fi
AUDIO_JSON="True"; [[ "$NO_AUDIO" -eq 1 ]] && AUDIO_JSON="False"
DISCOVERY_JSON="True"; [[ "$NO_DISCOVERY" -eq 1 ]] && DISCOVERY_JSON="False"
ASLOTS="$AUDIO_SLOTS"; [[ "$ASLOTS" -eq 0 && "$OLD_ASLOTS" != "0" ]] && ASLOTS="$OLD_ASLOTS"
SLOTS="$OLD_SLOTS"
PYRUN=(python3); [[ "$SYSTEM" -eq 1 ]] && PYRUN=(sudo python3)
"${PYRUN[@]}" - "$CFG" <<PY
import json, sys
cfg = {
  "port": int("$PORT"),
  "name": """$NAME""",
  "token": """$TOKEN""",
  "ffmpeg": """$FF""",
  "workDir": """$INSTALL_DIR/work""",
  "logFile": """$INSTALL_DIR/agent.log""",
  "encoder": """$ENCODER""",
  "slots": int("$SLOTS" or 0),
  "discovery": $DISCOVERY_JSON,
  "discoveryPort": int("$DISCOVERY_PORT"),
  "maxUploadGB": 8,
  "audio": $AUDIO_JSON,
  "audioSlots": int("$ASLOTS" or 0),
  "samplesDir": """$INSTALL_DIR/work/samples""",
}
open(sys.argv[1], "w").write(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n")
PY
if [[ "$SYSTEM" -eq 1 ]]; then sudo chmod 644 "$CFG"; fi
info "$CFG"

# --- 5. Détection des encodeurs ------------------------------------------------------------------
step "Encodeurs vidéo"
DET_JSON="$("$NODE_BIN" "$INSTALL_DIR/agent.mjs" --detect)" || true
BEST="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('best') or '')" "$DET_JSON" 2>/dev/null || true)"
WORKING="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(', '.join(d.get('working') or []))" "$DET_JSON" 2>/dev/null || true)"
info "ffmpeg : $(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('ffmpeg') or '')" "$DET_JSON" 2>/dev/null || true)"
info "utilisables : ${WORKING:-aucun}"
if [[ "$BEST" == *videotoolbox* ]]; then
  printf '    encodeur choisi : %s (Apple VideoToolbox)\n' "$BEST"
elif [[ -n "$BEST" ]]; then
  warn "VideoToolbox indisponible, l'agent utilisera $BEST."
  info "Sur Apple Silicon, un ffmpeg Homebrew récent expose h264_videotoolbox. Essayez : brew reinstall ffmpeg"
else
  fail "aucun encodeur utilisable (ffmpeg ne fonctionne pas ?)"
fi

# --- 6. launchd ----------------------------------------------------------------------------------
# Choix : LaunchAgent (défaut) = pas de sudo, démarre à l'ouverture de session de l'utilisateur,
# relance KeepAlive. Adapté à un Mac mini toujours connecté avec ouverture de session automatique.
# LaunchDaemon (--system) = démarre au boot sans session ouverte ; sudo obligatoire pour
# écrire dans /Library/LaunchDaemons et dans /usr/local. VideoToolbox fonctionne hors session
# sur Apple Silicon moderne.
step "launchd ($([ "$SYSTEM" -eq 1 ] && echo LaunchDaemon || echo LaunchAgent))"
PLIST_BODY=$(cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${INSTALL_DIR}/agent.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>${INSTALL_DIR}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${INSTALL_DIR}/agent.launchd.out.log</string>
  <key>StandardErrorPath</key><string>${INSTALL_DIR}/agent.launchd.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>ProcessType</key><string>Background</string>
  <key>ThrottleInterval</key><integer>10</integer>
</dict>
</plist>
PLIST
)

if [[ "$SYSTEM" -eq 1 ]]; then
  PLIST_PATH="/Library/LaunchDaemons/${LABEL}.plist"
  printf '%s\n' "$PLIST_BODY" | sudo tee "$PLIST_PATH" >/dev/null
  sudo chown root:wheel "$PLIST_PATH"
  sudo chmod 644 "$PLIST_PATH"
  sudo launchctl bootout system/"$LABEL" 2>/dev/null || true
  sudo launchctl bootstrap system "$PLIST_PATH"
  sudo launchctl enable system/"$LABEL" 2>/dev/null || true
  sudo launchctl kickstart -k system/"$LABEL"
  info "LaunchDaemon : $PLIST_PATH (démarrage au boot, sans session)"
else
  PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
  mkdir -p "$(dirname "$PLIST_PATH")"
  printf '%s\n' "$PLIST_BODY" > "$PLIST_PATH"
  launchctl bootout gui/"$(id -u)"/"$LABEL" 2>/dev/null || true
  launchctl bootstrap gui/"$(id -u)" "$PLIST_PATH"
  launchctl enable gui/"$(id -u)"/"$LABEL" 2>/dev/null || true
  launchctl kickstart -k gui/"$(id -u)"/"$LABEL"
  info "LaunchAgent : $PLIST_PATH (démarrage à l'ouverture de session)"
  info "Astuce Mac mini « toujours allumé » : Réglages > Verrouillage d'écran > « Démarrer automatiquement après une panne de courant », et ouverture de session automatique."
fi

# --- 7. Pare-feu / réseau ------------------------------------------------------------------------
step "Pare-feu et réseau"
info "Pare-feu applications macOS (par app, pas de CIDR) :"
info "  Au premier écoute sur le port $PORT, macOS affiche « Autoriser les connexions entrantes » pour node."
info "  Cliquez Autoriser. Pour forcer (sudo) :"
info "    sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add \"$NODE_BIN\""
info "    sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp \"$NODE_BIN\""
info "Découverte UDP (port $DISCOVERY_PORT) ne traverse en général PAS les sous-réseaux routés."
info "Si le CT est en 10.0.0.x, le PC Windows en 10.0.1.x et le Mac ailleurs :"
info "  → ajoutez le Mac dans Admin par son URL http://<IP-du-Mac>:$PORT (bouton Ajouter)."
if [[ -n "$CT_ADDRESS" || ${#ALLOW_FROM[@]} -gt 0 ]]; then
  info "Restriction CIDR (--allow-from / --ct-address) : le pare-feu apps ne filtre pas par source."
  info "Option avancée (sudo, pf) — exemple pour n'accepter que le sous-réseau du CT :"
  SRC_NET="${ALLOW_FROM[*]:-}"
  [[ -n "$CT_ADDRESS" && -z "$SRC_NET" ]] && SRC_NET="$CT_ADDRESS"
  info "  # /etc/pf.anchors/soundtube-node  (à charger depuis /etc/pf.conf)"
  info "  pass in proto tcp from { ${SRC_NET// /,} } to any port $PORT"
  info "  pass in proto udp from { ${SRC_NET// /,} } to any port $DISCOVERY_PORT"
  warn "pf mal configuré coupe tout le réseau : gardez le jeton (token) comme contrôle d'accès principal."
fi

# --- 8. Démarrage et vérification ----------------------------------------------------------------
step "Vérification"
H=""
for i in $(seq 1 30); do
  sleep 1
  if H="$(curl -fsS ${TOKEN:+-H "Authorization: Bearer $TOKEN"} "http://127.0.0.1:$PORT/health" 2>/dev/null)"; then
    break
  fi
done
[[ -n "$H" ]] || fail "l'agent ne répond pas sur le port $PORT — voir $INSTALL_DIR/agent.log et agent.launchd.err.log"
VER="$(python3 -c "import json,sys; print(json.load(sys.stdin).get('version',''))" <<<"$H")"
BESTL="$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('bestLabel') or d.get('best') or '')" <<<"$H")"
PLAT="$(python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"{d.get('platform')} {d.get('arch')}\")" <<<"$H")"
printf '    agent en ligne : v%s — %s — %s\n' "$VER" "$BESTL" "$PLAT"
AUDIO_OK="$(python3 -c "import json,sys; d=json.load(sys.stdin); a=d.get('audio') or {}; print('yes' if a.get('ok') else a.get('reason') or 'non')" <<<"$H")"
if [[ "$AUDIO_OK" == "yes" ]]; then
  AH="$(python3 -c "import json,sys; a=json.load(sys.stdin)['audio']['engine']; print(f\"{a.get('version')} · {a.get('hash')}\")" <<<"$H")"
  printf '    musique : oui — moteur %s (doit être identique à Admin > Répartition)\n' "$AH"
elif [[ "$NO_AUDIO" -eq 1 ]]; then
  info "musique : désactivée (--no-audio)"
else
  warn "musique indisponible : $AUDIO_OK"
fi

IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '<IP-du-Mac>')"
echo
echo "Ajoutez dans soundtube > Admin > Nœuds :"
echo "  http://${IP}:${PORT}"
[[ -n "$TOKEN" ]] && echo "  jeton : $TOKEN"
echo "Jeton enregistré dans : $CFG (lisible sans sudo) — pour le relire :"
echo "  python3 -c \"import json;print(json.load(open('$CFG'))['token'])\""
echo "Journal : $INSTALL_DIR/agent.log"
echo "Désinstallation : $INSTALL_DIR/uninstall-macos.sh$([ "$SYSTEM" -eq 1 ] && echo ' --system')"
