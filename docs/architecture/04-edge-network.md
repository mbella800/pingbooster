# 04 — The edge network

The part that is 80% of the product. A perfect client on a bad network is a bad product; a
plain client on a well-measured network is a good one.

## Don't chase the node count

LagoFast advertises 12,000+ nodes in 170+ countries. Treat that as a marketing metric.
Numbers that large are counted by enumerating entry IP addresses and virtual endpoints,
not independently provisioned relay sites.

**Twelve well-placed PoPs with good transit and honest measurement will beat twelve
thousand unmeasured ones**, because the win comes from knowing which path is better, not
from having many. Coverage is a billboard; route quality is the product.

If marketing needs a number, count the egress address pool — which we need to be large
anyway for reputation reasons ([`06`](06-anti-cheat-and-trust.md)) and which is a
defensible thing to count.

## Where to put PoPs

Site selection follows one criterion: **where is the gap between the default path and the
achievable path largest?** That correlates with markets that have (a) large player
populations, (b) poor international transit, and (c) willingness to pay. It does *not*
correlate with the biggest internet hubs — a player in Frankfurt playing on a Frankfurt
server has nothing for us to improve.

Proposed initial set, roughly in priority order:

| PoP | Serves | Why it earns its place |
|---|---|---|
| Singapore | SEA — Philippines, Indonesia, Vietnam, Thailand, Malaysia | Huge player base, consistently poor regional transit, strong existing booster demand |
| São Paulo | Brazil, Southern Cone | Large market, notoriously bad international routing |
| Istanbul | Türkiye, Caucasus | Big gaming culture, poor routing to EU servers |
| Mumbai | India | Enormous and growing, weak international paths |
| Frankfurt | EU, North Africa, Middle East overflow | EU aggregation point and transit hub |
| Ashburn | US East | Where a large share of game servers actually live |
| Los Angeles | US West, trans-Pacific | Second US anchor, Pacific bridge |
| Dubai | Middle East | Very poor default routing, high willingness to pay |
| Tokyo | Japan, Korea | Dense player base, latency-sensitive titles |
| Johannesburg | Southern Africa | Badly underserved; large achievable gains |

Ten sites covers the markets where acceleration measurably works. Expand based on
telemetry — the client already reports where the direct path is bad, so the data tells us
where PoP 11 goes. Guessing is unnecessary.

## Unit economics (and the constraint people get wrong)

Game traffic is tiny, so bandwidth is nearly free:

```
Per active user:      ~150 kbps including tunnel overhead and duplication
Playing 2 h/day:      ~8–16 GB/month, counting both directions through the PoP
At $0.01/GB:          $0.08–0.16 per user per month
Against $7.90/month revenue:  ~2% of revenue
```

On providers with generous included transit (Hetzner, OVH) it rounds to zero. Note that
hyperscaler egress pricing (~$0.09/GB on AWS) is 9× that and buys us nothing here —
this workload wants cheap, well-peered transit, not managed services.

**The real constraint is packets per second, not bandwidth.** Game traffic is small
datagrams at high frequency, which is the worst case for a network stack:

```
2,000 concurrent users × 128 Hz × 2 directions ≈ 512,000 pps
```

A naive `recvfrom`/`sendto` loop will fall over well before that. Design consequences for
the edge agent, and these are not optional:

- Batch syscalls: `recvmmsg`/`sendmmsg` at minimum; `io_uring` preferably. For the highest
  density sites, `AF_XDP` bypasses the kernel stack entirely.
- Multiple receive queues with RSS, one worker thread pinned per queue, no shared mutable
  state on the fast path.
- ChaCha20-Poly1305 is cheap per byte, but at half a million small packets per second the
  **per-packet** cost dominates. Profile per-packet, not per-gigabyte.
- Session lookup on the hot path must be O(1) and lock-free (sharded by session ID).

Plan ~2,000–4,000 concurrent sessions per modest PoP. Ten PoPs is then 20,000–40,000
concurrent, which at typical ~10% concurrency supports a few hundred thousand
subscribers. The economics are genuinely excellent — **which is exactly why effort belongs
in route quality rather than in shaving infrastructure cost.**

