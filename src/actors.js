// Solarchik (player), sun sparks, combos, storm drones, flyers and bolts.
import { C, G, ctx, fx, sfx, tweens, sprite, has, rnd, font, roundRect, clamp, showBanner } from './core.js';
import { lerp, easeOutBack, easeOutCubic } from './engine.js';
import { GROUND, sunFactor } from './world.js';
import { THEME } from './theme.js';

export const api = () => ({ C, G, fx, sfx, showBanner, spawnSpark, spawnDrone, hitCombo, buildSlot });

// ---------- Solarchik ----------
export function makeHero(x) { return { x, y: GROUND, vx: 0, vy: 0, onGround: true, plat: null, coyote: 0, buf: 0, jumps: 0, facing: 1, frame: 0, stun: 0, inv: 0, sq: 0, say: null, sayT: 0, bounced: false, airT: 0 }; }
export function solSay(S, t, dur = 1.6) { S.hero.say = t; S.hero.sayT = dur; }
const heroCY = h => h.y - 30;

export function updateHero(S, dt, ctl) {
  const h = S.hero, P = C.hero;
  h.stun = Math.max(0, h.stun - dt); h.inv = Math.max(0, h.inv - dt); h.sq *= Math.pow(0.0005, dt); h.sayT -= dt; if (h.sayT <= 0) h.say = null;
  const dir = h.stun > 0 ? 0 : (ctl.right ? 1 : 0) - (ctl.left ? 1 : 0);
  if (dir) { h.vx = clamp(h.vx + dir * (h.onGround ? P.accel : P.airAccel) * dt, -P.speed, P.speed); h.facing = dir; }
  else { const f = P.friction * dt * (h.onGround ? 1 : 0.4); h.vx = Math.abs(h.vx) <= f ? 0 : h.vx - Math.sign(h.vx) * f; }
  if (ctl.jumpPress) h.buf = P.buffer; else h.buf -= dt;
  h.coyote = h.onGround ? P.coyote : h.coyote - dt;
  if (h.buf > 0 && h.stun <= 0) {
    if (h.coyote > 0) { h.vy = -P.jumpV; h.buf = 0; h.coyote = 0; h.jumps = 1; h.onGround = false; h.bounced = false; sfx.jump(); fx.burst(h.x, h.y, 'rgba(255,255,255,.7)', 6, 70, 0.3, 2, 0); }
    else if (has('djump') && h.jumps < 2) { h.vy = -P.jumpV * 0.88; h.buf = 0; h.jumps = 2; h.bounced = false; sfx.jump(); fx.burst(h.x, h.y, '#ffe8a3', 12, 120, 0.4, 2.5, 100); }
  }
  const g = P.gravity * THEME.mods.gravity * (h.vy < 0 && !ctl.jumpHeld && !h.bounced ? 2.4 : 1);
  h.vy = Math.min(h.vy + g * dt, 1150);
  const prevY = h.y, wasGround = h.onGround, landV = h.vy;
  h.x = clamp(h.x + h.vx * dt, 16, C.W - 16); h.y += h.vy * dt;
  h.onGround = false; h.plat = null;
  if (h.vy >= 0) {
    for (const hs of S.houses) if (h.x > hs.x1 && h.x < hs.x2 && prevY <= hs.roofY + 0.5 && h.y >= hs.roofY) { h.y = hs.roofY; h.plat = hs; h.onGround = true; break; }
    if (!h.onGround && h.y >= GROUND) { h.y = GROUND; h.onGround = true; }
    if (h.onGround) {
      if (!wasGround && landV > 350) { h.sq = 0.22; sfx.land(); fx.burst(h.x, h.y, 'rgba(230,230,240,.8)', 8, 90, 0.35, 2.5, 50); }
      h.vy = 0; h.jumps = 0; h.bounced = false;
    }
  }
  h.airT = h.onGround ? 0 : h.airT + dt;
  h.frame += dt * Math.abs(h.vx) / 22;
}

