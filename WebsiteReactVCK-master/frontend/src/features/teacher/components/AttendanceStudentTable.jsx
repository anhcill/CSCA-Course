import { useState, useMemo } from "react";
import PropTypes from "prop-types";
import { Check, CheckCircle2, Clock, Search, XCircle } from "lucide-react";
import { getAvatarUrl, handleAvatarError } from "../../../utils/avatar";

export default function AttendanceStudentTable({
  students = [],
  attendanceRecords = {},
  onStatusChange,
  onNoteChange,
  readOnly = false,
}) {
  const [search, setSearch] = useState("");

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const name = (s.username || s.name || "").toLowerCase();
      const email = (s.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [students, search]);

  return (
    <div className="space-y-3">
      {/* Search Input Filter for Roster */}
      {students.length > 5 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm học viên theo tên, email..."
            aria-label="Tìm kiếm học viên"
            className="w-full rounded-xl border border-white/80 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 pl-9 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-500/10 shadow-2xs"
          />
        </div>
      )}

      {/* Table Container */}
      <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#edf6fd]/80 dark:bg-slate-800/80 border-b border-sky-100 dark:border-slate-700/60 text-[11px] font-black uppercase tracking-wider text-[#102f63] dark:text-sky-200">
              <th className="py-3 px-3 w-12 text-center">STT</th>
              <th className="py-3 px-4 min-w-[200px]">Học Viên</th>
              <th className="py-3 px-4 w-72 text-center">Trạng Thái Điểm Danh</th>
              <th className="py-3 px-4 min-w-[220px]">Ghi Chú Giảng Viên</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  Không tìm thấy học viên nào khớp với &quot;{search}&quot;.
                </td>
              </tr>
            ) : (
              filteredStudents.map((student, idx) => {
                const record = attendanceRecords[student.id] || { status: "present", note: "" };
                const displayName = student.username || student.name || student.email || "Học viên";

                return (
                  <tr
                    key={student.id}
                    className="hover:bg-sky-50/40 dark:hover:bg-slate-800/40 transition duration-150"
                  >
                    {/* STT */}
                    <td className="py-3.5 px-3 text-center text-xs font-mono font-bold text-slate-400 dark:text-slate-500">
                      {idx + 1}
                    </td>

                    {/* Student Info */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={getAvatarUrl(student)}
                          onError={handleAvatarError}
                          alt={displayName}
                          className="w-9 h-9 rounded-full object-cover border-2 border-white dark:border-slate-700 shadow-2xs shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-black text-[#102f63] dark:text-white text-xs sm:text-sm truncate">
                            {displayName}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                            {student.email}
                          </p>
                          {student.attendance_source === "student" && (
                            <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded-md">
                              <Check className="h-2.5 w-2.5" /> Học viên tự báo có mặt
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 3 Status Segmented Button */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex bg-slate-100/90 dark:bg-slate-950/80 p-1 rounded-2xl border border-slate-200/80 dark:border-slate-800 gap-1 shadow-2xs">
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => onStatusChange(student.id, "present")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-60 ${
                            record.status === "present"
                              ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                              : "text-slate-600 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                          }`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Có mặt
                        </button>
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => onStatusChange(student.id, "absent")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-60 ${
                            record.status === "absent"
                              ? "bg-rose-600 text-white shadow-sm shadow-rose-600/30"
                              : "text-slate-600 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-300"
                          }`}
                        >
                          <XCircle className="h-3 w-3" />
                          Vắng
                        </button>
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => onStatusChange(student.id, "excused")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-60 ${
                            record.status === "excused"
                              ? "bg-amber-600 text-white shadow-sm shadow-amber-600/30"
                              : "text-slate-600 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-300"
                          }`}
                        >
                          <Clock className="h-3 w-3" />
                          Có phép
                        </button>
                      </div>
                    </td>

                    {/* Note input */}
                    <td className="py-3.5 px-4">
                      <input
                        type="text"
                        placeholder="Ghi chú (VD: Vào muộn 10p, có phép...)"
                        value={record.note || ""}
                        disabled={readOnly}
                        onChange={(e) => onNoteChange(student.id, e.target.value)}
                        className="w-full bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-500/10 disabled:cursor-not-allowed disabled:opacity-60 placeholder:text-slate-400"
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

AttendanceStudentTable.propTypes = {
  students: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      username: PropTypes.string,
      name: PropTypes.string,
      email: PropTypes.string,
      avatar_url: PropTypes.string,
      attendance_status: PropTypes.string,
      attendance_note: PropTypes.string,
      attendance_source: PropTypes.string,
    })
  ),
  attendanceRecords: PropTypes.object,
  onStatusChange: PropTypes.func.isRequired,
  onNoteChange: PropTypes.func.isRequired,
  readOnly: PropTypes.bool,
};
