'use strict';
// ═════════════════════════ Particles ═════════════════════════
// A pooled GPU point system. Colours are HDR (values > 1 bloom).
class ParticleSystem {
  constructor(scene, cap, additive) {
    this.cap = cap; this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.siz = new Float32Array(cap);
    this.alp = new Float32Array(cap);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alp, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(size * scale / -mv.z, 1.0, 256.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: additive
        ? `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * a * a * vA, 1.0); }`
        : `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.15, d); gl_FragColor = vec4(vC, a * vA); }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 9;
    scene.add(this.points);
    // per-particle sim state
    this.v = new Float32Array(cap * 3);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.size0 = new Float32Array(cap); this.drag = new Float32Array(cap); this.grav = new Float32Array(cap);
    this.mode = new Uint8Array(cap); // 0 fade, 1 shrink, 2 grow (smoke)
  }

  emit(x, y, z, vx, vy, vz, life, size, color, intensity = 1, drag = 0, grav = 0, mode = 0) {
    if (this.n >= this.cap) return;
    const i = this.n++, i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.col[i3] = color.r * intensity; this.col[i3 + 1] = color.g * intensity; this.col[i3 + 2] = color.b * intensity;
    this.life[i] = life; this.max[i] = life; this.size0[i] = size; this.siz[i] = size;
    this.drag[i] = drag; this.grav[i] = grav; this.mode[i] = mode; this.alp[i] = 1;
  }

  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const i3 = i * 3;
      if (this.drag[i]) { const k = Math.exp(-this.drag[i] * dt); this.v[i3] *= k; this.v[i3 + 1] *= k; this.v[i3 + 2] *= k; }
      this.v[i3 + 1] -= this.grav[i] * dt;
      this.pos[i3] += this.v[i3] * dt; this.pos[i3 + 1] += this.v[i3 + 1] * dt; this.pos[i3 + 2] += this.v[i3 + 2] * dt;
      const k = this.life[i] / this.max[i];
      const m = this.mode[i];
      if (m === 1) { this.siz[i] = this.size0[i] * (0.2 + 0.8 * k); this.alp[i] = Math.min(1, k * 2); }
      else if (m === 2) { this.siz[i] = this.size0[i] * (1.8 - 0.8 * k); this.alp[i] = k * 0.55; }
      else this.alp[i] = k;
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'color', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    for (let k = 0; k < 3; k++) { this.pos[i3 + k] = this.pos[j3 + k]; this.v[i3 + k] = this.v[j3 + k]; this.col[i3 + k] = this.col[j3 + k]; }
    this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.size0[i] = this.size0[j]; this.siz[i] = this.siz[j];
    this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j]; this.mode[i] = this.mode[j]; this.alp[i] = this.alp[j];
  }

  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

// ═════════════════════════ Effects facade ═════════════════════════
const _c = new THREE.Color();
const col = (hex) => _c.set(hex);

const Fx = {
  init(scene) {
    this.scene = scene;
    this.glow = new ParticleSystem(scene, 6000, true);
    this.smokeSys = new ParticleSystem(scene, 1500, false);
    // debris shards
    this.debrisMax = 260;
    const dg = new THREE.BoxGeometry(0.22, 0.08, 0.3);
    this.debrisMesh = new THREE.InstancedMesh(dg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.6, emissive: 0x220a04 }), this.debrisMax);
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.castShadow = false;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.count = 0;
    scene.add(this.debrisMesh);
    this.debris = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    // light pool (fixed count → no shader recompiles)
    this.lights = [];
    for (let i = 0; i < 8; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 14, 2);
      l.userData = { life: 0, max: 1, base: 0 };
      scene.add(l);
      this.lights.push(l);
    }
    this.lightIdx = 0;
    // lightning / tracer lines
    this.bolts = [];
    this.shake = 0;
    this.damage = 0;
    this.tintAmt = 0; this.tint = new THREE.Color();
  },

  clear() {
    this.glow.clear(); this.smokeSys.clear();
    this.debris.length = 0; this.debrisMesh.count = 0;
    for (const b of this.bolts) this.scene.remove(b.line);
    this.bolts.length = 0;
    for (const l of this.lights) { l.intensity = 0; l.userData.life = 0; }
    this.shake = 0; this.damage = 0; this.tintAmt = 0;
  },

  flashLight(x, y, z, hex, intensity, range = 14, life = 0.15) {
    const l = this.lights[this.lightIdx++ % this.lights.length];
    l.position.set(x, y, z); l.color.set(hex); l.distance = range;
    l.userData.life = life; l.userData.max = life; l.userData.base = intensity;
    l.intensity = intensity;
  },

  spark(x, y, z, dx, dy, dz, spd, hex, life = 0.35, size = 0.12, intensity = 3) {
    this.glow.emit(x, y, z, dx * spd, dy * spd, dz * spd, life, size, col(hex), intensity, 2.5, 9, 1);
  },

  sparks(x, y, z, n, hex, spd = 8, nx = 0, ny = 1, nz = 0, spread = 1) {
    for (let i = 0; i < n; i++) {
      let dx = nx + rand(-spread, spread), dy = ny + rand(-spread, spread), dz = nz + rand(-spread, spread);
      const l = Math.hypot(dx, dy, dz) || 1;
      this.spark(x, y, z, dx / l, dy / l, dz / l, spd * rand(0.4, 1.2), Math.random() < 0.3 ? '#ffffff' : hex, rand(0.15, 0.45), rand(0.06, 0.14), 4);
    }
  },

  glowBurst(x, y, z, hex, size, life, intensity = 3) {
    this.glow.emit(x, y, z, 0, 0, 0, life, size, col(hex), intensity, 0, 0, 1);
  },

  trail(x, y, z, hex, size = 0.3, life = 0.25, intensity = 2.5) {
    this.glow.emit(x, y, z, rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3), life, size, col(hex), intensity, 0, 0, 1);
  },

  smoke(x, y, z, size = 1, life = 1.2, vx = 0, vy = 1.2, vz = 0, hex = '#2a2c34') {
    this.smokeSys.emit(x, y, z, vx, vy, vz, life, size, col(hex), 1, 1.2, -0.3, 2);
  },

  muzzle(x, y, z, hex) {
    this.glowBurst(x, y, z, hex, 0.5, 0.06, 5);
    this.flashLight(x, y, z, hex, 25, 8, 0.06);
  },

  explosion(x, y, z, hex, scale = 1) {
    this.glowBurst(x, y, z, '#ffffff', 2.2 * scale, 0.18, 6);
    this.glowBurst(x, y, z, hex, 4 * scale, 0.45, 3);
    const n = Math.round(26 * scale);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), e = rand(-0.3, 1.2), s = rand(6, 18) * Math.sqrt(scale);
      this.spark(x, y, z, Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e), s, Math.random() < 0.35 ? '#fff2c0' : hex, rand(0.3, 0.8), rand(0.08, 0.18), 5);
    }
    for (let i = 0; i < Math.round(12 * scale); i++) {
      const a = rand(0, TAU), s = rand(1, 6) * Math.sqrt(scale);
      this.glow.emit(x, y, z, Math.cos(a) * s, rand(0, 4), Math.sin(a) * s, rand(0.35, 0.8), rand(0.8, 1.6) * scale, col(pick(['#ffb347', '#ff6a3d', hex])), 2.5, 3, -1, 1);
    }
    for (let i = 0; i < Math.round(8 * scale); i++) {
      this.smoke(x + rand(-0.5, 0.5) * scale, y + rand(0, 0.6), z + rand(-0.5, 0.5) * scale, rand(1.5, 3) * scale, rand(1.2, 2.2), rand(-1.5, 1.5), rand(1, 3), rand(-1.5, 1.5));
    }
    this.debrisBurst(x, y, z, hex, Math.round(8 * scale));
    this.flashLight(x, y + 1, z, hex, 180 * scale, 22 * scale, 0.35);
  },

  shockRing(x, y, z, hex, radius, n = 40) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      this.glow.emit(x, y, z, Math.cos(a) * radius * 2.5, 0.3, Math.sin(a) * radius * 2.5, 0.4, 0.5, col(hex), 3, 3, 0, 1);
    }
  },

  debrisBurst(x, y, z, hex, n) {
    for (let i = 0; i < n; i++) {
      if (this.debris.length >= this.debrisMax) this.debris.shift();
      const a = rand(0, TAU), s = rand(3, 9);
      this.debris.push({
        x, y, z, vx: Math.cos(a) * s, vy: rand(4, 10), vz: Math.sin(a) * s,
        rx: rand(0, TAU), ry: rand(0, TAU), vr: rand(-12, 12), life: rand(1.8, 3.2), max: 3,
        color: new THREE.Color(hex).lerp(new THREE.Color('#333844'), 0.55), scale: rand(0.7, 1.8),
      });
    }
  },

  bolt(x1, y1, z1, x2, y2, z2, hex, life = 0.15) {
    const segs = Math.max(4, Math.floor(Math.hypot(x2 - x1, y2 - y1, z2 - z1) / 1.2));
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, j = i === 0 || i === segs ? 0 : 0.6;
      pts.push(new THREE.Vector3(lerp(x1, x2, t) + rand(-j, j), lerp(y1, y2, t) + rand(-j, j), lerp(z1, z2, t) + rand(-j, j)));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(g, m);
    line.frustumCulled = false;
    this.scene.add(line);
    this.bolts.push({ line, life, max: life });
    for (const p of pts) if (Math.random() < 0.5) this.glowBurst(p.x, p.y, p.z, hex, 0.5, life, 2);
  },

  addShake(a) { this.shake = Math.min(1.2, this.shake + a); },
  hurtFlash(a) { this.damage = Math.min(1, this.damage + a); },
  tintFlash(hex, a) { this.tint.set(hex); this.tintAmt = Math.max(this.tintAmt, a); },

  update(dt, heightAt) {
    this.glow.update(dt);
    this.smokeSys.update(dt);
    // debris physics
    const D = this.debris;
    for (let i = D.length - 1; i >= 0; i--) {
      const d = D[i];
      d.life -= dt;
      if (d.life <= 0) { D.splice(i, 1); continue; }
      d.vy -= 22 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      const gy = heightAt(d.x, d.z) + 0.05;
      if (d.y < gy) { d.y = gy; d.vy = Math.abs(d.vy) * 0.35; d.vx *= 0.6; d.vz *= 0.6; d.vr *= 0.6; }
      d.rx += d.vr * dt; d.ry += d.vr * 0.7 * dt;
    }
    this.debrisMesh.count = D.length;
    for (let i = 0; i < D.length; i++) {
      const d = D[i];
      const s = d.scale * Math.min(1, d.life * 2);
      this._e.set(d.rx, d.ry, 0); this._q.setFromEuler(this._e);
      this._s.set(s, s, s); this._p.set(d.x, d.y, d.z);
      this._m.compose(this._p, this._q, this._s);
      this.debrisMesh.setMatrixAt(i, this._m);
      this.debrisMesh.setColorAt(i, d.color);
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
    // lights
    for (const l of this.lights) {
      const u = l.userData;
      if (u.life > 0) { u.life -= dt; l.intensity = Math.max(0, u.base * (u.life / u.max)); }
      else l.intensity = 0;
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      b.line.material.opacity = Math.max(0, b.life / b.max);
      if (b.life <= 0) { this.scene.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); this.bolts.splice(i, 1); }
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.damage = Math.max(0, this.damage - dt * 1.5);
    this.tintAmt = Math.max(0, this.tintAmt - dt * 2);
  },
};

// ═════════════════════════ Ambient weather around the camera ═════════════════════════
const Weather = {
  init(scene, type, hex) {
    if (this.points) { scene.remove(this.points); this.points.geometry.dispose(); }
    this.type = type;
    const n = type === 'data' ? 300 : 700;
    this.n = n; this.box = 60;
    const pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n);
    this.ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rand(-30, 30); pos[i * 3 + 1] = rand(-5, 30); pos[i * 3 + 2] = rand(-30, 30);
      this.vel[i] = rand(0.5, 1.5); this.ph[i] = rand(0, TAU);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const color = type === 'snow' ? '#ffffff' : type === 'embers' ? '#ff7a2a' : hex;
    const size = type === 'snow' ? 0.18 : type === 'data' ? 0.16 : type === 'embers' ? 0.14 : 0.08;
    const m = new THREE.PointsMaterial({
      color: new THREE.Color(color).multiplyScalar(type === 'snow' ? 1.2 : type === 'dust' ? 0.9 : type === 'data' ? 1.6 : 3),
      size, transparent: true, opacity: type === 'dust' ? 0.5 : 0.85, depthWrite: false,
      blending: type === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
  },
  update(dt, cam, time) {
    if (!this.points) return;
    const p = this.points.geometry.attributes.position.array;
    const B = 30;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      switch (this.type) {
        case 'snow': p[i3 + 1] -= this.vel[i] * 2.2 * dt; p[i3] += Math.sin(time + this.ph[i]) * 0.8 * dt; break;
        case 'embers': p[i3 + 1] += this.vel[i] * 1.6 * dt; p[i3] += Math.sin(time * 1.3 + this.ph[i]) * 1.2 * dt; break;
        case 'data': p[i3 + 1] -= this.vel[i] * 6 * dt; break;
        default: p[i3] += Math.sin(time * 0.3 + this.ph[i]) * 0.4 * dt + 0.3 * dt; p[i3 + 1] += Math.cos(time * 0.4 + this.ph[i]) * 0.2 * dt;
      }
      // wrap within a box centred on the camera
      for (const [k, c, lo, hi] of [[0, cam.x, -B, B], [1, cam.y, -8, 26], [2, cam.z, -B, B]]) {
        const rel = p[i3 + k] - c;
        if (rel < lo) p[i3 + k] += hi - lo; else if (rel > hi) p[i3 + k] -= hi - lo;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  },
};
