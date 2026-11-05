#!/bin/sh
# Construit ../soundtube.tar.gz (sans node_modules, data, .git, logs)
set -e
cd "$(dirname "$0")/../.."
tar czf soundtube.tar.gz --exclude='soundtube/node_modules' --exclude='soundtube/data' --exclude='soundtube/.git' --exclude='soundtube/logs' --exclude='*.log' soundtube
ls -lh soundtube.tar.gz
