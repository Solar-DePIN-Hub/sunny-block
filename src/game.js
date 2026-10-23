import { CONFIG as C } from './config.js';
import { mulberry32, clamp, lerp, lerpColor, easeOutBack, easeOutCubic, dateSeed, createStage, startLoop, createInput, createTweens, createFx, createAudio, roundRect, inRect, loadImages, font, store } from './engine.js';
import { dayOfYear, elevation, sunriseSunset, fmtHour } from './sun.js';

const canvas = document.getElementById('game');
const stage = createStage(canvas, C.W, C.H);
const ctx = stage.ctx;
const input = createInput(canvas, stage);
const tweens = createTweens();
const fx = createFx();
const sfx = createAudio();
const today = new Date();
const DOY = dayOfYear(today);
const SUN = sunriseSunset(C.latitude, DOY);
const OFFGRID = Math.round(SUN.sunset * 4) / 4;   // grid switches off at (real) sunset
const MAX_EL = elevation(C.latitude, DOY, 12);
const GROUND = 418;
const IMG = loadImages({
  solFront: 'sol-front.png', solJump: 'sol-jump.png', storm: 'storm.png', battery: 'battery.png',
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`run${i + 1}`, `sol-run-${i + 1}.png`])),
  ...Object.fromEntries(['copperkit', 'frostkit', 'mosskit', 'prismkit', 'hetman'].map(k => [k, `${k}.png`])),
});
function sprite(key, x, y, h, flip = false, alpha = 1) { // x = centre, y = feet
  if (!IMG.ready(key)) return false; const im = IMG[key], w = im.naturalWidth * h / im.naturalHeight;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); if (flip) ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore(); return true;
}
const best = () => +(store.get('sb-best') || 0);

let S = null;           // game state
let mode = 'title';     // title | play | end
let titleT = 0;
const MAX_SPARKS = 10;  // on-screen cap so the sky never turns into confetti at x3
const SPARK_R = 26;     // hit radius (finger friendly)

// ---------- world setup ----------
function buildHouses() {
  const w = 118, gap = 32, x0 = (C.W - (C.houses.length * w + (C.houses.length - 1) * gap)) / 2;
  return C.houses.map((h, i) => {
    const bodyH = 92 + ((i * 37) % 3) * 14, x = x0 + i * (w + gap), top = GROUND - bodyH;
    const roofRise = 38, house = { ...h, i, x, w, top, bodyH, roofRise, panels: [], lit: 1, litA: 1, bob: Math.random() * 6, jump: 0, offer: null };
    house.slotsPos = Array.from({ length: h.slots }, (_, k) => {
      const t = (k + 0.5) / h.slots;
      const sx = lerp(x - 6, x + w + 6, t), sy = lerp(top, top - roofRise, t) - 7;
      return { x: sx, y: sy, placed: false, scale: 0, glow: 0 };
    });
    return house;
  });
}
function buildWeather(rng) {
  const hours = [], K = C.weatherKinds;
  let k = Math.floor(rng() * 3);
  for (let h = 0; h < 25; h++) {
    const r = rng();
    if (r < 0.3) k = clamp(k + (rng() < 0.5 ? -1 : 1), 0, K.length - 1);
    else if (r < 0.36) k = Math.floor(rng() * K.length);
    hours.push(k);
  }
  return hours;
}
function newGame(daily) {
  const seed = daily ? dateSeed(today) : (Math.random() * 1e9) | 0;
  const rng = mulberry32(seed);
  S = {
    daily, seed, rng, hour: C.dayStartHour, speed: 1, coins: C.startCoins,
    battery: 4, cap: C.batteryStart, capCost: C.batteryUpgradeCost,
    panelCost: C.panelCost, houses: buildHouses(), weather: buildWeather(rng),
    clouds: Array.from({ length: 9 }, () => ({ x: rng() * C.W, y: 40 + rng() * 120, s: 0.6 + rng() * 0.9, v: 8 + rng() * 14 })),
    rain: [], sparks: [], sparkT: 1.5, offerT: 4, gridOff: false, warned: false,
    stats: { produced: 0, gridKwh: 0, gridCost: 0, deals: 0, sparks: 0, sparkKwh: 0, sparkCoins: 0, litNeed: 0, litGot: 0, panels: 0, sold: 0 },
    prod: 0, demand: 0, darkPrev: 0, banner: null, endT: 0,
    hero: { x: 150, target: 150, facing: 1, frame: 0, jump: 0, say: null, sayT: 0 },
    storm: { x: -200, y: 120, active: false, shoo: 0, flee: 0 }, stormHits: 0,
    flyers: [], ui: { batPulse: 0, coinPulse: 0, coinShown: C.startCoins, starPop: [0, 0, 0], card: 0 },
  };
  mode = 'play';
  showBanner('Tap a glowing roof slot to install a solar panel', '#ffd166');
}
function showBanner(text, color = '#fff', dur = 3.2) { S.banner = { text, color, t: dur, max: dur, y: 0 }; tweens.add(S.banner, 'y', -40, 0, 0.5, easeOutBack); }

// ---------- simulation ----------
const gauss = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s));
function weatherAt(h) { const i = clamp(Math.floor(h), 0, 24), f = clamp(h - i, 0, 1); const a = C.weatherKinds[S.weather[i]], b = C.weatherKinds[S.weather[Math.min(24, i + 1)]]; return { cover: lerp(a.cover, b.cover, f), priceMul: lerp(a.priceMul, b.priceMul, f), kind: a }; }
function gridPrice(h) { return C.gridBasePrice * weatherAt(h).priceMul * (1 + 0.45 * gauss(h, 19.5, 1.5) + 0.2 * gauss(h, 8, 1)); }
function sunFactor(h) { const el = elevation(C.latitude, DOY, h); return el <= 0 ? 0 : Math.sin(el * Math.PI / 180) / Math.sin(Math.max(MAX_EL, 20) * Math.PI / 180); }
function houseDemand(hs, h) { return hs.base + 0.35 * gauss(h, 7.6, 0.9) + hs.evening * gauss(h, 19.4, 1.8) + (hs.ev ? 0.9 * gauss(h, 18.8, 0.8) : 0); }
const feedInPrice = h => gridPrice(h) * C.feedInFactor;

