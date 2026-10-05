'use strict';
// ═════════════════════════ Renderer & scene ═════════════════════════
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 750);
camera.rotation.order = 'YXZ';
scene.add(camera);
const post = new PostFX(renderer);
Fx.init(scene);

let W = 0, H = 0, DPR = 1;
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  const low = G.settings.quality === 'low';
  DPR = Math.min(window.devicePixelRatio || 1, low ? (Touch.enabled ? 0.9 : 0.75) : 1.25);
  post.setSamples(low ? 0 : 4);
  camera.far = low ? 520 : 750;
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H, false);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  camera.aspect = W / H; camera.updateProjectionMatrix();
  post.setSize(W, H, DPR);
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c3 = new THREE.Vector3(), _cv = new THREE.Vector3();
const boltGeo = new THREE.BoxGeometry(0.07, 0.07, 1.4);
const bulletGeo = new THREE.IcosahedronGeometry(1, 1);
const missileGeo = (() => { const g = new THREE.CylinderGeometry(0.07, 0.09, 0.5, 6); g.rotateX(Math.PI / 2); return g; })();

// ═════════════════════════ Game state ═════════════════════════
const G = {
  state: 'menu',
  level: 0, time: 0, timeScale: 1,
  settings: { sens: 1, invert: false, quality: 'high', view: 'first' },
  vessels: 0, spritesFound: 0, updrafts: [], focus: false,
  where: 'hub',                 // 'hub' (near home base) or 'biome' (anywhere else in the world)
  region: null,                 // REGIONS entry the player is in
  bar: [], sel: 0, weapon: 'blaster',   // Minecraft-style hotbar: one item per slot
  storage: {}, bucks: 0,        // unlimited storage at home · Botbucks
  reserve: [],                  // bots waiting at home base: { kind, battery, hp, t }
  gear: { jetpack: false, fireboots: false, backpack: 0 },
  base: { shield: false, charger: 0 },
  progress: { beaten: [false, false, false, false, false], world: { seed: 0 }, story: {} },
  scene, camera,
  player: null,
  enemies: [], bullets: [], ebullets: [], pickups: [], spawns: [], companions: [],
  inv: {}, up: {}, repairKits: 0, cells: 0,
  stats: {}, total: {}, snapshot: null,
  objective: 'beacons', boss: null, levelDone: false, dying: 0,
  fov: { base: 75, cur: 75, kick: 0 },
  reinforceT: 40, musicT: 0,

  get slots() { return 3 + this.up.slot; },
  get barSize() { return 9 + 3 * this.gear.backpack; },

  // ─── hotbar & storage helpers. Items: { t: 'part'|'weapon'|'supply', id, n } ───
  // parts and supplies stack up to 20 per slot; weapons take a slot each
  MAX_STACK: 20,
  itemKey(it) { return it.t + ':' + it.id; },
  stackable(it) { return it.t !== 'weapon'; },
  countItem(t, id) { return this.bar.reduce((n, it) => n + (it && it.t === t && it.id === id ? it.n || 1 : 0), 0); },
  freeSlots() { let n = 0; for (let i = 0; i < this.barSize; i++) if (!this.bar[i]) n++; return n; },
  // how many more of this item fit in the hotbar
  room(it) {
    let r = 0;
    for (let i = 0; i < this.barSize; i++) {
      const s = this.bar[i];
      if (!s) r += this.stackable(it) ? this.MAX_STACK : 1;
      else if (this.stackable(it) && s.t === it.t && s.id === it.id) r += this.MAX_STACK - (s.n || 1);
    }
    return r;
  },
  canAdd(it) { return this.room(it) > 0; },
  addItem(it) {
    if (this.stackable(it)) {
      for (let i = 0; i < this.barSize; i++) {
        const s = this.bar[i];
        if (s && s.t === it.t && s.id === it.id && (s.n || 1) < this.MAX_STACK) { s.n = (s.n || 1) + 1; UI.hotbarDirty = true; return true; }
      }
    }
    for (let i = 0; i < this.barSize; i++) if (!this.bar[i]) { this.bar[i] = { t: it.t, id: it.id, n: 1 }; UI.hotbarDirty = true; return true; }
    return false;
  },
  takeItem(t, id) {
    // take from the end so the weapons at the front stay put
    for (let i = this.barSize - 1; i >= 0; i--) {
      const it = this.bar[i];
      if (it && it.t === t && it.id === id) {
        it.n = (it.n || 1) - 1;
        if (it.n <= 0) { this.bar[i] = null; this.checkWeapon(); }
        UI.hotbarDirty = true;
        return true;
      }
    }
    return false;
  },
  get repairKits() { return this.countItem('supply', 'repair'); },
  get cells() { return this.countItem('supply', 'cell'); },
  partCount(k, useStorage) { return this.countItem('part', k) + (useStorage ? this.storage['part:' + k] || 0 : 0); },
  canAfford(cost, useStorage) { return Object.entries(cost).every(([k, v]) => this.partCount(k, useStorage) >= v); },
  consume(cost, useStorage) {
    for (const [k, v] of Object.entries(cost)) {
      let need = v;
      if (useStorage) { const s = this.storage['part:' + k] || 0, u = Math.min(s, need); this.storage['part:' + k] = s - u; need -= u; }
      while (need > 0 && this.takeItem('part', k)) need--;
    }
  },
  store(it, n = 1) { const k = this.itemKey(it); this.storage[k] = (this.storage[k] || 0) + n; },
  // the weapon in hand: the selected slot if it holds one, otherwise the last weapon you held
  selectSlot(i) {
    this.sel = (i + this.barSize) % this.barSize;
    const it = this.bar[this.sel];
    if (it && it.t === 'weapon' && it.id !== this.weapon) this.equip(it.id);
    UI.hotbarDirty = true;
  },
  equip(id) {
    this.weapon = id;
    setViewModelWeapon(this.vm, id, 1 + this.up.split);
    if (this.avatar) this.avatar.userData.flash.material.color.set(WEAPONS[id].color).multiplyScalar(4);
    if (this.player) this.player.fireCd = Math.max(this.player.fireCd, 0.15);
    UI.feed(WEAPONS[id].name, WEAPONS[id].color);
  },
  checkWeapon() {
    if (this.bar.some((it) => it && it.t === 'weapon' && it.id === this.weapon)) return;
    const w = this.bar.find((it) => it && it.t === 'weapon');
    this.weapon = w ? w.id : 'blaster';
    setViewModelWeapon(this.vm, this.weapon, 1 + this.up.split);
  },

  // ─── squad & bots kept at home ───
  get chargeRate() { return (100 / 32) * (1 + 0.6 * this.base.charger); },
  reserveBattery(e) { return Math.min(100, e.battery + Math.max(0, this.time - (e.t || 0)) * this.chargeRate); },
  // a new bot joins the squad, or waits at home base if the squad is full
  addBot(kind) {
    if (this.companions.length < this.slots) {
      this.companions.push(new Companion(kind));
      this.refreshReserveModels();
      return 'squad';
    }
    this.reserve.push({ kind, battery: 100, hp: null, t: this.time });
    this.refreshReserveModels();
    return 'home';
  },
  // send an active bot home; when it gets there, `e` (a bot at home) sets off to replace it
  requestSwap(c, e) {
    if (World.domeTrap) { UI.toast('Nobody can leave the boss dome until the boss is destroyed', true); return false; }
    if (c.swapTo) return false;
    if (e) e.pending = true;
    c.swapTo = e || { home: true };
    if (c.state === 'follow' || c.state === 'returning' || c.state === 'down') {
      c.state = 'leaving'; c.target = null;
      UI.feed(`${c.d.name} is heading home${e ? ` to swap with ${COMP_DEFS[e.kind].name}` : ''}`, c.d.color);
    } else if (c.state === 'charging') this.completeSwap(c);
    else c.swapTo = c.swapTo;   // already in transit: it swaps once it reaches home
    return true;
  },
  completeSwap(c) {
    const e = c.swapTo && !c.swapTo.home ? c.swapTo : null;
    const i = this.companions.indexOf(c);
    c.swapTo = null;
    c.destroy();
    this.reserve.push({ kind: c.kind, battery: c.battery, hp: c.hp, t: this.time });
    if (i >= 0) this.companions.splice(i, 1);
    if (e) {
      this.reserve.splice(this.reserve.indexOf(e), 1);
      const nc = new Companion(e.kind, this.reserveBattery(e));
      if (e.hp !== null && e.hp !== undefined) nc.hp = Math.min(nc.maxHp, e.hp + nc.maxHp * 0.5);
      this.companions.splice(Math.max(0, i), 0, nc);
      const pad = nc.pad(); nc.pos.set(pad.x, pad.y, pad.z);
      nc.state = this.where === 'hub' ? 'follow' : 'returning';
      UI.feed(`${nc.d.name} is on its way${this.where === 'hub' ? '' : ' — flying out from home base'}`, nc.d.color);
    } else UI.feed(`${c.d.name} is resting at home base`, c.d.color);
    this.refreshReserveModels();
    UI.squadSig = null;
    if (this.state === 'workshop') UI.renderWorkshop();
  },
  deployReserve(e) {
    if (this.companions.length >= this.slots) return;
    this.reserve.splice(this.reserve.indexOf(e), 1);
    const c = new Companion(e.kind, this.reserveBattery(e));
    if (e.hp !== null && e.hp !== undefined) c.hp = Math.min(c.maxHp, e.hp + c.maxHp * 0.5);
    this.companions.push(c);
    const pad = c.pad(); c.pos.set(pad.x, pad.y, pad.z);
    if (this.where !== 'hub') { c.state = 'returning'; UI.feed(`${c.d.name} is flying out from home base`, c.d.color); }
    this.refreshReserveModels();
  },
  // bots kept at home sit on the far charging pads
  refreshReserveModels() {
    for (const m of this.reserveModels || []) scene.remove(m);
    this.reserveModels = [];
    if (!World.chargePads || !World.chargePads.length) return;
    const pads = World.chargePads;
    this.reserve.slice(0, pads.length).forEach((e, k) => {
      const pad = pads[pads.length - 1 - k];
      const m = buildCompanionModel(e.kind);
      m.position.set(pad.x, pad.y, pad.z);
      m.rotation.y = Math.PI;
      scene.add(m);
      this.reserveModels.push(m);
    });
  },

  // aim assist: the enemy closest to the aim ray (within a narrow cone) — player shots curve into it
  assistTarget(o, d) {
    let best = null, bestA = 0.11;
    for (const e of this.enemies) {
      if (e.dead || e.hidden) continue;
      const tx = e.pos.x - o.x, ty = e.cy - o.y, tz = e.pos.z - o.z, L = Math.hypot(tx, ty, tz);
      if (L > 110 || L < 1.5) continue;
      const a = Math.acos(clamp((tx * d.x + ty * d.y + tz * d.z) / L, -1, 1));
      if (a < bestA) { bestA = a; best = e; }
    }
    return best;
  },
  banner(text, sub, color, dur = 3) { UI.banner(text, sub, color, dur); },
  get unarmed() { return !!(this.progress.story && this.progress.story.flags && !this.progress.story.flags.armed); },
  // Command Room: warp to a powered beacon (or home); the squad follows
  travelTo(x, z, y, label) {
    const p = this.player;
    Fx.tintFlash('#3cf2ff', 1); Sound.play('portal');
    p.pos.set(x, y ?? World.heightAt(x, z), z); p.vel.set(0, 0, 0); p.fallTop = p.pos.y; p.invuln = 2;
    p.gliding = false; p.climbing = null; p.jetting = false;
    for (const c of this.companions) if (c.active) c.pos.set(x + rand(-2, 2), p.pos.y + 2, z + rand(-2, 2));
    WorldMap.reveal(x, z, 120);
    UI.banner('ARRIVED', label || '', '#3cf2ff', 2);
  },
  hint(text) { UI.hint(text); },

  vol(pos) {
    const p = this.player.pos;
    return 1 / (1 + Math.hypot(pos.x - p.x, pos.z - p.z) / 18);
  },

  nearestEnemy(x, z, maxD, exclude, aggroOnly) {
    let best = null, bd = maxD * maxD;
    for (const e of this.enemies) {
      if (e.dead || e.hidden || (exclude && exclude.has(e))) continue;
      if (aggroOnly && !e.isBoss && !e.aggro && e.hp >= e.maxHp) continue;
      const dx = e.pos.x - x, dz = e.pos.z - z, dd = dx * dx + dz * dz;
      if (dd < bd) { bd = dd; best = e; }
    }
    return best;
  },

  // opts: { island, tier, boss (arena index) }
  queueSpawn(type, x, z, elite = false, t = 1.1, aggro = true, opts = {}) {
    const lim = World.half * 0.9;
    x = clamp(x, -lim, lim); z = clamp(z, -lim, lim);
    const y = type === 'boss' ? World.arenaFloor(x, z) : opts.island ? opts.island.top : World.floorAt(x, z);
    const color = type === 'boss' ? ZONES[opts.boss].boss.color : ENEMY_TYPES[type].color;
    const beam = makeBeam(color, 2.5, type === 'boss' ? 3 : 0.8, 0.5);
    setBeam(beam, x, y, z, x, y + 40, z);
    scene.add(beam);
    this.spawns.push({ type, x, z, y, elite, aggro, t, max: t, beam, color, island: opts.island || null, tier: opts.tier ?? this.level, boss: opts.boss });
  },

  damageEnemy(e, dmg, hx, hy, hz, color, quiet = false) {
    if (e.dead || e.hidden) return;
    e.hp -= dmg;
    e.flash = Math.max(e.flash, quiet ? 0.4 : 1);
    if (!e.isBoss && e.alert) e.alert();
    if (!quiet) {
      Fx.sparks(hx, hy, hz, 5, color, 7);
      Sound.play('hit', null, 0.8);
    }
    if (e.hp <= 0) this.killEnemy(e, true);
  },

  killEnemy(e, drops) {
    if (e.dead) return;
    e.dead = true;
    if (e.dummy) { Fx.explosion(e.pos.x, e.cy, e.pos.z, '#ffd23f', 0.6); Sound.play('explode', false); UI.hitmarker(true); e.destroy(); Story.event('target'); return; }
    if (e.isBoss) { this.bossKilled(e); return; }
    const big = e.r > 1.5;
    Fx.explosion(e.pos.x, e.cy, e.pos.z, e.d.color, e.r / 1.1 + (e.elite ? 0.5 : 0));
    Fx.addShake(big ? 0.35 : 0.1 * this.vol(e.pos) * 2);
    Sound.play('explode', big, this.vol(e.pos) * 1.4);
    this.stats.kills++;
    UI.hitmarker(true);
    e.destroy();
    if (!drops) return;
    for (const [part, ch, mn, mx] of e.d.drops) {
      if (Math.random() < ch) for (let i = randi(mn, mx); i > 0; i--) this.dropPart(part, e.pos.x, e.cy, e.pos.z);
    }
    if (e.elite) {
      if (Math.random() < 0.45) this.dropPart('quantum', e.pos.x, e.cy, e.pos.z);
      this.dropPart(pick(['core', 'circuit', 'lens', 'servo']), e.pos.x, e.cy, e.pos.z);
      this.dropPart('scrap', e.pos.x, e.cy, e.pos.z);
    }
    if (Math.random() < 0.06) this.dropPart('health', e.pos.x, e.cy, e.pos.z);
    if (Math.random() < 0.3 + (e.elite ? 0.5 : 0)) this.dropBucks(e.elite ? randi(8, 15) : randi(1, 4), e.pos.x, e.cy, e.pos.z);
  },

  dropBucks(v, x, y, z, burst = 1) {
    const model = buildPickupModel('bucks');
    model.position.set(x, y, z);
    scene.add(model);
    const a = rand(0, TAU), s = rand(2, 5) * burst;
    this.pickups.push({ type: 'bucks', value: v, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(Math.cos(a) * s, rand(4, 8), Math.sin(a) * s), t: 0, model, pulled: false, bob: rand(0, TAU) });
  },
  dropItem(it, x, y, z) {
    const model = buildPickupModel(it.t === 'part' ? it.id : 'item');
    model.position.set(x, y, z);
    scene.add(model);
    const d = this.player.forward(new THREE.Vector3());
    this.pickups.push({ type: it.t === 'part' ? it.id : 'item', item: it, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(d.x * 5, 4, d.z * 5), t: -1.2, model, pulled: false, bob: rand(0, TAU) });
  },

  dropPart(type, x, y, z, burst = 1) {
    const model = buildPickupModel(type);
    model.position.set(x, y, z);
    scene.add(model);
    const a = rand(0, TAU), s = rand(2, 5) * burst;
    this.pickups.push({ type, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(Math.cos(a) * s, rand(4, 8), Math.sin(a) * s), t: 0, model, pulled: false, bob: rand(0, TAU) });
  },

  spawnBolt(x, y, z, dir, speed, dmg, color, fromPlayer, life = 1.4, home = null) {
    const m = new THREE.Mesh(boltGeo, Mat.glow(color, fromPlayer ? 6 : 5));
    m.position.set(x, y, z);
    if (speed > 300) m.scale.set(0.7, 0.7, 2.6);
    _a.set(x + dir.x, y + dir.y, z + dir.z); m.lookAt(_a);
    scene.add(m);
    this.bullets.push({ kind: 'bolt', pos: new THREE.Vector3(x, y, z), vel: dir.clone().multiplyScalar(speed), dmg, color, life, mesh: m, fromPlayer, home });
  },

  // player rocket: flies straight (aim assist nudges it), big splash that hurts you too
  spawnRocket(x, y, z, dir, speed, dmg, splash, home) {
    const m = new THREE.Mesh(missileGeo, Mat.glow('#c6ff4d', 3));
    m.scale.setScalar(1.8); m.position.set(x, y, z); scene.add(m);
    this.bullets.push({ kind: 'rocket', pos: new THREE.Vector3(x, y, z), vel: dir.clone().multiplyScalar(speed), dmg, color: '#c6ff4d', life: 3, mesh: m, splash, fromPlayer: true, home });
  },

  // Bomber Bot payload
  spawnBomb(pos, vel, dmg) {
    const m = new THREE.Mesh(bulletGeo, Mat.glow('#ff7a3d', 4));
    m.scale.setScalar(0.25); m.position.copy(pos); scene.add(m);
    this.bullets.push({ kind: 'grenade', bomb: true, pos: pos.clone(), vel, dmg, color: '#ff7a3d', life: 4, mesh: m });
  },

  spawnMissile(x, y, z, vel, dmg, target) {
    const m = new THREE.Mesh(missileGeo, Mat.glow('#c6ff4d', 3));
    m.position.set(x, y, z); scene.add(m);
    this.bullets.push({ kind: 'missile', pos: new THREE.Vector3(x, y, z), vel, dmg, color: '#c6ff4d', life: 4, mesh: m, target, splash: 4.5 });
  },

  spawnGrenade(pos, vel) {
    const m = new THREE.Mesh(bulletGeo, Mat.glow('#b98cff', 5));
    m.scale.setScalar(0.18); m.position.copy(pos); scene.add(m);
    this.bullets.push({ kind: 'grenade', pos: pos.clone(), vel, dmg: 40 + this.level * 8, color: '#b98cff', life: 4, mesh: m });
  },

  // opts: { effect: 'frost'|'fire'|'freeze', grav, splash, life, marker, big }
  spawnEnemyBullet(x, y, z, vx, vy, vz, dmg, r, color, hugH = 0, opts = null) {
    const m = new THREE.Mesh(bulletGeo, opts && opts.big ? Mat.std(color, { rough: 0.9, metal: 0.1, emissive: '#ff8a3a', ei: 0.4 }) : Mat.glow(color, 4));
    m.scale.setScalar(r); m.position.set(x, y, z); scene.add(m);
    const o = opts || {};
    this.ebullets.push({ pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(vx, vy, vz), dmg, r, color, life: o.life || 5, mesh: m, hugH, effect: o.effect, grav: o.grav || 0, splash: o.splash || 0, marker: o.marker, meteor: o.meteor, fromBoss: !!(this.bossFiring || o.fromBoss) });
  },

  get thirdPerson() { return this.settings.view === 'third'; },
  muzzleWorld() { return (this.thirdPerson ? this.avatar.userData.muzzle : this.vm.userData.muzzle).getWorldPosition(_b); },

  aimPoint() {
    const o = camera.getWorldPosition(_a).clone();
    const d = camera.getWorldDirection(_c3).clone();
    let best = 220;
    // in third person the ray starts at the camera; skip the stretch behind the player
    const t0 = this.thirdPerson ? Math.max(1, o.distanceTo(_cv.set(this.player.pos.x, this.player.pos.y + 1.4, this.player.pos.z)) - 0.5) : 1;
    for (const e of this.enemies) {
      if (e.hidden) continue;
      const cx = e.pos.x - o.x, cy = e.cy - o.y, cz = e.pos.z - o.z;
      const t = cx * d.x + cy * d.y + cz * d.z;
      if (t < t0 || t > best) continue;
      const r = e.r + 0.2;
      const dd = cx * cx + cy * cy + cz * cz - t * t;
      if (dd < r * r) best = Math.min(best, t - Math.sqrt(r * r - dd));
    }
    for (let t = t0; t < best; t += 1.2) {
      if (World.solidAt(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t)) { best = t; break; }
    }
    return o.addScaledVector(d, Math.max(best, 3));
  },

  playerDied() {
    const p = this.player;
    p.dead = true;
    Fx.explosion(p.pos.x, p.pos.y + 1, p.pos.z, '#3cf2ff', 2);
    Fx.addShake(1);
    Sound.play('explode', true); Sound.play('lose');
    this.dying = 2.4; this.timeScale = 0.35;
    Sound.setIntensity(0);
    Input.mouse.down = false;
  },

  bossKilled(b) {
    Sound.play('explode', true);
    this.timeScale = 0.3;
    Fx.addShake(1.2);
    Fx.tintFlash('#ffffff', 1);
    this.bossDeath = { x: b.pos.x, y: b.pos.y, z: b.pos.z, t: 0, color: b.color };
    for (const e of this.enemies) if (!e.dead && !e.isBoss) e.doomT = rand(0.3, 1.4);
    for (const s of this.spawns) scene.remove(s.beam);
    this.spawns.length = 0;
    for (const bb of this.ebullets) bb.dead = true;
    b.destroy();
    const A = this.fight || World.arena, L = A.i;
    const loot = { scrap: 3, wire: 2, servo: 2, circuit: 2, core: 1 + Math.floor(L / 2), lens: 1 + Math.floor(L / 2), quantum: 1 + Math.floor(L / 2) };
    for (const [k, n] of Object.entries(loot)) for (let i = 0; i < n; i++) this.dropPart(k, b.pos.x, b.cy, b.pos.z, 2);
    for (let i = 0; i < 10; i++) this.dropBucks(15 + L * 10, b.pos.x, b.cy, b.pos.z, 2);
    this.stats.kills++;
    this.objective = 'explore'; this.fight = null; this.vacuumT = 8;
    World.openDome(A);
    this.progress.beaten[L] = true;
    Story.event('boss', L);
    Wardens.refreshLift();
    if (L !== 4 && Wardens.liftReady()) setTimeout(() => UI.banner('THE SKY LIFT WAKES', 'All five Wardens are free — ride the lift at home base to the citadel', '#ffe14d', 5), 7500);
    Sound.setIntensity(0);
    this.safeSpot = { x: A.x, y: A.y, z: A.z, yaw: this.player.yaw };
    saveGame();
    setTimeout(() => {
      Sound.play('portal');
      const left = WARDENS.filter((i) => !this.progress.beaten[i]).length;
      const sub = L === 4 ? 'The skies are free!' : left === 0 ? 'Every Warden is free — the Sky Lift at home base has woken' : `${left} Warden${left > 1 ? 's' : ''} remain — check your map`;
      this.banner(`${ZONES[L].boss.name} DESTROYED`, sub, '#6bff9e', 5);
      Sound.play('win');
      if (L === 4) setTimeout(() => Story.ending(), 2500);
    }, 1800);
  },
};

