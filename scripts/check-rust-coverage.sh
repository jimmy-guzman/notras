#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# A failed rerun must not publish reports from an earlier run.
rm -rf target/coverage
cargo llvm-cov --workspace --locked --no-report
mkdir -p target
coverage_tmp=$(mktemp -d target/coverage.XXXXXX)
trap 'rm -rf "$coverage_tmp"' EXIT

cargo llvm-cov report --lcov --output-path "$coverage_tmp/lcov.info"
cargo llvm-cov report --json --summary-only --output-path "$coverage_tmp/summary.json"
cargo llvm-cov report
mv "$coverage_tmp" target/coverage
