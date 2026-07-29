# 06 — Anti-cheat compatibility and trust

**This is the document that decides whether the company survives.** One ban wave
attributed to our software and the product is dead — refunds, chargebacks, a permanent
association with cheating, and no recovery path. Everything here is a hard requirement,
not a guideline.

## Four distinct risks, routinely confused

People say "will it get flagged by EAC?" as though it were one question. It is four, with
different causes and different mitigations.

| # | Risk | Failure mode | Where it comes from |
|---|---|---|---|
| 1 | **Detection** | User gets banned from the game | Touching the game process |
| 2 | **Compatibility** | Game refuses to launch | Our driver on an anti-cheat blocklist |
| 3 | **Policy / ToS** | User banned for how they used us | Region evasion, matchmaking manipulation |
| 4 | **Egress reputation** | Whole PoP IP flagged as a bot farm | Too many accounts per egress IP |

Risk 4 is the one most teams don't see coming. It is discussed at the end.

## Risk 1 — Detection: stay out of the game process

Modern anti-cheats (Riot Vanguard, Easy Anti-Cheat, BattlEye, Ricochet, ACE, mhyprot) run
kernel components that observe process creation, loaded modules, hook tables, and handles
opened against the protected process. BattlEye's driver specifically tracks injected DLLs
and handles targeting the game, and adds behavioural heuristics on top.

**None of them care about your network route.** Anti-cheat inspects the integrity of the
game process and the machine's driver state. A packet arriving via Frankfurt instead of
Amsterdam is not a signal it looks at — it cannot be, because millions of legitimate
players are behind CGNAT, corporate proxies and consumer VPNs.

So the rule that keeps us safe is narrow and absolute:

### Forbidden, without exception

- `OpenProcess` against a game process for any purpose
- DLL injection by any mechanism (`LoadLibrary`, manual mapping, `SetWindowsHookEx`,
  AppInit, shim databases)
- Reading or writing game process memory
- Inline hooks, IAT/EAT patching, or detours inside the game
- Hooking DirectX/Vulkan/OpenGL present to draw an overlay
- Attaching a debugger, or anything that looks like one
- Synthesising input (`SendInput`, driver-level input emulation) — this is aim-assist
  behaviour and gets treated as such
- Suspending or manipulating game threads

Note that **overlays are on that list.** Overlay software that hooks into the game process
is a documented source of EAC false positives — Discord, OBS, GPU monitoring utilities and
Logitech G-Hub have all triggered flags. Those vendors have relationships with anti-cheat
companies and years of allowlisting; we would have neither. If we want to display
statistics during a match, the answer is a second-monitor / alt-tab panel, not an
overlay. Shipping an overlay to gain a UI nicety while risking user bans is not a trade
worth making.

### Explicitly permitted

- Reading the OS process list (`CreateToolhelp32Snapshot`, `EnumProcesses`)
- Reading the OS connection table (`GetExtendedUdpTable`, `GetExtendedTcpTable`)
- Reading present-timing from ETW providers (`Microsoft-Windows-DxgKrnl`)
- Setting process priority of *background* (non-game) processes
- Routing table and virtual adapter operations

The distinction is *whose* state we inspect. Asking Windows "what is running and what
sockets exist" reads operating system bookkeeping. Opening a handle into the game's
address space reads the game. The first is what task manager does; the second is what a
cheat does. We only ever do the first — and we should say so publicly, in a technical
whitepaper, because it is a real differentiator.

## Risk 2 — Compatibility: the driver blocklist problem

This one is subtler and is where an otherwise-correct design can still fail.

Vanguard does not only look for cheats. It enforces a policy on the machine's **driver
state**, and will refuse to let the game start if it finds a driver it doesn't trust,
surfacing errors like `VAN: Incompatible Software` and `VAN: Incompatible OEM Driver`.
Reported causes include unsigned or outdated drivers and, notably, **drivers that do not
support DMA Remapping (DMAr)** — without DMAr, Vanguard can't guarantee memory integrity
and blocks the game rather than take the risk. Riot has previously shipped Vanguard
updates that blocked common input-device drivers and then hotfixed them, which tells you
how sensitive this surface is.

