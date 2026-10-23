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

// ---------- input (mouse + touch + keyboard, in stage coords) ----------
// keys = pressed this tick, held = currently down, pointers = every active finger/mouse (multi-touch).
const GAME_KEYS = new Set([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'enter', 'tab']);
export function createInput(canvas, stage) {
  const input = { x: -1, y: -1, clicks: [], down: false, pointers: new Map(), held: new Set(), keys: new Set(), touch: false };
  const toStage = e => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / stage.cssScale, y: (e.clientY - r.top) / stage.cssScale };
  };
  canvas.addEventListener('pointerdown', e => {
    const p = toStage(e);
    if (e.pointerType === 'touch' || e.pointerType === 'pen') input.touch = true; else if (e.pointerType === 'mouse') input.touch = false;
    input.x = p.x; input.y = p.y; input.pointers.set(e.pointerId, { x: p.x, y: p.y, id: e.pointerId });
    input.down = true; input.clicks.push({ x: p.x, y: p.y, id: e.pointerId });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    // no preventDefault here: inside an itch.io iframe it would stop the frame from taking keyboard focus
    try { window.focus(); canvas.focus({ preventScroll: true }); } catch { /* ignore */ }
  });
  canvas.addEventListener('pointermove', e => {
    const p = toStage(e); input.x = p.x; input.y = p.y;
    const q = input.pointers.get(e.pointerId); if (q) { q.x = p.x; q.y = p.y; }
  });
  const up = e => { input.pointers.delete(e.pointerId); input.down = input.pointers.size > 0; };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !input.down) { input.x = -1; input.y = -1; } });
  const norm = k => (k === 'Spacebar' ? ' ' : k.length === 1 ? k.toLowerCase() : k.toLowerCase());
  window.addEventListener('keydown', e => {
    const k = norm(e.key); if (GAME_KEYS.has(k)) e.preventDefault();
    if (!e.repeat) input.keys.add(k);
    input.held.add(k);
  });
  window.addEventListener('keyup', e => { input.held.delete(norm(e.key)); });
  window.addEventListener('blur', () => { input.held.clear(); input.pointers.clear(); input.down = false; });
  input.consumeKey = k => { if (input.keys.has(k)) { input.keys.delete(k); return true; } return false; };
  input.pressed = (...ks) => ks.some(k => input.keys.has(k));
  input.isHeld = (...ks) => ks.some(k => input.held.has(k));
  input.endFrame = () => input.keys.clear(); // unhandled presses must not leak into the next tick
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