function step(dt) {
  const dH = (C.dayEndHour - C.dayStartHour) / C.sessionSeconds * dt * S.speed;
  const h = S.hour, w = weatherAt(h), sun = sunFactor(h);
  const cover = S.storm.shoo > 0 ? w.cover * 0.35 : w.cover;
  const panels = S.houses.reduce((a, hs) => a + hs.panels.length, 0);
  S.prod = panels * C.panelKw * sun * (1 - cover);
  S.demand = S.houses.reduce((a, hs) => a + houseDemand(hs, h), 0);
  const net = (S.prod - S.demand) * dH, use = S.demand * dH;
  S.stats.produced += S.prod * dH;
  const price = gridPrice(h);
  if (net >= 0) {
    const room = Math.max(0, S.cap - S.battery), put = Math.min(room, net); S.battery += put;
    const extra = net - put; if (extra > 0 && !S.gridOff) { const earn = extra * price * C.feedInFactor; S.coins += earn; S.stats.sold += extra; }
    S.houses.forEach(hs => hs.lit = 1); S.darkPrev = 0;
    if (S.gridOff) { S.stats.litNeed += use; S.stats.litGot += use; }
  } else {
    const need = -net, take = Math.min(S.battery, need); S.battery -= take; const short = need - take;
    if (short > 0 && !S.gridOff) { S.coins -= short * price; S.stats.gridKwh += short; S.stats.gridCost += short * price; S.houses.forEach(hs => hs.lit = 1); }
    else if (short > 0) {
      // Grid off: sun + battery cover part of the street, the rest goes dark.
      const frac = 1 - short / use;
      const darkCount = clamp(Math.round((1 - frac) * S.houses.length), 0, S.houses.length);
      S.houses.forEach((hs, i) => hs.lit = i < S.houses.length - darkCount ? 1 : 0);
      if (darkCount > S.darkPrev) { fx.shake(8); sfx.dark(); fx.text(C.W / 2, 250, 'Blackout!', '#ff6b6b', 26); }
      S.darkPrev = darkCount;
    } else { S.houses.forEach(hs => hs.lit = 1); S.darkPrev = 0; }
    // "lit" share = energy actually delivered (sun + battery) / total street demand after grid-off
    if (S.gridOff) { S.stats.litNeed += use; S.stats.litGot += use - short; }
  }
  S.battery = clamp(S.battery, 0, S.cap);

  S.hour += dH;
  if (!S.warned && S.hour >= OFFGRID - 1) { S.warned = true; showBanner(`Grid switches OFF at ${fmtHour(OFFGRID)}. Fill the battery!`, '#ffb703', 3.5); sfx.tick(); }
  if (!S.gridOff && S.hour >= OFFGRID) { S.gridOff = true; showBanner('GRID OFF: keep the street lit until 22:00', '#ff8fab', 3.8); fx.shake(6); sfx.dark(); }
  if (S.hour >= C.dayEndHour) { endGame(); return; }

  // sparks: clickable bursts of sunshine from working panels
  S.sparkT -= dt * S.speed;
  if (S.sparkT <= 0) {
    S.sparkT = C.sparkEvery * (0.7 + S.rng() * 0.6);
    const withP = S.houses.filter(hs => hs.panels.length); const hs = withP[(S.rng() * withP.length) | 0];
    if (hs && S.prod > 0.3 && S.sparks.length < MAX_SPARKS) {
      const sp = hs.slotsPos[hs.panels[(S.rng() * hs.panels.length) | 0]];
      S.sparks.push({ x: sp.x, y: sp.y, vy: -28, life: 4.2, max: 4.2, wob: S.rng() * 6, born: 0 });
    }
  }
  for (let i = S.sparks.length - 1; i >= 0; i--) { const s = S.sparks[i]; s.life -= dt; s.born += dt; s.y += s.vy * dt; s.wob += dt * 4; if (s.life <= 0) S.sparks.splice(i, 1); }

  // neighbour offers: weather-driven prices
  S.offerT -= dt * S.speed;
  if (S.offerT <= 0 && S.hour < C.dayEndHour - 0.5) {
    S.offerT = C.offerEvery * (0.7 + S.rng() * 0.6);
    const free = S.houses.filter(hs => !hs.you && !hs.offer); const hs = free[(S.rng() * free.length) | 0];
    if (hs) {
      const sell = S.gridOff ? S.rng() < 0.25 : S.rng() < 0.55, qty = 2 + ((S.rng() * 4) | 0);
      const unit = price * (sell ? 0.5 + S.rng() * 0.3 : 1.05 + S.rng() * 0.45);
      const lines = sell ? C.lines.sell : C.lines.buy;
      hs.offer = { sell, qty, total: Math.max(1, Math.round(unit * qty)), life: C.offerLife, line: lines[(S.rng() * lines.length) | 0], pop: 0 };
      tweens.add(hs.offer, 'pop', 0, 1, 0.4, easeOutBack); hs.jump = 1; sfx.tick();
    }
  }
  S.houses.forEach(hs => {
    if (hs.offer) { hs.offer.life -= dt; if (hs.offer.life <= 0) hs.offer = null; }
    hs.jump = Math.max(0, hs.jump - dt * 2); hs.litA += (hs.lit - hs.litA) * Math.min(1, dt * 6);
  });

  // storm drone: rolls in on cloudy/rainy hours, tap it to chase it away
  const st = S.storm; st.shoo = Math.max(0, st.shoo - dH);
  if (!st.active && st.shoo <= 0 && w.cover > 0.6 && sun > 0 && S.hour < OFFGRID) { st.active = true; st.x = -160; st.y = 175 + S.rng() * 40; st.flee = 0; showBanner('Storm drone! Tap it to chase the clouds away', '#8ecae6', 2.8); }
  if (st.active) {
    if (st.flee > 0) { st.flee += dt; st.x += 700 * dt; st.y -= 200 * dt; if (st.x > C.W + 200) st.active = false; }
    else { st.x += (C.W * 0.45 - st.x) * Math.min(1, dt * 0.8); if (w.cover < 0.3 || sun <= 0) st.flee = 0.01; }
  }
  // weather visuals
  S.clouds.forEach(c => { c.x += c.v * dt; if (c.x > C.W + 120) c.x = -120; });
  if (w.kind.id === 'rain') { S.rainAcc = (S.rainAcc || 0) + dt * 180; while (S.rainAcc >= 1) { S.rainAcc--; S.rain.push({ x: Math.random() * (C.W + 60), y: -10, v: 420 + Math.random() * 120 }); } }
  for (let i = S.rain.length - 1; i >= 0; i--) { const r = S.rain[i]; r.y += r.v * dt; r.x -= r.v * 0.25 * dt; if (r.y > GROUND) S.rain.splice(i, 1); }
}

function updateHero(dt) {
  const hero = S.hero, dx = hero.target - hero.x;
  if (Math.abs(dx) > 4) { hero.x += Math.sign(dx) * Math.min(Math.abs(dx), 260 * dt); hero.facing = Math.sign(dx); hero.frame += dt * 14; }
  else if (hero.pendingJump) { hero.pendingJump = false; hero.jump = 1; }
  hero.jump = Math.max(0, hero.jump - dt * 1.8); hero.sayT -= dt; if (hero.sayT <= 0) hero.say = null;
}

// ---------- flyers: collected energy/coins visibly travel to the HUD ----------
const HUD_BAT = { x: 236, y: 504 }, HUD_COIN = { x: 34, y: 504 };
function fly(x, y, to, color, onArrive, delay = 0) {
  S.flyers.push({ x0: x, y0: y, x, y, to, color, t: -delay, dur: 0.55 + Math.random() * 0.15, cx: lerp(x, to.x, 0.3) + (Math.random() - 0.5) * 120, cy: Math.min(y, to.y) - 80 - Math.random() * 60, onArrive, trail: [] });
}
function updateFlyers(dt) {
  for (let i = S.flyers.length - 1; i >= 0; i--) {
    const f = S.flyers[i]; f.t += dt; if (f.t < 0) continue;
    const k = easeOutCubic(clamp(f.t / f.dur, 0, 1)), u = 1 - k;
    f.x = u * u * f.x0 + 2 * u * k * f.cx + k * k * f.to.x; f.y = u * u * f.y0 + 2 * u * k * f.cy + k * k * f.to.y;
    f.trail.push({ x: f.x, y: f.y }); if (f.trail.length > 7) f.trail.shift();
    if (f.t >= f.dur) { f.onArrive?.(); S.flyers.splice(i, 1); }
  }
}

// Collecting a sun ALWAYS pays: energy goes into the battery; whatever does not fit is sold
// at the feed-in price (the same rule the panels use for surplus), rounded up to a whole coin.
function collectSpark(s, sx) {
  const room = Math.max(0, S.cap - S.battery), kwh = Math.min(C.sparkKwh, room), over = C.sparkKwh - kwh;
  const coins = over > 0.01 ? Math.max(1, Math.ceil(over * feedInPrice(S.hour))) : 0;
  S.battery += kwh; S.coins += coins; S.stats.sparks++; S.stats.sparkKwh += kwh; S.stats.sparkCoins += coins;
  fx.burst(sx, s.y, '#ffd166', 18, 170, 0.6, 3, 60); fx.burst(sx, s.y, '#fff6c2', 8, 90, 0.4, 2, 0);
  const kShown = Math.round(kwh * 10) / 10; // never print "+0.0 kWh"
  const label = kShown > 0 && coins ? `+${kShown.toFixed(1)} kWh +${coins} coins` : kShown > 0 ? `+${kShown.toFixed(1)} kWh` : `Battery full: +${coins} coins`;
  fx.text(sx, s.y - 14, label, kShown > 0 ? '#ffd166' : '#ffe08a', 17);
  sfx.spark();
  if (kShown > 0) for (let j = 0; j < 3; j++) fly(sx, s.y, HUD_BAT, '#ffe066', () => { S.ui.batPulse = 1; if (j === 0) sfx.charge(); }, j * 0.06);
  if (coins) for (let j = 0; j < Math.min(4, coins); j++) fly(sx, s.y, HUD_COIN, '#ffc94d', () => { S.ui.coinPulse = 1; if (j === 0) sfx.coin(); }, 0.05 + j * 0.07);
  if (S.stats.sparks === 1) showBanner('Sparks charge the battery. When it is full, they sell for coins.', '#ffd166', 3.4);
}

function solSay(t) { S.hero.say = t; S.hero.sayT = 1.8; }
function endGame() {
  S.hour = C.dayEndHour; mode = 'end'; S.endT = 0; S.sparks.length = 0; S.flyers.length = 0;
  S.houses.forEach(hs => hs.offer = null);
  const lit = S.stats.litNeed > 0 ? clamp(S.stats.litGot / S.stats.litNeed, 0, 1) : 1;
  S.lit = lit;
  S.score = Math.max(0, Math.round(lit * 1000 + S.coins * 2 + S.battery * 10 + S.stats.deals * 15));
  S.stars = lit >= 0.99 ? 3 : lit >= 0.8 ? 2 : lit >= 0.5 ? 1 : 0;
  S.prevBest = best(); S.newBest = S.score > S.prevBest; if (S.newBest) store.set('sb-best', S.score);
  S.ui.scoreShown = 0; tweens.add(S.ui, 'card', 0, 1, 0.5, easeOutBack); tweens.add(S.ui, 'scoreShown', 0, S.score, 1.2, easeOutCubic, 0.4);
  sfx.win();
  const game = S;
  for (let i = 0; i < 3; i++) {
    tweens.add(S.ui.starPop, i, 0, 1, 0.45, easeOutBack, 0.5 + i * 0.25);
    if (i < S.stars) setTimeout(() => { if (S === game && mode === 'end') { fx.burst(C.W / 2 - 64 + i * 64, 186, '#ffd166', 26, 220); sfx.tick(); } }, 650 + i * 250);
  }
}

