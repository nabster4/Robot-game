'use strict';
// ═════════════════════════ PLAYER ═════════════════════════
class Player {
  constructor() {
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.r = 15;
    this.hp = 100;
    this.angle = 0;
    this.fireCd = 0;
    this.dashCd = 0; this.dashT = 0; this.dashDx = 0; this.dashDy = 0;
    this.invuln = 0;
    this.energy = 100;
    this.dead = false;
    this.recoil = 0;
    this.walk = 0;
    this.moveAng = 0;
  }
  get maxHp() { return 100 + 25 * G.up.armor; }
  get fireRate() { return 6 * Math.pow(1.2, G.up.overclock); }
  get speed() { return 270 * (1 + 0.1 * G.up.thruster); }
  get dashMax() { return 1.1 * Math.pow(0.72, G.up.thruster); }
  get magnet() { return 150 + 100 * G.up.magnet; }

  update(dt) {
    const I = Input;
    let mx = (I.key('KeyD') || I.key('ArrowRight') ? 1 : 0) - (I.key('KeyA') || I.key('ArrowLeft') ? 1 : 0);
    let my = (I.key('KeyS') || I.key('ArrowDown') ? 1 : 0) - (I.key('KeyW') || I.key('ArrowUp') ? 1 : 0);
    const ml = Math.hypot(mx, my);
    if (ml) { mx /= ml; my /= ml; this.moveAng = Math.atan2(my, mx); }

    const wx = I.mouse.x + G.cam.x, wy = I.mouse.y + G.cam.y;
    this.angle = Math.atan2(wy - this.y, wx - this.x);

    // dash
    this.dashCd -= dt;
    if ((I.hit('Space') || I.hit('ShiftLeft') || I.hit('ShiftRight')) && this.dashCd <= 0) {
      const a = ml ? this.moveAng : this.angle;
      this.dashDx = Math.cos(a); this.dashDy = Math.sin(a);
      this.dashT = 0.17; this.dashCd = this.dashMax;
      this.invuln = Math.max(this.invuln, 0.28);
      Sound.play('dash');
      Fx.ring(this.x, this.y, '#3cf2ff', 40, 0.3, 2);
    }
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.dashDx * 980; this.vy = this.dashDy * 980;
      Fx.trail(this.x + rand(-4, 4), this.y + rand(-4, 4), '#3cf2ff', 22, 0.3);
    } else {
      const k = 1 - Math.exp(-12 * dt);
      this.vx += (mx * this.speed - this.vx) * k;
      this.vy += (my * this.speed - this.vy) * k;
    }
    this.x = clamp(this.x + this.vx * dt, 30 + this.r, G.arena.w - 30 - this.r);
    this.y = clamp(this.y + this.vy * dt, 30 + this.r, G.arena.h - 30 - this.r);
    this.walk += Math.hypot(this.vx, this.vy) * dt * 0.05;

    if (ml && Math.random() < 0.5) {
      const bx = this.x - Math.cos(this.moveAng) * 14, by = this.y - Math.sin(this.moveAng) * 14;
      Fx.trail(bx, by, '#2a9dff', 10, 0.2);
    }

