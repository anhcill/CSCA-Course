-- Migration 032: auditable gradebook exports, attendance corrections and
-- learner-specific assessment accommodations/question bank.

CREATE TABLE IF NOT EXISTS lms_report_exports (
  id            BIGSERIAL PRIMARY KEY,
  report_type   VARCHAR(40) NOT NULL CHECK (report_type IN ('gradebook')),
  export_format VARCHAR(10) NOT NULL CHECK (export_format IN ('csv', 'xlsx')),
  class_id      BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE RESTRICT,
  course_id     BIGINT REFERENCES courses(id) ON DELETE SET NULL,
  filters_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_count     INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  exported_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_report_exports_class_created
  ON lms_report_exports (class_id, created_at DESC);

CREATE TABLE IF NOT EXISTS attendance_amendment_requests (
  id               BIGSERIAL PRIMARY KEY,
  session_id       BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE RESTRICT,
  user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  original_status  VARCHAR(20) NOT NULL CHECK (original_status IN ('present', 'absent', 'excused')),
  original_note    VARCHAR(255) NOT NULL DEFAULT '',
  requested_status VARCHAR(20) NOT NULL CHECK (requested_status IN ('present', 'absent', 'excused')),
  requested_note   VARCHAR(255) NOT NULL DEFAULT '',
  reason           TEXT NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  review_note      TEXT,
  applied_at       TIMESTAMPTZ,
  CONSTRAINT attendance_amendment_review_state_check CHECK (
    (status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL)
    OR (status IN ('approved', 'rejected', 'cancelled'))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_amendment_pending
  ON attendance_amendment_requests (session_id, user_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_attendance_amendments_session_requested
  ON attendance_amendment_requests (session_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS assessment_accommodations (
  id                     BIGSERIAL PRIMARY KEY,
  assessment_type        VARCHAR(20) NOT NULL CHECK (assessment_type IN ('assignment', 'quiz')),
  assessment_id          BIGINT NOT NULL,
  user_id                BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  due_at                 TIMESTAMPTZ,
  extra_time_minutes     SMALLINT NOT NULL DEFAULT 0 CHECK (extra_time_minutes BETWEEN 0 AND 480),
  attempt_limit_override SMALLINT CHECK (attempt_limit_override BETWEEN 1 AND 10),
  reason                 TEXT NOT NULL,
  status                 VARCHAR(20) NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'revoked')),
  created_by             BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by             BIGINT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at             TIMESTAMPTZ,
  CONSTRAINT assessment_accommodation_adjustment_check CHECK (
    due_at IS NOT NULL OR extra_time_minutes > 0 OR attempt_limit_override IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_assessment_accommodation_learner
  ON assessment_accommodations (assessment_type, assessment_id, user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_accommodations_assessment_active
  ON assessment_accommodations (assessment_type, assessment_id, status);

DROP TRIGGER IF EXISTS trg_assessment_accommodations_updated_at ON assessment_accommodations;
CREATE TRIGGER trg_assessment_accommodations_updated_at
  BEFORE UPDATE ON assessment_accommodations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS quiz_question_bank (
  id             BIGSERIAL PRIMARY KEY,
  course_id      BIGINT REFERENCES courses(id) ON DELETE CASCADE,
  owner_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
  question_text  TEXT NOT NULL,
  question_type  VARCHAR(50) NOT NULL DEFAULT 'single_choice'
                 CHECK (question_type IN ('single_choice', 'multiple_choice', 'fill_blank')),
  options_json   JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer TEXT NOT NULL,
  explanation    TEXT,
  points         NUMERIC(5,2) NOT NULL DEFAULT 1.00 CHECK (points > 0 AND points <= 100),
  tags           TEXT[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_question_bank_owner_course_created
  ON quiz_question_bank (owner_id, course_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_quiz_question_bank_updated_at ON quiz_question_bank;
CREATE TRIGGER trg_quiz_question_bank_updated_at
  BEFORE UPDATE ON quiz_question_bank
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO lms_permissions (code, name, scope, is_system) VALUES
  ('lms.assessment.accommodate', 'Điều chỉnh hạn nộp và lượt làm theo học viên', 'Class', FALSE),
  ('lms.attendance.amend.review', 'Duyệt phiếu chỉnh sửa điểm danh', 'Class', FALSE)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, scope = EXCLUDED.scope;

INSERT INTO lms_role_permissions (permission_id, role, is_allowed)
SELECT p.id, roles.role,
       CASE
         WHEN roles.role = 'admin' THEN TRUE
         WHEN roles.role = 'creator' AND p.code = 'lms.assessment.accommodate' THEN TRUE
         ELSE FALSE
       END
FROM lms_permissions p
CROSS JOIN (VALUES ('admin'), ('creator'), ('user')) AS roles(role)
WHERE p.code IN ('lms.assessment.accommodate', 'lms.attendance.amend.review')
ON CONFLICT (permission_id, role) DO NOTHING;
