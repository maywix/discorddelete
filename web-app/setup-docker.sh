#!/usr/bin/env bash
# Installe les dépendances et construit/lance la webapp dans Docker, en une seule commande.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker &> /dev/null; then
  echo "Docker n'est pas installé. Installe-le d'abord : https://docs.docker.com/get-docker/"
  exit 1
fi

if ! docker compose version &> /dev/null; then
  echo "Le plugin 'docker compose' est introuvable. Mets à jour Docker."
  exit 1
fi

echo "Construction de l'image (téléchargement des dépendances) et démarrage du conteneur..."
docker compose up -d --build

echo
echo "C'est en ligne : http://localhost:3000"
echo "Logs : docker compose logs -f"
