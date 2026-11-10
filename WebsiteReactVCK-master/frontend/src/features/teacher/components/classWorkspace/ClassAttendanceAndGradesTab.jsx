import { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import toast from "react-hot-toast";
import {
  AlertCircle,
  Award,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  UserX,
  X,
  XCircle,
} from "lucide-react";
import {
  fetchAssessmentAccommodations,
  fetchAttendanceRoster,
  fetchClassStudentProgress,
  gradebookExportUrl,
  markAttendance,
  revokeAccommodation,
  saveAssessmentAccommodation,
  updateGradebookScore,
} from "../../../api/lmsClient";
import Loading from "../../../../components/Loading.jsx";
import { getAvatarUrl, handleAvatarError } from "../../../../utils/avatar";

const EMPTY_GRADEBOOK = {
  classInfo: null,
  sessions: [],
  students: [],
  attendance: [],
  activities: [],
  scores: [],
};

const datetimeLocalValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

/* ── Modal: Sửa điểm học viên ───────────────────────────────── */
function EditScoreModal({ target, onClose, onSaved }) {
  const { student, activity, record, classId } = target;
  const maxScore = record?.maxScore ?? activity.maxScore ?? 10;
  const currentScore = record?.score !== null && record?.score !== undefined ? String(record.score) : "";
  const [score, setScore] = useState(currentScore);
  const [reason, setReason] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const num = Number(score);
    if (score === "" || isNaN(num) || num < 0 || num > maxScore) {
      setErrorMsg(`Điểm số phải từ 0 đến ${maxScore}`);
      return;
    }
    setSaving(true);
    setErrorMsg("");
    try {
      await updateGradebookScore({
        classId,
        studentId: student.id,
        activityId: activity.id,
        score: num,
        reason: reason.trim() || "Giáo viên cập nhật điểm từ sổ theo dõi",
        feedbackText: feedbackText.trim() || undefined,
      });
      toast.success(`Đã cập nhật điểm cho ${student.name || student.username}`);
      onSaved();
    } catch (err) {
      setErrorMsg(err.message || "Không thể lưu điểm.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Sửa điểm học viên"
    >
      <div className="w-full max-w-md rounded-3xl border border-white/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-6 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-3">
          <div>
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-sky-400">
              <Pencil className="h-3 w-3" /> Chấm & Cập Nhật Điểm
            </span>
            <h2 className="mt-1 text-base font-bold text-slate-950 dark:text-white">
              {student.name || student.username || student.email}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {activity.type === "quiz" ? "Quiz" : "Bài tập"}:{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">{activity.title}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center transition"
            title="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 p-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/60">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Điểm số <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] font-medium text-slate-400">Thang điểm: 0 - {maxScore}</span>
            </div>
            <div className="relative mt-1">
              <input
                type="number"
                step="0.1"
                min="0"
                max={maxScore}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder={`0 - ${maxScore}`}
                required
                autoFocus
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
              <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">
                / {maxScore}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Lý do điều chỉnh <span className="font-normal text-slate-400">(tùy chọn)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ví dụ: Chấm lại bài, kiểm tra bù, cộng điểm chuyên cần..."
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Nhận xét cho học viên <span className="font-normal text-slate-400">(tùy chọn)</span>
            </label>
            <textarea
              rows={2}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Lời nhận xét hoặc góp ý..."
              className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          <div className="mt-5 flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : "Lưu điểm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Modal: Hỗ trợ riêng (Accommodations) ─────────────────────── */
function AccommodationModal({ student, activities = [], initialActivity, onClose, onSaved }) {
  const [activityId, setActivityId] = useState(initialActivity?.id || activities[0]?.id || "");
  const [dueAt, setDueAt] = useState("");
  const [extraTimeMinutes, setExtraTimeMinutes] = useState("");
  const [attemptLimitOverride, setAttemptLimitOverride] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const activity = activities.find((item) => item.id === activityId) || null;
  const [assessmentType, assessmentId] = String(activity?.id || "").split("-");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!assessmentType || !assessmentId) return;
      setLoading(true);
      try {
        const response = await fetchAssessmentAccommodations({ assessmentType, assessmentId });
        const current = (response?.data || []).find(
          (item) => String(item.userId) === String(student.id) && item.status === "active"
        );
        if (!cancelled) {
          setCurrentId(current?.id || null);
          setDueAt(datetimeLocalValue(current?.dueAt));
          setExtraTimeMinutes(current?.extraTimeMinutes ? String(current.extraTimeMinutes) : "");
          setAttemptLimitOverride(current?.attemptLimitOverride ? String(current.attemptLimitOverride) : "");
          setReason(current?.reason || "");
        }
      } catch (error) {
        if (!cancelled) {
          setCurrentId(null);
          setDueAt("");
          setExtraTimeMinutes("");
          setAttemptLimitOverride("");
          setReason("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [assessmentId, assessmentType, student.id]);

  const handleRevoke = async () => {
    if (!reason || reason.trim().length < 5) return toast.error("Nhập lý do thu hồi ít nhất 5 ký tự.");
    setSaving(true);
    try {
      await revokeAccommodation(currentId, reason);
      toast.success("Đã thu hồi hỗ trợ.");
      onSaved();
    } catch (e) {
      toast.error(e.message || "Lỗi thu hồi.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!activity) return;
    if (!reason.trim() || reason.trim().length < 5) {
      toast.error("Hãy nhập lý do điều chỉnh ít nhất 5 ký tự.");
      return;
    }
    try {
      setSaving(true);
      await saveAssessmentAccommodation({
        assessmentType,
        assessmentId: Number(assessmentId),
        userId: Number(student.id),
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        extraTimeMinutes: assessmentType === "quiz" && extraTimeMinutes ? Number(extraTimeMinutes) : 0,
        attemptLimitOverride: assessmentType === "quiz" && attemptLimitOverride ? Number(attemptLimitOverride) : null,
        reason: reason.trim(),
      });
      toast.success("Đã lưu điều chỉnh riêng cho học viên.");
      onSaved();
    } catch (error) {
      toast.error(error?.message || "Không thể lưu điều chỉnh riêng.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Điều chỉnh hỗ trợ riêng"
    >
      <div className="w-full max-w-xl rounded-3xl border border-white/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-6 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-sky-400">
              Hỗ trợ cá nhân
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-950 dark:text-white">
              Điều chỉnh riêng cho {student.name || student.username}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">Gia hạn hạn nộp hoặc thêm thời gian làm bài riêng cho học viên.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
            Hoạt động
            <select
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {activities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.type === "quiz" ? "Quiz" : "Bài tập"}: {item.title}
                </option>
              ))}
            </select>
          </label>

          {loading ? (
            <p className="rounded-xl bg-slate-50 dark:bg-slate-950/60 p-3 text-xs text-slate-500">
              Đang tải điều chỉnh hiện có...
            </p>
          ) : (
            <>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                Gia hạn nộp bài riêng <span className="font-medium text-slate-400">(không bắt buộc)</span>
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>

              {assessmentType === "quiz" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    Cộng thêm thời gian (phút)
                    <input
                      type="number"
                      min="0"
                      max="480"
                      value={extraTimeMinutes}
                      onChange={(e) => setExtraTimeMinutes(e.target.value)}
                      placeholder="Ví dụ: 15"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </label>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    Tổng số lượt làm riêng
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={attemptLimitOverride}
                      onChange={(e) => setAttemptLimitOverride(e.target.value)}
                      placeholder="Ví dụ: 2"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </label>
                </div>
              )}

              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                Lý do <span className="text-rose-500">*</span>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={2000}
                  placeholder="Ví dụ: Học viên có xác nhận cần thêm thời gian làm bài vì lý do sức khỏe."
                  className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-normal text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
            </>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2.5 pt-3 border-t border-slate-200/80 dark:border-slate-800">
          {currentId && (
            <button
              type="button"
              disabled={saving || loading}
              onClick={handleRevoke}
              className="rounded-xl px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
            >
              Thu hồi hỗ trợ
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={loading || saving || !activity}
            onClick={handleSave}
            className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "Lưu điều chỉnh"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT: ClassAttendanceAndGradesTab
   ══════════════════════════════════════════════════════════════════ */
export default function ClassAttendanceAndGradesTab({
  classId,
  sessions = [],
  initialSessionId = "",
  initialMode = "attendance",
}) {
  const [activeMode, setActiveMode] = useState(initialMode); // 'attendance' | 'gradebook'

  /* ── 1. Attendance state ── */
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId || "");
  const [roster, setRoster] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [attendancePolicy, setAttendancePolicy] = useState(null);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [rosterSearch, setRosterSearch] = useState("");

  /* ── 2. Gradebook state ── */
  const [gradebook, setGradebook] = useState(EMPTY_GRADEBOOK);
  const [loadingGradebook, setLoadingGradebook] = useState(false);
  const [gradebookSearch, setGradebookSearch] = useState("");
  const [editingScoreTarget, setEditingScoreTarget] = useState(null);
  const [accommodationTarget, setAccommodationTarget] = useState(null);

  // Set default selectedSessionId if empty
  useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) {
      // Find today's session or the nearest upcoming / past
      const now = Date.now();
      const upcoming = sessions.find((s) => new Date(s.end_time || s.endTime || s.start_time).getTime() >= now);
      setSelectedSessionId(String(upcoming ? upcoming.id : sessions[0].id));
    }
  }, [sessions, selectedSessionId]);

  // Sync if initialSessionId changes from parent props
  useEffect(() => {
    if (initialSessionId) {
      setSelectedSessionId(String(initialSessionId));
    }
  }, [initialSessionId]);

  /* ── Load Attendance Roster ── */
  const loadRoster = useCallback(async (sessId) => {
    if (!sessId) return;
    setLoadingRoster(true);
    try {
      const res = await fetchAttendanceRoster(sessId);
      if (!res?.success || !res.data) {
        throw new Error(res?.message || "Không thể tải danh sách học viên điểm danh.");
      }
      const students = res.data.students || [];
      setRoster(students);
      setAttendancePolicy(res.data.attendancePolicy || null);
      setAttendanceRecords(
        Object.fromEntries(
          students.map((st) => [
            st.id,
            {
              userId: st.id,
              status: st.attendance_status || "present",
              note: st.attendance_note || "",
            },
          ])
        )
      );
    } catch (err) {
      toast.error(err.message || "Lỗi tải sổ điểm danh.");
      setRoster([]);
      setAttendanceRecords({});
    } finally {
      setLoadingRoster(false);
    }
  }, []);

  useEffect(() => {
    if (activeMode === "attendance" && selectedSessionId) {
      loadRoster(selectedSessionId);
    }
  }, [activeMode, selectedSessionId, loadRoster]);

  /* ── Load Gradebook & Progress ── */
  const loadGradebook = useCallback(async () => {
    if (!classId) return;
    setLoadingGradebook(true);
    try {
      const res = await fetchClassStudentProgress(classId);
      setGradebook({ ...EMPTY_GRADEBOOK, ...(res?.data || {}) });
    } catch (err) {
      toast.error(err.message || "Lỗi tải sổ theo dõi chuyên cần và điểm số.");
      setGradebook(EMPTY_GRADEBOOK);
    } finally {
      setLoadingGradebook(false);
    }
  }, [classId]);

  useEffect(() => {
    if (activeMode === "gradebook") {
      loadGradebook();
    }
  }, [activeMode, loadGradebook]);

  /* ── Attendance Quick Actions ── */
  const handleMarkAll = (status) => {
    setAttendanceRecords((prev) => {
      const next = { ...prev };
      roster.forEach((st) => {
        next[st.id] = {
          userId: st.id,
          status,
          note: prev[st.id]?.note || "",
        };
      });
      return next;
    });
    toast.success(`Đã đánh dấu tất cả học viên: ${status === "present" ? "Có mặt" : status === "absent" ? "Vắng" : "Có phép"}`);
  };

  const handleStatusChange = (userId, status) => {
    setAttendanceRecords((prev) => ({
      ...prev,
      [userId]: {
        userId,
        status,
        note: prev[userId]?.note || "",
      },
    }));
  };

  const handleNoteChange = (userId, note) => {
    setAttendanceRecords((prev) => ({
      ...prev,
      [userId]: {
        userId,
        status: prev[userId]?.status || "present",
        note,
      },
    }));
  };

  const handleSaveAttendance = async () => {
    if (!selectedSessionId) return;
    setSavingAttendance(true);
    try {
      const attendanceList = Object.values(attendanceRecords).map((r) => ({
        userId: r.userId,
        status: r.status,
        note: r.note || "",
      }));
      const res = await markAttendance({
        sessionId: selectedSessionId,
        attendanceList,
      });
      if (!res?.success) throw new Error(res?.message || "Không thể lưu điểm danh.");
      toast.success("Đã lưu điểm danh buổi học thành công!");
      await loadRoster(selectedSessionId);
    } catch (err) {
      toast.error(err.message || "Lưu điểm danh thất bại.");
    } finally {
      setSavingAttendance(false);
    }
  };

  /* ── Stats Calculations for Attendance ── */
  const attendanceStats = useMemo(() => {
    const total = roster.length;
    let present = 0;
    let absent = 0;
    let excused = 0;
    roster.forEach((st) => {
      const rec = attendanceRecords[st.id];
      const status = rec?.status || st.attendance_status || "present";
      if (status === "present") present += 1;
      else if (status === "absent") absent += 1;
      else if (status === "excused") excused += 1;
    });
    const rate = total > 0 ? Math.round((present / total) * 100) : 100;
    return { total, present, absent, excused, rate };
  }, [roster, attendanceRecords]);

  const filteredRoster = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((s) => {
      const name = (s.username || s.name || "").toLowerCase();
      const email = (s.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [roster, rosterSearch]);

  const currentSession = useMemo(
    () => sessions.find((s) => String(s.id) === String(selectedSessionId)),
    [sessions, selectedSessionId]
  );

  /* ── Gradebook Calculations ── */
  const attendanceByKey = useMemo(
    () => new Map((gradebook.attendance || []).map((r) => [`${r.userId}:${r.sessionId}`, r])),
    [gradebook.attendance]
  );

  const scoreByKey = useMemo(
    () => new Map((gradebook.scores || []).map((r) => [`${r.userId}:${r.activityId}`, r])),
    [gradebook.scores]
  );

  const studentGradeSummaries = useMemo(() => {
    const { students = [], sessions: gSessions = [], activities = [] } = gradebook;
    const totalSessions = gSessions.length;

    return students.map((student) => {
      let presentCount = 0;
      let absentCount = 0;
      let excusedCount = 0;

      gSessions.forEach((s) => {
        const record = attendanceByKey.get(`${student.id}:${s.id}`);
        if (record) {
          if (record.status === "present") presentCount += 1;
          else if (record.status === "absent") absentCount += 1;
          else if (record.status === "excused") excusedCount += 1;
        }
      });

      const attendanceRate = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : 100;

      // GPA calculation
      let totalScore = 0;
      let gradedActivitiesCount = 0;
      activities.forEach((act) => {
        const scoreRec = scoreByKey.get(`${student.id}:${act.id}`);
        if (scoreRec && scoreRec.score !== null && scoreRec.score !== undefined) {
          totalScore += Number(scoreRec.score);
          gradedActivitiesCount += 1;
        }
      });
      const avgScore = gradedActivitiesCount > 0 ? (totalScore / gradedActivitiesCount).toFixed(1) : "—";

      return {
        ...student,
        presentCount,
        absentCount,
        excusedCount,
        attendanceRate,
        avgScore,
        gradedActivitiesCount,
      };
    });
  }, [gradebook, attendanceByKey, scoreByKey]);

  const filteredGradebookStudents = useMemo(() => {
    const q = gradebookSearch.trim().toLowerCase();
    if (!q) return studentGradeSummaries;
    return studentGradeSummaries.filter((s) => {
      const name = (s.name || s.username || s.fullName || "").toLowerCase();
      const email = (s.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [studentGradeSummaries, gradebookSearch]);

  const overallClassStats = useMemo(() => {
    const totalStudents = studentGradeSummaries.length;
    if (totalStudents === 0) return { avgAttendance: 100, onTrackCount: 0, avgGpa: "—" };

    const totalAttendanceRate = studentGradeSummaries.reduce((sum, s) => sum + s.attendanceRate, 0);
    const avgAttendance = Math.round(totalAttendanceRate / totalStudents);

    let totalGpa = 0;
    let validGpaCount = 0;
    studentGradeSummaries.forEach((s) => {
      if (s.avgScore !== "—") {
        totalGpa += Number(s.avgScore);
        validGpaCount += 1;
      }
    });

    const avgGpa = validGpaCount > 0 ? (totalGpa / validGpaCount).toFixed(1) : "—";
    const onTrackCount = studentGradeSummaries.filter((s) => s.attendanceRate >= 80).length;

    return { avgAttendance, onTrackCount, avgGpa, totalStudents };
  }, [studentGradeSummaries]);

  return (
    <div className="space-y-4">
      {/* ── Top Bar: Switcher giữa Điểm danh & Bảng điểm ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/90 dark:bg-slate-900/90 p-4 rounded-3xl border border-white/80 dark:border-slate-800 shadow-sm backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400">
              <UserCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-black text-[#102f63] dark:text-white">
                Sổ Điểm Danh, Chuyên Cần & Bảng Điểm
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gộp quản trị chuyên cần theo từng buổi và sổ điểm tổng hợp của cả lớp vào một nơi.
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="inline-flex rounded-2xl bg-slate-100 dark:bg-slate-800/80 p-1 border border-slate-200/80 dark:border-slate-700/60 shrink-0">
          <button
            type="button"
            onClick={() => setActiveMode("attendance")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activeMode === "attendance"
                ? "bg-white dark:bg-blue-600 text-[#102f63] dark:text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-[#102f63] dark:hover:text-white"
            }`}
          >
            <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            <span>Điểm danh theo buổi</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMode("gradebook")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activeMode === "gradebook"
                ? "bg-white dark:bg-blue-600 text-[#102f63] dark:text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-[#102f63] dark:hover:text-white"
            }`}
          >
            <Award className="h-4 w-4 text-amber-500 dark:text-amber-300" />
            <span>Tổng kết Chuyên cần & Bảng điểm</span>
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          MODE 1: ĐIỂM DANH THEO BUỔI (BY_SESSION)
         ════════════════════════════════════════════════════════════ */}
      {activeMode === "attendance" && (
        <div className="space-y-4">
          {/* Picker Buổi học + Thông tin buổi học */}
          <div className="rounded-3xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-4 sm:p-5 shadow-xs backdrop-blur-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-600 dark:text-sky-400" />
                <span className="text-xs font-black uppercase text-slate-500 tracking-wider">
                  Chọn buổi học để điểm danh
                </span>
              </div>

              {sessions.length > 0 ? (
                <div className="relative min-w-[280px] sm:min-w-[340px]">
                  <select
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    className="w-full appearance-none rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 pl-4 pr-10 py-2 text-xs font-bold text-[#102f63] dark:text-white shadow-2xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 cursor-pointer"
                  >
                    {sessions.map((s, idx) => (
                      <option key={s.id} value={s.id}>
                        Buổi {idx + 1}: {s.title} ({new Date(s.start_time || s.startTime).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                </div>
              ) : (
                <span className="text-xs text-slate-400 font-medium">Lớp chưa có buổi học nào.</span>
              )}
            </div>

            {/* Quick KPI stats for this session */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-800/60 p-3 text-center shadow-2xs">
                <p className="text-xl font-black text-[#102f63] dark:text-white leading-tight">
                  {attendanceStats.total}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold mt-0.5 flex items-center justify-center gap-1">
                  <Users className="h-3 w-3" /> Sĩ số
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/40 p-3 text-center shadow-2xs">
                <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 leading-tight">
                  {attendanceStats.present}
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold mt-0.5 flex items-center justify-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Có mặt
                </p>
              </div>

              <div className="rounded-2xl border border-rose-200/70 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/40 p-3 text-center shadow-2xs">
                <p className="text-xl font-black text-rose-600 dark:text-rose-400 leading-tight">
                  {attendanceStats.absent}
                </p>
                <p className="text-[11px] text-rose-700 dark:text-rose-300 font-bold mt-0.5 flex items-center justify-center gap-1">
                  <UserX className="h-3 w-3" /> Vắng
                </p>
              </div>

              <div className="rounded-2xl border border-amber-200/70 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/40 p-3 text-center shadow-2xs">
                <p className="text-xl font-black text-amber-600 dark:text-amber-400 leading-tight">
                  {attendanceStats.excused}
                </p>
                <p className="text-[11px] text-amber-700 dark:text-amber-300 font-bold mt-0.5 flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" /> Có phép
                </p>
              </div>

              <div className="rounded-2xl border border-blue-200/70 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/40 p-3 text-center shadow-2xs col-span-2 sm:col-span-1">
                <p className="text-xl font-black text-blue-600 dark:text-sky-400 leading-tight">
                  {attendanceStats.rate}%
                </p>
                <p className="text-[11px] text-blue-700 dark:text-sky-300 font-bold mt-0.5 flex items-center justify-center gap-1">
                  <BarChart3 className="h-3 w-3" /> Chuyên cần
                </p>
              </div>
            </div>

            {/* Attendance policy hint */}
            {attendancePolicy?.isLocked ? (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/30 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Buổi học này đã được chốt sổ điểm danh và khóa bảo lưu dữ liệu.</span>
              </div>
            ) : attendancePolicy?.reason ? (
              <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30 px-3.5 py-2 text-xs font-semibold text-amber-800 dark:text-amber-200">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
                <span>{attendancePolicy.reason}</span>
              </div>
            ) : null}
          </div>

          {/* Roster Table Card */}
          <div className="rounded-3xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-4 sm:p-5 shadow-xs backdrop-blur-md space-y-3.5">
            {/* Toolbar: Search + Quick mark all + Save button */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  placeholder="Tìm học viên theo tên hoặc email..."
                  className="w-full rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3.5 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-2xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleMarkAll("present")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 hover:bg-emerald-100 transition"
                >
                  <Check className="h-3.5 w-3.5" /> Tất cả Có mặt
                </button>
                <button
                  type="button"
                  onClick={() => handleMarkAll("absent")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300 hover:bg-rose-100 transition"
                >
                  <X className="h-3.5 w-3.5" /> Tất cả Vắng
                </button>
                <button
                  type="button"
                  onClick={() => loadRoster(selectedSessionId)}
                  disabled={loadingRoster}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition"
                  title="Tải lại danh sách"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingRoster ? "animate-spin" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={handleSaveAttendance}
                  disabled={savingAttendance || loadingRoster || roster.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition active:scale-95 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {savingAttendance ? "Đang lưu..." : "Lưu điểm danh"}
                </button>
              </div>
            </div>

            {/* Table */}
            {loadingRoster ? (
              <div className="py-12">
                <Loading loading text="Đang tải danh sách học viên điểm danh..." fullScreen={false} />
              </div>
            ) : roster.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Chưa có học viên nào trong buổi học này hoặc chưa chọn buổi học.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200/80 dark:border-slate-700 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-3 w-12 text-center">STT</th>
                      <th className="py-3 px-4 min-w-[200px]">Học Viên</th>
                      <th className="py-3 px-4 w-72 text-center">Trạng Thái Điểm Danh</th>
                      <th className="py-3 px-4 min-w-[200px]">Ghi Chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredRoster.map((student, idx) => {
                      const record = attendanceRecords[student.id] || { status: "present", note: "" };
                      const displayName = student.name || student.username || student.email || "Học viên";
                      return (
                        <tr
                          key={student.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition duration-150"
                        >
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={getAvatarUrl(student)}
                                onError={handleAvatarError}
                                alt={displayName}
                                className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="font-bold text-[#102f63] dark:text-white truncate">
                                  {displayName}
                                </p>
                                <p className="text-[11px] text-slate-400 font-mono truncate">
                                  {student.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Có mặt */}
                              <button
                                type="button"
                                onClick={() => handleStatusChange(student.id, "present")}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                                  record.status === "present"
                                    ? "bg-emerald-600 text-white shadow-xs"
                                    : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100"
                                }`}
                              >
                                <Check className="h-3 w-3" /> Có mặt
                              </button>
                              {/* Vắng */}
                              <button
                                type="button"
                                onClick={() => handleStatusChange(student.id, "absent")}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                                  record.status === "absent"
                                    ? "bg-rose-600 text-white shadow-xs"
                                    : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100"
                                }`}
                              >
                                <X className="h-3 w-3" /> Vắng
                              </button>
                              {/* Có phép */}
                              <button
                                type="button"
                                onClick={() => handleStatusChange(student.id, "excused")}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                                  record.status === "excused"
                                    ? "bg-amber-500 text-white shadow-xs"
                                    : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100"
                                }`}
                              >
                                <Clock className="h-3 w-3" /> Phép
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={record.note || ""}
                              onChange={(e) => handleNoteChange(student.id, e.target.value)}
                              placeholder="Ghi chú (vào muộn, lý do...)"
                              className="w-full rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          MODE 2: TỔNG KẾT CHUYÊN CẦN & BẢNG ĐIỂM (GRADEBOOK)
         ════════════════════════════════════════════════════════════ */}
      {activeMode === "gradebook" && (
        <div className="space-y-4">
          {/* Class Overall KPI Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-3xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-4 shadow-xs backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400">
                  <Users className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Sĩ số lớp</span>
              </div>
              <p className="mt-2 text-2xl font-black text-[#102f63] dark:text-white">
                {overallClassStats.totalStudents} học viên
              </p>
            </div>

            <div className="rounded-3xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-4 shadow-xs backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Chuyên cần TB lớp</span>
              </div>
              <p className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {overallClassStats.avgAttendance}%
              </p>
            </div>

            <div className="rounded-3xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-4 shadow-xs backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                  <Award className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Điểm TB cả lớp</span>
              </div>
              <p className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">
                {overallClassStats.avgGpa}
              </p>
            </div>

            <div className="rounded-3xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-4 shadow-xs backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                  <BarChart3 className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Bài tập & Quiz</span>
              </div>
              <p className="mt-2 text-2xl font-black text-purple-600 dark:text-purple-400">
                {(gradebook.activities || []).length} bài
              </p>
            </div>
          </div>

          {/* Gradebook Table Card */}
          <div className="rounded-3xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-4 sm:p-5 shadow-xs backdrop-blur-md space-y-3.5">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={gradebookSearch}
                  onChange={(e) => setGradebookSearch(e.target.value)}
                  placeholder="Tìm học viên trong bảng điểm..."
                  className="w-full rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3.5 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-2xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadGradebook}
                  disabled={loadingGradebook}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingGradebook ? "animate-spin" : ""}`} />
                  Tải lại
                </button>

                <a
                  href={gradebookExportUrl({ classId, format: "xlsx" })}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300/80 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 hover:bg-emerald-100 transition shadow-2xs"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Xuất Excel
                </a>
              </div>
            </div>

            {/* Table */}
            {loadingGradebook ? (
              <div className="py-12">
                <Loading loading text="Đang tổng hợp chuyên cần và bảng điểm..." fullScreen={false} />
              </div>
            ) : filteredGradebookStudents.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Chưa có dữ liệu học viên hoặc bảng điểm của lớp.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200/80 dark:border-slate-700 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-3 w-12 text-center">STT</th>
                      <th className="py-3 px-4 min-w-[200px]">Học Viên</th>
                      <th className="py-3 px-4 text-center min-w-[130px]">Tỷ lệ Chuyên cần</th>
                      <th className="py-3 px-4 text-center min-w-[90px]">Điểm TB</th>
                      {/* Dynamic columns for each activity */}
                      {(gradebook.activities || []).map((act) => (
                        <th key={act.id} className="py-3 px-4 text-center min-w-[120px]">
                          <div className="truncate max-w-[130px] font-bold" title={act.title}>
                            {act.title}
                          </div>
                          <span className="text-[10px] text-slate-400 font-normal uppercase">
                            {act.type === "quiz" ? "Quiz" : "Bài tập"} · Thang {act.maxScore || 10}
                          </span>
                        </th>
                      ))}
                      <th className="py-3 px-4 text-right min-w-[100px]">Hỗ trợ riêng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredGradebookStudents.map((st, idx) => {
                      const displayName = st.name || st.username || st.fullName || "Học viên";
                      return (
                        <tr
                          key={st.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition duration-150"
                        >
                          <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={getAvatarUrl(st)}
                                onError={handleAvatarError}
                                alt={displayName}
                                className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="font-bold text-[#102f63] dark:text-white truncate">
                                  {displayName}
                                </p>
                                <p className="text-[11px] text-slate-400 font-mono truncate">
                                  {st.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-black ${
                                  st.attendanceRate >= 80
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                    : st.attendanceRate >= 60
                                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                                    : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                                }`}
                              >
                                {st.attendanceRate}%
                              </span>
                              <span className="text-[10px] text-slate-400 mt-0.5">
                                {st.presentCount}/{(gradebook.sessions || []).length} buổi
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="text-sm font-black text-blue-600 dark:text-sky-400">
                              {st.avgScore}
                            </span>
                          </td>
                          {/* Activity score cells */}
                          {(gradebook.activities || []).map((act) => {
                            const scoreRec = scoreByKey.get(`${st.id}:${act.id}`);
                            const hasScore = scoreRec && scoreRec.score !== null && scoreRec.score !== undefined;
                            return (
                              <td key={act.id} className="py-3.5 px-4 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingScoreTarget({
                                      student: st,
                                      activity: act,
                                      record: scoreRec,
                                      classId,
                                    })
                                  }
                                  className="group inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-bold transition hover:bg-slate-100 dark:hover:bg-slate-800"
                                  title="Bấm để sửa điểm / nhận xét"
                                >
                                  {hasScore ? (
                                    <span className="font-black text-slate-900 dark:text-white">
                                      {scoreRec.score}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-600 font-normal">
                                      —
                                    </span>
                                  )}
                                  <Pencil className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                                </button>
                              </td>
                            );
                          })}
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setAccommodationTarget(st)}
                              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition"
                            >
                              Gia hạn riêng
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Score Modal */}
      {editingScoreTarget && (
        <EditScoreModal
          target={editingScoreTarget}
          onClose={() => setEditingScoreTarget(null)}
          onSaved={() => {
            setEditingScoreTarget(null);
            loadGradebook();
          }}
        />
      )}

      {/* Accommodation Modal */}
      {accommodationTarget && (
        <AccommodationModal
          student={accommodationTarget}
          activities={gradebook.activities || []}
          onClose={() => setAccommodationTarget(null)}
          onSaved={() => {
            setAccommodationTarget(null);
            loadGradebook();
          }}
        />
      )}
    </div>
  );
}

ClassAttendanceAndGradesTab.propTypes = {
  classId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  sessions: PropTypes.arrayOf(PropTypes.object),
  initialSessionId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  initialMode: PropTypes.oneOf(["attendance", "gradebook"]),
};
