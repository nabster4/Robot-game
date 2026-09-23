'use strict';
// Procedural vector art shared by the game world and the workshop UI.

function drawPartIcon(ctx, type, x, y, s, t = 0) {
  const c = PARTS[type].color;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.2, s * 0.14);
  ctx.strokeStyle = c;
  switch (type) {
    case 'scrap': {
      ctx.rotate(0.3);
      poly(ctx, [[-1, -0.55], [0.45, -0.9], [1, -0.15], [0.75, 0.8], [-0.35, 0.9], [-0.95, 0.35]], s);
      ctx.fillStyle = '#394457'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = c;
      for (const [px, py] of [[-0.5, -0.3], [0.45, -0.35], [0.3, 0.45], [-0.45, 0.4]]) {
        ctx.beginPath(); ctx.arc(px * s, py * s, s * 0.11, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'wire': {
      ctx.fillStyle = '#3a220e';
      roundRect(ctx, -s * 0.95, -s * 0.55, s * 1.9, s * 1.1, s * 0.3); ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const cx = -s * 0.6 + i * s * 0.4;
        ctx.moveTo(cx + s * 0.18, -s * 0.5);
        ctx.ellipse(cx, 0, s * 0.18, s * 0.5, 0, -Math.PI / 2, Math.PI * 1.5);
      }
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s * 1.2, s * 0.4); ctx.moveTo(s, 0); ctx.lineTo(s * 1.2, -s * 0.4); ctx.stroke();
      break;
    }
    case 'servo': {
      ctx.rotate(t * 1.5);
      ctx.beginPath();
      const teeth = 8;
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * TAU;
        const r = i % 2 ? s * 0.72 : s * 0.98;
        const a2 = a + TAU / (teeth * 2);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
      }
      ctx.closePath();
      ctx.fillStyle = '#10364a'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.32, 0, TAU); ctx.fillStyle = c; ctx.fill();
      break;
    }
    case 'circuit': {
      ctx.fillStyle = '#0b3a2d';
      roundRect(ctx, -s * 0.9, -s * 0.9, s * 1.8, s * 1.8, s * 0.2); ctx.fill(); ctx.stroke();
      ctx.lineWidth = Math.max(1, s * 0.08);
      ctx.beginPath();
      ctx.moveTo(-s * 0.9, -s * 0.4); ctx.lineTo(-s * 0.35, -s * 0.4);
      ctx.moveTo(s * 0.9, s * 0.45); ctx.lineTo(s * 0.35, s * 0.45);
      ctx.moveTo(-s * 0.2, s * 0.9); ctx.lineTo(-s * 0.2, s * 0.35);
      ctx.moveTo(s * 0.2, -s * 0.9); ctx.lineTo(s * 0.2, -s * 0.35);
      ctx.stroke();
      ctx.fillStyle = c;
      ctx.fillRect(-s * 0.35, -s * 0.35, s * 0.7, s * 0.7);
      break;
    }
    case 'lens': {
      const g = ctx.createLinearGradient(-s, -s, s, s);
      g.addColorStop(0, '#ffd6f7'); g.addColorStop(0.5, c); g.addColorStop(1, '#4a1742');
      poly(ctx, [[0, -1.05], [0.8, -0.2], [0.5, 0.95], [-0.5, 0.95], [-0.8, -0.2]], s);
      ctx.fillStyle = g; ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(1, s * 0.08);
      ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.3); ctx.lineTo(0, -s * 0.7); ctx.stroke();
      break;
    }
    case 'core': {
      regPoly(ctx, 6, s, Math.PI / 6);
      ctx.fillStyle = '#3a2e0a'; ctx.fill(); ctx.stroke();
      const pulse = 0.75 + 0.25 * Math.sin(t * 5);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.6);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, c); g.addColorStop(1, 'rgba(254,202,87,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.6 * pulse, 0, TAU); ctx.fill();
      break;
    }
    case 'quantum': {
      ctx.rotate(t);
      ctx.fillStyle = '#23103a';
      ctx.fillRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6);
      ctx.strokeRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6);
      ctx.rotate(-t * 2.5 + Math.PI / 4);
      ctx.fillStyle = c;
      ctx.fillRect(-s * 0.38, -s * 0.38, s * 0.76, s * 0.76);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-s * 0.12, -s * 0.12, s * 0.24, s * 0.24);
      break;
    }
  }
  ctx.restore();
}

