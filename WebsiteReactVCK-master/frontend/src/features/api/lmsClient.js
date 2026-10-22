import { publishCalendarChange } from "../calendar/calendarSync.js";

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
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !isFormData && !headers.has("Content-Type")) {
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

export const fetchAttendanceReviewQueue = (filters) => request(`/attendance/amendments?${new URLSearchParams(filters)}`);
export const fetchAdminAttendanceReport = (filters = {}) => {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  return request(`/admin/attendance-report${query.size ? `?${query}` : ""}`);
};
export const fetchFinalizedAttendanceSheets = (filters) => request(`/attendance/finalized-sheets?${new URLSearchParams(filters)}`);
export const fetchFinalizedAttendanceSheet = (sessionId) => request(`/attendance/finalized-sheets/${encodeURIComponent(sessionId)}`);
export const reviewFinalizedAttendanceSheet = (sessionId, reviewNote) => request(
  `/attendance/finalized-sheets/${encodeURIComponent(sessionId)}/review`,
  { method: "POST", body: JSON.stringify({ reviewNote }) },
);
export const revokeAccommodation = (id, reason) => request(`/assignments/teacher/accommodations/${id}/revoke`, { method: "POST", body: JSON.stringify({ reason }) });
export const fetchGradebook = (classId, sessionId) => request(`/reports/gradebook?${new URLSearchParams({ classId, sessionId: sessionId || "all" })}`);
export const reportGradebookToAdmin = (classId, notes = "") => request("/reports/gradebook/report-to-admin", { method: "POST", body: JSON.stringify({ classId, notes }) });
export const fetchAdminGradebookSummary = (filters = {}) => {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ""));
  return request(`/admin/gradebook/summary${query.size ? `?${query.toString()}` : ""}`);
};
export const adminGradebookExportUrl = ({ format = "xlsx", classId = null, from = null, to = null } = {}) => {
  const params = new URLSearchParams();
  if (format) params.set("format", format);
  if (classId) params.set("classId", String(classId));
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return `${API_BASE}/admin/gradebook/export?${params.toString()}`;
};
export const fetchMyFinalGrade = (classId) => request(`/reports/gradebook/my-result?classId=${encodeURIComponent(classId)}`);
export const fetchStudentAnalytics = () => request("/reports/student-analytics");
export const saveGradebookPolicy = (classId, policy) => request("/reports/gradebook/policy", { method: "PUT", body: JSON.stringify({ classId, policy }) });
export const finalizeGradebook = (classId) => request("/reports/gradebook/finalize", { method: "POST", body: JSON.stringify({ classId }) });
export const reopenGradebook = (classId, reason) => request("/reports/gradebook/reopen", { method: "POST", body: JSON.stringify({ classId, reason }) });
export const fetchSubmissionHistory = (id) => request(`/assignments/submissions/${id}/history`);
export const saveGradingDraft = (id, payload) => request(`/assignments/submissions/${id}/draft`, { method: "PUT", body: JSON.stringify(payload) });
export const returnSubmission = (id, payload) => request(`/assignments/submissions/${id}/return`, { method: "POST", body: JSON.stringify(payload) });
export const updateQuestionBankItem = (id, payload) => request(`/assignments/teacher/question-bank/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const sampleQuestionBank = (payload) => request("/assignments/teacher/question-bank/sample", { method: "POST", body: JSON.stringify(payload) });
export const fetchSupportCases = (classId) => request(`/support-cases?classId=${encodeURIComponent(classId)}`);
export const saveSupportCase = (id, payload) => request(`/support-cases${id ? "/" + id : ""}`, { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });

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

export const createLesson = async ({ sectionId, courseId, title, videoAssetId, durationSeconds, isPreview, sortOrder, learningUrl }) => (
  request(`/courses/admin/sections/${encodeURIComponent(sectionId)}/lessons`, {
    method: "POST",
    body: JSON.stringify({ courseId, title, videoAssetId, durationSeconds, isPreview, sortOrder, learningUrl }),
  })
);

export const updateLessonLearningLink = async ({ lessonId, learningUrl }) => request(
  `/courses/admin/lessons/${encodeURIComponent(lessonId)}/learning-link`,
  {
    method: "PATCH",
    body: JSON.stringify({ learningUrl }),
  },
);

// Admin console course lifecycle helpers. These use the admin-only endpoints
// so every mutation is audited by the server.
export const createAdminCourse = async (courseData) => request("/admin/courses", {
  method: "POST",
  body: JSON.stringify(courseData),
});

export const updateAdminCourse = async ({ courseId, courseData }) => request(
  `/admin/courses/${encodeURIComponent(courseId)}`,
  {
    method: "PATCH",
    body: JSON.stringify(courseData),
  },
);

export const deleteAdminCourse = async (courseId) => request(
  `/admin/courses/${encodeURIComponent(courseId)}`,
  { method: "DELETE" },
);

export const fetchAdminConsoleCourses = async () => request("/admin/courses?limit=100");

export const fetchAdminConsoleCurriculum = async (courseId) => request(
  `/admin/courses/${encodeURIComponent(courseId)}/curriculum`,
);

export const fetchAdminSessionCurriculum = async (courseId) => request(
  `/admin/courses/${encodeURIComponent(courseId)}/session-curriculum`,
);

export const updateAdminSessionCurriculum = async ({ sessionId, sectionId, lessonId }) => request(
  `/admin/class-sessions/${encodeURIComponent(sessionId)}/curriculum`,
  {
    method: "PATCH",
    body: JSON.stringify({ sectionId: sectionId || null, lessonId: lessonId || null }),
  },
);

export const updateClassTeacherCurriculumPermission = async ({ classId, teacherId, allowed }) => request(
  `/admin/classes/${encodeURIComponent(classId)}/teachers/${encodeURIComponent(teacherId)}/curriculum-permission`,
  {
    method: "PATCH",
    body: JSON.stringify({ allowed: Boolean(allowed) }),
  },
);

export const createAdminSection = async ({ courseId, title, sortOrder }) => request(
  `/admin/courses/${encodeURIComponent(courseId)}/sections`,
  {
    method: "POST",
    body: JSON.stringify({ title, sortOrder }),
  },
);

export const updateAdminSection = async ({ sectionId, sectionData }) => request(
  `/admin/sections/${encodeURIComponent(sectionId)}`,
  {
    method: "PATCH",
    body: JSON.stringify(sectionData),
  },
);

export const deleteAdminSection = async (sectionId) => request(
  `/admin/sections/${encodeURIComponent(sectionId)}`,
  { method: "DELETE" },
);

export const createAdminLesson = async ({ sectionId, title, learningUrl, durationSeconds, isPreview, sortOrder }) => request(
  `/admin/sections/${encodeURIComponent(sectionId)}/lessons`,
  {
    method: "POST",
    body: JSON.stringify({ title, learningUrl, durationSeconds, isPreview, sortOrder, isPublished: true }),
  },
);

export const updateAdminLesson = async ({ lessonId, lessonData }) => request(
  `/admin/lessons/${encodeURIComponent(lessonId)}`,
  {
    method: "PATCH",
    body: JSON.stringify(lessonData),
  },
);

export const deleteAdminLesson = async (lessonId) => request(
  `/admin/lessons/${encodeURIComponent(lessonId)}`,
  { method: "DELETE" },
);

// Live classes and online meeting helpers
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

export const fetchClassChapters = async (classId) => (
  request(`/live-classes/${encodeURIComponent(classId)}/chapters`)
);

export const createClassChapter = async ({ classId, title, description, objectives, position, teacherId }) => (
  request(`/live-classes/${encodeURIComponent(classId)}/chapters`, {
    method: "POST",
    body: JSON.stringify({ title, description, objectives, position, teacherId }),
  })
);

export const updateClassChapter = async ({ classId, chapterId, title, description, objectives, position, teacherId }) => (
  request(`/live-classes/${encodeURIComponent(classId)}/chapters/${encodeURIComponent(chapterId)}`, {
    method: "PATCH",
    body: JSON.stringify({ title, description, objectives, position, teacherId }),
  })
);

export const assignClassSessionChapter = async ({ sessionId, chapterId, expectedVersion }) => (
  request(`/live-classes/sessions/${encodeURIComponent(sessionId)}/chapter`, {
    method: "PATCH",
    body: JSON.stringify({ chapterId, expectedVersion }),
  })
);

export const fetchMyLiveSchedule = async ({ courseId, classId, from, to } = {}) => {
  const params = new URLSearchParams();
  if (courseId) params.set("courseId", courseId);
  if (classId) params.set("classId", classId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return request(`/live-classes/my-schedule${params.size ? `?${params.toString()}` : ""}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
};

