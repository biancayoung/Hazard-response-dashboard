Task: build prototype B ("Field panel") of the farm screen, plus the hub page. Work alone, do not ask
questions, do not stop for confirmation. Read DESIGN.md and a.html first, fully.

## B = "Field panel": boxless, big numerals, bars
Same sections, tokens, data-src keys and mock data as a.html, but:
1. No tile boxes. Readouts sit directly on the background, separated by 1 px hairlines (`var(--line)`),
   vertical between the three weather readouts and horizontal between the two sections.
2. Numerals much bigger: `clamp(64px, 7.5vw, 112px)`, weight 600, Barlow Semi Condensed, unit small and
   muted beside them. Icon (teal, 22 px) sits inline before the label, under the number, not above.
3. Rain history = 24 vertical bars (one per hour, `--blue`, 2 px gap, 3 px rounded top, baseline line at
   the bottom), total "4.2 mm last 24 h" as a big number on the left of the chart title row. Hover on a bar
   shows a tooltip "0.6 mm · 19 h ago" (same tooltip style as a.html).
4. Sensor nodes row: map dominant. Grid columns `1fr 2fr 1.2fr` (soil / map / chat). Map keeps its own
   panel with the `--tile` background and radius so the contour lines stay readable; soil and chat are boxless
   with the hairline separators. Soil gauge like a.html (reuse the arc code) but with the moisture as a
   second, thinner arc inside the temperature arc, and a legend line under it "Temperature 19.6° · Moisture 47%".
5. Chat: messages as plain rows (no bubbles): mint sender name, muted time, message on the next line,
   hairline between rows; input row at the bottom with a mint Send button.
6. Header: clock left of the date, bigger (64 px). Keep the Live badge, "Portugal", place.
7. File: `b.html`, `<title>Portugal · farm screen · B</title>`.

## Hub page `index.html`
A short page in the same palette and font listing the three prototypes so Lucio can pick on his phone:
- h1 "Farm screen · prototypes", one line "Same sketch, same palette, three treatments. Open each in landscape."
- Three link rows (a.html, b.html, c.html), each: letter + name + one sentence on what differs:
  A "Vitrine" = tiles with icons and a gradient area chart, closest to the Seeed case photo.
  B "Field panel" = boxless, big numerals, bar chart, map dominant.
  C "Console" = dense: sparklines in every readout, seven-day rain, three soil nodes, node strip over the chat.
- Nothing else. No JS needed. c.html may not exist yet; link it anyway.

## Files you may touch
`b.html` (new), `index.html` (new). Nothing else. Do NOT edit a.html, map.svg, DESIGN.md, check.py.

## Validate (literal)
```
python3 check.py b.html
python3 check.py index.html --hub
```
Both must print `OK ...`. Fix until they do. Then:
```
git add b.html index.html && git commit -m "feat: prototype B field panel + hub page"
```
Commit early: commit b.html alone as soon as it passes, then the hub. The machine may reboot without
warning. Report which check output you actually saw.
