# SCRAPFORGE

Two games in one repo:

- **[Scrapforge](index.html)**: the original neon top-down (twin-stick) shooter.
- **[Scrapforge: Outlands](explorer/index.html)**: a **3D first-person adventure** version where you explore open zones.

Both use the same concept: destroy robots, salvage their parts, and craft companion robots and upgrades.

---

## Scrapforge: Outlands (3D first-person)

**Home base** sits in the middle of the world: a house with three rooms, surrounded by five biome portals.
- **Mechanic Room:** build simple bots (Gunner, Medic, Scout) from scrap, the **Shield Generator** (a dome around the house that blocks raiders and their shots), and **Fast Chargers**.
- **Charging Room:** bots dock on glowing pads here to recharge. Bots you're not using wait here too.
- **Storage Room:** deposit and withdraw anything. Storage is unlimited.
- Progress saves every time you get home (**Continue** on the main menu). Once you've beaten a boss, robots sometimes raid the base.

**Five biomes**, unlocked in order by beating each boss: **Green Plains → Snowy Plains → Mountains → Fiery Volcano → Sky Islands**.
Each has its own colour palette (green meadows with leafy trees and flowers, white and blue snow with snowy pines and snowmen,
grey and brown peaks with snow caps, red and orange lava fields, and sky-blue floating green islands over a cloud sea), its own
robot variants (frost shots slow you, fire shots set you burning), its own **shop** by the spawn point, and a **home portal**.
The Volcano portal needs **Fire Boots** and the Sky Islands portal needs the **Jetpack** (both sold in the Mountains shop).
In the Sky Islands, falling into the clouds drops you back on the last island you stood on, for some damage.

**Economy and inventory**
- **Hotbar:** 9 slots (more with Backpacks). Parts and supplies stack up to 20 per slot; weapons take a slot each. Select with `1`–`9`, `0` or the mouse wheel (tap a slot on touch), and drop one with `X`. When the hotbar is full, pickups stay on the ground.
- **Selling:** in a shop, drag the slider on any stack to choose how many to sell. Storage lets you take items back one at a time or 20 at once.
- **Botbucks:** sell materials at any shop. Coins also drop from robots, caches, beacons and bosses.
- **Shops** sell weapons (**Scatter Blaster, Laser Rifle, Rocket Launcher**), gear (**Jetpack, Fire Boots, Backpack**), supplies (repair kits, plasma cells), upgrades, and premium bots (Aegis Orb, **Shield Bot**, Tesla Bot, Rocket Mech, **Bomber Bot**, Laser Sentinel).

**Companion batteries:** bots drain their battery out in the biomes. As it drains they take more damage and aim worse. Below 15% a bot flies all the way back to the biome's home portal, travels through it (about 8 s), recharges in the Charging Room, travels back out through the portal, and flies to you. Bots are weaker overall and the Medic heals at half its old rate, so you do most of the fighting.

**Bots at home & swapping:** when your squad is full, new bots wait at home base. From the field kit (`Tab`) or any room, pick a squad bot to swap out: it flies home through the portal first, and only then does the other bot set off and travel out to you. **Home** sends a bot back to rest; **Send out** calls one from home when you have a free slot.

**Player:** climbing works on rocks, pillars and cliffs (not building walls or trees) and is slower than walking. Fall damage grows with the height of the drop (short drops, gliding, jetpacking and water landings are safe). Aim assist curves your shots into nearby enemies. Your plasma bombs and rockets hurt you too if you're in the blast. The plasma bomb is a small blast that softens a group rather than wiping it out, and takes about 17 s to recharge. Hold `Space` (or **JUMP**) in mid-air to fly with the jetpack; its fuel refills on the ground, and a quick tap still opens the glider.

**Each biome plays out like this**
1. **Explore.** Find the **signal beacons** by following their light pillars, using the compass and radar. Open hidden **salvage caches**.
2. **Uplink.** Activate a beacon and stay inside its ring for 22 seconds while machines warp in to stop you.
3. **Core Gate.** When every beacon is online, the dome over the central arena drops.
4. **Boss.** Step in and the dome **seals behind you and your bots**. No one gets out until the boss is destroyed. Five distinct bosses, each harder than the last:
   **Brambleback** (an iron boar that charges, pounces and stomps), **Glacieros** (an ice golem whose frost waves and beams **freeze you solid**, then it attacks),
   **Colossus** (a 20 m walker that hurls boulders and stomps shockwaves), **Infernus** (a flaming magma demon with flamethrowers, meteor rain and burning ground) and
   **Stormwing** (a mechanical bird that **vanishes, reappears behind you** and dives, with feather volleys and wind gusts). Each has an enraged Overdrive phase.
5. **Home.** Beating the boss opens the next biome's portal. Step into the portal to go home.

**Progress is remembered:** each biome keeps its layout between visits, along with the beacons you've activated, caches you've opened and Scrap Sprites you've found. Leave halfway through and pick up where you left off (it's saved with your game too).

**Portals:** just walk into a portal to travel. Locked portals tell you what they need.

