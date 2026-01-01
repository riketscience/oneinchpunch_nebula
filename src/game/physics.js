// Physics, movement, and collision detection

import {
  TWO_PI,
  SHIP_RADIUS,
  SHIP_THRUST,
  SHIP_DRAG,
  SHIP_TRI_LOCAL,
  ATTRACT_RADIUS,
  GRAVITY_K,
  SHIP_GRAVITY_FACTOR,
  COIN_IMPULSE,
  ENEMY_DAMAGE,
  BUMP_DAMAGE,
  HUD_SAFE_BOTTOM,
  OBJECT_SCALE,
  HEAL_FLASH_TOTAL,
  levels,
} from './config.js';

/**
 * Apply gravitational attraction between ship and bodies
 * @param {Object} ship - Ship object
 * @param {Array} bodies - Array of body objects
 * @param {number} dt - Delta time
 * @param {number} levelIndex - Current level index
 * @param {Function} getMazeData - Function to get maze data (for grid checks)
 */
export function applyAttraction(ship, bodies, dt, levelIndex = 0, getMazeData = null) {
  const currentLevel = levels[levelIndex] || levels[0];
  const isMazeLevel = currentLevel.type === 'maze';

  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i];

    // Special handling for health packs in maze levels
    if (isMazeLevel && b.type === 'health' && getMazeData) {
      const mazeData = getMazeData();

      // Calculate which grid cell the ship is in
      const shipNormX = ship.x / mazeData.width;
      const shipNormY = ship.y / mazeData.height;
      const shipCol = Math.floor((shipNormX - mazeData.startX) / mazeData.cellW);
      const shipRow = Math.floor((shipNormY - mazeData.startY) / mazeData.cellH);

      // Calculate which grid cell the health pack is in
      const healthNormX = b.x / mazeData.width;
      const healthNormY = b.y / mazeData.height;
      const healthCol = Math.floor((healthNormX - mazeData.startX) / mazeData.cellW);
      const healthRow = Math.floor((healthNormY - mazeData.startY) / mazeData.cellH);

      // Only apply gravity if ship and health are in the same grid square
      if (shipCol !== healthCol || shipRow !== healthRow) {
        continue; // Skip gravity for this health pack
      }
    }

    // Coins attract from 25% closer distance than other bodies
    let baseRadius = ATTRACT_RADIUS;
    if (b.type === 'coin') baseRadius *= 0.75;

    const localRadius = baseRadius * (b.attractMul !== undefined ? b.attractMul : 1);
    const r2 = localRadius * localRadius;

    const dx = b.x - ship.x;
    const dy = b.y - ship.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < r2 && d2 > 1) {
      const d = Math.sqrt(d2);
      const ux = dx / d, uy = dy / d;
      const falloff = 1 - (d / localRadius);
      const gravMult = b.gravMult !== undefined ? b.gravMult : 1;
      const speedMul = b.speedMul !== undefined ? b.speedMul : 1;
      const force = GRAVITY_K * falloff * gravMult;
      b.vx -= ux * force * dt * speedMul;
      b.vy -= uy * force * dt * speedMul;
      ship.vx += ux * force * dt * SHIP_GRAVITY_FACTOR * gravMult;
      ship.vy += uy * force * dt * SHIP_GRAVITY_FACTOR * gravMult;
    }
  }
}

/**
 * Integrate physics (ship and bodies movement)
 * Returns game state changes (energy, triggerExplosion flag, hit flash)
 */
