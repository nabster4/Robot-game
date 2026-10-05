'use strict';
// How each Warden is reached. Only Brambleback keeps the beacons-and-dome approach; the others ask for
// something different:
//   Glacieros  · a Frost Key, sealed in an ice grotto behind a light-and-mirror puzzle
//   Colossus   · a summit ringed by sheer cliffs — climb the marked route, resting on its ledges
//   Infernus   · an island in a lava moat too hot for any boots — Ashby in Cinderwell builds a cooling bridge
//   Deepsong   · the bottom of the Drowned Trench — a Mk III pressure hull gets you there
//   Stormwing  · the citadel above the Sky Islands — the Sky Lift at home base reads Rivet's core,
//                and only wakes once all five Wardens are free
const ARENA_MODE = ['beacons', 'key', 'climb', 'bridge', 'lift', 'trench'];

// the grotto puzzle, in the grotto's own coordinates (x right, z forward); mirrors are '/' (0) or '\' (1)
const GROTTO = {
  r: 11,
  emitter: { x: -8.5, z: -6, dx: 1, dz: 0 },
  mirrors: [{ x: -2, z: -6, start: 1 }, { x: -2, z: 2, start: 1 }, { x: 5, z: 2, start: 0 }],
  receptor: { x: 5, z: -5.5 },
  key: { x: 1.5, z: -2 },
};

