// DEEPWAKE - Three.js scene construction and rendering.
// All geometry comes from LEVEL. Rendering reads world state; it never
// determines collisions or gameplay state.

import * as THREE from 'three';
import { C, T } from './constants.js';
import { LEVEL } from './level.js';
import { buildILO, poseILO, buildEnemy, poseEnemy, buildProp, M, TEX, cube, group } from './voxels.js';
import { pulseRadiusAt } from './sim.js';

const SOLID_Z = -0.8;
const SOLID_D = 1.6;
const ACTOR_Z = 0.45;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

export function createRenderer(canvas) {
  let renderer = null;
  let available = false;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    available = true;
  } catch { available = false; }

  if (!renderer) {
    // Graceful fallback: the game keeps running without a 3D view.
    return {
      available: false,
      resize() {}, sync() {}, render() {}, onEvent() {}, clearEffects() {},
      setEnding() {}, setReducedMotion() {}, dispose() {},
      cameraInfo: () => ({ x: 0, y: 0 }),
    };
  }

  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(C.bg, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.bg);
  scene.fog = new THREE.Fog(C.bg, 31, 78);

  const camera = new THREE.OrthographicCamera(-12, 12, 7, -7, 0.1, 200);
  camera.position.set(0, 4, 20);
  camera.lookAt(0, 1, 0);

  // ---- Lighting: a small number of purposeful real lights ----------------
  const ambientLight = new THREE.AmbientLight(0x67809a, 1.75);
  const hemiLight = new THREE.HemisphereLight(0x56718a, 0x182632, 1.0);
  scene.add(ambientLight, hemiLight);
  const key = new THREE.DirectionalLight(0xbcd2e0, 1.15);
  key.position.set(6, 14, 10);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x3b6480, 0.6);
  rim.position.set(-8, 5, -6);
  scene.add(rim);

  const relayLights = {};
  for (const r of LEVEL.relays) {
    const l = new THREE.PointLight(C.amber, 0, 11, 2);
    l.position.set(r.x, r.y + 1, 1.5);
    scene.add(l);
    relayLights[r.id] = l;
  }
  const playerLight = new THREE.PointLight(0xbfe0e8, 0.85, 9, 2);
  scene.add(playerLight);
  const surfaceLight = new THREE.PointLight(C.daylight, 0, 22, 2);
  surfaceLight.position.set(212, 13, 2);
  scene.add(surfaceLight);

  // ---- Static world ------------------------------------------------------
  const staticGroup = new THREE.Group();
  scene.add(staticGroup);
  const regionOf = (x) => {
    for (const r of LEVEL.regions) if (x >= r.x1 && x < r.x2) return r.id;
    return 'workshop';
  };

  for (const s of LEVEL.solids) {
    const reg = regionOf(s.x);
    const mat = s.mat || (reg === 'workshop' ? 'rock' : reg === 'reservoir' ? 'rock' : 'steel');
    const box = s.oneWay ? M.trim : (s.wallJump ? M.rock : mat === 'steel' ? M.steel : mat === 'trim' ? M.trim : M.rock);
    // M.* helpers take (parent,x,y,z,w,h,d) with centre coordinates.
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const depth = s.oneWay ? 1.5 : SOLID_D;
    const cz = s.oneWay ? -0.35 : SOLID_Z;
    box(staticGroup, cx, cy, cz, s.w, s.h, depth);
    // Readable top edge trim on floors / ledges (not on tall walls).
    if (s.h <= 4.2 && s.w >= 0.8) {
      cube(staticGroup, cx, s.y + s.h + 0.045, cz, s.w, 0.09, depth + 0.06, C.edge, { emissive: C.edge, ei: 0.22 });
    }
    if (s.wallJump) {
      // Lighter vertical trim marks a valid wall-jump surface.
      cube(staticGroup, s.x + s.w + 0.02, cy, cz + 0.05, 0.06, s.h, depth * 0.4, C.edge, { emissive: C.edge, ei: 0.35 });
    }
  }

  // ---- Water --------------------------------------------------------------
  const waterMat = new THREE.MeshBasicMaterial({
    color: C.water, map: TEX.water, transparent: true, opacity: 0.72, depthWrite: false,
  });
  const shallowMat = new THREE.MeshBasicMaterial({
    color: 0x4f9fa8, map: TEX.water, transparent: true, opacity: 0.32, depthWrite: false,
  });
  for (const wdef of LEVEL.water) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(wdef.w, wdef.kill ? 0.06 : wdef.h),
      wdef.kill ? waterMat : shallowMat,
    );
    plane.position.set(wdef.x + wdef.w / 2, wdef.y + wdef.h, wdef.kill ? -1.2 : -2.2);
    if (!wdef.kill) plane.rotation.x = -Math.PI / 2.6;
    staticGroup.add(plane);
  }

  // ---- Background decor (never collides) ---------------------------------
  const decorGroups = [];
  const decoRock = new THREE.MeshLambertMaterial({ color: 0x293845, map: TEX.rock });
  const decoSteel = new THREE.MeshLambertMaterial({ color: 0x2a3743, map: TEX.steel });
  const decoCrystal = new THREE.MeshLambertMaterial({ color: 0x1c3b40, emissive: 0x0d2c30, emissiveIntensity: 0.3 });
  for (const d of LEVEL.decor) {
    const g = new THREE.Group();
    g.position.z = d.z || -5;
    const r = (seed) => { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };
    const rand = r(Math.floor((d.x1 || d.x || 0) * 91) + 7);
    if (d.kind === 'pillars' || d.kind === 'shaftWalls') {
      for (let x = d.x1; x < d.x2; x += 7 + Math.floor(rand() * 4)) {
        const h = 5 + rand() * 7;
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.3 + rand(), h, 1.3), decoRock);
        m.position.set(x, h / 2 - 1, 0);
        g.add(m);
      }
    } else if (d.kind === 'cables' || d.kind === 'pipes') {
      for (let x = d.x1; x < d.x2; x += 3.5) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3 + rand() * 3, 0.06), decoSteel);
        m.position.set(x, 6, 0);
        m.rotation.z = (rand() - 0.5) * 0.25;
        g.add(m);
      }
    } else if (d.kind === 'crystals') {
      for (let x = d.x1; x < d.x2; x += 4.5) {
        const h = 1.5 + rand() * 3.5;
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.3 + rand() * 0.3, h, 0.45), decoCrystal);
        m.position.set(x, h / 2 - 1.5, 0);
        m.rotation.z = (rand() - 0.5) * 0.4;
        g.add(m);
      }
    } else if (d.kind === 'presses') {
      for (let x = d.x1; x < d.x2; x += 11) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5, 2), decoSteel);
        m.position.set(x, 2.5, 0);
        g.add(m);
        const rod = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 0.4), decoSteel);
        rod.position.set(x, 5.5, 0);
        g.add(rod);
      }
    } else if (d.kind === 'waterfall') {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 14), new THREE.MeshBasicMaterial({
        color: 0x4f9fa8, transparent: true, opacity: 0.18, depthWrite: false,
      }));
      m.position.set(d.x, 4, 0);
      g.add(m);
    }
    scene.add(g);
    decorGroups.push({ group: g, factor: 0.1 + Math.abs(d.z || -5) * 0.012 });
  }

  // ---- Conduits -----------------------------------------------------------
  const conduitMeshes = {};
  for (const cd of LEVEL.conduits) {
    const m = buildProp('conduit');
    m.position.set(cd.x + cd.w / 2, cd.y + cd.h / 2, -0.15);
    m.scale.set(cd.w, cd.h, 1);
    scene.add(m);
    conduitMeshes[cd.id] = m;
  }

  // ---- Dynamic props ------------------------------------------------------
  const dyn = {
    seams: {}, shutters: {}, platforms: {}, cells: {}, sockets: {},
    relays: {}, stations: {}, switches: {}, archives: {}, caches: {},
    vents: {}, enemies: {},
  };

  function place(mesh, x, y, z, w, h, d) {
    mesh.position.set(x + w / 2, y + h / 2, z);
    mesh.scale.set(w, h, d);
  }

  for (const s of LEVEL.seams) {
    const m = buildProp('seam');
    place(m, s.x, s.y, -0.25, s.w, s.h, 0.7);
    scene.add(m); dyn.seams[s.id] = m;
  }
  for (const s of LEVEL.shutters) {
    const m = buildProp('shutter');
    place(m, s.x, s.y, -0.2, s.w, s.h, 0.7);
    scene.add(m); dyn.shutters[s.id] = m;
  }
  for (const p of LEVEL.platforms) {
    const m = buildProp('platform');
    m.position.set(0, 0, -0.1);
    m.scale.set(p.w, p.h, 1.3);
    scene.add(m); dyn.platforms[p.id] = m;
  }
  for (const c of LEVEL.cells) {
    const m = buildProp('cell');
    m.position.set(c.x, c.y, 0.1);
    scene.add(m); dyn.cells[c.id] = m;
  }
  for (const s of LEVEL.sockets) {
    const m = buildProp('socket');
    m.position.set(s.x, 0, 0.0);
    scene.add(m); dyn.sockets[s.id] = m;
  }
  for (const r of LEVEL.relays) {
    const m = buildProp('relay');
    m.position.set(r.x, 0, -0.05);
    scene.add(m); dyn.relays[r.id] = m;
  }
  for (const s of LEVEL.stations) {
    const m = buildProp('station');
    m.position.set(s.x, s.y, -0.05);
    scene.add(m); dyn.stations[s.id] = m;
  }
  for (const s of LEVEL.switches) {
    const m = buildProp('switch');
    m.position.set(s.x, s.y, 0.0);
    scene.add(m); dyn.switches[s.id] = m;
  }
  for (const a of LEVEL.archives) {
    const m = buildProp('archive');
    m.position.set(a.x, a.y, 0.05);
    scene.add(m); dyn.archives[a.id] = m;
  }
  for (const c of LEVEL.caches) {
    const m = buildProp('cache');
    m.position.set(c.x, c.y, 0.05);
    scene.add(m); dyn.caches[c.id] = m;
  }
  for (const v of LEVEL.vents) {
    const m = buildProp('vent');
    m.position.set(v.x + v.w / 2, v.y, -0.15);
    m.scale.set(v.w, 1, 0.8);
    // Jet volume is a separate child so it can reach the authored height.
    const jet = m.userData.parts.jet;
    jet.scale.set(0.8, v.h, 0.5);
    jet.position.set(0, v.h / 2, 0);
    scene.add(m); dyn.vents[v.id] = m;
  }
  for (const e of LEVEL.enemies) {
    const m = buildEnemy(e.type);
    if (e.type === 'sentinel') m.position.set(e.x, e.y, -0.35);
    else m.position.set(e.x, e.y, ACTOR_Z - 0.05);
    scene.add(m); dyn.enemies[e.id] = m;
  }

  // A few in-world tutorial plaques.
  for (const h of LEVEL.hints) {
    const m = buildProp('sign');
    m.position.set((h.x1 + h.x2) / 2, 2.35, -0.5);
    m.scale.set(1, 1, 1);
    scene.add(m);
  }

  // ---- Final lift and surface opening ------------------------------------
  const L = LEVEL.lift;
  const liftMesh = buildProp('lift');
  liftMesh.position.set(L.console.x - 0.5, L.deckY, 0);
  scene.add(liftMesh);

  const paleOpening = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 4),
    new THREE.MeshBasicMaterial({ color: 0x8fa6b4, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  paleOpening.position.set(212, L.surfaceOpeningY + 1.5, -3.5);
  scene.add(paleOpening);

  const daylight = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 30),
    new THREE.MeshBasicMaterial({ color: C.daylight, transparent: true, opacity: 0, depthWrite: false }),
  );
  daylight.position.set(212, 11, -6);
  scene.add(daylight);

  // Surface terrace revealed at the very end.
  const terrace = new THREE.Group();
  M.steel(terrace, 0, -0.4, 0, 9, 0.8, 3);
  M.trim(terrace, 0, 0.06, 0, 9, 0.12, 3);
  for (const s of [-1, 1]) M.dark(terrace, s * 3.6, 0.8, -0.8, 0.4, 1.6, 0.4);
  terrace.position.set(212, L.surfaceOpeningY, 0);
  terrace.visible = false;
  scene.add(terrace);

  // ---- ILO ----------------------------------------------------------------
  const ilo = buildILO();
  ilo.position.set(LEVEL.spawn.x, LEVEL.spawn.y, ACTOR_Z);
  scene.add(ilo);

  // ---- Transient effects (pooled) ----------------------------------------
  const fxGroup = new THREE.Group();
  scene.add(fxGroup);
  const ringMat = new THREE.MeshBasicMaterial({ color: C.crystalCore, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const rings = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 48), ringMat.clone());
    m.visible = false;
    fxGroup.add(m);
    rings.push(m);
  }
  const trail = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.3),
      new THREE.MeshBasicMaterial({ color: C.teal, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    fxGroup.add(m);
    trail.push({ mesh: m, life: 0 });
  }
  const shards = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14),
      new THREE.MeshBasicMaterial({ color: C.crystal, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    fxGroup.add(m);
    shards.push({ mesh: m, life: 0, vx: 0, vy: 0 });
  }
  const shieldFacets = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.08),
      new THREE.MeshBasicMaterial({ color: C.teal, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    fxGroup.add(m);
    shieldFacets.push(m);
  }
  let beamMeshes = [];
  const beamMat = new THREE.MeshBasicMaterial({ color: C.danger, transparent: true, opacity: 0.55, depthWrite: false });
  const aimMat = new THREE.MeshBasicMaterial({ color: C.danger, transparent: true, opacity: 0.28, depthWrite: false });

  function ensureBeams(n) {
    while (beamMeshes.length < n) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.12), beamMat.clone());
      m.visible = false;
      fxGroup.add(m);
      beamMeshes.push(m);
    }
  }

  let trailCursor = 0, shardCursor = 0;
  let reducedMotion = false;
  let ending = null;
  let viewW = 24, viewH = 14;
  let camX = LEVEL.spawn.x + 8, camY = 2.5;
  let shake = 0;
  let conduitFlash = 0;

  function onEvent(e) {
    if (e.type === 'seamBreak') {
      const s = LEVEL.seams.find((o) => o.id === e.id);
      if (s) {
        for (let i = 0; i < 7; i++) {
          const sh = shards[shardCursor++ % shards.length];
          sh.mesh.position.set(s.x + s.w / 2 + (Math.random() - 0.5) * 0.6, s.y + s.h / 2 + (Math.random() - 0.5) * s.h, 0.4);
          sh.vx = (Math.random() - 0.5) * 4;
          sh.vy = 1 + Math.random() * 3;
          sh.life = 0.65;
          sh.mesh.material.opacity = 0.9;
          sh.mesh.visible = true;
        }
      }
    } else if (e.type === 'hurt' || e.type === 'shield') {
      if (!reducedMotion) shake = e.type === 'hurt' ? 0.12 : 0.06;
    } else if (e.type === 'relay') {
      conduitFlash = 1.0;
    }
  }

  function clearEffects() {
    for (const r of rings) r.visible = false;
    for (const t of trail) { t.life = 0; t.mesh.visible = false; }
    for (const s of shards) { s.life = 0; s.mesh.visible = false; }
    for (const f of shieldFacets) f.visible = false;
    shake = 0;
    conduitFlash = 0;
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    const aspect = Math.max(0.2, w / Math.max(1, h));
    viewW = clamp(14 * aspect, 11, 30);
    viewH = viewW / aspect;
    camera.left = -viewW / 2; camera.right = viewW / 2;
    camera.top = viewH / 2; camera.bottom = -viewH / 2;
    camera.updateProjectionMatrix();
  }

  function setEnding(e) { ending = e; }
  function setReducedMotion(v) { reducedMotion = !!v; if (v) shake = 0; }

  function cameraZone(x) {
    for (const z of LEVEL.cameraZones) if (x >= z.x1 && x < z.x2) return z;
    return LEVEL.cameraZones[LEVEL.cameraZones.length - 1];
  }

  function sync(w, dt, view = {}) {
    const p = w.player;

    // ---- ILO ----
    let ix = p.x, iy = p.y, anim = p.anim, facing = p.facing;
    if (ending && ending.active) {
      ix = ending.iloX; iy = ending.iloY;
      anim = ending.phase === 'rise' ? 'lift' : ending.phase === 'surface' ? 'walk' : 'idle';
      facing = 1;
      ilo.position.set(ix, iy, ACTOR_Z);
    } else {
      ilo.position.set(ix, iy, ACTOR_Z);
    }
    poseILO(ilo, anim, p.animTime, facing, { carrying: !!p.carrying });
    playerLight.position.set(ix, iy + 1.1, 2.2);
    playerLight.intensity = p.dead ? 0.25 : 0.85;

    // ---- Seams ----
    for (const s of LEVEL.seams) {
      const m = dyn.seams[s.id];
      const broken = w.seams[s.id].broken;
      m.visible = !broken;
      if (!broken) {
        const hi = w.highlights[s.id] || 0;
        const ei = s.hiddenMark ? (hi > 0 ? 1.8 : 0.04) : 0.95;
        for (const f of m.userData.parts.fractures) {
          f.userData.ownMat.emissiveIntensity = ei;
        }
      }
    }
    // ---- Shutters ----
    for (const s of LEVEL.shutters) dyn.shutters[s.id].visible = !w.shutters[s.id].open;

    // ---- Platforms ----
    for (const def of LEVEL.platforms) {
      const st = w.platforms[def.id];
      const m = dyn.platforms[def.id];
      m.position.set(st.x + def.w / 2, st.y + def.h / 2, -0.1);
      m.scale.set(def.w, def.h, 1.3);
    }

    // ---- Cells: loose, carried (hidden, shown on ILO), or socketed ----
    for (const c of LEVEL.cells) {
      const st = w.cells[c.id];
      const m = dyn.cells[c.id];
      if (st.carried) { m.visible = false; continue; }
      m.visible = true;
      if (st.socket) {
        const s = LEVEL.sockets.find((o) => o.id === st.socket);
        m.position.set(s.x - 0.0, s.y - 0.55, 0.22);
        m.scale.setScalar(0.82);
      } else {
        m.position.set(st.x, st.y, 0.1);
        m.scale.setScalar(1);
      }
    }

    // ---- Sockets / relays / conduits / stations / switches ----
    for (const s of LEVEL.sockets) {
      const powered = w.sockets[s.id].cell !== null;
      const g = dyn.sockets[s.id].userData.parts.glow;
      g.userData.ownMat.emissiveIntensity = powered ? 1.6 : 0.12;
    }
    for (const r of LEVEL.relays) {
      const st = w.relays[r.id];
      const node = dyn.relays[r.id].userData.parts.node;
      node.userData.ownMat.emissiveIntensity = st.active ? 2.4 : st.powered ? 1.1 : 0.25;
      node.userData.ownMat.color.setHex(st.active ? C.crystalCore : st.powered ? C.amber : C.crystal);
      relayLights[r.id].intensity = st.active ? 1.5 : 0;
      relayLights[r.id].color.setHex(st.active ? C.teal : C.amber);
    }
    for (const cd of LEVEL.conduits) {
      const m = conduitMeshes[cd.id];
      let lit = 0.08;
      if (cd.relay === 'ALL') lit = (w.relays.A.active ? 0.3 : 0) + (w.relays.B.active ? 0.3 : 0) + (w.relays.C.active ? 0.3 : 0);
      else lit = w.relays[cd.relay] && w.relays[cd.relay].active ? 1.5 : (w.relays[cd.relay] && w.relays[cd.relay].powered ? 0.5 : 0.08);
      m.userData.parts.glow.userData.ownMat.emissiveIntensity = lit + conduitFlash * 0.8;
    }
    for (const s of LEVEL.stations) {
      const ring = dyn.stations[s.id].userData.parts.ring;
      const active = w.checkpoint && w.checkpoint.stationId === s.id;
      ring.userData.ownMat.emissiveIntensity = active ? 1.7 : 0.7;
    }
    for (const s of LEVEL.switches) {
      const on = w.switches[s.id].on;
      const m = dyn.switches[s.id].userData.parts;
      m.lamp.userData.ownMat.emissiveIntensity = on ? 1.8 : 0.15;
      m.lever.rotation.z = on ? -0.7 : 0.5;
    }
    for (const a of LEVEL.archives) {
      const m = dyn.archives[a.id];
      m.visible = !w.archives[a.id].collected;
      const hi = w.highlights[a.id] || 0;
      m.userData.parts.slab.userData.ownMat.emissiveIntensity = 0.7 + hi * 0.3;
    }
    for (const c of LEVEL.caches) {
      const m = dyn.caches[c.id];
      m.visible = !w.caches[c.id].collected;
      m.userData.parts.lid.rotation.x = w.caches[c.id].collected ? -0.9 : 0;
    }

    // ---- Vents ----
    for (const v of LEVEL.vents) {
      const stage = w.vents[v.id].stage;
      const jet = dyn.vents[v.id].userData.parts.jet;
      jet.userData.ownMat.emissiveIntensity = stage === 'active' ? 1.8 : stage === 'warning' ? 0.35 : 0.0;
      jet.userData.ownMat.color.setHex(stage === 'active' ? C.danger : C.amber);
      jet.material.transparent = true;
      jet.material.opacity = stage === 'active' ? 0.42 : stage === 'warning' ? 0.12 : 0.0;
      jet.visible = stage !== 'dormant';
    }

    // ---- Enemies ----
    ensureBeams(Object.keys(w.enemies).length * 2);
    let bi = 0;
    for (const def of LEVEL.enemies) {
      const e = w.enemies[def.id];
      const m = dyn.enemies[def.id];
      m.visible = true;
      m.position.x = e.x;
      m.position.y = e.y;
      poseEnemy(m, e, w.time);
      if (e.type === 'sentinel') {
        // warning line and active beam both use the visible lane
        if (e.state === 'warning') {
          const b = beamMeshes[bi++];
          const len = def.laneLength;
          b.position.set(e.x + len / 2, def.laneY, 0.55);
          b.scale.set(len, 0.12, 1);
          b.material.color.setHex(C.danger);
          b.material.opacity = 0.28;
          b.visible = true;
        }
        if (e.beam) {
          const b = beamMeshes[bi++];
          b.position.set(e.beam.x + e.beam.w / 2, e.beam.y + e.beam.h / 2, 0.55);
          b.scale.set(e.beam.w, e.beam.h, 1);
          b.material.color.setHex(C.danger);
          b.material.opacity = 0.62;
          b.visible = true;
        }
      }
      if (e.type === 'drone' && e.state === 'aim' && e.aim) {
        const b = beamMeshes[bi++];
        const len = 6;
        b.position.set(e.x + e.aim.x * len / 2, e.y + 0.5 + e.aim.y * len / 2, 0.55);
        b.scale.set(len * Math.abs(e.aim.x) + 0.1, len * Math.abs(e.aim.y) + 0.1, 1);
        b.material.color.setHex(C.amber);
        b.material.opacity = 0.22;
        b.visible = true;
      }
    }
    for (let i = bi; i < beamMeshes.length; i++) beamMeshes[i].visible = false;

    // ---- Pulse rings ----
    for (let i = 0; i < rings.length; i++) {
      const pulse = w.pulses[i];
      const m = rings[i];
      if (!pulse) { m.visible = false; continue; }
      const r = pulseRadiusAt(pulse.age);
      m.visible = true;
      m.position.set(pulse.x, pulse.y, 0.7);
      m.scale.setScalar(Math.max(0.01, r));
      m.material.opacity = clamp(1 - pulse.age / (T.pulseExpand + 0.45), 0, 1) * 0.75;
    }

    // ---- Dash trail ----
    if (p.dashTimer > 0 && !p.dead) {
      const t = trail[trailCursor++ % trail.length];
      t.mesh.position.set(p.x, p.y + 0.7, 0.25);
      t.mesh.material.opacity = 0.4;
      t.mesh.visible = true;
      t.life = 0.22;
    }
    for (const t of trail) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / 0.22) * 0.4;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    // ---- Shield facets ----
    for (let i = 0; i < shieldFacets.length; i++) {
      const f = shieldFacets[i];
      f.visible = p.shieldFx > 0;
      if (f.visible) {
        const a = (i / shieldFacets.length) * Math.PI * 2 + w.time * 6;
        f.position.set(p.x + Math.cos(a) * 0.55, p.y + 0.8 + Math.sin(a) * 0.55, 0.7);
        f.rotation.z = a;
        f.material.opacity = clamp(p.shieldFx / 0.35, 0, 1) * 0.8;
      }
    }
    // ---- Crystal shards ----
    for (const s of shards) {
      if (s.life > 0) {
        s.life -= dt;
        s.mesh.position.x += s.vx * dt;
        s.mesh.position.y += s.vy * dt;
        s.vy -= 14 * dt;
        s.mesh.rotation.x += dt * 6;
        s.mesh.material.opacity = clamp(s.life / 0.65, 0, 1);
        if (s.life <= 0) s.mesh.visible = false;
      }
    }

    // ---- Ending visuals ----
    if (ending && ending.active) {
      const dim = ending.phase === 'rise' ? 0.45 + (1 - ending.p) * 0.55 :
        ending.phase === 'barrier' ? 1 : 1.25;
      ambientLight.intensity = 1.75 * dim;
      hemiLight.intensity = 1.0 * dim;
      const riseY = ending.phase === 'rise' ? ending.p : 1;
      liftMesh.position.y = L.deckY + riseY * (L.topY - L.deckY);
      liftMesh.userData.parts.barrier.visible = ending.phase !== 'idle';
      daylight.material.opacity = ending.phase === 'surface' ? clamp(ending.p, 0, 1) * 0.6 :
        ending.phase === 'complete' ? 0.6 : 0;
      surfaceLight.intensity = ending.phase === 'surface' || ending.phase === 'complete' ? 2.2 : 0;
      terrace.visible = ending.phase === 'surface' || ending.phase === 'complete';
      paleOpening.material.opacity = 0.5;
    } else {
      ambientLight.intensity = 1.75;
      hemiLight.intensity = 1.0;
      liftMesh.position.y = L.deckY;
      liftMesh.userData.parts.barrier.visible = false;
      daylight.material.opacity = 0;
      surfaceLight.intensity = 0;
      terrace.visible = false;
    }

    // ---- Camera ----
    const zone = cameraZone(p.x);
    const desiredX = p.x + p.facing * 1.4 + clamp(p.vx * 0.06, -0.9, 0.9);
    const halfW = viewW / 2;
    let lo = zone.x1 - 2 + halfW, hi = zone.x2 + 2 - halfW;
    if (lo > hi) { const mid = (zone.x1 + zone.x2) / 2; lo = mid; hi = mid; }
    const targetX = clamp(desiredX, lo, hi);
    const targetY = clamp(p.y + 1.5, zone.minY, zone.maxY);
    const ease = 1 - Math.pow(0.0016, dt);
    camX = lerp(camX, targetX, ease);
    camY = lerp(camY, targetY, ease);
    if (reducedMotion) shake = 0;
    else shake = Math.max(0, shake - dt * 1.2);
    const sx = reducedMotion ? 0 : (Math.random() - 0.5) * shake;
    const sy = reducedMotion ? 0 : (Math.random() - 0.5) * shake;
    if (ending && ending.active && ending.phase !== 'idle') {
      camX = lerp(camX, 212, ease);
      camY = lerp(camY, L.deckY + clamp((liftMesh.position.y - L.deckY) * 0.55, 0, 8), ease);
    }
    camera.position.set(camX + sx, camY + 3 + sy, 20);
    camera.lookAt(camX, camY, 0);

    // ---- Background parallax ----
    for (const d of decorGroups) d.group.position.x = camX * d.factor;

    conduitFlash = Math.max(0, conduitFlash - dt * 1.6);
  }

  function render() { renderer.render(scene, camera); }

  function dispose() {
    clearEffects();
    renderer.dispose();
  }

  return {
    available, resize, sync, render, onEvent, clearEffects,
    setEnding, setReducedMotion, dispose,
    cameraInfo: () => ({ x: camX, y: camY, viewW, viewH }),
    scene, camera,
  };
}
