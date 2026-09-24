'use strict';
const $ = (id) => document.getElementById(id);

const UI = {
  tab: 'companion',
  mode: 'field',
  hintLast: {},
  counts: {},

  // ═════════════════════════ Setup ═════════════════════════
  init() {
    $('btn-start').onclick = () => { Sound.init(); Sound.play('click'); newRun(); Input.lock(canvas); };
    $('btn-howto').onclick = () => { Sound.init(); Sound.play('click'); $('howto').classList.toggle('hidden'); };
    $('btn-resume').onclick = () => this.closeOverlay();
    $('btn-p-workshop').onclick = () => this.openWorkshop('field');
    $('btn-restart').onclick = () => this.retry();
    $('btn-mute').onclick = () => this.toggleMute();
    $('btn-quit').onclick = () => this.toMenu();
    $('ws-continue').onclick = () => {
      Sound.play('click');
      if (this.mode === 'between') {
        const p = G.player;
        p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - p.hp) * 0.5 + 10);
        startZone(G.level + 1);
        Input.lock(canvas);
      } else this.closeOverlay();
    };
    $('btn-retry').onclick = () => this.retry();
    $('btn-go-menu').onclick = () => this.toMenu();
    $('btn-again').onclick = () => { Sound.play('click'); newRun(); Input.lock(canvas); };
    $('btn-v-menu').onclick = () => this.toMenu();
    document.querySelectorAll('.tab').forEach((t) => {
      t.onclick = () => { this.tab = t.dataset.tab; Sound.play('click'); this.renderWorkshop(); };
    });
    const sens = $('opt-sens');
    sens.oninput = () => { G.settings.sens = +sens.value; $('opt-sens-val').textContent = (+sens.value).toFixed(1); };
    $('opt-invert').onchange = (e) => { G.settings.invert = e.target.checked; };
    $('opt-quality').onchange = (e) => { G.settings.quality = e.target.checked ? 'low' : 'high'; renderer.shadowMap.enabled = !e.target.checked; resize(); scene.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined) o.material.needsUpdate = true; }); };

    // HUD: parts strip
    $('hud-parts').innerHTML = PART_ORDER.map((k) => `<div class="hp-item" id="hp-${k}" style="--c:${PARTS[k].color}" title="${PARTS[k].name}"><img src="${partIconURL(k)}" alt=""><b>0</b></div>`).join('');
    this.compass = $('compass').getContext('2d');
    this.radar = $('radar').getContext('2d');
  },

  hideAll() {
    document.querySelectorAll('.overlay').forEach((o) => o.classList.remove('show'));
    $('hud').classList.toggle('show', G.state === 'playing');
  },
  show(id) {
    document.querySelectorAll('.overlay').forEach((o) => o.classList.remove('show'));
    $(id).classList.add('show');
    $('hud').classList.toggle('show', id === 'workshop' || id === 'pause');
    $('hud').classList.toggle('dim', id === 'workshop' || id === 'pause');
  },

  pause() {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    Input.mouse.down = false;
    Input.unlock();
    $('btn-mute').textContent = Sound.muted ? 'Sound: Off' : 'Sound: On';
    this.show('pause');
  },

  closeOverlay() {
    if (G.state === 'workshop' && this.mode === 'between') return;
    if (G.state === 'paused' || G.state === 'workshop') {
      G.state = 'playing';
      Input.mouse.down = false;
      $('hud').classList.remove('dim');
      this.hideAll();
      Input.lock(canvas);
    }
  },

  retry() {
    Sound.play('click');
    restoreSnapshot();
    startZone(G.level);
    Input.lock(canvas);
  },

  toMenu() {
    Sound.play('click');
    G.state = 'menu';
    G.companions.forEach((c) => c.destroy());
    G.companions = [];
    initMenuScene();
    Sound.setIntensity(0);
    Input.unlock();
    this.show('menu');
    $('hud').classList.remove('show');
  },

  toggleMute() {
    const m = Sound.toggleMute();
    $('btn-mute').textContent = m ? 'Sound: Off' : 'Sound: On';
  },

  statsHTML(s) {
    return `<div class="stat"><b>${s.kills}</b><span>Robots destroyed</span></div>
      <div class="stat"><b>${s.parts}</b><span>Parts salvaged</span></div>
      <div class="stat"><b>${s.caches || 0}</b><span>Caches opened</span></div>
      <div class="stat"><b>${fmtTime(s.time)}</b><span>Time</span></div>
      <div class="stat"><b>${Math.round(s.damageTaken || 0)}</b><span>Damage taken</span></div>`;
  },

  showGameOver() {
    $('go-sector').textContent = `Zone ${G.level + 1}: ${ZONES[G.level].name}`;
    $('go-stats').innerHTML = this.statsHTML(G.stats);
    this.show('gameover');
    $('hud').classList.remove('show');
  },

  showVictory() {
    $('v-stats').innerHTML = this.statsHTML(G.total) + `<div class="stat"><b>${G.total.crafted || 0}</b><span>Items crafted</span></div>`;
    Sound.setIntensity(0);
    this.show('victory');
    $('hud').classList.remove('show');
  },

  // ═════════════════════════ Workshop ═════════════════════════
  openWorkshop(mode) {
    this.mode = mode;
    G.state = 'workshop';
    Input.mouse.down = false;
    Input.unlock();
    const next = ZONES[G.level + 1];
    if (mode === 'between') {
      $('ws-title').textContent = 'ZONE CLEARED';
      $('ws-sub').textContent = `Next: Zone ${G.level + 2} — ${next.name}. Build your squad before you deploy.`;
      $('ws-continue').textContent = `Deploy to Zone ${G.level + 2} ▸`;
      $('ws-stats').innerHTML = this.statsHTML(G.stats);
      $('ws-stats').style.display = '';
    } else {
      $('ws-title').textContent = 'FIELD WORKSHOP';
      $('ws-sub').textContent = 'Time is frozen. Turn salvage into firepower.';
      $('ws-continue').textContent = 'Resume ▸';
      $('ws-stats').style.display = 'none';
    }
    this.renderWorkshop();
    this.show('workshop');
  },

  canAfford(cost) { return Object.entries(cost).every(([k, v]) => (G.inv[k] || 0) >= v); },

  recipeState(r) {
    if (r.kind === 'upgrade' && G.up[r.id] >= r.max) return { ok: false, why: 'MAXED' };
    if (r.kind === 'companion' && G.companions.length >= G.slots) return { ok: false, why: 'SQUAD FULL' };
    if (!this.canAfford(r.cost)) return { ok: false, why: 'NEED PARTS' };
    return { ok: true };
  },

  craft(id) {
    const r = RECIPES.find((x) => x.id === id);
    const st = this.recipeState(r);
    if (!st.ok) { Sound.play('deny'); this.toast(st.why === 'NEED PARTS' ? 'Not enough parts' : st.why === 'SQUAD FULL' ? 'Squad is full — scrap a bot or build a Command Uplink' : 'Already at maximum', true); return; }
    for (const [k, v] of Object.entries(r.cost)) G.inv[k] -= v;
    const p = G.player;
    if (r.kind === 'companion') {
      G.companions.push(new Companion(r.id));
      this.toast(`${r.name} online!`);
    } else if (r.kind === 'upgrade') {
      G.up[r.id]++;
      if (r.id === 'armor') p.hp += 25;
      if (r.id === 'firmware') G.companions.forEach((c) => (c.hp = c.maxHp));
      if (r.id === 'split') setViewModelBarrels(G.vm, 1 + G.up.split);
      this.toast(`${r.name} installed (${G.up[r.id]}/${r.max})`);
    } else if (r.id === 'repair') { G.repairKits++; this.toast('Repair kit assembled'); }
    else if (r.id === 'cell') { G.cells++; this.toast('Plasma cell charged'); }
    G.total.crafted = (G.total.crafted || 0) + 1;
    Sound.play('craft');
    this.renderWorkshop();
    this.refreshHUD(true);
    const card = document.querySelector(`[data-recipe="${id}"]`);
    if (card) { card.classList.remove('crafted'); void card.offsetWidth; card.classList.add('crafted'); }
  },

  scrapCompanion(cid) {
    const i = G.companions.findIndex((c) => c.id === cid);
    if (i < 0) return;
    const c = G.companions[i];
    const r = RECIPES.find((x) => x.id === c.kind);
    for (const [k, v] of Object.entries(r.cost)) G.inv[k] += Math.floor(v / 2);
    c.destroy();
    G.companions.splice(i, 1);
    Sound.play('explode', false);
    this.toast(`${c.d.name} dismantled — 50% of parts recovered`);
    this.renderWorkshop();
    this.refreshHUD(true);
  },

  toast(msg, bad = false) {
    const t = $('ws-toast');
    t.textContent = msg;
    t.className = 'ws-toast show' + (bad ? ' bad' : '');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => (t.className = 'ws-toast'), 2200);
  },

  costHTML(cost) {
    return Object.entries(cost).map(([k, v]) => {
      const have = G.inv[k] || 0;
      return `<span class="cost ${have >= v ? 'ok' : 'no'}" title="${PARTS[k].name}"><img src="${partIconURL(k)}" alt="">${have}/${v}</span>`;
    }).join('');
  },

  renderWorkshop() {
    $('ws-inv').innerHTML = PART_ORDER.map((k) => `
      <div class="inv-item ${G.inv[k] ? '' : 'empty'}" style="--c:${PARTS[k].color}">
        <img src="${partIconURL(k)}" alt="">
        <div class="inv-info"><div class="inv-name">${PARTS[k].name}</div><div class="inv-desc">${PARTS[k].desc}</div></div>
        <div class="inv-count">${G.inv[k]}</div>
      </div>`).join('');
    $('ws-items').innerHTML = `
      <div class="inv-item" style="--c:#6bff9e"><img src="${upgIconURL('repair', '#6bff9e')}" alt=""><div class="inv-info"><div class="inv-name">Repair Kit</div><div class="inv-desc">R — restore 40 hull</div></div><div class="inv-count">${G.repairKits}</div></div>
      <div class="inv-item" style="--c:#b98cff"><img src="${upgIconURL('cell', '#b98cff')}" alt=""><div class="inv-info"><div class="inv-name">Plasma Cell</div><div class="inv-desc">Refills grenade charge</div></div><div class="inv-count">${G.cells}</div></div>`;

    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === this.tab));

    const list = RECIPES.filter((r) => r.kind === this.tab);
    $('ws-recipes').innerHTML = list.map((r) => {
      const st = this.recipeState(r);
      const color = r.kind === 'companion' ? COMP_DEFS[r.id].color : r.kind === 'upgrade' ? '#3cf2ff' : r.id === 'repair' ? '#6bff9e' : '#b98cff';
      const icon = r.kind === 'companion' ? compIconURL(r.id) : upgIconURL(r.id, color);
      let meta = '';
      if (r.kind === 'upgrade') meta = `<div class="pips">${Array.from({ length: r.max }, (_, i) => `<i class="${i < G.up[r.id] ? 'on' : ''}"></i>`).join('')}</div>`;
      if (r.kind === 'companion') {
        const d = COMP_DEFS[r.id];
        const owned = G.companions.filter((c) => c.kind === r.id).length;
        meta = `<div class="meta">HULL ${Math.round(d.hp * (1 + 0.3 * G.up.firmware))}${d.range ? ' · RANGE ' + d.range + 'M' : ''}${owned ? ` · <b>${owned} ACTIVE</b>` : ''}</div>`;
      }
      return `<div class="recipe ${st.ok ? 'ready' : ''}" data-recipe="${r.id}" style="--c:${color}">
        <div class="r-top">
          <div class="r-icon"><img src="${icon}" alt=""></div>
          <div class="r-body"><div class="r-name">${r.name}</div><div class="r-desc">${r.desc}</div>${meta}</div>
        </div>
        <div class="r-foot">
          <div class="r-cost">${this.costHTML(r.cost)}</div>
          <button class="btn craft-btn" ${st.ok ? '' : 'disabled'} data-craft="${r.id}">${st.ok ? 'Craft' : st.why}</button>
        </div>
      </div>`;
    }).join('');
    $('ws-recipes').querySelectorAll('[data-craft]').forEach((b) => (b.onclick = () => this.craft(b.dataset.craft)));

    $('ws-slots').textContent = `${G.companions.length}/${G.slots}`;
    let squad = G.companions.map((c) => `
      <div class="squad-item" style="--c:${c.d.color}">
        <img src="${compIconURL(c.kind)}" alt="">
        <div class="inv-info"><div class="inv-name">${c.d.name}</div>
          <div class="mini-bar"><i style="width:${(c.offline > 0 ? 0 : c.hp / c.maxHp) * 100}%"></i></div>
          <div class="inv-desc">${c.offline > 0 ? 'Rebooting…' : `Hull ${Math.ceil(c.hp)}/${Math.round(c.maxHp)}`}</div></div>
        <button class="btn tiny" data-scrap="${c.id}" title="Dismantle for 50% of parts">Scrap</button>
      </div>`).join('');
    for (let i = G.companions.length; i < G.slots; i++) squad += `<div class="squad-item empty"><div class="empty-slot">+</div><div class="inv-desc">Empty slot — craft a companion</div></div>`;
    $('ws-squad').innerHTML = squad;
    $('ws-squad').querySelectorAll('[data-scrap]').forEach((b) => (b.onclick = () => this.scrapCompanion(+b.dataset.scrap)));

    const p = G.player;
    $('ws-player').innerHTML = `
      <div class="pilot-row"><span>Hull</span><b>${Math.ceil(p.hp)} / ${p.maxHp}</b></div>
      <div class="pilot-row"><span>Fire rate</span><b>${p.fireRate.toFixed(1)}/s × ${1 + G.up.split}</b></div>
      <div class="pilot-row"><span>Move speed</span><b>${p.speed.toFixed(1)} m/s</b></div>
      <div class="pilot-row"><span>Dash recharge</span><b>${p.dashMax.toFixed(2)}s</b></div>
      <div class="pilot-row"><span>Magnet radius</span><b>${p.magnet} m</b></div>
      <div class="pilot-row"><span>Squad damage</span><b>+${G.up.firmware * 30}%</b></div>`;
  },

  // ═════════════════════════ HUD messages ═════════════════════════
  banner(text, sub, color, dur = 3) {
    const b = $('banner');
    $('banner-title').textContent = text;
    $('banner-sub').textContent = sub || '';
    b.style.setProperty('--c', color);
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.remove('show'), dur * 1000);
  },

  hint(text) {
    const now = performance.now();
    if (this.hintLast[text] && now - this.hintLast[text] < 25000) return;
    this.hintLast[text] = now;
    const h = $('hint');
    h.textContent = text;
    h.classList.remove('show'); void h.offsetWidth; h.classList.add('show');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => h.classList.remove('show'), 5000);
  },

  feed(text, color, part) {
    const f = $('feed');
    const el = document.createElement('div');
    el.className = 'feed-item';
    el.style.setProperty('--c', color);
    el.innerHTML = (part ? `<img src="${partIconURL(part)}" alt="">` : '') + `<span>${text}</span>`;
    f.prepend(el);
    while (f.children.length > 6) f.lastChild.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3200);
  },

  bump(type) {
    const el = $('hp-' + type);
    if (!el) return;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  },

  hitmarker(kill, blocked) {
    const c = $('crosshair');
    c.classList.remove('hit', 'kill', 'blocked'); void c.offsetWidth;
    c.classList.add(kill ? 'kill' : blocked ? 'blocked' : 'hit');
  },

  damageDir(x, z) {
    const p = G.player;
    const dx = x - p.pos.x, dz = z - p.pos.z;
    const fwd = dx * -Math.sin(p.yaw) + dz * -Math.cos(p.yaw);
    const right = dx * Math.cos(p.yaw) + dz * -Math.sin(p.yaw);
    const a = Math.atan2(right, fwd);
    const el = document.createElement('div');
    el.className = 'dmg-arc';
    el.style.transform = `rotate(${a}rad)`;
    $('dmgdir').appendChild(el);
    setTimeout(() => el.remove(), 900);
  },

  // ═════════════════════════ Per-frame HUD ═════════════════════════
  refreshHUD(force) {
    if (G.state !== 'playing' && !force) return;
    const p = G.player;
    const Z = ZONES[G.level];
    const hk = p.hp / p.maxHp;
    $('bar-hull').style.width = (hk * 100).toFixed(1) + '%';
    $('bar-hull').style.setProperty('--c', hk < 0.3 ? '#ff3b5c' : hk < 0.6 ? '#ffc23c' : '#3cf2ff');
    $('val-hull').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    $('bar-plasma').style.width = p.energy + '%';
    $('val-plasma').textContent = p.energy >= 100 ? 'READY' : G.cells ? `+${G.cells} CELL` : '';
    $('bar-dash').style.width = (100 * (1 - Math.max(0, p.dashCd) / p.dashMax)) + '%';
    $('val-repair').textContent = `[R] REPAIR ×${G.repairKits}`;
    $('vitals').classList.toggle('low', hk < 0.3);

    for (const k of PART_ORDER) {
      if (this.counts[k] !== G.inv[k] || force) {
        this.counts[k] = G.inv[k];
        const el = $('hp-' + k);
        el.querySelector('b').textContent = G.inv[k];
        el.classList.toggle('zero', !G.inv[k]);
      }
    }
    // squad
    const sig = G.companions.map((c) => c.id).join(',') + '|' + G.slots;
    if (sig !== this.squadSig || force) {
      this.squadSig = sig;
      let h = '';
      for (let i = 0; i < G.slots; i++) {
        const c = G.companions[i];
        h += c ? `<div class="sq" id="sq-${c.id}" style="--c:${c.d.color}"><img src="${compIconURL(c.kind)}" alt=""><i><u></u></i></div>` : '<div class="sq empty">+</div>';
      }
      $('hud-squad').innerHTML = h;
    }
    for (const c of G.companions) {
      const el = $('sq-' + c.id);
      if (!el) continue;
      el.classList.toggle('off', c.offline > 0);
      el.querySelector('u').style.width = (c.offline > 0 ? 100 * (1 - c.offline / 9) : 100 * c.hp / c.maxHp) + '%';
    }

    // objective
    const done = World.beacons.filter((b) => b.state === 'done').length;
    const charging = World.beacons.find((b) => b.state === 'charging');
    let obj = '', prog = -1;
    if (G.objective === 'beacons') {
      obj = charging ? (charging.inside ? `Defend the uplink — ${Math.floor(charging.progress * 100)}%` : 'Return to the uplink ring!') : `Activate signal beacons (${done}/${World.beacons.length})`;
      if (charging) prog = charging.progress;
    } else if (G.objective === 'arena') obj = 'Enter the central arena';
    else if (G.objective === 'boss') obj = G.boss ? `Destroy ${G.boss.name}` : 'Something is coming…';
    else if (G.objective === 'extract') obj = World.portal ? 'Step into the extraction portal' : 'Extraction incoming…';
    else obj = 'Extracting…';
    $('obj-zone').textContent = `ZONE ${G.level + 1} · ${Z.name.toUpperCase()}`;
    $('obj-text').textContent = obj;
    $('obj-text').classList.toggle('warn', !!charging && !charging.inside);
    $('obj-prog').style.display = prog >= 0 ? '' : 'none';
    $('obj-prog-fill').style.width = (prog * 100).toFixed(1) + '%';
    $('obj-kills').textContent = `KILLS ${G.stats.kills}  ·  CACHES ${World.caches.filter((c) => c.opened).length}/${World.caches.length}`;

    // boss bar
    const b = G.boss;
    if (b && !b.dead) {
      $('bossbar').classList.add('show');
      $('bossbar').style.setProperty('--c', b.color);
      $('boss-name').textContent = b.name + (b.phase === 2 ? ' — OVERDRIVE' : '');
      $('boss-fill').style.width = (100 * b.hp / b.maxHp) + '%';
    } else $('bossbar').classList.remove('show');

    // interaction prompt
    const it = G.state === 'playing' && !p.dead ? nextInteractable() : null;
    const pr = $('prompt');
    if (it) {
      pr.innerHTML = it.kind === 'cache' ? `<kbd>E</kbd> Open ${it.obj.golden ? '<b class="gold">golden</b> ' : ''}salvage cache` : '<kbd>E</kbd> Start beacon uplink';
      pr.classList.add('show');
    } else pr.classList.remove('show');

    this.drawCompass();
    this.drawRadar();
  },

  markers() {
    const M = [];
    const Z = ZONES[G.level];
    for (const b of World.beacons) {
      M.push({ x: b.x, z: b.z, color: b.state === 'done' ? '#6bff9e' : b.state === 'charging' ? Z.accent : '#ffb347', shape: 'diamond', label: true, big: b.state !== 'done' });
    }
    for (const c of World.caches) if (!c.opened) M.push({ x: c.x, z: c.z, color: c.golden ? '#ffd23f' : '#3cf2ff', shape: 'square', range: 70 });
    if (G.objective === 'arena' || G.objective === 'boss' || (G.objective === 'beacons' && false)) M.push({ x: World.arena.x, z: World.arena.z, color: Z.boss.color, shape: 'skull', label: true, big: true });
    if (World.portal) M.push({ x: World.portal.x, z: World.portal.z, color: '#6bff9e', shape: 'ring', label: true, big: true });
    return M;
  },

  drawCompass() {
    const g = this.compass, cv = g.canvas, w = cv.width, h = cv.height;
    const p = G.player;
    g.clearRect(0, 0, w, h);
    const heading = -p.yaw;
    const half = 1.3;
    const toX = (bearing) => w / 2 + (angDiff(heading, bearing) / half) * (w / 2);
    g.font = '700 12px Orbitron, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let deg = 0; deg < 360; deg += 15) {
      const b = (deg * Math.PI) / 180;
      const d = angDiff(heading, b);
      if (Math.abs(d) > half) continue;
      const x = toX(b), fade = 1 - Math.abs(d) / half;
      const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[deg];
      g.globalAlpha = fade;
      if (card) { g.fillStyle = card === 'N' ? '#ff6b6b' : '#e6f1ff'; g.fillText(card, x, 13); }
      else { g.fillStyle = 'rgba(230,241,255,0.5)'; g.fillRect(x - 0.5, deg % 45 === 0 ? 6 : 9, 1, deg % 45 === 0 ? 12 : 6); }
    }
    g.globalAlpha = 1;
    for (const m of this.markers()) {
      const dx = m.x - p.pos.x, dz = m.z - p.pos.z, d = Math.hypot(dx, dz);
      if (m.range && d > m.range) continue;
      const b = Math.atan2(dx, -dz);
      const rel = angDiff(heading, b);
      const clampd = Math.abs(rel) > half;
      const x = clampd ? (rel > 0 ? w - 10 : 10) : toX(b);
      const y = 30;
      g.fillStyle = m.color; g.strokeStyle = m.color; g.lineWidth = 2;
      g.globalAlpha = clampd ? 0.6 : 1;
      const s = m.big ? 6 : 4;
      g.beginPath();
      if (m.shape === 'diamond') { g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.closePath(); g.fill(); }
      else if (m.shape === 'square') { g.fillRect(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2); }
      else if (m.shape === 'ring') { g.arc(x, y, s, 0, TAU); g.stroke(); }
      else { g.arc(x, y - 1, s, 0, TAU); g.fill(); g.fillStyle = '#05060a'; g.fillRect(x - 3, y - 2, 2, 2); g.fillRect(x + 1, y - 2, 2, 2); }
      if (m.label && !clampd) {
        g.font = '600 11px Rajdhani, sans-serif'; g.fillStyle = m.color;
        g.fillText(Math.round(d) + 'm', x, y + 12);
      }
      g.globalAlpha = 1;
    }
    g.fillStyle = '#3cf2ff';
    g.beginPath(); g.moveTo(w / 2 - 5, 0); g.lineTo(w / 2 + 5, 0); g.lineTo(w / 2, 5); g.fill();
  },

  drawRadar() {
    const g = this.radar, cv = g.canvas, w = cv.width, R = w / 2;
    const p = G.player;
    g.clearRect(0, 0, w, w);
    g.save();
    g.beginPath(); g.arc(R, R, R - 2, 0, TAU); g.clip();
    g.fillStyle = 'rgba(6,12,24,0.55)'; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(60,242,255,0.15)'; g.lineWidth = 1;
    for (const r of [R * 0.33, R * 0.66]) { g.beginPath(); g.arc(R, R, r, 0, TAU); g.stroke(); }
    g.beginPath(); g.moveTo(R, 0); g.lineTo(R, w); g.moveTo(0, R); g.lineTo(w, R); g.stroke();
    // sweep
    const sw = (G.time * 1.5) % TAU;
    const grd = g.createConicGradient ? g.createConicGradient(sw - 0.6, R, R) : null;
    if (grd) {
      grd.addColorStop(0, 'rgba(60,242,255,0)'); grd.addColorStop(0.09, 'rgba(60,242,255,0.18)'); grd.addColorStop(0.1, 'rgba(60,242,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, w);
    }
    const range = 70, sc = (R - 6) / range;
    const cs = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    const proj = (x, z) => {
      const dx = x - p.pos.x, dz = z - p.pos.z;
      const right = dx * cs - dz * sn, fwd = -dx * sn - dz * cs;
      return [R + right * sc, R - fwd * sc, Math.hypot(dx, dz)];
    };
    const dot = (x, z, color, r, edge) => {
      let [sx, sy, d] = proj(x, z);
      if (d > range) { if (!edge) return; const k = range / d; sx = R + (sx - R) * k; sy = R + (sy - R) * k; }
      g.fillStyle = color; g.beginPath(); g.arc(sx, sy, r, 0, TAU); g.fill();
    };
    for (const k of G.pickups) dot(k.pos.x, k.pos.z, k.type === 'health' ? '#6bff9e' : PARTS[k.type].color, 1.5);
    for (const c of World.caches) if (!c.opened) dot(c.x, c.z, c.golden ? '#ffd23f' : '#3cf2ff', 2.5);
    for (const b of World.beacons) dot(b.x, b.z, b.state === 'done' ? '#6bff9e' : '#ffb347', 4, true);
    for (const s of G.spawns) dot(s.x, s.z, '#ffffff', 2);
    for (const e of G.enemies) dot(e.pos.x, e.pos.z, e.isBoss ? e.color : e.elite ? '#ffd700' : e.aggro ? '#ff3b5c' : '#ff8a6a', e.isBoss ? 5 : e.r > 1.5 ? 3.5 : 2.5, e.isBoss);
    for (const c of G.companions) dot(c.pos.x, c.pos.z, c.d.color, 2);
    g.restore();
    g.strokeStyle = 'rgba(60,242,255,0.4)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(R, R, R - 2, 0, TAU); g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(R, R - 6); g.lineTo(R + 4.5, R + 5); g.lineTo(R, R + 2.5); g.lineTo(R - 4.5, R + 5); g.closePath(); g.fill();
  },
};
