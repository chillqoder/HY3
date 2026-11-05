// DEEPWAKE - HUD, overlays, contextual prompts and touch controls.
// All player-facing text is English.

import { LEVEL } from './level.js';
import { currentInteractTarget, allRelaysActive } from './sim.js';
import { CSS } from './constants.js';

const $ = (id) => document.getElementById(id);
const fmtTime = (s) => {
  if (s === null || s === undefined) return '—';
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
};

export function createUI({ onAction }) {
  const hud = {
    integrity: $('integrity'), energyFill: $('energyFill'), energyText: $('energyText'),
    relays: $('relays'), archivesCount: $('archivesCount'),
    regionTag: $('regionTag'), hint: $('hint'), prompt: $('prompt'), notice: $('notice'),
    muteBtn: $('muteBtn'), pauseBtn: $('pauseBtn'),
    overlay: $('overlay'), ovTitle: $('ovTitle'), ovSub: $('ovSub'),
    ovBody: $('ovBody'), ovActions: $('ovActions'),
    archiveToast: $('archiveToast'), archiveTitle: $('archiveTitle'),
    archiveText: $('archiveText'), archiveClose: $('archiveClose'),
    touch: $('touch'),
  };

  let overlayKind = null;
  let records = null;
  let lastRegion = null;
  let regionUntil = 0;
  let noticeUntil = 0;
  let archiveUntil = 0;
  let meterFlashUntil = 0;
  let muted = false;
  let reducedMotion = false;
  let overlayData = null;

  // ---- Touch input -------------------------------------------------------
  const touchHeld = { left: false, right: false, jump: false, dash: false, pulse: false, interact: false };
  const touchPressed = {};
  const tbuttons = Array.from(document.querySelectorAll('.tbtn'));
  const pressedClass = (btn, on) => btn.classList.toggle('pressed', on);

  function clearTouch() {
    for (const k of Object.keys(touchHeld)) touchHeld[k] = false;
    for (const k of Object.keys(touchPressed)) delete touchPressed[k];
    for (const b of tbuttons) pressedClass(b, false);
  }

  for (const btn of tbuttons) {
    const act = btn.dataset.act;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      if (!touchHeld[act]) touchPressed[act] = true;
      touchHeld[act] = true;
      pressedClass(btn, true);
      onAction('gesture');
    });
    const release = (e) => {
      if (e) e.preventDefault();
      touchHeld[act] = false;
      pressedClass(btn, false);
    };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', () => { release(); clearTouch(); });
    btn.addEventListener('lostpointercapture', () => { release(); clearTouch(); });
  }

  const forceTouch = new URLSearchParams(location.search).has('touch');
  let touchEnabled = false;
  function updateTouchVisibility() {
    touchEnabled = forceTouch || (navigator.maxTouchPoints || 0) > 0 ||
      window.innerWidth < 820 || window.innerHeight < 480;
    hud.touch.classList.toggle('enabled', touchEnabled);
  }
  updateTouchVisibility();
  window.addEventListener('resize', updateTouchVisibility);

  function consumeTouch() {
    const held = { ...touchHeld };
    const pressed = { ...touchPressed };
    for (const k of Object.keys(touchPressed)) delete touchPressed[k];
    return { held, pressed };
  }

  // ---- Overlay construction ---------------------------------------------
  function btn(label, action, primary = false, extraClass = '') {
    const b = document.createElement('button');
    b.textContent = label;
    if (primary) b.classList.add('primary');
    if (extraClass) b.classList.add(extraClass);
    b.addEventListener('click', (e) => { e.stopPropagation(); onAction(action); });
    return b;
  }

  function rows(pairs) {
    const d = document.createElement('div');
    d.className = 'rows';
    for (const [k, v, accent] of pairs) {
      const a = document.createElement('div'); a.className = 'k'; a.textContent = k;
      const b = document.createElement('div'); b.className = 'v' + (accent ? ' accent' : ''); b.textContent = v;
      d.append(a, b);
    }
    return d;
  }

  function sectionTitle(text) {
    const d = document.createElement('div');
    d.className = 'section-title'; d.textContent = text;
    return d;
  }

  function archivePanel(world) {
    const wrap = document.createElement('div');
    wrap.append(sectionTitle('Memory Archives'));
    const list = document.createElement('div');
    list.className = 'archive-list';
    for (const a of LEVEL.archives) {
      const got = world ? world.archives[a.id].collected : false;
      const item = document.createElement('div');
      item.className = 'archive-item' + (got ? '' : ' locked');
      const b = document.createElement('b'); b.textContent = got ? a.title : 'Unrecovered fragment';
      const p = document.createElement('div');
      p.textContent = got ? a.text : 'A sealed maintenance record somewhere in the station.';
      item.append(b, p);
      list.append(item);
    }
    wrap.append(list);
    return wrap;
  }

  function recordsBlock() {
    const wrap = document.createElement('div');
    wrap.append(sectionTitle('Personal Records'));
    const r = records ? records.data : null;
    wrap.append(rows([
      ['Best completion time', r ? fmtTime(r.bestTime) : '—'],
      ['Best full-archive time', r ? fmtTime(r.bestFullArchiveTime) : '—'],
      ['Fewest recoveries', r && r.fewestRecoveries !== null ? String(r.fewestRecoveries) : '—'],
    ]));
    return wrap;
  }

  function optionsBlock() {
    const wrap = document.createElement('div');
    const mute = document.createElement('div'); mute.className = 'option';
    mute.append(btn(muted ? 'Sound: Off' : 'Sound: On', 'mute', false, 'small'));
    const rm = document.createElement('div'); rm.className = 'option';
    rm.append(btn(reducedMotion ? 'Reduced Motion: On' : 'Reduced Motion: Off', 'reducedMotion', false, 'small'));
    wrap.append(mute, rm);
    return wrap;
  }

  function showOverlay(kind, data = {}) {
    overlayKind = kind;
    overlayData = data;
    hud.overlay.classList.add('show');
    hud.ovBody.replaceChildren();
    hud.ovActions.replaceChildren();
    const world = data.world;

    if (kind === 'title') {
      hud.ovTitle.innerHTML = 'DEEP<span class="accent">WAKE</span>';
      hud.ovSub.textContent = 'Restore three relays beneath the buried station, reconnect the ascent lift, and reach the surface.';
      const ctrl = document.createElement('div');
      ctrl.className = 'hint-line';
      ctrl.innerHTML = '<kbd>A</kbd>/<kbd>D</kbd> move · <kbd>Space</kbd> jump (hold) · <kbd>Shift</kbd> dash · <kbd>Q</kbd> echo pulse · <kbd>E</kbd> interact · <kbd>P</kbd> pause · <kbd>R</kbd> retry';
      hud.ovBody.append(ctrl, recordsBlock(), optionsBlock());
      hud.ovActions.append(btn('Begin Expedition', 'start', true));
    } else if (kind === 'paused') {
      hud.ovTitle.textContent = 'Expedition Paused';
      hud.ovSub.textContent = 'The station is holding still. Resume when you are ready.';
      if (world) {
        hud.ovBody.append(rows([
          ['Expedition time', fmtTime(world.time)],
          ['Recoveries', String(world.recoveries)],
          ['Archives', `${world.discoveries.archives} / 3`],
          ['Salvage caches', `${world.discoveries.caches} / 3`],
          ['Machines disabled', String(world.discoveries.machinesDisabled)],
          ['Relays A / B / C', `${world.relays.A.active ? 'ON' : 'off'} / ${world.relays.B.active ? 'ON' : 'off'} / ${world.relays.C.active ? 'ON' : 'off'}`],
        ]));
        hud.ovBody.append(archivePanel(world));
      }
      hud.ovBody.append(optionsBlock());
      hud.ovActions.append(
        btn('Resume', 'resume', true),
        btn('Retry from Checkpoint', 'retry'),
        btn('Restart Expedition', 'restart'),
      );
    } else if (kind === 'recovery') {
      hud.ovTitle.textContent = 'Rebooting at Station';
      hud.ovSub.textContent = 'Restoring the last committed state. Control returns automatically.';
    } else if (kind === 'complete') {
      const full = data.fullArchive;
      hud.ovTitle.textContent = 'Signal Restored';
      hud.ovSub.textContent = full
        ? 'ILO reached the surface with every memory archive recovered.'
        : 'ILO reached the surface. Some memories remain below.';
      const tag = document.createElement('span');
      tag.className = 'tag' + (full ? ' full' : '');
      tag.textContent = full ? 'Full archive expedition' : 'Standard expedition';
      hud.ovBody.append(tag);
      hud.ovBody.append(rows([
        ['Expedition time', fmtTime(data.time)],
        ['Recoveries', String(data.recoveries)],
        ['Archives recovered', `${data.archives} / 3`, full],
        ['Salvage caches', `${data.caches} / 3`],
        ['Machines disabled', String(data.machinesDisabled)],
        ['Relay A / B / C', 'ON / ON / ON'],
      ]));
      const rec = document.createElement('div');
      rec.append(sectionTitle('Personal Records'));
      const r = records ? records.data : null;
      const improved = data.improved || [];
      const mark = (key) => improved.includes(key) ? '  · NEW' : '';
      rec.append(rows([
        ['Best completion time', (r ? fmtTime(r.bestTime) : '—') + mark('bestTime')],
        ['Best full-archive time', (r ? fmtTime(r.bestFullArchiveTime) : '—') + mark('bestFullArchiveTime')],
        ['Fewest recoveries', (r && r.fewestRecoveries !== null ? String(r.fewestRecoveries) : '—') + mark('fewestRecoveries')],
      ]));
      hud.ovBody.append(rec);
      hud.ovActions.append(btn('New Expedition', 'newExpedition', true));
    }
  }

  function hideOverlay() { overlayKind = null; overlayData = null; hud.overlay.classList.remove('show'); }
  function refresh() { if (overlayKind) showOverlay(overlayKind, overlayData || {}); }
  const isOverlayOpen = () => overlayKind !== null;

  // ---- Small transient UI ------------------------------------------------
  function notice(text, kind = '') {
    hud.notice.textContent = text;
    hud.notice.className = 'show' + (kind ? ' ' + kind : '');
    noticeUntil = performance.now() + 2200;
  }
  function showArchive(title, text) {
    hud.archiveTitle.textContent = title;
    hud.archiveText.textContent = text;
    hud.archiveToast.classList.add('show');
    archiveUntil = performance.now() + 6500;
  }
  function hideArchive() { hud.archiveToast.classList.remove('show'); archiveUntil = 0; }
  function flashMeter() { meterFlashUntil = performance.now() + 260; }

  // ---- Per-frame sync ----------------------------------------------------
  function sync(world, view) {
    const p = world.player;
    // Integrity segments
    const segs = hud.integrity.children;
    for (let i = 0; i < segs.length; i++) segs[i].classList.toggle('on', i < p.integrity);
    // Resonance meter
    const ratio = Math.max(0, Math.min(1, p.energy / 100));
    hud.energyFill.style.transform = `scaleX(${ratio})`;
    hud.energyFill.classList.toggle('low', p.energy < 35 || performance.now() < meterFlashUntil);
    hud.energyText.textContent = String(Math.round(p.energy));
    // Relays
    for (const el of hud.relays.children) {
      const st = world.relays[el.dataset.relay];
      el.classList.toggle('active', st.active);
      el.classList.toggle('powered', !st.active && st.powered);
    }
    hud.archivesCount.textContent = `${world.discoveries.archives} / 3`;

    // Region tag
    const reg = LEVEL.regions.find((r) => p.x >= r.x1 && p.x < r.x2) || LEVEL.regions[0];
    if (reg.id !== lastRegion) {
      lastRegion = reg.id;
      hud.regionTag.textContent = reg.name;
      regionUntil = performance.now() + 2600;
    }
    hud.regionTag.classList.toggle('show', performance.now() < regionUntil);
    // Tutorial hint
    const hint = LEVEL.hints.find((h) => p.x >= h.x1 && p.x < h.x2);
    if (hint && view.state === 'play') {
      hud.hint.textContent = hint.text;
      hud.hint.classList.add('show');
    } else hud.hint.classList.remove('show');

    // Contextual prompt (bottom-centre; never covers a landing zone)
    const target = view.state === 'play' ? currentInteractTarget(world) : null;
    if (target && !p.dead) {
      hud.prompt.textContent = target.label;
      hud.prompt.classList.add('show');
    } else hud.prompt.classList.remove('show');

    // Transient notice / archive toast
    if (noticeUntil && performance.now() > noticeUntil) { hud.notice.classList.remove('show'); noticeUntil = 0; }
    if (archiveUntil && performance.now() > archiveUntil) hideArchive();
    for (const a of LEVEL.archives) {
      if (world.archives[a.id].collected && world.archives[a.id].showUntil > world.time && !hud.archiveToast.classList.contains('show')) {
        showArchive(a.title, a.text);
      }
    }
  }

  // ---- Direct widget handlers -------------------------------------------
  hud.muteBtn.addEventListener('click', () => onAction('mute'));
  hud.pauseBtn.addEventListener('click', () => onAction('pause'));
  hud.archiveClose.addEventListener('click', () => { hideArchive(); onAction('dismissArchive'); });

  function setMuted(v) {
    muted = !!v;
    hud.muteBtn.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
  }
  function setReducedMotion(v) {
    reducedMotion = !!v;
  }
  function setRecords(r) { records = r; }
  function primaryAction() {
    if (overlayKind === 'title') return 'start';
    if (overlayKind === 'paused') return 'resume';
    if (overlayKind === 'complete') return 'newExpedition';
    return null;
  }

  return {
    showOverlay, hideOverlay, refresh, isOverlayOpen, primaryAction, sync, notice,
    showArchive, hideArchive, flashMeter, consumeTouch, clearTouch, setMuted, setReducedMotion,
    setRecords, get overlayKind() { return overlayKind; },
    get touchEnabled() { return touchEnabled; },
  };
}
