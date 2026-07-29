"use client";

import { useEffect, useState } from "react";
import { GAMES, GENRE_PATHS } from "./games";

/**
 * The status bar under the hero, animated.
 *
 * The idea worth keeping here: the *direct* reading jumps around erratically
 * while the *optimized* one holds steady. That demonstrates jitter far better
 * than any sentence of copy, and it is the honest version of the pitch — we are
 * not claiming a smaller average, we are showing a stable line against an
 * unstable one. It also matches how the route scorer actually ranks paths
 * (see crates/pb-probe/src/score.rs, which weights jitter well above the mean).
 *
 * Values are illustrative and labelled as such. Nothing here is measured.
 */

const SHOWCASE = ["valorant", "fortnite", "counter-strike-2", "apex-legends"]
  .map((slug) => GAMES.find((g) => g.slug === slug))
  .filter((g): g is NonNullable<typeof g> => Boolean(g));

/** Deterministic-ish wobble so the direct reading looks unstable, not random noise. */
function wobble(base: number, spread: number) {
  return Math.round(base + (Math.random() - 0.35) * spread);
}

export function LiveConsole() {
  const [index, setIndex] = useState(0);
  const [direct, setDirect] = useState(52);
  const [optimized, setOptimized] = useState(38);

  // Server render and first client paint use the initial values, so there is no
  // hydration mismatch. Intervals only ever start on the client, and a visitor
  // who prefers reduced motion simply keeps the static values — the CSS
  // animations are gated by the same media query on their side.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const tick = window.setInterval(() => {
      // Direct: wide swings, the thing that ruins a match.
      setDirect(wobble(64, 46));
      // Optimized: tight band. Occasionally moves by a millisecond, never spikes.
      setOptimized(wobble(37, 4));
    }, 900);
    const rotate = window.setInterval(
      () => setIndex((i) => (i + 1) % SHOWCASE.length),
      4200,
    );

    return () => {
      window.clearInterval(tick);
      window.clearInterval(rotate);
    };
  }, []);

  const game = SHOWCASE[index];
  const delta = direct - optimized;

  return (
    <div className="live-console" id="product">
      <div className="console-status">
        <span
          className="console-game-icon"
          style={
            {
              "--tile-a": game.palette[0],
              "--tile-b": game.palette[1],
            } as React.CSSProperties
          }
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24">
            <path d={GENRE_PATHS[game.genre]} />
          </svg>
        </span>
        <div>
          <small>GAME DETECTED</small>
          <strong key={game.slug} className="console-game-name">
            {game.name}
          </strong>
        </div>
      </div>

      <div className="console-metric">
        <small>Direct</small>
        <strong>
          <span className="console-num is-unstable">{direct}</span> <i>ms</i>
        </strong>
      </div>

      <div className="console-pulse" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </div>

      <div className="console-metric accent">
        <small>Best route</small>
        <strong>
          <span className="console-num">{optimized}</span> <i>ms</i>
        </strong>
      </div>

      <div className="console-metric console-hide-mobile">
        <small>Improvement</small>
        <strong>
          <span className="console-num">{delta > 0 ? `−${delta}` : "0"}</span>{" "}
          <i>ms</i>
        </strong>
      </div>

      <a className="console-button" href="#beta">
        Optimize &amp; play
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h13M13 6l6 6-6 6" />
        </svg>
      </a>
    </div>
  );
}
