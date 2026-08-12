import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL("..", import.meta.url)), "");
  const backendPort = env.PORT || "3000";

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      proxy: {
        "/api": {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
        "/v1": {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
