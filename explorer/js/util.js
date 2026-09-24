'use strict';
// ───────────────────────── Math helpers ─────────────────────────
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (a) => a[(Math.random() * a.length) | 0];
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dist2D = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);

function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function weighted(list) {
  let tot = 0;
  for (const [, w] of list) tot += w;
  let r = Math.random() * tot;
  for (const [v, w] of list) { if ((r -= w) <= 0) return v; }
  return list[list.length - 1][0];
}

const _rgbCache = {};
function rgb(hex) {
  if (_rgbCache[hex]) return _rgbCache[hex];
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return (_rgbCache[hex] = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`);
}
const rgba = (hex, a) => `rgba(${rgb(hex)},${a})`;

function fmtTime(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return m + ':' + String(ss).padStart(2, '0');
}

// distance from point P to segment AB (3D, plain numbers)
function segPointDist(ax, ay, az, bx, by, bz, px, py, pz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const l = dx * dx + dy * dy + dz * dz;
  let t = l ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t), pz - (az + dz * t));
}

// ───────────────────────── Seeded noise ─────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePerlin(seed) {
  const rnd = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x; case 6: return y; default: return -y;
    }
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    let X = Math.floor(x), Y = Math.floor(y);
    x -= X; y -= Y; X &= 255; Y &= 255;
    const u = fade(x), v = fade(y);
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    return lerp(lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u),
      lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u), v);
  };
}

// ───────────────────────── Input (pointer-lock FPS) ─────────────────────────
const Input = {
  keys: {},
  pressed: {},
  mouse: { down: false, right: false, rightPressed: false, dx: 0, dy: 0 },
  locked: false,
  key(c) { return !!this.keys[c]; },
  hit(c) { return !!this.pressed[c]; },
  endFrame() { this.pressed = {}; this.mouse.rightPressed = false; this.mouse.dx = 0; this.mouse.dy = 0; },
  init(canvas) {
    window.addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && e.target === document.body) e.preventDefault();
      if (e.code === 'Tab') e.preventDefault();
      this.keys[e.code] = true;
      if (!e.repeat) this.pressed[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked && !this.fallback) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; this.mouse.right = false; });
    document.addEventListener('pointerlockerror', () => { this.fallback = true; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  },
  lock(canvas) {
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.fallback = true; });
    } catch (e) { this.fallback = true; /* pointer lock unavailable (e.g. embedded frame) — free mouse-look */ }
  },
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
};
