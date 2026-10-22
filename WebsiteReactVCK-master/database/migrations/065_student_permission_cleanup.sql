-- Learners consume LMS content through enrollment/access policies. The
-- operational matrix only controls administrator and teacher actions.
UPDATE lms_role_permissions
SET is_allowed = FALSE, updated_at = NOW()
WHERE role = 'user' AND is_allowed = TRUE;
