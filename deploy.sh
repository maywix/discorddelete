#!/usr/bin/env bash
# Récupère la dernière version du code depuis GitHub et relance la webapp dans
# Docker. Utilisé automatiquement au démarrage du VPS (voir install-service.sh),
# mais peut aussi être lancé à la main pour mettre à jour.
set -euo pipefail
cd "$(dirname "$0")"

echo "Récupération de la dernière version..."
git pull --ff-only

echo "Reconstruction et redémarrage du conteneur..."
cd web-app
docker compose up -d --build

echo "OK."
