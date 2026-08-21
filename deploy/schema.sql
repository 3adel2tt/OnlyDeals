-- onlydeals · Postgres schema
-- The feed service (deploy/feed-service.mjs) also runs these as
-- CREATE TABLE IF NOT EXISTS on boot, so applying this file manually is
-- optional ("zero manual migration"). Keep the two in sync.

-- ---------------------------------------------------------------- offers
CREATE TABLE IF NOT EXISTS offers (
  id              serial PRIMARY KEY,
  source          text        NOT NULL,
  ext_id          text        NOT NULL,
  merchant        text        NOT NULL,
  headline        text        NOT NULL DEFAULT '',
  discount_label  text        NOT NULL DEFAULT '',
  value           numeric     NOT NULL DEFAULT 0,
  kind            text        NOT NULL DEFAULT 'percent',   -- percent | cashback | bogo | installments
  category        text        NOT NULL DEFAULT 'online',
  bank            text        NOT NULL DEFAULT '',
  card            text        NOT NULL DEFAULT '',
  image           text        NOT NULL DEFAULT '',
  cards           jsonb       NOT NULL DEFAULT '[]',
  code            text,
  link            text        NOT NULL DEFAULT '',
  expires_at      timestamptz,
  terms           jsonb       NOT NULL DEFAULT '[]',
  last_seen       timestamptz NOT NULL DEFAULT now(),
  active          boolean     NOT NULL DEFAULT true,
  UNIQUE (source, ext_id)
);

CREATE INDEX IF NOT EXISTS offers_active_idx   ON offers (active);
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
