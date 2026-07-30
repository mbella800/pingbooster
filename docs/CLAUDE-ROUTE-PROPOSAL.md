# Routing architecture proposal

**Author:** Claude (Opus 5) · **Date:** 2026-07-29 · **Status:** proposal, for independent review

Written in response to a request for a production routing architecture, initial relay
locations, route-scoring algorithm, safety rules and MVP roadmap. Intended to be reviewed,
challenged and benchmarked against an independent proposal, with measurements — not
opinion — deciding what ships.

Full detail lives in [`docs/architecture/`](architecture/); this document is the summary
plus the parts that are directly testable.

---

## 0. Implementation status — read this first

Nothing in this repository moves a packet yet. Precisely what exists:

| Component | Status | Evidence |
|---|---|---|
| Route scoring function | **Implemented, 10 unit tests** | [`crates/pb-probe/src/score.rs`](../crates/pb-probe/src/score.rs) |
| Path selection + hysteresis | **Implemented, 11 unit tests** | [`crates/pb-probe/src/select.rs`](../crates/pb-probe/src/select.rs) |
| Measurement → statistics | **Implemented, 9 unit tests** | [`crates/pb-probe/src/stats.rs`](../crates/pb-probe/src/stats.rs) |
| Duplication decision + loss model | **Implemented, 11 unit tests** | [`crates/pb-probe/src/duplication.rs`](../crates/pb-probe/src/duplication.rs) |
| Wire framing + egress de-duplication | **Implemented, 12 unit tests** | [`crates/pb-proto/src/wire.rs`](../crates/pb-proto/src/wire.rs) |
| Signed-config acceptance rules | **Implemented, 7 unit tests** | [`crates/pb-proto/src/config.rs`](../crates/pb-proto/src/config.rs) |
| Sticky-egress invariant | **Implemented, 18 unit tests** | [`crates/pb-core/src/session.rs`](../crates/pb-core/src/session.rs) |
| Tunnel data plane (`pb-tunnel`) | **Not written** | — |
| Windows integration (Wintun, routes, service) | **Not written** | — |
| Edge agent / any deployed PoP | **Not written, nothing deployed** | — |
| Control plane services | **Not written** | — |
| Desktop UI | **Not written** | — |

`cargo test --workspace` → **88 passing**. All of it is pure decision logic with no I/O.

**Every number in those tests is synthetic.** No measurement has been taken against a real
network, a real PoP or a real game server. The scoring weights in §3 are a *starting
hypothesis*, not a validated result, and I expect calibration to move them. Where this
document states a benefit it is either arithmetic (§4) or an explicitly labelled
prediction.

---

## 1. Architecture

Three segments, and which of them may change matters more than anything else here:

```
client ──[segment 1]── ingress PoP ──[segment 2]── egress PoP ──[segment 3]── game server
                                          ↑
                            source address the game server sees:
                                  PINNED for the session
```

- **Segment 1** — client to ingress. Thin authenticated UDP overlay. Session identified by
  a session ID, not the 5-tuple, so the client can roam networks invisibly.
- **Segment 2** — across our own footprint. Free to change as often as measurement
  justifies, including inserting or removing a transit hop.
- **Segment 3** — egress to game server. Chosen once, at session start.

**Transport:** unreliable UDP datagrams. 29 bytes of overhead (8B session, 4B seq, 1B path,
16B AEAD tag), Noise IK handshake, ChaCha20-Poly1305, conservative 1280-byte MTU. Fallback
is QUIC unreliable DATAGRAM (RFC 9221) over 443 for networks that block arbitrary UDP.

**No reliability, ordering, or congestion control on game traffic, ever.** A retransmitted
position update is stale on arrival — strictly worse than the loss it "fixed". If neither
UDP nor QUIC/443 works we report that acceleration is impossible on this network and stay
out of the way. TCP fallback is explicitly rejected; it would silently make the metric we
sell worse.

**Chained relay is the differentiator.** When the PoP nearest the player has a poor onward
path, ingress → transit → egress can beat both the direct path and single-PoP relay. Most
products only let you pick a server; treating the overlay as a graph to solve is the
substantive version of what competitors market as "AI routing". Capped at one intermediate
hop initially — each hop is another queue and another failure domain.

**Traffic selection is by destination, not by process.** Game server addresses are known;
routes for those destinations point at the virtual adapter and everything else is
untouched. This avoids needing a WFP callout driver (hence avoids authoring and signing a
kernel driver), is robust to how the game launches, and excludes the game's telemetry and
patching endpoints for free. It fails for uncatalogued games and for peer-to-peer titles;
those fall back to dynamic learning from the OS connection table.

