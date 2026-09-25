# SCRAPFORGE

Two games in one repo:

- **[Scrapforge](index.html)**: the original neon top-down (twin-stick) shooter.
- **[Scrapforge: Outlands](explorer/index.html)**: a **3D first-person adventure** version where you explore open zones.

Both use the same concept: destroy robots, salvage their parts, and craft companion robots and upgrades.

---

## Scrapforge: Outlands (3D first-person)

Explore six open alien zones on foot. Each zone has a sky, fog, weather, and a hazard (oil slicks,
lava, corrupted data, freezing water, acid, plasma).

**Each zone plays out like this**
1. **Explore.** Find the zone's **signal beacons** by following their light pillars, using the compass and radar. Open hidden **salvage caches** (one per zone is golden and holds Quantum Chips).
2. **Uplink.** Activate a beacon and stay inside its ring for 22 seconds while machines warp in to stop you.
3. **Core Gate.** When every beacon is online, the force-field dome over the central arena drops.
4. **Boss.** Step in to face the zone's boss. Attacks include ground-hugging bullet rings, spirals, aimed fans, charges, summons, **rotating lasers and shockwave slams you have to jump over**, and an enraged Overdrive phase.
5. **Extract.** Walk into the portal to reach the Workshop, then deploy to the next zone.

**Open-world systems (inspired by *Zelda: Tears of the Kingdom*)**
- **Peaceful camps:** robots hang out around scrap braziers and ignore you until you attack one. Then the whole camp turns hostile. Starting a beacon uplink draws every robot nearby, and hostile robots give up if you get far enough away.
- **Stamina wheel:** a Zelda-style ring by the crosshair. Sprinting, climbing and gliding use stamina, and running out leaves you exhausted until it refills.
- **Climbing:** walk into rocks, pillars and beacons to climb them, stand on top, and leap off.
- **Paraglider:** press Space in mid-air to glide, and ride the hot-air updrafts over camp braziers.
- **Sky launch:** activated beacons work like Skyview Towers. They launch you high into the sky and reveal nearby caches on your compass.
- **Sky islands:** floating ruins with golden caches, reached by launching and gliding (or by Skyrider).
- **Scrap Sprites:** hidden Korok-like collectibles on pillar tops, rocks and islands. Every 3 you find adds a stamina vessel.
- **Focus:** shooting while gliding or falling slows time.
- **Third-person view:** press `V` (or use the pause menu, or the VIEW touch button) to see your mech in an over-the-shoulder camera that avoids walls.

**Skyrider:** craft a jet glider in the workshop's Vehicles tab. Press `F` to deploy it or dock it anywhere. It flies where you look (`Space` climbs, `C` dives, `Shift` boosts), and its twin cannons fire at the crosshair. It takes the hits meant for you and repairs itself while docked. If it's destroyed, you're thrown clear and can glide down.

**Music:** three composed themes (an exploration theme, a combat chorus hook and a boss theme) with drum fills and echo on the lead. Each zone plays them in its own key and tempo.

**Controls:** `WASD` move · `Shift` sprint · mouse look / left-click fire · `Space` jump, and glide in mid-air · `Q` dash ·
right-click or `G` plasma grenade · `E` interact or launch · `F` Skyrider · `V` camera view · `R` repair kit · `Tab` workshop ·
`Esc` pause and settings (sensitivity, third-person, invert Y, performance mode) · `M` mute.

**On a phone or tablet** (landscape): touch controls turn on automatically.
- Left thumb: floating move stick (push to the rim to sprint). Right side: drag to look.
- **FIRE**: hold to shoot, and drag it to aim at the same time. **JUMP** (tap it again in mid-air to glide), **DASH** and **BOMB** show cooldown rings.
- **RIDE** deploys or docks the Skyrider (hold **UP**/**DIVE** while flying), and **VIEW** switches between first and third person.
- **USE** lights up next to caches and beacons. **FIX** uses a repair kit, **CRAFT** opens the workshop, and **❚❚** pauses.
- Light aim assist is on, and performance mode is on by default (no shadows, lower resolution, no MSAA).
- The game asks you to rotate to landscape, goes fullscreen where the browser allows it, and pauses when you switch apps.
- Add `?touch=1` or `?touch=0` to the URL to force touch controls on or off.

To play on a phone, the files need to be served over the web, for example with GitHub Pages
(repo Settings → Pages → deploy from this branch) and then opening `…/explorer/`.
On iOS, "Add to Home Screen" gives a fullscreen, app-like launch.

**Tech:** Three.js r158 (vendored in `explorer/vendor/`, MIT) with a custom HDR bloom and ACES tone-mapping
pipeline, procedural terrain and props, GPU particles, instanced debris, dynamic flash lights, shadows, and
music that gets more intense when machines are hunting you. Everything is procedural. There are no model,
texture or audio files, and it still runs from `file://` without a build step.

```
explorer/js/world.js     terrain, sky, hazards, props, beacons, caches, arena dome, portal
explorer/js/models.js    low-poly robot, boss, companion, weapon and pickup models
explorer/js/entities.js  Player controller, Enemy AI, Boss patterns, Companions
explorer/js/post.js      bloom and tone-mapping post-processing
explorer/js/fx.js        particles, debris, lights, lightning, weather
explorer/js/game.js      zone flow, projectiles, collisions, camera, main loop
explorer/js/ui.js        HUD (compass, radar, objectives, feed) and workshop
```

---

## Scrapforge (top-down original)

A neon top-down robot shooter. Destroy enemy machines, salvage their parts, and craft a squad of
companion robots that fight at your side. Six sectors, six bosses, one machine uprising to end.

![genre](https://img.shields.io/badge/genre-twin--stick%20shooter-3cf2ff) ![tech](https://img.shields.io/badge/tech-vanilla%20JS%20%2B%20Canvas-ff8c42)

## Play

No build step. Open `index.html` (top-down) or `explorer/index.html` (3D) in a modern desktop browser, or serve the folder:

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
