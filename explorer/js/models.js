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
  const body = Mat.std(elite ? '#4a3a1a' : '#2c2832', { metal: 0.7, rough: 0.4 }).clone();
  body.emissive = new THREE.Color(c); body.emissiveIntensity = 0;
  const dark = Mat.std('#16141a', { metal: 0.6, rough: 0.6 });
  const glowM = Mat.glow(elite ? '#ffd700' : c, 4);
  const parts = {};
  switch (type) {
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

// ═════════════════════════ Boss ═════════════════════════
function buildBossModel(hex) {
  const g = new THREE.Group();
  const body = Mat.std('#2a2230', { metal: 0.8, rough: 0.35 }).clone();
  body.emissive = new THREE.Color(hex); body.emissiveIntensity = 0;
  const dark = Mat.std('#141018', { metal: 0.7, rough: 0.5 });
  const glowM = Mat.glow(hex, 4);
  mesh(Geo.sphere(2.3, 1), body, 0, 0, 0, g);
  const ring = new THREE.Group(); g.add(ring);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const p = new THREE.Group(); p.rotation.y = a; ring.add(p);
    mesh(Geo.box(1.5, 2.6, 0.55), dark, 0, 0, 3.4, p);
    mesh(Geo.box(0.12, 1.8, 0.1), glowM, 0, 0, 3.7, p);
    mesh(Geo.cyl(0, 0.35, 1.0, 4), dark, 0, 1.7, 3.4, p);
  }
  const inner = mesh(Geo.torus(2.9, 0.12, 40), glowM, 0, 0, 0, g); inner.rotation.x = Math.PI / 2;
  const lower = mesh(Geo.torus(1.6, 0.2, 30), glowM, 0, -2.3, 0, g); lower.rotation.x = Math.PI / 2;
  const eye = new THREE.Group(); g.add(eye);
  mesh(Geo.sphere(1.05, 1), Mat.std('#050305', { metal: 0.2, rough: 0.2 }), 0, 0, 1.55, eye);
  const pupil = mesh(Geo.sphere(0.55, 1), Mat.glow(hex, 7), 0, 0, 2.3, eye);
  const halo = glowSprite(hex, 9, 2); halo.position.set(0, 0, 2.6); eye.add(halo);
  const crown = new THREE.Group(); g.add(crown);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const sp = mesh(Geo.cyl(0, 0.3, 1.6, 4), dark, Math.cos(a) * 1.5, 2.3, Math.sin(a) * 1.5, crown);
    sp.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
  }
  g.userData.parts = { ring, inner, lower, eye, pupil, crown };
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
  mesh(Geo.box(0.125, 0.02, 0.3), cyan, 0, 0.03, -0.02, g);
  const cell = mesh(Geo.cyl(0.035, 0.035, 0.16, 8), Mat.glow('#b98cff', 4), 0.07, -0.02, 0.08, g); cell.rotation.x = Math.PI / 2;
  const barrels = new THREE.Group(); barrels.position.z = -0.3; g.add(barrels);
  const muzzle = new THREE.Object3D(); muzzle.position.z = -0.52; g.add(muzzle);
  const flash = glowSprite('#3cf2ff', 0.35, 4); flash.position.z = -0.55; flash.visible = false; g.add(flash);
  g.userData = { barrels, muzzle, flash, shell, dark };
  setViewModelBarrels(g, 1);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 20; } });
  return g;
}
function setViewModelBarrels(g, n) {
  const { barrels, dark } = g.userData;
  barrels.clear();
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.045;
    const b = mesh(Geo.cyl(0.02, 0.025, 0.28, 8), dark, x, 0.01, -0.08, barrels); b.rotation.x = Math.PI / 2;
    mesh(Geo.torus(0.024, 0.008, 10), Mat.glow('#3cf2ff', 2.5), x, 0.01, -0.22, barrels);
  }
}

// ═════════════════════════ Pickups ═════════════════════════
function buildPickupModel(type) {
  const g = new THREE.Group();
  const c = type === 'health' ? '#6bff9e' : PARTS[type].color;
  const m = Mat.std(c, { metal: 0.6, rough: 0.35, emissive: c, ei: 0.6 });
  switch (type) {
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
