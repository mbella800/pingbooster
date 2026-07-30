# 01 — The data plane

This is the part that either works or doesn't. Everything else is packaging.

## What game traffic looks like

Design decisions only make sense against the actual traffic shape:

| Property | Typical value | Consequence for us |
|---|---|---|
| Transport | UDP, overwhelmingly | No retransmission, ever. Latency beats delivery. |
| Datagram size | 60–300 bytes | Duplication is nearly free. Header overhead is *relatively* large. |
| Send rate | 20–128 Hz per direction | 50–150 kbps. Relay bandwidth is a rounding error. |
| Tolerance | Loses one packet: fine. Late packet: worse than lost. | Optimise the tail, not the mean. |
| Session length | 5–60 min, stateful | Source address must not change mid-session. |

Two things follow immediately and they drive the whole design:

1. **Bandwidth is not the constraint, so spend it.** Duplicating every packet across two
   paths doubles a 100 kbps stream to 200 kbps. That is an irrelevant cost for a
   dramatic reliability gain.
2. **A late packet is useless.** Anything that trades latency for delivery — TCP
   fallback, reliable tunnels, ARQ, large FEC blocks that need buffering — makes the
   product worse while appearing to "improve" packet loss statistics.

## Overlay transport

The tunnel is a **thin authenticated UDP overlay**. Per datagram: a session ID, a
sequence number, a path ID, and an AEAD tag. No reliability, no congestion control, no
ordering guarantees. The client encapsulates the game's datagram, the egress PoP strips
the header and forwards the original payload to the game server.

```
┌──────────┬──────────┬─────────┬──────────────────────────┬─────────┐
│ session  │   seq    │ path_id │  encrypted game datagram │ AEAD tag│
│  8 bytes │ 4 bytes  │ 1 byte  │        60–300 bytes      │ 16 bytes│
└──────────┴──────────┴─────────┴──────────────────────────┴─────────┘
```

29 bytes of overhead. On a 150-byte game packet that is ~19% — visible in bandwidth
terms, irrelevant in latency terms.

**Fallback path:** some networks (corporate, mobile carrier, hotel) block or throttle
arbitrary UDP. Fall back to **QUIC unreliable DATAGRAM frames (RFC 9221) over port 443**,
which is indistinguishable from HTTPS to a middlebox and still gives unreliable
delivery. Critically, this is the *only* acceptable fallback — falling back to TCP would
silently make ping worse, which is the failure mode we exist to prevent. If neither UDP
nor QUIC/443 works, the client reports "network blocks acceleration" and disables itself.

**Crypto:** Noise IK handshake, ChaCha20-Poly1305 for the data path, key rotation per
session. Standard, boring, auditable. No custom crypto.

### MTU

Encapsulation shrinks the usable MTU. Game datagrams are small enough that this rarely
matters, but "rarely" is not "never" and a silent PMTU blackhole is a miserable bug to
diagnose in the field. Rules:

- Advertise a conservative tunnel MTU (1280 for IPv6 parity, safe across nearly all paths).
- Never fragment tunnel packets; set DF and handle ICMP `Fragmentation Needed`.
- If an inner datagram will not fit, drop it and count it. Do not fragment inner game
  traffic — a game that sends >1200-byte UDP is doing something unusual and reassembly
  latency would hurt more than the drop.

## Path duplication: the biggest real win

For a stream where bandwidth is free and loss is expensive, sending the same datagram
over two disjoint paths and de-duplicating at the egress is the highest-leverage
technique available.

If path A drops with probability `p_a` and path B with `p_b`, and the loss events are
independent, the combined loss is `p_a × p_b`:

| Path A loss | Path B loss | Combined |
|---|---|---|
| 2% | 2% | 0.04% |
| 5% | 5% | 0.25% |
| 1% | 8% | 0.08% |

Two percent loss is the difference between a playable and an infuriating match. Getting
to 0.04% is transformative, and the cost is 100 kbps.

It also improves *latency*, not just loss: the egress forwards whichever copy arrives
first, so the effective RTT is `min(rtt_a, rtt_b)` rather than an average. That
truncates the jitter distribution's upper tail, which is exactly what players feel.

**Implementation notes:**

