// Sunny Block engine: tiny, dependency-free, theme-agnostic helpers.
// Reusable for any jam theme: loop, input, rng, tweens, particles, floating text, audio, shake.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const font = (weight, size) => `${weight} ${size}px ${FONT}`;
// localStorage can throw (private mode, sandboxed itch.io iframes): never let it crash the game.
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
export function lerpColor(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
  const r = Math.round(lerp(a >> 16, b >> 16, t)), g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t)), bl = Math.round(lerp(a & 255, b & 255, t));
  return `rgb(${r},${g},${bl})`;
}
export function dateSeed(d = new Date()) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }

// ---------- canvas + loop ----------
export function createStage(canvas, W, H) {
  const ctx = canvas.getContext('2d');
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = `${Math.floor(W * s)}px`; canvas.style.height = `${Math.floor(H * s)}px`;
    canvas.width = Math.floor(W * s * dpr); canvas.height = Math.floor(H * s * dpr);
    stage.scale = s * dpr; stage.cssScale = s;
  }
  const stage = { ctx, W, H, scale: 1, cssScale: 1, resize };
  window.addEventListener('resize', resize); resize();
  return stage;
}
export function startLoop(update, render) {
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt); render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------- input (mouse + touch unified, in stage coords) ----------
export function createInput(canvas, stage) {
  const input = { x: -1, y: -1, clicks: [], down: false };
  const toStage = e => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / stage.cssScale, y: (e.clientY - r.top) / stage.cssScale };
  };
  canvas.addEventListener('pointermove', e => { const p = toStage(e); input.x = p.x; input.y = p.y; });
  canvas.addEventListener('pointerdown', e => { const p = toStage(e); input.x = p.x; input.y = p.y; input.down = true; input.clicks.push(p); e.preventDefault(); });
  window.addEventListener('pointerup', () => { input.down = false; });
  input.keys = new Set();
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase(); if (k === ' ' || k === 'enter') e.preventDefault();
    if (!e.repeat) input.keys.add(k);
  });
  input.consumeKey = k => { if (input.keys.has(k)) { input.keys.delete(k); return true; } return false; };
  input.endFrame = () => input.keys.clear(); // unhandled keys must not leak into the next screen
  canvas.addEventListener('pointerleave', () => { input.x = -1; input.y = -1; });
  return input;
}

// ---------- tweens ----------
export function createTweens() {
  const list = [];
  return {
    add(obj, key, from, to, dur, ease = easeOutCubic, delay = 0) { list.push({ obj, key, from, to, dur, ease, t: -delay }); obj[key] = from; },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const tw = list[i]; tw.t += dt; if (tw.t < 0) continue;
        const k = clamp(tw.t / tw.dur, 0, 1); tw.obj[tw.key] = lerp(tw.from, tw.to, tw.ease(k));
        if (k >= 1) list.splice(i, 1);
      }
    },
  };
}

// ---------- particles + floating text ----------
export function createFx() {
  const parts = [], texts = [];
  let shake = 0;
  return {
    burst(x, y, color, n = 12, speed = 120, life = 0.8, size = 3, gravity = 200) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.4, life, max: life, color, size: size * (0.6 + Math.random() * 0.8), g: gravity });
      }
    },
    text(x, y, str, color = '#fff', size = 18, life = 1.2) { texts.push({ x, y, str, color, size, life, max: life }); },
    shake(a) { shake = Math.max(shake, a); },
    update(dt) {
      for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.life <= 0) parts.splice(i, 1); }
      for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.life -= dt; t.y -= 34 * dt; if (t.life <= 0) texts.splice(i, 1); }
      shake = Math.max(0, shake - dt * 30);
    },
    offset() { return shake > 0 ? { x: (Math.random() - 0.5) * shake, y: (Math.random() - 0.5) * shake } : { x: 0, y: 0 }; },
    draw(ctx) {
      for (const p of parts) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      for (const t of texts) {
        const k = t.life / t.max, age = t.max - t.life, pop = age < 0.18 ? easeOutBack(age / 0.18) : 1;
        ctx.globalAlpha = clamp(k * 2.2, 0, 1);
        ctx.save(); ctx.translate(t.x, t.y); ctx.scale(pop, pop);
        ctx.font = font(800, t.size); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(12,16,40,.7)';
        ctx.strokeText(t.str, 0, 0); ctx.fillStyle = t.color; ctx.fillText(t.str, 0, 0); ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  };
}

// ---------- audio: synthesized blips, no files ----------
export function createAudio() {
  let ac = null, muted = store.get('sb-muted') === '1';
  const ensure = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; } } if (ac && ac.state === 'suspended') ac.resume(); return ac; };
  function tone(freq, dur = 0.12, type = 'sine', vol = 0.15, slide = 0, delay = 0) {
    if (muted) return; const a = ensure(); if (!a) return;
    const t0 = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  return {
    unlock: ensure,
    get muted() { return muted; },
    toggle() { muted = !muted; store.set('sb-muted', muted ? '1' : '0'); },
    place() { tone(520, 0.08, 'square', 0.08); tone(780, 0.12, 'triangle', 0.1, 0, 0.06); },
    coin() { tone(988, 0.07, 'square', 0.06); tone(1319, 0.14, 'square', 0.06, 0, 0.07); },
    spark() { tone(1200, 0.15, 'sine', 0.1, 600); tone(1800, 0.1, 'triangle', 0.05, 0, 0.05); },
    charge() { tone(880, 0.08, 'triangle', 0.05, 300); },
    deny() { tone(180, 0.18, 'sawtooth', 0.08, -60); },
    deal() { [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.1, 0, i * 0.06)); },
    dark() { tone(220, 0.4, 'sawtooth', 0.08, -150); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12, 0, i * 0.12)); },
    tick() { tone(660, 0.04, 'square', 0.04); },
  };
}

// ---------- drawing helpers ----------
export function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2)); // arcTo misbehaves when r > half the size (e.g. a nearly empty bar)
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

// ---------- images ----------
export function loadImages(map, base = './assets/') {
  const out = {};
  for (const [k, f] of Object.entries(map)) { const im = new Image(); im.src = base + f; out[k] = im; }
  out.ready = k => out[k] && out[k].complete && out[k].naturalWidth > 0;
  return out;
}
