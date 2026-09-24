'use strict';
// ═════════════════════════ Beam helper ═════════════════════════
const _beamGeo = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5); return g; })();
function makeBeam(hex, k = 4, radius = 0.05, opacity = 0.9) {
  const m = new THREE.Mesh(_beamGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.userData.radius = radius;
  m.frustumCulled = false;
  m.visible = false;
  return m;
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
function setBeam(m, ax, ay, az, bx, by, bz, radius) {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  m.position.set(ax, ay, az);
  _v1.set(bx, by, bz);
  m.lookAt(_v1);
  const r = radius ?? m.userData.radius;
  m.scale.set(r, r, Math.max(0.01, len));
  m.visible = true;
}

// ═════════════════════════ PLAYER ═════════════════════════
class Player {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.r = 0.5; this.eye = 1.65;
    this.hp = 100;
    this.grounded = false;
    this.fireCd = 0; this.dashCd = 0; this.dashT = 0; this.dashDir = new THREE.Vector3();
    this.invuln = 0; this.energy = 100; this.dead = false;
    this.recoil = 0; this.bob = 0; this.bobAmt = 0; this.land = 0;
    this.hazardT = 0;
    this.lastHurtFrom = null;
  }
  get maxHp() { return 100 + 25 * G.up.armor; }
  get fireRate() { return 6 * Math.pow(1.2, G.up.overclock); }
  get speed() { return 7.5 * (1 + 0.1 * G.up.thruster); }
  get dashMax() { return 1.2 * Math.pow(0.72, G.up.thruster); }
  get magnet() { return 6 + 5 * G.up.magnet; }
  get jumpV() { return 9.2 + 0.8 * G.up.thruster; }
  get chestY() { return this.pos.y + 1.1; }

  forward(out) { return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }

  update(dt) {
    const I = Input;
    const sens = 0.0022 * G.settings.sens;
    this.yaw -= I.mouse.dx * sens;
    this.pitch = clamp(this.pitch - I.mouse.dy * sens * (G.settings.invert ? -1 : 1), -1.5, 1.5);

    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mf = (I.key('KeyW') || I.key('ArrowUp') ? 1 : 0) - (I.key('KeyS') || I.key('ArrowDown') ? 1 : 0);
    let mr = (I.key('KeyD') || I.key('ArrowRight') ? 1 : 0) - (I.key('KeyA') || I.key('ArrowLeft') ? 1 : 0);
    let wx = fx * mf + rx * mr, wz = fz * mf + rz * mr;
    const wl = Math.hypot(wx, wz);
    if (wl) { wx /= wl; wz /= wl; }
    const sprint = (I.key('ShiftLeft') || I.key('ShiftRight')) && mf > 0;
    let spd = this.speed * (sprint ? 1.6 : 1);
    const inHaz = this.grounded && World.inHazard(this.pos.x, this.pos.z);
    if (inHaz) spd *= World.zone.hazard.slow;

    // dash
    this.dashCd -= dt;
    if (I.hit('KeyQ') && this.dashCd <= 0) {
      if (wl) this.dashDir.set(wx, 0, wz); else this.dashDir.set(fx, 0, fz);
      this.dashT = 0.18; this.dashCd = this.dashMax;
      this.invuln = Math.max(this.invuln, 0.3);
      Sound.play('dash');
      G.fov.kick = 12;
    }
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vel.x = this.dashDir.x * 34; this.vel.z = this.dashDir.z * 34;
      Fx.trail(this.pos.x + rand(-0.5, 0.5), this.pos.y + rand(0.3, 1.5), this.pos.z + rand(-0.5, 0.5), '#3cf2ff', 0.6, 0.3, 2);
    } else {
      const k = 1 - Math.exp(-(this.grounded ? 12 : 2.5) * dt);
      this.vel.x += (wx * spd - this.vel.x) * k;
      this.vel.z += (wz * spd - this.vel.z) * k;
    }

    // jump & gravity
    if (I.hit('Space') && this.grounded) {
      this.vel.y = this.jumpV; this.grounded = false; Sound.play('jump');
    }
    this.vel.y -= 26 * dt;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.pos.y += this.vel.y * dt;
    World.collide(this.pos, this.r, this.pos.y + 0.4);
    const gy = World.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= gy) {
      if (!this.grounded && this.vel.y < -8) { this.land = Math.min(1, -this.vel.y / 20); Sound.play('land'); }
      this.pos.y = gy; this.vel.y = 0; this.grounded = true;
    } else if (this.pos.y > gy + 0.25) this.grounded = false;
    else if (this.grounded) this.pos.y = gy;

    // hazard
    if (inHaz && World.zone.hazard.dmg) {
      this.hazardT -= dt;
      if (this.hazardT <= 0) { this.hazardT = 0.5; this.hurt(World.zone.hazard.dmg * 0.5, null, true); }
      if (Math.random() < dt * 20) Fx.glowBurst(this.pos.x + rand(-0.6, 0.6), World.hazardLevel + 0.1, this.pos.z + rand(-0.6, 0.6), World.zone.hazard.glow, 0.5, 0.4, 2);
    }

    // head bob
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.bobAmt = lerp(this.bobAmt, this.grounded ? Math.min(1, hs / 8) : 0, 1 - Math.exp(-8 * dt));
    this.bob += hs * dt * 1.1;
    this.land = Math.max(0, this.land - dt * 3);

    this.invuln -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 12);
    this.energy = Math.min(100, this.energy + 11 * dt);

    this.fireCd -= dt;
    if (I.mouse.down && this.fireCd <= 0) {
      this.fireCd += 1 / this.fireRate;
      if (this.fireCd < 0) this.fireCd = 0;
      this.shoot();
    }
    if (this.fireCd < 0) this.fireCd = 0;

    if (I.mouse.rightPressed || I.hit('KeyG')) {
      if (this.energy < 100 && G.cells > 0) { G.cells--; this.energy = 100; UI.feed('Plasma cell consumed', '#b98cff'); }
      if (this.energy >= 100) this.throwGrenade();
      else Sound.play('deny');
    }
    if (I.hit('KeyR')) this.useRepair();
  }

  shoot() {
    const n = 1 + G.up.split;
    const aim = G.aimPoint();
    const mz = G.muzzleWorld();
    const dir = _v2.copy(aim).sub(mz).normalize();
    const right = _v3.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 0.05;
      const d = dir.clone().addScaledVector(right, off);
      d.x += rand(-0.008, 0.008); d.y += rand(-0.008, 0.008); d.z += rand(-0.008, 0.008);
      d.normalize();
      G.spawnBolt(mz.x, mz.y, mz.z, d, 150, 10, '#3cf2ff', true);
    }
    Fx.flashLight(mz.x, mz.y, mz.z, '#3cf2ff', 20, 8, 0.05);
    this.recoil = 1;
    G.vm.userData.flash.visible = true;
    G.vm.userData.flashT = 0.05;
    Sound.play('shoot');
  }

  throwGrenade() {
    this.energy = 0;
    const f = this.forward(new THREE.Vector3());
    const mz = G.muzzleWorld();
    const v = f.multiplyScalar(26); v.y += 5;
    v.x += this.vel.x * 0.5; v.z += this.vel.z * 0.5;
    G.spawnGrenade(mz, v);
    Sound.play('throw');
  }

  useRepair() {
    if (G.repairKits <= 0) { UI.feed('No repair kits — craft some in the Workshop', '#ff6b6b'); Sound.play('deny'); return; }
    if (this.hp >= this.maxHp) { UI.feed('Hull already at full integrity', '#9fb3c8'); return; }
    G.repairKits--;
    this.hp = Math.min(this.maxHp, this.hp + 40);
    UI.feed('+40 hull restored', '#6bff9e');
    Fx.tintFlash('#6bff9e', 0.35);
    Sound.play('heal');
  }

  heal(v) { this.hp = Math.min(this.maxHp, this.hp + v); }

  hurt(dmg, from, silent) {
    if ((this.invuln > 0 && !silent) || this.dead || G.levelDone) return;
    this.hp -= dmg;
    if (!silent) this.invuln = 0.35;
    Fx.addShake(silent ? 0.1 : 0.35);
    Fx.hurtFlash(silent ? 0.25 : 0.55);
    if (from) { this.lastHurtFrom = { x: from.x, z: from.z, t: 1.2 }; UI.damageDir(from.x, from.z); }
    Sound.play('hurt');
    G.stats.damageTaken += dmg;
    if (this.hp <= 0) { this.hp = 0; G.playerDied(); }
  }
}

