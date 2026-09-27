-- Migration 030: class and session announcements with scheduled delivery.

CREATE TABLE IF NOT EXISTS class_announcements (
  id BIGSERIAL PRIMARY KEY,
  live_class_id BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  class_session_id BIGINT REFERENCES class_sessions(id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  link_url TEXT,
  attachment_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  last_error TEXT,
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((status = 'scheduled' AND scheduled_at IS NOT NULL) OR status <> 'scheduled')
);

CREATE INDEX IF NOT EXISTS idx_class_announcements_delivery
  ON class_announcements (status, scheduled_at)
  WHERE status IN ('scheduled', 'sending');

CREATE INDEX IF NOT EXISTS idx_class_announcements_class_session_created
  ON class_announcements (live_class_id, class_session_id, created_at DESC);
