// The street: real-sun sky, weather, houses, roof platforms, panels and windows.
import { C, G, ctx, input, sprite, rnd, icon } from './core.js';
import { clamp, lerp, lerpColor, roundRect, font } from './engine.js';
import { dayOfYear, elevation, sunriseSunset } from './sun.js';

export const GROUND = C.GROUND;
export const today = new Date();
export const DOY = dayOfYear(today);
export const SUN = sunriseSunset(C.latitude, DOY);
export const SUNSET = Math.round(SUN.sunset * 4) / 4;   // grid switches off at (real) sunset
export const DAY_START = (() => { let h = SUN.sunrise; while (h < 12 && elevation(C.latitude, DOY, h) < 6) h += 0.05; return h; })();   // the day opens once the real sun is ~6 deg up, never in the dark
export const MAX_EL = elevation(C.latitude, DOY, 12);
export function sunFactor(h) { const el = elevation(C.latitude, DOY, h); return el <= 0 ? 0 : Math.sin(el * Math.PI / 180) / Math.sin(Math.max(MAX_EL, 20) * Math.PI / 180); }

export function buildHouses(n) {
  const w = 124, margin = 46, gap = (C.W - 2 * margin - n * w) / (n - 1);
  return Array.from({ length: n }, (_, i) => {
    const def = C.houses[i], x = margin + i * (w + gap), bodyH = C.roofHeights[i], top = GROUND - bodyH, roofY = top - 8;
    const hs = { ...def, i, x, w, top, bodyH, roofY, x1: x - 10, x2: x + w + 10, bob: Math.random() * 6, jump: 0, mood: 0, slots: [], wins: [] };
    hs.slots = Array.from({ length: def.slots }, (_, k) => ({ house: i, x: x + w * (k + 0.5) / def.slots, y: roofY, placed: false, cover: 0, cleanT: 0, taps: 0, scale: 0, glow: 0, sparkT: rnd(0.4, 2), shadow: 0 }));
    hs.wins = [0, 1].map(k => ({ house: i, x: x + 18 + k * (w - 66), y: top + 18, w: 30, h: 26, light: 1, dark: false, surge: 0, delay: 0, drain: 0, fillFx: 0 }));
    return hs;
  });
}

