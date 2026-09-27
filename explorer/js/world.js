'use strict';
// Procedural zone generation: terrain, sky, hazards, props, beacons, caches, arena, portal.

const World = {
  size: 440,
  seg: 2.5,
  hazardLevel: -3,

  build(scene, zone, idx) {
    this.scene = scene;
    this.zone = zone;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.half = this.size / 2;
    this.N = Math.round(this.size / this.seg);
    this.noise = makePerlin(1337 + idx * 7919 + Math.floor(Math.random() * 100000));
    this.colliders = [];
    this.grid = new Map();
    this.beacons = [];
    this.caches = [];
    this.lamps = [];
    this.animated = [];
    this.anim = [];
    this.islands = [];
    this.braziers = [];
    this.sprites = [];
    this.terminals = [];
    this.hubPortals = [];
    this.chargePads = [];
    this.updraftCols = [];
    this.volcanoes = [];
    this.shop = null; this.homePortal = null; this.homeDome = null; this.portal = null;
    this.domeSealed = false; this.domeTrap = false; this.domeOpening = false; this.dome = null;
    this.hub = !!zone.hub;
    this.sky = !!zone.sky3;
    this.hazardLevel = zone.hazardLevel ?? -3;
    this.T = zone.terrain || { amp: 1, ridge: 1 };
    if (this.hub) return this.buildHubWorld();
    if (this.sky) return this.buildSkyWorld(idx);

    // key locations
    this.arena = { x: 0, z: 0, r: 30 };
    this.spawn = { x: 0, z: 165 };
    const flats = [{ x: this.arena.x, z: this.arena.z, r: 34 }, { x: this.spawn.x, z: this.spawn.z, r: 19 }];
    const nb = zone.beacons;
    const baseA = rand(0, TAU);
    for (let i = 0; i < nb; i++) {
      const a = baseA + (i / nb) * TAU + rand(-0.25, 0.25);
      const r = rand(105, 150);
      let x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - this.spawn.x, z - this.spawn.z) < 60) { x *= 0.8; z = -Math.abs(z); }
      flats.push({ x, z, r: 11, beacon: true });
    }
    for (const f of flats) f.h = Math.max(this.hazardLevel + 2.5, this.rawHeight(f.x, f.z) * 0.6 + 1);
    this.flats = flats;

    this.buildTerrain();
    this.buildSky();
    this.buildHazard();
    this.buildLights();
    this.buildArena();
    for (const f of flats) if (f.beacon) this.buildBeacon(f.x, f.z);
    this.buildSpawnPad();
    this.buildHomePortal(this.spawn.x - 13, this.spawn.z + 2);
    this.buildShop(this.spawn.x + 13, this.spawn.z + 1);
    this.scatterProps();
    this.scatterFlora();
    if (zone.volcanoes) this.buildVolcanoes();
    this.placeCaches(10 + idx);
    this.buildIslands(idx >= 2 ? 3 : 2);
    this.placeSprites(8 + Math.floor(idx / 2));
    return this;
  },

  // floor height used for placing things: island tops in the sky biome, terrain elsewhere
  surf(x, z) {
    if (this.sky) { const is = this.islandAt(x, z); return is ? is.top : this.hazardLevel; }
    return this.heightAt(x, z);
  },
  islandAt(x, z, pad = 0) {
    let best = null;
    for (const is of this.islands) if ((x - is.x) ** 2 + (z - is.z) ** 2 < (is.r + pad) ** 2 && (!best || is.top > best.top)) best = is;
    return best;
  },
  // walkable floor for ground robots (they never walk off sky islands)
  floorAt(x, z, y = 1e9) {
    if (this.sky) { const is = this.islandAt(x, z); return is ? is.top : this.hazardLevel; }
    return this.heightAt(x, z);
  },

  dispose() {
    if (!this.group) return;
    this.scene.remove(this.group);
    const shared = new Set(Geo.cache.values());
    this.group.traverse((o) => {
      if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose();
    });
    this.scene.remove(this.hemi, this.sun, this.sun.target);
    this.group = null;
  },

  // ─────────── Height field ───────────
  rawHeight(x, z) {
    if (this.sky) return -40;
    const n = this.noise, T = this.T;
    let h = 0, amp = 1, f = 0.0055;
    for (let o = 0; o < 5; o++) { h += n(x * f + o * 17.3, z * f - o * 9.1) * amp; amp *= 0.5; f *= 2.03; }
    h *= 15 * T.amp;
    const r = 1 - Math.abs(n(x * 0.004 + 50, z * 0.004 - 20));
    h += r * r * 9 * T.ridge - 3;
    const e = Math.max(Math.abs(x), Math.abs(z)) / this.half;
    if (e > 0.76) h += Math.pow((e - 0.76) / 0.24, 2) * 55;
    return h;
  },

  shapedHeight(x, z) {
    let h = this.rawHeight(x, z);
    for (const f of this.flats) {
      const d = Math.hypot(x - f.x, z - f.z);
      const k = 1 - smoothstep(f.r * 0.8, f.r * 1.7, d);
      if (k > 0) h = lerp(h, f.h, k);
    }
    return Math.max(h, this.hazardLevel - 1.1);
  },

  heightAt(x, z) {
    const N = this.N, s = this.seg;
    const fx = clamp((x + this.half) / s, 0, N - 0.0001), fz = clamp((z + this.half) / s, 0, N - 0.0001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const H = this.heights, W = N + 1;
    const a = H[iz * W + ix], b = H[iz * W + ix + 1], c = H[(iz + 1) * W + ix], d = H[(iz + 1) * W + ix + 1];
    // match the triangle split used by PlaneGeometry (a-c-b / c-d-b)
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  },

  inHazard(x, z) { return this.heightAt(x, z) < this.hazardLevel - 0.15; },

  buildTerrain() {
    const N = this.N, S = this.size, W = N + 1;
    const geo = new THREE.PlaneGeometry(S, S, N, N);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    this.heights = new Float32Array(W * W);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.shapedHeight(x, z);
      pos.setY(i, h);
      this.heights[i] = h;
    }
    geo.computeVertexNormals();
    const G = this.zone.ground;
    const cLow = new THREE.Color(G.low), cMid = new THREE.Color(G.mid), cHigh = new THREE.Color(G.high), cRock = new THREE.Color(G.rock);
    const cP1 = G.patch ? new THREE.Color(G.patch) : null, cP2 = G.patch2 ? new THREE.Color(G.patch2) : null, cCap = G.cap ? new THREE.Color(G.cap) : null;
    const sector = this.hub ? ZONES.map((z) => [new THREE.Color(z.ground.mid), new THREE.Color(z.ground.high)]) : null;
    const cols = new Float32Array(pos.count * 3);
    const nrm = geo.attributes.normal;
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i), x = pos.getX(i), z = pos.getZ(i);
      const t = smoothstep(-4, 14, h);
      tmp.copy(cLow).lerp(cMid, Math.min(1, t * 1.6));
      if (t > 0.6) tmp.lerp(cHigh, (t - 0.6) / 0.4);
      const slope = 1 - nrm.getY(i);
      // colour variety: meadow/dirt patches, darker clumps, snow caps on peaks
      if (cP1) tmp.lerp(cP1, smoothstep(0.22, 0.42, this.noise(x * 0.018 + 100, z * 0.018 - 40)) * 0.55);
      if (cP2) tmp.lerp(cP2, smoothstep(0.18, 0.38, this.noise(x * 0.04 - 70, z * 0.04 + 30)) * 0.5);
      if (cCap) tmp.lerp(cCap, smoothstep(17, 25, h + this.noise(x * 0.05, z * 0.05) * 4) * (1 - smoothstep(0.3, 0.55, slope)));
      if (sector) {
        // the meadow around home base takes on each biome's colours toward its portal
        const k = Math.round(((Math.atan2(x, z) / TAU) * 5 + 5)) % 5;
        const w = smoothstep(80, 190, Math.hypot(x, z)) * 0.75;
        if (w > 0) tmp.lerp(t > 0.6 ? sector[k][1] : sector[k][0], w);
      }
      tmp.lerp(cRock, smoothstep(0.12, 0.35, slope));
      const v = 0.9 + this.noise(x * 0.08, z * 0.08) * 0.2;
      tmp.multiplyScalar(v);
      if (h < this.hazardLevel + 0.6) tmp.multiplyScalar(0.6);
      cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0.05 });
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    this.group.add(m);
    this.terrain = m;

    // neon grid overlay for digital zones
    if (this.zone.gridGlow) {
      const pts = [];
      const step = 10, sub = this.seg;
      for (let gx = -this.half + step; gx < this.half; gx += step) {
        for (let z = -this.half; z < this.half; z += sub) {
          pts.push(gx, this.heightAt(gx, z) + 0.06, z, gx, this.heightAt(gx, z + sub) + 0.06, z + sub);
          pts.push(z, this.heightAt(z, gx) + 0.06, gx, z + sub, this.heightAt(z + sub, gx) + 0.06, gx);
        }
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: new THREE.Color(this.zone.gridGlow).multiplyScalar(0.9), transparent: true, opacity: 0.55 }));
      this.group.add(lines);
    }
  },

  buildSky() {
    const Z = this.zone;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(Z.sky.top) }, horizon: { value: new THREE.Color(Z.sky.horizon) }, bottom: { value: new THREE.Color(Z.sky.bottom) },
        sunColor: { value: new THREE.Color(Z.sun) }, sunDir: { value: new THREE.Vector3(...Z.sunDir).normalize() }, stars: { value: Z.stars ? 1 : 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 top, horizon, bottom, sunColor, sunDir; uniform float stars; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.5)) : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.35));
          float sd = max(dot(d, normalize(sunDir)), 0.0);
          c += sunColor * (pow(sd, 900.0) * 10.0 + pow(sd, 40.0) * 0.35 + pow(sd, 6.0) * 0.12);
          if (stars > 0.5) { vec3 q = floor(d * 280.0); float s = step(0.9975, hash(q)) * smoothstep(0.02, 0.3, h); c += vec3(s) * 3.0; }
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), mat);
    this.skyMesh.renderOrder = -10;
    this.skyMesh.frustumCulled = false;
    this.group.add(this.skyMesh);
    this.scene.fog = new THREE.FogExp2(new THREE.Color(Z.fog), Z.fogDensity);
    this.scene.background = null;
  },

  buildHazard() {
    const Hz = this.zone.hazard;
    const mat = new THREE.MeshStandardMaterial({
      color: Hz.color, emissive: Hz.glow, emissiveIntensity: Hz.dmg ? 1.4 : 0.25,
      roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.92, flatShading: true,
    });
    const geo = new THREE.PlaneGeometry(this.size, this.size, 60, 60);
    geo.rotateX(-Math.PI / 2);
    this.hazard = new THREE.Mesh(geo, mat);
    this.hazard.position.y = this.hazardLevel;
    this.hazard.receiveShadow = true;
    this.group.add(this.hazard);
    this.hazardBase = geo.attributes.position.array.slice();
  },

  buildLights() {
    const Z = this.zone;
    this.hemi = new THREE.HemisphereLight(Z.hemi[0], Z.hemi[1], Z.hemi[2]);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(Z.sun, Z.sunI);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.sunDir = new THREE.Vector3(...Z.sunDir).normalize();
  },

  followSun(x, y, z) {
    const d = this.sunDir;
    const sy = Math.max(0.35, d.y);
    this.sun.position.set(x + d.x * 120, y + sy * 120, z + d.z * 120);
    this.sun.target.position.set(x, y, z);
  },

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
    // boss dome: once the fight starts nobody gets out until the boss is down
    if (this.domeTrap) {
      const dx = p.x - this.arena.x, dz = p.z - this.arena.z, d = Math.hypot(dx, dz), R = this.arena.r + 1.2 - r;
      if (d > R) { p.x = this.arena.x + (dx / d) * R; p.z = this.arena.z + (dz / d) * R; hit = hit || { dome: true }; }
    }
    // sealed arena dome
    if (this.domeSealed) {
      const dx = p.x - this.arena.x, dz = p.z - this.arena.z, d = Math.hypot(dx, dz), R = this.arena.r + 2;
      if (d < R + r && d > R - 4) { p.x = this.arena.x + (dx / d) * (R + r); p.z = this.arena.z + (dz / d) * (R + r); hit = hit || { dome: true }; }
    }
    const lim = this.half * 0.93;
    p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
    return hit;
  },

  solidAt(x, y, z) {
    if (y < this.heightAt(x, z)) return true;
    for (const is of this.islands) if (y < is.top && y > is.top - 2.4 && (x - is.x) ** 2 + (z - is.z) ** 2 < is.r * is.r) return true;
    for (const c of this.near(x, z)) {
      if (y < c.top && y >= c.bottom && (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
    }
    return false;
  },

  isClear(x, z, r, minH = this.hazardLevel + 0.6) {
    if (Math.max(Math.abs(x), Math.abs(z)) > this.half * 0.74) return false;
    for (const f of this.flats) if (Math.hypot(x - f.x, z - f.z) < f.r + r + 4) return false;
    if (this.heightAt(x, z) < minH) return false;
    for (const c of this.near(x, z)) if (Math.hypot(x - c.x, z - c.z) < c.r + r + 1) return false;
    return true;
  },

  randomClear(r, tries = 40, minH) {
    for (let i = 0; i < tries; i++) {
      const x = rand(-this.half * 0.72, this.half * 0.72), z = rand(-this.half * 0.72, this.half * 0.72);
      if (this.isClear(x, z, r, minH)) return [x, z];
    }
    return null;
  },

  // ─────────── Props ───────────
  scatterProps() {
    const Z = this.zone, P = Z.props;
    const rockMat = Mat.std(Z.ground.rock, { rough: 0.95, metal: 0.05 });
    const rockGeos = [];
    for (let v = 0; v < 6; v++) {
      const g = new THREE.IcosahedronGeometry(1, v % 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const k = 1 + rand(-0.22, 0.22);
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
      }
      g.computeVertexNormals();
      rockGeos.push(g);
    }
    for (let i = 0; i < P.rocks; i++) {
      const s = rand(1.2, 5.5);
      const at = this.randomClear(s, 20, -99);
      if (!at) continue;
      const [x, z] = at;
      const ys = rand(0.5, 1.3);
      const y = this.heightAt(x, z) - s * 0.25;
      const m = mesh(pick(rockGeos), rockMat, x, y, z, this.group);
      m.scale.set(s * rand(0.8, 1.2), s * ys, s * rand(0.8, 1.2));
      m.rotation.set(rand(-0.3, 0.3), rand(0, TAU), rand(-0.3, 0.3));
      m.receiveShadow = true;
      this.addCollider(x, z, s * 0.85, y + s * ys * 0.9, 'rock');
    }

    const concrete = Mat.std('#3a3a44', { rough: 0.85, metal: 0.2 });
    const accentGlow = Mat.glow(Z.accent, 3);
    for (let i = 0; i < P.pillars; i++) {
      const at = this.randomClear(1.5, 20);
      if (!at) continue;
      const [x, z] = at;
      const h = rand(3, 13);
      const y = this.heightAt(x, z);
      const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = rand(0, TAU);
      if (Math.random() < 0.3) grp.rotation.z = rand(-0.2, 0.2);
      this.group.add(grp);
      mesh(Geo.box(1.4, h, 1.4), concrete, 0, h / 2 - 0.3, 0, grp).receiveShadow = true;
      mesh(Geo.box(1.7, 0.4, 1.7), concrete, 0, h - 0.2, 0, grp);
      if (Math.random() < 0.7) mesh(Geo.box(0.08, h * 0.6, 0.08), accentGlow, 0.72, h * 0.45, 0.72, grp).castShadow = false;
      if (Math.random() < 0.3) {
        // arch to a second pillar
        mesh(Geo.box(1.4, h * 0.8, 1.4), concrete, 5, h * 0.4 - 0.3, 0, grp);
        mesh(Geo.box(6.8, 0.8, 1.6), concrete, 2.5, h * 0.8, 0, grp);
        const w = new THREE.Vector3(5, 0, 0).applyEuler(grp.rotation);
        this.addCollider(x + w.x, z + w.z, 1.1, y + h);
      }
      this.addCollider(x, z, 1.1, y + h, 'pillar');
    }

    if (P.crystals) {
      const cc = Z.hazard.glow;
      const cm = Mat.std(cc, { rough: 0.1, metal: 0.2, emissive: cc, ei: 1.6 });
      for (let i = 0; i < P.crystals; i++) {
        const at = this.randomClear(1.5, 20);
        if (!at) continue;
        const [x, z] = at;
        const y = this.heightAt(x, z);
        const n = randi(3, 6);
        for (let k = 0; k < n; k++) {
          const s = rand(0.5, 1.3);
          const m = mesh(Geo.oct(1), cm, x + rand(-1.2, 1.2), y + s * 1.2, z + rand(-1.2, 1.2), this.group);
          m.scale.set(s * 0.5, s * rand(1.5, 3.2), s * 0.5);
          m.rotation.set(rand(-0.4, 0.4), rand(0, TAU), rand(-0.4, 0.4));
          m.castShadow = false;
        }
        this.addCollider(x, z, 1.6, y + 3);
      }
    }

    if (P.scrap) {
      const mats = ['#6a4a3a', '#4a4e58', '#7a5a2a', '#3a4450'].map((c) => Mat.std(c, { rough: 0.7, metal: 0.6 }));
      for (let i = 0; i < P.scrap; i++) {
        const at = this.randomClear(2, 20);
        if (!at) continue;
        const [x, z] = at;
        const y = this.heightAt(x, z);
        const n = randi(3, 7);
        for (let k = 0; k < n; k++) {
          const w = rand(0.5, 2), h = rand(0.3, 1.2), dd = rand(0.5, 2);
          const g = Math.random() < 0.3 ? Geo.cyl(w * 0.4, w * 0.4, h * 2, 8) : Geo.box(w, h, dd);
          const m = mesh(g, pick(mats), x + rand(-1.5, 1.5), y + h * 0.3 + k * 0.25, z + rand(-1.5, 1.5), this.group);
          m.rotation.set(rand(-0.6, 0.6), rand(0, TAU), rand(-0.6, 0.6));
          m.receiveShadow = true;
        }
        this.addCollider(x, z, 1.8, y + 1.6);
      }
    }

    for (let i = 0; i < P.lamps; i++) {
      const at = this.randomClear(0.5, 20);
      if (!at) continue;
      const [x, z] = at;
      const y = this.heightAt(x, z);
      mesh(Geo.cyl(0.12, 0.18, 5, 6), Mat.std('#22242c', { metal: 0.8 }), x, y + 2.5, z, this.group);
      mesh(Geo.sphere(0.3, 1), Mat.glow(Z.accent, 5), x, y + 5.1, z, this.group).castShadow = false;
      const sp = glowSprite(Z.accent, 5, 1.2); sp.position.set(x, y + 5.1, z); this.group.add(sp);
      this.addCollider(x, z, 0.3, y + 5);
    }
  },

  placeCaches(n) {
    for (let i = 0; i < n; i++) {
      const at = this.randomClear(1.5, 60);
      if (!at) continue;
      this.buildCache(at[0], at[1], i === 0);
    }
  },

  buildCache(x, z, golden, yOverride) {
    const y = yOverride ?? this.surf(x, z);
    const c = golden ? '#ffd23f' : '#3cf2ff';
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rand(0, TAU);
    this.group.add(g);
    const shell = Mat.std(golden ? '#4a3a14' : '#1e2a36', { metal: 0.7, rough: 0.4 });
    mesh(Geo.box(1.3, 0.7, 0.9), shell, 0, 0.35, 0, g).receiveShadow = true;
    const lid = new THREE.Group(); lid.position.set(0, 0.7, -0.45); g.add(lid);
    mesh(Geo.box(1.34, 0.18, 0.94), shell, 0, 0.09, 0.45, lid);
    mesh(Geo.box(1.36, 0.05, 0.05), Mat.glow(c, 4), 0, 0.02, 0.92, lid);
    for (const s of [-1, 1]) mesh(Geo.box(0.05, 0.5, 0.92), Mat.glow(c, 3), s * 0.66, 0.35, 0, g);
    const sp = glowSprite(c, 3, 1.4); sp.position.y = 1.8; g.add(sp);
    const cache = { x, y, z, golden, opened: false, group: g, lid, sprite: sp, openT: 0 };
    this.caches.push(cache);
    this.addCollider(x, z, 0.8, y + 0.9, 'cache', yOverride !== undefined ? y - 0.5 : -Infinity);
    return cache;
  },

  buildBeacon(x, z) {
    const y = this.surf(x, z);
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
    this.addCollider(x, z, 1.2, y + 10);
    return b;
  },

  setBeaconColor(b, hex, k = 4) {
    b.glowMat.color.set(hex).multiplyScalar(k);
    b.beamMat.color.set(hex).multiplyScalar(1.5);
  },

  buildSpawnPad() {
    const { x, z } = this.spawn;
    const y = this.surf(x, z);
    mesh(Geo.cyl(5, 5.4, 0.4, 12), Mat.std('#22303c', { metal: 0.8, rough: 0.3 }), x, y + 0.1, z, this.group).receiveShadow = true;
    const r = new THREE.Mesh(Geo.torus(4.4, 0.05, 40), Mat.glow('#3cf2ff', 1.3)); r.rotation.x = Math.PI / 2; r.position.set(x, y + 0.35, z);
    this.group.add(r);
  },

  buildArena() {
    const A = this.arena;
    const y = this.surf(A.x, A.z);
    A.y = y;
    const accent = this.zone.boss.color;
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
      const py = this.sky ? y : this.heightAt(px, pz);
      mesh(Geo.box(1.8, 9, 1.8), concrete, px, py + 4.2, pz, this.group);
      mesh(Geo.sphere(0.45, 1), Mat.glow(accent, 5), px, py + 9.2, pz, this.group).castShadow = false;
      this.addCollider(px, pz, 1.3, py + 9, 'pillar', this.sky ? py - 1 : -Infinity);
    }
    // sealed dome
    const dome = new THREE.Mesh(new THREE.SphereGeometry(A.r + 2, 40, 20, 0, TAU, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.4), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, wireframe: false }));
    dome.position.set(A.x, y, A.z);
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(A.r + 2.05, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(2), wireframe: true, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    wire.position.set(A.x, y, A.z);
    this.group.add(dome, wire);
    this.dome = dome; this.domeWire = wire; this.domeSealed = true; this.domeFade = 1;
    this.domeMat = dome.material; this.domeWireMat = wire.material;
  },

  openDome() {
    this.domeSealed = false; this.domeTrap = false;
    this.domeOpening = true;
  },

  // the dome snaps shut behind the player when the boss fight begins
  trapDome() {
    this.domeTrap = true; this.domeOpening = false; this.domeFade = 1;
    this.dome.visible = this.domeWire.visible = true;
    this.domeWire.scale.setScalar(1);
    this.dome.material.color.set(this.zone.boss.color).multiplyScalar(0.8);
    this.domeWire.material.color.set(this.zone.boss.color).multiplyScalar(1.4);
  },
  keepInside(p, r = 0.5) {
    if (!this.domeTrap) return;
    const A = this.arena, dx = p.x - A.x, dz = p.z - A.z, d = Math.hypot(dx, dz), R = A.r + 1.2 - r;
    if (d > R) { p.x = A.x + (dx / d) * R; p.z = A.z + (dz / d) * R; }
    const R2 = A.r + 2 - r, cap = A.y + Math.sqrt(Math.max(0, R2 * R2 - Math.min(d, R2) ** 2)) - 0.5;
    if (p.y > cap) p.y = cap;
  },

  buildPortal() {
    const A = this.arena;
    const g = new THREE.Group(); g.position.set(A.x, A.y + 3.2, A.z);
    const ring = new THREE.Mesh(Geo.torus(2.6, 0.22, 48), Mat.glow('#6bff9e', 5));
    const inner = new THREE.Mesh(new THREE.CircleGeometry(2.5, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#3cf2ff').multiplyScalar(1.5), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    g.add(ring, inner, glowSprite('#6bff9e', 12, 1.5));
    this.group.add(g);
    this.portal = { group: g, ring, inner, x: A.x, z: A.z, y: A.y };
    return this.portal;
  },

  // Walkable height at (x,z) for something currently at height y: terrain, the tops of
  // rocks/pillars it has climbed onto, and floating sky islands.
  groundAt(x, z, y) {
    let h = this.heightAt(x, z);
    for (const c of this.near(x, z)) {
      if (c.top > h && y >= c.top - 0.7 && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r * 0.95) ** 2) h = c.top;
    }
    for (const is of this.islands) {
      if (y >= is.top - 1.6 && (x - is.x) ** 2 + (z - is.z) ** 2 < is.r * is.r) h = Math.max(h, is.top);
    }
    return h;
  },

  // ─────────── Sky islands ───────────
  buildIslands(n) {
    const Z = this.zone;
    const beacons = this.flats.filter((f) => f.beacon);
    const topM = Mat.std(new THREE.Color(Z.ground.mid).lerp(new THREE.Color('#ffffff'), 0.12).getStyle(), { rough: 0.9, metal: 0.05 });
    const rockM = Mat.std(Z.ground.rock, { rough: 0.95, metal: 0.05 });
    const stone = Mat.std('#4a4a58', { rough: 0.8, metal: 0.2 });
    for (let i = 0; i < n; i++) {
      const b = beacons[i % beacons.length];
      let x = 0, z = 0, ok = false;
      for (let t = 0; t < 30 && !ok; t++) {
        const a = rand(0, TAU), d = rand(45, 85);
        x = b.x + Math.cos(a) * d; z = b.z + Math.sin(a) * d;
        ok = Math.max(Math.abs(x), Math.abs(z)) < this.half * 0.68 && Math.hypot(x - this.arena.x, z - this.arena.z) > 55 &&
          this.islands.every((o) => Math.hypot(o.x - x, o.z - z) > 40);
      }
      if (!ok) continue;
      const r = rand(8, 12);
      const top = Math.max(this.heightAt(x, z) + 22, b.h + rand(28, 40));
      const g = new THREE.Group(); g.position.set(x, top, z); this.group.add(g);
      const disc = mesh(new THREE.CylinderGeometry(r, r * 0.9, 1.4, 14), topM, 0, -0.7, 0, g); disc.receiveShadow = true;
      const under = mesh(new THREE.ConeGeometry(r * 0.92, r * 1.5, 12), rockM, 0, -1.4 - r * 0.75, 0, g); under.rotation.x = Math.PI;
      for (let k = 0; k < 5; k++) {
        const a = rand(0, TAU), rr = rand(0.3, 0.8) * r;
        const chunk = mesh(Geo.sphere(1, 0), rockM, Math.cos(a) * rr, -2 - rand(0, r), Math.sin(a) * rr, g);
        chunk.scale.setScalar(rand(0.6, 1.6));
      }
      // ancient arch & glowing runes
      mesh(Geo.box(0.9, 4.5, 0.9), stone, -2.2, 2.25, -r * 0.45, g);
      mesh(Geo.box(0.9, 4.5, 0.9), stone, 2.2, 2.25, -r * 0.45, g);
      mesh(Geo.box(5.6, 0.7, 1.1), stone, 0, 4.7, -r * 0.45, g);
      mesh(Geo.box(3.4, 0.1, 0.05), Mat.glow(Z.accent, 3), 0, 4.7, -r * 0.45 + 0.56, g);
      const ring = new THREE.Mesh(Geo.torus(r - 0.8, 0.06, 40), Mat.glow(Z.accent, 2)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; g.add(ring);
      const under2 = glowSprite(Z.accent, r * 2.2, 0.35); under2.position.y = -4; g.add(under2);
      const is = { x, z, r, top, group: g };
      this.islands.push(is);
      this.buildCache(x + rand(-2, 2), z + r * 0.2, i === 0, top);
      for (const s2 of [-2.2, 2.2]) {
        const w = new THREE.Vector3(s2, 0, -r * 0.45);
        this.addCollider(x + w.x, z + w.z, 0.6, top + 4.5, 'pillar', top - 0.5);
      }
    }
  },

  // ─────────── Enemy camps ───────────
  buildBrazier(x, z) {
    const y = this.surf(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z); this.group.add(g);
    const dark = Mat.std('#1c1a1e', { metal: 0.7, rough: 0.5 });
    mesh(Geo.cyl(0.25, 0.45, 0.9, 6), dark, 0, 0.45, 0, g);
    mesh(Geo.cyl(0.9, 0.55, 0.4, 8), dark, 0, 1.05, 0, g);
    for (let k = 0; k < 4; k++) {
      const b = mesh(Geo.box(0.12, 0.5, 0.12), Mat.std('#5a3a2a', { metal: 0.5 }), rand(-0.3, 0.3), 1.35, rand(-0.3, 0.3), g);
      b.rotation.set(rand(-0.6, 0.6), 0, rand(-0.6, 0.6));
    }
    const flames = [];
    for (const [c, s2, yy] of [['#ff6a1a', 2.6, 1.6], ['#ffb347', 1.6, 1.9], ['#fff2c0', 0.8, 1.5]]) {
      const f = glowSprite(c, s2, 2.2); f.position.y = yy; g.add(f); flames.push(f);
    }
    // a ring of scrap seats the robots gather around
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + rand(-0.2, 0.2);
      const sx = Math.cos(a) * 4.2, sz = Math.sin(a) * 4.2;
      const seat = mesh(Geo.box(rand(0.8, 1.4), 0.4, rand(0.5, 0.8)), Mat.std('#4a3e38', { metal: 0.5, rough: 0.7 }), sx, this.surf(x + sx, z + sz) - y + 0.15, sz, g);
      seat.rotation.y = -a + rand(-0.3, 0.3);
    }
    this.addCollider(x, z, 0.9, y + 1.3, 'brazier', this.sky ? y - 1 : -Infinity);
    const camp = { x, z, y, r: 6, flames, alerted: false };
    this.braziers.push(camp);
    return camp;
  },

  // ─────────── Scrap Sprites (hidden collectibles, like Koroks) ───────────
  placeSprites(n) {
    const spots = [];
    for (const is of this.islands.slice().sort(() => Math.random() - 0.5)) if (is.kind !== 'spawn') spots.push([is.x + rand(-is.r * 0.5, is.r * 0.5), is.top + 0.6, is.z + rand(0, is.r * 0.5)]);
    const tall = this.colliders.filter((c) => (c.kind === 'pillar' && c.top - this.heightAt(c.x, c.z) > 6 && c.bottom === -Infinity) || (c.kind === 'rock' && c.top - this.heightAt(c.x, c.z) > 3.2));
    tall.sort(() => Math.random() - 0.5);
    for (const c of tall) { if (spots.length >= n - 1) break; spots.push([c.x, c.top + 0.6, c.z]); }
    // one hidden in a quiet corner of the map
    const hid = this.sky ? null : this.randomClear(1, 40);
    if (hid) spots.push([hid[0], this.heightAt(hid[0], hid[1]) + 0.6, hid[1]]);
    for (const [x, y, z] of spots.slice(0, n)) {
      const m = buildSpriteModel(); m.position.set(x, y, z); this.group.add(m);
      this.sprites.push({ x, y, z, model: m, found: false, ph: rand(0, TAU) });
    }
  },

  // ─────────── Trees, flowers & grass (instanced for speed) ───────────
  scatterFlora() {
    const F = this.zone.flora;
    if (!F) return;
    const trees = [];
    for (let i = 0; i < F.trees; i++) {
      const at = this.randomClear(1.6, 12);
      if (!at) continue;
      // clumps: most trees grow near another tree
      let [x, z] = at;
      if (trees.length && Math.random() < 0.55) {
        const o = pick(trees), a = rand(0, TAU), d = rand(3.5, 7);
        const nx = o.x + Math.cos(a) * d, nz = o.z + Math.sin(a) * d;
        if (this.isClear(nx, nz, 1.2)) { x = nx; z = nz; }
      }
      const tr = { x, z, y: this.heightAt(x, z), s: rand(0.8, 1.4) };
      trees.push(tr);
      this.addCollider(x, z, 0.42 * tr.s, tr.y + this.treeHeight(F.kind, tr.s) * 0.92, 'tree');
    }
    this.plantTrees(trees, F);
    const spots = [];
    for (let i = 0; i < 160; i++) {
      const at = this.randomClear(0.5, 6);
      if (at) spots.push({ x: at[0], z: at[1], y: this.heightAt(at[0], at[1]), r: rand(2, 5) });
    }
    this.plantGround(spots, F);
    if (this.zone.id === 'snow') this.buildSnowmen(9);
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
        const a = rand(0, TAU), r = Math.sqrt(Math.random()) * s.r;
        x = s.x + Math.cos(a) * r; z = s.z + Math.sin(a) * r;
        y = this.sky ? s.y : this.heightAt(x, z);
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
    for (let i = 0; i < n; i++) {
      const at = this.randomClear(1.2, 20);
      if (!at) continue;
      const [x, z] = at, y = this.heightAt(x, z);
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rand(0, TAU); this.group.add(g);
      mesh(Geo.sphere(0.8, 1), snow, 0, 0.7, 0, g);
      mesh(Geo.sphere(0.55, 1), snow, 0, 1.75, 0, g);
      mesh(Geo.sphere(0.38, 1), snow, 0, 2.5, 0, g);
      const nose = mesh(Geo.cyl(0, 0.07, 0.4, 5), Mat.std('#ff8a2a', { rough: 0.6, metal: 0 }), 0, 2.5, 0.52, g); nose.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) mesh(Geo.sphere(0.05, 0), Mat.std('#111111'), s * 0.13, 2.62, 0.33, g);
      mesh(Geo.cyl(0.26, 0.3, 0.35, 8), Mat.std('#2a2a34', { metal: 0.3 }), 0, 2.9, 0, g);
      this.addCollider(x, z, 0.8, y + 3, 'rock');
    }
  },

  buildVolcanoes() {
    const rock = Mat.std('#2a1410', { rough: 0.95, metal: 0.05 });
    const lava = Mat.glow('#ff6a1a', 2.6);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + rand(-0.3, 0.3), r = rand(250, 290);
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = rand(90, 130), w = rand(70, 95);
      const cone = mesh(new THREE.CylinderGeometry(w * 0.16, w, h, 14, 1, true), rock, x, h / 2 - 10, z, this.group);
      cone.castShadow = false;
      const top = mesh(new THREE.CircleGeometry(w * 0.16, 14), lava, x, h - 10.5, z, this.group); top.rotation.x = -Math.PI / 2;
      const glow = glowSprite('#ff5a1a', w * 0.9, 1.4); glow.position.set(x, h - 4, z); this.group.add(glow);
      this.volcanoes.push({ x, y: h - 10, z, w });
    }
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

  // ─────────── Portals ───────────
  buildPortalFrame(x, z, face, color, label, sub) {
    const y = this.surf(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = face; this.group.add(g);
    const stone = Mat.std('#8a8478', { rough: 0.85, metal: 0.1 });
    const dark = Mat.std('#3a3a44', { rough: 0.6, metal: 0.4 });
    mesh(Geo.cyl(3.8, 4.2, 0.6, 10), stone, 0, 0.3, 0, g).receiveShadow = true;
    for (const s of [-1, 1]) {
      mesh(Geo.box(0.9, 7.2, 0.9), stone, s * 3.6, 3.6, 0, g);
      mesh(Geo.box(1.2, 0.5, 1.2), dark, s * 3.6, 7.3, 0, g);
    }
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(4) });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.26, 8, 48), ringMat); ring.position.y = 3.9; g.add(ring);
    const innerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
    const inner = new THREE.Mesh(new THREE.CircleGeometry(2.75, 40), innerMat); inner.position.y = 3.9; g.add(inner);
    const glow = glowSprite(color, 6.5, 0.7); glow.position.y = 3.9; g.add(glow);
    const lbl = this.makeLabel(label, color, 512, 128); lbl.position.y = 8.6; lbl.scale.set(6, 1.5, 1); g.add(lbl);
    if (sub) this.setLabel(lbl, label, color, sub);
    for (const s of [-1, 1]) this.addCollider(x + Math.cos(face) * s * 3.6, z - Math.sin(face) * s * 3.6, 0.7, y + 7.5, 'wall');
    return { x, z, y, group: g, ring, ringMat, inner, innerMat, glow, label: lbl, color };
  },

  buildHomePortal(x, z) {
    const face = Math.atan2(this.spawn.x - x, this.spawn.z - z);
    this.homePortal = this.buildPortalFrame(x, z, face, '#3cf2ff', 'HOME BASE', 'Press E to return home');
  },

  // ─────────── Shops ───────────
  buildShop(x, z) {
    const S = this.zone.shop;
    if (!S) return;
    const y = this.surf(x, z);
    const face = Math.atan2(this.spawn.x - x, this.spawn.z - z);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = face; this.group.add(g);
    const wood = Mat.std('#8a5a32', { rough: 0.8, metal: 0.05 });
    const woodD = Mat.std('#5a3a22', { rough: 0.8, metal: 0.05 });
    mesh(Geo.box(6, 0.3, 4.4), woodD, 0, 0.15, 0, g).receiveShadow = true;
    mesh(Geo.box(5.2, 1.2, 0.9), wood, 0, 0.9, 1.3, g);                        // counter
    mesh(Geo.box(5.4, 0.12, 1.1), woodD, 0, 1.55, 1.3, g);
    for (const s of [-1, 1]) for (const zz of [-1.9, 1.9]) mesh(Geo.box(0.22, 3.6, 0.22), woodD, s * 2.8, 1.8, zz, g);
    // striped awning in the biome colour
    for (let i = 0; i < 6; i++) {
      const st = mesh(Geo.box(1, 0.12, 4.8), Mat.std(i % 2 ? '#fff6e8' : S.color, { rough: 0.7, metal: 0 }), -2.5 + i, 3.75, 0.3, g);
      st.rotation.x = -0.2;
    }
    // goods on the shelves
    const goods = ['#ff5a7a', '#ffd23f', '#3cf2ff', '#b98cff', '#6bff9e'];
    for (let i = 0; i < 7; i++) mesh(Geo.box(0.4, 0.4, 0.4), Mat.std(pick(goods), { rough: 0.4, metal: 0.4, emissive: pick(goods), ei: 0.3 }), -2.2 + i * 0.72, 1.82, 1.25, g).rotation.y = rand(0, 1);
    mesh(Geo.box(5.2, 2.2, 0.3), woodD, 0, 1.4, -1.9, g);
    // merchant bot
    const bot = new THREE.Group(); bot.position.set(0, 0.3, -0.4); g.add(bot);
    const shell = Mat.std('#e8e0d0', { metal: 0.5, rough: 0.35 });
    mesh(Geo.box(0.9, 1.1, 0.7), shell, 0, 1.2, 0, bot);
    const head = new THREE.Group(); head.position.y = 2.1; bot.add(head);
    mesh(Geo.box(0.8, 0.6, 0.6), shell, 0, 0, 0, head);
    mesh(Geo.box(0.6, 0.18, 0.05), Mat.glow(S.color, 3), 0, 0.03, 0.31, head);
    mesh(Geo.cyl(0.4, 0.45, 0.12, 10), Mat.std('#3a2a1a'), 0, 0.36, 0, head);   // hat brim
    mesh(Geo.cyl(0.28, 0.3, 0.4, 10), Mat.std('#3a2a1a'), 0, 0.56, 0, head);
    for (const s of [-1, 1]) { const arm = mesh(Geo.box(0.2, 0.8, 0.2), shell, s * 0.6, 1.2, 0.1, bot); arm.rotation.x = -0.5; }
    const sign = this.makeLabel(S.name, S.color, 640, 128); sign.position.set(0, 5, 0.5); sign.scale.set(6, 1.2, 1); g.add(sign);
    const icon = this.makeLabel('SHOP', '#ffd23f', 256, 96); icon.position.set(0, 6.3, 0.5); icon.scale.set(2.4, 0.9, 1); g.add(icon);
    const fwd = new THREE.Vector3(0, 0, 1.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), face);
    this.shop = { x: x + fwd.x * 1.6, z: z + fwd.z * 1.6, y, head, t: 0, color: S.color };
    for (const s of [-2, 0, 2]) {
      const w = new THREE.Vector3(s, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), face);
      this.addCollider(x + w.x, z + w.z, 1.2, y + 1.6, 'wall', this.sky ? y - 1 : -Infinity);
    }
  },

  // ─────────── Home base ───────────
  buildHubWorld() {
    this.arena = { x: 0, z: 0, r: 0 };
    this.spawn = { x: 0, z: 17 };
    this.flats = [{ x: 0, z: 0, r: 62 }];
    for (const f of this.flats) f.h = Math.max(this.hazardLevel + 3, this.rawHeight(f.x, f.z) * 0.4 + 2);
    this.buildTerrain();
    this.buildSky();
    this.buildHazard();
    this.buildLights();
    this.arena.y = this.heightAt(0, 0);
    this.buildHouse(0, -2);
    for (let i = 0; i < ZONES.length; i++) this.buildHubPortal(i);
    this.buildSpawnPad();
    this.scatterProps();
    this.scatterFlora();
    // a ring of flowers and bushes right around the house
    const spots = [];
    for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU, r = rand(20, 30); const x = Math.sin(a) * r, z = Math.cos(a) * r - 2; spots.push({ x, z, y: this.heightAt(x, z), r: 2.2 }); }
    this.plantGround(spots, this.zone.flora);
    this.placeSprites(3);
    if (G.base && G.base.shield) this.buildHomeDome();
    this.refreshPortals();
    return this;
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
  },

  buildHubPortal(i) {
    const Z = ZONES[i], a = (i / ZONES.length) * TAU, R = 44;
    const x = Math.sin(a) * R, z = Math.cos(a) * R;
    const P = this.buildPortalFrame(x, z, a + Math.PI, Z.accent, Z.name.toUpperCase(), '');
    P.i = i;
    // a patch of the biome's own ground in front of the portal
    const swatch = mesh(new THREE.CircleGeometry(3.6, 24), Mat.std(Z.ground.mid, { rough: 0.9, metal: 0 }), x - Math.sin(a) * 4.2, P.y + 0.08, z - Math.cos(a) * 4.2, this.group);
    swatch.rotation.x = -Math.PI / 2; swatch.receiveShadow = true;
    this.hubPortals.push(P);
  },

  // grey out locked portals; unlocked ones glow in the biome colour
  refreshPortals() {
    for (const P of this.hubPortals) {
      const Z = ZONES[P.i];
      const lock = G.portalLock ? G.portalLock(P.i) : null;
      const open = !lock;
      P.ringMat.color.set(open ? Z.accent : '#5a6070').multiplyScalar(open ? 4 : 1.2);
      P.innerMat.opacity = open ? 0.5 : 0.08;
      P.glow.visible = open;
      P.open = open;
      const beaten = G.progress && G.progress.beaten[P.i];
      this.setLabel(P.label, Z.name.toUpperCase(), open ? Z.accent : '#8a94a8', lock ? 'LOCKED · ' + lock : beaten ? 'Boss defeated · Press E to enter' : 'Press E to enter');
    }
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

  // ─────────── Sky Islands biome ───────────
  buildSkyWorld(idx) {
    this.arena = { x: 0, z: 0, r: 30 };
    this.spawn = { x: 0, z: 165 };
    this.flats = [];
    this.buildTerrain();
    this.buildSky();
    this.buildHazard();
    this.buildLights();
    // soft cloud puffs floating on the cloud sea
    const puff = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#dfeeff', emissiveIntensity: 0.35, flatShading: true, roughness: 1 });
    const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
    const clouds = new THREE.InstancedMesh(cloudGeo, puff, 160); clouds.frustumCulled = false; this.group.add(clouds);
    const d = new THREE.Object3D();
    for (let i = 0; i < 160; i++) {
      d.position.set(rand(-260, 260), this.hazardLevel + rand(-1, 3), rand(-260, 260));
      d.scale.set(rand(8, 22), rand(3, 7), rand(8, 22)); d.rotation.y = rand(0, TAU); d.updateMatrix();
      clouds.setMatrixAt(i, d.matrix);
    }

    const isl = (x, z, r, top, kind) => {
      if (this.islands.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 7)) return null;
      return this.makeIsland(x, z, r, top, kind);
    };
    const spawnI = isl(0, 165, 22, 22, 'spawn');
    const arenaI = isl(0, 0, 40, 38, 'arena');
    const beaconI = [];
    const baseA = rand(0, TAU);
    for (let i = 0; i < this.zone.beacons; i++) {
      const a = baseA + (i / this.zone.beacons) * TAU;
      let x = Math.cos(a) * 125, z = Math.sin(a) * 125;
      if (Math.hypot(x - 0, z - 165) < 60) { x *= 0.8; z = -Math.abs(z); }
      const b = isl(x, z, 15, rand(26, 50), 'beacon');
      if (b) beaconI.push(b);
    }
    for (let t = 0, n = 0; t < 80 && n < 8; t++) {
      const x = rand(-175, 175), z = rand(-175, 175);
      if (isl(x, z, rand(10, 14), rand(14, 56), 'camp')) n++;
    }
    // stepping-stone islands along the routes — the gaps need the jetpack (or a long glide down)
    const link = (A, B) => {
      const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz);
      const start = A.r + 9, end = L - B.r - 9;
      for (let s = start; s < end; s += rand(19, 25)) {
        const k = s / L;
        const x = A.x + dx * k + rand(-6, 6), z = A.z + dz * k + rand(-6, 6);
        isl(x, z, rand(5, 7.5), lerp(A.top, B.top, k) + rand(-7, 7), 'step');
      }
    };
    const hubs = [spawnI, arenaI, ...beaconI].filter(Boolean);
    link(spawnI, arenaI);
    for (let i = 0; i < beaconI.length; i++) { link(beaconI[i], arenaI); link(beaconI[i], beaconI[(i + 1) % beaconI.length]); }
    const camps = this.islands.filter((i) => i.kind === 'camp');
    for (const c of camps) { let best = null, bd = 1e9; for (const h of hubs) { const dd = Math.hypot(h.x - c.x, h.z - c.z); if (dd < bd) { bd = dd; best = h; } } if (best) link(best, c); }
    // spawn pad, home portal & shop on the spawn island
    this.buildSpawnPad();
    this.buildHomePortal(this.spawn.x - 13, this.spawn.z + 2);
    this.buildShop(this.spawn.x + 13, this.spawn.z + 1);
    this.buildArena();
    for (const b of beaconI) this.buildBeacon(b.x, b.z);
    // decorate: trees, flowers & rocks
    const F = this.zone.flora, trees = [], ground = [];
    const rockM = Mat.std('#9a8a78', { rough: 0.95, metal: 0.05 });
    for (const is of this.islands) {
      const busy = [];
      if (is.kind === 'spawn') busy.push([this.spawn.x, this.spawn.z, 7], [this.spawn.x - 13, this.spawn.z + 2, 5], [this.spawn.x + 13, this.spawn.z + 1, 5]);
      if (is.kind === 'arena') continue;
      if (is.kind === 'beacon') busy.push([is.x, is.z, 5]);
      if (is.kind === 'camp') busy.push([is.x, is.z, 7.5]);
      const nt = is.kind === 'step' ? randi(0, 1) : Math.round(is.r / 3.2);
      for (let k = 0; k < nt; k++) {
        const a = rand(0, TAU), r = rand(0.3, 0.8) * is.r, x = is.x + Math.cos(a) * r, z = is.z + Math.sin(a) * r;
        if (busy.some(([bx, bz, br]) => Math.hypot(x - bx, z - bz) < br)) continue;
        const tr = { x, z, y: is.top, s: rand(0.75, 1.2) };
        trees.push(tr); busy.push([x, z, 3]);
        this.addCollider(x, z, 0.4 * tr.s, is.top + this.treeHeight('round', tr.s) * 0.92, 'tree', is.top - 1);
      }
      ground.push({ x: is.x, z: is.z, y: is.top, r: is.r * 0.85 });
      if (is.r > 8 && Math.random() < 0.7) {
        const a = rand(0, TAU), r = is.r * 0.6, x = is.x + Math.cos(a) * r, z = is.z + Math.sin(a) * r;
        if (!busy.some(([bx, bz, br]) => Math.hypot(x - bx, z - bz) < br)) {
          const s = rand(1, 1.8), m = mesh(Geo.sphere(1, 0), rockM, x, is.top + s * 0.4, z, this.group);
          m.scale.set(s, s * 0.8, s); this.addCollider(x, z, s * 0.9, is.top + s * 1.1, 'rock', is.top - 1);
        }
      }
    }
    this.plantTrees(trees, F);
    this.plantGround(ground, F);
    // caches, sprites & updraft columns
    const spots = this.islands.filter((i) => i.kind === 'step' || i.kind === 'camp');
    spots.sort(() => Math.random() - 0.5);
    spots.slice(0, 12 + idx).forEach((is, i) => this.buildCache(is.x + rand(-1, 1), is.z + rand(-1, 1), i < 2, is.top));
    this.placeSprites(9);
    for (let i = 0; i < 7; i++) {
      const a = rand(0, TAU), r = rand(40, 150), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.islandAt(x, z, 6)) continue;
      const col = { x, z, y: 18, r: 4, top: 70 };
      const ring = new THREE.Mesh(Geo.torus(4, 0.12, 32), Mat.glow('#bff0ff', 1.6)); ring.rotation.x = Math.PI / 2; ring.position.set(x, this.hazardLevel + 1, z); this.group.add(ring);
      col.ring = ring;
      this.updraftCols.push(col);
    }
    return this;
  },

  makeIsland(x, z, r, top, kind) {
    const Z = this.zone;
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
    const is = { x, z, r, top, group: g, kind };
    this.islands.push(is);
    return is;
  },

  update(dt, time, cam) {
    if (this.skyMesh) this.skyMesh.position.copy(cam.position);
    // hazard shimmer
    const p = this.hazard.geometry.attributes.position, base = this.hazardBase;
    if (this.zone.hazard.dmg) {
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2];
        p.array[i * 3 + 1] = Math.sin(x * 0.15 + time * 1.3) * 0.12 + Math.cos(z * 0.13 + time) * 0.12;
      }
      p.needsUpdate = true;
      this.hazard.material.emissiveIntensity = 1.3 + Math.sin(time * 2) * 0.25;
    }
    for (const b of this.beacons) {
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
      } else if (!c.opened) {
        c.sprite.material.opacity = 0.6 + 0.4 * Math.sin(time * 3 + c.x);
      }
    }
    if (this.domeOpening) {
      this.domeFade = Math.max(0, this.domeFade - dt * 0.6);
      this.dome.material.opacity = 0.12 * this.domeFade;
      this.domeWire.material.opacity = 0.25 * this.domeFade;
      this.domeWire.scale.setScalar(1 + (1 - this.domeFade) * 0.2);
      if (this.domeFade <= 0) { this.dome.visible = this.domeWire.visible = false; this.domeOpening = false; }
    } else if (this.domeSealed || this.domeTrap) {
      this.domeWire.rotation.y += dt * (this.domeTrap ? 0.3 : 0.05);
      this.dome.material.opacity = this.domeTrap ? 0.035 + 0.015 * Math.sin(time * 5) : 0.1 + 0.04 * Math.sin(time * 2);
      this.domeWire.material.opacity = this.domeTrap ? 0.2 : 0.25;
    }
    // portals, shop keeper, charging pads, home shield
    for (const P of this.hubPortals.concat(this.homePortal ? [this.homePortal] : [])) {
      if (P.open === false) continue;
      P.ring.rotation.z += dt * 0.8;
      P.innerMat.opacity = 0.38 + 0.14 * Math.sin(time * 3 + P.x);
      if (Math.random() < dt * 6 && Math.abs(P.x - cam.position.x) < 60 && Math.abs(P.z - cam.position.z) < 60) {
        const a = rand(0, TAU);
        Fx.glow.emit(P.x + Math.cos(a) * 2.8 * Math.cos(P.group.rotation.y), P.y + 3.9 + Math.sin(a) * 2.8, P.z - Math.cos(a) * 2.8 * Math.sin(P.group.rotation.y), 0, rand(0.3, 1), 0, rand(1, 2), 0.12, new THREE.Color(P.color), 2.5, 0.2, 0, 1);
      }
    }
    if (this.shop) this.shop.head.rotation.y = Math.sin(time * 0.8) * 0.5;
    for (const pad of this.chargePads) pad.ring.material === pad.ring.material && (pad.ring.scale.setScalar(1 + 0.06 * Math.sin(time * 4 + pad.x)));
    if (this.homeDome) {
      const D = this.homeDome;
      D.wire.rotation.y += dt * 0.04;
      D.dome.material.opacity = 0.04 + 0.015 * Math.sin(time * 1.6);
      D.orb.position.y = 3 + Math.sin(time * 2) * 0.15;
      if (D.flash > 0) { D.flash -= dt * 2; D.dome.material.opacity += D.flash * 0.3; }
    }
    for (const u of this.updraftCols) {
      if (Math.abs(u.x - cam.position.x) > 120 || Math.abs(u.z - cam.position.z) > 120) continue;
      if (Math.random() < dt * 16) {
        const a = rand(0, TAU), r = rand(0, u.r);
        Fx.glow.emit(u.x + Math.cos(a) * r, this.hazardLevel + rand(0, 30), u.z + Math.sin(a) * r, 0, rand(8, 14), 0, rand(2, 3.5), 0.18, new THREE.Color('#dff6ff'), 1.4, 0.2, 0, 1);
      }
    }
    for (const v of this.volcanoes) {
      if (Math.random() < dt * 3) Fx.smoke(v.x + rand(-4, 4), v.y + 4, v.z + rand(-4, 4), 6, 8, rand(-1, 1), rand(4, 7), rand(-1, 1), '#3a2a26');
    }
    for (const b of this.braziers) {
      b.flames.forEach((f, i) => { const k = 1 + Math.sin(time * (9 + i * 3) + b.x) * 0.12 + Math.random() * 0.08; f.scale.setScalar([2.6, 1.6, 0.8][i] * k); });
      if (Math.random() < dt * 8 && Math.abs(b.x - cam.position.x) < 90 && Math.abs(b.z - cam.position.z) < 90) {
        Fx.glow.emit(b.x + rand(-0.4, 0.4), b.y + 1.6, b.z + rand(-0.4, 0.4), rand(-0.3, 0.3), rand(2, 4), rand(-0.3, 0.3), rand(1, 2), 0.15, new THREE.Color('#ff8a3a'), 3, 0.2, -0.5, 1);
      }
    }
    for (const sp of this.sprites) {
      if (sp.found) continue;
      sp.model.position.y = sp.y + Math.sin(time * 2 + sp.ph) * 0.12;
      sp.model.rotation.y += dt * 1.2;
    }
    if (this.portal) {
      this.portal.ring.rotation.z += dt * 2;
      this.portal.group.rotation.y += dt * 0.8;
      this.portal.inner.material.opacity = 0.35 + 0.15 * Math.sin(time * 5);
    }
  },
};