**Open-world systems (inspired by *Zelda: Tears of the Kingdom*)**
- **Robot camps:** robots hang out around scrap braziers. Come within range and a Zelda-style alarm meter ("?") fills over their heads, faster the closer you are. When it tops out, the whole camp attacks. Shooting one or starting a beacon uplink sets them off instantly, and hostile robots give up if you get far enough away.
- **Stamina wheel:** a Zelda-style ring by the crosshair. Sprinting, climbing and gliding use stamina, and running out leaves you exhausted until it refills.
- **Climbing:** walk into rocks, pillars and beacons to climb them (slower than walking), stand on top, and leap off. Building walls and trees can't be climbed.
- **Paraglider:** press Space in mid-air to glide, and ride the hot-air updrafts over camp braziers.
- **Sky launch:** activated beacons work like Skyview Towers. They launch you high into the sky and reveal nearby caches on your compass.
- **Sky islands:** floating ruins with golden caches, reached by launching and gliding (or with the jetpack).
- **Scrap Sprites:** hidden Korok-like collectibles on pillar tops, rocks and islands. Every 3 you find adds a stamina vessel.
- **Focus:** shooting while gliding or falling slows time.
- **Articulated mech:** in third person the player mech has a full joint chain: hips, knees, ankles and toes; a two-part spine, neck and head; shoulders, elbows and wrists. Procedural animation gives it walk and sprint gaits with stride-matched hip bob, pelvis sway and twist, counter-rotating chest, opposite arm swing and toe push-off. It leans into acceleration and turns, crouches on landing, and has distinct jump, fall, dash, glide, climb and riding poses. It brings up a two-handed aim when you fire, and its head tracks the camera. Every joint eases toward its target pose, so state changes blend smoothly, and footsteps are synced to the stride.
- **Third-person view:** press `V` (or use the pause menu, or the VIEW touch button) to see your mech in an over-the-shoulder camera that avoids walls.

**Music:** home base and every biome have their own theme song, each with its own melody, tempo, lead instrument and groove: a bouncy bell tune at home, a skipping whistle tune in the Plains, music-box bells in the snow, a brass march in the Mountains, driving chiptune rock in the Volcano, and floating arpeggios in the Sky Islands. Combat and boss fights switch to shared action themes.

**Controls:** `WASD` move · `Shift` sprint · mouse look / left-click fire · `Space` jump, tap in mid-air to glide, hold for jetpack · `Q` dash ·
`1`–`9` / wheel hotbar · `X` drop item · right-click or `G` plasma bomb · `E` interact (rooms, shops, caches, beacons) · walk into portals to travel · `V` camera view · `R` repair kit · `Tab` field kit (build simple bots) ·
`Esc` pause and settings (sensitivity, third-person, invert Y, performance mode) · `M` mute.

**On a phone or tablet** (landscape): touch controls turn on automatically.
- Left thumb: floating move stick (push to the rim to sprint). Right side: drag to look.
- **FIRE**: hold to shoot, and drag it to aim at the same time. **JUMP** (tap it again in mid-air to glide), **DASH** and **BOMB** show cooldown rings.
- **VIEW** switches between first and third person.
- **USE** lights up next to rooms, portals, shops, caches and beacons. Tap a hotbar slot to hold that item. Hold **JUMP** in mid-air for the jetpack. **FIX** uses a repair kit, **CRAFT** opens the field kit, and **❚❚** pauses.
- Light aim assist is on, and performance mode is on by default (no shadows, lower resolution, no MSAA).
- The game asks you to rotate to landscape, goes fullscreen where the browser allows it, and pauses when you switch apps.
- Add `?touch=1` or `?touch=0` to the URL to force touch controls on or off.

**Easiest way to play on a phone or tablet:** download **`Scrapforge-3D.html`** from the repo root
(or take it out of the downloaded zip), then open it on the device with Chrome or Samsung Internet.
It's one self-contained file, with the styles, game code and 3D library built in, so it works when opened
straight from the Downloads folder. (Opening `explorer/index.html` that way shows only unstyled text,
because mobile browsers can't load the files beside it. The root `index.html` is the original 2D game,
which has no touch controls.) The first launch needs internet only for the fonts, and it falls back
to built-in fonts offline. Rebuild the file after changing the game with `python3 tools/build_standalone.py`.

Alternatively, serve the files over the web, for example with GitHub Pages
(repo Settings → Pages → deploy from this branch) and then opening `…/explorer/`.
On iOS, "Add to Home Screen" gives a fullscreen, app-like launch.

**Tech:** Three.js r158 (vendored in `explorer/vendor/`, MIT) with a custom HDR bloom and ACES tone-mapping
pipeline, procedural terrain and props, GPU particles, instanced debris, dynamic flash lights, shadows, and
music that gets more intense when machines are hunting you. Everything is procedural. There are no model,
texture or audio files, and it still runs from `file://` without a build step.

```
explorer/js/world.js     home base (house, rooms, portals, shield), biome terrain, trees, sky islands, shops, arena dome
explorer/js/models.js    low-poly robot, boss, companion, weapon and pickup models
explorer/js/entities.js  Player controller, Enemy AI, Boss patterns, Companions
explorer/js/post.js      bloom and tone-mapping post-processing
explorer/js/fx.js        particles, debris, lights, lightning, weather
explorer/js/game.js      hub/biome flow, hotbar & storage, saves, raids, projectiles, camera, main loop
explorer/js/ui.js        HUD (hotbar, compass, radar, objectives) and the Mechanic/Charging/Storage/Shop screens
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
