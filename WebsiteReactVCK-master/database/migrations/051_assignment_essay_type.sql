-- Migration 051: distinguish manually graded essays from general homework.
-- Existing homework rows remain unchanged because legacy data has no reliable
-- signal that can safely separate writing tasks from other homework.

ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_assignment_type_check;

ALTER TABLE assignments ADD CONSTRAINT assignments_assignment_type_check
  CHECK (assignment_type IN ('homework', 'essay', 'hskk', 'quiz'));
