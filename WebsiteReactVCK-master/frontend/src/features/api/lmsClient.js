import { publishCalendarChange } from "../calendar/calendarSync";

const API_BASE = "/api";

export class LmsApiError extends Error {
  constructor(message, { status = 0, errorCode = "UNKNOWN_ERROR", details = null } = {}) {
    super(message);
    this.name = "LmsApiError";
    this.status = status;
    this.errorCode = errorCode;
    this.details = details;
  }
}

const parseResponse = async (response) => {
  const rawBody = await response.text();
  let body = null;

  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new LmsApiError("Máy chủ trả về dữ liệu không hợp lệ", {
        status: response.status,
        errorCode: "INVALID_RESPONSE",
      });
    }
  }

  if (!response.ok) {
    const hasStoredSession = typeof window !== "undefined" && Boolean(window.localStorage?.getItem("auth-user"));
    if (response.status === 401 && hasStoredSession && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("csca:session-expired"));
    }

    throw new LmsApiError(body?.message || "Không thể hoàn thành yêu cầu LMS", {
      status: response.status,
      errorCode: body?.errorCode || `HTTP_${response.status}`,
      details: body,
    });
  }

  return body || { success: true, data: null };
};

const request = async (path, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  return parseResponse(response);
};

const requestCalendarMutation = async (path, options, detail) => {
  const response = await request(path, options);
  if (response?.success) publishCalendarChange(detail);
  return response;
};

export const fetchCoursesCatalog = async ({ category, level, search, sort } = {}) => {
  const params = new URLSearchParams();
  if (category && category !== "ALL") params.append("category", category);
  if (level && level !== "ALL") params.append("level", level);
  if (search) params.append("search", search);
  if (sort) params.append("sort", sort);
  const query = params.toString();
  return request(`/courses${query ? `?${query}` : ""}`);
};

export const fetchCourseDetail = async (slug) => request(`/courses/${encodeURIComponent(slug)}`);

export const fetchClassroomDetail = async (courseIdOrSlug) => (
  request(`/courses/${encodeURIComponent(courseIdOrSlug)}/classroom`)
);

export const fetchCourseWorkspace = async (courseId, { classId } = {}) => {
  const params = new URLSearchParams();
  if (classId) params.set("classId", classId);
  return request(`/courses/${encodeURIComponent(courseId)}/workspace${params.size ? `?${params.toString()}` : ""}`);
};

export const checkEnrollmentStatus = async (courseId) => (
  request(`/enrollments/check/${encodeURIComponent(courseId)}`)
);

export const enrollInCourse = async (courseId) => request("/enrollments", {
  method: "POST",
  body: JSON.stringify({ courseId }),
});

export const fetchCourseProgress = async (courseId) => (
  request(`/progress/course/${encodeURIComponent(courseId)}`)
);

export const sendProgressHeartbeat = async ({ lessonId, courseId, lastPositionSeconds, isCompleted }) => (
  request("/progress/heartbeat", {
    method: "POST",
    body: JSON.stringify({ lessonId, courseId, lastPositionSeconds, isCompleted }),
  })
);

// Video Upload & Playback Helpers
export const requestVideoUploadUrl = async ({ filename, mimeType, sizeBytes }) => (
  request("/videos/upload-url", {
    method: "POST",
    body: JSON.stringify({ filename, mimeType, sizeBytes }),
  })
);

export const confirmVideoAsset = async ({ title, r2Key, mimeType, sizeBytes, durationSeconds }) => (
  request("/videos/confirm", {
    method: "POST",
    body: JSON.stringify({ title, r2Key, mimeType, sizeBytes, durationSeconds }),
  })
);

export const fetchVideoPlaybackUrl = async ({ lessonId }) => (
  request(`/videos/playback-url?lessonId=${encodeURIComponent(lessonId)}`)
);

// Teacher/Admin curriculum helpers
export const fetchAdminCourses = async () => request("/courses/admin");

export const fetchAdminCourseDetail = async (courseId) => (
  request(`/courses/admin/${encodeURIComponent(courseId)}`)
);

