'use strict';
// Fully synthesized sound effects + a small procedural synthwave soundtrack.
const Sound = (() => {
  let ctx = null, master = null, sfx = null, music = null, noiseBuf = null;
  let muted = false;
  const last = {};
  const gaps = { shoot: 45, hit: 35, enemyShoot: 70, explode: 45, pickup: 35, zap: 60, block: 50, heal: 350, laser: 250, missile: 90, click: 30 };

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
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
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
    g.gain.setValueAtTime(vol, t);
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
  };

  function play(name, arg) {
    if (!ctx || muted) return;
    const now = performance.now();
    const g = gaps[name] || 0;
    if (g && last[name] && now - last[name] < g) return;
    last[name] = now;
    S[name](ctx.currentTime + 0.005, arg);
  }

  // ─────────── Music sequencer ───────────
  let step = 0, nextTime = 0, intensity = 0, timer = null;
  const bpm = 112;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const roots = [45, 41, 48, 43]; // A F C G
  const chords = [[0, 3, 7, 12], [0, 4, 7, 12], [0, 4, 7, 12], [0, 4, 7, 11]];

  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(music); o.start(t); o.stop(t + 0.22);
  }

  function playStep(s, t) {
    const bar = Math.floor(s / 16) % 4, i = s % 16;
    const root = roots[bar];
    // bass
    if (i % 2 === 0) tone(t, mtof(root + (i % 4 === 2 ? 12 : 0)), 0.2, 'sawtooth', 0.12, null, music);
    // hats
    if (i % 2 === 1) noise(t, 0.04, intensity > 0 ? 0.08 : 0.04, 7000, 'highpass', null, music);
    // kick & snare
    if (intensity > 0 && i % 4 === 0) kick(t);
    if (intensity > 0 && (i === 4 || i === 12)) noise(t, 0.16, 0.14, 1800, 'bandpass', null, music);
    // pad on bar start
    if (i === 0) chords[bar].slice(0, 3).forEach((iv) => tone(t, mtof(root + 24 + iv), 2.1, 'triangle', 0.025, null, music));
    // arpeggio
    if (intensity > 0) {
      const ch = chords[bar];
      const n = root + 36 + ch[(i + (intensity > 1 ? s >> 2 : 0)) % 4];
      if (intensity > 1 || i % 2 === 0) tone(t, mtof(n), 0.12, intensity > 1 ? 'square' : 'triangle', 0.035, null, music);
    }
  }

  function tick() {
    if (!ctx) return;
    const stepDur = 60 / bpm / 4;
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.2) {
      playStep(step, nextTime);
      nextTime += stepDur;
      step++;
    }
  }

  function startMusic() {
    if (timer) return;
    nextTime = ctx.currentTime + 0.1;
    timer = setInterval(tick, 50);
  }

  return {
    init,
    play,
    setIntensity(v) { intensity = v; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.7, ctx.currentTime, 0.05);
      return muted;
    },
    get muted() { return muted; },
  };
})();
