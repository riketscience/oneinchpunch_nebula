// Maze level system
// Grid-based maze with binary wall encoding: top(8), right(4), bottom(2), left(1)

import { SHIP_RADIUS, HEALTH_RADIUS, OBJECT_SCALE } from './config.js';

// Maze state
let mazeWalls = [];
let mazeData = { exitCol: 0, exitRow: 8, cellW: 0, cellH: 0, startX: 0, startY: 0 };
let currentMazeConfig = null; // Store current maze configuration

/**
 * Initialize maze walls based on grid definition
 * @param {Object} mazeConfig - Maze configuration object with grid, entry, exit, items
 * @param {Function} W - Canvas width getter
 * @param {Function} H - Canvas height getter
 */
export function initMaze(mazeConfig, W, H) {
  // Store current maze configuration
  currentMazeConfig = mazeConfig;

  // Playable area starts below UI bars (topY = 32, barH = 12, so ~50px from top)
  const uiHeight = 50;
  const playableTop = uiHeight / H();
  const playableHeight = 1 - playableTop;

  // Inset walls by 3 pixels from screen edges so they're fully visible
  const insetX = 3 / W();
  const insetY = 3 / H();

  const grid = mazeConfig.grid;
  const cols = grid[0].length;
  const rows = grid.length;
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
    exitCol: mazeConfig.exit.col,
    exitRow: mazeConfig.exit.row,
    entryCol: mazeConfig.entry.col,
    entryRow: mazeConfig.entry.row,
    cellW: cellW,
    cellH: cellH,
    startX: startX,
    startY: startY,
    width: w,        // Canvas width when maze was initialized
    height: h        // Canvas height when maze was initialized
  };

  // Helper function to check if a wall is an attractor
  const isAttractorWall = (col, row, side) => {
    const attractorWalls = mazeConfig.attractorWalls || [];
    return attractorWalls.some(aw => aw.col === col && aw.row === row && aw.side === side);
  };

  // Convert grid to wall segments
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const walls = grid[row][col];
      const x = startX + col * cellW;
      const y = startY + row * cellH;

      // Top wall (bit 3 = 0b1000)
      if (walls & 0b1000) {
        mazeWalls.push({
          x1: x,
          y1: y,
          x2: x + cellW,
          y2: y,
          col, row, side: 'top',
          isAttractor: isAttractorWall(col, row, 'top')
        });
      }

      // Right wall (bit 2 = 0b0100)
      if (walls & 0b0100) {
        mazeWalls.push({
          x1: x + cellW,
          y1: y,
          x2: x + cellW,
          y2: y + cellH,
          col, row, side: 'right',
          isAttractor: isAttractorWall(col, row, 'right')
        });
      }

      // Bottom wall (bit 1 = 0b0010)
      if (walls & 0b0010) {
        mazeWalls.push({
          x1: x,
          y1: y + cellH,
          x2: x + cellW,
          y2: y + cellH,
          col, row, side: 'bottom',
          isAttractor: isAttractorWall(col, row, 'bottom')
        });
      }

      // Left wall (bit 0 = 0b0001)
      if (walls & 0b0001) {
        mazeWalls.push({
          x1: x,
          y1: y,
          x2: x,
          y2: y + cellH,
          col, row, side: 'left',
          isAttractor: isAttractorWall(col, row, 'left')
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
function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * vx;
  const cy = ay + t * vy;
  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

function isWallAdjacentToCell(wall, cellCol, cellRow) {
  // Top wall of cell (or bottom wall of cell above)
  if ((wall.side === 'top' && wall.row === cellRow && wall.col === cellCol) ||
      (wall.side === 'bottom' && wall.row === cellRow - 1 && wall.col === cellCol)) {
    return true;
  }
  // Right wall of cell (or left wall of cell to the right)
  if ((wall.side === 'right' && wall.row === cellRow && wall.col === cellCol) ||
      (wall.side === 'left' && wall.row === cellRow && wall.col === cellCol + 1)) {
    return true;
  }
  // Bottom wall of cell (or top wall of cell below)
  if ((wall.side === 'bottom' && wall.row === cellRow && wall.col === cellCol) ||
      (wall.side === 'top' && wall.row === cellRow + 1 && wall.col === cellCol)) {
    return true;
  }
  // Left wall of cell (or right wall of cell to the left)
  if ((wall.side === 'left' && wall.row === cellRow && wall.col === cellCol) ||
      (wall.side === 'right' && wall.row === cellRow && wall.col === cellCol - 1)) {
    return true;
  }

  return false;
}

export function renderMaze(ctx, W, H, phase, ship = null) {
  if (mazeWalls.length === 0) return;
  // Only render maze during active gameplay (not on start screen)
  if (phase === 'start' || phase === 'startCountdown') return;

  const w = W();
  const h = H();
  const time = performance.now() * 0.001;
  const cellPxW = mazeData.cellW * w;
  const cellPxH = mazeData.cellH * h;

  let shipCell = null;
  if (ship && cellPxW > 0 && cellPxH > 0) {
    const shipNormX = ship.x / w;
    const shipNormY = ship.y / h;
    const shipCol = Math.floor((shipNormX - mazeData.startX) / mazeData.cellW);
    const shipRow = Math.floor((shipNormY - mazeData.startY) / mazeData.cellH);
    const grid = currentMazeConfig?.grid;
    const cols = grid?.[0]?.length ?? 0;
    const rows = grid?.length ?? 0;
    if (shipCol >= 0 && shipCol < cols && shipRow >= 0 && shipRow < rows) {
      shipCell = { col: shipCol, row: shipRow };
    }
  }

  ctx.save();
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  for (const wall of mazeWalls) {
    if (wall.isAttractor) {
      // Attractor walls: pulsating purple-tinted blue (lighter than normal walls)
      const attractorAlpha = 0.7 + 0.25 * Math.sin(Math.PI * time * 2); // Faster pulsation
      ctx.strokeStyle = `rgba(190, 30, 255, ${attractorAlpha})`; // Purple-tinted blue
      ctx.lineWidth = 4; // Slightly thicker to make them more visible
    } else {
      // Normal walls: bright blue with throb
      const alpha = 0.7 + 0.2 * Math.sin(Math.PI * time);
      ctx.strokeStyle = `rgba(0, 204, 255, ${alpha})`;
      ctx.lineWidth = 3;
    }

    ctx.beginPath();
    ctx.moveTo(wall.x1 * w, wall.y1 * h);
    ctx.lineTo(wall.x2 * w, wall.y2 * h);
    ctx.stroke();

    if (wall.isAttractor && shipCell && isWallAdjacentToCell(wall, shipCell.col, shipCell.row)) {
      const x1 = wall.x1 * w;
      const y1 = wall.y1 * h;
      const x2 = wall.x2 * w;
      const y2 = wall.y2 * h;
      const midX = (x1 + x2) * 0.5;
      const midY = (y1 + y2) * 0.5;
      const wallLen = Math.hypot(x2 - x1, y2 - y1);
      const arcRadius = Math.max(10, wallLen * 0.48);
      const flatScale = 0.28;
      const offset = Math.max(4, arcRadius * 0.18);
      const isVertical = Math.abs(x2 - x1) < Math.abs(y2 - y1);
      let cx = midX;
      let cy = midY;
      let startAngle = 0;
      let endAngle = 0;
      if (isVertical) {
        const normalX = ship.x < x1 ? -1 : 1;
        cx += normalX * offset;
        startAngle = normalX > 0 ? -Math.PI / 2 : Math.PI / 2;
        endAngle = normalX > 0 ? Math.PI / 2 : Math.PI * 1.5;
      } else {
        const normalY = ship.y < y1 ? -1 : 1;
        cy += normalY * offset;
        startAngle = normalY > 0 ? 0 : Math.PI;
        endAngle = normalY > 0 ? Math.PI : Math.PI * 2;
      }

      const dist = pointToSegmentDistance(ship.x, ship.y, x1, y1, x2, y2);
      const maxDist = Math.max(cellPxW, cellPxH) * 0.5 || 1;
      const closeT = Math.max(0, Math.min(1, 1 - dist / maxDist));
      const baseR = 190;
      const baseG = 30;
      const baseB = 255;
      const hotR = 255;
      const hotG = 60;
      const hotB = 60;
      const r = Math.round(baseR + (hotR - baseR) * closeT);
      const g = Math.round(baseG + (hotG - baseG) * closeT);
      const b = Math.round(baseB + (hotB - baseB) * closeT);
      const pulse = 0.7 + 0.25 * Math.sin(Math.PI * time * 2);
      const arcAlpha = (0.45 + 0.45 * closeT) * pulse;

      ctx.save();
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${arcAlpha})`;
      ctx.lineWidth = 2.5;
      ctx.translate(cx, cy);
      if (isVertical) {
        ctx.scale(flatScale, 1);
      } else {
        ctx.scale(1, flatScale);
      }
      ctx.beginPath();
      ctx.arc(0, 0, arcRadius, startAngle, endAngle);
      ctx.stroke();
      ctx.restore();
    }
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
  if (!currentMazeConfig || !currentMazeConfig.items) return;

  const w = W();
  const h = H();

  for (const item of currentMazeConfig.items) {
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

/**
 * Apply mild attraction force from attractor walls when ship is in adjacent cell
 * @param {Object} ship - Ship object with x, y, vx, vy
 * @param {number} dt - Delta time
 * @param {Function} W - Canvas width getter
 * @param {Function} H - Canvas height getter
 */
export function applyAttractorWallForce(ship, dt, W, H) {
  if (mazeWalls.length === 0 || !currentMazeConfig || !currentMazeConfig.grid) return;

  const w = W();
  const h = H();

  // Calculate which grid cell the ship is in
  const shipNormX = ship.x / w;
  const shipNormY = ship.y / h;
  const shipCol = Math.floor((shipNormX - mazeData.startX) / mazeData.cellW);
  const shipRow = Math.floor((shipNormY - mazeData.startY) / mazeData.cellH);

  const grid = currentMazeConfig.grid;
  const cols = grid[0].length;
  const rows = grid.length;

  // Check if ship is in valid grid bounds
  if (shipCol < 0 || shipCol >= cols || shipRow < 0 || shipRow >= rows) return;

  // Strong constant attraction force (much higher to be noticeable)
  const attractorForce = 40;

  for (const wall of mazeWalls) {
    if (!wall.isAttractor) continue;

    // Check if wall is a boundary of the ship's current cell
    // This includes walls owned by the current cell AND walls from adjacent cells
    let isAdjacent = false;

    // Top wall of ship's cell (or bottom wall of cell above)
    if ((wall.side === 'top' && wall.row === shipRow && wall.col === shipCol) ||
        (wall.side === 'bottom' && wall.row === shipRow - 1 && wall.col === shipCol)) {
      isAdjacent = true;
    }
    // Right wall of ship's cell (or left wall of cell to the right)
    else if ((wall.side === 'right' && wall.row === shipRow && wall.col === shipCol) ||
             (wall.side === 'left' && wall.row === shipRow && wall.col === shipCol + 1)) {
      isAdjacent = true;
    }
    // Bottom wall of ship's cell (or top wall of cell below)
    else if ((wall.side === 'bottom' && wall.row === shipRow && wall.col === shipCol) ||
             (wall.side === 'top' && wall.row === shipRow + 1 && wall.col === shipCol)) {
      isAdjacent = true;
    }
    // Left wall of ship's cell (or right wall of cell to the left)
    else if ((wall.side === 'left' && wall.row === shipRow && wall.col === shipCol) ||
             (wall.side === 'right' && wall.row === shipRow && wall.col === shipCol - 1)) {
      isAdjacent = true;
    }

    if (!isAdjacent) continue;

    // Convert wall coordinates to pixels
    const wallX1 = wall.x1 * w;
    const wallY1 = wall.y1 * h;
    const wallX2 = wall.x2 * w;
    const wallY2 = wall.y2 * h;

    // Calculate closest point on the wall segment to the ship
    const wallDx = wallX2 - wallX1;
    const wallDy = wallY2 - wallY1;
    const wallLen2 = wallDx * wallDx + wallDy * wallDy;

    if (wallLen2 === 0) continue; // Degenerate wall

    // Project ship position onto wall line
    const shipToWallStartX = ship.x - wallX1;
    const shipToWallStartY = ship.y - wallY1;
    let t = (shipToWallStartX * wallDx + shipToWallStartY * wallDy) / wallLen2;
    t = Math.max(0, Math.min(1, t)); // Clamp to [0, 1]

    // Closest point on wall
    const closestX = wallX1 + t * wallDx;
    const closestY = wallY1 + t * wallDy;

    // Calculate perpendicular direction from ship to wall
    const dx = closestX - ship.x;
    const dy = closestY - ship.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0.1) {
      // Apply strong perpendicular attraction force toward the wall
      const forceX = (dx / dist) * attractorForce * dt;
      const forceY = (dy / dist) * attractorForce * dt;
      ship.vx += forceX;
      ship.vy += forceY;
    }
  }
}
