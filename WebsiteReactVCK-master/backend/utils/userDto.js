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

export const toUserDto = (row, extras = {}) => {
  const studentProfile = toStudentProfileDto(row);
  const studentCode = row.student_code || row.external_student_id || null;
  const teacherCode = row.teacher_code || null;
  const staffCode = row.teacher_code || row.management_staff_source_id || null;
  const phone = row.management_phone || null;
  const position = row.position || null;
  const department = row.department || null;
  const classCode = row.management_class_source_id || extras.classCode || null;

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    gender: row.gender,
    avatarUrl: row.avatar_url ?? null,
    fullName: row.management_display_name || studentProfile?.fullName || row.full_name || row.username,
    hourlyRate: Number(row.hourly_rate || 0),
    isVip: Boolean(row.is_vip),
    vipExpiresAt: row.vip_expires_at ?? null,
    emailVerified: Boolean(row.email_verified),
    authProvider: row.oauth_provider ?? "local",
    hasPassword: Boolean(row.password_hash),
    isLocked: Boolean(row.is_locked),
    isManagementManaged: Boolean(row.is_management_managed),
    lmsAccountStatus: row.lms_account_status ?? "unmanaged",
    welcomeSeenAt: row.welcome_seen_at ?? null,
    hasSeenWelcome: Boolean(row.welcome_seen_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    studentProfile: studentProfile ? { ...studentProfile, studentCode } : (studentCode ? { studentCode } : null),
    studentCode,
    teacherCode,
    staffCode,
    phone,
    position,
    department,
    classCode,
    enrolledClasses: extras.enrolledClasses || [],
    teachingClasses: extras.teachingClasses || [],
  };
};

export const getUserDtoById = async (userId, db = { query }) => {
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.email, u.role, u.gender, u.avatar_url,
            u.hourly_rate,
            u.welcome_seen_at,
            u.is_vip, u.vip_expires_at, u.email_verified, u.is_locked, u.oauth_provider,
            u.is_management_managed, u.lms_account_status,
            u.password_hash, u.created_at, u.updated_at,
            u.management_display_name,
            u.external_student_id,
            u.management_phone,
            u.management_class_source_id,
            u.management_staff_source_id,
            u.teacher_code,
            u.department,
            u.position,
            sp.student_code,
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

  if (!rows[0]) return null;

  let enrolledClasses = [];
  try {
    const enrollRes = await db.query(
      `SELECT lc.id, lc.title, lc.management_class_source_id AS "classCode", ce.status
       FROM class_enrollments ce
       JOIN live_classes lc ON lc.id = ce.live_class_id
       WHERE ce.user_id = $1
       ORDER BY ce.id DESC`,
      [userId]
    );
    enrolledClasses = enrollRes.rows;
  } catch {
    // Ignore if query fails
  }

  let teachingClasses = [];
  try {
    const teachRes = await db.query(
      `SELECT DISTINCT lc.id, lc.title, lc.management_class_source_id AS "classCode", ct.teaching_role AS "role"
       FROM live_classes lc
       LEFT JOIN class_teachers ct ON ct.live_class_id = lc.id AND ct.teacher_id = $1
       WHERE lc.instructor_id = $1 OR ct.teacher_id = $1
       ORDER BY lc.id DESC`,
      [userId]
    );
    teachingClasses = teachRes.rows;
  } catch {
    // Ignore
  }

  const primaryClassCode = enrolledClasses[0]?.classCode || teachingClasses[0]?.classCode || rows[0].management_class_source_id || null;

  return toUserDto(rows[0], {
    enrolledClasses,
    teachingClasses,
    classCode: primaryClassCode,
  });
};
