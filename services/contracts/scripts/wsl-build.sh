#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"

URL="https://github.com/anza-xyz/platform-tools/releases/download/v1.57/platform-tools-linux-x86_64.tar.bz2"
TAR="$HOME/platform-tools-linux-x86_64.tar.bz2"
DEST="$HOME/.cache/solana/v1.57/platform-tools"
CHUNK=83886080
PARTS="$HOME/pt-parts"

echo "HOME=$HOME"
echo "cargo-build-sbf=$(command -v cargo-build-sbf)"
solana --version
cargo-build-sbf --version

mkdir -p "$PARTS" "$(dirname "$DEST")"

# Resolve the final download URL and size.
HDR=$(mktemp)
curl -sI -L --max-time 40 -o /dev/null -D "$HDR" "$URL"
FINAL=$(awk 'tolower($1)=="location:"{print $2}' "$HDR" | tr -d '\r' | tail -n1)
SIZE=$(awk 'tolower($1)=="content-length:"{print $2}' "$HDR" | tr -d '\r' | tail -n1)
rm -f "$HDR"
if [[ -z "${FINAL:-}" ]]; then FINAL="$URL"; fi
echo "final=$FINAL"
echo "size=$SIZE"

if [[ -f "$TAR" && -n "${SIZE:-}" ]]; then
  HAVE=$(stat -c%s "$TAR")
  echo "existing tar $HAVE bytes"
  if [[ "$HAVE" == "$SIZE" ]]; then
    echo "tarball already complete"
  else
    echo "tarball incomplete, will rebuild from parts"
    rm -f "$TAR"
  fi
fi

if [[ ! -f "$TAR" ]]; then
  if [[ -z "${SIZE:-}" || ! "$SIZE" =~ ^[0-9]+$ ]]; then
    echo "Could not read content-length; falling back to resume curl"
    curl -L --retry 30 --retry-all-errors --retry-delay 3 --connect-timeout 30 --max-time 900 -C - -o "$TAR" "$URL"
  else
    start=0
    idx=0
    while [[ $start -lt $SIZE ]]; do
      end=$((start + CHUNK - 1))
      if [[ $end -ge $SIZE ]]; then end=$((SIZE - 1)); fi
      part=$(printf "%s/part-%02d" "$PARTS" "$idx")
      expect=$((end - start + 1))
      if [[ -f "$part" ]]; then
        have=$(stat -c%s "$part")
        if [[ "$have" == "$expect" ]]; then
          echo "part $idx already complete ($have)"
          start=$((end + 1))
          idx=$((idx + 1))
          continue
        fi
        rm -f "$part"
      fi
      echo "downloading bytes $start-$end as part $idx"
      attempt=0
      while true; do
        attempt=$((attempt + 1))
        if curl -L --fail --retry 4 --retry-all-errors --retry-delay 2 --connect-timeout 20 --max-time 180 \
          -r "$start-$end" -o "$part" "$FINAL"; then
          have=$(stat -c%s "$part")
          if [[ "$have" == "$expect" ]]; then
            break
          fi
          echo "part $idx size $have != $expect, retry"
          rm -f "$part"
        fi
        if [[ $attempt -ge 12 ]]; then
          echo "failed part $idx after $attempt attempts" >&2
          exit 1
        fi
        sleep 3
      done
      start=$((end + 1))
      idx=$((idx + 1))
    done
    echo "concatenating parts"
    cat "$PARTS"/part-* > "$TAR"
    have=$(stat -c%s "$TAR")
    echo "assembled $have bytes"
    if [[ "$have" != "$SIZE" ]]; then
      echo "assembled size mismatch" >&2
      exit 1
    fi
  fi
fi

if [[ ! -x "$DEST/rust/bin/rustc" ]]; then
  echo "extracting platform-tools"
  rm -rf "$DEST"
  mkdir -p "$DEST"
  tar -xjf "$TAR" -C "$DEST"
  if [[ -d "$DEST/platform-tools" ]]; then
    shopt -s dotglob
    mv "$DEST/platform-tools"/* "$DEST"/
    rmdir "$DEST/platform-tools"
  fi
  ls -la "$DEST" | head
fi

SRC_WIN="/mnt/d/work/meme/clashlings-market-arena/services/contracts"
BUILD="$HOME/clashlings-contracts-build"
echo "syncing sources to $BUILD"
rm -rf "$BUILD"
mkdir -p "$BUILD"
rsync -a --exclude target --exclude adapter/node_modules --exclude .anchor "$SRC_WIN/" "$BUILD/"
cd "$BUILD"

echo "building sbf"
cargo-build-sbf --manifest-path programs/clashlings/Cargo.toml --sbf-sdk "$HOME/.local/share/solana/install/active_release/bin/sdk/sbf" --tools-version v1.57

mkdir -p "$SRC_WIN/target/deploy"
cp -f target/deploy/clashlings.so "$SRC_WIN/target/deploy/clashlings.so"
ls -lh "$SRC_WIN/target/deploy/clashlings.so"
echo "BUILD_OK"
