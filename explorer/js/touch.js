'use strict';
// Touch controls for phones & tablets: floating move stick, drag-to-look, action buttons, aim assist.
// Everything feeds the same Input object the keyboard/mouse path uses, so gameplay code is shared.

const Touch = {
  enabled: false,
  roles: new Map(), // touch identifier → { role, ... }
  STICK_R: 56,
  LOOK_GAIN: 1.35,

  init() {
    const q = new URLSearchParams(location.search).get('touch');
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    this.enabled = q === '1' || (q !== '0' && (coarse || navigator.maxTouchPoints > 0) && !matchMedia('(pointer: fine)').matches);
    if (!this.enabled) return;

    document.body.classList.add('touch');
    Input.touchMode = true;
    Input.touch = { mx: 0, my: 0, sprint: false };
    this.layer = document.getElementById('touch');
    this.stick = document.getElementById('t-stick');
    this.knob = document.getElementById('t-knob');

    const opts = { passive: false };
    this.layer.addEventListener('touchstart', (e) => this.start(e), opts);
    this.layer.addEventListener('touchmove', (e) => this.move(e), opts);
    this.layer.addEventListener('touchend', (e) => this.end(e), opts);
    this.layer.addEventListener('touchcancel', (e) => this.end(e), opts);
    // stop iOS pinch-zoom / double-tap zoom from hijacking the game
    document.addEventListener('gesturestart', (e) => e.preventDefault(), opts);
    document.addEventListener('dblclick', (e) => e.preventDefault(), opts);
    document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') UI.pause(); });
  },

  // Fullscreen + landscape lock where the browser allows it (Android Chrome; iOS ignores it gracefully).
  goFullscreen() {
    if (!this.enabled) return;
    // keep the screen awake while playing (optional; ignored where not allowed)
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* ignore */ }
    if (document.fullscreenElement) return;
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    } catch (e) { /* not allowed here */ }
  },

  hasRole(role) { for (const r of this.roles.values()) if (r.role === role) return true; return false; },

  start(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const btn = t.target.closest ? t.target.closest('[data-tbtn]') : null;
      if (btn) {
        const k = btn.dataset.tbtn;
        btn.classList.add('down');
        if (k === 'fire') {
          // the fire button doubles as a look pad: hold to shoot, drag to aim
          this.roles.set(t.identifier, { role: 'fire', x: t.clientX, y: t.clientY, el: btn });
          Input.mouse.down = true;
        } else {
          this.roles.set(t.identifier, { role: 'btn', el: btn });
          this.press(k);
        }
        continue;
      }
      if (t.clientX < window.innerWidth * 0.42 && !this.hasRole('move')) {
        this.roles.set(t.identifier, { role: 'move', ox: t.clientX, oy: t.clientY });
        this.stick.style.left = t.clientX + 'px';
        this.stick.style.top = t.clientY + 'px';
        this.knob.style.transform = 'translate(-50%, -50%)';
        this.stick.classList.add('show');
      } else {
        this.roles.set(t.identifier, { role: 'look', x: t.clientX, y: t.clientY });
      }
    }
  },

  move(e) {
    e.preventDefault();
    const R = this.STICK_R;
    for (const t of e.changedTouches) {
      const r = this.roles.get(t.identifier);
      if (!r) continue;
      if (r.role === 'move') {
        let dx = t.clientX - r.ox, dy = t.clientY - r.oy;
        let len = Math.hypot(dx, dy);
        // floating stick: drag the base along if the thumb wanders far past the rim
        if (len > R * 1.7) {
          const k = 1 - (R * 1.7) / len;
          r.ox += dx * k; r.oy += dy * k;
          this.stick.style.left = r.ox + 'px'; this.stick.style.top = r.oy + 'px';
          dx = t.clientX - r.ox; dy = t.clientY - r.oy; len = Math.hypot(dx, dy);
        }
        const cl = Math.min(len, R);
        const nx = len ? dx / len : 0, ny = len ? dy / len : 0;
        this.knob.style.transform = `translate(calc(-50% + ${nx * cl}px), calc(-50% + ${ny * cl}px))`;
        const mag = len < R * 0.14 ? 0 : Math.min(1, (len - R * 0.14) / (R * 0.86));
        Input.touch.mx = nx * mag;
        Input.touch.my = ny * mag;
        Input.touch.sprint = len > R * 1.05 && ny < -0.5;
        this.stick.classList.toggle('sprint', Input.touch.sprint);
      } else if (r.role === 'look' || r.role === 'fire') {
        Input.mouse.dx += (t.clientX - r.x) * this.LOOK_GAIN;
        Input.mouse.dy += (t.clientY - r.y) * this.LOOK_GAIN;
        r.x = t.clientX; r.y = t.clientY;
      }
    }
  },

  end(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const r = this.roles.get(t.identifier);
      if (!r) continue;
      this.roles.delete(t.identifier);
      if (r.role === 'move') this.releaseStick();
      else if (r.role === 'fire') { Input.mouse.down = false; r.el.classList.remove('down'); }
      else if (r.role === 'btn') r.el.classList.remove('down');
    }
  },

  releaseStick() {
    Input.touch.mx = 0; Input.touch.my = 0; Input.touch.sprint = false;
    this.stick.classList.remove('show', 'sprint');
  },

  // drop every active touch (called when an overlay opens mid-gesture)
  reset() {
    if (!this.enabled) return;
    this.roles.clear();
    this.releaseStick();
    Input.mouse.down = false;
    this.layer.querySelectorAll('.down').forEach((b) => b.classList.remove('down'));
  },

  press(k) {
    if (k === 'pause') { UI.pause(); return; }
    const map = { jump: 'Space', dash: 'KeyQ', grenade: 'KeyG', use: 'KeyE', repair: 'KeyR', workshop: 'Tab' };
    if (map[k]) Input.pressed[map[k]] = true;
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (err) { /* ignore */ }
  },

  // per-frame button state (cooldowns, charges, contextual USE button)
  refresh() {
    if (!this.enabled || G.state !== 'playing') return;
    const p = G.player;
    const set = (id, prop, v) => { const el = document.getElementById(id); if (el) el.style.setProperty(prop, v); };
    set('tb-grenade', '--p', Math.min(1, p.energy / 100));
    set('tb-dash', '--p', 1 - Math.max(0, p.dashCd) / p.dashMax);
    document.getElementById('tb-grenade').classList.toggle('ready', p.energy >= 100 || G.cells > 0);
    document.getElementById('tb-repair').dataset.n = G.repairKits;
    document.getElementById('tb-repair').classList.toggle('empty', G.repairKits <= 0);
    const it = !p.dead ? nextInteractable() : null;
    const use = document.getElementById('tb-use');
    use.classList.toggle('avail', !!it);
    use.querySelector('span').textContent = it ? (it.kind === 'cache' ? 'OPEN' : 'UPLINK') : 'USE';
  },
};

// Gentle aim assist for touch: nudges the view toward the enemy nearest the crosshair.
function touchAimAssist(p, dt) {
  const ex = p.pos.x, ey = p.pos.y + p.eye, ez = p.pos.z;
  let best = null, bestA = 0.16, byaw = 0, bpitch = 0;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.pos.x - ex, dy = e.cy - ey, dz = e.pos.z - ez;
    const h = Math.hypot(dx, dz);
    if (h > 70 || h < 1.5) continue;
    const yawT = Math.atan2(-dx, -dz), pitchT = Math.atan2(dy, h);
    const a = Math.hypot(angDiff(p.yaw, yawT) * Math.cos(p.pitch), pitchT - p.pitch);
    if (a < bestA) { bestA = a; best = e; byaw = yawT; bpitch = pitchT; }
  }
  if (!best) return;
  const k = Math.min(1, dt * (Input.mouse.down ? 5 : 1.5));
  p.yaw += angDiff(p.yaw, byaw) * k;
  p.pitch += (bpitch - p.pitch) * k;
}
