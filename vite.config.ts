import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // Chunks load from the app bundle, not a network. Set just above the largest chunk so growth still warns.
    chunkSizeWarningLimit: 2000,
    target: "safari26",
  },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_ENV_"],
  plugins: [react({ compiler: true }), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 1420,
    strictPort: true,
    warmup: {
      clientFiles: ["./src/main.tsx"],
    },
    watch: {
      ignored: ["**/coverage/**", "**/src-tauri/**"],
    },
  },
});
