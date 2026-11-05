#!/usr/bin/env bash
# Installation / mise à jour de soundtube sur Debian 13 (trixie), ex. conteneur LXC Proxmox.
# Usage : sudo ./deploy/install.sh [--port 8080] [--nodesource|--debian-node] [--no-start] [--skip-apt]
set -euo pipefail

APP_USER=soundtube
# chemins surchargeables (tests) : SOUNDTUBE_PREFIX, SOUNDTUBE_INSTALL_DATA, SOUNDTUBE_CONF_DIR, SOUNDTUBE_UNIT
PREFIX=${SOUNDTUBE_PREFIX:-/opt/soundtube}
APP_DIR=$PREFIX/app
DATA_DIR=${SOUNDTUBE_INSTALL_DATA:-/var/lib/soundtube}
CONF_DIR=${SOUNDTUBE_CONF_DIR:-/etc/soundtube}
ENV_FILE=$CONF_DIR/soundtube.env
UNIT=${SOUNDTUBE_UNIT:-/etc/systemd/system/soundtube.service}
NODE_MAJOR=${NODE_MAJOR:-22}
NODE_MODE=auto      # auto : garde un Node >= 20 existant, sinon NodeSource 22
PORT=""
START=1
SKIP_APT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --nodesource) NODE_MODE=nodesource; shift ;;
    --debian-node) NODE_MODE=debian; shift ;;
    --no-start) START=0; shift ;;
    --skip-apt) SKIP_APT=1; shift ;;
    -h|--help) sed -n '2,4p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $1" >&2; exit 1 ;;
  esac
done

log() { printf '\033[1;31m▸\033[0m %s\n' "$*"; }
[[ $EUID -eq 0 ]] || { echo "Lancer en root (sudo)." >&2; exit 1; }
SRC_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
[[ -f $SRC_DIR/package.json && -f $SRC_DIR/src/server.js ]] || { echo "Sources introuvables dans $SRC_DIR" >&2; exit 1; }

. /etc/os-release || true
if [[ "${VERSION_CODENAME:-}" != "trixie" ]]; then log "Attention : testé sur Debian 13 (trixie), détecté : ${PRETTY_NAME:-inconnu}"; fi

export DEBIAN_FRONTEND=noninteractive
if (( SKIP_APT )); then
  log "--skip-apt : paquets système supposés présents (ffmpeg, nodejs >= 20)"
  for b in ffmpeg node npm; do command -v $b >/dev/null || { echo "Manquant : $b" >&2; exit 1; }; done
  NODE_MODE=skip
else
  log "Paquets système (ffmpeg, curl…)"
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends ca-certificates curl gnupg ffmpeg >/dev/null
fi

node_major() { command -v node >/dev/null 2>&1 && node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
install_nodesource() {
  log "Installation de Node.js ${NODE_MAJOR}.x (dépôt NodeSource)"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs >/dev/null
}
case "$NODE_MODE" in
  skip) ;;
  nodesource) install_nodesource ;;
  debian) log "Node.js des dépôts Debian"; apt-get install -y -qq nodejs npm >/dev/null ;;
  auto) if (( $(node_major) >= 20 )) && command -v npm >/dev/null; then log "Node.js $(node -v) déjà présent, conservé"; else install_nodesource; fi ;;
esac
NODE_BIN=$(command -v node)
(( $(node_major) >= 20 )) || { echo "Node.js >= 20 requis (trouvé : $(node -v 2>/dev/null || echo aucun))" >&2; exit 1; }
log "Node.js $($NODE_BIN -v), npm $(npm -v)"

log "Utilisateur système $APP_USER"
id -u $APP_USER >/dev/null 2>&1 || useradd --system --home-dir $PREFIX --shell /usr/sbin/nologin $APP_USER

log "Copie de l'application dans $APP_DIR"
install -d -m 0755 $PREFIX $APP_DIR
if [[ "$SRC_DIR" != "$APP_DIR" ]]; then
  find $APP_DIR -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
  tar -C "$SRC_DIR" --exclude=./node_modules --exclude=./data --exclude=./samples --exclude="./*.png" --exclude=./.git -cf - . | tar -C $APP_DIR -xf -
fi
install -d -m 0750 -o $APP_USER -g $APP_USER $DATA_DIR
install -d -m 0755 $CONF_DIR
if [[ ! -f $ENV_FILE ]]; then install -m 0640 -g $APP_USER "$SRC_DIR/deploy/soundtube.env" $ENV_FILE; log "Configuration créée : $ENV_FILE"; else
  log "Configuration existante conservée : $ENV_FILE (sauvegarde + mise à niveau des clés)"
  cp -p $ENV_FILE "$ENV_FILE.bak-$(date +%Y%m%d-%H%M%S)"
  bash "$SRC_DIR/deploy/migrate-env.sh" $ENV_FILE "$SRC_DIR/deploy/soundtube.env"
fi
[[ -n $PORT ]] && sed -i "s/^SOUNDTUBE_PORT=.*/SOUNDTUBE_PORT=$PORT/" $ENV_FILE

log "Dépendances npm (production)"
cd $APP_DIR
export SCARF_ANALYTICS=false npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false
if [[ -f package-lock.json ]]; then npm ci --omit=dev --loglevel=error || npm install --omit=dev --loglevel=error; else npm install --omit=dev --loglevel=error; fi
if node -e "require('better-sqlite3')" 2>/dev/null; then log "Stockage : SQLite (better-sqlite3)"; else log "better-sqlite3 indisponible : repli automatique sur stockage JSON"; fi
chown -R root:root $APP_DIR

if [[ -f $APP_DIR/assets/samples/manifest.json ]]; then
  n=$(find "$APP_DIR/assets/samples" -type f -name '*.flac' 2>/dev/null | wc -l | tr -d ' ')
  log "Banque d'échantillons : $n fichiers FLAC (voir SAMPLES-LICENSES.md)"
else
  log "Attention : assets/samples/manifest.json absent — instruments acoustiques en synthèse seule"
fi


log "Service systemd"
sed "s#@NODE@#$NODE_BIN#" "$SRC_DIR/deploy/soundtube.service" > $UNIT
if [[ -d /run/systemd/system && -z ${SOUNDTUBE_UNIT:-} ]]; then
  systemctl daemon-reload
  systemctl enable soundtube.service >/dev/null 2>&1
  if (( START )); then systemctl restart soundtube.service; sleep 2; systemctl --no-pager --lines=5 status soundtube.service || true; fi
else
  log "systemd absent (environnement de test ?) : service non démarré. Lancement manuel :"
  echo "   sudo -u $APP_USER bash -c 'set -a; . $ENV_FILE; exec $NODE_BIN $APP_DIR/src/server.js'"
fi

P=$(grep -E '^SOUNDTUBE_PORT=' $ENV_FILE | cut -d= -f2)
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
log "Terminé ! Interface : http://${IP:-<ip-du-ct>}:${P:-8080}/   ·   API : http://${IP:-<ip-du-ct>}:${P:-8080}/docs"
