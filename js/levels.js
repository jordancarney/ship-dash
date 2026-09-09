/*
 * Ship Dash — level data
 *
 * Each spike: { x, w, h, dir }
 *   x   = left edge in world coordinates (px)
 *   w   = base width (px)
 *   h   = height of the spike (px)
 *   dir = 'bottom' (rises from the floor, apex points up)
 *       | 'top'    (hangs from the ceiling, apex points down)
 *
 * The play area is 540px tall. The ship enters from the left and the level
 * is cleared when it reaches `length` without touching a spike.
 *
 * Levels also carry `triggers`: cosmetic decorations (colors, backgrounds,
 * shakes, pulses, particles) that fire as the ship passes them — see
 * DECORATIONS below.
 */

// Build a contiguous row of identical spikes from x0 to x1 (a jagged edge).
function spikeRow(x0, x1, w, h, dir) {
  const out = [];
  for (let x = x0; x + w <= x1; x += w) out.push({ x, w, h, dir });
  return out;
}

// Tiny deterministic PRNG (mulberry32) so the "chaos" is the same every load.
function makeRng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * MOVING SPIKES (levels 6–10).
 *
 * A "piston" is a spike that slides in and out of its wall:
 *   dir "launching" -> rises up from the floor
 *   dir "falling"   -> drops down from the ceiling
 * Its tip pumps 0 -> len -> 0 every `period` seconds (see movingExt in game.js).
 *
 * Because the ship always travels at the level's constant speed, we can phase
 * each piston so it is fully extended exactly as the ship arrives — it visibly
 * rises to meet you (a fair telegraph), and the encounter is the same every run.
 */
function piston(x, w, dir, len, period, speed) {
  const tArrival = (x + w / 2 - 120) / speed; // when the ship reaches this column
  return { x, w, dir, len, period, phase: 0.5 - tArrival / period };
}

/*
 * SEGMENT LIBRARY (levels 6–10).
 *
 * Levels 6–10 are journeys that string together every mechanic from levels 1–5
 * — stay-level corridors, big zig-zags, jagged chaos — and add the new moving
 * spikes on top. Each builder returns { spikes, end, kind } so composeLevel()
 * can chain them with transition gaps (and decorate them by kind). Difficulty
 * ramps via tightness + speed.
 */

// L1 — static stay-level corridor (gap = 540 - 2h).
function segCorridor(x0, length, h, w) {
  w = w || 46;
  return {
    spikes: spikeRow(x0, x0 + length, w, h, "top").concat(spikeRow(x0, x0 + length, w, h, "bottom")),
    end: x0 + length, kind: "corridor",
  };
}

// L2 / L4 — big static zig-zag (alternating climb-over / dive-under).
function segZigzag(x0, count, gap, w, h, startDir) {
  const sp = [];
  for (let i = 0; i < count; i++) {
    const dir = (i % 2 === 0) ? startDir : (startDir === "bottom" ? "top" : "bottom");
    sp.push({ x: x0 + i * gap, w, h, dir });
  }
  return { spikes: sp, end: x0 + (count - 1) * gap + w, kind: "zigzag" };
}

// L5 — jagged irregular walls around a center corridor (chaos flavor).
function segChaos(x0, length, hwc, seed) {
  const rnd = makeRng(seed), R = 11, cy = 270, end = x0 + length, sp = [];
  for (const dir of ["top", "bottom"]) {
    let x = x0;
    while (x < end) {
      const full = dir === "top" ? cy - hwc - R : 540 - (cy + hwc + R);
      const w = 16 + Math.floor(rnd() * 50);
      if (full > 14 && rnd() > 0.1) {
        const frac = rnd() < 0.35 ? 1 : 0.5 + rnd() * 0.45;
        sp.push({ x: Math.round(x), w, h: Math.round(full * frac), dir });
      }
      x += w + 3 + rnd() * 18;
    }
  }
  return { spikes: sp, end, kind: "chaos" };
}

// NEW — moving-spike weave (alternating launching / falling pistons).
function segPistons(x0, count, gap, w, len, period, speed, startDir) {
  const sp = [];
  for (let i = 0; i < count; i++) {
    const dir = (i % 2 === 0) ? startDir : (startDir === "launching" ? "falling" : "launching");
    sp.push(piston(x0 + i * gap, w, dir, len, period, speed));
  }
  return { spikes: sp, end: x0 + (count - 1) * gap + w, kind: "pistons" };
}

// NEW + static — alternating big STATIC spike and MOVING piston (additive combo).
function segMix(x0, count, gap, w, h, len, period, speed, startDir) {
  const sp = [];
  for (let i = 0; i < count; i++) {
    const dir = (i % 2 === 0) ? startDir : (startDir === "bottom" ? "top" : "bottom");
    if (i % 2 === 0) sp.push({ x: x0 + i * gap, w, h, dir });
    else sp.push(piston(x0 + i * gap, w, dir === "top" ? "falling" : "launching", len, period, speed));
  }
  return { spikes: sp, end: x0 + (count - 1) * gap + w, kind: "mix" };
}

/*
 * NEW MECHANIC — MOVING GATES (levels 11+).
 *
 * A "gate" is a top spike + a bottom spike that slide up and down TOGETHER,
 * keeping a constant hole of half-height `gap` between their tips. The hole's
 * center oscillates `center ± amp` every `period` seconds (see gateCenter in
 * game.js). The ship has to read the moving hole and ride it.
 *
 * segGates lays a ROW of gates that all share one phase, so their holes sample
 * a single sine wave in time — as the ship flies the row, the hole sweeps up
 * and down and the ship weaves to stay inside it. The phase is set from x0 so
 * the FIRST gate's hole is centered (easy to enter) right as the ship arrives.
 *
 * Beatability note: the hole tracks a sinusoid, so the ship must out-accelerate
 * amp*(2π/period)². Net thrust is ±1000 px/s², so keep amp*(2π/period)² well
 * under that (verified by the headless BFS sim, not by hand-playing).
 */
function segGates(x0, count, gapX, w, gap, amp, period, speed, opts) {
  opts = opts || {};
  const center = opts.center != null ? opts.center : 270;
  const t0 = (x0 + w / 2 - 120) / speed;             // when the ship reaches gate 0
  const startPhase = opts.start != null ? opts.start : 0; // 0 -> first hole centered
  const phase = startPhase - t0 / period;
  const sp = [];
  for (let i = 0; i < count; i++) {
    const x = x0 + i * gapX;
    sp.push(
      { x, w, dir: "gateTop",    gap, amp, center, period, phase },
      { x, w, dir: "gateBottom", gap, amp, center, period, phase }
    );
  }
  return { spikes: sp, end: x0 + (count - 1) * gapX + w, kind: "gates" };
}