export function integrate(ship, bodies, levelIndex, energy, triggerExplosionCallback, W, H, clamp, dt) {
  let newEnergy = energy;
  let hitFlashColor = 'rgba(255,60,60,';
  let hitFlashTimer = 0;
  let shouldExplode = false;

  // Ship movement
  if (ship.state === "thrusting") {
    ship.vx += Math.cos(ship.thrustDir) * SHIP_THRUST * dt;
    ship.vy += Math.sin(ship.thrustDir) * SHIP_THRUST * dt;
  } else {
    const frames = clamp(dt * 60, 0, 5);
    ship.vx *= Math.pow(SHIP_DRAG, frames);
    ship.vy *= Math.pow(SHIP_DRAG, frames);
    ship.angle += ship.angularVel * dt;
    if (ship.angle > Math.PI) ship.angle -= TWO_PI;
  }

  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;

  // Wall bounce (disabled for maze levels)
  const currentLevel = levels[levelIndex] || levels[0];
  if (currentLevel.type !== 'maze') {
    const minX = SHIP_RADIUS;
    const maxX = W() - SHIP_RADIUS;
    const minY = HUD_SAFE_BOTTOM + SHIP_RADIUS / 4;
    const maxY = H() - SHIP_RADIUS;
    const BOUNCE_DAMP = 0.95;

    if (ship.x < minX) {
      ship.x = minX;
      ship.vx = -ship.vx * BOUNCE_DAMP;
      newEnergy -= BUMP_DAMAGE;
      hitFlashColor = 'rgba(255,60,60,';
      hitFlashTimer = 0.05;
      if (newEnergy <= 0 && ship.alive) {
        newEnergy = 0;
        shouldExplode = true;
      }
    }
    if (ship.x > maxX) {
      ship.x = maxX;
      ship.vx = -ship.vx * BOUNCE_DAMP;
      newEnergy -= BUMP_DAMAGE;
      hitFlashColor = 'rgba(255,60,60,';
      hitFlashTimer = 0.05;
      if (newEnergy <= 0 && ship.alive) {
        newEnergy = 0;
        shouldExplode = true;
      }
    }
    if (ship.y < minY) {
      ship.y = minY;
      ship.vy = -ship.vy * BOUNCE_DAMP;
      newEnergy -= BUMP_DAMAGE;
      hitFlashColor = 'rgba(255,60,60,';
      hitFlashTimer = 0.05;
      if (newEnergy <= 0 && ship.alive) {
        newEnergy = 0;
        shouldExplode = true;
      }
    }
    if (ship.y > maxY) {
      ship.y = maxY;
      ship.vy = -ship.vy * BOUNCE_DAMP;
      newEnergy -= BUMP_DAMAGE;
      hitFlashColor = 'rgba(255,60,60,';
      hitFlashTimer = 0.05;
      if (newEnergy <= 0 && ship.alive) {
        newEnergy = 0;
        shouldExplode = true;
      }
    }
  }

  // Body movement and spawn animation
  for (const b of bodies) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Update spawn animation timer
    if (b.spawnTime !== undefined && b.spawnTime < b.spawnDuration) {
      b.spawnTime += dt;
    }
  }

  return { energy: newEnergy, hitFlashColor, hitFlashTimer, shouldExplode };
}

/**
 * Handle merging of hazards into elite hazards
 */
export function handleBodyMerges(bodies, applyLevelBoost) {
  for (let i = bodies.length - 1; i >= 0; i--) {
    const a = bodies[i];
    if (a.type !== 'hazard') continue;
    for (let j = i - 1; j >= 0; j--) {
      const b = bodies[j];
      if (b.type !== 'hazard') continue;
      const minDist = a.radius + b.radius;
      const dx = a.x - b.x, dy = a.y - b.y;
      if (dx * dx + dy * dy <= minDist * minDist) {
        const mA = a.radius * a.radius;
        const mB = b.radius * b.radius;
        const mTot = mA + mB || 1;
        const vx = (a.vx * mA + b.vx * mB) / mTot;
        const vy = (a.vy * mA + b.vy * mB) / mTot;
        const newRadius = Math.max(a.radius, b.radius) * 1.15;
        let green = {
          type: 'hazard_elite',
          radius: newRadius * OBJECT_SCALE,
          x: (a.x * mA + b.x * mB) / mTot,
          y: (a.y * mA + b.y * mB) / mTot,
          vx: vx * 1.3,
          vy: vy * 1.3,
          gravMult: 1.3,
          attractMul: 1.2,
          speedMul: 1.3
        };
        applyLevelBoost(green);
        bodies.splice(i, 1);
        bodies.splice(j, 1);
        bodies.push(green);
        i = bodies.length;
        break;
      }
    }
  }
}

/**
 * Handle collisions between health pickups and hazards (including ice stars)
 */
