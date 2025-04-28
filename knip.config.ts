import type { KnipConfig } from "knip";

export default {
  ignore: ["src/server/db/schemas/notes.ts"],
  ignoreDependencies: [
    "gitzy",
    "@iconify-json/*",
    "@iconify/tailwind4",
    "tailwindcss",
    "@tailwindcss/typography",
    "daisyui",
    "tw-animate-css",
  ],
  ignoreExportsUsedInFile: true,
} satisfies KnipConfig;
