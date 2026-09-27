'use strict';
// ───────────────────────── Robot parts ─────────────────────────
const PARTS = {
  scrap:   { name: 'Scrap Plating', color: '#aab6c8', value: 2, desc: 'Bent armor plating. The backbone of every build.' },
  wire:    { name: 'Copper Coil',   color: '#ff9f43', value: 3, desc: 'Salvaged wiring and conductive coils.' },
  servo:   { name: 'Servo Motor',   color: '#48dbfb', value: 6, desc: 'Precision actuator. Makes things move.' },
  circuit: { name: 'Logic Board',   color: '#1dd1a1', value: 8, desc: 'The brains of a robot. Mostly intact.' },
  lens:    { name: 'Focus Lens',    color: '#f368e0', value: 10, desc: 'Optical crystal pulled from targeting arrays.' },
  core:    { name: 'Power Core',    color: '#feca57', value: 15, desc: 'A humming energy cell. Handle with care.' },
  quantum: { name: 'Quantum Chip',  color: '#a55eea', value: 40, desc: 'Exotic tech. Found on elites, bosses and golden caches.' },
};
const PART_ORDER = ['scrap', 'wire', 'servo', 'circuit', 'lens', 'core', 'quantum'];

// ───────────────────────── Enemies (world units: metres, seconds) ─────────────────────────
// drops: [part, chance, min, max]
const ENEMY_TYPES = {
  drone: {
    name: 'Drone', hp: 22, speed: 8.5, r: 0.75, hover: 2.8, dmg: 7, color: '#ff4d6d', ai: 'drone', fireCd: 1.6, bulletSpeed: 30, cost: 1,
    drops: [['scrap', 0.55, 1, 1], ['wire', 0.4, 1, 1], ['circuit', 0.12, 1, 1]],
  },
  swarmer: {
    name: 'Swarmer', hp: 10, speed: 12.5, r: 0.5, hover: 0.5, dmg: 14, color: '#ffd23f', ai: 'swarm', cost: 0.5,
    drops: [['wire', 0.3, 1, 1], ['scrap', 0.25, 1, 1], ['circuit', 0.06, 1, 1]],
  },
  grunt: {
    name: 'Grunt', hp: 45, speed: 4.6, r: 0.95, hover: 0, hitY: 1.2, dmg: 9, color: '#ff8c42', ai: 'grunt', fireCd: 1.6, bulletSpeed: 28, cost: 2,
    drops: [['scrap', 0.8, 1, 2], ['servo', 0.35, 1, 1], ['wire', 0.35, 1, 1], ['circuit', 0.15, 1, 1]],
  },
  sniper: {
    name: 'Sniper', hp: 36, speed: 5, r: 0.9, hover: 0, hitY: 1.8, dmg: 22, color: '#c77dff', ai: 'sniper', fireCd: 3.6, bulletSpeed: 95, cost: 3,
    drops: [['lens', 0.55, 1, 1], ['circuit', 0.4, 1, 1], ['scrap', 0.4, 1, 1]],
  },
  shielder: {
    name: 'Bulwark', hp: 85, speed: 3.8, r: 1.1, hover: 0, hitY: 1.2, dmg: 9, color: '#f72585', ai: 'shield', fireCd: 2.3, bulletSpeed: 26, cost: 4,
    drops: [['circuit', 0.6, 1, 2], ['core', 0.22, 1, 1], ['servo', 0.45, 1, 1], ['lens', 0.15, 1, 1]],
  },
  tank: {
    name: 'Crusher', hp: 210, speed: 2.6, r: 2.0, hover: 0, hitY: 1.3, dmg: 11, color: '#ff3b3b', ai: 'tank', fireCd: 2.5, bulletSpeed: 22, cost: 6,
    drops: [['scrap', 1, 2, 4], ['servo', 0.7, 1, 2], ['core', 0.4, 1, 1]],
  },
  carrier: {
    name: 'Hive Carrier', hp: 170, speed: 3, r: 2.1, hover: 6, dmg: 10, color: '#ff6b35', ai: 'carrier', fireCd: 5, cost: 7,
    drops: [['core', 0.6, 1, 1], ['circuit', 0.6, 1, 2], ['wire', 0.7, 1, 3], ['lens', 0.2, 1, 1]],
  },
};

