-- Migration 008: Digital Certificates System for HSK / HSKK / CSCA Courses

CREATE TABLE IF NOT EXISTS certificates (
  id               BIGSERIAL PRIMARY KEY,
  certificate_code VARCHAR(100) NOT NULL UNIQUE, -- e.g. 'CERT-HSK3-2026-X9A2'
  user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id        BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  issue_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pdf_url          VARCHAR(500),
  CONSTRAINT       unique_user_course_certificate UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_certificates_code ON certificates(certificate_code);
