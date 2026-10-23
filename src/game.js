// Sunny Block: state machine (title → tutorial → day → dusk → night → result → upgrade), levels and saves.
import { C, G, canvas, stage, ctx, input, tweens, fx, sfx, loadSave, writeSave, has, rnd, showBanner, readControls, ctl, touchZoneAt, touchOn, inRect, clamp } from './core.js';
import { startLoop, lerp, easeOutBack, easeOutCubic } from './engine.js';
import { GROUND, SUNSET, sunFactor, buildHouses, makeClouds, updateWeather, drawWorld, drawHouse, drawStreetBattery, nightAmount, windowAt, slotAt } from './world.js';
import { makeHero, updateHero, heroDayActions, drawHero, buildSlot, cleanSlot, updateCombo, updateSparks, drawSparks, collectSpark, sparkPos, spawnSpark, spawnDrone, updateDrones, drawDrones, tapDrone, droneHit, dronesFlee, updateFlyers, drawFlyers, drawBolts, solSay, api } from './actors.js';
import { startNight, updateNight, onNightClick, routeFill, NIGHT_START } from './night.js';
import { BTN, levelCard, upCard, drawHUD, drawBanner, drawSlotTooltip, drawTouch, drawTutorial, drawTitle, drawResult, drawUpgrade, drawFinal, drawPause } from './ui.js';
import { fmtHour } from './sun.js';
import { THEME } from './theme.js';

loadSave();
if (new URLSearchParams(location.search).has('touch')) G.forceTouch = true;
if (THEME.name) G.themeName = THEME.name;
const titleHouses = buildHouses(6);
titleHouses.forEach((hs, i) => hs.slots.forEach((sp, k) => { if ((i + k) % 2 === 0) { sp.placed = true; sp.scale = 1; } }));
let R = null, choices = [];

// ---------- level setup ----------
function makeLevel(L, lv) {
  const houses = buildHouses(L.houses);
  const S = {
    lv, L, houses, slots: houses.flatMap(h => h.slots), windows: houses.flatMap(h => h.wins), hero: makeHero(96),
    sparks: [], drones: [], flyers: [], bolts: [], pending: [], combo: { n: 0, t: 0, tmax: 1, mult: 1, pop: 0, bump: 0 },
    coins: L.coins, battery: C.economy.startBattery, cap: C.economy.batteryStart + (has('bigbat') ? 8 : 0),
    panelCost: C.economy.panelCost * (has('cheap') ? 0.75 : 1), capCost: C.economy.batteryUpgradeCost,
    phase: 'day', t: 0, hour: C.dayStartHour, waveIdx: 0, cloud: L.weather[0], clouds: makeClouds(), rain: [], prodOn: false, prod: 0,
    stats: { sparks: 0, sparkKwh: 0, built: 0, stomps: 0, drones: 0, cleaned: 0, covered: 0, maxCombo: 0, combos: 0, hurts: 0, darks: 0, fills: 0, routed: 0 },
    routeMap: new Map(), ui: { coinShown: L.coins, batPulse: 0, coinPulse: 0 }, nightLit: 0, nightTot: 0,
  };
  return S;
}
export function startLevel(lv) {
  const S = makeLevel(C.levels[lv], lv);
  const s0 = S.houses[0].slots[0]; s0.placed = true; s0.scale = 1; s0.sparkT = 0.3;   // a head start: one panel already on Solarchik's roof
  G.S = S; G.mode = 'play'; G.paused = false; R = null;
  showBanner(`${S.L.day}: ${S.L.name}. Build panels and catch sparks before sunset!`, '#ffd166', 3);
  sfx.music('day'); sfx.tension = 0;
  THEME.onLevelStart(S, api());
}
export function startTutorial() {
  const S = makeLevel(C.tutorialLevel, -1); S.tut = { step: 0, t: 0, x0: S.hero.x }; S.hour = 12.5;
  G.S = S; G.mode = 'play'; G.paused = false; sfx.music('day');
}
function finishTutorial() { G.save.tut = true; writeSave(); startLevel(0); }
function playPrimary() { sfx.unlock(); if (!G.save.tut) startTutorial(); else startLevel(Math.min(4, G.save.unlocked - 1)); }

