/* eslint-disable react/prop-types */
import { useState } from "react";
import toast from "react-hot-toast";
import { CalendarClock, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { deleteLiveClassSchedule, updateLiveClassSchedule } from "../../../api/lmsClient";

const WEEKDAYS = {
  1: "Thứ Hai", 2: "Thứ Ba", 3: "Thứ Tư", 4: "Thứ Năm",
  5: "Thứ Sáu", 6: "Thứ Bảy", 7: "Chủ Nhật",
};

const timeValue = (value) => String(value || "").slice(0, 5);
const dateValue = (value) => String(value || "").slice(0, 10);

export default function ClassScheduleManager({ classId, schedules = [], onRefresh, onCreate, canManageFixedSchedule = false }) {
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const result = await updateLiveClassSchedule({
        classId,
        scheduleId: editing.id,
        title: editing.title,
        dayOfWeek: Number(editing.day_of_week),
        startTime: editing.start_time,
        endTime: editing.end_time,
        timezone: editing.timezone || "Asia/Ho_Chi_Minh",
        startDate: editing.start_date,
        endDate: editing.end_date,
        version: editing.version,
        changeReason: editing.changeReason,
      });
      if (!result?.success) throw new Error(result?.message || "Không thể cập nhật lịch cố định");
      toast.success("Đã cập nhật lịch cố định và các buổi học tương lai.");
      setEditing(null);
      onRefresh?.();
    } catch (error) {
      toast.error(error.message || "Không thể cập nhật lịch cố định.");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (schedule) => {
    const changeReason = window.prompt("Lý do ngừng lịch cố định này?", "Ngừng lịch học định kỳ");
    if (changeReason === null) return;
    try {
      const result = await deleteLiveClassSchedule({ classId, scheduleId: schedule.id, changeReason });
      if (!result?.success) throw new Error(result?.message || "Không thể ngừng lịch cố định");
      toast.success("Đã ngừng lịch và hủy các buổi học tương lai chưa điểm danh.");
      onRefresh?.();
    } catch (error) {
      toast.error(error.message || "Không thể ngừng lịch cố định.");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="flex items-center gap-2 text-base font-black text-slate-900 dark:text-white"><CalendarClock className="h-4 w-4 text-blue-600 dark:text-sky-400" /> Lịch cố định của lớp</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Đây là nguồn tạo các buổi học; sửa lịch sẽ áp dụng cho các buổi tương lai.</p>
        </div>
        {canManageFixedSchedule ? (
          <button type="button" onClick={onCreate} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Thêm lịch cố định
          </button>
        ) : (
          <span className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-[11px] font-bold text-slate-500 dark:text-slate-300">Chỉ quản trị viên được chỉnh lịch cố định</span>
        )}
      </div>

      {schedules.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-4 py-5 text-xs text-slate-500 dark:text-slate-400">
          Chưa có lịch cố định. {canManageFixedSchedule ? "Bạn có thể thiết lập lịch tuần cho khóa học này." : "Bạn vẫn có thể tạo buổi bù riêng; quản trị viên sẽ thiết lập lịch tuần."}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {schedules.map((schedule) => (
            <article key={schedule.id} className="rounded-xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900 dark:text-white">{schedule.title || "Lịch học định kỳ"}</p>
                  <p className="mt-1 text-xs font-semibold text-blue-700 dark:text-blue-300">{WEEKDAYS[schedule.day_of_week] || "Hàng tuần"} · {timeValue(schedule.start_time)} – {timeValue(schedule.end_time)}</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{dateValue(schedule.start_date)} đến {dateValue(schedule.end_date)} · {schedule.timezone || "Asia/Ho_Chi_Minh"}</p>
                </div>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">Đang áp dụng</span>
              </div>
              {canManageFixedSchedule ? (
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setEditing({ ...schedule, start_time: timeValue(schedule.start_time), end_time: timeValue(schedule.end_time), start_date: dateValue(schedule.start_date), end_date: dateValue(schedule.end_date), changeReason: "" })} className="inline-flex items-center gap-1 rounded-lg bg-white dark:bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700">
                    <Pencil className="h-3.5 w-3.5" /> Sửa lịch
                  </button>
                  <button type="button" onClick={() => archive(schedule)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                    <Trash2 className="h-3.5 w-3.5" /> Ngừng
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400">Lịch này do quản trị viên quản lý.</p>
              )}
            </article>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <form onSubmit={save} className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
              <div><h4 className="text-base font-black text-slate-900 dark:text-white">Sửa lịch cố định</h4><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Các buổi tương lai sẽ được cập nhật theo lịch mới.</p></div>
              <button type="button" onClick={() => setEditing(null)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Tên lịch<input required value={editing.title || ""} onChange={(event) => setEditing((current) => ({ ...current, title: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" /></label>
              <div className="grid grid-cols-3 gap-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Thứ<select value={editing.day_of_week} onChange={(event) => setEditing((current) => ({ ...current, day_of_week: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white">{Object.entries(WEEKDAYS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Bắt đầu<input required type="time" value={editing.start_time} onChange={(event) => setEditing((current) => ({ ...current, start_time: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" /></label>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Kết thúc<input required type="time" value={editing.end_time} onChange={(event) => setEditing((current) => ({ ...current, end_time: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Từ ngày<input required type="date" value={editing.start_date} onChange={(event) => setEditing((current) => ({ ...current, start_date: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" /></label>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Đến ngày<input required type="date" value={editing.end_date} onChange={(event) => setEditing((current) => ({ ...current, end_date: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" /></label>
              </div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Lý do thay đổi<textarea required value={editing.changeReason} onChange={(event) => setEditing((current) => ({ ...current, changeReason: event.target.value }))} className="mt-1.5 min-h-20 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" placeholder="Ví dụ: đổi giờ để phù hợp lịch học viên" /></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-5 py-4"><button type="button" onClick={() => setEditing(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300">Hủy</button><button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"><Save className="h-3.5 w-3.5" /> {saving ? "Đang lưu..." : "Lưu thay đổi"}</button></div>
          </form>
        </div>
      )}
    </section>
  );
}
