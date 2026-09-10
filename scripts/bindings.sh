#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ $# -gt 1 || ( $# -eq 1 && "$1" != "--check" ) ]]; then
  echo "usage: scripts/bindings.sh [--check]" >&2
  exit 2
fi

mkdir -p src-tauri/target
bindings_tmp=$(mktemp -d "$PWD/src-tauri/target/bindings.XXXXXX")
trap 'rm -rf "$bindings_tmp"' EXIT

(
  cd src-tauri
  NOTRAS_BINDINGS_PATH="$bindings_tmp/bindings.ts" \
    cargo test --locked bindings::tests::should_export_the_native_contract -- --exact
)

if [[ "${1:-}" == "--check" ]]; then
  diff -u src/server/adapters/bindings.ts "$bindings_tmp/bindings.ts"
else
  cp "$bindings_tmp/bindings.ts" src/server/adapters/bindings.ts
fi