// ═════════════════════════ The world: setup, saving & regions ═════════════════════════
function clearEntities() {
  for (const e of G.enemies) e.destroy();
  for (const b of G.bullets) scene.remove(b.mesh);
  for (const b of G.ebullets) { scene.remove(b.mesh); if (b.marker) scene.remove(b.marker); }
  for (const p of G.pickups) scene.remove(p.model);
  for (const s of G.spawns) scene.remove(s.beam);
  G.enemies = []; G.bullets = []; G.ebullets = []; G.pickups = []; G.spawns = [];
  G.boss = null; G.bossDeath = null; G.raid = null;
  if (World.campSites) for (const c of World.campSites) { c.live = false; c.alerted = false; }
  Fx.clear();
}

const NEW_UP = () => ({ armor: 0, overclock: 0, split: 0, thruster: 0, magnet: 0, firmware: 0, slot: 0 });
const NEW_PROGRESS = (seed) => ({
  beaten: ZONES.map(() => false),
  world: { seed, beacons: [], caches: [], sprites: [], secrets: [], caves: [], fog: '', pins: [] },
  story: { logs: 0, plating: 0, botparts: 0 },
});
const newSeed = () => ((Math.random() * 2 ** 31) | 0) || 1;

// (re)build the world for a seed; a world that hasn't been played in yet is reused as it is
function buildWorld(seed) {
  if (World.group && World.seed === seed && World.pristine) return;
  clearEntities();
  World.dispose();
  useRng(mulberry32(seed));
  try { World.build(scene, seed); } finally { useRng(null); }
  World.pristine = true;
  G.updrafts = [...World.updraftCols];
  for (const b of World.braziers) G.updrafts.push({ x: b.x, z: b.z, y: b.y, r: 3.2 });
}

function newRun() {
  const seed = World.pristine && World.seed ? World.seed : newSeed();
  // Rivet wakes up unarmed: the Pulse Blaster waits on the workshop rack
  G.bar = [{ t: 'supply', id: 'repair', n: 1 }, { t: 'part', id: 'scrap', n: 2 }, { t: 'part', id: 'wire', n: 1 }];
  G.sel = 0; G.weapon = 'blaster';
  G.storage = { 'part:scrap': 4, 'part:wire': 2 };
  G.reserve = [];
  G.bucks = 40;
  G.gear = { jetpack: false, fireboots: false, backpack: 0, hull: 0, prop: 0, lamp: 0 };
  G.base = { shield: false, charger: 0, rooms: {} };
  G.progress = NEW_PROGRESS(seed);
  G.progress.story.flags = Story.fresh();
  G.up = NEW_UP();
  G.vessels = 0; G.spritesFound = 0;
  G.companions.forEach((c) => c.destroy());
  G.companions = [];
  G.player = new Player();
  G.total = { kills: 0, parts: 0, crafted: 0, time: 0, damageTaken: 0, caches: 0 };
  setViewModelWeapon(G.vm, 'blaster', 1);
  enterWorld(true);
}

