'use strict';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;
let vignette = null;

const G = {
  state: 'menu', // menu | playing | paused | workshop | gameover | victory
  level: 0, time: 0, timeScale: 1, hitStop: 0,
  arena: { w: 2800, h: 1900 },
  cam: { x: 0, y: 0 },
  player: null,
  enemies: [], bullets: [], ebullets: [], pickups: [], spawns: [], companions: [],
  inv: {}, up: {}, repairKits: 0, cells: 0,
  bg: null, lights: [],
  wave: 0, waveState: 'intro', waveTimer: 0, queue: [], spawnTimer: 0,
  boss: null, levelDone: false, dying: 0,
  stats: {}, total: {},
  bannerData: null,
  invBump: {},
  hintT: 0,
  snapshot: null,

  get slots() { return 3 + this.up.slot; },

  banner(text, sub, color, dur = 2.6) { this.bannerData = { text, sub, color, t: 0, dur }; },

  nearestEnemy(x, y, maxD, exclude) {
    let best = null, bd = maxD * maxD;
    for (const e of this.enemies) {
      if (e.dead || (exclude && exclude.has(e))) continue;
      const dd = d2(x, y, e.x, e.y);
      if (dd < bd) { bd = dd; best = e; }
    }
    return best;
  },

  queueSpawn(type, x, y, elite = false, t = 0.9) {
    x = clamp(x, 80, this.arena.w - 80); y = clamp(y, 80, this.arena.h - 80);
    this.spawns.push({ type, x, y, elite, t, max: t });
  },

  damageEnemy(e, dmg, hx, hy, color, quiet = false) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = Math.max(e.flash, quiet ? 0.35 : 1);
    if (!quiet) {
      Fx.sparks(hx, hy, Math.atan2(hy - e.y, hx - e.x), 0.9, 4, color, 260);
      Sound.play('hit');
    }
    if (e.hp <= 0) this.killEnemy(e, true);
  },

  killEnemy(e, drops) {
    if (e.dead) return;
    e.dead = true;
    if (e.isBoss) { this.bossKilled(e); return; }
    const big = e.r > 22;
    Fx.explosion(e.x, e.y, e.d.color, e.r / 16 + (e.elite ? 0.5 : 0));
    Fx.shake(big ? 10 : 3);
    Sound.play('explode', big);
    if (big) this.hitStop = 0.05;
    this.stats.kills++;
    if (!drops) return;
    for (const [part, ch, mn, mx] of e.d.drops) {
      if (Math.random() < ch) for (let i = randi(mn, mx); i > 0; i--) this.dropPart(part, e.x, e.y);
    }
    if (e.elite) {
      if (Math.random() < 0.45) this.dropPart('quantum', e.x, e.y);
      this.dropPart(pick(['core', 'circuit', 'lens', 'servo']), e.x, e.y);
      this.dropPart('scrap', e.x, e.y);
    }
    if (Math.random() < 0.05) this.pickups.push(this.makePickup('health', e.x, e.y));
  },

  makePickup(type, x, y) {
    const a = rand(0, TAU), s = rand(80, 240);
    return { type, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, bob: rand(0, TAU), pulled: false };
  },
  dropPart(type, x, y) { this.pickups.push(this.makePickup(type, x, y)); },

  bossKilled(b) {
    this.bossDeath = { x: b.x, y: b.y, t: 0, color: b.color, r: b.r };
    Sound.play('explode', true);
    this.hitStop = 0.15;
    this.timeScale = 0.3;
    Fx.shake(25);
    Fx.flash('#ffffff', 0.7);
    for (const e of this.enemies) if (!e.dead && !e.isBoss) e.doomT = rand(0.2, 1.2);
    this.spawns.length = 0;
    for (const bb of this.ebullets) bb.dead = true;
    const L = this.level;
    const loot = { scrap: 6, wire: 5, servo: 3, circuit: 4, core: 2 + Math.floor(L / 2), lens: 2 + Math.floor(L / 2), quantum: 2 + Math.floor(L / 2) };
    for (const [k, n] of Object.entries(loot)) for (let i = 0; i < n; i++) this.dropPart(k, b.x + rand(-30, 30), b.y + rand(-30, 30));
    for (const p of this.pickups) { const a = rand(0, TAU), s = rand(150, 500); p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; }
    this.stats.kills++;
    this.waveState = 'clear';
    this.waveTimer = 5;
    this.levelDone = true;
    Sound.setIntensity(0);
    this.clearBanner = false;
  },

  playerDied() {
    const p = this.player;
    p.dead = true;
    Fx.explosion(p.x, p.y, '#3cf2ff', 2.5);
    Fx.shake(25);
    Fx.flash('#ff2244', 0.6);
    Sound.play('explode', true);
    Sound.play('lose');
    this.dying = 2.2;
    this.timeScale = 0.35;
    Sound.setIntensity(0);
  },
};

