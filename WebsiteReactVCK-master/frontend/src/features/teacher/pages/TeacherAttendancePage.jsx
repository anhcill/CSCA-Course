import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { fetchAttendanceRoster, fetchMyLiveSchedule, markAttendance } from "../../api/lmsClient";
import { LoadingState, EmptyState, ErrorState } from "../../../components/common/StateView";


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
      if (res.success && res.data && res.data.length > 0) {
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
      setAttendanceRecords(Object.fromEntries(roster.map((student) => [student.id, {
        userId: student.id,
        status: student.attendance_status || "present",
        note: student.attendance_note || "",
      }])));
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

  const selectedSession = useMemo(() => {
    return sessions.find((s) => String(s.id) === String(selectedSessionId)) || sessions[0] || null;
  }, [sessions, selectedSessionId]);

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
        toast.success("Đã lưu kết quả điểm danh học viên thành công! 🎉", {
          duration: 3500,
        });
      } else {
        toast.error(res.message || "Lỗi khi lưu điểm danh!");
      }
    } catch (err) {
      console.error("Error saving attendance:", err);
      toast.error(err?.message || "Không thể lưu điểm danh. Vui lòng thử lại.", {
        duration: 3500,
      });
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

    const rate = total > 0 ? Math.round(((present + excused * 0.5) / total) * 100) : 0;

    return { total, present, absent, excused, rate };
  }, [attendanceRecords, students.length]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* Header Bar */}
      <div className="bg-slate-900 border-b border-slate-800 py-8 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Nghiệp Vụ Giảng Viên • Attendance Management</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              Điểm Danh & Theo Dõi Chuyên Cần
            </h1>
            <p className="text-slate-400 text-xs md:text-sm mt-1">
              Ghi nhận tình trạng tham gia học trực tuyến của học viên, đánh dấu vắng/có phép và lưu hồ sơ lớp học.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/lms/teacher/schedule"
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700"
            >
              ← Về Lịch Dạy
            </Link>

            <button
              onClick={handleSaveAttendance}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/30 flex items-center gap-2"
            >
              <span>💾</span>
              <span>{saving ? "Đang Lưu..." : "Lưu Bảng Điểm Danh"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Session Selector & Quick Info */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl">
          <div className="space-y-1 flex-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              Chọn Buổi Học Trực Tuyến
            </label>
            {sessions.length > 0 ? (
              <select
                value={selectedSessionId}
                onChange={handleSessionChange}
                className="w-full md:max-w-md bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-semibold"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({new Date(s.start_time).toLocaleDateString("vi-VN")})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-slate-500">Chưa có danh sách buổi học nào.</p>
            )}
          </div>

          {selectedSession && (
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 bg-slate-950/70 px-4 py-3 rounded-2xl border border-slate-800">
              <div>
                <span className="text-slate-500 block text-[10px]">Thời gian:</span>
                <span className="font-semibold text-white">
                  {new Date(selectedSession.start_time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} -{" "}
                  {new Date(selectedSession.end_time || selectedSession.start_time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="h-6 w-[1px] bg-slate-800"></div>
              <div>
                <span className="text-slate-500 block text-[10px]">Ngày học:</span>
                <span className="font-semibold text-white">
                  {new Date(selectedSession.start_time).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}
                </span>
              </div>
              <div className="h-6 w-[1px] bg-slate-800"></div>
              <div>
                <span className="text-slate-500 block text-[10px]">Nền tảng:</span>
                <span className="font-semibold text-emerald-400">{selectedSession.provider || "Google Meet"}</span>
              </div>
            </div>
          )}
        </div>

        {/* Metrics Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-white">{stats.total}</p>
            <p className="text-[11px] text-slate-400 font-medium mt-1">Tổng học viên</p>
          </div>
          <div className="bg-slate-900 border border-emerald-500/30 bg-emerald-500/5 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-emerald-400">{stats.present}</p>
            <p className="text-[11px] text-emerald-300 font-medium mt-1">Có mặt</p>
          </div>
          <div className="bg-slate-900 border border-rose-500/30 bg-rose-500/5 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-rose-400">{stats.absent}</p>
            <p className="text-[11px] text-rose-300 font-medium mt-1">Vắng mặt</p>
          </div>
          <div className="bg-slate-900 border border-amber-500/30 bg-amber-500/5 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-amber-400">{stats.excused}</p>
            <p className="text-[11px] text-amber-300 font-medium mt-1">Có phép</p>
          </div>
          <div className="col-span-2 md:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-white font-mono">{stats.rate}%</p>
            <p className="text-[11px] text-slate-400 font-medium mt-1">Tỷ lệ chuyên cần</p>
          </div>
        </div>

        {/* Attendance Main Table Container */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl">
          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-5">
            <div>
              <h2 className="text-lg font-bold text-white">Danh Sách Điểm Danh Học Viên</h2>
              <p className="text-xs text-slate-400">Chọn trạng thái và nhập ghi chú chi tiết cho từng học viên</p>
            </div>

            {/* Bulk Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleMarkAll("present")}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition flex items-center gap-1.5"
              >
                <span>✓</span>
                <span>Tất Cả Có Mặt</span>
              </button>
              <button
                onClick={() => handleMarkAll("absent")}
                className="px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold transition flex items-center gap-1.5"
              >
                <span>✕</span>
                <span>Tất Cả Vắng</span>
              </button>
            </div>
          </div>

          {/* Table */}
          {loadingSessions || loadingRoster ? (
            <LoadingState message="Đang nạp dữ liệu điểm danh..." count={4} />
          ) : errorMsg ? (
            <ErrorState title="Lỗi Nạp Điểm Danh" message={errorMsg} onRetry={loadRoster} />
          ) : students.length === 0 ? (
            <EmptyState title="Không Có Học Viên" message="Chưa có học viên nào đăng ký vào lớp học này." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3 w-12 text-center">STT</th>
                    <th className="py-3 px-4">Học Viên</th>
                    <th className="py-3 px-4 w-72 text-center">Trạng Thái Điểm Danh</th>
                    <th className="py-3 px-4">Ghi Chú Giáo Viên</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {students.map((student, idx) => {
                    const record = attendanceRecords[student.id] || { status: "present", note: "" };

                    return (
                      <tr key={student.id} className="hover:bg-slate-950/40 transition">
                        <td className="py-4 px-3 text-center text-xs font-mono text-slate-500">
                          {idx + 1}
                        </td>

                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-800 border border-slate-700 flex-shrink-0">
                              {student.avatar_url ? (
                                <img src={student.avatar_url} alt={student.username} className="w-full h-full object-cover" />
                              ) : (
                                <span className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-300">
                                  {(student.username || student.email || "?").slice(0, 1).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-white text-sm">{student.username || student.email}</p>
                              <p className="text-xs text-slate-400 font-mono">{student.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* 3 Status Radio Buttons */}
                        <td className="py-4 px-4 text-center">
                          <div className="inline-flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1">
                            <button
                              type="button"
                              onClick={() => handleStatusChange(student.id, "present")}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                record.status === "present"
                                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              Có mặt
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatusChange(student.id, "absent")}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                record.status === "absent"
                                  ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              Vắng
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatusChange(student.id, "excused")}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                record.status === "excused"
                                  ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              Có phép
                            </button>
                          </div>
                        </td>

                        {/* Note input */}
                        <td className="py-4 px-4">
                          <input
                            type="text"
                            placeholder="Nhập ghi chú (VD: Vào muộn 15p, xin nghỉ phép...)"
                            value={record.note}
                            onChange={(e) => handleNoteChange(student.id, e.target.value)}
                            className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Bottom Save Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-800">
            <span className="text-xs text-slate-400 font-mono">
              Đã ghi nhận: <strong className="text-emerald-400">{stats.present}</strong> có mặt •{" "}
              <strong className="text-rose-400">{stats.absent}</strong> vắng •{" "}
              <strong className="text-amber-400">{stats.excused}</strong> có phép
            </span>

            <button
              onClick={handleSaveAttendance}
              disabled={saving}
              className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
            >
              <span>💾</span>
              <span>{saving ? "Đang Lưu Kết Quả..." : "Lưu Bảng Điểm Danh"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
