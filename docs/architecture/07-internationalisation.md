# 07 — Localisation and market reach

## The counterintuitive part

**The languages that convert best for this product are not the ones with the most
purchasing power.** They are the ones where the product actually works.

A German player is usually 15 ms from a well-peered European game server. There is nothing
for us to improve, so however good the German translation is, the honest answer the client
gives will be "your connection is already optimal" — see
[`00-overview.md`](00-overview.md). A Turkish player on the same EU server is routed through
congested transit with real jitter, and we can measurably help.

So the ranking follows the same criterion as PoP placement: **where is the gap between the
default path and the achievable path largest?** Which gives a clean operating rule:

> **Language priority = PoP priority. Ship a language when a PoP serves that market.**

Localising a market we cannot yet accelerate produces polished sign-ups that churn in month
one, and those users are more expensive to reacquire than to have waited for.

## Priority order

Tier 1 ships with or immediately after the corresponding PoP.

| # | Locale | Market | Why it ranks here |
|---|---|---|---|
| 1 | `en` | Global | Baseline. Also the working language of gaming in India, the Nordics and much of SEA. |
| 2 | `tr` | Türkiye | Among the strongest markets for game boosters specifically: large player base, intense competitive gaming culture, poor routing to EU servers. Punches far above its population. |
| 3 | `pt-BR` | Brazil | Huge market, notoriously bad international routing. **Brazilian Portuguese, not European** — the difference is obvious to users and reads as carelessness. |
| 4 | `es-419` | LATAM | Latin American Spanish, not Castilian. Mexico, Argentina, Chile, Colombia, Peru. |
| 5 | `id` | Indonesia | Enormous and young player base, heavy internet café and mobile culture. |
| 6 | `ar` | Middle East | Poor default routing, high willingness to pay. **RTL — see below, this one has real engineering cost.** |
| 7 | `vi` | Vietnam | Very high gaming engagement per capita, strong esports culture. |
| 8 | `th` | Thailand | Similar profile, well-served by the Singapore PoP. |
| 9 | `fil` | Philippines | Among the highest gaming-hours-per-user markets in the world. |
| 10 | `ru` | Russia, CIS | Large gaming culture, mature PC market. |

Tier 2 — worthwhile, but the product helps less or the market is harder:

| Locale | Note |
|---|---|
| `hi` | India. English dominates gaming in metros, so this extends reach rather than unlocking it. Ships with the Mumbai PoP. |
| `zh-Hans` | Very large, and the origin market of several competitors. **Flag for legal review first:** tools that tunnel traffic sit in a regulated category in mainland China, and this is a compliance question before a translation question. |
| `pl` | Decent market, moderate routing gains. |
| `uk` | Keep distinct from `ru`; conflating them is not a neutral choice. |
| `ko`, `ja` | Excellent domestic infrastructure, so we cannot help domestic play. Only valuable for players on foreign servers — a real but narrower segment. |
| `de`, `fr`, `es-ES` | Strong purchasing power, but well-peered. Expect a high rate of "already optimal" verdicts. Localise for credibility, not for conversion. |
| `fa` | Terrible routing and huge demand, but sanctions and payment rails make it commercially impractical. Flagged deliberately rather than forgotten. |

## Architecture: the core never produces user-facing text

This is the load-bearing decision, and the existing code already satisfies it.

`pb-core` and `pb-probe` return **typed enums**, never strings: `BypassReason::DirectIsBetter`,
`DirectReason::GainTooSmall`, `DuplicationReason::TailReduction`, `ConfigRejection::Expired`.
The shell maps those to localised text.

Three things fall out of that, all of which matter:

- The core stays testable without a locale, and one code path serves every language.
- **Telemetry carries stable codes, not translated prose.** If the core emitted localised
  strings, aggregating "how often do we decline to accelerate" would mean matching
  translated text, and the answer would silently change when a translator rephrased
  something.
- Adding a language touches no logic. It is a resource change.

The rule to preserve: **if a string is user-visible, it does not exist in `crates/pb-*`.**

## Implementation

