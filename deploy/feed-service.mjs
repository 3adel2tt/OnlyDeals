/**
 * onlydeals feed service — Postgres is the source of truth.
 *
 * n8n source workflows UPSERT offers into a Postgres table. This service
 * reads that table and serves the offer.v1 feed the public site pulls.
 * It also owns the DB credentials (config file, chmod 600) and exposes the
 * admin-only test / save / config endpoints used by the Control Room's
 * Database page.
 *
 *   GET  /onlydeals.json      the feed (CORS, read by the browser)
 *   GET  /api/health          liveness
 *   GET  /api/db/config       non-secret config, password masked   (x-api-key)
 *   POST /api/db/test         real connect + SELECT 1, exact error  (x-api-key)
 *   POST /api/db/save         persist config to disk, chmod 600     (x-api-key)
 *
 * Env: OFFRADAR_API_KEY (required), FEED_PORT (default 8788),
 *      DB_CONFIG (default /etc/onlydeals/db.json)
 *
 * Dependency: npm i pg
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const API_KEY = process.env.OFFRADAR_API_KEY || "";
const PORT = Number(process.env.FEED_PORT || 8788);
const CONFIG_PATH = process.env.DB_CONFIG || "/etc/onlydeals/db.json";

if (!API_KEY) {
  console.error("feed-service: OFFRADAR_API_KEY is not set — admin endpoints will reject all calls");
}

/* ---------------- config store (server-side only) ---------------- */

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(CONFIG_PATH, 0o600);
  } catch {
    /* best effort */
  }
}

/* ---------------- db helpers ---------------- */

function makePool(cfg) {
  return new pg.Pool({
    host: cfg.host,
    port: Number(cfg.port) || 5432,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    connectionTimeoutMillis: 6000,
    max: 2,
  });
}

function escapeIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

/* ---------------- offer.v1 mapping ---------------- */

function capitalize(s) {
  return String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
}

function toNumber(v) {
  const n = parseFloat(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function discountLabel(row) {
  const dv = String(row.discount_value || "").trim();
  if (dv) {
    if (dv.includes("%")) return "−" + dv;
    return "−" + dv; // e.g. "50 SAR"
  }
  if (row.max_discount != null) return "up to " + row.max_discount;
  return "OFFER";
}

function discountKind(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("percent")) return "percent";
  if (t.includes("fixed")) return "cashback";
  if (t.includes("install")) return "installments";
  if (t.includes("bogo") || t.includes("free")) return "bogo";
  return "percent";
}

function toIsoDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapRow(row) {
  const bank = capitalize(row.source);
  const card = row.card_name || "All cards";
  return {
    id: `${row.source}-${row.id}`,
    merchant: row.offer_title || bank,
    headline: row.description || row.offer_title || "Offer",
    discountLabel: discountLabel(row),
    value: toNumber(row.discount_value) || toNumber(row.max_discount),
    kind: discountKind(row.discount_type),
    category: "online",
    image: row.image_url || "",
    cards: [card],
    link: row.terms_url || "#",
    expiresAt: toIsoDate(row.end_date),
    terms: [],
    bank,
    card,
  };
}

async function buildFeed() {
  const cfg = readConfig();
  if (!cfg) {
    return {
      version: "offer.v1",
      generatedAt: new Date().toISOString(),
      generator: "feed-service:no-db-config",
      sources: [],
      offers: [],
    };
  }
  const pool = makePool(cfg);
  try {
    const table = escapeIdent(cfg.table || "offers");
    const { rows } = await pool.query(
      `SELECT * FROM ${table} WHERE COALESCE(active, true) = true ORDER BY id DESC LIMIT 500`,
    );
    const offers = rows.map(mapRow);
    const bySource = new Map();
    for (const r of rows) {
      const s = String(r.source || "unknown");
      bySource.set(s, (bySource.get(s) || 0) + 1);
    }
    const sources = Array.from(bySource.entries()).map(([id, count]) => ({
      id,
      name: capitalize(id),
      status: "live",
      count,
      note: `${count} offers · read from ${cfg.table || "offers"}`,
      at: Date.now(),
    }));
    return {
      version: "offer.v1",
      generatedAt: new Date().toISOString(),
      generator: "feed-service:postgres",
      sources,
      offers,
    };
  } finally {
    await pool.end().catch(() => {});
  }
}

/* ---------------- http plumbing ---------------- */

function send(res, status, body, headers = {}) {
  const data = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function authorized(req) {
  return API_KEY !== "" && req.headers["x-api-key"] === API_KEY;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = url.pathname;

  if (req.method === "OPTIONS") return send(res, 204, "");

  try {
    if (req.method === "GET" && p === "/api/health") {
      return send(res, 200, { ok: true, configured: !!readConfig() });
    }

    if (req.method === "GET" && (p === "/onlydeals.json" || p === "/")) {
      const feed = await buildFeed();
      return send(res, 200, feed);
    }

    /* ---- admin-only DB endpoints ---- */
    if (p.startsWith("/api/db/")) {
      if (!authorized(req)) return send(res, 401, { ok: false, error: "unauthorized — bad or missing x-api-key" });

      if (req.method === "GET" && p === "/api/db/config") {
        const cfg = readConfig();
        if (!cfg) return send(res, 200, { ok: true, configured: false, config: {} });
        const { password, ...rest } = cfg;
        return send(res, 200, { ok: true, configured: true, config: { ...rest, passwordSet: !!password } });
      }

      if ((req.method === "POST") && (p === "/api/db/test" || p === "/api/db/save")) {
        const body = await readBody(req);
        const cfg = {
          host: String(body.host || "localhost"),
          port: Number(body.port) || 5432,
          database: String(body.database || ""),
          user: String(body.user || ""),
          password: String(body.password || ""),
          table: String(body.table || "offers"),
        };
        if (!cfg.database || !cfg.user) {
          return send(res, 400, { ok: false, error: "database and user are required" });
        }

        // real connection + simple query, surfacing the exact driver error
        const pool = makePool(cfg);
        try {
          const table = escapeIdent(cfg.table);
          await pool.query("SELECT 1 AS ok");
          await pool.query(`SELECT 1 FROM ${table} LIMIT 1`);

          if (p === "/api/db/save") {
            writeConfig(cfg);
            return send(res, 200, { ok: true, message: `saved — feed now reads ${cfg.host}:${cfg.port}/${cfg.database}.${cfg.table}` });
          }
          return send(res, 200, { ok: true, message: `connection OK — reached ${cfg.host}:${cfg.port}/${cfg.database}, table ${cfg.table} exists` });
        } catch (err) {
          const message = err && err.message ? err.message : String(err);
          return send(res, 200, { ok: false, error: message });
        } finally {
          await pool.end().catch(() => {});
        }
      }

      return send(res, 404, { ok: false, error: "not found" });
    }

    return send(res, 404, { ok: false, error: "not found" });
  } catch (err) {
    return send(res, 500, { ok: false, error: err && err.message ? err.message : String(err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`onlydeals feed service listening on 127.0.0.1:${PORT} (config: ${CONFIG_PATH})`);
});
