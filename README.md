# One Inch Punch Nebula (Canvas + PWA)

This is a mobile-first HTML5 Canvas game scaffold with:
- PWA (installable, offline shell)
- One-touch thrust (hold), auto-rotate on release
- Stationary spawns (coins/hazards) attracted by your gravity
- Fewer reds (≈22%), coins ≈78%
- Hazard–hazard merge into green elites (toned down)
- Wall bounce with 5% loss
- Score (+10 coin, +25 off-screen hazard), Energy (-10% on hazard hit)
- Explosion shards + delayed safe respawn
- Wormhole appears at score 200; enter to complete level
- All non-player objects scaled to 60% radius
- Safe spawn (not near current or projected position in 0.25s)
- HUD: Energy (⚡) and Score (🪙) bars side-by-side, half-screen each

## Quick start
```bash
npm i
npm run dev -- --host
# open the Network URL on your phone
```

## Build
```bash
npm run build
npm run preview -- --host
```