// ═════════════════════════ Setup ═════════════════════════
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  vignette = document.createElement('canvas');
  vignette.width = W; vignette.height = H;
  const g = vignette.getContext('2d');
  const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.7)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  if (Ambient.list.length) Ambient.init(Ambient.type, Ambient.color, W, H);
}

function newRun() {
  G.inv = {}; PART_ORDER.forEach((k) => (G.inv[k] = 0));
  G.up = { armor: 0, overclock: 0, split: 0, thruster: 0, magnet: 0, firmware: 0, slot: 0 };
  G.repairKits = 1; G.cells = 0;
  G.companions = [];
  G.player = new Player();
  G.total = { kills: 0, parts: 0, crafted: 0, time: 0, damageTaken: 0 };
  // a little starter salvage so the first build comes quickly
  G.inv.scrap = 2; G.inv.wire = 1;
  startLevel(0);
}

function takeSnapshot() {
  G.snapshot = JSON.stringify({ inv: G.inv, up: G.up, repairKits: G.repairKits, cells: G.cells, comps: G.companions.map((c) => c.kind), hp: G.player.hp, total: G.total });
}
function restoreSnapshot() {
  const s = JSON.parse(G.snapshot);
  G.inv = s.inv; G.up = s.up; G.repairKits = s.repairKits; G.cells = s.cells; G.total = s.total;
  G.player = new Player(); G.player.hp = s.hp;
  G.companions = s.comps.map((k) => new Companion(k));
}

function startLevel(i) {
  G.level = i;
  const L = LEVELS[i];
  G.arena = { w: Math.max(2800, Math.ceil(W / 80) * 80 + 160), h: Math.max(1900, Math.ceil(H / 80) * 80 + 160) };
  const bg = buildBackground(L.theme, G.arena.w, G.arena.h);
  G.bg = bg.canvas; G.lights = bg.lights;
  G.enemies = []; G.bullets = []; G.ebullets = []; G.pickups = []; G.spawns = [];
  Fx.clear();
  const p = G.player;
  p.x = G.arena.w / 2; p.y = G.arena.h / 2; p.vx = p.vy = 0; p.dead = false; p.invuln = 1.5; p.energy = 100; p.dashCd = 0;
  p.hp = Math.min(p.hp, p.maxHp);
  G.companions.forEach((c, idx) => { c.offline = 0; c.hp = c.maxHp; c.x = p.x + Math.cos(idx) * 60; c.y = p.y + Math.sin(idx) * 60; c.target = null; });
  G.cam.x = p.x - W / 2; G.cam.y = p.y - H / 2;
  G.wave = 0; G.waveState = 'intro'; G.waveTimer = 3.2; G.queue = [];
  G.boss = null; G.bossDeath = null; G.levelDone = false; G.dying = 0;
  G.timeScale = 1; G.hitStop = 0;
  G.stats = { kills: 0, parts: 0, time: 0, damageTaken: 0 };
  G.hintT = i === 0 ? 14 : 0;
  takeSnapshot();
  G.banner(`SECTOR ${i + 1}`, L.name.toUpperCase(), L.theme.accent, 3);
  Ambient.init(L.theme.ambient, L.theme.accent, W, H);
  G.state = 'playing';
  Sound.setIntensity(1);
  UI.hideAll();
}

