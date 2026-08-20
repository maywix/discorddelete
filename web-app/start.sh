#!/usr/bin/env bash
# Lancement simple pour le VPS : démarre le conteneur déjà construit, sans rien télécharger.
set -euo pipefail
cd "$(dirname "$0")"

docker compose up -d

echo "Cleaner démarré."
echo "Logs : docker compose logs -f"
echo "Arrêt : docker compose down"
