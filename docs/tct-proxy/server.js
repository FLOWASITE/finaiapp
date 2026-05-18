// Minimal HTTPS proxy: forward mọi request tới https://hoadondientu.gdt.gov.vn:30000
// Deploy ở bất kỳ host nào có HTTPS public (Render, Railway, Fly, VPS+Caddy...).
// Sau đó set secret TCT_PROXY_URL = "https://<your-proxy-domain>" trên Lovable.
//
// Chạy local:  node server.js
// Port mặc định: 8080 (Render/Railway sẽ tự set PORT)

import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const TARGET = "https://hoadondientu.gdt.gov.vn:30000";

const app = express();

app.get("/_health", (_req, res) => res.json({ ok: true, target: TARGET }));

app.use(
  "/",
  createProxyMiddleware({
    target: TARGET,
    changeOrigin: true,
    secure: true,
    xfwd: false,
    logLevel: "warn",
    onProxyReq(proxyReq) {
      // TCT đôi khi xét User-Agent — gửi UA của trình duyệt thường.
      proxyReq.setHeader(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      );
    },
    onError(err, _req, res) {
      console.error("[proxy] error:", err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: "proxy_error", detail: err.message });
      }
    },
  }),
);

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => {
  console.log(`TCT proxy listening on :${port} → ${TARGET}`);
});
