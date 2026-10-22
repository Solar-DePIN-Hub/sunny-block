import { CONFIG as C } from './config.js';
import { mulberry32, clamp, lerp, lerpColor, easeOutBack, dateSeed, createStage, startLoop, createInput, createTweens, createFx, createAudio, roundRect, inRect, loadImages } from './engine.js';
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
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); if (flip) ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore(); return true;
}
const best = () => +(localStorage.getItem('sb-best') || 0);

let S = null;           // game state
let mode = 'title';     // title | play | end
let titleT = 0;

// ---------- world setup ----------
function buildHouses() {
  const w = 118, gap = 32, x0 = (C.W - (C.houses.length * w + (C.houses.length - 1) * gap)) / 2;
  return C.houses.map((h, i) => {
    const bodyH = 92 + ((i * 37) % 3) * 14, x = x0 + i * (w + gap), top = GROUND - bodyH;
    const roofRise = 38, house = { ...h, i, x, w, top, bodyH, roofRise, panels: [], lit: 1, bob: Math.random() * 6, jump: 0, offer: null };
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
    stats: { produced: 0, gridKwh: 0, gridCost: 0, deals: 0, sparks: 0, litNeed: 0, litGot: 0, panels: 0, sold: 0 },
    prod: 0, demand: 0, darkPrev: 0, hintT: 0, banner: null,
    hero: { x: 150, target: 150, facing: 1, frame: 0, jump: 0, say: null, sayT: 0 },
    storm: { x: -200, y: 120, active: false, shoo: 0, flee: 0 }, stormHits: 0,
  };
  mode = 'play';
  showBanner('Tap a roof slot to install a solar panel', '#ffd166');
}
function showBanner(text, color = '#fff', dur = 3.2) { S.banner = { text, color, t: dur, max: dur, y: 0 }; tweens.add(S.banner, 'y', -40, 0, 0.5, easeOutBack); }

// ---------- simulation ----------
const gauss = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s));
function weatherAt(h) { const i = clamp(Math.floor(h), 0, 24), f = h - Math.floor(h); const a = C.weatherKinds[S.weather[i]], b = C.weatherKinds[S.weather[Math.min(24, i + 1)]]; return { cover: lerp(a.cover, b.cover, f), priceMul: lerp(a.priceMul, b.priceMul, f), kind: a }; }
function gridPrice(h) { return C.gridBasePrice * weatherAt(h).priceMul * (1 + 0.45 * gauss(h, 19.5, 1.5) + 0.2 * gauss(h, 8, 1)); }
function sunFactor(h) { const el = elevation(C.latitude, DOY, h); return el <= 0 ? 0 : Math.sin(el * Math.PI / 180) / Math.sin(Math.max(MAX_EL, 20) * Math.PI / 180); }
function houseDemand(hs, h) { return hs.base + 0.35 * gauss(h, 7.6, 0.9) + hs.evening * gauss(h, 19.4, 1.8) + (hs.ev ? 0.9 * gauss(h, 18.8, 0.8) : 0); }

