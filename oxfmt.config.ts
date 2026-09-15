import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // The preset always sets its list; oxfmt's config type leaves the field optional.
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "src/typeset.css",
    "src/server/adapters/bindings.ts",
    "CHANGELOG.md",
    ".agents",
    "assets",
    "**/Cargo.toml",
  ],
});
