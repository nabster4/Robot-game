'use strict';
// ═════════════════════════ Renderer & scene ═════════════════════════
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 1200);
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
  riding: false, vehicle: null, vessels: 0, spritesFound: 0, updrafts: [], focus: false,
  scene, camera,
  player: null,
  enemies: [], bullets: [], ebullets: [], pickups: [], spawns: [], companions: [],
  inv: {}, up: {}, repairKits: 0, cells: 0,
  stats: {}, total: {}, snapshot: null,
  objective: 'beacons', boss: null, levelDone: false, dying: 0,
  fov: { base: 75, cur: 75, kick: 0 },
  reinforceT: 40, musicT: 0,

  get slots() { return 3 + this.up.slot; },
  banner(text, sub, color, dur = 3) { UI.banner(text, sub, color, dur); },
  hint(text) { UI.hint(text); },

  vol(pos) {
    const p = this.player.pos;
    return 1 / (1 + Math.hypot(pos.x - p.x, pos.z - p.z) / 18);
  },

  nearestEnemy(x, z, maxD, exclude, aggroOnly) {
    let best = null, bd = maxD * maxD;
    for (const e of this.enemies) {
      if (e.dead || (exclude && exclude.has(e))) continue;
      if (aggroOnly && !e.isBoss && !e.aggro && e.hp >= e.maxHp) continue;
      const dx = e.pos.x - x, dz = e.pos.z - z, dd = dx * dx + dz * dz;
      if (dd < bd) { bd = dd; best = e; }
    }
    return best;
  },

  queueSpawn(type, x, z, elite = false, t = 1.1, aggro = true) {
    const lim = World.half * 0.9;
    x = clamp(x, -lim, lim); z = clamp(z, -lim, lim);
    const y = World.heightAt(x, z);
    const beam = makeBeam(type === 'boss' ? ZONES[this.level].boss.color : ENEMY_TYPES[type].color, 2.5, type === 'boss' ? 3 : 0.8, 0.5);
    setBeam(beam, x, y, z, x, y + 40, z);
    scene.add(beam);
    this.spawns.push({ type, x, z, y, elite, aggro, t, max: t, beam });
  },

  damageEnemy(e, dmg, hx, hy, hz, color, quiet = false) {
    if (e.dead) return;
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
  },

  dropPart(type, x, y, z, burst = 1) {
    const model = buildPickupModel(type);
    model.position.set(x, y, z);
    scene.add(model);
    const a = rand(0, TAU), s = rand(2, 5) * burst;
    this.pickups.push({ type, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(Math.cos(a) * s, rand(4, 8), Math.sin(a) * s), t: 0, model, pulled: false, bob: rand(0, TAU) });
  },

  spawnBolt(x, y, z, dir, speed, dmg, color, fromPlayer) {
    const m = new THREE.Mesh(boltGeo, Mat.glow(color, fromPlayer ? 6 : 5));
    m.position.set(x, y, z);
    _a.set(x + dir.x, y + dir.y, z + dir.z); m.lookAt(_a);
    scene.add(m);
    this.bullets.push({ kind: 'bolt', pos: new THREE.Vector3(x, y, z), vel: dir.clone().multiplyScalar(speed), dmg, color, life: 1.4, mesh: m });
  },

  spawnMissile(x, y, z, vel, dmg, target) {
    const m = new THREE.Mesh(missileGeo, Mat.glow('#c6ff4d', 3));
    m.position.set(x, y, z); scene.add(m);
    this.bullets.push({ kind: 'missile', pos: new THREE.Vector3(x, y, z), vel, dmg, color: '#c6ff4d', life: 4, mesh: m, target, splash: 4.5 });
  },

  spawnGrenade(pos, vel) {
    const m = new THREE.Mesh(bulletGeo, Mat.glow('#b98cff', 5));
    m.scale.setScalar(0.18); m.position.copy(pos); scene.add(m);
    this.bullets.push({ kind: 'grenade', pos: pos.clone(), vel, dmg: 90 + this.level * 12, color: '#b98cff', life: 4, mesh: m });
  },

  spawnEnemyBullet(x, y, z, vx, vy, vz, dmg, r, color, hugH = 0) {
    const m = new THREE.Mesh(bulletGeo, Mat.glow(color, 4));
    m.scale.setScalar(r); m.position.set(x, y, z); scene.add(m);
    this.ebullets.push({ pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(vx, vy, vz), dmg, r, color, life: 5, mesh: m, hugH });
  },

  get thirdPerson() { return this.settings.view === 'third' || this.riding; },
  muzzleWorld() { return (this.thirdPerson ? this.avatar.userData.muzzle : this.vm.userData.muzzle).getWorldPosition(_b); },

  aimPoint() {
    const o = camera.getWorldPosition(_a).clone();
    const d = camera.getWorldDirection(_c3).clone();
    let best = 220;
    // in third person the ray starts at the camera; skip the stretch behind the player
    const t0 = this.thirdPerson ? Math.max(1, o.distanceTo(_cv.set(this.player.pos.x, this.player.pos.y + 1.4, this.player.pos.z)) - 0.5) : 1;
    for (const e of this.enemies) {
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
    const L = this.level;
    const loot = { scrap: 6, wire: 5, servo: 3, circuit: 4, core: 2 + Math.floor(L / 2), lens: 2 + Math.floor(L / 2), quantum: 2 + Math.floor(L / 2) };
    for (const [k, n] of Object.entries(loot)) for (let i = 0; i < n; i++) this.dropPart(k, b.pos.x, b.pos.y, b.pos.z, 2);
    this.stats.kills++;
    this.objective = 'extract';
    Sound.setIntensity(0);
    setTimeout(() => {
      if (this.objective !== 'extract') return;
      World.buildPortal();
      Sound.play('portal');
      this.banner(`${ZONES[L].boss.name} DESTROYED`, 'Extraction portal open — step inside when ready', '#6bff9e', 4);
      Sound.play('win');
    }, 1800);
  },
};