export const createLiveSession = async ({ liveClassId, title, startTime, endTime, meetUrl, passcode, status, chapterId, newChapter }) => (
  requestCalendarMutation(`/live-classes/${encodeURIComponent(liveClassId)}/sessions`, {
    method: "POST",
    body: JSON.stringify({ title, startTime, endTime, meetUrl, passcode, status, chapterId, newChapter }),
  }, { classId: liveClassId, type: "session-created" })
);

export const fetchLiveClassSessions = async (classId) => (
  request(`/live-classes/${encodeURIComponent(classId)}/sessions`)
);

export const updateLiveSession = async ({ sessionId, title, startTime, endTime, meetUrl, passcode, status, chapterId, changeReason, expectedVersion }) => (
  requestCalendarMutation(`/live-classes/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: JSON.stringify({ title, startTime, endTime, meetUrl, passcode, status, chapterId, changeReason, expectedVersion }),
  }, { sessionId, type: "session-updated" })
);

// The teaching link is deliberately separate from timetable edits: class
// teachers can set the meeting room for a fixed occurrence without gaining
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

export const fetchClassAnnouncements = async ({ classId, sessionId } = {}) => {
  const params = new URLSearchParams();
  if (classId) params.set("classId", classId);
  if (sessionId) params.set("sessionId", sessionId);
  return request(`/announcements?${params.toString()}`);
};

export const createClassAnnouncement = async ({ classId, sessionId, title, message, linkUrl, attachmentUrl, scheduledAt }) => request("/announcements", {
  method: "POST",
  body: JSON.stringify({ classId, sessionId, title, message, linkUrl, attachmentUrl, scheduledAt }),
});

export const cancelClassAnnouncement = async (announcementId) => request(`/announcements/${encodeURIComponent(announcementId)}/cancel`, { method: "PATCH" });

// Attendance Helpers
export const fetchMySessionCheckIn = (sessionId) => (
  request(`/attendance/session/${encodeURIComponent(sessionId)}/my-check-in`)
);

export const checkInToSession = (sessionId) => (
  request(`/attendance/session/${encodeURIComponent(sessionId)}/my-check-in`, { method: "POST" })
);

export const markAttendance = async ({ sessionId, attendanceList }) => (
  request("/attendance/check", {
    method: "POST",
    body: JSON.stringify({ sessionId, attendanceList }),
  })
);

export const fetchAttendanceRoster = async (sessionId) => (
  request(`/attendance/session/${encodeURIComponent(sessionId)}`)
);

export const fetchAttendanceAmendments = async (sessionId) => (
  request(`/attendance/session/${encodeURIComponent(sessionId)}/amendments`)
);

export const createAttendanceAmendment = async ({ sessionId, userId, requestedStatus, requestedNote, reason }) => (
  request("/attendance/amendments", {
    method: "POST",
    body: JSON.stringify({ sessionId, userId, requestedStatus, requestedNote, reason }),
  })
);

export const reviewAttendanceAmendment = async ({ amendmentId, decision, reviewNote }) => (
  request(`/attendance/amendments/${encodeURIComponent(amendmentId)}/review`, {
    method: "POST",
    body: JSON.stringify({ decision, reviewNote }),
  })
);

export const gradebookExportUrl = ({ classId, courseId, sessionId, format = "xlsx" }) => {
  const params = new URLSearchParams({ classId: String(classId), format });
  if (courseId) params.set("courseId", String(courseId));
  if (sessionId && sessionId !== "all") params.set("sessionId", String(sessionId));
  return `${API_BASE}/reports/gradebook/export?${params.toString()}`;
};

// Assignment & Quiz Helpers
export const fetchAssignments = async ({ courseId, classId, sessionId } = {}) => {
  const params = new URLSearchParams();
  if (courseId) params.set("courseId", courseId);
  if (classId) params.set("classId", classId);
  if (sessionId) params.set("sessionId", sessionId);
  return request(`/assignments${params.size ? `?${params.toString()}` : ""}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
};

export const createAssignment = async ({
  title,
  description,
  courseId,
  liveClassId,
  classSessionId,
  classId,
  sessionId,
  assignmentType,
  maxScore,
  dueDate,
  attachmentUrl,
  rubric,
}) => request("/assignments", {
  method: "POST",
  body: JSON.stringify({
    title,
    description,
    courseId,
    liveClassId: liveClassId ?? classId,
    classSessionId: classSessionId ?? sessionId,
    assignmentType,
    maxScore,
    dueDate,
    attachmentUrl,
    rubric,
  }),
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

export const submitAssignment = async ({ assignmentId, contentText, fileAssetId, fileAssetIds, audioAssetId }) => (
  request(`/assignments/${encodeURIComponent(assignmentId)}/submit`, {
    method: "POST",
    body: JSON.stringify({
      contentText,
      fileAssetId: fileAssetId || null,
      fileAssetIds: Array.isArray(fileAssetIds) ? fileAssetIds : (fileAssetId ? [fileAssetId] : []),
      audioAssetId: audioAssetId || null,
    }),
  })
);

export const fetchSubmissions = async (assignmentId = "all", { classId, sessionId } = {}) => {
  const params = new URLSearchParams();
  if (classId) params.set("classId", classId);
  if (sessionId) params.set("sessionId", sessionId);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request(`/assignments/${encodeURIComponent(assignmentId)}/submissions${suffix}`);
};

export const gradeSubmission = async ({ submissionId, score, feedbackText, rubricScores, revision, annotations, changeReason }) => (
  request(`/assignments/submissions/${encodeURIComponent(submissionId)}/grade`, {
    method: "POST",
    body: JSON.stringify({ score, feedbackText, rubricScores, revision, annotations, changeReason }),
  })
);

export const fetchQuiz = async (quizId) => (
  request(`/assignments/quizzes/${encodeURIComponent(quizId)}`)
);

export const fetchStudentQuizStart = async (quizId, { attemptId, newAttempt = false } = {}) => {
  const params = new URLSearchParams();
  if (attemptId) params.set("attemptId", attemptId);
  if (newAttempt) params.set("newAttempt", "1");
  const query = params.size ? `?${params.toString()}` : "";
  return request(`/assignments/quizzes/${encodeURIComponent(quizId)}/start${query}`);
};

export const saveQuizAttemptAnswer = async (attemptId, payload) => request(
  `/assignments/attempts/${encodeURIComponent(attemptId)}/answers`,
  {
    method: "PUT",
    body: JSON.stringify(payload),
  },
);

export const submitQuizAttempt = async (attemptId, payload) => request(
  `/assignments/attempts/${encodeURIComponent(attemptId)}/submit`,
  {
    method: "POST",
    body: JSON.stringify(payload),
  },
);

export const fetchStudentQuizResult = async (quizId, attemptId) => (
  request(`/assignments/quizzes/${encodeURIComponent(quizId)}/attempts/${encodeURIComponent(attemptId)}/result`)
);

export const saveQuizAnswers = async ({ quizId, answers }) => (
  request(`/assignments/quizzes/${encodeURIComponent(quizId)}/answers`, {
    method: "PUT",
    body: JSON.stringify({ answers }),
  })
);

export const submitQuiz = async ({ quizId, answers }) => (
  request(`/assignments/quizzes/${encodeURIComponent(quizId)}/submit`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  })
);

export const fetchTeacherQuizzes = async () => request("/assignments/teacher/quizzes");

export const fetchTeacherQuizTargets = async (courseId) => request(
  `/assignments/teacher/quiz-targets?courseId=${encodeURIComponent(courseId)}`,
  { cache: "no-store", headers: { "Cache-Control": "no-cache" } },
);

export const createTeacherQuiz = async (quiz) => request("/assignments/teacher/quizzes", {
  method: "POST",
  body: JSON.stringify(quiz),
});

export const fetchTeacherQuizEditor = async (quizId) => (
  request(`/assignments/teacher/quizzes/${encodeURIComponent(quizId)}/editor`)
);

export const updateTeacherQuiz = async (quizId, quiz) => request(
  `/assignments/teacher/quizzes/${encodeURIComponent(quizId)}`,
  {
    method: "PUT",
    body: JSON.stringify(quiz),
  },
);

export const updateTeacherQuizItems = async (quizId, items) => request(
  `/assignments/teacher/quizzes/${encodeURIComponent(quizId)}/items`,
  {
    method: "PUT",
    body: JSON.stringify({ items }),
  },
);

export const publishTeacherQuiz = async (quizId) => request(
  `/assignments/teacher/quizzes/${encodeURIComponent(quizId)}/publish`,
  { method: "POST" },
);

export const archiveTeacherQuiz = async (quizId) => request(
  `/assignments/teacher/quizzes/${encodeURIComponent(quizId)}/archive`,
  { method: "POST" },
);

export const ocrQuizImage = async (formData) => request(
  "/assignments/teacher/quiz-ocr/image",
  {
    method: "POST",
    body: formData,
  },
);

export const previewQuizImport = async (formData) => request(
  "/assignments/teacher/quiz-import/preview",
  {
    method: "POST",
    body: formData,
  },
);

export const deleteTeacherQuiz = async (quizId) => request(
  `/assignments/teacher/quizzes/${encodeURIComponent(quizId)}`,
  { method: "DELETE" },
);

export const fetchTeacherQuizReport = async (quizId) => (
  request(`/assignments/teacher/quizzes/${encodeURIComponent(quizId)}/report`)
);

export const fetchTeacherQuizAttempt = async (quizId, attemptId) => (
  request(`/assignments/teacher/quizzes/${encodeURIComponent(quizId)}/attempts/${encodeURIComponent(attemptId)}`)
);

export const gradeTeacherQuizEssay = async (
  quizId,
  attemptId,
  { essayScore, essayFeedback, gradesByQuestion, teacherAttachments },
) => (
  request(`/assignments/teacher/quizzes/${encodeURIComponent(quizId)}/attempts/${encodeURIComponent(attemptId)}/grade-essay`, {
    method: "POST",
    body: JSON.stringify({ essayScore, essayFeedback, gradesByQuestion, teacherAttachments }),
  })
);

export const fetchQuestionBank = async ({ courseId, search, difficulty, page } = {}) => {
  const params = new URLSearchParams({ courseId: String(courseId || "") });
  if (search) params.set("search", search);
  if (difficulty) params.set("difficulty", difficulty);
  if (page) params.set("page", page);
  return request(`/assignments/teacher/question-bank?${params.toString()}`);
};

export const createQuestionBankItem = async (payload) => request(
  "/assignments/teacher/question-bank",
  { method: "POST", body: JSON.stringify(payload) },
);

export const deleteQuestionBankItem = async (itemId) => request(
  `/assignments/teacher/question-bank/${encodeURIComponent(itemId)}`,
  { method: "DELETE" },
);

export const fetchAssessmentAccommodations = async ({ assessmentType, assessmentId }) => {
  const params = new URLSearchParams({ assessmentType, assessmentId: String(assessmentId) });
  return request(`/assignments/teacher/accommodations?${params.toString()}`);
};

export const saveAssessmentAccommodation = async (payload) => request(
  "/assignments/teacher/accommodations",
  { method: "PUT", body: JSON.stringify(payload) },
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

export const fetchClassStudentProgress = async (classId) => (
  request(`/teacher/classes/${encodeURIComponent(classId)}/student-progress`)
);

export const updateGradebookScore = async ({ classId, studentId, activityId, score, reason, feedbackText }) => (
  request(`/teacher/classes/${encodeURIComponent(classId)}/grades`, {
    method: "PUT",
    body: JSON.stringify({ studentId, activityId, score, reason, feedbackText }),
  })
);

// Admin Console API helpers
export const fetchAdminDashboardKpi = async () => request("/admin/kpi-summary");

export const fetchMyLmsPermissions = async () => request("/auth/me/lms-permissions");

export const fetchAdminUsers = async ({ page = 1, limit = 8, search = "", role = "all", status = "all", signal } = {}) => {
  const params = new URLSearchParams({ page, limit });
  if (search.trim()) params.set("search", search.trim());
  if (role !== "all") params.set("role", role);
  if (status !== "all") params.set("status", status);
  return request(`/admin/users?${params.toString()}`, { signal });
};

export const createAdminUser = async (userData) => request("/admin/users", {
  method: "POST",
  body: JSON.stringify(userData),
});

export const updateAdminUser = async (userId, userData) => request(
  `/admin/users/${encodeURIComponent(userId)}`,
  { method: "PATCH", body: JSON.stringify(userData) },
);

export const deleteAdminUser = async (userId) => request(
  `/admin/users/${encodeURIComponent(userId)}`,
  { method: "DELETE" },
);

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

export const markNotificationAsUnread = async (notificationId) => (
  request(`/notifications/${encodeURIComponent(notificationId)}/unread`, { method: "PATCH" })
);

export const deleteNotification = async (notificationId) => (
  request(`/notifications/${encodeURIComponent(notificationId)}`, { method: "DELETE" })
);

export const markAllNotificationsAsRead = async () => (
  request("/notifications/read-all", { method: "POST" })
);

export const fetchNotificationPreferences = async () => (
  request("/notifications/preferences")
);

export const updateNotificationPreferences = async (preferences) => (
  request("/notifications/preferences", {
    method: "PATCH",
    body: JSON.stringify(preferences),
  })
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

export const fetchLeaderboard = async ({ scope = "class", period = "week", classId, page, limit } = {}) => {
  const params = new URLSearchParams();
  if (scope) params.set("scope", scope);
  if (period) params.set("period", period);
  if (classId) params.set("classId", classId);
  if (page) params.set("page", page);
  if (limit) params.set("limit", limit);
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

export const fetchAdminDeliveryQueue = async ({ status = "ALL", page = 1, limit = 20, search = "" } = {}) => {
  const params = new URLSearchParams({ status, page, limit });
  if (search.trim()) params.set("q", search.trim());
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

export const updateAdminClassFileDownloadPolicy = async (classId, allowFileDownload) => request(
  `/v1/admin/classes/${encodeURIComponent(classId)}/file-download-policy`,
  { method: "PATCH", body: JSON.stringify({ allowFileDownload }) },
);

export const updateAdminClassPresentation = async (classId, presentation) => request(
  `/v1/admin/classes/${encodeURIComponent(classId)}/presentation`,
  { method: "PATCH", body: JSON.stringify(presentation) },
);

export const updateAdminClassTeacher = async (classId, teacherId) => request(
  `/v1/admin/classes/${encodeURIComponent(classId)}/teacher`,
  { method: "PATCH", body: JSON.stringify({ teacherId: teacherId || null }) },
);

export const reviewAdminClass = (classId, decision) => request(
  `/v1/admin/classes/${encodeURIComponent(classId)}/approval`,
  { method: "POST", body: JSON.stringify({ decision }) },
);

export const fetchPendingMembershipApprovals = () => request("/v1/admin/membership-approvals");

export const reviewAdminMembership = (membershipId, decision) => request(
  `/v1/admin/membership-approvals/${encodeURIComponent(membershipId)}`,
  { method: "POST", body: JSON.stringify({ decision }) },
);

// Admin Audit Logs
export const fetchAdminAuditLogs = async ({ page = 1, limit = 20, action = "ALL", search = "" } = {}) => {
  const params = new URLSearchParams({ page, limit, action });
  if (search.trim()) params.set("search", search.trim());
  return request(`/v1/admin/audit-logs?${params.toString()}`);
};

// Teacher & Student Files
export const fetchTeacherFiles = async ({ courseId, classId, sessionId, date, search } = {}) => {
  const params = new URLSearchParams();
  if (courseId) params.set("courseId", courseId);
  if (classId) params.set("classId", classId);
  if (sessionId) params.set("sessionId", sessionId);
  if (date) params.set("date", date);
  if (search) params.set("search", search);
  return request(`/teacher/files${params.size ? `?${params.toString()}` : ""}`);
};

export const fetchTeacherClassesLookup = async () => request("/teacher/classes-lookup");
export const fetchStudentClassesLookup = async () => request("/student/classes-lookup");

export const fetchClassFiles = async (classId, { sessionId } = {}) => {
  const params = new URLSearchParams();
  if (sessionId) params.set("sessionId", sessionId);
  return request(`/teacher/classes/${encodeURIComponent(classId)}/files${params.size ? `?${params.toString()}` : ""}`);
};

export const fetchReusableTeacherFiles = async ({ classId, sessionId, search } = {}) => {
  const params = new URLSearchParams();
  if (classId) params.set("classId", classId);
  if (sessionId) params.set("sessionId", sessionId);
  if (search) params.set("search", search);
  return request(`/teacher/files/reusable?${params.toString()}`);
};

export const attachTeacherFile = async (fileId, { classId, sessionId } = {}) => request(
  `/teacher/files/${encodeURIComponent(fileId)}/placements`,
  {
    method: "POST",
    body: JSON.stringify({ classId, sessionId: sessionId || undefined }),
  },
);

export const detachTeacherFile = async (placementId) => request(
  `/teacher/file-placements/${encodeURIComponent(placementId)}`,
  { method: "DELETE" },
);

export const fetchStudentFiles = async ({ courseId, classId, sessionId, date, search } = {}) => {
  const params = new URLSearchParams();
  if (courseId) params.set("courseId", courseId);
  if (classId) params.set("classId", classId);
  if (sessionId) params.set("sessionId", sessionId);
  if (date) params.set("date", date);
  if (search) params.set("search", search);
  return request(`/student/files${params.size ? `?${params.toString()}` : ""}`);
};

// Class recordings are stored on Google Drive; LMS only manages metadata and access.
export const fetchStudentRecordings = ({ classId } = {}) => {
  const params = new URLSearchParams();
  if (classId) params.set("classId", classId);
  return request(`/recordings/mine${params.size ? `?${params.toString()}` : ""}`);
};

export const fetchAdminRecordingCatalog = () => request("/recordings/admin/catalog");

export const updateClassRecordingFolder = (classId, payload) => request(
  `/recordings/admin/classes/${encodeURIComponent(classId)}/folder`,
  { method: "PUT", body: JSON.stringify(payload) },
);

export const createClassRecording = (payload) => request("/recordings/admin", {
  method: "POST",
  body: JSON.stringify(payload),
});

export const updateClassRecording = (recordingId, payload) => request(`/recordings/admin/${encodeURIComponent(recordingId)}`, {
  method: "PATCH",
  body: JSON.stringify(payload),
});

export const deleteClassRecording = (recordingId) => request(`/recordings/admin/${encodeURIComponent(recordingId)}`, {
  method: "DELETE",
});

export const uploadClassFile = async (classId, file, { visibility = "CLASS_ONLY", sessionId, onProgress } = {}) => {
  onProgress?.({
    stage: "init",
    percent: 5,
    message: "Khởi tạo và xin cấp quyền tải lên...",
    loaded: 0,
    total: file.size,
  });

  const uploadResponse = await request(`/teacher/classes/${encodeURIComponent(classId)}/files/upload-url`, {
    method: "POST",
    body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size, visibility, classSessionId: sessionId }),
  });
  const upload = uploadResponse?.data;
  if (!upload?.uploadUrl || !upload?.fileId) throw new LmsApiError("Máy chủ không trả về upload target");

  onProgress?.({
    stage: "uploading",
    percent: 10,
    message: "Đang tải tệp lên...",
    loaded: 0,
    total: file.size,
  });

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", upload.uploadUrl, true);
    if (upload.headers && typeof upload.headers === "object") {
      Object.entries(upload.headers).forEach(([k, v]) => {
        try { xhr.setRequestHeader(k, v); } catch { /* ignore header error */ }
      });
    } else {
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const rawPercent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        const mappedPercent = Math.min(90, Math.round(10 + (event.loaded / event.total) * 80));
        onProgress?.({
          stage: "uploading",
          percent: mappedPercent,
          rawPercent,
          loaded: event.loaded,
          total: event.total,
          message: `Đang tải tệp lên (${rawPercent}%)...`,
        });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new LmsApiError(`Tải tệp lên thất bại (Mã phản hồi: ${xhr.status})`, { status: xhr.status }));
      }
    };

    xhr.onerror = () => {
      reject(new LmsApiError("Lỗi kết nối mạng khi tải lên tài liệu"));
    };

    xhr.ontimeout = () => {
      reject(new LmsApiError("Hết thời gian chờ phản hồi khi tải lên"));
    };

    xhr.send(file);
  });

  onProgress?.({
    stage: "confirming",
    percent: 92,
    message: "Đang lưu và xác thực tài liệu vào hệ thống...",
    loaded: file.size,
    total: file.size,
  });

  const confirmRes = await request(`/teacher/files/${encodeURIComponent(upload.fileId)}/confirm`, { method: "POST" });

  onProgress?.({
    stage: "done",
    percent: 100,
    message: "Tải lên tài liệu thành công!",
    loaded: file.size,
    total: file.size,
  });

  return confirmRes;
};