/*
 * DECORATIONS.
 *
 * The same cosmetic triggers the level creator places (see fireTrigger in
 * game.js): { type, x, ...props }, each firing once as the ship passes x.
 * Every mechanic has a look of its own, so a corridor reads as a corridor and
 * chaos reads as chaos wherever they turn up:
 *
 *   corridor   cyan spikes on deep blue                    hold the line
 *   zig-zag    lime spikes on green                        over the hills
 *   chaos      red spikes on crimson, a rumble, embers     into the fire
 *   pistons    the classic spikes in a warm amber glow     engine room
 *   gates      a violet pulse over deep violet             ride the tide
 *   spinners   steel spikes on gunmetal, flying sparks     the sawmill
 *   flipped    blue while gravity is flipped; a gold flash and the classic
 *              look when it's restored
 *   blocks     periwinkle spikes on steel-blue                the crate yard
 *   wind       a cyan (updraft) or amber (downdraft) pulse as the zone starts
 *   mini       a pink flash as you shrink, a green one as you grow back
 *
 * A composed level adds a background style and a finish sparkle on top
 * (`deco` in composeLevel); the hand-built levels place theirs by hand.
 * SPEED triggers are never used: pistons, gates and spinners are phased to
 * the ship's arrival time, and every secret coin was verified at its level's
 * fixed speed.
 */
// Trigger factories. `dx` offsets a trigger from wherever at() places it.
const fade       = (col, col2, dur, dx) => ({ type: "fade", col, col2, dur, dx: dx || 0 });
const shake      = (str, dur, dx)       => ({ type: "shake", str, dur, dx: dx || 0 });
const pulse      = (col, str, dur, dx)  => ({ type: "pulse", col, str, dur, dx: dx || 0 });
const particles  = (col, str, dx)       => ({ type: "particles", col, str, dx: dx || 0 });   // str 0 turns them off
const background = (bg, dx)             => ({ type: "background", bg, dx: dx || 0 });
// Place a list of triggers at world x.
function at(x, list) {
  return list.map((t) => { const o = Object.assign({}, t, { x: x + t.dx }); delete o.dx; return o; });
}
function atEach(xs, list) { return xs.reduce((out, x) => out.concat(at(x, list)), []); }
// Hand-placed decorations: any number of at()/atEach() lists, in any order
// (the game fires triggers in array order, so they must be sorted by x).
function decorations() { return [].concat(...arguments).sort((a, b) => a.x - b.x); }

const SPIKE0 = "#ff6b81", BG0 = "#0c1430";   // the classic look (DEFAULT_SPIKE / DEFAULT_BG in game.js)
const GOLD = "#ffd166", EMBERS = "#ff9f43";
const LOOK = {                                 // [spike color, background color]
  classic:  [SPIKE0,    BG0],
  corridor: ["#46e6ff", "#0b2440"],
  zigzag:   ["#8cff5e", "#0d2a22"],
  chaos:    ["#ff3b3b", "#2a0a14"],
  engine:   [SPIKE0,    "#2a1608"],            // pistons, alone or mixed with static spikes
  gates:    [SPIKE0,    "#1c1050"],
  saw:      ["#dfe6f5", "#1c1c26"],
  flip:     ["#5b8cff", "#08183f"],
  blocks:   ["#9fb8ff", "#12183a"],
};
const look = (k, dur, dx) => fade(LOOK[k][0], LOOK[k][1], dur, dx);
// The run-out to the finish: a gold glow and rising sparkles.
const FINALE = [pulse(GOLD, 2, 1.4), particles(GOLD, 6)];

// What each section kind does as the ship approaches (`enter`, placed 160px
// before its first obstacle) and as it leaves (`leave`, 40px after its last).
const SECTION_DECO = {
  corridor:    { enter: [look("corridor", 1.0)] },
  zigzag:      { enter: [look("zigzag", 1.0)] },
  chaos:       { enter: [look("chaos", 0.8), shake(3, 0.8, -40), particles(EMBERS, 2)], leave: [particles(EMBERS, 0)] },
  pistons:     { enter: [look("engine", 1.0), shake(2, 0.6)] },
  mix:         { enter: [look("engine", 1.0), shake(2, 0.6)] },
  gates:       { enter: [look("gates", 1.0), pulse("#b06bff", 3, 1.2)] },
  sawwall:     { enter: [look("saw", 0.8), shake(3, 0.8, -40), particles(GOLD, 3)], leave: [particles(GOLD, 0)] },
  sawcorridor: { enter: [look("saw", 0.8), shake(3, 0.8, -40), particles(GOLD, 3)], leave: [particles(GOLD, 0)] },
  flipzig:     { enter: [look("classic", 0.8)] },   // its portals take it from here
  blocks:      { enter: [look("blocks", 1.0)] },
};
// Decorations for one composed section. The first section starts at x = 100
// so the level opens in its look; a flipped section keeps the flip's blue.
function sectionDeco(r, x0, first) {
  const d = !r.flipped && SECTION_DECO[r.kind];
  if (!d) return [];
  return at(first ? 100 : x0 - 160, d.enter || []).concat(at(r.end + 40, d.leave || []));
}
// The gravity cue at a portal: the world turns blue as gravity flips, and
// flashes gold as it rights itself (portal colors from PORTAL_COL in game.js).
function flipDeco(x, g) {
  return at(x, g < 0 ? [pulse("#4f8cff", 3, 0.6), look("flip", 0.35)] : [pulse("#ffd23a", 3, 0.6), look("classic", 0.35)]);
}

/*
 * NEW MECHANIC — GRAVITY PORTALS (levels 21+).
 *
 * A portal is a full-height gate at x that sets gravity as the ship passes:
 *   g = -1  BLUE  the ship falls UP — hold to dive, release to climb
 *   g =  1  GOLD  back to normal
 * The physics are a perfect mirror, so any section is exactly as beatable
 * upside down — it's the pilot's instincts that get scrambled. Sections
 * return `portals: [{ x, g }]` alongside their spikes.
 */
// Wrap a section in a blue portal (with a run-up) and a gold one after it.
function withFlip(section, lead) {
  lead = lead == null ? 170 : lead;
  return (x, sp) => {
    const r = section(x + lead, sp), gold = r.end + 70;
    return Object.assign({}, r, {
      flipped: true, end: gold,
      portals: [{ x, g: -1 }].concat(r.portals || [], [{ x: gold, g: 1 }]),
      triggers: flipDeco(x, -1).concat(r.triggers || [], flipDeco(gold, 1)),
    });
  };
}
// Zig-zag with a portal between every pair of spikes: each climb or dive
// arrives with the controls reversed from the last one. Use an odd `count`
// so the run ends with gravity back to normal.
function segFlipZig(x0, count, gap, w, h, startDir) {
  const sp = [], portals = [], triggers = [];
  for (let i = 0; i < count; i++) {
    const dir = (i % 2 === 0) ? startDir : (startDir === "bottom" ? "top" : "bottom");
    sp.push({ x: x0 + i * gap, w, h, dir });
    if (i < count - 1) {
      const px = x0 + i * gap + w + (gap - w) / 2, g = i % 2 === 0 ? -1 : 1;
      portals.push({ x: px, g });
      triggers.push(...flipDeco(px, g));
    }
  }
  return { spikes: sp, portals, triggers, end: x0 + (count - 1) * gap + w, kind: "flipzig" };
}