function buildWave(lv, n) {
  const L = LEVELS[lv];
  let budget = 8 + lv * 4 + (n - 1) * 4;
  const q = [];
  let guard = 0;
  while (budget > 0 && guard++ < 200) {
    const type = weighted(L.pool);
    const cost = ENEMY_TYPES[type].cost;
    if (cost > budget + 1.5) continue;
    if (type === 'swarmer') {
      const k = 3 + Math.floor(lv / 2);
      q.push(Array.from({ length: k }, () => ({ type, elite: false })));
      budget -= k * cost;
    } else {
      const elite = lv > 0 && Math.random() < lv * 0.05 + (n - 1) * 0.02;
      q.push([{ type, elite }]);
      budget -= cost;
    }
  }
  return q;
}

function spawnPoint() {
  const p = G.player;
  for (let tries = 0; tries < 20; tries++) {
    const a = rand(0, TAU), dd = rand(480, 760);
    const x = p.x + Math.cos(a) * dd, y = p.y + Math.sin(a) * dd;
    if (x > 100 && y > 100 && x < G.arena.w - 100 && y < G.arena.h - 100) return [x, y];
  }
  return [clamp(p.x + 500, 100, G.arena.w - 100), clamp(p.y, 100, G.arena.h - 100)];
}

function startWave(n) {
  G.wave = n;
  G.queue = buildWave(G.level, n);
  G.spawnTimer = 0.6;
  G.waveState = 'active';
  G.banner(`WAVE ${n} / ${LEVELS[G.level].waves}`, n === 1 ? 'Hostiles inbound' : 'Reinforcements detected', '#ffffff', 2);
  Sound.play('wave');
}

// ═════════════════════════ Update ═════════════════════════
function updateWaves(dt) {
  const L = LEVELS[G.level];
  G.waveTimer -= dt;
  switch (G.waveState) {
    case 'intro':
      if (G.waveTimer <= 0) startWave(1);
      break;
    case 'active': {
      G.spawnTimer -= dt;
      const cap = 26 + G.level * 4;
      if (G.queue.length && G.spawnTimer <= 0 && G.enemies.length < cap) {
        const group = G.queue.shift();
        const [x, y] = spawnPoint();
        group.forEach((s) => G.queueSpawn(s.type, x + rand(-45, 45), y + rand(-45, 45), s.elite));
        G.spawnTimer = rand(0.7, 1.5) * Math.max(0.55, 1 - G.level * 0.07);
      }
      if (!G.queue.length && !G.spawns.length && !G.enemies.length) {
        if (G.wave < L.waves) {
          G.waveState = 'break'; G.waveTimer = 3;
          G.banner('WAVE CLEARED', 'Collect salvage · TAB to craft', '#6bff9e', 2.4);
        } else {
          G.waveState = 'bossWarn'; G.waveTimer = 3.4;
          G.banner('⚠ WARNING ⚠', `${L.boss.name} — ${L.boss.title.toUpperCase()}`, '#ff3355', 3.2);
          Sound.play('warn');
          Sound.setIntensity(2);
        }
      }
      break;
    }
    case 'break':
      if (G.waveTimer <= 0) startWave(G.wave + 1);
      break;
    case 'bossWarn':
      if (G.waveTimer <= 0) {
        const p = G.player;
        const a = Math.atan2(G.arena.h / 2 - p.y, G.arena.w / 2 - p.x) + rand(-0.8, 0.8);
        G.queueSpawn('boss', p.x + Math.cos(a) * 480, p.y + Math.sin(a) * 480, false, 1.8);
        G.waveState = 'boss';
      }
      break;
    case 'boss':
      break;
    case 'clear':
      if (!G.clearBanner && G.waveTimer < 4.1) {
        G.clearBanner = true;
        G.banner('SECTOR CLEARED', L.boss.name + ' destroyed', '#6bff9e', 3.2);
        Sound.play('win');
      }
      if (G.waveTimer <= 0) {
        G.waveState = 'done';
        Object.keys(G.stats).forEach((k) => (G.total[k] = (G.total[k] || 0) + G.stats[k]));
        if (G.level >= LEVELS.length - 1) { G.state = 'victory'; UI.showVictory(); }
        else UI.openWorkshop('between');
      }
      break;
  }
}

