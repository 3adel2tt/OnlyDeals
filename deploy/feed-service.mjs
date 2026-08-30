#!/usr/bin/env node
/**
 * onlydeals · feed service
 * ------------------------
 * Single owner of all Postgres access. Pure node:http + `pg` — no other
 * runtime deps; passwords hashed with node:crypto (scrypt), never bcrypt.
 *
 *   GET  /onlydeals.json                  merged feed for the public site
 *   POST /api/auth/register               {email, password, display_name}
 *   POST /api/auth/login                  {email, password}
 *   GET  /api/auth/me                     (signed httpOnly cookie)
 *   POST /api/auth/logout
 *   GET  /api/db/users                    (x-api-key)
 *   POST /api/db/users/:id/reset-password (x-api-key) → one-time temp pw
 *   POST /api/db/users/:id/toggle         (x-api-key)
 *   DELETE /api/db/users/:id              (x-api-key)
 *   GET  /api/db/registry                 (x-api-key) trigger-URL registry
 *   PUT  /api/db/registry                 (x-api-key) creates the file if missing
 *   POST /api/db/probe                    (x-api-key) server-side webhook probe
 *
 * Env:
 *   ONLYDEALS_PG_URL | DATABASE_URL   postgres connection string
 *   ONLYDEALS_API_KEY                 guards /api/db/*
 *   SESSION_SECRET                    HMAC secret for the session cookie
 *   ONLYDEALS_REGISTRY                registry path (default /etc/onlydeals/registry.json)
 *   ADMIN_EMAIL / ADMIN_PASSWORD      seeded admin on first boot
 *   PORT                              default 8787
 *
 * On boot it runs CREATE TABLE IF NOT EXISTS for `offers` and `users`
 * (zero manual migration — see deploy/schema.sql, keep in sync).
 */

import http from "node:http";
import crypto from "node:crypto";
import { scrypt, timingSafeEqual, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const scryptAsync = promisify(scrypt);

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.ONLYDEALS_API_KEY || "change-me-api-key";
const SESSION_SECRET = process.env.SESSION_SECRET || "change-me-session-secret";
const REGISTRY_PATH = process.env.ONLYDEALS_REGISTRY || "/etc/onlydeals/registry.json";
const COOKIE = "od_sess";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

const DEFAULT_REGISTRY = {
  base: "https://n8n.onlydel.com",
  webhooks: {
    alrajhi: "https://n8n.onlydel.com/webhook/onlydeals-alrajhi",
    jarir: "https://n8n.onlydel.com/webhook/onlydeals-jarir",
  },
};

const pool = new pg.Pool({
  connectionString: process.env.ONLYDEALS_PG_URL || process.env.DATABASE_URL,
  max: 10,
});

/* ------------------------------------------------------------- schema */

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS offers (
      id bigserial PRIMARY KEY,
      merchant_id text NOT NULL,
      source text NOT NULL,
      source_type text NOT NULL DEFAULT 'bank',
      card_name text NOT NULL DEFAULT 'All cards',
      offer_title text NOT NULL,
      description text,
      discount_value text,
      discount_type text,
      min_spend numeric,
      max_discount numeric,
      start_date date,
      end_date date,
      terms_url text,
      image_url text,
      active boolean NOT NULL DEFAULT true,
      last_seen timestamptz NOT NULL DEFAULT now(),
      UNIQUE (merchant_id, source, offer_title)
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS offers_active_idx ON offers (active)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS offers_source_idx ON offers (source)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id serial PRIMARY KEY,
      email text UNIQUE NOT NULL,
      pass_hash text NOT NULL,
      display_name text,
      role text NOT NULL DEFAULT 'user',
      disabled boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
}

async function seedAdmin() {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM users WHERE role = 'admin'`);
  if (rows[0].n > 0) return;
  const email = (process.env.ADMIN_EMAIL || "admin@onlydel.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "change-me-admin-123";
  const hash = await hashPassword(password);
  await pool.query(
    `INSERT INTO users (email, pass_hash, display_name, role)
     VALUES ($1, $2, 'Deals Admin', 'admin')
     ON CONFLICT (email) DO NOTHING`,
    [email, hash],
  );
  console.log(`[boot] seeded admin account: ${email}`);
}

/* ------------------------------------------------------- password hash */

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const derived = await scryptAsync(password, Buffer.from(saltHex, "hex"), 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  const a = Buffer.from(hashHex, "hex");
  return a.length === derived.length && timingSafeEqual(a, derived);
}

/* ------------------------------------------------------------ sessions */

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function makeSessionCookie(userId) {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + COOKIE_MAX_AGE * 1000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readSessionCookie(req) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === COOKIE) {
      const value = rest.join("=");
      const [payload, sig] = value.split(".");
      if (!payload || !sig) return null;
      const expected = sign(payload);
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
      try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (!data.uid || data.exp < Date.now()) return null;
        return data.uid;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function userJson(row) {
  return {
    id: String(row.id),
    email: row.email,
    username: row.email.split("@")[0],
    displayName: row.display_name || row.email.split("@")[0],
    role: row.role,
    createdAt: new Date(row.created_at).getTime(),
  };
}

async function userFromRequest(req) {
  const uid = readSessionCookie(req);
  if (!uid) return null;
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE id = $1 AND disabled = false`,
    [uid],
  );
  return rows[0] ? userJson(rows[0]) : null;
}

