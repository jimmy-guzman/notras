import { globSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "oxlint";
import type { OxlintOverride } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins";
import landmines from "ultracite/oxlint/landmines";
import react from "ultracite/oxlint/react";
import shadcn from "ultracite/oxlint/shadcn";
import tanstackJsPlugins from "ultracite/oxlint/tanstack/js-plugins";
import vitest from "ultracite/oxlint/vitest";

const jsPlugins = selectJsPlugins(["react-doctor"]);

const sameFolderImports = globSync("src/**/", {
  cwd: import.meta.dirname,
}).map((nativeFolder): OxlintOverride => {
  const folder = nativeFolder.replaceAll(path.sep, "/");

  return {
    files: [`${folder}/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              message: "Import a file in the same folder with ./",
              regex: `^${folder.replace(/^src/u, "@")}/[^/]+$`,
            },
          ],
        },
      ],
    },
  };
});

export default defineConfig({
  extends: [
    core,
    react,
    vitest,
    tanstackJsPlugins,
    antiSlop,
    landmines,
    jsPlugins,
    shadcn,
  ],
  // The preset always sets its list; oxlint's config type leaves the field optional.
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "src/server/adapters/bindings.ts",
    "src/typeset.css",
    ".agents",
    ".claude/skills",
    "assets",
  ],
  // Dependency analyzers read plugin packages off the root config only, so the preset's entry is restated here.
  jsPlugins: [
    ...(jsPlugins.jsPlugins ?? []),
    ...(landmines.jsPlugins ?? []),
    ...(shadcn.jsPlugins ?? []),
  ],
  options: { typeAware: true },
  overrides: [
    ...sameFolderImports,
    {
      files: ["src/**"],
      rules: { "import/no-relative-parent-imports": "error" },
    },
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
    // AGENTS.md names tests *.spec.ts.
    "landmines-structure/test-file-names": "off",
    // AGENTS.md keeps a comment that carries a why.
    "landmines-style/no-comments": "off",
    // Each entry is a wait no signal can replace: the smoke run waits on the built app's own clock, and a paste queued behind an IME composition waits on a listener a test cannot see.
    "landmines-testing/no-fixed-sleep": [
      "error",
      {
        allow: {
          "smoke/app.spec.ts": 4,
          "src/components/editor/markdown-paste.spec.ts": 2,
        },
      },
    ],
    // Each entry bounds real work: a launch of the built app, and highlight tests that tokenize thousands of lines through the worker, which runs past 5s on a loaded machine.
    "landmines-testing/no-flake-masking": [
      "error",
      {
        allow: {
          "smoke.config.ts": 2,
          "src/components/editor/code-block-shiki.spec.ts": 4,
        },
      },
    ],
    // The rule names mockIPC, the IPC seam ARCHITECTURE.md tests the frontend at, and takes no option to exempt it.
    "landmines-testing/no-test-doubles": "off",
    // AGENTS.md keeps return types on exported functions as their contract.
    "landmines-types/no-explicit-return-types": "off",
    // AGENTS.md lets a TODO mark a known gap, and the rule cannot tell one from finished work.
    // TODO: turn back on once oxlint ships unicorn/expiring-todo-comments, which checks a TODO's stated condition, or once src has no TODOs.
    "no-warning-comments": "off",
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
