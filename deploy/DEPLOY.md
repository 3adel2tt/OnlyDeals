# onlydeals · deployment

Postgres is the source of truth. The **feed service** (`deploy/feed-service.mjs`)
owns ALL database access; n8n workflows write offers through it or directly with
their own Postgres credentials; the public site only ever reads `/onlydeals.json`.

## 1. Environment

| Variable                | Purpose                                                          | Default                          |
| ----------------------- | ---------------------------------------------------------------- | -------------------------------- |
| `ONLYDEALS_PG_URL`      | Postgres connection string (falls back to `DATABASE_URL`)        | —                                |
| `ONLYDEALS_API_KEY`     | Guards `/api/db/*` (Control Room sends it as `x-api-key`)        | `change-me-api-key`              |
| `SESSION_SECRET`        | HMAC secret for the signed httpOnly session cookie               | `change-me-session-secret`       |
| `ONLYDEALS_REGISTRY`    | Trigger-URL registry file path                                   | `/etc/onlydeals/registry.json`   |
| `ADMIN_EMAIL`           | Admin seeded on first boot (only if no admin exists)             | `admin@onlydel.com`              |
| `ADMIN_PASSWORD`        | Password for the seeded admin                                    | `change-me-admin-123`            |
| `PORT`                  | HTTP port                                                        | `8787`                           |

n8n-side config: a Postgres credential named `onlydeals-pg`
(`ONLYDEALS_PG_URL`), the Google Sheets service-account credential
`onlydeals-sheets-sa`, and env `ONLYDEALS_N8N_BASE`
(`https://n8n.onlydel.com`) for the master scheduler's registry.

## 2. Database

**Zero manual migration.** On every boot the feed service runs
`CREATE TABLE IF NOT EXISTS` for `offers` and `users` (mirrors
`deploy/schema.sql` — keep both in sync if you change the schema).

- `offers` — unique on `(source, ext_id)`; workflows upsert rows and refresh
  `last_seen`, then prune with
  `UPDATE offers SET active = false WHERE source = '<id>' AND active = true AND last_seen < now() - interval '12 hours'`.
- `users` — `pass_hash` is `scrypt` (`<saltHex>:<hashHex>`, node:crypto — no
  bcrypt dependency). Sessions are stateless signed cookies (7-day expiry,
  httpOnly, SameSite=Lax).

## 3. Endpoints

Public (rate-limited, 20 / 10 min / IP):

```
POST /api/auth/register   {email, password, display_name} → 201 {user} + cookie
POST /api/auth/login      {email, password}               → 200 {user} + cookie
GET  /api/auth/me                                         → 200 {user} | 401
POST /api/auth/logout                                     → clears cookie
GET  /onlydeals.json                                      → merged offer.v1 feed (no-store)
```

Admin (`x-api-key: $ONLYDEALS_API_KEY`):

```
GET    /api/db/users
POST   /api/db/users/:id/reset-password  → { temp_password }  (shown once)
POST   /api/db/users/:id/toggle          → flips `disabled`
DELETE /api/db/users/:id
GET    /api/db/registry                  → { base, webhooks }
PUT    /api/db/registry                  → persist registry JSON
```

## 4. Serving the frontend

Build with `npm run build`, then serve `dist/` from the same origin as the
feed service (nginx example):

```nginx
location = /adminn { try_files /index.html =404; }   # Control Room (SPA route)
location /api/     { proxy_pass http://127.0.0.1:8787; }
location = /onlydeals.json { proxy_pass http://127.0.0.1:8787; }
location / { try_files $uri /index.html; }
```

`src/lib/feed.ts` pins `FEED_URL = "/onlydeals.json"` permanently — the site
reads it on load and every 5 minutes. There is no manual sync button on the
public site.

## 5. n8n

Import the three workflows from `public/workflows/` and activate:

- `onlydeals-master-scheduler.workflow.json` — cron (06/12/18), fans out to
  every source webhook in its registry, logs runs to Google Sheets, posts a
  report.
- `onlydeals-alrajhi.workflow.json` — fetch → extract (image JSON unwrap +
  site-relative `src` absolutizing) → upsert into `offers` via SplitInBatches
  → **Prune stale** (12 h window) → Sheets audit row.
- `onlydeals-jarir.workflow.json` — same shape for Jarir.

Set the `PASTE_SPREADSHEET_ID` placeholders and reconnect the
`onlydeals-sheets-sa` Google Sheets credential (service-account JSON; share
the sheet with its `client_email`).

Scraping is triggered ONLY from the Control Room (`/adminn` → Workflows) or
the master scheduler cron.

## 6. Control Room

`/adminn` on the public site. Admin-only (server checks `role = 'admin'`;
`/api/db/*` additionally requires the API key, entered once per session and
held in `sessionStorage` only). Tabs: Overview (registry, imports, ingest
contract), Workflows (auto-discovered via `workflows/manifest.json` + ingest
generator tags; trigger-only), Users (search, reset temporary password,
disable/enable, delete).
