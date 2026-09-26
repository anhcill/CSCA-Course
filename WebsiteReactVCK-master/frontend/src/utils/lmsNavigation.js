import { isTeacherRole, USER_ROLES } from "../constants/roles.js";

// The API stores the destination with each notification.  Keep the small
// compatibility list here so old events do not lead a learner to a dead route.
const LEGACY_DESTINATIONS = Object.freeze({
  "/lms/live-classes": "/lms/live-schedule",
  "/lms/my-learning": "/lms/dashboard",
  "/lms/leaderboard": "/rank",
  "/lms/certificates": "/profile",
});

const STUDENT_DESTINATION = /^\/(?:lms\/(?:dashboard|catalog|analytics|live-schedule|assignments(?:\/[^/]+\/submit)?|assignment\/[^/]+\/submit|files|notifications|quiz\/[^/]+|courses\/[^/]+(?:\/classes(?:\/[^/]+(?:\/(?:learn|assignments(?:\/[^/]+\/submit)?|quizzes\/[^/]+|schedule|files|results))?)?)?)|profile|rank)$/;
const TEACHER_DESTINATION = /^\/lms\/(?:teacher-hub|teacher(?:\/|$)|admin\/(?:curriculum|grading)$)/;
const ADMIN_DESTINATION = /^\/admin(?:\/|$)/;

export function getLmsLandingPath(authUser) {
  if (authUser?.role === USER_ROLES.ADMIN) return "/lms/admin/overview";
  if (isTeacherRole(authUser?.role)) return "/lms/teach";
  return "/lms/my-learning";
}

export function resolveLmsDestination(value, authUser) {
  const rawValue = String(value || "").trim();
  if (!rawValue || rawValue === "#") return null;

  if (/^https?:\/\//i.test(rawValue)) return { kind: "external", value: rawValue };
  if (!rawValue.startsWith("/")) return null;

  const [pathname, suffix = ""] = rawValue.split(/([?#].*)/, 2);
  const destination = `${LEGACY_DESTINATIONS[pathname] || pathname}${suffix}`;
  const pathForPermission = destination.split(/[?#]/, 1)[0];
  if (STUDENT_DESTINATION.test(pathForPermission)) return { kind: "internal", value: destination };
  if (TEACHER_DESTINATION.test(pathForPermission) && isTeacherRole(authUser?.role)) return { kind: "internal", value: destination };
  if (ADMIN_DESTINATION.test(pathForPermission) && authUser?.role === USER_ROLES.ADMIN) return { kind: "internal", value: destination };

  return null;
}

export function getLmsWorkspaceLink(authUser) {
  if (authUser?.role === USER_ROLES.ADMIN) return { to: "/admin/dashboard", label: "Về quản trị" };
  if (isTeacherRole(authUser?.role)) return { to: "/lms/teacher-hub", label: "Sang giảng dạy" };
  return null;
}
