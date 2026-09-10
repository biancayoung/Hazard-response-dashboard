# farm-screen

Live environmental monitoring dashboards for the farm in Portugal (Sitio das
Aguilhadas, Lagos / Algarve fabfarm). A Python bridge subscribes to the farm's
MQTT feed (LoRaWAN sensors via ChirpStack + Meshtastic mesh), persists readings
to SQLite, serves the dashboards over HTTP, and pushes live values to the
browser over WebSocket.

## Dashboards

| page | route(s) | file | what it is |
|---|---|---|---|
| **Dashboard A** | `/` (default), `/a`, `/index.html` | `dashboard-a.html` (built) | The clean, simple live dashboard: big numerals, rain chart, map, mesh chat. |
| **Dashboard B** | `/b` (alias `/ops`) | `dashboard-b.html` + `dashboard-b-client.js` | The hazard-response "ops console": single-screen command centre with map, wind rose, meshtastic, key metrics, trends. |
| admin | `/admin` | `admin.html` | Raw uplinks, device table, data health. |
| data | `/data` | `data.html` | Per-device decoded fields with sparklines. |

## File layout

```
bridge.py               the bridge: MQTT -> SQLite + WebSocket -> HTTP static + JSON APIs
b.html                  EDITABLE SOURCE of dashboard A (edit this, not dashboard-a.html)
live-client.js          WebSocket client injected into dashboard A at build time
build_live.py           builds dashboard-a.html from b.html:  python3 build_live.py
dashboard-a.html        GENERATED (build output; do not edit by hand)
dashboard-b.html        dashboard B markup (editable)
dashboard-b-client.js   dashboard B logic (editable, loaded as external script)
admin.html, data.html   utility pages (editable)
check.py                prototype gate: python3 check.py <file.html> [--hub]
map.svg                 farm map, inlined verbatim into the dashboards
farm.db                 SQLite readings (runtime, gitignored)
DATA-SPEC.md            the MQTT feed: topics, devices, measurementId maps
NEUTRAL-BROKER.md       the neutral-broker arrangement (test.mosquitto.org, TLS 8886)
DESIGN.md               design contract (tokens, data-src keys, layout rules)
wsl_setup.sh, wsl_service.sh   WSL deployment helpers
```

## How the bridge works

```
FARM (Jetson relay) --MQTT--> broker --MQTT--> bridge.py --WebSocket--> browser
                                                   |
                                                   +--> SQLite (farm.db)
                                                   +--> HTTP: static pages + /api/*
```

- Subscribes to ChirpStack uplinks (`application/+/device/+/event/up`) and
  Meshtastic (`msh/#`), dedupes (two farm gateways hear each packet), digests
  SenseCAP measurementIds into `data-src` keys, stores every reading in
  SQLite, and broadcasts updates to all connected browsers.
- On connect each browser gets a full snapshot seeded from the DB, so the
  dashboards show real values immediately (sensors report roughly hourly).
- JSON APIs: `/api/raw` `/api/fields` `/api/mesh` `/api/health` `/api/wind`
  `/api/sparklines` `/api/history`.
- WebSocket on port 8765 (plain HTTP) or proxied at `/ws` (HTTPS via
  tailscale serve). Admin page sockets also receive raw uplinks.

Run: `python3 bridge.py [--http-port 8000] [--ws-port 8765] [--mqtt-host ...]`
(see `--help`; MQTT TLS/credentials/prefix flags match NEUTRAL-BROKER.md).

## Editing workflow

- Dashboard A: edit `b.html`, then `python3 build_live.py` to regenerate
  `dashboard-a.html`. Validate with `python3 check.py dashboard-a.html --hub`.
- Dashboard B: edit `dashboard-b.html` / `dashboard-b-client.js` directly.
  It loads an external script by design, so check.py's inline-JS rule does not
  apply; validate with `node --check dashboard-b-client.js`.
- Note: check.py on Windows can throw UnicodeEncodeError on non-ASCII
  characters; run it in WSL (`python3 check.py ...`) instead.

## Remotes (kept in sync)

- **GitHub**: `github` -> https://github.com/biancayoung/Hazard-response-dashboard
- **Gitea (self-hosted)**: `origin` -> http://192.168.1.10:3001/lpgn/farm-screen

Push to both when committing.

## Deployment targets

- **WSL** (this machine): dev + live instance, see `wsl_setup.sh` / `wsl_service.sh`.
- **Mission pack** (Seeed machine, Shenzhen office): the production kiosk.
  Both sides connect outbound to the neutral broker; no inbound ports needed
  (see NEUTRAL-BROKER.md).
