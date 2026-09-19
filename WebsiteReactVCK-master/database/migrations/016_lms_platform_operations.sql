-- Migration 016: LMS platform operations, permissions, class mapping, files and sync queue.
-- Safe to rerun. InternalManagement remains the source of truth for identity/payment.

ALTER TABLE live_classes
  ADD COLUMN IF NOT EXISTS management_class_source_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS management_course_source_id VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_classes_management_class_source_id
  ON live_classes (LOWER(management_class_source_id))
  WHERE management_class_source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_classes_management_course_source_id
  ON live_classes (LOWER(management_course_source_id))
  WHERE management_course_source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS lms_permissions (
  id          BIGSERIAL PRIMARY KEY,
  code        VARCHAR(100) NOT NULL UNIQUE,
  name        VARCHAR(255) NOT NULL,
  scope       VARCHAR(30) NOT NULL CHECK (scope IN ('Application', 'Course', 'Class', 'OwnData')),
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lms_role_permissions (
  permission_id BIGINT NOT NULL REFERENCES lms_permissions(id) ON DELETE CASCADE,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'creator', 'user')),
  is_allowed    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (permission_id, role)
);

DROP TRIGGER IF EXISTS trg_lms_permissions_updated_at ON lms_permissions;
CREATE TRIGGER trg_lms_permissions_updated_at
  BEFORE UPDATE ON lms_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO lms_permissions (code, name, scope, is_system) VALUES
  ('lms.admin.view', 'Xem bảng điều khiển Admin', 'Application', FALSE),
  ('lms.course.manage', 'Quản lý khóa học & giáo trình', 'Course', FALSE),
  ('lms.class.manage', 'Quản lý lớp học & phân công', 'Class', FALSE),
  ('lms.teacher.assign', 'Gán giáo viên vào lớp', 'Class', FALSE),
  ('lms.student.view', 'Xem thông tin & tiến độ học sinh', 'Class', FALSE),
  ('lms.assignment.manage', 'Tạo & chỉnh sửa bài tập', 'Class', FALSE),
  ('lms.assignment.grade', 'Chấm điểm & nhận xét bài tập', 'Class', FALSE),
  ('lms.attendance.manage', 'Điểm danh & cập nhật chuyên cần', 'Class', FALSE),
  ('lms.schedule.manage', 'Quản lý lịch học & phòng Live', 'Class', FALSE),
  ('lms.quiz.manage', 'Tạo & xuất bản đề kiểm tra trắc nghiệm', 'Course', FALSE),
  ('lms.file.manage', 'Tải lên & quản lý tài liệu học tập', 'Class', FALSE),
  ('lms.notification.send', 'Phát thông báo cho lớp / toàn trường', 'Application', FALSE),
  ('lms.report.export', 'Xuất báo cáo điểm & thống kê', 'Course', FALSE),
  ('lms.sync.retry', 'Kích hoạt thử lại hàng đợi đồng bộ', 'Application', FALSE),
  ('lms.permission.manage', 'Cấu hình quyền & phân vai trò', 'Application', TRUE)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, scope = EXCLUDED.scope;

INSERT INTO lms_role_permissions (permission_id, role, is_allowed)
SELECT p.id, roles.role,
       CASE
         WHEN roles.role = 'admin' THEN TRUE
         WHEN roles.role = 'creator' AND p.code IN (
           'lms.course.manage', 'lms.class.manage', 'lms.student.view',
           'lms.assignment.manage', 'lms.assignment.grade', 'lms.attendance.manage',
           'lms.schedule.manage', 'lms.quiz.manage', 'lms.file.manage',
           'lms.notification.send', 'lms.report.export'
         ) THEN TRUE
         ELSE FALSE
       END
FROM lms_permissions p
CROSS JOIN (VALUES ('admin'), ('creator'), ('user')) AS roles(role)
ON CONFLICT (permission_id, role) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_lms_role_permissions_role_allowed
  ON lms_role_permissions (role, is_allowed, permission_id);

CREATE TABLE IF NOT EXISTS lms_learning_files (
  id             BIGSERIAL PRIMARY KEY,
  live_class_id  BIGINT REFERENCES live_classes(id) ON DELETE CASCADE,
  course_id      BIGINT REFERENCES courses(id) ON DELETE CASCADE,
  uploaded_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  original_name  VARCHAR(255) NOT NULL,
  storage_key    VARCHAR(500) NOT NULL UNIQUE,
  storage_provider VARCHAR(20) NOT NULL DEFAULT 'r2'
                   CHECK (storage_provider IN ('r2', 'cloudinary')),
  mime_type      VARCHAR(150) NOT NULL,
  size_bytes     BIGINT NOT NULL CHECK (size_bytes > 0),
  visibility     VARCHAR(20) NOT NULL DEFAULT 'CLASS_ONLY'
                 CHECK (visibility IN ('CLASS_ONLY', 'COURSE', 'PRIVATE')),
  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'ready', 'failed', 'deleted')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lms_learning_files_scope_check CHECK (live_class_id IS NOT NULL OR course_id IS NOT NULL)
);

ALTER TABLE lms_learning_files ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE lms_learning_files DROP CONSTRAINT IF EXISTS lms_learning_files_uploaded_by_fkey;
ALTER TABLE lms_learning_files ADD CONSTRAINT lms_learning_files_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS trg_lms_learning_files_updated_at ON lms_learning_files;
CREATE TRIGGER trg_lms_learning_files_updated_at
  BEFORE UPDATE ON lms_learning_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_lms_learning_files_class_status
  ON lms_learning_files (live_class_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lms_learning_files_course_status
  ON lms_learning_files (course_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS lms_sync_jobs (
  id             BIGSERIAL PRIMARY KEY,
  event_type     VARCHAR(100) NOT NULL,
  entity_type    VARCHAR(100) NOT NULL,
  entity_id      VARCHAR(180),
  status         VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'DEAD_LETTER')),
  retry_count    INT NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries    INT NOT NULL DEFAULT 5 CHECK (max_retries > 0),
  last_error     TEXT,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key VARCHAR(180) UNIQUE,
  correlation_id VARCHAR(128),
  next_attempt_at TIMESTAMPTZ,
  processed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_lms_sync_jobs_updated_at ON lms_sync_jobs;
CREATE TRIGGER trg_lms_sync_jobs_updated_at
  BEFORE UPDATE ON lms_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_lms_sync_jobs_status_created
  ON lms_sync_jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lms_sync_jobs_retry
  ON lms_sync_jobs (status, next_attempt_at);
