# ADR 0005 — Unreliable transport only; no TCP fallback

**Status:** accepted · **Date:** 2026-07-29

## Context

The tunnel carries game traffic: UDP datagrams of 60–300 bytes at 20–128 Hz. Some networks
(corporate, hotel, certain mobile carriers) block or throttle arbitrary UDP, so a fallback is
needed. The conventional VPN answer is to fall back to TCP.

## Decision

**The tunnel is unreliable, unordered and without congestion control. The only fallback is
QUIC unreliable DATAGRAM frames (RFC 9221) over port 443. There is no TCP fallback.**

If neither plain UDP nor QUIC/443 works, the client reports that the network blocks
acceleration and stays on the direct path.

## Rationale

**A late packet is worse than a lost one.** Games send positional state at a fixed tick. If a
packet is lost, the next tick supersedes it in milliseconds and the game's interpolation
covers the gap. If a packet is *retransmitted*, it arrives carrying stale state after the
game has already moved on — costing latency to deliver data that is no longer useful.

TCP fallback would therefore make the metric we sell worse while appearing to improve packet
loss statistics. A user on the TCP path would see loss go to zero and their gameplay get
worse, which is the most confusing possible failure. Head-of-line blocking makes it worse
still: one lost segment stalls every subsequent datagram behind it.

QUIC DATAGRAM is the right fallback because it keeps unreliable delivery while looking like
HTTPS to a middlebox. It also brings connection migration, which complements identifying
sessions by session ID rather than 5-tuple.

**Declining to operate is an acceptable outcome.** Consistent with the honesty principle:
better to say "this network blocks us" than to enable a mode that quietly degrades what the
user is paying for.

## Consequences

- No ARQ, no ordering, no flow control on game traffic. The control channel (auth, config)
  is separate and may use ordinary HTTPS.
- **No large-block FEC either.** It requires buffering to reconstruct, and the buffering
  costs more latency than the loss did. Redundancy comes from duplicating across paths, which
  adds zero delay — see [`../architecture/01-data-plane.md`](../architecture/01-data-plane.md).
- **No compression.** Game payloads are already compressed or encrypted; compression would
  add CPU and latency for ~0% gain.
- Some users on restrictive networks cannot be served. Accepted, and reported honestly.
- The client must detect the blocked case reliably and not sit retrying.
- MTU must be handled properly: conservative 1280, DF set, ICMP `Fragmentation Needed`
  honoured, and inner datagrams too large to fit dropped and counted rather than fragmented.

## Revisit if

Telemetry shows a large share of users blocked on both UDP and QUIC/443. Even then the answer
is a better unreliable transport, not a reliable one.
