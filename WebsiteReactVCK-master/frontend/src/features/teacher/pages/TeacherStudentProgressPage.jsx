/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  Pencil,
  Search,
  SlidersHorizontal,
  Users,
  X,
  FileSpreadsheet,
} from "lucide-react";
import GradebookPolicyPanel from "../components/GradebookPolicyPanel";
import TeacherRiskStudentsSection from "../components/TeacherRiskStudentsSection";
import {
  revokeAccommodation,
  fetchAssessmentAccommodations,
  fetchClassStudentProgress,
  fetchTeacherDashboardStats,
  gradebookExportUrl,
  saveAssessmentAccommodation,
  updateGradebookScore,
} from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { EmptyState, ErrorState } from "../../../components/common/StateView";

const EMPTY_GRADEBOOK = {
  classInfo: null,
  sessions: [],
  students: [],
  attendance: [],
  activities: [],
  scores: [],
};

const formatSession = (session) => {
  if (!session?.startTime) return session?.title || "Buổi học";
  const date = new Date(session.startTime);
  return `${session.title || "Buổi học"} · ${date.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
};

const formatCheckedAt = (value) =>
  value
    ? new Date(value).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

const attendanceLabel = {
  present: { text: "Có mặt", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25" },
  absent: { text: "Vắng", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/25" },
  excused: { text: "Có phép", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25" },
};

const datetimeLocalValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

/* ── Modal: Hỗ trợ riêng (Accommodations) ─────────────────────── */
function AccommodationModal({ student, activities, initialActivity, onClose, onSaved }) {
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
          (item) => String(item.userId) === String(student.id) && item.status === "active",
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
          window.alert(error.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [assessmentId, assessmentType, student.id]);

  const handleRevoke = async () => {
    if (!reason || reason.trim().length < 10) return window.alert("Nhập lý do thu hồi ít nhất 10 ký tự.");
    setSaving(true);
    try {
      await revokeAccommodation(currentId, reason);
      onSaved();
    } catch (e) {
      window.alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!activity) return;
    if (!reason.trim() || reason.trim().length < 10) {
      window.alert("Hãy nhập lý do điều chỉnh ít nhất 10 ký tự.");
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
      onSaved();
    } catch (error) {
      window.alert(error?.message || "Không thể lưu điều chỉnh riêng.");
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
            <p className="text-[10px] font-black uppercase tracking-wider text-[#1a446c] dark:text-sky-400">
              Hỗ trợ cá nhân
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-950 dark:text-white">
              Điều chỉnh riêng cho {student.name}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">Mọi thay đổi đều được ghi nhật ký và lưu lý do rõ ràng.</p>
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
              onChange={(event) => setActivityId(event.target.value)}
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
                Gia hạn riêng <span className="font-medium text-slate-400">(không bắt buộc)</span>
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
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
                      onChange={(event) => setExtraTimeMinutes(event.target.value)}
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
                      onChange={(event) => setAttemptLimitOverride(event.target.value)}
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
                  onChange={(event) => setReason(event.target.value)}
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
            className="rounded-xl bg-gradient-to-r from-[#17365f] via-[#1a446c] to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#1a446c]/20 hover:opacity-95 disabled:opacity-50 transition"
          >
            {saving ? "Đang lưu..." : "Lưu điều chỉnh"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
    if (score === "" || isNaN(num) || num < 0) {
      setErrorMsg("Vui lòng nhập điểm số hợp lệ (số lớn hơn hoặc bằng 0).");
      return;
    }
    if (maxScore && num > maxScore) {
      setErrorMsg(`Điểm số không được vượt quá điểm tối đa (${maxScore}).`);
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
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#1a446c] dark:text-sky-400">
              <Pencil className="h-3 w-3" /> Chấm & Cập Nhật Điểm
            </span>
            <h2 className="mt-1 text-base font-bold text-slate-950 dark:text-white">
              {student.name}
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
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#17365f] via-[#1a446c] to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#1a446c]/20 hover:opacity-95 disabled:opacity-50 transition"
            >
              {saving ? "Đang lưu..." : "Lưu điểm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main Page Component ─────────────────────────────────────── */
export default function TeacherStudentProgressPage() {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("all");
  const [gradebook, setGradebook] = useState(EMPTY_GRADEBOOK);
  const [search, setSearch] = useState("");
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingGradebook, setLoadingGradebook] = useState(false);
  const [error, setError] = useState("");
  const [accommodationTarget, setAccommodationTarget] = useState(null);
  const [editingScoreTarget, setEditingScoreTarget] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const [riskStudents, setRiskStudents] = useState([]);
  const [riskClassFilter, setRiskClassFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [riskError, setRiskError] = useState("");

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    setError("");
    try {
      const result = await fetchTeacherDashboardStats({ limit: 1 });
      const nextClasses = result?.data?.classes || [];
      setClasses(nextClasses);
      setClassId((current) => current || String(nextClasses[0]?.id || ""));
    } catch (loadError) {
      setError(loadError.message || "Không thể tải danh sách lớp phụ trách.");
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  const loadGradebook = useCallback(async () => {
    if (!classId) {
      setGradebook(EMPTY_GRADEBOOK);
      return;
    }
    setLoadingGradebook(true);
    setError("");
    try {
      const result = await fetchClassStudentProgress(classId);
      setGradebook({ ...EMPTY_GRADEBOOK, ...(result?.data || {}) });
    } catch (loadError) {
      setGradebook(EMPTY_GRADEBOOK);
      setError(loadError.message || "Không thể tải sổ theo dõi lớp.");
    } finally {
      setLoadingGradebook(false);
    }
  }, [classId]);

  const loadRiskStudents = useCallback(async () => {
    setLoadingRisk(true);
    setRiskError("");
    try {
      const result = await fetchTeacherDashboardStats({
        classId: riskClassFilter === "all" ? undefined : riskClassFilter,
        limit: 1,
      });
      setRiskStudents(result?.data?.atRiskStudents || []);
    } catch (loadError) {
      setRiskStudents([]);
      setRiskError(loadError.message || "Không thể tải cảnh báo chuyên cần.");
    } finally {
      setLoadingRisk(false);
    }
  }, [riskClassFilter]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    loadGradebook();
  }, [loadGradebook]);

  useEffect(() => {
    if (activeView === "alerts") loadRiskStudents();
  }, [activeView, loadRiskStudents]);

  const filteredRiskStudents = useMemo(
    () => riskStudents.filter((student) => riskFilter === "all" || student.riskLevel === riskFilter),
    [riskStudents, riskFilter],
  );

  const attendanceByKey = useMemo(
    () => new Map(gradebook.attendance.map((record) => [`${record.userId}:${record.sessionId}`, record])),
    [gradebook.attendance],
  );

  const scoreByKey = useMemo(
    () => new Map(gradebook.scores.map((record) => [`${record.userId}:${record.activityId}`, record])),
    [gradebook.scores],
  );

  const scopedSessions = useMemo(
    () =>
      selectedSessionId === "all"
        ? gradebook.sessions
        : gradebook.sessions.filter((session) => session.id === selectedSessionId),
    [gradebook.sessions, selectedSessionId],
  );

  const scopedActivities = useMemo(
    () =>
      selectedSessionId === "all"
        ? gradebook.activities
        : gradebook.activities.filter((activity) => activity.sessionId === selectedSessionId),
    [gradebook.activities, selectedSessionId],
  );

  const visibleStudents = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return gradebook.students;
    return gradebook.students.filter((student) =>
      [student.name, student.email].some((value) => String(value || "").toLocaleLowerCase().includes(needle)),
    );
  }, [gradebook.students, search]);

  const selectedClass = classes.find((item) => String(item.id) === classId);

  const getAttendanceSummary = (studentId) => {
    const records = scopedSessions.map((session) => attendanceByKey.get(`${studentId}:${session.id}`)).filter(Boolean);
    if (selectedSessionId !== "all") return records[0] || null;
    const present = records.filter((record) => record.status === "present").length;
    const recorded = records.length;
    return { present, recorded, rate: recorded ? Math.round((present / recorded) * 100) : null };
  };

  const getScoreSummary = (studentId) => {
    const rows = scopedActivities.map((activity) => ({ activity, record: scoreByKey.get(`${studentId}:${activity.id}`) }));
    const graded = rows.filter(
      ({ record }) =>
        Boolean(record) &&
        record.score !== null &&
        record.score !== undefined &&
        (record.status === "graded" || record.type === "quiz"),
    );
    const ratios = graded
      .map(({ activity, record }) => {
        const maxScore = record.maxScore ?? activity.maxScore;
        return maxScore > 0 ? (record.score / maxScore) * 100 : null;
      })
      .filter((value) => value !== null);
    return {
      rows,
      gradedCount: graded.length,
      average: ratios.length ? Math.round(ratios.reduce((sum, value) => sum + value, 0) / ratios.length) : null,
    };
  };

  if (loadingClasses) {
    return <Loading loading text="Đang tải sổ theo dõi học viên..." fullScreen={false} className="min-h-[60vh] py-16" />;
  }

  if (error && !classId) {
    return (
      <div className="mx-auto max-w-xl py-12">
        <ErrorState title="Chưa thể mở sổ theo dõi" message={error} onRetry={loadClasses} />
      </div>
    );
  }

  if (!classes.length) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState
          icon={Users}
          title="Chưa có lớp phụ trách"
          description="Khi được phân công lớp, điểm, quiz và chuyên cần của học viên sẽ xuất hiện ở đây."
        />
      </div>
    );
  }

  return (
    <div className="min-h-full px-3 pb-12 pt-3 sm:px-5 lg:px-6 text-slate-900 dark:text-slate-100 space-y-6">
      {/* ── Calligraphy Hero Banner ────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-5 sm:p-6 backdrop-blur-xl shadow-[0_12px_35px_rgba(49,91,125,0.08)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#1a446c]/10 text-[#102f63] dark:text-sky-300 border border-[#1a446c]/20 mb-2">
              <span className="w-2 h-2 rounded-full bg-[#1a446c] dark:bg-sky-400 animate-pulse" />
              <span>Khu Vực Giảng Viên · Sổ Theo Dõi & Điểm Số</span>
            </div>
            <h1 className="font-['Dancing_Script'] text-3xl sm:text-4xl font-bold tracking-tight text-[#102f63] dark:text-sky-200">
              Điểm Số, Chuyên Cần & Tiến Độ Học Viên
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium italic">
              “Tri thức là sức mạnh, kiên trì là hành trang, tận tâm là đạo làm thầy.”
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Oriental calligraphy watermark pill */}
            <div className="hidden xl:flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl bg-white/60 dark:bg-slate-800/60 border border-white/80 dark:border-slate-700 font-['Ma_Shan_Zheng'] text-base text-[#102f63]/80 dark:text-sky-300/80 tracking-widest select-none shadow-2xs">
              博 学 笃 志 · 切 问 近 思
            </div>

            {activeView === "overview" && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Course Filter Dropdown */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Khóa:</span>
                  <select
                    aria-label="Lọc khóa học"
                    value={courseFilter}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCourseFilter(next);
                      setClassId(String(classes.find((c) => !next || String(c.courseId) === next)?.id || ""));
                      setSelectedSessionId("all");
                    }}
                    className="rounded-2xl border border-white/90 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-sky-300 dark:text-white shadow-2xs"
                  >
                    <option value="">Tất cả khóa</option>
                    {[...new Map(classes.filter((c) => c.courseId).map((c) => [String(c.courseId), c])).values()].map((c) => (
                      <option key={c.courseId} value={c.courseId}>{c.courseTitle || c.courseId}</option>
                    ))}
                  </select>
                </div>

                {/* Class Filter Dropdown */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Lớp:</span>
                  <select
                    value={classId}
                    onChange={(event) => { setClassId(event.target.value); setSelectedSessionId("all"); }}
                    className="min-w-[11rem] sm:min-w-[13rem] rounded-2xl border border-white/90 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-sky-300 dark:text-white shadow-2xs"
                  >
                    {classes.filter((c) => !courseFilter || String(c.courseId) === courseFilter).map((item) => (
                      <option key={item.id} value={item.id}>{item.title}{item.courseTitle ? ` · ${item.courseTitle}` : ""}</option>
                    ))}
                  </select>
                </div>

                {/* Export Buttons */}
                <div className="flex items-center gap-1.5 pl-1">
                  <a
                    href={gradebookExportUrl({ classId, courseId: gradebook.classInfo?.courseId || selectedClass?.courseId, sessionId: selectedSessionId, format: "xlsx" })}
                    className="inline-flex h-[34px] items-center gap-1.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3 text-xs font-bold text-white shadow-sm hover:from-emerald-700 hover:to-teal-700 transition"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" /> Xuất XLSX
                  </a>
                  <a
                    href={gradebookExportUrl({ classId, courseId: gradebook.classInfo?.courseId || selectedClass?.courseId, sessionId: selectedSessionId, format: "csv" })}
                    className="inline-flex h-[34px] items-center gap-1 rounded-2xl border border-white/90 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 px-3 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs hover:bg-white dark:hover:bg-slate-800 transition"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-500" /> CSV
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── View Tab Switcher ──────────────────────────────────── */}
      <div className="flex items-center gap-2" role="tablist" aria-label="Mục điểm và chuyên cần">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "overview"}
          onClick={() => setActiveView("overview")}
          className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition shadow-2xs ${
            activeView === "overview"
              ? "bg-[#1a446c] text-white shadow-md shadow-[#1a446c]/20"
              : "border border-white/80 dark:border-slate-800 bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white backdrop-blur-md"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>Tổng quát điểm & chuyên cần</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeView === "alerts"}
          onClick={() => setActiveView("alerts")}
          className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition shadow-2xs ${
            activeView === "alerts"
              ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
              : "border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100/70 backdrop-blur-md"
          }`}
        >
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span>Cảnh báo chuyên cần</span>
          {riskStudents.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
              {riskStudents.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Active Tab Content ─────────────────────────────────── */}
      {activeView === "alerts" ? (
        <div role="tabpanel" aria-label="Cảnh báo chuyên cần">
          {riskError ? (
            <ErrorState title="Không thể tải cảnh báo" message={riskError} onRetry={loadRiskStudents} />
          ) : loadingRisk ? (
            <Loading loading text="Đang tổng hợp cảnh báo học viên..." fullScreen={false} className="py-16" />
          ) : (
            <TeacherRiskStudentsSection
              filteredRiskStudents={filteredRiskStudents}
              classFilter={riskClassFilter}
              setClassFilter={setRiskClassFilter}
              classOptions={classes}
              riskFilter={riskFilter}
              setRiskFilter={setRiskFilter}
            />
          )}
        </div>
      ) : error ? (
        <ErrorState title="Không thể tải dữ liệu lớp" message={error} onRetry={loadGradebook} />
      ) : loadingGradebook ? (
        <Loading loading text="Đang tổng hợp chuyên cần và điểm theo buổi..." fullScreen={false} className="py-16" />
      ) : (
        <div className="space-y-6">
          {/* Gradebook Policy Panel */}
          <GradebookPolicyPanel
            key={classId + ":" + selectedSessionId}
            classId={classId}
            sessionId={selectedSessionId}
            search={search}
          />

          {/* Chi tiết theo buổi & Danh sách học viên */}
          <section className="relative overflow-hidden rounded-3xl border border-white/80 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl p-5 sm:p-6 shadow-[0_12px_35px_rgba(49,91,125,0.08)] space-y-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200/80 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-950 dark:text-white">
                  Chi Tiết Theo Từng Buổi Học
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Quiz và bài tập hiện kết quả ngay cho học viên và cũng được tổng hợp ở đây để giáo viên theo dõi, chấm sửa trực tiếp.
                </p>
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row items-center">
                <label className="sr-only" htmlFor="session-filter">Lọc theo buổi học</label>
                <select
                  id="session-filter"
                  value={selectedSessionId}
                  onChange={(event) => setSelectedSessionId(event.target.value)}
                  className="w-full sm:w-auto rounded-2xl border border-white/90 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-sky-300 shadow-2xs"
                >
                  <option value="all">Tất cả buổi học</option>
                  {gradebook.sessions.map((session) => (
                    <option key={session.id} value={session.id}>{formatSession(session)}</option>
                  ))}
                </select>

                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Tìm tên, email học viên..."
                    className="w-full rounded-2xl border border-white/90 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 py-2 pl-9 pr-3 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-sky-300 shadow-2xs"
                  />
                </div>
              </div>
            </div>

            {visibleStudents.length === 0 ? (
              <div className="py-6">
                <EmptyState
                  icon={Users}
                  title="Không tìm thấy học viên"
                  description="Thử đổi từ khóa tìm kiếm hoặc chọn lớp khác."
                />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 shadow-2xs">
                <table className="w-full min-w-[850px] text-left text-xs">
                  <thead className="bg-[#1a446c]/5 text-[10px] font-black uppercase tracking-wider text-[#102f63] dark:text-sky-300 border-b border-slate-200/80 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3.5">Học viên</th>
                      <th className="px-4 py-3.5">Điểm danh vào lớp</th>
                      <th className="px-4 py-3.5">Trung bình bài đã chấm</th>
                      <th className="px-4 py-3.5">Chi tiết bài / quiz</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/90 dark:divide-slate-800">
                    {visibleStudents.map((student) => {
                      const attendance = getAttendanceSummary(student.id);
                      const score = getScoreSummary(student.id);
                      const sessionAttendance = selectedSessionId !== "all" ? attendance : null;

                      return (
                        <tr key={student.id} className="align-top hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                          {/* Student Info */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-sky-400 to-indigo-500 font-bold text-white text-xs shadow-2xs">
                                {student.avatar ? (
                                  <img src={student.avatar} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  student.name.slice(0, 1).toUpperCase()
                                )}
                              </span>
                              <div>
                                <p className="font-bold text-slate-900 dark:text-white">{student.name}</p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{student.email}</p>
                                {scopedActivities.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setAccommodationTarget({ student, activity: scopedActivities[0] })}
                                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#1a446c] hover:underline dark:text-sky-400"
                                  >
                                    <SlidersHorizontal className="h-3 w-3" /> Hỗ trợ riêng
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Attendance Rate / Session Attendance */}
                          <td className="px-4 py-3.5">
                            {selectedSessionId === "all" ? (
                              <>
                                <p className="font-bold text-slate-900 dark:text-white text-sm">
                                  {attendance?.rate ?? "—"}{attendance?.rate !== null ? "%" : ""}
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                  Có mặt {attendance?.present || 0}/{attendance?.recorded || 0} buổi đã điểm danh
                                </p>
                              </>
                            ) : sessionAttendance ? (
                              <>
                                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${attendanceLabel[sessionAttendance.status]?.cls || "bg-slate-100 text-slate-600"}`}>
                                  {attendanceLabel[sessionAttendance.status]?.text || sessionAttendance.status}
                                </span>
                                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                  Điểm danh lúc {formatCheckedAt(sessionAttendance.checkedAt)}
                                </p>
                              </>
                            ) : (
                              <span className="text-slate-400 font-medium">Chưa điểm danh</span>
                            )}
                          </td>

                          {/* Graded Average */}
                          <td className="px-4 py-3.5">
                            <p className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white text-sm">
                              <BarChart3 className="h-4 w-4 text-[#1a446c] dark:text-sky-400" />
                              {score.average === null ? "Chưa có điểm" : `${score.average}%`}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              Đã có điểm {score.gradedCount}/{score.rows.length} hoạt động
                            </p>
                          </td>

                          {/* Activities & Quiz Scores */}
                          <td className="px-4 py-3.5">
                            <div className="max-w-sm space-y-1.5">
                              {score.rows.length === 0 ? (
                                <span className="text-slate-400">Không có bài hoặc quiz trong phạm vi này</span>
                              ) : (
                                score.rows.map(({ activity, record }) => {
                                  const maxScore = record?.maxScore ?? activity.maxScore ?? 10;
                                  const hasScore = record?.score !== null && record?.score !== undefined;

                                  return (
                                    <div
                                      key={activity.id}
                                      className="group flex items-center justify-between gap-2.5 rounded-xl bg-white/80 dark:bg-slate-950/70 border border-slate-200/60 dark:border-slate-800/80 px-2.5 py-1.5 transition hover:border-sky-300 shadow-2xs"
                                    >
                                      <span className="min-w-0 truncate font-semibold text-slate-700 dark:text-slate-200">
                                        {activity.type === "quiz" ? "Quiz" : "Bài tập"}: {activity.title}
                                      </span>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => setEditingScoreTarget({ classId, student, activity, record })}
                                          className={`rounded-lg px-2 py-0.5 font-black text-xs transition ${
                                            hasScore
                                              ? "text-emerald-700 bg-emerald-500/15 border border-emerald-500/25 dark:text-emerald-300"
                                              : record
                                              ? "text-amber-700 bg-amber-500/15 border border-amber-500/25 dark:text-amber-300"
                                              : "text-slate-400 bg-slate-100 dark:bg-slate-800"
                                          }`}
                                          title="Bấm để sửa điểm"
                                        >
                                          {hasScore
                                            ? `${record.score}${maxScore ? `/${maxScore}` : ""}`
                                            : record
                                            ? "Chờ chấm"
                                            : "Chưa nộp"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingScoreTarget({ classId, student, activity, record })}
                                          className="inline-flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-[11px] font-bold text-[#1a446c] hover:bg-[#1a446c]/10 dark:text-sky-400 dark:hover:bg-sky-950/60 transition"
                                          title="Sửa điểm học viên"
                                        >
                                          <Pencil className="h-3 w-3" />
                                          <span className="hidden sm:inline">Sửa</span>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Thời điểm điểm danh là dữ liệu đã được giáo viên chốt cho buổi học.
              </span>
              <Link
                to={`/lms/teach/classes/${classId}`}
                className="font-bold text-[#1a446c] hover:underline dark:text-sky-400"
              >
                Mở không gian lớp →
              </Link>
            </div>
          </section>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────── */}
      {accommodationTarget && (
        <AccommodationModal
          student={accommodationTarget.student}
          activities={scopedActivities.length ? scopedActivities : gradebook.activities}
          initialActivity={accommodationTarget.activity}
          onClose={() => setAccommodationTarget(null)}
          onSaved={() => {
            setAccommodationTarget(null);
            loadGradebook();
          }}
        />
      )}

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
    </div>
  );
}