/* -------------------------------------------------------- rate limiting */

const rl = new Map(); // ip -> { n, reset }
function rateLimited(ip) {
  const now = Date.now();
  let e = rl.get(ip);
  if (!e || e.reset < now) {
    e = { n: 0, reset: now + 10 * 60 * 1000 };
    rl.set(ip, e);
  }
  e.n += 1;
  return e.n > 20; // 20 auth attempts per 10 min per IP
}

/* ------------------------------------------------------------ helpers */

function sendJson(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    ...headers,
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

const setCookie = (res, value) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

function dbAuthed(req) {
  return req.headers["x-api-key"] === API_KEY;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ------------------------------------------------------------- routes */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method || "GET";
  const ip = req.socket.remoteAddress || "unknown";

  try {
    /* ---------------- feed ---------------- */
    if (method === "GET" && p === "/onlydeals.json") {
      // Reads the n8n-written schema (deploy/schema.sql) and aliases those
      // columns into the offer.v1 card shape the board renders.
      const { rows } = await pool.query(
        `SELECT
           merchant_id,
           source,
           source_type,
           card_name,
           offer_title,
           description,
           discount_value::text AS discount_value,
           discount_type,
           max_discount,
           end_date,
           terms_url,
           image_url,
           last_seen
         FROM offers
         WHERE active = true AND (end_date IS NULL OR end_date >= current_date)
         ORDER BY source, end_date ASC NULLS LAST, offer_title`,
      );
      const prettify = (s) =>
        String(s ?? "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
      const numValue = (label, maxDiscount) => {
        const m = String(label ?? "").match(/(\d+(?:\.\d+)?)/);
        if (m) return Number(m[1]);
        return maxDiscount != null ? Number(maxDiscount) : 0;
      };
      const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
      const offers = rows.map((r) => ({
        id: `${r.source}-${r.merchant_id}`,
        merchant: prettify(r.merchant_id),
        headline: r.description || r.offer_title || "",
        discountLabel: r.discount_value || "",
        value: numValue(r.discount_value, r.max_discount),
        kind: r.discount_type === "percentage" ? "percent" : "fixed",
        category: "online",
        image: r.image_url || "",
        cards: r.card_name ? [r.card_name] : [],
        link: r.terms_url || "",
        expiresAt: r.end_date ? new Date(r.end_date).toISOString() : null,
        terms: [],
        bank: capitalize(r.source),
        card: r.card_name || "",
      }));
      const bySource = new Map();
      for (const r of rows) {
        const s = bySource.get(r.source) || { count: 0, last: 0 };
        s.count += 1;
        s.last = Math.max(s.last, new Date(r.last_seen).getTime());
        bySource.set(r.source, s);
      }
      const names = { alrajhi: "Al Rajhi Bank", jarir: "Jarir", alinma: "Alinma Bank" };
      const sources = Array.from(bySource.entries()).map(([id, s]) => ({
        id,
        name: names[id] || id,
        status: "live",
        count: s.count,
        note: `${s.count} offers · last seen ${new Date(s.last).toISOString()}`,
        at: s.last,
      }));
      const payload = {
        version: "offer.v1",
        generatedAt: new Date().toISOString(),
        generator: "feed-service",
        sources,
        offers,
      };
      const data = JSON.stringify(payload);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(data),
      });
      return res.end(data);
    }

    /* ---------------- auth ---------------- */
    if (p.startsWith("/api/auth/")) {
      if (rateLimited(ip)) return sendJson(res, 429, { error: "Too many attempts — try again later." });

      if (method === "POST" && p === "/api/auth/register") {
        const body = await readBody(req);
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        const displayName = String(body.display_name || "").trim() || null;
        if (!EMAIL_RE.test(email)) return sendJson(res, 400, { error: "Enter a valid email address." });
        if (password.length < 6) return sendJson(res, 400, { error: "Password needs at least 6 characters." });
        const exists = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
        if (exists.rows.length) return sendJson(res, 409, { error: "That email is already registered." });
        const hash = await hashPassword(password);
        const { rows } = await pool.query(
          `INSERT INTO users (email, pass_hash, display_name) VALUES ($1, $2, $3) RETURNING *`,
          [email, hash, displayName],
        );
        const user = userJson(rows[0]);
        return sendJson(res, 201, { user }, { "Set-Cookie": setCookie(res, makeSessionCookie(rows[0].id)) });
      }

      if (method === "POST" && p === "/api/auth/login") {
        const body = await readBody(req);
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
        if (!rows.length || !(await verifyPassword(password, rows[0].pass_hash))) {
          return sendJson(res, 401, { error: "Invalid email or password." });
        }
        if (rows[0].disabled) return sendJson(res, 403, { error: "This account is disabled." });
        return sendJson(res, 200, { user: userJson(rows[0]) }, {
          "Set-Cookie": setCookie(res, makeSessionCookie(rows[0].id)),
        });
      }

      if (method === "GET" && p === "/api/auth/me") {
        const user = await userFromRequest(req);
        return user ? sendJson(res, 200, { user }) : sendJson(res, 401, { error: "Not signed in." });
      }

      if (method === "POST" && p === "/api/auth/logout") {
        return sendJson(res, 200, { ok: true }, { "Set-Cookie": clearCookie() });
      }

      return sendJson(res, 404, { error: "Not found." });
    }

    /* ---------------- db (x-api-key) ---------------- */
    if (p.startsWith("/api/db/")) {
      if (!dbAuthed(req)) return sendJson(res, 403, { error: "Invalid x-api-key." });

      if (method === "GET" && p === "/api/db/users") {
        const { rows } = await pool.query(
          `SELECT id, email, display_name, role, disabled, created_at FROM users ORDER BY id`,
        );
        return sendJson(res, 200, rows);
      }

      const m = p.match(/^\/api\/db\/users\/(\d+)\/(.+)$/);
      if (m && method === "POST") {
        const id = Number(m[1]);
        if (m[2] === "reset-password") {
          const temp = randomBytes(9).toString("base64url");
          const hash = await hashPassword(temp);
          const { rows } = await pool.query(
            `UPDATE users SET pass_hash = $1, disabled = false WHERE id = $2 RETURNING id`,
            [hash, id],
          );
          if (!rows.length) return sendJson(res, 404, { error: "No such user." });
          return sendJson(res, 200, { temp_password: temp });
        }
        if (m[2] === "toggle") {
          const { rows } = await pool.query(
            `UPDATE users SET disabled = NOT disabled WHERE id = $1 RETURNING id, disabled`,
            [id],
          );
          if (!rows.length) return sendJson(res, 404, { error: "No such user." });
          return sendJson(res, 200, rows[0]);
        }
      }

      const del = p.match(/^\/api\/db\/users\/(\d+)$/);
      if (del && method === "DELETE") {
        const { rows } = await pool.query(`DELETE FROM users WHERE id = $1 RETURNING id`, [Number(del[1])]);
        if (!rows.length) return sendJson(res, 404, { error: "No such user." });
        return sendJson(res, 200, { ok: true });
      }

      /* POST /api/db/probe {url, payload?} → {ok, status, ms}
       * Server-side reachability probe for n8n webhooks. Webhook nodes are
       * POST-only and don't send CORS headers, so the Control Room asks us to
       * make the request. Any 2xx counts as reachable; the response body is
       * never parsed (n8n may reply 200 with an empty body). */
      if (method === "POST" && p === "/api/db/probe") {
        const body = await readBody(req);
        const url = String(body.url || "");
        if (!/^https?:\/\//i.test(url)) return sendJson(res, 400, { error: "url must be http(s)." });
        const payload =
          body.payload && typeof body.payload === "object"
            ? body.payload
            : { probe: true, at: new Date().toISOString() };
        const started = Date.now();
        try {
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(90_000), // scrapes can take a while (responseMode: lastNode)
          });
          return sendJson(res, 200, {
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            ms: Date.now() - started,
          });
        } catch (e) {
          return sendJson(res, 200, {
            ok: false,
            status: 0,
            ms: Date.now() - started,
            error: e && e.name === "TimeoutError" ? "timeout after 90s" : e?.message || "connection failed",
          });
        }
      }

      if (p === "/api/db/registry") {
        if (method === "GET") {
          try {
            const raw = fs.readFileSync(REGISTRY_PATH, "utf8");
            return sendJson(res, 200, JSON.parse(raw));
          } catch {
            // first hit: materialise the default registry file so later
            // reads/writes have something real on disk
            try {
              fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
              fs.writeFileSync(REGISTRY_PATH, JSON.stringify(DEFAULT_REGISTRY, null, 2));
            } catch {
              /* read-only FS — still serve the default */
            }
            return sendJson(res, 200, DEFAULT_REGISTRY);
          }
        }
        if (method === "PUT") {
          const body = await readBody(req);
          if (!body || typeof body.base !== "string" || typeof body.webhooks !== "object") {
            return sendJson(res, 400, { error: "Registry must be { base, webhooks }." });
          }
          // optional extension keys (display names, paused flags) pass through
          const clean = {
            base: body.base,
            webhooks: body.webhooks,
            ...(body.names && typeof body.names === "object" ? { names: body.names } : {}),
            ...(body.disabled && typeof body.disabled === "object" ? { disabled: body.disabled } : {}),
          };
          fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
          fs.writeFileSync(REGISTRY_PATH, JSON.stringify(clean, null, 2));
          return sendJson(res, 200, clean);
        }
      }

      return sendJson(res, 404, { error: "Not found." });
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (err) {
    console.error("[error]", err);
    sendJson(res, 500, { error: "Internal error." });
  }
});

/* --------------------------------------------------------------- boot */

ensureSchema()
  .then(seedAdmin)
  .then(() => {
    server.listen(PORT, () => {
      console.log(`[boot] onlydeals feed service listening on :${PORT}`);
      console.log(`[boot] schema ensured (offers, users) · registry at ${REGISTRY_PATH}`);
    });
  })
  .catch((err) => {
    console.error("[boot] failed to initialise database:", err.message);
    process.exit(1);
  });
