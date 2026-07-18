# Ship Dash 🚀

A game my kid is making, inspired by Geometry Dash.

**Play it: https://jordan-carney.com/ship-dash/**

Fly the ship. Dodge the spikes. Reach the end.

## Controls

| Input | Action |
| --- | --- |
| Hold `SPACE` / click / tap | Thrust up |
| Tap rapidly | Hover level |
| Release | Fall |
| `P` / `ESC` | Pause |
| `R` | Retry level |
| `M` | Mute |

Clearing levels earns coins 🪙 — spend them on new ships, and don't miss the daily chest.

Every level plays its own synthesized beat (no audio files — it's all WebAudio), ramping from bright and friendly to dark and driving as the levels get harder.

## Level creator

Hit **✏️ Create** on the home screen to build your own levels. Name your
level, set its length, and click to place any spike in the game — floor and
ceiling spikes, moving launchers and fallers, and sliding gates — then resize
them with the sliders. Everything autosaves, **▶ Test** flies it instantly,
and your levels live on the My Levels screen.

## Run it locally

No build step, no dependencies — it's vanilla HTML5 Canvas.

**Easiest:** double-click `index.html`. That's it.

**Or serve it** (closer to how it runs in production):

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploys

GitHub Pages serves the `main` branch as-is ("Deploy from a branch" in
Settings → Pages). Every push to `main` publishes automatically — there is
no build step. The `.nojekyll` file tells Pages to skip its default Jekyll
processing.

**When you change anything in `css/` or `js/`, bump the `?v=` value on the
`<link>`/`<script>` tags in `index.html`** (today's date works). Pages caches
files in browsers for 10 minutes, so without a bump, returning players can get
the new HTML with the *old* scripts and styles — half-broken pages, ghost UI.
The version tag forces every browser to fetch matching files.

## Project layout

```
index.html     Markup for the game + all menu/overlay screens
css/style.css  All styling
js/levels.js   Level definitions
js/music.js    Procedural per-level music (WebAudio beats, no audio files)
js/game.js     Game engine (physics, rendering, input, saves)
```

Progress (unlocked levels, coins, owned ships) and your created levels are
saved in `localStorage`.
