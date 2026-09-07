# 🚀 Ship Dash

### ▶ [Play it](https://jordancarney.github.io/ship-dash/)

A game my kid is making, inspired by Geometry Dash. Fly the ship, dodge the spikes, reach
the end. Controls are shown on screen, so there's nothing to memorize.

## Features

- Hand-built levels that ramp from gentle to unforgiving
- Coins 🪙 for clearing levels — spend them on new ships, and don't miss the daily chest
- A built-in level creator: place obstacles, resize them, test instantly, and play your own
- Decoration triggers in the creator: shake, pulse, speed, particles, spike and background
  colors, background styles, fades, and a stop trigger
- Eight difficulty ratings, each with its own face: Easy, Hard, Insane, Ultra, and the four Demons
- More worlds behind the ➕ button: three Temples (five levels each, easy to brutal), a Map
  trail with a Dungeon at the end, Races against a rival bot, and Straight Fly
- Search every level by name, 5-character level ID, or difficulty face, newest first, with the
  newest level spotlighted at the top. Share a level as a link: beat your own level, post it,
  and a friend opens the link (or pastes it into Search) to get the level
- Pick a name once in Settings; names can't be changed afterwards
- Settings: pick a name for posting and racing, and toggle the percentage bar and readout
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
js/levels.js    Level definitions
js/music.js     Procedural per-level music
js/game.js      Game engine (physics, rendering, input, saves)
```

Progress and your created levels are saved in `localStorage`.