// ---------- audio: synthesized sfx + a tiny procedural music sequencer (no audio files) ----------
const mf = m => 440 * Math.pow(2, (m - 69) / 12);
const MUSIC = {
  day: { bpm: 108, chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], roots: [48, 45, 41, 43], lead: [72, 0, 76, 0, 79, 0, 76, 74, 72, 0, 69, 0, 67, 0, 69, 0] },
  night: { bpm: 116, tensionBpm: 44, chords: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]], roots: [45, 41, 38, 40], lead: [69, 0, 0, 72, 0, 0, 71, 0, 69, 0, 0, 64, 0, 0, 68, 0] },
  title: { bpm: 96, chords: [[60, 64, 67], [53, 57, 60], [57, 60, 64], [55, 59, 62]], roots: [48, 41, 45, 43], lead: [] },
};
export function createAudio() {
  let ac = null, out = null, noiseBuf = null, muted = store.get('sb-muted') === '1';
  const ensure = () => {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)(); out = ac.createGain(); out.gain.value = 0.9; out.connect(ac.destination);
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch { ac = null; }
    }
    if (ac && ac.state === 'suspended') ac.resume(); return ac;
  };
  function toneAt(t0, freq, dur = 0.12, type = 'sine', vol = 0.15, slide = 0) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(out); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noiseAt(t0, dur = 0.08, vol = 0.05, freq = 3000) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = freq; g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    s.connect(f).connect(g).connect(out); s.start(t0); s.stop(t0 + dur + 0.02);
  }
  function tone(freq, dur, type, vol, slide = 0, delay = 0) { if (muted) return; const a = ensure(); if (!a) return; toneAt(a.currentTime + delay, freq, dur, type, vol, slide); }
  function noise(dur, vol, freq, delay = 0) { if (muted) return; const a = ensure(); if (!a) return; noiseAt(a.currentTime + delay, dur, vol, freq); }
  // music: look-ahead scheduler, 16th-note steps
  const mus = { kind: null, tension: 0, step: 0, next: 0 };
  function playStep(P, s, t, tension) {
    const bar = (s >> 4) % 4, i = s % 16, ch = P.chords[bar], V = 0.8;
    if (i % 8 === 0 || (tension > 0.55 && i % 4 === 0)) toneAt(t, mf(P.roots[bar]), 0.32, 'triangle', 0.09 * V);
    if (i % 2 === 0) toneAt(t, mf(ch[(i / 2) % 3] + 12 * ((i >> 3) & 1) + 12), 0.11, P === MUSIC.night ? 'triangle' : 'square', (P === MUSIC.night ? 0.035 : 0.016) * V);
    const ln = P.lead[i]; if (ln && (s >> 6) % 2 === 1) toneAt(t, mf(ln), 0.22, 'sine', 0.04 * V);
    if (i % 4 === 2) noiseAt(t, 0.04, (0.012 + tension * 0.02) * V, 6000);
    if (P === MUSIC.night && tension > 0.75 && i % 2 === 1) noiseAt(t, 0.03, 0.01, 8000);
  }
  setInterval(() => {
    if (!ac || muted || !mus.kind || ac.state !== 'running') { if (ac) mus.next = ac.currentTime + 0.05; return; }
    const P = MUSIC[mus.kind], spb = 60 / (P.bpm + (P.tensionBpm || 0) * mus.tension) / 4;
    if (mus.next < ac.currentTime) mus.next = ac.currentTime + 0.05;
    while (mus.next < ac.currentTime + 0.18) { playStep(P, mus.step, mus.next, mus.tension); mus.next += spb; mus.step++; }
  }, 40);
  let lastRoute = 0;
  return {
    unlock: ensure,
    get muted() { return muted; },
    toggle() { muted = !muted; store.set('sb-muted', muted ? '1' : '0'); },
    music(kind) { if (mus.kind !== kind) { mus.kind = kind; mus.step = 0; } },
    set tension(v) { mus.tension = v; },
    place() { tone(520, 0.08, 'square', 0.08); tone(780, 0.12, 'triangle', 0.1, 0, 0.06); },
    coin() { tone(988, 0.07, 'square', 0.05); tone(1319, 0.14, 'square', 0.05, 0, 0.07); },
    spark(n = 0) { const f = 900 * Math.pow(2, Math.min(n, 18) / 12); tone(f, 0.13, 'sine', 0.1, f * 0.5); tone(f * 1.5, 0.09, 'triangle', 0.05, 0, 0.04); },
    comboUp(t) { [0, 4, 7, 12].forEach((s, i) => tone(mf(72 + t * 2 + s), 0.14, 'square', 0.05, 0, i * 0.05)); },
    charge() { tone(880, 0.08, 'triangle', 0.04, 300); },
    deny() { tone(180, 0.18, 'sawtooth', 0.07, -60); },
    jump() { tone(330, 0.12, 'square', 0.04, 260); },
    land() { noise(0.05, 0.03, 900); },
    stomp() { tone(200, 0.16, 'square', 0.1, -120); noise(0.12, 0.08, 1500); tone(660, 0.12, 'triangle', 0.07, 400, 0.06); },
    zap() { tone(1400, 0.08, 'sawtooth', 0.04, -900); },
    hurt() { tone(300, 0.25, 'sawtooth', 0.09, -220); },
    splat() { noise(0.25, 0.07, 400); tone(140, 0.3, 'sine', 0.08, -60); },
    clean() { [1200, 1500, 1800].forEach((f, i) => tone(f, 0.06, 'sine', 0.05, 0, i * 0.04)); },
    alarm() { tone(880, 0.12, 'square', 0.05); tone(660, 0.12, 'square', 0.05, 0, 0.14); },
    windowOff() { tone(330, 0.35, 'sawtooth', 0.06, -200); },
    route() { if (!ac || ac.currentTime - lastRoute < 0.07) { ensure(); if (ac && ac.currentTime - lastRoute < 0.07) return; } lastRoute = ac ? ac.currentTime : 0; tone(600 + Math.random() * 300, 0.07, 'sawtooth', 0.03, 500); },
    deal() { [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.1, 0, i * 0.06)); },
    dark() { tone(220, 0.5, 'sawtooth', 0.08, -150); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12, 0, i * 0.12)); },
    lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'triangle', 0.1, 0, i * 0.16)); },
    star(i) { tone(mf(76 + i * 4), 0.25, 'square', 0.06); tone(mf(88 + i * 4), 0.2, 'sine', 0.05, 0, 0.05); },
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
