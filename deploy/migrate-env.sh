#!/usr/bin/env bash
# Mise à niveau d'un soundtube.env existant (appelé par install.sh, utilisable seul) :
#  - SOUNDTUBE_MAX_DURATION absent ou à 420 (ancien défaut v1.0 = 7 min) -> 14400 (4 h)
#  - ajoute les clés du modèle absentes du fichier existant, sans toucher aux valeurs de l'utilisateur
# Usage : migrate-env.sh <fichier-existant> <modèle>
set -euo pipefail
ENV_FILE=$1; TEMPLATE=$2
mlog() { printf '\033[1;31m▸\033[0m %s\n' "$*"; }
[[ -f $ENV_FILE && -f $TEMPLATE ]] || { echo "migrate-env : fichier introuvable" >&2; exit 1; }

# clé active (CLE=) ou présente en commentaire (#CLE=) dans le fichier existant
has_key() { grep -Eq "^[[:space:]]*#?[[:space:]]*$1=" "$ENV_FILE"; }
has_active_key() { grep -Eq "^[[:space:]]*$1=" "$ENV_FILE"; }

# 1) Durée max : ancien défaut 420 ou absente -> 14400
cur=$(grep -E '^[[:space:]]*SOUNDTUBE_MAX_DURATION=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d ' "'"'" || true)
if ! has_active_key SOUNDTUBE_MAX_DURATION; then
  printf '\n# Durée max d un morceau (secondes, 14400 = 4 h max) - ajouté par la mise à jour\nSOUNDTUBE_MAX_DURATION=14400\n' >> "$ENV_FILE"
  mlog "Config : SOUNDTUBE_MAX_DURATION absent -> 14400 (4 h)"
elif [[ $cur == 420 ]]; then
  sed -i -E 's/^([[:space:]]*)SOUNDTUBE_MAX_DURATION=.*/\1SOUNDTUBE_MAX_DURATION=14400/' "$ENV_FILE"
  mlog "Config : SOUNDTUBE_MAX_DURATION=420 (ancien défaut, 7 min) -> 14400 (4 h)"
else
  mlog "Config : SOUNDTUBE_MAX_DURATION=$cur conservé"
fi

# 2) Nouvelles clés du modèle (actives ou commentées), avec leur commentaire d'en-tête
added=()
block=""
while IFS= read -r line || [[ -n $line ]]; do
  if [[ $line =~ ^[[:space:]]*#?[[:space:]]*(SOUNDTUBE_[A-Z0-9_]+)= ]]; then
    k=${BASH_REMATCH[1]}
    if ! has_key "$k"; then
      [[ ${#added[@]} -eq 0 ]] && printf '\n# --- Clés ajoutées par la mise à jour du %s ---\n' "$(date '+%d/%m/%Y %H:%M')" >> "$ENV_FILE"
      [[ -n $block ]] && printf '%s' "$block" >> "$ENV_FILE"
      printf '%s\n' "$line" >> "$ENV_FILE"
      added+=("$k")
    fi
    block=""
  elif [[ $line =~ ^[[:space:]]*# ]]; then block+="$line"$'\n'
  else block=""; fi
done < "$TEMPLATE"
if (( ${#added[@]} )); then mlog "Config : clés ajoutées (valeurs par défaut) : ${added[*]}"; else mlog "Config : aucune nouvelle clé à ajouter"; fi
