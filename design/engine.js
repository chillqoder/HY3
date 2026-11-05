/* ============================================================
   VIBRATO / ENGINE
   Hand-written software 3D vector renderer + phosphor scope.
   No libraries. Everything below is projection math we own.
   ============================================================ */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  var U = 26, V = 20;          // mesh resolution (identical for every shape -> morphable)
  var N = U * V;
  var BUCKETS = 6;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /* ---- five parametric surfaces. Same (u,v) grid, so we can blend
     vertex-for-vertex between any two of them when the channel turns. ---- */
  var SHAPES = [
    { name: 'RESONANCE', wrapU: true, fn: function (u, v) {
        var a = u * TAU, b = v * Math.PI;
        var r = 0.94 + 0.11 * Math.sin(6 * a + 2 * b) * Math.sin(4 * b);
        return { x: r * Math.sin(b) * Math.cos(a), y: r * Math.cos(b), z: r * Math.sin(b) * Math.sin(a) };
      } },
    { name: 'EMISSIONS', wrapU: false, fn: function (u, v) {
        /* concentric ripples on a plate — a field of transmissions */
        var x = (u - 0.5) * 2.55, z = (v - 0.5) * 2.55;
        var r = Math.sqrt(x * x + z * z);
        var y = 0.50 * Math.sin(r * 4.4) * Math.exp(-r * 0.30)
              + 0.10 * Math.sin(x * 3.2 + z * 2.1);
        return { x: x, y: y, z: z };
      } },
    { name: 'PROCEDURE', wrapU: false, fn: function (u, v) {
        var rad = 0.20 + 0.98 * v, ang = u * TAU * 2.15;
        return { x: rad * Math.cos(ang), y: (u - 0.5) * 2.35, z: rad * Math.sin(ang) };
      } },
    { name: 'OPERATORS', wrapU: true, fn: function (u, v) {
        var a = u * TAU, b = v * TAU;
        var tube = 0.38 * (1 + 0.30 * Math.cos(6 * a));
        var R = 0.78;
        return { x: (R + tube * Math.cos(b)) * Math.cos(a),
                 y: tube * Math.sin(b) + 0.17 * Math.sin(3 * a),
                 z: (R + tube * Math.cos(b)) * Math.sin(a) };
      } },
    { name: 'OPEN CHANNEL', wrapU: true, fn: function (u, v) {
        var a = u * TAU, b = (v - 0.5) * 2;
        var rad = 0.92 * (1 - Math.abs(b)) * (1 + 0.10 * Math.cos(6 * a));
        return { x: rad * Math.cos(a), y: b * 1.15, z: rad * Math.sin(a) };
      } }
  ];

  function buildTarget(out, idx) {
    var s = SHAPES[idx];
    for (var j = 0; j < V; j++) {
      for (var i = 0; i < U; i++) {
        var p = s.fn(i / U, j / (V - 1));
        var k = (j * U + i) * 3;
        out[k] = p.x; out[k + 1] = p.y; out[k + 2] = p.z;
      }
    }
    return s.wrapU;
  }

  /* ============================================================
     VECTOR DISPLAY
     ============================================================ */
  function createVector(canvas) {
    var ctx = canvas.getContext('2d');
    var W = 1, H = 1, dpr = 1;
    var cur = new Float32Array(N * 3);
    var tgt = new Float32Array(N * 3);
    var pp = new Float32Array(N * 3);       // projected: sx, sy, depth
    var shape = 0, burst = 0;
    var ry = 0.4, rx = 0.3, spin = 0;
    var lineBuckets = [], quadBuckets = [];
    var i, b;
    for (b = 0; b < BUCKETS; b++) { lineBuckets.push([]); quadBuckets.push([]); }

    var wrapTarget = buildTarget(tgt, 0);
    cur.set(tgt);

    function resize() {
      /* clientWidth/Height are LAYOUT sizes — unaffected by the sheet's
         CSS transform, so the drawing space stays fixed at 688x480 etc. */
      W = Math.max(1, canvas.clientWidth); H = Math.max(1, canvas.clientHeight);
      dpr = Math.min(2, global.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function setShape(n) {
      shape = clamp(n | 0, 0, SHAPES.length - 1);
      wrapTarget = buildTarget(tgt, shape);
      burst = 1;
    }

    function kick() { burst = 1; }

    function frame(dt, p) {
      var t = p.t;
      /* --- morph toward the selected surface (frame-rate independent) --- */
      var f = Math.min(1, dt * 3.4);
      for (i = 0; i < N * 3; i++) cur[i] += (tgt[i] - cur[i]) * f;
      burst = Math.max(0, burst - dt * 2.6);

      /* --- rotation + perspective projection --- */
      var mo = p.motion === undefined ? 1 : p.motion;
      ry += dt * (0.14 + p.freq * 0.62) * mo;
      rx = 0.30 + 0.16 * Math.sin(t * 0.21 + p.drift);
      var rz = 0.055 * Math.sin(t * 0.16);
      var cr = Math.cos(ry), sr = Math.sin(ry);
      var cp = Math.cos(rx), sp = Math.sin(rx);
      var cz = Math.cos(rz), sz = Math.sin(rz);
      var S = Math.min(W * 0.26, H * 0.315) * (0.86 + p.gain * 0.34);
      var cx = W * 0.705, cy = H * 0.445;
      var k, x, y, z, x1, y1, z1, persp;

      for (i = 0; i < N; i++) {
        k = i * 3;
        x = cur[k]; y = cur[k + 1]; z = cur[k + 2];
        /* live elastic deformation — applied at projection time so it never accumulates */
        var ph = i * 0.37;
        y += p.drift * 0.055 * Math.sin(t * 2.1 + ph)
           + burst * 0.14 * Math.sin(t * 19 + ph * 3);
        x += p.drift * 0.022 * Math.sin(t * 1.7 + ph * 1.7);
        // X
        y1 = y * cp - z * sp; z1 = y * sp + z * cp;
        // Y
        x1 = x * cr + z1 * sr; z = -x * sr + z1 * cr;
        // Z
        var xx = x1 * cz - y1 * sz; y = x1 * sz + y1 * cz;
        persp = 5.2 / (5.2 - clamp(z, -3, 2.6));
        pp[k] = cx + xx * S * persp;
        pp[k + 1] = cy + y * S * persp;
        pp[k + 2] = z;
      }

      /* --- clear + graticule --- */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#080C0B';
      ctx.fillRect(0, 0, W, H);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,182,56,0.045)';
      ctx.beginPath();
      for (i = 1; i < 12; i++) { ctx.moveTo(W * i / 12, 0); ctx.lineTo(W * i / 12, H); }
      for (i = 1; i < 9; i++) { ctx.moveTo(0, H * i / 9); ctx.lineTo(W, H * i / 9); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,182,56,0.10)';
      ctx.beginPath();
      ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.moveTo(0, cy); ctx.lineTo(W, cy);
      ctx.stroke();

      /* --- rotating HUD ring around the object --- */
      spin += dt * (0.35 + p.freq * 0.5) * mo;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(spin);
      ctx.strokeStyle = 'rgba(255,182,56,0.20)';
      ctx.setLineDash([2, 9]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, S * 1.33, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,182,56,0.34)';
      ctx.beginPath();
      for (i = 0; i < 4; i++) {
        var ang = i * Math.PI / 2;
        ctx.moveTo(Math.cos(ang) * S * 1.30, Math.sin(ang) * S * 1.30);
        ctx.lineTo(Math.cos(ang) * S * 1.38, Math.sin(ang) * S * 1.38);
      }
      ctx.stroke();
      ctx.restore();

      /* --- bucket geometry by depth --- */
      for (b = 0; b < BUCKETS; b++) { lineBuckets[b].length = 0; quadBuckets[b].length = 0; }
      var addLine = function (a, c) {
        var d = (pp[a * 3 + 2] + pp[c * 3 + 2]) * 0.5;
        var q = clamp(Math.floor((d + 1.7) / 3.4 * BUCKETS), 0, BUCKETS - 1);
        var arr = lineBuckets[q];
        arr.push(pp[a * 3], pp[a * 3 + 1], pp[c * 3], pp[c * 3 + 1]);
      };
      var addQuad = function (a, c, e, f) {
        var d = (pp[a * 3 + 2] + pp[c * 3 + 2] + pp[e * 3 + 2] + pp[f * 3 + 2]) * 0.25;
        var q = clamp(Math.floor((d + 1.7) / 3.4 * BUCKETS), 0, BUCKETS - 1);
        quadBuckets[q].push(
          pp[a * 3], pp[a * 3 + 1], pp[c * 3], pp[c * 3 + 1],
          pp[e * 3], pp[e * 3 + 1], pp[f * 3], pp[f * 3 + 1]);
      };

      var wu = wrapTarget;
      for (var j = 0; j < V; j++) {
        for (var ii = 0; ii < U; ii++) {
          var a0 = j * U + ii;
          var a1 = j * U + (ii + 1) % U;
          if (ii < U - 1 || wu) addLine(a0, a1);
          if (j < V - 1) {
            var b0 = (j + 1) * U + ii;
            addLine(a0, b0);
            if ((ii < U - 1 || wu)) addQuad(a0, a1, (j + 1) * U + (ii + 1) % U, b0);
          }
        }
      }

      /* --- shaded volume (very subtle) --- */
      for (b = 0; b < BUCKETS; b++) {
        var qa = quadBuckets[b];
        if (!qa.length) continue;
        ctx.fillStyle = 'rgba(255,168,58,' + (0.008 + b * 0.0075).toFixed(3) + ')';
        ctx.beginPath();
        for (i = 0; i < qa.length; i += 8) {
          ctx.moveTo(qa[i], qa[i + 1]); ctx.lineTo(qa[i + 2], qa[i + 3]);
          ctx.lineTo(qa[i + 4], qa[i + 5]); ctx.lineTo(qa[i + 6], qa[i + 7]);
          ctx.closePath();
        }
        ctx.fill();
      }

      /* --- glowing wireframe, far to near --- */
      for (b = 0; b < BUCKETS; b++) {
        var la = lineBuckets[b];
        if (!la.length) continue;
        var f = b / (BUCKETS - 1);
        var g = Math.round(112 + f * 108), bl = Math.round(30 + f * 92);
        var alpha = (0.15 + Math.pow(f, 1.25) * 0.85).toFixed(3);
        ctx.strokeStyle = 'rgba(255,' + g + ',' + bl + ',' + alpha + ')';
        ctx.lineWidth = 0.55 + f * 1.25;
        if (b >= 4) { ctx.shadowColor = 'rgba(255,168,50,0.85)'; ctx.shadowBlur = 7 + b * 2; }
        else ctx.shadowBlur = 0;
        ctx.beginPath();
        for (i = 0; i < la.length; i += 4) {
          ctx.moveTo(la[i], la[i + 1]); ctx.lineTo(la[i + 2], la[i + 3]);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      /* --- bright nodes on the near surface --- */
      ctx.fillStyle = 'rgba(255,214,140,0.85)';
      ctx.shadowColor = 'rgba(255,180,60,0.9)'; ctx.shadowBlur = 8;
      for (i = 0; i < N; i += 7) {
        if (pp[i * 3 + 2] > 0.35) {
          ctx.beginPath();
          ctx.arc(pp[i * 3], pp[i * 3 + 1], 0.9 + (p.gain * 0.7), 0, TAU);
          ctx.fill();
        }
      }
      ctx.shadowBlur = 0;

      return { x: ry, y: rx, z: rz };
    }

    resize();
    return { resize: resize, setShape: setShape, kick: kick, frame: frame, shapes: SHAPES };
  }

  /* ============================================================
     PHOSPHOR OSCILLOSCOPE
     ============================================================ */
  function createScope(canvas) {
    var ctx = canvas.getContext('2d');
    var W = 1, H = 1, dpr = 1;
    var burst = 0, burstPos = 0;

    function resize() {
      W = Math.max(1, canvas.clientWidth); H = Math.max(1, canvas.clientHeight);
      dpr = Math.min(2, global.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#070B0A'; ctx.fillRect(0, 0, W, H);
    }

    function kick() { burst = 1; burstPos = 0; }

    function frame(dt, p) {
      var t = p.t;
      if (burst > 0) { burstPos += dt * 1.5; if (burstPos > 1.2) burst = 0; }

      // phosphor persistence instead of a hard clear
      ctx.fillStyle = 'rgba(7,11,10,0.30)';
      ctx.fillRect(0, 0, W, H);

      // graticule (redrawn each frame, converges to a steady glow)
      ctx.strokeStyle = 'rgba(255,182,56,0.055)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = 1; i < 5; i++) { ctx.moveTo(W * i / 5, 0); ctx.lineTo(W * i / 5, H); }
      for (var j = 1; j < 4; j++) { ctx.moveTo(0, H * j / 4); ctx.lineTo(W, H * j / 4); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,182,56,0.10)';
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

      var amp = 0.30 + p.gain * 0.62;
      var cycles = 1.1 + p.freq * 7.5;
      var noise = p.drift * 0.55 + p.activity * 0.12;
      var mid = H * 0.5, scale = H * 0.37;
      var sweep = (t * 0.65) % 1;
      var bx = 0, by = 0;

      ctx.beginPath();
      for (var x = 0; x <= W; x += 1.5) {
        var u = x / W;
        var wave = Math.sin(u * TAU * cycles + t * 2.3) * 0.72
                 + Math.sin(u * TAU * cycles * 2.7 - t * 1.6) * 0.22
                 + Math.sin(u * TAU * 19 + t * 6.5) * noise * 0.42;
        if (burst > 0) {
          var d = u - burstPos;
          wave += Math.exp(-d * d / 0.0032) * (1.5 * Math.sin(u * TAU * 46) + 0.5);
        }
        var py = mid - wave * amp * scale;
        if (x === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
        if (Math.abs(u - sweep) < 0.008) { bx = x; by = py; }
      }
      ctx.strokeStyle = 'rgba(255,196,96,0.92)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(255,170,50,0.9)'; ctx.shadowBlur = 9;
      ctx.stroke();

      // leading beam dot + vertical time cursor
      ctx.fillStyle = '#FFE3A8';
      ctx.beginPath(); ctx.arc(bx, by, 2.2, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,182,56,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, H); ctx.stroke();
    }

    resize();
    return { resize: resize, kick: kick, frame: frame };
  }

  global.VBEngine = { createVector: createVector, createScope: createScope, SHAPES: SHAPES };
})(window);
