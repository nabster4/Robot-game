'use strict';
// 2D vector icons (parts, companions, upgrades) for the workshop and HUD.
// Same art as the 2D Scrapforge game so both versions share a visual language.

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function poly(ctx, pts, s = 1) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
  ctx.closePath();
}
function regPoly(ctx, n, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}
const _glowCache = new Map();
function glow(ctx, x, y, r, color, a = 1) {
  let c = _glowCache.get(color);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const col = rgb(color);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, `rgba(${col},1)`); grd.addColorStop(0.2, `rgba(${col},0.6)`);
    grd.addColorStop(0.55, `rgba(${col},0.14)`); grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64); _glowCache.set(color, c);
  }
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(c, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = prev;
}


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


// Skyrider & Scrap Sprite icons for the workshop
const vehIconURL = () => iconURL('v_skyrider', 64, (g, s) => {
  glow(g, s / 2, s / 2, s * 0.5, '#ffb347', 0.35);
  g.save(); g.translate(s / 2, s / 2); g.rotate(-Math.PI / 4);
  g.fillStyle = '#2c3e52'; g.strokeStyle = '#ffb347'; g.lineWidth = 2; g.lineJoin = 'round';
  poly(g, [[0, -1], [0.18, -0.2], [0.95, 0.25], [0.95, 0.4], [0.18, 0.3], [0.14, 0.75], [0.4, 0.95], [-0.4, 0.95], [-0.14, 0.75], [-0.18, 0.3], [-0.95, 0.4], [-0.95, 0.25], [-0.18, -0.2]], s * 0.36);
  g.fill(); g.stroke();
  g.fillStyle = '#3cf2ff'; g.beginPath(); g.ellipse(0, -s * 0.12, s * 0.05, s * 0.1, 0, 0, TAU); g.fill();
  g.restore();
});
const spriteIconURL = () => iconURL('sprite', 48, (g, s) => {
  glow(g, s / 2, s / 2, s * 0.5, '#3aff9a', 0.5);
  g.fillStyle = '#2a4a3a'; g.strokeStyle = '#3aff9a'; g.lineWidth = 2;
  g.beginPath(); g.arc(s / 2, s * 0.58, s * 0.2, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(s * 0.44, s * 0.56, 2, 0, TAU); g.arc(s * 0.56, s * 0.56, 2, 0, TAU); g.fill();
  g.fillStyle = '#3aff9a'; g.beginPath(); g.ellipse(s * 0.58, s * 0.28, s * 0.12, s * 0.05, -0.4, 0, TAU); g.fill();
  g.strokeStyle = '#3aff9a'; g.beginPath(); g.moveTo(s / 2, s * 0.38); g.lineTo(s * 0.52, s * 0.3); g.stroke();
});