// ---------- tutorial script ----------
function tutorialStep(S, dt) {
  const tut = S.tut, h = S.hero; tut.t += dt;
  const next = () => { tut.step++; tut.t = 0; sfx.deal(); fx.burst(h.x, h.y - 40, '#ffd166', 20, 180); };
  switch (tut.step) {
    case 0: if (Math.abs(h.x - tut.x0) > 70) next(); break;
    case 1: if (h.plat) next(); break;
    case 2: if (S.stats.built >= 1) next(); break;
    case 3:
      if (!S.sparks.length && S.stats.sparks === 0) { const x = clamp(h.x + 110 * (h.x < C.W / 2 ? 1 : -1), 60, C.W - 60); spawnSpark(S, x, h.y - 50, { floatY: h.y - 50, life: 999 }); }
      if (S.stats.sparks >= 1) next(); break;
    case 4:
      if (!S.drones.some(d => d.state !== 'dead')) {
        if (S.stats.drones >= 1) { next(); break; }
        const hs = S.houses[1]; spawnDrone(S, { x: hs.x + hs.w / 2, y: hs.roofY - 72, still: true, hp: 1 });
      }
      break;
    case 5:
      if (!tut.win) {
        S.tutNight = true; S.battery = Math.max(S.battery, 4); S.windows.forEach(w => { w.light = 1; });
        tut.win = S.houses[1].wins[0]; tut.win.light = 0.3; showBanner('After sunset the grid is OFF. Windows fade unless you power them.', '#ffd166', 3);
      }
      tut.win.light = Math.max(0.12, tut.win.light - dt * 0.03);
      if (tut.win.light >= 0.9 && tut.t > 1.2) next();
      break;
    case 6: if (tut.t > 1.6) finishTutorial(); break;
  }
}