// ---------- share ----------
function copyText(txt) {
  const fallback = () => {
    try {
      const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return Promise.resolve(ok);
    } catch { return Promise.resolve(false); }
  };
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(txt).then(() => true, fallback);
  return fallback();
}
function shareResult() {
  const txt = `Sunny Block ${S.daily ? 'daily ' + dateSeed(today) : 'random day'}: ${'★'.repeat(S.stars)}${'☆'.repeat(3 - S.stars)} ${S.score} pts, ${Math.round(S.lit * 100)}% lit after grid-off. ${location.origin.startsWith('http') ? location.origin + location.pathname : ''}`.trim();
  copyText(txt).then(ok => {
    if (ok) { fx.text(BTN.copy.x + BTN.copy.w / 2, BTN.copy.y - 12, 'Copied!', '#b7e4c7', 18); sfx.coin(); }
    else { S.shareFallback = txt; fx.text(BTN.copy.x + BTN.copy.w / 2, BTN.copy.y - 12, 'Copy blocked: text shown below', '#ffd166', 14, 2); }
  });
}

// ---------- UI layout ----------
const BTN = {
  battery: { x: 520, y: 480, w: 150, h: 44 },
  speed: { x: 680, y: 480, w: 110, h: 44 },
  mute: { x: 800, y: 480, w: 70, h: 44 },
  help: { x: 878, y: 480, w: 62, h: 44 },
  daily: { x: C.W / 2 - 210, y: 360, w: 200, h: 56 },
  random: { x: C.W / 2 + 10, y: 360, w: 200, h: 56 },
  again: { x: C.W / 2 - 210, y: 392, w: 200, h: 52 },
  copy: { x: C.W / 2 + 10, y: 392, w: 200, h: 52 },
};
const offerRect = hs => ({ x: hs.x - 14, y: hs.top - hs.roofRise - 92, w: hs.w + 28, h: 62 });
const sparkPos = s => ({ x: s.x + Math.sin(s.wob) * 6, y: s.y }); // the SAME position is drawn and hit-tested

function handleClick(p) {
  sfx.unlock();
  if (mode === 'title') { if (inRect(p, BTN.daily)) newGame(true); else if (inRect(p, BTN.random)) newGame(false); return; }
  if (mode === 'end') {
    if (S.endT < 0.4) return; // ignore a stray tap from the last second of the day
    if (inRect(p, BTN.again)) newGame(S.daily);
    else if (inRect(p, BTN.copy)) shareResult();
    return;
  }
  // buttons first: they never overlap the world
  if (inRect(p, BTN.battery)) {
    const cost = Math.round(S.capCost);
    if (S.coins < cost) { sfx.deny(); fx.text(p.x, p.y - 16, `Need ${cost} coins`, '#ff6b6b', 15); return; }
    S.coins -= cost; S.cap += C.batteryUpgrade; S.capCost *= C.batteryUpgradeGrowth; sfx.place(); S.ui.batPulse = 1;
    fx.text(BTN.battery.x + BTN.battery.w / 2, BTN.battery.y - 14, `+${C.batteryUpgrade} kWh capacity`, '#8ecae6', 15); return;
  }
  if (inRect(p, BTN.speed)) { S.speed = S.speed === 1 ? 3 : 1; sfx.tick(); return; }
  if (inRect(p, BTN.mute)) { sfx.toggle(); return; }
  if (inRect(p, BTN.help)) { showBanner('Panels charge the battery. Before sunset, shortfalls buy grid power (costs coins). After grid-off, only sun + battery keep the lights on. Tap sparks, shoo storm drones, trade with neighbours.', '#fff', 6); return; }
  // sparks first (small, moving targets): pick the nearest one under the pointer, even inside the storm drone
  let hit = -1, hd = SPARK_R;
  S.sparks.forEach((s, i) => { const q = sparkPos(s), d = Math.hypot(p.x - q.x, p.y - q.y); if (d < hd) { hd = d; hit = i; } });
  if (hit >= 0) { const s = S.sparks[hit]; S.sparks.splice(hit, 1); collectSpark(s, sparkPos(s).x); return; }
  // storm drone
  const st = S.storm;
  if (st.active && st.flee === 0 && Math.hypot(p.x - st.x, p.y - (st.y - 50)) < 70) {
    st.flee = 0.01; st.shoo = C.stormShooHours; S.stormHits++; fx.burst(st.x, st.y - 50, '#8ecae6', 30, 260); fx.shake(5); sfx.deal();
    fx.text(st.x, st.y - 90, 'Shoo! Sun is back', '#ffd166', 20); solSay('Get lost, cloud!'); S.hero.target = clamp(st.x, 60, C.W - 60); S.hero.pendingJump = true; return;
  }
  // offers
  for (const hs of S.houses) {
    const o = hs.offer; if (!o || o.pop < 0.5) continue;
    if (inRect(p, offerRect(hs))) {
      if (o.sell) {
        const room = S.cap - S.battery;
        if (room < 0.5) { sfx.deny(); fx.text(p.x, p.y, 'Battery full', '#ff6b6b', 15); return; }
        const q = Math.min(o.qty, room), cost = Math.max(1, Math.round(o.total * q / o.qty)); // only pay for what fits
        if (S.coins < cost) { sfx.deny(); fx.text(p.x, p.y, 'Not enough coins', '#ff6b6b', 15); return; }
        S.coins -= cost; S.battery += q; fx.text(p.x, p.y, `+${q.toFixed(1)} kWh  -${cost}c`, '#8ecae6');
        for (let j = 0; j < 3; j++) fly(p.x, p.y, HUD_BAT, '#8ecae6', () => S.ui.batPulse = 1, j * 0.06);
      } else {
        if (S.battery < o.qty) { sfx.deny(); fx.text(p.x, p.y, 'Not enough stored', '#ff6b6b', 15); return; }
        S.battery -= o.qty; S.coins += o.total; fx.text(p.x, p.y, `+${o.total} coins`, '#ffd166'); sfx.coin();
        for (let j = 0; j < 4; j++) fly(p.x, p.y, HUD_COIN, '#ffc94d', () => S.ui.coinPulse = 1, j * 0.06);
      }
      S.stats.deals++; sfx.deal(); fx.burst(p.x, p.y, hs.color, 18, 160); hs.offer = null; hs.jump = 1; return;
    }
  }
  // roof slots (nearest free slot only, so one tap = at most one panel)
  let slot = null, sd = 22;
  for (const hs of S.houses) hs.slotsPos.forEach((sp, k) => { const d = Math.hypot(p.x - sp.x, p.y - sp.y); if (!sp.placed && d < sd) { sd = d; slot = { hs, sp, k }; } });
  if (slot) {
    const { hs, sp, k } = slot, cost = Math.round(S.panelCost);
    if (S.coins < cost) { sfx.deny(); fx.text(sp.x, sp.y - 16, `Need ${cost}`, '#ff6b6b', 15); fx.shake(3); return; }
    S.coins -= cost; S.panelCost *= C.panelCostGrowth; sp.placed = true; hs.panels.push(k); S.stats.panels++;
    tweens.add(sp, 'scale', 0, 1, 0.45, easeOutBack); sp.glow = 1; fx.burst(sp.x, sp.y, '#8ecae6', 16, 150); fx.text(sp.x, sp.y - 18, `-${cost}`, '#ffd166', 16); sfx.place(); S.hero.target = sp.x; S.hero.pendingJump = true; solSay(C.solLines[(Math.random() * C.solLines.length) | 0]);
    if (S.stats.panels === 1) showBanner('Panels charge the street battery. Tap golden sparks for bonus kWh!', '#ffd166', 3.6);
    if (S.stats.panels === 3) showBanner('Neighbours will offer deals. Prices follow the weather.', '#8ecae6', 3.4);
  }
}

