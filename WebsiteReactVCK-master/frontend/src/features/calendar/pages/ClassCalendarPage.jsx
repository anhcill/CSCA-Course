import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { subscribeToCalendarChanges } from "../calendarSync";
import { closeReservedMeeting, openReservedMeeting, reserveMeetingWindow } from "../../liveClass/utils/meetingLaunch";

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
  const canManageFixedSchedule = authUser?.role === "admin";

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("week"); // "week" | "day" | "month" | "list"
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const didPositionInitialCalendar = useRef(false);

  useEffect(() => {
    didPositionInitialCalendar.current = false;
  }, [classId, courseId]);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setErrorMessage("");
    }
    try {
      const scheduleRes = await fetchMyLiveSchedule({ courseId, classId });
      if (!scheduleRes?.success) throw new Error(scheduleRes?.message || "Không thể tải lịch học");
      const nextSessions = scheduleRes?.success && Array.isArray(scheduleRes.data) ? scheduleRes.data : [];
      setSessions(nextSessions);

      // A common source of confusion was opening the current week on Sunday
      // while the next generated lesson is Monday. First open now goes to the
      // closest real lesson, without overriding dates the user later chooses.
      if (!didPositionInitialCalendar.current) {
        const nextSession = nextSessions.find((session) => new Date(session.end_time).getTime() > Date.now());
        if (nextSession?.start_time) setCurrentDate(new Date(nextSession.start_time));
        didPositionInitialCalendar.current = true;
      }
    } catch (err) {
      console.error("Unable to load calendar", err);
      if (!silent) setErrorMessage("Không thể tải lịch học. Vui lòng thử lại sau.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [courseId, classId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Server data is authoritative: this keeps schedules created or changed by
  // another admin/teacher visible without requiring the learner to reload.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") loadData({ silent: true });
    }, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [loadData]);

  useEffect(() => {
    const unsubscribe = subscribeToCalendarChanges(loadData);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadData();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
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

    const meetingWindow = reserveMeetingWindow();
    try {
      const result = await getLiveSessionAccess(session.id);
      if (!result?.success || !result?.data?.meetUrl) {
        throw new Error(result?.message || "Phòng học chưa sẵn sàng");
      }
      openReservedMeeting(meetingWindow, result.data.meetUrl);
      toast.success(`Đang mở phòng học ${result.data.provider || "trực tuyến"}...`);
    } catch (err) {
      closeReservedMeeting(meetingWindow);
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
  const selectedEventBasePath = selectedEvent?.course_id && selectedEvent?.live_class_id
    ? `/lms/courses/${selectedEvent.course_id}/classes/${selectedEvent.live_class_id}`
    : basePath;

  return (
    <div className="space-y-4 pb-12 transition-colors duration-200">
      {/* Header điều hướng lịch */}
      <CalendarViewHeader
        currentDate={currentDate}
        onDateChange={setCurrentDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isTeacher={isTeacher}
        canManageFixedSchedule={canManageFixedSchedule}
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
          basePath={selectedEventBasePath}
        />
      )}

      {/* Teachers may only add a supplemental session; fixed schedules belong to admins. */}
      {showCreateModal && (
        <CreateScheduleModal
          classId={classId}
          canManageFixedSchedule={canManageFixedSchedule}
          onClose={() => setShowCreateModal(false)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}