export function heroDayActions(S, dt, ctl) {
  const h = S.hero;
  // auto-scrub goo off the panel under Solarchik's feet
  if (h.onGround && h.plat) {
    for (const sp of h.plat.slots) {
      if (sp.placed && sp.cover > 0 && Math.abs(sp.x - h.x) < 24) {
        sp.cleanT += dt * (ctl.actionHeld ? 2 : 1);
        if (Math.random() < dt * 20) fx.burst(sp.x + rnd(-10, 10), sp.y - 14, '#cfefff', 2, 60, 0.4, 2, -40);
        if (sp.cleanT >= C.cleanTime) cleanSlot(S, sp);
      } else if (sp.cleanT > 0 && sp.cover > 0) sp.cleanT = Math.max(0, sp.cleanT - dt);
    }
  }
  if (ctl.actionPress) {
    if (h.plat) {
      let best = null, bd = 30;
      for (const sp of h.plat.slots) { const d = Math.abs(sp.x - h.x); if (!sp.placed && d < bd) { bd = d; best = sp; } }
      if (best) buildSlot(S, best, 'hero');
      else if (h.plat.slots.some(sp => !sp.placed)) solSay(S, 'Stand on the + slot');
      else if (!h.plat.slots.some(sp => sp.cover > 0)) solSay(S, 'This roof is full!');
    } else if (S.slots.some(sp => !sp.placed)) solSay(S, 'Build on a roof: jump up!');
  }
}

export function buildSlot(S, sp, via) {
  if (sp.placed) return false;
  const cost = Math.round(S.panelCost);
  if (S.coins < cost) { sfx.deny(); fx.text(sp.x, sp.y - 34, `Need ${cost} coins`, '#ff6b6b', 15); fx.shake(2); return false; }
  S.coins -= cost; S.panelCost *= C.economy.panelCostGrowth; sp.placed = true; sp.cover = 0; sp.sparkT = 0.8;
  tweens.add(sp, 'scale', 0, 1, 0.45, easeOutBack); sp.glow = 1; S.stats.built++;
  fx.burst(sp.x, sp.y - 12, '#8ecae6', 16, 150); fx.text(sp.x, sp.y - 34, `-${cost}`, '#ffd166', 16); sfx.place();
  if (via === 'hero') solSay(S, C.solLines[(Math.random() * C.solLines.length) | 0]);
  return true;
}
export function cleanSlot(S, sp) {
  sp.cover = 0; sp.cleanT = 0; sp.taps = 0; S.stats.cleaned++;
  fx.burst(sp.x, sp.y - 14, '#bde0fe', 20, 150, 0.6, 3, -20); fx.text(sp.x, sp.y - 36, 'Clean!', '#bde0fe', 16); sfx.clean();
  hitCombo(S, sp.x, sp.y - 20, 1);
}

export function drawHero(S) {
  const h = S.hero, T = G.t, moving = Math.abs(h.vx) > 30;
  const blink = h.inv > 0 && Math.sin(T * 40) > 0 ? 0.35 : 1;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; const shY = h.plat ? h.plat.roofY : h.onGround ? h.y : Math.min(GROUND, groundBelow(S, h));
  ctx.beginPath(); ctx.ellipse(h.x, shY, 16, 4, 0, 0, 7); ctx.fill();
  const sx = 1 + h.sq, sy = 1 - h.sq; let ok;
  if (!h.onGround) ok = sprite('solJump', h.x, h.y + 2, 66, h.facing < 0, blink, sx, sy);
  else if (moving) ok = sprite(`run${(Math.floor(h.frame) % 8) + 1}`, h.x, h.y + 2, 64, h.facing < 0, blink, sx, sy);
  else ok = sprite('solFront', h.x, h.y + 2 + Math.sin(T * 3) * 1.2, 64, false, blink, sx, sy);
  if (!ok) { ctx.fillStyle = '#f4a261'; ctx.beginPath(); ctx.arc(h.x, h.y - 30, 20, 0, 7); ctx.fill(); }
  if (h.say) {
    ctx.font = font(800, 13); const tw = ctx.measureText(h.say).width + 22, bx = clamp(h.x - tw / 2, 8, C.W - tw - 8), y = h.y - 70;
    ctx.globalAlpha = clamp(h.sayT / 0.25, 0, 1);
    roundRect(ctx, bx, y - 30, tw, 26, 13); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#f4a261'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#1d2240'; ctx.textAlign = 'center'; ctx.fillText(h.say, bx + tw / 2, y - 12); ctx.globalAlpha = 1;
  }
}
function groundBelow(S, h) { let y = GROUND; for (const hs of S.houses) if (h.x > hs.x1 && h.x < hs.x2 && hs.roofY >= h.y - 1) y = Math.min(y, hs.roofY); return y; }