// ---------- update ----------
function update(dt) {
  titleT += dt; tweens.update(dt); fx.update(dt);
  while (input.clicks.length) handleClick(input.clicks.shift());
  if (mode === 'play') {
    if (input.consumeKey(' ')) { S.speed = S.speed === 1 ? 3 : 1; sfx.tick(); }
    if (input.consumeKey('m')) sfx.toggle();
    step(dt);
    if (S.banner) { S.banner.t -= dt; if (S.banner.t <= 0) S.banner = null; }
    S.houses.forEach(hs => hs.slotsPos.forEach(sp => sp.glow = Math.max(0, sp.glow - dt)));
  } else if (mode === 'end') {
    S.endT += dt;
    if (input.consumeKey('m')) sfx.toggle();
    if (S.endT > 0.4 && (input.consumeKey(' ') || input.consumeKey('enter'))) newGame(S.daily);
  } else {
    if (input.consumeKey('m')) sfx.toggle();
    if (input.consumeKey(' ') || input.consumeKey('enter')) { sfx.unlock(); newGame(true); }
  }
  if (S) {
    updateHero(dt); updateFlyers(dt);
    S.ui.batPulse = Math.max(0, S.ui.batPulse - dt * 3); S.ui.coinPulse = Math.max(0, S.ui.coinPulse - dt * 3);
    S.ui.coinShown += (S.coins - S.ui.coinShown) * Math.min(1, dt * 8);
  }
  input.endFrame();
  canvas.style.cursor = hoverTarget() ? 'pointer' : 'default';
}
function hoverTarget() {
  const p = { x: input.x, y: input.y }; if (p.x < 0) return false;
  if (mode === 'title') return inRect(p, BTN.daily) || inRect(p, BTN.random);
  if (mode === 'end') return inRect(p, BTN.again) || inRect(p, BTN.copy);
  if ([BTN.battery, BTN.speed, BTN.mute, BTN.help].some(r => inRect(p, r))) return true;
  if (S.sparks.some(s => { const q = sparkPos(s); return Math.hypot(p.x - q.x, p.y - q.y) < SPARK_R; })) return true;
  if (S.storm.active && S.storm.flee === 0 && Math.hypot(p.x - S.storm.x, p.y - (S.storm.y - 50)) < 70) return true;
  if (S.houses.some(hs => hs.offer && inRect(p, offerRect(hs)))) return true;
  return S.houses.some(hs => hs.slotsPos.some(sp => !sp.placed && Math.hypot(p.x - sp.x, p.y - sp.y) < 22));
}