// ---------- simulation ----------
function sampleWeather(arr, p) { const f = clamp(p, 0, 1) * (arr.length - 1), i = Math.floor(f); return lerp(arr[i], arr[Math.min(arr.length - 1, i + 1)], f - i); }
function daySim(S, dt) {
  if (!S.tut) S.t += dt;
  const p = S.t / S.L.dayS;
  if (!S.tut) S.hour = lerp(C.dayStartHour, SUNSET, p);
  S.cloud = sampleWeather(S.L.weather, p);
  // passive production into the street battery; overflow is sold
  const sun = sunFactor(S.hour) * (1 - S.cloud) * (has('turbo') ? 1.3 : 1) * THEME.mods.panelPower;
  let kwh = 0; for (const sp of S.slots) if (sp.placed && sp.cover <= 0) kwh += C.economy.panelKwh * sun * (sp.shadow > 0 ? 0.3 : 1) * dt;
  S.prod = kwh / dt; S.prodOn = kwh > 0.0001;
  const put = Math.min(Math.max(0, S.cap - S.battery), kwh); S.battery += put; S.coins += (kwh - put) * C.economy.sellPrice;
  // storm waves
  const W = S.L.waves;
  if (S.waveIdx < W.length && S.t >= W[S.waveIdx][0]) {
    const n = W[S.waveIdx][1]; S.waveIdx++;
    showBanner(`Storm wave ${S.waveIdx}/${W.length}: ${n} drone${n > 1 ? 's' : ''}! Stomp them before they cover your panels`, '#8ecae6', 2.6); sfx.alarm();
    for (let i = 0; i < n; i++) S.pending.push({ t: i * 0.8, side: i % 2 ? 1 : -1 });
  }
  for (let i = S.pending.length - 1; i >= 0; i--) { const q = S.pending[i]; q.t -= dt; if (q.t <= 0) { spawnDrone(S, { side: q.side }); S.pending.splice(i, 1); } }
  heroDayActions(S, dt, ctl);
  if (S.tut) tutorialStep(S, dt);
  if (!S.tut && S.t >= S.L.dayS) startDusk(S);
}
function startDusk(S) {
  S.phase = 'dusk'; S.t = 0; dronesFlee(S); S.pending.length = 0;
  S.sparks.forEach(s => s.life = Math.min(s.life, 1.2));
  showBanner(`Sunset ${fmtHour(SUNSET)}: GRID OFF! Only your ${S.battery.toFixed(1)} kWh battery can light the street now`, '#ff8fab', 3.2);
  sfx.dark(); sfx.music(null); fx.shake(6);
}
function sim(dt) {
  const S = G.S;
  G.ctlJumpHeld = ctl.jumpHeld; G.touchUsed = touchOn();
  updateHero(S, dt, ctl);
  if (S.phase === 'day') daySim(S, dt);
  else if (S.phase === 'dusk') { S.t += dt; S.hour = lerp(SUNSET, NIGHT_START(), S.t / C.duskSeconds); if (S.t >= C.duskSeconds) startNight(S); }
  else if (S.phase === 'night') updateNight(S, dt, ctl, endLevel);
  if (S.tut && S.tut.step === 5) tutorialNight(S, dt);
  updateSparks(S, dt); updateDrones(S, dt); updateCombo(S, dt); updateFlyers(S, dt); updateWeather(S, dt);
  S.houses.forEach(hs => { hs.jump = Math.max(0, hs.jump - dt * 2.2); });
  S.slots.forEach(sp => { sp.glow = Math.max(0, sp.glow - dt); });
  S.ui.batPulse = Math.max(0, S.ui.batPulse - dt * 3); S.ui.coinPulse = Math.max(0, S.ui.coinPulse - dt * 3);
  S.ui.coinShown += (S.coins - S.ui.coinShown) * Math.min(1, dt * 8);
  THEME.onUpdate(S, dt, api());
}
function tutorialNight(S, dt) {   // routing practice reuses the real night input code
  for (const [id, p] of input.pointers) { if (touchZoneAt(p)) continue; const w = windowAt(S, p.x, p.y); if (w) routeFill(S, w, S.routeMap.get(id) === w ? C.night.holdRate * dt : 1, S.routeMap.get(id) === w ? 'hold' : 'tap'); S.routeMap.set(id, w); }
  const h = S.hero, hs = S.houses.find(q => h.x > q.x - 12 && h.x < q.x + q.w + 12);
  if (hs && ctl.actionHeld) for (const w of hs.wins) routeFill(S, w, C.night.holdRate * dt, 'hold', { x: h.x, y: h.y - 10 });
}
function endLevel(S) {
  S.phase = 'done';
  S.lit = S.nightTot ? S.nightLit / S.nightTot : 0;
  THEME.onLevelEnd(S, api());
  const st = C.stars; S.stars = S.lit >= st[2] ? 3 : S.lit >= st[1] ? 2 : S.lit >= st[0] ? 1 : 0;
  S.score = Math.round(S.lit * 1000 + S.stats.maxCombo * 20 + S.stats.drones * 25 + S.battery * 10);
  const sv = G.save; sv.stars[S.lv] = Math.max(sv.stars[S.lv], S.stars); sv.best[S.lv] = Math.max(sv.best[S.lv], S.score);
  if (S.stars > 0) sv.unlocked = Math.max(sv.unlocked, Math.min(5, S.lv + 2));
  writeSave();
  G.mode = 'result'; R = { t: 0, card: 0, stars: [0, 0, 0], litShown: 0 };
  tweens.add(R, 'card', 0, 1, 0.5, easeOutBack); tweens.add(R, 'litShown', 0, S.lit, 1.1, easeOutCubic, 0.3);
  for (let i = 0; i < 3; i++) { tweens.add(R.stars, i, 0, 1, 0.45, easeOutBack, 0.6 + i * 0.28); }
  R.starFx = [0.85, 1.13, 1.41].map((t, i) => ({ t, done: i >= S.stars }));
  (S.stars ? sfx.win : sfx.lose)(); sfx.music('title'); sfx.tension = 0;
}
function resultNext() {
  const S = G.S;
  if (S.stars <= 0) return startLevel(S.lv);
  if (S.lv >= 4) { G.mode = 'final'; sfx.win(); return; }
  if (!G.save.picked[S.lv]) {
    const pool = C.upgrades.filter(u => !G.save.ups.includes(u.id)).sort(() => Math.random() - 0.5);
    if (pool.length) { choices = pool.slice(0, 3); G.mode = 'upgrade'; return; }
  }
  startLevel(S.lv + 1);
}
function pickUpgrade(i) {
  const u = choices[i]; if (!u) return;
  G.save.ups.push(u.id); G.save.picked[G.S.lv] = true; writeSave(); sfx.comboUp(4);
  showBanner(`${u.name}: ${u.desc}`, '#80ed99', 2.6);
  startLevel(G.S.lv + 1);
}
function toMenu() { G.mode = 'title'; G.S = null; G.paused = false; sfx.music('title'); }