---

## 2. Initial relay locations

Site selection follows one criterion: **where is the gap between the default path and the
achievable path largest?** That is not where the big internet hubs are. A player in
Frankfurt on a Frankfurt server has an 8 ms path and nothing for us to improve.

Ten sites, priority order:

| PoP | Serves | Rationale |
|---|---|---|
| Singapore | SEA (PH, ID, VN, TH, MY) | Large base, consistently poor regional transit, proven demand |
| São Paulo | Brazil, Southern Cone | Large market, notoriously bad international routing |
| Istanbul | Türkiye, Caucasus | Big gaming culture, poor routing to EU servers |
| Mumbai | India | Enormous, growing, weak international paths |
| Frankfurt | EU, North Africa | EU aggregation and transit hub |
| Ashburn | US East | Where a large share of game servers actually are |
| Los Angeles | US West, trans-Pacific | Second US anchor, Pacific bridge |
| Dubai | Middle East | Very poor default routing, high willingness to pay |
| Tokyo | Japan, Korea | Dense, latency-sensitive titles |
| Johannesburg | Southern Africa | Badly underserved, large achievable gains |

**On node counts:** competitors advertise 12,000+ nodes. That number comes from
enumerating entry IPs and virtual endpoints, not relay sites. Twelve well-placed,
well-measured PoPs beat twelve thousand unmeasured ones, because the win comes from knowing
which path is better. Expand from telemetry — the client already reports where the direct
path is bad, so data picks PoP 11.

**Egress addressing is a capacity concern, not an afterthought.** If 500 users egress a
game server from one IP, the game sees 500 accounts from one address — the signature of a
bot farm, and IP-level blocks take out every user on that PoP at once. Each PoP gets a pool
of egress addresses, accounts-per-egress-IP-per-game is a monitored metric with an alert
threshold, and a specific egress IP can be drained from rotation quickly.

**Economics** (arithmetic, not a claim about performance): ~150 kbps per active user
including overhead and duplication → 8–16 GB/month at 2 h/day → $0.08–0.16/user/month at
$0.01/GB, against ~$7.90/month revenue. Bandwidth is ~2% of revenue.

**The real constraint is packets per second, not bandwidth.** 2,000 concurrent users at
128 Hz bidirectional ≈ 512,000 pps. A naive `recvfrom`/`sendto` loop dies well before
that, so the edge agent needs `recvmmsg`/`sendmmsg` at minimum, `io_uring` preferably,
`AF_XDP` at the densest sites — with per-packet rather than per-byte profiling, RSS with
pinned workers, and O(1) lock-free session lookup. Plan 2,000–4,000 concurrent per modest PoP.

---

## 3. Route-scoring algorithm

### The claim

**Ranking paths by mean RTT is wrong, and it is the default thing to do.**

Players do not perceive mean RTT. They perceive the moments the game has to correct
itself — rubber-banding, a shot that didn't register, a hit that landed after they were
behind cover. Those are tail events driven by jitter and loss. A path with 45 ms of
dead-steady latency plays better than one averaging 30 ms with 25 ms of jitter, though
every conventional dashboard ranks the second higher.

### The function

Implemented in [`score.rs`](../crates/pb-probe/src/score.rs). Lower is better.

```
cost = rtt_p95
     + jitter_weight        × jitter
     + loss_ms_per_unit     × loss_fraction
     + hop_penalty_ms       × overlay_hops
     + low_confidence_penalty  (if samples < min_samples)
```

Starting weights — **hypotheses to be calibrated, offered precisely so they can be
attacked**:

| Weight | Value | Reasoning |
|---|---|---|
| `jitter_weight` | 2.0 | A millisecond of instability hurts about twice a millisecond of steady latency |
| `loss_ms_per_unit` | 3000.0 | 1% loss ≈ 30 ms of cost. One percent is the difference between playable and infuriating |
| `hop_penalty_ms` | 1.5 | Hops are a tiebreaker, not a veto. Also makes direct win exact ties |
| `low_confidence_penalty_ms` | 25.0 | Stops a path that got lucky on 3 probes displacing one measured over 100 |
| `min_samples` | 8 | Below this, a measurement isn't trusted |
| `switch_margin_ms` | 8.0 | Hysteresis. Without it the selector oscillates between near-equal paths |
| `min_gain_over_direct_ms` | 5.0 | Below this, don't intervene at all |

Delivered as signed config, so calibration doesn't need a client release.

