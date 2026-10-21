ALTER TABLE users
  ADD COLUMN IF NOT EXISTS device_limit_attempts SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS device_limit_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_reason VARCHAR(80),
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_device_limit_attempts_range'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_device_limit_attempts_range
      CHECK (device_limit_attempts BETWEEN 0 AND 3);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS trusted_login_devices (
  id                BIGSERIAL    PRIMARY KEY,
  user_id           BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_token_hash CHAR(64)     NOT NULL,
  device_name       VARCHAR(160) NOT NULL,
  user_agent        TEXT,
  first_ip          INET,
  last_ip           INET,
  first_seen_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_login_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  revoked_at        TIMESTAMPTZ,
  revoked_by        BIGINT       REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trusted_login_devices_active_token
  ON trusted_login_devices(user_id, device_token_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_trusted_login_devices_active_user
  ON trusted_login_devices(user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS trusted_device_id BIGINT REFERENCES trusted_login_devices(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_sessions_active_device
  ON user_sessions(trusted_device_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_active_user
  ON user_sessions(user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

-- Sessions issued before device tracking cannot satisfy the new binding and
-- are revoked once during rollout. Trusted devices created afterwards remain
-- registered even when their short-lived JWT session expires.
UPDATE user_sessions
SET revoked_at = COALESCE(revoked_at, NOW())
WHERE trusted_device_id IS NULL;
