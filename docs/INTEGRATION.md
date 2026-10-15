# Deployment and contract integration

The Sites publication runs the frontend, wallet sessions, D1 accounts, rewards, credit economy, oracle cache and contract bridge. The realtime Worker is a separate deployment. No smart contract, token issuance, Robinhood integration or production token transfer has been deployed by this project.

## Configuration

Set runtime values with the hosting environment's secret/configuration controls. Do not commit real values. `.env.example` lists names only. Solana is the supported transaction chain; other assets are price references for fighters.

| Value | Where | Purpose |
| --- | --- | --- |
| `PYTH_API_KEY` | Sites secret | Required Hermes authentication; never sent to browsers |
| `PYTH_ENDPOINT` | Sites config | Default `https://pyth.dourolabs.app/hermes` |
| `PYTH_FEED_IDS` | Sites config, optional JSON | Symbol → Core 64-hex feed ID overrides; otherwise exact-symbol catalog discovery |
| `WALLETCONNECT_PROJECT_ID` | Sites config | Reown project ID for QR/mobile connection; allowlist the exact site origin in Reown |
| `SITE_ORIGIN` | Both config | Exact public HTTPS game origin; pin it before wallet/contract launch |
| `REALTIME_URL` | Sites config | HTTPS origin of the separately deployed realtime Worker |
| `REALTIME_SHARED_SECRET` | Both secrets | Same high-entropy secret on Sites and the realtime Worker |
| `GAME_TOKEN_MINT` | Sites config | Owner's SPL game-token mint |
| `GAME_TOKEN_DECIMALS` | Sites config | Integer 0–12, default 9; use the mint's actual decimals |
| `GAME_TOKEN_SYMBOL` | Sites config | Game-token display symbol, default `GAME` |
| `GAME_PROGRAM_ID` | Sites config | Owner's audited game/staking/escrow program |
| `CONTRACT_ADAPTER_URL` | Sites config | Owner's HTTPS adapter origin implementing the protocol below |
| `CONTRACT_ADAPTER_KEY` | Sites secret + adapter secret | Shared server-only HMAC key for adapter requests/callbacks |
| `STAKE_LOCK_SECONDS` | Sites config | Default 604800 (7 days), minimum 86400 |
| `LIVE_TOKEN_ENABLED` | Sites config | Keep `false` until actual integration and staging qualification; enable explicitly with `true` |

Installed Wallet Standard wallets can authenticate without a Reown project ID. WalletConnect QR/mobile relay requires the project ID. A wallet connection is followed by a separate server-verified login signature.

## Deploy the realtime service

1. Use your Cloudflare account and the included `services/realtime/wrangler.jsonc`. It creates the `MATCHES` SQLite Durable Object namespace with migration `v1`; each match ID routes to a distinct object.
2. Keep `SITE_ORIGIN` equal to the deployed Sites origin. Provision `REALTIME_SHARED_SECRET` using `wrangler secret put REALTIME_SHARED_SECRET --config services/realtime/wrangler.jsonc` and set the same value through Sites secret controls. Never pass the value on a command line or commit it.
3. Deploy using `node node_modules/wrangler/bin/wrangler.js deploy --config services/realtime/wrangler.jsonc` from the checkout after authenticating your Cloudflare account. This was not run against an external account during authoring.
4. Configure `REALTIME_URL` on Sites and redeploy the saved application version to apply the environment revision. `/health` must return `{ "ok": true, "protocol": 1 }` before token entry is reserved. New credit matches can use HTTP when the realtime health check fails; existing realtime matches never change authority.
5. Realtime traffic uses short-lived, one-use, origin-bound signed tickets minted by Sites after checking match membership. Internal bootstrap/oracle/settlement requests use HMAC. This publication is public; private hosting would additionally need the platform's supported service-access boundary configured.

