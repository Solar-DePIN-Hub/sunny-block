// JAM THEME SLOT. Bolt the jam theme in here without touching the core.
// Every hook receives (S, api). api = { C, G, fx, sfx, showBanner, spawnSpark, spawnDrone, hitCombo, buildSlot }.
// S is the live level state (houses, slots, windows, hero, sparks, drones, combo, coins, battery, phase...).
export const THEME = {
  id: 'base',
  name: '',                    // shown under the title when set, e.g. 'Theme: ...'
  mods: { sparkValue: 1, droneSpeed: 1, drainRate: 1, gravity: 1, panelPower: 1 },
  onLevelStart(S, api) {},     // after a day is built
  onUpdate(S, dt, api) {},     // every sim tick while playing (day, dusk and night)
  onSpark(S, spark, api) {},   // after a spark is collected
  onDroneKilled(S, drone, api) {},
  onNightStart(S, api) {},
  onLevelEnd(S, api) {},       // before stars are saved; may tweak S.lit
  drawWorld(ctx, S, api) {},   // after houses, before actors
  drawHUD(ctx, S, api) {},     // on top of the HUD
};