### Two details that are easy to get wrong

**Jitter is mean absolute successive difference, not standard deviation.** Standard
deviation measures spread about the mean, so a path alternating 20/80/20/80 ms scores the
same as one drifting smoothly 20→80 over a minute. Those feel nothing alike: the first
rubber-bands constantly, the second is just slower than it was. Test
`jitter_distinguishes_oscillation_from_drift` pins this — successive-difference separates
them 5:1 while standard deviation rates them within 1.6× of each other. Lost probes break
the chain rather than registering as a jump, so loss isn't counted twice.

**A path measured at 100% loss must yield no statistics at all.** `Accumulator::summarize`
returns `None`. Reporting `rtt = 0.0` for a dead path would make it score as the fastest
available and win selection — a plausible bug with a spectacular failure mode.

### Selection

`select()` treats **"don't accelerate" as a first-class outcome**, distinguishing:

- `AlreadyOptimal` — direct scored at least as well. User sees "your connection to this
  server is already optimal", with the measurement.
- `GainTooSmall` — overlay better, but under `min_gain_over_direct_ms`.
- `NoOverlayCandidates` — nothing measured to compare.
- `NoBaseline` — no usable direct measurement, so no honest comparison. Deliberately not
  "accelerate anyway": without a baseline we cannot tell whether we're helping.

`Direct` is a candidate scored by the same function, not a special case.

Hysteresis is asymmetric, deliberately: *starting* to accelerate must clear
`min_gain_over_direct_ms`; *continuing* need not, or a narrowing advantage would tear down
a working tunnel mid-match. But stickiness isn't stubbornness — if direct wins by more than
the 8 ms margin, we drop back. Tests
`an_established_session_is_not_dropped_over_a_narrowed_advantage` and
`established_session_still_falls_back_when_direct_becomes_clearly_better` pin both edges.

### Why "declining to accelerate" is a feature

A competitor's client shows a fabricated "optimised" number, the player's ping doesn't
change, and they cancel in month one. Being right about when *not* to act is what makes the
claim credible on the routes where we do help. It also targets marketing: sell to players
whose routes we measurably improve, which is a segment rather than everyone.

---

## 4. Path duplication

Bandwidth is free and loss is expensive, so send each datagram over two disjoint paths and
de-duplicate at the egress. This is arithmetic, not a performance claim:

| Path A loss | Path B loss | Combined (independent) |
|---|---|---|
| 2% | 2% | 0.04% |
| 5% | 5% | 0.25% |
| 1% | 8% | 0.08% |

It also cuts latency: the egress forwards whichever copy arrives first, so effective RTT is
`min(rtt_a, rtt_b)`, truncating the jitter tail.

**The load-bearing caveat: independence is required and usually absent.** Two paths through
the same ingress share fate completely, and duplicating across them buys nothing but
bandwidth. So `PairDiversity::effective_correlation` is deliberately pessimistic — shared
ingress forces correlation to 1.0 regardless of what measurement has recorded so far — and
**measured loss correlation overrides optimistic topology** when they disagree. Modelled as
`p_a·p_b + ρ(min(p_a,p_b) − p_a·p_b)`.

Duplication is adaptive: single-path while healthy, escalating on loss (`≥0.5%`) or jitter
(`≥10 ms`). Two guards prevent a plausible bug — a secondary is rejected if it is more than
1.5× the primary's p95 (its copies lose every race, adding only load) or if its own loss
exceeds 15%. Without the RTT ceiling a distant path looks attractive purely because
multiplying loss fractions always yields a smaller number.

Stopping at two: a third copy gains `p³`, which is marginal, and triples ingress load.

---

## 5. Safety rules

Non-negotiable. Detail in
[`06-anti-cheat-and-trust.md`](architecture/06-anti-cheat-and-trust.md).

### Never touch the game process

No `OpenProcess` against a game, no DLL injection by any mechanism, no reading or writing
game memory, no inline/IAT hooks, no hooking DirectX/Vulkan present, no debugger, no
synthetic input, no thread manipulation.

**Overlays are on that list.** Overlay software that hooks into game processes is a
documented source of EAC false positives — Discord, OBS, GPU monitoring tools and Logitech
G-Hub have all triggered flags, and they have vendor relationships and years of
allowlisting that we don't. If we want in-match statistics, the answer is a second-monitor
panel, not an overlay.

Permitted, because it inspects *OS* bookkeeping rather than the game: process list
enumeration, `GetExtendedUdpTable`/`GetExtendedTcpTable`, ETW present-timing
(`Microsoft-Windows-DxgKrnl`), priority of *background* processes, routing table and
adapter operations. The distinction is whose state is read — task manager versus a cheat.