    this.invuln -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 10);
    this.energy = Math.min(100, this.energy + 13 * dt);

    this.fireCd -= dt;
    if (I.mouse.down && this.fireCd <= 0) {
      this.fireCd += 1 / this.fireRate;
      if (this.fireCd < 0) this.fireCd = 0;
      this.shoot();
    }
    if (this.fireCd < 0) this.fireCd = 0;

    if (I.mouse.rightPressed || I.hit('KeyE')) {
      if (this.energy < 100 && G.cells > 0) { G.cells--; this.energy = 100; Fx.text(this.x, this.y - 30, 'PLASMA CELL', '#b98cff', 15); }
      if (this.energy >= 100) this.throwBomb(wx, wy);
      else Sound.play('deny');
    }
    if (I.hit('KeyQ')) this.useRepair();
  }

  shoot() {
    const n = 1 + G.up.split;
    const spread = 0.13;
    const mx = this.x + Math.cos(this.angle) * 24, my = this.y + Math.sin(this.angle) * 24;
    for (let i = 0; i < n; i++) {
      const a = this.angle + (i - (n - 1) / 2) * spread + rand(-0.025, 0.025);
      G.bullets.push({ x: mx, y: my, vx: Math.cos(a) * 960, vy: Math.sin(a) * 960, r: 4, dmg: 10, life: 0.85, color: '#3cf2ff', kind: 'bolt' });
    }
    Fx.muzzle(mx, my, this.angle, '#3cf2ff');
    this.recoil = 1;
    Sound.play('shoot');
  }

  throwBomb(tx, ty) {
    const d = Math.min(420, dist(this.x, this.y, tx, ty));
    const a = this.angle;
    this.energy = 0;
    G.bullets.push({ kind: 'bomb', x: this.x, y: this.y, sx: this.x, sy: this.y, tx: this.x + Math.cos(a) * d, ty: this.y + Math.sin(a) * d, t: 0, flight: 0.45, r: 8, dmg: 0, life: 5, color: '#b98cff' });
    Sound.play('throw');
  }

  useRepair() {
    if (G.repairKits <= 0) { Fx.text(this.x, this.y - 30, 'NO REPAIR KITS', '#ff6b6b', 14); Sound.play('deny'); return; }
    if (this.hp >= this.maxHp) { Fx.text(this.x, this.y - 30, 'HULL FULL', '#9fb3c8', 14); return; }
    G.repairKits--;
    this.hp = Math.min(this.maxHp, this.hp + 40);
    Fx.text(this.x, this.y - 30, '+40 HULL', '#6bff9e', 18);
    Fx.ring(this.x, this.y, '#6bff9e', 60, 0.5, 3);
    for (let i = 0; i < 16; i++) Fx.add({ t: 'glow', x: this.x + rand(-20, 20), y: this.y + rand(-10, 20), vx: 0, vy: rand(-80, -30), life: rand(0.4, 0.8), size: 8, color: '#6bff9e', shrink: true });
    Sound.play('heal');
  }

  heal(v) { this.hp = Math.min(this.maxHp, this.hp + v); }

  hurt(dmg) {
    if (this.invuln > 0 || this.dead || G.levelDone) return;
    this.hp -= dmg;
    this.invuln = 0.55;
    Fx.shake(9);
    Fx.flash('#ff2244', 0.3);
    Fx.sparks(this.x, this.y, rand(0, TAU), Math.PI, 12, '#ff5577', 320);
    Sound.play('hurt');
    G.stats.damageTaken += dmg;
    if (this.hp <= 0) { this.hp = 0; G.playerDied(); }
  }

  draw(ctx) {
    if (this.dead) return;
    const { x, y } = this;
    const c = '#3cf2ff';
    const blink = this.invuln > 0 && this.dashT <= 0 && Math.floor(G.time * 22) % 2 === 0;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x + 3, y + 12, 19, 9, 0, 0, TAU); ctx.fill();

    glow(ctx, x, y, 60, c, 0.28);
    ctx.save();
    ctx.globalAlpha = blink ? 0.45 : 1;
    ctx.translate(x, y);

    // legs / treads follow movement
    ctx.save();
    ctx.rotate(this.moveAng);
    const st = Math.sin(this.walk) * 3;
    ctx.fillStyle = '#0b1b28'; ctx.strokeStyle = '#1f6f8a'; ctx.lineWidth = 1.5;
    roundRect(ctx, -10 + st, -17, 20, 7, 3); ctx.fill(); ctx.stroke();
    roundRect(ctx, -10 - st, 10, 20, 7, 3); ctx.fill(); ctx.stroke();
    ctx.restore();

    ctx.rotate(this.angle);
    const rc = -this.recoil * 3;
    // guns
    const n = 1 + G.up.split;
    ctx.fillStyle = '#12303f'; ctx.strokeStyle = c; ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      const oy = (i - (n - 1) / 2) * 7;
      ctx.fillRect(6 + rc, oy - 2.5, 20, 5); ctx.strokeRect(6 + rc, oy - 2.5, 20, 5);
    }
    // shoulders
    ctx.fillStyle = '#0f2736';
    for (const sgn of [-1, 1]) {
      poly(ctx, [[-0.4, sgn * 0.7], [0.5, sgn * 0.75], [0.35, sgn * 1.2], [-0.6, sgn * 1.15]], 14);
      ctx.fill(); ctx.stroke();
    }
    // body
    const bg = ctx.createLinearGradient(-14, -14, 14, 14);
    bg.addColorStop(0, '#1e4d63'); bg.addColorStop(1, '#0a1c28');
    ctx.fillStyle = bg; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill(); ctx.stroke();
    // visor
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(0, 0, 9, -0.6, 0.6); ctx.arc(0, 0, 4, 0.6, -0.6, true); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(7, 0, 1.6, 0, TAU); ctx.fill();
    ctx.restore();
    glow(ctx, x + Math.cos(this.angle) * 7, y + Math.sin(this.angle) * 7, 14, c, 0.8);
  }
}

// ═════════════════════════ ENEMIES ═════════════════════════
class Enemy {
  constructor(type, x, y, elite = false) {
    const d = ENEMY_TYPES[type];
    const L = G.level;
    this.type = type; this.d = d; this.ai = d.ai;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.elite = elite;
    this.r = d.r * (elite ? 1.2 : 1);
    this.maxHp = this.hp = d.hp * (1 + 0.28 * L) * (elite ? 2.4 : 1);
    this.speed = d.speed * (1 + 0.05 * L) * rand(0.9, 1.1);
    this.dmg = d.dmg * (1 + 0.15 * L) * (elite ? 1.3 : 1);
    this.t = rand(0, 10);
    this.cd = rand(0.6, 1.4) * (d.fireCd || 1);
    this.state = 'move'; this.stateT = 0;
    this.flash = 0;
    this.angle = 0; this.facing = Math.atan2(G.player.y - y, G.player.x - x);
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.contactCd = 0;
    this.burst = 0;
    this.dead = false;
  }

  fire(a, spd, r = 5, color) {
    const bx = this.x + Math.cos(a) * this.r, by = this.y + Math.sin(a) * this.r;
    G.ebullets.push({ x: bx, y: by, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r, dmg: this.dmg, life: 4, color: color || this.d.color });
    Fx.muzzle(bx, by, a, this.d.color);
  }

  update(dt) {
    const p = G.player;
    const dx = p.x - this.x, dy = p.y - this.y;
    const dd = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    const ux = dx / dd, uy = dy / dd;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 7);
    this.contactCd -= dt;
    this.cd -= dt;
    let tx = 0, ty = 0;
    const S = this.speed;

