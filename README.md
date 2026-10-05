# SCRAPFORGE: OUTLANDS

A 3D first-person robot adventure in one connected open world. You're **Rivet**, a robot newly built on a mechanic's table. Climb, glide and explore; salvage robots for parts; build a squad of companion bots; and free the five Wardens from the Static.

Open `index.html` in a modern browser (no build step), or use the single-file **`Scrapforge-3D.html`**.

## The game

**One connected open world** about 1.6 km across, with no portals or loading screens. Home base sits on a plateau in the middle.
The regions blend into each other along their borders: the sky, fog, light, weather and music shift gradually as you cross them.

| Direction | Region | What's there |
| --- | --- | --- |
| centre | **Home Base** | your house, its rooms, and the charging pads |
| south | **Green Plains** | meadows, two tiers of cliff-edged plateaus, lakes and rivers |
| north | **Snowy Plains** | terraced snowfields, frozen lakes, pines and snowmen |
| east | **The Mountains** | tall ridged peaks broken by sheer cliffs and high plateaus |
| west | **Fiery Volcano** | ash plains, lava basins and three smoking volcano cones |
| south-east | **Saltglass Coast** | dunes and beaches dropping into a deep sea |
| high above the north-east | **Sky Islands** | floating islands linked by stepping stones and updrafts, reached from the tallest nearby peak |

**Terrain:** hills, valleys, plateaus and tall cliffs. Cliffs too steep to walk up have to be **climbed** (slower than walking, uses stamina). Rivers wind through the lowlands, and **waterfalls** pour off cliff edges into plunge pools.
**Caves** open at the foot of slopes. Inside they're dark (your chest lamp switches on) and lit by glowing crystals. At the far end of each cave are secrets:
- **Memory Fragments** (story logs that always play in order)
- **Warden Plating** (+10 maximum hull)
- **Lost Bot Parts** (every three assemble a free premium bot)
- **Hidden Hoards** (Botbucks and rare parts)
- a golden cache

**World map** (`M`, or **MAP** on touch): a shaded relief of the world under fog of war that clears as you explore. It marks:
- home, the Warden domes and their beacon progress
- beacons and villages you've seen, and village quest goals
- discovered caves (a **?** means a secret is still inside) and secrets you've found
- your squad, and up to 12 markers of your own (click or tap to place one, click it again to remove it)

**The Wardens.** Each Warden is reached in its own way, and the five can be freed **in any order**:

| Warden | Where | How you get in |
| --- | --- | --- |
| **Brambleback** | Green Plains | Power its 3 **signal beacons** (activate one, then defend its ring for 22 seconds) and the dome drops. |
| **Glacieros** | Snowy Plains | Find the **Ice Grotto** nearby and turn its three mirrors until the light beam reaches the crystal. The ice melts, and the **Frost Key** opens the dome. |
| **Colossus** | The Mountains | It waits on a **summit ringed by sheer cliffs**. Climb the marked **Summit Route**: hang still at its glowing ledges to get your stamina back, or try your jetpack. Reaching the top opens the dome. |
| **Infernus** | Fiery Volcano | Its island sits in a **lava moat that burns through any boots**. Bring Forgemistress Ashby in Cinderwell the parts for **The Cooling Bridge**, and the bridge freezes across the moat. |
| **Deepsong** | The Drowned Trench | About 90 m under the sea. Upgrade to a **Mk III Pressure Hull** and dive to the open dome at the bottom. |

When all five are free, the **Sky Lift** at home base wakes up. It reads Rivet's core, recognises the heart of **Aurel**, the Wardens' lost leader, and lifts you to the **Vane Citadel** above the Sky Islands. There, **Stormwing** guards the Conductor. Win, and the story ends: the Conductor speaks, Aurel answers, and the Static falls. You can keep exploring afterwards. A lift pad on the citadel takes you back home.

Step inside an open dome and it seals behind you for a one-on-one fight. Each Warden has an enraged Overdrive phase.

**Story.** A new game opens with Rivet waking on the assembly table of **Wren Halloway**, the mechanic who built it. A short tutorial follows:
1. look around
2. talk to Wren
3. take the Pulse Blaster from the rack
4. shoot three practice drones in the yard
5. build a Gunner Drone
6. open the map

