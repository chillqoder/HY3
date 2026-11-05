// DEEPWAKE - shared tuning values and palette.
// Pure data: safe to import from Node for deterministic checks.

export const FIXED_DT = 1 / 120;
export const MAX_ACCUM = 0.1;

export const T = {
  // Movement (units are ~1 voxel).
  maxSpeed: 6.5,
  carrySpeed: 4.5,
  groundAccel: 42,
  airAccel: 28,
  groundBrake: 38,
  airBrake: 8,
  gravity: -32,
  jumpReleaseGravity: 2.6, // extra multiplier while rising and jump not held
  jumpSpeed: 13,
  fallCap: 24,
  coyote: 0.11,
  jumpBuffer: 0.14,
  wallSlideCap: 3,
  wallJumpVx: 7,
  wallJumpVy: 12.5,
  steerLock: 0.1,

  // Body
  bodyW: 0.75,
  bodyH: 1.5,
  halfW: 0.375,

  // Dash
  dashSpeed: 15,
  dashTime: 0.16,
  dashCooldown: 0.45,
  dashExitSpeed: 6.5,

  // Resonance / pulse
  energyMax: 100,
  pulseCost: 35,
  pulseCooldown: 0.7,
  regenDelay: 1.5,
  regenRate: 20,
  pulseRadius: 6,
  pulseExpand: 0.35,
  highlightTime: 5,

  // Shield / damage
  shieldCost: 50,
  shieldImmunity: 0.8,
  hurtImmunity: 1.2,
  knockback: 6,
  maxIntegrity: 3,

  // Interaction
  interactRange: 1.3,
  pickupRange: 1.3,

  // Recovery
  rebootImmunity: 1.2,
  shutdownTime: 0.95,
  rebootTime: 0.55,

  // Presentation
  relayShowTime: 1.25,
  fallBoundary: -8,
};

export const C = {
  bg: 0x101923,
  rock: 0x384552,
  rockDark: 0x27323d,
  edge: 0x7f97a8,
  trim: 0xa8bcc8,
  steel: 0x6d747a,
  bronze: 0x8a6a42,
  rust: 0x8b4a32,
  crystal: 0x4f9fa8,
  crystalCore: 0x8ff2f0,
  amber: 0xf4b657,
  amberCore: 0xffd992,
  teal: 0x57c2b4,
  danger: 0xff7a52,
  ceramic: 0xdfe4df,
  charcoal: 0x232b33,
  cape: 0xb5623a,
  water: 0x1c3c4a,
  daylight: 0xffd9a8,
};

// UI palette (CSS strings) kept together for consistency.
export const CSS = {
  ink: '#f2e9d8',
  dim: '#9fb0bd',
  amber: '#f4b657',
  teal: '#7fe0d4',
  danger: '#ff7a52',
  panel: 'rgba(13, 21, 30, 0.92)',
};

export const REGION_NAMES = {
  workshop: 'Buried Workshop',
  reservoir: 'Crystal Reservoir',
  foundry: 'Silent Foundry',
  ascent: 'Ascent Shaft',
};
