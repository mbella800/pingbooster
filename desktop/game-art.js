/**
 * Per-game visual identity for the desktop client.
 *
 * The launcher cards use official publisher/store artwork sourced from each
 * game's official media page or storefront. The game name remains visible and
 * our palette/glyph treatment is the fallback whenever a cover is unavailable.
 * Source URLs and release-use notes live beside the assets in
 * assets/covers/SOURCES.md.
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

const COVER_ROOT = "assets/covers";
const OFFICIAL_COVERS = Object.freeze({
  fortnite: Object.freeze({ file: "fortnite.webp", label: "Fortnite", position: "50% 38%" }),
  valorant: Object.freeze({ file: "valorant.webp", label: "VALORANT", position: "50% 34%" }),
  "counter strike 2": Object.freeze({
    file: "counter-strike-2.webp",
    label: "Counter-Strike 2",
    position: "50% 38%",
  }),
  "league of legends": Object.freeze({
    file: "league-of-legends.webp",
    label: "League of Legends",
    position: "50% 34%",
  }),
  "apex legends": Object.freeze({
    file: "apex-legends.webp",
    label: "Apex Legends",
    position: "50% 36%",
  }),
  "overwatch 2": Object.freeze({
    file: "overwatch-2.webp",
    label: "Overwatch 2",
    position: "50% 35%",
  }),
  "rocket league": Object.freeze({
    file: "rocket-league.webp",
    label: "Rocket League",
    position: "50% 40%",
  }),
  roblox: Object.freeze({ file: "roblox.webp", label: "Roblox", position: "50% 50%" }),
  "genshin impact": Object.freeze({
    file: "genshin-impact.webp",
    label: "Genshin Impact",
    position: "50% 35%",
  }),
  "call of duty": Object.freeze({
    file: "call-of-duty.webp",
    label: "Call of Duty",
    position: "50% 36%",
  }),
  "world of warcraft": Object.freeze({
    file: "world-of-warcraft.webp",
    label: "World of Warcraft",
    position: "50% 48%",
  }),
  "dota 2": Object.freeze({ file: "dota-2.webp", label: "Dota 2", position: "50% 36%" }),
});

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

function normalizeTitle(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getArtworkMeta(gameName) {
  const artwork = OFFICIAL_COVERS[normalizeTitle(gameName)];
  if (!artwork) return null;

  return Object.freeze({
    category: "official-cover",
    categoryLabel: artwork.label,
    file: artwork.file,
    src: `${COVER_ROOT}/${artwork.file}`,
    position: artwork.position,
  });
}

/** Returns a local URL because renderer.js assigns this value directly to img.src. */
function getArtwork(gameName) {
  return getArtworkMeta(gameName)?.src ?? null;
}

function createImage(gameName, options = {}) {
  if (typeof document === "undefined") return null;
  const artwork = getArtworkMeta(gameName);
  if (!artwork) return null;

  const image = document.createElement("img");
  image.src = artwork.src;
  image.alt =
    options.alt ??
    `Official ${artwork.categoryLabel} cover artwork`;
  image.loading = options.eager ? "eager" : "lazy";
  image.decoding = "async";
  image.draggable = false;
  image.dataset.gameArt = artwork.category;
  image.style.objectPosition = artwork.position;
  return image;
}

function preload(gameName) {
  const artwork = getArtwork(gameName);
  if (!artwork || typeof Image === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = artwork;
  });
}

function installHeroFallback() {
  if (typeof document === "undefined") return;
  const hero = document.querySelector("#game-hero-art");
  const title = document.querySelector("#game-name");
  if (!hero || !title) return;

  const syncFallback = () => {
    if (!getArtwork(title.textContent)) hero.hidden = true;
  };

  hero.addEventListener("error", () => {
    hero.hidden = true;
  });
  hero.addEventListener("load", () => {
    if (getArtwork(title.textContent)) hero.hidden = false;
  });

  if (typeof MutationObserver !== "undefined") {
    new MutationObserver(syncFallback).observe(title, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  syncFallback();
}

const gameArtApi = Object.freeze({
  artFor,
  applyArt,
  artGlyph,
  GENRE_PATHS,
  officialCovers: OFFICIAL_COVERS,
  normalizeTitle,
  getArtwork,
  getArtworkMeta,
  createImage,
  preload,
});

// The renderer runs with nodeIntegration disabled and contextIsolation on, so
// `module` does not exist there — this has to go on `window` to be reachable.
if (typeof window !== "undefined") {
  window.gameArt = gameArtApi;
  window.PingGameArt = gameArtApi;
  installHeroFallback();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = gameArtApi;
}
