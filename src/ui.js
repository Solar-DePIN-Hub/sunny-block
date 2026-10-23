// HUD, touch controls and every screen (title, tutorial overlay, result, upgrade pick, pause, final).
import { C, G, ctx, input, sfx, sprite, panel, button, drawCoin, wrapLines, starShape, icon, TOUCH, touchOn, ctl, roundRect, inRect, font, clamp } from './core.js';
import { lerp, lerpColor } from './engine.js';
import { fmtHour } from './sun.js';
import { SUN, SUNSET, GROUND, drawWorld, drawHouse, nightAmount } from './world.js';
import { sparkPos } from './actors.js';
import { NIGHT_START } from './night.js';

export const BTN = {
  play: { x: C.W / 2 - 140, y: 192, w: 280, h: 68 },
  how: { x: C.W / 2 - 200, y: 396, w: 190, h: 40 },
  sound: { x: C.W / 2 + 10, y: 396, w: 190, h: 40 },
  bat: { x: C.W - 166, y: 10, w: 108, h: 42 },
  pause: { x: C.W - 52, y: 12, w: 40, h: 38 },
  skip: { x: C.W - 172, y: 66, w: 160, h: 38 },
  next: { x: C.W / 2 - 260, y: 386, w: 170, h: 52 },
  retry: { x: C.W / 2 - 85, y: 386, w: 170, h: 52 },
  menu: { x: C.W / 2 + 90, y: 386, w: 170, h: 52 },
  resume: { x: C.W / 2 - 120, y: 190, w: 240, h: 50 },
  restart: { x: C.W / 2 - 120, y: 250, w: 240, h: 50 },
  pmenu: { x: C.W / 2 - 120, y: 310, w: 240, h: 50 },
  psound: { x: C.W / 2 - 120, y: 370, w: 240, h: 50 },
  share: { x: C.W / 2 + 166, y: 146, w: 122, h: 34 },
  fmenu: { x: C.W / 2 - 210, y: 400, w: 200, h: 52 },
  freplay: { x: C.W / 2 + 10, y: 400, w: 200, h: 52 },
};
export const levelCard = i => ({ x: C.W / 2 - 328 + i * 132, y: 282, w: 120, h: 96 });
export const upCard = i => ({ x: C.W / 2 - 362 + i * 248, y: 150, w: 228, h: 220 });
G.HUD_COIN = { x: C.W - 382, y: 31 }; G.HUD_BAT = { x: C.W - 237, y: 31 };