The Worker runs a 100 ms authoritative tick and broadcasts compact snapshots. Full authoritative state, accepted command receipts and terminal outbox are durable. Active timers incur normal Durable Object duration charges. Turn on provider metrics/alerts for errors, tick drift, D1 latency and settlement backlog; do not enable verbose ticket/cookie/body logging.

## Contract adapter protocol

This adapter is the owner's server component that understands their actual program/IDL and uses a reliable Solana RPC provider. This repository implements the game-side client, authenticated receipt callback, wallet envelope guards and test adapter fixtures. The live adapter needs the owner's actual program/IDL; this project does not invent a deployed program interface or treat fixture receipts as on-chain proof.

Every request is JSON. `x-arena-auth` contains the HMAC-SHA256 token produced by `signedHeaders()` in `lib/security.js`: payload `{aud: "arena-service", exp: <epoch milliseconds>, hash: <base64url SHA256 of exact UTF-8 request body>, nonce: <UUID>}`. Verify with the shared adapter key and expiry before decoding an operation. TLS is required. Every operation must be idempotent by the provided intent/settlement ID.

### POST `/v1/prepare`

Input includes `id`, `kind` (`stake`, `escrow`, `refund`, `unstake`), `wallet`, `amountUnits` (decimal integer string), `card`, `targetLevel`, `matchId`, `side`, `position` when applicable, `createdAt`, `expiresAt`, `lockUntil`, plus configured `programId`, `mint`, `decimals`, `chain: "solana:mainnet"`.

Return `{intentId, transaction, expiresAt}`. `transaction` is an unsigned/partially signed base64 Solana legacy or v0 transaction. The wallet must be the fee payer, all account keys must be static, and the only top-level programs permitted are the configured game program and Compute Budget. A game instruction must explicitly include the wallet and mint. Associated-token-account creation and transfers must occur through the game program's checked CPI path. Address lookup tables are deliberately rejected by the envelope guard until a verified resolver is added. Do not include unrelated transfers, delegates or approvals. Encode/check the complete intent in the game instruction, not only its amount.

The server checks the envelope before presenting it to a wallet. Full instruction meaning and the account derivation/authorization scheme must be verified by the adapter and game program, using the actual IDL. The wallet still presents its own transaction review. A 3-minute server TTL is shortened when the adapter returns an earlier expiry; it must fit the actual blockhash validity.

### POST `/v1/verify`

Input includes `intentId`, transaction `signature`, expected kind/wallet/amount/card/level/match/side/position, `createdAt`, `expiresAt`, program/mint/decimals/chain. Independently fetch the transaction and account state from Solana. Do not echo these expectations as proof. Check transaction success and finality, authorized signer, exact program, mint, token program, decimals, integer amount, bound intent, PDA/position ownership and lock/refund/withdrawal state. Also verify the instruction's deadline and block time.

Pending response: `{finalized:false}`. It grants nothing. A successful finalized receipt must contain:

```json
{
  "finalized": true,
  "success": true,
  "intentId": "the original ID",
  "signature": "verified base58 transaction signature",
  "kind": "stake",
  "programId": "configured program",
  "mint": "configured mint",
  "decimals": 9,
  "wallet": "verified signer",
  "amountUnits": "300000000000",
  "position": "unique base58 position/receipt PDA",
  "blockTime": 1800000000000,
  "card": 0,
  "targetLevel": 2,
  "lockUntil": 1800604800000,
  "locked": true
}
```

`blockTime` and lock times are epoch **milliseconds**, unlike Solana RPC's seconds. The server requires blockTime within the intent interval (15-second skew tolerance), rejects mismatched receipts, deduplicates signatures and position PDAs, and grants levels only after finality. Each staking intent must have a unique immutable position PDA; aggregate stake by summing active positions. Lock terms must prevent early withdrawal; before token matches, `/v1/positions` rechecks active positions.

