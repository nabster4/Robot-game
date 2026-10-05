'use strict';
// One connected world: blended biome terrain (hills, valleys, plateaus, terraced cliffs), rivers,
// lava, waterfalls and caves. The ground is split into chunks so only what's on screen is drawn.
// Everything is procedural and seeded, so a saved world rebuilds exactly.

const WORLD = { size: 1600, seg: 4, chunk: 200, water: -3, lava: -1 };

// terrain biomes · index → palette (ZONES 0-3 and the coast)
const TERRA = [
  { id: 'plains',    cx: 0,    cz: 470 },
  { id: 'snow',      cx: -40,  cz: -500 },
  { id: 'mountains', cx: 500,  cz: -70 },
  { id: 'volcano',   cx: -500, cz: 60 },
  { id: 'coast',     cx: 470,  cz: 470 },
];
// the Sky Islands float above the north-east mountains
const SKY_REGION = { x: 430, z: -430, r: 200 };
const VOLCANO_CONES = [[-560, -60, 115, 95], [-440, 190, 90, 72], [-660, 170, 80, 60]];   // x, z, radius, height

const Terra = {
  setup(seed) {
    this.n1 = makePerlin(seed);
    this.n2 = makePerlin(seed + 101);
    this.n3 = makePerlin(seed + 202);
    this.half = WORLD.size / 2;
    this.N = WORLD.size / WORLD.seg;
    this.W = this.N + 1;
    this._d = new Float32Array(TERRA.length);
    this._w = new Float32Array(TERRA.length);
  },

  fbm(n, x, z, f, oct) {
    let h = 0, a = 1, s = 0;
    for (let o = 0; o < oct; o++) { h += n(x * f + o * 17.3, z * f - o * 9.1) * a; s += a; a *= 0.5; f *= 2.03; }
    return h / s;
  },
  ridged(n, x, z, f, oct) {
    let h = 0, a = 1, s = 0;
    for (let o = 0; o < oct; o++) { const r = 1 - Math.abs(n(x * f + o * 31.7, z * f + o * 12.9)); h += r * r * a; s += a; a *= 0.5; f *= 2.1; }
    return h / s;
  },
  // stepped heights: flat plateaus joined by steep cliffs (smaller `sharp` = steeper)
  terrace(h, step, sharp) {
    const k = h / step, b = Math.floor(k), t = k - b;
    return (b + smoothstep(0.5 - sharp, 0.5 + sharp, t)) * step;
  },

  // soft biome weights with wiggly borders (warped soft-Voronoi)
  weights(x, z, out = this._w) {
    const n = this.n2;
    const wx = x + n(x * 0.0028, z * 0.0028) * 150, wz = z + n(x * 0.0028 + 71, z * 0.0028 - 33) * 150;
    let dmin = 1e9;
    for (let i = 0; i < TERRA.length; i++) { const d = Math.hypot(wx - TERRA[i].cx, wz - TERRA[i].cz); this._d[i] = d; if (d < dmin) dmin = d; }
    let s = 0;
    for (let i = 0; i < TERRA.length; i++) { out[i] = Math.exp(-(this._d[i] - dmin) / 55); s += out[i]; }
    for (let i = 0; i < TERRA.length; i++) out[i] /= s;
    return out;
  },
  hubMask(x, z) { return 1 - smoothstep(75, 165, Math.hypot(x, z)); },
  dominant(x, z) {
    const w = this.weights(x, z);
    let bi = 0;
    for (let i = 1; i < w.length; i++) if (w[i] > w[bi]) bi = i;
    return bi;
  },

  biomeH(i, x, z) {
    const n1 = this.n1, n2 = this.n2, n3 = this.n3;
    switch (i) {
      case 0: {   // rolling meadows with two tiers of plateaus edged by cliffs, and lakes
        let h = 4 + this.fbm(n1, x, z, 0.006, 4) * 20;
        const p = n3(x * 0.0035 + 40, z * 0.0035 - 12);
        h += smoothstep(0.16, 0.19, p) * 13 + smoothstep(0.38, 0.41, p) * 11;
        const lake = this.fbm(n2, x + 500, z, 0.004, 2);
        if (lake < -0.16) h = lerp(h, WORLD.water - 2.5, smoothstep(-0.16, -0.26, lake));
        return h;
      }
      case 1: {   // snowfields: broad hills, terraced ridges, frozen lakes
        let h = 8 + this.fbm(n1, x, z, 0.005, 4) * 30 + this.ridged(n2, x, z, 0.004, 3) * 16;
        h = this.terrace(h, 12, 0.3);
        const lake = this.fbm(n3, x - 300, z, 0.004, 2);
        if (lake < -0.18) h = lerp(h, WORLD.water - 2.5, smoothstep(-0.18, -0.28, lake));
        return h;
      }
      case 2: {   // tall ridged peaks broken into plateaus by tall cliffs
        const r = this.ridged(n1, x, z, 0.0032, 4);
        const h = 12 + Math.pow(r, 1.6) * 155;
        const sharp = 0.08 + 0.26 * (0.5 + 0.5 * n3(x * 0.008, z * 0.008));
        return this.terrace(h, 16, sharp);
      }
      case 3: {   // ash plains, lava basins and volcano cones with craters
        let h = 3 + this.fbm(n1, x, z, 0.007, 3) * 12;
        const basin = this.fbm(n2, x - 300, z + 40, 0.006, 2);
        if (basin < -0.16) h = lerp(h, -4.5, smoothstep(-0.16, -0.3, basin));
        for (const [cx, cz, R, H] of VOLCANO_CONES) {
          const d = Math.hypot(x - cx, z - cz);
          if (d > R) continue;
          const c = 1 - d / R;
          h += H * Math.pow(c, 1.7);
          if (d < R * 0.13) h -= H * 0.42 * (1 - d / (R * 0.13));
        }
        return h;
      }
      default: {  // coast: dunes and beaches dropping into the sea
        const s = 1 - clamp(Math.hypot(x - TERRA[4].cx, z - TERRA[4].cz) / 430, 0, 1);
        return 3 + this.fbm(n1, x, z, 0.006, 3) * 8 - 60 * smoothstep(0.2, 0.75, s);
      }
    }
  },

  raw(x, z) {
    const w = this.weights(x, z);
    let H = 0, ws = 0;
    for (let i = 0; i < TERRA.length; i++) if (w[i] > 0.01) { H += w[i] * this.biomeH(i, x, z); ws += w[i]; }
    H /= ws;
    // rivers wind through the lowlands (lava rivers in the volcano)
    const hub = this.hubMask(x, z);
    const rv = Math.abs(this.n2(x * 0.0021 + this.n1(x * 0.004, z * 0.004) * 0.6, z * 0.0021 - 7.7));
    const river = (1 - smoothstep(0.01, 0.034, rv)) * (1 - w[2] * 0.95) * (1 - hub) * (1 - w[4]) * (1 - w[3] * 0.6);
    if (river > 0) H = lerp(H, -5.5, river);
    // home base plateau
    H = lerp(H, 8, hub);
    // the edge of the world: a ring of high ridges (the sea runs off to the south-east corner)
    const e = Math.max(Math.abs(x), Math.abs(z)) / this.half;
    const wall = smoothstep(0.86, 0.98, e);
    if (wall > 0) H += wall * 85 * (1 - w[4]);
    return H;
  },
};

