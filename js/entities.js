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
// ground steeper than this (rise per metre, ~45°) can't be walked up — it has to be climbed
const CLIFF_SLOPE = 1.0;
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
    // Zelda-style traversal
    this.stamina = 100; this.exhausted = false; this.stamRest = 0;
    this.gliding = false; this.climbing = null; this.airT = 0; this.launchT = 0;
    this.walk = 0;
    // jetpack, fall damage & status effects
    this.fuel = 100; this.jetting = false; this.spaceHeld = 0; this.pendingGlide = false;
    this.fallTop = 0; this.safe = null;
    this.frozenT = 0; this.slowT = 0; this.burnT = 0; this.burnTick = 0;
    this.shield = 0; this.shieldMax = 0;
  }
  get maxHp() { return 100 + 25 * G.up.armor + 10 * ((G.progress.story && G.progress.story.plating) || 0); }
  get maxStamina() { return 100 + 20 * (G.vessels || 0); }
  get weapon() { return WEAPONS[G.weapon] || WEAPONS.blaster; }
  get fireRate() { return this.weapon.rate * Math.pow(1.2, G.up.overclock); }
  get speed() { return 7.5 * (1 + 0.1 * G.up.thruster); }
  get dashMax() { return 1.2 * Math.pow(0.72, G.up.thruster); }
  get magnet() { return 6 + 5 * G.up.magnet; }
  get jumpV() { return 9.2 + 0.8 * G.up.thruster; }
  get chestY() { return this.pos.y + 1.1; }

  forward(out) { return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }

  useStamina(v) {
    this.stamina -= v;
    this.stamRest = 0.6;
    if (this.stamina <= 0) {
      this.stamina = 0; this.exhausted = true;
      this.gliding = false; this.climbing = null;
      Sound.play('deny');
    }
  }

  look(I) {
    const sens = 0.0022 * G.settings.sens;
    this.yaw -= I.mouse.dx * sens;
    this.pitch = clamp(this.pitch - I.mouse.dy * sens * (G.settings.invert ? -1 : 1), -1.5, 1.5);
  }

  timers(dt) {
    this.invuln -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 12);
    this.energy = Math.min(100, this.energy + 6 * dt);   // bomb recharges in ~17 s
    this.land = Math.max(0, this.land - dt * 3);
    this.stamRest -= dt;
    const resting = this.grounded;
    if (this.stamRest <= 0 && resting) this.stamina = Math.min(this.maxStamina, this.stamina + (this.exhausted ? 28 : 40) * dt);
    if (this.exhausted && this.stamina >= this.maxStamina) this.exhausted = false;
  }

  update(dt) {
    const I = Input;
    this.look(I);
    if (I.touchMode) touchAimAssist(this, dt);
    G.focus = false;
    this.inCave = !!World.caveAt(this.pos.x, this.pos.z, this.pos.y);
    this.swim = !this.inCave && Sea.swimmable(this.pos.x, this.pos.z, this.pos.y);
    this.effects(dt);
    const frozen = this.frozenT > 0;

    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mf = (I.key('KeyW') || I.key('ArrowUp') ? 1 : 0) - (I.key('KeyS') || I.key('ArrowDown') ? 1 : 0);
    let mr = (I.key('KeyD') || I.key('ArrowRight') ? 1 : 0) - (I.key('KeyA') || I.key('ArrowLeft') ? 1 : 0);
    if (I.touch) { mf -= I.touch.my; mr += I.touch.mx; }
    if (frozen) { mf = 0; mr = 0; }
    let wx = fx * mf + rx * mr, wz = fz * mf + rz * mr;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; } // analog stick keeps partial deflection as walking speed
    const wantSprint = (I.key('ShiftLeft') || I.key('ShiftRight') || (I.touch && I.touch.sprint)) && mf > 0;
    const sprinting = wantSprint && this.grounded && !this.exhausted && wl > 0.1;
    if (sprinting) this.useStamina(13 * dt);
    let spd = this.speed * (sprinting ? 1.6 : 1) * (this.exhausted ? 0.75 : 1) * (this.slowT > 0 ? 0.6 : 1);
    const liq = this.grounded && !this.inCave ? World.hazardAt(this.pos.x, this.pos.z) : null;
    const inHaz = !!liq && World.groundAt(this.pos.x, this.pos.z, this.pos.y) <= World.heightAt(this.pos.x, this.pos.z) + 0.01;
    if (inHaz) spd *= liq.slow;

    // dash
    this.dashCd -= dt;
    if (I.hit('KeyQ') && this.dashCd <= 0 && !this.climbing && !frozen) {
      if (wl > 0.1) this.dashDir.set(wx, 0, wz).normalize(); else this.dashDir.set(fx, 0, fz);
      this.dashT = 0.18; this.dashCd = this.dashMax;
      this.invuln = Math.max(this.invuln, 0.3);
      this.gliding = false;
      Sound.play('dash');
      G.fov.kick = 12;
    }

    if (this.swim) Sea.swim(this, dt, I, mf, mr);
    else {
    // jump · glide · wall leap · jetpack (hold)
    if (I.hit('Space') && !frozen) {
      if (this.climbing) {
        const c = this.climbing;
        const ox = this.pos.x - c.x, oz = this.pos.z - c.z, ol = Math.hypot(ox, oz) || 1;
        this.climbing = null;
        this.vel.set((ox / ol) * 6, 7.5, (oz / ol) * 6);
        this.useStamina(12);
        Sound.play('jump');
      } else if (this.grounded) {
        this.vel.y = this.jumpV; this.grounded = false; Sound.play('jump');
      } else if (this.gliding) {
        this.gliding = false;
      } else if (G.gear.jetpack) {
        this.pendingGlide = true;          // tap = glider, hold = jetpack (decided below)
      } else this.openGlider();
    }
    // jetpack: hold Space / JUMP in mid-air
    if (G.gear.jetpack && I.key('Space') && !this.grounded && !this.climbing && !frozen && this.fuel > 0) {
      this.spaceHeld += dt;
      if (this.spaceHeld > 0.2 || this.jetting) {
        if (!this.jetting) { Sound.play('jet'); if (G.hint) G.hint(Touch.enabled ? 'Jetpack — hold JUMP to fly · fuel refills on the ground' : 'Jetpack — hold Space to fly · fuel refills on the ground'); }
        this.jetting = true; this.pendingGlide = false; this.gliding = false;
      }
    } else {
      if (this.pendingGlide && !I.key('Space')) { this.pendingGlide = false; if (!this.grounded) this.openGlider(); }
      if (!I.key('Space')) this.pendingGlide = false;
      this.spaceHeld = 0;
      this.jetting = false;
    }

    if (this.climbing && this.climbing.terrain) this.climbTerrain(dt, mf, mr);
    else if (this.climbing) {
      // ── climbing a rock / pillar ──
      const c = this.climbing;
      const ox = this.pos.x - c.x, oz = this.pos.z - c.z;
      let ang = Math.atan2(oz, ox);
      ang += (mr * 1.6 * dt) / (c.r + this.r);
      const R = c.r + this.r + 0.02;
      this.pos.x = c.x + Math.cos(ang) * R; this.pos.z = c.z + Math.sin(ang) * R;
      const climbV = mf > 0.2 ? 2.0 : mf < -0.2 ? -2.6 : 0;   // much slower than walking
      this.vel.set(0, climbV, 0);
      this.pos.y += climbV * dt;
      if (climbV || mr) this.useStamina(15 * dt); else this.useStamina(3 * dt);
      this.walk += Math.abs(climbV) * dt * 2;
      if (this.climbing && this.pos.y >= c.top - 0.35) {
        // vault onto the top
        this.pos.y = c.top + 0.05;
        this.pos.x = c.x + Math.cos(ang) * c.r * 0.45; this.pos.z = c.z + Math.sin(ang) * c.r * 0.45;
        this.climbing = null; this.vel.set(0, 2, 0);
        Sound.play('land');
      } else if (this.climbing && this.pos.y <= World.heightAt(this.pos.x, this.pos.z) && climbV < 0) {
        this.climbing = null;
      }
    } else {
      if (this.dashT > 0) {
        this.dashT -= dt;
        this.vel.x = this.dashDir.x * 34; this.vel.z = this.dashDir.z * 34;
        Fx.trail(this.pos.x + rand(-0.5, 0.5), this.pos.y + rand(0.3, 1.5), this.pos.z + rand(-0.5, 0.5), '#3cf2ff', 0.6, 0.3, 2);
      } else if (this.jetting) {
        const k = 1 - Math.exp(-4 * dt);
        this.vel.x += (wx * spd * 1.35 - this.vel.x) * k;
        this.vel.z += (wz * spd * 1.35 - this.vel.z) * k;
        this.vel.y = Math.min(this.vel.y + 60 * dt, 9.5);
        this.fuel = Math.max(0, this.fuel - 24 * dt);
        if (this.fuel <= 0) { this.jetting = false; Sound.play('deny'); }
        if (Math.random() < dt * 40) Fx.trail(this.pos.x + rand(-0.3, 0.3), this.pos.y + 0.6, this.pos.z + rand(-0.3, 0.3), pick(['#ffb347', '#ff6a1a', '#ffe14d']), rand(0.4, 0.7), 0.3, 3);
        if (Math.random() < dt * 8) Fx.smoke(this.pos.x, this.pos.y + 0.3, this.pos.z, 0.5, 0.8, 0, -2, 0);
        if (Math.random() < dt * 7) Sound.play('jet', null, 0.5);
      } else if (this.gliding) {
        const gs = 8 + 5 * Math.max(0, mf);
        const k = 1 - Math.exp(-2 * dt);
        this.vel.x += (fx * gs + rx * mr * 5 - this.vel.x) * k;
        this.vel.z += (fz * gs + rz * mr * 5 - this.vel.z) * k;
        this.useStamina(4.5 * dt);
      } else {
        const k = 1 - Math.exp(-(this.grounded ? 12 : 2.5) * dt);
        this.vel.x += (wx * spd - this.vel.x) * k;
        this.vel.z += (wz * spd - this.vel.z) * k;
      }
      // gravity, glide sink rate, campfire updrafts
      if (this.gliding) {
        this.vel.y = Math.max(this.vel.y - 26 * dt, -2.3);
        for (const u of G.updrafts) {
          if ((this.pos.x - u.x) ** 2 + (this.pos.z - u.z) ** 2 < u.r * u.r && this.pos.y < u.y + 38) {
            this.vel.y = Math.min(11, this.vel.y + 40 * dt);
            if (Math.random() < dt * 20) Fx.trail(this.pos.x + rand(-1, 1), this.pos.y - 1, this.pos.z + rand(-1, 1), '#ffb347', 0.4, 0.5, 1.5);
          }
        }
      } else this.vel.y -= 26 * dt;
      const ox = this.pos.x, oz = this.pos.z;
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.pos.y += this.vel.y * dt;
      // caves: the roof stops jumps and the tunnel walls keep you inside
      if (this.inCave) {
        World.caveClamp(this.pos, this.r);
        const cv = World.caveAt(this.pos.x, this.pos.z, this.pos.y);
        if (cv && this.pos.y + 1.85 > cv.ceil) { this.pos.y = cv.ceil - 1.85; this.vel.y = Math.min(0, this.vel.y); this.jetting = false; this.gliding = false; }
      }
      const cliff = this.inCave ? null : this.terrainBlock(ox, oz);
      const hit = World.collide(this.pos, this.r, this.pos.y + 0.4);
      // start climbing when pushing into something climbable
      // building walls and trees can't be climbed; rocks, pillars and cliffs can
      if (hit && hit.top !== undefined && hit.kind !== 'wall' && hit.kind !== 'tree' && !this.exhausted && this.stamina > 3 && mf > 0.5 && this.dashT <= 0 && this.pos.y < hit.top - 0.6) {
        const dx = hit.x - this.pos.x, dz = hit.z - this.pos.z, dl = Math.hypot(dx, dz) || 1;
        if ((dx / dl) * fx + (dz / dl) * fz > 0.35) {
          this.climbing = hit; this.gliding = false; this.vel.set(0, 0, 0);
          if (G.hint) G.hint(Touch.enabled ? 'Climbing — push the stick up to climb, JUMP to leap off' : 'Climbing — hold forward to climb, Space to leap off');
        }
      }
      // pushing into a cliff face starts a (slow) climb
      if (cliff && !this.climbing && !this.exhausted && this.stamina > 3 && mf > 0.5 && this.dashT <= 0 && !this.jetting && cliff.x * fx + cliff.z * fz > 0.45) {
        this.climbing = { terrain: true, ux: cliff.x, uz: cliff.z, x: this.pos.x + cliff.x * 5, z: this.pos.z + cliff.z * 5, r: 0.5 };
        this.gliding = false; this.vel.set(0, 0, 0);
        if (G.hint) G.hint(Touch.enabled ? 'Climbing the cliff — push the stick up, JUMP to leap off · watch your stamina' : 'Climbing the cliff — hold W to climb, Space to leap off · watch your stamina');
      }
      // too steep to stand on: slide down
      if (this.grounded && !this.inCave && !cliff) {
        const g = World.gradAt(this.pos.x, this.pos.z);
        if (g.s > CLIFF_SLOPE * 1.05 && World.groundAt(this.pos.x, this.pos.z, this.pos.y) <= World.heightAt(this.pos.x, this.pos.z) + 0.01) {
          this.vel.x -= g.x * 18 * dt; this.vel.z -= g.z * 18 * dt;
        }
      }
    }

    }

    World.keepInside(this.pos, this.r);
    if (this.swim) Sea.pressure(this, dt); else { this.depth = 0; this.crush = Math.max(0, (this.crush || 0) - dt * 2); }
    const gy = World.groundAt(this.pos.x, this.pos.z, this.pos.y);
    // fall damage: measured from the highest point of a free fall (gliding / jetpack reset it)
    if (this.gliding || this.jetting || this.climbing || this.grounded || this.swim || this.launchT > 0.8) this.fallTop = this.pos.y;
    else this.fallTop = Math.max(this.fallTop, this.pos.y);
    if (!this.climbing) {
      if (this.pos.y <= gy) {
        if (!this.grounded && this.vel.y < -8) { this.land = Math.min(1, -this.vel.y / 20); Sound.play('land'); }
        if (!this.grounded) this.fallDamage(gy);
        this.pos.y = gy; this.vel.y = Math.max(0, this.vel.y); this.grounded = true;
        this.gliding = false; this.launchT = 0; this.jetting = false;
      } else if (this.pos.y > gy + 0.25) this.grounded = false;
      else if (this.grounded) this.pos.y = gy;
    } else this.grounded = false;
    if (this.grounded) this.fuel = Math.min(100, this.fuel + 45 * dt);
    // nothing can fall out of the world
    if (this.pos.y < World.heightAt(this.pos.x, this.pos.z) - 8 && !this.inCave && !World.caveAt(this.pos.x, this.pos.z, this.pos.y)) this.pos.y = World.heightAt(this.pos.x, this.pos.z);
    this.airT = this.grounded || this.climbing ? 0 : this.airT + dt;
    if (this.launchT > 0) { this.launchT -= dt; Fx.trail(this.pos.x, this.pos.y + 0.5, this.pos.z, '#6bff9e', 0.8, 0.5, 2); }

    // hazard (fire boots make lava bearable)
    if (inHaz && liq.dmg) {
      this.hazardT -= dt;
      const moat = Wardens.moatAt(this.pos.x, this.pos.z);
      if (this.hazardT <= 0) { this.hazardT = 0.5; this.hurt(liq.dmg * 0.5 * (moat ? 2.5 : G.gear.fireboots ? 0.15 : 1), null, true); }
      if (moat && G.hint) G.hint("Infernus's moat burns through any boots — Ashby in Cinderwell could build a cooling bridge");
      if (Math.random() < dt * 20) Fx.glowBurst(this.pos.x + rand(-0.6, 0.6), WORLD.lava + 0.1, this.pos.z + rand(-0.6, 0.6), liq.glow, 0.5, 0.4, 2);
      if (!G.gear.fireboots && G.hint) G.hint('Lava burns! Fire Boots make it bearable');
    }

    // head bob
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.bobAmt = lerp(this.bobAmt, this.grounded ? Math.min(1, hs / 8) : 0, 1 - Math.exp(-8 * dt));
    this.bob += hs * dt * 1.1;
    this.walk += hs * dt * 0.9;

    this.timers(dt);

    // Zelda-style focus: aiming while gliding or falling slows time
    if (I.mouse.down && (this.gliding || (this.airT > 0.45 && this.vel.y < 0)) && !this.exhausted && this.stamina > 0) {
      G.focus = true;
      this.useStamina(16 * dt / Math.max(0.3, G.timeScale));
    }

    this.fireCd -= dt;
    if (I.mouse.down && this.fireCd <= 0 && !this.climbing && !frozen && !G.unarmed) {
      this.fireCd += 1 / this.fireRate;
      if (this.fireCd < 0) this.fireCd = 0;
      this.shoot();
    }
    if (this.fireCd < 0) this.fireCd = 0;

    if ((I.mouse.rightPressed || I.hit('KeyG')) && !frozen && !G.unarmed) {
      if (this.energy < 100 && G.takeItem('supply', 'cell')) { this.energy = 100; UI.feed('Plasma cell consumed', '#b98cff'); }
      if (this.energy >= 100) this.throwGrenade();
      else Sound.play('deny');
    }
    if (I.hit('KeyR')) this.useRepair();
  }

  // Steep terrain is a wall: you can't walk or jump up it (but you can climb it).
  // Returns the uphill direction when the move was blocked.
  terrainBlock(ox, oz) {
    if (World.caveAt(this.pos.x, this.pos.z, this.pos.y)) return null;
    const h = World.heightAt(this.pos.x, this.pos.z);
    const feet = this.grounded ? Math.max(this.pos.y, World.heightAt(ox, oz)) : this.pos.y;
    if (h <= feet + 0.05) return null;
    const g = World.gradAt(this.pos.x, this.pos.z);
    if (g.s < CLIFF_SLOPE) return null;
    // slide along the face: drop the uphill part of the move
    const dx = this.pos.x - ox, dz = this.pos.z - oz, into = dx * g.x + dz * g.z;
    if (into <= 0) return null;
    this.pos.x -= g.x * into; this.pos.z -= g.z * into;
    if (World.heightAt(this.pos.x, this.pos.z) > feet + 0.05 && World.slopeAt(this.pos.x, this.pos.z) > CLIFF_SLOPE) { this.pos.x = ox; this.pos.z = oz; }
    const vin = this.vel.x * g.x + this.vel.z * g.z;
    if (vin > 0) { this.vel.x -= g.x * vin; this.vel.z -= g.z * vin; }
    return g;
  }

  // ── climbing a cliff face: slower than walking, drains stamina ──
  climbTerrain(dt, mf, mr) {
    const c = this.climbing;
    const climbV = mf > 0.2 ? 2.0 : mf < -0.2 ? -2.6 : 0;
    this.vel.set(0, climbV, 0);
    this.pos.y += climbV * dt;
    // shuffle sideways along the face
    const px = -c.uz, pz = c.ux;
    if (mr) { this.pos.x += px * mr * 1.6 * dt; this.pos.z += pz * mr * 1.6 * dt; }
    // hug the rock: step into the slope as you rise, back out if you'd be inside it
    for (let i = 0; i < 12 && World.heightAt(this.pos.x + c.ux * 0.12, this.pos.z + c.uz * 0.12) < this.pos.y - 0.05; i++) { this.pos.x += c.ux * 0.12; this.pos.z += c.uz * 0.12; }
    for (let i = 0; i < 12 && World.heightAt(this.pos.x, this.pos.z) > this.pos.y + 0.05; i++) { this.pos.x -= c.ux * 0.12; this.pos.z -= c.uz * 0.12; }
    const g = World.gradAt(this.pos.x + c.ux * 0.8, this.pos.z + c.uz * 0.8);
    if (g.s > 0.3) { c.ux = lerp(c.ux, g.x, 0.1); c.uz = lerp(c.uz, g.z, 0.1); const l = Math.hypot(c.ux, c.uz) || 1; c.ux /= l; c.uz /= l; }
    c.x = this.pos.x + c.ux * 5; c.z = this.pos.z + c.uz * 5;
    // the summit route's ledges let you hang on and get your breath back
    if (Wardens.restingAt(this) && !climbV && !mr) {
      this.stamina = Math.min(this.maxStamina, this.stamina + 35 * dt); this.exhausted = false;
      if (G.hint) G.hint('Resting on a ledge — your stamina refills here');
    } else if (climbV || mr) this.useStamina(15 * dt); else this.useStamina(3 * dt);
    this.walk += Math.abs(climbV) * dt * 2;
    if (!this.climbing) return;
    const ahead = World.heightAt(this.pos.x + c.ux * 1.2, this.pos.z + c.uz * 1.2);
    if (climbV > 0 && ahead <= this.pos.y + 0.6 && World.slopeAt(this.pos.x + c.ux * 1.2, this.pos.z + c.uz * 1.2) < CLIFF_SLOPE) {
      // over the top
      this.pos.x += c.ux * 1.2; this.pos.z += c.uz * 1.2;
      this.pos.y = Math.max(this.pos.y, World.heightAt(this.pos.x, this.pos.z)) + 0.05;
      this.climbing = null; this.vel.set(c.ux * 2, 2, c.uz * 2);
      Sound.play('land');
    } else if (World.slopeAt(this.pos.x, this.pos.z) < CLIFF_SLOPE * 0.8 && this.pos.y <= World.heightAt(this.pos.x, this.pos.z) + 0.2) {
      this.climbing = null;
    }
  }

  openGlider() {
    if (this.exhausted || this.stamina <= 1 || this.pos.y - World.groundAt(this.pos.x, this.pos.z, this.pos.y) <= 1.6) return;
    this.gliding = true; this.launchT = 0;
    Sound.play('glide');
    if (G.hint) G.hint(Touch.enabled ? 'Gliding — steer with the stick, tap DROP to let go' : 'Gliding — steer with movement, press Space again to drop');
  }

  fallDamage(gy) {
    const drop = this.fallTop - gy;
    this.fallTop = gy;
    if (drop < 9 || this.dead) return;
    // water breaks the fall
    const liq = World.hazardAt(this.pos.x, this.pos.z);
    if (liq && !liq.dmg && gy <= World.heightAt(this.pos.x, this.pos.z) + 0.01) return;
    const dmg = Math.round((drop - 9) * 2.8);
    this.invuln = 0;
    this.hurt(dmg, null);
    Fx.shockRing(this.pos.x, gy + 0.1, this.pos.z, '#ffffff', 1.5, 20);
    UI.feed(`Fall damage −${dmg}`, '#ff6b6b');
    if (G.hint) G.hint(Touch.enabled ? 'Long drops hurt — tap GLIDE in mid-air to land safely' : 'Long drops hurt — press Space in mid-air to glide down safely');
  }

  fellIntoVoid() {
    const s = this.safe || { x: World.spawn.x, y: World.surf(World.spawn.x, World.spawn.z), z: World.spawn.z };
    this.pos.set(s.x, s.y + 0.2, s.z);
    this.vel.set(0, 0, 0);
    this.gliding = false; this.jetting = false; this.fallTop = this.pos.y;
    this.invuln = 0;
    this.hurt(15, null, true);
    this.invuln = 1.2;
    Fx.tintFlash('#ffffff', 0.6);
    UI.feed('Fell into the clouds! −15', '#ff6b6b');
  }

  // status effects: frozen solid, frost slow, burning; shield bubble decay
  effects(dt) {
    this.slowT = Math.max(0, this.slowT - dt);
    if (this.frozenT > 0) {
      this.frozenT -= dt;
      if (Math.random() < dt * 20) Fx.spark(this.pos.x + rand(-0.6, 0.6), this.pos.y + rand(0.2, 1.8), this.pos.z + rand(-0.6, 0.6), 0, rand(0.2, 1), 0, rand(0.5, 1.5), '#bff0ff', 0.6, 0.1, 2);
      if (this.frozenT <= 0) { Sound.play('block'); Fx.sparks(this.pos.x, this.pos.y + 1, this.pos.z, 14, '#dff6ff', 6); }
    }
    if (this.burnT > 0) {
      this.burnT -= dt; this.burnTick -= dt;
      if (Math.random() < dt * 25) Fx.trail(this.pos.x + rand(-0.4, 0.4), this.pos.y + rand(0.2, 1.6), this.pos.z + rand(-0.4, 0.4), pick(['#ff6a1a', '#ffb347']), 0.5, 0.4, 2);
      if (this.burnTick <= 0) { this.burnTick = 0.5; this.hurt(G.gear.fireboots ? 1.5 : 3, null, true); }
    }
  }

  freeze(t) {
    if (this.dead) return;
    if (this.frozenT <= 0) { Sound.play('freeze'); Fx.tintFlash('#8ae9ff', 0.6); UI.feed('FROZEN!', '#8ae9ff'); }
    this.frozenT = Math.max(this.frozenT, t);
    this.gliding = false; this.jetting = false;
    if (G.hint) G.hint(Touch.enabled ? 'Frozen solid! You thaw out in a moment' : 'Frozen solid! You thaw out in a moment — dodge the next freeze with a dash or a jump');
  }

  shoot() {
    const W = this.weapon, id = G.weapon;
    const aim = G.aimPoint();
    const mz = G.muzzleWorld();
    const dir = _v2.copy(aim).sub(mz).normalize();
    const target = G.assistTarget(mz, dir);   // aim assist: shots curve into a nearby enemy
    const right = _v3.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const n = W.pellets + (id === 'blaster' ? G.up.split : 0);
    for (let i = 0; i < n; i++) {
      const d = dir.clone();
      if (id === 'blaster') d.addScaledVector(right, (i - (n - 1) / 2) * 0.05);
      const sp = W.spread;
      d.x += rand(-sp, sp); d.y += rand(-sp, sp) * (id === 'scatter' ? 0.6 : 1); d.z += rand(-sp, sp);
      d.normalize();
      if (W.rocket) G.spawnRocket(mz.x, mz.y, mz.z, d, W.speed, W.dmg, W.splash, target);
      else G.spawnBolt(mz.x, mz.y, mz.z, d, W.speed, W.dmg, W.color, true, W.life, id === 'scatter' ? null : target);
    }
    Fx.flashLight(mz.x, mz.y, mz.z, W.color, 20, 8, 0.05);
    this.recoil = id === 'blaster' ? 1 : 1.8;
    if (id !== 'blaster') G.fov.kick = Math.max(G.fov.kick, id === 'launcher' ? 5 : 3);
    G.vm.userData.flash.visible = true;
    G.vm.userData.flashT = 0.05;
    if (G.avatar) G.avatar.userData.flashT = 0.06;
    Sound.play(id === 'rifle' ? 'rifle' : id === 'launcher' ? 'missile' : id === 'scatter' ? 'scatter' : 'shoot');
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
    if (G.repairKits <= 0) { UI.feed('No repair kits — buy them at a shop', '#ff6b6b'); Sound.play('deny'); return; }
    if (this.hp >= this.maxHp) { UI.feed('Hull already at full integrity', '#9fb3c8'); return; }
    G.takeItem('supply', 'repair');
    this.hp = Math.min(this.maxHp, this.hp + 40);
    UI.feed('+40 hull restored', '#6bff9e');
    Fx.tintFlash('#6bff9e', 0.35);
    Sound.play('heal');
  }

  heal(v) { this.hp = Math.min(this.maxHp, this.hp + v); }

  hurt(dmg, from, silent) {
    if ((this.invuln > 0 && !silent) || this.dead || G.levelDone) return;
    // the Shield Bot's bubble soaks damage first
    if (this.shield > 0) {
      const a = Math.min(this.shield, dmg);
      this.shield -= a; dmg -= a;
      Fx.glowBurst(this.pos.x, this.pos.y + 1, this.pos.z, '#5ab8ff', 2.4, 0.25, 2);
      Sound.play('block', null, 0.8);
      if (this.shield <= 0) { UI.feed('Shield bubble popped', '#5ab8ff'); Fx.sparks(this.pos.x, this.pos.y + 1, this.pos.z, 16, '#5ab8ff', 7); }
      if (dmg <= 0) { if (!silent) this.invuln = 0.2; return; }
    }
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
  constructor(type, x, z, elite = false, aggro = false, camp = null, island = null, tier = G.level) {
    const d = ENEMY_TYPES[type];
    const L = tier;
    this.type = type; this.d = d; this.ai = d.ai;
    this.elite = elite;
    this.r = d.r * (elite ? 1.2 : 1);
    this.maxHp = this.hp = d.hp * (1 + 0.28 * L) * (elite ? 2.4 : 1);
    this.speed = d.speed * (1 + 0.05 * L) * rand(0.9, 1.1);
    this.dmg = d.dmg * (1 + 0.15 * L) * (elite ? 1.3 : 1);
    island = island || (camp && camp.island) || null;
    this.baseY = island ? island.top : World.floorAt(x, z);
    this.pos = new THREE.Vector3(x, this.baseY + d.hover, z);
    this.vel = new THREE.Vector3();
    this.home = { x, z };
    this.tier = L;
    this.island = d.hover < 2 ? island : null;   // ground robots never walk off their island
    this.homeIsland = island;
    this.high = !!island;                         // flyers from the sky camps stay up high
    this.wander = { x, z, t: 0 };
    this.aggro = aggro;
    this.camp = camp;          // the group this robot hangs out with
    this.calmT = 0;            // time spent far from the player while hunting
    this.chatT = rand(1, 5);
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
  aimY() { return this.cy; }

  fire(dirYaw, spd, r = 0.3, color, pitchTo) {
    const p = G.player;
    const sx = this.pos.x + Math.sin(dirYaw) * this.r, sz = this.pos.z + Math.cos(dirYaw) * this.r, sy = this.cy + 0.1;
    const tx = p.pos.x, tz = p.pos.z, ty = pitchTo ?? p.chestY;
    const h = Math.hypot(tx - sx, tz - sz) || 1;
    const vy = ((ty - sy) / h) * spd;
    G.spawnEnemyBullet(sx, sy, sz, Math.sin(dirYaw) * spd, clamp(vy, -spd, spd), Math.cos(dirYaw) * spd, this.dmg, r, color || this.d.color, 0, this.d.shot ? { effect: this.d.shot } : null);
    Fx.muzzle(sx, sy, sz, this.d.color);
  }

  aimYaw(lead) {
    const p = G.player;
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    const t = lead ? d / lead : 0;
    return Math.atan2(p.pos.x + p.vel.x * t * 0.6 - this.pos.x, p.pos.z + p.vel.z * t * 0.6 - this.pos.z);
  }

  // Robots only fight when provoked: hurting one turns its whole camp (and anyone close by) hostile.
  alert() {
    if (this.aggro || this.dummy) return;
    this.aggro = true; this.calmT = 0;
    Fx.glowBurst(this.pos.x, this.cy + 1.6, this.pos.z, '#ff3355', 0.9, 0.6, 4);
    for (const e of G.enemies) {
      if (e.aggro || e.isBoss || e.dead) continue;
      if ((this.camp && e.camp === this.camp) || Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < 22) {
        e.aggro = true; e.calmT = 0;
        Fx.glowBurst(e.pos.x, e.cy + 1.6, e.pos.z, '#ff3355', 0.9, 0.6, 4);
      }
    }
    if (this.camp && !this.camp.alerted) { this.camp.alerted = true; Sound.play('alarm', null, G.vol(this.pos)); }
  }

  // Zelda-style detection: an alarm meter fills while the player is in range (faster up close);
  // when it fills, this robot and its whole camp attack.
  detect(dt, p) {
    if (this.aggro || p.dead) { this.notice = 0; this.showAlarm(0); return; }
    const R = this.ai === 'sniper' ? 55 : this.ai === 'carrier' ? 42 : this.ai === 'swarm' ? 24 : 32;
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.y - this.pos.y, p.pos.z - this.pos.z);
    if (d < R) {
      const near = 1 - d / R;
      const rate = 0.35 + 1.9 * Math.pow(near, 1.4);   // ~3 s at the edge, ~0.6 s point-blank
      this.notice = Math.min(1, (this.notice || 0) + rate * dt);
      if (!this.noticeSfx) { this.noticeSfx = true; Sound.play('chirp', null, G.vol(this.pos)); }
      // turn toward the disturbance while deciding
      this.facing += clamp(angDiff(this.facing, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z)), -3 * dt, 3 * dt);
      if (this.notice >= 1) {
        this.notice = 0;
        this.showAlarm(0);
        this.alert();
        return;
      }
    } else {
      this.notice = Math.max(0, (this.notice || 0) - 0.35 * dt);
      if (this.notice === 0) this.noticeSfx = false;
    }
    this.showAlarm(this.notice);
  }

  // the "?" meter above a robot's head: yellow while it's noticing you
  showAlarm(k) {
    if (!this.alarm) {
      if (k <= 0) return;
      this.alarm = glowSprite('#ffd23f', 1, 2.5);
      G.scene.add(this.alarm);
    }
    this.alarm.visible = k > 0.02;
    if (!this.alarm.visible) return;
    const top = this.cy + this.r + 1.2 + (this.d.hitY ? 0.6 : 0);
    this.alarm.position.set(this.pos.x, top, this.pos.z);
    const pulse = 0.8 + 0.2 * Math.sin(G.time * (6 + k * 14));
    this.alarm.scale.setScalar((0.5 + k * 0.9) * pulse);
    this.alarm.material.color.set(k > 0.7 ? '#ff6a3d' : '#ffd23f').multiplyScalar(2 + k * 2);
  }

  // lose interest once the player has been far away for a while (not while an uplink is running)
  calmDown(dt, dd) {
    if (!this.aggro || this.hunter) return;
    if (dd > 95) this.calmT += dt; else this.calmT = 0;
    if (this.calmT > 8) {
      this.aggro = false; this.calmT = 0; this.notice = -0.5;
      if (this.camp) this.camp.alerted = false;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.5);
    }
  }

  update(dt) {
    if (this.dummy) {
      // a practice drone: just hovers and turns slowly
      this.t += dt; this.flash = Math.max(0, this.flash - dt * 7);
      this.pos.y = this.baseY + 2.4 + Math.sin(this.t * 1.5) * 0.3; this.facing += dt * 0.6;
      this.sync(dt);
      return;
    }
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
    this.calmDown(dt, dd);
    this.detect(dt, p);

    if (!this.aggro || p.dead) {
      // hang out: mill around the camp brazier, face the group, pause to "chat"
      const cx = this.camp ? this.camp.x : this.home.x, cz = this.camp ? this.camp.z : this.home.z;
      const rad = this.camp ? this.camp.r : 10;
      this.wander.t -= dt;
      if (this.wander.t <= 0) {
        this.wander.t = rand(4, 9);
        const a = rand(0, TAU), r = rand(rad * 0.55, rad);
        this.wander.x = cx + Math.cos(a) * r; this.wander.z = cz + Math.sin(a) * r;
      }
      const wx = this.wander.x - this.pos.x, wz = this.wander.z - this.pos.z, wd = Math.hypot(wx, wz);
      if (wd > 1.2) { tx = (wx / wd) * S * 0.3; tz = (wz / wd) * S * 0.3; this.facing += clamp(angDiff(this.facing, Math.atan2(wx, wz)), -3 * dt, 3 * dt); }
      else {
        const lookA = Math.atan2(cx - this.pos.x, cz - this.pos.z) + Math.sin(this.t * 0.7) * 0.6;
        this.facing += clamp(angDiff(this.facing, lookA), -1.5 * dt, 1.5 * dt);
        this.chatT -= dt;
        if (this.chatT <= 0) { this.chatT = rand(3, 8); this.hop = 0.35; if (dd < 30) Sound.play('chirp', null, G.vol(this.pos)); }
      }
      if (this.laser) this.laser.visible = false;
      if (this.state === 'aim') this.state = 'move';
      this.burst = 0;
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
              const e = new Enemy('swarmer', this.pos.x + Math.sin(a) * 2, this.pos.z + Math.cos(a) * 2, false, true, this.camp, this.homeIsland, this.tier);
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
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    // walkers stay out of deep water & lava and can't scale cliffs
    if (this.d.under) {
      // sea robots never leave the water
      if (World.heightAt(this.pos.x, this.pos.z) > WORLD.water - 3) { this.pos.x = ox; this.pos.z = oz; this.vel.x *= -0.3; this.vel.z *= -0.3; this.strafe *= -1; this.wander.t = 0; }
    } else if (this.d.hover <= 1 && !this.island) {
      const h1 = World.heightAt(this.pos.x, this.pos.z);
      if (h1 < WORLD.water + 0.2 || (h1 > World.heightAt(ox, oz) + 0.05 && World.slopeAt(this.pos.x, this.pos.z) > CLIFF_SLOPE)) {
        this.pos.x = ox; this.pos.z = oz; this.vel.x *= -0.3; this.vel.z *= -0.3; this.strafe *= -1; this.wander.t = 0;
      }
    }
    const ground = this.island ? this.island.top : World.floorAt(this.pos.x, this.pos.z);
    World.collide(this.pos, this.r * 0.8, this.d.hover > 2 ? this.pos.y - 1 : ground + 0.5);
    if (this.island) {
      const is = this.island, ix = this.pos.x - is.x, iz = this.pos.z - is.z, id = Math.hypot(ix, iz), lim = Math.max(1, is.r - this.r - 0.6);
      if (id > lim) { this.pos.x = is.x + (ix / id) * lim; this.pos.z = is.z + (iz / id) * lim; }
    }
    // the home shield keeps raiders out
    const HD = World.homeDome;
    if (HD) {
      const hx = this.pos.x - HD.x, hz = this.pos.z - HD.z, hd = Math.hypot(hx, hz) || 1, R = HD.r + this.r;
      if (hd < R) { this.pos.x = HD.x + (hx / hd) * R; this.pos.z = HD.z + (hz / hd) * R; }
    }
    Villages.keepOut(this);
    // the sealed boss dome is a one-on-one fight: other robots are kept outside it
    if (World.domeTrap) {
      const A = World.arena, ax = this.pos.x - A.x, az = this.pos.z - A.z, ad = Math.hypot(ax, az) || 1, R = A.r + 2 + this.r;
      if (ad < R) { this.pos.x = A.x + (ax / ad) * R; this.pos.z = A.z + (az / ad) * R; }
    }
    const gNow = this.island ? this.island.top : World.floorAt(this.pos.x, this.pos.z);
    const flyBase = this.high ? Math.max(gNow, this.aggro ? p.pos.y : this.baseY)
      : this.d.under ? Math.max(gNow, this.aggro ? Math.min(p.pos.y - 0.5, WORLD.water - 2 - this.d.hover) : gNow)
      : Math.max(gNow, WORLD.water);
    if (this.d.hover > 1) this.pos.y = lerp(this.pos.y, flyBase + this.d.hover + Math.sin(this.t * 2) * 0.35, 1 - Math.exp(-3 * dt));
    else this.pos.y = gNow + this.d.hover;

    // contact damage
    const cdy = Math.abs(p.chestY - this.cy);
    if (this.aggro && dd < this.r + p.r + 0.2 && cdy < this.r + 1.2 && !p.dead) {
      if (this.ai === 'swarm') { p.hurt(this.dmg, this.pos); G.killEnemy(this, true); return; }
      if (this.contactCd <= 0) { p.hurt(this.dmg, this.pos); this.contactCd = 0.9; }
    }
    for (const c of G.companions) {
      if (!c.active) continue;
      if (this.aggro && this.pos.distanceToSquared(c.pos) < (this.r + c.r) ** 2) {
        if (this.ai === 'swarm') { c.hurt(this.dmg); G.killEnemy(this, true); return; }
        if (this.contactCd <= 0) { c.hurt(this.dmg * 0.8); this.contactCd = 0.9; }
      }
    }
    this.sync(dt);
  }

  sync(dt) {
    const m = this.model, P = m.userData.parts;
    m.position.copy(this.pos);
    if (this.hop > 0) { this.hop = Math.max(0, this.hop - dt); m.position.y += Math.sin((this.hop / 0.35) * Math.PI) * 0.35; }
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
    if (P.wings) P.wings.forEach((w, i) => (w.rotation.z = Math.sin(this.t * 9) * 0.45 * (i ? -1 : 1)));
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
    if (this.alarm) G.scene.remove(this.alarm);
  }
}