export const createCourse = async (courseData) => request("/courses/admin", {
  method: "POST",
  body: JSON.stringify(courseData),
});

export const updateCourseStatus = async ({ courseId, isPublished }) => request(
  `/courses/admin/${encodeURIComponent(courseId)}/status`,
  {
    method: "PATCH",
    body: JSON.stringify({ isPublished }),
  },
);

export const createSection = async ({ courseId, title, sortOrder }) => (
  request(`/courses/admin/${encodeURIComponent(courseId)}/sections`, {
    method: "POST",
    body: JSON.stringify({ title, sortOrder }),
  })
);

export const createLesson = async ({ sectionId, courseId, title, videoAssetId, durationSeconds, isPreview, sortOrder }) => (
  request(`/courses/admin/sections/${encodeURIComponent(sectionId)}/lessons`, {
    method: "POST",
    body: JSON.stringify({ courseId, title, videoAssetId, durationSeconds, isPreview, sortOrder }),
  })
);

// Live Classes & Google Meet/Zoom Helpers
export const fetchLiveClasses = async () => request("/live-classes");

export const createLiveClass = async ({ title, courseId, description, maxStudents }) => (
  request("/live-classes", {
    method: "POST",
    body: JSON.stringify({ title, courseId, description, maxStudents }),
  })
);

export const updateLiveClass = async ({ classId, title, description, maxStudents, status }) => (
  request(`/live-classes/${encodeURIComponent(classId)}`, {
    method: "PATCH",
    body: JSON.stringify({ title, description, maxStudents, status }),
  })
);

export const fetchMyLiveSchedule = async ({ courseId, classId, from, to } = {}) => {
  const params = new URLSearchParams();
  if (courseId) params.set("courseId", courseId);
  if (classId) params.set("classId", classId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return request(`/live-classes/my-schedule${params.size ? `?${params.toString()}` : ""}`);
};

export const createLiveSession = async ({ liveClassId, title, startTime, endTime, meetUrl, passcode, status }) => (
  requestCalendarMutation(`/live-classes/${encodeURIComponent(liveClassId)}/sessions`, {
    method: "POST",
    body: JSON.stringify({ title, startTime, endTime, meetUrl, passcode, status }),
  }, { classId: liveClassId, type: "session-created" })
);

export const fetchLiveClassSessions = async (classId) => (
  request(`/live-classes/${encodeURIComponent(classId)}/sessions`)
);

export const updateLiveSession = async ({ sessionId, title, startTime, endTime, meetUrl, passcode, status, changeReason }) => (
  requestCalendarMutation(`/live-classes/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: JSON.stringify({ title, startTime, endTime, meetUrl, passcode, status, changeReason }),
  }, { sessionId, type: "session-updated" })
);

// The teaching link is deliberately separate from timetable edits: class
// teachers can set Zoom/Google Meet for a fixed occurrence without gaining
// permission to alter the admin-owned recurring schedule.
export const updateLiveSessionMeeting = async ({ sessionId, meetUrl, passcode }) => {
  const body = { meetUrl };
  if (passcode !== undefined) body.passcode = passcode;
  return requestCalendarMutation(`/live-classes/sessions/${encodeURIComponent(sessionId)}/meeting-link`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }, { sessionId, type: "session-meeting-link-updated" });
};

export const fetchLiveClassRoster = async (classId) => (
  request(`/live-classes/${encodeURIComponent(classId)}/enrollments`)
);

export const addStudentToLiveClass = async ({ classId, userId }) => (
  request(`/live-classes/${encodeURIComponent(classId)}/enrollments`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  })
);

export const removeStudentFromLiveClass = async ({ classId, userId }) => (
  request(`/live-classes/${encodeURIComponent(classId)}/enrollments/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  })
);

export const joinLiveClass = async (classId) => (
  request(`/live-classes/${encodeURIComponent(classId)}/join`, { method: "POST" })
);

export const fetchLiveClassSchedules = async (classId) => (
  request(`/live-classes/${encodeURIComponent(classId)}/schedules`)
);

