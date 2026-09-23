'use strict';
// ═════════════════════════ Canvas HUD ═════════════════════════
const HUD = {
  panel(ctx, x, y, w, h, accent = '#3cf2ff') {
    ctx.fillStyle = 'rgba(6,12,24,0.62)';
    roundRect(ctx, x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.28); ctx.lineWidth = 1; ctx.stroke();
  },

  bar(ctx, x, y, w, h, k, color, segs = 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(x, y, w, h);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, color); g.addColorStop(1, rgba(color, 0.55));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w * clamp(k, 0, 1), h);
    glow(ctx, x + w * clamp(k, 0, 1), y + h / 2, h * 1.6, color, 0.5);
    if (segs) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      for (let i = 1; i < segs; i++) ctx.fillRect(x + (w * i) / segs - 1, y, 2, h);
    }
  },

  draw(ctx) {
    const p = G.player;
    const L = LEVELS[G.level];
    const acc = L.theme.accent;
    ctx.save();
    ctx.textBaseline = 'middle';

    // ── Top-left: hull / plasma / dash
    this.panel(ctx, 16, 16, 300, 92, '#3cf2ff');
    ctx.font = '700 12px Orbitron, sans-serif'; ctx.fillStyle = '#9fdcff'; ctx.textAlign = 'left';
    ctx.fillText('HULL', 30, 34);
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff';
    ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, 302, 34);
    const hk = p.hp / p.maxHp;
    this.bar(ctx, 30, 44, 272, 12, hk, hk < 0.3 ? '#ff3b5c' : hk < 0.6 ? '#ffc23c' : '#3cf2ff', Math.round(p.maxHp / 25));
    ctx.textAlign = 'left'; ctx.fillStyle = '#c9a8ff'; ctx.font = '700 10px Orbitron, sans-serif';
    ctx.fillText('PLASMA', 30, 70);
    this.bar(ctx, 86, 65, 110, 8, p.energy / 100, '#b98cff');
    if (p.energy >= 100) { ctx.fillStyle = rgba('#e0ccff', 0.6 + 0.4 * Math.sin(G.time * 6)); ctx.fillText('READY', 202, 70); }
    else if (G.cells) { ctx.fillStyle = '#c9a8ff'; ctx.fillText(`+${G.cells} CELL`, 202, 70); }
    ctx.fillStyle = '#9fdcff';
    ctx.fillText('DASH', 30, 90);
    this.bar(ctx, 86, 85, 110, 8, 1 - Math.max(0, p.dashCd) / p.dashMax, '#3cf2ff');
    ctx.fillStyle = G.repairKits ? '#6bff9e' : '#58657a';
    ctx.fillText(`[Q] REPAIR ×${G.repairKits}`, 208, 90);

    // ── Top-right: sector info
    const tw = 280;
    this.panel(ctx, W - tw - 16, 16, tw, 70, acc);
    ctx.textAlign = 'right';
    ctx.font = '700 11px Orbitron, sans-serif'; ctx.fillStyle = acc;
    ctx.fillText(`SECTOR ${G.level + 1} / ${LEVELS.length}`, W - 30, 34);
    ctx.font = '700 17px Rajdhani, sans-serif'; ctx.fillStyle = '#ffffff';
    ctx.fillText(L.name.toUpperCase(), W - 30, 53);
    ctx.font = '600 13px Rajdhani, sans-serif'; ctx.fillStyle = '#9fb3c8';
    let waveTxt;
    if (G.waveState === 'boss' || G.waveState === 'bossWarn') waveTxt = 'BOSS ENGAGEMENT';
    else if (G.waveState === 'clear' || G.waveState === 'done') waveTxt = 'SECTOR SECURE';
    else waveTxt = `WAVE ${Math.max(1, G.wave)} / ${L.waves}  ·  HOSTILES ${G.enemies.length + G.spawns.length + G.queue.reduce((s, g) => s + g.length, 0)}`;
    ctx.fillText(waveTxt + `  ·  KILLS ${G.stats.kills}`, W - 30, 72);

    // ── Boss bar
    const b = G.boss;
    if (b && !b.dead) {
      const bw = Math.min(560, W - 700 > 300 ? W - 700 : W * 0.5), bx = W / 2 - bw / 2;
      this.panel(ctx, bx - 14, 14, bw + 28, 50, b.color);
      ctx.textAlign = 'center'; ctx.font = '900 14px Orbitron, sans-serif'; ctx.fillStyle = b.color;
      ctx.letterSpacing = '4px';
      ctx.fillText(b.name + (b.phase === 2 ? ' — OVERDRIVE' : ''), W / 2, 30);
      ctx.letterSpacing = '0px';
      this.bar(ctx, bx, 42, bw, 10, b.hp / b.maxHp, b.color, 10);
    }

    // ── Bottom-left: salvage inventory
    const iy = H - 64;
    const iw = PART_ORDER.length * 58 + 16;
    this.panel(ctx, 16, iy - 22, iw, 70, '#aab6c8');
    ctx.textAlign = 'left'; ctx.font = '700 10px Orbitron, sans-serif'; ctx.fillStyle = '#9fb3c8';
    ctx.fillText('SALVAGE', 28, iy - 8);
    ctx.textAlign = 'right'; ctx.fillStyle = rgba('#ffffff', 0.55 + 0.25 * Math.sin(G.time * 3));
    ctx.fillText('[TAB] WORKSHOP', 16 + iw - 12, iy - 8);
    PART_ORDER.forEach((k, i) => {
      const x = 44 + i * 58, y = iy + 22;
      const bump = G.invBump[k] || 0;
      const n = G.inv[k];
      ctx.globalAlpha = n ? 1 : 0.35;
      if (bump) glow(ctx, x, y, 30, PARTS[k].color, bump);
      drawPartIcon(ctx, k, x, y, 10 * (1 + bump * 0.3), G.time);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left'; ctx.font = '700 15px Rajdhani, sans-serif';
      ctx.fillStyle = n ? '#ffffff' : '#56627a';
      ctx.fillText(n, x + 15, y + 2);
    });

    // ── Bottom-center: squad
    const comps = G.companions;
    const slots = G.slots;
    const sw = slots * 52 + 20;
    const sx0 = Math.max(W / 2 - sw / 2, 16 + iw + 12);
    this.panel(ctx, sx0, H - 86, sw, 70, '#6bff9e');
    ctx.textAlign = 'center'; ctx.font = '700 10px Orbitron, sans-serif'; ctx.fillStyle = '#8affc0';
    ctx.fillText(`SQUAD ${comps.length}/${slots}`, sx0 + sw / 2, H - 72);
    for (let i = 0; i < slots; i++) {
      const x = sx0 + 36 + i * 52, y = H - 42;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
      roundRect(ctx, x - 20, y - 18, 40, 36, 6); ctx.stroke();
      const c = comps[i];
      if (!c) { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.font = '600 18px Rajdhani'; ctx.fillText('+', x, y); continue; }
      const off = c.offline > 0;
      ctx.globalAlpha = off ? 0.4 : 1;
      drawCompanionShape(ctx, c.kind, x, y - 3, 0.85, G.time, -Math.PI / 4, off);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 16, y + 12, 32, 3);
      ctx.fillStyle = off ? '#ff6b6b' : c.d.color;
      ctx.fillRect(x - 16, y + 12, 32 * (off ? 1 - c.offline / 9 : c.hp / c.maxHp), 3);
    }

    // ── Bottom-right: minimap
    const mw = 190, mh = Math.round(mw * G.arena.h / G.arena.w);
    const mx = W - mw - 16, my = H - mh - 16;
    this.panel(ctx, mx - 6, my - 6, mw + 12, mh + 12, acc);
    const sc = mw / G.arena.w;
    ctx.fillStyle = rgba(acc, 0.05); ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = rgba(acc, 0.25); ctx.strokeRect(mx, my, mw, mh);
    ctx.strokeStyle = rgba(acc, 0.35);
    ctx.strokeRect(mx + G.cam.x * sc, my + G.cam.y * sc, W * sc, H * sc);
    for (const k of G.pickups) { ctx.fillStyle = k.type === 'health' ? '#6bff9e' : PARTS[k.type].color; ctx.fillRect(mx + k.x * sc - 1, my + k.y * sc - 1, 2, 2); }
    for (const s of G.spawns) { ctx.fillStyle = rgba('#ffffff', 0.5 + 0.5 * Math.sin(G.time * 20)); ctx.fillRect(mx + s.x * sc - 1.5, my + s.y * sc - 1.5, 3, 3); }
    for (const e of G.enemies) {
      ctx.fillStyle = e.isBoss ? e.color : e.elite ? '#ffd700' : e.d.color;
      const r = e.isBoss ? 5 : e.r > 22 ? 3 : 2;
      ctx.beginPath(); ctx.arc(mx + e.x * sc, my + e.y * sc, r, 0, TAU); ctx.fill();
    }
    for (const c of comps) { ctx.fillStyle = c.d.color; ctx.fillRect(mx + c.x * sc - 1, my + c.y * sc - 1, 2, 2); }
    if (!p.dead) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(mx + p.x * sc, my + p.y * sc, 3, 0, TAU); ctx.fill();
      glow(ctx, mx + p.x * sc, my + p.y * sc, 10, '#3cf2ff', 0.8);
    }

    // ── Off-screen boss indicator
    if (b && !b.dead) {
      const sx = b.x - G.cam.x, sy = b.y - G.cam.y;
      if (sx < 0 || sy < 0 || sx > W || sy > H) {
        const a = Math.atan2(sy - H / 2, sx - W / 2);
        const ex = clamp(W / 2 + Math.cos(a) * W, 40, W - 40), ey = clamp(H / 2 + Math.sin(a) * H, 110, H - 110);
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
        ctx.fillStyle = b.color; poly(ctx, [[1, 0], [-0.6, -0.7], [-0.3, 0], [-0.6, 0.7]], 16); ctx.fill();
        ctx.restore();
      }
    }

    // ── Controls hint (first sector)
    if (G.hintT > 0) {
      const a = Math.min(1, G.hintT / 1.5);
      ctx.globalAlpha = a;
      const lines = [['WASD', 'Move'], ['MOUSE', 'Aim & fire'], ['SPACE', 'Dash (invulnerable)'], ['R-CLICK / E', 'Plasma bomb'], ['Q', 'Repair kit'], ['TAB', 'Workshop / craft']];
      const hw = 250, hh = lines.length * 22 + 36, hx = 16, hy = 124;
      this.panel(ctx, hx, hy, hw, hh, '#3cf2ff');
      ctx.textAlign = 'left'; ctx.font = '700 10px Orbitron, sans-serif'; ctx.fillStyle = '#3cf2ff';
      ctx.fillText('FIELD MANUAL', hx + 14, hy + 18);
      lines.forEach(([k, v], i) => {
        const y = hy + 42 + i * 22;
        ctx.font = '700 11px Orbitron, sans-serif'; ctx.fillStyle = '#ffffff';
        ctx.fillText(k, hx + 14, y);
        ctx.font = '600 14px Rajdhani, sans-serif'; ctx.fillStyle = '#9fb3c8';
        ctx.fillText(v, hx + 118, y);
      });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  },
};