// ═════════════════════════ BOSSES ═════════════════════════
// Five distinct machines, one per biome, each tougher than the last:
//   beast (Brambleback) · frost (Glacieros) · titan (Colossus) · fire (Infernus) · bird (Stormwing)
const BOSS_KIND = {
  beast: { r: 3.2, hover: 0,   ground: true, cyOff: 3.6, speed: 7.5 },
  frost: { r: 3.0, hover: 5.5, cyOff: 0,    speed: 4.5 },
  titan: { r: 3.6, hover: 0,   ground: true, cyOff: 14.6, capLo: 0.5, capHi: 19.5, speed: 3.2 },
  fire:  { r: 3.2, hover: 6,   cyOff: 0,    speed: 5.5 },
  bird:  { r: 3.4, hover: 10,  cyOff: 0,    speed: 9 },
  deep:  { r: 4.0, hover: 7,   cyOff: 0,    speed: 6 },
};

class Boss {
  constructor(levelIdx, x, z) {
    const def = ZONES[levelIdx].boss;
    const K = BOSS_KIND[def.kind] || BOSS_KIND.frost;
    this.isBoss = true;
    this.def = def; this.K = K; this.kind = def.kind;
    this.name = def.name; this.color = def.color;
    this.lvl = levelIdx;
    this.r = K.r;
    this.maxHp = this.hp = def.hp || 1600;
    this.speed = K.speed;
    this.dmg = 12 * (1 + 0.22 * levelIdx);
    this.patterns = def.patterns.filter((p) => p !== 'summon');   // bosses fight alone
    this.queue = [];
    this.state = 'intro'; this.stateT = 2.2;
    this.t = 0; this.phase = 1;
    this.flash = 0; this.sub = 0; this.subT = 0; this.spA = 0;
    this.hover = K.ground ? 26 : 30; this.hoverTarget = K.hover;
    this.contactCd = 0; this.dead = false; this.hidden = false;
    this.facing = Math.atan2(G.player.pos.x - x, G.player.pos.z - z);
    this.walkPh = 0; this.anim = 0;
    this.pos = new THREE.Vector3(x, World.arenaFloor(x, z) + this.hover, z);
    this.vel = new THREE.Vector3();
    this.model = buildBossModel(this.kind, this.color);
    this.model.position.copy(this.pos);
    G.scene.add(this.model);
    this.lasers = [];
    for (let i = 0; i < 4; i++) { const b = makeBeam(this.color, 2.6, 0.2, 0.85); G.scene.add(b); this.lasers.push(b); }
    this.teleLine = makeBeam(this.color, 2, 1.6, 0.25); G.scene.add(this.teleLine);
    this.shock = new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 6, 64), Mat.glowT(this.color, 4, 0.9));
    this.shock.rotation.x = Math.PI / 2; this.shock.visible = false;
    G.scene.add(this.shock);
    this.markers = [];
    this.wave = null;
    this.ai = 'boss'; this.type = 'boss';
  }

  get cy() { return this.pos.y + this.K.cyOff; }
  // hit-test centre: tall bosses use a vertical capsule
  aimY(y) { return this.K.capHi ? clamp(y, this.pos.y + this.K.capLo, this.pos.y + this.K.capHi) : this.cy; }
  get ground() { return World.arenaFloor(this.pos.x, this.pos.z); }
  blocks() { return false; }

  // where shots leave the boss
  muzzle() {
    if (this.kind === 'titan') return { x: this.pos.x + Math.sin(this.facing) * 2.2, y: this.pos.y + 17.6, z: this.pos.z + Math.cos(this.facing) * 2.2 };
    if (this.kind === 'beast') return { x: this.pos.x + Math.sin(this.facing) * 5.5, y: this.pos.y + 3.4, z: this.pos.z + Math.cos(this.facing) * 5.5 };
    return { x: this.pos.x, y: this.cy, z: this.pos.z };
  }

  fire(yaw, spd, r = 0.45, color, hug = false, pitchY, opts) {
    const p = G.player;
    if (hug) {
      const sx = this.pos.x + Math.sin(yaw) * (this.r * 0.8), sz = this.pos.z + Math.cos(yaw) * (this.r * 0.8);
      G.spawnEnemyBullet(sx, this.ground + 1.1, sz, Math.sin(yaw) * spd, 0, Math.cos(yaw) * spd, this.dmg, r, color || this.color, 1.1, opts);
    } else {
      const m = this.muzzle();
      const sx = m.x + Math.sin(yaw) * 1.5, sz = m.z + Math.cos(yaw) * 1.5, sy = m.y;
      const h = Math.hypot(p.pos.x - sx, p.pos.z - sz) || 1;
      const ty = pitchY ?? p.chestY;
      G.spawnEnemyBullet(sx, sy, sz, Math.sin(yaw) * spd, ((ty - sy) / h) * spd, Math.cos(yaw) * spd, this.dmg, r, color || this.color, 0, opts);
    }
  }

  // ballistic shot that lands on (tx, ty, tz) after T seconds
  lob(sx, sy, sz, tx, ty, tz, T, grav, r, color, opts) {
    const vx = (tx - sx) / T, vz = (tz - sz) / T, vy = (ty - sy + 0.5 * grav * T * T) / T;
    G.spawnEnemyBullet(sx, sy, sz, vx, vy, vz, this.dmg * 1.3, r, color, 0, Object.assign({ grav, splash: 4.5 }, opts));
  }

  startWave(effect, speed = 17) {
    const sonar = effect === 'sonar', y = sonar ? this.cy : this.ground + 0.4;
    this.wave = { r: 1, y, hit: false, effect, speed, x: this.pos.x, z: this.pos.z };
    this.shock.visible = true;
    this.shock.material.color.set(effect === 'freeze' ? '#bff0ff' : this.color).multiplyScalar(4);
    Fx.explosion(this.pos.x, y + 0.1, this.pos.z, effect === 'freeze' ? '#bff0ff' : this.color, 2.2);
    Fx.addShake(sonar ? 0.5 : 1); Sound.play('slam');
    G.hint(sonar ? 'Swim above or below the sonar ring!' : effect === 'freeze' ? 'Jump over the frost wave or you will freeze!' : 'Jump over the shockwave!');
  }

  nextPattern() {
    if (!this.queue.length) {
      this.queue = this.patterns.slice().sort(() => Math.random() - 0.5);
      if (this.queue[0] === this.last && this.queue.length > 1) this.queue.push(this.queue.shift());
    }
    const p = this.queue.shift();
    this.last = p; this.state = p; this.sub = 0; this.subT = 0; this.stateT = 99;
    this.hidden = false; this.model.visible = true; this.anim = 0;
    const P2 = this.phase === 2;
    switch (p) {
      case 'radial': this.sub = P2 ? 6 : 4; break;
      case 'spiral': this.stateT = 3.4; this.spA = rand(0, TAU); break;
      case 'aimed': this.sub = P2 ? 6 : 4; break;
      case 'charge': this.sub = P2 ? 3 : 2; this.chargeState = 'aim'; this.subT = P2 ? 0.7 : 0.9; if (!this.K.ground) this.hoverTarget = 2.6; break;
      case 'summon': this.stateT = 1.6; this.summoned = false; break;
      case 'laser': case 'icebeam': this.laserState = 'charge'; this.subT = 1.4; this.laserA = rand(0, TAU); this.laserDir = Math.random() < 0.5 ? 1 : -1; this.hoverTarget = 3; Sound.play('laser'); G.hint(p === 'icebeam' ? 'Jump over the freezing beams!' : 'Jump over the lasers!'); break;
      case 'slam': this.slamState = 'rise'; this.subT = 0.9; this.hoverTarget = 11; this.sub = P2 ? 2 : 1; break;
      case 'stomp': this.stompState = 'rear'; this.subT = this.kind === 'titan' ? 1.2 : 0.8; this.sub = P2 ? 2 : 1; Sound.play('warn'); break;
      case 'pounce': this.pState = 'crouch'; this.subT = 0.75; this.sub = P2 ? 2 : 1; break;
      case 'freeze': this.subT = 1.1; this.fState = 'charge'; Sound.play('laser'); break;
      case 'boulder': this.sub = P2 ? 5 : 3; this.subT = 0.6; break;
      case 'flame': this.stateT = P2 ? 3.4 : 2.6; this.hoverTarget = 3.2; Sound.play('bomb'); G.hint('Get out of the flames — keep moving!'); break;
      case 'meteor': this.meteorState = 'mark'; this.subT = 1.3; this.markTargets(P2 ? 11 : 7); break;
      case 'vanish': this.vState = 'fade'; this.subT = 0.6; break;
      case 'dive': this.dState = 'aim'; this.subT = P2 ? 0.6 : 0.85; this.sub = P2 ? 2 : 1; break;
      case 'feathers': this.sub = P2 ? 5 : 3; break;
      case 'gust': this.stateT = P2 ? 2.6 : 2; Sound.play('glide'); G.hint('Hold your ground against the gust!'); break;
      case 'sonar': this.subT = 1.1; this.sub = P2 ? 3 : 2; this.sonarState = 'charge'; Sound.play('laser'); G.hint('A sonar ring! Swim above or below it'); break;
    }
  }

  markTargets(n) {
    const p = G.player;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), r = i === 0 ? 0 : rand(3, 14);
      const x = p.pos.x + Math.cos(a) * r + p.vel.x * 0.6, z = p.pos.z + Math.sin(a) * r + p.vel.z * 0.6;
      const y = World.arenaFloor(x, z) + 0.15;
      const s = glowSprite('#ff3a1a', 5, 2); s.position.set(x, y + 0.2, z); G.scene.add(s);
      this.markers.push({ x, y, z, sprite: s });
    }
  }
  clearMarkers() { for (const m of this.markers) G.scene.remove(m.sprite); this.markers = []; }

  update(dt) {
    G.bossFiring = true;
    try { this.think(dt); } finally { G.bossFiring = false; }
  }

  think(dt) {
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
      Fx.explosion(this.pos.x, this.cy, this.pos.z, this.color, 2.5);
      Fx.addShake(0.8);
      Sound.play('warn');
      for (const b of G.ebullets) b.dead = true;
      this.speed *= 1.25;
    }

    let tx = 0, tz = 0, faceTo = ang;
    const idleMove = (mult = 1) => {
      if (this.kind === 'bird') {
        // circle the arena
        const A = World.arena, a = Math.atan2(this.pos.x - A.x, this.pos.z - A.z) + 0.6;
        const cx = A.x + Math.sin(a) * 16, cz = A.z + Math.cos(a) * 16;
        const ux = cx - this.pos.x, uz = cz - this.pos.z, ul = Math.hypot(ux, uz) || 1;
        tx = (ux / ul) * this.speed * mult; tz = (uz / ul) * this.speed * mult;
        return;
      }
      const pref = this.kind === 'titan' ? 12 : 16;
      const mv = dd > pref + 4 ? 1 : dd < pref - 4 ? -1 : 0;
      const st = this.K.ground ? 0.25 : 0.6;
      tx = ((dx / dd) * mv - (dz / dd) * st) * this.speed * mult;
      tz = ((dz / dd) * mv + (dx / dd) * st) * this.speed * mult;
    };
    for (const l of this.lasers) l.visible = false;
    this.teleLine.visible = false;
    let override = false;   // position driven directly (pounce/dive)

    this.stateT -= dt;
    switch (this.state) {
      case 'intro':
        if (this.stateT <= 0) {
          this.state = 'idle'; this.stateT = 1;
          if (this.K.ground) { Fx.shockRing(this.pos.x, this.ground + 0.5, this.pos.z, this.color, 10, 50); Fx.addShake(1); Sound.play('slam'); }
        }
        break;
      case 'idle':
        idleMove(); if (!this.K.ground) this.hoverTarget = this.K.hover;
        if (this.stateT <= 0) this.nextPattern();
        break;
      case 'radial': {
        idleMove(0.3);
        this.subT -= dt;
        if (this.subT <= 0) {
          const n = 18 + this.lvl * 3 + (P2 ? 8 : 0);
          const off = this.sub * 0.13;
          const opts = this.kind === 'frost' ? { effect: 'frost' } : this.kind === 'fire' ? { effect: 'fire' } : null;
          for (let i = 0; i < n; i++) this.fire(off + (i / n) * TAU, 11 + this.lvl * 0.8, 0.5, null, true, undefined, opts);
          Fx.shockRing(this.pos.x, this.ground + 1.1, this.pos.z, this.color, 2.5, 30);
          Sound.play('enemyShoot');
          this.sub--; this.subT = P2 ? 0.5 : 0.7;
          if (this.sub <= 0) { this.state = 'idle'; this.stateT = P2 ? 0.9 : 1.4; }
        }
        break;
      }
      case 'spiral': {
        if (this.kind === 'bird') idleMove(0.5);
        this.subT -= dt;
        if (this.subT <= 0) {
          const arms = P2 ? 4 : 3;
          for (let i = 0; i < arms; i++) this.fire(this.spA + (i / arms) * TAU, 12 + this.lvl * 0.5, 0.42, null, true, undefined, this.kind === 'frost' ? { effect: 'frost' } : null);
          this.spA += P2 ? 0.2 : 0.16;
          this.subT = 0.09;
          Sound.play('enemyShoot');
        }
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 1.2; }
        break;
      }
      case 'aimed': case 'feathers': {
        idleMove(0.6);
        this.subT -= dt;
        if (this.subT <= 0) {
          const feathers = this.state === 'feathers';
          const n = feathers ? (P2 ? 9 : 7) : P2 ? 7 : 5;
          const spd = feathers ? 30 : 24 + this.lvl * 1.5;
          for (let i = 0; i < n; i++) this.fire(ang + (i - (n - 1) / 2) * (feathers ? 0.12 : 0.09), spd, feathers ? 0.32 : 0.4, feathers ? '#ffe14d' : null);
          Sound.play(feathers ? 'throw' : 'enemyShoot');
          if (this.kind === 'beast') this.anim = 0.5;
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
          faceTo = this.chargeA;
          Fx.trail(this.pos.x + rand(-2, 2), this.cy + rand(-2, 2), this.pos.z + rand(-2, 2), this.color, 2, 0.4, 2);
          if (this.kind === 'fire' && Math.random() < 0.5) G.spawnEnemyBullet(this.pos.x, this.ground + 0.8, this.pos.z, 0, 0, 0, this.dmg * 0.4, 0.8, '#ff6a1a', 0.8, { effect: 'fire', life: 2.5 });
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
          const pool = ZONES[this.lvl].pool.filter(([t]) => t !== 'carrier' && t !== 'tank' && t !== 'rockcrusher');
          const n = 2 + Math.floor(this.lvl / 2) + (P2 ? 2 : 0);
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
      case 'laser': case 'icebeam': {
        this.subT -= dt;
        const beams = P2 ? 4 : 3;
        const by = World.arena.y + 1.0;
        const ice = this.state === 'icebeam';
        const col = ice ? '#bff0ff' : this.color;
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
            if (d < 0.9 && p.pos.y < by + 0.35 && p.pos.y + 1.7 > by - 0.3 && p.invuln <= 0) { p.hurt(this.dmg * (ice ? 0.9 : 1.3), this.pos); if (ice) p.freeze(1.4); }
            for (const c of G.companions) if (c.active && segPointDist(this.pos.x, 0, this.pos.z, ex, 0, ez, c.pos.x, 0, c.pos.z) < 0.8 && Math.abs(c.pos.y - by) < 0.8) c.hurt(40 * dt);
            if (Math.random() < 0.6) { const t = rand(0.1, 1); Fx.spark(lerp(this.pos.x, ex, t), by, lerp(this.pos.z, ez, t), rand(-1, 1), 1, rand(-1, 1), rand(2, 6), col, 0.3, 0.15, 4); }
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
          if (this.subT <= 0) { this.slamState = 'wait'; this.subT = 2.2; this.startWave(null); }
        } else if (this.subT <= 0) {
          this.sub--;
          if (this.sub > 0) { this.slamState = 'rise'; this.subT = 0.8; this.hoverTarget = 11; }
          else { this.state = 'idle'; this.stateT = 1.2; }
        }
        break;
      }
      case 'stomp': {
        this.subT -= dt;
        this.anim = this.stompState === 'rear' ? 1 - this.subT / (this.kind === 'titan' ? 1.2 : 0.8) : Math.max(0, this.anim - dt * 4);
        if (this.stompState === 'rear' && this.subT <= 0) {
          this.startWave(null, this.kind === 'titan' ? 14 : 18);
          if (this.kind === 'titan') for (let i = 0; i < 6; i++) { const a = rand(0, TAU); G.spawnEnemyBullet(this.pos.x + Math.sin(a) * 3, this.ground + 1, this.pos.z + Math.cos(a) * 3, Math.sin(a) * 8, 14, Math.cos(a) * 8, this.dmg, 0.7, '#a08a6a', 0, { grav: 26, splash: 3 }); }
          this.stompState = 'wait'; this.subT = 1.6;
        } else if (this.stompState === 'wait' && this.subT <= 0) {
          this.sub--;
          if (this.sub > 0) { this.stompState = 'rear'; this.subT = 0.8; }
          else { this.state = 'idle'; this.stateT = 1.1; }
        }
        break;
      }
      case 'pounce': {
        this.subT -= dt;
        if (this.pState === 'crouch') {
          this.anim = -1;
          this.pTarget = { x: p.pos.x, z: p.pos.z };
          const g = World.arenaFloor(p.pos.x, p.pos.z) + 0.3;
          setBeam(this.teleLine, this.pos.x, this.ground + 0.4, this.pos.z, p.pos.x, g, p.pos.z, 1.2);
          this.teleLine.material.opacity = 0.2 + 0.2 * Math.sin(this.t * 30);
          if (this.subT <= 0) { this.pState = 'leap'; this.subT = 0.9; this.pFrom = { x: this.pos.x, z: this.pos.z }; Sound.play('dash'); }
        } else if (this.pState === 'leap') {
          override = true;
          const k = 1 - this.subT / 0.9;
          this.pos.x = lerp(this.pFrom.x, this.pTarget.x, k); this.pos.z = lerp(this.pFrom.z, this.pTarget.z, k);
          this.hover = Math.sin(k * Math.PI) * 9;
          faceTo = Math.atan2(this.pTarget.x - this.pFrom.x, this.pTarget.z - this.pFrom.z);
          if (this.subT <= 0) {
            this.hover = 0; this.anim = 0;
            Fx.explosion(this.pos.x, this.ground + 0.5, this.pos.z, this.color, 2);
            Fx.shockRing(this.pos.x, this.ground + 0.4, this.pos.z, this.color, 7, 50);
            Fx.addShake(1); Sound.play('slam');
            if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 6.5 && p.pos.y < this.ground + 2) { p.hurt(this.dmg * 1.6, this.pos); p.vel.y = 8; }
            this.sub--;
            if (this.sub > 0) { this.pState = 'crouch'; this.subT = 0.6; }
            else { this.state = 'idle'; this.stateT = 1.2; }
          }
        }
        break;
      }
      case 'freeze': {
        this.subT -= dt;
        if (this.fState === 'charge') {
          if (Math.random() < 0.8) { const a = rand(0, TAU), r = rand(4, 7); Fx.spark(this.pos.x + Math.cos(a) * r, this.cy + rand(-2, 2), this.pos.z + Math.sin(a) * r, -Math.cos(a) * 3, 0, -Math.sin(a) * 3, rand(4, 8), '#bff0ff', 0.4, 0.15, 3); }
          this.flash = 0.6;
          if (this.subT <= 0) {
            // frost nova along the ground + a ring of freezing orbs, then press the attack
            this.startWave('freeze', 15);
            const n = P2 ? 16 : 12;
            for (let i = 0; i < n; i++) this.fire((i / n) * TAU + rand(0, 0.2), 14, 0.55, '#bff0ff', false, p.chestY, { effect: 'freeze' });
            this.state = 'aimed'; this.sub = P2 ? 5 : 3; this.subT = 1.0;
          }
        }
        break;
      }
      case 'boulder': {
        idleMove(0.2);
        this.subT -= dt;
        this.anim = Math.max(0, this.anim - dt * 2);
        if (this.subT <= 0) {
          const hand = { x: this.pos.x + Math.sin(this.facing + 0.6) * 4, y: this.pos.y + 12, z: this.pos.z + Math.cos(this.facing + 0.6) * 4 };
          const T = 1.5;
          const tx2 = p.pos.x + p.vel.x * T * 0.7 + rand(-2, 2), tz2 = p.pos.z + p.vel.z * T * 0.7 + rand(-2, 2);
          this.lob(hand.x, hand.y, hand.z, tx2, World.arenaFloor(tx2, tz2), tz2, T, 20, 1.2, '#b89a6a', { big: true });
          this.anim = 1;
          Sound.play('throw');
          this.sub--; this.subT = P2 ? 0.55 : 0.8;
          if (this.sub <= 0) { this.state = 'idle'; this.stateT = 1.3; }
        }
        break;
      }
      case 'flame': {
        idleMove(0.35);
        this.subT -= dt;
        const sweep = ang + Math.sin(this.t * (P2 ? 3.2 : 2.4)) * 0.55;
        faceTo = sweep;
        if (this.subT <= 0) {
          this.subT = 0.045;
          const m = this.muzzle();
          const a = sweep + rand(-0.12, 0.12), spd = rand(20, 26);
          const vy = ((p.chestY - m.y) / Math.max(4, dd)) * spd;
          G.spawnEnemyBullet(m.x + Math.sin(a) * 2.5, m.y, m.z + Math.cos(a) * 2.5, Math.sin(a) * spd, vy, Math.cos(a) * spd, this.dmg * 0.35, 0.55, pick(['#ff6a1a', '#ffb347', '#ffd23f']), 0, { effect: 'fire', life: 1 });
          Fx.trail(m.x + Math.sin(a) * 3, m.y, m.z + Math.cos(a) * 3, '#ff8a3a', 1.2, 0.35, 3);
          if (Math.random() < 0.2) Sound.play('missile', null, 0.5);
        }
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 1.1; }
        break;
      }
      case 'meteor': {
        idleMove(0.4);
        this.subT -= dt;
        for (const mk of this.markers) mk.sprite.scale.setScalar(4 + Math.sin(this.t * 20) * 1);
        if (this.meteorState === 'mark' && this.subT <= 0) {
          for (const mk of this.markers) {
            const sx = mk.x + rand(-6, 6), sz = mk.z + rand(-6, 6);
            this.lob(sx, mk.y + 45, sz, mk.x, mk.y, mk.z, 1.0, 20, 1.1, '#ff5a1a', { effect: 'fire', marker: mk.sprite, meteor: true });
          }
          this.markers = [];
          Sound.play('bomb');
          this.meteorState = 'fall'; this.subT = 1.4;
        } else if (this.meteorState === 'fall' && this.subT <= 0) { this.state = 'idle'; this.stateT = 1; }
        break;
      }
      case 'vanish': {
        this.subT -= dt;
        if (this.vState === 'fade') {
          this.model.visible = Math.sin(this.t * 60) > 0;
          if (this.subT <= 0) {
            this.vState = 'gone'; this.subT = rand(1.3, 2.2) - (P2 ? 0.4 : 0);
            this.hidden = true; this.model.visible = false;
            Fx.glowBurst(this.pos.x, this.cy, this.pos.z, this.color, 6, 0.4, 3);
            Sound.play('portal');
          }
        } else if (this.vState === 'gone') {
          override = true;
          if (this.subT <= 0) {
            // reappear behind the player and dive straight in
            const back = p.yaw;
            const A = World.arena;
            let nx = p.pos.x + Math.sin(back) * 13, nz = p.pos.z + Math.cos(back) * 13;
            const ad = Math.hypot(nx - A.x, nz - A.z); if (ad > A.r - 5) { nx = A.x + (nx - A.x) / ad * (A.r - 5); nz = A.z + (nz - A.z) / ad * (A.r - 5); }
            this.pos.set(nx, this.ground + 8, nz); this.hover = 8;
            this.hidden = false; this.model.visible = true;
            Fx.glowBurst(this.pos.x, this.cy, this.pos.z, '#ffffff', 7, 0.3, 4);
            Fx.shockRing(this.pos.x, this.cy, this.pos.z, this.color, 4, 30);
            Sound.play('warn');
            this.state = 'dive'; this.dState = 'aim'; this.subT = P2 ? 0.5 : 0.7; this.sub = 1;
          }
        }
        break;
      }
      case 'dive': {
        this.subT -= dt;
        if (this.dState === 'aim') {
          this.hoverTarget = 9;
          this.dTarget = { x: p.pos.x, y: p.pos.y + 1, z: p.pos.z };
          setBeam(this.teleLine, this.pos.x, this.cy, this.pos.z, p.pos.x, p.pos.y + 1, p.pos.z, 0.9);
          this.teleLine.material.opacity = 0.2 + 0.2 * Math.sin(this.t * 30);
          if (this.subT <= 0) {
            this.dState = 'go'; this.subT = 0.8;
            const ux = this.dTarget.x - this.pos.x, uy = this.dTarget.y - this.cy, uz = this.dTarget.z - this.pos.z, ul = Math.hypot(ux, uy, uz) || 1;
            this.dVel = { x: ux / ul * 40, y: uy / ul * 40, z: uz / ul * 40 };
            Sound.play('dash'); Fx.addShake(0.3);
          }
        } else if (this.dState === 'go') {
          override = true;
          this.pos.x += this.dVel.x * dt; this.pos.z += this.dVel.z * dt;
          this.hover = Math.max(1.5, this.hover + this.dVel.y * dt);
          faceTo = Math.atan2(this.dVel.x, this.dVel.z);
          Fx.trail(this.pos.x + rand(-2, 2), this.cy + rand(-1, 1), this.pos.z + rand(-2, 2), this.color, 2, 0.4, 2);
          if (this.subT <= 0) {
            this.sub--;
            if (this.sub > 0) { this.dState = 'aim'; this.subT = 0.6; this.hover = 6; }
            else { this.state = 'idle'; this.stateT = 1; this.hoverTarget = this.K.hover; }
          }
        }
        break;
      }
      case 'sonar': {
        // the Warden's song: a ring of sound sweeps out at its own depth
        this.subT -= dt;
        this.anim = this.sonarState === 'charge' ? 1 : 0;
        if (this.subT <= 0) {
          this.startWave('sonar', P2 ? 19 : 15);
          this.sub--; this.subT = P2 ? 1.1 : 1.5;
          if (this.sub <= 0) { this.state = 'idle'; this.stateT = 1.6; }
        }
        break;
      }
      case 'gust': {
        this.hoverTarget = 7;
        const ux = dx / dd, uz = dz / dd;
        if (!p.dead) { p.vel.x += ux * 30 * dt; p.vel.z += uz * 30 * dt; }
        for (let i = 0; i < 3; i++) {
          const a = ang + rand(-0.5, 0.5), r = rand(2, 20);
          Fx.trail(this.pos.x + Math.sin(a) * r, p.pos.y + rand(0, 3), this.pos.z + Math.cos(a) * r, '#dff6ff', 0.4, 0.3, 1.5);
        }
        if (Math.random() < dt * 4) this.fire(ang + rand(-0.3, 0.3), 26, 0.3, '#ffe14d');
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 1; }
        break;
      }
    }

    if (!override) {
      if (!(this.state === 'charge' && this.chargeState === 'go')) {
        const k = 1 - Math.exp(-3 * dt);
        this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k;
      }
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    }
    // stay inside the arena
    const A = World.arena, ad = Math.hypot(this.pos.x - A.x, this.pos.z - A.z), lim = A.r - 4;
    if (ad > lim) { this.pos.x = A.x + ((this.pos.x - A.x) / ad) * lim; this.pos.z = A.z + ((this.pos.z - A.z) / ad) * lim; }
    if (this.K.ground) {
      if (this.state === 'intro') this.hover = lerp(this.hover, 0, 1 - Math.exp(-2.2 * dt));
      else if (!(this.state === 'pounce' && this.pState === 'leap')) this.hover = 0;
      this.pos.y = this.ground + this.hover;
    } else if (!override || this.state === 'dive') {
      const hk = this.slamState === 'drop' && this.state === 'slam' ? 1 - Math.exp(-18 * dt) : 1 - Math.exp(-(this.state === 'intro' ? 1.2 : 3) * dt);
      if (!(this.state === 'dive' && this.dState === 'go')) this.hover = lerp(this.hover, this.hoverTarget, hk);
      this.pos.y = lerp(this.pos.y, this.ground + this.hover + Math.sin(this.t * 1.5) * 0.3, this.state === 'intro' ? 1 - Math.exp(-1.5 * dt) : 1);
    }
    this.facing += angDiff(this.facing, faceTo) * (1 - Math.exp(-(this.kind === 'titan' ? 1.5 : 5) * dt));

    // shockwave (slam / stomp / frost nova)
    if (this.wave) {
      const w = this.wave;
      w.r += dt * w.speed;
      this.shock.position.set(w.x, w.y, w.z);
      this.shock.scale.set(w.r, w.r, 1);
      this.shock.material.opacity = Math.max(0, 1 - w.r / 42);
      const pd = Math.hypot(p.pos.x - w.x, p.pos.z - w.z);
      const inRing = w.effect === 'sonar' ? Math.abs(pd - w.r) < 1.4 && Math.abs(p.pos.y + 1 - w.y) < 1.8 : Math.abs(pd - w.r) < 1.1 && p.pos.y < World.arenaFloor(p.pos.x, p.pos.z) + 0.7;
      if (!w.hit && inRing) {
        w.hit = true;
        if (w.effect === 'freeze') { p.hurt(this.dmg * 0.8, this.pos); p.freeze(1.8); }
        else if (w.effect === 'sonar') { p.hurt(this.dmg * 1.3, this.pos); p.slowT = Math.max(p.slowT, 2.5); Fx.tintFlash('#4ae0d0', 0.4); }
        else { p.hurt(this.dmg * 1.6, this.pos); p.vel.y = 7; }
      }
      if (w.r > 42) { this.wave = null; this.shock.visible = false; }
    }

    // contact
    if (!this.hidden) {
      const cyP = this.aimY(p.chestY);
      if (dd < this.r + p.r + 0.5 && Math.abs(p.chestY - cyP) < this.r + 1 && this.contactCd <= 0) {
        p.hurt(this.dmg * 1.6, this.pos);
        this.contactCd = 0.8;
        p.vel.x += (dx / dd) * 14; p.vel.z += (dz / dd) * 14; p.vel.y = 6;
      }
      for (const c of G.companions) if (c.active && Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z) < this.r + c.r && Math.abs(c.pos.y - this.aimY(c.pos.y)) < this.r) c.hurt(40 * dt);
    }
    this.animate(dt, P2);
  }

  animate(dt, P2) {
    const m = this.model, P = m.userData.parts, p = G.player;
    m.position.copy(this.pos);
    m.rotation.y = this.facing;
    const spd = Math.hypot(this.vel.x, this.vel.z);
    this.walkPh += dt * (1 + spd * 0.8);
    const ph = this.walkPh;
    switch (this.kind) {
      case 'beast': {
        const w = clamp(spd / 6, 0, 1);
        P.legs.forEach((L, i) => {
          const o = (i === 0 || i === 3 ? 0 : Math.PI);
          L.hip.rotation.x = Math.sin(ph * 2.4 + o) * 0.6 * w - (this.anim < 0 ? 0.5 : 0);
          L.knee.rotation.x = Math.max(0, Math.cos(ph * 2.4 + o)) * 0.8 * w + (this.anim < 0 ? 0.9 : 0);
        });
        P.torso.position.y = 3.6 + Math.abs(Math.sin(ph * 2.4)) * 0.15 * w + (this.anim < 0 ? -0.8 : 0);
        P.torso.rotation.x = this.state === 'stomp' ? -0.6 * Math.max(0, this.anim) : this.state === 'pounce' && this.pState === 'leap' ? -0.25 : 0;
        P.head.rotation.x = Math.sin(this.t * 3) * 0.08;
        P.jaw.rotation.x = this.anim > 0 && this.state !== 'stomp' ? 0.5 : 0.05 + Math.sin(this.t * 5) * 0.05;
        if (this.state !== 'stomp') this.anim = this.anim > 0 ? Math.max(0, this.anim - dt * 2) : this.anim;
        P.tail.rotation.z = Math.sin(this.t * 6) * 0.4;
        break;
      }
      case 'frost': {
        P.ring.rotation.y += dt * (P2 ? 1.4 : 0.7);
        P.arms.forEach((a, i) => { a.position.y = 0.6 + Math.sin(this.t * 2 + i * 2) * 0.35; a.rotation.z = (i ? -1 : 1) * (this.state === 'freeze' ? 0.8 : 0.15); });
        P.core.scale.setScalar(1 + 0.2 * Math.sin(this.t * 6) + (this.state === 'freeze' ? 0.5 : 0));
        P.head.rotation.x = clamp((this.cy - p.chestY) / 30, -0.4, 0.4);
        break;
      }
      case 'titan': {
        const w = clamp(spd / 2.5, 0, 1);
        P.legs.forEach((L, i) => {
          const o = i ? Math.PI : 0;
          let hip = Math.sin(ph * 1.2 + o) * 0.35 * w, knee = Math.max(0, Math.cos(ph * 1.2 + o)) * 0.5 * w;
          if (this.state === 'stomp' && i === 0) { hip = -0.9 * Math.max(0, this.anim); knee = 1.2 * Math.max(0, this.anim); }
          L.hip.rotation.x = hip; L.knee.rotation.x = knee;
        });
        P.arms.forEach((A2, i) => {
          A2.sh.rotation.x = Math.sin(ph * 1.2 + (i ? 0 : Math.PI)) * 0.25 * w - (this.state === 'aimed' || this.state === 'radial' ? 1.2 : 0) - (i === 1 && this.state === 'boulder' ? 2.4 * this.anim : 0);
          A2.el.rotation.x = -0.3;
        });
        P.torso.rotation.y = Math.sin(this.t * 0.8) * 0.1;
        P.head.rotation.y = clamp(angDiff(this.facing, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z)), -0.8, 0.8);
        P.head.rotation.x = clamp((this.pos.y + 17 - p.chestY) / 40, -0.2, 0.6);
        break;
      }
      case 'fire': {
        P.flames.forEach((f, i) => f.scale.setScalar((2 + (i % 3) * 0.6) * (0.85 + Math.random() * 0.3)));
        P.arms.forEach((a, i) => { a.position.y = 0.8 + Math.sin(this.t * 3 + i * 2) * 0.3; a.rotation.x = this.state === 'flame' || this.state === 'meteor' ? -1.3 : Math.sin(this.t * 2 + i) * 0.2; });
        P.tail.scale.set(1 + Math.sin(this.t * 12) * 0.08, 1 + Math.sin(this.t * 9) * 0.12, 1 + Math.sin(this.t * 12) * 0.08);
        if (Math.random() < dt * 20) Fx.trail(this.pos.x + rand(-2, 2), this.pos.y + rand(-3, 3), this.pos.z + rand(-2, 2), pick(['#ff6a1a', '#ffb347']), rand(0.8, 1.6), 0.6, 3);
        break;
      }
      case 'deep': {
        // the tail undulates; fins scull; the song rings glow brighter while it sings
        P.tail.forEach((seg, i) => { seg.rotation.y = Math.sin(this.t * 2.2 - i * 0.8) * (0.25 + i * 0.08); });
        P.fins.forEach((f, i) => { f.rotation.z = (i ? -1 : 1) * (0.3 + Math.sin(this.t * 2.5) * 0.25); });
        P.rings.forEach((r, i) => { r.rotation.z += dt * (i % 2 ? 1 : -1) * (this.state === 'sonar' ? 3 : 0.6); r.scale.setScalar(1 + (this.state === 'sonar' ? 0.15 * Math.sin(this.t * 12 + i) : 0)); });
        m.rotation.x = clamp((this.vel.y || 0) * -0.05, -0.3, 0.3);
        if (Math.random() < dt * 6) Fx.glow.emit(this.pos.x + rand(-2, 2), this.pos.y + rand(-1, 2), this.pos.z + rand(-2, 2), 0, rand(1, 3), 0, rand(1.5, 3), 0.15, new THREE.Color('#dff6ff'), 1.2, 0, 0, 1);
        break;
      }
      case 'bird': {
        const diving = this.state === 'dive' && this.dState === 'go';
        const f = diving ? -0.1 : Math.sin(this.t * (this.state === 'gust' ? 14 : 5));
        P.wings.forEach((W) => {
          W.inner.rotation.z = W.side * (diving ? 0.9 : f * 0.45);
          W.outer.rotation.z = W.side * (diving ? 0.6 : f * 0.35 + 0.05);
          W.inner.rotation.y = diving ? -W.side * 0.6 : 0;
        });
        P.tail.rotation.x = Math.sin(this.t * 3) * 0.12;
        m.rotation.x = diving ? 0.5 : -0.05;
        m.rotation.z = clamp(-angDiff(this.facing, Math.atan2(this.vel.x, this.vel.z)) * 0.6, -0.5, 0.5) * clamp(spd / 8, 0, 1);
        break;
      }
      default:
        if (P.ring) P.ring.rotation.y += dt;
    }
    m.userData.bodyMat.emissiveIntensity = this.flash * 1.5 + (P2 ? 0.3 + 0.3 * Math.sin(this.t * 8) : 0) + (this.kind === 'fire' ? 0.6 : 0);
  }

  destroy() {
    this.clearMarkers();
    G.scene.remove(this.model, this.teleLine, this.shock, ...this.lasers);
  }
}

