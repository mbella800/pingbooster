# ADR 0003 — Never interact with a game process

**Status:** accepted · **Date:** 2026-07-29 · **Severity:** company-ending if violated

## Context

Competitors advertise FPS boosting, in-game overlays and live performance statistics. The
conventional implementations of all three involve reaching into the game process: DLL
injection, hooking the graphics API's present call, reading memory for a frame counter.

Anti-cheat systems (Riot Vanguard, Easy Anti-Cheat, BattlEye, Ricochet, ACE, mhyprot) run
kernel components that observe process creation, loaded modules, hook tables and handles
opened against the protected process.

## Decision

**We never inject into, hook, read, write or open a handle against a game process. No
exceptions, no "careful" version.**

Forbidden: `OpenProcess` against a game for any purpose; DLL injection by any mechanism
(`LoadLibrary`, manual mapping, `SetWindowsHookEx`, AppInit, shim databases); reading or
writing game memory; inline hooks, IAT/EAT patching, detours; hooking
DirectX/Vulkan/OpenGL present; attaching a debugger; synthesising input (`SendInput` or
driver-level emulation); suspending or manipulating game threads.

Permitted, because they inspect *operating system* state rather than the game: process list
enumeration (`CreateToolhelp32Snapshot`, `EnumProcesses`); the OS connection table
(`GetExtendedUdpTable`, `GetExtendedTcpTable`); ETW present-timing via
`Microsoft-Windows-DxgKrnl`; priority adjustment of *background* processes; routing table
and adapter operations.

## Rationale

One ban wave attributed to our software ends the company: refunds, chargebacks, a permanent
association with cheating, and no recovery path. The expected value of any feature that
risks it is negative regardless of how small the probability looks.

Network-layer acceleration is safe because anti-cheat does not and cannot inspect routes —
millions of legitimate players are behind CGNAT, corporate proxies and consumer VPNs.

**Overlays are explicitly included.** Overlay software that hooks into game processes is a
documented source of EAC false positives; Discord, OBS, GPU monitoring tools and Logitech
G-Hub have all triggered flags. Those vendors have anti-cheat relationships and years of
allowlisting. We have neither. If we want in-match statistics, the answer is a
second-monitor panel, not an overlay.

The bright line is *whose* state we read. Asking Windows what is running reads OS
bookkeeping — what task manager does. Opening a handle into a game's address space reads the
game — what a cheat does. Only the first is permitted, and the rule is absolute precisely so
that no individual judgement call is ever needed.

## Consequences

- No in-game overlay, ever. Accept it as a product constraint.
- "FPS boost" is limited to background process priority, standby memory, and advisory
  settings recommendations.
- Frame-rate data, if shown, comes from ETW.
- **Applies to existing code:** `desktop/main.cjs` calls
  `os.setPriority(gamePid, PRIORITY_HIGH)`, which opens a handle against the game.
  BattlEye specifically tracks handles targeting the game. Protected titles usually deny it,
  but this should be restricted to background processes. See
  [`../review-of-desktop-preview.md`](../review-of-desktop-preview.md).
- We can publish a technical whitepaper making this guarantee — a marketing asset against
  competitors who cannot, and the thing that makes a vendor conversation short.
- We must refuse features that violate it even when a competitor ships them and it costs us
  a comparison-table row.

## Related, and equally non-negotiable

**No matchmaking manipulation and no region evasion.** LagoFast markets "Easy Lobbies" for
Warzone; it violates Call of Duty's terms and Activision bans for it. Technically clean code
does not help a user banned for how we told them to use it — and it forecloses the publisher
relationships that are the only legitimate route to real game cosmetics.
