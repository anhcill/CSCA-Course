-- Persist immutable quiz-close report snapshots and retryable recipient delivery.

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS attempt_score_policy VARCHAR(20) NOT NULL DEFAULT 'best';

ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_attempt_score_policy_check;
ALTER TABLE quizzes ADD CONSTRAINT quizzes_attempt_score_policy_check
  CHECK (attempt_score_policy IN ('best', 'latest', 'first'));

CREATE TABLE IF NOT EXISTS quiz_close_reports (
  id              BIGSERIAL PRIMARY KEY,
  quiz_id         BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  report_kind     VARCHAR(20) NOT NULL CHECK (report_kind IN ('close', 'final')),
  close_at        TIMESTAMPTZ NOT NULL,
  report_key      VARCHAR(180) NOT NULL UNIQUE,
  status          VARCHAR(30) NOT NULL DEFAULT 'pending'
                  CHECK (status IN (
                    'pending', 'processing', 'waiting_grading',
                    'delivering', 'delivered', 'failed'
                  )),
  snapshot        JSONB,
  retry_count     INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error      TEXT,
  claimed_at      TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quiz_close_reports_snapshot_object_check
    CHECK (snapshot IS NULL OR jsonb_typeof(snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_quiz_close_reports_due
  ON quiz_close_reports (next_attempt_at, id)
  WHERE status IN ('pending', 'processing', 'delivering', 'failed');

CREATE INDEX IF NOT EXISTS idx_quiz_close_reports_quiz_kind
  ON quiz_close_reports (quiz_id, report_kind, created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_close_report_deliveries (
  id                  BIGSERIAL PRIMARY KEY,
  report_id           BIGINT NOT NULL REFERENCES quiz_close_reports(id) ON DELETE CASCADE,
  user_id             BIGINT REFERENCES users(id) ON DELETE SET NULL,
  recipient_email     VARCHAR(320) NOT NULL,
  recipient_name      VARCHAR(255),
  recipient_role      VARCHAR(40) NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts            INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error          TEXT,
  provider_message_id VARCHAR(255),
  claimed_at          TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quiz_close_report_delivery_email_check
    CHECK (POSITION('@' IN recipient_email) > 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_close_report_delivery_recipient_ci
  ON quiz_close_report_deliveries (report_id, LOWER(recipient_email));

CREATE INDEX IF NOT EXISTS idx_quiz_close_report_deliveries_due
  ON quiz_close_report_deliveries (next_attempt_at, id)
  WHERE status IN ('pending', 'processing', 'failed');

DROP TRIGGER IF EXISTS trg_quiz_close_reports_updated_at ON quiz_close_reports;
CREATE TRIGGER trg_quiz_close_reports_updated_at
  BEFORE UPDATE ON quiz_close_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_quiz_close_report_deliveries_updated_at ON quiz_close_report_deliveries;
CREATE TRIGGER trg_quiz_close_report_deliveries_updated_at
  BEFORE UPDATE ON quiz_close_report_deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
