-- onlydeals · Postgres schema
-- The feed service (deploy/feed-service.mjs) also runs these as
-- CREATE TABLE IF NOT EXISTS on boot, so applying this file manually is
-- optional ("zero manual migration"). Keep the two in sync.

-- ---------------------------------------------------------------- offers
-- Written by the n8n source workflows (upsert) and read by the feed
-- service, which aliases these columns into the offer.v1 card shape.
CREATE TABLE IF NOT EXISTS offers (
  id              bigserial   PRIMARY KEY,
  merchant_id     text        NOT NULL,                     -- slug, part of the dedupe key
  source          text        NOT NULL,                     -- alrajhi | jarir | alinma | …
  source_type     text        NOT NULL DEFAULT 'bank',      -- bank | vendor
  card_name       text        NOT NULL DEFAULT 'All cards',
  offer_title     text        NOT NULL,                     -- merchant / brand / offer name
  description     text,
  discount_value  text,                                     -- '20%' | '50 SAR' | …
  discount_type   text,                                     -- percentage | fixed
  min_spend       numeric,
  max_discount    numeric,
  start_date      date,
  end_date        date,
  terms_url       text,
  image_url       text,
  active          boolean     NOT NULL DEFAULT true,
  last_seen       timestamptz NOT NULL DEFAULT now(),       -- n8n stamps on every upsert
  UNIQUE (merchant_id, source, offer_title)
);

CREATE INDEX IF NOT EXISTS offers_active_idx    ON offers (active);
CREATE INDEX IF NOT EXISTS offers_source_idx    ON offers (source);
CREATE INDEX IF NOT EXISTS offers_last_seen_idx ON offers (last_seen);

-- ----------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
  id           serial       PRIMARY KEY,
  email        text         UNIQUE NOT NULL,
  pass_hash    text         NOT NULL,                      -- scrypt: "<saltHex>:<hashHex>"
  display_name text,
  role         text         NOT NULL DEFAULT 'user',       -- user | admin
  disabled     boolean      NOT NULL DEFAULT false,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------- prune helper
-- Source workflows call this after each upsert batch, e.g. alrajhi:
--   UPDATE offers SET active = false
--   WHERE source = 'alrajhi' AND active = true
--     AND last_seen < now() - interval '12 hours';
