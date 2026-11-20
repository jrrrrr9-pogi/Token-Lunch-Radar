// HTTP + Server-Sent Events front end for the radar.
//   GET /             dashboard
//   GET /api/tokens   ranked tokens as JSON (?minScore=&chain=&limit=)
//   GET /api/events   live stream: snapshot, new, update, alert, source-error
//
// Usage: node src/server.js [--source=demo|dexscreener]
// Env:   PORT (3000), HOST (127.0.0.1), POLL_MS (5000), ALERT_SCORE (75)

import http from "node:http";
import { readFile } from "node:fs/promises";
import { Radar } from "./radar.js";
import { createSource } from "./sources/index.js";

const argSource = process.argv.find((a) => a.startsWith("--source="))?.split("=")[1];
const sourceName = argSource || process.env.SOURCE || "demo";
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";

const radar = new Radar({
  source: createSource(sourceName),
  pollMs: Number(process.env.POLL_MS) || 5000,
  alertScore: Number(process.env.ALERT_SCORE) || 75,
});

const indexUrl = new URL("../public/index.html", import.meta.url);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method !== "GET") {
    res.writeHead(405, { allow: "GET" }).end();
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    try {
      const html = await readFile(indexUrl);
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
      });
      res.end(html);
    } catch {
      res.writeHead(500).end("dashboard missing");
    }
    return;
  }

  if (url.pathname === "/api/tokens") {
    const body = radar.list({
      minScore: Number(url.searchParams.get("minScore")) || 0,
      chain: url.searchParams.get("chain") || undefined,
      limit: Math.min(Number(url.searchParams.get("limit")) || 200, 500),
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ source: sourceName, error: radar.lastError, tokens: body }));
    return;
  }

  if (url.pathname === "/api/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send("snapshot", { source: sourceName, tokens: radar.list({ limit: 200 }) });

    const forward = (event) => (data) => send(event, data);
    const handlers = {
      new: forward("new"),
      update: forward("update"),
      alert: forward("alert"),
      "source-error": forward("source-error"),
    };
    for (const [e, h] of Object.entries(handlers)) radar.on(e, h);
    const keepAlive = setInterval(() => res.write(": ping\n\n"), 20000);

    req.on("close", () => {
      clearInterval(keepAlive);
      for (const [e, h] of Object.entries(handlers)) radar.off(e, h);
    });
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" }).end("not found");
});

radar.setMaxListeners(0);
server.listen(PORT, HOST, () => {
  console.log(`Token Launch Radar [${sourceName}] on http://${HOST}:${PORT}`);
  radar.start();
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    radar.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  });
}
