#!/usr/bin/env bash
# Installe un service systemd qui, à chaque démarrage du VPS, récupère la
# dernière version du code (git pull) et relance la webapp via Docker.
# À lancer UNE SEULE FOIS sur le VPS, avec sudo.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Lance ce script avec sudo : sudo ./install-service.sh"
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_PATH="/etc/systemd/system/discord-cleaner.service"

cat > "$UNIT_PATH" <<EOF
[Unit]
Description=Discord Cleaner - git pull puis (re)demarrage du conteneur
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${REPO_DIR}
ExecStart=${REPO_DIR}/deploy.sh

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable discord-cleaner.service

echo "Service installé : git pull + redémarrage automatique à chaque boot du VPS."
echo "Test immédiat     : sudo systemctl start discord-cleaner.service"
echo "Logs               : journalctl -u discord-cleaner.service -f"
