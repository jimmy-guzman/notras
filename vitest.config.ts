import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    coverage: {
      exclude: [
        ...(configDefaults.coverage.exclude ?? []),
        "{tailwind,postcss,playwright,drizzle,next,knip}.config.*",
      ],
    },
    environment: "happy-dom",
    exclude: [...configDefaults.exclude, "e2e"],
    globals: true,
    setupFiles: "./vitest.setup.ts",
  },
});
