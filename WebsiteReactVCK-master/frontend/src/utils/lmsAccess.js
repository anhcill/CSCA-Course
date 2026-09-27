import { USER_ROLES, isTeacherRole } from "../constants/roles.js";

/**
 * The public website is intentionally available to every account.  The
 * private learner LMS is different: it is opened only after Management has
 * provisioned the learner and synchronized an active learning entitlement.
 */
export const hasStudentLmsAccess = (user) => Boolean(
  user
  && user.role === USER_ROLES.STUDENT
  && user.isManagementManaged
  && user.lmsAccountStatus === "active",
);

export const hasTeacherLmsAccess = (user) => Boolean(user && isTeacherRole(user.role));
