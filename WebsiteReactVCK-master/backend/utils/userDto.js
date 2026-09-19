import { query } from "../db/connect.js";

const STUDENT_PROFILE_FIELDS = [
  "fullName",
  "currentEducationLevel",
  "currentSchool",
  "targetProgram",
  "intendedIntakeYear",
  "intendedIntakeTerm",
  "targetMajor",
  "targetCity",
  "hskLevel",
  "hskkLevel",
  "studyGoal",
];

export const toStudentProfileDto = (row) => {
  const profile = {
    fullName: row.student_full_name ?? row.full_name ?? null,
    currentEducationLevel: row.student_current_education_level ?? row.current_education_level ?? null,
    currentSchool: row.student_current_school ?? row.current_school ?? null,
    targetProgram: row.student_target_program ?? row.target_program ?? null,
    intendedIntakeYear: row.student_intended_intake_year ?? row.intended_intake_year ?? null,
    intendedIntakeTerm: row.student_intended_intake_term ?? row.intended_intake_term ?? null,
    targetMajor: row.student_target_major ?? row.target_major ?? null,
    targetCity: row.student_target_city ?? row.target_city ?? null,
    hskLevel: row.student_hsk_level ?? row.hsk_level ?? null,
    hskkLevel: row.student_hskk_level ?? row.hskk_level ?? null,
    studyGoal: row.student_study_goal ?? row.study_goal ?? null,
  };

  return STUDENT_PROFILE_FIELDS.some((field) => profile[field] !== null) ? profile : null;
};

export const toUserDto = (row) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  role: row.role,
  gender: row.gender,
  avatarUrl: row.avatar_url ?? null,
  isVip: Boolean(row.is_vip),
  vipExpiresAt: row.vip_expires_at ?? null,
  emailVerified: Boolean(row.email_verified),
  authProvider: row.oauth_provider ?? "local",
  hasPassword: Boolean(row.password_hash),
  isLocked: Boolean(row.is_locked),
  isManagementManaged: Boolean(row.is_management_managed),
  lmsAccountStatus: row.lms_account_status ?? "unmanaged",
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  studentProfile: toStudentProfileDto(row),
});

export const getUserDtoById = async (userId, db = { query }) => {
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.email, u.role, u.gender, u.avatar_url,
            u.is_vip, u.vip_expires_at, u.email_verified, u.is_locked, u.oauth_provider,
            u.is_management_managed, u.lms_account_status,
            u.password_hash, u.created_at, u.updated_at,
            sp.full_name AS student_full_name,
            sp.current_education_level AS student_current_education_level,
            sp.current_school AS student_current_school,
            sp.target_program AS student_target_program,
            sp.intended_intake_year AS student_intended_intake_year,
            sp.intended_intake_term AS student_intended_intake_term,
            sp.target_major AS student_target_major,
            sp.target_city AS student_target_city,
            sp.hsk_level AS student_hsk_level,
            sp.hskk_level AS student_hskk_level,
            sp.study_goal AS student_study_goal
     FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );

  return rows[0] ? toUserDto(rows[0]) : null;
};
