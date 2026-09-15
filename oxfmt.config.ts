import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...ultracite.ignorePatterns,
    "src/typeset.css",
    "src/server/adapters/bindings.ts",
    "CHANGELOG.md",
    ".agents",
    "assets",
    "**/Cargo.toml",
  ],
});
