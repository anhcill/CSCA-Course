import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useOutletContext } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { isTeacherRole } from "../../../constants/roles";
import { fetchMyLiveSchedule, fetchAssignments, getLiveSessionAccess } from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { ErrorState } from "../../../components/common/StateView";

import ScheduleControlBar from "../components/ScheduleControlBar";
import ScheduleWeeklyTimetable from "../components/ScheduleWeeklyTimetable";
import ScheduleMiniCalendar from "../components/ScheduleMiniCalendar";
import ScheduleUpcomingEvents from "../components/ScheduleUpcomingEvents";
import ScheduleTodayList from "../components/ScheduleTodayList";
import ScheduleMottoCard from "../components/ScheduleMottoCard";

import CalendarMonthView from "../components/CalendarMonthView";
import CalendarListView from "../components/CalendarListView";
import SessionDetailModal from "../components/SessionDetailModal";
import AssignmentSubmissionsModal from "../components/AssignmentSubmissionsModal";
import CreateScheduleModal from "../components/CreateScheduleModal";
import { subscribeToCalendarChanges } from "../calendarSync";
import { closeReservedMeeting, getMeetingWindowState, openReservedMeeting, reserveMeetingWindow } from "../../liveClass/utils/meetingLaunch";

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
  const navigate = useNavigate();
  const { courseId, classId } = useParams();
  const outletContext = useOutletContext();
  const { authUser } = useAuthContext();
  const isTeacher = isTeacherRole(authUser?.role);
  const isAdmin = authUser?.role === "admin";
  const canManageFixedSchedule = isAdmin;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("week"); // "week" | "month" | "list"
  const [sessions, setSessions] = useState([]);
  const [assignments, setAssignments] = useState([]);
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
      const [scheduleRes, assignmentsRes] = await Promise.all([
        fetchMyLiveSchedule({ courseId, classId }),
        fetchAssignments({ courseId, classId }).catch((err) => {
          console.warn("fetchAssignments warning:", err);
          return { data: [] };
        }),
      ]);

      if (!scheduleRes?.success) throw new Error(scheduleRes?.message || "Không thể tải lịch học");
      const nextSessions = scheduleRes?.success && Array.isArray(scheduleRes.data) ? scheduleRes.data : [];
      setSessions(nextSessions);

      const nextAssignments = Array.isArray(assignmentsRes?.data) ? assignmentsRes.data : [];
      setAssignments(nextAssignments);

      if (!didPositionInitialCalendar.current) {
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

  const allEvents = useMemo(() => {
    const sessionEvents = sessions.map((s) => ({
      ...s,
      eventType: "SESSION",
      uiState: getSessionUiState(s),
    }));

    // Gộp bài tập & quiz từ API thật và outletContext nếu có
    const combinedAssignments = [
      ...(Array.isArray(assignments) ? assignments : []),
      ...(Array.isArray(outletContext?.assignments) ? outletContext.assignments : []),
    ];

    const seenKeys = new Set();
    const assignmentEvents = [];

    combinedAssignments.forEach((a) => {
      const uniqueKey = `${a.type || "assignment"}-${a.id}`;
      if (!seenKeys.has(uniqueKey) && a.due_date) {
        seenKeys.add(uniqueKey);
        assignmentEvents.push({
          id: a.id,
          title: a.title,
          due_date: a.due_date,
          eventType: a.type === "quiz" ? "QUIZ_DUE" : "ASSIGNMENT_DUE",
          status: a.status,
          max_score: a.max_score,
          course_id: a.course_id,
          course_title: a.course_title,
          live_class_id: a.live_class_id,
          class_title: a.class_title,
          description: a.description,
          total_students: a.total_students,
          submitted_count: a.submitted_count,
          graded_count: a.graded_count,
        });
      }
    });

    return [...sessionEvents, ...assignmentEvents];
  }, [sessions, assignments, outletContext]);

  const handleJoinSession = async (session) => {
    const meetingWindowState = getMeetingWindowState(session);
    if (!isAdmin && meetingWindowState.isClosed) return toast("Buổi học này đã kết thúc.");
    if (!isAdmin && meetingWindowState.isTooEarly) {
      return toast("Phòng học mở trước giờ học 15 phút. Bạn quay lại sau nhé!", { icon: "⏰" });
    }

    const meetingWindow = reserveMeetingWindow();
    try {
      const result = await getLiveSessionAccess(session.id);
      if (!result?.success || !result?.data?.meetUrl) {
        throw new Error(result?.message || "Phòng học chưa sẵn sàng");
      }
      openReservedMeeting(meetingWindow, result.data.meetUrl, {
        sessionId: session.id,
        provider: result.data.provider,
        navigate,
      });
      toast.success(`Đang mở phòng học ${result.data.provider || "trực tuyến"}...`);
    } catch (err) {
      closeReservedMeeting(meetingWindow);
      toast.error(err.message || "Không thể truy cập phòng học.");
    }
  };

  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === "week") d.setDate(d.getDate() - 7);
    else if (viewMode === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === "week") d.setDate(d.getDate() + 7);
    else if (viewMode === "month") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
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
    <div className="min-h-full p-3 sm:p-4 xl:px-4 xl:py-3">
      <div className="mx-auto max-w-[1440px]">
        {/* Nút thêm lịch dành riêng cho Giáo viên / Admin */}
        {(canManageFixedSchedule || isTeacher) && (
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Thêm buổi học
            </button>
          </div>
        )}

        {/* Bố cục 2 cột chính:
            Cột trái (Lịch học + Thanh điều khiển + Bảng tuần)
            Cột phải (Lịch tháng mini + Sự kiện sắp tới + Lịch học hôm nay + Góc châm ngôn)
            Các box bên phải được đẩy lên trên cùng ngang hàng với tiêu đề Lịch học */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_310px] xl:grid-cols-[minmax(0,1fr)_330px]">
          {/* Cột trái */}
          <div className="space-y-3 min-w-0">
            {/* Chữ Lịch học gắn trực tiếp lên nền, không dùng khung thẻ nền */}
            <div className="pt-0.5 pb-1">
              <h1 className="font-['Dancing_Script',cursive] text-4xl font-extrabold tracking-tight text-[#102f63] drop-shadow-xs sm:text-5xl">
                Lịch học
              </h1>
              <p className="mt-1 text-xs font-semibold italic text-slate-800 sm:text-sm">
                {isTeacher ? "“Dạy học tận tâm, khai mở tri thức.”" : "“Học có kế hoạch, tương lai rộng mở.”"}
              </p>
              <p className="mt-0.5 font-['Ma_Shan_Zheng',cursive] text-sm tracking-wider text-slate-600 sm:text-base">
                {isTeacher ? "—— 师者，所以传道受业解惑也。" : "—— 凡事预则立，不预则废。"}
              </p>
            </div>

            <ScheduleControlBar
              currentDate={currentDate}
              onPrev={handlePrev}
              onNext={handleNext}
              onToday={handleToday}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />

            {viewMode === "week" && (
              <ScheduleWeeklyTimetable
                currentDate={currentDate}
                events={allEvents}
                onSelectEvent={setSelectedEvent}
                onJoinSession={handleJoinSession}
              />
            )}

            {viewMode === "month" && (
              <div className="overflow-hidden rounded-3xl border border-white/80 bg-white/95 p-4 shadow-[0_10px_35px_rgba(32,78,120,0.06)] backdrop-blur-md">
                <CalendarMonthView
                  currentDate={currentDate}
                  events={allEvents}
                  onSelectEvent={setSelectedEvent}
                  onSelectDate={(date) => {
                    setCurrentDate(date);
                    setViewMode("week");
                  }}
                />
              </div>
            )}

            {viewMode === "list" && (
              <div className="overflow-hidden rounded-3xl border border-white/80 bg-white/95 p-4 shadow-[0_10px_35px_rgba(32,78,120,0.06)] backdrop-blur-md">
                <CalendarListView
                  events={allEvents}
                  onSelectEvent={setSelectedEvent}
                  onJoinSession={handleJoinSession}
                  isTeacher={isTeacher}
                />
              </div>
            )}
          </div>

          {/* Cột phải: 4 card widget bắt đầu ngay từ trên cùng */}
          <div className="space-y-4">
            {/* Widget 1: Lịch tháng mini */}
            <ScheduleMiniCalendar
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              events={allEvents}
            />

            {/* Widget 2: Sự kiện sắp tới */}
            <ScheduleUpcomingEvents events={allEvents} onSelectEvent={setSelectedEvent} isTeacher={isTeacher} />

            {/* Widget 3: Lịch học hôm nay */}
            <ScheduleTodayList
              currentDate={currentDate}
              events={allEvents}
              onJoinSession={handleJoinSession}
              isTeacher={isTeacher}
              isAdmin={isAdmin}
            />

            {/* Widget 4: Góc châm ngôn truyền cảm hứng */}
            <ScheduleMottoCard />
          </div>
        </div>
      </div>

      {/* Modal chi tiết buổi học */}
      {selectedEvent && selectedEvent.eventType === "SESSION" && (
        <SessionDetailModal
          session={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onJoin={handleJoinSession}
          isTeacher={isTeacher}
          isAdmin={isAdmin}
          basePath={selectedEventBasePath}
        />
      )}

      {/* Modal chi tiết hạn nộp & danh sách bài nộp (Học viên & Giảng viên) */}
      {selectedEvent && (selectedEvent.eventType === "ASSIGNMENT_DUE" || selectedEvent.eventType === "QUIZ_DUE") && (
        <AssignmentSubmissionsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          isTeacher={isTeacher}
        />
      )}

      {/* Modal tạo lịch (Admin / Giáo viên) */}
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