// ═════════════════════════ COMPANIONS ═════════════════════════
// Bots run on batteries. As a battery drains the bot takes more damage and aims worse; when it runs low
// the bot flies all the way home to a charging pad, recharges,
// then flies back out to you. Bots can also be swapped with ones kept at home.
//   state: follow · leaving (flying home) · charging (on a pad) · returning (flying back) · down
const COMP_TRAVEL_SPEED = 18;   // m/s when flying home to recharge and back
let _cid = 0;
class Companion {
  constructor(kind, battery = 100) {
    this.kind = kind;
    this.d = COMP_DEFS[kind];
    this.id = ++_cid;
    this.r = this.d.r;
    this.hp = this.maxHp;
    this.battery = battery;
    this.state = 'follow'; this.stateT = 0;
    const p = G.player;
    this.pos = new THREE.Vector3(p.pos.x + rand(-2, 2), p.pos.y + 2, p.pos.z + rand(-2, 2));
    this.cd = rand(0.2, 1);
    this.t = rand(0, 10);
    this.target = null; this.retarget = 0;
    this.flash = 0; this.pingT = 3; this.bubbleT = 2;
    this.model = buildCompanionModel(kind);
    this.inScene = false;
    this.attach();
    if (kind === 'laser' || kind === 'medic' || kind === 'bubble') {
      this.beam = makeBeam(kind === 'laser' ? this.d.color : kind === 'bubble' ? '#5ab8ff' : '#7dffd8', kind === 'laser' ? 5 : 2.5, kind === 'laser' ? 0.08 : 0.04, kind === 'laser' ? 0.95 : 0.6);
      G.scene.add(this.beam);
    }
  }
  get maxHp() { return this.d.hp * (1 + 0.3 * G.up.firmware); }
  get charge() { return this.battery / 100; }
  // weaker as the battery drains: less damage, more damage taken, worse aim
  get dmgMult() { return (1 + 0.3 * G.up.firmware) * (0.55 + 0.45 * this.charge); }
  get hurtMult() { return 1.35 + (1 - this.charge) * 1.2; }
  get spread() { return 0.04 + (1 - this.charge) * 0.32; }
  get chargeRate() { return (100 / 32) * (1 + 0.6 * ((G.base && G.base.charger) || 0)); }
  get active() { return this.state === 'follow' || this.state === 'returning'; }
  get offline() { return this.active ? 0 : 1; }   // legacy flag for older checks
  get statusText() {
    const home = (s) => this.spot && !this.swapTo ? `Flying to ${this.spot.village.name} (${Math.round(Math.hypot(this.pos.x - this.spot.x, this.pos.z - this.spot.z))} m away)` : `${s} (${Math.round(Math.hypot(this.pos.x - World.home.x, this.pos.z - World.home.z))} m from home)`;
    if (this.swapTo && this.state === 'leaving') return home('Going home to swap');
    return { follow: this.battery < 30 ? 'Battery low' : 'Active', leaving: home('Flying home'), charging: this.spot ? `Charging at ${this.spot.village.name}` : this.hp < this.maxHp ? 'Repairing at base' : 'Charging at base', returning: `Flying back to you (${Math.round(Math.hypot(this.pos.x - G.player.pos.x, this.pos.z - G.player.pos.z))} m)`, down: 'Knocked out' }[this.state];
  }
  // fly straight toward a point at a steady speed; returns the remaining distance
  flyTo(x, y, z, speed, dt) {
    const dx = x - this.pos.x, dy = y - this.pos.y, dz = z - this.pos.z, d = Math.hypot(dx, dy, dz);
    const st = Math.min(d, speed * dt);
    if (d > 0.001) { this.pos.x += dx / d * st; this.pos.y += dy / d * st; this.pos.z += dz / d * st; }
    this.model.lookAt(x, y, z);
    return d - st;
  }

