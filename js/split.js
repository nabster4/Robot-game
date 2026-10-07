'use strict';
// Split screen: two players on one screen, in one world. Player 1 plays on the left, player 2 on the right.
// Each player uses a controller, or one of them the keyboard & mouse.
//
// The game was written for one player, so rather than rewriting every system, each player has a
// *context*: their robot, camera, hotbar, Botbucks, gear, upgrades, bots, input, HUD and screen effects.
// Before a player's turn (their movement, their half of the HUD, their view) their context is swapped
// into the usual globals (G.player, G.bar, camera, Input, …), and swapped back out afterwards. The world
// itself (robots, camps, bosses, quests, storage at home, the base) is shared and simulated once; each
// robot fights the player it's targeting, inside that player's context.
//
// Shared between the players: the world and its progress, home storage, bots waiting at home, the base.
// Each player's own: hotbar, Botbucks, gear, upgrades, squad, view setting. Player 2's character is
// saved in the same save file (as `p2`).

// player 2's paint job and colour
const SPLIT_PAINT = { shell: '#b8662a', shellE: '#4a1e08', dark: '#3a2418', darkE: '#140804', glow: '#ffb347' };
const SPLIT_COLORS = ['#3cf2ff', '#ffb347'];

// what makes up "a player" in the globals
const SPLIT_G = ['player', 'bar', 'sel', 'weapon', 'bucks', 'gear', 'up', 'companions', 'vessels', 'spritesFound',
  'vm', 'avatar', 'fpGlider', 'bubble', 'iceBlock', 'fov', 'region', 'regionT', 'where', 'level', 'safeSpot',
  'calmT', 'dying', 'recallT', 'focus'];
const SPLIT_UI = ['root', 'compass', 'radar', 'hotbarDirty', 'hotbarSig', 'squadSig', 'stShowT', 'questT', 'quest',
  'vquests', 'objT', '_bannerT', '_hintT', '_loreT'];

// an input object for a controller player (same shape as Input; the controller fills it in)
function makePadInput() {
  return {
    keys: {}, pressed: {}, mouse: { down: false, right: false, rightPressed: false, dx: 0, dy: 0 }, wheel: 0,
    pad: null, touch: null, touchMode: false, fallback: false,
    get locked() { return Split.kbm.locked; },
    key(c) { return !!this.keys[c]; },
    hit(c) { return !!this.pressed[c]; },
    endFrame() { this.pressed = {}; this.mouse.rightPressed = false; this.mouse.dx = 0; this.mouse.dy = 0; this.wheel = 0; },
    lock(cv) { Split.kbm.lock(cv); },
    unlock() { Split.kbm.unlock(); },
  };
}

