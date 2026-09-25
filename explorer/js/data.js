'use strict';
// ───────────────────────── Robot parts ─────────────────────────
const PARTS = {
  scrap:   { name: 'Scrap Plating', color: '#aab6c8', desc: 'Bent armor plating. The backbone of every build.' },
  wire:    { name: 'Copper Coil',   color: '#ff9f43', desc: 'Salvaged wiring and conductive coils.' },
  servo:   { name: 'Servo Motor',   color: '#48dbfb', desc: 'Precision actuator. Makes things move.' },
  circuit: { name: 'Logic Board',   color: '#1dd1a1', desc: 'The brains of a robot. Mostly intact.' },
  lens:    { name: 'Focus Lens',    color: '#f368e0', desc: 'Optical crystal pulled from targeting arrays.' },
  core:    { name: 'Power Core',    color: '#feca57', desc: 'A humming energy cell. Handle with care.' },
  quantum: { name: 'Quantum Chip',  color: '#a55eea', desc: 'Exotic tech. Found on elites, bosses and golden caches.' },
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

// ───────────────────────── Zones ─────────────────────────
const ZONES = [
  {
    name: 'Scrapyard Outskirts',
    intro: 'A graveyard of broken machines under a dying sun.',
    sky: { top: '#1b2a4a', horizon: '#e27d4a', bottom: '#2a1a1e' }, sun: '#ffb070', sunDir: [0.6, 0.25, -0.75], stars: false,
    fog: '#7a5a58', fogDensity: 0.0085,
    hemi: ['#9ab4ff', '#4a3020', 0.9], sunI: 2.4,
    ground: { low: '#4a3a30', mid: '#6b5140', high: '#8a7a6a', rock: '#5a4e4a' },
    hazard: { color: '#1a2a2a', glow: '#3a6a60', dmg: 0, slow: 0.55, name: 'Oil slick' },
    accent: '#3cf2ff', ambient: 'dust',
    props: { rocks: 90, pillars: 30, crystals: 0, scrap: 60, lamps: 14 },
    beacons: 3,
    pool: [['drone', 6], ['swarmer', 2], ['grunt', 4]],
    boss: { name: 'JUNKLORD', title: 'Tyrant of the Heap', color: '#ff8c42', patterns: ['radial', 'aimed', 'summon', 'slam'] },
  },
  {
    name: 'Molten Foundry',
    intro: 'The great forges still burn. Do not touch the lava.',
    sky: { top: '#12060a', horizon: '#6a1e0c', bottom: '#1a0806' }, sun: '#ff6a2a', sunDir: [-0.4, 0.35, -0.8], stars: false,
    fog: '#3a1208', fogDensity: 0.011,
    hemi: ['#ff9a6a', '#200806', 0.7], sunI: 1.8,
    ground: { low: '#1e1412', mid: '#2e201c', high: '#4a3a34', rock: '#241a18' },
    hazard: { color: '#ff4a0a', glow: '#ff6a1a', dmg: 16, slow: 0.6, name: 'Lava' },
    accent: '#ff8c42', ambient: 'embers',
    props: { rocks: 110, pillars: 40, crystals: 0, scrap: 30, lamps: 10 },
    beacons: 3,
    pool: [['drone', 5], ['swarmer', 3], ['grunt', 4], ['sniper', 2]],
    boss: { name: 'FORGEMASTER', title: 'Smelter of Souls', color: '#ff5e1a', patterns: ['radial', 'spiral', 'charge', 'aimed', 'slam'] },
  },
  {
    name: 'Neon Datagrid',
    intro: 'A digital wasteland where the machine mind dreams.',
    sky: { top: '#05020e', horizon: '#3a0a5a', bottom: '#0a0414' }, sun: '#ff4df0', sunDir: [0.2, 0.3, 0.9], stars: true,
    fog: '#1a0830', fogDensity: 0.0095,
    hemi: ['#8a5aff', '#10041a', 0.8], sunI: 1.4,
    ground: { low: '#140a24', mid: '#1e1034', high: '#2e1a4a', rock: '#1a1028' },
    hazard: { color: '#2a0a4a', glow: '#b14dff', dmg: 10, slow: 0.7, name: 'Corrupted data' },
    accent: '#f72585', ambient: 'data', gridGlow: '#b14dff',
    props: { rocks: 50, pillars: 60, crystals: 60, scrap: 10, lamps: 20 },
    beacons: 4,
    pool: [['drone', 4], ['swarmer', 3], ['grunt', 3], ['sniper', 2], ['shielder', 2]],
    boss: { name: 'OVERSEER', title: 'The All-Seeing Eye', color: '#f72585', patterns: ['spiral', 'aimed', 'laser', 'summon'] },
  },
  {
    name: 'Cryo Vault',
    intro: 'Frozen research labs, buried under a century of ice.',
    sky: { top: '#3a6a9a', horizon: '#cfe8ff', bottom: '#8ab0cc' }, sun: '#ffffff', sunDir: [0.5, 0.5, 0.5], stars: false,
    fog: '#9ab8d0', fogDensity: 0.0105,
    hemi: ['#cfe6ff', '#3a5a7a', 0.75], sunI: 1.7,
    ground: { low: '#6a88a0', mid: '#a4bccf', high: '#d2e0ec', rock: '#50708a' },
    hazard: { color: '#2a5a7a', glow: '#8ae9ff', dmg: 6, slow: 0.45, name: 'Freezing water' },
    accent: '#8ae9ff', ambient: 'snow',
    props: { rocks: 80, pillars: 30, crystals: 70, scrap: 20, lamps: 12 },
    beacons: 4,
    pool: [['drone', 3], ['swarmer', 3], ['grunt', 3], ['sniper', 2], ['shielder', 2], ['tank', 1.5]],
    boss: { name: 'CRYOTITAN', title: 'Frozen Colossus', color: '#4dd8ff', patterns: ['radial', 'charge', 'laser', 'spiral', 'slam'] },
  },
  {
    name: 'Reactor Core',
    intro: 'Toxic runoff and a reactor on the edge of meltdown.',
    sky: { top: '#0a1406', horizon: '#4a6a10', bottom: '#0c1206' }, sun: '#d4ff3c', sunDir: [-0.6, 0.3, 0.6], stars: false,
    fog: '#223208', fogDensity: 0.011,
    hemi: ['#c8ff7a', '#0c1406', 0.75], sunI: 1.6,
    ground: { low: '#1c2410', mid: '#2c3818', high: '#48562a', rock: '#20281a' },
    hazard: { color: '#3aff1a', glow: '#8aff2a', dmg: 14, slow: 0.6, name: 'Acid' },
    accent: '#b8ff4d', ambient: 'embers',
    props: { rocks: 80, pillars: 45, crystals: 30, scrap: 40, lamps: 16 },
    beacons: 4,
    pool: [['drone', 3], ['swarmer', 3], ['grunt', 3], ['sniper', 2], ['shielder', 2], ['tank', 1.5], ['carrier', 1.2]],
    boss: { name: 'MELTDOWN', title: 'Critical Mass', color: '#c6ff1a', patterns: ['spiral', 'laser', 'summon', 'radial', 'aimed', 'slam'] },
  },
  {
    name: 'The Nexus',
    intro: 'The heart of the machine uprising. End it here.',
    sky: { top: '#020104', horizon: '#3a0612', bottom: '#050103' }, sun: '#ff2a55', sunDir: [0, 0.4, -1], stars: true,
    fog: '#1a0409', fogDensity: 0.01,
    hemi: ['#ff6a8a', '#0a0206', 0.65], sunI: 1.5,
    ground: { low: '#100a0e', mid: '#1c1218', high: '#2e2028', rock: '#18101a' },
    hazard: { color: '#ff1a3a', glow: '#ff2a55', dmg: 18, slow: 0.6, name: 'Plasma' },
    accent: '#ff2a55', ambient: 'data', gridGlow: '#ff2a55',
    props: { rocks: 60, pillars: 70, crystals: 50, scrap: 30, lamps: 20 },
    beacons: 4,
    pool: [['drone', 3], ['swarmer', 3], ['grunt', 3], ['sniper', 2.5], ['shielder', 2.5], ['tank', 2], ['carrier', 1.5]],
    boss: { name: 'OMEGA PRIME', title: 'Mind of the Machine', color: '#ff2a55', patterns: ['radial', 'spiral', 'aimed', 'laser', 'charge', 'summon', 'slam'] },
  },
];

// ───────────────────────── Companions ─────────────────────────
const COMP_DEFS = {
  gunner: { name: 'Gunner Drone',   hp: 60,  r: 0.45, color: '#6bff9e', orbit: 2.4, height: 2.3, spin: 0.9,  range: 40 },
  medic:  { name: 'Medic Bot',      hp: 55,  r: 0.45, color: '#7dffd8', orbit: 3.0, height: 2.0, spin: -0.5, range: 0 },
  shield: { name: 'Aegis Orb',      hp: 110, r: 0.6,  color: '#6bd8ff', orbit: 2.3, height: 0.8, spin: 1.6,  range: 0 },
  tesla:  { name: 'Tesla Bot',      hp: 65,  r: 0.45, color: '#8ab4ff', orbit: 2.8, height: 2.6, spin: -0.7, range: 22 },
  rocket: { name: 'Rocket Mech',    hp: 120, r: 0.6,  color: '#c6ff4d', orbit: 3.4, height: 2.9, spin: 0.4,  range: 50 },
  laser:  { name: 'Laser Sentinel', hp: 75,  r: 0.5,  color: '#ff6bf2', orbit: 2.6, height: 3.2, spin: 0.8,  range: 34 },
};

// ───────────────────────── Crafting recipes ─────────────────────────
const RECIPES = [
  { id: 'gunner', kind: 'companion', name: 'Gunner Drone',   desc: 'Hovers at your shoulder and peppers the nearest enemy.', cost: { scrap: 4, wire: 3, circuit: 1 } },
  { id: 'medic',  kind: 'companion', name: 'Medic Bot',      desc: 'Projects a repair beam that restores your hull and your squad.', cost: { scrap: 3, circuit: 3, core: 1 } },
  { id: 'shield', kind: 'companion', name: 'Aegis Orb',      desc: 'Circles tightly around you, soaking up enemy fire.', cost: { scrap: 6, servo: 2, core: 1 } },
  { id: 'tesla',  kind: 'companion', name: 'Tesla Bot',      desc: 'Arcs chain lightning through up to 4 nearby enemies.', cost: { wire: 6, circuit: 2, core: 1 } },
  { id: 'rocket', kind: 'companion', name: 'Rocket Mech',    desc: 'Launches homing missiles that detonate with splash damage.', cost: { scrap: 6, servo: 3, wire: 2, core: 2 } },
  { id: 'laser',  kind: 'companion', name: 'Laser Sentinel', desc: 'Locks a searing continuous beam onto its target.', cost: { lens: 3, circuit: 3, core: 2, quantum: 1 } },

  { id: 'armor',     kind: 'upgrade', name: 'Reinforced Plating',  desc: '+25 maximum hull.', max: 4, cost: { scrap: 8, servo: 2 } },
  { id: 'overclock', kind: 'upgrade', name: 'Overclocked Blaster', desc: '+20% blaster fire rate.', max: 3, cost: { wire: 3, circuit: 3, core: 1 } },
  { id: 'split',     kind: 'upgrade', name: 'Split Emitter',       desc: '+1 projectile per shot.', max: 2, cost: { lens: 2, circuit: 2, servo: 1 } },
  { id: 'thruster',  kind: 'upgrade', name: 'Ion Thrusters',       desc: '+10% move speed, higher jump, faster dash recharge.', max: 2, cost: { servo: 3, wire: 2 } },
  { id: 'magnet',    kind: 'upgrade', name: 'Salvage Magnet',      desc: 'Pulls in parts from much farther away.', max: 2, cost: { wire: 4, scrap: 2 } },
  { id: 'firmware',  kind: 'upgrade', name: 'Squad Firmware',      desc: '+30% companion damage and hull.', max: 3, cost: { circuit: 4, quantum: 1 } },
  { id: 'slot',      kind: 'upgrade', name: 'Command Uplink',      desc: '+1 companion slot.', max: 2, cost: { circuit: 3, core: 2, quantum: 1 } },

  { id: 'repair', kind: 'item', name: 'Repair Kit',  desc: 'Use in the field to restore 40 hull.', cost: { scrap: 3, wire: 2 } },
  { id: 'cell',   kind: 'item', name: 'Plasma Cell', desc: 'Instantly recharges your plasma grenade when it is empty.', cost: { core: 1, wire: 1 } },
];
