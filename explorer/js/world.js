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

    // key locations
    this.arena = { x: 0, z: 0, r: 30 };
    this.spawn = { x: 0, z: 165 };
    const flats = [{ x: this.arena.x, z: this.arena.z, r: 34 }, { x: this.spawn.x, z: this.spawn.z, r: 12 }];
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
    this.scatterProps();
    this.placeCaches(10 + idx);
    this.buildIslands(idx >= 3 ? 3 : 2);
    this.placeSprites(8 + Math.floor(idx / 2));
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
    this.group = null;
  },

  // ─────────── Height field ───────────
  rawHeight(x, z) {
    const n = this.noise;
    let h = 0, amp = 1, f = 0.0055;
    for (let o = 0; o < 5; o++) { h += n(x * f + o * 17.3, z * f - o * 9.1) * amp; amp *= 0.5; f *= 2.03; }
    h *= 15;
    const r = 1 - Math.abs(n(x * 0.004 + 50, z * 0.004 - 20));
    h += r * r * 9 - 3;
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
    const cols = new Float32Array(pos.count * 3);
    const nrm = geo.attributes.normal;
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i), x = pos.getX(i), z = pos.getZ(i);
      const t = smoothstep(-4, 14, h);
      tmp.copy(cLow).lerp(cMid, Math.min(1, t * 1.6));
      if (t > 0.6) tmp.lerp(cHigh, (t - 0.6) / 0.4);
      const slope = 1 - nrm.getY(i);
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
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
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
    const y = yOverride ?? this.heightAt(x, z);
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
    const y = this.heightAt(x, z);
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
    const y = this.heightAt(x, z);
    mesh(Geo.cyl(5, 5.4, 0.4, 12), Mat.std('#22303c', { metal: 0.8, rough: 0.3 }), x, y + 0.1, z, this.group).receiveShadow = true;
    const r = new THREE.Mesh(Geo.torus(4.4, 0.05, 40), Mat.glow('#3cf2ff', 1.3)); r.rotation.x = Math.PI / 2; r.position.set(x, y + 0.35, z);
    this.group.add(r);
  },

  buildArena() {
    const A = this.arena;
    const y = this.heightAt(A.x, A.z);
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
      const py = this.heightAt(px, pz);
      mesh(Geo.box(1.8, 9, 1.8), concrete, px, py + 4.2, pz, this.group);
      mesh(Geo.sphere(0.45, 1), Mat.glow(accent, 5), px, py + 9.2, pz, this.group).castShadow = false;
      this.addCollider(px, pz, 1.3, py + 9);
    }
    // sealed dome
    const dome = new THREE.Mesh(new THREE.SphereGeometry(A.r + 2, 40, 20, 0, TAU, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.4), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, wireframe: false }));
    dome.position.set(A.x, y, A.z);
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(A.r + 2.05, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(2), wireframe: true, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    wire.position.set(A.x, y, A.z);
    this.group.add(dome, wire);
    this.dome = dome; this.domeWire = wire; this.domeSealed = true; this.domeFade = 1;
  },

  openDome() {
    this.domeSealed = false;
    this.domeOpening = true;
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
    const y = this.heightAt(x, z);
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
      const seat = mesh(Geo.box(rand(0.8, 1.4), 0.4, rand(0.5, 0.8)), Mat.std('#4a3e38', { metal: 0.5, rough: 0.7 }), sx, this.heightAt(x + sx, z + sz) - y + 0.15, sz, g);
      seat.rotation.y = -a + rand(-0.3, 0.3);
    }
    this.addCollider(x, z, 0.9, y + 1.3, 'brazier');
    const camp = { x, z, y, r: 6, flames, alerted: false };
    this.braziers.push(camp);
    return camp;
  },

  // ─────────── Scrap Sprites (hidden collectibles, like Koroks) ───────────
  placeSprites(n) {
    const spots = [];
    for (const is of this.islands) spots.push([is.x + rand(-is.r * 0.5, is.r * 0.5), is.top + 0.6, is.z + rand(0, is.r * 0.5)]);
    const tall = this.colliders.filter((c) => (c.kind === 'pillar' && c.top - this.heightAt(c.x, c.z) > 6 && c.bottom === -Infinity) || (c.kind === 'rock' && c.top - this.heightAt(c.x, c.z) > 3.2));
    tall.sort(() => Math.random() - 0.5);
    for (const c of tall) { if (spots.length >= n - 1) break; spots.push([c.x, c.top + 0.6, c.z]); }
    // one hidden in a quiet corner of the map
    const hid = this.randomClear(1, 40);
    if (hid) spots.push([hid[0], this.heightAt(hid[0], hid[1]) + 0.6, hid[1]]);
    for (const [x, y, z] of spots.slice(0, n)) {
      const m = buildSpriteModel(); m.position.set(x, y, z); this.group.add(m);
      this.sprites.push({ x, y, z, model: m, found: false, ph: rand(0, TAU) });
    }
  },

  update(dt, time, cam) {
    if (this.sky) this.sky.position.copy(cam.position);
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
    } else if (this.domeSealed) {
      this.domeWire.rotation.y += dt * 0.05;
      this.dome.material.opacity = 0.1 + 0.04 * Math.sin(time * 2);
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
