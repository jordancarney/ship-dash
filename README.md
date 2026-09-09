# 🚀 Ship Dash

### ▶ [Play it](https://jordancarney.github.io/ship-dash/)

A game my kid is making, inspired by Geometry Dash. Fly the ship, dodge the spikes, reach
the end. Controls are shown on screen, so there's nothing to memorize.

## Features

- 30 hand-built levels that ramp from gentle to unforgiving. Levels 21–25 add two new
  mechanics: gravity portals (blue flips you upside down, gold flips you back) and spinners
  (blades that sweep out of the walls and through corridors). Levels 26–30 add three more:
  wind zones (updrafts and downdrafts that push the ship), blocks (crates you fly over or
  under, never through) and mini portals (pink shrinks your ship so it fits through tiny
  gaps, green grows it back)
- Coins 🪙 for clearing levels — spend them on 27 ships and 8 trails (rainbow ribbon, fire,
  stardust, lightning, ghostly echoes, bubbles, confetti, hearts) that follow your ship, and
  don't miss the daily chest. The Dolphin and the Platypus are the grand prizes at 1000 coins
  each, on a row of their own
- A built-in level creator: place spikes, pistons, gates, spinners, gravity portals, blocks,
  wind zones and mini portals, resize them, test instantly, and play your own. A big Geometry-Dash-style knob scrolls through the
  level — easy to grab on an iPad
- Decoration triggers in the creator: shake, pulse, speed, particles, spike and background
  colors, background styles, fades, and a stop trigger
- Every main level is decorated with those same triggers, and each mechanic has its own look:
  cyan corridors, lime zig-zags, red chaos with a rumble and embers, an amber glow for
  pistons, a violet pulse for gates, steel and sparks for spinners, and the whole world turns
  blue while gravity is flipped. Backgrounds change by world and every finish sparkles gold
- Nine difficulty ratings, each with its own face: Easy, Hard, Insane, Ultra, and the five Demons
  up to Extreme Demon
- More worlds behind the ➕ button: three Temples (five levels each, easy to brutal), a Map
  trail with a Dungeon at the end, Races against a rival bot, and Straight Fly
- Search every level by name, 5-character level ID, or difficulty face, newest first, with the
  newest level spotlighted at the top
- Settings: pick a name for racing (names can't be changed afterwards), and toggle the
  percentage bar and readout
- Debug mode (Settings → Debug): unlimited coins and every level, ship and trail unlocked, for
  testing. Nothing earned in debug mode is saved, and it never touches real progress
- A secret coin in every level, tucked off the main line; grab it and finish the level to bank a
  bonus. Every built-in coin is checked reachable by a headless search. The creator has a Secret
  Coin tool so your own levels can hide one too
- Noclip and Practice modes in the pause menu to explore a level (fly through spikes, or respawn
  at checkpoints with C). Clears made with either never count
- Procedurally synthesized music, a different beat per level, ramping from bright and
  friendly to dark and driving as the levels get harder

## Built with

Vanilla JavaScript and HTML5 Canvas. No dependencies, no build step, no asset files — the
levels, the art and the music are all generated in code.

## Run locally

**Easiest:** double-click `index.html`. That's it.

**Or serve it** (closer to how it runs in production):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploys

The repo root is the site — no build step, no dependencies:

1. Push to `main`.
2. Repo **Settings → Pages → Source**: deploy from a branch, `main`, `/ (root)`.
3. The game is live at https://jordancarney.github.io/ship-dash/.

Every push to `main` publishes automatically. All asset paths are relative, so it works
from a subpath like `/ship-dash/` without configuration. The `.nojekyll` file tells Pages
to publish the files as-is instead of running them through Jekyll.

### Releasing an update

**Bump the `?v=` value on the `<link>`/`<script>` tags in `index.html` whenever anything in
`css/` or `js/` changes** (today's date works). Pages caches files in browsers for 10
minutes, so without a bump, returning players can get the new HTML with the *old* scripts
and styles — half-broken pages, ghost UI. The version tag forces every browser to fetch
matching files.

## Project layout

```
index.html      Markup for the game + all menu/overlay screens
css/style.css   All styling
js/levels.js    Level definitions (+ the segment library and the portal / spinner builders)
js/worlds.js    Temples and the Map, built from the same segments
js/difficulty.js  The nine difficulty faces
js/secretcoins.js Where each built-in level hides its secret coin
js/music.js     Procedural per-level music
js/ships.js     Shared vector ship art and animation
js/trails.js    Trail effects that follow the ship
js/game.js      Game engine (physics, rendering, input, saves)
```

Progress and your created levels are saved in `localStorage`.