  attach() { if (!this.inScene) { G.scene.add(this.model); this.inScene = true; } if (this.beam) G.scene.add(this.beam); }
  detach() { G.scene.remove(this.model); this.inScene = false; if (this.beam) this.beam.visible = false; }
  destroy() { G.scene.remove(this.model); this.inScene = false; if (this.beam) G.scene.remove(this.beam); }

  hurt(dmg) {
    if (!this.active) return;
    this.hp -= dmg * this.hurtMult;
    this.flash = 1;
    if (this.hp <= 0) {
      this.hp = 0; this.state = 'down'; this.stateT = 2.5;
      Fx.explosion(this.pos.x, this.pos.y, this.pos.z, this.d.color, 0.6);
      UI.feed(`${this.d.name} knocked out${World.domeTrap ? '' : ' — flying home for repairs'}`, '#ff6b6b');
      Sound.play('explode', false);
    }
  }

  // the nearest place to recharge: home, or the charging post of a village you've visited
  pickSpot() {
    let best = null, bd = Math.hypot(this.pos.x - World.home.x, this.pos.z - World.home.z);
    const posts = (World.chargePosts || []).filter((c) => Villages.visited(c.village));
    const i = Math.max(0, G.companions.indexOf(this));
    for (const c of posts) {
      const d = Math.hypot(this.pos.x - c.x, this.pos.z - c.z);
      if (d < bd - 1) { bd = d; best = c; }
    }
    // two pads per post: share them out
    if (best) { const pads = posts.filter((c) => c.village === best.village); best = pads[i % pads.length]; }
    this.spot = best;
  }
  // where this bot charges right now (swaps always go home)
  chargePad() { return !this.swapTo && this.spot ? this.spot : this.pad(); }

