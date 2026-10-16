# Clashlings — Market Arena

An original 3D creature/tower battle game. Build an eight-card deck from twelve token-inspired fighters, destroy side towers to gain deployment territory, and defeat the central tower or lead after 150 seconds.

## Implemented

- Twelve new illustrated card characters and matching articulated, volumetric 3D rigs: BTC bull, SOL fox, ETH crystal tortoise, XRP penguin, BONK Shiba gliders, NVDA chip golem, PEPE frog, DOGE dragon, WIF beanie bruiser, POPCAT moth, MEW cat slime and BRETT hawk. These are game representations; NVDA is an equity price reference.
- Dark navy/gold shared theme, responsive battle/collection/upgrades/ranks/trainer/rewards screens, fixed timer/health/hand layout, orbitable 3D camera, accessible lane controls, reduced motion and 2D compatibility fallback.
- Free bot practice, one-time 1,000-credit trainer grant, 25/50/100 noncash credit battles, friend rooms, transactional reservations/payouts, upgrades, ranks and result celebrations.
- Wallet Standard Solana sign-in with exact server-generated message, Ed25519 verification, domain/nonce/expiry/replay protections and opaque HttpOnly sessions. Existing Sites identity remains compatible. WalletConnect QR/mobile relay is implemented and awaits a Reown project ID.
- Market prices from free public feeds (CoinGecko for crypto, Yahoo Finance for NVDA) or Pyth Hermes when a key is configured, with a shared cache, match-start price baselines and damage updates every `MARKET_INTERVAL` seconds using `clamp(1 + priceChange × MARKET_SENSITIVITY, .85, 1.15)` (see `public/game/tokens.js`). Missing/stale prices are neutral, never simulated. Creatures show market moods and reactions when their damage rises or falls.
- One daily server-selected spin and 5/20/100 settled-player-win milestones, claimed once per UTC day. Rewards currently award noncash credits; bot wins do not count.
- Character-specific game-token staking ladders (levels 1–5), wallet transaction review, verified finalized receipts, locked-position checks, refunds, expired-position withdrawal and resumable confirmations. Credit progression and token staking levels are separate.
- Two-finalized-escrow token matchmaking, server-authoritative results, verified payout allocations and an idempotent settlement outbox. The Solana staking/escrow program and HMAC adapter live in `services/contracts`. Real token mode stays disabled until that program, the mint, the adapter and the settlement key are deployed.
- A separate deployable Cloudflare realtime Worker: one SQLite Durable Object per match, fixed ticks, compact player-specific WebSocket snapshots, command acknowledgements, one-use connection tickets, durable recovery and settlement retry.
- Online client prediction (`public/game/predict.js`): the client runs the same deterministic simulation as practice mode, a little ahead of the server by about one round trip, so your own deploys appear instantly. Each authoritative snapshot rebases the simulation and replays commands the server has not acknowledged yet. The server applies a deploy at the game time it was predicted for (up to 0.5 s ahead), so both sides converge exactly.
- Improved live HTTP fallback: independent command queue, stable IDs, no input dropped by a read request, out-of-order rejection and timestamped interpolation. HTTP fallback is not qualified for 500 concurrent players.

## Current publication boundary

The Sites publication includes the game and D1 backend. It cannot provision the separate Durable Object namespace through the current Sites manifest. Deploy `services/realtime` in your Cloudflare account and configure its URL/shared secret to activate WebSockets. Production 500-player capacity has not been verified. A local 500-connection run with mocked dependencies is documented, including its latency limit.

Robinhood integration is not part of this project. The arena program is included but not deployed from this publication. Pyth API key, Reown project ID, game mint and live adapter secrets are not configured here. Live token entry/staking stays unavailable until those values are set; practice, credit battles, wallet sign-in and credit rewards remain usable.

## Code map

- `public/game/engine.js`, `tokens.js`: deterministic combat, deployment areas, token roster, damage and staking policies.
- `public/game/client.js`, `network.js`, `snapshots.js`, `wire.js`, `wallet.js`: UI, ordered transport, rendering buffer, compact protocol and wallet connection.
- `public/game/three/`: shared procedural geometry, articulated motion, effects, environment, health HUD and camera/ray picking.
- `lib/backend.js`: API authorization, profiles, credit accounting, queue/rooms and contract-backed token flow.
- `lib/wallet-auth.js`, `market.js`, `contracts.js`, `rewards.js`, `security.js`: isolated backend concerns.
- `services/realtime/worker.js`, `wrangler.jsonc`: independent realtime deployment.
- `services/contracts/`: Solana staking/escrow program, PDA layout and HTTPS contract adapter.
- `db/schema.ts`, `drizzle/`: D1 schema, indexes and append-only migrations.
- `docs/BACKEND-DESIGN.md`: research and architecture written before implementation.
- `docs/INTEGRATION.md`: exact owner configuration and contract-adapter protocol.
- `docs/VALIDATION.md`: checks performed, measured local load and remaining qualification.
- `docs/TOKEN-ART-PROMPT.md`, `ART.md`: art provenance/design map.

## Checks

```sh
node --test tests/*.test.mjs
cargo test --manifest-path services/contracts/Cargo.toml
npm --prefix services/contracts/adapter test
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/load-realtime.mjs --players 500 --seconds 10
npm run build
```

To run the realtime server locally, start `pnpm realtime:dev` (port 8787) next to `pnpm dev`. The site reads `REALTIME_URL=http://127.0.0.1:8787`, `REALTIME_SHARED_SECRET` and `SITE_ORIGIN=http://127.0.0.1:5173` from the git-ignored `.env.local`; the worker reads the same secret and origin from `services/realtime/.dev.vars`. Without the realtime server, online matches fall back to HTTP.

To run the staking adapter locally, start `pnpm adapter:dev` (port 8788) next to `pnpm dev`. Put the same `CONTRACT_ADAPTER_KEY`, `GAME_TOKEN_MINT` and `GAME_PROGRAM_ID` in `.env.local` and in `services/contracts/adapter/.env` (RPC and settlement keypair stay on the adapter). `CONTRACT_ADAPTER_URL=http://127.0.0.1:8788` is enough for staking review; token battles also need `LIVE_TOKEN_ENABLED=true`, Pyth, and realtime.

Requires Node 22.13+ and the lockfile's package-manager dependencies. Hosted D1 migrations apply during Sites publication. Preserve the Sites build integration and `DB` binding. Never edit already-applied migration history.

Browser/GPU/physical-device visual playtesting was unavailable in the authoring environment. Geometry/framing, actual local D1 transactions, wallet cryptography and actual local workerd WebSockets are covered separately; automated checks do not certify mobile frame rate or production capacity.
