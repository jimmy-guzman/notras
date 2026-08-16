import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "esnext",
  },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_ENV_"],
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true,
      generatedRouteTree: "src/routeTree.gen.ts",
      routesDirectory: "src/routes",
      target: "react",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
