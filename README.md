# Dawn of Dynasties

A mobile-first medieval real-time strategy game in the spirit of the classic isometric RTS games.
Pure HTML5 canvas + JavaScript, no build step, no image files (all art is drawn in code).

## Play
- **Online:** enable GitHub Pages (Settings → Pages → Branch: `main`, folder `/`), then open
  `https://forgeframehq.github.io/rts-game/` on your phone. Use "Add to Home Screen" for full-screen play.
- **Locally:** open `index.html` in a browser.

## Features
- 4 civilizations (Britons, Franks, Byzantines, Chinese) with unique bonuses
- Villagers gather food, wood, gold and stone; farms, mills, lumber and mining camps
- Barracks, Archery Range, Stable, Watch Tower; Swordsmen, Spearmen, Archers, Knights with counters
- Computer opponent (Easy / Normal / Hard) that builds an economy and sends attack waves
- Fog of war, minimap, rally points, production queues

## Controls
| Touch | Desktop |
|---|---|
| Tap to select / command | Left-click select, right-click command |
| Drag to pan, pinch to zoom | WASD/arrows pan, wheel zoom |
| Press-and-hold then drag to box-select | Drag to box-select |
| Double-tap a unit: select all of that type | Shift-click to add to selection |

## Plans
- `ROADMAP.md`: roadmap, unit roster and the reuse plan for art and animation
- `ASSETS.md`: art specification

## Code layout
- `js/data.js` – civs, units, buildings, costs
- `js/map.js` – map, fog of war, A* pathfinding
- `js/entities.js` – units, economy, combat
- `js/sprites.js` – procedural art
- `js/render.js` – camera & drawing
- `js/ai.js` – computer opponent
- `js/game.js` – setup and main loop
- `js/ui.js` – HUD, input, menus