// Quiz papers are course-scoped protected PDFs. Students open them through the
// authenticated LMS route, never through a public storage URL.
export const uploadCourseQuizPaper = async (courseId, file, { onProgress } = {}) => {
  const mimeType = file.type || "application/pdf";
  onProgress?.({
    stage: "init",
    percent: 5,
    message: "Khởi tạo liên kết tải đề thi PDF...",
    loaded: 0,
    total: file.size,
  });

  const uploadResponse = await request(`/teacher/courses/${encodeURIComponent(courseId)}/files/upload-url`, {
    method: "POST",
    body: JSON.stringify({ filename: file.name, mimeType, sizeBytes: file.size }),
  });
  const upload = uploadResponse?.data;
  if (!upload?.uploadUrl || !upload?.fileId) throw new LmsApiError("Máy chủ không trả về upload target");

  onProgress?.({
    stage: "uploading",
    percent: 10,
    message: "Đang tải đề thi PDF lên...",
    loaded: 0,
    total: file.size,
  });

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", upload.uploadUrl, true);
    if (upload.headers && typeof upload.headers === "object") {
      Object.entries(upload.headers).forEach(([k, v]) => {
        try { xhr.setRequestHeader(k, v); } catch { /* ignore header error */ }
      });
    } else {
      xhr.setRequestHeader("Content-Type", mimeType);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const rawPercent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        const mappedPercent = Math.min(90, Math.round(10 + (event.loaded / event.total) * 80));
        onProgress?.({
          stage: "uploading",
          percent: mappedPercent,
          rawPercent,
          loaded: event.loaded,
          total: event.total,
          message: `Đang tải đề PDF lên (${rawPercent}%)...`,
        });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new LmsApiError(`Tải đề PDF lên thất bại (Mã lỗi ${xhr.status})`, { status: xhr.status }));
      }
    };

    xhr.onerror = () => {
      reject(new LmsApiError("Lỗi mạng khi tải đề PDF lên"));
    };

    xhr.ontimeout = () => {
      reject(new LmsApiError("Hết thời gian chờ khi tải đề PDF"));
    };

    xhr.send(file);
  });

  onProgress?.({
    stage: "confirming",
    percent: 92,
    message: "Đang lưu cấu hình đề PDF...",
    loaded: file.size,
    total: file.size,
  });

  const confirmRes = await request(`/teacher/files/${encodeURIComponent(upload.fileId)}/confirm`, { method: "POST" });

  onProgress?.({
    stage: "done",
    percent: 100,
    message: "Tải đề PDF thành công!",
    loaded: file.size,
    total: file.size,
  });

  return confirmRes;
};