  goCharge(why) {
    if (World.domeTrap) return;   // nobody leaves the boss dome
    this.pickSpot();
    this.state = 'leaving'; this.stateT = 1.4; this.target = null;
    if (this.spot) why += ` — charging at ${this.spot.village.name}`;
    UI.feed(`${this.d.name}: ${why} — returning to base`, '#ffd23f');
    Sound.play('online');
  }

  // called after loading a save: bots that were away sit on their charging pads
  onTravel() {
    const p = G.player;
    if (this.state === 'follow' || this.state === 'returning') {
      this.state = 'follow';
      this.pos.set(p.pos.x + rand(-2, 2), p.pos.y + 2, p.pos.z + rand(-2, 2));
    } else {
      this.state = 'charging';
      const pad = this.pad();
      this.pos.set(pad.x, pad.y, pad.z);
    }
    this.attach();
    this.target = null; this.model.rotation.z = 0; this.model.userData.parts.halo.visible = true;
  }

  pad() {
    const pads = World.chargePads;
    const i = G.companions.indexOf(this);
    return pads.length ? pads[Math.max(0, i) % pads.length] : { x: G.player.pos.x, y: G.player.pos.y + 2, z: G.player.pos.z };
  }

  // cross-country flight: keep well above the ground on the way
  cruise(x, y, z, dt) {
    const near = Math.hypot(x - this.pos.x, z - this.pos.z);
    const clear = World.floorAt(this.pos.x, this.pos.z) + (near > 25 ? 14 : 3);
    const ahead = near > 25 ? World.floorAt(this.pos.x + (x - this.pos.x) / near * 20, this.pos.z + (z - this.pos.z) / near * 20) + 14 : -1e9;
    const rest = this.flyTo(x, Math.max(y, clear, ahead), z, COMP_TRAVEL_SPEED, dt);
    if (Math.random() < dt * 10) Fx.trail(this.pos.x, this.pos.y, this.pos.z, this.d.color, 0.4, 0.3, 2);
    return near < 1 ? rest : near;
  }

