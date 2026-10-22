/* eslint-disable react/prop-types */
import React from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, FileText, CheckCircle2, Users, Award, ExternalLink } from "lucide-react";

export default function ScheduleUpcomingEvents({
  events = [],
  onSelectEvent,
  isTeacher = false,
}) {
  // Lọc bài tập hoặc quiz từ events thật trong database
  const assignmentEvents = events.filter(
    (ev) => (ev.eventType === "ASSIGNMENT_DUE" || ev.eventType === "QUIZ_DUE") && ev.due_date
  );

  // Sắp xếp hạn nộp tăng dần (sự kiện gần nhất lên trước)
  const now = Date.now();
  const sortedEvents = [...assignmentEvents].sort(
    (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  );

  // Ưu tiên hiển thị các sự kiện chưa quá hạn hoặc vừa đến hạn gần đây
  const upcomingList = sortedEvents.filter(
    (item) => new Date(item.due_date).getTime() >= now - 24 * 60 * 60 * 1000
  );

  const displayList = upcomingList.length > 0 ? upcomingList.slice(0, 4) : sortedEvents.slice(0, 3);

  return (
    <div className="rounded-3xl border border-white/80 bg-white/95 p-4 shadow-[0_8px_30px_rgba(32,78,120,0.06)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between pb-3">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white">
          {isTeacher ? "Hạn nộp & Bài tập của lớp" : "Sự kiện & Hạn nộp"}
        </h3>
        {isTeacher ? (
          <Link
            to="/lms/teacher/grading"
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition hover:text-blue-700 hover:underline dark:text-sky-400"
          >
            <span>Chấm bài</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <Link
            to="/lms/assignments"
            className="text-xs font-semibold text-blue-600 transition hover:text-blue-700 hover:underline dark:text-sky-400"
          >
            Xem tất cả &gt;
          </Link>
        )}
      </div>

      {/* Danh sách sự kiện thật từ database */}
      {displayList.length === 0 ? (
        <div className="py-6 px-3 text-center rounded-2xl bg-slate-50/60 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700">
          <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-400 mb-1" />
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {isTeacher ? "Không có hạn nộp nào sắp tới" : "Không có hạn nộp sắp tới"}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {isTeacher
              ? "Hiện tại không có bài tập hoặc đề kiểm tra nào cần thu bài."
              : "Bạn đã hoàn thành hoặc chưa có bài tập, bài kiểm tra mới."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayList.map((item, idx) => {
            const isQuiz = item.eventType === "QUIZ_DUE";
            const Icon = isQuiz ? CalendarCheck : FileText;
            const tone = isQuiz
              ? { bg: "bg-rose-50 text-rose-600 border border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-400" }
              : { bg: "bg-blue-50 text-blue-600 border border-blue-200/60 dark:bg-blue-950/40 dark:text-sky-400" };

            const dueDateObj = new Date(item.due_date);
            const isOverdue = dueDateObj.getTime() < now;
            const formattedDate = dueDateObj.toLocaleDateString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });

            const total = Number(item.total_students || 0);
            const submitted = Number(item.submitted_count || 0);
            const graded = Number(item.graded_count || 0);
            const needsGrading = Math.max(0, submitted - graded);

            const content = (
              <div className="flex items-start justify-between gap-3 w-full">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold mt-0.5 ${tone.bg}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h4 className="truncate text-xs font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-sky-400 transition">
                      {item.title}
                    </h4>
                    <p className="truncate text-[10px] text-slate-400">
                      {item.class_title || item.course_title || (isQuiz ? "Bài kiểm tra" : "Bài tập")}
                    </p>

                    {/* Dành cho giáo viên: thống kê số lượng đã nộp / tổng học viên */}
                    {isTeacher && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.2">
                          <Users className="h-2.5 w-2.5 text-slate-400" />
                          Đã nộp: <strong>{submitted}/{total}</strong>
                        </span>

                        {needsGrading > 0 && (
                          <span className="inline-flex items-center gap-0.5 font-bold text-amber-700 bg-amber-50 border border-amber-200/70 rounded px-1.5 py-0.2 dark:bg-amber-950/40 dark:text-amber-300">
                            <Award className="h-2.5 w-2.5" />
                            Cần chấm: {needsGrading}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <span className={`text-[10px] font-bold block ${isOverdue ? "text-rose-500" : "text-slate-600 dark:text-slate-300"}`}>
                    {formattedDate}
                  </span>
                  {isOverdue ? (
                    <span className="text-[9px] font-semibold text-rose-500 uppercase">Hết hạn</span>
                  ) : (
                    <span className="text-[9px] font-semibold text-emerald-600 uppercase">Đang nhận</span>
                  )}
                </div>
              </div>
            );

            if (onSelectEvent) {
              return (
                <button
                  key={`${item.eventType}-${item.id}-${idx}`}
                  type="button"
                  onClick={() => onSelectEvent(item)}
                  className="w-full text-left rounded-2xl p-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent hover:border-slate-100 dark:hover:border-slate-800 group cursor-pointer"
                >
                  {content}
                </button>
              );
            }

            return (
              <Link
                key={`${item.eventType}-${item.id}-${idx}`}
                to={isTeacher ? `/lms/teacher/grading?assignmentId=${item.id}` : "/lms/assignments"}
                className="flex items-center justify-between gap-3 rounded-2xl p-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent hover:border-slate-100 dark:hover:border-slate-800 group"
              >
                {content}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
