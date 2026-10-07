'use strict';
// Game controller support (Xbox / PlayStation / most USB and Bluetooth pads in the browser's
// "standard" layout). In play, the pad feeds the same Input object as the keyboard and mouse.
// On menus, shops and the map, it drives an on-screen cursor: left stick moves it, the D-pad hops
// between buttons, A clicks, B goes back and the right stick scrolls.

// standard-layout button indices
const PB = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

// Pick the right words for a prompt: controller, touch or keyboard (in split screen: whatever the
// player whose turn it is plays with).
function ctl(kb, touch, pad) {
  if (Split.on) return Split.usesPad() ? pad : kb;
  return Pad.active ? pad : Touch.enabled ? touch : kb;
}

const Pad = {
  connected: false,
  active: false,            // the last input came from the pad (prompts show pad buttons)
  DEAD: 0.18,               // stick dead zone
  LOOK_SPEED: 1500,         // right-stick turn rate at full tilt, in "mouse pixels" per second (× look sensitivity)
  CURSOR_SPEED: 1100,       // menu cursor speed at full tilt, px/s
  states: new Map(),        // per controller: buttons last frame, keys it holds down, trigger & sprint state
  cx: 0, cy: 0,
  lastState: '',
  hoverEl: null,
  rumbleCd: 0,

  init() {
    this.cursor = document.getElementById('pad-cursor');
    this.toast = document.getElementById('pad-toast');
    this.cx = window.innerWidth / 2; this.cy = window.innerHeight / 2;
    window.addEventListener('gamepadconnected', (e) => this.say(`Controller connected — ${this.shortName(e.gamepad.id)}`));
    window.addEventListener('gamepaddisconnected', (e) => {
      if (Split.lobby) { Split.padGone(e.gamepad.index); return; }
      const c = Split.on && Split.ctxForPad(e.gamepad.index);
      if (c) {
        this.release();
        this.say(`Player ${Split.ctxs.indexOf(c) + 1}'s controller disconnected — reconnect it to carry on`);
        if (G.state === 'playing') UI.pause();
        return;
      }
      if (this.pad()) return;
      this.release();
      this.connected = false;
      this.setActive(false);
      this.say('Controller disconnected');
      if (G.state === 'playing') UI.pause();
    });
    // touching the keyboard or mouse hands the prompts back to them
    window.addEventListener('keydown', () => this.setActive(false));
    document.addEventListener('mousemove', (e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) this.setActive(false); });
  },

  shortName(id) { return (id || 'gamepad').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'gamepad'; },

  say(text) {
    if (!this.toast) return;
    this.toast.textContent = text;
    this.toast.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.toast.classList.remove('show'), 2600);
  },

  setActive(on) {
    if (this.active === on) return;
    this.active = on;
    document.body.classList.toggle('pad', on);
    UI.hotbarDirty = true;
    if (!on) this.showCursor(false);
    else if (G.state !== 'playing') this.snapToFirst();
  },

  pad() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    let best = null;
    for (const g of list) if (g && g.connected && (!best || (g.mapping === 'standard' && best.mapping !== 'standard'))) best = g;
    return best;
  },

  st(key) {
    let s = this.states.get(key);
    if (!s) { s = { prev: [], held: new Set(), firing: false, sprint: false, I: null }; this.states.set(key, s); }
    return s;
  },

  // let go of everything the pads are holding (disconnect, or switching between play and menus)
  release() {
    for (const s of this.states.values()) {
      const I = s.I;
      if (!I) continue;
      for (const k of s.held) I.keys[k] = false;
      s.held.clear();
      if (s.firing) { I.mouse.down = false; s.firing = false; }
      s.sprint = false;
      I.pad = null;
    }
  },

  hold(s, code, on) {
    const I = s.I;
    if (on && !s.held.has(code)) { s.held.add(code); I.keys[code] = true; I.pressed[code] = true; }
    else if (!on && s.held.has(code)) { s.held.delete(code); I.keys[code] = false; }
  },

  stick(x, y) {
    const m = Math.hypot(x, y);
    if (m < this.DEAD) return [0, 0, 0];
    const k = Math.min(1, (m - this.DEAD) / (1 - this.DEAD));
    return [(x / m) * k, (y / m) * k, k];
  },

  rumble(strong, weak, ms) {
    if (this.rumbleCd > 0) return;
    let g;
    if (Split.on) g = Split.padOf(Split.idx);   // the controller of the player who was hit
    else { if (!this.active) return; g = this.pad(); }
    const a = g && g.vibrationActuator;
    if (!a || !a.playEffect) return;
    this.rumbleCd = 0.08;
    try { a.playEffect('dual-rumble', { duration: ms, strongMagnitude: clamp(strong, 0, 1), weakMagnitude: clamp(weak, 0, 1) }).catch(() => {}); } catch (e) { /* not supported */ }
  },

  // called once per frame, before the game reads Input
  poll(dt) {
    this.rumbleCd -= dt;
    // one pad normally; in split screen (and its lobby) every pad, each feeding its own player
    const multi = Split.on || Split.lobby;
    const list = multi ? this.pads() : [this.pad()].filter(Boolean);
    if (!list.length) { if (this.connected) { this.connected = false; this.release(); } return; }
    this.connected = true;

    const state = G.state;
    if (state !== this.lastState) {
      if (state === 'playing' || this.lastState === 'playing') this.release();
      this.lastState = state;
      if (state !== 'playing' && this.active) this.snapToFirst();
    }

    for (const g of list) {
      const s = this.st(multi ? g.index : 'main');
      const bv = (i) => { const b = g.buttons[i]; return b ? (typeof b === 'object' ? b.value : b) : 0; };
      const down = (i) => { const b = g.buttons[i]; return !!b && (b.pressed || bv(i) > 0.35); };
      const now = []; for (let i = 0; i < g.buttons.length; i++) now[i] = down(i);
      const hit = (i) => now[i] && !s.prev[i];
      const ax = (i) => g.axes[i] || 0;
      const L = this.stick(ax(0), ax(1)), R = this.stick(ax(2), ax(3));

      if (now.some((b, i) => b && !s.prev[i]) || L[2] > 0 || R[2] > 0) {
        this.setActive(true);
        if (now.some(Boolean)) Sound.init();
      }

      if (Split.lobby) Split.lobbyPad(g.index, hit);
      else if (state === 'playing') {
        const c = multi ? Split.ctxForPad(g.index) : null;
        if (!multi) { s.I = Input; this.play(s, G.player, now, hit, L, R, dt); }
        else if (c) { s.I = c.input; this.play(s, c.player, now, hit, L, R, dt); }
      } else if (this.active) this.menu(g, now, hit, L, R, dt);
      s.prev = now;
    }
  },

  // every connected controller
  pads() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    return [...list].filter((g) => g && g.connected);
  },

  play(s, p, now, hit, L, R, dt) {
    const I = s.I;
    this.showCursor(false);
    // left stick moves; click it to sprint until you let the stick go
    if (hit(PB.L3)) s.sprint = !s.sprint;
    if (L[2] < 0.25) s.sprint = false;
    I.pad = { mx: L[0], my: L[1], sprint: s.sprint };
    // right stick looks: a curve gives fine aim near the centre and fast turns at full tilt
    if (R[2] > 0) {
      const c = Math.pow(R[2], 1.8) / R[2];
      I.mouse.dx += R[0] * c * this.LOOK_SPEED * dt;
      I.mouse.dy += R[1] * c * this.LOOK_SPEED * 0.7 * dt;
    }
    // fire with the right trigger
    const fire = now[PB.RT];
    if (fire !== s.firing) { s.firing = fire; I.mouse.down = fire; }
    const swimming = p && p.swim;
    this.hold(s, 'Space', now[PB.A]);
    this.hold(s, 'KeyC', swimming && now[PB.B]);
    if (hit(PB.B) && !swimming) I.pressed.KeyQ = true;
    if (hit(PB.X)) I.pressed[document.getElementById('dialog').classList.contains('show') ? 'Enter' : 'KeyE'] = true;
    if (hit(PB.Y)) I.pressed.KeyR = true;
    if (hit(PB.LT)) I.pressed.KeyG = true;
    if (hit(PB.LB) || hit(PB.RB)) I.wheel += hit(PB.RB) ? 1 : -1;
    if (hit(PB.R3) || hit(PB.RIGHT)) I.pressed.KeyV = true;
    if (hit(PB.LEFT)) I.pressed.KeyX = true;
    if (hit(PB.UP)) I.pressed.KeyJ = true;
    if (hit(PB.DOWN)) I.pressed.Tab = true;
    if (hit(PB.BACK)) I.pressed.KeyM = true;
    if (hit(PB.START)) I.pressed.Escape = true;
  },

  // ───────── menus: on-screen cursor ─────────
  showCursor(on) {
    if (!this.cursor) return;
    this.cursor.classList.toggle('show', on);
    if (!on && this.hoverEl) { this.hoverEl.classList.remove('pad-hover'); this.hoverEl = null; }
  },

  clickables() {
    const out = [];
    document.querySelectorAll('button, input[type=range], input[type=checkbox], label, .tab, .slot, [data-travel], [data-tab], .btn').forEach((el) => {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
      if (el.closest('#touch, #hud') && G.state !== 'playing') return;
      if (el.tagName === 'LABEL' && el.querySelector('input[type=range]')) return; // hop to the slider itself
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return;
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (t && (t === el || el.contains(t) || t.contains(el))) out.push({ el, x: r.left + r.width / 2, y: r.top + r.height / 2 });
    });
    return out;
  },

  snapToFirst() {
    // the world map: start in the middle, ready to place a marker
    if (G.state === 'map') { this.cx = window.innerWidth / 2; this.cy = window.innerHeight / 2; return; }
    const c = this.clickables();
    if (!c.length) return;
    // prefer the main action of the screen
    const pref = ['btn-continue', 'btn-start', 'btn-resume', 'btn-retry', 'btn-again', 'ws-continue'];
    const pick = pref.map((id) => c.find((o) => o.el.id === id)).find(Boolean) || c[0];
    this.cx = pick.x; this.cy = pick.y;
  },

  // D-pad: hop to the nearest button in that direction
  hop(dx, dy) {
    let best = null, bs = Infinity;
    for (const o of this.clickables()) {
      const ox = o.x - this.cx, oy = o.y - this.cy;
      const along = ox * dx + oy * dy;
      if (along < 8) continue;
      const across = Math.abs(ox * dy - oy * dx);
      const s = along + across * 2.2;
      if (s < bs) { bs = s; best = o; }
    }
    if (best) { this.cx = best.x; this.cy = best.y; Sound.play('click', null, 0.25); }
  },

  target() {
    const el = document.elementFromPoint(this.cx, this.cy);
    return el ? (el.closest('button, input, label, .tab, .slot, [data-travel], [data-tab], canvas, .btn') || el) : null;
  },

  click() {
    const el = this.target();
    if (!el) return;
    const o = { bubbles: true, cancelable: true, clientX: this.cx, clientY: this.cy, button: 0, pointerType: 'mouse', isPrimary: true };
    if (el.matches('input[type=range]')) {
      const r = el.getBoundingClientRect(), mn = +el.min || 0, mx = +el.max || 100, st = +el.step || 1;
      el.value = Math.round((mn + clamp((this.cx - r.left) / r.width, 0, 1) * (mx - mn)) / st) * st;
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.click();
  },

  nudgeRange(el, dir) {
    const st = +el.step || 1;
    el.value = clamp(+el.value + dir * st, +el.min || 0, +el.max || 100);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  },

  scroll(el, dy) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (n.scrollHeight > n.clientHeight + 2 && /(auto|scroll)/.test(s.overflowY)) { n.scrollTop += dy; return; }
    }
    window.scrollBy(0, dy);
  },

  menu(g, now, hit, L, R, dt) {
    this.showCursor(true);
    if (L[2] > 0) {
      const sp = this.CURSOR_SPEED * (0.25 + 0.75 * L[2] * L[2]) * dt;
      this.cx = clamp(this.cx + L[0] / (L[2] || 1) * L[2] * sp, 2, window.innerWidth - 2);
      this.cy = clamp(this.cy + L[1] / (L[2] || 1) * L[2] * sp, 2, window.innerHeight - 2);
    }
    const tgt = this.target();
    const range = tgt && tgt.matches && tgt.matches('input[type=range]') ? tgt : null;
    if (hit(PB.UP)) this.hop(0, -1);
    if (hit(PB.DOWN)) this.hop(0, 1);
    if (hit(PB.LEFT)) range ? this.nudgeRange(range, -1) : this.hop(-1, 0);
    if (hit(PB.RIGHT)) range ? this.nudgeRange(range, 1) : this.hop(1, 0);
    if (R[2] > 0 && tgt) this.scroll(tgt, R[1] * 900 * dt);
    if (hit(PB.A)) this.click();
    if (hit(PB.B)) {
      if (G.state === 'menu') { const h = document.getElementById('howto'); if (h && !h.classList.contains('hidden')) h.classList.add('hidden'); }
      else Input.pressed.Escape = true;
    }
    if (hit(PB.START) && (G.state === 'paused' || G.state === 'workshop' || G.state === 'map')) Input.pressed.Escape = true;
    if (hit(PB.BACK) && G.state === 'map') Input.pressed.KeyM = true;
    // bumpers flip through the tabs of a workshop or shop screen
    if (hit(PB.LB) || hit(PB.RB)) {
      const tabs = [...document.querySelectorAll('#ws-tabs .tab')].filter((t) => t.offsetParent);
      if (tabs.length) {
        const i = Math.max(0, tabs.findIndex((t) => t.classList.contains('active')));
        tabs[(i + (hit(PB.RB) ? 1 : -1) + tabs.length) % tabs.length].click();
      }
    }
    if (this.cursor) this.cursor.style.transform = `translate(${this.cx}px, ${this.cy}px)`;
    const h = tgt && tgt.matches && tgt.matches('button, input, label, .tab, .slot, [data-travel], [data-tab], .btn') ? tgt : null;
    if (h !== this.hoverEl) {
      if (this.hoverEl) this.hoverEl.classList.remove('pad-hover');
      if (h) h.classList.add('pad-hover');
      this.hoverEl = h;
    }
  },
};
