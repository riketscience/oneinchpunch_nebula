// Game logic
export function createGame(canvas) {
  const W = () => canvas.clientWidth;
  const H = () => canvas.clientHeight;

  // --- Constants ---
  const TWO_PI = Math.PI * 2;
  const SHIP_RADIUS = 14;
  const SHIP_THRUST = 180;          // px/s^2 while holding
  const SHIP_DRAG = 0.98;           // velocity multiplier per frame when not thrusting
  const ROT_PERIOD = 1.2;           // seconds per full rotation
  const ANGULAR_VEL = (TWO_PI / ROT_PERIOD) * 0.95; // 5% slower
  const ATTRACT_RADIUS = 220;       // px (base; bodies can scale it)
  const GRAVITY_K = 160;            // attraction strength (base)
  const SHIP_GRAVITY_FACTOR = 0.25; // how much ship is pulled by bodies
  const MAX_BODIES = 50;
  const SPAWN_INTERVAL = 1.8;       // slower spawn
  const OFFSCREEN_MARGIN = 120;     // px
  const COIN_RADIUS = 9;
  const HAZARD_RADIUS = 12;
  const OBJECT_SCALE = 0.6;         // all non-player objects radius scaled to 60%

  // --- State ---
  const ship = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    angle: -Math.PI / 2,
    angularVel: ANGULAR_VEL,
    state: "rotating", // or "thrusting"
    thrustDir: 0,
    score: 0,
    alive: true,
  };

  let bodies = []; // {x,y,vx,vy,radius,type,gravMult,attractMul,speedMul}
  let spawnTimer = 0;

  // Levels
  const levels = [
    {
      scoreGoal: 200,
      typeBoost: { coin: { grav: 1.0, speed: 1.0 }, hazard: { grav: 1.0, speed: 1.0 }, elite: { grav: 1.0, speed: 1.0 } }
    },
    {
      scoreGoal: 250,
      typeBoost: { coin: { grav: 1.1, speed: 1.1 }, hazard: { grav: 1.1, speed: 1.1 }, elite: { grav: 1.1, speed: 1.1 } }
    }
  ];
  let levelIndex = 0;

  // Phase: 'playing' | 'captured' | 'levelComplete'
  let phase = 'playing';
  let captureTimer = 0.0; // 2.5s animation
  let levelAcceptAwaitRelease = false;
  const acceptBtn = { x: 0, y: 0, w: 220, h: 48 };

  // Score & Energy
  let scoreGoal = 200;   // Level 1 requires 200 points
  let energy = 1.0;      // 1.0 = 100%

  // Wormhole
  let wormhole = null;   // {x,y,radius,angle}
  let wormholeActive = false;

  // Explosion fragments
  let fragments = [];    // {x,y,vx,vy,angle,life}

  // Respawn safety
  let respawnPending = false;
  let respawnCheckTimer = 0.0;
  let invulnTimer = 0.0; // seconds of post-respawn invulnerability

  function reset() {
    const cfg = levels[levelIndex] || levels[0];
    scoreGoal = cfg.scoreGoal;
    ship.x = W() * 0.5;
    ship.y = H() * 0.5;
    ship.vx = 0;
    ship.vy = 0;
    ship.angle = -Math.PI / 2;
    ship.state = "rotating";
    ship.thrustDir = ship.angle;
    ship.alive = true;
    ship.score = 0;
    energy = 1.0;
    spawnTimer = 0;
    wormhole = null;
    wormholeActive = false;
    fragments = [];
    respawnPending = false;
    respawnCheckTimer = 0;
  }
  reset();

  // --- Helpers ---
  function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx*dx + dy*dy; }

  function applyLevelBoost(body) {
    const cfg = levels[levelIndex] || levels[0];
    const tb = cfg.typeBoost || {};
    let key = body.type === 'coin' ? 'coin' : (body.type === 'hazard_elite' ? 'elite' : 'hazard');
    const f = tb[key] || { grav: 1.0, speed: 1.0 };
    body.gravMult = (body.gravMult || 1) * (f.grav || 1);
    body.speedMul = (body.speedMul || 1) * (f.speed || 1);
  }

  function spawnBody() {
    if (bodies.length >= MAX_BODIES) return;

    // ~78% coins, ~22% hazards
    const type = Math.random() < 0.78 ? "coin" : "hazard";
    const baseRadius = type === "coin" ? COIN_RADIUS : HAZARD_RADIUS;
    const radius = baseRadius * OBJECT_SCALE;

    // avoid spawning near current ship or where ship will be in 0.25s
    const futureT = 0.25;
    const projX = ship.x + ship.vx * futureT;
    const projY = ship.y + ship.vy * futureT;

    const SAFE_MARGIN = SHIP_RADIUS + radius + 20;

    let x, y, tries = 0;
    while (tries < 30) {
      x = Math.random() * W();
      y = Math.random() * H();

      const dxNow = x - ship.x, dyNow = y - ship.y;
      const dxFuture = x - projX, dyFuture = y - projY;
      const safeNow = (dxNow*dxNow + dyNow*dyNow) > SAFE_MARGIN * SAFE_MARGIN;
      const safeFuture = (dxFuture*dxFuture + dyFuture*dyFuture) > SAFE_MARGIN * SAFE_MARGIN;

      if (safeNow && safeFuture) break;
      tries++;
    }

    bodies.push({
      type,
      radius,
      x, y,
      vx: 0, vy: 0,  // stationary until attracted
      gravMult: 1,
      attractMul: 1,
      speedMul: 1
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
        const falloff = 1 - (d / (ATTRACT_RADIUS * (b.attractMul || 1)));
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

  // Merge pairs of red hazards on collision into a green elite (toned down + scaled)
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
          const mA = a.radius * a.radius;
          const mB = b.radius * b.radius;
          const mTot = mA + mB || 1;
          const vx = (a.vx * mA + b.vx * mB) / mTot;
          const vy = (a.vy * mA + b.vy * mB) / mTot;

          const newRadius = Math.max(a.radius, b.radius) * 1.15; // 15% bigger
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
          i = bodies.length; // restart outer scan
          break;
        }
      }
    }
  }

  function triggerExplosion() {
    if (!ship.alive) return;
    ship.alive = false;
    fragments = [];
    const pieces = 8;
    for (let i = 0; i < pieces; i++) {
      const a = (i / pieces) * Math.PI * 2;
      const speed = 160 + Math.random() * 120;
      fragments.push({
        x: ship.x, y: ship.y,
        vx: Math.cos(a) * speed + ship.vx * 0.3,
        vy: Math.sin(a) * speed + ship.vy * 0.3,
        angle: a,
        life: 0.8
      });
    }
    respawnPending = true;
    respawnCheckTimer = 0.1;
  }
  function updateFragments(dt) {
    if (fragments.length === 0) return;
    for (const f of fragments) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.life -= dt;
    }
    fragments = fragments.filter(f => f.life > 0);
  }
  function renderFragments(ctx) {
    if (fragments.length === 0) return;
    ctx.save();
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
    ctx.restore();
  }
  function isCenterSafe() {
    const cx = W() * 0.5, cy = H() * 0.5;
    for (const b of bodies) {
      const minDist = SHIP_RADIUS + b.radius;
      const dx = cx - b.x, dy = cy - b.y;
      if (dx*dx + dy*dy <= minDist * minDist) return false;
    }
    return true;
  }
  function tryRespawn(dt) {
    if (!respawnPending) return;
    respawnCheckTimer -= dt;
    if (respawnCheckTimer <= 0) {
      if (isCenterSafe()) {
        ship.x = W() * 0.5; ship.y = H() * 0.5;
        ship.vx = 0; ship.vy = 0;
        ship.state = "rotating"; ship.thrustDir = ship.angle;
        ship.alive = true;
        energy = 1.0;
        fragments = [];
        invulnTimer = 0.3;
        respawnPending = false;
      } else {
        respawnCheckTimer = 0.1;
      }
    }
  }

  function handleCollisions() {
    // Ship with bodies
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      const minDist = SHIP_RADIUS + b.radius;
      if (dist2(ship.x, ship.y, b.x, b.y) <= minDist * minDist) {
        if (invulnTimer > 0) { continue; }
        if (b.type === "coin") {
          ship.score += 10;   // +10 per coin
          bodies.splice(i, 1);
        } else {
          // Hazard hit: lose 10% energy
          energy = Math.max(0, energy - 0.10);
          ship.vx *= -0.5;
          ship.vy *= -0.5;
          if (energy <= 0 && ship.alive) triggerExplosion();
        }
      }
    }

    // Remove offscreen bodies (award +25 for hazards that leave)
