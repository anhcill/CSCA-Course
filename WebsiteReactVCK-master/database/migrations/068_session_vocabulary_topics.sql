-- Group vocabulary inside a combined class session by knowledge topic.
ALTER TABLE session_vocabularies
  ADD COLUMN IF NOT EXISTS topic VARCHAR(100) NOT NULL DEFAULT 'Nội dung chung';

CREATE INDEX IF NOT EXISTS idx_session_vocabularies_session_topic_order
  ON session_vocabularies (session_id, topic, order_index, id);
