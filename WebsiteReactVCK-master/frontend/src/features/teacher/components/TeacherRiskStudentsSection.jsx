/* eslint-disable react/prop-types */
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
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/80 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl p-5 sm:p-6 space-y-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)]">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </span>
            <span>Học Viên Cần Hỗ Trợ & Theo Dõi</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Cảnh báo tự động tính từ tỷ lệ chuyên cần, tiến độ học, điểm trung bình và bài nộp quá hạn.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="rounded-xl border border-white/90 dark:border-slate-700 bg-white/90 dark:bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 shadow-2xs outline-none focus:border-sky-300"
          >
            <option value="all">Tất cả lớp phụ trách</option>
            {classOptions.map((item) => (
              <option key={item.id} value={item.id}>{item.code || item.title}</option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-white/80 dark:bg-slate-800/80 border border-white/90 dark:border-slate-700 rounded-xl p-1 shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-slate-400 ml-1" />
            {[
              ["all", "Tất cả"],
              ["danger", "Báo động 🔴"],
              ["warning", "Theo dõi ⚠️"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRiskFilter(value)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                  riskFilter === value
                    ? "bg-[#1a446c] text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
          description="Hiện tất cả học viên đều duy trì chuyên cần và tiến độ học tập ổn định!"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredRiskStudents.map((student) => (
            <article
              key={`${student.classId}-${student.id}`}
              className={`rounded-2xl p-4 border backdrop-blur-md shadow-2xs transition hover:shadow-md ${
                student.riskLevel === "danger"
                  ? "bg-rose-50/70 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-500/30 ring-1 ring-rose-400/20"
                  : "bg-amber-50/70 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-500/30 ring-1 ring-amber-400/20"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{student.name}</h3>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">{student.className}</p>
                </div>
                <span
                  className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full border ${
                    student.riskLevel === "danger"
                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/25"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25"
                  }`}
                >
                  {riskLabel[student.riskLevel]}
                </span>
              </div>

              <p className="text-xs text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-950/80 rounded-xl p-3 mt-3 border border-slate-200/50 dark:border-slate-800">
                {student.riskReason || "Cần theo dõi thêm"}
              </p>

              <div className="grid grid-cols-3 gap-2 text-center text-[10px] mt-3 bg-white/50 dark:bg-slate-900/40 rounded-xl p-2 border border-slate-200/40 dark:border-slate-800/50">
                <div>
                  <p className="text-slate-500">Điểm</p>
                  <p className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">{student.gpa === null ? "—" : `${student.gpa}/10`}</p>
                </div>
                <div>
                  <p className="text-slate-500">Chuyên cần</p>
                  <p className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">{student.attendanceRate || "—"}</p>
                </div>
                <div>
                  <p className="text-slate-500">Vắng</p>
                  <p className="font-mono font-bold text-rose-600 dark:text-rose-400 mt-0.5">{student.missedSessionsCount}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3.5 pt-2 border-t border-slate-200/40 dark:border-slate-800/60">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Hoạt động: {formatRelative(student.lastActive)}</span>
                <Link
                  to={`/lms/teach/support?classId=${student.classId}&studentId=${student.id}`}
                  className="inline-flex items-center gap-1 text-xs text-[#1a446c] dark:text-sky-400 font-bold hover:underline"
                >
                  Theo dõi hỗ trợ <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