// ---------- combo ----------
export function comboTier(n) { let t = 1; C.combo.tiers.forEach((th, i) => { if (n >= th) t = i + 1; }); return t; }
export function hitCombo(S, x, y, hits = 1) {
  const c = S.combo; c.n += hits; c.t = C.combo.window + (has('combo') ? 1.5 : 0); c.tmax = c.t;
  const tier = comboTier(c.n); S.stats.maxCombo = Math.max(S.stats.maxCombo, c.n);
  if (tier > c.mult) {
    c.mult = tier; c.pop = 1; const col = C.combo.colors[tier - 1];
    fx.text(x, y - 34, `COMBO x${tier}!`, col, 24 + tier * 2, 1.3); fx.shake(3 + tier); sfx.comboUp(tier);
    fx.burst(x, y, col, 22 + tier * 6, 240, 0.8, 3.5, 80);
  } else c.bump = 1;
  return c.mult;
}
export function breakCombo(S, why) {
  const c = S.combo; if (c.n >= 3) fx.text(S.hero.x, S.hero.y - 90, why || 'Combo lost', '#ff8fab', 16);
  c.n = 0; c.mult = 1; c.t = 0;
}
export function updateCombo(S, dt) {
  const c = S.combo; c.pop = Math.max(0, c.pop - dt * 2.2); c.bump = Math.max(0, (c.bump || 0) - dt * 5);
  if (c.n > 0) { c.t -= dt; if (c.t <= 0) { if (c.n >= 3) { fx.text(C.W / 2, 100, `${c.n}-hit combo!`, '#fff', 18); S.stats.combos++; } c.n = 0; c.mult = 1; } }
}

