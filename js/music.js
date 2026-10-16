// Background music + sound effects with the Web Audio API.
// With no musicUrl set, a gentle music-box tune (F – Dm – B♭ – C) is
// synthesised live, so there's no copyright issue and no file to download.
const Music = (() => {
  let ctx = null, sfx = null, musicGain = null;
  let playing = false, timer = null, nextTime = 0, step = 0;
  let fileBuffer = null, fileSource = null, fileTried = false;

  const BPM = 76;
  const STEP = 60 / BPM / 2; // eighth note
  const CHORDS = [[53, 57, 60], [50, 53, 57], [46, 50, 53], [48, 52, 55]];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 1];
  const MELODY = {
    0: 72, 2: 77, 4: 76, 6: 72,
    8: 74, 10: 77, 12: 81, 14: 79,
    16: 77, 18: 74, 20: 70, 22: 74,
    24: 76, 26: 72, 28: 79, 30: 77,
  };

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      sfx = ctx.createGain();
      sfx.gain.value = 0.5;
      sfx.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  function tone(dest, freq, t, dur, type, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function scheduleStep(s, t) {
    const chord = CHORDS[Math.floor(s / 8) % 4];
    const pool = [chord[0], chord[1], chord[2], chord[0] + 12].map((n) => n + 12);
    tone(musicGain, hz(pool[ARP[s % 8]]), t, 0.9, 'triangle', 0.1);
    if (s % 8 === 0) tone(musicGain, hz(chord[0] - 12), t, STEP * 8, 'sine', 0.16);
    const m = MELODY[s % 32];
    if (m && Math.floor(s / 32) % 2 === 1) tone(musicGain, hz(m), t, 1.4, 'sine', 0.14);
  }

  function tick() {
    while (nextTime < ctx.currentTime + 0.25) {
      scheduleStep(step, nextTime);
      nextTime += STEP;
      step++;
    }
  }

  async function loadFile(url) {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    // callback form for older Safari
    return new Promise((ok, fail) => ctx.decodeAudioData(buf, ok, fail));
  }

  async function play() {
    if (playing || !ac()) return;
    playing = true;
    musicGain = ctx.createGain();
    musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    musicGain.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 1.2);
    musicGain.connect(ctx.destination);

    const url = (window.KAHWIN_CONFIG || {}).musicUrl;
    if (url && !fileTried) {
      fileTried = true;
      try { fileBuffer = await loadFile(url); } catch (e) { console.warn('Music file failed, using built-in tune', e); }
      if (!playing) return; // stopped while loading
    }

    if (fileBuffer) {
      fileSource = ctx.createBufferSource();
      fileSource.buffer = fileBuffer;
      fileSource.loop = true;
      fileSource.connect(musicGain);
      fileSource.start();
    } else {
      step = 0;
      nextTime = ctx.currentTime + 0.1;
      tick();
      timer = setInterval(tick, 100);
    }
  }

  function stop() {
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    timer = null;
    const g = musicGain, src = fileSource;
    musicGain = null;
    fileSource = null;
    if (!g) return;
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), now);
    g.gain.linearRampToValueAtTime(0, now + 0.4);
    setTimeout(() => {
      try { src && src.stop(); } catch (e) { /* already stopped */ }
      g.disconnect();
    }, 500);
  }

  function beep(freq = 880) {
    if (!ac()) return;
    tone(sfx, freq, ctx.currentTime, 0.18, 'sine', 0.5);
  }

  function shutter() {
    if (!ac()) return;
    const len = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    src.buffer = buf;
    src.connect(hp);
    hp.connect(sfx);
    src.start();
  }

  return {
    play,
    stop,
    toggle() { playing ? stop() : play(); return playing; },
    get playing() { return playing; },
    suspend() { ctx && ctx.suspend(); },
    resume() { ctx && ctx.resume(); },
    beep,
    shutter,
  };
})();
