-- onlydeals · offers table
-- Matches the column set the n8n source workflows upsert into, and what the
-- feed service reads to build offer.v1. Run as a role that owns the schema:
--   psql -U onlydeals -d onlydeals -f schema.sql

CREATE TABLE IF NOT EXISTS offers (
    id             BIGSERIAL PRIMARY KEY,
    merchant_id    TEXT        NOT NULL,
    source         TEXT        NOT NULL,                 -- e.g. 'alinma'
    source_type    TEXT        NOT NULL DEFAULT 'bank',  -- 'bank' | 'vendor'
    card_name      TEXT        NOT NULL DEFAULT 'All cards',
    offer_title    TEXT        NOT NULL,                 -- merchant / brand
    description    TEXT,
    discount_value TEXT,                                 -- e.g. '20%' or '50 SAR'
    discount_type  TEXT,                                 -- 'percentage' | 'fixed' | ...
    min_spend      NUMERIC,
    max_discount   NUMERIC,
    start_date     DATE,
    end_date       DATE,
    terms_url      TEXT,
    image_url      TEXT,
    active         BOOLEAN     NOT NULL DEFAULT TRUE,
    scraped_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- one live row per (merchant, source, offer) — what the n8n upsert matches on
    CONSTRAINT offers_unique_offer UNIQUE (merchant_id, source, offer_title)
);

CREATE INDEX IF NOT EXISTS idx_offers_active       ON offers (active);
CREATE INDEX IF NOT EXISTS idx_offers_source       ON offers (source);
CREATE INDEX IF NOT EXISTS idx_offers_end_date     ON offers (end_date);

-- Optional role the feed service connects as (read-only). Skip if you reuse
-- the owning role for the service instead.
-- CREATE ROLE onlydeals_ro LOGIN PASSWORD 'change-me';
-- GRANT CONNECT ON DATABASE onlydeals TO onlydeals_ro;
-- GRANT USAGE ON SCHEMA public TO onlydeals_ro;
-- GRANT SELECT ON offers TO onlydeals_ro;
