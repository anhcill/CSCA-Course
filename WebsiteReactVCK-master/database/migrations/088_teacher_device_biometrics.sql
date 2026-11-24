-- 088_teacher_device_biometrics.sql
-- Device-native WebAuthn biometrics (iOS Face ID / Touch ID, Android Fingerprint, Windows Hello, Mac Touch ID)
-- for zero-cost teacher session check-in & check-out linked to Cách 1 payroll.

CREATE TABLE IF NOT EXISTS teacher_biometric_credentials (
  id BIGSERIAL PRIMARY KEY,
  teacher_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key_spki TEXT NOT NULL,
  public_key_alg INTEGER NOT NULL DEFAULT -7,
  sign_count BIGINT NOT NULL DEFAULT 0,
  device_label TEXT NOT NULL DEFAULT 'Thiết bị cá nhân',
  transports TEXT[] NOT NULL DEFAULT ARRAY['internal']::TEXT[],
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_teacher_biometric_creds_teacher
  ON teacher_biometric_credentials (teacher_id, revoked_at, created_at DESC);

-- Extend provider CHECK constraints on teacher_session_attendance to allow 'device_webauthn'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'teacher_session_attendance'::regclass
      AND conname = 'teacher_session_attendance_check_in_provider_check'
  ) THEN
    ALTER TABLE teacher_session_attendance
      DROP CONSTRAINT teacher_session_attendance_check_in_provider_check;
  END IF;

  ALTER TABLE teacher_session_attendance
    ADD CONSTRAINT teacher_session_attendance_check_in_provider_check
    CHECK (
      check_in_provider IS NULL
      OR check_in_provider IN ('aws_rekognition', 'device_webauthn', 'mock', 'manual')
    );

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'teacher_session_attendance'::regclass
      AND conname = 'teacher_session_attendance_check_out_provider_check'
  ) THEN
    ALTER TABLE teacher_session_attendance
      DROP CONSTRAINT teacher_session_attendance_check_out_provider_check;
  END IF;

  ALTER TABLE teacher_session_attendance
    ADD CONSTRAINT teacher_session_attendance_check_out_provider_check
    CHECK (
      check_out_provider IS NULL
      OR check_out_provider IN ('aws_rekognition', 'device_webauthn', 'mock', 'manual')
    );
END $$;
