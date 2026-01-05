// Entity spawning (coins, hazards, health pickups)

import {
  SHIP_RADIUS,
  HUD_SAFE_BOTTOM,
  MAX_BODIES,
  COIN_RADIUS,
  HAZARD_RADIUS,
  OBJECT_SCALE,
  HEALTH_RADIUS,
  HEALTH_SPEED,
  HEALTH_ATTRACT_MULT,
  levels,
} from './config.js';

/**
 * Spawn a coin or hazard body (or ice_star)
 */
export function spawnBody(ship, bodies, levelIndex, applyLevelBoost, W, H) {
  if (bodies.length >= MAX_BODIES) return;

  const levelCfg = levels[levelIndex] || levels[0];
  const ratio = levelCfg.coinHazardSpawnRatio ?? 0.7;
  let type = Math.random() < ratio ? "coin" : "hazard";

  // 25% chance to replace a hazard with an ice_star
  if (type === "hazard" && levelIndex >= 4 && Math.random() < (levelCfg.iceStarChance || 0.25)) {
    type = "ice_star";
  }

  const baseRadius = type === "coin" ? COIN_RADIUS : HAZARD_RADIUS;
  const radius = baseRadius * OBJECT_SCALE;

  const futureT = 0.25;
  const projX = ship.x + ship.vx * futureT;
  const projY = ship.y + ship.vy * futureT;
  const SAFE_MARGIN = SHIP_RADIUS + radius + 20;

  let x, y, tries = 0;
  while (tries < 30) {
    x = Math.random() * W();
    y = Math.random() * H();

    // avoid HUD zone at the top
    if (y < HUD_SAFE_BOTTOM + radius + 8) { tries++; continue; }

    const dxNow = x - ship.x, dyNow = y - ship.y;
    const dxFuture = x - projX, dyFuture = y - projY;
    const safeNow = (dxNow * dxNow + dyNow * dyNow) > SAFE_MARGIN * SAFE_MARGIN;
    const safeFuture = (dxFuture * dxFuture + dyFuture * dyFuture) > SAFE_MARGIN * SAFE_MARGIN;
    if (safeNow && safeFuture) break;
    tries++;
  }

  const body = {
    type,
    radius,
    x,
    y,
    vx: 0,
    vy: 0,
    gravMult: 1,
    attractMul: 1,
    speedMul: 1,
    spawnTime: 0.0,   // animation timer (0 to spawnDuration)
    spawnDuration: 0.8
  };
  applyLevelBoost(body);
  bodies.push(body);
}

/**
 * Spawn a health pickup
 */
export function spawnHealthPickup(bodies, W, H) {
  const radius = HEALTH_RADIUS * OBJECT_SCALE;

  // Spawn just *inside* the visible area on left or right, heading toward play-area center
  const side = Math.random() < 0.5 ? 'left' : 'right';

  let x;
  if (side === 'left') {
    x = radius + 2;           // near left edge, fully visible
  } else {
    x = W() - radius - 2;     // near right edge, fully visible
  }

  const yMin = HUD_SAFE_BOTTOM + radius + 8;
  const yMax = H() - radius - 8;
  const yRange = Math.max(10, yMax - yMin);
  let y = yMin + Math.random() * yRange;

  const cx = W() * 0.5;
  const cy = H() * 0.5;
  let dx = cx - x;
  let dy = cy - y;
  let d = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= d;
  dy /= d;

  const body = {
    type: 'health',
    radius,
    x,
    y,
    vx: dx * HEALTH_SPEED,
    vy: dy * HEALTH_SPEED,
    gravMult: 1.0,
    attractMul: HEALTH_ATTRACT_MULT, // 25% weaker attraction
    speedMul: 1.0,
    spawnTime: 0.0,
    spawnDuration: 0.5
  };

  console.log('Spawned health pickup at', x, y);
  bodies.push(body);
}
