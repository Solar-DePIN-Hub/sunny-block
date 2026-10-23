// Night finale: grid is off, windows fade one by one, the player routes battery power to them.
import { C, G, fx, sfx, input, has, rnd, showBanner, touchZoneAt } from './core.js';
import { lerp } from './engine.js';
import { SUNSET, windowAt, batteryPos } from './world.js';
import { solSay, api } from './actors.js';
import { THEME } from './theme.js';

export const NIGHT_START = () => SUNSET + 0.4;
export function startNight(S) {
  S.phase = 'night'; S.t = 0; S.nightLit = 0; S.nightTot = 0; S.surgeT = S.L.surgeEvery * 0.8; S.routeMap = new Map(); S.heroRoute = null;
  const order = S.windows.map((w, i) => i).sort(() => Math.random() - 0.5);
  S.windows.forEach(w => { w.light = Math.min(1, C.night.startLight * rnd(0.92, 1.08)); w.dark = false; w.surge = 0; w.drain = rnd(S.L.drain[0], S.L.drain[1]) * THEME.mods.drainRate; });
  order.forEach((wi, k) => { S.windows[wi].delay = k * 0.35 + rnd(0, 0.3); });   // they start fading one by one
  showBanner(G.touchUsed ? 'NIGHT: tap/drag fading windows to power them. SURGE? Run Solarchik there and tap ⚡!' : 'NIGHT: tap/drag fading windows to power them. SURGE? Run Solarchik there and press E!', '#ffd166', 4);
  sfx.music('night'); THEME.onNightStart(S, api());
}
export function routeFill(S, w, amount, kind, from) {
  // pointer power goes over the street line (loses some); Solarchik carries it lossless (from = his position)
  const k = C.night.fillKwh * (has('router') ? 0.7 : 1) * (from ? 1 : C.night.pointerLoss);
  if (!w.dark && w.light >= 0.985) return false;
  let fixed = kind === 'hold' ? 0 : C.night.overhead;
  if (w.dark) fixed += C.night.relight;
  const want = Math.min(amount, 1 - (w.dark ? 0 : w.light));
  if (S.battery < fixed + 0.02) {
    if (G.t - (S.emptyT || 0) > 1.2) { S.emptyT = G.t; fx.text(w.x + w.w / 2, w.y - 14, 'Battery empty!', '#ff6b6b', 16); sfx.deny(); }
    return false;
  }
  const got = Math.max(0, Math.min(want, (S.battery - fixed) / k));
  S.battery -= fixed + got * k; S.stats.routed += fixed + got * k;
  if (w.dark) { w.dark = false; w.light = 0; fx.text(w.x + w.w / 2, w.y - 12, 'Back on!', '#80ed99', 15); S.houses[w.house].mood = 0; }
  w.light = Math.min(1, w.light + got); w.fillFx = 1;
  if (kind !== 'hold' || Math.random() < 0.25) { const src = from || batteryPos(S); S.bolts.push({ x1: src.x, y1: src.y - 30, x2: w.x + w.w / 2, y2: w.y + w.h / 2, t: 0.22, max: 0.22 }); }
  if (kind !== 'hold') { sfx.route(); fx.burst(w.x + w.w / 2, w.y + w.h / 2, '#ffe066', 10, 120, 0.4, 2.5, 0); S.houses[w.house].jump = Math.max(S.houses[w.house].jump, 0.6); S.stats.fills++; }
  return true;
}
// pointer routing: touching a window powers it; dragging across windows powers each one
export function onNightClick(S, p) {
  const w = windowAt(S, p.x, p.y); if (!w) return false;
  routeFill(S, w, 1, 'tap'); S.routeMap.set(p.id, w); return true;
}
function pointerRouting(S, dt) {
  const seen = new Set();
  for (const [id, p] of input.pointers) {
    seen.add(id); if (touchZoneAt(p)) continue;
    const w = windowAt(S, p.x, p.y), prev = S.routeMap.get(id);
    if (w) routeFill(S, w, prev === w ? C.night.holdRate * dt : 1, prev === w ? 'hold' : 'tap');
    S.routeMap.set(id, w);
  }
  for (const id of [...S.routeMap.keys()]) if (!seen.has(id)) S.routeMap.delete(id);
}
// Solarchik can also power the house he stands in front of (hold E / ⚡)
function heroRouting(S, dt, ctl) {
  const h = S.hero, hs = S.houses.find(q => h.x > q.x - 12 && h.x < q.x + q.w + 12);
  if (!hs || !ctl.actionHeld) { S.heroRoute = null; return hs; }
  const fresh = ctl.actionPress || S.heroRoute !== hs; S.heroRoute = hs;
  for (const w of hs.wins) if (w.surge > 0 && !w.dark) resetSurge(S, w);
  for (const w of hs.wins) routeFill(S, w, fresh ? C.night.holdRate * dt * 4 : C.night.holdRate * dt, fresh ? 'tap' : 'hold', { x: h.x, y: h.y - 10 });
  return hs;
}
export function resetSurge(S, w) {
  w.surge = 0; w.light = Math.min(1, w.light + C.night.resetBonus); w.fillFx = 1; S.stats.resets = (S.stats.resets || 0) + 1;
  const hs = S.houses[w.house]; hs.jump = 1; hs.mood = 0;
  fx.text(w.x + w.w / 2, w.y - 16, 'Reset!', '#80ed99', 18); fx.burst(w.x + w.w / 2, w.y + w.h / 2, '#80ed99', 18, 160, 0.5, 3, 0); sfx.reset(); fx.shake(3);
  solSay(S, 'Breaker reset!', 1.1);
}
export function updateNight(S, dt, ctl, endLevel) {
  S.t += dt; const prog = Math.min(1, S.t / S.L.nightS); S.hour = lerp(NIGHT_START(), C.nightEndHour, prog);
  const esc = 1 + 0.7 * prog;
  for (const w of S.windows) {
    w.fillFx = Math.max(0, w.fillFx - dt * 3); if (w.surge > 0) { const b = Math.floor(w.surge / 1.1); w.surge += dt; if (Math.floor(w.surge / 1.1) !== b) sfx.surge(); }   // a surge lasts until Solarchik resets it (or the window dies)
    if (w.dark) continue;
    if (w.delay > 0) { w.delay -= dt; continue; }
    w.light -= (w.drain * esc + (w.surge > 0 ? C.night.surgeDrain : 0)) * dt;
    if (w.light <= 0) {
      w.light = 0; w.dark = true; w.surge = 0; S.stats.darks++; S.houses[w.house].mood = -1;
      sfx.windowOff(); fx.shake(3); fx.text(w.x + w.w / 2, w.y - 10, 'Lights out!', '#ff6b6b', 15);
    }
  }
  S.surgeT -= dt;
  if (S.surgeT <= 0) {
    S.surgeT = S.L.surgeEvery * rnd(0.8, 1.2);
    const c = S.windows.filter(w => !w.dark && w.surge <= 0 && w.delay <= 0 && w.light > 0.45);
    if (c.length && S.windows.filter(w => w.surge > 0).length < 2) { const w = c[(Math.random() * c.length) | 0]; w.surge = 0.001; sfx.alarm(); fx.text(w.x + w.w / 2, w.y - 22, 'SURGE!', '#ff8fab', 17); S.houses[w.house].jump = 1; S.stats.surges = (S.stats.surges || 0) + 1; }
  }
  pointerRouting(S, dt);
  const hs = heroRouting(S, dt, ctl);
  if (hs && !ctl.actionHeld && (S.heroHints || 0) < 3 && hs.wins.some(w => w.surge > 0 || w.dark || w.light < 0.5) && S.hero.sayT <= -2) { S.heroHints = (S.heroHints || 0) + 1; solSay(S, hs.wins.some(w => w.surge > 0) ? (G.touchUsed ? 'Tap ⚡ to reset the surge!' : 'Press E to reset the surge!') : (G.touchUsed ? 'Hold ⚡: lossless power' : 'Hold E: lossless power'), 1.6); }
  const lit = S.windows.filter(w => !w.dark).length;
  S.nightTot += dt * S.windows.length; S.nightLit += dt * lit;
  const low = S.windows.filter(w => w.dark || w.light < C.night.low).length / S.windows.length;
  sfx.tension = Math.min(1, prog * 0.6 + low * 0.8);
  if (S.t >= S.L.nightS) endLevel(S);
}
