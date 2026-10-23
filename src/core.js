// Shared singletons + drawing helpers used by every module.
import { CONFIG as C } from './config.js';
import { createStage, createInput, createTweens, createFx, createAudio, loadImages, roundRect, inRect, font, clamp, easeOutBack, store } from './engine.js';
export { C };

export const canvas = document.getElementById('game');
export const stage = createStage(canvas, C.W, C.H);
export const ctx = stage.ctx;
export const input = createInput(canvas, stage);
export const tweens = createTweens();
export const fx = createFx();
export const sfx = createAudio();
export const IMG = loadImages({
  solFront: 'sol-front.png', solJump: 'sol-jump.png', storm: 'storm.png', battery: 'battery.png',
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`run${i + 1}`, `sol-run-${i + 1}.png`])),
  ...Object.fromEntries(['copperkit', 'frostkit', 'mosskit', 'prismkit', 'hetman'].map(k => [k, `${k}.png`])),
});

// G = global game state. G.S = the current level (null on the title screen).
export const G = { S: null, mode: 'title', t: 0, timeScale: 1, banner: null, save: null, paused: false, onTick: null, forceTouch: false };
export const rnd = (a, b) => a + Math.random() * (b - a);

const SAVE_KEY = 'sb2-save';
export function loadSave() {
  let s = null; try { s = JSON.parse(store.get(SAVE_KEY) || 'null'); } catch { s = null; }
  const d = { unlocked: 1, stars: [0, 0, 0, 0, 0], best: [0, 0, 0, 0, 0], ups: [], picked: [false, false, false, false, false], tut: false };
  G.save = { ...d, ...(s && typeof s === 'object' ? s : {}) };
  return G.save;
}
export function writeSave() { store.set(SAVE_KEY, JSON.stringify(G.save)); }
export const has = id => !!G.save && G.save.ups.includes(id);

export function showBanner(text, color = '#fff', dur = 3) { G.banner = { text, color, t: dur, max: dur, y: 0 }; tweens.add(G.banner, 'y', -40, 0, 0.45, easeOutBack); }

// ---------- touch controls (shown after the first touch) ----------
export const TOUCH = {
  left: { x: 64, y: 486, r: 40 }, right: { x: 160, y: 486, r: 40 },
  action: { x: C.W - 160, y: 486, r: 40 }, jump: { x: C.W - 64, y: 486, r: 42 },
};
export const touchOn = () => input.touch || G.forceTouch;
export function touchZoneAt(p) {
  if (!touchOn()) return null;
  for (const [k, z] of Object.entries(TOUCH)) if (Math.hypot(p.x - z.x, p.y - z.y) < z.r + 10) return k;
  return null;
}
const tPrev = { jump: false, action: false };
export const ctl = { left: false, right: false, jumpHeld: false, jumpPress: false, actionHeld: false, actionPress: false };
export function readControls() {
  const t = { left: false, right: false, jump: false, action: false };
  for (const p of input.pointers.values()) { const z = touchZoneAt(p); if (z) t[z] = true; }
  ctl.left = input.isHeld('arrowleft', 'a') || t.left;
  ctl.right = input.isHeld('arrowright', 'd') || t.right;
  ctl.jumpHeld = input.isHeld('arrowup', 'w', ' ', 'z', 'k') || t.jump;
  ctl.jumpPress = input.pressed('arrowup', 'w', ' ', 'z', 'k') || (t.jump && !tPrev.jump);
  ctl.actionHeld = input.isHeld('e', 'arrowdown', 's', 'x', 'j') || t.action;
  ctl.actionPress = input.pressed('e', 'arrowdown', 's', 'x', 'j') || (t.action && !tPrev.action);
  tPrev.jump = t.jump; tPrev.action = t.action;
  return ctl;
}