// Saves are versioned. Version 1 saves (separate biomes behind portals) keep the player's items,
// upgrades, bots and Botbucks; the world itself is new.
const SAVE_VERSION = 3;
const SAVE_KEY = 'sf-outlands-save';
function stateJSON() {
  const p = G.player;
  const W = G.progress.world;
  W.fog = WorldMap.packFog();
  return JSON.stringify({ v: SAVE_VERSION, bar: G.bar, sel: G.sel, weapon: G.weapon, storage: G.storage, bucks: G.bucks, gear: G.gear, base: G.base, progress: G.progress,
    up: G.up, comps: G.companions.map((c) => ({ kind: c.kind, battery: c.battery, hp: c.hp, away: !c.active })), hp: p.hp, total: G.total,
    reserve: G.reserve.map((e) => ({ kind: e.kind, battery: G.reserveBattery(e), hp: e.hp })), vessels: G.vessels, spritesFound: G.spritesFound,
    pos: G.safeSpot ? [G.safeSpot.x, G.safeSpot.y, G.safeSpot.z, G.safeSpot.yaw] : null });
}
function applyState(json) {
  const s = JSON.parse(json);
  if (!s.v || s.v < 2) {
    // an old save from before the connected world: keep the gear, start the world and story fresh
    const beaten = (s.progress && s.progress.beaten) || [];
    s.progress = NEW_PROGRESS(newSeed());
    s.progress.legacy = beaten.filter(Boolean).length;
    s.pos = null;
    G.migrated = true;
  } else if (s.v < 3) {
    // version 2 → 3: the world's landmarks moved (villages, the sea, the Warden routes), so the things
    // tied to exact places start over; gear, bots, story, quests and freed Wardens are all kept
    const W = s.progress.world;
    s.progress.world = { seed: W.seed, beacons: [], caches: [], sprites: [], secrets: [], caves: [], fog: '', pins: [] };
    if (s.progress.villages) delete s.progress.villages.camp;
    s.pos = null;
    G.reshaped = true;
  }
  G.bar = s.bar.map((it) => (it ? Object.assign({ n: 1 }, it) : null)); G.sel = s.sel || 0; G.storage = s.storage; G.bucks = s.bucks; G.gear = Object.assign({ hull: 0, prop: 0, lamp: 0 }, s.gear); G.base = s.base;
  G.progress = Object.assign(NEW_PROGRESS(s.progress.world ? s.progress.world.seed : newSeed()), s.progress);
  G.progress.world = Object.assign(NEW_PROGRESS(0).world, s.progress.world);
  G.progress.story = Object.assign(NEW_PROGRESS(0).story, s.progress.story);
  while (G.progress.beaten.length < ZONES.length) G.progress.beaten.push(false);   // saves from before the ocean Warden
  Story.migrate(G.progress.story, G.progress.beaten);
  G.base.rooms = G.base.rooms || {};
  G.up = Object.assign(NEW_UP(), s.up); G.total = s.total;
  G.companions.forEach((c) => c.destroy());
  G.player = new Player(); G.player.hp = s.hp;
  G.reserve = (s.reserve || []).map((e) => ({ kind: e.kind, battery: e.battery, hp: e.hp, t: G.time }));
  G.companions = s.comps.map((d) => { const c = new Companion(d.kind, d.battery); c.hp = Math.min(c.maxHp, d.hp); if (d.away) c.state = 'charging'; return c; });
  G.vessels = s.vessels || 0; G.spritesFound = s.spritesFound || 0;
  G.weapon = s.weapon || 'blaster';
  G.savedPos = s.pos;
  G.checkWeapon();
  setViewModelWeapon(G.vm, G.weapon, 1 + G.up.split);
  UI.hotbarDirty = true;
}
function takeSnapshot() { G.snapshot = stateJSON(); }
// dying puts you back where you last saved, but what you've done in the world stays done
function restoreSnapshot() {
  const progress = G.progress;
  applyState(G.snapshot);
  G.progress = progress;
}
function saveGame() {
  takeSnapshot();
  try { localStorage.setItem(SAVE_KEY, G.snapshot); } catch (e) { /* storage unavailable */ }
  G.saveT = 0;
}
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function savedSeed() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.v >= 2 && s.progress.world ? s.progress.world.seed : null; } catch (e) { return null; }
}
function continueGame() {
  let json = null;
  try { json = localStorage.getItem(SAVE_KEY); } catch (e) { /* storage unavailable */ }
  if (!json) { newRun(); return; }
  G.player = new Player();
  applyState(json);
  enterWorld(false);
  if (G.reshaped) {
    G.reshaped = false;
    setTimeout(() => UI.banner('THE OUTLANDS HAVE SHIFTED', 'Villages, the sea and new paths to the Wardens — your gear, bots and freed Wardens are all kept', '#3cf2ff', 5.5), 600);
    saveGame();
  }
  if (G.migrated) {
    G.migrated = false;
    setTimeout(() => UI.banner('A NEW WORLD', 'Your gear, bots and Botbucks came with you — the Outlands are now one connected world', '#3cf2ff', 5), 600);
    saveGame();
  }
}

// set up the world for play from the current state (new game, continue, or respawn)
function enterWorld(fresh, respawn) {
  buildWorld(G.progress.world.seed);
  World.pristine = false;
  clearEntities();
  applyWorldProgress();
  World.refreshRooms();
  if (G.base.shield) World.buildHomeDome();
  WorldMap.load(G.progress.world.fog);
  WorldMap.buildRelief();
  G.cine = null; document.body.classList.remove('cine');
  const p = G.player;
  const S = !respawn && G.savedPos ? { x: G.savedPos[0], y: G.savedPos[1], z: G.savedPos[2], yaw: G.savedPos[3] } : null;
  if (S) p.pos.set(S.x, S.y + 0.1, S.z); else p.pos.set(World.spawn.x, World.heightAt(World.spawn.x, World.spawn.z), World.spawn.z);
  p.vel.set(0, 0, 0);
  p.yaw = S ? S.yaw : 0;
  p.pitch = -0.05;
  p.dead = false; p.invuln = 2; p.energy = 100; p.dashCd = 0;
  p.gliding = false; p.climbing = null; p.stamina = p.maxStamina; p.exhausted = false;
  p.jetting = false; p.fuel = 100; p.fallTop = p.pos.y; p.safe = null;
  p.frozenT = 0; p.burnT = 0; p.slowT = 0;
  p.hp = respawn || fresh ? p.maxHp : Math.max(1, Math.min(p.hp, p.maxHp));
  G.safeSpot = null;
  setViewModelWeapon(G.vm, G.weapon, 1 + G.up.split);
  G.companions.forEach((c) => c.onTravel());
  for (const c of G.companions.slice()) if (c.swapTo) G.completeSwap(c);
  for (const e of G.reserve) e.pending = false;
  G.refreshReserveModels();
  G.levelDone = false; G.dying = 0; G.timeScale = 1;
  G.stats = { kills: 0, parts: 0, time: 0, damageTaken: 0, caches: 0 };
  G.hintShown = {};
  G.objective = 'explore'; G.fight = null; G.vacuumT = 0;
  G.region = null; G.regionT = 0; G.campT = 0; G.saveT = 0; G.raidT = -1;
  World.envBlend(p.pos.x, p.pos.z, p.pos.y, 1);
  updateRegion(0, true);
  G.state = 'playing';
  Sound.setIntensity(0);
  UI.hideAll();
  UI.hotbarDirty = true;
  takeSnapshot();
  Dialog.clear();
  if (fresh || !Story.F.intro) { saveGame(); Story.startOpening(); }
  if (Story.step === 'targets') Story.spawnTargets();
  if (World.rack) World.rack.gun.visible = !Story.F.armed;
  document.getElementById('skip-intro').classList.toggle('show', !Story.tutorialDone);
  UI.refreshHUD(true);
}

// re-apply everything the player has already done in this world
function applyWorldProgress() {
  const W = G.progress.world;
  for (const b of World.beacons) {
    const done = W.beacons.includes(b.id);
    b.state = done ? 'done' : 'idle'; b.progress = done ? 1 : 0;
    World.setBeaconColor(b, done ? '#6bff9e' : '#ffb347', done ? 5 : 4);
  }
  for (const A of World.arenas) {
    const beaten = G.progress.beaten[A.i];
    const open = beaten || Wardens.unlocked(A);
    A.sealed = !open; A.opening = false; A.fade = open ? 0 : 1;
    A.dome.visible = A.domeWire.visible = !open;
    A.dome.material.opacity = 0.12; A.domeWire.material.opacity = 0.25; A.domeWire.scale.setScalar(1);
  }
  World.domeTrap = false;
  World.caches.forEach((c, k) => { const o = W.caches.includes(k); c.opened = o; c.openT = o ? 1 : 0; c.lid.rotation.x = o ? -1.9 : 0; c.sprite.material.opacity = o ? 0 : 1; });
  World.sprites.forEach((sp, k) => { sp.found = W.sprites.includes(k); sp.model.visible = !sp.found; });
  World.secrets.forEach((s) => { s.found = W.secrets.includes(s.id); s.model.visible = !s.found; });
  World.caves.forEach((c) => { c.found = W.caves.includes(c.id); });
  const VS = Villages.state();
  World.questCamp = VS.camp !== undefined ? World.campSites.find((c) => c.id === VS.camp) : null;
  Villages.here = null;
  Villages.apply();
  Wardens.apply();
}
function remember(list, v) {
  const W = G.progress.world;
  if (!W[list].includes(v)) W[list].push(v);
}

// Which part of the world the player is in drives the music, weather, HUD and how tough robots are.
function updateRegion(dt, force) {
  const p = G.player;
  const R = World.regionAt(p.pos.x, p.pos.z, p.pos.y);
  if (!force && G.region === R) { G.regionT = 0; return; }
  G.regionT += dt;
  if (!force && G.regionT < 1.2) return;
  const first = !G.region;
  const was = G.region;
  G.region = R; G.regionT = 0;
  G.where = R === REGIONS.hub ? 'hub' : 'biome';
  G.level = R.tier;
  Weather.init(scene, R.ambient, R.ambientColor || R.accent);
  Sound.setZone(R.zone);
  if (G.where === 'hub') arriveHome(first);
  else if (!first) UI.banner(R.name.toUpperCase(), regionIntro(R), R.accent, 3);
  void was;
}
function regionIntro(R) {
  if (R === REGIONS.sky) return ZONES[4].intro;
  if (R === REGIONS.deep) return `Kelp, coral and wrecks. Your hull is rated to ${Sea.limit} m.`;
  return R.id === 'coast' ? COAST.intro : (ZONES.find((z) => z.id === R.id) || {}).intro || '';
}

// home sweet home: fully repaired, progress saved, raids possible
function arriveHome(first) {
  const p = G.player;
  if (!first) {
    p.hp = p.maxHp;
    UI.banner('HOME BASE', 'Hull repaired · progress saved · bots charge on the pads', '#3cf2ff', 3);
  }
  Object.keys(G.stats).forEach((k) => (G.total[k] = (G.total[k] || 0) + G.stats[k]));
  G.stats = { kills: 0, parts: 0, time: 0, damageTaken: 0, caches: 0 };
  G.safeSpot = { x: World.spawn.x, y: World.heightAt(World.spawn.x, World.spawn.z), z: World.spawn.z, yaw: 0 };
  saveGame();
  const beaten = G.progress.beaten.filter(Boolean).length;
  if (!first && beaten && !G.raid && Math.random() < 0.35) G.raidT = rand(25, 45);
}

function startRaid() {
  const beaten = G.progress.beaten.filter(Boolean).length;
  const zi = Math.max(0, Math.min(3, beaten - 1));
  const pool = ZONES[zi].pool;
  G.raid = { camps: [] };
  let n = 0;
  for (let t = 0; t < 40 && n < 2; t++) {
    const a = rand(0, TAU), r = rand(70, 95), x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (!World.isClear(x, z, 6) && World.heightAt(x, z) < WORLD.water + 1) continue;
    const camp = { x, z, y: World.heightAt(x, z), r: 6, alerted: true, raid: true };
    const before = G.enemies.length;
    spawnCampRobots(camp, randi(3, 4), true, pool, zi);
    for (const e of G.enemies.slice(before)) e.hunter = true;
    n++;
  }
  UI.banner('RAID!', 'Robots are attacking home base', '#ff3b5c', 3.5);
  Sound.play('warn');
  Sound.setIntensity(1);
  if (!G.base.shield) setTimeout(() => UI.hint('Build a Shield Generator at the Workshop bench — its dome keeps raiders out'), 4000);
}

