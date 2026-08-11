import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";

const rootDir = path.resolve(__dirname, "..");

export default defineConfig(({ mode }) => {
  // Vite runs with cwd = web/, so resolve PORT from the project root .env
  // (loaded by Bun for the backend) plus the process environment.
  const env = loadEnv(mode, rootDir, "");
  const backendPort = process.env.PORT || env.PORT || "3000";
  const proxyTarget = `http://localhost:${backendPort}`;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/v1": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