// ═════════════════════════ Run / zone setup ═════════════════════════
function clearEntities() {
  for (const e of G.enemies) e.destroy();
  for (const b of G.bullets) scene.remove(b.mesh);
  for (const b of G.ebullets) scene.remove(b.mesh);
  for (const p of G.pickups) scene.remove(p.model);
  for (const s of G.spawns) scene.remove(s.beam);
  G.enemies = []; G.bullets = []; G.ebullets = []; G.pickups = []; G.spawns = [];
  G.boss = null; G.bossDeath = null;
  Fx.clear();
}

function newRun() {
  G.inv = {}; PART_ORDER.forEach((k) => (G.inv[k] = 0));
  G.inv.scrap = 2; G.inv.wire = 1;
  G.up = { armor: 0, overclock: 0, split: 0, thruster: 0, magnet: 0, firmware: 0, slot: 0 };
  G.repairKits = 1; G.cells = 0;
  G.vessels = 0; G.spritesFound = 0;
  if (G.vehicle && G.vehicle.deployed) scene.remove(G.vehicle.model);
  G.vehicle = null; G.riding = false;
  G.companions.forEach((c) => c.destroy());
  G.companions = [];
  G.player = new Player();
  G.total = { kills: 0, parts: 0, crafted: 0, time: 0, damageTaken: 0, caches: 0 };
  startZone(0);
}

function takeSnapshot() {
  G.snapshot = JSON.stringify({ inv: G.inv, up: G.up, repairKits: G.repairKits, cells: G.cells, comps: G.companions.map((c) => c.kind), hp: G.player.hp, total: G.total,
    veh: G.vehicle ? G.vehicle.hp : null, vessels: G.vessels, spritesFound: G.spritesFound });
}
function restoreSnapshot() {
  const s = JSON.parse(G.snapshot);
  G.inv = s.inv; G.up = s.up; G.repairKits = s.repairKits; G.cells = s.cells; G.total = s.total;
  G.companions.forEach((c) => c.destroy());
  G.player = new Player(); G.player.hp = s.hp;
  G.companions = s.comps.map((k) => new Companion(k));
  if (G.vehicle && G.vehicle.deployed) scene.remove(G.vehicle.model);
  G.riding = false;
  G.vehicle = s.veh !== null && s.veh !== undefined ? new Vehicle(s.veh) : null;
  G.vessels = s.vessels || 0; G.spritesFound = s.spritesFound || 0;
}

