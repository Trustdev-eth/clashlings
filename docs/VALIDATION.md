# Validation and launch boundary

Checked 2026-10-15. These results distinguish source/runtime tests from external production performance and visual QA.

## Automated checks

- 83 tests passed, 0 failures: gameplay, transactional D1 credit accounting, idempotent grants/reservations/refunds/settlements, daily rewards, Ed25519 wallet sessions, Pyth parsing/cache/damage rules, deployment territory, timestamped interpolation, compact-frame privacy, real local Durable Object WebSockets, contract-adapter receipt/envelope guards, escrow concurrency and browser-independent receipt callbacks.
- Actual local D1 migrations 0000–0003 were applied to test databases. Existing data/migration history was preserved; new tables/columns/indexes are appended.
- TypeScript `tsc --noEmit --incremental false` passed.
- JavaScript syntax and `git diff --check` passed.
- The Sites production build passed. The independently deployable realtime Worker also passed Wrangler `deploy --dry-run`; no external Cloudflare account deployment occurred.
- All twelve procedural models pass geometry/draw budgets, independent-joint/material disposal, animation contact timing, camera/ray-picking and deployment-edge framing checks. The 2D compatibility path has a territory-drawing regression check.

Contract tests use a signed mock adapter and transaction-shaped fixtures. They prove game-side validation and accounting behavior; they do not audit or execute the owner's future Solana program. No real wallet funds were transferred.

## Local 500-connection concurrency run

Run: `node scripts/load-realtime.mjs --players 500 --seconds 10`.

Actual local workerd WebSockets, routed to 250 separate SQLite Durable Object instances. Account/bootstrap, oracle and settlement services are mocked. The simulation begins with multiple deployed units per side; the run crosses a 20-second oracle boundary. Two synchronized input bursts exercise 1,000 unique commands plus deliberate duplicates. This is a brief local stress check, not the required regional production ramp/soak.

| Metric | Measured |
| --- | ---: |
| Concurrent player connections | 500 |
| Match objects | 250 |
| Unique commands / acknowledged | 1,000 / 1,000 |
| Missing acknowledgements | 0 |
| Protocol / hidden-hand errors | 0 / 0 |
| Snapshots received | 47,079 |
| Minimum snapshots per connection | 88 |
| Payload bytes | 90,387,668 |
| Command acknowledgement p50 / p95 / p99 | 947 / 1,648 / 1,769 ms |
| Snapshot gap p95 / p99 | 174 / 208 ms |

The first full-JSON run used 347,261,580 bytes. Compact presentation frames reduced bytes by about 74% for this fixture, while durable state retains full simulation precision. Duplicate acknowledgements are expected replies to deliberate command replays, not duplicate deployments.

**The synchronized-burst acknowledgement latency did not meet the proposed <250 ms regional p95 launch target locally.** Neither this result nor unit tests establish smooth production play for 500 users. Deploy the separate service, measure actual D1/Pyth/RPC dependencies and regional jitter, then run a ≥30-minute staged ramp and a longer soak. The current HTTP fallback is also not qualified for that capacity.

Raw compact-run output: `docs/benchmarks/realtime-local-500.json`. A staging fixture mode is provided in the load runner; it requires explicitly enabled staging access and fresh per-player tickets.

## What is live versus gated

The Sites app can serve the game, new art, territory rules, improved HTTP transport, wallet-message login, credit economy, daily spin and milestones now. The runtime configuration had no owner API/contract values at publication; the exact site origin is pinned for wallet authentication.

Live Pyth quotes need the owner's Pyth API key. Without it, the UI says neutral and damage remains 1.00×; no fake quote is shown. WalletConnect QR/mobile needs the owner's Reown project ID. Installed Wallet Standard wallets can sign in independently.

The realtime Worker is packaged as source/config but is not deployed by Sites. Cloudflare plugin discovery found no usable Cloudflare connection in this session. Token staking/entry/payout requires the actual mint/program, matching verified adapter, finalized on-chain receipts and configured realtime service. These remain visibly disabled. Credits/reward credits have no cash value. No token, Solana program, Robinhood contract or listing was launched.

## Visual verification limit

The managed environment had no supported browser-control capability. No preview server or substitute browser was started. The generated atlas was inspected as an image and model geometry/framing was checked in Node. Actual WebGL appearance, physical-device CSS layout/frame rate, installed-wallet UI prompts and a real two-person hosted match still need browser/device playtesting. Deployment success verifies hosting publication, not those visual/runtime checks.
