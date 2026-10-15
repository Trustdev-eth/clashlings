# Clashlings market arena: backend design

Design date: 2026-10-15. Capacity goal: 500 simultaneous players (about 250 matches). This is a design target, not a measured production capacity claim.

## Existing problem and deployment boundary

The previous client polled every 250 ms, replaced the simulation snapshot, and interpolated each update over an assumed 250 ms. A shared busy flag silently discarded deployment input during reads. Every read also queried the account and active hold before reading, simulating and conditionally writing the match. Both participants competed for the same D1 row. At 500 players this starts at 2,000 requests/s and several sequential database queries per request.

Sites provisions D1 and R2, but its current hosting manifest has no Durable Object namespace. The WebSocket authority therefore ships as a separately deployable Cloudflare Worker. The Sites publication includes the browser transport, authenticated service bridge, account/economy backend and an improved HTTP fallback. Until that Worker is deployed and configured, the fallback is not qualified for 500 players. No client should silently take simulation authority when a realtime match loses its service.

## Topology and authority

Browser → Sites API: wallet challenge/session, profile, matchmaking, rewards, staking intents and realtime connection ticket.
Browser → realtime Worker → one SQLite Durable Object per match: authenticated WebSocket, command ordering, fixed 100 ms simulation, 10 Hz player-specific snapshots, command acknowledgements and reconnect recovery.
Match object → Sites authenticated internal endpoints: bootstrap immutable participants/decks/levels/price baseline; shared Pyth market cache; persist terminal outcome and idempotent settlement.
Sites → D1: transactional account ledger, reservations, final results, daily claims, wallet mappings and contract receipts. Combat frames never write D1 in realtime mode.
Sites → Pyth Hermes: one batch for the roster, with a database lease and in-isolate single-flight. Match objects consume this shared cache every `MARKET_INTERVAL` seconds (`public/game/tokens.js`).
Sites → owner's contract adapter: prepared Solana transactions and independently verified finalized escrow/staking receipts. Contracts and token issuance are outside this repository.

## Match protocol

The server owns time, randomness, elixir, legal deployment areas, damage, market multipliers, winner and economy. Client commands contain only type, stable action ID, slot and coordinates. Participant side is taken from a signed ticket, never a message. Messages and rates are bounded. Tickets bind audience, origin, player, match, side, expiry and nonce; room membership is independently checked at bootstrap. Reconnect mints a new short-lived ticket, resends unacknowledged stable IDs, and receives a fresh authoritative snapshot. Only one current socket per participant accepts commands.

Snapshots include sequence, server time, simulation time and per-player state. Opponent hand, queue, deck and internal deduplication IDs are removed. Rendering samples timestamped snapshots behind the latest accepted time, interpolates unit/tower positions and elixir, and caps extrapolation. No client-side combat or winner prediction. A pending command marker gives immediate feedback; command reads and writes never share a busy flag. Old snapshots are ignored and accepted commands are idempotent.

Each room serializes state transitions across awaits. Its durable checkpoint contains authoritative state, command acknowledgements, timing and price decisions. Accepted command state is persisted before acknowledgement. A one-second checkpoint and alarm recover an interrupted room; terminal state and a settlement outbox are persisted before results are sent. Alarm retries are idempotent. Active fight timers prevent hibernation; the design does not assume free hibernation while fighting.

## Territory

Both players initially deploy only in their own half. Destroying an opposing side tower unlocks the opposing half of that lane from just beyond the bridge up to the destroyed tower's approach. Left and right unlock independently; destroying one's own tower never grants territory. The shared engine computes rectangles used by server validation, 3D/2D placement overlays and pointer feedback. The king tower still ends the match.

## Pyth market rules

Default formula: `clamp(1 + ((current-start)/start)*6, .85, 1.15)`. Snapshot one accepted baseline at actual match creation; never reset it. Re-evaluate only at simulation boundaries 20, 40, 60, … seconds, affecting existing and future attacks for the asset equally on both sides. Store feed ID, publish time, confidence, source and multiplier in authoritative state. Use integer feed data with explicit exponent conversion, positive finite values, no future/rollback timestamps, configurable max age and a 2% maximum confidence/price ratio (our game policy).

