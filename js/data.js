'use strict';
// ───────────────────────── Robot parts ─────────────────────────
const PARTS = {
  scrap:   { name: 'Scrap Plating', color: '#aab6c8', desc: 'Bent armor plating. The backbone of every build.' },
  wire:    { name: 'Copper Coil',   color: '#ff9f43', desc: 'Salvaged wiring and conductive coils.' },
  servo:   { name: 'Servo Motor',   color: '#48dbfb', desc: 'Precision actuator. Makes things move.' },
  circuit: { name: 'Logic Board',   color: '#1dd1a1', desc: 'The brains of a robot. Mostly intact.' },
  lens:    { name: 'Focus Lens',    color: '#f368e0', desc: 'Optical crystal pulled from targeting arrays.' },
  core:    { name: 'Power Core',    color: '#feca57', desc: 'A humming energy cell. Handle with care.' },
  quantum: { name: 'Quantum Chip',  color: '#a55eea', desc: 'Exotic tech. Only elites and bosses carry these.' },
};
const PART_ORDER = ['scrap', 'wire', 'servo', 'circuit', 'lens', 'core', 'quantum'];

// ───────────────────────── Enemies ─────────────────────────
// drops: [part, chance, min, max]
const ENEMY_TYPES = {
  drone: {
    name: 'Drone', hp: 22, speed: 150, r: 13, dmg: 10, color: '#ff4d6d', ai: 'chase', cost: 1, score: 10,
    drops: [['scrap', 0.55, 1, 1], ['wire', 0.35, 1, 1], ['circuit', 0.1, 1, 1]],
  },
  swarmer: {
    name: 'Swarmer', hp: 10, speed: 215, r: 9, dmg: 14, color: '#ffd23f', ai: 'swarm', cost: 0.5, score: 5,
    drops: [['wire', 0.25, 1, 1], ['scrap', 0.2, 1, 1], ['circuit', 0.05, 1, 1]],
  },
  grunt: {
    name: 'Grunt', hp: 45, speed: 85, r: 17, dmg: 9, color: '#ff8c42', ai: 'grunt', fireCd: 1.7, bulletSpeed: 330, cost: 2, score: 20,
    drops: [['scrap', 0.8, 1, 2], ['servo', 0.35, 1, 1], ['wire', 0.35, 1, 1], ['circuit', 0.15, 1, 1]],
  },
  sniper: {
    name: 'Sniper', hp: 36, speed: 100, r: 15, dmg: 22, color: '#c77dff', ai: 'sniper', fireCd: 3.2, bulletSpeed: 880, cost: 3, score: 30,
    drops: [['lens', 0.55, 1, 1], ['circuit', 0.4, 1, 1], ['scrap', 0.4, 1, 1]],
  },
  shielder: {
    name: 'Bulwark', hp: 85, speed: 72, r: 19, dmg: 9, color: '#f72585', ai: 'shield', fireCd: 2.3, bulletSpeed: 310, cost: 4, score: 40,
    drops: [['circuit', 0.6, 1, 2], ['core', 0.22, 1, 1], ['servo', 0.45, 1, 1], ['lens', 0.15, 1, 1]],
  },
  tank: {
    name: 'Crusher', hp: 210, speed: 46, r: 28, dmg: 11, color: '#ff3b3b', ai: 'tank', fireCd: 2.4, bulletSpeed: 260, cost: 6, score: 80,
    drops: [['scrap', 1, 2, 4], ['servo', 0.7, 1, 2], ['core', 0.4, 1, 1]],
  },
  carrier: {
    name: 'Hive Carrier', hp: 170, speed: 55, r: 27, dmg: 10, color: '#ff6b35', ai: 'carrier', fireCd: 4.5, cost: 7, score: 90,
    drops: [['core', 0.6, 1, 1], ['circuit', 0.6, 1, 2], ['wire', 0.7, 1, 3], ['lens', 0.2, 1, 1]],
  },
};

// ───────────────────────── Levels ─────────────────────────
const LEVELS = [
  {
    name: 'Scrapyard Outskirts',
    theme: { bg1: '#0a1122', bg2: '#0f1a33', grid: '#1b3a63', accent: '#3cf2ff', light: '#3cf2ff', ambient: 'dust' },
    waves: 3,
    pool: [['drone', 6], ['swarmer', 2], ['grunt', 3]],
    boss: { name: 'JUNKLORD', title: 'Tyrant of the Heap', color: '#ff8c42', patterns: ['radial', 'aimed', 'summon', 'charge'] },
  },
  {
    name: 'Molten Foundry',
    theme: { bg1: '#150806', bg2: '#24100a', grid: '#5a2612', accent: '#ff8c42', light: '#ff6a1a', ambient: 'embers' },
    waves: 3,
    pool: [['drone', 5], ['swarmer', 3], ['grunt', 4], ['sniper', 2]],
    boss: { name: 'FORGEMASTER', title: 'Smelter of Souls', color: '#ff5e1a', patterns: ['radial', 'spiral', 'charge', 'aimed'] },
  },
  {
    name: 'Neon Datagrid',
    theme: { bg1: '#0d0618', bg2: '#170a2a', grid: '#4a1a6e', accent: '#f72585', light: '#b14dff', ambient: 'data' },
    waves: 4,
    pool: [['drone', 4], ['swarmer', 3], ['grunt', 3], ['sniper', 2], ['shielder', 2]],
    boss: { name: 'OVERSEER', title: 'The All-Seeing Eye', color: '#f72585', patterns: ['spiral', 'aimed', 'laser', 'summon'] },
  },
  {
    name: 'Cryo Vault',
    theme: { bg1: '#06121a', bg2: '#0b1f2c', grid: '#1f5670', accent: '#8ae9ff', light: '#8ae9ff', ambient: 'snow' },
    waves: 4,
    pool: [['drone', 3], ['swarmer', 3], ['grunt', 3], ['sniper', 2], ['shielder', 2], ['tank', 1.5]],
    boss: { name: 'CRYOTITAN', title: 'Frozen Colossus', color: '#4dd8ff', patterns: ['radial', 'charge', 'laser', 'spiral'] },
  },
  {
    name: 'Reactor Core',
    theme: { bg1: '#0c1406', bg2: '#15220a', grid: '#3b5a12', accent: '#b8ff4d', light: '#d4ff3c', ambient: 'embers' },
    waves: 5,
    pool: [['drone', 3], ['swarmer', 3], ['grunt', 3], ['sniper', 2], ['shielder', 2], ['tank', 1.5], ['carrier', 1.2]],
    boss: { name: 'MELTDOWN', title: 'Critical Mass', color: '#c6ff1a', patterns: ['spiral', 'laser', 'summon', 'radial', 'aimed'] },
  },
  {
    name: 'The Nexus',
    theme: { bg1: '#08060f', bg2: '#140b1c', grid: '#5a1030', accent: '#ff2a55', light: '#ff2a55', ambient: 'data' },
    waves: 5,
    pool: [['drone', 3], ['swarmer', 3], ['grunt', 3], ['sniper', 2.5], ['shielder', 2.5], ['tank', 2], ['carrier', 1.5]],
    boss: { name: 'OMEGA PRIME', title: 'Mind of the Machine', color: '#ff2a55', patterns: ['radial', 'spiral', 'aimed', 'laser', 'charge', 'summon'] },
  },
];