// A camp: a group of robots hanging out around a scrap brazier. They spot you when you
// come close (an alarm meter fills), or instantly if you attack or start an uplink nearby.
function spawnCampRobots(camp, n, aggro, pool, tier) {
  for (let i = 0; i < n; i++) {
    const type = weighted(pool);
    const elite = tier > 0 && Math.random() < 0.06 * tier;
    const k = ENEMY_TYPES[type].ai === 'swarm' ? 3 : 1;
    for (let j = 0; j < k; j++) {
      const a = rand(0, TAU), r = rand(2.8, camp.island ? 4.5 : 6);
      const ex = camp.x + Math.cos(a) * r, ez = camp.z + Math.sin(a) * r;
      if (!camp.island && !camp.under && World.heightAt(ex, ez) < WORLD.water + 0.3) continue;
      if (camp.under && World.heightAt(ex, ez) > WORLD.water - 3) continue;
      const e = new Enemy(type, ex, ez, elite && j === 0, aggro, camp, null, tier);
      e.facing = Math.atan2(camp.x - ex, camp.z - ez);
      G.enemies.push(e);
    }
  }
}

// Robot camps come to life as you approach and pack up when you're far away.
const CAMP_WAKE = 160, CAMP_SLEEP = 270, CAMP_RESPAWN = 300;
function streamCamps(dt) {
  G.campT -= dt;
  if (G.campT > 0) return;
  G.campT = 0.5;
  const p = G.player;
  let live = G.enemies.length;
  for (const c of World.campSites) {
    const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
    if (!c.live) {
      if (d < CAMP_WAKE && d > 40 && G.time > (c.respawnAt || 0) && live < 46 && !World.domeTrap) {
        c.live = true; c.alerted = false;
        const before = G.enemies.length;
        spawnCampRobots(c, c.size, false, c.pool, c.tier);
        live += G.enemies.length - before;
      }
    } else if (d > CAMP_SLEEP) {
      for (const e of G.enemies) if (e.camp === c && !e.dead) { e.dead = true; e.destroy(); }
      c.live = false; c.alerted = false;
    } else if (!G.enemies.some((e) => e.camp === c && !e.dead)) {
      c.live = false; c.alerted = false; c.respawnAt = G.time + CAMP_RESPAWN;
      Villages.event('campCleared', c);
    }
  }
}

// ─────────── Beacons, boss domes & the Wardens ───────────
function skyLocked() {
  const left = WARDENS.filter((i) => !G.progress.beaten[i]);
  return left.length ? `Sealed by the Static — defeat ${left.map((i) => ZONES[i].boss.name).join(', ')} first` : null;
}

function nextInteractable() {
  const p = G.player;
  let best = null, bd = 1e9;
  const near = (x, z, r, kind, obj, dy = 3) => {
    const d = Math.hypot(x - p.pos.x, z - p.pos.z);
    if (d < r && d < bd && Math.abs(p.pos.y - (obj && obj.y !== undefined ? obj.y : p.pos.y)) < dy) { bd = d; best = { kind, obj }; }
  };
  const cell = (x, z, R) => Math.abs(x - p.pos.x) < R && Math.abs(z - p.pos.z) < R;
  for (const c of World.caches) if (!c.opened && cell(c.x, c.z, 4)) near(c.x, c.z, 3.2, 'cache', c);
  for (const t of World.terminals) if (!t.locked) near(t.x, t.z, 2.6, t.kind, t);
  Wardens.nearest(p, near);
  if (World.wren) near(World.wren.x, World.wren.z, 2.8, 'talk', World.wren);
  if (World.rack && !Story.F.armed) near(World.rack.x, World.rack.z, 2.4, 'rack', World.rack);
  for (const S of World.shops) if (cell(S.x, S.z, 5)) near(S.x, S.z, 2.2, 'shop', S);
  const npc = Villages.nearestNpc(p);
  if (npc) { const d = npc.find ? 0 : Math.hypot(npc.x - p.pos.x, npc.z - p.pos.z); if (d < bd) { bd = d; best = { kind: 'npc', obj: npc }; } }
  const busy = World.beacons.some((b) => b.state === 'charging');
  for (const b of World.beacons) {
    if (!cell(b.x, b.z, 7)) continue;
    if (b.state === 'idle' && !busy && !World.domeTrap) near(b.x, b.z, 5.5, 'beacon', b, 6);
    else if (b.state === 'done') near(b.x, b.z, 5.5, 'launch', b);
  }
  return best;
}

function interact(it) {
  switch (it.kind) {
    case 'cache': openCache(it.obj); break;
    case 'beacon': {
      const lock = it.obj.biome === 4 ? skyLocked() : null;
      if (lock) { Sound.play('deny'); UI.banner('BEACON LOCKED', lock, '#8a94a8', 3); return; }
      startUplink(it.obj); break;
    }
    case 'launch': launchFrom(it.obj); break;
    case 'shop': UI.openStation('shop', it.obj); break;
    case 'mechanic': case 'storage': case 'charging': case 'garage': case 'lab': case 'command': UI.openStation(it.kind); break;
    case 'talk': Story.talk(); break;
    case 'npc': Villages.talk(it.obj); break;
    case 'mirror': case 'frostkey': case 'lift': Wardens.interact(it); break;
    case 'rack': Story.takeBlaster(); break;
  }
}

function openCache(c) {
  c.opened = true;
  remember('caches', World.caches.indexOf(c));
  const n = c.golden ? 3 : randi(3, 5);
  const bag = c.golden ? ['quantum', 'core', 'lens'] : [];
  for (let i = 0; i < n; i++) bag.push(weighted([['scrap', 4], ['wire', 3], ['servo', 2], ['circuit', 2], ['lens', 1], ['core', 1], ['quantum', 0.15]]));
  if (Math.random() < 0.3) bag.push('health');
  for (const t of bag) G.dropPart(t, c.x, c.y + 1, c.z, 0.7);
  for (let i = c.golden ? 5 : 2; i > 0; i--) G.dropBucks(c.golden ? 12 : randi(3, 6), c.x, c.y + 1, c.z, 0.7);
  Fx.explosion(c.x, c.y + 0.8, c.z, c.golden ? '#ffd23f' : '#3cf2ff', 0.4);
  Sound.play('cache');
  G.stats.caches++;
  UI.feed(c.golden ? 'Golden cache opened!' : 'Salvage cache opened', c.golden ? '#ffd23f' : '#3cf2ff');
}

function launchFrom(b) {
  const p = G.player;
  p.pos.x = b.x + 1.5; p.pos.z = b.z;
  p.vel.set(0, 52, 0);
  p.grounded = false; p.gliding = false; p.launchT = 2.2;
  p.stamina = p.maxStamina; p.exhausted = false;
  Fx.shockRing(b.x, b.y + 0.6, b.z, '#6bff9e', 4, 60);
  Fx.explosion(b.x, b.y + 1, b.z, '#6bff9e', 0.8);
  Sound.play('launch');
  // the view from up high reveals nearby caches on the compass and the map
  let n = 0;
  for (const c of World.caches) if (!c.opened && !c.revealed && Math.hypot(c.x - b.x, c.z - b.z) < 170) { c.revealed = true; n++; }
  WorldMap.reveal(b.x, b.z, 260);
  UI.banner('SKY LAUNCH', n ? `${n} salvage caches revealed on your compass` : 'Open your glider in mid-air', '#6bff9e', 2.4);
  UI.hint(`${ctl('Press Space', 'Tap GLIDE', 'Press A')} in mid-air to open your glider — a long fall without it hurts!`);
}

function startUplink(b) {
  b.state = 'charging'; b.progress = 0; b.spawnT = 1.5;
  // the uplink signal draws every robot in the area
  for (const e of G.enemies) {
    if (e.isBoss || e.dead) continue;
    if (Math.hypot(e.pos.x - b.x, e.pos.z - b.z) < 110) { e.aggro = true; e.hunter = true; }
  }
  const acc = b.biome === 4 ? ZONES[4].accent : ZONES[b.biome].accent;
  World.setBeaconColor(b, acc);
  Sound.play('uplink');
  UI.banner('UPLINK STARTED', 'Stay inside the ring and defend the beacon', acc, 2.6);
  Sound.setIntensity(1);
}

function updateObjectives(dt) {
  const p = G.player;
  if (G.raidT > 0 && G.where === 'hub') { G.raidT -= dt; if (G.raidT <= 0) startRaid(); }
  if (G.raid && !G.enemies.some((e) => !e.dead && e.camp && e.camp.raid)) {
    G.raid = null;
    UI.banner('RAID REPELLED', 'Home base is safe · +40 Botbucks', '#6bff9e', 3);
    G.bucks += 40; Sound.play('win'); Sound.setIntensity(0);
  }
  // beacon uplinks
  for (const b of World.beacons) {
    if (b.state !== 'charging') continue;
    const Z = ZONES[b.biome], tier = b.biome;
    const dist = Math.hypot(p.pos.x - b.x, p.pos.z - b.z);
    const inside = dist < 14 && Math.abs(p.pos.y - b.y) < 12;
    if (dist > 140 || p.dead) {
      // walked away: the uplink drops
      b.state = 'idle'; b.progress = 0; World.setBeaconColor(b, '#ffb347');
      for (const e of G.enemies) e.hunter = false;
      UI.feed('Uplink lost — you left the beacon', '#ff9f43');
      continue;
    }
    if (inside) b.progress = Math.min(1, b.progress + dt / 22);
    b.inside = inside;
    b.spawnT -= dt;
    if (b.spawnT <= 0 && G.enemies.length < 30 + tier * 4) {
      b.spawnT = rand(3.2, 4.8) - tier * 0.2;
      const is = b.island;
      const a = rand(0, TAU), r = is ? rand(5, is.r - 2) : rand(26, 36);
      const sx = b.x + Math.cos(a) * r, sz = b.z + Math.sin(a) * r;
      if (!is && World.heightAt(sx, sz) < WORLD.water + 0.3) continue;
      const n = 1 + Math.floor(tier / 2) + (Math.random() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const t = weighted(Z.pool);
        const cnt = ENEMY_TYPES[t].ai === 'swarm' ? 3 : 1;
        for (let j = 0; j < cnt; j++) G.queueSpawn(t, sx + rand(-4, 4) * (is ? 0.4 : 1), sz + rand(-4, 4) * (is ? 0.4 : 1), tier > 0 && Math.random() < 0.05 * tier, 1.1, true, { island: is, tier });
      }
    }
    if (b.progress >= 1) beaconOnline(b);
  }
  // walking into an open dome starts the fight
  if (!World.domeTrap && !p.dead) {
    for (const A of World.arenas) {
      if (A.sealed || G.progress.beaten[A.i]) continue;
      if (Math.hypot(p.pos.x - A.x, p.pos.z - A.z) < A.r - 6 && Math.abs(p.pos.y - A.y) < 12) { startBossFight(A); break; }
    }
  }
}

function beaconOnline(b) {
  const p = G.player;
  const A = b.arena, Z = ZONES[A.i];
  b.state = 'done';
  remember('beacons', b.id);
  for (const e of G.enemies) e.hunter = false;
  setTimeout(() => UI.hint(`Activated beacons can launch you skyward — ${ctl('press E', 'tap LAUNCH', 'press X')} at the base`), 3200);
  World.setBeaconColor(b, '#6bff9e', 5);
  Fx.explosion(b.x, b.y + 9, b.z, '#6bff9e', 1.2);
  Fx.shockRing(b.x, b.y + 1, b.z, '#6bff9e', 6, 60);
  Sound.play('beaconDone');
  for (let k = 0; k < 3; k++) G.dropPart(weighted([['circuit', 2], ['core', 1], ['servo', 2], ['lens', 1]]), b.x, b.y + 3, b.z, 1.3);
  for (let k = 0; k < 4; k++) G.dropBucks(10 + A.i * 3, b.x, b.y + 3, b.z, 1.3);
  for (const pk of G.pickups) pk.pulled = pk.pulled || pk.pos.distanceTo(p.pos) < 50;
  const done = A.beacons.filter((x) => x.state === 'done').length;
  if (done >= A.beacons.length) {
    World.openDome(A);
    UI.banner('CORE GATE OPEN', `${Z.boss.name} awaits in its dome — check your map`, Z.boss.color, 3.5);
    Sound.play('warn');
  } else UI.banner(`BEACON ${done} / ${A.beacons.length} ONLINE`, `${Z.boss.name}'s dome weakens — find the next signal pillar`, '#6bff9e', 2.8);
  Sound.setIntensity(0);
  G.safeSpot = { x: b.x + 4, y: b.y, z: b.z + 4, yaw: p.yaw };
  saveGame();
}

function startBossFight(A) {
  const p = G.player;
  const Z = ZONES[A.i];
  G.objective = 'boss'; G.fight = A;
  // the dome slams shut: you and your squad are locked in until the boss falls
  World.trapDome(A);
  for (const c of G.companions) if (c.active) World.keepInside(c.pos, c.r);
  // it's just you (and your bots) against the boss: robots caught inside are destroyed
  for (const e of G.enemies) if (!e.isBoss && !e.dead && Math.hypot(e.pos.x - A.x, e.pos.z - A.z) < A.r + 3) G.killEnemy(e, false);
  for (const s of G.spawns) scene.remove(s.beam);
  G.spawns.length = 0;
  for (const b of G.ebullets) if (World.insideDome(b.pos.x, b.pos.y, b.pos.z)) b.dead = true;
  const a = Math.atan2(p.pos.x - A.x, p.pos.z - A.z) + Math.PI;
  G.queueSpawn('boss', A.x + Math.sin(a) * 12, A.z + Math.cos(a) * 12, false, 2.2, true, { boss: A.i });
  UI.banner('⚠ WARNING ⚠', `${Z.boss.name} — ${Z.boss.title.toUpperCase()}`, '#ff3355', 3.2);
  setTimeout(() => UI.hint('The dome has sealed — there is no way out until the boss is destroyed'), 3400);
  Sound.play('warn');
  Sound.play('slam');
  Sound.setIntensity(2);
}

