'use strict';
// Procedural low-poly robot models. Every model faces +Z (so Object3D.lookAt aims it).

const Mat = {
  cache: new Map(),
  std(hex, o = {}) {
    const key = `s|${hex}|${o.rough ?? 0.55}|${o.metal ?? 0.5}|${o.emissive || ''}|${o.ei ?? 0}|${o.flat ?? true}`;
    let m = this.cache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: hex, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0.5, flatShading: o.flat ?? true,
        emissive: o.emissive || 0x000000, emissiveIntensity: o.ei ?? 0,
      });
      this.cache.set(key, m);
    }
    return m;
  },
  glow(hex, k = 3) {
    const key = `g|${hex}|${k}`;
    let m = this.cache.get(key);
    if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) }); this.cache.set(key, m); }
    return m;
  },
  glowT(hex, k = 2, opacity = 0.4, side = THREE.DoubleSide) {
    const key = `gt|${hex}|${k}|${opacity}|${side}`;
    let m = this.cache.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side });
      this.cache.set(key, m);
    }
    return m;
  },
};

const Geo = {
  cache: new Map(),
  get(key, fn) { let g = this.cache.get(key); if (!g) { g = fn(); this.cache.set(key, g); } return g; },
  box(w, h, d) { return this.get(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)); },
  sphere(r, d = 1) { return this.get(`s${r},${d}`, () => new THREE.IcosahedronGeometry(r, d)); },
  cyl(rt, rb, h, s = 8, open = false) { return this.get(`c${rt},${rb},${h},${s},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open)); },
  torus(r, t, s = 16) { return this.get(`t${r},${t},${s}`, () => new THREE.TorusGeometry(r, t, 6, s)); },
  oct(r) { return this.get(`o${r}`, () => new THREE.OctahedronGeometry(r, 0)); },
};

// radial glow texture for sprites
const GlowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
})();
function glowSprite(hex, scale, k = 2.5) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GlowTex, color: new THREE.Color(hex).multiplyScalar(k), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.set(scale, scale, 1);
  return s;
}

function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  if (parent) parent.add(m);
  return m;
}

// ═════════════════════════ Enemies ═════════════════════════
function buildEnemyModel(type, elite) {
  const d = ENEMY_TYPES[type];
  const c = d.color;
  const g = new THREE.Group();
  const body = Mat.std(elite ? '#4a3a1a' : d.body || '#2c2832', { metal: 0.7, rough: 0.4 }).clone();
  body.emissive = new THREE.Color(c); body.emissiveIntensity = 0;
  const dark = Mat.std('#16141a', { metal: 0.6, rough: 0.6 });
  const glowM = Mat.glow(elite ? '#ffd700' : c, 4);
  const parts = {};
  switch (d.model || type) {
    case 'drone': {
      const b = mesh(Geo.oct(0.6), body, 0, 0, 0, g); b.scale.set(1, 0.55, 1.2);
      mesh(Geo.sphere(0.16, 0), glowM, 0, 0, 0.62, g);
      mesh(Geo.torus(0.62, 0.04, 20), glowM, 0, 0, 0, g).rotation.x = Math.PI / 2;
      parts.rotors = [];
      for (const s of [-1, 1]) {
        const ring = mesh(Geo.torus(0.3, 0.04), dark, s * 0.85, 0.12, -0.1, g); ring.rotation.x = Math.PI / 2;
        const blade = mesh(Geo.box(0.55, 0.02, 0.08), Mat.glowT(c, 1.5, 0.6), s * 0.85, 0.12, -0.1, g);
        parts.rotors.push(blade);
      }
      if (type === 'hawk') {
        parts.wings = [];
        for (const s of [-1, 1]) {
          const w = new THREE.Group(); w.position.set(s * 0.4, 0.1, 0); g.add(w);
          const f = mesh(Geo.box(1.6, 0.05, 0.6), body, s * 0.8, 0, -0.1, w); f.rotation.y = s * 0.25;
          mesh(Geo.box(1.2, 0.06, 0.08), glowM, s * 0.8, 0.02, 0.18, w);
          parts.wings.push(w);
        }
        mesh(Geo.cyl(0, 0.14, 0.4, 4), Mat.std('#ffb347'), 0, -0.05, 0.85, g).rotation.x = Math.PI / 2;
      }
      break;
    }
    case 'swarmer': {
      const core = new THREE.Group(); g.add(core);
      mesh(Geo.sphere(0.34, 0), body, 0, 0, 0, core);
      for (let i = 0; i < 8; i++) {
        const sp = mesh(Geo.cyl(0, 0.1, 0.35, 4), dark, 0, 0, 0, core);
        const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
        sp.position.copy(v.clone().multiplyScalar(0.38));
        sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      }
      mesh(Geo.sphere(0.2, 0), glowM, 0, 0, 0, core);
      parts.core = core;
      break;
    }
    case 'grunt': {
      parts.legs = [];
      for (const s of [-1, 1]) {
        const hip = new THREE.Group(); hip.position.set(s * 0.3, 0.95, 0); g.add(hip);
        mesh(Geo.box(0.26, 0.95, 0.32), dark, 0, -0.47, 0, hip);
        mesh(Geo.box(0.34, 0.12, 0.48), dark, 0, -0.92, 0.06, hip);
        parts.legs.push(hip);
      }
      const torso = new THREE.Group(); torso.position.y = 1.45; g.add(torso); parts.torso = torso;
      mesh(Geo.box(1.0, 0.75, 0.7), body, 0, 0, 0, torso);
      mesh(Geo.box(0.5, 0.36, 0.46), body, 0, 0.55, 0.04, torso);
      mesh(Geo.box(0.42, 0.08, 0.05), glowM, 0, 0.56, 0.3, torso);
      mesh(Geo.box(0.22, 0.22, 1.0), dark, 0.62, -0.05, 0.3, torso);
      mesh(Geo.box(0.12, 0.12, 0.06), glowM, 0.62, -0.05, 0.82, torso);
      mesh(Geo.box(0.6, 0.06, 0.02), glowM, 0, 0.1, 0.36, torso);
      break;
    }
    case 'sniper': {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + Math.PI / 6;
        const leg = mesh(Geo.cyl(0.05, 0.07, 2.0, 5), dark, Math.cos(a) * 0.5, 0.9, Math.sin(a) * 0.5, g);
        leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      }
      const head = new THREE.Group(); head.position.y = 1.9; g.add(head); parts.head = head;
      const b = mesh(Geo.cyl(0.32, 0.4, 1.1, 6), body, 0, 0, 0, head); b.rotation.x = Math.PI / 2;
      const barrel = mesh(Geo.cyl(0.06, 0.08, 2.0, 6), dark, 0, 0.05, 1.4, head); barrel.rotation.x = Math.PI / 2;
      parts.lens = mesh(Geo.sphere(0.2, 0), glowM, 0, 0.2, 0.45, head);
      mesh(Geo.box(0.05, 0.05, 0.05), glowM, 0, 0.05, 2.42, head);
      break;
    }
    case 'shielder': {
      mesh(Geo.box(0.9, 0.5, 0.9), dark, 0, 0.25, 0, g);
      const b = mesh(Geo.sphere(0.8, 1), body, 0, 1.15, 0, g); b.scale.set(1, 0.9, 1);
      mesh(Geo.sphere(0.2, 0), glowM, 0, 1.25, 0.72, g);
      const gun = mesh(Geo.box(0.16, 0.16, 0.7), dark, 0.55, 1.0, 0.6, g);
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 2.4, 18, 1, true, -1.05, 2.1), Mat.glowT('#ff7ad9', 1.6, 0.35));
      sh.position.y = 1.2; g.add(sh); parts.shield = sh;
      const edge = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.04, 4, 18, 2.1), Mat.glow('#ffb8ec', 3));
      edge.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 1.05); edge.position.y = 2.4; g.add(edge);
      break;
    }
    case 'tank': {
      mesh(Geo.box(2.4, 0.9, 3.2), body, 0, 0.95, 0, g);
      for (const s of [-1, 1]) {
        mesh(Geo.box(0.7, 0.95, 3.8), dark, s * 1.45, 0.5, 0, g);
        mesh(Geo.box(0.05, 0.1, 3.0), glowM, s * 1.82, 0.7, 0, g);
      }
      const tur = new THREE.Group(); tur.position.y = 1.6; g.add(tur); parts.turret = tur;
      mesh(Geo.cyl(0.9, 1.0, 0.6, 8), body, 0, 0, 0, tur);
      const br = mesh(Geo.cyl(0.18, 0.22, 2.4, 8), dark, 0, 0.05, 1.5, tur); br.rotation.x = Math.PI / 2;
      mesh(Geo.box(0.8, 0.08, 0.08), glowM, 0, 0.32, 0.6, tur);
      break;
    }
    case 'carrier': {
      const disc = mesh(Geo.cyl(2.2, 1.6, 0.8, 10), body, 0, 0, 0, g);
      mesh(Geo.sphere(1.0, 1), dark, 0, 0.45, 0, g).scale.set(1, 0.6, 1);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        mesh(Geo.box(0.7, 0.6, 1.1), dark, Math.cos(a) * 2.3, -0.1, Math.sin(a) * 2.3, g).rotation.y = -a;
        mesh(Geo.sphere(0.14, 0), glowM, Math.cos(a) * 2.7, -0.1, Math.sin(a) * 2.7, g);
      }
      parts.bay = mesh(Geo.torus(1.1, 0.12, 20), glowM, 0, -0.42, 0, g);
      parts.bay.rotation.x = Math.PI / 2;
      void disc;
      break;
    }
  }
  if (elite) {
    const halo = mesh(Geo.torus(d.r * 1.4, 0.04, 24), Mat.glow('#ffd700', 3), 0, (d.hitY || 0) + 0.2, 0, g);
    halo.rotation.x = Math.PI / 2; parts.halo = halo;
    g.scale.setScalar(1.2);
  }
  g.userData.parts = parts;
  g.userData.bodyMat = body;
  return g;
}

// ═════════════════════════ Bosses ═════════════════════════
// One distinct machine per biome. All face +Z. Ground bosses (beast, titan) have their feet at y=0;
// flying bosses are centred on their body.
function buildBossModel(kind, hex) {
  const g = new THREE.Group();
  const body = Mat.std('#2a2230', { metal: 0.8, rough: 0.35 }).clone();
  body.emissive = new THREE.Color(hex); body.emissiveIntensity = 0;
  const dark = Mat.std('#141018', { metal: 0.7, rough: 0.5 });
  const glowM = Mat.glow(hex, 4);
  const node = (parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
  const parts = {};
  switch (kind) {
    case 'beast': {
      // BRAMBLEBACK — a hulking iron boar
      body.color.set('#6a4a34');
      const hide = Mat.std('#3a2a20', { metal: 0.5, rough: 0.6 });
      const torso = node(g, 0, 3.6, 0); parts.torso = torso;
      mesh(Geo.box(3.4, 2.6, 6.2), body, 0, 0, 0, torso);
      mesh(Geo.box(3.0, 1.1, 4.8), hide, 0, 1.6, -0.3, torso);
      for (let i = 0; i < 7; i++) {
        const sp = mesh(Geo.cyl(0, 0.35, 1.4, 4), dark, 0, 2.6, -2.4 + i * 0.75, torso); sp.rotation.x = -0.4;
        mesh(Geo.sphere(0.12, 0), glowM, 0, 3.25, -2.7 + i * 0.75, torso);
      }
      for (const s of [-1, 1]) mesh(Geo.box(0.08, 0.3, 4.6), glowM, s * 1.72, 0.2, 0, torso);
      const head = node(torso, 0, 0.2, 3.3); parts.head = head;
      mesh(Geo.box(2.5, 2.1, 2.2), body, 0, 0, 0.4, head);
      mesh(Geo.box(1.7, 1.2, 1.6), hide, 0, -0.35, 1.9, head);
      for (const s of [-1, 1]) {
        mesh(Geo.box(0.45, 0.3, 0.12), glowM, s * 0.7, 0.45, 1.52, head);
        const tusk = mesh(Geo.cyl(0, 0.2, 1.4, 5), Mat.std('#f0e8d8', { metal: 0.3, rough: 0.4 }), s * 0.85, -0.4, 2.5, head); tusk.rotation.set(-1.1, 0, s * 0.3);
        const ear = mesh(Geo.box(0.2, 0.9, 0.6), hide, s * 1.2, 1.2, 0, head); ear.rotation.z = s * 0.5;
      }
      parts.jaw = node(head, 0, -0.9, 1.2);
      mesh(Geo.box(1.4, 0.35, 1.5), dark, 0, 0, 0.5, parts.jaw);
      parts.legs = [];
      for (const [x, z] of [[-1.4, 2.1], [1.4, 2.1], [-1.4, -2.2], [1.4, -2.2]]) {
        const hip = node(torso, x, -1.0, z);
        mesh(Geo.box(0.95, 1.5, 1.1), body, 0, -0.7, 0, hip);
        const knee = node(hip, 0, -1.4, 0);
        mesh(Geo.box(0.75, 1.3, 0.85), dark, 0, -0.6, 0, knee);
        mesh(Geo.box(1.0, 0.3, 1.2), hide, 0, -1.15, 0.15, knee);
        parts.legs.push({ hip, knee });
      }
      const tail = mesh(Geo.cyl(0.1, 0.25, 2, 5), dark, 0, 0.6, -3.8, torso); tail.rotation.x = -0.9; parts.tail = tail;
      break;
    }
    case 'frost': {
      // GLACIEROS — a floating ice golem
      const ice = new THREE.MeshStandardMaterial({ color: '#cdefff', emissive: new THREE.Color('#4ab8ff'), emissiveIntensity: 0.25, roughness: 0.12, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.9 });
      body.color.set('#9fd8f5'); body.metalness = 0.2; body.roughness = 0.2;
      mesh(new THREE.IcosahedronGeometry(2.2, 0), body, 0, 0, 0, g);
      const core = mesh(Geo.sphere(0.9, 1), Mat.glow(hex, 4), 0, 0, 0.8, g); parts.core = core;
      const head = node(g, 0, 2.9, 0); parts.head = head;
      mesh(Geo.oct(1.15), ice, 0, 0, 0, head);
      for (const s of [-1, 1]) mesh(Geo.box(0.35, 0.14, 0.1), Mat.glow('#ffffff', 5), s * 0.38, 0.1, 0.8, head);
      const crown = mesh(Geo.cyl(0, 0.5, 1.6, 4), ice, 0, 1.3, 0, head); void crown;
      parts.arms = [];
      for (const s of [-1, 1]) {
        const arm = node(g, s * 3.2, 0.6, 0.3);
        mesh(Geo.oct(0.9), ice, 0, 0, 0, arm);
        mesh(Geo.oct(0.75), ice, s * 0.2, -1.4, 0.2, arm);
        const fist = mesh(Geo.oct(1.0), body, s * 0.3, -2.8, 0.4, arm); fist.scale.set(1, 1.2, 1);
        parts.arms.push(arm);
      }
      const ring = node(g, 0, 0, 0); parts.ring = ring;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        const sh = mesh(Geo.oct(0.45), ice, Math.cos(a) * 4.4, Math.sin(i * 1.7) * 0.8, Math.sin(a) * 4.4, ring); sh.scale.y = 2.2;
      }
      g.add(glowSprite(hex, 10, 0.8));
      break;
    }
    case 'titan': {
      // COLOSSUS — a walker as tall as a building
      body.color.set('#7a7064');
      const plate = Mat.std('#4a443c', { metal: 0.7, rough: 0.45 });
      parts.legs = [];
      for (const s of [-1, 1]) {
        const hip = node(g, s * 2.3, 11, 0);
        mesh(Geo.sphere(1.1, 1), plate, 0, 0, 0, hip);
        mesh(Geo.box(1.7, 5.5, 1.9), body, 0, -2.75, 0, hip);
        mesh(Geo.box(0.12, 3.5, 0.12), glowM, s * 0.9, -2.8, 0.96, hip);
        const knee = node(hip, 0, -5.5, 0);
        mesh(Geo.sphere(0.95, 1), plate, 0, 0, 0, knee);
        mesh(Geo.box(1.5, 5.1, 1.7), plate, 0, -2.6, 0, knee);
        mesh(Geo.box(2.8, 0.9, 3.8), body, 0, -5.1, 0.5, knee);
        parts.legs.push({ hip, knee, side: s });
      }
      mesh(Geo.box(5.4, 1.8, 2.8), plate, 0, 11.2, 0, g);
      const torso = node(g, 0, 14.6, 0); parts.torso = torso;
      mesh(Geo.box(6.2, 5, 4.2), body, 0, 0, 0, torso);
      mesh(Geo.box(4.4, 0.3, 0.2), glowM, 0, 1, 2.15, torso);
      mesh(Geo.box(3.2, 0.3, 0.2), glowM, 0, 0, 2.15, torso);
      mesh(Geo.sphere(0.9, 1), Mat.glow(hex, 5), 0, -1, 2.2, torso);
      for (const s of [-1, 1]) { const pa = mesh(Geo.box(2.4, 1.2, 3.4), plate, s * 3.8, 2.4, 0, torso); pa.rotation.z = -s * 0.25; }
      const head = node(torso, 0, 3.3, 0.2); parts.head = head;
      mesh(Geo.box(2.4, 2, 2.4), plate, 0, 0, 0, head);
      parts.eye = mesh(Geo.box(1.9, 0.45, 0.2), Mat.glow(hex, 6), 0, 0.15, 1.25, head);
      mesh(Geo.cyl(0.06, 0.06, 2.2, 4), dark, 0.8, 2, -0.5, head);
      parts.arms = [];
      for (const s of [-1, 1]) {
        const sh = node(torso, s * 3.9, 1.4, 0);
        mesh(Geo.box(1.3, 4.6, 1.3), body, 0, -2.3, 0, sh);
        const el = node(sh, 0, -4.6, 0);
        mesh(Geo.box(1.4, 3.8, 1.4), plate, 0, -1.9, 0, el);
        mesh(Geo.cyl(0.45, 0.55, 1.2, 8), dark, 0, -4.1, 0, el);
        mesh(Geo.torus(0.42, 0.1, 16), glowM, 0, -4.7, 0, el).rotation.x = Math.PI / 2;
        parts.arms.push({ sh, el, side: s });
      }
      break;
    }
    case 'fire': {
      // INFERNUS — a magma demon wreathed in flame
      body.color.set('#2c1410'); body.emissive.set('#ff4a0a'); body.metalness = 0.3; body.roughness = 0.8;
      const basalt = Mat.std('#1c0e0a', { rough: 0.9, metal: 0.2 });
      mesh(Geo.sphere(2.4, 1), body, 0, 0, 0, g);
      for (let i = 0; i < 8; i++) { const c = mesh(Geo.box(0.14, rand(1, 2.2), 0.14), Mat.glow('#ffb347', 3), 0, 0, 0, g); const a = rand(0, TAU), b = rand(-0.8, 0.8); c.position.set(Math.cos(a) * 2.3 * Math.cos(b), Math.sin(b) * 2.3, Math.sin(a) * 2.3 * Math.cos(b)); c.lookAt(0, 0, 0); }
      const belt = mesh(Geo.torus(2.4, 0.22, 36), Mat.glow(hex, 4), 0, -0.6, 0, g); belt.rotation.x = Math.PI / 2;
      const head = node(g, 0, 3.0, 0.3); parts.head = head;
      mesh(Geo.sphere(1.2, 1), basalt, 0, 0, 0, head);
      for (const s of [-1, 1]) {
        const horn = mesh(Geo.cyl(0, 0.35, 1.8, 5), basalt, s * 0.9, 1.0, -0.2, head); horn.rotation.z = -s * 0.6;
        mesh(Geo.box(0.35, 0.15, 0.1), Mat.glow('#ffe14d', 6), s * 0.4, 0.15, 1.12, head);
      }
      mesh(Geo.box(0.8, 0.14, 0.1), Mat.glow('#ff7a1a', 5), 0, -0.4, 1.12, head);
      parts.arms = [];
      for (const s of [-1, 1]) {
        const arm = node(g, s * 3.0, 0.8, 0.2);
        mesh(Geo.sphere(0.9, 0), basalt, 0, 0, 0, arm);
        mesh(Geo.box(0.9, 2.2, 0.9), body, s * 0.2, -1.4, 0.3, arm);
        const fist = mesh(Geo.sphere(0.8, 0), Mat.glow(hex, 3), s * 0.3, -2.8, 0.5, arm); void fist;
        parts.arms.push(arm);
      }
      const tailFlame = mesh(new THREE.ConeGeometry(2, 5, 12, 1, true), Mat.glowT('#ff6a1a', 1.2, 0.55), 0, -4.3, 0, g); tailFlame.rotation.x = Math.PI; tailFlame.castShadow = false;
      parts.tail = tailFlame;
      parts.flames = [];
      for (let i = 0; i < 9; i++) {
        const f = glowSprite(i % 3 ? '#ff6a1a' : '#ffd23f', rand(2, 3.5), 2.4);
        const a = (i / 9) * TAU;
        f.position.set(Math.cos(a) * 2.2, rand(0.5, 3.2), Math.sin(a) * 2.2);
        g.add(f); parts.flames.push(f);
      }
      break;
    }
    case 'bird': {
      // STORMWING — a mechanical bird of prey
      body.color.set('#3a3a48');
      const gold = Mat.std('#ffcf3a', { metal: 0.9, rough: 0.25 });
      const b = mesh(Geo.oct(1.6), body, 0, 0, 0, g); b.scale.set(1, 0.85, 2.3);
      mesh(Geo.box(0.3, 0.2, 3), glowM, 0, 0.9, 0, g);
      const head = node(g, 0, 0.8, 3.1); parts.head = head;
      mesh(Geo.sphere(0.95, 1), body, 0, 0, 0, head);
      const beak = mesh(Geo.cyl(0, 0.45, 1.4, 5), gold, 0, -0.15, 1.2, head); beak.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) mesh(Geo.box(0.3, 0.16, 0.1), Mat.glow(hex, 6), s * 0.45, 0.2, 0.82, head);
      mesh(Geo.cyl(0, 0.3, 1.2, 4), gold, 0, 0.9, -0.3, head).rotation.x = -0.8;
      parts.wings = [];
      for (const s of [-1, 1]) {
        const inner = node(g, s * 1.1, 0.4, 0.2);
        mesh(Geo.box(4.2, 0.22, 2.6), body, s * 2.1, 0, 0, inner);
        mesh(Geo.box(4.0, 0.08, 0.2), glowM, s * 2.1, 0.12, 1.25, inner);
        const outer = node(inner, s * 4.2, 0, 0);
        mesh(Geo.box(4.4, 0.16, 2.0), gold, s * 2.2, 0, -0.2, outer);
        for (let k = 0; k < 4; k++) mesh(Geo.box(0.5, 0.08, 1.8), body, s * (2.5 + k * 0.6), -0.02, -1.4, outer);
        mesh(Geo.box(4.0, 0.08, 0.16), glowM, s * 2.2, 0.1, 0.8, outer);
        parts.wings.push({ inner, outer, side: s });
      }
      const tail = node(g, 0, 0.1, -3.4); parts.tail = tail;
      for (let k = -2; k <= 2; k++) { const f = mesh(Geo.box(0.5, 0.1, 2.6), k % 2 ? gold : body, k * 0.45, 0, -1.2, tail); f.rotation.y = k * 0.18; }
      for (const s of [-1, 1]) { const t = mesh(Geo.cyl(0.12, 0.2, 1.4, 5), gold, s * 0.6, -1.4, 0.6, g); t.rotation.x = 0.3; }
      break;
    }
    default: {
      // the original orb overseer
      mesh(Geo.sphere(2.3, 1), body, 0, 0, 0, g);
      const ring = new THREE.Group(); g.add(ring);
      for (let i = 0; i < 8; i++) {
        const p = new THREE.Group(); p.rotation.y = (i / 8) * TAU; ring.add(p);
        mesh(Geo.box(1.5, 2.6, 0.55), dark, 0, 0, 3.4, p);
        mesh(Geo.box(0.12, 1.8, 0.1), glowM, 0, 0, 3.7, p);
      }
      parts.ring = ring;
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.parts = parts;
  g.userData.bodyMat = body;
  return g;
}

// ═════════════════════════ Companions ═════════════════════════
function buildCompanionModel(kind) {
  const d = COMP_DEFS[kind];
  const c = d.color;
  const g = new THREE.Group();
  const body = Mat.std('#1c3a34', { metal: 0.6, rough: 0.4 }).clone();
  body.emissive = new THREE.Color(c); body.emissiveIntensity = 0.05;
  const dark = Mat.std('#122420', { metal: 0.6, rough: 0.5 });
  const glowM = Mat.glow(c, 4);
  const parts = {};
  switch (kind) {
    case 'gunner': {
      mesh(Geo.sphere(0.3, 1), body, 0, 0, 0, g);
      mesh(Geo.box(0.08, 0.08, 0.5), dark, 0, -0.05, 0.35, g);
      mesh(Geo.sphere(0.08, 0), glowM, 0, 0.08, 0.26, g);
      parts.rotors = [];
      for (const s of [-1, 1]) {
        const r = mesh(Geo.torus(0.18, 0.025), glowM, s * 0.45, 0.1, 0, g); r.rotation.x = Math.PI / 2;
        parts.rotors.push(mesh(Geo.box(0.32, 0.01, 0.05), Mat.glowT(c, 1, 0.6), s * 0.45, 0.1, 0, g));
      }
      break;
    }
    case 'medic': {
      mesh(Geo.box(0.5, 0.45, 0.5), body, 0, 0, 0, g);
      for (const z of [-0.26, 0.26]) { mesh(Geo.box(0.1, 0.32, 0.02), glowM, 0, 0, z, g); mesh(Geo.box(0.32, 0.1, 0.02), glowM, 0, 0, z, g); }
      const h = mesh(Geo.torus(0.3, 0.02, 20), glowM, 0, 0.42, 0, g); h.rotation.x = Math.PI / 2;
      break;
    }
    case 'shield': {
      parts.core = mesh(Geo.sphere(0.32, 0), body, 0, 0, 0, g);
      mesh(Geo.sphere(0.14, 0), glowM, 0, 0, 0, g);
      const arcs = new THREE.Group(); g.add(arcs); parts.arcs = arcs;
      for (let i = 0; i < 3; i++) {
        const a = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 4, 12, 1.4), glowM);
        a.rotation.set(rand(0, TAU), rand(0, TAU), 0); arcs.add(a);
      }
      g.add(Object.assign(new THREE.Mesh(Geo.sphere(0.7, 1), Mat.glowT(c, 0.6, 0.18)), {}));
      break;
    }
    case 'tesla': {
      mesh(Geo.sphere(0.3, 1), body, 0, 0, 0, g);
      mesh(Geo.cyl(0.08, 0.1, 0.4, 6), dark, 0, 0.4, 0, g);
      for (let i = 0; i < 3; i++) { const r = mesh(Geo.torus(0.14, 0.02, 10), glowM, 0, 0.3 + i * 0.1, 0, g); r.rotation.x = Math.PI / 2; }
      parts.orb = mesh(Geo.sphere(0.12, 1), Mat.glow('#ffffff', 5), 0, 0.68, 0, g);
      break;
    }
    case 'rocket': {
      mesh(Geo.box(0.55, 0.38, 0.5), body, 0, 0, 0, g);
      for (const s of [-1, 1]) {
        mesh(Geo.box(0.26, 0.3, 0.42), dark, s * 0.42, 0.08, 0, g);
        mesh(Geo.sphere(0.05, 0), glowM, s * 0.42, 0.14, 0.22, g);
        mesh(Geo.sphere(0.05, 0), glowM, s * 0.42, 0.0, 0.22, g);
      }
      mesh(Geo.box(0.35, 0.06, 0.02), glowM, 0, 0.02, 0.26, g);
      parts.thrust = glowSprite(c, 0.9, 2); parts.thrust.position.y = -0.35; g.add(parts.thrust);
      break;
    }
    case 'scout': {
      const b = mesh(Geo.oct(0.28), body, 0, 0, 0, g); b.scale.set(0.8, 0.5, 1.4);
      mesh(Geo.sphere(0.09, 1), Mat.glow('#ffffff', 4), 0, 0.05, 0.36, g);
      const dish = mesh(Geo.cyl(0.2, 0.05, 0.08, 10), glowM, 0, 0.25, -0.05, g); dish.rotation.x = -0.4;
      parts.dish = dish;
      parts.rotors = [];
      for (const s of [-1, 1]) {
        mesh(Geo.box(0.36, 0.03, 0.06), dark, s * 0.3, 0.05, -0.05, g);
        parts.rotors.push(mesh(Geo.box(0.34, 0.01, 0.05), Mat.glowT(c, 1, 0.6), s * 0.5, 0.08, -0.05, g));
      }
      break;
    }
    case 'bomber': {
      const b = mesh(Geo.cyl(0.35, 0.45, 0.5, 8), body, 0, 0, 0, g); void b;
      mesh(Geo.cyl(0.46, 0.46, 0.06, 12), glowM, 0, -0.26, 0, g);
      for (let i = 0; i < 3; i++) mesh(Geo.sphere(0.13, 0), Mat.std('#222228', { metal: 0.6 }), Math.cos(i * 2.1) * 0.22, -0.34, Math.sin(i * 2.1) * 0.22, g);
      parts.rotors = [];
      for (const s of [-1, 1]) for (const z of [-1, 1]) {
        mesh(Geo.box(0.06, 0.06, 0.5), dark, s * 0.45, 0.15, z * 0.25, g);
        parts.rotors.push(mesh(Geo.box(0.42, 0.01, 0.06), Mat.glowT(c, 1, 0.6), s * 0.55, 0.2, z * 0.45, g));
      }
      break;
    }
    case 'bubble': {
      mesh(Geo.sphere(0.3, 1), body, 0, 0, 0, g);
      for (let i = 0; i < 3; i++) { const r = mesh(Geo.torus(0.42 + i * 0.07, 0.025, 24), glowM, 0, 0, 0, g); r.rotation.set(i * 1.1, i * 0.7, 0); }
      g.add(new THREE.Mesh(Geo.sphere(0.62, 1), Mat.glowT(c, 0.7, 0.16)));
      parts.arcs = g.children[g.children.length - 2];
      break;
    }
    case 'laser': {
      const b = mesh(Geo.oct(0.35), body, 0, 0, 0, g); b.scale.set(0.8, 0.6, 1.5);
      mesh(Geo.sphere(0.12, 1), Mat.glow('#ffffff', 5), 0, 0, 0.5, g);
      for (const s of [-1, 1]) mesh(Geo.box(0.04, 0.04, 0.5), glowM, s * 0.3, 0, -0.1, g);
      break;
    }
  }
  const sp = glowSprite(c, 1.1, 0.8); g.add(sp); parts.halo = sp;
  g.scale.setScalar(0.8);
  g.userData.parts = parts;
  g.userData.bodyMat = body;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ═════════════════════════ First-person blaster ═════════════════════════
function buildViewModel() {
  const g = new THREE.Group();
  const shell = Mat.std('#1a2a36', { metal: 0.8, rough: 0.3, flat: false });
  const dark = Mat.std('#0c141a', { metal: 0.7, rough: 0.5, flat: false });
  const cyan = Mat.glow('#3cf2ff', 2);
  mesh(Geo.box(0.12, 0.13, 0.5), shell, 0, 0, 0, g);
  mesh(Geo.box(0.09, 0.2, 0.1), dark, 0, -0.14, 0.12, g).rotation.x = -0.3;
  mesh(Geo.box(0.05, 0.03, 0.34), dark, 0, 0.08, -0.02, g);
  const stripe = mesh(Geo.box(0.125, 0.02, 0.3), cyan, 0, 0.03, -0.02, g);
  const cell = mesh(Geo.cyl(0.035, 0.035, 0.16, 8), Mat.glow('#b98cff', 4), 0.07, -0.02, 0.08, g); cell.rotation.x = Math.PI / 2;
  const barrels = new THREE.Group(); barrels.position.z = -0.3; g.add(barrels);
  const muzzle = new THREE.Object3D(); muzzle.position.z = -0.52; g.add(muzzle);
  const flash = glowSprite('#3cf2ff', 0.35, 4); flash.position.z = -0.55; flash.visible = false; g.add(flash);
  g.userData = { barrels, muzzle, flash, shell, dark, stripe };
  setViewModelBarrels(g, 1);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 20; } });
  return g;
}
// Swap the barrel assembly & glow colour to match the weapon in hand.
function setViewModelWeapon(g, id, n = 1) {
  const W = WEAPONS[id] || WEAPONS.blaster;
  const { barrels, dark, stripe, flash } = g.userData;
  stripe.material = Mat.glow(W.color, 2);
  flash.material.color.set(W.color).multiplyScalar(4);
  if (id === 'blaster' || !WEAPONS[id]) { setViewModelBarrels(g, n); }
  else {
    barrels.clear();
    const ring = Mat.glow(W.color, 2.5);
    if (id === 'scatter') {
      for (let i = 0; i < 3; i++) { const b = mesh(Geo.cyl(0.028, 0.03, 0.18, 8), dark, (i - 1) * 0.05, 0.01, -0.04, barrels); b.rotation.x = Math.PI / 2; }
      const drum = mesh(Geo.cyl(0.07, 0.07, 0.1, 10), dark, 0, -0.07, 0.05, barrels); drum.rotation.z = Math.PI / 2;
      mesh(Geo.box(0.17, 0.02, 0.02), ring, 0, 0.01, -0.13, barrels);
    } else if (id === 'rifle') {
      const b = mesh(Geo.cyl(0.016, 0.02, 0.46, 8), dark, 0, 0.01, -0.17, barrels); b.rotation.x = Math.PI / 2;
      for (const z of [-0.1, -0.22, -0.34]) mesh(Geo.torus(0.022, 0.006, 10), ring, 0, 0.01, z, barrels);
      mesh(Geo.box(0.04, 0.05, 0.16), dark, 0, 0.1, 0.06, barrels);
      mesh(Geo.sphere(0.02, 0), ring, 0, 0.1, -0.03, barrels);
    } else if (id === 'launcher') {
      const b = mesh(Geo.cyl(0.06, 0.06, 0.36, 10), dark, 0, 0.03, -0.06, barrels); b.rotation.x = Math.PI / 2;
      mesh(Geo.torus(0.06, 0.012, 12), ring, 0, 0.03, -0.24, barrels);
      mesh(Geo.box(0.02, 0.06, 0.02), ring, 0, 0.1, -0.1, barrels);
    }
    barrels.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 20; } });
  }
}
function setViewModelBarrels(g, n) {
  const { barrels, dark } = g.userData;
  barrels.clear();
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.045;
    const b = mesh(Geo.cyl(0.02, 0.025, 0.28, 8), dark, x, 0.01, -0.08, barrels); b.rotation.x = Math.PI / 2;
    mesh(Geo.torus(0.024, 0.008, 10), Mat.glow('#3cf2ff', 2.5), x, 0.01, -0.22, barrels);
  }
  barrels.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 20; } });
}

// ═════════════════════════ Pickups ═════════════════════════
function buildPickupModel(type) {
  const g = new THREE.Group();
  const c = type === 'health' ? '#6bff9e' : type === 'bucks' ? '#ffd23f' : type === 'item' ? '#ffffff' : PARTS[type].color;
  const m = Mat.std(c, { metal: 0.6, rough: 0.35, emissive: c, ei: 0.6 });
  switch (type) {
    case 'bucks': {
      const coin = mesh(Geo.cyl(0.22, 0.22, 0.06, 14), Mat.std('#ffcf3a', { metal: 0.9, rough: 0.25, emissive: '#ffb300', ei: 0.7 }), 0, 0, 0, g); coin.rotation.x = Math.PI / 2;
      mesh(Geo.box(0.06, 0.24, 0.08), Mat.glow('#fff2b0', 2), 0, 0, 0, g);
      break;
    }
    case 'item': mesh(Geo.box(0.34, 0.34, 0.34), Mat.std('#dfe8f4', { metal: 0.5, rough: 0.3, emissive: '#8ab4ff', ei: 0.5 }), 0, 0, 0, g).rotation.set(0.4, 0.4, 0); break;
    case 'scrap': mesh(Geo.box(0.36, 0.08, 0.28), m, 0, 0, 0, g).rotation.set(0.3, 0, 0.2); break;
    case 'wire': mesh(Geo.torus(0.14, 0.05, 12), m, 0, 0, 0, g); break;
    case 'servo': mesh(Geo.cyl(0.16, 0.16, 0.1, 8), m, 0, 0, 0, g).rotation.x = Math.PI / 2; break;
    case 'circuit': mesh(Geo.box(0.32, 0.04, 0.32), m, 0, 0, 0, g).rotation.x = 0.6; break;
    case 'lens': mesh(Geo.oct(0.18), m, 0, 0, 0, g).scale.set(0.7, 1.3, 0.7); break;
    case 'core': mesh(Geo.cyl(0.14, 0.14, 0.3, 6), Mat.glow(c, 2), 0, 0, 0, g); break;
    case 'quantum': mesh(Geo.box(0.24, 0.24, 0.24), Mat.glow(c, 3), 0, 0, 0, g).rotation.set(0.6, 0.6, 0); break;
    case 'health':
      mesh(Geo.box(0.12, 0.4, 0.12), Mat.glow(c, 3), 0, 0, 0, g);
      mesh(Geo.box(0.4, 0.12, 0.12), Mat.glow(c, 3), 0, 0, 0, g);
      break;
  }
  g.add(glowSprite(c, type === 'quantum' ? 1.6 : 1.1, 1.8));
  return g;
}

// ═════════════════════════ Player mech (third-person view) ═════════════════════════
function buildGliderModel(scale = 1) {
  const g = new THREE.Group();
  // kite-shaped canopy lying flat (nose toward +Z)
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0.18, 0.95, -1.6, 0, -0.25, 0, 0.12, -0.45,
    0, 0.18, 0.95, 0, 0.12, -0.45, 1.6, 0, -0.25,
  ], 3));
  sg.computeVertexNormals();
  const sail = new THREE.Mesh(sg, Mat.glowT('#3cf2ff', 0.9, 0.55));
  g.add(sail);
  const frameM = Mat.std('#1a2a36', { metal: 0.8, rough: 0.3 });
  const bar = new THREE.Mesh(Geo.box(3.2, 0.05, 0.05), frameM); bar.position.z = -0.2; g.add(bar);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(Geo.box(0.05, 0.05, 0.05), Mat.glow('#3cf2ff', 5)); tip.position.set(s * 1.6, 0, -0.25); g.add(tip);
    const strut = new THREE.Mesh(Geo.cyl(0.015, 0.015, 1.1, 4), frameM); strut.position.set(s * 0.25, -0.5, 0.2); strut.rotation.z = s * 0.25; g.add(strut);
  }
  g.scale.setScalar(scale);
  return g;
}

// Articulated player mech. Joint chain (all THREE.Groups, model faces +Z, feet at y=0):
//   root ─ pelvis ─┬─ hip ─ knee ─ ankle ─ toe            (×2)
//                  └─ spine ─ chest ─┬─ neck ─ head
//                                    └─ shoulder ─ elbow ─ wrist (×2, gun in right hand)
function buildAvatarModel() {
  const g = new THREE.Group();
  const shell = Mat.std('#3a7c98', { metal: 0.55, rough: 0.4, emissive: '#0e3a4c', ei: 0.5 });
  const dark = Mat.std('#1a3242', { metal: 0.5, rough: 0.5, emissive: '#081a24', ei: 0.5 });
  const joint = Mat.std('#0e1a22', { metal: 0.85, rough: 0.25, flat: false });
  const cyan = Mat.glow('#3cf2ff', 4);
  const node = (parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
  const J = {};
  J.root = node(g, 0, 0, 0);
  J.pelvis = node(J.root, 0, 0.95, 0);
  mesh(Geo.box(0.34, 0.15, 0.22), dark, 0, 0, 0, J.pelvis);
  mesh(Geo.box(0.2, 0.1, 0.05), shell, 0, -0.02, 0.12, J.pelvis);

  J.legs = [];
  for (const s of [-1, 1]) {
    const hip = node(J.pelvis, s * 0.13, -0.05, 0);
    mesh(Geo.sphere(0.075, 1), joint, 0, 0, 0, hip);
    mesh(Geo.box(0.15, 0.34, 0.18), shell, 0, -0.21, 0.01, hip);             // thigh
    mesh(Geo.box(0.02, 0.2, 0.02), cyan, s * 0.078, -0.2, 0.06, hip);
    const knee = node(hip, 0, -0.43, 0);
    mesh(Geo.sphere(0.068, 1), joint, 0, 0, 0, knee);
    mesh(Geo.box(0.15, 0.1, 0.07), shell, 0, 0.02, 0.085, knee);             // knee cap
    mesh(Geo.box(0.12, 0.34, 0.13), dark, 0, -0.2, 0, knee);                  // shin
    mesh(Geo.box(0.13, 0.17, 0.05), shell, 0, -0.16, 0.08, knee);             // shin guard
    const ankle = node(knee, 0, -0.41, 0);
    mesh(Geo.sphere(0.05, 1), joint, 0, 0, 0, ankle);
    mesh(Geo.box(0.14, 0.08, 0.2), dark, 0, -0.045, 0.03, ankle);             // foot
    mesh(Geo.box(0.13, 0.05, 0.06), shell, 0, -0.02, -0.08, ankle);           // heel
    const toe = node(ankle, 0, -0.06, 0.13);
    mesh(Geo.box(0.13, 0.05, 0.1), shell, 0, 0, 0.045, toe);
    J.legs.push({ hip, knee, ankle, toe, side: s });
  }

  J.spine = node(J.pelvis, 0, 0.09, 0);
  mesh(Geo.box(0.26, 0.2, 0.18), joint, 0, 0.08, 0, J.spine);               // abdomen
  mesh(Geo.box(0.2, 0.04, 0.04), cyan, 0, 0.08, 0.1, J.spine);
  J.chest = node(J.spine, 0, 0.19, 0);
  mesh(Geo.box(0.5, 0.34, 0.3), shell, 0, 0.15, 0, J.chest);
  mesh(Geo.box(0.3, 0.1, 0.03), cyan, 0, 0.2, 0.16, J.chest);
  mesh(Geo.box(0.44, 0.46, 0.22), dark, 0, 0.14, -0.26, J.chest);           // backpack
  for (const s of [-1, 1]) mesh(Geo.box(0.04, 0.34, 0.02), cyan, s * 0.14, 0.14, -0.38, J.chest);
  const thrusters = [];
  for (const s of [-1, 1]) {
    mesh(Geo.cyl(0.07, 0.09, 0.18, 8), dark, s * 0.13, -0.14, -0.3, J.chest);
    const t = glowSprite('#3cf2ff', 0.5, 2); t.position.set(s * 0.13, -0.27, -0.3); J.chest.add(t); thrusters.push(t);
  }
  J.neck = node(J.chest, 0, 0.33, 0);
  mesh(Geo.cyl(0.05, 0.065, 0.1, 8), joint, 0, 0.04, 0, J.neck);
  J.head = node(J.neck, 0, 0.09, 0);
  mesh(Geo.box(0.28, 0.23, 0.28), shell, 0, 0.11, 0, J.head);
  mesh(Geo.box(0.24, 0.06, 0.04), cyan, 0, 0.13, 0.145, J.head);             // visor
  mesh(Geo.box(0.3, 0.05, 0.3), dark, 0, 0.23, 0, J.head);
  mesh(Geo.cyl(0.008, 0.008, 0.26, 4), joint, 0.1, 0.36, -0.08, J.head);    // antenna
  mesh(Geo.sphere(0.02, 0), cyan, 0.1, 0.49, -0.08, J.head);

  J.arms = [];
  for (const s of [-1, 1]) {
    const sh = node(J.chest, s * 0.31, 0.24, 0);
    mesh(Geo.sphere(0.07, 1), joint, 0, 0, 0, sh);
    mesh(Geo.box(0.2, 0.13, 0.24), shell, s * 0.03, 0.05, 0, sh);            // pauldron
    mesh(Geo.box(0.1, 0.24, 0.11), dark, 0, -0.15, 0, sh);                    // upper arm
    const elbow = node(sh, 0, -0.29, 0);
    mesh(Geo.sphere(0.055, 1), joint, 0, 0, 0, elbow);
    mesh(Geo.box(0.11, 0.24, 0.12), shell, 0, -0.13, 0, elbow);               // forearm
    mesh(Geo.box(0.02, 0.14, 0.02), cyan, s * 0.058, -0.13, 0.03, elbow);
    const wrist = node(elbow, 0, -0.27, 0);
    mesh(Geo.box(0.09, 0.1, 0.08), dark, 0, -0.05, 0, wrist);                 // hand
    mesh(Geo.box(0.03, 0.06, 0.03), dark, -s * 0.05, -0.04, 0.04, wrist);     // thumb
    J.arms.push({ sh, elbow, wrist, side: s });
  }
  // blaster held in the right hand, barrel along the forearm
  const gun = node(J.arms[1].wrist, 0, -0.07, 0.04);
  gun.rotation.x = Math.PI / 2;
  mesh(Geo.box(0.1, 0.12, 0.5), shell, 0, 0, 0.14, gun);
  mesh(Geo.box(0.105, 0.03, 0.3), cyan, 0, 0.05, 0.14, gun);
  mesh(Geo.cyl(0.03, 0.035, 0.18, 8), dark, 0, 0, 0.45, gun).rotation.x = Math.PI / 2;
  const muzzle = new THREE.Object3D(); muzzle.position.z = 0.56; gun.add(muzzle);
  const flash = glowSprite('#3cf2ff', 0.7, 4); flash.position.z = 0.58; flash.visible = false; gun.add(flash);

  const glider = buildGliderModel(0.9); glider.position.set(0, 2.3, -0.05); glider.visible = false; J.root.add(glider);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { J, muzzle, flash, flashT: 0, glider, thrusters, phase: 0, bodyYaw: 0, aimT: 0, lastStep: 0 };
  return g;
}

// ═════════════════════════ Scrap Sprite (hidden collectible) ═════════════════════════
function buildSpriteModel() {
  const g = new THREE.Group();
  const leaf = Mat.std('#3aff9a', { metal: 0.2, rough: 0.4, emissive: '#3aff9a', ei: 0.9 });
  mesh(Geo.sphere(0.24, 1), Mat.std('#2a4a3a', { metal: 0.5, rough: 0.3 }), 0, 0, 0, g);
  mesh(Geo.sphere(0.07, 0), Mat.glow('#ffffff', 4), -0.08, 0.05, 0.2, g);
  mesh(Geo.sphere(0.07, 0), Mat.glow('#ffffff', 4), 0.08, 0.05, 0.2, g);
  const stem = mesh(Geo.cyl(0.015, 0.015, 0.3, 4), leaf, 0, 0.35, 0, g);
  const l = mesh(Geo.oct(0.14), leaf, 0.06, 0.52, 0, g); l.scale.set(1.3, 0.35, 0.8); l.rotation.z = -0.4;
  g.add(glowSprite('#3aff9a', 1.4, 1.6));
  void stem;
  return g;
}
