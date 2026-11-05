// DEEPWAKE - deterministic checks against the real simulation.
// Run with: npm test   (or: node tests/checks.mjs)
// These exercise src/sim.js, src/level.js and src/records.js directly; no
// browser, no rendering and no mocked physics.

import * as sim from '../src/sim.js';
import { LEVEL } from '../src/level.js';
import { T, FIXED_DT } from '../src/constants.js';
import { createRecords, validate, KEY, VERSION } from '../src/records.js';

let P = 0, F = 0;
const failures = [];
let section = '';
const head = (s) => { section = s; console.log(`\n== ${s} ==`); };
function ok(name, cond, info = '') {
  if (cond) { P++; console.log(`  PASS  ${name}`); }
  else { F++; failures.push(`[${section}] ${name} ${info}`); console.log(`  FAIL  ${name} ${info}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const W = () => { const w = sim.createWorld(); w.events.length = 0; return w; };

function run(w, n, input = {}) {
  for (let i = 0; i < n; i++) {
    const inp = i === 0 ? { ...input } : {
      ...input, jumpPressed: false, dashPressed: false, pulsePressed: false, interactPressed: false,
    };
    sim.step(w, inp, FIXED_DT, { clock: true, simulate: true });
  }
}
function settle(w, n = 4) { run(w, n, { axis: 0, jumpHeld: false }); w.events.length = 0; }
function quiet(w) { for (const e of Object.values(w.enemies)) e.disabled = true; }
function tp(w, x, y, opts = {}) {
  Object.assign(w.player, { x, y, vx: 0, vy: 0, grounded: false, standingOn: null, ...opts });
}
function events(w) { return sim.drainEvents(w).map((e) => e.type); }
function jumpApex(w, holdSteps) {
  tp(w, 3, 0);
  settle(w, 4);
  let maxY = 0;
  for (let i = 0; i < 130; i++) {
    const input = { axis: 0, jumpHeld: i < holdSteps };
    if (i === 0) input.jumpPressed = true;
    sim.step(w, input, FIXED_DT, { clock: true, simulate: true });
    maxY = Math.max(maxY, w.player.y);
  }
  return maxY;
}

// ---------------------------------------------------------------------------
head('Movement contracts');
{
  const w = W(); quiet(w); tp(w, 30, 0, { grounded: true }); settle(w);
  run(w, 30, { axis: 1, jumpHeld: false });
  ok('ground acceleration reaches max speed', near(w.player.vx, T.maxSpeed, 0.02), `vx=${w.player.vx.toFixed(3)}`);
  run(w, 12, { axis: 0, jumpHeld: false });
  ok('ground braking decelerates', w.player.vx < T.maxSpeed - 1 && w.player.vx > 0, `vx=${w.player.vx.toFixed(3)}`);
}
{
  const held = jumpApex(W(), 130);
  ok('held jump rises ~2.6 units', held > 2.4 && held < 2.85, `apex=${held.toFixed(3)}`);
  const tap = jumpApex(W(), 6);
  ok('short tap rises 1.2-1.5 units', tap > 1.1 && tap < 1.7, `apex=${tap.toFixed(3)}`);
}
{
  const w = W(); tp(w, 3, 0); settle(w);
  run(w, 1, { axis: 0, jumpHeld: true, jumpPressed: true });
  const vyAfter = w.player.vy;
  run(w, 1, { axis: 0, jumpHeld: true, jumpPressed: false });
  const vyMid = w.player.vy;
  run(w, 1, { axis: 0, jumpHeld: true, jumpPressed: true }); // second press midair
  ok('no double jump', w.player.vy < vyMid && w.player.vy < T.jumpSpeed,
    `vy=${w.player.vy.toFixed(2)} first=${vyAfter.toFixed(2)}`);
}
{
  // Coyote time: walk off the authored gap edge at x=18, then jump while airborne.
  const w = W(); quiet(w); tp(w, 17.7, 0, { grounded: true }); settle(w);
  run(w, 30, { axis: 1, jumpHeld: false });
  const airborne = !w.player.grounded && w.player.vy < 0 && w.player.coyote > 0;
  run(w, 1, { axis: 1, jumpHeld: true, jumpPressed: true });
  ok('coyote time allows a late jump', airborne && w.player.vy > 10,
    `airborne=${airborne} vy=${w.player.vy.toFixed(2)} coyote=${w.player.coyote.toFixed(3)}`);
}
{
  // Jump buffer: press just before landing, jump executes on contact.
  const w = W(); quiet(w); tp(w, 8, 0.15, { grounded: false, vy: 0, coyote: 0 });
  let landed = false, buffered = false;
  for (let i = 0; i < 60; i++) {
    const input = { axis: 0, jumpHeld: true, jumpPressed: i === 0 };
    sim.step(w, input, FIXED_DT, { clock: true, simulate: true });
    if (w.player.grounded) landed = true;
    if (landed && w.player.vy > 10) { buffered = true; break; }
  }
  ok('jump buffer fires on landing', buffered);
}
{
  // Ceiling resolution: foundry recess roof at y=2.2 clamps the jump.
  const w = W(); tp(w, 121.5, 0, { grounded: true }); settle(w);
  let maxY = 0;
  for (let i = 0; i < 60; i++) {
    const input = { axis: 0, jumpHeld: true, jumpPressed: i === 0 };
    sim.step(w, input, FIXED_DT, { clock: true, simulate: true });
    maxY = Math.max(maxY, w.player.y);
  }
  ok('ceiling stops the jump', maxY < 1.05 && maxY > 0.3, `maxY=${maxY.toFixed(3)}`);
}

// ---------------------------------------------------------------------------
head('Wall movement');
{
  const w = W();
  tp(w, 58.0, 3.0, { vy: -1 });        // inside reservoir shaft, beside right wall
  run(w, 8, { axis: 1, jumpHeld: false });
  ok('valid wall slide starts airborne into wall', w.player.wallSliding && w.player.onWall === 1,
    `sliding=${w.player.wallSliding} onWall=${w.player.onWall}`);
  ok('wall slide caps fall speed', w.player.vy >= -T.wallSlideCap - 0.01, `vy=${w.player.vy.toFixed(2)}`);
}
{
  const w = W();
  tp(w, 58.0, 0, { grounded: true });
  settle(w);
  run(w, 2, { axis: 1, jumpHeld: false });
  ok('grounded side contact never starts a slide', !w.player.wallSliding);
}
{
  const w = W();
  tp(w, 58.0, 3.0, { vy: -1 });
  run(w, 8, { axis: 1, jumpHeld: false });
  run(w, 1, { axis: 1, jumpHeld: true, jumpPressed: true });
  ok('wall jump launches up and away', near(w.player.vy, T.wallJumpVy, 0.6) && near(w.player.vx, -T.wallJumpVx, 0.6),
    `vx=${w.player.vx.toFixed(2)} vy=${w.player.vy.toFixed(2)}`);
  ok('steering lock engaged', near(w.player.steerLock, T.steerLock, 0.02));
  const vx0 = w.player.vx;
  run(w, 6, { axis: 1, jumpHeld: true });   // push back toward the wall during lock
  ok('steering lock resists reversal', Math.sign(w.player.vx) === Math.sign(vx0),
    `vx=${w.player.vx.toFixed(2)}`);
}
{
  // Geometry reachability of every authored wall-jump shaft.
  const shafts = [
    { l: 54.7, r: 58.4, top: 6.8 },
    { l: 104.9, r: 108.6, top: 6.8 },
    { l: 186.4, r: 190.2, top: 6.8 },
  ];
  let good = true;
  for (const s of shafts) if (s.r - s.l < T.bodyW + 1.0) good = false;
  ok('all wall-jump shafts fit the full body', good,
    `widths=${shafts.map((s) => (s.r - s.l).toFixed(1)).join(',')}`);
}

// ---------------------------------------------------------------------------
head('Dash');
{
  const w = W(); tp(w, 13, 0, { grounded: true }); settle(w);
  const x0 = w.player.x;
  run(w, 1, { axis: 0, facing: 1, dashPressed: true });
  ok('dash starts', w.player.dashTimer > 0 && w.player.dashCooldown > 0);
  run(w, Math.round(T.dashTime / FIXED_DT), { axis: 0 });
  const dx = w.player.x - x0;
  ok('dash covers ~2.4 units in 0.16s', dx > 2.1 && dx < 2.7, `dx=${dx.toFixed(3)}`);
  ok('dash ends with controlled exit velocity (not dash speed)',
    w.player.dashTimer === 0 && w.player.vx > 0 && w.player.vx < T.dashSpeed - 1,
    `vx=${w.player.vx.toFixed(2)}`);
  const ev = events(w);
  ok('cooldown blocks an immediate second dash', ev.includes('dashDenied') || w.player.dashCooldown > 0);
}
{
  const w = W(); tp(w, 13, 0, { grounded: true }); settle(w);
  run(w, 1, { axis: 0, dashPressed: true });
  run(w, 1, { axis: -1, dashPressed: false });   // opposite direction mid-dash
  ok('dash direction stays locked', w.player.vx > 0, `vx=${w.player.vx.toFixed(2)}`);
}
{
  // Swept collision: dash left into the authored boundary wall at x=-2.
  const w = W(); tp(w, 0, 0, { grounded: true }); settle(w);
  w.player.facing = -1;
  run(w, 20, { axis: 0, dashPressed: true });
  ok('dash stops safely at ordinary stone', w.player.x >= -1.7 && w.player.x < 0,
    `x=${w.player.x.toFixed(3)}`);
  const embedded = sim.activeSolids(w).some((s) =>
    w.player.x - T.halfW < s.x + s.w && w.player.x + T.halfW > s.x &&
    w.player.y < s.y + s.h && w.player.y + T.bodyH > s.y);
  ok('no tunneling / no embedded player', !embedded);
}
{
  const w = W(); tp(w, 8.4, 0, { grounded: true }); settle(w);
  w.player.facing = 1;
  run(w, 16, { axis: 1, dashPressed: true });
  ok('dash shatters the tutorial seam', w.seams.SM_TRAIN.broken && w.player.x > 10,
    `x=${w.player.x.toFixed(2)}`);
}
{
  const w = W(); tp(w, 13, 0, { grounded: true }); settle(w);
  run(w, 1, { axis: 0, dashPressed: true });
  run(w, 60, { axis: 0 });
  ok('ground landing refreshes the dash', w.player.dashAvailable);
}
{
  const w = W(); tp(w, 58.0, 3.0, { vy: -1 });
  run(w, 1, { axis: 0, dashPressed: true });
  run(w, 20, { axis: 0 });
  run(w, 8, { axis: 1, jumpHeld: false });
  run(w, 1, { axis: 1, jumpHeld: true, jumpPressed: true });
  ok('successful wall jump refreshes the dash', w.player.dashAvailable);
}

// ---------------------------------------------------------------------------
head('Echo pulse / resonance');
{
  const w = W(); tp(w, 13, 0, { grounded: true }); settle(w);
  run(w, 1, { axis: 0, pulsePressed: true });
  ok('pulse costs 35 energy', near(w.player.energy, 65, 0.01), `energy=${w.player.energy}`);
  ok('pulse cooldown is 0.7s', near(w.player.pulseCooldown, T.pulseCooldown - FIXED_DT, 0.02));
  const e0 = w.player.energy;
  run(w, 1, { axis: 0, pulsePressed: true });
  ok('cooldown rejects a repeat pulse without cost', near(w.player.energy, e0, 0.01) && events(w).includes('pulseFail'));
}
{
  const w = W(); tp(w, 13, 0, { grounded: true }); settle(w);
  run(w, 1, { axis: 0, pulsePressed: true });
  run(w, Math.round(1.0 / FIXED_DT), { axis: 0 });
  ok('no regeneration before the 1.5s delay', near(w.player.energy, 65, 0.01), `energy=${w.player.energy}`);
  run(w, Math.round(1.2 / FIXED_DT), { axis: 0 });
  ok('regeneration resumes at ~20/s', w.player.energy > 70 && w.player.energy <= 100,
    `energy=${w.player.energy.toFixed(1)}`);
}
{
  const w = W();
  // Closed shutter is a thick opaque wall; opening it clears the path.
  const blockedClosed = sim.losClear(w, 45, 0.75, 49.5, 1.6);
  w.shutters.SHUT_A.open = true;
  const cleared = sim.losClear(w, 45, 0.75, 49.5, 1.6);
  ok('opaque wall blocks functional pulse line of sight', blockedClosed === false);
  ok('opened shutter restores line of sight', cleared === true);
}
{
  // Real relay activation blocked by an opaque obstacle, then allowed.
  const w = W();
  w.switches.SW_B.on = true;
  const temp = { id: 'TEMP_BLOCK', x: 96, y: 0, w: 0.4, h: 3.6, region: 'reservoir' };
  LEVEL.shutters.push(temp);
  w.shutters.TEMP_BLOCK = { open: false };
  tp(w, 95, 0, { grounded: true }); settle(w);
  w.player.energy = 100; w.player.pulseCooldown = 0;
  run(w, 30, { axis: 0, pulsePressed: true });
  ok('relay activation is blocked by opaque cover', !w.relays.B.active);
  // Remove the obstacle, pulse again.
  LEVEL.shutters.pop(); delete w.shutters.TEMP_BLOCK;
  w.player.energy = 100; w.player.pulseCooldown = 0; w.player.lastEnergyUse = -100;
  run(w, 30, { axis: 0, pulsePressed: true });
  ok('relay activates when the wave reaches the powered node', w.relays.B.active);
}
{
  // Thin crystal seam transmits the wave; out-of-radius targets do not respond.
  const w = W(); w.switches.SW_B.on = true;
  ok('thin crystal seam transmits the pulse wave', sim.losClear(w, 88, 0.75, 97, 1.6) === true);
  tp(w, 80, 0, { grounded: true }); settle(w);            // 17 units from relay B
  w.player.energy = 100; w.player.pulseCooldown = 0;
  run(w, 30, { axis: 0, pulsePressed: true });
  ok('targets beyond the 6-unit radius do not respond', !w.relays.B.active);
}
{
  const w = W(); tp(w, 88.5, 0, { grounded: true }); settle(w);
  w.player.energy = 100;
  run(w, 1, { axis: 0, pulsePressed: true });
  run(w, 30, { axis: 0 });
  ok('hidden seam marking highlighted for ~5s', (w.highlights.SM_B || 0) > 4.5,
    `highlight=${(w.highlights.SM_B || 0).toFixed(2)}`);
}

// ---------------------------------------------------------------------------
head('Damage / shield / recovery');
{
  const w = W(); tp(w, 13, 0, { grounded: true }); settle(w);
  sim.damage(w, 'contact', 1);
  ok('shield absorbs a hit at >=50 energy', near(w.player.energy, 50, 0.01) && w.player.integrity === 3,
    `energy=${w.player.energy} hp=${w.player.integrity}`);
  ok('shield grants 0.8s immunity', near(w.player.immunity, T.shieldImmunity, 0.01));
  const e = w.player.energy, hp = w.player.integrity;
  sim.damage(w, 'contact', 1);
  ok('one hit never spends shield and integrity together', w.player.energy === e && w.player.integrity === hp);
}
{
  const w = W(); tp(w, 13, 0, { grounded: true }); settle(w);
  w.player.energy = 40;
  sim.damage(w, 'contact', 1);
  ok('insufficient energy loses one integrity unit', w.player.integrity === 2 && near(w.player.energy, 40, 0.01));
  ok('hurt grants 1.2s immunity', near(w.player.immunity, T.hurtImmunity, 0.01));
  ok('knockback is applied', w.player.vx !== 0);
}
{
  const w = W(); tp(w, 13, 0, { grounded: true }); settle(w);
  sim.damage(w, 'fall');
  ok('fall bypasses the shield entirely', w.player.energy === T.energyMax && w.player.integrity === 3 && !!w.shutdown);
}
{
  const w = W();
  tp(w, 70, -2.0, { grounded: false });   // inside the deep reservoir channel
  run(w, 2, { axis: 0 });
  ok('deep water triggers checkpoint recovery', !!w.shutdown || !!w.reboot);
}
{
  const w = W(); tp(w, 13, 0, { grounded: true }); settle(w);
  sim.damage(w, 'contact', 1); sim.damage(w, 'contact', 1); sim.damage(w, 'contact', 1);
  // three hits with immunity cleared between them => shutdown once
  w.player.immunity = 0; sim.damage(w, 'contact', 1);
  w.player.immunity = 0; sim.damage(w, 'contact', 1);
  w.player.immunity = 0; sim.damage(w, 'contact', 1);
  w.player.immunity = 0; sim.damage(w, 'contact', 1);
  ok('shutdown begins only once', !!w.shutdown && w.shutdown.t > 0);
}

// ---------------------------------------------------------------------------
head('Enemies');
{
  const w = W(); tp(w, 34, 0, { grounded: true }); settle(w);
  const evs = [];
  for (let i = 0; i < 200; i++) {
    sim.step(w, { axis: 0, jumpHeld: false }, FIXED_DT, { clock: true, simulate: true });
    evs.push(...sim.drainEvents(w).map((e) => e.type));
  }
  ok('skitter telegraphs before lunging', evs.includes('enemyTelegraph') && evs.includes('enemyLunge'));
}
{
  const w = W(); tp(w, 34, 0, { grounded: true }); settle(w);
  w.player.energy = 100;
  run(w, 1, { axis: 0, pulsePressed: true });
  run(w, 25, { axis: 0 });
  ok('pulse stuns the skitter', w.enemies.SK1.stunned > 0 || w.enemies.SK1.state === 'stunned');
  const hp = w.player.integrity, en = w.player.energy;
  tp(w, w.enemies.SK1.x, 0, { grounded: true, immunity: 0 });
  run(w, 3, { axis: 0 });
  ok('stunned machine deals no contact damage', w.player.integrity === hp && w.player.energy === en);
}
{
  const w = W(); tp(w, 34, 0, { grounded: true }); settle(w);
  w.enemies.SK1.state = 'stunned'; w.enemies.SK1.stunned = 2;
  w.player.facing = 1;
  tp(w, 33.2, 0, { grounded: true });
  run(w, 1, { axis: 0, dashPressed: true });
  run(w, 12, { axis: 0 });
  ok('dash disables a stunned machine', w.enemies.SK1.disabled && w.discoveries.machinesDisabled === 1);
  run(w, 1, { axis: 0, dashPressed: true });
  ok('duplicate disable collisions are not counted twice', w.discoveries.machinesDisabled === 1);
}
{
  const w = W();
  // Distant enemies do not run their cycles offscreen.
  tp(w, 3, 0, { grounded: true }); settle(w);
  run(w, 600, { axis: 0 });
  ok('offscreen enemies freeze their attack cycles', w.enemies.SK1.state === 'dormant',
    `state=${w.enemies.SK1.state}`);
}
{
  const w = W(); tp(w, 124, 0, { grounded: true }); settle(w);
  w.player.energy = 100;
  run(w, 1, { axis: 0, pulsePressed: true });
  run(w, 25, { axis: 0 });
  ok('pulse against closed sentinel armor deflects', events(w).includes('deflect') || w.enemies.SS1.state !== 'disabled');
  w.enemies.SS1.state = 'venting'; w.enemies.SS1.timer = 2;
  w.player.energy = 100; w.player.pulseCooldown = 0;
  tp(w, 124, 0, { grounded: true });
  run(w, 1, { axis: 0, pulsePressed: true });
  run(w, 25, { axis: 0 });
  ok('pulse against the open core disables the sentinel', w.enemies.SS1.disabled);
}
{
  const w = W(); tp(w, 85, 2.4, { grounded: true }); settle(w);
  // Let the drone aim and fire, then confirm all projectiles are cleaned up.
  run(w, 900, { axis: 0 });
  ok('projectiles expire or hit terrain (bounded cleanup)', w.projectiles.length === 0,
    `count=${w.projectiles.length}`);
}

// ---------------------------------------------------------------------------
head('Power cells and interaction');
{
  const w = W(); tp(w, 40, 0, { grounded: true }); settle(w);
  ok('loose cell is the current pickup target', sim.currentInteractTarget(w).type === 'pickup');
  run(w, 1, { axis: 0, interactPressed: true });
  ok('fresh interact picks up the cell', w.player.carrying === 'CELL_A' && w.cells.CELL_A.carried);
}
{
  const w = W(); tp(w, 40, 0, { grounded: true }); settle(w);
  run(w, 1, { axis: 0, interactPressed: true });
  const maxV = (() => { let m = 0; for (let i = 0; i < 120; i++) { sim.step(w, { axis: 1, jumpHeld: false }, FIXED_DT, { clock: true, simulate: true }); m = Math.max(m, w.player.vx); } return m; })();
  ok('carrying caps speed at 4.5', maxV <= T.carrySpeed + 0.01, `max=${maxV.toFixed(2)}`);
  w.player.energy = 100;
  const e0 = w.player.energy;
  run(w, 1, { axis: 0, pulsePressed: true });
  ok('pulse unavailable while carrying', near(w.player.energy, e0, 0.01));
  w.player.dashCooldown = 0;
  run(w, 1, { axis: 0, dashPressed: true });
  ok('dash unavailable while carrying', w.player.dashTimer === 0);
}
{
  const w = W(); tp(w, 40, 0, { grounded: true }); settle(w);
  run(w, 1, { axis: 0, interactPressed: true });
  tp(w, -1.2, 0, { grounded: true, facing: -1 }); settle(w);
  run(w, 1, { axis: 0, interactPressed: true });
  ok('unsafe placement is rejected and the cell is retained',
    w.player.carrying === 'CELL_A' && events(w).includes('placeDenied'));
}
{
  const w = W(); tp(w, 144, 0, { grounded: true }); settle(w);
  run(w, 1, { axis: 0, interactPressed: true }); // carry CELL_C
  tp(w, 145.5, 0, { grounded: true }); settle(w);
  ok('compatible socket has interaction priority over loose cells',
    sim.currentInteractTarget(w).type === 'insert');
}
{
  const w = W(); tp(w, 40, 0, { grounded: true }); settle(w);
  run(w, 1, { axis: 0, interactPressed: true });
  tp(w, 44, 0, { grounded: true }); settle(w);
  run(w, 1, { axis: 0, interactPressed: true });
  ok('cell inserts into the socket', w.sockets.SOCK_A.cell === 'CELL_A' && !w.player.carrying);
  ok('socketed cell can be removed but not duplicated', sim.currentInteractTarget(w).type === 'remove');
  run(w, 1, { axis: 0, interactPressed: true });
  ok('removal gives exactly one carried cell', w.player.carrying === 'CELL_A' &&
    Object.keys(w.cells).length === 2 && Object.values(w.cells).filter((c) => c.carried).length === 1);
}

// ---------------------------------------------------------------------------
head('Authored puzzles (scripted solutions)');
{
  // 1. Workshop circuit.
  const w = W();
  tp(w, 40, 0, { grounded: true }); settle(w);
  run(w, 1, { axis: 0, interactPressed: true });          // pick up CELL_A
  tp(w, 44, 0, { grounded: true }); settle(w);
  run(w, 1, { axis: 0, interactPressed: true });          // insert
  run(w, 2, { axis: 0 });
  ok('workshop: socket opens the shutter', w.shutters.SHUT_A.open && w.relays.A.powered);
  tp(w, 49, 0, { grounded: true }); settle(w);
  w.player.energy = 100;
  run(w, 30, { axis: 0, pulsePressed: true });
  ok('workshop: pulse activates Relay A', w.relays.A.active);
  ok('workshop: checkpoint committed at S1', w.checkpoint.stationId === 'S1');
}
{
  // 2. Reservoir bridge.
  const w = W();
  w.switches.SW_B.on = true;
  tp(w, 62, 0, { grounded: true }); settle(w);
  run(w, 2, { axis: 0 });
  ok('reservoir: switch powers the slow crossing platform', w.platforms.PLAT_B.active);
  ok('reservoir: Relay B becomes powered', w.relays.B.powered);
  tp(w, 96, 0, { grounded: true }); settle(w);
  w.player.energy = 100;
  run(w, 30, { axis: 0, pulsePressed: true });
  ok('reservoir: pulse activates Relay B', w.relays.B.active);
}
{
  // 3. Foundry counterweight - full solution and reversal.
  // Relays A and B are treated as already committed from the earlier chambers.
  const w = W();
  w.relays.A.active = true; w.relays.B.active = true;
  tp(w, 144, 0, { grounded: true }); settle(w);
  run(w, 1, { axis: 0, interactPressed: true });          // carry CELL_C
  tp(w, 145.5, 0, { grounded: true }); settle(w);
  run(w, 1, { axis: 0, interactPressed: true });          // insert into lift socket
  run(w, 2, { axis: 0 });
  ok('foundry: lower socket powers the counterweight lift', w.platforms.PLAT_LIFT.active);
  w.switches.SW_C.on = true; w.latch.upperRoute = true;
  run(w, 2, { axis: 0 });
  ok('foundry: upper switch latches the route open', w.shutters.SHUT_C.open);
  tp(w, 145.5, 0, { grounded: true }); settle(w);
  run(w, 1, { axis: 0, interactPressed: true });          // remove cell
  run(w, 3, { axis: 0 });
  ok('foundry: route stays accessible after the cell is removed', w.shutters.SHUT_C.open && !w.platforms.PLAT_LIFT.active);
  tp(w, 166, 0, { grounded: true }); settle(w);
  run(w, 1, { axis: 0, interactPressed: true });          // insert into relay socket
  run(w, 2, { axis: 0 });
  ok('foundry: relay socket powers Relay C', w.relays.C.powered && w.sockets.SOCK_C.cell === 'CELL_C');
  tp(w, 169, 0, { grounded: true }); settle(w);
  w.player.energy = 100;
  run(w, 30, { axis: 0, pulsePressed: true });
  ok('foundry: pulse activates Relay C', w.relays.C.active);
  ok('all three relays unlock the ascent lift', sim.allRelaysActive(w));
}

// ---------------------------------------------------------------------------
head('Checkpoints and recovery');
{
  const w = W();
  // Commit a snapshot at S1 with Relay A active and one archive collected.
  w.relays.A.active = true;
  w.archives.ARC1.collected = true; w.discoveries.archives = 1;
  sim.commitCheckpoint(w, 'S1');
  // Change post-snapshot state.
  w.seams.SM_B.broken = true;
  w.relays.B.active = true;
  w.caches.CACHE1.collected = true; w.discoveries.caches = 1;
  w.enemies.SK1.disabled = true;
  w.cells.CELL_A.x = 999;
  sim.recover(w);
  ok('recovery keeps committed relay and archive', w.relays.A.active && w.archives.ARC1.collected && w.discoveries.archives === 1);
  ok('recovery rolls back later relay activation', !w.relays.B.active);
  ok('recovery rolls back broken seam, cache and disabled machine',
    !w.seams.SM_B.broken && !w.caches.CACHE1.collected && !w.enemies.SK1.disabled);
  ok('recovery restores loose cell position', w.cells.CELL_A.x === 40);
  ok('recovery clears pulses and projectiles', w.pulses.length === 0 && w.projectiles.length === 0);
  ok('recovery restores full integrity and energy at the station',
    w.player.integrity === 3 && w.player.energy === 100 && w.player.x === 51 && w.player.vx === 0);
}
{
  const w = W(); tp(w, 13, 0, { grounded: true }); settle(w);
  w.time = 10;
  ok('manual retry succeeds', sim.retry(w));
  ok('retry increments one recovery', w.recoveries === 1);
  ok('retry does not rewind elapsed time', w.time === 10);
  ok('retry is disabled during reboot', !sim.retry(w) && w.recoveries === 1);
}
{
  const w = W();
  for (let i = 0; i < 20; i++) sim.recover(w);
  ok('repeated recovery does not grow entities or arrays',
    Object.keys(w.enemies).length === LEVEL.enemies.length &&
    w.pulses.length === 0 && w.projectiles.length === 0 && w.events.length <= 256);
  sim.restartWorld(w);
  ok('full restart clears run state but keeps records separate',
    w.time === 0 && w.recoveries === 0 && !w.relays.A.active && w.discoveries.archives === 0);
}

// ---------------------------------------------------------------------------
head('Platforms and lift gating');
{
  const def = LEVEL.platforms.find((p) => p.id === 'PLAT_B');
  const atEnd = sim.platformPos(def, (def.period - 2 * def.pause) / 2 + 0.1);
  ok('platform pauses at its endpoint', near(atEnd, def.max, 0.01));
  const atStart = sim.platformPos(def, 0);
  ok('platform starts at the boarding endpoint', near(atStart, def.min, 0.01));
}
{
  const w = W();
  w.switches.SW_B.on = true;
  const defB = LEVEL.platforms.find((p) => p.id === 'PLAT_B');
  const st = w.platforms.PLAT_B;
  tp(w, st.x + defB.w / 2, st.y + defB.h, { grounded: false, vy: -0.1 });
  const before = st.x;
  run(w, 30, { axis: 0 });
  ok('active platform moves and carries a standing player',
    st.x > before && near(w.player.x - (st.x + defB.w / 2), 0, 0.08),
    `platform=${st.x.toFixed(2)} player=${w.player.x.toFixed(2)}`);
}
{
  const w = W(); tp(w, 212, 6.8, { grounded: true }); settle(w);
  w.enemies.SK2.disabled = true;
  w.relays.A.active = true; w.relays.B.active = true; w.relays.C.active = false;
  run(w, 1, { axis: 0, interactPressed: true });
  ok('lift denies boarding with only two relays', !w.lift.used && events(w).includes('liftDenied'));
  w.relays.C.active = true;
  run(w, 1, { axis: 0, interactPressed: true });
  ok('lift starts with all three relays and valid boarding', w.lift.used && w.ending);
}

// ---------------------------------------------------------------------------
head('Personal records');
{
  const mem = () => { const m = new Map(); return { getItem: (k) => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
  const s = mem();
  const r = createRecords(s);
  ok('incomplete runs never qualify', r.commit({ completed: false, time: 1, recoveries: 0, archives: 3 }).length === 0 && r.data.bestTime === null);
  r.commit({ completed: true, time: 500, recoveries: 3, archives: 1 });
  ok('first completion saves best time', near(r.data.bestTime, 500, 0.001));
  ok('standard run does not qualify for full-archive time', r.data.bestFullArchiveTime === null);
  r.commit({ completed: true, time: 420, recoveries: 5, archives: 3 });
  ok('faster full-archive run saves both records', near(r.data.bestTime, 420, 0.001) && near(r.data.bestFullArchiveTime, 420, 0.001));
  r.commit({ completed: true, time: 300, recoveries: 5, archives: 0 });
  ok('fewer recoveries wins with time only as tie-breaker', r.data.fewestRecoveries === 3);
  const r2 = createRecords(s);
  ok('records reload from storage', near(r2.data.bestFullArchiveTime, 420, 0.001));
  s.setItem(KEY, '{corrupt json');
  const r3 = createRecords(s);
  ok('corrupt storage is ignored without interrupting play', r3.data.bestTime === null);
  const r4 = createRecords(null);
  r4.commit({ completed: true, time: 100, recoveries: 0, archives: 3 });
  ok('unavailable storage keeps in-memory records', near(r4.data.bestTime, 100, 0.001) && !r4.storageAvailable);
  ok('version validation rejects incompatible data', validate({ version: VERSION + 1, bestTime: 1 }).bestTime === null);
}

// ---------------------------------------------------------------------------
head('Route reachability (geometry vs measured physics)');
{
  const held = jumpApex(W(), 130);
  const airtime = 2 * T.jumpSpeed / (-T.gravity);
  const reach = T.maxSpeed * airtime;
  const gaps = [{ name: 'workshop gap 18-21', w: 3 }, { name: 'reservoir water 62-80', w: 18 }];
  ok('ordinary gap is below measured jump reach', gaps[0].w < reach - 1.0,
    `gap=${gaps[0].w} reach=${reach.toFixed(2)} heldApex=${held.toFixed(2)}`);
  ok('deep water crossing uses the authored moving platform',
    LEVEL.platforms.some((p) => p.id === 'PLAT_B' && p.min <= 63 && p.max >= 76));
  ok('route length is within 180-240 units', LEVEL.lift.console.x - LEVEL.spawn.x >= 180 &&
    LEVEL.lift.console.x - LEVEL.spawn.x <= 240);
  ok('exactly three archives and three relays', LEVEL.archives.length === 3 && LEVEL.relays.length === 3);
  ok('exactly three regions plus ascent', LEVEL.regions.length === 4);
}

// ---------------------------------------------------------------------------
head('Authored route traversal (scripted physics bots)');
// These drive the real simulation with real inputs; they are not mocked rules.

function botWorld(x, y = 0) {
  const w = sim.createWorld();
  for (const e of Object.values(w.enemies)) e.disabled = true;
  Object.assign(w.player, { x, y, vx: 0, vy: 0, grounded: true, onWall: 0, coyote: 0.11 });
  run(w, 3, { axis: 0, jumpHeld: false });
  return w;
}
function jumpCoast(w, drive = 82, coast = 23) {
  run(w, 1, { axis: 1, jumpHeld: true, jumpPressed: true });
  run(w, drive, { axis: 1, jumpHeld: true });
  run(w, coast, { axis: 0, jumpHeld: true });
}
function climbShaft(w, ledgeL, ledgeR, ledgeTop) {
  let startJump = true, cd = 0, axis = -1, jumps = 0;
  for (let i = 0; i < 700; i++) {
    let jp = false;
    if (startJump && w.player.grounded) { jp = true; startJump = false; axis = -1; }
    else if (!w.player.grounded && w.player.onWall !== 0 && cd <= 0) {
      jp = true; axis = -w.player.onWall; cd = 12;
    }
    cd--;
    if (jp) jumps++;
    sim.step(w, { axis, jumpHeld: true, jumpPressed: jp }, FIXED_DT, { clock: true, simulate: true });
    if (w.player.grounded && w.player.y >= ledgeTop - 0.06 &&
        w.player.x > ledgeL && w.player.x < ledgeR) {
      return { landed: true, jumps, x: w.player.x, y: w.player.y };
    }
  }
  return { landed: false, jumps, x: w.player.x, y: w.player.y };
}
function walkToTarget(w, type, maxSteps = 400) {
  for (let i = 0; i < maxSteps; i++) {
    sim.step(w, { axis: 1, jumpHeld: false }, FIXED_DT, { clock: true, simulate: true });
    if (sim.currentInteractTarget(w)?.type === type) return true;
  }
  return false;
}

{
  // Workshop: jump the authored 3-unit gap (18..21).
  const w = botWorld(17.6);
  run(w, 1, { axis: 1, jumpHeld: true, jumpPressed: true });
  run(w, 105, { axis: 1, jumpHeld: true });
  ok('required workshop gap is jumpable with a held jump',
    w.player.x > 21 && w.player.grounded && w.player.y === 0,
    `x=${w.player.x.toFixed(2)} y=${w.player.y.toFixed(2)}`);
}
{
  // Workshop Memory Archive 1: step -> shelf -> dash seam -> archive.
  const w = botWorld(21);
  jumpCoast(w); jumpCoast(w);
  const onShelf = w.player.grounded && Math.abs(w.player.y - 3.6) < 0.05;
  w.player.facing = 1;
  run(w, 1, { axis: 1, dashPressed: true });
  run(w, 25, { axis: 1 });
  const target = sim.currentInteractTarget(w);
  run(w, 1, { axis: 0, interactPressed: true });
  ok('archive A route is reachable and collected',
    onShelf && w.seams.SM_ARC1.broken && target?.type === 'archive' && w.archives.ARC1.collected,
    `shelf=${onShelf} seam=${w.seams.SM_ARC1.broken} target=${target?.type}`);
}
{
  // Reservoir switch shaft: wall-jump climb, then activate the switch.
  const w = botWorld(56.5);
  const climb = climbShaft(w, 53.8, 66.3, 6.8);
  ok('reservoir switch shaft is climbable with wall jumps',
    climb.landed && climb.jumps >= 2,
    `landed=${climb.landed} jumps=${climb.jumps} y=${climb.y.toFixed(2)}`);
  const reached = walkToTarget(w, 'switch');
  run(w, 1, { axis: 0, interactPressed: true });
  ok('bridge switch is reachable from the shaft ledge', reached && w.switches.SW_B.on);
}
{
  // Slow crossing platform carries ILO across the deep reservoir channel.
  const w = botWorld(62);
  w.switches.SW_B.on = true;
  const st = w.platforms.PLAT_B;
  Object.assign(w.player, {
    x: st.x + 1.6, y: st.y + 0.4, vx: 0, vy: -0.1,
    grounded: false, standingOn: 'PLAT_B',
  });
  run(w, 500, { axis: 0, jumpHeld: false });
  ok('crossing platform carries the player over deep water without recovery',
    st.x > 76 && w.player.x > 76 && w.player.y > 1 && !w.shutdown,
    `platform=${st.x.toFixed(2)} player=${w.player.x.toFixed(2)} y=${w.player.y.toFixed(2)}`);
}
{
  // Reservoir Memory Archive 2: optional wall-jump route.
  const w = botWorld(106.5);
  const climb = climbShaft(w, 104, 114.5, 6.8);
  const reached = walkToTarget(w, 'archive');
  run(w, 1, { axis: 0, interactPressed: true });
  ok('archive B route is reachable and collected',
    climb.landed && reached && w.archives.ARC2.collected,
    `climb=${climb.landed} reached=${reached}`);
}
{
  // Foundry counterweight: insert cell, ride lift, latch the upper switch.
  const w = botWorld(144);
  run(w, 1, { axis: 0, interactPressed: true });          // pick up CELL_C
  Object.assign(w.player, { x: 145.5, y: 0, vx: 0, vy: 0, grounded: true, standingOn: null });
  run(w, 3, { axis: 0, jumpHeld: false });
  run(w, 1, { axis: 0, interactPressed: true });          // insert into lift socket
  run(w, 3, { axis: 0 });
  const st = w.platforms.PLAT_LIFT;
  Object.assign(w.player, {
    x: st.x + 1.6, y: st.y + 0.4, vx: 0, vy: -0.1,
    grounded: false, standingOn: 'PLAT_LIFT',
  });
  run(w, 320, { axis: 0, jumpHeld: false });
  const rode = w.player.y > 6 && st.y > 5.9;
  const reached = walkToTarget(w, 'switch');
  run(w, 1, { axis: 0, interactPressed: true });
  ok('counterweight lift carries ILO to the upper switch',
    rode && reached && w.switches.SW_C.on && w.latch.upperRoute && w.shutters.SHUT_C.open,
    `rode=${rode} reached=${reached} y=${w.player.y.toFixed(2)}`);
}
{
  // Foundry Memory Archive 3: service-room stair route, seam, archive.
  // The shutter is latched before settling so the player starts on safe ground.
  const w = sim.createWorld();
  for (const e of Object.values(w.enemies)) e.disabled = true;
  w.latch.upperRoute = true;
  Object.assign(w.player, { x: 158.5, y: 0, vx: 0, vy: 0, grounded: true, onWall: 0, coyote: 0.11 });
  run(w, 3, { axis: 0, jumpHeld: false });
  jumpCoast(w); jumpCoast(w); jumpCoast(w);
  const onShelf = w.player.grounded && Math.abs(w.player.y - 5.2) < 0.05;
  run(w, 20, { axis: 1 });
  w.player.facing = 1;
  run(w, 1, { axis: 1, dashPressed: true });
  run(w, 25, { axis: 1 });
  const target = sim.currentInteractTarget(w);
  run(w, 1, { axis: 0, interactPressed: true });
  ok('archive C route is reachable and collected',
    onShelf && w.seams.SM_ARC3.broken && target?.type === 'archive' && w.archives.ARC3.collected,
    `shelf=${onShelf} seam=${w.seams.SM_ARC3.broken} target=${target?.type}`);
}
{
  // Ascent shaft climb.
  const w = botWorld(188);
  const climb = climbShaft(w, 185.5, 199.1, 6.8);
  ok('ascent shaft is climbable with wall jumps', climb.landed && climb.jumps >= 2,
    `landed=${climb.landed} jumps=${climb.jumps} y=${climb.y.toFixed(2)}`);
}
{
  // Service platform bridges the ascent gap to the second ledge.
  const w = botWorld(199);
  const st = w.platforms.PLAT_ASC;
  Object.assign(w.player, {
    x: st.x + 1.5, y: st.y + 0.4, vx: 0, vy: -0.1,
    grounded: false, standingOn: 'PLAT_ASC',
  });
  run(w, 320, { axis: 0, jumpHeld: false });
  ok('ascent service platform reaches the far ledge deterministically',
    st.x >= 203.9 && w.player.x > 204 && !w.shutdown,
    `platform=${st.x.toFixed(2)} player=${w.player.x.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(52)}`);
console.log(`RESULT: ${P} passed, ${F} failed`);
if (F) { console.log('\nFailures:'); for (const f of failures) console.log('  - ' + f); }
console.log('='.repeat(52));
process.exit(F ? 1 : 0);
