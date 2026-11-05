# DEEPWAKE

A complete, playable browser voxel platformer. ILO, a small maintenance robot, wakes beneath a collapsed underground research station, restores three resonance relays, reconnects the ascent lift and reaches the surface.

Built with vanilla JavaScript and a **locally vendored, version-pinned Three.js** (`vendor/three.module.min.js`, r160). No build step, no account, no backend, no CDN. All models, pixel textures, effects and audio are generated procedurally at runtime.

## Launch

Serve the folder over a simple local HTTP server (ES modules need HTTP, not `file://`):

```bash
cd /Users/konstantin/Documents/Dev/HY3/game
python3 -m http.server 8000
# or: npm run serve
```

Then open **http://localhost:8000/** in a modern browser (WebGL2/WebGL). `index.html` is the single playable entry point.

WebGL, Web Audio and local storage failures are handled gracefully: audio or storage failure never prevents play, and if WebGL is unavailable the simulation, HUD and controls still run with a blank 3D view.

## Controls

| Input | Action |
| --- | --- |
| `A` / `D` or `←` / `→` | Move |
| `Space` or `Z` | Jump; hold for a higher jump; jump away from a contacted wall |
| `Shift` or `X` | Horizontal dash (shatters cracked seams, disables stunned machines) |
| `Q` | Echo pulse (reveals hidden markings, powers relay nodes, stuns machines) |
| `E` | Interact: pick up / place / insert a power cell, switches, archives, caches, lift console |
| `P` or `Escape` | Pause / resume |
| `R` | Retry from the last checkpoint |
| `Enter` | Confirm the main overlay action |

On-screen touch controls (left, right, jump, dash, pulse, interact) appear automatically on touch devices, narrow viewports and short landscape viewports. Add `?touch=1` to the URL to force them. Accessible **Pause** and **Sound** buttons sit in the HUD; the pause menu also offers **Reduced Motion**.

The pause menu distinguishes **Retry from Checkpoint**, **Restart Expedition** and **Resume** clearly.

## Abilities and shared energy

- Resonance is a single 0–100 pool. An echo pulse costs 35; regeneration (20/s) starts 1.5 s after the last pulse or shield activation.
- When a hit would land and ILO has at least 50 resonance, an emergency shield spends 50 and grants brief immunity. With less energy, one of three integrity units is lost instead.
- Falling out of the world, deep water and a confirmed machinery crush bypass the shield and trigger checkpoint recovery.
- Carrying a power cell slows ILO to 4.5 u/s and disables dash, pulse, wall slide and wall jump until it is placed or inserted.
- All three abilities are available from the start; the opening chambers teach them in safe settings.

## Checkpoints and recovery

Reboot stations sit at the start, after each relay, and before the final ascent. Touching a station repairs integrity, refills resonance and commits an **atomic snapshot** of the whole world (relays, sockets, cell ownership, shutters, seams, archives, caches, machines, platform phases, vent phases, discoveries).

Activating a relay also commits a checkpoint at its nearby station. Recovery restores ILO at the committed station with full integrity and energy, rolls back everything changed after the snapshot, clears projectiles and transient effects, and adds exactly one recovery. Elapsed expedition time is never rewound.

Records (`Best Completion Time`, `Best Full-Archive Time`, `Fewest Recoveries`) are versioned and validated in local storage; if storage is unavailable or corrupt, records stay in memory for the session. Only completed expeditions qualify.

## Project layout

```
index.html                  playable entry point, HUD, overlays, styles, import map
vendor/three.module.min.js  pinned Three.js r160 (local, no CDN)
src/constants.js            tuning values and palette
src/level.js                explicit collision geometry and entity data
src/sim.js                  authoritative simulation (pure, no rendering)
src/world.js                Three.js scene construction and sync
src/voxels.js               procedural voxel models and 16x16 pixel textures
src/audio.js                synthesized Web Audio music and effects
src/ui.js                   HUD, overlays, prompts, touch controls
src/records.js              versioned validated personal records
src/main.js                 fixed-step loop, states, input, inspection API
tests/checks.mjs            deterministic checks against the real simulation
README.md                   this file
FEATURE_AUDIT.md            feature-gap audit and verification evidence
```

The simulation runs at a fixed `1/120 s` step with a capped accumulator and a separate render loop. Rendering, audio, UI and records only read from simulation state; they never decide collisions. `window.__DEEPWAKE__` exposes a small deterministic inspection API for automated checks; it is not part of the player interface.

## Validation

```bash
npm test                 # 118 deterministic checks (Node, real sim)
node tests/checks.mjs    # same checks without npm
npm run serve            # local HTTP server for browser checks
```

The deterministic checks exercise movement, walls, dash, pulse, damage, enemies, cells, all three authored puzzles, checkpoints, platforms, lift gating, records and scripted physics-bot traversals of the required route and all three archive routes.

Browser checks were performed with Playwright/Chromium against the real served page (real keyboard and pointer input, title/pause/recovery/complete overlays, ending sequence, records, archive toast and pause archive panel, desktop plus narrow portrait and short landscape viewports, touch controls, console errors). See `FEATURE_AUDIT.md` for the exact evidence and limitations.