export const deleteClassFile = async (fileId) => request(`/teacher/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
export const deleteTeacherFile = deleteClassFile;

export const uploadImageToR2 = async (file, { folder = "general", onProgress } = {}) => {
  onProgress?.({
    stage: "init",
    percent: 5,
    message: "Đang chuẩn bị ảnh...",
    loaded: 0,
    total: file.size,
  });

  const formData = new FormData();
  formData.append("image", file);
  formData.append("folder", folder);

  const uploadResponse = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/files/images/upload`, true);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const rawPercent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        const mappedPercent = Math.min(95, Math.round(10 + (event.loaded / event.total) * 85));
        onProgress?.({
          stage: "uploading",
          percent: mappedPercent,
          rawPercent,
          loaded: event.loaded,
          total: event.total,
          message: `Đang tải ảnh (${rawPercent}%)...`,
        });
      }
    };

    xhr.onload = () => {
      let body = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        reject(new LmsApiError("Máy chủ trả về dữ liệu không hợp lệ", { status: xhr.status, errorCode: "INVALID_RESPONSE" }));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body);
      } else {
        if (xhr.status === 401 && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("csca:session-expired"));
        }
        reject(new LmsApiError(body?.message || `Tải ảnh thất bại (Mã: ${xhr.status})`, {
          status: xhr.status,
          errorCode: body?.errorCode || `HTTP_${xhr.status}`,
          details: body,
        }));
      }
    };

    xhr.onerror = () => reject(new LmsApiError("Lỗi kết nối mạng khi tải ảnh"));
    xhr.ontimeout = () => reject(new LmsApiError("Hết thời gian chờ khi tải ảnh"));
    xhr.send(formData);
  });

  if (!uploadResponse?.data?.publicUrl) throw new LmsApiError("Máy chủ không trả về địa chỉ ảnh");

  onProgress?.({
    stage: "done",
    percent: 100,
    message: "Đã tải ảnh thành công!",
    loaded: file.size,
    total: file.size,
  });

  return uploadResponse.data;
};

