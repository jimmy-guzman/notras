import type { KnipConfig } from "knip";

export default {
  entry: ["src/routes/**/*.tsx!"],
  ignore: ["src/components/ui/**"],
  ignoreDependencies: ["gitzy"],
  ignoreExportsUsedInFile: true,
  // Specta emits public helper types even when its selected runtime does not use them.
  ignoreIssues: { "src/server/adapters/bindings.ts": ["types"] },
  project: ["src/**/*.{ts,tsx,css}!", "*.config.ts"],
} satisfies KnipConfig;
