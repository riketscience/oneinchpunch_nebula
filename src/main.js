import { createGame } from './game.js';
const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d',{alpha:false});
function resize(){ canvas.width=window.innerWidth; canvas.height=window.innerHeight; game.onResize(canvas.width,canvas.height); }
window.addEventListener('resize',resize);
let down=false;
canvas.addEventListener('pointerdown',()=>{down=true; game.onPress();});
window.addEventListener('pointerup',()=>{down=false; game.onRelease();});
let last=performance.now(); let game=createGame(canvas);
function loop(t){ const dt=Math.min(0.05,(t-last)/1000); last=t; game.update(dt,down); game.render(ctx); requestAnimationFrame(loop);}
resize(); requestAnimationFrame(loop);
