import type { KnipConfig } from "knip";

export default {
  entry: ["src/routes/**/*.tsx"],
  ignore: ["src/components/ui/**"],
  ignoreDependencies: ["@biomejs/biome", "gitzy"],
  project: ["src/**/*.{ts,tsx,css}", "*.config.ts"],
} satisfies KnipConfig;
