Task: build prototype C ("Console") of the farm screen. Work alone, do not ask questions, do not stop
for confirmation. Read DESIGN.md and a.html first, fully. Reuse a.html's CSS tokens, clock code,
gauge arc code, tooltip style and mock arrays; do not invent a new look.

## C = "Console": dense, more data on the same sketch
Same sections, tokens, data-src keys and mock data as a.html, but:
1. Weather readouts keep the `--tile` box but each one carries, under the number: a 24-point sparkline
   (inline SVG polyline, stroke `--muted` at 70% opacity, 2 px, height 34 px, no axes) and a secondary
   line. CO2: "24 h avg 405 · trend flat". Wind: "NW · gusts 6.1 m/s". Temperature: "58% RH · 1014 hPa".
   Numerals `clamp(30px, 3.4vw, 46px)`, icon teal 26 px top-left as in a.html.
2. Rain history: two charts stacked in the same panel. Top: seven daily bars (Mon..Sun, mm, `--blue`, 2 px
   gaps, rounded tops, value label only on the tallest bar). Bottom: the 24 hourly bars, thinner. Title row:
   "Rain history" + "4.2 mm last 24 h · 11.8 mm this week". Hover tooltip on bars like a.html.
3. Soil panel shows THREE nodes as rows (garden 19.6° 47%, orchard 21.2° 33%, greenhouse 24.8° 61%),
   each row: a small arc gauge (60 px, reuse the arc code, teal), the temperature as the number inside,
   moisture bar to the right with the percentage, and "last seen" in `--dim` under the name. Panel title
   "Soil nodes". Put `data-src="soil.temp"` and `data-src="soil.hum"` on the garden row values.
4. Map: inline `map.svg` verbatim in a `--tile` panel like a.html (legend under the title, top-left).
5. Chat: above the message list add a node strip: five chips (house 0 hops, gate 1, treehouse 2, orchard 1,
   garden 1), mint dot + name + hops in `--dim`, in one horizontally scrollable row. Then messages as
   bubbles like a.html, then the input row.
6. Grid: both sections the same height (`grid-template-rows:auto 1fr 1fr`). Sensor nodes columns
   `1.15fr 1.55fr 1.3fr`.
7. File: `c.html`, `<title>Portugal · farm screen · C</title>`.

## Mechanism you must use / must not use
- MUST: inline `<svg>` drawn by inline JS from arrays, like a.html. CSS grid for layout.
- MUST NOT: canvas, any chart library, `<img>`, external scripts, `text-transform:uppercase`, em dashes, emoji.

## Files you may touch
`c.html` (new). Nothing else. Do NOT edit a.html, map.svg, DESIGN.md, check.py, index.html, b.html.

## Validate (literal)
```
python3 check.py c.html
```
Must print `OK c.html`. Fix until it does. Then:
```
git add c.html && git commit -m "feat: prototype C console"
```
Commit as soon as it passes; the machine may reboot without warning. Report the check output you saw.
