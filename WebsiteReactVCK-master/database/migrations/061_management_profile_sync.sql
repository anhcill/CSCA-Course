-- Migration 061: Management Profile Synchronization
-- Ensures teacher_code, department, position exist on users table
-- Ensures student_code exists on student_profiles table

ALTER TABLE users ADD COLUMN IF NOT EXISTS teacher_code text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS position text;

ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS student_code text;

CREATE INDEX IF NOT EXISTS idx_users_teacher_code ON users(LOWER(teacher_code)) WHERE teacher_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_profiles_student_code ON student_profiles(LOWER(student_code)) WHERE student_code IS NOT NULL;
