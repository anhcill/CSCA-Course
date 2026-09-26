import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Clock, PlayCircle } from "lucide-react";

export default function ClassWorkspaceCurriculumTab({
  courseId,
  classId,
  sections = []
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white">Giáo trình bài giảng</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Các chương và bài học được giảng dạy trong khóa học này.</p>
        </div>
        {courseId && (
          <Link
            to={`/lms/courses/${courseId}/classes/${classId}/learn`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
          >
            <PlayCircle className="h-4 w-4" /> Xem với tư cách học viên
          </Link>
        )}
      </div>

      {sections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
          <BookOpen className="mx-auto h-9 w-9 text-slate-400" />
          <p className="mt-3 text-sm font-bold text-slate-800 dark:text-white">Chưa có bài học nào được công bố</p>
          <p className="mt-1 text-xs text-slate-500">Giáo trình khóa học sẽ tự hiển thị khi được hoàn tất cấu hình.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sections.map((sec, idx) => (
            <div
              key={sec.id}
              className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs"
            >
              <span className="text-[10px] font-bold uppercase text-blue-600 dark:text-sky-400 tracking-wider">
                Chương {idx + 1}
              </span>
              <h4 className="mt-1 font-bold text-slate-900 dark:text-white text-sm line-clamp-1">
                {sec.title}
              </h4>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <span>{sec.lesson_count || sec.lessons?.length || 0} bài học</span>
                {sec.duration_seconds && (
                  <span>· {Math.round(sec.duration_seconds / 60)} phút</span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
