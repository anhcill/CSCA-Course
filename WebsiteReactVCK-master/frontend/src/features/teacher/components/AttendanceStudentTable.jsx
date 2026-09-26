export default function AttendanceStudentTable({
  students = [],
  attendanceRecords = {},
  onStatusChange,
  onNoteChange
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <th className="py-3 px-3 w-12 text-center">STT</th>
            <th className="py-3 px-4">Học Viên</th>
            <th className="py-3 px-4 w-72 text-center">Trạng Thái Điểm Danh</th>
            <th className="py-3 px-4">Ghi Chú Giáo Viên</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
          {students.map((student, idx) => {
            const record = attendanceRecords[student.id] || { status: "present", note: "" };

            return (
              <tr key={student.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/40 transition">
                <td className="py-4 px-3 text-center text-xs font-mono text-slate-400 dark:text-slate-500">
                  {idx + 1}
                </td>

                <td className="py-4 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-shrink-0">
                      {student.avatar_url ? (
                        <img src={student.avatar_url} alt={student.username} className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-300">
                          {(student.username || student.email || "?").slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{student.username || student.email}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{student.email}</p>
                    </div>
                  </div>
                </td>

                {/* 3 Status Radio Buttons */}
                <td className="py-4 px-4 text-center">
                  <div className="inline-flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-1">
                    <button
                      type="button"
                      onClick={() => onStatusChange(student.id, "present")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        record.status === "present"
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      Có mặt
                    </button>
                    <button
                      type="button"
                      onClick={() => onStatusChange(student.id, "absent")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        record.status === "absent"
                          ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      Vắng
                    </button>
                    <button
                      type="button"
                      onClick={() => onStatusChange(student.id, "excused")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        record.status === "excused"
                          ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
                    onChange={(e) => onNoteChange(student.id, e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950/70 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
