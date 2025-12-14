// Game configuration, constants, and level definitions

// Environment-based configuration
const isTestEnv = import.meta.env.VITE_ENV === 'test';

export const game_title = isTestEnv ? 'Nebula (test)' : 'Nebula';

export const test_vars = isTestEnv ? {
  test_EOL: false,
  test_DEATH: true,
} : {
  test_EOL: false,
  test_DEATH: false,
};

// --- Math Constants ---
export const TWO_PI = Math.PI * 2;

// --- Ship Constants ---
export const SHIP_RADIUS = 14;
export const SHIP_THRUST = 180;
export const SHIP_DRAG = 0.98;
export const ROT_PERIOD = 1.2;
export const ANGULAR_VEL = (TWO_PI / ROT_PERIOD) * 0.95;

// Ship collision triangle in local ship coordinates (approx)
export const SHIP_TRI_LOCAL = [
  { x: SHIP_RADIUS, y: 0 },
  { x: -SHIP_RADIUS * 0.7, y: SHIP_RADIUS * 0.6 },
  { x: -SHIP_RADIUS * 0.7, y: -SHIP_RADIUS * 0.6 },
];

// --- Game Physics Constants ---
export const ATTRACT_RADIUS = 220;    // base attract radius; coins use 75% of this visually
export const GRAVITY_K = 180;
export const SHIP_GRAVITY_FACTOR = 0.25;

// --- Collision & Damage Constants ---
export const COIN_IMPULSE = 28;       // how strongly a collected coin nudges the ship
export const ENEMY_DAMAGE = 0.14;     // how much energy one enemy hit removes
export const BUMP_DAMAGE = 0.02;      // how much energy one bump with wall removes

// --- Layout Constants ---
export const HUD_SAFE_BOTTOM = 64;    // bottom of HUD/UI zone (no ship / spawns above this)

// --- Entity Constants ---
export const MAX_BODIES = 40;
export const SPAWN_INTERVAL = 2.4;
export const COIN_RADIUS = 8;
export const HAZARD_RADIUS = 11;
export const OBJECT_SCALE = 0.6;

// --- Health Pickup Constants ---
export const HEALTH_RADIUS = 10;      // size only; spawn interval is per-level
export const HEALTH_SPEED = 40;
export const HEALTH_ATTRACT_MULT = 0.75; // 25% less attraction than default

// Previously ~20–40s; now push it ~20s later on average: ~40–60s
export const DEFAULT_HEALTH_FREQUENCY = Math.floor(Math.random() * 20) + 40;

// Heal flash timing (for double flash)
export const HEAL_FLASH_TOTAL = 0.25; // total duration of double flash

// --- Level Start Quotes ---
export const levelStartQuotes = [
  'Are you ready...',
  'Break a leg...',
  'Time to kick ass...',
  'Let\'s do this...',
  'Watch and learn...',
  'Brace yourself...',
  'Show \'em how it\'s done...',
  'Let\'s make it look easy...',
  'Piece o\' cake...',
  'Here we go...',
  'You got this....',
  'Y\'all ready for this...',
  'Let\'s crush it...',
  'Let\'s GO!',
  'Get ready...',
  'Make it so...',
  'Never quit...',
  'Hold tight...',
  'Prepare for battle...',
];

// --- Level Definitions ---
export const levels = [
  // Level 1: Maze challenge
  {
    type: 'maze',
    scoreGoal: test_vars.test_EOL ? 10 : 100,
    coinHazardSpawnRatio: 0,  // No spawning in maze levels
    healthSpawnInterval: 999999,  // Disabled
    typeBoost: {
      coin: { grav: 1.0, speed: 1.0 },
      hazard: { grav: 1.0, speed: 1.0 },
      elite: { grav: 1.0, speed: 1.0 },
    },
  },
  // Level 2: Normal gameplay
  {
    scoreGoal: test_vars.test_EOL ? 25 : 200,
    coinHazardSpawnRatio: 0.7,  // 70% coins, 30% hazards
    healthSpawnInterval: Math.floor(Math.random() * 30) + 30,
    typeBoost: {
      coin: { grav: 1.0, speed: 1.0 },
      hazard: { grav: 1.0, speed: 1.0 },
      elite: { grav: 1.0, speed: 1.0 },
    },
  },
  {
    scoreGoal: 250,
    coinHazardSpawnRatio: 0.66,
    healthSpawnInterval: Math.floor(Math.random() * 30) + 30,
    typeBoost: {
      coin: { grav: 1.1, speed: 1.1 },
      hazard: { grav: 1.1, speed: 1.1 },
      elite: { grav: 1.1, speed: 1.1 },
    },
  },
  {
    scoreGoal: 300,
    coinHazardSpawnRatio: 0.62,
    healthSpawnInterval: Math.floor(Math.random() * 30) + 35,
    typeBoost: {
      coin: { grav: 1.22, speed: 1.22 },
      hazard: { grav: 1.22, speed: 1.22 },
      elite: { grav: 1.22, speed: 1.22 },
    },
  },
  {
    scoreGoal: 350,
    coinHazardSpawnRatio: 0.58,
    healthSpawnInterval: Math.floor(Math.random() * 30) + 35,
    typeBoost: {
      coin: { grav: 1.34, speed: 1.34 },
      hazard: { grav: 1.34, speed: 1.34 },
      elite: { grav: 1.34, speed: 1.34 },
    },
  },
  {
    scoreGoal: 400,
    coinHazardSpawnRatio: 0.54,
    healthSpawnInterval: Math.floor(Math.random() * 30) + 40,
    typeBoost: {
      coin: { grav: 1.45, speed: 1.45 },
      hazard: { grav: 1.45, speed: 1.45 },
      elite: { grav: 1.45, speed: 1.45 },
    },
  },
  {
    scoreGoal: 450,
    coinHazardSpawnRatio: 0.5,
    healthSpawnInterval: Math.floor(Math.random() * 30) + 40,
    typeBoost: {
      coin: { grav: 1.5, speed: 1.5 },
      hazard: { grav: 1.5, speed: 1.5 },
      elite: { grav: 1.5, speed: 1.5 },
    },
  },
];
