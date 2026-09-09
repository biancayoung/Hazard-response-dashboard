#!/usr/bin/env python3
"""Build live.html from a.html by injecting the live-data WebSocket client.

Usage: python3 build_live.py [src] [out]
Defaults: a.html -> live.html
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
src = ROOT / (sys.argv[1] if len(sys.argv) > 1 else "a.html")
out = ROOT / (sys.argv[2] if len(sys.argv) > 2 else "live.html")
client = (ROOT / "live-client.js").read_text(encoding="utf-8")

html = src.read_text(encoding="utf-8")
inject = "<script>\n" + client + "\n</script>\n</body>"
if "</body>" not in html:
    sys.exit("no </body> in " + str(src))
html = html.replace("</body>", inject, 1)
out.write_text(html, encoding="utf-8")
print("built", out.name, "from", src.name)
