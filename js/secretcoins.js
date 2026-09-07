/*
 * Ship Dash — SECRET COIN positions for the built-in levels.
 *
 * One secret coin per level, keyed "packId:levelIndex". Every spot here was
 * checked with a headless solver (scratch tool, 2026-09-07) that searches all
 * hold/release inputs frame by frame: the ship can grab the coin AND still
 * reach the finish. The coins sit off the normal line — hugging a wall, a
 * spike tip, or the very top/bottom of an open stretch — so they're a detour.
 *
 * If a level's obstacles change, re-run the solver and update its entry.
 */
(function () {
  "use strict";
  const T = {
    "main:0": { x: 784, y: 333 },
    "main:1": { x: 2161, y: 118 },
    "main:2": { x: 2190, y: 511 },
    "main:3": { x: 3293, y: 498 },
    "main:4": { x: 1484, y: 273 },
    "main:5": { x: 2983, y: 498 },
    "main:6": { x: 2584, y: 231 },
    "main:7": { x: 2076, y: 304 },
    "main:8": { x: 2057, y: 498 },
    "main:9": { x: 1520, y: 404 },
    "main:10": { x: 1313, y: 498 },
    "main:11": { x: 3901, y: 42 },
    "main:12": { x: 1965, y: 498 },
    "main:13": { x: 3370, y: 138 },
    "main:14": { x: 3834, y: 498 },
    "main:15": { x: 2651, y: 29 },
    "main:16": { x: 3010, y: 511 },
    "main:17": { x: 4713, y: 498 },
    "main:18": { x: 4567, y: 498 },
    "main:19": { x: 4260, y: 29 },
    "temple.dawn:0": { x: 624, y: 348 },
    "temple.dawn:1": { x: 1018, y: 42 },
    "temple.dawn:2": { x: 2720, y: 42 },
    "temple.dawn:3": { x: 2143, y: 29 },
    "temple.dawn:4": { x: 1769, y: 511 },
    "temple.storms:0": { x: 1632, y: 42 },
    "temple.storms:1": { x: 1632, y: 42 },
    "temple.storms:2": { x: 3146, y: 511 },
    "temple.storms:3": { x: 2289, y: 122 },
    "temple.storms:4": { x: 2169, y: 132 },
    "temple.shadows:0": { x: 1451, y: 148 },
    "temple.shadows:1": { x: 3746, y: 498 },
    "temple.shadows:2": { x: 5192, y: 29 },
    "temple.shadows:3": { x: 4567, y: 511 },
    "temple.shadows:4": { x: 3715, y: 42 },
    "map.0:0": { x: 375, y: 348 },
    "map.0:1": { x: 1155, y: 153 },
    "map.0:2": { x: 1319, y: 397 },
    "map.0:3": { x: 975, y: 498 },
    "map.0:4": { x: 2420, y: 29 },
    "map.0:5": { x: 3472, y: 42 },
  };
  function apply(levels, prefix) {
    (levels || []).forEach((l, i) => { const c = T[prefix + ":" + i]; if (c) l.coins = [{ x: c.x, y: c.y }]; });
  }
  apply(window.LEVELS, "main");
  (window.TEMPLES || []).forEach((t) => apply(t.levels, "temple." + t.id));
  (window.MAP || []).forEach((m) => apply(m.levels, "map." + m.diff));
  window.SECRET_COINS = T;
})();