/*
 * NEW MECHANIC — SPINNERS (levels 22+).
 *
 * A spinner is a blade (isosceles triangle, base `bw` wide at the hub) that
 * sweeps a circle of radius `r` around its hub once every `period` seconds.
 * Wall hubs (on the ceiling or floor) hide the blade inside the wall for half
 * of every turn; free-floating hubs carry two blades. x/w give the sweep's
 * horizontal footprint so culling and collision prefilters work unchanged
 * (see spikeTri in game.js for the geometry). Like pistons, each spinner is
 * phased to the ship's arrival so the encounter is the same every run.
 */
function spinner(cx, cy, r, period, phase, ccw, bw) {
  return { x: cx - r, w: 2 * r, dir: "spinner", cx, cy, r, bw: bw || 26, period, phase, ccw: !!ccw };
}
// Wall spinners alternating ceiling/floor, each facing a tall static spike on
// the opposite wall, so the only way past is THROUGH the sweep — hug the spike
// tip and slip by while the blade is buried in the wall. The blade tucks in
// on the ship's side as it approaches and re-emerges behind it (ceiling hubs
// turn counter-clockwise, floor hubs clockwise), so the window is fair.
function segSawWall(x0, count, gapX, r, period, speed, oppH, startTop) {
  const sp = [];
  for (let i = 0; i < count; i++) {
    const top = (i % 2 === 0) === !!startTop;
    const cx = x0 + r + i * gapX;
    const tArr = (cx - 120) / speed;
    sp.push(spinner(cx, top ? 0 : 540, r, period, 0.25 - tArr / period, top));  // buried exactly as the ship arrives
    sp.push({ x: cx - 70, w: 140, h: oppH, dir: top ? "bottom" : "top" });
  }
  return { spikes: sp, end: x0 + (count - 1) * gapX + 2 * r, kind: "sawwall" };
}
// Two-bladed spinners floating in a corridor, blades level as the ship
// arrives. A blade can only catch a ship on the side where it swings AGAINST
// the ship's travel, so the safe side is where the blade moves WITH you:
// above a clockwise hub, below a counter-clockwise one. Hubs alternate.
function segSawCorridor(x0, count, gapX, r, period, speed, corrH, hubY, startCcw) {
  const len = (count - 1) * gapX + 2 * r + 120;
  const sp = spikeRow(x0, x0 + len, 46, corrH, "top").concat(spikeRow(x0, x0 + len, 46, corrH, "bottom"));
  for (let i = 0; i < count; i++) {
    const cx = x0 + 60 + r + i * gapX, tArr = (cx - 120) / speed;
    const ccw = (i % 2 === 0) === !!startCcw;
    const phase = -tArr / period;                   // a(tArr) = 0: blades horizontal
    sp.push(spinner(cx, hubY, r, period, phase, ccw, 30), spinner(cx, hubY, r, period, phase + 0.5, ccw, 30));
  }
  return { spikes: sp, end: x0 + len, kind: "sawcorridor" };
}

/*
 * NEW MECHANICS — WIND, BLOCKS, MINI PORTALS (levels 26–30).
 *
 * WIND ZONES push the ship with a constant `wind` px/s² while it's inside
 * (negative = updraft, positive = downdraft) — see windAt in game.js. Net
 * thrust is ±1000, so a ±600 wind leaves ±400 of control: lean against it.
 * BLOCKS are rectangles ({ x, y, w, h, dir: "block" }) you fly over or under,
 * never through. MINI PORTALS shrink the ship (hitbox and all) to MINI so it
 * can thread gaps a full-size ship never could; the green one grows it back.
 */
const MINI = 0.6;   // must match MINI in game.js
// Wrap a section in a wind zone reaching `pad` px before and after it.
function withWind(section, wind, pad) {
  pad = pad == null ? 120 : pad;
  return (x, sp) => {
    const r = section(x, sp);
    return Object.assign({}, r, { zones: [{ x0: x - pad, x1: r.end + pad, wind }].concat(r.zones || []) });
  };
}
function block(x, y, w, h) { return { x, y, w, h, dir: "block" }; }
// Blocks down a corridor, alternating high and low: over one, under the next.
// `corrH` = the spike rows on both walls; each block leaves a `hole` between
// itself and the far wall's tips.
function segBlockWeave(x0, count, gapX, bw, corrH, hole, startTop) {
  const len = (count - 1) * gapX + bw + 120, bh = 540 - 2 * corrH - hole;
  const sp = spikeRow(x0, x0 + len, 46, corrH, "top").concat(spikeRow(x0, x0 + len, 46, corrH, "bottom"));
  for (let i = 0; i < count; i++) {
    const top = (i % 2 === 0) === !!startTop;
    sp.push(block(x0 + 60 + i * gapX, top ? corrH : 540 - corrH - bh, bw, bh));
  }
  return { spikes: sp, end: x0 + len, kind: "blocks" };
}
// A staircase of blocks up from the floor (or down from the ceiling) and back,
// `steps` high, each `sw` wide and `rise` taller than the last, under a spike
// row of height `oppH` on the far wall so the crest is a squeeze.
function segBlockStairs(x0, steps, sw, rise, base, oppH, up) {
  const n = 2 * steps - 1, sp = [];
  for (let i = 0; i < n; i++) {
    const h = base + (i < steps ? i : n - 1 - i) * rise;
    sp.push(up ? block(x0 + i * sw, 540 - h, sw, h) : block(x0 + i * sw, 0, sw, h));
  }
  const end = x0 + n * sw;
  return { spikes: sp.concat(spikeRow(x0, end, 46, oppH, up ? "top" : "bottom")), end, kind: "blocks" };
}
// A boxy tunnel of block pairs whose `gap`-tall hole snakes up and down by
// `amp`, `step` radians per cell (keep amp * step well under gap - 24 so the
// holes of neighbouring cells overlap enough for the ship to fit through).
function segBlockTunnel(x0, cells, sw, gap, amp, step) {
  step = step || 0.5;
  const sp = [];
  for (let i = 0; i < cells; i++) {
    const x = x0 + i * sw, cy = Math.round(270 + amp * Math.sin(i * step));
    sp.push(block(x, 0, sw, cy - gap / 2), block(x, cy + gap / 2, sw, 540 - cy - gap / 2));
  }
  return { spikes: sp, end: x0 + cells * sw, kind: "blocks" };
}
// Shrink for a section: a pink portal (with a run-up), the section, a green one.
function withMini(section, lead) {
  lead = lead == null ? 170 : lead;
  return (x, sp) => {
    const r = section(x + lead, sp), grow = r.end + 70;
    return Object.assign({}, r, {
      mini: true, end: grow,
      portals: [{ x, size: MINI }].concat(r.portals || [], [{ x: grow, size: 1 }]),
      triggers: at(x, [pulse("#ff5bd0", 3, 0.6)]).concat(r.triggers || [], at(grow, [pulse("#6bff8a", 3, 0.6)])),
    });
  };
}

