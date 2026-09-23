import { Link, useOutletContext, useParams } from "react-router-dom";
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, ClipboardList, FileText, PlayCircle, Trophy } from "lucide-react";

const formatDateTime = (value) => value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "Chưa có thời hạn";
const formatFileSize = (bytes) => {
  const value = Number(bytes) || 0;
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export default function CourseWorkspaceOverviewPage() {
  const { courseId, classId } = useParams();
  const workspace = useOutletContext();
  const { progress = {}, sections = [], classes = [], upcomingSessions = [], assignments = [], quizCount = 0, files = [] } = workspace;
  const basePath = `/lms/courses/${courseId}/classes/${classId}`;
  const pendingAssignments = assignments.filter((item) => ["todo", "late"].includes(item.status));
  const gradedAssignments = assignments.filter((item) => item.score !== null && item.score !== undefined);
  const averageScore = gradedAssignments.length ? (gradedAssignments.reduce((sum, item) => sum + Number(item.score || 0), 0) / gradedAssignments.length).toFixed(1) : null;

  return (
    <div className="space-y-6 pb-10">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Bài học", progress.totalLessons || 0, BookOpen, `${progress.completedLessons || 0} đã hoàn thành`, "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400", `${basePath}/learn`],
          ["Cần làm", pendingAssignments.length, ClipboardList, `${quizCount} bài thi trắc nghiệm`, "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400", `${basePath}/assignments`],
          ["Lịch sắp tới", upcomingSessions.length, CalendarDays, "Buổi live của lớp", "bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400", `${basePath}/schedule`],
          ["Điểm trung bình", averageScore ?? "—", Trophy, "Các bài đã chấm", "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400", `${basePath}/results`],
        ].map(([label, value, Icon, description, tone, to]) => (
          <Link
            key={label}
            to={to}
            className="group rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm dark:shadow-none transition hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-slate-700 hover:shadow-md"
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="h-5 w-5" />
            </span>
            <p className="mt-4 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
            <p className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-300">{label}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm dark:shadow-none">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-950 dark:text-white">Lộ trình bài học</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Chọn chương để tiếp tục học trong lớp hiện tại.</p>
              </div>
              <Link to={`${basePath}/learn`} className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-sky-400 hover:text-blue-800 dark:hover:text-sky-300">
                Mở phòng học <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {sections.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-5 py-8 text-center">
                <BookOpen className="mx-auto h-6 w-6 text-slate-400 dark:text-slate-500" />
                <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-300">Khóa học đang được hoàn thiện</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Giảng viên chưa công bố chương bài học.</p>
              </div>
            ) : (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {sections.map((section, index) => (
                  <Link
                    key={section.id}
                    to={`${basePath}/learn`}
                    className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-4 transition hover:border-blue-200 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-sky-400">Chương {index + 1}</p>
                    <h3 className="mt-2 line-clamp-2 text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-sky-400">{section.title}</h3>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      {section.lesson_count || 0} bài · {Math.max(0, Math.round(Number(section.duration_seconds || 0) / 60))} phút
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm dark:shadow-none">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950 dark:text-white">Buổi học sắp tới</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Lịch của riêng lớp bạn.</p>
              </div>
              <Link to={`${basePath}/schedule`} className="text-xs font-bold text-blue-600 dark:text-sky-400">Xem lịch</Link>
            </div>
            {upcomingSessions.length === 0 ? (
              <p className="mt-5 rounded-xl bg-slate-50 dark:bg-slate-800/40 px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                Chưa có buổi live được xếp.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {upcomingSessions.slice(0, 3).map((session) => (
                  <div key={session.id} className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-805 dark:bg-slate-800/60 p-3">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{session.title}</p>
                    <p className="mt-1 text-xs text-blue-700 dark:text-sky-400">{formatDateTime(session.start_time)}</p>
                  </div>
                ))}
              </div>
            )}
            {classes.length > 1 && <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">Bạn có {classes.length} lớp thuộc khóa học này.</p>}
          </div>
        </aside>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950 dark:text-white">Bài tập gần đây</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Các việc cần hoàn thành trong lớp này.</p>
            </div>
            <Link to={`${basePath}/assignments`} className="text-xs font-bold text-blue-600 dark:text-sky-400">Tất cả</Link>
          </div>
          {assignments.length === 0 ? (
            <p className="mt-5 rounded-xl bg-slate-50 dark:bg-slate-800/40 px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">Chưa có bài tập hoặc quiz được giao.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {assignments.slice(0, 4).map((item) => {
                const destination = item.type === "quiz" ? `${basePath}/quizzes/${item.id}` : `${basePath}/assignments/${item.id}/submit`;
                return (
                  <Link
                    key={`${item.type}-${item.id}`}
                    to={destination}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-3 py-3 transition hover:border-blue-200 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{item.title}</p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {item.status === "graded" ? `Đã chấm: ${item.score}/${item.max_score}` : `Hạn: ${formatDateTime(item.due_date)}`}
                      </p>
                    </div>
                    <PlayCircle className="h-4 w-4 shrink-0 text-blue-600 dark:text-sky-400" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950 dark:text-white">Tài liệu khóa học</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tài liệu giáo viên chia sẻ cho lớp.</p>
            </div>
            <Link to={`${basePath}/files`} className="text-xs font-bold text-blue-600 dark:text-sky-400">Xem tất cả</Link>
          </div>
          {files.length === 0 ? (
            <p className="mt-5 rounded-xl bg-slate-50 dark:bg-slate-800/40 px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">Chưa có tài liệu được công bố.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {files.slice(0, 4).map((file) => (
                <a
                  key={file.id}
                  href={file.downloadUrl || file.download_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-3 py-3 transition hover:border-blue-200 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{file.name}</p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {file.uploadedBy || file.teacherName || "Giảng viên"} · {formatFileSize(file.sizeBytes || file.size_bytes)}
                    </p>
                  </div>
                  <FileText className="h-4 w-4 shrink-0 text-blue-600 dark:text-sky-400" />
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">Tiến độ của bạn</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Đã hoàn thành {progress.completedLessons || 0}/{progress.totalLessons || 0} bài.{" "}
              {gradedAssignments.length ? `Bạn đã có ${gradedAssignments.length} bài được chấm.` : "Điểm và nhận xét sẽ xuất hiện sau khi giáo viên hoàn tất chấm bài."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
