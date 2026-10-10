# ATlands — Online Co-op Plan

Status: **planning only**. No game code has been changed. Line numbers refer to commit `c544663`.

> **Update:** local **split-screen co-op** (two players on one screen) is now in the game (`js/split.js`). Instead of the full Phase 1 refactor, it swaps each player's state in and out of the existing globals around their turn. It already settles several of this plan's design questions for local play: rally into domes, boss health ×1.65, pausing menus, respawning at home with your inventory, and player 2's character in the save. Online co-op would still need the Phase 0–7 work below, but can reuse that per-player swapping as a starting point.

---

## Summary

**Recommended approach**
- **Topology:** 2–4 player co-op. The **host's browser runs the authoritative simulation**: enemies, camps, bosses, world progress and saves.
- **Who simulates what:** each player still runs their **own robot's movement locally**, along with their own bots and their own damage checks. The host checks those results loosely, which is enough for friends-only play.
- **Transport:** **WebRTC data channels, peer-to-peer** (each guest connects to the host). The PeerJS library is vendored into `vendor/` like Three.js, so there is still no build step and it is inlined into the standalone file. Signalling uses a free service, connections use public STUN servers, and a free-tier TURN relay covers the few networks where a direct connection fails.
- **Cost:** about $0 for friends-only use. The game itself is hosted free on GitHub Pages.
- **Single-player:** it becomes "a host with one local player and no connection". Every step below keeps it working.

**Biggest risks**
1. **The world is not the same on every device yet.** Performance mode changes how many caves, waterfalls, caches, wrecks and sea camps are generated, and some of these reshape the terrain. That shifts every random draw after them. One shuffle also depends on the browser's sort implementation. This must be fixed first (Phase 0); otherwise nothing else can work.
2. **The game assumes one player everywhere.** There are 67 direct `G.player` references across 10 files, and character data lives in global fields (`G.up`, `G.gear`, `G.bar`, `G.bucks`, `G.vessels`, and even `G.progress.story.plating`). Phase 1, the refactor to a list of players, is the largest and riskiest step.
3. **Pausing and slow-motion are global.** The pause menu, shops, the workshop, the field kit ("Time is frozen") and the map all stop the simulation. Focus aim, boss kills and death all change `G.timeScale`. None of this can work with several players in one world, so it needs a design change in co-op.
4. **Background tabs.** Browsers throttle hidden tabs heavily (`requestAnimationFrame` stops). If the host switches tabs, the world freezes for everyone.
5. **Boss domes are built as one-on-one fights.** There is a single `World.domeTrap` / `World.arena`, a death rolls your inventory back, and dying reopens the dome.

**Total effort (rough, for one developer working with Claude):**
- Phase 0: S–M. Phase 1: L.
- Phases 2–3: M each. Phase 4: L. Phase 5: L. Phase 6: M–L. Phase 7: M.
- Overall, about **6–9 weeks of focused part-time work**.
- A playable "walk around together" prototype comes after Phases 0–3, roughly 2–3 weeks in.

---

## 1. Current architecture audit

### 1.1 How the game is put together

| System | Where | How it works today |
| --- | --- | --- |
| Boot / loop | `game.js` `frame()` (~l.1697), `update()` (l.1047) | One `requestAnimationFrame` loop. `G.state` decides what runs: `menu`, `playing`, `paused`, `workshop`, `map`, `gameover`, `victory`. **`update()` runs only while `playing`.** |
| Global state | `game.js` `G` (l.35) | A single object holds the session, **the player** (`G.player`), inventory (`bar`, `storage`, `bucks`), `gear`, `up` (upgrades), `base`, `progress`, every entity list, and helper methods (`addItem`, `killEnemy`, `bossKilled`, spawners). |
| World build | `world.js` `World.build()` (l.13), called from `buildWorld()` (game.js l.457) | Fully procedural, run once per seed with `useRng(mulberry32(seed))`. It calls `Terra.setup`, `Villages.plan/build`, `Sea.plan/build` and `Wardens.plan/build`. The **whole 1600 m world** is built in memory, and only rendering is culled. |
| Randomness | `util.js` l.6–12 | `rand/randi/pick/weighted` use `_rng`, which is seeded only during `World.build`. **At any other time it is `Math.random`.** |
| Player | `entities.js` `class Player` (l.25) | Movement, climbing, gliding, jetpack, swimming (`Sea.swim`), dash, firing and grenades. Reads `Input` directly. Its stats come from globals: `G.up`, `G.vessels`, `G.weapon`, `G.progress.story.plating`. |
| Enemies | `entities.js` `class Enemy` (l.497) | AI is aimed at `G.player`: `detect` (l.593), `aimedShot` (l.550), `fire`, `aimYaw`, `calmDown`, contact damage (l.820). No network IDs. Tier defaults to `G.level`, which is the **region of the player**. |
| Camps | `game.js` `streamCamps()` (l.735), `spawnCampRobots()` (l.716) | Camps wake within 160 m of `G.player` and sleep beyond 270 m. A cleared camp respawns after 300 s. At most 46 live enemies. |
| Bosses | `entities.js` `class Boss` (l.881), `game.js` `startBossFight` (l.928), `bossKilled` (l.399) | One `G.boss` and one `G.fight`. `World.trapDome(A)` sets the single global `World.domeTrap` / `World.arena`. Every pattern targets `G.player` (`think` l.1009, `fire` l.931, `markTargets` l.992). Pattern order is shuffled with `Math.random` (l.963). |
| Companions | `entities.js` `class Companion` (l.1523) | Fly in formation around `G.player`, charge at home or at villages you have visited, and target enemies. The medic and bubble bots heal or shield only `G.player`. IDs come from a global counter `_cid`. |
| Projectiles | `game.js` `G.bullets` / `G.ebullets`, `updateBullets` (l.1209), `updateEnemyBullets` (l.1320) | Player and bot shots hit enemies. Enemy shots hit `G.player` (swept test) and active bots. `explodeAt` damages only `G.player` with your own blasts. |
| Pickups | `game.js` `updatePickups` (l.1389) | Physics, magnet pull toward `G.player`, and collection into the single global hotbar. Drop chances use `Math.random` (`killEnemy` l.286–295, `openCache` l.809). |
| Interaction | `nextInteractable()` (l.766), `interact()` (l.791) | Measured from `G.player`. Opens UI screens, which **pause the game**. |
| Story / quests | `story.js` `Story`, `Dialog`; `villages.js` `Villages` | Flags live in `G.progress.story` and `G.progress.villages`. One `Dialog` queue, plus an opening cutscene (`G.cine`) that takes over the camera. Several gameplay steps run on `setTimeout` (21 calls across 5 files, e.g. the boss-killed flow at game.js l.420–431 and `Story.ending`). |
| Warden routes | `wardens.js` | Mirrors, the frost key, the summit and the lift. `update()` checks whether `G.player` has reached the summit, and `ride()` moves `G.player` and saves. |
| World progress | `G.progress.world` | `beacons` and `secrets` are stored by **id**, but `caches` and `sprites` by **array index**, and `caves` by generation order. `fog`, `pins`, `mirrors`, `frostKey`, `summit` and `lift` are stored alongside. |
| Saves | `game.js` `stateJSON` (l.494), `applyState` (l.503), `SAVE_VERSION = 3`, key `sf-outlands-save` (the old name is kept so existing saves keep loading) | One JSON blob mixes the character (bar, storage, bucks, gear, up, comps, reserve, hp, vessels) with the world (progress, base). Dying calls `restoreSnapshot()`, which **rolls the inventory back** to the last save but keeps world progress. |
| UI | `ui.js` | Shops, the workshop, storage, the garage, the lab, the command room and the journal. All of them set `G.state='workshop'`, which pauses the game. The HUD, compass and radar are drawn around `G.player`. |
| Input | `util.js` `Input`, `touch.js`, `gamepad.js` | Local only. Good: everything feeds one `Input` object. |
| Camera / avatar | `game.js` `updateCamera` (l.1637), `updateAvatar` (l.1464) | One camera, one first-person weapon model and one articulated third-person mech `G.avatar`, animated procedurally from `G.player`'s state. |
| Build | `tools/build_standalone.py` | Inlines every `<script src>` from `index.html`, so a new vendored script is picked up automatically. |

