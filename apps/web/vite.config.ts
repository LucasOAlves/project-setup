/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      // Keep the browser's Host header: the API compares it with Origin on requests that
      // change state (Milestone 4 sign-in).
      "/api": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", changeOrigin: false },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
