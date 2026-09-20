import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  GraduationCap,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { ErrorState } from "../../../components/common/StateView";
import { fetchMyEnrolledCourses } from "../../api/lmsClient";

const matchesSearch = (course, keyword) => {
  if (!keyword) return true;
  const searchable = [course.title, course.category, course.level, course.description]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return searchable.includes(keyword);
};

function CourseCard({ course }) {
  return (
    <Link
      to={`/lms/courses/${course.course_id}/classes`}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-lg shadow-slate-950/20 transition duration-200 hover:-translate-y-0.5 hover:border-rose-400/40 hover:bg-slate-800"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-300/50 to-transparent opacity-0 transition group-hover:opacity-100" />
      <div className="flex gap-4 p-5 sm:p-6">
        {course.thumbnail_url ? (
          <img src={course.thumbnail_url} alt="" className="h-[72px] w-[72px] shrink-0 rounded-2xl border border-white/10 object-cover" />
        ) : (
          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl border border-rose-400/20 bg-gradient-to-br from-rose-500/20 to-violet-500/10 text-rose-200">
            <BookOpen className="h-7 w-7" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {course.category && <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-200">{course.category}</span>}
            {course.level && <span className="rounded-full border border-sky-400/15 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold text-sky-200">{course.level}</span>}
          </div>
          <h2 className="mt-3 line-clamp-2 text-lg font-black leading-snug text-white transition group-hover:text-rose-100">{course.title}</h2>
          {course.description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-400">{course.description}</p>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-slate-950/35 px-5 py-3.5 sm:px-6">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Đã được cấp quyền</span>
        <span className="inline-flex items-center gap-1.5 text-sm font-black text-rose-300">Chọn lớp <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
      </div>
    </Link>
  );
}

export default function StudentCourseListPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchMyEnrolledCourses();
      setCourses(response?.success ? response.data || [] : []);
    } catch (requestError) {
      setCourses([]);
      setError(requestError.message || "Không thể tải các khóa học của bạn.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const keyword = search.trim().toLocaleLowerCase();
  const visibleCourses = useMemo(
    () => courses.filter((course) => matchesSearch(course, keyword)),
    [courses, keyword],
  );

  if (loading) {
    return <div className="flex min-h-[55vh] items-center justify-center"><div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-5 py-4 text-sm text-slate-300"><LoaderCircle className="h-5 w-5 animate-spin text-rose-400" /> Đang tải khóa học...</div></div>;
  }

  if (error) {
    return <div className="mx-auto max-w-xl px-4 py-12 sm:px-6"><ErrorState title="Chưa thể tải khóa học" message={error} onRetry={loadCourses} /></div>;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-12 pt-2 sm:px-6 sm:pt-5 lg:px-8">
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950/35 px-5 py-6 shadow-2xl shadow-slate-950/25 sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-rose-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-56 w-56 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-rose-200"><Sparkles className="h-3.5 w-3.5" /> Không gian học tập</div>
            <div className="flex gap-4">
              <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-rose-300/20 bg-gradient-to-br from-rose-500/30 to-violet-500/15 text-rose-100 shadow-lg shadow-rose-950/30 sm:flex"><GraduationCap className="h-7 w-7" /></div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Khóa học của tôi</h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">Chỉ các khóa học do hệ thống quản lý cấp quyền mới xuất hiện tại đây. Chọn khóa, sau đó chọn đúng lớp để bắt đầu học.</p>
              </div>
            </div>
          </div>
          <div className="w-full max-w-md lg:pb-0.5">
            <label htmlFor="student-course-search" className="mb-2 block text-xs font-bold text-slate-300">Tìm trong khóa học của bạn</label>
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-1.5 shadow-inner shadow-black/20 focus-within:border-rose-400/45 focus-within:ring-4 focus-within:ring-rose-500/10">
              <Search className="ml-2 h-4 w-4 shrink-0 text-slate-500" />
              <input id="student-course-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên khóa học, HSK, CSCA..." className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-white outline-none placeholder:text-slate-600" />
              {search && <button type="button" onClick={() => setSearch("")} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-400 transition hover:bg-white/10 hover:text-white">Xóa</button>}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6">
        {courses.length === 0 ? (
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-900/55 p-5 shadow-xl shadow-slate-950/15 sm:p-8">
            <div className="pointer-events-none absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-sky-500/[0.06] to-transparent" />
            <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
              <div className="max-w-xl">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-400/20 bg-sky-500/10 text-sky-200"><ShieldCheck className="h-7 w-7" /></div>
                <h2 className="mt-5 text-xl font-black text-white">Bạn chưa có khóa học nào</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">Khóa học sẽ tự xuất hiện sau khi bộ phận quản lý xác nhận quyền học và xếp khóa cho bạn. Bạn không cần đăng ký lại trên LMS.</p>
                <button type="button" onClick={loadCourses} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-sky-300/35 hover:bg-sky-500/10 hover:text-white"><RefreshCw className="h-4 w-4" /> Tải lại danh sách</button>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-200">Trạng thái quyền học</p>
                <div className="mt-4 space-y-3 text-sm"><div className="flex items-start gap-3"><span className="mt-0.5 h-2 w-2 rounded-full bg-slate-600" /><span className="text-slate-300">Đang chờ cấp khóa học</span></div><div className="flex items-start gap-3"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /><span className="text-xs leading-relaxed text-slate-500">Cần hỗ trợ? Liên hệ bộ phận quản lý để kiểm tra tình trạng học viên.</span></div></div>
              </div>
            </div>
          </div>
        ) : visibleCourses.length === 0 ? (
          <div className="rounded-[28px] border border-white/10 bg-slate-900/55 px-5 py-12 text-center sm:px-8"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-slate-800 text-slate-400"><Search className="h-6 w-6" /></div><h2 className="mt-4 text-lg font-black text-white">Không tìm thấy khóa học phù hợp</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Thử tìm bằng tên khóa học, HSK hoặc CSCA.</p><button type="button" onClick={() => setSearch("")} className="mt-5 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-500">Xóa từ khóa tìm kiếm</button></div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-4"><div><h2 className="text-base font-black text-white">Khóa học đã được cấp</h2><p className="mt-1 text-xs text-slate-500">Chọn một khóa để xem các lớp học của bạn.</p></div><span className="hidden rounded-full border border-emerald-400/15 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-200 sm:inline-flex">{visibleCourses.length} khóa học</span></div>
            <div className="grid gap-4 md:grid-cols-2">{visibleCourses.map((course) => <CourseCard key={course.course_id} course={course} />)}</div>
          </>
        )}
      </section>
    </main>
  );
}