// ─────────── Secrets, Scrap Sprites & the map ───────────
function collectSecret(s) {
  s.found = true;
  s.model.visible = false;
  remember('secrets', s.id);
  const S = SECRETS[s.type], st = G.progress.story;
  Fx.shockRing(s.x, s.y, s.z, S.color, 1.6, 30);
  for (let i = 0; i < 18; i++) Fx.spark(s.x, s.y, s.z, rand(-1, 1), rand(0.2, 1.5), rand(-1, 1), rand(2, 6), pick([S.color, '#ffffff']), 0.8, 0.12, 4);
  Sound.play('sprite');
  if (s.type === 'log') {
    const L = LORE_LOGS[Math.min(st.logs, LORE_LOGS.length - 1)];
    st.logs++;
    UI.showLore(L, Math.min(st.logs, LORE_LOGS.length), LORE_LOGS.length);
  } else if (s.type === 'plating') {
    st.plating++;
    G.player.hp += 10;
    UI.banner('WARDEN PLATING', `Maximum hull is now ${G.player.maxHp}`, S.color, 3);
  } else if (s.type === 'botpart') {
    st.botparts++;
    if (st.botparts % 3 === 0) {
      const kind = BOTPART_REWARDS[(st.botparts / 3 - 1) % BOTPART_REWARDS.length];
      const where = G.addBot(kind);
      UI.banner('BOT ASSEMBLED', `Three lost parts make a ${COMP_DEFS[kind].name}${where === 'home' ? ' — it waits at home base' : ''}`, COMP_DEFS[kind].color, 3.5);
    } else UI.banner('LOST BOT PART', `${3 - (st.botparts % 3)} more to assemble a premium bot`, S.color, 2.8);
  } else {
    G.bucks += 60; UI.bump('bucks');
    G.dropPart('quantum', s.x, s.y + 0.5, s.z, 0.5);
    G.dropPart('core', s.x, s.y + 0.5, s.z, 0.5);
    UI.banner('HIDDEN HOARD', '+60 Botbucks and rare parts', S.color, 2.8);
  }
  G.safeSpot = null;
  saveGame();
}

function collectSprite(sp) {
  sp.found = true;
  remember('sprites', World.sprites.indexOf(sp));
  sp.model.visible = false;
  G.spritesFound++;
  Fx.shockRing(sp.x, sp.y, sp.z, '#3aff9a', 1.5, 30);
  for (let i = 0; i < 20; i++) Fx.spark(sp.x, sp.y, sp.z, rand(-1, 1), rand(0.2, 1.5), rand(-1, 1), rand(2, 6), pick(['#3aff9a', '#ffffff', '#ffd23f']), 0.8, 0.12, 4);
  Sound.play('sprite');
  const left = World.sprites.filter((s) => !s.found).length;
  if (G.spritesFound % 3 === 0) {
    G.vessels++;
    G.player.stamina = G.player.maxStamina;
    UI.banner('STAMINA VESSEL', `Beep-boop! Max stamina is now ${G.player.maxStamina}`, '#3aff9a', 3);
  } else {
    UI.banner('BEEP-BOOP!', `You found a Scrap Sprite · ${3 - (G.spritesFound % 3)} more for a stamina vessel`, '#3aff9a', 2.4);
  }
  UI.feed(`Scrap Sprite found (${left} left in the world)`, '#3aff9a');
}

// per-frame exploration: caves, secrets, sprites, the map's fog of war and autosaves
function explore(dt) {
  const p = G.player;
  if (p.dead) return;
  for (const sp of World.sprites) {
    if (sp.found || Math.abs(sp.x - p.pos.x) > 3 || Math.abs(sp.z - p.pos.z) > 3) continue;
    if (Math.hypot(sp.x - p.pos.x, sp.y - (p.pos.y + 0.8), sp.z - p.pos.z) < 1.7) collectSprite(sp);
  }
  for (const s of World.secrets) {
    if (s.found || Math.abs(s.x - p.pos.x) > 3 || Math.abs(s.z - p.pos.z) > 3) continue;
    if (Math.hypot(s.x - p.pos.x, s.y - (p.pos.y + 0.8), s.z - p.pos.z) < 1.8) collectSecret(s);
  }
  // caves: dim the daylight, switch on the headlamp, note the discovery
  const cv = p.inCave ? World.caveAt(p.pos.x, p.pos.z, p.pos.y) : null;
  const deep = cv ? clamp((World.heightAt(p.pos.x, p.pos.z) - p.pos.y - 2) / 6, 0, 1) : 0;
  World.caveDim = lerp(World.caveDim, deep, 1 - Math.exp(-3 * dt));
  const sea = p.swim ? clamp((p.depth || 0) / 25, 0, 1) * (G.gear.lamp ? 3.2 : 1.4) : 0;
  World.headlamp.intensity = Math.max(World.caveDim * 2.2, sea);
  World.headlamp.distance = G.gear.lamp && p.swim ? 40 : 26;
  World.headlamp.position.set(p.pos.x, p.pos.y + 1.6, p.pos.z);
  if (cv && !cv.cave.found && deep > 0.3) {
    cv.cave.found = true;
    remember('caves', cv.cave.id);
    UI.banner('CAVE DISCOVERED', 'Something glints in the dark at the far end…', '#b98cff', 2.6);
  }
  WorldMap.reveal(p.pos.x, p.pos.z, p.pos.y > World.heightAt(p.pos.x, p.pos.z) + 25 ? 150 : 95);
  // remember a safe spot (to continue from) and autosave now and then while things are calm
  if (p.grounded && !p.inCave && !World.domeTrap && G.where === 'biome') {
    G.calmT = G.enemies.some((e) => e.aggro && !e.dead && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 60) ? 0 : (G.calmT || 0) + dt;
    if (G.calmT > 3) G.safeSpot = { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw };
  }
  G.saveT = (G.saveT || 0) + dt;
  if (G.saveT > 90 && !World.domeTrap && (G.calmT || 0) > 5) saveGame();
}

// respawn after a defeat: back at home base with your last saved gear (the world remembers your progress)
function respawnHome() {
  restoreSnapshot();
  G.savedPos = null;
  if (G.fight) { World.openDome(G.fight); G.fight = null; }
  enterWorld(false, true);
  UI.banner('REBUILT AT HOME', 'Your workshop rebuilt you — everything you did in the world is kept', '#3cf2ff', 3.5);
}

// ═════════════════════════ Update ═════════════════════════
function update(dt) {
  G.time += dt;
  G.stats.time += dt;
  const p = G.player;

  if (G.dying > 0) {
    G.dying -= dt / Math.max(0.1, G.timeScale);
    if (G.dying <= 0) {
      Object.keys(G.stats).forEach((k) => (G.total[k] = (G.total[k] || 0) + G.stats[k]));
      G.state = 'gameover';
      Input.unlock();
      UI.showGameOver();
      return;
    }
  } else if (!p.dead && !G.levelDone && !G.cine) {
    if (Input.hit('KeyV')) UI.toggleView();
    if (Input.hit('KeyJ')) { UI.openStation('journal'); return; }
    // hotbar: number keys / mouse wheel select a slot, X drops the selected item
    for (let k = 0; k < 10; k++) if (Input.hit('Digit' + ((k + 1) % 10))) G.selectSlot(k);
    if (Input.wheel) { G.selectSlot(G.sel + Math.sign(Input.wheel)); Input.wheel = 0; }
    if (Input.hit('KeyX')) dropSelected();
    p.update(dt);
    if (Input.hit('KeyE')) {
      const it = nextInteractable();
      if (it) interact(it);
    }
    if (Input.hit('KeyM')) { WorldMap.open(); return; }
    explore(dt);
  }

  Story.update(dt);
  Wardens.update(dt, G.time);
  if (G.recallT > 0) { G.recallT -= dt; if (Math.random() < dt * 30) Fx.glowBurst(p.pos.x + rand(-1, 1), p.pos.y + rand(0, 2), p.pos.z + rand(-1, 1), '#3cf2ff', 0.6, 0.4, 2); if (G.recallT <= 0 && !p.dead && !World.domeTrap) G.travelTo(World.spawn.x, World.spawn.z, undefined, 'Home Base'); }
  if (Input.hit('Enter')) Dialog.skip();
  updateRegion(dt);
  streamCamps(dt);
  updateObjectives(dt);
  G.vacuumT = Math.max(0, (G.vacuumT || 0) - dt);

  // spawn telegraphs
  for (let i = G.spawns.length - 1; i >= 0; i--) {
    const s = G.spawns[i];
    s.t -= dt;
    s.beam.material.opacity = 0.2 + 0.6 * (1 - s.t / s.max);
    if (Math.random() < dt * 30) Fx.glowBurst(s.x + rand(-1, 1), s.y + rand(0, 3), s.z + rand(-1, 1), s.color, 0.6, 0.4, 2);
    if (s.t <= 0) {
      G.spawns.splice(i, 1);
      scene.remove(s.beam);
      if (s.type === 'boss') {
        const b = new Boss(s.boss, s.x, s.z);
        G.boss = b; G.enemies.push(b);
        Fx.explosion(s.x, s.y + 4, s.z, b.color, 3);
        Fx.addShake(0.8);
        Sound.play('explode', true);
      } else {
        const e = new Enemy(s.type, s.x, s.z, s.elite, s.aggro, null, s.island, s.tier);
        if (World.beacons.some((b) => b.state === 'charging')) e.hunter = true;
        G.enemies.push(e);
        Fx.shockRing(s.x, s.y + 0.5, s.z, ENEMY_TYPES[s.type].color, 1.5, 20);
      }
    }
  }

  // enemies
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (e.doomT !== undefined) { e.doomT -= dt; if (e.doomT <= 0) G.killEnemy(e, true); continue; }
    e.update(dt);
  }
  const E = G.enemies;
  for (let i = 0; i < E.length; i++) {
    const a = E[i];
    if (a.dead) continue;
    for (let j = i + 1; j < E.length; j++) {
      const b = E[j];
      if (b.dead) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, rr = a.r + b.r;
      if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
      const dd = dx * dx + dz * dz;
      if (dd < rr * rr && dd > 0.0001) {
        const d = Math.sqrt(dd), push = (rr - d) * 0.5, nx = dx / d, nz = dz / d;
        const wa = a.isBoss ? 0 : b.isBoss ? 2 : 1, wb = b.isBoss ? 0 : a.isBoss ? 2 : 1;
        a.pos.x -= nx * push * wa; a.pos.z -= nz * push * wa;
        b.pos.x += nx * push * wb; b.pos.z += nz * push * wb;
      }
    }
  }

  if (!p.dead) G.companions.forEach((c, i) => c.update(dt, i, G.companions.length));

  updateBullets(dt);
  updateEnemyBullets(dt);
  updatePickups(dt);

  G.enemies = G.enemies.filter((e) => !e.dead);
  G.bullets = G.bullets.filter((b) => { if (b.dead) scene.remove(b.mesh); return !b.dead; });
  G.ebullets = G.ebullets.filter((b) => { if (b.dead) scene.remove(b.mesh); return !b.dead; });

  if (G.bossDeath) {
    const bd = G.bossDeath;
    bd.t += dt;
    if (bd.t < 1.8 && Math.random() < dt * 12) {
      Fx.explosion(bd.x + rand(-3, 3), bd.y + rand(-3, 3), bd.z + rand(-3, 3), pick([bd.color, '#ffb347', '#ffffff']), rand(0.8, 1.6));
      Fx.addShake(0.2); Sound.play('explode', false);
    }
    if (bd.t >= 1.8 && !bd.final) {
      bd.final = true;
      Fx.explosion(bd.x, bd.y, bd.z, bd.color, 5);
      Fx.shockRing(bd.x, World.arena.y + 1, bd.z, '#ffffff', 12, 80);
      Fx.addShake(1.2); Fx.tintFlash('#ffffff', 0.6);
      Sound.play('bomb');
      for (const pk of G.pickups) pk.pulled = true;
    }
  }

  // dynamic music: calm while exploring, intense when hunted
  G.musicT -= dt;
  if (G.musicT <= 0) {
    G.musicT = 1;
    if (G.objective !== 'boss') {
      const hunted = G.enemies.some((e) => e.aggro && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 55) || World.beacons.some((b) => b.state === 'charging');
      Sound.setIntensity(hunted ? 1 : 0);
    }
  }
}