// ---------- input routing ----------
function buyBattery(S) {
  const cost = Math.round(S.capCost);
  if (S.coins < cost) { sfx.deny(); fx.text(BTN.bat.x + 48, 76, `Need ${cost} coins`, '#ff6b6b', 15); return; }
  S.coins -= cost; S.cap += C.economy.batteryUpgrade; S.capCost *= C.economy.batteryUpgradeGrowth; sfx.place(); S.ui.batPulse = 1;
  fx.text(BTN.bat.x + 48, 78, `+${C.economy.batteryUpgrade} kWh capacity`, '#80ed99', 15);
}
function playClick(S, p) {
  if (touchZoneAt(p)) return;
  if (inRect(p, BTN.pause)) { G.paused = true; return; }
  if (S.tut && inRect(p, BTN.skip)) { finishTutorial(); return; }
  if (inRect(p, BTN.bat)) { if (S.phase === 'day' && !S.tut) buyBattery(S); return; }
  if (S.phase === 'night' || S.tutNight) { onNightClick(S, p); return; }
  if (S.phase !== 'day') return;
  let hit = null, hd = C.spark.tapRadius;
  for (const s of S.sparks) { const q = sparkPos(s), d = Math.hypot(p.x - q.x, p.y - q.y); if (d < hd) { hd = d; hit = s; } }
  if (hit) { S.sparks.splice(S.sparks.indexOf(hit), 1); collectSpark(S, hit); return; }
  const d = S.drones.find(q => droneHit(q, p.x, p.y)); if (d) { tapDrone(S, d); return; }
  const sp = slotAt(S, p.x, p.y);
  if (sp) {
    if (!sp.placed) buildSlot(S, sp, 'tap');
    else if (sp.cover > 0) { sp.taps++; fx.burst(sp.x, sp.y - 14, '#cfefff', 8, 90, 0.4, 2, -40); sfx.tick(); if (sp.taps >= C.cleanTaps) cleanSlot(S, sp); }
  }
}
function handleClick(p) {
  sfx.unlock();
  if (G.mode === 'title') {
    if (inRect(p, BTN.play)) return playPrimary();
    if (inRect(p, BTN.how)) return startTutorial();
    if (inRect(p, BTN.sound)) { sfx.toggle(); return; }
    for (let i = 0; i < 5; i++) if (inRect(p, levelCard(i)) && i < G.save.unlocked) { if (!G.save.tut) { G.save.tut = true; writeSave(); } return startLevel(i); }
    return;
  }
  if (G.mode === 'play') {
    const S = G.S;
    if (G.paused) {
      if (inRect(p, BTN.resume)) G.paused = false;
      else if (inRect(p, BTN.restart)) { G.paused = false; if (S.tut) finishTutorial(); else startLevel(S.lv); }
      else if (inRect(p, BTN.pmenu)) toMenu();
      else if (inRect(p, BTN.psound)) sfx.toggle();
      return;
    }
    return playClick(S, p);
  }
  if (G.mode === 'result') {
    if (!R || R.card < 0.95) return;
    if (inRect(p, BTN.next)) return resultNext();
    if (G.S.stars > 0 && inRect(p, BTN.retry)) return startLevel(G.S.lv);
    if (inRect(p, BTN.menu)) return toMenu();
    return;
  }
  if (G.mode === 'upgrade') { for (let i = 0; i < choices.length; i++) if (inRect(p, upCard(i))) return pickUpgrade(i); return; }
  if (G.mode === 'final') { if (inRect(p, BTN.fmenu)) toMenu(); else if (inRect(p, BTN.freplay)) startLevel(4); }
}
function handleKeys() {
  if (input.consumeKey('m')) sfx.toggle();
  const go = () => input.consumeKey('enter') || input.consumeKey(' ');
  if (G.mode === 'title') { if (go()) playPrimary(); return; }
  if (G.mode === 'play') {
    if (input.consumeKey('escape') || input.consumeKey('p')) { G.paused = !G.paused; return; }
    if (G.paused && input.consumeKey('enter')) G.paused = false;
    return;
  }
  if (G.mode === 'result' && R && R.card > 0.95) { if (go()) resultNext(); else if (input.consumeKey('r')) startLevel(G.S.lv); else if (input.consumeKey('escape')) toMenu(); return; }
  if (G.mode === 'upgrade') { for (let i = 0; i < 3; i++) if (input.consumeKey(String(i + 1))) return pickUpgrade(i); return; }
  if (G.mode === 'final' && go()) toMenu();
}