// Biome variants: same chassis & AI, new paint, stats and special shots
// (shot: 'frost' slows you, 'fire' sets you burning). `model` picks the chassis, `body` the hull colour.
(() => {
  const V = (base, o) => Object.assign({}, ENEMY_TYPES[base], { model: base }, o);
  Object.assign(ENEMY_TYPES, {
    frostdrone:  V('drone',   { name: 'Frost Drone',   color: '#8ae9ff', body: '#8aa6c0', shot: 'frost' }),
    snowgrunt:   V('grunt',   { name: 'Snow Trooper',  color: '#bfe8ff', body: '#9fb8cc', shot: 'frost', hp: 55 }),
    icemite:     V('swarmer', { name: 'Ice Mite',      color: '#dff6ff', body: '#b8d0e4' }),
    rockcrusher: V('tank',    { name: 'Rockcrusher',   color: '#ffb35a', body: '#7a6048', hp: 240 }),
    firedrone:   V('drone',   { name: 'Ember Drone',   color: '#ff6a1a', body: '#3a1a12', shot: 'fire' }),
    magmagrunt:  V('grunt',   { name: 'Magma Brute',   color: '#ff4a1a', body: '#4a1c12', shot: 'fire', hp: 62 }),
    embermite:   V('swarmer', { name: 'Ember Mite',    color: '#ffb347', body: '#4a2410', shot: 'fire' }),
    hawk:        V('drone',   { name: 'Sky Hawk',      color: '#ffe14d', body: '#e8e0c8', speed: 12, hover: 3.6, hp: 30 }),
  });
})();

