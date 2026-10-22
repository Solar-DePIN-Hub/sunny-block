# Sunny Block: a Solarchik game

Help **Solarchik**, the little solar robot, power his street with the sun. Install panels on the neighbours' roofs, catch sun sparks, chase off storm drones and trade energy with the robot neighbours. Prices follow the weather. At sunset the grid switches off, and the street battery has to keep every window lit until 22:00.

- **Real sun:** the sun follows today's real solar arc for Kyiv (latitude 50.45°), computed from the date (solar declination and hour angle), so days get shorter in winter.
- **Weather economy:** an hourly forecast (sunny, partly, cloudy, rain) drives both how much the panels produce and the grid price. Neighbours offer to buy or sell kWh at prices tied to the weather.
- **Short sessions:** one day takes about 3 minutes (Space for x3 speed). There's a daily seed (same sky for everyone today) or a random day. Best score is saved locally, and you can copy your result to share it.
- **No build step:** plain HTML5 canvas and ES modules. Sounds are synthesized with WebAudio, so there are no audio files.

## Run
```
python3 -m http.server 8000   # then open http://localhost:8000
```
For itch.io, upload `sunny-block-itch.zip` (index.html at the root) as an HTML5 game. Set the viewport to 960×540 and turn on the fullscreen button.

## Structure
- `src/engine.js`: reusable, theme-agnostic helpers (loop, input, rng, tweens, particles, floating text, synth audio, image loader)
- `src/sun.js`: solar geometry
- `src/config.js`: every tunable and all theme text, so the game can be re-themed fast
- `src/game.js`: simulation, UI, rendering
- `assets/`: Solarchik, the robot neighbours, the storm drone and the battery. These are resized from the Solarchik CLOCK IN art (github.com/Solar-DePIN-Hub/anna-solarchik, MIT, same author).

## Tools disclosure
Built with an AI coding agent (code) by Vadym / Solar DePIN. The character art is re-used from Solarchik CLOCK IN, the team's earlier game, and was AI-assisted there. Sounds are synthesized in code. This base was prepared on 23 Oct 2026, before any jam started. Anything made during a jam is listed in that jam's submission notes.

## License
MIT
