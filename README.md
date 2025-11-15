# One-Touch Gravity (Starter)

Minimal, mobile-first HTML5 Canvas game scaffold using Vite. No nested repo folders.

## Quick start

```bash
# 1) Unzip into your chosen folder (this is the repo root).
# 2) From that folder:
npm i
npm run dev
# Open the printed local URL on your phone or desktop.
```

## Build for production

```bash
npm run build
npm run preview
```

## What you get

- Fullscreen, responsive canvas (mobile-first)
- Stable game loop with delta time
- One-touch input model:
  - Press/hold: lock thrust direction from current ship angle and accelerate
  - Release: ship rotates again and applies drag (slow decel)
- Simple body spawner (coins + hazards), attraction toward ship within radius
- Garbage collection for off-screen bodies
- No heavy libs; easy to copy/paste and iterate

## File structure

```
.
├── index.html
├── package.json
├── README.md
├── public/
│   └── favicon.svg
└── src/
    ├── main.js
    ├── game.js
    └── style.css
```

Rename the folder to your game name whenever you like; there's no extra nesting.