### 1.2 Single-player assumptions baked in

| Assumption | Examples | Co-op impact |
| --- | --- | --- |
| One global player | 67 `G.player` refs: game.js 27, entities.js 17, ui.js 11, story 3, villages 2, wardens 2, world 2, worldmap/touch/gamepad 1 each | Needs a `players` list, a `me` (the local player) and "nearest/target player" helpers. |
| Character data in global fields | `G.bar/sel/weapon/storage/bucks/gear/up/reserve/companions/vessels/spritesFound`; `Player.maxHp` reads `G.up.armor` **and `G.progress.story.plating`**; `Companion.maxHp` reads `G.up.firmware` | Needs a `Character` object for each player. Plating has to move out of world progress. |
| The simulation stops for UI | `ui.js` `pause()` l.81 and `openStation()` l.182 set `G.state`. `frame()` only calls `update()` while `playing`. | The host's world must keep running while anyone, including the host, has a menu open. |
| Global time scale | `G.focus` slow-motion (`Player.update` l.294), boss kill `timeScale=0.3`, death `0.35` | Must become a local camera or visual effect in co-op. |
| One boss fight | `World.domeTrap`, `World.arena`, `G.fight`, `G.boss` | Make dome state per arena, with a set of players inside. |
| The region follows the player | `G.region/G.where/G.level` drive music, weather, the HUD **and enemy tier defaults** (`Enemy` ctor `tier = G.level`, `queueSpawn` `opts.tier ?? this.level`) | Region becomes local presentation only. Spawns must always pass an explicit tier. |
| Raids and autosaves | `arriveHome()` rolls a raid with `Math.random` (l.690); `explore()` autosaves and records `G.safeSpot` | Raids are decided by the host. Safe spots are per player. Saves are written by the host for the world and by each player for their character. |
| Uplinks | `updateObjectives` drops the uplink when `G.player` is more than 140 m away or dead (l.869) | Use "any living player within range". |
| Interaction distance | `nextInteractable()`, `Villages.updatePresence`, `Wardens.update` summit check | Each check is local, but the world change it causes becomes a request to the host. |
| Pickups | The magnet pulls toward `G.player`; the hotbar is global | Instanced loot for each player (see §4.4). |
| `setTimeout` gameplay | `bossKilled` → banners → `Story.ending()`; beacon hints | Host-driven events, delivered to everyone. |

### 1.3 Is world generation deterministic from the seed?

**Mostly, but not across devices or browsers.** Everything inside `World.build` draws from the seeded `_rng`. These are the exceptions found:

| # | Where | What | Effect |
| --- | --- | --- | --- |
| D1 | `world.js` l.29 `this.lowSpec = G.settings.quality === 'low'` | Performance mode is read **during world generation**. Touch devices default to `low` (`game.js` l.1777). | **Breaks determinism.** See D2–D7. |
| D2 | `world.js` l.208 `planWaterfalls`: 9 vs 14 waterfalls | Each waterfall **carves the heightmap** (plunge pool and stream bed). | Terrain heights differ, and everything placed after them moves. |
| D3 | `world.js` l.288 `planCaves`: 12 vs 16 caves | Caves carve aprons and holes. The loop stops at the cap, so the **number of random draws changes**. | Every later random draw differs: villages' contents, caches, sprites, camps, the sea. |
| D4 | `world.js` l.1439–1483 `scatterProps`: loops of 750/1150, 60/100, 90/150, 110/170 | Fewer props and colliders, and fewer random draws | Different colliders. `placeSprites` picks from the colliders, so sprites move too. |
| D5 | `world.js` l.1687 `placeCaches`: 70 vs 90 | Caches are saved **by index**. | Different cache sets. |
| D6 | `underwater.js` l.30, l.81, l.128: sea floor spots 2600 vs 4200, vents 8 vs 14, sea camps 7 vs 10 | Different draw counts. | Different wrecks, sea camps and secrets. |
| D7 | `world.js` l.1508 snowmen only when not `low`; l.1519 / l.1538 flora loops 1500/2800 and 420/900 | Visual on their own, but **they draw from `_rng`** | Shifts every random draw after them (caches, sprites, camps, the sea). |
| D8 | `world.js` l.1698 `islands.slice().sort(() => _rng() - 0.5)` | Shuffle by sorting with a random comparator. | **Sort algorithms differ between browser engines** (V8, SpiderMonkey, JavaScriptCore), so the same seed can place sprites differently on Chrome and Safari. |
| D9 | `world.js` l.239–240 | Waterfall texture uses `Math.random`. | Visual only. Harmless. |
| D10 | `Math.sin/cos/pow/exp/atan2/hypot` in terrain and placement code (10 uses in `terrain.js`, many in `world.js`) | JavaScript does not guarantee these give bit-identical results across engines. Thousands of `if (x < threshold) continue` checks consume random draws. | **Unknown, probably rare.** One flipped comparison changes everything after it. Must be measured (Phase 0 fingerprint). |
| D11 | `world.js` l.855 `buildHub` reads `G.base.shield` | The home shield dome depends on save state. | Not seed-driven. It comes from host state, which is fine once synced. |

