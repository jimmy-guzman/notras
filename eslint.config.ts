import { defineConfig } from "@jimmy.codes/eslint-config";

export default defineConfig({
  overrides: [
    {
      files: ["**/next-env.d.ts"],
      rules: { "import-x/extensions": "off" },
    },
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
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["lucide-react"],
                importNamePattern: "^[A-Z](?!.*Icon$)",
                message:
                  "Import the Icon-suffixed version instead (e.g., PlusIcon instead of Plus).",
              },
            ],
          },
        ],
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
              {
                group: ["next", "next/*", "react", "react-dom", "node:*"],
                message:
                  "src/core is isomorphic -- it runs in the browser and in any server runtime. Keep it free of framework and Node-only imports.",
              },
              {
                group: [
                  "@/server/*",
                  "@/lib/*",
                  "@/components/*",
                  "@/actions/*",
                ],
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
              {
                group: ["next", "next/*", "react", "react-dom", "@/env"],
                message:
                  "The data and service layers stay framework-free so they can run outside Next.js. Inject the behavior instead -- see CacheInvalidator in src/core and makeDatabaseLayer in src/server/db. Only src/server/runtime.ts and src/server/cache-invalidator.ts may import Next.js.",
              },
              {
                group: ["@/lib/*", "@/components/*", "@/actions/*"],
                message:
                  "The server layer must not depend on app-layer code. Shared helpers belong in src/core.",
              },
            ],
          },
        ],
      },
    },
  ],
});
