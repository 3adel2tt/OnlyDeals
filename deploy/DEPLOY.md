# onlydeals — deploy kit (Postgres is the source of truth)

The old file-based ingest is retired. n8n source workflows now **upsert straight into
Postgres**, and the **feed service** reads that table to build the offer.v1 feed the
public site pulls. The DB credentials live only on the server (`/etc/onlydeals/db.json`,
chmod 600) and are configured from the Control Room's **Database** page.

## Files

| file | goes to |
|---|---|
| `feed-service.mjs` | `/opt/onlydeals/feed-service.mjs` |
| `onlydeals-feed.service` | `/etc/systemd/system/onlydeals-feed.service` |
| `nginx-onlydeals.conf` | `/etc/nginx/sites-available/onlydeals` |
| `schema.sql` | run against Postgres |

## 1 — Database

```bash
# create role + db, then the table
sudo -u postgres psql -c "CREATE ROLE onlydeals LOGIN PASSWORD 'change-me';"
sudo -u postgres psql -c "CREATE DATABASE onlydeals OWNER onlydeals;"
PGPASSWORD=change-me psql -h localhost -U onlydeals -d onlydeals -f schema.sql
```

## 2 — Feed service

```bash
useradd --system --no-create-home --shell /usr/sbin/nologin onlydeals 2>/dev/null || true
mkdir -p /opt/onlydeals /etc/onlydeals
cp feed-service.mjs /opt/onlydeals/
cd /opt/onlydeals && npm init -y >/dev/null && npm i pg

# API key protecting the admin DB endpoints — same value n8n sends as x-api-key
echo "OFFRADAR_API_KEY=$(openssl rand -hex 32)" > /etc/onlydeals/ingest.env
chmod 600 /etc/onlydeals/ingest.env
cat /etc/onlydeals/ingest.env   # ← keep this for n8n + the Control Room

cp onlydeals-feed.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now onlydeals-feed
curl -s localhost:8788/api/health        # → {"ok":true,"configured":false}
```

Now open the Control Room → **Database** tab, set the service base URL
(`https://deals.your-domain.com`) + the API key, fill in host/port/database/user/
password/table, hit **TEST CONNECTION** then **SAVE**. That writes `/etc/onlydeals/db.json`
(chmod 600) — the password never touches the browser or the repo.

## 3 — nginx

```bash
cp nginx-onlydeals.conf /etc/nginx/sites-available/onlydeals
ln -sf /etc/nginx/sites-available/onlydeals /etc/nginx/sites-enabled/
sed -i 's/deals.your-domain.com/YOUR_REAL_DOMAIN/' /etc/nginx/sites-available/onlydeals
nginx -t && systemctl reload nginx
# optional TLS:
# certbot --nginx -d deals.your-domain.com
```

## 4 — Point the site at the feed

In `src/lib/feed.ts`:

```ts
export const FEED_URL: string | null = "https://deals.your-domain.com/onlydeals.json";
```

Rebuild, drop `dist/` into `/var/www/onlydeals`.

## 5 — n8n env vars

```
OFFRADAR_INGEST_URL = https://deals.your-domain.com/onlydeals.json   # feed the site reads
OFFRADAR_API_KEY    = <hex from /etc/onlydeals/ingest.env>
OFFRADAR_N8N_BASE   = https://n8n.your-domain.com
```

## 6 — n8n Postgres node: field mapping

The source workflows' **Postgres upsert** node must write these columns (they match
`schema.sql`, and the feed service reads them back into offer.v1):

| Postgres column | value | → offer.v1 field |
|---|---|---|
| `merchant_id` | slug of merchant | (dedupe key) |
| `source` | `alinma`, `jarir`, … | `bank` (capitalized) |
| `source_type` | `bank` / `vendor` | — |
| `card_name` | `Alinma Card` | `card` + `cards[]` |
| `offer_title` | merchant / brand | `merchant` |
| `description` | offer copy | `headline` |
| `discount_value` | `20%` / `50 SAR` | `discountLabel` (`−20%`), `value` |
| `discount_type` | `percentage` / `fixed` | `kind` (`percent` / `cashback`) |
| `max_discount` | `200` | fallback `value` / "up to 200" |
| `end_date` | `2026-12-31` | `expiresAt` (ISO) |
| `terms_url` | link | `link` |
| `image_url` | img | `image` |
| `active` | `true` | row is included while true |

Match columns for the upsert: `merchant_id`, `source`, `offer_title`
(the `UNIQUE (merchant_id, source, offer_title)` constraint in schema.sql).

## The loop

```
n8n source workflow ──upsert──▶ Postgres.offers
feed service ──SELECT──▶ offer.v1 JSON ──GET /onlydeals.json──▶ browser board
```