export const uploadImageToCloudinary = async (file, { folder = "csca/courses", onProgress } = {}) => {
  onProgress?.({ stage: "init", percent: 5, message: "Đang chuẩn bị ảnh...", loaded: 0, total: file.size });

  const signatureResponse = await request("/files/cloudinary-signature", {
    method: "POST",
    body: JSON.stringify({ folder, resourceType: "image" }),
  });
  const signature = signatureResponse?.data;
  if (!signature?.uploadUrl || !signature?.signature) {
    throw new LmsApiError("Máy chủ không trả về cấu hình tải ảnh Cloudinary");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", signature.apiKey);
  formData.append("timestamp", String(signature.timestamp));
  formData.append("folder", signature.folder);
  formData.append("signature", signature.signature);

  const result = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", signature.uploadUrl, true);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const rawPercent = Math.round((event.loaded / event.total) * 100);
      onProgress?.({
        stage: "uploading",
        percent: Math.min(95, Math.round(10 + (event.loaded / event.total) * 85)),
        rawPercent,
        loaded: event.loaded,
        total: event.total,
        message: `Đang tải ảnh (${rawPercent}%)...`,
      });
    };
    xhr.onload = () => {
      let body;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        reject(new LmsApiError("Cloudinary trả về dữ liệu không hợp lệ"));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.secure_url) resolve(body);
      else reject(new LmsApiError(body?.error?.message || `Tải ảnh thất bại (Mã: ${xhr.status})`));
    };
    xhr.onerror = () => reject(new LmsApiError("Lỗi kết nối Cloudinary khi tải ảnh"));
    xhr.ontimeout = () => reject(new LmsApiError("Hết thời gian chờ khi tải ảnh lên Cloudinary"));
    xhr.send(formData);
  });

  onProgress?.({ stage: "done", percent: 100, message: "Đã tải ảnh thành công!", loaded: file.size, total: file.size });
  return { publicUrl: result.secure_url, publicId: result.public_id };
};