**Runtime randomness** is not part of generation. On the host it is simply the authority. On guests it must never decide gameplay. The decision-making uses are:
- camp contents (`spawnCampRobots`: types, elites, positions)
- enemy stats (`Enemy` ctor `speed * rand`, cooldowns, `strafe`)
- hit or miss (`aimedShot` l.556)
- boss pattern order (l.963) and angles
- drops (`killEnemy`, `openCache`, `beaconOnline`)
- raids (l.690) and uplink spawns (l.880–889)

Cosmetic uses (particles, footstep dust, NPC wandering, thruster flicker) can stay local.

> A side note on single-player: the same problem exists today. Each device always boots in the same mode (desktop high, touch low), so saves are consistent on one device. But a save made on a touch device and opened on a desktop would show a different world. Phase 0 fixes this too.

### 1.4 Time handling

- **Variable timestep.** `dt = clamp((now - lastT)/1000, 0, 0.05)`, then multiplied by `G.timeScale` (game.js `frame()`).
- **Below 20 fps the game runs in slow motion**, because each frame is capped at 50 ms. A slow host would slow the world down for everyone. **Fix:** in co-op, split the elapsed real time into 50 ms sub-steps (with a cap) so the host keeps real time.
- **Lockstep is not used and not needed.** A host-authoritative design only needs host time stamps on snapshots and client-side interpolation. A fixed network tick (20 Hz for snapshots) runs separately from rendering.
- **`G.time`** (scaled) drives reserve-bot charging, camp respawns (`respawnAt`) and animations. On the host it becomes the shared clock, sent in every snapshot. Clients keep their own `G.time` for cosmetic use and estimate the host clock to place interpolated entities.
- **Background tabs** stop `requestAnimationFrame`. The host needs a fallback tick, or the game pauses with an "host is away" notice (see §9).

---

## 2. Networking options

Costs and free-tier limits change often, so check current numbers before committing. The figures below are what was published as of 2025–26.

| Option | Hosting cost | Reliability (NAT/firewalls) | Latency | Complexity | Fit for a static game with no build step |
| --- | --- | --- | --- | --- | --- |
| **(a) WebRTC P2P + PeerJS** (public PeerServer for signalling, public STUN) | **$0**. The public PeerServer is free but best-effort, and can be self-hosted later. | Direct connections work for most home networks. **Roughly 10–20 % of pairs** (mobile carrier NAT, strict school or office networks) need a **TURN relay**. Free TURN tiers exist (e.g. Cloudflare's TURN service, Metered's Open Relay). | Best: one hop, host to guest. | Low to medium. PeerJS hides the signalling. Its minified build can be vendored as `vendor/peerjs.min.js` and is MIT licensed. | **Excellent.** One classic `<script>`, inlined into the standalone file by the existing build script. |
| **(a′) WebRTC + Trystero** (signalling over public Nostr relays, BitTorrent trackers or MQTT) | $0, no server of your own | Same as (a) for media. Public relays are another moving part. | Same as (a) | Medium. It ships as an ES module, so it needs a bundled script or `import()` from a CDN, which is awkward from `file://`. | Fair |
| **(b) WebSocket relay on Cloudflare Workers + Durable Objects** | Free plan possible, but co-op traffic adds up: 4 players × ~20 messages/s is about **288k messages an hour**. Incoming WebSocket messages are billed in batches, but a few hours a day can reach the free daily request limit. The **$5/month** Workers Paid plan covers it easily. | **Best.** Plain `wss://` on port 443 gets through almost every firewall, and no TURN is needed. | Two hops (guest → edge → host). Usually +10–40 ms, because Cloudflare's edge is close to most players. | Medium. About 100 lines of Worker code, plus a deploy with `wrangler`. That is a server-side step, not a game build step. | Good. The client is plain `WebSocket`. |
| **(b′) WebSocket relay on Node** (`ws`) on a small VPS, Fly.io or Render | ~$4–6/month for an always-on VPS. Free tiers sleep or have been removed. | Same as (b) | Depends on the server's region: far players get +50–150 ms | Medium, plus server upkeep | Good |
| **(b″) Colyseus** | Node server, same as (b′) | Same as (b) | Same as (b′) | **High.** Built for server-authoritative rooms. The game's logic is tightly tied to Three.js meshes and effects, so running it headless on a server would mean rewriting the simulation. | Poor |
| **(c) Hosted realtime services** (Supabase Realtime broadcast, Firebase RTDB, Ably, PubNub) | Free tiers with **monthly message quotas** that 20 Hz snapshots use up quickly | Good (WebSocket) | 50–150 ms, with an extra server hop | Low to medium | Fair. Quotas are the problem. |

**Recommendation: (a) WebRTC peer-to-peer with PeerJS, behind a small transport interface.**
- **Why:** it costs nothing, it is the lowest latency, it needs no server to maintain, and it fits the vendored-script, no-build-step style already used for Three.js. The host is the authority, which a star of peer connections models naturally. Friends-only means no matchmaking service is needed.
- **Covering its weakness (NAT):**
  1. Configure a free-tier TURN server as a fallback from the start of Phase 2.
  2. Write the code against a `Net.transport` interface (`send`, `onMessage`, `onOpen`, `onClose`). If TURN turns out to be unreliable, a ~100-line Cloudflare Durable Object relay can be added as a second transport without touching any game code.
- **For development and automated tests:** a **`BroadcastChannel` transport** (two tabs on the same origin) needs no network at all. The existing Playwright harness can then drive host and guest pages in one browser. Serve the folder with `python3 -m http.server`, because `file://` pages have opaque origins.
- **Join links** need a hosted copy (e.g. GitHub Pages, `…/index.html?join=K7Q2MX`). Room codes work everywhere, including the standalone `ATlands.html` opened from Downloads. Test that WebRTC works from `file://` on Android Chrome and Samsung Internet. The claude.ai artifact copy may block outside connections, so treat GitHub Pages as the multiplayer URL.

