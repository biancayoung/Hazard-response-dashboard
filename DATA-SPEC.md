# Telemetry contract

The bridge accepts JSON ChirpStack v4 uplinks and Meshtastic JSON envelopes.
Deployment configuration belongs in a private environment file (see README).
`bridge.py` owns the existing `DEVICE_CHANNELS`, `T1000_TYPES`, and
`DASHBOARD_MAP` decoder mappings; do not duplicate device inventory here.

## ChirpStack

Subscribe to `application/+/device/+/event/up`, optionally beneath a configured
prefix. Required: `deviceInfo.devEui`. Useful fields: `deviceInfo.deviceName`,
`fCnt`, `rxInfo[].rssi`, `rxInfo[].snr`, and `object.messages`.

Messages may be a list of lists or a flat list of objects containing
`measurementId`, `measurementValue`, and `type`. Some reports are split across
frames; each decoded channel retains its own last-received timestamp. Device
information frames without numeric observations do not refresh metric ages.
Only finite numeric observations are stored. Weather pressure is stored in Pa;
the UI converts it to hPa. Light is stored in lux.

`weather.rain_rate` is rain intensity in mm/h. The legacy `weather.rain_24h`
key remains an alias for backward compatibility; it has never represented an
integrated daily total. Do not sum irregular intensity samples into rainfall.

LoRa packets are deduplicated by `(devEui, fCnt)` within five minutes, bounded
to 1,000 entries. A later reused frame counter is accepted. Receipt timestamps
are bridge reception times, not guaranteed sensor sampling times.

## Meshtastic

Subscribe beneath `msh/#`. JSON packets have `type` (`nodeinfo`, `position`,
`telemetry`, `text`), `from`, optional `id`, and `payload`. Non-JSON/encrypted
protobuf packets are ignored. Packet IDs are scoped to the sender for dedup.

Positions accept decimal `latitude`/`longitude` (or `lat`/`lon`) and integer
`latitude_i`/`longitude_i` scaled by 1e7. Zero is valid. Invalid coordinates
are discarded. Position reception time is independent of general last-heard
time. Battery keys include `battery`, `batteryLevel`, `battery_level`, including
nested `device_metrics` / `deviceMetrics`; 0% is valid and 101 indicates external
power. `hops_away` is recorded when available; it does not establish topology.
Mesh node and message buffers are in memory and reset when the bridge restarts.
