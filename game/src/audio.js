// DEEPWAKE - original synthesized audio (Web Audio, no external assets).
// One AudioContext owner, bounded scheduling, gain ramps, node cleanup.

const REGION_MUSIC = {
  workshop:  { root: 55.00, step: 0.42, scale: [0, 3, 7, 10, 12, 15], density: 0.55, pad: 0.035 },
  reservoir: { root: 65.41, step: 0.50, scale: [0, 2, 5, 7, 9, 12, 14], density: 0.48, pad: 0.045 },
  foundry:   { root: 49.00, step: 0.36, scale: [0, 3, 5, 7, 10, 12], density: 0.62, pad: 0.030 },
  ascent:    { root: 73.42, step: 0.40, scale: [0, 2, 4, 7, 9, 11, 12], density: 0.58, pad: 0.040 },
};

export function createAudio() {
  let ctx = null;
  let master = null, musicBus = null, sfxBus = null;
  let noiseBuf = null;
  let available = false;
  let muted = false;
  let running = false;
  let region = 'workshop';
  let intensity = 0;
  let nextNoteTime = 0;
  let seq = 0;
  const live = new Set();
  let lastFootstep = 0;

  function ensure() {
    if (ctx || available === false && ctx !== null) return;
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) { available = false; return; }
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85;
      musicBus = ctx.createGain(); musicBus.gain.value = 0.0;
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9;
      musicBus.connect(master); sfxBus.connect(master); master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      available = true;
    } catch { available = false; ctx = null; }
  }

  function unlock() {
    ensure();
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch { /* ignore */ } }
    if (ctx) nextNoteTime = ctx.currentTime + 0.06;
  }

  function track(node, stopTime) {
    live.add(node);
    try { node.stop(stopTime); } catch { /* ignore */ }
    node.onended = () => { live.delete(node); try { node.disconnect(); } catch { /* ignore */ } };
  }

  function tone({ freq = 220, dur = 0.18, type = 'sine', gain = 0.2, at = 0, to = null, bus = sfxBus, attack = 0.008 }) {
    if (!ctx || !available) return;
    const t0 = Math.max(ctx.currentTime, at || ctx.currentTime);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus);
    o.start(t0);
    track(o, t0 + dur + 0.02);
  }

  function noise({ dur = 0.16, gain = 0.14, at = 0, hp = 400, lp = 5000 }) {
    if (!ctx || !available || !noiseBuf) return;
    const t0 = Math.max(ctx.currentTime, at || ctx.currentTime);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f1 = ctx.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp;
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f1); f1.connect(f2); f2.connect(g); g.connect(sfxBus);
    s.start(t0);
    track(s, t0 + dur + 0.02);
  }

  // ---- Music scheduler: short lookahead only, never a backlog -------------
  function update() {
    if (!ctx || !available || !running) return;
    const cfg = REGION_MUSIC[region] || REGION_MUSIC.workshop;
    const horizon = ctx.currentTime + 0.22;
    let guard = 0;
    while (nextNoteTime < horizon && guard++ < 8) {
      const s = seq++;
      const t = nextNoteTime;
      // Low mechanical drone every 8 steps.
      if (s % 8 === 0) {
        tone({ freq: cfg.root, dur: cfg.step * 7.4, type: 'sine', gain: cfg.pad + intensity * 0.01, at: t, bus: musicBus, attack: 0.6 });
        tone({ freq: cfg.root * 1.5, dur: cfg.step * 6.2, type: 'triangle', gain: cfg.pad * 0.45, at: t, bus: musicBus, attack: 0.9 });
      }
      // Sparse tonal pulse.
      if (Math.random() < cfg.density) {
        const deg = cfg.scale[(s * 3 + Math.floor(s / 7)) % cfg.scale.length];
        const f = cfg.root * Math.pow(2, deg / 12) * 4;
        tone({ freq: f, dur: 0.5 + Math.random() * 0.4, type: 'sine', gain: 0.035 + intensity * 0.012, at: t, bus: musicBus, attack: 0.02 });
      }
      // Soft metronomic tick to keep the sparse rhythm.
      if (s % 4 === 0) noise({ dur: 0.05, gain: 0.018, at: t, hp: 1800, lp: 6000 });
      nextNoteTime += cfg.step;
    }
  }

  // ---- Effect recipes -----------------------------------------------------
  const SFX = {
    jump:        () => tone({ freq: 300, to: 620, dur: 0.13, type: 'triangle', gain: 0.16 }),
    walljump:    () => { tone({ freq: 260, to: 700, dur: 0.15, type: 'triangle', gain: 0.17 }); noise({ dur: 0.09, gain: 0.07, hp: 900 }); },
    land:        () => { noise({ dur: 0.10, gain: 0.12, hp: 120, lp: 1700 }); tone({ freq: 110, to: 70, dur: 0.10, type: 'sine', gain: 0.12 }); },
    footstep:    () => noise({ dur: 0.045, gain: 0.035, hp: 300, lp: 2400 }),
    wallslide:   () => noise({ dur: 0.10, gain: 0.045, hp: 1100, lp: 4200 }),
    dash:        () => { noise({ dur: 0.18, gain: 0.16, hp: 700, lp: 6000 }); tone({ freq: 480, to: 160, dur: 0.18, type: 'sawtooth', gain: 0.10 }); },
    pulse:       () => { tone({ freq: 180, to: 900, dur: 0.34, type: 'sine', gain: 0.20 }); tone({ freq: 360, to: 1500, dur: 0.30, type: 'triangle', gain: 0.08 }); },
    reveal:      () => tone({ freq: 900, to: 1300, dur: 0.22, type: 'sine', gain: 0.06 }),
    pulseFail:   () => tone({ freq: 190, to: 150, dur: 0.12, type: 'sine', gain: 0.055 }),
    shield:      () => { tone({ freq: 620, to: 220, dur: 0.28, type: 'triangle', gain: 0.18 }); noise({ dur: 0.14, gain: 0.09, hp: 2000 }); },
    hurt:        () => { tone({ freq: 220, to: 80, dur: 0.30, type: 'sawtooth', gain: 0.18 }); noise({ dur: 0.18, gain: 0.12, hp: 200, lp: 2200 }); },
    pickup:      () => tone({ freq: 330, to: 520, dur: 0.14, type: 'square', gain: 0.09 }),
    place:       () => tone({ freq: 260, to: 170, dur: 0.13, type: 'square', gain: 0.08 }),
    insert:      () => { tone({ freq: 300, to: 700, dur: 0.22, type: 'triangle', gain: 0.14 }); tone({ freq: 150, dur: 0.30, type: 'sine', gain: 0.10 }); },
    remove:      () => tone({ freq: 420, to: 200, dur: 0.14, type: 'square', gain: 0.09 }),
    switch:      () => { tone({ freq: 240, to: 480, dur: 0.18, type: 'square', gain: 0.11 }); tone({ freq: 120, dur: 0.35, type: 'sine', gain: 0.09 }); },
    socket:      () => tone({ freq: 180, to: 540, dur: 0.26, type: 'triangle', gain: 0.12 }),
    relay:       () => { [0, 0.12, 0.26].forEach((d, i) => tone({ freq: 220 * Math.pow(2, i * 3 / 12), to: 440 * Math.pow(2, i * 3 / 12), dur: 0.5, type: 'sine', gain: 0.14, at: ctx.currentTime + d })); tone({ freq: 110, dur: 1.0, type: 'sine', gain: 0.10 }); },
    archive:     () => { [0, 0.09, 0.2].forEach((d, i) => tone({ freq: 660 + i * 160, dur: 0.4, type: 'sine', gain: 0.075, at: ctx.currentTime + d })); },
    cache:       () => tone({ freq: 520, to: 880, dur: 0.20, type: 'triangle', gain: 0.10 }),
    seamBreak:   () => { noise({ dur: 0.24, gain: 0.16, hp: 800, lp: 7000 }); tone({ freq: 700, to: 180, dur: 0.22, type: 'triangle', gain: 0.09 }); },
    enemyTelegraph: () => { tone({ freq: 160, to: 230, dur: 0.32, type: 'sawtooth', gain: 0.075 }); },
    enemyLunge:  () => noise({ dur: 0.14, gain: 0.11, hp: 300, lp: 3000 }),
    enemyFire:   () => tone({ freq: 900, to: 300, dur: 0.20, type: 'sawtooth', gain: 0.10 }),
    enemyStun:   () => { tone({ freq: 520, to: 130, dur: 0.30, type: 'square', gain: 0.10 }); },
    enemyDisable:() => { tone({ freq: 300, to: 90, dur: 0.40, type: 'triangle', gain: 0.14 }); noise({ dur: 0.20, gain: 0.08, hp: 400 }); },
    deflect:     () => tone({ freq: 700, to: 500, dur: 0.10, type: 'square', gain: 0.07 }),
    ventWarn:    () => tone({ freq: 300, to: 380, dur: 0.30, type: 'triangle', gain: 0.06 }),
    ventActive:  () => noise({ dur: 0.30, gain: 0.10, hp: 600, lp: 5000 }),
    shutdown:    () => { tone({ freq: 320, to: 45, dur: 0.85, type: 'sawtooth', gain: 0.16 }); },
    reboot:      () => { [0, 0.1, 0.2, 0.34].forEach((d, i) => tone({ freq: 180 + i * 110, dur: 0.24, type: 'sine', gain: 0.10, at: ctx.currentTime + d })); },
    checkpoint:  () => tone({ freq: 440, to: 660, dur: 0.22, type: 'sine', gain: 0.08 }),
    lift:        () => { tone({ freq: 70, to: 140, dur: 1.6, type: 'sine', gain: 0.12 }); noise({ dur: 1.2, gain: 0.045, hp: 100, lp: 900 }); },
    complete:    () => { [0, 0.18, 0.36, 0.6].forEach((d, i) => tone({ freq: [220, 277, 330, 440][i], dur: 1.2, type: 'sine', gain: 0.11, at: ctx.currentTime + d })); },
    ui:          () => tone({ freq: 520, dur: 0.06, type: 'sine', gain: 0.06 }),
  };

  function play(name) {
    if (!ctx || !available || !running || muted) return;
    const f = SFX[name];
    if (f) { try { f(); } catch { /* audio failure never breaks play */ } }
  }

  function playEvent(e) {
    switch (e.type) {
      case 'jump': case 'walljump': case 'land': case 'dash': case 'pulse':
      case 'pulseFail': case 'shield': case 'hurt': case 'pickup': case 'place':
      case 'insert': case 'remove': case 'switch': case 'relay': case 'archive':
      case 'cache': case 'seamBreak': case 'enemyTelegraph': case 'enemyLunge':
      case 'enemyFire': case 'enemyStun': case 'enemyDisable': case 'deflect':
      case 'ventWarn': case 'ventActive': case 'shutdown': case 'reboot':
      case 'checkpoint': case 'liftStart': case 'reveal':
        play(e.type === 'liftStart' ? 'lift' : e.type);
        break;
      case 'socket': play('socket'); break;
      case 'relayUnpowered': play('pulseFail'); break;
      case 'dashDenied': case 'placeDenied': case 'liftDenied': play('pulseFail'); break;
    }
  }

  function footstep(surface) {
    if (!ctx || !available || !running || muted) return;
    const now = ctx.currentTime;
    if (now - lastFootstep < 0.16) return;
    lastFootstep = now;
    noise({ dur: 0.045, gain: surface === 'metal' ? 0.042 : 0.03, hp: surface === 'metal' ? 700 : 260, lp: surface === 'metal' ? 5000 : 2000 });
  }

  return {
    unlock,
    play,
    playEvent,
    footstep,
    update,
    get available() { return available; },
    get muted() { return muted; },
    setMuted(v) {
      muted = !!v;
      if (ctx && master) {
        try { master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.02); } catch { /* ignore */ }
      }
    },
    setRunning(v) {
      const next = !!v;
      if (next === running) return;
      running = next;
      if (ctx && musicBus) {
        try { musicBus.gain.setTargetAtTime(running ? 0.9 : 0.0, ctx.currentTime, 0.08); } catch { /* ignore */ }
        if (running) nextNoteTime = ctx.currentTime + 0.06; // no backlog
      }
    },
    setRegion(id) { if (REGION_MUSIC[id]) region = id; },
    setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); },
    dispose() {
      for (const n of live) { try { n.stop(); } catch { /* ignore */ } }
      live.clear();
      if (ctx) { try { ctx.close(); } catch { /* ignore */ } }
      ctx = null; available = false;
    },
  };
}
