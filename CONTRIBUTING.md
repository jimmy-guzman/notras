# Contributing

You need:

- Node, which `.nvmrc` pins to v24.19.0
- [pnpm](https://pnpm.io), whose version corepack reads out of `package.json`
- a [Rust toolchain](https://www.rust-lang.org/tools/install)

Then:

```bash
corepack enable
pnpm install
pnpm dev
```

On first launch notras creates `~/notras` and builds the index. Change the folder in settings (`⌘,`).

| Script                | Description                                       |
| --------------------- | ------------------------------------------------- |
| `pnpm dev`            | run the desktop app (`tauri dev`)                 |
| `pnpm build`          | build the desktop bundle                          |
| `pnpm dev:web`        | run only the web shell (Vite)                     |
| `pnpm build:web`      | build only the web shell                          |
| `pnpm bindings`       | regenerate the Rust command and event client      |
| `pnpm bindings:check` | fail if a temporary native binding export differs |
| `pnpm check`          | type-aware lint, type check and format check      |
| `pnpm fix`            | lint and format, auto-fixing                      |
| `pnpm test`           | run tests (Vitest, watches)                       |
| `pnpm coverage`       | tests with coverage                               |
| `pnpm knip`           | unused code/deps, test-only exports               |
| `pnpm icons`          | generate the icon family and README hero          |
| `pnpm clean`          | remove build output                               |
| `pnpm prepare`        | install the git hooks (lefthook)                  |
| `pnpm tauri`          | run the tauri cli directly                        |

To regenerate the icon family and README hero, edit `assets/icon.svg` for the shared vector artwork or `assets/icon-desktop.png` for the large desktop artwork, then run `pnpm icons`. The command needs macOS for `iconutil`, ImageMagick from `brew install imagemagick`, and project dependencies installed with `pnpm install`.

Edit the sources rather than the generated files in `src-tauri/icons/`, the marks and icons in `public/`, or `assets/hero.png`.

Rust commands run from the repository root. The workspace holds the `notras-core` engine and the Tauri shell in `src-tauri`. Install the extra tools once:

```bash
cargo install cargo-machete --locked --version 0.9.2
cargo install cargo-llvm-cov --locked --version 0.9.1
```

| Command | Description |
| --- | --- |
| `cargo machete` | unused Rust dependencies |
| `cargo fmt --all -- --check` | Rust formatting check |
| `cargo fmt --all` | format Rust sources |
| `cargo clippy --workspace --locked --all-targets -- -D warnings` | Clippy, with warnings treated as errors |
| `cargo test -p notras-core --locked` | engine tests without Tauri or binding metadata |
| `cargo test --workspace --locked` | engine and shell tests, including doctests |
| `scripts/check-rust-coverage.sh` | tests with Rust coverage reports in `target/coverage/`, without a threshold |

`AGENTS.md` maps the project docs and the rules for changing them.