const Split = {
  on: false,
  lobby: false,
  ctxs: [],
  cur: null,          // the context swapped into the globals right now
  idx: 0,             // its index (0 when split screen is off)
  menuCtx: null,      // the player who opened the menu that's showing
  depth: 0,           // >0 while running code that belongs to one player
  slots: [null, null],

  init() {
    this.kbm = Input;
    const $$ = (id) => document.getElementById(id);
    $$('btn-split').onclick = () => { Sound.init(); Sound.play('click'); this.openLobby(); };
    $$('split-kbm').onclick = () => { Sound.play('click'); if (!this.slots.includes('kbm')) this.join('kbm'); };
    $$('split-swap').onclick = () => { Sound.play('click'); this.swap(); };
    $$('split-go').onclick = () => this.begin();
    $$('split-back').onclick = () => { Sound.play('click'); this.closeLobby(); };
  },

  // ═════════════════════════ The lobby: who plays with what ═════════════════════════
  openLobby() {
    this.lobby = true;
    this.slots = [null, null];
    UI.show('split');
    this.renderLobby();
  },
  closeLobby() {
    this.lobby = false;
    UI.show('menu');
    document.getElementById('btn-continue').style.display = hasSave() ? '' : 'none';
  },
  full() { return this.slots[0] !== null && this.slots[1] !== null; },
  join(dev) {
    const i = this.slots.indexOf(null);
    if (i < 0) return;
    this.slots[i] = dev;
    Sound.play('online', null, 0.6);
    this.renderLobby();
  },
  leave(dev) { const i = this.slots.indexOf(dev); if (i >= 0) { this.slots[i] = null; Sound.play('click'); this.renderLobby(); } },
  padGone(index) { this.leave(index); },
  swap() { this.slots.reverse(); this.renderLobby(); },
  devName(dev) {
    if (dev === 'kbm') return 'Keyboard & mouse';
    const g = Pad.pads().find((q) => q.index === dev);
    return `Controller ${dev + 1}${g ? ' · ' + Pad.shortName(g.id) : ''}`;
  },
  renderLobby() {
    this.slots.forEach((d, i) => {
      const el = document.getElementById('ss-' + i);
      el.style.setProperty('--c', SPLIT_COLORS[i]);
      el.classList.toggle('ready', d !== null);
      el.innerHTML = '';
      const b = document.createElement('b'); b.textContent = `PLAYER ${i + 1}`;
      const s = document.createElement('span');
      s.textContent = d === null ? 'Press A on a controller — or join with the keyboard & mouse' : this.devName(d);
      el.append(b, s);
    });
    document.getElementById('split-kbm').disabled = this.slots.includes('kbm') || this.full();
    document.getElementById('split-go').disabled = !this.full();
  },
  // a controller in the lobby: A joins, B leaves (or goes back), X swaps, Start begins
  lobbyPad(index, hit) {
    const joined = this.slots.includes(index);
    if (hit(PB.A)) { if (!joined) this.join(index); else if (this.full()) this.begin(); }
    else if (hit(PB.START)) { if (this.full()) this.begin(); else if (!joined) this.join(index); }
    else if (hit(PB.B)) { if (joined) this.leave(index); else this.closeLobby(); }
    else if (hit(PB.X)) this.swap();
  },
  lobbyKeys() {
    if (Input.hit('Enter')) { if (!this.slots.includes('kbm') && !this.full()) this.join('kbm'); else if (this.full()) this.begin(); }
    if (Input.hit('Escape')) this.closeLobby();
  },
  begin() {
    if (!this.full()) return;
    const slots = this.slots.slice();
    this.lobby = false;
    Sound.play('click');
    if (hasSave()) continueGame(); else newRun();
    this.start(slots);
    if (!Story.tutorialDone) Story.skip();   // the tutorial is a one-player affair
    if (slots.includes('kbm')) this.kbm.lock(canvas);
  },

  // ═════════════════════════ Starting & stopping ═════════════════════════
  start(slots) {
    this.on = true;
    document.body.classList.add('split');
    // two views cost twice as much: performance mode on (switch it off in the pause menu if you like)
    const q = document.getElementById('opt-quality');
    this.prevQuality = G.settings.quality;
    if (!q.checked) { q.checked = true; q.onchange({ target: q }); }

    // player 1: what's already in the globals
    const c0 = this.newCtx(0, slots[0]);
    c0.camera = camera;
    this.cur = c0; this.idx = 0;
    Input = c0.input;
    this.save(c0);
    this.ctxs = [c0];

    // player 2's HUD: a copy of the HUD (same ids, looked up inside this root on player 2's turn)
    const h1 = document.getElementById('hud');
    const h2 = h1.cloneNode(true);
    h2.classList.add('p2'); h1.classList.add('p1');
    for (const id of ['dialog', 'keys-hint', 'pad-hint', 'lore']) { const e = h2.querySelector('#' + id); if (e) e.remove(); }
    h2.querySelector('#feed').innerHTML = ''; h2.querySelector('#dmgdir').innerHTML = '';
    h1.after(h2);
    for (const [h, i] of [[h1, 0], [h2, 1]]) {
      const tag = document.createElement('div'); tag.className = 'split-tag'; tag.textContent = `P${i + 1}`; tag.style.setProperty('--c', SPLIT_COLORS[i]);
      h.appendChild(tag);
    }
    this.hud2 = h2;
    // one dialogue box for both, in the middle of the screen
    document.body.appendChild(document.getElementById('dialog'));

    // player 2: camera, first-person weapon & glider, robot, bubble and ice block
    const cam = new THREE.PerspectiveCamera(75, 1, 0.05, camera.far);
    cam.rotation.order = 'YXZ'; scene.add(cam);
    const vm = buildViewModel(); cam.add(vm); vm.position.set(0.2, -0.19, -0.46); vm.scale.setScalar(0.7);
    const gl = buildGliderModel(0.75); gl.rotation.set(0.12, Math.PI, 0); gl.position.set(0, 0.95, -0.35); gl.visible = false; cam.add(gl);
    const av = buildAvatarModel(SPLIT_PAINT); av.visible = false; scene.add(av);
    const bub = G.bubble.clone(); bub.visible = false; scene.add(bub);
    const ice = G.iceBlock.clone(); ice.visible = false; scene.add(ice);
    const ch = this.loadChar(G.p2Data);
    const c1 = this.newCtx(1, slots[1]);
    c1.camera = cam;
    Object.assign(c1.g, {
      player: new Player(), bar: ch.bar, sel: ch.sel, weapon: ch.weapon, bucks: ch.bucks, gear: ch.gear, up: ch.up, companions: [],
      vessels: ch.vessels, spritesFound: ch.spritesFound, vm, avatar: av, fpGlider: gl, bubble: bub, iceBlock: ice,
      fov: { base: 75, cur: 75, kick: 0 }, region: null, regionT: 0, where: 'hub', level: 0, safeSpot: null, calmT: 0, dying: 0, recallT: 0, focus: false,
    });
    c1.view = ch.view;
    c1.u = { root: h2, compass: h2.querySelector('#compass').getContext('2d'), radar: h2.querySelector('#radar').getContext('2d'), hotbarDirty: true };
    this.ctxs.push(c1);
    // name tags over each robot (seen by the other player)
    this.tags = this.ctxs.map((c, i) => { const t = World.makeLabel(`PLAYER ${i + 1}`, SPLIT_COLORS[i], 384, 80); t.scale.set(1.6, 0.34, 1); scene.add(t); return t; });

    // player 2 steps out next to player 1
    const p1 = G.player;
    this.as(c1, () => {
      const p = G.player;
      const rx = Math.cos(p1.yaw), rz = -Math.sin(p1.yaw);
      p.pos.set(p1.pos.x + rx * 2.2, 0, p1.pos.z + rz * 2.2);
      p.pos.y = Math.max(World.groundAt(p.pos.x, p.pos.z, p1.pos.y + 1), p1.pos.y);
      p.yaw = p1.yaw; p.pitch = -0.05; p.fallTop = p.pos.y; p.invuln = 2;
      p.hp = ch.hp ? Math.min(ch.hp, p.maxHp) : p.maxHp;
      p.stamina = p.maxStamina;
      G.region = World.regionAt(p.pos.x, p.pos.z, p.pos.y);
      G.where = G.region === REGIONS.hub ? 'hub' : 'biome'; G.level = G.region.tier;
      setViewModelWeapon(G.vm, G.weapon, 1 + G.up.split);
      G.avatar.userData.flash.material.color.set(WEAPONS[G.weapon].color).multiplyScalar(4);
      for (const d of ch.comps) {
        const c = new Companion(d.kind, d.battery);
        c.hp = Math.min(c.maxHp, d.hp ?? c.maxHp);
        if (d.away) c.state = 'charging';
        G.companions.push(c);
      }
      G.companions.forEach((c) => c.onTravel());
    });

    this.post2 = this.post2 || new PostFX(renderer);
    World.viewCams = this.ctxs.map((c) => c.camera);
    resize();
    UI.hotbarDirty = true;
    UI.banner('SPLIT SCREEN', 'Player 1 on the left · Player 2 on the right — free the Wardens together', '#3cf2ff', 4);
  },

  stop() {
    if (!this.on) return;
    G.p2Data = this.charJSON(1);
    this.switchTo(this.ctxs[0]);
    const c1 = this.ctxs[1];
    for (const c of c1.g.companions) c.destroy();
    scene.remove(c1.camera, c1.g.avatar, c1.g.bubble, c1.g.iceBlock);
    for (const t of this.tags || []) scene.remove(t);
    this.tags = null;
    const h1 = document.getElementById('hud');
    h1.classList.remove('p1');
    h1.querySelectorAll('.split-tag').forEach((e) => e.remove());
    h1.appendChild(document.getElementById('dialog'));
    this.hud2.remove(); this.hud2 = null;
    Input = this.kbm;
    this.on = false; this.ctxs = []; this.cur = null; this.idx = 0; this.menuCtx = null; this.depth = 0;
    World.viewCams = null;
    document.body.classList.remove('split');
    const q = document.getElementById('opt-quality');
    if (this.prevQuality !== 'low' && q.checked) { q.checked = false; q.onchange({ target: q }); }
    resize();
  },

  newCtx(i, dev) {
    return { i, dev, input: dev === 'kbm' ? this.kbm : makePadInput(), g: {}, u: {}, fx: [0, 0, 0], tint: new THREE.Color(), lamp: [0, 26, 0, 0, 0], caveDim: 0, view: 'first', here: null, sway: [0, 0, 4.2] };
  },

  // ═════════════════════════ Player 2's character in the save ═════════════════════════
  loadChar(d) {
    const fresh = { bar: [{ t: 'weapon', id: 'blaster', n: 1 }, { t: 'supply', id: 'repair', n: 1 }], sel: 0, weapon: 'blaster', bucks: 40,
      gear: { jetpack: false, fireboots: false, backpack: 0, hull: 0, prop: 0, lamp: 0 }, up: NEW_UP(), vessels: 0, spritesFound: 0, hp: null, comps: [], view: 'first' };
    if (!d) return fresh;
    return {
      bar: (d.bar || fresh.bar).map((it) => (it ? Object.assign({ n: 1 }, it) : null)), sel: d.sel || 0, weapon: d.weapon || 'blaster', bucks: d.bucks || 0,
      gear: Object.assign(fresh.gear, d.gear), up: Object.assign(NEW_UP(), d.up), vessels: d.vessels || 0, spritesFound: d.spritesFound || 0,
      hp: d.hp || null, comps: d.comps || [], view: d.view === 'third' ? 'third' : 'first',
    };
  },
  charJSON(i) {
    const c = this.ctxs[i];
    if (!c) return G.p2Data || undefined;
    const g = c === this.cur ? G : c.g;
    return { bar: g.bar, sel: g.sel, weapon: g.weapon, bucks: g.bucks, gear: g.gear, up: g.up, vessels: g.vessels, spritesFound: g.spritesFound,
      hp: g.player.hp, comps: g.companions.map((b) => ({ kind: b.kind, battery: b.battery, hp: b.hp, away: !b.active })),
      view: c === this.cur ? G.settings.view : c.view };
  },

  // ═════════════════════════ Swapping players in and out ═════════════════════════
  save(c) {
    for (const f of SPLIT_G) c.g[f] = G[f];
    c.camera = camera; c.input = Input; c.view = G.settings.view;
    c.sway[0] = swayX; c.sway[1] = swayY; c.sway[2] = camDist;
    c.caveDim = World.caveDim;
    const hl = World.headlamp;
    if (hl) { c.lamp[0] = hl.intensity; c.lamp[1] = hl.distance; c.lamp[2] = hl.position.x; c.lamp[3] = hl.position.y; c.lamp[4] = hl.position.z; }
    c.fx[0] = Fx.shake; c.fx[1] = Fx.damage; c.fx[2] = Fx.tintAmt; c.tint.copy(Fx.tint);
    for (const f of SPLIT_UI) c.u[f] = UI[f];
    c.here = Villages.here;
  },
  load(c) {
    for (const f of SPLIT_G) G[f] = c.g[f];
    camera = c.camera; Input = c.input; G.settings.view = c.view;
    swayX = c.sway[0]; swayY = c.sway[1]; camDist = c.sway[2];
    World.caveDim = c.caveDim;
    const hl = World.headlamp;
    if (hl) { hl.intensity = c.lamp[0]; hl.distance = c.lamp[1]; hl.position.set(c.lamp[2], c.lamp[3], c.lamp[4]); }
    Fx.shake = c.fx[0]; Fx.damage = c.fx[1]; Fx.tintAmt = c.fx[2]; Fx.tint.copy(c.tint);
    for (const f of SPLIT_UI) UI[f] = c.u[f];
    Villages.here = c.here;
  },
  switchTo(c) {
    if (!c || c === this.cur) return;
    this.save(this.cur);
    this.load(c);
    this.cur = c; this.idx = c.i;
  },
  // run fn as player c (personal: UI messages go to that player's half only)
  as(c, fn, personal = true) {
    if (!this.on || !c) return fn();
    const prev = this.cur;
    if (personal) this.depth++;
    if (c !== prev) this.switchTo(c);
    try { return fn(); } finally { if (c !== prev) this.switchTo(prev); if (personal) this.depth--; }
  },
  asIdx(i, fn) { return !this.on || i === undefined || !this.ctxs[i] ? fn() : this.as(this.ctxs[i], fn); },
  each(fn) { if (!this.on) return fn(); for (const c of this.ctxs) this.as(c, fn); },
  // the context that should be active between turns: player 1, or whoever has a menu open
  rest() {
    if (G.state === 'playing') this.menuCtx = null;
    this.switchTo(G.state === 'playing' ? this.ctxs[0] : this.menuCtx || this.ctxs[0]);
    if (!World.domeTrap) for (const c of this.ctxs) this.pl(c).inFight = false;
  },
  // news that concerns both players goes to both halves of the screen
  broadcast(fn) {
    if (!this.on || this.depth > 0 || this._bc || G.state !== 'playing') return false;
    this._bc = true;
    try { this.each(fn); } finally { this._bc = false; }
    return true;
  },

  // ═════════════════════════ Questions the shared world asks ═════════════════════════
  pl(c) { return c === this.cur ? G.player : c.g.player; },
  players() { return this.on ? this.ctxs.map((c) => this.pl(c)) : [G.player]; },
  targets() { return this.on ? this.ctxs.map((c) => ({ ctx: c, p: this.pl(c) })) : [{ ctx: null, p: G.player }]; },
  allCompanions() { return this.on ? this.ctxs.flatMap((c) => (c === this.cur ? G.companions : c.g.companions)) : G.companions; },
  nearestDist(x, z) { let d = 1e9; for (const p of this.players()) d = Math.min(d, Math.hypot(p.pos.x - x, p.pos.z - z)); return d; },
  nearestIdx(pos) {
    let best = 0, bd = 1e9;
    this.ctxs.forEach((c, i) => { const p = this.pl(c); const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) + (p.dead ? 1e6 : 0); if (d < bd) { bd = d; best = i; } });
    return best;
  },
  // which player a robot goes after: the nearest one still standing (bosses: only players in the fight)
  targetOf(e) {
    const ok = this.ctxs.filter((c) => { const p = this.pl(c); return !p.dead && (!e.isBoss || !World.domeTrap || p.inFight); });
    if (!ok.length) return e._tc || this.ctxs[0];
    const d = (c) => { const p = this.pl(c); return Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z); };
    let best = ok.reduce((a, b) => (d(b) < d(a) ? b : a));
    if (e._tc && ok.includes(e._tc) && d(e._tc) < d(best) * 1.25 + 4) best = e._tc;   // don't flip-flop
    e._tc = best;
    return best;
  },
  usesPad() { return !!this.cur && this.cur.dev !== 'kbm'; },
  padOf(i) {
    const c = this.ctxs[i];
    if (!c || c.dev === 'kbm') return null;
    return Pad.pads().find((g) => g.index === c.dev) || null;
  },
  ctxForPad(index) { return this.ctxs.find((c) => c.dev === index) || null; },
  anyHit(code) { return this.ctxs.some((c) => c.input.hit(code)); },
  endFrame() { for (const c of this.ctxs) if (c.input !== Input) c.input.endFrame(); },

  // ═════════════════════════ Boss domes, death & respawn ═════════════════════════
  fighters() { return this.ctxs.filter((c) => this.pl(c).inFight).length || 1; },
  bossHpScale() { return 1 + 0.65 * (this.fighters() - 1); },
  // the dome seals: a partner who is close enough (and can survive down there) is pulled in too
  joinFight(A) {
    const me = G.player;
    me.inFight = true;
    for (const c of this.ctxs) {
      if (c === this.cur) continue;
      const q = this.pl(c);
      const hullOk = A.i !== 5 || ((c.g.gear && c.g.gear.hull) || 0) >= 3;
      if (q.dead || !hullOk || Math.hypot(q.pos.x - A.x, q.pos.z - A.z) > 160) {
        this.as(c, () => UI.banner('A WARDEN FIGHT BEGAN', `${ZONES[A.i].boss.name}'s dome sealed with your partner inside`, '#ff9f43', 3.5));
        continue;
      }
      const a = Math.atan2(me.pos.x - A.x, me.pos.z - A.z) + 0.35, r = A.r - 9;
      q.pos.set(A.x + Math.sin(a) * r, 0, A.z + Math.cos(a) * r);
      q.pos.y = World.arenaFloor(q.pos.x, q.pos.z) + 0.1;
      q.vel.set(0, 0, 0); q.gliding = false; q.climbing = null; q.jetting = false; q.fallTop = q.pos.y; q.invuln = 1.5;
      q.inFight = true;
      this.as(c, () => {
        for (const b of G.companions) if (b.active) b.pos.set(q.pos.x, q.pos.y + 2, q.pos.z);
        Fx.tintFlash('#ffffff', 0.8); Sound.play('portal');
        UI.banner('PULLED INTO THE DOME', `Your partner woke ${ZONES[A.i].boss.name} — fight together!`, ZONES[A.i].boss.color, 3);
      });
    }
  },
  // players outside a sealed dome can't walk in
  keepOut(pos, r) {
    const A = World.arena;
    const ax = pos.x - A.x, az = pos.z - A.z, ad = Math.hypot(ax, az) || 1, R = A.r + 2 + r;
    if (ad < R && pos.y < A.y + A.r + 4) { pos.x = A.x + (ax / ad) * R; pos.z = A.z + (az / ad) * R; }
  },
  // rebuilt at home after a defeat, with everything you carry (the other player plays on)
  respawn() {
    const p = G.player;
    G.dying = 0;
    p.dead = false; p.inFight = false;
    p.pos.set(World.spawn.x + (this.idx ? 2.5 : -2.5), 0, World.spawn.z);
    p.pos.y = World.heightAt(p.pos.x, p.pos.z);
    p.vel.set(0, 0, 0); p.yaw = 0; p.pitch = -0.05;
    p.hp = p.maxHp; p.invuln = 2; p.energy = 100; p.dashCd = 0; p.shield = 0;
    p.stamina = p.maxStamina; p.exhausted = false; p.gliding = false; p.climbing = null; p.jetting = false; p.fuel = 100;
    p.fallTop = p.pos.y; p.safe = null; p.frozenT = 0; p.burnT = 0; p.slowT = 0;
    for (const c of G.companions) if (c.active) c.pos.set(p.pos.x, p.pos.y + 2, p.pos.z);
    UI.banner('REBUILT AT HOME', 'Wren patched you up — you kept everything you carry', '#3cf2ff', 3);
    if (World.domeTrap && !this.ctxs.some((c) => { const q = this.pl(c); return q.inFight && !q.dead; })) this.failFight();
  },
  // everyone in the dome went down: the Warden waits, and the dome opens again
  failFight() {
    const A = G.fight;
    if (G.boss) { G.boss.dead = true; G.boss.destroy(); G.boss = null; }
    for (const b of G.ebullets) b.dead = true;
    for (const s of G.spawns) scene.remove(s.beam);
    G.spawns.length = 0;
    if (A) World.openDome(A);
    World.domeTrap = false;
    G.fight = null; G.objective = 'explore';
    for (const c of this.ctxs) this.pl(c).inFight = false;
    Sound.setIntensity(0);
    const name = A ? ZONES[A.i].boss.name : 'The Warden';
    this.each(() => UI.banner('THE DOME REOPENS', `${name} waits — regroup and try again`, '#ff9f43', 4));
  },

  // ═════════════════════════ Drawing two views ═════════════════════════
  resize() {
    if (!this.post2 || this.ctxs.length < 2) return;
    const w = W / 2;
    for (const c of this.ctxs) { c.camera.aspect = w / H; c.camera.far = this.ctxs[0].camera.far; c.camera.updateProjectionMatrix(); }
    const low = G.settings.quality === 'low';
    post.setSize(w, H, DPR);
    this.post2.setSamples(low ? 0 : 4);
    this.post2.setSize(w, H, DPR);
  },
  // screen shake, damage flash and tint fade for the player who isn't swapped in (Fx.update does the other)
  decayScreens(dt) {
    for (const c of this.ctxs) {
      if (c === this.cur) continue;
      c.fx[0] = Math.max(0, c.fx[0] - dt * 2.2); c.fx[1] = Math.max(0, c.fx[1] - dt * 1.5); c.fx[2] = Math.max(0, c.fx[2] - dt * 2);
    }
  },
  render(dt) {
    this.dt = dt;
    World.update(dt, G.time, this.ctxs[0].camera);
    Weather.update(dt, this.ctxs[0].camera.position, G.time);
    const w = Math.floor(W / 2);
    this.ctxs.forEach((c, i) => this.as(c, () => this.drawView(c, i, w), false));
  },
  drawView(me, i, w) {
    // what each player's robot shows in this view: your own robot only in third person, the other always
    const inGame = G.state !== 'menu';
    this.ctxs.forEach((c, j) => {
      const g = c === me ? G : c.g, p = g.player, alive = !p.dead && inGame;
      const third = (c === me ? G.settings.view : c.view) === 'third';
      g.avatar.visible = alive && (c !== me || third);
      g.vm.visible = c === me && alive && !third;
      g.fpGlider.visible = c === me && alive && !third && p.gliding;
      const t = this.tags[j];
      t.visible = c !== me && alive;
      if (t.visible) t.position.set(p.pos.x, p.pos.y + 2.6, p.pos.z);
    });
    // the sky, fog and light around this player
    const cam = camera;
    World.skyMesh.position.copy(cam.position);
    const ud = camUnderwater(cam);
    World.underK = ud > 0 ? 1 : 0; World.underDepth = ud;
    World.skyMesh.visible = ud <= 0;
    if (World.waterMat) World.waterMat.opacity = cam.position.y < WORLD.water ? 0.7 : 0.86;
    if (me.env) this.envLoad(me.env);
    World.envBlend(cam.position.x, cam.position.z, cam.position.y, me.env ? 1 - Math.exp(-1.6 * this.dt) : 1);
    me.env = this.envSave(me.env);
    World.followSun(G.player.pos.x, G.player.pos.y, G.player.pos.z);
    const pf = i ? this.post2 : post;
    const u = pf.compMat.uniforms;
    u.damage.value = Fx.damage; u.tint.value.copy(Fx.tint); u.tintAmt.value = Fx.tintAmt;
    pf.render(scene, cam, G.time, [i * w, 0, w, H]);
  },
  // each view keeps its own sky / fog / light blend
  envSave(o) {
    const u = World.skyMesh.material.uniforms, f = World.scene.fog, h = World.hemi, s = World.sun;
    if (!o) { const C = () => new THREE.Color(); o = { top: C(), hor: C(), bot: C(), sunC: C(), sd: new THREE.Vector3(), wsd: new THREE.Vector3(), fog: C(), h0: C(), h1: C(), sun: C() }; }
    o.top.copy(u.top.value); o.hor.copy(u.horizon.value); o.bot.copy(u.bottom.value); o.sunC.copy(u.sunColor.value); o.sd.copy(u.sunDir.value); o.stars = u.stars.value;
    o.wsd.copy(World.sunDir); o.fog.copy(f.color); o.fd = f.density;
    o.h0.copy(h.color); o.h1.copy(h.groundColor); o.hi = h.intensity; o.sun.copy(s.color); o.si = s.intensity;
    return o;
  },
  envLoad(o) {
    const u = World.skyMesh.material.uniforms, f = World.scene.fog, h = World.hemi, s = World.sun;
    u.top.value.copy(o.top); u.horizon.value.copy(o.hor); u.bottom.value.copy(o.bot); u.sunColor.value.copy(o.sunC); u.sunDir.value.copy(o.sd); u.stars.value = o.stars;
    World.sunDir.copy(o.wsd); f.color.copy(o.fog); f.density = o.fd;
    h.color.copy(o.h0); h.groundColor.copy(o.h1); h.intensity = o.hi; s.color.copy(o.sun); s.intensity = o.si;
  },
};