    switch (this.ai) {
      case 'chase': {
        const a = ang + Math.sin(this.t * 2.5) * 0.7;
        tx = Math.cos(a) * S; ty = Math.sin(a) * S; this.angle = a;
        break;
      }
      case 'swarm': {
        const a = ang + Math.sin(this.t * 7) * 0.3;
        tx = Math.cos(a) * S; ty = Math.sin(a) * S; this.angle = a;
        break;
      }
      case 'grunt':
      case 'shield':
      case 'tank': {
        const pref = this.ai === 'tank' ? 300 : this.ai === 'shield' ? 210 : 260;
        const mv = dd > pref + 50 ? 1 : dd < pref - 50 ? -0.6 : 0;
        const st = this.ai === 'tank' ? 0.2 : 0.6;
        tx = (ux * mv - uy * this.strafe * st) * S;
        ty = (uy * mv + ux * this.strafe * st) * S;
        if (Math.random() < dt * 0.35) this.strafe *= -1;
        const turn = this.ai === 'shield' ? 2.0 : this.ai === 'tank' ? 1.6 : 6;
        this.facing += clamp(angDiff(this.facing, ang), -turn * dt, turn * dt);
        this.angle = Math.atan2(this.vy, this.vx);
        if (this.cd <= 0 && dd < 650) {
          if (this.ai === 'grunt') {
            this.cd = this.d.fireCd * rand(0.8, 1.2);
            this.fire(this.facing, this.d.bulletSpeed);
            if (this.elite) { this.fire(this.facing - 0.2, this.d.bulletSpeed); this.fire(this.facing + 0.2, this.d.bulletSpeed); }
            Sound.play('enemyShoot');
          } else if (this.ai === 'tank') {
            this.cd = this.d.fireCd * rand(0.85, 1.15);
            const n = this.elite ? 7 : 5;
            for (let i = 0; i < n; i++) this.fire(this.facing + (i - (n - 1) / 2) * 0.17, this.d.bulletSpeed * rand(0.9, 1.1), 7);
            Fx.shake(2);
            Sound.play('enemyShoot');
          } else {
            this.cd = this.d.fireCd; this.burst = this.elite ? 5 : 3; this.stateT = 0;
          }
        }
        if (this.burst > 0) {
          this.stateT -= dt;
          if (this.stateT <= 0) { this.burst--; this.stateT = 0.14; this.fire(this.facing, this.d.bulletSpeed); Sound.play('enemyShoot'); }
        }
        break;
      }
      case 'sniper': {
        if (this.state === 'aim') {
          this.stateT -= dt;
          this.facing += clamp(angDiff(this.facing, ang), -1.2 * dt, 1.2 * dt);
          if (this.stateT <= 0) {
            this.fire(this.facing, this.d.bulletSpeed * (1 + G.level * 0.05), 6, '#e8b8ff');
            Sound.play('laser');
            this.state = 'move'; this.cd = this.d.fireCd * rand(0.9, 1.2);
            this.vx -= Math.cos(this.facing) * 200; this.vy -= Math.sin(this.facing) * 200;
          }
        } else {
          const pref = 470;
          const mv = dd > pref + 60 ? 1 : dd < pref - 60 ? -1 : 0;
          tx = (ux * mv - uy * this.strafe * 0.7) * S;
          ty = (uy * mv + ux * this.strafe * 0.7) * S;
          if (Math.random() < dt * 0.4) this.strafe *= -1;
          this.facing += clamp(angDiff(this.facing, ang), -4 * dt, 4 * dt);
          if (this.cd <= 0 && dd < 850) { this.state = 'aim'; this.stateT = 1.0; }
        }
        break;
      }
      case 'carrier': {
        const pref = 400;
        const mv = dd > pref + 60 ? 1 : dd < pref - 60 ? -0.8 : 0;
        tx = (ux * mv - uy * this.strafe * 0.35) * S;
        ty = (uy * mv + ux * this.strafe * 0.35) * S;
        this.angle += dt * 0.5;
        this.facing = ang;
        if (this.cd <= 0) {
          this.cd = this.d.fireCd * rand(0.9, 1.2);
          if (G.enemies.length < 60) {
            const n = this.elite ? 5 : 3;
            for (let i = 0; i < n; i++) {
              const a = rand(0, TAU);
              const e = new Enemy('swarmer', this.x + Math.cos(a) * 30, this.y + Math.sin(a) * 30);
              e.vx = Math.cos(a) * 250; e.vy = Math.sin(a) * 250;
              G.enemies.push(e);
            }
            Fx.ring(this.x, this.y, this.d.color, 60, 0.4);
            Sound.play('spawn');
          }
        }
        break;
      }
    }

    const k = 1 - Math.exp(-5 * dt);
    this.vx += (tx - this.vx) * k;
    this.vy += (ty - this.vy) * k;
    this.x = clamp(this.x + this.vx * dt, 30 + this.r, G.arena.w - 30 - this.r);
    this.y = clamp(this.y + this.vy * dt, 30 + this.r, G.arena.h - 30 - this.r);

