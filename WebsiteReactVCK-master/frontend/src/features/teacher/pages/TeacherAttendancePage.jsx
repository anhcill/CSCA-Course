import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useParams, useSearchParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardEdit,
  Lock,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import {
  createAttendanceAmendment,
  fetchAttendanceAmendments,
  fetchAttendanceRoster,
  fetchMyLiveSchedule,
  markAttendance,
} from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { EmptyState, ErrorState } from "../../../components/common/StateView";
import AttendanceSessionHeader from "../components/AttendanceSessionHeader";
import AttendanceStudentTable from "../components/AttendanceStudentTable";

const ACADEMY_TIME_ZONE = "Asia/Ho_Chi_Minh";

const academyDateKey = (value) => {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ACADEMY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const isAttendanceToday = (session) => (
  academyDateKey(session?.start_time) === academyDateKey(new Date())
);

export default function TeacherAttendancePage() {
  const { classId } = useParams();
  const location = useLocation();
  const isAdminView = location.pathname.startsWith("/admin/classes/");
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSessionId = searchParams.get("sessionId");

  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId || "");
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState([]);
  const [attendancePolicy, setAttendancePolicy] = useState(null);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [amendments, setAmendments] = useState([]);
  const [canReviewAmendments, setCanReviewAmendments] = useState(false);
  const [showAmendmentForm, setShowAmendmentForm] = useState(false);
  const [amendmentForm, setAmendmentForm] = useState({
    userId: "",
    requestedStatus: "present",
    requestedNote: "",
    reason: "",
  });
  const [savingAmendment, setSavingAmendment] = useState(false);

  // Attendance state: { [userId]: { status: 'present'|'absent'|'excused', note: string } }
  const [attendanceRecords, setAttendanceRecords] = useState({});

  const canMarkAttendance = Boolean(selectedSessionId && attendancePolicy?.canMarkAttendance);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    setErrorMsg("");
    try {
      const res = await fetchMyLiveSchedule();
      const allSessions = res?.success && Array.isArray(res.data)
        ? res.data.filter((session) => !classId || String(session.live_class_id) === String(classId))
        : [];
      const todaySessions = allSessions.filter(isAttendanceToday);
      setSessions(allSessions);
      setSelectedSessionId((currentSessionId) => {
        if (allSessions.some((session) => String(session.id) === String(currentSessionId))) {
          return currentSessionId;
        }
        return todaySessions[0] ? String(todaySessions[0].id) : (allSessions[0] ? String(allSessions[0].id) : "");
      });
    } catch (err) {
      console.error("Error loading sessions for attendance:", err);
      setErrorMsg("Không thể tải danh sách buổi học để điểm danh.");
      setSessions([]);
      setSelectedSessionId("");
    } finally {
      setLoadingSessions(false);
      setSessionsLoaded(true);
    }
  }, [classId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const requestedSessionId = searchParams.get("sessionId");
    if (
      requestedSessionId
      && sessions.some((session) => String(session.id) === String(requestedSessionId))
      && String(selectedSessionId) !== String(requestedSessionId)
    ) {
      setSelectedSessionId(requestedSessionId);
    }
  }, [searchParams, selectedSessionId, sessions]);

  const loadRoster = useCallback(async () => {
    if (!sessionsLoaded || !selectedSessionId) {
      setStudents([]);
      setAttendanceRecords({});
      setAttendancePolicy(null);
      return;
    }
    setLoadingRoster(true);
    setErrorMsg("");
    try {
      const res = await fetchAttendanceRoster(selectedSessionId);
      if (!res?.success || !res.data?.session) {
        throw new Error(res?.message || "Không thể tải sổ điểm danh.");
      }
      const roster = res.data?.students || [];
      setAttendancePolicy(
        res.data.attendancePolicy || {
          canMarkAttendance: false,
          isLocked: false,
          reason: "Không thể xác minh quyền điểm danh của buổi học này.",
        }
      );
      setStudents(roster);
      setAttendanceRecords(
        Object.fromEntries(
          roster.map((student) => [
            student.id,
            {
              userId: student.id,
              status: student.attendance_status || "present",
              note: student.attendance_note || "",
            },
          ])
        )
      );
    } catch (err) {
      console.error("Error loading attendance roster:", err);
      setStudents([]);
      setAttendanceRecords({});
      setAttendancePolicy(null);
      setErrorMsg("Không thể tải danh sách học viên của buổi học.");
    } finally {
      setLoadingRoster(false);
    }
  }, [selectedSessionId, sessionsLoaded]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const loadAmendments = useCallback(async () => {
    if (!sessionsLoaded || !selectedSessionId) {
      setAmendments([]);
      setCanReviewAmendments(false);
      return;
    }
    try {
      const response = await fetchAttendanceAmendments(selectedSessionId);
      setAmendments(Array.isArray(response?.data) ? response.data : []);
      setCanReviewAmendments(Boolean(response?.meta?.canReview));
    } catch {
      setAmendments([]);
      setCanReviewAmendments(false);
    }
  }, [selectedSessionId, sessionsLoaded]);

  useEffect(() => {
    loadAmendments();
  }, [loadAmendments]);

  const handleSessionChange = (e) => {
    const newId = e.target.value;
    setSelectedSessionId(newId);
    setSearchParams({ sessionId: newId });
  };

  const handleStatusChange = (userId, newStatus) => {
    if (!canMarkAttendance) return;
    setAttendanceRecords((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || { userId, note: "" }),
        status: newStatus,
      },
    }));
  };

  const handleNoteChange = (userId, newNote) => {
    if (!canMarkAttendance) return;
    setAttendanceRecords((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || { userId, status: "present" }),
        note: newNote,
      },
    }));
  };

  // Bulk Actions
  const handleMarkAll = (status) => {
    if (!canMarkAttendance) return;
    setAttendanceRecords((prev) => {
      const updated = { ...prev };
      students.forEach((s) => {
        updated[s.id] = {
          ...(updated[s.id] || { userId: s.id, note: "" }),
          status,
        };
      });
      return updated;
    });
    toast.success(
      status === "present"
        ? "Đã đánh dấu tất cả học viên Có mặt!"
        : "Đã đánh dấu tất cả học viên Vắng mặt!"
    );
  };

  // Submit attendance to backend
  const handleSaveAttendance = async () => {
    if (!selectedSessionId) {
      toast.error("Chưa chọn buổi học để điểm danh!");
      return;
    }
    if (!canMarkAttendance) {
      toast.error(attendancePolicy?.reason || "Buổi học này không thể điểm danh.");
      return;
    }

    setSaving(true);
    try {
      const attendanceList = Object.values(attendanceRecords).map((rec) => ({
        userId: rec.userId,
        status: rec.status,
        note: rec.note || "",
      }));

      const res = await markAttendance({
        sessionId: selectedSessionId,
        attendanceList,
      });

      if (res.success) {
        setAttendancePolicy((current) => ({
          ...current,
          isLocked: true,
          canMarkAttendance: false,
          reason: "Điểm danh của buổi học này đã được chốt và không thể chỉnh sửa.",
        }));
        toast.success(res.message || "Đã chốt điểm danh và khóa chỉnh sửa.");
      } else {
        toast.error(res.message || "Lỗi khi lưu điểm danh!");
      }
    } catch (err) {
      toast.error(err?.message || "Không thể lưu điểm danh. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAmendment = async (event) => {
    event.preventDefault();
    if (!selectedSessionId || !amendmentForm.userId) return;
    try {
      setSavingAmendment(true);
      await createAttendanceAmendment({
        sessionId: selectedSessionId,
        userId: amendmentForm.userId,
        requestedStatus: amendmentForm.requestedStatus,
        requestedNote: amendmentForm.requestedNote,
        reason: amendmentForm.reason,
      });
      toast.success("Đã gửi phiếu chỉnh sửa để quản trị viên duyệt.");
      setShowAmendmentForm(false);
      setAmendmentForm({ userId: "", requestedStatus: "present", requestedNote: "", reason: "" });
      await loadAmendments();
    } catch (error) {
      toast.error(error?.message || "Không thể tạo phiếu chỉnh sửa.");
    } finally {
      setSavingAmendment(false);
    }
  };

  // Statistics calculation
  const stats = useMemo(() => {
    const total = students.length;
    let present = 0;
    let absent = 0;
    let excused = 0;

    Object.values(attendanceRecords).forEach((rec) => {
      if (rec.status === "present") present += 1;
      else if (rec.status === "absent") absent += 1;
      else if (rec.status === "excused") excused += 1;
    });

    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, excused, rate };
  }, [students, attendanceRecords]);

  // Current session object
  const currentSession = useMemo(() => {
    return sessions.find((s) => String(s.id) === String(selectedSessionId));
  }, [sessions, selectedSessionId]);

  return (
    <div className="min-h-full px-3 pb-12 pt-3 sm:px-5 lg:px-6 text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-6xl space-y-5">
        {/* Navigation Back Link */}
        <div className="flex items-center justify-between">
          <Link
            to={isAdminView ? `/admin/classes/${classId}` : "/lms/teach"}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-3.5 py-1.5 text-xs font-bold text-[#17365f] dark:text-slate-300 shadow-2xs backdrop-blur transition hover:bg-white hover:text-blue-700 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {isAdminView ? "Quay lại quản lý lớp" : "Quay lại Bàn làm việc"}
          </Link>

          {currentSession && (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-sky-200/80 bg-sky-50/80 dark:border-slate-700 dark:bg-slate-800/80 px-3 py-1 text-[11px] font-bold text-sky-800 dark:text-sky-300 shadow-2xs backdrop-blur">
              <CalendarDays className="h-3 w-3 text-sky-600" />
              {currentSession.title}
            </span>
          )}
        </div>

        {/* 1. Hero Title Banner (Matching Student LMS Calligraphy Style) */}
        <section className="relative min-h-[140px] overflow-hidden px-2 py-4 sm:px-4">
          <div className="relative z-10 max-w-2xl">
            <h1 className="font-['Dancing_Script',cursive] text-[42px] font-bold leading-none text-[#102f63] dark:text-sky-200 sm:text-[48px]">
              Sổ điểm danh giảng dạy
            </h1>
            <p className="mt-2.5 text-sm font-semibold italic text-[#244866] dark:text-slate-300">
              “Kỷ luật là nền tảng của tự do, chuyên cần là chìa khóa của thành công.”
            </p>
            <p className="mt-1.5 font-['Ma_Shan_Zheng',cursive] text-xl text-[#17365f] dark:text-sky-300">
              持之以恒 · 循序渐进
            </p>
          </div>
        </section>

        {/* 2. Top Control Bar & Stats */}
        <AttendanceSessionHeader
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onSessionChange={handleSessionChange}
          stats={stats}
          policy={attendancePolicy}
          loading={loadingSessions}
        />

        {sessions.length > 0 && !sessions.some(isAttendanceToday) && (
          <div className="flex items-center gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30 px-4 py-2.5 text-xs font-semibold text-amber-800 dark:text-amber-200 shadow-2xs backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
            <span>Hôm nay không có buổi học mới. Bạn vẫn có thể xem lại dữ liệu cũ hoặc tạo phiếu chỉnh sửa để quản trị viên duyệt.</span>
          </div>
        )}

        {/* 3. Table & Bulk Actions Container */}
        <div className="rounded-3xl border border-white/80 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85 p-4 sm:p-6 space-y-4 shadow-[0_12px_35px_rgba(49,91,125,0.1)] backdrop-blur-md">
          {/* Header Row: Title & Bulk Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-black text-[#102f63] dark:text-white flex items-center gap-2">
                <Users className="h-4.5 w-4.5 text-blue-600 dark:text-sky-400" />
                Danh Sách Học Viên ({students.length})
              </h2>
              <p className="text-xs text-[#487291] dark:text-slate-400 mt-0.5">
                Đánh dấu trạng thái chuyên cần và nhập ghi chú cho từng học viên
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleMarkAll("present")}
                disabled={!canMarkAttendance}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-50 transition shadow-2xs"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Tất cả có mặt
              </button>
              <button
                type="button"
                onClick={() => handleMarkAll("absent")}
                disabled={!canMarkAttendance}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/60 text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:cursor-not-allowed disabled:opacity-50 transition shadow-2xs"
              >
                <UserX className="h-3.5 w-3.5" />
                Tất cả vắng
              </button>
            </div>
          </div>

          {/* Body: Loading / Error / Empty / Table */}
          {loadingRoster ? (
            <Loading loading={true} text="Đang đồng bộ sổ điểm danh..." fullScreen={false} className="py-14" />
          ) : errorMsg ? (
            <ErrorState title="Lỗi điểm danh" message={errorMsg} onRetry={loadRoster} />
          ) : !selectedSessionId ? (
            <EmptyState title="Chưa có buổi học được chọn" message="Vui lòng chọn buổi học để bắt đầu điểm danh." />
          ) : students.length === 0 ? (
            <EmptyState title="Không có học viên" message="Lớp học này hiện chưa có học viên nào được ghi danh." />
          ) : (
            <AttendanceStudentTable
              students={students}
              attendanceRecords={attendanceRecords}
              onStatusChange={handleStatusChange}
              onNoteChange={handleNoteChange}
              readOnly={!canMarkAttendance}
            />
          )}

          {/* Bottom Save Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-semibold">
                Có mặt: <strong className="font-black text-emerald-600 dark:text-emerald-400">{stats.present}</strong>
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-semibold">
                Vắng: <strong className="font-black text-rose-600 dark:text-rose-400">{stats.absent}</strong>
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-semibold">
                Có phép: <strong className="font-black text-amber-600 dark:text-amber-400">{stats.excused}</strong>
              </span>
            </div>

            <button
              type="button"
              onClick={handleSaveAttendance}
              disabled={saving || !canMarkAttendance || students.length === 0}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 px-7 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition hover:shadow-lg"
            >
              {attendancePolicy?.isLocked ? (
                <>
                  <Lock className="h-4 w-4" />
                  Điểm danh đã chốt
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  {saving ? "Đang chốt sổ..." : "Chốt & khóa điểm danh"}
                </>
              )}
            </button>
          </div>
        </div>

        {/* 4. Amendment Section (Phiếu Chỉnh Sửa Điểm Danh - Frosted Glass Card) */}
        {selectedSessionId && attendancePolicy?.isLocked && (
          <section className="rounded-3xl border border-white/80 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85 p-5 sm:p-6 shadow-[0_12px_35px_rgba(49,91,125,0.1)] backdrop-blur-md space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 shadow-2xs">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-black text-[#102f63] dark:text-white">
                    Phiếu Chỉnh Sửa Điểm Danh
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Bản điểm danh ban đầu luôn được lưu giữ. Mọi thay đổi sau khi chốt cần nêu rõ lý do để quản trị viên phê duyệt.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAmendmentForm((current) => !current)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 dark:border-violet-800/60 dark:bg-violet-950/40 px-3.5 py-2 text-xs font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/50 shadow-2xs transition"
              >
                <ClipboardEdit className="h-3.5 w-3.5" />
                {showAmendmentForm ? "Ẩn phiếu tạo" : "Tạo phiếu chỉnh sửa"}
              </button>
            </div>

            {/* Amendment Form Modal/Dropdown */}
            {showAmendmentForm && (
              <form
                onSubmit={handleCreateAmendment}
                className="grid gap-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 p-4 md:grid-cols-2 shadow-2xs"
              >
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Học viên cần điều chỉnh <span className="text-rose-500">*</span>
                  <select
                    required
                    value={amendmentForm.userId}
                    onChange={(event) => {
                      const student = students.find((item) => String(item.id) === event.target.value);
                      setAmendmentForm((current) => ({
                        ...current,
                        userId: event.target.value,
                        requestedStatus: student?.attendance_status || "present",
                        requestedNote: student?.attendance_note || "",
                      }));
                    }}
                    className="mt-1.5 w-full rounded-xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-800 dark:text-slate-200 shadow-2xs outline-none focus:border-sky-300"
                  >
                    <option value="">Chọn học viên...</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.username || student.name || student.email} · hiện tại: {student.attendance_status || "—"}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Trạng thái đề xuất mới <span className="text-rose-500">*</span>
                  <select
                    value={amendmentForm.requestedStatus}
                    onChange={(event) => setAmendmentForm((current) => ({ ...current, requestedStatus: event.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-800 dark:text-slate-200 shadow-2xs outline-none focus:border-sky-300"
                  >
                    <option value="present">Có mặt</option>
                    <option value="absent">Vắng</option>
                    <option value="excused">Có phép</option>
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Ghi chú mới
                  <input
                    value={amendmentForm.requestedNote}
                    onChange={(event) => setAmendmentForm((current) => ({ ...current, requestedNote: event.target.value }))}
                    maxLength={255}
                    placeholder="VD: Học viên vào muộn có báo trước..."
                    className="mt-1.5 w-full rounded-xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-800 dark:text-slate-200 shadow-2xs outline-none focus:border-sky-300"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Lý do điều chỉnh <span className="text-rose-500">*</span>
                  <input
                    required
                    minLength={10}
                    value={amendmentForm.reason}
                    onChange={(event) => setAmendmentForm((current) => ({ ...current, reason: event.target.value }))}
                    maxLength={2000}
                    placeholder="Nêu căn cứ điều chỉnh (tối thiểu 10 ký tự)..."
                    className="mt-1.5 w-full rounded-xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-800 dark:text-slate-200 shadow-2xs outline-none focus:border-sky-300"
                  />
                </label>

                <div className="md:col-span-2 flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAmendmentForm(false)}
                    className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/80 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={savingAmendment}
                    className="rounded-xl bg-violet-600 hover:bg-violet-700 px-5 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 transition"
                  >
                    {savingAmendment ? "Đang gửi phiếu..." : "Gửi phiếu duyệt"}
                  </button>
                </div>
              </form>
            )}

            {/* List of Existing Amendments */}
            <div className="space-y-2.5">
              {amendments.length === 0 ? (
                <p className="rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                  Chưa có phiếu chỉnh sửa nào cho buổi học này.
                </p>
              ) : (
                amendments.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-800/50 p-3.5 text-xs shadow-2xs"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-black text-slate-900 dark:text-white text-sm">
                          {item.studentName}
                        </p>
                        <p className="mt-1 text-slate-600 dark:text-slate-300">
                          {item.originalStatus} →{" "}
                          <b className="text-violet-700 dark:text-violet-300 font-bold">{item.requestedStatus}</b>
                          {item.reason ? ` · ${item.reason}` : ""}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          Gửi lúc: {item.requestedAt ? new Date(item.requestedAt).toLocaleString("vi-VN") : ""}
                          {item.reviewedAt ? ` · Xử lý: ${new Date(item.reviewedAt).toLocaleString("vi-VN")}` : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                            item.status === "approved"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : item.status === "rejected"
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                          }`}
                        >
                          {item.status === "pending"
                            ? "CHỜ DUYỆT"
                            : item.status === "approved"
                            ? "ĐÃ DUYỆT"
                            : "TỪ CHỐI"}
                        </span>
                        {canReviewAmendments && item.status === "pending" && (
                          <Link
                            to={isAdminView ? "/admin/attendance-review" : "/lms/teach/attendance-review"}
                            className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition"
                          >
                            Mở duyệt phiếu
                          </Link>
                        )}
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
