'use strict';
// ───────────────────────── Glow sprites ─────────────────────────
const Glow = {
  cache: new Map(),
  get(color) {
    let c = this.cache.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const col = rgb(color);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, `rgba(${col},1)`);
    grd.addColorStop(0.2, `rgba(${col},0.6)`);
    grd.addColorStop(0.55, `rgba(${col},0.14)`);
    grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    this.cache.set(color, c);
    return c;
  },
};

function glow(ctx, x, y, r, color, a = 1) {
  if (a <= 0.01) return;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(Glow.get(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = prev;
}

// ───────────────────────── Particles & effects ─────────────────────────
const MAX_PARTICLES = 2400;
const Fx = {
  parts: [],
  texts: [],
  bolts: [],
  shakeAmt: 0,
  flashA: 0,
  flashColor: '#ffffff',

  clear() { this.parts.length = 0; this.texts.length = 0; this.bolts.length = 0; this.shakeAmt = 0; this.flashA = 0; },

  add(p) {
    if (this.parts.length >= MAX_PARTICLES) return;
    p.max = p.life;
    if (p.drag === undefined) p.drag = 0;
    this.parts.push(p);
  },

  spark(x, y, ang, spd, color, life = 0.4, size = 2) {
    this.add({ t: 'spark', x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life, size, color, drag: 3.5 });
  },

  sparks(x, y, ang, spread, n, color, spd = 300) {
    for (let i = 0; i < n; i++) {
      this.spark(x, y, ang + rand(-spread, spread), spd * rand(0.4, 1.2), Math.random() < 0.3 ? '#ffffff' : color, rand(0.15, 0.4), rand(1.2, 2.4));
    }
  },

  muzzle(x, y, ang, color) {
    this.add({ t: 'glow', x, y, vx: 0, vy: 0, life: 0.07, size: 22, color });
    for (let i = 0; i < 3; i++) this.spark(x, y, ang + rand(-0.4, 0.4), rand(150, 380), color, 0.12, 1.5);
  },

  trail(x, y, color, size = 8, life = 0.25) {
    this.add({ t: 'glow', x, y, vx: 0, vy: 0, life, size, color, shrink: true });
  },

  smoke(x, y, size = 12, life = 0.8, vx = 0, vy = 0) {
    this.add({ t: 'smoke', x, y, vx, vy, life, size, drag: 2 });
  },

  ring(x, y, color, r, life = 0.35, width = 3) {
    this.add({ t: 'ring', x, y, vx: 0, vy: 0, life, size: r, color, width });
  },

  explosion(x, y, color, scale = 1) {
    this.add({ t: 'glow', x, y, vx: 0, vy: 0, life: 0.2, size: 70 * scale, color: '#ffffff' });
    this.add({ t: 'glow', x, y, vx: 0, vy: 0, life: 0.5, size: 110 * scale, color });
    const n = Math.round(16 * scale);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      this.spark(x, y, a, rand(160, 520) * Math.sqrt(scale), Math.random() < 0.35 ? '#fff6d0' : color, rand(0.25, 0.6), rand(1.5, 3));
    }
    for (let i = 0; i < Math.round(9 * scale); i++) {
      const a = rand(0, TAU), s = rand(20, 170) * Math.sqrt(scale);
      this.add({ t: 'glow', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.35, 0.8), size: rand(14, 30) * scale, color: pick(['#ffb347', '#ff6a3d', color]), drag: 3, shrink: true });
    }
    for (let i = 0; i < Math.round(6 * scale); i++) {
      const a = rand(0, TAU), s = rand(10, 90);
      this.smoke(x + rand(-10, 10), y + rand(-10, 10), rand(10, 22) * scale, rand(0.8, 1.5), Math.cos(a) * s, Math.sin(a) * s);
    }
    for (let i = 0; i < Math.round(6 * scale); i++) {
      const a = rand(0, TAU), s = rand(120, 380);
      this.add({ t: 'shard', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1.1), size: rand(3, 7) * Math.sqrt(scale), color, drag: 2.5, rot: rand(0, TAU), vr: rand(-14, 14) });
    }
    this.ring(x, y, color, 70 * scale, 0.4, 3);
    this.add({ t: 'scorch', x, y, vx: 0, vy: 0, life: 6, size: 26 * scale });
  },

  text(x, y, str, color, size = 16) {
    this.texts.push({ x, y, str, color, size, life: 1.1, max: 1.1, vy: -45 });
  },

  bolt(x1, y1, x2, y2, color, life = 0.16) {
    const pts = [[x1, y1]];
    const segs = Math.max(3, Math.floor(dist(x1, y1, x2, y2) / 18));
    const nx = -(y2 - y1), ny = x2 - x1, nl = Math.hypot(nx, ny) || 1;
    for (let i = 1; i < segs; i++) {
      const t = i / segs, off = rand(-14, 14);
      pts.push([lerp(x1, x2, t) + (nx / nl) * off, lerp(y1, y2, t) + (ny / nl) * off]);
    }
    pts.push([x2, y2]);
    this.bolts.push({ pts, color, life, max: life });
  },

  shake(a) { this.shakeAmt = Math.min(26, this.shakeAmt + a); },
  flash(color, a) { this.flashColor = color; this.flashA = Math.max(this.flashA, a); },

  update(dt) {
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
      if (p.grav) p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.vr) p.rot += p.vr * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt; t.y += t.vy * dt; t.vy *= Math.exp(-2 * dt);
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      if ((this.bolts[i].life -= dt) <= 0) this.bolts.splice(i, 1);
    }
    this.shakeAmt *= Math.pow(0.002, dt);
    if (this.shakeAmt < 0.1) this.shakeAmt = 0;
    this.flashA = Math.max(0, this.flashA - dt * 2.2);
  },

  // Ground-level effects (normal blending)
  drawUnder(ctx) {
    for (const p of this.parts) {
      const k = p.life / p.max;
      if (p.t === 'scorch') {
        ctx.globalAlpha = Math.min(1, k * 2) * 0.35;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      } else if (p.t === 'smoke') {
        ctx.globalAlpha = k * 0.45;
        ctx.fillStyle = '#2a2d38';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.8 - k * 0.8), 0, TAU); ctx.fill();
      } else if (p.t === 'shard') {
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = '#1b1d26'; ctx.strokeStyle = p.color; ctx.lineWidth = 1;
        ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
        ctx.strokeRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  },

  // Light-emitting effects (additive blending)
  drawOver(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of this.parts) {
      const k = p.life / p.max;
      if (p.t === 'glow') {
        const r = p.size * (p.shrink ? 0.3 + 0.7 * k : 1);
        ctx.globalAlpha = Math.min(1, k * 1.4);
        ctx.drawImage(Glow.get(p.color), p.x - r, p.y - r, r * 2, r * 2);
      } else if (p.t === 'spark') {
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke();
      } else if (p.t === 'ring') {
        const e = 1 - k;
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width * k + 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - Math.pow(1 - e, 3)), 0, TAU); ctx.stroke();
      }
    }
    for (const b of this.bolts) {
      const k = b.life / b.max;
      for (const [w, c, a] of [[6, b.color, 0.35], [2, '#ffffff', 1]]) {
        ctx.globalAlpha = k * a; ctx.strokeStyle = c; ctx.lineWidth = w;
        ctx.beginPath();
        b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },

  drawTexts(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.life / t.max;
      ctx.globalAlpha = Math.min(1, k * 2.5);
      ctx.font = `700 ${t.size}px Rajdhani, sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  },
};

// ───────────────────────── Screen-space ambient particles ─────────────────────────
const Ambient = {
  list: [],
  type: 'dust',
  color: '#ffffff',
  init(type, color, W, H) {
    this.type = type; this.color = color; this.list = [];
    const n = type === 'data' ? 70 : 90;
    for (let i = 0; i < n; i++) this.list.push({ x: rand(0, W), y: rand(0, H), z: rand(0.3, 1), s: rand(0.8, 2.6), v: rand(10, 40), ph: rand(0, TAU) });
  },
  update(dt, W, H, time) {
    for (const p of this.list) {
      switch (this.type) {
        case 'embers': p.y -= p.v * 1.6 * p.z * dt; p.x += Math.sin(time * 1.5 + p.ph) * 18 * dt; break;
        case 'snow': p.y += p.v * 1.4 * p.z * dt; p.x += Math.sin(time + p.ph) * 22 * dt; break;
        case 'data': p.y += p.v * 3.5 * p.z * dt; break;
        default: p.x += Math.cos(time * 0.3 + p.ph) * 6 * dt + 4 * dt; p.y += Math.sin(time * 0.4 + p.ph) * 6 * dt;
      }
      if (p.y < -20) p.y += H + 40;
      if (p.y > H + 20) p.y -= H + 40;
      if (p.x < -20) p.x += W + 40;
      if (p.x > W + 20) p.x -= W + 40;
    }
  },
  draw(ctx, camx, camy, W, H, time) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      const sx = (((p.x - camx * 0.25 * p.z) % (W + 40)) + W + 40) % (W + 40) - 20;
      const sy = (((p.y - camy * 0.25 * p.z) % (H + 40)) + H + 40) % (H + 40) - 20;
      const tw = 0.5 + 0.5 * Math.sin(time * 2 + p.ph);
      switch (this.type) {
        case 'embers':
          ctx.globalAlpha = 0.5 + 0.5 * tw;
          ctx.drawImage(Glow.get('#ff7a2a'), sx - p.s * 4, sy - p.s * 4, p.s * 8, p.s * 8);
          break;
        case 'snow':
          ctx.globalAlpha = 0.35 * p.z + 0.1;
          ctx.fillStyle = '#dff6ff';
          ctx.beginPath(); ctx.arc(sx, sy, p.s * p.z * 1.2, 0, TAU); ctx.fill();
          break;
        case 'data':
          ctx.globalAlpha = 0.25 * p.z * (0.4 + tw);
          ctx.fillStyle = this.color;
          ctx.fillRect(sx, sy, 2, 8 + p.s * 6);
          break;
        default:
          ctx.globalAlpha = 0.15 + 0.25 * tw * p.z;
          ctx.fillStyle = this.color;
          ctx.fillRect(sx, sy, p.s, p.s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },
};