function update(dt) {
  G.time += dt;
  G.stats.time += dt;
  const p = G.player;

  if (G.dying > 0) {
    G.dying -= dt / Math.max(0.1, G.timeScale);
    if (G.dying <= 0) {
      Object.keys(G.stats).forEach((k) => (G.total[k] = (G.total[k] || 0) + G.stats[k]));
      G.state = 'gameover';
      UI.showGameOver();
      return;
    }
  } else if (!p.dead) {
    p.update(dt);
  }
  if (G.hintT > 0) G.hintT -= dt;

  updateWaves(dt);

  // spawn telegraphs
  for (let i = G.spawns.length - 1; i >= 0; i--) {
    const s = G.spawns[i];
    s.t -= dt;
    if (s.t <= 0) {
      G.spawns.splice(i, 1);
      if (s.type === 'boss') {
        const b = new Boss(G.level, s.x, s.y);
        G.boss = b; G.enemies.push(b);
        Fx.explosion(s.x, s.y, b.color, 2.5); Fx.shake(20);
        Sound.play('explode', true);
      } else {
        G.enemies.push(new Enemy(s.type, s.x, s.y, s.elite));
        Fx.ring(s.x, s.y, ENEMY_TYPES[s.type].color, 45, 0.35, 2);
      }
    }
  }

  // enemies
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (e.doomT !== undefined) { e.doomT -= dt; if (e.doomT <= 0) G.killEnemy(e, true); continue; }
    e.update(dt);
  }
  // separation
  const E = G.enemies;
  for (let i = 0; i < E.length; i++) {
    const a = E[i];
    for (let j = i + 1; j < E.length; j++) {
      const b = E[j];
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
      const dd = dx * dx + dy * dy;
      if (dd < rr * rr && dd > 0.01) {
        const d = Math.sqrt(dd), push = (rr - d) * 0.5;
        const nx = dx / d, ny = dy / d;
        const wa = a.isBoss ? 0 : b.isBoss ? 2 : 1, wb = b.isBoss ? 0 : a.isBoss ? 2 : 1;
        a.x -= nx * push * wa; a.y -= ny * push * wa;
        b.x += nx * push * wb; b.y += ny * push * wb;
      }
    }
  }

  // companions
  const comps = G.companions;
  if (!p.dead) comps.forEach((c, i) => c.update(dt, i, comps.length));

  updateBullets(dt);
  updateEnemyBullets(dt);
  updatePickups(dt);

  G.enemies = G.enemies.filter((e) => !e.dead);
  G.bullets = G.bullets.filter((b) => !b.dead);
  G.ebullets = G.ebullets.filter((b) => !b.dead);

  // boss death sequence
  if (G.bossDeath) {
    const bd = G.bossDeath;
    bd.t += dt;
    if (bd.t < 1.6 && Math.random() < dt * 14) {
      Fx.explosion(bd.x + rand(-bd.r, bd.r), bd.y + rand(-bd.r, bd.r), pick([bd.color, '#ffb347', '#ffffff']), rand(0.6, 1.4));
      Fx.shake(5); Sound.play('explode', false);
    }
    if (bd.t >= 1.6 && !bd.final) {
      bd.final = true;
      Fx.explosion(bd.x, bd.y, bd.color, 4); Fx.ring(bd.x, bd.y, '#ffffff', 400, 0.8, 6);
      Fx.shake(26); Fx.flash('#ffffff', 0.5); Sound.play('bomb');
    }
  }

  Fx.update(dt);
  Ambient.update(dt, W, H, G.time);

  if (G.bannerData) { G.bannerData.t += dt; if (G.bannerData.t > G.bannerData.dur) G.bannerData = null; }
  for (const k in G.invBump) G.invBump[k] = Math.max(0, G.invBump[k] - dt * 4);

  // camera
  const lookX = (Input.mouse.x - W / 2) * 0.18, lookY = (Input.mouse.y - H / 2) * 0.18;
  const tx = p.x - W / 2 + (p.dead ? 0 : lookX), ty = p.y - H / 2 + (p.dead ? 0 : lookY);
  const k = 1 - Math.exp(-6 * dt);
  G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
  G.cam.x = clamp(G.cam.x, -40, G.arena.w - W + 40);
  G.cam.y = clamp(G.cam.y, -40, G.arena.h - H + 40);
}

function explodeAt(x, y, radius, dmg, color, scale = 1) {
  Fx.explosion(x, y, color, scale);
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dd = dist(x, y, e.x, e.y);
    if (dd < radius + e.r) G.damageEnemy(e, dmg * (1 - 0.5 * dd / (radius + e.r)), e.x, e.y, color, true);
  }
}

