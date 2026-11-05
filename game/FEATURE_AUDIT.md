# DEEPWAKE — Feature-Gap Audit and Improvement Pass

**Scope:** the complete first expedition as specified in `game.md`.
**Method:** the baseline was built, then the actual code and the running browser game were inspected again, concrete defects were fixed, and both the fixes and their interactions were re-verified. This document records real results, not a proposed plan.

**Verification performed (see also §4):**

- 118 deterministic checks against the real simulation (`npm test`), including scripted physics-bot traversals of the authored route and all three archive routes.
- Playwright/Chromium interaction with the real served page: title → play, real keyboard and pointer input, pause/retry/restart, recovery and completion overlays, staged ending, records, archive toast and archive panel, touch controls, desktop / narrow portrait / short landscape viewports, and a zero-error console.
- Screenshots of the title, workshop, reservoir, foundry, ascent, lift, surface ending, completion overlay, portrait and short-landscape layouts.

All player-facing text, menus, controls, prompts, notifications, results and documentation are in English.

---

## 1. Inspection findings and implemented fixes

Observed defects are listed first (A), then the focused readability/atmosphere improvements (B). Priorities follow the specification: **P0** completion blockers / unsafe collisions / duplication / lost input / checkpoint inconsistency / softlocks; **P1** missing required abilities, puzzles, feedback, UI, audio or ending behaviour; **P2** atmosphere, readability, animation, replay information; **Future** larger out-of-scope systems.

### A. Observed defects

| Feature or defect | Current state and evidence | Player benefit | Priority | Decision | Acceptance check | Final status |
| --- | --- | --- | --- | --- | --- | --- |
| Broken seam still collided for the rest of its step | **Broken.** Dashing through `SM_ARC1` broke the seam but `resolveY` still treated it as a solid and teleported ILO onto the alcove ceiling (`y 3.6 → 6.8`). Reproduced with a scripted physics bot. | Prevents an unsafe, misleading collision at a required archive seam | P0 | Implement | `resolveX`/`resolveY` skip seams broken earlier in the step; a zero-vertical-motion substep no longer creates false ceiling/ground contacts | **Fixed** — `src/sim.js` `resolveX`, `resolveY`; bot now lands on the shelf at `y=3.60` and collects ARC1 |
| Foundry upper ledge for `SW_C` absent | **Broken.** `SW_C` at `(153.5, 6.4)` floated with no supporting platform; the counterweight puzzle could not be completed → required route blocked. Found by inspecting `LEVEL.solids` after a scripted lift ride. | Removes a mandatory-route softlock | P0 | Implement | Level data contains the ledge at `x150.2..157, top 6.4`, adjacent to the lift's top position | **Fixed** — `src/level.js`; bot now rides the lift to `y=6.40`, walks to the switch and latches the shutter |
| Wall-jump shaft ledges sat outside the shafts | **Broken.** All three top ledges started beyond the right wall, so a wall-jump ascent had nowhere to land. Scripted climb bots reached `maxY≈2.6` and fell back. | Makes the three required/optional vertical climbs completable | P0 | Implement | Each shaft's one-way top ledge spans the shaft; a 3-jump bot (1 ordinary + 2 wall jumps) lands at `y=6.8` | **Fixed** — `src/level.js`; all three climbs verified at `y=6.80` |
| Procedural textures overflowed `Uint8Array` | **Broken.** Channel values above 255 wrapped, producing red/green speckle noise across rock and trim. Visible in the rendered workshop. | Removes dense visual noise; keeps texel scale consistent | P1 | Implement | `pixelTexture` clamps every channel to 0–255 | **Fixed** — `src/voxels.js`; screenshots now show clean pixel textures |
| Touch controls decided only at page load | **Partial.** Resizing a desktop window to a narrow/short viewport left touch controls hidden. | Touch controls remain available after rotation or resize | P1 | Implement | `updateTouchVisibility()` re-evaluates on `resize` | **Fixed** — `src/ui.js`; verified `touchEnabled: true` at 390×844 and 800×360 |
| Narrow-viewport banner overlapped the HUD | **Partial.** Region tag, hint banner and notice overlapped HUD buttons at 390×844. | Keeps tutorial text and prompts readable on small screens | P1 | Implement | Stacked hint (`174px`), notice (`232px`), hidden region tag; short-landscape overrides | **Fixed** — `index.html`; portrait screenshot shows no overlap |
| Short-landscape hint/prompt sat too low | **Partial.** An over-broad combined media query pushed the hint to 48% of a 360px-tall viewport. | Keeps the compact landscape framing usable | P2 | Implement | Combined rule narrowed to `max-width:460px`; short-landscape uses `hint 62px`, `notice 96px`, `prompt 24%` | **Fixed** — `index.html`; verified computed CSS values |
| Completion sound was silent | **Broken.** `audio.play('complete')` was called after `setRunning(false)`, and `play()` early-returns while stopped. | Restores the restrained musical resolution | P1 | Implement | Play the cue before stopping the music bus | **Fixed** — `src/main.js` `commitCompletion` |
| Reduced-motion / mute refresh lost result data | **Partial.** Options buttons re-rendered the completion overlay with only `{world}`, blanking time/record fields. | Options do not corrupt the results screen | P1 | Implement | `ui.refresh()` re-renders with the stored overlay data | **Fixed** — `src/ui.js` `refresh`, `src/main.js` |
| `pressed` Set mutated during iteration | **Partial.** A `pause` action called `clearInput()` while iterating the same `Set`, risking skipped discrete actions. | Reliable discrete input handling | P1 | Implement | Iterate a snapshot `[...pressed]` | **Fixed** — `src/main.js` `frame` |
| Held confirmation leaking after overlays | **Partial.** State transitions could let a held `Enter` re-trigger. | Prevents accidental activation after an overlay closes | P1 | Implement | `clearInput()` on every start/pause/resume/retry/restart/relay/reboot/shutdown transition; `!e.repeat` for presses | **Fixed & verified** — `src/main.js` |
| Favicon 404 | **Partial.** One console error appeared on every load. | Clean console for QA | P2 | Implement | Inline SVG data-URI favicon | **Fixed** — `index.html`; browser console now reports 0 errors |

