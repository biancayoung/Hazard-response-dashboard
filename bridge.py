#!/usr/bin/env python3
"""
Farm screen bridge.

Serves the static dashboard over HTTP and pushes live values to the
browser over WebSocket. Subscribes to ChirpStack MQTT uplinks, digests
the LoRa payloads into the dashboard's data-src keys, and broadcasts
updates to every connected client.

Run:  python3 bridge.py [--http-port 8000] [--ws-port 8765] [--mqtt-host 127.0.0.1]
"""

import argparse
import asyncio
import collections
import json
import logging
import sqlite3
import threading
import time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

import paho.mqtt.client as mqtt
import websockets

log = logging.getLogger("bridge")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

ROOT = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# Live state: the dashboard's data-src keys and their current values.
# ---------------------------------------------------------------------------
STATE = {
    "weather.co2": None,
    "weather.wind": None,
    "weather.wind_dir": None,
    "weather.temp": None,
    "weather.hum": None,
    "weather.rain_24h": None,
    "weather.pressure": None,
    "weather.light": None,
    "weather.pm25": None,
    "weather.pm10": None,
    "soil.temp": None,
    "soil.hum": None,
    "soil.ec": None,
    "mesh.msgs": [],
    "mesh.nodes": None,
}

# Connected WebSocket clients.
CLIENTS = set()
ADMIN_CLIENTS = set()  # admin page sockets: get raw uplinks too
LOOP = None  # asyncio event loop running the websocket server

# Recent raw uplinks (ring buffer) and per-device metadata for the admin page.
RAW_LOG = collections.deque(maxlen=200)
DEVICES = {}  # dev_eui -> {name, last_seen, rssi, snr, fcnt, frames}
# Per-device decoded field history: dev_eui -> field -> {"latest":v, "history":[(ts,v),...]}
FIELDS = {}
FIELD_HISTORY = 48  # points kept per field

# Meshtastic state.
MESH_NODES = {}  # node_id -> {name, last_heard, battery, lat, lon, hops}
MESH_MSGS = collections.deque(maxlen=50)  # recent chat messages
# Dedup ring buffer for mesh packets: two farm gateways hear the same
# Meshtastic packet and the farm relays both, so the same message arrives
# twice. The reliable key is the Meshtastic packet `id`; fall back to
# (sender, text) when a packet has no id.
MESH_SEEN = collections.deque(maxlen=500)
MESH_SEEN_SET = set()


# ---------------------------------------------------------------------------
# Payload digestion for the real SenseCAP / ChirpStack v4 feed.
#
# object.messages is a LIST OF LISTS of {"measurementId","measurementValue"}.
# We flatten it, map measurementId -> friendly field per device, dedupe on
# deduplicationId, and keep the last value per channel (a device can split one
# report across two consecutive uplinks).
# ---------------------------------------------------------------------------

# measurementId -> friendly field name, per device EUI.
# Sources: farm prompt (SenseCAP S2100/S2105/T1000 dataloggers).
DEVICE_CHANNELS = {
    # Weather Station S1000 (via S2100)
    "2cf7f1c07320007c": {
        1: "air temperature", 2: "humidity", 3: "barometric pressure",
        4: "wind direction", 5: "wind speed", 6: "light", 7: "rain intensity",
        8: "pm2.5", 9: "pm10", 10: "co2",
    },
    # Greenhouse CO2/temp/humidity (S-CO2-03)
    "2cf7f1c07320007a": {1: "co2", 2: "air temperature", 3: "humidity"},
    # Soil sensor at the acai palm (S2105, native ids)
    "2cf7f1c072600206": {4102: "soil temperature", 4103: "soil moisture", 4108: "soil ec"},
    # Water Quality (Datalogger 02, RS485 probe)
    "2cf7f1c07320007d": {1: "water temperature", 2: "probe ch2", 3: "probe ch3", 4: "probe ch4"},
    # Lake level (Liquid Level Pressure Sensor)
    "2cf7f1c073200079": {1: "level"},
}
# T1000 chicken tracker uses string `type` names instead of numeric ids.
T1000_TYPES = {
    4198: "latitude", 4197: "longitude", 4097: "air temperature",
    4199: "light", 3000: "battery", 4200: "event status",
}