// ───────────────────────── Biomes (the five worlds around home base) ─────────────────────────
// Kept under the old name ZONES so every system that reads zone data keeps working.
const ZONES = [
  {
    id: 'plains', name: 'Green Plains', short: 'PLAINS',
    intro: 'Rolling meadows, wildflowers and robots grazing on scrap.',
    sky: { top: '#3d8be0', horizon: '#d4ecff', bottom: '#a8cfe8' }, sun: '#fff1cf', sunDir: [0.55, 0.6, -0.55], stars: false,
    fog: '#b4d6f2', fogDensity: 0.0036,
    hemi: ['#e4f2ff', '#5a7a3a', 1.1], sunI: 2.3,
    ground: { low: '#4c8d2c', mid: '#6ab83c', high: '#9fd057', rock: '#8e8a78', patch: '#c9b36a', patch2: '#3b7a28' },
    hazard: { color: '#2f86c4', glow: '#6ad0ff', dmg: 0, slow: 0.55, name: 'Pond' },
    accent: '#6bff9e', ambient: 'pollen', ambientColor: '#fff4a8',
    terrain: { amp: 0.75, ridge: 0.6 },
    flora: { trees: 230, kind: 'round', trunk: '#6e4524', leaves: ['#3d9c33', '#57b83a', '#2e8a39', '#7cc444', '#4aa84a'], flowers: ['#ff5a7a', '#ffd23f', '#b88cff', '#ffffff', '#ff9f43'], grass: ['#5fae3a', '#78c24a', '#4a9a30'] },
    props: { rocks: 45, pillars: 8, crystals: 0, scrap: 25, lamps: 6 },
    beacons: 3,
    pool: [['drone', 6], ['swarmer', 2], ['grunt', 4]],
    shop: { name: "TINKER TOM'S", color: '#6bff9e', items: ['repair', 'cell', 'scatter', 'bot_shield', 'up_armor', 'up_magnet', 'backpack'] },
    boss: { kind: 'beast', name: 'BRAMBLEBACK', title: 'Iron Boar of the Meadow', color: '#ff9f43', hp: 1500, patterns: ['charge', 'pounce', 'stomp', 'aimed', 'summon'] },
  },
  {
    id: 'snow', name: 'Snowy Plains', short: 'SNOW',
    intro: 'Endless white fields. The cold makes every machine brittle — and mean.',
    sky: { top: '#6fb2ee', horizon: '#eef8ff', bottom: '#c6def0' }, sun: '#ffffff', sunDir: [0.4, 0.5, 0.7], stars: false,
    fog: '#dcecf8', fogDensity: 0.0072,
    hemi: ['#e4f0fc', '#6e8aa6', 0.85], sunI: 1.6,
    ground: { low: '#a9c8e2', mid: '#d4e4f2', high: '#eaf2f9', rock: '#6f8aa2', patch: '#bcd8ee', patch2: '#98bcda' },
    hazard: { color: '#5aa6d6', glow: '#bff0ff', dmg: 0, slow: 0.4, name: 'Freezing lake' },
    accent: '#8ae9ff', ambient: 'snow',
    terrain: { amp: 0.9, ridge: 0.8 },
    flora: { trees: 170, kind: 'pine', snowy: true, trunk: '#5a3a22', leaves: ['#2e6b4a', '#3a7d58', '#285e40'], flowers: [], grass: [] },
    props: { rocks: 60, pillars: 10, crystals: 40, scrap: 15, lamps: 10 },
    beacons: 3,
    pool: [['frostdrone', 5], ['icemite', 2.5], ['snowgrunt', 4], ['sniper', 1.5]],
    shop: { name: 'FROSTBYTE OUTFITTERS', color: '#8ae9ff', items: ['repair', 'cell', 'rifle', 'bot_tesla', 'bot_bubble', 'up_overclock', 'up_thruster', 'backpack'] },
    boss: { kind: 'frost', name: 'GLACIEROS', title: 'The Frozen Heart', color: '#8ae9ff', hp: 2500, patterns: ['freeze', 'icebeam', 'radial', 'spiral', 'summon'] },
  },
  {
    id: 'mountains', name: 'The Mountains', short: 'MOUNTAINS',
    intro: 'Stone giants and sheer cliffs. Climb high — but mind the drop.',
    sky: { top: '#4f86c6', horizon: '#dbe6f0', bottom: '#9aa8b8' }, sun: '#fff0d8', sunDir: [-0.5, 0.55, -0.5], stars: false,
    fog: '#b6c2cf', fogDensity: 0.0056,
    hemi: ['#e4ecf4', '#5a4a3a', 1.0], sunI: 2.2,
    ground: { low: '#6d5a44', mid: '#857a6c', high: '#a9a39b', rock: '#5c554c', patch: '#7a6a50', patch2: '#948c80', cap: '#f4f8fc' },
    hazard: { color: '#3a6a8a', glow: '#7ab8e0', dmg: 0, slow: 0.5, name: 'Mountain lake' },
    accent: '#ffcf6a', ambient: 'dust', ambientColor: '#e8e0d0',
    terrain: { amp: 2.2, ridge: 2.4 },
    flora: { trees: 110, kind: 'pine', trunk: '#5a3a22', leaves: ['#2f5e3e', '#3a6e48', '#4a7a4e'], flowers: ['#ffffff', '#b88cff'], grass: ['#6a7a3a'] },
    props: { rocks: 130, pillars: 18, crystals: 0, scrap: 20, lamps: 8 },
    beacons: 4,
    pool: [['drone', 3], ['grunt', 4], ['sniper', 2.5], ['shielder', 2], ['rockcrusher', 1.5]],
    shop: { name: 'SUMMIT SUPPLY', color: '#ffcf6a', items: ['jetpack', 'fireboots', 'launcher', 'bot_rocket', 'up_split', 'up_slot', 'repair', 'cell'] },
    boss: { kind: 'titan', name: 'COLOSSUS', title: 'Walker of the Peaks', color: '#ffcf6a', hp: 3700, patterns: ['stomp', 'boulder', 'aimed', 'radial', 'summon'] },
  },
  {
    id: 'volcano', name: 'Fiery Volcano', short: 'VOLCANO',
    intro: 'Rivers of lava and ash-choked skies. Your fire boots are all that stand between you and the magma.',
    sky: { top: '#2a0806', horizon: '#ff6a2a', bottom: '#3a0c06' }, sun: '#ff8a3a', sunDir: [-0.4, 0.35, -0.8], stars: false,
    fog: '#6a2412', fogDensity: 0.0085,
    hemi: ['#ffb08a', '#3a0c06', 0.95], sunI: 2.0,
    ground: { low: '#3a1810', mid: '#5a2416', high: '#7c3a22', rock: '#2c1812', patch: '#8a3a1a', patch2: '#241010' },
    hazard: { color: '#ff4a0a', glow: '#ff7a1a', dmg: 16, slow: 0.6, name: 'Lava' },
    accent: '#ff8c42', ambient: 'embers', hazardLevel: -1.2,
    terrain: { amp: 1.3, ridge: 1.2 },
    flora: { trees: 90, kind: 'dead', trunk: '#241410', leaves: ['#ff6a1a'], flowers: [], grass: [] },
    props: { rocks: 110, pillars: 20, crystals: 45, scrap: 25, lamps: 8 },
    volcanoes: true,
    beacons: 4,
    pool: [['firedrone', 4], ['embermite', 3], ['magmagrunt', 4], ['shielder', 2], ['tank', 1.5], ['carrier', 1]],
    shop: { name: 'MAGMA MARKET', color: '#ff8c42', items: ['bot_laser', 'bot_bomber', 'up_firmware', 'up_armor', 'up_slot', 'backpack', 'repair', 'cell'] },
    boss: { kind: 'fire', name: 'INFERNUS', title: 'Heart of the Volcano', color: '#ff5a1a', hp: 5200, patterns: ['flame', 'meteor', 'radial', 'spiral', 'charge', 'summon'] },
  },
  {
    id: 'sky', name: 'Sky Islands', short: 'SKY',
    intro: 'Floating islands above a sea of clouds. Only a jetpack will carry you across the gaps.',
    sky: { top: '#2f86e8', horizon: '#dff2ff', bottom: '#f4faff' }, sun: '#fff6e0', sunDir: [0.5, 0.45, 0.6], stars: false,
    fog: '#cfe8fb', fogDensity: 0.0042,
    hemi: ['#ffffff', '#8ab4d8', 1.15], sunI: 2.2,
    ground: { low: '#5cae40', mid: '#6cc24a', high: '#8fd65a', rock: '#8a6a4a', patch: '#b9d86a', patch2: '#4a9a36' },
    hazard: { color: '#f4f9ff', glow: '#ffffff', dmg: 0, slow: 1, name: 'Cloud sea', void: true },
    accent: '#ffe14d', ambient: 'pollen', ambientColor: '#ffffff', hazardLevel: -18, sky3: true,
    terrain: { amp: 0, ridge: 0 },
    flora: { trees: 0, kind: 'round', trunk: '#6e4524', leaves: ['#3d9c33', '#57b83a', '#7cc444', '#2e8a39'], flowers: ['#ff5a7a', '#ffd23f', '#ffffff', '#b88cff'], grass: ['#5fae3a', '#78c24a'] },
    props: { rocks: 0, pillars: 0, crystals: 0, scrap: 0, lamps: 0 },
    beacons: 4,
    pool: [['hawk', 5], ['grunt', 3], ['sniper', 2], ['shielder', 1.5], ['carrier', 1]],
    shop: { name: 'CLOUD BAZAAR', color: '#ffe14d', items: ['bot_laser', 'bot_bomber', 'bot_rocket', 'up_firmware', 'up_overclock', 'up_split', 'rifle', 'launcher', 'repair', 'cell'] },
    boss: { kind: 'bird', name: 'STORMWING', title: 'Tyrant of the Skies', color: '#ffe14d', hp: 6600, patterns: ['vanish', 'dive', 'feathers', 'gust', 'spiral', 'summon'] },
  },
];

