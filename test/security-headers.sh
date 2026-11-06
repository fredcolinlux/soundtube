#!/bin/bash
# Vérifie les en-têtes de sécurité sur une instance locale (démarre un serveur éphémère si besoin).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${SOUNDTUBE_TEST_PORT:-18080}"
DATA="$(mktemp -d)"
export SOUNDTUBE_DATA_DIR="$DATA" SOUNDTUBE_PORT="$PORT" SOUNDTUBE_HOST=127.0.0.1 SOUNDTUBE_MP3=off
cd "$ROOT"
node src/server.js >"$DATA/server.log" 2>&1 &
PID=$!
cleanup() { kill $PID 2>/dev/null || true; wait $PID 2>/dev/null || true; rm -rf "$DATA"; }
trap cleanup EXIT
for i in $(seq 1 50); do curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null && break; sleep 0.1; done
HDR=$(curl -sI "http://127.0.0.1:$PORT/login")
fail=0
check() { if echo "$HDR" | grep -qiE "$1"; then echo "OK   $2"; else echo "ÉCHEC $2"; fail=$((fail+1)); fi; }
check 'content-security-policy:.*script-src .self.' 'CSP'
check 'x-frame-options: DENY' 'X-Frame-Options'
check 'x-content-type-options: nosniff' 'nosniff'
check 'referrer-policy: strict-origin-when-cross-origin' 'Referrer-Policy'
check 'permissions-policy:' 'Permissions-Policy'
check 'cross-origin-opener-policy: same-origin' 'COOP'
check 'cross-origin-resource-policy: same-origin' 'CORP'
check 'cross-origin-embedder-policy: require-corp' 'COEP'
# Pas de X-Powered-By
if echo "$HDR" | grep -qi 'x-powered-by'; then echo 'ÉCHEC X-Powered-By présent'; fail=$((fail+1)); else echo 'OK   pas de X-Powered-By'; fi
# security.txt
curl -sf "http://127.0.0.1:$PORT/.well-known/security.txt" | grep -q Contact && echo 'OK   security.txt' || { echo 'ÉCHEC security.txt'; fail=$((fail+1)); }
# Admin: LAN alone is not enough — requires admin session → 302 to login/setup
CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/admin")
[[ "$CODE" == "302" || "$CODE" == "303" ]] && echo "OK   /admin requires login ($CODE)" || { echo "ÉCHEC /admin expected 302 got $CODE"; fail=$((fail+1)); }
# Studio (/) requires login for everyone (no LAN bypass). Library lives on the same page (#library).
C=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/")
[[ "$C" == "302" || "$C" == "303" ]] && echo "OK   / studio gated ($C)" || { echo "ÉCHEC / studio expected 302 got $C"; fail=$((fail+1)); }
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/api/generate" -H 'Content-Type: application/json' -d '{}')
[[ "$C" == "401" || "$C" == "403" || "$C" == "302" || "$C" == "303" ]] \
  && echo "OK   /api/generate gated ($C)" || { echo "ÉCHEC /api/generate expected auth gate got $C"; fail=$((fail+1)); }
# Public pages stay viewable without login
for path in /accueil /styles /legal /privacy /terms /login /demarrer; do
  C=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$path")
  [[ "$C" == "200" ]] && echo "OK   public $path ($C)" || { echo "ÉCHEC public $path $C"; fail=$((fail+1)); }
done
# Auth status
curl -sf "http://127.0.0.1:$PORT/api/auth/status" | grep -q setupRequired && echo 'OK   /api/auth/status' || { echo 'ÉCHEC auth status'; fail=$((fail+1)); }
# Login page
curl -sf "http://127.0.0.1:$PORT/login" | grep -q 'loginForm' && echo 'OK   login page' || { echo 'ÉCHEC login page'; fail=$((fail+1)); }
exit $fail
