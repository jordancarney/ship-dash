/*
 * Ship Dash — trails
 * Cosmetic effects that follow the ship. Bought with coins on the Trails tab
 * of the Ships screen; the Classic streak is free.
 *
 * A trail is a tiny object { pts, parts, acc }: game.js feeds it one point per
 * frame with step() and paints it with draw(). Everything is drawn in "ship
 * units" (the ship is ~30 wide), so the same code renders in the game
 * (scale 1), on the home screen and in the shop previews (scaled up).
 *
 *   TRAILS.DEFS                        the trails on offer
 *   TRAILS.init({ paintShip })         Echo paints ghost copies of the ship
 *   TRAILS.make()                      a fresh, empty trail
 *   TRAILS.step(tr, x, y, dt, t, def, skin, { vy, g })   record a position, spawn + age particles
 *   TRAILS.update(tr, dt)              age particles only (ship stopped: crash)
 *   TRAILS.draw(c, tr, camX, t, def, skin)               paint it (call before the ship)
 *   TRAILS.makePreview() / stepPreview() / drawPreview() a self-running demo for menus
 */
(function () {
  "use strict";

  const DEFS = [
    { id: "classic",   name: "Classic",   cost: 0,   desc: "A clean streak in your ship's color" },
    { id: "rainbow",   name: "Rainbow",   cost: 75,  desc: "A flowing ribbon of every color" },
    { id: "inferno",   name: "Inferno",   cost: 100, desc: "Leave a blaze of fire in your wake" },
    { id: "stardust",  name: "Stardust",  cost: 125, desc: "Twinkling stars scatter behind you" },
    { id: "lightning", name: "Lightning", cost: 150, desc: "Crackling bolts chase your tail" },
    { id: "echo",      name: "Echo",      cost: 200, desc: "Ghostly copies of your ship follow you" },
    { id: "bubbles",   name: "Bubbles",   cost: 225, desc: "A stream of bubbles wobbles up and pops" },
    { id: "confetti",  name: "Confetti",  cost: 250, desc: "A party of paper squares tumbles behind you" },
    { id: "hearts",    name: "Hearts",    cost: 300, desc: "Little hearts float up in your wake" },
  ];
  const MAX_PTS = 70;                 // ~1.2 s of positions at 60 fps
  const STAR_COLS = ["#ffffff", "#ffe98a", "#9ff3ff", "#ffb3f0"];
  const CONFETTI_COLS = ["#46e6ff", "#ffd166", "#ff5470", "#9cff57", "#ff4bd8", "#b388ff", "#ffffff"];
  const HEART_COLS = ["#ff5d8f", "#ff8fb8", "#ffb3d9", "#ff4bd8"];
  const TAU = Math.PI * 2;
  const rnd = Math.random;
  let paintShip = null;

  function make() { return { pts: [], parts: [], acc: 0 }; }

  // ----- per-frame bookkeeping ---------------------------------------------
  function step(tr, x, y, dt, t, def, skin, extra) {
    extra = extra || {};
    tr.pts.push({ x, y, vy: extra.vy || 0, g: extra.g || 1 });
    if (tr.pts.length > MAX_PTS) tr.pts.shift();
    let life;
    switch (def.id) {
      case "inferno":                    // embers pour out of the engine and drift back
        tr.acc += dt * 170;
        while (tr.acc >= 1) {
          tr.acc -= 1; life = 0.3 + rnd() * 0.3;
          tr.parts.push({ kind: "flame", x: x - 10 + rnd() * 4, y: y + (rnd() - 0.5) * 8, vx: -30 - rnd() * 70, vy: -10 - rnd() * 50, life, max: life, r0: 3.5 + rnd() * 4 });
        }
        break;
      case "stardust":                   // slow twinkling stars
        tr.acc += dt * 48;
        while (tr.acc >= 1) {
          tr.acc -= 1; life = 0.6 + rnd() * 0.7;
          tr.parts.push({ kind: "star", x: x - 8 + (rnd() - 0.5) * 8, y: y + (rnd() - 0.5) * 20, vx: -10 - rnd() * 40, vy: (rnd() - 0.5) * 40, life, max: life,
            r0: 1.8 + rnd() * 2.8, col: STAR_COLS[(rnd() * STAR_COLS.length) | 0], spin: rnd() * TAU, tw: 8 + rnd() * 8 });
        }
        break;
      case "lightning":                  // stray sparks flung off the bolt
        tr.acc += dt * 20;
        while (tr.acc >= 1) {
          tr.acc -= 1; life = 0.15 + rnd() * 0.2;
          tr.parts.push({ kind: "spark", x: x - 8, y: y + (rnd() - 0.5) * 12, vx: -40 - rnd() * 120, vy: (rnd() - 0.5) * 160, life, max: life, r0: 1 + rnd() * 1.5 });
        }
        break;
      case "bubbles":                    // bubbles wobble up out of the engine and pop
        tr.acc += dt * 26;
        while (tr.acc >= 1) {
          tr.acc -= 1; life = 0.7 + rnd() * 0.7;
          tr.parts.push({ kind: "bubble", x: x - 10 + (rnd() - 0.5) * 6, y: y + (rnd() - 0.5) * 10, vx: -20 - rnd() * 40, vy: -25 - rnd() * 35, life, max: life,
            r0: 2 + rnd() * 3.5, spin: rnd() * TAU, tw: 5 + rnd() * 5 });
        }
        break;
      case "confetti":                   // paper squares tumble out and flutter down
        tr.acc += dt * 30;
        while (tr.acc >= 1) {
          tr.acc -= 1; life = 0.6 + rnd() * 0.6;
          tr.parts.push({ kind: "confetti", x: x - 8, y: y + (rnd() - 0.5) * 14, vx: -30 - rnd() * 80, vy: -40 + rnd() * 80, life, max: life,
            r0: 2.2 + rnd() * 2.2, col: CONFETTI_COLS[(rnd() * CONFETTI_COLS.length) | 0], spin: rnd() * TAU, tw: (rnd() - 0.5) * 16 });
        }
        break;
      case "hearts":                     // little hearts drift up and fade
        tr.acc += dt * 12;
        while (tr.acc >= 1) {
          tr.acc -= 1; life = 0.7 + rnd() * 0.5;
          tr.parts.push({ kind: "heart", x: x - 10, y: y + (rnd() - 0.5) * 12, vx: -25 - rnd() * 40, vy: -30 - rnd() * 40, life, max: life,
            r0: 2.5 + rnd() * 2.5, col: HEART_COLS[(rnd() * HEART_COLS.length) | 0], spin: rnd() * TAU, tw: 6 + rnd() * 4 });
        }
        break;
    }
    update(tr, dt);
  }

  function update(tr, dt) {
    if (!tr.parts.length) return;
    for (const p of tr.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.kind === "flame") { p.vy -= 90 * dt; p.vx *= Math.max(0, 1 - 2 * dt); }   // fire rises and slows
      else if (p.kind === "bubble") p.x += Math.sin(p.spin + p.life * p.tw) * 30 * dt;        // bubbles wobble
      else if (p.kind === "confetti") { p.vy += 120 * dt; p.vx *= Math.max(0, 1 - 1.5 * dt); } // paper flutters down
    }
    tr.parts = tr.parts.filter((p) => p.life > 0);
  }

  // ----- painting -----------------------------------------------------------
  function draw(c, tr, camX, t, def, skin) {
    switch (def.id) {
      case "rainbow":   drawRainbow(c, tr.pts, camX, t); break;
      case "inferno":   drawStreak(c, tr.pts.slice(-16), camX, "#ff9a3c", 0.3, 4); drawFlames(c, tr.parts, camX); break;
      case "stardust":  drawStreak(c, tr.pts.slice(-24), camX, "#ffffff", 0.16, 3); drawStars(c, tr.parts, camX, t); break;
      case "lightning": drawLightning(c, tr.pts, camX, t); drawSparks(c, tr.parts, camX); break;
      case "echo":      drawStreak(c, tr.pts.slice(-18), camX, skin.trail, 0.25, 4); drawEcho(c, tr.pts, camX, t, skin); break;
      case "bubbles":   drawStreak(c, tr.pts.slice(-14), camX, "#9fe0ff", 0.18, 3); drawBubbles(c, tr.parts, camX); break;
      case "confetti":  drawConfetti(c, tr.parts, camX, t); break;
      case "hearts":    drawStreak(c, tr.pts.slice(-14), camX, "#ff8fb8", 0.2, 3); drawHearts(c, tr.parts, camX, t); break;
      default:          drawStreak(c, tr.pts.slice(-18), camX, skin.trail, 0.5, 6);     // classic
    }
  }

  // tapered line through the points (the original trail)
  function drawStreak(c, pts, camX, col, aMax, wMax) {
    const n = pts.length; if (n < 2) return;
    c.strokeStyle = col; c.lineCap = "round";
    for (let i = 1; i < n; i++) {
      const a = pts[i - 1], b = pts[i], f = i / n;
      c.globalAlpha = f * aMax; c.lineWidth = f * wMax;
      c.beginPath(); c.moveTo(a.x - camX, a.y); c.lineTo(b.x - camX, b.y); c.stroke();
    }
    c.globalAlpha = 1;
  }

  // a rippling ribbon whose hue slides along its length
  function drawRainbow(c, pts, camX, t) {
    const all = pts.slice(-34), n = all.length; if (n < 2) return;
    c.lineCap = "round";
    for (let i = 1; i < n; i++) {
      const a = all[i - 1], b = all[i], f = i / n;
      const hue = ((i * 11 - t * 240) % 360 + 360) % 360;
      const wave = Math.sin(i * 0.55 - t * 10) * 3 * (1 - f);       // ripple that settles toward the ship
      c.strokeStyle = `hsl(${hue}, 100%, 62%)`;
      c.globalAlpha = 0.22 * f; c.lineWidth = 2 + f * 12;            // soft outer glow
      c.beginPath(); c.moveTo(a.x - camX, a.y + wave); c.lineTo(b.x - camX, b.y + wave); c.stroke();
      c.globalAlpha = 0.9 * f; c.lineWidth = 1 + f * 6;              // bright core
      c.beginPath(); c.moveTo(a.x - camX, a.y + wave); c.lineTo(b.x - camX, b.y + wave); c.stroke();
    }
    c.globalAlpha = 1;
  }

  function drawFlames(c, parts, camX) {
    c.save(); c.globalCompositeOperation = "lighter";
    for (const p of parts) {
      if (p.kind !== "flame") continue;
      const f = p.life / p.max;                                     // 1 = just born
      c.globalAlpha = 0.85 * f;
      c.fillStyle = f > 0.7 ? "#fff3b0" : f > 0.4 ? "#ffa726" : "#ff3d1c";
      c.beginPath(); c.arc(p.x - camX, p.y, p.r0 * (0.35 + 0.65 * f), 0, TAU); c.fill();
    }
    c.restore();
  }

  function sparkle(c, x, y, r, rot) {                                // 4-point star
    c.save(); c.translate(x, y); c.rotate(rot || 0);
    const k = r * 0.3;
    c.beginPath();
    c.moveTo(0, -r); c.lineTo(k, -k); c.lineTo(r, 0); c.lineTo(k, k);
    c.lineTo(0, r); c.lineTo(-k, k); c.lineTo(-r, 0); c.lineTo(-k, -k);
    c.closePath(); c.fill();
    c.restore();
  }
  function drawStars(c, parts, camX, t) {
    c.save(); c.globalCompositeOperation = "lighter";
    for (const p of parts) {
      if (p.kind !== "star") continue;
      const f = p.life / p.max, tw = 0.55 + 0.45 * Math.sin(t * p.tw + p.spin);
      c.globalAlpha = f * tw; c.fillStyle = p.col;
      sparkle(c, p.x - camX, p.y, p.r0 * (0.6 + 0.4 * f), p.spin + t * 2);
    }
    c.restore();
  }

  function drawBubbles(c, parts, camX) {
    c.save(); c.lineWidth = 1.2;
    for (const p of parts) {
      if (p.kind !== "bubble") continue;
      const f = p.life / p.max, r = p.r0 * (0.7 + 0.3 * (1 - f)), x = p.x - camX;
      if (f < 0.12) {                                                  // pop: a ring flying apart
        c.globalAlpha = f / 0.12 * 0.8; c.strokeStyle = "#e6f7ff";
        c.beginPath(); c.arc(x, p.y, r * (1 + (0.12 - f) * 12), 0, TAU); c.stroke();
        continue;
      }
      c.globalAlpha = 0.75 * Math.min(1, f * 3);
      c.strokeStyle = "#bfe9ff"; c.fillStyle = "rgba(160,220,255,0.18)";
      c.beginPath(); c.arc(x, p.y, r, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = "#ffffff"; c.beginPath(); c.arc(x - r * 0.35, p.y - r * 0.35, r * 0.28, 0, TAU); c.fill();   // glint
    }
    c.restore();
  }
  function drawConfetti(c, parts, camX, t) {
    c.save();
    for (const p of parts) {
      if (p.kind !== "confetti") continue;
      const f = p.life / p.max, flip = Math.abs(Math.cos(t * p.tw * 0.7 + p.spin));   // squashes as it tumbles
      c.globalAlpha = Math.min(1, f * 2.5); c.fillStyle = p.col;
      c.save(); c.translate(p.x - camX, p.y); c.rotate(p.spin + t * p.tw);
      c.fillRect(-p.r0, -p.r0 * 0.6 * flip - 0.3, p.r0 * 2, p.r0 * 1.2 * flip + 0.6);
      c.restore();
    }
    c.restore();
  }
  function heart(c, x, y, r) {
    c.beginPath();
    c.moveTo(x, y + r);
    c.bezierCurveTo(x - r * 1.5, y - r * 0.2, x - r * 0.7, y - r * 1.3, x, y - r * 0.4);
    c.bezierCurveTo(x + r * 0.7, y - r * 1.3, x + r * 1.5, y - r * 0.2, x, y + r);
    c.closePath(); c.fill();
  }
  function drawHearts(c, parts, camX, t) {
    c.save();
    for (const p of parts) {
      if (p.kind !== "heart") continue;
      const f = p.life / p.max, r = p.r0 * (0.8 + 0.2 * Math.sin(t * p.tw + p.spin));   // a little heartbeat
      c.globalAlpha = Math.min(1, f * 2.5) * 0.9; c.fillStyle = p.col;
      heart(c, p.x - camX, p.y, r);
    }
    c.restore();
  }

  // integer hash -> 0..1, so the bolt's jitter flickers at ~30 Hz instead of every frame
  function hash(n) {
    n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
    n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
    return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
  }
  function drawLightning(c, pts, camX, t) {
    const n = pts.length; if (n < 3) return;
    const seed = Math.floor(t * 30) * 7919, start = Math.max(0, n - 26), span = n - start;
    const path = [];
    for (let i = start; i < n; i++) {
      const f = (i - start) / span;                                   // 0 = tail .. 1 = ship
      path.push({ x: pts[i].x - camX, y: pts[i].y + (hash(seed + i * 31) - 0.5) * 14 * (1 - f * 0.7) });
    }
    c.save(); c.globalCompositeOperation = "lighter"; c.lineCap = "round"; c.lineJoin = "round";
    const stroke = (w, col, a) => {
      c.lineWidth = w; c.strokeStyle = col; c.globalAlpha = a;
      c.beginPath(); path.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
    };
    stroke(7, "#3fb8ff", 0.22); stroke(3, "#8fe3ff", 0.5); stroke(1.3, "#ffffff", 0.95);
    c.lineWidth = 1.2; c.strokeStyle = "#c9f1ff"; c.globalAlpha = 0.8;   // forks
    for (let i = 2; i < path.length - 2; i += 3) {
      const p = path[i], h1 = hash(seed + i * 131), h2 = hash(seed + i * 173);
      if (h1 < 0.45) continue;
      const len = 6 + h2 * 10, dir = h1 > 0.72 ? -1 : 1;
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - len * 0.6, p.y + dir * len * 0.7); c.lineTo(p.x - len * 1.3, p.y + dir * len * 0.9); c.stroke();
    }
    c.restore();
  }
  function drawSparks(c, parts, camX) {
    c.save(); c.globalCompositeOperation = "lighter"; c.fillStyle = "#e6f7ff";
    for (const p of parts) {
      if (p.kind !== "spark") continue;
      c.globalAlpha = p.life / p.max;
      c.beginPath(); c.arc(p.x - camX, p.y, p.r0, 0, TAU); c.fill();
    }
    c.restore();
  }

  // Echo: ghost ships at fixed distances back along the path (spacing doesn't
  // depend on speed). Each ghost is painted to an offscreen canvas first so
  // its transparency is uniform no matter what the skin does with alpha.
  const GHOSTS = [[26, 0.42], [52, 0.3], [78, 0.19], [104, 0.1]];
  let off = null, offCtx = null;
  function offscreen() {
    if (!off) {
      try { off = document.createElement("canvas"); off.width = off.height = 144; offCtx = off.getContext("2d"); } catch (e) { off = null; }
    }
    return offCtx;
  }
  function pointBack(pts, dist) {
    let acc = 0;
    for (let i = pts.length - 1; i > 0; i--) {
      const a = pts[i], b = pts[i - 1], seg = Math.hypot(a.x - b.x, a.y - b.y);
      if (acc + seg >= dist) {
        const f = seg ? (dist - acc) / seg : 0;
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, vy: a.vy, g: a.g };
      }
      acc += seg;
    }
    return null;
  }
  function drawEcho(c, pts, camX, t, skin) {
    if (!paintShip || pts.length < 2) return;
    const oc = offscreen(); if (!oc) return;
    for (let k = GHOSTS.length - 1; k >= 0; k--) {
      const p = pointBack(pts, GHOSTS[k][0]); if (!p) continue;
      oc.setTransform(1, 0, 0, 1, 0, 0); oc.clearRect(0, 0, 144, 144);
      oc.translate(72, 72); oc.scale(2, 2);
      paintShip(oc, skin, false, t);
      const g = p.g || 1, angle = Math.max(-0.45, Math.min(0.45, p.vy / 440 * 0.5)), s = 1 - k * 0.06;
      c.save();
      c.globalAlpha = GHOSTS[k][1];
      c.translate(p.x - camX, p.y); c.scale(s, g * s); c.rotate(angle * g);
      c.drawImage(off, -36, -36, 72, 72);
      c.restore();
    }
  }

  // ----- self-running preview (home screen, shop cards) ---------------------
  function makePreview() { return { tr: make(), x: 0, y: 0, t: 0, angle: 0 }; }
  function stepPreview(pv, dt, def, skin, amp) {
    amp = amp == null ? 6 : amp;
    pv.t += dt; pv.x += 100 * dt;                                    // cruise at 100 units/s along a wave
    pv.y = Math.sin(pv.t * 2.2) * amp;
    const slope = Math.cos(pv.t * 2.2) * amp * 2.2 / 100;
    pv.angle = Math.atan(slope) * 1.6;
    step(pv.tr, pv.x, pv.y, dt, pv.t, def, skin, { vy: slope * 1400, g: 1 });
  }
  // ship drawn at canvas pixel (cx, cy), everything scaled by `scale`
  function drawPreview(c, pv, cx, cy, scale, def, skin) {
    c.save();
    c.translate(cx, cy); c.scale(scale, scale);
    draw(c, pv.tr, pv.x, pv.t, def, skin);
    c.translate(0, pv.y); c.rotate(pv.angle);
    if (paintShip) paintShip(c, skin, true, pv.t);
    c.restore();
  }

  window.TRAILS = {
    DEFS, make, step, update, draw, makePreview, stepPreview, drawPreview,
    init(o) { paintShip = o && o.paintShip; },
  };
})();
