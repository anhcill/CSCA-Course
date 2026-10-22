-- Migration 062: Teacher Salary & Payroll Management Enhancements
-- 1. Explicit session duration override
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS duration_hours NUMERIC(4, 2);

-- 2. Settlement, adjustments, and payment tracking for teacher payroll
CREATE TABLE IF NOT EXISTS teacher_salary_settlements (
  id BIGSERIAL PRIMARY KEY,
  teacher_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period VARCHAR(20) NOT NULL DEFAULT 'all',
  bonus_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  deduction_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  notes TEXT,
  paid_at TIMESTAMPTZ,
  settled_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_teacher_salary_settlement_period UNIQUE (teacher_id, period)
);

CREATE INDEX IF NOT EXISTS idx_teacher_salary_settlements_teacher_period
  ON teacher_salary_settlements(teacher_id, period);

CREATE INDEX IF NOT EXISTS idx_teacher_salary_settlements_status
  ON teacher_salary_settlements(payment_status);
