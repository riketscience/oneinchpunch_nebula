const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const cssWidth  = Math.max(1, Math.floor(vw));
  const cssHeight = Math.max(1, Math.floor(vh));
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (game) game.onResize(cssWidth, cssHeight);
}
window.addEventListener('resize', resizeCanvas, { passive: true });
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resizeCanvas, { passive: true });
  window.visualViewport.addEventListener('scroll', resizeCanvas, { passive: true });
}

let pointerDown = false;
function onPointerDown(e) { pointerDown = true; game?.onPress(e.clientX, e.clientY); }
function onPointerUp(e) { pointerDown = false; game?.onRelease(e.clientX, e.clientY); }
canvas.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('blur', () => { if (pointerDown) { pointerDown = false; game?.onRelease(); } });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW registration failed:', err));
  });
}

import { createGame } from './game.js';

let last = performance.now();
let game = null;

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt, pointerDown);
  game.render(ctx);
  requestAnimationFrame(loop);
}

resizeCanvas();
game = createGame(canvas);
requestAnimationFrame(loop);