// ============================================================================
// SESSION VOCABULARY
// ============================================================================

export const fetchVocabularySessions = ({ courseId, classId, status = "all" } = {}) => {
  const params = new URLSearchParams();
  if (courseId) params.set("courseId", courseId);
  if (classId) params.set("classId", classId);
  if (status && status !== "all") params.set("status", status);
  return request(`/lms/vocabulary/sessions${params.size ? `?${params.toString()}` : ""}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
};

export const fetchSessionVocabulary = (sessionId) => request(
  `/lms/sessions/${encodeURIComponent(sessionId)}/vocabulary`,
  { cache: "no-store", headers: { "Cache-Control": "no-cache" } },
);

export const submitVocabularyPractice = (sessionId, results) => request(
  `/lms/sessions/${encodeURIComponent(sessionId)}/vocabulary/submit`,
  { method: "POST", body: JSON.stringify(results) },
);

export const toggleVocabularyStar = (vocabularyId) => request(
  `/lms/vocabulary/${encodeURIComponent(vocabularyId)}/toggle-star`,
  { method: "POST" },
);

export const createSessionVocabulary = (sessionId, vocabulary) => request(
  `/lms/sessions/${encodeURIComponent(sessionId)}/vocabulary`,
  { method: "POST", body: JSON.stringify(vocabulary) },
);

export const updateSessionVocabulary = (vocabularyId, vocabulary) => request(
  `/lms/vocabulary/${encodeURIComponent(vocabularyId)}`,
  { method: "PUT", body: JSON.stringify(vocabulary) },
);

export const deleteSessionVocabulary = (vocabularyId) => request(
  `/lms/vocabulary/${encodeURIComponent(vocabularyId)}`,
  { method: "DELETE" },
);

export const batchImportSessionVocabulary = (sessionId, vocabularies) => request(
  `/lms/sessions/${encodeURIComponent(sessionId)}/vocabulary/batch-import`,
  { method: "POST", body: JSON.stringify({ vocabularies }) },
);

export const suggestSessionVocabulary = (sessionId, options = {}) => request(
  `/lms/sessions/${encodeURIComponent(sessionId)}/vocabulary/ai-suggest`,
  { method: "POST", body: JSON.stringify(options) },
);

// ============================================================================
// TEACHER PAYROLL & SALARY API CLIENTS
// ============================================================================

export const fetchTeacherSalarySummary = async () => request("/teacher/salary-summary");

export const fetchAdminTeacherSalaries = async ({ search = "", rateStatus = "all", paymentStatus = "all" } = {}) => {
  const params = new URLSearchParams();
  if (search && search.trim()) params.set("search", search.trim());
  if (rateStatus && rateStatus !== "all") params.set("rateStatus", rateStatus);
  if (paymentStatus && paymentStatus !== "all") params.set("paymentStatus", paymentStatus);
  const query = params.toString();
  return request(`/admin/teacher-salaries${query ? `?${query}` : ""}`);
};

export const fetchAdminTeacherSalaryDetail = async (teacherId) => (
  request(`/admin/teacher-salaries/${encodeURIComponent(teacherId)}/detail`)
);

export const updateTeacherHourlyRate = async (teacherId, hourlyRate) => (
  request(`/admin/teacher-salaries/${encodeURIComponent(teacherId)}`, {
    method: "PUT",
    body: JSON.stringify({ hourlyRate }),
  })
);

export const updateTeacherClassHourlyRate = async (teacherId, classId, hourlyRateOverride) => (
  request(`/admin/teacher-salaries/${encodeURIComponent(teacherId)}/classes/${encodeURIComponent(classId)}`, {
    method: "PUT",
    body: JSON.stringify({ hourlyRateOverride }),
  })
);

export const updateSessionSalaryParameters = async (sessionId, { durationHours, status } = {}) => (
  request(`/admin/teacher-salaries/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PUT",
    body: JSON.stringify({ durationHours, status }),
  })
);

