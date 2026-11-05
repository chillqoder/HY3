// DEEPWAKE - authoritative simulation.
// Pure JavaScript: no Three.js, no DOM, no audio. Everything here is
// deterministic and driven by fixed steps, so the same inputs always give the
// same result. The renderer, UI and audio only read from this state.

import { T, FIXED_DT } from './constants.js';
import { LEVEL, byId } from './level.js';

const EPS = 1e-4;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (v, target, step) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

const emit = (w, type, data = {}) => {
  w.events.push({ type, ...data });
  if (w.events.length > 256) w.events.splice(0, w.events.length - 256);
};

// ---------------------------------------------------------------------------
// World construction
// ---------------------------------------------------------------------------

function freshPlayer() {
  return {
    x: LEVEL.spawn.x, y: LEVEL.spawn.y, vx: 0, vy: 0, facing: 1,
    grounded: true, onWall: 0, wallSliding: false,
    coyote: T.coyote, jumpBuffer: 0, jumpHeld: false,
    dashTimer: 0, dashDir: 0, dashCooldown: 0, dashAvailable: true,
    steerLock: 0, pulseCooldown: 0,
    energy: T.energyMax, lastEnergyUse: -100,
    integrity: T.maxIntegrity, immunity: 0,
    carrying: null, standingOn: null,
    anim: 'idle', animTime: 0, shieldFx: 0, hurtFx: 0,
    dead: false,
  };
}

function freshEnemy(def) {
  const base = {
    id: def.id, type: def.type, x: def.x, y: def.y,
    state: def.type === 'skitter' ? 'dormant' :
           def.type === 'drone' ? 'patrol' : 'closed',
    facing: 1, timer: 0, stunned: 0, disabled: false,
    minX: def.minX, maxX: def.maxX, homeX: def.x, homeY: def.y,
    beam: null, cooldown: 0, aim: null, def,
  };
  if (def.type === 'sentinel') {
    base.timer = 1.4;
    base.dir = def.dir || 1;
  }
  return base;
}

export function createWorld() {
  const w = {
    version: 1, frame: 0, time: 0,
    player: freshPlayer(),
    relays: {}, sockets: {}, cells: {}, shutters: {}, seams: {},
    platforms: {}, vents: {}, enemies: {}, projectiles: [], pulses: [],
    highlights: {}, archives: {}, caches: {}, switches: {},
    latch: { upperRoute: false },
    lift: { used: false },
    discoveries: { archives: 0, caches: 0, machinesDisabled: 0 },
    recoveries: 0,
    checkpoint: { x: LEVEL.spawn.x, y: LEVEL.spawn.y, stationId: 'S0' },
    snapshot: null,
    relayFx: null, shutdown: null, reboot: null, ending: false,
    lastStation: null,
    crushTimer: 0,
    events: [],
  };
  resetDynamic(w);
  w.snapshot = takeSnapshot(w);
  return w;
}

function resetDynamic(w) {
  for (const r of LEVEL.relays) w.relays[r.id] = { powered: false, active: false };
  for (const s of LEVEL.sockets) w.sockets[s.id] = { cell: null };
  for (const c of LEVEL.cells) w.cells[c.id] = { x: c.x, y: c.y, inWorld: true, carried: false, socket: null };
  for (const s of LEVEL.shutters) w.shutters[s.id] = { open: false };
  for (const s of LEVEL.seams) w.seams[s.id] = { broken: false };
  for (const p of LEVEL.platforms) {
    const pos = platformPos(p, 0);
    w.platforms[p.id] = {
      x: p.axis === 'x' ? pos : p.x,
      y: p.axis === 'y' ? pos : p.y,
      t: 0, active: false, dx: 0, dy: 0,
    };
  }
  for (const v of LEVEL.vents) w.vents[v.id] = { t: v.offset % 3.5, stage: 'dormant' };
  for (const e of LEVEL.enemies) w.enemies[e.id] = freshEnemy(e);
  for (const a of LEVEL.archives) w.archives[a.id] = { collected: false, showUntil: 0 };
  for (const c of LEVEL.caches) w.caches[c.id] = { collected: false };
  for (const s of LEVEL.switches) w.switches[s.id] = { on: false };
  w.latch = { upperRoute: false };
  w.lift = { used: false };
  w.discoveries = { archives: 0, caches: 0, machinesDisabled: 0 };
  w.projectiles = [];
  w.pulses = [];
  w.highlights = {};
  w.relayFx = null;
  w.shutdown = null;
  w.reboot = null;
  w.ending = false;
  w.lastStation = null;
  w.crushTimer = 0;
}

// Full restart: fresh world, personal records are owned by records.js.
export function restartWorld(w) {
  w.frame = 0;
  w.time = 0;
  w.player = freshPlayer();
  w.recoveries = 0;
  w.checkpoint = { x: LEVEL.spawn.x, y: LEVEL.spawn.y, stationId: 'S0' };
  resetDynamic(w);
  w.events.length = 0;
  w.snapshot = takeSnapshot(w);
  emit(w, 'restart');
}

// ---------------------------------------------------------------------------
// Snapshots / checkpoint recovery
// ---------------------------------------------------------------------------

export function takeSnapshot(w) {
  return structuredClone({
    relays: w.relays, sockets: w.sockets, cells: w.cells,
    shutters: w.shutters, seams: w.seams, platforms: w.platforms,
    vents: w.vents, enemies: w.enemies, archives: w.archives,
    caches: w.caches, switches: w.switches, latch: w.latch,
    lift: w.lift, discoveries: w.discoveries,
  });
}

function applySnapshot(w, snap) {
  const s = structuredClone(snap);
  for (const k of Object.keys(s)) w[k] = s[k];
}

export function commitCheckpoint(w, stationId) {
  const st = byId(LEVEL.stations, stationId);
  if (!st) return;
  // Never move the checkpoint backwards.
  if (w.checkpoint && st.x < w.checkpoint.x - 0.01) return;
  w.checkpoint = { x: st.x, y: st.y, stationId };
  w.snapshot = takeSnapshot(w);
  emit(w, 'checkpoint', { stationId });
}

