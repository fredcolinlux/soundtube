#!/usr/bin/env bash
# Test de deploy/migrate-env.sh sur un faux soundtube.env v1.0 (plafond 420 s) : bash test/migrate-env.sh
set -euo pipefail
D=$(cd "$(dirname "$0")/.." && pwd); T=$(mktemp -d); trap 'rm -rf $T' EXIT
printf '# v1.0\nSOUNDTUBE_HOST=0.0.0.0\nSOUNDTUBE_PORT=9090\nSOUNDTUBE_MAX_JOBS=3\nSOUNDTUBE_MAX_DURATION=420\nSOUNDTUBE_MP3=auto\n' > $T/a.env
bash $D/deploy/migrate-env.sh $T/a.env $D/deploy/soundtube.env >/dev/null
grep -qx 'SOUNDTUBE_MAX_DURATION=14400' $T/a.env || { echo "ÉCHEC : 420 non migré"; exit 1; }
grep -qx 'SOUNDTUBE_PORT=9090' $T/a.env && grep -qx 'SOUNDTUBE_MAX_JOBS=3' $T/a.env || { echo "ÉCHEC : valeur utilisateur écrasée"; exit 1; }
grep -qx 'SOUNDTUBE_LUFS=-14' $T/a.env || { echo "ÉCHEC : clé manquante non ajoutée"; exit 1; }
cp $T/a.env $T/b.env; bash $D/deploy/migrate-env.sh $T/a.env $D/deploy/soundtube.env >/dev/null; cmp -s $T/a.env $T/b.env || { echo "ÉCHEC : non idempotent"; exit 1; }
grep -v MAX_DURATION $T/b.env > $T/c.env; bash $D/deploy/migrate-env.sh $T/c.env $D/deploy/soundtube.env >/dev/null; grep -qx 'SOUNDTUBE_MAX_DURATION=14400' $T/c.env || { echo "ÉCHEC : clé absente"; exit 1; }
sed 's/=14400/=3600/' $T/b.env > $T/d.env; bash $D/deploy/migrate-env.sh $T/d.env $D/deploy/soundtube.env >/dev/null; grep -qx 'SOUNDTUBE_MAX_DURATION=3600' $T/d.env || { echo "ÉCHEC : valeur perso écrasée"; exit 1; }
echo "OK    migration soundtube.env (420 → 14400, absente → 14400, perso conservée, clés ajoutées, idempotent)"
