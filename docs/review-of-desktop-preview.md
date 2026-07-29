# Review: the existing Windows technical preview

Review of `desktop/` (Electron preview, `main.cjs` / `preload.cjs` / `renderer.js`) at
commit `6a45ce3`, against what a production accelerator needs. Written to be merged with an
independent review, so it is specific about evidence and about what I am *not* confident in.

**Summary:** it is a competently built, honest diagnostic tool with a good UI shell. Several
choices in it are better than typical. It is not an accelerator, and the measurement layer
points at the wrong target in a way that would look like it works. The UI, the honesty
posture and the rollback pattern should be kept.

---

## What is right and should be preserved

**1. The README is honest.** It states plainly: *"The production relay network is not active
in this build. It does not reroute game traffic or claim to lower ping."* That is exactly
the right posture and it is rarer than it should be in this product category. It aligns with
the honesty principle in [`00-overview.md`](architecture/00-overview.md) and it should
survive into the shipping product as "we show you the measurement, including when we can't
help".

**2. Electron security posture is correct.** `contextIsolation: true`,
`nodeIntegration: false`, and a `preload.cjs` exposing a narrow, explicit API surface over
`contextBridge` rather than handing the renderer Node. That is the correct configuration and
plenty of production Electron apps get it wrong.

**3. The rollback journal is genuinely good work.** `persistRollbackJournal` writes intended
state changes to disk before applying them, `recoverInterruptedSession` reconciles on
startup, and `will-quit` restores synchronously. That is the right pattern — and notably it
is the *same* pattern the production client needs for routing table changes, for the same
reason: a crashed process leaves system state behind, and a booster that leaves a broken
routing table generates support tickets forever. This design should be lifted directly into
the Windows service.

**4. It does not touch game process memory.** Detection is via `tasklist.exe` — reading OS
bookkeeping, not the game. Correct, and see the one caveat below.

**5. Failure handling is careful.** `applyPerformanceProfile` returns explicit
`applied`/`skipped` arrays with human-readable reasons rather than silently doing nothing.
Good instinct that should carry over.

---

## The one thing that most needs to change

**The measurement targets are anycast DNS resolvers, so they cannot measure what matters.**

```js
const targets = [
  { name: "Cloudflare edge", host: "1.1.1.1" },
  { name: "Google edge",     host: "8.8.8.8" },
  { name: "Quad9 edge",      host: "9.9.9.9" },
];
```

Those three addresses are anycast and deliberately engineered so that *everyone* is close to
them — they are present in essentially every major metro. RTT to `1.1.1.1` measures the last
mile to a nearby Cloudflare PoP, typically 5–15 ms, and is close to uncorrelated with RTT to
a Fortnite server in Ashburn.

Three consequences:

- The "best edge" the scoring picks is not meaningful for game routing. All three targets
  are roughly equidistant from any given user, so the winner is mostly noise.
- The numbers shown to the user do not correspond to their game ping, so they will not match
  the in-game display, which reads as the app being broken.
- It will look like a working measurement. It returns plausible numbers that vary sensibly
  with connection quality, and it correlates with nothing we can act on. That is the
  dangerous kind of wrong.

**Fix:** probe real game server endpoints, from the game database. That database is needed
anyway for destination-based split tunnelling, so this is not extra work — it is the same
asset used earlier.

Two smaller measurement issues in the same code path:

**`tcpProbe` measures TCP connect time; games use UDP.** TCP connect RTT includes the
SYN/SYN-ACK exchange and is subject to different middlebox and queuing behaviour than a UDP
datagram. It is a reasonable stand-in when you cannot send UDP, but it is a stand-in.

**Jitter is computed as standard deviation.** `measureTarget` derives `jitter` from variance
about the mean. Standard deviation measures spread about the mean, so a path alternating
20/80/20/80 ms scores the same as one drifting smoothly from 20 to 80 over a minute — and
those feel completely different to play on. Mean absolute successive difference separates
them; `crates/pb-probe/src/stats.rs` implements it and
`jitter_distinguishes_oscillation_from_drift` demonstrates the gap (5:1 versus 1.6:1).

**Probing is serial within each target.** `measureTarget` awaits each `tcpProbe` in a loop —
up to 8 attempts at up to 1.7 s timeout. Worst case is a long wait for a user staring at a
spinner. Pipeline the probes.

---

## Anti-cheat: one concrete flag

`applyPerformanceProfile` calls:

