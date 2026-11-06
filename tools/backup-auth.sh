#!/bin/sh
# Sauvegarde users/security (données soundtube). Usage : backup-auth.sh [fichier.tgz]
set -e
DATA="${SOUNDTUBE_DATA_DIR:-/opt/soundtube/app/data}"
OUT="${1:-$DATA/backup-auth-$(date +%Y%m%d-%H%M%S).tgz}"
cd "$(dirname "$0")/.."
node --input-type=module -e "
import { backupAuth } from './src/auth/backup.js';
const out = backupAuth(process.env.SOUNDTUBE_DATA_DIR || '$DATA', '$OUT');
console.log(out);
"
