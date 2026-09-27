import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: ["./smoke/setup.ts"],
    hookTimeout: 30_000,
    include: ["smoke/app.spec.ts"],
    maxWorkers: 1,
    retry: 0,
    testTimeout: 180_000,
  },
});
