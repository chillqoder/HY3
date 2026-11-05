// DEEPWAKE - procedural voxel models and small pixel textures.
// Geometries and materials are cached and shared; only state-driven accents
// get their own material instance.

import * as THREE from 'three';
import { C } from './constants.js';

// ---- deterministic 16x16 pixel textures ---------------------------------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pixelTexture(seed, paint) {
  const N = 16;
  const data = new Uint8Array(N * N * 4);
  const r = rng(seed);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = paint(x, y, r());
      const i = (y * N + x) * 4;
      const c = (n) => Math.max(0, Math.min(255, Math.round(n)));
      data[i] = c(v[0]); data[i + 1] = c(v[1]); data[i + 2] = c(v[2]); data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export const TEX = {
  rock: pixelTexture(11, (x, y, r) => {
    const base = 216 + Math.floor(r * 38);
    const seam = (x % 8 === 0 || y % 8 === 0) ? -22 : 0;
    return [base + seam, base + seam + 4, base + seam + 10];
  }),
  steel: pixelTexture(27, (x, y, r) => {
    const base = 214 + Math.floor(r * 34);
    const line = (y % 5 === 0) ? -20 : 0;
    return [base + line, base + line + 2, base + line - 4];
  }),
  trim: pixelTexture(43, (x, y, r) => {
    const base = 226 + Math.floor(r * 26);
    const edge = (y === 0 || y === 15) ? 20 : 0;
    return [base + edge, base + edge + 6, base + edge + 12];
  }),
  crystal: pixelTexture(59, (x, y, r) => {
    const v = 150 + Math.floor(r * 70);
    return [Math.floor(v * 0.6), v, v + 10];
  }),
  water: pixelTexture(71, (x, y, r) => {
    const v = 120 + Math.floor(r * 40) + ((x + y) % 4 === 0 ? 22 : 0);
    return [Math.floor(v * 0.4), Math.floor(v * 0.85), v];
  }),
};

// ---- shared geometry / material cache -----------------------------------
const geoCache = new Map();
function boxGeo(w, h, d) {
  const key = `${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}`;
  let g = geoCache.get(key);
  if (g) return g;
  g = new THREE.BoxGeometry(w, h, d);
  // Consistent texel scale: one texture tile per world unit on each face.
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * dims[f][0], uv.getY(idx) * dims[f][1]);
    }
  }
  uv.needsUpdate = true;
  geoCache.set(key, g);
  return g;
}

const matCache = new Map();
function getMat(color, opts = {}) {
  const key = `${color}|${opts.tex || ''}|${opts.emissive || 0}|${opts.ei || 0}|${opts.opacity ?? 1}|${opts.double ? 1 : 0}`;
  let m = opts.unique ? null : matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color,
      map: opts.tex ? TEX[opts.tex] : null,
      emissive: opts.emissive || 0x000000,
      emissiveIntensity: opts.ei || 1,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
      side: opts.double ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (!opts.unique) matCache.set(key, m);
  }
  return m;
}

export function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export function cube(parent, x, y, z, w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(boxGeo(w, h, d), getMat(color, opts));
  m.position.set(x, y, z);
  parent.add(m);
  if (opts.unique) m.userData.ownMat = m.material;
  return m;
}

const M = {
  rock: (p, x, y, z, w, h, d) => cube(p, x, y, z, w, h, d, C.rock, { tex: 'rock' }),
  steel: (p, x, y, z, w, h, d) => cube(p, x, y, z, w, h, d, C.steel, { tex: 'steel' }),
  trim: (p, x, y, z, w, h, d) => cube(p, x, y, z, w, h, d, C.trim, { tex: 'trim' }),
  dark: (p, x, y, z, w, h, d) => cube(p, x, y, z, w, h, d, C.charcoal),
  glow: (p, x, y, z, w, h, d, color, ei = 1.4) => cube(p, x, y, z, w, h, d, color, { emissive: color, ei, unique: true }),
};

// ---------------------------------------------------------------------------
// ILO - small maintenance robot. Position is at the centre of the feet.
// ---------------------------------------------------------------------------

