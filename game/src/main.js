// DEEPWAKE - bootstrap, game loop, states, input and glue.

import { T, FIXED_DT, MAX_ACCUM } from './constants.js';
import { LEVEL } from './level.js';
import * as sim from './sim.js';
import { createRenderer } from './world.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';
import { createRecords } from './records.js';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const audio = createAudio();
const records = createRecords();
let world = sim.createWorld();

let state = 'title';
let pageHidden = false;
let manual = false;             // inspection API can suspend the automatic loop
let muted = false;              // user setting, retained across restarts
let reducedMotion = false;      // user setting, retained across restarts
let accum = 0;
let lastTime = 0;
let ending = null;
let regionId = 'workshop';
let webglWarned = false;

// ---- Input ---------------------------------------------------------------
const KEYMAP = {
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyZ: 'jump',
  ShiftLeft: 'dash', ShiftRight: 'dash', KeyX: 'dash',
  KeyQ: 'pulse', KeyE: 'interact',
  KeyP: 'pause', Escape: 'pause', KeyR: 'retry', Enter: 'confirm',
};
const held = new Set();
const pressed = new Set();
let scriptedInput = null;       // inspection override

function clearInput() {
  held.clear();
  pressed.clear();
  ui.clearTouch();
}

function unlockAudio() { audio.unlock(); }

window.addEventListener('keydown', (e) => {
  const a = KEYMAP[e.code];
  if (!a) return;
  e.preventDefault();           // handled keys never scroll the page
  unlockAudio();
  if (!e.repeat) pressed.add(a);
  held.add(a);
}, { passive: false });

window.addEventListener('keyup', (e) => {
  const a = KEYMAP[e.code];
  if (!a) return;
  e.preventDefault();
  held.delete(a);
}, { passive: false });

window.addEventListener('blur', clearInput);
window.addEventListener('pointerdown', unlockAudio, { passive: true });
document.addEventListener('visibilitychange', () => {
  pageHidden = document.hidden;
  if (pageHidden) {
    clearInput();
    audio.setRunning(false);
  } else if (state === 'play') {
    audio.setRunning(true);
  }
});

// ---- UI ------------------------------------------------------------------
const ui = createUI({ onAction });
ui.setRecords(records);
ui.setMuted(muted);
ui.setReducedMotion(reducedMotion);
renderer.setReducedMotion(reducedMotion);

function buildInput() {
  const t = ui.consumeTouch();
  const has = (k) => held.has(k) || t.held[k] || (scriptedInput && scriptedInput[k]);
  const hit = (k) => pressed.has(k) || t.pressed[k] || (scriptedInput && scriptedInput['press_' + k]);
  const input = {
    axis: (has('right') ? 1 : 0) - (has('left') ? 1 : 0),
    jumpHeld: !!has('jump'),
    jumpPressed: !!hit('jump'),
    dashPressed: !!hit('dash'),
    pulsePressed: !!hit('pulse'),
    interactPressed: !!hit('interact'),
  };
  return input;
}
const noEdges = (i) => ({ ...i, jumpPressed: false, dashPressed: false, pulsePressed: false, interactPressed: false });

// ---- State transitions ---------------------------------------------------
function setState(s) { state = s; }

function showRecoveryOverlay() {
  if (ui.overlayKind !== 'recovery') ui.showOverlay('recovery', { world });
}

function startExpedition() {
  ui.hideOverlay();
  clearInput();
  setState('play');
  audio.setRunning(true);
  audio.setRegion(regionId);
  if (!renderer.available && !webglWarned) {
    ui.notice('3D view unavailable — the expedition still runs', 'warn');
    webglWarned = true;
  }
}

function pauseGame() {
  if (state !== 'play') return;
  setState('paused');
  clearInput();
  audio.setRunning(false);
  ui.showOverlay('paused', { world });
}

function resumeGame() {
  if (state !== 'paused') return;
  ui.hideOverlay();
  clearInput();               // a held confirmation key must not leak into play
  setState('play');
  audio.setRunning(true);
}

function doRetry() {
  if (state !== 'play' && state !== 'paused') return;
  if (sim.retry(world)) {
    ui.hideArchive();
    clearInput();
    renderer.clearEffects();
    setState('reboot');
    showRecoveryOverlay();
  }
}

function fullRestart() {
  sim.restartWorld(world);
  ending = null;
  renderer.setEnding(null);
  renderer.clearEffects();
  ui.hideArchive();
  ui.hideOverlay();
  clearInput();
  accum = 0;
  regionId = 'workshop';
  audio.setRegion(regionId);
  audio.setIntensity(0);
  audio.setRunning(true);
  setState('play');
}

function onAction(name) {
  switch (name) {
    case 'start': startExpedition(); break;
    case 'pause':
      if (state === 'play') pauseGame();
      else if (state === 'paused') resumeGame();
      break;
    case 'resume': resumeGame(); break;
    case 'retry': doRetry(); break;
    case 'restart': case 'newExpedition': fullRestart(); break;
    case 'mute':
      muted = !muted;
      audio.setMuted(muted);
      ui.setMuted(muted);
      ui.refresh();
      break;
    case 'reducedMotion':
      reducedMotion = !reducedMotion;
      renderer.setReducedMotion(reducedMotion);
      ui.setReducedMotion(reducedMotion);
      ui.refresh();
      break;
    case 'gesture': unlockAudio(); break;
    case 'dismissArchive': break;
  }
}