# Friendly field -> dashboard data-src key (for the weather/soil stations).
DASHBOARD_MAP = {
    ("2cf7f1c07320007c", "co2"): "weather.co2",
    ("2cf7f1c07320007c", "wind speed"): "weather.wind",
    ("2cf7f1c07320007c", "wind direction"): "weather.wind_dir",
    ("2cf7f1c07320007c", "air temperature"): "weather.temp",
    ("2cf7f1c07320007c", "humidity"): "weather.hum",
    ("2cf7f1c07320007c", "rain intensity"): "weather.rain_24h",
    ("2cf7f1c07320007c", "barometric pressure"): "weather.pressure",
    ("2cf7f1c07320007c", "light"): "weather.light",
    ("2cf7f1c07320007c", "pm2.5"): "weather.pm25",
    ("2cf7f1c07320007c", "pm10"): "weather.pm10",
    ("2cf7f1c072600206", "soil temperature"): "soil.temp",
    ("2cf7f1c072600206", "soil moisture"): "soil.hum",
    ("2cf7f1c072600206", "soil ec"): "soil.ec",
}

SEEN_IDS = collections.deque(maxlen=1000)  # deduplicationId ring buffer
SEEN_SET = set()

# ---------------------------------------------------------------------------
# SQLite persistence: every decoded field reading is stored so history (and
# the wind rose) survives restarts and can span days.
# ---------------------------------------------------------------------------
DB_PATH = ROOT / "farm.db"
_DB_LOCK = threading.Lock()
_db = sqlite3.connect(str(DB_PATH), check_same_thread=False)
_db.execute(
    "CREATE TABLE IF NOT EXISTS readings ("
    " id INTEGER PRIMARY KEY AUTOINCREMENT,"
    " ts REAL NOT NULL,"
    " dev_eui TEXT NOT NULL,"
    " field TEXT NOT NULL,"
    " value REAL NOT NULL)"
)
_db.execute("CREATE INDEX IF NOT EXISTS idx_readings_field_ts ON readings(field, ts)")
_db.commit()


def db_store(dev_eui, fields):
    """Persist one uplink's decoded numeric fields (single shared timestamp)."""
    ts = time.time()
    rows = [(ts, dev_eui, k, float(v))
            for k, v in fields.items() if isinstance(v, (int, float))]
    if not rows:
        return
    with _DB_LOCK:
        _db.executemany("INSERT INTO readings(ts, dev_eui, field, value) VALUES(?,?,?,?)", rows)
        _db.commit()


def db_wind_history(hours=48, limit=2000):
    """Return [(ts, speed, direction)] for the wind rose, oldest first."""
    since = time.time() - hours * 3600
    with _DB_LOCK:
        cur = _db.execute(
            "SELECT ts, field, value FROM readings"
            " WHERE field IN ('wind speed','wind direction') AND ts>=?"
            " ORDER BY ts ASC LIMIT ?", (since, limit))
        rows = cur.fetchall()
    # pair speed + direction by timestamp (same uplink shares ts)
    by_ts = {}
    for ts, field, val in rows:
        by_ts.setdefault(ts, {})[field] = val
    out = []
    for ts in sorted(by_ts):
        d = by_ts[ts]
        if "wind speed" in d and "wind direction" in d:
            out.append([ts, d["wind speed"], d["wind direction"]])
    return out


# dashboard data-src key -> friendly field name in the readings table
SPARK_FIELDS = {
    "weather.temp": "air temperature",
    "weather.hum": "humidity",
    "weather.pressure": "barometric pressure",
    "weather.light": "light",
    "weather.co2": "co2",
    "weather.pm25": "pm2.5",
    "weather.pm10": "pm10",
    "weather.rain_24h": "rain intensity",
    "weather.wind": "wind speed",
    "weather.wind_dir": "wind direction",
    "soil.temp": "soil temperature",
    "soil.hum": "soil moisture",
    "soil.ec": "soil ec",
}