export const createLiveClassSchedule = async ({
  classId, dayOfWeek, startTime, endTime, title, timezone, startDate, endDate,
}) => (
  requestCalendarMutation(`/live-classes/${encodeURIComponent(classId)}/schedules`, {
    method: "POST",
    body: JSON.stringify({ dayOfWeek, startTime, endTime, title, timezone, startDate, endDate }),
  }, { classId, type: "schedule-created" })
);

export const updateLiveClassSchedule = async ({
  classId, scheduleId, dayOfWeek, startTime, endTime, title, timezone,
  startDate, endDate, version, changeReason,
}) => (
  requestCalendarMutation(`/live-classes/${encodeURIComponent(classId)}/schedules/${encodeURIComponent(scheduleId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      dayOfWeek, startTime, endTime, title, timezone, startDate, endDate, version, changeReason,
    }),
  }, { classId, scheduleId, type: "schedule-updated" })
);

export const deleteLiveClassSchedule = async ({ classId, scheduleId, changeReason }) => (
  requestCalendarMutation(`/live-classes/${encodeURIComponent(classId)}/schedules/${encodeURIComponent(scheduleId)}`, {
    method: "DELETE",
    ...(changeReason === undefined ? {} : { body: JSON.stringify({ changeReason }) }),
  }, { classId, scheduleId, type: "schedule-deleted" })
);

export const getLiveSessionAccess = async (sessionId) => (
  request(`/live-classes/sessions/${encodeURIComponent(sessionId)}/access`)
);

// Attendance Helpers
export const markAttendance = async ({ sessionId, attendanceList }) => (
  request("/attendance/check", {
    method: "POST",
    body: JSON.stringify({ sessionId, attendanceList }),
  })
);

export const fetchAttendanceRoster = async (sessionId) => (
  request(`/attendance/session/${encodeURIComponent(sessionId)}`)
);

// Assignment & Quiz Helpers
export const fetchAssignments = async ({ courseId, classId } = {}) => {
  const params = new URLSearchParams();
  if (courseId) params.set("courseId", courseId);
  if (classId) params.set("classId", classId);
  return request(`/assignments${params.size ? `?${params.toString()}` : ""}`);
};

export const createAssignment = async ({ title, description, liveClassId, assignmentType, maxScore, dueDate }) => request("/assignments", {
  method: "POST",
  body: JSON.stringify({ title, description, liveClassId, assignmentType, maxScore, dueDate }),
});

export const fetchAssignmentDetail = async (assignmentId) => (
  request(`/assignments/${encodeURIComponent(assignmentId)}`)
);

export const requestSubmissionUploadUrl = async ({ filename, mimeType, sizeBytes, assetKind }) => (
  request("/assignments/submission-assets/upload-url", {
    method: "POST",
    body: JSON.stringify({ filename, mimeType, sizeBytes, assetKind }),
  })
);

export const confirmSubmissionAsset = async ({ assetId, mimeType, sizeBytes }) => (
  request(`/assignments/submission-assets/${encodeURIComponent(assetId)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ mimeType, sizeBytes }),
  })
);

export const submitAssignment = async ({ assignmentId, contentText, fileAssetId, audioAssetId }) => (
  request(`/assignments/${encodeURIComponent(assignmentId)}/submit`, {
    method: "POST",
    body: JSON.stringify({ contentText, fileAssetId, audioAssetId }),
  })
);

export const fetchSubmissions = async (assignmentId = "all") => (
  request(`/assignments/${encodeURIComponent(assignmentId)}/submissions`)
);

export const gradeSubmission = async ({ submissionId, score, feedbackText }) => (
  request(`/assignments/submissions/${encodeURIComponent(submissionId)}/grade`, {
    method: "POST",
    body: JSON.stringify({ score, feedbackText }),
  })
);

export const fetchQuiz = async (quizId) => (
  request(`/assignments/quizzes/${encodeURIComponent(quizId)}`)
);

export const submitQuiz = async ({ quizId, answers }) => (
  request(`/assignments/quizzes/${encodeURIComponent(quizId)}/submit`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  })
);

