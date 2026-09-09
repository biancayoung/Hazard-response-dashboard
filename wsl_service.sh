#!/bin/bash
# Install the bridge as a systemd user-agnostic service and start it.
set -e

sudo tee /etc/systemd/system/farm-bridge.service >/dev/null <<'EOF'
[Unit]
Description=Farm screen MQTT->WebSocket bridge
After=network.target mosquitto.service

[Service]
Type=simple
User=bianca
WorkingDirectory=/home/bianca/farm-screen
ExecStart=/usr/bin/python3 /home/bianca/farm-screen/bridge.py --http-port 8000 --ws-port 8765 --mqtt-host 127.0.0.1 --mqtt-port 1883 --mqtt-user ptfarmdata --mqtt-pass 'pt123farmdata!'
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable farm-bridge
sudo systemctl restart farm-bridge
sleep 2
sudo systemctl is-active farm-bridge && echo "farm-bridge active"
echo "SERVICE_DONE"