Now the uncomfortable part, stated plainly: **Wintun is a kernel driver.** Our choice in
[`02-windows-client.md`](02-windows-client.md) avoids *authoring and signing* a driver, but
it does not avoid *having* one. So this risk does not disappear — it is minimised, and it
must be verified empirically rather than assumed.

Why Wintun is nonetheless the right choice:

- It is deployed at enormous scale by WireGuard, Tailscale, Cloudflare WARP and Mullvad.
  Millions of Valorant players already have it installed. If Vanguard blocked Wintun, it
  would be a widely-reported outage, not a surprise we discover.
- It is signed by WireGuard LLC and actively maintained.
- Any incompatibility would be WireGuard's bug to fix, and they have the relationships to
  get it fixed — whereas a blocklisted bespoke driver of ours would be entirely our problem.

Compare that to a driver we wrote ourselves: unknown to every anti-cheat vendor, zero
install base, and a fresh target for blocklisting the moment a cheat developer abuses a
weakness in it. A vulnerable third-party driver is a standard cheat-loading technique
(bring-your-own-vulnerable-driver), so *any* new driver that can touch network state is
something anti-cheat vendors are institutionally suspicious of. This is an independent
reason to avoid writing one, on top of the signing cost.

### Engineering requirements that follow

These are concrete and easy to get wrong:

1. **Never load or unload a driver while a game is running.** Bring the adapter up before
   the game launches and leave it up. A driver appearing mid-session is exactly the
   pattern a cheat loader produces, and it is the most likely way a legitimate
   implementation gets flagged.
2. **Have the tunnel established before game start.** Detect game launch and, if
   acceleration is enabled, prepare the adapter and routes *first*. If the user enables us
   after the game is already running, prefer to apply routes only (adapter already up) and
   surface a "restart the game for best results" prompt over hot-loading anything.
3. **Persist the adapter across sessions.** Creating and destroying it per-session
   maximises exactly the pattern in (1). Create at service start, keep it idle when unused.
4. **Never change the egress IP mid-session.** Already required for gameplay reasons in
   [`01-data-plane.md`](01-data-plane.md); it doubles as anti-cheat hygiene, since a source
   address change mid-match resembles session hijacking.
5. **No kernel driver of our own without an explicit ADR** and an anti-cheat vendor
   conversation first.

## Risk 3 — Policy: what we must refuse to sell

Detection risk is about our code. Policy risk is about our *marketing*, and it can get
users banned even with technically flawless software.

**We will not build or advertise matchmaking manipulation.** LagoFast markets an "Easy
Lobbies" feature for Warzone that matches players against lower-skilled opponents. That
works by manipulating the region/latency signals the matchmaker uses, it is against Call
of Duty's terms of service, and Activision bans accounts for it. Shipping that feature
means knowingly selling users a ban. It also poisons the whole product's reputation with
publishers, which forecloses the co-marketing deals discussed in
[`05-rewards-and-drops.md`](05-rewards-and-drops.md).

Adjacent things to be careful about:

- **Region evasion.** Routing a player into a region they're not entitled to (for cheaper
  regional pricing, or to play on a locked server) violates most publishers' terms. Our
  egress selection should optimise the path to the server *the player's own client chose*,
  never relocate them to a different region. This is a constraint on the route selector,
  not just on marketing copy.
- **Riot's official position on VPNs** is that they are unsupported and a common cause of
  connection problems — support articles tell players to disable them. That is not the same
  as bannable, and the distinction matters, but it does mean Valorant/League players may
  get "turn off your VPN" as first-line support advice. Plan for that in our own support
  documentation rather than pretending it won't happen.
- **Do not advertise ban-evasion or "avoid detection"** in any form. It attracts the worst
  possible user base and puts us on the wrong side of every publisher relationship.

## Risk 4 — Egress IP reputation

The one that is easy to miss until it bites at scale.