export function buildILO() {
  const root = new THREE.Group();
  const parts = {};

  const body = group(root, 0, 0, 0);
  parts.body = body;

  // Oversized magnetic feet.
  const feet = group(body, 0, 0, 0);
  parts.feet = feet;
  M.dark(feet, -0.21, 0.09, 0.04, 0.33, 0.17, 0.46);
  M.dark(feet, 0.21, 0.09, 0.04, 0.33, 0.17, 0.46);
  M.trim(feet, -0.21, 0.175, 0.04, 0.26, 0.035, 0.36);
  M.trim(feet, 0.21, 0.175, 0.04, 0.26, 0.035, 0.36);

  // Legs with hip / knee / ankle pivots.
  for (const [side, sx] of [['L', -0.17], ['R', 0.17]]) {
    const hip = group(body, sx, 0.72, 0);
    parts['hip' + side] = hip;
    M.dark(hip, 0, -0.15, 0, 0.17, 0.32, 0.19);       // upper leg
    const knee = group(hip, 0, -0.3, 0);
    parts['knee' + side] = knee;
    M.dark(knee, 0, -0.13, 0, 0.15, 0.28, 0.17);
    const ankle = group(knee, 0, -0.28, 0);
    parts['ankle' + side] = ankle;
    M.dark(ankle, 0, -0.02, 0.03, 0.2, 0.08, 0.26);
    M.glow(ankle, 0, -0.02, 0.17, 0.12, 0.04, 0.03, C.teal, 0.9);
  }

  // Torso and chamfered ceramic head.
  M.dark(body, 0, 0.78, 0, 0.5, 0.14, 0.3);           // hip block
  const torso = group(body, 0, 0.98, 0);
  parts.torso = torso;
  cube(torso, 0, 0.06, 0, 0.54, 0.5, 0.34, C.ceramic);
  M.dark(torso, 0, -0.24, 0, 0.46, 0.12, 0.32);
  cube(torso, 0, 0.06, 0.14, 0.44, 0.36, 0.06, C.charcoal); // front panel
  // chamfer corners of the torso
  cube(torso, -0.24, 0.28, 0, 0.08, 0.09, 0.34, C.ceramic);
  cube(torso, 0.24, 0.28, 0, 0.08, 0.09, 0.34, C.ceramic);

  // Chest resonance module (consistent dark-area identity).
  const module = group(torso, 0, 0.08, 0.2);
  parts.module = module;
  const core = M.glow(module, 0, 0, 0, 0.19, 0.19, 0.08, C.crystalCore, 1.7);
  parts.core = core;
  M.dark(module, 0, 0, -0.05, 0.25, 0.25, 0.06);

  // Head with dark face panel and one offset amber lens.
  const head = group(torso, 0, 0.44, 0.01);
  parts.head = head;
  cube(head, 0, 0.06, 0, 0.44, 0.31, 0.33, C.ceramic);
  cube(head, -0.19, 0.18, 0, 0.07, 0.07, 0.33, C.ceramic); // chamfer
  cube(head, 0.19, 0.18, 0, 0.07, 0.07, 0.33, C.ceramic);
  cube(head, 0, 0.06, 0.17, 0.36, 0.2, 0.04, C.charcoal);
  const lens = M.glow(head, 0.1, 0.07, 0.2, 0.1, 0.1, 0.04, C.amber, 2.0);
  parts.lens = lens;
  M.glow(head, -0.1, 0.07, 0.2, 0.035, 0.035, 0.03, C.teal, 0.7);

  // Short flexible antenna (cosmetic).
  const ant = group(head, -0.12, 0.22, -0.02);
  parts.antenna = ant;
  M.dark(ant, 0, 0.09, 0, 0.035, 0.2, 0.035);
  M.glow(ant, 0, 0.2, 0, 0.06, 0.06, 0.06, C.amber, 1.2);

  // Arms with shoulder / elbow pivots.
  for (const [side, sx] of [['L', -0.33], ['R', 0.33]]) {
    const sh = group(torso, sx, 0.22, 0);
    parts['shoulder' + side] = sh;
    cube(sh, 0, -0.12, 0, 0.14, 0.28, 0.16, C.ceramic);
    M.dark(sh, 0, -0.27, 0, 0.16, 0.07, 0.17);
    const el = group(sh, 0, -0.3, 0);
    parts['elbow' + side] = el;
    M.dark(el, 0, -0.1, 0, 0.13, 0.24, 0.14);
    M.dark(el, 0, -0.23, 0.01, 0.16, 0.09, 0.18);    // hand
  }

  // Restrained rust-orange utility cape, always behind the body.
  const cape = group(body, -0.2, 1.2, -0.2);
  parts.cape = cape;
  cube(cape, 0, -0.22, 0, 0.22, 0.44, 0.04, C.cape);
  cube(cape, 0, -0.42, 0, 0.18, 0.06, 0.05, C.rust);

  // Carried cell, parented to the hands.
  const held = group(body, 0, 0.92, 0.42);
  parts.held = held;
  buildCellMesh(held, 0, 0, 0, 0.62);
  held.visible = false;

  root.userData.parts = parts;
  return root;
}

