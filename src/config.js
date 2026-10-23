// Every tunable + all theme text lives here so the game can be re-themed fast during a jam.
export const CONFIG = {
  title: 'Sunny Block',
  subtitle: 'a Solarchik game',
  shareUrl: 'https://sunny-block.vercel.app',   // used by 'Copy result' (never location.href: on itch.io that is the iframe CDN URL)
  tagline: 'Run the roofs. Catch the sun. Keep the street lit all night.',
  W: 960, H: 540, GROUND: 434,
  latitude: 50.45, placeName: 'Kyiv',   // the sky follows today's real solar arc for this latitude
  nightEndHour: 22,   // the day opens just after today's real sunrise (world.js DAY_START)
  duskSeconds: 2.4,

  hero: { speed: 290, accel: 2400, airAccel: 1800, friction: 2600, gravity: 2100, jumpV: 800, coyote: 0.1, buffer: 0.14, stompV: 640, stompHeldV: 840 },
  economy: { startBattery: 1, batteryStart: 10, batteryUpgrade: 5, batteryUpgradeCost: 25, batteryUpgradeGrowth: 1.35, panelCost: 15, panelCostGrowth: 1.16, panelKwh: 0.07, sellPrice: 2 },
  spark: { every: 3.0, kwh: 0.35, coins: 1, life: 7, radius: 32, tapRadius: 30, max: 14 },
  combo: { window: 1.6, tiers: [0, 4, 10, 18, 28], colors: ['#ffffff', '#ffd166', '#ffb703', '#ff8fab', '#c77dff'] },
  drone: { speed: 95, hover: 78, charge: 1.7, hp: 2, coins: 5, shadow: 56 },
  leech: { speed: 120, drain: 0.4, hp: 1, coins: 8 },   // THU/FRI: flies to the street battery and siphons kWh until stomped
  cleanTime: 0.3, cleanTaps: 2,
  night: { startLight: 0.75, fillKwh: 0.42, overhead: 0.06, relight: 0.5, holdRate: 2.6, surgeDrain: 0.17, low: 0.3, pointerLoss: 1.25, resetBonus: 0.35 },   // pointer routing loses 25% on the line; Solarchik delivers lossless and is the only one who can reset a SURGE
  stars: [0.55, 0.78, 0.93],            // share of window-time lit during the night

  houses: [
    { name: "Solarchik's", color: '#f4a261', roof: '#9c4a2f', slots: 2, you: true },
    { name: 'Granny Halya', color: '#e9c46a', roof: '#6d597a', slots: 3, robot: 'frostkit' },
    { name: 'Taras', color: '#8ecae6', roof: '#264653', slots: 2, robot: 'copperkit' },
    { name: 'Olena', color: '#cdb4db', roof: '#7f5539', slots: 3, robot: 'prismkit' },
    { name: 'Max & Ira', color: '#b7e4c7', roof: '#3a5a40', slots: 2, robot: 'mosskit' },
    { name: 'Mr. Bohdan', color: '#ffafcc', roof: '#5e548e', slots: 3, robot: 'hetman' },
  ],
  roofHeights: [100, 136, 112, 144, 104, 130],

  // 5 day-levels. weather = cloud cover sampled across the day; waves = [second, drones].
  levels: [
    { day: 'MON', name: 'Sunny start', houses: 4, dayS: 48, nightS: 22, coins: 40, weather: [0.05, 0.05, 0.15, 0.05, 0.1], waves: [[14, 1], [30, 2]], droneSpeed: 1, drain: [0.07, 0.12], surgeEvery: 7 },
    { day: 'TUE', name: 'Breezy', houses: 5, dayS: 52, nightS: 24, coins: 40, weather: [0.1, 0.3, 0.1, 0.25, 0.1], waves: [[10, 1], [24, 2], [38, 2]], droneSpeed: 1.1, drain: [0.08, 0.13], surgeEvery: 6 },
    { day: 'WED', name: 'Cloud front', houses: 5, dayS: 56, nightS: 26, coins: 45, weather: [0.2, 0.45, 0.6, 0.3, 0.2], waves: [[8, 2], [22, 2], [38, 3]], droneSpeed: 1.2, drain: [0.08, 0.14], surgeEvery: 5.5 },
    { day: 'THU', name: 'Storm watch', houses: 6, dayS: 60, nightS: 28, coins: 50, weather: [0.1, 0.35, 0.5, 0.65, 0.3], waves: [[7, 2], [19, 3], [27, 1, 'leech'], [32, 3], [46, 3]], droneSpeed: 1.3, drain: [0.085, 0.14], surgeEvery: 5 },
    { day: 'FRI', name: 'The big storm', houses: 6, dayS: 64, nightS: 30, coins: 55, weather: [0.3, 0.5, 0.7, 0.5, 0.3], waves: [[6, 2], [17, 3], [23, 1, 'leech'], [29, 4], [42, 4], [48, 1, 'leech'], [54, 3]], droneSpeed: 1.45, drain: [0.09, 0.145], surgeEvery: 4.5 },
  ],
  tutorialLevel: { day: 'TUT', name: 'Training yard', houses: 3, dayS: 9999, nightS: 9999, coins: 50, weather: [0.05], waves: [], droneSpeed: 1, drain: [0, 0], surgeEvery: 999 },

  upgrades: [
    { id: 'bigbat', icon: 'battery', name: 'Big Battery', desc: '+8 kWh battery, every day', night: true },
    { id: 'magnet', icon: 'magnet', name: 'Spark Magnet', desc: 'Sparks fly to Solarchik' },
    { id: 'djump', icon: 'jump', name: 'Double Jump', desc: 'Jump again in mid-air' },
    { id: 'turbo', icon: 'sun', name: 'Turbo Panels', desc: '+30% sun power and sparks' },
    { id: 'combo', icon: 'fire', name: 'Combo Keeper', desc: 'Combos last 1 s longer' },
    { id: 'router', icon: 'bolt', name: 'Smart Router', desc: 'Night power costs 30% less', night: true },
    { id: 'shield', icon: 'shield', name: 'Surge Shield', desc: 'The first 2 surges each night reset themselves', night: true },
    { id: 'sprint', icon: 'boot', name: 'Night Sprint', desc: 'Solarchik runs 40% faster at night and powers houses 50% faster', night: true },
    { id: 'cheap', icon: 'tag', name: 'Bulk Deal', desc: 'Panels cost 25% less' },
    { id: 'boots', icon: 'boot', name: 'Thunder Boots', desc: 'Stomps zap drones nearby' },
  ],

  solLines: ['Charging up!', 'Sun power, go!', 'Panel installed!', 'One more roof!', 'Beep boop, free energy!'],
  tutorial: [
    { key: 'move', text: 'Run! Arrow keys or A / D', touch: 'Run! Hold the ◀ ▶ buttons' },
    { key: 'jump', text: 'Jump onto a roof: Up, W or Space', touch: 'Jump onto a roof: tap ⤒' },
    { key: 'build', text: 'Stand on the + slot and press E or Down (or just tap the slot)', touch: 'Stand on the + slot and tap ⚡ (or tap the slot)' },
    { key: 'spark', text: 'Grab the sun spark: run or jump into it', touch: 'Grab the sun spark: run or jump into it' },
    { key: 'drone', text: 'Storm drone! Jump from the roof and land ON it', touch: 'Storm drone! Jump from the roof and land ON it' },
    { key: 'night', text: 'Night, grid OFF: tap or drag over the fading window to power it', touch: 'Night, grid OFF: tap or drag over the fading window to power it' },
    { key: 'surge', text: 'SURGE! Taps can\'t fix it. Run Solarchik to that house and press E', touch: 'SURGE! Taps can\'t fix it. Run Solarchik to that house and tap ⚡' },
  ],
};
