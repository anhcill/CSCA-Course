-- Day 4: One-time SSO exchange codes and safe identity-linking challenges (CSCA-Course)

CREATE TABLE IF NOT EXISTS integration_sso_codes (
  id BIGSERIAL PRIMARY KEY,
  code_hash CHAR(64) NOT NULL UNIQUE,
  source_system VARCHAR(32) NOT NULL CHECK (source_system IN ('moly', 'csca-course')),
  source_user_id VARCHAR(128) NOT NULL,
  local_user_id INTEGER NULL REFERENCES users(id) ON DELETE CASCADE,
  target_system VARCHAR(32) NOT NULL CHECK (target_system IN ('moly', 'csca-course')),
  target_path TEXT NOT NULL,
  nonce VARCHAR(128) NOT NULL,
  scope_type VARCHAR(32) NOT NULL DEFAULT 'account' CHECK (scope_type IN ('account', 'course')),
  scoped_local_course_id INTEGER NULL,
  scoped_external_course_id VARCHAR(160) NULL,
  correlation_id VARCHAR(128) NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  used_by_system VARCHAR(32) NULL,
  revoked_at TIMESTAMPTZ NULL,
  consume_ip VARCHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_sso_codes_source_user
  ON integration_sso_codes (source_system, source_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_sso_codes_expires_unused
  ON integration_sso_codes (expires_at)
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS integration_sso_link_requests (
  id BIGSERIAL PRIMARY KEY,
  link_token_hash CHAR(64) NOT NULL UNIQUE,
  source_system VARCHAR(32) NOT NULL CHECK (source_system IN ('moly', 'csca-course')),
  external_user_id VARCHAR(128) NOT NULL,
  candidate_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  source_role VARCHAR(32) NOT NULL DEFAULT 'student',
  target_path TEXT NOT NULL,
  sso_nonce VARCHAR(128) NULL,
  correlation_id VARCHAR(128) NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_sso_link_candidate_open
  ON integration_sso_link_requests (candidate_user_id, expires_at DESC)
  WHERE completed_at IS NULL;
