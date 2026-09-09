# Prompt for the farm-wsl agent (MQTT feed from the farm)

Context for you: the farm side (Jetson at the quinta, Tailscale 100.87.135.92) now forwards its LoRaWAN sensor data to YOUR mosquitto broker on farm-wsl (100.114.59.2:1883, user `ptfarmdata`, password `pt123farmdata!`). The forwarder is a mosquitto bridge called `fabfarm-relay`; it connected the moment you changed the password and it reconnects on its own. Nothing on the farm's Home Assistant broker was changed. Below is exactly what arrives, so you can build the dashboard/ingestion.

## What you receive

Topics (identical to the farm's ChirpStack v4 topics, no prefix, QoS 0, not retained):

- `application/41c42aae-a84e-4ad8-a2a3-d017b3c4e8b4/device/<DEV_EUI>/event/up` — one JSON per uplink (this is the data you want)
- `.../event/status` — device status (`batteryLevel`, margin), sent by ChirpStack when the device answers a status request
- `.../event/join`, `.../event/log` — join notifications and log/error events (e.g. "Invalid DevNonce")
- `msh/#` — reserved for Meshtastic. Nothing is published there yet; it will appear later without any change on your side.

You will NOT receive `application/.../command/down` (farm-internal downlink commands are filtered out).

Two LoRa gateways/servers at the farm hear the same sensors, so the same uplink can arrive twice. Deduplicate on `deduplicationId` (same value in both copies) or on `(devEui, fCnt)`.

Quick check: `mosquitto_sub -h 127.0.0.1 -u ptfarmdata -P 'pt123farmdata!' -v -t 'application/+/device/+/event/up'`. Sensors report roughly once per hour, so wait for the next hour mark.

## Uplink JSON shape (ChirpStack v4)

Top-level keys: `deduplicationId`, `time` (ISO 8601 UTC), `deviceInfo` (`deviceName`, `devEui`, `applicationName`, `deviceProfileName`, `tenantName`), `devAddr`, `adr`, `dr`, `fCnt`, `fPort`, `confirmed`, `data` (base64 raw), `rxInfo[]` (per gateway: `gatewayId`, `rssi`, `snr`), `txInfo`, `object` (decoded payload).

`object` for the SenseCAP S2100 dataloggers: `{"messages": [[{"measurementId": 1.0, "measurementValue": 22.84, "type": "Measurement"}, ...], [...]], "valid": true, "err": 0.0, "payload": "..."}`. Note `messages` is a LIST OF LISTS: flatten it, then map `measurementId` → meaning per device below. A device may split one report across two consecutive uplinks (e.g. channels 1–8, then 9–10), so merge by `devEui` and keep the last value per channel.

Some frames carry no measurements at all (device info: `upload_sensor_id`, `upload_version`, `upload_battery`, `upload_interval`) — ignore those for charts.

## Devices (DEV_EUI → meaning of measurementId)

1. `2cf7f1c07320007c` — Weather Station S1000 (via S2100 datalogger). Channels: 1 air temperature °C, 2 humidity %, 3 barometric pressure in Pa (divide by 100 for hPa), 4 wind direction ° (average), 5 wind speed m/s (average), 6 light lux, 7 rain intensity mm/h, 8 PM2.5 µg/m³, 9 PM10 µg/m³, 10 CO2 ppm. Hourly, in two frames.
2. `2cf7f1c07320007a` — Greenhouse CO2/temp/humidity (S-CO2-03 via S2100). Channels: 1 CO2 ppm (currently reads 0 — sensor warm-up problem at the farm, not a data issue), 2 air temperature °C, 3 humidity %.
3. `2cf7f1c072600206` — Soil sensor at the açaí palm (S2105, SenseCAP native). measurementId 4102 soil temperature °C, 4103 soil moisture %, 4108 soil EC dS/m. Type is `report_telemetry`, flat list. Hourly.
4. `2cf7f1c07320007d` — Water Quality (Datalogger 02, RS485 probe). Channels 1–4 raw probe channels (1 ≈ water temperature °C; 2–4 currently 0). Hourly.
5. `2cf7f1c073200079` — Lake level (Liquid Level Pressure Sensor via S2100). Channel 1 = level, raw analog value (negative small numbers when the probe is out of water). Silent since 26 Aug.
6. `2cf7f1c0719001cd` — T1000 chicken tracker (SenseCAP T1000). `object.messages` entries have `type` strings: `Latitude` (4198), `Longitude` (4197), `Air Temperature` (4097), `Light` (4199), `Battery` (3000), `Event Status` (4200), each with `timestamp` in ms. Silent since 23 Aug (battery/off).

`rxInfo[0].rssi` and `rxInfo[0].snr` give link quality. `deviceInfo.deviceName` is human readable if you prefer names over EUIs.

## Meshtastic (later)

When the farm's Meshtastic node is put on MQTT you will get standard Meshtastic MQTT topics under `msh/...` (JSON enabled: `msh/<region>/2/json/<channel>/!<nodeid>` with `type` = `position`, `telemetry`, `text`, `nodeinfo`). Subscribe to `msh/#` now and it will just start flowing.

## If the feed stops

The relay retries by itself. If nothing arrives for more than ~2 hours, ask the farm side to check the Uptime Kuma monitor "Relay MQTT fabfarm -> ptfarmdata" on the Jetson (id 65) and the container `mqtt-relay-ptfarm` in `/data/stacks/chirpstack`.
