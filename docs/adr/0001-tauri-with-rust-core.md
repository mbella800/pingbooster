# ADR 0001 — Native Rust core, thin platform shells (Tauri for desktop)

**Status:** accepted · **Date:** 2026-07-29

## Context

We need a Windows client first, with macOS, Android and iOS to follow. The hard part of the
client is not the interface — it is a network core that manages a virtual adapter, runs a
UDP overlay, probes candidate paths and processes packets at high rates.

An existing Electron preview (`desktop/`) demonstrates the interface and some diagnostics.
The question is what the production client is built on.

## Decision

**A single Rust core (`crates/pb-*`) containing all networking, measurement and decision
logic, with thin platform shells on top. Tauri 2 for the desktop shell.**

## Rationale

The decisive point is not Tauri versus Electron — it is that **the core must be native
regardless.** A virtual network adapter, route programming, and per-packet processing at
edge rates around 500,000 pps with userspace crypto are not reachable from JavaScript. Any
JS-based client needs a native sidecar for the real work, which means the choice is only
about what wraps it.

Given a native core is mandatory, Rust and Tauri follow:

- **The core is written once.** The same crates compile into the desktop app, into Android
  via JNI, and into iOS via FFI. The tunnel, probing and route selection — the parts most
  expensive to get right and most costly to have two divergent copies of — exist in one
  place.
- **~10 MB installer against ~150 MB.** Meaningful for a consumer download.
- **Web UI in the shell**, so the desktop app and the marketing site can share a design
  system.
- **Memory safety in the component that parses hostile input.** The tunnel decodes
  attacker-influenced packets in a process that will run as LocalSystem. `#![forbid(unsafe_code)]`
  across the core crates is worth a great deal here.

Electron was considered and rejected *as the core's host*: it pays the 150 MB and RAM cost
and still requires the native sidecar, so it buys nothing on the hard part. Fully native
C++/WinUI was rejected for zero code sharing with mobile and a much smaller hiring pool.
Flutter shares only UI — every platform network integration still needs a native plugin, so
the 80% isn't shared.

## Consequences

- The existing Electron UI has value and is not wasted: the shell is replaceable
  independently of the core. If that UI is substantially built, shipping v1 on Electron over
  a Rust sidecar and swapping to Tauri later is a legitimate sequencing choice. **The core
  being native is the load-bearing decision; the shell is not.**
- `crates/pb-*` must stay platform-agnostic, with platform code behind feature-gated traits,
  so `cargo test --workspace` runs on any OS with no platform SDK. Currently 88 tests, no
  dependencies, no I/O.
- Tauri's ecosystem is smaller than Electron's; expect to write more shell glue.
- Requires Rust competence on the team. Non-trivial, and the main real cost of this decision.

## Revisit if

The mobile clients get cancelled *and* the desktop shell needs deep OS integration Tauri
lacks — at which point the core stays Rust and only the shell choice changes.