export const fetchTeacherQuizzes = async () => request("/assignments/teacher/quizzes");

export const createTeacherQuiz = async (quiz) => request("/assignments/teacher/quizzes", {
  method: "POST",
  body: JSON.stringify(quiz),
});

export const deleteTeacherQuiz = async (quizId) => request(
  `/assignments/teacher/quizzes/${encodeURIComponent(quizId)}`,
  { method: "DELETE" },
);

// My Learning - enrolled courses
export const fetchMyEnrolledCourses = async () => request("/enrollments/my-courses");

// Notes API
export const fetchLessonNotes = async (lessonId) => (
  request(`/progress/notes/${encodeURIComponent(lessonId)}`)
);

export const createLessonNote = async ({ lessonId, content, timestampSeconds }) => (
  request("/progress/notes", {
    method: "POST",
    body: JSON.stringify({ lessonId, content, timestampSeconds }),
  })
);

export const deleteLessonNote = async (noteId) => (
  request(`/progress/notes/${encodeURIComponent(noteId)}`, { method: "DELETE" })
);

// Comments API
export const fetchLessonComments = async (lessonId) => (
  request(`/courses/lessons/${encodeURIComponent(lessonId)}/comments`)
);

export const postLessonComment = async ({ lessonId, content, parentId }) => (
  request(`/courses/lessons/${encodeURIComponent(lessonId)}/comments`, {
    method: "POST",
    body: JSON.stringify({ content, parentId }),
  })
);

// Ratings API
export const fetchCourseRatings = async (courseId) => (
  request(`/courses/${encodeURIComponent(courseId)}/ratings`)
);

export const submitCourseRating = async ({ courseId, score, review }) => (
  request(`/courses/${encodeURIComponent(courseId)}/ratings`, {
    method: "POST",
    body: JSON.stringify({ score, review }),
  })
);

// Teacher Dashboard & Class Detail API helpers
export const fetchTeacherDashboardStats = async ({ classId, status, page, limit } = {}) => {
  const params = new URLSearchParams();
  if (classId) params.set("classId", classId);
  if (status && status !== "all") params.set("status", status);
  if (page) params.set("page", page);
  if (limit) params.set("limit", limit);
  const queryString = params.toString();
  return request(`/teacher/dashboard-stats${queryString ? `?${queryString}` : ""}`);
};

export const fetchClassDetails = async (classId) => (
  request(`/teacher/classes/${encodeURIComponent(classId)}/detail`)
);

// Admin Console API helpers
export const fetchAdminDashboardKpi = async () => request("/admin/kpi-summary");

export const toggleUserLockStatus = async (userId, isLocked) => (
  request(`/admin/users/${encodeURIComponent(userId)}/lock`, {
    method: "PATCH",
    body: JSON.stringify({ isLocked }),
  })
);

// Day 8: Notifications, Gamification & Certificates API helpers
export const fetchNotifications = async ({ page, limit, unreadOnly, category, type } = {}) => {
  const params = new URLSearchParams();
  if (page) params.set("page", page);
  if (limit) params.set("limit", limit);
  if (unreadOnly) params.set("unreadOnly", "true");
  if (category && category !== "all") params.set("category", category);
  if (type) params.set("type", type);
  const query = params.toString();
  return request(`/notifications${query ? `?${query}` : ""}`);
};

export const fetchUnreadNotificationsCount = async () => (
  request("/notifications/unread-count")
);

export const markNotificationAsRead = async (notificationId) => (
  request(`/notifications/${encodeURIComponent(notificationId)}/read`, { method: "PATCH" })
);

export const markAllNotificationsAsRead = async () => (
  request("/notifications/read-all", { method: "POST" })
);

export const fetchSessionChangeHistory = async (sessionId) => (
  request(`/live-classes/sessions/${encodeURIComponent(sessionId)}/history`)
);

