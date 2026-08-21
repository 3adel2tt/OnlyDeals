# onlydeals — deploy kit

Three files in this folder:

| file | goes to |
|---|---|
| `ingest.mjs` | `/opt/onlydeals/ingest.mjs` |
| `onlydeals-ingest.service` | `/etc/systemd/system/onlydeals-ingest.service` |
| `nginx-onlydeals.conf` | `/etc/nginx/sites-available/onlydeals` |

## 1 — Create the LXC (run on the Proxmox host)

```bash
# adjust the template name to what you have (pveam list local)
pct create 200 local:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst \
  --hostname onlydeals \
  --cores 1 --memory 512 --swap 512 \
  --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 \
  --password 'CHANGE_ME'

pct start 200
pct enter 200
```

If the container already exists, skip straight to step 2 (`pct enter <id>`).

## 2 — Inside the container

```bash
apt update && apt install -y nginx curl

# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# service user + dirs
useradd --system --no-create-home --shell /usr/sbin/nologin onlydeals
mkdir -p /opt/onlydeals /var/lib/onlydeals /etc/onlydeals
```

Push the files from the Proxmox host (in a second terminal):

```bash
pct push 200 deploy/ingest.mjs /opt/onlydeals/ingest.mjs
pct push 200 deploy/onlydeals-ingest.service /etc/systemd/system/onlydeals-ingest.service
pct push 200 deploy/nginx-onlydeals.conf /etc/nginx/sites-available/onlydeals
```

Back inside the container — generate the API key, wire it up, start:

```bash
# the key n8n must send as x-api-key — write it down
echo "OFFRADAR_API_KEY=$(openssl rand -hex 32)" > /etc/onlydeals/ingest.env
chmod 600 /etc/onlydeals/ingest.env
cat /etc/onlydeals/ingest.env        # ← copy this value for n8n

chown -R onlydeals:onlydeals /var/lib/onlydeals
systemctl daemon-reload
systemctl enable --now onlydeals-ingest
systemctl status onlydeals-ingest
curl -s localhost:8787/health        # → {"ok":true,"sources":0}

# nginx
ln -s /etc/nginx/sites-available/onlydeals /etc/nginx/sites-enabled/
sed -i 's/deals.your-domain.com/YOUR_REAL_DOMAIN/' /etc/nginx/sites-available/onlydeals
nginx -t && systemctl reload nginx

# optional: TLS
apt install -y certbot python3-certbot-nginx
certbot --nginx -d deals.your-domain.com
```

Smoke-test the ingest (from anywhere):

```bash
curl -i -X POST https://deals.your-domain.com/ingest \
  -H "x-api-key: $YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"version":"offer.v1","generatedAt":"2026-01-01T00:00:00Z","generator":"n8n:smoke-test",
       "sources":[{"id":"smoke","name":"Smoke test","status":"live","count":0,"note":"hi","at":0}],
       "offers":[]}'
# → 200 {"ok":true,"source":"smoke",...}

curl -s https://deals.your-domain.com/onlydeals.json | head -c 200
# → the merged feed JSON
```

## 3 — Point the site at it

In `src/lib/feed.ts`, set:

```ts
export const FEED_URL: string | null = "https://deals.your-domain.com/onlydeals.json";
```

Rebuild and drop `dist/` into `/var/www/onlydeals` on the container.

## 4 — Env values for n8n

Set these on the n8n process (docker-compose `environment:` block, or the container's env):

```
OFFRADAR_INGEST_URL = https://deals.your-domain.com/ingest
OFFRADAR_API_KEY    = <the hex string from /etc/onlydeals/ingest.env — same value>
OFFRADAR_N8N_BASE   = https://n8n.your-domain.com      # base the master scheduler uses to reach source webhooks
```

docker-compose example:

```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n
    environment:
      - OFFRADAR_INGEST_URL=https://deals.your-domain.com/ingest
      - OFFRADAR_API_KEY=paste-the-hex-here
      - OFFRADAR_N8N_BASE=https://n8n.your-domain.com
```

All shipped workflows (`onlydeals-alrajhi`, `onlydeals-jarir`, `onlydeals-alinma`,
master scheduler) read exactly these three names via `$env`.

## How the loop closes

```
n8n source workflow ──POST offer.v1──▶ nginx /ingest ──▶ ingest.mjs
                                                            │ merge per source,
                                                            │ atomic write
browser ◀── GET /onlydeals.json (CORS) ◀── nginx ◀── onlydeals.json
```