const Wardens = {
  // shape the landmarks before the heights are computed
  plan(W, flats) {
    const flatOf = (A) => flats.find((f) => f.x === A.x && f.z === A.z);
    for (const A of W.arenaPlans) {
      A.mode = ARENA_MODE[A.i];
      const f = flatOf(A);
      if (A.i === 2 && f) {
        // the Colossus waits on a summit raised well above its surroundings, ringed by cliffs
        let top = -1e9;
        for (let a = 0; a < TAU; a += TAU / 12) for (const r of [0, 25, 50]) top = Math.max(top, Terra.raw(A.x + Math.cos(a) * r, A.z + Math.sin(a) * r));
        f.h = Math.min(top + 34, 215); f.cliff = true; A.y = f.h;
      }
      if (A.i === 3 && f) flats.push({ x: A.x, z: A.z, ring: [38, 54], h: WORLD.lava - 4, r: 60 });
      if (A.i === 1) {
        // the ice grotto sits a short walk from Glacieros's dome
        for (let t = 0; t < 200; t++) {
          const a = rand(0, TAU), d = rand(70, 120), x = A.x + Math.cos(a) * d, z = A.z + Math.sin(a) * d;
          const h = Terra.raw(x, z);
          if (h < WORLD.water + 3 || Terra.weights(x, z)[1] < 0.4 || flats.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + 22)) continue;
          flats.push({ x, z, r: 16, h });
          W.grottoPlan = { x, z };
          break;
        }
      }
    }
  },

  build(W) {
    W.ledges = []; W.mirrors = [];
    W.grotto = null; W.bridge = null; W.lift = null; W.summit = null;
    for (const A of W.arenas) {
      A.mode = ARENA_MODE[A.i];
      if (A.mode === 'climb') this.buildRoute(W, A);
      if (A.mode === 'bridge') this.buildBridge(W, A);
    }
    if (W.grottoPlan) this.buildGrotto(W, W.grottoPlan);
    this.buildLift(W);
  },

  // ═════════════════════════ Glacieros: the ice grotto ═════════════════════════
  buildGrotto(W, P) {
    const y = W.heightAt(P.x, P.z), ice = new THREE.MeshStandardMaterial({ color: '#cdefff', emissive: '#3a8ab8', emissiveIntensity: 0.35, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.82, flatShading: true });
    const S = new THREE.Group(); S.position.set(P.x, y, P.z); W.group.add(S);
    const D = new THREE.Group(); D.position.set(P.x, y, P.z); W.group.add(D);
    const G2 = { x: P.x, z: P.z, y, D, beams: [] };
    W.grotto = G2;
    // a ring of ice walls with an entrance on the +z side
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * TAU;
      if (Math.abs(angDiff(a, Math.PI / 2)) < 0.28) continue;
      const x = Math.cos(a) * GROTTO.r, z = Math.sin(a) * GROTTO.r, h = rand(4.5, 7);
      const m = mesh(Geo.box(2.6, h, 1.2), ice, x, h / 2, z, S); m.rotation.y = -a + Math.PI / 2;
      W.addCollider(P.x + x, P.z + z, 1.3, y + h, 'wall');
    }
    mesh(Geo.cyl(GROTTO.r, GROTTO.r, 0.15, 28), Mat.std('#e8f4ff', { rough: 0.3, metal: 0.1 }), 0, 0.05, 0, S).receiveShadow = true;
    const lbl = W.makeLabel('ICE GROTTO', '#8ae9ff', 512, 100); lbl.position.set(P.x, y + 8.5, P.z + 2); lbl.scale.set(4, 0.8, 1); W.group.add(lbl);
    // the light source, the receptor, the mirrors, and the key frozen in ice
    const L = (o) => ({ x: P.x + o.x, z: P.z + o.z });
    const em = L(GROTTO.emitter);
    mesh(Geo.cyl(0.4, 0.5, 1.2, 8), Mat.std('#2a3444', { metal: 0.6 }), GROTTO.emitter.x, 0.6, GROTTO.emitter.z, S);
    mesh(Geo.oct(0.4), Mat.glow('#fff1a8', 4), GROTTO.emitter.x, 1.5, GROTTO.emitter.z, D);
    W.addCollider(em.x, em.z, 0.6, y + 1.6, 'wall');
    const rc = L(GROTTO.receptor);
    mesh(Geo.cyl(0.45, 0.55, 1, 8), Mat.std('#2a3444', { metal: 0.6 }), GROTTO.receptor.x, 0.5, GROTTO.receptor.z, S);
    G2.receptor = mesh(Geo.oct(0.5), Mat.std('#4a6a8a', { rough: 0.2, metal: 0.4, emissive: '#3cf2ff', ei: 0.2 }), GROTTO.receptor.x, 1.5, GROTTO.receptor.z, D);
    G2.receptor.scale.y = 1.5;
    W.addCollider(rc.x, rc.z, 0.6, y + 1.6, 'wall');
    for (const [i, m0] of GROTTO.mirrors.entries()) {
      const g = new THREE.Group(); g.position.set(m0.x, 0, m0.z); D.add(g);
      mesh(Geo.cyl(0.45, 0.55, 0.9, 8), Mat.std('#2a3444', { metal: 0.6 }), 0, 0.45, 0, g);
      const plate = new THREE.Group(); plate.position.y = 1.5; g.add(plate);
      mesh(Geo.box(1.6, 1.2, 0.08), Mat.std('#e8f6ff', { rough: 0.02, metal: 1 }), 0, 0, 0, plate);
      mesh(Geo.box(1.7, 0.06, 0.12), Mat.glow('#8ae9ff', 2.2), 0, -0.62, 0, plate);
      const mm = Object.assign(L(m0), { y, i, plate, state: m0.start, lx: m0.x, lz: m0.z });
      W.mirrors.push(mm);
      W.addCollider(mm.x, mm.z, 0.5, y + 2.1, 'wall');
    }
    G2.block = mesh(Geo.box(1.8, 2.2, 1.8), ice, GROTTO.key.x, 1.1, GROTTO.key.z, D);
    G2.keyModel = new THREE.Group(); G2.keyModel.position.set(GROTTO.key.x, 1.2, GROTTO.key.z); D.add(G2.keyModel);
    mesh(Geo.torus(0.25, 0.07, 16), Mat.glow('#8ae9ff', 3), 0, 0.35, 0, G2.keyModel);
    mesh(Geo.box(0.1, 0.6, 0.1), Mat.glow('#8ae9ff', 3), 0, -0.05, 0, G2.keyModel);
    mesh(Geo.box(0.25, 0.08, 0.1), Mat.glow('#8ae9ff', 3), 0.12, -0.25, 0, G2.keyModel);
    G2.key = L(GROTTO.key);
    G2.blockCol = W.addCollider(G2.key.x, G2.key.z, 1.1, y + 2.2, 'wall');
    for (let k = 0; k < 6; k++) { const b = makeBeam('#fff1a8', 4, 0.07, 0.9); W.group.add(b); G2.beams.push(b); }
    this.bake(W, S);
  },
  bake(W, g) { W.bake(g); },
  setMirror(m, state) { m.state = state; m.plate.rotation.y = state ? Math.PI / 4 : -Math.PI / 4; },

  // trace the light from the emitter across the mirrors; returns true if it reaches the receptor
  traceBeam() {
    const G2 = World.grotto;
    if (!G2) return false;
    let x = GROTTO.emitter.x, z = GROTTO.emitter.z, dx = GROTTO.emitter.dx, dz = GROTTO.emitter.dz;
    const segs = [];
    let hit = false;
    for (let bounce = 0; bounce < 6; bounce++) {
      let best = null, bt = 1e9;
      for (const m of World.mirrors) {
        const t = (m.lx - x) * dx + (m.lz - z) * dz;
        if (t < 0.4) continue;
        const off = Math.abs((m.lx - x) * dz - (m.lz - z) * dx);
        if (off < 0.5 && t < bt) { bt = t; best = m; }
      }
      const R = GROTTO.receptor, tr = (R.x - x) * dx + (R.z - z) * dz, roff = Math.abs((R.x - x) * dz - (R.z - z) * dx);
      if (tr > 0.4 && roff < 0.55 && tr < bt) { segs.push([x, z, R.x, R.z]); hit = true; break; }
      if (!best) {
        // run on to the grotto wall
        const b2 = x * dx + z * dz, c = x * x + z * z - (GROTTO.r - 0.6) ** 2, t = -b2 + Math.sqrt(Math.max(0, b2 * b2 - c));
        segs.push([x, z, x + dx * t, z + dz * t]);
        break;
      }
      segs.push([x, z, best.lx, best.lz]);
      x = best.lx; z = best.lz;
      // '/' swaps x and z; '\' swaps and flips
      const ndx = best.state === 0 ? dz : -dz, ndz = best.state === 0 ? dx : -dx;
      dx = ndx; dz = ndz;
    }
    const y = G2.y + 1.5;
    G2.beams.forEach((b, i) => { const s = segs[i]; if (!s) { b.visible = false; return; } setBeam(b, G2.x + s[0], y, G2.z + s[1], G2.x + s[2], y, G2.z + s[3]); });
    return hit;
  },

  // ═════════════════════════ Colossus: the summit route ═════════════════════════
  buildRoute(W, A) {
    // the route climbs the cliff on the side facing home base
    const L = Math.hypot(A.x, A.z) || 1, ux = -A.x / L, uz = -A.z / L;
    let foot = A.r + 14;
    for (let d = A.r + 4; d < A.r + 40; d += 0.5) { if (W.slopeAt(A.x + ux * d, A.z + uz * d) < 0.5 && W.heightAt(A.x + ux * d, A.z + uz * d) < A.y - 12) { foot = d; break; } }
    const base = W.heightAt(A.x + ux * foot, A.z + uz * foot);
    const rock = Mat.std('#6a5e52', { rough: 0.95 }), flag = Mat.glow('#ffcf6a', 3);
    // a ledge every ~9 m of height, sticking out of the cliff face
    for (let hh = base + 8; hh < A.y - 3; hh += 9) {
      let d = A.r;
      for (let q = A.r; q < foot; q += 0.25) { if (W.heightAt(A.x + ux * q, A.z + uz * q) < hh) { d = q; break; } }
      const x = A.x + ux * (d + 0.9), z = A.z + uz * (d + 0.9);
      Batch.add(Geo.box(2.6, 0.5, 2.2), rock, x, hh - 0.25, z, 1, 1, 1, 0, Math.atan2(ux, uz), 0);
      Batch.add(Geo.cyl(0.05, 0.05, 1.6, 4), Mat.std('#2a2a30', { metal: 0.6 }), x + ux * 0.6, hh + 0.8, z + uz * 0.6);
      Batch.add(Geo.box(0.6, 0.35, 0.04), flag, x + ux * 0.6 + 0.3, hh + 1.4, z + uz * 0.6, 1, 1, 1, 0, Math.atan2(ux, uz) + Math.PI / 2, 0, false);
      W.addCollider(x, z, 1.2, hh, 'rock', hh - 0.6);
      W.ledges.push({ x, z, y: hh });
    }
    const sx = A.x + ux * (foot + 3), sz = A.z + uz * (foot + 3), sy = W.heightAt(sx, sz);
    const sign = W.makeLabel('SUMMIT ROUTE', '#ffcf6a', 512, 100); sign.position.set(sx, sy + 3.5, sz); sign.scale.set(3.6, 0.7, 1); W.group.add(sign);
    Batch.add(Geo.cyl(0.1, 0.12, 3, 6), Mat.std('#2a2a30', { metal: 0.6 }), sx, sy + 1.5, sz);
    W.summit = { x: sx, z: sz, y: sy, arena: A };
  },
  // climbing next to a ledge lets you rest
  restingAt(p) {
    for (const l of World.ledges || []) if (Math.hypot(l.x - p.pos.x, l.z - p.pos.z) < 2.4 && Math.abs(p.pos.y - l.y) < 1.6) return l;
    return null;
  },

  // ═════════════════════════ Infernus: the moat and Ashby's cooling bridge ═════════════════════════
  buildBridge(W, A) {
    const v = W.villages && W.villages.find((q) => q.i === 3);
    const tx = v ? v.x - A.x : -A.x, tz = v ? v.z - A.z : -A.z, L = Math.hypot(tx, tz) || 1, ux = tx / L, uz = tz / L;
    const g = new THREE.Group(); W.group.add(g);
    const basalt = Mat.std('#1e1a1c', { rough: 0.85, metal: 0.2 }), cool = Mat.glow('#3cf2ff', 2.2);
    const outer = W.heightAt(A.x + ux * 62, A.z + uz * 62);
    const cols = [];
    for (let d = A.r + 4; d <= 62; d += 2) {
      const k = clamp((d - (A.r + 4)) / (62 - A.r - 4), 0, 1), y = lerp(A.y, outer, k) + 0.15;
      const x = A.x + ux * d, z = A.z + uz * d;
      const s = mesh(Geo.box(3.6, 0.6, 2.2), basalt, x, y - 0.3, z, g); s.rotation.y = Math.atan2(ux, uz);
      mesh(Geo.box(0.12, 0.62, 2.2), cool, x - uz * 1.6, y - 0.3, z + ux * 1.6, g).rotation.y = Math.atan2(ux, uz);
      mesh(Geo.box(0.12, 0.62, 2.2), cool, x + uz * 1.6, y - 0.3, z - ux * 1.6, g).rotation.y = Math.atan2(ux, uz);
      for (const s2 of [-0.9, 0.9]) cols.push(Object.assign(W.addCollider(x - uz * s2, z + ux * s2, 1.2, y, 'rock', y - 1.2), { on: y }));
    }
    W.bridge = { group: g, cols, arena: A, x: A.x + ux * 60, z: A.z + uz * 60 };
  },
  setBridge(on) {
    const B = World.bridge;
    if (!B) return;
    B.group.visible = on;
    for (const c of B.cols) c.top = on ? c.on : -1e9;
  },
  // the moat around Infernus's island burns through any boots
  moatAt(x, z) {
    const A = World.bridge && World.bridge.arena;
    if (!A) return false;
    const d = Math.hypot(x - A.x, z - A.z);
    return d > A.r + 3 && d < 60;
  },

  // ═════════════════════════ Stormwing: the Sky Lift ═════════════════════════
  buildLift(W) {
    const x = 15, z = 9, y = W.heightAt(x, z);
    const dark = Mat.std('#1d232d', { metal: 0.7, rough: 0.4 });
    mesh(Geo.cyl(3, 3.3, 0.5, 24), dark, x, y + 0.25, z, W.group).receiveShadow = true;
    const ring = new THREE.Mesh(Geo.torus(2.6, 0.08, 40), Mat.glow('#8a94a8', 1.4)); ring.rotation.x = Math.PI / 2; ring.position.set(x, y + 0.55, z); W.group.add(ring);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; mesh(Geo.box(0.3, 3.4, 0.3), dark, x + Math.cos(a) * 3.1, y + 1.7, z + Math.sin(a) * 3.1, W.group); }
    const col = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 20, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe14d').multiplyScalar(1.5), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    col.position.set(x, y + 30, z); W.group.add(col);
    const lbl = W.makeLabel('SKY LIFT', '#ffe14d', 512, 100); lbl.position.set(x, y + 4.4, z); lbl.scale.set(3.2, 0.6, 1); W.group.add(lbl);
    // where it lands: the rim of the citadel island
    const A = W.arenas.find((a) => a.i === 4);
    let dest = null, back = null;
    if (A) {
      const a = Math.atan2(-A.z, -A.x);
      dest = { x: A.x + Math.cos(a) * 36, z: A.z + Math.sin(a) * 36, y: A.y };
      back = { x: dest.x, z: dest.z, y: A.y };
      const pad = new THREE.Mesh(Geo.torus(1.6, 0.08, 32), Mat.glow('#ffe14d', 2.4)); pad.rotation.x = Math.PI / 2; pad.position.set(dest.x, dest.y + 0.1, dest.z); W.group.add(pad);
    }
    W.lift = { x, z, y, ring, col, lbl, dest, back };
  },
  liftReady() { return WARDENS.every((i) => G.progress.beaten[i]); },
  refreshLift() {
    const L = World.lift;
    if (!L) return;
    const on = this.liftReady();
    L.ring.material = Mat.glow(on ? '#ffe14d' : '#8a94a8', on ? 3 : 1.4);
    L.col.visible = on;
  },
  // home → citadel (or back down)
  ride(up) {
    const L = World.lift, W = G.progress.world;
    if (up && !this.liftReady()) {
      Sound.play('deny');
      const left = WARDENS.filter((i) => !G.progress.beaten[i]).map((i) => ZONES[i].boss.name);
      UI.banner('THE LIFT IS SILENT', `It wakes for a heart the Wardens trust. Still under the Static: ${left.join(', ')}`, '#8a94a8', 3.5);
      return;
    }
    if (up && !W.lift) {
      W.lift = true;
      const A = World.arenas.find((a) => a.i === 4);
      if (A && A.sealed) World.openDome(A);
      Dialog.clear();
      Dialog.say([{ who: 'SKY LIFT', color: '#ffe14d', text: 'CORE SIGNATURE READ. AUREL, FIRST OF THE WARDENS. THE CITADEL REMEMBERS YOU.' }]);
    }
    const D = up ? L.dest : { x: L.x, z: L.z - 3.5, y: L.y };
    Fx.shockRing(G.player.pos.x, G.player.pos.y + 0.3, G.player.pos.z, '#ffe14d', 4, 40);
    G.travelTo(D.x, D.z, D.y + 0.2, up ? 'The Vane Citadel' : 'Home Base');
    saveGame();
  },

  // ═════════════════════════ State ═════════════════════════
  // after loading: open whatever the player has already earned
  apply() {
    const W = G.progress.world;
    for (const m of World.mirrors || []) this.setMirror(m, W.mirrors && W.mirrors[m.i] !== undefined ? W.mirrors[m.i] : GROTTO.mirrors[m.i].start);
    const solved = this.traceBeam();
    const G2 = World.grotto;
    if (G2) {
      G2.block.visible = !solved && !W.frostKey;
      G2.blockCol.top = G2.block.visible ? G2.y + 2.2 : -1e9;
      G2.keyModel.visible = !W.frostKey;
      G2.receptor.material = solved || W.frostKey ? Mat.glow('#8ae9ff', 3) : G2.receptor.material;
    }
    this.setBridge(Villages.questState('cinder') === 'done');
    this.refreshLift();
  },
  // is this Warden's dome open? (beacons are handled with the beacons)
  unlocked(A) {
    const W = G.progress.world;
    switch (A.mode) {
      case 'key': return !!W.frostKey;
      case 'climb': return !!W.summit;
      case 'bridge': return Villages.questState('cinder') === 'done';
      case 'lift': return !!W.lift;
      case 'trench': return true;
      default: return A.beacons.length > 0 && A.beacons.every((b) => b.state === 'done');
    }
  },

  // interactables: mirrors, the frost key, the lift pads
  nearest(p, near) {
    for (const m of World.mirrors || []) near(m.x, m.z, 2, 'mirror', m);
    const G2 = World.grotto;
    if (G2 && G2.keyModel.visible && !G2.block.visible) near(G2.key.x, G2.key.z, 2.4, 'frostkey', G2);
    const L = World.lift;
    if (L) {
      near(L.x, L.z, 3.2, 'lift', { up: true, y: L.y });
      if (L.back && G.progress.world.lift) near(L.back.x, L.back.z, 2.6, 'lift', { up: false, y: L.back.y });
    }
  },
  interact(it) {
    const W = G.progress.world;
    if (it.kind === 'mirror') {
      const m = it.obj;
      this.setMirror(m, 1 - m.state);
      W.mirrors = World.mirrors.map((q) => q.state);
      Sound.play('click');
      if (this.traceBeam() && World.grotto.block.visible) {
        const G2 = World.grotto;
        G2.block.visible = false; G2.blockCol.top = -1e9;
        G2.receptor.material = Mat.glow('#8ae9ff', 3);
        Fx.explosion(G2.key.x, G2.y + 1.2, G2.key.z, '#bff0ff', 1);
        Sound.play('beaconDone');
        UI.banner('THE ICE MELTS', 'The light reached the crystal — take the Frost Key', '#8ae9ff', 3);
      }
    } else if (it.kind === 'frostkey') {
      W.frostKey = true;
      it.obj.keyModel.visible = false;
      const A = World.arenas.find((a) => a.i === 1);
      if (A && A.sealed) World.openDome(A);
      Sound.play('win');
      UI.banner('FROST KEY', "Glacieros's dome answers the key — it is open", '#8ae9ff', 3.5);
      Dialog.say([{ who: 'GLACIEROS', color: '#8ae9ff', text: '…the key… I froze it away from myself, so the Static could not use it. Come, then. Free me.' }]);
      saveGame();
    } else if (it.kind === 'lift') this.ride(it.obj.up);
  },

  // per-frame: the summit opens when you reach it; the lift shimmers
  update(dt, time) {
    const p = G.player, W = G.progress.world;
    if (World.summit && !W.summit && p) {
      const A = World.summit.arena;
      if (Math.hypot(p.pos.x - A.x, p.pos.z - A.z) < A.r + 9 && p.pos.y > A.y - 2.5) {
        W.summit = true;
        if (A.sealed) World.openDome(A);
        Sound.play('win');
        UI.banner('THE SUMMIT', 'You made the climb — the Colossus turns to face you', '#ffcf6a', 3.5);
        saveGame();
      }
    }
    const L = World.lift;
    if (L && L.col.visible) { L.col.material.opacity = 0.12 + 0.06 * Math.sin(time * 3); L.ring.scale.setScalar(1 + 0.04 * Math.sin(time * 5)); }
  },
};
