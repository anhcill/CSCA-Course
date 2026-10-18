-- Migration 054: Welcome Screen Settings Configuration
CREATE TABLE IF NOT EXISTS welcome_screen_settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Seed initial default configuration
INSERT INTO welcome_screen_settings (setting_key, config)
VALUES (
  'default',
  '{
    "badge": "MolyCourse LMS",
    "autoTransitionDuration": 4.8,
    "autoTransitionEnabled": true,
    "teacher": {
      "title": "Chào mừng đến với không gian giảng dạy",
      "description": "Quản lý lớp học, bài giảng và đồng hành cùng học viên của bạn.",
      "buttonText": "Bắt đầu giảng dạy",
      "loadingNote": "Đang chuẩn bị không gian giảng dạy của bạn..."
    },
    "student": {
      "title": "Chào mừng đến với không gian học tập",
      "description": "Khám phá bài học, theo dõi tiến độ và chinh phục mục tiêu của bạn.",
      "buttonText": "Bắt đầu học",
      "loadingNote": "Đang chuẩn bị không gian học tập của bạn..."
    }
  }'::jsonb
)
ON CONFLICT (setting_key) DO NOTHING;
