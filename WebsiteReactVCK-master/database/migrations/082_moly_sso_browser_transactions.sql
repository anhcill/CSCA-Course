-- Day 4 Review Fix (P1): Destination-initiated SSO browser transaction + PKCE S256
-- and browser-cookie binding for Safe Linking (CSCA-Course).
-- Strictly additive & idempotent.

CREATE TABLE IF NOT EXISTS integration_sso_browser_txs (
  id BIGSERIAL PRIMARY KEY,
  tx_token_hash CHAR(64) NOT NULL UNIQUE,
  direction VARCHAR(32) NOT NULL CHECK (direction IN ('csca_course_to_moly', 'moly_to_csca_course')),
  purpose VARCHAR(32) NOT NULL DEFAULT 'sso_login' CHECK (purpose IN ('sso_login', 'sso_safe_link')),
  state VARCHAR(128) NOT NULL,
  code_verifier VARCHAR(255) NOT NULL,
  code_challenge VARCHAR(255) NOT NULL,
  code_challenge_method VARCHAR(16) NOT NULL DEFAULT 'S256' CHECK (code_challenge_method = 'S256'),
  target_path TEXT NOT NULL,
  link_request_id BIGINT NULL,
  correlation_id VARCHAR(128) NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_sso_browser_txs_expires_active
  ON integration_sso_browser_txs (expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

ALTER TABLE integration_sso_codes
  ADD COLUMN IF NOT EXISTS pkce_challenge VARCHAR(255),
  ADD COLUMN IF NOT EXISTS pkce_method VARCHAR(16);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'integration_sso_codes'::regclass
      AND conname = 'chk_integration_sso_codes_pkce_method'
  ) THEN
    ALTER TABLE integration_sso_codes
      ADD CONSTRAINT chk_integration_sso_codes_pkce_method
      CHECK (pkce_method IS NULL OR pkce_method = 'S256');
  END IF;
END $$;

ALTER TABLE integration_sso_link_requests
  ADD COLUMN IF NOT EXISTS browser_tx_hash CHAR(64);
