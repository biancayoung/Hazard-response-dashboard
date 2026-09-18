# Operations design contract

Audience: people operating Algarve Fabfarm's environmental and mesh sensing.
The first question is what was observed and whether it is still recent enough
to investigate. A connected browser is not evidence of a safe environment.

## Direction A2: Cyber Field Terminal

A receive-only field instrument: observations dominate, source problems remain
visible, and reported coordinates provide context without implying coverage.

`ops.css` is the authoritative implementation of the shared palette: Atlantic
base, mineral panels, cyan observations, amber delay, iron-red silence/errors,
and a restrained violet interaction accent. Panels are matte and opaque, with
4–6 px corners and instrument dividers. No glow, glass, scan lines or animation
conveys status. Use text, symbols and reception times alongside color.

Locally bundled Barlow Condensed carries primary values (52–56 px); Barlow
carries panel titles (20–24 px) and body text (16 px); IBM Plex Mono carries
provenance; Noto Sans SC covers translated UI. Operational annotations are at
least 14 px at kiosk size. Font sources/licenses belong in `assets/fonts/README.md`.

The desktop header is 38 px. At 1920×1080 and 1440×900, all three operational
pages occupy one viewport. Excess lists, raw JSON and field cards scroll inside
bounded panels. At narrow mobile widths, panels stack with document scrolling.

```
Operations / Sensor details / System diagnostics       language / Lisbon time
Browser / Bridge or MQTT / feed mode / source problems
OPS: temperature | rain rate | soil moisture | CO2
+ Timestamped trend / wind rose (current wind lives with the rose)
+ Reported positions + Mesh nodes / received messages +
DATA: device list  | selected device / all decoded fields / dated trends
ADMIN: source health + LoRa / Mesh last seen, RSSI, SNR, received frames
       raw LoRa uplinks / filter / bounded list / pause display / expand JSON
```

The signature is a **reported-position field plot**. Only nodes with finite,
valid coordinates are positioned, with north up and equal spatial scale on both
axes. It is a local projection, not a surveyed map. Text and marker symbols show
position freshness separately from general last-heard time. No inferred edges,
property boundaries, signal coverage, sensor positions, gusts, daily rainfall,
alert counts or safety ratings are invented. Nodes without coordinates remain
inspectable in the communications list.

## Critique decisions

The old scan lines, neon corners, repeated gauges, unsubstantiated map pins and
inert Send control gave a theatrical console appearance without clarifying the
operational state. Replace them with a quiet information hierarchy; reserve the
bold treatment for the spatial observation plot and large environmental values.
Repeated metric cards do not each need a decorative sparkline. Use one properly
labelled historical plot, a clear time window and a keyboard-accessible table.

The live view never displays fixture values unless the backend explicitly runs
in demo mode. State names, symbols, ages and explanations carry meaning in both
English and Chinese. Color is supplementary. Charts use raw timestamped samples,
preserve outages and label units; no smoothing hides spikes. Downsampling is
owned by the backend and preserves the latest observation.

## Interaction and resilience

- Current-value buttons open native modal dialogs with unit, source ID, reception
  time, related fields and timestamped history. Escape closes and focus returns.
- Nodes can be selected using the list or keyboard-operable position markers.
  Source lists prioritize silent/delayed observations above recent ones.
- Browser transport, broker connection and source freshness remain independent.
  Failed API refreshes retain the last received values with explicit notices;
  ages continue to advance. WebSockets reconnect with bounded exponential delay,
  and the operations page also polls every 30 seconds.
- No automatic motion conveys status. Focus outlines remain visible and reduced
  motion is respected. Long message/source lists scroll without trapping the
  whole page. At 1920×1080 the workspace uses the available viewport; narrower
  screens stack panels and allow document scrolling.
- Receive-only mesh messages escape external text, preserve reading position,
  and do not offer a Send control that cannot work.

Gemini 3.8 review was unavailable in the session's tool/config catalog. The
initial plan and browser iteration were reviewed directly against these rules.

The legacy A source remains `b.html`; `dashboard-a.html` is generated. Historical
prototype briefs are retained for context but do not override this contract.
