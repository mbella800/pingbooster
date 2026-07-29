/**
 * Per-game visual identity for the desktop client.
 *
 * Same approach as the website (see app/games.ts for the full reasoning): we do
 * not ship publishers' key art or logos, because that is copyrighted and using
 * it to promote a paid third-party product invites a takedown. Recognition comes
 * from the game's name, a palette associated with it, and a genre glyph we drew.
 *
 * NOTE ON DUPLICATION: this deliberately mirrors app/games.ts, which is a
 * duplication the architecture says to avoid. It is temporary. The game
 * catalogue is meant to ship as signed config from the control plane so that
 * adding a game needs no client release — see the game database section of
 * docs/architecture/03-control-plane.md. When that lands, both the site and this
 * client read the same published catalogue and this file goes away.
 */

const GENRE_PATHS = {
  tactical: "M12 3v4M12 17v4M3 12h4M17 12h4M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  battleRoyale: "M3 10a9 9 0 0 1 18 0M3 10c3 0 4.5 3 4.5 3M21 10c-3 0-4.5 3-4.5 3M12 10v9M7.5 13 12 19l4.5-6",
  moba: "M4 20 20 4M4 4l16 16M12 2v20",
  shooter: "M3 17h6l3-10 3 10h6M6 21h12",
  sandbox: "M4 8h7v7H4zM13 4h7v7h-7zM13 13h7v7h-7z",
  racing: "M15 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM2 8h5M2 16h5M19 8h3M19 16h3",
  mmo: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20",
};

/** Keyed on the display name used in main.cjs's knownGames table. */
const GAME_ART = {
  "VALORANT": { genre: "tactical", palette: ["#ff4655", "#0f1923"] },
  "Fortnite": { genre: "battleRoyale", palette: ["#7b2ff7", "#2ec5ff"] },
  "Counter-Strike 2": { genre: "tactical", palette: ["#f5a623", "#1b2838"] },
  "League of Legends": { genre: "moba", palette: ["#c8a04d", "#0a1428"] },
  "Apex Legends": { genre: "battleRoyale", palette: ["#da292a", "#2b2b2b"] },
  "Overwatch 2": { genre: "shooter", palette: ["#f99e1a", "#405275"] },
  "Rocket League": { genre: "racing", palette: ["#1f8ecd", "#f39c12"] },
  "Roblox": { genre: "sandbox", palette: ["#e2231a", "#1c1c1c"] },
  "Genshin Impact": { genre: "mmo", palette: ["#4fc3f7", "#2b3a67"] },
  "Call of Duty": { genre: "shooter", palette: ["#8fa61a", "#14161a"] },
  "World of Warcraft": { genre: "mmo", palette: ["#f4c430", "#123a5e"] },
  "Dota 2": { genre: "moba", palette: ["#c23c2a", "#1b2838"] },
};

/** Neutral treatment for a title we have no entry for, so nothing renders bare. */
const FALLBACK = { genre: "shooter", palette: ["#48f2c3", "#111f31"] };

function artFor(name) {
  return GAME_ART[name] ?? FALLBACK;
}

/**
 * Paints an element with the game's palette custom properties.
 *
 * Uses CSSOM (`style.setProperty`) rather than a style attribute string on
 * purpose: the app's Content-Security-Policy is `style-src 'self'`, which
 * refuses string-parsed inline styles but permits CSSOM assignment. The CSP is
 * correct and stays; this is the compliant way to set per-element values.
 */
function applyArt(el, name) {
  const { palette } = artFor(name);
  el.style.setProperty("--tile-a", palette[0]);
  el.style.setProperty("--tile-b", palette[1]);
}

/** Genre glyph markup for a game. */
function artGlyph(name) {
  const { genre } = artFor(name);
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${GENRE_PATHS[genre]}"/></svg>`;
}

// The renderer runs with nodeIntegration disabled and contextIsolation on, so
// `module` does not exist there — this has to go on `window` to be reachable.
if (typeof window !== "undefined") {
  window.gameArt = { artFor, applyArt, artGlyph, GENRE_PATHS };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { artFor, applyArt, artGlyph, GENRE_PATHS };
}
