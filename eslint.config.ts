import { defineConfig } from "@jimmy.codes/eslint-config";
import pluginRouter from "@tanstack/eslint-plugin-router";

// Repeated into every scoped no-restricted-imports override below: flat config
// replaces rule options rather than merging them, so a scoped block that omits
// this pattern silently drops the guard for those files.
const lucideIconPattern = {
  group: ["lucide-react"],
  importNamePattern: "^[A-Z](?!.*Icon$)",
  message:
    "Import the Icon-suffixed version instead (e.g., PlusIcon instead of Plus).",
};

export default defineConfig({
  ignores: ["src-tauri/**", "src/routeTree.gen.ts"],
  overrides: [
    ...pluginRouter.configs["flat/recommended"],
    {
      files: ["**/components/ui/**/*.tsx"],
      rules: {
        "@typescript-eslint/no-unnecessary-condition": "off",
        "@typescript-eslint/no-unnecessary-type-conversion": "off",
        "@typescript-eslint/no-use-before-define": "off",
        "@typescript-eslint/prefer-nullish-coalescing": "off",
        "eqeqeq": "off",
        "jsx-a11y/click-events-have-key-events": "off",
        "jsx-a11y/no-noninteractive-element-interactions": "off",
        "react-refresh/only-export-components": "off",
        "react-x/no-array-index-key": "off",
        "react-x/no-leaked-conditional-rendering": "off",
        "react-x/no-unstable-context-value": "off",
        "unicorn/explicit-length-check": "off",
      },
    },
    {
      rules: {
        "no-inline-comments": [
          "error",
          { ignorePattern: String.raw`^\s*(TODO|FIXME):` },
        ],
        "no-restricted-imports": ["error", { patterns: [lucideIconPattern] }],
        // Route option objects are left unsorted: TanStack Router's type
        // inference is order-sensitive there, and the router plugin's
        // create-route-property-order rule owns that ordering instead.
        "perfectionist/sort-objects": [
          "error",
          {
            type: "natural",
            useConfigurationIf: {
              declarationMatchesPattern: {
                flags: "i",
                pattern: "^(?!.*Route).*$",
              },
            },
          },
          {
            type: "unsorted",
          },
        ],
      },
    },
    // unicorn/throw-new-error flags every call whose callee name ends in
    // `Error` and accepts no options, so this is the only lever. It ships a
    // hardcoded exemption for `Data.TaggedError` (eslint-plugin-unicorn#2654,
    // added for Effect) that was never extended to `Schema.TaggedError`, its
    // Effect 4 replacement. Remove once unicorn widens the exemption.
    {
      files: ["src/core/errors.ts"],
      rules: {
        "unicorn/throw-new-error": "off",
      },
    },
    // Layer boundaries. These must come last: flat config replaces rule options
    // rather than merging them, so the global no-restricted-imports above would
    // otherwise clobber them.
    {
      files: ["src/core/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              lucideIconPattern,
              {
                group: ["@tauri-apps/*", "react", "react-dom", "node:*"],
                message:
                  "src/core is isomorphic -- it runs in the webview and in any other runtime (tests, a future MCP server). Keep it free of platform and framework imports.",
              },
              {
                group: ["@/server/*", "@/lib/*", "@/components/*", "@/data/*"],
                message:
                  "src/core is the bottom layer and must not depend upward. Move the shared code into src/core instead.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/server/{db,repositories,schemas,services}/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              lucideIconPattern,
              {
                group: ["@tauri-apps/*", "react", "react-dom"],
                message:
                  "The data and service layers stay platform-free so they can run outside the Tauri webview (tests, a future MCP server). Inject the behavior instead -- see the FileStore port in src/core and the adapters in src/server/adapters. Only src/server/adapters/** and src/server/runtime.ts may import @tauri-apps/*.",
              },
              {
                group: ["@/lib/*", "@/components/*", "@/data/*"],
                message:
                  "The server layer must not depend on app-layer code. Shared helpers belong in src/core.",
              },
            ],
          },
        ],
      },
    },
  ],
  react: {
    overrides: {
      "react-refresh/only-export-components": [
        "error",
        {
          extraHOCs: [
            "createFileRoute",
            "createLazyFileRoute",
            "createRootRoute",
            "createRootRouteWithContext",
            "createLink",
            "createRoute",
            "createLazyRoute",
          ],
        },
      ],
    },
  },
});
