-- Immutable submission versions and published grades; private drafts stay separate.
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS return_requested BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS return_reason TEXT;
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS returned_by BIGINT REFERENCES users(id);
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS resubmit_until TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS submission_revisions (
  submission_id BIGINT NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (submission_id, revision)
);
ALTER TABLE submission_grades ADD COLUMN IF NOT EXISTS submission_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE submission_grades ADD COLUMN IF NOT EXISTS annotations JSONB NOT NULL DEFAULT '[]';
ALTER TABLE submission_grades ADD COLUMN IF NOT EXISTS change_reason TEXT;
CREATE TABLE IF NOT EXISTS grading_drafts (
  submission_id BIGINT NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  grader_id BIGINT NOT NULL REFERENCES users(id),
  submission_revision INTEGER NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (submission_id, grader_id)
);

CREATE TABLE IF NOT EXISTS class_gradebook_policies (
  class_id BIGINT PRIMARY KEY REFERENCES live_classes(id),
  policy JSONB NOT NULL,
  updated_by BIGINT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS gradebook_finalizations (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT NOT NULL REFERENCES live_classes(id),
  snapshot JSONB NOT NULL,
  finalized_by BIGINT NOT NULL REFERENCES users(id),
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reopened_by BIGINT REFERENCES users(id),
  reopened_at TIMESTAMPTZ,
  reopen_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gradebook_active_finalization ON gradebook_finalizations(class_id) WHERE reopened_at IS NULL;

ALTER TABLE quiz_question_bank ADD COLUMN IF NOT EXISTS difficulty VARCHAR(12) NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard'));
ALTER TABLE quiz_question_bank ADD COLUMN IF NOT EXISTS visibility VARCHAR(12) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'course'));

CREATE TABLE IF NOT EXISTS student_support_cases (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT NOT NULL REFERENCES live_classes(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  owner_id BIGINT NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'contacted', 'scheduled', 'resolved')),
  follow_up_at TIMESTAMPTZ,
  note TEXT NOT NULL,
  outcome TEXT,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_cases_class_status ON student_support_cases(class_id, status, follow_up_at);
INSERT INTO lms_permissions(code, name, scope, is_system) VALUES
 ('lms.gradebook.manage', 'Cấu hình và chốt sổ điểm', 'Class', FALSE),
 ('lms.support.manage', 'Theo dõi hỗ trợ học viên', 'Class', FALSE)
ON CONFLICT (code) DO NOTHING;
INSERT INTO lms_role_permissions(permission_id, role, is_allowed)
SELECT p.id, r.role, r.role IN ('admin', 'creator') FROM lms_permissions p
CROSS JOIN (VALUES ('admin'), ('creator'), ('user')) r(role)
WHERE p.code IN ('lms.gradebook.manage', 'lms.support.manage')
ON CONFLICT (permission_id, role) DO NOTHING;