**Skip tutorial** (or the quest log) skips it.
- **Dialogue** appears above the hotbar. It moves on by itself, or press `Enter` (tap it on touch) to hurry it.
- Each **Warden** speaks as the Static leaves it. Wren has more to say each time you come home after freeing one. **Memory fragments** found in caves fill in the rest of the story, piece by piece.

**Quests.** The quest tracker (top left) shows the current main quest step, with a gold marker on the compass. The quest log (`J`, the pause menu, or tap the tracker on touch) lists:
- the main quest chain: *Rise and Shine → The First Warden → The Wardens Remember → Above the Static*, with a step for each Warden's route
- side quests: memory fragments, building the base rooms, lost bot parts, Scrap Sprites
- every Warden's status

**Home base: Halloway Works.** A modern compound of white panels, glass walls and roofs, and cyan light strips. Walking onto the home plateau repairs you and saves.

| Room | What it's for |
| --- | --- |
| **Workshop** | Wren, the assembly table and the weapon rack. The **Workbench** builds simple bots (Gunner, Medic, Scout), the **Shield Generator**, **Fast Chargers** and new rooms. |
| **Atrium** | Entrance hall under a glass roof, with a hologram. |
| **Charging Bay** | Bots recharge on its pads. Bots you're not using wait here. |
| **Storage** | Unlimited storage. |
| **Garage** (build it) | Build the Jetpack, Fire Boots and Backpacks from parts. |
| **Lab** (build it) | Research upgrades with parts, and replay recovered memories. |
| **Command Room** (build it) | A holo table with the world map, **quick travel** to any powered beacon, the quest log, and **Recall to Home Base** from the pause menu. |

The Garage, Lab and Command Room are sealed by force fields until you build them at the Workbench. Once you've beaten a Warden, robots sometimes raid the base.

**Saving:** the game saves when you get home, when a beacon comes online, when a Warden falls, when you find a cave secret, and every 90 seconds or so while things are calm. **Continue** puts you back where you last saved.
If you're destroyed, you're rebuilt at home base with the gear you had at your last save. Beacons, Wardens, opened caches and found secrets stay done.
Saves have a version number. A save from the older portal version keeps your hotbar, storage, Botbucks, gear, upgrades and bots, but starts you in the new world with the story from the beginning. A save from before the Warden routes (version 2) keeps everything except place-specific finds (opened caches, found secrets, map fog, markers), because the world's landmarks moved.

**Robot camps** sit all over the world around scrap braziers. They come to life as you approach and pack up when you're far away; a camp you wipe out comes back after a few minutes. An alarm meter ("?") fills over a robot's head while it notices you. When it's full, the whole camp attacks. Robots get tougher in the farther regions (Plains < Snow and Coast < Mountains < Volcano < Sky).