// Stitch sections together (each: (x0, speed) => {spikes, end, kind, portals?,
// zones?, triggers?}) with gaps. `meta.deco` = { bg, finale? } decorates the level: a
// background style, every section's look (SECTION_DECO) and a finish sparkle.
function composeLevel(meta, sections) {
  const trans = meta.trans || 230, deco = meta.deco;
  let x = meta.intro || 380;
  const obstacles = [], portals = [], zones = [], triggers = [];
  sections.forEach((seg, i) => {
    const r = seg(x, meta.speed);
    obstacles.push(...r.spikes);
    if (r.portals) portals.push(...r.portals);
    if (r.zones) zones.push(...r.zones);
    if (r.triggers) triggers.push(...r.triggers);
    if (deco) {
      triggers.push(...sectionDeco(r, x, i === 0));
      for (const z of r.zones || []) triggers.push(...at(z.x0, [pulse(z.wind < 0 ? "#46e6ff" : "#ffb84a", 2, 0.8)]));
    }
    x = r.end + trans;
  });
  const lastEnd = x - trans;
  if (deco) triggers.push(...at(100, [background(deco.bg || "stars")]), ...at(lastEnd + 60, deco.finale || FINALE));
  obstacles.sort((a, b) => a.x - b.x);
  portals.sort((a, b) => a.x - b.x);
  zones.sort((a, b) => a.x0 - b.x0);
  triggers.sort((a, b) => a.x - b.x);
  return {
    name: meta.name, subtitle: meta.subtitle, hint: meta.hint, diff: meta.diff || 0,
    speed: meta.speed, length: lastEnd + (meta.outro || 320), obstacles, portals, zones, triggers,
  };
}

/*
 * LEVEL 5 — a long, chaotic journey.
 *
 * The trick to "chaos that's still beatable": we hand-design a smooth, snaking
 * GAP PATH (center line `cy` + half-gap `hw`) through a series of zones — that's
 * the journey. Then we grow jagged, irregular walls of varying teeth up to (but
 * never past) the gap edges — that's the chaos. The teeth differ in width,
 * height and spacing and skip sides at random, so it reads as "stuff
 * everywhere," but a clear, physics-feasible route is guaranteed to exist.
 */
function buildChaosLevel() {
  const FLOOR = 540, R = 11;        // play height, approx ship collision radius
  const rnd = makeRng(20260607);    // fixed seed -> deterministic level
  const teethEnd = 5050;

  // The journey: { x, cy (gap center), hw (half-gap) }. Slopes between points
  // stay gentle enough that the ship can track the gap at the level's speed.
  const path = [
    { x: 420,  cy: 270, hw: 95 },   // ease in
    { x: 800,  cy: 205, hw: 82 },   // jagged cave: drift up
    { x: 1150, cy: 325, hw: 82 },   //   ...and back down
    { x: 1500, cy: 180, hw: 56 },   // the squeeze: climb into a tight slot
    { x: 1850, cy: 165, hw: 48 },   //   hold high & narrow
    { x: 2150, cy: 305, hw: 64 },   // drop out
    { x: 2500, cy: 300, hw: 122 },  // scatter field: wide open, dodge loners
    { x: 2900, cy: 250, hw: 122 },
    { x: 3150, cy: 250, hw: 64 },   // re-enter close quarters
    { x: 3450, cy: 420, hw: 60 },   // switchbacks: dive low
    { x: 3780, cy: 130, hw: 60 },   //   climb high
    { x: 4080, cy: 425, hw: 58 },   //   dive low
    { x: 4380, cy: 150, hw: 56 },   //   climb high
    { x: 4680, cy: 300, hw: 78 },   // finale settle
    { x: 5050, cy: 270, hw: 100 },  // run-out
    { x: 5300, cy: 270, hw: 120 },  // open to the finish
  ];
  function sample(x) {
    if (x <= path[0].x) return path[0];
    for (let i = 1; i < path.length; i++) {
      if (x <= path[i].x) {
        const a = path[i - 1], b = path[i], t = (x - a.x) / (b.x - a.x);
        return { cy: a.cy + (b.cy - a.cy) * t, hw: a.hw + (b.hw - a.hw) * t };
      }
    }
    return path[path.length - 1];
  }

  const obstacles = [];
  for (const dir of ["top", "bottom"]) {
    let x = path[0].x;
    while (x < teethEnd) {
      const { cy, hw } = sample(x);
      const scatter = hw > 100;
      // deepest this tooth may reach without blocking the gap
      const full = dir === "top" ? cy - hw - R : FLOOR - (cy + hw + R);
      const w = 16 + Math.floor(rnd() * 56);
      if (full > 14 && rnd() > (scatter ? 0.45 : 0.08)) {
        const frac = rnd() < 0.3 ? 1 : 0.45 + rnd() * 0.5; // sometimes full-height (tight)
        obstacles.push({ x: Math.round(x), w, h: Math.round(full * frac), dir });
      }
      x += w + (scatter ? 40 + rnd() * 130 : 2 + rnd() * 22);
    }
  }
  obstacles.sort((a, b) => a.x - b.x);

  // Decorations follow the journey's zones (the `path` above).
  const triggers = decorations(
    at(100,  [background("stars"), look("chaos", 1.2), particles(EMBERS, 2)]),           // into the fire
    at(1340, [fade("#ff3b3b", "#3a0a10", 0.8), shake(3, 0.8), pulse("#ff3b3b", 3, 1.0)]), // the squeeze
    at(2340, [fade("#ffb84a", "#12264a", 1.0), particles("#cfe3ff", 1)]),                // scatter field: open sky
    at(2990, [look("chaos", 0.8), shake(2, 0.6), particles(EMBERS, 2)]),                 // close quarters again
    atEach([3300, 3630, 3930, 4230], [pulse("#ff3b3b", 2, 0.5)]),                        // a heartbeat per switchback
    at(4620, [look("classic", 1.2), particles(EMBERS, 0)]),                              // finale settle
    at(5060, FINALE)                                                                     // run-out
  );

  return {
    name: "Bedlam",
    diff: 1,
    subtitle: "A chaotic journey",
    hint: "No patterns here — read the chaos and weave your way through!",
    speed: 200,
    length: 5300,
    obstacles,
    triggers,
  };
}