    // contact damage
    if (dd < this.r + p.r) {
      if (this.ai === 'swarm') {
        p.hurt(this.dmg);
        G.killEnemy(this, false);
        return;
      }
      if (this.contactCd <= 0) { p.hurt(this.dmg); this.contactCd = 0.8; }
      this.vx -= ux * 300; this.vy -= uy * 300;
    }
    for (const c of G.companions) {
      if (c.offline > 0) continue;
      if (d2(this.x, this.y, c.x, c.y) < (this.r + c.r) ** 2) {
        if (this.ai === 'swarm') { c.hurt(this.dmg); G.killEnemy(this, false); return; }
        if (this.contactCd <= 0) { c.hurt(this.dmg * 0.8); this.contactCd = 0.8; }
      }
    }
  }

  blocks(bx, by) {
    if (this.ai !== 'shield') return false;
    return Math.abs(angDiff(this.facing, Math.atan2(by - this.y, bx - this.x))) < 1.05;
  }

  draw(ctx) {
    const d = this.d, r = this.r;
    const c = d.color;
    const body = '#1a1320';
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.ellipse(this.x + 3, this.y + r * 0.75, r * 0.95, r * 0.42, 0, 0, TAU); ctx.fill();
    glow(ctx, this.x, this.y, r * 2.8, c, 0.3 + this.flash * 0.5);
    if (this.elite) {
      glow(ctx, this.x, this.y, r * 3.4, '#ffd700', 0.25);
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.elite ? '#ffd700' : c;
    ctx.fillStyle = body;

    switch (this.type) {
      case 'drone': {
        ctx.save();
        ctx.rotate(this.angle);
        poly(ctx, [[1.25, 0], [-0.55, -0.95], [-0.2, 0], [-0.55, 0.95]], r);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(r * 0.25, 0, r * 0.22, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 0.35; ctx.strokeStyle = c;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.25, this.t * 9, this.t * 9 + 1.3); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, r * 1.25, this.t * 9 + Math.PI, this.t * 9 + Math.PI + 1.3); ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'swarmer': {
        ctx.rotate(this.t * 9);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU, rr = i % 2 ? r * 0.5 : r * 1.2;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, TAU); ctx.fill();
        break;
      }
      case 'grunt': {
        ctx.save(); ctx.rotate(this.angle);
        ctx.fillStyle = '#120d12';
        ctx.fillRect(-r * 0.9, -r * 1.05, r * 1.8, r * 0.45); ctx.strokeRect(-r * 0.9, -r * 1.05, r * 1.8, r * 0.45);
        ctx.fillRect(-r * 0.9, r * 0.6, r * 1.8, r * 0.45); ctx.strokeRect(-r * 0.9, r * 0.6, r * 1.8, r * 0.45);
        ctx.restore();
        ctx.rotate(this.facing);
        ctx.fillStyle = body;
        roundRect(ctx, -r * 0.75, -r * 0.7, r * 1.5, r * 1.4, 4); ctx.fill(); ctx.stroke();
        ctx.fillRect(r * 0.3, -3, r * 1.0, 6); ctx.strokeRect(r * 0.3, -3, r * 1.0, 6);
        ctx.fillStyle = c; ctx.fillRect(-r * 0.2, -r * 0.35, r * 0.4, r * 0.7);
        break;
      }
      case 'sniper': {
        ctx.rotate(this.facing);
        poly(ctx, [[0.9, 0], [0.2, -0.7], [-0.9, -0.5], [-0.9, 0.5], [0.2, 0.7]], r); ctx.fill(); ctx.stroke();
        ctx.fillRect(r * 0.5, -2, r * 1.9, 4); ctx.strokeRect(r * 0.5, -2, r * 1.9, 4);
        const aiming = this.state === 'aim';
        ctx.fillStyle = aiming ? '#ffffff' : c;
        ctx.beginPath(); ctx.arc(r * 0.15, 0, r * (aiming ? 0.32 : 0.24), 0, TAU); ctx.fill();
        break;
      }
      case 'shielder': {
        ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.rotate(this.facing);
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(r * 0.25, 0, r * 0.28, 0, TAU); ctx.fill();
        ctx.fillStyle = body; ctx.fillRect(r * 0.5, -3, r * 0.8, 6); ctx.strokeRect(r * 0.5, -3, r * 0.8, 6);
        // energy shield
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.strokeStyle = rgba('#ff7ad9', 0.35 + 0.2 * Math.sin(this.t * 8)); ctx.lineWidth = 10;
        ctx.beginPath(); ctx.arc(0, 0, r + 9, -1.05, 1.05); ctx.stroke();
        ctx.strokeStyle = '#ffd1f2'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, r + 9, -1.05, 1.05); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'tank': {
        ctx.save(); ctx.rotate(this.angle);
        ctx.fillStyle = '#120b0b';
        const tr = (this.t * 40) % 8;
        for (const sy of [-1, 1]) {
          ctx.fillRect(-r * 1.05, sy * r * 0.62 - r * 0.28, r * 2.1, r * 0.56);
          ctx.strokeRect(-r * 1.05, sy * r * 0.62 - r * 0.28, r * 2.1, r * 0.56);
          ctx.strokeStyle = rgba(c, 0.4); ctx.lineWidth = 1;
          for (let k = -r + tr; k < r; k += 8) { ctx.beginPath(); ctx.moveTo(k, sy * r * 0.62 - r * 0.26); ctx.lineTo(k, sy * r * 0.62 + r * 0.26); ctx.stroke(); }
          ctx.strokeStyle = this.elite ? '#ffd700' : c; ctx.lineWidth = 2;
        }
        ctx.fillStyle = body;
        regPoly(ctx, 6, r * 0.78, 0); ctx.fill(); ctx.stroke();
        ctx.restore();
        ctx.rotate(this.facing);
        ctx.fillStyle = '#231419';
        ctx.fillRect(r * 0.2, -5, r * 1.15, 10); ctx.strokeRect(r * 0.2, -5, r * 1.15, 10);
        ctx.beginPath(); ctx.arc(0, 0, r * 0.48, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, TAU); ctx.fill();
        break;
      }
      case 'carrier': {
        ctx.rotate(this.angle);
        regPoly(ctx, 8, r, Math.PI / 8); ctx.fill(); ctx.stroke();
        for (let i = 0; i < 4; i++) {
          ctx.save(); ctx.rotate(i * TAU / 4);
          ctx.fillStyle = '#231419';
          ctx.fillRect(r * 0.7, -5, r * 0.5, 10); ctx.strokeRect(r * 0.7, -5, r * 0.5, 10);
          ctx.restore();
        }
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
        ctx.fillStyle = rgba(c, 0.4 + 0.5 * (1 - this.cd / this.d.fireCd));
        regPoly(ctx, 8, r * 0.5, Math.PI / 8); ctx.fill();
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, 0, r * 0.15 + pulse * 2, 0, TAU); ctx.fill();
        break;
      }
    }
    ctx.restore();

    if (this.flash > 0) glow(ctx, this.x, this.y, r * 1.6, '#ffffff', this.flash * 0.9);

    // sniper telegraph
    if (this.type === 'sniper' && this.state === 'aim') {
      const k = 1 - this.stateT;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#e0a8ff', 0.15 + k * 0.6);
      ctx.lineWidth = 1 + k * 2;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -G.time * 80;
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + Math.cos(this.facing) * 1100, this.y + Math.sin(this.facing) * 1100); ctx.stroke();
      ctx.restore();
    }

    if (this.hp < this.maxHp) {
      const w = r * 2.2, k = this.hp / this.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(this.x - w / 2, this.y - r - 12, w, 4);
      ctx.fillStyle = this.elite ? '#ffd700' : c; ctx.fillRect(this.x - w / 2, this.y - r - 12, w * k, 4);
    }
    if (this.elite) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.t * 1.5);
      ctx.strokeStyle = 'rgba(255,215,0,0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(0, 0, r + 14, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
}