export const fetchAdminCalendar = async ({ from, to, courseId, classId, teacherId, status } = {}) => {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (courseId) params.set("courseId", courseId);
  if (classId) params.set("classId", classId);
  if (teacherId) params.set("teacherId", teacherId);
  if (status) params.set("status", status);
  const query = params.toString();
  return request(`/admin/calendar${query ? `?${query}` : ""}`);
};

export const fetchAdminSessionHistory = async (sessionId) => (
  request(`/admin/calendar/sessions/${encodeURIComponent(sessionId)}/history`)
);

export const fetchLeaderboard = async ({ scope = "class", period = "week", classId } = {}) => {
  const params = new URLSearchParams();
  if (scope) params.set("scope", scope);
  if (period) params.set("period", period);
  if (classId) params.set("classId", classId);
  const query = params.toString();
  return request(`/leaderboard${query ? `?${query}` : ""}`);
};

export const fetchStudentGamificationStats = async () => (
  request("/gamification/my-stats")
);

export const fetchMyCertificates = async () => (
  request("/certificates/my-certificates")
);

export const verifyCertificate = async (code) => (
  request(`/certificates/verify/${encodeURIComponent(code)}`)
);

// ============================================================================
// DAY 1 - DAY 3: LMS & MANAGEMENT INTEGRATION API CLIENTS
// ============================================================================

// Admin Sync & Outbox Delivery Queue
export const fetchAdminSyncOverview = async () => {
  return request("/v1/application-orchestration/overview");
};

export const fetchAdminDeliveryQueue = async ({ status = "ALL", page = 1, limit = 20 } = {}) => {
  const params = new URLSearchParams({ status, page, limit });
  return request(`/v1/application-orchestration/delivery-queue?${params.toString()}`);
};

export const retryDeliveryQueueItem = async (queueId) => {
  return request(`/v1/application-orchestration/delivery-queue/${encodeURIComponent(queueId)}/retry`, {
    method: "POST",
  });
};

// Admin Permissions Matrix
export const fetchAdminPermissions = async () => {
  return request("/v1/admin/permissions");
};

export const updateAdminPermission = async (permissionId, updateData) => {
  return request(`/v1/admin/permissions/${encodeURIComponent(permissionId)}`, {
    method: "PATCH",
    body: JSON.stringify(updateData),
  });
};

// Admin Classes with Moly Bridge Mapping
export const fetchAdminClasses = async () => {
  return request("/v1/admin/classes");
};

export const updateAdminClassMapping = async (classId, mapping) => request(
  `/v1/admin/classes/${encodeURIComponent(classId)}/mapping`,
  { method: "PATCH", body: JSON.stringify(mapping) },
);

// Admin Audit Logs
export const fetchAdminAuditLogs = async ({ page = 1, limit = 20, action = "ALL" } = {}) => {
  const params = new URLSearchParams({ page, limit, action });
  return request(`/v1/admin/audit-logs?${params.toString()}`);
};

// Teacher & Student Files
export const fetchClassFiles = async (classId) => {
  return request(`/teacher/classes/${encodeURIComponent(classId)}/files`);
};

export const fetchStudentFiles = async ({ courseId, classId } = {}) => {
  const params = new URLSearchParams();
  if (courseId) params.set("courseId", courseId);
  if (classId) params.set("classId", classId);
  return request(`/student/files${params.size ? `?${params.toString()}` : ""}`);
};

export const uploadClassFile = async (classId, file, { visibility = "CLASS_ONLY" } = {}) => {
  const uploadResponse = await request(`/teacher/classes/${encodeURIComponent(classId)}/files/upload-url`, {
    method: "POST",
    body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size, visibility }),
  });
  const upload = uploadResponse?.data;
  if (!upload?.uploadUrl || !upload?.fileId) throw new LmsApiError("Máy chủ không trả về upload target");
  const putResponse = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: upload.headers || { "Content-Type": file.type },
    body: file,
  });
  if (!putResponse.ok) throw new LmsApiError("Upload tài liệu lên R2 thất bại", { status: putResponse.status });
  return request(`/teacher/files/${encodeURIComponent(upload.fileId)}/confirm`, { method: "POST" });
};

export const deleteClassFile = async (fileId) => request(`/teacher/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
