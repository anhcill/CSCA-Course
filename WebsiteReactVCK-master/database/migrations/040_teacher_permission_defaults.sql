-- Class lifecycle and platform operations are administered outside the teaching role.
UPDATE lms_role_permissions rp
SET is_allowed = FALSE, updated_at = NOW()
FROM lms_permissions p
WHERE rp.permission_id = p.id AND rp.role = 'creator'
  AND p.code = 'lms.class.manage';

-- Admin bypasses permission checks in the API; keep the matrix truthful.
UPDATE lms_role_permissions
SET is_allowed = TRUE, updated_at = NOW()
WHERE role = 'admin' AND is_allowed = FALSE;

-- The old combined gradebook permission was replaced by separate duties in 039.
DELETE FROM lms_permissions WHERE code = 'lms.gradebook.manage';

UPDATE lms_permissions
SET name = 'Biên tập giáo trình của khóa học phụ trách'
WHERE code = 'lms.course.manage';

UPDATE lms_permissions
SET name = 'Gửi thông báo cho lớp phụ trách'
WHERE code = 'lms.notification.send';
