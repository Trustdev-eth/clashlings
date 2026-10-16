#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"

ROOT="/mnt/d/work/meme/clashlings-market-arena/services/contracts"
SO="$ROOT/target/deploy/clashlings.so"
PROGRAM_KP="$ROOT/.program-keypair.json"
PAYER_KP="$ROOT/adapter/.dev-keypair.json"
RPC="https://api.devnet.solana.com"

if [[ ! -f "$SO" ]]; then
  echo "missing $SO" >&2
  exit 1
fi

solana config set --url "$RPC" >/dev/null
echo "payer $(solana-keygen pubkey "$PAYER_KP")"
echo "program $(solana-keygen pubkey "$PROGRAM_KP")"
solana balance "$PAYER_KP" --url "$RPC"
ls -lh "$SO"

solana program deploy "$SO" \
  --url "$RPC" \
  --keypair "$PAYER_KP" \
  --program-id "$PROGRAM_KP" \
  --commitment finalized

solana program show "$(solana-keygen pubkey "$PROGRAM_KP")" --url "$RPC"
echo "DEPLOY_OK"
