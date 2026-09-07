/*
 * Ship Dash — game engine
 * Vanilla HTML5 Canvas, no build step. Open index.html directly.
 *
 * Controls
 *   HOLD  SPACE / click / tap → thrust up
 *   TAP   rapidly             → hover level (thrust balances gravity)
 *   RELEASE                   → fall
 *   R = retry   ·   ESC = menu   ·   M = mute
 */
(function () {
  "use strict";

  // ----- Constants -------------------------------------------------------
  const W = 960, H = 540;          // logical canvas size
  const CEIL = 0, FLOOR = H;       // play-area top / bottom (world y)
  const SHIP_R = 13;               // visual radius
  const COLLIDE_R = 10.5;          // forgiving collision radius
  const GRAVITY = 1000;            // px/s²  (down) — gentle, floaty drop
  const THRUST = 2000;             // px/s²  (up, while held) -> net ±1000 (keeps tap-to-hover)
  const MAX_VY = 440;              // terminal vertical speed
  const SHIP_SCREEN_X = 260;       // where the ship settles on screen
  const STORE_KEY = "shipdash.unlocked.v1";
  const SKIN_KEY = "shipdash.skin.v1";
  const COINS_KEY = "shipdash.coins.v1";
  const OWNED_KEY = "shipdash.owned.v1";
  const DEFAULT_REWARD = 50; // coins for clearing a level with no explicit reward
  const FLYBEST_KEY = "shipdash.flybest.v1";
  const CHEST_KEY = "shipdash.chest.v1"; // date string of last daily-chest claim
  const CUSTOM_KEY = "shipdash.custom.v1"; // user-created levels (level creator)
  const CUSTOM_SPEED = 210;                // scroll speed for all custom levels
  const SETTINGS_KEY = "shipdash.settings.v1"; // { name, showBar, showPct }
  const PACKS_KEY = "shipdash.packs.v1";   // per-pack unlock progress (temples, map)
  const SHARED_KEY = "shipdash.shared.v1"; // levels added from share codes
  const RACE_KEY = "shipdash.races.v1";    // { wins, losses }
  const LEVELCOINS_KEY = "shipdash.levelcoins.v1"; // built-in level coins found ("packId:index")
  const COIN_R = 12;                       // pickup radius of a level coin
  const COIN_REWARD = 15;                  // coins for finding a level's hidden coin
  const DIFFS = window.DIFFS || [];
  const DEFAULT_SPIKE = "#ff6b81", DEFAULT_BG = "#0c1430";
  const TRIGGER_TYPES = ["shake", "pulse", "speed", "particles", "color", "bgcolor", "background", "fade", "stop"];
  const TRIGGER_INFO = {
    shake:      { icon: "💥", col: "#ffd166", name: "SHAKE" },
    pulse:      { icon: "💓", col: "#ff5d8f", name: "PULSE" },
    speed:      { icon: "⚡", col: "#46e6ff", name: "SPEED" },
    particles:  { icon: "✨", col: "#ffffff", name: "PARTICLES" },
    color:      { icon: "🔺", col: "#ff6b81", name: "SPIKE COLOR" },
    bgcolor:    { icon: "🎨", col: "#5b8cff", name: "BG COLOR" },
    background: { icon: "🌌", col: "#b06bff", name: "BACKGROUND" },
    fade:       { icon: "🌈", col: "#9cff57", name: "FADE" },
    stop:       { icon: "⏹", col: "#8893b8", name: "STOP" },
  };
  // Straight Fly: endless tunnel that narrows from FLY_GAP_MAX down toward FLY_GAP_MIN.
  const FLY_SPEED = 190;
  const FLY_GAP_MAX = 380, FLY_GAP_MIN = 56, FLY_GAP_K = 2470;
  const FLY_CENTER_AMP = 30, FLY_CENTER_WL = 820; // gentle tunnel drift

  // ----- Safe storage ----------------------------------------------------
  // Wraps localStorage so the game still runs if storage is blocked/full
  // (e.g. Safari Private Browsing on iPad), just without saving.
  let LS = null;
  try { LS = window.localStorage; } catch (e) { LS = null; }
  function storeGet(k) { try { return LS ? LS.getItem(k) : null; } catch (e) { return null; } }
  function storeSet(k, v) { try { if (LS) LS.setItem(k, v); } catch (e) {} }
  function storeDel(k) { try { if (LS) LS.removeItem(k); } catch (e) {} }

  const LEVELS = window.LEVELS;
  const TEMPLES = window.TEMPLES || [];
  const MAP = window.MAP || [];

  // ----- Level packs -----------------------------------------------------
  // A pack is an ordered list of levels with its own unlock progress:
  // the main 20 levels, each temple, and each map trail.
  const MAIN_PACK = { id: "main", kind: "main", title: "SELECT LEVEL", levels: LEVELS };
  const TEMPLE_PACKS = TEMPLES.map((t) => ({ id: "temple." + t.id, kind: "temple", title: t.name.toUpperCase(), sub: t.desc, levels: t.levels, temple: t }));
  const MAP_PACKS = MAP.map((m) => ({ id: "map." + m.diff, kind: "map", title: "MAP", levels: m.levels, trail: m }));
  const ALL_PACKS = [MAIN_PACK].concat(TEMPLE_PACKS, MAP_PACKS);
  function packUnlocked(pack) {
    if (pack.kind === "main") return state.unlocked;
    const v = state.packProg[pack.id] | 0;
    return v;
  }
  function setPackUnlocked(pack, v) {
    if (pack.kind === "main") return saveUnlocked(v);
    state.packProg[pack.id] = Math.max(packUnlocked(pack), v);
    savePackProg();
  }
  // music: temple/map levels borrow the main soundtrack, picked by difficulty
  const DIFF_TRACK = [2, 5, 8, 11, 14, 16, 18, 19];

  // ----- Hidden coins ----------------------------------------------------
  // Every built-in level hides ONE coin somewhere in a gap. It's placed
  // automatically (deterministic per level) so it's always reachable: we
  // sample the free gap at a few spots and tuck the coin near a wall.
  function coinKey(pack, i) { return pack.id + ":" + i; }
  function levelCoinFound(pack, i) { return state.levelCoins.has(coinKey(pack, i)); }
  // free gap (ceiling tip .. floor tip) at world x. t defaults to when the ship
  // gets there; `half` is the x window to consider (the race bot looks wider).
  function freeGapAt(lvl, x, t, half) {
    if (t == null) t = (x - 120) / lvl.speed;
    half = half || 24;
    let top = CEIL, bot = FLOOR;
    for (const s of lvl.obstacles) {
      if (s.x + s.w < x - half || s.x > x + half) continue;
      const apex = spikeTri(s, t)[5];
      if (s.dir === "top" || s.dir === "falling" || s.dir === "gateTop") top = Math.max(top, apex);
      else bot = Math.min(bot, apex);
    }
    return { top, bot };
  }
  function levelCoins(lvl) {
    if (lvl.coins) return lvl.coins;
    let h = 7;
    for (const ch of lvl.name) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const fracs = [0.62, 0.38, 0.5, 0.74, 0.28];
    let best = null;
    for (let k = 0; k < fracs.length && !best; k++) {
      const f = fracs[(Math.abs(h) + k) % fracs.length];
      for (let dx = 0; dx <= 400 && !best; dx += 40) {
        const x = Math.round(lvl.length * f + dx);
        const g = freeGapAt(lvl, x);
        if (g.bot - g.top >= 110 && x < lvl.length - 200) {
          const side = ((h >> 3) & 1) ? 1 : -1;
          const y = Math.round((g.top + g.bot) / 2 + side * Math.max(0, (g.bot - g.top) / 2 - 42));
          best = { x, y };
        }
      }
    }
    lvl.coins = [best || { x: Math.round(lvl.length * 0.5), y: H / 2 }];
    return lvl.coins;
  }
  // SECRET coin: not the gold 🪙 currency — a spinning cyan/violet disc with a
  // star, orbiting sparkles, and a violet glow so it reads as something special.
  function drawCoin(x, y, t, ghost) {
    const w = 11 * Math.abs(Math.cos(t * 4)) + 2;
    ctx.save();
    ctx.globalAlpha = ghost ? 0.28 : 1;
    ctx.translate(x, y + Math.sin(t * 3) * 3);
    if (!ghost) { ctx.shadowColor = "rgba(176,107,255,0.9)"; ctx.shadowBlur = 16; }
    const g = ctx.createLinearGradient(-w, -12, w, 12);
    g.addColorStop(0, "#7af5ff"); g.addColorStop(0.5, "#b06bff"); g.addColorStop(1, "#ff4bd8");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, w, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, w, 12, 0, 0, Math.PI * 2); ctx.stroke();
    if (w > 4) {                       // white star on the face
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 2.4 : 6, a = -Math.PI / 2 + i * Math.PI / 5;
        ctx.lineTo(Math.cos(a) * r * (w / 13), Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
    }
    if (!ghost) {                      // two orbiting sparkles
      ctx.fillStyle = "#e6f7ff";
      for (let k = 0; k < 2; k++) {
        const a = t * 2.5 + k * Math.PI, sx = Math.cos(a) * 19, sy = Math.sin(a) * 8;
        ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
  function runCoinsFound() {   // coins in this run that count (not already banked)
    return state.coinsGot.length;
  }

  // ----- Canvas ----------------------------------------------------------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ----- DOM overlays ----------------------------------------------------
  const menuEl = document.getElementById("menu");
  const levelSelectEl = document.getElementById("levelSelect");
  const messageEl = document.getElementById("message");
  const messageTitle = document.getElementById("messageTitle");
  const messageBody = document.getElementById("messageBody");
  const rewardBox = document.getElementById("rewardBox");
  const rewardEarned = document.getElementById("rewardEarned");
  const rewardEarnedNum = document.getElementById("rewardEarnedNum");
  const rewardTotal = document.getElementById("rewardTotal");
  const primaryBtn = document.getElementById("primaryBtn");
  const menuBtn = document.getElementById("menuBtn");
  const pauseEl = document.getElementById("pause");
  const resumeBtn = document.getElementById("resumeBtn");
  const exitBtn = document.getElementById("exitBtn");
  const homeEl = document.getElementById("home");
  const skinsEl = document.getElementById("skins");
  const skinGridEl = document.getElementById("skinGrid");
  const playBtn = document.getElementById("playBtn");
  const flyBtn = document.getElementById("flyBtn");
  const skinBtn = document.getElementById("skinBtn");
  const backFromLevels = document.getElementById("backFromLevels");
  const backFromSkins = document.getElementById("backFromSkins");
  const chestBtn = document.getElementById("chestBtn");
  const homeShip = document.getElementById("homeShip");
  const homeCtx = homeShip.getContext("2d");
  const createBtn = document.getElementById("createBtn");
  const customEl = document.getElementById("custom");
  const customListEl = document.getElementById("customList");
  const backFromCustom = document.getElementById("backFromCustom");
  const editorEl = document.getElementById("editor");
  const PAUSE_BTN = { x: W - 46, y: 10, w: 34, h: 34 }; // on-canvas pause button (top-right)
  const $ = (id) => document.getElementById(id);
  const menuTitle = $("menuTitle"), menuSub = $("menuSub");
  const plusBtn = $("plusBtn"), plusMenu = $("plusMenu");
  const settingsEl = $("settings"), templesEl = $("temples"), mapEl = $("map"), searchEl = $("search"), raceEl = $("race");
  const modeRow = $("modeRow"), modeHint = $("modeHint"), noclipBtn = $("noclipBtn"), practiceBtn = $("practiceBtn");

  // ----- State -----------------------------------------------------------
  const state = {
    scene: "home",            // home | menu | skins | play | paused | crash | complete | win
    levelIndex: 0,
    unlocked: loadUnlocked(), // highest playable level index
    skin: loadSkin(),         // selected ship skin index
    coins: loadCoins(),       // currency for unlocking ships
    owned: loadOwned(),       // Set of purchased ship indices
    mode: "level",            // "level" | "fly" (Straight Fly endless mode)
    flyTime: 0,               // current Straight Fly survival time
    flyBest: loadFlyBest(),   // best Straight Fly time
    customLevels: loadCustomLevels(), // user-created levels (level creator)
    custom: null,             // built custom level currently playing (null = built-in)
    customSrc: null,          // raw custom level the run was built from
    customFrom: null,         // "list" | "editor" — where to exit back to
    shipX: 120,
    y: H / 2,
    vy: 0,
    held: false,
    camX: 0,
    elapsed: 0,               // seconds since level start (hint fade)
    crashTimer: 0,
    trail: [],
    particles: [],
    primaryAction: null,
    coinAnim: null,           // active level-clear coin count-up
    pack: null,               // level pack being played (main levels, a temple, a map trail)
    packProg: loadPackProg(), // { packId: levels unlocked }
    settings: loadSettings(), // { name, showBar, showPct }
    shared: loadShared(),     // levels added from share codes
    raceRec: loadRaceRec(),   // { wins, losses }
    race: null,               // active race (see startRace)
    modes: { noclip: false, practice: false }, // assist modes (pause menu); never count as a real clear
    assisted: false,          // any assist mode was on at some point during this run
    checkpoint: null,         // practice mode: last respawn point
    cpTimer: 0,               // practice mode: seconds since the last auto checkpoint
    levelCoins: loadLevelCoins(), // Set of built-in level coins already found
    coinsGot: [],             // coins picked up in the current run (indices)
    fx: null,                 // active decoration-trigger effects (see defaultFx)
  };

  let muted = false;
  let globalTime = 0;

  // ----- Star field (parallax background) -------------------------------
  const stars = makeStars(70, 0.25, 0.6).concat(makeStars(40, 0.55, 1.0));
  function makeStars(n, factor, sizeBoost) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: (Math.random() * 1.1 + 0.4) * sizeBoost,
        f: factor,
        tw: Math.random() * Math.PI * 2,
        sp: Math.random() * 2 + 1,
      });
    }
    return out;
  }

  // ----- Persistence -----------------------------------------------------
  function loadUnlocked() {
    const v = parseInt(storeGet(STORE_KEY) || "0", 10);
    return isNaN(v) ? 0 : v;
  }
  function saveUnlocked(v) {
    state.unlocked = Math.max(state.unlocked, v);
    storeSet(STORE_KEY, String(state.unlocked));
  }
  function loadSkin() {
    const v = parseInt(storeGet(SKIN_KEY) || "0", 10);
    return isNaN(v) || v < 0 ? 0 : v;
  }
  function saveSkin(i) {
    state.skin = i;
    storeSet(SKIN_KEY, String(i));
  }
  function loadCoins() {
    const v = parseInt(storeGet(COINS_KEY) || "0", 10);
    return isNaN(v) ? 0 : v;
  }
  function loadFlyBest() {
    const v = parseFloat(storeGet(FLYBEST_KEY) || "0");
    return isNaN(v) ? 0 : v;
  }
  function addCoins(n) {
    state.coins += n;
    storeSet(COINS_KEY, String(state.coins));
    updateCoinDisplays();
  }
  function loadOwned() {
    try {
      const a = JSON.parse(storeGet(OWNED_KEY) || "[]");
      return new Set(Array.isArray(a) ? a : []);
    } catch (e) { return new Set(); }
  }
  function saveOwned() { storeSet(OWNED_KEY, JSON.stringify([...state.owned])); }
  function loadCustomLevels() {
    try {
      const a = JSON.parse(storeGet(CUSTOM_KEY) || "[]");
      if (!Array.isArray(a)) return [];
      return a.filter((l) => l && typeof l.name === "string" && isFinite(l.length) && Array.isArray(l.items));
    } catch (e) { return []; }
  }
  function saveCustomLevels() { storeSet(CUSTOM_KEY, JSON.stringify(state.customLevels)); }
  function loadSettings() {
    const d = { name: "", showBar: true, showPct: false };
    try { return Object.assign(d, JSON.parse(storeGet(SETTINGS_KEY) || "{}")); } catch (e) { return d; }
  }
  function saveSettings() { storeSet(SETTINGS_KEY, JSON.stringify(state.settings)); }
  function loadPackProg() {
    try { const o = JSON.parse(storeGet(PACKS_KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; }
  }
  function savePackProg() { storeSet(PACKS_KEY, JSON.stringify(state.packProg)); }
  function loadShared() {
    try {
      const a = JSON.parse(storeGet(SHARED_KEY) || "[]");
      return Array.isArray(a) ? a.filter((l) => l && typeof l.name === "string" && Array.isArray(l.items)) : [];
    } catch (e) { return []; }
  }
  function saveShared() { storeSet(SHARED_KEY, JSON.stringify(state.shared)); }
  function loadRaceRec() {
    try { return Object.assign({ wins: 0, losses: 0 }, JSON.parse(storeGet(RACE_KEY) || "{}")); } catch (e) { return { wins: 0, losses: 0 }; }
  }
  function saveRaceRec() { storeSet(RACE_KEY, JSON.stringify(state.raceRec)); }
  function loadLevelCoins() {
    try { const a = JSON.parse(storeGet(LEVELCOINS_KEY) || "[]"); return new Set(Array.isArray(a) ? a : []); } catch (e) { return new Set(); }
  }
  function saveLevelCoins() { storeSet(LEVELCOINS_KEY, JSON.stringify([...state.levelCoins])); }
  function isOwned(i) { return !!SKINS[i] && (SKINS[i].cost === 0 || state.owned.has(i)); }
  function updateCoinDisplays() {
    document.querySelectorAll(".coin-val").forEach((e) => { e.textContent = state.coins; });
  }

  // ----- Ship skins ------------------------------------------------------
  // 20 cosmetic ships (the collision hitbox is always the same circle).
  // cost 0 = free from the start; others are bought with coins. The 10 fun
  // "kid" ships (kitty…unicorn) are the reward for clearing every level.
  const SKINS = [
    { id: "dart",    name: "Dart",    cost: 0,   trail: "#46e6ff", glow: "rgba(70,230,255,0.7)",  flame: "#bff6ff" },
    { id: "saucer",  name: "Saucer",  cost: 0,   trail: "#9cff57", glow: "rgba(140,255,90,0.6)",  flame: "#d8ffa8" },
    { id: "rocket",  name: "Rocket",  cost: 0,   trail: "#ff8a5b", glow: "rgba(255,120,90,0.6)",  flame: "#ffd166" },
    { id: "stealth", name: "Stealth", cost: 25,  trail: "#b388ff", glow: "rgba(150,110,255,0.7)", flame: "#d8c2ff" },
    { id: "star",    name: "Star",    cost: 35,  trail: "#ffd166", glow: "rgba(255,209,102,0.7)", flame: "#fff0b0" },
    { id: "ghost",   name: "Ghost",   cost: 55,  trail: "#cfe3ff", glow: "rgba(200,220,255,0.6)", flame: "#eaf2ff" },
    { id: "neon",    name: "Neon",    cost: 70,  trail: "#ff4bd8", glow: "rgba(255,75,216,0.85)", flame: "#ff9bea" },
    { id: "bee",     name: "Bumble",  cost: 45,  trail: "#ffe14a", glow: "rgba(255,225,74,0.6)",  flame: "#fff3a8" },
    { id: "crystal", name: "Crystal", cost: 90,  trail: "#7af5ff", glow: "rgba(122,245,255,0.7)", flame: "#d6ffff" },
    { id: "phoenix", name: "Phoenix", cost: 125, trail: "#ff9f1c", glow: "rgba(255,140,30,0.85)", flame: "#ffd24a" },
    // --- the "all levels cleared" collection: fun ships for kids ---
    { id: "kitty",   name: "Cosmo Cat", cost: 95,  trail: "#ffb3d9", glow: "rgba(255,150,200,0.7)", flame: "#ffd6ec" },
    { id: "heart",   name: "Sweetheart",cost: 105, trail: "#ff5d8f", glow: "rgba(255,93,143,0.8)",  flame: "#ffb3c8" },
    { id: "robot",   name: "Bolt Bot",  cost: 110, trail: "#9be7ff", glow: "rgba(120,210,255,0.8)", flame: "#d6f5ff" },
    { id: "dino",    name: "Rex",       cost: 120, trail: "#7be06b", glow: "rgba(110,220,90,0.7)",  flame: "#d2ffc2" },
    { id: "shark",   name: "Chomp",     cost: 130, trail: "#7fd8ff", glow: "rgba(120,200,255,0.7)", flame: "#dff3ff" },
    { id: "dragon",  name: "Drake",     cost: 150, trail: "#62e0a0", glow: "rgba(80,220,150,0.8)",  flame: "#ff9a3c" },
    { id: "rainbow", name: "Prism",     cost: 165, trail: "#ff66cc", glow: "rgba(255,120,220,0.8)", flame: "#ffffff" },
    { id: "alien",   name: "Zorp",      cost: 175, trail: "#b6ff5a", glow: "rgba(160,255,80,0.85)", flame: "#e6ffb0" },
    { id: "gold",    name: "Midas",     cost: 200, trail: "#ffd54a", glow: "rgba(255,200,60,0.9)",  flame: "#fff0a8" },
    { id: "unicorn", name: "Sparkle",   cost: 220, trail: "#ff9be0", glow: "rgba(255,160,230,0.85)",flame: "#ffe6ff" },
  ];

  // Coins earned the FIRST time each level is cleared (index = level).
  // INVARIANT: sum(LEVEL_REWARD) === sum(ship costs) === 1915, so clearing every
  // level earns exactly enough to buy every ship. (Add a level -> add a reward;
  // add a ship -> keep total coins >= total cost. Harder later levels pay more.)
  const LEVEL_REWARD = [
    15, 20, 25, 50, 40, 45, 50, 55, 60, 85,        // 1–10  (sum 445)
    90, 105, 115, 125, 140, 150, 165, 180, 195, 205, // 11–20 (sum 1470)
  ];
  (function checkEconomy() {
    let tr = 0;
    for (let i = 0; i < LEVELS.length; i++) tr += (LEVEL_REWARD[i] != null ? LEVEL_REWARD[i] : DEFAULT_REWARD);
    const tc = SKINS.reduce((a, s) => a + s.cost, 0);
    if (tr < tc) console.warn(`[economy] level coins (${tr}) < total ship cost (${tc}) — can't unlock all ships`);
  })();

  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // A filled 4-point sparkle (used by Midas & Sparkle). Caller sets fillStyle.
  function sparkle(c, x, y, r) {
    const t = r * 0.28;
    c.beginPath();
    c.moveTo(x, y - r); c.lineTo(x + t, y - t); c.lineTo(x + r, y); c.lineTo(x + t, y + t);
    c.lineTo(x, y + r); c.lineTo(x - t, y + t); c.lineTo(x - r, y); c.lineTo(x - t, y - t);
    c.closePath(); c.fill();
  }

  // Draw a skin at the origin, nose pointing +x. Works on any 2D context
  // (the game canvas, the home preview, and the skin picker thumbnails).
  function paintShip(c, skin, thrusting, t) {
    t = t || 0;
    if (thrusting && skin.id !== "phoenix") { // engine flame (Phoenix has its own fire)
      const flick = 9 + Math.random() * 9;
      const fg = c.createLinearGradient(-8, 0, -8 - flick, 0);
      fg.addColorStop(0, skin.flame);
      fg.addColorStop(1, "rgba(255,90,40,0)");
      c.fillStyle = fg;
      c.beginPath(); c.moveTo(-8, -4); c.lineTo(-8 - flick, 0); c.lineTo(-8, 4); c.closePath(); c.fill();
    }
    c.lineWidth = 1.5;
    c.shadowColor = skin.glow;
    c.shadowBlur = 12;

    switch (skin.id) {
      case "saucer": {
        const g = c.createLinearGradient(0, -2, 0, 12);
        g.addColorStop(0, "#bdf08a"); g.addColorStop(1, "#3f9e2e");
        c.fillStyle = g; c.strokeStyle = "#eaffd0";
        c.beginPath(); c.ellipse(-1, 4, 16, 6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
        const dg = c.createLinearGradient(0, -9, 0, 2);
        dg.addColorStop(0, "#eafcff"); dg.addColorStop(1, "#8fd0ff");
        c.fillStyle = dg; c.beginPath(); c.arc(-1, 1, 8, Math.PI, 0); c.fill(); c.stroke();
        c.shadowBlur = 0; c.fillStyle = "#fff7a8";
        for (const lx of [-12, -5, 2, 9]) { c.beginPath(); c.arc(lx, 6, 1.6, 0, 7); c.fill(); }
        break;
      }
      case "rocket": {
        const bg = c.createLinearGradient(0, -7, 0, 7);
        bg.addColorStop(0, "#ffffff"); bg.addColorStop(1, "#cfd8e8");
        c.fillStyle = bg; c.strokeStyle = "#aeb8cc";
        roundRectPath(c, -12, -7, 20, 14, 6); c.fill(); c.stroke();
        c.fillStyle = "#ff5a5f"; c.strokeStyle = "#ffd0d0";
        c.beginPath(); c.moveTo(8, -7); c.lineTo(18, 0); c.lineTo(8, 7); c.closePath(); c.fill(); c.stroke();
        c.shadowBlur = 0; c.fillStyle = "#ff5a5f";
        c.beginPath(); c.moveTo(-12, -6); c.lineTo(-18, -12); c.lineTo(-9, -2); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(-12, 6); c.lineTo(-18, 12); c.lineTo(-9, 2); c.closePath(); c.fill();
        c.fillStyle = "#46e6ff"; c.beginPath(); c.arc(0, 0, 3.4, 0, 7); c.fill();
        break;
      }
      case "stealth": {
        const g = c.createLinearGradient(-14, 0, 16, 0);
        g.addColorStop(0, "#2c2148"); g.addColorStop(1, "#7a4dd0");
        c.fillStyle = g; c.strokeStyle = "#c9a8ff";
        c.beginPath();
        c.moveTo(16, 0); c.lineTo(-5, -3); c.lineTo(-14, -12);
        c.lineTo(-9, 0); c.lineTo(-14, 12); c.lineTo(-5, 3); c.closePath();
        c.fill(); c.stroke();
        c.shadowBlur = 0; c.fillStyle = "#e6d4ff";
        c.beginPath(); c.arc(4, 0, 2.4, 0, 7); c.fill();
        break;
      }
      case "star": {
        const g = c.createLinearGradient(-15, -15, 15, 15);
        g.addColorStop(0, "#fff3b0"); g.addColorStop(1, "#ffb800");
        c.fillStyle = g; c.strokeStyle = "#fff7d6";
        c.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = i * Math.PI / 5, r = (i % 2 === 0) ? 15 : 6.5;
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.closePath(); c.fill(); c.stroke();
        break;
      }
      case "ghost": {
        c.globalAlpha = 0.92;
        const g = c.createLinearGradient(0, -13, 0, 13);
        g.addColorStop(0, "#f2f7ff"); g.addColorStop(1, "#9fc0ff");
        c.fillStyle = g; c.strokeStyle = "#eaf2ff";
        c.beginPath();
        c.arc(0, -1, 12, Math.PI, Math.PI * 2);
        c.lineTo(12, 11);
        c.quadraticCurveTo(8, 7, 5, 11);
        c.quadraticCurveTo(1, 15, -3, 11);
        c.quadraticCurveTo(-7, 7, -12, 11);
        c.closePath(); c.fill(); c.stroke();
        c.shadowBlur = 0; c.fillStyle = "#33406a";
        c.beginPath(); c.arc(4, -2, 2.3, 0, 7); c.fill();
        c.beginPath(); c.arc(10, -2, 2.1, 0, 7); c.fill();
        c.globalAlpha = 1;
        break;
      }
      case "neon": {
        c.shadowBlur = 16;
        c.strokeStyle = "#ff4bd8"; c.lineWidth = 2.5;
        c.fillStyle = "rgba(255,75,216,0.12)";
        c.beginPath(); c.moveTo(16, 0); c.lineTo(-12, -11); c.lineTo(-6, 0); c.lineTo(-12, 11); c.closePath();
        c.fill(); c.stroke();
        c.beginPath(); c.moveTo(11, 0); c.lineTo(-7, 0); c.stroke();
        break;
      }
      case "bee": {
        c.shadowBlur = 0; c.fillStyle = "rgba(220,240,255,0.55)";
        c.beginPath(); c.ellipse(-2, -8, 7, 3.5, -0.5, 0, 7); c.fill();
        c.beginPath(); c.ellipse(-2, 8, 7, 3.5, 0.5, 0, 7); c.fill();
        c.shadowColor = skin.glow; c.shadowBlur = 10;
        c.fillStyle = "#ffcf33"; c.strokeStyle = "#3a2a00";
        c.beginPath(); c.ellipse(0, 0, 14, 8, 0, 0, 7); c.fill(); c.stroke();
        c.shadowBlur = 0;
        c.save(); c.beginPath(); c.ellipse(0, 0, 14, 8, 0, 0, 7); c.clip();
        c.fillStyle = "#2a2a2a";
        for (const sx of [-2, 4, 10]) c.fillRect(sx, -9, 3, 18);
        c.restore();
        c.fillStyle = "#222"; c.beginPath(); c.arc(11, -2, 1.6, 0, 7); c.fill();
        c.beginPath(); c.moveTo(-14, 0); c.lineTo(-19, -1.5); c.lineTo(-19, 1.5); c.closePath(); c.fill();
        break;
      }
      case "crystal": {
        const g = c.createLinearGradient(-12, -10, 14, 10);
        g.addColorStop(0, "#eaffff"); g.addColorStop(0.5, "#7af5ff"); g.addColorStop(1, "#2aa6c0");
        c.fillStyle = g; c.strokeStyle = "#eaffff";
        c.beginPath(); c.moveTo(15, 0); c.lineTo(0, -10); c.lineTo(-12, 0); c.lineTo(0, 10); c.closePath();
        c.fill(); c.stroke();
        c.shadowBlur = 0; c.strokeStyle = "rgba(255,255,255,0.6)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(15, 0); c.lineTo(-12, 0); c.moveTo(0, -10); c.lineTo(0, 10);
        c.moveTo(0, -10); c.lineTo(-12, 0); c.lineTo(0, 10); c.stroke();
        c.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 4));
        c.fillStyle = "#fff"; c.beginPath(); c.arc(5, -3, 1.6, 0, 7); c.fill(); c.globalAlpha = 1;
        break;
      }
      case "phoenix": {
        c.shadowBlur = 0;
        const fl = 12 + Math.random() * 8;
        const fg = c.createLinearGradient(-4, 0, -4 - fl, 0);
        fg.addColorStop(0, "#ffd24a"); fg.addColorStop(0.5, "#ff7a18"); fg.addColorStop(1, "rgba(255,60,0,0)");
        c.fillStyle = fg; c.beginPath(); c.moveTo(-4, -7); c.lineTo(-4 - fl, 0); c.lineTo(-4, 7); c.closePath(); c.fill();
        c.shadowColor = skin.glow; c.shadowBlur = 16;
        const cg = c.createRadialGradient(2, 0, 1, 2, 0, 12);
        cg.addColorStop(0, "#fff3b0"); cg.addColorStop(0.5, "#ff9f1c"); cg.addColorStop(1, "#e0440a");
        c.fillStyle = cg; c.beginPath(); c.arc(2, 0, 11, 0, 7); c.fill();
        c.shadowBlur = 0; c.fillStyle = "rgba(255,150,30,0.7)";
        c.beginPath(); c.moveTo(2, -8); c.quadraticCurveTo(13, -14, 17, -3); c.quadraticCurveTo(7, -6, 2, -8); c.fill();
        c.beginPath(); c.moveTo(2, 8); c.quadraticCurveTo(13, 14, 17, 3); c.quadraticCurveTo(7, 6, 2, 8); c.fill();
        break;
      }
      case "kitty": { // space cat — round pink head, ears, whiskers
        c.shadowBlur = 0;
        c.strokeStyle = "#ff9ed1"; c.lineWidth = 3; c.lineCap = "round";
        c.beginPath(); c.moveTo(-10, 2); c.quadraticCurveTo(-19, 0, -16, -9); c.stroke(); // tail
        c.shadowColor = skin.glow; c.shadowBlur = 10;
        c.fillStyle = "#ffb3d9"; c.strokeStyle = "#ff7ab8"; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(-7, -8); c.lineTo(-9, -16); c.lineTo(-1, -10); c.closePath(); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(7, -8); c.lineTo(10, -16); c.lineTo(2, -10); c.closePath(); c.fill(); c.stroke();
        const g = c.createLinearGradient(0, -11, 0, 12);
        g.addColorStop(0, "#ffe0f0"); g.addColorStop(1, "#ff9ed1");
        c.fillStyle = g; c.strokeStyle = "#ff7ab8"; c.lineWidth = 1.4;
        c.beginPath(); c.arc(0, 0, 12, 0, 7); c.fill(); c.stroke();
        c.shadowBlur = 0; c.fillStyle = "#ff6fb0";
        c.beginPath(); c.moveTo(-6, -9); c.lineTo(-7.5, -13.5); c.lineTo(-3, -10.5); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(6, -9); c.lineTo(7.5, -13.5); c.lineTo(3, -10.5); c.closePath(); c.fill();
        c.fillStyle = "#3a2030";
        c.beginPath(); c.arc(3, -1, 1.8, 0, 7); c.fill();
        c.beginPath(); c.arc(9, -1, 1.8, 0, 7); c.fill();
        c.fillStyle = "#ff5d8f"; c.beginPath(); c.moveTo(11.5, 1.5); c.lineTo(13.5, 0.5); c.lineTo(13.5, 2.5); c.closePath(); c.fill();
        c.strokeStyle = "rgba(255,255,255,0.85)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(11, 2); c.lineTo(17, 1); c.moveTo(11, 3.5); c.lineTo(17, 4.5); c.stroke();
        break;
      }
      case "heart": { // winged sweetheart, point facing +x
        c.shadowBlur = 0; c.fillStyle = "rgba(255,255,255,0.6)";
        c.beginPath(); c.ellipse(-4, -6, 6, 3, -0.6, 0, 7); c.fill();
        c.beginPath(); c.ellipse(-4, 6, 6, 3, 0.6, 0, 7); c.fill();
        c.shadowColor = skin.glow; c.shadowBlur = 12;
        const g = c.createLinearGradient(0, -10, 6, 11);
        g.addColorStop(0, "#ff9ebd"); g.addColorStop(1, "#ff3d77");
        c.fillStyle = g; c.strokeStyle = "#ffd0de"; c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(-2, 0);
        c.quadraticCurveTo(-10, -10, -3, -10);
        c.quadraticCurveTo(2, -10, 13, 0);
        c.quadraticCurveTo(2, 10, -3, 10);
        c.quadraticCurveTo(-10, 10, -2, 0);
        c.closePath(); c.fill(); c.stroke();
        c.shadowBlur = 0; c.fillStyle = "rgba(255,255,255,0.7)";
        c.beginPath(); c.ellipse(0, -3, 2, 3, -0.5, 0, 7); c.fill();
        break;
      }
      case "robot": { // cute bot — body, visor, antenna, bolt
        c.shadowBlur = 0;
        c.strokeStyle = "#cfe0ff"; c.lineWidth = 1.6; c.lineCap = "round";
        c.beginPath(); c.moveTo(0, -10); c.lineTo(-3, -16); c.stroke();
        c.fillStyle = "#ffe14a"; c.beginPath(); c.arc(-3, -17, 2.2, 0, 7); c.fill();
        c.fillStyle = "#5a6b8c";
        c.beginPath(); c.moveTo(-9, -7); c.lineTo(-16, 0); c.lineTo(-9, 7); c.closePath(); c.fill();
        c.shadowColor = skin.glow; c.shadowBlur = 10;
        const g = c.createLinearGradient(0, -11, 0, 11);
        g.addColorStop(0, "#f1f7ff"); g.addColorStop(0.5, "#a9c6e0"); g.addColorStop(1, "#67809e");
        c.fillStyle = g; c.strokeStyle = "#e6f1ff"; c.lineWidth = 1.4;
        roundRectPath(c, -10, -11, 21, 22, 7); c.fill(); c.stroke();
        c.shadowBlur = 0;
        const vg = c.createLinearGradient(0, -6, 0, 6);
        vg.addColorStop(0, "#0a2a3a"); vg.addColorStop(1, "#0a1626");
        c.fillStyle = vg; roundRectPath(c, -1, -6, 11, 12, 4); c.fill();
        c.fillStyle = "#46e6ff"; c.shadowColor = "rgba(70,230,255,0.9)"; c.shadowBlur = 8;
        c.beginPath(); c.arc(3, 0, 2, 0, 7); c.fill();
        c.beginPath(); c.arc(8, 0, 2, 0, 7); c.fill();
        c.shadowBlur = 0; c.fillStyle = "#ffe14a";
        c.beginPath(); c.moveTo(-6, -5); c.lineTo(-2, -1); c.lineTo(-5, -1); c.lineTo(-2, 5); c.lineTo(-7, 0); c.lineTo(-4, 0); c.closePath(); c.fill();
        break;
      }
      case "dino": { // green T-rex head, back plates, teeth
        c.shadowColor = skin.glow; c.shadowBlur = 10;
        c.fillStyle = "#5fc94e";
        c.beginPath(); c.moveTo(-6, 4); c.lineTo(-18, 1); c.lineTo(-6, -3); c.closePath(); c.fill();
        const g = c.createLinearGradient(0, -11, 0, 11);
        g.addColorStop(0, "#a6f08a"); g.addColorStop(1, "#4fb53e");
        c.fillStyle = g; c.strokeStyle = "#d8ffc2"; c.lineWidth = 1.3;
        c.beginPath();
        c.moveTo(-8, -8);
        c.quadraticCurveTo(8, -11, 15, -3);
        c.lineTo(15, 4);
        c.quadraticCurveTo(8, 8, -8, 9);
        c.closePath(); c.fill(); c.stroke();
        c.shadowBlur = 0; c.fillStyle = "#2f8f2a";
        for (const sx of [-7, -2, 3]) { c.beginPath(); c.moveTo(sx, -8); c.lineTo(sx + 2, -13); c.lineTo(sx + 4, -8); c.closePath(); c.fill(); }
        c.fillStyle = "#fff";
        c.beginPath(); c.moveTo(8, 5); c.lineTo(10, 8); c.lineTo(12, 5); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(12, 5); c.lineTo(13.5, 7.5); c.lineTo(15, 5); c.closePath(); c.fill();
        c.beginPath(); c.arc(7, -3, 2.6, 0, 7); c.fill();
        c.fillStyle = "#16320f"; c.beginPath(); c.arc(8, -3, 1.3, 0, 7); c.fill();
        break;
      }
      case "shark": { // grey shark — dorsal + tail fin, toothy grin
        c.shadowColor = skin.glow; c.shadowBlur = 10;
        c.fillStyle = "#6f93b0";
        c.beginPath(); c.moveTo(-9, 0); c.lineTo(-18, -7); c.lineTo(-15, 0); c.lineTo(-18, 7); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(-3, -8); c.lineTo(0, -16); c.lineTo(5, -8); c.closePath(); c.fill();
        const g = c.createLinearGradient(0, -9, 0, 9);
        g.addColorStop(0, "#bcd4e6"); g.addColorStop(0.55, "#7f9fb8"); g.addColorStop(1, "#5a7790");
        c.fillStyle = g; c.strokeStyle = "#dcebf5"; c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(-10, 0);
        c.quadraticCurveTo(-4, -10, 8, -7);
        c.quadraticCurveTo(16, -4, 16, 0);
        c.quadraticCurveTo(16, 4, 8, 7);
        c.quadraticCurveTo(-4, 10, -10, 0);
        c.closePath(); c.fill(); c.stroke();
        c.shadowBlur = 0;
        c.strokeStyle = "#2c3e50"; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(7, 5); c.quadraticCurveTo(13, 5, 16, 2); c.stroke();
        c.fillStyle = "#fff";
        for (const tx of [9, 12]) { c.beginPath(); c.moveTo(tx, 4.5); c.lineTo(tx + 1, 7); c.lineTo(tx + 2, 4.5); c.closePath(); c.fill(); }
        c.fillStyle = "#0a1622"; c.beginPath(); c.arc(9, -2, 1.6, 0, 7); c.fill();
        c.strokeStyle = "rgba(40,60,80,0.6)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(2, -3); c.lineTo(1, 3); c.moveTo(5, -3); c.lineTo(4, 3); c.stroke();
        break;
      }
      case "dragon": { // green dragon head, horn, bat wing
        c.shadowColor = skin.glow; c.shadowBlur = 10;
        c.fillStyle = "rgba(60,180,120,0.85)";
        c.beginPath(); c.moveTo(-4, -3); c.lineTo(-14, -13); c.lineTo(-10, -2); c.lineTo(-16, -4); c.lineTo(-6, 4); c.closePath(); c.fill();
        c.strokeStyle = "#3fae74"; c.lineWidth = 3; c.lineCap = "round";
        c.beginPath(); c.moveTo(-6, 4); c.quadraticCurveTo(-17, 6, -14, 12); c.stroke();
        const g = c.createLinearGradient(0, -10, 0, 10);
        g.addColorStop(0, "#8df0b8"); g.addColorStop(1, "#3aa56a");
        c.fillStyle = g; c.strokeStyle = "#d6ffe6"; c.lineWidth = 1.3;
        c.beginPath();
        c.moveTo(-8, -6);
        c.quadraticCurveTo(6, -10, 14, -5);
        c.lineTo(15, 1);
        c.quadraticCurveTo(11, 4, 6, 3);
        c.quadraticCurveTo(10, 8, 4, 8);
        c.quadraticCurveTo(-6, 8, -8, -6);
        c.closePath(); c.fill(); c.stroke();
        c.shadowBlur = 0; c.fillStyle = "#ffe6a8";
        c.beginPath(); c.moveTo(-3, -7); c.lineTo(1, -15); c.lineTo(3, -6); c.closePath(); c.fill();
        c.fillStyle = "#fff"; c.beginPath(); c.arc(6, -3, 2.4, 0, 7); c.fill();
        c.fillStyle = "#0d2a18"; c.beginPath(); c.arc(7, -3, 1.2, 0, 7); c.fill();
        c.fillStyle = "#1f6b42"; c.beginPath(); c.arc(13, 0, 1, 0, 7); c.fill();
        break;
      }
      case "rainbow": { // dart filled with rainbow bands
        c.shadowColor = skin.glow; c.shadowBlur = 12;
        const bands = ["#ff4d4d", "#ff9f1c", "#ffe14a", "#5dd35d", "#46b6ff", "#9b6bff"];
        c.save();
        c.beginPath(); c.moveTo(15, 0); c.lineTo(-12, -10); c.lineTo(-6, 0); c.lineTo(-12, 10); c.closePath();
        c.strokeStyle = "#ffffff"; c.lineWidth = 1.5; c.stroke();
        c.clip();
        const n = bands.length;
        for (let i = 0; i < n; i++) {
          c.fillStyle = bands[i];
          c.fillRect(-12, -10 + (20 * i / n), 28, 20 / n + 0.6);
        }
        c.restore();
        c.shadowBlur = 0; c.fillStyle = "rgba(255,255,255,0.9)";
        c.beginPath(); c.arc(2, 0, 2.4, 0, 7); c.fill();
        break;
      }
      case "alien": { // UFO with a little green alien + tractor beam
        c.shadowBlur = 0;
        const beam = c.createLinearGradient(0, 4, 0, 16);
        beam.addColorStop(0, "rgba(182,255,90,0.5)"); beam.addColorStop(1, "rgba(182,255,90,0)");
        c.fillStyle = beam;
        c.beginPath(); c.moveTo(-5, 4); c.lineTo(5, 4); c.lineTo(11, 15); c.lineTo(-11, 15); c.closePath(); c.fill();
        c.shadowColor = skin.glow; c.shadowBlur = 10;
        const g = c.createLinearGradient(0, -2, 0, 7);
        g.addColorStop(0, "#cfd8e8"); g.addColorStop(1, "#7b8aa6");
        c.fillStyle = g; c.strokeStyle = "#eef3ff"; c.lineWidth = 1.2;
        c.beginPath(); c.ellipse(0, 4, 15, 5, 0, 0, 7); c.fill(); c.stroke();
        c.shadowBlur = 0;
        const dg = c.createLinearGradient(0, -10, 0, 4);
        dg.addColorStop(0, "rgba(180,240,255,0.85)"); dg.addColorStop(1, "rgba(120,200,230,0.5)");
        c.fillStyle = dg; c.beginPath(); c.arc(0, 2, 9, Math.PI, 0); c.fill();
        c.strokeStyle = "rgba(220,245,255,0.9)"; c.stroke();
        c.fillStyle = "#9be05a"; c.beginPath(); c.ellipse(2, -1, 4.5, 5.5, 0, 0, 7); c.fill();
        c.fillStyle = "#10220a";
        c.beginPath(); c.ellipse(3.6, -1, 1.4, 2.2, -0.3, 0, 7); c.fill();
        c.beginPath(); c.ellipse(0.6, -1, 1.2, 2, 0.3, 0, 7); c.fill();
        c.fillStyle = "#ffe14a"; c.shadowColor = "#ffe14a"; c.shadowBlur = 6;
        for (const lx of [-11, -6, 6, 11]) { c.beginPath(); c.arc(lx, 4.5, 1.3, 0, 7); c.fill(); }
        c.shadowBlur = 0;
        break;
      }
      case "gold": { // sleek golden jet with sparkles
        c.shadowColor = skin.glow; c.shadowBlur = 16;
        const g = c.createLinearGradient(-12, -10, 15, 10);
        g.addColorStop(0, "#fff6c0"); g.addColorStop(0.5, "#ffcf33"); g.addColorStop(1, "#c98a00");
        c.fillStyle = g; c.strokeStyle = "#fff2b0"; c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(16, 0);
        c.lineTo(-6, -6); c.lineTo(-13, -11); c.lineTo(-8, -2);
        c.lineTo(-13, 0);
        c.lineTo(-8, 2); c.lineTo(-13, 11); c.lineTo(-6, 6);
        c.closePath(); c.fill(); c.stroke();
        c.shadowBlur = 0; c.fillStyle = "#5a3a00";
        c.beginPath(); c.ellipse(3, 0, 3, 2, 0, 0, 7); c.fill();
        c.fillStyle = "#fff";
        const tw = Math.abs(Math.sin(t * 5));
        c.globalAlpha = 0.5 + 0.5 * tw; sparkle(c, 9, -3, 2.6);
        c.globalAlpha = 0.4 + 0.5 * (1 - tw); sparkle(c, -2, 4, 2);
        c.globalAlpha = 1;
        break;
      }
      case "unicorn": { // white unicorn, golden horn, rainbow mane & tail
        c.shadowBlur = 0;
        const mane = ["#ff5d8f", "#ff9f1c", "#ffe14a", "#5dd35d", "#46b6ff", "#9b6bff"];
        c.lineWidth = 2.4; c.lineCap = "round";
        for (let i = 0; i < mane.length; i++) {
          c.strokeStyle = mane[i];
          c.beginPath();
          c.moveTo(-2, -7 + i * 1.0);
          c.quadraticCurveTo(-12 - i, -2 + i * 1.2, -15 - i * 0.5, 8 + i * 0.7);
          c.stroke();
        }
        for (let i = 0; i < mane.length; i++) {
          c.strokeStyle = mane[i];
          c.beginPath();
          c.moveTo(-7, 3 + i * 0.6);
          c.quadraticCurveTo(-17, 6 + i, -15 - i * 0.4, 13 + i * 0.5);
          c.stroke();
        }
        c.shadowColor = skin.glow; c.shadowBlur = 10;
        const g = c.createLinearGradient(0, -8, 0, 12);
        g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#ffe0f3");
        c.fillStyle = g; c.strokeStyle = "#ffd0ec"; c.lineWidth = 1.3;
        c.beginPath();
        c.moveTo(-6, -6);
        c.quadraticCurveTo(6, -9, 13, -2);
        c.lineTo(14, 4);
        c.quadraticCurveTo(9, 8, 4, 7);
        c.quadraticCurveTo(-4, 8, -6, -6);
        c.closePath(); c.fill(); c.stroke();
        c.shadowBlur = 0; c.fillStyle = "#fff0fb";
        c.beginPath(); c.moveTo(-3, -6); c.lineTo(-5, -12); c.lineTo(1, -7); c.closePath(); c.fill();
        c.fillStyle = "#ffd54a"; c.strokeStyle = "#c98a00"; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(3, -7); c.lineTo(6, -18); c.lineTo(8, -6); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(4, -9); c.lineTo(7, -9); c.moveTo(4.6, -12); c.lineTo(7, -12); c.moveTo(5.2, -15); c.lineTo(6.8, -15); c.stroke();
        c.fillStyle = "#3a2030"; c.beginPath(); c.arc(7, -1, 1.7, 0, 7); c.fill();
        c.fillStyle = "#fff"; c.beginPath(); c.arc(7.6, -1.6, 0.6, 0, 7); c.fill();
        c.fillStyle = "#e89ec8"; c.beginPath(); c.arc(12.5, 3, 0.9, 0, 7); c.fill();
        c.fillStyle = "#fff";
        const tw = Math.abs(Math.sin(t * 4));
        c.globalAlpha = 0.5 + 0.5 * tw; sparkle(c, 11, -9, 3);
        c.globalAlpha = 0.4 + 0.5 * (1 - tw); sparkle(c, -1, -10, 2);
        c.globalAlpha = 1;
        break;
      }
      default: { // "dart"
        const g = c.createLinearGradient(-12, -10, 15, 10);
        g.addColorStop(0, "#9af6ff"); g.addColorStop(1, "#1e9fc0");
        c.fillStyle = g; c.strokeStyle = "#eafcff";
        c.beginPath(); c.moveTo(15, 0); c.lineTo(-12, -9); c.lineTo(-6, 0); c.lineTo(-12, 9); c.closePath();
        c.fill(); c.stroke();
        c.shadowBlur = 0; c.fillStyle = "#04212b";
        c.beginPath(); c.arc(2, 0, 3, 0, 7); c.fill();
      }
    }
    c.shadowBlur = 0;
    c.globalAlpha = 1;
    c.lineWidth = 1;
  }

  // ----- Audio (tiny WebAudio SFX, no files) -----------------------------
  let audioCtx = null;
  function ac() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }
  function tone(freq, start, dur, type, vol) {
    const a = ac(); if (!a || muted) return;
    const t0 = a.currentTime + start;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function sfxComplete() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.2, "triangle", 0.16)); }
  function sfxWin() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.1, 0.32, "triangle", 0.18)); }
  function sfxCoin() { tone(1319, 0, 0.07, "square", 0.12); tone(1760, 0.07, 0.16, "square", 0.12); }
  function sfxCrash() {
    tone(170, 0, 0.18, "sawtooth", 0.22);
    tone(80, 0.02, 0.34, "square", 0.18);
    const a = ac(); if (!a || muted) return;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * 0.22), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const s = a.createBufferSource(); s.buffer = buf;
    const g = a.createGain(); g.gain.value = 0.22;
    s.connect(g).connect(a.destination); s.start();
  }

  // Per-level background music (js/music.js) — shares this file's AudioContext.
  // The stub keeps the game alive if that script ever fails to load.
  const MUSIC = window.MUSIC ||
    { init() {}, playLevel() {}, playCustom() {}, playFly() {}, stop() {}, pause() {}, resume() {}, setMuted() {} };
  MUSIC.init(ac);

  // ----- Geometry / collision -------------------------------------------
  // Current extension (0..len) of a moving spike at level-time t.
  // Smooth pump: retracted -> fully out -> retracted over one period.
  function movingExt(s, t) {
    const p = ((t / s.period) + (s.phase || 0)) % 1;
    return s.len * (0.5 - 0.5 * Math.cos(2 * Math.PI * p));
  }
  // Center of a moving GATE's hole at level-time t. A gate is a top + bottom
  // spike that slide up and down together (constant hole of half-height s.gap),
  // so the hole's center traces s.center ± s.amp every s.period seconds.
  function gateCenter(s, t) {
    return s.center + s.amp * Math.sin(2 * Math.PI * ((t / s.period) + (s.phase || 0)));
  }
  // Triangle [ax,ay,bx,by,cx,cy] for a spike at level-time t.
  //   bottom/top         = static.   launching/falling = piston in/out of a wall.
  //   gateTop/gateBottom = the two spikes of a moving hole (slide together).
  function spikeTri(s, t) {
    if (s.dir === "bottom") return [s.x, FLOOR, s.x + s.w, FLOOR, s.x + s.w / 2, FLOOR - s.h];
    if (s.dir === "top") return [s.x, CEIL, s.x + s.w, CEIL, s.x + s.w / 2, CEIL + s.h];
    if (s.dir === "gateTop") { const c = gateCenter(s, t); return [s.x, CEIL, s.x + s.w, CEIL, s.x + s.w / 2, c - s.gap]; }
    if (s.dir === "gateBottom") { const c = gateCenter(s, t); return [s.x, FLOOR, s.x + s.w, FLOOR, s.x + s.w / 2, c + s.gap]; }
    const ext = movingExt(s, t);
    if (s.dir === "launching") return [s.x, FLOOR, s.x + s.w, FLOOR, s.x + s.w / 2, FLOOR - ext];
    return [s.x, CEIL, s.x + s.w, CEIL, s.x + s.w / 2, CEIL + ext]; // "falling"
  }
  function triSign(px, py, ax, ay, bx, by) { return (px - bx) * (ay - by) - (ax - bx) * (py - by); }
  function pointInTri(px, py, ax, ay, bx, by, cx, cy) {
    const d1 = triSign(px, py, ax, ay, bx, by);
    const d2 = triSign(px, py, bx, by, cx, cy);
    const d3 = triSign(px, py, cx, cy, ax, ay);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  }
  function distSegSq(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + t * dx, qy = ay + t * dy;
    const ex = px - qx, ey = py - qy;
    return ex * ex + ey * ey;
  }
  function circleHitsTri(cx, cy, r, t) {
    if (pointInTri(cx, cy, t[0], t[1], t[2], t[3], t[4], t[5])) return true;
    const r2 = r * r;
    return (
      distSegSq(cx, cy, t[0], t[1], t[2], t[3]) <= r2 ||
      distSegSq(cx, cy, t[2], t[3], t[4], t[5]) <= r2 ||
      distSegSq(cx, cy, t[4], t[5], t[0], t[1]) <= r2
    );
  }

  // ----- Scene control ---------------------------------------------------
  function hideAllOverlays() {
    homeEl.classList.add("hidden");
    menuEl.classList.add("hidden");
    skinsEl.classList.add("hidden");
    messageEl.classList.add("hidden");
    pauseEl.classList.add("hidden");
    customEl.classList.add("hidden");
    editorEl.classList.add("hidden");
    settingsEl.classList.add("hidden");
    templesEl.classList.add("hidden");
    mapEl.classList.add("hidden");
    searchEl.classList.add("hidden");
    raceEl.classList.add("hidden");
    plusMenu.classList.add("hidden");
    state.coinAnim = null;
  }

  // Reset ship/camera/effects and enter the "play" scene (shared by all modes).
  function resetRun() {
    state.scene = "play";
    state.shipX = 120;
    state.y = H / 2;
    state.vy = 0;
    state.held = false;
    state.camX = 0;
    state.elapsed = 0;
    state.crashTimer = 0;
    state.trail = [];
    state.particles = [];
    state.fx = defaultFx();
    state.coinsGot = [];
    state.checkpoint = null;
    state.cpTimer = 0;
    state.assisted = assistActive();
    if (state.race) resetRaceBot();
    hideAllOverlays();
    blurActive();
    playRunMusic();
  }
  // every run gets its beat, restarted from the top (Geometry Dash style)
  function playRunMusic() {
    if (state.mode === "fly") MUSIC.playFly();
    else if (state.custom) MUSIC.playCustom(state.customSrc && state.customSrc.id);
    else if (state.pack && state.pack.kind !== "main") MUSIC.playLevel(DIFF_TRACK[currentLevel().diff | 0] || 0);
    else MUSIC.playLevel(state.levelIndex);
  }

  // ----- Assist modes: Noclip & Practice (pause menu) --------------------
  // Noclip flies through spikes; Practice respawns at checkpoints (auto every
  // few seconds, or press C). Neither mode is available in Straight Fly or
  // Races, and a run touched by either mode never counts as a real clear.
  function assistAllowed() { return state.mode === "level" && !state.race; }
  function assistActive() { return assistAllowed() && (state.modes.noclip || state.modes.practice); }
  function toggleMode(which) {
    state.modes[which] = !state.modes[which];
    if (state.modes[which]) state.assisted = true;      // the current run no longer counts
    if (which === "practice" && !state.modes.practice) state.checkpoint = null;
    renderModeButtons();
    tone(state.modes[which] ? 880 : 440, 0, 0.08, "triangle", 0.1);
  }
  function renderModeButtons() {
    const on = assistAllowed();
    modeRow.classList.toggle("hidden", !on);
    modeHint.classList.toggle("hidden", !on);
    noclipBtn.textContent = "👻 Noclip: " + (state.modes.noclip ? "ON" : "OFF");
    practiceBtn.textContent = "🚩 Practice: " + (state.modes.practice ? "ON" : "OFF");
    noclipBtn.classList.toggle("mode-on", state.modes.noclip);
    practiceBtn.classList.toggle("mode-on", state.modes.practice);
  }
  function setCheckpoint() {
    state.checkpoint = { shipX: state.shipX, y: state.y, vy: state.vy, elapsed: state.elapsed,
      coinsGot: state.coinsGot.slice(), fx: JSON.parse(JSON.stringify(state.fx)) };
    state.cpTimer = 0;
  }
  function respawnAtCheckpoint() {
    const c = state.checkpoint;
    state.scene = "play";
    state.shipX = c.shipX; state.y = c.y; state.vy = c.vy; state.elapsed = c.elapsed;
    state.coinsGot = c.coinsGot.slice(); state.fx = JSON.parse(JSON.stringify(c.fx));
    state.camX = Math.max(0, state.shipX - SHIP_SCREEN_X);
    state.held = false; state.trail = []; state.particles = []; state.crashTimer = 0; state.cpTimer = 0;
    state.assisted = true;
    hideAllOverlays();
    blurActive();
    playRunMusic();
  }

  function startLevel(i, pack) {
    state.mode = "level";
    state.custom = state.customSrc = state.customFrom = null;
    if (pack) state.pack = pack;
    if (!state.pack) state.pack = MAIN_PACK;
    if (state.pack.kind !== "race") state.race = null;
    state.levelIndex = i;
    resetRun();
  }

  // Launch a user-created level. `from` records where to exit back to
  // ("list" = My Levels screen, "editor" = the level creator).
  function startCustom(from) {
    if (from) state.customFrom = from;
    state.mode = "level";
    state.custom = buildCustomLevel(state.customSrc);
    if (state.customFrom === "editor") state.custom.hint = "Test flight!";
    resetRun();
  }

  function restartRun() {
    if (assistAllowed() && state.modes.practice && state.checkpoint) return respawnAtCheckpoint();
    if (state.mode === "fly") startFly();
    else if (state.custom) startCustom();
    else startLevel(state.levelIndex);
  }

  function currentLevel() { return state.custom || (state.pack || MAIN_PACK).levels[state.levelIndex]; }

  // Leave a run (or its end-of-run message) toward the right screen.
  function exitRun() {
    if (state.race) { state.race = null; goRace(); }
    else if (state.custom && state.customFrom === "editor") backToEditor();
    else if (state.custom && state.customFrom === "search") goSearch();
    else if (state.custom) goCustomMenu();
    else if (state.pack && state.pack.kind === "map") goMap();
    else goMenu(state.pack);
  }

  // ----- Straight Fly (endless narrowing tunnel) -------------------------
  function flyGap(worldX) {
    const d = Math.max(0, worldX - 120);
    return FLY_GAP_MIN + (FLY_GAP_MAX - FLY_GAP_MIN) * Math.exp(-d / FLY_GAP_K);
  }
  function flyCenter(worldX) {
    return H / 2 + FLY_CENTER_AMP * Math.sin((worldX - 120) / FLY_CENTER_WL * Math.PI * 2);
  }
  function startFly() {
    state.mode = "fly";
    state.custom = state.customSrc = state.customFrom = null;
    state.flyTime = 0;
    resetRun();
  }

  function goHome() {
    state.scene = "home";
    state.held = false;
    state.race = null;
    hideAllOverlays();
    updateCoinDisplays();
    renderChest();
    homeEl.classList.remove("hidden");
    plusMenu.classList.add("hidden");
    blurActive();
  }

  // ----- Daily chest -----------------------------------------------------
  function todayStr() { return new Date().toDateString(); }
  function chestClaimedToday() { return storeGet(CHEST_KEY) === todayStr(); }
  function renderChest() {
    const claimed = chestClaimedToday();
    chestBtn.className = "chest-btn " + (claimed ? "claimed" : "available");
    chestBtn.querySelector(".chest-label").textContent = claimed ? "Tomorrow" : "Daily";
  }
  function openChest() {
    if (chestClaimedToday()) { // already opened today -> little shake
      chestBtn.classList.remove("deny"); void chestBtn.offsetWidth; chestBtn.classList.add("deny");
      return;
    }
    const amount = 5 * (3 + Math.floor(Math.random() * 6)); // 15–40 coins, in 5s
    addCoins(amount);
    storeSet(CHEST_KEY, todayStr());
    renderChest();
    sfxComplete();
    showMessage("complete", "DAILY CHEST!", "Come back tomorrow for another!", "Collect!", goHome, true);
    setupReward(amount, state.coins);
  }

  function goMenu(pack) {        // level select (main levels or a temple)
    state.scene = "menu";
    state.held = false;
    state.race = null;
    state.pack = (pack && pack.kind !== "race") ? pack : MAIN_PACK;
    MUSIC.stop();
    hideAllOverlays();
    renderMenu(state.pack);
    menuEl.classList.remove("hidden");
    blurActive();
  }

  function goSkins() {
    state.scene = "skins";
    state.held = false;
    hideAllOverlays();
    renderSkins();
    skinsEl.classList.remove("hidden");
    blurActive();
  }

  function pauseGame() {
    if (state.scene !== "play") return;
    state.scene = "paused";
    state.held = false;
    MUSIC.pause();
    renderModeButtons();
    pauseEl.classList.remove("hidden");
    blurActive();
  }

  function resumeGame() {
    if (state.scene !== "paused") return;
    state.scene = "play";
    state.held = false;
    MUSIC.resume();
    pauseEl.classList.add("hidden");
    blurActive();
  }

  // Death is instant-restart (Geometry Dash style): explode, brief beat, respawn.
  function crash() {
    if (state.scene !== "play") return;
    state.held = false;
    spawnExplosion(state.shipX, state.y);
    MUSIC.stop();
    sfxCrash();
    if (state.mode === "fly") {        // Straight Fly: end the run, show your time
      const t = state.flyTime;
      const isBest = t > state.flyBest;
      if (isBest) { state.flyBest = t; storeSet(FLYBEST_KEY, t.toFixed(2)); }
      state.scene = "flyover";
      const body = isBest
        ? `You lasted ${t.toFixed(1)}s — a new record!`
        : `You lasted ${t.toFixed(1)}s  ·  Best ${state.flyBest.toFixed(1)}s`;
      showMessage(isBest ? "complete" : "crash", isBest ? "NEW BEST!" : "CRASHED", body, "Fly Again ↺", startFly);
      setupReward(0, 0); // no coins in this mode
      return;
    }
    if (state.race) {                  // races: no respawn — the rival takes it
      state.scene = "raceover";
      const r = state.race;
      if (r.botDead) {
        showMessage("crash", "NO WINNER", `Both you and ${r.rival.name} crashed. Rematch?`, "Rematch ↺", restartRun, false, "Races");
      } else {
        state.raceRec.losses++; saveRaceRec();
        showMessage("crash", `${r.rival.name.toUpperCase()} WINS`, `You crashed at ${Math.round(r.pct * 100)}%. ${r.rival.name} takes the race.`, "Rematch ↺", restartRun, false, "Races");
      }
      setupReward(0, 0);
      return;
    }
    state.scene = "crash";             // levels: auto-respawn (handled in the loop)
    state.crashTimer = 0;
  }

  function complete() {
    MUSIC.stop(); // silence for the clear jingle
    // Noclip / Practice runs: no unlock, no coins, no "beaten" — just a look at the level
    if (state.assisted && assistAllowed()) {
      state.scene = "complete";
      sfxComplete();
      const used = state.modes.noclip && state.modes.practice ? "Noclip and Practice" : state.modes.noclip ? "Noclip" : state.modes.practice ? "Practice" : "an assist mode";
      showMessage("complete", "PRACTICE CLEAR", `You reached the end using ${used}, so it doesn't count. Turn it off in the pause menu to beat the level for real.`,
        "Play Again ↺", () => { state.checkpoint = null; restartRun(); }, false, "Back");
      setupReward(0, state.coins);
      return;
    }
    // custom levels: no coins or unlocks, and exits lead back to where you came from
    if (state.custom) {
      state.scene = "complete";
      sfxComplete();
      // beating your own level (in a test or from the list) qualifies it for posting
      if (state.customSrc && state.customLevels.includes(state.customSrc) && !state.customSrc.beaten) {
        state.customSrc.beaten = true;
        saveCustomLevels();
      }
      const nc = levelCoins(state.custom).length, gc = state.coinsGot.length;
      const coinNote = nc ? ` 💠 ${gc}/${nc} secret coin${nc === 1 ? "" : "s"} found.` : "";
      if (state.customFrom === "editor") {
        showMessage("complete", "LEVEL CLEAR!", "Your level works." + coinNote + " Back to building!",
          "Back to Editor ✏️", backToEditor, true);
      } else if (state.customFrom === "search") {
        showMessage("complete", "LEVEL CLEAR!", `You beat “${state.custom.name}” by ${state.customSrc.author || "?"}!` + coinNote,
          "Play Again ↺", () => startCustom(), false, "Search");
      } else {
        showMessage("complete", "LEVEL CLEAR!", `You beat “${state.custom.name}”. Nice flying!` + coinNote,
          "Play Again ↺", () => startCustom(), false, "My Levels");
      }
      setupReward(0, state.coins);
      return;
    }
    // races: finishing = winning (the rival is always a hair behind)
    if (state.race) {
      const r = state.race;
      state.scene = "win";
      sfxWin();
      state.raceRec.wins++; saveRaceRec();
      const reward = 30;
      addCoins(reward);
      showMessage("win", "YOU WIN THE RACE!", r.botDead ? `${r.rival.name} crashed and you finished. Champion!` : `You beat ${r.rival.name} to the finish!`,
        "New Race 🏁", () => { rollRace(); startRace(); }, false, "Races");
      setupReward(reward, state.coins);
      return;
    }
    const pack = state.pack || MAIN_PACK;
    const i = state.levelIndex;
    const isLast = i >= pack.levels.length - 1;
    // coins are awarded only on the FIRST clear (unlocked only advances then)
    const firstClear = (i + 1) > packUnlocked(pack);
    let reward = 0;
    if (firstClear) {
      if (pack.kind === "main") reward = LEVEL_REWARD[i] != null ? LEVEL_REWARD[i] : DEFAULT_REWARD;
      else reward = 20 + (pack.levels[i].diff | 0) * 10;
    }
    // the hidden coin banks only if you also finish the level (Geometry Dash style)
    let coinNote = "";
    if (state.coinsGot.length && !levelCoinFound(pack, i)) {
      state.levelCoins.add(coinKey(pack, i));
      saveLevelCoins();
      reward += COIN_REWARD;
      coinNote = ` 💠 Secret coin found! +${COIN_REWARD} 🪙`;
    }
    if (reward) addCoins(reward);
    setPackUnlocked(pack, i + 1);
    if (isLast) {
      state.scene = "win";
      sfxWin();
      if (pack.kind === "main") {
        showMessage("win", "YOU WIN!", "You cleared every level. Nice flying, pilot!" + coinNote,
          "Play Again ↺", () => startLevel(i));
      } else if (pack.kind === "temple") {
        showMessage("win", "TEMPLE CLEARED!", `You conquered the ${pack.temple.name}!` + coinNote,
          "Play Again ↺", () => startLevel(i), false, "Temples");
      } else {
        showMessage("win", "DUNGEON CLEARED!", "You beat the dungeon and finished the trail!" + coinNote,
          "Play Again ↺", () => startLevel(i), false, "Map");
      }
    } else {
      state.scene = "complete";
      sfxComplete();
      showMessage("complete", "LEVEL CLEAR!", (pack.kind === "map" && pack.levels[i + 1].dungeon ? "The DUNGEON is open…" : "Next level unlocked.") + coinNote,
        "Next Level →", () => startLevel(i + 1), false, pack.kind === "main" ? "Level Select" : pack.kind === "temple" ? "Temple" : "Map");
    }
    setupReward(reward, state.coins); // animate the coin count-up
  }

  // Show the "+earned" badge and count the total up from old balance to new.
  function setupReward(earned, total) {
    if (earned > 0) {
      rewardBox.classList.remove("hidden");
      rewardEarnedNum.textContent = earned;
      rewardTotal.textContent = total - earned;
      state.coinAnim = { from: total - earned, to: total, t: 0, dur: 0.9, shown: total - earned, lastTick: 0, target: "reward" };
      rewardEarned.classList.remove("pop"); void rewardEarned.offsetWidth; rewardEarned.classList.add("pop");
    } else {
      rewardBox.classList.add("hidden");
      state.coinAnim = null;
    }
  }

  function showMessage(kind, title, body, primaryLabel, primaryAction, hideMenu, menuLabel) {
    messageEl.className = "overlay " + kind;
    messageTitle.textContent = title;
    messageBody.textContent = body;
    primaryBtn.textContent = primaryLabel;
    menuBtn.textContent = menuLabel || "Level Select";
    menuBtn.style.display = hideMenu ? "none" : "";
    state.primaryAction = primaryAction;
    messageEl.classList.remove("hidden");
    blurActive();
  }

  function advance() { if (typeof state.primaryAction === "function") state.primaryAction(); }
  function blurActive() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }

  // ----- Update ----------------------------------------------------------
  function updateFly(dt) {
    state.flyTime += dt;
    // vertical physics (same feel as levels)
    state.vy += GRAVITY * dt;
    if (state.held) state.vy -= THRUST * dt;
    if (state.vy > MAX_VY) state.vy = MAX_VY;
    if (state.vy < -MAX_VY) state.vy = -MAX_VY;
    state.y += state.vy * dt;
    if (state.y < CEIL + SHIP_R) { state.y = CEIL + SHIP_R; if (state.vy < 0) state.vy = 0; }
    if (state.y > FLOOR - SHIP_R) { state.y = FLOOR - SHIP_R; if (state.vy > 0) state.vy = 0; }
    // scroll
    state.shipX += FLY_SPEED * dt;
    state.camX = Math.max(0, state.shipX - SHIP_SCREEN_X);
    // trail
    state.trail.push({ x: state.shipX, y: state.y });
    if (state.trail.length > 18) state.trail.shift();
    // collision with the tunnel walls at the ship's x
    const c = flyCenter(state.shipX), half = flyGap(state.shipX) / 2;
    if (state.y - COLLIDE_R < c - half || state.y + COLLIDE_R > c + half) crash();
  }

  function update(dt) {
    if (state.mode === "fly") return updateFly(dt);
    state.elapsed += dt;
    const lvl = currentLevel();

    // vertical physics
    state.vy += GRAVITY * dt;
    if (state.held) state.vy -= THRUST * dt;
    if (state.vy > MAX_VY) state.vy = MAX_VY;
    if (state.vy < -MAX_VY) state.vy = -MAX_VY;
    state.y += state.vy * dt;

    // clamp to play area (touching edges is safe, just stops you)
    if (state.y < CEIL + SHIP_R) { state.y = CEIL + SHIP_R; if (state.vy < 0) state.vy = 0; }
    if (state.y > FLOOR - SHIP_R) { state.y = FLOOR - SHIP_R; if (state.vy > 0) state.vy = 0; }

    // horizontal scroll (decoration SPEED triggers scale it)
    state.shipX += lvl.speed * state.fx.speedMul * dt;
    state.camX = Math.max(0, state.shipX - SHIP_SCREEN_X);

    // decoration triggers fire as the ship passes them
    const trigs = lvl.triggers || [];
    while (state.fx.nextTrig < trigs.length && trigs[state.fx.nextTrig].x <= state.shipX) fireTrigger(trigs[state.fx.nextTrig++]);
    updateFx(dt);
    if (state.race) updateRace(dt, lvl);

    // trail
    state.trail.push({ x: state.shipX, y: state.y });
    if (state.trail.length > 18) state.trail.shift();

    // assist modes
    const noclip = assistAllowed() && state.modes.noclip;
    if (assistAllowed() && state.modes.practice) {
      state.cpTimer += dt;
      if (state.cpTimer >= 1.5) setCheckpoint();   // auto checkpoint (C also drops one)
    }

    // collision with spikes (only those near the ship) — Noclip flies straight through
    if (!noclip) for (const s of lvl.obstacles) {
      if (s.x + s.w < state.shipX - SHIP_R || s.x > state.shipX + SHIP_R) continue;
      if (circleHitsTri(state.shipX, state.y, COLLIDE_R, spikeTri(s, state.elapsed))) { crash(); return; }
    }

    // secret coins
    if (!state.race) {
      const coins = levelCoins(lvl);
      const banked = !state.custom && levelCoinFound(state.pack || MAIN_PACK, state.levelIndex);
      if (!banked) {
        for (let i = 0; i < coins.length; i++) {
          if (state.coinsGot.includes(i)) continue;
          const dx = coins[i].x - state.shipX, dy = coins[i].y - state.y;
          if (dx * dx + dy * dy <= (SHIP_R + COIN_R) * (SHIP_R + COIN_R)) {
            state.coinsGot.push(i);
            sfxCoin();
            for (let k = 0; k < 14; k++) {
              const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 140;
              state.particles.push({ x: coins[i].x, y: coins[i].y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life: 0.5 + Math.random() * 0.4, max: 0.9, col: k % 2 ? "#7af5ff" : "#b06bff", r: 2 + Math.random() * 2 });
            }
          }
        }
      }
    }

    // reached the finish
    if (state.shipX >= lvl.length) complete();
  }

  // ----- Decoration triggers (level creator) -----------------------------
  // A trigger sits at an x in the level and fires once the ship passes it.
  function defaultFx() {
    return { shake: 0, shakeDur: 1, shakeStr: 0, pulse: null, speedMul: 1, particles: null,
             spikeCol: null, bgCol: null, bgStyle: "stars", fade: null, nextTrig: 0, spawnAcc: 0 };
  }
  function fireTrigger(tr) {
    const fx = state.fx;
    switch (tr.type) {
      case "shake": fx.shake = tr.dur; fx.shakeDur = tr.dur; fx.shakeStr = tr.str * 2.2; break;
      case "pulse": fx.pulse = { col: tr.col, t: 0, dur: tr.dur, str: tr.str }; break;
      case "speed": fx.speedMul = tr.spd; break;
      case "particles": fx.particles = { col: tr.col, amt: tr.str }; break;
      case "color": fx.spikeCol = tr.col; fx.fade = null; break;
      case "bgcolor": fx.bgCol = tr.col; fx.fade = null; break;
      case "background": fx.bgStyle = tr.bg; break;
      case "fade":
        fx.fade = { t: 0, dur: tr.dur, fromSpike: fx.spikeCol || DEFAULT_SPIKE, toSpike: tr.col, fromBg: fx.bgCol || DEFAULT_BG, toBg: tr.col2 };
        break;
      case "stop": { const n = fx.nextTrig; state.fx = defaultFx(); state.fx.nextTrig = n; break; }
    }
  }
  function updateFx(dt) {
    const fx = state.fx;
    if (fx.shake > 0) fx.shake -= dt;
    if (fx.pulse) { fx.pulse.t += dt; if (fx.pulse.t >= fx.pulse.dur) fx.pulse = null; }
    if (fx.fade) {
      const f = fx.fade; f.t += dt;
      const p = Math.min(1, f.t / f.dur);
      fx.spikeCol = lerpColor(f.fromSpike, f.toSpike, p);
      fx.bgCol = lerpColor(f.fromBg, f.toBg, p);
      if (p >= 1) fx.fade = null;
    }
    if (fx.particles) {                       // floating mini circles
      fx.spawnAcc += fx.particles.amt * 4 * dt;
      while (fx.spawnAcc >= 1) {
        fx.spawnAcc -= 1;
        state.particles.push({
          x: state.camX + Math.random() * (W + 80) - 40, y: H + 10,
          vx: (Math.random() - 0.5) * 30, vy: -(30 + Math.random() * 70),
          life: 3 + Math.random() * 3, max: 6, col: fx.particles.col, r: 1.5 + Math.random() * 3.5, float: true,
        });
      }
    }
  }
  function hexToRgb(h) {
    h = String(h || "#000000").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
  }
  function lerpColor(a, b, p) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(A[0] + (B[0] - A[0]) * p, A[1] + (B[1] - A[1]) * p, A[2] + (B[2] - A[2]) * p);
  }
  function shadeHex(h, f) { const c = hexToRgb(h); return rgbToHex(c[0] * f, c[1] * f, c[2] * f); }
  function rgba(h, a) { const c = hexToRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

  function spawnExplosion(x, y) {
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * 320 + 60;
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: Math.random() * 0.6 + 0.4,
        max: 1,
        col: Math.random() < 0.5 ? "#ff9f43" : "#ff5470",
        r: Math.random() * 3 + 1.5,
      });
    }
  }
  function updateParticles(dt) {
    for (const p of state.particles) {
      if (!p.float) p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  // ----- Rendering -------------------------------------------------------
  function render() {
    if (state.scene === "editor") { drawEditor(); return; }
    const inGame = state.scene === "play" || state.scene === "crash" ||
                   state.scene === "paused" || state.scene === "flyover" || state.scene === "raceover";
    const camX = inGame ? state.camX : globalTime * 36; // gentle drift on menu

    // SHAKE trigger: jitter the whole frame while it lasts
    const fx = state.fx;
    const shaking = inGame && fx && fx.shake > 0 && state.scene === "play";
    ctx.save();
    if (shaking) {
      const k = fx.shakeStr * (fx.shake / fx.shakeDur);
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }

    drawBackground(camX, inGame ? fx : null);

    if (inGame && state.mode === "fly") {
      drawFlyCorridor(camX);
      drawTrail(camX);
      if (state.scene !== "flyover") drawShip(); // ship gone after the run ends
      drawParticles(camX);
      drawFlyHUD();
      if (state.scene === "play") drawPauseButton();
    } else if (inGame) {
      const lvl = currentLevel();
      drawSpikes(lvl, camX);
      drawFinish(lvl, camX);
      if (!state.race) {
        const banked = !state.custom && levelCoinFound(state.pack || MAIN_PACK, state.levelIndex);
        levelCoins(lvl).forEach((c, i) => {
          if (!banked && state.coinsGot.includes(i)) return;
          if (c.x - camX > -30 && c.x - camX < W + 30) drawCoin(c.x - camX, c.y, globalTime, banked);
        });
      }
      if (state.race) drawRaceBot(camX);
      if (state.checkpoint && assistAllowed() && state.modes.practice) drawCheckpoint(state.checkpoint, camX);
      drawTrail(camX);
      if (state.scene !== "crash" && state.scene !== "raceover") drawShip(); // ship is gone (exploded) on crash
      drawParticles(camX);
      if (fx && fx.pulse) {                   // PULSE trigger: breathe a color over the screen
        const p = fx.pulse, a = (0.08 + 0.05 * p.str) * (0.5 + 0.5 * Math.sin(p.t * 6)) * Math.min(1, (p.dur - p.t) / 0.5 + 0.2);
        ctx.fillStyle = rgba(p.col, clamp(a, 0, 0.7)); ctx.fillRect(-20, -20, W + 40, H + 40);
      }
      drawHUD(lvl);
      drawHint(lvl);
      if (state.scene === "play") drawPauseButton();
      if (state.scene === "crash") drawCrashFlash();
    } else {
      drawParticles(camX);
    }
    ctx.restore();
  }

  function drawFlyCorridor(camX) {
    const step = 8;
    // top terrain
    const tg = ctx.createLinearGradient(0, 0, 0, H);
    tg.addColorStop(0, "#3a1420"); tg.addColorStop(1, "#150a12");
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (let sx = 0; sx <= W; sx += step) { const wx = camX + sx; ctx.lineTo(sx, flyCenter(wx) - flyGap(wx) / 2); }
    ctx.lineTo(W, 0); ctx.closePath(); ctx.fill();
    // bottom terrain
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let sx = 0; sx <= W; sx += step) { const wx = camX + sx; ctx.lineTo(sx, flyCenter(wx) + flyGap(wx) / 2); }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // glowing edges
    ctx.strokeStyle = "rgba(255,120,140,0.95)";
    ctx.lineWidth = 2.5; ctx.lineCap = "round";
    ctx.shadowColor = "rgba(255,84,112,0.6)"; ctx.shadowBlur = 10;
    ctx.beginPath();
    for (let sx = 0; sx <= W; sx += step) { const wx = camX + sx; const y = flyCenter(wx) - flyGap(wx) / 2; sx ? ctx.lineTo(sx, y) : ctx.moveTo(sx, y); }
    ctx.stroke();
    ctx.beginPath();
    for (let sx = 0; sx <= W; sx += step) { const wx = camX + sx; const y = flyCenter(wx) + flyGap(wx) / 2; sx ? ctx.lineTo(sx, y) : ctx.moveTo(sx, y); }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawFlyHUD() {
    ctx.textAlign = "center";
    ctx.fillStyle = "#eafcff";
    ctx.font = "bold 30px system-ui, sans-serif";
    ctx.shadowColor = "rgba(70,230,255,0.5)"; ctx.shadowBlur = 12;
    ctx.fillText(state.flyTime.toFixed(1) + "s", W / 2, 42);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(232,238,252,0.55)";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.fillText("BEST  " + state.flyBest.toFixed(1) + "s", W / 2, 62);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(232,238,252,0.85)";
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText("STRAIGHT FLY", 16, 32);
    // brief intro hint
    if (state.flyTime < 3) {
      const a = state.flyTime < 2.2 ? 1 : (3 - state.flyTime) / 0.8;
      ctx.globalAlpha = Math.max(0, a);
      ctx.textAlign = "center";
      ctx.fillStyle = "#46e6ff";
      ctx.font = "bold 22px system-ui, sans-serif";
      ctx.fillText("The tunnel is closing — survive!", W / 2, H / 2 - 70);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
    }
  }

  function drawBackground(camX, fx) {
    const bg = fx && fx.bgCol;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (bg) { g.addColorStop(0, bg); g.addColorStop(0.55, shadeHex(bg, 0.8)); g.addColorStop(1, shadeHex(bg, 0.5)); }
    else { g.addColorStop(0, "#0c1430"); g.addColorStop(0.55, "#0a0f24"); g.addColorStop(1, "#06091a"); }
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, W + 40, H + 40);

    const style = (fx && fx.bgStyle) || "stars";
    if (style === "stars") {
      for (const s of stars) {              // parallax stars
        let sx = ((s.x - camX * s.f) % W + W) % W;
        const tw = 0.55 + 0.45 * Math.sin(globalTime * s.sp + s.tw);
        ctx.globalAlpha = tw;
        ctx.fillStyle = "#cfe3ff";
        ctx.beginPath();
        ctx.arc(sx, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (style === "grid") {          // scrolling neon grid
      ctx.globalAlpha = 0.18; ctx.strokeStyle = "#46e6ff"; ctx.lineWidth = 1;
      const off = (camX * 0.5) % 60;
      for (let x = -off; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    } else if (style === "hills") {         // layered rolling hills
      for (let layer = 0; layer < 3; layer++) {
        const f = 0.15 + layer * 0.2, base = H - 40 - layer * 70, amp = 40 + layer * 20;
        ctx.globalAlpha = 0.22 + layer * 0.12; ctx.fillStyle = layer === 2 ? "#1b2a5a" : layer === 1 ? "#142046" : "#0f1838";
        ctx.beginPath(); ctx.moveTo(0, H);
        for (let sx = 0; sx <= W; sx += 12) { const wx = camX * f + sx; ctx.lineTo(sx, base - amp * Math.sin(wx / 160) - amp * 0.4 * Math.sin(wx / 53)); }
        ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      }
    } else if (style === "nebula") {        // soft drifting color clouds
      const cols = ["#b06bff", "#ff5d8f", "#46e6ff", "#ffd166"];
      for (let i = 0; i < 6; i++) {
        const wx = ((i * 337 - camX * (0.2 + (i % 3) * 0.1)) % (W + 300) + W + 300) % (W + 300) - 150;
        const wy = 80 + ((i * 173) % (H - 160)) + Math.sin(globalTime * 0.4 + i) * 20;
        const rg = ctx.createRadialGradient(wx, wy, 0, wx, wy, 160 + (i % 3) * 40);
        rg.addColorStop(0, rgba(cols[i % cols.length], 0.22)); rg.addColorStop(1, rgba(cols[i % cols.length], 0));
        ctx.globalAlpha = 1; ctx.fillStyle = rg; ctx.fillRect(wx - 220, wy - 220, 440, 440);
      }
    }                                        // "void": just the gradient
    ctx.globalAlpha = 1;

    // faint top/bottom depth bands
    const band = ctx.createLinearGradient(0, 0, 0, 60);
    band.addColorStop(0, "rgba(70,230,255,0.08)");
    band.addColorStop(1, "rgba(70,230,255,0)");
    ctx.fillStyle = band; ctx.fillRect(0, 0, W, 60);
    const band2 = ctx.createLinearGradient(0, H - 60, 0, H);
    band2.addColorStop(0, "rgba(70,230,255,0)");
    band2.addColorStop(1, "rgba(70,230,255,0.08)");
    ctx.fillStyle = band2; ctx.fillRect(0, H - 60, W, 60);
  }

  function drawSpikes(lvl, camX) { drawObstacles(lvl.obstacles, camX, state.elapsed); }

  // Draw game-format obstacles at level-time t (shared by play and the editor).
  function drawObstacles(obstacles, camX, t) {
    for (const s of obstacles) {
      const sx = s.x - camX;
      if (sx + s.w < -20 || sx > W + 20) continue;
      const gate = s.dir === "gateTop" || s.dir === "gateBottom";
      const piston = s.dir === "launching" || s.dir === "falling";
      const moving = gate || piston;
      const tri = spikeTri(s, t);
      const px = [tri[0] - camX, tri[1], tri[2] - camX, tri[3], tri[4] - camX, tri[5]];
      const apexY = px[5], baseY = px[1];

      // moving spikes get a wall "socket" that's always visible (telegraph):
      // amber for pistons, violet for gates.
      if (piston) {
        ctx.fillStyle = "rgba(255,170,70,0.30)";
        if (s.dir === "launching") ctx.fillRect(sx, H - 7, s.w, 7);
        else ctx.fillRect(sx, 0, s.w, 7);
      } else if (gate) {
        ctx.fillStyle = "rgba(176,107,255,0.30)";
        if (s.dir === "gateBottom") ctx.fillRect(sx, H - 7, s.w, 7);
        else ctx.fillRect(sx, 0, s.w, 7);
      }

      const g = ctx.createLinearGradient(0, Math.min(apexY, baseY), 0, Math.max(apexY, baseY));
      if (gate) {
        const tip = "#d2a8ff", root = "#3a1f66";
        // tip is the apex (the edge of the hole); root anchors at ceiling/floor
        if (s.dir === "gateTop") { g.addColorStop(0, root); g.addColorStop(1, tip); }
        else { g.addColorStop(0, tip); g.addColorStop(1, root); }
      } else if (piston) {
        const tip = "#ffc24a", root = "#8a4412";
        if (s.dir === "launching") { g.addColorStop(0, tip); g.addColorStop(1, root); }
        else { g.addColorStop(0, root); g.addColorStop(1, tip); }
      } else {
        const sc = (state.fx && state.fx.spikeCol) || DEFAULT_SPIKE, root = sc === DEFAULT_SPIKE ? "#7a1f2b" : shadeHex(sc, 0.45);
        if (s.dir === "bottom") { g.addColorStop(0, sc); g.addColorStop(1, root); }
        else { g.addColorStop(0, root); g.addColorStop(1, sc); }
      }

      ctx.beginPath();
      ctx.moveTo(px[0], px[1]);
      ctx.lineTo(px[2], px[3]);
      ctx.lineTo(px[4], px[5]);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2;
      const sc = state.fx && state.fx.spikeCol;
      ctx.strokeStyle = gate ? "rgba(210,170,255,0.95)" : piston ? "rgba(255,200,120,0.95)" : sc ? rgba(lerpColor(sc, "#ffffff", 0.3), 0.9) : "rgba(255,140,160,0.9)";
      ctx.shadowColor = gate ? "rgba(176,107,255,0.55)" : piston ? "rgba(255,170,70,0.55)" : sc ? rgba(sc, 0.6) : "rgba(255,84,112,0.6)";
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawFinish(lvl, camX) {
    const fx = lvl.length - camX;
    if (fx < -30 || fx > W + 200) return;
    // glow pillar
    const g = ctx.createLinearGradient(fx - 14, 0, fx + 14, 0);
    g.addColorStop(0, "rgba(70,230,255,0)");
    g.addColorStop(0.5, "rgba(70,230,255,0.35)");
    g.addColorStop(1, "rgba(70,230,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(fx - 14, 0, 28, H);
    // checkered post
    const cell = 18;
    for (let row = 0; row * cell < H; row++) {
      ctx.fillStyle = (row % 2 === 0) ? "#e8eefc" : "#0a0f24";
      ctx.fillRect(fx - 5, row * cell, 10, cell);
    }
    ctx.fillStyle = "#46e6ff";
    ctx.font = "bold 16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.save();
    ctx.translate(fx, 26);
    ctx.fillText("FINISH", 0, 0);
    ctx.restore();
    ctx.textAlign = "left";
  }

  function drawTrail(camX) {
    if (state.trail.length < 2) return;
    const col = (SKINS[state.skin] || SKINS[0]).trail;
    ctx.strokeStyle = col;
    ctx.lineCap = "round";
    for (let i = 1; i < state.trail.length; i++) {
      const a = state.trail[i - 1], b = state.trail[i];
      ctx.globalAlpha = (i / state.trail.length) * 0.5;
      ctx.lineWidth = (i / state.trail.length) * 6;
      ctx.beginPath();
      ctx.moveTo(a.x - camX, a.y);
      ctx.lineTo(b.x - camX, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawShip() {
    const sx = state.shipX - state.camX;
    const angle = Math.max(-0.45, Math.min(0.45, state.vy / MAX_VY * 0.5));
    ctx.save();
    ctx.translate(sx, state.y);
    ctx.rotate(angle);
    paintShip(ctx, SKINS[state.skin] || SKINS[0], state.held, globalTime);
    ctx.restore();
  }

  function drawParticles(camX) {
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x - camX, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawCheckpoint(c, camX) {
    const x = c.shipX - camX;
    if (x < -30 || x > W + 30) return;
    ctx.save();
    ctx.strokeStyle = "rgba(176,107,255,0.6)"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#b06bff";
    ctx.beginPath(); ctx.moveTo(x, c.y - 26); ctx.lineTo(x + 18, c.y - 19); ctx.lineTo(x, c.y - 12); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - 1, c.y - 26, 2, 30);
    ctx.restore();
  }

  function drawHUD(lvl) {
    // progress bar (leaves room for the pause button on the right)
    const pad = 16, barH = 6, y = 12;
    const barW = W - pad - 56 - (state.settings.showPct ? 54 : 0);
    const prog = Math.max(0, Math.min(1, (state.shipX - 120) / (lvl.length - 120)));
    if (state.settings.showBar) {
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      roundRect(pad, y, barW, barH, 3); ctx.fill();
      ctx.fillStyle = "#46e6ff";
      roundRect(pad, y, barW * prog, barH, 3); ctx.fill();
      if (state.race) {                     // rival marker
        const r = state.race, bp = Math.max(0, Math.min(1, (r.botX - 120) / (lvl.length - 120)));
        ctx.fillStyle = r.botDead ? "rgba(255,84,112,0.5)" : "#ff5470";
        ctx.beginPath(); ctx.arc(pad + barW * bp, y + barH / 2, 4, 0, Math.PI * 2); ctx.fill();
      }
      // ship marker
      ctx.fillStyle = "#eafcff";
      ctx.beginPath();
      ctx.arc(pad + barW * prog, y + barH / 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (state.settings.showPct) {           // percentage readout
      ctx.fillStyle = "#eafcff";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(Math.floor(prog * 100) + "%", W - 60, y + 8);
      ctx.textAlign = "left";
    }

    // level label
    ctx.fillStyle = "rgba(232,238,252,0.85)";
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.textAlign = "left";
    const pack = state.pack || MAIN_PACK;
    const label = state.race
      ? `🏁 RACE vs ${state.race.rival.name} · ${lvl.name}`
      : state.custom
        ? (state.customFrom === "editor" ? "TEST · " : "") + lvl.name
        : pack.kind === "temple"
          ? `${pack.temple.name.toUpperCase()} ${state.levelIndex + 1} · ${lvl.name}`
          : pack.kind === "map"
            ? (lvl.dungeon ? "DUNGEON · " : `MAP ${state.levelIndex + 1} · `) + lvl.name
            : `LEVEL ${state.levelIndex + 1} · ${lvl.name}`;
    ctx.fillText(label, pad, 40);
    if (assistActive() || (state.assisted && assistAllowed())) {   // assist tags (this run won't count)
      ctx.font = "bold 12px system-ui, sans-serif";
      let tx = pad;
      const tag = (txt, col) => { ctx.fillStyle = col; ctx.fillText(txt, tx, 60); tx += ctx.measureText(txt).width + 12; };
      if (state.modes.noclip) tag("👻 NOCLIP", "#9cff57");
      if (state.modes.practice) tag("🚩 PRACTICE" + (state.checkpoint ? "" : " · press C for a checkpoint"), "#b06bff");
      tag("· won't count", "rgba(232,238,252,0.55)");
    }
    if (!state.race && levelCoins(lvl).length) {
      const banked = !state.custom && levelCoinFound(state.pack || MAIN_PACK, state.levelIndex);
      const n = levelCoins(lvl).length, got = banked ? n : state.coinsGot.length;
      ctx.globalAlpha = got ? 1 : 0.35;
      ctx.fillText((n > 1 ? `${got}/${n} ` : "") + "💠", pad + ctx.measureText(label).width + 12, 40);
      ctx.globalAlpha = 1;
    }
    if (state.race && state.race.toast > 0) {
      ctx.globalAlpha = Math.min(1, state.race.toast);
      ctx.textAlign = "center"; ctx.fillStyle = "#ff5470"; ctx.font = "bold 24px system-ui, sans-serif";
      ctx.shadowColor = "rgba(255,84,112,0.6)"; ctx.shadowBlur = 14;
      ctx.fillText(`${state.race.rival.name} crashed!`, W / 2, H / 2 - 100);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.textAlign = "left";
    }
  }

  function drawPauseButton() {
    const b = PAUSE_BTN;
    ctx.fillStyle = "rgba(10,15,30,0.55)";
    roundRect(b.x, b.y, b.w, b.h, 7); ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(150,200,255,0.5)";
    roundRect(b.x, b.y, b.w, b.h, 7); ctx.stroke();
    ctx.fillStyle = "rgba(232,238,252,0.95)";
    const bw = 4, gap = 6, bh = b.h - 16, by = b.y + 8, cx = b.x + b.w / 2;
    ctx.fillRect(cx - gap / 2 - bw, by, bw, bh);
    ctx.fillRect(cx + gap / 2, by, bw, bh);
  }

  function drawCrashFlash() {
    const a = Math.max(0, 0.4 * (1 - state.crashTimer / 0.5));
    if (a <= 0) return;
    ctx.fillStyle = `rgba(255,70,100,${a})`;
    ctx.fillRect(0, 0, W, H);
  }

  function drawHint(lvl) {
    const e = state.elapsed;
    let a = 0;
    if (e < 0.4) a = e / 0.4;
    else if (e < 3.0) a = 1;
    else if (e < 4.4) a = 1 - (e - 3.0) / 1.4;
    if (a <= 0) return;
    ctx.globalAlpha = a;
    ctx.textAlign = "center";
    ctx.fillStyle = "#46e6ff";
    ctx.font = "bold 26px system-ui, sans-serif";
    ctx.shadowColor = "rgba(70,230,255,0.5)";
    ctx.shadowBlur = 16;
    ctx.fillText(lvl.hint, W / 2, H / 2 - 60);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  function roundRect(x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ----- Menu rendering --------------------------------------------------
  function renderMenu(pack) {
    pack = pack || MAIN_PACK;
    menuTitle.textContent = pack.title;
    menuSub.textContent = pack.sub || "";
    menuSub.classList.toggle("hidden", !pack.sub);
    document.getElementById("resetProgress").style.display = pack.kind === "main" ? "" : "none";
    levelSelectEl.innerHTML = "";
    const unlocked = packUnlocked(pack);
    pack.levels.forEach((lvl, i) => {
      const locked = i > unlocked;
      const cleared = i < unlocked;
      const card = document.createElement("div");
      card.className = "level-card" + (locked ? " locked" : "");
      const badge = cleared
        ? '<span class="badge cleared">CLEARED ✓</span>'
        : locked
          ? '<span class="badge locked">🔒 LOCKED</span>'
          : '<span class="badge ready">▶ PLAY</span>';
      card.innerHTML =
        `<div class="num">${pack.kind === "temple" ? (pack.temple.icon + " Level ") : "Level "}${i + 1}</div>` +
        `<div class="name">${lvl.name}</div>` +
        `<div class="desc">${lvl.subtitle}</div>` +
        diffBadge(lvl.diff | 0) + badge +
        `<span class="coin-mark${levelCoinFound(pack, i) ? " got" : ""}" title="${levelCoinFound(pack, i) ? "Secret coin found" : "Secret coin not found yet"}">💠</span>`;
      if (!locked) card.addEventListener("click", () => { ac(); startLevel(i, pack); });
      levelSelectEl.appendChild(card);
    });
  }
  const diffBadge = window.diffBadge || (() => "");
  const diffFace = window.diffFace || (() => "");

  // ----- Settings --------------------------------------------------------
  const setUI = {
    tabAccount: $("tabAccount"), tabControls: $("tabControls"),
    panelAccount: $("panelAccount"), panelControls: $("panelControls"),
    status: $("accountStatus"), nameBtn: $("nameBtn"), nameForm: $("nameForm"),
    nameInput: $("nameInput"), nameSubmit: $("nameSubmit"),
    optBar: $("optBar"), optPct: $("optPct"), back: $("backFromSettings"),
  };
  function goSettings(tab) {
    state.scene = "settings";
    state.held = false;
    hideAllOverlays();
    showSettingsTab(tab || "account");
    renderSettings();
    settingsEl.classList.remove("hidden");
    blurActive();
  }
  function showSettingsTab(tab) {
    const acc = tab === "account";
    setUI.tabAccount.classList.toggle("active", acc);
    setUI.tabControls.classList.toggle("active", !acc);
    setUI.panelAccount.classList.toggle("hidden", !acc);
    setUI.panelControls.classList.toggle("hidden", acc);
  }
  function renderSettings() {
    const n = state.settings.name;
    setUI.status.textContent = n ? `Signed in as ${n} · 🔒 names can't be changed` : "No name yet — pick one to post levels and race. Choose carefully: it can't be changed later!";
    setUI.nameBtn.textContent = "✏️  Name";
    setUI.nameBtn.classList.toggle("hidden", !!n);   // locked once picked
    setUI.nameForm.classList.add("hidden");
    setUI.nameInput.value = n;
    setUI.optBar.checked = !!state.settings.showBar;
    setUI.optPct.checked = !!state.settings.showPct;
  }
  function submitName() {
    if (state.settings.name) return;               // locked: a name is picked once
    const v = setUI.nameInput.value.trim().slice(0, 16);
    if (!v) { setUI.nameInput.focus(); return; }
    state.settings.name = v;
    saveSettings();
    sfxComplete();
    renderSettings();
  }
  function hasAccount() { return !!state.settings.name; }
  setUI.tabAccount.addEventListener("click", () => { ac(); showSettingsTab("account"); });
  setUI.tabControls.addEventListener("click", () => { ac(); showSettingsTab("controls"); });
  setUI.nameBtn.addEventListener("click", () => {
    ac();
    setUI.nameForm.classList.toggle("hidden");
    if (!setUI.nameForm.classList.contains("hidden")) setUI.nameInput.focus();
  });
  setUI.nameSubmit.addEventListener("click", submitName);
  setUI.nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitName(); });
  setUI.optBar.addEventListener("change", () => { state.settings.showBar = setUI.optBar.checked; saveSettings(); });
  setUI.optPct.addEventListener("change", () => { state.settings.showPct = setUI.optPct.checked; saveSettings(); });
  setUI.back.addEventListener("click", () => goHome());

  // ----- Temples ---------------------------------------------------------
  const templeListEl = $("templeList");
  function goTemples() {
    state.scene = "temples";
    state.held = false;
    state.race = null;
    MUSIC.stop();
    hideAllOverlays();
    renderTemples();
    templesEl.classList.remove("hidden");
    blurActive();
  }
  function renderTemples() {
    templeListEl.innerHTML = "";
    TEMPLE_PACKS.forEach((pack) => {
      const t = pack.temple, n = pack.levels.length, done = Math.min(n, packUnlocked(pack));
      const lo = pack.levels[0].diff | 0, hi = pack.levels[n - 1].diff | 0;
      const card = document.createElement("div");
      card.className = "level-card temple";
      card.innerHTML =
        `<div class="temple-ic">${t.icon}</div>` +
        `<div class="name">${t.name}</div>` +
        `<div class="desc">${t.desc}</div>` +
        `<div class="diff-range">${diffFace(lo, 24)} → ${diffFace(hi, 24)}</div>` +
        `<div class="prog"><div style="width:${(done / n) * 100}%"></div></div>` +
        (done >= n ? '<span class="badge cleared">TEMPLE CLEARED ✓</span>' : `<span class="badge ready">${done} / ${n} CLEARED · ENTER →</span>`);
      card.addEventListener("click", () => { ac(); goMenu(pack); });
      templeListEl.appendChild(card);
    });
  }
  $("backFromTemples").addEventListener("click", () => goHome());

  // ----- Map -------------------------------------------------------------
  const mapTrailEl = $("mapTrail"), mapSub = $("mapSub");
  function goMap() {
    state.scene = "map";
    state.held = false;
    state.race = null;
    MUSIC.stop();
    hideAllOverlays();
    renderMap();
    mapEl.classList.remove("hidden");
    blurActive();
  }
  function renderMap() {
    mapTrailEl.innerHTML = "";
    const pack = MAP_PACKS[0];
    if (!pack) return;
    const d = DIFFS[pack.trail.diff] || DIFFS[0];
    mapSub.innerHTML = `${diffFace(pack.trail.diff, 28)} ${pack.trail.name} — five levels, then the dungeon.`;
    const unlocked = packUnlocked(pack);
    pack.levels.forEach((lvl, i) => {
      if (i > 0) {
        const link = document.createElement("div");
        link.className = "map-link" + (i <= unlocked ? " done" : "");
        mapTrailEl.appendChild(link);
      }
      const locked = i > unlocked, cleared = i < unlocked;
      const node = document.createElement("div");
      node.className = "map-node" + (lvl.dungeon ? " dungeon" : "") + (locked ? " locked" : "") + (cleared ? " cleared" : "");
      node.innerHTML =
        `<div class="mstep">${lvl.dungeon ? "Dungeon" : "Stop " + (i + 1)}</div>` +
        `<div class="dot">${lvl.dungeon ? "🏰" : cleared ? "✓" : locked ? "🔒" : (i + 1)}</div>` +
        `<div class="mname">${lvl.name}</div>` +
        (lvl.dungeon ? `<div>${diffFace(lvl.diff | 0, 22)}</div>` : "") +
        `<span class="coin-mark${levelCoinFound(pack, i) ? " got" : ""}">💠</span>`;
      if (!locked) node.addEventListener("click", () => { ac(); startLevel(i, pack); });
      mapTrailEl.appendChild(node);
    });
  }
  $("backFromMap").addEventListener("click", () => goHome());

  // ----- Search: share codes (offline "posting") -------------------------
  // There is no server, so a "posted" level is a code you copy and send to a
  // friend; they paste it here and it shows up in their search list.
  const srchUI = {
    input: $("searchInput"), postBtn: $("postBtn"),
    postBox: $("postBox"), postPick: $("postPick"), postText: $("postText"), copyCode: $("copyCode"), postMsg: $("postMsg"),
    list: $("searchList"), diffs: $("searchDiffs"), count: $("searchCount"), top: $("searchTop"),
  };
  function goSearch() {
    state.scene = "search";
    state.held = false;
    MUSIC.stop();
    hideAllOverlays();
    srchUI.postBox.classList.add("hidden");
    srchUI.postMsg.textContent = "";
    renderSearchDiffs();
    renderSearch();
    searchEl.classList.remove("hidden");
    blurActive();
  }
  // Every level gets a short 5-character ID (letters + numbers) for showing and
  // searching. The ID alone can't hold the level — there's no server behind
  // GitHub Pages — so the full share code still carries the level data.
  const ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function shortId(lvl) {
    if (lvl.sid && /^[A-Z0-9]{5}$/.test(lvl.sid)) return lvl.sid;
    let h = 2166136261;
    for (const ch of String(lvl.id || lvl.name)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    let out = "";
    for (let i = 0; i < 5; i++) { h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); out += ID_CHARS[(h >>> 0) % ID_CHARS.length]; }
    lvl.sid = out;
    return out;
  }
  function levelCode(lvl) {
    const payload = { v: 1, sid: shortId(lvl), name: lvl.name, author: state.settings.name, length: lvl.length, diff: lvl.diff | 0, items: lvl.items,
      created: lvl.created || 0 };
    return "SD1." + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  }
  // A share LINK is the game's URL with the code in the hash: open it and the
  // level lands in Search. Works on GitHub Pages because nothing is stored server-side.
  function shareLink(lvl) {
    const base = (location.origin && location.origin !== "null" ? location.origin : "") + location.pathname;
    return base + "#lvl=" + levelCode(lvl);
  }
  // accept a pasted link or a bare code
  function codeFrom(text) {
    text = String(text || "").trim();
    const m = text.match(/#lvl=(SD1\.[A-Za-z0-9+/=]+)/);
    if (m) return m[1];
    return text.startsWith("SD1.") ? text : null;
  }
  function parseCode(code) {
    code = String(code || "").trim();
    if (!code.startsWith("SD1.")) return null;
    try {
      const o = JSON.parse(decodeURIComponent(escape(atob(code.slice(4)))));
      if (!o || typeof o.name !== "string" || !isFinite(o.length) || !Array.isArray(o.items)) return null;
      return {
        id: "s" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
        sid: /^[A-Z0-9]{5}$/.test(String(o.sid || "")) ? o.sid : undefined,
        name: o.name.slice(0, 24), author: String(o.author || "Unknown").slice(0, 16),
        length: clamp(Math.round(o.length), ED_MIN_LEN, ED_MAX_LEN), diff: clamp(o.diff | 0, 0, DIFFS.length - 1),
        items: o.items.filter((it) => it && typeof it === "object" && isFinite(it.x)),
        created: isFinite(o.created) ? +o.created : 0,   // when the author built it
        added: Date.now(),                                 // when it landed here
        code,
      };
    } catch (e) { return null; }
  }
  // Search covers every level: built-in packs, your own creations, and shared codes.
  // Filter by name (or author / pack) and/or by difficulty face; -1 = any difficulty.
  let searchDiff = -1;
  function searchEntries() {
    const out = [];
    ALL_PACKS.forEach((pack) => pack.levels.forEach((lvl, i) => {
      const where = pack.kind === "main" ? "Level " + (i + 1) : pack.kind === "temple" ? pack.temple.name : (lvl.dungeon ? "Map · Dungeon" : "Map · Stop " + (i + 1));
      out.push({ kind: "builtin", key: "b:" + pack.id + ":" + i, name: lvl.name, diff: lvl.diff | 0, sub: lvl.subtitle, where, pack, index: i,
        locked: i > packUnlocked(pack), haystack: (lvl.name + " " + where + " " + pack.title).toLowerCase() });
    }));
    state.customLevels.forEach((lvl) => out.push({ kind: "mine", key: "m:" + lvl.id, name: lvl.name, diff: lvl.diff | 0, src: lvl, when: levelCreated(lvl),
      sub: `${lvl.length}px · ${lvl.items.length} piece${lvl.items.length === 1 ? "" : "s"}`, where: "My level · #" + shortId(lvl), haystack: (lvl.name + " my levels " + state.settings.name + " " + shortId(lvl)).toLowerCase() }));
    state.shared.forEach((lvl) => out.push({ kind: "shared", key: "s:" + lvl.id, name: lvl.name, diff: lvl.diff | 0, src: lvl, author: lvl.author || "Unknown", when: lvl.added || lvl.created || 0,
      sub: `${lvl.length}px · ${lvl.items.length} piece${lvl.items.length === 1 ? "" : "s"}`, where: "Shared · #" + shortId(lvl), haystack: (lvl.name + " " + (lvl.author || "") + " shared " + shortId(lvl)).toLowerCase() }));
    return out;
  }
  // when a custom level was made (older levels: decode the timestamp baked into the id)
  function levelCreated(lvl) {
    if (lvl.created) return lvl.created;
    const m = /^c([0-9a-z]+)/.exec(String(lvl.id || ""));
    return m ? parseInt(m[1].slice(0, 8), 36) || 0 : 0;
  }
  function whenLabel(ms) {
    if (!ms) return "";
    const d = Date.now() - ms;
    if (d < 60e3) return "just now";
    if (d < 3600e3) return Math.floor(d / 60e3) + " min ago";
    if (d < 86400e3) return Math.floor(d / 3600e3) + " h ago";
    if (d < 7 * 86400e3) return Math.floor(d / 86400e3) + " d ago";
    return new Date(ms).toLocaleDateString();
  }
  function renderSearchDiffs() {
    srchUI.diffs.innerHTML = "";
    const any = document.createElement("button");
    any.className = "diff-pick" + (searchDiff < 0 ? " active" : "");
    any.innerHTML = "<span class=\"diff-any\">✦</span><span>Any</span>";
    any.addEventListener("click", () => { searchDiff = -1; renderSearchDiffs(); renderSearch(); });
    srchUI.diffs.appendChild(any);
    DIFFS.forEach((d, i) => {
      const b = document.createElement("button");
      b.className = "diff-pick" + (searchDiff === i ? " active" : "");
      b.title = d.name;
      b.innerHTML = diffFace(i, 30) + `<span>${d.name}</span>`;
      b.addEventListener("click", () => { searchDiff = searchDiff === i ? -1 : i; renderSearchDiffs(); renderSearch(); });
      srchUI.diffs.appendChild(b);
    });
  }
  function renderSearch() {
    const q = srchUI.input.value.trim().toLowerCase().replace(/^#/, "");   // "#A7K3Q" finds by ID
    srchUI.list.innerHTML = "";
    const all = searchEntries();
    // spotlight: the newest level made or added (hidden until there is one)
    const top = all.reduce((b, e) => ((+e.when || 0) > (b ? +b.when || 0 : 0) ? e : b), null);
    srchUI.top.innerHTML = "";
    srchUI.top.classList.toggle("hidden", !top);
    if (top) {
      const card = document.createElement("div");
      card.className = "level-card top-new" + (top.locked ? " locked" : "");
      card.innerHTML =
        `<div class="num">🆕 Newest · ${escapeHtml(whenLabel(top.when))}</div>` +
        `<div class="name">${escapeHtml(top.name)}</div>` +
        (top.author ? `<div class="author">by ${escapeHtml(top.author)}</div>` : `<div class="author">${escapeHtml(top.where)}</div>`) +
        diffBadge(top.diff) + (top.locked ? '<span class="badge locked">🔒 LOCKED</span>' : '<span class="badge ready">▶ PLAY</span>');
      wireSearchCard(card, top);
      srchUI.top.appendChild(card);
    }
    // newest first: levels made or added most recently, then the built-in ones in order
    const rows = all.filter((e) => (!q || e.haystack.includes(q)) && (searchDiff < 0 || e.diff === searchDiff))
      .sort((a, b) => (+b.when || 0) - (+a.when || 0));
    srchUI.count.textContent = `${rows.length} of ${all.length} levels`;
    if (!rows.length) {
      const e = document.createElement("p");
      e.className = "tagline";
      e.textContent = "No levels match. Try another name or difficulty.";
      srchUI.list.appendChild(e);
      return;
    }
    rows.forEach((e) => {
      const card = document.createElement("div");
      card.className = "level-card" + (e.locked ? " locked" : "");
      const badge = e.locked ? '<span class="badge locked">🔒 LOCKED</span>' : '<span class="badge ready">▶ PLAY</span>';
      card.innerHTML =
        `<div class="num">${escapeHtml(e.where)}</div>` +
        `<div class="name">${escapeHtml(e.name)}</div>` +
        (e.author ? `<div class="author">by ${escapeHtml(e.author)}</div>` : "") +
        `<div class="desc">${escapeHtml(e.sub || "")}</div>` +
        diffBadge(e.diff) + badge +
        (e.when ? `<div class="author">${escapeHtml(whenLabel(e.when))}</div>` : "") +
        (e.kind === "shared" ? '<div class="card-actions"><button class="mini-btn danger" data-act="del">🗑 Remove</button></div>' : "");
      wireSearchCard(card, e);
      srchUI.list.appendChild(card);
    });
  }
  // one click handler per card: the remove button, otherwise play
  function wireSearchCard(card, e) {
    card.addEventListener("click", (ev) => {
      const act = ev.target && ev.target.dataset ? ev.target.dataset.act : null;
      if (act === "del") {
        ev.stopPropagation();
        state.shared = state.shared.filter((l) => l !== e.src);
        saveShared();
        renderSearch();
        return;
      }
      if (e.locked) return;
      ac();
      if (e.kind === "builtin") { state.pack = e.pack; startLevel(e.index, e.pack); }
      else { state.customSrc = e.src; startCustom(e.kind === "mine" ? "list" : "search"); }
    });
  }
  function renderPostPick() {
    srchUI.postPick.innerHTML = "";
    srchUI.postText.value = "";
    if (!state.customLevels.length) { srchUI.postMsg.textContent = "You haven't built any levels yet — hit Create!"; return; }
    state.customLevels.forEach((lvl) => {
      const b = document.createElement("button");
      b.className = "mini-btn" + (lvl.beaten ? "" : " nope");
      b.textContent = (lvl.beaten ? "✓ " : "") + lvl.name + " #" + shortId(lvl);
      b.title = lvl.beaten ? "Post this level" : "Beat this level first";
      b.addEventListener("click", () => {
        [...srchUI.postPick.children].forEach((c) => c.classList.remove("active"));
        b.classList.add("active");
        if (!lvl.beaten) {
          srchUI.postText.value = "";
          srchUI.postMsg.className = "code-msg bad";
          srchUI.postMsg.textContent = "You have to beat your own level before you can post it.";
          return;
        }
        srchUI.postText.value = shareLink(lvl);
        srchUI.postMsg.className = "code-msg";
        srchUI.postMsg.textContent = `Level ID #${shortId(lvl)} — copy the link below and send it to a friend. They open it and the level shows up in their Search.`;
      });
      srchUI.postPick.appendChild(b);
    });
  }
  srchUI.input.addEventListener("input", renderSearch);
  // a friend's share link (or bare code) pasted into the search box is added on the spot
  function importCode(text) {
    const code = codeFrom(text);
    if (!code) return null;
    const lvl = parseCode(code);
    if (!lvl) return null;
    const have = state.shared.find((l) => l.code === lvl.code);
    if (have) return have;
    state.shared.unshift(lvl); saveShared(); sfxComplete();
    return lvl;
  }
  srchUI.input.addEventListener("input", () => {
    const lvl = importCode(srchUI.input.value);
    if (!lvl) return;
    srchUI.input.value = "#" + shortId(lvl);
    renderSearch();
  });
  srchUI.postBtn.addEventListener("click", () => {
    ac();
    if (!hasAccount()) {
      showMessage("crash", "NAME NEEDED", "Set your name in Settings → Account to post levels.", "Go to Settings", () => goSettings("account"), true);
      return;
    }
    srchUI.postBox.classList.toggle("hidden");
    srchUI.postMsg.className = "code-msg";
    srchUI.postMsg.textContent = "Pick one of your levels.";
    renderPostPick();
  });
  srchUI.copyCode.addEventListener("click", () => {
    const code = srchUI.postText.value;
    if (!code) return;
    const done = () => { srchUI.postMsg.className = "code-msg ok"; srchUI.postMsg.textContent = "Link copied! Send it to a friend."; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => { srchUI.postText.select(); done(); });
    else { srchUI.postText.select(); try { document.execCommand("copy"); } catch (e) {} done(); }
  });
  $("backFromSearch").addEventListener("click", () => goHome());

  // ----- Races -----------------------------------------------------------
  // You vs a rival bot on a random-difficulty level. The rival flies the gap
  // down the middle of the level a hair behind you; it has a difficulty-based
  // chance of crashing somewhere along the way. Crash and the rival wins.
  const RIVALS = ["Ace", "Nova", "Blaze", "Comet", "Zed", "Pixel", "Rex", "Luna", "Bolt", "Echo"];
  const raceUI = { card: $("raceCard"), record: $("raceRecord"), go: $("raceGo"), roll: $("raceRoll") };
  let racePick = null;
  function allRaceLevels() {
    const out = [];
    ALL_PACKS.forEach((p) => p.levels.forEach((l, i) => out.push({ level: l, pack: p, index: i })));
    return out;
  }
  function rollRace() {
    const diff = Math.floor(Math.random() * DIFFS.length);
    const all = allRaceLevels();
    let pool = [], spread = 0;
    while (!pool.length && spread < DIFFS.length) {  // nearest tier that has levels
      pool = all.filter((e) => Math.abs((e.level.diff | 0) - diff) <= spread);
      spread++;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    let rivalSkin = Math.floor(Math.random() * SKINS.length);
    if (rivalSkin === state.skin) rivalSkin = (rivalSkin + 1) % SKINS.length;
    racePick = { diff, level: pick.level, pack: pick.pack, index: pick.index,
      rival: { name: RIVALS[Math.floor(Math.random() * RIVALS.length)], skin: rivalSkin } };
  }
  function goRace() {
    state.scene = "race";
    state.held = false;
    state.race = null;
    MUSIC.stop();
    hideAllOverlays();
    if (!racePick) rollRace();
    renderRace();
    raceEl.classList.remove("hidden");
    blurActive();
  }
  function renderRace() {
    const p = racePick, d = DIFFS[p.diff];
    raceUI.card.innerHTML = "";
    const you = document.createElement("div"); you.className = "race-side";
    you.innerHTML = `<div class="rname">${escapeHtml(state.settings.name || "You")}</div><div class="rsub">YOU</div>`;
    const cvY = document.createElement("canvas"); cvY.width = 116; cvY.height = 72;
    const cy = cvY.getContext("2d"); cy.translate(58, 38); cy.scale(2, 2); paintShip(cy, SKINS[state.skin] || SKINS[0], true, globalTime);
    you.insertBefore(cvY, you.firstChild);
    const vs = document.createElement("div"); vs.className = "race-vs"; vs.textContent = "VS";
    const riv = document.createElement("div"); riv.className = "race-side";
    riv.innerHTML = `<div class="rname">${p.rival.name}</div><div class="rsub">RIVAL</div>`;
    const cvR = document.createElement("canvas"); cvR.width = 116; cvR.height = 72;
    const cr = cvR.getContext("2d"); cr.translate(58, 38); cr.scale(2, 2); paintShip(cr, SKINS[p.rival.skin], true, globalTime);
    riv.insertBefore(cvR, riv.firstChild);
    const lv = document.createElement("div"); lv.className = "race-level";
    const ld = p.level.diff | 0;
    lv.innerHTML = `${diffFace(ld, 56)}<div class="lname">${p.level.name}</div><div class="lsub">${DIFFS[ld].name}${ld !== p.diff ? ` (rolled ${d.name} — nearest level)` : ""}</div>`;
    raceUI.card.append(you, vs, riv, lv);
    raceUI.record.textContent = `Record: ${state.raceRec.wins} win${state.raceRec.wins === 1 ? "" : "s"} · ${state.raceRec.losses} loss${state.raceRec.losses === 1 ? "" : "es"}`;
  }
  function startRace() {
    const p = racePick;
    state.race = { rival: p.rival, diff: p.diff, botX: 0, botY: H / 2, botDead: false, botCrashAt: Infinity, toast: 0, pct: 0 };
    state.pack = { id: "race", kind: "race", title: "RACE", levels: [p.level] };
    state.custom = state.customSrc = state.customFrom = null;
    state.mode = "level";
    state.levelIndex = 0;
    resetRun();
  }
  function resetRaceBot() {
    const r = state.race, lvl = currentLevel();
    r.botX = 120 - 50; r.botY = H / 2; r.botDead = false; r.toast = 0; r.pct = 0;
    // harder tiers make the rival more likely to crash (it's fair: so are you)
    const pCrash = 0.25 + 0.08 * r.diff;
    r.botCrashAt = Math.random() < pCrash ? 400 + Math.random() * (lvl.length - 700) : Infinity;
  }
  // gap center at world x (top-most floor tip vs. lowest ceiling tip nearby)
  function gapCenterAt(lvl, x, t) { const g = freeGapAt(lvl, x, t, 30); return (g.top + g.bot) / 2; }
  function updateRace(dt, lvl) {
    const r = state.race;
    r.pct = clamp((state.shipX - 120) / (lvl.length - 120), 0, 1);
    if (r.toast > 0) r.toast -= dt;
    if (r.botDead) return;
    r.botX = state.shipX - 50;
    const target = gapCenterAt(lvl, r.botX + 90, state.elapsed + 90 / lvl.speed);
    r.botY += (target - r.botY) * Math.min(1, 7 * dt);
    if (r.botX >= r.botCrashAt) {
      r.botDead = true;
      r.toast = 2.5;
      spawnExplosion(r.botX, r.botY);
      sfxCrash();
    }
  }
  function drawRaceBot(camX) {
    const r = state.race;
    if (r.botDead) return;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.translate(r.botX - camX, r.botY);
    paintShip(ctx, SKINS[r.rival.skin] || SKINS[1], true, globalTime);
    ctx.restore();
    ctx.fillStyle = "rgba(255,84,112,0.9)";
    ctx.font = "bold 11px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(r.rival.name, r.botX - camX, r.botY - 22);
    ctx.textAlign = "left";
  }
  raceUI.go.addEventListener("click", () => { ac(); startRace(); });
  raceUI.roll.addEventListener("click", () => { ac(); rollRace(); renderRace(); });
  $("backFromRace").addEventListener("click", () => goHome());

  function renderSkins() {
    updateCoinDisplays();
    skinGridEl.innerHTML = "";
    SKINS.forEach((skin, i) => {
      const owned = isOwned(i);
      const equipped = i === state.skin;
      const buyable = !owned && state.coins >= skin.cost;
      const card = document.createElement("div");
      card.className = "skin-card" +
        (equipped ? " selected" : "") +
        (!owned ? (buyable ? " buyable" : " locked") : "");
      const cv = document.createElement("canvas");
      cv.width = 116; cv.height = 72;
      const cc = cv.getContext("2d");
      cc.save();
      cc.translate(58, 38);
      cc.scale(2, 2);
      paintShip(cc, skin, true, globalTime);
      cc.restore();
      const name = document.createElement("div");
      name.className = "sname"; name.textContent = skin.name;
      const tag = document.createElement("div");
      if (equipped) { tag.className = "stag"; tag.textContent = "EQUIPPED"; }
      else if (owned) { tag.className = "stag own"; tag.textContent = "TAP TO EQUIP"; }
      else { tag.className = "stag cost"; tag.textContent = "🪙 " + skin.cost; }
      card.appendChild(cv); card.appendChild(name); card.appendChild(tag);
      card.addEventListener("click", () => { ac(); onSkinClick(i, card); });
      skinGridEl.appendChild(card);
    });
  }

  function onSkinClick(i, card) {
    if (isOwned(i)) {           // already owned -> equip
      saveSkin(i);
      renderSkins();
    } else if (state.coins >= SKINS[i].cost) {   // buy + equip
      const before = state.coins;
      // burst origin = the card being bought (capture before re-render detaches it)
      const r = card ? card.getBoundingClientRect() : null;
      const bx = r ? r.left + r.width / 2 : window.innerWidth / 2;
      const by = r ? r.top + r.height / 2 : window.innerHeight / 2;
      state.coins -= SKINS[i].cost;
      storeSet(COINS_KEY, String(state.coins));
      state.owned.add(i);
      saveOwned();
      saveSkin(i);
      sfxComplete();            // little purchase jingle
      renderSkins();
      // ticker the coin pill DOWN from old balance to new (same style as the reward count-up)
      document.querySelectorAll(".coin-val").forEach((e) => { e.textContent = before; });
      state.coinAnim = { from: before, to: state.coins, t: 0, dur: 0.7, shown: before, lastTick: 0, target: "pill" };
      confettiBurst(bx, by);    // celebrate!
    } else {                    // can't afford
      sfxCrash();
      if (card) { card.classList.remove("deny"); void card.offsetWidth; card.classList.add("deny"); }
    }
  }

  function confettiBurst(cx, cy) {
    const stage = document.getElementById("stage");
    const colors = ["#46e6ff", "#ffd166", "#ff5470", "#9cff57", "#ff4bd8", "#b388ff", "#ffffff"];
    for (let i = 0; i < 60; i++) {
      const p = document.createElement("div");
      p.className = "confetti";
      const w = 6 + Math.random() * 7;
      p.style.width = w + "px";
      p.style.height = (w * (0.45 + Math.random() * 0.8)) + "px";
      p.style.background = colors[(Math.random() * colors.length) | 0];
      p.style.left = cx + "px";
      p.style.top = cy + "px";
      stage.appendChild(p);
      const ang = Math.random() * Math.PI * 2;
      const dx = Math.cos(ang) * (60 + Math.random() * 240);
      const up = -(120 + Math.random() * 160);
      const fall = 260 + Math.random() * 260;
      const rot = Math.random() * 900 - 450;
      const dur = 900 + Math.random() * 800;
      p.animate(
        [
          { transform: "translate(-50%,-50%) rotate(0deg)", opacity: 1 },
          { transform: `translate(calc(-50% + ${dx * 0.6}px), calc(-50% + ${up}px)) rotate(${rot * 0.5}deg)`, opacity: 1, offset: 0.35 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${up + fall}px)) rotate(${rot}deg)`, opacity: 0 },
        ],
        { duration: dur, easing: "cubic-bezier(.15,.7,.4,1)" }
      ).onfinish = () => p.remove();
    }
  }

  function drawHomeShip() {
    homeCtx.clearRect(0, 0, homeShip.width, homeShip.height);
    homeCtx.save();
    homeCtx.translate(homeShip.width / 2, homeShip.height / 2 + Math.sin(globalTime * 2) * 6);
    homeCtx.rotate(Math.sin(globalTime * 1.5) * 0.12);
    homeCtx.scale(2.7, 2.7);
    paintShip(homeCtx, SKINS[state.skin] || SKINS[0], true, globalTime);
    homeCtx.restore();
  }

  // ----- Level creator ---------------------------------------------------
  // Users build levels from the same obstacle set as the built-in ones.
  // A stored custom level is { id, name, length, items } where each item is
  // a friendly shape that expands to game-format obstacles on play:
  //   { kind:"spike",  dir:"bottom"|"top",           x, w, h }
  //   { kind:"piston", dir:"launching"|"falling",    x, w, len, period }
  //   { kind:"gate",                                 x, w, gap, amp, center, period }
  // Everything autosaves to localStorage as you edit.

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // Expand one editor item into game obstacle(s). Moving items get the same
  // "fair telegraph" phasing as the built-in levels: pistons are fully
  // extended and gate holes centered exactly as the ship arrives.
  function expandItem(it, speed) {
    if (it.kind === "trigger" || it.kind === "coin") return [];   // not obstacles
    const tArr = (it.x + it.w / 2 - 120) / speed;
    if (it.kind === "spike") return [{ x: it.x, w: it.w, h: it.h, dir: it.dir }];
    if (it.kind === "piston") {
      return [{ x: it.x, w: it.w, dir: it.dir, len: it.len, period: it.period, phase: 0.5 - tArr / it.period }];
    }
    const phase = -tArr / it.period;
    return [
      { x: it.x, w: it.w, dir: "gateTop",    gap: it.gap, amp: it.amp, center: it.center, period: it.period, phase },
      { x: it.x, w: it.w, dir: "gateBottom", gap: it.gap, amp: it.amp, center: it.center, period: it.period, phase },
    ];
  }

  function buildCustomLevel(src) {
    const obstacles = [];
    for (const it of src.items) obstacles.push(...expandItem(it, CUSTOM_SPEED));
    obstacles.sort((a, b) => a.x - b.x);
    const triggers = src.items.filter((it) => it.kind === "trigger").map((it) => Object.assign({}, it)).sort((a, b) => a.x - b.x);
    return {
      name: src.name || "Untitled",
      subtitle: "Custom level",
      hint: "Your creation — good luck, pilot!",
      diff: src.diff | 0,
      speed: CUSTOM_SPEED,
      length: src.length,
      obstacles,
      triggers,
      coins: src.items.filter((it) => it.kind === "coin").map((it) => ({ x: it.x, y: it.y })),
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  // --- My Levels screen ---
  function goCustomMenu() {
    state.scene = "custommenu";
    state.held = false;
    MUSIC.stop();
    hideAllOverlays();
    renderCustomMenu();
    customEl.classList.remove("hidden");
    blurActive();
  }

  function renderCustomMenu() {
    customListEl.innerHTML = "";
    const add = document.createElement("div");
    add.className = "level-card new-level";
    add.innerHTML = '<div class="new-plus">+</div><div class="name">New Level</div><div class="desc">Build your own!</div>';
    add.addEventListener("click", () => { ac(); openEditor(null); });
    customListEl.appendChild(add);

    state.customLevels.forEach((lvl) => {
      const n = lvl.items.length;
      const card = document.createElement("div");
      card.className = "level-card";
      card.innerHTML =
        `<div class="num">#${shortId(lvl)}${lvl.beaten ? " · beaten ✓" : ""}</div>` +
        `<div class="name">${escapeHtml(lvl.name)}</div>` +
        `<div class="desc">${lvl.length}px · ${n} piece${n === 1 ? "" : "s"}${(lvl.items.filter((i) => i.kind === "coin").length || "") && " · 🪙 " + lvl.items.filter((i) => i.kind === "coin").length}</div>` +
        diffBadge(lvl.diff | 0) +
        '<span class="badge ready">▶ PLAY</span>' +
        '<div class="card-actions">' +
        '<button class="mini-btn" data-act="edit">✏️ Edit</button>' +
        '<button class="mini-btn danger" data-act="del">🗑 Delete</button>' +
        "</div>";
      card.addEventListener("click", () => { ac(); state.customSrc = lvl; startCustom("list"); });
      card.querySelector('[data-act="edit"]').addEventListener("click", (e) => {
        e.stopPropagation(); ac(); openEditor(lvl.id);
      });
      const del = card.querySelector('[data-act="del"]');
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (del.classList.contains("confirm")) {   // second tap = really delete
          state.customLevels = state.customLevels.filter((l) => l.id !== lvl.id);
          saveCustomLevels();
          renderCustomMenu();
        } else {
          del.classList.add("confirm");
          del.textContent = "Sure?";
          setTimeout(() => { del.classList.remove("confirm"); del.textContent = "🗑 Delete"; }, 2200);
        }
      });
      customListEl.appendChild(card);
    });
  }

  // --- Editor state & UI ---
  const edUI = {
    name: document.getElementById("edName"),
    length: document.getElementById("edLength"),
    back: document.getElementById("edBack"),
    test: document.getElementById("edTest"),
    saved: document.getElementById("edSaved"),
    props: document.getElementById("edProps"),
    propsTitle: document.getElementById("edPropsTitle"),
    del: document.getElementById("edDelete"),
    tools: [...editorEl.querySelectorAll(".ed-tool")],
    diff: document.getElementById("edDiff"),
    diffPick: document.getElementById("edDiffPick"),
  };

  const ED = {
    lvl: null,     // the custom level being edited (live reference into state.customLevels)
    fresh: false,  // created by this visit (discarded if left untouched)
    dirty: false,  // any edit at all since opening
    tool: "select",
    sel: -1,
    camX: 0,
    drag: null,    // { type:"item"|"pan"|"scrub", ... }
    hover: null,   // pointer position in canvas coords (for the ghost preview)
    built: null,   // cached expanded obstacles for the animated preview
    mem: {},       // last-used sizes per kind — new items copy them
    saveTimer: 0,
  };

  const ED_MIN_X = 200;                            // keep a fair run-up after the start
  const ED_MIN_LEN = 1000, ED_MAX_LEN = 20000;
  const ED_SCRUB = { y: H - 18, h: 10, pad: 16 };  // bottom scrollbar (canvas-drawn)
  const ED_DEFAULTS = {
    spike:  { w: 60, h: 180 },
    piston: { w: 90, len: 330, period: 2.2 },
    gate:   { w: 70, gap: 80, amp: 90, period: 3.0 },
    trigger: { w: 24, str: 5, dur: 3, spd: 1.5, col: "#ff5d8f", col2: "#1a2a6a", bg: "grid" },
    coin: { w: 24 },
  };
  const ED_TITLES = { spike: "STATIC SPIKE", piston: "PISTON", gate: "GATE", coin: "SECRET COIN" };
  const ED_DIRS = { bottom: "FLOOR", top: "CEILING", launching: "UP", falling: "DOWN" };
  // which property rows a trigger type shows
  const TRIG_PROPS = {
    shake: ["str", "dur"], pulse: ["col", "str", "dur"], speed: ["spd"], particles: ["col", "str"],
    color: ["col"], bgcolor: ["col"], background: ["bg"], fade: ["col", "col2", "dur"], stop: [],
  };

  // property rows: which control edits which field, for which item kinds
  // (kinds may be a function of the item for triggers)
  const ED_ROWS = [
    { id: "W",   el: "sldW",   prop: "w",      kinds: { spike: 1, piston: 1, gate: 1 }, fmt: (v) => v + "px" },
    { id: "H",   el: "sldH",   prop: "h",      kinds: { spike: 1 },                     fmt: (v) => v + "px" },
    { id: "Len", el: "sldLen", prop: "len",    kinds: { piston: 1 },                    fmt: (v) => v + "px" },
    { id: "Gap", el: "sldGap", prop: "gap",    kinds: { gate: 1 },                      fmt: (v) => v * 2 + "px" },
    { id: "Amp", el: "sldAmp", prop: "amp",    kinds: { gate: 1 },                      fmt: (v) => v + "px" },
    { id: "Per", el: "sldPer", prop: "period", kinds: { piston: 1, gate: 1 },           fmt: (v) => v.toFixed(1) + "s" },
    { id: "Str", el: "sldStr", prop: "str",    kinds: {}, trig: true, fmt: (v) => String(v) },
    { id: "Dur", el: "sldDur", prop: "dur",    kinds: {}, trig: true, fmt: (v) => v.toFixed(1) + "s" },
    { id: "Spd", el: "sldSpd", prop: "spd",    kinds: {}, trig: true, fmt: (v) => v.toFixed(1) + "×" },
    { id: "Col", el: "colCol", prop: "col",    kinds: {}, trig: true, text: true, fmt: (v) => String(v) },
    { id: "Col2", el: "colCol2", prop: "col2", kinds: {}, trig: true, text: true, fmt: (v) => String(v) },
    { id: "Bg",  el: "selBg",  prop: "bg",     kinds: {}, trig: true, text: true, fmt: () => "" },
  ];
  for (const r of ED_ROWS) {
    r.row = document.getElementById("row" + r.id);
    r.sld = document.getElementById(r.el);
    r.val = document.getElementById("val" + r.id);
  }
  function rowApplies(r, it) {
    if (it.kind === "trigger") return !!r.trig && TRIG_PROPS[it.type].includes(r.prop);
    return !!r.kinds[it.kind];
  }

  function openEditor(id) {
    let lvl = id != null ? state.customLevels.find((l) => l.id === id) : null;
    ED.fresh = !lvl;
    if (!lvl) {
      lvl = {
        id: "c" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
        name: "My Level " + (state.customLevels.length + 1),
        length: 3000,
        items: [],
        created: Date.now(),
      };
      state.customLevels.push(lvl);
      saveCustomLevels();
    }
    ED.lvl = lvl;
    ED.dirty = false;
    ED.sel = -1;
    ED.camX = 0;
    ED.drag = null;
    ED.built = null;
    setTool(lvl.items.length ? "select" : "bottom");
    edUI.name.value = lvl.name;
    edUI.length.value = lvl.length;
    hideProps();
    renderEdDiff();
    backToEditor();
  }

  // difficulty rating picker (top bar)
  function renderEdDiff() {
    const d = ED.lvl ? (ED.lvl.diff | 0) : 0;
    edUI.diff.innerHTML = diffFace(d, 22) + `<span>${DIFFS[d] ? DIFFS[d].name.toUpperCase() : ""}</span>`;
    edUI.diffPick.innerHTML = "";
    DIFFS.forEach((df, i) => {
      const b = document.createElement("button");
      b.className = i === d ? "active" : "";
      b.innerHTML = diffFace(i, 34) + `<span>${df.name}</span>`;
      b.addEventListener("click", () => { ED.lvl.diff = i; edChanged(); renderEdDiff(); edUI.diffPick.classList.add("hidden"); });
      edUI.diffPick.appendChild(b);
    });
  }
  edUI.diff.addEventListener("click", () => { ac(); edUI.diffPick.classList.toggle("hidden"); });

  // (Re)enter the editor scene without resetting what's being edited.
  function backToEditor() {
    state.scene = "editor";
    state.held = false;
    MUSIC.stop();
    hideAllOverlays();
    editorEl.classList.remove("hidden");
    blurActive();
  }

  // Leave the editor for My Levels. A brand-new level left completely
  // untouched is quietly discarded instead of cluttering the list.
  function closeEditor() {
    clearTimeout(ED.saveTimer);
    if (ED.fresh && !ED.dirty && ED.lvl && !ED.lvl.items.length) {
      state.customLevels = state.customLevels.filter((l) => l !== ED.lvl);
    }
    saveCustomLevels();
    edUI.diffPick.classList.add("hidden");
    goCustomMenu();
  }

  function setTool(t) {
    ED.tool = t;
    for (const b of edUI.tools) b.classList.toggle("active", b.dataset.tool === t);
  }

  function edMaxCam() { return Math.max(0, ED.lvl.length + 300 - W); }

  // autosave (debounced) + pulse the SAVED indicator
  function edChanged() {
    ED.dirty = true;
    ED.built = null;
    if (ED.lvl && ED.lvl.beaten) { ED.lvl.beaten = false; }   // edited -> beat it again before posting
    clearTimeout(ED.saveTimer);
    ED.saveTimer = setTimeout(() => {
      saveCustomLevels();
      edUI.saved.classList.remove("flash");
      void edUI.saved.offsetWidth;
      edUI.saved.classList.add("flash");
    }, 250);
  }
  function flushSave() { clearTimeout(ED.saveTimer); saveCustomLevels(); }

  // --- properties panel ---
  function showProps() {
    const it = ED.lvl.items[ED.sel];
    if (!it) return hideProps();
    edUI.propsTitle.textContent = it.kind === "trigger"
      ? TRIGGER_INFO[it.type].icon + " " + TRIGGER_INFO[it.type].name
      : ED_TITLES[it.kind] + (it.dir ? " · " + ED_DIRS[it.dir] : "");
    for (const r of ED_ROWS) {
      const on = rowApplies(r, it);
      r.row.classList.toggle("hidden", !on);
      if (on) {
        if (r.prop === "w") r.sld.min = it.kind === "spike" ? 16 : 30;
        r.sld.value = it[r.prop];
        r.val.textContent = r.fmt(r.text ? it[r.prop] : +it[r.prop]);
      }
    }
    edUI.props.classList.remove("hidden");
  }
  function hideProps() { edUI.props.classList.add("hidden"); }

  // remember the sizes used for this kind so the next placement matches
  function rememberSizes(it) {
    const m = {};
    for (const r of ED_ROWS) if (rowApplies(r, it)) m[r.prop] = it[r.prop];
    ED.mem[it.kind === "trigger" ? "trigger." + it.type : it.kind] = m;
  }

  function deleteSelected() {
    if (ED.sel < 0) return;
    ED.lvl.items.splice(ED.sel, 1);
    ED.sel = -1;
    hideProps();
    edChanged();
  }

  // --- placing & hit-testing ---
  function snap10(v) { return Math.round(v / 10) * 10; }
  function clampItemX(x, w) { return clamp(x, ED_MIN_X, Math.max(ED_MIN_X, ED.lvl.length - w)); }

  function makeItem(tool, wx, wy) {
    if (tool === "coin") {
      return { kind: "coin", w: 24, x: clampItemX(snap10(wx), 24), y: Math.round(clamp(wy, 30, H - 30)) };
    }
    if (TRIGGER_TYPES.includes(tool)) {
      const it = Object.assign({ kind: "trigger", type: tool }, ED_DEFAULTS.trigger, ED.mem["trigger." + tool] || {});
      if (tool === "color") it.col = ED.mem["trigger.color"] ? it.col : "#46e6ff";
      if (tool === "bgcolor") it.col = ED.mem["trigger.bgcolor"] ? it.col : "#2a1a5e";
      if (tool === "particles") it.col = ED.mem["trigger.particles"] ? it.col : "#ffffff";
      it.x = clampItemX(snap10(wx), 0);
      return it;
    }
    const kind = tool === "gate" ? "gate" : (tool === "launching" || tool === "falling") ? "piston" : "spike";
    const it = Object.assign({ kind }, ED_DEFAULTS[kind], ED.mem[kind] || {});
    if (kind === "gate") it.center = Math.round(clamp(wy, 100, 440));
    else it.dir = tool;
    it.x = clampItemX(snap10(wx - it.w / 2), it.w);
    return it;
  }

  function placeItem(wx, wy) {
    ED.lvl.items.push(makeItem(ED.tool, wx, wy));
    ED.sel = ED.lvl.items.length - 1;
    showProps();
    edChanged();
  }

  // clickable footprint of an item (moving items use their full sweep)
  function itemBounds(it) {
    if (it.kind === "trigger") return { x: it.x - 14, y: 96, w: 28, h: 56 };  // the flag near the top
    if (it.kind === "coin") return { x: it.x - 14, y: it.y - 14, w: 28, h: 28 };
    if (it.kind === "spike") {
      return it.dir === "bottom"
        ? { x: it.x, y: FLOOR - it.h, w: it.w, h: it.h }
        : { x: it.x, y: CEIL, w: it.w, h: it.h };
    }
    if (it.kind === "piston") {
      return it.dir === "launching"
        ? { x: it.x, y: FLOOR - it.len, w: it.w, h: it.len }
        : { x: it.x, y: CEIL, w: it.w, h: it.len };
    }
    return { x: it.x, y: CEIL, w: it.w, h: H }; // gate = the whole column
  }

  function edHitTest(wx, wy) {
    const items = ED.lvl.items;
    for (let i = items.length - 1; i >= 0; i--) {   // most recent on top
      const b = itemBounds(items[i]);
      if (wx >= b.x - 4 && wx <= b.x + b.w + 4 && wy >= b.y - 4 && wy <= b.y + b.h + 4) return i;
    }
    return -1;
  }

  // --- editor input ---
  function edPointerDown(e) {
    blurActive(); // release the name/length field so keys pan again
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    const p = toCanvas(e);
    if (p.y >= ED_SCRUB.y - 6) {                    // bottom scrollbar
      ED.drag = { type: "scrub" };
      edScrubTo(p.x);
      return;
    }
    const wx = p.x + ED.camX, wy = p.y;
    const hit = edHitTest(wx, wy);
    if (hit >= 0) {                                  // grab an existing item
      ED.sel = hit;
      const it = ED.lvl.items[hit];
      ED.drag = { type: "item", dx: wx - it.x, dcy: it.kind === "gate" ? wy - it.center : it.kind === "coin" ? wy - it.y : 0 };
      showProps();
    } else if (ED.tool !== "select") {               // place a new one and keep dragging it
      placeItem(wx, wy);
      const it = ED.lvl.items[ED.sel];
      ED.drag = { type: "item", dx: wx - it.x, dcy: it.kind === "gate" ? wy - it.center : it.kind === "coin" ? wy - it.y : 0 };
    } else {                                         // pan (or click empty = deselect)
      ED.drag = { type: "pan", px: p.x, cam0: ED.camX, moved: false };
    }
  }

  function edPointerMove(e) {
    const p = toCanvas(e);
    ED.hover = p;
    const d = ED.drag;
    if (!d) return;
    if (d.type === "scrub") return edScrubTo(p.x);
    if (d.type === "pan") {
      if (Math.abs(p.x - d.px) > 3) d.moved = true;
      ED.camX = clamp(d.cam0 - (p.x - d.px), 0, edMaxCam());
      return;
    }
    const it = ED.lvl.items[ED.sel];
    if (!it) return;
    const nx = clampItemX(snap10(p.x + ED.camX - d.dx), it.w);
    if (nx !== it.x) { it.x = nx; edChanged(); }
    if (it.kind === "gate") {
      const nc = Math.round(clamp(p.y - d.dcy, 100, 440));
      if (nc !== it.center) { it.center = nc; edChanged(); }
    } else if (it.kind === "coin") {
      const ny = Math.round(clamp(p.y - d.dcy, 30, H - 30));
      if (ny !== it.y) { it.y = ny; edChanged(); }
    }
  }

  function edPointerUp() {
    const d = ED.drag;
    ED.drag = null;
    if (d && d.type === "pan" && !d.moved) { ED.sel = -1; hideProps(); }
  }

  function edScrubTo(px) {
    const total = ED.lvl.length + 300;
    const frac = clamp((px - ED_SCRUB.pad) / (W - ED_SCRUB.pad * 2), 0, 1);
    ED.camX = clamp(frac * total - W / 2, 0, edMaxCam());
  }

  function edKeyDown(e) {
    if (e.code === "Delete" || e.code === "Backspace") { e.preventDefault(); deleteSelected(); }
    else if (e.code === "Escape") {
      if (ED.sel >= 0) { ED.sel = -1; hideProps(); }
      else closeEditor();
    }
    else if (e.code === "ArrowLeft") ED.camX = clamp(ED.camX - 200, 0, edMaxCam());
    else if (e.code === "ArrowRight") ED.camX = clamp(ED.camX + 200, 0, edMaxCam());
  }

  // --- editor rendering ---
  function drawEditor() {
    const camX = ED.camX, lvl = ED.lvl;
    drawBackground(camX);

    // floor & ceiling edges
    ctx.fillStyle = "rgba(70,230,255,0.18)";
    ctx.fillRect(0, 0, W, 2);
    ctx.fillRect(0, H - 2, W, 2);

    // world grid (every 100px, labels every 500)
    for (let gx = Math.ceil(camX / 100) * 100; gx < camX + W; gx += 100) {
      const big = gx % 500 === 0;
      ctx.fillStyle = big ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.045)";
      ctx.fillRect(gx - camX, 0, 1, H);
      if (big && gx > 0) {
        ctx.fillStyle = "rgba(136,147,184,0.8)";
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillText(String(gx), gx - camX + 4, H - 28);
      }
    }

    // start marker: a ghost of your ship at the spawn point
    const sx = 120 - camX;
    if (sx > -40 && sx < W + 40) {
      ctx.globalAlpha = 0.55;
      ctx.save();
      ctx.translate(sx, H / 2);
      paintShip(ctx, SKINS[state.skin] || SKINS[0], false, globalTime);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(70,230,255,0.75)";
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("START", sx, H / 2 - 26);
      ctx.textAlign = "left";
    }

    drawFinish(lvl, camX);

    // obstacles — animated exactly as they'll move in play
    if (!ED.built) ED.built = buildCustomLevel(lvl).obstacles;
    drawObstacles(ED.built, camX, globalTime);
    // decoration triggers: a flag on a dashed line
    for (const it of lvl.items) {
      if (it.kind === "trigger") drawTriggerMarker(it, camX);
      else if (it.kind === "coin") drawCoin(it.x - camX, it.y, globalTime, false);
    }

    // ghost preview of the item about to be placed
    if (ED.tool !== "select" && ED.hover && !ED.drag && ED.hover.y < ED_SCRUB.y - 6) {
      const wx = ED.hover.x + camX;
      if (edHitTest(wx, ED.hover.y) < 0) {
        ctx.globalAlpha = 0.4;
        const ghost = makeItem(ED.tool, wx, ED.hover.y);
        if (ghost.kind === "trigger") drawTriggerMarker(ghost, camX);
        else if (ghost.kind === "coin") drawCoin(ghost.x - camX, ghost.y, globalTime, false);
        else drawObstacles(expandItem(ghost, CUSTOM_SPEED), camX, globalTime);
        ctx.globalAlpha = 1;
      }
    }

    // selection outline
    const sel = lvl.items[ED.sel];
    if (sel) {
      const b = itemBounds(sel);
      const ry = Math.max(2, b.y - 4);
      const rh = Math.min(H - 2, b.y + b.h + 4) - ry;
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = "rgba(70,230,255,0.95)";
      ctx.shadowColor = "rgba(70,230,255,0.5)";
      ctx.shadowBlur = 8;
      ctx.strokeRect(b.x - camX - 4, ry, b.w + 8, rh);
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
    }

    // bottom scrollbar
    const total = lvl.length + 300;
    const tw = W - ED_SCRUB.pad * 2;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ED_SCRUB.pad, ED_SCRUB.y, tw, 6, 3); ctx.fill();
    ctx.fillStyle = "rgba(70,230,255,0.7)";
    roundRect(ED_SCRUB.pad + (camX / total) * tw, ED_SCRUB.y, Math.max(26, (W / total) * tw), 6, 3); ctx.fill();
  }

  function drawTriggerMarker(it, camX) {
    const sx = it.x - camX;
    if (sx < -40 || sx > W + 40) return;
    const info = TRIGGER_INFO[it.type], col = it.type === "color" || it.type === "bgcolor" || it.type === "pulse" || it.type === "particles" ? it.col : info.col;
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = rgba(col, 0.22); ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 1.5;
    roundRect(sx - 14, 100, 28, 50, 7); ctx.fill(); ctx.stroke();
    ctx.font = "16px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#fff";
    ctx.fillText(info.icon, sx, 122);
    ctx.font = "bold 8px system-ui, sans-serif"; ctx.fillStyle = "#fff";
    ctx.fillText(it.type.slice(0, 5).toUpperCase(), sx, 142);
    ctx.textAlign = "left";
    ctx.restore();
  }

  // --- editor UI wiring ---
  edUI.tools.forEach((b) => b.addEventListener("click", () => { ac(); setTool(b.dataset.tool); }));
  edUI.name.addEventListener("input", () => {
    if (!ED.lvl) return;
    ED.lvl.name = edUI.name.value;
    edChanged();
  });
  edUI.name.addEventListener("blur", () => {
    if (!ED.lvl) return;
    ED.lvl.name = edUI.name.value.trim() || "Untitled";
    edUI.name.value = ED.lvl.name;
    edChanged();
  });
  edUI.length.addEventListener("change", () => {
    if (!ED.lvl) return;
    let v = parseInt(edUI.length.value, 10);
    if (isNaN(v)) v = ED.lvl.length;
    v = Math.round(clamp(v, ED_MIN_LEN, ED_MAX_LEN) / 100) * 100;
    edUI.length.value = v;
    ED.lvl.length = v;
    ED.camX = clamp(ED.camX, 0, edMaxCam());
    edChanged();
  });
  edUI.back.addEventListener("click", () => { ac(); closeEditor(); });
  edUI.test.addEventListener("click", () => {
    ac();
    flushSave();
    state.customSrc = ED.lvl;
    startCustom("editor");
  });
  edUI.del.addEventListener("click", () => deleteSelected());
  for (const r of ED_ROWS) {
    const onEdit = () => {
      const it = ED.lvl && ED.lvl.items[ED.sel];
      if (!it || !rowApplies(r, it)) return;
      it[r.prop] = r.text ? r.sld.value : parseFloat(r.sld.value);
      r.val.textContent = r.fmt(it[r.prop]);
      rememberSizes(it);
      edChanged();
    };
    r.sld.addEventListener("input", onEdit);
    r.sld.addEventListener("change", onEdit);
  }

  // ----- Input -----------------------------------------------------------
  window.addEventListener("keydown", (e) => {
    const tgt = e.target;
    if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA")) return; // typing in editor fields
    if (state.scene === "editor") { edKeyDown(e); return; }
    if (e.code === "Space") {
      e.preventDefault();
      ac();
      if (state.scene === "play") state.held = true;
      else if (state.scene === "crash") restartRun(); // respawn instantly
      else if (state.scene === "complete" || state.scene === "win" || state.scene === "flyover" || state.scene === "raceover") {
        advance();
        if (state.scene === "play") state.held = true; // carry the hold into the next attempt
      }
      return;
    }
    if (e.code === "KeyR") {
      if (state.scene === "play" || state.scene === "crash" || state.scene === "paused" ||
          state.scene === "complete" || state.scene === "flyover" || state.scene === "raceover") {
        restartRun();
      }
    } else if (e.code === "Escape" || e.code === "KeyP") {
      if (state.scene === "play") pauseGame();
      else if (state.scene === "paused") resumeGame();
      else if (e.code === "Escape") {
        if (state.scene === "menu" || state.scene === "skins" || state.scene === "custommenu" ||
            state.scene === "settings" || state.scene === "temples" || state.scene === "map" ||
            state.scene === "search" || state.scene === "race") goHome();
        else if (state.scene === "complete" || state.scene === "win" ||
                 state.scene === "crash" || state.scene === "flyover" || state.scene === "raceover") exitRun();
      }
    } else if (e.code === "KeyC") {
      if (state.scene === "play" && assistAllowed() && state.modes.practice) { setCheckpoint(); tone(660, 0, 0.06, "square", 0.08); }
    } else if (e.code === "KeyM") {
      muted = !muted;
      MUSIC.setMuted(muted);
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" && state.scene === "play") state.held = false;
  });

  // auto-pause a hidden tab: rAF freezes the game, so the music must not play on
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.scene === "play") pauseGame();
  });

  // map a pointer event to logical canvas coordinates (canvas is CSS-scaled)
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }

  // pointer / touch — canvas only receives these during play/crash (overlays cover it otherwise)
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    ac();
    if (state.scene === "editor") {
      edPointerDown(e);
      return;
    }
    if (state.scene === "play") {
      const p = toCanvas(e);
      if (p.x >= PAUSE_BTN.x - 6 && p.x <= PAUSE_BTN.x + PAUSE_BTN.w + 6 &&
          p.y >= PAUSE_BTN.y - 6 && p.y <= PAUSE_BTN.y + PAUSE_BTN.h + 6) {
        pauseGame();
        return;
      }
      state.held = true;
    } else if (state.scene === "crash") {
      restartRun(); // tap to respawn instantly
    }
  });
  canvas.addEventListener("pointermove", (e) => { if (state.scene === "editor") edPointerMove(e); });
  const releaseHold = () => {
    if (state.scene === "play") state.held = false;
    if (state.scene === "editor") edPointerUp();
  };
  canvas.addEventListener("pointerup", releaseHold);
  canvas.addEventListener("pointercancel", releaseHold);
  canvas.addEventListener("pointerleave", () => { ED.hover = null; releaseHold(); });
  canvas.addEventListener("wheel", (e) => {
    if (state.scene !== "editor") return;
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    ED.camX = clamp(ED.camX + d, 0, edMaxCam());
  }, { passive: false });

  // overlay buttons
  primaryBtn.addEventListener("click", () => advance());
  menuBtn.addEventListener("click", () => exitRun());
  resumeBtn.addEventListener("click", () => resumeGame());
  exitBtn.addEventListener("click", () => exitRun());
  noclipBtn.addEventListener("click", () => toggleMode("noclip"));
  practiceBtn.addEventListener("click", () => toggleMode("practice"));
  // tap the backdrop (not a button) to advance / resume — nice on mobile
  messageEl.addEventListener("click", (e) => { if (e.target === messageEl) advance(); });
  pauseEl.addEventListener("click", (e) => { if (e.target === pauseEl) resumeGame(); });
  document.getElementById("resetProgress").addEventListener("click", () => {
    storeDel(STORE_KEY);
    state.unlocked = 0;
    renderMenu(state.pack);
  });
  // home / navigation buttons
  playBtn.addEventListener("click", () => { ac(); goMenu(MAIN_PACK); });
  flyBtn.addEventListener("click", () => { ac(); startFly(); });
  skinBtn.addEventListener("click", () => { ac(); goSkins(); });
  createBtn.addEventListener("click", () => { ac(); goCustomMenu(); });
  plusBtn.addEventListener("click", (e) => { e.stopPropagation(); ac(); plusMenu.classList.toggle("hidden"); });
  homeEl.addEventListener("click", (e) => { if (!plusMenu.contains(e.target) && e.target !== plusBtn) plusMenu.classList.add("hidden"); });
  $("templesBtn").addEventListener("click", () => { ac(); goTemples(); });
  $("mapBtn").addEventListener("click", () => { ac(); goMap(); });
  $("searchBtn").addEventListener("click", () => { ac(); goSearch(); });
  $("raceBtn").addEventListener("click", () => { ac(); goRace(); });
  $("settingsBtn").addEventListener("click", () => { ac(); goSettings("account"); });
  backFromCustom.addEventListener("click", () => goHome());
  chestBtn.addEventListener("click", () => { ac(); openChest(); });
  backFromLevels.addEventListener("click", () => { if (state.pack && state.pack.kind === "temple") goTemples(); else goHome(); });
  backFromSkins.addEventListener("click", () => goHome());

  // ----- Main loop -------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    globalTime += dt;

    if (state.scene === "play") update(dt);
    else if (state.scene === "crash") {
      state.crashTimer += dt;
      updateParticles(dt);
      if (state.crashTimer > 0.5) restartRun(); // auto-respawn (Geometry Dash style)
    } else updateParticles(dt);

    // animate the level-clear coin total counting up
    if (state.coinAnim) {
      const ca = state.coinAnim;
      ca.t += dt;
      const p = ca.t >= ca.dur ? 1 : ca.t / ca.dur;
      const cur = Math.round(ca.from + (ca.to - ca.from) * (1 - (1 - p) * (1 - p)));
      if (cur !== ca.shown) {
        ca.shown = cur;
        if (ca.target === "pill") {
          document.querySelectorAll(".coin-val").forEach((e) => { e.textContent = cur; });
        } else {
          rewardTotal.textContent = cur;
        }
        if (now - ca.lastTick > 45) { ca.lastTick = now; tone(900 + p * 700, 0, 0.03, "square", 0.04); }
      }
      if (p >= 1) state.coinAnim = null;
    }

    render();
    if (state.scene === "home") drawHomeShip();
    requestAnimationFrame(frame);
  }

  // ----- Touch vs keyboard hints -----------------------------------------
  // On touch devices (e.g. iPad with no keyboard) reword the keyboard hints,
  // since SPACE / R / ESC won't apply — everything is tap-driven.
  const isTouch = (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
  function applyControlHints() {
    if (!isTouch) return; // keep SPACE / R / ESC wording on desktop
    const homeHint = homeEl.querySelector(".controls-hint");
    if (homeHint) homeHint.innerHTML =
      '<span class="key">HOLD</span> to rise &nbsp;·&nbsp; tap to hover &nbsp;·&nbsp; release to fall';
    const msgHint = messageEl.querySelector(".small-hint");
    if (msgHint) msgHint.textContent = "Tap a button to continue";
    const pauseHint = pauseEl.querySelector(".small-hint");
    if (pauseHint) pauseHint.textContent = "Tap Resume to keep playing";
  }

  // ----- Boot ------------------------------------------------------------
  // tiny hook for headless checks (console / test harness) — no gameplay use
  window.__shipdash = { levelCoins, freeGapAt, ALL_PACKS, state };
  applyControlHints();
  if (!isOwned(state.skin)) state.skin = 0; // never start equipped on a ship you don't own
  goHome();
  // opened from a friend's share link? add the level and jump to Search
  (function openShareLink() {
    if (!/#lvl=/.test(location.hash || "")) return;
    const lvl = importCode(location.hash);
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    if (!lvl) return;
    goSearch();
    srchUI.input.value = "#" + shortId(lvl);
    renderSearch();
  })();
  requestAnimationFrame(frame);
})();