---

## 3. Authority and sync model

### 3.1 The model: host-authoritative world, owner-authoritative robots

| Thing | Who decides | What travels |
| --- | --- | --- |
| Your own movement (walk, climb, glide, jetpack, swim, dash, launch, updrafts, fall damage, lava, pressure) | **The owning client.** Runs `Player.update` locally against the identical world, so there is no lag on your own controls. | Transform plus pose flags at 20 Hz, unreliable channel |
| Your shots | The owning client spawns the visible bolts instantly and does **"favour the shooter"** hit tests against its interpolated enemies | `fire` event (weapon, origin, direction, a small seed for pellet spread) so others see the bolts; `hit` event (enemy id, damage, position) to the host |
| Damage to enemies, kills, drops | **Host.** Applies the reported hits with sanity checks (§6), and owns HP, death and the kill event | `kill` event; HP inside snapshots |
| Damage to a player | **The victim's client.** Enemy shots are simulated identically everywhere from their spawn event, and each client tests them only against **its own** robot, which makes dodging fair. | `hurt` event to the host (for the HUD, deaths and stats) |
| Enemies (AI, positions, targets, shooting) | **Host** | Snapshots at 10–15 Hz (id, quantized position, facing, HP, state bits) and spawn and fire events |
| Camps (wake, sleep, cleared, respawn timer) | **Host.** Distance is measured to the **nearest player** | `campState` events |
| Boss (patterns, phase, target, HP) | **Host** | Boss snapshot at 15 Hz (position, facing, HP, phase, pattern, sub-state, target id); every boss shot or wave as a spawn event |
| Projectiles | Each one is born from a **spawn event** (start position, velocity, gravity, effect, hug height, `fromBoss`, splash) and **simulated deterministically on every client**. Positions are never streamed. | Spawn and "dead/burst" events only |
| Explosions | Whoever owns the projectile (host for enemy shots, owner for player rockets and grenades). Damage to players is checked by each victim; damage to enemies by the host. | `boom` event (position, radius, colour) |
| Companion bots | **The owning client** simulates its bots (follow, charge, targeting) and reports their hits like its own shots | Bot transforms at 5–10 Hz, plus bolt and missile spawn events |
| Pickups and loot | **Each client for itself** (instanced loot, §4.4). The host broadcasts "enemy X died at P (elite, tier)"; each client rolls its own drops. | Nothing beyond the kill and cache events |
| Caches, sprites, secrets, caves found | **Host.** Clients send `interact` requests and the host confirms or rejects. | `worldFlag` events (e.g. `{cache: 42}`) and the rewards each player gets |
| Beacons and uplinks | **Host** (progress counts while **any** living player is inside the ring) | Beacon state and progress at 2 Hz while an uplink runs |
| Domes (sealed, opening, trapped, inside set) | **Host** | `dome` events |
| Mirrors, frost key, summit, lift, cooling bridge | **Host** | `worldFlag` events |
| Story flags, freed Wardens, village quests, rooms, shield, charger | **Host** | `progress` events; a full state copy on join |
| Raids | **Host** | Normal spawn events |
| Dialogue, banners, music, weather, the region HUD, map fog | **Local**, triggered by events | — |

### 3.2 What is not synced because it comes from the seed

Once Phase 0 is done, the following are rebuilt identically on every client from `seed + world profile` and **never sent**:
- terrain, rivers, lava, waterfalls, caves and holes, colliders, props, flora
- villages, NPCs, shops, stalls
- beacon and arena placement, the Warden route geometry (ledges, bridge, grotto, lift)
- cache, sprite, secret and wreck positions, camp sites (location, size, tier, pool)

Only **state on top of them** travels: cache 42 is open, camp 17 is live, mirror 2 is turned. NPC wandering, particles, weather and sky are cosmetic and stay local.

**Join check:** both sides compute a **world fingerprint**, a short hash of a sampled heightmap and the lists of caches, camps, caves and secrets. If the fingerprints differ, the guest is refused with a clear message, and the details are logged for debugging.

### 3.3 Rates, interpolation and bandwidth

- **Channels:**
  - one **reliable, ordered** channel for events (interact, kills, flags, spawns)
  - one **unreliable, unordered** channel (`ordered:false, maxRetransmits:0`) for snapshots
- **Rates:**

  | Stream | Rate |
  | --- | --- |
  | Player transforms | 20 Hz |
  | Enemy snapshots | 12 Hz, only **within 220 m of the receiving player** (interest management) |
  | Boss | 15 Hz |
  | Bots | 8 Hz |
  | Beacon progress | 2 Hz |

- **Interpolation:** remote players, enemies and bots are drawn **about 100 ms in the past** from a buffer of snapshots, interpolated linearly. Extrapolation is capped at 150 ms. The existing `Enemy.sync()` and `updateAvatar()` can stay as the presentation layer, fed with interpolated state.
- **Size estimates** (a binary `DataView` format from Phase 7; JSON is fine for the prototype):
  - player: ~32 bytes (position as 3×f32, yaw and pitch as 2×i16, velocity as 3×i16, ~16 state bits)
  - enemy: ~12 bytes
  - So 30 nearby enemies × 12 B × 12 Hz is about 4.3 KB/s, plus players and events, which comes to **under 10 KB/s for each guest**.
  - The host uploads about 30 KB/s with three guests (~250 kbps). That is fine on home broadband and 4G.
- **Clocks:** the host stamps snapshots with its `G.time`. Each guest keeps an offset estimate from ping round-trips.

---

## 4. Design questions co-op forces, with recommended defaults

### 4.1 Quests and story
- **Default:** the **host's world progress is shared** (freed Wardens, beacons, story flags, village quests, rooms, shield and charger at home base). The host's save is the world.
- **Tutorial and opening scene:** only in a new single-player game. **Guests skip them** (the same as `Story.skip()`). The host can host only after the tutorial is done (`Story.tutorialDone`).
- **Dialogue** is local. Plot lines (Warden freed, ending) are broadcast so everyone sees them. Talking to an NPC opens dialogue only for the player who talked, but changes to quest state go to the host.
- **Ending:** when Stormwing falls, every client plays the ending. Each guest's victory screen shows their own stats.