// ═════════════════════════ BOSS ═════════════════════════
class Boss {
  constructor(levelIdx, x, y) {
    const def = LEVELS[levelIdx].boss;
    this.isBoss = true;
    this.def = def;
    this.name = def.name;
    this.color = def.color;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.r = 54 + levelIdx * 3;
    this.maxHp = this.hp = 1300 * (1 + 0.6 * levelIdx);
    this.speed = 80 + levelIdx * 8;
    this.dmg = 13 * (1 + 0.15 * levelIdx);
    this.lvl = levelIdx;
    this.patterns = def.patterns;
    this.queue = [];
    this.state = 'intro'; this.stateT = 1.4;
    this.t = 0; this.phase = 1;
    this.ringRot = 0;
    this.flash = 0;
    this.sub = 0; this.subT = 0; this.spA = 0;
    this.laserA = 0; this.laserDir = 1;
    this.chargeA = 0;
    this.contactCd = 0;
    this.dead = false;
    this.type = 'boss';
    this.ai = 'boss';
  }

  blocks() { return false; }

  fire(a, spd, r = 7, color) {
    G.ebullets.push({ x: this.x + Math.cos(a) * this.r * 0.8, y: this.y + Math.sin(a) * this.r * 0.8, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r, dmg: this.dmg, life: 5, color: color || this.color });
  }

  nextPattern() {
    if (!this.queue.length) {
      this.queue = this.patterns.slice().sort(() => Math.random() - 0.5);
      if (this.queue[0] === this.last && this.queue.length > 1) this.queue.push(this.queue.shift());
    }
    const p = this.queue.shift();
    this.last = p;
    this.state = p; this.sub = 0; this.subT = 0;
    const f = this.phase === 2 ? 0.8 : 1;
    switch (p) {
      case 'radial': this.stateT = 99; this.sub = this.phase === 2 ? 6 : 4; break;
      case 'spiral': this.stateT = 3.2; this.spA = rand(0, TAU); break;
      case 'aimed': this.stateT = 99; this.sub = this.phase === 2 ? 6 : 4; break;
      case 'charge': this.stateT = 99; this.sub = this.phase === 2 ? 3 : 2; this.chargeState = 'aim'; this.subT = 0.75 * f; break;
      case 'summon': this.stateT = 1.4; this.summoned = false; break;
      case 'laser': this.stateT = 99; this.laserState = 'charge'; this.subT = 1.3; this.laserA = Math.atan2(G.player.y - this.y, G.player.x - this.x) + Math.PI / 4; this.laserDir = Math.random() < 0.5 ? 1 : -1; Sound.play('laser'); break;
    }
  }