export const updateTeacherSalarySettlement = async (
  teacherId,
  { period = "all", bonusAmount = 0, deductionAmount = 0, paymentStatus = "pending", notes = "", paidAt = null } = {},
) => (
  request(`/admin/teacher-salaries/${encodeURIComponent(teacherId)}/settlement`, {
    method: "PUT",
    body: JSON.stringify({ period, bonusAmount, deductionAmount, paymentStatus, notes, paidAt }),
  })
);

export const adminTeacherSalariesExportUrl = ({ format = "xlsx", search = "", rateStatus = "all", paymentStatus = "all" } = {}) => {
  const params = new URLSearchParams();
  if (format) params.set("format", format);
  if (search && search.trim()) params.set("search", search.trim());
  if (rateStatus && rateStatus !== "all") params.set("rateStatus", rateStatus);
  if (paymentStatus && paymentStatus !== "all") params.set("paymentStatus", paymentStatus);
  return `${API_BASE}/admin/teacher-salaries/export?${params.toString()}`;
};

export const markWelcomeSeenApi = async () => (
  request("/auth/welcome-seen", {
    method: "POST",
  })
);

export const fetchWelcomeSettingsApi = async () => (
  request("/auth/welcome-settings", {
    method: "GET",
  })
);

export const fetchAdminWelcomeSettingsApi = async () => (
  request("/admin/welcome-settings", {
    method: "GET",
  })
);