  update(dt, idx, total) {
    const p = G.player;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.beam) this.beam.visible = false;
    const m = this.model;
    const hub = G.where === 'hub';

    switch (this.state) {
      case 'down': {
        const gy = World.floorAt(this.pos.x, this.pos.z, this.pos.y) + 0.4;
        this.pos.y = lerp(this.pos.y, Math.max(gy, WORLD.water + 0.4), 1 - Math.exp(-3 * dt));
        if (Math.random() < dt * 5) Fx.smoke(this.pos.x, this.pos.y, this.pos.z, 0.5, 1, rand(-0.3, 0.3), 1.2, rand(-0.3, 0.3));
        m.position.copy(this.pos); m.rotation.z = 0.8; m.userData.parts.halo.visible = false;
        if (!World.domeTrap) this.stateT -= dt;
        if (this.stateT <= 0) { this.pickSpot(); this.state = 'leaving'; this.stateT = 1.4; m.rotation.z = 0; }
        return;
      }
      case 'leaving': {
        // fly all the way home to a charging pad
        m.userData.parts.halo.visible = true;
        const pad = this.chargePad();
        const far = Math.hypot(pad.x - this.pos.x, pad.z - this.pos.z);
        if (far > 3) this.cruise(pad.x, pad.y + 4, pad.z, dt);
        else {
          const k = 1 - Math.exp(-3 * dt);
          this.pos.x += (pad.x - this.pos.x) * k; this.pos.y += (pad.y - this.pos.y) * k; this.pos.z += (pad.z - this.pos.z) * k;
          if (far < 0.4 && Math.abs(pad.y - this.pos.y) < 0.4) {
            if (this.swapTo) { G.completeSwap(this); return; }
            this.state = 'charging'; Sound.play('online', null, 0.6 * G.vol(this.pos));
          }
        }
        m.position.copy(this.pos);
        return;
      }
      case 'charging': {
        if (this.swapTo) { G.completeSwap(this); return; }
        const pad = this.chargePad();
        this.pos.set(pad.x, pad.y + Math.sin(this.t * 2) * 0.08, pad.z);
        this.battery = Math.min(100, this.battery + this.chargeRate * 1.4 * dt);
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.08 * dt);
        if (Math.random() < dt * 6 && G.vol(this.pos) > 0.2) Fx.glow.emit(pad.x + rand(-0.5, 0.5), pad.y - 1, pad.z + rand(-0.5, 0.5), 0, rand(1, 2), 0, 0.8, 0.1, new THREE.Color('#6bff9e'), 2, 0, 0, 1);
        m.position.copy(this.pos); m.rotation.set(0, this.t * 0.8, 0);
        m.userData.bodyMat.emissiveIntensity = 0.2 + 0.2 * Math.sin(this.t * 5);
        if (this.battery >= 100 && this.hp >= this.maxHp) {
          const near = Math.hypot(G.player.pos.x - pad.x, G.player.pos.z - pad.z) < 30;
          this.spot = null;
          if (hub || near) { this.state = 'follow'; UI.feed(`${this.d.name} fully charged`, this.d.color); Sound.play('online', null, 0.6); }
          else { this.state = 'returning'; UI.feed(`${this.d.name} is charged and flying back to you`, this.d.color); }
        }
        return;
      }
    }

    // ── returning: a long flight from home base back to the player ──
    if (this.state === 'returning') {
      const far = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      if (far > 8) {
        this.cruise(p.pos.x, p.pos.y + this.d.height + 2, p.pos.z, dt);
        if (World.domeTrap && Math.hypot(this.pos.x - World.arena.x, this.pos.z - World.arena.z) < World.arena.r + 6) World.keepInside(this.pos, this.r);
        m.position.copy(this.pos);
        return;
      }
    }
    // ── follow / returning ──
    if (!hub && this.state === 'follow') {
      this.battery = Math.max(0, this.battery - 0.45 * dt);
      if (this.battery < 15 && !World.domeTrap) { this.goCharge('battery low'); return; }
    }
    if (hub && this.state === 'follow' && (this.battery < 95 || this.hp < this.maxHp * 0.95)) { this.spot = null; this.state = 'leaving'; return; }
    if (this.state === 'returning') this.state = 'follow';
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.01 * dt);

    // formation: fan out behind and beside the player so the squad rarely blocks the view
    const fa = Math.atan2(-Math.cos(p.yaw), -Math.sin(p.yaw));
    const rel = this.kind === 'shield'
      ? G.time * this.d.spin
      : Math.PI * 0.6 + (total > 1 ? idx / (total - 1) : 0.5) * Math.PI * 0.8 + Math.sin(this.t * 0.5 + idx) * 0.2;
    const a = fa + rel;
    const orbit = this.d.orbit + (this.kind === 'shield' ? 0 : 1.6);
    let tx = p.pos.x + Math.cos(a) * orbit, tz = p.pos.z + Math.sin(a) * orbit;
    let ty = p.inCave ? p.pos.y + 1.7 : Math.max(p.pos.y, World.floorAt(tx, tz, p.pos.y)) + this.d.height + Math.sin(this.t * 2) * 0.15;
    if (p.inCave) { tx = lerp(p.pos.x, tx, 0.4); tz = lerp(p.pos.z, tz, 0.4); }
    // bomber: fly over distant enemy groups to drop bombs
    if (this.kind === 'bomber' && this.target && !this.target.dead && this.charge > 0.05) {
      const T = this.target;
      if (Math.hypot(T.pos.x - p.pos.x, T.pos.z - p.pos.z) < 40) { tx = T.pos.x; tz = T.pos.z; ty = T.cy + 7; }
    }
    const k = 1 - Math.exp(-(this.kind === 'shield' ? 12 : this.state === 'returning' ? 3 : this.kind === 'bomber' ? 2.2 : 5) * dt);
    this.pos.x += (tx - this.pos.x) * k; this.pos.y += (ty - this.pos.y) * k; this.pos.z += (tz - this.pos.z) * k;
    if (this.state === 'returning' && Math.hypot(tx - this.pos.x, ty - this.pos.y, tz - this.pos.z) < 2) this.state = 'follow';
    if (World.domeTrap && Math.hypot(this.pos.x - World.arena.x, this.pos.z - World.arena.z) < World.arena.r + 6) World.keepInside(this.pos, this.r);
    // never drift into the player's face
    const ex = this.pos.x - p.pos.x, ey = this.pos.y - (p.pos.y + p.eye), ez = this.pos.z - p.pos.z;
    const ed = Math.hypot(ex, ey, ez);
    if (ed < 1.6 && ed > 0.001) { const s = 1.6 / ed; this.pos.x = p.pos.x + ex * s; this.pos.y = p.pos.y + p.eye + ey * s; this.pos.z = p.pos.z + ez * s; }

    this.retarget -= dt;
    const range = this.d.range;
    if (range && (this.retarget <= 0 || !this.target || this.target.dead)) {
      this.target = this.kind === 'bomber' ? G.nearestEnemy(p.pos.x, p.pos.z, range, null, true) : G.nearestEnemy(this.pos.x, this.pos.z, range, null, true);
      this.retarget = 0.3;
    }
    const T = this.target && !this.target.dead && !this.target.hidden && Math.hypot(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z) < range + (this.kind === 'bomber' ? 30 : 4) ? this.target : null;
    const powered = this.charge > 0.02;

    this.cd -= dt;
    const M = this.dmgMult, sp = this.spread;
    const jitter = (v) => { v.x += rand(-sp, sp); v.y += rand(-sp, sp) * 0.6; v.z += rand(-sp, sp); return v.normalize(); };
    switch (this.kind) {
      case 'gunner': case 'scout':
        if (T && this.cd <= 0 && powered) {
          const scout = this.kind === 'scout';
          this.cd = scout ? 0.6 : 0.42;
          const lead = this.pos.distanceTo(T.pos) / 70;
          const dir = jitter(new THREE.Vector3(T.pos.x + T.vel.x * lead - this.pos.x, T.cy - this.pos.y, T.pos.z + T.vel.z * lead - this.pos.z).normalize());
          G.spawnBolt(this.pos.x + dir.x * 0.5, this.pos.y + dir.y * 0.5, this.pos.z + dir.z * 0.5, dir, 70, (scout ? 3.5 : 5) * M, this.d.color, false);
          Fx.muzzle(this.pos.x + dir.x * 0.5, this.pos.y, this.pos.z + dir.z * 0.5, this.d.color);
          Sound.play('shoot', null, 0.3);
        }
        if (this.kind === 'scout') {
          // radar ping: reveal caches and Scrap Sprites on the compass
          this.pingT -= dt;
          if (this.pingT <= 0 && powered) {
            this.pingT = 6;
            let n = 0;
            for (const c of World.caches) if (!c.opened && !c.revealed && Math.hypot(c.x - this.pos.x, c.z - this.pos.z) < 90) { c.revealed = true; n++; }
            for (const s2 of World.sprites) if (!s2.found && !s2.revealed && Math.hypot(s2.x - this.pos.x, s2.z - this.pos.z) < 60) { s2.revealed = true; n++; }
            Fx.shockRing(this.pos.x, this.pos.y, this.pos.z, this.d.color, 3, 40);
            if (n) { UI.feed(`Scout Bot pinged ${n} hidden find${n > 1 ? 's' : ''}`, this.d.color); Sound.play('chirp'); }
          }
        }
        break;
      case 'medic': {
        let tgt = null;
        if (p.hp < p.maxHp && !p.dead) tgt = p;
        else {
          let lo = 0.999;
          for (const c of G.companions) if (c !== this && c.active && c.hp / c.maxHp < lo) { lo = c.hp / c.maxHp; tgt = c; }
        }
        if (tgt && powered) {
          const amt = (tgt === p ? 2.25 : 5) * M * dt;
          if (tgt === p) p.heal(amt); else tgt.hp = Math.min(tgt.maxHp, tgt.hp + amt);
          const ty2 = tgt === p ? p.pos.y + 0.9 : tgt.pos.y;
          // gentle pulses instead of a constant beam: a faint thread flickers on briefly every ~1.5 s
          const ph = this.t % 1.5;
          if (ph < 0.14) {
            setBeam(this.beam, this.pos.x, this.pos.y, this.pos.z, tgt.pos.x, ty2, tgt.pos.z, 0.012);
            this.beam.material.opacity = 0.22 * (1 - ph / 0.14);
            if (!this.pulsed) { this.pulsed = true; Fx.glowBurst(tgt.pos.x, ty2 + 0.4, tgt.pos.z, this.d.color, 0.5, 0.35, 1.2); Sound.play('heal', null, 0.15); }
          } else this.pulsed = false;
        }
        break;
      }
      case 'bubble': {
        if (p.shield <= 0 && !p.dead && powered) {
          this.bubbleT -= dt;
          if (this.bubbleT <= 0) {
            p.shieldMax = Math.round(30 * M); p.shield = p.shieldMax;
            this.bubbleT = 12;
            setBeam(this.beam, this.pos.x, this.pos.y, this.pos.z, p.pos.x, p.pos.y + 1, p.pos.z);
            Fx.glowBurst(p.pos.x, p.pos.y + 1, p.pos.z, '#5ab8ff', 3, 0.4, 3);
            Sound.play('online', null, 0.6);
          }
        }
        break;
      }
      case 'tesla':
        if (T && this.cd <= 0 && powered) {
          this.cd = 1.4;
          if (Math.random() < this.spread * 1.5) { Sound.play('zap', null, 0.4); break; }   // fizzles when drained
          const hit = new Set();
          let from = { x: this.pos.x, y: this.pos.y + 0.6, z: this.pos.z }, cur = T;
          for (let i = 0; i < 4 && cur; i++) {
            hit.add(cur);
            Fx.bolt(from.x, from.y, from.z, cur.pos.x, cur.cy, cur.pos.z, this.d.color);
            G.damageEnemy(cur, 12 * M, cur.pos.x, cur.cy, cur.pos.z, this.d.color);
            from = { x: cur.pos.x, y: cur.cy, z: cur.pos.z };
            cur = G.nearestEnemy(from.x, from.z, 14, hit);
          }
          Sound.play('zap', null, G.vol(this.pos));
        }
        break;
      case 'rocket':
        if (T && this.cd <= 0 && powered) {
          this.cd = 2.4;
          for (const s of [-1, 1]) {
            const v = new THREE.Vector3(Math.cos(a + Math.PI / 2) * s * 4 + rand(-sp, sp) * 20, 7, Math.sin(a + Math.PI / 2) * s * 4 + rand(-sp, sp) * 20);
            G.spawnMissile(this.pos.x + s * 0.4, this.pos.y + 0.3, this.pos.z, v, 18 * M, T);
          }
          Sound.play('missile', null, 0.6);
        }
        break;
      case 'bomber':
        if (T && this.cd <= 0 && powered && Math.hypot(T.pos.x - this.pos.x, T.pos.z - this.pos.z) < 3 + sp * 8 && Math.hypot(T.pos.x - p.pos.x, T.pos.z - p.pos.z) > 6) {
          this.cd = 3.5;
          G.spawnBomb(this.pos.clone(), new THREE.Vector3(0, -2, 0), 45 * M);
          Sound.play('throw', null, 0.6);
        }
        break;
      case 'laser':
        if (T && powered) {
          const wob = sp * 3;
          const lx = T.pos.x + Math.sin(this.t * 7) * wob, lz = T.pos.z + Math.cos(this.t * 5) * wob;
          setBeam(this.beam, this.pos.x, this.pos.y, this.pos.z, lx, T.cy, lz, 0.06 + 0.02 * Math.sin(this.t * 60));
          if (Math.hypot(lx - T.pos.x, lz - T.pos.z) < T.r + 0.3) G.damageEnemy(T, 28 * M * dt, T.pos.x, T.cy, T.pos.z, this.d.color, true);
          if (Math.random() < dt * 25) Fx.spark(lx, T.cy, lz, rand(-1, 1), rand(0, 1), rand(-1, 1), rand(3, 6), this.d.color, 0.25, 0.1, 4);
          Sound.play('laser', null, 0.35);
        }
        break;
    }

    m.position.copy(this.pos);
    if (T && this.kind !== 'bomber') m.lookAt(T.pos.x, T.cy, T.pos.z);
    else m.rotation.set(0, p.yaw + Math.PI, 0);
    const P = m.userData.parts;
    if (P.rotors) P.rotors.forEach((r, i) => (r.rotation.y += dt * 40 * (i % 2 ? 1 : -1)));
    if (P.arcs) { P.arcs.rotation.x += dt * 2; P.arcs.rotation.y += dt * 3; }
    if (P.orb) P.orb.scale.setScalar(1 + 0.3 * Math.sin(this.t * 20));
    if (P.dish) P.dish.rotation.y += dt * 3;
    // low battery: the halo flickers
    P.halo.visible = this.charge > 0.3 || Math.sin(this.t * 14) > 0;
    m.userData.bodyMat.emissiveIntensity = 0.05 + this.flash * 2;
  }
}