  update(dt) {
    const p = G.player;
    const dx = p.x - this.x, dy = p.y - this.y;
    const dd = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    this.t += dt;
    this.ringRot += dt * (this.phase === 2 ? 1.8 : 0.8);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.contactCd -= dt;
    this.eyeA = ang;
    const P2 = this.phase === 2;

    if (P2 === false && this.hp < this.maxHp * 0.5) {
      this.phase = 2;
      G.banner('OVERDRIVE', this.name + ' is enraged', this.color, 2);
      Fx.explosion(this.x, this.y, this.color, 2.2);
      Fx.shake(18);
      Sound.play('warn');
      for (const b of G.ebullets) b.dead = true;
    }

    let tx = 0, ty = 0;
    const moveIdle = (mult = 1) => {
      const pref = 330;
      const mv = dd > pref + 60 ? 1 : dd < pref - 60 ? -1 : 0;
      tx = (dx / dd * mv - dy / dd * 0.5) * this.speed * mult;
      ty = (dy / dd * mv + dx / dd * 0.5) * this.speed * mult;
    };

    this.stateT -= dt;
    switch (this.state) {
      case 'intro':
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 1; }
        break;
      case 'idle':
        moveIdle();
        if (this.stateT <= 0) this.nextPattern();
        break;
      case 'radial': {
        moveIdle(0.4);
        this.subT -= dt;
        if (this.subT <= 0) {
          const n = 16 + this.lvl * 2 + (P2 ? 6 : 0);
          const off = this.sub * 0.17;
          for (let i = 0; i < n; i++) this.fire(off + (i / n) * TAU, 210 + this.lvl * 15);
          Fx.ring(this.x, this.y, this.color, this.r * 2, 0.3);
          Sound.play('enemyShoot');
          this.sub--; this.subT = P2 ? 0.35 : 0.5;
          if (this.sub <= 0) { this.state = 'idle'; this.stateT = P2 ? 0.8 : 1.3; }
        }
        break;
      }
      case 'spiral': {
        this.subT -= dt;
        if (this.subT <= 0) {
          const arms = P2 ? 4 : 3;
          for (let i = 0; i < arms; i++) this.fire(this.spA + (i / arms) * TAU, 240 + this.lvl * 10, 6);
          this.spA += P2 ? 0.21 : 0.17;
          this.subT = 0.075;
          Sound.play('enemyShoot');
        }
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 1.2; }
        break;
      }
      case 'aimed': {
        moveIdle(0.6);
        this.subT -= dt;
        if (this.subT <= 0) {
          const n = 5 + (P2 ? 2 : 0);
          for (let i = 0; i < n; i++) this.fire(ang + (i - (n - 1) / 2) * 0.13, 360 + this.lvl * 20, 6);
          Sound.play('enemyShoot');
          this.sub--; this.subT = 0.38;
          if (this.sub <= 0) { this.state = 'idle'; this.stateT = 1; }
        }
        break;
      }
      case 'charge': {
        this.subT -= dt;
        if (this.chargeState === 'aim') {
          this.chargeA = ang;
          if (this.subT <= 0) { this.chargeState = 'go'; this.subT = 0.6; Sound.play('dash'); Fx.shake(6); }
        } else if (this.chargeState === 'go') {
          tx = Math.cos(this.chargeA) * 820; ty = Math.sin(this.chargeA) * 820;
          this.vx = tx; this.vy = ty;
          Fx.trail(this.x + rand(-20, 20), this.y + rand(-20, 20), this.color, 40, 0.4);
          if (this.subT <= 0) {
            this.chargeState = 'aim';
            const n = 12 + (P2 ? 6 : 0);
            for (let i = 0; i < n; i++) this.fire((i / n) * TAU, 250);
            Fx.ring(this.x, this.y, this.color, 120, 0.4, 4); Fx.shake(10);
            Sound.play('explode', false);
            this.sub--; this.subT = P2 ? 0.55 : 0.75;
            this.vx *= 0.1; this.vy *= 0.1;
            if (this.sub <= 0) { this.state = 'idle'; this.stateT = 1.2; }
          }
        }
        break;
      }
      case 'summon': {
        if (!this.summoned && this.stateT < 1.0) {
          this.summoned = true;
          const pool = LEVELS[this.lvl].pool.filter(([t]) => t !== 'carrier' && t !== 'tank');
          const n = 3 + Math.floor(this.lvl / 2) + (P2 ? 2 : 0);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + rand(-0.2, 0.2);
            G.queueSpawn(weighted(pool), this.x + Math.cos(a) * 140, this.y + Math.sin(a) * 140, false, 0.8);
          }
          Sound.play('spawn');
        }
        moveIdle(0.3);
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 0.8; }
        break;
      }
      case 'laser': {
        this.subT -= dt;
        const beams = P2 ? 4 : 3;
        if (this.laserState === 'charge') {
          if (this.subT <= 0) { this.laserState = 'fire'; this.subT = P2 ? 3.6 : 3; Fx.shake(8); }
        } else {
          this.laserA += dt * this.laserDir * (P2 ? 0.75 : 0.55);
          Fx.shake(1.2);
          for (let i = 0; i < beams; i++) {
            const a = this.laserA + (i / beams) * TAU;
            const ex = this.x + Math.cos(a) * 1300, ey = this.y + Math.sin(a) * 1300;
            if (segDist(p.x, p.y, this.x, this.y, ex, ey) < 16 + p.r * 0.5) p.hurt(this.dmg * 1.3);
            for (const c of G.companions) if (c.offline <= 0 && segDist(c.x, c.y, this.x, this.y, ex, ey) < 14 + c.r) c.hurt(40 * dt);
            if (Math.random() < 0.5) {
              const t = rand(0.1, 0.9);
              Fx.spark(this.x + (ex - this.x) * t * 0.6, this.y + (ey - this.y) * t * 0.6, a + rand(-2, 2), rand(80, 200), this.color, 0.3, 2);
            }
          }
          if (this.subT <= 0) { this.state = 'idle'; this.stateT = 1.1; }
        }
        break;
      }
    }

    if (this.state !== 'charge' || this.chargeState !== 'go') {
      const k = 1 - Math.exp(-3 * dt);
      this.vx += (tx - this.vx) * k; this.vy += (ty - this.vy) * k;
    }
    this.x = clamp(this.x + this.vx * dt, 40 + this.r, G.arena.w - 40 - this.r);
    this.y = clamp(this.y + this.vy * dt, 40 + this.r, G.arena.h - 40 - this.r);

    if (dd < this.r + p.r && this.contactCd <= 0) {
      p.hurt(this.dmg * 1.6);
      this.contactCd = 0.7;
      p.vx += dx / dd * 600; p.vy += dy / dd * 600;
    }
    for (const c of G.companions) {
      if (c.offline <= 0 && d2(this.x, this.y, c.x, c.y) < (this.r + c.r) ** 2) c.hurt(60 * dt);
    }
  }

  draw(ctx) {
    const { x, y, r, color: c } = this;
    const P2 = this.phase === 2;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x + 6, y + r * 0.8, r * 1.1, r * 0.45, 0, 0, TAU); ctx.fill();
    glow(ctx, x, y, r * 3.5, c, 0.35 + (P2 ? 0.15 * Math.sin(this.t * 10) + 0.15 : 0));

    // charge telegraph
    if (this.state === 'charge' && this.chargeState === 'aim') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(c, 0.25 + 0.3 * Math.sin(this.t * 30));
      ctx.lineWidth = r * 1.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.chargeA) * 500, y + Math.sin(this.chargeA) * 500); ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    // outer rotating armor ring
    ctx.save();
    ctx.rotate(this.ringRot);
    const plates = 8;
    for (let i = 0; i < plates; i++) {
      ctx.save(); ctx.rotate((i / plates) * TAU);
      ctx.fillStyle = '#1a1119'; ctx.strokeStyle = c; ctx.lineWidth = 2;
      poly(ctx, [[0.78, -0.22], [1.12, -0.16], [1.28, 0], [1.12, 0.16], [0.78, 0.22]], r);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgba(c, P2 ? 0.9 : 0.5);
      ctx.fillRect(r * 1.0, -2, r * 0.18, 4);
      ctx.restore();
    }
    ctx.restore();
    // counter-rotating inner ring
    ctx.save();
    ctx.rotate(-this.ringRot * 1.5);
    ctx.strokeStyle = rgba(c, 0.6); ctx.lineWidth = 3;
    ctx.setLineDash([r * 0.3, r * 0.15]);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // core body
    const bg = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r * 0.7);
    bg.addColorStop(0, '#3a2a3a'); bg.addColorStop(1, '#0f0a12');
    ctx.fillStyle = bg; ctx.strokeStyle = c; ctx.lineWidth = 3;
    regPoly(ctx, 8, r * 0.62, Math.PI / 8 + Math.sin(this.t) * 0.1); ctx.fill(); ctx.stroke();
    // eye
    const ex = Math.cos(this.eyeA || 0) * r * 0.18, ey = Math.sin(this.eyeA || 0) * r * 0.18;
    ctx.fillStyle = '#050305';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.36, 0, TAU); ctx.fill();
    const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, r * 0.24);
    eg.addColorStop(0, '#ffffff'); eg.addColorStop(0.35, c); eg.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(ex, ey, r * 0.24 * (P2 ? 1.2 : 1), 0, TAU); ctx.fill();
    // phase-2 cracks
    if (P2) {
      ctx.strokeStyle = rgba('#ffffff', 0.5 + 0.5 * Math.sin(this.t * 14));
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.1); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r * 0.4, r * 0.25);
      ctx.moveTo(r * 0.45, -r * 0.3); ctx.lineTo(r * 0.3, -r * 0.2); ctx.lineTo(r * 0.38, 0);
      ctx.stroke();
    }
    ctx.restore();
    glow(ctx, x + ex, y + ey, r * 0.9, c, 0.7);
    if (this.flash > 0) glow(ctx, x, y, r * 1.5, '#ffffff', this.flash * 0.7);

    // lasers
    if (this.state === 'laser') {
      const beams = P2 ? 4 : 3;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = 0; i < beams; i++) {
        const a = this.laserA + (i / beams) * TAU;
        const ex2 = x + Math.cos(a) * 1300, ey2 = y + Math.sin(a) * 1300;
        if (this.laserState === 'charge') {
          ctx.strokeStyle = rgba(c, 0.3 + 0.3 * Math.sin(this.t * 40));
          ctx.lineWidth = 2;
          ctx.setLineDash([14, 10]);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex2, ey2); ctx.stroke();
          ctx.setLineDash([]);
        } else {
          for (const [w, col, a2] of [[40, c, 0.18], [18, c, 0.5], [6, '#ffffff', 0.95]]) {
            ctx.strokeStyle = rgba(col, a2); ctx.lineWidth = w * (0.9 + 0.1 * Math.sin(this.t * 50));
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex2, ey2); ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
  }
}