## Route matrix

With a dozen PoPs the graph is tiny and the computation is trivial. What matters is the
measurement feeding it.

**Continuously measured:**
1. PoP ↔ PoP, all ordered pairs (132 for 12 sites) — RTT, jitter, loss
2. PoP → known game server endpoints, from the game database ([`03`](03-control-plane.md))
3. Client-reported client → PoP quality, aggregated from telemetry

The first two we control directly. The third is the last mile, which we cannot see from
the inside and which varies most — hence the client makes the final selection
([`03`](03-control-plane.md)).

**Computation:** composite edge weight (the same jitter- and loss-weighted cost as
`pb-probe`), then k-shortest paths. Constrain to **at most one intermediate hop** initially:
each extra hop adds real latency and a failure domain, and two-segment relay captures
almost all of the available gain. Recompute on a short cycle, publish as signed config.

**Chained relay is where we beat competitors.** When the best PoP near the player has a
poor path onward to the game server, ingress → transit → egress can beat both the direct
path and single-PoP relay. Most products only offer "pick a server"; treating the overlay
as a graph to be solved is the differentiator, and it is the honest version of what
"AI Matrix Route" markets.

## Path diversity for duplication

Dual-path duplication ([`01`](01-data-plane.md)) only delivers `p_a × p_b` loss if the two
paths fail independently. Two paths through the same ingress PoP share fate completely and
the duplication buys nothing but bandwidth.

So the matrix must track diversity explicitly and score candidate *pairs*, not just
individual paths:

- Different intermediate PoP — necessary but not sufficient
- Different upstream transit provider / AS path where we can observe it
- Different physical route where known (submarine cable diversity matters enormously for
  the SEA and Africa markets, where a single cable fault takes out a whole region)
- Observed loss correlation over time — if two paths' loss events correlate historically,
  they are not diverse regardless of what the topology suggests

Empirical loss correlation is the ground truth and should override topology-based
assumptions when they disagree.

## Provisioning and operations

- **Infrastructure as code** (Terraform/OpenTofu), immutable machine images, no
  hand-configured hosts. A PoP must be reproducible from the repository, because sooner or
  later one will need to be rebuilt during an incident.
- **The edge agent is a single static Rust binary.** It pulls its configuration from the
  control plane and reports health. No SSH in steady-state operation; SSH access is a
  break-glass path that generates an alert when used.
- **Multi-provider by default.** A mix of cheap-transit (Hetzner, OVH) and
  premium-network (Vultr, GCP) providers, so a single provider's outage or policy change —
  including "we don't want VPN-like traffic" — cannot take out the platform. Assume at least
  one provider will eventually object to the workload; be able to move a PoP in a day.
- **Health and drain.** The agent reports readiness; the directory stops offering a
  draining PoP to new sessions. Draining must let existing sessions **finish naturally** —
  because of the sticky-egress invariant ([`01`](01-data-plane.md)), killing sessions on a
  draining PoP disconnects players mid-match. Drain is measured in minutes, not seconds.
- **Per-(PoP, game) block detection.** Watch for game-side rejection of a specific egress
  IP and pull it from rotation automatically ([`06`](06-anti-cheat-and-trust.md)).
- **Anycast the control plane, unicast the data plane.** Control-plane requests should hit
  the nearest healthy endpoint; data-plane sessions must know precisely which PoP they are
  on, so anycast is wrong there.

## What good looks like

Concrete targets to hold ourselves to, per accelerated session:

| Metric | Target |
|---|---|
| Sessions where we improve the composite score | > 70% of *offered* sessions |
| Sessions where we correctly decline to accelerate | 100% of cases where direct wins |
| p95 loss with dual-path active | < 0.5% |
| Mid-session egress changes | 0 |
| Route switch visible to the player | 0 disconnects |

The second row matters as much as the first. Being right about when *not* to accelerate is
what makes the first number trustworthy.
