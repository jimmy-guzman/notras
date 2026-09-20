import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react({ compiler: true })],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    coverage: {
      exclude: [
        ...(configDefaults.coverage.exclude ?? []),
        "{vite,vitest,knip}.config.*",
      ],
    },
    environment: "happy-dom",
    exclude: [...configDefaults.exclude, ".worktrees/**", "src-tauri/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
