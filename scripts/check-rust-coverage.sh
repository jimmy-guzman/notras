#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../src-tauri"

cargo llvm-cov --locked --no-report
mkdir -p target/coverage
cargo llvm-cov report --lcov --output-path target/coverage/lcov.info
cargo llvm-cov report --json --summary-only --output-path target/coverage/summary.json

# The first Linux run measures the floor before this branch is ready to merge.
cargo llvm-cov report --fail-under-lines 100
