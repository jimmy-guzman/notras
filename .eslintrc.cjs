/** @type {import('eslint').Linter.Config} */
module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: { project: true },
  plugins: ["@typescript-eslint", "simple-import-sort", "node-import"],
  extends: [
    "eslint:recommended",
    "plugin:import-x/recommended",
    "plugin:import-x/typescript",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",
    "plugin:import-x/react",
    "plugin:@typescript-eslint/strict-type-checked",
    "plugin:@typescript-eslint/stylistic-type-checked",
    "next/core-web-vitals",
    "prettier",
  ],
  settings: {
    "import-x/resolver": {
      typescript: true,
      node: true,
    },
  },
  rules: {
    "curly": "error",
    "arrow-body-style": ["error", "always"],
    "object-shorthand": "error",
    "prefer-arrow-callback": "error",

    "node-import/prefer-node-protocol": "error",

    "simple-import-sort/exports": "error",
    "simple-import-sort/imports": "error",

    "react/self-closing-comp": "error",
    "react/jsx-curly-brace-presence": "error",

    "@typescript-eslint/consistent-type-imports": [
      "error",
      { fixStyle: "inline-type-imports" },
    ],
    "@typescript-eslint/consistent-type-exports": [
      "error",
      { fixMixedExportsWithInlineTypeSpecifier: true },
    ],
    "@typescript-eslint/no-misused-promises": [
      "error",
      { checksVoidReturn: { attributes: false } },
    ],
  },
  ignorePatterns: ["!.prettierrc.*"],
};
