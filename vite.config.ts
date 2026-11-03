import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), {
    name: "local-agent-development-bridge",
    configureServer(server) {
      // Development only: the token never enters the browser bundle.
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/v1/")) return next();
        const allowed = ["http://localhost:1420", "http://127.0.0.1:1420"];
        const origin = req.headers.origin;
        if (!allowed.includes(`http://${req.headers.host}`) ||
            (origin && !allowed.includes(origin)) ||
            req.headers["sec-fetch-site"] === "cross-site") {
          res.statusCode = 403; res.end("Only local same-origin development requests are allowed."); return;
        }
        try {
          const token = readFileSync(fileURLToPath(new URL("./config/agent.token", import.meta.url)), "utf8").trim();
          if (!token) throw new Error("Empty token");
          req.headers.authorization = `Bearer ${token}`;
          next();
        } catch {
          res.statusCode = 503;
          res.end("请先启动本项目的 FlashManager 桌面后端，再使用浏览器开发模式。");
        }
      });
    },
  }],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    proxy: { "/api/v1": { target: "http://127.0.0.1:19527" } },
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
