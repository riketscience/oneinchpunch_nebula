// Simple one-touch gravity starter with merges and wall bounce.
// No libraries. Tweak constants to taste.

export function createGame(canvas) {
  const W = () => canvas.clientWidth;
  const H = () => canvas.clientHeight;

  // --- Constants ---
  const TWO_PI = Math.PI * 2;
  const SHIP_RADIUS = 14;
  const SHIP_THRUST = 180;         // px/s^2 while holding
  const SHIP_DRAG = 0.98;          // velocity multiplier per frame when not thrusting
  const ROT_PERIOD = 1.2;          // seconds per full rotation
  const ANGULAR_VEL = TWO_PI / ROT_PERIOD;
  const ATTRACT_RADIUS = 220;      // px (base; bodies can scale it)
  const GRAVITY_K = 160;           // attraction strength (base)
  const SHIP_GRAVITY_FACTOR = 0.25;// how much ship is pulled by bodies
  const MAX_BODIES = 50;
  const SPAWN_INTERVAL = 1.8;      // seconds (slower spawn)
  const OFFSCREEN_MARGIN = 120;    // px
  const COIN_RADIUS = 9;
  const HAZARD_RADIUS = 12;

  // --- State ---
  const ship = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    angle: -Math.PI / 2, // facing up initially
    angularVel: ANGULAR_VEL,
    state: "rotating", // or "thrusting"
    thrustDir: 0,
    score: 0,
    alive: true,
  };

  let bodies = []; // {x,y,vx,vy,radius,type,gravMult,attractMul,speedMul}
  let spawnTimer = 0;

  function reset() {
    ship.x = W() * 0.5;
    ship.y = H() * 0.5;
    ship.vx = 0;
    ship.vy = 0;
    ship.angle = -Math.PI / 2;
    ship.state = "rotating";
    ship.thrustDir = ship.angle;
    ship.score = 0;
    ship.alive = true;
    bodies = [];
    spawnTimer = 0;
  }
  reset();

  // --- Helpers ---
  function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx*dx + dy*dy; }

  function spawnBody() {
    if (bodies.length >= MAX_BODIES) return;
    // Spawn inside the current viewport at random position; stationary until attracted
    const x = Math.random() * W();
    const y = Math.random() * H();
    // ~25% coins, ~75% hazards
    const type = Math.random() < 0.25 ? "coin" : "hazard";
    const radius = type === "coin" ? COIN_RADIUS : HAZARD_RADIUS;
    bodies.push({
      type, radius,
      x, y,
      vx: 0, vy: 0,
      gravMult: 1,     // scales GRAVITY_K strength on this body
      attractMul: 1,   // scales ATTRACT_RADIUS reach on this body
      speedMul: 1      // scales how strongly velocity responds to attraction
    });
  }

  function applyAttraction(dt) {
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      const localRadius = ATTRACT_RADIUS * (b.attractMul || 1);
      const r2 = localRadius * localRadius;

      const dx = b.x - ship.x;
      const dy = b.y - ship.y;
      const d2 = dx*dx + dy*dy;

      if (d2 < r2 && d2 > 1) {
        const d = Math.sqrt(d2);
        const ux = dx / d, uy = dy / d;
        const falloff = 1 - (d / (ATTRACT_RADIUS * (b.attractMul || 1))); // 1 near, 0 at edge
        const force = GRAVITY_K * falloff * (b.gravMult || 1);

        // Pull body toward ship, scaled by speed multiplier
        b.vx -= ux * force * dt * (b.speedMul || 1);
        b.vy -= uy * force * dt * (b.speedMul || 1);

        // Ship pulled proportionally to body strength
        ship.vx += ux * force * dt * SHIP_GRAVITY_FACTOR * (b.gravMult || 1);
        ship.vy += uy * force * dt * SHIP_GRAVITY_FACTOR * (b.gravMult || 1);
      }
    }
  }

  function integrate(dt) {
    // Ship thrust / rotation
    if (ship.state === "thrusting") {
      ship.vx += Math.cos(ship.thrustDir) * SHIP_THRUST * dt;
      ship.vy += Math.sin(ship.thrustDir) * SHIP_THRUST * dt;
    } else {
      // Apply drag (fake space friction)
      const frames = clamp(dt * 60, 0, 5);
      ship.vx *= Math.pow(SHIP_DRAG, frames);
      ship.vy *= Math.pow(SHIP_DRAG, frames);
      ship.angle += ship.angularVel * dt;
      if (ship.angle > Math.PI) ship.angle -= Math.PI * 2;
    }

    // Attraction
    applyAttraction(dt);

    // Integrate positions
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;

    // Wall bounce with 5% velocity loss on impact
    const minX = SHIP_RADIUS, maxX = W() - SHIP_RADIUS;
    const minY = SHIP_RADIUS, maxY = H() - SHIP_RADIUS;
    const BOUNCE_DAMP = 0.95;

    if (ship.x < minX) { ship.x = minX; ship.vx = -ship.vx * BOUNCE_DAMP; }
    if (ship.x > maxX) { ship.x = maxX; ship.vx = -ship.vx * BOUNCE_DAMP; }
    if (ship.y < minY) { ship.y = minY; ship.vy = -ship.vy * BOUNCE_DAMP; }
    if (ship.y > maxY) { ship.y = maxY; ship.vy = -ship.vy * BOUNCE_DAMP; }

    for (const b of bodies) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
  }

  // Merge pairs of red hazards on collision into a green elite
  function handleBodyMerges() {
    for (let i = bodies.length - 1; i >= 0; i--) {
      const a = bodies[i];
      if (a.type !== 'hazard') continue;
      for (let j = i - 1; j >= 0; j--) {
        const b = bodies[j];
        if (b.type !== 'hazard') continue;
        const minDist = a.radius + b.radius;
        const dx = a.x - b.x, dy = a.y - b.y;
        if (dx*dx + dy*dy <= minDist * minDist) {
          // masses proportional to area (radius^2)
          const mA = a.radius * a.radius;
          const mB = b.radius * b.radius;
          const mTot = mA + mB || 1;
          // combined momentum => velocity
          const vx = (a.vx * mA + b.vx * mB) / mTot;
          const vy = (a.vy * mA + b.vy * mB) / mTot;

          // New green elite properties
          const newRadius = Math.max(a.radius, b.radius) * 1.15; // 15% bigger than larger parent
          const green = {
            type: 'hazard_elite',
            radius: newRadius,
            x: (a.x * mA + b.x * mB) / mTot,
            y: (a.y * mA + b.y * mB) / mTot,
            // 60% faster than reds
            vx: vx * 1.6,
            vy: vy * 1.6,
            // stronger + farther attraction
            gravMult: 1.6,
            attractMul: 1.4,
            speedMul: 1.6
          };

          // Remove the originals and add the green
          bodies.splice(i, 1);
          bodies.splice(j, 1);
          bodies.push(green);
          // restart outer loop since indices changed
          i = bodies.length; // will -- at loop top
          break;
        }
      }
    }
  }

  function handleCollisions() {
    // Ship with bodies
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      const minDist = SHIP_RADIUS + b.radius;
      if (dist2(ship.x, ship.y, b.x, b.y) <= minDist * minDist) {
        if (b.type === "coin") {
          ship.score += 1;
          bodies.splice(i, 1);
        } else {
          ship.alive = false;
          // simple knockback
          ship.vx *= -0.3;
          ship.vy *= -0.3;
        }
      }
    }

    // Remove offscreen bodies
    const left = -OFFSCREEN_MARGIN, top = -OFFSCREEN_MARGIN;
    const right = W() + OFFSCREEN_MARGIN, bottom = H() + OFFSCREEN_MARGIN;
    bodies = bodies.filter(b => (b.x >= left && b.x <= right && b.y >= top && b.y <= bottom));
  }

  // --- Input ---
  function onPress() {
    if (!ship.alive) return;
    ship.state = "thrusting";
    ship.thrustDir = ship.angle; // lock in current facing
  }
  function onRelease() {
    if (!ship.alive) return;
    ship.state = "rotating";
  }

  // --- Update / Render ---
  let deadTimer = 0.8;

  function update(dt/*, isHeld */) {
    if (!ship.alive) {
      // quick respawn timer
      deadTimer -= dt;
      if (deadTimer <= 0) reset();
      return;
    }
    spawnTimer += dt;
    if (spawnTimer >= SPAWN_INTERVAL) {
      spawnTimer = 0;
      spawnBody();
    }
    integrate(dt);
    handleBodyMerges();   // merge red hazards into green elites
    handleCollisions();   // ship collisions + GC
  }

  function render(ctx) {
    const w = W(), h = H();
    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // Draw attraction radius (debug/feel)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.beginPath();
    ctx.arc(ship.x, ship.y, ATTRACT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#88f';
    ctx.fill();
    ctx.restore();

    // Draw bodies
    for (const b of bodies) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      if (b.type === 'coin') {
        ctx.fillStyle = '#ffd54a';
      } else if (b.type === 'hazard_elite') {
        ctx.fillStyle = '#00ff66'; // bright green
      } else {
        ctx.fillStyle = '#ff5252'; // red hazard
      }
      ctx.fill();
    }

    // Draw ship (triangle)
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.state === "thrusting" ? ship.thrustDir : ship.angle);
    ctx.beginPath();
    ctx.moveTo(SHIP_RADIUS, 0);
    ctx.lineTo(-SHIP_RADIUS * 0.7, SHIP_RADIUS * 0.6);
    ctx.lineTo(-SHIP_RADIUS * 0.4, 0);
    ctx.lineTo(-SHIP_RADIUS * 0.7, -SHIP_RADIUS * 0.6);
    ctx.closePath();
    ctx.fillStyle = ship.alive ? '#cfe8ff' : '#777';
    ctx.fill();

    // Thrust flame (if thrusting)
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

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Score: ' + ship.score, 12, 22);
    ctx.textAlign = 'right';
    ctx.fillText('Hold: thrust | Release: rotate', W() - 12, 22);

    if (!ship.alive) {
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText('Ouch! Respawning...', w * 0.5, h * 0.5);
    }
  }

  function onResize() {
    // Keep ship inside bounds if window resized dramatically
    ship.x = clamp(ship.x, 0, W());
    ship.y = clamp(ship.y, 0, H());
  }

  return { update, render, onResize, onPress, onRelease };
}
