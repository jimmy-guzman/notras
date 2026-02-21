import type { KnipConfig } from "knip";

export default {
  ignore: ["src/components/ui/**"],
  ignoreDependencies: [
    "gitzy",
    "@eslint/mcp",
    "@knip/mcp",
    "next-devtools-mcp",
  ],
} satisfies KnipConfig;