function buildCellMesh(parent, x, y, z, s = 1) {
  const g = group(parent, x, y, z);
  cube(g, 0, 0, 0, 0.44 * s, 0.66 * s, 0.4 * s, C.amber, { emissive: C.amber, ei: 0.35 });
  cube(g, 0, 0.38 * s, 0, 0.5 * s, 0.08 * s, 0.42 * s, C.bronze);
  cube(g, 0, 0.48 * s, 0, 0.2 * s, 0.14 * s, 0.12 * s, C.steel);  // handle
  cube(g, 0, -0.02 * s, 0.21 * s, 0.28 * s, 0.4 * s, 0.03 * s, C.amberCore, { emissive: C.amberCore, ei: 0.9 });
  cube(g, 0, -0.38 * s, 0, 0.48 * s, 0.08 * s, 0.42 * s, C.bronze);
  return g;
}

export function poseILO(model, anim, t, facing, extra = {}) {
  const p = model.userData.parts;
  const s = Math.sin(t * 9), s2 = Math.sin(t * 18);
  const set = (o, x, y, z) => { if (o) { o.rotation.x = x; o.rotation.y = y; o.rotation.z = z; } };
  // Reset to a neutral pose.
  for (const k of ['hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR',
                   'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'head',
                   'antenna', 'cape', 'torso', 'body']) set(p[k], 0, 0, 0);
  p.body.position.set(0, 0, 0);
  p.body.scale.set(1, 1, 1);
  model.rotation.y = facing * 0.32;
  p.held.visible = !!extra.carrying;

  const swing = 0.55 * s;
  switch (anim) {
    case 'walk': case 'run': case 'carry': {
      const amp = anim === 'run' ? 0.85 : anim === 'carry' ? 0.4 : 0.55;
      set(p.hipL, amp * s, 0, 0); set(p.hipR, -amp * s, 0, 0);
      set(p.kneeL, Math.max(0, -amp * s) * 0.7, 0, 0);
      set(p.kneeR, Math.max(0, amp * s) * 0.7, 0, 0);
      set(p.shoulderL, -amp * s * 0.8, 0, 0);
      set(p.shoulderR, amp * s * 0.8, 0, 0);
      p.body.position.y = Math.abs(s2) * 0.025;
      if (anim === 'carry') {
        set(p.shoulderL, 0.9, 0, 0.1); set(p.shoulderR, 0.9, 0, -0.1);
        set(p.elbowL, -0.8, 0, 0); set(p.elbowR, -0.8, 0, 0);
        p.held.visible = true;
        p.body.rotation.z = 0.05;
      }
      break;
    }
    case 'ascent': case 'falling':
      set(p.hipL, 0.5, 0, 0.1); set(p.hipR, -0.35, 0, -0.1);
      set(p.kneeL, -0.7, 0, 0); set(p.kneeR, -0.5, 0, 0);
      set(p.shoulderL, -0.9, 0, 0.2); set(p.shoulderR, -0.9, 0, -0.2);
      break;
    case 'takeoff':
      set(p.hipL, 0.3, 0, 0); set(p.hipR, -0.2, 0, 0);
      set(p.shoulderL, -1.2, 0, 0); set(p.shoulderR, -1.2, 0, 0);
      break;
    case 'landing':
      p.body.scale.set(1.12, 0.82, 1.1);
      set(p.hipL, 0.5, 0, 0); set(p.hipR, 0.5, 0, 0);
      set(p.kneeL, -0.9, 0, 0); set(p.kneeR, -0.9, 0, 0);
      break;
    case 'wallslide':
      set(p.shoulderL, -2.1, 0, 0); set(p.shoulderR, -0.5, 0, 0);
      set(p.hipL, 0.45, 0, 0); set(p.hipR, -0.2, 0, 0);
      set(p.kneeL, -0.6, 0, 0);
      break;
    case 'walljump':
      set(p.hipL, 0.7, 0, 0); set(p.hipR, -0.5, 0, 0);
      set(p.shoulderL, -1.6, 0, 0); set(p.shoulderR, -0.4, 0, 0);
      break;
    case 'dash':
      p.body.rotation.z = -facing * 0.42;
      set(p.hipL, 0.6, 0, 0); set(p.hipR, -0.6, 0, 0);
      set(p.shoulderL, 1.1, 0, 0); set(p.shoulderR, -1.1, 0, 0);
      break;
    case 'pulse': case 'socket': case 'relay':
      set(p.shoulderL, -1.5, 0, 0.25); set(p.shoulderR, -1.5, 0, -0.25);
      set(p.elbowL, -0.4, 0, 0); set(p.elbowR, -0.4, 0, 0);
      break;
    case 'hurt':
      p.body.rotation.z = 0.3;
      set(p.shoulderL, -0.8, 0, 0); set(p.shoulderR, -0.8, 0, 0);
      break;
    case 'shield':
      p.body.scale.set(1.06, 1.06, 1.06);
      break;
    case 'shutdown':
      p.body.rotation.z = 1.25;
      p.body.position.y = -0.18;
      break;
    case 'reboot':
      p.body.position.y = Math.max(0, 0.18 - t * 0.35);
      break;
    case 'lift':
      set(p.head, 0, 0, -0.12);
      break;
    default: // idle scanning
      set(p.head, 0, Math.sin(t * 1.4) * 0.35, 0);
      p.body.position.y = Math.sin(t * 2.1) * 0.018;
      set(p.antenna, 0, 0, Math.sin(t * 3) * 0.18);
      set(p.cape, 0, 0, Math.sin(t * 2.4) * 0.09);
      break;
  }
  set(p.cape, 0, 0, Math.sin(t * 3.1) * 0.11 + (anim === 'run' ? -0.25 : 0));
  set(p.antenna, 0, 0, Math.sin(t * 3.4) * 0.2 + (anim === 'dash' ? 0.5 : 0));
  const pulse = 0.5 + 0.5 * Math.sin(t * 6);
  if (p.core && p.core.userData.ownMat) p.core.userData.ownMat.emissiveIntensity = 1.1 + pulse * 1.1;
  if (p.lens && p.lens.userData.ownMat) {
    p.lens.userData.ownMat.emissiveIntensity = anim === 'shutdown' ? 0.15 : 1.6 + pulse * 0.6;
  }
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

export function buildEnemy(type) {
  const root = new THREE.Group();
  const parts = {};

  if (type === 'skitter') {
    const body = group(root, 0, 0, 0); parts.body = body;
    M.steel(body, 0, 0.24, 0, 0.86, 0.3, 0.5);
    M.dark(body, 0, 0.42, 0, 0.7, 0.1, 0.42);
    cube(body, 0, 0.26, 0.26, 0.5, 0.09, 0.04, C.amber, { emissive: C.amber, ei: 0.8, unique: true });
    parts.sensor = body.children[body.children.length - 1];
    // six thin jointed legs
    parts.legs = [];
    for (let i = 0; i < 3; i++) {
      for (const s of [-1, 1]) {
        const leg = group(body, s * 0.42, 0.22, (i - 1) * 0.16);
        M.dark(leg, s * 0.11, -0.09, 0, 0.24, 0.05, 0.045);
        M.dark(leg, s * 0.2, -0.18, 0, 0.045, 0.2, 0.045);
        parts.legs.push(leg);
      }
    }
    // trailing cable
    const cable = group(body, -0.45, 0.28, 0); parts.cable = cable;
    for (let i = 0; i < 4; i++) M.dark(cable, -i * 0.1, -i * 0.02, 0, 0.1, 0.035, 0.035);
  } else if (type === 'drone') {
    const core = group(root, 0, 0, 0); parts.body = core;
    cube(core, 0, 0, 0, 0.42, 0.42, 0.42, C.crystal, { emissive: C.crystal, ei: 0.25 });
    cube(core, 0, 0, 0.23, 0.26, 0.26, 0.06, C.charcoal);
    const lens = M.glow(core, 0, 0, 0.27, 0.13, 0.13, 0.05, C.crystalCore, 1.8);
    parts.lens = lens;
    const orbit = group(core, 0, 0, 0); parts.orbit = orbit;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      cube(orbit, Math.cos(a) * 0.44, Math.sin(a) * 0.44, 0, 0.2, 0.06, 0.16, C.steel, { tex: 'steel' });
    }
  } else { // sentinel
    const body = group(root, 0, 0, 0); parts.body = body;
    M.steel(body, 0, 0.0, -0.1, 0.9, 1.5, 0.5);
    M.dark(body, 0, 0.0, 0.16, 0.74, 1.3, 0.06);
    const core = M.glow(body, 0, 0.0, 0.21, 0.34, 0.34, 0.06, C.danger, 1.4);
    parts.core = core;
    const panelL = group(body, -0.22, 0, 0.24); parts.panelL = panelL;
    const panelR = group(body, 0.22, 0, 0.24); parts.panelR = panelR;
    M.steel(panelL, 0, 0, 0, 0.42, 1.35, 0.09);
    M.steel(panelR, 0, 0, 0, 0.42, 1.35, 0.09);
    const lamp = M.glow(body, 0, 0.68, 0.24, 0.14, 0.1, 0.05, C.danger, 0.4);
    parts.lamp = lamp;
  }
  root.userData.parts = parts;
  return root;
}

