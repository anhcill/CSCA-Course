import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuthContext } from "../../../context/AuthContext";
import { isTeacherRole } from "../../../constants/roles";
import { fetchMyLiveSchedule, getLiveSessionAccess } from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { ErrorState } from "../../../components/common/StateView";

import CalendarViewHeader from "../components/CalendarViewHeader";
import CalendarWeekView from "../components/CalendarWeekView";
import CalendarDayView from "../components/CalendarDayView";
import CalendarMonthView from "../components/CalendarMonthView";
import CalendarListView from "../components/CalendarListView";
import SessionDetailModal from "../components/SessionDetailModal";
import CreateScheduleModal from "../components/CreateScheduleModal";

function getSessionUiState(session) {
  const now = Date.now();
  const start = new Date(session.start_time).getTime();
  const end = new Date(session.end_time).getTime();
  if (session.status === "live" || (now >= start && now <= end)) return "live";
  if (now > end) return "completed";
  if (start - now <= 15 * 60 * 1000) return "open";
  return "upcoming";
}

export default function ClassCalendarPage() {
  const { courseId, classId } = useParams();
  const outletContext = useOutletContext();
  const { authUser } = useAuthContext();
  const isTeacher = isTeacherRole(authUser?.role);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("week"); // "week" | "day" | "month" | "list"
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const scheduleRes = await fetchMyLiveSchedule({ courseId, classId });
      setSessions(scheduleRes?.success && Array.isArray(scheduleRes.data) ? scheduleRes.data : []);
    } catch (err) {
      console.error("Unable to load calendar", err);
      setErrorMessage("Không thể tải lịch học. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  }, [courseId, classId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Hợp nhất sessions và các deadline bài tập/quiz từ workspace nếu có
  const allEvents = useMemo(() => {
    const sessionEvents = sessions.map((s) => ({
      ...s,
      eventType: "SESSION",
      uiState: getSessionUiState(s),
    }));

    const assignmentEvents = [];
    if (outletContext?.assignments && Array.isArray(outletContext.assignments)) {
      outletContext.assignments.forEach((a) => {
        if (a.due_date) {
          assignmentEvents.push({
            id: a.id,
            title: a.title,
            due_date: a.due_date,
            eventType: a.type === "quiz" ? "QUIZ_DUE" : "ASSIGNMENT_DUE",
            status: a.status,
            max_score: a.max_score,
          });
        }
      });
    }

    return [...sessionEvents, ...assignmentEvents];
  }, [sessions, outletContext]);

  // Xử lý vào phòng học trực tuyến an toàn theo giờ server
  const handleJoinSession = async (session) => {
    const now = Date.now();
    const start = new Date(session.start_time).getTime();
    const end = new Date(session.end_time).getTime();
    if (now > end) return toast("Buổi học này đã kết thúc.");
    if (start - now > 15 * 60 * 1000 && !isTeacher) {
      return toast("Phòng học mở trước giờ học 15 phút. Bạn quay lại sau nhé!", { icon: "⏰" });
    }

    try {
      const result = await getLiveSessionAccess(session.id);
      if (!result?.success || !result?.data?.meetUrl) {
        throw new Error(result?.message || "Phòng học chưa sẵn sàng");
      }
      window.open(result.data.meetUrl, "_blank", "noopener,noreferrer");
      toast.success(`Đang mở phòng học ${result.data.provider || "trực tuyến"}...`);
    } catch (err) {
      toast.error(err.message || "Không thể truy cập phòng học.");
    }
  };

  if (loading) {
    return <Loading loading={true} text="Đang tải lịch học & nhiệm vụ..." fullScreen={false} className="min-h-[50vh] py-16" />;
  }

  if (errorMessage) {
    return (
      <div className="py-12">
        <ErrorState title="Chưa thể tải lịch học" message={errorMessage} onRetry={loadData} />
      </div>
    );
  }

  const basePath = courseId && classId ? `/lms/courses/${courseId}/classes/${classId}` : "";

  return (
    <div className="space-y-4 pb-12 transition-colors duration-200">
      {/* Header điều hướng lịch */}
      <CalendarViewHeader
        currentDate={currentDate}
        onDateChange={setCurrentDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isTeacher={isTeacher}
        onCreateClick={() => setShowCreateModal(true)}
      />

      {/* Hiển thị theo viewMode */}
      {viewMode === "week" && (
        <CalendarWeekView
          currentDate={currentDate}
          events={allEvents}
          onSelectEvent={setSelectedEvent}
          onJoinSession={handleJoinSession}
        />
      )}

      {viewMode === "day" && (
        <CalendarDayView
          currentDate={currentDate}
          events={allEvents}
          onSelectEvent={setSelectedEvent}
          onJoinSession={handleJoinSession}
        />
      )}

      {viewMode === "month" && (
        <CalendarMonthView
          currentDate={currentDate}
          events={allEvents}
          onSelectEvent={setSelectedEvent}
          onSelectDate={(date) => {
            setCurrentDate(date);
            setViewMode("day");
          }}
        />
      )}

      {viewMode === "list" && (
        <CalendarListView
          events={allEvents}
          onSelectEvent={setSelectedEvent}
          onJoinSession={handleJoinSession}
        />
      )}

      {/* Modal chi tiết buổi học */}
      {selectedEvent && selectedEvent.eventType === "SESSION" && (
        <SessionDetailModal
          session={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onJoin={handleJoinSession}
          isTeacher={isTeacher}
          basePath={basePath}
        />
      )}

      {/* Modal tạo lịch (cho Giảng viên / Admin) */}
      {showCreateModal && (
        <CreateScheduleModal
          classId={classId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}
