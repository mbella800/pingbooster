"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { GAMES, GENRE_PATHS, type Game } from "./games";

function GenreGlyph({ game }: { game: Game }) {
  return (
    <svg className="tile-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d={GENRE_PATHS[game.genre]} />
    </svg>
  );
}

export function GameArtwork({
  game,
  eager = false,
}: {
  game: Game;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const artwork = game.artwork;

  return (
    <div className="tile-art" style={{ aspectRatio: "2 / 3" }}>
      {!artwork || failed ? (
        <>
          <span className="tile-wash" aria-hidden="true" />
          <GenreGlyph game={game} />
        </>
      ) : (
        <Image
          src={artwork}
          fill
          sizes="(max-width: 520px) 45vw, (max-width: 1100px) 25vw, 240px"
          unoptimized
          loading={eager ? "eager" : "lazy"}
          alt={`${game.name} official game cover artwork`}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setFailed(true);
          }}
          style={{
            objectFit: "cover",
            objectPosition: "50% 38%",
            opacity: loaded ? 1 : 0,
            transition: "opacity 280ms ease",
          }}
        />
      )}

      <div className="tile-body">
        <h3>{game.name}</h3>
        <p className="tile-profile">{game.profile}</p>
      </div>
    </div>
  );
}

function ArtworkGameTile({
  game,
  eager = false,
  rail = false,
}: {
  game: Game;
  eager?: boolean;
  rail?: boolean;
}) {
  return (
    <article
      className="game-tile"
      style={
        {
          "--tile-a": game.palette[0],
          "--tile-b": game.palette[1],
          ...(rail ? { flex: "0 0 226px" } : {}),
        } as CSSProperties
      }
    >
      <GameArtwork game={game} eager={eager} />
      <div className="tile-detail">
        <span className="tile-detail-label">Routed via</span>
        <span className="tile-detail-value">{game.regions.join(" · ")}</span>
      </div>
    </article>
  );
}

export function GameArtworkRail() {
  return (
    <section className="game-rail-section" aria-labelledby="game-rail-heading">
      <h2 id="game-rail-heading" className="sr-only">
        Supported games
      </h2>
      <div className="game-rail">
        <div className="game-rail-track">
          {GAMES.map((game, index) => (
            <ArtworkGameTile
              key={game.slug}
              game={game}
              eager={index < 2}
              rail
            />
          ))}
          <div aria-hidden="true" className="rail-clone">
            {GAMES.map((game) => (
              <ArtworkGameTile
                key={`clone-${game.slug}`}
                game={game}
                rail
              />
            ))}
          </div>
        </div>
      </div>
      <p className="game-rail-note">
        Universal mode follows any game process. Listed titles have tuned
        routing profiles.
      </p>
    </section>
  );
}

export function GameArtworkGrid() {
  return (
    <div className="game-grid">
      {GAMES.map((game) => (
        <ArtworkGameTile key={game.slug} game={game} />
      ))}
    </div>
  );
}