function step(dt) {
  const dH = (C.dayEndHour - C.dayStartHour) / C.sessionSeconds * dt * S.speed;
  const h = S.hour, w = weatherAt(h), sun = sunFactor(h);
  const cover = S.storm.shoo > 0 ? w.cover * 0.35 : w.cover;
  const panels = S.houses.reduce((a, hs) => a + hs.panels.length, 0);
  S.prod = panels * C.panelKw * sun * (1 - cover);
  S.demand = S.houses.reduce((a, hs) => a + houseDemand(hs, h), 0);
  let net = (S.prod - S.demand) * dH;
  S.stats.produced += S.prod * dH;
  const price = gridPrice(h);
  if (net >= 0) {
    const room = S.cap - S.battery, put = Math.min(room, net); S.battery += put;
    const extra = net - put; if (extra > 0 && !S.gridOff) { const earn = extra * price * C.feedInFactor; S.coins += earn; S.stats.sold += extra; }
    S.houses.forEach(hs => hs.lit = 1);
  } else {
    const need = -net, take = Math.min(S.battery, need); S.battery -= take; const short = need - take;
    if (short > 0 && !S.gridOff) { S.coins -= short * price; S.stats.gridKwh += short; S.stats.gridCost += short * price; S.houses.forEach(hs => hs.lit = 1); }
    else if (short > 0) {
      const frac = take / need; // share of demand covered
      const darkCount = Math.round((1 - frac) * S.houses.length);
      S.houses.forEach((hs, i) => hs.lit = i < S.houses.length - darkCount ? 1 : 0);
      if (darkCount > S.darkPrev) { fx.shake(8); sfx.dark(); fx.text(C.W / 2, 250, 'Blackout!', '#ff6b6b', 26); }
      S.darkPrev = darkCount;
    } else { S.houses.forEach(hs => hs.lit = 1); S.darkPrev = 0; }
    if (S.gridOff) { S.stats.litNeed += need; S.stats.litGot += take; }
  }
  if (S.gridOff && net >= 0) { S.stats.litNeed += S.demand * dH; S.stats.litGot += S.demand * dH; }

  S.hour += dH;
  if (!S.warned && S.hour >= OFFGRID - 1) { S.warned = true; showBanner(`Grid switches OFF at ${fmtHour(OFFGRID)}. Fill the battery!`, '#ffb703', 3.5); sfx.tick(); }
  if (!S.gridOff && S.hour >= OFFGRID) { S.gridOff = true; showBanner('GRID OFF: keep the street lit until 22:00', '#ff8fab', 3.8); fx.shake(6); sfx.dark(); }
  if (S.hour >= C.dayEndHour) endGame();

  // sparks: clickable bursts of sunshine from working panels
  S.sparkT -= dt * S.speed;
  if (S.sparkT <= 0 && S.prod > 0.3) {
    S.sparkT = C.sparkEvery * (0.7 + S.rng() * 0.6);
    const withP = S.houses.filter(hs => hs.panels.length); const hs = withP[(S.rng() * withP.length) | 0];
    if (hs) { const sp = hs.slotsPos[hs.panels[(S.rng() * hs.panels.length) | 0]]; S.sparks.push({ x: sp.x, y: sp.y, vy: -28, life: 4.2, wob: S.rng() * 6 }); }
  }
  for (let i = S.sparks.length - 1; i >= 0; i--) { const s = S.sparks[i]; s.life -= dt; s.y += s.vy * dt; s.wob += dt * 4; if (s.life <= 0) S.sparks.splice(i, 1); }

  // neighbour offers: weather-driven prices
  S.offerT -= dt * S.speed;
  if (S.offerT <= 0 && S.hour < C.dayEndHour - 0.5) {
    S.offerT = C.offerEvery * (0.7 + S.rng() * 0.6);
    const free = S.houses.filter(hs => !hs.you && !hs.offer); const hs = free[(S.rng() * free.length) | 0];
    if (hs) {
      const sell = S.gridOff ? S.rng() < 0.25 : S.rng() < 0.55, qty = 2 + ((S.rng() * 4) | 0);
      const unit = price * (sell ? 0.5 + S.rng() * 0.3 : 1.05 + S.rng() * 0.45);
      const lines = sell ? C.lines.sell : C.lines.buy;
      hs.offer = { sell, qty, total: Math.round(unit * qty), life: C.offerLife, line: lines[(S.rng() * lines.length) | 0], pop: 0 };
      tweens.add(hs.offer, 'pop', 0, 1, 0.4, easeOutBack); hs.jump = 1; sfx.tick();
    }
  }
  S.houses.forEach(hs => { if (hs.offer) { hs.offer.life -= dt; if (hs.offer.life <= 0) hs.offer = null; } hs.jump = Math.max(0, hs.jump - dt * 2); });

  // Solarchik hero: runs to the action, celebrates with a jump
  const hero = S.hero, dx = hero.target - hero.x;
  if (Math.abs(dx) > 4) { hero.x += Math.sign(dx) * Math.min(Math.abs(dx), 260 * dt); hero.facing = Math.sign(dx); hero.frame += dt * 14; }
  else if (hero.pendingJump) { hero.pendingJump = false; hero.jump = 1; }
  hero.jump = Math.max(0, hero.jump - dt * 1.8); hero.sayT -= dt; if (hero.sayT <= 0) hero.say = null;
  // storm drone: rolls in on cloudy/rainy hours, tap it to chase it away
  const st = S.storm; st.shoo = Math.max(0, st.shoo - dH);
  if (!st.active && st.shoo <= 0 && w.cover > 0.6 && S.hour < OFFGRID) { st.active = true; st.x = -160; st.y = 175 + S.rng() * 40; st.flee = 0; showBanner('Storm drone! Tap it to chase the clouds away', '#8ecae6', 2.8); }
  if (st.active) {
    if (st.flee > 0) { st.flee += dt; st.x += 700 * dt; st.y -= 200 * dt; if (st.x > C.W + 200) st.active = false; }
    else { st.x += (C.W * 0.45 - st.x) * dt * 0.8; st.y += Math.sin(titleT * 2) * 0.4; if (w.cover < 0.3) st.flee = 0.01; }
  }
  // weather visuals
  S.clouds.forEach(c => { c.x += c.v * dt; if (c.x > C.W + 120) c.x = -120; });
  if (w.kind.id === 'rain') for (let i = 0; i < 3; i++) S.rain.push({ x: Math.random() * C.W, y: 0, v: 420 + Math.random() * 120 });
  for (let i = S.rain.length - 1; i >= 0; i--) { const r = S.rain[i]; r.y += r.v * dt; if (r.y > GROUND) S.rain.splice(i, 1); }
}