function updateBullets(dt) {
  for (const b of G.bullets) {
    if (b.kind === 'bomb') {
      b.t += dt;
      const k = Math.min(1, b.t / b.flight);
      b.x = lerp(b.sx, b.tx, k); b.y = lerp(b.sy, b.ty, k);
      b.z = Math.sin(k * Math.PI) * 60;
      Fx.trail(b.x, b.y - b.z, '#b98cff', 12, 0.25);
      if (k >= 1) {
        b.dead = true;
        explodeAt(b.x, b.y, 170, 90 + G.level * 12, '#b98cff', 2.2);
        Fx.ring(b.x, b.y, '#e0ccff', 190, 0.5, 5);
        for (const eb of G.ebullets) if (d2(eb.x, eb.y, b.x, b.y) < 200 * 200) { eb.dead = true; Fx.trail(eb.x, eb.y, '#b98cff', 10, 0.3); }
        Fx.shake(16); Fx.flash('#b98cff', 0.25);
        Sound.play('bomb');
      }
      continue;
    }
    if (b.kind === 'missile') {
      if (!b.target || b.target.dead) b.target = G.nearestEnemy(b.x, b.y, 700);
      const sp = Math.hypot(b.vx, b.vy);
      let a = Math.atan2(b.vy, b.vx);
      if (b.target) a += clamp(angDiff(a, Math.atan2(b.target.y - b.y, b.target.x - b.x)), -6 * dt, 6 * dt);
      const ns = Math.min(620, sp + 900 * dt);
      b.vx = Math.cos(a) * ns; b.vy = Math.sin(a) * ns;
      if (Math.random() < 0.7) Fx.smoke(b.x, b.y, 4, 0.5);
      Fx.trail(b.x, b.y, '#ffcf4d', 9, 0.15);
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < 26 || b.y < 26 || b.x > G.arena.w - 26 || b.y > G.arena.h - 26) {
      b.dead = true;
      if (b.kind === 'missile') { explodeAt(b.x, b.y, b.splash, b.dmg, b.color, 0.7); Sound.play('explode', false); }
      else Fx.sparks(b.x, b.y, Math.atan2(-b.vy, -b.vx), 0.8, 3, b.color, 150);
      continue;
    }
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (d2(b.x, b.y, e.x, e.y) < (e.r + b.r) ** 2) {
        b.dead = true;
        if (e.blocks(b.x, b.y)) {
          Fx.sparks(b.x, b.y, Math.atan2(b.y - e.y, b.x - e.x), 0.6, 6, '#ffd1f2', 280);
          Sound.play('block');
          e.flash = Math.max(e.flash, 0.3);
          break;
        }
        if (b.kind === 'missile') { explodeAt(b.x, b.y, b.splash, b.dmg, b.color, 0.7); Sound.play('explode', false); }
        else {
          G.damageEnemy(e, b.dmg, b.x, b.y, b.color);
          e.vx += b.vx * 0.03; e.vy += b.vy * 0.03;
        }
        break;
      }
    }
  }
}

function updateEnemyBullets(dt) {
  const p = G.player;
  for (const b of G.ebullets) {
    if (b.dead) continue;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < 26 || b.y < 26 || b.x > G.arena.w - 26 || b.y > G.arena.h - 26) { b.dead = true; continue; }
    for (const c of G.companions) {
      if (c.offline > 0) continue;
      const pad = c.kind === 'shield' ? 8 : 0;
      if (d2(b.x, b.y, c.x, c.y) < (c.r + b.r + pad) ** 2) {
        b.dead = true;
        c.hurt(b.dmg * (c.kind === 'shield' ? 0.35 : 1));
        Fx.sparks(b.x, b.y, Math.atan2(b.y - c.y, b.x - c.x), 0.8, 5, c.kind === 'shield' ? c.d.color : b.color, 240);
        if (c.kind === 'shield') { Fx.ring(c.x, c.y, c.d.color, 26, 0.2, 2); Sound.play('block'); }
        break;
      }
    }
    if (b.dead || p.dead) continue;
    if (d2(b.x, b.y, p.x, p.y) < (p.r + b.r - 3) ** 2 && p.dashT <= 0) {
      b.dead = true;
      p.hurt(b.dmg);
    }
  }
}