If no valid baseline exists, that asset remains neutral for the entire match. If a later update is unavailable, stale or wide, use 1.00× until the next valid update; do not invent prices. NVDA is an equity reference, not a cryptocurrency: off-hours/stale data is visibly neutral. Pyth Hermes requires a server-only API key following the August 2026 Core upgrade. Secret/config absence is visible in the product status and cannot enable token-valued play.

The twelve game representations are BTC, SOL, ETH, XRP, BONK, NVDA, PEPE, DOGE, WIF, POPCAT, MEW and BRETT. Art is original token-inspired game art; no sponsorship or trading/listing integration is implied.

## Wallet and token economy

Support Solana Wallet Standard and WalletConnect (a configured Reown project ID is required for its relay/QR path). Connection alone grants no identity. The backend stores the exact sign-in message, nonce, wallet, host, URI and short expiry, verifies Ed25519 over those exact bytes, consumes the challenge once, then issues a Secure HttpOnly SameSite session backed by a hashed random token. Wallet login can link a signed-in existing trainer without overwriting another wallet's identity. Logout revokes the session. Keep Sites ChatGPT identity as a compatible fallback.

Credits remain explicitly noncash and distinct from the owner's future game token. Practice-credit upgrades remain available. Staking levels are a separate token-arena progression, calculated only from verified, active finalized staking positions. Requirements differ by character power tier and level; cumulative requirements are base×[0,1,3,7,15] for levels 1–5. The wallet is shown the incremental requirement and existing locked stake. There is no fake staking transaction or automatic wallet debit.

The contract adapter must prepare transactions and verify finalized receipts against the configured program, mint, decimals, wallet, exact integer amount, intent, character/target level or match ID, escrow/position account and lock state. A transaction signature alone is insufficient. Transaction reuse, concurrent reservations and replayed confirmations must be rejected. Token matches require verified escrow from both players before joining the authoritative room, and use staked levels snapshotted at that point. Results are submitted by an authenticated server endpoint/outbox, never a client-supplied winner. Settlement has pending/submitted/finalized/failed states and a stable match key; failed calls can retry without duplicate payout. The contract owner's result-verification/attestation trust model must be implemented by the adapter.

Token mode fails closed when wallet, mint/program, adapter, oracle or realtime infrastructure is not ready. Robinhood listing, token creation and contracts are not implemented or implied.

## Rewards

One cryptographically sampled daily spin per account per UTC day; server-owned weights and idempotent transactional claim/debit ledger entries. Daily PvP-win milestones at 5, 20 and 100, each claimed once per UTC day after authoritative settled wins. Practice wins do not count. Rewards are credits until a separately configured reward contract exists; UI labels them accordingly. Day boundaries and next reset are shown. Unique claim keys and account revisions prevent multi-tab duplication. Real-value reward eligibility needs the contract owner's anti-sybil policy before activation; wallet creation alone is not a uniqueness proof.

## Capacity and verification

A 500-player regional load test must run against the deployed realtime service and its actual database/oracle/adapter dependencies, not only local engine instances. Ship a load runner for 250 paired matches, realistic commands, duplicate input, reconnect and malformed-message checks. Proposed acceptance: zero lost accepted commands, zero duplicate debit/payout, no hand disclosure, p95 regional command acknowledgement <250 ms, p99 snapshot gap <400 ms; monitor room CPU/tick drift, bytes/sec, D1 latency/errors, oracle age and settlement backlog. Ramp 50→100→250→500, run ≥30 minutes and follow with a soak/outage test. Local runtime/concurrency results must be reported separately from production capacity and mobile GPU tests.

## Primary research

- Cloudflare D1 sequential throughput/limits: https://developers.cloudflare.com/d1/platform/limits/
- Durable Object WebSockets, bindings, timer behavior: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- DO scaling model: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- DO alarms, at-least-once retries: https://developers.cloudflare.com/durable-objects/api/alarms/
- Pyth Core August 2026 upgrade/API authentication: https://docs.pyth.network/price-feeds/core/upgrade
- Pyth Hermes API: https://docs.pyth.network/price-feeds/core/api-reference
- Solana authentication and signed messages: https://solana.com/docs/frontend/messages-and-auth
- Reown Solana adapter/project configuration: https://docs.reown.com/advanced/providers/solana-adapter
- Solana finalized transaction inspection: https://solana.com/docs/rpc/http/gettransaction
- k6 WebSocket protocol testing: https://grafana.com/docs/k6/latest/using-k6/protocols/websockets/