// A camp: a group of robots hanging out around a scrap brazier. They leave you alone
// until you attack one of them (or start an uplink nearby).
function spawnCamp(x, z, n, aggro = false) {
  const pool = ZONES[G.level].pool;
  const camp = World.buildBrazier(x, z);
  G.updrafts.push({ x, z, y: camp.y, r: 3.2 });
  for (let i = 0; i < n; i++) {
    const type = weighted(pool);
    const elite = G.level > 0 && Math.random() < 0.06 * G.level;
    const k = type === 'swarmer' ? 3 : 1;
    for (let j = 0; j < k; j++) {
      const a = rand(0, TAU), r = rand(2.8, 6);
      const ex = x + Math.cos(a) * r, ez = z + Math.sin(a) * r;
      if (World.inHazard(ex, ez)) continue;
      const e = new Enemy(type, ex, ez, elite && j === 0, aggro, camp);
      e.facing = Math.atan2(x - ex, z - ez);
      G.enemies.push(e);
    }
  }
  return camp;
}

function startZone(i) {
  if (G.riding && G.vehicle) G.vehicle.dock();
  clearEntities();
  World.dispose();
  G.updrafts = [];
  G.level = i;
  const Z = ZONES[i];
  World.build(scene, Z, i);
  const p = G.player;
  p.pos.set(World.spawn.x, World.heightAt(World.spawn.x, World.spawn.z), World.spawn.z);
  p.vel.set(0, 0, 0);
  p.yaw = Math.atan2(World.spawn.x - World.arena.x, World.spawn.z - World.arena.z);
  p.pitch = -0.05;
  p.dead = false; p.invuln = 2; p.energy = 100; p.dashCd = 0;
  p.gliding = false; p.climbing = null; p.stamina = p.maxStamina; p.exhausted = false;
  p.hp = Math.min(p.hp, p.maxHp);
  setViewModelBarrels(G.vm, 1 + G.up.split);
  G.companions.forEach((c) => { c.offline = 0; c.hp = c.maxHp; c.pos.set(p.pos.x + rand(-2, 2), p.pos.y + 2, p.pos.z + rand(-2, 2)); c.target = null; c.attach(); c.model.rotation.z = 0; c.model.userData.parts.halo.visible = true; });

  // roaming machine camps
  const camps = 8 + i * 2;
  for (let c = 0; c < camps; c++) {
    const at = World.randomClear(7, 40);
    if (!at || Math.hypot(at[0] - World.spawn.x, at[1] - World.spawn.z) < 55) continue;
    spawnCamp(at[0], at[1], randi(3, 4 + Math.floor(i / 2)));
  }

  G.objective = 'beacons';
  G.levelDone = false; G.dying = 0; G.timeScale = 1;
  G.reinforceT = 45;
  G.stats = { kills: 0, parts: 0, time: 0, damageTaken: 0, caches: 0 };
  G.hintShown = {};
  takeSnapshot();
  Weather.init(scene, Z.ambient, Z.accent);
  G.state = 'playing';
  Sound.setIntensity(0);
  Sound.setZone(i);
  UI.hideAll();
  UI.banner(`ZONE ${i + 1} · ${Z.name.toUpperCase()}`, Z.intro, Z.accent, 4.5);
  setTimeout(() => { if (G.level === i && G.objective === 'beacons') UI.hint(`Find and activate ${Z.beacons} signal beacons — follow the light pillars`); }, 4200);
  if (i === 0) setTimeout(() => { if (G.level === 0 && G.state === 'playing') UI.hint('Robot camps leave you alone unless you attack them'); }, 11000);
  UI.refreshHUD(true);
}

function nextInteractable() {
  const p = G.player;
  let best = null, bd = 1e9;
  for (const c of World.caches) {
    if (c.opened) continue;
    const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
    if (d < 3.2 && d < bd) { bd = d; best = { kind: 'cache', obj: c }; }
  }
  if (G.objective === 'beacons' && !World.beacons.some((b) => b.state === 'charging')) {
    for (const b of World.beacons) {
      if (b.state !== 'idle') continue;
      const d = Math.hypot(b.x - p.pos.x, b.z - p.pos.z);
      if (d < 5.5 && d < bd) { bd = d; best = { kind: 'beacon', obj: b }; }
    }
  }
  if (!G.riding) {
    for (const b of World.beacons) {
      if (b.state !== 'done') continue;
      const d = Math.hypot(b.x - p.pos.x, b.z - p.pos.z);
      if (d < 5.5 && d < bd && Math.abs(p.pos.y - b.y) < 3) { bd = d; best = { kind: 'launch', obj: b }; }
    }
  }
  return best;
}

