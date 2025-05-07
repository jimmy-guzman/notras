import type { KnipConfig } from "knip";

export default {
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