// ═════════════════════════ ENEMIES ═════════════════════════
class Enemy {
  constructor(type, x, z, elite = false, aggro = false) {
    const d = ENEMY_TYPES[type];
    const L = G.level;
    this.type = type; this.d = d; this.ai = d.ai;
    this.elite = elite;
    this.r = d.r * (elite ? 1.2 : 1);
    this.maxHp = this.hp = d.hp * (1 + 0.28 * L) * (elite ? 2.4 : 1);
    this.speed = d.speed * (1 + 0.05 * L) * rand(0.9, 1.1);
    this.dmg = d.dmg * (1 + 0.15 * L) * (elite ? 1.3 : 1);
    this.pos = new THREE.Vector3(x, World.heightAt(x, z) + d.hover, z);
    this.vel = new THREE.Vector3();
    this.home = { x, z };
    this.wander = { x, z, t: 0 };
    this.aggro = aggro;
    this.t = rand(0, 10);
    this.cd = rand(0.8, 1.6) * (d.fireCd || 1);
    this.state = 'move'; this.stateT = 0;
    this.flash = 0;
    this.facing = Math.atan2(G.player.pos.x - x, G.player.pos.z - z);
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.contactCd = 0; this.burst = 0;
    this.dead = false;
    this.model = buildEnemyModel(type, elite);
    this.model.position.copy(this.pos);
    G.scene.add(this.model);
    if (this.ai === 'sniper') { this.laser = makeBeam('#e0a8ff', 3, 0.03, 0.6); G.scene.add(this.laser); }
  }

  get cy() { return this.pos.y + (this.d.hitY || 0) * (this.elite ? 1.2 : 1); }

  fire(dirYaw, spd, r = 0.3, color, pitchTo) {
    const p = G.player;
    const sx = this.pos.x + Math.sin(dirYaw) * this.r, sz = this.pos.z + Math.cos(dirYaw) * this.r, sy = this.cy + 0.1;
    const tx = p.pos.x, tz = p.pos.z, ty = pitchTo ?? p.chestY;
    const h = Math.hypot(tx - sx, tz - sz) || 1;
    const vy = ((ty - sy) / h) * spd;
    G.spawnEnemyBullet(sx, sy, sz, Math.sin(dirYaw) * spd, clamp(vy, -spd, spd), Math.cos(dirYaw) * spd, this.dmg, r, color || this.d.color);
    Fx.muzzle(sx, sy, sz, this.d.color);
  }

  aimYaw(lead) {
    const p = G.player;
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    const t = lead ? d / lead : 0;
    return Math.atan2(p.pos.x + p.vel.x * t * 0.6 - this.pos.x, p.pos.z + p.vel.z * t * 0.6 - this.pos.z);
  }

  alert() {
    if (this.aggro) return;
    this.aggro = true;
    for (const e of G.enemies) if (!e.aggro && !e.isBoss && Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < 25) e.aggro = true;
  }

  update(dt) {
    const p = G.player;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const dd = Math.hypot(dx, dz) || 1;
    const ux = dx / dd, uz = dz / dd;
    const ang = Math.atan2(dx, dz);
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 7);
    this.contactCd -= dt;
    this.cd -= dt;
    let tx = 0, tz = 0;
    const S = this.speed;
    const aggroR = this.ai === 'sniper' ? 70 : 48;

