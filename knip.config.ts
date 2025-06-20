import type { KnipConfig } from "knip";

export default {
  ignoreDependencies: [
    "gitzy",
    "tailwindcss",
    "@tailwindcss/typography",
    "tw-animate-css",
  ],
  ignoreExportsUsedInFile: true,
} satisfies KnipConfig;
