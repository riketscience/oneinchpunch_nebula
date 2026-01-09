import { submitHighScore, fetchHighScores } from './supabaseClient.js';
import {
  game_title,
  test_vars,
  TWO_PI,
  SHIP_RADIUS,
  ANGULAR_VEL,
  HUD_SAFE_BOTTOM,
  SPAWN_INTERVAL,
  DEFAULT_HEALTH_FREQUENCY,
  ENEMY_DAMAGE,
  HEAL_FLASH_TOTAL,
  levelStartQuotes,
  levels,
  isLocalDev
} from './game/config.js';
import { initMaze, renderMaze, checkMazeCollision, getMazeData, spawnMazeItems, clearMaze, applyAttractorWallForce } from './game/maze.js';
import {
  applyAttraction,
  integrate,
  handleBodyMerges,
  handleHealthHazardCollisions,
  handleCollisions as physicsHandleCollisions,
} from './game/physics.js';
import { spawnBody, spawnHealthPickup } from './game/entities.js';

export function createGame(canvas) {
  const W = () => canvas.clientWidth;
  const H = () => canvas.clientHeight;

  let lastW = Math.max(1, W());
  let lastH = Math.max(1, H());

  // Hidden input for mobile keyboard support
  const nameInputEl = document.getElementById('nameInput');

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

  // --- Ice patches (created by ice stars) ---
  let icePatches = [];
  let shipFrozen = false;
  let frozenVelocity = { vx: 0, vy: 0 }; // Ship's velocity when it entered ice

  // --- Reverse spin effect (from orange hazard) ---
  let reverseSpinTimer = 0; // Time remaining for reverse spin effect

  // --- Level state ---
  let levelIndex = test_vars.START_LEVEL || 0;
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
  let captureStartWarpScore = 0; // Store warp score at start of capture for animation
  let betweenTimer = 0.0;
  let betweenStage = 0;
  let betweenFromLevel = 1;
  let betweenToLevel = 2;
  let currentLevelQuote = '';
  let startCountdownTimer = 0.0;
  let startCountdownStage = 0;
  let levelBonus = 0;
  let bonusDisplay = 0; // animated bonus countdown (starts at levelBonus, goes to 0)
  let bonusApplied = false;

  // --- Maze timer (for testing/stats) ---
  let mazeTimer = 60.0; // Stopwatch for maze completion time

  // --- Energy, lives, respawn, hit feedback ---
  let energy = !test_vars.test_DEATH ? 1.0 : 0.3;
  let lives = !test_vars.test_DEATH ? 2 : 1; // extra lives (3 total: current + 2 icons)
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
  let hitFlashColor = 'rgba(255,60,60,'; // default red, can be green for elite
  let healFlashTimer = 0.0;

  // --- Game over state ---
  let gameOverTimer = 0.0;
  const restartBtn = { x: 0, y: 0, w: 220, h: 48 };
  const startBtn = { x: 0, y: 0, w: 240, h: 56 };

  // --- High score entry state ---
  let showNameEntry = false;
  let playerName = '';
  let nameEntryShowTime = 0; // timestamp when name entry appears
  let isSubmittingScore = false; // prevent duplicate submissions
  const submitNameBtn = { x: 0, y: 0, w: 180, h: 44 };
  const skipBtn = { x: 0, y: 0, w: 140, h: 44 };
  let nameEntryWobble = 0; // Wobble offset for form validation feedback
  const MAX_NAME_LENGTH = 15;

  // --- Wormhole state ---
  let wormhole = null;
  let wormholeActive = false;

  // --- Online high scores ---
  let highScores = [];        // fetched from Supabase
  let nameEntryProcessed = false; // Track if we've checked for top 10
  let lastSubmittedName = ''; // Track the name we just submitted to highlight in leaderboard

  // --- Helpers ---
  function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  function getOrdinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

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

    // Reset game state first
    spawnTimer = 0;
    healthSpawnTimer = 0;
    fragments = [];
    respawnPending = false;
    respawnCheckTimer = 0;
    invulnTimer = 0;
    wormholeActive = false;
    wormhole = null;
    bodies = [];
    icePatches = []; // Clear ice patches
    shipFrozen = false; // Unfreeze ship
    warpScore = 0;
    scoreDisplay = warpScore;
    mazeTimer = 60.0; // Reset maze timer

    // Initialize maze first if this is a maze level (needed for ship positioning)
    if (cfg.type === 'maze' && cfg.mazeConfig) {
      initMaze(cfg.mazeConfig, W, H);
      const mazeData = getMazeData();
      // Position ship at entry position
      ship.x = mazeData.width * (mazeData.startX + mazeData.entryCol * mazeData.cellW + mazeData.cellW * 0.5);
      ship.y = mazeData.height * (mazeData.startY + mazeData.entryRow * mazeData.cellH + mazeData.cellH * 0.5);
      // Spawn maze items (health packs, etc.)
      spawnMazeItems(bodies, W, H);
      // Spawn exit vortex immediately for maze levels (after wormhole vars are reset)
      spawnWormhole();
    } else {
      // Clear maze walls when transitioning to non-maze level
      clearMaze();
      ship.x = W() * 0.5;
      ship.y = H() * 0.5;
    }

    ship.vx = 0; ship.vy = 0;
    ship.angle = -Math.PI / 2;
    ship.state = "rotating";
    ship.thrustDir = ship.angle;
    ship.alive = true;
  }

  async function loadHighScores() {
    try {
      highScores = await fetchHighScores(10);
    } catch (e) {
      console.error('Failed to load high scores:', e);
    }
  }

  function hardRestartGame() {
    levelIndex = test_vars.START_LEVEL || 0;
    energyDisplay = energy;

    // New run: reset both global score and warp
    score = 0;
    warpScore = 0;
    scoreDisplay = 0;
    scoreNumericDisplay = 0;
    scoreLocked = false;
    nameEntryProcessed = false;
    showNameEntry = false;
    lastSubmittedName = ''; // Clear highlighted name

    hitFlashTimer = 0;
    healFlashTimer = 0;

    resetShipForLevel();
    phase = 'start';
    gameOverTimer = 0;

    // Load leaderboard for display on Game Over screen
    loadHighScores();
  }

  function softRestartGame() {
    levelIndex = test_vars.START_LEVEL || 0;
    energyDisplay = energy;

    // New run: reset both global score and warp
    score = 0;
    warpScore = 0;
    scoreDisplay = 0;
    scoreNumericDisplay = 0;
    scoreLocked = false;
    nameEntryProcessed = false;
    showNameEntry = false;
    lastSubmittedName = ''; // Clear highlighted name

    hitFlashTimer = 0;
    healFlashTimer = 0;

    resetShipForLevel();

    // Skip countdown and quote when running locally
    if (isLocalDev()) {
      phase = 'playing';
    } else {
      // Pick a random quote for game start
      currentLevelQuote = levelStartQuotes[Math.floor(Math.random() * levelStartQuotes.length)];
      phase = 'startCountdown';
      startCountdownTimer = 0.0;
      startCountdownStage = 0;
    }

    gameOverTimer = 0;

    // Load leaderboard for display on Game Over screen
    loadHighScores();
  }

  function showNameEntryForm() {
    showNameEntry = true;
    playerName = '';
    nameEntryShowTime = performance.now();

    // Focus hidden input to trigger mobile keyboard
    if (nameInputEl) {
      nameInputEl.value = '';
      setTimeout(() => {
        nameInputEl.focus();
      }, 100);
    }
  }

  async function submitNameAndScore() {
    // Prevent duplicate submissions
    if (isSubmittingScore) return;
    isSubmittingScore = true;

    if (!playerName || playerName.trim() === '') {
      playerName = 'Pilot';
    }

    try {
      await submitHighScore(playerName.trim(), score);
      highScores = await fetchHighScores(10);
      // Store the submitted name to highlight in leaderboard
      lastSubmittedName = playerName.trim();
    } catch (e) {
      console.error('Failed to submit high score:', e);
    }

    showNameEntry = false;
    isSubmittingScore = false;

    // Blur hidden input to hide mobile keyboard
    if (nameInputEl) {
      nameInputEl.blur();
    }
  }

  function skipNameEntry() {
    showNameEntry = false;

    // Blur hidden input to hide mobile keyboard
    if (nameInputEl) {
      nameInputEl.blur();
    }
  }

  // --- Gravity / movement (imported from physics.js) ---
  // --- Physics functions (imported from physics.js) ---
  // applyAttraction, integrate, handleBodyMerges, handleHealthHazardCollisions,
  // circleHitsShip, handleCollisions - all in physics.js

  // --- Explosion / respawn / lives ---
  function triggerExplosion() {
    if (!ship.alive) return;

    // Ensure energy and bar are visually zero when exploding
    energy = 0;
    energyDisplay = 0;
    reverseSpinTimer = 0;
    ship.angularVel = ANGULAR_VEL;

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

      // Clear all bodies and ice patches from playfield so they don't show behind game over screen
      bodies = [];
      icePatches = [];
      shipFrozen = false;

      // Don't submit score immediately - wait for death animation (2s)
      // submitScoreIfNeeded will be called after delay in update loop
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
    // For maze levels, check entry position; otherwise check center
    const currentLevel = levels[levelIndex] || levels[0];
    let cx, cy;

    if (currentLevel.type === 'maze') {
      const mazeData = getMazeData();
      cx = mazeData.width * (mazeData.startX + mazeData.entryCol * mazeData.cellW + mazeData.cellW * 0.5);
      cy = mazeData.height * (mazeData.startY + mazeData.entryRow * mazeData.cellH + mazeData.cellH * 0.5);
    } else {
      cx = W() * 0.5;
      cy = H() * 0.5;
    }

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
        // For maze levels, respawn at entry position; otherwise respawn at center
        const currentLevel = levels[levelIndex] || levels[0];

        if (currentLevel.type === 'maze') {
          const mazeData = getMazeData();
          ship.x = mazeData.width * (mazeData.startX + mazeData.entryCol * mazeData.cellW + mazeData.cellW * 0.5);
          ship.y = mazeData.height * (mazeData.startY + mazeData.entryRow * mazeData.cellH + mazeData.cellH * 0.5);
        } else {
          ship.x = W() * 0.5;
          ship.y = H() * 0.5;
        }

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


  // --- Wormhole ---
  function spawnWormhole() {
    const currentLevel = levels[levelIndex] || levels[0];

    if (currentLevel.type === 'maze') {
      // Maze level: Spawn mini vortex in exit square (bottom-left)
      // Center of cell [exitCol, exitRow]
      const mazeData = getMazeData();
      // Use current W()/H() instead of stored dimensions to avoid race condition
      const w = W();
      const h = H();
      const wx = w * (mazeData.startX + mazeData.exitCol * mazeData.cellW + mazeData.cellW * 0.5);
      const wy = h * (mazeData.startY + mazeData.exitRow * mazeData.cellH + mazeData.cellH * 0.5);
      console.log(`Vortex at cell[${mazeData.exitCol},${mazeData.exitRow}]: (${wx.toFixed(1)}, ${wy.toFixed(1)})`);
      console.log(`Cell size: ${(w * mazeData.cellW).toFixed(1)}x${(h * mazeData.cellH).toFixed(1)}`);
      wormhole = { x: wx, y: wy, radius: 30, angle: 0 }; // Smaller radius for maze
      wormholeActive = true;
    } else {
      // Normal level: Spawn in opposite corner from ship
      const inset = 60;
      let wx = ship.x < W() / 2 ? W() - inset : inset;
      let wy = ship.y < H() / 2 ? H() - inset : inset;

      // If spawning in a top corner, push it down just below HUD with padding
      const vortexPadding = 40;
      if (wy < HUD_SAFE_BOTTOM + vortexPadding) {
        wy = HUD_SAFE_BOTTOM + vortexPadding / 2;
      }

      wormhole = { x: wx, y: wy, radius: 22, angle: 0 };
      wormholeActive = true;
    }
  }

  function updateWormhole(dt) {
    if (!wormholeActive || !wormhole) return;
    wormhole.angle += dt * 1.2; // used as phase for ripples too
    const dx = wormhole.x - ship.x;
    const dy = wormhole.y - ship.y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2) || 1;

    // Maze levels: No pull, just check proximity for capture
    const currentLevel = levels[levelIndex] || levels[0];
    if (currentLevel.type === 'maze') {
      // Enter vortex when within 1/3 of ship's length
      if (d <= SHIP_RADIUS * 2 && phase === 'playing') {
        phase = 'captured';
        captureTimer = 2.5;
        captureStartWarpScore = warpScore; // Store for animation
        ship.state = 'rotating';
        scoreLocked = true;
        scoreNumericDisplay = score;
        console.log(`Maze completed in ${mazeTimer.toFixed(2)}s`);
      }
    } else {
      // Normal levels: Pull ship towards vortex
      const ux = dx / d, uy = dy / d;
      const pull = 90;
      ship.vx += ux * pull * dt;
      ship.vy += uy * pull * dt;
      if (d <= wormhole.radius + SHIP_RADIUS * 0.8 && phase === 'playing') {
        phase = 'captured';
        captureTimer = 2.5;
        captureStartWarpScore = warpScore; // Store for animation
        ship.state = 'rotating';
        scoreLocked = true;
        scoreNumericDisplay = score;
      }
    }
  }

  function renderWormhole(ctx) {
    if (!wormholeActive || !wormhole) return;
    ctx.save();
    ctx.translate(wormhole.x, wormhole.y);

    const currentLevel = levels[levelIndex] || levels[0];
    const isMaze = currentLevel.type === 'maze';
    const baseR = isMaze ? wormhole.radius * 0.6 : wormhole.radius; // Smaller for maze
    const t = wormhole.angle;

    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';

    const rippleCount = isMaze ? 3 : 5; // Fewer ripples for maze
    const innerOffset = -6;
    const step = isMaze ? 5 : 8; // Tighter ripples for maze

    for (let i = 0; i < rippleCount; i++) {
      const phase = t * 2.2 + i * 0.8;
      const pulsate = Math.sin(phase) * (isMaze ? 2 : 4); // Less pulsation for maze
      const offset = innerOffset + i * step;
      const r = baseR + offset + pulsate;

      const maxAlpha = 0.55;
      const minAlpha = 0.18;
      const alpha = minAlpha + (i / (rippleCount - 1)) * (maxAlpha - minAlpha);
      if (alpha <= 0 || r <= 0) continue;

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TWO_PI);
      // Use brighter blue for maze exit vortex to match walls
      ctx.strokeStyle = isMaze ? `rgba(0,204,255,${alpha})` : `rgba(120,180,255,${alpha})`;
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
          // Skip countdown and quote when running locally
          if (isLocalDev()) {
            phase = 'playing';
          } else {
            // Pick a random quote for game start
            currentLevelQuote = levelStartQuotes[Math.floor(Math.random() * levelStartQuotes.length)];
            phase = 'startCountdown';
            startCountdownTimer = 0.0;
            startCountdownStage = 0;
          }
          return;
        }
      }
      return;
    }

    if (phase === 'gameOver') {
      // Handle name entry screen clicks
      if (showNameEntry && px != null && py != null) {
        // Ignore clicks for 300ms after name entry appears to prevent stale touch events
        const timeSinceNameEntryAppeared = performance.now() - nameEntryShowTime;
        if (timeSinceNameEntryAppeared < 300) {
          return; // Debounce period - ignore this click
        }

        const x = px, y = py;
        // Submit button
        if (x >= submitNameBtn.x && x <= submitNameBtn.x + submitNameBtn.w &&
            y >= submitNameBtn.y && y <= submitNameBtn.y + submitNameBtn.h) {
          submitNameAndScore();
          return;
        }
        // Skip button
        if (x >= skipBtn.x && x <= skipBtn.x + skipBtn.w &&
            y >= skipBtn.y && y <= skipBtn.y + skipBtn.h) {
          skipNameEntry();
          return;
        }
        return;
      }

      // Restart button (only active when NOT showing name entry and after 1 second)
      if (!showNameEntry && gameOverTimer >= 1.0 && px != null && py != null) {
        const x = px, y = py;
        if (x >= restartBtn.x && x <= restartBtn.x + restartBtn.w &&
            y >= restartBtn.y && y <= restartBtn.y + restartBtn.h) {
          softRestartGame();
        }
      }
      return;
    }

    if (phase !== 'playing') return;
    if (!ship.alive) return;
    if (shipFrozen) return; // Cannot thrust while frozen in ice patch

    ship.state = "thrusting";
    ship.thrustDir = ship.angle;
  }

  // Keyboard input for name entry
  function onKeyPress(key) {
    if (!showNameEntry) return;

    if (key === 'Enter') {
      submitNameAndScore();
    } else if (key === 'Escape') {
      skipNameEntry();
    } else if (key === 'Backspace') {
      playerName = playerName.slice(0, -1);
    } else if (key.length === 1) {
      // Only allow printable characters
      if (key >= ' ' && key <= '~') {
        if (playerName.length >= MAX_NAME_LENGTH) {
          // Trigger wobble effect when at max length
          nameEntryWobble = 5; // 5px wobble amplitude
        } else {
          playerName += key;
        }
      }
    }
  }

  function onRelease(px, py) {
    if (phase !== 'playing') return;
    if (!ship.alive) return;
    ship.state = "rotating";
  }

  // --- Update ---
  function update(dt) {
    if (phase === 'start') {
      // Let flashes decay even if we're on the start screen
      hitFlashTimer = Math.max(0, hitFlashTimer - dt);
      healFlashTimer = Math.max(0, healFlashTimer - dt);
      return;
    }

    if (phase === 'startCountdown') {
      const isMazeLevel = (levels[levelIndex] || levels[0]).type === 'maze';
      const countdownTotal = 3.0;
      const shrinkDuration = 0.35;

      startCountdownTimer += dt;
      if (startCountdownStage === 0) {
        const stageDuration = countdownTotal + (isMazeLevel ? shrinkDuration : 0);
        if (startCountdownTimer >= stageDuration) {
          startCountdownStage = 1;
          startCountdownTimer = 0.0;
        }
      } else if (startCountdownStage === 1 && startCountdownTimer >= 1.5) {
        phase = 'playing';
        return;
      }
      updateFragments(dt);

      hitFlashTimer = Math.max(0, hitFlashTimer - dt);
      healFlashTimer = Math.max(0, healFlashTimer - dt);
      return;
    }

    if (phase === 'gameOver') {
      gameOverTimer += dt;
      updateFragments(dt);

      // Decay wobble animation
      if (nameEntryWobble > 0) {
        nameEntryWobble = Math.max(0, nameEntryWobble - dt * 20); // Decay quickly
      }

      // After death animation (2s), check if score qualifies for top 10
      if (gameOverTimer >= 2 && !nameEntryProcessed) {
        nameEntryProcessed = true;

        // Re-fetch high scores to check if player qualifies
        (async () => {
          try {
            highScores = await fetchHighScores(10);

            let isTop10 = false;
            if (score > 0) {
              if (highScores.length < 10) {
                isTop10 = true;
              } else {
                const tenthPlaceScore = highScores[9]?.score || 0;
                isTop10 = score >= tenthPlaceScore;
              }
            }

            if (isTop10) {
              showNameEntryForm();
            }
            // If not top 10, do nothing - game over screen will show automatically
          } catch (e) {
            console.error('Failed to check high scores:', e);
            showNameEntryForm(); // On error, show name entry to be safe
          }
        })();
      }

      hitFlashTimer = Math.max(0, hitFlashTimer - dt);
      healFlashTimer = Math.max(0, healFlashTimer - dt);
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

      // Animate warp score down to 0 in sync with ship shrinking
      warpScore = captureStartWarpScore * (captureTimer / totalCapture);
      scoreDisplay = warpScore; // Keep HUD warp bar synced during capture

      // Keep existing bodies moving & interacting while captured
      applyAttraction(ship, bodies, dt, levelIndex, getMazeData);
      for (const b of bodies) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      handleBodyMerges(bodies, applyLevelBoost);
      handleHealthHazardCollisions(bodies);
      const collResult = physicsHandleCollisions(ship, bodies, invulnTimer, phase, warpScore, score, energy, scoreLocked, W, H, clamp, dist2);
      warpScore = collResult.warpScore;
      score = collResult.score;
      energy = collResult.energy;
      healFlashTimer = Math.max(healFlashTimer, collResult.healFlashTimer);
      hitFlashColor = collResult.hitFlashColor;
      hitFlashTimer = Math.max(hitFlashTimer, collResult.hitFlashTimer);
      if (collResult.shouldExplode) triggerExplosion();
      updateFragments(dt);

      captureTimer -= dt;
      if (captureTimer <= 0) {
        phase = 'betweenLevels';
        betweenTimer = 0.0;
        betweenStage = 0;
        betweenFromLevel = levelIndex + 1;
        betweenToLevel = Math.min(levelIndex + 2, levels.length);

        // Ensure displayed score is synced to true score at start of between-level
        scoreNumericDisplay = score;

        // Calculate level completion bonus
        levelBonus = levels[levelIndex].type === 'maze' ? 10 * Math.floor(mazeTimer * 10) : 500 * betweenFromLevel;
        bonusDisplay = levelBonus; // Initialize bonus display to full amount
        bonusApplied = false;

        // Pick a random quote different from the previous one
        let newQuote;
        do {
          newQuote = levelStartQuotes[Math.floor(Math.random() * levelStartQuotes.length)];
        } while (newQuote === currentLevelQuote && levelStartQuotes.length > 1);
        currentLevelQuote = newQuote;
      }

      hitFlashTimer = Math.max(0, hitFlashTimer - dt);
      healFlashTimer = Math.max(0, healFlashTimer - dt);
      return;
    }

    if (!ship.alive) {
      updateFragments(dt);
      tryRespawn(dt);

      hitFlashTimer = Math.max(0, hitFlashTimer - dt);
      healFlashTimer = Math.max(0, healFlashTimer - dt);
      return;
    }

    if (phase === 'betweenLevels') {
      betweenTimer += dt;

      // Stage 0: "Level N complete" (fixed time)
      if (betweenStage === 0 && betweenTimer >= 0.8) {
        betweenStage = 1;
        betweenTimer = 0.0;
      }
      // Stage 1: Show static BONUS value (fixed time)
      else if (betweenStage === 1 && betweenTimer >= 1.0) {
        betweenStage = 2;
        betweenTimer = 0.0;
      }
      // Stage 2: Apply bonus + animate until fully transferred
      // Duration: 0.5s per level + 0.5s fixed (e.g., level 1 = 1.0s, level 2 = 1.5s, etc.)
      else if (betweenStage === 2) {
        if (!bonusApplied) {
          score += levelBonus; // apply full bonus to true score once
          bonusApplied = true;
        }

        // Calculate dynamic duration based on level
        const bonusTransferDuration = (betweenFromLevel * 0.5) + 0.2;

        // When timer reaches calculated duration AND animation is complete, move to next stage
        const timerDone = betweenTimer >= bonusTransferDuration;
        const scoreDone = Math.abs(score - scoreNumericDisplay) <= 0.5;
        const bonusDone = bonusDisplay <= 0.5;

        if (timerDone && scoreDone && bonusDone) {
          scoreNumericDisplay = score;
          bonusDisplay = 0;
          betweenStage = 3;
          betweenTimer = 0.0;
        }
      }
      // Stage 3: Pause after animation
      else if (betweenStage === 3 && betweenTimer >= 0.3) {
        betweenStage = 4;
        betweenTimer = 0.0;
      }
      // Stage 4: Pause before fade
      else if (betweenStage === 4 && betweenTimer >= 0.3) {
        betweenStage = 5;
        betweenTimer = 0.0;
      }
      // Stage 5: Fade out and shrink (fixed duration)
      else if (betweenStage === 5 && betweenTimer >= 0.3) {
        // Skip countdown and quote stages when running locally
        if (isLocalDev()) {
          startNextLevel();
          return;
        } else {
          betweenStage = 6;
          betweenTimer = 0.0;
        }
      }
      // Stage 6: Countdown 3..2..1
      else if (betweenStage === 6 && betweenTimer >= 3.0) {
        betweenStage = 7;
        betweenTimer = 0.0;
      }
      // Stage 7: Quote, then start next level
      else if (betweenStage === 7 && betweenTimer >= 1.5) {
        startNextLevel();
        return;
      }

      updateFragments(dt);

      // Animate score up and bonus down during stage 2+
      if (betweenStage >= 2) {
        const numericScoreDiff = score - scoreNumericDisplay;
        const bonusDiff = bonusDisplay - 0; // counting down to 0

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

        // Animate bonus counting down at same speed
        if (bonusDiff > 0.5) {
          const bonusDecrementSpeed = 1000; // points per second
          const maxDecrement = bonusDecrementSpeed * dt;
          bonusDisplay = Math.max(0, bonusDisplay - maxDecrement);
        } else {
          bonusDisplay = 0; // snap to 0 when close
        }
      }

      hitFlashTimer = Math.max(0, hitFlashTimer - dt);
      healFlashTimer = Math.max(0, healFlashTimer - dt);
      return;
    }

    // Normal playing
    // Skip spawning for maze levels
    const levelCfg = levels[levelIndex] || levels[0];
    if (levelCfg.type !== 'maze') {
      spawnTimer += dt;
      if (spawnTimer >= SPAWN_INTERVAL) {
        spawnTimer = 0;
        spawnBody(ship, bodies, levelIndex, applyLevelBoost, W, H);
      }

      // Independent health spawns (using global default for now)
      healthSpawnTimer += dt;
      if (healthSpawnTimer >= DEFAULT_HEALTH_FREQUENCY) {
        healthSpawnTimer = 0;
        spawnHealthPickup(bodies, W, H);
      }
    } else {
      // Update maze timer for maze levels (clamp at 0)
      mazeTimer = Math.max(0, mazeTimer - dt);
    }

    // Handle reverse spin effect (from orange hazard)
    if (reverseSpinTimer > 0) {
      reverseSpinTimer -= dt;
      // Force reversed angular velocity
      ship.angularVel = -ANGULAR_VEL;
    } else if (reverseSpinTimer <= 0 && ship.angularVel < 0) {
      // Restore normal angular velocity when timer expires
      ship.angularVel = ANGULAR_VEL;
      reverseSpinTimer = 0; // Ensure it stays at 0
    }

    applyAttraction(ship, bodies, dt, levelIndex, getMazeData);
    const integrateResult = integrate(ship, bodies, levelIndex, energy, triggerExplosion, W, H, clamp, dt);
    energy = integrateResult.energy;
    hitFlashColor = integrateResult.hitFlashColor;
    hitFlashTimer = Math.max(hitFlashTimer, integrateResult.hitFlashTimer);
    if (integrateResult.shouldExplode) triggerExplosion();

    handleBodyMerges(bodies, applyLevelBoost);
    handleHealthHazardCollisions(bodies);
    invulnTimer = Math.max(0, invulnTimer - dt);
    hitFlashTimer = Math.max(0, hitFlashTimer - dt);
    healFlashTimer = Math.max(0, healFlashTimer - dt);

    const collResult = physicsHandleCollisions(ship, bodies, invulnTimer, phase, warpScore, score, energy, scoreLocked, W, H, clamp, dist2);
    warpScore = collResult.warpScore;
    score = collResult.score;
    energy = collResult.energy;
    healFlashTimer = Math.max(healFlashTimer, collResult.healFlashTimer);
    hitFlashColor = collResult.hitFlashColor;
    hitFlashTimer = Math.max(hitFlashTimer, collResult.hitFlashTimer);
    if (collResult.shouldExplode) triggerExplosion();

    // Handle ice patch creation
    if (collResult.newIcePatch) {
      icePatches.push(collResult.newIcePatch);
    }

    // Handle reverse spin trigger (toggle if already active)
    if (collResult.triggerReverseSpin) {
      if (reverseSpinTimer > 0) {
        // Already antispinning - hitting another orange enemy cancels it
        reverseSpinTimer = 0;
        ship.angularVel = ANGULAR_VEL; // Restore normal spin immediately
      } else {
        // Not antispinning - start the effect
        reverseSpinTimer = 12.0; // 12 seconds of reverse spin
      }
    }

    // Update ice patches (expansion and lifetime)
    for (let i = icePatches.length - 1; i >= 0; i--) {
      const patch = icePatches[i];
      patch.timer += dt;

      // Handle expansion phase
      if (patch.expansionTimer < patch.expansionDuration) {
        patch.expansionTimer += dt;
        const expansionProgress = Math.min(1, patch.expansionTimer / patch.expansionDuration);
        patch.currentRadius = patch.initialRadius + (patch.targetRadius - patch.initialRadius) * expansionProgress;
      }

      // Remove expired patches
      if (patch.timer >= patch.duration) {
        icePatches.splice(i, 1);
      }
    }

    // Update ice_patch_expanding bodies (expand their radius visually)
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      if (b.type === 'ice_patch_expanding' && b.icePatchData) {
        const patch = b.icePatchData;
        if (patch.expansionTimer < patch.expansionDuration) {
          b.radius = patch.currentRadius;
        } else {
          // Expansion complete - remove from bodies array
          bodies.splice(i, 1);
        }
      }
    }

    // Check if ship is inside any ice patch
    const wasShipFrozen = shipFrozen;
    shipFrozen = false;
    for (const patch of icePatches) {
      const dx = ship.x - patch.x;
      const dy = ship.y - patch.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Use slightly larger radius for collision to account for irregular edge (max variation is 1.15x)
      if (dist <= patch.currentRadius * 1.1) {
        if (!wasShipFrozen) {
          // Just entered ice - freeze current velocity with minimum speed
          const currentSpeed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
          const minSpeed = 50; // Minimum speed to prevent getting stuck

          if (currentSpeed < minSpeed) {
            // Apply minimum speed in the direction ship is facing
            const angle = ship.state === "thrusting" ? ship.thrustDir : ship.angle;
            frozenVelocity.vx = Math.cos(angle) * minSpeed;
            frozenVelocity.vy = Math.sin(angle) * minSpeed;
          } else {
            // Use current velocity
            frozenVelocity.vx = ship.vx;
            frozenVelocity.vy = ship.vy;
          }
        }
        shipFrozen = true;
        break;
      }
    }

    // Apply frozen physics to ship
    if (shipFrozen) {
      // Lock ship velocity to frozen velocity
      ship.vx = frozenVelocity.vx;
      ship.vy = frozenVelocity.vy;
      // Prevent rotation (unless reverse spin is active)
      if (reverseSpinTimer <= 0) {
        ship.angularVel = 0;
      }
      // Force ship to stay in rotating state (not thrusting)
      if (ship.state === "thrusting") {
        ship.state = "rotating";
      }
    } else if (wasShipFrozen && !shipFrozen) {
      // Just exited ice - restore angular velocity (normal or reversed)
      ship.angularVel = reverseSpinTimer > 0 ? -ANGULAR_VEL : ANGULAR_VEL;
    }

    // Check maze collision and apply attractor wall forces (only in maze levels)
    const currentLevel = levels[levelIndex] || levels[0];
    if (currentLevel.type === 'maze' && ship.alive) {
      // Apply attractor wall forces
      applyAttractorWallForce(ship, dt, W, H);

      // Check wall collision for damage
      if (invulnTimer <= 0 && checkMazeCollision(ship, W, H)) {
        // Apply same damage as hitting a red hazard
        energy -= ENEMY_DAMAGE;
        hitFlashColor = 'rgba(255,60,60,';
        hitFlashTimer = 0.1;

        if (energy <= 0) {
          energy = 0;
          triggerExplosion();
        }
      }
    }

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

    // Hide game elements on start screen and countdown for clean title page
    const hideGameElements = phase === 'start' || phase === 'startCountdown';

    // Wormhole ripple (behind bodies, over background)
    if (!hideGameElements) {
      renderWormhole(ctx);
    }

    // Maze walls (render behind bodies)
    if (!hideGameElements) {
      renderMaze(ctx, W, H, phase, ship);
    }

    // Ice patches (render behind bodies but on top of maze/background)
    if (!hideGameElements) {
      for (const patch of icePatches) {
        // Calculate fade-out during last 2 seconds
        const timeRemaining = patch.duration - patch.timer;
        const fadeStart = 2.0;
        let alpha = 0.4; // Base transparency
        if (timeRemaining < fadeStart) {
          alpha *= (timeRemaining / fadeStart);
        }

        // Draw ice patch with randomized edge
        ctx.beginPath();
        if (patch.edgeVariation && patch.edgeVariation.length > 0) {
          // Draw irregular edge using the randomized pattern
          const pointCount = patch.edgeVariation.length;
          for (let i = 0; i <= pointCount; i++) {
            const angle = (i / pointCount) * TWO_PI;
            const variation = patch.edgeVariation[i % pointCount];
            const r = patch.currentRadius * variation;
            const px = patch.x + Math.cos(angle) * r;
            const py = patch.y + Math.sin(angle) * r;

            if (i === 0) {
              ctx.moveTo(px, py);
            } else {
              ctx.lineTo(px, py);
            }
          }
          ctx.closePath();
        } else {
          // Fallback to circle if no edge variation
          ctx.arc(patch.x, patch.y, patch.currentRadius, 0, TWO_PI);
        }

        ctx.fillStyle = `rgba(135, 206, 235, ${alpha})`; // Light blue with transparency
        ctx.fill();

        // Add a subtle border
        ctx.strokeStyle = `rgba(200, 230, 255, ${alpha * 1.5})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Bodies
    if (!hideGameElements) {
      for (const b of bodies) {
      // Calculate spawn animation scale (1px to full size over spawnDuration)
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
      } else if (b.type === 'ice_star' || b.type === 'ice_patch_expanding') {
        // Light blue ice star
        ctx.beginPath();
        ctx.arc(b.x, b.y, renderRadius, 0, TWO_PI);
        ctx.fillStyle = '#87ceeb'; // Light blue
        ctx.fill();

        // Add white sparkle in center if not expanding yet
        if (b.type === 'ice_star') {
          ctx.beginPath();
          ctx.arc(b.x, b.y, renderRadius * 0.3, 0, TWO_PI);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
      } else if (b.type === 'hazard_reverse') {
        // Orange reverse-spin hazard with rotating symbol
        ctx.save();
        ctx.translate(b.x, b.y);

        // Draw orange circle
        ctx.beginPath();
        ctx.arc(0, 0, renderRadius, 0, TWO_PI);
        ctx.fillStyle = '#ff8c3c'; // Off-red/orange color
        ctx.fill();

        // Draw rotating arrows symbol (2 curved arrows forming a circle)
        const time = performance.now() / 1000; // Use time for rotation
        const rotationAngle = time * 3; // Rotate at 3 radians per second
        ctx.rotate(rotationAngle);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = renderRadius * 0.15;
        ctx.lineCap = 'round';

        // Draw two curved arrows
        for (let i = 0; i < 2; i++) {
          ctx.save();
          ctx.rotate((i * Math.PI));

          // Curved arrow path
          ctx.beginPath();
          ctx.arc(0, 0, renderRadius * 0.5, -Math.PI * 0.3, Math.PI * 0.3, false);
          ctx.stroke();

          // Arrowhead
          const arrowSize = renderRadius * 0.25;
          ctx.beginPath();
          ctx.moveTo(renderRadius * 0.4, renderRadius * 0.3);
          ctx.lineTo(renderRadius * 0.4 + arrowSize, renderRadius * 0.3 - arrowSize * 0.5);
          ctx.lineTo(renderRadius * 0.4 + arrowSize * 0.5, renderRadius * 0.3 + arrowSize * 0.5);
          ctx.stroke();

          ctx.restore();
        }

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
    }

    if (!hideGameElements) {
      renderFragments(ctx);
    }

    // Ship (hidden during between-level overlay so it doesn't pop back full-size)
    if (!hideGameElements && phase !== 'betweenLevels' && (ship.alive || phase === 'captured')) {
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

      // Apply orange tint when antispinning
      let shipColor = '#cfe8ff'; // Normal color
      if (reverseSpinTimer > 0) {
        if (reverseSpinTimer <= 3.0) {
          // Flash orange/normal at 2 flashes/sec for last 3 seconds
          const flashFreq = 2.0; // 2 Hz
          const flashPhase = (performance.now() * 0.001 * flashFreq) % 1.0;
          shipColor = flashPhase < 0.5 ? '#ffcc99' : '#cfe8ff'; // Orange tint / Normal
        } else {
          // Solid orange tint
          shipColor = '#ffcc99';
        }
      }
      ctx.fillStyle = shipColor;
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
        ctx.rotate(-Math.PI / 4);

        ctx.beginPath();
        ctx.moveTo(lifeRadius, 0);
        ctx.lineTo(-lifeRadius * 0.7, lifeRadius * 0.6);
        ctx.lineTo(-lifeRadius * 0.4, 0);
        ctx.lineTo(-lifeRadius * 0.7, -lifeRadius * 0.6);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
        lx -= (lifeRadius * 2 + lifeGap);
      }
      ctx.restore();
    }

    // Maze timer (bottom-right corner) - only for maze levels during gameplay
    const currentLevelCfg = levels[levelIndex] || levels[0];
    if (currentLevelCfg.type === 'maze' && phase === 'playing') {
      const timerText = mazeTimer.toFixed(1) + 's';
      ctx.save();

      // Color transitions based on time remaining
      let timerColor = '#00ccff'; // Default cyan (match maze wall color)
      if (mazeTimer <= 5) {
        timerColor = '#ff6b35'; // Orangey-red (last 5 seconds)
      } else if (mazeTimer <= 10) {
        timerColor = '#ff9500'; // Orange (last 10 seconds)
      } else if (mazeTimer <= 15) {
        timerColor = '#ffd700'; // Yellow (last 15 seconds)
      }

      // Shrink and fade when timer hits zero (shrink in place)
      if (mazeTimer <= 0) {
        // Shrink over 0.5s after hitting zero
        const shrinkDuration = 0.5;
        const timeSinceZero = 0; // Always 0 since we clamp at 0
        const shrinkProgress = Math.min(1, timeSinceZero / shrinkDuration);
        const scale = 1 - shrinkProgress; // 1.0 -> 0.0
        const alpha = 1 - shrinkProgress; // 1.0 -> 0.0

        if (scale > 0.01) { // Only render if still visible
          // Shrink in place by translating to position, scaling, then drawing at origin
          ctx.translate(w - 12, h - 12);
          ctx.scale(scale, scale);
          ctx.fillStyle = `rgba(255, 107, 53, ${alpha})`; // Fade out orangey-red
          ctx.font = 'bold 20px monospace';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(timerText, 0, 0);
        }
      } else {
        ctx.fillStyle = timerColor;
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(timerText, w - 12, h - 12);
      }

      ctx.restore();
    }

    // Reverse spin timer (bottom-right corner) - during gameplay when effect is active
    if (reverseSpinTimer > 0 && phase === 'playing') {
      const timerText = reverseSpinTimer.toFixed(1) + 's';
      ctx.save();

      // Orange color to match the reverse-spin hazard
      const timerColor = '#ff8c3c';

      ctx.fillStyle = timerColor;
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';

      // Position: if maze timer is also showing, place it above the maze timer
      const yOffset = (currentLevelCfg.type === 'maze') ? -30 : 0;
      ctx.fillText(timerText, w - 12, h - 12 + yOffset);

      ctx.restore();
    }

    // Hit flash when taking damage (red for hazard, green for elite)
    if (hitFlashTimer > 0) {
      // Wall bumps (0.05s) get reduced opacity; enemy hits (0.1s) get full
      const maxAlpha = hitFlashTimer <= 0.05 ? 0.2 : 0.4;
      const flashDuration = hitFlashTimer <= 0.05 ? 0.05 : 0.1;
      const alpha = Math.min(maxAlpha, (hitFlashTimer / flashDuration) * maxAlpha);
      ctx.save();
      ctx.fillStyle = `${hitFlashColor}${alpha})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // Heal flash when collecting health (double blue flash)
    if (healFlashTimer > 0) {
      const t = 1 - (healFlashTimer / HEAL_FLASH_TOTAL); // 0 -> 1 over duration
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

      const panelW = w * 0.9;
      const panelH = h * 0.8;
      const px = w * 0.05;
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
      ctx.fillText(game_title, w * 0.5, py + 60);

      // Instructions
      ctx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      const lines = [
        'Hold anywhere on the screen to thrust.',
        'Your ship accelerates in the direction',
        'that it is currently facing.',
        '',
        'Collect yellow stars to build up warp drive.',
        'Red & green pulsars drain your energy.',
        'Use gravity to slingshot them off-screen.',
        'Blue ice starts cause temprary ice slicks.',
        ' ',
        'In maze levels, avoid walls & find the exit',
        'Attractor walls pull you toward them!',
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

      const isMazeLevel = (levels[levelIndex] || levels[0]).type === 'maze';
      const countdownTotal = 3.0;
      const shrinkDuration = 0.35;

      if (startCountdownStage === 0) {
        const t = Math.min(startCountdownTimer, countdownTotal);
        const remainingRaw = countdownTotal - startCountdownTimer;
        const shrinkElapsed = Math.max(0, startCountdownTimer - countdownTotal);
        const shrinkProgress = isMazeLevel ? clamp(shrinkElapsed / shrinkDuration, 0, 1) : 0;
        const countdownNumber = (isMazeLevel && shrinkProgress > 0)
          ? '0'
          : String(Math.max(1, Math.ceil(Math.max(0, remainingRaw))));

        const pulse = 1.0 + 0.25 * (1 - (t % 1.0));
        const shrinkScale = 1 - shrinkProgress;
        const scale = pulse * shrinkScale;
        const alpha = 1 - shrinkProgress;

        ctx.save();
        ctx.translate(w * 0.5, h * 0.5);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 64px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText(countdownNumber, 0, 20);
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
      // Stage 1: Show static BONUS value
      else if (betweenStage === 1) {
        ctx.font = 'bold 28px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText(`Level ${betweenFromLevel} complete`, w * 0.5, h * 0.35);
        ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#ffd54a';
        ctx.fillText(`BONUS: ${levelBonus}`, w * 0.5, h * 0.45);
        ctx.font = 'bold 48px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText(String(Math.floor(scoreNumericDisplay)), w * 0.5, h * 0.6);
      }
      // Stage 2–4: Bonus counts down while score counts up
      else if (betweenStage === 2 || betweenStage === 3 || betweenStage === 4) {
        const bonusShown = Math.max(0, Math.floor(bonusDisplay));
        ctx.font = 'bold 28px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText(`Level ${betweenFromLevel} complete`, w * 0.5, h * 0.35);
        ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#ffd54a';
        ctx.fillText(`BONUS: ${bonusShown}`, w * 0.5, h * 0.45);
        ctx.font = 'bold 48px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText(String(Math.floor(scoreNumericDisplay)), w * 0.5, h * 0.6);
      }
      // Stage 5: Fade out and shrink score + bonus + text
      else if (betweenStage === 5) {
        const progress = betweenTimer / 0.3; // 0 to 1 over 300ms
        const fadeAlpha = 1 - progress;
        const scale = 1 - progress;

        const bonusShown = Math.max(0, Math.floor(bonusDisplay));

        // Fade "Level N complete"
        ctx.save();
        ctx.translate(w * 0.5, h * 0.35);
        ctx.scale(scale, scale);
        ctx.font = 'bold 28px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = `rgba(255, 255, 255, ${fadeAlpha})`;
        ctx.fillText(`Level ${betweenFromLevel} complete`, 0, 0);
        ctx.restore();

        // Fade "BONUS: X"
        ctx.save();
        ctx.translate(w * 0.5, h * 0.45);
        ctx.scale(scale, scale);
        ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = `rgba(255, 213, 74, ${fadeAlpha})`;
        ctx.fillText(`BONUS: ${bonusShown}`, 0, 0);
        ctx.restore();

        // Fade and shrink the score
        ctx.save();
        ctx.translate(w * 0.5, h * 0.6);
        ctx.scale(scale, scale);
        ctx.font = 'bold 48px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = `rgba(255, 255, 255, ${fadeAlpha})`;
        ctx.fillText(String(Math.floor(scoreNumericDisplay)), 0, 0);
        ctx.restore();
      }
      // Stage 6: Countdown 3..2..1
      else if (betweenStage === 6) {
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
      // Stage 7: Quote
      else if (betweenStage === 7) {
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

      // Name entry overlay (shown on top of everything when active)
      if (showNameEntry) {
        // Semi-transparent backdrop
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, w, h);

        // Name entry panel - positioned at TOP to avoid Android keyboard push-up
        const scale = Math.min(1, w / 400, h / 350); // Scale based on viewport
        const panelW = Math.min(500, w * 0.9);
        const panelH = Math.min(320 * scale, h * 0.6); // Increased height to fit buttons (was 280)
        const panelX = (w - panelW) / 2;
        const panelY = Math.min(h * 0.1, 40); // Position near top, min 40px from top

        // Panel background
        ctx.fillStyle = 'rgba(30, 30, 50, 0.95)';
        ctx.fillRect(panelX, panelY, panelW, panelH);

        // Panel border
        ctx.strokeStyle = '#a8ffd9';
        ctx.lineWidth = 2;
        ctx.strokeRect(panelX, panelY, panelW, panelH);

        // Title
        ctx.fillStyle = '#a8ffd9';
        ctx.font = `bold ${Math.floor(20 * scale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('New High Score!', w * 0.5, panelY + 35 * scale);

        // Score display
        ctx.fillStyle = '#ffd54a';
        ctx.font = `bold ${Math.floor(28 * scale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
        ctx.fillText(String(Math.floor(score)), w * 0.5, panelY + 70 * scale);

        // Prompt text
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.floor(14 * scale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
        ctx.fillText('Enter your name:', w * 0.5, panelY + 100 * scale);

        // Name input box
        const inputW = panelW * 0.8;
        const inputH = Math.floor(36 * scale);
        const inputX = (w - inputW) / 2;
        const inputY = panelY + 112 * scale;

        // Apply wobble offset if validation triggered
        const wobbleOffset = Math.sin(nameEntryWobble * 2) * nameEntryWobble;

        // Input background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(inputX + wobbleOffset, inputY, inputW, inputH);

        // Input border
        ctx.strokeStyle = '#66d9ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(inputX + wobbleOffset, inputY, inputW, inputH);

        // Name text with blinking cursor
        ctx.fillStyle = '#fff';
        const fontSize = Math.floor(18 * scale);
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'center';
        const displayName = playerName || '';

        // Sync hidden input value (for mobile keyboard)
        if (nameInputEl && nameInputEl.value !== playerName) {
          nameInputEl.value = playerName;
        }

        // Text baseline Y position
        const textBaselineY = inputY + inputH * 0.65;

        // Display name (with wobble)
        ctx.fillText(displayName, w * 0.5 + wobbleOffset, textBaselineY);

        // Blinking cursor (blinks every 0.5s)
        const cursorVisible = (Date.now() % 1000) < 500;
        if (cursorVisible) {
          // Measure text width to position cursor
          const textWidth = ctx.measureText(displayName).width;
          const cursorX = w * 0.5 + textWidth / 2 + 4 + wobbleOffset;
          // Cursor should end at baseline, start above it by font size
          const cursorY = textBaselineY - fontSize;
          const cursorHeight = fontSize;
          ctx.fillStyle = '#66d9ff';
          ctx.fillRect(cursorX, cursorY, 2, cursorHeight);
        }

        // Validation message when character limit reached
        if (nameEntryWobble > 0) {
          ctx.fillStyle = '#ff6666';
          ctx.font = `${Math.floor(12 * scale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
          ctx.textAlign = 'center';
          ctx.fillText(`max ${MAX_NAME_LENGTH} chars`, w * 0.5, inputY + inputH + 18 * scale);
        }

        // Buttons (Skip on left, Submit on right per UX standards)
        const btnY = panelY + Math.floor(180 * scale);
        const btnGap = 16;
        const btnScale = Math.min(1, w / 500); // Scale down on small screens
        skipBtn.w = Math.floor(140 * btnScale);
        skipBtn.h = Math.floor(50 * btnScale);
        submitNameBtn.w = Math.floor(180 * btnScale);
        submitNameBtn.h = Math.floor(50 * btnScale);

        const totalBtnWidth = submitNameBtn.w + skipBtn.w + btnGap;
        const startX = (w - totalBtnWidth) / 2;

        // Skip button (LEFT)
        skipBtn.x = startX;
        skipBtn.y = btnY;

        ctx.fillStyle = '#666';
        ctx.fillRect(skipBtn.x, skipBtn.y, skipBtn.w, skipBtn.h);
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 2;
        ctx.strokeRect(skipBtn.x, skipBtn.y, skipBtn.w, skipBtn.h);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.floor(17 * btnScale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('Skip', skipBtn.x + skipBtn.w / 2, skipBtn.y + skipBtn.h / 2 + 6);

        // Submit button (RIGHT)
        submitNameBtn.x = startX + skipBtn.w + btnGap;
        submitNameBtn.y = btnY;

        ctx.fillStyle = '#16c784';
        ctx.fillRect(submitNameBtn.x, submitNameBtn.y, submitNameBtn.w, submitNameBtn.h);
        ctx.strokeStyle = '#c8ffe6';
        ctx.lineWidth = 2;
        ctx.strokeRect(submitNameBtn.x, submitNameBtn.y, submitNameBtn.w, submitNameBtn.h);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.floor(17 * btnScale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
        ctx.fillText('Submit', submitNameBtn.x + submitNameBtn.w / 2, submitNameBtn.y + submitNameBtn.h / 2 + 6);

        ctx.restore();
        return;
      }

      // Game over screen (show when NOT showing name entry)
      if (!showNameEntry && gameOverTimer >= 2) {
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 32px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText('Game Over', w * 0.5, h * 0.2);

        // Show final score
        ctx.font = '18px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText(`Score: ${Math.floor(score)}`, w * 0.5, h * 0.2 + 40);

        // Centered Leaderboard
        let boardY = h * 0.35;

        ctx.textAlign = 'center';
        ctx.font = 'bold 20px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText('Leaderboard', w * 0.5, boardY);
        boardY += 26;

        if (!highScores || highScores.length === 0) {
          ctx.font = '14px monospace';
          ctx.fillText('No scores yet...', w * 0.5, boardY + 4);
        } else {
          const maxRows = 10;
          for (let i = 0; i < Math.min(highScores.length, maxRows); i++) {
            const row = highScores[i];
            const name = (row.name ?? 'Anon').slice(0, MAX_NAME_LENGTH); // Cap at 15 chars
            const s = row.score ?? 0;
            const position = getOrdinal(i + 1); // 1st, 2nd, 3rd, etc.

            // Highlight newly submitted entry with bold font
            const isNewEntry = lastSubmittedName && (row.name ?? 'Anon') === lastSubmittedName;

            // Draw sparkles around new entry
            if (isNewEntry) {
              const lineY = boardY + i * 20;
              const time = Date.now() / 1000;

              // Create 5 sparkles in 3D elliptical orbit
              for (let j = 0; j < 5; j++) {
                const angle = (time * 0.5 + j * TWO_PI / 5) % TWO_PI;

                // Horizontal position (left-right orbit)
                const sparkleX = w * 0.5 + Math.cos(angle) * 120;

                // Vertical position - center around text (offset -4 to center on name)
                // Vertical ellipse is smaller to create 3D effect
                const sparkleY = lineY - 4 + Math.sin(angle) * 6;

                // Depth effect: size changes based on vertical position (rotated 90 degrees)
                // When at top (sin < 0), sparkle gets smaller (going away)
                // When at bottom (sin > 0), sparkle gets larger (coming closer)
                const depthFactor = 1.0 - Math.sin(angle) * 0.4; // ranges from 0.6 to 1.4
                const twinkle = Math.abs(Math.sin(time * 1.8 + j)); // Slowed by 40% (was 3, now 1.8)
                const baseSize = 2 + twinkle * 1.5;
                const size = baseSize * depthFactor;

                // Opacity: vary between 0.2 and 1.0 (20% to 100%)
                const baseOpacity = 0.2 + depthFactor * 0.5; // ranges from 0.2 to 0.7
                const finalOpacity = baseOpacity + twinkle * 0.3; // adds up to 0.3 more

                ctx.save();
                ctx.fillStyle = `rgba(255, 215, 0, ${finalOpacity})`;
                ctx.beginPath();
                ctx.arc(sparkleX, sparkleY, size, 0, TWO_PI);
                ctx.fill();
                ctx.restore();
              }
            }

            // Use monospace font for proper alignment
            ctx.font = isNewEntry
              ? 'bold 14px monospace'
              : '14px monospace';
            ctx.textAlign = 'left';

            // Build formatted line with right-justified score
            // Format: "1st  Name               123"
            const lineY = boardY + i * 20;

            // Position component - left-aligned from a starting point
            const startX = w * 0.5 - 120; // Start 150px left of center
            ctx.fillText(position, startX, lineY);

            // Name - positioned after position
            const nameX = startX + 40; // Space for position (e.g., "10th ")
            ctx.fillText(name, nameX, lineY);

            // Score - right-aligned (no leading zeros)
            ctx.textAlign = 'right';
            const scoreX = w * 0.5 + 120; // End 150px right of center
            ctx.fillText(String(s), scoreX, lineY);
          }
        }
      }

      // Restart button (only show when game over screen is visible)
      if (!showNameEntry && gameOverTimer >= 2) {
        restartBtn.w = 220;
        restartBtn.h = 48;
        restartBtn.x = w * 0.5 - restartBtn.w / 2;
        restartBtn.y = h * 0.8;
        ctx.fillStyle = '#16c784'; // Match start button color
        ctx.fillRect(restartBtn.x, restartBtn.y, restartBtn.w, restartBtn.h);
        ctx.strokeStyle = '#c8ffe6'; // Match start button border
        ctx.lineWidth = 2;
        ctx.strokeRect(restartBtn.x, restartBtn.y, restartBtn.w, restartBtn.h);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.textAlign = 'center'; // Reset to center (was 'right' from leaderboard)
        ctx.fillText('Restart', w * 0.5, restartBtn.y + restartBtn.h / 2 + 6);
      }

      ctx.restore();
    }
  }

  // --- Resize ---
  function onResize(newW, newH) {
    const w = Number.isFinite(newW) ? newW : W();
    const h = Number.isFinite(newH) ? newH : H();
    if (!w || !h) return;

    const scaleX = lastW ? w / lastW : 1;
    const scaleY = lastH ? h / lastH : 1;

    if (scaleX !== 1 || scaleY !== 1) {
      ship.x *= scaleX;
      ship.y *= scaleY;

      for (const b of bodies) {
        b.x *= scaleX;
        b.y *= scaleY;
      }

      for (const f of fragments) {
        f.x *= scaleX;
        f.y *= scaleY;
      }

      if (wormhole) {
        wormhole.x *= scaleX;
        wormhole.y *= scaleY;
      }

      // Keep maze grid math in sync with the current viewport
      const mazeInfo = getMazeData();
      if (mazeInfo) {
        mazeInfo.width = w;
        mazeInfo.height = h;
      }
    }

    lastW = w;
    lastH = h;

    ship.x = clamp(ship.x, 0, w);
    ship.y = clamp(ship.y, 0, h);
  }

  // Sync hidden input with playerName for mobile keyboard
  if (nameInputEl) {
    nameInputEl.addEventListener('input', (e) => {
      if (showNameEntry) {
        playerName = e.target.value.slice(0, 20);
        // Keep input synced
        if (e.target.value !== playerName) {
          e.target.value = playerName;
        }
      }
    });

    // Handle Enter key on mobile
    nameInputEl.addEventListener('keydown', (e) => {
      if (showNameEntry && e.key === 'Enter') {
        e.preventDefault();
        submitNameAndScore();
      }
    });
  }

  // Ensure first spawn is centered + start screen active
  hardRestartGame();

  return { update, render, onResize, onPress, onRelease, onKeyPress };
}
