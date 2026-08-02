# 🚀 Ship Dash

### ▶ [Play it](https://jordancarney.github.io/ship-dash/)

A game my kid is making, inspired by Geometry Dash. Fly the ship. Dodge the spikes.
Reach the end. Pure vanilla JavaScript + HTML5 Canvas. No dependencies, no build
step — the levels, the art and the music are all generated in code.

## Features

- 20 hand-built levels, ramping from gentle to unforgiving
- Coins 🪙 for clearing levels — spend them on new ships, and don't miss the daily chest
- A level creator, so you can build and play your own
- Every level plays its own synthesized beat (no audio files — it's all WebAudio),
  ramping from bright and friendly to dark and driving as the levels get harder

## Controls

| Action | Input |
| --- | --- |
| Thrust up | Hold `SPACE` / click / tap |
| Hover level | Tap rapidly |
| Fall | Release |
| Pause | `P` / `ESC` |
| Retry level | `R` |
| Mute | `M` |

## Level creator

Hit **✏️ Create** on the home screen to build your own levels. Name your
level, set its length, and click to place any spike in the game — floor and
ceiling spikes, moving launchers and fallers, and sliding gates — then resize
them with the sliders. Everything autosaves, **▶ Test** flies it instantly,
and your levels live on the My Levels screen.

## Run locally

No build step, no dependencies.

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

Every push to `main` publishes automatically. All asset paths are relative, so it
works from a subpath like `/ship-dash/` without configuration. The `.nojekyll` file
tells Pages to publish the files as-is instead of running them through Jekyll.

### Releasing an update

**Bump the `?v=` value on the `<link>`/`<script>` tags in `index.html` whenever
anything in `css/` or `js/` changes** (today's date works). Pages caches files in
browsers for 10 minutes, so without a bump, returning players can get the new HTML
with the *old* scripts and styles — half-broken pages, ghost UI. The version tag
forces every browser to fetch matching files.

## Project layout

```
index.html      Markup for the game + all menu/overlay screens
css/style.css   All styling
js/levels.js    Level definitions
js/music.js     Procedural per-level music (WebAudio beats, no audio files)
js/game.js      Game engine (physics, rendering, input, saves)
```

Progress (unlocked levels, coins, owned ships) and your created levels are
saved in `localStorage`.