const LEVELS = [
  // ----------------------------------------------------------------------
  // LEVEL 1 — Stay Level
  // A clear horizontal corridor lined with small spikes top and bottom.
  // Gravity constantly pulls you down, so you learn to *tap* to hover.
  // ----------------------------------------------------------------------
  {
    name: "Steady Hands",
    diff: 0,
    subtitle: "Learn to hover",
    hint: "Tap SPACE to hover and hold the line. Stay in the middle!",
    speed: 250,
    length: 2800,
    obstacles: [
      ...spikeRow(440, 2520, 48, 165, "top"),
      ...spikeRow(440, 2520, 48, 165, "bottom"),
    ],
    // a calm first flight: rolling hills, the corridor look, drifting motes
    triggers: decorations(
      at(100, [background("hills"), look("corridor", 1.2), particles("#cfe3ff", 1)]),
      at(2560, FINALE)
    ),
  },

  // ----------------------------------------------------------------------
  // LEVEL 2 — Up & Down
  // Big alternating spikes. Climb high over the floor spikes, dive low
  // under the ceiling spikes. Staying level will not save you here.
  // ----------------------------------------------------------------------
  {
    name: "Up & Over",
    diff: 0,
    subtitle: "Climb and dive",
    hint: "HOLD SPACE to climb over, RELEASE to dive under. Weave through!",
    speed: 205,
    length: 2920,
    obstacles: [
      { x: 540,  w: 150, h: 380, dir: "bottom" }, // go up
      { x: 920,  w: 150, h: 380, dir: "top" },    // go down
      { x: 1300, w: 150, h: 380, dir: "bottom" }, // go up
      { x: 1680, w: 150, h: 380, dir: "top" },    // go down
      { x: 2060, w: 150, h: 380, dir: "bottom" }, // go up
      { x: 2440, w: 150, h: 380, dir: "top" },    // go down
    ],
    // hills to climb over; a soft flash before each spike — lime says climb, sky says dive
    triggers: decorations(
      at(100, [background("hills"), look("zigzag", 1.2)]),
      atEach([400, 1160, 1920], [pulse("#8cff5e", 2, 0.6)]),
      atEach([780, 1540, 2300], [pulse("#5cc8ff", 2, 0.6)]),
      at(2640, FINALE)
    ),
  },

  // ----------------------------------------------------------------------
  // LEVEL 3 — The Gauntlet
  // A steady corridor (like level 1) flowing into a big zig-zag
  // (like level 2). Do both, back to back.
  // ----------------------------------------------------------------------
  {
    name: "The Gauntlet",
    diff: 0,
    subtitle: "Everything you've learned",
    hint: "Hold steady through the corridor… then climb and dive at the end!",
    speed: 225,
    length: 3500,
    obstacles: [
      // Section A — stay-level corridor
      ...spikeRow(440, 1480, 48, 190, "top"),
      ...spikeRow(440, 1480, 48, 190, "bottom"),
      // Section B — climb & dive zig-zag
      { x: 1820, w: 150, h: 370, dir: "bottom" },
      { x: 2220, w: 150, h: 370, dir: "top" },
      { x: 2620, w: 150, h: 370, dir: "bottom" },
      { x: 3020, w: 150, h: 370, dir: "top" },
    ],
    // the corridor look, then the zig-zag look as the big spikes begin
    triggers: decorations(
      at(100, [background("hills"), look("corridor", 1.2)]),
      at(1660, [look("zigzag", 1.0), pulse("#8cff5e", 2, 0.8)]),
      at(3210, FINALE)
    ),
  },

  // ----------------------------------------------------------------------
  // LEVEL 4 — Razor's Edge
  // The Gauntlet with the screws turned. A tighter corridor up front, then a
  // longer climb-and-dive run with taller spikes and smaller gaps. The margin
  // for error is almost gone — every up and down has to be near perfect.
  // ----------------------------------------------------------------------
  {
    name: "Razor's Edge",
    diff: 1,
    subtitle: "Pixel-perfect flying",
    hint: "No room for error. Thread the corridor, then nail every climb and dive.",
    speed: 230,
    length: 4450,
    obstacles: [
      // Section A — razor-thin corridor (tighter than The Gauntlet)
      ...spikeRow(440, 1400, 48, 210, "top"),
      ...spikeRow(440, 1400, 48, 210, "bottom"),
      // Section B — tall spikes packed tight: relentless, near-perfect climbs and dives
      { x: 1720, w: 150, h: 420, dir: "bottom" },
      { x: 2040, w: 150, h: 420, dir: "top" },
      { x: 2360, w: 150, h: 420, dir: "bottom" },
      { x: 2680, w: 150, h: 420, dir: "top" },
      { x: 3000, w: 150, h: 420, dir: "bottom" },
      { x: 3320, w: 150, h: 420, dir: "top" },
      { x: 3640, w: 150, h: 420, dir: "bottom" },
      { x: 3960, w: 150, h: 420, dir: "top" },
    ],
    // precision: a neon grid, then the razor — steel spikes and a jolt
    triggers: decorations(
      at(100, [background("grid"), look("corridor", 1.2)]),
      at(1560, [look("saw", 0.8), shake(2, 0.6), pulse("#ffffff", 2, 0.8)]),
      at(4150, FINALE)
    ),
  },

  // ----------------------------------------------------------------------
  // LEVEL 5 — Bedlam (chaotic journey; see buildChaosLevel above)
  // ----------------------------------------------------------------------
  buildChaosLevel(),

  // ----------------------------------------------------------------------
  // LEVELS 6–10 — full journeys: every mechanic from 1–5 PLUS the new moving
  // spikes (launching from the floor, falling from the ceiling), ramped from
  // "a notch above L5" up to the hardest level in the game.
  // ----------------------------------------------------------------------

  // L6 — everything from 1–5, plus the new moving spikes, a notch above L5.
  composeLevel(
    { name: "Liftoff", deco: { bg: "grid" }, diff: 1, subtitle: "Old tricks + amber spikes", speed: 200,
      hint: "AMBER spikes MOVE — they launch up and drop down. Everything else is back too!" },
    [
      (x) => segCorridor(x, 560, 176),
      (x, sp) => segPistons(x, 4, 365, 90, 332, 2.25, sp, "launching"),
      (x) => segZigzag(x, 4, 336, 128, 365, "bottom"),
      (x) => segChaos(x, 540, 72, 3106),
    ]
  ),
  // L7
  composeLevel(
    { name: "Drop Zone", deco: { bg: "stars" }, diff: 2, subtitle: "Weave the moving spikes", speed: 203,
      hint: "Fallers drop, launchers rise — thread them, then hold the line." },
    [
      (x, sp) => segPistons(x, 5, 350, 88, 348, 2.0, sp, "falling"),
      (x) => segChaos(x, 600, 70, 3207),
      (x) => segCorridor(x, 560, 188),
      (x) => segZigzag(x, 4, 334, 128, 372, "top"),
    ]
  ),
  // L8
  composeLevel(
    { name: "Push & Pull", deco: { bg: "grid" }, diff: 2, subtitle: "Static and moving, together", speed: 207,
      hint: "Now static and moving spikes are mixed. Climb, dive, weave, repeat." },
    [
      (x) => segZigzag(x, 4, 334, 128, 378, "bottom"),
      (x) => segCorridor(x, 540, 194),
      (x, sp) => segMix(x, 6, 342, 94, 356, 352, 1.9, sp, "bottom"),
      (x) => segChaos(x, 600, 66, 3308),
    ]
  ),
  // L9
  composeLevel(
    { name: "Crossfire", deco: { bg: "grid" }, diff: 2, subtitle: "Fast and unforgiving", speed: 211,
      hint: "Read everything early. Tight chaos, moving walls, a razor zig-zag." },
    [
      (x) => segChaos(x, 640, 63, 3409),
      (x, sp) => segMix(x, 6, 328, 92, 380, 366, 1.65, sp, "top"),
      (x) => segCorridor(x, 540, 206),
      (x) => segZigzag(x, 4, 328, 128, 388, "bottom"),
    ]
  ),
  // L10 — the gauntlet of gauntlets (moving spikes live in the mix section).
  composeLevel(
    { name: "Overload", diff: 3, subtitle: "Everything, all at once", speed: 217,
      hint: "Every trick in the game, back to back. Trust the rhythm and don't stop!",
      deco: { bg: "grid", finale: [shake(3, 1.0), pulse("#ff3b3b", 3, 1.2), particles(GOLD, 6)] } },
    [
      (x) => segCorridor(x, 520, 204),
      (x, sp) => segMix(x, 5, 328, 90, 392, 372, 1.5, sp, "bottom"),
      (x) => segZigzag(x, 5, 322, 128, 398, "top"),
      (x) => segChaos(x, 700, 60, 3510),
    ]
  ),

  // ----------------------------------------------------------------------
  // LEVELS 11–20 — the MOVING GATE journeys. A new mechanic (purple gates
  // whose hole slides up and down) is introduced and then woven together
  // with every earlier mechanic, ramping to the hardest levels in the game.
  // ----------------------------------------------------------------------

  // L11 — gentle introduction to gates: big holes, slow, with a corridor warmup.
  composeLevel(
    { name: "Gateway", deco: { bg: "nebula" }, diff: 2, subtitle: "Ride the moving hole", speed: 196,
      hint: "PURPLE gates slide up and down — fly through the moving hole!" },
    [
      (x) => segCorridor(x, 460, 170),
      (x, sp) => segGates(x, 6, 300, 72, 86, 64, 3.4, sp),
      (x, sp) => segGates(x, 6, 285, 72, 82, 82, 3.2, sp),
    ]
  ),
  // L12 — gates + the big climb-and-dive zig-zag.
  composeLevel(
    { name: "Slipstream", deco: { bg: "grid" }, diff: 3, subtitle: "Gates meet the zig-zag", speed: 200,
      hint: "Surf the gates, then climb and dive the big spikes." },
    [
      (x, sp) => segGates(x, 6, 290, 72, 80, 80, 3.2, sp),
      (x) => segZigzag(x, 4, 330, 128, 360, "bottom"),
      (x, sp) => segGates(x, 6, 280, 72, 78, 92, 3.0, sp),
    ]
  ),
  // L13 — gates woven with jagged chaos.
  composeLevel(
    { name: "Tide", deco: { bg: "nebula" }, diff: 3, subtitle: "Gates in the chaos", speed: 203,
      hint: "Read the chaos, then surf the rising and falling gate." },
    [
      (x) => segChaos(x, 560, 74, 4101),
      (x, sp) => segGates(x, 7, 280, 70, 78, 96, 3.0, sp),
      (x) => segCorridor(x, 460, 184),
    ]
  ),
  // L14 — TWO moving mechanics at once: amber pistons and purple gates.
  composeLevel(
    { name: "Twin Engines", deco: { bg: "grid" }, diff: 4, subtitle: "Pistons and gates", speed: 205,
      hint: "Amber pistons AND purple gates now — both move. Stay calm and read ahead." },
    [
      (x, sp) => segPistons(x, 4, 340, 90, 330, 2.2, sp, "launching"),
      (x, sp) => segGates(x, 7, 275, 70, 76, 100, 2.9, sp),
      (x, sp) => segGates(x, 6, 275, 70, 76, 104, 2.85, sp),
    ]
  ),
  // L15 — tighter holes, bigger swings, plus a razor zig-zag.
  composeLevel(
    { name: "Undertow", deco: { bg: "nebula" }, diff: 4, subtitle: "Tighter, faster gates", speed: 208,
      hint: "Tighter holes, bigger swings. Anticipate the hole — don't chase it." },
    [
      (x, sp) => segGates(x, 8, 270, 68, 74, 108, 2.8, sp),
      (x) => segZigzag(x, 5, 320, 128, 380, "top"),
      (x, sp) => segGates(x, 7, 265, 68, 72, 112, 2.75, sp),
    ]
  ),
  // L16 — the whole toolbox in one run.
  composeLevel(
    { name: "Everything Wave", deco: { bg: "grid" }, diff: 5, subtitle: "The whole toolbox", speed: 210,
      hint: "Corridor, gates, mixed spikes, chaos — all of it, in one breath." },
    [
      (x) => segCorridor(x, 460, 196),
      (x, sp) => segGates(x, 7, 265, 66, 72, 112, 2.75, sp),
      (x, sp) => segMix(x, 5, 330, 92, 372, 360, 1.7, sp, "bottom"),
      (x) => segChaos(x, 560, 66, 4106),
    ]
  ),
  // L17 — fast gate waves squeezed between walls.
  composeLevel(
    { name: "Crosscurrent", deco: { bg: "nebula" }, diff: 5, subtitle: "Fast gates, tight walls", speed: 212,
      hint: "Fast gates between the walls. Find the rhythm and ride it." },
    [
      (x) => segChaos(x, 600, 64, 4107),
      (x, sp) => segGates(x, 8, 260, 66, 70, 116, 2.65, sp),
      (x, sp) => segMix(x, 6, 322, 92, 380, 366, 1.6, sp, "top"),
      (x, sp) => segGates(x, 6, 258, 66, 70, 116, 2.6, sp),
    ]
  ),
  // L18 — no safe stretch: gates, zig-zag, pistons, gates.
  composeLevel(
    { name: "Riptide", deco: { bg: "nebula" }, diff: 6, subtitle: "No safe stretch", speed: 214,
      hint: "Gates, razor zig-zag, pistons — then gates again. Never freeze." },
    [
      (x, sp) => segGates(x, 8, 256, 64, 68, 120, 2.6, sp),
      (x) => segZigzag(x, 5, 318, 128, 390, "bottom"),
      (x, sp) => segPistons(x, 5, 320, 88, 348, 1.75, sp, "falling"),
      (x, sp) => segGates(x, 7, 254, 64, 68, 122, 2.55, sp),
    ]
  ),
  // L19 — everything, at speed.
  composeLevel(
    { name: "Maelstrom", deco: { bg: "nebula" }, diff: 6, subtitle: "Everything, at speed", speed: 216,
      hint: "Everything at speed. Trust your reads and don't freeze." },
    [
      (x) => segChaos(x, 640, 62, 4109),
      (x, sp) => segGates(x, 9, 252, 64, 66, 122, 2.55, sp),
      (x, sp) => segMix(x, 6, 320, 92, 392, 372, 1.5, sp, "bottom"),
      (x, sp) => segGates(x, 7, 250, 64, 66, 124, 2.5, sp),
    ]
  ),
  // L20 — the final gauntlet: every mechanic, all at once.
  composeLevel(
    { name: "Event Horizon", diff: 7, subtitle: "The final gauntlet", speed: 220,
      hint: "Every mechanic, all at once. This is the end of the line — good luck, pilot!",
      // crossing the horizon: the stars go out and everything fades to black
      deco: { bg: "stars", finale: [background("void"), fade("#ffffff", "#000000", 1.5), pulse("#ffffff", 2, 1.5), particles(GOLD, 6)] } },
    [
      (x) => segCorridor(x, 440, 206),
      (x, sp) => segGates(x, 9, 248, 62, 64, 124, 2.5, sp),
      (x) => segZigzag(x, 5, 314, 128, 400, "top"),
      (x, sp) => segMix(x, 6, 316, 90, 396, 376, 1.45, sp, "bottom"),
      (x, sp) => segGates(x, 8, 246, 62, 64, 126, 2.45, sp),
      (x) => segChaos(x, 640, 60, 4120),
    ]
  ),

  // ----------------------------------------------------------------------
  // LEVELS 21–25 — beyond the Event Horizon. Two new mechanics, GRAVITY
  // PORTALS (blue flips you upside down, gold flips you back) and SPINNERS
  // (blades sweeping circles out of the walls and through corridors), are
  // layered over every earlier trick. The last three are Extreme Demons.
  // ----------------------------------------------------------------------

  // L21 — gravity portals: a flipped corridor, a flipped zig-zag, then portals between spikes.
  composeLevel(
    { name: "Flipside", deco: { bg: "nebula" }, diff: 7, subtitle: "Gravity portals", speed: 222,
      hint: "BLUE portals flip gravity: you fall UP! Hold to dive, release to climb." },
    [
      (x) => segCorridor(x, 440, 200),
      withFlip((x) => segCorridor(x, 560, 198)),
      (x, sp) => segGates(x, 8, 250, 62, 64, 124, 2.5, sp),
      withFlip((x) => segZigzag(x, 5, 316, 128, 396, "top")),
      (x) => segChaos(x, 600, 62, 5101),
      (x) => segFlipZig(x, 5, 320, 128, 392, "bottom"),
    ]
  ),
  // L22 — spinners: wall blades to slip past, then two-bladed hubs in a corridor.
  composeLevel(
    { name: "Buzzsaw", deco: { bg: "grid" }, diff: 7, subtitle: "Spinning blades", speed: 224,
      hint: "Spinning blades! Slip past while the blade is buried in the wall." },
    [
      (x) => segCorridor(x, 440, 204),
      (x, sp) => segSawWall(x, 4, 500, 260, 3.0, sp, 300, true),
      (x, sp) => segMix(x, 6, 316, 90, 396, 376, 1.45, sp, "bottom"),
      (x, sp) => segSawCorridor(x, 4, 280, 110, 2.2, sp, 150, 270, false),
      (x, sp) => segGates(x, 8, 246, 62, 64, 126, 2.45, sp),
    ]
  ),
  // L23 — portals everywhere: flipped gates, a portal after every spike, flipped chaos.
  composeLevel(
    { name: "Vertigo", deco: { bg: "nebula" }, diff: 8, subtitle: "Which way is down?", speed: 226,
      hint: "Portals everywhere. Which way is down? Keep count, or you'll fall up!" },
    [
      (x, sp) => segGates(x, 6, 248, 62, 64, 126, 2.45, sp),
      withFlip((x, sp) => segGates(x, 7, 246, 62, 64, 126, 2.45, sp)),
      (x) => segFlipZig(x, 7, 314, 128, 398, "top"),
      withFlip((x) => segChaos(x, 620, 61, 5303)),
      withFlip((x, sp) => segMix(x, 6, 316, 90, 396, 376, 1.45, sp, "bottom")),
    ]
  ),
  // L24 — spinners at speed: read the spin, pick the side, hug the tips.
  composeLevel(
    { name: "Sawmill", deco: { bg: "grid" }, diff: 8, subtitle: "Ride with the spin", speed: 228,
      hint: "Ride WITH the spin: pass on the side where the blade moves your way." },
    [
      (x, sp) => segSawCorridor(x, 5, 270, 112, 2.1, sp, 152, 270, true),
      (x, sp) => segPistons(x, 5, 316, 88, 350, 1.7, sp, "falling"),
      (x, sp) => segSawWall(x, 5, 480, 262, 2.9, sp, 304, false),
      (x, sp) => segGates(x, 9, 244, 62, 62, 128, 2.4, sp),
      (x) => segZigzag(x, 5, 312, 128, 402, "bottom"),
      (x, sp) => segSawCorridor(x, 4, 260, 114, 2.0, sp, 156, 270, false),
    ]
  ),
  // L25 — the singularity: every mechanic in the game, some of it upside down.
  composeLevel(
    { name: "Singularity", diff: 8, subtitle: "The edge of the universe", speed: 230,
      hint: "Everything. All of it. Upside down. This is the edge of the universe.",
      // the singularity: a white flash, a long rumble, then black
      deco: { bg: "void", finale: [fade("#ffffff", "#000000", 1.2), shake(4, 1.5), pulse("#ffffff", 4, 1.5), particles("#ffffff", 8)] } },
    [
      (x) => segCorridor(x, 420, 208),
      withFlip((x, sp) => segGates(x, 8, 244, 62, 62, 128, 2.4, sp)),
      (x, sp) => segSawCorridor(x, 4, 270, 112, 2.1, sp, 154, 270, true),
      (x, sp) => segMix(x, 6, 314, 90, 398, 378, 1.4, sp, "top"),
      withFlip((x) => segChaos(x, 600, 58, 5505)),
      (x, sp) => segSawWall(x, 4, 480, 264, 2.8, sp, 306, true),
      (x) => segFlipZig(x, 5, 310, 128, 404, "bottom"),
      (x, sp) => segGates(x, 9, 242, 60, 62, 128, 2.4, sp),
    ]
  ),

  // ----------------------------------------------------------------------
  // LEVELS 26–30 — past the Singularity. Three new mechanics, one per level,
  // then two levels that throw all of them (and everything before) at you:
  // WIND ZONES (26), BLOCKS (27) and MINI PORTALS (28).
  // ----------------------------------------------------------------------

  // L26 — wind zones: updrafts and downdrafts over familiar ground.
  composeLevel(
    { name: "Tailwind", diff: 7, subtitle: "Updrafts and downdrafts", speed: 232,
      hint: "WIND ZONES push your ship — cyan lifts you, amber drops you. Lean against the wind!",
      deco: { bg: "nebula" } },
    [
      (x) => segCorridor(x, 420, 200),
      withWind((x) => segCorridor(x, 560, 196), -450),
      (x, sp) => segGates(x, 8, 250, 62, 64, 124, 2.5, sp),
      withWind((x) => segZigzag(x, 5, 316, 128, 396, "bottom"), 450),
      (x) => segChaos(x, 600, 62, 6101),
      withWind((x, sp) => segMix(x, 6, 316, 90, 396, 376, 1.45, sp, "bottom"), -550),
      withWind((x) => segCorridor(x, 520, 204), 600),
      withFlip(withWind((x) => segZigzag(x, 5, 316, 128, 396, "top"), -500)),
    ]
  ),
  // L27 — blocks: weave them, climb their stairs, ride their tunnel.
  composeLevel(
    { name: "Blockade", diff: 7, subtitle: "Weave the blocks", speed: 234,
      hint: "BLOCKS float in the way. Fly over or under — never through!",
      deco: { bg: "grid" } },
    [
      (x) => segCorridor(x, 420, 204),
      (x) => segBlockWeave(x, 6, 300, 90, 160, 100, true),
      (x, sp) => segMix(x, 6, 316, 90, 396, 376, 1.45, sp, "bottom"),
      (x) => segBlockStairs(x, 5, 90, 55, 130, 110, true),
      (x) => segBlockTunnel(x, 12, 100, 130, 120),
      withWind((x) => segBlockWeave(x, 6, 290, 90, 164, 96, false), -500),
      (x, sp) => segSawCorridor(x, 4, 270, 112, 2.1, sp, 154, 270, true),
      (x) => segBlockWeave(x, 7, 280, 100, 170, 90, true),
    ]
  ),
  // L28 — mini portals: shrink for the needle's eye, grow back, repeat.
  composeLevel(
    { name: "Shrink Ray", diff: 8, subtitle: "Small ship, small gaps", speed: 236,
      hint: "PINK portals shrink your ship. Squeeze through the tight bits — GREEN grows you back.",
      deco: { bg: "grid" } },
    [
      (x) => segCorridor(x, 420, 208),
      withMini((x) => segCorridor(x, 560, 226)),
      (x, sp) => segGates(x, 8, 246, 62, 64, 126, 2.45, sp),
      withMini((x) => segZigzag(x, 5, 300, 128, 440, "bottom")),
      (x) => segChaos(x, 600, 62, 6303),
      withMini((x) => segBlockWeave(x, 6, 260, 80, 200, 56, true)),
      withMini((x, sp) => segSawCorridor(x, 4, 260, 112, 2.0, sp, 170, 270, false)),
      (x, sp) => segSawWall(x, 4, 480, 264, 2.8, sp, 306, true),
      withMini(withFlip((x) => segCorridor(x, 500, 224))),
    ]
  ),
  // L29 — the storm: wind, blocks and mini portals stacked on everything else.
  composeLevel(
    { name: "Tempest", diff: 8, subtitle: "Wind, blocks and tiny ships", speed: 238,
      hint: "Wind, blocks, shrinking, flipping — the storm has everything. Stay loose!",
      deco: { bg: "nebula" } },
    [
      withWind((x, sp) => segGates(x, 8, 246, 62, 64, 126, 2.45, sp), -500),
      withMini((x) => segBlockWeave(x, 6, 260, 80, 200, 60, false)),
      withFlip(withWind((x) => segCorridor(x, 540, 206), 550)),
      (x, sp) => segSawCorridor(x, 4, 270, 112, 2.1, sp, 154, 270, true),
      withMini(withWind((x) => segZigzag(x, 5, 316, 128, 420, "top"), -350)),
      withWind((x) => segBlockStairs(x, 5, 90, 60, 120, 120, false), 500),
      (x) => segBlockTunnel(x, 14, 100, 120, 140),
      (x) => segFlipZig(x, 5, 310, 128, 404, "bottom"),
      withWind((x, sp) => segMix(x, 6, 314, 90, 398, 378, 1.4, sp, "top"), 600),
    ]
  ),
  // L30 — the last level: every mechanic in the game, at full speed.
  composeLevel(
    { name: "Omega", diff: 8, subtitle: "The last level", speed: 240,
      hint: "Every mechanic in the game, at full speed. Beat this and you're a legend.",
      // the end of everything: a white-out, a long rumble, gold rain
      deco: { bg: "void", finale: [fade("#ffffff", "#000000", 1.2), shake(4, 1.5), pulse("#ffd166", 4, 1.5), particles("#ffd166", 10)] } },
    [
      (x) => segCorridor(x, 400, 210),
      withMini(withFlip((x) => segCorridor(x, 560, 228))),
      withWind((x, sp) => segGates(x, 9, 242, 60, 62, 128, 2.4, sp), 550),
      (x, sp) => segSawCorridor(x, 4, 270, 112, 2.1, sp, 154, 270, false),
      (x) => segBlockTunnel(x, 14, 100, 112, 140),
      withMini((x) => segChaos(x, 560, 42, 6505)),
      withWind((x) => segBlockStairs(x, 5, 84, 50, 120, 110, true), -600),
      withFlip(withMini((x) => segZigzag(x, 5, 300, 128, 444, "bottom"))),
      withWind((x) => segBlockWeave(x, 7, 270, 90, 170, 90, true), 500),
      (x) => segFlipZig(x, 5, 310, 128, 404, "top"),
      withMini(withWind((x) => segCorridor(x, 500, 228), -500)),
    ]
  ),
];

window.LEVELS = LEVELS;
window.LEVEL_LIB = { spikeRow, makeRng, piston, spinner, withFlip, segCorridor, segZigzag, segChaos, segPistons, segMix, segGates, segFlipZig, segSawWall, segSawCorridor, composeLevel,
  withWind, withMini, block, segBlockWeave, segBlockStairs, segBlockTunnel, MINI,
  deco: { at, atEach, decorations, fade, shake, pulse, particles, background, look, LOOK, FINALE } };
