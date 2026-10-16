# Clashlings arena program

Solana program plus HTTP adapter for character staking and token-match escrow. The Sites backend never talks to RPC directly; it calls this adapter with the protocol in `docs/INTEGRATION.md`.

## What the program enforces

- One configured classic SPL mint. Transfers use `transfer_checked`.
- Each stake is a unique, never-closed position PDA (`stake` + 32-byte intent hash). Withdrawn positions stay on-chain so the same intent cannot be reused.
- New stakes lock until `now + lock_seconds + 60s` (minimum lock 1 day). Early withdrawal fails.
- The original wallet is the only signer that can unstake or refund. Destination ATAs are created through the program when missing.
- Match escrow is one PDA per `(match, side)`. Both sides must lock the same amount. Settlement is signed by `settlement_authority` only.
- Winner receives 2× the entry, loser 0, draw returns 1× to each. A refunded escrow cannot be settled; a settled match cannot be refunded. Replaying the same settlement is a no-op.
- Once both sides have locked, a player cannot refund unless `settlement_authority` has cancelled the match. Incomplete (one-sided) deposits can walk away. The adapter calls `cancel_match` automatically when it prepares a refund for a fully locked room.
- Pause blocks new stakes and deposits. Withdrawals, refunds, cancel, and settlement still work so funds are never trapped.

The program does **not** decide match winners. That remains a trusted settlement authority (the game server / adapter key). Treat that key like a production secret.

## Layout

```
programs/clashlings   Anchor program
adapter/              HMAC adapter: /v1/prepare, /v1/verify, /v1/positions, /v1/settle
```

Program id (devnet): `95knjFtSkTZS6vj7aJgFa5Ty8ArDKZmSnwfGyqAhLZom`

## Build and test the program

```sh
cd services/contracts
cargo test
# optional, needs the Solana BPF toolchain:
# cargo build-sbf --manifest-path programs/clashlings/Cargo.toml
```

## Adapter

Install this package with npm so it does not share the Sites pnpm workspace:

```sh
cd services/contracts/adapter
npm install
cp .env.example .env   # then fill RPC, mint, adapter HMAC, settlement keypair
npm test
npm start              # http://127.0.0.1:8788
```

Create a classic SPL mint on devnet (uses `DEVNET_PAYER_SECRET` or `AUTHORITY_KEYPAIR_PATH`):

```sh
npm run create-mint
```

Initialize once after the program is deployed (creates config + vault ATA):

```sh
AUTHORITY_KEYPAIR_PATH=~/.config/solana/id.json npm run initialize
```

Point Sites at the adapter with `GAME_PROGRAM_ID`, `GAME_TOKEN_MINT`, `CONTRACT_ADAPTER_URL` (`http://127.0.0.1:8788` locally), and the same `CONTRACT_ADAPTER_KEY`. The adapter also reads the repo `.env` / `.env.local` so the HMAC and mint stay in sync. Keep `LIVE_TOKEN_ENABLED=false` until staging qualification. Token staking uses `configured`; token battles also need realtime, Pyth, and `LIVE_TOKEN_ENABLED=true`.

## PDA seeds

| Account | Seeds |
| --- | --- |
| Config | `["config"]` |
| Vault authority | `["vault"]` |
| Stake position | `["stake", intent_hash]` |
| Match | `["match", sha256(matchId)]` |
| Escrow | `["escrow", sha256(matchId), side]` |

`intent_hash` is the 32-byte SHA-256 already used as the game's intent id (base64url).