### B. Focused, justified P2 improvements

| Feature or defect | Current state and evidence | Player benefit | Priority | Decision | Acceptance check | Final status |
| --- | --- | --- | --- | --- | --- | --- |
| Underground readability | **Partial.** Initial lighting was very dark; solid ground and props were hard to distinguish. | Edges, ILO and interactive objects stay legible | P2 | Implement | Raised ambient/hemisphere/key light, pushed fog start to 31, brightened texture baselines | **Fixed** — `src/world.js`, `src/voxels.js`; workshop/reservoir/foundry/ascent screenshots inspected |
| Tutorial seam read as a solid amber pillar | **Partial.** A full-face emissive overlay made `SM_TRAIN` a blazing column. | Teaches the "cracked amber seam" material language | P2 | Implement | Darker crystal base plus five discrete fracture bars; hidden marks only glow after a pulse | **Fixed** — `src/voxels.js` `buildProp('seam')`, `src/world.js` seam sync |
| Background crystals could imply collision surfaces | **Partial.** Large bright teal slabs sat behind the reservoir lane. | Background never disguises a playable gap | P2 | Implement | Thinner, darker background crystals; decor remains at negative z | **Fixed** — `src/world.js` decor generation |
| Final ascent destination not visible | **Partial.** The pale surface opening was at `y≈19–20`, above the play camera frustum. | A visible vertical goal before the final lift | P2 | Implement | Lowered `surfaceOpeningY` to 11.5 / `topY` to 12.0; pale opening now frames the lift in screenshots | **Fixed** — `src/level.js`, `src/world.js` |
| Warm daylight washed out the surface scene | **Partial.** Daylight plane opacity 0.9 flattened the terrace. | Restrained environmental payoff | P2 | Implement | Reduced to 0.6 | **Fixed** — `src/world.js` |

---

## 2. Feature inventory and final state

Classification: **Working**, **Partial**, **Missing**, **Broken**.

