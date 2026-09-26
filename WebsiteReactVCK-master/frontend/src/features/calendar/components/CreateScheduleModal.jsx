import { useState } from "react";
import toast from "react-hot-toast";
import { Calendar, Clock, Plus, Video, X } from "lucide-react";
import { createLiveClassSchedule, createLiveSession } from "../../api/lmsClient";

const DAYS_OF_WEEK = [
  { value: 1, label: "Thứ Hai" },
  { value: 2, label: "Thứ Ba" },
  { value: 3, label: "Thứ Tư" },
  { value: 4, label: "Thứ Năm" },
  { value: 5, label: "Thứ Sáu" },
  { value: 6, label: "Thứ Bảy" },
  { value: 0, label: "Chủ Nhật" },
];

export default function CreateScheduleModal({ classId, onClose, onSuccess }) {
  const [tab, setTab] = useState("series"); // "series" hoặc "single"
  const [submitting, setSubmitting] = useState(false);

  // Form tạo lịch cố định (Series)
  const [seriesForm, setSeriesForm] = useState({
    dayOfWeek: 1,
    startTime: "19:00",
    endTime: "21:00",
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
    if (!classId) return toast.error("Vui lòng chọn lớp học để tạo lịch.");
    setSubmitting(true);
    try {
      const res = await createLiveClassSchedule({
        classId,
        dayOfWeek: Number(seriesForm.dayOfWeek),
        startTime: seriesForm.startTime,
        endTime: seriesForm.endTime,
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
    if (!classId) return toast.error("Vui lòng chọn lớp học.");
    if (!sessionForm.title.trim()) return toast.error("Vui lòng nhập tên buổi học.");
    setSubmitting(true);
    try {
      const startDateTime = new Date(`${sessionForm.date}T${sessionForm.startTime}:00`).toISOString();
      const endDateTime = new Date(`${sessionForm.date}T${sessionForm.endTime}:00`).toISOString();

      const res = await createLiveSession({
        liveClassId: classId,
        title: sessionForm.title.trim(),
        startTime: startDateTime,
        endTime: endDateTime,
        meetUrl: sessionForm.meetUrl.trim() || undefined,
        status: "scheduled",
      });
      if (!res?.success) throw new Error(res?.message || "Không thể tạo buổi học");
      toast.success("Tạo buổi học thành công!");
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || "Lỗi khi tạo buổi học.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden transition-all">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-800/30">
          <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600 dark:text-sky-400" />
            Tạo Lịch & Buổi Học
          </h3>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 px-6 pt-3">
          <button
            type="button"
            onClick={() => setTab("series")}
            className={`pb-3 text-xs font-bold border-b-2 px-3 transition ${
              tab === "series" ? "border-blue-600 text-blue-600 dark:text-sky-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white"
            }`}
          >
            Lịch cố định hàng tuần (Series)
          </button>
          <button
            type="button"
            onClick={() => setTab("single")}
            className={`pb-3 text-xs font-bold border-b-2 px-3 transition ${
              tab === "single" ? "border-blue-600 text-blue-600 dark:text-sky-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white"
            }`}
          >
            Buổi học riêng / Buổi bù
          </button>
        </div>

        {/* Form content */}
        <div className="p-6">
          {tab === "series" ? (
            <form onSubmit={handleSeriesSubmit} className="space-y-4">
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

              <div className="grid grid-cols-2 gap-3">
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

              <button
                type="submit"
                disabled={submitting}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Đang tạo..." : "Lưu lịch cố định"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSessionSubmit} className="space-y-4">
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

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Ngày diễn ra</label>
                <input
                  type="date"
                  value={sessionForm.date}
                  onChange={(e) => setSessionForm({ ...sessionForm, date: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                disabled={submitting}
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
