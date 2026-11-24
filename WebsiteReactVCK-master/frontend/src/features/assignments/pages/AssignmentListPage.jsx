import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { enterAssessmentFullscreen } from "../../../utils/assessmentDisplay.js";
import { Calendar, FileText } from "lucide-react";
import { fetchAssignments, fetchMyLiveSchedule } from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { ErrorState } from "../../../components/common/StateView";
import usePersistentClassSelection from "../../learning/hooks/usePersistentClassSelection";

import AssignmentHeroHeader from "../components/AssignmentHeroHeader";
import AssignmentFilterBar from "../components/AssignmentFilterBar";
import AssignmentTable from "../components/AssignmentTable";
import AssignmentWeekDeadlines from "../components/AssignmentWeekDeadlines";
import AssignmentUpcomingExams from "../components/AssignmentUpcomingExams";

function itemType(item) {
  const value = String(item.type || item.assignment_type || "homework").toLowerCase();
  if (value.includes("quiz") || value.includes("trac_nghiem")) return "quiz";
  if (value.includes("essay") || value.includes("writing") || value.includes("tu_luan")) return "essay";
  if (value.includes("speak") || value.includes("hskk") || value.includes("noi")) return "speaking";
  return "homework";
}

function itemStatus(item) {
  const type = itemType(item);
  const submissionStatus = String(item.submission_status || "").toLowerCase();
  const submitted = Boolean(item.submitted_at) || submissionStatus === "submitted" || item.status === "submitted";

  if (item.score !== undefined && item.score !== null) return "graded";
  if (submitted) return "submitted";
  if (type === "quiz" && submissionStatus === "in_progress") return "inProgress";

  const now = Date.now();
  const dueAt = item.due_date ? new Date(item.due_date).getTime() : null;
  return item.status === "late" || (dueAt && dueAt <= now) ? "overdue" : "todo";
}

function buildDeadlineMeta(dueTimestamp, normalizedStatus, now) {
  if (!dueTimestamp || normalizedStatus === "completed" || normalizedStatus === "grading") {
    return { deadlineHint: "", deadlineTone: "" };
  }
  const diffMs = dueTimestamp - now;
  if (diffMs < 0) {
    return { deadlineHint: "Quá hạn", deadlineTone: "overdue" };
  }
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  if (diffHours <= 1) {
    return { deadlineHint: "Còn < 1 giờ", deadlineTone: "urgent" };
  }
  if (diffHours <= 24) {
    return { deadlineHint: `Còn ${diffHours} giờ`, deadlineTone: "urgent" };
  }
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 2) {
    return { deadlineHint: "Hạn ngày mai", deadlineTone: "soon" };
  }
  if (diffDays <= 5) {
    return { deadlineHint: `Còn ${diffDays} ngày`, deadlineTone: "normal" };
  }
  return { deadlineHint: "", deadlineTone: "" };
}

