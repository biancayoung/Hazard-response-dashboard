# The mesh simulator

The farm's Meshtastic mesh is quiet for hours at a time, and the LoRaWAN sensors
only speak once an hour. A dashboard built against that is a dashboard built
against a blank screen. So a small service invents a full day of farm life and
publishes it, on a loop, straight to the brokers the real data goes to.

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

## What happens after you push

The farm fetches `falas.txt` every ten minutes. Before it replaces the running
copy it parses it; if the file is broken the old one stays and the mesh keeps
talking. The service does not restart and nothing is interrupted.

A malformed line is skipped with a warning rather than taken as an error, and a
line from a node that is not in `[nos]` is dropped with a note saying so. You
cannot break the farm by writing a bad line — the worst case is that your line
does not appear.

To check a file before pushing: `python3 meshsim.py --verifica falas.txt`.

## Where it runs

`meshsim` (systemd) on the Jetson at the farm. It publishes to the Seeed EMQX
broker under `fabfarm/msh/2/json/LongFast/!51000001` and to the public test
broker under its own prefix. It never publishes into the farm's own broker:
invented data does not enter the house.