function updatePickups(dt) {
  const p = G.player;
  const mag = p.magnet;
  const vacuum = G.levelDone || G.waveState === 'break' || G.waveState === 'bossWarn';
  for (const k of G.pickups) {
    k.t += dt;
    const dd = dist(k.x, k.y, p.x, p.y);
    if (!p.dead && (dd < mag || (vacuum && k.t > 0.6))) k.pulled = true;
    if (k.pulled && !p.dead) {
      const a = Math.atan2(p.y - k.y, p.x - k.x);
      const sp = 300 + k.t * 80 + (vacuum ? 500 : 0);
      const kk = 1 - Math.exp(-8 * dt);
      k.vx += (Math.cos(a) * sp - k.vx) * kk; k.vy += (Math.sin(a) * sp - k.vy) * kk;
    } else {
      const f = Math.exp(-4 * dt); k.vx *= f; k.vy *= f;
    }
    k.x += k.vx * dt; k.y += k.vy * dt;
    if (!p.dead && dd < p.r + 10) {
      k.dead = true;
      if (k.type === 'health') {
        p.heal(15);
        Fx.text(k.x, k.y - 14, '+15 HULL', '#6bff9e', 14);
        Sound.play('heal');
      } else {
        G.inv[k.type]++;
        G.stats.parts++;
        G.invBump[k.type] = 1;
        Fx.text(k.x, k.y - 14, '+1 ' + PARTS[k.type].name, PARTS[k.type].color, 13);
        Sound.play('pickup');
      }
      Fx.trail(k.x, k.y, k.type === 'health' ? '#6bff9e' : PARTS[k.type].color, 18, 0.3);
    }
    if (k.t > 30 && !k.pulled) k.dead = true;
  }
  G.pickups = G.pickups.filter((k) => !k.dead);
}