def db_sparklines(points=48):
    """Return {dashboard_key: [[ts, value], ...]} recent history for sparklines."""
    out = {}
    with _DB_LOCK:
        for key, field in SPARK_FIELDS.items():
            cur = _db.execute(
                "SELECT ts, value FROM readings WHERE field=? ORDER BY ts DESC LIMIT ?",
                (field, points))
            rows = cur.fetchall()
            if rows:
                out[key] = [[r[0], r[1]] for r in reversed(rows)]
    return out


def db_history(hours=24, max_points=400):
    """Return {dashboard_key: [[ts, value], ...]} for the last `hours`, for the
    big trend charts. Downsamples to max_points per field if needed."""
    since = time.time() - hours * 3600
    out = {}
    with _DB_LOCK:
        for key, field in SPARK_FIELDS.items():
            cur = _db.execute(
                "SELECT ts, value FROM readings WHERE field=? AND ts>=? ORDER BY ts ASC",
                (field, since))
            rows = cur.fetchall()
            if not rows:
                continue
            # downsample to max_points evenly
            if len(rows) > max_points:
                step = len(rows) / max_points
                rows = [rows[int(i * step)] for i in range(max_points)]
            out[key] = [[r[0], r[1]] for r in rows]
    return out


def load_state_from_db():
    """Seed STATE with the most recent real value per dashboard key, so the
    dashboard shows live data immediately after a restart (not mock/empty)."""
    with _DB_LOCK:
        for key, field in SPARK_FIELDS.items():
            cur = _db.execute(
                "SELECT value FROM readings WHERE field=? ORDER BY ts DESC LIMIT 1",
                (field,))
            row = cur.fetchone()
            if row and key in STATE:
                STATE[key] = row[0]
    log.info("seeded state from db: %s",
             {k: v for k, v in STATE.items() if v is not None and k != "mesh.msgs"})


def _flatten_messages(obj):
    """Yield (measurementId, value, type) from object.messages (list of lists)."""
    msgs = obj.get("messages")
    if not isinstance(msgs, list):
        return
    for group in msgs:
        items = group if isinstance(group, list) else [group]
        for it in items:
            if not isinstance(it, dict):
                continue
            mid = it.get("measurementId")
            val = it.get("measurementValue")
            typ = it.get("type")
            if mid is None or val is None:
                continue
            try:
                mid = int(mid)
            except (TypeError, ValueError):
                pass
            yield mid, val, typ


def decode_fields(dev_eui, msg):
    """Return {friendly_field: value} for one uplink."""
    obj = msg.get("object") or {}
    if not isinstance(obj, dict):
        return {}
    fields = {}
    chan_map = DEVICE_CHANNELS.get(dev_eui, {})
    for mid, val, typ in _flatten_messages(obj):
        name = chan_map.get(mid) or T1000_TYPES.get(mid)
        if name is None:
            # T1000 also matches on the human `type` string.
            if isinstance(typ, str):
                name = typ.lower()
            else:
                name = "ch %s" % mid
        if isinstance(val, (int, float)):
            fields[name] = val
    return fields


def digest_uplink(msg: dict):
    """Return (dashboard_updates, friendly_fields, dev_eui) for one uplink."""
    info = msg.get("deviceInfo") or {}
    dev_eui = info.get("devEui") or "unknown"
    fields = decode_fields(dev_eui, msg)
    updates = {}
    for (eui, fname), key in DASHBOARD_MAP.items():
        if eui == dev_eui and fname in fields:
            updates[key] = fields[fname]
    return updates, fields, dev_eui


# ---------------------------------------------------------------------------
# Meshtastic (msh/<region>/2/json/<channel>/!<nodeid>).
# JSON payloads carry a "type": text | position | telemetry | nodeinfo.
# ---------------------------------------------------------------------------
def _node_name(node_id, payload):
    """Best-effort human name for a mesh node."""
    for k in ("longname", "longName", "shortname", "shortName", "name"):
        v = payload.get(k)
        if v:
            return v
    return str(node_id).lstrip("!")