function solSay(t) { S.hero.say = t; S.hero.sayT = 1.8; }
function endGame() {
  S.hour = C.dayEndHour; mode = 'end';
  const lit = S.stats.litNeed > 0 ? S.stats.litGot / S.stats.litNeed : 1;
  S.lit = lit;
  S.score = Math.max(0, Math.round(lit * 1000 + S.coins * 2 + S.battery * 10 + S.stats.deals * 15));
  S.stars = lit >= 0.99 ? 3 : lit >= 0.8 ? 2 : lit >= 0.5 ? 1 : 0;
  S.newBest = S.score > best(); if (S.newBest) localStorage.setItem('sb-best', S.score);
  sfx.win(); for (let i = 0; i < S.stars; i++) setTimeout(() => fx.burst(C.W / 2 - 60 + i * 60, 205, '#ffd166', 26, 220), 300 + i * 250);
}

// ---------- UI layout ----------
const BTN = {
  battery: { x: 520, y: 482, w: 150, h: 44 },
  speed: { x: 680, y: 482, w: 110, h: 44 },
  mute: { x: 800, y: 482, w: 70, h: 44 },
  help: { x: 878, y: 482, w: 60, h: 44 },
  daily: { x: C.W / 2 - 210, y: 360, w: 200, h: 56 },
  random: { x: C.W / 2 + 10, y: 360, w: 200, h: 56 },
  again: { x: C.W / 2 - 210, y: 400, w: 200, h: 52 },
  copy: { x: C.W / 2 + 10, y: 400, w: 200, h: 52 },
};

function handleClick(p) {
  sfx.unlock();
  if (mode === 'title') { if (inRect(p, BTN.daily)) newGame(true); else if (inRect(p, BTN.random)) newGame(false); return; }
  if (mode === 'end') {
    if (inRect(p, BTN.again)) newGame(S.daily);
    else if (inRect(p, BTN.copy)) {
      const txt = `Sunny Block ${S.daily ? 'daily ' + dateSeed(today) : 'random day'}: ${'★'.repeat(S.stars)}${'☆'.repeat(3 - S.stars)} ${S.score} pts, ${Math.round(S.lit * 100)}% lit after grid-off.`;
      navigator.clipboard?.writeText(txt).then(() => fx.text(BTN.copy.x + 100, BTN.copy.y - 10, 'Copied!', '#b7e4c7'), () => fx.text(BTN.copy.x + 100, BTN.copy.y - 10, txt.slice(0, 30), '#fff', 12));
    }
    return;
  }
  // storm drone
  const st = S.storm;
  if (st.active && st.flee === 0 && Math.hypot(p.x - st.x, p.y - (st.y - 50)) < 70) {
    st.flee = 0.01; st.shoo = C.stormShooHours; S.stormHits++; fx.burst(st.x, st.y - 50, '#8ecae6', 30, 260); fx.shake(5); sfx.deal();
    fx.text(st.x, st.y - 90, 'Shoo! Sun is back', '#ffd166', 20); solSay('Get lost, cloud!'); S.hero.target = clamp(st.x, 60, C.W - 60); S.hero.pendingJump = true; return;
  }
  // sparks first (small, moving targets)
  for (let i = S.sparks.length - 1; i >= 0; i--) {
    const s = S.sparks[i];
    if (Math.hypot(p.x - s.x, p.y - s.y) < 24) {
      const add = Math.min(C.sparkKwh, S.cap - S.battery); S.battery += add; S.stats.sparks++;
      fx.burst(s.x, s.y, '#ffd166', 14, 140, 0.6, 3, 50); fx.text(s.x, s.y - 10, `+${C.sparkKwh} kWh`, '#ffd166'); sfx.spark(); S.sparks.splice(i, 1); return;
    }
  }
  // offers
  for (const hs of S.houses) {
    const o = hs.offer; if (!o) continue;
    const r = { x: hs.x - 14, y: hs.top - hs.roofRise - 92, w: hs.w + 28, h: 62 };
    if (inRect(p, r)) {
      if (o.sell) {
        if (S.coins < o.total) { sfx.deny(); fx.text(p.x, p.y, 'Not enough coins', '#ff6b6b', 15); return; }
        if (S.cap - S.battery < 0.5) { sfx.deny(); fx.text(p.x, p.y, 'Battery full', '#ff6b6b', 15); return; }
        const q = Math.min(o.qty, S.cap - S.battery); S.coins -= o.total; S.battery += q; fx.text(p.x, p.y, `+${q.toFixed(1)} kWh`, '#8ecae6');
      } else {
        if (S.battery < o.qty) { sfx.deny(); fx.text(p.x, p.y, 'Not enough stored', '#ff6b6b', 15); return; }
        S.battery -= o.qty; S.coins += o.total; fx.text(p.x, p.y, `+${o.total} coins`, '#ffd166'); sfx.coin();
      }
      S.stats.deals++; sfx.deal(); fx.burst(p.x, p.y, hs.color, 18, 160); hs.offer = null; hs.jump = 1; return;
    }
  }
  // roof slots
  for (const hs of S.houses) hs.slotsPos.forEach((sp, k) => {
    if (sp.placed || Math.hypot(p.x - sp.x, p.y - sp.y) > 20) return;
    const cost = Math.round(S.panelCost);
    if (S.coins < cost) { sfx.deny(); fx.text(sp.x, sp.y - 16, `Need ${cost}`, '#ff6b6b', 15); fx.shake(3); return; }
    S.coins -= cost; S.panelCost *= C.panelCostGrowth; sp.placed = true; hs.panels.push(k); S.stats.panels++;
    tweens.add(sp, 'scale', 0, 1, 0.45, easeOutBack); sp.glow = 1; fx.burst(sp.x, sp.y, '#8ecae6', 16, 150); fx.text(sp.x, sp.y - 18, `-${cost}`, '#ffd166', 16); sfx.place(); S.hero.target = sp.x; S.hero.pendingJump = true; solSay(C.solLines[(Math.random() * C.solLines.length) | 0]);
    if (S.stats.panels === 1) showBanner('Panels charge the street battery. Tap golden sparks for bonus kWh!', '#ffd166', 3.6);
    if (S.stats.panels === 3) showBanner('Neighbours will offer deals. Prices follow the weather.', '#8ecae6', 3.4);
  });
  if (inRect(p, BTN.battery)) {
    const cost = Math.round(S.capCost);
    if (S.coins < cost) { sfx.deny(); fx.text(p.x, p.y - 16, `Need ${cost}`, '#ff6b6b', 15); return; }
    S.coins -= cost; S.cap += C.batteryUpgrade; S.capCost *= C.batteryUpgradeGrowth; sfx.place(); fx.text(p.x, p.y - 16, `+${C.batteryUpgrade} kWh capacity`, '#8ecae6', 15);
  }
  if (inRect(p, BTN.speed)) { S.speed = S.speed === 1 ? 3 : 1; sfx.tick(); }
  if (inRect(p, BTN.mute)) sfx.toggle();
  if (inRect(p, BTN.help)) showBanner('Panels → battery. Before sunset, shortfalls buy grid power (costs coins). After grid-off, only the battery keeps lights on.', '#fff', 5);
}

