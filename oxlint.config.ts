import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins";
import react from "ultracite/oxlint/react";
import shadcn from "ultracite/oxlint/shadcn";
import tanstackJsPlugins from "ultracite/oxlint/tanstack/js-plugins";
import vitest from "ultracite/oxlint/vitest";

const jsPlugins = selectJsPlugins(["react-doctor"]);

export default defineConfig({
  extends: [
    core,
    react,
    vitest,
    tanstackJsPlugins,
    antiSlop,
    jsPlugins,
    shadcn,
  ],
  // The preset always sets its list; oxlint's config type leaves the field optional.
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "src/server/adapters/bindings.ts",
    "src/typeset.css",
    "assets",
  ],
  // Dependency analyzers read plugin packages off the root config only, so the preset's entry is restated here.
  jsPlugins: [...(jsPlugins.jsPlugins ?? []), ...(shadcn.jsPlugins ?? [])],
  overrides: [
    {
      files: ["**/*.spec.{ts,tsx}"],
      // The preset's own vitest override wins unless this one enables the plugin.
      plugins: ["vitest"],
      rules: {
        // A mock of a promise-returning port has nothing to await; promise-function-async keeps it async.
        "require-await": "off",
        "vitest/consistent-test-filename": [
          "error",
          { pattern: "\\.spec\\.[tj]sx?$" },
        ],
        "vitest/max-expects": "off",
        // tsgolint types a jest-dom matcher under `.resolves` as void, so `expect(await x)` is the form both checkers accept.
        "vitest/prefer-expect-resolves": "off",
      },
    },
  ],
  rules: {
    "func-style": ["error", "declaration", { allowArrowFunctions: true }],
    "react/function-component-definition": [
      "error",
      {
        namedComponents: "function-declaration",
        unnamedComponents: "function-expression",
      },
    ],
    "unicorn/no-useless-undefined": ["error", { checkArguments: false }],
  },
  settings: jsPluginSettings,
});
