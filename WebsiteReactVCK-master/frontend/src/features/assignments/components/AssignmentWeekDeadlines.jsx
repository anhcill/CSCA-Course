import React from "react";
import { Link } from "react-router-dom";
import { Calendar, CheckCircle2 } from "lucide-react";

export default function AssignmentWeekDeadlines({ deadlines = [], onAction }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/95 p-3 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100/80">
        <div className="flex items-center gap-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
            <Calendar className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-xs font-bold text-slate-800">
            Hạn nộp trong tuần này
          </h3>
        </div>
        <Link
          to="/lms/calendar"
          className="text-[11px] font-semibold text-blue-600 transition hover:text-blue-700 hover:underline"
        >
          Xem tất cả &gt;
        </Link>
      </div>

      {/* Timeline danh sách bài tập sắp tới hạn */}
      <div className="relative mt-2.5 space-y-2.5 pl-0.5">
        {/* Đường kẻ dọc nối các mốc timeline */}
        {deadlines.length > 0 && (
          <div className="absolute left-[31px] top-2 bottom-2 w-px bg-slate-200/80" />
        )}

        {deadlines.length === 0 ? (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-500 opacity-80" />
            <p className="mt-1.5 text-[11px] font-bold text-slate-700">
              Không có hạn nộp nào cần xử lý
            </p>
            <p className="text-[10px] text-slate-400">
              Bạn đã hoàn thành các bài tập tuần này!
            </p>
          </div>
        ) : (
          deadlines.map((item) => (
            <div
              key={item.id}
              onClick={() => onAction && onAction(item.rawItem || item, "open")}
              className="group relative flex items-center justify-between gap-2 text-xs rounded-xl p-1 -mx-1 hover:bg-blue-50/60 transition cursor-pointer"
            >
              {/* Cụm ngày & chấm tròn */}
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 text-center shrink-0">
                  <span className="block text-[10px] font-bold text-slate-400 group-hover:text-blue-600 transition-colors">
                    {item.dayLabel}
                  </span>
                  <span className="block text-[10px] font-semibold text-slate-600">
                    {item.dateLabel}
                  </span>
                </div>

                {/* Chấm tròn mốc timeline */}
                <div
                  className={`relative z-10 h-1.5 w-1.5 rounded-full border-2 border-white shadow-xs shrink-0 ${
                    item.isUrgent ? "bg-rose-500 animate-pulse" : "bg-blue-500"
                  }`}
                />

                {/* Thông tin bài tập */}
                <div className="min-w-0">
                  <h4
                    className="truncate font-bold text-[11px] text-slate-800 leading-tight group-hover:text-blue-600 transition-colors"
                    title={item.title}
                  >
                    {item.title}
                  </h4>
                  <p
                    className="truncate text-[10px] text-slate-400 leading-tight"
                    title={item.course}
                  >
                    {item.course}
                  </p>
                </div>
              </div>

              {/* Tag thời gian còn lại */}
              <span
                className={`shrink-0 text-right text-[10px] font-semibold whitespace-nowrap ${
                  item.remaining === "Đã nộp"
                    ? "text-emerald-600"
                    : item.isUrgent
                    ? "text-rose-500 font-bold"
                    : "text-slate-500"
                }`}
              >
                {item.remaining}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
