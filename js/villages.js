'use strict';
// Robot villages: one in each region, each with its own shops, villagers, a charging post for your
// bots, and a small quest tied to the story. Quill, a wandering archivist, turns up in a different
// village as the Wardens are freed.

// ───────────────────────── Shop types ─────────────────────────
const SHOP_TYPES = {
  food:     { label: 'Oil & Repairs',  color: '#6bff9e', items: ['service', 'repair', 'cell'] },
  parts:    { label: 'Parts Exchange', color: '#ffb347', items: ['buy_scrap', 'buy_wire', 'buy_servo', 'buy_circuit', 'buy_lens', 'buy_core'] },
  weapons:  { label: 'Weapons',        color: '#ff5a7a', items: ['scatter', 'rifle', 'launcher', 'cell'] },
  armor:    { label: 'Armor',          color: '#5ab8ff', items: ['up_armor', 'bot_shield', 'bot_bubble', 'repair'] },
  upgrades: { label: 'Upgrades',       color: '#3cf2ff', items: ['up_overclock', 'up_split', 'up_thruster', 'up_magnet', 'up_firmware', 'up_slot'] },
  gear:     { label: 'Gear',           color: '#ff9f43', items: ['jetpack', 'fireboots', 'backpack'] },
  bots:     { label: 'Botwright',      color: '#c6ff4d', items: ['bot_shield', 'bot_bubble', 'bot_tesla', 'bot_rocket', 'bot_bomber', 'bot_laser'] },
  dive:     { label: 'Diving Supply',  color: '#4ae0d0', items: ['backpack', 'repair'], note: 'Captain Brine is still pressure-testing the diving gear. Come back soon.' },
};

// ───────────────────────── The villages ─────────────────────────
// stage = Wardens freed so far; NPC lines pick the last entry whose stage is reached
const VILLAGES = [
  {
    id: 'brassbrook', name: 'Brassbrook', region: 0, color: '#6bff9e', hut: '#e8d8b0', roof: '#b8442e',
    blurb: 'A farming village of tinkerbots on the meadow',
    shops: [
      { type: 'food', name: "Dot's Oil Bar", keeper: 'Dot', body: '#ff9fb8', greet: 'Fresh oil, hot sparks! Sit down before you rust.' },
      { type: 'parts', name: "Ruby's Exchange", keeper: 'Ratchet Ruby', body: '#ff5a5a', greet: "Buying, selling, haggling — Ruby's got the parts you need." },
      { type: 'weapons', name: 'Flint & Barrel', keeper: 'Flint', body: '#8a8a96', greet: 'Point the shiny end at the bad bots. That is the whole lesson.' },
    ],
    elder: { name: 'Mayor Tinsel', body: '#ffd23f', quest: 'brass' },
    folk: [{ name: 'Sprocket', body: '#7fd8ff', small: true, lines: [[0, "Mom says don't go past the fence. The Static gets in your head out there."], [1, 'Is it true you beat Brambleback? It used to guard our fields before it went bad!']] }],
  },
  {
    id: 'glimmerdrift', name: 'Glimmerdrift', region: 1, color: '#8ae9ff', hut: '#dfe9f4', roof: '#4a6a8a',
    blurb: 'Lantern-lit domes in the snowfields',
    shops: [
      { type: 'armor', name: 'Sleet Plating', keeper: 'Sleet', body: '#bfe8ff', greet: 'Cold makes metal brittle. My plating stays tough.' },
      { type: 'bots', name: "Koba's Botwright", keeper: 'Koba', body: '#c6ff4d', greet: 'Every bot I build has a little bit of heart. Want one?' },
    ],
    elder: { name: 'Lumen', body: '#fff1a8', quest: 'glim' },
    folk: [{ name: 'Old Rime', body: '#a8b8c8', lines: [[0, 'Glacieros used to keep the blizzards off us. Now they come every night.'], [2, 'The blizzards are gentler now. Something changed up in the ice.']] }],
  },
  {
    id: 'highbolt', name: 'Highbolt', region: 2, color: '#ffcf6a', hut: '#c8b8a0', roof: '#5c554c',
    blurb: 'A cliffside town of climbers and lookouts',
    shops: [
      { type: 'upgrades', name: "Vela's Tuning", keeper: 'Vela', body: '#3cf2ff', greet: 'Faster, stronger, smarter. Pick two. Or all three, if you can pay.' },
      { type: 'gear', name: 'Crank Outfitters', keeper: 'Crank', body: '#ff9f43', greet: "Jetpacks, boots, packs. If it straps on, Crank's got it." },
      { type: 'weapons', name: 'Summit Arms', keeper: 'Talus', body: '#9a8a78', greet: 'Up here the wind steals your aim. Bring a rifle.' },
    ],
    elder: { name: 'Old Piston', body: '#c8a070', quest: 'high' },
    folk: [{ name: 'Shale', body: '#8a9aa8', lines: [[0, 'The Colossus walked these peaks for a hundred years. Never stepped on a single house.'], [3, 'I saw lights up on the Sky Islands last night. Like something waking.']] }],
  },
  {
    id: 'cinderwell', name: 'Cinderwell', region: 3, color: '#ff8c42', hut: '#5a4038', roof: '#2a1a14',
    blurb: 'A forge village perched above the lava',
    shops: [
      { type: 'armor', name: 'Slag Ironworks', keeper: 'Slag', body: '#ff6a1a', greet: 'Forged in lava, cooled in pride. Best plating in the valley.' },
      { type: 'upgrades', name: "Tempra's Kiln", keeper: 'Tempra', body: '#ffb347', greet: 'Heat makes everything better. Mostly.' },
      { type: 'food', name: 'The Sooty Kettle', keeper: 'Sootie', body: '#6a5a50', greet: 'Hot oil and cold coolant. Pick your poison.' },
    ],
    elder: { name: 'Forgemistress Ashby', body: '#ff5a1a', quest: 'cinder' },
    folk: [{ name: 'Clinker', body: '#8a3a1a', lines: [[0, 'The flows creep closer every week. Infernus used to keep them in their channels.'], [4, 'The lava went back to its channels overnight. Was that you?']] }],
  },
  {
    id: 'saltpin', name: 'Saltpin Harbor', region: 4, color: '#4ae0d0', hut: '#f0e6cc', roof: '#2f86c4',
    blurb: 'Stilt huts and fishing bots on the coast',
    shops: [
      { type: 'dive', name: 'Tidewright Diving', keeper: 'Marlin', body: '#4ae0d0', greet: 'The deep is calling. Mostly it says "not yet".' },
      { type: 'food', name: "Pebble's Galley", keeper: 'Pebble', body: '#ffd8a8', greet: 'Salted oil! Nobody else in the valley has it.' },
      { type: 'parts', name: "Barnacle Bea's", keeper: 'Barnacle Bea', body: '#c87a4a', greet: 'Everything washes up eventually. I sell it back.' },
      { type: 'bots', name: 'Driftwood Bots', keeper: 'Koi', body: '#ff9f43', greet: 'Sea-tested, salt-proof, mostly waterproof.' },
    ],
    elder: { name: 'Captain Brine', body: '#3a5a8a', quest: 'salt' },
    folk: [{ name: 'Gull', body: '#e8e8f0', small: true, lines: [[0, "The sea's been angry since spring. Captain says something deep is unhappy."]] }],
  },
];