// Merges many small static props (rocks, pillars, scrap…) into one mesh per material and area,
// so a world with thousands of props still renders in a handful of draw calls.
const Batch = {
  start(group, cell = 200) { this.group = group; this.cell = cell; this.map = new Map(); this._m = new THREE.Matrix4(); this._e = new THREE.Euler(); this._q = new THREE.Quaternion(); },
  add(geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, shadow = true) {
    const key = mat.uuid + '|' + Math.floor((x + 1e4) / this.cell) + ',' + Math.floor((z + 1e4) / this.cell) + '|' + shadow;
    let e = this.map.get(key);
    if (!e) { e = { mat, parts: [], shadow }; this.map.set(key, e); }
    this._e.set(rx, ry, rz);
    this._q.setFromEuler(this._e);
    e.parts.push({ geo, m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this._q.clone(), new THREE.Vector3(sx, sy, sz)) });
  },
  // add a whole group (already positioned in world space) to the batch
  addObject(obj, shadow = true) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.material.transparent || o.userData.keep) return;
      o.userData.baked = true;
      const key = o.material.uuid + '|' + Math.floor((o.matrixWorld.elements[12] + 1e4) / this.cell) + ',' + Math.floor((o.matrixWorld.elements[14] + 1e4) / this.cell) + '|' + shadow;
      let e = this.map.get(key);
      if (!e) { e = { mat: o.material, parts: [], shadow }; this.map.set(key, e); }
      e.parts.push({ geo: o.geometry, m: o.matrixWorld.clone() });
    });
  },
  finish() {
    for (const e of this.map.values()) {
      let total = 0;
      const geos = e.parts.map((p) => { const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()); g.applyMatrix4(p.m); total += g.attributes.position.count; return g; });
      const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
      let o = 0;
      for (const g of geos) {
        pos.set(g.attributes.position.array, o * 3);
        if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
        o += g.attributes.position.count;
        g.dispose();
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      bg.computeBoundingSphere();
      const m = new THREE.Mesh(bg, e.mat);
      m.castShadow = e.shadow; m.receiveShadow = true;
      this.group.add(m);
    }
    this.map = null;
  },
};