If 500 of our users egress a game server through the same PoP IP address, the game sees
500 distinct accounts arriving from one address. That is the signature of a bot farm or a
smurf-account operation. Consequences range from CAPTCHA challenges and matchmaking
restrictions to outright IP-level blocks — and an IP-level block takes out every one of our
users on that PoP simultaneously, which will read to them as "the product is broken".

This makes **egress IP allocation a first-class capacity-planning concern**, not an
afterthought:

- Track **accounts-per-egress-IP per game** as a monitored metric with an alert threshold,
  and treat it as a scheduling constraint in egress selection alongside latency.
- Provision each PoP with a pool of egress addresses rather than a single one, and
  distribute sessions across the pool. Address pools are cheap; a blocked PoP is not.
- Prefer IP space with clean reputation and, where possible, ranges not already
  classified as hosting/VPN by commercial IP-intelligence databases — some games score
  connections on exactly that classification.
- Keep the mapping stable per user where possible (same user tends to get the same egress
  IP), which looks far more like a residential player than an address that rotates every
  session.
- Monitor for game-side blocks per (PoP, game) pair and be able to drain a specific egress
  IP from rotation quickly.

## Risk 5 (bonus) — Our own installer being flagged as malware

Software that installs a LocalSystem service, loads a network driver and redirects traffic
is behaviourally indistinguishable from malware to a heuristic AV engine. Expect false
positives from Defender and the smaller AV vendors on day one.

Mitigations, all of which take calendar time and should start before launch:

- Sign everything, consistently, with the same certificate (see
  [`02-windows-client.md`](02-windows-client.md)) — reputation accrues per certificate.
- Submit builds proactively to the Microsoft Security Intelligence submission portal, and
  to the major AV vendors' false-positive forms, ahead of each release.
- Keep binary names, publisher metadata and install paths stable across releases; churn
  resets reputation.
- Do not pack, obfuscate, or self-modify binaries. Packers are the single strongest
  heuristic malware signal, and we have no reason to use one.

## Validation before launch

Untested compatibility claims are worthless. Required lab matrix, on real hardware with
Secure Boot and TPM enabled (Valorant requires them on Windows 11):

| Game | Anti-cheat | What we're checking |
|---|---|---|
| Valorant | Vanguard (kernel, boot-start) | Game launches with Wintun present; no `VAN:` errors; tunnel up before launch |
| League of Legends | Vanguard | Same, second Vanguard title |
| Fortnite | Easy Anti-Cheat | Launch + full match with acceleration active |
| Rainbow Six Siege | BattlEye | Launch + full match |
| PUBG | BattlEye | Second BattlEye title |
| Call of Duty (current) | Ricochet (kernel) | Launch + match; **no** matchmaking manipulation |
| Genshin Impact | mhyprot | Launch + session |
| Apex Legends | EAC | Launch + match |

For each: cold boot with tunnel active, tunnel enabled mid-session, tunnel disabled
mid-session, route switch during a match, and PoP failover during a match. Record results
per anti-cheat version — these change, so this is a recurring regression suite, not a
one-time check.

## Vendor engagement

Do this *before* launch, not after the first ban report:

- **Epic / Easy Anti-Cheat** and **BattlEye** both have developer contacts and handle
  compatibility questions from legitimate software vendors. Approach them with a technical
  description of what we do and, more importantly, what we do not touch.
- Publish a **public technical whitepaper** stating the no-injection guarantee explicitly,
  and keep it accurate. It is the artefact that makes an anti-cheat vendor conversation
  short, and it is a marketing asset against competitors who cannot make the same claim.
- Maintain a **security contact and a documented incident path** for "our software may have
  caused a ban". If it ever happens, response speed determines whether it is an incident
  or an obituary.

## The one-paragraph version

We never touch the game process — no injection, no memory access, no hooks, no overlay, no
synthetic input — so detection-based anti-cheat has nothing to see. We reuse Wintun, a
driver already installed on millions of gaming PCs by WireGuard and Tailscale, instead of
authoring our own, and we never load or unload it while a game is running. We refuse to
build matchmaking manipulation or region evasion, because those get users banned no matter
how clean the code is. And we manage egress IP density per game so our PoPs never look
like bot farms.
