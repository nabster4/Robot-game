'use strict';
// The full-world map: a shaded relief drawn from the terrain, hidden under fog of war until you
// explore. Shows home base, boss domes, beacons, shops, discovered caves and secrets, your squad,
// and markers you place yourself (click / tap to add, click a marker to remove it).

const WorldMap = {
  FOG: 64,          // fog cells per side
  RES: 320,         // relief image pixels per side
  MAX_PINS: 12,

  init() {
    this.el = document.getElementById('mapview');
    this.cv = document.getElementById('map-canvas');
    this.g = this.cv.getContext('2d');
    this.fog = new Uint8Array(this.FOG * this.FOG);
    this.fogCv = document.createElement('canvas');
    this.fogCv.width = this.fogCv.height = this.FOG;
    this.cv.addEventListener('pointerdown', (e) => this.click(e));
    document.getElementById('map-close').onclick = () => this.close();
  },

  // shaded relief of the whole world (rebuilt for each new world)
  buildRelief() {
    if (this.reliefSeed === World.seed) { this.attachHolo(); return; }
    this.reliefSeed = World.seed;
    const N = this.RES, cv = this.relief || (this.relief = document.createElement('canvas'));
    cv.width = cv.height = N;
    const g = cv.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    const S = World.size, half = S / 2, step = S / N, col = new THREE.Color();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -half + (i + 0.5) * step, z = -half + (j + 0.5) * step;
      const h = World.heightAt(x, z);
      const hx = World.heightAt(x + step, z) - World.heightAt(x - step, z), hz = World.heightAt(x, z + step) - World.heightAt(x, z - step);
      const slope = Math.hypot(hx, hz) / (2 * step);
      const liq = World.hazardAt(x, z);
      if (liq === LIQUIDS.lava) col.set('#ff5a1a');
      else if (liq) col.set('#2f7fbf').lerp(new THREE.Color('#0c2a4a'), clamp((WORLD.water - h) / 40, 0, 1));
      else World.vertexColor(x, z, h, slope, col);
      // light from the north-west
      const shade = liq ? 1 : clamp(1 + (-hx + -hz) / (2 * step) * 0.6, 0.55, 1.35);
      const k = (i + j * N) * 4;
      d[k] = clamp(col.r * 255 * shade, 0, 255); d[k + 1] = clamp(col.g * 255 * shade, 0, 255); d[k + 2] = clamp(col.b * 255 * shade, 0, 255); d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.tex = null;
    this.attachHolo();
  },
  // the Command Room's holo table shows the same relief
  attachHolo() {
    if (!World.cmdMap || !this.relief) return;
    if (!this.tex) this.tex = new THREE.CanvasTexture(this.relief);
    if (World.cmdMap.material.map !== this.tex) { World.cmdMap.material.map = this.tex; World.cmdMap.material.needsUpdate = true; }
  },

  // ── fog of war ──
  cellOf(x, z) {
    const n = this.FOG, s = World.size / n;
    return [Math.floor((x + World.size / 2) / s), Math.floor((z + World.size / 2) / s)];
  },
  reveal(x, z, r) {
    const n = this.FOG, s = World.size / n;
    const [ci, cj] = this.cellOf(x, z), k = Math.ceil(r / s);
    for (let j = cj - k; j <= cj + k; j++) for (let i = ci - k; i <= ci + k; i++) {
      if (i < 0 || j < 0 || i >= n || j >= n || this.fog[j * n + i]) continue;
      const cx = -World.size / 2 + (i + 0.5) * s, cz = -World.size / 2 + (j + 0.5) * s;
      if (Math.hypot(cx - x, cz - z) < r) { this.fog[j * n + i] = 1; this.dirty = true; }
    }
  },
  seen(x, z) {
    const [i, j] = this.cellOf(x, z), n = this.FOG;
    return i >= 0 && j >= 0 && i < n && j < n && this.fog[j * n + i] === 1;
  },
  explored() { let n = 0; for (const v of this.fog) n += v; return n / this.fog.length; },
  packFog() {
    let s = '';
    for (let i = 0; i < this.fog.length; i += 8) {
      let b = 0;
      for (let k = 0; k < 8; k++) b |= (this.fog[i + k] ? 1 : 0) << k;
      s += String.fromCharCode(b);
    }
    return btoa(s);
  },
  load(str) {
    this.fog.fill(0);
    this.dirty = true;
    if (!str) return;
    try {
      const s = atob(str);
      for (let i = 0; i < s.length; i++) { const b = s.charCodeAt(i); for (let k = 0; k < 8; k++) this.fog[i * 8 + k] = (b >> k) & 1; }
    } catch (e) { /* corrupt fog: start unexplored */ }
  },

  // ── overlay ──
  open() {
    if (G.state !== 'playing') return;
    this.buildRelief();
    G.state = 'map';
    Input.mouse.down = false;
    Input.unlock();
    Touch.reset();
    this.el.classList.add('show');
    $('hud').classList.remove('show');
    Sound.play('click');
    this.resize();
    this.draw();
    Story.event('map');
  },
  close() {
    if (G.state !== 'map') return;
    G.state = 'playing';
    this.el.classList.remove('show');
    UI.hideAll();
    Input.lock(canvas);
  },
  resize() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
    this.dpr = dpr;
  },
  // map rectangle inside the canvas (square, centred)
  frame() {
    const w = this.cv.width, h = this.cv.height, s = Math.min(w, h) - 16 * this.dpr;
    return { x0: (w - s) / 2, y0: (h - s) / 2, s };
  },
  toMap(x, z) { const F = this.frame(); return [F.x0 + (x / World.size + 0.5) * F.s, F.y0 + (z / World.size + 0.5) * F.s]; },
  toWorld(px, py) { const F = this.frame(); return [((px - F.x0) / F.s - 0.5) * World.size, ((py - F.y0) / F.s - 0.5) * World.size]; },

  click(e) {
    const r = this.cv.getBoundingClientRect();
    const px = (e.clientX - r.left) * this.dpr, py = (e.clientY - r.top) * this.dpr;
    const [x, z] = this.toWorld(px, py);
    if (Math.abs(x) > World.size / 2 || Math.abs(z) > World.size / 2) return;
    const pins = G.progress.world.pins;
    const hitR = 22 * World.size / this.frame().s * this.dpr;
    const i = pins.findIndex((p) => Math.hypot(p.x - x, p.z - z) < hitR);
    if (i >= 0) { pins.splice(i, 1); Sound.play('click'); }
    else if (pins.length >= this.MAX_PINS) { Sound.play('deny'); UI.feed(`You can place up to ${this.MAX_PINS} markers — remove one first`, '#ff9f43'); }
    else { pins.push({ x: Math.round(x), z: Math.round(z), c: PIN_COLORS[pins.length % PIN_COLORS.length] }); Sound.play('pickup'); }
    this.draw();
  },

  draw() {
    const g = this.g, F = this.frame(), dpr = this.dpr || 1;
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.relief, F.x0, F.y0, F.s, F.s);
    // fog
    if (this.dirty) {
      const fg = this.fogCv.getContext('2d'), n = this.FOG, img = fg.createImageData(n, n);
      for (let i = 0; i < n * n; i++) { img.data[i * 4] = 10; img.data[i * 4 + 1] = 16; img.data[i * 4 + 2] = 28; img.data[i * 4 + 3] = this.fog[i] ? 0 : 238; }
      fg.putImageData(img, 0, 0);
      this.dirty = false;
    }
    g.drawImage(this.fogCv, F.x0, F.y0, F.s, F.s);
    g.strokeStyle = 'rgba(60,242,255,0.5)'; g.lineWidth = 2 * dpr; g.strokeRect(F.x0, F.y0, F.s, F.s);
    // grid
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
    for (let k = 1; k < 8; k++) {
      const t = F.x0 + (k / 8) * F.s, u = F.y0 + (k / 8) * F.s;
      g.beginPath(); g.moveTo(t, F.y0); g.lineTo(t, F.y0 + F.s); g.moveTo(F.x0, u); g.lineTo(F.x0 + F.s, u); g.stroke();
    }
    const fs = (px) => Math.round(px * dpr);
    const label = (txt, x, y, color, size = 12, weight = 700) => {
      g.font = `${weight} ${fs(size)}px Rajdhani, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 3 * dpr; g.strokeStyle = 'rgba(5,8,14,0.85)'; g.strokeText(txt, x, y); g.fillStyle = color; g.fillText(txt, x, y);
    };
    // region names where you've been
    TERRA.forEach((T, i) => { if (this.seen(T.cx, T.cz)) { const [x, y] = this.toMap(T.cx, T.cz); label(REGIONS.terra[i].name.toUpperCase(), x, y - fs(26), REGIONS.terra[i].accent, 13, 900); } });
    if (this.seen(SKY_REGION.x, SKY_REGION.z)) {
      const [x, y] = this.toMap(SKY_REGION.x, SKY_REGION.z), rr = SKY_REGION.r / World.size * F.s;
      g.setLineDash([6 * dpr, 6 * dpr]); g.strokeStyle = 'rgba(255,225,77,0.6)'; g.lineWidth = 1.5 * dpr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.stroke(); g.setLineDash([]);
      label('SKY ISLANDS (HIGH ABOVE)', x, y - rr - fs(10), '#ffe14d', 12, 900);
    }
    const icon = (x, z, draw, always) => { if (!always && !this.seen(x, z)) return; const [px, py] = this.toMap(x, z); draw(px, py); };
    // home
    icon(World.home.x, World.home.z, (x, y) => {
      g.fillStyle = '#3cf2ff'; g.beginPath(); g.moveTo(x, y - fs(9)); g.lineTo(x + fs(9), y); g.lineTo(x + fs(6), y); g.lineTo(x + fs(6), y + fs(7)); g.lineTo(x - fs(6), y + fs(7)); g.lineTo(x - fs(6), y); g.lineTo(x - fs(9), y); g.closePath(); g.fill();
      label('HOME', x, y + fs(17), '#3cf2ff', 12, 900);
    }, true);
    // villages
    for (const v of World.villages || []) icon(v.x, v.z, (x, y) => {
      g.fillStyle = v.V.color; g.beginPath(); g.arc(x, y, fs(7), 0, TAU); g.fill();
      g.fillStyle = '#05060a'; g.beginPath(); g.moveTo(x, y - fs(4.5)); g.lineTo(x + fs(4.5), y); g.lineTo(x + fs(3), y); g.lineTo(x + fs(3), y + fs(4)); g.lineTo(x - fs(3), y + fs(4)); g.lineTo(x - fs(3), y); g.lineTo(x - fs(4.5), y); g.closePath(); g.fill();
      label(v.name, x, y - fs(14), v.V.color, 12, 900);
    });
    // sunken wrecks you've seen (an anchor), with the depth you'll need to reach them
    for (const w of World.wrecks || []) icon(w.x, w.z, (x, y) => {
      g.strokeStyle = '#7fd8e8'; g.lineWidth = 2 * dpr; g.beginPath();
      g.moveTo(x, y - fs(6)); g.lineTo(x, y + fs(5)); g.moveTo(x - fs(5), y + fs(1)); g.quadraticCurveTo(x, y + fs(9), x + fs(5), y + fs(1)); g.moveTo(x - fs(3), y - fs(3)); g.lineTo(x + fs(3), y - fs(3)); g.stroke();
      label(`${Math.round(w.depth)} m`, x, y + fs(15), '#7fd8e8', 10, 700);
    });
    // the ways to the Wardens: the ice grotto, the summit route, the cooling bridge, the Sky Lift
    const tag = (o, text, color, always) => { if (o) icon(o.x, o.z, (x, y) => { g.fillStyle = color; g.beginPath(); g.arc(x, y, fs(4), 0, TAU); g.fill(); label(text, x, y + fs(12), color, 11, 900); }, always); };
    tag(World.grotto, 'ICE GROTTO', '#8ae9ff');
    tag(World.summit, 'SUMMIT ROUTE', '#ffcf6a');
    if (World.bridge && World.bridge.group.visible) tag(World.bridge, 'COOLING BRIDGE', '#3cf2ff');
    if (World.lift) tag(World.lift, Wardens.liftReady() ? 'SKY LIFT · READY' : 'SKY LIFT', '#ffe14d', true);
    // village quest goals
    for (const q of Villages.sides()) if (!q.done && q.target) icon(q.target.x, q.target.z, (x, y) => { this.star(g, x, y, fs(6), '#ffe9a0'); label(q.target.label, x, y + fs(13), '#ffe9a0', 11, 700); }, true);
    // beacons
    for (const b of World.beacons) icon(b.x, b.z, (x, y) => {
      g.fillStyle = b.state === 'done' ? '#6bff9e' : '#ffb347';
      g.beginPath(); g.moveTo(x, y - fs(6)); g.lineTo(x + fs(5), y); g.lineTo(x, y + fs(6)); g.lineTo(x - fs(5), y); g.closePath(); g.fill();
    });
    // boss domes (always marked: the Wardens are what the story is about)
    for (const A of World.arenas) {
      const beaten = G.progress.beaten[A.i];
      icon(A.x, A.z, (x, y) => {
        g.fillStyle = beaten ? '#6a7a8a' : A.color; g.beginPath(); g.arc(x, y, fs(8), 0, TAU); g.fill();
        g.fillStyle = '#05060a'; g.fillRect(x - fs(4), y - fs(2), fs(3), fs(3)); g.fillRect(x + fs(1), y - fs(2), fs(3), fs(3));
        if (beaten) { g.strokeStyle = '#6bff9e'; g.lineWidth = 2.5 * dpr; g.beginPath(); g.moveTo(x - fs(6), y); g.lineTo(x - fs(1), y + fs(5)); g.lineTo(x + fs(8), y - fs(6)); g.stroke(); }
        const done = A.beacons.filter((b) => b.state === 'done').length;
        label(ZONES[A.i].boss.name + (beaten ? ' ✓' : A.sealed ? ` ${done}/${A.beacons.length}` : ' · OPEN'), x, y + fs(16), beaten ? '#9fb3c8' : A.color, 12, 900);
      }, true);
    }
    // caves & secrets you've discovered
    for (const c of World.caves) if (c.found) icon(c.mouth.x, c.mouth.z, (x, y) => {
      g.fillStyle = '#b98cff'; g.beginPath(); g.arc(x, y + fs(2), fs(6), Math.PI, 0); g.lineTo(x + fs(6), y + fs(4)); g.lineTo(x - fs(6), y + fs(4)); g.closePath(); g.fill();
      const left = World.secrets.filter((s) => s.cave === c.id && !s.found).length;
      if (left) label('?', x, y - fs(9), '#ffd23f', 12, 900);
    }, true);
    for (const s of World.secrets) if (s.found) icon(s.x, s.z, (x, y) => { this.star(g, x, y, fs(5), SECRETS[s.type].color); }, true);
    // your markers
    for (const p of G.progress.world.pins) icon(p.x, p.z, (x, y) => {
      g.fillStyle = p.c; g.beginPath(); g.moveTo(x, y); g.lineTo(x - fs(6), y - fs(11)); g.arc(x, y - fs(13), fs(6.5), Math.PI * 0.85, Math.PI * 0.15); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y - fs(13), fs(2.5), 0, TAU); g.fill();
    }, true);
    // squad & player
    for (const c of G.companions) icon(c.pos.x, c.pos.z, (x, y) => { g.fillStyle = c.d.color; g.beginPath(); g.arc(x, y, fs(3), 0, TAU); g.fill(); }, true);
    const p = G.player;
    icon(p.pos.x, p.pos.z, (x, y) => {
      g.save(); g.translate(x, y); g.rotate(-p.yaw + Math.PI);
      g.fillStyle = '#ffffff'; g.strokeStyle = '#05060a'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.moveTo(0, fs(10)); g.lineTo(fs(7), -fs(7)); g.lineTo(0, -fs(3)); g.lineTo(-fs(7), -fs(7)); g.closePath(); g.stroke(); g.fill();
      g.restore();
    }, true);
    // compass rose
    label('N', F.x0 + F.s / 2, F.y0 + fs(12), '#ff6b6b', 14, 900);
    document.getElementById('map-info').textContent = `${Math.round(this.explored() * 100)}% explored · Wardens freed ${WARDENS.filter((i) => G.progress.beaten[i]).length}/5 · Secrets ${World.secrets.filter((s) => s.found).length}/${World.secrets.length} · Caves ${World.caves.filter((c) => c.found).length}/${World.caves.length}`;
  },

  star(g, x, y, r, color) {
    g.fillStyle = color; g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  },
};
const PIN_COLORS = ['#ff5a7a', '#ffd23f', '#6bff9e', '#3cf2ff', '#b98cff', '#ff9f43'];
