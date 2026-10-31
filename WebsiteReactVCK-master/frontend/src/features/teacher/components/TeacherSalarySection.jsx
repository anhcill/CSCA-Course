
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
  RefreshCw,
  Search,
  ArrowRight,
} from "lucide-react";

export default function TeacherSalarySection({ salaryData, onRefresh, refreshing = false }) {
  const [expandedClassId, setExpandedClassId] = useState(null);
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { summary, classes = [] } = salaryData || {};
  const hourlyRate = Number(summary?.hourlyRate || 0);

  const formatVnd = (amount) => {
    return Number(amount || 0).toLocaleString("vi-VN") + " ₫";
  };

  const toggleClassExpand = (classId) => {
    setExpandedClassId((prev) => (prev === classId ? null : classId));
  };

  // Lọc lớp theo từ khóa tìm kiếm
  const filteredClasses = useMemo(() => {
    if (!searchQuery.trim()) return classes;
    const q = searchQuery.toLowerCase().trim();
    return classes.filter((cls) => {
      const matchTitle = String(cls.title || "").toLowerCase().includes(q);
      const matchCode = String(cls.code || "").toLowerCase().includes(q);
      const matchCourse = String(cls.courseTitle || "").toLowerCase().includes(q);
      return matchTitle || matchCode || matchCourse;
    });
  }, [classes, searchQuery]);

  // Trích xuất các buổi dạy sắp tới để hiển thị ở widget cột phải (tương tự Lịch kiểm tra sắp tới ở bài tập)
  const upcomingTeachingSessions = useMemo(() => {
    const now = Date.now();
    const allSessions = classes.flatMap((cls) =>
      (cls.sessions || []).map((s) => ({
        ...s,
        classCode: cls.code,
        classTitle: cls.title,
        effectiveHourlyRate: cls.effectiveHourlyRate,
        avgDurationHours: cls.avgDurationHours,
      }))
    );

    return allSessions
      .filter((s) => {
        const time = s.startTime ? new Date(s.startTime).getTime() : 0;
        return !s.isCompleted && time >= now - 60 * 60 * 1000;
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 4);
  }, [classes]);

  if (!summary) {
    return null;
  }

  return (
    <div className="space-y-2.5">
      {/* Thanh công cụ điều khiển gọn gàng chuẩn phong cách học viên (Sleek Frosted Pill Bar) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/80 dark:border-slate-800 bg-white/92 dark:bg-slate-900/90 px-3.5 py-2 shadow-[0_6px_25px_rgba(32,78,120,0.06)] dark:shadow-none backdrop-blur-md">
        {/* Cụm huy hiệu bên trái */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 font-mono">
            <Wallet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            Thù lao giảng dạy
          </span>
          <span className="inline-flex items-center gap-1 rounded-xl bg-amber-50 dark:bg-amber-950/50 px-2.5 py-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800">
            <Sparkles className="w-3 h-3 text-amber-500" />
            Tự động tính theo buổi dạy thực tế
          </span>
        </div>

        {/* Cụm đơn giá & tác vụ bên phải */}
        <div className="flex items-center gap-2">
          {hourlyRate > 0 ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/90 dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800/60 shadow-2xs">
              <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase font-mono">Mức lương:</span>
              <span className="text-xs sm:text-sm font-black text-[#102f63] dark:text-emerald-300 font-mono">
                {formatVnd(hourlyRate)}/h
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Chưa thiết lập lương/h</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowFormulaModal(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition"
            title="Xem công thức tính toán"
          >
            <HelpCircle className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span>Công thức</span>
          </button>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-xs transition active:scale-95 disabled:opacity-50"
              title="Cập nhật số liệu"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span>{refreshing ? "Đang tính..." : "Làm mới"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Bố cục 2 cột chuẩn học viên (Cột trái: KPI + Lớp học; Cột phải: Widget tóm tắt & Lịch dạy) */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,1fr)_280px]">
        {/* CỘT TRÁI */}
        <div className="space-y-3 min-w-0">
          {/* 4 Thẻ KPI Chỉ Số Thu Nhập Gọn Gàng */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* KPI 1: Lương tạm tính đã dạy */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-sky-800 text-white p-3.5 shadow-sm border border-white/30 dark:border-white/10 backdrop-blur-md">
              <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 opacity-15 pointer-events-none">
                <Coins className="w-16 h-16 text-white" />
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-100 font-mono">
                  Lương tạm tính
                </span>
                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[8px] font-black bg-white/20 text-white border border-white/30">
                  ĐÃ DẠY
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black tracking-tight leading-tight font-mono">
                {formatVnd(summary.accruedSalary)}
              </p>
              <p className="text-[10px] text-emerald-100/90 mt-1 truncate font-medium">
                {summary.completedSessions} buổi ({summary.completedHours}h đã dạy)
              </p>
            </div>

            {/* KPI 2: Tổng lương dự kiến */}
            <div className="rounded-2xl border border-white/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/90 p-3.5 shadow-[0_6px_25px_rgba(32,78,120,0.06)] dark:shadow-none backdrop-blur-md">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">
                  Lương dự kiến
                </span>
                <TrendingUp className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              </div>
              <p className="text-lg sm:text-xl font-black text-[#102f63] dark:text-white leading-tight font-mono">
                {formatVnd(summary.projectedSalary)}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate font-medium">
                Toàn khóa {summary.totalSessions} buổi ({summary.totalHours}h)
              </p>
            </div>

            {/* KPI 3: Tiến độ buổi dạy */}
            <div className="rounded-2xl border border-white/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/90 p-3.5 shadow-[0_6px_25px_rgba(32,78,120,0.06)] dark:shadow-none backdrop-blur-md">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">
                  Tiến độ buổi dạy
                </span>
                <CalendarCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg sm:text-xl font-black text-[#102f63] dark:text-white leading-tight font-mono">
                  {summary.completedSessions}
                </span>
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">/ {summary.totalSessions} buổi</span>
                <span className="ml-auto text-[10px] font-black text-emerald-700 dark:text-emerald-300 font-mono bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.2 rounded-full">
                  {summary.progressPct}%
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, summary.progressPct))}%` }}
                />
              </div>
            </div>

            {/* KPI 4: Số giờ hoàn thành */}
            <div className="rounded-2xl border border-white/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/90 p-3.5 shadow-[0_6px_25px_rgba(32,78,120,0.06)] dark:shadow-none backdrop-blur-md">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">
                  Giờ giảng dạy
                </span>
                <Clock className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg sm:text-xl font-black text-[#102f63] dark:text-white leading-tight font-mono">
                  {summary.completedHours}
                </span>
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">/ {summary.totalHours} giờ</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate font-medium">
                Còn lại {summary.remainingSessions} buổi chưa diễn ra
              </p>
            </div>
          </div>

          {/* Tiêu đề danh sách lớp & Ô tìm kiếm */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 px-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-[#102f63] dark:text-white flex items-center gap-2">
                Chi tiết thù lao theo từng lớp học
              </h3>
              <span className="inline-flex items-center rounded-full bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 px-2.5 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
                {classes.length} lớp
              </span>
            </div>

            {classes.length > 2 && (
              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm lớp, khóa học..."
                  className="h-8 w-full rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white/90 dark:bg-slate-950/80 pl-9 pr-3 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:border-blue-400 dark:focus:border-sky-500 focus:bg-white dark:focus:bg-slate-900"
                />
              </div>
            )}
          </div>

          {/* Danh sách các thẻ lớp học (Accordion Card) */}
          {filteredClasses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-8 text-center text-xs text-slate-500 dark:text-slate-400 shadow-sm backdrop-blur-md">
              {classes.length === 0
                ? "Hiện bạn chưa được phân công phụ trách lớp học nào."
                : "Không tìm thấy lớp học nào khớp với từ khóa tìm kiếm."}
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredClasses.map((cls) => {
                const isExpanded = expandedClassId === cls.classId;
                const completedCount = cls.completedSessions;
                const totalCount = cls.totalSessions;

                return (
                  <div
                    key={cls.classId}
                    className="group overflow-hidden rounded-2xl border border-white/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/90 shadow-[0_6px_25px_rgba(32,78,120,0.06)] dark:shadow-none backdrop-blur-md transition-all duration-300 hover:border-sky-300 dark:hover:border-sky-600"
                  >
                    {/* Hàng tiêu đề lớp học (Clickable) */}
                    <div
                      onClick={() => toggleClassExpand(cls.classId)}
                      className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-sky-50/40 dark:hover:bg-slate-800/50 transition select-none"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 font-mono">
                            {cls.code}
                          </span>
                          <h4 className="text-sm sm:text-base font-black text-[#102f63] dark:text-white truncate">
                            {cls.title}
                          </h4>
                          {cls.hasCustomRate && (
                            <span className="px-2 py-0.2 rounded-full text-[9px] font-bold bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              Đơn giá riêng
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {cls.courseTitle} · {cls.avgDurationHours}h / buổi · Mức thù lao:{" "}
                          <strong className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                            {formatVnd(cls.effectiveHourlyRate)}/h
                          </strong>
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                        {/* Tiến độ dạy */}
                        <div className="text-left sm:text-right">
                          <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 font-mono">Tiến độ dạy</p>
                          <p className="text-xs sm:text-sm font-black text-[#102f63] dark:text-slate-100">
                            {completedCount} / {totalCount} buổi
                          </p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            ({cls.completedHours}h / {cls.totalHours}h)
                          </p>
                        </div>

                        {/* Lương tạm tính của lớp */}
                        <div className="text-right">
                          <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 font-mono">Lương tạm tính</p>
                          <p className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                            {formatVnd(cls.accruedSalary)}
                          </p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                            Dự kiến: {formatVnd(cls.projectedSalary)}
                          </p>
                        </div>

                        {/* Nút Chevron */}
                        <div className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-sky-100 dark:group-hover:bg-slate-700 group-hover:text-sky-700 dark:group-hover:text-sky-300 transition">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Bảng chi tiết từng buổi học (Khi mở rộng) */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-3 sm:p-4 space-y-2.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs rounded-xl border border-sky-100 dark:border-sky-900/50 bg-sky-50/70 dark:bg-sky-950/30 px-3 py-2">
                          <p className="font-bold text-[#102f63] dark:text-sky-200 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                            <span>Chi tiết từng buổi học ({cls.sessions.length} buổi)</span>
                          </p>
                          <div className="text-[11px] text-[#244866] dark:text-sky-300 font-mono">
                            Công thức: <strong>{cls.avgDurationHours}h × {formatVnd(cls.effectiveHourlyRate)}/h = {formatVnd(Math.round(cls.avgDurationHours * cls.effectiveHourlyRate))}</strong> / buổi đã dạy
                          </div>
                        </div>

                        {cls.sessions.length === 0 ? (
                          <p className="text-xs text-slate-400 dark:text-slate-500 italic py-2 text-center">Chưa có buổi học nào được tạo trong lịch.</p>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-left text-xs">
                              <thead className="bg-slate-50/80 dark:bg-slate-800/80 uppercase font-mono text-[10px] text-slate-400 dark:text-slate-400 font-bold">
                                <tr>
                                  <th className="py-2.5 px-3">#</th>
                                  <th className="py-2.5 px-3">Tên buổi học</th>
                                  <th className="py-2.5 px-3">Thời gian</th>
                                  <th className="py-2.5 px-3 text-center">Thời lượng</th>
                                  <th className="py-2.5 px-3 text-center">Trạng thái</th>
                                  <th className="py-2.5 px-3 text-right">Thù lao buổi dạy</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
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
                                      className={`hover:bg-sky-50/40 dark:hover:bg-slate-800/50 transition ${
                                        sess.isCompleted ? "bg-emerald-50/20 dark:bg-emerald-950/20" : ""
                                      }`}
                                    >
                                      <td className="py-2.5 px-3 font-mono font-bold text-slate-400 dark:text-slate-500">
                                        {sess.sessionNumber}
                                      </td>
                                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white max-w-[200px] truncate">
                                        {sess.title}
                                      </td>
                                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                                        {dateFormatted} {timeFormatted && `(${timeFormatted})`}
                                      </td>
                                      <td className="py-2.5 px-3 text-center font-mono font-bold text-[#102f63] dark:text-slate-200">
                                        {sess.durationHours}h
                                      </td>
                                      <td className="py-2.5 px-3 text-center">
                                        {sess.isCompleted ? (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Đã hoàn thành
                                          </span>
                                        ) : sess.isLive ? (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 animate-pulse">
                                            Đang diễn ra
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
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
                                          <span className="text-slate-400 dark:text-slate-500 text-[11px]">
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

        {/* CỘT PHẢI (Các Card Widget Chuẩn Phong Cách Học Viên) */}
        <div className="space-y-3">
          {/* Widget 1: Tóm tắt định mức thù lao */}
          <div className="rounded-2xl border border-white/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/90 p-3.5 shadow-[0_6px_25px_rgba(32,78,120,0.06)] dark:shadow-none backdrop-blur-md">
            <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                <Coins className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-xs font-bold text-slate-800 dark:text-white">Định mức thù lao</h3>
            </div>

            <div className="mt-3 space-y-2">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Lương giờ tiêu chuẩn</span>
                <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 font-mono">
                  {hourlyRate > 0 ? `${formatVnd(hourlyRate)}/h` : "Chưa đặt"}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 pt-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400 dark:text-slate-500">Đã tích lũy:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">{formatVnd(summary.accruedSalary)}</span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400 dark:text-slate-500">Dự kiến khóa:</span>
                  <span className="font-bold text-[#102f63] dark:text-slate-200 font-mono">{formatVnd(summary.projectedSalary)}</span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400 dark:text-slate-500">Số buổi hoàn thành:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{summary.completedSessions} / {summary.totalSessions} buổi</span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400 dark:text-slate-500">Thời lượng đã dạy:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{summary.completedHours}h / {summary.totalHours}h</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowFormulaModal(true)}
                className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold transition"
              >
                <span>Xem công thức chi tiết</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Widget 2: Buổi dạy sắp tới (Đồng bộ với Lịch kiểm tra sắp tới ở màn học viên) */}
          <div className="rounded-2xl border border-white/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/90 p-3.5 shadow-[0_6px_25px_rgba(32,78,120,0.06)] dark:shadow-none backdrop-blur-md">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                  <Calendar className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-xs font-bold text-slate-800 dark:text-white">Buổi dạy sắp tới</h3>
              </div>
              <Link
                to="/lms/teach/calendar"
                className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 transition hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
              >
                Xem lịch &gt;
              </Link>
            </div>

            <div className="mt-2.5 space-y-2">
              {upcomingTeachingSessions.length === 0 ? (
                <div className="py-4 text-center">
                  <CalendarCheck className="mx-auto h-5 w-5 text-blue-400 opacity-80" />
                  <p className="mt-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">Chưa có buổi dạy kế tiếp</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">Các buổi dạy mới được phân công sẽ hiện tại đây</p>
                </div>
              ) : (
                upcomingTeachingSessions.map((sess) => {
                  const d = sess.startTime ? new Date(sess.startTime) : null;
                  const dayNum = d ? String(d.getDate()).padStart(2, "0") : "--";
                  const monthLabel = d ? `THG ${d.getMonth() + 1}` : "";
                  const timeFormatted = d ? d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "";
                  const estFee = Math.round((sess.avgDurationHours || 2) * (sess.effectiveHourlyRate || hourlyRate));

                  return (
                    <div
                      key={sess.id}
                      className="group flex items-center justify-between gap-2 text-xs rounded-xl p-1 -mx-1 hover:bg-blue-50/60 dark:hover:bg-slate-800/60 transition"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Box Ngày vuông vắn nhỏ gọn */}
                        <div className="flex h-8 w-8 flex-col items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shrink-0 group-hover:border-blue-200 dark:group-hover:border-blue-700 transition">
                          <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400 leading-none">
                            {dayNum}
                          </span>
                          <span className="mt-0.5 text-[8px] font-bold uppercase text-slate-400 dark:text-slate-500 leading-none">
                            {monthLabel}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 dark:text-slate-200 truncate text-[11px] group-hover:text-blue-700 dark:group-hover:text-blue-400">
                            {sess.title}
                          </p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                            {sess.classCode} · {timeFormatted} ({sess.durationHours || 2}h)
                          </p>
                        </div>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-mono shrink-0">
                        +{formatVnd(estFee)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Widget 3: Thẻ châm ngôn sư phạm (Motto Card) */}
          <div className="relative overflow-hidden rounded-2xl border border-white/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_6px_25px_rgba(32,78,120,0.06)] dark:shadow-none backdrop-blur-md">
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 hover:scale-105"
              style={{
                backgroundImage: "url('/student-campus-spring.webp')",
                backgroundPosition: "right 20% center",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/80 to-transparent dark:from-slate-900/95 dark:via-slate-900/80 dark:to-transparent sm:from-white/90 sm:via-white/50 dark:sm:from-slate-900/90 dark:sm:via-slate-900/50" />
            <div className="relative z-10 flex min-h-[95px] flex-col justify-center p-3.5">
              <p className="font-['Dancing_Script',cursive] text-lg font-bold leading-tight text-[#102f63] dark:text-sky-300">
                Truyền lửa tri thức
              </p>
              <p className="font-['Dancing_Script',cursive] text-lg font-bold leading-tight text-[#102f63] dark:text-sky-300">
                Vững bước tương lai
              </p>
              <p className="mt-1 font-['Ma_Shan_Zheng',cursive] text-xs tracking-wider text-slate-600 dark:text-slate-400">
                学而不厌，诲人不倦。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Công Thức Tính Lương */}
      {showFormulaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white/95 dark:bg-slate-900 rounded-2xl max-w-lg w-full p-5 sm:p-6 border border-white/80 dark:border-slate-800 shadow-2xl backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-black text-[#102f63] dark:text-white flex items-center gap-2">
                <Coins className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> Cách tính lương giảng dạy
              </h3>
              <button
                type="button"
                onClick={() => setShowFormulaModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 space-y-1 font-mono text-xs">
                <p className="font-bold text-emerald-800 dark:text-emerald-300">Công thức tính lương tạm thời:</p>
                <p className="text-slate-800 dark:text-slate-200">
                  Lương tạm tính = Số buổi đã hoàn thành × Số giờ của mỗi buổi × Lương theo giờ
                </p>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-bold text-[#102f63] dark:text-white">Ví dụ cụ thể:</h4>
                <ul className="list-disc pl-5 space-y-1 text-xs text-[#244866] dark:text-slate-300">
                  <li>Khóa học có kế hoạch <strong>20 buổi</strong>. Mỗi buổi học kéo dài <strong>2 giờ</strong>.</li>
                  <li>Mức thù lao theo giờ của giảng viên là: <strong>{formatVnd(hourlyRate || 250000)}/h</strong>.</li>
                  <li>Thù lao mỗi buổi dạy = 2 giờ × {formatVnd(hourlyRate || 250000)} = <strong>{formatVnd((hourlyRate || 250000) * 2)}</strong>.</li>
                  <li>Nếu bạn đã dạy được <strong>2 buổi</strong>: Lương tạm tính tích lũy = 2 buổi × {formatVnd((hourlyRate || 250000) * 2)} = <strong>{formatVnd((hourlyRate || 250000) * 4)}</strong>.</li>
                  <li>Tổng lương dự kiến khi hoàn thành đủ 20 buổi = 20 buổi × {formatVnd((hourlyRate || 250000) * 2)} = <strong>{formatVnd((hourlyRate || 250000) * 40)}</strong>.</li>
                </ul>
              </div>

              <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-800 text-[#17365f] dark:text-sky-300 text-xs">
                📌 Khi buổi dạy kết thúc và được xác nhận hoàn thành, hệ thống lập tức tự động cộng dồn thù lao vào bảng lương tạm tính này.
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setShowFormulaModal(false)}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 active:scale-95 transition"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
