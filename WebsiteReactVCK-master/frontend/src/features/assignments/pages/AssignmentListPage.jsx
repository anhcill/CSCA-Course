import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Calendar, FileText } from "lucide-react";
import { fetchAssignments, fetchMyLiveSchedule } from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { ErrorState } from "../../../components/common/StateView";

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

// Fallback demo items ONLY when database has 0 assignments
const DEFAULT_MOCK_ITEMS = [
  {
    id: "demo-1",
    title: "Bài tập chương 3 – Kinh tế vi mô",
    subTypeLabel: "Bài tập cá nhân",
    courseTitle: "Kinh tế vi mô",
    courseCode: "ECO101",
    dueDateFormatted: "20/10/2026",
    dueTimeFormatted: "23:59",
    normalizedStatus: "todo",
    scoreDisplay: "-",
    isQuiz: false,
    icon: FileText,
    iconStyle: "bg-blue-50 text-blue-600",
    created_at: "2026-10-18T10:00:00Z",
    dueTimestamp: new Date("2026-10-20T23:59:00Z").getTime(),
  },
  {
    id: "demo-2",
    title: "Thảo luận nhóm – Kỹ năng học tập",
    subTypeLabel: "Bài tập nhóm",
    courseTitle: "Kỹ năng học tập",
    courseCode: "SKI001",
    dueDateFormatted: "22/10/2026",
    dueTimeFormatted: "23:59",
    normalizedStatus: "todo",
    scoreDisplay: "-",
    isQuiz: false,
    icon: FileText,
    iconStyle: "bg-emerald-50 text-emerald-600",
    created_at: "2026-10-16T09:00:00Z",
    dueTimestamp: new Date("2026-10-22T23:59:00Z").getTime(),
  },
  {
    id: "demo-3",
    title: "Kiểm tra giữa kỳ – Tiếng Trung HSK2",
    subTypeLabel: "Kiểm tra trên máy",
    courseTitle: "Tiếng Trung HSK2",
    courseCode: "CHN202",
    dueDateFormatted: "24/10/2026",
    dueTimeFormatted: "14:00",
    normalizedStatus: "todo",
    scoreDisplay: "-",
    isQuiz: true,
    icon: Calendar,
    iconStyle: "bg-rose-50 text-rose-500",
    created_at: "2026-10-14T08:00:00Z",
    dueTimestamp: new Date("2026-10-24T14:00:00Z").getTime(),
  },
];