// ═════════════════════════ DOM overlays ═════════════════════════
const $ = (id) => document.getElementById(id);

const UI = {
  tab: 'companion',
  mode: 'field',

  init() {
    $('btn-start').onclick = () => { Sound.init(); Sound.play('click'); newRun(); };
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
        startLevel(G.level + 1);
      } else this.closeOverlay();
    };
    $('btn-retry').onclick = () => this.retry();
    $('btn-go-menu').onclick = () => this.toMenu();
    $('btn-again').onclick = () => { Sound.play('click'); newRun(); };
    $('btn-v-menu').onclick = () => this.toMenu();
    document.querySelectorAll('.tab').forEach((t) => {
      t.onclick = () => { this.tab = t.dataset.tab; Sound.play('click'); this.renderWorkshop(); };
    });
  },

  hideAll() {
    document.querySelectorAll('.overlay').forEach((o) => o.classList.remove('show'));
    document.body.classList.toggle('ingame', G.state === 'playing');
  },
  show(id) {
    this.hideAll();
    $(id).classList.add('show');
    document.body.classList.remove('ingame');
  },

  pause() {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    Input.mouse.down = false;
    $('btn-mute').textContent = Sound.muted ? 'Sound: Off' : 'Sound: On';
    this.show('pause');
  },

  closeOverlay() {
    if (G.state === 'workshop' && this.mode === 'between') return;
    if (G.state === 'paused' || G.state === 'workshop') {
      G.state = 'playing';
      Input.mouse.down = false;
      this.hideAll();
    }
  },

  retry() {
    Sound.play('click');
    restoreSnapshot();
    startLevel(G.level);
  },

  toMenu() {
    Sound.play('click');
    G.state = 'menu';
    G.boss = null; G.enemies = []; G.bullets = []; G.ebullets = []; G.pickups = []; G.spawns = []; G.companions = [];
    Fx.clear();
    initMenuScene();
    Sound.setIntensity(0);
    this.show('menu');
  },

  toggleMute() {
    const m = Sound.toggleMute();
    $('btn-mute').textContent = m ? 'Sound: Off' : 'Sound: On';
  },

  statsHTML(s) {
    return `<div class="stat"><b>${s.kills}</b><span>Robots destroyed</span></div>
      <div class="stat"><b>${s.parts}</b><span>Parts salvaged</span></div>
      <div class="stat"><b>${fmtTime(s.time)}</b><span>Time</span></div>
      <div class="stat"><b>${Math.round(s.damageTaken || 0)}</b><span>Damage taken</span></div>`;
  },

  showGameOver() {
    $('go-sector').textContent = `Sector ${G.level + 1}: ${LEVELS[G.level].name}`;
    $('go-stats').innerHTML = this.statsHTML(G.stats);
    this.show('gameover');
  },

  showVictory() {
    $('v-stats').innerHTML = this.statsHTML(G.total) + `<div class="stat"><b>${G.total.crafted || 0}</b><span>Items crafted</span></div>`;
    Sound.setIntensity(0);
    this.show('victory');
  },

  openWorkshop(mode) {
    this.mode = mode;
    G.state = 'workshop';
    Input.mouse.down = false;
    const next = LEVELS[G.level + 1];
    if (mode === 'between') {
      $('ws-title').textContent = 'SECTOR CLEARED';
      $('ws-sub').textContent = `Next: Sector ${G.level + 2} — ${next.name}. Build your squad before you deploy.`;
      $('ws-continue').textContent = `Deploy to Sector ${G.level + 2} ▸`;
      $('ws-stats').innerHTML = this.statsHTML(G.stats);
      $('ws-stats').style.display = '';
    } else {
      $('ws-title').textContent = 'WORKSHOP';
      $('ws-sub').textContent = 'Combat paused. Turn salvage into firepower.';
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
      const c = new Companion(r.id);
      G.companions.push(c);
      Fx.ring(c.x, c.y, c.d.color, 60, 0.6, 3);
      this.toast(`${r.name} online!`);
    } else if (r.kind === 'upgrade') {
      G.up[r.id]++;
      if (r.id === 'armor') p.hp += 25;
      if (r.id === 'firmware') G.companions.forEach((c) => (c.hp = c.maxHp));
      this.toast(`${r.name} installed (${G.up[r.id]}/${r.max})`);
    } else if (r.id === 'repair') { G.repairKits++; this.toast('Repair kit assembled'); }
    else if (r.id === 'cell') { G.cells++; this.toast('Plasma cell charged'); }
    G.total.crafted = (G.total.crafted || 0) + 1;
    Sound.play('craft');
    this.renderWorkshop();
    const card = document.querySelector(`[data-recipe="${id}"]`);
    if (card) { card.classList.remove('crafted'); void card.offsetWidth; card.classList.add('crafted'); }
  },

  scrapCompanion(cid) {
    const i = G.companions.findIndex((c) => c.id === cid);
    if (i < 0) return;
    const c = G.companions[i];
    const r = RECIPES.find((x) => x.id === c.kind);
    for (const [k, v] of Object.entries(r.cost)) G.inv[k] += Math.floor(v / 2);
    G.companions.splice(i, 1);
    Sound.play('explode', false);
    this.toast(`${c.d.name} dismantled — 50% of parts recovered`);
    this.renderWorkshop();
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
    // inventory
    $('ws-inv').innerHTML = PART_ORDER.map((k) => `
      <div class="inv-item ${G.inv[k] ? '' : 'empty'}" style="--c:${PARTS[k].color}">
        <img src="${partIconURL(k)}" alt="">
        <div class="inv-info"><div class="inv-name">${PARTS[k].name}</div><div class="inv-desc">${PARTS[k].desc}</div></div>
        <div class="inv-count">${G.inv[k]}</div>
      </div>`).join('');
    $('ws-items').innerHTML = `
      <div class="inv-item" style="--c:#6bff9e"><img src="${upgIconURL('repair', '#6bff9e')}" alt=""><div class="inv-info"><div class="inv-name">Repair Kit</div><div class="inv-desc">Q — restore 40 hull</div></div><div class="inv-count">${G.repairKits}</div></div>
      <div class="inv-item" style="--c:#b98cff"><img src="${upgIconURL('cell', '#b98cff')}" alt=""><div class="inv-info"><div class="inv-name">Plasma Cell</div><div class="inv-desc">Refills bomb charge</div></div><div class="inv-count">${G.cells}</div></div>`;

    // tabs
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === this.tab));

    // recipes
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
        meta = `<div class="meta">HULL ${Math.round(d.hp * (1 + 0.3 * G.up.firmware))}${d.range ? ' · RANGE ' + d.range : ''}${owned ? ` · <b>${owned} ACTIVE</b>` : ''}</div>`;
      }
      return `<div class="recipe ${st.ok ? 'ready' : ''}" data-recipe="${r.id}" style="--c:${color}">
        <div class="r-top">
          <div class="r-icon"><img src="${icon}" alt=""></div>
          <div class="r-body">
            <div class="r-name">${r.name}</div>
            <div class="r-desc">${r.desc}</div>
            ${meta}
          </div>
        </div>
        <div class="r-foot">
          <div class="r-cost">${this.costHTML(r.cost)}</div>
          <button class="btn craft-btn" ${st.ok ? '' : 'disabled'} data-craft="${r.id}">${st.ok ? 'Craft' : st.why}</button>
        </div>
      </div>`;
    }).join('');
    $('ws-recipes').querySelectorAll('[data-craft]').forEach((b) => (b.onclick = () => this.craft(b.dataset.craft)));

    // squad
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

    // pilot
    const p = G.player;
    $('ws-player').innerHTML = `
      <div class="pilot-row"><span>Hull</span><b>${Math.ceil(p.hp)} / ${p.maxHp}</b></div>
      <div class="pilot-row"><span>Fire rate</span><b>${p.fireRate.toFixed(1)}/s × ${1 + G.up.split}</b></div>
      <div class="pilot-row"><span>Move speed</span><b>${Math.round(p.speed)}</b></div>
      <div class="pilot-row"><span>Dash recharge</span><b>${p.dashMax.toFixed(2)}s</b></div>
      <div class="pilot-row"><span>Magnet radius</span><b>${p.magnet}</b></div>
      <div class="pilot-row"><span>Squad damage</span><b>+${G.up.firmware * 30}%</b></div>`;
  },
};
