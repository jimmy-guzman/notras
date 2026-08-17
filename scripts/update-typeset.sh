#!/usr/bin/env bash
set -euo pipefail

# shadcn/typeset ships outside the registry, so `shadcn add` cannot reach it and
# this script is the upgrade path (D40). The vendored copy is byte-identical to
# upstream and oxfmt skips it, so a re-fetch diffs cleanly.
source_url="https://ui.shadcn.com/typeset.css"
target="src/typeset.css"

if [ ! -f "$target" ]; then
  echo "'$target' not found -- run from the repo root"
  exit 1
fi

echo "Fetching $source_url..."

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

curl --fail --silent --show-error --location "$source_url" --output "$tmp"

if [ ! -s "$tmp" ]; then
  echo "Fetched an empty file, leaving '$target' alone"
  exit 1
fi

if cmp --quiet "$tmp" "$target"; then
  echo "Already up to date."
  exit 0
fi

cp "$tmp" "$target"

echo "Updated $target. Review the diff, then check the note surface:"
echo "  pnpm test && pnpm dev"
