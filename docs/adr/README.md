# Architecture decision records

Decisions that are expensive to reverse. Each states the context, what was decided, why, the
consequences we accepted, and what would justify revisiting it.

If you are about to contradict one of these, write a new ADR superseding it rather than
quietly changing the code — the reasoning here encodes constraints that are not obvious from
reading the implementation, and several of them are safety-critical.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-tauri-with-rust-core.md) | Native Rust core, thin platform shells (Tauri for desktop) | accepted |
| [0002](0002-userspace-tunnel-first.md) | Reuse Wintun; do not author a kernel driver | accepted |
| [0003](0003-never-touch-the-game-process.md) | Never interact with a game process | accepted |
| [0004](0004-destination-based-split-tunnelling.md) | Select traffic by destination, not by process | accepted |
| [0005](0005-unreliable-transport-only.md) | Unreliable transport only; no TCP fallback | accepted |

## The load-bearing ones

**[ADR 0003](0003-never-touch-the-game-process.md) is the one that cannot be relaxed.**
Violating it gets users banned from their games, which ends the company. It is absolute
specifically so that no individual judgement call is ever required.

**[ADR 0002](0002-userspace-tunnel-first.md) and [0004](0004-destination-based-split-tunnelling.md)
are a pair.** Reusing Wintun rather than writing a kernel driver is only viable because
destination-based selection removes the need for per-process redirection. Reversing either
one forces a re-examination of the other.