export default function AssignmentListPage() {
  const navigate = useNavigate();
  const { courseId, classId } = useParams();

  const [rawAssignments, setRawAssignments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeFilter, setActiveFilter] = useState("active"); // "active" | "all" | "quiz" | "submitted" | "overdue"
  const [searchQuery, setSearchQuery] = useState("");

  const loadAssignments = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setErrorMessage("");
    }
    try {
      const [assignmentsRes, scheduleRes] = await Promise.allSettled([
        fetchAssignments({ courseId, classId }),
        fetchMyLiveSchedule({ courseId, classId }),
      ]);

      if (assignmentsRes.status === "fulfilled" && assignmentsRes.value?.success) {
        setRawAssignments(Array.isArray(assignmentsRes.value.data) ? assignmentsRes.value.data : []);
      } else if (assignmentsRes.status === "rejected") {
        throw assignmentsRes.reason;
      }

      if (scheduleRes.status === "fulfilled" && scheduleRes.value?.success) {
        setSessions(Array.isArray(scheduleRes.value.data) ? scheduleRes.value.data : []);
      }

      setErrorMessage("");
    } catch (error) {
      console.error("Unable to load assignments and schedules", error);
      if (!silent) setErrorMessage("Không thể tải danh sách bài tập. Vui lòng thử lại sau.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [classId, courseId]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    const refresh = () => loadAssignments({ silent: true });
    const intervalId = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
    };
  }, [loadAssignments]);

  const assignmentClasses = useMemo(() => {
    const classMap = new Map();
    rawAssignments.forEach((item) => {
      const id = item.live_class_id ?? item.class_id ?? item.liveClassId;
      if (!id) return;
      const key = String(id);
      if (!classMap.has(key)) {
        classMap.set(key, {
          id: key,
          title: item.class_title || item.course_title || item.course_code || `Lớp #${key}`,
        });
      }
    });
    sessions.forEach((s) => {
      const id = s.live_class_id ?? s.class_id ?? s.liveClassId;
      if (!id) return;
      const key = String(id);
      if (!classMap.has(key)) {
        classMap.set(key, {
          id: key,
          title: s.class_title || s.course_title || `Lớp #${key}`,
        });
      }
    });
    return Array.from(classMap.values());
  }, [rawAssignments, sessions]);

  const [selectedClassFilter, setSelectedClassFilter] = usePersistentClassSelection({
    scope: "assignments",
    availableClassIds: assignmentClasses.map((item) => item.id),
    allValue: "all",
    ready: !loading,
    preferredValue: classId || null,
  });

  // Xử lý dữ liệu thật từ API
  const allFormattedItems = useMemo(() => {
    const now = Date.now();
    const formattedReal = rawAssignments.map((assignment) => {
      const isQuiz = itemType(assignment) === "quiz";
      const status = itemStatus(assignment);
      const due = assignment.due_date ? new Date(assignment.due_date) : null;
      const dueTimestamp = due ? due.getTime() : null;
      const availableFrom = assignment.available_from ? new Date(assignment.available_from) : null;
      const availableUntil = assignment.available_until ? new Date(assignment.available_until) : due;
      const isWithinWindow = (!availableFrom || availableFrom.getTime() <= now)
        && (!availableUntil || availableUntil.getTime() > now);
      const attemptLimit = Number(assignment.attempt_limit || 1);
      const attemptCount = Number(assignment.attempt_count || 0);
      const isInProgress = isQuiz && String(assignment.submission_status || "").toLowerCase() === "in_progress";
      const canRetryQuiz = isQuiz && isWithinWindow && (isInProgress || attemptCount < attemptLimit);
      const canResubmitAssignment = !isQuiz && isWithinWindow && Boolean(assignment.can_resubmit);
      const isActionable = isQuiz
        ? canRetryQuiz
        : isWithinWindow && (status === "todo" || status === "inProgress" || canResubmitAssignment);

      let normalizedStatus = "todo";
      if (status === "graded") normalizedStatus = "completed";
      else if (status === "submitted" || status === "submittedLate") normalizedStatus = "grading";
      else if (status === "overdue") normalizedStatus = "overdue";

      const scoreDisplay =
        assignment.score !== undefined && assignment.score !== null
          ? `${Number(assignment.score).toFixed(2)}/${Number(assignment.max_score || 10).toFixed(2)}`
          : "-";

      const { deadlineHint, deadlineTone } = buildDeadlineMeta(dueTimestamp, normalizedStatus, now);
      const resolvedClassId = assignment.live_class_id ?? assignment.class_id ?? assignment.liveClassId ?? null;

      return {
        id: assignment.id,
        raw: assignment,
        classIdValue: resolvedClassId !== null ? String(resolvedClassId) : null,
        title: assignment.title,
        subTypeLabel: isQuiz ? "Kiểm tra trên máy" : "Bài tập cá nhân",
        courseTitle: assignment.course_title || "Khóa học CSCA",
        courseCode: assignment.class_title || assignment.course_code || "CSCA",
        dueDateFormatted: due ? due.toLocaleDateString("vi-VN") : "Không thời hạn",
        dueTimeFormatted: due
          ? due.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
          : "",
        deadlineHint,
        deadlineTone,
        normalizedStatus,
        scoreDisplay,
        isQuiz,
        icon: isQuiz ? Calendar : FileText,
        iconStyle: isQuiz ? "bg-rose-50 text-rose-500 dark:bg-rose-950/60 dark:text-rose-400" : "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400",
        created_at: assignment.created_at || assignment.due_date || new Date().toISOString(),
        createdTimestamp: new Date(assignment.created_at || assignment.due_date || 0).getTime(),
        dueTimestamp,
        availableFromTimestamp: availableFrom ? availableFrom.getTime() : null,
        availableUntilTimestamp: availableUntil ? availableUntil.getTime() : null,
        isActionable,
        isInProgress,
        canRetry: canRetryQuiz && attemptCount > 0 && !isInProgress,
        canResubmit: canResubmitAssignment,
        attemptCount,
        attemptLimit,
      };
    });

    return formattedReal.sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0));
  }, [rawAssignments]);

  // Lọc theo lớp đã chọn (khi ở trang tổng hợp /lms/assignments)
  const classScopedItems = useMemo(() => {
    if (classId || selectedClassFilter === "all") return allFormattedItems;
    return allFormattedItems.filter((item) => item.classIdValue === String(selectedClassFilter));
  }, [allFormattedItems, classId, selectedClassFilter]);

  // Đếm số lượng theo danh mục cho thanh lọc
  const counts = useMemo(() => {
    let active = 0;
    let quiz = 0;
    let submitted = 0;
    let overdue = 0;

    classScopedItems.forEach((it) => {
      if (it.isActionable) active += 1;
      if (it.isQuiz) quiz += 1;

      if (it.normalizedStatus === "completed" || it.normalizedStatus === "grading") {
        submitted += 1;
      } else if (it.normalizedStatus === "overdue") {
        overdue += 1;
      }
    });

    return {
      all: classScopedItems.length,
      active,
      quiz,
      submitted,
      overdue,
    };
  }, [classScopedItems]);

  // Lọc theo tabs & tìm kiếm + Sắp xếp thông minh theo hạn nộp gần nhất cho Cần làm / Quá hạn
  const visibleItems = useMemo(() => {
    const filtered = classScopedItems.filter((it) => {
      if (activeFilter === "active" && !it.isActionable) return false;
      if (activeFilter === "quiz" && !it.isQuiz) return false;
      if (activeFilter === "submitted" && it.normalizedStatus !== "completed" && it.normalizedStatus !== "grading") return false;
      if (activeFilter === "overdue" && it.normalizedStatus !== "overdue") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inTitle = String(it.title || "").toLowerCase().includes(q);
        const inCourse = String(it.courseTitle || "").toLowerCase().includes(q);
        const inCode = String(it.courseCode || "").toLowerCase().includes(q);
        if (!inTitle && !inCourse && !inCode) return false;
      }

      return true;
    });

    if (activeFilter === "active" || activeFilter === "overdue") {
      return [...filtered].sort((a, b) => {
        const dueA = a.dueTimestamp ?? Number.POSITIVE_INFINITY;
        const dueB = b.dueTimestamp ?? Number.POSITIVE_INFINITY;
        if (dueA !== dueB) return dueA - dueB;
        return (b.createdTimestamp || 0) - (a.createdTimestamp || 0);
      });
    }

    return filtered;
  }, [classScopedItems, activeFilter, searchQuery]);

  // NỐI DỮ LIỆU THẬT CHO BOX 1: "Hạn nộp trong tuần này"
  const weekDeadlines = useMemo(() => {
    const withDue = classScopedItems.filter((item) => item.dueTimestamp);
    const now = Date.now();

    const pending = withDue.filter(
      (item) => item.normalizedStatus === "todo" || item.normalizedStatus === "overdue"
    );

    const targetList = pending.length > 0 ? pending : withDue;
    const sorted = [...targetList].sort((a, b) => {
      const dueA = a.dueTimestamp ?? Number.POSITIVE_INFINITY;
      const dueB = b.dueTimestamp ?? Number.POSITIVE_INFINITY;
      if (dueA !== dueB) return dueA - dueB;
      return (b.createdTimestamp || 0) - (a.createdTimestamp || 0);
    });

    const dayNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

    return sorted.slice(0, 5).map((item) => {
      const due = new Date(item.dueTimestamp);
      const dayLabel = dayNames[due.getDay()];
      const dateLabel = `${String(due.getDate()).padStart(2, "0")}/${String(due.getMonth() + 1).padStart(2, "0")}`;

      const diffMs = item.dueTimestamp - now;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

      let remaining = "";
      let isUrgent = false;

      if (item.normalizedStatus === "completed") {
        remaining = "Đã nộp";
      } else if (diffMs < 0) {
        remaining = "Quá hạn";
        isUrgent = true;
      } else if (diffDays === 0 || (diffHours >= 0 && diffHours <= 12)) {
        remaining = diffHours <= 1 ? "Còn < 1 giờ" : `Còn ${diffHours} giờ`;
        isUrgent = true;
      } else if (diffDays === 1) {
        remaining = "Ngày mai";
        isUrgent = true;
      } else {
        remaining = `Còn ${diffDays} ngày`;
        isUrgent = diffDays <= 3;
      }

      return {
        id: `dl-${item.id}`,
        dayLabel,
        dateLabel,
        title: item.title,
        course: item.courseTitle ? `${item.courseTitle}${item.courseCode ? ` - ${item.courseCode}` : ""}` : "CSCA",
        remaining,
        isUrgent,
        rawItem: item,
      };
    });
  }, [classScopedItems]);

  // NỐI DỮ LIỆU THẬT CHO BOX 2: "Lịch kiểm tra sắp tới"
  const upcomingExams = useMemo(() => {
    const list = [];
    const now = Date.now();

    const quizItems = classScopedItems.filter(
      (item) => item.isQuiz || (item.title && /thi|kiểm tra|test|quiz/i.test(item.title))
    );

    quizItems.forEach((q) => {
      const date = q.dueTimestamp ? new Date(q.dueTimestamp) : new Date(q.created_at);
      const dayNum = String(date.getDate()).padStart(2, "0");
      const monthLabel = `THG ${date.getMonth() + 1}`;
      const isNear = q.dueTimestamp && q.dueTimestamp - now <= 3 * 24 * 60 * 60 * 1000 && q.dueTimestamp >= now;

      list.push({
        id: `exam-quiz-${q.id}`,
        dayNum,
        monthLabel,
        color: isNear || q.normalizedStatus === "overdue" ? "red" : "blue",
        title: q.title,
        course: q.courseTitle || "CSCA",
        time: q.dueTimeFormatted ? `Hạn: ${q.dueTimeFormatted}` : "Kiểm tra online",
        badge: "Online",
        badgeType: "online",
        timestamp: date.getTime(),
        rawItem: q,
        type: "quiz",
      });
    });

    const scopedSessions = !classId && selectedClassFilter !== "all"
      ? sessions.filter((s) => String(s.live_class_id ?? s.class_id ?? s.liveClassId ?? "") === String(selectedClassFilter))
      : sessions;

    scopedSessions.forEach((s) => {
      const date = new Date(s.start_time);
      const dayNum = String(date.getDate()).padStart(2, "0");
      const monthLabel = `THG ${date.getMonth() + 1}`;
      const startTime = date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
      const endTime = s.end_time
        ? new Date(s.end_time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
        : "";
      const isLiveExam = /thi|kiểm tra|test|exam|tổng kết/i.test(s.title || "");
      const isNear = date.getTime() >= now && date.getTime() - now <= 3 * 24 * 60 * 60 * 1000;

      list.push({
        id: `exam-session-${s.id}`,
        dayNum,
        monthLabel,
        color: isNear || isLiveExam ? "red" : "blue",
        title: s.title || "Buổi học & Kiểm tra",
        course: s.class_title || s.course_title || "CSCA",
        time: endTime ? `${startTime} - ${endTime}` : startTime,
        badge: "Trực tiếp",
        badgeType: "live",
        timestamp: date.getTime(),
        rawSession: s,
        type: "session",
      });
    });

    const upcoming = list.filter((item) => item.timestamp >= now - 24 * 60 * 60 * 1000);
    const sorted = (upcoming.length >= 3 ? upcoming : list).sort((a, b) => a.timestamp - b.timestamp);

    return sorted.slice(0, 5);
  }, [classId, classScopedItems, selectedClassFilter, sessions]);

  const handleAction = (item) => {
    const raw = item?.raw || item;
    if (raw) {
      enterAssessmentFullscreen();
      const isQuiz = itemType(raw) === "quiz" || item.isQuiz;
      if (courseId && classId) {
        navigate(
          isQuiz
            ? `/lms/courses/${courseId}/classes/${classId}/quizzes/${raw.id}`
            : `/lms/courses/${courseId}/classes/${classId}/assignments/${raw.id}/submit`
        );
      } else {
        navigate(
          isQuiz
            ? `/lms/quiz/${raw.id}`
            : `/lms/assignment/${raw.id}/submit`
        );
      }
      return;
    }

    navigate("/lms/assignments");
  };

  const handleExamClick = (examItem) => {
    if (examItem.type === "quiz" && examItem.rawItem) {
      handleAction(examItem.rawItem, "open");
    } else if (examItem.type === "session" && examItem.rawSession) {
      navigate(`/lms/live-room/${examItem.rawSession.id}`);
    } else {
      navigate("/lms/calendar");
    }
  };

  if (loading) {
    return (
      <Loading
        loading={true}
        text="Đang tải danh sách bài tập & kiểm tra..."
        fullScreen={false}
        className="min-h-[50vh] py-16"
      />
    );
  }

  if (errorMessage) {
    return (
      <div className="py-12">
        <ErrorState
          title="Chưa thể tải bài tập"
          message={errorMessage}
          onRetry={loadAssignments}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full p-2.5 sm:p-3.5 xl:px-4 xl:py-3 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_255px] xl:grid-cols-[minmax(0,1fr)_270px]">
          <div className="space-y-2.5 min-w-0">
            <AssignmentHeroHeader />

            <AssignmentFilterBar
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              counts={counts}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              classes={assignmentClasses}
              selectedClass={selectedClassFilter}
              onClassChange={setSelectedClassFilter}
              hideClassSelect={Boolean(classId)}
            />

            <AssignmentTable
              items={visibleItems}
              onAction={handleAction}
            />
          </div>

          <div className="space-y-4">
            <AssignmentWeekDeadlines
              deadlines={weekDeadlines}
              onAction={handleAction}
            />

            <AssignmentUpcomingExams
              exams={upcomingExams}
              onExamClick={handleExamClick}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
