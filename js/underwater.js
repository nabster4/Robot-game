'use strict';
// The Sunken Reach: the sea under the Saltglass Coast. Rivet doesn't breathe, so the danger down here is
// pressure: each Pressure Hull tier is rated deeper. Kelp forests, coral, glowing vents, sunken wrecks with
// treasure and memories, robot camps of the deep, and at the very bottom the Drowned Trench where the
// ocean Warden, Deepsong, sings.

const SEA = {
  deep: new THREE.Color('#0a3550'), abyss: new THREE.Color('#020a14'), shallow: new THREE.Color('#1f7a96'),
  hemiTop: new THREE.Color('#7fd8e8'), hemiBot: new THREE.Color('#04121c'),
};

const Sea = {
  // the trench and its arena are chosen with the other landmarks, before the heights
  plan(W, flats) {
    const T = TERRA[4];
    for (let t = 0; t < 600; t++) {
      const a = rand(0, TAU), d = rand(40, 230), x = T.cx + Math.cos(a) * d, z = T.cz + Math.sin(a) * d;
      if (Math.max(Math.abs(x), Math.abs(z)) > W.half * 0.78 || Math.hypot(x, z) < 520) continue;
      if (Terra.raw(x, z) > WORLD.water - 40 || flats.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + 90)) continue;
      flats.push({ x, z, r: 34, h: -92 });
      W.arenaPlans.push({ i: 5, x, z, r: 30, y: -92, beacons: [] });
      return;
    }
  },

  build(W) {
    W.wrecks = []; W.vents = [];
    const low = W.lowSpec;
    const spots = [];   // points on the sea floor: [x, z, h, depth]
    for (let i = 0, n = low ? 2600 : 4200; i < n; i++) {
      const x = rand(-W.half * 0.9, W.half * 0.9), z = rand(-W.half * 0.9, W.half * 0.9);
      const h = W.heightAt(x, z), depth = WORLD.water - h;
      if (depth < 3 || W.isHole(x, z)) continue;
      if (W.arenas.some((A) => Math.hypot(A.x - x, A.z - z) < A.r + 6)) continue;
      spots.push([x, z, h, depth]);
    }
    // kelp forests (instanced, grouped by area so they can be culled)
    const kelpGeo = new THREE.BoxGeometry(0.16, 1, 0.05); kelpGeo.translate(0, 0.5, 0);
    const kelpMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, metalness: 0, flatShading: true });
    const groups = new Map(), col = new THREE.Color(), d = new THREE.Object3D();
    for (let i = 0; i < spots.length; i++) {
      const [x, z, h, depth] = spots[i];
      if (depth < 4 || _rng() > 0.55) continue;
      const key = Math.floor((x + 1e4) / 300) + ',' + Math.floor((z + 1e4) / 300);
      let g = groups.get(key); if (!g) { g = []; groups.set(key, g); }
      for (let k = randi(3, 7); k > 0; k--) g.push([x + rand(-2.5, 2.5), z + rand(-2.5, 2.5), h, Math.min(depth - 1, rand(3, 10))]);
    }
    for (const list of groups.values()) {
      const m = new THREE.InstancedMesh(kelpGeo, kelpMat, list.length);
      list.forEach(([x, z, h, len], k) => {
        d.position.set(x, W.heightAt(x, z) - 0.2, z); d.rotation.set(rand(-0.15, 0.15), rand(0, TAU), rand(-0.15, 0.15)); d.scale.set(rand(0.8, 1.4), len, 1); d.updateMatrix();
        m.setMatrixAt(k, d.matrix);
        col.set(pick(['#2f7a3a', '#3e8a2e', '#5a7a2a', '#2a6a4a'])); col.offsetHSL(0, 0, rand(-0.05, 0.05)); m.setColorAt(k, col);
      });
      W.group.add(m);
    }
    // coral, anemones and rocks (batched)
    const coralCols = ['#ff7a9a', '#ff9f43', '#b98cff', '#ffd23f', '#ff5a7a', '#4ae0d0'];
    const coralMats = coralCols.map((c) => Mat.std(c, { rough: 0.6, metal: 0.1, emissive: c, ei: 0.25 }));
    const rockM = Mat.std('#3a4a52', { rough: 0.95, metal: 0.05 });
    for (let i = 0; i < spots.length; i += 3) {
      const [x, z, h] = spots[i];
      const r = _rng();
      if (r < 0.45) {
        const m = pick(coralMats);
        for (let k = randi(2, 5); k > 0; k--) {
          const s = rand(0.4, 1.2), cx = x + rand(-1.5, 1.5), cz = z + rand(-1.5, 1.5), cy = W.heightAt(cx, cz);
          if (_rng() < 0.5) Batch.add(Geo.cyl(0, 0.5, 2, 6), m, cx, cy + s, cz, s, s * rand(0.8, 1.6), s, rand(-0.3, 0.3), 0, rand(-0.3, 0.3), false);
          else Batch.add(Geo.sphere(0.6, 1), m, cx, cy + s * 0.3, cz, s * 1.3, s * 0.7, s * 1.3, 0, rand(0, 3), 0, false);
        }
      } else if (r < 0.6) {
        const c = pick(['#7fffd4', '#ff9fd8', '#ffe14d']);
        for (let k = randi(3, 6); k > 0; k--) Batch.add(Geo.sphere(0.18, 0), Mat.glow(c, 2.2), x + rand(-1, 1), h + rand(0.2, 0.7), z + rand(-1, 1), 1, 1, 1, 0, 0, 0, false);
      } else if (r < 0.78) {
        const s = rand(1, 3.5);
        Batch.add(Geo.sphere(1, 0), rockM, x, h + s * 0.2, z, s, s * rand(0.5, 1), s, rand(0, 3), rand(0, 3), 0);
        W.addCollider(x, z, s * 0.8, h + s * 0.8, 'rock');
      }
    }
    // glowing vents that stream bubbles
    for (let i = 0, made = 0; i < spots.length && made < (low ? 8 : 14); i += 37) {
      const [x, z, h, depth] = spots[i];
      if (depth < 8) continue;
      Batch.add(Geo.cyl(0.6, 1.4, 1.6, 7), rockM, x, h + 0.6, z);
      Batch.add(Geo.cyl(0.45, 0.45, 0.1, 10), Mat.glow('#4ae0d0', 2.6), x, h + 1.42, z, 1, 1, 1, 0, 0, 0, false);
      W.vents.push({ x, z, y: h + 1.5 });
      made++;
    }
    this.buildWrecks(W);
    this.planCamps(W);
  },

  // sunken wrecks, deeper and richer the further out they lie (deep ones need a better hull)
  buildWrecks(W) {
    const want = [9, 20, 33, 46, 64];
    const kinds = ['log', 'botpart', 'plating', 'log', 'treasure'];
    const wood = Mat.std('#4a3424', { rough: 0.9, metal: 0.05 }), rust = Mat.std('#6a3a24', { rough: 0.8, metal: 0.5 });
    want.forEach((depth, i) => {
      let at = null;
      for (let t = 0; t < 900 && !at; t++) {
        const x = rand(-W.half * 0.85, W.half * 0.85), z = rand(-W.half * 0.85, W.half * 0.85);
        const h = W.heightAt(x, z), dd = WORLD.water - h;
        if (Math.abs(dd - depth) > 5 || W.slopeAt(x, z) > 0.5 || Terra.weights(x, z)[4] < 0.4) continue;
        if (W.wrecks.some((w) => Math.hypot(w.x - x, w.z - z) < 90) || W.arenas.some((A) => Math.hypot(A.x - x, A.z - z) < A.r + 20)) continue;
        at = { x, z, h };
      }
      if (!at) return;
      const g = new THREE.Group(); g.position.set(at.x, at.h, at.z); g.rotation.set(0, rand(0, TAU), rand(-0.25, 0.25)); W.group.add(g);
      // a broken hull: keel, ribs, planks and a snapped mast
      mesh(Geo.box(2.2, 0.6, 12), wood, 0, 0.3, 0, g);
      for (let k = -5; k <= 5; k += 1.25) for (const s of [-1, 1]) { const rib = mesh(Geo.box(0.25, 2.6, 0.25), wood, s * 1.6, 1.3, k, g); rib.rotation.z = s * -0.35; }
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const pl = mesh(Geo.box(0.12, 0.6, rand(5, 9)), wood, s * (1.25 + k * 0.35), 0.6 + k * 0.7, rand(-2, 2), g); pl.rotation.z = s * -0.35; }
      const mast = mesh(Geo.cyl(0.2, 0.25, 7, 6), rust, 0, 2.5, -1, g); mast.rotation.set(0.9, 0, 0.3);
      mesh(Geo.box(1.6, 1.2, 1.4), rust, 0, 1.1, 4, g);
      g.updateMatrixWorld(true);
      W.bake(g);
      W.addCollider(at.x, at.z, 2.2, at.h + 1.2, 'rock');
      const cx = at.x + 2.8, cz = at.z + 1.5;
      W.buildCache(cx, cz, true, W.heightAt(cx, cz), true);
      W.addSecret(kinds[i], at.x - 2.6, at.h + 1.2, at.z - 1, 'wreck' + i);
      W.wrecks.push({ x: at.x, z: at.z, y: at.h, depth });
    });
  },

  // robot camps of the deep (they spawn when you swim near, like camps on land)
  planCamps(W) {
    const pool = ZONES[5].pool;
    for (let t = 0, n = 0; t < 2000 && n < (W.lowSpec ? 7 : 10); t++) {
      const x = rand(-W.half * 0.85, W.half * 0.85), z = rand(-W.half * 0.85, W.half * 0.85);
      const h = W.heightAt(x, z), depth = WORLD.water - h;
      if (depth < 7 || depth > 50 || Terra.weights(x, z)[4] < 0.4 || W.slopeAt(x, z) > 0.6) continue;
      if (W.campSites.some((c) => Math.hypot(c.x - x, c.z - z) < 90) || W.arenas.some((A) => Math.hypot(A.x - x, A.z - z) < A.r + 40)) continue;
      // a glowing coral totem marks the camp
      Batch.add(Geo.cyl(0.3, 0.6, 3, 6), Mat.std('#2a4a5a', { rough: 0.7 }), x, h + 1.5, z);
      Batch.add(Geo.oct(0.6), Mat.glow('#ff7ad8', 2.6), x, h + 3.4, z, 1, 1.6, 1, 0, 0, 0, false);
      W.campSites.push({ x, z, y: h, r: 7, flames: [], alerted: false, under: true, tier: depth > 30 ? 3 : 2, pool, size: randi(3, 5), id: W.campSites.length });
      n++;
    }
  },

  // ═════════════════════════ The player in the water ═════════════════════════
  // deep enough to swim here? (shallow water is just wading)
  swimmable(x, z, y) {
    if (y > WORLD.water - 0.4) return false;
    const h = World.heightAt(x, z);
    if (h > WORLD.water - 1.1) return false;
    return World.hazardAt(x, z) === LIQUIDS.water || h < WORLD.water - 2;
  },
  get limit() { return HULL_DEPTH[(G.gear && G.gear.hull) || 0]; },
  depthOf(y) { return Math.max(0, WORLD.water - (y + 1)); },

  // swimming: you move where you look; JUMP rises, Shift / C sinks; idle, the heavy chassis sinks slowly
  swim(p, dt, I, mf, mr) {
    const lvl = (G.gear && G.gear.prop) || 0;
    const spd = 4.4 * (1 + 0.4 * lvl) * (p.slowT > 0 ? 0.6 : 1);
    const cp = Math.cos(p.pitch), fx = -Math.sin(p.yaw) * cp, fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * cp;
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const up = (I.key('Space') ? 1 : 0) - (I.key('ShiftLeft') || I.key('ShiftRight') || I.key('KeyC') ? 1 : 0);
    let tx = fx * mf + rx * mr, ty = fy * mf + up * (0.9 + 0.3 * lvl), tz = fz * mf + rz * mr;
    const L = Math.hypot(tx, ty, tz);
    if (L > 1) { tx /= L; ty /= L; tz /= L; }
    const k = 1 - Math.exp(-3 * dt);
    p.vel.x += (tx * spd - p.vel.x) * k;
    p.vel.z += (tz * spd - p.vel.z) * k;
    p.vel.y += ((L > 0.05 ? ty * spd : -0.9) - p.vel.y) * k;
    if (p.dashT > 0) { p.dashT -= dt; p.vel.x = p.dashDir.x * 16; p.vel.z = p.dashDir.z * 16; }
    const ox = p.pos.x, oz = p.pos.z;
    p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; p.pos.z += p.vel.z * dt;
    // the sea floor is solid: no walking up underwater cliffs by accident
    if (World.heightAt(p.pos.x, p.pos.z) > p.pos.y + 0.6) { p.pos.x = ox; p.pos.z = oz; p.vel.x *= 0.3; p.vel.z *= 0.3; }
    World.collide(p.pos, p.r, p.pos.y + 0.4);
    // the surface: float with your head out, or hop out onto a shore
    const top = WORLD.water - 1.15;
    if (p.pos.y > top) {
      if (up > 0 && World.heightAt(p.pos.x + fx * 2, p.pos.z + fz * 2) > WORLD.water - 1.4) { p.vel.y = 7; p.pos.y = top + 0.3; p.swim = false; }
      else { p.pos.y = top; p.vel.y = Math.min(p.vel.y, 0); }
    }
    p.gliding = false; p.jetting = false; p.climbing = null;
    if (Math.random() < dt * (2 + Math.hypot(p.vel.x, p.vel.y, p.vel.z))) Fx.glow.emit(p.pos.x + rand(-0.4, 0.4), p.pos.y + 1.4, p.pos.z + rand(-0.4, 0.4), rand(-0.2, 0.2), rand(1, 2), rand(-0.2, 0.2), rand(1, 2), 0.08, new THREE.Color('#dff6ff'), 1.2, 0, 0, 1);
    if (G.hint) G.hint(Touch.enabled ? 'Swimming — you move where you look · hold JUMP to rise' : 'Swimming — you move where you look · Space rises, Shift or C sinks');
  },

  // pressure: diving below your hull's rating crushes you slowly
  pressure(p, dt) {
    const depth = this.depthOf(p.pos.y), lim = this.limit;
    p.depth = depth;
    if (depth <= lim) { p.crush = Math.max(0, (p.crush || 0) - dt * 2); return; }
    p.crush = Math.min(1, (p.crush || 0) + dt);
    p.crushT = (p.crushT || 0) - dt;
    if (p.crushT <= 0) {
      p.crushT = 0.5;
      p.hurt(2 + (depth - lim) * 0.3, null, true);
      Sound.play('block', null, 0.6);
      Fx.addShake(0.15);
      if (G.hint) G.hint(`Hull pressure! Your ${HULL_NAMES[(G.gear && G.gear.hull) || 0]} is rated to ${lim} m — buy a stronger Pressure Hull in Saltpin Harbor`);
    }
  },

  // ═════════════════════════ Per-frame world effects ═════════════════════════
  update(dt, time, cam) {
    if (!World.vents) return;
    const near = (x, z, R) => Math.abs(x - cam.position.x) < R && Math.abs(z - cam.position.z) < R;
    for (const v of World.vents) {
      if (!near(v.x, v.z, 90) || Math.random() > dt * 14) continue;
      Fx.glow.emit(v.x + rand(-0.4, 0.4), v.y, v.z + rand(-0.4, 0.4), rand(-0.3, 0.3), rand(2, 4), rand(-0.3, 0.3), rand(2, 4), 0.14, new THREE.Color('#dff6ff'), 1.3, 0, 0, 1);
    }
    // the water surface glimmers from below
    if (World.waterMat) World.waterMat.opacity = cam.position.y < WORLD.water ? 0.7 : 0.86;
  },
};

// how far below the surface the camera is (0 above water) — the environment blend uses it
function camUnderwater(cam) {
  const y = cam.position.y;
  if (y >= WORLD.water - 0.05) return 0;
  if (World.heightAt(cam.position.x, cam.position.z) > WORLD.water - 0.2) return 0;
  return WORLD.water - y;
}
