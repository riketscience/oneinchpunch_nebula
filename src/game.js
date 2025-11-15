// Simple one-touch gravity starter.
// No libraries. Tweak constants to taste.

export function createGame(canvas) {
  const W = () => canvas.clientWidth;
  const H = () => canvas.clientHeight;

  // --- Constants ---
  const TWO_PI = Math.PI * 2;
  const SHIP_RADIUS = 14;
  const SHIP_THRUST = 180;       // px/s^2 while holding
  const SHIP_DRAG = 0.98;        // velocity multiplier per frame when not thrusting
  const ROT_PERIOD = 1.2;        // seconds per full rotation
  const ANGULAR_VEL = TWO_PI / ROT_PERIOD;
  const ATTRACT_RADIUS = 220;    // px
  const GRAVITY_K = 160;         // attraction strength
  const SHIP_GRAVITY_FACTOR = 0.25; // how much ship is pulled by bodies
  const MAX_BODIES = 50;
  const SPAWN_INTERVAL = 0.9;    // seconds
  const OFFSCREEN_MARGIN = 120;  // px
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

  let bodies = []; // {x,y,vx,vy,radius,type:'coin'|'hazard'}
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
    // spawn on the edges with slight randomness
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { // top
      x = Math.random() * W(); y = -20;
    } else if (side === 1) { // right
      x = W()+20; y = Math.random() * H();
    } else if (side === 2) { // bottom
      x = Math.random() * W(); y = H()+20;
    } else { // left
      x = -20; y = Math.random() * H();
    }
    const type = Math.random() < 0.65 ? "coin" : "hazard";
    const radius = type === "coin" ? COIN_RADIUS : HAZARD_RADIUS;
    // small random drift
    const a = Math.random() * Math.PI * 2;
    const s = 20 + Math.random() * 40;
    bodies.push({
      type, radius,
      x, y,
      vx: Math.cos(a) * s * 0.2,
      vy: Math.sin(a) * s * 0.2
    });
  }

  function applyAttraction(dt) {
    const r2 = ATTRACT_RADIUS * ATTRACT_RADIUS;
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      const dx = b.x - ship.x;
      const dy = b.y - ship.y;
      const d2 = dx*dx + dy*dy;

      if (d2 < r2 && d2 > 1) {
        const d = Math.sqrt(d2);
        const ux = dx / d, uy = dy / d;
        const falloff = 1 - (d / ATTRACT_RADIUS); // 1 near, 0 at edge
        const force = GRAVITY_K * falloff;

        // Pull body toward ship
        b.vx -= ux * force * dt;
        b.vy -= uy * force * dt;

        // Optionally pull ship slightly toward body (for feel)
        ship.vx += ux * force * dt * SHIP_GRAVITY_FACTOR;
        ship.vy += uy * force * dt * SHIP_GRAVITY_FACTOR;
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
      ship.vx *= Math.pow(SHIP_DRAG, clamp(dt * 60, 0, 5));
      ship.vy *= Math.pow(SHIP_DRAG, clamp(dt * 60, 0, 5));
      ship.angle += ship.angularVel * dt;
      if (ship.angle > Math.PI) ship.angle -= Math.PI * 2;
    }

    // Attraction
    applyAttraction(dt);

    // Integrate positions
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;

    for (const b of bodies) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
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
          // simple knockback and cleanup
          ship.vx *= -0.3;
          ship.vy *= -0.3;
          // For now: reset after brief "death"
        }
      }
    }

    // Remove offscreen bodies
    const left = -OFFSCREEN_MARGIN, top = -OFFSCREEN_MARGIN;
    const right = W() + OFFSCREEN_MARGIN, bottom = H() + OFFSCREEN_MARGIN;
    bodies = bodies.filter(b => (b.x >= left && b.x <= right && b.y >= top && b.y <= bottom));
  }

  // --- API: input ---
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
    handleCollisions();
  }
  let deadTimer = 0.8;

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
      } else {
        ctx.fillStyle = '#ff5252';
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
