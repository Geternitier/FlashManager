import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, statSync } from "node:fs";

const host = process.env.TAURI_DEV_HOST;
const runtimeConfig = new URL("./runtime/config/", import.meta.url);
const legacyConfig = new URL("./config/", import.meta.url);

function readAgentToken(): string {
  const config = statSync(runtimeConfig, { throwIfNoEntry: false })?.isDirectory() ||
    !statSync(legacyConfig, { throwIfNoEntry: false })?.isDirectory()
    ? runtimeConfig
    : legacyConfig;
  return readFileSync(new URL("agent.token", config), "utf8").trim();
}

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
          const token = readAgentToken();
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
    fs: {
      deny: [
        ".env", ".env.*", "*.{crt,pem}", "**/.git/**",
        "**/runtime/**", "**/config/**", "**/backups/**",
      ],
    },
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**", "**/runtime/**", "**/config/**", "**/backups/**"],
    },
  },
}));
