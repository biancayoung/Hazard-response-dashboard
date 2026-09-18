#!/bin/bash
# One-time setup: mosquitto broker + tailscale in WSL, bridge autostart.
set -e

echo "== installing packages =="
sudo apt-get update -qq
sudo apt-get install -y -qq mosquitto mosquitto-clients curl gnupg

echo "== installing tailscale =="
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/jammy.noarmor.gpg | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
  curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/jammy.tailscale-keyring.list | sudo tee /etc/apt/sources.list.d/tailscale.list
  sudo apt-get update -qq
  sudo apt-get install -y -qq tailscale
fi

echo "== configuring mosquitto =="
# Local development only. Configure authenticated TLS separately for remote clients.
sudo tee /etc/mosquitto/conf.d/farm.conf >/dev/null <<'EOF'
listener 1883 127.0.0.1
allow_anonymous true
EOF

echo "== enabling + starting mosquitto =="
sudo systemctl enable mosquitto
sudo systemctl restart mosquitto

echo "== bringing up tailscale =="
sudo systemctl enable --now tailscaled
# 'tailscale up' prints a login URL the first time; re-running is harmless.
sudo tailscale up --ssh --accept-routes || true

echo "== status =="
sudo systemctl is-active mosquitto && echo "mosquitto active"
tailscale ip -4 || echo "tailscale not logged in yet"
echo "SETUP_DONE"