export function recover(w) {
  const cp = w.checkpoint || { x: LEVEL.spawn.x, y: LEVEL.spawn.y, stationId: 'S0' };
  if (w.snapshot) applySnapshot(w, w.snapshot);
  const p = w.player;
  p.x = cp.x; p.y = cp.y; p.vx = 0; p.vy = 0; p.facing = 1;
  p.grounded = true; p.onWall = 0; p.wallSliding = false;
  p.coyote = 0; p.jumpBuffer = 0; p.jumpHeld = false;
  p.dashTimer = 0; p.dashDir = 0; p.dashCooldown = 0; p.dashAvailable = true;
  p.steerLock = 0; p.pulseCooldown = 0;
  p.energy = T.energyMax; p.lastEnergyUse = -100;
  p.integrity = T.maxIntegrity; p.immunity = T.rebootImmunity;
  p.carrying = null; p.standingOn = null; p.dead = false;
  p.anim = 'reboot'; p.animTime = 0; p.shieldFx = 0; p.hurtFx = 0;
  w.pulses.length = 0;
  w.projectiles.length = 0;
  w.highlights = {};
  w.relayFx = null;
  w.crushTimer = 0;
  w.recoveries += 1;
  emit(w, 'reboot');
}

// Manual R retry from a checkpoint (does not rewind the run clock).
export function retry(w) {
  if (w.shutdown || w.reboot || w.player.dead) return false;
  recover(w);
  w.reboot = { t: T.rebootTime };
  emit(w, 'rebooted');
  return true;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

export function activeSolids(w) {
  const out = [];
  for (const s of LEVEL.solids) if (!s.oneWay) out.push(s);
  for (const s of LEVEL.seams) if (!w.seams[s.id].broken) out.push({ ...s, seamId: s.id, opaque: !s.transmitsPulse });
  for (const s of LEVEL.shutters) if (!w.shutters[s.id].open) out.push({ ...s, shutterId: s.id, opaque: true });
  return out;
}

export function activeOneWays(w) {
  const out = [];
  for (const s of LEVEL.solids) if (s.oneWay) out.push(s);
  for (const p of LEVEL.platforms) {
    const st = w.platforms[p.id];
    out.push({ x: st.x, y: st.y, w: p.w, h: p.h, id: p.id, moving: true });
  }
  return out;
}

function overlaps(p, s) {
  return p.x - T.halfW < s.x + s.w - EPS &&
         p.x + T.halfW > s.x + EPS &&
         p.y < s.y + s.h - EPS &&
         p.y + T.bodyH > s.y + EPS;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

function playerRect(p) {
  return { x: p.x - T.halfW, y: p.y, w: T.bodyW, h: T.bodyH };
}

// Segment / AABB slab test.
function segRect(ax, ay, bx, by, r) {
  const dx = bx - ax, dy = by - ay;
  const p4 = [-dx, dx, -dy, dy];
  const q4 = [ax - r.x, r.x + r.w - ax, ay - r.y, r.y + r.h - ay];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p4[i] === 0) { if (q4[i] < 0) return false; }
    else {
      const t = q4[i] / p4[i];
      if (p4[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}

// Deterministic line-of-sight for functional pulse effects. Thick opaque
// walls block; thin crystal seams marked transmitsPulse do not.
export function losClear(w, ax, ay, bx, by) {
  const solids = activeSolids(w);
  const ex = ax + (bx - ax) * 0.98;
  const ey = ay + (by - ay) * 0.98;
  for (const s of solids) {
    if (s.opaque === false) continue;      // transmitting crystal seam
    if (s.oneWay) continue;
    if (segRect(ax, ay, ex, ey, s)) return false;
  }
  return true;
}

function hasGround(w, x, y) {
  const solids = activeSolids(w);
  for (const s of solids) {
    if (Math.abs(s.y + s.h - y) < 0.12 && x >= s.x + 0.02 && x <= s.x + s.w - 0.02) return true;
  }
  for (const o of activeOneWays(w)) {
    if (Math.abs(o.y + o.h - y) < 0.12 && x >= o.x && x <= o.x + o.w) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Derived state (computed every step)
// ---------------------------------------------------------------------------

function socketPowered(w, id) { return w.sockets[id].cell !== null; }

function updateDerived(w) {
  // Sockets power their mechanisms purely from cell ownership.
  w.relays.A.powered = socketPowered(w, 'SOCK_A');
  w.relays.B.powered = w.switches.SW_B.on;
  w.relays.C.powered = socketPowered(w, 'SOCK_C');

  // Shutters open on power and stay open once their relay is committed.
  const wantA = socketPowered(w, 'SOCK_A') || w.relays.A.active;
  const wantC = w.latch.upperRoute || w.relays.C.active;
  w.shutters.SHUT_A.open = wantA || shutterBlocked(w, 'SHUT_A');
  w.shutters.SHUT_C.open = wantC || shutterBlocked(w, 'SHUT_C');
}

function shutterBlocked(w, id) {
  const sh = byId(LEVEL.shutters, id);
  if (!w.shutters[id].open) return false;
  if (rectsOverlap(playerRect(w.player), sh)) return true;
  if (w.player.carrying) return true; // a carried cell must never be clipped
  return false;
}

// ---------------------------------------------------------------------------
// Moving platforms
// ---------------------------------------------------------------------------

export function platformPos(def, t) {
  const half = Math.max(0.1, (def.period - 2 * def.pause) / 2);
  if (t < half) return def.min + (def.max - def.min) * (t / half);
  if (t < half + def.pause) return def.max;
  if (t < 2 * half + def.pause) return def.max - (def.max - def.min) * ((t - half - def.pause) / half);
  return def.min;
}

function platformActive(w, def) {
  if (def.requires === 'ALWAYS') return true;
  if (def.requires === 'SW_B') return w.switches.SW_B.on;
  if (def.requires === 'SOCK_LIFT') return socketPowered(w, 'SOCK_LIFT');
  return false;
}

function updatePlatforms(w, dt) {
  const p = w.player;
  for (const def of LEVEL.platforms) {
    const st = w.platforms[def.id];
    const active = platformActive(w, def);
    const oldX = st.x, oldY = st.y;
    st.active = active;
    if (active) st.t = (st.t + dt) % def.period;
    else st.t = 0;
    const pos = platformPos(def, st.t);
    st.x = def.axis === 'x' ? pos : def.x;
    st.y = def.axis === 'y' ? pos : def.y;
    st.dx = st.x - oldX;
    st.dy = st.y - oldY;
    // Displacement is applied exactly once per step to a standing player.
    if (active && p.standingOn === def.id) {
      p.x += st.dx;
      p.y += st.dy;
    }
  }
}

// ---------------------------------------------------------------------------
// Movement, collision
// ---------------------------------------------------------------------------

function integrateVelocity(w, p, sub) {
  if (p.dashTimer > 0) {
    p.vx = p.dashDir * T.dashSpeed;
    p.vy = 0;                         // gravity suspended during dash
    p.dashTimer -= sub;
    if (p.dashTimer <= 0) {
      p.dashTimer = 0;
      p.vx = p.dashDir * T.dashExitSpeed; // controlled exit velocity
    }
    return;
  }
  if (p.steerLock > 0) p.steerLock = Math.max(0, p.steerLock - sub);
  const carrying = p.carrying !== null;
  const maxSpeed = carrying ? T.carrySpeed : T.maxSpeed;
  const axis = w._axis || 0;
  const accel = p.grounded ? T.groundAccel : T.airAccel;
  const brake = p.grounded ? T.groundBrake : T.airBrake;
  if (p.steerLock > 0) {
    // steering locked after a wall jump; keep the launch velocity
  } else if (axis === 0) {
    p.vx = approach(p.vx, 0, brake * sub);
  } else if (p.vx !== 0 && Math.sign(p.vx) !== Math.sign(axis)) {
    p.vx = approach(p.vx, 0, brake * sub);
  } else {
    p.vx = approach(p.vx, axis * maxSpeed, accel * sub);
  }
  p.vy += T.gravity * sub;
  if (!p.jumpHeld && p.vy > 0) p.vy += T.gravity * (T.jumpReleaseGravity - 1) * sub;
  if (p.vy < -T.fallCap) p.vy = -T.fallCap;
  if (p.wallSliding && p.vy < -T.wallSlideCap) p.vy = -T.wallSlideCap;
}

function resolveX(w, p, dx, solids) {
  p.x += dx;
  for (const s of solids) {
    if (!overlaps(p, s)) continue;
    // A dash shatters a cracked seam and passes through it. A seam that was
    // already broken earlier in this same step is no longer solid.
    if (s.seamId) {
      if (w.seams[s.seamId].broken) continue;
      if (p.dashTimer > 0) {
        w.seams[s.seamId].broken = true;
        emit(w, 'seamBreak', { id: s.seamId });
        continue;
      }
    }
    if (s.shutterId && w.shutters[s.shutterId].open) continue;
    if (dx > 0) p.x = s.x - T.halfW;
    else if (dx < 0) p.x = s.x + s.w + T.halfW;
    else continue;
    p.vx = 0;
  }
}

function resolveY(w, p, dy, solids, oneWays) {
  // A dash (or an exact apex) has no vertical motion. Resolving contacts here
  // would let a just-broken seam or an open shutter create a false ceiling.
  if (Math.abs(dy) < EPS) {
    p.grounded = false;
    p.standingOn = null;
    return;
  }
  const prevFeet = p.y;
  p.y += dy;
  p.grounded = false;
  p.standingOn = null;
  for (const s of solids) {
    if (s.seamId && w.seams[s.seamId].broken) continue;
    if (s.shutterId && w.shutters[s.shutterId].open) continue;
    if (!overlaps(p, s)) continue;
    if (dy > 0) { p.y = s.y - T.bodyH; p.vy = 0; }
    else { p.y = s.y + s.h; p.vy = 0; p.grounded = true; }
  }
  if (dy < 0) {
    for (const o of oneWays) {
      const top = o.y + o.h;
      if (prevFeet >= top - 0.02 && p.y <= top &&
          p.x - T.halfW < o.x + o.w - EPS && p.x + T.halfW > o.x + EPS) {
        p.y = top;
        p.vy = 0;
        p.grounded = true;
        if (o.moving) p.standingOn = o.id;
      }
    }
  }
}

function detectWall(w, p) {
  const top = p.y + T.bodyH, bot = p.y;
  for (const s of LEVEL.solids) {
    if (!s.wallJump) continue;
    if (top < s.y + 0.05 || bot > s.y + s.h - 0.05) continue;
    if (Math.abs((p.x - T.halfW) - (s.x + s.w)) < 0.09 && p.x > s.x + s.w) return -1;
    if (Math.abs((p.x + T.halfW) - s.x) < 0.09 && p.x < s.x) return 1;
  }
  return 0;
}

function moveAndCollide(w, dt) {
  const p = w.player;
  const solids = activeSolids(w);
  const oneWays = activeOneWays(w);
  const maxDisp = Math.max(Math.abs(p.vx * dt), Math.abs(p.vy * dt));
  const n = Math.max(1, Math.ceil(maxDisp / 0.1)); // conservative substeps
  const sub = dt / n;
  for (let i = 0; i < n; i++) {
    integrateVelocity(w, p, sub);
    resolveX(w, p, p.vx * sub, solids);
    resolveY(w, p, p.vy * sub, solids, oneWays);
  }
  p.onWall = p.grounded ? 0 : detectWall(w, p);
  const towardWall = p.onWall !== 0 && w._axis === p.onWall;
  p.wallSliding = !p.grounded && p.dashTimer <= 0 && towardWall && p.vy < 0 && p.carrying === null;
}

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------

function doJump(w, input) {
  const p = w.player;
  if (input.jumpPressed) p.jumpBuffer = T.jumpBuffer;
  if (p.jumpBuffer <= 0 || p.dead) return;
  if (p.onWall !== 0 && !p.grounded && !p.carrying) {
    p.vx = -p.onWall * T.wallJumpVx;
    p.vy = T.wallJumpVy;
    p.steerLock = T.steerLock;
    p.dashAvailable = true;       // refresh after a successful wall jump
    p.wallSliding = false;
    p.jumpBuffer = 0;
    p.jumpHeld = true;
    emit(w, 'walljump');
  } else if ((p.grounded || p.coyote > 0) && p.carrying !== null) {
    // carrying still permits an ordinary jump
    p.vy = T.jumpSpeed;
    p.grounded = false; p.coyote = 0; p.jumpBuffer = 0; p.jumpHeld = true;
    emit(w, 'jump');
  } else if (p.grounded || p.coyote > 0) {
    p.vy = T.jumpSpeed;
    p.grounded = false; p.coyote = 0; p.jumpBuffer = 0; p.jumpHeld = true;
    emit(w, 'jump');
  }
}

function doDash(w, input) {
  const p = w.player;
  if (!input.dashPressed) return;
  if (p.carrying) { emit(w, 'dashDenied'); return; }
  if (p.dashCooldown <= 0 && p.dashAvailable && p.dashTimer <= 0 && !p.dead) {
    p.dashDir = p.facing;      // direction locked for the whole dash
    p.dashTimer = T.dashTime;
    p.dashAvailable = false;
    p.dashCooldown = T.dashCooldown;
    p.vy = 0;
    emit(w, 'dash');
  } else emit(w, 'dashDenied');
}

function pulseTargets(w) {
  const p = w.player;
  const ox = p.x, oy = p.y + 0.75;
  const pending = [];
  const add = (dist, kind, id, extra = {}) => {
    if (dist > T.pulseRadius) return;
    pending.push({ t: (dist / T.pulseRadius) * T.pulseExpand, kind, id, ...extra });
  };
  const consider = (x, y, kind, id, extra) => {
    const d = Math.hypot(x - ox, y - oy);
    if (d > T.pulseRadius) return;
    if (!losClear(w, ox, oy, x, y)) return;
    add(d, kind, id, extra);
  };

  for (const s of LEVEL.seams) {
    if (!s.hiddenMark || w.seams[s.id].broken) continue;
    consider(s.x + s.w / 2, s.y + s.h / 2, 'mark', s.id);
  }
  for (const a of LEVEL.archives) {
    if (w.archives[a.id].collected) continue;
    consider(a.x, a.y + 0.4, 'archiveMark', a.id);
  }
  for (const c of LEVEL.conduits) {
    consider(c.x + c.w / 2, c.y + 0.2, 'conduit', c.id);
  }
  for (const r of LEVEL.relays) {
    if (w.relays[r.id].active) continue;
    consider(r.x, r.y, 'relay', r.id);
  }
  for (const e of LEVEL.enemies) {
    const st = w.enemies[e.id];
    if (st.disabled) continue;
    consider(st.x, st.y + 0.5, 'stun', e.id);
  }
  pending.sort((a, b) => a.t - b.t);
  return pending;
}

function doPulse(w, input) {
  const p = w.player;
  if (!input.pulsePressed) return;
  if (p.carrying) { emit(w, 'pulseFail'); return; }
  if (p.energy >= T.pulseCost && p.pulseCooldown <= 0 && !p.dead) {
    p.energy -= T.pulseCost;
    p.lastEnergyUse = w.time;
    p.pulseCooldown = T.pulseCooldown;
    const pulse = {
      id: w.frame, x: p.x, y: p.y + 0.75, age: 0,
      pending: pulseTargets(w), applied: [],
    };
    w.pulses.push(pulse);
    emit(w, 'pulse', { x: pulse.x, y: pulse.y });
  } else {
    // One quiet cue and a brief meter response; no energy, no effect.
    // Main only forwards fresh presses, so a held key cannot spam this.
    emit(w, 'pulseFail');
  }
}

function applyPulseResponse(w, item) {
  switch (item.kind) {
    case 'mark':
    case 'archiveMark':
    case 'conduit':
      w.highlights[item.id] = T.highlightTime;
      emit(w, 'reveal', { id: item.id });
      break;
    case 'relay': {
      const r = w.relays[item.id];
      if (r.powered && !r.active) {
        r.active = true;
        w.relayFx = { id: item.id, t: T.relayShowTime };
        const def = byId(LEVEL.relays, item.id);
        commitCheckpoint(w, def.station);
        emit(w, 'relay', { id: item.id });
      } else if (!r.powered) {
        emit(w, 'relayUnpowered', { id: item.id });
      }
      break;
    }
    case 'stun': {
      const e = w.enemies[item.id];
      if (!e || e.disabled) break;
      if (e.type === 'sentinel') {
        if (e.state === 'venting') {
          disableEnemy(w, e);
        } else {
          emit(w, 'deflect', { id: item.id });
        }
      } else {
        e.state = 'stunned';
        e.stunned = e.type === 'drone' ? 2.5 : 2.0;
        e.timer = 0;
        emit(w, 'enemyStun', { id: item.id });
      }
      break;
    }
  }
}

function updatePulses(w, dt) {
  for (let i = w.pulses.length - 1; i >= 0; i--) {
    const pulse = w.pulses[i];
    pulse.age += dt;
    for (let j = 0; j < pulse.pending.length; j++) {
      const item = pulse.pending[j];
      if (pulse.age >= item.t && !pulse.applied[j]) {
        pulse.applied[j] = true;
        applyPulseResponse(w, item);
      }
    }
    if (pulse.age > T.pulseExpand + 0.45) w.pulses.splice(i, 1);
  }
  for (const k of Object.keys(w.highlights)) {
    w.highlights[k] -= dt;
    if (w.highlights[k] <= 0) delete w.highlights[k];
  }
}

// ---------------------------------------------------------------------------
// Damage, shield, shutdown
// ---------------------------------------------------------------------------

export function damage(w, source = 'contact', dir = 0) {
  const p = w.player;
  if (p.dead || w.ending || w.shutdown) return false;
  // Falling out of the world and a confirmed crush bypass the shield by design.
  if (source === 'fall' || source === 'crush') { startShutdown(w, source); return true; }
  if (p.immunity > 0) return false;
  if (p.energy >= T.shieldCost) {
    p.energy -= T.shieldCost;
    p.lastEnergyUse = w.time;
    p.immunity = T.shieldImmunity;
    p.shieldFx = 0.35;
    emit(w, 'shield', { source });
  } else {
    p.integrity -= 1;
    p.immunity = T.hurtImmunity;
    p.hurtFx = 0.4;
    p.vx = dir * T.knockback;
    p.vy = Math.max(p.vy, 3);
    emit(w, 'hurt', { source, integrity: p.integrity });
    if (p.integrity <= 0) startShutdown(w, 'damage');
  }
  return true;
}

function startShutdown(w, reason) {
  if (w.player.dead || w.shutdown) return; // one recovery sequence only
  const p = w.player;
  p.dead = true; p.vx = 0; p.vy = 0; p.anim = 'shutdown';
  w.shutdown = { t: T.shutdownTime, reason };
  emit(w, 'shutdown', { reason });
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

function objNear(w, x, y) {
  const p = w.player;
  return Math.abs(p.x - x) <= T.interactRange + 0.25 &&
         Math.abs((p.y + 0.75) - y) <= 1.55;
}

function cellRect(x, y) { return { x: x - 0.4, y, w: 0.8, h: 1.1 }; }

function placementSafe(w, x, y) {
  const r = cellRect(x, y);
  for (const s of activeSolids(w)) if (rectsOverlap(r, s)) return false;
  for (const o of activeOneWays(w)) if (rectsOverlap(r, o)) return false;
  for (const v of LEVEL.vents) {
    const vr = { x: v.x, y: v.y, w: v.w, h: v.h };
    if (rectsOverlap(r, vr)) return false;
  }
  for (const water of LEVEL.water) if (water.kill && rectsOverlap(r, water)) return false;
  // Must rest on a surface.
  return hasGround(w, x, y);
}

export function currentInteractTarget(w) {
  const p = w.player;
  let best = null;
  const offer = (prio, target, x, y) => {
    const d = Math.abs(p.x - x);
    if (!best || prio < best.prio || (prio === best.prio && d < best.d)) {
      best = { ...target, prio, d, x, y };
    }
  };

  if (p.carrying) {
    const def = byId(LEVEL.cells, p.carrying);
    for (const s of LEVEL.sockets) {
      if (!(def.sockets || []).includes(s.id)) continue;
      if (w.sockets[s.id].cell) continue;
      if (objNear(w, s.x, s.y + 0.55)) offer(1, { type: 'insert', id: s.id, label: 'E — Insert Cell' }, s.x, s.y);
    }
    if (!best || best.prio !== 1) offer(1, { type: 'place', label: 'E — Place Cell' }, p.x, p.y);
  } else {
    for (const c of LEVEL.cells) {
      const st = w.cells[c.id];
      if (st.inWorld && !st.carried && objNear(w, c.x, c.y + 0.55))
        offer(2, { type: 'pickup', id: c.id, label: 'E — Pick Up Cell' }, c.x, c.y);
    }
    if (!best || best.prio > 2) {
      for (const s of LEVEL.sockets) {
        if (w.sockets[s.id].cell && objNear(w, s.x, s.y + 0.55))
          offer(3, { type: 'remove', id: s.id, label: 'E — Remove Cell' }, s.x, s.y);
      }
    }
    if (!best || best.prio > 3) {
      for (const sw of LEVEL.switches) {
        if (!w.switches[sw.id].on && objNear(w, sw.x, sw.y + 0.6))
          offer(4, { type: 'switch', id: sw.id, label: 'E — Activate Switch' }, sw.x, sw.y);
      }
      for (const a of LEVEL.archives) {
        if (!w.archives[a.id].collected && objNear(w, a.x, a.y + 0.5))
          offer(4, { type: 'archive', id: a.id, label: 'E — Read Archive' }, a.x, a.y);
      }
      for (const c of LEVEL.caches) {
        if (!w.caches[c.id].collected && objNear(w, c.x, c.y + 0.5))
          offer(4, { type: 'cache', id: c.id, label: 'E — Open Cache' }, c.x, c.y);
      }
      const L = LEVEL.lift;
      if (objNear(w, L.console.x, L.console.y + 0.8))
        offer(4, { type: 'lift', label: 'E — Activate Lift' }, L.console.x, L.console.y);
      for (const st of LEVEL.stations) {
        if (objNear(w, st.x, st.y + 0.6))
          offer(4, { type: 'station', id: st.id, label: 'E — Reboot Station' }, st.x, st.y);
      }
    }
  }
  return best;
}

function doInteract(w, input) {
  if (!input.interactPressed) return;
  const target = currentInteractTarget(w);
  if (!target) return;
  const p = w.player;
  switch (target.type) {
    case 'insert': {
      const id = p.carrying;
      const cell = w.cells[id];
      w.sockets[target.id].cell = id;
      cell.inWorld = false; cell.carried = false; cell.socket = target.id;
      const s = byId(LEVEL.sockets, target.id);
      cell.x = s.x; cell.y = s.y - 0.55;
      p.carrying = null;
      emit(w, 'insert', { id, socket: target.id });
      break;
    }
    case 'place': {
      const id = p.carrying;
      const x = p.x + p.facing * 1.0;
      const y = p.grounded ? p.y : p.y - 0.2;
      if (!placementSafe(w, x, y)) { emit(w, 'placeDenied'); break; }
      const cell = w.cells[id];
      cell.x = x; cell.y = y; cell.inWorld = true; cell.carried = false; cell.socket = null;
      p.carrying = null;
      emit(w, 'place', { id });
      break;
    }
    case 'pickup': {
      const cell = w.cells[target.id];
      cell.inWorld = false; cell.carried = true; cell.socket = null;
      p.carrying = target.id;
      emit(w, 'pickup', { id: target.id });
      break;
    }
    case 'remove': {
      const id = w.sockets[target.id].cell;
      w.sockets[target.id].cell = null;
      const cell = w.cells[id];
      cell.inWorld = false; cell.carried = true; cell.socket = null;
      p.carrying = id;
      emit(w, 'remove', { id, socket: target.id });
      break;
    }
    case 'switch': {
      w.switches[target.id].on = true;
      if (target.id === 'SW_C') w.latch.upperRoute = true;
      emit(w, 'switch', { id: target.id });
      break;
    }
    case 'archive': {
      w.archives[target.id].collected = true;
      w.archives[target.id].showUntil = w.time + 6;
      w.discoveries.archives += 1;
      const a = byId(LEVEL.archives, target.id);
      emit(w, 'archive', { id: target.id, title: a.title, text: a.text });
      break;
    }
    case 'cache': {
      w.caches[target.id].collected = true;
      w.discoveries.caches += 1;
      const before = p.energy;
      p.energy = Math.min(T.energyMax, p.energy + 25);
      emit(w, 'cache', { id: target.id, gain: Math.round(p.energy - before) });
      break;
    }
    case 'lift': {
      const L = LEVEL.lift;
      const inside = rectsOverlap(playerRect(p), L.boarding);
      const allRelays = w.relays.A.active && w.relays.B.active && w.relays.C.active;
      if (allRelays && inside && !w.lift.used && !w.shutdown && !w.reboot) {
        w.lift.used = true;
        w.ending = true;
        emit(w, 'liftStart');
      } else {
        emit(w, 'liftDenied', {
          reason: !allRelays ? 'relays' : !inside ? 'boarding' : 'busy',
        });
      }
      break;
    }
    case 'station':
      activateStation(w, target.id);
      break;
  }
}

function activateStation(w, id) {
  const p = w.player;
  p.integrity = T.maxIntegrity;
  p.energy = T.energyMax;
  p.lastEnergyUse = -100;
  commitCheckpoint(w, id);
  emit(w, 'station', { id });
}

function updateStations(w) {
  let near = null;
  for (const st of LEVEL.stations) {
    if (Math.abs(w.player.x - st.x) <= 1.1 && Math.abs(w.player.y - st.y) <= 1.2) { near = st; break; }
  }
  if (near && w.lastStation !== near.id) {
    w.lastStation = near.id;
    activateStation(w, near.id);
  } else if (!near) {
    w.lastStation = null;
  }
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

function disableEnemy(w, e) {
  if (e.disabled) return;
  e.disabled = true;
  e.state = 'disabled';
  e.stunned = 0;
  e.beam = null;
  w.discoveries.machinesDisabled += 1;
  emit(w, 'enemyDisable', { id: e.id });
}

function enemyOverlapsPlayer(w, e, pad = 0) {
  const r = { x: e.x - 0.45 - pad, y: e.y, w: 0.9 + pad * 2, h: 1.0 };
  return rectsOverlap(r, playerRect(w.player));
}

function updateSkitter(w, e, dt) {
  const p = w.player;
  if (e.disabled) return;
  if (e.stunned > 0) {
    e.stunned -= dt;
    e.state = 'stunned';
    if (e.stunned <= 0) e.state = 'patrol';
  } else if (e.state === 'dormant') {
    e.state = 'patrol';
  } else if (e.state === 'patrol' || e.state === 'alert' || e.state === 'lunge' || e.state === 'recovery') {
    const dist = Math.hypot(p.x - e.x, (p.y + 0.75) - (e.y + 0.5));
    const sees = dist <= 5 && losClear(w, e.x, e.y + 0.5, p.x, p.y + 0.75);
    if (e.state === 'patrol') {
      e.facing = e.facing || 1;
      e.x += e.facing * 1.4 * dt;
      if (e.x <= e.minX || e.x >= e.maxX || !hasGround(w, e.x + e.facing * 0.6, e.y)) {
        e.facing *= -1;
        e.x = clamp(e.x, e.minX, e.maxX);
      }
      if (sees) { e.state = 'alert'; e.timer = 0.5; emit(w, 'enemyTelegraph', { id: e.id }); }
    } else if (e.state === 'alert') {
      e.timer -= dt;
      if (e.timer <= 0) {
        e.state = 'lunge'; e.timer = 0.25;
        e.lungeDir = Math.sign(p.x - e.x) || 1; // locked for the whole lunge
        emit(w, 'enemyLunge', { id: e.id });
      }
    } else if (e.state === 'lunge') {
      e.timer -= dt;
      e.x += e.lungeDir * 9 * dt;
      if (!hasGround(w, e.x + e.lungeDir * 0.4, e.y)) e.x = clamp(e.x, e.minX, e.maxX);
      if (e.timer <= 0) { e.state = 'recovery'; e.timer = 0.6; }
    } else {
      e.timer -= dt;
      if (e.timer <= 0) e.state = 'patrol';
    }
  }
}

function updateDrone(w, e, dt) {
  const p = w.player;
  if (e.disabled) return;
  if (e.stunned > 0) {
    e.stunned -= dt;
    e.state = 'stunned';
    if (e.stunned <= 0) { e.state = 'cooldown'; e.timer = 0.4; }
    return;
  }
  const dist = Math.hypot(p.x - e.x, (p.y + 0.75) - (e.y + 0.5));
  const sees = dist <= 8 && losClear(w, e.x, e.y + 0.5, p.x, p.y + 0.75);
  if (e.state === 'patrol') {
    e.x += (e.facing || 1) * 1.6 * dt;
    if (e.x <= e.minX || e.x >= e.maxX) { e.facing = (e.facing || 1) * -1; e.x = clamp(e.x, e.minX, e.maxX); }
    if (sees) {
      e.state = 'aim'; e.timer = 0.8;
      const dx = p.x - e.x, dy = (p.y + 0.75) - (e.y + 0.5);
      const len = Math.hypot(dx, dy) || 1;
      e.aim = { x: dx / len, y: dy / len }; // aim locked before firing
      emit(w, 'enemyTelegraph', { id: e.id });
    }
  } else if (e.state === 'aim') {
    e.timer -= dt;
    if (e.timer <= 0) {
      e.state = 'fire';
      w.projectiles.push({
        id: 'p' + w.frame + '_' + e.id, x: e.x, y: e.y + 0.5,
        vx: e.aim.x * 7, vy: e.aim.y * 7, life: 2.5, from: e.id,
      });
      emit(w, 'enemyFire', { id: e.id, kind: 'bolt' });
      e.state = 'cooldown'; e.timer = 1.6;
    }
  } else if (e.state === 'fire') {
    e.state = 'cooldown'; e.timer = 1.6;
  } else if (e.state === 'cooldown') {
    e.timer -= dt;
    e.x += (e.facing || 1) * 0.6 * dt;
    if (e.x <= e.minX || e.x >= e.maxX) e.facing = (e.facing || 1) * -1;
    if (e.timer <= 0) e.state = 'patrol';
  }
}

function updateSentinel(w, e, dt) {
  if (e.disabled) { e.beam = null; return; }
  const def = e.def;
  e.timer -= dt;
  if (e.timer > 0) return;
  switch (e.state) {
    case 'closed':
      e.state = 'warning'; e.timer = 0.9; e.beam = null;
      emit(w, 'enemyTelegraph', { id: e.id, kind: 'beam' });
      break;
    case 'warning': {
      e.state = 'firing'; e.timer = 0.5;
      // Beam stops at the first solid cover in its lane.
      const startX = e.x + 0.6 * e.dir;
      const y0 = def.laneY - 0.3, h = 0.6;
      let endX = startX + def.laneLength * e.dir;
      const beamRect = { x: Math.min(startX, endX), y: y0, w: Math.abs(endX - startX), h };
      let nearest = Infinity;
      for (const s of activeSolids(w)) {
        if (s.y + s.h < y0 + EPS || s.y > y0 + h - EPS) continue;
        const face = e.dir > 0 ? s.x : s.x + s.w;
        if (e.dir > 0 ? (face >= startX && face < endX) : (face <= startX && face > endX)) {
          const d = Math.abs(face - startX);
          if (d < nearest) nearest = d;
        }
      }
      if (nearest < Infinity) endX = startX + e.dir * nearest;
      e.beam = { x: Math.min(startX, endX), y: y0, w: Math.abs(endX - startX), h };
      emit(w, 'enemyFire', { id: e.id, kind: 'beam' });
      break;
    }
    case 'firing':
      e.state = 'venting'; e.timer = 2.0; e.beam = null;
      break;
    case 'venting':
      e.state = 'closed'; e.timer = 1.4; e.beam = null;
      break;
  }
}

function updateEnemies(w, dt) {
  const p = w.player;
  for (const def of LEVEL.enemies) {
    const e = w.enemies[def.id];
    // Distant enemies do not exhaust attack cycles offscreen.
    if (Math.abs(e.x - p.x) > 18) continue;
    if (e.type === 'skitter') updateSkitter(w, e, dt);
    else if (e.type === 'drone') updateDrone(w, e, dt);
    else updateSentinel(w, e, dt);

    const dashing = p.dashTimer > 0;
    const active = !e.disabled && e.stunned <= 0 && e.state !== 'dormant';

    if (dashing && enemyOverlapsPlayer(w, e, 0.15)) {
      if (e.stunned > 0 || (e.type === 'sentinel' && e.state === 'venting')) {
        disableEnemy(w, e);
      } else if (e.type !== 'sentinel' && active) {
        damage(w, 'dash', p.dashDir); // dashing into an active machine hurts
      }
    } else if (active && e.type !== 'sentinel' && enemyOverlapsPlayer(w, e)) {
      damage(w, 'contact', Math.sign(p.x - e.x) || 1);
    }
  }
}

function updateProjectiles(w, dt) {
  const p = w.player;
  const solids = activeSolids(w);
  for (let i = w.projectiles.length - 1; i >= 0; i--) {
    const b = w.projectiles[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let gone = b.life <= 0;
    if (!gone) {
      const r = { x: b.x - 0.12, y: b.y - 0.12, w: 0.24, h: 0.24 };
      for (const s of solids) if (rectsOverlap(r, s)) { gone = true; break; }
    }
    if (!gone && rectsOverlap({ x: b.x - 0.14, y: b.y - 0.14, w: 0.28, h: 0.28 }, playerRect(p))) {
      damage(w, 'projectile', Math.sign(b.vx) || 1);
      gone = true;
    }
    if (gone) w.projectiles.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Hazards: vents, deep water, fall boundary, crush
// ---------------------------------------------------------------------------

const VENT_STAGES = [
  { name: 'dormant', dur: 1.8 },
  { name: 'warning', dur: 0.9 },
  { name: 'active', dur: 0.8 },
];
const VENT_CYCLE = 3.5;

export function ventStageAt(t) {
  let tt = ((t % VENT_CYCLE) + VENT_CYCLE) % VENT_CYCLE;
  for (const s of VENT_STAGES) {
    if (tt < s.dur) return s.name;
    tt -= s.dur;
  }
  return 'dormant';
}

function updateHazards(w, dt) {
  const p = w.player;
  const pr = playerRect(p);
  for (const v of LEVEL.vents) {
    const st = w.vents[v.id];
    const prev = st.stage;
    st.t = (st.t + dt) % VENT_CYCLE;
    st.stage = ventStageAt(st.t);
    if (st.stage !== prev) {
      if (st.stage === 'warning') emit(w, 'ventWarn', { id: v.id });
      if (st.stage === 'active') emit(w, 'ventActive', { id: v.id });
    }
    if (st.stage === 'active' && rectsOverlap(pr, v)) {
      damage(w, 'vent', Math.sign(p.x - (v.x + v.w / 2)) || 1);
    }
  }
  for (const e of Object.values(w.enemies)) {
    if (e.beam && rectsOverlap(pr, e.beam)) damage(w, 'beam', -e.dir);
  }
  // Deep water and the fall boundary bypass the shield by design.
  if (p.y < LEVEL.fallBoundary) { damage(w, 'fall'); return; }
  for (const water of LEVEL.water) {
    if (water.kill && pr.x < water.x + water.w && pr.x + pr.w > water.x && p.y < water.y + water.h) {
      damage(w, 'fall');
      return;
    }
  }
  // Sustained embedding (a crush) is distinct from ordinary side contact.
  const solids = activeSolids(w);
  let embedded = false;
  for (const s of solids) {
    if (overlaps(p, s)) {
      embedded = true;
      // push out along the shallowest axis
      const left = (p.x + T.halfW) - s.x;
      const right = (s.x + s.w) - (p.x - T.halfW);
      const down = (p.y + T.bodyH) - s.y;
      const up = (s.y + s.h) - p.y;
      const m = Math.min(left, right, down, up);
      if (m === left) p.x = s.x - T.halfW;
      else if (m === right) p.x = s.x + s.w + T.halfW;
      else if (m === down) p.y = s.y - T.bodyH;
      else p.y = s.y + s.h;
    }
  }
  if (embedded) {
    w.crushTimer += dt;
    if (w.crushTimer > 0.2) damage(w, 'crush');
  } else w.crushTimer = 0;
}

// ---------------------------------------------------------------------------
// Animation state (visual only; never moves the collision body)
// ---------------------------------------------------------------------------

function updateAnim(w, dt) {
  const p = w.player;
  p.animTime += dt;
  let a = 'idle';
  if (p.dead) a = 'shutdown';
  else if (w.reboot) a = 'reboot';
  else if (p.shieldFx > 0) a = 'shield';
  else if (p.hurtFx > 0) a = 'hurt';
  else if (p.dashTimer > 0) a = 'dash';
  else if (p.wallSliding) a = 'wallslide';
  else if (p.carrying) a = p.grounded ? (Math.abs(p.vx) > 0.4 ? 'carry' : 'carry') : 'carry';
  else if (!p.grounded) a = p.vy > 1 ? 'ascent' : 'falling';
  else if (Math.abs(p.vx) > 4.6) a = 'run';
  else if (Math.abs(p.vx) > 0.35) a = 'walk';
  if (p.anim !== a) { p.anim = a; p.animTime = 0; }
  if (p.shieldFx > 0) p.shieldFx -= dt;
  if (p.hurtFx > 0) p.hurtFx -= dt;
}

// ---------------------------------------------------------------------------
// Main fixed step
// ---------------------------------------------------------------------------

export function step(w, input, dt = FIXED_DT, opts = { clock: true, simulate: true }) {
  // Presentation timers advance even when the simulation is frozen.
  if (w.relayFx) {
    w.relayFx.t -= dt;
    if (w.relayFx.t <= 0) w.relayFx = null;
  }
  if (w.shutdown) {
    w.shutdown.t -= dt;
    if (w.shutdown.t <= 0) {
      w.shutdown = null;
      recover(w);
      w.reboot = { t: T.rebootTime };
      emit(w, 'rebooted');
    }
  } else if (w.reboot) {
    w.reboot.t -= dt;
    if (w.reboot.t <= 0) w.reboot = null;
  }

  if (!opts.simulate) return;
  w.frame += 1;
  if (opts.clock) w.time += dt;

  const p = w.player;
  const frozen = p.dead || w.shutdown || w.reboot || w.ending || w.relayFx;
  const axis = frozen ? 0 : (input.axis || 0);
  w._axis = axis;
  p.jumpHeld = frozen ? false : !!input.jumpHeld;
  if (axis !== 0 && !frozen) p.facing = axis;

  // Timers
  p.coyote = p.grounded ? T.coyote : Math.max(0, p.coyote - dt);
  p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  p.pulseCooldown = Math.max(0, p.pulseCooldown - dt);
  p.immunity = Math.max(0, p.immunity - dt);
  if (w.time - p.lastEnergyUse >= T.regenDelay && p.energy < T.energyMax) {
    p.energy = Math.min(T.energyMax, p.energy + T.regenRate * dt);
  }

  if (!frozen) {
    doJump(w, input);
    doDash(w, input);
    doPulse(w, input);
    doInteract(w, input);
  } else {
    p.jumpBuffer = 0;
  }

  updateDerived(w);
  updatePlatforms(w, dt);
  const wasGrounded = p.grounded;
  moveAndCollide(w, dt);
  if (!wasGrounded && p.grounded) {
    p.dashAvailable = true;           // refresh after a valid landing
    if (p.vy === 0) emit(w, 'land');
  }
  if (p.grounded && p.dashTimer <= 0) p.dashAvailable = true;

  updateEnemies(w, dt);
  updateProjectiles(w, dt);
  updatePulses(w, dt);
  updateHazards(w, dt);
  updateStations(w);
  updateAnim(w, dt);
}

export function drainEvents(w) {
  const out = w.events.slice();
  w.events.length = 0;
  return out;
}

// ---------------------------------------------------------------------------
// Inspection helpers (also used by deterministic checks)
// ---------------------------------------------------------------------------

export function pulseRadiusAt(age) {
  return Math.min(T.pulseRadius, T.pulseRadius * (age / T.pulseExpand));
}

export function allRelaysActive(w) {
  return w.relays.A.active && w.relays.B.active && w.relays.C.active;
}

export function socketHasCell(w, id) { return w.sockets[id].cell !== null; }

export { LEVEL, T };