// ---------- sky ----------
function skyColors(h) {
  const el = elevation(C.latitude, DOY, h);
  const night = ['#070b1f', '#121a42', '#24305e'], dusk = ['#29265f', '#8a4f8c', '#ff9a5a'], day = ['#2f7fe0', '#6cb6ff', '#d4f0ff'];
  const mix = (a, b, t) => a.map((c, i) => lerpColor(c, b[i], t));
  if (el < -8) return night;
  if (el < 0) return mix(night, dusk, (el + 8) / 8);
  if (el < 8) return mix(dusk, day, Math.sqrt(el / 8));
  return day;
}
function sunPos(h) {
  const el = elevation(C.latitude, DOY, h);
  return { el, x: ((h - SUN.sunrise + 1) / (SUN.sunset - SUN.sunrise + 2)) * C.W, y: GROUND - 40 - (el / Math.max(MAX_EL, 20)) * 300 };
}
function drawSky(h, cover, S) {
  const [top, mid, bot] = skyColors(h), { el, x: sx, y: sy } = sunPos(h), T = G.t;
  const grey = cover * 0.55;
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, lerpColor(top, '#5a6378', grey * (el > 0 ? 1 : 0.3))); g.addColorStop(0.55, lerpColor(mid, '#7d8699', grey * (el > 0 ? 1 : 0.3))); g.addColorStop(1, lerpColor(bot, '#a3abbd', grey * (el > 0 ? 1 : 0.3)));
  ctx.fillStyle = g; ctx.fillRect(0, 0, C.W, GROUND);
  const warm = clamp(1 - Math.abs(el - 1) / 10, 0, 1);
  if (warm > 0) { const hg = ctx.createRadialGradient(clamp(sx, 0, C.W), GROUND, 10, clamp(sx, 0, C.W), GROUND, 520); hg.addColorStop(0, `rgba(255,150,80,${0.55 * warm})`); hg.addColorStop(1, 'rgba(255,120,80,0)'); ctx.fillStyle = hg; ctx.fillRect(0, 0, C.W, GROUND); }
  if (el < 4) {
    const a = clamp((4 - el) / 10, 0, 1);
    for (let i = 0; i < 70; i++) { const x = (i * 157.3) % C.W, y = (i * 91.7) % 260, tw = 0.4 + 0.6 * Math.abs(Math.sin(T * 1.3 + i * 1.7)); ctx.globalAlpha = a * tw; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, i % 7 === 0 ? 1.6 : 1, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  { const dT = clamp((el + 6) / 12, 0, 1); drawSkyline(dT, S, 1 - dT); }   // the distant city sits behind the sun, which stays the hero of the sky
  if (el > -4) {
    const R = 26 + Math.sin(T * 3) * 1.2;
    ctx.globalAlpha = 1 - cover * 0.5;
    const glow = ctx.createRadialGradient(sx, sy, R * 0.6, sx, sy, 150); glow.addColorStop(0, 'rgba(255,236,150,.85)'); glow.addColorStop(0.35, 'rgba(255,210,100,.28)'); glow.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx, sy, 150, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(T * 0.25); ctx.fillStyle = 'rgba(255,230,140,.35)';
    for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(R + 4, -4); ctx.lineTo(R + 20 + (i % 2) * 10, 0); ctx.lineTo(R + 4, 4); ctx.fill(); }
    ctx.restore();
    const sg = ctx.createRadialGradient(sx - 8, sy - 8, 4, sx, sy, R); sg.addColorStop(0, el > 6 ? '#fff4b0' : '#ffd08a'); sg.addColorStop(1, el > 6 ? '#ffc93c' : '#ff8a3d');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, R, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,120,120,.35)'; ctx.beginPath(); ctx.arc(sx - 14, sy + 4, 4.5, 0, 7); ctx.arc(sx + 14, sy + 4, 4.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a4b00'; ctx.beginPath(); ctx.arc(sx - 8, sy - 4, 3, 0, 7); ctx.arc(sx + 8, sy - 4, 3, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7a4b00'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(sx, sy + 3, 9, 0.25, Math.PI - 0.25); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  } else {
    const mg = ctx.createRadialGradient(C.W - 140, 90, 10, C.W - 140, 90, 80); mg.addColorStop(0, 'rgba(220,230,255,.35)'); mg.addColorStop(1, 'rgba(220,230,255,0)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(C.W - 140, 90, 80, 0, 7); ctx.fill();
    ctx.fillStyle = '#f1f3ff'; ctx.beginPath(); ctx.arc(C.W - 140, 90, 20, 0, 7); ctx.fill(); ctx.fillStyle = top; ctx.beginPath(); ctx.arc(C.W - 130, 84, 18, 0, 7); ctx.fill();
  }
}
export function makeClouds() { return Array.from({ length: 9 }, () => ({ x: Math.random() * C.W, y: 70 + Math.random() * 110, s: 0.6 + Math.random() * 0.9, v: 8 + Math.random() * 14 })); }
export function updateWeather(S, dt) {
  S.clouds.forEach(c => { c.x += c.v * dt * (1 + S.cloud); if (c.x > C.W + 120) c.x = -120; });
  if (S.cloud > 0.6 && S.phase === 'day') { S.rainAcc = (S.rainAcc || 0) + dt * 160 * (S.cloud - 0.5); while (S.rainAcc >= 1) { S.rainAcc--; S.rain.push({ x: Math.random() * (C.W + 60), y: -10, v: 420 + Math.random() * 120 }); } }
  for (let i = S.rain.length - 1; i >= 0; i--) { const r = S.rain[i]; r.y += r.v * dt; r.x -= r.v * 0.25 * dt; if (r.y > GROUND) S.rain.splice(i, 1); }
}
function drawClouds(S, night) {
  const cover = S.cloud, N = S.clouds.length, shown = cover * N + 1;
  for (let i = 0; i < N; i++) {
    const a = clamp(shown - i, 0, 1); if (a <= 0) continue;
    const c = S.clouds[i], s = c.s, g = Math.round((night ? 150 : 255) - cover * (night ? 70 : 110));
    ctx.globalAlpha = a * (0.8 + cover * 0.18);
    const blob = dy => { ctx.beginPath(); ctx.arc(c.x, c.y + dy, 26 * s, 0, 7); ctx.arc(c.x + 28 * s, c.y - 12 * s + dy, 32 * s, 0, 7); ctx.arc(c.x + 60 * s, c.y + dy, 24 * s, 0, 7); ctx.rect(c.x, c.y + dy - 4 * s, 60 * s, 26 * s); ctx.fill(); };
    ctx.fillStyle = `rgb(${g - 40},${g - 34},${g - 20})`; blob(6 * s);
    ctx.fillStyle = `rgb(${g},${g},${Math.min(255, g + 8)})`; blob(0);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(190,210,255,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); S.rain.forEach(r => { ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - 3, r.y + 11); }); ctx.stroke();
}
export const nightAmount = h => clamp((2 - elevation(C.latitude, DOY, h)) / 8, 0, 1);
// ---------- distant skyline (2 parallax layers + wind turbines), generated once ----------
const SKY_LAYERS = (() => {
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return [{ k: 0.025, base: 52, col: ['#1a2350', '#c4dcef'], lit: 0.18, b: [] }, { k: 0.06, base: 34, col: ['#141b40', '#9cc3e2'], lit: 0.28, b: [] }].map((L, li) => {
    for (let x = -60; x < C.W + 60;) { const w = 26 + r() * (li ? 44 : 34), hgt = (li ? 36 : 60) + r() * (li ? 50 : 66); L.b.push({ x, w, h: hgt, turbine: !li && r() < 0.12, win: Array.from({ length: 12 }, () => r()) }); x += w + 2 + r() * 10; }
    return L;
  });
})();
function drawSkyline(dayT, S, nightK) {
  const hx = S && S.hero ? S.hero.x - C.W / 2 : 0, T = G.t;
  for (const L of SKY_LAYERS) {
    const ox = -hx * L.k, col = lerpColor(L.col[0], L.col[1], dayT), y0 = GROUND - L.base;
    ctx.fillStyle = col;
    for (const b of L.b) {
      const x = b.x + ox;
      if (b.turbine) {   // a small wind turbine instead of a building
        ctx.fillRect(x + b.w / 2 - 1.5, y0 - b.h - 10, 3, b.h + 10); ctx.save(); ctx.translate(x + b.w / 2, y0 - b.h - 10); ctx.rotate(T * 1.2 + b.x);
        for (let k = 0; k < 3; k++) { ctx.rotate(2.094); ctx.fillRect(-1.5, 0, 3, 24); } ctx.restore(); ctx.fillStyle = col; continue;
      }
      ctx.fillRect(x, y0 - b.h, b.w, b.h + L.base);
      if (nightK > 0.2) {   // a few warm windows far away
        ctx.fillStyle = `rgba(255,214,120,${L.lit * nightK})`;
        for (let i = 0; i < b.win.length; i++) if (b.win[i] < 0.35) ctx.fillRect(x + 5 + (i % 3) * ((b.w - 12) / 2.2), y0 - b.h + 8 + ((i / 3) | 0) * 14, 4, 5);
        ctx.fillStyle = col;
      }
    }
  }
}
export function drawWorld(h, S) {
  const el = elevation(C.latitude, DOY, h);
  drawSky(h, S ? S.cloud : 0, S); if (S) drawClouds(S, el < -2);
  const dayT = clamp((el + 6) / 12, 0, 1);
  ctx.fillStyle = lerpColor('#1a2440', '#9bd18a', dayT); ctx.beginPath(); ctx.moveTo(0, GROUND); for (let x = 0; x <= C.W; x += 30) ctx.lineTo(x, GROUND - 70 - Math.sin(x / 170 + 1) * 22); ctx.lineTo(C.W, GROUND); ctx.fill();
  ctx.fillStyle = lerpColor('#1b2a3a', '#72bb62', dayT); ctx.beginPath(); ctx.moveTo(0, GROUND); for (let x = 0; x <= C.W; x += 30) ctx.lineTo(x, GROUND - 40 - Math.sin(x / 120) * 18); ctx.lineTo(C.W, GROUND); ctx.fill();
  const gg = ctx.createLinearGradient(0, GROUND, 0, GROUND + 50); gg.addColorStop(0, lerpColor('#24352a', '#62b357', dayT)); gg.addColorStop(1, lerpColor('#1b2820', '#4d9a45', dayT));
  ctx.fillStyle = gg; ctx.fillRect(0, GROUND, C.W, 50);
  ctx.fillStyle = lerpColor('#363a46', '#8f969d', dayT); ctx.fillRect(0, GROUND + 24, C.W, 22);
  ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(0, GROUND + 24, C.W, 3);
  ctx.strokeStyle = 'rgba(245,245,245,.85)'; ctx.lineWidth = 2; ctx.setLineDash([16, 14]); ctx.beginPath(); ctx.moveTo(0, GROUND + 35); ctx.lineTo(C.W, GROUND + 35); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = lerpColor('#1b2820', '#4d9a45', dayT); ctx.fillRect(0, GROUND + 46, C.W, C.H - GROUND - 46);
  return el < -2;
}

// ---------- houses ----------
export function drawHouse(hs, S, nightK) {
  const { x, w, top, bodyH, roofY } = hs, T = G.t;
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(x + w / 2 + 6, GROUND + 2, w * 0.6, 6, 0, 0, 7); ctx.fill();
  const bg = ctx.createLinearGradient(x, 0, x + w, 0); bg.addColorStop(0, hs.color); bg.addColorStop(1, lerpColor(hs.color, '#000000', 0.14));
  ctx.fillStyle = bg; ctx.fillRect(x, top, w, bodyH);
  ctx.fillStyle = 'rgba(0,0,0,.06)'; for (let yy = top + 12; yy < GROUND; yy += 14) ctx.fillRect(x, yy, w, 1.5);   // siding
  if (nightK > 0) { ctx.fillStyle = `rgba(10,14,50,${0.42 * nightK})`; ctx.fillRect(x, top, w, bodyH); }
  // flat roof slab (a platform Solarchik can stand on)
  ctx.fillStyle = hs.roof; roundRect(ctx, hs.x1, roofY, hs.x2 - hs.x1, 12, 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(hs.x1 + 2, roofY, hs.x2 - hs.x1 - 4, 2.5);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, roofY + 12, w, 4);
  if (hs.slots.length === 2) { const cx = x + w / 2 - 8; ctx.fillStyle = lerpColor(hs.roof, '#000000', 0.2); ctx.fillRect(cx, roofY - 24, 16, 24); ctx.fillStyle = hs.roof; ctx.fillRect(cx - 3, roofY - 28, 22, 6); }
  // windows
  for (const wd of hs.wins) drawWindow(wd, S, nightK);
  // door
  ctx.fillStyle = '#5b3a29'; roundRect(ctx, x + w / 2 - 13, GROUND - 42, 26, 42, 5); ctx.fill(); ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(x + w / 2 + 7, GROUND - 21, 2, 0, 7); ctx.fill();
  if (nightK > 0.3) { const lit = hs.wins.some(wd => !wd.dark); ctx.fillStyle = lit ? 'rgba(255,209,102,.9)' : 'rgba(60,60,80,.9)'; ctx.beginPath(); ctx.arc(x + w / 2, GROUND - 48, 3.5, 0, 7); ctx.fill(); }
  // neighbour robot
  const bob = Math.sin(T * 3 + hs.bob) * 1.5 - Math.sin(clamp(hs.jump, 0, 1) * Math.PI) * 16;
  if (!hs.you) sprite(hs.robot, x + w / 2 + 38, GROUND + 4 + bob, 52, hs.i % 2 === 0, hs.mood < 0 ? 0.75 : 1);
  if (hs.mood < 0 && !hs.you) { ctx.fillStyle = '#ff6b6b'; ctx.font = font(900, 16); ctx.textAlign = 'center'; ctx.fillText('!', x + w / 2 + 38, GROUND - 52 + Math.sin(T * 8) * 2); }
  // name tag
  ctx.font = font(700, 12); const nw = ctx.measureText(hs.name).width + 14;
  roundRect(ctx, x + w / 2 - nw / 2, GROUND + 6, nw, 15, 7.5); ctx.fillStyle = 'rgba(14,18,48,.55)'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(hs.name, x + w / 2, GROUND + 17);
  // panels / slots
  for (const sp of hs.slots) drawSlot(sp, S, nightK);
}
function drawWindow(wd, S, nightK) {
  const { x, y, w, h } = wd, T = G.t, night = nightK > 0.5;
  const la = night ? (wd.dark ? 0 : 0.35 + 0.65 * wd.light) : 0;
  const low = night && !wd.dark && wd.light < C.night.low, blink = low ? 0.55 + 0.45 * Math.sin(T * 18) : 1;
  if (night && la > 0.05) { const wg = ctx.createRadialGradient(x + w / 2, y + h / 2, 4, x + w / 2, y + h / 2, 44); wg.addColorStop(0, `rgba(255,209,102,${0.45 * la * blink})`); wg.addColorStop(1, 'rgba(255,209,102,0)'); ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 44, 0, 7); ctx.fill(); }
  if (night && wd.surge > 0 && !wd.dark) {
    ctx.strokeStyle = `rgba(255,90,120,${0.5 + 0.5 * Math.sin(T * 20)})`; ctx.lineWidth = 4; ctx.strokeRect(x - 5, y - 5, w + 10, h + 10);
    const by = y - 30 + Math.sin(T * 8) * 2; roundRect(ctx, x + w / 2 - 34, by - 13, 68, 20, 10); ctx.fillStyle = '#ff4d6d'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = font(900, 12); ctx.textAlign = 'center'; ctx.fillText(G.touchUsed ? 'SURGE ⚡' : 'SURGE: E', x + w / 2, by + 2);
  }
  ctx.fillStyle = night ? lerpColor('#151829', '#ffd166', la * blink) : lerpColor('#cfeaff', '#3a4a7a', nightK); ctx.fillRect(x, y, w, h);
  if (!night) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.moveTo(x + 3, y + h - 4); ctx.lineTo(x + 12, y + 3); ctx.lineTo(x + 17, y + 3); ctx.lineTo(x + 8, y + h - 4); ctx.fill(); }
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h); ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
  if (wd.fillFx > 0) { ctx.strokeStyle = `rgba(255,255,200,${wd.fillFx})`; ctx.lineWidth = 3; ctx.strokeRect(x - 3 - wd.fillFx * 4, y - 3 - wd.fillFx * 4, w + 6 + wd.fillFx * 8, h + 6 + wd.fillFx * 8); }
  if (night && S && S.phase !== 'day') {   // light meter under the window
    roundRect(ctx, x, y + h + 4, w, 5, 2.5); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fill();
    if (!wd.dark) { roundRect(ctx, x, y + h + 4, w * wd.light, 5, 2.5); ctx.fillStyle = wd.light < C.night.low ? '#ff6b6b' : wd.light < 0.6 ? '#ffd166' : '#80ed99'; ctx.fill(); }
    if (wd.dark) { ctx.fillStyle = '#ff8f8f'; ctx.font = font(900, 13); ctx.textAlign = 'center'; ctx.fillText('OFF', x + w / 2, y + h / 2 + 5); }
    else if (low) { ctx.fillStyle = '#ff4d6d'; ctx.font = font(900, 15); ctx.textAlign = 'center'; ctx.fillText('!', x + w / 2, y - 6 + Math.sin(T * 10) * 2); }
  }
}
function drawSlot(sp, S, nightK) {
  const T = G.t;
  ctx.save(); ctx.translate(sp.x, sp.y);
  if (sp.placed) {
    const s = sp.scale; ctx.scale(s, s);
    ctx.fillStyle = '#9aa3b5'; ctx.fillRect(-11, -8, 3, 8); ctx.fillRect(9, -12, 3, 12);   // legs
    ctx.rotate(-0.28);
    const pg = ctx.createLinearGradient(-16, -18, 16, -6); pg.addColorStop(0, '#2c5aa8'); pg.addColorStop(1, '#162c5c');
    ctx.fillStyle = pg; ctx.fillRect(-17, -19, 34, 12); ctx.strokeStyle = '#dfe7f1'; ctx.lineWidth = 2; ctx.strokeRect(-17, -19, 34, 12);
    ctx.strokeStyle = 'rgba(160,200,255,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, -19); ctx.lineTo(-6, -7); ctx.moveTo(6, -19); ctx.lineTo(6, -7); ctx.moveTo(-17, -13); ctx.lineTo(17, -13); ctx.stroke();
    if (S && S.prodOn && sp.cover <= 0 && nightK < 0.5) { const sh = ((T * 0.6 + sp.x / 300) % 1.6) * 44 - 22; ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.moveTo(sh - 4, -19); ctx.lineTo(sh + 4, -19); ctx.lineTo(sh, -7); ctx.lineTo(sh - 8, -7); ctx.fill(); }
    if (sp.cover > 0) {   // storm goo
      ctx.globalAlpha = sp.cover; ctx.fillStyle = '#4a4e69'; ctx.beginPath(); ctx.arc(-8, -14, 9, 0, 7); ctx.arc(4, -16, 10, 0, 7); ctx.arc(13, -12, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#6c6f93'; ctx.beginPath(); ctx.arc(-3, -18, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#4a4e69'; for (let i = 0; i < 3; i++) { const dy = (T * 12 + i * 5) % 9; ctx.fillRect(-10 + i * 9, -7 + dy, 2.5, 4); }
      if (sp.cleanT > 0) { ctx.fillStyle = 'rgba(200,240,255,.9)'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-12 + i * 8, -22 - ((T * 40 + i * 7) % 12), 2.5, 0, 7); ctx.fill(); } }
      ctx.globalAlpha = 1;
    }
    if (sp.shadow > 0 && sp.cover <= 0) { ctx.fillStyle = `rgba(20,24,60,${0.35 * sp.shadow})`; ctx.fillRect(-17, -19, 34, 12); }
    if (sp.glow > 0) { ctx.strokeStyle = `rgba(255,230,140,${sp.glow})`; ctx.lineWidth = 3; ctx.strokeRect(-20, -22, 40, 18); }
  } else if (nightK < 0.5) {
    const hover = Math.hypot(input.x - sp.x, input.y - (sp.y - 10)) < 24, pulse = 0.5 + 0.5 * Math.sin(T * 4 + sp.x * 0.05);
    ctx.fillStyle = hover ? 'rgba(255,255,255,.4)' : `rgba(255,255,255,${0.1 + pulse * 0.12})`; ctx.fillRect(-16, -16, 32, 14);
    ctx.setLineDash([4, 3]); ctx.strokeStyle = hover ? '#fff' : `rgba(255,255,255,${0.55 + pulse * 0.4})`; ctx.lineWidth = 2; ctx.strokeRect(-16, -16, 32, 14); ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.font = font(900, 13); ctx.textAlign = 'center'; ctx.fillText('+', 0, -4);
  }
  ctx.restore();
}
// the street battery next to Solarchik's house (energy at night flows out of it)
export function batteryPos(S) { const h0 = S.houses[0]; return { x: h0.x - 22, y: GROUND - 6 }; }
export function drawStreetBattery(S) {
  const p = batteryPos(S), f = clamp(S.battery / S.cap, 0, 1), T = G.t;
  ctx.save();
  if (S.ui.batPulse > 0 || S.phase === 'night') { const gl = ctx.createRadialGradient(p.x, p.y - 26, 4, p.x, p.y - 26, 46); gl.addColorStop(0, `rgba(255,230,120,${0.25 + 0.3 * S.ui.batPulse})`); gl.addColorStop(1, 'rgba(255,230,120,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p.x, p.y - 26, 46, 0, 7); ctx.fill(); }
  roundRect(ctx, p.x - 13, p.y - 54, 26, 50, 6); ctx.fillStyle = '#1a1f3a'; ctx.fill(); ctx.strokeStyle = '#e6e8f5'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = '#e6e8f5'; ctx.fillRect(p.x - 5, p.y - 59, 10, 5);
  const fh = 42 * f; if (fh > 1) { roundRect(ctx, p.x - 9, p.y - 8 - fh, 18, fh, 3); ctx.fillStyle = f < 0.2 ? '#e14b4b' : f < 0.5 ? '#f2b632' : '#4cc56a'; ctx.fill(); }
  icon('bolt', p.x, p.y - 30 + Math.sin(T * 4), 0.45);
  ctx.restore();
}
export function windowAt(S, x, y, pad = 12) {
  for (const w of S.windows) if (x >= w.x - pad && x <= w.x + w.w + pad && y >= w.y - pad && y <= w.y + w.h + pad + 6) return w;
  return null;
}
export function slotAt(S, x, y, r = 24) {
  let best = null, bd = r;
  for (const sp of S.slots) { const d = Math.hypot(x - sp.x, y - (sp.y - 10)); if (d < bd) { bd = d; best = sp; } }
  return best;
}
export { lerp };
