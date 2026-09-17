# Outbound relay architecture

Both the farm relay (publisher) and the dashboard bridge (subscriber) connect
outbound to a broker. The dashboard does not need inbound connectivity to the
farm. The relay must be configured separately by its operator.

```
farm relay -> authenticated MQTT broker <- dashboard bridge -> browsers
```

Use a private, authenticated TLS broker for production. Supply host, port,
username, password, CA bundle when needed, and topic prefix through a private
environment file. The template and service procedure live in README.md;
payload shapes live in DATA-SPEC.md.

Prefixes are namespaces, not authorization. Public test brokers do not isolate
sensor data or mesh conversation. Use an isolated test namespace for simulation;
never run the publisher simulator against the production namespace.

The dashboard subscribes to `<prefix>application/+/device/+/event/up` and
`<prefix>msh/#`. Include a trailing slash in a nonempty prefix. The bridge strips
the prefix before routing. Keep topic prefixes and broker configuration out of
tracked files. Verify TLS certificates and hostnames; `--mqtt-insecure` remains
a legacy diagnostic option, not a production recommendation.

If the stream stops, compare the browser connection, broker connection and
per-source ages in Operations. A connected socket does not prove the farm relay
is sending. Check broker subscriptions and the relay through the authorized
operator; hourly sensors should not be labelled offline after a few seconds.
