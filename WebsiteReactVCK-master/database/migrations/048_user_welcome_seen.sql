-- Migration 048: User first-time welcome screen state
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS welcome_seen_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_users_welcome_seen_at
  ON users (welcome_seen_at);

-- Admin accounts never see the welcome screen
UPDATE users
SET welcome_seen_at = NOW()
WHERE role = 'admin' AND welcome_seen_at IS NULL;
