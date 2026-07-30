# Ping Optimizer

Ping Optimizer is a Windows technical preview for game detection, repeatable
connection diagnostics, and conservative session-only PC tuning.

## What works in 0.2

- Detects 12 supported Windows game processes.
- Selects a recommended diagnostic mode per game.
- Runs repeated TCP connection tests against Cloudflare, Google, and Quad9
  edges.
- Changes test depth and scoring for Automatic, Lowest latency, Maximum
  stability, and Quick check modes.
- Can temporarily enable the Windows High Performance power plan.
- Can temporarily raise a detected game process priority when Windows permits.
- Records a rollback journal before PC changes and restores the original values
  on exit or the next launch after an interrupted session.
- Runs low-risk DNS and adapter health checks.
- Stores settings and the latest 30 diagnostic reports locally.

## Preview limitation

Production relay routing is not active in this build. The Frankfurt, Amsterdam,
and London relay controls remain visibly locked until real servers are deployed
and measured. The app does not claim that public-edge TCP response is game
server ping or packet loss.

## Run the portable Windows build

1. Extract the entire ZIP.
2. Open `Ping Optimizer.exe`.
3. If Windows SmartScreen appears, verify the publisher status and choose
   whether to continue. This preview is not code-signed.

Keep all extracted files together. This is a portable build, not an installer.

## Development

The marketing site is in `app/`. The Electron desktop application is in
`desktop/`. The acceleration platform is in `crates/`, and the architecture that
governs it is in `docs/`.

---

# The acceleration platform

The preview above measures. This section is about the thing that has to actually
reduce ping: a measured overlay network, and the logic that decides whether and how
to use it.

**The one thing to understand first:** an accelerator is ~20% client app and ~80%
edge network plus routing intelligence. A polished UI with a ping number in it is not
a product. The product is an overlay that genuinely beats the default BGP path for a
given user/game pair, plus the honesty to say so when it doesn't.

The good news, and it is substantial: game traffic is **tiny** — 50–150 kbps of small
UDP datagrams. A thousand concurrent players is roughly 100 Mbps of relay capacity.
Unlike a video VPN this is cheap to run, which means effort belongs in route quality
rather than in shaving infrastructure cost. The real constraint is packets per second,
not bandwidth.

## Layout

```
crates/            Rust workspace — the shared core, written once, reused everywhere
  pb-proto/        Wire types, framing, dedup, signed-config rules
  pb-probe/        Path measurement + route scoring. The actual intellectual property.
  pb-core/         Session lifecycle and the sticky-egress invariant
docs/
  architecture/    How and why the system is built this way. Read 00 first.
  adr/             Decision records for the choices that are expensive to reverse
  api/             OpenAPI contract shared with the website
app/               Marketing site
desktop/           Electron technical preview
```

## Start here

| Document | What it covers |
|---|---|
| [`docs/CLAUDE-ROUTE-PROPOSAL.md`](docs/CLAUDE-ROUTE-PROPOSAL.md) | **Condensed proposal for review**, with an implementation-status table and a benchmark protocol |
| [`docs/architecture/00-overview.md`](docs/architecture/00-overview.md) | System overview, component map, the honesty principle |
| [`docs/architecture/01-data-plane.md`](docs/architecture/01-data-plane.md) | How acceleration actually works. The crown jewel. |
| [`docs/architecture/02-windows-client.md`](docs/architecture/02-windows-client.md) | Split tunnelling without a kernel driver, service/UI split, code signing |
| [`docs/architecture/03-control-plane.md`](docs/architecture/03-control-plane.md) | Auth, entitlements, signed config, telemetry |
| [`docs/architecture/04-edge-network.md`](docs/architecture/04-edge-network.md) | PoP topology, route matrix, provisioning, unit economics |
| [`docs/architecture/05-rewards-and-drops.md`](docs/architecture/05-rewards-and-drops.md) | Twitch Drops: what is and isn't possible, and what to build instead |
| [`docs/architecture/06-anti-cheat-and-trust.md`](docs/architecture/06-anti-cheat-and-trust.md) | EAC, BattlEye and Vanguard: the existential risk, and how the design avoids it |
| [`docs/architecture/07-internationalisation.md`](docs/architecture/07-internationalisation.md) | Which languages, in what order, and why it tracks PoP placement |
| [`docs/roadmap.md`](docs/roadmap.md) | Phased delivery, with long-lead-time items flagged |
| [`docs/adr/README.md`](docs/adr/README.md) | The five decisions that are expensive to reverse |
| [`docs/review-of-desktop-preview.md`](docs/review-of-desktop-preview.md) | Assessment of the Electron preview: what to keep, what to change |

## Status

The Rust core is implemented and tested. **Nothing in it moves a packet yet** — there
is no tunnel, no deployed PoP, and no Windows integration. See the status table in
[the proposal](docs/CLAUDE-ROUTE-PROPOSAL.md#0-implementation-status--read-this-first)
for exactly what exists and what does not.

```bash
cargo test --workspace     # 88 tests, no dependencies, no I/O
cargo clippy --workspace --all-targets
```

The core is platform-agnostic on purpose, so it builds and tests on any OS with no
platform SDK present. Platform-specific tunnel code will be feature-gated behind
traits to keep it that way.