- De-duplication uses the sequence number against a small sliding window (1024 entries
  is ample at 128 Hz — that's 8 seconds of history). Forward first copy seen, drop the
  rest.
- Duplication is **adaptive, not always-on**. When measured loss on the primary path is
  below a threshold, run single-path and save the capacity; escalate to duplication when
  loss or jitter rises. `pb-probe` owns this decision.
- The paths must be genuinely disjoint to get independent loss. Two paths through the
  same ingress PoP share fate. Path diversity is a property the route matrix must
  explicitly track — see [`04-edge-network.md`](04-edge-network.md).
- Do not extend this to 3+ paths reflexively. The marginal gain from a third copy is
  small (`p³`) and it triples the load on the ingress. Two is the sweet spot.

## Route scoring: optimise the tail

The single most common mistake is ranking candidate paths by mean RTT. Players do not
perceive mean RTT. They perceive the moments when a packet arrives late enough that the
game has to correct itself — rubber-banding, missed shots, delayed hit registration.
Those are tail events.

`pb-probe` therefore scores each candidate path on a composite cost where **jitter and
loss are weighted far more heavily than the mean**:

```
cost = p95_rtt
     + JITTER_WEIGHT * jitter
     + LOSS_WEIGHT   * loss_fraction
     + stability_penalty
```

with `LOSS_WEIGHT` large enough that a single percent of loss outweighs tens of
milliseconds of latency, because it does. The implementation, the exact weights and the
reasoning behind each are in [`crates/pb-probe/src/score.rs`](../../crates/pb-probe/src/score.rs)
with unit tests pinning the intended behaviour.

`stability_penalty` deserves a note: switching routes is not free (see below), so a path
must be meaningfully better than the incumbent to displace it, not merely better by a
hair. Without hysteresis the engine oscillates between two near-equal paths, and every
switch is a small risk. The current path gets a bonus; challengers must clear it.

**"Direct" is a candidate path.** It is measured on the same schedule, scored with the
same function, and it frequently wins. When it does, the tunnel is torn down and the UI
tells the user their connection is already optimal. This is `PathKind::Direct` in the
scoring engine and it is not a special case in the code — it competes.

## Sticky egress and seamless migration

Game servers associate a player's session with a source address. If that address
changes mid-match:

- best case, the server drops the player and they reconnect;
- worst case, it looks like session hijacking and anti-cheat takes an interest.

Neither is acceptable. So:

> **Invariant: for the lifetime of a game session, the source address the game server
> sees never changes.**

This constrains what route switching can do. The path is conceptually three segments:

```
client ──[segment 1]── ingress PoP ──[segment 2]── egress PoP ──[segment 3]── game server
                                        ↑
                          this address is pinned for the session
```

Route optimisation is free to change **segment 2** — the middle of the overlay, including
inserting or removing transit hops — as often as measurement justifies. It must not
change the egress PoP once a session is established, because that would change segment
3's source address.

Practical implications:

- Egress selection happens **once**, at session start, and is chosen conservatively:
  the PoP with the best *stable* path to the game server, not the momentarily fastest.
- Ingress can also change (client roaming from Wi-Fi to Ethernet, for instance) because
  segment 1's addressing is invisible to the game server. The session ID, not the
  5-tuple, identifies the session — the same property that makes QUIC connection
  migration work.
- If the egress PoP fails outright, we cannot preserve the invariant. Fail *open* to the
  direct path rather than silently rehoming to a different egress: a brief ping spike is
  recoverable, a mid-match disconnect is not.

## Traffic selection: what goes in the tunnel

Only game traffic. Routing the user's whole connection is wrong for three reasons: it
breaks their other applications' latency and geolocation, it puts video streaming
through our relays (the one thing that *would* make bandwidth expensive), and it widens
our exposure to their private traffic for no benefit.

Selection is by **destination**, not by process — see
[`02-windows-client.md`](02-windows-client.md) for why that choice avoids an entire
category of platform difficulty. The game server address database that makes it possible
is described in [`03-control-plane.md`](03-control-plane.md).

## Explicitly rejected designs

Recording these so they don't get reinvented:

| Rejected | Why |
|---|---|
| TCP fallback for the tunnel | Head-of-line blocking and retransmission on a latency-critical UDP stream. Makes the metric we sell strictly worse. |
| Reliable tunnel / ARQ | Same. A retransmitted position update is stale on arrival. |
| Large-block FEC | Requires buffering to reconstruct; the buffering costs more latency than the loss did. Duplication achieves the same goal with zero added delay. |
| Routing all device traffic | Breaks other apps, explodes bandwidth cost, unnecessary privacy exposure. |
| Kernel-mode packet processing in v1 | A bug is a BSOD. Massive signing burden. Userspace is fast enough at 150 kbps per user. See [ADR 0002](../adr/0002-userspace-tunnel-first.md). |
| Per-process interception via custom WFP callout driver in v1 | Requires our own signed kernel driver; destination-based selection gets us the same result for games. Revisit only if a real game defeats it. |
| Choosing paths by mean RTT | Does not correspond to what players perceive. |
| Compressing game payloads | Already compressed or encrypted by the game; compression adds CPU and latency for ~0% gain. |
