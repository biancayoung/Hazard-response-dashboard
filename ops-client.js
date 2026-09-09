// OPS CONSOLE client: live feed + all visualizations.
(function () {
  'use strict';

  // ---------- i18n ----------
  var I18N = {
    en: { temp: 'Temperature', humidity: 'Humidity', wind: 'Wind', rain: 'Rain', pressure: 'Pressure', light: 'Light', soil: 'Soil', moisture: 'Moisture', log: 'Event log', trends: 'Environmental trends · 24 h', nominal: 'All systems nominal', raining: 'Raining', dry: 'Dry', lisbon: 'lisbon' },
    zh: { temp: '温度', humidity: '湿度', wind: '风', rain: '降雨', pressure: '气压', light: '光照', soil: '土壤', moisture: '湿度', log: '事件日志', trends: '环境趋势 · 24小时', nominal: '所有系统正常', raining: '下雨中', dry: '干燥', lisbon: '里斯本' }
  };
  var lang = localStorage.getItem('farm-lang') || 'en';
  var toggle = document.getElementById('langToggle');
  function applyLang() {
    var t = I18N[lang];
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n'); if (t[k] != null) el.textContent = t[k];
    });
    toggle.textContent = lang === 'en' ? '中文' : 'EN';
    document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
  }
  toggle.addEventListener('click', function () { lang = lang === 'en' ? 'zh' : 'en'; localStorage.setItem('farm-lang', lang); applyLang(); });

  // ---------- clock ----------
  var c = document.getElementById('clock'), d = document.getElementById('date');
  var ft = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function tick() {
    var n = new Date(); c.textContent = ft.format(n);
    var fd = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-GB', { timeZone: 'Europe/Lisbon', weekday: 'short', day: 'numeric', month: 'short' });
    d.textContent = fd.format(n) + ' · ' + I18N[lang].lisbon;
  }
  applyLang(); tick(); setInterval(tick, 1000);

  // ---------- state ----------
  var STATE = {};
  var SPARKS = {};

  // ---------- helpers ----------
  function $(s) { return document.querySelector(s); }
  function $all(s) { return document.querySelectorAll(s); }
  function setText(key, v) {
    $all('[data-src="' + key + '"]').forEach(function (el) {
      var u = el.querySelector('u');
      var s = fmt(key, v);
      if (s == null) return;
      if (u) el.firstChild.nodeValue = s; else el.textContent = s;
    });
  }
  function fmt(key, v) {
    if (v === null || v === undefined) return null;
    switch (key) {
      case 'weather.temp': return (+v).toFixed(1);
      case 'weather.co2': return Math.round(v);
      case 'weather.wind': return (+v).toFixed(1);
      case 'weather.hum': return Math.round(v);
      case 'weather.rain_24h': return (+v).toFixed(1);
      case 'weather.pressure': return Math.round(v / 100);
      case 'weather.light': return (v >= 1000 ? (v / 1000).toFixed(1) : Math.round(v));
      case 'weather.pm25': case 'weather.pm10': return Math.round(v);
      case 'soil.temp': return (+v).toFixed(1);
      case 'soil.hum': return Math.round(v);
      case 'soil.ec': return (+v).toFixed(1);
      default: return String(v);
    }
  }

  // ---------- gauge (semicircular arc) ----------
  // draw a 240-degree arc gauge into the given svg, value in [lo,hi]
  function drawGauge(svg, val, lo, hi, unit, colorFn) {
    var a0 = -210, a1 = 30, cx = 100, cy = 105;
    function P(a, r) { var k = a * Math.PI / 180; return [cx + r * Math.cos(k), cy + r * Math.sin(k)]; }
    function arc(s, e, r) { var A = P(s, r), B = P(e, r); return 'M' + A[0] + ' ' + A[1] + 'A' + r + ' ' + r + ' 0 ' + (e - s > 180 ? 1 : 0) + ' 1 ' + B[0] + ' ' + B[1]; }
    if (val == null || isNaN(val)) { svg.innerHTML = '<text x="100" y="100" font-size="12" fill="#5b7186" text-anchor="middle">no data</text>'; return; }
    var frac = Math.max(0, Math.min(1, (val - lo) / (hi - lo)));
    var av = a0 + (a1 - a0) * frac;
    var col = colorFn ? colorFn(frac, val) : '#33e0ff';
    var ticks = '';
    for (var i = 0; i <= 4; i++) { var a = a0 + (a1 - a0) * i / 4, A = P(a, 90), B = P(a, 95), L = P(a, 106), vv = Math.round(lo + (hi - lo) * i / 4);
      ticks += '<line x1="' + A[0] + '" y1="' + A[1] + '" x2="' + B[0] + '" y2="' + B[1] + '" stroke="#2e455f" stroke-width="1.5"/><text x="' + L[0] + '" y="' + (L[1] + 3) + '" font-size="9" fill="#5b7186" text-anchor="middle">' + vv + '</text>'; }
    svg.innerHTML =
      '<path d="' + arc(a0, a1, 80) + '" fill="none" stroke="#16222f" stroke-width="13" stroke-linecap="round"/>' +
      '<path d="' + arc(a0, av, 80) + '" fill="none" stroke="' + col + '" stroke-width="13" stroke-linecap="round" style="filter:drop-shadow(0 0 6px ' + col + ')"/>' +
      ticks +
      '<text x="100" y="98" text-anchor="middle" font-size="34" font-weight="700" fill="#eef4fa" font-family="Barlow Semi Condensed">' + (+val).toFixed(unit === '°' ? 1 : 0) + '<tspan font-size="14" fill="#8fa3b8">' + unit + '</tspan></text>';
  }

  // ---------- sparkline (smooth, gradient) ----------
  function drawSpark(el, series, color) {
    if (!series || series.length < 2) { el.innerHTML = '<svg viewBox="0 0 100 40"><text x="50" y="24" font-size="9" fill="#3a4a5c" text-anchor="middle">collecting</text></svg>'; return; }
    color = color || '#33e0ff';
    var W = 100, H = 40, vs = series.map(function (p) { return p[1]; }), n = series.length;
    var min = Math.min.apply(null, vs), max = Math.max.apply(null, vs), rng = (max - min) || 1;
    var pts = series.map(function (p, i) { return [i * (W / (n - 1)), H - 4 - ((p[1] - min) / rng) * (H - 10)]; });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var last = pts[pts.length - 1];
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="sg' + color.slice(1) + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".4"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + line + ' L' + W + ' ' + H + ' L0 ' + H + 'Z" fill="url(#sg' + color.slice(1) + ')"/>' +
      '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.2" fill="' + color + '"/></svg>';
  }

  // ---------- wind rose (professional, 16 dir, legend) ----------
  var SECTORS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  var SPEED_BINS = [[0, '#a3e635'], [2, '#39ff9c'], [4, '#34d399'], [6, '#22d3ee'], [8, '#4d9fff'], [10, '#818cf8'], [12, '#b78bff']];
  var BIN_LABELS = ['0-2', '2-4', '4-6', '6-8', '8-10', '10-12', '12+'];
  var CURRENT_DIR = null;
  function polar(cx, cy, r, deg) { var a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function wedge(cx, cy, r0, r1, a0, a1) {
    var p0 = polar(cx, cy, r1, a0), p1 = polar(cx, cy, r1, a1), p2 = polar(cx, cy, r0, a1), p3 = polar(cx, cy, r0, a0), large = (a1 - a0) > 180 ? 1 : 0;
    return 'M' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + 'A' + r1 + ' ' + r1 + ' 0 ' + large + ' 1 ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + 'L' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) + 'A' + r0 + ' ' + r0 + ' 0 ' + large + ' 0 ' + p3[0].toFixed(1) + ' ' + p3[1].toFixed(1) + 'Z';
  }
  function drawRose(points) {
    var rose = $('#windrose'); if (!rose) return;
    var CX = 60, CY = 60, RMAX = 52, SECT = 22.5;
    var bins = SECTORS.map(function () { return {}; }), total = 0;
    points.forEach(function (p) { var spd = p[1], dir = p[2]; if (spd == null || dir == null) return; total++;
      var si = Math.round(((dir % 360) + 360) % 360 / SECT) % 16, bi = 0;
      for (var i = 0; i < SPEED_BINS.length; i++) if (spd >= SPEED_BINS[i][0]) bi = i;
      bins[si][bi] = (bins[si][bi] || 0) + 1; });
    var maxSector = 0; bins.forEach(function (s) { var t = 0; for (var k in s) t += s[k]; if (t > maxSector) maxSector = t; });
    var inner = '';
    for (var f = 1; f <= 4; f++) { var frac = f / 4, r = RMAX * frac;
      inner += '<circle cx="' + CX + '" cy="' + CY + '" r="' + r + '" fill="none" stroke="#22344a" stroke-width="1"/>'; }
    for (var i = 0; i < 16; i++) { var a = i * SECT, x1 = polar(CX, CY, RMAX, a - SECT / 2), lx = polar(CX, CY, RMAX + 11, a), maj = i % 4 === 0;
      inner += '<line x1="' + CX + '" y1="' + CY + '" x2="' + x1[0].toFixed(1) + '" y2="' + x1[1].toFixed(1) + '" stroke="#22344a" stroke-width="1"/>' +
        '<text x="' + lx[0].toFixed(1) + '" y="' + (lx[1] + 3).toFixed(1) + '" font-size="' + (maj ? 9.5 : 7) + '" font-weight="' + (maj ? 600 : 400) + '" fill="' + (maj ? '#c9d6e3' : '#5b7186') + '" text-anchor="middle">' + SECTORS[i] + '</text>'; }
    if (maxSector > 0) for (i = 0; i < 16; i++) { var a0 = i * SECT - SECT / 2, a1 = i * SECT + SECT / 2, r0 = 0;
      for (var b = 0; b < SPEED_BINS.length; b++) { var cnt = bins[i][b] || 0; if (!cnt) continue;
        var r1 = r0 + (cnt / maxSector) * RMAX;
        inner += '<path d="' + wedge(CX, CY, r0, r1, a0, a1) + '" fill="' + SPEED_BINS[b][1] + '" fill-opacity=".92" stroke="#0a0f16" stroke-width=".8"/>';
        r0 = r1; } }
    if (CURRENT_DIR != null) { var ax = polar(CX, CY, RMAX - 3, CURRENT_DIR), bx = polar(CX, CY, 8, CURRENT_DIR);
      inner += '<line x1="' + bx[0] + '" y1="' + bx[1] + '" x2="' + ax[0].toFixed(1) + '" y2="' + ax[1].toFixed(1) + '" stroke="#eef4fa" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="' + ax[0].toFixed(1) + '" cy="' + ax[1].toFixed(1) + '" r="3.5" fill="#eef4fa"/>'; }
    rose.innerHTML = inner + (total ? '' : '<text x="' + CX + '" y="' + CY + '" font-size="10" fill="#5b7186" text-anchor="middle">collecting</text>');
    var lg = $('#wlegend');
    if (lg) { var h = '<div class="cap">Wind m/s</div>';
      for (b = SPEED_BINS.length - 1; b >= 0; b--) h += '<div class="li"><i style="background:' + SPEED_BINS[b][1] + '"></i>' + BIN_LABELS[b] + '</div>';
      h += '<div class="note">% of time</div>'; lg.innerHTML = h; }
  }

  // ---------- event log ----------
  var LOG = [];
  function addLog(cls, m) {
    var t = new Date();
    var ts = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2) + ':' + ('0' + t.getSeconds()).slice(-2);
    LOG.unshift({ cls: cls, ts: ts, m: m }); if (LOG.length > 40) LOG.pop();
    var box = $('#log'); if (!box) return;
    box.innerHTML = LOG.map(function (e) { return '<div class="li ' + e.cls + '"><span class="t">' + e.ts + '</span><span class="m">' + e.m + '</span></div>'; }).join('');
  }

  // ---------- condition banner: compact chip, hidden when nominal ----------
  function updateBanner() {
    var b = $('#banner'), txt = $('#bannerText');
    var alerts = [];
    if (STATE['weather.temp'] != null && STATE['weather.temp'] >= 35) alerts.push('temp ' + Math.round(STATE['weather.temp']) + '°');
    if (STATE['weather.co2'] != null && STATE['weather.co2'] >= 1000) alerts.push('CO₂ ' + Math.round(STATE['weather.co2']));
    if (STATE['weather.wind'] != null && STATE['weather.wind'] >= 10) alerts.push('wind ' + STATE['weather.wind'].toFixed(0));
    if (alerts.length) { b.className = 'banner alert show'; txt.textContent = alerts.join(' · '); }
    else { b.className = 'banner'; }
  }

  // ---------- render all ----------
  function render() {
    setText('weather.temp', STATE['weather.temp']);
    setText('weather.co2', STATE['weather.co2']);
    setText('weather.wind', STATE['weather.wind']);
    setText('weather.rain_24h', STATE['weather.rain_24h']);
    setText('weather.pressure', STATE['weather.pressure']);
    setText('weather.light', STATE['weather.light']);
    setText('weather.pm25', STATE['weather.pm25']);
    setText('weather.pm10', STATE['weather.pm10']);
    setText('soil.hum', STATE['soil.hum']);
    setText('soil.ec', STATE['soil.ec']);
    // wind dir cardinal
    var wd = STATE['weather.wind_dir'];
    if (wd != null) { var names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
      setText('weather.wind_dir', names[Math.round(((wd % 360) + 360) % 360 / 22.5) % 16]); CURRENT_DIR = wd; }
    // gauges
    drawGauge($('#gHum'), STATE['weather.hum'], 0, 100, '%', function (f) { return f > 0.7 ? '#39ff9c' : (f > 0.4 ? '#39ff9c' : '#a3e635'); });
    drawGauge($('#gSoil'), STATE['soil.temp'], 0, 40, '°', function (f) { return f > 0.75 ? '#ff5d6c' : (f > 0.5 ? '#ffc24b' : '#39ff9c'); });
    // air quality bars
    setBar('#bPm25', STATE['weather.pm25'], 25); setBar('#bPm10', STATE['weather.pm10'], 50); setBar('#bCo2', STATE['weather.co2'], 1500);
    // rain status
    var rs = $('#rainStatus'), rv = STATE['weather.rain_24h'];
    if (rs && rv != null) rs.textContent = rv > 0.05 ? (I18N[lang].raining + ' · ' + rv.toFixed(1) + ' mm/h') : I18N[lang].dry;
    // sensors count
    var sc = $('#stSensors'); if (sc) sc.textContent = Object.keys(window.DEVICES || {}).length || '--';
    updateBanner();
  }
  function setBar(sel, v, max) { var el = $(sel); if (!el || v == null) return; el.style.width = Math.min(100, (v / max) * 100) + '%'; }

  function renderSparks() {
    $all('[data-spark]').forEach(function (el) {
      var key = el.getAttribute('data-spark');
      var colors = { 'weather.temp': '#ffc24b', 'weather.co2': '#4d9fff', 'weather.rain_24h': '#33e0ff', 'weather.pressure': '#b78bff', 'weather.light': '#facc15' };
      drawSpark(el, SPARKS[key], colors[key] || '#33e0ff');
    });
  }

  // ---------- data loading ----------
  function loadSparks() {
    fetch('/api/sparklines').then(function (r) { return r.json(); }).then(function (d) { SPARKS = d; renderSparks(); }).catch(function () {});
  }
  function loadWind() {
    fetch('/api/wind').then(function (r) { return r.json(); }).then(function (d) { var w = d.wind || []; if (w.length) CURRENT_DIR = w[w.length - 1][2]; drawRose(w); }).catch(function () {});
  }
  function loadDevices() {
    fetch('/api/raw').then(function (r) { return r.json(); }).then(function (d) {
      window.DEVICES = {}; (d.devices || []).forEach(function (x) { window.DEVICES[x.name] = 1; });
      var sc = $('#stSensors'); if (sc) sc.textContent = (d.devices || []).length || '--';
    }).catch(function () {});
  }

  // ---------- websocket ----------
  var retry = 3000;
  function connect() {
    var url = (location.protocol === 'https:' ? 'wss://' + location.host + '/ws' : 'ws://' + location.hostname + ':8765');
    var ws;
    try { ws = new WebSocket(url); } catch (e) { return setTimeout(connect, retry); }
    ws.onopen = function () { $('#stLink').textContent = 'live'; $('#stLink').style.color = 'var(--grn)'; $('#footStatus').textContent = 'telemetry link nominal'; $('#footStatus').className = 'ok'; addLog('sys', 'telemetry link established'); };
    ws.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.type === 'snapshot') { STATE = msg.data; render(); }
        else if (msg.type === 'update') {
          for (var k in msg.data) STATE[k] = msg.data[k];
          render();
          for (var k2 in msg.data) addLog('', k2 + ' = ' + fmt(k2, msg.data[k2]));
          loadSparks(); loadWind();
        }
      } catch (e) {}
    };
    ws.onclose = function () { $('#stLink').textContent = 'link down'; $('#stLink').style.color = 'var(--red)'; $('#footStatus').textContent = 'telemetry link lost · retrying'; $('#footStatus').className = 'alertC'; addLog('alert', 'telemetry link lost'); setTimeout(connect, retry); };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  // ---------- big trend charts (time-series with axis + stats) ----------
  function drawTrend(box, series, color, unit, scale) {
    var svg = box.querySelector('svg'), stats = box.querySelector('[data-stats]');
    scale = scale || 1;
    if (!series || series.length < 2) { svg.innerHTML = '<text x="150" y="60" font-size="11" fill="#3a4a5c" text-anchor="middle">collecting data</text>'; if (stats) stats.innerHTML = ''; return; }
    var W = 300, H = 110, padL = 8, padR = 8, padT = 10, padB = 18;
    var vs = series.map(function (p) { return p[1] * scale; }), ts = series.map(function (p) { return p[0]; }), n = series.length;
    var min = Math.min.apply(null, vs), max = Math.max.apply(null, vs), rng = (max - min) || 1;
    min -= rng * 0.08; max += rng * 0.08; rng = (max - min) || 1;
    var t0 = ts[0], t1 = ts[n - 1], trng = (t1 - t0) || 1;
    var pts = series.map(function (p, i) { return [padL + ((p[0] - t0) / trng) * (W - padL - padR), padT + ((max - p[1] * scale) / rng) * (H - padT - padB)]; });
    // smooth path (catmull-rom -> bezier)
    var line = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) { var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6, c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      line += 'C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1); }
    var last = pts[pts.length - 1], gid = 'tg' + color.slice(1);
    // gridlines (2 horizontal) + time labels (start/mid/end)
    var grid = '', gl;
    for (var g = 1; g <= 2; g++) { var gy = padT + (H - padT - padB) * g / 3; grid += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy + '" y2="' + gy + '" stroke="#22344a" stroke-width="1" stroke-dasharray="2 4"/>'; }
    function tl(t) { var d = new Date(t * 1000); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
    grid += '<text x="' + padL + '" y="' + (H - 4) + '" font-size="8" fill="#5b7186">' + tl(t0) + '</text>' +
      '<text x="' + (W / 2) + '" y="' + (H - 4) + '" font-size="8" fill="#5b7186" text-anchor="middle">' + tl((t0 + t1) / 2) + '</text>' +
      '<text x="' + (W - padR) + '" y="' + (H - 4) + '" font-size="8" fill="#5b7186" text-anchor="end">' + tl(t1) + '</text>';
    svg.innerHTML = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".35"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
      grid +
      '<path d="' + line + ' L' + last[0] + ' ' + (H - padB) + ' L' + pts[0][0] + ' ' + (H - padB) + 'Z" fill="url(#' + gid + ')"/>' +
      '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="3" fill="' + color + '"/>';
    // stats: current / min / max
    var cur = vs[vs.length - 1], mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs);
    if (stats) stats.innerHTML = '<b>' + cur.toFixed(1) + unit + '</b> · lo ' + mn.toFixed(1) + ' · hi ' + mx.toFixed(1);
  }
  function loadTrends() {
    fetch('/api/history').then(function (r) { return r.json(); }).then(function (d) {
      document.querySelectorAll('[data-trend]').forEach(function (box) {
        var key = box.getAttribute('data-trend'), color = box.getAttribute('data-color'), unit = box.getAttribute('data-unit') || '', scale = parseFloat(box.getAttribute('data-scale') || '1');
        drawTrend(box, d[key], color, unit, scale);
      });
    }).catch(function () {});
  }

  // ---------- cinematic chrome: corner brackets ----------
  document.querySelectorAll('.panel').forEach(function (p) {
    var cb = document.createElement('span'); cb.className = 'cb'; p.appendChild(cb);
  });

  // ---------- boot ----------
  render(); loadSparks(); loadWind(); loadDevices(); loadTrends(); connect();
  setInterval(loadSparks, 60000); setInterval(loadWind, 60000); setInterval(loadDevices, 60000); setInterval(loadTrends, 60000);
})();
