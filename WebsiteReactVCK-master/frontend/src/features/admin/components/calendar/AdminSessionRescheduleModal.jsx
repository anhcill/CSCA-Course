/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";

const inVietnam = (instant) => {
  if (!instant) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const value = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
};

export default function AdminSessionRescheduleModal({ session, onClose, onSave }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStart(inVietnam(session?.start_time));
    setEnd(inVietnam(session?.end_time));
    setReason("");
    setError("");
  }, [session]);

  if (!session) return null;

  const submit = async (event) => {
    event.preventDefault();
    if (!start || !end || new Date(`${end}:00+07:00`) <= new Date(`${start}:00+07:00`)) {
      setError("Giờ kết thúc phải sau giờ bắt đầu.");
      return;
    }
    if (!reason.trim()) {
      setError("Vui lòng nhập lý do đổi buổi.");
      return;
    }
    if (start === inVietnam(session.start_time) && end === inVietnam(session.end_time)) {
      setError("Ngày và giờ chưa thay đổi.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        startTime: new Date(`${start}:00+07:00`).toISOString(),
        endTime: new Date(`${end}:00+07:00`).toISOString(),
        changeReason: reason.trim(),
      });
    } catch (err) {
      setError(err?.message || "Không thể đổi lịch buổi học.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Đổi lịch một buổi học" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Đổi lịch một buổi học</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{session.title} · {session.live_class_title}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Các buổi khác và lịch cố định hằng tuần không thay đổi. Giờ Việt Nam (UTC+7).</p>
        </div>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Bắt đầu
          <input type="datetime-local" required value={start} onChange={(event) => setStart(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
        </label>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Kết thúc
          <input type="datetime-local" required value={end} onChange={(event) => setEnd(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
        </label>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Lý do đổi buổi
          <textarea required maxLength={2000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ví dụ: Giáo viên bận đột xuất" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
        </label>
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700">Đóng</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Đang lưu..." : "Lưu đổi lịch"}</button>
        </div>
      </form>
    </div>
  );
}
