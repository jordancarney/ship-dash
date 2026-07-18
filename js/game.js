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
  const PAUSE_BTN = { x: W - 46, y: 10, w: 34, h: 34 }; // on-canvas pause button (top-right)

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
    state.coinAnim = null;
  }

  function startLevel(i) {
    state.mode = "level";
    state.levelIndex = i;
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
    hideAllOverlays();
    blurActive();
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
    state.scene = "play";
    state.shipX = 120;
    state.y = H / 2;
    state.vy = 0;
    state.held = false;
    state.camX = 0;
    state.elapsed = 0;
    state.flyTime = 0;
    state.trail = [];
    state.particles = [];
    hideAllOverlays();
    blurActive();
  }

  function goHome() {
    state.scene = "home";
    state.held = false;
    hideAllOverlays();
    updateCoinDisplays();
    renderChest();
    homeEl.classList.remove("hidden");
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

  function goMenu() {            // level select
    state.scene = "menu";
    state.held = false;
    hideAllOverlays();
    renderMenu();
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
    pauseEl.classList.remove("hidden");
    blurActive();
  }

  function resumeGame() {
    if (state.scene !== "paused") return;
    state.scene = "play";
    state.held = false;
    pauseEl.classList.add("hidden");
    blurActive();
  }

  // Death is instant-restart (Geometry Dash style): explode, brief beat, respawn.
  function crash() {
    if (state.scene !== "play") return;
    state.held = false;
    spawnExplosion(state.shipX, state.y);
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
    state.scene = "crash";             // levels: auto-respawn (handled in the loop)
    state.crashTimer = 0;
  }

  function complete() {
    const i = state.levelIndex;
    const isLast = i >= LEVELS.length - 1;
    // coins are awarded only on the FIRST clear (unlocked only advances then)
    const firstClear = (i + 1) > state.unlocked;
    let reward = 0;
    if (firstClear) {
      reward = LEVEL_REWARD[i] != null ? LEVEL_REWARD[i] : DEFAULT_REWARD;
      addCoins(reward);
    }
    saveUnlocked(i + 1);
    if (isLast) {
      state.scene = "win";
      sfxWin();
      showMessage("win", "YOU WIN!", "You cleared every level. Nice flying, pilot!",
        "Play Again ↺", () => startLevel(i));
    } else {
      state.scene = "complete";
      sfxComplete();
      showMessage("complete", "LEVEL CLEAR!", "Next level unlocked.",
        "Next Level →", () => startLevel(i + 1));
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

  function showMessage(kind, title, body, primaryLabel, primaryAction, hideMenu) {
    messageEl.className = "overlay " + kind;
    messageTitle.textContent = title;
    messageBody.textContent = body;
    primaryBtn.textContent = primaryLabel;
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
    const lvl = LEVELS[state.levelIndex];

    // vertical physics
    state.vy += GRAVITY * dt;
    if (state.held) state.vy -= THRUST * dt;
    if (state.vy > MAX_VY) state.vy = MAX_VY;
    if (state.vy < -MAX_VY) state.vy = -MAX_VY;
    state.y += state.vy * dt;

    // clamp to play area (touching edges is safe, just stops you)
    if (state.y < CEIL + SHIP_R) { state.y = CEIL + SHIP_R; if (state.vy < 0) state.vy = 0; }
    if (state.y > FLOOR - SHIP_R) { state.y = FLOOR - SHIP_R; if (state.vy > 0) state.vy = 0; }

    // horizontal scroll
    state.shipX += lvl.speed * dt;
    state.camX = Math.max(0, state.shipX - SHIP_SCREEN_X);

    // trail
    state.trail.push({ x: state.shipX, y: state.y });
    if (state.trail.length > 18) state.trail.shift();

    // collision with spikes (only those near the ship)
    for (const s of lvl.obstacles) {
      if (s.x + s.w < state.shipX - SHIP_R || s.x > state.shipX + SHIP_R) continue;
      if (circleHitsTri(state.shipX, state.y, COLLIDE_R, spikeTri(s, state.elapsed))) { crash(); return; }
    }

    // reached the finish
    if (state.shipX >= lvl.length) complete();
  }

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
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  // ----- Rendering -------------------------------------------------------
  function render() {
    const inGame = state.scene === "play" || state.scene === "crash" ||
                   state.scene === "paused" || state.scene === "flyover";
    const camX = inGame ? state.camX : globalTime * 36; // gentle drift on menu

    drawBackground(camX);

    if (inGame && state.mode === "fly") {
      drawFlyCorridor(camX);
      drawTrail(camX);
      if (state.scene !== "flyover") drawShip(); // ship gone after the run ends
      drawParticles(camX);
      drawFlyHUD();
      if (state.scene === "play") drawPauseButton();
    } else if (inGame) {
      const lvl = LEVELS[state.levelIndex];
      drawSpikes(lvl, camX);
      drawFinish(lvl, camX);
      drawTrail(camX);
      if (state.scene !== "crash") drawShip(); // ship is gone (exploded) only on crash
      drawParticles(camX);
      drawHUD(lvl);
      drawHint(lvl);
      if (state.scene === "play") drawPauseButton();
      if (state.scene === "crash") drawCrashFlash();
    } else {
      drawParticles(camX);
    }
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

  function drawBackground(camX) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0c1430");
    g.addColorStop(0.55, "#0a0f24");
    g.addColorStop(1, "#06091a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // parallax stars
    for (const s of stars) {
      let sx = ((s.x - camX * s.f) % W + W) % W;
      const tw = 0.55 + 0.45 * Math.sin(globalTime * s.sp + s.tw);
      ctx.globalAlpha = tw;
      ctx.fillStyle = "#cfe3ff";
      ctx.beginPath();
      ctx.arc(sx, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
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

  function drawSpikes(lvl, camX) {
    const t = state.elapsed;
    for (const s of lvl.obstacles) {
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
      } else if (s.dir === "bottom") { g.addColorStop(0, "#ff6b81"); g.addColorStop(1, "#7a1f2b"); }
      else { g.addColorStop(0, "#7a1f2b"); g.addColorStop(1, "#ff6b81"); }

      ctx.beginPath();
      ctx.moveTo(px[0], px[1]);
      ctx.lineTo(px[2], px[3]);
      ctx.lineTo(px[4], px[5]);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = gate ? "rgba(210,170,255,0.95)" : piston ? "rgba(255,200,120,0.95)" : "rgba(255,140,160,0.9)";
      ctx.shadowColor = gate ? "rgba(176,107,255,0.55)" : piston ? "rgba(255,170,70,0.55)" : "rgba(255,84,112,0.6)";
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

  function drawHUD(lvl) {
    // progress bar (leaves room for the pause button on the right)
    const pad = 16, barW = W - pad - 56, barH = 6, y = 12;
    const prog = Math.max(0, Math.min(1, (state.shipX - 120) / (lvl.length - 120)));
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(pad, y, barW, barH, 3); ctx.fill();
    ctx.fillStyle = "#46e6ff";
    roundRect(pad, y, barW * prog, barH, 3); ctx.fill();
    // ship marker
    ctx.fillStyle = "#eafcff";
    ctx.beginPath();
    ctx.arc(pad + barW * prog, y + barH / 2, 5, 0, Math.PI * 2);
    ctx.fill();

    // level label
    ctx.fillStyle = "rgba(232,238,252,0.85)";
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`LEVEL ${state.levelIndex + 1} · ${lvl.name}`, pad, 40);
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
  function renderMenu() {
    levelSelectEl.innerHTML = "";
    LEVELS.forEach((lvl, i) => {
      const locked = i > state.unlocked;
      const cleared = i < state.unlocked;
      const card = document.createElement("div");
      card.className = "level-card" + (locked ? " locked" : "");
      const badge = cleared
        ? '<span class="badge cleared">CLEARED ✓</span>'
        : locked
          ? '<span class="badge locked">🔒 LOCKED</span>'
          : '<span class="badge ready">▶ PLAY</span>';
      card.innerHTML =
        `<div class="num">Level ${i + 1}</div>` +
        `<div class="name">${lvl.name}</div>` +
        `<div class="desc">${lvl.subtitle}</div>` +
        badge;
      if (!locked) card.addEventListener("click", () => { ac(); startLevel(i); });
      levelSelectEl.appendChild(card);
    });
  }

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

  // ----- Input -----------------------------------------------------------
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      ac();
      if (state.scene === "play") state.held = true;
      else if (state.scene === "crash") startLevel(state.levelIndex); // respawn instantly
      else if (state.scene === "complete" || state.scene === "win" || state.scene === "flyover") {
        advance();
        if (state.scene === "play") state.held = true; // carry the hold into the next attempt
      }
      return;
    }
    if (e.code === "KeyR") {
      if (state.scene === "play" || state.scene === "crash" || state.scene === "paused" ||
          state.scene === "complete" || state.scene === "flyover") {
        if (state.mode === "fly") startFly(); else startLevel(state.levelIndex);
      }
    } else if (e.code === "Escape" || e.code === "KeyP") {
      if (state.scene === "play") pauseGame();
      else if (state.scene === "paused") resumeGame();
      else if (e.code === "Escape") {
        if (state.scene === "menu" || state.scene === "skins") goHome();
        else if (state.scene === "complete" || state.scene === "win" ||
                 state.scene === "crash" || state.scene === "flyover") goMenu();
      }
    } else if (e.code === "KeyM") {
      muted = !muted;
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" && state.scene === "play") state.held = false;
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
    if (state.scene === "play") {
      const p = toCanvas(e);
      if (p.x >= PAUSE_BTN.x - 6 && p.x <= PAUSE_BTN.x + PAUSE_BTN.w + 6 &&
          p.y >= PAUSE_BTN.y - 6 && p.y <= PAUSE_BTN.y + PAUSE_BTN.h + 6) {
        pauseGame();
        return;
      }
      state.held = true;
    } else if (state.scene === "crash") {
      startLevel(state.levelIndex); // tap to respawn instantly
    }
  });
  const releaseHold = () => { if (state.scene === "play") state.held = false; };
  canvas.addEventListener("pointerup", releaseHold);
  canvas.addEventListener("pointercancel", releaseHold);
  canvas.addEventListener("pointerleave", releaseHold);

  // overlay buttons
  primaryBtn.addEventListener("click", () => advance());
  menuBtn.addEventListener("click", () => goMenu());
  resumeBtn.addEventListener("click", () => resumeGame());
  exitBtn.addEventListener("click", () => goMenu());
  // tap the backdrop (not a button) to advance / resume — nice on mobile
  messageEl.addEventListener("click", (e) => { if (e.target === messageEl) advance(); });
  pauseEl.addEventListener("click", (e) => { if (e.target === pauseEl) resumeGame(); });
  document.getElementById("resetProgress").addEventListener("click", () => {
    storeDel(STORE_KEY);
    state.unlocked = 0;
    renderMenu();
  });
  // home / navigation buttons
  playBtn.addEventListener("click", () => { ac(); goMenu(); });
  flyBtn.addEventListener("click", () => { ac(); startFly(); });
  skinBtn.addEventListener("click", () => { ac(); goSkins(); });
  chestBtn.addEventListener("click", () => { ac(); openChest(); });
  backFromLevels.addEventListener("click", () => goHome());
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
      if (state.crashTimer > 0.5) startLevel(state.levelIndex); // auto-respawn (Geometry Dash style)
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
  applyControlHints();
  if (!isOwned(state.skin)) state.skin = 0; // never start equipped on a ship you don't own
  goHome();
  requestAnimationFrame(frame);
})();
