-- 087_teacher_face_attendance.sql
-- Teacher facial enrollment & session check-in/check-out via AWS Rekognition
-- (Face Liveness + CompareFaces) linked to payroll (Cách 1: requires valid check-in + check-out or admin approval).

CREATE TABLE IF NOT EXISTS teacher_face_enrollments (
  id BIGSERIAL PRIMARY KEY,
  teacher_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'rejected', 'unlocked')),
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  consent_accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  liveness_confidence NUMERIC(5,2),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teacher_face_enrollments_status
  ON teacher_face_enrollments (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS teacher_session_attendance (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  teacher_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Check-in (Vào ca)
  check_in_at TIMESTAMPTZ,
  check_in_status TEXT
    CHECK (check_in_status IS NULL OR check_in_status IN ('on_time', 'late', 'manual_review', 'approved_manual', 'rejected')),
  late_minutes INTEGER NOT NULL DEFAULT 0,
  check_in_liveness_session_id TEXT,
  check_in_liveness_score NUMERIC(5,2),
  check_in_face_similarity NUMERIC(5,2),
  check_in_r2_key TEXT,
  check_in_provider TEXT
    CHECK (check_in_provider IS NULL OR check_in_provider IN ('aws_rekognition', 'mock', 'manual')),
  check_in_ip TEXT,
  check_in_user_agent TEXT,

  -- Check-out (Ra ca)
  check_out_at TIMESTAMPTZ,
  check_out_status TEXT
    CHECK (check_out_status IS NULL OR check_out_status IN ('on_time', 'early_leave', 'manual_review', 'approved_manual', 'rejected')),
  early_leave_minutes INTEGER NOT NULL DEFAULT 0,
  check_out_liveness_session_id TEXT,
  check_out_liveness_score NUMERIC(5,2),
  check_out_face_similarity NUMERIC(5,2),
  check_out_r2_key TEXT,
  check_out_provider TEXT
    CHECK (check_out_provider IS NULL OR check_out_provider IN ('aws_rekognition', 'mock', 'manual')),
  check_out_ip TEXT,
  check_out_user_agent TEXT,

  -- Payroll gate & Admin override (Cách 1)
  payroll_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  admin_override_status TEXT
    CHECK (admin_override_status IS NULL OR admin_override_status IN ('approved', 'rejected')),
  admin_override_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  admin_override_at TIMESTAMPTZ,
  admin_override_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (session_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_session_attendance_teacher
  ON teacher_session_attendance (teacher_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_teacher_session_attendance_session
  ON teacher_session_attendance (session_id);

CREATE INDEX IF NOT EXISTS idx_teacher_session_attendance_review
  ON teacher_session_attendance (payroll_eligible, admin_override_status, updated_at DESC);