// ---------- sparks ----------
export function spawnSpark(S, x, y, opts = {}) {
  if (S.sparks.length >= C.spark.max) return null;
  const s = { x, y, vx: rnd(-28, 28), floatY: opts.floatY ?? y - rnd(40, 125), life: opts.life ?? C.spark.life, max: opts.life ?? C.spark.life, born: 0, wob: Math.random() * 6 };
  S.sparks.push(s); return s;
}
export function updateSparks(S, dt) {
  const h = S.hero, turbo = (has('turbo') ? 1.3 : 1) * THEME.mods.panelPower;
  if (S.phase === 'day' && !S.tut) {
    const sun = sunFactor(S.hour) * (1 - S.cloud);
    for (const sp of S.slots) {
      if (!sp.placed || sp.cover > 0) continue;
      sp.sparkT -= dt * sun * turbo * (sp.shadow > 0 ? 0.3 : 1);
      if (sp.sparkT <= 0) { sp.sparkT = C.spark.every * rnd(0.7, 1.3); spawnSpark(S, sp.x, sp.y - 16); }
    }
  }
  for (let i = S.sparks.length - 1; i >= 0; i--) {
    const s = S.sparks[i]; s.born += dt; s.life -= dt; s.wob += dt * 4;
    s.y += (s.floatY - s.y) * Math.min(1, dt * 2.4); s.x = clamp(s.x + s.vx * dt, 20, C.W - 20); s.vx *= Math.pow(0.6, dt);
    const dx = h.x - s.x, dy = heroCY(h) - s.y, d = Math.hypot(dx, dy);
    if (has('magnet') && d < 170 && d > 1) { const m = Math.min(d, 360 * dt); s.x += dx / d * m; s.y += dy / d * m; s.floatY = s.y; }
    if (d < C.spark.radius && s.born > 0.15) { S.sparks.splice(i, 1); collectSpark(S, s); continue; }
    if (s.life <= 0) S.sparks.splice(i, 1);
  }
}
export const sparkPos = s => ({ x: s.x + Math.sin(s.wob) * 5, y: s.y });
export function collectSpark(S, s) {
  const m = hitCombo(S, s.x, s.y, 1);
  const kwh = C.spark.kwh * m * THEME.mods.sparkValue, put = Math.max(0, Math.min(S.cap - S.battery, kwh)), over = kwh - put;
  const coins = Math.round(C.spark.coins * m + over * C.economy.sellPrice);
  S.battery += put; S.coins += coins; S.stats.sparks++; S.stats.sparkKwh += put;
  fx.burst(s.x, s.y, '#ffd166', 14 + m * 4, 160 + m * 20, 0.6, 3, 60); fx.burst(s.x, s.y, '#fff6c2', 8, 90, 0.4, 2, 0);
  fx.text(s.x, s.y - 16, `+${coins}`, C.combo.colors[m - 1], 17 + m * 2);
  if (put > 0.05) fx.text(s.x, s.y + 6, `+${put.toFixed(1)} kWh`, '#a7f3b5', 12, 0.9);
  sfx.spark(S.combo.n);
  if (put > 0.05) fly(S, s.x, s.y, G.HUD_BAT, '#ffe066', () => { S.ui.batPulse = 1; });
  for (let j = 0; j < Math.min(3, m); j++) fly(S, s.x, s.y, G.HUD_COIN, '#ffc94d', () => { S.ui.coinPulse = 1; }, 0.05 + j * 0.06);
  THEME.onSpark(S, s, api());
}
export function drawSparks(S) {
  const T = G.t;
  for (const s of S.sparks) {
    const { x, y } = sparkPos(s), a = clamp(s.life, 0, 1) * clamp(s.born / 0.2, 0, 1);
    const pop = s.born < 0.3 ? easeOutBack(s.born / 0.3) : 1, pulse = 1 + 0.12 * Math.sin(T * 8 + s.wob);
    const blink = s.life < 1.5 ? 0.6 + 0.4 * Math.sin(T * 20) : 1;
    ctx.globalAlpha = a * blink;
    const R = 24 * pop * pulse, g = ctx.createRadialGradient(x, y, 2, x, y, R); g.addColorStop(0, 'rgba(255,250,210,1)'); g.addColorStop(0.4, 'rgba(255,215,110,.55)'); g.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(T * 2 + s.wob); ctx.scale(pop * pulse, pop * pulse);
    ctx.fillStyle = '#ffd166'; ctx.strokeStyle = '#fff3c0'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.5 : 11, an = i * Math.PI / 5; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// ---------- storm drones ----------
export function spawnDrone(S, opts = {}) {
  const side = opts.side ?? (Math.random() < 0.5 ? -1 : 1);
  const d = { x: opts.x ?? (side < 0 ? -60 : C.W + 60), y: opts.y ?? rnd(95, 150), state: 'seek', target: null, tx: C.W / 2, ty: 140, t: 0, rest: 0.3, wander: 0,
    hp: opts.hp ?? C.drone.hp, bob: Math.random() * 6, hit: 0, die: 0, still: !!opts.still, speed: C.drone.speed * (S.L.droneSpeed || 1) * THEME.mods.droneSpeed };
  S.drones.push(d); return d;
}
function pickTarget(S, d) {
  const cands = S.slots.filter(sp => sp.placed && sp.cover <= 0 && !S.drones.some(o => o !== d && o.target === sp && o.state !== 'dead'));
  if (!cands.length) return null;
  cands.sort((a, b) => Math.abs(a.x - d.x) - Math.abs(b.x - d.x));
  return cands[Math.min(cands.length - 1, (Math.random() * 2) | 0)];
}
export function updateDrones(S, dt) {
  const h = S.hero;
  S.slots.forEach(sp => sp.shadow = Math.max(0, sp.shadow - dt * 3));
  for (let i = S.drones.length - 1; i >= 0; i--) {
    const d = S.drones[i]; d.bob += dt * 3; d.hit = Math.max(0, d.hit - dt * 4);
    if (d.state === 'dead') { d.die += dt; if (d.die > 0.45) S.drones.splice(i, 1); continue; }
    if (d.state === 'flee') { d.y -= 220 * dt; d.x += (d.x < C.W / 2 ? -1 : 1) * 320 * dt; if (d.y < -120 || d.x < -150 || d.x > C.W + 150) S.drones.splice(i, 1); continue; }
    if (!d.still) {
      if (d.state === 'seek') {
        d.rest -= dt;
        if (!d.target || d.target.cover > 0 || !d.target.placed) { d.target = pickTarget(S, d); }
        if (d.target) { d.tx = d.target.x; d.ty = d.target.y - C.drone.hover; }
        else { d.wander -= dt; if (d.wander <= 0) { d.wander = rnd(1.2, 2.4); d.tx = rnd(80, C.W - 80); d.ty = rnd(120, 175); } }
        const dx = d.tx - d.x, dy = d.ty - d.y, dist = Math.hypot(dx, dy);
        if (dist > 3) { const m = Math.min(dist, d.speed * dt * (dist > 200 ? 1.4 : 1)); d.x += dx / dist * m; d.y += dy / dist * m; }
        if (d.target && dist < 6 && d.rest <= 0) { d.state = 'charge'; d.t = 0; }
      } else if (d.state === 'charge') {
        d.t += dt;
        if (!d.target || d.target.cover > 0 || !d.target.placed) d.state = 'seek';
        else {
          d.x = d.tx + Math.sin(d.t * 45) * 2.5 * (d.t / C.drone.charge);
          if (Math.random() < dt * 16) S.rain.push({ x: d.x + rnd(-22, 22), y: d.y + 16, v: 260 });
          if (d.t >= C.drone.charge / Math.sqrt(S.L.droneSpeed || 1)) {
            d.target.cover = 1; d.target.cleanT = 0; d.target.taps = 0; S.stats.covered++;
            fx.burst(d.target.x, d.target.y - 14, '#4a4e69', 18, 120, 0.6, 3.5, 300); sfx.splat(); fx.text(d.target.x, d.target.y - 40, 'Panel covered!', '#c8c9ff', 14);
            d.state = 'seek'; d.rest = 1.1; d.target = null;
          }
        }
      }
    }
    // shade under the drone cuts panel output
    for (const sp of S.slots) if (sp.placed && Math.abs(sp.x - d.x) < C.drone.shadow && sp.y > d.y) sp.shadow = 1;
    // Solarchik vs drone: stomp from above, or get bumped
    const feet = h.y;
    if (h.vy > 40 && Math.abs(h.x - d.x) < 42 && feet > d.y - 46 && feet < d.y + 10) stomp(S, d);
    else if (h.vy < -40 && Math.abs(h.x - d.x) < 40 && heroCY(h) > d.y && heroCY(h) - d.y < 62 && (d.bonkT || 0) <= 0) bonk(S, d);
    else if (h.inv <= 0 && h.vy >= -40 && Math.hypot(h.x - d.x, heroCY(h) - d.y) < 34) hurt(S, d);
    d.bonkT = Math.max(0, (d.bonkT || 0) - dt);
  }
}
function stomp(S, d) {
  const h = S.hero;
  h.vy = -(G.ctlJumpHeld ? C.hero.stompHeldV : C.hero.stompV); h.bounced = true; h.jumps = 1; h.sq = -0.15;
  S.stats.stomps++; fx.text(d.x, d.y - 46, 'STOMP!', '#8ecae6', 22, 0.9); sfx.stomp(); fx.shake(7);
  killDrone(S, d, 2);
  if (has('boots')) for (const o of S.drones) if (o !== d && o.state !== 'dead' && o.state !== 'flee' && Math.hypot(o.x - d.x, o.y - d.y) < 190) { S.bolts.push({ x1: d.x, y1: d.y, x2: o.x, y2: o.y, t: 0.3, max: 0.3 }); sfx.zap(); killDrone(S, o, 1); }
}
function bonk(S, d) {   // jumping into a drone from below: head-butt it (no damage to Solarchik)
  const h = S.hero; h.vy = 160; d.bonkT = 0.35; d.y -= 14; fx.text(d.x, d.y - 46, 'BONK!', '#a0f0ff', 20, 0.8); fx.shake(4);
  tapDrone(S, d);
}
export function tapDrone(S, d) {
  d.hp--; d.hit = 1; sfx.zap(); fx.burst(d.x, d.y, '#a0f0ff', 10, 140, 0.4, 2.5, 100);
  if (d.hp <= 0) killDrone(S, d, 1); else fx.text(d.x, d.y - 44, 'Tap again!', '#a0f0ff', 14, 0.8);
}
export function killDrone(S, d, hits) {
  d.state = 'dead'; d.die = 0; d.target = null;
  const m = hitCombo(S, d.x, d.y, hits), coins = C.drone.coins * m;
  S.coins += coins; S.stats.drones++;
  fx.burst(d.x, d.y, '#8ecae6', 30, 260); fx.burst(d.x, d.y, '#ffffff', 12, 160); fx.text(d.x, d.y - 20, `+${coins}`, C.combo.colors[m - 1], 18 + m * 2);
  for (let j = 0; j < Math.min(3, m); j++) fly(S, d.x, d.y, G.HUD_COIN, '#ffc94d', () => { S.ui.coinPulse = 1; }, j * 0.06);
  const near = S.houses.reduce((a, hs) => Math.abs(hs.x + hs.w / 2 - d.x) < Math.abs(a.x + a.w / 2 - d.x) ? hs : a, S.houses[0]); near.jump = 1;
  THEME.onDroneKilled(S, d, api());
}
function hurt(S, d) {
  const h = S.hero; h.inv = 1.2; h.stun = 0.45; h.vx = Math.sign(h.x - d.x || 1) * 330; h.vy = -380; h.bounced = true;
  breakCombo(S, 'Ouch! Combo lost'); S.stats.hurts++; fx.shake(8); sfx.hurt(); solSay(S, 'Ouch! Jump ON them!');
}
export function droneHit(d, x, y) { return d.state !== 'dead' && d.state !== 'flee' && Math.hypot(x - d.x, y - d.y) < 44; }
export function dronesFlee(S) { S.drones.forEach(d => { if (d.state !== 'dead') d.state = 'flee'; }); }
export function drawDrones(S) {
  const T = G.t;
  for (const d of S.drones) {
    const wob = Math.sin(d.bob) * 4, charging = d.state === 'charge', k = charging ? d.t / C.drone.charge : 0;
    if (d.state === 'dead') {
      const s = 1 + d.die * 2; ctx.globalAlpha = clamp(1 - d.die / 0.45, 0, 1);
      sprite('storm', d.x, d.y + 35, 70 * s, false, 1, 1, 0.4 + 0.6 / s); ctx.globalAlpha = 1; continue;
    }
    if (charging) {   // telegraph: dark cloud + target ring
      ctx.fillStyle = `rgba(40,40,80,${0.25 + 0.3 * k})`; ctx.beginPath(); ctx.ellipse(d.x, d.y + 70, 34, 8, 0, 0, 7); ctx.fill();
      if (d.target) { ctx.strokeStyle = `rgba(255,90,120,${0.5 + 0.5 * Math.sin(T * 20)})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(d.target.x, d.target.y - 12, 22 - k * 8, 0, 7); ctx.stroke(); }
    }
    const hg = ctx.createRadialGradient(d.x, d.y, 8, d.x, d.y, 60); hg.addColorStop(0, charging ? `rgba(255,120,150,${0.2 + 0.25 * k})` : 'rgba(120,200,255,.2)'); hg.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(d.x, d.y, 60, 0, 7); ctx.fill();
    const flash = d.hit > 0 ? 0.5 : 1;
    if (!sprite('storm', d.x, d.y + 35 + wob, 70, d.x > C.W / 2, d.state === 'flee' ? 0.6 : flash)) { ctx.fillStyle = '#445'; ctx.beginPath(); ctx.arc(d.x, d.y, 30, 0, 7); ctx.fill(); }
    if (d.hp < C.drone.hp && d.state !== 'flee') { ctx.fillStyle = '#ff6b6b'; ctx.font = font(900, 12); ctx.textAlign = 'center'; ctx.fillText('♥'.repeat(Math.max(0, d.hp)), d.x, d.y - 40); }
  }
}

// ---------- flyers (collected stuff visibly travels to the HUD) + power bolts ----------
export function fly(S, x, y, to, color, onArrive, delay = 0) {
  if (!to) return;
  S.flyers.push({ x0: x, y0: y, x, y, to, color, t: -delay, dur: 0.5 + Math.random() * 0.15, cx: lerp(x, to.x, 0.3) + (Math.random() - 0.5) * 120, cy: Math.min(y, to.y) + 60 + Math.random() * 40, onArrive, trail: [] });
}
export function updateFlyers(S, dt) {
  for (let i = S.flyers.length - 1; i >= 0; i--) {
    const f = S.flyers[i]; f.t += dt; if (f.t < 0) continue;
    const k = easeOutCubic(clamp(f.t / f.dur, 0, 1)), u = 1 - k;
    f.x = u * u * f.x0 + 2 * u * k * f.cx + k * k * f.to.x; f.y = u * u * f.y0 + 2 * u * k * f.cy + k * k * f.to.y;
    f.trail.push({ x: f.x, y: f.y }); if (f.trail.length > 7) f.trail.shift();
    if (f.t >= f.dur) { f.onArrive?.(); S.flyers.splice(i, 1); }
  }
  for (let i = S.bolts.length - 1; i >= 0; i--) { S.bolts[i].t -= dt; if (S.bolts[i].t <= 0) S.bolts.splice(i, 1); }
}
export function drawFlyers(S) {
  for (const f of S.flyers) {
    if (f.t < 0) continue;
    f.trail.forEach((p, i) => { ctx.globalAlpha = (i + 1) / f.trail.length * 0.5; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(p.x, p.y, 2 + i * 0.5, 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1; const g = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, 10); g.addColorStop(0, '#fff'); g.addColorStop(0.5, f.color); g.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, 10, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
export function drawBolts(S) {
  for (const b of S.bolts) {
    const a = clamp(b.t / b.max, 0, 1), n = 9;
    for (const [w, col] of [[7, `rgba(255,220,100,${0.3 * a})`], [2.5, `rgba(255,255,230,${a})`]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(b.x1, b.y1);
      for (let i = 1; i < n; i++) { const k = i / n; ctx.lineTo(lerp(b.x1, b.x2, k) + (Math.random() - 0.5) * 16, lerp(b.y1, b.y2, k) - Math.sin(k * Math.PI) * 40 + (Math.random() - 0.5) * 16); }
      ctx.lineTo(b.x2, b.y2); ctx.stroke();
    }
  }
}
