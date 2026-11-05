// DEEPWAKE - authored level data.
// Pure data. Collision geometry and entity placement are explicit here; the
// renderer only reads this data, it never decides contacts.
//
// Coordinates: x right, y up, gameplay plane z = 0. Position of ILO is the
// centre of the feet; body is 0.75 wide x 1.5 high. A `rect` uses the
// bottom-left corner (x,y) and size (w,h).
//
// `oneWay` rects only collide on a downward crossing (no side/ceiling contact).
// `wallJump` rects are the only surfaces that allow a wall slide / wall jump.

const box = (x, y, w, h, extra = {}) => ({ x, y, w, h, ...extra });

export const LEVEL = {
  id: 'deepwake-v1',
  spawn: { x: 3, y: 0 },
  fallBoundary: -8,

  regions: [
    { id: 'workshop', name: 'Buried Workshop', x1: -3, x2: 52 },
    { id: 'reservoir', name: 'Crystal Reservoir', x1: 52, x2: 118 },
    { id: 'foundry', name: 'Silent Foundry', x1: 118, x2: 180 },
    { id: 'ascent', name: 'Ascent Shaft', x1: 180, x2: 220 },
  ],

  cameraZones: [
    { x1: -3, x2: 52, minY: 1.2, maxY: 5.0, camMinX: 8, camMaxX: 44 },
    { x1: 52, x2: 118, minY: 1.2, maxY: 7.4, camMinX: 58, camMaxX: 110 },
    { x1: 118, x2: 180, minY: 1.2, maxY: 7.4, camMinX: 126, camMaxX: 172 },
    { x1: 180, x2: 220, minY: 1.2, maxY: 10.5, camMinX: 188, camMaxX: 210 },
  ],

  // ---- Static collision geometry -----------------------------------------
  // `mat` only selects a rendering material; it never affects collision.
  solids: [
    // Buried Workshop floor A, gap 18..21, floor B.
    box(-3, -4, 21, 4, { mat: 'rock' }),
    box(21, -4, 31, 4, { mat: 'rock' }),
    box(-3, 0, 1, 8, { mat: 'rock' }),              // left boundary
    box(4.5, 0, 1.4, 0.6, { mat: 'steel' }),        // low bench
    box(6.6, 0, 1.4, 0.9, { mat: 'steel' }),        // taller bench
    box(13, 0, 0.9, 0.35, { mat: 'trim' }),         // edge trim / cache perch

    // Workshop archive alcove (upper shelf, optional).
    box(22, 0, 6, 1.5, { mat: 'steel' }),           // wide maintenance step
    box(23, 3.2, 9, 0.4, { mat: 'trim', oneWay: true }),
    box(31.5, 3.6, 0.6, 2.6, { mat: 'rock' }),      // alcove back wall
    box(23, 6.2, 9, 0.6, { mat: 'rock' }),          // alcove ceiling

    // Crystal Reservoir: entry ground, shaft, ledge, far ground.
    box(52, -4, 10, 4, { mat: 'rock' }),
    box(53.8, 2.0, 0.9, 4.4, { mat: 'rock', wallJump: true }),  // shaft left (doorway below)
    box(58.4, 0, 0.9, 6.4, { mat: 'rock', wallJump: true }),    // shaft right
    box(53.8, 6.4, 12.5, 0.4, { mat: 'trim', oneWay: true }),   // switch ledge spans the shaft
    box(80, -4, 38, 4, { mat: 'rock' }),
    box(82, 2.0, 4, 0.4, { mat: 'trim', oneWay: true }),        // drone ledge
    box(104, 2.0, 0.9, 4.4, { mat: 'rock', wallJump: true }),   // archive shaft L
    box(108.6, 0, 0.9, 6.4, { mat: 'rock', wallJump: true }),   // archive shaft R
    box(104, 6.4, 10.5, 0.4, { mat: 'trim', oneWay: true }),    // archive shelf spans the shaft

    // Silent Foundry: continuous safe ground.
    box(118, -4, 62, 4, { mat: 'steel' }),
    box(120, 2.2, 4.5, 0.5, { mat: 'steel' }),      // safe cover recess roof
    box(132, 0, 1.6, 2.2, { mat: 'steel' }),        // beam cover pillar
    box(150.2, 6.0, 6.8, 0.4, { mat: 'trim', oneWay: true }), // counterweight upper ledge
    box(160, 0, 3.5, 1.5, { mat: 'steel' }),        // service-room step
    box(160, 3.2, 8, 0.4, { mat: 'trim', oneWay: true }),
    box(162, 4.8, 14, 0.4, { mat: 'trim', oneWay: true }),
    box(175.5, 5.2, 0.6, 2.4, { mat: 'steel' }),    // service-room back wall

    // Ascent Shaft.
    box(180, -4, 11, 4, { mat: 'steel' }),
    box(185.5, 2.0, 0.9, 4.4, { mat: 'steel', wallJump: true }),
    box(190.2, 0, 0.9, 6.4, { mat: 'steel', wallJump: true }),
    box(185.5, 6.4, 13.6, 0.4, { mat: 'trim', oneWay: true }),  // ascent ledge spans the shaft
    box(207, 6.4, 8, 0.4, { mat: 'trim', oneWay: true }),
    box(211, 6.4, 3.2, 0.4, { mat: 'steel', oneWay: true }),   // lift deck
  ],

  // ---- Breakable seams (solid until broken) -------------------------------
  seams: [
    { id: 'SM_TRAIN', x: 9, y: 0, w: 1.0, h: 3.2, hiddenMark: false, transmitsPulse: false, region: 'workshop' },
    { id: 'SM_ARC1', x: 28.5, y: 3.6, w: 1.0, h: 2.6, hiddenMark: true, transmitsPulse: true, archive: 'ARC1', region: 'workshop' },
    { id: 'SM_B', x: 90, y: 0, w: 1.0, h: 3.6, hiddenMark: true, transmitsPulse: true, region: 'reservoir' },
    { id: 'SM_ARC3', x: 171, y: 5.2, w: 1.0, h: 2.4, hiddenMark: true, transmitsPulse: true, archive: 'ARC3', region: 'foundry' },
  ],

  // ---- Shutters (solid until open) ---------------------------------------
  shutters: [
    { id: 'SHUT_A', x: 47, y: 0, w: 1.2, h: 3.6, region: 'workshop' },
    { id: 'SHUT_C', x: 158, y: 0, w: 1.2, h: 3.6, region: 'foundry' },
  ],

  // ---- Deterministic moving platforms (one-way, carry a standing player) --
  platforms: [
    { id: 'PLAT_B', x: 62.6, y: 1.0, w: 3.2, h: 0.4, axis: 'x', min: 62.6, max: 76.6, period: 9, pause: 1.0, requires: 'SW_B', region: 'reservoir' },
    { id: 'PLAT_LIFT', x: 147, y: 0.6, w: 3.2, h: 0.4, axis: 'y', min: 0.6, max: 6.0, period: 7, pause: 1.0, requires: 'SOCK_LIFT', region: 'foundry' },
    { id: 'PLAT_ASC', x: 199, y: 6.4, w: 3.0, h: 0.4, axis: 'x', min: 199, max: 204, period: 6, pause: 0.8, requires: 'ALWAYS', region: 'ascent' },
  ],

  // ---- Portable power cells ----------------------------------------------
  cells: [
    { id: 'CELL_A', x: 40, y: 0, sockets: ['SOCK_A'], region: 'workshop' },
    { id: 'CELL_C', x: 144, y: 0, sockets: ['SOCK_LIFT', 'SOCK_C'], region: 'foundry' },
  ],

  // ---- Sockets ------------------------------------------------------------
  sockets: [
    { id: 'SOCK_A', x: 44, y: 0.9, region: 'workshop' },
    { id: 'SOCK_LIFT', x: 145.5, y: 0.9, region: 'foundry' },
    { id: 'SOCK_C', x: 166, y: 0.9, region: 'foundry' },
  ],

  // ---- Fixed switches -----------------------------------------------------
  switches: [
    { id: 'SW_B', x: 62, y: 6.8, region: 'reservoir' },
    { id: 'SW_C', x: 153.5, y: 6.4, region: 'foundry' },
  ],

  // ---- Relays (node must be reached by an echo pulse while powered) -------
  relays: [
    { id: 'A', x: 49.5, y: 1.6, station: 'S1', region: 'workshop' },
    { id: 'B', x: 97, y: 1.6, station: 'S2', region: 'reservoir' },
    { id: 'C', x: 170, y: 1.6, station: 'S3', region: 'foundry' },
  ],

  // ---- Reboot stations ----------------------------------------------------
  stations: [
    { id: 'S0', x: 4, y: 0, region: 'workshop' },
    { id: 'S1', x: 51, y: 0, region: 'workshop' },
    { id: 'S2', x: 101, y: 0, region: 'reservoir' },
    { id: 'S3', x: 177, y: 0, region: 'foundry' },
    { id: 'S4', x: 182, y: 0, region: 'ascent' },
  ],

  // ---- Memory Archives (exactly three) -----------------------------------
  archives: [
    {
      id: 'ARC1', x: 30.2, y: 4.2, region: 'workshop',
      title: 'Maintenance Log 14',
      text: 'The lift was never the problem. The relays were. Keep the amber cells in their sockets and the old station still breathes.',
    },
    {
      id: 'ARC2', x: 111.5, y: 6.8, region: 'reservoir',
      title: 'Reservoir Survey',
      text: 'Water rose through the cooling channels. The crystals kept a record of every pulse we ever sent down here.',
    },
    {
      id: 'ARC3', x: 173.5, y: 5.8, region: 'foundry',
      title: 'Foundry Notice',
      text: 'Counterweights hold longer than batteries. Latch the upper route before you take the cell back. No one will come to reset it.',
    },
  ],

  // ---- Salvage Caches -----------------------------------------------------
  caches: [
    { id: 'CACHE1', x: 13, y: 0.6, region: 'workshop' },
    { id: 'CACHE2', x: 93.5, y: 0.6, region: 'reservoir' },
    { id: 'CACHE3', x: 174, y: 0.6, region: 'foundry' },
  ],

  // ---- Vent jets ----------------------------------------------------------
  vents: [
    { id: 'V1', x: 138, y: 0, w: 1.2, h: 3.0, offset: 0, region: 'foundry' },
    { id: 'V2', x: 142, y: 0, w: 1.2, h: 3.0, offset: 1.7, region: 'foundry' },
    { id: 'V3', x: 209, y: 6.8, w: 1.2, h: 3.0, offset: 0.4, region: 'ascent' },
  ],

  // ---- Deep water (kill volumes) and decorative shallow pools -------------
  water: [
    { id: 'W1', x: 62, y: -8, w: 18, h: 7, kill: true, region: 'reservoir' },
    { id: 'W2', x: 18, y: -8, w: 3, h: 7, kill: true, region: 'workshop' }, // gap pit
    { id: 'D1', x: 83, y: -1.0, w: 8, h: 0.9, kill: false, decor: true, region: 'reservoir' },
    { id: 'D2', x: 100, y: -1.0, w: 6, h: 0.9, kill: false, decor: true, region: 'reservoir' },
    { id: 'D3', x: 134, y: -0.8, w: 5, h: 0.8, kill: false, decor: true, region: 'foundry' },
  ],

  // ---- Enemies ------------------------------------------------------------
  enemies: [
    { id: 'SK1', type: 'skitter', x: 34, y: 0, minX: 31, maxX: 39, region: 'workshop' },
    { id: 'PD1', type: 'drone', x: 85, y: 3.2, minX: 83, maxX: 90, region: 'reservoir' },
    { id: 'SS1', type: 'sentinel', x: 124.5, y: 1.2, dir: 1, laneY: 1.0, laneLength: 12, region: 'foundry' },
    { id: 'SK2', type: 'skitter', x: 212, y: 6.8, minX: 210.5, maxX: 214.5, region: 'ascent' },
  ],

  // ---- Conduits (light up as relays activate) ----------------------------
  conduits: [
    { id: 'COND_A', relay: 'A', x: 49.5, y: 0.12, w: 2.5, h: 0.16 },
    { id: 'COND_B', relay: 'B', x: 97, y: 0.12, w: 2.5, h: 0.16 },
    { id: 'COND_C', relay: 'C', x: 170, y: 0.12, w: 2.5, h: 0.16 },
    { id: 'COND_TRUNK', relay: 'ALL', x: 49.5, y: 0.05, w: 161, h: 0.1 },
  ],

  // ---- Final lift ---------------------------------------------------------
  lift: {
    boarding: { x: 210.6, y: 6.8, w: 3.6, h: 1.7 },
    console: { x: 212.5, y: 6.8 },
    deckY: 6.8,
    topY: 12.0,
    surfaceOpeningY: 11.5,
  },

  // ---- In-world tutorial hints -------------------------------------------
  hints: [
    { x1: 0, x2: 7.5, text: 'A / D or Arrow keys to move.  SPACE / Z to jump — hold for a higher jump.' },
    { x1: 7.5, x2: 12, text: 'SHIFT / X — DASH.  Cracked amber seams shatter on impact.' },
    { x1: 12, x2: 22, text: 'A held jump clears the gap.  Wall slides and wall jumps come later.' },
    { x1: 24, x2: 31, text: 'Q — ECHO PULSE reveals hidden fractures and stuns machines.' },
    { x1: 32, x2: 41, text: 'E — PICK UP CELL.  Carrying slows you and disables dash, pulse and wall moves.' },
    { x1: 41, x2: 47, text: 'E — INSERT CELL into the socket to open the shutter.' },
    { x1: 47, x2: 52, text: 'Q — ECHO PULSE at the exposed relay node to activate Relay A.' },
    { x1: 53, x2: 62, text: 'Wall-jump up the shaft to reach the bridge switch.' },
    { x1: 62, x2: 82, text: 'E at the switch starts the slow crossing platform.  Mind the deep water.' },
    { x1: 88, x2: 99, text: 'Q reveals the cracked seam.  Dash through, then pulse Relay B.' },
    { x1: 120, x2: 134, text: 'Cover recess ahead.  Watch the Sentinel warning, cross during venting.' },
    { x1: 136, x2: 147, text: 'Vents telegraph before firing.  Cross during the dormant stage.' },
    { x1: 147, x2: 159, text: 'Insert the cell, ride the counterweight, latch the upper route.' },
    { x1: 159, x2: 176, text: 'Carry the cell to the relay socket, then pulse Relay C.' },
    { x1: 183, x2: 200, text: 'Final ascent: walls, a service platform and a timed vent.' },
    { x1: 205, x2: 216, text: 'E — ACTIVATE LIFT once all three relays are online.' },
  ],

  // ---- Decorative background layers (never collide) ----------------------
  decor: [
    { kind: 'pillars', region: 'workshop', x1: 0, x2: 52, z: -6 },
    { kind: 'cables', region: 'workshop', x1: 0, x2: 52, z: -3 },
    { kind: 'crystals', region: 'reservoir', x1: 52, x2: 118, z: -6 },
    { kind: 'waterfall', region: 'reservoir', x: 77, z: -8 },
    { kind: 'presses', region: 'foundry', x1: 118, x2: 180, z: -6 },
    { kind: 'pipes', region: 'foundry', x1: 118, x2: 180, z: -3 },
    { kind: 'shaftWalls', region: 'ascent', x1: 180, x2: 216, z: -5 },
  ],
};

// Convenience: stable lookups by id.
export const byId = (arr, id) => arr.find((o) => o.id === id);
