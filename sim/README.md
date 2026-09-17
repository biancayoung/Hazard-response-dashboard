# The mesh simulator

The farm's Meshtastic mesh is quiet for hours at a time, and the LoRaWAN sensors
only speak once an hour. A dashboard built against that is a dashboard built
against a blank screen. So a small service invents a full day of farm life and
can publish it, on a loop, to an explicitly configured isolated test broker.

It is never mistaken for real traffic: every node is called `SIM ...` and the
gateway is `!51000001`, which does not exist.

## Changing what the mesh says

Everything you would want to change lives in **`falas.txt`**. Nothing in
`meshsim.py` needs touching to change the tone, the names, or the day.

The file has three sections and one rule: fields are separated by `|`.

```
[nos]
casa | 1361000001 | SCsa | SIM Casa | rede | nao | 43
```
The nodes: key, node number, short name, the name that shows on a dashboard,
power source (`rede` never drops, `solar` follows the sun, `pilha` only falls),
whether it moves around the property, and the Meshtastic hardware model.

```
[conversa]
6.6 | casa | bom dia. vou abrir a rega do talhao de cima
```
The day's conversation. The hour is decimal on the real clock, so `6.6` is
06:36. A line is only ever said within two and a half hours of its hour, which
is what keeps irrigation talk in the morning and shutting the hens at night.

```
[soltas]
casa | ligaste a bomba do tanque?
```
Loose lines with no hour, so there is always something new once the day's lines
run out.

Write without accents — that is what the radios display cleanly.

## Local preview and optional publishing

Prefer `python3 bridge.py --demo` from the project root. It exercises the bridge
with synthetic data without any broker or filesystem database.

`meshsim.py` is a separate publisher and refuses to publish unless
`SIM_ALLOW_PUBLISH=1` is explicitly set. Configure `SIM_HOST`, `SIM_PORT`,
`SIM_PREFIX`, `SIM_USER`, `SIM_PASSWORD`, and optional `SIM_CAFILE` privately.
Use an isolated, authenticated TLS test broker and a namespace distinct from
production. There are no embedded credentials or automatic multi-broker targets.
Default coordinates are synthetic. Never treat simulator node names as proof
that traffic cannot affect production: the operator must isolate the broker.

Validate the script data without publishing:

```sh
.venv/bin/python sim/meshsim.py --verifica sim/falas.txt
```

The `falas.txt` file is read again when it changes. Repository changes do not
implicitly authorize copying to a target or restarting any service.
