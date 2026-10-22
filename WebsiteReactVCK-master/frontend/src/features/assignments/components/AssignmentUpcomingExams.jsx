import { Link } from "react-router-dom";
import { Calendar, CalendarCheck } from "lucide-react";

export default function AssignmentUpcomingExams({ exams = [], onExamClick }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/95 p-3 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100/80">
        <div className="flex items-center gap-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
            <Calendar className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-xs font-bold text-slate-800">
            Lịch kiểm tra sắp tới
          </h3>
        </div>
        <Link
          to="/lms/calendar"
          className="text-[11px] font-semibold text-blue-600 transition hover:text-blue-700 hover:underline"
        >
          Xem toàn bộ &gt;
        </Link>
      </div>

      {/* Danh sách các bài kiểm tra */}
      <div className="mt-2.5 space-y-2">
        {exams.length === 0 ? (
          <div className="py-4 text-center">
            <CalendarCheck className="mx-auto h-5 w-5 text-blue-400 opacity-80" />
            <p className="mt-1.5 text-[11px] font-bold text-slate-700">
              Chưa có lịch kiểm tra mới
            </p>
            <p className="text-[10px] text-slate-400">
              Các bài thi và kiểm tra sắp tới sẽ xuất hiện tại đây
            </p>
          </div>
        ) : (
          exams.map((item) => (
            <div
              key={item.id}
              onClick={() => onExamClick && onExamClick(item)}
              className="group flex items-center justify-between gap-2 text-xs rounded-xl p-1 -mx-1 hover:bg-blue-50/60 transition cursor-pointer"
            >
              {/* Cụm khối ngày & thông tin */}
              <div className="flex items-center gap-2 min-w-0">
                {/* Box Ngày vuông vắn nhỏ gọn */}
                <div className="flex h-8 w-8 flex-col items-center justify-center rounded-lg bg-slate-50 border border-slate-100 shrink-0 group-hover:border-blue-200 transition">
                  <span
                    className={`text-xs font-extrabold leading-none ${
                      item.color === "red" ? "text-rose-600" : "text-blue-600"
                    }`}
                  >
                    {item.dayNum}
                  </span>
                  <span className="mt-0.5 text-[8px] font-bold uppercase text-slate-400 leading-none">
                    {item.monthLabel}
                  </span>
                </div>

                {/* Thông tin bài thi */}
                <div className="min-w-0">
                  <h4
                    className="truncate font-bold text-[11px] text-slate-800 leading-tight group-hover:text-blue-600 transition-colors"
                    title={item.title}
                  >
                    {item.title}
                  </h4>
                  <p
                    className="truncate text-[10px] text-slate-500 leading-tight"
                    title={item.course}
                  >
                    {item.course}
                  </p>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    {item.time}
                  </p>
                </div>
              </div>

              {/* Tag badge (Trực tiếp hoặc Online) */}
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold border whitespace-nowrap ${
                  item.badgeType === "live"
                    ? "border-rose-200 bg-rose-50 text-rose-600"
                    : "border-sky-200 bg-sky-50 text-sky-600"
                }`}
              >
                {item.badge}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
