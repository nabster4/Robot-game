# SCRAPFORGE

A neon top-down robot shooter. Destroy enemy machines, salvage their parts, and craft a squad of
companion robots that fight at your side. Six sectors, six bosses, one machine uprising to end.

![genre](https://img.shields.io/badge/genre-twin--stick%20shooter-3cf2ff) ![tech](https://img.shields.io/badge/tech-vanilla%20JS%20%2B%20Canvas-ff8c42)

## Play

No build step and no dependencies. Open `index.html` in a modern desktop browser, or serve the folder:

```bash
npx http-server .     # or: python3 -m http.server
```

## Controls

| Key | Action |
| --- | --- |
| `W A S D` / arrows | Move |
| Mouse | Aim, hold left-click to fire |
| `Space` / `Shift` | Dash (brief invulnerability) |
| Right-click / `E` | Plasma bomb: area damage, and it wipes enemy bullets |
| `Q` | Use a repair kit |
| `Tab` / `I` | Workshop (inventory and crafting, pauses the game) |
| `Esc` / `P` | Pause |
| `M` | Mute |

## Features

- **Salvage system.** Seven part types (Scrap Plating, Copper Coil, Servo Motor, Logic Board, Focus Lens, Power Core, Quantum Chip). Each enemy class drops its own mix. Elites and bosses carry rare Quantum Chips. When a wave is cleared, leftover salvage is pulled to you automatically.
- **Workshop crafting.** Open it any time mid-fight. It always opens between sectors.
  - **6 companions:** Gunner Drone, Medic Bot, Aegis Orb (absorbs bullets), Tesla Bot (chain lightning), Rocket Mech (homing missiles), Laser Sentinel (continuous beam).
  - **7 upgrades:** plating, fire rate, split shot, thrusters, salvage magnet, squad firmware, extra companion slots.
  - **Supplies:** repair kits and plasma cells.
  - Dismantle a companion to get back 50% of its parts.
- **Companions have hull.** When one is destroyed it goes offline and reboots a few seconds later.
- **7 enemy classes:** Drones, kamikaze Swarmers, Grunts, telegraphed Snipers, Bulwarks with frontal energy shields, Crusher tanks, and Hive Carriers that launch swarms. Gold-ringed elites show up more often in later sectors.
- **6 sectors with their own themes and bosses:** Junklord, Forgemaster, Overseer, Cryotitan, Meltdown, and Omega Prime. Bosses cycle through radial bursts, spirals, aimed fans, charges, summons, and rotating death-lasers, and go into an enraged **Overdrive** at half health.
- **Difficulty ramps up** through enemy health, damage, speed, wave budgets, and elite frequency.
- **Effects and audio:** additive-blended particles, explosions, debris, scorch marks, screen shake, hit-stop, slow-motion boss kills, per-sector ambient weather (dust, embers, data-rain, snow), and fully synthesized Web Audio sound effects plus a procedural synthwave soundtrack.
- **Retry Sector** puts your inventory, upgrades and squad back to how they were at the start of the sector.

## Code layout

```
index.html        overlays (menu, pause, workshop, game over, victory)
style.css         UI styling
js/util.js        math helpers, input
js/data.js        parts, enemies, levels, companions, recipes (game balance lives here)
js/audio.js       synthesized SFX + music sequencer
js/fx.js          particles, glow sprites, ambient weather
js/art.js         procedural vector art & arena generation
js/entities.js    Player, Enemy, Boss, Companion
js/ui.js          canvas HUD + workshop/crafting UI
js/game.js        game state, waves, collisions, rendering, main loop
```
