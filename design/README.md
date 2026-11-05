# VIBRATO — Vibe Engineering Division

A website for a fictional "vibe code" studio. Not a page. **A single instrument.**

The whole site is one fixed 1440×900 schematic sheet floating on a dark workbench — like an assembly drawing pinned under a desk lamp. There is no scroll, no hero, no feature grid, no pricing table, no footer. Instead: five *bands* on a rotary selector, a vector display, an oscilloscope, three modulation knobs, a level meter, a patch bay with real hanging cables, and a teleprinter.

## Run it

```bash
npm start          # → http://localhost:8080
```

Or just open `index.html` directly — everything is local and works over `file://`.
Zero dependencies, zero build step, no network calls. The five font subsets live in `fonts/` **and** are embedded as data URIs in `styles.css`, so the sheet renders correctly whether you serve it or double-click it.

## What to try

| Interaction | What it does |
|---|---|
| **Drag the big rotary dial** (or click a band in the index, or press `1`–`5` / `←` `→`) | Retunes the whole instrument: the 3D object morphs into a different surface, the headline decodes itself glyph-by-glyph, body copy prints like a teleprinter, the scope re-triggers, the dial snaps into its detent with a spring. |
| **Drag the three knobs vertically** (or scroll / arrow keys on them) | `FREQ`, `GAIN`, `DRIFT` really change the rendered math: rotation speed, object scale + glow, waveform frequency, elastic vertex deformation, level meter. |
| **Type a message on band 05 and hit TRANSMIT** | A paper receipt prints out of a slot, the scope fires a burst, the vector display jolts. |
| **`SND OFF` toggle (top right)** | Turns on a tiny WebAudio instrument — clicks, detent bleeps, sweeps. Off by default. |
| **Move the mouse** | A crosshair reticle follows it and labels each control. |

## Why it looks the way it does

- **Structure** — the "sections" are *frequency bands* on a hardware channel selector. Content is delivered as calibration notes, log tapes, process schematics, station logs and a transmit form, not as stacked marketing blocks.
- **Layout** — an asymmetric schematic plate. Module positions, 90°-elbow circuit traces, ruler ticks, registration crosses and fiducials are all placed in an exact coordinate space. The sheet scales as one object to fit the viewport; a stacked flow layout takes over on small screens.
- **Motion** — no fade/slide/scroll reveals anywhere. Instead: spring physics on the dial, character-by-character decoding and teleprinting, a phosphor scope with beam persistence, travelling signal pulses along traces, cables with live slack, a blinking cursor, a rotating printed seal, and a thermal-printer clip animation.
- **3D** — `engine.js` is a hand-written software renderer. Five parametric surfaces share one `(u,v)` grid, so the object can **morph vertex-for-vertex** between shapes. It does its own rotation matrices, perspective projection, depth bucketing, back-to-front painter ordering and amber phosphor glow on a 2D canvas. No Three.js, no WebGL, no libraries.
- **Palette / type** — warm risograph cream, ink, safety vermilion and amber CRT phosphor. Anton (condensed display), Space Mono (instrument labels), Instrument Serif italic (the human voice). All bundled locally.

## Files

```
index.html     the sheet: modules, overlays, receipt
styles.css     art direction, paper texture, layout, all overlays
engine.js      custom 3D vector renderer + phosphor oscilloscope
app.js         content, schematic generation, interactions, main loop
fonts/         five bundled woff2 subsets
server.js      tiny zero-dependency static server
```

## Notes

- The transmit form is a front-end simulation — there is no backend. The email link is a real `mailto:`.
- `prefers-reduced-motion` is respected: continuous rotation, the seal, the ticker and the scrambles are stilled/slowed.
- Keyboard accessible: bands via `1`–`5` / arrows, knobs and dial via arrow keys, all controls are focusable.
