#!/usr/bin/env python3
"""Gate for farm-screen prototypes.  usage: python3 check.py <file.html> [--hub]"""
import re, sys, subprocess, tempfile, os
f = sys.argv[1]; hub = '--hub' in sys.argv
def fail(m): print('FAIL:', m); sys.exit(1)
if not os.path.exists(f): fail(f + ' missing')
s = open(f, encoding='utf-8').read()
if '<script src=' in s: fail('external script tag (inline JS only)')
for u in re.findall(r'https?://[^"\' )>]+', s):
    if not re.match(r'https://fonts\.(googleapis|gstatic)\.com', u): fail('external URL not allowed: ' + u)
if '<img' in s: fail('img tag (inline SVG only)')
if '—' in s: fail('em dash present')
if re.search('[\U0001F300-\U0001FAFF☀-➿]', s): fail('emoji present')
if len(s.encode()) > 90000: fail('file over 90 KB')
for i, js in enumerate(re.findall(r'<script[^>]*>(.*?)</script>', s, re.S)):
    p = tempfile.NamedTemporaryFile('w', suffix='.js', delete=False); p.write(js); p.close()
    r = subprocess.run(['node', '--check', p.name], capture_output=True, text=True)
    if r.returncode: fail('inline script %d syntax: %s' % (i, r.stderr.strip()[:300]))
if not hub:
    for k in ['weather.co2','weather.wind','weather.temp','weather.rain_24h','soil.temp','soil.hum','mesh.msgs','mesh.nodes']:
        if 'data-src="%s"' % k not in s: fail('missing data-src="%s"' % k)
    if 'aria-label="Map of' not in s: fail('map.svg not inlined verbatim')
    if 'Europe/Lisbon' not in s: fail('clock must use Europe/Lisbon')
    if 'Barlow' not in s: fail('Barlow font missing')
    for bad in ['text-transform:uppercase', 'text-transform: uppercase']:
        if bad in s: fail('no uppercase labels')
print('OK', f)