def _mesh_dedup_key(msg, payload, mtype):
    """Return a dedup key for one mesh packet, or None if not dedupable.

    Two farm gateways hear the same Meshtastic packet and the farm relays
    both, so the same message can arrive twice. The reliable key is the
    Meshtastic packet `id`; fall back to (sender, text) for text messages
    that carry no id.
    """
    pid = msg.get("id") or payload.get("id")
    if pid is not None:
        return ("id", pid)
    if mtype == "text":
        sender = msg.get("from") or msg.get("sender") or payload.get("from")
        text = payload.get("text") or payload.get("message") or ""
        return ("ft", str(sender), text)
    return None


def mesh_is_duplicate(msg, payload, mtype):
    """True if this mesh packet was already seen (within the ring buffer)."""
    key = _mesh_dedup_key(msg, payload, mtype)
    if key is None:
        return False
    if key in MESH_SEEN_SET:
        return True
    MESH_SEEN.append(key)
    MESH_SEEN_SET.add(key)
    if len(MESH_SEEN_SET) > 500:
        MESH_SEEN_SET.clear()
        MESH_SEEN_SET.update(MESH_SEEN)
    return False


def handle_mesh(topic, msg):
    """Process one Meshtastic MQTT message; update nodes, chat, and STATE."""
    mtype = (msg.get("type") or "").lower()
    payload = msg.get("payload") or msg
    # Dedupe repeated mesh packets (two gateways hear the same packet).
    if mesh_is_duplicate(msg, payload, mtype):
        log.info("duplicate mesh packet ignored (id=%s)", msg.get("id") or payload.get("id"))
        return
    # node id from the topic (!<nodeid>) or the payload
    node_id = msg.get("from") or msg.get("sender") or payload.get("from")
    if not node_id and "!" in topic:
        node_id = topic.rsplit("!", 1)[-1]
    node_id = str(node_id or "unknown")

    node = MESH_NODES.setdefault(node_id, {"name": _node_name(node_id, payload)})
    node["last_heard"] = time.strftime("%H:%M:%S")
    node["last_heard_ts"] = time.time()
    if "longname" in payload or "longName" in payload or "shortname" in payload or "shortName" in payload:
        node["name"] = _node_name(node_id, payload)

    if mtype == "text":
        text = payload.get("text") or payload.get("message") or ""
        if text:
            MESH_MSGS.append({
                "who": node["name"],
                "meta": node.get("hops", "") and ("%s hops" % node["hops"]) or time.strftime("%H:%M"),
                "text": text,
                "me": False,
            })
            STATE["mesh.msgs"] = list(MESH_MSGS)
            broadcast({"type": "update", "data": {"mesh.msgs": list(MESH_MSGS)}})

    elif mtype == "position":
        lat = payload.get("latitude") or payload.get("lat")
        lon = payload.get("longitude") or payload.get("lon")
        if lat is not None and lon is not None:
            node["lat"], node["lon"] = lat, lon

    elif mtype == "telemetry":
        batt = payload.get("battery") or payload.get("batteryLevel") or payload.get("battery_level")
        if batt is not None:
            node["battery"] = batt

    elif mtype == "nodeinfo":
        if "hops" in payload:
            node["hops"] = payload["hops"]
        if "battery" in payload:
            node["battery"] = payload["battery"]

    # update node count + broadcast
    STATE["mesh.nodes"] = len(MESH_NODES)
    broadcast({"type": "update", "data": {"mesh.nodes": len(MESH_NODES)}})
    log.info("mesh %s from %s (%s); %d nodes", mtype or "?", node_id, node["name"], len(MESH_NODES))


def is_duplicate(msg: dict) -> bool:
    """Two farm gateways hear the same sensor, so the same uplink can arrive
    twice. ChirpStack gives each gateway copy a DIFFERENT deduplicationId, so
    the reliable key is (devEui, fCnt). Dedupe within a short time window."""
    info = msg.get("deviceInfo") or {}
    dev_eui = info.get("devEui") or "unknown"
    fcnt = msg.get("fCnt")
    if fcnt is None:
        return False
    key = (dev_eui, fcnt)
    if key in SEEN_SET:
        return True
    SEEN_IDS.append(key)
    SEEN_SET.add(key)
    if len(SEEN_SET) > 1000:
        SEEN_SET.clear()
        SEEN_SET.update(SEEN_IDS)
    return False