// ───────────────────────── Village quests ─────────────────────────
const VQUESTS = {
  brass: {
    title: 'Trouble Next Door', kind: 'camp', village: 0,
    intro: ["A new face — and not a Static-addled one! I'm Tinsel, mayor of Brassbrook.", 'A gang of wild bots camps just outside town. Since the Static came they raid our scrap every night. Could you chase them off? I\'ll mark the camp on your map.'],
    remind: 'That camp is still out there. Check your map.',
    ready: 'You did it! Brassbrook owes you. Take this — and our charging post is yours whenever your bots need it.',
    after: 'Brassbrook will remember you, Rivet.',
    step: 'Clear the robot camp near Brassbrook', turnIn: 'Tell Mayor Tinsel the camp is clear',
    reward: { bucks: 120, parts: { circuit: 2, servo: 2 } },
  },
  glim: {
    title: 'Light for the Relay', kind: 'deliver', village: 1, need: { lens: 3 },
    intro: ['Our relay listens for the Static. When it glows we know which way the storm blows.', "Its lenses cracked in the cold. Bring me three Focus Lenses and I'll tune it — maybe even to that strange core of yours."],
    remind: 'Three Focus Lenses. Snipers carry them, mostly.',
    ready: "There. The relay hums your tune now, and every Warden beacon shows up on your map. Strange — your core and the Static sing in the same key… only backwards.",
    after: 'The relay hums. The Static is quieter tonight.',
    step: 'Bring Lumen 3 Focus Lenses', turnIn: 'Give Lumen the Focus Lenses',
    reward: { bucks: 100, beacons: true },
  },
  high: {
    title: 'The Lost Scout', kind: 'find', village: 2, find: 'scout',
    intro: ['My scout Wisp climbed the cliffs to watch the Sky Islands and never came down. Its ping still comes from a ledge above town.', 'Find it, would you? Climbing is not what it was for these old joints.'],
    remind: "Wisp's ping is on your map. Up, up, up.",
    found: "…Rivet? Piston sent you? My legs froze up. Tell Piston I saw lights on the islands — the citadel is waking.",
    ready: 'Wisp is safe? Thank the gears. Lights on the islands… Here, you earned this.',
    after: 'Wisp limped home this morning. Still talking about those lights.',
    step: 'Find Wisp on the cliffs above Highbolt', turnIn: 'Tell Old Piston that Wisp is safe',
    reward: { bucks: 200, parts: { quantum: 1, core: 1 } },
  },
  cinder: {
    title: 'Cooling the Forge', kind: 'deliver', village: 3, need: { core: 3, wire: 6 },
    intro: ["The lava's rising and our forge coolers are failing. Without them we can't hold the flows back.", "Bring me three Power Cores and six Copper Coils and I'll build new coolers. Maybe one day even a bridge across the lava."],
    remind: 'Three Power Cores, six Copper Coils. The forge is getting hot, Rivet.',
    ready: "The coolers hum! With a few more I could freeze a path straight across the lava. Infernus won't know what hit it.",
    after: 'The forge runs cool. I am sketching that bridge.',
    step: 'Bring Ashby 3 Power Cores and 6 Copper Coils', turnIn: 'Give Ashby the parts',
    reward: { bucks: 180, gear: 'fireboots', parts: { core: 1 } },
  },
  salt: {
    title: 'Message in a Bottle', kind: 'find', village: 4, find: 'bottle',
    intro: ['Ahoy, landbot. Bottles keep washing up on our shore — with old Warden markings on them.', "One's caught in the rocks down the beach. Fetch it for an old sailor?"],
    remind: 'The bottle is on your map. Mind the waves.',
    found: 'A sealed bottle. Something glows inside…',
    ready: "Read it to me? …'The deep one sings to keep the sea calm.' The sea's been rough lately. Too rough. Keep that — it's yours.",
    after: 'The deep one sings… I hope it keeps singing.',
    step: 'Find the bottle on the beach near Saltpin', turnIn: 'Bring the bottle to Captain Brine',
    reward: { bucks: 120, log: true },
  },
};