### 4.2 Warden domes and boss fights
- **Rally, then seal.** The first player to cross into an open dome starts a **10-second "the Warden stirs" countdown** that everyone sees. Any player who walks in during it is included. Then the dome seals, exactly like `World.trapDome` today, but tracking a **set of players inside**.
- Players outside a sealed dome **cannot enter**, keeping the current "nobody leaves or enters" rule. They see a "fight in progress" marker.
- **Boss health scaling:** `maxHp × (1 + 0.65 × (n − 1))` for the `n` players sealed in, so ×1.65 for 2, ×2.3 for 3, ×2.95 for 4.
- **Pressure scaling:** aimed patterns (`aimed`, `charge`, `pounce`, `dive`, `meteor` markers, `feathers`) pick a **target player** that rotates at each `nextPattern()`, weighted toward whoever did the most damage recently. Area patterns (waves, sonar, radial, spiral, lasers, gust) hit everyone, as they do now.
- **Death in a dome:**
  - The player goes **down** for 25 s and any teammate inside can revive them (hold interact for 2 s).
  - When the timer runs out, the player is a spectator for the rest of the fight (camera follows a teammate) and respawns at home when it ends.
  - **If everyone inside is down:** the fight fails, the boss resets, and all of them respawn at home.
  - In single-player nothing changes: dying works as today.
- **Rewards:** each player who took part gets the full loot burst (instanced). `progress.beaten` is set once, in the host's world.

### 4.3 Companion bots
- **Ownership:** every player owns and simulates their own squad. Bots follow their owner, defend their owner, and charge at home or at visited villages, using the host's villages and base.
- **Cap in co-op:** **2 active bots per player** (extra slots wait in reserve) and **6 in the session** with 4 players. This keeps fights balanced, the host's enemy budget sensible, and phones smooth. The cap can be a lobby setting.
- **Medic and bubble bots:** owner only at first. Healing the nearest teammate is a later polish item (it needs heal events).
- **Bandwidth:** about 20 bytes per bot at 8 Hz, so negligible.

