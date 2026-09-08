# Farm screen "Portugal" — design contract (read fully before writing any HTML)

## What this is
A kiosk dashboard (16:9 screen, 1366×768 and up) showing live data from the farm in Portugal
(Sítio das Aguilhadas, Lagos): a SenseCAP weather station and soil nodes (LoRa, via the SenseCAP M2
gateway on the Jetson) plus a Meshtastic mesh chat. Layout comes from Lucio's paper sketch; the colour
palette comes from a photo of a Seeed rugged-case screen. **Layout only, no live logic**: mock values,
but every live value is tagged with `data-src` so the feed can be wired later.

`a.html` is the finished reference prototype (variant A). Open it, read its CSS/JS, reuse its
tokens, its clock code, its mock arrays and its copy. Your variant must read as the same family.

## Layout (from the sketch) — mandatory structure, same order, same content
```
| [Live] Portugal   Sítio das Aguilhadas · Lagos                      18:04   Tue 8 Sep · Lisbon time |
| Weather station                                                                                      |
| [CO2 412 ppm]   [Wind 3.4 m/s]   [Temperature 26.4 °C]        [Rain history: 24 h chart, 4.2 mm]    |
| Sensor nodes                                                                                         |
| [Soil · garden: gauge 19.6°, moisture 47%]   [Map: map.svg inline]   [Chat · Mesh: messages + input] |
```
- Header: green "Live" badge, h1 "Portugal", place, clock in Lisbon time (copy the Intl code from a.html).
- Section "Weather station": three readouts CO2 / Wind / Temperature, then "Rain history" on the right.
- Section "Sensor nodes": soil (temperature gauge + moisture), map (inline the whole `map.svg` verbatim,
  it has `aria-label="Map of ..."`), chat (message list + "Message the mesh…" input + Send).
- Whole screen fits 1366×768 **without scrolling** (body grid `height:100%`), and stacks to a single
  column under 900 px.

## Tokens (same in every variant)
```
--bg:#141d28  --bg-2:#1a2634  --tile:#1f2c3b  --tile-2:#25334a  --line:#2f4157
--ink:#f2f6fa  --muted:#8fa3b8  --dim:#5f7389
--teal:#3ec8d2 (icons, soil)   --blue:#3d8ef0 (rain chart)   --mint:#7be0a8 (Live badge, mesh)   --amber:#f0b45a (warnings only)
```
Font: Google Fonts `Barlow` (400/500/600) for text and `Barlow Semi Condensed` (500/600) for numerals
(`font-variant-numeric:tabular-nums`), fallback system-ui. Values white, labels muted, icons teal.

## data-src keys (mandatory, exact strings)
`weather.co2` `weather.wind` `weather.wind_dir` `weather.temp` `weather.hum` `weather.rain_24h`
`soil.temp` `soil.hum` `mesh.msgs` `mesh.nodes`  — put them on the element that will receive the value.

## Mock data (use the same numbers as a.html so the variants compare fairly)
CO2 412 ppm "good" · wind 3.4 m/s NW gusts 6.1 · temp 26.4 °C 58% RH · rain 24 h array in a.html (4.2 mm)
· soil garden 19.6 °C, moisture 47%, node S1 last seen 2 min, 3.9 V · mesh: 5 nodes, the 6 messages in a.html.

## Rules
1. One self-contained HTML file. Inline CSS, inline JS, inline SVG. No external libraries, no images,
   no `<img>`, no URLs except fonts.googleapis.com / fonts.gstatic.com.
2. Charts are SVG drawn by your inline JS from the mock arrays (see a.html). Rain chart needs a hover
   tooltip (crosshair or per-bar) like a.html. Marks: 2 px lines, bars with 2 px gaps and rounded tops.
3. Copy: sentence case. No ALL-CAPS labels (no `text-transform:uppercase`), no em dashes, no emoji,
   no numbered "01/02/03" markers. Plain words: "Rain history", "Soil · garden", "Chat · Mesh".
4. Keep the tokens and the structure; spend your difference on density, proportions and chart form
   as your PROMPT file says. Do not invent extra sections.
5. Validate with `python3 check.py <file>` — it must print `OK <file>`. Commit only if it passes.
