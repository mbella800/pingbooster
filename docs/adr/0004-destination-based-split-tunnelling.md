# ADR 0004 — Select traffic by destination, not by process

**Status:** accepted · **Date:** 2026-07-29

## Context

Only game traffic should enter the tunnel. Routing everything breaks the user's other
applications, puts video streaming through our relays (the one thing that *would* make
bandwidth expensive), and needlessly exposes their private traffic.

The obvious implementation is per-process: identify the game's socket and redirect its
connections. On Windows, redirecting per-process requires a WFP callout driver matching on
process AppId — which [ADR 0002](0002-userspace-tunnel-first.md) rules out. Note that the
user-mode WFP API can *permit and block* but not *redirect*, so there is no driverless
per-process path.

## Decision

**Select traffic by destination address.** Install routes for known game server addresses
pointing at the Wintun adapter; everything else follows the default route untouched.

## Rationale

This is not merely the cheaper option — for this product it is better:

- **We need the game-server address database anyway.** It is what lets us measure path
  quality to real game servers instead of to our own PoPs, which is the difference between
  meaningful and meaningless measurement. Destination-based selection reuses an asset that is
  already mandatory.
- **Robust to how the game launches.** Anti-cheat launchers, subprocess trees, Epic or Steam
  relaunching the binary, 32/64-bit shims — none of it matters, because we never identify a
  process.
- **Excludes the right traffic for free.** Game clients also talk to telemetry, patching and
  store endpoints. Those should not traverse our relays, and destination selection leaves
  them alone without special-casing.
- **No kernel driver**, therefore no attestation signing and no BSOD risk.

## Consequences

- **The address database becomes critical infrastructure.** Two sources: curated publisher
  ranges shipped as signed config (so adding a game needs no client release), and dynamic
  learning on the client from `GetExtendedUdpTable`/`GetExtendedTcpTable` correlated against
  the process list. Both are permitted under [ADR 0003](0003-never-touch-the-game-process.md)
  because they read OS state.
- **Peer-to-peer titles degrade.** Where the "server" is another player at an arbitrary
  address, destination selection has nothing stable to match. MVP position: those titles are
  unsupported, stated honestly, rather than silently ineffective. This is the weakest point
  of the decision and is flagged as an open question in
  [`../CLAUDE-ROUTE-PROPOSAL.md`](../CLAUDE-ROUTE-PROPOSAL.md).
- **An uncatalogued game gets no acceleration** until its addresses are learned. The client
  must say so rather than appear to work.
- **IPv6 must be handled explicitly.** If a game reaches its server over IPv6 and we
  installed only IPv4 routes, traffic silently bypasses acceleration and the user sees no
  improvement — the worst outcome, because it looks like the product doesn't work. Either
  accelerate both families or install a WFP block on IPv6 to that destination so it falls
  back to IPv4 deterministically.
- **Pin the tunnel endpoint before bringing the tunnel up:** a `/32` route to the ingress PoP
  via the physical interface. Without it, tunnel packets route into the tunnel and deadlock.

## Revisit if

Telemetry shows a material share of sessions on games whose addresses cannot be catalogued,
or a high-value title actively randomises server addressing. That would justify revisiting
ADR 0002 — with vendor conversations first.
