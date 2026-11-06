#!/usr/bin/env bash
# soundtube — safe flat-patch updater (run as root, no sudo).
# Usage: ./update.sh <patch1.tar.gz> [patch2.tar.gz ...]
#
# Verifies every archive (exists, gzip, tar, flat layout) BEFORE stopping the
# service. Backs up /opt/soundtube/app, stops, extracts in order, chowns,
# syntax-checks, then ALWAYS restarts (trap). If extraction failed, restores
# the backup first. Waits for /healthz and prints the version.
set -euo pipefail

APP="${SOUNDTUBE_APP:-/opt/soundtube/app}"
SERVICE="${SOUNDTUBE_SERVICE:-soundtube}"
BACKUP_DIR="${SOUNDTUBE_BACKUP_DIR:-/var/backups/soundtube}"
HEALTH_URL="${SOUNDTUBE_HEALTH_URL:-http://127.0.0.1:8080/healthz}"
APP_USER="${SOUNDTUBE_USER:-soundtube}"
APP_GROUP="${SOUNDTUBE_GROUP:-soundtube}"
SYSTEMCTL="${SOUNDTUBE_SYSTEMCTL:-systemctl}"
JOURNALCTL="${SOUNDTUBE_JOURNALCTL:-journalctl}"
NODE_BIN="${SOUNDTUBE_NODE:-node}"
HEALTH_TIMEOUT="${SOUNDTUBE_HEALTH_TIMEOUT:-20}"

die() { echo "update.sh: ERROR: $*" >&2; exit 1; }
log() { echo "update.sh: $*"; }

