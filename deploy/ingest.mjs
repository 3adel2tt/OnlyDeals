#!/usr/bin/env node
/**
 * onlydeals ingest — zero-dependency Node HTTP server.
 *
 * Contract (matches src/lib/feed.ts exactly):
 *   POST /ingest          accepts an offer.v1 payload, header `x-api-key` must match
 *                         $OFFRADAR_API_KEY. Payloads are MERGED per source id, so each
 *                         n8n source workflow can post independently.
 *   GET  /  (and /feed)   returns the merged FeedPayload JSON with CORS enabled —
 *                         this is what FEED_URL in src/lib/feed.ts points at.
 *   GET  /health          liveness probe for systemd/nginx/monitoring.
 *
 * The feed file is written atomically (tmp + rename) so the site never reads
 * a half-written file. The per-source store survives restarts.
 */
import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.OFFRADAR_API_KEY || "";
const FEED_FILE = process.env.FEED_FILE || "/var/lib/onlydeals/onlydeals.json";
const STORE_FILE = join(dirname(FEED_FILE), ".ingest-store.json");
const MAX_BODY = 2 * 1024 * 1024; // 2 MB

if (!API_KEY) {
  console.error("[ingest] refusing to start: OFFRADAR_API_KEY is not set");
  process.exit(1);
}

/** sourceId -> { outcome: SourceOutcome, offers: Offer[] } */
let store = {};

try {
  store = JSON.parse(await readFile(STORE_FILE, "utf8"));
  console.log(`[ingest] restored store · ${Object.keys(store).length} source(s)`);
} catch {
  /* first boot — empty store */
}

const log = (...a) => console.log(new Date().toISOString(), "[ingest]", ...a);

function combinedPayload() {
  const sources = [];
  const offers = [];
  for (const key of Object.keys(store)) {
    sources.push(store[key].outcome);
    offers.push(...store[key].offers);
  }
  return {
    version: "offer.v1",
    generatedAt: new Date().toISOString(),
    generator: "merged-ingest",
    sources,
    offers,
  };
}

async function persist() {
  await mkdir(dirname(FEED_FILE), { recursive: true });
  await writeFile(STORE_FILE, JSON.stringify(store));
  const tmp = FEED_FILE + ".tmp";
  await writeFile(tmp, JSON.stringify(combinedPayload()));
  await rename(tmp, FEED_FILE);
}

/** Light schema guard — reject garbage, keep the site safe. */
function validate(body) {
  if (!body || typeof body !== "object") return "body is not an object";
  if (body.version !== "offer.v1") return `unsupported version "${body.version}" (want offer.v1)`;
  if (!Array.isArray(body.sources) || body.sources.length === 0) return "sources[] missing or empty";
  if (!Array.isArray(body.offers)) return "offers[] missing";
  for (const o of body.offers) {
    if (!o || typeof o.merchant !== "string" || typeof o.headline !== "string")
      return "offer without merchant/headline";
  }
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  // ---------- GET feed ----------
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/feed")) {
    const payload = combinedPayload();
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(payload));
    return;
  }

  // ---------- health ----------
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, sources: Object.keys(store).length }));
    return;
  }

  // ---------- POST ingest ----------
  if (req.method === "POST" && url.pathname === "/ingest") {
    if ((req.headers["x-api-key"] || "") !== API_KEY) {
      log("rejected POST /ingest — bad or missing x-api-key");
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "invalid x-api-key" }));
      return;
    }

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: `bad JSON: ${e.message}` }));
      return;
    }

    const problem = validate(body);
    if (problem) {
      log("rejected POST /ingest —", problem);
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: problem }));
      return;
    }

    // merge: each POST replaces ONE source's slice of the feed
    const source = body.sources[0];
    const sid = source.id || String(body.generator || "unknown").replace("n8n:", "");
    store[sid] = {
      outcome: {
        id: sid,
        name: source.name || sid,
        status: source.status || "live",
        count: body.offers.length,
        note: source.note || `posted by ${body.generator}`,
        at: Date.now(),
      },
      offers: body.offers,
    };

    try {
      await persist();
    } catch (e) {
      log("persist failed —", e.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "persist failed" }));
      return;
    }

    log(`accepted ${sid} · ${body.offers.length} offers · total ${combinedPayload().offers.length}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        source: sid,
        accepted: body.offers.length,
        totalOffers: combinedPayload().offers.length,
        feedFile: FEED_FILE,
      }),
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  log(`listening on 127.0.0.1:${PORT} · feed → ${FEED_FILE}`);
});