export function handleHealthHazardCollisions(bodies) {
  for (let i = bodies.length - 1; i >= 0; i--) {
    const a = bodies[i];
    if (a.type !== 'health' && a.type !== 'hazard' && a.type !== 'hazard_elite' && a.type !== 'ice_star' && a.type !== 'ice_patch_expanding') continue;

    for (let j = i - 1; j >= 0; j--) {
      const b = bodies[j];
      if (b.type !== 'health' && b.type !== 'hazard' && b.type !== 'hazard_elite' && b.type !== 'ice_star' && b.type !== 'ice_patch_expanding') continue;

      // One must be health, the other hazard / hazard_elite / ice_star / ice_patch_expanding
      const isHealthA = a.type === 'health';
      const isHealthB = b.type === 'health';
      const isHazardA = (a.type === 'hazard' || a.type === 'hazard_elite' || a.type === 'ice_star' || a.type === 'ice_patch_expanding');
      const isHazardB = (b.type === 'hazard' || b.type === 'hazard_elite' || b.type === 'ice_star' || b.type === 'ice_patch_expanding');

      if (!((isHealthA && isHazardB) || (isHealthB && isHazardA))) {
        continue;
      }

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const minDist = a.radius + b.radius;
      if (dx * dx + dy * dy <= minDist * minDist) {
        // Remove the health, keep the hazard/ice_star/ice_patch_expanding
        const healthIndex = isHealthA ? i : j;
        bodies.splice(healthIndex, 1);
        // Restart outer loop since array changed
        i = bodies.length;
        break;
      }
    }
  }
}

/**
 * Triangle collision helper
 */
function pointInTriangle(px, py, a, b, c) {
  const v0x = c.x - a.x, v0y = c.y - a.y;
  const v1x = b.x - a.x, v1y = b.y - a.y;
  const v2x = px - a.x, v2y = py - a.y;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const denom = dot00 * dot11 - dot01 * dot01;
  if (denom === 0) return false;
  const invDenom = 1 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
  return u >= 0 && v >= 0 && u + v <= 1;
}

/**
 * Closest point on line segment helper
 */
function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return {
    x: ax + t * vx,
    y: ay + t * vy,
  };
}

/**
 * Check if circle collides with ship triangle
 */
export function circleHitsShip(ship, bx, by, br) {
  // Transform circle center into ship-local coords (inverse rotate+translate)
  const angle = (ship.state === "thrusting") ? ship.thrustDir : ship.angle;
  const cosA = Math.cos(-angle);
  const sinA = Math.sin(-angle);
  const relX = bx - ship.x;
  const relY = by - ship.y;
  const lx = cosA * relX - sinA * relY;
  const ly = sinA * relX + cosA * relY;

  const a = SHIP_TRI_LOCAL[0];
  const b = SHIP_TRI_LOCAL[1];
  const c = SHIP_TRI_LOCAL[2];

  // 1) If center is inside triangle, we collide
  if (pointInTriangle(lx, ly, a, b, c)) return true;

  // 2) Check distance to each edge
  const r2 = br * br;
  const edges = [[a, b], [b, c], [c, a]];
  for (const [p, q] of edges) {
    const cp = closestPointOnSegment(lx, ly, p.x, p.y, q.x, q.y);
    const dx = lx - cp.x;
    const dy = ly - cp.y;
    if (dx * dx + dy * dy <= r2) return true;
  }

  return false;
}

/**
 * Handle all ship vs body collisions
 * Returns collision results (score changes, energy changes, ice patch creation, etc.)
 */