// ═════════════════════════ COMPANIONS ═════════════════════════
let _cid = 0;
class Companion {
  constructor(kind) {
    this.kind = kind;
    this.d = COMP_DEFS[kind];
    this.id = ++_cid;
    this.r = this.d.r;
    this.hp = this.maxHp;
    const p = G.player;
    this.x = p ? p.x + rand(-30, 30) : 0; this.y = p ? p.y + rand(-30, 30) : 0;
    this.vx = 0; this.vy = 0;
    this.cd = rand(0.2, 1);
    this.offline = 0;
    this.aim = 0;
    this.t = rand(0, 10);
    this.target = null; this.retarget = 0;
    this.beam = null;
    this.flash = 0;
    this.healing = null;
  }
  get maxHp() { return this.d.hp * (1 + 0.3 * G.up.firmware); }
  get dmgMult() { return 1 + 0.3 * G.up.firmware; }

  hurt(dmg) {
    if (this.offline > 0) return;
    this.hp -= dmg;
    this.flash = 1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.offline = 9;
      Fx.explosion(this.x, this.y, this.d.color, 0.6);
      Fx.text(this.x, this.y - 20, 'OFFLINE', '#ff6b6b', 14);
      Sound.play('explode', false);
    }
  }

  update(dt, idx, total) {
    const p = G.player;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.beam = null; this.healing = null;

    if (this.offline > 0) {
      this.offline -= dt;
      const k = 1 - Math.exp(-1.5 * dt);
      this.x += (p.x - 40 - this.x) * k; this.y += (p.y + 40 - this.y) * k;
      if (Math.random() < dt * 6) Fx.smoke(this.x, this.y, 6, 0.8, rand(-10, 10), -30);
      if (this.offline <= 0) {
        this.hp = this.maxHp * 0.6;
        Fx.ring(this.x, this.y, this.d.color, 50, 0.5, 3);
        Fx.text(this.x, this.y - 20, 'ONLINE', this.d.color, 14);
        Sound.play('online');
      }
      return;
    }
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.025 * dt);

    // formation orbit
    const a = (idx / Math.max(1, total)) * TAU + G.time * this.d.spin;
    const tx = p.x + Math.cos(a) * this.d.orbit, ty = p.y + Math.sin(a) * this.d.orbit * 0.85;
    const k = 1 - Math.exp(-(this.kind === 'shield' ? 14 : 6) * dt);
    const nx = this.x + (tx - this.x) * k, ny = this.y + (ty - this.y) * k;
    this.vx = (nx - this.x) / dt; this.vy = (ny - this.y) / dt;
    this.x = nx; this.y = ny;

    // target acquisition
    this.retarget -= dt;
    if (this.d.range && (this.retarget <= 0 || !this.target || this.target.dead)) {
      this.target = G.nearestEnemy(this.x, this.y, this.d.range);
      this.retarget = 0.25;
    }
    const T = this.target && !this.target.dead && d2(this.x, this.y, this.target.x, this.target.y) < (this.d.range + 40) ** 2 ? this.target : null;
    if (T) this.aim += angDiff(this.aim, Math.atan2(T.y - this.y, T.x - this.x)) * Math.min(1, dt * 12);
    else this.aim += angDiff(this.aim, p.angle) * Math.min(1, dt * 4);

    this.cd -= dt;
    const M = this.dmgMult;
    switch (this.kind) {
      case 'gunner':
        if (T && this.cd <= 0) {
          this.cd = 0.3;
          const lead = dist(this.x, this.y, T.x, T.y) / 800;
          const aa = Math.atan2(T.y + (T.vy || 0) * lead - this.y, T.x + (T.vx || 0) * lead - this.x);
          G.bullets.push({ x: this.x + Math.cos(aa) * 14, y: this.y + Math.sin(aa) * 14, vx: Math.cos(aa) * 800, vy: Math.sin(aa) * 800, r: 3.5, dmg: 7 * M, life: 0.8, color: this.d.color, kind: 'bolt' });
          Fx.muzzle(this.x + Math.cos(aa) * 14, this.y + Math.sin(aa) * 14, aa, this.d.color);
          Sound.play('shoot');
        }
        break;
      case 'medic': {
        let tgt = null;
        if (p.hp < p.maxHp) tgt = p;
        else {
          let lo = 1;
          for (const c of G.companions) if (c !== this && c.offline <= 0 && c.hp / c.maxHp < lo) { lo = c.hp / c.maxHp; tgt = c; }
          if (lo >= 0.999) tgt = null;
        }
        if (tgt) {
          const amt = (tgt === p ? 4.5 : 10) * M * dt;
          if (tgt === p) p.heal(amt); else tgt.hp = Math.min(tgt.maxHp, tgt.hp + amt);
          this.healing = tgt;
          if (Math.random() < dt * 10) Fx.add({ t: 'glow', x: tgt.x + rand(-12, 12), y: tgt.y + rand(-12, 12), vx: 0, vy: -50, life: 0.5, size: 7, color: this.d.color, shrink: true });
          Sound.play('heal');
        }
        break;
      }
      case 'shield':
        break; // passive — handled in bullet collision
      case 'tesla':
        if (T && this.cd <= 0) {
          this.cd = 1.05;
          const hit = new Set();
          let from = this, cur = T;
          for (let i = 0; i < 4 && cur; i++) {
            hit.add(cur);
            Fx.bolt(from.x, from.y, cur.x, cur.y, this.d.color);
            G.damageEnemy(cur, 17 * M, cur.x, cur.y, this.d.color);
            from = cur;
            cur = G.nearestEnemy(from.x, from.y, 210, hit);
          }
          Sound.play('zap');
        }
        break;
      case 'rocket':
        if (T && this.cd <= 0) {
          this.cd = 1.7;
          for (const s of [-1, 1]) {
            const aa = this.aim + s * 0.9;
            G.bullets.push({ kind: 'missile', x: this.x + s * 12, y: this.y - 8, vx: Math.cos(aa) * 220, vy: Math.sin(aa) * 220, r: 5, dmg: 24 * M, life: 3, color: this.d.color, target: T, splash: 70 });
          }
          Sound.play('missile');
        }
        break;
      case 'laser':
        if (T) {
          this.beam = T;
          G.damageEnemy(T, 42 * M * dt, T.x, T.y, this.d.color, true);
          if (Math.random() < dt * 20) Fx.spark(T.x, T.y, rand(0, TAU), rand(100, 250), this.d.color, 0.25, 1.8);
          Sound.play('laser');
        }
        break;
    }
  }

  draw(ctx) {
    const off = this.offline > 0;
    const c = this.d.color;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(this.x + 2, this.y + this.r + 6, this.r * 0.9, this.r * 0.35, 0, 0, TAU); ctx.fill();

    // beams
    if (this.beam) {
      const T = this.beam;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const [w, col, a] of [[12, c, 0.2], [5, c, 0.6], [2, '#ffffff', 1]]) {
        ctx.strokeStyle = rgba(col, a); ctx.lineWidth = w * (0.85 + 0.15 * Math.sin(G.time * 60));
        ctx.beginPath(); ctx.moveTo(this.x + Math.cos(this.aim) * 10, this.y + Math.sin(this.aim) * 10); ctx.lineTo(T.x, T.y); ctx.stroke();
      }
      ctx.restore();
      glow(ctx, T.x, T.y, 26, c, 0.8);
    }
    if (this.healing) {
      const T = this.healing;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(c, 0.55); ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -G.time * 60;
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(T.x, T.y); ctx.stroke();
      ctx.restore();
    }

    if (!off) glow(ctx, this.x, this.y, this.r * 3, c, 0.35 + this.flash * 0.4);
    ctx.globalAlpha = off ? 0.6 : 1;
    drawCompanionShape(ctx, this.kind, this.x, this.y, 1, this.t, this.aim, off);
    ctx.globalAlpha = 1;
    if (off) {
      ctx.font = '600 10px Rajdhani, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ff8a8a';
      ctx.fillText('REBOOT ' + Math.ceil(this.offline), this.x, this.y - this.r - 8);
    } else if (this.hp < this.maxHp) {
      const w = 24;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(this.x - w / 2, this.y - this.r - 10, w, 3);
      ctx.fillStyle = c; ctx.fillRect(this.x - w / 2, this.y - this.r - 10, w * this.hp / this.maxHp, 3);
    }
  }
}