function openCache(c) {
  c.opened = true;
  const n = c.golden ? 3 : randi(3, 5);
  const bag = c.golden ? ['quantum', 'quantum', 'core', 'core', 'lens'] : [];
  for (let i = 0; i < n; i++) bag.push(weighted([['scrap', 4], ['wire', 3], ['servo', 2], ['circuit', 2], ['lens', 1], ['core', 1], ['quantum', 0.15]]));
  if (Math.random() < 0.3) bag.push('health');
  for (const t of bag) G.dropPart(t, c.x, c.y + 1, c.z, 0.7);
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
  // the view from up high reveals nearby caches on the compass
  let n = 0;
  for (const c of World.caches) if (!c.opened && !c.revealed && Math.hypot(c.x - b.x, c.z - b.z) < 170) { c.revealed = true; n++; }
  UI.banner('SKY LAUNCH', n ? `${n} salvage caches revealed on your compass` : 'Open your glider in mid-air', '#6bff9e', 2.4);
  UI.hint(`${Touch.enabled ? 'Tap GLIDE' : 'Press Space'} in mid-air to open your glider — sky islands hold golden caches`);
}

function startUplink(b) {
  b.state = 'charging'; b.progress = 0; b.spawnT = 1.5;
  // the uplink signal draws every robot in the area
  for (const e of G.enemies) {
    if (e.isBoss || e.dead) continue;
    if (Math.hypot(e.pos.x - b.x, e.pos.z - b.z) < 110) { e.aggro = true; e.hunter = true; }
  }
  World.setBeaconColor(b, ZONES[G.level].accent);
  Sound.play('uplink');
  UI.banner('UPLINK STARTED', 'Stay inside the ring and defend the beacon', ZONES[G.level].accent, 2.6);
  Sound.setIntensity(1);
}

function updateObjectives(dt) {
  const p = G.player;
  const Z = ZONES[G.level];
  if (G.objective === 'beacons') {
    for (const b of World.beacons) {
      if (b.state !== 'charging') continue;
      const inside = Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < 14;
      if (inside && !p.dead) b.progress = Math.min(1, b.progress + dt / 22);
      b.inside = inside;
      b.spawnT -= dt;
      if (b.spawnT <= 0 && G.enemies.length < 30 + G.level * 4) {
        b.spawnT = rand(3.2, 4.8) - G.level * 0.2;
        const a = rand(0, TAU), r = rand(26, 36);
        const sx = b.x + Math.cos(a) * r, sz = b.z + Math.sin(a) * r;
        const n = 1 + Math.floor(G.level / 2) + (Math.random() < 0.5 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const t = weighted(Z.pool);
          const cnt = t === 'swarmer' ? 3 : 1;
          for (let j = 0; j < cnt; j++) G.queueSpawn(t, sx + rand(-4, 4), sz + rand(-4, 4), G.level > 0 && Math.random() < 0.05 * G.level, 1.1, true);
        }
      }
      if (b.progress >= 1) {
        b.state = 'done';
        for (const e of G.enemies) e.hunter = false;
        setTimeout(() => UI.hint(`Activated beacons can launch you skyward — ${Touch.enabled ? 'tap LAUNCH' : 'press E'} at the base`), 3200);
        World.setBeaconColor(b, '#6bff9e', 5);
        Fx.explosion(b.x, b.y + 9, b.z, '#6bff9e', 1.2);
        Fx.shockRing(b.x, b.y + 1, b.z, '#6bff9e', 6, 60);
        Sound.play('beaconDone');
        for (let k = 0; k < 4; k++) G.dropPart(weighted([['circuit', 2], ['core', 1], ['servo', 2], ['lens', 1]]), b.x, b.y + 3, b.z, 1.3);
        for (const pk of G.pickups) pk.pulled = pk.pulled || pk.pos.distanceTo(p.pos) < 50;
        const done = World.beacons.filter((x) => x.state === 'done').length;
        if (done >= World.beacons.length) {
          G.objective = 'arena';
          World.openDome();
          UI.banner('CORE GATE OPEN', `${Z.boss.name} awaits in the central arena`, Z.boss.color, 3.5);
          Sound.play('warn');
        } else {
          UI.banner(`BEACON ${done} / ${World.beacons.length} ONLINE`, 'Find the next signal pillar', '#6bff9e', 2.8);
        }
        Sound.setIntensity(0);
      }
    }
  } else if (G.objective === 'arena') {
    if (Math.hypot(p.pos.x - World.arena.x, p.pos.z - World.arena.z) < World.arena.r - 6) {
      G.objective = 'boss';
      const a = Math.atan2(p.pos.x - World.arena.x, p.pos.z - World.arena.z) + Math.PI;
      G.queueSpawn('boss', World.arena.x + Math.sin(a) * 12, World.arena.z + Math.cos(a) * 12, false, 2.2);
      UI.banner('⚠ WARNING ⚠', `${Z.boss.name} — ${Z.boss.title.toUpperCase()}`, '#ff3355', 3.2);
      Sound.play('warn');
      Sound.setIntensity(2);
    }
  } else if (G.objective === 'extract' && World.portal) {
    const P = World.portal;
    if (Math.hypot(p.pos.x - P.x, p.pos.z - P.z) < 2.8 && Math.abs(p.pos.y - P.y) < 6 && !p.dead) {
      if (G.riding && G.vehicle) G.vehicle.dock();
      G.objective = 'done';
      G.levelDone = true;
      Sound.play('portal');
      Fx.tintFlash('#6bff9e', 1);
      Object.keys(G.stats).forEach((k) => (G.total[k] = (G.total[k] || 0) + G.stats[k]));
      setTimeout(() => {
        Input.unlock();
        if (G.level >= ZONES.length - 1) { G.state = 'victory'; UI.showVictory(); }
        else UI.openWorkshop('between');
      }, 700);
    }
  }

  // reinforcements while exploring
  if (G.objective === 'beacons' || G.objective === 'arena') {
    G.reinforceT -= dt;
    if (G.reinforceT <= 0) {
      G.reinforceT = Math.max(45, 75 - G.level * 5);
      if (G.enemies.length < 24 + G.level * 4) {
        for (let tries = 0; tries < 10; tries++) {
          const a = rand(0, TAU), r = rand(80, 120);
          const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r;
          if (Math.abs(x) > World.half * 0.72 || Math.abs(z) > World.half * 0.72 || !World.isClear(x, z, 6)) continue;
          spawnCamp(x, z, randi(2, 3), false);
          break;
        }
      }
    }
  }
}