def apply_updates(updates: dict):
    """Merge updates into STATE and broadcast to all WebSocket clients."""
    changed = {k: v for k, v in updates.items() if STATE.get(k) != v}
    if not changed:
        return
    STATE.update(changed)
    log.info("update %s", changed)
    broadcast({"type": "update", "data": changed})


def broadcast(payload: dict, admin_only: bool = False):
    """Send a JSON message to connected browsers (thread-safe).

    admin_only=True sends only to admin page sockets; otherwise the message
    goes to both dashboard and admin sockets.
    """
    if LOOP is None:
        return
    targets = ADMIN_CLIENTS if admin_only else (CLIENTS | ADMIN_CLIENTS)
    if not targets:
        return
    msg = json.dumps(payload)
    for ws in list(targets):
        asyncio.run_coroutine_threadsafe(_safe_send(ws, msg), LOOP)


async def _safe_send(ws, msg):
    try:
        await ws.send(msg)
    except Exception:
        CLIENTS.discard(ws)
        ADMIN_CLIENTS.discard(ws)


def record_uplink(topic: str, msg: dict):
    """Store a raw uplink and per-device metadata; notify admin clients."""
    info = msg.get("deviceInfo") or {}
    dev_eui = info.get("devEui") or info.get("dev_eui") or "unknown"
    name = info.get("deviceName") or dev_eui
    rx = (msg.get("rxInfo") or [{}])[0]
    entry = {
        "ts": time.strftime("%H:%M:%S"),
        "topic": topic,
        "device": name,
        "dev_eui": dev_eui,
        "rssi": rx.get("rssi"),
        "snr": rx.get("snr"),
        "fcnt": msg.get("fCnt"),
        "object": msg.get("object"),
        "raw": msg,
    }
    RAW_LOG.appendleft(entry)

    d = DEVICES.setdefault(dev_eui, {"name": name, "frames": 0})
    d["name"] = name
    d["last_seen"] = entry["ts"]
    d["last_seen_ts"] = time.time()
    d["rssi"] = entry["rssi"]
    d["snr"] = entry["snr"]
    d["fcnt"] = entry["fcnt"]
    d["frames"] = d.get("frames", 0) + 1

    # Track decoded field history per device for the data-driven pages.
    decoded = decode_fields(dev_eui, msg)
    for key, val in decoded.items():
        if isinstance(val, (int, float)):
            dev_fields = FIELDS.setdefault(dev_eui, {})
            f = dev_fields.setdefault(key, {"latest": None, "history": collections.deque(maxlen=FIELD_HISTORY)})
            f["latest"] = val
            f["history"].append([entry["ts"], val])
    # Persist to SQLite for the wind rose and long history.
    db_store(dev_eui, decoded)

    broadcast({"type": "raw", "data": entry}, admin_only=True)


def fields_payload():
    """Serialize per-device field history for the data-driven pages."""
    out = {}
    for dev_eui, fields in FIELDS.items():
        name = DEVICES.get(dev_eui, {}).get("name", dev_eui)
        out[dev_eui] = {
            "name": name,
            "fields": {
                k: {"latest": v["latest"], "history": list(v["history"])}
                for k, v in fields.items()
            },
        }
    return out


# Data-health thresholds (seconds). Sensors report roughly once per hour.
HEALTH_LIVE = 90 * 60        # < 90 min  -> live
HEALTH_STALE = 3 * 3600      # 90 min-3 h -> stale; > 3 h / never -> down


def _health_status(age):
    """Map an age in seconds (None = never seen) to a status string."""
    if age is None:
        return "down"
    if age < HEALTH_LIVE:
        return "live"
    if age < HEALTH_STALE:
        return "stale"
    return "down"


