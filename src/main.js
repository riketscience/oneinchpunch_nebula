import { createGame } from './game.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

// Handle high-DPI rendering
function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssWidth = Math.max(1, Math.floor(window.innerWidth));
  const cssHeight = Math.max(1, Math.floor(window.innerHeight));
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // scale drawing back to CSS pixels
  if (game) game.onResize(cssWidth, cssHeight);
}
window.addEventListener('resize', resizeCanvas, { passive: true });

// Pointer input
let pointerDown = false;
function onPointerDown(e) {
  pointerDown = true;
  game?.onPress();
}
function onPointerUp(e) {
  pointerDown = false;
  game?.onRelease();
}
canvas.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('blur', () => {
  // ensure release if window loses focus
  if (pointerDown) {
    pointerDown = false;
    game?.onRelease();
  }
});

// Game loop
let last = performance.now();
let game = null;

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); // clamp to prevent big jumps
  last = now;
  game.update(dt, pointerDown);
  game.render(ctx);
  requestAnimationFrame(loop);
}

resizeCanvas();
game = createGame(canvas);
requestAnimationFrame(loop);
