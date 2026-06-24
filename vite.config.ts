/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed dev port and produces a relative-path build so the
// bundled webview can load assets from disk. No CORS dev-proxy is configured:
// FlightPlanDatabase calls go through the Tauri HTTP plugin, which makes native
// requests that bypass CORS in both dev and production.
export default defineConfig({
  plugins: [react()],
  // Vite resolves `@/...` to src for tidy imports.
  resolve: {
    alias: { "@": "/src" },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "es2020",
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