| Area | State | Evidence / notes |
| --- | --- | --- |
| Entry point, offline runtime, pinned vendored Three.js | **Working** | `index.html` + import map → `vendor/three.module.min.js` (r160); zero console errors; no network dependency |
| Fixed 1/120 s step, capped accumulator, separate render loop | **Working** | `src/main.js`, `T.FIXED_DT`, `MAX_ACCUM`; sim is pure and renderer-independent |
| Explicit level data; rendering never decides collisions | **Working** | `src/level.js`; `src/world.js` only reads it; deterministic checks assert geometry |
| ILO voxel model, lens, chest module, articulated limbs, cape, antenna | **Working** | `src/voxels.js buildILO`; visible in screenshots; animation states in `poseILO` |
| Animation set (idle, walk, run, ascent, falling, wall slide/jump, dash, pulse, carry, hurt, shield, shutdown, reboot, lift, landing, socket/relay) | **Working** | `poseILO` table; poses are cosmetic and never move the collision body |
| Running, variable-height jump, coyote, buffer, ceiling resolution | **Working** | 6 movement checks, including measured held apex ≈2.6 and tap apex ≈1.3–1.5 |
| Wall slide, wall jump, steering lock, shaft reachability, no grounded slide | **Working** | 7 wall checks + 3 shaft-climb bots |
| Dash (duration, cooldown, landing/wall-jump refresh, locked direction, swept collision, seam shatter, stunned-machine disable) | **Working** | 8 dash checks; conservative substeps; seams only break on dash contact |
| Echo pulse (35 cost, 0.7 s cooldown, 1.5 s regen delay, 20/s, 6-unit radius, LOS, one response per target, blocked activation, transmitted crystal seams) | **Working** | 9 pulse checks; deterministic segment/AABB `losClear`; real blocked-relay and opened-relay tests |
| Emergency shield, one outcome per hit, immunity, knockback, fall/crush bypass | **Working** | 6 damage checks; falls and crushes route to checkpoint recovery |
| Integrity, shutdown, checkpoint recovery, atomic snapshot, rollback | **Working** | 12 checkpoint/recovery checks; `structuredClone` snapshot of all world subsystems |
| Three regions + ascent shaft, ~210-unit authored route | **Working** | `LEVEL.regions`, `LEVEL.lift.console.x − spawn.x ≈ 209.5` |
| Three relays, conduits, HUD updates, checkpoint at each relay | **Working** | Puzzle-chain checks; relay lights/conduits in `src/world.js` |
| Power cells, sockets, interaction priority, safe placement, one-cell ownership, no duplication | **Working** | 11 cell/interaction checks; explicit priority order in `currentInteractTarget` |
| Three authored puzzles (workshop circuit, reservoir bridge, foundry counterweight) | **Working** | 13 puzzle checks + 2 scripted full-solution bots (lift ride included) |
| Moving platforms (boarding, carrying, endpoint pauses, deterministic reset) | **Working** | 5 platform checks + water-crossing and ascent-platform bots |
| Vent jets with dormant / warning / active stages (0.9 s warning) | **Working** | `ventStageAt`; visible active volume matches damage volume in `src/world.js` |
| Cable Skitter, Prism Drone, Shutter Sentinel with distinct state machines | **Working** | 7 enemy checks: telegraphs, aim lock, stun immunity, disable windows, projectile cleanup, deflection, offscreen freeze |
| Three Memory Archives with stable IDs, fragments, toast, pause archive panel | **Working** | 3 archive-route bots; browser toast + pause panel verified (3 unlocked items) |
| Salvage caches (+25 energy, one-time, no upgrade at full energy) | **Working** | `src/sim.js doInteract`; deterministic cache checks |
| Deep water / fall boundary recovery, shutters never closing through ILO | **Working** | `shutterBlocked` + `updateHazards`; deep-water check passes |
| Camera zones, smooth follow, look-ahead, reduced motion, clamped shake | **Working** | `src/world.js sync`; 3 viewport sizes inspected |
| Explicit states: title, play, paused, relayActivation, shutdown, reboot, liftSequence, complete | **Working** | `src/main.js`; browser verified all major transitions |
| Completion clock definition (excludes overlays, cinematics, celebration) | **Working** | `clock` only advances in `play` and is false during relay/shutdown/reboot/ending |
| Staged ending, relay gating, boarding bounds, one result commit | **Working** | Browser: lift → `liftSequence` → `complete`; `ending.committed` guard; records written once |
| HUD, contextual prompts, pause/mute buttons, archive panel, responsive overlays | **Working** | Desktop, 390×844 portrait, 800×360 short landscape screenshots; scrollable result panel verified |
| Records: versioned, validated, completion-only, full-archive qualification, tie-break, corrupt/unavailable storage | **Working** | 9 records checks; browser standard + full-archive completions verified |
| Web Audio: gesture gating, regional music, SFX, mute, pause, hidden-tab freeze, bounded scheduling | **Working (functional)** | `src/audio.js`; browser verified gesture unlock, mute, and hidden-tab handling. Audible waveform quality was not measured — see §5 |
| Touch controls, input release on focus loss / cancel / transitions | **Working** | Browser verified pointer move/jump, pause overlay, focus-loss input clearing |
| Graceful WebGL / audio / storage failure | **Working** | Stub renderer, try/catch audio, in-memory records fallback |
| Lifecycle: repeated recovery/restart without growing entities, listeners or arrays | **Working** | 20-recovery and restart checks; all meshes are created once and only their transforms/visibility change |
| Heavy presses (optional foundry traversal hazard) | **Missing (deferred)** | Intentionally omitted — see §4 |
| Drifting dust particles / dense parallax particles | **Missing (deferred)** | Intentionally omitted — see §4 |
| Human unassisted continuous playthrough of all 215 units | **Partial** | See §5; segmented scripted bots + real-browser interaction used instead |