const M = 8; // small margin to avoid edge flicker
const left = -M, top = -M;
const right = W() + M, bottom = H() + M;

{
  const kept = [];
  for (const b of bodies) {
    const inside = (b.x >= left && b.x <= right && b.y >= top && b.y <= bottom);
    if (inside) {
      kept.push(b);
    } else {
      if (b.type === 'hazard' || b.type === 'hazard_elite') ship.score += 25;
      // coins are just discarded silently off-screen
    }
  }
  bodies = kept;
}
  }

  // Wormhole helpers
  function spawnWormhole() {
    const inset = 60;
    const pos = { x: (ship.x < W()/2) ? (W()-inset) : inset,
                  y: (ship.y < H()/2) ? (H()-inset) : inset };
    wormhole = { x: pos.x, y: pos.y, radius: 26, angle: 0 };
    wormholeActive = true;
  }
  function updateWormhole(dt) {
    if (!wormholeActive || !wormhole) return;
    wormhole.angle += dt * 1.2;
    // Gentle pull toward wormhole
    const dx = wormhole.x - ship.x;
    const dy = wormhole.y - ship.y;
    const d2 = dx*dx + dy*dy;
    const d = Math.sqrt(d2) || 1;
    const ux = dx / d, uy = dy / d;
    const pull = 40;
    ship.vx += ux * pull * dt;
    ship.vy += uy * pull * dt;
    // Win condition: enter wormhole
    if (d <= wormhole.radius + SHIP_RADIUS * 0.8) {
      // Level complete: reset goal progress and despawn wormhole (keep bodies)
      wormholeActive = false;
      wormhole = null;
      ship.score = 0;
      energy = Math.min(1, energy + 0.25);
    }
  }
  function renderWormhole(ctx) {
    if (!wormholeActive || !wormhole) return;
    ctx.save();
    ctx.translate(wormhole.x, wormhole.y);
    ctx.rotate(wormhole.angle);
    // outer ring
    ctx.beginPath();
    ctx.arc(0, 0, wormhole.radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#88aaff';
    ctx.lineWidth = 3;
    ctx.stroke();
    // spinning arcs
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a0 = i * (Math.PI * 2 / 3);
      ctx.arc(0, 0, wormhole.radius - 6, a0, a0 + Math.PI * 0.6);
    }
    ctx.strokeStyle = '#cfe8ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // --- Input ---
  function startNextLevel() {
    levelIndex = Math.min(levelIndex + 1, levels.length - 1);
    const cfg = levels[levelIndex];
    scoreGoal = cfg.scoreGoal;
    // reset world
    bodies = [];
    wormholeActive = false;
    wormhole = null;
    fragments = [];
    energy = 1.0;
    ship.score = 0;
    ship.x = W()*0.5; ship.y = H()*0.5;
    ship.vx = 0; ship.vy = 0;
    ship.angle = -Math.PI/2;
    ship.state = 'rotating';
    phase = 'playing';
  }

  function onPress(px, py) {
    if (phase === 'levelComplete') {
      if (levelAcceptAwaitRelease) return; // must release first
      // hit test
      if (px != null && py != null) {
        const x = px; const y = py;
        if (x >= acceptBtn.x && x <= acceptBtn.x + acceptBtn.w && y >= acceptBtn.y && y <= acceptBtn.y + acceptBtn.h) {
          startNextLevel();
        }
      }
      return;
    }
    if (!ship.alive) return;
    ship.state = "thrusting";
    ship.thrustDir = ship.angle; // lock in current facing
  }
  function onRelease(px, py) {
    if (phase === 'levelComplete') { levelAcceptAwaitRelease = false; }

    if (!ship.alive) return;
    ship.state = "rotating";
  }

  // --- Update / Render ---
  let deadTimer = 0.8;

  function update(dt/*, isHeld */) {
    // Captured animation state
    if (phase === 'captured') {
      // Spin faster, shrink, move to wormhole center
      if (wormhole) {
        const dx = wormhole.x - ship.x;
        const dy = wormhole.y - ship.y;
        ship.vx = dx * 3.0; // lerp-ish
        ship.vy = dy * 3.0;
        ship.x += ship.vx * dt;
        ship.y += ship.vy * dt;
      }
      ship.angularVel = (TWO_PI / ROT_PERIOD) * 2.2; // spin up
      captureTimer -= dt;
      if (captureTimer <= 0) {
        phase = 'levelComplete';
        levelAcceptAwaitRelease = true;
      }
      // let fragments fade if any
      updateFragments(dt);
      return;
    }

    // Overlay states
    if (phase === 'captured') {
      // Draw ship scaled down toward center
      // Handled by standard ship render: we adjust with a scale factor here
    }
    if (phase === 'levelComplete') {
      // Darken screen and show message
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 28px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText('Level Complete', w * 0.5, h * 0.45);
      ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText('Level Complete', w * 0.5, h * 0.45);
ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, Arial';
ctx.fillText(levelAcceptAwaitRelease ? 'Release, then press Accept' : 'Press Accept to continue', w * 0.5, h * 0.52);
// Accept button
acceptBtn.w = 220; acceptBtn.h = 48;
acceptBtn.x = w * 0.5 - acceptBtn.w / 2;
acceptBtn.y = h * 0.6;
ctx.fillStyle = '#1f8efa';
ctx.fillRect(acceptBtn.x, acceptBtn.y, acceptBtn.w, acceptBtn.h);
ctx.strokeStyle = '#cfe8ff'; ctx.lineWidth = 2; ctx.strokeRect(acceptBtn.x, acceptBtn.y, acceptBtn.w, acceptBtn.h);
ctx.fillStyle = '#fff'; ctx.font = 'bold 18px system-ui, -apple-system, Segoe UI, Roboto, Arial';
ctx.fillText('Accept', w * 0.5, acceptBtn.y + acceptBtn.h / 2 + 6);
ctx.restore();
}

    if (!ship.alive) {
      deadTimer -= dt;
      if (deadTimer <= 0) deadTimer = 0.8;
      updateFragments(dt);
      tryRespawn(dt);
      return;
    }

    if (phase === 'levelComplete') {
      // Freeze everything (no world updates), but allow waiting for click
      updateFragments(dt);
      return;
    }

    spawnTimer += dt;
    if (spawnTimer >= SPAWN_INTERVAL) {
      spawnTimer = 0;
      spawnBody();
    }
    integrate(dt);
    handleBodyMerges();
    invulnTimer = Math.max(0, invulnTimer - dt);
    handleCollisions();

    // Wormhole logic
    if (!wormholeActive && ship.score >= scoreGoal) spawnWormhole();
    updateWormhole(dt);

    updateFragments(dt);
    tryRespawn(dt);
  }

  function render(ctx) {
    const w = W(), h = H();
    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // Wormhole behind
    renderWormhole(ctx);

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

    // Explosion fragments
    renderFragments(ctx);

    // Draw ship (triangle)
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

    // HUD: two bars, half-screen each (Energy left, Score right)
    const padding = 12;
    const gap = 8;
    const totalW = W() - padding * 2 - gap;
    const halfW = totalW * 0.5;
    const barH = 16;
    const topY = 14;

    // Energy
    {
      const x = padding;
      const y = topY;
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x, y, halfW, barH);
      const e = Math.max(0, Math.min(1, energy));
      ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x, y, halfW * e, barH);
      ctx.strokeStyle = '#666'; ctx.strokeRect(x, y, halfW, barH);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('⚡ Energy', x, y - 2);
    }

    // Score
    {
      const x = padding + halfW + gap;
      const y = topY;
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x, y, halfW, barH);
      const p = Math.max(0, Math.min(1, ship.score / scoreGoal));
      ctx.fillStyle = '#ffd54a'; ctx.fillRect(x, y, halfW * p, barH);
      ctx.strokeStyle = '#666'; ctx.strokeRect(x, y, halfW, barH);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('🪙 Score', x, y - 2);
    }

    // helper text
    ctx.fillStyle = '#bbb';
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    
    // Overlay states
    if (phase === 'captured') {
      // Draw ship scaled down toward center
      // Handled by standard ship render: we adjust with a scale factor here
    }
    if (phase === 'levelComplete') {
      // Darken screen and show message
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 28px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText('Level Complete', w * 0.5, h * 0.45);
      ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText('Level Complete', w * 0.5, h * 0.45);
ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, Arial';
ctx.fillText(levelAcceptAwaitRelease ? 'Release, then press Accept' : 'Press Accept to continue', w * 0.5, h * 0.52);
// Accept button
acceptBtn.w = 220; acceptBtn.h = 48;
acceptBtn.x = w * 0.5 - acceptBtn.w / 2;
acceptBtn.y = h * 0.6;
ctx.fillStyle = '#1f8efa';
ctx.fillRect(acceptBtn.x, acceptBtn.y, acceptBtn.w, acceptBtn.h);
ctx.strokeStyle = '#cfe8ff'; ctx.lineWidth = 2; ctx.strokeRect(acceptBtn.x, acceptBtn.y, acceptBtn.w, acceptBtn.h);
ctx.fillStyle = '#fff'; ctx.font = 'bold 18px system-ui, -apple-system, Segoe UI, Roboto, Arial';
ctx.fillText('Accept', w * 0.5, acceptBtn.y + acceptBtn.h / 2 + 6);
ctx.restore();
}

    if (!ship.alive) {
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText('Ouch! Respawning...', w * 0.5, h * 0.5);
    }
  }

  function onResize() {
    ship.x = clamp(ship.x, 0, W());
    ship.y = clamp(ship.y, 0, H());
  }

  return { update, render, onResize, onPress, onRelease };
}
