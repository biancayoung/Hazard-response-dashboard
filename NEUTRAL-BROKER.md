# Farm data over a neutral broker — for Bianca's machine and the Seeed machine

## What changes, and why

Until now your WSL machine received the farm's MQTT because the farm pushed straight into your
broker over Tailscale. That works while your machine is the only consumer, but it does not survive
the real goal: the dashboard is going to live on the machine at Seeed, behind the office network in
Shenzhen. That machine has no public address and no forwarded port, so the farm cannot push into it,
and the farm will not open its own network to let anything in.

So we stop trying to make either side reachable. **Both sides become clients of a broker that sits in
neutral ground, and both connect outbound.** Nobody opens a port. Nobody joins anyone else's VPN. It
works from China because outbound connections out of the office are not the problem.

```
   FARM (Portugal)                NEUTRAL BROKER                YOUR SIDE
   Jetson relay  ────outbound───▶  test.mosquitto.org  ◀───outbound────  WSL / Seeed machine
   (publishes)                        (TLS 8886)                          (subscribes)
```

The farm side is already built and is **send only**: its bridge has no subscribe rules at all, so
nothing can travel back into the farm network, by construction rather than by trust.

## How to receive

You do not pull. You subscribe, and messages arrive as they happen.

```
Host:   test.mosquitto.org
Port:   8886          (TLS, ordinary public certificate, validate with the system CA store)
Auth:   none          (this broker is public — see the warning below)
Topic:  fabfarm-45jexzbx/#
```

Quick check from a terminal on either machine:

```bash
mosquitto_sub -h test.mosquitto.org -p 8886 --capath /etc/ssl/certs -v -t 'fabfarm-45jexzbx/#'
```

In code, any MQTT library works the same way. Python example:

```python
import paho.mqtt.client as mqtt, ssl, json

def on_connect(c, u, f, rc, props=None):
    c.subscribe("fabfarm-45jexzbx/#")

def on_message(c, u, msg):
    print(msg.topic, json.loads(msg.payload))

c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
c.tls_set(cert_reqs=ssl.CERT_REQUIRED)      # validates against the system CA store
c.on_connect, c.on_message = on_connect, on_message
c.connect("test.mosquitto.org", 8886, 60)
c.loop_forever()
```

The same host, port and topic work for both machines at once. Two subscribers do not interfere: MQTT
delivers a copy to each.

## What arrives

Everything keeps the farm's original topic shape, with the prefix in front.

### LoRaWAN sensors

`fabfarm-45jexzbx/application/41c42aae-a84e-4ad8-a2a3-d017b3c4e8b4/device/<DEV_EUI>/event/up`

One JSON per uplink. Useful fields: `deduplicationId`, `time` (ISO 8601 UTC), `deviceInfo`
(`deviceName`, `devEui`), `fCnt`, `rxInfo[].rssi` and `.snr`, and `object` with the decoded payload.

`object.messages` for the SenseCAP S2100 dataloggers is a **list of lists** — flatten it first, then
map each `measurementId`:

| DEV_EUI | device | channels |
|---|---|---|
| `2cf7f1c07320007c` | Weather station S1000 | 1 air temp °C, 2 humidity %, 3 pressure in Pa (divide by 100 for hPa), 4 wind direction °, 5 wind speed m/s, 6 light lux, 7 rain mm/h, 8 PM2.5, 9 PM10, 10 CO2 ppm |
| `2cf7f1c07320007a` | Greenhouse CO2 | 1 CO2 ppm (reads 0 — sensor warm-up problem at the farm, not a data problem), 2 air temp °C, 3 humidity % |
| `2cf7f1c072600206` | Soil sensor, açaí palm | 4102 soil temp °C, 4103 soil moisture %, 4108 EC dS/m — flat list, type `report_telemetry` |
| `2cf7f1c07320007d` | Water quality | 1–4 raw probe channels (1 ≈ water temp °C) |
| `2cf7f1c073200079` | Lake level | 1 = raw level (silent since 26 Aug) |
| `2cf7f1c0719001cd` | T1000 chicken tracker | entries carry `type` strings: `Latitude`, `Longitude`, `Air Temperature`, `Light`, `Battery` (silent since 23 Aug) |

Some frames carry no measurements at all (`upload_sensor_id`, `upload_version`, `upload_battery`,
`upload_interval`) — skip those for charts. A device may split one report across two consecutive
uplinks, so merge by `devEui` and keep the last value per channel.

### Meshtastic

`fabfarm-45jexzbx/msh/2/json/LongFast/!<gateway>` — JSON, one object per mesh packet, with `from`,
`id`, `type` (`nodeinfo`, `position`, `telemetry`, `text`), `payload`, `rssi`, `snr`.
`fabfarm-45jexzbx/msh/2/e/LongFast/!<gateway>` — the same packets as encrypted protobuf. Ignore
unless you decode Meshtastic protobufs.

## Three things that will bite you if you skip them

**1. Deduplicate.** Two gateways at the farm hear the same radio packet, so most messages arrive
twice, once per gateway. Deduplicate on `deduplicationId` for LoRaWAN, and on `id` for Meshtastic.
The copies are not identical: each carries its own `rssi` and `snr`, which is useful if you want
link quality.

**2. Nothing is retained.** The broker holds no history. A dashboard that has just started sees an
empty screen until the next message arrives, and the sensors only report **once per hour**. Store the
last value of each measurement on your side and render from that store, not straight from the wire.

**3. The public broker is public.** `test.mosquitto.org` has no authentication. Anyone who learns
the prefix `fabfarm-45jexzbx` can read the same stream. For that reason the farm deliberately does
**not** send the private Meshtastic channel there — only the sensors and the public LongFast channel,
which is already open over the air anyway. Please do not put the prefix in a public repository, a
ticket or a chat group.

## When the test is over

This is a test arrangement, chosen because it needs no account, no signup and no VPN on either side.
For the real deployment we move to an authenticated broker: HiveMQ Cloud or EMQX Cloud (both have a
free tier with username and password), or a small VPS running mosquitto. **Nothing in your code
changes except the host, the port and the credentials** — the topics and the payloads stay exactly as
described here. At that point the farm can also send the private Meshtastic channel, because the
stream stops being world readable.

## What is not in this document, on purpose

No credentials of any kind. The farm's own broker accounts, the Home Assistant tokens and the
Meshtastic channel keys stay at the farm and are not needed to consume this stream.

## If data stops arriving

Ask the farm side to check the bridge named `to-neutro` in the relay container `mqtt-relay-ptfarm`
on the Jetson. A quick way to tell whether the problem is the farm or your side: subscribe to the
same topic from a different machine or network. If that one also sees nothing, it is the farm.
