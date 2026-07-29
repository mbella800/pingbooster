# 05 — Rewards, and the Twitch Drops question

## The direct answer

**We cannot offer Twitch Drops for Fortnite, or for any other game we don't own. That is
not a difficulty to engineer around — it is structurally impossible.**

Twitch's own developer documentation makes the requirements explicit:

- A Drops campaign requires a **Developer Organization that owns the game category** on
  Twitch. Getting that ownership means requesting approval from Twitch and waiting one to
  two weeks — and they only grant it to the game's actual owner.
- The game itself must implement **account linking** and be **capable of granting in-game
  entitlements**. The reward is delivered by the game's own backend, not by Twitch.
- `Get Drops Entitlements` requires the caller to be a **member of the organization that
  owns the game**. An App Access Token from an unrelated organisation cannot read or
  fulfil another game's entitlements.
- Developers are obliged to fulfil claimed rewards within 14 days of campaign end — an
  obligation only the game's operator can discharge.

For Fortnite, that organisation is Epic Games. A Fortnite skin only exists because Epic's
entitlement service mints it. There is no API, partnership tier, or integration that lets a
third-party utility create Fortnite Drops. Any vendor claiming otherwise is either
reselling codes from a real Epic deal or lying.

There is also an exclusivity term worth knowing before any negotiation: a developer running
Drops **may not enter a similar program with a third-party streaming platform for 90 days
before or after** a Drop's distribution. That constrains what a publisher can agree to with
us and when.

## What we can legitimately build

Three mechanics, in ascending order of cost and descending order of how quickly you can
have them. The good news: the *acquisition and retention value* the Twitch idea was
reaching for is mostly captured by the first two, which need nobody's permission.

### 1. Drops Radar — an in-app campaign tracker

Surface, in the app and on the site: which games currently have active Drops campaigns,
what the rewards are, how much watch time each requires, when the campaign ends, and a
deep link to a currently-live qualifying stream.

- Needs no permission from anyone — it presents publicly available campaign information.
- It is genuinely one of the most-used features of third-party gaming utilities; players
  actively search for "what drops are live right now".
- We already run a signed, hot-updatable config channel for the game database
  ([`03`](03-control-plane.md)). Campaign data ships down the same pipe with no client
  release.
- It reinforces the core product: the games with active Drops are the games people are
  about to play, which is exactly when they want lower ping.

Build this first. It is days of work, it needs no deals, and it is the single best
return-on-effort item in this document.

### 2. Watch-to-earn, using our own currency

The mechanic the Drops idea really wants: *watch a stream, get something.* We can do that
today — provided the reward is **ours to give**.

User links their Twitch account → we verify they watched a PingBooster-sponsored stream →
we grant PingBooster premium days, or credit toward a plan. No publisher required, because
we control the entitlement end to end. It plugs straight into the entitlements service as
just another input alongside Stripe and IAP ([`03`](03-control-plane.md)).

On the technical vehicle, honestly: Twitch does not expose a general "did this user watch
channel X for Y minutes" API to arbitrary third parties — that capability is what Drops
*is*, and it's reserved for game owners. The realistic mechanism is a **Twitch Extension**
installed on partnered streamers' channels, which can establish viewer identity with the
viewer's consent and accrue watch time. Before committing engineering effort, this needs
checking against Twitch's Extensions guidelines and policies, which restrict what
extensions may offer and how they may use viewer identity. Treat that review as a
prerequisite, not a formality.

A lower-tech variant that works immediately and is worth shipping while the above is
reviewed: **streamer-specific promo codes.** Sponsored creator says the code, viewers
redeem it for premium days. Trivially attributable, standard influencer-marketing
practice, no platform integration at all.

### 3. Real game cosmetics — a business deal, not an integration

The only legitimate route to handing a user an actual Fortnite skin is obtaining codes from
someone entitled to issue them:

- **Publisher co-marketing.** "Buy a 12-month plan, get [cosmetic]." The publisher issues
  a batch of codes as part of a marketing agreement. This is how legitimate bundles work,
  and it is a business-development motion — we are pitching a publisher on reaching our
  players.