// ═════════════════════════ Render ═════════════════════════
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, W, H);
  if (!G.bg) return;

  let sx = 0, sy = 0;
  if (Fx.shakeAmt > 0) { sx = rand(-1, 1) * Fx.shakeAmt; sy = rand(-1, 1) * Fx.shakeAmt; }
  const cx = Math.round(G.cam.x + sx), cy = Math.round(G.cam.y + sy);

  ctx.save();
  ctx.translate(-cx, -cy);

  // background (only the visible slice)
  const bx = clamp(cx, 0, G.bg.width), by = clamp(cy, 0, G.bg.height);
  const bw = Math.min(W + (cx < 0 ? cx : 0), G.bg.width - bx), bh = Math.min(H + (cy < 0 ? cy : 0), G.bg.height - by);
  if (bw > 0 && bh > 0) ctx.drawImage(G.bg, bx, by, bw, bh, bx, by, bw, bh);

  const inView = (x, y, m = 80) => x > cx - m && x < cx + W + m && y > cy - m && y < cy + H + m;

  // animated floor lights
  for (const l of G.lights) {
    if (!inView(l.x, l.y, l.r)) continue;
    const a = l.soft ? 0.12 + 0.08 * Math.sin(G.time * 1.5 + l.ph) : 0.35 + 0.25 * Math.sin(G.time * 3 + l.ph);
    glow(ctx, l.x, l.y, l.r, l.color, a);
  }

  Fx.drawUnder(ctx);

  // spawn telegraphs
  for (const s of G.spawns) {
    const k = 1 - s.t / s.max;
    const col = s.type === 'boss' ? LEVELS[G.level].boss.color : ENEMY_TYPES[s.type].color;
    const R = s.type === 'boss' ? 110 : 34;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(col, 0.3 + k * 0.6); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, R * (1.6 - k), 0, TAU); ctx.stroke();
    ctx.setLineDash([6, 6]); ctx.lineDashOffset = G.time * 40;
    ctx.beginPath(); ctx.arc(s.x, s.y, R * 0.7, 0, TAU); ctx.stroke();
    ctx.restore();
    glow(ctx, s.x, s.y, R * 1.5 * k, col, k * 0.8);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const beam = ctx.createLinearGradient(s.x, s.y - 400, s.x, s.y);
    beam.addColorStop(0, rgba(col, 0)); beam.addColorStop(1, rgba(col, 0.4 * k));
    ctx.fillStyle = beam; ctx.fillRect(s.x - R * 0.35 * k, s.y - 400, R * 0.7 * k, 400);
    ctx.restore();
  }

  // pickups
  for (const k of G.pickups) {
    if (!inView(k.x, k.y)) continue;
    const bob = Math.sin(G.time * 4 + k.bob) * 3;
    const blink = k.t > 25 && Math.floor(G.time * 8) % 2 === 0;
    if (blink) continue;
    const col = k.type === 'health' ? '#6bff9e' : PARTS[k.type].color;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(k.x, k.y + 10, 8, 3, 0, 0, TAU); ctx.fill();
    glow(ctx, k.x, k.y + bob, k.type === 'quantum' ? 34 : 24, col, 0.55 + 0.2 * Math.sin(G.time * 6 + k.bob));
    if (k.type === 'health') {
      ctx.fillStyle = '#6bff9e';
      ctx.fillRect(k.x - 2.5, k.y + bob - 8, 5, 16); ctx.fillRect(k.x - 8, k.y + bob - 2.5, 16, 5);
    } else drawPartIcon(ctx, k.type, k.x, k.y + bob, 9, G.time + k.bob);
  }

  // enemies, companions, player
  for (const e of G.enemies) if (e.isBoss || e.state === 'aim' || inView(e.x, e.y, e.r + 40)) e.draw(ctx);
  for (const c of G.companions) c.draw(ctx);
  G.player.draw(ctx);

  // bullets
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.bullets) {
    if (!inView(b.x, b.y)) continue;
    if (b.kind === 'bomb') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(b.x, b.y + 6, 8, 3, 0, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(Glow.get('#b98cff'), b.x - 28, b.y - b.z - 28, 56, 56);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(b.x, b.y - b.z, 5, 0, TAU); ctx.fill();
      continue;
    }
    const a = Math.atan2(b.vy, b.vx);
    ctx.drawImage(Glow.get(b.color), b.x - 16, b.y - 16, 32, 32);
    ctx.strokeStyle = b.color; ctx.lineWidth = b.r * 1.3; ctx.lineCap = 'round';
    const len = b.kind === 'missile' ? 8 : 14;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - Math.cos(a) * len, b.y - Math.sin(a) * len); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = b.r * 0.6;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - Math.cos(a) * len * 0.6, b.y - Math.sin(a) * len * 0.6); ctx.stroke();
  }
  for (const b of G.ebullets) {
    if (!inView(b.x, b.y)) continue;
    const r = b.r;
    ctx.drawImage(Glow.get(b.color), b.x - r * 4, b.y - r * 4, r * 8, r * 8);
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.5, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  Fx.drawOver(ctx);
  Fx.drawTexts(ctx);
  ctx.restore();

  // screen-space layers
  Ambient.draw(ctx, G.cam.x, G.cam.y, W, H, G.time);
  ctx.drawImage(vignette, 0, 0);
  if (Fx.flashA > 0) {
    ctx.globalAlpha = Fx.flashA;
    ctx.fillStyle = Fx.flashColor;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  const p = G.player;
  if (!p.dead && p.hp / p.maxHp < 0.3) {
    const a = (0.3 - p.hp / p.maxHp) * (0.8 + 0.4 * Math.sin(G.time * 6));
    const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    grd.addColorStop(0, 'rgba(255,0,40,0)'); grd.addColorStop(1, `rgba(255,0,40,${a})`);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  }

  if (G.state !== 'menu') {
    HUD.draw(ctx);
    drawBanner();
    if (G.state === 'playing') drawCrosshair();
  }
}

function drawCrosshair() {
  const { x, y } = Input.mouse;
  const p = G.player;
  const spread = 7 + (p.recoil || 0) * 5;
  ctx.save();
  ctx.strokeStyle = '#3cf2ff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.shadowColor = '#3cf2ff'; ctx.shadowBlur = 8;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * spread, y + Math.sin(a) * spread);
    ctx.lineTo(x + Math.cos(a) * (spread + 7), y + Math.sin(a) * (spread + 7));
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
  // bomb charge ring
  if (p.energy >= 100) {
    ctx.strokeStyle = rgba('#b98cff', 0.6 + 0.3 * Math.sin(G.time * 6)); ctx.shadowColor = '#b98cff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, spread + 12, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

function drawBanner() {
  const b = G.bannerData;
  if (!b) return;
  const inT = Math.min(1, b.t / 0.35), outT = Math.min(1, (b.dur - b.t) / 0.5);
  const a = Math.min(inT, outT);
  const y = H * 0.3;
  ctx.save();
  ctx.globalAlpha = a;
  const wBar = Math.min(W, 900) * (0.4 + 0.6 * inT);
  const grd = ctx.createLinearGradient(W / 2 - wBar / 2, 0, W / 2 + wBar / 2, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.5, 'rgba(0,0,0,0.6)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd; ctx.fillRect(W / 2 - wBar / 2, y - 48, wBar, 96);
  ctx.fillStyle = rgba(b.color, 0.8);
  ctx.fillRect(W / 2 - wBar / 2 * 0.8, y - 48, wBar * 0.8, 1.5);
  ctx.fillRect(W / 2 - wBar / 2 * 0.8, y + 46, wBar * 0.8, 1.5);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const size = Math.min(56, W / 14);
  ctx.font = `900 ${size}px Orbitron, sans-serif`;
  ctx.letterSpacing = `${Math.round(8 * (1 - inT) + 6)}px`;
  ctx.shadowColor = b.color; ctx.shadowBlur = 24;
  ctx.fillStyle = b.color;
  ctx.fillText(b.text, W / 2, y - 8);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(b.text, W / 2, y - 8);
  if (b.sub) {
    ctx.letterSpacing = '4px';
    ctx.font = '600 18px Rajdhani, sans-serif';
    ctx.fillStyle = rgba(b.color, 0.95);
    ctx.fillText(b.sub, W / 2, y + 30);
  }
  ctx.letterSpacing = '0px';
  ctx.restore();
}

// ═════════════════════════ Main loop ═════════════════════════
let lastT = performance.now();
function frame(now) {
  let dt = clamp((now - lastT) / 1000, 0, 0.033);
  lastT = Math.max(lastT, now);

  if (G.state === 'playing') {
    if (Input.hit('Tab') || Input.hit('KeyI')) { UI.openWorkshop('field'); }
    else if (Input.hit('Escape') || Input.hit('KeyP')) { UI.pause(); }
    else {
      if (G.hitStop > 0) { G.hitStop -= dt; }
      else {
        G.timeScale += (1 - G.timeScale) * (1 - Math.exp(-(G.dying > 0 ? 0.6 : 2.5) * dt));
        update(dt * G.timeScale);
      }
    }
  } else if (G.state === 'menu') {
    G.time += dt;
    G.cam.x = G.arena.w / 2 - W / 2 + Math.cos(G.time * 0.08) * 500;
    G.cam.y = G.arena.h / 2 - H / 2 + Math.sin(G.time * 0.11) * 300;
    Ambient.update(dt, W, H, G.time);
    Fx.update(dt);
    if (Math.random() < dt * 1.2) {
      Fx.explosion(G.cam.x + rand(0, W), G.cam.y + rand(0, H), pick(['#ff4d6d', '#ff8c42', '#3cf2ff', '#6bff9e']), rand(0.4, 1));
    }
  } else if (G.state === 'workshop' || G.state === 'paused') {
    if (Input.hit('Escape') || ((Input.hit('Tab') || Input.hit('KeyI')) && G.state === 'workshop')) UI.closeOverlay();
  }
  if (Input.hit('KeyM')) UI.toggleMute();

  render();
  Input.endFrame();
  requestAnimationFrame(frame);
}

function initMenuScene() {
  G.arena = { w: 2800, h: 1900 };
  G.player = new Player(); G.player.dead = true;
  G.up = { armor: 0, overclock: 0, split: 0, thruster: 0, magnet: 0, firmware: 0, slot: 0 };
  const bg = buildBackground(LEVELS[0].theme, G.arena.w, G.arena.h);
  G.bg = bg.canvas; G.lights = bg.lights;
  Ambient.init('dust', '#3cf2ff', W, H);
}

window.addEventListener('resize', resize);
window.addEventListener('blur', () => { if (G.state === 'playing') UI.pause(); });
resize();
Input.init(canvas);
UI.init();
initMenuScene();
requestAnimationFrame(frame);