// Quill, the wandering archivist: a different village (and more of the story) per Warden freed
const QUILL = [
  ['Quill, archivist, at your service. I collect what the Static makes us forget.', 'Brambleback was the gentlest of the Wardens. If you free it, I would love to hear what it says.'],
  ["You freed a Warden! The archives speak of six guardians, not five. The sixth led them — and vanished into the sky.", 'I am heading for the mountains. Old Piston keeps records older than mine.'],
  ["The leader was called Aurel. It flew up to the citadel to silence the Conductor's first song, and never came down.", "Cinderwell's forges were built for Aurel. Meet me there."],
  ["Aurel's heart was never found. Some say it fell like a star, north of the valley.", 'Hm. Wren found something in a crater north of the valley, did she not?'],
  ['Rivet. I think we both know whose heart beats in you.', 'When the last Warden falls, the citadel will open for that heart — and only for it.'],
  ['The archives have a new chapter now. It is about you.'],
];

// ═════════════════════════ Building ═════════════════════════
const Villages = {
  // pick a level spot for each village (called from World.planLayout, before the heights)
  plan(W, flats, free) {
    W.villagePlans = [];
    for (let i = 0; i < VILLAGES.length; i++) {
      const V = VILLAGES[i];
      const T = TERRA[V.region];
      let spot = null;
      for (let t = 0; t < 200 && !spot; t++) {
        const A = W.arenaPlans[V.region];
        const tx = A ? A.x : T.cx, tz = A ? A.z : T.cz;
        const k = A ? rand(0.4, 0.62) : rand(0.35, 0.75), side = rand(-55, 55) * (1 + t / 100);
        const L = Math.hypot(tx, tz), px = -tz / L, pz = tx / L;
        const x = tx * k + px * side, z = tz * k + pz * side;
        const h = Terra.raw(x, z);
        if (h < WORLD.water + 3 || Terra.weights(x, z)[V.region] < 0.4 || !free(x, z, 30)) continue;
        if (V.region === 3 && h < WORLD.lava + 5) continue;
        spot = { x, z, h };
      }
      if (!spot) continue;
      flats.push({ x: spot.x, z: spot.z, r: 30, h: spot.h, village: true });
      W.villagePlans.push({ i, x: spot.x, z: spot.z });
    }
  },

  build(W) {
    W.villages = [];
    W.npcs = [];
    W.chargePosts = [];
    for (const P of W.villagePlans) this.buildVillage(W, VILLAGES[P.i], P);
    this.placeFinds(W);
  },

  buildVillage(W, V, P) {
    const y = W.heightAt(P.x, P.z);
    const vil = { i: P.i, id: V.id, name: V.name, x: P.x, z: P.z, y, r: 26, V, npcs: [], shops: [] };
    W.villages.push(vil);
    const S = new THREE.Group(); S.position.set(P.x, y, P.z); W.group.add(S);
    const hutM = Mat.std(V.hut, { rough: 0.8, metal: 0.1 }), roofM = Mat.std(V.roof, { rough: 0.7, metal: 0.2 });
    const stone = Mat.std('#8a8478', { rough: 0.9, metal: 0.05 }), dark = Mat.std('#2a2a30', { metal: 0.7, rough: 0.4 });
    const glowA = Mat.glow(V.color, 2.2), warm = Mat.glow('#ffd88a', 3);
    // the plaza
    mesh(Geo.cyl(10, 10.4, 0.25, 24), stone, 0, 0.05, 0, S).receiveShadow = true;
    const ring = mesh(Geo.torus(9.6, 0.08, 48), glowA, 0, 0.2, 0, S); ring.rotation.x = Math.PI / 2;
    // charging post in the middle
    mesh(Geo.cyl(0.5, 0.7, 0.4, 8), dark, 0, 0.35, 0, S);
    mesh(Geo.box(0.4, 3.6, 0.4), dark, 0, 2.2, 0, S);
    mesh(Geo.box(0.5, 0.12, 0.5), Mat.glow('#6bff9e', 3), 0, 3.9, 0, S);
    for (const a of [0, Math.PI]) {
      const px = Math.cos(a) * 2.2, pz = Math.sin(a) * 2.2;
      mesh(Geo.cyl(0.75, 0.85, 0.16, 12), dark, px, 0.2, pz, S);
      const pr = new THREE.Mesh(Geo.torus(0.6, 0.05, 24), Mat.glow('#6bff9e', 2.2)); pr.rotation.x = Math.PI / 2; pr.position.set(P.x + px, y + 0.3, P.z + pz); W.group.add(pr);
      W.chargePosts.push({ x: P.x + px, z: P.z + pz, y: y + 1.25, ring: pr, village: vil });
    }
    W.addCollider(P.x, P.z, 0.5, y + 4, 'pillar');
    // huts around the plaza
    const huts = randi(5, 7), a0 = rand(0, TAU);
    for (let k = 0; k < huts; k++) {
      const a = a0 + (k / huts) * TAU + rand(-0.15, 0.15), d = rand(17, 21);
      const hx = Math.cos(a) * d, hz = Math.sin(a) * d, r = rand(2.2, 3), h = rand(2.6, 3.6);
      const g = new THREE.Group(); g.position.set(hx, 0, hz); g.rotation.y = Math.atan2(-hx, -hz); S.add(g);
      mesh(Geo.cyl(r, r * 1.05, h, 10), hutM, 0, h / 2, 0, g).receiveShadow = true;
      const roof = mesh(new THREE.ConeGeometry(r * 1.25, r * 0.9, 10), roofM, 0, h + r * 0.45, 0, g); roof.castShadow = true;
      mesh(Geo.box(1.1, 1.8, 0.2), dark, 0, 0.9, r * 0.98, g);
      mesh(Geo.box(1.2, 0.08, 0.24), glowA, 0, 1.85, r, g);
      for (const s of [-1, 1]) mesh(Geo.box(0.5, 0.45, 0.1), warm, s * r * 0.62, h * 0.62, r * 0.8, g).rotation.y = s * 0.6;
      mesh(Geo.box(0.08, 1.2, 0.08), dark, r * 0.5, h + r * 0.7, 0, g);   // antenna
      mesh(Geo.sphere(0.12, 1), glowA, r * 0.5, h + r * 0.7 + 0.65, 0, g);
      W.addCollider(P.x + hx, P.z + hz, r + 0.2, y + h, 'wall');
    }
    // lanterns around the edge
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + 0.2, lx = Math.cos(a) * 12.5, lz = Math.sin(a) * 12.5;
      mesh(Geo.cyl(0.08, 0.1, 2.4, 6), dark, lx, 1.2, lz, S);
      mesh(Geo.box(0.32, 0.32, 0.32), warm, lx, 2.5, lz, S);
    }
    // shop stalls on the plaza edge, facing the middle
    const nS = V.shops.length, sa0 = a0 + Math.PI / huts;
    V.shops.forEach((def, k) => {
      const a = sa0 + (k / nS) * TAU * 0.75, sx = Math.cos(a) * 11.5, sz = Math.sin(a) * 11.5;
      const T = SHOP_TYPES[def.type];
      const spot = this.buildStall(W, S, P.x + sx, P.z + sz, y, sx, sz, Object.assign({ color: T.color, items: T.items, label: T.label, note: T.note }, def));
      spot.village = vil;
      vil.shops.push(spot);
      W.shops.push(spot);
      vil.npcs.push(this.addNpc(W, vil, { name: def.keeper, body: def.body, role: 'shop', shop: spot, x: spot.kx, z: spot.kz, still: true, yaw: spot.face }));
    });
    // the elder, the folk
    vil.npcs.push(this.addNpc(W, vil, { name: V.elder.name, body: V.elder.body, role: 'elder', quest: V.elder.quest, x: P.x + 3.5, z: P.z + 3.5 }));
    for (const f of V.folk) vil.npcs.push(this.addNpc(W, vil, { name: f.name, body: f.body, small: f.small, role: 'folk', lines: f.lines, x: P.x + rand(-6, 6), z: P.z + rand(-6, 6) }));
    // the village name over the plaza
    const lbl = W.makeLabel(V.name.toUpperCase(), V.color, 768, 110); lbl.position.set(P.x, y + 6.4, P.z); lbl.scale.set(7, 1, 1); W.group.add(lbl);
    W.bake(S);
  },

  buildStall(W, S, x, z, y, lx, lz, def) {
    const face = Math.atan2(-lx, -lz);   // facing the middle of the plaza
    const g = new THREE.Group(); g.position.set(lx, 0, lz); g.rotation.y = face; S.add(g);
    const wood = Mat.std('#8a5a32', { rough: 0.8, metal: 0.05 }), woodD = Mat.std('#5a3a22', { rough: 0.8, metal: 0.05 });
    mesh(Geo.box(4.4, 0.25, 3.2), woodD, 0, 0.12, 0, g).receiveShadow = true;
    mesh(Geo.box(3.8, 1.1, 0.8), wood, 0, 0.75, 1, g);
    mesh(Geo.box(4, 0.1, 1), woodD, 0, 1.35, 1, g);
    for (const s of [-1, 1]) for (const zz of [-1.4, 1.4]) mesh(Geo.box(0.18, 3.2, 0.18), woodD, s * 2, 1.6, zz, g);
    for (let i = 0; i < 5; i++) { const st = mesh(Geo.box(0.85, 0.1, 3.6), Mat.std(i % 2 ? '#fff6e8' : def.color, { rough: 0.7, metal: 0 }), -1.7 + i * 0.85, 3.3, 0.2, g); st.rotation.x = -0.18; }
    const goods = ['#ff5a7a', '#ffd23f', '#3cf2ff', '#b98cff', '#6bff9e'];
    for (let i = 0; i < 5; i++) mesh(Geo.box(0.36, 0.36, 0.36), Mat.std(pick(goods), { rough: 0.4, metal: 0.4, emissive: pick(goods), ei: 0.3 }), -1.6 + i * 0.8, 1.6, 1, g);
    const sign = W.makeLabel(def.name.toUpperCase(), def.color, 640, 120); sign.position.set(x, y + 4.5, z); sign.scale.set(4.6, 0.86, 1); W.group.add(sign);
    for (const s of [-1.3, 0, 1.3]) {
      const ox = Math.cos(face) * s + Math.sin(face) * 1, oz = -Math.sin(face) * s + Math.cos(face) * 1;
      W.addCollider(x + ox, z + oz, 0.75, y + 1.4, 'wall');
    }
    // the keeper stands behind the counter; you trade from in front of it
    const fx = Math.sin(face), fz = Math.cos(face);
    return { x: x + fx * 2.6, z: z + fz * 2.6, y, def, kx: x - fx * 0.2, kz: z - fz * 0.2, face, color: def.color };
  },

  addNpc(W, vil, o) {
    const m = buildVillagerModel(o.body, o.small);
    const y = W.heightAt(o.x, o.z);
    m.position.set(o.x, y, o.z);
    m.rotation.y = o.yaw ?? rand(0, TAU);
    W.group.add(m);
    const n = { name: o.name, role: o.role, shop: o.shop, quest: o.quest, lines: o.lines, x: o.x, z: o.z, y, model: m, village: vil, home: { x: o.x, z: o.z }, still: !!o.still, yaw: m.rotation.y, t: rand(0, 10), wander: { x: o.x, z: o.z, t: rand(2, 6) } };
    W.npcs.push(n);
    return n;
  },

  // the things the village quests send you to find
  placeFinds(W) {
    W.finds = [];
    const at = (vi, test) => {
      const v = W.villages.find((q) => q.i === vi);
      if (!v) return null;
      for (let t = 0; t < 800; t++) {
        const a = rand(0, TAU), d = rand(45, 150), x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d;
        if (Math.max(Math.abs(x), Math.abs(z)) > W.half * 0.85 || W.isHole(x, z)) continue;
        if (test(x, z, W.heightAt(x, z), v)) return { x, z, y: W.heightAt(x, z) };
      }
      return null;
    };
    // Wisp: on a high ledge above Highbolt
    const ledge = at(2, (x, z, h, v) => h > v.y + 14 && W.slopeAt(x, z) < 0.35 && W.isClear(x, z, 1.5, WORLD.water + 2));
    if (ledge) {
      const m = buildVillagerModel('#a8e8ff', true); m.position.set(ledge.x, ledge.y, ledge.z); m.rotation.z = 0.5; W.group.add(m);
      const beam = glowSprite('#a8e8ff', 3, 1.2); beam.position.set(ledge.x, ledge.y + 1.6, ledge.z); W.group.add(beam);
      W.finds.push({ id: 'scout', x: ledge.x, z: ledge.z, y: ledge.y, model: m, glow: beam, name: 'Wisp' });
    }
    // the bottle: on the beach near Saltpin
    const beach = at(4, (x, z, h) => h > WORLD.water + 0.2 && h < WORLD.water + 1.8 && W.slopeAt(x, z) < 0.5);
    if (beach) {
      const g = new THREE.Group(); g.position.set(beach.x, beach.y + 0.2, beach.z); g.rotation.z = 1.3; W.group.add(g);
      mesh(Geo.cyl(0.14, 0.16, 0.5, 8), Mat.std('#5ac87a', { rough: 0.1, metal: 0.2, emissive: '#1a5a3a', ei: 0.5 }), 0, 0, 0, g);
      mesh(Geo.cyl(0.06, 0.08, 0.16, 6), Mat.std('#8a5a32'), 0, 0.32, 0, g);
      const glow = glowSprite('#6bff9e', 2.4, 1.3); glow.position.set(beach.x, beach.y + 0.8, beach.z); W.group.add(glow);
      W.finds.push({ id: 'bottle', x: beach.x, z: beach.z, y: beach.y, model: g, glow, name: 'the bottle' });
    }
  },

  // ═════════════════════════ Progress ═════════════════════════
  state() {
    const P = G.progress;
    if (!P.villages) P.villages = { visited: [], quests: {} };
    return P.villages;
  },
  questState(id) { return this.state().quests[id] || 'new'; },
  setQuest(id, st) { this.state().quests[id] = st; },
  visited(v) { return this.state().visited.includes(v.id); },
  stage() { return G.progress.beaten.filter(Boolean).length; },

  // after loading: hide what has already been found
  apply() {
    for (const f of World.finds || []) { const st = this.questState(f.id === 'scout' ? 'high' : 'salt'); const gone = st === 'ready' || st === 'done'; f.model.visible = !gone; f.glow.visible = !gone; }
    this.placeQuill();
  },
  placeQuill() {
    const W = World;
    if (!W.villages || !W.villages.length) return;
    const v = W.villages[Math.min(this.stage(), W.villages.length - 1)];
    if (!W.quill) {
      const m = buildVillagerModel('#b98cff', false, true);
      W.group.add(m);
      W.quill = { name: 'Quill', role: 'quill', model: m, t: 0, still: false, wander: { t: 0 } };
      W.npcs.push(W.quill);
    }
    const q = W.quill;
    q.village = v; q.x = v.x - 4; q.z = v.z + 2; q.y = W.heightAt(q.x, q.z); q.home = { x: q.x, z: q.z }; q.wander = { x: q.x, z: q.z, t: 3 };
    q.model.position.set(q.x, q.y, q.z);
  },

  // entering a village: first visits are announced and saved, and its charging post opens
  updatePresence(dt) {
    const p = G.player;
    let inside = null;
    for (const v of World.villages || []) if (Math.hypot(p.pos.x - v.x, p.pos.z - v.z) < v.r + 6) inside = v;
    if (inside !== this.here) {
      this.here = inside;
      if (inside) {
        const first = !this.visited(inside);
        if (first) this.state().visited.push(inside.id);
        UI.banner(inside.name.toUpperCase(), first ? `${inside.V.blurb} · its charging post now serves your bots` : inside.V.blurb, inside.V.color, 3);
        G.safeSpot = { x: inside.x + 3, y: inside.y, z: inside.z + 3, yaw: p.yaw };
        saveGame();
      }
    }
  },

  // quest goals that complete out in the world
  event(name, data) {
    if (name === 'campCleared') {
      if (this.questState('brass') === 'active' && World.questCamp && data === World.questCamp) { this.setQuest('brass', 'ready'); UI.banner('CAMP CLEARED', 'Tell Mayor Tinsel in Brassbrook', '#6bff9e', 3); saveGame(); }
    }
  },

  // the village quests that are under way, for the quest log and tracker
  sides() {
    const out = [];
    for (const [id, Q] of Object.entries(VQUESTS)) {
      const st = this.questState(id);
      if (st === 'new') continue;
      const v = World.villages && World.villages.find((x) => x.i === Q.village);
      let target = null, step = Q.step;
      if (st === 'active') {
        if (Q.kind === 'camp' && World.questCamp) target = { x: World.questCamp.x, z: World.questCamp.z, label: 'CAMP' };
        if (Q.kind === 'find') { const f = (World.finds || []).find((x) => x.id === Q.find); if (f) target = { x: f.x, z: f.z, label: f.name.toUpperCase() }; }
        if (Q.kind === 'deliver') step += ` (${this.needText(Q.need)})`;
      }
      if (st === 'ready') { step = Q.turnIn; if (v) target = { x: v.x, z: v.z, label: v.name.toUpperCase() }; }
      out.push({ id, title: Q.title, step: st === 'done' ? 'Done' : step, done: st === 'done', target, village: v && v.name });
    }
    return out;
  },
  needText(need) { return Object.entries(need).map(([k, n]) => `${Math.min(G.partCount(k, true), n)}/${n} ${PARTS[k].name}`).join(', '); },

  // ═════════════════════════ Talking ═════════════════════════
  nearestNpc(p, r = 2.8) {
    let best = null, bd = r;
    for (const n of World.npcs || []) {
      if (!n.model.visible) continue;
      const d = Math.hypot(n.x - p.pos.x, n.z - p.pos.z);
      if (d < bd && Math.abs(p.pos.y - n.y) < 3) { bd = d; best = n; }
    }
    // the things you're sent to find
    for (const f of World.finds || []) if (f.model.visible && Math.hypot(f.x - p.pos.x, f.z - p.pos.z) < 2.6) return { find: f };
    return best;
  },
  say(n, lines) { Dialog.clear(); Dialog.say(lines.map((t) => ({ who: n.name.toUpperCase(), color: n.color || '#dfe8f4', text: t }))); },

  talk(n) {
    if (n.find) return this.pickUp(n.find);
    n.color = n.role === 'quill' ? '#b98cff' : n.village ? n.village.V.color : '#dfe8f4';
    if (n.role === 'shop') { UI.openStation('shop', n.shop); return; }
    if (n.role === 'quill') { this.say(n, QUILL[Math.min(this.stage(), QUILL.length - 1)]); return; }
    if (n.role === 'folk') { const st = this.stage(); let line = n.lines[0][1]; for (const [s, l] of n.lines) if (st >= s) line = l; this.say(n, [line]); return; }
    // the elder and their quest
    const id = n.quest, Q = VQUESTS[id], st = this.questState(id);
    if (st === 'new') {
      this.say(n, Q.intro);
      this.setQuest(id, 'active');
      if (Q.kind === 'camp') this.pickQuestCamp(n.village);
      Sound.play('uplink', null, 0.6);
      UI.banner(`QUEST: ${Q.title.toUpperCase()}`, Q.step, '#ffd23f', 3);
      saveGame();
    } else if (st === 'active' && Q.kind === 'deliver' && G.canAfford(Q.need, true)) {
      G.consume(Q.need, true);
      this.finish(n, id);
    } else if (st === 'active') this.say(n, [Q.remind + (Q.kind === 'deliver' ? ` (${this.needText(Q.need)})` : '')]);
    else if (st === 'ready') this.finish(n, id);
    else this.say(n, [Q.after]);
  },
  pickQuestCamp(v) {
    let best = null, bd = 1e9;
    for (const c of World.campSites) {
      if (c.island) continue;
      const d = Math.hypot(c.x - v.x, c.z - v.z);
      if (d > 50 && d < bd) { bd = d; best = c; }
    }
    World.questCamp = best;
    if (best) { best.respawnAt = 0; this.state().camp = best.id; }
  },
  pickUp(f) {
    const id = f.id === 'scout' ? 'high' : 'salt', Q = VQUESTS[id];
    if (this.questState(id) !== 'active') {
      Dialog.clear(); Dialog.say([{ who: f.name.toUpperCase(), color: '#a8e8ff', text: f.id === 'scout' ? "…hello? Did someone send you? Find Old Piston in Highbolt." : "A bottle with Warden markings. Someone in Saltpin might want it." }]);
      return;
    }
    f.model.visible = false; f.glow.visible = false;
    this.setQuest(id, 'ready');
    Dialog.clear(); Dialog.say([{ who: f.id === 'scout' ? 'WISP' : 'RIVET', color: '#a8e8ff', text: Q.found }]);
    Sound.play('sprite');
    UI.banner(f.id === 'scout' ? 'WISP FOUND' : 'BOTTLE FOUND', Q.turnIn, '#6bff9e', 3);
    saveGame();
  },
  finish(n, id) {
    const Q = VQUESTS[id], R = Q.reward;
    this.say(n, [Q.ready]);
    this.setQuest(id, 'done');
    const got = [];
    if (R.bucks) { G.bucks += R.bucks; UI.bump('bucks'); got.push(`${R.bucks} Botbucks`); }
    if (R.parts) for (const [k, v] of Object.entries(R.parts)) { G.store({ t: 'part', id: k }, v); got.push(`${v} ${PARTS[k].name}`); }
    if (R.gear) { if (!G.gear[R.gear]) { G.gear[R.gear] = true; got.push(R.gear === 'fireboots' ? 'Fire Boots' : R.gear); } else { G.bucks += 150; got.push('150 more Botbucks'); } }
    if (R.beacons) { for (const b of World.beacons) WorldMap.reveal(b.x, b.z, 40); got.push('every beacon on your map'); }
    if (R.log) {
      const S = G.progress.story;
      const L2 = LORE_LOGS[Math.min(S.logs, LORE_LOGS.length - 1)];
      S.logs++;
      setTimeout(() => UI.showLore(L2, Math.min(S.logs, LORE_LOGS.length), LORE_LOGS.length), 1500);
      got.push('a memory fragment');
    }
    Sound.play('win');
    UI.banner(`${Q.title.toUpperCase()} COMPLETE`, got.join(' · ') + (R.parts ? ' (parts sent to storage)' : ''), '#ffd23f', 4);
    saveGame();
  },

  // ═════════════════════════ Per-frame ═════════════════════════
  update(dt, time) {
    const p = G.player;
    if (!World.npcs) return;
    for (const n of World.npcs) {
      const near = Math.abs(n.x - p.pos.x) < 160 && Math.abs(n.z - p.pos.z) < 160;
      n.model.visible = near;
      if (!near) continue;
      n.t += dt;
      const d = Math.hypot(p.pos.x - n.x, p.pos.z - n.z);
      let want = n.yaw, moving = false;
      if (d < 7) want = Math.atan2(p.pos.x - n.x, p.pos.z - n.z);
      else if (!n.still) {
        // potter about the plaza
        n.wander.t -= dt;
        if (n.wander.t <= 0) { n.wander.t = rand(3, 8); const a = rand(0, TAU), r = rand(0, 7); n.wander.x = n.home.x + Math.cos(a) * r; n.wander.z = n.home.z + Math.sin(a) * r; }
        const wx = n.wander.x - n.x, wz = n.wander.z - n.z, wd = Math.hypot(wx, wz);
        if (wd > 0.4) { n.x += (wx / wd) * 1.4 * dt; n.z += (wz / wd) * 1.4 * dt; want = Math.atan2(wx, wz); moving = true; n.yaw = want; }
      }
      n.y = World.heightAt(n.x, n.z);
      n.model.rotation.y += angDiff(n.model.rotation.y, want) * (1 - Math.exp(-5 * dt));
      n.model.position.set(n.x, n.y + (moving ? Math.abs(Math.sin(n.t * 8)) * 0.06 : Math.sin(n.t * 2) * 0.02), n.z);
      const U = n.model.userData;
      if (U.eye) U.eye.scale.y = (n.t % 4) < 0.12 ? 0.2 : 1;   // blink
      // keep the player from walking through villagers
      if (d < 0.9 && d > 0.001) { p.pos.x = n.x + (p.pos.x - n.x) / d * 0.9; p.pos.z = n.z + (p.pos.z - n.z) / d * 0.9; }
    }
    for (const c of World.chargePosts) c.ring.scale.setScalar(1 + 0.06 * Math.sin(time * 4 + c.x));
    for (const f of World.finds) if (f.glow.visible) f.glow.material.opacity = 0.6 + 0.4 * Math.sin(time * 3);
    if (G.state === 'playing') this.updatePresence(dt);
  },
  // robots that are not yours stay out of the villages
  keepOut(e) {
    for (const v of World.villages || []) {
      const dx = e.pos.x - v.x, dz = e.pos.z - v.z, d = Math.hypot(dx, dz), R = v.r + 4 + e.r;
      if (d < R && d > 0.001) { e.pos.x = v.x + dx / d * R; e.pos.z = v.z + dz / d * R; }
    }
  },
};