// ---------- HUD ----------
export function drawHUD(S) {
  const T = G.t;
  // left: day + clock + timeline
  panel(10, 8, 330, 46);
  roundRect(ctx, 18, 15, 50, 32, 9); ctx.fillStyle = '#ffd166'; ctx.fill();
  ctx.fillStyle = '#4a2400'; ctx.font = font(900, 15); ctx.textAlign = 'center'; ctx.fillText(S.L.day, 43, 37);
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(800, 14); ctx.fillText(S.L.name, 78, 28, 150);
  ctx.font = font(700, 13); ctx.fillStyle = S.phase === 'day' ? '#ffd166' : '#ff8fab';
  ctx.fillText(S.tut ? 'Training: no clock' : S.phase === 'day' ? `${fmtHour(S.hour)} · grid off at ${fmtHour(SUNSET)}` : `${fmtHour(S.hour)} · GRID OFF`, 78, 45);
  if (!S.tut) {
    const tot = S.L.dayS + C.duskSeconds + S.L.nightS, done = S.phase === 'day' ? S.t : S.phase === 'dusk' ? S.L.dayS + S.t : S.L.dayS + C.duskSeconds + S.t;
    const px = 236, pw = 94, py = 22, og = S.L.dayS / tot;
    roundRect(ctx, px, py, pw * og, 6, 3); ctx.fillStyle = 'rgba(255,209,102,.9)'; ctx.fill();
    roundRect(ctx, px + pw * og, py, pw * (1 - og), 6, 3); ctx.fillStyle = 'rgba(160,140,255,.9)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px + pw * clamp(done / tot, 0, 1), py + 3, 5.5, 0, 7); ctx.fill();
    const nW = S.L.waves.length, left = nW - S.waveIdx;
    ctx.font = font(700, 13); ctx.fillStyle = '#c8d6ff'; ctx.textAlign = 'left';
    ctx.fillText(S.phase === 'day' ? (left ? `storms left: ${left}` : 'no more storms') : 'keep windows lit', px, 45);
  }
  // centre: combo (day) or night timer
  if (S.phase === 'night' || S.tutNight) drawNightGauge(S);
  else if (!S.tut || S.tut.step >= 3) drawCombo(S);
  // right: coins, battery, buy battery, pause
  panel(C.W - 400, 8, 390, 46);
  drawCoin(G.HUD_COIN.x, G.HUD_COIN.y, 11, S.ui.coinPulse);
  ctx.fillStyle = '#fff'; ctx.font = font(900, 20 + S.ui.coinPulse * 3); ctx.textAlign = 'left'; ctx.fillText(Math.floor(S.ui.coinShown + 0.001), C.W - 366, 38, 52);
  const bx = C.W - 314, by = 18, bw = 136, bh = 26, f = clamp(S.battery / S.cap, 0, 1), bp = S.ui.batPulse;
  if (bp > 0) { ctx.save(); ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 20 * bp; roundRect(ctx, bx, by, bw, bh, 8); ctx.fillStyle = '#222842'; ctx.fill(); ctx.restore(); }
  roundRect(ctx, bx, by, bw, bh, 8); ctx.fillStyle = '#1a1f3a'; ctx.fill(); ctx.strokeStyle = bp > 0 ? lerpColor('#ffffff', '#ffe066', bp) : 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.stroke();
  roundRect(ctx, bx + bw + 1, by + 8, 4, 10, 2); ctx.fillStyle = '#fff'; ctx.fill();
  if (f > 0.005) {
    const fc = f < 0.2 ? ['#ff8a8a', '#e14b4b'] : f < 0.5 ? ['#ffe08a', '#f2b632'] : ['#a7f3b5', '#4cc56a'];
    const fg = ctx.createLinearGradient(0, by, 0, by + bh); fg.addColorStop(0, fc[0]); fg.addColorStop(1, fc[1]);
    roundRect(ctx, bx + 3, by + 3, (bw - 6) * f, bh - 6, 5); ctx.fillStyle = fg; ctx.fill();
    if (S.prodOn) { ctx.save(); roundRect(ctx, bx + 3, by + 3, (bw - 6) * f, bh - 6, 5); ctx.clip(); const sx = bx + ((T * 90) % (bw + 40)) - 20; ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(sx, by, 10, bh); ctx.restore(); }
  }
  ctx.font = font(800, 12); ctx.textAlign = 'center'; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(10,14,40,.85)';
  const bt = `${S.battery.toFixed(1)} / ${S.cap} kWh${f >= 0.995 ? ' FULL' : ''}`; ctx.strokeText(bt, bx + bw / 2, by + 17); ctx.fillStyle = '#fff'; ctx.fillText(bt, bx + bw / 2, by + 17);
  const cost = Math.round(S.capCost), canBuy = S.phase === 'day' && !S.tut;
  // "bigger battery" = more capacity, not more charge: say so on the button itself
  const okBuy = canBuy && S.coins >= cost;
  button(BTN.bat, '', canBuy, '#80ed99');
  const r = BTN.bat; ctx.textAlign = 'center'; ctx.fillStyle = canBuy ? '#1d2240' : '#2c3150';
  ctx.font = font(900, 12); ctx.fillText(canBuy ? 'BIGGER BATTERY' : 'BATTERY', r.x + r.w / 2, r.y + 17, r.w - 10);
  ctx.font = font(800, 13);
  if (canBuy) { ctx.fillStyle = okBuy ? '#1d6b33' : '#a33'; ctx.fillText(`+${C.economy.batteryUpgrade} kWh · ${cost}`, r.x + r.w / 2 - 7, r.y + 34); drawCoin(r.x + r.w / 2 + ctx.measureText(`+${C.economy.batteryUpgrade} kWh · ${cost}`).width / 2 + 2, r.y + 30, 6); }
  else { ctx.fillText(S.phase === 'day' ? 'training' : 'grid off', r.x + r.w / 2, r.y + 34); }
  button(BTN.pause, 'II', true, '#cdb4db');
  // banner
  drawBanner();
}
function drawCombo(S) {
  const c = S.combo, x = 452, on = c.n > 0, col = C.combo.colors[c.mult - 1], pop = 1 + c.pop * 0.35 + (c.bump || 0) * 0.08;
  panel(x - 92, 8, 184, 46, 14, on ? 0.7 : 0.4);
  ctx.save(); ctx.translate(x - 52, 33); ctx.scale(pop, pop);
  ctx.font = font(900, 28); ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,14,40,.9)'; ctx.strokeText(`x${c.mult}`, 0, 9); ctx.fillStyle = on ? col : 'rgba(255,255,255,.4)'; ctx.fillText(`x${c.mult}`, 0, 9);
  ctx.restore();
  ctx.textAlign = 'left'; ctx.font = font(800, 13); ctx.fillStyle = on ? '#fff' : 'rgba(255,255,255,.5)';
  ctx.fillText(on ? `${c.n} combo` : 'chain sparks,', x - 16, 27); ctx.font = font(700, 12);
  if (on) { roundRect(ctx, x - 16, 36, 92, 6, 3); ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fill(); roundRect(ctx, x - 16, 36, 92 * clamp(c.t / (c.tmax || 1), 0, 1), 6, 3); ctx.fillStyle = col; ctx.fill(); }
  else { ctx.fillText('stomps & cleans', x - 16, 43); }
  if (c.mult >= 3 && on) { ctx.globalAlpha = 0.25 + 0.2 * Math.sin(G.t * 10); ctx.strokeStyle = col; ctx.lineWidth = 3; roundRect(ctx, x - 92, 8, 184, 46, 14); ctx.stroke(); ctx.globalAlpha = 1; }
}
function drawNightGauge(S) {
  const x = 452, left = Math.max(0, S.L.nightS - S.t), lit = S.windows.filter(w => !w.dark).length, share = S.nightTot ? S.nightLit / S.nightTot : 1;
  const urgent = left < 6 && !S.tutNight;
  panel(x - 100, 8, 200, 46, 14, 0.75);
  ctx.textAlign = 'center'; ctx.font = font(900, 18); ctx.fillStyle = urgent ? (Math.sin(G.t * 12) > 0 ? '#ffd166' : '#fff') : '#fff';
  ctx.fillText(S.tutNight ? 'Night (practice)' : `22:00 in ${Math.ceil(left)}s`, x, 29);
  ctx.font = font(700, 12); ctx.fillStyle = '#c8d6ff'; ctx.fillText(`${lit}/${S.windows.length} windows lit · ${Math.round(share * 100)}%`, x, 45);
}
export function drawBanner() {
  const b = G.banner; if (!b) return;
  ctx.globalAlpha = clamp(b.t / 0.4, 0, 1);
  ctx.font = font(800, 17); const lines = wrapLines(b.text, 600), tw = Math.min(C.W - 40, Math.max(...lines.map(l => ctx.measureText(l).width)) + 48), bh = 18 + lines.length * 22;
  const y = 112 + b.y;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
  roundRect(ctx, C.W / 2 - tw / 2, y, tw, bh, Math.min(20, bh / 2)); ctx.fillStyle = 'rgba(14,18,48,.92)'; ctx.fill(); ctx.restore();
  roundRect(ctx, C.W / 2 - tw / 2, y, tw, bh, Math.min(20, bh / 2)); ctx.strokeStyle = b.color; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = b.color; ctx.textAlign = 'center'; lines.forEach((l, i) => ctx.fillText(l, C.W / 2, y + 30 + i * 22)); ctx.globalAlpha = 1;
}
export function drawSlotTooltip(S) {
  if (S.phase !== 'day' || input.touch) return;
  for (const sp of S.slots) {
    if (sp.placed || Math.hypot(input.x - sp.x, input.y - (sp.y - 10)) >= 24) continue;
    const cost = Math.round(S.panelCost), ok = S.coins >= cost;
    roundRect(ctx, sp.x - 34, sp.y - 50, 68, 24, 12); ctx.fillStyle = 'rgba(14,18,48,.88)'; ctx.fill();
    drawCoin(sp.x - 18, sp.y - 38, 7); ctx.fillStyle = ok ? '#fff' : '#ff8f8f'; ctx.font = font(800, 13); ctx.textAlign = 'center'; ctx.fillText(cost, sp.x + 8, sp.y - 33.5);
    return;
  }
}
export function drawTouch() {
  if (!touchOn()) return;
  const held = { left: ctl.left, right: ctl.right, jump: ctl.jumpHeld, action: ctl.actionHeld };
  for (const [k, z] of Object.entries(TOUCH)) {
    ctx.globalAlpha = held[k] ? 0.85 : 0.45;
    ctx.fillStyle = held[k] ? 'rgba(255,209,102,.5)' : 'rgba(14,18,48,.55)'; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (k === 'left' || k === 'right') { const s = k === 'left' ? -1 : 1; ctx.beginPath(); ctx.moveTo(z.x - 8 * s, z.y - 14); ctx.lineTo(z.x + 8 * s, z.y); ctx.lineTo(z.x - 8 * s, z.y + 14); ctx.stroke(); }
    else if (k === 'jump') { ctx.beginPath(); ctx.moveTo(z.x - 14, z.y + 6); ctx.lineTo(z.x, z.y - 10); ctx.lineTo(z.x + 14, z.y + 6); ctx.stroke(); ctx.font = font(800, 12); ctx.textAlign = 'center'; ctx.fillText('JUMP', z.x, z.y + 24); }
    else { ctx.globalAlpha = 1; icon('bolt', z.x, z.y - 2, 0.9); ctx.globalAlpha = 0.9; ctx.font = font(800, 12); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(G.S && G.S.phase === 'night' ? 'POWER' : 'BUILD', z.x, z.y + 28); }
  }
  ctx.globalAlpha = 1; ctx.lineCap = 'butt';
}
// ---------- tutorial overlay ----------
export function pointAt(x, y, label) {
  const T = G.t, bounce = Math.sin(T * 6) * 5;
  ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(T * 6)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 24 + Math.sin(T * 6) * 3, 0, 7); ctx.stroke();
  ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(x, y - 30 + bounce); ctx.lineTo(x - 11, y - 48 + bounce); ctx.lineTo(x + 11, y - 48 + bounce); ctx.fill();
  if (label) { ctx.font = font(800, 13); const tw = ctx.measureText(label).width + 18, lx = clamp(x - tw / 2, 8, C.W - tw - 8); roundRect(ctx, lx, y - 76 + bounce, tw, 24, 12); ctx.fillStyle = '#ffd166'; ctx.fill(); ctx.fillStyle = '#1d2240'; ctx.textAlign = 'center'; ctx.fillText(label, lx + tw / 2, y - 59 + bounce); }
}
export function drawTutorial(S) {
  const tut = S.tut; if (!tut) return;
  const steps = C.tutorial, i = Math.min(tut.step, steps.length - 1), st = steps[i];
  const text = tut.step >= steps.length ? "You're ready! Monday starts now…" : (touchOn() ? st.touch : st.text);
  ctx.font = font(800, 17); const tw = Math.min(600, ctx.measureText(text).width + 70);
  panel(C.W / 2 - tw / 2, 64, tw, 44, 18, 0.9);
  ctx.fillStyle = '#ffd166'; ctx.textAlign = 'center'; ctx.fillText(text, C.W / 2 + 14, 92, tw - 60);
  roundRect(ctx, C.W / 2 - tw / 2 + 8, 72, 32, 28, 10); ctx.fillStyle = '#ffd166'; ctx.fill(); ctx.fillStyle = '#1d2240'; ctx.font = font(900, 13);
  ctx.fillText(`${Math.min(tut.step + 1, steps.length)}/${steps.length}`, C.W / 2 - tw / 2 + 24, 91);
  button(BTN.skip, 'Skip tutorial ›', true, '#cdb4db');
  // pointers
  const h = S.hero;
  if (st.key === 'move' && tut.step === 0) pointAt(h.x, h.y - 40, null);
  if (st.key === 'jump' && tut.step === 1) { const hs = S.houses[0]; pointAt(hs.x + hs.w / 2, hs.roofY - 10, 'roof'); }
  if (tut.step === 2) { const sp = S.slots.find(q => !q.placed && (!h.plat || q.house === h.plat.i)) || S.slots.find(q => !q.placed); if (sp) pointAt(sp.x, sp.y - 10, null); }
  if (tut.step === 3 && S.sparks[0]) { const q = sparkPos(S.sparks[0]); pointAt(q.x, q.y, null); }
  if (tut.step === 4) { const d = S.drones.find(q => q.state !== 'dead'); if (d) pointAt(d.x, d.y - 30, 'jump on it!'); }
  if (tut.step === 5 && tut.win) pointAt(tut.win.x + 15, tut.win.y + 13, 'tap / drag here');
  if (tut.step === 6 && tut.surge) { const hs = S.houses[2]; pointAt(hs.x + hs.w / 2, GROUND - 48, null); }
}
// ---------- title ----------
let titleS = null;
function titleWorld() {
  if (!titleS) {
    titleS = { phase: 'title', cloud: 0.1, clouds: Array.from({ length: 9 }, () => ({ x: Math.random() * C.W, y: 70 + Math.random() * 110, s: 0.6 + Math.random() * 0.9, v: 10 })), rain: [], prodOn: true, ui: { batPulse: 0 } };
  }
  return titleS;
}
export function drawTitle(titleHouses) {
  const S = titleWorld(), hour = 7 + ((G.t * 0.55) % 15.5), nk = nightAmount(hour);
  S.clouds.forEach(c => { c.x += 0.15; if (c.x > C.W + 120) c.x = -120; });
  drawWorld(hour, S);
  titleHouses.forEach(hs => drawHouse(hs, null, nk));
  const vg = ctx.createRadialGradient(C.W / 2, C.H / 2, 100, C.W / 2, C.H / 2, 620); vg.addColorStop(0, 'rgba(10,14,40,.5)'); vg.addColorStop(1, 'rgba(10,14,40,.85)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, C.W, C.H);
  sprite('solFront', 104, 520 + Math.sin(G.t * 3) * 4, 180); sprite('storm', C.W - 110, 170 + Math.sin(G.t * 2) * 8, 110);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb703'; ctx.font = font(800, 15); ctx.fillText(C.subtitle.toUpperCase().split('').join(' '), C.W / 2, 62);
  const ts = 64 + Math.sin(G.t * 2) * 2; ctx.font = font(900, ts); ctx.lineJoin = 'round';
  ctx.lineWidth = 10; ctx.strokeStyle = '#7a3e00'; ctx.strokeText(C.title, C.W / 2, 124);
  const tg = ctx.createLinearGradient(0, 74, 0, 126); tg.addColorStop(0, '#fff1a8'); tg.addColorStop(1, '#ffb703'); ctx.fillStyle = tg; ctx.fillText(C.title, C.W / 2, 124);
  ctx.fillStyle = '#fff'; ctx.font = font(700, 18); ctx.fillText(C.tagline, C.W / 2, 162);
  if (G.themeName) { ctx.fillStyle = '#8ecae6'; ctx.font = font(800, 14); ctx.fillText(G.themeName, C.W / 2, 182); }
  const sv = G.save, cont = sv.tut ? Math.min(4, sv.unlocked - 1) : -1;
  button(BTN.play, cont < 0 ? '▶  PLAY' : `▶  PLAY ${C.levels[cont].day}`, true, '#ffd166', true);
  for (let i = 0; i < 5; i++) {
    const r = levelCard(i), L = C.levels[i], open = i < sv.unlocked, hover = inRect({ x: input.x, y: input.y }, r) && open && !input.touch;
    roundRect(ctx, r.x, r.y - (hover ? 2 : 0), r.w, r.h, 14); ctx.fillStyle = open ? (hover ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.12)') : 'rgba(0,0,0,.35)'; ctx.fill();
    ctx.strokeStyle = open ? (sv.stars[i] === 3 ? '#ffd166' : 'rgba(255,255,255,.35)') : 'rgba(255,255,255,.1)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = open ? '#fff' : '#777c99'; ctx.font = font(900, 18); ctx.fillText(L.day, r.x + r.w / 2, r.y + 26);
    ctx.font = font(600, 12); ctx.fillText(L.name, r.x + r.w / 2, r.y + 44, r.w - 10);
    if (open) for (let s = 0; s < 3; s++) starShape(r.x + r.w / 2 - 26 + s * 26, r.y + 70, 10, s < sv.stars[i]);
    else { ctx.fillStyle = '#777c99'; roundRect(ctx, r.x + r.w / 2 - 9, r.y + 64, 18, 14, 3); ctx.fill(); ctx.strokeStyle = '#777c99'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + 64, 6, Math.PI, 0); ctx.stroke(); }
  }
  button(BTN.how, 'How to play', true, '#8ecae6'); button(BTN.sound, sfx.muted ? 'Sound: off' : 'Sound: on', true, '#cdb4db');
  const total = sv.stars.reduce((a, b) => a + b, 0);
  ctx.fillStyle = '#ffd166'; ctx.font = font(800, 14); ctx.textAlign = 'center'; ctx.fillText(`★ ${total} / 15${sv.ups.length ? ` · upgrades: ${sv.ups.map(id => C.upgrades.find(u => u.id === id)?.name).join(', ')}` : ''}`, C.W / 2, 462, C.W - 260);
  ctx.fillStyle = '#c9cde3'; ctx.font = font(600, 12); ctx.fillText('Arrows / A D run · Up / W / Space jump · E / Down build & power · phones: on-screen buttons · M sound', C.W / 2, 494);
  ctx.fillStyle = '#8a90b0'; ctx.font = font(600, 12); ctx.fillText(`Real sun over ${C.placeName} today: up ${fmtHour(SUN.sunrise)}, down ${fmtHour(SUN.sunset)} (solar). Art: Solarchik CLOCK IN (MIT). Sound & music synthesized in code.`, C.W / 2 + 70, 520, C.W - 280);
}
// ---------- result ----------
export function drawResult(S, R) {
  ctx.fillStyle = `rgba(8,11,32,${0.72 * clamp(R.t / 0.4, 0, 1)})`; ctx.fillRect(0, 0, C.W, C.H);
  const k = Math.max(0.001, R.card), cx = C.W / 2, cw = 600, ch = 412, cy = 46;
  ctx.save(); ctx.translate(cx, cy + ch / 2); ctx.scale(k, k); ctx.translate(-cx, -(cy + ch / 2));
  panel(cx - cw / 2, cy, cw, ch, 24, 0.95);
  const hg = ctx.createLinearGradient(0, cy, 0, cy + 90); hg.addColorStop(0, S.stars === 3 ? 'rgba(255,209,102,.35)' : S.stars ? 'rgba(142,202,230,.3)' : 'rgba(255,107,107,.3)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
  roundRect(ctx, cx - cw / 2, cy, cw, 90, 24); ctx.fillStyle = hg; ctx.fill();
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = font(900, 32);
  ctx.fillText(S.stars === 3 ? 'Perfect night!' : S.stars ? `${S.L.day}: the street made it!` : 'Lights out on Sunny Block', cx, cy + 48);
  ctx.font = font(600, 13); ctx.fillStyle = '#b8bdd6'; ctx.fillText(`${S.L.day} · ${S.L.name}`, cx, cy + 72);
  for (let i = 0; i < 3; i++) { const s = R.stars[i] || 0; if (s > 0) starShape(cx - 70 + i * 70, cy + 122, 28, i < S.stars, (1 - s) * 0.8, s * (i < S.stars ? 1 : 0.85)); }
  ctx.fillStyle = '#fff'; ctx.font = font(900, 28); ctx.fillText(`${Math.round((R.litShown || 0) * 100)}% of the night lit`, cx, cy + 192);
  ctx.font = font(700, 12); ctx.fillStyle = '#aab0cc'; ctx.fillText(`stars at ${C.stars.map(s => Math.round(s * 100) + '%').join(' · ')}   ·   score ${S.score}${S.score > S.prevBest && S.prevBest > 0 ? ' NEW BEST!' : S.prevBest ? ` (best ${S.prevBest})` : ''}`, cx, cy + 212);
  const stats = [[`${S.stats.sparks}`, 'sparks'], [`${S.stats.maxCombo}`, 'best combo'], [`${S.stats.drones}`, 'drones beaten'], [`${S.stats.resets || 0}/${S.stats.surges || 0}`, 'surges reset']];
  stats.forEach(([v, l], i) => {
    const w = 132, x = cx - 276 + i * 140, y = cy + 228;
    roundRect(ctx, x, y, w, 46, 10); ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = font(800, 18); ctx.textAlign = 'center'; ctx.fillText(v, x + w / 2, y + 21);
    ctx.fillStyle = '#aab0cc'; ctx.font = font(600, 12); ctx.fillText(l, x + w / 2, y + 38);
  });
  ctx.font = font(700, 13); ctx.fillStyle = '#ffd166';
  ctx.fillText(resultTip(S), cx, cy + 306, cw - 40);
  ctx.restore();
  if (R.card > 0.95) {
    const passed = S.stars > 0;
    if (passed) button(BTN.next, S.lv >= 4 ? 'Finish week ★' : 'Next day ▶', true, '#ffd166', false);
    button(passed ? BTN.retry : BTN.next, passed ? 'Retry ↻' : 'Try again ↻', true, '#8ecae6');
    button(BTN.menu, 'Menu', true, '#cdb4db');
    button(BTN.share, R.copied ? 'Copied ✓' : 'Copy result', true, '#80ed99');
    ctx.fillStyle = '#c9cde3'; ctx.font = font(600, 13); ctx.textAlign = 'center'; ctx.fillText('Enter = continue · R = retry · C = copy result · Esc = menu', cx, cy + ch + 24);
  }
}
function resultTip(S) {
  if (S.stars === 3) return 'Every window stayed warm. Solarchik is proud of you!';
  if (S.battery < 0.5 && S.stats.darks > 0) return 'Battery ran dry: build more panels early and buy +kWh before sunset.';
  if (S.stats.fills < 4) return 'At night, tap or drag over the fading windows to power them.';
  if ((S.stats.surges || 0) > (S.stats.resets || 0) + 1) return 'SURGE windows die fast: run Solarchik to that house and press E / ⚡.';
  if (S.stats.darks > 2) return 'Top up windows when they blink red. Solarchik (hold E) powers a house without line loss.';
  return 'Chain sparks and stomps fast for a bigger combo. Unspent coins add to your score.';
}
// ---------- upgrade pick ----------
export function drawUpgrade(choices) {
  ctx.fillStyle = 'rgba(8,11,32,.8)'; ctx.fillRect(0, 0, C.W, C.H);
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffd166'; ctx.font = font(900, 34); ctx.fillText('Pick an upgrade', C.W / 2, 96);
  ctx.fillStyle = '#c9cde3'; ctx.font = font(600, 15); ctx.fillText('Stronger days or safer nights? It stays with Solarchik all week', C.W / 2, 124);
  choices.forEach((u, i) => {
    const r = upCard(i), hover = inRect({ x: input.x, y: input.y }, r) && !input.touch, y = r.y - (hover ? 4 : 0);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 16; roundRect(ctx, r.x, y, r.w, r.h, 20); ctx.fillStyle = hover ? '#fffaf0' : '#f3e6c4'; ctx.fill(); ctx.restore();
    roundRect(ctx, r.x, y, r.w, r.h, 20); ctx.strokeStyle = hover ? '#ffb703' : '#c9a24a'; ctx.lineWidth = hover ? 4 : 2.5; ctx.stroke();
    ctx.fillStyle = '#1d2240'; ctx.beginPath(); ctx.arc(r.x + r.w / 2, y + 66, 40, 0, 7); ctx.fill();
    icon(u.icon, r.x + r.w / 2, y + 66, 1.5);
    const tag = u.night ? 'NIGHT' : 'DAY'; ctx.font = font(900, 11); const tw = ctx.measureText(tag).width + 16;
    roundRect(ctx, r.x + 12, y + 12, tw, 18, 9); ctx.fillStyle = u.night ? '#2b2f6b' : '#ffb703'; ctx.fill(); ctx.fillStyle = u.night ? '#c8d6ff' : '#1d2240'; ctx.textAlign = 'center'; ctx.fillText(tag, r.x + 12 + tw / 2, y + 25);
    ctx.fillStyle = '#1d2240'; ctx.font = font(900, 20); ctx.textAlign = 'center'; ctx.fillText(u.name, r.x + r.w / 2, y + 138);
    ctx.font = font(600, 14); ctx.fillStyle = '#4a4f66'; wrapLines(u.desc, r.w - 30).forEach((l, j) => ctx.fillText(l, r.x + r.w / 2, y + 164 + j * 18));
    ctx.font = font(800, 12); ctx.fillStyle = '#9c6b00'; ctx.fillText(`press ${i + 1} or tap`, r.x + r.w / 2, y + r.h - 14);
  });
}
// ---------- final ----------
export function drawFinal() {
  ctx.fillStyle = 'rgba(8,11,32,.82)'; ctx.fillRect(0, 0, C.W, C.H);
  const total = G.save.stars.reduce((a, b) => a + b, 0);
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffd166'; ctx.font = font(900, 44); ctx.fillText('Week complete!', C.W / 2, 110);
  ctx.fillStyle = '#fff'; ctx.font = font(700, 18); ctx.fillText('Sunny Block stayed lit all week, powered only by the sun.', C.W / 2, 146);
  for (let i = 0; i < 5; i++) { ctx.font = font(900, 15); ctx.fillStyle = '#c9cde3'; ctx.fillText(C.levels[i].day, C.W / 2 - 280 + i * 140, 210); for (let s = 0; s < 3; s++) starShape(C.W / 2 - 306 + i * 140 + s * 26, 240, 11, s < G.save.stars[i]); }
  ctx.fillStyle = '#ffd166'; ctx.font = font(900, 30); ctx.fillText(`★ ${total} / 15`, C.W / 2, 310);
  ctx.fillStyle = '#c9cde3'; ctx.font = font(600, 14); ctx.fillText(total < 15 ? 'Replay any day from the menu to collect every star.' : 'All 15 stars. Legendary!', C.W / 2, 344);
  sprite('solJump', C.W / 2 + 330, 470 + Math.sin(G.t * 5) * 10, 140);
  button(BTN.fmenu, 'Menu', true, '#cdb4db'); button(BTN.freplay, 'Replay Friday', true, '#ffd166');
}
// ---------- pause ----------
export function drawPause(S) {
  ctx.fillStyle = 'rgba(8,11,32,.72)'; ctx.fillRect(0, 0, C.W, C.H);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = font(900, 38); ctx.fillText('Paused', C.W / 2, 160);
  button(BTN.resume, 'Resume ▶', true, '#ffd166'); button(BTN.restart, S.tut ? 'Skip tutorial' : 'Restart day ↻', true, '#8ecae6');
  button(BTN.pmenu, 'Menu', true, '#cdb4db'); button(BTN.psound, sfx.muted ? 'Sound: off' : 'Sound: on', true, '#cdb4db');
}
export { lerp };