**Message format: [Fluent](https://projectfluent.org/) (FTL) for UI strings.** Built for
exactly this problem — plurals, grammatical gender and per-locale variation live in the
translation file rather than in code branches. Naive `printf`-style interpolation cannot
express "1 hop" versus "2 hops" across languages whose plural rules differ from English's
(Arabic has six plural categories; Russian has three).

**Number, date and unit formatting: `icu4x`.** Locale-correct decimal separators matter for
a product whose entire UI is numbers — `24,5 ms` in Turkish and Portuguese, `24.5 ms` in
English. Getting that wrong looks amateurish precisely where we are asking users to trust
our measurements.

**Locale selection:** OS locale on first run, always user-overridable, choice persisted.
Never infer language from IP address — for a product that routes traffic through other
countries, IP-based inference is guaranteed to be wrong sometimes, and being switched into a
language you don't read is an unrecoverable UX failure.

**RTL for Arabic is real work, not a flag.** Plan for it in the design system from the start:
logical CSS properties (`margin-inline-start`, not `margin-left`), `dir="rtl"` on the
document, mirrored directional icons, and correct bidirectional handling where Latin text
(game names, "ping", "FPS") is embedded in Arabic sentences. Retrofitting RTL onto a
finished LTR layout costs multiples of designing for it. If Arabic is in tier 1 — and it
should be — the design system must be bidirectional before the UI is built out.

**Pseudolocalisation in CI.** Render the UI with accented, expanded placeholder text (
`[!!! Ṕíñĝ ṫö ĝáṁé şéŕvéŕ !!!]`) on every build. It catches two bugs mechanically:
hardcoded strings that never reached a resource file, and layouts that break under text
expansion. German and Russian routinely run 30–40% longer than English; Turkish
agglutination produces long single words that break narrow columns.

## Translation quality

For a paid product, machine translation alone is a liability, and gaming vocabulary is where
it fails hardest.

- **Gaming terminology is idiomatic and often stays English.** Turkish gamers say "ping",
  not a translated equivalent; the same is true of "FPS", "lag" and "lobby" in many locales.
  A translator who dutifully localises these produces text that reads as foreign to the
  audience — technically correct and commercially worse.
- **Never translate game names.** Fortnite is Fortnite everywhere.
- **Never translate our own metric names inconsistently.** Pick a term for jitter per locale
  and hold it, including in support articles.
- Use native reviewers who actually play games, at minimum for tier 1. Machine translation is
  an acceptable first pass to review, never a shipping artefact.
- Keep the honesty messaging carefully translated. "Your connection to this server is already
  optimal — acceleration is off" is the sentence our credibility rests on. Translated
  clumsily, it reads as "the product does not work".

## Payments convert harder than translation does

Worth stating plainly because it is easy to spend all the effort on strings: **in most tier 1
markets, local payment methods move conversion more than language does.**

| Market | What actually matters |
|---|---|
| Brazil | **Pix** — near-universal, and card penetration for recurring billing is limited |
| India | **UPI** |
| Indonesia | E-wallets (GoPay, OVO, DANA) and bank transfer |
| Türkiye | Local card schemes, instalment options (widely expected) |
| Middle East | Regional wallets, cash-on-delivery norms in some markets |
| SEA generally | Convenience-store and carrier billing |

A perfectly translated checkout that only accepts international credit cards will convert
poorly in Brazil and Indonesia regardless of how good the Portuguese is.

**Pricing needs regional adjustment**, since $7.90/month is priced very differently against
local incomes in Jakarta than in Frankfurt. Which creates an irony specific to us:

> A regionally-priced subscription plus a traffic-routing product means users can route
> through a cheaper region to buy our own software. **Determine billing country from the
> payment instrument, never from IP address.**

## Sequencing

1. **Before UI build-out:** bidirectional-capable design system, Fluent wired up,
   pseudolocalisation in CI, `en` as the only shipped locale. Cheap now, expensive later.
2. **With the first PoPs:** `tr`, `pt-BR` (Istanbul, São Paulo), plus local payment methods
   for those two markets.
3. **As PoPs land:** `es-419`, `id`, `ar`, `vi`, `th`, `fil`, `ru`.
4. **Tier 2** on demand, driven by where telemetry shows unserved users with bad direct paths.

## The website

The site is built separately (Next.js on Cloudflare Workers), so this section is the shared
contract rather than an implementation prescription. It needs the same locales in the same
priority order — a Turkish user who lands on a Turkish ad, reads Turkish copy, then opens an
English-only app has been handed an obvious seam.

**Same glossary, same translation memory.** If the site says one thing for "jitter" and the
app says another, the product feels like two products. Maintain one glossary covering the
metric names, the plan names, and the honesty messaging, and have both surfaces draw from it.

Website-specific requirements that don't apply to the app:

- **Locale as a URL path prefix** — `/tr/`, `/pt-br/`, `/es-419/`. Not a cookie, not a
  subdomain. Each locale needs a distinct crawlable URL or it cannot rank, and paths are the
  simplest thing to serve correctly from a Worker.
- **`hreflang` alternates on every page, including `x-default`.** This is the single most
  commonly skipped piece of multilingual SEO and it is what tells search engines the pages
  are translations rather than duplicate content. Without it, localised pages compete with
  each other instead of each ranking in its own market.
- **Do not auto-redirect by IP.** It confuses crawlers (which crawl from a limited set of
  locations, so they may never see most of the site), and it traps users who prefer a
  language other than their location's. Detect, then *offer* — a dismissible banner —
  and remember the choice.
- **Per-locale sitemaps**, and per-locale `<title>`/meta descriptions written for the market
  rather than translated from English. Search intent differs: the query behind a purchase in
  Türkiye is not the literal translation of the English one.
- **Localised OG images.** Social previews are where a large share of gaming traffic
  originates.
- **Currency and local payment methods visible before checkout**, not discovered at the
  final step. In Brazil and Indonesia this is a larger conversion lever than the translation
  itself — see the payments section above.
- **Pricing page must state the renewal price**, in local currency, in the local language.
  Competitors lead with a discounted first term and renew higher; doing that clearly is a
  trust asset, and doing it unclearly generates chargebacks in exactly the markets where
  chargebacks are most damaging.

Both surfaces authenticate against the same control plane and read entitlements from the same
endpoint ([`03-control-plane.md`](03-control-plane.md)), so a user who buys in Portuguese on
the site and signs in to the app gets one account, one subscription, and one language
preference carried across.