export default function AssignmentListPage() {
  const navigate = useNavigate();
  const { courseId, classId } = useParams();

  const [rawAssignments, setRawAssignments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeFilter, setActiveFilter] = useState("all"); // "all" | "homework" | "quiz" | "submitted" | "overdue"
  const [searchQuery, setSearchQuery] = useState("");

  const loadAssignments = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setErrorMessage("");
    }
    try {
      const [assignmentsRes, scheduleRes] = await Promise.allSettled([
        fetchAssignments({ courseId, classId }),
        fetchMyLiveSchedule(),
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

  // Xử lý dữ liệu thật từ API
  const allFormattedItems = useMemo(() => {
    const formattedReal = rawAssignments.map((assignment) => {
      const isQuiz = itemType(assignment) === "quiz";
      const status = itemStatus(assignment);
      const due = assignment.due_date ? new Date(assignment.due_date) : null;

      let normalizedStatus = "todo";
      if (status === "graded") normalizedStatus = "completed";
      else if (status === "submitted" || status === "submittedLate") normalizedStatus = "grading";
      else if (status === "overdue") normalizedStatus = "overdue";

      const scoreDisplay =
        assignment.score !== undefined && assignment.score !== null
          ? `${Number(assignment.score).toFixed(2)}/${Number(assignment.max_score || 10).toFixed(2)}`
          : "-";

      return {
        id: assignment.id,
        raw: assignment,
        title: assignment.title,
        subTypeLabel: isQuiz ? "Kiểm tra trên máy" : "Bài tập cá nhân",
        courseTitle: assignment.course_title || "Khóa học CSCA",
        courseCode: assignment.course_code || assignment.class_title || "CSCA",
        dueDateFormatted: due ? due.toLocaleDateString("vi-VN") : "Không thời hạn",
        dueTimeFormatted: due
          ? due.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
          : "",
        normalizedStatus,
        scoreDisplay,
        isQuiz,
        icon: isQuiz ? Calendar : FileText,
        iconStyle: isQuiz ? "bg-rose-50 text-rose-500" : "bg-blue-50 text-blue-600",
        created_at: assignment.created_at || assignment.due_date || new Date().toISOString(),
        dueTimestamp: due ? due.getTime() : null,
      };
    });

    // Khi có dữ liệu thật: KHÔNG ghép mock items mà dùng 100% dữ liệu thật
    if (formattedReal.length > 0) {
      // BÀI NÀO MỚI ĐĂNG THÌ ĐẨY LÊN ĐẦU
      return formattedReal.sort((a, b) => {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeB - timeA;
      });
    }

    // Chỉ dùng mock items nếu database chưa có bài tập nào
    return DEFAULT_MOCK_ITEMS;
  }, [rawAssignments]);

  // Đếm số lượng theo danh mục cho thanh lọc (dựa trên dữ liệu thật)
  const counts = useMemo(() => {
    let homework = 0;
    let quiz = 0;
    let submitted = 0;
    let overdue = 0;

    allFormattedItems.forEach((it) => {
      if (it.isQuiz) quiz += 1;
      else homework += 1;

      if (it.normalizedStatus === "completed" || it.normalizedStatus === "grading") {
        submitted += 1;
      } else if (it.normalizedStatus === "overdue") {
        overdue += 1;
      }
    });

    return {
      all: allFormattedItems.length,
      homework,
      quiz,
      submitted,
      overdue,
    };
  }, [allFormattedItems]);

  // Lọc theo tabs & tìm kiếm
  const visibleItems = useMemo(() => {
    return allFormattedItems.filter((it) => {
      if (activeFilter === "homework" && it.isQuiz) return false;
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
  }, [allFormattedItems, activeFilter, searchQuery]);

  // NỐI DỮ LIỆU THẬT CHO BOX 1: "Hạn nộp trong tuần này"
  const weekDeadlines = useMemo(() => {
    const withDue = allFormattedItems.filter((item) => item.dueTimestamp);
    const now = Date.now();

    // Ưu tiên các bài chưa hoàn thành hoặc quá hạn cần xử lý
    const pending = withDue.filter(
      (item) => item.normalizedStatus === "todo" || item.normalizedStatus === "overdue"
    );

    const targetList = pending.length > 0 ? pending : withDue;
    const sorted = [...targetList].sort((a, b) => (a.dueTimestamp || 0) - (b.dueTimestamp || 0));

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
  }, [allFormattedItems]);

  // NỐI DỮ LIỆU THẬT CHO BOX 2: "Lịch kiểm tra sắp tới"
  const upcomingExams = useMemo(() => {
    const list = [];
    const now = Date.now();

    // 1. Lấy từ các bài thi / quiz thật của học viên
    const quizItems = allFormattedItems.filter(
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

    // 2. Lấy từ các buổi học trực tuyến có kiểm tra từ Live Schedule
    sessions.forEach((s) => {
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

    // Sắp xếp theo thời gian gần nhất
    const upcoming = list.filter((item) => item.timestamp >= now - 24 * 60 * 60 * 1000);
    const sorted = (upcoming.length >= 3 ? upcoming : list).sort((a, b) => a.timestamp - b.timestamp);

    return sorted.slice(0, 5);
  }, [allFormattedItems, sessions]);

  // Xử lý điều hướng khi bấm nút trên bảng hoặc box Hạn nộp
  const handleAction = (item, actionType) => {
    const raw = item?.raw || item;
    if (raw) {
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

    // Với item demo
    if (item.isQuiz) {
      navigate(`/lms/quizzes/gallery`);
    } else {
      navigate(`/lms/my-learning`);
    }
  };

  // Xử lý điều hướng khi bấm box Lịch kiểm tra
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
    <div className="min-h-full p-2.5 sm:p-3.5 xl:px-4 xl:py-3">
      <div className="mx-auto max-w-[1440px]">
        {/* Bố cục 2 cột:
            Cột trái: Tiêu đề, Thanh lọc, Bảng danh sách bài tập
            Cột phải: 2 Box Widget kết nối dữ liệu thật */}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_255px] xl:grid-cols-[minmax(0,1fr)_270px]">
          {/* Cột trái */}
          <div className="space-y-2.5 min-w-0">
            {/* Chữ Bài tập & Kiểm tra trực tiếp trên nền sơn thủy */}
            <AssignmentHeroHeader />

            {/* Thanh công cụ lọc & tìm kiếm */}
            <AssignmentFilterBar
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              counts={counts}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />

            {/* Bảng danh sách bài tập chuẩn theo mockup, nối 100% dữ liệu thật */}
            <AssignmentTable
              items={visibleItems}
              onAction={handleAction}
            />
          </div>

          {/* Cột phải: 2 Widget kết nối dữ liệu thật */}
          <div className="space-y-4">
            {/* Widget 1: Hạn nộp trong tuần này */}
            <AssignmentWeekDeadlines
              deadlines={weekDeadlines}
              onAction={handleAction}
            />

            {/* Widget 2: Lịch kiểm tra sắp tới */}
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
