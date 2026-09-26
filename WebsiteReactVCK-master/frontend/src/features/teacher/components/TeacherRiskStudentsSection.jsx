import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ExternalLink, Filter } from "lucide-react";
import { EmptyState } from "../../../components/common/StateView";

const riskLabel = { danger: "Báo động", warning: "Cần theo dõi" };

const formatRelative = (value) => {
  if (!value) return "Chưa có hoạt động";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có hoạt động";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Vừa cập nhật";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
};

export default function TeacherRiskStudentsSection({
  filteredRiskStudents = [],
  classFilter,
  setClassFilter,
  classOptions = [],
  riskFilter,
  setRiskFilter,
  setPendingPage
}) {
  return (
    <section className="bg-white dark:bg-slate-900/80 border border-amber-200 dark:border-amber-500/30 rounded-3xl p-6 sm:p-8 space-y-5 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-amber-200 dark:border-amber-500/20 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" /> Học viên cần hỗ trợ
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Cảnh báo được tính từ chuyên cần, tiến độ, điểm và bài quá hạn.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={classFilter}
            onChange={(e) => {
              setClassFilter(e.target.value);
              setPendingPage(1);
            }}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
          >
            <option value="all">Tất cả lớp</option>
            {classOptions.map((item) => (
              <option key={item.id} value={item.id}>{item.code || item.title}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
            <Filter className="w-3.5 h-3.5 text-slate-500 ml-1" />
            {[
              ["all", "Tất cả"],
              ["danger", "Báo động"],
              ["warning", "Theo dõi"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRiskFilter(value)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                  riskFilter === value
                    ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredRiskStudents.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Không có cảnh báo trong bộ lọc"
          description="Hiện chưa có học viên nào thỏa điều kiện cảnh báo."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredRiskStudents.map((student) => (
            <article
              key={`${student.classId}-${student.id}`}
              className={`rounded-2xl p-4 border shadow-sm ${
                student.riskLevel === "danger"
                  ? "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-500/30"
                  : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-500/30"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{student.name}</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{student.className}</p>
                </div>
                <span className="text-[10px] uppercase font-black text-amber-700 dark:text-amber-300">
                  {riskLabel[student.riskLevel]}
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-950/80 rounded-xl p-3 mt-3 border border-slate-200/50 dark:border-transparent">
                {student.riskReason || "Cần theo dõi thêm"}
              </p>
              <div className="grid grid-cols-3 gap-2 text-center text-[10px] mt-3">
                <div>
                  <p className="text-slate-500">Điểm</p>
                  <p className="font-mono font-bold text-slate-900 dark:text-white mt-1">{student.gpa === null ? "—" : `${student.gpa}/10`}</p>
                </div>
                <div>
                  <p className="text-slate-500">Chuyên cần</p>
                  <p className="font-mono font-bold text-slate-900 dark:text-white mt-1">{student.attendanceRate || "—"}</p>
                </div>
                <div>
                  <p className="text-slate-500">Vắng</p>
                  <p className="font-mono font-bold text-rose-600 dark:text-rose-300 mt-1">{student.missedSessionsCount}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-4">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Hoạt động: {formatRelative(student.lastActive)}</span>
                <Link
                  to={`/lms/teach/classes/${student.classId}`}
                  className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                >
                  Mở lớp <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
