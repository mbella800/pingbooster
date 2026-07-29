# Ping Optimizer

Ping Optimizer is a Windows technical preview for game detection, repeatable
connection diagnostics, and conservative session-only PC tuning.

## What works in 0.2

- Detects 12 supported Windows game processes.
- Selects a recommended diagnostic mode per game.
- Runs repeated TCP connection tests against Cloudflare, Google, and Quad9
  edges.
- Changes test depth and scoring for Automatic, Lowest latency, Maximum
  stability, and Quick check modes.
- Can temporarily enable the Windows High Performance power plan.
- Can temporarily raise a detected game process priority when Windows permits.
- Records a rollback journal before PC changes and restores the original values
  on exit or the next launch after an interrupted session.
- Runs low-risk DNS and adapter health checks.
- Stores settings and the latest 30 diagnostic reports locally.

## Preview limitation

Production relay routing is not active in this build. The Frankfurt, Amsterdam,
and London relay controls remain visibly locked until real servers are deployed
and measured. The app does not claim that public-edge TCP response is game
server ping or packet loss.

## Run the portable Windows build

1. Extract the entire ZIP.
2. Open `Ping Optimizer.exe`.
3. If Windows SmartScreen appears, verify the publisher status and choose
   whether to continue. This preview is not code-signed.

Keep all extracted files together. This is a portable build, not an installer.

## Development

The marketing site is in `app/`. The Electron desktop application is in
`desktop/`.