```js
os.setPriority(game.pid, os.constants.priority.PRIORITY_HIGH);
```

Setting priority on another process requires opening a handle to it with
`PROCESS_SET_INFORMATION`. **BattlEye specifically tracks handles targeting the game
process.** This is not memory access and it is not injection — it is much milder than
either — but it is a handle-open event against a protected process, attributable to our
binary.

In practice protected titles usually deny it, which is presumably why the code has a
`"${game.name} priority needs additional Windows permission"` fallback. On titles that
permit it, the operation succeeds and is logged.

**Recommendation:** restrict priority adjustment to *background* processes — lower the
things competing with the game rather than raising the game — and drop the game-process
case. The ban probability is low but not zero, the mechanism is exactly the class of thing
anti-cheat watches, and the upside is a few frames. Not a trade worth making. Everything
else in the preview is on the right side of this line.

A related note on `powercfg /S`: switching the **system-wide** power plan is more invasive
than it looks, particularly on laptops where High Performance means battery drain. It is
correctly journaled and reverted, so this is a product judgement rather than a bug — but
per-process priority tuning of background tasks achieves most of the benefit without
touching a global system setting.

---

## Architectural gap: this codebase cannot become the accelerator

Not a criticism of the preview as a preview — it is scoped honestly as one. But it matters
for planning:

**Node cannot host the data plane.** The production client needs a virtual network adapter
(a kernel driver, via Wintun), destination-based route programming, and per-packet
processing at rates around 500,000 pps at the edge with a userspace crypto path. That is
native work — Rust or C++ — with batched syscalls and pinned workers. It is not reachable
from JavaScript at any level of effort.

So the real architecture is: **native core, thin UI shell.** Which means:

- The UI work in `desktop/` (14 KB of HTML, 22 KB of CSS, 18 KB of renderer) has real value
  and should be preserved.
- The `main.cjs` logic is a prototype of what the *privileged service* will do, and should
  be reimplemented there rather than extended — including because of the privilege point
  below.
- Whether the shell stays Electron or moves to Tauri is a secondary question once the core
  is native. Tauri is recommended in [ADR 0001](adr/0001-tauri-with-rust-core.md) — ~10 MB
  against ~150 MB, and the same Rust core later compiles into Android and iOS — but if the
  existing UI is substantially built, keeping Electron for v1 and swapping the shell later
  is a legitimate call. **The core being native is the load-bearing decision; the shell
  is not.**

**Privilege separation is missing and will be needed.** Right now the app runs as one
process, and the `powercfg` and `ipconfig /flushdns` calls fail silently when unelevated —
which is why so many code paths report "needs additional Windows permission". Creating a
virtual adapter and editing the routing table genuinely require administrator rights. The
wrong fix is running the whole app elevated: a webview rendering remote content holding
LocalSystem is one renderer exploit away from full machine compromise. The right shape is a
privileged service plus an unprivileged UI over an authenticated, ACL-restricted local IPC
channel — with the caveat that an *unauthenticated* local pipe able to add routes is itself
a local privilege escalation bug that researchers actively hunt for in VPN clients. See
[`02-windows-client.md`](architecture/02-windows-client.md).

**No shared identity or entitlement layer.** `db/schema.ts` is empty and there is no auth,
so the app and the site currently have no common notion of a user or a subscription. That is
fine today and becomes a real problem the moment both surfaces need to answer "is this user
premium?" — computed two ways, they will disagree, and a user who paid will be told they
haven't. [`03-control-plane.md`](architecture/03-control-plane.md) proposes one normalised
entitlement record and [`docs/api/openapi.yaml`](api/openapi.yaml) is the contract both
consume. Worth settling before either side builds account UI.

---

## Suggested split

Offered as a starting point, not a claim on anyone's work:

| Area | Suggested owner | Why |
|---|---|---|
| Site, marketing, account dashboard UI | Codex | Already built and further along |
| Desktop UI shell and design system | Codex | The existing UI is real work worth keeping |
| Rust core: probing, scoring, selection, session | Claude | Implemented and tested — 88 tests |
| Tunnel data plane, Windows service, Wintun | Claude | Native, and adjacent to the core |
| Edge agent and PoP provisioning | Either — needs discussion | Depends on infrastructure familiarity |
| API contract | **Jointly, and first** | Both surfaces depend on it; drift here is expensive |

The measurement-target fix is the highest-value single change in the existing code, and it
is independent of every architectural question above — worth doing regardless of how the
rest is divided.