// selfDmg: bombs & rockets hurt the player too when caught in the blast
function explodeAt(x, y, z, radius, dmg, color, scale = 1, selfDmg = 0) {
  Fx.explosion(x, y, z, color, scale);
  for (const e of G.enemies) {
    if (e.dead || e.hidden) continue;
    const ey = e.aimY(y);
    const dd = Math.hypot(x - e.pos.x, y - ey, z - e.pos.z);
    if (dd < radius + e.r) G.damageEnemy(e, dmg * (1 - 0.7 * dd / (radius + e.r)), e.pos.x, ey, e.pos.z, color, true);
  }
  const p = G.player;
  if (selfDmg && !p.dead) {
    const pd = Math.hypot(x - p.pos.x, y - (p.pos.y + 0.9), z - p.pos.z);
    if (pd < radius) {
      const d = Math.round(selfDmg * (1 - 0.6 * pd / radius));
      p.invuln = 0;
      p.hurt(d, { x, z });
      p.vel.x += (p.pos.x - x) / (pd || 1) * 8; p.vel.z += (p.pos.z - z) / (pd || 1) * 8; p.vel.y = Math.max(p.vel.y, 5);
      UI.feed(`Caught in your own blast −${d}`, '#ff6b6b');
    }
  }
}

function dropSelected() {
  const it = G.bar[G.sel];
  if (!it) return;
  if (it.t === 'weapon' && it.id === 'blaster') { UI.feed('Your Pulse Blaster stays with you — store it at home instead', '#9fb3c8'); return; }
  const p = G.player;
  // X drops one from the stack
  it.n = (it.n || 1) - 1;
  if (it.n <= 0) G.bar[G.sel] = null;
  G.checkWeapon();
  G.dropItem({ t: it.t, id: it.id }, p.pos.x, p.pos.y + 1.2, p.pos.z);
  UI.hotbarDirty = true;
  Sound.play('throw', null, 0.5);
}

function updateBullets(dt) {
  for (const b of G.bullets) {
    if (b.dead) continue;
    const px = b.pos.x, py = b.pos.y, pz = b.pos.z;
    if (b.kind === 'grenade') {
      b.vel.y -= 22 * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      Fx.trail(b.pos.x, b.pos.y, b.pos.z, b.color, 0.5, 0.3, 3);
      b.life -= dt;
      let hitE = false;
      for (const e of G.enemies) if (!e.dead && !e.hidden && Math.hypot(e.pos.x - b.pos.x, e.aimY(b.pos.y) - b.pos.y, e.pos.z - b.pos.z) < e.r + 0.3) hitE = true;
      if (hitE || World.solidAt(b.pos.x, b.pos.y, b.pos.z) || b.life <= 0 || b.pos.y < World.hazardLevel) {
        b.dead = true;
        const gy = Math.max(b.pos.y, World.heightAt(b.pos.x, b.pos.z) + 0.3);
        const R = b.bomb ? 5 : 5.5;
        explodeAt(b.pos.x, gy, b.pos.z, R, b.dmg, b.color, b.bomb ? 1.5 : 1.8, b.bomb ? 12 : 25);
        Fx.shockRing(b.pos.x, gy, b.pos.z, b.bomb ? '#ffb38a' : '#e0ccff', R * 0.5, 50);
        if (!b.bomb) for (const eb of G.ebullets) if (eb.pos.distanceTo(b.pos) < 6) { eb.dead = true; Fx.glowBurst(eb.pos.x, eb.pos.y, eb.pos.z, '#b98cff', 0.6, 0.3); }
        Fx.addShake(0.5 * G.vol(b.pos) * 2);
        Sound.play('bomb', null, Math.min(1, G.vol(b.pos) * 2));
      }
      continue;
    }
    if (b.kind === 'missile') {
      if (!b.target || b.target.dead || b.target.hidden) b.target = G.nearestEnemy(b.pos.x, b.pos.z, 60, null, true);
      const sp = b.vel.length();
      const ns = Math.min(45, sp + 50 * dt);
      if (b.target && b.life < 3.8) {
        _a.set(b.target.pos.x - b.pos.x, b.target.cy - b.pos.y, b.target.pos.z - b.pos.z).normalize();
        _c3.copy(b.vel).normalize().lerp(_a, Math.min(1, dt * 5)).normalize();
        b.vel.copy(_c3).multiplyScalar(ns);
      } else b.vel.multiplyScalar(ns / (sp || 1));
      Fx.smoke(b.pos.x, b.pos.y, b.pos.z, 0.35, 0.6, 0, 0.3, 0);
      Fx.trail(b.pos.x, b.pos.y, b.pos.z, '#ffcf4d', 0.35, 0.15, 3);
    }
    if (b.kind === 'rocket') {
      Fx.smoke(b.pos.x, b.pos.y, b.pos.z, 0.5, 0.8, 0, 0.3, 0);
      Fx.trail(b.pos.x, b.pos.y, b.pos.z, '#ffcf4d', 0.5, 0.2, 3);
    }
    // aim assist: player shots curve gently toward the locked enemy
    if (b.home) {
      const T = b.home;
      if (T.dead || T.hidden) b.home = null;
      else {
        const sp = b.vel.length();
        _a.set(T.pos.x - b.pos.x, T.cy - b.pos.y, T.pos.z - b.pos.z);
        const dist = _a.length();
        _a.divideScalar(dist || 1);
        _c3.copy(b.vel).divideScalar(sp || 1);
        if (_c3.dot(_a) > 0.2) {
          _c3.lerp(_a, Math.min(1, dt * (b.kind === 'rocket' ? 3 : 9))).normalize();
          b.vel.copy(_c3).multiplyScalar(sp);
        } else b.home = null;
      }
    }
    b.pos.addScaledVector(b.vel, dt);
    b.mesh.position.copy(b.pos);
    if (b.kind === 'missile' || b.kind === 'rocket' || b.home || Math.random() < 0.3) { _a.copy(b.pos).add(b.vel); b.mesh.lookAt(_a); }
    b.life -= dt;
    // collisions (swept against enemies)
    let hit = null, best = Infinity;
    for (const e of G.enemies) {
      if (e.dead || e.hidden) continue;
      const rr = e.r + 0.15;
      if (Math.abs(e.pos.x - b.pos.x) > rr + 6 || Math.abs(e.pos.z - b.pos.z) > rr + 6) continue;
      const ey = e.aimY(b.pos.y);
      const d = segPointDist(px, py, pz, b.pos.x, b.pos.y, b.pos.z, e.pos.x, ey, e.pos.z);
      if (d < rr) {
        const t = Math.hypot(e.pos.x - px, ey - py, e.pos.z - pz);
        if (t < best) { best = t; hit = e; }
      }
    }
    const boom = () => {
      const selfDmg = b.kind === 'rocket' ? 35 : 0;
      explodeAt(b.pos.x, b.pos.y, b.pos.z, b.splash, b.dmg, b.color, b.kind === 'rocket' ? 1.4 : 0.7, selfDmg);
      if (b.kind === 'rocket') { Fx.shockRing(b.pos.x, b.pos.y, b.pos.z, '#e8ffb0', 3, 40); Fx.addShake(0.4 * G.vol(b.pos) * 2); Sound.play('bomb', null, Math.min(1, G.vol(b.pos) * 2)); }
      else Sound.play('explode', false, G.vol(b.pos));
    };
    if (hit) {
      b.dead = true;
      if (hit.blocks(b.pos.x, b.pos.z)) {
        Fx.sparks(b.pos.x, b.pos.y, b.pos.z, 8, '#ffd1f2', 8);
        Sound.play('block', null, G.vol(hit.pos));
        hit.flash = Math.max(hit.flash, 0.3);
        if (b.fromPlayer) UI.hitmarker(false, true);
        continue;
      }
      if (b.kind === 'missile' || b.kind === 'rocket') boom();
      else {
        G.damageEnemy(hit, b.dmg, b.pos.x, b.pos.y, b.pos.z, b.color);
        if (b.fromPlayer) UI.hitmarker(false);
      }
      continue;
    }
    if (b.life <= 0 || World.solidAt(b.pos.x, b.pos.y, b.pos.z)) {
      b.dead = true;
      if (b.kind === 'missile' || b.kind === 'rocket') boom();
      else if (b.life > 0) { Fx.sparks(b.pos.x, b.pos.y, b.pos.z, 4, b.color, 5); Fx.glowBurst(b.pos.x, b.pos.y, b.pos.z, b.color, 0.5, 0.12, 3); }
    }
  }
}

// what a biome shot does to you on a hit
function applyShotEffect(p, eff) {
  if (!eff || p.dead) return;
  if (eff === 'frost') { p.slowT = Math.max(p.slowT, 1.6); Fx.tintFlash('#8ae9ff', 0.2); }
  else if (eff === 'fire') { p.burnT = Math.max(p.burnT, 2.2); }
  else if (eff === 'freeze') p.freeze(1.6);
}

function updateEnemyBullets(dt) {
  const p = G.player;
  const HD = World.homeDome;
  for (const b of G.ebullets) {
    if (b.dead) continue;
    if (b.grav) b.vel.y -= b.grav * dt;
    const px0 = b.pos.x, py0 = b.pos.y, pz0 = b.pos.z;
    b.pos.addScaledVector(b.vel, dt);
    if (b.hugH) b.pos.y = (b.fromBoss ? World.arenaFloor(b.pos.x, b.pos.z) : World.floorAt(b.pos.x, b.pos.z, b.pos.y - b.hugH)) + b.hugH;
    b.mesh.position.copy(b.pos);
    if (b.grav) { b.mesh.rotation.x += dt * 3; b.mesh.rotation.z += dt * 2; if (b.meteor) Fx.trail(b.pos.x, b.pos.y, b.pos.z, '#ff8a3a', 1.6, 0.4, 3); }
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; if (b.marker) scene.remove(b.marker); continue; }
    // home shield dome blocks every shot from outside
    if (HD && (b.pos.x - HD.x) ** 2 + (b.pos.y - HD.y) ** 2 + (b.pos.z - HD.z) ** 2 < HD.r * HD.r) {
      b.dead = true; Fx.glowBurst(b.pos.x, b.pos.y, b.pos.z, '#5ab8ff', 1.4, 0.3, 3); HD.flash = 1; Sound.play('block', null, 0.5);
      continue;
    }
    if (World.domeTrap && !b.fromBoss && World.insideDome(b.pos.x, b.pos.y, b.pos.z)) {
      b.dead = true; Fx.glowBurst(b.pos.x, b.pos.y, b.pos.z, World.arena.color, 1.2, 0.3, 2);
      continue;
    }
    const ground = b.grav ? (b.fromBoss ? World.arenaFloor(b.pos.x, b.pos.z) : World.floorAt(b.pos.x, b.pos.z, b.pos.y)) : -1e9;
    if (World.solidAt(b.pos.x, b.pos.y, b.pos.z) || (b.grav && b.pos.y <= ground + 0.2)) {
      b.dead = true;
      if (b.marker) scene.remove(b.marker);
      if (b.splash) {
        // boulders & meteors burst where they land
        Fx.explosion(b.pos.x, b.pos.y, b.pos.z, b.color, 1.3);
        Fx.shockRing(b.pos.x, Math.max(b.pos.y, ground) + 0.2, b.pos.z, b.color, b.splash * 0.6, 30);
        Sound.play('explode', false, G.vol(b.pos));
        const pd = Math.hypot(p.pos.x - b.pos.x, p.pos.y + 0.9 - b.pos.y, p.pos.z - b.pos.z);
        if (pd < b.splash && !p.dead) { p.hurt(b.dmg * (1 - 0.5 * pd / b.splash), { x: b.pos.x, z: b.pos.z }); applyShotEffect(p, b.effect); }
        if (b.effect === 'fire') G.spawnEnemyBullet(b.pos.x, ground + 0.8, b.pos.z, 0, 0, 0, b.dmg * 0.25, 1.2, '#ff6a1a', 0.8, { effect: 'fire', life: 3, fromBoss: b.fromBoss });
      } else Fx.sparks(b.pos.x, b.pos.y, b.pos.z, 4, b.color, 4);
      continue;
    }
    for (const c of G.companions) {
      if (!c.active) continue;
      const pad = c.kind === 'shield' ? 0.5 : 0;
      if (b.pos.distanceToSquared(c.pos) < (c.r + b.r + pad) ** 2) {
        b.dead = true;
        c.hurt(b.dmg * (c.kind === 'shield' ? 0.35 : 1));
        Fx.sparks(b.pos.x, b.pos.y, b.pos.z, 6, c.kind === 'shield' ? c.d.color : b.color, 6);
        if (c.kind === 'shield') { Fx.glowBurst(c.pos.x, c.pos.y, c.pos.z, c.d.color, 1.6, 0.2, 2); Sound.play('block', null, 0.6); }
        break;
      }
    }
    if (b.dead || p.dead) continue;
    // swept test: fast shots must not skip through you between frames
    let touch = false;
    const steps = Math.min(8, Math.ceil(Math.hypot(b.pos.x - px0, b.pos.y - py0, b.pos.z - pz0) / 0.5));
    for (let k = 1; k <= steps && !touch; k++) {
      const f = k / steps;
      touch = segPointDist(p.pos.x, p.pos.y + 0.3, p.pos.z, p.pos.x, p.pos.y + 1.6, p.pos.z, lerp(px0, b.pos.x, f), lerp(py0, b.pos.y, f), lerp(pz0, b.pos.z, f)) < 0.45 + b.r;
    }
    if (touch) {
      if (b.hugH && b.life > 1 && b.vel.lengthSq() < 1) {
        // lingering fire patch: burns while you stand in it
        if (p.invuln <= 0) { p.hurt(b.dmg, null); applyShotEffect(p, b.effect); }
        continue;
      }
      b.dead = true;
      if (b.marker) scene.remove(b.marker);
      if (p.dashT <= 0) { p.hurt(b.dmg, { x: b.pos.x - b.vel.x, z: b.pos.z - b.vel.z }); applyShotEffect(p, b.effect); }
    }
  }
}

