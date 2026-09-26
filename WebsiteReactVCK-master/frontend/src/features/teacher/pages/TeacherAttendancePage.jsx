import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { fetchAttendanceRoster, fetchMyLiveSchedule, markAttendance } from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { EmptyState, ErrorState } from "../../../components/common/StateView";
import AttendanceSessionHeader from "../components/AttendanceSessionHeader";
import AttendanceStudentTable from "../components/AttendanceStudentTable";

export default function TeacherAttendancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSessionId = searchParams.get("sessionId");

  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId || "");
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState([]);

  // Attendance state: { [userId]: { status: 'present'|'absent'|'excused', note: string } }
  const [attendanceRecords, setAttendanceRecords] = useState({});

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    setErrorMsg("");
    try {
      const res = await fetchMyLiveSchedule();
      if (res?.success && res.data && res.data.length > 0) {
        setSessions(res.data);
        if (!selectedSessionId) {
          setSelectedSessionId(String(res.data[0].id));
        }
      } else {
        setSessions([]);
      }
    } catch (err) {
      console.error("Error loading sessions for attendance:", err);
      setErrorMsg("Không thể tải danh sách buổi học để điểm danh.");
    } finally {
      setLoadingSessions(false);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadRoster = useCallback(async () => {
    if (!selectedSessionId) {
      setStudents([]);
      setAttendanceRecords({});
      return;
    }
    setLoadingRoster(true);
    setErrorMsg("");
    try {
      const res = await fetchAttendanceRoster(selectedSessionId);
      const roster = res.data?.students || [];
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
      setErrorMsg("Không thể tải danh sách học viên của buổi học.");
    } finally {
      setLoadingRoster(false);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const handleSessionChange = (e) => {
    const newId = e.target.value;
    setSelectedSessionId(newId);
    setSearchParams({ sessionId: newId });
  };

  const handleStatusChange = (userId, newStatus) => {
    setAttendanceRecords((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || { userId, note: "" }),
        status: newStatus,
      },
    }));
  };

  const handleNoteChange = (userId, newNote) => {
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
        toast.success("Đã lưu kết quả điểm danh học viên thành công!");
      } else {
        toast.error(res.message || "Lỗi khi lưu điểm danh!");
      }
    } catch (err) {
      toast.error(err?.message || "Không thể lưu điểm danh. Vui lòng thử lại.");
    } finally {
      setSaving(false);
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

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 px-4 py-6 sm:px-6 lg:px-8 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link
          to="/lms/teach"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-sky-400 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Quay lại trang Giảng dạy
        </Link>

        {/* Top Control Bar & Stats */}
        <AttendanceSessionHeader
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onSessionChange={handleSessionChange}
          stats={stats}
        />

        {/* Table & Bulk Actions */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Danh Sách Học Viên</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Đánh dấu trạng thái và ghi chú cho từng học viên.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleMarkAll("present")}
                className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 transition"
              >
                Tất cả có mặt
              </button>
              <button
                type="button"
                onClick={() => handleMarkAll("absent")}
                className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 transition"
              >
                Tất cả vắng
              </button>
            </div>
          </div>

          {loadingRoster ? (
            <Loading loading={true} text="Đang tải danh sách điểm danh..." fullScreen={false} className="py-12" />
          ) : errorMsg ? (
            <ErrorState title="Lỗi điểm danh" message={errorMsg} onRetry={loadRoster} />
          ) : students.length === 0 ? (
            <EmptyState title="Không có học viên" message="Lớp học này chưa có học viên nào được xếp lớp." />
          ) : (
            <AttendanceStudentTable
              students={students}
              attendanceRecords={attendanceRecords}
              onStatusChange={handleStatusChange}
              onNoteChange={handleNoteChange}
            />
          )}

          {/* Bottom Save Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs text-slate-500">
              Có mặt: <strong className="text-emerald-600">{stats.present}</strong> · Vắng: <strong className="text-rose-600">{stats.absent}</strong> · Có phép: <strong className="text-amber-600">{stats.excused}</strong>
            </span>
            <button
              type="button"
              onClick={handleSaveAttendance}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
            >
              <CheckCircle2 className="h-4 w-4" /> {saving ? "Đang lưu..." : "Lưu kết quả điểm danh"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
