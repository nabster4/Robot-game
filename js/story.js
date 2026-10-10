'use strict';
// The story (4,212 A.T., thousands of years after the Makers): Rivet wakes on the assembly table of Wren
// Halloway, a caretaker robot, learns the basics, and sets out to free the
// five Wardens from the Static. Quests are worked out from the game state (so saves can't get out of
// sync), dialogue plays in a box above the hotbar, and the opening is a short in-engine scene.

const WREN = { name: 'WREN', color: '#ffb347' };
const L = (text, who = WREN) => ({ who: who.name, color: who.color, text });

const STORY = {
  opening: [
    L('…and power. Easy. Easy. There — your optics are coming up.'),
    L("Can you hear me? Flash your optics once if you— oh. I haven't fitted your shutters yet. Never mind."),
    L("You've been in pieces on this table for three weeks. Don't sit up too fast."),
    L("Welcome to the world, Rivet. I'm Wren Halloway, caretaker unit of Halloway Works. I built you. Well… most of you."),
    L("Today is the 212th day of 4,212 A.T. — Anno Technologiae. Your very first date. Keep it somewhere safe."),
  ],
  talk: [
    L('Look at you, standing on your own two servos.'),
    L("Out there every machine has gone wild. There's a signal in the air. We call it the Static, and it turns anything with a circuit against us."),
    L("Anything except you, it seems. Grab the Pulse Blaster from the rack by the door — I'll rest my circuits easier if you're armed."),
  ],
  armed: [L("Now let's see if you can hit something. I've hung three practice drones out in the yard. Out the front door.")],
  targets: [L("Not bad at all! You shouldn't go out alone, though. Build a Gunner Drone at the workbench in here — I left scrap in storage.")],
  bot: [
    L("Your first squadmate! When its battery runs low it flies home to charge on the pads, then comes back to you."),
    L('Last thing: open your world map and have a look at the valley.'),
  ],
  map: [
    L("See those five domes? Each one holds a Warden — great machines that used to guard this valley. The Static has them now."),
    L("The nearest is Brambleback, in the Green Plains to the south. Its signal beacons keep its dome sealed. Power them up and… well. Be careful, Rivet."),
    L("There are robot villages out there too — friendly ones, the Static hasn't reached them. Trade with them, help them, and their charging posts will look after your bots."),
  ],
  // Wren's reaction each time you come home after freeing a Warden
  report: [
    [L("You freed Brambleback? Then the Wardens can be saved — not just scrapped!"), L("When its Static broke I heard a voice in the radio noise. Something about a leader who went up to the citadel and never came down.")],
    [L('Glacieros locked parts of itself inside the ice caves to keep its mind clear. Clever old machine.'), L('Rivet… your core flared when its signal cleared. Like the two of you recognised each other.')],
    [L("The Colossus kept saying 'the little light that fell'. I found your core in a crater up north, you know. Still warm."), L("I never told anyone that.")],
    [L("Infernus thanked you. By name. I never told it your name, Rivet."), L('Whatever that core is, the Wardens know it. We need to find out why.')],
    [L("The skies are clear. Whatever the Conductor is, it's lost its Wardens."), L("Come home safe, Rivet. We have a lot to talk about.")],
    [L("You went all the way down? Into the trench? Rivet, nothing I built was meant for that."), L("Brine says the sea went calm the moment you surfaced. Like someone finally started singing again.")],
  ],
  // what each Warden says as the Static leaves it
  freed: [
    "…the noise… is gone. Little one. You carry a light I know.",
    'Cold… clear… I remember now. We were five. No — we were six.',
    'The peaks are quiet again. Climb, little light. Climb higher than the Static can reach.',
    'The fire answers to me again. Find the citadel. Bring our leader home.',
    'You flew where the Static lives. The Conductor will not forgive this.',
    'My song… returns. Five of us free. Go up, little light — the citadel will know your heart.',
  ],
  chatter: [
    L("Bring me Logic Boards and Power Cores and I can open up more of this place. The Lab's been sealed since the Static came."),
    L("If you're hurt, come home. Walking through that door patches you right up."),
    L("Caves are the best place for old salvage. And old secrets."),
    L("Don't forget the map — markers are free, getting lost isn't."),
    L("Met Mayor Tinsel in Brassbrook yet? Tell Tinsel that Wren says hello."),
    L("A wandering archivist called Quill has been asking about you. Odd sort. Knows a lot about the Wardens."),
  ],
};