// A village robot: a rounded body, a screen face and an antenna. Faces +Z.
function buildVillagerModel(color, small = false, cloak = false) {
  const g = new THREE.Group();
  const k = small ? 0.72 : 1;
  const body = Mat.std(color, { rough: 0.45, metal: 0.4 }), dark = Mat.std('#22262e', { rough: 0.5, metal: 0.6 });
  mesh(Geo.cyl(0.32 * k, 0.4 * k, 0.25 * k, 10), dark, 0, 0.12 * k, 0, g);              // wheel base
  mesh(Geo.cyl(0.36 * k, 0.3 * k, 0.8 * k, 10), body, 0, 0.62 * k, 0, g);               // body
  if (cloak) { const c = mesh(new THREE.ConeGeometry(0.55, 1.1, 10, 1, true), Mat.std('#3a2a5a', { rough: 0.9, metal: 0 }), 0, 0.7, 0, g); c.material.side = THREE.DoubleSide; }
  mesh(Geo.box(0.62 * k, 0.46 * k, 0.5 * k), body, 0, 1.3 * k, 0, g);                   // head
  mesh(Geo.box(0.5 * k, 0.3 * k, 0.04), dark, 0, 1.3 * k, 0.26 * k, g);                  // face screen
  const eye = mesh(Geo.box(0.32 * k, 0.07 * k, 0.03), Mat.glow(cloak ? '#b98cff' : '#7fffd4', 2.6), 0, 1.33 * k, 0.29 * k, g);
  mesh(Geo.box(0.04, 0.35 * k, 0.04), dark, 0.18 * k, 1.68 * k, 0, g);                   // antenna
  const tip = mesh(Geo.sphere(0.06 * k, 1), Mat.glow(color, 3), 0.18 * k, 1.88 * k, 0, g);
  for (const s of [-1, 1]) { const arm = mesh(Geo.box(0.1 * k, 0.5 * k, 0.1 * k), dark, s * 0.42 * k, 0.75 * k, 0.05, g); arm.rotation.z = s * 0.15; }
  if (cloak) mesh(Geo.box(0.36, 0.44, 0.08), Mat.std('#e8dcc0', { rough: 0.9 }), 0.38, 0.7, 0.2, g).rotation.z = 0.2;   // Quill's book
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.userData = { eye, antenna: tip };
  return g;
}
