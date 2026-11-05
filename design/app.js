/* ============================================================
   VIBRATO / INSTRUMENT LOGIC
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var NS = 'http://www.w3.org/2000/svg';
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var pad3 = function (n) { return ('00' + n).slice(-3); };
  function S(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  /* deg measured clockwise from 12 o'clock */
  function polar(cx, cy, r, deg) {
    var a = deg * Math.PI / 180;
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  }
  function arcPath(cx, cy, r, a0, a1) {
    var p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    var large = (a1 - a0) > 180 ? 1 : 0;
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) +
           ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
  }

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ============================================================
     CONTENT — five bands, five different kinds of "section"
     ============================================================ */
  var CHANNELS = [
    {
      code: 'RESONANCE', shape: 0, freq: 8.20, amp: 0.74,
      kicker: 'TRANSMISSION 001 / 005',
      title: 'WE BUILD<br>BY FEELING.',
      serif: 'Software, tuned not specified.',
      meta: '/// CH 01 — CARRIER PRESENT — DECODE OK',
      lines: [
        { k: 'INPUT', v: 'A hunch. A half-sentence. A screenshot of a feeling.' },
        { k: 'OUTPUT', v: 'Software that runs, ships, and feels like you meant it.', cls: 'acc' },
        { k: 'ABSENT', v: 'Briefs, tickets, sprint ceremonies, forty-page decks.' },
        { k: 'METHOD', v: 'Tight loops. Daily builds. One conversation at a time.' },
        { k: 'RATING', v: 'VIBE FIDELITY: 98.4 %  /  REGRET: 0.0 %' }
      ],
      note: 'If you can only feel it, even better.'
    },
    {
      code: 'TRANSMISSIONS', shape: 1, freq: 12.40, amp: 0.61,
      kicker: 'TRANSMISSION 002 / 005',
      title: 'RECORDED<br>OUTPUT.',
      serif: 'Things that left the lab.',
      meta: '/// LOG TAPE — 5 OF 214 ENTRIES — SORTED BY FREQUENCY',
      lines: [
        { k: 'TX–004', v: 'HALCYON  ·  generative finance terminal  ·  14 WKS' },
        { k: 'TX–011', v: 'SOFT BODY  ·  haptic commerce  ·  09 WKS' },
        { k: 'TX–019', v: 'NIGHT SHIFT  ·  an OS for warehouse robots  ·  22 WKS' },
        { k: 'TX–023', v: 'MURMUR  ·  a voice instrument for 40k players  ·  06 WKS' },
        { k: 'TX–031', v: 'OPEN WATER  ·  real-time ocean observatory  ·  17 WKS' }
      ],
      note: 'Every transmission is bespoke. None of them are templates.'
    },
    {
      code: 'PROCEDURE', shape: 2, freq: 5.60, amp: 0.83,
      kicker: 'TRANSMISSION 003 / 005',
      title: 'THE<br>PROCEDURE.',
      serif: 'Four moves, no meetings.',
      meta: '/// PROCESS SCHEMATIC — LOOP UNTIL IT FEELS RIGHT',
      lines: [
        { k: '01 INTENT', v: 'You talk. We listen for the shape underneath the words.', cls: 'acc' },
        { k: '02 LATENT', v: 'A rough thing exists within hours. Ugly, alive, runnable.' },
        { k: '03 COMPILE', v: 'We sharpen it daily until the details stop arguing.' },
        { k: '04 FEEL', v: 'The only gate that matters: does it feel inevitable?', cls: 'acc' }
      ],
      note: 'Then we go back to 01. The loop is the product.'
    },
    {
      code: 'OPERATORS', shape: 3, freq: 3.10, amp: 0.52,
      kicker: 'TRANSMISSION 004 / 005',
      title: 'ON<br>THE DESK.',
      serif: 'Four operators. One room.',
      meta: '/// STATION LOG — ALL CHANNELS STAFFED',
      lines: [
        { k: 'OP–01', v: 'M. VERA  ·  signal & systems  ·  since 2019' },
        { k: 'OP–02', v: 'K. OSEI  ·  interface & motion  ·  since 2021' },
        { k: 'OP–03', v: 'R. NAKAMURA  ·  machine & model  ·  since 2022' },
        { k: 'OP–04', v: 'THE ROOM  ·  everyone else  ·  always', cls: 'acc' }
      ],
      note: 'There are no account managers. You talk to the people typing.'
    },
    {
      code: 'OPEN CHANNEL', shape: 4, freq: 0.80, amp: 0.90,
      kicker: 'TRANSMISSION 005 / 005',
      title: 'SAY<br>SOMETHING.',
      serif: 'The channel is open.',
      meta: '/// READY TO RECEIVE — 140 CHARACTERS MAX',
      lines: [
        { k: 'NOTE', v: 'Tell us the vibe. Not the requirements.' },
        { k: 'TIP', v: 'One sentence is plenty. A feeling is better.' }
      ],
      note: '',
      form: true
    }
  ];

  var TICKER = [
    'SIGNAL LOCKED', 'NO BRIEFS. NO TICKETS.', 'SHIPPED DAILY SINCE 2026',
    'VIBE FIDELITY 98.4 %', 'BUILT BY FEELING', 'FOUR OPERATORS / ONE ROOM',
    'THE LOOP IS THE PRODUCT', 'INTENT IN / SOFTWARE OUT', 'DO NOT SCALE'
  ];

  /* ============================================================
     STATE
     ============================================================ */
  var state = {
    t: 0, started: performance.now(),
    channel: 0,
    freq: 0.42, gain: 0.58, drift: 0.22,
    activity: 0,
    dialAngle: -135, dialTarget: -135, dialVel: 0, dialDragging: false,
    scramble: null, typing: [],
    motion: reduced ? 0.3 : 1
  };

  var sheet = $('#sheet');
  var vector = VBEngine.createVector($('#vec'));
  var scope = VBEngine.createScope($('#scope'));

  /* ============================================================
     SOUND — tiny WebAudio instrument (off until switched on)
     ============================================================ */
  var Sound = (function () {
    var ac = null, on = false;
    function ensure() {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }
    function tone(f0, f1, dur, type, vol) {
      if (!on) return;
      var c = ensure(); if (!c) return;
      var o = c.createOscillator(), g = c.createGain(), now = c.currentTime;
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, now);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(vol || 0.045, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g); g.connect(c.destination);
      o.start(now); o.stop(now + dur + 0.03);
    }
    return {
      get on() { return on; },
      toggle: function () {
        on = !on; if (on) { ensure(); tone(420, 760, 0.14, 'triangle', 0.05); }
        var b = $('#sndBtn'); b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.textContent = on ? 'SND ON' : 'SND OFF';
        return on;
      },
      click: function () { tone(900, 620, 0.045, 'square', 0.022); },
      blip: function (i) { tone(300 + i * 105, 360 + i * 105, 0.10, 'triangle', 0.04); },
      sweep: function () { tone(180, 1300, 0.30, 'sawtooth', 0.032); },
      burst: function () { tone(120, 1900, 0.55, 'sawtooth', 0.05); tone(900, 90, 0.4, 'square', 0.02); }
    };
  })();

  /* ============================================================
     SHEET SCALING
     ============================================================ */
  function fitSheet() {
    var pad = 26;
    var s = Math.min((window.innerWidth - pad * 2) / 1440, (window.innerHeight - pad * 2) / 900);
    sheet.style.setProperty('--s', clamp(s, 0.3, 1.6).toFixed(4));
  }

  /* ============================================================
     RULERS / REGISTRATION MARKS
     ============================================================ */
  function buildRulers() {
    var svg = $('#rulers');
    var g = S('g', { fill: 'none', stroke: 'rgba(22,24,26,.42)', 'stroke-width': '1' });
    svg.appendChild(g);
    var x, y, i;
    for (x = 56; x <= 1384; x += 20) {
      var major = (x - 56) % 100 === 0;
      g.appendChild(S('line', { x1: x, y1: 14, x2: x, y2: major ? 28 : 21 }));
      g.appendChild(S('line', { x1: x, y1: 886, x2: x, y2: major ? 872 : 879 }));
    }
    for (y = 40; y <= 860; y += 20) {
      var m2 = (y - 40) % 100 === 0;
      g.appendChild(S('line', { x1: 14, y1: y, x2: m2 ? 28 : 21, y2: y }));
      g.appendChild(S('line', { x1: 1426, y1: y, x2: m2 ? 1412 : 1419, y2: y }));
    }
    // corner registration crosses
    [[56, 40], [1384, 40], [56, 860], [1384, 860]].forEach(function (p) {
      g.appendChild(S('circle', { cx: p[0], cy: p[1], r: 7, stroke: 'rgba(239,68,35,.55)' }));
      g.appendChild(S('line', { x1: p[0] - 12, y1: p[1], x2: p[0] + 12, y2: p[1], stroke: 'rgba(239,68,35,.55)' }));
      g.appendChild(S('line', { x1: p[0], y1: p[1] - 12, x2: p[0], y2: p[1] + 12, stroke: 'rgba(239,68,35,.55)' }));
    });
    // fiducials
    [[332, 128], [1068, 760], [700, 128], [1404, 440]].forEach(function (p) {
      g.appendChild(S('path', { d: 'M' + (p[0] - 5) + ' ' + p[1] + 'h10 M' + p[0] + ' ' + (p[1] - 5) + 'v10', stroke: 'rgba(22,24,26,.35)' }));
    });
    var txt = S('text', { x: 56, y: 36, fill: 'rgba(22,24,26,.5)', 'font-family': 'Mono, monospace', 'font-size': '8', 'letter-spacing': '.2em' });
    txt.textContent = 'A'; svg.appendChild(txt);
  }

  /* ============================================================
     CIRCUIT TRACES + TRAVELLING PULSES
     ============================================================ */
  var pulses = [];
  function buildTraces() {
    var svg = $('#traces');
    var defs = [
      // top band
      'M 56 128 H 1384', 'M 56 138 H 470', 'M 980 138 H 1384',
      'M 200 116 V 128', 'M 800 128 V 150', 'M 1200 128 V 150',
      // left channel
      'M 320 150 V 740', 'M 332 150 V 740', 'M 344 150 V 740',
      'M 320 250 H 356', 'M 332 470 H 356', 'M 344 655 H 356',
      'M 332 128 V 205 H 356', 'M 344 740 V 690 H 356',
      // right channel
      'M 1056 150 V 740', 'M 1068 150 V 740', 'M 1080 150 V 740',
      'M 1044 235 H 1092', 'M 1044 425 H 1092', 'M 1044 600 H 1092',
      'M 1068 150 V 320 H 1092', 'M 1056 740 V 700 H 1092',
      // bottom band
      'M 56 760 H 1384', 'M 56 772 H 690', 'M 920 772 H 1384',
      'M 320 740 V 760', 'M 1068 740 V 760', 'M 700 760 V 782', 'M 1200 760 V 782',
      // right margin
      'M 1404 150 V 740', 'M 1384 300 H 1404', 'M 1384 560 H 1404', 'M 1404 740 V 782 H 1384'
    ];
    var g = S('g', { fill: 'none', stroke: 'rgba(22,24,26,.26)', 'stroke-width': '1' });
    svg.appendChild(g);
    defs.forEach(function (d) { g.appendChild(S('path', { d: d })); });

    // junction dots
    [[332, 128], [1068, 760], [320, 740], [1068, 740], [800, 128], [1200, 128], [1404, 300], [1404, 560], [356, 470], [1092, 425]].forEach(function (p) {
      g.appendChild(S('circle', { cx: p[0], cy: p[1], r: 2.6, fill: 'rgba(22,24,26,.5)', stroke: 'none' }));
    });

    // net labels
    [
      ['SIG / A', 610, 124, 0], ['CLK', 930, 124, 0], ['GND', 1300, 124, 0],
      ['V.01', 314, 388, -90], ['BUS B', 1050, 500, -90], ['Ø +5V', 1398, 620, 90],
      ['OUT', 640, 756, 0], ['SUM', 1120, 756, 0], ['REV C', 1330, 756, 0]
    ].forEach(function (n) {
      var t = S('text', {
        x: n[1], y: n[2], fill: 'rgba(22,24,26,.55)',
        'font-family': 'Mono, monospace', 'font-size': '7', 'letter-spacing': '.14em',
        transform: n[3] ? 'rotate(' + n[3] + ' ' + n[1] + ' ' + n[2] + ')' : ''
      });
      t.textContent = n[0]; svg.appendChild(t);
    });

    // travelling signal pulses
    var pulseDefs = [
      { d: 'M 56 128 H 1384', speed: 0.16, color: '#EF4423' },
      { d: 'M 320 150 V 740', speed: 0.23, color: '#EF4423' },
      { d: 'M 56 760 H 1384', speed: 0.13, color: '#2E5A5B' },
      { d: 'M 1068 150 V 740', speed: 0.19, color: '#EF4423' }
    ];
    var pg = S('g'); svg.appendChild(pg);
    pulseDefs.forEach(function (p, i) {
      var path = S('path', { d: p.d, fill: 'none', stroke: 'none' });
      pg.appendChild(path);
      var dot = S('circle', { r: 3.2, fill: p.color });
      pg.appendChild(dot);
      var halo = S('circle', { r: 7, fill: p.color, opacity: '0.18' });
      pg.appendChild(halo);
      // sample once up-front: robust even when the SVG is display:none (mobile)
      var pts = [];
      try {
        var len = path.getTotalLength();
        if (len > 0) for (var q = 0; q <= 160; q++) {
          var sp = path.getPointAtLength(len * q / 160);
          if (sp && isFinite(sp.x) && isFinite(sp.y)) pts.push({ x: sp.x, y: sp.y });
        }
      } catch (e) { pts = []; }
      if (pts.length < 2) pts = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
      pulses.push({ pts: pts, dot: dot, halo: halo, phase: i * 0.27, speed: p.speed });
    });
  }

  /* ============================================================
     PATCH CABLES (drawn above the panels, with live slack wobble)
     ============================================================ */
  var cables = [];
  function buildCables() {
    var svg = $('#cables');
    var defs = [
      { a: [1121, 655], b: [1355, 655], c: [1180, 770], d: [1296, 770], color: '#EF4423', hi: '#FF8A63' },
      { a: [1121, 712], b: [1238, 712], c: [1142, 788], d: [1218, 788], color: '#242824', hi: '#8A8F82' },
      { a: [1296, 712], b: [1355, 712], c: [1306, 766], d: [1345, 766], color: '#2E5A5B', hi: '#78AEA9' },
      { a: [1044, 690], b: [1121, 712], c: [1050, 778], d: [1104, 778], color: '#B97E22', hi: '#FFD08A' }
    ];
    defs.forEach(function (c, i) {
      var base = S('path', { fill: 'none', stroke: c.color, 'stroke-width': '7', 'stroke-linecap': 'round' });
      var hi = S('path', { fill: 'none', stroke: c.hi, 'stroke-width': '2', 'stroke-linecap': 'round', opacity: '.38' });
      base.style.filter = 'drop-shadow(2px 5px 2px rgba(0,0,0,.32))';
      svg.appendChild(base); svg.appendChild(hi);
      cables.push({ def: c, base: base, hi: hi, phase: i * 1.7 });
    });
    // plug sockets at every endpoint
    var seen = {};
    defs.forEach(function (c) {
      [c.a, c.b].forEach(function (p) {
        var key = p.join(',');
        if (seen[key]) return; seen[key] = 1;
        svg.appendChild(S('circle', { cx: p[0], cy: p[1], r: 9, fill: '#1D211D', stroke: '#0A0C0B', 'stroke-width': '1.5' }));
        svg.appendChild(S('circle', { cx: p[0], cy: p[1], r: 5.5, fill: '#4A4E46' }));
        svg.appendChild(S('circle', { cx: p[0], cy: p[1], r: 2.4, fill: '#C9BFA6' }));
      });
    });
  }
  function updateCables(t) {
    cables.forEach(function (c) {
      var d = c.def, w = Math.sin(t * 1.15 + c.phase) * 3.2 * state.motion;
      var dstr = 'M' + d.a[0] + ' ' + d.a[1] +
        ' C' + d.c[0] + ' ' + (d.c[1] + w).toFixed(1) + ' ' + d.d[0] + ' ' + (d.d[1] - w).toFixed(1) + ' ' + d.b[0] + ' ' + d.b[1];
      c.base.setAttribute('d', dstr);
      c.hi.setAttribute('d', dstr);
    });
  }

  /* ============================================================
     DIAL SCALE + CHANNEL INDEX
     ============================================================ */
  function buildDial() {
    var svg = $('#dialScale');
    var g = S('g', { fill: 'none', stroke: 'rgba(22,24,26,.45)' });
    svg.appendChild(g);
    g.appendChild(S('circle', { cx: 110, cy: 110, r: 104, 'stroke-width': '1' }));
    var deg, p0, p1, i;
    for (deg = -135; deg <= 135; deg += 6.75) {
      var major = Math.abs(((deg + 135) % 67.5)) < 0.01;
      p0 = polar(110, 110, major ? 94 : 99, deg);
      p1 = polar(110, 110, 104, deg);
      g.appendChild(S('line', { x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1], 'stroke-width': major ? 1.6 : 0.8 }));
    }
    // detent dots
    for (i = 0; i < 5; i++) {
      var p = polar(110, 110, 88, -135 + i * 67.5);
      g.appendChild(S('circle', { cx: p[0], cy: p[1], r: 2.6, fill: 'rgba(22,24,26,.65)', stroke: 'none' }));
    }
    // colourful active-range arc
    g.appendChild(S('path', { d: arcPath(110, 110, 100, -135, 135), stroke: 'rgba(239,68,35,.30)', 'stroke-width': '3' }));
    var labels = S('g', { 'font-family': 'Mono, monospace', 'font-size': '8', fill: 'rgba(22,24,26,.6)', 'letter-spacing': '.1em' });
    var a = S('text', { x: 26, y: 196 }); a.textContent = 'MIN';
    var b = S('text', { x: 168, y: 196 }); b.textContent = 'MAX';
    labels.appendChild(a); labels.appendChild(b); svg.appendChild(labels);

    var nav = $('#channels');
    CHANNELS.forEach(function (c, i) {
      var row = document.createElement('button');
      row.className = 'ch-row'; row.type = 'button'; row.dataset.i = i;
      row.setAttribute('aria-label', 'Band ' + pad2(i + 1) + ' ' + c.code);
      row.innerHTML = '<span class="n">' + pad2(i + 1) + '</span><span class="t">' + c.code + '</span><span class="dot"></span>';
      row.addEventListener('click', function () { selectChannel(i); });
      nav.appendChild(row);
    });
  }

  /* ============================================================
     KNOBS / METER / TICKER / BARCODE SEED
     ============================================================ */
  var knobDefs = [
    { id: 'freq', label: 'FREQ', key: 'freq' },
    { id: 'gain', label: 'GAIN', key: 'gain' },
    { id: 'drift', label: 'DRIFT', key: 'drift' }
  ];
  function knobReadout(k, v) {
    if (k === 'freq') return (2 + v * 18).toFixed(2);
    if (k === 'gain') return (0.30 + v * 0.68).toFixed(2);
    return (v * 100).toFixed(0);
  }
  function buildKnobs() {
    var wrap = $('#knobs');
    knobDefs.forEach(function (def) {
      var unit = document.createElement('div'); unit.className = 'knob-unit';
      var knob = document.createElement('div'); knob.className = 'knob';
      knob.setAttribute('role', 'slider'); knob.tabIndex = 0;
      knob.setAttribute('aria-label', def.label);
      knob.setAttribute('aria-valuemin', '0'); knob.setAttribute('aria-valuemax', '100');
      var svg = S('svg', { viewBox: '0 0 74 74' });
      svg.appendChild(S('path', { d: arcPath(37, 37, 33, -135, 135), fill: 'none', stroke: 'rgba(22,24,26,.22)', 'stroke-width': '3', 'stroke-linecap': 'round' }));
      var fill = S('path', { d: arcPath(37, 37, 33, -135, -135), fill: 'none', stroke: '#EF4423', 'stroke-width': '3', 'stroke-linecap': 'round' });
      svg.appendChild(fill);
      for (var d = -135; d <= 135; d += 45) {
        var p0 = polar(37, 37, 27, d), p1 = polar(37, 37, 30, d);
        svg.appendChild(S('line', { x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1], stroke: 'rgba(22,24,26,.5)', 'stroke-width': '1' }));
      }
      knob.appendChild(svg);
      var body = document.createElement('div'); body.className = 'kb'; knob.appendChild(body);
      var lab = document.createElement('div'); lab.className = 'kb-label'; lab.textContent = def.label;
      var val = document.createElement('div'); val.className = 'kb-val';
      unit.appendChild(knob); unit.appendChild(lab); unit.appendChild(val);
      wrap.appendChild(unit);

      function set(v, quiet) {
        v = clamp(v, 0, 1); state[def.key] = v;
        var deg = -135 + v * 270;
        body.style.setProperty('--ka', deg.toFixed(1) + 'deg');
        fill.setAttribute('d', arcPath(37, 37, 33, -135, deg));
        val.textContent = knobReadout(def.key, v);
        knob.setAttribute('aria-valuenow', Math.round(v * 100));
        if (!quiet) { state.activity = 1; Sound.click(); }
        updateScopeReadout();
      }
      set(state[def.key], true);

      // drag vertically to rotate the knob (a real instrument gesture)
      var dragging = false, startY = 0, startV = 0;
      knob.addEventListener('pointerdown', function (e) {
        dragging = true; startY = e.clientY; startV = state[def.key];
        knob.setPointerCapture(e.pointerId); e.preventDefault();
      });
      knob.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        set(startV + (startY - e.clientY) / 150);
      });
      knob.addEventListener('pointerup', function () { dragging = false; });
      knob.addEventListener('pointercancel', function () { dragging = false; });
      knob.addEventListener('wheel', function (e) { e.preventDefault(); set(state[def.key] - Math.sign(e.deltaY) * 0.035); }, { passive: false });
      knob.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { set(state[def.key] + 0.05); e.preventDefault(); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { set(state[def.key] - 0.05); e.preventDefault(); }
      });
    });
  }
  function updateScopeReadout() {
    $('#scopeFreq').textContent = (2 + state.freq * 18).toFixed(2);
    $('#scopeAmp').textContent = 'AMP ' + (0.30 + state.gain * 0.68).toFixed(2);
  }

  var meterEls = [], peak = 0;
  function buildMeter() {
    var seg = $('#meterSegs');
    for (var i = 0; i < 24; i++) { var e = document.createElement('i'); seg.appendChild(e); meterEls.push(e); }
  }
  function updateMeter() {
    var lvl = 0.36 + 0.22 * Math.sin(state.t * 3.1) + 0.12 * Math.sin(state.t * 7.7 + 1.3)
            + state.activity * 0.34 + 0.06 * Math.sin(state.t * 19);
    lvl = clamp(lvl, 0.05, 1);
    peak = Math.max(peak - 0.005, lvl);
    var n = Math.round(lvl * 23);
    for (var i = 0; i < 24; i++) {
      var on = i <= n;
      meterEls[i].className = on ? (i > 19 ? 'on hot' : 'on') : (i === Math.round(peak * 23) ? 'peak' : '');
    }
  }
  function buildTicker() {
    var half = '<span>' + TICKER.map(function (x) { return x; }).join(' <b>&#10037;</b> ') + ' <b>&#10037;</b> </span>';
    $('#tickerTrack').innerHTML = half + half;
  }

  /* ============================================================
     DECODER SCRAMBLE + TELEPRINTER
     ============================================================ */
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/\\*+<>=';
  function scramble(el, text) {
    var lines = text.split('<br>');
    el.innerHTML = '';
    var chars = [], now = performance.now();
    lines.forEach(function (line, li) {
      if (li) el.appendChild(document.createElement('br'));
      for (var i = 0; i < line.length; i++) {
        var c = line[i];
        var s = document.createElement('span');
        s.textContent = c === ' ' ? '\u00A0' : c;
        el.appendChild(s);
        if (c !== ' ') chars.push({ node: s, final: c, dur: 150 + chars.length * 24 + Math.random() * 130, next: 0 });
      }
    });
    if (reduced) { chars.forEach(function (c) { c.node.textContent = c.final; }); state.scramble = null; return; }
    state.scramble = { t0: now, chars: chars };
  }
  function updateScramble(now) {
    var job = state.scramble; if (!job) return;
    var elapsed = now - job.t0, done = true;
    job.chars.forEach(function (c) {
      if (elapsed < c.dur) {
        done = false;
        if (now > c.next) { c.node.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0]; c.next = now + 38 + Math.random() * 42; }
      } else c.node.textContent = c.final;
    });
    if (done) state.scramble = null;
  }
  function typeLines(spans, now) {
    state.typing = spans.map(function (s, i) {
      s.textContent = ''; s.classList.add('typing');
      return { node: s, text: s.getAttribute('data-text') || '', n: 0, t0: now + i * 90 };
    });
    if (reduced) {
      state.typing.forEach(function (j) { j.node.textContent = j.text; j.node.classList.remove('typing'); });
      state.typing = [];
    }
  }
  function updateTyping(now, dt) {
    if (!state.typing.length) return;
    var alive = false;
    state.typing.forEach(function (j) {
      if (now < j.t0) { alive = true; return; }
      if (j.n < j.text.length) {
        j.n = Math.min(j.text.length, j.n + Math.max(1, Math.round(dt * 150)));
        j.node.textContent = j.text.slice(0, j.n);
        alive = true;
      } else j.node.classList.remove('typing');
    });
    if (!alive) state.typing = [];
  }

  /* ============================================================
     CHANNEL SELECTION
     ============================================================ */
  function selectChannel(i, instant) {
    i = clamp(i | 0, 0, CHANNELS.length - 1);
    var c = CHANNELS[i], now = performance.now();
    var changed = i !== state.channel;
    state.channel = i;
    state.activity = 1;

    $$('.ch-row').forEach(function (r, k) { r.classList.toggle('on', k === i); });
    $('#dialReadout').textContent = pad2(i + 1);
    $('#dial').setAttribute('aria-valuenow', i + 1);
    $('#dial').setAttribute('aria-valuetext', c.code);
    state.dialTarget = -135 + i * 67.5;
    if (instant) { state.dialAngle = state.dialTarget; state.dialVel = 0; }

    $('#chTab').innerHTML = 'CH&#183;' + pad2(i + 1) + ' <span>' + c.code + '</span>';
    $('#crtKicker').textContent = c.kicker;
    $('#crtSerif').textContent = c.serif;
    $('#cbMeta').textContent = c.meta;
    $('#cbNote').textContent = c.note ? '\u201C' + c.note + '\u201D' : '';
    $('#scopeTag').textContent = 'CH ' + pad2(i + 1);
    $('#crt').classList.toggle('tx-mode', !!c.form);

    scramble($('#crtTitle'), c.title);

    var box = $('#cbLines'); box.innerHTML = '';
    c.lines.forEach(function (l) {
      var row = document.createElement('div'); row.className = 'cb-line' + (l.cls ? ' ' + l.cls : '');
      var k = document.createElement('span'); k.className = 'cb-k'; k.textContent = l.k;
      var v = document.createElement('span'); v.className = 'cb-v'; v.setAttribute('data-text', l.v);
      row.appendChild(k); row.appendChild(v); box.appendChild(row);
    });
    typeLines($$('.cb-v', box), now);

    var form = $('#txForm');
    if (c.form) { form.hidden = false; } else { form.hidden = true; hideReceipt(); }

    vector.setShape(c.shape);
    scope.kick();
    if (!instant) {
      var st = $('#crtStatic'); st.classList.remove('flash'); void st.offsetWidth; st.classList.add('flash');
      Sound.sweep(); Sound.blip(i);
    }
    if (changed) state.activity = 1;
  }

  /* ============================================================
     DIAL DRAG + KEYBOARD
     ============================================================ */
  function buildDialInteraction() {
    var dial = $('#dial');
    function angleFromEvent(e) {
      var r = dial.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2);
      var dy = e.clientY - (r.top + r.height / 2);
      // angle clockwise from 12 o'clock (ratio only, so scaling is irrelevant)
      var a = Math.atan2(dx, -dy) * 180 / Math.PI;
      if (a > 180) a -= 360;
      return clamp(a, -135, 135);
    }
    dial.addEventListener('pointerdown', function (e) {
      state.dialDragging = true; dial.setPointerCapture(e.pointerId);
      state.dialVel = 0; e.preventDefault();
      state.dialAngle = angleFromEvent(e);
      Sound.click();
    });
    dial.addEventListener('pointermove', function (e) {
      if (!state.dialDragging) return;
      state.dialAngle = angleFromEvent(e);
      var idx = clamp(Math.round((state.dialAngle + 135) / 67.5), 0, 4);
      $('#dialReadout').textContent = pad2(idx + 1);
    });
    function release() {
      if (!state.dialDragging) return;
      state.dialDragging = false;
      var idx = clamp(Math.round((state.dialAngle + 135) / 67.5), 0, 4);
      selectChannel(idx);
    }
    dial.addEventListener('pointerup', release);
    dial.addEventListener('pointercancel', release);
    dial.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { selectChannel(state.channel + 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { selectChannel(state.channel - 1); e.preventDefault(); }
    });
    document.addEventListener('keydown', function (e) {
      if (/input|textarea/i.test(e.target.tagName)) return;
      if (/^[1-5]$/.test(e.key)) { selectChannel(parseInt(e.key, 10) - 1); return; }
      // the focused dial / knobs own their arrow keys; don't double-step
      if (e.target.closest && e.target.closest('.knob, .dial')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') selectChannel(state.channel + 1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') selectChannel(state.channel - 1);
    });
  }

  /* ============================================================
     TRANSMIT / RECEIPT
     ============================================================ */
  function hideReceipt() {
    var r = $('#receipt'); r.classList.remove('print');
  }
  function buildTransmit() {
    var form = $('#txForm'), input = $('#txMsg');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = input.value.trim() || '(silence on the line)';
      var d = new Date();
      $('#rcId').textContent = 'TX\u2013' + pad3(100 + ((Math.random() * 899) | 0));
      $('#rcMsg').textContent = '\u201C' + msg + '\u201D';
      $('#rcTime').textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
      var r = $('#receipt'); r.classList.remove('print'); void r.offsetWidth; r.classList.add('print');
      scope.kick(); vector.kick(); Sound.burst(); state.activity = 1.4;
      input.value = '';
      input.blur();
    });
  }

  /* ============================================================
     RETICLE CURSOR
     ============================================================ */
  function buildCursor() {
    if (!finePointer || reduced) { $('#reticle').style.display = 'none'; return; }
    var ret = $('#reticle'), label = $('#reticleLabel');
    var rules = [
      ['.dial', 'DRAG TO TUNE', true],
      ['.knob', 'DRAG TO MODULATE', true],
      ['.ch-row', 'SELECT BAND', false],
      ['[data-cursor]', null, false]
    ];
    document.addEventListener('pointermove', function (e) {
      ret.style.left = e.clientX + 'px'; ret.style.top = e.clientY + 'px';
      ret.classList.add('on');
      var found = null, grab = false;
      for (var i = 0; i < rules.length; i++) {
        var t = e.target.closest ? e.target.closest(rules[i][0]) : null;
        if (t) {
          found = rules[i][1] || t.getAttribute('data-cursor');
          grab = rules[i][2]; break;
        }
      }
      if (found) { label.textContent = found; ret.classList.add('label'); } else ret.classList.remove('label');
      ret.classList.toggle('grab', grab);
    });
    document.addEventListener('pointerleave', function () { ret.classList.remove('on'); });
  }

  /* ============================================================
     MAIN LOOP
     ============================================================ */
  var last = performance.now(), frameNo = 0;
  function loop(now) {
    var dt = clamp((now - last) / 1000, 0, 0.05); last = now;
    state.t += dt;
    state.activity = Math.max(0, state.activity - dt * 1.6);
    frameNo++;

    /* rotary dial spring — physical detent snap, not a CSS transition */
    if (!state.dialDragging) {
      state.dialVel += (state.dialTarget - state.dialAngle) * 0.13;
      state.dialVel *= 0.79;
      state.dialAngle += state.dialVel;
    }
    $('#dial').style.setProperty('--angle', state.dialAngle.toFixed(2) + 'deg');
    $('#dial').style.setProperty('--angle-neg', (-state.dialAngle).toFixed(2) + 'deg');

    updateScramble(now);
    updateTyping(now, dt);
    updateCables(state.t);

    /* travelling pulses */
    pulses.forEach(function (p) {
      var u = ((state.t * p.speed + p.phase) % 1 + 1) % 1;
      var n = p.pts.length;
      var f = u * (n - 1);
      var i0 = clamp(Math.floor(f), 0, n - 1);
      var i1 = Math.min(n - 1, i0 + 1);
      var a = clamp(f - i0, 0, 1);
      var x = p.pts[i0].x + (p.pts[i1].x - p.pts[i0].x) * a;
      var y = p.pts[i0].y + (p.pts[i1].y - p.pts[i0].y) * a;
      p.dot.setAttribute('cx', x.toFixed(1)); p.dot.setAttribute('cy', y.toFixed(1));
      p.halo.setAttribute('cx', x.toFixed(1)); p.halo.setAttribute('cy', y.toFixed(1));
    });

    /* clock + HUD */
    if (frameNo % 12 === 0) {
      var d = new Date();
      $('#clock').textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
      var el = Math.floor((now - state.started) / 1000);
      $('#hudTime').textContent = 'T+' + pad2(Math.floor(el / 3600)) + ':' + pad2(Math.floor(el / 60) % 60) + ':' + pad2(el % 60);
    }

    var params = {
      t: state.t * state.motion,
      motion: state.motion,
      freq: state.freq, gain: state.gain, drift: state.drift,
      activity: state.activity
    };
    var rot = vector.frame(dt, params);
    scope.frame(dt, params);
    if (frameNo % 6 === 0) {
      var fmt = function (v) { var n = (v * 57.2958) % 360; return (n >= 0 ? '+' : '\u2212') + Math.abs(n).toFixed(1).padStart(5, '0'); };
      $('#hudCoords').textContent = 'X' + fmt(rot.x) + ' Y' + fmt(rot.y) + ' Z' + fmt(rot.z);
    }
    if (frameNo % 2 === 0) updateMeter();

    requestAnimationFrame(loop);
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    fitSheet();
    buildRulers();
    buildTraces();
    buildCables();
    buildDial();
    buildKnobs();
    buildMeter();
    buildTicker();
    buildDialInteraction();
    buildTransmit();
    buildCursor();

    $('#sndBtn').addEventListener('click', function () { Sound.toggle(); });
    $('#openBtn').addEventListener('click', function () { selectChannel(4); $('#txMsg').focus(); });
    updateScopeReadout();
    selectChannel(0, true);

    var lastW = 0, lastH = 0, lastSW = 0, lastSH = 0;
    function syncSizes() {
      var v = $('#vec'), s = $('#scope');
      if (v.clientWidth !== lastW || v.clientHeight !== lastH) { vector.resize(); lastW = v.clientWidth; lastH = v.clientHeight; }
      if (s.clientWidth !== lastSW || s.clientHeight !== lastSH) { scope.resize(); lastSW = s.clientWidth; lastSH = s.clientHeight; }
    }
    window.addEventListener('resize', function () { fitSheet(); syncSizes(); });
    window.addEventListener('load', syncSizes);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncSizes);
    syncSizes();
    setTimeout(syncSizes, 300);

    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