---

## 3. Verification evidence and locations

### Deterministic (`npm test`, `node tests/checks.mjs`)

**Result: 118 passed, 0 failed.**

Sections: Movement contracts (6), Wall movement (7), Dash (8), Echo pulse (9), Damage/recovery (6), Enemies (7), Power cells (11), Authored puzzles (13), Checkpoints (12), Platforms/lift gating (5), Records (9), Route reachability (5), **Authored route traversal with scripted physics bots (10)**.

The traversal section drives the real `step()` with real input sequences, not a mock of the rules:

| Route | Bot evidence |
| --- | --- |
| Workshop 3-unit gap | Held jump lands at `x>21, y=0` |
| Archive A (workshop) | 2 jump-coasts → shelf `y=3.60` → dash breaks `SM_ARC1` → interact → `ARC1.collected` |
| Reservoir switch shaft | 3 jumps (1 ordinary + 2 wall jumps) land at `y=6.80`; walk to `SW_B`, interact → `on` |
| Reservoir deep water | `PLAT_B` carries ILO from `x≈63.2` to `x≈78.2` at `y=1.40`, no recovery |
| Archive B (reservoir) | Optional shaft climb lands at `y=6.80`; walk → `ARC2.collected` |
| Foundry counterweight | `CELL_C` → `SOCK_LIFT` → lift ride to `y=6.40` → walk to upper ledge → `SW_C` on → latch → `SHUT_C` open |
| Archive C (foundry) | 3 jump-coasts → shelf `y=5.20` → dash breaks `SM_ARC3` → `ARC3.collected` |
| Ascent shaft | 3 jumps land on ledge A at `y=6.80` |
| Ascent service platform | `PLAT_ASC` reaches `x≈204`, player `x≈205.5`, no recovery |

### Browser (Playwright / Chromium, real served page)