> **Note on a pattern already present in the repository:** `desktop/main.cjs` calls
> `os.setPriority(gamePid, PRIORITY_HIGH)`. That opens a handle against the protected game
> process, and BattlEye specifically tracks handles targeting the game. Protected titles
> will usually deny it (which is why the code has a "needs additional Windows permission"
> fallback), but on titles that permit it this is a logged handle-open event on the game.
> Recommend restricting priority changes to *background* processes only and dropping the
> game-process case. Low probability of a ban, non-zero, and the upside is a few frames.

### Compatibility, distinct from detection

Vanguard enforces policy on machine driver state and blocks the game outright — `VAN:
Incompatible Software`, `VAN: Incompatible OEM Driver` — for unsigned or outdated drivers,
and for drivers lacking DMA Remapping support. Riot has shipped Vanguard updates that
blocked common input-device drivers, then hotfixed them.

Stated plainly: **Wintun is a kernel driver.** Choosing it avoids *authoring and signing*
one, not *having* one, so this risk is minimised rather than eliminated and must be
verified empirically. It is nonetheless right: Wintun ships with WireGuard, Tailscale,
Cloudflare WARP and Mullvad, so millions of Valorant players already have it — an
incompatibility would be a widely-reported outage, not a surprise we discover. A bespoke
driver would be unknown to every vendor, have zero install base, and become a fresh
bring-your-own-vulnerable-driver target.

Concrete requirements that follow:

1. **Never load or unload a driver while a game is running.** A driver appearing
   mid-session is exactly what a cheat loader does, and is the likeliest way clean software
   gets flagged.
2. **Establish the tunnel before game launch.** Enabled mid-session, prefer applying routes
   only and prompting for a restart over hot-loading anything.
3. **Persist the adapter across sessions.** Create at service start, idle when unused.
4. **Never change the egress IP mid-session** — required for gameplay anyway, and doubles
   as hygiene, since a source change mid-match resembles session hijacking.
5. No kernel driver of our own without an ADR and a vendor conversation first.

### Refuse to sell bans

**No matchmaking manipulation.** LagoFast markets "Easy Lobbies" for Warzone; that
manipulates the signals the matchmaker uses, violates Call of Duty's terms, and Activision
bans for it. Shipping it means knowingly selling users a ban — and it forecloses the
publisher co-marketing deals that are the only legitimate route to real game cosmetics.

**No region evasion.** Optimise the path to the server the player's own client chose; never
relocate them to a different region. This constrains the route selector, not just marketing
copy.

### Process privilege

Privileged Windows service (adapter, routes) plus unprivileged UI, over an ACL-restricted
named pipe with per-session token auth. An app that needs the user to run the whole UI as
administrator is one exploited renderer away from full system compromise — a Tauri or
Electron webview must never hold those privileges. And an unauthenticated local pipe that
can add routes is a local privilege escalation bug that researchers actively scan VPN
clients for.

### Update integrity

Signed update manifests verified against a **key pinned in the binary, independently of
TLS**. TLS authenticates the CDN; it does nothing about a compromised CDN account or a
mis-issued certificate, which would otherwise be remote code execution as LocalSystem on
every customer machine. Same reasoning for the config channel: version must be strictly
monotonic (blocks rollback replay of validly-signed old config) and expiry enforced (bounds
a withheld-update attack). Signatures alone cannot catch either.

---

## 6. MVP roadmap

Ordered by dependency, with the items whose cost is *calendar time* first.

### Phase 0 — start immediately, in parallel with everything

1. **Code signing procurement.** Since June 2023, CA/Browser Forum rules require code
   signing keys on FIPS 140-2 Level 2 hardware; you cannot be emailed a `.pfx`. Azure
   Trusted Signing (~$10/mo, days, needs a verifiable organisation) is the cheapest and
   fastest; OV/EV with a hardware token is 1–4 weeks. Unsigned installers get
   SmartScreen-blocked, which destroys conversion. **This gates launch and nothing else
   accelerates it.**
2. **Two PoPs** (Singapore + Frankfurt, or nearest two target markets). Enough to measure.
3. **AV false-positive submissions** opened with Microsoft and major vendors — a
   LocalSystem service that loads a network driver and redirects traffic is behaviourally
   indistinguishable from malware to a heuristic engine.

### Phase 1 — prove the premise

4. **Edge agent**: UDP terminator, relay, de-duplication (framing and dedup logic already
   implemented and tested), health reporting.