**The Sunken Reach (underwater).** The sea under the Saltglass Coast is a region of its own: kelp forests, coral reefs, glowing vents, sunken wrecks, and robot camps of the deep (Reef Drones that slow you, Jelly Mines, Anglers, Crab Crushers). Underwater the light turns blue-green and darkens with depth, bubbles drift up, the sky fades away, and the music changes to its own slow theme.
- **Swimming:** you move where you look. `Space` (or holding **JUMP** on touch) rises, `Shift` or `C` sinks, and the heavy chassis sinks slowly when you let go. Swim up to a shore and press `Space` to climb out.
- **No oxygen** (Rivet doesn't breathe). The danger is **pressure**: the depth gauge shows how deep you are and your hull's rating. Below that depth your hull is slowly crushed. Your stock chassis is safe to 12 m.
- **Diving gear** is sold at **Tidewright Diving** in Saltpin Harbor:
  - **Pressure Hull Mk I / II / III** (safe to 30 / 55 / 100 m)
  - **Hydro-Jets I / II** (faster swimming)
  - **Abyss Lamp** (a much brighter chest lamp in the deep)
- **Wrecks** lie at 9 to about 65 m, so the deeper ones need better hulls. Each holds a golden cache and a secret: memory fragments, plating, lost bot parts or treasure. Wrecks you've seen appear on the map with their depth.
- **The Drowned Trench** drops to about 90 m and needs Mk III. At the bottom, the ocean Warden **Deepsong**, a great mechanical whale wrapped in singing rings, waits in an open dome. Its **sonar rings** sweep out at its own depth, so swim above or below them.

**Robot villages.** Each region has a village of friendly robots that the Static hasn't reached. Walking into one saves the game, and its **charging post** starts serving your bots.

| Village | Region | Shops |
| --- | --- | --- |
| **Brassbrook** | Plains | Dot's Oil Bar (repairs), Ruby's Exchange (parts), Flint & Barrel (weapons) |
| **Glimmerdrift** | Snow | Sleet Plating (armor), Koba's Botwright (premium bots) |
| **Highbolt** | Mountains | Vela's Tuning (upgrades), Crank Outfitters (gear), Summit Arms (weapons) |
| **Cinderwell** | Volcano | Slag Ironworks (armor), Tempra's Kiln (upgrades), The Sooty Kettle (repairs) |
| **Saltpin Harbor** | Coast | Tidewright Diving (pressure hulls, hydro-jets, abyss lamp), Pebble's Galley (repairs), Barnacle Bea's (parts), Driftwood Bots (premium bots) |

- **Shop types:**
  - **Oil & Repairs:** Full Service (full hull and full bot batteries), repair kits, plasma cells.
  - **Parts Exchange:** buy parts.
  - **Weapons**, **Armor**, **Upgrades**, **Gear** (jetpack, fire boots, backpack), and **Botwright** (premium bots).
  - Every shop buys your salvage, with a slider to choose how many from a stack.
- **Villagers:** every shopkeeper and villager has a name and talks to you, and their lines change as you free Wardens. Talk to a shopkeeper (or step up to the counter) to trade.
- **Village quests**, each from a village elder:
  - **Trouble Next Door** (Mayor Tinsel): clear the robot camp raiding Brassbrook.
  - **Light for the Relay** (Lumen): bring 3 Focus Lenses. The reward marks every Warden beacon on your map.
  - **The Lost Scout** (Old Piston): find Wisp on a ledge above Highbolt.
  - **The Cooling Bridge** (Forgemistress Ashby): bring Power Cores and Copper Coils, and Ashby freezes a bridge across Infernus's lava moat.
  - **Message in a Bottle** (Captain Brine): find a bottle on the beach. It holds a memory fragment.
  - Active village quests show in the quest log, as markers on the compass, and as stars on the map.
- **Quill**, a wandering archivist, shows up in a different village each time you free a Warden. Quill fills in what the archives say about the Wardens' lost leader.

**Inventory and Botbucks**
- **Hotbar:** 9 slots (more with Backpacks). Parts and supplies stack up to 20 per slot; weapons take a slot each. Select with `1`–`9`, `0` or the mouse wheel (tap a slot on touch), and drop one with `X`.
- **Botbucks** come from selling salvage and from robots, caches, beacons, bosses and quests.
- **Fire Boots** make lava bearable. The **Jetpack** (hold Space in mid-air) helps with the Sky Islands. Both are sold in Highbolt or built in the Garage.

**Companions:** bots drain their battery while you're away from home. As it drains they take more damage and aim worse. Below 15% a bot **flies to the nearest charging spot** — home, or the charging post of a village you've visited — charges there, then flies back to you. You can see how far away it is in the Charging Room.
**Swapping:** when your squad is full, new bots wait at home. Pick a squad bot to swap out. It flies home first, then the other bot flies out to you.

**Player:** stamina wheel for sprinting, climbing and gliding; a paraglider (Space in mid-air), with campfire and valley updrafts; and a jetpack. Fall damage grows with the drop (gliding, jetpacking and landing in water are safe). Activated beacons launch you skyward and reveal the area on your map and compass. Aim assist curves shots into nearby enemies, and plasma bombs and rockets hurt you if you're in the blast. Hidden **Scrap Sprites** (3 = a stamina vessel) sit on pillar tops, cliffs and islands.

**Music:** home base and each region have their own theme song (bouncy bells at home, a skipping whistle in the Plains, music-box bells in the snow, a brass march in the Mountains, chiptune rock in the Volcano, floating arpeggios in the sky). The song follows the region you're in, and combat and boss fights switch to action themes.

### Controls (keyboard and mouse)

| Key | Action |
| --- | --- |
| `W A S D` | Move (`Shift` sprint) |
| Mouse | Look, left-click fire |
| `Space` | Jump. Tap in mid-air to glide, hold for the jetpack, and leap off while climbing. Underwater: rise |
| `Shift` / `C` | Underwater: sink |
| Walk into a cliff or rock | Climb (hold `W` to go up) |
| `Q` | Dash |
| Right-click / `G` | Plasma bomb |
| `E` | Interact (talk, rooms, shops, caches, beacons) |
| `M` | World map |
| `J` | Quest log and memories |
| `Enter` | Hurry the current line of dialogue |
| `1`–`9`, `0`, wheel | Select a hotbar slot. `X` drops one item |
| `R` | Repair kit |
| `Tab` / `I` | Field kit (build simple bots) |
| `V` | First / third person |
| `Esc` / `P` | Pause and settings (sensitivity, third person, invert Y, performance mode, world map) |
| `N` | Mute |

### On a phone or tablet (landscape)

Touch controls turn on automatically.
- Left thumb: floating move stick (push to the rim to sprint). Right side: drag to look.
- **FIRE:** hold to shoot, and drag it to aim at the same time.
- **JUMP:** tap it again in mid-air to glide, hold it for the jetpack, and use it to leap off a climb.
- **DASH** and **BOMB** show cooldown rings.
- **USE** lights up next to Wren, villagers, rooms, shops, caches and beacons. Tap the dialogue box to hurry it, and tap the quest tracker for the quest log.
- **MAP** opens the world map (tap to place markers). **VIEW** switches the camera, **FIX** uses a repair kit, **CRAFT** opens the field kit, and **❚❚** pauses.
- Light aim assist is on. Performance mode is on by default: no shadows, lower resolution, shorter view distance and fewer props.
- Add `?touch=1` or `?touch=0` to the URL to force touch controls on or off.

**Easiest way to play on a phone or tablet:** download **`Scrapforge-3D.html`** from the repo root, then open it on the device with Chrome or Samsung Internet.
- It's one self-contained file (styles, game code and 3D library built in), so it works straight from the Downloads folder.
- Opening `index.html` that way shows only unstyled text, because mobile browsers can't load the files beside it.
- The first launch needs internet only for the fonts, and falls back to built-in fonts offline.

Rebuild the file after changing the game with `python3 tools/build_standalone.py`. You can also serve the files over the web, for example with GitHub Pages.

**Tech:** Three.js r158 (vendored in `vendor/`, MIT) with a custom bloom and tone-mapping pass, a seeded procedural world, GPU particles and synthesized audio. There are no model, texture or audio files, and there's no build step: it runs from `file://`.
The ground is split into chunks, and static props are merged into a few large meshes, so only what's on screen is drawn. Far-away glows and sprites are hidden.

```
js/terrain.js   world size, blended biome height functions (plateaus, terraces, ridges, volcanoes, coast), rivers, prop batching
js/world.js     builds the world: ground chunks, water & lava, waterfalls, caves & secrets, the Halloway Works base, Warden domes & beacons,
                         sky islands, props, flora, camp sites, and the sky/fog/light blend between regions
js/villages.js  robot villages: layout, shops, villagers, charging posts, village quests, Quill
js/underwater.js the Sunken Reach: swimming, pressure, sea floor, wrecks, sea camps, the trench
js/wardens.js   how each Warden is reached: ice grotto mirror puzzle, summit route, lava moat and bridge, Sky Lift
js/worldmap.js  full-screen world map with fog of war and player markers
js/models.js    low-poly robot, boss, companion, weapon, pickup and secret models
js/entities.js  Player controller (cliff climbing, caves), Enemy AI, Boss patterns, Companions
js/post.js      bloom and tone-mapping post-processing
js/fx.js        particles, debris, lights, lightning, weather
js/story.js     Wren, dialogue, the opening scene and tutorial, quests
js/game.js      world flow (regions, camps, beacons, Wardens, secrets), saves, raids, projectiles, camera, main loop
js/ui.js        HUD (hotbar, compass, radar, quest tracker) and the Workbench, Charging, Storage, Garage, Lab, Command, Journal and Shop screens
js/data.js      parts, enemies, regions, bots, weapons, shops, secrets and memory fragments
```