// Companion robots. `aim` is the turret/eye direction.
function drawCompanionShape(ctx, kind, x, y, s, t, aim, offline = false) {
  const d = COMP_DEFS[kind];
  const c = offline ? '#55606e' : d.color;
  const body = '#0c1f1a';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2;
  ctx.strokeStyle = c;
  ctx.fillStyle = body;
  switch (kind) {
    case 'gunner': {
      // rotor arms
      for (const sgn of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sgn * 13, -6); ctx.stroke();
        ctx.save(); ctx.translate(sgn * 13, -6);
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.ellipse(0, 0, 7, 2.2, t * 30 * sgn, 0, TAU); ctx.fillStyle = c; ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = body;
      ctx.rotate(aim);
      ctx.fillRect(4, -2.5, 12, 5); ctx.strokeRect(4, -2.5, 12, 5);
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(3, 0, 3, 0, TAU); ctx.fill();
      break;
    }
    case 'medic': {
      ctx.rotate(Math.sin(t * 2) * 0.2);
      roundRect(ctx, -11, -11, 22, 22, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c;
      ctx.fillRect(-2.5, -7, 5, 14); ctx.fillRect(-7, -2.5, 14, 5);
      ctx.beginPath(); ctx.arc(0, -15, 2.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, -13); ctx.stroke();
      break;
    }
    case 'shield': {
      ctx.rotate(t * 2);
      regPoly(ctx, 6, 13, 0); ctx.fill(); ctx.stroke();
      ctx.rotate(-t * 4);
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(0, 0, 18, i * TAU / 3, i * TAU / 3 + 1.2); ctx.stroke();
      }
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
      break;
    }
    case 'tesla': {
      ctx.beginPath(); ctx.arc(0, 2, 10, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillRect(-3, -16, 6, 10); ctx.strokeRect(-3, -16, 6, 10);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, -13 + i * 3.5, 6, 1.6, 0, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = offline ? c : '#ffffff';
      ctx.beginPath(); ctx.arc(0, -19, 3.2, 0, TAU); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 3, 3.5, 0, TAU); ctx.fill();
      break;
    }
    case 'rocket': {
      // legs
      const step = Math.sin(t * 8) * 3;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-6, 6); ctx.lineTo(-9, 15 + step); ctx.moveTo(6, 6); ctx.lineTo(9, 15 - step); ctx.stroke();
      ctx.lineWidth = 2;
      roundRect(ctx, -11, -9, 22, 16, 4); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.rotate(aim * 0.15);
      for (const sgn of [-1, 1]) {
        ctx.fillStyle = body;
        roundRect(ctx, sgn * 13 - 5, -13, 10, 14, 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(sgn * 13, -9, 1.8, 0, TAU); ctx.arc(sgn * 13, -4, 1.8, 0, TAU); ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = c; ctx.fillRect(-6, -4, 12, 3);
      break;
    }
    case 'laser': {
      ctx.rotate(aim);
      poly(ctx, [[1.3, 0], [0, -0.8], [-1, 0], [0, 0.8]], 13); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, -12); ctx.lineTo(-2, -6); ctx.moveTo(-8, 12); ctx.lineTo(-2, 6); ctx.stroke();
      const g = ctx.createRadialGradient(4, 0, 0, 4, 0, 6);
      g.addColorStop(0, '#fff'); g.addColorStop(1, c);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(4, 0, 5, 0, TAU); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawUpgradeIcon(ctx, id, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color; ctx.fillStyle = rgba(color, 0.2);
  ctx.lineWidth = s * 0.12; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (id) {
    case 'armor':
      poly(ctx, [[0, -1], [0.85, -0.6], [0.7, 0.4], [0, 1], [-0.7, 0.4], [-0.85, -0.6]], s); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -0.5 * s); ctx.lineTo(0, 0.5 * s); ctx.moveTo(-0.4 * s, 0); ctx.lineTo(0.4 * s, 0); ctx.stroke();
      break;
    case 'overclock':
      poly(ctx, [[0.2, -1], [-0.6, 0.15], [-0.05, 0.15], [-0.2, 1], [0.6, -0.15], [0.05, -0.15]], s); ctx.fill(); ctx.stroke();
      break;
    case 'split':
      ctx.beginPath();
      for (const a of [-0.45, 0, 0.45]) { ctx.moveTo(-0.8 * s, 0.6 * s); ctx.lineTo(-0.8 * s + Math.cos(a - 0.6) * 1.8 * s, 0.6 * s + Math.sin(a - 0.6) * 1.8 * s); }
      ctx.stroke();
      break;
    case 'thruster':
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo((-0.8 + i * 0.55) * s, -0.7 * s); ctx.lineTo((-0.3 + i * 0.55) * s, 0); ctx.lineTo((-0.8 + i * 0.55) * s, 0.7 * s); ctx.stroke();
      }
      break;
    case 'magnet':
      ctx.lineWidth = s * 0.3;
      ctx.beginPath(); ctx.arc(0, -0.05 * s, 0.6 * s, Math.PI, 0, true); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.6 * s, -0.05 * s); ctx.lineTo(-0.6 * s, -0.7 * s); ctx.moveTo(0.6 * s, -0.05 * s); ctx.lineTo(0.6 * s, -0.7 * s); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.3;
      ctx.beginPath(); ctx.moveTo(-0.6 * s, -0.7 * s); ctx.lineTo(-0.6 * s, -0.95 * s); ctx.moveTo(0.6 * s, -0.7 * s); ctx.lineTo(0.6 * s, -0.95 * s); ctx.stroke();
      break;
    case 'firmware':
      ctx.fillRect(-0.6 * s, -0.6 * s, 1.2 * s, 1.2 * s); ctx.strokeRect(-0.6 * s, -0.6 * s, 1.2 * s, 1.2 * s);
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(i * 0.35 * s, -0.6 * s); ctx.lineTo(i * 0.35 * s, -0.95 * s);
        ctx.moveTo(i * 0.35 * s, 0.6 * s); ctx.lineTo(i * 0.35 * s, 0.95 * s);
      }
      ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(-0.25 * s, -0.25 * s, 0.5 * s, 0.5 * s);
      break;
    case 'slot':
      ctx.beginPath(); ctx.arc(0, 0, 0.85 * s, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -0.45 * s); ctx.lineTo(0, 0.45 * s); ctx.moveTo(-0.45 * s, 0); ctx.lineTo(0.45 * s, 0); ctx.stroke();
      break;
    case 'repair':
      roundRect(ctx, -0.9 * s, -0.6 * s, 1.8 * s, 1.3 * s, 0.2 * s); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.3 * s, -0.6 * s); ctx.lineTo(-0.3 * s, -0.85 * s); ctx.lineTo(0.3 * s, -0.85 * s); ctx.lineTo(0.3 * s, -0.6 * s); ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(-0.12 * s, -0.35 * s, 0.24 * s, 0.8 * s); ctx.fillRect(-0.4 * s, -0.07 * s, 0.8 * s, 0.24 * s);
      break;
    case 'cell':
      roundRect(ctx, -0.45 * s, -0.8 * s, 0.9 * s, 1.7 * s, 0.2 * s); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(-0.2 * s, -1 * s, 0.4 * s, 0.2 * s);
      ctx.fillRect(-0.28 * s, 0.1 * s, 0.56 * s, 0.6 * s);
      break;
  }
  ctx.restore();
}