For escrow, include `matchId`, `side`, `locked:true`. For refund, include `matchId`, `refunded:true`, and the original escrow position. For unstake, include the original staking position and `withdrawn:true`. Refund/withdrawal destinations must be the original verified wallet. The contract must independently enforce cancellation/expiry eligibility and prevent double payout/refund, regardless of the browser or adapter.

The browser never sends a trusted balance, level, winner or payout. Prepared intents can be verified after their wall-clock TTL for recovery, but the finalized transaction's blockTime must still satisfy the original intent interval. Trainer displays unresolved transaction signatures for resuming confirmation, refundable escrows, expired staking positions and settlement status.

### POST `/v1/positions`

Input: `{wallet, positions:[{intentId,position}], ...configuration}`. Return `{finalized:true,positions:[{position,wallet,mint,programId,amountUnits,lockUntil,active:true}]}` from finalized on-chain account state. After the minimum lock ends, a position is withdrawable but still counts while its tokens remain staked. Missing, withdrawn, slashed or changed positions become inactive before a new token match snapshots levels. Adapter/network failures block token match activation.

### POST `/v1/settle`

Input includes stable `settlementId: "match:<id>"`, `matchId`, authoritative `winner` (0/1 or -1 draw), `amountUnits` **per participant**, and both `{wallet,side,position}` escrow references. The result comes only from the authoritative room via authenticated Sites code. The owner's contract must define how it verifies the result (e.g. authorized result signer/attestation and its replay/deadline rules). That trust model belongs to the contract; this game does not pretend an HTTP outcome is a trustless on-chain proof.

The adapter submits/retries settlement using the same key and returns pending until finalized. Final receipt includes `finalized:true`, `success:true`, `matchId`, `winner`, `programId`, `mint`, `decimals`, `amountUnits`, base58 transaction `signature`, and exactly two `payouts:[{wallet,amountUnits}]`. Winner receives 2× entry, loser 0; a draw returns 1× entry to each. The backend validates these allocations before final rank/daily-win credit. No off-chain spendable token balance is fabricated. The durable outbox retries interrupted settlement; uniqueness/transaction guards prevent duplicate account awards.

### Receipt callback

After a prepared transaction finalizes, POST `{intentId,signature}` to the game's `/api/contract-receipt` with `signedHeaders()` using the adapter key. The game independently invokes `/v1/verify` and resumes escrow activation/staking without depending on the browser remaining open. Callbacks can be replayed safely. A confirmed escrow for a cancelled/expired room returns `cancelled:true,refundAvailable:true`; it does not start a match. Use this callback alongside the browser confirmation path and retry it when temporarily unavailable.

## Qualification before token launch

The included local concurrency run opened 500 real workerd WebSockets across 250 SQLite Durable Objects, using mocked account/oracle/settlement dependencies. It is not a production capacity claim. Snapshot bandwidth fell about 74% after compact framing, but the synchronized command burst still exceeded the proposed regional 250 ms p95 acknowledgement target locally. See `VALIDATION.md` for measured numbers.

Deploy a staging service and run `scripts/load-realtime.mjs` with prepared per-player staging connection-ticket fixtures. `STAGING_LOAD_TEST=1` is required for network fixture mode. Each fixture is `{url,origin,side}`; URLs contain short-lived secrets, so keep fixture files untracked and do not log them. The runner can also be used locally without fixtures:

```sh
node scripts/load-realtime.mjs --players 500 --seconds 10
STAGING_LOAD_TEST=1 node scripts/load-realtime.mjs --fixtures /absolute/staging-tickets.json --players 500 --seconds 1800
```

Use staged ramps, regional jitter, reconnect, oracle outage, room restart, large-unit matches and settlement retry scenarios. Assert zero accepted-input loss, no hidden-hand leakage, no duplicate stake/payout, and exact token/credit conservation. Measure actual database/RPC/oracle limits and mobile GPU frame rate separately. Real deposits and staking stay disabled in this publication because the owner's mint, program, adapter, Pyth key, Reown project and external realtime deployment are not configured.
