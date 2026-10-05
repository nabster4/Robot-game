'use strict';
// The whole connected world: blended biome terrain, rivers, lava, waterfalls and caves (terrain.js),
// plus home base, arenas & beacons, the Sky Islands, shops, props, flora and enemy camp sites.

// the palette used for each terrain biome index (see TERRA)
const TERRA_PAL = () => [ZONES[0], ZONES[1], ZONES[2], ZONES[3], COAST];

const World = {
  size: WORLD.size,
  seg: WORLD.seg,
  hazardLevel: WORLD.water,

  build(scene, seed) {
    const t0 = performance.now();
    this.scene = scene;
    this.seed = seed;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.half = this.size / 2;
    this.N = this.size / this.seg;
    Terra.setup(seed);
    this.noise = Terra.n1;
    this.colliders = [];
    this.grid = new Map();
    this.beacons = []; this.caches = []; this.islands = []; this.braziers = []; this.sprites = [];
    this.terminals = []; this.chargePads = []; this.updraftCols = []; this.craters = [];
    this.shops = []; this.arenas = []; this.caves = []; this.secrets = []; this.waterfalls = []; this.campSites = [];
    this.homeDome = null; this.domeTrap = false;
    this.lowSpec = G.settings.quality === 'low';
    this.pal = TERRA_PAL();

    this.planLayout();
    this.computeHeights();
    this.planWaterfalls();
    this.planCaves();
    this.buildGround();
    this.buildWater();
    this.buildSky();
    this.buildLights();

    Batch.start(this.group, 400);
    this.buildHub();
    for (const A of this.arenaPlans) this.buildArena(A);
    for (const S of this.shopPlans) this.buildShop(S.x, S.z, S.y, S.biome);
    this.buildSkyRegion();
    this.buildCaves();
    this.buildWaterfalls();
    this.buildCraters();
    this.scatterProps();
    this.buildRuins();
    this.scatterFlora();
    this.placeCaches();
    this.placeSprites(45);
    this.planCamps();
    Batch.finish();
    // instanced trees & grass are grouped by area, so they can be culled like everything else
    this.group.traverse((o) => { if (o.isInstancedMesh) { o.computeBoundingSphere(); o.frustumCulled = true; } });

    this.arena = this.arenas[0];
    this.envInit();
    this.buildTime = performance.now() - t0;
    return this;
  },

  dispose() {
    if (!this.group) return;
    this.scene.remove(this.group);
    const shared = new Set(Geo.cache.values());
    this.group.traverse((o) => {
      if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose();
    });
    this.scene.remove(this.hemi, this.sun, this.sun.target);
    if (this.headlamp) this.scene.remove(this.headlamp);
    this.group = null;
  },

  // ═════════════════════ Layout & heights ═════════════════════
  // where the arenas, beacons and shops go — chosen before the heights so the ground can be levelled for them
  planLayout() {
    const flats = [{ x: 0, z: 0, r: 62, h: 8 }];
    const free = (x, z, r) => flats.every((f) => Math.hypot(f.x - x, f.z - z) > f.r + r + 25);
    const okGround = (x, z, i) => Terra.raw(x, z) > (i === 3 ? WORLD.lava + 4 : WORLD.water + 1.5) && Terra.weights(x, z)[i] > 0.45;
    this.arenaPlans = []; this.beaconPlans = []; this.shopPlans = [];
    for (let i = 0; i < 4; i++) {
      const T = TERRA[i];
      let ax = T.cx * 0.9, az = T.cz * 0.9;
      for (let t = 0; t < 60; t++) {
        const x = T.cx * 0.9 + rand(-80, 80), z = T.cz * 0.9 + rand(-80, 80);
        if (okGround(x, z, i) && free(x, z, 34)) { ax = x; az = z; break; }
      }
      const h = Math.max(WORLD.water + 2.5, Terra.raw(ax, az));
      flats.push({ x: ax, z: az, r: 34, h });
      const A = { i, x: ax, z: az, r: 30, y: h, beacons: [] };
      this.arenaPlans.push(A);
      const nb = ZONES[i].beacons, a0 = rand(0, TAU);
      for (let k = 0; k < nb; k++) {
        for (let t = 0; t < 120; t++) {
          const a = a0 + (k / nb) * TAU + rand(-0.35, 0.35) * (1 + t / 40), r = rand(90, 175);
          const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
          if (Math.max(Math.abs(x), Math.abs(z)) > this.half * 0.8 || !okGround(x, z, i) || !free(x, z, 11)) continue;
          const bh = Math.max(WORLD.water + 2.5, Terra.raw(x, z));
          flats.push({ x, z, r: 11, h: bh, beacon: true });
          this.beaconPlans.push({ x, z, biome: i, arena: A });
          break;
        }
      }
      // the biome's shop sits on the road from home base to its arena
      for (let t = 0; t < 40; t++) {
        const k = rand(0.42, 0.58), side = rand(-40, 40);
        const L = Math.hypot(ax, az), px = -az / L, pz = ax / L;
        const x = ax * k + px * side, z = az * k + pz * side;
        if (Terra.raw(x, z) < WORLD.water + 1.5 || !free(x, z, 10)) continue;
        flats.push({ x, z, r: 12, h: Math.max(WORLD.water + 2.5, Terra.raw(x, z)) });
        this.shopPlans.push({ x, z, biome: i });
        break;
      }
    }
    this.flats = flats;
  },

  shapedHeight(x, z) {
    let h = Terra.raw(x, z);
    for (const f of this.flats) {
      const dx = x - f.x, dz = z - f.z, R = f.r * 1.8;
      if (dx > R || dx < -R || dz > R || dz < -R) continue;
      const k = 1 - smoothstep(f.r * 0.8, f.r * 1.8, Math.hypot(dx, dz));
      if (k > 0) h = lerp(h, f.h, k);
    }
    return Math.max(h, WORLD.water - 70);
  },

  computeHeights() {
    const N = this.N, W = N + 1, s = this.seg, half = this.half;
    this.heights = new Float32Array(W * W);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) this.heights[j * W + i] = this.shapedHeight(-half + i * s, -half + j * s);
    for (const S of this.shopPlans) S.y = this.heightAt(S.x, S.z);
    for (const A of this.arenaPlans) A.y = this.heightAt(A.x, A.z);
  },

  heightAt(x, z) {
    const N = this.N, s = this.seg;
    const fx = clamp((x + this.half) / s, 0, N - 0.0001), fz = clamp((z + this.half) / s, 0, N - 0.0001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const H = this.heights, W = N + 1;
    const a = H[iz * W + ix], b = H[iz * W + ix + 1], c = H[(iz + 1) * W + ix], d = H[(iz + 1) * W + ix + 1];
    // match the triangle split used by the ground mesh (a-c-b / c-d-b)
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  },
  slopeAt(x, z) {
    const e = 2;
    return Math.hypot(this.heightAt(x + e, z) - this.heightAt(x - e, z), this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
  },
  // uphill direction (unit) and steepness
  gradAt(x, z) {
    const e = 1.5;
    const gx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e), gz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    const g = Math.hypot(gx, gz) || 1e-6;
    return { x: gx / g, z: gz / g, s: g };
  },

  // which liquid (if any) covers the ground here
  hazardAt(x, z) {
    const h = this.heightAt(x, z);
    if (h < WORLD.lava - 0.15 && Terra.weights(x, z)[3] > 0.5) return LIQUIDS.lava;
    if (h < WORLD.water - 0.15) return LIQUIDS.water;
    return null;
  },
  inHazard(x, z) { return !!this.hazardAt(x, z); },

  // region info at a point (used for music, weather, the HUD and enemy pools)
  regionAt(x, z, y = 0) {
    if (Math.hypot(x, z) < 110) return REGIONS.hub;
    if (Math.hypot(x - SKY_REGION.x, z - SKY_REGION.z) < SKY_REGION.r + 30 && y > this.skyFloor - 25) return REGIONS.sky;
    return REGIONS.terra[Terra.dominant(x, z)];
  },

  // ═════════════════════ Waterfalls ═════════════════════
  planWaterfalls() {
    const cands = [];
    const dirs = [];
    for (let k = 0; k < 8; k++) dirs.push([Math.cos(k * TAU / 8), Math.sin(k * TAU / 8)]);
    for (let z = -this.half * 0.82; z < this.half * 0.82; z += 13) {
      for (let x = -this.half * 0.82; x < this.half * 0.82; x += 13) {
        if (Terra.hubMask(x, z) > 0.05) continue;
        const w = Terra.weights(x, z);
        if (w[3] > 0.35) continue;
        const ht = this.heightAt(x, z);
        if (ht < WORLD.water + 5) continue;
        let best = null;
        for (const [dx, dz] of dirs) {
          const hb = this.heightAt(x + dx * 13, z + dz * 13);
          const drop = ht - hb;
          if (drop < 13) continue;
          if (this.heightAt(x - dx * 8, z - dz * 8) < ht - 2.5) continue;   // a plateau behind the lip
          if (this.heightAt(x + dx * 3, z + dz * 3) < ht - 6) continue;
          if (!best || drop > best.drop) best = { x, z, dx, dz, ht, drop };
        }
        if (best && this.flats.every((f) => Math.hypot(f.x - x, f.z - z) > f.r + 30)) cands.push(best);
      }
    }
    cands.sort((a, b) => b.drop - a.drop);
    const H = this.heights, W = this.N + 1, s = this.seg;
    for (const c of cands) {
      if (this.waterfalls.length >= (this.lowSpec ? 9 : 14)) break;
      if (this.waterfalls.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 160)) continue;
      // find the foot of the cliff
      let d = 4;
      while (d < 40 && this.heightAt(c.x + c.dx * d, c.z + c.dz * d) > c.ht - c.drop * 0.9) d += 1;
      const bx = c.x + c.dx * (d + 5), bz = c.z + c.dz * (d + 5);
      // carve a plunge pool at the bottom and a stream bed across the top
      const pool = WORLD.water - 2.6, R = 11;
      const i0 = Math.floor((bx - R + this.half) / s), i1 = Math.ceil((bx + R + this.half) / s);
      const j0 = Math.floor((bz - R + this.half) / s), j1 = Math.ceil((bz + R + this.half) / s);
      for (let j = Math.max(0, j0); j <= Math.min(this.N, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(this.N, i1); i++) {
        const px = -this.half + i * s, pz = -this.half + j * s, dd = Math.hypot(px - bx, pz - bz);
        const k = 1 - smoothstep(6, R, dd);
        if (k > 0) H[j * W + i] = Math.min(H[j * W + i], lerp(H[j * W + i], pool, k));
      }
      for (let t = 0; t < 24; t += 2) {
        const px = c.x - c.dx * t, pz = c.z - c.dz * t;
        const i = Math.round((px + this.half) / s), j = Math.round((pz + this.half) / s);
        if (i < 1 || j < 1 || i >= this.N || j >= this.N) continue;
        H[j * W + i] = Math.min(H[j * W + i], c.ht - 0.9);
      }
      this.waterfalls.push({ x: c.x, z: c.z, dx: c.dx, dz: c.dz, top: c.ht, foot: d, bx, bz });
    }
  },

  buildWaterfalls() {
    const tex = (() => {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
      const g = cv.getContext('2d');
      g.fillStyle = 'rgba(200,235,255,0.55)'; g.fillRect(0, 0, 64, 256);
      for (let i = 0; i < 70; i++) {
        g.fillStyle = `rgba(255,255,255,${(0.25 + Math.random() * 0.6).toFixed(2)})`;
        g.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 3, 20 + Math.random() * 80);
      }
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    })();
    this.fallTex = tex;
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: '#e4f6ff', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const streamMat = new THREE.MeshStandardMaterial({ color: '#4aa8dc', emissive: '#1a5a7a', emissiveIntensity: 0.4, transparent: true, opacity: 0.85, roughness: 0.1 });
    for (const f of this.waterfalls) {
      // the curtain follows an arc from the lip down to the pool, kept clear of the cliff face
      const pts = [];
      const steps = 14, width = 5.5;
      let off = 0.5;
      for (let k = 0; k <= steps; k++) {
        const s = k / steps;
        const y = lerp(f.top + 0.15, WORLD.water + 0.1, s);
        while (off < f.foot + 6 && this.heightAt(f.x + f.dx * off, f.z + f.dz * off) > y - 0.8) off += 0.4;
        pts.push([f.x + f.dx * off, y, f.z + f.dz * off]);
      }
      const px = -f.dz, pz = f.dx;
      const pos = [], uv = [], idx = [];
      pts.forEach(([x, y, z], k) => {
        for (const side of [-1, 1]) { pos.push(x + px * side * width / 2, y, z + pz * side * width / 2); uv.push(side < 0 ? 0 : 1, k / steps * 3); }
        if (k) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.renderOrder = 2;
      this.group.add(m);
      // the stream feeding it
      const st = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.9, 24), streamMat);
      st.rotation.x = -Math.PI / 2; st.rotation.z = -Math.atan2(f.dz, f.dx) + Math.PI / 2;
      st.position.set(f.x - f.dx * 11, f.top - 0.35, f.z - f.dz * 11);
      this.group.add(st);
      const mist = glowSprite('#ffffff', 16, 0.35); mist.position.set(pts[steps][0], WORLD.water + 2, pts[steps][2]); this.group.add(mist);
      f.pts = pts; f.mist = mist;
    }
  },

  // ═════════════════════ Caves ═════════════════════
  planCaves() {
    const N = this.N, W = N + 1, s = this.seg;
    this.hole = new Uint8Array(N * N);
    const TUN_R = 3.1, TUN_H = 4.4;
    const want = this.lowSpec ? 12 : 16;
    for (let t = 0; t < 2500 && this.caves.length < want; t++) {
      const x = rand(-this.half * 0.82, this.half * 0.82), z = rand(-this.half * 0.82, this.half * 0.82);
      if (Terra.hubMask(x, z) > 0.02 || Math.hypot(x - SKY_REGION.x, z - SKY_REGION.z) < 60) continue;
      if (this.flats.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + 45)) continue;
      const h0 = this.heightAt(x, z);
      if (h0 < WORLD.water + 1.5 || (Terra.weights(x, z)[3] > 0.5 && h0 < WORLD.lava + 1.5)) continue;
      const gr = this.gradAt(x, z);
      if (gr.s < 0.35) continue;
      if (this.heightAt(x + gr.x * 12, z + gr.z * 12) < h0 + 8 || this.heightAt(x + gr.x * 24, z + gr.z * 24) < h0 + 13) continue;
      // the mouth opens at the foot of the slope, onto level ground
      const front = this.heightAt(x - gr.x * 6, z - gr.z * 6);
      if (front < h0 - 7 || front > h0 + 1.5 || front < WORLD.water + 1) continue;
      if (this.caves.some((c) => Math.hypot(c.mouth.x - x, c.mouth.z - z) < 120)) continue;
      const f0 = h0 + 0.15;
      const nodes = [{ x: x - gr.x * 5, z: z - gr.z * 5, y: f0 }, { x: x + gr.x * 6, z: z + gr.z * 6, y: f0 }];
      let ang = Math.atan2(gr.z, gr.x);
      const len = randi(3, 6);
      let ok = true;
      for (let k = 0; k < len; k++) {
        const prev = nodes[nodes.length - 1];
        ang += rand(-0.6, 0.6);
        const nx = prev.x + Math.cos(ang) * rand(10, 13), nz = prev.z + Math.sin(ang) * rand(10, 13);
        const fy = prev.y - rand(0.3, 1.5);
        if (this.heightAt(nx, nz) < fy + TUN_H + 4 || Math.max(Math.abs(nx), Math.abs(nz)) > this.half * 0.85) break;
        // past the mouth the whole tunnel must stay buried (sample along it and to both sides)
        if (nodes.length >= 2) {
          let buried = true;
          for (let q = 0; q <= 4 && buried; q++) {
            const t = q / 4, cx = lerp(prev.x, nx, t), cz = lerp(prev.z, nz, t), cy = lerp(prev.y, fy, t);
            for (const s of [-1, 0, 1]) if (this.heightAt(cx - Math.sin(ang) * s * (TUN_R + 1.5), cz + Math.cos(ang) * s * (TUN_R + 1.5)) < cy + TUN_H + 2.5) { buried = false; break; }
          }
          if (!buried) break;
        }
        if (this.caves.some((c) => c.nodes.some((n) => Math.hypot(n.x - nx, n.z - nz) < 30))) { ok = false; break; }
        nodes.push({ x: nx, z: nz, y: fy });
      }
      if (!ok || nodes.length < 4) continue;
      // rooms only where the rock above is thick enough all around
      const cover = (n, r, h) => { for (let a = 0; a < TAU; a += TAU / 8) if (this.heightAt(n.x + Math.cos(a) * (r + 1), n.z + Math.sin(a) * (r + 1)) < n.y + h * 1.3 + 1.5) return false; return this.heightAt(n.x, n.z) > n.y + h * 1.3 + 1.5; };
      const last = nodes[nodes.length - 1];
      last.room = cover(last, 7.5, 6.5) ? { r: 7.5, h: 6.5 } : cover(last, 5, 4.6) ? { r: 5, h: 4.6 } : { r: 3.6, h: 4.2 };
      if (nodes.length > 5 && cover(nodes[3], 5, 4.6)) nodes[3].room = { r: 5, h: 4.6 };
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const n of nodes) { x0 = Math.min(x0, n.x - 9); x1 = Math.max(x1, n.x + 9); z0 = Math.min(z0, n.z - 9); z1 = Math.max(z1, n.z + 9); }
      const cave = { id: this.caves.length, nodes, mouth: { x, z, y: f0, ux: gr.x, uz: gr.z }, box: [x0, x1, z0, z1], tr: TUN_R, th: TUN_H, found: false };
      this.caves.push(cave);
      // a level apron of ground in front of the mouth
      {
        const ax = x - gr.x * 7, az = z - gr.z * 7, R = 11;
        const i0 = Math.max(0, Math.floor((ax - R + this.half) / s)), i1 = Math.min(N, Math.ceil((ax + R + this.half) / s));
        const j0 = Math.max(0, Math.floor((az - R + this.half) / s)), j1 = Math.min(N, Math.ceil((az + R + this.half) / s));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const px = -this.half + i * s, pz = -this.half + j * s;
          if ((px - x) * gr.x + (pz - z) * gr.z > 0.5) continue;   // leave the hillside itself alone
          const k = 1 - smoothstep(6, R, Math.hypot(px - ax, pz - az));
          if (k > 0) this.heights[j * W + i] = lerp(this.heights[j * W + i], f0 - 0.1, k);
        }
      }
      // open the hillside where the tunnel breaks the surface
      for (let k = 0; k < Math.min(3, nodes.length - 1); k++) {
        const a = nodes[k], b = nodes[k + 1];
        const ci0 = Math.floor((Math.min(a.x, b.x) - 6 + this.half) / s), ci1 = Math.ceil((Math.max(a.x, b.x) + 6 + this.half) / s);
        const cj0 = Math.floor((Math.min(a.z, b.z) - 6 + this.half) / s), cj1 = Math.ceil((Math.max(a.z, b.z) + 6 + this.half) / s);
        for (let j = Math.max(0, cj0); j < Math.min(N, cj1); j++) for (let i = Math.max(0, ci0); i < Math.min(N, ci1); i++) {
          const cx = -this.half + (i + 0.5) * s, cz = -this.half + (j + 0.5) * s;
          const dd = segPointDist(a.x, 0, a.z, b.x, 0, b.z, cx, 0, cz);
          if (dd > TUN_R + 1.4) continue;
          const H = this.heights;
          const hs = [H[j * W + i], H[j * W + i + 1], H[(j + 1) * W + i], H[(j + 1) * W + i + 1]];
          const fl = lerp(a.y, b.y, 0.5);
          if (Math.max(...hs) > fl + 0.6 && Math.min(...hs) < fl + TUN_H + 2) this.hole[j * N + i] = 1;
        }
      }
    }
  },

  isHole(x, z) {
    const s = this.seg, i = Math.floor((x + this.half) / s), j = Math.floor((z + this.half) / s);
    if (i < 0 || j < 0 || i >= this.N || j >= this.N) return false;
    return this.hole[j * this.N + i] === 1;
  },

  // the cave volume containing a point (or null): floor & ceiling heights at that spot
  caveAt(x, z, y) {
    let best = null;
    for (const c of this.caves) {
      const b = c.box;
      if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue;
      const N = c.nodes;
      for (let k = 0; k < N.length - 1; k++) {
        const a = N[k], e = N[k + 1];
        const vx = e.x - a.x, vz = e.z - a.z, L2 = vx * vx + vz * vz;
        const t = clamp(((x - a.x) * vx + (z - a.z) * vz) / L2, 0, 1);
        const px = a.x + vx * t, pz = a.z + vz * t, d = Math.hypot(x - px, z - pz);
        if (d > c.tr) continue;
        const floor = lerp(a.y, e.y, t), ceil = floor + c.th;
        if (y !== undefined && (y < floor - 1.6 || y > ceil + 0.6)) continue;
        if (!best || d < best.d) best = { cave: c, floor, ceil, d, rad: c.tr, px, pz };
      }
      for (const n of N) {
        if (!n.room) continue;
        const d = Math.hypot(x - n.x, z - n.z);
        if (d > n.room.r) continue;
        if (y !== undefined && (y < n.y - 1.6 || y > n.y + n.room.h + 0.6)) continue;
        if (!best || d / n.room.r < best.d / best.rad) best = { cave: c, floor: n.y, ceil: n.y + n.room.h, d, rad: n.room.r, px: n.x, pz: n.z };
      }
    }
    return best;
  },

  // keep something inside a cave from walking into the rock (the mouth stays open)
  caveClamp(p, r = 0.5) {
    if (this.caveAt(p.x, p.z, p.y) && !this._tightAt(p, r)) return;
    if (this.heightAt(p.x, p.z) < p.y + 1.2 && !this.isHole(p.x, p.z)) return;   // stepped out of the mouth
    let best = null;
    for (const c of this.caves) {
      const b = c.box;
      if (p.x < b[0] - 4 || p.x > b[1] + 4 || p.z < b[2] - 4 || p.z > b[3] + 4) continue;
      const N = c.nodes;
      for (let k = 0; k < N.length - 1; k++) {
        const a = N[k], e = N[k + 1], vx = e.x - a.x, vz = e.z - a.z;
        const t = clamp(((p.x - a.x) * vx + (p.z - a.z) * vz) / (vx * vx + vz * vz), 0, 1);
        const fl = lerp(a.y, e.y, t);
        if (Math.abs(p.y - fl) > 3) continue;
        const cx = a.x + vx * t, cz = a.z + vz * t, d = Math.hypot(p.x - cx, p.z - cz);
        if (!best || d - c.tr < best.over) best = { over: d - c.tr, cx, cz, d, R: c.tr };
      }
      for (const n of N) if (n.room && Math.abs(p.y - n.y) < 3) {
        const d = Math.hypot(p.x - n.x, p.z - n.z);
        if (!best || d - n.room.r < best.over) best = { over: d - n.room.r, cx: n.x, cz: n.z, d, R: n.room.r };
      }
    }
    if (!best || best.d < best.R - r) return;
    const k = (best.R - r) / (best.d || 1);
    p.x = best.cx + (p.x - best.cx) * k; p.z = best.cz + (p.z - best.cz) * k;
  },
  _tightAt(p, r) { const cv = this.caveAt(p.x, p.z, p.y); return !cv || cv.d > cv.rad - r; },

  buildCaves() {
    const rockM = new THREE.MeshStandardMaterial({ color: '#4c433a', roughness: 1, metalness: 0, flatShading: true, side: THREE.BackSide });
    const floorM = Mat.std('#3e352d', { rough: 1, metal: 0 });
    const n3 = Terra.n3;
    const jitter = (g, amt) => {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const k = 1 + n3(x * 0.9 + y * 0.31, z * 0.9 - y * 0.27) * amt;
        p.setXYZ(i, x * k, y, z * k);
      }
      g.computeVertexNormals();
    };
    const glowCols = ['#3cf2ff', '#6bff9e', '#b98cff', '#ffd23f'];
    for (const c of this.caves) {
      const N = c.nodes;
      for (let k = 0; k < N.length - 1; k++) {
        const a = N[k], b = N[k + 1];
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        const g = new THREE.CylinderGeometry(c.tr + 0.25, c.tr + 0.25, L + 2.2, 12, Math.max(2, Math.round(L / 2)), true);
        jitter(g, 0.35);
        g.rotateX(Math.PI / 2);
        const tube = new THREE.Mesh(g, rockM);
        tube.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 1.55, (a.z + b.z) / 2);
        tube.lookAt(b.x, b.y + 1.55, b.z);
        Batch.addObject(tube, false);
        const fl = new THREE.Mesh(Geo.box(c.tr * 2 + 0.6, 0.5, L + 1.5), floorM);
        fl.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.25, (a.z + b.z) / 2);
        fl.lookAt(b.x, b.y - 0.25, b.z);
        Batch.addObject(fl);
        // glowing crystal clusters light the way
        if (k > 0 && _rng() < 0.75) {
          const s2 = _rng() < 0.5 ? -1 : 1, t = rand(0.3, 0.7);
          const px = lerp(a.x, b.x, t) + (-(b.z - a.z) / L) * s2 * (c.tr - 0.5), pz = lerp(a.z, b.z, t) + ((b.x - a.x) / L) * s2 * (c.tr - 0.5);
          const col = pick(glowCols);
          for (let q = 0; q < 3; q++) Batch.add(Geo.oct(0.35), Mat.glow(col, 2.2), px + rand(-0.4, 0.4), lerp(a.y, b.y, t) + rand(0.2, 1), pz + rand(-0.4, 0.4), 1, rand(1.5, 2.6), 1, 0, rand(0, 3), 0, false);
        }
      }
      for (const n of N) {
        if (!n.room) continue;
        const g = new THREE.IcosahedronGeometry(1, 2);
        g.scale(n.room.r + 0.6, n.room.h * 0.85, n.room.r + 0.6);
        jitter(g, 0.12);
        const dome = new THREE.Mesh(g, rockM);
        dome.position.set(n.x, n.y + n.room.h * 0.45, n.z);
        Batch.addObject(dome, false);
        Batch.add(Geo.cyl(n.room.r + 0.4, n.room.r + 0.4, 0.5, 18), floorM, n.x, n.y - 0.25, n.z);
        const col = pick(glowCols);
        for (let q = 0; q < 5; q++) {
          const a = rand(0, TAU);
          Batch.add(Geo.oct(0.45), Mat.glow(col, 2.4), n.x + Math.cos(a) * n.room.r * 0.8, n.y + rand(0, 1.2), n.z + Math.sin(a) * n.room.r * 0.8, 1, rand(1.8, 3.2), 1, 0, rand(0, 3), 0, false);
        }
      }
      // a rocky arch frames the mouth
      const M = c.mouth, ux = M.ux, uz = M.uz, px = -uz, pz = ux;
      const rockArch = Mat.std('#6a5e52', { rough: 0.95, metal: 0.05 });
      for (let q = 0; q < 9; q++) {
        const a = Math.PI * (q / 8);
        const ox = Math.cos(a) * (c.tr + 0.9), oy = Math.sin(a) * (c.tr + 0.6);
        Batch.add(Geo.sphere(1, 0), rockArch, M.x + px * ox - ux * 0.5, M.y + 0.6 + oy, M.z + pz * ox - uz * 0.5, rand(0.9, 1.5), rand(0.9, 1.4), rand(0.9, 1.5), rand(0, 3), rand(0, 3), 0);
      }
      const moss = glowSprite('#6bff9e', 3, 0.6); moss.position.set(M.x, M.y + c.th + 0.5, M.z); this.group.add(moss);
      // what's hidden at the far end
      const end = N[N.length - 1];
      this.buildCache(end.x + rand(-1.5, 1.5), end.z + rand(-1.5, 1.5), true, end.y, true);
      const kinds = SECRET_ORDER;
      const kind = kinds[c.id % kinds.length];
      const sx = end.x + rand(-2.5, 2.5), sz = end.z + rand(-2.5, 2.5);
      this.addSecret(kind, sx, end.y + 1.1, sz, c.id);
      if (N[3] && N[3].room) this.addSecret(kinds[(c.id + 2) % kinds.length], N[3].x, N[3].y + 1.1, N[3].z, c.id);
    }
  },

  addSecret(type, x, y, z, cave) {
    const m = buildSecretModel(type);
    m.position.set(x, y, z);
    this.group.add(m);
    this.secrets.push({ id: this.secrets.length, type, x, y, z, model: m, found: false, cave, ph: rand(0, TAU) });
  },

  // ═════════════════════ Ground mesh ═════════════════════
  vertexColor(x, z, h, slope, out) {
    const w = Terra.weights(x, z), P = this.pal;
    let r = 0, g = 0, b = 0;
    const c = this._vc || (this._vc = new THREE.Color()), tmp = this._vt || (this._vt = new THREE.Color());
    for (let i = 0; i < P.length; i++) {
      if (w[i] < 0.02) continue;
      const G2 = P[i].ground, C = this.palC[i];
      const t = smoothstep(-4, i === 2 ? 60 : 16, h);
      tmp.copy(C.low).lerp(C.mid, Math.min(1, t * 1.6));
      if (t > 0.6) tmp.lerp(C.high, (t - 0.6) / 0.4);
      if (C.patch) tmp.lerp(C.patch, smoothstep(0.22, 0.42, Terra.n3(x * 0.018 + 100, z * 0.018 - 40)) * 0.55);
      if (C.patch2) tmp.lerp(C.patch2, smoothstep(0.18, 0.38, Terra.n2(x * 0.04 - 70, z * 0.04 + 30)) * 0.5);
      if (C.cap) tmp.lerp(C.cap, smoothstep(70, 95, h + Terra.n1(x * 0.05, z * 0.05) * 8) * (1 - smoothstep(0.7, 1.2, slope)));
      // cliff faces: bare rock with strata
      const rock = smoothstep(0.55, 1.1, slope);
      if (rock > 0) { c.copy(C.rock).multiplyScalar(0.85 + 0.15 * Math.sin(h * 1.4)); tmp.lerp(c, rock); }
      if (i === 3 && h < WORLD.lava + 1.2) tmp.lerp(this.palC.scorch, 0.7);
      if ((i === 0 || i === 4) && h > WORLD.water - 1 && h < WORLD.water + 2.2 && slope < 0.5) tmp.lerp(this.palC.sand, 0.75);
      r += tmp.r * w[i]; g += tmp.g * w[i]; b += tmp.b * w[i];
    }
    out.setRGB(r, g, b);
    const hub = Terra.hubMask(x, z);
    if (hub > 0) out.lerp(this.palC.hub, hub * 0.8);
    out.multiplyScalar(0.9 + Terra.n1(x * 0.08, z * 0.08) * 0.2);
    if (h < WORLD.water + 0.6) out.multiplyScalar(0.65);
    return out;
  },

  buildGround() {
    const P = this.pal;
    const col = (c) => (c ? new THREE.Color(c) : null);
    this.palC = P.map((p) => ({ low: col(p.ground.low), mid: col(p.ground.mid), high: col(p.ground.high), rock: col(p.ground.rock), patch: col(p.ground.patch), patch2: col(p.ground.patch2), cap: col(p.ground.cap) }));
    this.palC.sand = new THREE.Color('#d9c993'); this.palC.scorch = new THREE.Color('#3a120c'); this.palC.hub = new THREE.Color(HUB.ground.mid);
    const N = this.N, W = N + 1, s = this.seg, half = this.half, H = this.heights;
    const C = WORLD.chunk / s, nC = N / C;
    this.groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0.05 });
    this.lavaMat = new THREE.MeshStandardMaterial({ color: '#ff4a0a', emissive: '#ff6a1a', emissiveIntensity: 1.4, roughness: 0.3, flatShading: true });
    const vc = new THREE.Color();
    this.chunks = [];
    for (let cz = 0; cz < nC; cz++) for (let cx = 0; cx < nC; cx++) {
      const V = C + 1;
      const pos = new Float32Array(V * V * 3), cols = new Float32Array(V * V * 3);
      const idx = [];
      const lava = [];
      for (let j = 0; j <= C; j++) for (let i = 0; i <= C; i++) {
        const gi = cx * C + i, gj = cz * C + j, k = j * V + i;
        const x = -half + gi * s, z = -half + gj * s, h = H[gj * W + gi];
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        const gx = (H[gj * W + Math.min(N, gi + 1)] - H[gj * W + Math.max(0, gi - 1)]) / (2 * s);
        const gz = (H[Math.min(N, gj + 1) * W + gi] - H[Math.max(0, gj - 1) * W + gi]) / (2 * s);
        this.vertexColor(x, z, h, Math.hypot(gx, gz), vc);
        cols[k * 3] = vc.r; cols[k * 3 + 1] = vc.g; cols[k * 3 + 2] = vc.b;
      }
      for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
        const gi = cx * C + i, gj = cz * C + j;
        const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
        if (!this.hole[gj * N + gi]) idx.push(a, c, b, c, d, b);
        // lava surface over low ground in the volcano
        const hmin = Math.min(H[gj * W + gi], H[gj * W + gi + 1], H[(gj + 1) * W + gi], H[(gj + 1) * W + gi + 1]);
        if (hmin < WORLD.lava) {
          const x = -half + (gi + 0.5) * s, z = -half + (gj + 0.5) * s;
          if (Terra.weights(x, z)[3] > 0.5) lava.push(x, z);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, this.groundMat);
      m.receiveShadow = true;
      this.group.add(m);
      this.chunks.push(m);
      if (lava.length) {
        const lp = [];
        const hs = s / 2 + 0.05, y = WORLD.lava;
        for (let q = 0; q < lava.length; q += 2) {
          const x = lava[q], z = lava[q + 1];
          lp.push(x - hs, y, z - hs, x - hs, y, z + hs, x + hs, y, z - hs, x - hs, y, z + hs, x + hs, y, z + hs, x + hs, y, z - hs);
        }
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
        lg.computeVertexNormals(); lg.computeBoundingSphere();
        this.group.add(new THREE.Mesh(lg, this.lavaMat));
      }
    }
  },

  buildWater() {
    const geo = new THREE.PlaneGeometry(this.size + 600, this.size + 600, 8, 8);
    geo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshStandardMaterial({ color: '#2f86c4', emissive: '#0e3a5a', emissiveIntensity: 0.35, roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.86 });
    const w = new THREE.Mesh(geo, this.waterMat);
    w.position.y = WORLD.water;
    w.receiveShadow = true;
    this.group.add(w);
    this.water = w;
  },

  // ═════════════════════ Sky, lights & the environment blend ═════════════════════
  buildSky() {
    const Z = HUB;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(Z.sky.top) }, horizon: { value: new THREE.Color(Z.sky.horizon) }, bottom: { value: new THREE.Color(Z.sky.bottom) },
        sunColor: { value: new THREE.Color(Z.sun) }, sunDir: { value: new THREE.Vector3(...Z.sunDir).normalize() }, stars: { value: 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 top, horizon, bottom, sunColor, sunDir; uniform float stars; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.5)) : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.35));
          float sd = max(dot(d, normalize(sunDir)), 0.0);
          c += sunColor * (pow(sd, 900.0) * 10.0 + pow(sd, 40.0) * 0.35 + pow(sd, 6.0) * 0.12);
          if (stars > 0.01) { vec3 q = floor(d * 280.0); float s = step(0.9975, hash(q)) * smoothstep(0.02, 0.3, h); c += vec3(s) * 3.0 * stars; }
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.skyMesh.renderOrder = -10;
    this.skyMesh.frustumCulled = false;
    this.group.add(this.skyMesh);
    this.scene.fog = new THREE.FogExp2(new THREE.Color(Z.fog), Z.fogDensity);
    this.scene.background = null;
  },

  buildLights() {
    const Z = HUB;
    this.hemi = new THREE.HemisphereLight(Z.hemi[0], Z.hemi[1], Z.hemi[2]);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(Z.sun, Z.sunI);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.near = 1; sc.far = 320;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.sunDir = new THREE.Vector3(...Z.sunDir).normalize();
    // a lamp on the robot's chest, switched on inside caves
    this.headlamp = new THREE.PointLight('#ffe9c4', 0, 26, 1.6);
    this.scene.add(this.headlamp);
  },

  followSun(x, y, z) {
    const d = this.sunDir;
    const sy = Math.max(0.35, d.y);
    this.sun.position.set(x + d.x * 150, y + sy * 150, z + d.z * 150);
    this.sun.target.position.set(x, y, z);
  },

  // Every frame the sky, fog and light colours ease toward a mix of the biomes around the camera,
  // so crossing a border feels seamless.
  envInit() {
    const srcs = [...this.pal, HUB, ZONES[4]];
    const C = (h) => new THREE.Color(h);
    this.env = srcs.map((Z) => ({
      top: C(Z.sky.top), hor: C(Z.sky.horizon), bot: C(Z.sky.bottom), sun: C(Z.sun), fog: C(Z.fog), fd: Z.fogDensity,
      h0: C(Z.hemi[0]), h1: C(Z.hemi[1]), hi: Z.hemi[2], si: Z.sunI, sd: new THREE.Vector3(...Z.sunDir).normalize(), stars: Z.stars ? 1 : 0,
    }));
    this.envW = new Float32Array(srcs.length);
    this.caveDim = 0;
    this.envBlend(0, 0, 0, 1);
  },
  envBlend(x, z, y, k) {
    const w = this.envW;
    const tw = Terra.weights(x, z);
    const hub = Terra.hubMask(x, z);
    const sky = Math.hypot(x - SKY_REGION.x, z - SKY_REGION.z) < SKY_REGION.r + 60 ? smoothstep(this.skyFloor - 40, this.skyFloor, y) : 0;
    for (let i = 0; i < tw.length; i++) w[i] = tw[i] * (1 - hub) * (1 - sky);
    w[5] = hub * (1 - sky); w[6] = sky;
    const tgt = this._envT || (this._envT = { top: new THREE.Color(), hor: new THREE.Color(), bot: new THREE.Color(), sun: new THREE.Color(), fog: new THREE.Color(), h0: new THREE.Color(), h1: new THREE.Color(), sd: new THREE.Vector3() });
    for (const key of ['top', 'hor', 'bot', 'sun', 'fog', 'h0', 'h1']) tgt[key].setRGB(0, 0, 0);
    tgt.sd.set(0, 0, 0);
    let fd = 0, hi = 0, si = 0, st = 0;
    this.env.forEach((E, i) => {
      if (w[i] < 0.001) return;
      for (const key of ['top', 'hor', 'bot', 'sun', 'fog', 'h0', 'h1']) { tgt[key].r += E[key].r * w[i]; tgt[key].g += E[key].g * w[i]; tgt[key].b += E[key].b * w[i]; }
      tgt.sd.addScaledVector(E.sd, w[i]);
      fd += E.fd * w[i]; hi += E.hi * w[i]; si += E.si * w[i]; st += E.stars * w[i];
    });
    const cd = this.caveDim;
    if (cd > 0) {
      const dark = this._dark || (this._dark = new THREE.Color('#1a1510'));
      tgt.fog.lerp(dark, cd); tgt.h0.multiplyScalar(1 - 0.75 * cd); tgt.h1.multiplyScalar(1 - 0.75 * cd);
      hi *= 1 - 0.55 * cd; si *= 1 - 0.85 * cd; fd = lerp(fd, 0.03, cd);
    }
    if (G.settings.quality === 'low') fd *= 1.5;
    const u = this.skyMesh.material.uniforms;
    u.top.value.lerp(tgt.top, k); u.horizon.value.lerp(tgt.hor, k); u.bottom.value.lerp(tgt.bot, k); u.sunColor.value.lerp(tgt.sun, k);
    u.sunDir.value.lerp(tgt.sd.normalize(), k); u.stars.value = lerp(u.stars.value, st, k);
    this.sunDir.copy(u.sunDir.value).normalize();
    this.scene.fog.color.lerp(tgt.fog, k);
    this.scene.fog.density = lerp(this.scene.fog.density, fd, k);
    this.hemi.color.lerp(tgt.h0, k); this.hemi.groundColor.lerp(tgt.h1, k);
    this.hemi.intensity = lerp(this.hemi.intensity, hi, k);
    this.sun.color.lerp(tgt.sun, k);
    this.sun.intensity = lerp(this.sun.intensity, si, k);
  },

  // fold a finished static group into the batched meshes (fewer draw calls)
  bake(g) {
    if (!Batch.map) return;
    Batch.addObject(g);
    const done = [];
    g.traverse((o) => { if (o.userData.baked) done.push(o); });
    for (const o of done) o.parent.remove(o);
    if (!g.children.length && g.parent) g.parent.remove(g);
  },

  // ═════════════════════ Colliders ═════════════════════
  // ─────────── Colliders ───────────
  addCollider(x, z, r, top, kind = 'prop', bottom = -Infinity) {
    const c = { x, z, r, top, kind, bottom };
    this.colliders.push(c);
    const cs = 16;
    const x0 = Math.floor((x - r) / cs), x1 = Math.floor((x + r) / cs), z0 = Math.floor((z - r) / cs), z1 = Math.floor((z + r) / cs);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const k = i * 1000 + j;
      let a = this.grid.get(k); if (!a) { a = []; this.grid.set(k, a); }
      a.push(c);
    }
    return c;
  },

  near(x, z) { return this.grid.get(Math.floor(x / 16) * 1000 + Math.floor(z / 16)) || []; },

  // push a circle out of colliders; returns the collider that was touched (or null)
  collide(p, r, y) {
    let hit = null;
    for (const c of this.near(p.x, p.z)) {
      if (y > c.top || y < c.bottom) continue;
      const dx = p.x - c.x, dz = p.z - c.z, rr = c.r + r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.001;
        p.x = c.x + (dx / d) * rr; p.z = c.z + (dz / d) * rr;
        hit = c;
      }
    }
    // sealed arena domes keep everyone out until their beacons are online
    for (const A of this.arenas) {
      if (!A.sealed) continue;
      const dx = p.x - A.x, dz = p.z - A.z, d = Math.hypot(dx, dz), R = A.r + 2;
      if (d < R + r && d > R - 4 && Math.abs(y - A.y) < R) { p.x = A.x + (dx / d) * (R + r); p.z = A.z + (dz / d) * (R + r); hit = hit || { dome: true }; }
    }
    const lim = this.half * 0.95;
    p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
    return hit;
  },

  solidAt(x, y, z) {
    const cv = this.caves.length ? this.caveAt(x, z, y) : null;
    if (cv) return y < cv.floor || y > cv.ceil;
    if (y < this.heightAt(x, z) && !this.isHole(x, z)) return true;
    for (const is of this.islands) if (y < is.top && y > is.top - 2.4 && (x - is.x) ** 2 + (z - is.z) ** 2 < is.r * is.r) return true;
    for (const c of this.near(x, z)) {
      if (y < c.top && y >= c.bottom && (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
    }
    return false;
  },

  isClear(x, z, r, minH = WORLD.water + 0.8) {
    if (Math.max(Math.abs(x), Math.abs(z)) > this.half * 0.86) return false;
    for (const f of this.flats) if (Math.hypot(x - f.x, z - f.z) < f.r + r + 4) return false;
    const h = this.heightAt(x, z);
    if (h < minH) return false;
    if (h < WORLD.lava + 0.6 && Terra.weights(x, z)[3] > 0.5) return false;
    for (const c of this.near(x, z)) if (Math.hypot(x - c.x, z - c.z) < c.r + r + 1) return false;
    for (const cv of this.caves) if (Math.hypot(x - cv.mouth.x, z - cv.mouth.z) < 9 + r) return false;
    if (this.isHole(x, z)) return false;
    return true;
  },

  randomClear(r, tries = 40, minH, maxSlope = 0.9) {
    for (let i = 0; i < tries; i++) {
      const x = rand(-this.half * 0.86, this.half * 0.86), z = rand(-this.half * 0.86, this.half * 0.86);
      if (this.isClear(x, z, r, minH) && this.slopeAt(x, z) < maxSlope) return [x, z];
    }
    return null;
  },

  // Walkable height at (x,z) for something currently at height y: terrain (or a cave floor), the
  // tops of rocks/pillars it has climbed onto, and floating islands.
  groundAt(x, z, y) {
    const cv = this.caves.length ? this.caveAt(x, z, y) : null;
    let h;
    if (cv) h = cv.floor;
    else if (this.isHole(x, z)) { const c2 = this.caveAt(x, z); h = c2 ? c2.floor : this.heightAt(x, z) - 6; }
    else h = this.heightAt(x, z);
    for (const c of this.near(x, z)) {
      if (c.top > h && y >= c.top - 0.7 && y < c.top + 40 && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r * 0.95) ** 2 && y >= c.bottom) h = c.top;
    }
    for (const is of this.islands) {
      if (y >= is.top - 1.6 && (x - is.x) ** 2 + (z - is.z) ** 2 < is.r * is.r) h = Math.max(h, is.top);
    }
    return h;
  },
  // ground for robots: islands count only if they are standing on one (pass their height)
  floorAt(x, z, y) {
    let h = this.heightAt(x, z);
    if (y !== undefined) for (const is of this.islands) if (y >= is.top - 2 && (x - is.x) ** 2 + (z - is.z) ** 2 < is.r * is.r) h = Math.max(h, is.top);
    return h;
  },
  // the flat floor of the active boss arena (bosses and their attacks use it)
  arenaFloor(x, z) {
    const A = this.arena;
    if (A && (x - A.x) ** 2 + (z - A.z) ** 2 < (A.r + 3) ** 2) return A.y;
    return this.floorAt(x, z);
  },
  islandAt(x, z, pad = 0, y) {
    let best = null;
    for (const is of this.islands) {
      if ((x - is.x) ** 2 + (z - is.z) ** 2 >= (is.r + pad) ** 2) continue;
      if (y !== undefined && Math.abs(y - is.top) > 3) continue;
      if (!best || is.top > best.top) best = is;
    }
    return best;
  },
  surf(x, z) { return this.heightAt(x, z); },

  // ═════════════════════ Home base ═════════════════════
  buildHub() {
    this.spawn = { x: 0, z: 17 };
    this.home = { x: 0, z: -2, y: this.heightAt(0, 0) };
    this.buildHouse(0, -2);
    this.buildSpawnPad();
    if (G.base && G.base.shield) this.buildHomeDome();
  },
  // A cosy house with three rooms side by side: Mechanic · Charging · Storage.
  buildHouse(cx, cz) {
    const y0 = this.heightAt(cx, cz);
    this.house = { x: cx, z: cz, y: y0, w: 24, d: 16 };
    const g = new THREE.Group(); g.position.set(cx, y0, cz); this.group.add(g);
    const wall = Mat.std('#efe2c4', { rough: 0.85, metal: 0 });
    const trim = Mat.std('#7a4a2a', { rough: 0.75, metal: 0.05 });
    const floorM = Mat.std('#b98a5a', { rough: 0.8, metal: 0.05 });
    const roofM = Mat.std('#b8442e', { rough: 0.8, metal: 0.05 });
    const glass = Mat.glow('#ffe7a0', 1.6);
    const W = 12, D = 8, H = 4.6, T = 0.35;
    mesh(Geo.box(W * 2 + 0.6, 0.4, D * 2 + 0.6), Mat.std('#8a8478', { rough: 0.9 }), 0, -0.15, 0, g).receiveShadow = true;
    const fl = mesh(Geo.box(W * 2, 0.1, D * 2), floorM, 0, 0.06, 0, g); fl.receiveShadow = true;
    const wallSeg = (x1, z1, x2, z2, h = H, y = 0) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const m = mesh(Geo.box(len, h, T), wall, (x1 + x2) / 2, y + h / 2, (z1 + z2) / 2, g);
      m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      m.receiveShadow = true;
      if (y === 0) {
        for (let t = 0; t <= len; t += 0.55) {
          const k = t / len;
          this.addCollider(cx + lerp(x1, x2, k), cz + lerp(z1, z2, k), 0.33, y0 + h, 'wall');
        }
      }
      return m;
    };
    // outer shell (back, sides) and the front with three doors
    wallSeg(-W, -D, W, -D); wallSeg(-W, -D, -W, D); wallSeg(W, -D, W, D);
    const doors = [-8, 0, 8], dw = 1.4;
    let x = -W;
    for (const dx of doors) { wallSeg(x, D, dx - dw, D); wallSeg(dx - dw, D, dx + dw, D, H - 3.2, 3.2); x = dx + dw; }
    wallSeg(x, D, W, D);
    // inner walls with a doorway between rooms
    for (const ix of [-4, 4]) { wallSeg(ix, -D, ix, -1.2); wallSeg(ix, 1.2, ix, D); wallSeg(ix, -1.2, ix, 1.2, H - 3.2, 3.2); }
    // trims, door frames, windows
    for (const dx of doors) {
      for (const s of [-1, 1]) mesh(Geo.box(0.25, 3.3, 0.5), trim, dx + s * dw, 1.65, D, g);
      mesh(Geo.box(dw * 2 + 0.5, 0.3, 0.5), trim, dx, 3.3, D, g);
    }
    mesh(Geo.box(W * 2 + 0.4, 0.3, 0.5), trim, 0, H, D, g);
    mesh(Geo.box(W * 2 + 0.4, 0.3, 0.5), trim, 0, H, -D, g);
    for (const s of [-1, 1]) {
      for (const wz of [-4, 3]) mesh(Geo.box(0.1, 1.2, 1.6), glass, s * (W + 0.14), 2.4, wz, g);
      for (const wx of [-8, 0, 8]) mesh(Geo.box(1.6, 1.2, 0.1), glass, wx + s * 0, 2.4, -D - 0.14, g);
    }
    for (const wx of [-10.5, -5.5, 5.5, 10.5]) mesh(Geo.box(1.2, 1.1, 0.1), glass, wx, 2.5, D + 0.14, g);
    // pitched roof (no shadow, so the rooms stay bright inside)
    const pitch = Math.atan2(2.6, D + 0.8);
    for (const s of [-1, 1]) {
      const r = mesh(Geo.box(W * 2 + 1.4, 0.35, Math.hypot(2.6, D + 0.8) + 0.3), roofM, 0, H + 1.3, s * (D + 0.8) / 2, g);
      r.rotation.x = s * pitch; r.castShadow = false;
    }
    for (const s of [-1, 1]) {
      const gable = new THREE.Shape([new THREE.Vector2(-D, 0), new THREE.Vector2(D, 0), new THREE.Vector2(0, 2.6)]);
      const gm = mesh(new THREE.ShapeGeometry(gable), wall, s * W, H, 0, g); gm.rotation.y = s * Math.PI / 2; gm.castShadow = false;
      gm.material = Mat.std('#efe2c4', { rough: 0.85, metal: 0, flat: true });
    }
    mesh(Geo.box(1.2, 2.4, 1.2), Mat.std('#9a5a3a', { rough: 0.9 }), 7, H + 2.4, -3, g).castShadow = false;   // chimney
    // porch path
    for (const dx of doors) mesh(Geo.box(2.6, 0.08, 5), Mat.std('#c9b08a', { rough: 0.9 }), dx, 0.02, D + 2.8, g).receiveShadow = true;

    // room signs over the doors
    const rooms = [['MECHANIC', '#ffb347', -8], ['CHARGING', '#6bff9e', 0], ['STORAGE', '#3cf2ff', 8]];
    for (const [name, c, dx] of rooms) { const l = this.makeLabel(name, c, 512, 110); l.position.set(dx, H + 0.9, D + 0.7); l.scale.set(4.2, 0.9, 1); g.add(l); }

    const console = (lx, lz, color, kind, label) => {
      const t = new THREE.Group(); t.position.set(lx, 0, lz); g.add(t);
      mesh(Geo.box(1.6, 1.1, 0.8), Mat.std('#2a3444', { metal: 0.6, rough: 0.4 }), 0, 0.55, 0, t);
      const scr = mesh(Geo.box(1.4, 0.9, 0.08), Mat.glow(color, 1.1), 0, 1.6, -0.2, t); scr.rotation.x = -0.25;
      mesh(Geo.box(1.5, 0.08, 0.5), Mat.glow(color, 2.4), 0, 1.12, 0.1, t);
      const sp = glowSprite(color, 1.3, 0.6); sp.position.y = 1.7; t.add(sp);
      const l = this.makeLabel(label, color, 512, 96); l.position.set(0, 2.7, 0); l.scale.set(2.8, 0.55, 1); t.add(l);
      this.addCollider(cx + lx, cz + lz, 0.8, y0 + 1.2, 'wall');
      this.terminals.push({ kind, x: cx + lx, z: cz + lz + 1.2, y: y0, color, sprite: sp });
    };
    // ── Mechanic room: workbench, bot on the bench, robot arm, tool wall
    console(-8, -6.6, '#ffb347', 'mechanic', 'MECHANIC');
    mesh(Geo.box(3.4, 1, 1.4), trim, -10.2, 0.5, -1.5, g); mesh(Geo.box(3.6, 0.12, 1.6), Mat.std('#5a3a22'), -10.2, 1.05, -1.5, g);
    this.addCollider(cx - 10.2, cz - 1.5, 1.3, y0 + 1.1, 'wall');
    const benchBot = buildCompanionModel('gunner'); benchBot.position.set(-10.2, 1.5, -1.5); benchBot.scale.setScalar(1.2); g.add(benchBot);
    const arm = new THREE.Group(); arm.position.set(-11.3, 0, -5.5); g.add(arm);
    mesh(Geo.cyl(0.35, 0.45, 0.4, 8), Mat.std('#ffb347', { metal: 0.6 }), 0, 0.2, 0, arm);
    const a1 = mesh(Geo.box(0.25, 2, 0.25), Mat.std('#ffb347', { metal: 0.6 }), 0.3, 1.2, 0, arm); a1.rotation.z = -0.3;
    const a2 = mesh(Geo.box(0.2, 1.4, 0.2), Mat.std('#333844', { metal: 0.7 }), 1, 2.3, 0, arm); a2.rotation.z = -1.1;
    this.addCollider(cx - 11.3, cz - 5.5, 0.6, y0 + 2, 'wall');
    for (let i = 0; i < 5; i++) mesh(Geo.box(0.12, 0.7, 0.12), Mat.std(pick(['#c8c8d0', '#ff6b6b', '#ffd23f']), { metal: 0.8 }), -W + 0.3, 2 + (i % 2) * 0.3, -3 + i * 0.9, g);
    this.mechanicSpot = { x: cx - 6, z: cz - 3.5, y: y0 };
    // ── Charging room: glowing pads for docked bots
    console(0, -6.6, '#6bff9e', 'charging', 'CHARGING');
    for (const pz of [-3.6, -0.2]) for (const px of [-2.4, 0, 2.4]) {
      mesh(Geo.cyl(0.8, 0.9, 0.18, 12), Mat.std('#2a3444', { metal: 0.7 }), px, 0.15, pz, g);
      const ring = new THREE.Mesh(Geo.torus(0.62, 0.05, 24), Mat.glow('#6bff9e', 2.2)); ring.rotation.x = Math.PI / 2; ring.position.set(px, 0.26, pz); g.add(ring);
      ring.userData.keep = true;
      this.chargePads.push({ x: cx + px, z: cz + pz, y: y0 + 1.25, ring });
    }
    // ── Storage room: shelves and crates
    console(8, -6.6, '#3cf2ff', 'storage', 'STORAGE');
    const crate = Mat.std('#9a6a3a', { rough: 0.85 }), crateB = Mat.std('#4a6a8a', { rough: 0.6, metal: 0.4 });
    for (const sx of [W - 0.9]) for (let i = 0; i < 4; i++) {
      mesh(Geo.box(1.2, 3.2, 3), trim, sx, 1.6, -5.5 + i * 3.4, g);
      for (let k = 0; k < 3; k++) mesh(Geo.box(0.8, 0.7, 0.8), pick([crate, crateB]), sx - 0.1, 0.5 + k * 1, -6 + i * 3.4 + rand(-0.4, 0.4), g);
      this.addCollider(cx + sx, cz - 5.5 + i * 3.4, 1.3, y0 + 3.2, 'wall');
    }
    for (let i = 0; i < 4; i++) mesh(Geo.box(1, 1, 1), pick([crate, crateB]), 5.6 + (i % 2) * 1.1, 0.5 + Math.floor(i / 2) * 1, 3.6, g);
    this.addCollider(cx + 6.2, cz + 3.6, 1.3, y0 + 2, 'wall');

    // mailbox & lanterns outside
    for (const s of [-1, 1]) {
      mesh(Geo.cyl(0.08, 0.1, 2.4, 6), Mat.std('#2a2a30', { metal: 0.7 }), s * 13.5, 1.2, D + 2, g);
      mesh(Geo.sphere(0.25, 1), Mat.glow('#ffd88a', 4), s * 13.5, 2.5, D + 2, g).castShadow = false;
    }
    this.bake(g);
  },

  buildHomeDome() {
    if (this.homeDome || !this.house) return;
    const H = this.house, R = 21;
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ab8ff').multiplyScalar(1.1), transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 20, 0, TAU, 0, Math.PI / 2), mat);
    dome.position.set(H.x, H.y, H.z);
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(R + 0.05, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ab8ff').multiplyScalar(2), wireframe: true, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    wire.position.copy(dome.position);
    // generator pylon in the mechanic room corner
    const py = new THREE.Group(); py.position.set(H.x - 5.2, H.y, H.z + 6.6); this.group.add(py);
    mesh(Geo.cyl(0.5, 0.7, 0.4, 8), Mat.std('#2a3444', { metal: 0.7 }), 0, 0.2, 0, py);
    mesh(Geo.cyl(0.15, 0.2, 2.6, 6), Mat.std('#8aa0b8', { metal: 0.8 }), 0, 1.5, 0, py);
    const orb = mesh(Geo.sphere(0.4, 1), Mat.glow('#5ab8ff', 4), 0, 3, 0, py); orb.castShadow = false;
    this.group.add(dome, wire);
    this.homeDome = { x: H.x, z: H.z, y: H.y, r: R, dome, wire, orb };
  },

  buildSpawnPad() {
    const { x, z } = this.spawn;
    const y = this.heightAt(x, z);
    mesh(Geo.cyl(5, 5.4, 0.4, 12), Mat.std('#22303c', { metal: 0.8, rough: 0.3 }), x, y + 0.1, z, this.group).receiveShadow = true;
    const r = new THREE.Mesh(Geo.torus(4.4, 0.05, 40), Mat.glow('#3cf2ff', 1.3)); r.rotation.x = Math.PI / 2; r.position.set(x, y + 0.35, z);
    this.group.add(r);
  },

  // ═════════════════════ Arenas & beacons ═════════════════════
  buildArena(P) {
    const A = { i: P.i, x: P.x, z: P.z, r: P.r || 30, y: P.y, island: !!P.island, beacons: [], sealed: true, fade: 1, opening: false, cleared: false };
    const y = A.y;
    const accent = ZONES[A.i].boss.color;
    A.color = accent;
    const floor = mesh(new THREE.CylinderGeometry(A.r, A.r + 1, 0.6, 48), Mat.std('#1c1c24', { metal: 0.7, rough: 0.4 }), A.x, y + 0.05, A.z, this.group);
    floor.receiveShadow = true;
    for (const [r, k] of [[A.r - 3, 3], [10, 4], [A.r - 0.4, 2]]) {
      const ring = new THREE.Mesh(Geo.torus(r, 0.12, 64), Mat.glow(accent, k)); ring.rotation.x = Math.PI / 2; ring.position.set(A.x, y + 0.38, A.z);
      this.group.add(ring);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const s = mesh(Geo.box(0.3, 0.05, A.r - 12), Mat.glow(accent, 2), A.x + Math.cos(a) * (A.r / 2 + 3), y + 0.37, A.z + Math.sin(a) * (A.r / 2 + 3), this.group);
      s.rotation.y = -a + Math.PI / 2;
    }
    const concrete = Mat.std('#2c2c36', { rough: 0.8, metal: 0.3 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const px = A.x + Math.cos(a) * (A.r + 3), pz = A.z + Math.sin(a) * (A.r + 3);
      const py = A.island ? y : this.heightAt(px, pz);
      Batch.add(Geo.box(1.8, 9, 1.8), concrete, px, py + 4.2, pz);
      Batch.add(Geo.sphere(0.45, 1), Mat.glow(accent, 5), px, py + 9.2, pz, 1, 1, 1, 0, 0, 0, false);
      this.addCollider(px, pz, 1.3, py + 9, 'pillar', A.island ? py - 1 : -Infinity);
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(A.r + 2, 40, 20, 0, TAU, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.4), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    dome.position.set(A.x, y, A.z);
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(A.r + 2.05, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(2), wireframe: true, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    wire.position.set(A.x, y, A.z);
    this.group.add(dome, wire);
    A.dome = dome; A.domeWire = wire;
    const lbl = this.makeLabel(ZONES[A.i].boss.name, accent, 512, 110); lbl.position.set(A.x, y + A.r + 6, A.z); lbl.scale.set(9, 1.9, 1);
    this.group.add(lbl);
    this.arenas.push(A);
    for (const B of this.beaconPlans) if (B.arena === P) { const b = this.buildBeacon(B.x, B.z, B.y); b.biome = A.i; b.arena = A; b.island = B.island || null; A.beacons.push(b); }
    return A;
  },

  openDome(A = this.arena) {
    A.sealed = false; A.opening = true;
    if (this.arena === A) this.domeTrap = false;
  },
  // the dome snaps shut behind the player when the boss fight begins
  trapDome(A) {
    this.arena = A;
    this.domeTrap = true; A.opening = false; A.fade = 1;
    A.dome.visible = A.domeWire.visible = true;
    A.domeWire.scale.setScalar(1);
    A.dome.material.color.set(A.color).multiplyScalar(0.8);
    A.domeWire.material.color.set(A.color).multiplyScalar(1.4);
  },
  insideDome(x, y, z, pad = 0) {
    const A = this.arena, R = A.r + 2 + pad;
    return (x - A.x) ** 2 + (y - A.y) ** 2 + (z - A.z) ** 2 < R * R;
  },
  keepInside(p, r = 0.5) {
    if (!this.domeTrap) return;
    const A = this.arena, dx = p.x - A.x, dz = p.z - A.z, d = Math.hypot(dx, dz), R = A.r + 1.2 - r;
    if (d > R) { p.x = A.x + (dx / d) * R; p.z = A.z + (dz / d) * R; }
    const R2 = A.r + 2 - r, cap = A.y + Math.sqrt(Math.max(0, R2 * R2 - Math.min(d, R2) ** 2)) - 0.5;
    if (p.y > cap) p.y = cap;
  },

  buildCache(x, z, golden, yOverride, isFixed) {
    const y = yOverride ?? this.heightAt(x, z);
    const c = golden ? '#ffd23f' : '#3cf2ff';
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rand(0, TAU);
    this.group.add(g);
    const shell = Mat.std(golden ? '#4a3a14' : '#1e2a36', { metal: 0.7, rough: 0.4 });
    const body = new THREE.Group(); g.add(body);
    mesh(Geo.box(1.3, 0.7, 0.9), shell, 0, 0.35, 0, body).receiveShadow = true;
    const lid = new THREE.Group(); lid.position.set(0, 0.7, -0.45); g.add(lid);
    mesh(Geo.box(1.34, 0.18, 0.94), shell, 0, 0.09, 0.45, lid);
    mesh(Geo.box(1.36, 0.05, 0.05), Mat.glow(c, 4), 0, 0.02, 0.92, lid);
    for (const s of [-1, 1]) mesh(Geo.box(0.05, 0.5, 0.92), Mat.glow(c, 3), s * 0.66, 0.35, 0, body);
    this.bake(body);
    const sp = glowSprite(c, 3, 1.4); sp.position.y = 1.8; g.add(sp);
    const cache = { x, y, z, golden, opened: false, group: g, lid, sprite: sp, openT: 0 };
    this.caches.push(cache);
    this.addCollider(x, z, 0.8, y + 0.9, 'cache', (isFixed || yOverride !== undefined) ? y - 0.5 : -Infinity);
    return cache;
  },

  buildBeacon(x, z, y) {
    y = y ?? this.heightAt(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z);
    this.group.add(g);
    const metal = Mat.std('#2a2e38', { metal: 0.8, rough: 0.35 });
    mesh(Geo.cyl(3.2, 3.6, 0.5, 8), metal, 0, 0.25, 0, g).receiveShadow = true;
    mesh(Geo.box(0.9, 8, 0.9), metal, 0, 4.2, 0, g);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const f = mesh(Geo.box(0.3, 5, 0.3), metal, Math.cos(a) * 1.1, 2.4, Math.sin(a) * 1.1, g);
      f.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    }
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb347').multiplyScalar(4) });
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(Geo.torus(0.9 + i * 0.25, 0.06, 24), glowMat);
      r.position.y = 3 + i * 2.2; r.rotation.x = Math.PI / 2;
      g.add(r); rings.push(r);
    }
    const crystal = mesh(Geo.oct(0.7), glowMat, 0, 9.3, 0, g); crystal.scale.y = 1.6;
    const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb347').multiplyScalar(1.5), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.2, 300, 12, 1, true), beamMat);
    beam.position.y = 160; g.add(beam);
    const zoneRing = new THREE.Mesh(new THREE.RingGeometry(13.6, 14, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color('#3cf2ff').multiplyScalar(3), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    zoneRing.rotation.x = -Math.PI / 2; zoneRing.position.y = 0.55; g.add(zoneRing);
    const b = { x, y, z, state: 'idle', progress: 0, group: g, rings, crystal, beam, glowMat, beamMat, zoneRing, spawnT: 0, id: this.beacons.length + 1 };
    this.beacons.push(b);
    this.addCollider(x, z, 1.2, y + 10, 'pillar', y - 1);
    return b;
  },

  setBeaconColor(b, hex, k = 4) {
    b.glowMat.color.set(hex).multiplyScalar(k);
    b.beamMat.color.set(hex).multiplyScalar(1.5);
  },

  // ═════════════════════ Sky Islands (high above the north-east mountains) ═════════════════════
  buildSkyRegion() {
    const R = SKY_REGION;
    const gmax = (x, z, r) => { let m = -1e9; for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]]) m = Math.max(m, this.heightAt(x + ox, z + oz)); return m; };
    const base = gmax(R.x, R.z, R.r) + 45;
    this.skyFloor = base;
    const isl = (x, z, r, top, kind) => {
      if (this.islands.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 7)) return null;
      top = Math.max(top, gmax(x, z, r) + 22);
      return this.makeIsland(x, z, r, top, kind);
    };
    const arena = isl(R.x, R.z, 40, base + 40, 'arena');
    const beaconI = [];
    const a0 = rand(0, TAU);
    for (let i = 0; i < ZONES[4].beacons; i++) {
      const a = a0 + (i / ZONES[4].beacons) * TAU, d = rand(118, 140);
      const b = isl(R.x + Math.cos(a) * d, R.z + Math.sin(a) * d, 15, base + rand(5, 30), 'beacon');
      if (b) beaconI.push(b);
    }
    // the way up: a stepping-stone from the tallest nearby peak
    let peak = { x: R.x - 220, z: R.z + 120, h: -1e9 };
    for (let t = 0; t < 400; t++) {
      const a = rand(0, TAU), d = rand(150, 290), x = R.x + Math.cos(a) * d, z = R.z + Math.sin(a) * d;
      if (Math.max(Math.abs(x), Math.abs(z)) > this.half * 0.84) continue;
      const h = this.heightAt(x, z);
      if (h > peak.h && Math.hypot(x, z) > 200) peak = { x, z, h };
    }
    const toR = Math.atan2(R.z - peak.z, R.x - peak.x);
    const first = this.makeIsland(peak.x + Math.cos(toR) * 18, peak.z + Math.sin(toR) * 18, 8, peak.h + 13, 'step');
    const landing = isl(first.x + Math.cos(toR) * 42, first.z + Math.sin(toR) * 42, 16, first.top + 8, 'landing') || first;
    this.skyPeak = peak;
    for (let n = 0, t = 0; t < 80 && n < 6; t++) {
      const a = rand(0, TAU), d = rand(50, 180);
      if (isl(R.x + Math.cos(a) * d, R.z + Math.sin(a) * d, rand(10, 13), base + rand(-5, 40), 'camp')) n++;
    }
    const link = (A, B) => {
      if (!A || !B) return;
      const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz);
      const start = A.r + 9, end = L - B.r - 9;
      for (let s = start; s < end; s += rand(19, 24)) {
        const k = s / L;
        isl(A.x + dx * k + rand(-5, 5), A.z + dz * k + rand(-5, 5), rand(5, 7.5), lerp(A.top, B.top, k) + rand(-6, 6), 'step');
      }
    };
    const hubs = [landing, arena, ...beaconI].filter(Boolean);
    let nearB = beaconI[0];
    for (const b of beaconI) if (Math.hypot(b.x - landing.x, b.z - landing.z) < Math.hypot(nearB.x - landing.x, nearB.z - landing.z)) nearB = b;
    link(landing, nearB);
    for (let i = 0; i < beaconI.length; i++) { link(beaconI[i], arena); link(beaconI[i], beaconI[(i + 1) % beaconI.length]); }
    for (const c of this.islands.filter((i) => i.kind === 'camp')) { let best = hubs[0], bd = 1e9; for (const h of hubs) { const d = Math.hypot(h.x - c.x, h.z - c.z); if (d < bd) { bd = d; best = h; } } link(best, c); }
    // updrafts from the valley floor help gliders up to the islands
    for (let k = 0; k < 6; k++) {
      const a = rand(0, TAU), d = rand(40, 200), x = R.x + Math.cos(a) * d, z = R.z + Math.sin(a) * d;
      if (this.islandAt(x, z, 8)) continue;
      const g0 = this.heightAt(x, z);
      this.updraftCols.push({ x, z, y: base - 25, r: 4.5, base: g0 });
      const ring = new THREE.Mesh(Geo.torus(4.5, 0.12, 32), Mat.glow('#bff0ff', 1.6)); ring.rotation.x = Math.PI / 2; ring.position.set(x, g0 + 0.5, z); this.group.add(ring);
    }
    this.updraftCols.push({ x: peak.x, z: peak.z, y: first.top - 10, r: 4, base: peak.h });
    // arena, beacons and the shop on the islands
    this.arenaPlans.push({ i: 4, x: arena.x, z: arena.z, r: 30, y: arena.top, island: true });
    const AP = this.arenaPlans[this.arenaPlans.length - 1];
    for (const b of beaconI) this.beaconPlans.push({ x: b.x, z: b.z, y: b.top, biome: 4, arena: AP, island: b });
    this.buildArena(AP);
    this.buildShop(landing.x, landing.z + landing.r * 0.35, landing.top, 4);
    // decorate islands
    const F = ZONES[4].flora, trees = [], ground = [];
    for (const is of this.islands) {
      if (is.kind === 'arena') continue;
      const busy = is.kind === 'landing' ? [[is.x, is.z + is.r * 0.35, 6]] : is.kind === 'beacon' ? [[is.x, is.z, 5]] : is.kind === 'camp' ? [[is.x, is.z, 7.5]] : [];
      const nt = is.kind === 'step' ? randi(0, 1) : Math.round(is.r / 3.2);
      for (let k = 0; k < nt; k++) {
        const a = rand(0, TAU), r = rand(0.3, 0.8) * is.r, x = is.x + Math.cos(a) * r, z = is.z + Math.sin(a) * r;
        if (busy.some(([bx, bz, br]) => Math.hypot(x - bx, z - bz) < br)) continue;
        const tr = { x, z, y: is.top, s: rand(0.75, 1.2) };
        trees.push(tr); busy.push([x, z, 3]);
        this.addCollider(x, z, 0.4 * tr.s, is.top + this.treeHeight('round', tr.s) * 0.92, 'tree', is.top - 1);
      }
      ground.push({ x: is.x, z: is.z, y: is.top, r: is.r * 0.85, fixed: true });
    }
    this.plantTrees(trees, F);
    this.plantGround(ground, F);
    for (const is of this.islands.filter((i) => i.kind === 'step' || i.kind === 'camp').sort(() => _rng() - 0.5).slice(0, 10)) this.buildCache(is.x + rand(-1, 1), is.z + rand(-1, 1), _rng() < 0.2, is.top, true);
  },
  makeIsland(x, z, r, top, kind) {
    const Z = ZONES[4];
    const g = new THREE.Group(); g.position.set(x, top, z); this.group.add(g);
    const grass = Mat.std(pick([Z.ground.mid, Z.ground.low, Z.ground.high]), { rough: 0.9, metal: 0 });
    const dirt = Mat.std('#8a5a34', { rough: 0.95, metal: 0 });
    const rock = Mat.std('#9a8a78', { rough: 0.95, metal: 0.05 });
    const disc = mesh(new THREE.CylinderGeometry(r, r * 0.97, 1.2, Math.max(12, Math.round(r * 1.6))), grass, 0, -0.6, 0, g); disc.receiveShadow = true;
    mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.9, 1.6, Math.max(12, Math.round(r * 1.6))), dirt, 0, -2, 0, g);
    const under = mesh(new THREE.ConeGeometry(r * 0.9, r * 1.35, 12), rock, 0, -2.8 - r * 0.675, 0, g); under.rotation.x = Math.PI; under.castShadow = false;
    for (let k = 0; k < Math.min(6, 2 + r / 4); k++) {
      const a = rand(0, TAU), rr = rand(0.3, 0.8) * r;
      const chunk = mesh(Geo.sphere(1, 0), rock, Math.cos(a) * rr, -3 - rand(0, r * 0.8), Math.sin(a) * rr, g);
      chunk.scale.setScalar(rand(0.6, 1.6)); chunk.castShadow = false;
    }
    // dangling vines
    const vine = Mat.std('#3f8a2a', { rough: 0.9, metal: 0 });
    for (let k = 0; k < Math.round(r / 2); k++) {
      const a = rand(0, TAU), L = rand(2, 6);
      const v = mesh(Geo.cyl(0.05, 0.05, L, 3), vine, Math.cos(a) * r * 0.95, -1.2 - L / 2, Math.sin(a) * r * 0.95, g); v.castShadow = false;
    }
    this.bake(g);
    const is = { x, z, r, top, kind };
    this.islands.push(is);
    return is;
  },

  // a few floating ruins near each biome's beacons (golden caches up top)
  buildRuins() {
    const stone = Mat.std('#4a4a58', { rough: 0.8, metal: 0.2 });
    for (const A of this.arenas) {
      if (A.island) continue;
      const P = this.pal[A.i];
      const topM = Mat.std(new THREE.Color(P.ground.mid).lerp(new THREE.Color('#ffffff'), 0.12).getStyle(), { rough: 0.9, metal: 0.05 });
      const rockM = Mat.std(P.ground.rock, { rough: 0.95, metal: 0.05 });
      for (let n = 0; n < 2; n++) {
        const b = A.beacons[n % Math.max(1, A.beacons.length)];
        if (!b) break;
        let x = 0, z = 0, ok = false;
        for (let t = 0; t < 30 && !ok; t++) {
          const a = rand(0, TAU), d = rand(45, 85);
          x = b.x + Math.cos(a) * d; z = b.z + Math.sin(a) * d;
          ok = Math.max(Math.abs(x), Math.abs(z)) < this.half * 0.82 && Math.hypot(x - A.x, z - A.z) > 55 && this.islands.every((o) => Math.hypot(o.x - x, o.z - z) > 40);
        }
        if (!ok) continue;
        const r = rand(8, 12);
        const top = Math.max(this.heightAt(x, z) + 24, b.y + rand(28, 40));
        const g = new THREE.Group(); g.position.set(x, top, z); this.group.add(g);
        mesh(new THREE.CylinderGeometry(r, r * 0.9, 1.4, 14), topM, 0, -0.7, 0, g).receiveShadow = true;
        const under = mesh(new THREE.ConeGeometry(r * 0.92, r * 1.5, 12), rockM, 0, -1.4 - r * 0.75, 0, g); under.rotation.x = Math.PI;
        mesh(Geo.box(0.9, 4.5, 0.9), stone, -2.2, 2.25, -r * 0.45, g);
        mesh(Geo.box(0.9, 4.5, 0.9), stone, 2.2, 2.25, -r * 0.45, g);
        mesh(Geo.box(5.6, 0.7, 1.1), stone, 0, 4.7, -r * 0.45, g);
        mesh(Geo.box(3.4, 0.1, 0.05), Mat.glow(P.accent, 3), 0, 4.7, -r * 0.45 + 0.56, g);
        const ring = new THREE.Mesh(Geo.torus(r - 0.8, 0.06, 40), Mat.glow(P.accent, 2)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; g.add(ring);
        this.bake(g);
        const is = { x, z, r, top, kind: 'ruin' };
        this.islands.push(is);
        this.buildCache(x + rand(-2, 2), z + r * 0.2, n === 0, top, true);
        for (const s2 of [-2.2, 2.2]) this.addCollider(x + s2, z - r * 0.45, 0.6, top + 4.5, 'pillar', top - 0.5);
      }
    }
  },

  // ═════════════════════ Volcano craters ═════════════════════
  buildCraters() {
    for (const [cx, cz, R, H] of VOLCANO_CONES) {
      const y = this.heightAt(cx, cz);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(R * 0.11, 16), this.lavaMat);
      disc.rotation.x = -Math.PI / 2; disc.position.set(cx, y + 0.6, cz); this.group.add(disc);
      const glow = glowSprite('#ff5a1a', R * 0.7, 1.2); glow.position.set(cx, y + 8, cz); this.group.add(glow);
      this.craters.push({ x: cx, y: y + 2, z: cz, R });
    }
  },

  // ═════════════════════ Shops ═════════════════════
  buildShop(x, z, y, biome) {
    const S = ZONES[biome].shop;
    const face = Math.atan2(-x, -z);   // facing home base
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = face; this.group.add(g);
    const wood = Mat.std('#8a5a32', { rough: 0.8, metal: 0.05 });
    const woodD = Mat.std('#5a3a22', { rough: 0.8, metal: 0.05 });
    mesh(Geo.box(6, 0.3, 4.4), woodD, 0, 0.15, 0, g).receiveShadow = true;
    mesh(Geo.box(5.2, 1.2, 0.9), wood, 0, 0.9, 1.3, g);
    mesh(Geo.box(5.4, 0.12, 1.1), woodD, 0, 1.55, 1.3, g);
    for (const s of [-1, 1]) for (const zz of [-1.9, 1.9]) mesh(Geo.box(0.22, 3.6, 0.22), woodD, s * 2.8, 1.8, zz, g);
    for (let i = 0; i < 6; i++) {
      const st = mesh(Geo.box(1, 0.12, 4.8), Mat.std(i % 2 ? '#fff6e8' : S.color, { rough: 0.7, metal: 0 }), -2.5 + i, 3.75, 0.3, g);
      st.rotation.x = -0.2;
    }
    const goods = ['#ff5a7a', '#ffd23f', '#3cf2ff', '#b98cff', '#6bff9e'];
    for (let i = 0; i < 7; i++) mesh(Geo.box(0.4, 0.4, 0.4), Mat.std(pick(goods), { rough: 0.4, metal: 0.4, emissive: pick(goods), ei: 0.3 }), -2.2 + i * 0.72, 1.82, 1.25, g).rotation.y = rand(0, 1);
    mesh(Geo.box(5.2, 2.2, 0.3), woodD, 0, 1.4, -1.9, g);
    const bot = new THREE.Group(); bot.position.set(0, 0.3, -0.4); g.add(bot);
    const shell = Mat.std('#e8e0d0', { metal: 0.5, rough: 0.35 });
    mesh(Geo.box(0.9, 1.1, 0.7), shell, 0, 1.2, 0, bot);
    const head = new THREE.Group(); head.position.y = 2.1; bot.add(head);
    mesh(Geo.box(0.8, 0.6, 0.6), shell, 0, 0, 0, head);
    mesh(Geo.box(0.6, 0.18, 0.05), Mat.glow(S.color, 3), 0, 0.03, 0.31, head);
    mesh(Geo.cyl(0.4, 0.45, 0.12, 10), Mat.std('#3a2a1a'), 0, 0.36, 0, head);
    mesh(Geo.cyl(0.28, 0.3, 0.4, 10), Mat.std('#3a2a1a'), 0, 0.56, 0, head);
    for (const s of [-1, 1]) { const arm = mesh(Geo.box(0.2, 0.8, 0.2), shell, s * 0.6, 1.2, 0.1, bot); arm.rotation.x = -0.5; }
    const sign = this.makeLabel(S.name, S.color, 640, 128); sign.position.set(0, 5, 0.5); sign.scale.set(6, 1.2, 1); g.add(sign);
    const icon = this.makeLabel('SHOP', '#ffd23f', 256, 96); icon.position.set(0, 6.3, 0.5); icon.scale.set(2.4, 0.9, 1); g.add(icon);
    const fwd = new THREE.Vector3(0, 0, 1.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), face);
    const shop = { x: x + fwd.x * 1.6, z: z + fwd.z * 1.6, y, head, t: 0, color: S.color, biome };
    this.shops.push(shop);
    for (const s of [-2, 0, 2]) {
      const w = new THREE.Vector3(s, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), face);
      this.addCollider(x + w.x, z + w.z, 1.2, y + 1.6, 'wall', y - 1);
    }
    return shop;
  },
  // ─────────── Text signs ───────────
  makeLabel(text, color = '#ffffff', w = 512, h = 96) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.userData.canvas = c; s.userData.tex = tex;
    this.setLabel(s, text, color);
    s.scale.set(w / h * 1.1, 1.1, 1);
    return s;
  },

  setLabel(s, text, color, sub) {
    const c = s.userData.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(8,14,26,0.72)';
    roundRect(g, 6, 6, c.width - 12, c.height - 12, 22); g.fill();
    g.strokeStyle = color; g.lineWidth = 5; g.stroke();
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${sub ? 34 : 44}px Orbitron, sans-serif`;
    g.fillText(text, c.width / 2, sub ? c.height * 0.38 : c.height / 2 + 2);
    if (sub) { g.font = '700 26px Rajdhani, sans-serif'; g.fillStyle = '#dfe8f4'; g.fillText(sub, c.width / 2, c.height * 0.74); }
    s.userData.tex.needsUpdate = true;
  },

  // ═════════════════════ Props (batched) ═════════════════════
  scatterProps() {
    const low = this.lowSpec;
    const rockGeos = [];
    for (let v = 0; v < 6; v++) {
      const g = new THREE.IcosahedronGeometry(1, v % 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = 1 + rand(-0.22, 0.22); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
      g.computeVertexNormals();
      rockGeos.push(g);
    }
    const rockMats = this.pal.map((P) => Mat.std(P.ground.rock, { rough: 0.95, metal: 0.05 }));
    const rockDensity = [0.7, 0.9, 1.6, 1.1, 0.5];
    for (let i = 0, n = low ? 750 : 1150; i < n; i++) {
      const s = rand(1.2, 5.5);
      const at = this.randomClear(s, 6, WORLD.water - 2, 1.4);
      if (!at) continue;
      const [x, z] = at;
      const bi = Terra.dominant(x, z);
      if (_rng() > rockDensity[bi] / 1.6) continue;
      const ys = rand(0.5, 1.3);
      const y = this.heightAt(x, z) - s * 0.25;
      Batch.add(pick(rockGeos), rockMats[bi], x, y, z, s * rand(0.8, 1.2), s * ys, s * rand(0.8, 1.2), rand(-0.3, 0.3), rand(0, TAU), rand(-0.3, 0.3));
      this.addCollider(x, z, s * 0.85, y + s * ys * 0.9, 'rock');
    }

    const concrete = Mat.std('#3a3a44', { rough: 0.85, metal: 0.2 });
    for (let i = 0, n = low ? 60 : 100; i < n; i++) {
      const at = this.randomClear(1.5, 10, undefined, 0.7);
      if (!at) continue;
      const [x, z] = at;
      const P = this.pal[Terra.dominant(x, z)];
      const h = rand(3, 13), y = this.heightAt(x, z), ry = rand(0, TAU);
      Batch.add(Geo.box(1.4, h, 1.4), concrete, x, y + h / 2 - 0.3, z, 1, 1, 1, 0, ry, 0);
      Batch.add(Geo.box(1.7, 0.4, 1.7), concrete, x, y + h - 0.2, z, 1, 1, 1, 0, ry, 0);
      if (_rng() < 0.7) Batch.add(Geo.box(0.08, h * 0.6, 0.08), Mat.glow(P.accent, 3), x + Math.cos(ry) * 0.72, y + h * 0.45, z - Math.sin(ry) * 0.72, 1, 1, 1, 0, ry, 0, false);
      this.addCollider(x, z, 1.1, y + h, 'pillar');
    }

    // ice & magma crystals
    for (let i = 0, n = low ? 90 : 150; i < n; i++) {
      const at = this.randomClear(1.5, 8);
      if (!at) continue;
      const [x, z] = at;
      const bi = Terra.dominant(x, z);
      if (bi !== 1 && bi !== 3) continue;
      const cc = bi === 1 ? '#bff0ff' : '#ff7a1a';
      const cm = Mat.std(cc, { rough: 0.1, metal: 0.2, emissive: cc, ei: 1.6 });
      const y = this.heightAt(x, z);
      for (let k = randi(3, 6); k > 0; k--) {
        const s = rand(0.5, 1.3);
        Batch.add(Geo.oct(1), cm, x + rand(-1.2, 1.2), y + s * 1.2, z + rand(-1.2, 1.2), s * 0.5, s * rand(1.5, 3.2), s * 0.5, rand(-0.4, 0.4), rand(0, TAU), rand(-0.4, 0.4), false);
      }
      this.addCollider(x, z, 1.6, y + 3);
    }

    const scrapMats = ['#6a4a3a', '#4a4e58', '#7a5a2a', '#3a4450'].map((c) => Mat.std(c, { rough: 0.7, metal: 0.6 }));
    for (let i = 0, n = low ? 110 : 170; i < n; i++) {
      const at = this.randomClear(2, 8);
      if (!at) continue;
      const [x, z] = at;
      const y = this.heightAt(x, z);
      for (let k = randi(3, 7); k > 0; k--) {
        const w = rand(0.5, 2), h = rand(0.3, 1.2), dd = rand(0.5, 2);
        const geo = _rng() < 0.3 ? Geo.cyl(w * 0.4, w * 0.4, h * 2, 8) : Geo.box(w, h, dd);
        Batch.add(geo, pick(scrapMats), x + rand(-1.5, 1.5), y + h * 0.3 + k * 0.25, z + rand(-1.5, 1.5), 1, 1, 1, rand(-0.6, 0.6), rand(0, TAU), rand(-0.6, 0.6));
      }
      this.addCollider(x, z, 1.8, y + 1.6);
    }

    // lamps along the roads out of home base
    const pole = Mat.std('#22242c', { metal: 0.8 });
    for (const S of this.shopPlans) {
      for (let k = 1; k <= 6; k++) {
        const t = k / 7, x = S.x * t + 6, z = S.z * t + 6;
        if (!this.isClear(x, z, 0.5)) continue;
        const y = this.heightAt(x, z);
        Batch.add(Geo.cyl(0.12, 0.18, 5, 6), pole, x, y + 2.5, z);
        Batch.add(Geo.sphere(0.3, 1), Mat.glow('#ffd88a', 5), x, y + 5.1, z, 1, 1, 1, 0, 0, 0, false);
        this.addCollider(x, z, 0.3, y + 5);
      }
    }
    if (!low) this.buildSnowmen(24);
  },

  // ═════════════════════ Trees, flowers & grass ═════════════════════
  scatterFlora() {
    const low = this.lowSpec;
    const density = [1, 0.8, 0.5, 0.45, 0.35];
    const groups = new Map();   // trees grouped by area & biome so each group can be culled
    const add = (key, F, item) => { let g = groups.get(key); if (!g) { g = { F, list: [], ground: [] }; groups.set(key, g); } g.list.push(item); };
    const cell = 400;
    let last = null;
    for (let i = 0, n = low ? 1500 : 2800; i < n; i++) {
      let at = this.randomClear(1.6, 4, WORLD.water + 0.8, 0.75);
      if (!at) continue;
      let [x, z] = at;
      if (last && _rng() < 0.55) {
        const a = rand(0, TAU), d = rand(3.5, 7), nx = last.x + Math.cos(a) * d, nz = last.z + Math.sin(a) * d;
        if (this.isClear(nx, nz, 1.2) && this.slopeAt(nx, nz) < 0.75) { x = nx; z = nz; }
      }
      const bi = Terra.dominant(x, z);
      const hub = Terra.hubMask(x, z);
      if (_rng() > density[bi] * (hub > 0.3 ? 0.4 : 1)) continue;
      const F = hub > 0.5 ? HUB.flora : this.pal[bi].flora;
      if (!F.trees && bi !== 4) continue;
      const tr = { x, z, y: this.heightAt(x, z), s: rand(0.8, 1.4) };
      last = tr;
      const key = Math.floor((x + 1e4) / cell) + ',' + Math.floor((z + 1e4) / cell) + '|' + (hub > 0.5 ? 'hub' : bi);
      add(key, bi === 4 ? ZONES[0].flora : F, tr);
      this.addCollider(x, z, 0.42 * tr.s, tr.y + this.treeHeight(F.kind, tr.s) * 0.92, 'tree');
    }
    for (let i = 0, n = low ? 420 : 900; i < n; i++) {
      const at = this.randomClear(0.5, 3, WORLD.water + 0.6, 0.8);
      if (!at) continue;
      const [x, z] = at;
      const bi = Terra.dominant(x, z), hub = Terra.hubMask(x, z);
      const F = hub > 0.5 ? HUB.flora : bi === 4 ? COAST.flora : this.pal[bi].flora;
      const key = Math.floor((x + 1e4) / cell) + ',' + Math.floor((z + 1e4) / cell) + '|g' + (hub > 0.5 ? 'hub' : bi);
      let g = groups.get(key); if (!g) { g = { F, list: [], ground: [] }; groups.set(key, g); }
      g.ground.push({ x, z, y: this.heightAt(x, z), r: rand(2, 5) });
    }
    // a ring of flowers around the house
    const ring = { F: HUB.flora, list: [], ground: [] };
    for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU, r = rand(20, 30); const x = Math.sin(a) * r, z = Math.cos(a) * r - 2; ring.ground.push({ x, z, y: this.heightAt(x, z), r: 2.2 }); }
    groups.set('ring', ring);
    for (const g of groups.values()) {
      if (g.list.length) this.plantTrees(g.list, g.F);
      if (g.ground.length) this.plantGround(g.ground, g.F);
    }
  },

  treeHeight(kind, s) { return (kind === 'pine' ? 6.2 : kind === 'dead' ? 4.8 : 5) * s; },
  // Low-poly trees: brown trunks with leafy green canopies (or snowy pines / charred husks).
  plantTrees(list, F) {
    if (!list.length) return;
    const col = new THREE.Color(), d = new THREE.Object3D();
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.85, metalness: 0 });
    const inst = (geo, n) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      this.group.add(m);
      return m;
    };
    const set = (m, i, x, y, z, sx, sy, sz, ry, hex, jitter = 0.06, rx = 0, rz = 0) => {
      d.position.set(x, y, z); d.rotation.set(rx, ry, rz); d.scale.set(sx, sy, sz); d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      col.set(hex); col.offsetHSL(rand(-jitter, jitter) * 0.3, rand(-jitter, jitter), rand(-jitter, jitter));
      m.setColorAt(i, col);
    };
    const n = list.length;
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.32, 1, 6); trunkGeo.translate(0, 0.5, 0);
    const trunks = inst(trunkGeo, n);
    if (F.kind === 'pine') {
      const cone = new THREE.ConeGeometry(1, 1, 7); cone.translate(0, 0.5, 0);
      const tiers = inst(cone, n * 3);
      const caps = F.snowy ? inst(cone, n * 3) : null;
      list.forEach((t, i) => {
        const s = t.s;
        set(trunks, i, t.x, t.y - 0.2, t.z, s * 0.9, 1.6 * s, s * 0.9, 0, F.trunk);
        const leaf = pick(F.leaves);
        for (let k = 0; k < 3; k++) {
          const w = (1.9 - k * 0.5) * s, h = (2.4 - k * 0.35) * s, y = t.y + (1.2 + k * 1.45) * s;
          set(tiers, i * 3 + k, t.x, y, t.z, w, h, w, rand(0, TAU), leaf);
          if (caps) set(caps, i * 3 + k, t.x, y + h * 0.45, t.z, w * 0.62, h * 0.55, w * 0.62, rand(0, TAU), '#f4faff', 0.02);
        }
      });
    } else if (F.kind === 'dead') {
      const branchGeo = new THREE.BoxGeometry(0.16, 1, 0.16); branchGeo.translate(0, 0.5, 0);
      const branches = inst(branchGeo, n * 3);
      const emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a2a').multiplyScalar(3) });
      const embers = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16, 0), emberMat, n * 3);
      embers.frustumCulled = false; this.group.add(embers);
      list.forEach((t, i) => {
        const s = t.s;
        set(trunks, i, t.x, t.y - 0.2, t.z, s * 0.8, 4.4 * s, s * 0.8, rand(0, TAU), F.trunk, 0.02, rand(-0.12, 0.12), rand(-0.12, 0.12));
        for (let k = 0; k < 3; k++) {
          const a = rand(0, TAU), y = t.y + (1.8 + k * 0.9) * s, len = rand(1, 1.8) * s, tilt = rand(0.7, 1.1);
          set(branches, i * 3 + k, t.x, y, t.z, s, len, s, a, F.trunk, 0.02, 0, tilt);
          const tip = new THREE.Vector3(0, len, 0).applyEuler(new THREE.Euler(0, a, tilt));
          d.position.set(t.x + tip.x, y + tip.y, t.z + tip.z); d.rotation.set(0, 0, 0); d.scale.setScalar(rand(0.6, 1.2)); d.updateMatrix();
          embers.setMatrixAt(i * 3 + k, d.matrix);
        }
      });
    } else {
      // round broadleaf trees: 3 leafy blobs per tree
      const blob = new THREE.IcosahedronGeometry(1, 1);
      const canopy = inst(blob, n * 3);
      list.forEach((t, i) => {
        const s = t.s;
        set(trunks, i, t.x, t.y - 0.2, t.z, s, 3 * s, s, 0, F.trunk);
        const leaf = pick(F.leaves);
        const top = t.y + 3.2 * s;
        set(canopy, i * 3, t.x, top, t.z, 1.8 * s, 1.5 * s, 1.8 * s, rand(0, TAU), leaf);
        for (let k = 1; k < 3; k++) {
          const a = rand(0, TAU);
          set(canopy, i * 3 + k, t.x + Math.cos(a) * 1.1 * s, top + rand(-0.6, 0.5) * s, t.z + Math.sin(a) * 1.1 * s, 1.2 * s, 1.05 * s, 1.2 * s, rand(0, TAU), leaf);
        }
      });
    }
  },

  // Flower meadows and grass tufts around the given spots ({x, z, y, r}).
  plantGround(spots, F) {
    const col = new THREE.Color(), d = new THREE.Object3D();
    const nG = F.grass && F.grass.length ? spots.length * 9 : 0;
    const nF = F.flowers && F.flowers.length ? spots.length * 7 : 0;
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.8, metalness: 0 });
    const place = (m, i, s, h, hex, sy = 1) => {
      let x = s.x, z = s.z, y = s.y;
      for (let t = 0; t < 4; t++) {
        const a = rand(0, TAU), r = Math.sqrt(_rng()) * s.r;
        x = s.x + Math.cos(a) * r; z = s.z + Math.sin(a) * r;
        y = s.fixed ? s.y : this.heightAt(x, z);
        if (y > this.hazardLevel + 0.3) break;
      }
      d.position.set(x, y + h, z); d.rotation.set(rand(-0.2, 0.2), rand(0, TAU), rand(-0.2, 0.2)); d.scale.set(1, sy, 1); d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      col.set(hex); col.offsetHSL(0, rand(-0.05, 0.05), rand(-0.06, 0.06));
      m.setColorAt(i, col);
    };
    if (nG) {
      const g = new THREE.ConeGeometry(0.09, 0.5, 3); g.translate(0, 0.05, 0);
      const m = new THREE.InstancedMesh(g, mat, nG); m.frustumCulled = false; m.receiveShadow = true; this.group.add(m);
      for (let i = 0; i < nG; i++) place(m, i, spots[i % spots.length], 0.1, pick(F.grass), rand(0.7, 1.4));
    }
    if (nF) {
      const stem = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 3); stem.translate(0, -0.2, 0);
      const stems = new THREE.InstancedMesh(stem, mat, nF); stems.frustumCulled = false; this.group.add(stems);
      const head = new THREE.IcosahedronGeometry(0.11, 0); head.scale(1, 0.55, 1);
      const heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.5, emissive: '#222222' }), nF);
      heads.frustumCulled = false; this.group.add(heads);
      for (let i = 0; i < nF; i++) {
        const s = spots[i % spots.length];
        const hex = pick(F.flowers);
        place(heads, i, s, 0.42, hex);
        heads.getMatrixAt(i, d.matrix);
        stems.setMatrixAt(i, d.matrix); stems.setColorAt(i, col.set('#3f8a2a'));
      }
    }
  },

  buildSnowmen(n) {
    const snow = Mat.std('#f4f8ff', { rough: 0.9, metal: 0 });
    for (let i = 0, made = 0; i < 200 && made < n; i++) {
      const at = this.randomClear(1.2, 6);
      if (!at || Terra.dominant(at[0], at[1]) !== 1) continue;
      const [x, z] = at, y = this.heightAt(x, z), ry = rand(0, TAU);
      Batch.add(Geo.sphere(0.8, 1), snow, x, y + 0.7, z);
      Batch.add(Geo.sphere(0.55, 1), snow, x, y + 1.75, z);
      Batch.add(Geo.sphere(0.38, 1), snow, x, y + 2.5, z);
      Batch.add(Geo.cyl(0, 0.07, 0.4, 5), Mat.std('#ff8a2a', { rough: 0.6, metal: 0 }), x + Math.sin(ry) * 0.52, y + 2.5, z + Math.cos(ry) * 0.52, 1, 1, 1, Math.PI / 2, ry, 0);
      Batch.add(Geo.cyl(0.26, 0.3, 0.35, 8), Mat.std('#2a2a34', { metal: 0.3 }), x, y + 2.9, z);
      this.addCollider(x, z, 0.8, y + 3, 'rock');
      made++;
    }
  },

  // ═════════════════════ Caches, Scrap Sprites & camp sites ═════════════════════
  placeCaches() {
    const n = this.lowSpec ? 70 : 90;
    for (let i = 0, made = 0; i < n * 4 && made < n; i++) {
      const at = this.randomClear(1.5, 6, undefined, 0.6);
      if (!at || Terra.hubMask(at[0], at[1]) > 0.2) continue;
      this.buildCache(at[0], at[1], made % 9 === 0);
      made++;
    }
  },

  placeSprites(n) {
    const spots = [];
    for (const is of this.islands.slice().sort(() => _rng() - 0.5).slice(0, 10)) spots.push([is.x + rand(-is.r * 0.5, is.r * 0.5), is.top + 0.6, is.z + rand(0, is.r * 0.5)]);
    const tall = this.colliders.filter((c) => c.bottom === -Infinity && ((c.kind === 'pillar' && c.top - this.heightAt(c.x, c.z) > 6) || (c.kind === 'rock' && c.top - this.heightAt(c.x, c.z) > 3.2)));
    tall.sort(() => _rng() - 0.5);
    for (const c of tall) { if (spots.length >= n - 6) break; spots.push([c.x, c.top + 0.6, c.z]); }
    // a few on top of tall cliffs
    for (let t = 0; t < 400 && spots.length < n; t++) {
      const at = this.randomClear(1, 2, 25, 0.5);
      if (at) spots.push([at[0], this.heightAt(at[0], at[1]) + 0.6, at[1]]);
    }
    for (const [x, y, z] of spots.slice(0, n)) {
      const m = buildSpriteModel(); m.position.set(x, y, z); this.group.add(m);
      this.sprites.push({ x, y, z, model: m, found: false, ph: rand(0, TAU) });
    }
  },

  // where robot camps gather; the game spawns their robots when you come near
  planCamps() {
    const step = 115;
    for (let gz = -this.half + 60; gz < this.half - 60; gz += step) for (let gx = -this.half + 60; gx < this.half - 60; gx += step) {
      for (let t = 0; t < 6; t++) {
        const x = gx + rand(0, step), z = gz + rand(0, step);
        if (Math.hypot(x, z) < 170 || !this.isClear(x, z, 7) || this.slopeAt(x, z) > 0.45) continue;
        if (this.arenas.some((A) => Math.hypot(A.x - x, A.z - z) < A.r + 30)) continue;
        if (this.islandAt(x, z, 10)) continue;
        const bi = Terra.dominant(x, z);
        const zi = REGIONS.terra[bi].zone;
        const camp = this.buildBrazier(x, z, this.heightAt(x, z));
        Object.assign(camp, { tier: REGIONS.terra[bi].tier, pool: (bi === 4 ? COAST : ZONES[zi]).pool, size: randi(3, 4 + Math.floor(REGIONS.terra[bi].tier / 2)), id: this.campSites.length });
        this.campSites.push(camp);
        break;
      }
    }
    for (const is of this.islands) {
      if (is.kind !== 'camp' && is.kind !== 'beacon') continue;
      const a = rand(0, TAU), off = is.kind === 'beacon' ? is.r * 0.55 : 0;
      const camp = this.buildBrazier(is.x + Math.cos(a) * off, is.z + Math.sin(a) * off, is.top);
      Object.assign(camp, { tier: 4, pool: ZONES[4].pool, size: randi(3, 5), island: is, id: this.campSites.length });
      this.campSites.push(camp);
    }
  },

  buildBrazier(x, z, y) {
    const dark = Mat.std('#1c1a1e', { metal: 0.7, rough: 0.5 });
    Batch.add(Geo.cyl(0.25, 0.45, 0.9, 6), dark, x, y + 0.45, z);
    Batch.add(Geo.cyl(0.9, 0.55, 0.4, 8), dark, x, y + 1.05, z);
    const wood = Mat.std('#5a3a2a', { metal: 0.5 });
    for (let k = 0; k < 4; k++) Batch.add(Geo.box(0.12, 0.5, 0.12), wood, x + rand(-0.3, 0.3), y + 1.35, z + rand(-0.3, 0.3), 1, 1, 1, rand(-0.6, 0.6), 0, rand(-0.6, 0.6));
    const flames = [];
    for (const [c, s2, yy] of [['#ff6a1a', 2.6, 1.6], ['#ffb347', 1.6, 1.9], ['#fff2c0', 0.8, 1.5]]) {
      const f = glowSprite(c, s2, 2.2); f.position.set(x, y + yy, z); this.group.add(f); flames.push(f);
    }
    const seat = Mat.std('#4a3e38', { metal: 0.5, rough: 0.7 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + rand(-0.2, 0.2);
      const sx = Math.cos(a) * 4.2, sz = Math.sin(a) * 4.2;
      const sy = this.islandAt(x, z) ? y : this.heightAt(x + sx, z + sz);
      Batch.add(Geo.box(rand(0.8, 1.4), 0.4, rand(0.5, 0.8)), seat, x + sx, sy + 0.15, z + sz, 1, 1, 1, 0, -a + rand(-0.3, 0.3), 0);
    }
    this.addCollider(x, z, 0.9, y + 1.3, 'brazier', y - 1);
    const camp = { x, z, y, r: 6, flames, alerted: false };
    this.braziers.push(camp);
    return camp;
  },

  // ═════════════════════ Per-frame ═════════════════════
  update(dt, time, cam) {
    if (this.skyMesh) this.skyMesh.position.copy(cam.position);
    // environment follows the camera's biome
    this.envBlend(cam.position.x, cam.position.z, cam.position.y, 1 - Math.exp(-1.6 * dt));
    this.lavaMat.emissiveIntensity = 1.3 + Math.sin(time * 2) * 0.25;
    if (this.fallTex) this.fallTex.offset.y -= dt * 1.6;
    const near = (x, z, R) => Math.abs(x - cam.position.x) < R && Math.abs(z - cam.position.z) < R;
    for (const b of this.beacons) {
      if (!near(b.x, b.z, 300)) continue;
      b.rings.forEach((r, i) => (r.rotation.z += dt * (i % 2 ? -1 : 1) * (b.state === 'charging' ? 4 : b.state === 'done' ? 1.2 : 0.4)));
      b.crystal.rotation.y += dt * 1.5;
      b.crystal.position.y = 9.3 + Math.sin(time * 2 + b.id) * 0.25;
      b.zoneRing.material.opacity = b.state === 'charging' ? 0.5 + 0.3 * Math.sin(time * 6) : 0;
    }
    for (const c of this.caches) {
      if (c.opened && c.openT < 1) {
        c.openT = Math.min(1, c.openT + dt * 3);
        c.lid.rotation.x = -c.openT * 1.9;
        c.sprite.material.opacity = 1 - c.openT;
      } else if (!c.opened && near(c.x, c.z, 160)) c.sprite.material.opacity = 0.6 + 0.4 * Math.sin(time * 3 + c.x);
    }
    for (const A of this.arenas) {
      if (A.opening) {
        A.fade = Math.max(0, A.fade - dt * 0.6);
        A.dome.material.opacity = 0.12 * A.fade;
        A.domeWire.material.opacity = 0.25 * A.fade;
        A.domeWire.scale.setScalar(1 + (1 - A.fade) * 0.2);
        if (A.fade <= 0) { A.dome.visible = A.domeWire.visible = false; A.opening = false; }
      } else if (A.sealed || (this.domeTrap && this.arena === A)) {
        const trap = this.domeTrap && this.arena === A;
        A.domeWire.rotation.y += dt * (trap ? 0.3 : 0.05);
        A.dome.material.opacity = trap ? 0.035 + 0.015 * Math.sin(time * 5) : 0.1 + 0.04 * Math.sin(time * 2);
        A.domeWire.material.opacity = trap ? 0.2 : 0.25;
      }
    }
    // far-away glows are hidden (each one is a draw call and the fog hides them anyway)
    this.cullT = (this.cullT || 0) - dt;
    if (this.cullT <= 0) {
      this.cullT = 0.4;
      for (const b of this.braziers) { const v = near(b.x, b.z, 260); if (v !== b.shown) { b.shown = v; for (const f of b.flames) f.visible = v; } }
      for (const c of this.caches) { const v = near(c.x, c.z, 220); if (v !== c.shown) { c.shown = v; c.group.visible = v; } }
      for (const sp of this.sprites) if (!sp.found) sp.model.visible = near(sp.x, sp.z, 200);
    }
    for (const b of this.braziers) {
      if (!near(b.x, b.z, 140)) continue;
      b.flames.forEach((f, i) => { const k = 1 + Math.sin(time * (9 + i * 3) + b.x) * 0.12 + Math.random() * 0.08; f.scale.setScalar([2.6, 1.6, 0.8][i] * k); });
      if (Math.random() < dt * 8 && near(b.x, b.z, 90)) Fx.glow.emit(b.x + rand(-0.4, 0.4), b.y + 1.6, b.z + rand(-0.4, 0.4), rand(-0.3, 0.3), rand(2, 4), rand(-0.3, 0.3), rand(1, 2), 0.15, new THREE.Color('#ff8a3a'), 3, 0.2, -0.5, 1);
    }
    for (const sp of this.sprites) {
      if (sp.found || !near(sp.x, sp.z, 120)) continue;
      sp.model.position.y = sp.y + Math.sin(time * 2 + sp.ph) * 0.12;
      sp.model.rotation.y += dt * 1.2;
    }
    for (const s of this.secrets) {
      if (s.found || !near(s.x, s.z, 80)) continue;
      s.model.position.y = s.y + Math.sin(time * 2 + s.ph) * 0.15;
      s.model.rotation.y += dt * 1.5;
    }
    for (const S of this.shops) if (near(S.x, S.z, 120)) S.head.rotation.y = Math.sin(time * 0.8 + S.x) * 0.5;
    for (const pad of this.chargePads) pad.ring.scale.setScalar(1 + 0.06 * Math.sin(time * 4 + pad.x));
    if (this.homeDome) {
      const D = this.homeDome;
      D.wire.rotation.y += dt * 0.04;
      D.dome.material.opacity = 0.04 + 0.015 * Math.sin(time * 1.6);
      D.orb.position.y = 3 + Math.sin(time * 2) * 0.15;
      if (D.flash > 0) { D.flash -= dt * 2; D.dome.material.opacity += D.flash * 0.3; }
    }
    for (const u of this.updraftCols) {
      if (!near(u.x, u.z, 160)) continue;
      if (Math.random() < dt * 16) {
        const a = rand(0, TAU), r = rand(0, u.r);
        Fx.glow.emit(u.x + Math.cos(a) * r, u.base + rand(0, 40), u.z + Math.sin(a) * r, 0, rand(8, 14), 0, rand(2, 3.5), 0.18, new THREE.Color('#dff6ff'), 1.4, 0.2, 0, 1);
      }
    }
    for (const f of this.waterfalls) {
      if (!near(f.x, f.z, 150) || Math.random() > dt * 22) continue;
      const p = f.pts[f.pts.length - 1];
      Fx.glow.emit(p[0] + rand(-2.5, 2.5), WORLD.water + 0.3, p[2] + rand(-2.5, 2.5), rand(-2, 2), rand(2, 5), rand(-2, 2), rand(0.6, 1.2), 0.3, new THREE.Color('#ffffff'), 1.2, 1, 6, 0);
    }
    for (const v of this.craters) if (near(v.x, v.z, 500) && Math.random() < dt * 3) Fx.smoke(v.x + rand(-4, 4), v.y + 4, v.z + rand(-4, 4), 6, 8, rand(-1, 1), rand(4, 7), rand(-1, 1), '#3a2a26');
  },
};

// liquids that cover low ground
const LIQUIDS = {
  water: { color: '#2f86c4', glow: '#6ad0ff', dmg: 0, slow: 0.55, name: 'Water' },
  lava: { color: '#ff4a0a', glow: '#ff7a1a', dmg: 16, slow: 0.6, name: 'Lava' },
};
