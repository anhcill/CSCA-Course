import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, CheckCircle2, Sparkles } from "lucide-react";

export default function ClassProgressCard({
  percent = 0,
  completedLessons = 0,
  totalLessons = 0,
  basePath = "",
  unitType = "buổi học",
}) {
  const unitLabel = unitType === "lessons" ? "bài học" : "buổi học";

  return (
    <section className="flex flex-col justify-between rounded-3xl border border-white/80 bg-white/90 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md sm:p-6">
      <div>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div>
            <h3 className="text-base sm:text-lg font-black text-[#102f63]">Tiến độ học tập</h3>
            <p className="mt-0.5 text-xs text-[#487291]">Tham gia đầy đủ các buổi học để nắm vững kiến thức trọng tâm.</p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <Sparkles className="h-4 w-4" />
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-white/90 bg-white/70 p-4 shadow-2xs backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-[#244866]">Tiến độ hoàn thành</span>
            <span className="text-sm font-black text-sky-700">{percent}%</span>
          </div>
          <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600 transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-[#487291]">
            <span>Đã học {completedLessons}/{totalLessons} {unitLabel}</span>
            {percent === 100 ? (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Hoàn thành 100%
              </span>
            ) : (
              <span>Còn {Math.max(0, totalLessons - completedLessons)} {unitLabel} chưa học</span>
            )}
          </div>
        </div>

        {basePath && (
          <div className="mt-4">
            <Link
              to={`${basePath}/calendar`}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-50 px-4 py-2.5 text-xs font-bold text-sky-700 transition hover:bg-sky-600 hover:text-white"
            >
              <CalendarDays className="h-4 w-4" /> Xem thời khóa biểu lớp học <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-[#487291]">
        <span>Theo dõi lịch trình các buổi học ở danh sách bên dưới để chuẩn bị bài trước giờ lên lớp.</span>
      </div>
    </section>
  );
}
