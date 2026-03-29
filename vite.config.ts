import { defineConfig } from "vite";
import type { Connect } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
  plugins: [
    {
      name: "spa-fallback",
      configureServer(server) {
        server.middlewares.use(((req, _res, next) => {
          if (req.url?.startsWith("/game/") || req.url === "/play" || req.url === "/about" || req.url === "/terms") {
            req.url = "/index.html";
          }
          next();
        }) as Connect.NextHandleFunction);
      },
    },
  ],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