    if (!this.aggro && (dd < aggroR || this.hp < this.maxHp) && !p.dead) this.alert();

    if (!this.aggro || p.dead) {
      this.wander.t -= dt;
      if (this.wander.t <= 0) { this.wander.t = rand(3, 7); this.wander.x = this.home.x + rand(-14, 14); this.wander.z = this.home.z + rand(-14, 14); }
      const wx = this.wander.x - this.pos.x, wz = this.wander.z - this.pos.z, wd = Math.hypot(wx, wz);
      if (wd > 1.5) { tx = (wx / wd) * S * 0.35; tz = (wz / wd) * S * 0.35; this.facing += clamp(angDiff(this.facing, Math.atan2(wx, wz)), -3 * dt, 3 * dt); }
      if (this.laser) this.laser.visible = false;
    } else switch (this.ai) {
      case 'drone': {
        const pref = 12;
        const mv = dd > pref + 4 ? 1 : dd < pref - 4 ? -0.8 : 0;
        tx = (ux * mv - uz * this.strafe * 0.8) * S; tz = (uz * mv + ux * this.strafe * 0.8) * S;
        if (Math.random() < dt * 0.4) this.strafe *= -1;
        this.facing = ang;
        if (this.cd <= 0 && dd < 45) { this.cd = this.d.fireCd * rand(0.8, 1.3); this.fire(this.aimYaw(this.d.bulletSpeed), this.d.bulletSpeed, 0.22); Sound.play('enemyShoot', null, G.vol(this.pos)); }
        break;
      }
      case 'swarm': {
        const a = ang + Math.sin(this.t * 6) * 0.35;
        tx = Math.sin(a) * S; tz = Math.cos(a) * S; this.facing = a;
        break;
      }
      case 'grunt': case 'shield': case 'tank': {
        const pref = this.ai === 'tank' ? 22 : this.ai === 'shield' ? 13 : 17;
        const mv = dd > pref + 4 ? 1 : dd < pref - 4 ? -0.6 : 0;
        const st = this.ai === 'tank' ? 0.15 : 0.55;
        tx = (ux * mv - uz * this.strafe * st) * S; tz = (uz * mv + ux * this.strafe * st) * S;
        if (Math.random() < dt * 0.35) this.strafe *= -1;
        const turn = this.ai === 'shield' ? 1.8 : this.ai === 'tank' ? 1.4 : 6;
        this.facing += clamp(angDiff(this.facing, ang), -turn * dt, turn * dt);
        if (this.cd <= 0 && dd < 55) {
          if (this.ai === 'grunt') {
            this.cd = this.d.fireCd * rand(0.8, 1.2);
            const a = this.aimYaw(this.d.bulletSpeed);
            this.fire(a, this.d.bulletSpeed);
            if (this.elite) { this.fire(a - 0.12, this.d.bulletSpeed); this.fire(a + 0.12, this.d.bulletSpeed); }
            Sound.play('enemyShoot', null, G.vol(this.pos));
          } else if (this.ai === 'tank') {
            this.cd = this.d.fireCd * rand(0.85, 1.15);
            const n = this.elite ? 7 : 5;
            for (let i = 0; i < n; i++) this.fire(this.facing + (i - (n - 1) / 2) * 0.12, this.d.bulletSpeed * rand(0.9, 1.1), 0.42);
            Fx.addShake(0.08 * G.vol(this.pos));
            Sound.play('enemyShoot', null, G.vol(this.pos));
          } else { this.cd = this.d.fireCd; this.burst = this.elite ? 5 : 3; this.stateT = 0; }
        }
        if (this.burst > 0) {
          this.stateT -= dt;
          if (this.stateT <= 0) { this.burst--; this.stateT = 0.16; this.fire(this.facing, this.d.bulletSpeed); Sound.play('enemyShoot', null, G.vol(this.pos)); }
        }
        break;
      }
      case 'sniper': {
        const lens = _v1.set(this.pos.x + Math.sin(this.facing) * 0.5, this.pos.y + 2.1, this.pos.z + Math.cos(this.facing) * 0.5);
        if (this.state === 'aim') {
          this.stateT -= dt;
          this.facing += clamp(angDiff(this.facing, ang), -0.9 * dt, 0.9 * dt);
          const k = 1 - this.stateT / 1.1;
          const ex = this.pos.x + Math.sin(this.facing) * 90, ez = this.pos.z + Math.cos(this.facing) * 90;
          const ey = lens.y + ((p.chestY - lens.y) / dd) * 90;
          setBeam(this.laser, lens.x, lens.y, lens.z, ex, ey, ez, 0.015 + k * 0.03);
          this.laser.material.opacity = 0.3 + k * 0.6;
          if (this.stateT <= 0) {
            this.fire(this.facing, this.d.bulletSpeed * (1 + G.level * 0.05), 0.25, '#e8b8ff');
            Sound.play('laser', null, G.vol(this.pos));
            this.state = 'move'; this.cd = this.d.fireCd * rand(0.9, 1.2);
            this.laser.visible = false;
          }
        } else {
          const pref = 38;
          const mv = dd > pref + 6 ? 1 : dd < pref - 6 ? -1 : 0;
          tx = (ux * mv - uz * this.strafe * 0.6) * S; tz = (uz * mv + ux * this.strafe * 0.6) * S;
          if (Math.random() < dt * 0.4) this.strafe *= -1;
          this.facing += clamp(angDiff(this.facing, ang), -4 * dt, 4 * dt);
          if (this.cd <= 0 && dd < 75) { this.state = 'aim'; this.stateT = 1.1; }
        }
        break;
      }
      case 'carrier': {
        const pref = 26;
        const mv = dd > pref + 5 ? 1 : dd < pref - 5 ? -0.8 : 0;
        tx = (ux * mv - uz * this.strafe * 0.35) * S; tz = (uz * mv + ux * this.strafe * 0.35) * S;
        this.facing += dt * 0.5;
        if (this.cd <= 0 && dd < 60) {
          this.cd = this.d.fireCd * rand(0.9, 1.2);
          if (G.enemies.length < 55) {
            const n = this.elite ? 5 : 3;
            for (let i = 0; i < n; i++) {
              const a = rand(0, TAU);
              const e = new Enemy('swarmer', this.pos.x + Math.sin(a) * 2, this.pos.z + Math.cos(a) * 2, false, true);
              e.vel.set(Math.sin(a) * 10, 0, Math.cos(a) * 10);
              G.enemies.push(e);
            }
            Fx.shockRing(this.pos.x, this.pos.y - 0.4, this.pos.z, this.d.color, 2, 24);
            Sound.play('spawn', null, G.vol(this.pos));
          }
        }
        break;
      }
    }

