/**
 * Supported game catalogue, with the visual identity used for game tiles.
 *
 * ── On artwork and trademarks ────────────────────────────────────────────────
 * We deliberately do NOT ship publishers' key art, logos, or character
 * renders. Those are copyrighted, and using them to promote a paid third-party
 * product is not something fair use reliably covers — a takedown or a
 * cease-and-desist would pull the storefront down at the worst possible moment,
 * and it also sours the publisher relationships that the co-marketing plans in
 * docs/architecture/05-rewards-and-drops.md depend on.
 *
 * What we use instead, which is both legally clean and genuinely recognisable:
 *
 *   1. The game's NAME, stated plainly. Naming a product to say truthfully
 *      that you work with it is ordinary nominative use.
 *   2. A palette associated with the game, so the tile reads as "that game" at
 *      a glance. Colour alone is not protectable.
 *   3. A genre glyph drawn by us.
 *
 * If we later want official art, the path is the publisher's press kit or brand
 * portal — most have one, many permit logo use under stated conditions, and key
 * art usually needs a written request. `artwork` below is the slot it drops
 * into when that happens; nothing else has to change.
 */

export type Genre = "tactical" | "battleRoyale" | "moba" | "shooter" | "sandbox" | "racing" | "mmo";

export interface Game {
  /** URL-safe identifier, also used for the per-game landing route. */
  slug: string;
  /** Display name. Never translated — Fortnite is Fortnite everywhere. */
  name: string;
  genre: Genre;
  /** Two colours associated with the game, used for the tile gradient. */
  palette: [string, string];
  /** Which routing profile the accelerator applies. */
  profile: "Latency first" | "Stability first" | "Balanced";
  /**
   * Typical server regions players connect to. Drives which PoPs matter for
   * this title and lets a tile say something concrete.
   */
  regions: string[];
  /**
   * Path to licensed official artwork, once obtained. Undefined means the tile
   * renders our own generated treatment.
   */
  artwork?: string;
}

export const GAMES: Game[] = [
  {
    slug: "valorant",
    name: "VALORANT",
    genre: "tactical",
    palette: ["#ff4655", "#0f1923"],
    profile: "Latency first",
    regions: ["Frankfurt", "London", "Istanbul"],
  },
  {
    slug: "fortnite",
    name: "Fortnite",
    genre: "battleRoyale",
    palette: ["#7b2ff7", "#2ec5ff"],
    profile: "Balanced",
    regions: ["Amsterdam", "Ashburn", "São Paulo"],
  },
  {
    slug: "counter-strike-2",
    name: "Counter-Strike 2",
    genre: "tactical",
    palette: ["#f5a623", "#1b2838"],
    profile: "Latency first",
    regions: ["Frankfurt", "Stockholm", "Singapore"],
  },
  {
    slug: "league-of-legends",
    name: "League of Legends",
    genre: "moba",
    palette: ["#c8a04d", "#0a1428"],
    profile: "Stability first",
    regions: ["Frankfurt", "Istanbul", "Mumbai"],
  },
  {
    slug: "apex-legends",
    name: "Apex Legends",
    genre: "battleRoyale",
    palette: ["#da292a", "#2b2b2b"],
    profile: "Latency first",
    regions: ["Amsterdam", "Ashburn", "Tokyo"],
  },
  {
    slug: "call-of-duty",
    name: "Call of Duty",
    genre: "shooter",
    palette: ["#8fa61a", "#14161a"],
    profile: "Latency first",
    regions: ["Frankfurt", "Ashburn", "Dubai"],
  },
  {
    slug: "rocket-league",
    name: "Rocket League",
    genre: "racing",
    palette: ["#1f8ecd", "#f39c12"],
    profile: "Latency first",
    regions: ["Amsterdam", "Ashburn", "São Paulo"],
  },
  {
    slug: "roblox",
    name: "Roblox",
    genre: "sandbox",
    palette: ["#e2231a", "#1c1c1c"],
    profile: "Balanced",
    regions: ["Frankfurt", "Ashburn", "Singapore"],
  },
  {
    slug: "dota-2",
    name: "Dota 2",
    genre: "moba",
    palette: ["#c23c2a", "#1b2838"],
    profile: "Stability first",
    regions: ["Frankfurt", "Stockholm", "Singapore"],
  },
  {
    slug: "overwatch-2",
    name: "Overwatch 2",
    genre: "shooter",
    palette: ["#f99e1a", "#405275"],
    profile: "Latency first",
    regions: ["Frankfurt", "Ashburn", "Seoul"],
  },
  {
    slug: "world-of-warcraft",
    name: "World of Warcraft",
    genre: "mmo",
    palette: ["#f4c430", "#123a5e"],
    profile: "Stability first",
    regions: ["Frankfurt", "Ashburn", "Sydney"],
  },
  {
    slug: "genshin-impact",
    name: "Genshin Impact",
    genre: "mmo",
    palette: ["#4fc3f7", "#2b3a67"],
    profile: "Stability first",
    regions: ["Frankfurt", "Singapore", "Tokyo"],
  },
];

/** Genre glyphs. Drawn here so the tiles need no external icon dependency. */
export const GENRE_PATHS: Record<Genre, string> = {
  // Crosshair — precision aiming.
  tactical: "M12 3v4M12 17v4M3 12h4M17 12h4M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  // Parachute over a drop.
  battleRoyale: "M3 10a9 9 0 0 1 18 0M3 10c3 0 4.5 3 4.5 3M21 10c-3 0-4.5 3-4.5 3M12 10v9M7.5 13 12 19l4.5-6",
  // Three lanes converging.
  moba: "M4 20 20 4M4 4l16 16M12 2v20",
  // Bullet trajectory.
  shooter: "M3 17h6l3-10 3 10h6M6 21h12",
  // Stacked blocks.
  sandbox: "M4 8h7v7H4zM13 4h7v7h-7zM13 13h7v7h-7z",
  // Speed lines behind a wheel.
  racing: "M15 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM2 8h5M2 16h5M19 8h3M19 16h3",
  // Interlinked persistent world.
  mmo: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20",
};