| Check | Result |
| --- | --- |
| Load / title overlay / WebGL | `state=title`, `overlay=title`, `renderer.available=true`, **0 console errors** |
| Real keyboard move | `vx=6.5`, `x 30.00 → 30.99` |
| Real keyboard jump | `y=2.33` at 260 ms, `vy=4.2` rising |
| Real keyboard pulse / dash / interact | `energy 100→65`, `dashTimer 0.118`, `carrying=CELL_A` |
| Pause / resume / retry | `paused → play`, `recoveries 1`, `state=reboot` |
| Gesture-gated audio | unavailable at title, available after `Begin Expedition`; mute toggles correctly |
| Focus loss | held input cleared (`clearInput`) |
| Standard completion | `lift.used=true` → `liftSequence` → `complete`, title "Signal Restored", `bestTime` and `completions` written, clock stopped |
| Full-archive completion | tag "Full archive expedition", `bestFullArchiveTime` written, `fullArchiveCompletions=1` |
| Archive toast / pause archive panel | toast shown with English fragment; 3 unlocked archive items |
| Touch controls | pointer right moves `x 3 → 4.13`; pointer jump raises `y` to `1.29` |
| 390×844 portrait | HUD, hint, notice, prompt and 6 touch buttons in bounds, no overlap |
| 800×360 short landscape | computed `hint 62px`, `notice 96px`, `prompt 86px`; touch controls visible; pause card `overflow-y:auto`, internally scrollable |
| Region screenshots | Workshop, Crystal Reservoir, Silent Foundry, Ascent Shaft, lift/surface, completion overlay inspected |

---

## 4. Intentionally deferred work (with reasons)

| Item | Priority | Reason |
| --- | --- | --- |
| Heavy presses as optional foundry traversal hazards | Future | The specification explicitly says "Do not add them if reliable collision handling is unfinished." Shutters already delay closure on occupancy and moving platforms are one-way, so no crush source exists; adding presses would introduce a crush risk without a gameplay benefit to this focused course. Vents, the Sentinel beam and the counterweight already provide machinery danger. |
| Dense drifting dust / heavy particle fields | Future | The art direction forbids "dense visual noise, excessive particles". Restrained conduit flashes, one pulse ring, a short dash trail, shield facets and crystal fragments are implemented with bounded pools instead. |
| Fully bespoke animation for all 20 named states (e.g. separate `takeoff`, `landing compression`, `socket`, `relay`, `lift arrival` poses) | P2 (partial) | The pose table covers idle/walk/run/ascent/falling/landing/wallslide/walljump/dash/pulse/carry/hurt/shield/shutdown/reboot/lift. `takeoff`, `socket`, `relay` and `relayActivation` reuse the ascent/pulse poses; this is a cosmetic shortcut, not a gameplay gap, and is documented here rather than claimed as complete. |
| Swimmable water / additional currency pickups | Future | Explicitly outside the design ("non-swimmable cooling water", "Avoid trails of small currency pickups"). |
| Multiplayer, bosses, equipment trees, procedural generation, crafting | Future | Explicitly forbidden by the audit scope. |

---

## 5. Material verification limitations (honest disclosure)

- **No continuous unassisted human playthrough** from `x=0` to the surface was performed. The required route was verified as a chain of scripted physics-bot traversals against the real simulation, plus real-browser keyboard interaction for each core mechanic and each puzzle solution. The bots teleport between chambers; they do not prove that a human can execute every precision input in one uninterrupted run.
- **Audio was not listened to.** Gesture gating, Web Audio availability, mute, pause/hidden-tab handling, one audio owner, gain ramps, bounded scheduling and node cleanup were verified through code and API state. Subjective music/SFX quality and actual speaker output were not measured.
- **No performance profiling.** Pixel-ratio capping, shared geometry/material caches, one-time mesh creation, pooled effects and bounded arrays are implemented, but frame time, GPU memory and long-session leak measurements were not taken.
- **Enemy behaviour and hazard timing were verified by state assertions**, not by visually watching every attack cycle in the rendered game. Telegraphs, aim locks, stun immunity, disable windows, projectile cleanup, deflection and offscreen freezing all pass deterministic checks; their rendered cues were inspected in region screenshots.
- **Crush recovery** is implemented as a guarded fallback (`crushTimer` + push-out). Because shutters delay closure on occupancy and moving platforms are one-way, no crush source can occur in normal play; a synthetic sustained crush was therefore not reproducible. Deep-water and fall-boundary recovery were verified directly.
- **Browser checks used headless Chromium** at three viewport sizes. Other browsers, real touch hardware and screen readers were not tested.
- Everything claimed as implemented above is present in the shipped files; nothing deferred is presented as completed.