// ---------- main loop ----------
function tick(dt) {
  tweens.update(dt); fx.update(dt);
  if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
  readControls();
  const clicks = input.clicks.splice(0);
  for (const p of clicks) handleClick(p);
  handleKeys();
  if (G.mode === 'play' && !G.paused) sim(dt);
  if (G.mode === 'result' && R) {
    R.t += dt;
    R.starFx.forEach((s, i) => { if (!s.done && R.t >= s.t) { s.done = true; fx.burst(C.W / 2 - 70 + i * 70, 168, '#ffd166', 26, 220); sfx.star(i); } });
  }
}
function update(dt) {
  G.t += dt;
  const total = dt * G.timeScale, n = Math.max(1, Math.ceil(total / (1 / 60))), h = total / n;
  for (let i = 0; i < n; i++) { G.onTick?.(h); tick(h); input.endFrame(); }
  canvas.style.cursor = hoverTarget() ? 'pointer' : 'default';
}
function hoverTarget() {
  const p = { x: input.x, y: input.y }; if (p.x < 0) return false;
  if (G.mode === 'title') return inRect(p, BTN.play) || inRect(p, BTN.how) || inRect(p, BTN.sound) || [0, 1, 2, 3, 4].some(i => i < G.save.unlocked && inRect(p, levelCard(i)));
  if (G.mode === 'upgrade') return [0, 1, 2].some(i => inRect(p, upCard(i)));
  if (G.mode !== 'play' || !G.S) return false;
  const S = G.S; if (inRect(p, BTN.pause) || inRect(p, BTN.bat)) return true;
  if (S.phase === 'night' || S.tutNight) return !!windowAt(S, p.x, p.y);
  return S.sparks.some(s => { const q = sparkPos(s); return Math.hypot(p.x - q.x, p.y - q.y) < C.spark.tapRadius; }) || S.drones.some(d => droneHit(d, p.x, p.y)) || !!slotAt(S, p.x, p.y);
}
document.addEventListener('visibilitychange', () => { if (document.hidden && G.mode === 'play') G.paused = true; });

function render() {
  const off = fx.offset();
  ctx.setTransform(stage.scale, 0, 0, stage.scale, off.x * stage.scale, off.y * stage.scale);
  if (G.mode === 'title') { drawTitle(titleHouses); drawBanner(); fx.draw(ctx); return; }
  const S = G.S, hour = S.tutNight ? 20.5 : S.hour, nk = nightAmount(hour);
  drawWorld(hour, S);
  drawStreetBattery(S);
  S.houses.forEach(hs => drawHouse(hs, S, nk));
  THEME.drawWorld(ctx, S, api());
  drawDrones(S); drawHero(S); drawSparks(S); drawBolts(S);
  drawSlotTooltip(S);
  if (G.mode === 'play') { drawHUD(S); THEME.drawHUD(ctx, S, api()); drawTutorial(S); drawTouch(); }
  drawFlyers(S);
  if (G.mode === 'result') drawResult(S, R);
  else if (G.mode === 'upgrade') drawUpgrade(choices);
  else if (G.mode === 'final') drawFinal();
  if (G.mode === 'play' && G.paused) drawPause(S);
  if (G.mode !== 'play') drawBanner();
  fx.draw(ctx);
}

sfx.music('title');
startLoop(update, render);
// test hook (automated headless plays use it to read state and drive input)
window.__sunny = { G, C, input, BTN, levelCard, upCard, startLevel, startTutorial, SUNSET, get S() { return G.S; }, get mode() { return G.mode; }, set timeScale(v) { G.timeScale = v; } };
