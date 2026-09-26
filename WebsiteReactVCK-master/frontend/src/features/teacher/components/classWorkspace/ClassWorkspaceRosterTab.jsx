import { useState, useMemo } from "react";
import { Search, UserCheck, Users } from "lucide-react";

const riskBadge = {
  danger: { label: "Báo động", cls: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 ring-rose-200 dark:ring-rose-800" },
  warning: { label: "Cần chú ý", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 ring-amber-200 dark:ring-amber-800" },
  good: { label: "Ổn định", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800" },
};

export default function ClassWorkspaceRosterTab({ students = [] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      const matchSearch = !q || [s.name, s.fullName, s.email, s.username].filter(Boolean).some((txt) => txt.toLowerCase().includes(q));
      const matchFilter = filter === "all" || s.riskLevel === filter;
      return matchSearch && matchFilter;
    });
  }, [students, search, filter]);

  return (
    <div className="space-y-4">
      {/* Search & Filter toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên hoặc email học viên..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold">
          {[
            ["all", "Tất cả học viên"],
            ["danger", "Báo động"],
            ["warning", "Cần chú ý"],
            ["good", "Ổn định"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-xl px-3 py-1.5 transition ${
                filter === id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Roster table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        {filteredStudents.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-bold text-slate-800 dark:text-white">Không tìm thấy học viên phù hợp</p>
            <p className="mt-1 text-xs text-slate-500">Thử tìm kiếm với từ khóa khác.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-[11px] font-bold uppercase text-slate-400 dark:text-slate-500">
              <tr>
                <th className="py-3 px-4">Học viên</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4 text-center">Chuyên cần</th>
                <th className="py-3 px-4 text-center">Bài đã nộp</th>
                <th className="py-3 px-4 text-right">Tình trạng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300">
              {filteredStudents.map((st) => {
                const badge = riskBadge[st.riskLevel] || riskBadge.good;
                return (
                  <tr key={st.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-sky-300 font-black text-[11px]">
                        {(st.fullName || st.name || st.username || "U")[0].toUpperCase()}
                      </span>
                      <span>{st.fullName || st.name || st.username}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{st.email || "—"}</td>
                    <td className="py-3 px-4 text-center font-bold">
                      <span className={(st.attendanceRate || 0) < 70 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>
                        {st.attendanceRate ?? "—"}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {st.completedAssignments ?? 0} bài
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
