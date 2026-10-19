-- Formula notebook attached to class sessions, with per-student bookmarks.

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_sessions_id_live_class
  ON class_sessions (id, live_class_id);

CREATE TABLE IF NOT EXISTS session_formulas (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT,
  class_id BIGINT,
  subject VARCHAR(20) NOT NULL DEFAULT 'MATH'
    CHECK (subject IN ('MATH', 'PHYSICS', 'CHEMISTRY')),
  chapter_name VARCHAR(255) NOT NULL CHECK (length(btrim(chapter_name)) > 0),
  name_vi VARCHAR(255) NOT NULL CHECK (length(btrim(name_vi)) > 0),
  name_zh VARCHAR(255),
  pinyin VARCHAR(255),
  latex_expression TEXT NOT NULL CHECK (length(btrim(latex_expression)) > 0),
  description TEXT,
  variables_explanation JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(variables_explanation) = 'array'),
  conditions TEXT,
  example_problem TEXT,
  example_solution TEXT,
  order_index INTEGER NOT NULL DEFAULT 0 CHECK (order_index >= 0),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_session_formula_attachment
    CHECK ((session_id IS NULL AND class_id IS NULL) OR (session_id IS NOT NULL AND class_id IS NOT NULL)),
  CONSTRAINT fk_session_formula_session_class
    FOREIGN KEY (session_id, class_id)
    REFERENCES class_sessions (id, live_class_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_formulas_session_order
  ON session_formulas (session_id, order_index, id)
  WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_session_formulas_class
  ON session_formulas (class_id, session_id)
  WHERE class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_session_formulas_subject
  ON session_formulas (subject, name_vi);
CREATE INDEX IF NOT EXISTS idx_session_formulas_created_by
  ON session_formulas (created_by, updated_at DESC);

DROP TRIGGER IF EXISTS trg_session_formulas_updated_at ON session_formulas;
CREATE TRIGGER trg_session_formulas_updated_at
  BEFORE UPDATE ON session_formulas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS student_formula_bookmarks (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  formula_id BIGINT NOT NULL REFERENCES session_formulas(id) ON DELETE CASCADE,
  personal_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_student_formula_bookmark UNIQUE (user_id, formula_id)
);

CREATE INDEX IF NOT EXISTS idx_student_formula_bookmarks_user_created
  ON student_formula_bookmarks (user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_student_formula_bookmarks_updated_at ON student_formula_bookmarks;
CREATE TRIGGER trg_student_formula_bookmarks_updated_at
  BEFORE UPDATE ON student_formula_bookmarks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO lms_permissions (code, name, scope, is_system) VALUES
  ('lms.formula.manage', 'Quản lý công thức theo buổi học', 'Class', FALSE)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, scope = EXCLUDED.scope;

INSERT INTO lms_role_permissions (permission_id, role, is_allowed)
SELECT p.id, roles.role, roles.role IN ('admin', 'creator')
FROM lms_permissions p
CROSS JOIN (VALUES ('admin'), ('creator'), ('user')) AS roles(role)
WHERE p.code = 'lms.formula.manage'
ON CONFLICT (permission_id, role) DO UPDATE
SET is_allowed = EXCLUDED.is_allowed, updated_at = NOW();
