/**
 * Supported game catalogue, with the visual identity used for game tiles.
 *
 * ── On artwork and trademarks ────────────────────────────────────────────────
 * The current product preview uses publisher/store artwork so players can
 * recognize profiles immediately. The source list and release-use caveat are
 * documented in desktop/assets/covers/SOURCES.md. Before commercial release,
 * every publisher's current promotional-use terms must be confirmed.
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
  /** Path to documented publisher/store artwork used by this preview. */
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
    artwork: "/games/covers/valorant.webp",
  },
  {
    slug: "fortnite",
    name: "Fortnite",
    genre: "battleRoyale",
    palette: ["#7b2ff7", "#2ec5ff"],
    profile: "Balanced",
    regions: ["Amsterdam", "Ashburn", "São Paulo"],
    artwork: "/games/covers/fortnite.webp",
  },
  {
    slug: "counter-strike-2",
    name: "Counter-Strike 2",
    genre: "tactical",
    palette: ["#f5a623", "#1b2838"],
    profile: "Latency first",
    regions: ["Frankfurt", "Stockholm", "Singapore"],
    artwork: "/games/covers/counter-strike-2.webp",
  },
  {
    slug: "league-of-legends",
    name: "League of Legends",
    genre: "moba",
    palette: ["#c8a04d", "#0a1428"],
    profile: "Stability first",
    regions: ["Frankfurt", "Istanbul", "Mumbai"],
    artwork: "/games/covers/league-of-legends.webp",
  },
  {
    slug: "apex-legends",
    name: "Apex Legends",
    genre: "battleRoyale",
    palette: ["#da292a", "#2b2b2b"],
    profile: "Latency first",
    regions: ["Amsterdam", "Ashburn", "Tokyo"],
    artwork: "/games/covers/apex-legends.webp",
  },
  {
    slug: "call-of-duty",
    name: "Call of Duty",
    genre: "shooter",
    palette: ["#8fa61a", "#14161a"],
    profile: "Latency first",
    regions: ["Frankfurt", "Ashburn", "Dubai"],
    artwork: "/games/covers/call-of-duty.webp",
  },
  {
    slug: "rocket-league",
    name: "Rocket League",
    genre: "racing",
    palette: ["#1f8ecd", "#f39c12"],
    profile: "Latency first",
    regions: ["Amsterdam", "Ashburn", "São Paulo"],
    artwork: "/games/covers/rocket-league.webp",
  },
  {
    slug: "roblox",
    name: "Roblox",
    genre: "sandbox",
    palette: ["#e2231a", "#1c1c1c"],
    profile: "Balanced",
    regions: ["Frankfurt", "Ashburn", "Singapore"],
    artwork: "/games/covers/roblox.webp",
  },
  {
    slug: "dota-2",
    name: "Dota 2",
    genre: "moba",
    palette: ["#c23c2a", "#1b2838"],
    profile: "Stability first",
    regions: ["Frankfurt", "Stockholm", "Singapore"],
    artwork: "/games/covers/dota-2.webp",
  },
  {
    slug: "overwatch-2",
    name: "Overwatch 2",
    genre: "shooter",
    palette: ["#f99e1a", "#405275"],
    profile: "Latency first",
    regions: ["Frankfurt", "Ashburn", "Seoul"],
    artwork: "/games/covers/overwatch-2.webp",
  },
  {
    slug: "world-of-warcraft",
    name: "World of Warcraft",
    genre: "mmo",
    palette: ["#f4c430", "#123a5e"],
    profile: "Stability first",
    regions: ["Frankfurt", "Ashburn", "Sydney"],
    artwork: "/games/covers/world-of-warcraft.webp",
  },
  {
    slug: "genshin-impact",
    name: "Genshin Impact",
    genre: "mmo",
    palette: ["#4fc3f7", "#2b3a67"],
    profile: "Stability first",
    regions: ["Frankfurt", "Singapore", "Tokyo"],
    artwork: "/games/covers/genshin-impact.webp",
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
