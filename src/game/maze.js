// Maze level system
// Grid-based maze with binary wall encoding: top(8), right(4), bottom(2), left(1)

import { SHIP_RADIUS, HEALTH_RADIUS, OBJECT_SCALE } from './config.js';

// Maze state
let mazeWalls = [];
let mazeData = { exitCol: 0, exitRow: 8, cellW: 0, cellH: 0, startX: 0, startY: 0 };

// Maze grid definition
// Grid layout: 5 columns x 9 rows, top-left to bottom-right
const MAZE_GRID = [
  [0b1010, 0b1010, 0b1010, 0b1010, 0b1100],
  [0b1001, 0b1010, 0b1010, 0b1010, 0b0110],
  [0b0011, 0b1010, 0b1100, 0b1001, 0b1100],
  [0b1001, 0b1110, 0b0101, 0b0011, 0b0100],
  [0b0101, 0b1001, 0b0000, 0b1100, 0b0101],
  [0b0101, 0b0011, 0b0000, 0b0110, 0b0101],
  [0b0001, 0b1100, 0b0001, 0b1010, 0b0110],
  [0b0011, 0b0110, 0b0011, 0b1010, 0b1100],
  [0b1001, 0b1010, 0b1010, 0b1010, 0b0110],
];

// Maze item placements (col, row, type)
// Items are placed at the CENTER of the specified grid cell
const MAZE_ITEMS = [
  { col: 3, row: 3, type: 'health' },  // Health pack in cell [0,2]
];

/**
 * Initialize maze walls based on grid definition
 * @param {Function} W - Canvas width getter
 * @param {Function} H - Canvas height getter
 */
export function initMaze(W, H) {
  // Playable area starts below UI bars (topY = 32, barH = 12, so ~50px from top)
  const uiHeight = 50;
  const playableTop = uiHeight / H();
  const playableHeight = 1 - playableTop;

  // Inset walls by 3 pixels from screen edges so they're fully visible
  const insetX = 3 / W();
  const insetY = 3 / H();

  const cols = 5;
  const rows = MAZE_GRID.length;
  mazeWalls = [];

  // Calculate cell dimensions with inset
  const startX = insetX;
  const startY = playableTop;
  const mazeWidth = 1 - 2 * insetX;
  const mazeHeight = playableHeight - insetY;
  const cellW = mazeWidth / cols;
  const cellH = mazeHeight / rows;

  // Store maze data for ship positioning and exit vortex
  // Capture canvas dimensions at init time to avoid race conditions
  const w = W();
  const h = H();
  mazeData = {
    exitCol: 0,      // bottom-left square (column 0)
    exitRow: 8,      // bottom-left square (row 8)
    cellW: cellW,
    cellH: cellH,
    startX: startX,
    startY: startY,
    width: w,        // Canvas width when maze was initialized
    height: h        // Canvas height when maze was initialized
  };

  // Convert grid to wall segments
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const walls = MAZE_GRID[row][col];
      const x = startX + col * cellW;
      const y = startY + row * cellH;

      // Top wall (bit 3 = 0b1000)
      if (walls & 0b1000) {
        mazeWalls.push({
          x1: x,
          y1: y,
          x2: x + cellW,
          y2: y
        });
      }

      // Right wall (bit 2 = 0b0100)
      if (walls & 0b0100) {
        mazeWalls.push({
          x1: x + cellW,
          y1: y,
          x2: x + cellW,
          y2: y + cellH
        });
      }

      // Bottom wall (bit 1 = 0b0010)
      if (walls & 0b0010) {
        mazeWalls.push({
          x1: x,
          y1: y + cellH,
          x2: x + cellW,
          y2: y + cellH
        });
      }

      // Left wall (bit 0 = 0b0001)
      if (walls & 0b0001) {
        mazeWalls.push({
          x1: x,
          y1: y,
          x2: x,
          y2: y + cellH
        });
      }
    }
  }
}

/**
 * Render maze walls
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Function} W - Canvas width getter
 * @param {Function} H - Canvas height getter
 * @param {string} phase - Current game phase
 */
