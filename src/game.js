export function createGame(canvas) {
  const W = () => canvas.clientWidth;
  const H = () => canvas.clientHeight;

  // --- Constants ---
  const TWO_PI = Math.PI * 2;
  const SHIP_RADIUS = 14;
  const SHIP_THRUST = 180;
  const SHIP_DRAG = 0.98;
  const ROT_PERIOD = 1.2;
  const ANGULAR_VEL = (TWO_PI / ROT_PERIOD) * 0.95;
  const ATTRACT_RADIUS = 220;
  const GRAVITY_K = 160;
  const SHIP_GRAVITY_FACTOR = 0.25;
  const MAX_BODIES = 50;
  const SPAWN_INTERVAL = 1.8;
  const COIN_RADIUS = 9;
  const HAZARD_RADIUS = 12;
  const OBJECT_SCALE = 0.6;

  // --- State ---
  const ship = {
    x: 0, y: 0, vx: 0, vy: 0,
    angle: -Math.PI / 2,
    angularVel: ANGULAR_VEL,
    state: "rotating",
    thrustDir: 0,
    score: 0,
    alive: true,
  };

// Background image
const bgImage = new Image();
// NOTE: adjust extension if your file is e.g. .jpg instead of .png
bgImage.src = '/images/backg_main.jpg';
let bgReady = false;
bgImage.onload = () => { bgReady = true; };


  let bodies = []; // {x,y,vx,vy,radius,type,gravMult,attractMul,speedMul}
  let spawnTimer = 0;

  // Levels
  const levels = [
    { scoreGoal: 200, typeBoost: { coin: { grav: 1.0, speed: 1.0 }, hazard: { grav: 1.0, speed: 1.0 }, elite: { grav: 1.0, speed: 1.0 } } },
    { scoreGoal: 250, typeBoost: { coin: { grav: 1.1, speed: 1.1 }, hazard: { grav: 1.1, speed: 1.1 }, elite: { grav: 1.1, speed: 1.1 } } }
  ];
  let levelIndex = 0;
  let scoreGoal = levels[levelIndex].scoreGoal;

  // Phase: 'playing' | 'captured' | 'betweenLevels'
  let phase = 'playing';
  let captureTimer = 0.0; // 2.5s
  let betweenTimer = 0.0;
  let betweenStage = 0; // 0: level complete, 1: get ready, 2: countdown
  let betweenFromLevel = 1;
  let betweenToLevel = 2;

  // Energy & respawn/invulnerability
  let energy = 1.0;
  let fragments = [];
  let respawnPending = false;
  let respawnCheckTimer = 0.0;
  let invulnTimer = 0.0;
  let respawnCooldown = 0.0; // minimum time before attempting respawn

  function reset() {
    scoreGoal = levels[levelIndex].scoreGoal;
    ship.x = W() * 0.5; ship.y = H() * 0.5;
    ship.vx = 0; ship.vy = 0;
    ship.angle = -Math.PI / 2;
    ship.state = "rotating";
    ship.thrustDir = ship.angle;
    ship.alive = true;
    ship.score = 0;
    energy = 1.0;
    spawnTimer = 0;
    fragments = [];
    respawnPending = false;
    respawnCheckTimer = 0;
    invulnTimer = 0;
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
    const type = Math.random() < 0.78 ? "coin" : "hazard";
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
      const dxNow = x - ship.x, dyNow = y - ship.y;
      const dxFuture = x - projX, dyFuture = y - projY;
      const safeNow = (dxNow*dxNow + dyNow*dyNow) > SAFE_MARGIN * SAFE_MARGIN;
      const safeFuture = (dxFuture*dxFuture + dyFuture*dyFuture) > SAFE_MARGIN * SAFE_MARGIN;
      if (safeNow && safeFuture) break;
      tries++;
    }

    const body = { type, radius, x, y, vx: 0, vy: 0, gravMult: 1, attractMul: 1, speedMul: 1 };
    applyLevelBoost(body);
    bodies.push(body);
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
      if (ship.angle > Math.PI) ship.angle -= Math.PI * 2;
    }

    applyAttraction(dt);

    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;

    const minX = SHIP_RADIUS, maxX = W() - SHIP_RADIUS;
    const minY = SHIP_RADIUS, maxY = H() - SHIP_RADIUS;
    const BOUNCE_DAMP = 0.95;
    if (ship.x < minX) { ship.x = minX; ship.vx = -ship.vx * BOUNCE_DAMP; }
    if (ship.x > maxX) { ship.x = maxX; ship.vx = -ship.vx * BOUNCE_DAMP; }
    if (ship.y < minY) { ship.y = minY; ship.vy = -ship.vy * BOUNCE_DAMP; }
    if (ship.y > maxY) { ship.y = maxY; ship.vy = -ship.vy * BOUNCE_DAMP; }

    for (const b of bodies) { b.x += b.vx * dt; b.y += b.vy * dt; }
  }

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
          const mA = a.radius * a.radius, mB = b.radius * b.radius;
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

  function triggerExplosion() {
    if (!ship.alive) return;
    ship.alive = false;
    fragments = [];
    const pieces = 8;
    for (let i = 0; i < pieces; i++) {
      const a = (i / pieces) * TWO_PI;
      const speed = 160 + Math.random() * 120;
      fragments.push({ x: ship.x, y: ship.y, vx: Math.cos(a)*speed + ship.vx*0.3, vy: Math.sin(a)*speed + ship.vy*0.3, angle: a, life: 0.8 });
    }
    respawnPending = true;
    respawnCooldown = 1.2;   // wait at least 1.2s before attempting respawn
    respawnCheckTimer = 0.1;
  }
  function updateFragments(dt) {
    if (fragments.length === 0) return;
    for (const f of fragments) { f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt; }
    fragments = fragments.filter(f => f.life > 0);
  }
  function renderFragments(ctx) {
    if (fragments.length === 0) return;
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
    const extraPad = 8; // extra safety margin
    for (const b of bodies) {
      const minDist = SHIP_RADIUS + b.radius + extraPad;
      const dx = cx - b.x, dy = cy - b.y;
      if (dx*dx + dy*dy <= minDist * minDist) return false;
    }
    return true;
  }
  function tryRespawn(dt) {
    if (!respawnPending) return;
    // Wait minimum cooldown before attempting safe respawn
    if (respawnCooldown > 0) { respawnCooldown -= dt; return; }
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
        if (invulnTimer > 0) continue;
        if (b.type === "coin") {
          ship.score += 10;
          bodies.splice(i, 1);
        } else {
          // Enemy hit: remove enemy immediately and apply damage once
          bodies.splice(i, 1);
          energy = Math.max(0, energy - 0.10);
          // mild knockback for feedback
          ship.vx *= -0.4; ship.vy *= -0.4;
          if (energy <= 0 && ship.alive) triggerExplosion();
          break; // ensure only one enemy hit is processed this frame
        }
      }
    }

    // Remove offscreen bodies (score hazards immediately on leaving view)
    const M = 8;
    const left = -M, top = -M;
    const right = W() + M, bottom = H() + M;
    const kept = [];
    for (const b of bodies) {
      const inside = (b.x >= left && b.x <= right && b.y >= top && b.y <= bottom);
      if (inside) kept.push(b);
      else if (b.type === 'hazard' || b.type === 'hazard_elite') ship.score += 25;
    }
    bodies = kept;
  }

  function spawnWormhole() {
    const inset = 60;
    const pos = { x: (ship.x < W()/2) ? (W()-inset) : inset, y: (ship.y < H()/2) ? (H()-inset) : inset };
    wormhole = { x: pos.x, y: pos.y, radius: 26, angle: 0 };
    wormholeActive = true;
  }
  function updateWormhole(dt) {
    if (!wormholeActive || !wormhole) return;
    wormhole.angle += dt * 1.2;
    const dx = wormhole.x - ship.x;
    const dy = wormhole.y - ship.y;
    const d2 = dx*dx + dy*dy;
    const d = Math.sqrt(d2) || 1;
    const ux = dx / d, uy = dy / d;
    const pull = 90;
    ship.vx += ux * pull * dt;
    ship.vy += uy * pull * dt;
    if (d <= wormhole.radius + SHIP_RADIUS * 0.8 && phase === 'playing') {
      phase = 'captured';
      captureTimer = 2.5;
      ship.state = 'rotating';
    }
  }
  function renderWormhole(ctx) {
    if (!wormholeActive || !wormhole) return;
    ctx.save();
    ctx.translate(wormhole.x, wormhole.y);
    ctx.rotate(wormhole.angle);
    ctx.beginPath();
    ctx.arc(0, 0, wormhole.radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#88aaff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a0 = i * (Math.PI * 2 / 3);
      ctx.arc(0, 0, wormhole.radius - 6, a0, a0 + Math.PI * 0.6);
    }
    ctx.strokeStyle = '#cfe8ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  // Wormhole/levels state
  let wormhole = null;
  let wormholeActive = false;

  // --- Input ---
  function startNextLevel() {
    levelIndex = Math.min(levelIndex + 1, levels.length - 1);
    const cfg = levels[levelIndex];
    scoreGoal = cfg.scoreGoal;
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

  // --- Update / Render ---
  let deadTimer = 0.8;

  function update(dt) {

    if (phase === 'captured') {
            if (wormhole) {
        const dx = wormhole.x - ship.x, dy = wormhole.y - ship.y;
        ship.vx = dx * 3.0; ship.vy = dy * 3.0;
        ship.x += ship.vx * dt; ship.y += ship.vy * dt;
      }
      // Spin up rotation on capture (same across levels)
      ship.angularVel = (TWO_PI / ROT_PERIOD) * 2.2;
      captureTimer -= dt;
      if (captureTimer <= 0) {
        phase = 'betweenLevels';
        betweenTimer = 0.0;
        betweenStage = 0;
        betweenFromLevel = levelIndex + 1;
        betweenToLevel = Math.min(levelIndex + 2, levels.length);
      }
      updateFragments(dt);
      return;
    }

    if (!ship.alive) {
      deadTimer -= dt; if (deadTimer <= 0) deadTimer = 0.8;
      updateFragments(dt);
      tryRespawn(dt);
      return;
    }

    if (phase === 'betweenLevels') {
      // Level transition flow: Level N complete -> Level M get ready -> 3..2..1
      betweenTimer += dt;
      if (betweenStage === 0 && betweenTimer >= 1.5) {
        betweenStage = 1;
        betweenTimer = 0.0;
      } else if (betweenStage === 1 && betweenTimer >= 1.5) {
        betweenStage = 2;
        betweenTimer = 0.0;
      } else if (betweenStage === 2 && betweenTimer >= 3.0) {
        // After countdown, start next level
        startNextLevel();
        return;
      }
      updateFragments(dt);
      return;
    }

    spawnTimer += dt;
    if (spawnTimer >= SPAWN_INTERVAL) { spawnTimer = 0; spawnBody(); }

    integrate(dt);
    handleBodyMerges();
    invulnTimer = Math.max(0, invulnTimer - dt);
    handleCollisions();

    if (!wormholeActive && ship.score >= scoreGoal) spawnWormhole();
    updateWormhole(dt);

    updateFragments(dt);
    tryRespawn(dt);
  }

  function render(ctx) {
const w = W(), h = H();
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, w, h);
if (bgReady) {
  ctx.save();
  ctx.globalAlpha = 0.5; // darken ~50%
  ctx.drawImage(bgImage, 0, 0, w, h);
  ctx.restore();
}

    renderWormhole(ctx);

    for (const b of bodies) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      if (b.type === 'coin') ctx.fillStyle = '#ffd54a';
      else if (b.type === 'hazard_elite') ctx.fillStyle = '#00ff66';
      else ctx.fillStyle = '#ff5252';
      ctx.fill();
    }

    renderFragments(ctx);

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

    // HUD bars side-by-side
    const padding = 12, gap = 8;
    const totalW = w - padding * 2 - gap;
    const halfW = totalW * 0.5;
    const barH = 16;
    const topY = 14;

    // Energy
    {
      const x = padding, y = topY;
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
      const x = padding + halfW + gap, y = topY;
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x, y, halfW, barH);
      const p = Math.max(0, Math.min(1, ship.score / scoreGoal));
      ctx.fillStyle = '#ffd54a'; ctx.fillRect(x, y, halfW * p, barH);
      ctx.strokeStyle = '#666'; ctx.strokeRect(x, y, halfW, barH);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('🪙 Score', x, y - 2);
    }

    // Overlay: between-level messages + countdown
    if (phase === 'betweenLevels') {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';

      if (betweenStage === 0) {
        ctx.font = 'bold 28px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText(`Level ${betweenFromLevel} complete`, w * 0.5, h * 0.45);
      } else if (betweenStage === 1) {
        ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText(`Level ${betweenToLevel} get ready`, w * 0.5, h * 0.45);
      } else if (betweenStage === 2) {
        const total = 3.0;
        const t = Math.max(0, Math.min(total, betweenTimer));
        const remaining = Math.max(1, Math.ceil(total - t)); // 3..2..1
        const text = String(remaining);
        const pulse = 1.0 + 0.25 * (1 - (t % 1.0)); // simple scale pulse
        ctx.save();
        ctx.translate(w * 0.5, h * 0.5);
        ctx.scale(pulse, pulse);
        ctx.font = 'bold 64px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText(text, 0, 20);
        ctx.restore();
      }

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
    ship.x = Math.max(0, Math.min(W(), ship.x));
    ship.y = Math.max(0, Math.min(H(), ship.y));
  }

  return { update, render, onResize, onPress, onRelease };
}
