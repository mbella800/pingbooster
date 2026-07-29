import { GAMES, GENRE_PATHS, type Game } from "./games";

function GenreGlyph({ game }: { game: Game }) {
  return (
    <svg className="tile-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d={GENRE_PATHS[game.genre]} />
    </svg>
  );
}

/**
 * A single game tile.
 *
 * The visual identity comes from the game's palette plus a genre glyph we drew,
 * never from publisher artwork — see the note at the top of games.ts. When
 * licensed art is obtained, `game.artwork` renders in place of the gradient and
 * nothing else changes.
 */
function GameTile({ game, eager = false }: { game: Game; eager?: boolean }) {
  return (
    <article
      className="game-tile"
      style={
        {
          "--tile-a": game.palette[0],
          "--tile-b": game.palette[1],
        } as React.CSSProperties
      }
    >
      <div className="tile-art">
        {game.artwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={game.artwork} alt="" aria-hidden="true" loading={eager ? "eager" : "lazy"} />
        ) : (
          <>
            <span className="tile-wash" aria-hidden="true" />
            <GenreGlyph game={game} />
          </>
        )}

        {/* Inside the art box, not the tile, so that on touch devices — where the
            detail panel below is always shown rather than revealed on hover —
            the title does not land on top of it. */}
        <div className="tile-body">
          <h3>{game.name}</h3>
          <p className="tile-profile">{game.profile}</p>
        </div>
      </div>

      {/* Revealed on hover/focus. Concrete detail rather than decoration: which
          PoPs actually serve this title. */}
      <div className="tile-detail">
        <span className="tile-detail-label">Routed via</span>
        <span className="tile-detail-value">{game.regions.join(" · ")}</span>
      </div>
    </article>
  );
}

/**
 * Continuously moving rail of game tiles.
 *
 * The list is duplicated so the CSS translation can loop seamlessly. The
 * duplicate is hidden from assistive technology so screen readers hear each
 * game once.
 */
export function GameRail() {
  return (
    <section className="game-rail-section" aria-labelledby="game-rail-heading">
      <h2 id="game-rail-heading" className="sr-only">
        Supported games
      </h2>
      <div className="game-rail">
        <div className="game-rail-track">
          {GAMES.map((game, i) => (
            <GameTile key={game.slug} game={game} eager={i < 4} />
          ))}
          <span aria-hidden="true" className="rail-clone">
            {GAMES.map((game) => (
              <GameTile key={`clone-${game.slug}`} game={game} />
            ))}
          </span>
        </div>
      </div>
      <p className="game-rail-note">
        Universal mode follows any game process. Listed titles have tuned routing
        profiles.
      </p>
    </section>
  );
}

/** Static grid of every supported title, for the games section. */
export function GameGrid() {
  return (
    <div className="game-grid">
      {GAMES.map((game) => (
        <GameTile key={game.slug} game={game} />
      ))}
    </div>
  );
}
