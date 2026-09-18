# Algarve Fabfarm · environmental operations

Receive-only environmental console: vanilla HTML/CSS/JS, a Python MQTT/WebSocket
bridge, and SQLite history. It shows current readings, freshness, reported
coordinates, trends, and mesh traffic. It does not send commands or classify
hazards.

## Local preview

Python 3.10+ to run; Node.js 18+ only for checks. Dependencies are in
`requirements.txt` (`paho-mqtt`, `websockets`).

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python bridge.py --demo --http-port 8018 --ws-port 8778
```

Open `http://127.0.0.1:8018/ops`.

Demo mode:

- binds loopback only
- uses an in-memory SQLite database and never opens, moves, or deletes `farm.db`
- does not connect to MQTT
- emits synthetic readings through the real decoder every 15 seconds (silent
  sources, a history gap, zero battery, nodes without coordinates)
- stop with Ctrl-C

## Routes and sources

| Route | Purpose | Edit these files |
|---|---|---|
| `/ops`, `/b`, `/dashboard-b.html` | Operations console (EN/ZH) | `dashboard-b.html`, `ops.css`, `dashboard-b-client.js` |
| `/`, `/a`, `/index.html`, `/dashboard-a.html` | Legacy simple dashboard | `b.html`, `live-client.js`; rebuild with `python3 build_live.py` |
| `/admin` | Diagnostics: transports, sources, raw uplinks | `admin.html`, `workbench.js` |
| `/data` | Sensor details: per-device fields and dated trends | `data.html`, `workbench.js` |

- Do not edit generated `dashboard-a.html`; change its sources and rebuild.
- `/ops`, `/admin`, and `/data` use local assets and offline fonts. No CDN, no
  npm build.
- Display math and units: `ops-core.js`. WS discovery and language:
  `farm-connection.js`. Wire contract: [DATA-SPEC.md](DATA-SPEC.md). Interaction:
  [DESIGN.md](DESIGN.md).
- `PROMPT_B.md` / `PROMPT_C.md` are historical briefs, not current
  implementation. `map.svg` is legacy artwork, not surveyed coordinates.

## Live configuration

```sh
cp .env.example .env
chmod 600 .env
# Put the authorized broker settings in .env
.venv/bin/python bridge.py --env-file .env
```

- Precedence: CLI flags > process environment > `.env`.
- Defaults: HTTP 8000, WS 8765. `.env.example` binds loopback; change the bind
  with `FARM_BIND`.
- Production MQTT should use TLS (`MQTT_TLS=1`, the TLS port, and a trusted CA
  when needed). A nonempty `MQTT_PREFIX` must end with `/`.
- Command lines show up in process listings. Do not pass `--mqtt-pass`; put the
  password in `.env`.
- HTTP and WebSocket are separate ports. The browser learns the WS port from
  `/api/config`. A reverse proxy must forward `/ws` and `/ws/admin` (with
  Upgrade) to the WS listener, and the other HTTP routes to HTTP.
- The bridge has no built-in auth. Do not expose HTTP/WS on an untrusted
  network.

## API

JSON, uncached. Invalid history windows return 400, unknown routes 404, SQLite
query failures 503. GET and HEAD share the same routes.

| Endpoint | Purpose |
|---|---|
| `/api/overview` | Ops snapshot `{state, metrics, health, mesh, server}` — no raw uplink dump |
| `/api/config` | `{ws_port, mode}` |
| `/api/health` | Category health, timestamps, counts |
| `/api/mesh` | Nodes, `last_heard_ts`, `position_ts`, freshness |
| `/api/raw` | Raw uplinks and latest decoded fields |
| `/api/fields` | Per-device decoded fields; seeded from history on startup |
| `/api/history?hours=24` | `[timestamp, value]`, 1–168 hours, at most 400 points per field |
| `/api/sparklines` | Latest 48 samples per dashboard field |
| `/api/wind` | Paired speed/direction samples from the past 48 hours |

WebSocket envelopes carry `type`, `data`, and `meta` (freshness). Admin sockets
also send `admin_snapshot` and `raw`. Inbound WebSocket messages are not
published to MQTT.

`weather.rain_rate` is instantaneous intensity, not accumulated rainfall;
`weather.rain_24h` is a compatibility alias. Freshness uses per-field receipt
time, not whether the browser socket is connected.

## Copying code to a live device (manual cutover)

There is no auto-deployer. Do not store host or path in this repository; pass
them when you run the helper.

```sh
./deploy/sync-mission-pack.sh --dry-run user@host:/path/on/device
./deploy/sync-mission-pack.sh user@host:/path/on/device
```

Or:

```sh
FARM_SYNC_HOST=user@host FARM_SYNC_DEST=/path/on/device ./deploy/sync-mission-pack.sh
```

- Excludes `.git`, `.venv`, `farm.db*`, and `.env*`. Never uses `rsync --delete`.
- Does not restart the service; do that on the device after you check `/ops`.
- `wsl_service.sh` only prints [deploy/farm-bridge.service](deploy/farm-bridge.service).
- Keep the live env file off the code tree (for example `/etc/fabfarm/bridge.env`,
  mode 600). Set `FARM_DB` to the **existing** absolute database path. Do not
  move the database to match an example directory. The service user must be able
  to write the DB’s parent directory (WAL/journal). Do not run the service as
  root.

### Backup and rollback

Do not `cp` a running `farm.db` (WAL is missed). Online backup:

```sh
export FARM_DB="/path/to/existing/farm.db"
export FARM_BACKUP="/path/to/backup/farm.db"

python3 - <<'PYBACKUP'
import os, sqlite3
from pathlib import Path
source = Path(os.environ['FARM_DB']).resolve(strict=True)
target = Path(os.environ['FARM_BACKUP'])
fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
os.close(fd)
with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as src:
    with sqlite3.connect(target) as dst:
        src.backup(dst)
        assert dst.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
PYBACKUP
```

Rollback means switching the code directory and venv back, keeping the **same**
`farm.db`, then restarting. Do not restore an old database backup just to roll
back code — that drops observations received after the backup. This release only
adds an index; it does not change or drop columns.

## Checks

```sh
.venv/bin/python -m compileall -q bridge.py demo.py build_live.py check.py sim tests
.venv/bin/python build_live.py
.venv/bin/python check.py dashboard-a.html --hub
.venv/bin/python check.py dashboard-b.html --app
.venv/bin/python check.py admin.html --app
.venv/bin/python check.py data.html --app
node --check dashboard-b-client.js
node --check ops-core.js
node --check farm-connection.js
node --check live-client.js
node --check workbench.js
node --test tests/*.test.js
.venv/bin/python -m unittest discover -s tests -v
bash -n wsl_setup.sh wsl_service.sh deploy/sync-mission-pack.sh
```

These commands do not deploy, commit, or open a PR. Browser checks: 1920×1080,
1440×900, 390×844, English/Chinese, empty data. Put screenshots in ignored
`.artifacts/`.

## Limits

- Source names and mesh topology are not persisted; after restart, names fall
  back to a role plus ID.
- The details page plots only dated history; unmapped fields have no continuous
  trend after restart.
- Meshtastic RSSI/SNR and raw packets are not exposed; diagnostics shows
  unavailable, not zero.
- Very large geographic spreads are outside the local plot.
- `sim/` is a separate MQTT publisher; see [sim/README.md](sim/README.md). For
  local UI work prefer `bridge.py --demo`.
