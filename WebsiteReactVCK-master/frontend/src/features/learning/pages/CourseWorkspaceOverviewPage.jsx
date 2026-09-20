import { Link, useOutletContext, useParams } from "react-router-dom";
import { BookOpen, CalendarDays, CheckCircle2, ClipboardList, FileText, PlayCircle, Trophy } from "lucide-react";
import { EmptyState } from "../../../components/common/StateView";

const formatDateTime = (value) => value
  ? new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })
  : "Chưa có thời hạn";

const formatFileSize = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export default function CourseWorkspaceOverviewPage() {
  const { courseId } = useParams();
  const workspace = useOutletContext();
  const { course, progress, sections, classes, upcomingSessions, assignments, quizCount, files } = workspace;
  const basePath = `/lms/courses/${courseId}/workspace`;
  const pendingAssignments = assignments.filter((item) => ["todo", "late"].includes(item.status));
  const gradedAssignments = assignments.filter((item) => item.score !== null && item.score !== undefined);
  const averageScore = gradedAssignments.length
    ? (gradedAssignments.reduce((sum, item) => sum + Number(item.score || 0), 0) / gradedAssignments.length).toFixed(1)
    : null;

  return (
    <div className="space-y-6 pb-10">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link to={`${basePath}/learn`} className="rounded-2xl border border-sky-400/15 bg-sky-500/5 p-4 transition hover:border-sky-400/35 hover:bg-sky-500/10">
          <BookOpen className="h-5 w-5 text-sky-300" /><p className="mt-4 text-2xl font-black text-white">{progress.totalLessons}</p><p className="text-xs text-slate-400">Bài học trong khóa</p>
        </Link>
        <Link to={`${basePath}/assignments`} className="rounded-2xl border border-amber-400/15 bg-amber-500/5 p-4 transition hover:border-amber-400/35 hover:bg-amber-500/10">
          <ClipboardList className="h-5 w-5 text-amber-300" /><p className="mt-4 text-2xl font-black text-white">{pendingAssignments.length}</p><p className="text-xs text-slate-400">Bài tập cần xử lý · {quizCount} quiz</p>
        </Link>
        <Link to={`${basePath}/schedule`} className="rounded-2xl border border-violet-400/15 bg-violet-500/5 p-4 transition hover:border-violet-400/35 hover:bg-violet-500/10">
          <CalendarDays className="h-5 w-5 text-violet-300" /><p className="mt-4 text-2xl font-black text-white">{upcomingSessions.length}</p><p className="text-xs text-slate-400">Buổi Live sắp tới</p>
        </Link>
        <Link to={`${basePath}/results`} className="rounded-2xl border border-emerald-400/15 bg-emerald-500/5 p-4 transition hover:border-emerald-400/35 hover:bg-emerald-500/10">
          <Trophy className="h-5 w-5 text-emerald-300" /><p className="mt-4 text-2xl font-black text-white">{averageScore ?? "—"}</p><p className="text-xs text-slate-400">Điểm trung bình đã chấm</p>
        </Link>
      </section>

      <section className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-white">Môn học & lộ trình</h2><p className="mt-1 text-xs text-slate-400">Chọn một chương để tiếp tục học nội dung thuộc khóa này.</p></div><Link to={`${basePath}/learn`} className="text-xs font-bold text-rose-300 hover:text-rose-200">Mở phòng học →</Link></div>
          {sections.length === 0 ? <EmptyState icon={BookOpen} title="Khóa học đang hoàn thiện" description="Giảng viên chưa công bố chương bài học." /> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {sections.map((section, index) => (
                <Link key={section.id} to={`${basePath}/learn`} className="group rounded-2xl border border-white/10 bg-slate-900 p-4 transition hover:border-rose-400/35 hover:bg-slate-800">
                  <p className="text-[10px] font-black uppercase tracking-wider text-rose-300">Môn / chương {index + 1}</p>
                  <h3 className="mt-2 line-clamp-2 font-bold text-white group-hover:text-rose-200">{section.title}</h3>
                  <p className="mt-3 text-xs text-slate-400">{section.lesson_count} bài · {Math.max(0, Math.round(Number(section.duration_seconds || 0) / 60))} phút</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-3 lg:col-span-2">
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-4"><div className="flex items-center justify-between"><h2 className="font-black text-white">Lớp & lịch sắp tới</h2><Link to={`${basePath}/schedule`} className="text-xs font-bold text-rose-300">Xem lịch</Link></div>
            {upcomingSessions.length === 0 ? <p className="mt-4 text-sm text-slate-500">Chưa có buổi Live nào được xếp cho lớp của bạn.</p> : <div className="mt-4 space-y-3">{upcomingSessions.slice(0, 3).map((session) => <div key={session.id} className="rounded-xl bg-slate-950 p-3"><p className="text-sm font-bold text-white">{session.title}</p><p className="mt-1 text-xs text-slate-400">{formatDateTime(session.start_time)} · {session.class_title}</p></div>)}</div>}
            {classes.length > 0 && <p className="mt-4 text-[11px] text-slate-500">Bạn đang thuộc {classes.length} lớp của khóa học này.</p>}
          </div>
        </aside>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-5"><div className="flex items-center justify-between"><div><h2 className="font-black text-white">Bài tập gần đây</h2><p className="mt-1 text-xs text-slate-400">Chỉ hiển thị bài tập của khóa học này.</p></div><Link to={`${basePath}/assignments`} className="text-xs font-bold text-rose-300">Tất cả bài tập</Link></div>
          {assignments.length === 0 ? <p className="mt-5 text-sm text-slate-500">Chưa có bài tập hoặc quiz được giao.</p> : <div className="mt-4 space-y-2">{assignments.slice(0, 4).map((item) => { const destination = item.type === "quiz" ? `${basePath}/quizzes/${item.id}` : `${basePath}/assignments/${item.id}/submit`; return <Link key={`${item.type}-${item.id}`} to={destination} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-950 px-3 py-3 hover:border-rose-400/25"><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{item.title}</p><p className="mt-1 text-[11px] text-slate-500">{item.status === "graded" ? `Đã chấm: ${item.score}/${item.max_score}` : `Hạn: ${formatDateTime(item.due_date)}`}</p></div><PlayCircle className="h-4 w-4 shrink-0 text-rose-300" /></Link>; })}</div>}
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900 p-5"><div className="flex items-center justify-between"><div><h2 className="font-black text-white">Tài liệu khóa học</h2><p className="mt-1 text-xs text-slate-400">Tài liệu do giáo viên chia sẻ cho lớp/khóa của bạn.</p></div><Link to={`${basePath}/files`} className="text-xs font-bold text-rose-300">Xem tất cả</Link></div>
          {files.length === 0 ? <p className="mt-5 text-sm text-slate-500">Chưa có tài liệu được công bố.</p> : <div className="mt-4 space-y-2">{files.slice(0, 4).map((file) => <a key={file.id} href={file.downloadUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-950 px-3 py-3 hover:border-sky-400/25"><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{file.name}</p><p className="mt-1 text-[11px] text-slate-500">{file.uploadedBy} · {formatFileSize(file.sizeBytes)}</p></div><FileText className="h-4 w-4 shrink-0 text-sky-300" /></a>)}</div>}
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-400/15 bg-emerald-500/5 p-5"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /><div><h2 className="font-black text-white">Kết quả học tập</h2><p className="mt-1 text-sm text-slate-300">Đã hoàn thành {progress.completedLessons}/{progress.totalLessons} bài. {gradedAssignments.length > 0 ? `Bạn có ${gradedAssignments.length} bài đã được chấm.` : "Điểm và nhận xét sẽ xuất hiện sau khi giáo viên chấm bài."}</p></div></div></section>
    </div>
  );
}
