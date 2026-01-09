// Game configuration, constants, and level definitions

// Environment-based configuration
const isTestEnv = import.meta.env.VITE_ENV === 'test';

export const game_title = isTestEnv ? 'Nebula (test1)' : 'Nebula';

export const test_vars = isTestEnv ? {
  test_EOL: false,
  test_DEATH: false,
  START_LEVEL: 5,
} : {
  test_EOL: false,
  test_DEATH: false,
  START_LEVEL: 0,
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
  'Noone said it would be easy...',
  'It\'s a doddle... right?!',
  'You totally rock...'
];

// --- Level Definitions ---
export const levels = [
  {
    scoreGoal: test_vars.test_EOL ? 25 : 180,
    coinHazardSpawnRatio: 0.75,  // 75% coins, 25% hazards
    healthSpawnInterval: Math.floor(Math.random() * 30) + 30,
    typeBoost: {
      coin: { grav: 1.0, speed: 1.0 },
      hazard: { grav: 1.0, speed: 1.0 },
      elite: { grav: 1.0, speed: 1.0 },
    },
  },
  {
    scoreGoal: 200,
    coinHazardSpawnRatio: 0.7,
    healthSpawnInterval: Math.floor(Math.random() * 30) + 30,
    typeBoost: {
      coin: { grav: 1.0, speed: 1.0 },
      hazard: { grav: 1.0, speed: 1.0 },
      elite: { grav: 1.0, speed: 1.0 },
    },
  },
    {
    type: 'maze',
    // scoreGoal: test_vars.test_EOL ? 10 : 100,
    coinHazardSpawnRatio: 0,  // No spawning in maze levels
    healthSpawnInterval: 999999,  // Disabled
    typeBoost: {
      coin: { grav: 1.0, speed: 1.0 },
      hazard: { grav: 1.0, speed: 1.0 },
      elite: { grav: 1.0, speed: 1.0 },
    },
    mazeConfig: {
      // Grid layout: 4 columns x 9 rows (including empty rows for entry/exit)
      // Binary encoding: top(8), right(4), bottom(2), left(1)
      grid: [
        [0b1001, 0b1001, 0b1100],
        [0b0001, 0b0110, 0b0100],
        [0b1001, 0b0010, 0b0110],
        [0b0101, 0b0000, 0b0101],
        [0b0101, 0b0000, 0b0100],
        [0b0101, 0b0010, 0b0100],
        [0b0011, 0b0010, 0b0110],
      ],
      entry: { col: 0, row: 0 },  // Top-left of empty row
      exit: { col: 1, row: 3 },   // Bottom-left square (exit vortex position)
      items: [
        { col: 2, row: 3, type: 'health' },  // Health pack in maze
      ],
      // Attractor walls: walls that attract the ship when adjacent
      // side can be: 'top', 'right', 'bottom', 'left'
      // Note: Define both sides of a wall for attraction from both adjacent cells
      attractorWalls: [
        { col: 0, row: 4, side: 'right' },  // Right wall of cell [0,4]
        { col: 1, row: 4, side: 'left' },   // Left wall of cell [1,4] (same physical wall)
      ],
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
    iceStarChance: .2,
    typeBoost: {
      coin: { grav: 1.22, speed: 1.22 },
      hazard: { grav: 1.22, speed: 1.22 },
      elite: { grav: 1.22, speed: 1.22 },
    },
  },
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
    mazeConfig: {
      // Grid layout: 4 columns x 9 rows (including empty rows for entry/exit)
      // Binary encoding: top(8), right(4), bottom(2), left(1)
      grid: [
        [0b1001, 0b1001, 0b1010, 0b1100],
        [0b0001, 0b0010, 0b0001, 0b0110],
        [0b1011, 0b0010, 0b0000, 0b0101],
        [0b0001, 0b0010, 0b0000, 0b0101],
        [0b0101, 0b0000, 0b0110, 0b0100],
        [0b0101, 0b0010, 0b0000, 0b0100],
        [0b0011, 0b0010, 0b0011, 0b0110],
      ],
      entry: { col: 0, row: 0 },  // Top-left of empty row
      exit: { col: 1, row: 6 },   // Bottom-left square (exit vortex position)
      items: [
        { col: 3, row: 2, type: 'health' },  // Health pack in maze
      ],
      attractorWalls: [
        { col: 1, row: 1, side: 'right' },  // Right wall of cell [0,4]
        { col: 2, row: 1, side: 'left' },   // Left wall of cell [1,4] (same physical wall)
      ],
    },
  },
  // Level 5: Second maze challenge (5x9 grid - larger maze)

  {
    scoreGoal: 350,
    coinHazardSpawnRatio: 0.58,
    healthSpawnInterval: Math.floor(Math.random() * 30) + 35,
    iceStarChance: 0.22,
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
    iceStarChance: 0.25,
    typeBoost: {
      coin: { grav: 1.45, speed: 1.45 },
      hazard: { grav: 1.45, speed: 1.45 },
      elite: { grav: 1.45, speed: 1.45 },
    },
  },
    {
    type: 'maze',
    // scoreGoal: test_vars.test_EOL ? 15 : 150,
    coinHazardSpawnRatio: 0,
    healthSpawnInterval: 999999,
    typeBoost: {
      coin: { grav: 1.0, speed: 1.0 },
      hazard: { grav: 1.0, speed: 1.0 },
      elite: { grav: 1.0, speed: 1.0 },
    },
    mazeConfig: {
      // Grid layout: 5 columns x 9 rows (larger maze with more complexity)
      // Binary encoding: top(8), right(4), bottom(2), left(1)
      grid: [
        [0b1010, 0b1010, 0b1010, 0b1010, 0b1100],
        [0b0001, 0b0010, 0b0010, 0b0010, 0b0100],
        [0b0011, 0b0010, 0b0100, 0b0001, 0b1100],
        [0b0001, 0b0110, 0b0101, 0b0011, 0b0100],
        [0b0101, 0b0001, 0b0000, 0b0100, 0b0101],
        [0b0101, 0b0011, 0b0000, 0b0110, 0b0101],
        [0b0001, 0b0100, 0b0001, 0b0010, 0b0110],
        [0b0011, 0b0110, 0b0011, 0b0010, 0b0100],
        [0b0011, 0b0010, 0b0010, 0b0010, 0b0110],
      ],
      entry: { col: 0, row: 0 },  // Top-left corner
      exit: { col: 0, row: 8 },
      items: [
        { col: 2, row: 2, type: 'health' },  // Health pack mid-upper area
        { col: 3, row: 5, type: 'health' },  // Health pack mid-lower area
      ],
    },
  },
  {
    scoreGoal: 450,
    coinHazardSpawnRatio: 0.5,
    healthSpawnInterval: Math.floor(Math.random() * 30) + 50,
    iceStarChance: 0.25,
    typeBoost: {
      coin: { grav: 1.5, speed: 1.5 },
      hazard: { grav: 1.5, speed: 1.5 },
      elite: { grav: 1.5, speed: 1.5 },
    },
  },
];
