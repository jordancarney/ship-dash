/*
 * Ship Dash — extra worlds: TEMPLES and the MAP.
 *
 * Built from the same segment library as the main levels (js/levels.js), so
 * every world is hand-arranged: each level lists its sections in order and
 * composeLevel() stitches them together with transition gaps.
 *
 *   TEMPLES  — 3 temples of 5 levels each. Every temple starts easy and ramps
 *              up; later temples start harder. Cleared temple levels unlock
 *              the next one in that temple.
 *   MAP      — a trail of 5 levels then a DUNGEON, one trail per difficulty
 *              tier. Only the Easy trail exists so far; add more to MAP.
 *
 * Parameter ranges stay inside what the main levels already use (those were
 * verified beatable), so a new level here is as fair as the originals.
 */
(function () {
  "use strict";
  const L = window.LEVEL_LIB;
  const { segCorridor, segZigzag, segChaos, segPistons, segMix, segGates, composeLevel } = L;

  // shorthand section builders (x = start, sp = level speed)
  const corr  = (len, h)                       => (x) => segCorridor(x, len, h);
  const zig   = (n, gap, h, dir)               => (x) => segZigzag(x, n, gap, 128, h, dir);
  const chaos = (len, hwc, seed)               => (x) => segChaos(x, len, hwc, seed);
  const pist  = (n, gap, len, per, dir)        => (x, sp) => segPistons(x, n, gap, 90, len, per, sp, dir);
  const mix   = (n, gap, h, len, per, dir)     => (x, sp) => segMix(x, n, gap, 92, h, len, per, sp, dir);
  const gates = (n, gapX, gap, amp, per)       => (x, sp) => segGates(x, n, gapX, 70, gap, amp, per, sp);

  const lvl = (name, subtitle, diff, speed, hint, secs) =>
    composeLevel({ name, subtitle, diff, speed, hint }, secs);

  const TEMPLES = [
    {
      id: "dawn", name: "Temple of Dawn", icon: "🌅",
      desc: "A gentle climb. Learn the ropes, then earn your wings.",
      levels: [
        lvl("First Light", "Warm-up corridor", 0, 200, "Hold the line through the corridor. Easy does it!",
          [corr(700, 150), corr(600, 165)]),
        lvl("Morning Glow", "Corridor and a zig-zag", 0, 205, "Steady first, then climb and dive the big spikes.",
          [corr(600, 160), zig(4, 340, 350, "bottom")]),
        lvl("Sunrise Steps", "Bigger climbs", 1, 205, "Climb over, dive under — keep the rhythm.",
          [zig(4, 340, 360, "top"), corr(560, 176), zig(3, 340, 370, "bottom")]),
        lvl("Daybreak", "First moving spikes", 1, 203, "AMBER spikes rise to meet you. Time your passes!",
          [corr(520, 170), pist(4, 370, 320, 2.3, "launching"), zig(3, 340, 360, "top")]),
        lvl("High Noon", "The temple's trial", 1, 207, "Everything the temple taught you, back to back.",
          [corr(560, 180), pist(4, 360, 330, 2.2, "falling"), chaos(540, 76, 7101), zig(4, 336, 366, "bottom")]),
      ],
    },
    {
      id: "storms", name: "Temple of Storms", icon: "⛈️",
      desc: "Wind, gates and pistons. Starts hard, ends ultra.",
      levels: [
        lvl("Gust", "Pistons in the wind", 2, 205, "Launchers and fallers, back to back. Read them early.",
          [pist(5, 350, 345, 2.0, "launching"), corr(520, 190), pist(4, 345, 350, 1.95, "falling")]),
        lvl("Squall", "Gates in the rain", 2, 203, "PURPLE gates slide — ride the moving hole.",
          [corr(460, 180), gates(6, 295, 84, 70, 3.3), zig(4, 334, 372, "bottom")]),
        lvl("Thunderhead", "Chaos and gates", 3, 207, "Weave the chaos, then surf the gates.",
          [chaos(600, 68, 7203), gates(7, 280, 78, 96, 3.0), mix(5, 340, 360, 356, 1.85, "top")]),
        lvl("Lightning Run", "Fast pistons, tight gates", 3, 211, "Faster now. Anticipate the hole — don't chase it.",
          [gates(7, 272, 74, 104, 2.85), mix(6, 330, 376, 366, 1.65, "bottom"), gates(6, 270, 74, 106, 2.8)]),
        lvl("Eye of the Storm", "The temple's trial", 4, 213, "Every storm mechanic at once. Stay calm in the eye.",
          [corr(480, 200), gates(8, 265, 70, 112, 2.75), zig(5, 320, 386, "top"), mix(6, 324, 386, 370, 1.55, "bottom"), chaos(600, 63, 7205)]),
      ],
    },
    {
      id: "shadows", name: "Temple of Shadows", icon: "🌑",
      desc: "Demons only. Fast, tight, and unforgiving.",
      levels: [
        lvl("Dusk", "Demon gates", 4, 212, "Tight gates with big swings. Welcome to the shadows.",
          [gates(8, 262, 68, 116, 2.65), corr(500, 200), gates(7, 258, 68, 118, 2.6)]),
        lvl("Nightfall", "Chaos in the dark", 5, 214, "Chaos, gates, a razor zig-zag. No safe stretch.",
          [chaos(640, 62, 7301), gates(8, 256, 66, 120, 2.6), zig(5, 318, 392, "bottom")]),
        lvl("Witching Hour", "Pistons and gates, fast", 6, 216, "Fast pistons, fast gates. Trust your reads.",
          [pist(5, 320, 350, 1.7, "falling"), gates(9, 252, 64, 122, 2.55), mix(6, 320, 392, 372, 1.5, "top")]),
        lvl("Abyss", "Everything, faster", 7, 218, "The abyss stares back. Every mechanic, at speed.",
          [corr(440, 206), gates(9, 248, 64, 124, 2.5), zig(5, 314, 400, "top"), mix(6, 318, 396, 376, 1.45, "bottom"), chaos(640, 60, 7304)]),
        lvl("Shadow King", "The temple's trial", 7, 220, "The final shadow. Good luck, pilot.",
          [chaos(600, 60, 7305), gates(9, 246, 62, 126, 2.45), mix(6, 316, 396, 376, 1.45, "top"), gates(8, 246, 62, 126, 2.45), zig(5, 314, 400, "bottom"), corr(440, 206)]),
      ],
    },
  ];

  // MAP: one trail per difficulty tier — 5 levels then a DUNGEON.
  const MAP = [
    {
      diff: 0, name: "Easy Trail",
      levels: [
        lvl("Trailhead", "Map · Easy 1", 0, 200, "Follow the trail. Tap to hover, hold to climb.",
          [corr(640, 150)]),
        lvl("Meadow", "Map · Easy 2", 0, 202, "Climb over the tall spikes, dive under the hanging ones.",
          [zig(4, 345, 345, "bottom")]),
        lvl("Creek", "Map · Easy 3", 0, 204, "Corridor, then a zig-zag. Keep your rhythm.",
          [corr(560, 160), zig(4, 340, 355, "top")]),
        lvl("Old Bridge", "Map · Easy 4", 0, 204, "A little chaos — read the gaps and weave.",
          [corr(500, 165), chaos(520, 80, 8104)]),
        lvl("Hilltop", "Map · Easy 5", 0, 206, "Amber spikes move! Time your passes.",
          [zig(3, 340, 355, "bottom"), pist(4, 370, 315, 2.3, "launching"), corr(500, 170)]),
        lvl("The Dungeon", "Map · Easy Dungeon", 1, 207, "The dungeon! Everything on the trail, all in one run.",
          [corr(560, 172), zig(4, 338, 362, "top"), pist(4, 360, 325, 2.25, "falling"), chaos(560, 76, 8106), zig(4, 338, 366, "bottom"), corr(520, 180)],
          ),
      ],
    },
  ];
  MAP[0].levels[5].dungeon = true;

  window.TEMPLES = TEMPLES;
  window.MAP = MAP;
})();
