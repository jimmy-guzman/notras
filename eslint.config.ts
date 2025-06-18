import { defineConfig } from "@jimmy.codes/eslint-config";
import arrowReturnStyle from "eslint-plugin-arrow-return-style";

export default defineConfig({
  overrides: [
    {
      plugins: {
        "arrow-return-style": arrowReturnStyle,
      },
      rules: {
        "arrow-body-style": "off",
        "arrow-return-style/arrow-return-style": "error",
        "arrow-return-style/no-export-default-arrow": "error",
      },
    },
  ],
});
