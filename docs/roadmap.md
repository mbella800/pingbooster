# Roadmap

Ordered by dependency. The organising principle: **items whose cost is calendar time rather
than effort go first**, because no amount of engineering velocity compensates for starting
them late.

Detailed rationale in [`CLAUDE-ROUTE-PROPOSAL.md`](CLAUDE-ROUTE-PROPOSAL.md) §6.

## Phase 0 — start now, in parallel with everything else

| Item | Why it's first |
|---|---|
| **Code signing procurement** | Since June 2023, CA/B Forum rules require signing keys on FIPS 140-2 L2 hardware — you cannot be emailed a `.pfx`. Azure Trusted Signing (~$10/mo) is days if the org qualifies; OV/EV with a hardware token is 1–4 weeks. Unsigned installers get SmartScreen-blocked, which destroys conversion. **This gates launch and nothing accelerates it.** |
| **Two PoPs** | Singapore + Frankfurt, or the nearest two target markets. Enough to measure with. |
| **AV false-positive submissions** | A LocalSystem service that loads a network driver and redirects traffic is behaviourally indistinguishable from malware to a heuristic engine. Submission and reputation both take time. |
| **Agree the API contract** | [`api/openapi.yaml`](api/openapi.yaml). Cheap now, expensive once both site and app have built account UI against divergent assumptions. |

## Phase 1 — prove the premise

| Item | Notes |
|---|---|
| Edge agent | UDP terminator, relay, de-duplication. Framing and dedup logic already implemented and tested in `pb-proto::wire`. |
| Measurement harness | Probe direct *and* overlay paths to **real game servers** from **real consumer connections** in target markets. |
| **Calibrate the scoring weights** | **This is the gate.** The weights in `pb-probe::score` are hypotheses. If we cannot demonstrate material improvement on real routes, the weights are wrong or the PoPs are — and no amount of client polish fixes either. |

Do not proceed to Phase 2 before Phase 1 produces a number. Building a client for an overlay
that doesn't help is the most expensive possible mistake here.

## Phase 2 — the client

| Item | Notes |
|---|---|
| `pb-tunnel` | Noise IK handshake, ChaCha20-Poly1305, QUIC/443 fallback |
| Windows service + Wintun + routes | Pin `/32` to ingress via physical interface *before* tunnel up; explicit adapter metric; handle or deterministically block IPv6; journal route changes and reconcile at startup |
| Unprivileged UI over authenticated IPC | Shows the honest direct-vs-accelerated comparison |
| i18n foundation | Bidirectional-capable design system, Fluent wired up, pseudolocalisation in CI, `en` only. Cheap now; retrofitting RTL onto a finished LTR layout costs multiples. See [`07-internationalisation.md`](architecture/07-internationalisation.md) |
| Game database | Signed config + dynamic learning from the OS connection table |
| Installer + updater | WiX/MSI, signed manifests verified against a pinned key, staged rollout with server-side kill switch |

## Phase 3 — before public launch

| Item | Notes |
|---|---|
| **Anti-cheat lab matrix** | Real hardware, Secure Boot + TPM on. Valorant/League (Vanguard), Fortnite/Apex (EAC), R6/PUBG (BattlEye), CoD (Ricochet), Genshin (mhyprot). Per title: cold boot with tunnel active, enable mid-session, disable mid-session, route switch during a match, PoP failover during a match. Recurring regression suite. |
| Vendor engagement | Epic/EAC and BattlEye, plus a public technical whitepaper stating the no-injection guarantee |
| Control plane | Auth, entitlements normalised across Stripe/Apple IAP/Google IAP into one derived record, signed node directory |
| Egress IP pools + density monitoring | Accounts-per-egress-IP-per-game alerting, per-(PoP, game) block detection with fast drain |
| Tier 1 locales + local payment methods | `tr` and `pt-BR` with the Istanbul/São Paulo PoPs, then the rest as PoPs land. Language priority tracks PoP priority — localising a market we can't yet accelerate produces churn. Local payment rails (Pix, UPI, e-wallets) move conversion more than translation does. |
| Billing country from payment instrument, not IP | Regional pricing plus a traffic-routing product means users could otherwise route through a cheaper region to buy our own software |
| Remaining eight PoPs | Driven by telemetry, not guesswork |

## Deliberately deferred

Custom WFP callout driver · per-process selection · console support · in-game overlay
(permanently — [ADR 0003](adr/0003-never-touch-the-game-process.md)) · mobile clients ·
code vault (build when a publisher or distributor deal is close enough to be real)

## Risk register

| Risk | Severity | Mitigation | Owner |
|---|---|---|---|
| Anti-cheat ban wave attributed to us | **Company-ending** | [ADR 0003](adr/0003-never-touch-the-game-process.md), lab matrix, vendor engagement, documented incident path | Engineering |
| Code signing not ready at launch | Blocks launch | Phase 0, item 1 | Ops |
| Overlay doesn't beat direct paths in target markets | Invalidates the product | Phase 1 gate before client investment | Engineering |
| Wintun incompatible with an anti-cheat | High | Empirically verify early; it is a kernel driver, and this is *minimised* not eliminated | Engineering |
| Egress IPs flagged as bot farms | Takes out a whole PoP | Address pools, density monitoring, fast drain | Ops |
| Billing sources diverge, paying users lose access | Chargebacks, reviews | One normalised entitlement record + reconciliation job, not webhooks alone | Backend |
| Provider objects to the workload | Loses a PoP | Multi-provider from the start; be able to move a PoP in a day | Ops |
| P2P titles unsupportable | Product gap | Stated honestly rather than silently ineffective; see [ADR 0004](adr/0004-destination-based-split-tunnelling.md) | Product |
