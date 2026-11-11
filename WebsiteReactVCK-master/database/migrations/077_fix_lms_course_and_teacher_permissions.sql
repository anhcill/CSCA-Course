-- Ensure all courses that have active classes are published so they don't break
-- students and teachers schedules and curriculum access.
UPDATE courses
SET is_published = TRUE, updated_at = NOW()
WHERE id IN (
  SELECT DISTINCT course_id
  FROM live_classes
  WHERE status = 'active' AND course_id IS NOT NULL
) AND is_published = FALSE;

-- Ensure teachers (role = 'creator') have all necessary teaching permissions in the LMS matrix.
UPDATE lms_role_permissions rp
SET is_allowed = TRUE, updated_at = NOW()
FROM lms_permissions p
WHERE rp.permission_id = p.id
  AND rp.role = 'creator'
  AND p.code IN (
    'lms.course.manage',
    'lms.schedule.manage',
    'lms.attendance.manage',
    'lms.student.view',
    'lms.file.manage',
    'lms.quiz.manage',
    'lms.assignment.grade',
    'lms.assignment.manage',
    'lms.support.manage',
    'lms.formula.manage',
    'lms.vocabulary.manage',
    'lms.gradebook.finalize',
    'lms.gradebook.policy.manage',
    'lms.notification.send',
    'lms.report.export'
  );
