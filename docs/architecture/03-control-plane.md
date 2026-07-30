# 03 — Control plane

The services behind both the app and the website. Small surface, high consequence: it
holds identity, money, and the signing authority for everything we push to clients.

## Stack

Rust + `axum` + PostgreSQL. The reason is not language preference — it's that the control
plane and the clients then **share `pb-proto` as literal code** rather than as two
hand-maintained copies of the same structs. Wire-format drift between client and server
is one of the most common sources of "works in staging, breaks in production" in this
class of product, and sharing the crate makes an entire category of bug unrepresentable.

Postgres for everything transactional. ClickHouse (or Timescale) for telemetry, which has
a completely different access pattern and should not share a database with billing.

## Services

| Service | Responsibility |
|---|---|
| `auth` | Identity, sessions, device authorisation |
| `entitlements` | One normalised answer to "what may this user do" |
| `directory` | Which PoPs exist, where, and their current health |
| `matrix` | Route matrix + game database, published as signed config |
| `telemetry` | Aggregated measurement ingest; feeds `matrix` |
| `rewards` | Redemption and code vault ([`05`](05-rewards-and-drops.md)) |

## Auth

OAuth2/OIDC, standard flows, no invention:

- **Website and desktop:** authorization code + PKCE. The desktop client opens the system
  browser rather than embedding a webview for login — embedded webviews break password
  managers and passkeys, and train users to type credentials into a window whose origin
  they cannot verify.
- **Console and TV-like surfaces:** device authorization grant (RFC 8628) — short code, user
  completes it on a phone.
- Short-lived access tokens (~15 min), rotating refresh tokens with reuse detection.
- Refresh tokens on desktop are stored via DPAPI, bound to the machine. They are *not*
  readable by other users on a shared PC.

The privileged service and the UI have different trust levels, so they get different
credentials: the UI holds the user token, and it passes a narrowly-scoped, short-lived
capability to the service for the specific action requested. The service never holds a
long-lived user credential.

## Entitlements: one record, many billing sources

This is where subscription products quietly break. Revenue will arrive from at least
three places — Stripe (web), Apple IAP (iOS), Google Play Billing (Android) — each with its
own lifecycle, its own grace periods, its own idea of what "expired" means, and its own
webhook reliability. If clients ask "is this user subscribed?" and the answer is computed
differently in three places, users who paid will lose access, and that generates
chargebacks and one-star reviews.

The design rule: **billing sources are inputs; entitlement is a derived, normalised
record.** Clients never see Stripe or IAP concepts.

```
Stripe webhooks ─┐
Apple ASSN      ─┼──▶ normaliser ──▶ entitlements table ──▶ GET /v1/entitlements
Google RTDN     ─┘                    (one row per user)
Promo / rewards ─┘
```

Non-negotiable properties:

- **Idempotent, replayable ingestion.** Every provider will deliver duplicates and
  out-of-order events. Store the raw event keyed by provider event ID; derive state from
  the event log, never mutate state directly from a webhook handler.
- **Reconciliation job**, not just webhooks. Webhooks get lost. A periodic job re-reads
  subscription state from each provider and corrects drift. Every production incident in
  this area traces back to trusting webhooks alone.
- **Grace periods are explicit.** Payment failure starts a documented dunning window
  during which entitlement persists. Cutting access the instant a card declines is both
  hostile and bad for revenue.
- **Entitlements are capability-shaped, not plan-shaped.** The client asks "may I use
  premium PoPs / dual-path / N devices", not "is the user on plan X". Repricing and
  repackaging then never requires a client release.

## Signed configuration: the game database and route matrix

Two datasets change constantly and must reach clients without an app update:

**Game database** — for each supported game: identifying executables, known server address
ranges, protocol hints, and per-game routing policy. Adding a game must be a config
publish, never a release. With thousands of games, this dataset *is* a large part of the
product, and its update velocity is a competitive advantage.

**Route matrix** — the current best-path table computed from live measurement
([`04-edge-network.md`](04-edge-network.md)).

Both ship through the same pipeline:

```
authored/computed ──▶ signed (ed25519, key in KMS/HSM) ──▶ CDN ──▶ client verifies
```

Requirements:

- **Client-side signature verification with a pinned public key**, independent of TLS. TLS
  authenticates the CDN; it does not stop a compromised CDN account or a mis-issued
  certificate from serving hostile config. Since config controls *where user traffic is
  sent*, unsigned config is a traffic-interception vulnerability.
- **Monotonic version + expiry.** A client must refuse config older than what it has
  (rollback attack) and refuse config past its expiry (stale-config attack).
- Signing key lives in KMS/HSM. It is never in the repository, never in CI environment
  variables, and publishing requires a deliberate, audited action.
- Config is data, not code. No expression evaluation, no scripting in config. A config
  format that can express logic is a remote code execution surface.

## Node directory

Clients ask for candidate PoPs; the directory answers with a geo- and health-aware subset,
short TTL, signed by the same mechanism.

Deliberately: the directory returns *candidates*, and the **client** does the final
measurement and selection. Server-side "we know your best node" is guesswork about the
last mile — the segment we can't see and the one that varies most. The client is the only
place with ground truth about its own connection, so it decides. The directory's job is to
narrow thousands of possibilities to a handful worth probing.

## Telemetry

Telemetry is the product's intelligence: aggregated client measurements are what make the
route matrix good, and the network improves as it gains users. Worth being deliberate
about privacy, both because it's right and because a game booster that leaks browsing
behaviour is a headline.

- Send **measurements**, not traffic. Per-path RTT/jitter/loss summaries, game ID, coarse
  geography, PoP ID. Never payloads, never full destination lists from a user's machine.
- **Aggregate destination addresses to /24** before they leave the device, and only for
  addresses already identified as game servers. We're building a map of game
  infrastructure, not of users.
- Client-side aggregation windows (tens of seconds), so we hold distributions rather than
  a per-packet event stream. Cheaper, and less identifying.
- Documented retention with real deletion. Raw telemetry TTL measured in weeks; only
  derived aggregates persist.
- One clear opt-out that genuinely reduces collection to crash reports.

## The shared contract with the website

The website and the app are two consumers of one API. The contract lives in
[`docs/api/openapi.yaml`](../api/openapi.yaml) and is the source of truth: **change the
spec first, then both consumers.**

The specific things that must not be reimplemented per-client:

- Entitlement evaluation — one endpoint, one answer, no client-side plan logic
- Subscription lifecycle and dunning state
- Reward redemption
- Auth token lifecycle

If the website computes "is premium" from a Stripe field while the app asks
`/v1/entitlements`, they will disagree, and the user will be told they're subscribed on
one surface and not the other. Adding an endpoint to the spec is cheap; reconciling two
divergent notions of subscription state in production is not.