// ---------- update ----------
function update(dt) {
  titleT += dt; tweens.update(dt); fx.update(dt);
  while (input.clicks.length) handleClick(input.clicks.shift());
  if (mode === 'play') {
    if (input.consumeKey(' ')) S.speed = S.speed === 1 ? 3 : 1;
    if (input.consumeKey('m')) sfx.toggle();
    step(dt);
    if (S.banner) { S.banner.t -= dt; if (S.banner.t <= 0) S.banner = null; }
    S.houses.forEach(hs => hs.slotsPos.forEach(sp => sp.glow = Math.max(0, sp.glow - dt)));
  } else if (input.consumeKey(' ') || input.consumeKey('enter')) { mode === 'title' ? newGame(true) : newGame(S.daily); }
}

// ---------- render ----------
function skyColors(h) {
  const el = elevation(C.latitude, DOY, h);
  const night = ['#0b1026', '#1b2350'], dusk = ['#2b2d6e', '#f28f3b'], day = ['#4aa3ff', '#bfe6ff'];
  if (el < -8) return night;
  if (el < 0) { const t = (el + 8) / 8; return [lerpColor(night[0], dusk[0], t), lerpColor(night[1], dusk[1], t)]; }
  if (el < 10) { const t = el / 10; return [lerpColor(dusk[0], day[0], t), lerpColor(dusk[1], day[1], t)]; }
  return day;
}
function drawCoin(x, y, r = 8) { ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.strokeStyle = '#c98b00'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#c98b00'; ctx.font = `900 ${r * 1.2}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('S', x, y + 1); ctx.textBaseline = 'alphabetic'; }
function button(r, label, active = true, accent = '#ffd166') {
  const hover = inRect({ x: input.x, y: input.y }, r);
  roundRect(ctx, r.x, r.y + (hover ? -2 : 0), r.w, r.h, 12); ctx.fillStyle = active ? (hover ? '#ffffff' : '#fff7e0') : '#8a8fa3'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = active ? accent : '#555'; ctx.stroke();
  ctx.fillStyle = '#1d2240'; ctx.font = '800 15px system-ui'; ctx.textAlign = 'center'; ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 5 + (hover ? -2 : 0));
}
function drawSky(h) {
  const [top, bot] = skyColors(h);
  const g = ctx.createLinearGradient(0, 0, 0, GROUND); g.addColorStop(0, top); g.addColorStop(1, bot); ctx.fillStyle = g; ctx.fillRect(0, 0, C.W, GROUND);
  const el = elevation(C.latitude, DOY, h);
  if (el < 2) { const a = clamp((2 - el) / 10, 0, 1); for (let i = 0; i < 60; i++) { const x = (i * 157.3) % C.W, y = (i * 91.7) % 250; ctx.globalAlpha = a * (0.4 + 0.6 * Math.abs(Math.sin(titleT * 1.5 + i))); ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 2, 2); } ctx.globalAlpha = 1; }
  // sun on its real arc: x by hour, y by elevation
  const sx = ((h - SUN.sunrise + 1) / (SUN.sunset - SUN.sunrise + 2)) * C.W, sy = GROUND - 20 - (el / Math.max(MAX_EL, 20)) * 300;
  if (el > -4) {
    const glow = ctx.createRadialGradient(sx, sy, 5, sx, sy, 90); glow.addColorStop(0, 'rgba(255,220,120,.9)'); glow.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx, sy, 90, 0, 7); ctx.fill();
    ctx.fillStyle = el > 6 ? '#ffe066' : '#ff9f43'; ctx.beginPath(); ctx.arc(sx, sy, 26 + Math.sin(titleT * 3) * 1.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a4b00'; ctx.beginPath(); ctx.arc(sx - 8, sy - 4, 3, 0, 7); ctx.arc(sx + 8, sy - 4, 3, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7a4b00'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(sx, sy + 3, 9, 0.2, Math.PI - 0.2); ctx.stroke();
  } else { ctx.fillStyle = '#f1f3ff'; ctx.beginPath(); ctx.arc(C.W - 140, 80, 20, 0, 7); ctx.fill(); ctx.fillStyle = skyColors(h)[0]; ctx.beginPath(); ctx.arc(C.W - 130, 74, 18, 0, 7); ctx.fill(); }
}
function drawClouds(cover) {
  const n = Math.round(cover * S.clouds.length + 1);
  for (let i = 0; i < n; i++) {
    const c = S.clouds[i], g = Math.round(255 - cover * 110);
    ctx.fillStyle = `rgba(${g},${g},${g + 8},${0.75 + cover * 0.2})`;
    ctx.beginPath(); ctx.arc(c.x, c.y, 26 * c.s, 0, 7); ctx.arc(c.x + 28 * c.s, c.y - 12 * c.s, 32 * c.s, 0, 7); ctx.arc(c.x + 60 * c.s, c.y, 24 * c.s, 0, 7); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(180,200,255,.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); S.rain.forEach(r => { ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - 3, r.y + 10); }); ctx.stroke();
}
function drawHouse(hs, night) {
  const { x, w, top, bodyH, roofRise } = hs;
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x + 6, GROUND - 4, w, 8);
  ctx.fillStyle = hs.color; ctx.fillRect(x, top, w, bodyH);
  ctx.fillStyle = hs.roof; ctx.beginPath(); ctx.moveTo(x - 12, top + 4); ctx.lineTo(x + w + 12, top - roofRise - 4); ctx.lineTo(x + w + 12, top - roofRise + 8); ctx.lineTo(x - 12, top + 14); ctx.closePath(); ctx.fill();
  ctx.fillRect(x + w - 2, top - roofRise, 4, roofRise);
  ctx.beginPath(); ctx.moveTo(x, top + 6); ctx.lineTo(x + w, top - roofRise + 6); ctx.lineTo(x + w, top); ctx.lineTo(x, top); ctx.fillStyle = hs.color; ctx.fill();
  // windows
  const lit = hs.lit > 0.5, winCol = night ? (lit ? '#ffd166' : '#1a1d33') : '#cfeaff';
  for (let k = 0; k < 2; k++) {
    const wx = x + 16 + k * 58, wy = top + 18;
    if (night && lit) { ctx.fillStyle = 'rgba(255,209,102,.25)'; ctx.beginPath(); ctx.arc(wx + 15, wy + 13, 28, 0, 7); ctx.fill(); }
    ctx.fillStyle = winCol; ctx.fillRect(wx, wy, 30, 26); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(wx, wy, 30, 26);
    ctx.beginPath(); ctx.moveTo(wx + 15, wy); ctx.lineTo(wx + 15, wy + 26); ctx.stroke();
  }
  ctx.fillStyle = '#5b3a29'; ctx.fillRect(x + w / 2 - 12, GROUND - 40, 24, 40);
  // neighbour character
  const bob = Math.sin(titleT * 3 + hs.bob) * 1.5 - hs.jump * 14 * Math.sin(hs.jump * Math.PI);
  const cx = x + w / 2 + 34, cy = GROUND - 22 + bob;
  if (!hs.you && sprite(hs.robot, cx, GROUND + 4 + bob, 56)) { /* robot neighbour */ } else if (!hs.you) {
  ctx.fillStyle = hs.roof; roundRect(ctx, cx - 9, cy - 4, 18, 22, 7); ctx.fill();
  ctx.fillStyle = '#ffe0bd'; ctx.beginPath(); ctx.arc(cx, cy - 12, 10, 0, 7); ctx.fill();
  ctx.fillStyle = '#222'; ctx.fillRect(cx - 4, cy - 14, 2.5, 3); ctx.fillRect(cx + 2, cy - 14, 2.5, 3);
  }
  ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(hs.name, x + w / 2, GROUND + 16);
  // roof slots + panels
  hs.slotsPos.forEach(sp => {
    const ang = -Math.atan2(roofRise, w + 12);
    ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(ang);
    if (sp.placed) {
      const s = sp.scale; ctx.scale(s, s);
      ctx.fillStyle = '#1f3b73'; ctx.fillRect(-15, -8, 30, 14); ctx.strokeStyle = '#cfd8e3'; ctx.lineWidth = 2; ctx.strokeRect(-15, -8, 30, 14);
      ctx.strokeStyle = 'rgba(160,200,255,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, -8); ctx.lineTo(-5, 6); ctx.moveTo(5, -8); ctx.lineTo(5, 6); ctx.moveTo(-15, -1); ctx.lineTo(15, -1); ctx.stroke();
      if (S.prod > 0.1) { ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.15 * Math.sin(titleT * 4 + sp.x)})`; ctx.fillRect(-15, -8, 10, 14); }
    } else {
      const hover = Math.hypot(input.x - sp.x, input.y - sp.y) < 20, pulse = 0.5 + 0.5 * Math.sin(titleT * 4);
      ctx.setLineDash([4, 3]); ctx.strokeStyle = hover ? '#fff' : `rgba(255,255,255,${0.4 + pulse * 0.4})`; ctx.lineWidth = 2; ctx.strokeRect(-15, -8, 30, 14); ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; ctx.font = '900 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('+', 0, 4);
    }
    ctx.restore();
    if (!sp.placed && Math.hypot(input.x - sp.x, input.y - sp.y) < 20) { ctx.fillStyle = 'rgba(0,0,0,.7)'; roundRect(ctx, sp.x - 30, sp.y - 38, 60, 22, 6); ctx.fill(); drawCoin(sp.x - 16, sp.y - 27, 6); ctx.fillStyle = '#fff'; ctx.font = '800 12px system-ui'; ctx.fillText(Math.round(S.panelCost), sp.x + 6, sp.y - 23); }
  });
}
function drawOffer(hs) {
  const o = hs.offer; if (!o) return;
  const bx = hs.x - 14, by = hs.top - hs.roofRise - 92, bw = hs.w + 28, bh = 62, k = o.pop;
  ctx.save(); ctx.translate(bx + bw / 2, by + bh); ctx.scale(k, k); ctx.translate(-(bx + bw / 2), -(by + bh));
  const hover = inRect({ x: input.x, y: input.y }, { x: bx, y: by, w: bw, h: bh });
  roundRect(ctx, bx, by, bw, bh, 12); ctx.fillStyle = hover ? '#fff' : '#fffaf0'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = o.sell ? '#2a9d8f' : '#e76f51'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx + bw / 2 - 8, by + bh); ctx.lineTo(bx + bw / 2, by + bh + 10); ctx.lineTo(bx + bw / 2 + 8, by + bh); ctx.fillStyle = hover ? '#fff' : '#fffaf0'; ctx.fill();
  ctx.fillStyle = '#333'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(o.line, bx + bw / 2, by + 15);
  ctx.font = '900 14px system-ui'; ctx.fillStyle = o.sell ? '#2a9d8f' : '#e76f51';
  ctx.fillText(o.sell ? `BUY ${o.qty} kWh` : `SELL ${o.qty} kWh`, bx + bw / 2 - 10, by + 35);
  drawCoin(bx + bw / 2 - 14, by + 49, 6); ctx.fillStyle = '#333'; ctx.font = '800 13px system-ui'; ctx.fillText(`${o.total}`, bx + bw / 2 + 6, by + 54);
  ctx.fillStyle = o.sell ? '#2a9d8f' : '#e76f51'; ctx.fillRect(bx + 8, by + bh - 5, (bw - 16) * clamp(o.life / C.offerLife, 0, 1), 3);
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
  if (h.say) { ctx.font = '800 13px system-ui'; const tw = ctx.measureText(h.say).width + 20; roundRect(ctx, h.x - tw / 2, y - 112, tw, 26, 13); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#f4a261'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#1d2240'; ctx.textAlign = 'center'; ctx.fillText(h.say, h.x, y - 94); }
}
function drawStorm() {
  const st = S.storm; if (!st.active) return;
  const wob = Math.sin(titleT * 5) * 4;
  if (!sprite('storm', st.x, st.y + wob, 110, false, st.flee > 0 ? 0.7 : 1)) { ctx.fillStyle = '#445'; ctx.beginPath(); ctx.arc(st.x, st.y - 50, 50, 0, 7); ctx.fill(); }
  if (st.flee === 0 && Math.random() < 0.04) fx.burst(st.x + (Math.random() - 0.5) * 60, st.y - 20, '#a0f0ff', 4, 60, 0.3, 2, 300);
}
function drawHUD() {
  const h = S.hour, w = weatherAt(h);
  // forecast strip
  roundRect(ctx, 10, 8, 470, 42, 12); ctx.fillStyle = 'rgba(10,14,40,.55)'; ctx.fill();
  ctx.font = '800 20px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(fmtHour(h), 22, 36);
  for (let i = 0; i < 5; i++) {
    const hh = Math.floor(h) + i, kind = C.weatherKinds[S.weather[Math.min(24, hh)]], x = 100 + i * 75;
    ctx.fillStyle = i === 0 ? '#ffd166' : 'rgba(255,255,255,.85)'; ctx.font = '700 11px system-ui'; ctx.fillText(`${String(hh % 24).padStart(2, '0')}h ${kind.label}`, x, 25);
    ctx.fillStyle = kind.priceMul > 1.2 ? '#ff8fab' : kind.priceMul < 0.9 ? '#b7e4c7' : '#ddd'; ctx.fillText(`grid ${gridPrice(hh).toFixed(1)}`, x, 41);
  }
  // sun times (real for today)
  roundRect(ctx, C.W - 250, 8, 240, 42, 12); ctx.fillStyle = 'rgba(10,14,40,.55)'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'right';
  ctx.fillText(`${C.placeName} sun today: ${fmtHour(SUN.sunrise)}–${fmtHour(SUN.sunset)} (solar)`, C.W - 20, 25);
  ctx.fillStyle = S.gridOff ? '#ff8fab' : '#ffd166'; ctx.fillText(S.gridOff ? 'GRID OFF · battery only' : `Grid off at ${fmtHour(OFFGRID)}`, C.W - 20, 41);
  // bottom bar
  ctx.fillStyle = 'rgba(10,14,40,.85)'; ctx.fillRect(0, 470, C.W, 70);
  drawCoin(30, 504, 11); ctx.fillStyle = S.coins < 0 ? '#ff6b6b' : '#fff'; ctx.font = '900 22px system-ui'; ctx.textAlign = 'left'; ctx.fillText(Math.floor(S.coins), 48, 512);
  // battery
  if (IMG.ready('battery')) ctx.drawImage(IMG.battery, 100, 487, 20, 34);
  const bx = 130, by = 488, bw = 190, bh = 32, f = clamp(S.battery / S.cap, 0, 1);
  roundRect(ctx, bx, by, bw, bh, 8); ctx.fillStyle = '#222842'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillRect(bx + bw, by + 10, 5, 12);
  roundRect(ctx, bx + 3, by + 3, (bw - 6) * f, bh - 6, 6); ctx.fillStyle = f < 0.2 ? '#ff6b6b' : f < 0.5 ? '#ffd166' : '#80ed99'; ctx.fill();
  ctx.fillStyle = '#0b1026'; ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`${S.battery.toFixed(1)} / ${S.cap} kWh`, bx + bw / 2, by + 21);
  ctx.textAlign = 'left'; ctx.font = '700 12px system-ui'; ctx.fillStyle = '#80ed99'; ctx.fillText(`Sun ${S.prod.toFixed(1)} kW`, 335, 500);
  ctx.fillStyle = '#ffadad'; ctx.fillText(`Use ${S.demand.toFixed(1)} kW`, 335, 518);
  ctx.fillStyle = '#ccc'; ctx.fillText(w.kind.label, 430, 509);
  button(BTN.battery, `Battery +${C.batteryUpgrade} (${Math.round(S.capCost)})`, S.coins >= S.capCost);
  button(BTN.speed, S.speed === 1 ? 'Speed x1' : 'Speed x3', true, '#8ecae6');
  button(BTN.mute, sfx.muted ? 'Sound off' : 'Sound', true, '#cdb4db');
  button(BTN.help, '?', true, '#cdb4db');
  // day progress
  const p = (h - C.dayStartHour) / (C.dayEndHour - C.dayStartHour), og = (OFFGRID - C.dayStartHour) / (C.dayEndHour - C.dayStartHour);
  ctx.fillStyle = '#ffd166'; ctx.fillRect(0, 468, C.W * og, 3); ctx.fillStyle = '#ff8fab'; ctx.fillRect(C.W * og, 468, C.W * (1 - og), 3);
  ctx.fillStyle = '#fff'; ctx.fillRect(C.W * p - 2, 464, 4, 10);
  if (S.banner) {
    const b = S.banner; ctx.globalAlpha = clamp(b.t / 0.4, 0, 1);
    ctx.font = '800 17px system-ui'; const tw = Math.min(C.W - 40, ctx.measureText(b.text).width + 40);
    roundRect(ctx, C.W / 2 - tw / 2, 62 + b.y, tw, 36, 18); ctx.fillStyle = 'rgba(10,14,40,.85)'; ctx.fill();
    ctx.fillStyle = b.color; ctx.textAlign = 'center'; ctx.fillText(b.text, C.W / 2, 86 + b.y, C.W - 60); ctx.globalAlpha = 1;
  }
}
function drawWorld(h) {
  const night = elevation(C.latitude, DOY, h) < -2;
  drawSky(h); if (S) drawClouds(weatherAt(h).cover);
  // distant hills
  ctx.fillStyle = night ? '#1b2a3a' : '#7cc36e'; ctx.beginPath(); ctx.moveTo(0, GROUND); for (let x = 0; x <= C.W; x += 40) ctx.lineTo(x, GROUND - 40 - Math.sin(x / 120) * 18); ctx.lineTo(C.W, GROUND); ctx.fill();
  ctx.fillStyle = night ? '#24352a' : '#5fae55'; ctx.fillRect(0, GROUND, C.W, 52);
  ctx.fillStyle = night ? '#3b3f4a' : '#9aa0a6'; ctx.fillRect(0, GROUND + 26, C.W, 18);
  ctx.strokeStyle = '#f1f1f1'; ctx.lineWidth = 2; ctx.setLineDash([16, 14]); ctx.beginPath(); ctx.moveTo(0, GROUND + 35); ctx.lineTo(C.W, GROUND + 35); ctx.stroke(); ctx.setLineDash([]);
  return night;
}
function render() {
  const off = fx.offset();
  ctx.setTransform(stage.scale, 0, 0, stage.scale, off.x * stage.scale, off.y * stage.scale);
  if (mode === 'title') {
    const fakeH = 6 + ((titleT * 0.6) % 16);
    drawWorld(fakeH);
    ctx.fillStyle = 'rgba(10,14,40,.55)'; ctx.fillRect(0, 0, C.W, C.H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffd166'; ctx.font = `900 ${64 + Math.sin(titleT * 2) * 2}px system-ui`; ctx.fillText(C.title, C.W / 2, 170);
    ctx.fillStyle = '#ffb703'; ctx.font = '700 16px system-ui'; ctx.fillText(C.subtitle, C.W / 2, 112);
    ctx.fillStyle = '#fff'; ctx.font = '600 20px system-ui'; ctx.fillText(C.tagline, C.W / 2, 212);
    sprite('solFront', 120, 470 + Math.sin(titleT * 3) * 4, 190); sprite('storm', C.W - 130, 200 + Math.sin(titleT * 2) * 8, 120);
    ctx.font = '500 15px system-ui'; ctx.fillStyle = '#dde';
    ctx.fillText('Help Solarchik install panels · catch sun sparks · shoo storm drones · trade with robot neighbours', C.W / 2, 260);
    ctx.fillText(`The sun follows today's real arc over ${C.placeName}: up ${fmtHour(SUN.sunrise)}, down ${fmtHour(SUN.sunset)} (solar time).`, C.W / 2, 285);
    ctx.fillText(`At sunset the grid switches off. Keep every window lit until 22:00.`, C.W / 2, 310);
    button(BTN.daily, "Today's sky (daily)"); button(BTN.random, 'Random weather', true, '#8ecae6');
    if (best()) { ctx.fillStyle = '#ffd166'; ctx.font = '700 15px system-ui'; ctx.fillText(`Best: ${best()}`, C.W / 2, 450); }
    ctx.fillStyle = '#aab'; ctx.font = '500 12px system-ui'; ctx.fillText('Space = speed x3 · M = sound', C.W / 2, 520);
  } else {
    const night = drawWorld(S.hour);
    S.houses.forEach(hs => drawHouse(hs, night));
    drawStorm(); drawHero();
    S.sparks.forEach(s => {
      const x = s.x + Math.sin(s.wob) * 6, a = clamp(s.life, 0, 1); s.x += 0; ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(x, s.y, 2, x, s.y, 18); g.addColorStop(0, '#fff6c2'); g.addColorStop(1, 'rgba(255,209,102,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, s.y, 18, 0, 7); ctx.fill(); ctx.fillStyle = '#ffd166'; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 4 : 10, an = i * Math.PI / 5 + titleT * 2; ctx.lineTo(x + Math.cos(an) * r, s.y + Math.sin(an) * r); } ctx.fill(); ctx.globalAlpha = 1;
      s.hitX = x;
    });
    S.houses.forEach(drawOffer);
    drawHUD();
    if (mode === 'end') {
      ctx.fillStyle = 'rgba(10,14,40,.78)'; ctx.fillRect(0, 0, C.W, C.H);
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '900 40px system-ui';
      ctx.fillText(S.stars === 3 ? 'Fully off-grid!' : S.stars ? 'The street made it… mostly' : 'Lights out on Sunny Block', C.W / 2, 140);
      for (let i = 0; i < 3; i++) { ctx.font = '900 54px system-ui'; ctx.fillStyle = i < S.stars ? '#ffd166' : '#444a66'; ctx.fillText('★', C.W / 2 - 60 + i * 60, 225); }
      ctx.fillStyle = '#fff'; ctx.font = '800 28px system-ui'; ctx.fillText(`${S.score} pts${S.newBest ? '  · NEW BEST!' : ''}`, C.W / 2, 280);
      ctx.font = '600 15px system-ui'; ctx.fillStyle = '#dde';
      ctx.fillText(`${Math.round(S.lit * 100)}% lit after grid-off · ${S.stats.panels} panels · ${S.stats.produced.toFixed(0)} kWh of sun · ${S.stats.deals} deals · ${S.stats.sparks} sparks`, C.W / 2, 320);
      ctx.fillText(`Grid bought: ${S.stats.gridKwh.toFixed(1)} kWh for ${Math.round(S.stats.gridCost)} coins · ${Math.floor(S.coins)} coins left`, C.W / 2, 345);
      button(BTN.again, 'Play again'); button(BTN.copy, 'Copy result', true, '#8ecae6');
    }
  }
  fx.draw(ctx);
}

startLoop(update, render);
// debug/test hook (used by automated smoke test)
window.__sunny = { get state() { return S; }, get mode() { return mode; }, newGame, OFFGRID, SUN };
