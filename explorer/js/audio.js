'use strict';
// Fully synthesized sound effects + a small procedural synthwave soundtrack (shared design with the 2D game).
const Sound = (() => {
  let ctx = null, master = null, sfx = null, music = null, noiseBuf = null;
  let muted = false;
  let volMul = 1;
  const last = {};
  const gaps = { chirp: 400, alarm: 600, shoot: 45, hit: 35, enemyShoot: 70, explode: 45, pickup: 35, zap: 60, block: 50, heal: 350, laser: 250, missile: 90, click: 30 };

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7;
    comp.connect(master); master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.55; sfx.connect(comp);
    music = ctx.createGain(); music.gain.value = 0.2; music.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startMusic();
  }

  function tone(t, f, dur, type = 'square', vol = 0.2, slide = null, dest = sfx) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol * (dest === sfx ? volMul : 1), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function noise(t, dur, vol, freq = 2000, ftype = 'lowpass', slideFreq = null, dest = sfx) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = ftype;
    f.frequency.setValueAtTime(freq, t);
    if (slideFreq) f.frequency.exponentialRampToValueAtTime(slideFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, vol * (dest === sfx ? volMul : 1)), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  const S = {
    shoot(t) { tone(t, rand(820, 940), 0.07, 'square', 0.05, 240); },
    hit(t) { tone(t, 320, 0.05, 'square', 0.04, 120); },
    enemyShoot(t) { tone(t, 520, 0.1, 'sawtooth', 0.035, 180); },
    explode(t, big) {
      noise(t, big ? 0.9 : 0.4, big ? 0.55 : 0.3, big ? 1400 : 2200, 'lowpass', 60);
      tone(t, big ? 110 : 160, big ? 0.7 : 0.3, 'sine', big ? 0.45 : 0.25, 30);
    },
    pickup(t) { tone(t, 1250, 0.06, 'sine', 0.07); tone(t + 0.05, 1880, 0.08, 'sine', 0.05); },
    dash(t) { noise(t, 0.25, 0.22, 700, 'bandpass', 3500); },
    hurt(t) { tone(t, 180, 0.22, 'sawtooth', 0.16, 55); noise(t, 0.15, 0.18, 1600); },
    craft(t) { [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.07, f, 0.3, 'triangle', 0.1)); },
    deny(t) { tone(t, 200, 0.12, 'square', 0.07); tone(t + 0.1, 150, 0.15, 'square', 0.07); },
    bomb(t) { noise(t, 1.1, 0.6, 700, 'lowpass', 40); tone(t, 70, 0.9, 'sine', 0.5, 22); },
    throw(t) { tone(t, 300, 0.25, 'triangle', 0.08, 900); },
    laser(t) { tone(t, 1500, 0.3, 'sawtooth', 0.025, 500); },
    zap(t) { noise(t, 0.12, 0.12, 4200, 'highpass'); tone(t, 2100, 0.08, 'square', 0.03, 600); },
    missile(t) { noise(t, 0.3, 0.1, 1500, 'bandpass', 400); },
    warn(t) { for (let i = 0; i < 3; i++) { tone(t + i * 0.55, 440, 0.28, 'square', 0.09); tone(t + i * 0.55 + 0.28, 330, 0.25, 'square', 0.09); } },
    wave(t) { tone(t, 392, 0.15, 'triangle', 0.1); tone(t + 0.12, 587, 0.3, 'triangle', 0.1); },
    win(t) { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(t + i * 0.1, f, 0.45, 'triangle', 0.1)); },
    lose(t) { [392, 330, 262, 196].forEach((f, i) => tone(t + i * 0.18, f, 0.4, 'sawtooth', 0.08)); },
    block(t) { tone(t, 1600, 0.05, 'square', 0.035, 900); },
    heal(t) { tone(t, 700, 0.12, 'sine', 0.04, 1100); },
    click(t) { tone(t, 900, 0.04, 'square', 0.035); },
    spawn(t) { tone(t, 200, 0.4, 'sine', 0.05, 800); },
    online(t) { tone(t, 600, 0.1, 'triangle', 0.06); tone(t + 0.08, 900, 0.12, 'triangle', 0.06); },
    jump(t) { tone(t, 220, 0.15, 'triangle', 0.05, 440); },
    land(t) { noise(t, 0.12, 0.12, 500, 'lowpass'); },
    cache(t) { tone(t, 330, 0.12, 'square', 0.06); [659, 880, 1318].forEach((f, i) => tone(t + 0.1 + i * 0.07, f, 0.3, 'triangle', 0.08)); },
    uplink(t) { tone(t, 200, 1.2, 'sawtooth', 0.05, 800); tone(t + 0.2, 400, 1.0, 'triangle', 0.06, 1200); },
    beaconDone(t) { [392, 523, 659, 784].forEach((f, i) => tone(t + i * 0.12, f, 0.6, 'triangle', 0.1)); },
    portal(t) { tone(t, 100, 1.6, 'sine', 0.2, 900); noise(t, 1.2, 0.2, 400, 'bandpass', 4000); },
    glide(t) { noise(t, 0.4, 0.14, 900, 'bandpass', 2400); tone(t, 520, 0.18, 'triangle', 0.04, 780); },
    launch(t) { noise(t, 1.4, 0.35, 300, 'bandpass', 5000); tone(t, 110, 1.3, 'sawtooth', 0.12, 880); [523, 784, 1046].forEach((f, i) => tone(t + 0.3 + i * 0.1, f, 0.4, 'triangle', 0.06)); },
    sprite(t) { [1046, 1318, 1568, 2093].forEach((f, i) => tone(t + i * 0.08, f, 0.22, 'sine', 0.07)); tone(t + 0.4, 784, 0.1, 'square', 0.03, 1568); tone(t + 0.52, 1568, 0.14, 'square', 0.03, 784); },
    deploy(t) { tone(t, 180, 0.5, 'sawtooth', 0.08, 520); noise(t, 0.5, 0.18, 1200, 'bandpass', 3000); },
    alarm(t) { for (let i = 0; i < 3; i++) tone(t + i * 0.16, 880, 0.12, 'square', 0.05, 660); },
    chirp(t) { const f = rand(900, 1500); tone(t, f, 0.07, 'square', 0.02, f * 1.4); tone(t + 0.09, f * 1.2, 0.07, 'square', 0.02, f * 0.8); },
    slam(t) { noise(t, 0.9, 0.6, 500, 'lowpass', 40); tone(t, 55, 0.9, 'sine', 0.5, 25); },
  };

  // vol: 0..1 multiplier, used for distance attenuation
  function play(name, arg, vol = 1) {
    if (!ctx || muted || vol < 0.03) return;
    const now = performance.now();
    const g = gaps[name] || 0;
    if (g && last[name] && now - last[name] < g) return;
    last[name] = now;
    volMul = vol;
    S[name](ctx.currentTime + 0.005, arg);
    volMul = 1;
  }

  // ─────────── Music: three composed themes (explore · combat · boss) ───────────
  // Melodies are written in note names, 8 eighth-notes per bar: '-' rest, '~' hold.
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const acc = (a) => (a === '#' ? 1 : a === 'b' ? -1 : 0);
  const n2m = (s) => { const m = s.match(/^([A-G])(#|b)?(\d)$/); return 12 * (+m[3] + 1) + NOTE[m[1]] + acc(m[2]); };
  const chordOf = (name) => { const m = name.match(/^([A-G])(#|b)?(m?)$/); return { root: NOTE[m[1]] + acc(m[2]), minor: !!m[3] }; };
  function parseBar(str) {
    const out = new Array(8).fill(null);
    let last = -1;
    str.trim().split(/\s+/).forEach((tok, i) => {
      if (tok === '~') { if (last >= 0) out[last].len++; }
      else if (tok === '-') last = -1;
      else { out[i] = { m: n2m(tok), len: 1 }; last = i; }
    });
    return out;
  }
  const sec = (name, chords, mel) => ({ name, chords: chords.split(' ').map(chordOf), mel: mel.map(parseBar) });
  function song(sections, order) {
    const bars = [];
    for (const k of order) { const S = sections[k]; S.mel.forEach((m, i) => bars.push({ chord: S.chords[i], mel: m, sec: k, idx: i })); }
    return bars;
  }

  const EXPLORE = song({
    a: sec('a', 'Am F C G Am F Dm E', [
      'A4 - - E5 - - C5 -', '- - F5 - E5 - C5 -', 'G4 - - E5 - - D5 -', '- - B4 - - D5 ~ -',
      'A4 - - E5 - - A5 -', 'G5 - F5 - E5 - C5 -', 'D5 - - F5 - A5 - F5', 'E5 ~ ~ ~ G#4 ~ B4 -']),
    b: sec('b', 'Am F C G Am F Dm E', [
      'C5 - - A4 - - E5 -', 'F5 ~ E5 - D5 - C5 -', 'E5 - - G5 - - C6 -', 'B5 ~ A5 - G5 ~ D5 -',
      'E5 ~ ~ - A4 - C5 -', 'F5 - A5 - G5 - F5 -', 'E5 - D5 - C5 - B4 -', 'B4 ~ ~ ~ E4 ~ ~ ~']),
  }, ['a', 'b']);

  const COMBAT = song({
    a: sec('a', 'Am F C G Am F C G', [
      'A4 - C5 - E5 ~ D5 C5', 'A4 ~ ~ - F4 - A4 C5', 'G4 - C5 - E5 ~ G5 E5', 'D5 ~ ~ ~ B4 - - -',
      'A4 - C5 - E5 ~ A5 G5', 'F5 ~ E5 ~ C5 ~ A4 -', 'G4 - E5 - D5 ~ C5 -', 'B4 ~ ~ ~ D5 ~ ~ ~']),
    b: sec('b', 'F G Am Am F G C E', [
      'C5 C5 - C5 D5 - C5 -', 'B4 - G4 - D5 ~ ~ -', 'C5 C5 - C5 E5 - D5 C5', 'A4 ~ ~ ~ - - E5 G5',
      'A5 ~ G5 - F5 - E5 -', 'D5 ~ E5 - D5 - B4 -', 'C5 - E5 - G5 ~ E5 C5', 'B4 ~ ~ ~ G#4 ~ B4 -']),
    c: sec('c', 'Dm Am E Am Dm Am F E', [
      'D5 - F5 - A5 ~ G5 F5', 'E5 ~ ~ - C5 - A4 -', 'G#4 - B4 - E5 ~ D5 B4', 'C5 ~ ~ ~ A4 ~ ~ ~',
      'D5 - F5 - A5 ~ C6 A5', 'B5 ~ A5 - G5 - E5 -', 'F5 ~ E5 - D5 - C5 -', 'B4 ~ ~ ~ E5 ~ ~ ~']),
  }, ['a', 'b', 'a', 'b', 'c', 'b']);

  const BOSS = song({
    a: sec('a', 'Am Am F F Dm Dm E E', [
      'A5 - E5 - A5 - B5 C6', 'B5 - A5 - E5 ~ ~ -', 'F5 - A5 - C6 ~ B5 A5', 'G#5 ~ ~ ~ E5 ~ ~ ~',
      'D5 - F5 - A5 - D6 -', 'C6 ~ B5 - A5 - F5 -', 'E5 - G#5 - B5 ~ D6 -', 'C6 - B5 - G#5 ~ E5 -']),
    b: sec('b', 'Am Am F F Dm E Am E', [
      'A4 A4 C5 A4 E5 A4 C5 E5', 'A5 ~ G5 - E5 - C5 -', 'F4 F4 A4 F4 C5 F4 A4 C5', 'F5 ~ E5 - C5 - A4 -',
      'D5 D5 F5 D5 A5 D5 F5 A5', 'G#5 ~ ~ - B5 ~ ~ -', 'A5 ~ E5 - C5 - A4 -', 'G#4 ~ B4 ~ E5 ~ G#5 ~']),
  }, ['a', 'b']);

  const THEMES = { explore: EXPLORE, combat: COMBAT, boss: BOSS };
  // each zone gets its own key and tempo so the soundtrack doesn't wear thin
  const ZONE_MUSIC = [{ t: 0, bpm: 116 }, { t: -2, bpm: 122 }, { t: 3, bpm: 112 }, { t: -4, bpm: 108 }, { t: 2, bpm: 124 }, { t: -1, bpm: 128 }];
  let zoneMusic = ZONE_MUSIC[0];

  let step = 0, nextTime = 0, intensity = 0, timer = null;
  let theme = 'explore', barIdx = -1, leadBus = null;

  function setupBus() {
    leadBus = ctx.createGain(); leadBus.gain.value = 1;
    const delay = ctx.createDelay(1.5), fb = ctx.createGain(), wet = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3200;
    fb.gain.value = 0.32; wet.gain.value = 0.35;
    leadBus.connect(music);
    leadBus.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(wet); wet.connect(music);
    leadBus.delay = delay;
  }

  function kick(t, v = 0.55) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(music); o.start(t); o.stop(t + 0.24);
  }
  function snare(t, v = 0.16) { noise(t, 0.15, v, 2200, 'bandpass', null, music); tone(t, 190, 0.08, 'triangle', v * 0.6, 120, music); }
  function hat(t, v = 0.05, open = false) { noise(t, open ? 0.16 : 0.035, v, 8000, 'highpass', null, music); }

  // lead voices: soft pluck for exploring, bright twin-oscillator lead for combat, snarling saw for bosses
  function lead(t, m, dur, style) {
    const f = mtof(m);
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const oscs = [];
    if (style === 'pluck') {
      oscs.push(['triangle', f, 0], ['sine', f * 2, 0]);
      lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.4);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.5, dur * 1.4));
    } else {
      oscs.push([style === 'boss' ? 'sawtooth' : 'square', f, -6], ['sawtooth', f, 7]);
      lp.frequency.setValueAtTime(style === 'boss' ? 4200 : 3000, t); lp.frequency.exponentialRampToValueAtTime(1400, t + dur);
      const v = style === 'boss' ? 0.05 : 0.045;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.012); g.gain.setValueAtTime(v * 0.8, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    }
    const vib = ctx.createOscillator(), vg = ctx.createGain();
    vib.frequency.value = 5.5; vg.gain.value = style === 'pluck' ? 0 : f * 0.006;
    vib.connect(vg);
    for (const [type, freq, det] of oscs) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = det;
      vg.connect(o.frequency); o.connect(lp); o.start(t); o.stop(t + dur + 1.5);
    }
    vib.start(t); vib.stop(t + dur + 1.5);
    lp.connect(g).connect(leadBus);
  }

  // low = lowest allowed MIDI note for the chord root (keeps voicings in one register)
  function pad(t, chord, low, dur, v) {
    const base = low + ((chord.root - (low % 12) + 12) % 12);
    const iv = [0, chord.minor ? 3 : 4, 7];
    for (const x of iv) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = mtof(base + x);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.25); g.gain.setValueAtTime(v, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(music); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  function stepDur() {
    const k = theme === 'explore' ? 0.86 : theme === 'boss' ? 1.1 : 1;
    return 60 / (zoneMusic.bpm * k) / 4;
  }

  function playStep(t) {
    const i = step % 16;
    if (i === 0) {
      const want = intensity >= 2 ? 'boss' : intensity >= 1 ? 'combat' : 'explore';
      if (want !== theme) { theme = want; barIdx = 0; if (want !== 'explore') noise(t, 1.2, 0.12, 6000, 'highpass', null, music); }
      else barIdx = (barIdx + 1) % THEMES[theme].length;
    }
    const bars = THEMES[theme];
    const bar = bars[Math.max(0, barIdx)];
    const T = zoneMusic.t;
    const sd = stepDur();
    const ch = bar.chord;
    const root = 45 + ((ch.root - 9 + 12) % 12) + T; // bass register around A2
    const fill = bar.idx === 7;

    if (theme === 'explore') {
      if (i === 0) pad(t, ch, 55 + T, sd * 16, 0.028);
      if (i === 0 || i === 8) tone(t, mtof(root), sd * 7, 'sine', 0.13, null, music);
      if (i % 2 === 0) hat(t, i % 4 === 0 ? 0.02 : 0.012);
      if (i === 0 && bar.idx % 4 === 0) kick(t, 0.25);
      if (i === 12) tone(t, 1800, 0.03, 'square', 0.015, 900, music);
      const ev = i % 2 === 0 ? bar.mel[i / 2] : null;
      if (ev) lead(t, ev.m + T, ev.len * 2 * sd, 'pluck');
    } else if (theme === 'combat') {
      if (i === 0) pad(t, ch, 55 + T, sd * 16, 0.018);
      if (i === 0 && bar.idx === 0) noise(t, 1.0, 0.1, 5000, 'highpass', null, music); // crash
      if (i % 4 === 0) kick(t);
      if (i === 4 || i === 12) snare(t);
      if (fill && i >= 8) snare(t, 0.05 + (i - 8) * 0.018);
      hat(t, i % 2 ? 0.035 : 0.06, i % 4 === 2);
      const pat = [0, 0, 12, 0, 0, 0, 12, 7];
      if (i % 2 === 0) tone(t, mtof(root + pat[i / 2]), sd * 1.8, 'sawtooth', 0.11, null, music);
      if (bar.sec === 'b') {
        const arp = [0, ch.minor ? 3 : 4, 7, 12];
        tone(t, mtof(root + 24 + arp[i % 4]), sd * 0.9, 'square', 0.018, null, music);
      }
      const ev = i % 2 === 0 ? bar.mel[i / 2] : null;
      if (ev) lead(t, ev.m + T, ev.len * 2 * sd * 0.92, 'lead');
    } else {
      if (i === 0) pad(t, ch, 55 + T, sd * 16, 0.02);
      if (i % 4 === 0 || i === 14) kick(t, 0.6);
      if (i === 4 || i === 12) snare(t, 0.18);
      if (fill && i >= 8 && i % 2 === 0) snare(t, 0.1);
      hat(t, i % 2 ? 0.04 : 0.07);
      const pat = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 0, 12, 10, 7];
      tone(t, mtof(root + pat[i]), sd * 0.9, 'sawtooth', 0.1, null, music);
      const ev = i % 2 === 0 ? bar.mel[i / 2] : null;
      if (ev) lead(t, ev.m + T, ev.len * 2 * sd * 0.9, 'boss');
    }
  }

  function tick() {
    if (!ctx) return;
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.25) {
      playStep(nextTime);
      if (leadBus) leadBus.delay.delayTime.setValueAtTime(stepDur() * 3, nextTime);
      nextTime += stepDur();
      step++;
    }
  }

  function startMusic() {
    if (timer) return;
    setupBus();
    nextTime = ctx.currentTime + 0.1;
    timer = setInterval(tick, 50);
  }

  return {
    init,
    play,
    setIntensity(v) { intensity = v; },
    setZone(i) { zoneMusic = ZONE_MUSIC[i % ZONE_MUSIC.length]; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.7, ctx.currentTime, 0.05);
      return muted;
    },
    get muted() { return muted; },
  };
})();