function updatePickups(dt) {
  const p = G.player;
  const mag = p.magnet;
  const vacuum = G.vacuumT > 0;
  for (const k of G.pickups) {
    k.t += dt;
    const needsSlot = k.type !== 'health' && k.type !== 'bucks';
    const full = needsSlot && !G.canAdd(k.item || { t: 'part', id: k.type });
    const dx = p.pos.x - k.pos.x, dy = p.pos.y + 0.9 - k.pos.y, dz = p.pos.z - k.pos.z;
    const dd = Math.hypot(dx, dy, dz);
    if (!p.dead && (dd < mag || (vacuum && k.t > 1)) && !(needsSlot && full) && k.t > 0) k.pulled = true;
    if (needsSlot && full) k.pulled = false;
    if (k.pulled && !p.dead && k.t > 0.35) {
      const sp = 14 + k.t * 4 + (vacuum ? 20 : 0);
      const kk = 1 - Math.exp(-7 * dt);
      k.vel.x += ((dx / dd) * sp - k.vel.x) * kk; k.vel.y += ((dy / dd) * sp - k.vel.y) * kk; k.vel.z += ((dz / dd) * sp - k.vel.z) * kk;
      k.pos.addScaledVector(k.vel, dt);
    } else {
      k.vel.y -= 20 * dt;
      k.pos.addScaledVector(k.vel, dt);
      const gy = Math.max(World.groundAt(k.pos.x, k.pos.z, k.pos.y), World.hazardLevel) + 0.45;
      if (k.pos.y < gy) { k.pos.y = gy; k.vel.y = Math.abs(k.vel.y) * 0.3; k.vel.x *= 0.7; k.vel.z *= 0.7; }
    }
    k.model.position.set(k.pos.x, k.pos.y + Math.sin(G.time * 3 + k.bob) * 0.1, k.pos.z);
    k.model.rotation.y += dt * 2;
    if (!p.dead && dd < 1.3 && k.t > 0) {
      if (k.type === 'health') { p.heal(15); UI.feed('+15 hull', '#6bff9e'); Sound.play('heal'); }
      else if (k.type === 'bucks') { G.bucks += k.value; G.stats.bucks = (G.stats.bucks || 0) + k.value; UI.feed(`+${k.value} Botbucks`, '#ffd23f'); UI.bump('bucks'); Sound.play('coin'); }
      else {
        const it = k.item || { t: 'part', id: k.type };
        if (!G.addItem(it)) {
          if (!G.fullWarnT || G.time - G.fullWarnT > 4) { G.fullWarnT = G.time; UI.feed('Hotbar full — sell or store items (X drops the selected one)', '#ff9f43'); Sound.play('deny'); }
          continue;
        }
        if (it.t === 'part') { G.stats.parts++; UI.feed(`+1 ${PARTS[it.id].name}`, PARTS[it.id].color, it.id); }
        else UI.feed(`Picked up ${UI.itemName(it)}`, '#dfe8f4');
        Sound.play('pickup');
      }
      k.dead = true;
      scene.remove(k.model);
    }
    if (k.t > 90 && !k.pulled) { k.dead = true; scene.remove(k.model); }
  }
  G.pickups = G.pickups.filter((k) => !k.dead);
}

// ═════════════════════════ Camera, view model & avatar ═════════════════════════
G.vm = buildViewModel();
camera.add(G.vm);
G.vm.position.set(0.2, -0.19, -0.46);
G.vm.scale.setScalar(0.7);
// first-person glider canopy overhead
G.fpGlider = buildGliderModel(0.75);
G.fpGlider.rotation.set(0.12, Math.PI, 0);
G.fpGlider.position.set(0, 0.95, -0.35);
G.fpGlider.visible = false;
camera.add(G.fpGlider);
// third-person mech
G.avatar = buildAvatarModel();
G.avatar.visible = false;
scene.add(G.avatar);
// Shield Bot bubble & freeze ice block around the player
G.bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 2), Mat.glowT('#5ab8ff', 0.8, 0.07));
G.bubble.visible = false; scene.add(G.bubble);
G.iceBlock = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.1, 1.3), new THREE.MeshStandardMaterial({ color: '#cdefff', emissive: '#4ab8ff', emissiveIntensity: 0.3, transparent: true, opacity: 0.55, roughness: 0.1, flatShading: true }));
G.iceBlock.visible = false; scene.add(G.iceBlock);
let swayX = 0, swayY = 0, camDist = 4.2;

// ─────────── Procedural animation for the articulated mech ───────────
// Each frame we build a target pose for every joint from the movement state, then ease the
// joints toward it (critically-damped style), so gait changes and state switches blend smoothly.
const AV = { k: 14 };
function ease(obj, key, target, k, dt) { obj[key] += (target - obj[key]) * (1 - Math.exp(-k * dt)); }
function rot(o, x, y, z, k, dt) { ease(o.rotation, 'x', x, k, dt); ease(o.rotation, 'y', y, k, dt); ease(o.rotation, 'z', z, k, dt); }

function updateAvatar(dt) {
  const p = G.player, a = G.avatar, U = a.userData, J = U.J;
  const climbing = !!p.climbing, gliding = p.gliding;
  const swimming = !!p.swim;
  const air = !p.grounded && !climbing && !gliding && !swimming;
  const vx = p.vel.x, vz = p.vel.z, spd = Math.hypot(vx, vz);
  const t = G.time;

  // ── gait phase (also drives footsteps in first person)
  const sprinting = spd > p.speed * 1.25;
  const stride = sprinting ? 1.7 : 1.1;               // metres per step
  const fwdSpd = vx * Math.sin(U.bodyYaw) + vz * Math.cos(U.bodyYaw);
  const dir = fwdSpd < -0.4 ? -1 : 1;                   // backpedal plays the cycle in reverse
  const prevPhase = U.phase;
  if (p.grounded && !climbing) U.phase += dir * (spd * dt / stride) * Math.PI;
  else if (climbing) U.phase += Math.abs(p.vel.y) * dt * 2.2;
  if (p.grounded && spd > 1 && Math.floor(prevPhase / Math.PI) !== Math.floor(U.phase / Math.PI)) {
    Sound.play('step', sprinting, 0.6);
    const side = Math.floor(U.phase / Math.PI) % 2 ? 1 : -1;
    const rx = Math.cos(U.bodyYaw), rz = -Math.sin(U.bodyYaw);
    Fx.smoke(p.pos.x + rx * side * 0.14, p.pos.y + 0.05, p.pos.z + rz * side * 0.14, 0.35, 0.6, rand(-0.3, 0.3), 0.4, rand(-0.3, 0.3), '#6a5a50');
  }

  const show = G.thirdPerson && !p.dead && G.state !== 'menu';
  a.visible = show;
  if (!show) return;

  // ── facing: toward travel direction; snap to the aim direction while shooting
  if (Input.mouse.down) U.aimT = 1.4; else U.aimT = Math.max(0, U.aimT - dt);
  const aiming = U.aimT > 0 && !gliding && !climbing;
  let targetYaw = U.bodyYaw;
  if (aiming) targetYaw = p.yaw + Math.PI;
  else if (climbing) targetYaw = Math.atan2(p.climbing.x - p.pos.x, p.climbing.z - p.pos.z);
  else if (spd > 0.6) targetYaw = Math.atan2(vx, vz);
  const prevYaw = U.bodyYaw;
  U.bodyYaw += angDiff(U.bodyYaw, targetYaw) * (1 - Math.exp(-(aiming ? 18 : 9) * dt));
  const turnRate = angDiff(prevYaw, U.bodyYaw) / Math.max(dt, 1e-4);

  a.position.copy(p.pos);
  a.rotation.set(0, U.bodyYaw, 0, 'YXZ');

  // ── gait weights
  const w = clamp(spd / 6, 0, 1);                       // walking amount
  const run = clamp((spd - 8) / 4, 0, 1);               // sprint amount
  const ph = U.phase, s1 = Math.sin(ph), c1 = Math.cos(ph);
  const accel = (fwdSpd - (U.prevFwd || 0)) / Math.max(dt, 1e-4);
  U.prevFwd = fwdSpd;
  U.lean = lerp(U.lean || 0, clamp(accel * 0.012, -0.15, 0.2), 1 - Math.exp(-5 * dt));
  const land = p.land;
  const breathe = Math.sin(t * 1.9);

  // pose targets
  const P = {
    pelvisY: 0.95 - w * (0.035 + 0.045 * run) * s1 * s1 - (1 - w) * 0.02 - land * 0.2,
    pelvis: [0, w * 0.13 * s1 * (1 + run * 0.6), w * 0.05 * s1 + (1 - w) * 0.025 * Math.sin(t * 0.7)],
    spine: [0.04 + w * (0.05 + 0.2 * run) + U.lean + land * 0.25, 0, 0],
    chest: [0.02 * breathe * (1 - w), -w * 0.2 * s1 * (1 + run * 0.5), 0],
    legs: [], arms: [],
  };
  const A = w * lerp(0.42, 0.85, run);
  for (let i = 0; i < 2; i++) {
    const pi = ph + (i ? Math.PI : 0), si = Math.sin(pi), ci = Math.cos(pi);
    const thigh = -A * si - land * 0.55 - (1 - w) * 0.06;
    const knee = w * (0.12 + lerp(0.75, 1.55, run) * Math.pow(Math.max(0, ci), 1.4)) + (1 - w) * 0.12 + land * 1.0;
    const ankle = -(thigh + knee) * 0.85 + w * 0.4 * Math.max(0, -si) * Math.max(0, -ci);
    const toe = w * 0.6 * Math.max(0, -si) * Math.max(0, -ci);
    P.legs.push({ hip: [thigh, 0, (i ? 1 : -1) * 0.03], knee, ankle, toe });
  }
  const armA = w * lerp(0.4, 0.95, run);
  for (let i = 0; i < 2; i++) {
    const sgn = i ? -1 : 1;                               // left arm follows the right leg
    const swing = armA * s1 * sgn;
    P.arms.push({
      sh: [swing + (1 - w) * 0.04 * breathe, 0, (i ? 1 : -1) * (0.13 + 0.08 * run)],
      elbow: -(0.22 + w * lerp(0.2, 1.3, run) + Math.max(0, -swing) * 0.4),
      wrist: 0,
    });
  }

  // ── state overrides
  if (air) {
    const up = clamp(p.vel.y / 8, -1, 1);
    const tuck = Math.max(0, up);
    P.pelvisY = 0.95;
    P.spine = [0.1 - 0.15 * tuck, 0, 0];
    P.legs[0] = { hip: [-0.25 - 0.6 * tuck, 0, -0.08], knee: 0.35 + 0.9 * tuck, ankle: 0.2, toe: 0 };
    P.legs[1] = { hip: [0.05 - 0.2 * tuck, 0, 0.08], knee: 0.25 + 0.5 * tuck, ankle: 0.3, toe: 0 };
    const flail = Math.max(0, -up) * 0.25 * Math.sin(t * 9);
    P.arms[0] = { sh: [-0.35 - 0.5 * tuck, 0, -0.55 - 0.35 * Math.max(0, -up) + flail], elbow: -0.5, wrist: 0 };
    P.arms[1] = { sh: [-0.35 - 0.5 * tuck, 0, 0.55 + 0.35 * Math.max(0, -up) - flail], elbow: -0.5, wrist: 0 };
  }
  if (p.dashT > 0) {
    P.spine = [0.45, 0, 0];
    P.legs[0] = { hip: [-0.55, 0, -0.05], knee: 0.5, ankle: 0.1, toe: 0 };
    P.legs[1] = { hip: [0.55, 0, 0.05], knee: 0.35, ankle: 0.3, toe: 0.2 };
    P.arms[0] = { sh: [0.75, 0, -0.25], elbow: -0.35, wrist: 0 };
    P.arms[1] = { sh: [0.75, 0, 0.25], elbow: -0.35, wrist: 0 };
  }
  if (swimming) {
    // swimming: body stretched out along the stroke, legs kicking, arms sweeping
    const k = Math.sin(t * 6), stroke = Math.sin(t * 3);
    P.pelvisY = 0.95; P.spine = [0.25, 0, 0]; P.chest = [0.1, 0, 0];
    P.legs[0] = { hip: [0.2 + 0.35 * k, 0, -0.08], knee: 0.3 + 0.25 * Math.max(0, k), ankle: 0.5, toe: 0.3 };
    P.legs[1] = { hip: [0.2 - 0.35 * k, 0, 0.08], knee: 0.3 + 0.25 * Math.max(0, -k), ankle: 0.5, toe: 0.3 };
    P.arms[0] = { sh: [-2.4 + 0.9 * stroke, 0, -0.35], elbow: -0.3, wrist: 0 };
    P.arms[1] = { sh: [-2.4 - 0.9 * stroke, 0, 0.35], elbow: -0.3, wrist: 0 };
  }
  if (gliding) {
    const sway = Math.sin(t * 2.1);
    P.pelvisY = 0.95;
    P.pelvis = [0, 0, sway * 0.05];
    P.spine = [0.12, 0, 0];
    P.chest = [0.05, 0, 0];
    P.legs[0] = { hip: [0.18 + sway * 0.12, 0, -0.06], knee: 0.3 + sway * 0.1, ankle: 0.35, toe: 0.2 };
    P.legs[1] = { hip: [0.18 - sway * 0.12, 0, 0.06], knee: 0.3 - sway * 0.1, ankle: 0.35, toe: 0.2 };
    P.arms[0] = { sh: [-Math.PI + 0.12, 0, -0.32], elbow: -0.15, wrist: 0 };
    P.arms[1] = { sh: [-Math.PI + 0.12, 0, 0.32], elbow: -0.15, wrist: 0 };
  }
  if (climbing) {
    const cp = U.phase, cs = Math.sin(cp);
    P.pelvisY = 0.92;
    P.spine = [0.18, 0, 0];
    P.chest = [0.05, 0, 0];
    P.legs[0] = { hip: [-0.75 - 0.35 * cs, 0, -0.12], knee: 1.25 + 0.3 * cs, ankle: -0.4, toe: 0 };
    P.legs[1] = { hip: [-0.75 + 0.35 * cs, 0, 0.12], knee: 1.25 - 0.3 * cs, ankle: -0.4, toe: 0 };
    P.arms[0] = { sh: [-Math.PI + 0.35 + 0.45 * cs, 0, -0.15], elbow: -0.5 - 0.35 * Math.max(0, cs), wrist: 0 };
    P.arms[1] = { sh: [-Math.PI + 0.35 - 0.45 * cs, 0, 0.15], elbow: -0.5 - 0.35 * Math.max(0, -cs), wrist: 0 };
  }
  // aiming: right arm points the blaster along the view, left hand braces it
  if (aiming) {
    const lookPitch = p.pitch;
    const spineX = P.spine[0];
    P.arms[1] = { sh: [-Math.PI / 2 - lookPitch - spineX, 0.12, 0.05], elbow: -0.12, wrist: 0.1 };
    P.arms[0] = { sh: [-1.3 - lookPitch * 0.85 - spineX, -0.55, -0.1], elbow: -1.05, wrist: 0 };
    P.chest[1] *= 0.3;
  }

  // ── head: stabilise against the torso and look where the camera looks
  const look = clamp(angDiff(U.bodyYaw, p.yaw + Math.PI), -1.1, 1.1);
  const neckX = -(P.spine[0] + P.chest[0]) * 0.8 - p.pitch * 0.45;
  const neckY = -(P.pelvis[1] + P.chest[1]) + look * 0.7;

  // ── apply with smoothing (faster for arms while aiming, snappier on landing)
  const k = AV.k, kf = aiming ? 22 : k;
  ease(J.pelvis.position, 'y', P.pelvisY, land > 0.05 ? 30 : k, dt);
  rot(J.pelvis, P.pelvis[0], P.pelvis[1], P.pelvis[2], k, dt);
  rot(J.spine, P.spine[0], P.spine[1], P.spine[2], k, dt);
  rot(J.chest, P.chest[0], P.chest[1], P.chest[2], k, dt);
  rot(J.neck, neckX * 0.5, neckY * 0.5, 0, k, dt);
  rot(J.head, neckX * 0.5, neckY * 0.5, 0, k, dt);
  P.legs.forEach((L, i) => {
    const leg = J.legs[i];
    rot(leg.hip, L.hip[0], L.hip[1], L.hip[2], k, dt);
    ease(leg.knee.rotation, 'x', L.knee, k, dt);
    ease(leg.ankle.rotation, 'x', L.ankle, k, dt);
    ease(leg.toe.rotation, 'x', L.toe, k, dt);
  });
  P.arms.forEach((A2, i) => {
    const arm = J.arms[i];
    rot(arm.sh, A2.sh[0], A2.sh[1], A2.sh[2], kf, dt);
    ease(arm.elbow.rotation, 'x', A2.elbow, kf, dt);
    ease(arm.wrist.rotation, 'x', A2.wrist, kf, dt);
  });
  // whole-body lean into turns and speed
  const bank = clamp(-turnRate * 0.045 * w, -0.3, 0.3);
  rot(J.root, swimming ? 1.1 + clamp(-p.pitch, -0.6, 0.6) * (spd > 1 ? 1 : 0) : 0, 0, bank, swimming ? 4 : 8, dt);

  U.glider.visible = gliding;
  const thrust = p.jetting ? 3 + Math.random() : air || p.dashT > 0 || gliding ? 1.4 : 0.5;
  for (const tr of U.thrusters) tr.scale.setScalar(thrust * (0.9 + Math.random() * 0.2));
  if (U.flashT > 0) { U.flashT -= dt; U.flash.visible = U.flashT > 0; } else U.flash.visible = false;
}

