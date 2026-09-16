/**
 * Máy chủ cho Astral Chart VN.
 *
 *   node server/index.mjs            # chế độ dev: Vite middleware + /api/ai-chat (Gemini)
 *   node server/index.mjs --prod     # chế độ production: phục vụ thư mục dist/ (sau khi npm run build)
 *
 * Lắng nghe trên 0.0.0.0 để chạy được trong môi trường preview/container.
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import aiChatHandler from "../api/_handler.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const isProd = args.includes("--prod") || process.env.NODE_ENV === "production";
const portFromArgs = args.find((arg) => arg.startsWith("--port="))?.split("=")[1];
const port = Number(process.env.PORT || portFromArgs || 5173);
const host = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

const readRequestBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const handleApi = async (req, res) => {
  try {
    req.body = await readRequestBody(req);
  } catch {
    req.body = "";
  }
  await aiChatHandler(req, res);
};

const serveStatic = (req, res, pathname) => {
  const distDir = path.join(root, "dist");
  const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(distDir, safePath);

  if (!filePath.startsWith(distDir)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  if (pathname === "/" || !path.extname(filePath)) {
    const candidate = path.join(distDir, pathname === "/" ? "index.html" : pathname);
    filePath = fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(distDir, "index.html");
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Không tìm thấy tài nguyên. Hãy chạy `npm run build` trước khi dùng --prod.");
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", MIME[path.extname(filePath)] || "application/octet-stream");
  res.setHeader("Cache-Control", path.extname(filePath) === ".html" ? "no-cache" : "public, max-age=3600");
  fs.createReadStream(filePath).pipe(res);
};

let vite = null;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/ai-chat") {
    await handleApi(req, res);
    return;
  }

  if (url.pathname === "/api/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: true,
        mode: isProd ? "production" : "development",
        llm: process.env.GEMINI_API_KEY ? "gemini" : "local-fallback"
      })
    );
    return;
  }

  if (isProd) {
    serveStatic(req, res, url.pathname);
    return;
  }

  vite.middlewares(req, res, () => {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Không tìm thấy tài nguyên.");
  });
});

if (!isProd) {
  const { createServer } = await import("vite");
  vite = await createServer({
    root,
    appType: "spa",
    server: {
      middlewareMode: true,
      hmr: { server },
      allowedHosts: true
    }
  });
}

server.listen(port, host, () => {
  const mode = isProd ? "production (dist/)" : "development (Vite HMR)";
  const llm = process.env.GEMINI_API_KEY ? "Gemini" : "bộ luận giải nội bộ (chưa có GEMINI_API_KEY)";
  console.log(`✦ Astral Chart VN đang chạy: http://${host}:${port} — ${mode}`);
  console.log(`  Trợ lý AI: ${llm}`);
});
