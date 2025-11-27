export function createGame(canvas) {
  const W = () => canvas.clientWidth;
  const H = () => canvas.clientHeight;

  // --- Constants ---
  const TWO_PI = Math.PI * 2;
  const SHIP_RADIUS = 14;

  // HUD_SAFE_BOTTOM: bottom of HUD/UI zone (no ship / spawns above this)
  const HUD_SAFE_BOTTOM = 64;

  const COIN_IMPULSE = 28;       // how strongly a collected coin nudges the ship
  const ENEMY_DAMAGE = 0.14;     // how much energy one enemy hit removes
  const BUMP_DAMAGE = 0.02;     // how much energy one enemy hit removes
  const SHIP_THRUST = 180;
  const SHIP_DRAG = 0.98;
  const ROT_PERIOD = 1.2;
  const ANGULAR_VEL = (TWO_PI / ROT_PERIOD) * 0.95;
  const ATTRACT_RADIUS = 220;    // base attract radius; coins use 75% of this visually
  const GRAVITY_K = 180;
  const SHIP_GRAVITY_FACTOR = 0.25;
  const MAX_BODIES = 40;
  const SPAWN_INTERVAL = 2.4;
  const COIN_RADIUS = 8;
  const HAZARD_RADIUS = 11;
  const OBJECT_SCALE = 0.6;

  // Health pickup (white circle with red cross)
  const HEALTH_RADIUS = 10; // size only; spawn interval is per-level
  const HEALTH_SPEED = 40;
  const HEALTH_ATTRACT_MULT = 0.75; // 25% less attraction than default

  // Previously ~20–40s; now push it ~20s later on average: ~40–60s
  const DEFAULT_HEALTH_FREQUENCY = Math.floor(Math.random() * 20) + 40;

  // Heal flash timing (for double flash)
  const HEAL_FLASH_TOTAL = 0.25; // total duration of double flash

  // Level start quotes
  const levelStartQuotes = [
    'Are you ready...',
    'Break a leg...',
    'Time to kick ass...',
    'Let\'s do this...',
    'Watch and learn...',
    'Brace yourselves...',
    'Show \'em how it\'s done...',
    'Let\'s make it look easy...',
    'Piece o\' cake',
    'Here we go...',
    'You got this....',
    'Y\'all ready for this...',
    'Let\'s crush it...',
    'Let\'s GO!',
    'Get ready...',
    'I\'ve said it before & I\'ll say it again',
  ];

  // Ship collision triangle in local ship coordinates (approx)
  const SHIP_TRI_LOCAL = [
    { x: SHIP_RADIUS, y: 0 },
    { x: -SHIP_RADIUS * 0.7, y: SHIP_RADIUS * 0.6 },
    { x: -SHIP_RADIUS * 0.7, y: -SHIP_RADIUS * 0.6 },
  ];

  // --- Ship state ---
  const ship = {
    x: 0, y: 0, vx: 0, vy: 0,
    angle: -Math.PI / 2,
    angularVel: ANGULAR_VEL,
    state: "rotating",
    thrustDir: 0,
    score: 0,       // legacy; no longer used for logic
    alive: true,
  };

  // --- Background image ---
  const bgImage = new Image();
  bgImage.src = '/images/backg_main.jpg'; // Vercel: public/images/backg_main.jpg
  let bgReady = false;
  bgImage.onload = () => { bgReady = true; };

  // --- Bodies (coins, hazards, elites, health) ---
  // {x,y,vx,vy,radius,type,gravMult,attractMul,speedMul}
  let bodies = [];
  let spawnTimer = 0;
  let healthSpawnTimer = 0;

  // --- Levels ---
  const levels = [
    {
      scoreGoal: 200,
      coinHazardSpawnRatio: 0.7,  // 70% coins, 30% hazards
      healthSpawnInterval: Math.floor(Math.random() * 30) + 30,  // (not used yet)
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
  let levelIndex = 0;
  let scoreGoal = levels[levelIndex].scoreGoal;

  // --- Phase ---
  // 'start'        → title/instructions overlay
  // 'startCountdown' → 3..2..1 + quote after start button
  // 'playing'      → normal game
  // 'captured'     → being pulled into vortex
  // 'betweenLevels'→ level complete + countdown
  // 'gameOver'     → out of lives, show Game Over screen
  let phase = 'start';
  let captureTimer = 0.0;
  let betweenTimer = 0.0;
  let betweenStage = 0;
  let betweenFromLevel = 1;
  let betweenToLevel = 2;
  let currentLevelQuote = '';
  let startCountdownTimer = 0.0;
  let startCountdownStage = 0;
  let levelBonus = 0;
  let bonusApplied = false;

  // --- Energy, lives, respawn, hit feedback ---
  let energy = 1.0;
  let lives = 2; // extra lives (3 total: current + 2 icons)
  let energyDisplay = energy; // smoothed energy for HUD

  // warpScore = points accumulated toward warp threshold this level
  let warpScore = 0;
  let scoreDisplay = 0;       // smoothed warpScore for HUD bar

  // global run score (doesn't reset between levels)
  let score = 0;
  let scoreNumericDisplay = 0; // animated display for numeric score
  let scoreLocked = false; // prevent score changes during wormhole capture

  let fragments = [];
  let respawnPending = false;
  let respawnCheckTimer = 0.0;
  let invulnTimer = 0.0;
  let respawnCooldown = 0.0;
  let hitFlashTimer = 0.0;
  let healFlashTimer = 0.0;

  // --- Hi-score (local, per device for now) ---
  let hiScore = 0;
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('nebula_hi_score');
      if (saved) {
        const n = parseInt(saved, 10);
        if (!Number.isNaN(n)) hiScore = n;
      }
    }
  } catch (e) {
    // ignore storage errors
  }

  // --- Game over state ---
  let gameOverTimer = 0.0;
  const restartBtn = { x: 0, y: 0, w: 220, h: 48 };
  const startBtn = { x: 0, y: 0, w: 240, h: 56 };

  // --- Wormhole state ---
  let wormhole = null;
  let wormholeActive = false;

  // --- Helpers ---
  function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  function applyLevelBoost(body) {
    const cfg = levels[levelIndex] || levels[0];
    const tb = cfg.typeBoost || {};

    // Health pickups ignore boosts – only coins/hazards/elites get them
    if (body.type === 'health') return;

    const key = body.type === 'coin' ? 'coin' : (body.type === 'hazard_elite' ? 'elite' : 'hazard');
    const f = tb[key] || { grav: 1.0, speed: 1.0 };
    body.gravMult = (body.gravMult || 1) * (f.grav || 1);
    body.speedMul = (body.speedMul || 1) * (f.speed || 1);
  }

  function resetShipForLevel() {
    const cfg = levels[levelIndex] || levels[0];
    scoreGoal = cfg.scoreGoal;

    ship.x = W() * 0.5;
    ship.y = H() * 0.5;
    ship.vx = 0; ship.vy = 0;
    ship.angle = -Math.PI / 2;
    ship.state = "rotating";
    ship.thrustDir = ship.angle;
    ship.alive = true;

    // Do NOT reset global score between levels
    warpScore = 0;
    scoreDisplay = warpScore;

    spawnTimer = 0;
    healthSpawnTimer = 0;
    fragments = [];
    respawnPending = false;
    respawnCheckTimer = 0;
    invulnTimer = 0;
    wormholeActive = false;
    wormhole = null;
    bodies = [];
  }

  function hardRestartGame() {
    levelIndex = 0;
    lives = 2;
    energy = 1.0;
    energyDisplay = energy;

    // New run: reset both global score and warp
    score = 0;
    warpScore = 0;
    scoreDisplay = 0;

    resetShipForLevel();
    phase = 'start';
    gameOverTimer = 0;
  }

  // --- Spawning (coins/hazards) ---
  function spawnBody() {
    if (bodies.length >= MAX_BODIES) return;

    const levelCfg = levels[levelIndex] || levels[0];
    const ratio = levelCfg.coinHazardSpawnRatio ?? 0.7;
    const type = Math.random() < ratio ? "coin" : "hazard";

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
      spawnTime: 0.0,  // animation timer (0 to 0.8s)
      spawnDuration: 0.8  // 800ms spawn animation
    };
    applyLevelBoost(body);
    bodies.push(body);
  }

  // --- Spawning (health pickup) ---
  function spawnHealthPickup() {
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
      spawnTime: 0.0,  // animation timer (0 to 0.8s)
      spawnDuration: 0.5  // 800ms spawn animation
    };

    console.log('Spawned health pickup at', x, y);
    bodies.push(body);
  }

  // --- Gravity / movement ---
  function applyAttraction(dt) {
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];

      // Coins attract from 25% closer distance than other bodies
      let baseRadius = ATTRACT_RADIUS;
      if (b.type === 'coin') baseRadius *= 0.75;

      const localRadius = baseRadius * (b.attractMul || 1);
      const r2 = localRadius * localRadius;

      const dx = b.x - ship.x;
      const dy = b.y - ship.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2 && d2 > 1) {
        const d = Math.sqrt(d2);
        const ux = dx / d, uy = dy / d;
        const falloff = 1 - (d / localRadius);
        const force = GRAVITY_K * falloff * (b.gravMult || 1);
        b.vx -= ux * force * dt * (b.speedMul || 1);
        b.vy -= uy * force * dt * (b.speedMul || 1);
        ship.vx += ux * force * dt * SHIP_GRAVITY_FACTOR * (b.gravMult || 1);
        ship.vy += uy * force * dt * SHIP_GRAVITY_FACTOR * (b.gravMult || 1);
      }
    }
  }

  function integrate(dt) {
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

    const minX = SHIP_RADIUS;
    const maxX = W() - SHIP_RADIUS;
    const minY = HUD_SAFE_BOTTOM + SHIP_RADIUS / 4;
    const maxY = H() - SHIP_RADIUS;
    const BOUNCE_DAMP = 0.95;

    if (ship.x < minX) {
      ship.x = minX;
      ship.vx = -ship.vx * BOUNCE_DAMP;
      energy = Math.max(0, energy - BUMP_DAMAGE);
    }
    if (ship.x > maxX) {
      ship.x = maxX;
      ship.vx = -ship.vx * BOUNCE_DAMP;
      energy = Math.max(0, energy - BUMP_DAMAGE);
    }
    if (ship.y < minY) {
      ship.y = minY;
      ship.vy = -ship.vy * BOUNCE_DAMP;
      energy = Math.max(0, energy - BUMP_DAMAGE);
    }
    if (ship.y > maxY) {
      ship.y = maxY;
      ship.vy = -ship.vy * BOUNCE_DAMP;
      energy = Math.max(0, energy - BUMP_DAMAGE);
    }

    for (const b of bodies) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Update spawn animation timer
      if (b.spawnTime !== undefined && b.spawnTime < b.spawnDuration) {
        b.spawnTime += dt;
      }
    }
  }

  // --- Hazard merges (greens) ---
  function handleBodyMerges() {
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

  // --- Health vs hazard collisions (destroy health) ---
  function handleHealthHazardCollisions() {
    for (let i = bodies.length - 1; i >= 0; i--) {
      const a = bodies[i];
      if (a.type !== 'health' && a.type !== 'hazard' && a.type !== 'hazard_elite') continue;

      for (let j = i - 1; j >= 0; j--) {
        const b = bodies[j];
        if (b.type !== 'health' && b.type !== 'hazard' && b.type !== 'hazard_elite') continue;

        // One must be health, the other hazard / hazard_elite
        const isHealthA = a.type === 'health';
        const isHealthB = b.type === 'health';
        const isHazardA = (a.type === 'hazard' || a.type === 'hazard_elite');
        const isHazardB = (b.type === 'hazard' || b.type === 'hazard_elite');

        if (!((isHealthA && isHazardB) || (isHealthB && isHazardA))) {
          continue;
        }

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const minDist = a.radius + b.radius;
        if (dx * dx + dy * dy <= minDist * minDist) {
          // Remove the health, keep the hazard
          const healthIndex = isHealthA ? i : j;
          bodies.splice(healthIndex, 1);
          // Restart outer loop since array changed
          i = bodies.length;
          break;
        }
      }
    }
  }

  // --- Triangle helpers for ship hitbox ---
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

  function circleHitsShip(bx, by, br) {
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

  // --- Explosion / respawn / lives ---
  function triggerExplosion() {
    if (!ship.alive) return;

    // Ensure energy and bar are visually zero when exploding
    energy = 0;
    energyDisplay = 0;

    ship.alive = false;
    fragments = [];
    const pieces = 8;
    for (let i = 0; i < pieces; i++) {
      const a = (i / pieces) * TWO_PI;
      const speed = 160 + Math.random() * 120;
      fragments.push({
        x: ship.x,
        y: ship.y,
        vx: Math.cos(a) * speed + ship.vx * 0.3,
        vy: Math.sin(a) * speed + ship.vy * 0.3,
        angle: a,
        life: 0.8
      });
    }

    // Update hi-score if beaten (based on global score)
    if (score > hiScore) {
      hiScore = score;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('nebula_hi_score', String(Math.floor(hiScore)));
        }
      } catch (e) {
        // ignore
      }
    }

    if (lives > 0) {
      // Consume a life and respawn
      lives -= 1;
      respawnPending = true;
      respawnCooldown = 1.2;
      respawnCheckTimer = 0.1;
    } else {
      // No lives left → Game Over
      phase = 'gameOver';
      gameOverTimer = 0.0;
      respawnPending = false;
    }
  }

  function updateFragments(dt) {
    if (!fragments.length) return;
    for (const f of fragments) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.life -= dt;
    }
    fragments = fragments.filter(f => f.life > 0);
  }

  function renderFragments(ctx) {
    if (!fragments.length) return;
    for (const f of fragments) {
      const alpha = Math.max(0, f.life / 0.8);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, 3);
      ctx.lineTo(-4, -3);
      ctx.closePath();
      ctx.fillStyle = '#cfe8ff';
      ctx.fill();
      ctx.restore();
    }
  }

  function isCenterSafe() {
    const cx = W() * 0.5, cy = H() * 0.5;
    const extraPad = 8;
    for (const b of bodies) {
      const minDist = SHIP_RADIUS + b.radius + extraPad;
      const dx = cx - b.x, dy = cy - b.y;
      if (dx * dx + dy * dy <= minDist * minDist) return false;
    }
    return true;
  }

  function tryRespawn(dt) {
    if (!respawnPending) return;
    if (respawnCooldown > 0) { respawnCooldown -= dt; return; }
    respawnCheckTimer -= dt;
    if (respawnCheckTimer <= 0) {
      if (isCenterSafe()) {
        ship.x = W() * 0.5;
        ship.y = H() * 0.5;
        ship.vx = 0;
        ship.vy = 0;
        ship.state = "rotating";
        ship.thrustDir = ship.angle;
        ship.alive = true;
        energy = 1.0; // full energy on new life
        energyDisplay = energy;
        fragments = [];
        invulnTimer = 0.3;
        respawnPending = false;
      } else {
        respawnCheckTimer = 0.1;
      }
    }
  }

  // --- Collisions (ship vs bodies, off-screen scoring) ---
  function handleCollisions() {
    // Ship vs bodies
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];

      // Broad-phase: bounding circle test
      const approxR = SHIP_RADIUS;
      const minDist = approxR + b.radius;
      if (dist2(ship.x, ship.y, b.x, b.y) > minDist * minDist) continue;

      // Precise: circle vs ship triangle
      if (!circleHitsShip(b.x, b.y, b.radius)) continue;

      if (invulnTimer > 0 || !ship.alive || phase !== 'playing') continue;

      if (b.type === "coin") {
        // Warp gain
        warpScore += 10;

        // Score: gold = 100
        score += 100;

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
        energy = clamp(energy + delta, 0, 1);

        // Score: 200–300 (1000 * delta), rounded to nearest 10
        let healthScore = Math.round((delta * 1000) / 10) * 10;
        score += healthScore;

        // trigger blue heal flash (double flash handled in render)
        healFlashTimer = HEAL_FLASH_TOTAL;

        bodies.splice(i, 1);
      } else {
        // Enemy hit (hazard / hazard_elite)
        bodies.splice(i, 1);
        energy -= ENEMY_DAMAGE;
        if (energy <= 0 && ship.alive) {
          energy = 0;
          triggerExplosion();
        } else {
          // mild knockback when not dead
          ship.vx *= -0.4;
          ship.vy *= -0.4;
          hitFlashTimer = 0.1;
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
          // Warp gain for slingshot
          warpScore += 25;

          // Score: red vs green
          if (b.type === 'hazard') {
            score += 250;    // red
          } else {
            score += 500;    // green elite
          }
        }
      }
      // coins/health going off-screen just vanish
    }
    bodies = kept;
  }

  // --- Wormhole ---
  function spawnWormhole() {
    const inset = 60;
    let wx = ship.x < W() / 2 ? W() - inset : inset;
    let wy = ship.y < H() / 2 ? H() - inset : inset;

    // If spawning in a top corner, push it down just below HUD with padding
    const vortexPadding = 40;
    if (wy < HUD_SAFE_BOTTOM + vortexPadding) {
      wy = HUD_SAFE_BOTTOM + vortexPadding / 2;
    }

    // reduced radius by ~15% (26 → 22)
    wormhole = { x: wx, y: wy, radius: 22, angle: 0 };
    wormholeActive = true;
  }

  function updateWormhole(dt) {
    if (!wormholeActive || !wormhole) return;
    wormhole.angle += dt * 1.2; // used as phase for ripples too
    const dx = wormhole.x - ship.x;
    const dy = wormhole.y - ship.y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2) || 1;
    const ux = dx / d, uy = dy / d;
    const pull = 90;
    ship.vx += ux * pull * dt;
    ship.vy += uy * pull * dt;
    if (d <= wormhole.radius + SHIP_RADIUS * 0.8 && phase === 'playing') {
      phase = 'captured';
      captureTimer = 2.5;
      ship.state = 'rotating';
      scoreLocked = true; // Lock score during wormhole capture
    }
  }

  function renderWormhole(ctx) {
    if (!wormholeActive || !wormhole) return;
    ctx.save();
    ctx.translate(wormhole.x, wormhole.y);

    const baseR = wormhole.radius;
    const t = wormhole.angle;

    // Make the ripple feel like it affects the background: use additive-like blending
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';

    // now 5 rings, with one further inside
    const rippleCount = 5;
    const innerOffset = -6; // inner ring slightly inside base radius
    const step = 8;

    for (let i = 0; i < rippleCount; i++) {
      const phase = t * 2.2 + i * 0.8;
      const pulsate = Math.sin(phase) * 4;
      const offset = innerOffset + i * step;
      const r = baseR + offset + pulsate;

      // more opaque towards the outer edges
      const maxAlpha = 0.55;
      const minAlpha = 0.18;
      const alpha = minAlpha + (i / (rippleCount - 1)) * (maxAlpha - minAlpha);
      if (alpha <= 0 || r <= 0) continue;

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TWO_PI);
      ctx.strokeStyle = `rgba(120,180,255,${alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.globalCompositeOperation = prevComp;
    ctx.restore();
  }

  // --- Level transitions ---
  function startNextLevel() {
    levelIndex = Math.min(levelIndex + 1, levels.length - 1);
    resetShipForLevel();
    scoreLocked = false; // Unlock score for new level
    // NOTE: energy does NOT reset between levels
    phase = 'playing';
  }

  // --- Input ---
  function onPress(px, py) {
    if (phase === 'start') {
      if (px != null && py != null) {
        const x = px, y = py;
        if (x >= startBtn.x && x <= startBtn.x + startBtn.w &&
            y >= startBtn.y && y <= startBtn.y + startBtn.h) {
          // Pick a random quote for game start
          currentLevelQuote = levelStartQuotes[Math.floor(Math.random() * levelStartQuotes.length)];
          phase = 'startCountdown';
          startCountdownTimer = 0.0;
          startCountdownStage = 0;
          return;
        }
      }
      return;
    }

    if (phase === 'gameOver') {
      if (gameOverTimer >= 1.0 && px != null && py != null) {
        const x = px, y = py;
        if (x >= restartBtn.x && x <= restartBtn.x + restartBtn.w &&
            y >= restartBtn.y && y <= restartBtn.y + restartBtn.h) {
          hardRestartGame();
        }
      }
      return;
    }

    if (phase !== 'playing') return;
    if (!ship.alive) return;

    ship.state = "thrusting";
    ship.thrustDir = ship.angle;
  }

  function onRelease(px, py) {
    if (phase !== 'playing') return;
    if (!ship.alive) return;
    ship.state = "rotating";
  }

  // --- Update ---
  function update(dt) {
    if (phase === 'start') {
      // Just showing title / instructions
      return;
    }

    if (phase === 'startCountdown') {
      startCountdownTimer += dt;
      if (startCountdownStage === 0 && startCountdownTimer >= 3.0) {
        startCountdownStage = 1;
        startCountdownTimer = 0.0;
      } else if (startCountdownStage === 1 && startCountdownTimer >= 1.5) {
        phase = 'playing';
        return;
      }
      updateFragments(dt);
      return;
    }

    if (phase === 'gameOver') {
      gameOverTimer += dt;
      updateFragments(dt);
      return;
    }

    if (phase === 'captured') {
      // Keep pulling ship into wormhole
      if (wormhole) {
        const dx = wormhole.x - ship.x;
        const dy = wormhole.y - ship.y;
        ship.vx = dx * 3.0;
        ship.vy = dy * 3.0;
        ship.x += ship.vx * dt;
        ship.y += ship.vy * dt;
      }

      // Exponential spin-up into the vortex (visual only)
      const totalCapture = 2.5;
      const t = Math.max(0, Math.min(1, 1 - captureTimer / totalCapture));
      const spinMult = 1 + 4 * (t * t);
      ship.angle += ship.angularVel * spinMult * dt;
      if (ship.angle > Math.PI) ship.angle -= TWO_PI;

      // Keep existing bodies moving & interacting while captured
      applyAttraction(dt);
      for (const b of bodies) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      handleBodyMerges();
      handleHealthHazardCollisions();
      handleCollisions();
      updateFragments(dt);

      captureTimer -= dt;
      if (captureTimer <= 0) {
        phase = 'betweenLevels';
        betweenTimer = 0.0;
        betweenStage = 0;
        betweenFromLevel = levelIndex + 1;
        betweenToLevel = Math.min(levelIndex + 2, levels.length);

        // Calculate level completion bonus
        levelBonus = 500 * betweenFromLevel;
        bonusApplied = false;

        // Pick a random quote different from the previous one
        let newQuote;
        do {
          newQuote = levelStartQuotes[Math.floor(Math.random() * levelStartQuotes.length)];
        } while (newQuote === currentLevelQuote && levelStartQuotes.length > 1);
        currentLevelQuote = newQuote;
      }
      return;
    }

    if (!ship.alive) {
      updateFragments(dt);
      tryRespawn(dt);
      return;
    }

    if (phase === 'betweenLevels') {
      betweenTimer += dt;

      // Stage 0: "Level N complete" (0.8s)
      if (betweenStage === 0 && betweenTimer >= 0.8) {
        betweenStage = 1;
        betweenTimer = 0.0;
      }
      // Stage 1: Show "BONUS: XXX" and apply it immediately (1.5s - show score for 1s before animating)
      else if (betweenStage === 1) {
        // Apply bonus to score at the start of stage 1
        if (!bonusApplied) {
          score += levelBonus;
          bonusApplied = true;
        }
        if (betweenTimer >= 1.5) {
          betweenStage = 2;
          betweenTimer = 0.0;
        }
      }
      // Stage 2: Score animating up (0.5s)
      else if (betweenStage === 2 && betweenTimer >= 0.5) {
        betweenStage = 3;
        betweenTimer = 0.0;
      }
      // Stage 3: Pause before countdown (0.5s)
      else if (betweenStage === 3 && betweenTimer >= 0.5) {
        betweenStage = 4;
        betweenTimer = 0.0;
      }
      // Stage 4: Countdown 3..2..1 (3.0s)
      else if (betweenStage === 4 && betweenTimer >= 3.0) {
        betweenStage = 5;
        betweenTimer = 0.0;
      }
      // Stage 5: Quote (1.5s)
      else if (betweenStage === 5 && betweenTimer >= 1.5) {
        startNextLevel();
        return;
      }

      updateFragments(dt);

      // Animate numeric score during betweenLevels (only after stage 1 completes, i.e., during stage 2+)
      if (betweenStage >= 2) {
        const numericScoreDiff = score - scoreNumericDisplay;
        if (Math.abs(numericScoreDiff) > 0.5) {
          const scoreIncrementSpeed = 1000; // points per second
          const maxIncrement = scoreIncrementSpeed * dt;
          if (numericScoreDiff > 0) {
            scoreNumericDisplay = Math.min(score, scoreNumericDisplay + maxIncrement);
          } else {
            scoreNumericDisplay = Math.max(score, scoreNumericDisplay - maxIncrement);
          }
        } else {
          scoreNumericDisplay = score; // snap to target when close
        }
      }

      return;
    }

    // Normal playing
    spawnTimer += dt;
    if (spawnTimer >= SPAWN_INTERVAL) {
      spawnTimer = 0;
      spawnBody();
    }

    // Independent health spawns (using global default for now)
    healthSpawnTimer += dt;
    if (healthSpawnTimer >= DEFAULT_HEALTH_FREQUENCY) {
      healthSpawnTimer = 0;
      spawnHealthPickup();
    }

    applyAttraction(dt);
    integrate(dt);
    handleBodyMerges();
    handleHealthHazardCollisions();
    invulnTimer = Math.max(0, invulnTimer - dt);
    hitFlashTimer = Math.max(0, hitFlashTimer - dt);
    healFlashTimer = Math.max(0, healFlashTimer - dt);
    handleCollisions();

    if (!wormholeActive && warpScore >= scoreGoal) spawnWormhole();
    updateWormhole(dt);

    updateFragments(dt);
    tryRespawn(dt);

    // Smooth energy/warp HUD values
    const lerpSpeed = 3; // higher = snappier (reduced from 10 for smoother animation)
    const f = Math.min(1, lerpSpeed * dt);
    energyDisplay += (energy - energyDisplay) * f;

    // Warp score bar animation (using same lerp as energy for consistent smoothness)
    scoreDisplay += (warpScore - scoreDisplay) * f;

    // Numeric score display counts up at ~1000 points per second
    const numericScoreDiff = score - scoreNumericDisplay;
    if (Math.abs(numericScoreDiff) > 0.5) {
      const scoreIncrementSpeed = 1000; // points per second
      const maxIncrement = scoreIncrementSpeed * dt;
      if (numericScoreDiff > 0) {
        scoreNumericDisplay = Math.min(score, scoreNumericDisplay + maxIncrement);
      } else {
        scoreNumericDisplay = Math.max(score, scoreNumericDisplay - maxIncrement);
      }
    } else {
      scoreNumericDisplay = score; // snap to target when close
    }
  }

  // --- Render ---
  function render(ctx) {
    const w = W();
    const h = H();

    // Background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (bgReady && bgImage.width > 0 && bgImage.height > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      const scale = Math.max(w / bgImage.width, h / bgImage.height);
      const dw = bgImage.width * scale;
      const dh = bgImage.height * scale;
      ctx.drawImage(bgImage, 0, 0, dw, dh);
      ctx.restore();
    }

    // Wormhole ripple (behind bodies, over background)
    renderWormhole(ctx);

    // Bodies
    for (const b of bodies) {
      // Calculate spawn animation scale (1px to full size over 800ms)
      let renderRadius = b.radius;
      if (b.spawnTime !== undefined && b.spawnTime < b.spawnDuration) {
        const progress = b.spawnTime / b.spawnDuration;
        const minRadius = 1;
        renderRadius = minRadius + (b.radius - minRadius) * progress;
      }

      if (b.type === 'health') {
        // White circle with red cross
        ctx.save();
        ctx.translate(b.x, b.y);

        ctx.beginPath();
        ctx.arc(0, 0, renderRadius, 0, TWO_PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.fillStyle = '#ff0000';
        const crossW = renderRadius * 0.9;
        const crossT = renderRadius * 0.35;
        // vertical bar
        ctx.fillRect(-crossT / 2, -crossW / 2, crossT, crossW);
        // horizontal bar
        ctx.fillRect(-crossW / 2, -crossT / 2, crossW, crossT);

        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(b.x, b.y, renderRadius, 0, TWO_PI);
        if (b.type === 'coin') ctx.fillStyle = '#ffd54a';
        else if (b.type === 'hazard_elite') ctx.fillStyle = '#00ff66';
        else ctx.fillStyle = '#ff5252';
        ctx.fill();
      }
    }

    renderFragments(ctx);

    // Ship (hidden during between-level overlay so it doesn't pop back full-size)
    if (phase !== 'betweenLevels' && (ship.alive || phase === 'captured')) {
      ctx.save();
      ctx.translate(ship.x, ship.y);
      const capScale = (phase === 'captured') ? Math.max(0.1, captureTimer / 2.5) : 1;
      ctx.scale(capScale, capScale);
      ctx.rotate(ship.state === "thrusting" ? ship.thrustDir : ship.angle);

      ctx.beginPath();
      ctx.moveTo(SHIP_RADIUS, 0);
      ctx.lineTo(-SHIP_RADIUS * 0.7, SHIP_RADIUS * 0.6);
      ctx.lineTo(-SHIP_RADIUS * 0.4, 0);
      ctx.lineTo(-SHIP_RADIUS * 0.7, -SHIP_RADIUS * 0.6);
      ctx.closePath();
      ctx.fillStyle = '#cfe8ff';
      ctx.fill();

      if (ship.state === "thrusting") {
        ctx.beginPath();
        ctx.moveTo(-SHIP_RADIUS * 0.4, 0);
        ctx.lineTo(-SHIP_RADIUS * 1.2, 4);
        ctx.lineTo(-SHIP_RADIUS * 1.2, -4);
        ctx.closePath();
        ctx.fillStyle = '#8cf';
        ctx.fill();
      }
      ctx.restore();
    }

    // HUD: Energy & Score/Warp/Lives
    const padding = 12;
    const gap = 8;
    const totalW = w - padding * 2 - gap;
    const halfW = totalW * 0.5;

    // Reduced bar height
    const barH = 12;
    const topY = 32;

    // Energy
    {
      const x = padding, y = topY;
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(x, y, halfW, barH);
      const e = clamp(energyDisplay, 0, 1);
      ctx.fillStyle = '#ff3b3b';
      ctx.fillRect(x, y, halfW * e, barH);
      ctx.strokeStyle = '#666';
      ctx.strokeRect(x, y, halfW, barH);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('⚡ Energy', x, y - 2);
    }

    // Score (numeric, top-right)
    {
      const scoreX = w - padding;
      const scoreY = topY - 2; // aligned above warp bar
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      const scoreText = String(Math.floor(scoreNumericDisplay)).padStart(1, '0'); // animated count-up
      ctx.fillText(scoreText, scoreX, scoreY);
    }

    // Warp bar (right) – based on warpScore
    {
      const x = padding + halfW + gap;
      const y = topY;
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(x, y, halfW, barH);
      const p = clamp(scoreDisplay / scoreGoal, 0, 1);
      ctx.fillStyle = '#ffd54a';
      ctx.fillRect(x, y, halfW * p, barH);
      ctx.strokeStyle = '#666';
      ctx.strokeRect(x, y, halfW, barH);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('🪙 Warp drive', x, y - 2);
    }

    // Lives (mini ships) moved to top-right of ENERGY area
    {
      const lifeRadius = 8;
      const lifeGap = 6;
      const energyRightX = padding + halfW;
      let lx = energyRightX - lifeRadius;
      const ly = topY - 10;

      ctx.save();
      ctx.fillStyle = '#cfe8ff';
      for (let i = 0; i < lives; i++) {
        ctx.save();
        ctx.translate(lx, ly);
        // rotate mini ships to -45 degrees so they match the main ship vibe
        ctx.rotate(-Math.PI / 4);

        ctx.beginPath();
        ctx.moveTo(lifeRadius, 0);
        ctx.lineTo(-lifeRadius * 0.7, lifeRadius * 0.6);
        ctx.lineTo(-lifeRadius * 0.4, 0);
        ctx.lineTo(-lifeRadius * 0.7, -lifeRadius * 0.6);
        ctx.closePath();
        ctx.fill();  // no stroke → same look as main ship

        ctx.restore();
        lx -= (lifeRadius * 2 + lifeGap);
      }
      ctx.restore();
    }

    // Hit flash when taking damage (red)
    if (hitFlashTimer > 0) {
      const alpha = Math.min(0.4, (hitFlashTimer / 0.1) * 0.4);
      ctx.save();
      ctx.fillStyle = `rgba(255,60,60,${alpha})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // Heal flash when collecting health (double blue flash)
    if (healFlashTimer > 0) {
      const t = 1 - (healFlashTimer / HEAL_FLASH_TOTAL); // 0 -> 1 over duration
      // Two quick flashes: one early, one mid
      const flashOn =
        (t >= 0.0 && t < 0.15) ||   // first flash
        (t >= 0.25 && t < 0.4);     // second flash

      if (flashOn) {
        const alpha = 0.5;
        ctx.save();
        ctx.fillStyle = `rgba(90,180,255,${alpha})`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }

    // --- Overlays ---

    // Start screen overlay
    if (phase === 'start') {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, w, h);

      const panelW = w * 0.8;
      const panelH = h * 0.8;
      const px = w * 0.1;
      const py = h * 0.1;

      ctx.fillStyle = 'rgba(100, 255, 180, 0.2)';
      ctx.fillRect(px, py, panelW, panelH);

      ctx.lineWidth = 4;
      ctx.strokeStyle = '#a8ffd9';
      ctx.strokeRect(px, py, panelW, panelH);

      ctx.fillStyle = 'rgba(253, 255, 208, 1)';
      ctx.textAlign = 'center';

      // Title
      ctx.font = 'bold 28px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText('Nebula', w * 0.5, py + 60);

      // Instructions
      ctx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      const lines = [
        'Hold anywhere on the screen to thrust.',
        'Your ship accelerates in the direction',
        'that it is currently facing.',
        'Collect stars to build up warp drive.',
        'Red & green pulsars drain your energy.',
        'Use gravity to slingshot them off-screen.',
        'This greatly increases your warp drive.',
        ' ',
        ' ',
        'Once you\'ve built up enough warp drive',
        'enter the vortex to finish the level...'
      ];
      let ly = py + 110;
      for (const line of lines) {
        ctx.fillText(line, w * 0.5, ly);
        ly += 22;
      }

      startBtn.w = 240;
      startBtn.h = 56;
      startBtn.x = w * 0.5 - startBtn.w / 2;
      startBtn.y = py + panelH - 100;
      ctx.fillStyle = '#16c784';
      ctx.fillRect(startBtn.x, startBtn.y, startBtn.w, startBtn.h);
      ctx.strokeStyle = '#c8ffe6';
      ctx.lineWidth = 2;
      ctx.strokeRect(startBtn.x, startBtn.y, startBtn.w, startBtn.h);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText('Start Game', w * 0.5, startBtn.y + startBtn.h / 2 + 7);

      ctx.restore();
    }

    // Start countdown overlay (3..2..1 + quote)
    if (phase === 'startCountdown') {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';

      if (startCountdownStage === 0) {
        const total = 3.0;
        const t = clamp(startCountdownTimer, 0, total);
        const remaining = Math.max(1, Math.ceil(total - t)); // 3..2..1
        const text = String(remaining);
        const pulse = 1.0 + 0.25 * (1 - (t % 1.0));
        ctx.save();
        ctx.translate(w * 0.5, h * 0.5);
        ctx.scale(pulse, pulse);
        ctx.font = 'bold 64px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText(text, 0, 20);
        ctx.restore();
      } else if (startCountdownStage === 1) {
        ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText(currentLevelQuote, w * 0.5, h * 0.45);
      }

      ctx.restore();
    }

    // Between-level overlay
    if (phase === 'betweenLevels') {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';

      // Stage 0: "Level N complete"
      if (betweenStage === 0) {
        ctx.font = 'bold 28px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText(`Level ${betweenFromLevel} complete`, w * 0.5, h * 0.45);
      }
      // Stage 1: Show "BONUS: XXX" below "Level N complete"
      else if (betweenStage === 1) {
        ctx.font = 'bold 28px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText(`Level ${betweenFromLevel} complete`, w * 0.5, h * 0.35);
        ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#ffd54a';
        ctx.fillText(`BONUS: ${levelBonus}`, w * 0.5, h * 0.45);
        // Show score counting up
        ctx.font = 'bold 48px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText(String(Math.floor(scoreNumericDisplay)), w * 0.5, h * 0.6);
      }
      // Stage 2: Score counting up (still showing bonus)
      else if (betweenStage === 2) {
        ctx.font = 'bold 28px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText(`Level ${betweenFromLevel} complete`, w * 0.5, h * 0.35);
        ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#ffd54a';
        ctx.fillText(`BONUS: ${levelBonus}`, w * 0.5, h * 0.45);
        // Show score counting up
        ctx.font = 'bold 48px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText(String(Math.floor(scoreNumericDisplay)), w * 0.5, h * 0.6);
      }
      // Stage 3: Pause (same as stage 2, just waiting)
      else if (betweenStage === 3) {
        ctx.font = 'bold 28px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText(`Level ${betweenFromLevel} complete`, w * 0.5, h * 0.35);
        ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#ffd54a';
        ctx.fillText(`BONUS: ${levelBonus}`, w * 0.5, h * 0.45);
        // Show final score
        ctx.font = 'bold 48px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText(String(Math.floor(scoreNumericDisplay)), w * 0.5, h * 0.6);
      }
      // Stage 4: Countdown 3..2..1
      else if (betweenStage === 4) {
        const total = 3.0;
        const t = clamp(betweenTimer, 0, total);
        const remaining = Math.max(1, Math.ceil(total - t));
        const text = String(remaining);
        const pulse = 1.0 + 0.25 * (1 - (t % 1.0));
        ctx.save();
        ctx.translate(w * 0.5, h * 0.5);
        ctx.scale(pulse, pulse);
        ctx.font = 'bold 64px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText(text, 0, 20);
        ctx.restore();
      }
      // Stage 5: Quote
      else if (betweenStage === 5) {
        ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText(currentLevelQuote, w * 0.5, h * 0.45);
      }

      ctx.restore();
    }

    // Game over overlay
    if (phase === 'gameOver') {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 32px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText('Game Over', w * 0.5, h * 0.4);

      // Show final score & hi-score
      ctx.font = '18px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText(`Score: ${Math.floor(score)}`, w * 0.5, h * 0.4 + 40);
      ctx.fillText(`Best: ${Math.floor(hiScore)}`, w * 0.5, h * 0.4 + 70);

      if (gameOverTimer >= 1.0) {
        restartBtn.w = 220;
        restartBtn.h = 48;
        restartBtn.x = w * 0.5 - restartBtn.w / 2;
        restartBtn.y = h * 0.6;
        ctx.fillStyle = '#1f8efa';
        ctx.fillRect(restartBtn.x, restartBtn.y, restartBtn.w, restartBtn.h);
        ctx.strokeStyle = '#cfe8ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(restartBtn.x, restartBtn.y, restartBtn.w, restartBtn.h);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText('Restart', w * 0.5, restartBtn.y + restartBtn.h / 2 + 6);
      }

      ctx.restore();
    }
  }

  // --- Resize ---
  function onResize() {
    ship.x = clamp(ship.x, 0, W());
    ship.y = clamp(ship.y, 0, H());
  }

  // Ensure first spawn is centered + start screen active
  hardRestartGame();

  return { update, render, onResize, onPress, onRelease };
}
