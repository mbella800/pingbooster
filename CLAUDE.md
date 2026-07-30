# Working in this repository

Read [`docs/architecture/00-overview.md`](docs/architecture/00-overview.md) before making
structural changes. The decisions below are load-bearing and were made deliberately;
if you are going to reverse one, write an ADR explaining why.

## Non-negotiable rules

1. **Never inject into, hook, or read the memory of a game process.** Not for
   acceleration, not for FPS metrics, not for overlays. Anti-cheat systems (Vanguard,
   EAC, BattlEye) will flag it and our users get banned from their games. That is a
   company-ending event, not a bug. All acceleration happens at the network layer.
   See [`06-anti-cheat-and-trust.md`](docs/architecture/06-anti-cheat-and-trust.md).

2. **Never add reliability or congestion control on top of game UDP.** Retransmitting a
   dropped positional update delivers stale data late — strictly worse than the loss.
   The tunnel forwards datagrams unreliably, always. Redundancy is achieved by
   duplication across paths, never by retransmission.

3. **The egress IP a game server sees must be sticky for the life of a session.**
   Changing it mid-match makes the game server see a new source address; at best the
   player is dropped, at worst anti-cheat flags the session. Route changes are only
   ever made to the *middle* of the path.

4. **Never claim an improvement we did not measure.** If the direct path is better than
   every overlay path, the client says so and stays out of the way. This is a product
   requirement, not just an ethical one — a booster that cannot prove it helped churns.

5. **No secrets, tokens, or private keys in this repository.** Config that ships to
   clients is signed; the signing key lives in the HSM/KMS, not in git.

## Architectural invariants

- **`crates/pb-*` is platform-agnostic and must stay that way.** Platform code lives
  behind traits with feature-gated implementations. `cargo test --workspace` must pass
  on Linux and macOS with no Windows SDK present.
- **`pb-proto` is the single source of truth for wire types.** The desktop app, the
  mobile clients, the edge agent and the API all derive from it. Don't hand-write a
  duplicate struct in a client.
- **The desktop shell contains no networking logic.** If you find yourself writing a
  socket in `apps/desktop`, it belongs in a crate.
- **Game support ships as signed config, not as code.** Adding a game must never
  require an app release. See the game database section in
  [`03-control-plane.md`](docs/architecture/03-control-plane.md).
- **The website and the app share one API contract** (`docs/api/openapi.yaml`). Change
  the contract first, then both consumers.

## Conventions

- Rust 2021, `cargo fmt` clean, `cargo clippy -- -D warnings` clean.
- Scoring/measurement code carries unit tests with explicit numeric expectations.
  Route selection is the product; regressions there are silent and expensive.
- Errors: `thiserror` in libraries, `anyhow` only at binary boundaries.
- No `unwrap()` outside tests.