- **Authorised distributors.** Established channels exist for prepaid game currency
  (V-Bucks cards, Riot PINs, platform gift cards). Buy wholesale, bundle with plans.
  Lower margin, no negotiation, available immediately.
- Grey-market key resellers are **out of scope**: fraud-sourced codes get revoked after
  the user has redeemed them, which turns a promotion into a mass refund event plus a
  publisher relationship we can never repair.

Publishers will ask what our players are worth to them and whether we are safe to be
associated with. Which is one more reason the position in
[`06-anti-cheat-and-trust.md`](06-anti-cheat-and-trust.md) — no injection, no matchmaking
manipulation, no region evasion — is a commercial asset and not just an engineering
constraint. A booster that advertises "easy lobbies" cannot credibly ask Epic for a
co-marketing deal.

## Never do these

| Don't | Why |
|---|---|
| Automate or farm Drops on users' behalf (bot-watching streams) | Violates Twitch's terms, gets the user's Twitch account *and* linked game account banned, and exposes us to legal action from both platforms. It also destroys any chance of publisher deals. |
| Claim to "give Fortnite skins" without an Epic agreement | We cannot deliver, so it is a false advertising claim, and it uses Epic's marks without permission. |
| Facilitate account trading or reselling drop-earned items | Against every publisher's terms; attracts fraud and chargebacks. |
| Ask users for their game account credentials to "deliver" rewards | Credential harvesting. Even with good intentions it trains users into the exact behaviour that gets them phished. Rewards are delivered as redeemable codes, always. |

## Engineering: the rewards service

One service handles all three mechanics, because they share a shape: *decide eligibility,
grant a thing exactly once, prove afterwards that we did.*

```
                  ┌──────────────────────┐
own-brand ───────▶│                      │──▶ entitlements service (premium days)
code vault ──────▶│   rewards service    │──▶ one-time code delivery
campaign feed ───▶│                      │──▶ informational only (Drops Radar)
                  └──────────────────────┘
                            │
                            ▼
                    immutable audit log
```

**The code vault** is the part that needs care, because it holds items with real cash value:

- Codes are encrypted at rest with a KMS-held key and decrypted only at the moment of
  delivery to an eligible user. A dump of the database must not be a dump of the codes.
- **Claiming is atomic.** `SELECT ... FOR UPDATE SKIP LOCKED` (or a claim table with a
  unique constraint on user+campaign) so a code cannot be issued twice under concurrency.
  Double-issuing a code means two users are told they own the same item and one of them is
  wrong — a support and reputation problem out of proportion to the bug.
- **Never log a code value.** Not in application logs, not in traces, not in error
  reports. Redact at the type level so it cannot happen by accident — a `Secret<String>`
  wrapper whose `Debug`/`Display` impl prints `[redacted]`.
- **Eligibility is checked server-side against entitlements**, never asserted by the
  client. Gate high-value rewards on payment-verified accounts with an account age
  threshold; free-tier reward farming via disposable accounts is otherwise guaranteed.
- **Velocity limits and anti-abuse:** one per account per campaign, plus device and payment
  fingerprinting. Assume organised farming attempts from day one — codes with resale value
  attract exactly that.
- **Immutable audit log** of every issuance. Publishers will want reconciliation, and if
  codes leak we need to know precisely which ones and to whom.
- Track **remaining inventory** and stop promising rewards we no longer have. Running out
  mid-campaign after advertising it is worse than a smaller campaign.

## Recommended sequence

1. **Drops Radar.** Days of work, no dependencies, immediate retention value.
2. **Streamer promo codes.** Standard creator marketing; validates whether the audience
   converts before we build anything complex.
3. **Twitch account linking + watch-to-earn**, subject to the Extensions policy review.
4. **Code vault**, built when the first publisher or distributor deal is close enough to be
   real — not speculatively.

Steps 1 and 2 deliver most of the growth benefit for a small fraction of the effort, and
neither requires a conversation with Twitch or Epic.
