import { createGame } from './game.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

let game = null;

// Track separate inputs
let pointerDown = false;
let keyDown = false; // space bar

function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const cssWidth = Math.max(1, Math.floor(vw));
  const cssHeight = Math.max(1, Math.floor(vh));

  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';

  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (game && game.onResize) {
    game.onResize(cssWidth, cssHeight);
  }
}

// Pointer / touch
function onPointerDown(e) {
  pointerDown = true;
  // Always pass coords so Start / Restart buttons work
  if (game && game.onPress) {
    game.onPress(e.clientX, e.clientY);
  }
}

function onPointerUp(e) {
  pointerDown = false;
  // Only release thrust if space isn’t still held
  if (!keyDown && game && game.onRelease) {
    game.onRelease(e.clientX, e.clientY);
  }
}

// Keyboard (space)
function onKeyDown(e) {
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    if (!keyDown) {
      keyDown = true;
      // For keyboard we don’t need coords; game ignores them in 'playing'
      if (game && game.onPress) {
        game.onPress();
      }
    }
  }
}

function onKeyUp(e) {
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    if (keyDown) {
      keyDown = false;
      // Only release thrust if pointer isn’t still down
      if (!pointerDown && game && game.onRelease) {
        game.onRelease();
      }
    }
  }
}

// Stop thrust if window loses focus
window.addEventListener('blur', () => {
  if (pointerDown || keyDown) {
    pointerDown = false;
    keyDown = false;
    if (game && game.onRelease) {
      game.onRelease();
    }
  }
});

// Canvas / viewport events
window.addEventListener('resize', resizeCanvas, { passive: true });

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resizeCanvas, { passive: true });
  window.visualViewport.addEventListener('scroll', resizeCanvas, { passive: true });
}

canvas.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointerup', onPointerUp);

// Keyboard events
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);

// Service worker (unchanged)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch(err => console.warn('SW registration failed:', err));
  });
}

// Game loop
let last = performance.now();

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (game) {
    // second arg is unused by game but harmless
    game.update(dt, pointerDown || keyDown);
    game.render(ctx);
  }

  requestAnimationFrame(loop);
}

resizeCanvas();
game = createGame(canvas);
requestAnimationFrame(loop);