export function poseEnemy(model, e, t) {
  const p = model.userData.parts;
  const off = e.disabled ? 1 : 0;
  if (p.body) p.body.rotation.z = off * 0.9;
  if (p.lens && p.lens.userData.ownMat) {
    p.lens.userData.ownMat.emissiveIntensity = e.disabled ? 0.1 : e.stunned > 0 ? 0.4 : 1.6;
  }
  if (p.core && p.core.userData.ownMat) {
    p.core.userData.ownMat.emissiveIntensity = e.disabled ? 0.05 :
      e.state === 'venting' ? 2.2 : e.state === 'warning' ? 1.6 + Math.sin(t * 22) * 0.8 : 0.5;
  }
  if (p.lamp && p.lamp.userData.ownMat) {
    p.lamp.userData.ownMat.emissiveIntensity = e.state === 'warning' || e.state === 'firing' ? 2.2 : 0.15;
  }
  if (p.panelL && p.panelR) {
    const open = e.state === 'venting' || e.disabled ? 0.28 : 0;
    p.panelL.position.x = -0.22 - open;
    p.panelR.position.x = 0.22 + open;
  }
  if (p.orbit) p.orbit.rotation.z = t * (e.disabled ? 0 : 1.5);
  if (p.sensor && p.sensor.userData.ownMat) {
    p.sensor.userData.ownMat.emissiveIntensity = e.disabled ? 0.05 : e.stunned > 0 ? 0.2 : 1.0;
  }
  if (p.legs) {
    for (let i = 0; i < p.legs.length; i++) {
      p.legs[i].rotation.z = e.disabled ? 0 : Math.sin(t * 10 + i) * 0.28;
    }
  }
  if (p.cable) p.cable.rotation.z = Math.sin(t * 2.2) * 0.2;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export function buildProp(kind, def = {}) {
  const root = new THREE.Group();
  const parts = {};

  switch (kind) {
    case 'cell': {
      buildCellMesh(root, 0, 0.33, 0, 1);
      break;
    }
    case 'socket': {
      M.steel(root, 0, 0.55, -0.15, 0.9, 1.1, 0.24);
      M.dark(root, 0, 0.55, -0.01, 0.62, 0.8, 0.06);
      const glow = M.glow(root, 0, 0.55, 0.03, 0.5, 0.66, 0.04, C.amber, 0.15);
      parts.glow = glow;
      M.trim(root, 0, 1.11, -0.15, 0.96, 0.08, 0.28);
      break;
    }
    case 'relay': {
      M.steel(root, 0, 0.42, -0.12, 0.9, 0.84, 0.5);
      M.dark(root, 0, 0.9, -0.12, 0.7, 0.12, 0.5);
      const node = M.glow(root, 0, 1.35, 0.05, 0.42, 0.42, 0.3, C.crystalCore, 0.5);
      parts.node = node;
      for (const s of [-1, 1]) {
        M.steel(root, s * 0.34, 1.55, -0.12, 0.1, 0.5, 0.14);
      }
      break;
    }
    case 'station': {
      M.steel(root, 0, 0.14, 0, 1.1, 0.28, 0.8);
      M.dark(root, 0, 0.7, -0.1, 0.5, 1.1, 0.4);
      const ring = M.glow(root, 0, 1.32, 0.05, 0.62, 0.14, 0.3, C.teal, 1.0);
      parts.ring = ring;
      M.glow(root, 0, 0.7, 0.13, 0.24, 0.6, 0.05, C.teal, 0.8);
      break;
    }
    case 'switch': {
      M.steel(root, 0, 0.3, -0.1, 0.7, 0.6, 0.3);
      const lever = group(root, 0, 0.62, 0.1); parts.lever = lever;
      M.trim(lever, 0, 0.14, 0, 0.1, 0.34, 0.1);
      const lamp = M.glow(root, 0, 0.66, 0.06, 0.14, 0.14, 0.06, C.amber, 0.15);
      parts.lamp = lamp;
      break;
    }
    case 'archive': {
      M.steel(root, 0, 0.18, 0, 0.8, 0.36, 0.5);
      const slab = M.glow(root, 0, 0.66, 0.05, 0.4, 0.56, 0.1, C.crystalCore, 0.9);
      parts.slab = slab;
      break;
    }
    case 'cache': {
      M.steel(root, 0, 0.3, 0, 0.8, 0.6, 0.6);
      M.trim(root, 0, 0.6, 0, 0.86, 0.08, 0.66);
      const lid = group(root, 0, 0.6, -0.3); parts.lid = lid;
      M.dark(lid, 0, 0.04, 0.3, 0.78, 0.08, 0.6);
      break;
    }
    case 'shutter': {
      M.steel(root, 0, 0, 0, 1, 1, 0.42);
      for (let i = 0; i < 5; i++) M.dark(root, 0, -0.4 + i * 0.2, 0.22, 0.9, 0.04, 0.04);
      break;
    }
    case 'seam': {
      cube(root, 0, 0, 0, 1, 1, 0.5, 0x6d5330, { tex: 'crystal' });
      cube(root, -0.22, 0.12, 0.26, 0.42, 0.58, 0.06, 0x8a6a3c, { tex: 'crystal' });
      cube(root, 0.2, -0.18, 0.26, 0.44, 0.5, 0.06, 0x5c4326, { tex: 'crystal' });
      // A visible fracture pattern exists before discovery; hidden marks only
      // gain their bright glow when an echo pulse reaches them.
      const fractures = [];
      for (let i = 0; i < 5; i++) {
        fractures.push(M.glow(root, -0.34 + i * 0.17,
          -0.4 + i * 0.19 + (i % 2) * 0.05, 0.29,
          0.1, 0.32, 0.03, C.amberCore, 0.0));
      }
      parts.fractures = fractures;
      break;
    }
    case 'platform': {
      M.steel(root, 0, 0, 0, 1, 1, 0.8);
      M.trim(root, 0, 0.42, 0, 1, 0.12, 0.86);
      break;
    }
    case 'conduit': {
      const g = M.glow(root, 0, 0, 0, 1, 1, 0.12, C.amber, 0.12);
      parts.glow = g;
      break;
    }
    case 'vent': {
      M.steel(root, 0, 0.08, 0, 1, 0.16, 0.8);
      for (let i = 0; i < 4; i++) M.dark(root, -0.35 + i * 0.23, 0.17, 0, 0.1, 0.04, 0.7);
      const jet = M.glow(root, 0, 1.5, 0, 0.8, 2.8, 0.5, C.danger, 0.0);
      parts.jet = jet;
      break;
    }
    case 'lift': {
      M.steel(root, 0, 0, 0, 3.2, 0.3, 1.6);
      M.trim(root, 0, 0.16, 0, 3.2, 0.08, 1.6);
      for (const s of [-1, 1]) {
        M.steel(root, s * 1.5, 0.9, -0.3, 0.16, 1.8, 0.16);
        M.glow(root, s * 1.5, 1.5, -0.2, 0.1, 0.1, 0.1, C.amber, 0.8);
      }
      const barrier = group(root, 0, 0.9, 0.75); parts.barrier = barrier;
      M.trim(barrier, 0, 0, 0, 3.0, 1.6, 0.08);
      barrier.visible = false;
      const consoleG = group(root, 1.1, 0.35, -0.3); parts.console = consoleG;
      M.dark(consoleG, 0, 0, 0, 0.5, 0.5, 0.3);
      M.glow(consoleG, 0, 0.1, 0.16, 0.3, 0.18, 0.04, C.teal, 0.4);
      break;
    }
    case 'sign': {
      M.steel(root, 0, 0, 0, 1.6, 0.5, 0.12);
      M.glow(root, 0, 0, 0.07, 1.4, 0.34, 0.03, C.amber, 0.25);
      break;
    }
  }
  root.userData.parts = parts;
  return root;
}

export { M, getMat, boxGeo };