### 4.4 Loot, Botbucks, shops and secrets
- **Instanced loot:** every player sees and collects **their own drops** from kills, caches, beacons and bosses. There is no fighting over drops, nothing to sync, and nothing to "steal". Botbucks work the same way.
- **Caches:** opening one is a world event (`opened` is saved in the host's world). Each player **within 40 m** gets their own loot burst.
- **Discoveries are shared rewards:** when anyone finds a secret (memory log, Warden plating, lost bot part, hidden hoard) or a Scrap Sprite, **every player in the session gets the reward**, and the find is saved in the host's world.
- **Shops:** a purely local UI paid with your own Botbucks. No sync is needed. **Shop screens do not pause the world in co-op** (§4.6).
- **Deliver quests** (e.g. Ashby's bridge) take the parts from the player who hands them in. Quest rewards go to everyone; parts and Botbucks go to each player separately.

### 4.5 Saves and versions
- **Host save** = the world: the existing `sf-outlands-save`, kept as is. The host's own character stays in it as today, so **single-player saves keep working untouched**.
- **Guest character** = **portable**, like characters in Valheim or Terraria:
  - **Kept in the character:** hotbar, storage, Botbucks, gear, upgrades, bots, reserve, vessels, sprites, plating, HP and stats.
  - **Where it lives:** taken from the guest's own save and written **back only to the character fields** of `sf-outlands-save` when the guest leaves, and at the host's save points.
  - **Not touched:** the world part of the guest's save.
  - A guest with no save gets a fresh character with the blaster, matching a skipped tutorial.
- **Format change: `SAVE_VERSION` 3 → 4.**
  - The blob is split into `{ v:4, character:{…}, world:{progress, base, worldProfile} }`.
  - `applyState` migrates v1, v2 and v3 saves by moving fields into the right halves. Plating moves from `progress.story.plating` into `character.plating`, with the old field kept as a fallback.
  - The save gains `world.profile` (see Phase 0). Old saves get the profile inferred from the device they were made on (touch → `low`, otherwise `high`). That keeps their caches, caves and sprites where they were.
- **Joining:** the guest sends its character summary. The host replies with the world state: seed, profile, progress, base, dome states, camp states, beacon states, and the open cache and sprite lists.
- **Leaving:** the guest's robot and bots vanish with a short teleport effect. The host keeps the guest's character in memory for 5 minutes so a reconnect resumes it.
- **Rolling back the inventory on death** (`restoreSnapshot`) stays in single-player. In co-op you **keep your inventory** when you respawn; Botbucks could carry a small penalty (say 10 %) instead, because a rollback against the host's always-saving world would confuse everyone.

### 4.6 Pausing, menus and slow motion
- **Co-op never pauses the world.** Esc opens settings over the running game. The workshop, shops, storage, the map and the field kit are overlays; your robot stays in the world.
- **Safety while in a menu:** a robot standing in **home base or a village** takes no damage while its player has a menu open. These are already enemy-free (raids are kept out by `Villages.keepOut` and the shield dome). Anywhere else, opening a menu is your own risk, and other players see a "busy" icon. The field kit text changes from "Time is frozen" in co-op.
- **Focus slow-motion** becomes local in co-op: a 1.5× zoom and steadier aim, with the same stamina cost and no time scaling. Boss-kill and death slow-motion become camera effects only.
- **Single-player is unchanged:** it still pauses and still slows time.

### 4.7 Death, respawn, and the host leaving
- **Death outside a dome:** respawn at home base after the usual death camera, with your inventory kept and progress untouched. A downed state and revives outside domes are optional polish.
- **The host leaves or disconnects:** the session ends for everyone. Guests save their characters locally and get "The host has left". **Host migration is out of scope:** the world save lives only with the host, so moving it mid-session is a large feature for little gain.
- **A guest disconnects:** their robot fades out. Their bots are removed from the host's simulation. They can rejoin with the same code within 5 minutes and pick up where they left off.

### 4.8 Movement that is hard to sync
| Movement | Difficulty | Plan |
| --- | --- | --- |
| Climbing | Medium. Small position changes against a cliff face; interpolation can clip into rock. | Send the `climbing` flag and the cliff normal. Remote avatars play the climb pose; clipping for ~100 ms is acceptable. |
| Gliding, updrafts, beacon launch | Easy. Smooth, fast motion. | Send flags. Keep extrapolation short so glides don't overshoot. |
| Jetpack | Easy | The `jetting` flag drives thruster effects. |
| Swimming and depth | Easy | `swim` flag plus pitch for the swim pose (`updateAvatar`). Pressure damage is local. |
| Dash | Medium. 0.18 s bursts at high speed. | Send a `dash` event with direction so remote clients play it instantly instead of interpolating a 3 m jump. |
| Freeze, burn, slow | Easy | Local to the victim. Remote clients see status flags (ice block, flames). |
| Sky Lift and Command Room travel | Easy | The teleport is a local move plus a `travel` event so remote clients snap instead of interpolating across the map. |
| Falling into the void (Sky Islands) | Easy | Local, as above. |

---

## 5. Mobile and performance

**What co-op costs on phones**
- Up to 3 remote animated mechs, more enemies near you (camps wake around every player), remote bots, extra projectiles, and network handling.
- `updateAvatar` is a full procedural rig with about 30 joints eased every frame. For remote players, run a **lighter version**: half rate, fewer joints and no footstep effects on low quality.

**Hosting**
- The host simulates every awake camp near **any** player, so the work grows with how spread out the players are.
- **Recommendation:** a desktop hosts when possible. Show a warning when a touch device hosts, and limit a phone host to **2 players**.

**Caps**

| Setting | Cap |
| --- | --- |
| Live enemies | 46 → **60 in the session**, plus **at most 30 around each player** (interest radius) |
| Bots | 2 per player |
| Particles (performance mode) | Remote particle bursts already drop to 45 % |
| Remote shots | Skip muzzle-flash lights for shots fired more than 60 m away |

**Snapshot rate on guests:** receiving at 12–20 Hz costs little. Decoding binary snapshots avoids JSON garbage collection pauses on low-end phones.

**Battery and data:** about 10 KB/s down for each guest, which is roughly **36 MB an hour**. The lobby should mention this for mobile data.

**Performance mode** stays a visual setting only. Phase 0 makes sure it never changes the world, so a phone in performance mode can join a desktop host.

---

## 6. Security and abuse (proportionate for friends-only co-op)

| Do now | Why |
| --- | --- |
| **Random 6-character room codes** from an unambiguous alphabet (no 0/O/1/I), ~887 million combinations; the PeerJS id is `atlands-<code>`. A new code per session. | Stops strangers from guessing codes. |
| **The host accepts joins** (an "Ash wants to join — Allow / Deny" prompt), with a 4-player cap | Friends-only, and simple |
| **Version handshake:** protocol version, game build id and world fingerprint; mismatches are refused with a clear message | Prevents confusing desyncs |
| **Message validation:** a whitelist of message types, a size cap (~4 KB), and a `Number.isFinite` check and range clamp on every number | A malformed message must never crash or poison the host's simulation (NaN positions, huge arrays) |
| **Rate limits for each guest:** fire events ≤ 1.5× the weapon's fire rate; interact ≤ 5/s; total messages ≤ 60/s; excess is dropped | Stops accidental floods from bugs |
| **Hit sanity checks:** damage ≤ the weapon's maximum; the target within weapon range + 20 m of the shooter; the enemy exists and is alive | Cheap, and catches bugs as well as cheats |
| **Text safety:** player names and any future chat are inserted with `textContent` and never through `innerHTML`, with a length cap (16 characters for names). `ui.js` builds many screens with `innerHTML` templates, so every remote string must be escaped. | **Cross-site scripting** is the one real risk here |
| **The transport is encrypted:** WebRTC data channels use DTLS by default | Comes for free |

**Can be skipped for now:** accounts, anti-cheat beyond the checks above, server-side checking of movement (moving fast in a friend's game hurts nobody), encrypted saves, and moderation tools.

---

## 7. Refactor plan

**The rule:** single-player is the same code path as co-op, with `Net.mode = 'solo'` and one local player. Every refactor step must leave single-player identical, and the existing Playwright scripts (`w6`, `w7`, `v1`, `u1`, `r1`, `sa`, `g1`) must stay green after every commit.

| File / system | Change | Size |
| --- | --- | --- |
| `world.js`, `underwater.js` | `World.build(scene, seed, profile)`. Content counts depend on `profile`, not `G.settings.quality`. Remove the sort-based shuffle (Fisher–Yates with `_rng`). Add a `World.fingerprint()`. Make dome state per arena (`A.trapped`, `A.inside`) and keep `World.domeTrap` / `World.arena` as getters for the local player. | M |
| `game.js` (state) | Split `G` into the session world (`G.world` entity lists and progress), `G.players` (a `Map` of id → `{ player, char, avatar, net }`) and `G.me`. Add `G.char` as a compatibility alias for the local character during the transition. | L |
| `game.js` (loop) | Separate `simulate(dt)`, which only the host runs and which keeps running in co-op whatever the UI shows, from `presentLocal(dt)` (local player, camera, HUD). Real-time sub-stepping in co-op. | M |
| `game.js` (systems) | Pass the player as a parameter to `nextInteractable(p)`, `explore(p)`, `updatePickups(p)`, `updateEnemyBullets` (local player only), `explodeAt` (each local victim), `updateObjectives` (any player), `streamCamps` (nearest player), `startBossFight` (rally), `bossKilled` (events instead of `setTimeout`), `arriveHome` (per player, raids decided by the host) | L |
| `game.js` (saves) | v4 character/world split, migration, profile inference; guest character read and write | M |
| `entities.js` `Player` | Read stats from `this.char` (`up`, `gear`, `vessels`, `plating`) instead of `G.*`. Keep reading `Input` only for the local player. | M |
| `entities.js` `Enemy`, `Boss` | Add a `this.target` chosen by `G.pickTarget(e)` (nearest living player; boss: rotating by threat). Replace all `G.player` reads. Add network ids. Explicit tier. Boss HP scaling. | L |
| `entities.js` `Companion` | An `owner` field; formation, heal and shield work on `owner.player`; `_cid` scoped per owner | M |
| `villages.js`, `wardens.js`, `story.js` | Changes to world state become `Net.request(...)`, handled immediately in solo. The summit check runs for any player. `Lift.ride` moves only the rider. Story events become broadcasts. | M |
| `ui.js` | Screens stop pausing in co-op. Room and shield building become host requests. Remote names are escaped. Lobby screens. Player list on the HUD. | M |
| `worldmap.js` | Fog stays local. Pins become shared in co-op, coloured by player (phase 7). Show other players on the map, compass and radar. | S |
| **New** `js/net.js` | Transport interface: PeerJS, `BroadcastChannel` and loopback implementations; handshake; codes; validation; rate limits | M |
| **New** `js/netsync.js` | Snapshot encoding and decoding, interpolation buffers, event dispatch, remote player and enemy proxies | L |
| **New** `vendor/peerjs.min.js` | Vendored library (MIT) | S |
| `index.html`, `style.css` | Co-op menu (Host / Join / code box), lobby, name field, in-game player list, "host is away" banner | S |
| `touch.js`, `gamepad.js` | A ping button, plus nothing else | S |
| `tools/build_standalone.py` | No change needed: it already inlines every script tag, including `vendor/…` | — |
| `README.md` | A co-op section | S |

**Order that keeps risk lowest**
1. Determinism fixes. Only the world changes, and saves are protected by the profile.
2. A pure players-list refactor with no networking.
3. The simulate/present split.
4. The v4 save split.
5. Transport.
6. Each synced system, one at a time.

Each step lands separately with single-player tests passing.

---

## 8. Staged implementation plan

### Phase 0 — Deterministic worlds (S–M)
- **Changes:**
  - Add a world `profile` (`'full'` or `'lite'`) to the save and to `World.build`. **The profile, not performance mode, decides content counts.**
  - A co-op world always uses the **host's** profile, whatever each guest's performance mode is.
  - Replace the random-comparator sort in `placeSprites`.
  - Give purely visual scattering (flora, snowmen, decorative props) **its own seeded random source**. Lowering it in performance mode then no longer shifts the main sequence, so a phone can keep its lighter visuals.
  - Add `World.fingerprint()`.
- **Test:**
  - Build seed X with the profile fixed while performance mode is switched on and off, and confirm the fingerprints match.
  - Run the same in Chrome, Firefox and WebKit through Playwright, which bundles all three engines.
  - Load v3 saves from both kinds of device and confirm caches, caves and sprites are where they were.
- **Could go wrong:**
  - Cross-engine floating-point differences (D10) show up. If they do, round `Terra.raw` to 1e-6 before comparisons in the layout code, or have the host send a list of landmarks.

### Phase 1 — Players list, no networking (L)
- **Changes:**
  - `G.players`, `G.me`, a `Character` object, and the player passed as a parameter through every system.
  - Enemies and bosses get `target`; companions get `owner`.
  - The simulate/present split. The v4 save split and migration.
- **Test:**
  - Every existing Playwright script stays green.
  - A new debug mode `?bots=1` adds a **second local "dummy player"** that walks a scripted path. Enemies must switch targets to it, camps must wake around it, and its uplink presence must count.
  - Load v1, v2 and v3 saves and round-trip them through v4.
- **Could go wrong:**
  - A missed `G.player` reference that only shows in a rare path (lift, raid, ending). Grep for zero direct reads outside a `me()` accessor, and run the full regression suite.

### Phase 2 — Connection and lobby (M)
- **Changes:**
  - `net.js` with PeerJS, `BroadcastChannel` and loopback transports.
  - Host / Join menu, codes, join prompt, handshake (version + fingerprint), player list, ping display, leave and kick.
- **Test:**
  - Two tabs over `BroadcastChannel` in Playwright.
  - Then two real devices on different networks (home Wi-Fi + phone on 4G) over PeerJS: measure how often connections succeed, with and without TURN.
- **Could go wrong:**
  - Carrier networks need TURN.
  - The public PeerServer is down. Show a clear error, and keep a self-hosted fallback URL as a setting.

### Phase 3 — Moving and shooting together in a quiet world (M)
- **Changes:**
  - Remote player proxies (a light `buildAvatarModel`, name tag), 20 Hz transforms, interpolation, pose flags, dash and travel events.
  - `fire` events showing remote bolts. Camps, raids and uplinks are **disabled** in a `?coop-proto` mode.
- **Test:**
  - Two players walk, climb, glide, jetpack and swim around each other.
  - Measure jitter and latency from timestamped logs.
  - Run on a phone in performance mode.
- **Could go wrong:**
  - Stutter from clock drift. Tune the interpolation delay, and fall back to extrapolation for at most 150 ms.

### Phase 4 — Enemies and camps (L)
- **Changes:**
  - Host-run camps that wake around the nearest player; enemy ids; snapshots with interest management.
  - Spawn and fire events; enemy projectiles simulated on every client.
  - Victim-checked hits; shooter-checked hits with host checks; kill events; instanced loot.
  - Uplinks with any-player presence; raids decided by the host.
- **Test:**
  - Two players clear a camp from opposite sides.
  - An uplink with one player inside and one guarding.
  - A guest out of the host's view (more than 300 m apart) fights their own camp.
  - Compare "hits I felt" logs with the host's view.
- **Could go wrong:**
  - The host's CPU with two far-apart players; enforce the caps.
  - Hit disagreements ("I shot it but it didn't die"). Log them, and keep the host's checks loose.

### Phase 5 — Bosses (L)
- **Changes:**
  - Per-arena dome state, the rally countdown, the inside set, HP scaling, rotating targets.
  - Boss snapshots and pattern events (markers, lasers, waves, sonar, lobs).
  - Downed/revive in domes, a team wipe resets the fight, shared ending sequence.
- **Test:**
  - All six Warden routes with two players, including Deepsong underwater and Stormwing via the Sky Lift.
  - Phase change at 50 %.
  - A guest disconnecting mid-fight.
- **Could go wrong:**
  - Patterns that read `G.player` deep inside `think()` (about 400 lines). Lasers and gusts need care.
  - Fairness of the beams: they are checked by each victim, so they must be simulated from the same start angle and time (sent in the pattern event).

### Phase 6 — World progress and saves (M–L)
- **Changes:**
  - Interact requests for caches, sprites, secrets, mirrors, the frost key, the summit, the lift, the bridge quest, rooms and the shield.
  - Shared rewards; the host saves the world; guests save their portable character; reconnect within 5 minutes.
  - Menus that don't pause, with safe zones; local focus aim.
- **Test:**
  - A full session: start fresh, free Brambleback together, leave and rejoin, the host reloads its save, the guest reloads their single-player save and finds the gear they earned in co-op.
  - Old saves still load.
- **Could go wrong:**
  - Duplicates from a reward and a disconnect racing each other. Make rewards idempotent with an id per event.

### Phase 7 — Polish (M)
- **Changes:**
  - Binary snapshots; reconnect handling.
  - A "host is away" mode (host tab hidden → guests see a pause banner, and the host's simulation pauses cleanly rather than stuttering).
  - **Ping markers** (a gamepad button and a touch button), shared map pins, teammates on the compass and radar.
  - Medic and bubble bots helping teammates; mixed latency tests (a simulated 150 ms + 2 % loss transport); a TURN fallback setting; the README.
- **Test:**
  - A loss/latency simulator in the loopback transport, and a 30-minute 4-player soak test.

### First throwaway prototype spec ("two robots, one world")
- **Goal:** prove that the same seed builds the same world on two devices and that P2P works on your real networks. Before Phase 1, so it is hacky on purpose, on a branch, and not merged.
- **Scope:**
  1. `?proto=host`: generate a 6-character code, register a PeerJS id, show the code.
  2. `?proto=join&code=XXXXXX`: connect and send `{hello, build, fingerprint}`. The host replies `{seed, profile}`, the guest rebuilds the world with `buildWorld(seed)`, and both show "World match ✓" or "✗".
  3. Both start a game with **camps, raids and saves turned off**; the tutorial is skipped.
  4. Each side sends `{x,y,z,yaw,pitch,flags}` at 20 Hz as JSON. The other side draws a second `buildAvatarModel()` with the third-person animation fed from the interpolated state, plus a floating name.
  5. A small overlay shows ping, packets per second and the world fingerprint.
- **Measure:**
  - Connection success on 3–5 network pairs (home ↔ home, home ↔ 4G, school or office Wi-Fi).
  - Ping, how smooth the motion looks, fingerprint matches across Chrome, Firefox, Safari and Android, and phone frame rate with a remote avatar.
- **Out of scope:** enemies, shooting, saves, the lobby UI, binary encoding.

---

## 9. Risks and honest assessment

| Risk | Likelihood / impact | Mitigation |
| --- | --- | --- |
| World differs between devices (D1–D8) | **Certain** today / fatal | Phase 0 (profile, fingerprint) |
| Floating-point differences between engines (D10) | Low–medium / high | Fingerprint tests in three engines early. Round layout comparisons. As a last resort the host sends a landmark list. |
| NAT failures without TURN | Medium (mobile data) / high for those players | Free-tier TURN from Phase 2; a Durable Object relay as a backup transport |
| Public PeerServer outages | Low–medium / blocks new joins | Clear error; a self-hostable signalling URL setting |
| Host tab in the background | High (people alt-tab) / world freezes | Detect `visibilitychange`, pause cleanly with a banner, and tell hosts to keep the window visible. A worker-driven tick could keep a minimised host simulating (worth trying, but not promised). |
| Phase 1 refactor regressions | Medium / high | Small commits, the full Playwright suite on each, a `?bots=1` dummy player |
| Host CPU with spread-out players | Medium / stutter for everyone | Enemy caps for each player and in total; recommend a desktop host; limit phone hosts to 2 players |
| Hit disagreements under lag | Medium / annoying | Shooter-checked hits, victim-checked damage, loose host checks |
| `innerHTML` with remote names (XSS) | Low (friends) / high | `textContent` only; an escaping helper; a review checklist |
| Scope creep (revives, shared pins, healing teammates) | High | Keep them in Phase 7. Ship Phases 0–6 first. |

**Effort by phase:**

| Phase | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Size | S–M | **L** | M | M | **L** | **L** | M–L | M |

**What I'd cut or postpone**
- **Host migration:** cut. The world save belongs to the host.
- **Co-op on the claude.ai artifact copy:** postpone. Use GitHub Pages.
- **Remote players' bots in full detail on phones:** draw them simpler.
- **Downed/revive outside boss domes:** postpone; respawn at home is enough at first.
- **Medic/bubble helping teammates:** postpone to Phase 7.
- **More than 4 players:** don't. Camps, domes and the enemy budget are tuned for small groups.

**Parts of the current design that conflict with co-op**

| Conflict | Recommendation |
| --- | --- |
| Menus and the field kit freeze time | Co-op never pauses; safe zones at home and in villages; single-player unchanged |
| Focus slow-motion and slow-motion effects | Local zoom and steady aim in co-op; slow-motion stays in single-player |
| "Just you and your bots" sealed domes | Rally countdown, then a team seal and HP scaling |
| Death rolls back the inventory and reopens the dome | Co-op: keep the inventory (optional Botbucks penalty); team-wipe resets the fight; single-player unchanged |
| Opening scene and tutorial | Single-player only; guests skip; hosting needs a finished tutorial |
| Character stats stored in world progress (`story.plating`; `logs` and `botparts` counters) | Move plating and the bot-part counter into the character in the v4 save; memory logs stay world progress (they are story), with each player notified |
| World content depends on performance mode | Content profile saved with the world; performance mode only changes visuals |
| Enemy tier taken from the player's region (`G.level`) | Always pass the tier explicitly (camp, beacon or zone) |
| Raids and drops rolled by `Math.random` on whichever client runs the code | Only the host decides them; loot is instanced for each client |

---

## Questions before Phase 1

1. **Guest characters:** are you happy with **portable characters**, where a guest's gear, Botbucks and bots come from their own single-player save and go back into it? The alternative is a separate, fresh co-op character for each host's world. Portable is friendlier; separate stops gear from "leaking" between worlds.
2. **Loot:** do you agree with **instanced loot** (everyone gets their own drops) and **shared discoveries** (secrets and sprites reward everyone)?
3. **No pausing in co-op**, with safe zones at home and in villages. Is that acceptable, or do you want "any menu pauses everyone", which is simpler but frustrating with 3–4 people?
4. **Boss fights:** is the **rally countdown, then sealed together** model right, and is ×1.65 HP for a second player roughly the difficulty you want?
5. **Bots in co-op:** is a cap of **2 active bots per player** acceptable?
6. **Hosting the game:** can we publish the game on **GitHub Pages** from this repo, so join links work? Room codes would still work from the standalone file.
7. **TURN:** are you willing to create a free account with a TURN provider (e.g. Cloudflare), whose credentials would sit in the client? That is normal for TURN and fine for friends-only use. Or should we start with STUN only and see how often connections fail?
8. **Phone hosting:** should phones be allowed to host (limited to 2 players), or should only desktops host?
9. **Death in co-op:** is keeping your inventory (with an optional small Botbucks penalty) right, instead of today's rollback to the last save?
10. **Timeline:** do you want the **throwaway prototype** (two robots walking in one world) first as a go/no-go check, before committing to the Phase 1 refactor? I recommend it.
