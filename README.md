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

## Project layout

```
index.html     Markup for the game + all menu/overlay screens
css/style.css  All styling
js/levels.js   Level definitions
js/game.js     Game engine (physics, rendering, input, saves)
```

Progress (unlocked levels, coins, owned ships) is saved in `localStorage`.
