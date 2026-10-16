#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
RPC=https://api.devnet.solana.com
PK=/mnt/d/work/meme/clashlings-market-arena/services/contracts/adapter/.dev-keypair.json
PROG=95knjFtSkTZS6vj7aJgFa5Ty8ArDKZmSnwfGyqAhLZom
echo "show-program"
solana program show "$PROG" --url "$RPC" --keypair "$PK" || true
echo "show-buffer"
solana account FW8gtCKS94oTDWWxz4q8UyxL88d3xfawS7nMTbzzET3X --url "$RPC" || true
echo "balance"
solana balance "$PK" --url "$RPC"
