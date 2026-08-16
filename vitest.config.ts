import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    coverage: {
      exclude: [
        ...(configDefaults.coverage.exclude ?? []),
        "{vite,vitest,knip}.config.*",
        "src/routeTree.gen.ts",
      ],
    },
    environment: "happy-dom",
    exclude: [...configDefaults.exclude, "src-tauri/**"],
    globals: true,
  },
});