export const updateAdminWelcomeSettingsApi = async (config) => (
  request("/admin/welcome-settings", {
    method: "PUT",
    body: JSON.stringify({ config }),
  })
);

export const resetAdminWelcomeSettingsApi = async () => (
  request("/admin/welcome-settings/reset-defaults", {
    method: "POST",
  })
);

export const resetUserWelcomeStatusApi = async (userId) => (
  request("/admin/welcome-settings/reset-user-welcome", {
    method: "POST",
    body: JSON.stringify({ userId }),
  })
);

// === FORMULA APIS ===
export const fetchFormulaSessions = async ({ subject = "", search = "", courseId = "", classId = "" } = {}) => {
  const params = new URLSearchParams();
  if (subject && subject !== "ALL") params.set("subject", subject);
  if (search && search.trim()) params.set("search", search.trim());
  if (courseId) params.set("courseId", courseId);
  if (classId) params.set("classId", classId);
  const query = params.toString();
  return request(`/lms/formulas/sessions${query ? `?${query}` : ""}`);
};

export const fetchSessionFormulas = async (sessionId) => (
  request(`/lms/sessions/${encodeURIComponent(sessionId)}/formulas`)
);

export const toggleFormulaStarApi = async (formulaId, personalNote = "") => (
  request(`/lms/formulas/${encodeURIComponent(formulaId)}/toggle-star`, {
    method: "POST",
    body: JSON.stringify({ personalNote }),
  })
);

export const createSessionFormulaApi = async (sessionId, payload) => (
  request(`/lms/sessions/${encodeURIComponent(sessionId)}/formulas`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
);

export const updateFormulaApi = async (formulaId, payload) => (
  request(`/lms/formulas/${encodeURIComponent(formulaId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  })
);

export const deleteFormulaApi = async (formulaId) => (
  request(`/lms/formulas/${encodeURIComponent(formulaId)}`, {
    method: "DELETE",
  })
);

export const fetchTeacherFormulaLibrary = async ({ subject = "", search = "", page = 1, limit = 50 } = {}) => {
  const params = new URLSearchParams();
  if (subject && subject !== "ALL") params.set("subject", subject);
  if (search && search.trim()) params.set("search", search.trim());
  if (page) params.set("page", page);
  if (limit) params.set("limit", limit);
  const query = params.toString();
  return request(`/lms/teach/formulas${query ? `?${query}` : ""}`);
};

export const fetchFormulaPresets = async ({ subject = "", search = "", limit = 30 } = {}) => {
  const params = new URLSearchParams();
  if (subject && subject !== "ALL") params.set("subject", subject);
  if (search && search.trim()) params.set("search", search.trim());
  if (limit) params.set("limit", limit);
  const query = params.toString();
  return request(`/lms/formulas/presets${query ? `?${query}` : ""}`);
};

export const fetchAdminFormulas = async ({ subject = "", search = "", page = 1, limit = 50 } = {}) => {
  const params = new URLSearchParams();
  if (subject && subject !== "ALL") params.set("subject", subject);
  if (search && search.trim()) params.set("search", search.trim());
  if (page) params.set("page", page);
  if (limit) params.set("limit", limit);
  const query = params.toString();
  return request(`/admin/formulas${query ? `?${query}` : ""}`);
};

export const batchImportFormulasApi = async (formulas) => (
  request("/admin/formulas/batch-import", {
    method: "POST",
    body: JSON.stringify({ formulas }),
  })
);



