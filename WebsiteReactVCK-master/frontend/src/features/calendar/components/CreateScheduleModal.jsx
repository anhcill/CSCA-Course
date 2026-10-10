/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Calendar, X } from "lucide-react";
import { createLiveClassSchedule, createLiveSession, fetchClassChapters, fetchLiveClasses } from "../../api/lmsClient";
import { useAuthContext } from "../../../context/AuthContext";

const DAYS_OF_WEEK = [
  { value: 1, label: "Thứ Hai" },
  { value: 2, label: "Thứ Ba" },
  { value: 3, label: "Thứ Tư" },
  { value: 4, label: "Thứ Năm" },
  { value: 5, label: "Thứ Sáu" },
  { value: 6, label: "Thứ Bảy" },
  { value: 7, label: "Chủ Nhật" },
];

export default function CreateScheduleModal({ classId, onClose, onSuccess, canManageFixedSchedule = false }) {
  const { authUser } = useAuthContext();
  const [tab, setTab] = useState(canManageFixedSchedule ? "series" : "single");
  const [submitting, setSubmitting] = useState(false);
  const [classOptions, setClassOptions] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(classId ? String(classId) : "");
  const [classesLoading, setClassesLoading] = useState(!classId);
  const [classesError, setClassesError] = useState("");
  const [chapters, setChapters] = useState([]);
  const [chaptersLoading, setChaptersLoading] = useState(Boolean(classId));
  const [chaptersError, setChaptersError] = useState("");
  const [chaptersReloadKey, setChaptersReloadKey] = useState(0);
  const [teachers, setTeachers] = useState([]);
  const [chapterMode, setChapterMode] = useState("existing");
  const [chapterId, setChapterId] = useState("");
  const [newChapter, setNewChapter] = useState({ title: "", description: "", objectives: "", teacherId: "" });

  const effectiveClassId = classId || selectedClassId;

  useEffect(() => {
    if (classId) return;
    let cancelled = false;
    setClassesLoading(true);
    fetchLiveClasses().then((response) => {
      if (cancelled) return;
      const options = (Array.isArray(response?.data) ? response.data : [])
        .filter((item) => item.course_id && item.status === "active");
      setClassOptions(options);
      if (options.length === 1) setChaptersLoading(true);
      setSelectedClassId(options.length === 1 ? String(options[0].id) : "");
      setClassesError("");
    }).catch((error) => {
      if (!cancelled) setClassesError(error?.message || "Không tải được danh sách lớp.");
    }).finally(() => { if (!cancelled) setClassesLoading(false); });
    return () => { cancelled = true; };
  }, [classId]);

  useEffect(() => {
    let cancelled = false;
    setChapters([]);
    setChapterId("");
    setChapterMode("existing");
    setTeachers([]);
    setChaptersError("");
    if (!effectiveClassId) {
      setChaptersLoading(false);
      return () => { cancelled = true; };
    }
    setChaptersLoading(true);
    fetchClassChapters(effectiveClassId).then((response) => {
      if (cancelled) return;
      const items = (Array.isArray(response?.data) ? response.data : [])
        .filter((chapter) => canManageFixedSchedule || String(chapter.assigned_teacher_id) === String(authUser?.id));
      setChapters(items);
      setTeachers(Array.isArray(response?.teachers) ? response.teachers : []);
      if (items.length === 0) setChapterMode("new");
      else setChapterId(String(items[0].id));
    }).catch((error) => {
      if (!cancelled) setChaptersError(error?.message || "Không tải được các chương của lớp.");
    }).finally(() => { if (!cancelled) setChaptersLoading(false); });
    return () => { cancelled = true; };
  }, [effectiveClassId, canManageFixedSchedule, authUser?.id, chaptersReloadKey]);

  // Form tạo lịch cố định (Series)
  const [seriesForm, setSeriesForm] = useState({
    title: "",
    dayOfWeek: 1,
    startTime: "19:00",
    endTime: "21:00",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date(Date.now() + 180 * 86400000).toISOString().split("T")[0],
  });

  // Form tạo buổi học riêng (Single session)
  const [sessionForm, setSessionForm] = useState({
    title: "",
    date: new Date().toISOString().split("T")[0],
    startTime: "19:00",
    endTime: "21:00",
    meetUrl: "",
  });

  const handleSeriesSubmit = async (e) => {
    e.preventDefault();
    if (!effectiveClassId) return toast.error("Vui lòng chọn lớp học để tạo lịch.");
    setSubmitting(true);
    try {
      const res = await createLiveClassSchedule({
        classId: effectiveClassId,
        dayOfWeek: Number(seriesForm.dayOfWeek),
        startTime: seriesForm.startTime,
        endTime: seriesForm.endTime,
        title: seriesForm.title.trim() || undefined,
        startDate: seriesForm.startDate,
        endDate: seriesForm.endDate,
      });
      if (!res?.success) throw new Error(res?.message || "Không thể tạo lịch cố định");
      toast.success("Tạo lịch cố định thành công!");
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || "Lỗi khi tạo lịch học cố định.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSessionSubmit = async (e) => {
    e.preventDefault();
    if (!effectiveClassId) return toast.error("Vui lòng chọn lớp học.");
    if (chaptersLoading || chaptersError) return toast.error("Cần tải được các chương của lớp trước khi tạo buổi học.");
    if (!sessionForm.title.trim()) return toast.error("Vui lòng nhập tên buổi học.");
    if (chapterMode === "existing" && !chapterId) return toast.error("Chọn chương cho buổi học.");
    if (chapterMode === "new" && !newChapter.title.trim()) return toast.error("Nhập tên chương mới.");
    setSubmitting(true);
    try {
      const startDateTime = new Date(`${sessionForm.date}T${sessionForm.startTime}:00`).toISOString();
      const endDateTime = new Date(`${sessionForm.date}T${sessionForm.endTime}:00`).toISOString();

      const res = await createLiveSession({
        liveClassId: effectiveClassId,
        title: sessionForm.title.trim(),
        startTime: startDateTime,
        endTime: endDateTime,
        meetUrl: sessionForm.meetUrl.trim() || undefined,
        status: "scheduled",
        ...(chapterMode === "existing"
          ? { chapterId: Number(chapterId) }
          : { newChapter: {
            title: newChapter.title.trim(),
            description: newChapter.description.trim(),
            objectives: newChapter.objectives.trim(),
            ...(canManageFixedSchedule ? { teacherId: newChapter.teacherId ? Number(newChapter.teacherId) : null } : {}),
          } }),
      });
      if (!res?.success) throw new Error(res?.message || "Không thể tạo buổi học");
      toast.success("Đã bổ sung buổi học thành công!");
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || "Lỗi khi tạo buổi học.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-xs sm:p-6">
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900 sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-4 dark:border-slate-800 dark:bg-slate-800/30 sm:px-6">
          <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600 dark:text-sky-400" />
            {canManageFixedSchedule ? "Tạo Lịch & Buổi Học" : "Bổ Sung Buổi Học"}
          </h3>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex shrink-0 border-b border-slate-200 bg-slate-50/50 px-4 pt-3 dark:border-slate-800 dark:bg-slate-800/20 sm:px-6">
          {canManageFixedSchedule && (
            <button
              type="button"
              onClick={() => setTab("series")}
              className={`pb-3 text-xs font-bold border-b-2 px-3 transition ${
                tab === "series" ? "border-blue-600 text-blue-600 dark:text-sky-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white"
              }`}
            >
              Lịch cố định hàng tuần
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab("single")}
            className={`pb-3 text-xs font-bold border-b-2 px-3 transition ${
              tab === "single" ? "border-blue-600 text-blue-600 dark:text-sky-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white"
            }`}
          >
            Buổi bổ sung / Buổi bù
          </button>
        </div>

        {/* Form content */}
        <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
          {!classId && <div className="mb-4">
            <label htmlFor="schedule-class" className="block text-xs font-bold text-slate-700 dark:text-slate-300">Lớp học</label>
            <select id="schedule-class" value={selectedClassId} disabled={classesLoading} onChange={(e) => { setChaptersLoading(Boolean(e.target.value)); setSelectedClassId(e.target.value); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <option value="">{classesLoading ? "Đang tải lớp học..." : "Chọn lớp học"}</option>
              {classOptions.map((item) => <option key={item.id} value={item.id}>{item.title}{item.course_title ? ` · ${item.course_title}` : ""}</option>)}
            </select>
            {classesError && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{classesError}</p>}
            {!classesLoading && !classesError && classOptions.length === 0 && <p className="mt-2 text-xs text-slate-500">Bạn chưa có lớp phù hợp để bổ sung buổi học.</p>}
          </div>}
          {effectiveClassId && chaptersError && <div role="alert" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            <span>{chaptersError}</span>
            <button type="button" onClick={() => setChaptersReloadKey((key) => key + 1)} className="font-bold underline">Tải lại chương</button>
          </div>}
          {canManageFixedSchedule && tab === "series" ? (
            <form onSubmit={handleSeriesSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Tên lịch (tùy chọn)</label>
                <input
                  type="text"
                  value={seriesForm.title}
                  onChange={(e) => setSeriesForm({ ...seriesForm, title: e.target.value })}
                  placeholder="Ví dụ: Lịch học tối thứ Hai"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Thứ trong tuần</label>
                <select
                  value={seriesForm.dayOfWeek}
                  onChange={(e) => setSeriesForm({ ...seriesForm, dayOfWeek: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Giờ bắt đầu</label>
                  <input
                    type="time"
                    value={seriesForm.startTime}
                    onChange={(e) => setSeriesForm({ ...seriesForm, startTime: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Giờ kết thúc</label>
                  <input
                    type="time"
                    value={seriesForm.endTime}
                    onChange={(e) => setSeriesForm({ ...seriesForm, endTime: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Áp dụng từ ngày</label>
                  <input
                    type="date"
                    required
                    value={seriesForm.startDate}
                    onChange={(e) => setSeriesForm({ ...seriesForm, startDate: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Áp dụng đến ngày</label>
                  <input
                    type="date"
                    required
                    min={seriesForm.startDate}
                    value={seriesForm.endDate}
                    onChange={(e) => setSeriesForm({ ...seriesForm, endDate: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !effectiveClassId}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Đang tạo..." : "Lưu lịch cố định"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSessionSubmit} className="space-y-4">
              <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-semibold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                Buổi bổ sung thuộc lớp của khóa học này, không thay đổi lịch cố định.
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Tên buổi học</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Buổi 05 - Chữa đề thi thử"
                  value={sessionForm.title}
                  onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-900/60 dark:bg-blue-950/20">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Chương học của buổi này</label>
                <select value={chapterMode} disabled={!effectiveClassId || chaptersLoading || Boolean(chaptersError)} onChange={(e) => setChapterMode(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                  {chapters.length > 0 && <option value="existing">Chọn chương đã có</option>}
                  <option value="new">Thêm chương mới cùng buổi học</option>
                </select>
                {chaptersLoading ? <p className="mt-2 text-xs text-slate-500">Đang tải các chương của lớp...</p> : chapterMode === "existing" && chapters.length > 0 ? (
                  <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                    {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
                  </select>
                ) : !effectiveClassId || chaptersError ? <p className="mt-2 text-xs text-slate-500">Chọn lớp và tải chương trước khi tiếp tục.</p> : (
                  <div className="mt-2 space-y-2">
                    <input required maxLength={255} value={newChapter.title} onChange={(e) => setNewChapter({ ...newChapter, title: e.target.value })} placeholder="Tên chương" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800" />
                    <textarea maxLength={5000} rows={2} value={newChapter.objectives} onChange={(e) => setNewChapter({ ...newChapter, objectives: e.target.value })} placeholder="Mục tiêu học tập (tùy chọn)" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800" />
                    {canManageFixedSchedule && <select value={newChapter.teacherId} onChange={(e) => setNewChapter({ ...newChapter, teacherId: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                      <option value="">Chưa phân công giáo viên</option>
                      {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name || teacher.email}</option>)}
                    </select>}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Ngày diễn ra</label>
                <input
                  type="date"
                  value={sessionForm.date}
                  onChange={(e) => setSessionForm({ ...sessionForm, date: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Giờ bắt đầu</label>
                  <input
                    type="time"
                    value={sessionForm.startTime}
                    onChange={(e) => setSessionForm({ ...sessionForm, startTime: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Giờ kết thúc</label>
                  <input
                    type="time"
                    value={sessionForm.endTime}
                    onChange={(e) => setSessionForm({ ...sessionForm, endTime: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Link Meet / Zoom (tùy chọn)</label>
                <input
                  type="url"
                  placeholder="https://meet.google.com/..."
                  value={sessionForm.meetUrl}
                  onChange={(e) => setSessionForm({ ...sessionForm, meetUrl: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !effectiveClassId || chaptersLoading || Boolean(chaptersError)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Đang tạo..." : "Tạo buổi học"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
