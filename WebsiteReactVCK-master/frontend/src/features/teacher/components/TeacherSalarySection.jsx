/* eslint-disable react/prop-types */
import { useState } from "react";
import {
  Wallet,
  TrendingUp,
  Clock,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Coins,
  CheckCircle2,
  Calendar,
  AlertCircle,
  HelpCircle,
  Sparkles,
} from "lucide-react";

export default function TeacherSalarySection({ salaryData, onRefresh, refreshing = false }) {
  const [expandedClassId, setExpandedClassId] = useState(null);
  const [showFormulaModal, setShowFormulaModal] = useState(false);

  if (!salaryData || !salaryData.summary) {
    return null;
  }

  const { summary, classes = [] } = salaryData;
  const hourlyRate = Number(summary.hourlyRate || 0);

  const formatVnd = (amount) => {
    return Number(amount || 0).toLocaleString("vi-VN") + " ₫";
  };

  const toggleClassExpand = (classId) => {
    setExpandedClassId((prev) => (prev === classId ? null : classId));
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-200/90 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40 dark:from-slate-900 dark:via-slate-900/95 dark:to-emerald-950/20 p-4 sm:p-5 shadow-sm transition-all duration-300">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-100 dark:border-slate-800 pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-mono">
              <Wallet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Bảng Lương & Thù Lao Giảng Dạy
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100/80 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              <Sparkles className="w-2.5 h-2.5" /> Tạm tính theo buổi dạy thực tế
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-950 dark:text-white flex items-center gap-2">
            Theo dõi lương giảng viên
            <button
              type="button"
              onClick={() => setShowFormulaModal(true)}
              className="text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition"
              title="Xem công thức tính toán"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {hourlyRate > 0 ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/90 dark:bg-slate-800 border border-emerald-200/80 dark:border-emerald-800/60 shadow-xs">
              <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <div className="text-left">
                <p className="text-[10px] uppercase font-bold text-slate-400 font-mono leading-none">Mức lương giờ</p>
                <p className="text-xs sm:text-sm font-black text-emerald-700 dark:text-emerald-300 leading-tight">
                  {formatVnd(hourlyRate)}/h
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Chưa thiết lập lương theo giờ</span>
            </div>
          )}

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 transition"
              title="Cập nhật lại số liệu"
            >
              {refreshing ? "Đang tính..." : "Làm mới"}
            </button>
          )}
        </div>
      </div>

      {/* Main KPI Highlight Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 my-3.5">
        {/* Card 1: Lương tạm tính hiện tại */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-3.5 shadow-md shadow-emerald-600/20 col-span-2 sm:col-span-1">
          <div className="absolute right-0 top-0 translate-x-3 -translate-y-3 opacity-15 pointer-events-none">
            <Coins className="w-24 h-24 text-white" />
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-100 font-mono">
              Lương tạm thời tích lũy
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/20 text-white">
              ĐÃ DẠY
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
            {formatVnd(summary.accruedSalary)}
          </p>
          <p className="text-[11px] text-emerald-100/90 mt-1 flex items-center gap-1 truncate">
            <span>Dựa trên {summary.completedSessions} buổi ({summary.completedHours}h đã dạy)</span>
          </p>
        </div>

        {/* Card 2: Lương dự kiến toàn khóa */}
        <div className="rounded-2xl bg-white/95 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 p-3 sm:p-3.5 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">
              Tổng lương dự kiến
            </span>
            <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
            {formatVnd(summary.projectedSalary)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            Toàn khóa {summary.totalSessions} buổi ({summary.totalHours}h)
          </p>
        </div>

        {/* Card 3: Số buổi đã dạy / Tổng buổi */}
        <div className="rounded-2xl bg-white/95 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 p-3 sm:p-3.5 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">
              Tiến độ buổi dạy
            </span>
            <CalendarCheck className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
              {summary.completedSessions}
            </span>
            <span className="text-xs font-bold text-slate-400">/ {summary.totalSessions} buổi</span>
            <span className="ml-auto text-[11px] font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {summary.progressPct}%
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, summary.progressPct))}%` }}
            />
          </div>
        </div>

        {/* Card 4: Tổng số giờ giảng dạy */}
        <div className="rounded-2xl bg-white/95 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 p-3 sm:p-3.5 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">
              Số giờ đã hoàn thành
            </span>
            <Clock className="w-3.5 h-3.5 text-violet-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
              {summary.completedHours}
            </span>
            <span className="text-xs font-bold text-slate-400">/ {summary.totalHours} giờ</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            Còn lại {summary.remainingSessions} buổi chưa diễn ra
          </p>
        </div>
      </div>

      {/* Classes Breakdown Table */}
      <div className="mt-3.5 space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5">
            <span>Chi tiết thù lao theo từng lớp học</span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">({classes.length} lớp)</span>
          </p>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Nhấn vào lớp để xem chi tiết từng buổi học
          </span>
        </div>

        {classes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500">
            Hiện bạn chưa được gán phụ trách lớp học nào.
          </div>
        ) : (
          <div className="space-y-2">
            {classes.map((cls) => {
              const isExpanded = expandedClassId === cls.classId;
              const completedCount = cls.completedSessions;
              const totalCount = cls.totalSessions;

              return (
                <div
                  key={cls.classId}
                  className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 overflow-hidden shadow-2xs transition"
                >
                  {/* Class Header Row */}
                  <div
                    onClick={() => toggleClassExpand(cls.classId)}
                    className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition select-none"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-sky-300 border border-blue-200 dark:border-blue-800">
                          {cls.code}
                        </span>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                          {cls.title}
                        </h3>
                        {cls.hasCustomRate && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200">
                            Đơn giá riêng
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {cls.courseTitle} · {cls.avgDurationHours}h / buổi · Mức thù lao:{" "}
                        <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatVnd(cls.effectiveHourlyRate)}/h
                        </strong>
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-6 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                      {/* Số buổi tiến độ */}
                      <div className="text-left sm:text-right">
                        <p className="text-[10px] uppercase font-bold text-slate-400 font-mono">Tiến độ dạy</p>
                        <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                          {completedCount} / {totalCount} buổi
                        </p>
                        <p className="text-[10px] text-slate-400">
                          ({cls.completedHours}h / {cls.totalHours}h)
                        </p>
                      </div>

                      {/* Lương tạm tính của lớp */}
                      <div className="text-right">
                        <p className="text-[10px] uppercase font-bold text-slate-400 font-mono">Lương tạm tính</p>
                        <p className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400">
                          {formatVnd(cls.accruedSalary)}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Dự kiến: {formatVnd(cls.projectedSalary)}
                        </p>
                      </div>

                      {/* Expand Button */}
                      <div className="p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Session Breakdown */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-3 sm:p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <p className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-blue-600" />
                          <span>Chi tiết từng buổi học ({cls.sessions.length} buổi)</span>
                        </p>
                        <div className="text-[11px] text-slate-500">
                          Công thức: <strong>{cls.avgDurationHours}h × {formatVnd(cls.effectiveHourlyRate)}/h = {formatVnd(Math.round(cls.avgDurationHours * cls.effectiveHourlyRate))}</strong> / buổi đã dạy
                        </div>
                      </div>

                      {cls.sessions.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">Chưa có buổi học nào được tạo trong lịch.</p>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
                          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-left text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-800/60 uppercase font-mono text-[10px] text-slate-400 font-bold">
                              <tr>
                                <th className="py-2.5 px-3">#</th>
                                <th className="py-2.5 px-3">Tên buổi học</th>
                                <th className="py-2.5 px-3">Thời gian</th>
                                <th className="py-2.5 px-3 text-center">Thời lượng</th>
                                <th className="py-2.5 px-3 text-center">Trạng thái</th>
                                <th className="py-2.5 px-3 text-right">Thù lao buổi dạy</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                              {cls.sessions.map((sess) => {
                                const startDate = sess.startTime ? new Date(sess.startTime) : null;
                                const dateFormatted = startDate && !Number.isNaN(startDate.getTime())
                                  ? startDate.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
                                  : "Chưa định";
                                const timeFormatted = startDate && !Number.isNaN(startDate.getTime())
                                  ? startDate.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
                                  : "";

                                return (
                                  <tr
                                    key={sess.id}
                                    className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition ${
                                      sess.isCompleted ? "bg-emerald-50/20 dark:bg-emerald-950/10" : ""
                                    }`}
                                  >
                                    <td className="py-2.5 px-3 font-mono font-bold text-slate-400">
                                      {sess.sessionNumber}
                                    </td>
                                    <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white max-w-[200px] truncate">
                                      {sess.title}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                                      {dateFormatted} {timeFormatted && `(${timeFormatted})`}
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                                      {sess.durationHours}h
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      {sess.isCompleted ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                          <CheckCircle2 className="w-2.5 h-2.5" /> Đã hoàn thành
                                        </span>
                                      ) : sess.isLive ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 animate-pulse">
                                          Đang diễn ra
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                          Chưa diễn ra
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono font-black">
                                      {sess.isCompleted ? (
                                        <span className="text-emerald-600 dark:text-emerald-400">
                                          +{formatVnd(sess.earnedAmount)}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 text-[11px]">
                                          Dự kiến: {formatVnd(sess.projectedAmount)}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Formula & Explanation Modal */}
      {showFormulaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Coins className="w-5 h-5 text-emerald-600" /> Cách tính lương giảng dạy
              </h3>
              <button
                type="button"
                onClick={() => setShowFormulaModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 space-y-1.5 font-mono text-xs">
                <p className="font-bold text-emerald-800 dark:text-emerald-300">
                  Công thức tính lương tạm thời:
                </p>
                <p className="text-slate-800 dark:text-slate-200">
                  Lương tạm tính = Số buổi đã hoàn thành × Số giờ của mỗi buổi × Lương theo giờ
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-white">Ví dụ cụ thể:</h4>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>Khóa học có kế hoạch <strong>20 buổi</strong>. Mỗi buổi học kéo dài <strong>2 giờ</strong>.</li>
                  <li>Admin tổng quản lý gán mức lương theo giờ là: <strong>{formatVnd(hourlyRate || 250000)}/h</strong>.</li>
                  <li>Thù lao mỗi buổi dạy = 2 giờ × {formatVnd(hourlyRate || 250000)} = <strong>{formatVnd((hourlyRate || 250000) * 2)}</strong>.</li>
                  <li>Nếu bạn đã dạy được <strong>2 buổi</strong>: Lương tạm tính hiện tại = 2 buổi × {formatVnd((hourlyRate || 250000) * 2)} = <strong>{formatVnd((hourlyRate || 250000) * 4)}</strong>.</li>
                  <li>Tổng lương dự kiến khi hoàn thành đủ 20 buổi = 20 buổi × {formatVnd((hourlyRate || 250000) * 2)} = <strong>{formatVnd((hourlyRate || 250000) * 40)}</strong>.</li>
                </ul>
              </div>

              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 text-xs">
                📌 Khi kết thúc mỗi buổi dạy, hệ thống tự động ghi nhận trạng thái đã hoàn thành và lập tức cộng thù lao vào bảng lương tạm tính này.
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setShowFormulaModal(false)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