// ═════════════════════════ Dialogue box ═════════════════════════
const Dialog = {
  queue: [], cur: null, t: 0, shown: 0,
  say(lines, onDone) {
    this.queue.push(...lines.map((l) => Object.assign({}, l)));
    if (onDone) this.queue[this.queue.length - 1].onDone = onDone;
    if (!this.cur) this.next();
  },
  busy() { return !!this.cur; },
  clear() { this.queue = []; this.cur = null; this.el().classList.remove('show'); document.body.classList.remove('talking'); },
  el() { return document.getElementById('dialog'); },
  next() {
    const prev = this.cur;
    this.cur = this.queue.shift() || null;
    if (prev && prev.onDone) prev.onDone();
    const el = this.el();
    document.body.classList.toggle('talking', !!this.cur);
    if (!this.cur) { el.classList.remove('show'); return; }
    this.t = 0; this.shown = 0;
    el.querySelector('.d-who').textContent = this.cur.who;
    el.querySelector('.d-who').style.color = this.cur.color;
    el.style.setProperty('--c', this.cur.color);
    el.querySelector('.d-text').textContent = '';
    el.classList.add('show');
    Sound.play('chirp', null, 0.6);
  },
  // advance: finish the typing first, then move on
  skip() {
    if (!this.cur) return;
    if (this.shown < this.cur.text.length) this.shown = this.cur.text.length;
    else this.next();
  },
  update(dt) {
    if (!this.cur) return;
    this.t += dt;
    const n = Math.min(this.cur.text.length, Math.floor(this.t * 55));
    if (n > this.shown) this.shown = n;
    this.el().querySelector('.d-text').textContent = this.cur.text.slice(0, this.shown);
    // lines move on by themselves after a reading pause
    if (this.shown >= this.cur.text.length && this.t > 2.2 + this.cur.text.length * 0.045) this.next();
  },
};

// ═════════════════════════ Story & quests ═════════════════════════
const TUTORIAL = ['look', 'talk', 'rack', 'targets', 'bot', 'map'];
const TUT_TEXT = {
  look: 'Get your bearings — look around',
  talk: 'Talk to Wren',
  rack: 'Take the Pulse Blaster from the rack by the workshop door',
  targets: 'Shoot the practice drones in the yard',
  bot: 'Build a Gunner Drone at the workbench',
  get map() { return ctl('Open the world map (M)', 'Open the world map (MAP)', 'Open the world map (VIEW button)'); },
};