// ---------- drawing helpers ----------
export function sprite(key, x, y, h, flip = false, alpha = 1, sx = 1, sy = 1) { // x = centre, y = feet
  if (!IMG.ready(key)) return false; const im = IMG[key], w = im.naturalWidth * h / im.naturalHeight;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.scale(flip ? -sx : sx, sy); ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore(); return true;
}
export function panel(x, y, w, h, r = 14, alpha = 0.62) {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
  roundRect(ctx, x, y, w, h, r); ctx.fillStyle = `rgba(14,18,48,${alpha})`; ctx.fill(); ctx.restore();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.stroke();
}
export function drawCoin(x, y, r = 8, pulse = 0) {
  const R = r * (1 + pulse * 0.25);
  const g = ctx.createLinearGradient(x, y - R, x, y + R); g.addColorStop(0, '#ffe58a'); g.addColorStop(1, '#f4a91f');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill(); ctx.strokeStyle = '#b97800'; ctx.lineWidth = Math.max(1.5, R * 0.18); ctx.stroke();
  ctx.fillStyle = '#a86a00'; ctx.font = font(900, R * 1.15); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('S', x, y + 1); ctx.textBaseline = 'alphabetic';
}
export function button(r, label, active = true, accent = '#ffd166', big = false) {
  const hover = inRect({ x: input.x, y: input.y }, r) && !input.touch, press = hover && input.down, lift = press ? 1 : hover ? -2 : 0, y = r.y + lift;
  ctx.save();
  roundRect(ctx, r.x, r.y + 4, r.w, r.h, 14); ctx.fillStyle = active ? 'rgba(0,0,0,.35)' : 'rgba(0,0,0,.2)'; ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + r.h);
  if (big) { g.addColorStop(0, hover ? '#fff3b0' : '#ffe27a'); g.addColorStop(1, hover ? '#ffc53d' : '#ffb703'); }
  else if (active) { g.addColorStop(0, hover ? '#ffffff' : '#fffaf0'); g.addColorStop(1, hover ? '#fff1c9' : '#f3e6c4'); }
  else { g.addColorStop(0, '#9aa0b8'); g.addColorStop(1, '#7c8199'); }
  roundRect(ctx, r.x, y, r.w, r.h, 14); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = hover ? 3.5 : 2.5; ctx.strokeStyle = big ? '#7a3e00' : active ? accent : 'rgba(255,255,255,.25)'; ctx.stroke();
  roundRect(ctx, r.x + 6, y + 4, r.w - 12, r.h * 0.36, 10); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
  ctx.fillStyle = big ? '#4a2400' : active ? '#1d2240' : '#2c3150'; ctx.font = font(big ? 900 : 800, big ? 26 : r.h > 50 ? 17 : r.h < 40 ? 13 : 15); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, r.x + r.w / 2, y + r.h / 2 + 1, r.w - 12); ctx.textBaseline = 'alphabetic';
  ctx.restore();
}
export function wrapLines(text, maxW) {
  const words = text.split(' '), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
export function starShape(x, y, R, on, rot = 0, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.rotate(rot);
  ctx.fillStyle = on ? '#ffd166' : '#3a4066'; ctx.strokeStyle = on ? '#c98b00' : '#2a2f4f'; ctx.lineWidth = Math.max(2, R * 0.12); ctx.beginPath();
  for (let j = 0; j < 10; j++) { const r = j % 2 ? R * 0.42 : R, an = -Math.PI / 2 + j * Math.PI / 5; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}
// simple vector icons (no emoji fonts needed)
export function icon(kind, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const Y = '#ffd166', D = '#1d2240';
  if (kind === 'battery') { roundRect(ctx, -12, -18, 24, 36, 5); ctx.fillStyle = '#4cc56a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = D; ctx.stroke(); ctx.fillStyle = D; ctx.fillRect(-5, -23, 10, 5); ctx.fillStyle = '#fff'; ctx.fillRect(-2, -10, 4, 14); ctx.fillRect(-7, -5, 14, 4); }
  else if (kind === 'magnet') { ctx.lineWidth = 9; ctx.strokeStyle = '#e63946'; ctx.beginPath(); ctx.arc(0, -2, 12, Math.PI, 0); ctx.lineTo(12, 14); ctx.moveTo(-12, -2); ctx.lineTo(-12, 14); ctx.stroke(); ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(-12, 10); ctx.lineTo(-12, 16); ctx.moveTo(12, 10); ctx.lineTo(12, 16); ctx.stroke(); }
  else if (kind === 'jump') { ctx.strokeStyle = Y; ctx.lineWidth = 5; for (const dy of [4, -8]) { ctx.beginPath(); ctx.moveTo(-12, dy + 8); ctx.lineTo(0, dy - 4); ctx.lineTo(12, dy + 8); ctx.stroke(); } }
  else if (kind === 'sun') { ctx.fillStyle = Y; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill(); ctx.strokeStyle = Y; ctx.lineWidth = 3.5; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14); ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20); ctx.stroke(); } }
  else if (kind === 'fire') { ctx.fillStyle = '#ff8c42'; ctx.beginPath(); ctx.moveTo(0, -20); ctx.quadraticCurveTo(16, -2, 12, 8); ctx.quadraticCurveTo(8, 18, 0, 18); ctx.quadraticCurveTo(-8, 18, -12, 8); ctx.quadraticCurveTo(-14, -4, 0, -20); ctx.fill(); ctx.fillStyle = Y; ctx.beginPath(); ctx.arc(0, 8, 6, 0, 7); ctx.fill(); }
  else if (kind === 'bolt') { ctx.fillStyle = Y; ctx.strokeStyle = '#b97800'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, -20); ctx.lineTo(-10, 3); ctx.lineTo(-1, 3); ctx.lineTo(-5, 20); ctx.lineTo(10, -4); ctx.lineTo(1, -4); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  else if (kind === 'tag') { ctx.fillStyle = '#80ed99'; ctx.beginPath(); ctx.moveTo(-16, -6); ctx.lineTo(-4, -18); ctx.lineTo(16, -18); ctx.lineTo(16, 2); ctx.lineTo(4, 14); ctx.closePath(); ctx.fill(); ctx.fillStyle = D; ctx.beginPath(); ctx.arc(8, -10, 3, 0, 7); ctx.fill(); ctx.font = font(900, 13); ctx.textAlign = 'center'; ctx.fillText('%', -1, 4); }
  else if (kind === 'shield') { ctx.fillStyle = '#80ed99'; ctx.strokeStyle = D; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(16, -13); ctx.quadraticCurveTo(16, 10, 0, 20); ctx.quadraticCurveTo(-16, 10, -16, -13); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = Y; ctx.beginPath(); ctx.moveTo(3, -11); ctx.lineTo(-6, 3); ctx.lineTo(0, 3); ctx.lineTo(-3, 12); ctx.lineTo(7, -2); ctx.lineTo(1, -2); ctx.closePath(); ctx.fill(); }
  else if (kind === 'boot') { ctx.fillStyle = '#8ecae6'; ctx.beginPath(); ctx.moveTo(-8, -18); ctx.lineTo(4, -18); ctx.lineTo(4, 4); ctx.lineTo(16, 8); ctx.lineTo(16, 16); ctx.lineTo(-8, 16); ctx.closePath(); ctx.fill(); ctx.strokeStyle = Y; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(-20, 0); ctx.lineTo(-14, 2); ctx.lineTo(-20, 10); ctx.stroke(); }
  ctx.restore();
}
export { roundRect, inRect, font, clamp };
