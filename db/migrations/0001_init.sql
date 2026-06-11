CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE classification AS ENUM ('public', 'internal', 'confidential', 'secret');
CREATE TYPE confidence_level AS ENUM ('high', 'med', 'low');

CREATE TABLE countries (
  iso3        CHAR(3) PRIMARY KEY,
  name_en     TEXT NOT NULL,
  name_ar     TEXT NOT NULL,
  region      TEXT NOT NULL,
  flag_emoji  TEXT,
  centroid    GEOGRAPHY(POINT, 4326),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX countries_region_idx ON countries (region);

CREATE TABLE indicators (
  id            TEXT PRIMARY KEY,
  country_iso3  CHAR(3) NOT NULL REFERENCES countries (iso3) ON DELETE CASCADE,
  metric        TEXT NOT NULL,
  value         DOUBLE PRECISION NOT NULL,
  unit          TEXT NOT NULL,
  year          INTEGER NOT NULL,
  source        TEXT NOT NULL,
  confidence    confidence_level NOT NULL DEFAULT 'med',
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (country_iso3, metric, year)
);

CREATE INDEX indicators_metric_year_idx ON indicators (metric, year);
CREATE INDEX indicators_country_idx ON indicators (country_iso3);

CREATE TABLE users (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                       TEXT UNIQUE NOT NULL,
  name_en                     TEXT NOT NULL,
  name_ar                     TEXT NOT NULL,
  role                        TEXT NOT NULL CHECK (role IN ('viewer','analyst','lead','executive','admin')),
  classification_clearance    classification NOT NULL DEFAULT 'internal',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at               TIMESTAMPTZ
);

CREATE TABLE briefings (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  country_iso3    CHAR(3) NOT NULL REFERENCES countries (iso3),
  audience        TEXT NOT NULL,
  classification  classification NOT NULL,
  created_by      UUID REFERENCES users (id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  body            TEXT NOT NULL,
  body_tsv        tsvector GENERATED ALWAYS AS (to_tsvector('simple', body)) STORED
);

CREATE INDEX briefings_country_idx ON briefings (country_iso3);
CREATE INDEX briefings_body_tsv_idx ON briefings USING GIN (body_tsv);

CREATE TABLE audit_events (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES users (id),
  action          TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     TEXT,
  classification  classification,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_user_time_idx ON audit_events (user_id, occurred_at DESC);
