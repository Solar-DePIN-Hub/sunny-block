# Sunny Block: a Solarchik game

Run across the roofs as **Solarchik**, the little solar robot, and keep your street lit through the night.

**Day:** build panels on the neighbours' roofs, catch the sun sparks they throw off, and stomp the storm drones that try to cover your panels with goo. Chain sparks, stomps and cleans for a **combo multiplier** (x1 to x5). Everything you catch fills the street battery.
**Night:** at the real Kyiv sunset the grid switches off. Windows start going dark one by one, and you **route energy** from the battery to them by tapping, dragging or holding over a window, or by holding the action key in front of a house. Every tap has some overhead, and surges drain fast, so you have to decide when to top up. Stars come from how much of the night stayed lit.

- **5 days (MON to FRI):** each day adds houses, storm waves and night pressure. Each day gives 1 to 3 stars (55% / 78% / 93% of the night lit), and clearing a day for the first time lets you pick **1 of 3 upgrades**: Double Jump, Spark Magnet, Combo Keeper, Big Battery, Turbo Panels, Smart Router, Cheap Panels or Storm Boots. Progress is saved in localStorage.
- **Fast start:** you can play within a second. There's a 20-second interactive tutorial (move, jump, build, catch, stomp, power a window) with a Skip button.
- **Real sun:** today's real solar arc for Kyiv (latitude 50.45°) sets when the day ends.
- **No build step:** plain HTML5 canvas and ES modules. Sound effects and music are synthesized with WebAudio.

## Controls
| | Keyboard | Phone / mouse |
|---|---|---|
| Run | ← → / A D | ◀ ▶ buttons |
| Jump (double jump with upgrade) | ↑ / W / Space | JUMP button |
| Build panel / clean / power windows | E / ↓ / S | BUILD button, or tap the slot or window directly |
| Sparks, drones | run into or stomp them | tap them |
| Pause / sound | P or Esc / M | II button |

## Run
```
python3 -m http.server 8000   # then open http://localhost:8000
```
For itch.io, upload `sunny-block-itch.zip` (index.html at the root) as an HTML5 game. Set the viewport to 960×540 and turn on the fullscreen button. Add `?touch=1` to the URL to force the on-screen controls.

## Structure
- `src/engine.js`: theme-agnostic helpers (loop, multi-pointer and keyboard input, rng, tweens, particles, synth sound effects and music)
- `src/config.js`: every tunable (physics, economy, combo, drones, night, 5 levels, upgrades, tutorial text)
- `src/theme.js`: **the jam-theme hook**. It has modifiers (spark value, drone speed, drain, gravity, panel power) and callbacks (`onLevelStart`, `onUpdate`, `onSpark`, `onDroneKilled`, `onNightStart`, `onLevelEnd`, `drawWorld`, `drawHUD`), so a theme mechanic can be added without touching the core.
- `src/core.js`: shared state, saves, controls and drawing helpers
- `src/world.js`: sky, weather, houses, roofs (platforms), windows and the street battery
- `src/actors.js`: Solarchik (platforming), sparks and combo, storm drones
- `src/night.js`: the night finale (window drain, surges, energy routing)
- `src/ui.js`: HUD, title, tutorial, result, upgrade and pause screens
- `src/game.js`: state machine, levels, tutorial script, input routing and render order
- `assets/`: Solarchik, the robot neighbours, the storm drone and the battery, resized from the Solarchik CLOCK IN art (github.com/Solar-DePIN-Hub/anna-solarchik, MIT, same author)

`window.__sunny` exposes state for automated tests. Headless-browser bot plays check three things: a good player gets 3★ on every day, an idle player gets 0★, and the tutorial can be finished with real keys.

## Tools disclosure
Built with an AI coding agent (code) by Vadym / Solar DePIN. The character art is re-used from Solarchik CLOCK IN, the team's earlier game, and was AI-assisted there. Sound effects and music are synthesized in code. This base was prepared on 23 Oct 2026, before the jam theme was announced. Anything made during the jam is listed in the submission notes.

## License
MIT