// Renders an icon to an offscreen canvas and caches a data URL for DOM use.
const IconCache = {};
function iconURL(key, size, drawFn) {
  if (IconCache[key]) return IconCache[key];
  const c = document.createElement('canvas');
  c.width = c.height = size * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  drawFn(g, size);
  return (IconCache[key] = c.toDataURL());
}
const partIconURL = (type) => iconURL('p_' + type, 48, (g, s) => { glow(g, s / 2, s / 2, s * 0.6, PARTS[type].color, 0.45); drawPartIcon(g, type, s / 2, s / 2, s * 0.3, 0.4); });
const compIconURL = (kind) => iconURL('c_' + kind, 64, (g, s) => { glow(g, s / 2, s / 2, s * 0.55, COMP_DEFS[kind].color, 0.5); drawCompanionShape(g, kind, s / 2, s / 2 + 2, 1.35, 0.3, -Math.PI / 4); });
const upgIconURL = (id, color) => iconURL('u_' + id, 64, (g, s) => { glow(g, s / 2, s / 2, s * 0.5, color, 0.35); drawUpgradeIcon(g, id, s / 2, s / 2, s * 0.28, color); });

// ───────────────────────── Arena background ─────────────────────────
function buildBackground(theme, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const lights = [];

  // base
  const grd = g.createRadialGradient(w / 2, h / 2, 100, w / 2, h / 2, Math.max(w, h) * 0.7);
  grd.addColorStop(0, theme.bg2); grd.addColorStop(1, theme.bg1);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);

  // floor panels with subtle variation
  const T = 80;
  for (let y = 0; y < h; y += T) {
    for (let x = 0; x < w; x += T) {
      const v = Math.random();
      if (v < 0.35) { g.fillStyle = `rgba(255,255,255,${rand(0.008, 0.025)})`; g.fillRect(x + 2, y + 2, T - 4, T - 4); }
      else if (v < 0.45) { g.fillStyle = `rgba(0,0,0,${rand(0.08, 0.18)})`; g.fillRect(x + 2, y + 2, T - 4, T - 4); }
      if (Math.random() < 0.05) {
        // floor grate
        g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
        for (let i = 10; i < T - 6; i += 8) { g.beginPath(); g.moveTo(x + i, y + 10); g.lineTo(x + i, y + T - 10); g.stroke(); }
      }
    }
  }

  // grid
  g.strokeStyle = rgba(theme.grid, 0.55); g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= w; x += T) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); }
  for (let y = 0; y <= h; y += T) { g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); }
  g.stroke();
  g.strokeStyle = rgba(theme.grid, 0.9); g.lineWidth = 2;
  g.beginPath();
  for (let x = 0; x <= w; x += T * 4) { g.moveTo(x, 0); g.lineTo(x, h); }
  for (let y = 0; y <= h; y += T * 4) { g.moveTo(0, y); g.lineTo(w, y); }
  g.stroke();
  // rivets at major intersections
  g.fillStyle = rgba(theme.accent, 0.35);
  for (let x = 0; x <= w; x += T * 4) for (let y = 0; y <= h; y += T * 4) { g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); }

  // scorch & oil stains
  for (let i = 0; i < 40; i++) {
    const x = rand(0, w), y = rand(0, h), r = rand(30, 120);
    const sg = g.createRadialGradient(x, y, 0, x, y, r);
    sg.addColorStop(0, 'rgba(0,0,0,0.35)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }

  // glowing conduit lines
  g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const horiz = Math.random() < 0.5;
    let x = Math.round(rand(2, w / T - 2)) * T, y = Math.round(rand(2, h / T - 2)) * T;
    const len = randi(4, 12) * T;
    const x2 = horiz ? Math.min(w - T, x + len) : x, y2 = horiz ? y : Math.min(h - T, y + len);
    g.strokeStyle = rgba(theme.accent, 0.12); g.lineWidth = 10;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = rgba(theme.accent, 0.5); g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    lights.push({ x, y, r: 26, color: theme.light, ph: rand(0, TAU) }, { x: x2, y: y2, r: 26, color: theme.light, ph: rand(0, TAU) });
  }

  // vents / light pads
  for (let i = 0; i < 26; i++) {
    const x = Math.round(rand(1, w / T - 1)) * T + T / 2, y = Math.round(rand(1, h / T - 1)) * T + T / 2;
    g.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(g, x - 22, y - 12, 44, 24, 5); g.fill();
    g.strokeStyle = rgba(theme.accent, 0.4); g.lineWidth = 1.5; g.stroke();
    g.fillStyle = rgba(theme.light, 0.5);
    for (let k = -14; k <= 14; k += 7) g.fillRect(x + k - 1.5, y - 6, 3, 12);
    lights.push({ x, y, r: 60, color: theme.light, ph: rand(0, TAU), soft: true });
  }

  // debris clutter
  for (let i = 0; i < 70; i++) {
    const x = rand(0, w), y = rand(0, h), s = rand(4, 14);
    g.save(); g.translate(x, y); g.rotate(rand(0, TAU));
    g.fillStyle = 'rgba(20,24,34,0.9)'; g.strokeStyle = 'rgba(160,170,190,0.18)'; g.lineWidth = 1;
    g.fillRect(-s, -s * 0.4, s * 2, s * 0.8); g.strokeRect(-s, -s * 0.4, s * 2, s * 0.8);
    g.restore();
  }

  // hazard border
  const B = 26;
  g.save();
  g.beginPath(); g.rect(0, 0, w, h); g.rect(B, B, w - B * 2, h - B * 2); g.clip('evenodd');
  g.fillStyle = '#0b0b0f'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,196,0,0.55)'; g.lineWidth = 9;
  g.beginPath();
  for (let k = -h; k < w + h; k += 28) { g.moveTo(k, 0); g.lineTo(k + h, h); }
  g.stroke();
  g.restore();
  g.strokeStyle = theme.accent; g.lineWidth = 2;
  g.shadowColor = theme.accent; g.shadowBlur = 16;
  g.strokeRect(B, B, w - B * 2, h - B * 2);
  g.shadowBlur = 0;

  return { canvas: c, lights };
}
