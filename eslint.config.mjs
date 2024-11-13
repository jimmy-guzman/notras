import jimmyDotCodes from "@jimmy.codes/eslint-config";
import nextPlugin from "@next/eslint-plugin-next";

export default jimmyDotCodes({
  configs: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      name: "next",
      plugins: {
        "@next/next": nextPlugin,
      },
      rules: {
        ...nextPlugin.configs["core-web-vitals"].rules,
      },
    },
    {
      files: ["**/layout.tsx"],
      name: "react-refresh/next",
      rules: {
        "react-refresh/only-export-components": "off",
      },
    },
  ],
});