// ───────────────────────── Companions ─────────────────────────
const COMP_DEFS = {
  gunner: { name: 'Gunner Drone',   hp: 60,  r: 11, color: '#6bff9e', orbit: 70,  spin: 1.3,  range: 520 },
  medic:  { name: 'Medic Bot',      hp: 55,  r: 12, color: '#7dffd8', orbit: 96,  spin: -0.6, range: 0 },
  shield: { name: 'Aegis Orb',      hp: 110, r: 15, color: '#6bd8ff', orbit: 48,  spin: 2.4,  range: 0 },
  tesla:  { name: 'Tesla Bot',      hp: 65,  r: 12, color: '#8ab4ff', orbit: 86,  spin: -0.9, range: 280 },
  rocket: { name: 'Rocket Mech',    hp: 120, r: 15, color: '#c6ff4d', orbit: 118, spin: 0.45, range: 650 },
  laser:  { name: 'Laser Sentinel', hp: 75,  r: 13, color: '#ff6bf2', orbit: 80,  spin: 1.0,  range: 440 },
};

// ───────────────────────── Crafting recipes ─────────────────────────
const RECIPES = [
  { id: 'gunner', kind: 'companion', name: 'Gunner Drone',   desc: 'Orbits you and peppers the nearest enemy with rapid fire.', cost: { scrap: 4, wire: 3, circuit: 1 } },
  { id: 'medic',  kind: 'companion', name: 'Medic Bot',      desc: 'Projects a repair beam that restores your hull and your squad.', cost: { scrap: 3, circuit: 3, core: 1 } },
  { id: 'shield', kind: 'companion', name: 'Aegis Orb',      desc: 'Circles tightly around you, soaking up enemy fire.', cost: { scrap: 6, servo: 2, core: 1 } },
  { id: 'tesla',  kind: 'companion', name: 'Tesla Bot',      desc: 'Arcs chain lightning through up to 4 nearby enemies.', cost: { wire: 6, circuit: 2, core: 1 } },
  { id: 'rocket', kind: 'companion', name: 'Rocket Mech',    desc: 'Launches homing missiles that detonate with splash damage.', cost: { scrap: 6, servo: 3, wire: 2, core: 2 } },
  { id: 'laser',  kind: 'companion', name: 'Laser Sentinel', desc: 'Locks a searing continuous beam onto its target.', cost: { lens: 3, circuit: 3, core: 2, quantum: 1 } },

  { id: 'armor',     kind: 'upgrade', name: 'Reinforced Plating',  desc: '+25 maximum hull.', max: 4, cost: { scrap: 8, servo: 2 } },
  { id: 'overclock', kind: 'upgrade', name: 'Overclocked Blaster', desc: '+20% blaster fire rate.', max: 3, cost: { wire: 3, circuit: 3, core: 1 } },
  { id: 'split',     kind: 'upgrade', name: 'Split Emitter',       desc: '+1 projectile per shot.', max: 2, cost: { lens: 2, circuit: 2, servo: 1 } },
  { id: 'thruster',  kind: 'upgrade', name: 'Ion Thrusters',       desc: '+10% move speed and faster dash recharge.', max: 2, cost: { servo: 3, wire: 2 } },
  { id: 'magnet',    kind: 'upgrade', name: 'Salvage Magnet',      desc: 'Pulls in parts from much farther away.', max: 2, cost: { wire: 4, scrap: 2 } },
  { id: 'firmware',  kind: 'upgrade', name: 'Squad Firmware',      desc: '+30% companion damage and hull.', max: 3, cost: { circuit: 4, quantum: 1 } },
  { id: 'slot',      kind: 'upgrade', name: 'Command Uplink',      desc: '+1 companion slot.', max: 2, cost: { circuit: 3, core: 2, quantum: 1 } },

  { id: 'repair', kind: 'item', name: 'Repair Kit',  desc: 'Press Q in combat to restore 40 hull.', cost: { scrap: 3, wire: 2 } },
  { id: 'cell',   kind: 'item', name: 'Plasma Cell', desc: 'Instantly refills your plasma bomb charge. Auto-used when you press right-click on empty.', cost: { core: 1, wire: 1 } },
];
