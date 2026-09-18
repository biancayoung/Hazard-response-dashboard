# Algarve Fabfarm · environmental operations

A lightweight, receive-only environmental console: vanilla HTML/CSS/JavaScript,
a Python MQTT/WebSocket bridge, and SQLite observation history. The operations
view separates current values, data freshness, reported coordinates, historical
samples, and mesh communications. It does not classify hazards or send commands.

## Local preview

Python 3.10+ and Node.js 18+ (validation only) are required. Runtime dependencies
are [Paho MQTT](https://pypi.org/project/paho-mqtt/2.1.0/) and
[websockets](https://websockets.readthedocs.io/en/15.0.1/reference/asyncio/server.html),
with compatible release ranges in `requirements.txt`.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python bridge.py --demo --http-port 8018 --ws-port 8778
```

Open `http://127.0.0.1:8018/ops`. Demo mode binds **only to loopback**, uses an
**in-memory database**, never connects to MQTT, and generates synthetic readings
through the real decoder every 15 seconds. It includes delayed/silent sources,
a history gap, zero battery, and nodes without coordinates. It never opens,
moves, or deletes `farm.db`. Stop it with Ctrl-C.

## Routes and source ownership

| Route | Purpose | Editable source |
|---|---|---|
| `/ops`, `/b`, `/dashboard-b.html` | Operations console, English / Chinese | `dashboard-b.html`, `ops.css`, `dashboard-b-client.js` |
| `/`, `/a`, `/index.html`, `/dashboard-a.html` | Legacy simple dashboard | `b.html`, `live-client.js`; build with `build_live.py` |
| `/admin` | System diagnostics: transports, sources and raw uplinks | `admin.html`, shared workbench assets below |
| `/data` | Sensor details: per-device fields and dated trends | `data.html`, shared workbench assets below |

`ops-core.js` owns tested display math and known field-unit labels.
`farm-connection.js` owns WebSocket URL discovery and bilingual navigation
(inlined into the generated A build). `workbench.js` owns the shared `/data` and
`/admin` controller; `ops.css` owns all three operational pages’ visual tokens,
layouts and embedded offline fonts. `bridge.py` owns decoding and freshness policy. [DATA-SPEC.md](DATA-SPEC.md)
describes the wire contract without duplicating device inventory.
[DESIGN.md](DESIGN.md) owns the operations design and interaction rationale.
`PROMPT_B.md` / `PROMPT_C.md` are historical prototype briefs, not current
implementation or delivery instructions. `map.svg` and the simple dashboard's
illustrative map are legacy artwork, not surveyed coordinates.

Never edit generated `dashboard-a.html` by hand. Edit its sources and rebuild.
The ops console does not require a frontend build, framework or package manager.

## Live configuration

```sh
cp .env.example .env
chmod 600 .env
# Edit .env locally with the authorized broker configuration.
.venv/bin/python bridge.py --env-file .env
```

Environment-file values are literal: optional matching quotes are removed, but
shell commands and variable interpolation are never evaluated. Existing process
environment values take precedence over the file; explicit CLI arguments override
both. Blank credentials mean no authentication. Use authenticated TLS for
production (`MQTT_TLS=1`, the broker's TLS port and trusted CA when needed).
A nonempty `MQTT_PREFIX` must include its trailing `/`. The relay design is in
[NEUTRAL-BROKER.md](NEUTRAL-BROKER.md).

HTTP/WS defaults remain 8000/8765 and direct CLI launches retain the historical
all-interface bind. The safer `.env.example` binds loopback; change `FARM_BIND`
only within an appropriate access boundary. All existing `--mqtt-*`,
`--http-port`, and `--ws-port` flags remain available; `--mqtt-pass` is retained
for compatibility but should not be used because command arguments are visible
in process listings. New flags: `--env-file`, `--db`, `--bind`, `--demo`.

Browsers discover a custom WS port using `/api/config`. HTTPS continues to use
same-origin `/ws`; admin sockets use `/ws/admin`. Explicit `window.FARM_WS_URL`
and `window.FARM_API_BASE` integrations remain supported. The HTTP port is not
the WS port. If using a reverse proxy, forward **both** `/ws` and `/ws/admin`,
including Upgrade headers, to the WS listener; forward HTTP routes to HTTP.

## API contract

All existing API response shapes and socket event types remain compatible.
GET and HEAD share exact route matching, including query strings. JSON is
non-cacheable; invalid history windows return 400, unknown routes 404, and
SQLite query failures 503.

| Endpoint | Response / additions |
|---|---|
| `/api/overview` | New coherent `{state, metrics, health, mesh, server}` snapshot for ops; no raw uplink dump |
| `/api/config` | New non-secret `{ws_port, mode}` for client connection discovery |
| `/api/health` | Existing categories/lora/meshtastic plus `generated_at`, thresholds, stable source IDs and per-category status counts |
| `/api/mesh` | Existing count/nodes plus `last_heard_ts`, independent `position_ts` and freshness status |
| `/api/raw` | Existing state/devices/raw; raw entries add decoded fields and `received_at` |
| `/api/fields` | Per-device decoded fields; now also seeded from persisted history on startup |
| `/api/history?hours=24` | Existing key → `[timestamp,value]` pairs; accepts 1–168 hours, defaults 24, at most 400 points per field, preserves first/latest points |
| `/api/sparklines` | Existing latest 48 samples per dashboard field |
| `/api/wind` | Existing paired speed/direction samples from the past 48 hours |

`metrics` carries per-key source, field, last reception timestamp, age and status.
`server` carries mode, broker connectivity, last accepted MQTT message time,
start time, storage-write error state, configured WS port and response time. The socket `snapshot` and
`update` envelopes retain `type` and `data` and add `meta` for freshness. Identical
new values still produce an update. Admin sockets retain `admin_snapshot`, `raw`
and `update`. Inbound WebSocket messages do not publish to MQTT.

`weather.rain_rate` fixes the naming of the existing rain-intensity value;
`weather.rain_24h` remains a compatibility alias. Neither is an accumulated
rainfall total. Freshness is based on reception time per field, not browser
socket connectivity. Legacy health categories still represent the latest source
in the category; use the per-source list/counts to detect partial outages.

## Recomputer production procedure (manual, not an auto-deployer)

1. Before any cutover, compare the existing target files with this working tree.
   A deployed copy may not be a Git checkout or match the repository. Review
   target-specific changes and current service/kiosk arguments; keep the private
   inventory and connection details in their existing local authority.
2. Back up the current code, service definition and environment file privately.
   Use SQLite's backup API for a consistent backup of a running database. **Keep
   the existing `farm.db` in place**, along with its journal/WAL files. Never use
   a broad `rsync --delete`, overwrite the DB with a fixture, or deploy `.env`,
   `.agent-local`, `.artifacts`, `.venv`, `.git` or any `*.db*` from a checkout.
3. Prepare a separate code release and virtual environment on the target. Install
   `requirements.txt`, run `build_live.py` and the checks below. Choose standard
   release directories such as `/opt/fabfarm/current` and `/opt/fabfarm/venv`, or
   adapt the service template to existing paths. These are examples, not device
   inventory. Test the candidate on unused loopback ports before cutover.
4. Place the private configuration in `/etc/fabfarm/bridge.env` with restrictive
   permissions. Set `FARM_DB` explicitly to the **existing absolute DB path**;
   set the intended HTTP/WS ports and MQTT settings. Review
   [deploy/farm-bridge.service](deploy/farm-bridge.service): `User`/`Group`, code
   and venv paths, environment path, and `ReadWritePaths` must match the target.
   SQLite needs write access to the DB's parent directory for WAL/journal files.
   The template uses a generic `fabfarm` service account: provision it or select
   an existing least-privilege account with access to the current DB. Do not
   relocate the DB to match the example directory. The systemd environment file
   must be root-readable (mode 600); never run the service as root.
5. Keep the application behind a trusted network boundary or an authenticated
   HTTPS reverse proxy. The bridge has **no built-in authentication**, and raw
   telemetry APIs remain readable by any client that can reach it. Wildcard
   CORS is retained for existing proxy integrations. Do not expose either HTTP
   or WS directly to an untrusted network. Static serving is an explicit asset
   allowlist; source, environment, DB and local context files are not served.
6. Only after the operator authorizes cutover, install the reviewed unit, reload
   systemd and restart the service. Verify `/ops`, `/admin`, `/data`, GET/HEAD,
   `/api/health`, socket reconnect, real decoded readings, per-source ages and
   persistence. Check both desktop/kiosk and the actual touchscreen. If any
   check fails, restore the previous code/unit/config and restart that release;
   keep the same DB. Changes only add an index to the existing readings schema.

To copy code onto a live device without a git checkout there, use
[deploy/sync-mission-pack.sh](deploy/sync-mission-pack.sh) with
[deploy/rsync-exclude](deploy/rsync-exclude). Pass `user@host:/path` yourself;
the script does not store inventory. It never sends `.git`, `.venv`, `farm.db`
or `.env`, and it never `--delete`. Restart the device service yourself.

`wsl_service.sh` now prints the generic unit template for review; it does not
install or restart services. `wsl_setup.sh` is an optional legacy development
bootstrap: its anonymous broker listener is loopback-only. Never use it as a
production broker setup. See [sim/README.md](sim/README.md) for the separately
opted-in MQTT publisher simulator; local UI development should use `--demo`.

## Validation

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
bash -n wsl_setup.sh wsl_service.sh
```

Backend tests use in-memory SQLite and temporary loopback HTTP/WS listeners.
They cover decoding, source isolation, restart freshness, malformed envelopes,
split frames, storage failure recovery, deduplication, zero/scaled coordinates, battery zero, HTTP/HEAD
compatibility, denied private files, bounded history and real WS delivery.
Frontend math tests cover gaps, irregular timestamps, cardinal directions,
coordinate projection and malformed overview responses. Browser checks should
include 1920×1080, 1440×900 and 390×844, English/Chinese, keyboard dialogs,
empty/degraded states and custom WS ports. Save screenshots/logs in ignored
`.artifacts/`. `/ops`, `/data` and `/admin` use locally bundled fonts with no
external font requests; licenses and regeneration instructions live in
[assets/fonts/README.md](assets/fonts/README.md). Legacy `/a` retains optional
Google Fonts and system fallbacks.

### Database backup and rollback

These are operator steps for the separately approved deployment, not commands
run by local validation. `FARM_DB` must resolve to the existing database outside
the versioned code release. Keep the prior release and its virtual environment
available until live acceptance completes.

Set `FARM_DB` and `FARM_BACKUP` privately to absolute paths, then create a
consistent backup without moving the running database:

```sh
python3 - <<'PYBACKUP'
import os, sqlite3
from pathlib import Path
source = Path(os.environ['FARM_DB']).resolve(strict=True)
target = Path(os.environ['FARM_BACKUP'])
# Refuse to overwrite an existing backup or accidentally create a source DB.
fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
os.close(fd)
with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as src:
    with sqlite3.connect(target) as dst:
        src.backup(dst)
        assert dst.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
PYBACKUP
```

Normal rollback switches the reviewed code path, virtual environment and unit
back to the previous release, retains the private environment and **same live
DB**, then restarts only after cutover authorization. This release adds an index;
it does not migrate/drop columns or tables. Verify the old release can read the
backup before cutover. Do not restore an old backup merely to roll back code:
it would discard observations received since the backup. If data restoration is
actually required, stop the writer, preserve the current DB and its WAL/SHM as
a recovery set, and restore the verified backup under explicit operator approval.
Never copy a standalone live DB file while ignoring its WAL.

Known limits: `/api/fields` retains legacy time-only history. The details page
plots only dated `/api/history` samples or raw receipts; fields outside the
mapped history may have no dated trend after restart. Unknown units remain
unspecified. Meshtastic RSSI/SNR/frame counts and raw packets are not currently
exposed; diagnostics shows them as unavailable, not zero.

Other limits: source names and mesh state are not persisted; recovered sensor
names fall back to a readable role plus their ID in detail. Mesh receipt and
position ages use the same hourly thresholds as LoRa until a site-specific
reporting policy is validated. Very large geographic spreads are outside the
intended local-coordinate plot. The legacy simple dashboard retains its older
visual structure; `/ops` is the primary operational view.

No deploy, commit, push or PR is performed by these validation commands.