5. **Measurement harness**: probe direct and overlay paths to real game servers from real
   consumer connections in target markets.
6. **Calibrate the weights in §3 against that data.** This is the gate. If we cannot
   demonstrate a material improvement on real routes, the weights are wrong or the PoPs
   are — and no amount of client polish fixes either.

### Phase 2 — the client

7. `pb-tunnel`: Noise handshake, ChaCha20-Poly1305, QUIC/443 fallback.
8. Windows service + Wintun adapter + destination-based routes, with the routing traps
   handled: pin a `/32` to the ingress via the physical interface *before* the tunnel comes
   up or the tunnel deadlocks; set adapter metric explicitly; handle or deterministically
   block IPv6 so traffic can't silently bypass acceleration; journal every route change and
   reconcile at startup so a crash doesn't leave a broken routing table.
9. Unprivileged UI over authenticated IPC, showing the honest direct-vs-accelerated comparison.
10. Game database as signed config + dynamic learning from the connection table.
11. WiX/MSI installer, signed-manifest updater, staged rollout with server-side kill switch.

### Phase 3 — before public launch

12. **Anti-cheat lab matrix** on real hardware with Secure Boot and TPM enabled (Valorant
    requires them on Win11): Valorant and League (Vanguard), Fortnite and Apex (EAC),
    Rainbow Six and PUBG (BattlEye), Call of Duty (Ricochet), Genshin (mhyprot). Per title:
    cold boot with tunnel active, enable mid-session, disable mid-session, route switch
    during a match, PoP failover during a match. Recurring regression suite — anti-cheat
    versions change.
13. **Vendor engagement** with Epic/EAC and BattlEye, plus a public technical whitepaper
    stating the no-injection guarantee. It makes the vendor conversation short and is a
    marketing asset against competitors who can't make the claim.
14. Control plane: auth, entitlements normalised across Stripe/Apple IAP/Google IAP into
    one derived record, signed node directory.
15. Expand to the remaining eight PoPs, driven by telemetry.

Deliberately deferred: custom WFP callout driver, per-process selection, console support,
in-game overlay, mobile.

---

## 7. How to settle this with measurements

Since measurement should decide, here is a protocol that can actually falsify the above.

**Test population.** Real consumer connections in at least three target markets with
genuinely bad default routing (Türkiye, Brazil, Philippines are the strongest candidates),
plus one control where direct should win (a player in the same metro as the game server).
That control matters as much as the others: a proposal that can't recognise when to stay
out of the way is not safe to ship.

**Per session, record:** direct and overlay p50/p95/p99 RTT, jitter as *both*
successive-difference and standard deviation, loss, count of >100 ms spikes, and whether
the selector chose to accelerate.

**Measure against the game server, not against an anycast resolver.** This is the single
biggest methodological trap. RTT to 1.1.1.1, 8.8.8.8 or 9.9.9.9 measures the last mile to
a nearby anycast PoP — those addresses are engineered so that everyone is close to them —
and tells you essentially nothing about the path to a Fortnite server. It will look like a
working measurement and correlate with nothing that matters. Probe real game server
endpoints, over UDP, since that is what games use and TCP connect RTT has different
queuing and middlebox behaviour.

**Acceptance criteria I am willing to be held to:**

| Metric | Target |
|---|---|
| Sessions improved, among those where we chose to accelerate | > 70% |
| Correctly declining when direct wins | 100% — a false positive here is worse than a miss |
| p95 loss with duplication active | < 0.5% |
| Mid-session egress changes | exactly 0 |
| Route switches causing a visible disconnect | exactly 0 |

**Where I expect to be wrong, and what would change my mind:**

- `loss_ms_per_unit = 3000` is the weight I am least confident in. If calibration shows
  players tolerate loss better than that, it drops.
- The 1.5× RTT ceiling on duplication secondaries is a guess.
- If measurement shows chained relay rarely wins, cap at single-PoP relay and delete the
  complexity — it is the most speculative part of the architecture.
- If Wintun turns out to trip any anti-cheat, the destination-based routing approach needs
  rethinking from scratch, not patching.

**Open question for the reviewer** (genuinely unresolved, not rhetorical): destination-based
split tunnelling depends on a good game-server address database. For peer-to-peer titles
the "server" is another player at an arbitrary address, so the model degrades. Options are
a per-process approach for those titles — which reintroduces the kernel driver — or
accepting that P2P games are unsupported at launch. I lean toward the latter for the MVP,
but that is a product call as much as a technical one.