function updateCamera(dt) {
  const p = G.player;
  const shake = Fx.shake * Fx.shake;
  if (G.cine) { Story.cineCamera(dt); return; }
  updateAvatar(dt);
  G.bubble.visible = p.shield > 0 && !p.dead;
  if (G.bubble.visible) { G.bubble.position.set(p.pos.x, p.pos.y + 1, p.pos.z); G.bubble.rotation.y += dt; G.bubble.scale.setScalar(1 + 0.03 * Math.sin(G.time * 6)); }
  G.iceBlock.visible = p.frozenT > 0 && G.thirdPerson && !p.dead;
  if (G.iceBlock.visible) G.iceBlock.position.set(p.pos.x, p.pos.y + 1, p.pos.z);
  if (p.dead) {
    const k = Math.min(1, (2.4 - G.dying) / 1.5);
    camera.position.set(p.pos.x, p.pos.y + lerp(p.eye, 0.4, k), p.pos.z);
    camera.rotation.set(p.pitch * (1 - k) - 0.2 * k, p.yaw, k * 0.6);
    G.vm.visible = false; G.fpGlider.visible = false;
    return;
  }
  const third = G.thirdPerson;
  G.vm.visible = !third;
  G.fpGlider.visible = !third && p.gliding;
  const bobY = Math.sin(p.bob * 2) * 0.045 * p.bobAmt;
  const bobX = Math.cos(p.bob) * 0.03 * p.bobAmt;
  if (third) {
    // over-the-shoulder follow camera that stays out of walls
    const fx = -Math.sin(p.yaw) * Math.cos(p.pitch), fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const px = p.pos.x + rx * 0.6;
    const py = p.pos.y + 1.6;
    const pz = p.pos.z + rz * 0.6;
    const want = 4.3;
    let d = want;
    for (let t = 0.4; t <= want; t += 0.35) {
      const cx = px - fx * t, cy = py - fy * t, cz = pz - fz * t;
      if (World.solidAt(cx, cy - 0.35, cz)) { d = Math.max(0.6, t - 0.4); break; }
    }
    camDist = d < camDist ? d : lerp(camDist, d, 1 - Math.exp(-4 * dt));
    let cx = px - fx * camDist, cy = py - fy * camDist, cz = pz - fz * camDist;
    cy = Math.max(cy, World.heightAt(cx, cz) + 0.5);
    camera.position.set(cx + rand(-1, 1) * shake * 0.3, cy + rand(-1, 1) * shake * 0.3, cz + rand(-1, 1) * shake * 0.3);
    camera.rotation.set(p.pitch + rand(-1, 1) * shake * 0.02, p.yaw, 0);
  } else {
    camera.position.set(p.pos.x + rand(-1, 1) * shake * 0.25, p.pos.y + p.eye + bobY - p.land * 0.25 + rand(-1, 1) * shake * 0.25, p.pos.z + rand(-1, 1) * shake * 0.25);
    camera.rotation.set(p.pitch + rand(-1, 1) * shake * 0.02, p.yaw, bobX * 0.3);
  }
  const fast = Math.hypot(p.vel.x, p.vel.z) > p.speed * 1.2;
  G.fov.kick = Math.max(0, G.fov.kick - dt * 40);
  const target = G.fov.base + (fast ? 8 : 0) + G.fov.kick - (G.focus ? 10 : 0);
  G.fov.cur = lerp(G.fov.cur, target, 1 - Math.exp(-8 * dt));
  if (Math.abs(camera.fov - G.fov.cur) > 0.01) { camera.fov = G.fov.cur; camera.updateProjectionMatrix(); }
  // weapon sway / recoil
  swayX = lerp(swayX, clamp(-Input.mouse.dx * 0.0006, -0.05, 0.05), 1 - Math.exp(-10 * dt));
  swayY = lerp(swayY, clamp(Input.mouse.dy * 0.0006, -0.05, 0.05), 1 - Math.exp(-10 * dt));
  const vm = G.vm;
  vm.position.set(0.2 + bobX * 0.6 + swayX, -0.19 + bobY * 0.6 + swayY - p.land * 0.05 - (p.gliding || p.climbing ? 0.25 : 0), -0.46 + p.recoil * 0.06);
  vm.rotation.set(p.recoil * 0.12, swayX * 2, 0);
  if (vm.userData.flashT > 0) { vm.userData.flashT -= dt; if (vm.userData.flashT <= 0) vm.userData.flash.visible = false; }
}

// ═════════════════════════ Main loop ═════════════════════════
let lastT = performance.now();
let menuT = 0;
function frame(now) {
  // rAF timestamps can precede the performance.now() taken at load, so never allow a negative step
  const dt = clamp((now - lastT) / 1000, 0, 0.05);
  lastT = Math.max(lastT, now);
  Pad.poll(dt);

  if (G.state === 'playing') {
    if (Input.hit('Tab') || Input.hit('KeyI')) UI.openStation('field');
    else if (Input.hit('Escape') || Input.hit('KeyP')) UI.pause();
    else {
      const tsTarget = G.focus && G.dying <= 0 ? 0.4 : 1;
      G.timeScale += (tsTarget - G.timeScale) * (1 - Math.exp(-(G.dying > 0 ? 0.5 : G.focus ? 8 : 2) * dt));
      const sdt = dt * G.timeScale;
      update(sdt);
      if (G.state === 'playing' || G.state === 'gameover') updateCamera(sdt);
      Fx.update(sdt, (x, z) => World.heightAt(x, z));
      World.followSun(G.player.pos.x, G.player.pos.y, G.player.pos.z);
    }
    UI.refreshHUD();
  } else if (G.state === 'menu') {
    menuT += dt;
    G.time += dt;
    const a = menuT * 0.05;
    const hy = World.home.y;
    camera.position.set(Math.sin(a) * 70, hy + 24 + Math.sin(menuT * 0.2) * 4, Math.cos(a) * 70);
    camera.lookAt(0, hy + 3, 0);
    World.followSun(0, hy, 0);
    Fx.update(dt, (x, z) => World.heightAt(x, z));
  } else if (G.state === 'workshop' || G.state === 'paused') {
    if (Input.hit('Escape') || ((Input.hit('Tab') || Input.hit('KeyI')) && G.state === 'workshop')) UI.closeOverlay();
  } else if (G.state === 'map') {
    if (Input.hit('Escape') || Input.hit('KeyM') || Input.hit('Tab')) WorldMap.close();
    else WorldMap.draw();
  }
  if (Input.hit('KeyN')) UI.toggleMute();
  document.body.classList.toggle('playing', G.state === 'playing');
  Touch.refresh();

  World.update(dt, G.time, camera);
  Weather.update(dt, camera.position, G.time);
  const u = post.compMat.uniforms;
  u.damage.value = Fx.damage;
  u.tint.value.copy(Fx.tint); u.tintAmt.value = Fx.tintAmt;
  post.render(scene, camera, G.time);
  Input.endFrame();
  requestAnimationFrame(frame);
}

// the menu backdrop shows the world with its domes up (no save progress applied)
function applyWorldProgressMenu() { World.domeTrap = false; }

function initMenuScene() {
  G.focus = false;
  if (G.avatar) G.avatar.visible = false;
  if (G.fpGlider) G.fpGlider.visible = false;
  clearEntities();
  World.dispose();
  G.level = 0; G.where = 'hub';
  G.up = NEW_UP();
  G.player = new Player(); G.player.dead = true;
  // the menu shows the saved world (so Continue is instant) or the one a new game will use
  const seed = savedSeed() || (World.pristine && World.seed) || newSeed();
  if (!G.progress.world) G.progress = NEW_PROGRESS(seed);
  buildWorld(seed);
  applyWorldProgressMenu();
  World.envBlend(0, 0, World.home.y, 1);
  Weather.init(scene, HUB.ambient, HUB.ambientColor);
  G.vm.visible = false;
  camera.rotation.set(0, 0, 0);
  camera.fov = 60; camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
Input.init(canvas);
Input.onLockChange = (locked) => { if (!locked && G.state === 'playing' && !Input.fallback) UI.pause(); };
canvas.addEventListener('click', () => { if (G.state === 'playing' && !Input.locked) Input.lock(canvas); });
Touch.init();
Pad.init();
if (Touch.enabled) {
  // phones: performance mode by default (no shadows, reduced resolution, no MSAA)
  G.settings.quality = 'low';
  renderer.shadowMap.enabled = false;
  G.settings.sens = 1.1;
}
UI.init();
WorldMap.init();
resize();
initMenuScene();
requestAnimationFrame(frame);