[[ $# -ge 1 ]] || die "usage: $0 <patch1.tar.gz> [patch2.tar.gz ...]"
if [[ "$(id -u)" -ne 0 && "${SOUNDTUBE_ALLOW_NONROOT:-}" != "1" ]]; then
  die "must run as root (no sudo wrapper needed — just root)"
fi
[[ -d "$APP" ]] || die "app directory missing: $APP"

# Resolve patches to absolute paths (cwd may change later)
PATCHES=()
for p in "$@"; do
  [[ -n "$p" ]] || die "empty patch argument"
  [[ -e "$p" ]] || die "patch not found: $p"
  [[ -f "$p" ]] || die "patch is not a regular file: $p"
  # absolute
  case "$p" in
    /*) PATCHES+=("$p") ;;
    *) PATCHES+=("$(pwd)/$p") ;;
  esac
done

# --- preflight: every archive must be valid gzip tar with FLAT layout --------
verify_flat_tar() {
  local f="$1" list top bad=0
  # gzip integrity
  gzip -t "$f" 2>/dev/null || die "not a valid gzip file: $f"
  # tar listing
  list="$(tar tzf "$f" 2>/dev/null)" || die "not a valid tar.gz: $f"
  [[ -n "$list" ]] || die "archive is empty: $f"
  # reject soundtube/ prefix (nested layout that broke live updates)
  if printf '%s\n' "$list" | grep -qE '^(./)?soundtube/'; then
    die "archive has nested 'soundtube/' prefix (not a flat patch): $f
  Apply a flat archive (files at archive root: package.json, src/, public/, …)."
  fi
  # must contain a recognisable app root marker
  if ! printf '%s\n' "$list" | grep -qE '^(./)?(package\.json|src/server\.js|VERSION)$'; then
    die "archive does not look like a soundtube app tree (missing package.json / src/server.js / VERSION): $f"
  fi
  # no absolute paths / path traversal
  if printf '%s\n' "$list" | grep -qE '(^/)|(^\.\./)|(/\.\./)'; then
    die "archive contains absolute or .. paths: $f"
  fi
  log "OK  $(basename "$f") ($(printf '%s\n' "$list" | wc -l) entries, flat)"
}

log "preflight: verifying ${#PATCHES[@]} archive(s) before stopping $SERVICE"
for p in "${PATCHES[@]}"; do
  verify_flat_tar "$p"
done
log "preflight OK"

# --- backup ------------------------------------------------------------------
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$BACKUP_DIR/app-${STAMP}.tar.gz"
log "backup → $BACKUP"
tar czf "$BACKUP" -C "$APP" . || die "backup failed"

# --- state for trap ----------------------------------------------------------
EXTRACT_OK=0
STOPPED=0
RESTORED=0

start_service() {
  log "starting $SERVICE"
  "$SYSTEMCTL" start "$SERVICE" || log "WARNING: $SYSTEMCTL start $SERVICE failed"
}

restore_backup() {
  [[ "$RESTORED" -eq 1 ]] && return 0
  RESTORED=1
  log "restoring backup $BACKUP → $APP"
  find "$APP" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  tar xzf "$BACKUP" -C "$APP" --no-same-owner
  if id -u "$APP_USER" >/dev/null 2>&1; then
    chown -R "$APP_USER:$APP_GROUP" "$APP" || true
  fi
}

cleanup() {
  local ec=$?
  # Always try to have the service running again if we stopped it.
  if [[ "$STOPPED" -eq 1 ]]; then
    if [[ "$EXTRACT_OK" -ne 1 ]]; then
      log "extraction did not complete successfully — restoring backup"
      restore_backup || log "WARNING: restore failed"
    fi
    start_service
  fi
  if [[ $ec -ne 0 ]]; then
    echo "update.sh: FAILED (exit $ec)" >&2
    if command -v "$JOURNALCTL" >/dev/null 2>&1; then
      echo "---- $JOURNALCTL -u $SERVICE -n 40 ----" >&2
      "$JOURNALCTL" -u "$SERVICE" -n 40 --no-pager >&2 || true
    fi
  fi
  exit "$ec"
}
trap cleanup EXIT

# --- stop --------------------------------------------------------------------
log "stopping $SERVICE"
"$SYSTEMCTL" stop "$SERVICE"
STOPPED=1

# --- extract in order --------------------------------------------------------
log "extracting into $APP"
for p in "${PATCHES[@]}"; do
  log "  tar xzf $(basename "$p")"
  tar xzf "$p" -C "$APP" --no-same-owner
done
EXTRACT_OK=1

# Nested leftover from old broken updates
if [[ -d "$APP/soundtube" ]]; then
  log "WARNING: leftover $APP/soundtube/ (ignored by server) — remove manually if obsolete"
fi

# --- ownership ---------------------------------------------------------------
if id -u "$APP_USER" >/dev/null 2>&1; then
  if chown -R "$APP_USER:$APP_GROUP" "$APP" 2>/dev/null; then
    log "chown $APP_USER:$APP_GROUP OK"
  else
    log "WARNING: chown $APP_USER:$APP_GROUP failed (continuing)"
  fi
else
  log "WARNING: user $APP_USER missing — skip chown"
fi

# --- syntax check ------------------------------------------------------------
log "node --check"
[[ -f "$APP/src/server.js" ]] || die "src/server.js missing after extract"
"$NODE_BIN" --check "$APP/src/server.js"
# optional companions
for f in "$APP"/src/social.js "$APP"/src/config.js "$APP"/src/publish.js; do
  [[ -f "$f" ]] && "$NODE_BIN" --check "$f"
done

# --- start happens in trap; wait for health ----------------------------------
# Force start now so we can health-check before EXIT; trap will start again if needed (idempotent).
start_service
STOPPED=1  # still let trap run start on failure paths; start is idempotent

log "waiting for $HEALTH_URL (≤ ${HEALTH_TIMEOUT}s)"
ok=0
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
  if body="$(curl -fsS --max-time 2 "$HEALTH_URL" 2>/dev/null)"; then
    ok=1
    ver="$(printf '%s' "$body" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
    log "health OK (${i}s) version=${ver:-unknown}"
    printf '%s\n' "$body"
    break
  fi
  sleep 1
done
[[ "$ok" -eq 1 ]] || die "service did not become healthy at $HEALTH_URL within ${HEALTH_TIMEOUT}s"

log "done — backup kept at $BACKUP"
# success: trap still runs start_service (harmless) and exits 0
