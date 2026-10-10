-- Separate gradebook duties. Reopening a published result defaults to admin only.
INSERT INTO lms_permissions (code, name, scope, is_system) VALUES
  ('lms.gradebook.policy.manage', 'Cấu hình cách tính điểm', 'Class', FALSE),
  ('lms.gradebook.finalize', 'Chốt sổ điểm lớp', 'Class', FALSE),
  ('lms.gradebook.reopen', 'Mở lại sổ điểm đã chốt', 'Class', FALSE)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, scope=EXCLUDED.scope;

INSERT INTO lms_role_permissions (permission_id, role, is_allowed)
SELECT p.id, roles.role,
  CASE WHEN roles.role='admin' THEN TRUE
       WHEN roles.role='creator' AND p.code IN ('lms.gradebook.policy.manage','lms.gradebook.finalize') THEN TRUE
       ELSE FALSE END
FROM lms_permissions p
CROSS JOIN (VALUES ('admin'),('creator'),('user')) AS roles(role)
WHERE p.code IN ('lms.gradebook.policy.manage','lms.gradebook.finalize','lms.gradebook.reopen')
ON CONFLICT (permission_id, role) DO NOTHING;
