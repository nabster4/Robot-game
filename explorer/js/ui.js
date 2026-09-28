'use strict';
const $ = (id) => document.getElementById(id);

const UI = {
  tab: 'companion',
  mode: 'field',
  hintLast: {},
  counts: {},

  // ═════════════════════════ Setup ═════════════════════════
  init() {
    $('btn-start').onclick = () => {
      Sound.init(); Sound.play('click'); Touch.goFullscreen();
      if (hasSave() && !confirm('Start a new expedition? Your saved progress will be replaced when you get home.')) return;
      newRun(); Input.lock(canvas);
    };
    $('btn-continue').onclick = () => { Sound.init(); Sound.play('click'); Touch.goFullscreen(); continueGame(); Input.lock(canvas); };
    $('btn-continue').style.display = hasSave() ? '' : 'none';
    $('btn-howto').onclick = () => { Sound.init(); Sound.play('click'); $('howto').classList.toggle('hidden'); };
    $('btn-resume').onclick = () => this.closeOverlay();
    $('btn-p-workshop').onclick = () => this.openStation('field');
    $('btn-restart').onclick = () => this.retry();
    $('btn-mute').onclick = () => this.toggleMute();
    $('btn-quit').onclick = () => this.toMenu();
    $('ws-continue').onclick = () => { Sound.play('click'); this.closeOverlay(); };
    $('btn-retry').onclick = () => this.retry();
    $('btn-go-home').onclick = () => { Sound.play('click'); restoreSnapshot(); startHub(false); Input.lock(canvas); };
    $('btn-go-menu').onclick = () => this.toMenu();
    $('btn-again').onclick = () => { Sound.play('click'); this.closeVictory(); };
    $('btn-v-menu').onclick = () => this.toMenu();
    const sens = $('opt-sens');
    sens.value = G.settings.sens; $('opt-sens-val').textContent = G.settings.sens.toFixed(1);
    $('opt-quality').checked = G.settings.quality === 'low';
    if (Touch.enabled) $('opt-sens-label').textContent = 'Look sensitivity';
    sens.oninput = () => { G.settings.sens = +sens.value; $('opt-sens-val').textContent = (+sens.value).toFixed(1); };
    $('opt-invert').onchange = (e) => { G.settings.invert = e.target.checked; };
    $('opt-third').onchange = (e) => { G.settings.view = e.target.checked ? 'third' : 'first'; this.saveSettings(); };
    try { const v = localStorage.getItem('sf-view'); if (v === 'third') G.settings.view = 'third'; } catch (e) { /* storage unavailable */ }
    $('opt-third').checked = G.settings.view === 'third';
    $('opt-quality').onchange = (e) => { G.settings.quality = e.target.checked ? 'low' : 'high'; renderer.shadowMap.enabled = !e.target.checked; resize(); scene.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined) o.material.needsUpdate = true; }); };

    // hotbar: click / tap a slot to select it
    const hb = $('hud-parts');
    const pickSlot = (e) => {
      const el = e.target.closest('[data-slot]');
      if (!el || G.state !== 'playing') return;
      e.preventDefault(); e.stopPropagation();
      G.selectSlot(+el.dataset.slot);
      Sound.play('click');
    };
    hb.addEventListener('touchstart', pickSlot, { passive: false });
    hb.addEventListener('mousedown', pickSlot);
    $('bucks-ico').src = upgIconURL('bucks', '#ffd23f');
    this.compass = $('compass').getContext('2d');
    this.radar = $('radar').getContext('2d');
  },

  hideAll() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.querySelectorAll('.overlay').forEach((o) => o.classList.remove('show'));
    $('hud').classList.toggle('show', G.state === 'playing');
  },
  show(id) {
    Touch.reset();
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
    $('btn-restart').textContent = G.where === 'hub' ? 'Reload Home Base' : 'Restart Biome';
    this.show('pause');
  },

  closeOverlay() {
    if (G.state === 'paused' || G.state === 'workshop') {
      G.state = 'playing';
      Input.mouse.down = false;
      $('hud').classList.remove('dim');
      this.hideAll();
      Input.lock(canvas);
    }
  },

  closeVictory() {
    G.state = 'playing';
    this.hideAll();
    Input.lock(canvas);
  },

  retry() {
    Sound.play('click');
    restoreSnapshot();
    if (G.where === 'hub') startHub(false); else startZone(G.level);
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
    $('btn-continue').style.display = hasSave() ? '' : 'none';
    this.show('menu');
    $('hud').classList.remove('show');
  },

  saveSettings() { try { localStorage.setItem('sf-view', G.settings.view); } catch (e) { /* storage unavailable */ } },

  toggleView() {
    G.settings.view = G.settings.view === 'third' ? 'first' : 'third';
    $('opt-third').checked = G.settings.view === 'third';
    this.saveSettings();
    this.feed(G.settings.view === 'third' ? 'Third-person view' : 'First-person view', '#9fdcff');
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
    $('go-sector').textContent = G.where === 'hub' ? 'Home Base' : ZONES[G.level].name;
    $('go-stats').innerHTML = this.statsHTML(G.stats);
    $('btn-retry').textContent = G.where === 'hub' ? 'Try Again' : 'Retry Biome';
    $('btn-go-home').style.display = G.where === 'hub' ? 'none' : '';
    this.show('gameover');
    $('hud').classList.remove('show');
  },

  showVictory() {
    $('v-stats').innerHTML = this.statsHTML(G.total) + `<div class="stat"><b>${G.total.crafted || 0}</b><span>Items crafted</span></div>`;
    Sound.setIntensity(0);
    this.show('victory');
    $('hud').classList.remove('show');
  },

  // ═════════════════════════ Items ═════════════════════════
  itemName(it) { return it.t === 'part' ? PARTS[it.id].name : it.t === 'weapon' ? WEAPONS[it.id].name : SHOP_ITEMS[it.id].name; },
  itemColor(it) { return it.t === 'part' ? PARTS[it.id].color : it.t === 'weapon' ? WEAPONS[it.id].color : it.id === 'repair' ? '#6bff9e' : '#b98cff'; },
  itemIcon(it) { return it.t === 'part' ? partIconURL(it.id) : it.t === 'weapon' ? weapIconURL(it.id) : upgIconURL(it.id, this.itemColor(it)); },
  itemValue(it) { return it.t === 'part' ? PARTS[it.id].value : it.t === 'weapon' ? Math.round(SHOP_ITEMS[it.id] ? SHOP_ITEMS[it.id].price * 0.4 : 0) : Math.round(SHOP_ITEMS[it.id].price * 0.4); },
  keyItem(key) { const [t, id] = key.split(':'); return { t, id }; },

  // ═════════════════════════ Stations: field kit · Mechanic · Charging · Storage · Shop ═════════════════════════
  openStation(mode) {
    this.mode = mode;
    const tabs = { field: ['bots'], mechanic: ['bots', 'base', 'vehicle'], charging: ['charging'], storage: ['storage'], shop: ['sell', 'gear', 'bots', 'upgrades', 'supplies'] }[mode];
    if (!tabs.includes(this.tab)) this.tab = tabs[0];
    this.tabs = tabs;
    G.state = 'workshop';
    Input.mouse.down = false;
    Input.unlock();
    const shop = G.where === 'biome' ? ZONES[G.level].shop : null;
    const T = {
      field: ['FIELD KIT', 'Time is frozen. Build simple bots from the scrap in your hotbar.'],
      mechanic: ['MECHANIC ROOM', 'Build bots and base systems from your storage and hotbar.'],
      charging: ['CHARGING ROOM', 'Bots recharge here automatically when their batteries run low.'],
      storage: ['STORAGE ROOM', 'Unlimited storage. Click an item to move it between your hotbar and storage.'],
      shop: [shop ? shop.name : 'SHOP', 'Sell salvage for Botbucks. Buy weapons, gear, premium bots and upgrades.'],
    }[mode];
    $('ws-title').textContent = T[0];
    $('ws-sub').textContent = T[1];
    $('ws-title').style.color = mode === 'shop' && shop ? shop.color : '';
    $('ws-continue').textContent = mode === 'field' ? 'Resume ▸' : 'Leave ▸';
    $('ws-stats').style.display = 'none';
    this.renderWorkshop();
    this.show('workshop');
  },
  openWorkshop(mode) { this.openStation(mode === 'between' ? 'mechanic' : 'field'); },

  toast(msg, bad = false) {
    const t = $('ws-toast');
    t.textContent = msg;
    t.className = 'ws-toast show' + (bad ? ' bad' : '');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => (t.className = 'ws-toast'), 2200);
  },

  costHTML(cost, useStorage) {
    return Object.entries(cost).map(([k, v]) => {
      const have = G.partCount(k, useStorage);
      return `<span class="cost ${have >= v ? 'ok' : 'no'}" title="${PARTS[k].name}"><img src="${partIconURL(k)}" alt="">${have}/${v}</span>`;
    }).join('');
  },
  priceHTML(price) { return `<span class="cost ${G.bucks >= price ? 'ok' : 'no'} bucks"><img src="${upgIconURL('bucks', '#ffd23f')}" alt="">${price}</span>`; },

  card(o) {
    return `<div class="recipe ${o.ok ? 'ready' : ''}" data-id="${o.id}" style="--c:${o.color}">
      <div class="r-top">
        <div class="r-icon"><img src="${o.icon}" alt=""></div>
        <div class="r-body"><div class="r-name">${o.name}</div><div class="r-desc">${o.desc}</div>${o.meta || ''}</div>
      </div>
      <div class="r-foot">
        <div class="r-cost">${o.cost}</div>
        <button class="btn craft-btn" ${o.ok ? '' : 'disabled'} data-act="${o.act}" data-id="${o.id}">${o.ok ? o.verb : o.why}</button>
      </div>
    </div>`;
  },

  // ── crafting ──
  recipeState(r, useStorage) {
    if (r.kind === 'companion' && G.companions.length >= G.slots) return { ok: false, why: 'SQUAD FULL' };
    if (r.kind === 'vehicle' && G.vehicle) return { ok: false, why: 'OWNED' };
    if (r.id === 'shieldgen' && G.base.shield) return { ok: false, why: 'BUILT' };
    if (r.id === 'charger' && G.base.charger >= r.max) return { ok: false, why: 'MAXED' };
    if (!G.canAfford(r.cost, useStorage)) return { ok: false, why: 'NEED PARTS' };
    return { ok: true };
  },

  craft(id) {
    const useStorage = this.mode === 'mechanic';
    const r = RECIPES.find((x) => x.id === id);
    const st = this.recipeState(r, useStorage);
    if (!st.ok) { Sound.play('deny'); this.toast(st.why === 'NEED PARTS' ? 'Not enough parts' : st.why === 'SQUAD FULL' ? 'Squad is full — scrap a bot or buy a Command Uplink' : 'Already done', true); return; }
    G.consume(r.cost, useStorage);
    if (r.kind === 'companion') { G.companions.push(new Companion(r.id)); this.toast(`${r.name} online!`); }
    else if (r.kind === 'vehicle') { G.vehicle = new Vehicle(); this.toast(`${r.name} built! Press ${Touch.enabled ? 'RIDE' : 'F'} to fly`); }
    else if (r.id === 'shieldgen') { G.base.shield = true; World.buildHomeDome(); this.toast('Shield Generator online — the house is protected'); }
    else if (r.id === 'charger') { G.base.charger++; this.toast(`Fast Chargers installed (${G.base.charger}/${r.max})`); }
    G.total.crafted = (G.total.crafted || 0) + 1;
    Sound.play('craft');
    this.afterAction(id);
  },

  afterAction(id) {
    this.hotbarDirty = true;
    this.renderWorkshop();
    this.refreshHUD(true);
    const card = document.querySelector(`.recipe[data-id="${id}"]`);
    if (card) { card.classList.remove('crafted'); void card.offsetWidth; card.classList.add('crafted'); }
  },

  scrapCompanion(cid) {
    const i = G.companions.findIndex((c) => c.id === cid);
    if (i < 0) return;
    const c = G.companions[i];
    const r = RECIPES.find((x) => x.id === c.kind);
    if (r) for (const [k, v] of Object.entries(r.cost)) G.store({ t: 'part', id: k }, Math.floor(v / 2));
    else { const it = Object.values(SHOP_ITEMS).find((x) => x.bot === c.kind); if (it) G.bucks += Math.round(it.price * 0.3); }
    c.destroy();
    G.companions.splice(i, 1);
    Sound.play('explode', false);
    this.toast(r ? `${c.d.name} dismantled — half its parts sent to storage` : `${c.d.name} dismantled — sold for scrap value`);
    this.renderWorkshop();
    this.refreshHUD(true);
  },

  // ── shop ──
  shopState(id) {
    const S = SHOP_ITEMS[id];
    if (S.kind === 'weapon' && (G.bar.some((it) => it && it.t === 'weapon' && it.id === id) || G.storage['weapon:' + id])) return { ok: false, why: 'OWNED' };
    if (S.kind === 'gear' && id !== 'backpack' && G.gear[id]) return { ok: false, why: 'OWNED' };
    if (id === 'backpack' && G.gear.backpack >= S.max) return { ok: false, why: 'MAXED' };
    if (S.kind === 'upgrade' && G.up[S.up] >= UPGRADES[S.up].max) return { ok: false, why: 'MAXED' };
    if (S.kind === 'bot' && G.companions.length >= G.slots) return { ok: false, why: 'SQUAD FULL' };
    if ((S.kind === 'supply' || S.kind === 'weapon') && G.freeSlots() === 0) return { ok: false, why: 'HOTBAR FULL' };
    if (G.bucks < this.price(id)) return { ok: false, why: 'NEED BOTBUCKS' };
    return { ok: true };
  },
  price(id) {
    const S = SHOP_ITEMS[id];
    if (S.kind === 'upgrade') return Math.round(S.price * (1 + 0.5 * G.up[S.up]));
    if (id === 'backpack') return S.price * (1 + G.gear.backpack);
    return S.price;
  },
  buy(id) {
    const S = SHOP_ITEMS[id], st = this.shopState(id);
    if (!st.ok) { Sound.play('deny'); this.toast(st.why === 'NEED BOTBUCKS' ? 'Not enough Botbucks — sell some salvage' : st.why === 'HOTBAR FULL' ? 'Hotbar full — sell something first' : st.why === 'SQUAD FULL' ? 'Squad is full' : 'Already owned', true); return; }
    G.bucks -= this.price(id);
    let msg = '';
    if (S.kind === 'supply') { G.addItem({ t: 'supply', id }); msg = `${S.name} added to your hotbar`; }
    else if (S.kind === 'weapon') { G.addItem({ t: 'weapon', id }); msg = `${WEAPONS[id].name} added to your hotbar — select its slot to use it`; }
    else if (S.kind === 'gear') {
      if (id === 'backpack') { G.gear.backpack++; msg = `Backpack upgraded — ${G.barSize} hotbar slots`; }
      else { G.gear[id] = true; msg = id === 'jetpack' ? 'Jetpack equipped! Hold Space / JUMP in mid-air to fly' : 'Fire Boots equipped — the Volcano portal will open for you'; }
    } else if (S.kind === 'bot') { G.companions.push(new Companion(S.bot)); msg = `${COMP_DEFS[S.bot].name} joins your squad!`; }
    else if (S.kind === 'upgrade') {
      G.up[S.up]++;
      const p = G.player;
      if (S.up === 'armor') p.hp += 25;
      if (S.up === 'firmware') G.companions.forEach((c) => (c.hp = c.maxHp));
      if (S.up === 'split') setViewModelWeapon(G.vm, G.weapon, 1 + G.up.split);
      msg = `${UPGRADES[S.up].name} installed (${G.up[S.up]}/${UPGRADES[S.up].max})`;
    }
    Sound.play('buy');
    this.toast(msg);
    this.afterAction(id);
  },
  sell(slot) {
    const it = G.bar[slot];
    if (!it) return;
    if (it.t === 'weapon' && it.id === 'blaster') { Sound.play('deny'); this.toast('The Pulse Blaster is not for sale', true); return; }
    const v = this.itemValue(it);
    G.bar[slot] = null; G.checkWeapon();
    G.bucks += v;
    Sound.play('coin');
    this.toast(`Sold ${this.itemName(it)} for ${v} Botbucks`);
    this.hotbarDirty = true;
    this.renderWorkshop(); this.refreshHUD(true);
  },
  sellAll() {
    let v = 0, n = 0;
    G.bar.forEach((it, i) => { if (it && it.t === 'part') { v += this.itemValue(it); n++; G.bar[i] = null; } });
    if (!n) { Sound.play('deny'); this.toast('No materials in your hotbar', true); return; }
    G.bucks += v;
    Sound.play('buy');
    this.toast(`Sold ${n} materials for ${v} Botbucks`);
    this.hotbarDirty = true;
    this.renderWorkshop(); this.refreshHUD(true);
  },

  // ── storage ──
  deposit(slot) {
    const it = G.bar[slot];
    if (!it) return;
    if (it.t === 'weapon' && it.id === 'blaster') { Sound.play('deny'); this.toast('Keep your Pulse Blaster — you need at least one weapon', true); return; }
    G.bar[slot] = null; G.checkWeapon();
    G.store(it);
    Sound.play('pickup');
    this.hotbarDirty = true;
    this.renderWorkshop(); this.refreshHUD(true);
  },
  depositAll() {
    let n = 0;
    G.bar.forEach((it, i) => { if (it && it.t === 'part') { G.store(it); G.bar[i] = null; n++; } });
    if (!n) { Sound.play('deny'); this.toast('No materials in your hotbar', true); return; }
    Sound.play('craft');
    this.toast(`Stored ${n} materials`);
    this.hotbarDirty = true;
    this.renderWorkshop(); this.refreshHUD(true);
  },
  withdraw(key) {
    if (!G.storage[key]) return;
    const it = this.keyItem(key);
    if (!G.addItem(it)) { Sound.play('deny'); this.toast('Hotbar full', true); return; }
    G.storage[key]--;
    if (!G.storage[key]) delete G.storage[key];
    Sound.play('pickup');
    this.hotbarDirty = true;
    this.renderWorkshop(); this.refreshHUD(true);
  },

  renderWorkshop() {
    const m = this.mode;
    // left column: hotbar & gear
    const clickable = m === 'shop' || m === 'storage';
    let left = `<div class="bucks-big"><img src="${upgIconURL('bucks', '#ffd23f')}" alt=""><b>${G.bucks}</b><span>BOTBUCKS</span></div>`;
    left += `<h3>Hotbar <span class="muted">${G.barSize - G.freeSlots()}/${G.barSize}</span></h3><div class="inv-list">`;
    for (let i = 0; i < G.barSize; i++) {
      const it = G.bar[i];
      if (!it) { left += `<div class="inv-item empty slotrow"><div class="empty-slot">${(i + 1) % 10 === 0 && i < 10 ? 0 : i + 1}</div><div class="inv-info"><div class="inv-desc">Empty slot</div></div></div>`; continue; }
      const act = m === 'shop' ? `<button class="btn tiny" data-sell="${i}">Sell ${this.itemValue(it)}</button>` : m === 'storage' ? `<button class="btn tiny" data-dep="${i}">Store ▸</button>` : '';
      left += `<div class="inv-item ${clickable ? 'click' : ''}" style="--c:${this.itemColor(it)}"><img src="${this.itemIcon(it)}" alt=""><div class="inv-info"><div class="inv-name">${this.itemName(it)}</div><div class="inv-desc">${it.t === 'weapon' ? (it.id === G.weapon ? 'In hand' : 'Weapon') : it.t === 'supply' ? SHOP_ITEMS[it.id].desc.split('.')[1] || 'Supply' : 'Material · ' + PARTS[it.id].value + ' BB'}</div></div>${act}</div>`;
    }
    left += '</div>';
    left += `<h3>Gear</h3><div class="inv-list">
      ${this.gearRow('jetpack', 'Jetpack', G.gear.jetpack ? 'Hold Space / JUMP in mid-air' : 'Sold in the Mountains', G.gear.jetpack)}
      ${this.gearRow('fireboots', 'Fire Boots', G.gear.fireboots ? 'Lava-proof · Volcano access' : 'Sold in the Mountains', G.gear.fireboots)}
      ${this.gearRow('backpack', 'Backpack', `${G.barSize} hotbar slots`, G.gear.backpack > 0)}
      <div class="inv-item ${G.vehicle ? '' : 'empty'}" style="--c:#ffb347"><img src="${vehIconURL()}" alt=""><div class="inv-info"><div class="inv-name">Skyrider</div><div class="inv-desc">${G.vehicle ? `Hull ${Math.ceil(G.vehicle.hp)}/240 · ${Touch.enabled ? 'RIDE' : 'F'} to fly` : 'Build one in the Mechanic Room'}</div></div></div>
      <div class="inv-item" style="--c:#3aff9a"><img src="${spriteIconURL()}" alt=""><div class="inv-info"><div class="inv-name">Scrap Sprites</div><div class="inv-desc">Every 3 found = +20 max stamina</div></div><div class="inv-count">${G.spritesFound}</div></div>
    </div>`;
    $('ws-inv').innerHTML = left;
    $('ws-items').innerHTML = '';

    // middle: tabs + content
    const tabNames = { bots: 'Bots', base: 'Base', vehicle: 'Vehicle', charging: 'Charging', storage: 'Storage', sell: 'Sell', gear: 'Weapons & Gear', upgrades: 'Upgrades', supplies: 'Supplies' };
    $('ws-tabs').innerHTML = this.tabs.map((t) => `<button class="tab ${t === this.tab ? 'active' : ''}" data-tab="${t}">${tabNames[t]}</button>`).join('');
    $('ws-tabs').querySelectorAll('.tab').forEach((t) => (t.onclick = () => { this.tab = t.dataset.tab; Sound.play('click'); this.renderWorkshop(); }));
    $('ws-tabs').style.display = this.tabs.length > 1 ? '' : 'none';
    let mid = '';
    const useStorage = m === 'mechanic';
    if (m === 'field' || m === 'mechanic') {
      const kind = this.tab === 'bots' ? 'companion' : this.tab;
      const list = RECIPES.filter((r) => r.kind === kind);
      mid = list.map((r) => {
        const st = this.recipeState(r, useStorage);
        const color = r.kind === 'companion' ? COMP_DEFS[r.id].color : r.kind === 'vehicle' ? '#ffb347' : r.id === 'shieldgen' ? '#5ab8ff' : '#6bff9e';
        const icon = r.kind === 'companion' ? compIconURL(r.id) : r.kind === 'vehicle' ? vehIconURL() : upgIconURL(r.id, color);
        let meta = '';
        if (r.kind === 'companion') { const d = COMP_DEFS[r.id]; const owned = G.companions.filter((c) => c.kind === r.id).length; meta = `<div class="meta">SIMPLE BOT · HULL ${Math.round(d.hp * (1 + 0.3 * G.up.firmware))}${d.range ? ' · RANGE ' + d.range + 'M' : ''}${owned ? ` · <b>${owned} ACTIVE</b>` : ''}</div>`; }
        if (r.id === 'charger') meta = `<div class="pips">${Array.from({ length: r.max }, (_, i) => `<i class="${i < G.base.charger ? 'on' : ''}"></i>`).join('')}</div>`;
        if (r.kind === 'vehicle') meta = `<div class="meta">HULL 240 · TWIN CANNONS${G.vehicle ? ' · <b>OWNED</b>' : ''}</div>`;
        return this.card({ id: r.id, ok: st.ok, why: st.why, color, icon, name: r.name, desc: r.desc, meta, cost: this.costHTML(r.cost, useStorage), act: 'craft', verb: 'Build' });
      }).join('');
      if (m === 'field') mid += `<div class="ws-note">Premium bots, weapons, gear, upgrades and supplies are sold in the biome shops. Base systems are built in the Mechanic Room at home.</div>`;
      if (m === 'mechanic') mid += `<div class="ws-note">Costs use your storage first, then your hotbar.</div>`;
    } else if (m === 'charging') {
      mid = `<div class="charge-list">${G.companions.length ? G.companions.map((c) => `
        <div class="squad-item" style="--c:${c.d.color}"><img src="${compIconURL(c.kind)}" alt="">
          <div class="inv-info"><div class="inv-name">${c.d.name}</div>
            <div class="mini-bar batt"><i style="width:${c.battery}%"></i></div>
            <div class="mini-bar"><i style="width:${100 * c.hp / c.maxHp}%"></i></div>
            <div class="inv-desc">⚡ ${Math.floor(c.battery)}% · Hull ${Math.ceil(c.hp)}/${Math.round(c.maxHp)} · ${c.statusText}</div></div>
          ${c.active && c.battery < 100 ? `<button class="btn tiny" data-recall="${c.id}">Charge</button>` : ''}
        </div>`).join('') : '<div class="ws-note">No bots yet — build one in the Mechanic Room.</div>'}</div>
        <div class="ws-note">Bots drain their battery while they follow you out in the biomes. Below 15% they fly home, charge on these pads, and come back to you by themselves.
        A drained bot is fragile and its aim gets sloppy — so stay sharp: you do most of the fighting.<br><br>Charge speed: <b>${Math.round(100 / (100 / 32 * (1 + 0.6 * G.base.charger)))} s</b> for a full battery${G.base.charger < 2 ? ' — build Fast Chargers in the Mechanic Room' : ''}.</div>`;
    } else if (m === 'storage') {
      const keys = Object.keys(G.storage).filter((k) => G.storage[k] > 0).sort();
      mid = `<div class="row-btns"><button class="btn primary" id="dep-all">Store all materials</button></div><div class="store-grid">${keys.length ? keys.map((k) => {
        const it = this.keyItem(k);
        return `<button class="store-item" data-wd="${k}" style="--c:${this.itemColor(it)}" title="Withdraw one"><img src="${this.itemIcon(it)}" alt=""><span>${this.itemName(it)}</span><b>${G.storage[k]}</b></button>`;
      }).join('') : '<div class="ws-note">Storage is empty. Deposit materials from your hotbar — there is no limit.</div>'}</div><div class="ws-note">Click a stored item to move one back to your hotbar.</div>`;
    } else if (m === 'shop') {
      const shop = G.where === 'biome' ? ZONES[G.level].shop : null;
      if (this.tab === 'sell') {
        const parts = G.bar.filter((it) => it && it.t === 'part');
        const total = parts.reduce((n, it) => n + this.itemValue(it), 0);
        mid = `<div class="row-btns"><button class="btn primary" id="sell-all">Sell all materials (${total} BB)</button></div>
          <div class="price-list">${PART_ORDER.map((k) => `<div class="price-row" style="--c:${PARTS[k].color}"><img src="${partIconURL(k)}" alt=""><span>${PARTS[k].name}</span><b>${PARTS[k].value} BB</b></div>`).join('')}</div>
          <div class="ws-note">Use the <b>Sell</b> buttons in your hotbar list to sell single items. Weapons and supplies sell for 40% of their price.</div>`;
      } else {
        const want = { gear: ['weapon', 'gear'], bots: ['bot'], upgrades: ['upgrade'], supplies: ['supply'] }[this.tab];
        const ids = (shop ? shop.items : []).filter((id) => want.includes(SHOP_ITEMS[id].kind));
        mid = ids.map((id) => {
          const S = SHOP_ITEMS[id], st = this.shopState(id), price = this.price(id);
          let name, desc, icon, color, meta = '';
          if (S.kind === 'weapon') { const W = WEAPONS[id]; name = W.name; desc = W.desc; icon = weapIconURL(id); color = W.color; meta = `<div class="meta">DMG ${W.dmg}${W.pellets > 1 ? '×' + W.pellets : ''} · ${W.rate}/S${W.rocket ? ' · SPLASH' : ''}</div>`; }
          else if (S.kind === 'bot') { const d = COMP_DEFS[S.bot]; name = d.name; desc = COMP_DESC[S.bot]; icon = compIconURL(S.bot); color = d.color; meta = `<div class="meta">PREMIUM BOT · HULL ${Math.round(d.hp * (1 + 0.3 * G.up.firmware))}${d.range ? ' · RANGE ' + d.range + 'M' : ''}</div>`; }
          else if (S.kind === 'upgrade') { const U = UPGRADES[S.up]; name = U.name; desc = U.desc; icon = upgIconURL(S.up, '#3cf2ff'); color = '#3cf2ff'; meta = `<div class="pips">${Array.from({ length: U.max }, (_, i) => `<i class="${i < G.up[S.up] ? 'on' : ''}"></i>`).join('')}</div>`; }
          else { name = S.name; desc = S.desc; color = id === 'repair' ? '#6bff9e' : id === 'cell' ? '#b98cff' : id === 'fireboots' ? '#ff6a1a' : '#ffb347'; icon = upgIconURL(id, color); if (id === 'backpack') meta = `<div class="pips">${Array.from({ length: S.max }, (_, i) => `<i class="${i < G.gear.backpack ? 'on' : ''}"></i>`).join('')}</div>`; }
          return this.card({ id, ok: st.ok, why: st.why, color, icon, name, desc, meta, cost: this.priceHTML(price), act: 'buy', verb: 'Buy' });
        }).join('') || '<div class="ws-note">Nothing of this kind here — try another biome\'s shop.</div>';
      }
    }
    $('ws-recipes').innerHTML = mid;
    const R = $('ws-recipes');
    R.querySelectorAll('[data-act="craft"]').forEach((b) => (b.onclick = () => this.craft(b.dataset.id)));
    R.querySelectorAll('[data-act="buy"]').forEach((b) => (b.onclick = () => this.buy(b.dataset.id)));
    R.querySelectorAll('[data-wd]').forEach((b) => (b.onclick = () => this.withdraw(b.dataset.wd)));
    R.querySelectorAll('[data-recall]').forEach((b) => (b.onclick = () => { const c = G.companions.find((x) => x.id === +b.dataset.recall); if (c) { c.state = 'leaving'; c.stateT = 1.4; } this.renderWorkshop(); }));
    const da = $('dep-all'); if (da) da.onclick = () => this.depositAll();
    const sa = $('sell-all'); if (sa) sa.onclick = () => this.sellAll();
    $('ws-inv').querySelectorAll('[data-sell]').forEach((b) => (b.onclick = () => this.sell(+b.dataset.sell)));
    $('ws-inv').querySelectorAll('[data-dep]').forEach((b) => (b.onclick = () => this.deposit(+b.dataset.dep)));

    // right column: squad & pilot
    $('ws-slots').textContent = `${G.companions.length}/${G.slots}`;
    let squad = G.companions.map((c) => `
      <div class="squad-item" style="--c:${c.d.color}">
        <img src="${compIconURL(c.kind)}" alt="">
        <div class="inv-info"><div class="inv-name">${c.d.name}</div>
          <div class="mini-bar batt"><i style="width:${c.battery}%"></i></div>
          <div class="mini-bar"><i style="width:${100 * c.hp / c.maxHp}%"></i></div>
          <div class="inv-desc">⚡${Math.floor(c.battery)}% · ${c.statusText}</div></div>
        <button class="btn tiny" data-scrap="${c.id}" title="Dismantle">Scrap</button>
      </div>`).join('');
    for (let i = G.companions.length; i < G.slots; i++) squad += `<div class="squad-item empty"><div class="empty-slot">+</div><div class="inv-desc">Empty slot — build or buy a bot</div></div>`;
    $('ws-squad').innerHTML = squad;
    $('ws-squad').querySelectorAll('[data-scrap]').forEach((b) => (b.onclick = () => this.scrapCompanion(+b.dataset.scrap)));

    const p = G.player, W = p.weapon;
    $('ws-player').innerHTML = `
      <div class="pilot-row"><span>Hull</span><b>${Math.ceil(p.hp)} / ${p.maxHp}</b></div>
      <div class="pilot-row"><span>Weapon</span><b>${W.name}</b></div>
      <div class="pilot-row"><span>Fire rate</span><b>${p.fireRate.toFixed(1)}/s${G.weapon === 'blaster' ? ' × ' + (1 + G.up.split) : ''}</b></div>
      <div class="pilot-row"><span>Move speed</span><b>${p.speed.toFixed(1)} m/s</b></div>
      <div class="pilot-row"><span>Magnet radius</span><b>${p.magnet} m</b></div>
      <div class="pilot-row"><span>Squad damage</span><b>+${G.up.firmware * 30}%</b></div>`;
  },

  gearRow(id, name, desc, on) {
    const color = id === 'fireboots' ? '#ff6a1a' : '#ffb347';
    return `<div class="inv-item ${on ? '' : 'empty'}" style="--c:${color}"><img src="${upgIconURL(id, color)}" alt=""><div class="inv-info"><div class="inv-name">${name}</div><div class="inv-desc">${desc}</div></div></div>`;
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
    const el = type === 'bucks' ? $('bucks-box') : $('hp-' + type);
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
  renderHotbar() {
    this.hotbarDirty = false;
    let h = '';
    for (let i = 0; i < G.barSize; i++) {
      const it = G.bar[i];
      const key = i < 10 ? (i + 1) % 10 : '';
      h += `<div class="hb ${i === G.sel ? 'sel' : ''} ${it ? '' : 'empty'} ${it && it.t === 'weapon' && it.id === G.weapon ? 'held' : ''}" data-slot="${i}" style="--c:${it ? this.itemColor(it) : '#ffffff'}" title="${it ? this.itemName(it) : 'Empty'}">${it ? `<img src="${this.itemIcon(it)}" alt="">` : ''}<em>${key}</em></div>`;
    }
    $('hud-parts').innerHTML = h;
    const it = G.bar[G.sel];
    $('hb-name').textContent = it ? this.itemName(it) : '';
  },

  refreshHUD(force) {
    if (G.state !== 'playing' && !force) return;
    const p = G.player;
    const hub = G.where === 'hub';
    const Z = hub ? HUB : ZONES[G.level];
    const hk = p.hp / p.maxHp;
    $('bar-hull').style.width = (hk * 100).toFixed(1) + '%';
    $('bar-hull').style.setProperty('--c', hk < 0.3 ? '#ff3b5c' : hk < 0.6 ? '#ffc23c' : '#3cf2ff');
    $('val-hull').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}` + (p.shield > 0 ? ` +${Math.ceil(p.shield)}` : '');
    $('bar-plasma').style.width = p.energy + '%';
    $('val-plasma').textContent = p.energy >= 100 ? 'READY' : G.cells ? `+${G.cells} CELL` : '';
    $('bar-dash').style.width = (100 * (1 - Math.max(0, p.dashCd) / p.dashMax)) + '%';
    $('val-repair').textContent = Touch.enabled ? `REPAIR ×${G.repairKits}` : `[R] REPAIR ×${G.repairKits}`;
    $('vitals').classList.toggle('low', hk < 0.3);
    const vr = $('veh-row');
    vr.classList.toggle('show', !!G.vehicle);
    if (G.vehicle) {
      $('bar-veh').style.width = (100 * G.vehicle.hp / G.vehicle.maxHp) + '%';
      $('val-veh').textContent = G.riding ? 'FLYING' : Touch.enabled ? 'RIDE' : '[F] RIDE';
    }
    $('fuel-row').classList.toggle('show', !!G.gear.jetpack);
    if (G.gear.jetpack) { $('bar-fuel').style.width = p.fuel + '%'; $('val-fuel').textContent = p.jetting ? 'BURN' : p.fuel >= 100 ? 'FULL' : ''; }
    $('hud-bucks').textContent = G.bucks;
    document.body.classList.toggle('riding', G.riding);
    document.body.classList.toggle('frozen', p.frozenT > 0 && !p.dead);
    document.body.classList.toggle('burning', p.burnT > 0 && !p.dead);
    // stamina wheel (hidden while full)
    const stEl = $('stamina');
    const base = Math.min(p.stamina, 100), extra = Math.max(0, p.stamina - 100), extraMax = p.maxStamina - 100;
    $('st-fill').style.strokeDasharray = `${base} 100`;
    stEl.classList.toggle('extra', extraMax > 0);
    if (extraMax > 0) $('st-fill2').style.strokeDasharray = `${(extra / extraMax) * 100} 100`;
    if (p.stamina < p.maxStamina - 0.5 || p.exhausted) this.stShowT = 1.2; else this.stShowT = (this.stShowT || 0) - 1 / 60;
    stEl.classList.toggle('show', this.stShowT > 0 && !G.riding);
    stEl.classList.toggle('exhausted', p.exhausted);
    $('focus-vignette').classList.toggle('on', G.focus);

    const sig = G.bar.map((it) => (it ? it.t + it.id : '-')).join(',') + '|' + G.sel + '|' + G.weapon + '|' + G.barSize;
    if (this.hotbarDirty || sig !== this.hotbarSig || force) { this.hotbarSig = sig; this.renderHotbar(); }
    // squad (battery + hull per bot)
    const ssig = G.companions.map((c) => c.id).join(',') + '|' + G.slots;
    if (ssig !== this.squadSig || force) {
      this.squadSig = ssig;
      let h = '';
      for (let i = 0; i < G.slots; i++) {
        const c = G.companions[i];
        h += c ? `<div class="sq" id="sq-${c.id}" style="--c:${c.d.color}"><img src="${compIconURL(c.kind)}" alt=""><i><u></u></i><i class="bt"><u></u></i><s></s></div>` : '<div class="sq empty">+</div>';
      }
      $('hud-squad').innerHTML = h;
    }
    for (const c of G.companions) {
      const el = $('sq-' + c.id);
      if (!el) continue;
      el.classList.toggle('off', !c.active);
      el.classList.toggle('lowbat', c.active && c.battery < 30);
      const u = el.querySelectorAll('u');
      u[0].style.width = (100 * c.hp / c.maxHp) + '%';
      u[1].style.width = c.battery + '%';
      el.querySelector('s').textContent = c.active ? '' : c.state === 'down' ? '✖' : '⚡' + Math.floor(c.battery);
    }

    // objective
    const done = World.beacons.filter((b) => b.state === 'done').length;
    const charging = World.beacons.find((b) => b.state === 'charging');
    let obj = '', prog = -1;
    if (hub) {
      const next = ZONES.findIndex((z, i) => !G.progress.beaten[i]);
      obj = G.raid ? 'Fight off the raiders!' : next < 0 ? 'Every biome is free — explore at will' : G.portalLock(next) ? G.portalLock(next) : `Enter the ${ZONES[next].name} portal`;
    } else if (G.objective === 'beacons') {
      obj = charging ? (charging.inside ? `Defend the uplink — ${Math.floor(charging.progress * 100)}%` : 'Return to the uplink ring!') : `Activate signal beacons (${done}/${World.beacons.length})`;
      if (charging) prog = charging.progress;
    } else if (G.objective === 'arena') obj = 'Enter the dome — there is no way out until the boss falls';
    else if (G.objective === 'boss') obj = G.boss ? `Destroy ${G.boss.name}` : 'Something is coming…';
    else if (G.objective === 'extract') obj = World.portal ? 'Step into the portal home' : 'Portal incoming…';
    else obj = 'Heading home…';
    $('obj-zone').textContent = hub ? 'HOME BASE' : `BIOME ${G.level + 1} · ${Z.name.toUpperCase()}`;
    $('obj-zone').style.color = hub ? '' : Z.accent;
    $('obj-text').textContent = obj;
    $('obj-text').classList.toggle('warn', (!!charging && !charging.inside) || !!G.raid);
    $('obj-prog').style.display = prog >= 0 ? '' : 'none';
    $('obj-prog-fill').style.width = (prog * 100).toFixed(1) + '%';
    $('obj-kills').textContent = hub ? `BIOMES CLEARED ${G.progress.beaten.filter(Boolean).length}/5  ·  STORED ${Object.values(G.storage).reduce((a, b) => a + b, 0)}` : `KILLS ${G.stats.kills}  ·  CACHES ${World.caches.filter((c) => c.opened).length}/${World.caches.length}  ·  SPRITES ${World.sprites.filter((s) => s.found).length}/${World.sprites.length}`;

    // boss bar
    const b = G.boss;
    if (b && !b.dead) {
      $('bossbar').classList.add('show');
      $('bossbar').style.setProperty('--c', b.color);
      $('boss-name').textContent = b.name + (b.phase === 2 ? ' — OVERDRIVE' : '') + (b.hidden ? ' — VANISHED' : '');
      $('boss-fill').style.width = (100 * b.hp / b.maxHp) + '%';
    } else $('bossbar').classList.remove('show');

    // interaction prompt
    const it = G.state === 'playing' && !p.dead ? nextInteractable() : null;
    const pr = $('prompt');
    if (it) {
      const key = Touch.enabled ? '<kbd>USE</kbd>' : '<kbd>E</kbd>';
      const txt = {
        cache: `Open ${it.obj.golden ? '<b class="gold">golden</b> ' : ''}salvage cache`, launch: 'Launch skyward', beacon: 'Start beacon uplink',
        mechanic: 'Use the <b>Mechanic Room</b>', charging: 'Open the <b>Charging Room</b>', storage: 'Open <b>Storage</b>', shop: 'Trade at the <b>shop</b>',
        home: 'Return to <b>home base</b>',
        portal: it.kind === 'portal' ? (G.portalLock(it.obj.i) ? `<span class="locked">Locked — ${G.portalLock(it.obj.i)}</span>` : `Travel to <b>${ZONES[it.obj.i].name}</b>`) : '',
      }[it.kind];
      pr.innerHTML = `${key} ${txt}`;
      pr.classList.add('show');
    } else pr.classList.remove('show');

    this.drawCompass();
    this.drawRadar();
  },

  markers() {
    const M = [];
    if (G.where === 'hub') {
      for (const P of World.hubPortals) M.push({ x: P.x, z: P.z, color: P.open ? ZONES[P.i].accent : '#6a7080', shape: 'ring', label: true, big: P.open });
      for (const t of World.terminals) M.push({ x: t.x, z: t.z, color: t.color, shape: 'square', range: 60 });
      return M;
    }
    const Z = ZONES[G.level];
    for (const b of World.beacons) {
      M.push({ x: b.x, z: b.z, color: b.state === 'done' ? '#6bff9e' : b.state === 'charging' ? Z.accent : '#ffb347', shape: 'diamond', label: true, big: b.state !== 'done' });
    }
    for (const c of World.caches) if (!c.opened) M.push({ x: c.x, z: c.z, color: c.golden ? '#ffd23f' : '#3cf2ff', shape: 'square', range: c.revealed ? 0 : 70 });
    for (const sp of World.sprites) if (!sp.found && sp.revealed) M.push({ x: sp.x, z: sp.z, color: '#3aff9a', shape: 'diamond', range: 0 });
    if (!World.sky) for (const is of World.islands) M.push({ x: is.x, z: is.z, color: '#dff6ff', shape: 'cloud', range: 160 });
    if (G.objective === 'arena' || G.objective === 'boss') M.push({ x: World.arena.x, z: World.arena.z, color: Z.boss.color, shape: 'skull', label: true, big: true });
    if (World.portal) M.push({ x: World.portal.x, z: World.portal.z, color: '#6bff9e', shape: 'ring', label: true, big: true });
    if (World.homePortal) M.push({ x: World.homePortal.x, z: World.homePortal.z, color: '#3cf2ff', shape: 'ring', range: 0 });
    if (World.shop) M.push({ x: World.shop.x, z: World.shop.z, color: '#ffd23f', shape: 'square', range: 0 });
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
      else if (m.shape === 'cloud') { g.arc(x - 3, y + 1, 3, 0, TAU); g.arc(x + 3, y + 1, 3, 0, TAU); g.arc(x, y - 1.5, 3.6, 0, TAU); g.fill(); }
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
    for (const k of G.pickups) dot(k.pos.x, k.pos.z, k.type === 'health' ? '#6bff9e' : k.type === 'bucks' ? '#ffd23f' : k.type === 'item' ? '#ffffff' : PARTS[k.type].color, 1.5);
    for (const c of World.caches) if (!c.opened) dot(c.x, c.z, c.golden ? '#ffd23f' : '#3cf2ff', 2.5);
    for (const b of World.beacons) dot(b.x, b.z, b.state === 'done' ? '#6bff9e' : '#ffb347', 4, true);
    for (const is of World.islands) dot(is.x, is.z, 'rgba(223,246,255,0.5)', Math.min(10, is.r * (R - 6) / 70));
    for (const P of World.hubPortals) dot(P.x, P.z, P.open ? ZONES[P.i].accent : '#6a7080', 4, true);
    for (const t of World.terminals) dot(t.x, t.z, t.color, 2.5);
    if (World.homePortal) dot(World.homePortal.x, World.homePortal.z, '#3cf2ff', 3.5, true);
    if (World.shop) dot(World.shop.x, World.shop.z, '#ffd23f', 3.5, true);
    for (const b of World.braziers) dot(b.x, b.z, b.alerted ? '#ff3b5c' : '#ffb347', 1.5);
    for (const s of G.spawns) dot(s.x, s.z, '#ffffff', 2);
    for (const e of G.enemies) if (!e.hidden) dot(e.pos.x, e.pos.z, e.isBoss ? e.color : e.elite ? '#ffd700' : e.aggro ? '#ff3b5c' : '#ff8a6a', e.isBoss ? 5 : e.r > 1.5 ? 3.5 : 2.5, e.isBoss);
    for (const c of G.companions) if (c.inScene) dot(c.pos.x, c.pos.z, c.d.color, 2);
    g.restore();
    g.strokeStyle = 'rgba(60,242,255,0.4)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(R, R, R - 2, 0, TAU); g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(R, R - 6); g.lineTo(R + 4.5, R + 5); g.lineTo(R, R + 2.5); g.lineTo(R - 4.5, R + 5); g.closePath(); g.fill();
  },
};
