# ADR 0002 — Reuse Wintun; do not author a kernel driver

**Status:** accepted · **Date:** 2026-07-29

## Context

Routing selected traffic on Windows requires a virtual network adapter or a packet
redirection mechanism. Both are kernel-mode. The options:

1. **Wintun** — WireGuard's userspace-facing layer-3 TUN adapter. The `.sys` is signed by
   WireGuard LLC; we redistribute it.
2. **A WFP callout driver of our own** — operates at the ALE layers, can redirect
   per-process by AppId. The precise approach, and the one competitors reach for.
3. **WinDivert** — a general packet capture/redirect library, itself a WFP callout driver.

## Decision

**Redistribute Wintun. Do not author, sign or ship a kernel driver of our own in v1.**

## Rationale

**Signing cost and lead time.** A kernel driver requires an EV certificate, a Microsoft
Partner Center account, and attestation signing submissions — with a re-submission cycle on
every driver change. That is weeks of calendar time before the first line of driver code
pays off, and it recurs.

**A kernel bug is a bluescreen on a paying customer's gaming PC.** There is no graceful
degradation. At ~150 kbps per user there is no performance argument that justifies accepting
that risk.

**Anti-cheat compatibility.** Vanguard enforces policy on machine driver state and blocks
the game outright for drivers it does not trust — `VAN: Incompatible Software`, `VAN:
Incompatible OEM Driver` — including drivers without DMA Remapping support. A bespoke driver
would be unknown to every anti-cheat vendor with zero install base. Wintun ships with
WireGuard, Tailscale, Cloudflare WARP and Mullvad, so millions of Valorant players already
have it: an incompatibility would be a widely-reported outage rather than something we
discover from our own ban reports.

**Bring-your-own-vulnerable-driver.** A new driver that can touch network state is
institutionally suspicious to anti-cheat vendors precisely because a weakness in it becomes
a cheat-loading vector. Not shipping one avoids becoming that target.

We do not need per-process redirection, which is the main thing a callout driver would buy —
see [ADR 0004](0004-destination-based-split-tunnelling.md).

## Consequences

- **Wintun is still a kernel driver.** This decision avoids *authoring and signing* one, not
  *having* one. The anti-cheat compatibility risk is minimised, not eliminated, and must be
  verified empirically in the lab matrix. Do not let this get remembered as "we ship no
  driver".
- The adapter must be created at service start and persist, never loaded or unloaded while a
  game is running — a driver appearing mid-session is what a cheat loader looks like.
- We cannot select traffic per-process. See ADR 0004 for why that is acceptable.
- We still need code signing for our own binaries and installer, just not driver
  attestation signing. Azure Trusted Signing is the cheap, fast path.
- Wintun's licence terms must be reviewed before distribution.

## Revisit if

A high-value game defeats destination-based selection (P2P titles are the likely case), or
Wintun proves incompatible with a major anti-cheat. Either would require an ADR and an
anti-cheat vendor conversation *before* any driver work starts.