    const k = 1 - Math.exp(-5 * dt);
    this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    const ground = World.heightAt(this.pos.x, this.pos.z);
    World.collide(this.pos, this.r * 0.8, this.d.hover > 2 ? this.pos.y - 1 : ground + 0.5);
    const gNow = World.heightAt(this.pos.x, this.pos.z);
    if (this.d.hover > 1) this.pos.y = lerp(this.pos.y, Math.max(gNow, World.hazardLevel) + this.d.hover + Math.sin(this.t * 2) * 0.35, 1 - Math.exp(-3 * dt));
    else this.pos.y = gNow + this.d.hover;

    // contact damage
    const cdy = Math.abs(p.chestY - this.cy);
    if (dd < this.r + p.r + 0.2 && cdy < this.r + 1.2 && !p.dead) {
      if (this.ai === 'swarm') { p.hurt(this.dmg, this.pos); G.killEnemy(this, true); return; }
      if (this.contactCd <= 0) { p.hurt(this.dmg, this.pos); this.contactCd = 0.9; }
    }
    for (const c of G.companions) {
      if (c.offline > 0) continue;
      if (this.pos.distanceToSquared(c.pos) < (this.r + c.r) ** 2) {
        if (this.ai === 'swarm') { c.hurt(this.dmg); G.killEnemy(this, true); return; }
        if (this.contactCd <= 0) { c.hurt(this.dmg * 0.8); this.contactCd = 0.9; }
      }
    }
    this.sync(dt);
  }

  sync(dt) {
    const m = this.model, P = m.userData.parts;
    m.position.copy(this.pos);
    const face = this.ai === 'tank' || this.ai === 'carrier' ? Math.atan2(this.vel.x, this.vel.z) || this.facing : this.facing;
    if (this.ai === 'tank') {
      if (Math.hypot(this.vel.x, this.vel.z) > 0.3) m.rotation.y += angDiff(m.rotation.y, face) * Math.min(1, dt * 3);
      P.turret.rotation.y = this.facing - m.rotation.y;
    } else if (this.ai === 'carrier') m.rotation.y = this.facing;
    else m.rotation.y = this.facing;
    const spd = Math.hypot(this.vel.x, this.vel.z);
    if (P.rotors) P.rotors.forEach((r, i) => (r.rotation.y += dt * 40 * (i ? -1 : 1)));
    if (P.legs) P.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.t * spd * 1.6) * 0.5 * (i ? 1 : -1) * Math.min(1, spd / 2)));
    if (P.torso) P.torso.position.y = 1.45 + Math.abs(Math.sin(this.t * spd * 1.6)) * 0.05;
    if (P.core) { P.core.rotation.x += spd * dt * 2; }
    if (this.ai === 'drone') m.rotation.z = clamp(-(this.vel.x * Math.cos(this.facing) - this.vel.z * Math.sin(this.facing)) * 0.05, -0.5, 0.5);
    if (P.bay) P.bay.rotation.z += dt * 2;
    if (P.halo) P.halo.rotation.z += dt;
    m.userData.bodyMat.emissiveIntensity = this.flash * 2.5;
  }

  blocks(bx, bz) {
    if (this.ai !== 'shield') return false;
    return Math.abs(angDiff(this.facing, Math.atan2(bx - this.pos.x, bz - this.pos.z))) < 1.05;
  }

  destroy() {
    G.scene.remove(this.model);
    if (this.laser) G.scene.remove(this.laser);
  }
}

