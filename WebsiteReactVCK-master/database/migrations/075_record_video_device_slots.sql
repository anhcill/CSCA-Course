ALTER TABLE trusted_login_devices
  ADD COLUMN IF NOT EXISTS record_access_granted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_trusted_login_devices_record_access
  ON trusted_login_devices(user_id, record_access_granted_at DESC)
  WHERE revoked_at IS NULL AND record_access_granted_at IS NOT NULL;