def health_payload():
    """Per-source data health: is data still being received, and how long ago
    was the last message. Covers each LoRa device, each Meshtastic node, and
    an overall 'lora' / 'meshtastic' category."""
    now = time.time()

    def entry(name, ts):
        age = (now - ts) if ts else None
        return {
            "name": name,
            "last_seen": ts,
            "age_s": round(age) if age is not None else None,
            "status": _health_status(age),
        }

    lora = [entry(d.get("name", eui), d.get("last_seen_ts"))
            for eui, d in DEVICES.items()]
    mesh = [entry(n.get("name", nid), n.get("last_heard_ts"))
            for nid, n in MESH_NODES.items()]

    def category(cat, sources):
        ts = max((s["last_seen"] for s in sources if s["last_seen"]), default=None)
        e = entry(cat, ts)
        e["sources"] = len(sources)
        return e

    return {
        "categories": [category("lora", lora), category("meshtastic", mesh)],
        "lora": lora,
        "meshtastic": mesh,
    }


def admin_snapshot():
    return {
        "type": "admin_snapshot",
        "data": {
            "state": STATE,
            "devices": list(DEVICES.values()),
            "raw": list(RAW_LOG),
            "fields": fields_payload(),
            "mesh": mesh_payload(),
            "health": health_payload(),
        },
    }


def mesh_payload():
    """Serialize mesh nodes for the map/status pages."""
    return {
        "count": len(MESH_NODES),
        "nodes": [
            {
                "id": nid,
                "name": n.get("name", nid),
                "last_heard": n.get("last_heard"),
                "battery": n.get("battery"),
                "lat": n.get("lat"),
                "lon": n.get("lon"),
                "hops": n.get("hops"),
            }
            for nid, n in MESH_NODES.items()
        ],
    }


# ---------------------------------------------------------------------------
# MQTT
# ---------------------------------------------------------------------------
def start_mqtt(host, port, topic, username, password, tls=False, prefix="",
               cafile=None, insecure=False):
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    if username:
        client.username_pw_set(username, password)
    if tls:
        import ssl
        # cafile: for brokers whose certificate is not signed by a public CA.
        # EMQX ships a demo certificate signed by its own "EMQ RootCA" and with
        # CN=Server, so connecting by IP needs both the CA file and --mqtt-insecure
        # (which only turns off the hostname check, never the chain check).
        client.tls_set(ca_certs=cafile, cert_reqs=ssl.CERT_REQUIRED)
        if insecure:
            client.tls_insecure_set(True)

    def on_connect(c, userdata, flags, rc, properties=None):
        # subscribe to the (possibly prefixed) LoRa + Meshtastic topics
        lora_topic = prefix + topic if prefix else topic
        mesh_topic = prefix + "msh/#"
        log.info("mqtt connected rc=%s, subscribing %s + %s", rc, lora_topic, mesh_topic)
        c.subscribe(lora_topic)
        c.subscribe(mesh_topic)

    def on_message(c, userdata, m):
        raw = m.payload.decode("utf-8", "replace")
        try:
            msg = json.loads(raw)
        except Exception:
            log.warning("non-json payload on %s", m.topic)
            msg = {"_raw": raw}
        # strip the neutral-broker prefix for routing
        t = m.topic[len(prefix):] if prefix and m.topic.startswith(prefix) else m.topic
        # Meshtastic messages go to the mesh handler, not the LoRa digestion.
        if t.startswith("msh/"):
            handle_mesh(t, msg)
            return
        if is_duplicate(msg):
            log.info("duplicate uplink ignored (devEui,fCnt)")
            return
        record_uplink(m.topic, msg)
        updates, _fields, _eui = digest_uplink(msg)
        apply_updates(updates)

    client.on_connect = on_connect
    client.on_message = on_message

    def connect_loop():
        import time
        while True:
            try:
                client.connect(host, port, keepalive=60)
                client.loop_start()
                return
            except OSError as e:
                log.warning("mqtt connect failed (%s), retrying in 5 s", e)
                time.sleep(5)

    threading.Thread(target=connect_loop, daemon=True).start()
    return client


