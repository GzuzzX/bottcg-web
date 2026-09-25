/* Battle of Talingchan - Sound FX via Web Audio API (no external files needed) */
(function(root) {
  'use strict';
  let ctx = null;
  let muted = false;
  function getCtx() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(e) { return null; }
    }
    return ctx;
  }
  function tone(freq, duration, type, vol) {
    const c = getCtx(); if (!c || muted) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.15, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(c.currentTime); osc.stop(c.currentTime + duration);
  }
  function noise(duration, vol) {
    const c = getCtx(); if (!c || muted) return;
    const bufSize = c.sampleRate * duration;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    const gain = c.createGain();
    src.buffer = buf;
    gain.gain.setValueAtTime(vol || 0.08, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    src.connect(gain); gain.connect(c.destination);
    src.start(c.currentTime);
  }

  const SFX = {
    draw: function() { tone(800, 0.08, 'sine', 0.1); setTimeout(()=> tone(1000, 0.06, 'sine', 0.08), 50); },
    summon: function() { tone(400, 0.15, 'triangle', 0.12); setTimeout(()=> tone(600, 0.2, 'triangle', 0.1), 100); setTimeout(()=> tone(800, 0.25, 'triangle', 0.08), 200); },
    attack: function() { noise(0.15, 0.15); tone(200, 0.1, 'sawtooth', 0.1); },
    destroy: function() { noise(0.25, 0.12); tone(150, 0.3, 'sawtooth', 0.08); setTimeout(()=> tone(100, 0.2, 'sawtooth', 0.06), 100); },
    magic: function() { tone(600, 0.1, 'sine', 0.1); setTimeout(()=> tone(900, 0.15, 'sine', 0.08), 80); setTimeout(()=> tone(1200, 0.1, 'sine', 0.06), 160); },
    lifeFlip: function() { tone(300, 0.2, 'triangle', 0.15); setTimeout(()=> tone(500, 0.3, 'triangle', 0.12), 150); },
    win: function() { [523,659,784,1047].forEach((f,i) => setTimeout(()=> tone(f, 0.3, 'triangle', 0.12), i*150)); },
    lose: function() { [400,350,300,200].forEach((f,i) => setTimeout(()=> tone(f, 0.4, 'sawtooth', 0.08), i*200)); },
    click: function() { tone(1000, 0.04, 'square', 0.06); },
    phase: function() { tone(500, 0.1, 'sine', 0.08); setTimeout(()=> tone(700, 0.08, 'sine', 0.06), 60); },
    equip: function() { tone(700, 0.1, 'triangle', 0.1); setTimeout(()=> tone(900, 0.15, 'triangle', 0.08), 80); },
    construct: function() { tone(300, 0.15, 'square', 0.08); setTimeout(()=> tone(450, 0.12, 'square', 0.06), 100); },
    mute: function() { muted = true; },
    unmute: function() { muted = false; },
    toggleMute: function() { muted = !muted; return muted; },
    isMuted: function() { return muted; },
  };
  root.BoTSFX = SFX;
})(typeof self !== 'undefined' ? self : this);
