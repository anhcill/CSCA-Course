import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useOutletContext } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, X } from "lucide-react";
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
  const [viewMode, setViewMode] = useState("week"); // "week" (Google Calendar 7-day strip on mobile / 7-col grid on desktop) | "month" | "list"
  const [sessions, setSessions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedCalendarClassId, setSelectedCalendarClassId] = useState(() => (classId ? String(classId) : "all"));

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const didPositionInitialCalendar = useRef(false);

  useEffect(() => {
    didPositionInitialCalendar.current = false;
    setSelectedCalendarClassId(classId ? String(classId) : "all");
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
      if (!silent) setErrorMessage("Không thể tải lịch. Vui lòng thử lại sau.");
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

  const calendarClasses = useMemo(() => {
    const map = new Map();
    for (const evt of allEvents) {
      const id = evt.live_class_id ?? evt.class_id;
      const title = evt.class_title ?? evt.live_class_title;
      if (id && !map.has(String(id))) {
        map.set(String(id), title || `Lớp #${id}`);
      }
    }
    return [...map.entries()].map(([id, title]) => ({ id, title }));
  }, [allEvents]);

  // Reset filter to "all" if the selected class is no longer in the dataset
  useEffect(() => {
    if (
      !classId
      && selectedCalendarClassId !== "all"
      && calendarClasses.length > 0
      && !calendarClasses.some((cls) => cls.id === selectedCalendarClassId)
    ) {
      setSelectedCalendarClassId("all");
    }
  }, [classId, selectedCalendarClassId, calendarClasses]);

  const visibleEvents = useMemo(() => {
    if (classId || selectedCalendarClassId === "all") return allEvents;
    return allEvents.filter((evt) => String(evt.live_class_id ?? evt.class_id ?? "") === String(selectedCalendarClassId));
  }, [allEvents, classId, selectedCalendarClassId]);

  const activeFilterClass = useMemo(
    () => calendarClasses.find((cls) => cls.id === selectedCalendarClassId) || null,
    [calendarClasses, selectedCalendarClassId],
  );

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
    else if (viewMode === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  if (loading) {
    return (
      <Loading
        loading={true}
        text={isTeacher ? "Đang tải lịch dạy..." : "Đang tải lịch học..."}
        fullScreen={false}
        className="min-h-[50vh] py-16"
      />
    );
  }

  if (errorMessage) {
    return (
      <div className="py-12">
        <ErrorState
          title={isTeacher ? "Chưa thể tải lịch dạy" : "Chưa thể tải lịch học"}
          message={errorMessage}
          onRetry={loadData}
        />
      </div>
    );
  }

  const basePath = courseId && classId ? `/lms/courses/${courseId}/classes/${classId}` : "";
  const selectedEventBasePath = selectedEvent?.course_id && selectedEvent?.live_class_id
    ? `/lms/courses/${selectedEvent.course_id}/classes/${selectedEvent.live_class_id}`
    : basePath;

  return (
    <div className="min-h-full w-full overflow-x-clip p-3 sm:p-4 xl:px-4 xl:py-3 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-[1440px] min-w-0">
        {/* Top Action & Class Filter Bar */}
        {((!classId && calendarClasses.length > 1) || canManageFixedSchedule || isTeacher) && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {!classId && calendarClasses.length > 1 ? (
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-initial">
                <label
                  htmlFor="calendar-class-filter"
                  className="hidden sm:inline shrink-0 text-xs font-bold text-[#102f63] dark:text-slate-300"
                >
                  Lớp:
                </label>
                <select
                  id="calendar-class-filter"
                  aria-label="Lọc theo lớp học"
                  value={selectedCalendarClassId}
                  onChange={(e) => setSelectedCalendarClassId(e.target.value)}
                  className="min-w-0 max-w-full flex-1 sm:flex-initial sm:max-w-[260px] rounded-xl border border-white/85 bg-white/90 px-3 py-2 text-xs font-bold text-[#102f63] shadow-sm outline-none backdrop-blur focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="all">Tất cả lớp ({calendarClasses.length})</option>
                  {calendarClasses.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.title}
                    </option>
                  ))}
                </select>
                {activeFilterClass && (
                  <button
                    type="button"
                    onClick={() => setSelectedCalendarClassId("all")}
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px] font-bold text-blue-700 hover:bg-blue-100 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                    title="Hiện tất cả các lớp"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span className="hidden xs:inline">Tất cả</span>
                  </button>
                )}
              </div>
            ) : (
              <div />
            )}

            {(canManageFixedSchedule || isTeacher) && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 sm:px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                <span>Thêm buổi</span>
              </button>
            )}
          </div>
        )}

        {/* Main 2-column responsive layout */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_310px] xl:grid-cols-[minmax(0,1fr)_330px]">
          {/* Left Column */}
          <div className="space-y-3 min-w-0">
            {/* Compact Scenic Title */}
            <div className="flex flex-wrap items-end justify-between gap-2 pt-0.5 pb-1">
              <div className="min-w-0">
                <h1 className="font-['Dancing_Script',cursive] text-3xl font-extrabold tracking-tight text-[#102f63] dark:text-sky-300 drop-shadow-xs sm:text-5xl">
                  {isTeacher ? "Lịch dạy" : "Lịch học"}
                </h1>
                <p className="mt-0.5 text-xs font-semibold italic text-slate-700 dark:text-slate-300 sm:text-sm">
                  {isTeacher ? "“Dạy học tận tâm, khai mở tri thức.”" : "“Học có kế hoạch, tương lai rộng mở.”"}
                </p>
              </div>
              <span className="rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-300">
                {visibleEvents.filter((e) => e.eventType === "SESSION").length} buổi · {visibleEvents.filter((e) => e.eventType !== "SESSION").length} bài tập
              </span>
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
                onDateChange={setCurrentDate}
                events={visibleEvents}
                onSelectEvent={setSelectedEvent}
                onJoinSession={handleJoinSession}
              />
            )}

            {viewMode === "month" && (
              <div className="overflow-hidden rounded-3xl border border-white/80 bg-white/95 p-2.5 sm:p-4 shadow-[0_10px_35px_rgba(32,78,120,0.06)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-[0_10px_35px_rgba(0,0,0,0.4)]">
                <CalendarMonthView
                  currentDate={currentDate}
                  events={visibleEvents}
                  onSelectEvent={setSelectedEvent}
                  onSelectDate={(date) => {
                    setCurrentDate(date);
                    setViewMode("week");
                  }}
                />
              </div>
            )}

            {viewMode === "list" && (
              <div className="overflow-hidden rounded-3xl border border-white/80 bg-white/95 p-3 sm:p-4 shadow-[0_10px_35px_rgba(32,78,120,0.06)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-[0_10px_35px_rgba(0,0,0,0.4)]">
                <CalendarListView
                  events={visibleEvents}
                  onSelectEvent={setSelectedEvent}
                  onJoinSession={handleJoinSession}
                  isTeacher={isTeacher}
                />
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-4 min-w-0">
            <div className="hidden lg:block">
              <ScheduleMiniCalendar
                currentDate={currentDate}
                onDateChange={setCurrentDate}
                events={visibleEvents}
              />
            </div>

            <ScheduleUpcomingEvents events={visibleEvents} onSelectEvent={setSelectedEvent} isTeacher={isTeacher} />

            <ScheduleTodayList
              currentDate={currentDate}
              events={visibleEvents}
              onJoinSession={handleJoinSession}
              isTeacher={isTeacher}
              isAdmin={isAdmin}
            />

            <div className="hidden lg:block">
              <ScheduleMottoCard />
            </div>
          </div>
        </div>
      </div>

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

      {selectedEvent && (selectedEvent.eventType === "ASSIGNMENT_DUE" || selectedEvent.eventType === "QUIZ_DUE") && (
        <AssignmentSubmissionsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          isTeacher={isTeacher}
        />
      )}

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