function toggleVehicle() {
  if (G.riding && G.vehicle) { G.vehicle.dock(); return; }
  if (!G.vehicle) { UI.feed('No Skyrider — craft one in the Workshop (Vehicles tab)', '#ffb347'); Sound.play('deny'); return; }
  if (G.player.climbing) return;
  G.vehicle.deploy();
}

function collectSprite(sp) {
  sp.found = true;
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
  UI.feed(`Scrap Sprite found (${left} left in this zone)`, '#3aff9a');
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
  } else if (!p.dead && !G.levelDone) {
    if (Input.hit('KeyF')) toggleVehicle();
    if (Input.hit('KeyV')) UI.toggleView();
    p.update(dt);
    if (G.riding && G.vehicle) G.vehicle.update(dt);
    if (Input.hit('KeyE')) {
      const it = nextInteractable();
      if (it && it.kind === 'cache') openCache(it.obj);
      else if (it && it.kind === 'beacon') startUplink(it.obj);
      else if (it && it.kind === 'launch') launchFrom(it.obj);
    }
    // Scrap Sprites (hidden collectibles)
    for (const sp of World.sprites) {
      if (sp.found) continue;
      if (Math.hypot(sp.x - p.pos.x, sp.y - (p.pos.y + 0.8), sp.z - p.pos.z) < 1.7) collectSprite(sp);
    }
  }
  if (G.vehicle && !G.riding) G.vehicle.hp = Math.min(G.vehicle.maxHp, G.vehicle.hp + 4 * dt);

  updateObjectives(dt);

  // spawn telegraphs
  for (let i = G.spawns.length - 1; i >= 0; i--) {
    const s = G.spawns[i];
    s.t -= dt;
    s.beam.material.opacity = 0.2 + 0.6 * (1 - s.t / s.max);
    if (Math.random() < dt * 30) Fx.glowBurst(s.x + rand(-1, 1), s.y + rand(0, 3), s.z + rand(-1, 1), s.type === 'boss' ? ZONES[G.level].boss.color : ENEMY_TYPES[s.type].color, 0.6, 0.4, 2);
    if (s.t <= 0) {
      G.spawns.splice(i, 1);
      scene.remove(s.beam);
      if (s.type === 'boss') {
        const b = new Boss(G.level, s.x, s.z);
        G.boss = b; G.enemies.push(b);
        Fx.explosion(s.x, s.y + 4, s.z, b.color, 3);
        Fx.addShake(0.8);
        Sound.play('explode', true);
      } else {
        const e = new Enemy(s.type, s.x, s.z, s.elite, s.aggro);
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

function explodeAt(x, y, z, radius, dmg, color, scale = 1) {
  Fx.explosion(x, y, z, color, scale);
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dd = Math.hypot(x - e.pos.x, y - e.cy, z - e.pos.z);
    if (dd < radius + e.r) G.damageEnemy(e, dmg * (1 - 0.5 * dd / (radius + e.r)), e.pos.x, e.cy, e.pos.z, color, true);
  }
}

function updateBullets(dt) {
  for (const b of G.bullets) {
    if (b.dead) continue;
    const px = b.pos.x, py = b.pos.y, pz = b.pos.z;
    if (b.kind === 'grenade') {
      b.vel.y -= 22 * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      Fx.trail(b.pos.x, b.pos.y, b.pos.z, '#b98cff', 0.5, 0.3, 3);
      b.life -= dt;
      let hitE = false;
      for (const e of G.enemies) if (!e.dead && Math.hypot(e.pos.x - b.pos.x, e.cy - b.pos.y, e.pos.z - b.pos.z) < e.r + 0.3) hitE = true;
      if (hitE || World.solidAt(b.pos.x, b.pos.y, b.pos.z) || b.life <= 0) {
        b.dead = true;
        const gy = Math.max(b.pos.y, World.heightAt(b.pos.x, b.pos.z) + 0.3);
        explodeAt(b.pos.x, gy, b.pos.z, 8, b.dmg, '#b98cff', 2.2);
        Fx.shockRing(b.pos.x, gy, b.pos.z, '#e0ccff', 4, 50);
        for (const eb of G.ebullets) if (eb.pos.distanceTo(b.pos) < 10) { eb.dead = true; Fx.glowBurst(eb.pos.x, eb.pos.y, eb.pos.z, '#b98cff', 0.6, 0.3); }
        Fx.addShake(0.5 * G.vol(b.pos) * 2);
        Sound.play('bomb', null, Math.min(1, G.vol(b.pos) * 2));
      }
      continue;
    }
    if (b.kind === 'missile') {
      if (!b.target || b.target.dead) b.target = G.nearestEnemy(b.pos.x, b.pos.z, 60, null, true);
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
    b.pos.addScaledVector(b.vel, dt);
    b.mesh.position.copy(b.pos);
    if (b.kind === 'missile' || Math.random() < 0.3) { _a.copy(b.pos).add(b.vel); b.mesh.lookAt(_a); }
    b.life -= dt;
    // collisions (swept against enemies)
    let hit = null, best = Infinity;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const rr = e.r + 0.15;
      if (Math.abs(e.pos.x - b.pos.x) > rr + 6 || Math.abs(e.pos.z - b.pos.z) > rr + 6) continue;
      const d = segPointDist(px, py, pz, b.pos.x, b.pos.y, b.pos.z, e.pos.x, e.cy, e.pos.z);
      if (d < rr) {
        const t = Math.hypot(e.pos.x - px, e.cy - py, e.pos.z - pz);
        if (t < best) { best = t; hit = e; }
      }
    }
    if (hit) {
      b.dead = true;
      if (hit.blocks(b.pos.x, b.pos.z)) {
        Fx.sparks(b.pos.x, b.pos.y, b.pos.z, 8, '#ffd1f2', 8);
        Sound.play('block', null, G.vol(hit.pos));
        hit.flash = Math.max(hit.flash, 0.3);
        if (b.kind === 'bolt' && b.color === '#3cf2ff') UI.hitmarker(false, true);
        continue;
      }
      if (b.kind === 'missile') { explodeAt(b.pos.x, b.pos.y, b.pos.z, b.splash, b.dmg, b.color, 0.7); Sound.play('explode', false, G.vol(b.pos)); }
      else {
        G.damageEnemy(hit, b.dmg, b.pos.x, b.pos.y, b.pos.z, b.color);
        if (b.color === '#3cf2ff') UI.hitmarker(false);
      }
      continue;
    }
    if (b.life <= 0 || World.solidAt(b.pos.x, b.pos.y, b.pos.z)) {
      b.dead = true;
      if (b.kind === 'missile') { explodeAt(b.pos.x, b.pos.y, b.pos.z, b.splash, b.dmg, b.color, 0.7); Sound.play('explode', false, G.vol(b.pos)); }
      else if (b.life > 0) { Fx.sparks(b.pos.x, b.pos.y, b.pos.z, 4, b.color, 5); Fx.glowBurst(b.pos.x, b.pos.y, b.pos.z, b.color, 0.5, 0.12, 3); }
    }
  }
}

function updateEnemyBullets(dt) {
  const p = G.player;
  for (const b of G.ebullets) {
    if (b.dead) continue;
    b.pos.addScaledVector(b.vel, dt);
    if (b.hugH) b.pos.y = World.heightAt(b.pos.x, b.pos.z) + b.hugH;
    b.mesh.position.copy(b.pos);
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    if (World.solidAt(b.pos.x, b.pos.y, b.pos.z)) { b.dead = true; Fx.sparks(b.pos.x, b.pos.y, b.pos.z, 4, b.color, 4); continue; }
    for (const c of G.companions) {
      if (c.offline > 0) continue;
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
    if (G.riding && G.vehicle) {
      if (b.pos.distanceTo(G.vehicle.pos) < 1.7 + b.r) { b.dead = true; G.vehicle.hurt(b.dmg, { x: b.pos.x - b.vel.x, z: b.pos.z - b.vel.z }); }
      continue;
    }
    if (segPointDist(p.pos.x, p.pos.y + 0.3, p.pos.z, p.pos.x, p.pos.y + 1.6, p.pos.z, b.pos.x, b.pos.y, b.pos.z) < 0.45 + b.r) {
      b.dead = true;
      if (p.dashT <= 0) p.hurt(b.dmg, { x: b.pos.x - b.vel.x, z: b.pos.z - b.vel.z });
    }
  }
}

function updatePickups(dt) {
  const p = G.player;
  const mag = p.magnet;
  const vacuum = G.objective === 'extract';
  for (const k of G.pickups) {
    k.t += dt;
    const dx = p.pos.x - k.pos.x, dy = p.pos.y + 0.9 - k.pos.y, dz = p.pos.z - k.pos.z;
    const dd = Math.hypot(dx, dy, dz);
    if (!p.dead && (dd < mag || (vacuum && k.t > 1))) k.pulled = true;
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
    if (!p.dead && dd < 1.3) {
      k.dead = true;
      scene.remove(k.model);
      if (k.type === 'health') { p.heal(15); UI.feed('+15 hull', '#6bff9e'); Sound.play('heal'); }
      else {
        G.inv[k.type]++;
        G.stats.parts++;
        UI.feed(`+1 ${PARTS[k.type].name}`, PARTS[k.type].color, k.type);
        UI.bump(k.type);
        Sound.play('pickup');
      }
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
let swayX = 0, swayY = 0, camDist = 4.2;

function updateAvatar(dt) {
  const p = G.player, a = G.avatar, U = a.userData;
  const show = G.thirdPerson && !p.dead && G.state !== 'menu';
  a.visible = show;
  if (!show) return;
  const riding = G.riding && G.vehicle;
  if (riding) a.position.set(G.vehicle.pos.x, G.vehicle.pos.y - 0.55, G.vehicle.pos.z);
  else a.position.copy(p.pos);
  a.rotation.set(riding ? -p.pitch * 0.6 : 0, p.yaw + Math.PI, riding ? G.vehicle.bank : 0, 'YXZ');
  const sw = Math.sin(p.walk * 2.2) * 0.7 * p.bobAmt;
  const air = !p.grounded && !riding;
  U.legs.forEach((l, i) => {
    const s = i ? 1 : -1;
    if (riding) { l.hip.rotation.x = -1.3; l.knee.rotation.x = 1.4; }
    else if (p.climbing) { l.hip.rotation.x = -0.5 + Math.sin(p.walk * 3 + i * Math.PI) * 0.4; l.knee.rotation.x = 0.8; }
    else if (p.gliding) { l.hip.rotation.x = 0.35 + Math.sin(G.time * 3 + i) * 0.08; l.knee.rotation.x = 0.3; }
    else if (air) { l.hip.rotation.x = -0.5 * (i ? 1 : 0.4); l.knee.rotation.x = 0.9; }
    else { l.hip.rotation.x = sw * s; l.knee.rotation.x = Math.max(0, -sw * s) * 0.9; }
  });
  const [la, ra] = U.arms;
  if (p.gliding || p.climbing) {
    const c = p.climbing ? Math.sin(p.walk * 3) * 0.3 : 0;
    la.rotation.set(-Math.PI + 0.15 + c, 0, 0.1); ra.rotation.set(-Math.PI + 0.15 - c, 0, -0.1);
  } else {
    ra.rotation.set(-Math.PI / 2 - p.pitch, 0, 0);            // aiming arm follows the view
    la.rotation.set(riding ? -1.2 : -sw * 0.6, 0, 0.1);
  }
  U.torso.rotation.x = p.gliding ? 0.25 : 0;
  U.head.rotation.x = -p.pitch * 0.5;
  U.glider.visible = p.gliding;
  const thrust = air || p.dashT > 0 ? 1.4 : 0.5;
  for (const t of U.thrusters) t.scale.setScalar(thrust * (0.9 + Math.random() * 0.2));
  if (U.flashT > 0) { U.flashT -= dt; U.flash.visible = U.flashT > 0; } else U.flash.visible = false;
}

function updateCamera(dt) {
  const p = G.player;
  const shake = Fx.shake * Fx.shake;
  updateAvatar(dt);
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
    // over-the-shoulder follow camera (chase camera while flying) that stays out of walls
    const riding = G.riding && G.vehicle;
    const fx = -Math.sin(p.yaw) * Math.cos(p.pitch), fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const px = (riding ? G.vehicle.pos.x : p.pos.x + rx * 0.6);
    const py = riding ? G.vehicle.pos.y + 1.8 : p.pos.y + 1.6;
    const pz = (riding ? G.vehicle.pos.z : p.pos.z + rz * 0.6);
    const want = riding ? 9 : 4.3;
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

  if (G.state === 'playing') {
    if (Input.hit('Tab') || Input.hit('KeyI')) UI.openWorkshop('field');
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
    camera.position.set(Math.sin(a) * 70, World.arena.y + 22 + Math.sin(menuT * 0.2) * 4, Math.cos(a) * 70);
    camera.lookAt(0, World.arena.y + 4, 0);
    World.followSun(0, World.arena.y, 0);
    Fx.update(dt, (x, z) => World.heightAt(x, z));
    if (Math.random() < dt * 0.8) Fx.explosion(rand(-40, 40), World.arena.y + rand(2, 12), rand(-40, 40), pick(['#ff4d6d', '#ff8c42', '#3cf2ff', '#6bff9e']), rand(0.5, 1.2));
  } else if (G.state === 'workshop' || G.state === 'paused') {
    if (Input.hit('Escape') || ((Input.hit('Tab') || Input.hit('KeyI')) && G.state === 'workshop')) UI.closeOverlay();
  }
  if (Input.hit('KeyM')) UI.toggleMute();
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

function initMenuScene() {
  if (G.vehicle && G.vehicle.deployed) scene.remove(G.vehicle.model);
  G.riding = false; G.focus = false;
  if (G.avatar) G.avatar.visible = false;
  if (G.fpGlider) G.fpGlider.visible = false;
  clearEntities();
  World.dispose();
  G.level = 0;
  G.up = { armor: 0, overclock: 0, split: 0, thruster: 0, magnet: 0, firmware: 0, slot: 0 };
  G.player = new Player(); G.player.dead = true;
  World.build(scene, ZONES[0], 0);
  Weather.init(scene, 'dust', '#3cf2ff');
  G.vm.visible = false;
  camera.rotation.set(0, 0, 0);
  camera.fov = 60; camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
Input.init(canvas);
Input.onLockChange = (locked) => { if (!locked && G.state === 'playing' && !Input.fallback) UI.pause(); };
canvas.addEventListener('click', () => { if (G.state === 'playing' && !Input.locked) Input.lock(canvas); });
Touch.init();
if (Touch.enabled) {
  // phones: performance mode by default (no shadows, reduced resolution, no MSAA)
  G.settings.quality = 'low';
  renderer.shadowMap.enabled = false;
  G.settings.sens = 1.1;
}
UI.init();
resize();
initMenuScene();
requestAnimationFrame(frame);