// ---- Ending sequence -----------------------------------------------------
const END_PHASES = [
  { name: 'barrier', dur: 0.7 },
  { name: 'rise', dur: 2.4 },
  { name: 'surface', dur: 1.5 },
];

function startEnding() {
  const L = LEVEL.lift;
  ending = {
    active: true, phase: 'barrier', t: 0, p: 0, committed: false,
    iloX: L.console.x - 0.5, iloY: L.deckY,
    startTime: world.time,
  };
  setState('liftSequence');
  clearInput();
  audio.setRunning(true);
  audio.play('lift');
  audio.setIntensity(1);
  renderer.setEnding(ending);
}

function updateEnding(dt) {
  if (!ending) return;
  const phase = END_PHASES.find((p) => p.name === ending.phase);
  ending.t += dt;
  ending.p = Math.min(1, ending.t / phase.dur);
  const L = LEVEL.lift;
  if (ending.phase === 'rise') {
    ending.iloY = L.deckY + ending.p * (L.topY - L.deckY);
  } else if (ending.phase === 'surface') {
    ending.iloY = L.topY - 0.2;
    ending.iloX = L.console.x - 0.5 + ending.p * 2.0;
  }
  renderer.setEnding(ending);
  if (ending.t >= phase.dur) {
    const i = END_PHASES.findIndex((p) => p.name === ending.phase);
    if (i < END_PHASES.length - 1) {
      ending.phase = END_PHASES[i + 1].name;
      ending.t = 0; ending.p = 0;
    } else {
      commitCompletion();
    }
  }
}

function commitCompletion() {
  if (ending.committed) return;      // commit the run result exactly once
  ending.committed = true;
  const time = ending.startTime;
  const fullArchive = world.discoveries.archives >= 3;
  const improved = records.commit({
    completed: true, time,
    recoveries: world.recoveries,
    archives: world.discoveries.archives,
  });
  audio.play('complete');
  audio.setRunning(false);
  setState('complete');
  ui.showOverlay('complete', {
    world, time, recoveries: world.recoveries,
    archives: world.discoveries.archives,
    caches: world.discoveries.caches,
    machinesDisabled: world.discoveries.machinesDisabled,
    fullArchive, improved,
  });
}

// ---- Events from the simulation -----------------------------------------
function handleEvents(events) {
  for (const e of events) {
    audio.playEvent(e);
    renderer.onEvent(e);
    switch (e.type) {
      case 'relay':
        ui.notice(`Relay ${e.id} online · route powered`, 'good');
        setState('relayActivation');
        clearInput();
        break;
      case 'relayUnpowered': ui.notice('Relay node is not powered yet', 'warn'); break;
      case 'pulseFail': ui.flashMeter(); break;
      case 'dashDenied': ui.notice('Abilities unavailable while carrying', 'warn'); break;
      case 'placeDenied': ui.notice('No safe space for the cell', 'warn'); break;
      case 'pickup': ui.notice('Power cell lifted · abilities subdued', ''); break;
      case 'insert': ui.notice('Cell seated · conduit powered', 'good'); break;
      case 'remove': ui.notice('Cell removed from socket', ''); break;
      case 'switch': ui.notice('Switch latched · route held open', 'good'); break;
      case 'cache': ui.notice(`Salvage cache · +${e.gain} resonance`, 'good'); break;
      case 'archive': ui.showArchive(e.title, e.text); break;
      case 'enemyDisable': ui.notice('Machine disabled', 'good'); break;
      case 'station': ui.notice('Reboot station · systems restored', 'good'); break;
      case 'liftDenied':
        ui.notice(e.reason === 'relays' ? 'All three relays must be online'
          : e.reason === 'boarding' ? 'Stand inside the lift boarding area'
          : 'The lift is already in motion', 'warn');
        break;
      case 'liftStart': startEnding(); break;
      case 'shutdown':
        setState('shutdown');
        clearInput();
        showRecoveryOverlay();
        break;
      case 'rebooted':
        setState('reboot');
        showRecoveryOverlay();
        break;
      case 'restart': renderer.clearEffects(); break;
    }
  }
}

// ---- Region / music ------------------------------------------------------
function updateRegion() {
  const r = LEVEL.regions.find((z) => world.player.x >= z.x1 && world.player.x < z.x2);
  const id = r ? r.id : 'workshop';
  if (id !== regionId) {
    regionId = id;
    audio.setRegion(id);
  }
  const activeCount = (world.relays.A.active ? 1 : 0) + (world.relays.B.active ? 1 : 0) + (world.relays.C.active ? 1 : 0);
  audio.setIntensity(activeCount / 3 + (state === 'liftSequence' ? 0.4 : 0));
}