// ═════════════════════════ BOSS ═════════════════════════
class Boss {
  constructor(levelIdx, x, z) {
    const def = ZONES[levelIdx].boss;
    this.isBoss = true;
    this.def = def; this.name = def.name; this.color = def.color;
    this.lvl = levelIdx;
    this.r = 3.3;
    this.maxHp = this.hp = 1600 * (1 + 0.6 * levelIdx);
    this.speed = 5 + levelIdx * 0.5;
    this.dmg = 13 * (1 + 0.15 * levelIdx);
    this.patterns = def.patterns;
    this.queue = [];
    this.state = 'intro'; this.stateT = 2;
    this.t = 0; this.phase = 1;
    this.flash = 0; this.sub = 0; this.subT = 0; this.spA = 0;
    this.hover = 5.5; this.hoverTarget = 5.5;
    this.contactCd = 0; this.dead = false;
    this.pos = new THREE.Vector3(x, World.heightAt(x, z) + 30, z);
    this.vel = new THREE.Vector3();
    this.model = buildBossModel(this.color);
    this.model.position.copy(this.pos);
    G.scene.add(this.model);
    this.lasers = [];
    for (let i = 0; i < 4; i++) { const b = makeBeam(this.color, 2.6, 0.2, 0.85); G.scene.add(b); this.lasers.push(b); }
    this.teleLine = makeBeam(this.color, 2, 1.6, 0.25); G.scene.add(this.teleLine);
    this.shock = new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 6, 64), Mat.glowT(this.color, 4, 0.9));
    this.shock.rotation.x = Math.PI / 2; this.shock.visible = false;
    G.scene.add(this.shock);
    this.ai = 'boss'; this.type = 'boss';
  }

  get cy() { return this.pos.y; }
  get ground() { return World.heightAt(this.pos.x, this.pos.z); }

  blocks() { return false; }

  fire(yaw, spd, r = 0.45, color, hug = false, pitchY) {
    const p = G.player;
    const sx = this.pos.x + Math.sin(yaw) * 2.5, sz = this.pos.z + Math.cos(yaw) * 2.5;
    if (hug) {
      G.spawnEnemyBullet(sx, this.ground + 1.1, sz, Math.sin(yaw) * spd, 0, Math.cos(yaw) * spd, this.dmg, r, color || this.color, 1.1);
    } else {
      const sy = this.pos.y;
      const h = Math.hypot(p.pos.x - sx, p.pos.z - sz) || 1;
      const ty = pitchY ?? p.chestY;
      G.spawnEnemyBullet(sx, sy, sz, Math.sin(yaw) * spd, ((ty - sy) / h) * spd, Math.cos(yaw) * spd, this.dmg, r, color || this.color);
    }
  }

  nextPattern() {
    if (!this.queue.length) {
      this.queue = this.patterns.slice().sort(() => Math.random() - 0.5);
      if (this.queue[0] === this.last && this.queue.length > 1) this.queue.push(this.queue.shift());
    }
    const p = this.queue.shift();
    this.last = p; this.state = p; this.sub = 0; this.subT = 0;
    const P2 = this.phase === 2;
    switch (p) {
      case 'radial': this.stateT = 99; this.sub = P2 ? 6 : 4; break;
      case 'spiral': this.stateT = 3.4; this.spA = rand(0, TAU); break;
      case 'aimed': this.stateT = 99; this.sub = P2 ? 6 : 4; break;
      case 'charge': this.stateT = 99; this.sub = P2 ? 3 : 2; this.chargeState = 'aim'; this.subT = P2 ? 0.7 : 0.9; this.hoverTarget = 2.6; break;
      case 'summon': this.stateT = 1.6; this.summoned = false; break;
      case 'laser': this.stateT = 99; this.laserState = 'charge'; this.subT = 1.4; this.laserA = rand(0, TAU); this.laserDir = Math.random() < 0.5 ? 1 : -1; this.hoverTarget = 3; Sound.play('laser'); G.hint('Jump over the lasers!'); break;
      case 'slam': this.stateT = 99; this.slamState = 'rise'; this.subT = 0.9; this.hoverTarget = 11; this.sub = P2 ? 2 : 1; break;
    }
  }

  update(dt) {
    const p = G.player;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const dd = Math.hypot(dx, dz) || 1;
    const ang = Math.atan2(dx, dz);
    const P2 = this.phase === 2;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.contactCd -= dt;

    if (!P2 && this.hp < this.maxHp * 0.5) {
      this.phase = 2;
      G.banner('OVERDRIVE', this.name + ' is enraged', this.color, 2.2);
      Fx.explosion(this.pos.x, this.pos.y, this.pos.z, this.color, 2.5);
      Fx.addShake(0.8);
      Sound.play('warn');
      for (const b of G.ebullets) b.dead = true;
    }

    let tx = 0, tz = 0;
    const idleMove = (mult = 1) => {
      const pref = 16;
      const mv = dd > pref + 4 ? 1 : dd < pref - 4 ? -1 : 0;
      tx = ((dx / dd) * mv - (dz / dd) * 0.6) * this.speed * mult;
      tz = ((dz / dd) * mv + (dx / dd) * 0.6) * this.speed * mult;
    };
    for (const l of this.lasers) l.visible = false;
    this.teleLine.visible = false;

    this.stateT -= dt;
    switch (this.state) {
      case 'intro':
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 1; }
        break;
      case 'idle':
        idleMove(); this.hoverTarget = 5.5;
        if (this.stateT <= 0) this.nextPattern();
        break;
      case 'radial': {
        idleMove(0.3);
        this.subT -= dt;
        if (this.subT <= 0) {
          const n = 20 + this.lvl * 2 + (P2 ? 8 : 0);
          const off = this.sub * 0.13;
          for (let i = 0; i < n; i++) this.fire(off + (i / n) * TAU, 11 + this.lvl * 0.8, 0.5, null, true);
          Fx.shockRing(this.pos.x, this.ground + 1.1, this.pos.z, this.color, 2.5, 30);
          Sound.play('enemyShoot');
          this.sub--; this.subT = P2 ? 0.5 : 0.7;
          if (this.sub <= 0) { this.state = 'idle'; this.stateT = P2 ? 0.9 : 1.4; }
        }
        break;
      }
      case 'spiral': {
        this.subT -= dt;
        if (this.subT <= 0) {
          const arms = P2 ? 4 : 3;
          for (let i = 0; i < arms; i++) this.fire(this.spA + (i / arms) * TAU, 12 + this.lvl * 0.5, 0.42, null, true);
          this.spA += P2 ? 0.2 : 0.16;
          this.subT = 0.09;
          Sound.play('enemyShoot');
        }
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 1.2; }
        break;
      }
      case 'aimed': {
        idleMove(0.6);
        this.subT -= dt;
        if (this.subT <= 0) {
          const n = P2 ? 7 : 5;
          for (let i = 0; i < n; i++) this.fire(ang + (i - (n - 1) / 2) * 0.09, 24 + this.lvl * 1.5, 0.4);
          Sound.play('enemyShoot');
          this.sub--; this.subT = 0.45;
          if (this.sub <= 0) { this.state = 'idle'; this.stateT = 1; }
        }
        break;
      }
      case 'charge': {
        this.subT -= dt;
        if (this.chargeState === 'aim') {
          this.chargeA = ang;
          const g = this.ground + 0.4;
          setBeam(this.teleLine, this.pos.x, g, this.pos.z, this.pos.x + Math.sin(ang) * 32, g, this.pos.z + Math.cos(ang) * 32, 1.6);
          this.teleLine.material.opacity = 0.15 + 0.2 * Math.sin(this.t * 30);
          if (this.subT <= 0) { this.chargeState = 'go'; this.subT = 0.75; Sound.play('dash'); Fx.addShake(0.3); }
        } else {
          tx = Math.sin(this.chargeA) * 40; tz = Math.cos(this.chargeA) * 40;
          this.vel.x = tx; this.vel.z = tz;
          Fx.trail(this.pos.x + rand(-2, 2), this.pos.y + rand(-2, 2), this.pos.z + rand(-2, 2), this.color, 2, 0.4, 2);
          if (this.subT <= 0) {
            this.chargeState = 'aim';
            const n = P2 ? 18 : 12;
            for (let i = 0; i < n; i++) this.fire((i / n) * TAU, 12, 0.5, null, true);
            Fx.shockRing(this.pos.x, this.ground + 0.5, this.pos.z, this.color, 5, 40);
            Fx.addShake(0.5); Sound.play('explode', false);
            this.sub--; this.subT = P2 ? 0.6 : 0.85;
            this.vel.multiplyScalar(0.1);
            if (this.sub <= 0) { this.state = 'idle'; this.stateT = 1.2; }
          }
        }
        break;
      }
      case 'summon': {
        if (!this.summoned && this.stateT < 1.1) {
          this.summoned = true;
          const pool = ZONES[this.lvl].pool.filter(([t]) => t !== 'carrier' && t !== 'tank');
          const n = 3 + Math.floor(this.lvl / 2) + (P2 ? 2 : 0);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + rand(-0.2, 0.2);
            G.queueSpawn(weighted(pool), this.pos.x + Math.sin(a) * 10, this.pos.z + Math.cos(a) * 10, false, 1, true);
          }
          Sound.play('spawn');
        }
        idleMove(0.3);
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 0.9; }
        break;
      }
      case 'laser': {
        this.subT -= dt;
        const beams = P2 ? 4 : 3;
        const by = World.arena.y + 1.0;
        if (this.laserState === 'charge') {
          for (let i = 0; i < beams; i++) {
            const a = this.laserA + (i / beams) * TAU;
            setBeam(this.lasers[i], this.pos.x, by, this.pos.z, this.pos.x + Math.sin(a) * 40, by, this.pos.z + Math.cos(a) * 40, 0.06);
            this.lasers[i].material.opacity = 0.4 + 0.4 * Math.sin(this.t * 40);
          }
          if (this.subT <= 0) { this.laserState = 'fire'; this.subT = P2 ? 3.8 : 3.2; Fx.addShake(0.4); }
        } else {
          this.laserA += dt * this.laserDir * (P2 ? 0.7 : 0.5);
          Fx.addShake(0.02);
          for (let i = 0; i < beams; i++) {
            const a = this.laserA + (i / beams) * TAU;
            const ex = this.pos.x + Math.sin(a) * 40, ez = this.pos.z + Math.cos(a) * 40;
            setBeam(this.lasers[i], this.pos.x, by, this.pos.z, ex, by, ez, 0.16 + 0.03 * Math.sin(this.t * 50));
            this.lasers[i].material.opacity = 0.85;
            const d = segPointDist(this.pos.x, 0, this.pos.z, ex, 0, ez, p.pos.x, 0, p.pos.z);
            if (d < 0.9 && p.pos.y < by + 0.35 && p.pos.y + 1.7 > by - 0.3) p.hurt(this.dmg * 1.3, this.pos);
            for (const c of G.companions) if (c.offline <= 0 && segPointDist(this.pos.x, 0, this.pos.z, ex, 0, ez, c.pos.x, 0, c.pos.z) < 0.8 && Math.abs(c.pos.y - by) < 0.8) c.hurt(40 * dt);
            if (Math.random() < 0.6) { const t = rand(0.1, 1); Fx.spark(lerp(this.pos.x, ex, t), by, lerp(this.pos.z, ez, t), rand(-1, 1), 1, rand(-1, 1), rand(2, 6), this.color, 0.3, 0.15, 4); }
          }
          if (this.subT <= 0) { this.state = 'idle'; this.stateT = 1.1; }
        }
        break;
      }
      case 'slam': {
        this.subT -= dt;
        if (this.slamState === 'rise') {
          const k = 1 - Math.exp(-3 * dt);
          this.pos.x += (p.pos.x - this.pos.x) * k * 0.5; this.pos.z += (p.pos.z - this.pos.z) * k * 0.5;
          if (this.subT <= 0) { this.slamState = 'drop'; this.hoverTarget = 2.8; this.subT = 0.3; }
        } else if (this.slamState === 'drop') {
          if (this.subT <= 0) {
            this.slamState = 'wave'; this.shockR = 1; this.shockHit = false; this.subT = 2.4;
            this.shock.visible = true;
            this.shockY = this.ground + 0.4;
            Fx.explosion(this.pos.x, this.ground + 0.5, this.pos.z, this.color, 2.2);
            Fx.addShake(1); Sound.play('slam');
            G.hint('Jump over the shockwave!');
          }
        } else {
          this.shockR += dt * 17;
          this.shock.position.set(this.pos.x, this.shockY, this.pos.z);
          this.shock.scale.set(this.shockR, this.shockR, 1);
          this.shock.material.opacity = Math.max(0, 1 - this.shockR / 42);
          const pd = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
          if (!this.shockHit && Math.abs(pd - this.shockR) < 1.1 && p.pos.y < World.heightAt(p.pos.x, p.pos.z) + 0.7) { this.shockHit = true; p.hurt(this.dmg * 1.6, this.pos); p.vel.y = 7; }
          if (this.subT <= 0) {
            this.shock.visible = false;
            this.sub--;
            if (this.sub > 0) { this.slamState = 'rise'; this.subT = 0.8; this.hoverTarget = 11; }
            else { this.state = 'idle'; this.stateT = 1.2; }
          }
        }
        break;
      }
    }

    if (!(this.state === 'charge' && this.chargeState === 'go')) {
      const k = 1 - Math.exp(-3 * dt);
      this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k;
    }
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    // stay inside the arena
    const A = World.arena, ad = Math.hypot(this.pos.x - A.x, this.pos.z - A.z), lim = A.r - 4;
    if (ad > lim) { this.pos.x = A.x + ((this.pos.x - A.x) / ad) * lim; this.pos.z = A.z + ((this.pos.z - A.z) / ad) * lim; }
    const hk = this.slamState === 'drop' && this.state === 'slam' ? 1 - Math.exp(-18 * dt) : 1 - Math.exp(-(this.state === 'intro' ? 1.2 : 3) * dt);
    this.hover = lerp(this.hover, this.hoverTarget, hk);
    this.pos.y = lerp(this.pos.y, this.ground + this.hover + Math.sin(this.t * 1.5) * 0.3, this.state === 'intro' ? 1 - Math.exp(-1.5 * dt) : 1);

    if (dd < this.r + p.r + 0.5 && Math.abs(p.chestY - this.pos.y) < this.r + 1 && this.contactCd <= 0) {
      p.hurt(this.dmg * 1.6, this.pos);
      this.contactCd = 0.8;
      p.vel.x += (dx / dd) * 14; p.vel.z += (dz / dd) * 14; p.vel.y = 6;
    }
    for (const c of G.companions) if (c.offline <= 0 && this.pos.distanceToSquared(c.pos) < (this.r + c.r) ** 2) c.hurt(60 * dt);

    // animate model
    const m = this.model, P = m.userData.parts;
    m.position.copy(this.pos);
    P.ring.rotation.y += dt * (P2 ? 1.8 : 0.8);
    P.inner.rotation.z -= dt * 1.5;
    P.crown.rotation.y -= dt * 0.6;
    P.eye.lookAt(p.pos.x, p.chestY, p.pos.z);
    P.pupil.scale.setScalar(P2 ? 1.2 + 0.15 * Math.sin(this.t * 12) : 1);
    m.userData.bodyMat.emissiveIntensity = this.flash * 1.5 + (P2 ? 0.3 + 0.3 * Math.sin(this.t * 8) : 0);
  }

  destroy() {
    G.scene.remove(this.model, this.teleLine, this.shock, ...this.lasers);
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
    this.pos = new THREE.Vector3(p.pos.x + rand(-2, 2), p.pos.y + 2, p.pos.z + rand(-2, 2));
    this.cd = rand(0.2, 1);
    this.offline = 0;
    this.t = rand(0, 10);
    this.target = null; this.retarget = 0;
    this.flash = 0;
    this.model = buildCompanionModel(kind);
    G.scene.add(this.model);
    if (kind === 'laser' || kind === 'medic') {
      this.beam = makeBeam(kind === 'laser' ? this.d.color : '#7dffd8', kind === 'laser' ? 5 : 2.5, kind === 'laser' ? 0.08 : 0.04, kind === 'laser' ? 0.95 : 0.6);
      G.scene.add(this.beam);
    }
  }
  get maxHp() { return this.d.hp * (1 + 0.3 * G.up.firmware); }
  get dmgMult() { return 1 + 0.3 * G.up.firmware; }

  attach() { G.scene.add(this.model); if (this.beam) G.scene.add(this.beam); }
  destroy() { G.scene.remove(this.model); if (this.beam) G.scene.remove(this.beam); }

  hurt(dmg) {
    if (this.offline > 0) return;
    this.hp -= dmg;
    this.flash = 1;
    if (this.hp <= 0) {
      this.hp = 0; this.offline = 9;
      Fx.explosion(this.pos.x, this.pos.y, this.pos.z, this.d.color, 0.6);
      UI.feed(`${this.d.name} offline — rebooting`, '#ff6b6b');
      Sound.play('explode', false);
    }
  }

  update(dt, idx, total) {
    const p = G.player;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.beam) this.beam.visible = false;
    const m = this.model;

    if (this.offline > 0) {
      this.offline -= dt;
      const gy = World.heightAt(this.pos.x, this.pos.z) + 0.4;
      this.pos.y = lerp(this.pos.y, gy, 1 - Math.exp(-3 * dt));
      const k = 1 - Math.exp(-1 * dt);
      this.pos.x += (p.pos.x - 2 - this.pos.x) * k; this.pos.z += (p.pos.z + 2 - this.pos.z) * k;
      if (Math.random() < dt * 5) Fx.smoke(this.pos.x, this.pos.y, this.pos.z, 0.5, 1, rand(-0.3, 0.3), 1.2, rand(-0.3, 0.3));
      m.position.copy(this.pos); m.rotation.z = 0.8;
      m.userData.parts.halo.visible = false;
      if (this.offline <= 0) {
        this.hp = this.maxHp * 0.6;
        m.rotation.z = 0; m.userData.parts.halo.visible = true;
        Fx.shockRing(this.pos.x, this.pos.y, this.pos.z, this.d.color, 1, 20);
        UI.feed(`${this.d.name} back online`, this.d.color);
        Sound.play('online');
      }
      return;
    }
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.025 * dt);

    // formation: fan out behind and beside the player so the squad rarely blocks the view
    const fa = Math.atan2(-Math.cos(p.yaw), -Math.sin(p.yaw));
    const rel = this.kind === 'shield'
      ? G.time * this.d.spin
      : Math.PI * 0.6 + (total > 1 ? idx / (total - 1) : 0.5) * Math.PI * 0.8 + Math.sin(this.t * 0.5 + idx) * 0.2;
    const a = fa + rel;
    const orbit = this.d.orbit + (this.kind === 'shield' ? 0 : 1.6);
    const tx = p.pos.x + Math.cos(a) * orbit, tz = p.pos.z + Math.sin(a) * orbit;
    const ty = Math.max(p.pos.y, World.heightAt(tx, tz)) + this.d.height + Math.sin(this.t * 2) * 0.15;
    const k = 1 - Math.exp(-(this.kind === 'shield' ? 12 : 5) * dt);
    this.pos.x += (tx - this.pos.x) * k; this.pos.y += (ty - this.pos.y) * k; this.pos.z += (tz - this.pos.z) * k;
    // never drift into the player's face
    const ex = this.pos.x - p.pos.x, ey = this.pos.y - (p.pos.y + p.eye), ez = this.pos.z - p.pos.z;
    const ed = Math.hypot(ex, ey, ez);
    if (ed < 1.6 && ed > 0.001) { const s = 1.6 / ed; this.pos.x = p.pos.x + ex * s; this.pos.y = p.pos.y + p.eye + ey * s; this.pos.z = p.pos.z + ez * s; }

    this.retarget -= dt;
    if (this.d.range && (this.retarget <= 0 || !this.target || this.target.dead)) {
      this.target = G.nearestEnemy(this.pos.x, this.pos.z, this.d.range, null, true);
      this.retarget = 0.3;
    }
    const T = this.target && !this.target.dead && Math.hypot(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z) < this.d.range + 4 ? this.target : null;

    this.cd -= dt;
    const M = this.dmgMult;
    switch (this.kind) {
      case 'gunner':
        if (T && this.cd <= 0) {
          this.cd = 0.3;
          const lead = this.pos.distanceTo(T.pos) / 70;
          const dir = new THREE.Vector3(T.pos.x + T.vel.x * lead - this.pos.x, T.cy - this.pos.y, T.pos.z + T.vel.z * lead - this.pos.z).normalize();
          G.spawnBolt(this.pos.x + dir.x * 0.5, this.pos.y + dir.y * 0.5, this.pos.z + dir.z * 0.5, dir, 70, 7 * M, this.d.color, false);
          Fx.muzzle(this.pos.x + dir.x * 0.5, this.pos.y, this.pos.z + dir.z * 0.5, this.d.color);
          Sound.play('shoot', null, 0.35);
        }
        break;
      case 'medic': {
        let tgt = null;
        if (p.hp < p.maxHp && !p.dead) tgt = p;
        else {
          let lo = 0.999;
          for (const c of G.companions) if (c !== this && c.offline <= 0 && c.hp / c.maxHp < lo) { lo = c.hp / c.maxHp; tgt = c; }
        }
        if (tgt) {
          const amt = (tgt === p ? 4.5 : 10) * M * dt;
          if (tgt === p) p.heal(amt); else tgt.hp = Math.min(tgt.maxHp, tgt.hp + amt);
          const ty2 = tgt === p ? p.pos.y + 0.9 : tgt.pos.y;
          setBeam(this.beam, this.pos.x, this.pos.y, this.pos.z, tgt.pos.x, ty2, tgt.pos.z);
          this.beam.material.opacity = 0.4 + 0.2 * Math.sin(this.t * 12);
          if (Math.random() < dt * 8) Fx.glowBurst(tgt.pos.x + rand(-0.4, 0.4), ty2 + rand(0, 0.8), tgt.pos.z + rand(-0.4, 0.4), this.d.color, 0.3, 0.5, 2);
          Sound.play('heal', null, 0.5);
        }
        break;
      }
      case 'tesla':
        if (T && this.cd <= 0) {
          this.cd = 1.05;
          const hit = new Set();
          let from = { x: this.pos.x, y: this.pos.y + 0.6, z: this.pos.z }, cur = T;
          for (let i = 0; i < 4 && cur; i++) {
            hit.add(cur);
            Fx.bolt(from.x, from.y, from.z, cur.pos.x, cur.cy, cur.pos.z, this.d.color);
            G.damageEnemy(cur, 17 * M, cur.pos.x, cur.cy, cur.pos.z, this.d.color);
            from = { x: cur.pos.x, y: cur.cy, z: cur.pos.z };
            cur = G.nearestEnemy(from.x, from.z, 14, hit);
          }
          Sound.play('zap', null, G.vol(this.pos));
        }
        break;
      case 'rocket':
        if (T && this.cd <= 0) {
          this.cd = 1.8;
          for (const s of [-1, 1]) {
            const v = new THREE.Vector3(Math.cos(a + Math.PI / 2) * s * 4, 7, Math.sin(a + Math.PI / 2) * s * 4);
            G.spawnMissile(this.pos.x + s * 0.4, this.pos.y + 0.3, this.pos.z, v, 24 * M, T);
          }
          Sound.play('missile', null, 0.6);
        }
        break;
      case 'laser':
        if (T) {
          setBeam(this.beam, this.pos.x, this.pos.y, this.pos.z, T.pos.x, T.cy, T.pos.z, 0.06 + 0.02 * Math.sin(this.t * 60));
          G.damageEnemy(T, 42 * M * dt, T.pos.x, T.cy, T.pos.z, this.d.color, true);
          if (Math.random() < dt * 25) Fx.spark(T.pos.x, T.cy, T.pos.z, rand(-1, 1), rand(0, 1), rand(-1, 1), rand(3, 6), this.d.color, 0.25, 0.1, 4);
          Sound.play('laser', null, 0.35);
        }
        break;
    }

    m.position.copy(this.pos);
    if (T) m.lookAt(T.pos.x, T.cy, T.pos.z);
    else m.rotation.set(0, p.yaw + Math.PI, 0);
    const P = m.userData.parts;
    if (P.rotors) P.rotors.forEach((r, i) => (r.rotation.y += dt * 40 * (i ? 1 : -1)));
    if (P.arcs) { P.arcs.rotation.x += dt * 2; P.arcs.rotation.y += dt * 3; }
    if (P.orb) P.orb.scale.setScalar(1 + 0.3 * Math.sin(this.t * 20));
    m.userData.bodyMat.emissiveIntensity = 0.05 + this.flash * 2;
  }
}
