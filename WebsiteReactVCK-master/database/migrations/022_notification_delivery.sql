-- Migration 022: notification delivery, event-driven outbox, and deduplication
-- Supports session.rescheduled, session.cancelled, session.created, material.published,
-- assignment.published, assignment.due_soon, quiz.opened, quiz.due_soon, grade.published, attendance.updated.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(64) NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Backfill event_type from legacy type where appropriate
UPDATE notifications
SET event_type = CASE
  WHEN type = 'assignment' THEN 'assignment.published'
  WHEN type = 'grade' THEN 'grade.published'
  WHEN type = 'live_class' THEN 'session.created'
  ELSE COALESCE(NULLIF(type, ''), 'system')
END
WHERE event_type = 'system' AND type IS NOT NULL AND type <> 'system';

CREATE INDEX IF NOT EXISTS idx_notifications_event_type
  ON notifications (event_type);

CREATE INDEX IF NOT EXISTS idx_notifications_dedupe_key
  ON notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- Notification outbox for reliable delivery worker / event audit log
CREATE TABLE IF NOT EXISTS notification_outbox (
  id              BIGSERIAL PRIMARY KEY,
  event_type      VARCHAR(64) NOT NULL,
  recipient_ids   BIGINT[] NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key      VARCHAR(255),
  actor_id        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  correlation_id  VARCHAR(100),
  status          VARCHAR(20) NOT NULL DEFAULT 'delivered',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_status_created
  ON notification_outbox (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_dedupe
  ON notification_outbox (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