// Home base: a peaceful meadow in the middle of the world
const HUB = {
  id: 'hub', name: 'Home Base', short: 'HOME', hub: true,
  intro: 'Your house, your workshop, your squad. Five portals lead out into the world.',
  sky: { top: '#3d8be0', horizon: '#f2e6d0', bottom: '#a8cfe8' }, sun: '#fff0c8', sunDir: [0.55, 0.5, 0.6], stars: false,
  fog: '#b8d8f2', fogDensity: 0.0034,
  hemi: ['#eaf4ff', '#6a8a4a', 1.15], sunI: 2.3,
  ground: { low: '#55962f', mid: '#72bd40', high: '#a2d25a', rock: '#8e8a78', patch: '#d9c06a', patch2: '#448a2e' },
  hazard: { color: '#2f86c4', glow: '#6ad0ff', dmg: 0, slow: 0.55, name: 'Pond' },
  accent: '#3cf2ff', ambient: 'pollen', ambientColor: '#fff4a8',
  terrain: { amp: 0.55, ridge: 0.5 },
  flora: { trees: 160, kind: 'round', trunk: '#6e4524', leaves: ['#3d9c33', '#57b83a', '#2e8a39', '#7cc444'], flowers: ['#ff5a7a', '#ffd23f', '#b88cff', '#ffffff', '#ff9f43'], grass: ['#5fae3a', '#78c24a', '#4a9a30'] },
  props: { rocks: 25, pillars: 0, crystals: 0, scrap: 0, lamps: 10 },
  beacons: 0,
  pool: [['drone', 5], ['grunt', 3], ['swarmer', 2]],
  boss: { color: '#3cf2ff' },
};

