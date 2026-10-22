// All tunables + theme text live here so the game can be re-themed fast during a jam.
export const CONFIG = {
  title: 'Sunny Block',
  subtitle: 'a Solarchik game',
  tagline: 'Power your street with the sun. Go off-grid by nightfall.',
  W: 960, H: 540,
  latitude: 50.45,            // Kyiv. Sun arc uses the real solar position for this latitude and today's date.
  placeName: 'Kyiv',
  dayStartHour: 6, dayEndHour: 22,
  sessionSeconds: 170,        // real seconds for the whole day
  startCoins: 140,
  panelCost: 20, panelCostGrowth: 1.12, panelKw: 1.5,
  batteryStart: 12, batteryUpgrade: 10, batteryUpgradeCost: 45, batteryUpgradeGrowth: 1.3,
  gridBasePrice: 6, feedInFactor: 0.35,
  sparkEvery: 2.6, sparkKwh: 1.5,
  offerEvery: 7, offerLife: 6.5,
  houses: [
    { name: "Solarchik's", color: '#f4a261', roof: '#9c4a2f', slots: 3, base: 0.25, evening: 0.7, you: true },
    { name: 'Granny Halya', color: '#e9c46a', roof: '#6d597a', slots: 2, base: 0.2, evening: 0.55, robot: 'frostkit' },
    { name: 'Taras',      color: '#8ecae6', roof: '#264653', slots: 3, base: 0.35, evening: 0.85, ev: true , robot: 'copperkit' },
    { name: 'Olena',      color: '#cdb4db', roof: '#7f5539', slots: 2, base: 0.25, evening: 0.6, robot: 'prismkit' },
    { name: 'Max & Ira',  color: '#b7e4c7', roof: '#3a5a40', slots: 3, base: 0.3, evening: 0.75, robot: 'mosskit' },
    { name: 'Mr. Bohdan', color: '#ffafcc', roof: '#5e548e', slots: 2, base: 0.2, evening: 0.6, robot: 'hetman' },
  ],
  weatherKinds: [
    { id: 'sun',   label: 'Sunny',   cover: 0.05, priceMul: 0.8 },
    { id: 'part',  label: 'Partly',  cover: 0.35, priceMul: 1.0 },
    { id: 'cloud', label: 'Cloudy',  cover: 0.7,  priceMul: 1.35 },
    { id: 'rain',  label: 'Rain',    cover: 0.88, priceMul: 1.7 },
  ],
  solLines: ['Charging up!', 'Sun power, go!', 'Panel installed!', 'One more roof!', 'Beep boop, free energy!'],
  stormShooHours: 1.2,
  lines: {
    sell: ['Got spare juice, want it?', 'My EV is full, take some!', 'Cheap kWh, today only!', 'Sun was kind to me :)'],
    buy:  ['Kettle emergency! Sell me some?', 'Need power for my TV show!', 'Grid is pricey, help a neighbour?', 'Laundry day, can you spare?'],
  },
};
