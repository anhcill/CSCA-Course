/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link2, ShieldCheck, Video, X } from "lucide-react";
import { updateLiveSessionMeeting } from "../../../api/lmsClient";

const getProviderName = (url) => {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname === "meet.google.com") return "Google Meet";
    if (hostname === "zoom.us" || hostname.endsWith(".zoom.us")) return "Zoom";
  } catch {
    // The server returns the authoritative validation message on submit.
  }
  return null;
};

export default function MeetingLinkModal({ session, onClose, onSaved }) {
  const [meetUrl, setMeetUrl] = useState("");
  const [passcode, setPasscode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMeetUrl("");
    setPasscode("");
  }, [session?.id]);

  const provider = useMemo(() => getProviderName(meetUrl.trim()), [meetUrl]);
  if (!session) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalizedUrl = meetUrl.trim();
    if (!normalizedUrl) {
      toast.error("Dán link Zoom hoặc Google Meet để tiếp tục.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await updateLiveSessionMeeting({
        sessionId: session.id,
        meetUrl: normalizedUrl,
        ...(passcode.trim() ? { passcode: passcode.trim() } : {}),
      });
      if (!result?.success) throw new Error(result?.message || "Không thể cập nhật link phòng học");
      toast.success(`Đã cập nhật phòng ${result.data?.provider || provider || "trực tuyến"}.`);
      await onSaved?.();
    } catch (error) {
      toast.error(error.message || "Không thể cập nhật link phòng học.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="meeting-link-title">
      <form onSubmit={handleSubmit} className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/35">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-black text-blue-700 dark:bg-blue-950/70 dark:text-blue-300">
              <Video className="h-3.5 w-3.5" /> Phòng học trực tuyến
            </span>
            <h2 id="meeting-link-title" className="mt-2 text-lg font-black text-slate-900 dark:text-white">Gán Zoom hoặc Google Meet</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{session.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            <div className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Học viên không thấy link trong lịch. Khi bấm vào lớp, LMS kiểm tra quyền và thời gian học rồi mới mở thẳng phòng.</p>
            </div>
          </div>

          <div>
            <label htmlFor="meeting-url" className="block text-xs font-bold text-slate-700 dark:text-slate-300">Link phòng học</label>
            <div className="relative mt-1.5">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="meeting-url"
                type="url"
                required
                autoFocus
                value={meetUrl}
                onChange={(event) => setMeetUrl(event.target.value)}
                placeholder="https://meet.google.com/... hoặc https://...zoom.us/..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-xs text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              {provider ? `Đã nhận diện: ${provider}.` : "Chỉ chấp nhận link HTTPS của Google Meet hoặc Zoom."}
            </p>
          </div>

          <div>
            <label htmlFor="meeting-passcode" className="block text-xs font-bold text-slate-700 dark:text-slate-300">Mật mã phòng <span className="font-medium text-slate-400">(không bắt buộc)</span></label>
            <input
              id="meeting-passcode"
              type="text"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              placeholder={session.has_meeting_link ? "Để trống để giữ nguyên mật mã hiện tại" : "Nhập nếu phòng cần mật mã riêng"}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/35">
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Hủy</button>
          <button type="submit" disabled={submitting} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            <Link2 className="h-4 w-4" /> {submitting ? "Đang lưu..." : "Lưu link phòng"}
          </button>
        </div>
      </form>
    </div>
  );
}