// ---------- render helpers ----------
function skyColors(h) {
  const el = elevation(C.latitude, DOY, h);
  // [top, middle, horizon]
  const night = ['#070b1f', '#121a42', '#24305e'], dusk = ['#29265f', '#8a4f8c', '#ff9a5a'], day = ['#2f7fe0', '#6cb6ff', '#d4f0ff'];
  const mix = (a, b, t) => a.map((c, i) => lerpColor(c, b[i], t));
  if (el < -8) return night;
  if (el < 0) return mix(night, dusk, (el + 8) / 8);
  if (el < 12) return mix(dusk, day, el / 12);
  return day;
}
function panel(x, y, w, h, r = 14, alpha = 0.62) {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
  roundRect(ctx, x, y, w, h, r); ctx.fillStyle = `rgba(14,18,48,${alpha})`; ctx.fill(); ctx.restore();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.stroke();
}
function drawCoin(x, y, r = 8, pulse = 0) {
  const R = r * (1 + pulse * 0.25);
  const g = ctx.createLinearGradient(x, y - R, x, y + R); g.addColorStop(0, '#ffe58a'); g.addColorStop(1, '#f4a91f');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill(); ctx.strokeStyle = '#b97800'; ctx.lineWidth = Math.max(1.5, R * 0.18); ctx.stroke();
  ctx.fillStyle = '#a86a00'; ctx.font = font(900, R * 1.15); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('S', x, y + 1); ctx.textBaseline = 'alphabetic';
}
function button(r, label, active = true, accent = '#ffd166') {
  const hover = inRect({ x: input.x, y: input.y }, r), press = hover && input.down, lift = press ? 1 : hover ? -2 : 0, y = r.y + lift;
  ctx.save();
  roundRect(ctx, r.x, r.y + 4, r.w, r.h, 14); ctx.fillStyle = active ? 'rgba(0,0,0,.35)' : 'rgba(0,0,0,.2)'; ctx.fill(); // drop edge
  const g = ctx.createLinearGradient(0, y, 0, y + r.h);
  if (active) { g.addColorStop(0, hover ? '#ffffff' : '#fffaf0'); g.addColorStop(1, hover ? '#fff1c9' : '#f3e6c4'); }
  else { g.addColorStop(0, '#9aa0b8'); g.addColorStop(1, '#7c8199'); }
  roundRect(ctx, r.x, y, r.w, r.h, 14); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = hover ? 3.5 : 2.5; ctx.strokeStyle = active ? accent : 'rgba(255,255,255,.25)'; ctx.stroke();
  roundRect(ctx, r.x + 6, y + 4, r.w - 12, r.h * 0.36, 10); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill(); // gloss
  ctx.fillStyle = active ? '#1d2240' : '#2c3150'; ctx.font = font(800, r.h > 50 ? 17 : 15); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, r.x + r.w / 2, y + r.h / 2 + 1, r.w - 12); ctx.textBaseline = 'alphabetic';
  ctx.restore();
}
function wrapLines(text, maxW) {
  const words = text.split(' '), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
function sunPos(h) {
  const el = elevation(C.latitude, DOY, h);
  return { el, x: ((h - SUN.sunrise + 1) / (SUN.sunset - SUN.sunrise + 2)) * C.W, y: GROUND - 20 - (el / Math.max(MAX_EL, 20)) * 300 };
}
function drawSky(h) {
  const [top, mid, bot] = skyColors(h), { el, x: sx, y: sy } = sunPos(h);
  const g = ctx.createLinearGradient(0, 0, 0, GROUND); g.addColorStop(0, top); g.addColorStop(0.55, mid); g.addColorStop(1, bot); ctx.fillStyle = g; ctx.fillRect(0, 0, C.W, GROUND);
  // warm horizon glow near sunrise/sunset
  const warm = clamp(1 - Math.abs(el - 1) / 10, 0, 1);
  if (warm > 0) { const hg = ctx.createRadialGradient(clamp(sx, 0, C.W), GROUND, 10, clamp(sx, 0, C.W), GROUND, 520); hg.addColorStop(0, `rgba(255,150,80,${0.55 * warm})`); hg.addColorStop(1, 'rgba(255,120,80,0)'); ctx.fillStyle = hg; ctx.fillRect(0, 0, C.W, GROUND); }
  if (el < 4) {
    const a = clamp((4 - el) / 10, 0, 1);
    for (let i = 0; i < 70; i++) { const x = (i * 157.3) % C.W, y = (i * 91.7) % 260, tw = 0.4 + 0.6 * Math.abs(Math.sin(titleT * 1.3 + i * 1.7)); ctx.globalAlpha = a * tw; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, i % 7 === 0 ? 1.6 : 1, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  if (el > -4) {
    const R = 26 + Math.sin(titleT * 3) * 1.2;
    const glow = ctx.createRadialGradient(sx, sy, R * 0.6, sx, sy, 150); glow.addColorStop(0, 'rgba(255,236,150,.85)'); glow.addColorStop(0.35, 'rgba(255,210,100,.28)'); glow.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx, sy, 150, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(titleT * 0.25); ctx.fillStyle = 'rgba(255,230,140,.35)';
    for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(R + 4, -4); ctx.lineTo(R + 20 + (i % 2) * 10, 0); ctx.lineTo(R + 4, 4); ctx.fill(); }
    ctx.restore();
    const sg = ctx.createRadialGradient(sx - 8, sy - 8, 4, sx, sy, R); sg.addColorStop(0, el > 6 ? '#fff4b0' : '#ffd08a'); sg.addColorStop(1, el > 6 ? '#ffc93c' : '#ff8a3d');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, R, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,120,120,.35)'; ctx.beginPath(); ctx.arc(sx - 14, sy + 4, 4.5, 0, 7); ctx.arc(sx + 14, sy + 4, 4.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a4b00'; ctx.beginPath(); ctx.arc(sx - 8, sy - 4, 3, 0, 7); ctx.arc(sx + 8, sy - 4, 3, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7a4b00'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(sx, sy + 3, 9, 0.25, Math.PI - 0.25); ctx.stroke(); ctx.lineCap = 'butt';
  } else {
    const mg = ctx.createRadialGradient(C.W - 140, 80, 10, C.W - 140, 80, 80); mg.addColorStop(0, 'rgba(220,230,255,.35)'); mg.addColorStop(1, 'rgba(220,230,255,0)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(C.W - 140, 80, 80, 0, 7); ctx.fill();
    ctx.fillStyle = '#f1f3ff'; ctx.beginPath(); ctx.arc(C.W - 140, 80, 20, 0, 7); ctx.fill(); ctx.fillStyle = top; ctx.beginPath(); ctx.arc(C.W - 130, 74, 18, 0, 7); ctx.fill();
  }
}
function drawClouds(cover, night) {
  const N = S.clouds.length, shown = cover * N + 1;
  for (let i = 0; i < N; i++) {
    const a = clamp(shown - i, 0, 1); if (a <= 0) continue;  // fade clouds in/out instead of popping
    const c = S.clouds[i], s = c.s, g = Math.round((night ? 150 : 255) - cover * (night ? 70 : 110));
    ctx.globalAlpha = a * (0.8 + cover * 0.18);
    const blob = dy => { ctx.beginPath(); ctx.arc(c.x, c.y + dy, 26 * s, 0, 7); ctx.arc(c.x + 28 * s, c.y - 12 * s + dy, 32 * s, 0, 7); ctx.arc(c.x + 60 * s, c.y + dy, 24 * s, 0, 7); ctx.rect(c.x, c.y + dy - 4 * s, 60 * s, 26 * s); ctx.fill(); };
    ctx.fillStyle = `rgb(${g - 40},${g - 34},${g - 20})`; blob(6 * s);
    ctx.fillStyle = `rgb(${g},${g},${Math.min(255, g + 8)})`; blob(0);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(c.x + 24 * s, c.y - 20 * s, 18 * s, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(190,210,255,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); S.rain.forEach(r => { ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - 3, r.y + 11); }); ctx.stroke();
}
function drawHouse(hs, night) {
  const { x, w, top, bodyH, roofRise } = hs;
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(x + w / 2 + 6, GROUND + 2, w * 0.6, 6, 0, 0, 7); ctx.fill();
  const bg = ctx.createLinearGradient(x, 0, x + w, 0); bg.addColorStop(0, hs.color); bg.addColorStop(1, lerpColor(hs.color, '#000000', 0.12));
  ctx.fillStyle = bg; ctx.fillRect(x, top, w, bodyH);
  if (night) { ctx.fillStyle = 'rgba(10,14,50,.35)'; ctx.fillRect(x, top, w, bodyH); }
  ctx.fillStyle = hs.roof; ctx.beginPath(); ctx.moveTo(x - 12, top + 4); ctx.lineTo(x + w + 12, top - roofRise - 4); ctx.lineTo(x + w + 12, top - roofRise + 8); ctx.lineTo(x - 12, top + 14); ctx.closePath(); ctx.fill();
  ctx.fillRect(x + w - 2, top - roofRise, 4, roofRise);
  ctx.beginPath(); ctx.moveTo(x, top + 6); ctx.lineTo(x + w, top - roofRise + 6); ctx.lineTo(x + w, top); ctx.lineTo(x, top); ctx.fillStyle = hs.color; ctx.fill();
  if (night) { ctx.fillStyle = 'rgba(10,14,50,.35)'; ctx.fill(); }
  // windows (fade between lit and dark)
  const la = hs.litA;
  for (let k = 0; k < 2; k++) {
    const wx = x + 16 + k * 58, wy = top + 18;
    if (night && la > 0.05) { const wg = ctx.createRadialGradient(wx + 15, wy + 13, 4, wx + 15, wy + 13, 38); wg.addColorStop(0, `rgba(255,209,102,${0.4 * la})`); wg.addColorStop(1, 'rgba(255,209,102,0)'); ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(wx + 15, wy + 13, 38, 0, 7); ctx.fill(); }
    ctx.fillStyle = night ? lerpColor('#1a1d33', '#ffd166', la) : '#cfeaff'; ctx.fillRect(wx, wy, 30, 26);
    if (!night) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.moveTo(wx + 3, wy + 22); ctx.lineTo(wx + 12, wy + 3); ctx.lineTo(wx + 17, wy + 3); ctx.lineTo(wx + 8, wy + 22); ctx.fill(); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(wx, wy, 30, 26);
    ctx.beginPath(); ctx.moveTo(wx + 15, wy); ctx.lineTo(wx + 15, wy + 26); ctx.stroke();
  }
  ctx.fillStyle = '#5b3a29'; roundRect(ctx, x + w / 2 - 12, GROUND - 40, 24, 40, 5); ctx.fill(); ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(x + w / 2 + 6, GROUND - 20, 2, 0, 7); ctx.fill();
  // neighbour character
  const bob = Math.sin(titleT * 3 + hs.bob) * 1.5 - hs.jump * 14 * Math.sin(hs.jump * Math.PI);
  const cx = x + w / 2 + 34, cy = GROUND - 22 + bob;
  if (!hs.you && !sprite(hs.robot, cx, GROUND + 4 + bob, 56)) {
    ctx.fillStyle = hs.roof; roundRect(ctx, cx - 9, cy - 4, 18, 22, 7); ctx.fill();
    ctx.fillStyle = '#ffe0bd'; ctx.beginPath(); ctx.arc(cx, cy - 12, 10, 0, 7); ctx.fill();
  }
  // name tag
  ctx.font = font(700, 11); const nw = ctx.measureText(hs.name).width + 14;
  roundRect(ctx, x + w / 2 - nw / 2, GROUND + 6, nw, 15, 7.5); ctx.fillStyle = 'rgba(14,18,48,.55)'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(hs.name, x + w / 2, GROUND + 17);
  // roof slots + panels
  const ang = -Math.atan2(roofRise, w + 12);
  hs.slotsPos.forEach(sp => {
    ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(ang);
    if (sp.placed) {
      const s = sp.scale; ctx.scale(s, s);
      const pg = ctx.createLinearGradient(-15, -8, 15, 6); pg.addColorStop(0, '#2c5aa8'); pg.addColorStop(1, '#162c5c');
      ctx.fillStyle = pg; ctx.fillRect(-15, -8, 30, 14); ctx.strokeStyle = '#dfe7f1'; ctx.lineWidth = 2; ctx.strokeRect(-15, -8, 30, 14);
      ctx.strokeStyle = 'rgba(160,200,255,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, -8); ctx.lineTo(-5, 6); ctx.moveTo(5, -8); ctx.lineTo(5, 6); ctx.moveTo(-15, -1); ctx.lineTo(15, -1); ctx.stroke();
      if (S.prod > 0.1) { const sh = ((titleT * 0.6 + sp.x / 300) % 1.6) * 40 - 20; ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(sh - 4, -8); ctx.lineTo(sh + 4, -8); ctx.lineTo(sh, 6); ctx.lineTo(sh - 8, 6); ctx.fill(); }
      if (sp.glow > 0) { ctx.strokeStyle = `rgba(255,230,140,${sp.glow})`; ctx.lineWidth = 3; ctx.strokeRect(-18, -11, 36, 20); }
    } else {
      const hover = Math.hypot(input.x - sp.x, input.y - sp.y) < 22, pulse = 0.5 + 0.5 * Math.sin(titleT * 4 + sp.x * 0.05);
      ctx.fillStyle = hover ? 'rgba(255,255,255,.35)' : `rgba(255,255,255,${0.08 + pulse * 0.1})`; ctx.fillRect(-15, -8, 30, 14);
      ctx.setLineDash([4, 3]); ctx.strokeStyle = hover ? '#fff' : `rgba(255,255,255,${0.5 + pulse * 0.4})`; ctx.lineWidth = 2; ctx.strokeRect(-15, -8, 30, 14); ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; ctx.font = font(900, 13); ctx.textAlign = 'center'; ctx.fillText('+', 0, 4);
    }
    ctx.restore();
  });
}
function drawSlotTooltip() {
  for (const hs of S.houses) for (const sp of hs.slotsPos) {
    if (sp.placed || Math.hypot(input.x - sp.x, input.y - sp.y) >= 22) continue;
    const cost = Math.round(S.panelCost), ok = S.coins >= cost;
    roundRect(ctx, sp.x - 34, sp.y - 42, 68, 24, 12); ctx.fillStyle = 'rgba(14,18,48,.88)'; ctx.fill();
    drawCoin(sp.x - 18, sp.y - 30, 7); ctx.fillStyle = ok ? '#fff' : '#ff8f8f'; ctx.font = font(800, 13); ctx.textAlign = 'center'; ctx.fillText(cost, sp.x + 8, sp.y - 25.5);
    return;
  }
}
function drawOffer(hs) {
  const o = hs.offer; if (!o) return;
  const { x: bx, y: by, w: bw, h: bh } = offerRect(hs), k = Math.max(0.001, o.pop), col = o.sell ? '#2a9d8f' : '#e76f51';
  ctx.save(); ctx.translate(bx + bw / 2, by + bh); ctx.scale(k, k); ctx.translate(-(bx + bw / 2), -(by + bh));
  const hover = inRect({ x: input.x, y: input.y }, { x: bx, y: by, w: bw, h: bh }), fade = clamp(o.life / 0.6, 0, 1);
  ctx.globalAlpha = fade;
  ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
  roundRect(ctx, bx, by - (hover ? 2 : 0), bw, bh, 14); ctx.fillStyle = hover ? '#ffffff' : '#fffaf0'; ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.beginPath(); ctx.moveTo(bx + bw / 2 - 8, by + bh - 1); ctx.lineTo(bx + bw / 2, by + bh + 10); ctx.lineTo(bx + bw / 2 + 8, by + bh - 1); ctx.fill();
  roundRect(ctx, bx, by - (hover ? 2 : 0), bw, bh, 14); ctx.lineWidth = hover ? 3.5 : 2.5; ctx.strokeStyle = col; ctx.stroke();
  const yy = by - (hover ? 2 : 0);
  ctx.fillStyle = '#4a4f66'; ctx.font = font(600, 10); ctx.textAlign = 'center'; ctx.fillText(o.line, bx + bw / 2, yy + 15, bw - 12);
  ctx.font = font(900, 14); ctx.fillStyle = col; ctx.fillText(o.sell ? `BUY ${o.qty} kWh` : `SELL ${o.qty} kWh`, bx + bw / 2, yy + 34);
  drawCoin(bx + bw / 2 - 14, yy + 48, 6.5); ctx.fillStyle = '#1d2240'; ctx.font = font(800, 13); ctx.textAlign = 'left'; ctx.fillText(`${o.sell ? '-' : '+'}${o.total}`, bx + bw / 2 - 4, yy + 53);
  ctx.fillStyle = 'rgba(0,0,0,.08)'; roundRect(ctx, bx + 10, yy + bh - 7, bw - 20, 3, 1.5); ctx.fill();
  ctx.fillStyle = col; roundRect(ctx, bx + 10, yy + bh - 7, (bw - 20) * clamp(o.life / C.offerLife, 0, 1), 3, 1.5); ctx.fill();
  ctx.restore();
}
function drawHero() {
  const h = S.hero, moving = Math.abs(h.target - h.x) > 4, jy = Math.sin(h.jump * Math.PI) * 46, y = GROUND + 44 - jy;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(h.x, GROUND + 44, 20 - jy * 0.2, 5, 0, 0, 7); ctx.fill();
  let ok;
  if (h.jump > 0) ok = sprite('solJump', h.x, y, 78, h.facing < 0);
  else if (moving) ok = sprite(`run${(Math.floor(h.frame) % 8) + 1}`, h.x, y, 74, h.facing < 0);
  else ok = sprite('solFront', h.x, y + Math.sin(titleT * 3) * 1.5, 74);
  if (!ok) { ctx.fillStyle = '#f4a261'; ctx.beginPath(); ctx.arc(h.x, y - 30, 22, 0, 7); ctx.fill(); }
  if (h.say) {
    ctx.font = font(800, 13); const tw = ctx.measureText(h.say).width + 22, bx = clamp(h.x - tw / 2, 8, C.W - tw - 8);
    ctx.globalAlpha = clamp(h.sayT / 0.25, 0, 1);
    roundRect(ctx, bx, y - 114, tw, 28, 14); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#f4a261'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h.x - 6, y - 87); ctx.lineTo(h.x, y - 79); ctx.lineTo(h.x + 6, y - 87); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = '#1d2240'; ctx.textAlign = 'center'; ctx.fillText(h.say, bx + tw / 2, y - 95); ctx.globalAlpha = 1;
  }
}
function drawStorm() {
  const st = S.storm; if (!st.active) return;
  const wob = Math.sin(titleT * 5) * 4 + Math.sin(titleT * 2) * 6;
  if (st.flee === 0) { const hg = ctx.createRadialGradient(st.x, st.y - 50, 10, st.x, st.y - 50, 80); hg.addColorStop(0, 'rgba(120,200,255,.25)'); hg.addColorStop(1, 'rgba(120,200,255,0)'); ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(st.x, st.y - 50, 80, 0, 7); ctx.fill(); }
  if (!sprite('storm', st.x, st.y + wob, 110, false, st.flee > 0 ? 0.7 : 1)) { ctx.fillStyle = '#445'; ctx.beginPath(); ctx.arc(st.x, st.y - 50, 50, 0, 7); ctx.fill(); }
  if (st.flee === 0 && Math.random() < 0.04) fx.burst(st.x + (Math.random() - 0.5) * 60, st.y - 20, '#a0f0ff', 4, 60, 0.3, 2, 300);
}
function drawSparks() {
  S.sparks.forEach(s => {
    const { x, y } = sparkPos(s), a = clamp(s.life, 0, 1) * clamp(s.born / 0.2, 0, 1);
    const pop = s.born < 0.3 ? easeOutBack(s.born / 0.3) : 1, pulse = 1 + 0.12 * Math.sin(titleT * 8 + s.wob);
    const blink = s.life < 1.2 ? 0.6 + 0.4 * Math.sin(titleT * 20) : 1; // about to vanish
    ctx.globalAlpha = a * blink;
    const R = 24 * pop * pulse, g = ctx.createRadialGradient(x, y, 2, x, y, R); g.addColorStop(0, 'rgba(255,250,210,1)'); g.addColorStop(0.4, 'rgba(255,215,110,.55)'); g.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(titleT * 2 + s.wob); ctx.scale(pop * pulse, pop * pulse);
    ctx.fillStyle = '#ffd166'; ctx.strokeStyle = '#fff3c0'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.5 : 11, an = i * Math.PI / 5; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.globalAlpha = 1;
    if (Math.hypot(input.x - x, input.y - y) < SPARK_R) { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, SPARK_R, 0, 7); ctx.stroke(); }
  });
}
function drawFlyers() {
  for (const f of S.flyers) {
    if (f.t < 0) continue;
    f.trail.forEach((p, i) => { ctx.globalAlpha = (i + 1) / f.trail.length * 0.5; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(p.x, p.y, 2 + i * 0.5, 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1; const g = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, 10); g.addColorStop(0, '#fff'); g.addColorStop(0.5, f.color); g.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, 10, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function weatherIcon(id, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  if (id === 'sun' || id === 'part') { ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(id === 'part' ? -2 : 0, id === 'part' ? -2 : 0, 5, 0, 7); ctx.fill(); }
  if (id !== 'sun') { ctx.fillStyle = id === 'part' ? '#f1f4ff' : id === 'cloud' ? '#c9cfe0' : '#9aa3bd'; ctx.beginPath(); ctx.arc(-2, 2, 4, 0, 7); ctx.arc(3, 0, 5, 0, 7); ctx.arc(6, 3, 3.5, 0, 7); ctx.rect(-2, 2, 8, 4.5); ctx.fill(); }
  if (id === 'rain') { ctx.strokeStyle = '#8ecae6'; ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(-1 + i * 3.5, 8); ctx.lineTo(-2.5 + i * 3.5, 11.5); } ctx.stroke(); }
  ctx.restore();
}
function drawHUD() {
  const h = S.hour, w = weatherAt(h);
  // forecast strip
  panel(10, 8, 470, 46);
  ctx.font = font(800, 22); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(fmtHour(h), 22, 39);
  for (let i = 0; i < 5; i++) {
    const hh = Math.floor(h) + i, kind = C.weatherKinds[S.weather[Math.min(24, hh)]], x = 100 + i * 75;
    if (i === 0) { roundRect(ctx, x - 6, 13, 70, 36, 9); ctx.fillStyle = 'rgba(255,209,102,.16)'; ctx.fill(); }
    weatherIcon(kind.id, x + 5, 25);
    ctx.fillStyle = i === 0 ? '#ffd166' : 'rgba(255,255,255,.9)'; ctx.font = font(700, 11); ctx.textAlign = 'left'; ctx.fillText(`${String(hh % 24).padStart(2, '0')}h ${kind.label}`, x + 15, 28, 48);
    ctx.fillStyle = kind.priceMul > 1.2 ? '#ff8fab' : kind.priceMul < 0.9 ? '#b7e4c7' : '#dde'; ctx.fillText(`grid ${gridPrice(hh).toFixed(1)}`, x, 44);
  }
  // sun times (real for today)
  panel(C.W - 250, 8, 240, 46);
  ctx.fillStyle = '#fff'; ctx.font = font(700, 12); ctx.textAlign = 'right';
  ctx.fillText(`${C.placeName} sun today: ${fmtHour(SUN.sunrise)}–${fmtHour(SUN.sunset)} (solar)`, C.W - 22, 27);
  ctx.fillStyle = S.gridOff ? '#ff8fab' : '#ffd166'; ctx.font = font(800, 12); ctx.fillText(S.gridOff ? 'GRID OFF · battery only' : `Grid off at ${fmtHour(OFFGRID)}`, C.W - 22, 44);
  // day progress
  const p = clamp((h - C.dayStartHour) / (C.dayEndHour - C.dayStartHour), 0, 1), og = (OFFGRID - C.dayStartHour) / (C.dayEndHour - C.dayStartHour);
  const px = 20, pw = C.W - 40, py = 462;
  roundRect(ctx, px, py, pw * og, 5, 2.5); ctx.fillStyle = 'rgba(255,209,102,.85)'; ctx.fill();
  roundRect(ctx, px + pw * og, py, pw * (1 - og), 5, 2.5); ctx.fillStyle = 'rgba(255,143,171,.85)'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px + pw * p, py + 2.5, 6, 0, 7); ctx.fill(); ctx.strokeStyle = '#1d2240'; ctx.lineWidth = 2; ctx.stroke();
  // bottom bar
  panel(10, 472, C.W - 20, 62, 16, 0.82);
  drawCoin(HUD_COIN.x, HUD_COIN.y, 12, S.ui.coinPulse); ctx.fillStyle = S.coins < 0 ? '#ff6b6b' : '#fff'; ctx.font = font(900, 22 + S.ui.coinPulse * 3); ctx.textAlign = 'left'; ctx.fillText(Math.abs(S.coins - S.ui.coinShown) < 0.5 ? Math.floor(S.coins) : Math.round(S.ui.coinShown), 52, 512);
  // battery
  const bp = S.ui.batPulse;
  if (IMG.ready('battery')) ctx.drawImage(IMG.battery, 108 - bp * 2, 486 - bp * 3, 20 + bp * 4, 34 + bp * 6);
  const bx = 136, by = 487, bw = 186, bh = 32, f = clamp(S.battery / S.cap, 0, 1);
  if (bp > 0) { ctx.save(); ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 22 * bp; roundRect(ctx, bx, by, bw, bh, 10); ctx.fillStyle = '#222842'; ctx.fill(); ctx.restore(); }
  roundRect(ctx, bx, by, bw, bh, 10); ctx.fillStyle = '#1a1f3a'; ctx.fill(); ctx.strokeStyle = bp > 0 ? lerpColor('#ffffff', '#ffe066', bp) : 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.stroke();
  roundRect(ctx, bx + bw + 1, by + 10, 5, 12, 2); ctx.fillStyle = '#fff'; ctx.fill();
  if (f > 0.005) {
    const fc = f < 0.2 ? ['#ff8a8a', '#e14b4b'] : f < 0.5 ? ['#ffe08a', '#f2b632'] : ['#a7f3b5', '#4cc56a'];
    const fg = ctx.createLinearGradient(0, by, 0, by + bh); fg.addColorStop(0, fc[0]); fg.addColorStop(1, fc[1]);
    roundRect(ctx, bx + 3, by + 3, (bw - 6) * f, bh - 6, 7); ctx.fillStyle = fg; ctx.fill();
    ctx.save(); roundRect(ctx, bx + 3, by + 3, (bw - 6) * f, bh - 6, 7); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(bx, by + 4, bw, 7);
    if (S.prod > S.demand) { const sx = bx + ((titleT * 90) % (bw + 40)) - 20; ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(sx, by, 10, bh); }
    ctx.restore();
  }
  ctx.font = font(800, 13); ctx.textAlign = 'center'; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(10,14,40,.85)'; const bt = `${S.battery.toFixed(1)} / ${S.cap} kWh${f >= 0.995 ? ' · FULL' : ''}`;
  ctx.strokeText(bt, bx + bw / 2, by + 21); ctx.fillStyle = '#fff'; ctx.fillText(bt, bx + bw / 2, by + 21);
  // sun vs use mini gauges
  const gx = 340, maxKw = Math.max(4, S.prod, S.demand);
  ctx.textAlign = 'left'; ctx.font = font(700, 12);
  ctx.fillStyle = '#80ed99'; ctx.fillText(`Sun ${S.prod.toFixed(1)} kW`, gx, 497);
  ctx.fillStyle = '#ffadad'; ctx.fillText(`Use ${S.demand.toFixed(1)} kW`, gx, 522);
  roundRect(ctx, gx + 84, 489, 64, 7, 3.5); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill(); roundRect(ctx, gx + 84, 489, 64 * S.prod / maxKw, 7, 3.5); ctx.fillStyle = '#80ed99'; ctx.fill();
  roundRect(ctx, gx + 84, 514, 64, 7, 3.5); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill(); roundRect(ctx, gx + 84, 514, 64 * S.demand / maxKw, 7, 3.5); ctx.fillStyle = '#ffadad'; ctx.fill();
  weatherIcon(w.kind.id, gx + 160, 501, 1);
  button(BTN.battery, `Battery +${C.batteryUpgrade}  (${Math.round(S.capCost)})`, S.coins >= Math.round(S.capCost));
  button(BTN.speed, S.speed === 1 ? '▶ Speed x1' : '▶▶ Speed x3', true, S.speed === 3 ? '#ffb703' : '#8ecae6');
  button(BTN.mute, sfx.muted ? 'Muted' : 'Sound', true, '#cdb4db');
  button(BTN.help, '?', true, '#cdb4db');
  if (S.banner) {
    const b = S.banner; ctx.globalAlpha = clamp(b.t / 0.4, 0, 1);
    ctx.font = font(800, 17); const lines = wrapLines(b.text, 640), tw = Math.min(C.W - 40, Math.max(...lines.map(l => ctx.measureText(l).width)) + 48), bh = 18 + lines.length * 22;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    roundRect(ctx, C.W / 2 - tw / 2, 64 + b.y, tw, bh, Math.min(20, bh / 2)); ctx.fillStyle = 'rgba(14,18,48,.92)'; ctx.fill(); ctx.restore();
    roundRect(ctx, C.W / 2 - tw / 2, 64 + b.y, tw, bh, Math.min(20, bh / 2)); ctx.strokeStyle = b.color; ctx.globalAlpha *= 0.6; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = clamp(b.t / 0.4, 0, 1);
    ctx.fillStyle = b.color; ctx.textAlign = 'center'; lines.forEach((l, i) => ctx.fillText(l, C.W / 2, 64 + b.y + 30 + i * 22)); ctx.globalAlpha = 1;
  }
}
// Tutorial pointers: show exactly where to tap until the player has done it once.
function drawHints() {
  const bounce = Math.sin(titleT * 6) * 5;
  const pointAt = (x, y, label, r = 22) => {
    ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(titleT * 6)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r + 4 + Math.sin(titleT * 6) * 3, 0, 7); ctx.stroke();
    const ty = y - r - 38 + bounce; ctx.font = font(800, 14); const tw = ctx.measureText(label).width + 22, lx = clamp(x - tw / 2, 8, C.W - tw - 8);
    roundRect(ctx, lx, ty - 18, tw, 26, 13); ctx.fillStyle = '#ffd166'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 6, ty + 7); ctx.lineTo(x, ty + 15); ctx.lineTo(x + 6, ty + 7); ctx.fill();
    ctx.fillStyle = '#1d2240'; ctx.textAlign = 'center'; ctx.fillText(label, lx + tw / 2, ty);
  };
  if (S.stats.panels === 0) { const sp = S.houses[0].slotsPos[1]; pointAt(sp.x, sp.y, `Tap to build a panel (${Math.round(S.panelCost)} coins)`); }
  else if (S.stats.sparks === 0 && S.sparks.length) { const q = sparkPos(S.sparks[0]); pointAt(q.x, q.y, 'Tap the spark!', 18); }
}
function drawWorld(h) {
  const night = elevation(C.latitude, DOY, h) < -2, el = elevation(C.latitude, DOY, h);
  drawSky(h); if (S && mode !== 'title') drawClouds(weatherAt(h).cover, night);
  const dayT = clamp((el + 6) / 16, 0, 1);
  // distant hills (two layers)
  ctx.fillStyle = lerpColor('#1a2440', '#9bd18a', dayT); ctx.beginPath(); ctx.moveTo(0, GROUND); for (let x = 0; x <= C.W; x += 30) ctx.lineTo(x, GROUND - 70 - Math.sin(x / 170 + 1) * 22); ctx.lineTo(C.W, GROUND); ctx.fill();
  ctx.fillStyle = lerpColor('#1b2a3a', '#72bb62', dayT); ctx.beginPath(); ctx.moveTo(0, GROUND); for (let x = 0; x <= C.W; x += 30) ctx.lineTo(x, GROUND - 40 - Math.sin(x / 120) * 18); ctx.lineTo(C.W, GROUND); ctx.fill();
  const gg = ctx.createLinearGradient(0, GROUND, 0, GROUND + 52); gg.addColorStop(0, lerpColor('#24352a', '#62b357', dayT)); gg.addColorStop(1, lerpColor('#1b2820', '#4d9a45', dayT));
  ctx.fillStyle = gg; ctx.fillRect(0, GROUND, C.W, 52);
  ctx.fillStyle = lerpColor('#363a46', '#8f969d', dayT); ctx.fillRect(0, GROUND + 26, C.W, 20);
  ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(0, GROUND + 26, C.W, 3);
  ctx.strokeStyle = 'rgba(245,245,245,.85)'; ctx.lineWidth = 2; ctx.setLineDash([16, 14]); ctx.beginPath(); ctx.moveTo(0, GROUND + 36); ctx.lineTo(C.W, GROUND + 36); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = lerpColor('#1b2820', '#4d9a45', dayT); ctx.fillRect(0, GROUND + 46, C.W, C.H - GROUND - 46);
  return night;
}
function drawTitle() {
  const fakeH = 6 + ((titleT * 0.6) % 16);
  drawWorld(fakeH);
  const vg = ctx.createRadialGradient(C.W / 2, C.H / 2, 100, C.W / 2, C.H / 2, 620); vg.addColorStop(0, 'rgba(10,14,40,.45)'); vg.addColorStop(1, 'rgba(10,14,40,.8)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, C.W, C.H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb703'; ctx.font = font(800, 16); ctx.fillText(C.subtitle.toUpperCase().split('').join(' '), C.W / 2, 108);
  const ts = 66 + Math.sin(titleT * 2) * 2; ctx.font = font(900, ts); ctx.lineJoin = 'round';
  ctx.lineWidth = 10; ctx.strokeStyle = '#7a3e00'; ctx.strokeText(C.title, C.W / 2, 172);
  const tg = ctx.createLinearGradient(0, 120, 0, 175); tg.addColorStop(0, '#fff1a8'); tg.addColorStop(1, '#ffb703'); ctx.fillStyle = tg; ctx.fillText(C.title, C.W / 2, 172);
  ctx.fillStyle = '#fff'; ctx.font = font(700, 20); ctx.fillText(C.tagline, C.W / 2, 214);
  panel(C.W / 2 - 370, 236, 740, 92, 18, 0.5);
  sprite('solFront', 120, 470 + Math.sin(titleT * 3) * 4, 190); sprite('storm', C.W - 130, 200 + Math.sin(titleT * 2) * 8, 120);
  ctx.font = font(600, 15); ctx.fillStyle = '#e6e8f5';
  ctx.fillText('Help Solarchik install panels · catch sun sparks · shoo storm drones · trade with robot neighbours', C.W / 2, 262);
  ctx.fillText(`The sun follows today's real arc over ${C.placeName}: up ${fmtHour(SUN.sunrise)}, down ${fmtHour(SUN.sunset)} (solar time).`, C.W / 2, 287);
  ctx.fillStyle = '#ffd166'; ctx.fillText(`At sunset the grid switches off. Keep every window lit until 22:00.`, C.W / 2, 312);
  button(BTN.daily, "Today's sky (daily)"); button(BTN.random, 'Random weather', true, '#8ecae6');
  if (best()) { ctx.fillStyle = '#ffd166'; ctx.font = font(800, 16); ctx.textAlign = 'center'; ctx.fillText(`★ Best: ${best()}`, C.W / 2, 452); }
  ctx.fillStyle = '#aab'; ctx.font = font(600, 12); ctx.textAlign = 'center'; ctx.fillText('Space / Enter = start · Space = speed x3 in game · M = sound', C.W / 2, 520);
}
function drawEnd() {
  ctx.fillStyle = `rgba(8,11,32,${0.7 * clamp(S.endT / 0.4, 0, 1)})`; ctx.fillRect(0, 0, C.W, C.H);
  const k = Math.max(0.001, S.ui.card), cx = C.W / 2, cw = 600, ch = 400, cy = 58;
  ctx.save(); ctx.translate(cx, cy + ch / 2); ctx.scale(k, k); ctx.translate(-cx, -(cy + ch / 2));
  panel(cx - cw / 2, cy, cw, ch, 24, 0.94);
  const hg = ctx.createLinearGradient(0, cy, 0, cy + 90); hg.addColorStop(0, S.stars === 3 ? 'rgba(255,209,102,.35)' : S.stars ? 'rgba(142,202,230,.3)' : 'rgba(255,107,107,.3)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
  roundRect(ctx, cx - cw / 2, cy, cw, 90, 24); ctx.fillStyle = hg; ctx.fill();
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = font(900, 34);
  ctx.fillText(S.stars === 3 ? 'Fully off-grid!' : S.stars ? 'The street made it… mostly' : 'Lights out on Sunny Block', cx, cy + 50);
  ctx.font = font(600, 13); ctx.fillStyle = '#b8bdd6'; ctx.fillText(S.daily ? `Daily sky · ${today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Random weather day', cx, cy + 74);
  for (let i = 0; i < 3; i++) {
    const s = S.ui.starPop[i] || 0, on = i < S.stars; if (s <= 0) continue;
    ctx.save(); ctx.translate(cx - 64 + i * 64, cy + 128); ctx.scale(s * (on ? 1 : 0.85), s * (on ? 1 : 0.85)); ctx.rotate((1 - s) * 0.8);
    ctx.fillStyle = on ? '#ffd166' : '#3a4066'; ctx.strokeStyle = on ? '#c98b00' : '#2a2f4f'; ctx.lineWidth = 3; ctx.beginPath();
    for (let j = 0; j < 10; j++) { const r = j % 2 ? 11 : 26, an = -Math.PI / 2 + j * Math.PI / 5; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  ctx.fillStyle = '#fff'; ctx.font = font(900, 32); ctx.fillText(`${Math.round(S.ui.scoreShown || 0)} pts`, cx, cy + 196);
  ctx.font = font(800, 14); ctx.fillStyle = S.newBest ? '#ffd166' : '#b8bdd6'; ctx.fillText(S.newBest ? '★ NEW BEST! ★' : `Best: ${Math.max(best(), S.score)}`, cx, cy + 218);
  const stats = [
    [`${Math.round(S.lit * 100)}%`, 'lit after grid-off'], [`${S.stats.panels}`, 'panels'], [`${S.stats.produced.toFixed(0)} kWh`, 'of sun'],
    [`${S.stats.sparks}`, `sparks (+${Math.round(S.stats.sparkCoins)}c)`], [`${S.stats.deals}`, 'deals'], [`${S.stats.gridKwh.toFixed(1)} kWh`, `grid (-${Math.round(S.stats.gridCost)}c)`],
  ];
  stats.forEach(([v, l], i) => {
    const col = i % 3, row = (i / 3) | 0, w = 176, x = cx - 270 + col * 184, y = cy + 232 + row * 48;
    roundRect(ctx, x, y, w, 42, 10); ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = font(800, 16); ctx.textAlign = 'center'; ctx.fillText(v, x + w / 2, y + 19);
    ctx.fillStyle = '#aab0cc'; ctx.font = font(600, 11); ctx.fillText(l, x + w / 2, y + 34);
  });
  ctx.restore();
  if (S.ui.card > 0.95) {
    button(BTN.again, '↻ Play again'); button(BTN.copy, 'Copy result', true, '#8ecae6');
    ctx.fillStyle = '#c9cde3'; ctx.font = font(600, 12); ctx.textAlign = 'center';
    ctx.fillText(`${Math.floor(S.coins)} coins left · Space = play again`, cx, cy + ch + 20);
    if (S.shareFallback) { ctx.font = font(600, 11); ctx.fillStyle = '#ffd166'; ctx.fillText(S.shareFallback, cx, cy + ch + 38, C.W - 40); }
  }
}
function render() {
  const off = fx.offset();
  ctx.setTransform(stage.scale, 0, 0, stage.scale, off.x * stage.scale, off.y * stage.scale);
  if (mode === 'title') drawTitle();
  else {
    const night = drawWorld(S.hour);
    S.houses.forEach(hs => drawHouse(hs, night));
    drawStorm(); drawHero(); drawSparks();
    S.houses.forEach(drawOffer);
    drawSlotTooltip();
    drawHUD();
    if (mode === 'play') drawHints();
    drawFlyers();
    if (mode === 'end') drawEnd();
  }
  fx.draw(ctx);
}

startLoop(update, render);
// debug/test hook (used by automated smoke test)
window.__sunny = { get state() { return S; }, get mode() { return mode; }, newGame, OFFGRID, SUN, BTN };
