-- Migration 029: durable migration ledger.
-- Every deployment can now prove exactly which schema scripts have completed.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGSERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  checksum CHAR(64) NOT NULL,
  execution_ms INTEGER NOT NULL DEFAULT 0 CHECK (execution_ms >= 0),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
  ON schema_migrations (applied_at DESC);
