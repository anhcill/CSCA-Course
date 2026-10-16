-- Link each concrete class session to the reusable course curriculum.
-- NULL keeps the current behaviour for sessions that have not been mapped yet.
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS course_section_id BIGINT REFERENCES sections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lesson_id BIGINT REFERENCES lessons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_class_sessions_course_section
  ON class_sessions (course_section_id, start_time, id)
  WHERE course_section_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_class_sessions_lesson
  ON class_sessions (lesson_id, start_time, id)
  WHERE lesson_id IS NOT NULL;

-- Curriculum editing is opt-in for each teacher/class assignment. Admins bypass
-- this flag and may grant or revoke it from the course curriculum console.
ALTER TABLE class_teachers
  ADD COLUMN IF NOT EXISTS can_manage_curriculum BOOLEAN NOT NULL DEFAULT FALSE;

-- Course-wide curriculum remains an admin responsibility. Teachers receive
-- access only through the per-class flag above.
UPDATE lms_role_permissions rp
SET is_allowed = FALSE, updated_at = NOW()
FROM lms_permissions p
WHERE rp.permission_id = p.id
  AND rp.role = 'creator'
  AND p.code = 'lms.course.manage';