# ---------------------------------------------------------------------------
# WebSocket server
# ---------------------------------------------------------------------------
async def ws_handler(ws):
    path = getattr(ws.request, "path", "/") if ws.request else "/"
    is_admin = path.rstrip("/").endswith("admin")
    group = ADMIN_CLIENTS if is_admin else CLIENTS
    group.add(ws)
    log.info("%s connected (%d dashboard, %d admin)",
             "admin" if is_admin else "dashboard", len(CLIENTS), len(ADMIN_CLIENTS))
    try:
        if is_admin:
            await ws.send(json.dumps(admin_snapshot()))
        else:
            # Full snapshot on connect so the dashboard populates immediately.
            await ws.send(json.dumps({"type": "snapshot", "data": STATE}))
        async for _ in ws:  # ignore inbound; keep the socket open
            pass
    finally:
        group.discard(ws)
        log.info("client disconnected (%d dashboard, %d admin)",
                 len(CLIENTS), len(ADMIN_CLIENTS))


async def ws_server(host, port):
    async with websockets.serve(ws_handler, host, port):
        log.info("websocket listening on ws://%s:%d", host, port)
        await asyncio.Future()  # run forever


def start_ws(host, port):
    global LOOP
    LOOP = asyncio.new_event_loop()
    asyncio.set_event_loop(LOOP)
    LOOP.run_until_complete(ws_server(host, port))


# ---------------------------------------------------------------------------
# HTTP static server
# ---------------------------------------------------------------------------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def _rewrite(self):
        # Dashboard A (clean live dashboard) is the default at the root;
        # no landing page. /ops is kept as an alias of /b so old links work.
        if self.path in ("/", "/index.html", "/a"):
            self.path = "/dashboard-a.html"
        elif self.path in ("/b", "/ops"):
            self.path = "/dashboard-b.html"
        elif self.path == "/admin":
            self.path = "/admin.html"
        elif self.path == "/data":
            self.path = "/data.html"

    def do_HEAD(self):
        # HEAD requests (e.g. the kiosk network check) use the same rewriting.
        self._rewrite()
        super().do_HEAD()

    def do_GET(self):
        # API endpoints first (before path rewriting).
        if self.path.startswith("/api/raw"):
            return self._json({
                "state": STATE,
                "devices": list(DEVICES.values()),
                "raw": list(RAW_LOG),
            })
        if self.path.startswith("/api/fields"):
            return self._json(fields_payload())
        if self.path.startswith("/api/mesh"):
            return self._json(mesh_payload())
        if self.path.startswith("/api/health"):
            return self._json(health_payload())
        if self.path.startswith("/api/wind"):
            return self._json({"wind": db_wind_history()})
        if self.path.startswith("/api/sparklines"):
            return self._json(db_sparklines())
        if self.path.startswith("/api/history"):
            return self._json(db_history())
        self._rewrite()
        super().do_GET()

    def _json(self, obj, status=200):
        body = json.dumps(obj, indent=2).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        log.info("http " + fmt, *args)


def start_http(port):
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    log.info("http serving %s on http://0.0.0.0:%d", ROOT, port)
    srv.serve_forever()


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--http-port", type=int, default=8000)
    ap.add_argument("--ws-port", type=int, default=8765)
    ap.add_argument("--mqtt-host", default="127.0.0.1")
    ap.add_argument("--mqtt-port", type=int, default=1883)
    ap.add_argument("--mqtt-topic", default="application/+/device/+/event/up")
    ap.add_argument("--mqtt-user", default=None)
    ap.add_argument("--mqtt-pass", default=None)
    ap.add_argument("--mqtt-tls", action="store_true")
    ap.add_argument("--mqtt-prefix", default="")
    ap.add_argument("--mqtt-cafile", default=None,
                    help="CA bundle for brokers with a private/self-signed CA")
    ap.add_argument("--mqtt-insecure", action="store_true",
                    help="skip the TLS hostname check (chain is still verified)")
    args = ap.parse_args()

    load_state_from_db()  # show the latest real values immediately
    start_mqtt(args.mqtt_host, args.mqtt_port, args.mqtt_topic,
               args.mqtt_user, args.mqtt_pass,
               tls=args.mqtt_tls, prefix=args.mqtt_prefix,
               cafile=args.mqtt_cafile, insecure=args.mqtt_insecure)

    threading.Thread(target=start_ws, args=("0.0.0.0", args.ws_port),
                     daemon=True).start()
    start_http(args.http_port)


if __name__ == "__main__":
    main()