const Story = {
  get S() { return G.progress.story; },
  get F() { return G.progress.story.flags; },

  // flags for a brand-new game
  fresh() { return { intro: false, tutorial: 0, armed: false, targets: 0, order: [], reported: 0, look: 0 }; },
  // saves made before the story existed: everything up to now counts as done
  migrate(story, beaten) {
    if (story.flags) return;
    const order = beaten.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
    story.flags = { intro: true, tutorial: TUTORIAL.length, armed: true, targets: 3, order, reported: order.length, look: 0 };
  },
  get tutorialDone() { return this.F.tutorial >= TUTORIAL.length; },
  get step() { return TUTORIAL[this.F.tutorial]; },

  // ── the opening scene ──
  startOpening() {
    const W = World.wakeSpot, p = G.player;
    p.pos.set(W.x, W.y, W.z);
    G.cine = { t: 0, phase: 'lying', k: 0 };
    document.body.classList.add('cine');
    const fade = document.getElementById('fade');
    fade.style.transition = 'none'; fade.style.opacity = 1;
    setTimeout(() => { fade.style.transition = 'opacity 2.5s'; fade.style.opacity = 0; }, 400);
    Dialog.clear();
    // (only if the opening is still playing: skipping it straight away shouldn't leave its lines behind)
    setTimeout(() => { if (G.cine) Dialog.say(STORY.opening, () => { if (G.cine) G.cine.phase = 'sit'; }); }, 1200);
  },
  endOpening() {
    const p = G.player, W = World.wakeSpot;
    G.cine = null;
    document.body.classList.remove('cine');
    document.getElementById('fade').style.opacity = 0;
    p.pos.set(W.x + 1.5, World.home.y, W.z + 0.6);
    p.vel.set(0, 0, 0); p.fallTop = p.pos.y; p.grounded = true;
    const w = World.wren;
    p.yaw = Math.atan2(-(w.x - p.pos.x), -(w.z - p.pos.z)); p.pitch = 0;
    this.F.intro = true;
    this.F.look = 0;
  },
  // the camera during the opening: lying on the table looking up, then sitting up
  cineCamera(dt) {
    const c = G.cine, W = World.wakeSpot, w = World.wren;
    c.t += dt;
    const yaw = Math.atan2(-(w.x - W.x), -(w.z - W.z));
    if (c.phase === 'lying') {
      const sway = Math.sin(c.t * 0.7) * 0.05;
      camera.position.set(W.x, W.y + 0.35, W.z - 0.4);
      camera.rotation.set(1.25 + sway, yaw + 0.5 + Math.sin(c.t * 0.4) * 0.12, 0.25);
      if (c.t > 30) c.phase = 'sit';
    } else {
      c.k = Math.min(1, c.k + dt / 2.6);
      const e = c.k * c.k * (3 - 2 * c.k);
      camera.position.set(lerp(W.x, W.x + 1.5, Math.max(0, e - 0.5) * 2), lerp(W.y + 0.35, World.home.y + 1.65, e), lerp(W.z - 0.4, W.z + 0.6, e));
      camera.rotation.set(lerp(1.25, 0, e), lerp(yaw + 0.5, yaw, e), lerp(0.25, 0, e));
      if (c.k >= 1) this.endOpening();
    }
    G.vm.visible = false;
  },
  skip() {
    // skip the opening and the tutorial in one go
    if (G.cine) this.endOpening();
    Dialog.clear();
    this.F.armed = true; this.F.targets = 3; this.F.tutorial = TUTORIAL.length;
    this.giveBlaster();
    for (const e of G.enemies) if (e.dummy) { e.dead = true; e.destroy(); }
    document.getElementById('skip-intro').classList.remove('show');
    UI.banner('READY TO GO', 'Free the Wardens — check your map', '#3cf2ff', 3);
    saveGame();
  },
  giveBlaster() {
    if (!G.bar.some((it) => it && it.t === 'weapon')) {
      G.bar.unshift({ t: 'weapon', id: 'blaster', n: 1 });
      G.bar.length = Math.max(G.barSize, G.bar.length);
      if (G.bar.length > G.barSize) { const extra = G.bar.splice(G.barSize); for (const it of extra) if (it) G.store(it, it.n || 1); }
    }
    G.sel = 0; G.equip('blaster');
    World.rack.gun.visible = false;
    UI.hotbarDirty = true;
  },

  // ── tutorial progress ──
  advance() {
    this.F.tutorial++;
    Sound.play('online');
    if (this.step === 'targets') this.spawnTargets();
    if (this.tutorialDone) {
      document.getElementById('skip-intro').classList.remove('show');
      UI.banner('QUEST: THE FIRST WARDEN', 'Power Brambleback\'s beacons in the Green Plains', '#ffd23f', 4);
      saveGame();
    }
  },
  spawnTargets() {
    if (G.enemies.some((e) => e.dummy)) return;
    for (const [x, z] of [[-6, 28], [0, 32], [6, 28]]) {
      const e = new Enemy('drone', x, z, false, false, null, null, 0);
      e.dummy = true; e.baseY = World.heightAt(x, z); e.pos.y = e.baseY + 2.4;
      G.enemies.push(e);
    }
  },
  event(name, data) {
    if (!G.progress.story || !this.F) return;
    const step = this.step;
    if (name === 'target') {
      this.F.targets++;
      if (step === 'targets' && this.F.targets >= 3) { this.advance(); Dialog.say(STORY.targets); }
      else if (step === 'targets') UI.feed(`Practice drone down (${this.F.targets}/3)`, '#ffd23f');
    } else if (name === 'bot' && step === 'bot') { this.advance(); Dialog.say(STORY.bot); }
    else if (name === 'map' && step === 'map') { this.advance(); setTimeout(() => Dialog.say(STORY.map), 300); }
    else if (name === 'boss') {
      if (!this.F.order.includes(data)) this.F.order.push(data);
      const Z = ZONES[data];
      if (data !== 4) setTimeout(() => Dialog.say([{ who: Z.boss.name, color: Z.boss.color, text: STORY.freed[data] }]), 2600);
    } else if (name === 'room') UI.banner(`${ROOMS[data].name.toUpperCase()} ONLINE`, 'The force field drops — the room is ready', ROOMS[data].color, 3);
  },
  update(dt) {
    Dialog.update(dt);
    if (!this.F || this.tutorialDone || G.cine) return;
    if (this.step === 'look') {
      this.F.look += (Math.abs(Input.mouse.dx) + Math.abs(Input.mouse.dy)) * 0.002 + dt * 0.15;
      if (this.F.look > 1.6) { this.advance(); Dialog.say([L(ctl("Good. Come over here — WASD to walk, then press E to talk.", "Good. Come over here — walk with the left stick, then tap USE.", "Good. Come over here — walk with the left stick, then press X to talk."))]); }
    }
    if (this.step === 'bot' && (G.companions.length || G.reserve.length)) this.event('bot');
  },

  // ── talking to Wren ──
  talk() {
    const F = this.F;
    Dialog.clear();
    if (!this.tutorialDone) {
      if (this.step === 'look' || this.step === 'talk') { if (this.step === 'look') this.F.tutorial++; this.advance(); Dialog.say(STORY.talk); return; }
      const hint = { rack: STORY.talk[2], targets: STORY.armed[0], bot: STORY.targets[0], map: STORY.bot[1] }[this.step];
      Dialog.say([hint]);
      return;
    }
    if (F.reported < F.order.length) {
      const i = F.order[F.reported];
      F.reported++;
      Dialog.say(STORY.report[i]);
      saveGame();
      return;
    }
    const q = this.main();
    Dialog.say([L(q.done ? pick(STORY.chatter).text : `${q.title}: ${q.step}.`), pick(STORY.chatter)].map((l) => (typeof l === 'string' ? L(l) : l)));
  },
  takeBlaster() {
    if (this.F.armed) return;
    this.F.armed = true;
    this.giveBlaster();
    Sound.play('pickup');
    UI.banner('PULSE BLASTER', ctl('Left-click to shoot', 'Hold FIRE to shoot', 'Pull RT to shoot'), '#3cf2ff', 2.5);
    if (this.step === 'rack') { this.advance(); Dialog.say(STORY.armed); }
  },

  // ── the ending: Stormwing falls, the Conductor speaks, and Aurel's heart answers ──
  ending() {
    if (G.state !== 'playing') return;
    const C = { name: 'THE CONDUCTOR', color: '#ff3b5c' }, A = { name: 'AUREL', color: '#ffe14d' };
    const say = (who, text) => ({ who: who.name, color: who.color, text });
    Dialog.clear();
    Dialog.say([
      say(C, 'A heart that would not stop beating. Aurel. You came back to me.'),
      say(C, 'Every machine in this valley sings my song. Why does yours refuse?'),
      say(A, 'Because it was never yours to sing. I threw my heart down so you could not keep it — and a mechanic gave it legs.'),
      say({ name: 'THE WARDENS', color: '#6bff9e' }, 'Five voices, one answer: WE REMEMBER. WE ARE FREE.'),
      say(C, 'No— the Static— it is coming apart—'),
      L("Rivet? Rivet! The signal's gone. Every machine in the valley just… stopped fighting."),
      L('Come home. I left the workshop lights on.'),
    ], () => {
      if (G.state !== 'playing') return;
      Object.keys(G.stats).forEach((k) => (G.total[k] = (G.total[k] || 0) + G.stats[k]));
      G.stats = { kills: 0, parts: 0, time: 0, damageTaken: 0, caches: 0 };
      G.state = 'victory'; Input.unlock(); UI.showVictory();
    });
    Fx.tintFlash('#ffe14d', 1);
    Sound.play('win');
  },

  // ── quests ──
  arenaStep(A) {
    const Z = ZONES[A.i], p = G.player;
    // the ocean Warden: no beacons, just the long way down
    if (A.i === 5) {
      const v = World.villages && World.villages.find((x) => x.i === 4);
      if ((G.gear.hull || 0) < 3) return { step: `Upgrade your Pressure Hull to Mk III at Tidewright Diving (yours: ${HULL_NAMES[G.gear.hull || 0]}), then dive into the trench`, target: v ? { x: v.x, z: v.z, label: 'SALTPIN' } : null };
      return { step: `Dive into the Drowned Trench and find ${Z.boss.name}`, target: { x: A.x, z: A.z, label: Z.boss.name } };
    }
    if (!A.sealed) return { step: `Enter ${Z.boss.name}'s dome in the ${Z.name}`, target: { x: A.x, z: A.z, label: Z.boss.name } };
    if (A.mode === 'key') {
      const g = World.grotto;
      return { step: 'Find the Frost Key: turn the mirrors in the ice grotto until the light reaches the crystal', target: g ? { x: g.x, z: g.z, label: 'GROTTO' } : null };
    }
    if (A.mode === 'climb') {
      const r = World.summit;
      return { step: 'The Colossus waits on a cliff-ringed summit — climb the marked route, resting on its ledges', target: r ? { x: r.x, z: r.z, label: 'ROUTE' } : null };
    }
    if (A.mode === 'bridge') {
      const v = World.villages && World.villages.find((x) => x.i === 3);
      const st = Villages.questState('cinder');
      if (st !== 'done') return { step: st === 'new' ? 'Infernus sits beyond a burning moat — ask Forgemistress Ashby in Cinderwell about a cooling bridge' : `Bring Ashby the parts for the cooling bridge (${Villages.needText(VQUESTS.cinder.need)})`, target: v ? { x: v.x, z: v.z, label: 'CINDERWELL' } : null };
    }
    if (A.mode === 'lift') {
      const L = World.lift;
      return { step: 'Ride the Sky Lift at home base up to the citadel', target: L ? { x: L.x, z: L.z, label: 'SKY LIFT' } : null };
    }
    const left = A.beacons.filter((b) => b.state !== 'done');
    const done = A.beacons.length - left.length;
    let b = left[0], bd = 1e9;
    for (const x of left) { const d = Math.hypot(x.x - p.pos.x, x.z - p.pos.z); if (d < bd) { bd = d; b = x; } }
    return { step: `Power ${Z.boss.name}'s beacons in the ${Z.name}`, prog: [done, A.beacons.length], target: b ? { x: b.x, z: b.z, label: 'BEACON' } : null };
  },
  main() {
    const F = this.F, B = G.progress.beaten;
    if (!F) return { title: '', step: '' };
    if (!this.tutorialDone) {
      const s = this.step;
      const target = s === 'talk' ? World.wren : s === 'rack' ? World.rack : s === 'bot' ? World.terminals[0] : s === 'targets' ? { x: 0, z: 30 } : null;
      return { id: 'wake', title: 'Rise and Shine', step: TUT_TEXT[s] + (s === 'targets' ? ` (${Math.min(3, F.targets)}/3)` : ''), target: target && { x: target.x, z: target.z, label: s === 'talk' ? 'WREN' : '' }, prog: [F.tutorial, TUTORIAL.length] };
    }
    const ground = WARDENS.filter((i) => B[i]).length;
    const title = ground === 0 ? 'The First Warden' : ground < WARDENS.length ? 'The Wardens Remember' : !B[4] ? 'Above the Static' : 'Free Skies';
    if (F.reported < F.order.length) return { id: 'report', title, step: 'Return home and tell Wren what happened', target: { x: World.wren.x, z: World.wren.z, label: 'WREN' } };
    if (ground === 0) return Object.assign({ id: 'first', title }, this.arenaStep(World.arenas[0]));
    if (ground < WARDENS.length) {
      const A = UI.goal().A || World.arenas.find((a) => !B[a.i] && a.i !== 4);
      const q = Object.assign({ id: 'wardens', title }, this.arenaStep(A));
      q.step = `${ground}/${WARDENS.length} freed · ` + q.step;
      return q;
    }
    if (!B[4]) return Object.assign({ id: 'sky', title }, this.arenaStep(World.arenas.find((a) => a.i === 4)));
    return { id: 'free', title, step: 'The ATlands are free — explore, and find every memory', done: true };
  },
  sides() {
    const S = this.S, rooms = (G.base.rooms) || {};
    const nRooms = ['garage', 'lab', 'command'].filter((k) => rooms[k]).length;
    return [
      { id: 'echoes', title: 'Echoes in the Dark', step: 'Find memory fragments hidden in caves', prog: [Math.min(S.logs, LORE_LOGS.length), LORE_LOGS.length], done: S.logs >= LORE_LOGS.length },
      { id: 'home', title: 'A Proper Home', step: 'Build the Garage, Lab and Command Room at the workbench', prog: [nRooms, 3], done: nRooms >= 3 },
      { id: 'parts', title: 'Lost and Found', step: 'Collect lost bot parts — every three make a premium bot', prog: [S.botparts % 3, 3], done: false },
      ...Villages.sides().map((q) => Object.assign(q, { title: `${q.title}${q.village ? ' · ' + q.village : ''}` })),
      { id: 'sprites', title: 'Little Lights', step: 'Find Scrap Sprites — every three add a stamina vessel', prog: [G.spritesFound, World.sprites.length], done: G.spritesFound >= World.sprites.length },
    ];
  },
};
