export const USER_ROLES = Object.freeze({
  STUDENT: "user",
  TEACHER: "creator",
  ADMIN: "admin",
});

export const LMS_ROLES = Object.freeze([
  USER_ROLES.STUDENT,
  USER_ROLES.TEACHER,
  USER_ROLES.ADMIN,
]);

export const TEACHER_ROLES = Object.freeze([
  USER_ROLES.TEACHER,
  USER_ROLES.ADMIN,
]);

export const isTeacherRole = (role) => TEACHER_ROLES.includes(role);