// ───────────────────────── Companions ─────────────────────────
// tier 'simple' bots are crafted from scrap (anytime); 'premium' bots are only sold in shops.
const COMP_DEFS = {
  gunner: { name: 'Gunner Drone',   tier: 'simple',  hp: 45,  r: 0.45, color: '#6bff9e', orbit: 2.4, height: 2.3, spin: 0.9,  range: 36 },
  medic:  { name: 'Medic Bot',      tier: 'simple',  hp: 42,  r: 0.45, color: '#7dffd8', orbit: 3.0, height: 2.0, spin: -0.5, range: 0 },
  scout:  { name: 'Scout Bot',      tier: 'simple',  hp: 32,  r: 0.4,  color: '#ffe14d', orbit: 3.4, height: 3.6, spin: 1.2,  range: 30 },
  shield: { name: 'Aegis Orb',      tier: 'premium', hp: 90,  r: 0.6,  color: '#6bd8ff', orbit: 2.3, height: 0.8, spin: 1.6,  range: 0 },
  bubble: { name: 'Shield Bot',     tier: 'premium', hp: 70,  r: 0.5,  color: '#5ab8ff', orbit: 2.6, height: 2.5, spin: -0.8, range: 0 },
  tesla:  { name: 'Tesla Bot',      tier: 'premium', hp: 55,  r: 0.45, color: '#8ab4ff', orbit: 2.8, height: 2.6, spin: -0.7, range: 22 },
  rocket: { name: 'Rocket Mech',    tier: 'premium', hp: 95,  r: 0.6,  color: '#c6ff4d', orbit: 3.4, height: 2.9, spin: 0.4,  range: 46 },
  bomber: { name: 'Bomber Bot',     tier: 'premium', hp: 70,  r: 0.55, color: '#ff7a3d', orbit: 3.6, height: 4.4, spin: 0.5,  range: 34 },
  laser:  { name: 'Laser Sentinel', tier: 'premium', hp: 65,  r: 0.5,  color: '#ff6bf2', orbit: 2.6, height: 3.2, spin: 0.8,  range: 32 },
};
const COMP_DESC = {
  gunner: 'Hovers at your shoulder and peppers nearby enemies.',
  medic: 'Slowly repairs your hull and your squad with a beam.',
  scout: 'Fast and fragile. Pings hidden caches and Scrap Sprites onto your compass.',
  shield: 'Circles tightly around you, soaking up enemy fire.',
  bubble: 'Wraps you in an energy bubble that absorbs 30 damage, then recharges.',
  tesla: 'Arcs chain lightning through up to 4 nearby enemies.',
  rocket: 'Launches homing missiles that detonate with splash damage.',
  bomber: 'Flies over distant groups and drops bombs on them.',
  laser: 'Locks a searing continuous beam onto its target.',
};

// ───────────────────────── Weapons (one hotbar slot each) ─────────────────────────
const WEAPONS = {
  blaster:  { name: 'Pulse Blaster',   color: '#3cf2ff', rate: 6,   dmg: 10, speed: 150, pellets: 1, spread: 0.008, life: 1.4, desc: 'Reliable rapid-fire plasma.' },
  scatter:  { name: 'Scatter Blaster', color: '#ffb347', rate: 1.7, dmg: 7,  speed: 120, pellets: 8, spread: 0.085, life: 0.45, desc: 'Close-range burst of 8 pellets.' },
  rifle:    { name: 'Laser Rifle',     color: '#ff4df0', rate: 2.1, dmg: 38, speed: 420, pellets: 1, spread: 0.002, life: 0.8, desc: 'Precise long-range beam shots that hit hard.' },
  launcher: { name: 'Rocket Launcher', color: '#c6ff4d', rate: 1.0, dmg: 80, speed: 52,  pellets: 1, spread: 0.004, life: 3, rocket: true, splash: 5.5, desc: 'Explosive rockets. Keep your distance — the blast hurts you too.' },
};

