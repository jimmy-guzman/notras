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
        "react-refresh/only-export-components": "off",
        "react-x/no-unstable-context-value": "off",
        "unicorn/explicit-length-check": "off",
      },
    },
  ],
});
