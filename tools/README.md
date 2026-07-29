# Dev tools

Visual verification harnesses used while working on the site and the desktop
app. Optional — nothing in the product depends on them.

Requirements: `npm install --no-save playwright` and a Chromium binary
(`PLAYWRIGHT_BROWSERS_PATH` or the path hardcoded at the top of each script —
adjust it to your machine).

| Script | What it does |
|---|---|
| `screenshot-site.mjs <url> <outdir> [w] [h]` | Screenshots the site at every settled scroll position, desktop and mobile viewports, and reports any `[data-reveal]` element that is invisible **while on screen** (the only correct measure for scroll reveals) plus horizontal overflow. |
| `screenshot-app.mjs <out.png> [view]` | Renders `desktop/index.html` in a plain browser with the Electron preload API shimmed, switches to the given view (`home`, `games`, …) and screenshots it. Rendering-only; none of the shimmed behaviour ships. |

Two lessons encoded in these scripts, learned the hard way:

- Disable smooth scrolling before programmatic scroll+capture, or screenshots
  land mid-animation at arbitrary offsets and produce false "blank page" alarms.
- Judge reveal-on-scroll by elements invisible *while on screen*, not by a count
  of hidden elements at load — below-fold elements at opacity 0 are correct.