// ---- Loop ----------------------------------------------------------------
function resize() { renderer.resize(window.innerWidth, window.innerHeight); }
window.addEventListener('resize', resize);
resize();

function frame(now) {
  requestAnimationFrame(frame);
  if (!lastTime) lastTime = now;
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (manual || pageHidden) return;

  // Discrete overlay / menu actions (fresh presses only).
  for (const a of [...pressed]) {
    if (a === 'pause') onAction('pause');
    else if (a === 'retry') onAction('retry');
    else if (a === 'confirm') {
      const primary = ui.primaryAction();
      if (primary) onAction(primary);
    }
  }

  const input = buildInput();
  pressed.clear();

  accum = Math.min(accum + dt, MAX_ACCUM);
  let first = true;
  let steps = 0;
  while (accum >= FIXED_DT && steps < 12) {
    const simulate = state === 'play';
    const clock = simulate && !world.relayFx && !world.shutdown && !world.reboot && !world.ending;
    sim.step(world, first ? input : noEdges(input), FIXED_DT, { clock, simulate });
    accum -= FIXED_DT;
    first = false;
    steps++;
  }

  const events = sim.drainEvents(world);
  if (events.length) handleEvents(events);

  // Presentation-only state transitions driven by world flags.
  if (state === 'relayActivation' && !world.relayFx) {
    setState('play');
    clearInput();
  }
  if (state === 'reboot' && !world.reboot && !world.shutdown) {
    ui.hideOverlay();
    clearInput();
    setState('play');
  }
  if (state === 'shutdown' && !world.shutdown && !world.reboot) {
    setState('play');
  }
  if (state === 'liftSequence') updateEnding(dt);

  updateRegion();

  // Footsteps while grounded and moving on a surface.
  const p = world.player;
  if (state === 'play' && p.grounded && Math.abs(p.vx) > 1.2 && !p.carrying) {
    audio.footstep(regionId === 'workshop' ? 'stone' : 'metal');
  }
  audio.update();

  const view = { state, reducedMotion };
  renderer.sync(world, dt, view);
  ui.sync(world, view);
  renderer.render();
}

requestAnimationFrame(frame);

// ---- Initial title overlay ----------------------------------------------
ui.showOverlay('title', { world });

// ---- Deterministic inspection API ---------------------------------------
// Kept out of the player interface; used by the validation checks.
window.__DEEPWAKE__ = {
  get state() { return state; },
  get world() { return world; },
  LEVEL, T,
  getState() {
    return {
      state, time: world.time, frame: world.frame,
      player: { ...world.player },
      relays: JSON.parse(JSON.stringify(world.relays)),
      sockets: JSON.parse(JSON.stringify(world.sockets)),
      cells: JSON.parse(JSON.stringify(world.cells)),
      shutters: JSON.parse(JSON.stringify(world.shutters)),
      seams: JSON.parse(JSON.stringify(world.seams)),
      discoveries: { ...world.discoveries },
      recoveries: world.recoveries,
      checkpoint: { ...world.checkpoint },
      latch: { ...world.latch },
      switches: JSON.parse(JSON.stringify(world.switches)),
      lift: { ...world.lift },
      enemies: Object.fromEntries(Object.entries(world.enemies).map(([k, v]) => [k, {
        state: v.state, x: v.x, y: v.y, disabled: v.disabled, stunned: v.stunned,
      }])),
      pulses: world.pulses.length,
      projectiles: world.projectiles.length,
      highlights: Object.keys(world.highlights).length,
    };
  },
  setManual(v) { manual = !!v; if (manual) clearInput(); },
  setInput(obj) { scriptedInput = obj; },
  clearInput,
  press(name) { pressed.add(name); },
  advance(n = 1, dt = FIXED_DT) {
    for (let i = 0; i < n; i++) {
      sim.step(world, i === 0 ? buildInput() : noEdges(buildInput()), dt,
        { clock: state === 'play', simulate: state === 'play' });
    }
    return sim.drainEvents(world);
  },
  teleport(x, y) {
    world.player.x = x; world.player.y = y;
    world.player.vx = 0; world.player.vy = 0;
    world.player.standingOn = null;
  },
  setEnergy(v) { world.player.energy = v; },
  setIntegrity(v) { world.player.integrity = v; },
  setFacing(v) { world.player.facing = v; },
  activateRelay(id) {
    world.relays[id].powered = true;
    world.relays[id].active = true;
  },
  setSwitch(id, on) { world.switches[id].on = on; if (id === 'SW_C' && on) world.latch.upperRoute = true; },
  recover() { sim.recover(world); },
  retry() { return sim.retry(world); },
  restart() { fullRestart(); },
  start() { startExpedition(); },
  target() { return sim.currentInteractTarget(world); },
  allRelaysActive() { return sim.allRelaysActive(world); },
  records() { return records.data; },
  rendererInfo() { return { available: renderer.available, ...renderer.cameraInfo() }; },
  audioInfo() { return { available: audio.available, muted: audio.muted }; },
  uiInfo() { return { overlay: ui.overlayKind, touchEnabled: ui.touchEnabled }; },
};
