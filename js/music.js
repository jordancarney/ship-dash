/*
 * Ship Dash — music engine
 * Procedural Geometry-Dash-style beats, synthesized live with WebAudio.
 * No audio files: every sound is an oscillator or a filtered noise burst.
 *
 * Every level gets its own deterministic track. The tempo climbs with the
 * level number, the sound follows the game's worlds (bright major for 1-5,
 * driving minor for 6-10, a dark phrygian flavor for 11-20, a menacing
 * phrygian-dominant grind for 21+), and a seeded
 * PRNG picks the key, bass groove, hat pattern and lead melody — so level 7
 * always plays "level 7's song" and no two levels sound quite the same.
 * Custom levels hash their id for the same treatment; Straight Fly has a
 * fixed track of its own.
 *
 * game.js drives playback through window.MUSIC:
 *   init(getCtx)                                 share game.js's AudioContext
 *   playLevel(i) / playCustom(id) / playFly()    start a track from the top
 *   stop() / pause() / resume() / setMuted(m)
 */
(function () {
  "use strict";

  const MASTER_VOL = 0.3;   // music sits under the SFX (those play at ~0.2 each)
  const AHEAD = 0.12;       // schedule this far ahead of the audio clock (s)
  const TICK_MS = 30;       // scheduler wake-up interval

  // Same tiny deterministic PRNG as levels.js (scoped there, so redeclared).
  function makeRng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ----- Track blueprints -------------------------------------------------
  // Three "worlds" of sound that follow the game's difficulty arc.
  const MOODS = [
    { // levels 1-5: bright and friendly
      scale: [0, 2, 4, 7, 9],        // major pentatonic
      prog: [0, -3, 5, 7],           // I vi IV V — bass offset per bar (semitones)
      bassWave: "triangle", bassVol: 0.5, leadWave: "square",
    },
    { // levels 6-10 (and Straight Fly): driving
      scale: [0, 3, 5, 7, 10],       // minor pentatonic
      prog: [0, 0, -4, -2],          // i i VI VII
      bassWave: "square", bassVol: 0.34, leadWave: "square",
    },
    { // levels 11-20: dark finale
      scale: [0, 1, 5, 7, 10],       // phrygian-flavored
      prog: [0, 1, 0, -2],           // i bII i VII
      bassWave: "sawtooth", bassVol: 0.3, leadWave: "sawtooth",
    },
    { // levels 21-25: beyond the event horizon
      scale: [0, 1, 4, 5, 7, 8, 10], // phrygian dominant — exotic and menacing
      prog: [0, 1, -2, 0],           // i bII VII i
      bassWave: "sawtooth", bassVol: 0.32, leadWave: "sawtooth",
    },
  ];
  const ROOTS = [110.0, 98.0, 123.47, 87.31, 103.83, 116.54]; // A2 G2 B2 F2 G#2 A#2

  /*
   * Build one track on a 16th-note grid (bar = 16 steps): the bass groove
   * repeats every bar, drums and lead loop every 2 bars, and the whole thing
   * rides a 4-bar root progression. `heat` (0..1) scales the busy-ness —
   * ghost hats, open hats and lead density fade in as levels get harder.
   */
  function buildTrack(o) {
    const rnd = makeRng(o.seed);
    const mood = MOODS[o.mood];
    const bpm = o.bpm + Math.floor(rnd() * 5) - 2;
    const swing = rnd() < 0.25 ? 0.12 : 0;   // some levels get a subtle shuffle

    // drums (2-bar / 32-step grid)
    const kickAt = [], snareAt = [], hatCAt = [], hatOAt = [];
    const openHats = o.heat >= 0.15, ghosts = o.heat >= 0.35;
    for (let s = 0; s < 32; s++) {
      kickAt[s] = s % 4 === 0;                    // four on the floor
      snareAt[s] = s % 8 === 4;                   // backbeat on 2 and 4
      hatOAt[s] = openHats && s % 4 === 2;        // off-beat open hat
      hatCAt[s] = !hatOAt[s] && (s % 2 === 0 || (ghosts && rnd() < 0.4));
    }
    if (o.heat >= 0.05) kickAt[rnd() < 0.5 ? 14 : 30] = true;   // one pushed kick

    // bass groove (1-bar / 16-step grid; values are semitone offsets or rests)
    const groove = Math.floor(rnd() * 3);
    const bass = [];
    for (let s = 0; s < 16; s++) {
      if (groove === 0) bass.push(s % 2 === 0 ? 0 : null);                // pumping 8ths
      else if (groove === 1) bass.push(s % 4 === 2 ? 0 : null);           // off-beat push
      else bass.push(s % 2 ? null : (s === 6 || s === 14 ? 12 : 0));      // octave hops
    }

    // lead: bar 1 is a seeded melodic walk over the scale, bar 2 repeats it
    // with a few notes mutated (motif + variation, so it sounds composed)
    const span = mood.scale.length * 2;   // two octaves of scale degrees
    const density = 0.38 + o.heat * 0.25;
    let deg = Math.floor(rnd() * mood.scale.length);
    const lead = [];
    for (let s = 0; s < 16; s++) {
      if (s % 8 === 0 || rnd() < density) {
        deg += Math.floor(rnd() * 5) - 2;   // wander in small steps
        if (rnd() < 0.1) deg += deg < span / 2 ? mood.scale.length : -mood.scale.length;
        lead.push(deg = Math.max(0, Math.min(span - 1, deg)));
      } else lead.push(null);
    }
    for (let s = 0; s < 16; s++) {
      const d = lead[s];
      lead.push(rnd() < 0.25 ? (d === null ? Math.floor(rnd() * span) : null) : d);
    }

    return { bpm, stepDur: 60 / bpm / 4, root: ROOTS[o.root], mood, swing, kickAt, snareAt, hatCAt, hatOAt, bass, groove, lead };
  }

  // ----- Playback ----------------------------------------------------------
  let getCtx = null;      // supplied by game.js so SFX and music share a context
  let session = null;     // the one live track: its nodes, grid position, timer
  let muted = false;
  let noiseBuf = null, noiseCtx = null;

  function noise(ctx) {   // 1s of white noise, shared by hats and snares
    if (!noiseBuf || noiseCtx !== ctx) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseCtx = ctx;
    }
    return noiseBuf;
  }

  function play(track) {
    stop();
    const ctx = getCtx && getCtx();
    if (!ctx) return;

    const master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOL;
    const comp = ctx.createDynamicsCompressor();   // glue + clip safety
    master.connect(comp).connect(ctx.destination);

    const drums = ctx.createGain(); drums.connect(master);
    const pump = ctx.createGain(); pump.connect(master);   // bass+lead bus, ducked under each kick
    const echo = ctx.createDelay(1);                       // dotted-8th echo on the lead
    echo.delayTime.value = track.stepDur * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    echo.connect(fb).connect(echo);
    echo.connect(wet).connect(pump);

    session = {
      ctx, track, master, drums, pump, echo,
      step: 0,
      nextTime: ctx.currentTime + 0.08,
      paused: false,
      timer: setInterval(tick, TICK_MS),
    };
    tick();
  }

  // Standard lookahead scheduler: wake often, schedule a little ahead on the
  // audio clock. If the context is suspended, currentTime freezes and this
  // simply idles — no runaway loop.
  function tick() {
    if (!session || session.paused) return;
    const { ctx, track } = session;
    while (session.nextTime < ctx.currentTime + AHEAD) {
      scheduleStep(session.step, session.nextTime);
      session.nextTime += track.stepDur;
      session.step++;
    }
  }

  function scheduleStep(s, t) {
    const tr = session.track;
    if (tr.swing && s % 2 === 1) t += tr.stepDur * tr.swing;
    const bar = Math.floor(s / 16);
    const s16 = s % 16, s32 = s % 32;
    const semi = tr.mood.prog[bar % 4];   // this bar's transposition
    const intro = bar < 1;                // bar 0 eases in: kick + hat + bass only

    if (tr.kickAt[s32]) { kick(t); duck(t); }
    if (tr.snareAt[s32] && !intro) snare(t);
    if (tr.hatCAt[s32]) hat(t, false);
    if (tr.hatOAt[s32] && !intro) hat(t, true);

    const b = tr.bass[s16];
    if (b !== null) bassNote(freq(tr.root, semi + b), t, tr.stepDur * (tr.groove === 1 ? 1.6 : 0.9));

    const d = tr.lead[s32];
    if (d !== null && !intro) leadNote(freq(tr.root * 2, semi + degSemi(tr.mood.scale, d)), t, s16 % 4 === 0);
  }

  function freq(base, semi) { return base * Math.pow(2, semi / 12); }
  function degSemi(scale, deg) { return scale[deg % scale.length] + 12 * Math.floor(deg / scale.length); }

  // fast-attack pluck envelope shared by every voice
  function env(g, t, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // ----- Instruments -------------------------------------------------------
  function kick(t) {
    const { ctx, drums } = session;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    env(g, t, 0.85, 0.16);
    o.connect(g).connect(drums);
    o.start(t); o.stop(t + 0.2);
  }

  // sidechain: dip the bass+lead bus at each kick so the whole track pumps
  function duck(t) {
    const p = session.pump.gain, d = session.track.stepDur;
    p.cancelScheduledValues(t);
    p.setValueAtTime(0.4, t);
    p.linearRampToValueAtTime(1, t + d * 3.4);
  }

  function snare(t) {
    const { ctx, drums } = session;
    const n = ctx.createBufferSource(); n.buffer = noise(ctx);
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 0.7;
    const g = ctx.createGain();
    env(g, t, 0.45, 0.18);
    n.connect(f).connect(g).connect(drums);
    n.start(t, Math.random() * 0.5); n.stop(t + 0.2);
    const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = 190;   // body thump
    const og = ctx.createGain(); env(og, t, 0.22, 0.09);
    o.connect(og).connect(drums); o.start(t); o.stop(t + 0.12);
  }

  function hat(t, open) {
    const { ctx, drums } = session;
    const n = ctx.createBufferSource(); n.buffer = noise(ctx);
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = open ? 6200 : 7600;
    const g = ctx.createGain();
    env(g, t, open ? 0.18 : 0.14, open ? 0.22 : 0.045);
    n.connect(f).connect(g).connect(drums);
    n.start(t, Math.random() * 0.5); n.stop(t + (open ? 0.26 : 0.08));
  }

  function bassNote(f0, t, dur) {
    const { ctx, track, pump } = session;
    const o = ctx.createOscillator(); o.type = track.mood.bassWave; o.frequency.value = f0;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520;
    const g = ctx.createGain();
    env(g, t, track.mood.bassVol, dur);
    o.connect(lp).connect(g).connect(pump);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function leadNote(f0, t, accent) {
    const { ctx, track, pump, echo } = session;
    const o = ctx.createOscillator(); o.type = track.mood.leadWave; o.frequency.value = f0;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2500; lp.Q.value = 1;
    const g = ctx.createGain();
    env(g, t, accent ? 0.26 : 0.19, track.stepDur * 2.2);
    o.connect(lp).connect(g);
    g.connect(pump); g.connect(echo);
    o.start(t); o.stop(t + track.stepDur * 2.2 + 0.05);
  }

  // ----- Controls (called from game.js) ------------------------------------
  function fadeTo(v, secs) {
    const { ctx, master } = session;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(v, t + secs);
  }

  function stop() {
    if (!session) return;
    clearInterval(session.timer);
    fadeTo(0, 0.08);
    const m = session.master;
    setTimeout(() => m.disconnect(), 250);   // let the fade finish, then free it
    session = null;
  }

  function pause() {
    if (!session || session.paused) return;
    session.paused = true;
    fadeTo(0, 0.06);
  }

  function resume() {
    if (!session || !session.paused) return;
    if (getCtx) getCtx();   // re-wake a suspended context
    session.paused = false;
    session.nextTime = session.ctx.currentTime + 0.08;   // re-align the grid to "now"
    fadeTo(muted ? 0 : MASTER_VOL, 0.1);
  }

  function setMuted(m) {
    muted = m;
    if (session && !session.paused) fadeTo(m ? 0 : MASTER_VOL, 0.05);
  }

  // ----- Public API ---------------------------------------------------------
  const cache = {};
  function trackFor(key, make) { return cache[key] || (cache[key] = make()); }

  window.MUSIC = {
    init(fn) { getCtx = fn; },
    stop, pause, resume, setMuted,
    playLevel(i) {
      play(trackFor("L" + i, () => buildTrack({
        seed: 0x5eed + i * 7919,
        mood: i < 5 ? 0 : i < 10 ? 1 : i < 20 ? 2 : 3,   // matches the game's worlds
        root: i % ROOTS.length,
        bpm: Math.round(104 + i * 2.3),     // tempo climbs with the level
        heat: Math.min(1, i / 19),
      })));
    },
    playCustom(id) {
      let h = 2166136261;                   // FNV-1a hash: same level, same song
      for (const ch of String(id || "custom")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
      h >>>= 0;
      play(trackFor("C" + id, () => buildTrack({
        seed: h,
        mood: h % 3,
        root: (h >>> 2) % ROOTS.length,
        bpm: 112 + (h >>> 4) % 33,
        heat: 0.25 + ((h >>> 6) % 60) / 100,
      })));
    },
    playFly() {
      play(trackFor("F", () => buildTrack({ seed: 0xf17bea7, mood: 1, root: 2, bpm: 128, heat: 0.6 })));
    },
    // exposed for console debugging
    get session() { return session; },
  };
})();