export function handleCollisions(ship, bodies, invulnTimer, phase, warpScore, score, energy, scoreLocked, W, H, clamp, dist2) {
  let newWarpScore = warpScore;
  let newScore = score;
  let newEnergy = energy;
  let healFlashTimer = 0;
  let hitFlashColor = 'rgba(255,60,60,';
  let hitFlashTimer = 0;
  let shouldExplode = false;
  let newIcePatch = null; // Will contain ice patch data if ice star is hit

  // Ship vs bodies
  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i];

    // Broad-phase: bounding circle test
    const approxR = SHIP_RADIUS;
    const minDist = approxR + b.radius;
    if (dist2(ship.x, ship.y, b.x, b.y) > minDist * minDist) continue;

    // Precise: circle vs ship triangle
    if (!circleHitsShip(ship, b.x, b.y, b.radius)) continue;

    if (invulnTimer > 0 || !ship.alive || phase !== 'playing') continue;

    if (b.type === "ice_star") {
      // Ice star hit: trigger ice patch creation
      // Generate randomized edge pattern (24 points around circle)
      const edgePointCount = 24;
      const edgeVariation = [];
      for (let i = 0; i < edgePointCount; i++) {
        // Random variation: -15% to +15% of radius
        edgeVariation.push(0.85 + Math.random() * 0.3);
      }

      newIcePatch = {
        x: b.x,
        y: b.y,
        initialRadius: b.radius,
        targetRadius: b.radius * 8, // Expand to 8x the initial size
        currentRadius: b.radius,
        expansionTimer: 0,
        expansionDuration: 1.0, // 1 second expansion
        duration: 15.0, // 15 seconds total lifetime
        timer: 0,
        edgeVariation // Randomized edge pattern
      };
      // Mark the ice_star body for transformation (change its type to signal it's expanding)
      b.type = 'ice_patch_expanding';
      b.icePatchData = newIcePatch;
      // Stop the body from moving
      b.vx = 0;
      b.vy = 0;
      b.gravMult = 0;
      b.attractMul = 0;
    } else if (b.type === "coin") {
      // Warp gain
      newWarpScore += 10;

      // Score: gold = 100
      newScore += 100;

      // Coin impulse towards ship direction
      const dx = ship.x - b.x;
      const dy = ship.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / d, uy = dy / d;
      ship.vx += ux * COIN_IMPULSE;
      ship.vy += uy * COIN_IMPULSE;

      bodies.splice(i, 1);
    } else if (b.type === 'health') {
      // Health pickup: boost energy by 0.2–0.3, clamp to 1.0
      const delta = 0.2 + Math.random() * 0.1;
      newEnergy = clamp(newEnergy + delta, 0, 1);

      // Score: 200–300 (1000 * delta), rounded to nearest 10
      let healthScore = Math.round((delta * 1000) / 10) * 10;
      newScore += healthScore;

      // trigger blue heal flash (double flash handled in render)
      healFlashTimer = HEAL_FLASH_TOTAL;

      bodies.splice(i, 1);
    } else if (b.type === 'ice_patch_expanding') {
      // Ice patch expanding - no collision effect (ship just enters the ice)
      // The ice physics are handled in game.js update loop
    } else {
      // Enemy hit (hazard / hazard_elite)
      const isElite = b.type === 'hazard_elite';
      bodies.splice(i, 1);

      // Green elite deals double damage
      newEnergy -= isElite ? (ENEMY_DAMAGE * 2) : ENEMY_DAMAGE;

      // Set flash color based on enemy type
      hitFlashColor = isElite ? 'rgba(0,255,102,' : 'rgba(255,60,60,';
      hitFlashTimer = 0.1;

      if (newEnergy <= 0 && ship.alive) {
        newEnergy = 0;
        shouldExplode = true;
      } else {
        // mild knockback when not dead
        ship.vx *= -0.4;
        ship.vy *= -0.4;
      }
      break;
    }
  }

  // Remove offscreen bodies (hazards score when slung off-screen)
  const M = 8;
  const left = -M, top = -M;
  const right = W() + M, bottom = H() + M;
  const kept = [];
  for (const b of bodies) {
    const inside = (b.x >= left && b.x <= right && b.y >= top && b.y <= bottom);
    if (inside) {
      kept.push(b);
    } else if (b.type === 'hazard' || b.type === 'hazard_elite') {
      // Only award points if score is not locked (not during wormhole capture)
      if (!scoreLocked) {
        // Green elite awards double points for slingshot
        if (b.type === 'hazard') {
          newWarpScore += 25;   // red
          newScore += 250;      // red
        } else {
          newWarpScore += 50;   // green elite (double)
          newScore += 500;      // green elite (double)
        }
      }
    }
    // coins/health going off-screen just vanish
  }

  // Update bodies array with kept bodies
  bodies.length = 0;
  bodies.push(...kept);

  return {
    warpScore: newWarpScore,
    score: newScore,
    energy: newEnergy,
    healFlashTimer,
    hitFlashColor,
    hitFlashTimer,
    shouldExplode,
    newIcePatch
  };
}