// ───────────────────────── Crafting (Mechanic Room & field) ─────────────────────────
// Only simple bots can be built in the field. The Mechanic Room also builds base systems and the Skyrider.
const RECIPES = [
  { id: 'gunner', kind: 'companion', name: 'Gunner Drone', desc: COMP_DESC.gunner, cost: { scrap: 3, wire: 2 } },
  { id: 'medic',  kind: 'companion', name: 'Medic Bot',    desc: COMP_DESC.medic,  cost: { scrap: 3, circuit: 2 } },
  { id: 'scout',  kind: 'companion', name: 'Scout Bot',    desc: COMP_DESC.scout,  cost: { scrap: 2, wire: 1, servo: 1 } },

  { id: 'shieldgen', kind: 'base', name: 'Shield Generator', desc: 'Raises an energy dome around the house. Enemy shots and raiders cannot get through.', cost: { scrap: 12, circuit: 4, core: 2 } },
  { id: 'charger',   kind: 'base', name: 'Fast Chargers', desc: 'Upgrades the Charging Room: bots recharge 60% faster.', max: 2, cost: { wire: 5, circuit: 3, core: 1 } },
  { id: 'skyrider',  kind: 'vehicle', name: 'Skyrider', desc: 'Jet glider with twin plasma cannons. Press F (or RIDE) to deploy and fly; it takes the hits for you. If it is destroyed you are thrown clear.', cost: { scrap: 10, servo: 4, wire: 4, core: 3 } },
];

// Upgrades are only sold in shops (the price rises with each level)
const UPGRADES = {
  armor:     { name: 'Reinforced Plating',  desc: '+25 maximum hull.', max: 4 },
  overclock: { name: 'Overclocked Emitters', desc: '+20% fire rate for every weapon.', max: 3 },
  split:     { name: 'Split Emitter',       desc: '+1 Pulse Blaster projectile per shot.', max: 2 },
  thruster:  { name: 'Ion Thrusters',       desc: '+10% move speed, higher jump, faster dash recharge.', max: 2 },
  magnet:    { name: 'Salvage Magnet',      desc: 'Pulls in parts from much farther away.', max: 2 },
  firmware:  { name: 'Squad Firmware',      desc: '+30% companion damage and hull.', max: 3 },
  slot:      { name: 'Command Uplink',      desc: '+1 companion slot.', max: 2 },
};

// ───────────────────────── Shop catalogue (prices in Botbucks) ─────────────────────────
const SHOP_ITEMS = {
  repair:     { kind: 'supply', name: 'Repair Kit',  price: 25, desc: 'Takes one hotbar slot. Press R to restore 40 hull.' },
  cell:       { kind: 'supply', name: 'Plasma Cell', price: 20, desc: 'Takes one hotbar slot. Instantly recharges your plasma bomb.' },
  scatter:    { kind: 'weapon', price: 150 },
  rifle:      { kind: 'weapon', price: 260 },
  launcher:   { kind: 'weapon', price: 380 },
  jetpack:    { kind: 'gear', name: 'Jetpack', price: 350, desc: 'Hold Space (JUMP) in mid-air to fly. Fuel recharges on the ground. Needed for the Sky Islands.' },
  fireboots:  { kind: 'gear', name: 'Fire Boots', price: 250, desc: 'Heat-proof soles. Required to enter the Fiery Volcano — lava barely hurts.' },
  backpack:   { kind: 'gear', name: 'Backpack', price: 180, max: 3, desc: '+3 hotbar slots.' },
  bot_shield: { kind: 'bot', bot: 'shield', price: 200 },
  bot_bubble: { kind: 'bot', bot: 'bubble', price: 240 },
  bot_tesla:  { kind: 'bot', bot: 'tesla',  price: 280 },
  bot_rocket: { kind: 'bot', bot: 'rocket', price: 380 },
  bot_bomber: { kind: 'bot', bot: 'bomber', price: 420 },
  bot_laser:  { kind: 'bot', bot: 'laser',  price: 480 },
  up_armor:     { kind: 'upgrade', up: 'armor',     price: 140 },
  up_overclock: { kind: 'upgrade', up: 'overclock', price: 200 },
  up_split:     { kind: 'upgrade', up: 'split',     price: 240 },
  up_thruster:  { kind: 'upgrade', up: 'thruster',  price: 150 },
  up_magnet:    { kind: 'upgrade', up: 'magnet',    price: 90 },
  up_firmware:  { kind: 'upgrade', up: 'firmware',  price: 300 },
  up_slot:      { kind: 'upgrade', up: 'slot',      price: 380 },
};