export function renderMaze(ctx, W, H, phase) {
  if (mazeWalls.length === 0) return;
  // Only render maze during active gameplay (not on start screen)
  if (phase === 'start' || phase === 'startCountdown') return;

  const w = W();
  const h = H();

  ctx.save();
  ctx.strokeStyle = '#00ccff'; // Bright blue
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  for (const wall of mazeWalls) {
    ctx.beginPath();
    ctx.moveTo(wall.x1 * w, wall.y1 * h);
    ctx.lineTo(wall.x2 * w, wall.y2 * h);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Check if ship collides with any maze wall and handle bounce
 * @param {Object} ship - Ship object with x, y, vx, vy
 * @param {Function} W - Canvas width getter
 * @param {Function} H - Canvas height getter
 * @returns {boolean} True if collision detected (and ship was bounced)
 */
export function checkMazeCollision(ship, W, H) {
  if (mazeWalls.length === 0) return false;

  const w = W();
  const h = H();
  const shipRadius = SHIP_RADIUS;
  const BOUNCE_DAMP = 0.6; // More dampening than wall bounce (0.95)

  // Check each wall for collision with ship circle
  for (const wall of mazeWalls) {
    const x1 = wall.x1 * w;
    const y1 = wall.y1 * h;
    const x2 = wall.x2 * w;
    const y2 = wall.y2 * h;

    // Find closest point on line segment to ship center
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;

    if (len2 === 0) {
      // Wall is a point, check distance to that point
      const dist2 = (ship.x - x1) ** 2 + (ship.y - y1) ** 2;
      if (dist2 <= shipRadius * shipRadius) {
        // Simple pushback from point
        const pushDx = ship.x - x1;
        const pushDy = ship.y - y1;
        const pushDist = Math.sqrt(dist2) || 1;
        ship.x = x1 + (pushDx / pushDist) * shipRadius;
        ship.y = y1 + (pushDy / pushDist) * shipRadius;
        ship.vx *= -BOUNCE_DAMP;
        ship.vy *= -BOUNCE_DAMP;
        return true;
      }
      continue;
    }

    // Project ship position onto line segment
    let t = ((ship.x - x1) * dx + (ship.y - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t)); // Clamp to segment

    // Find closest point
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;

    // Check distance
    const cdx = ship.x - closestX;
    const cdy = ship.y - closestY;
    const dist2 = cdx * cdx + cdy * cdy;

    if (dist2 <= shipRadius * shipRadius) {
      // Calculate wall normal (perpendicular to wall)
      const wallLen = Math.sqrt(len2);
      let wallNormX = -dy / wallLen; // perpendicular
      let wallNormY = dx / wallLen;

      // Ensure normal points toward ship
      if (wallNormX * cdx + wallNormY * cdy < 0) {
        wallNormX *= -1;
        wallNormY *= -1;
      }

      // Push ship out of wall
      ship.x = closestX + wallNormX * shipRadius;
      ship.y = closestY + wallNormY * shipRadius;

      // Reflect velocity along wall normal
      const dotProduct = ship.vx * wallNormX + ship.vy * wallNormY;
      ship.vx = (ship.vx - 2 * dotProduct * wallNormX) * BOUNCE_DAMP;
      ship.vy = (ship.vy - 2 * dotProduct * wallNormY) * BOUNCE_DAMP;

      return true;
    }
  }

  return false;
}

/**
 * Get maze data for ship and vortex positioning
 * @returns {Object} Maze data object
 */
export function getMazeData() {
  return mazeData;
}

/**
 * Clear maze walls (called when transitioning to non-maze levels)
 */
export function clearMaze() {
  mazeWalls = [];
}

/**
 * Spawn initial maze items (health packs, etc.) at specified grid positions
 * @param {Array} bodies - Bodies array to add items to
 * @param {Function} W - Canvas width getter
 * @param {Function} H - Canvas height getter
 */
export function spawnMazeItems(bodies, W, H) {
  const w = W();
  const h = H();

  for (const item of MAZE_ITEMS) {
    if (item.type === 'health') {
      const radius = HEALTH_RADIUS * OBJECT_SCALE;

      // Position at center of grid cell
      const x = w * (mazeData.startX + item.col * mazeData.cellW + mazeData.cellW * 0.5);
      const y = h * (mazeData.startY + item.row * mazeData.cellH + mazeData.cellH * 0.5);

      const body = {
        type: 'health',
        radius,
        x,
        y,
        vx: 0,  // Stationary in maze
        vy: 0,
        gravMult: 1,         // Normal gravity strength
        attractMul: 1,       // Grid-square check in physics.js controls range
        speedMul: 1,         // Normal speed
        spawnTime: 0.0,
        spawnDuration: 0.5
      };

      bodies.push(body);
      console.log(`Spawned health at grid[${item.col},${item.row}]: (${x.toFixed(1)}, ${y.toFixed(1)})`);
    }
  }
}
